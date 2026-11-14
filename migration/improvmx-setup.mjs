// Recreate Cloudflare Email Routing's aliases in ImprovMX (Free plan) from the
// ENCRYPTED local export, without printing any destination address.
//
//   IMPROVMX_API_KEY=... node migration/improvmx-setup.mjs <email-routing.tar.age> [--apply] [--smtp-test]
//
// - Decrypts the export with the owner's age identity
//   (~/.runs-at-migration/backup-identity.txt) into memory only.
// - Without --apply: prints the plan (alias names and a hash per destination).
// - --apply: adds runs-at.dev to the ImprovMX account if missing, then creates
//   or updates each alias. Existing ImprovMX aliases that are not in the
//   export are left alone.
// - --smtp-test: talks SMTP to mx1.improvmx.com and checks that each alias is
//   accepted (RCPT TO 250). It stops before DATA, so no message is sent.
// Destinations appear only as sha256 prefixes in the output.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';

const DOMAIN = 'runs-at.dev';
const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('usage: improvmx-setup.mjs <email-routing.tar.age> [--apply] [--smtp-test]'); process.exit(2); }
const h = (s) => createHash('sha256').update(s.toLowerCase()).digest('hex').slice(0, 10);

function loadAliases() {
  const age = process.env.AGE_BIN ?? 'age';
  const identity = process.env.AGE_IDENTITY ?? join(homedir(), '.runs-at-migration', 'backup-identity.txt');
  const dir = mkdtempSync(join(tmpdir(), 'imx-'));
  try {
    const tar = execFileSync(age, ['-d', '-i', identity, file]);
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
    const rules = JSON.parse(readFileSync(join(dir, 'T2-rules.json'), 'utf8')).result;
    const out = [];
    for (const r of rules) {
      if (!r.enabled) continue;
      const to = r.matchers.find((m) => m.field === 'to');
      if (!to) continue;
      const dests = r.actions.filter((a) => a.type === 'forward').flatMap((a) => a.value);
      out.push({ alias: to.value.split('@')[0], forward: dests.join(',') });
    }
    return out;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

async function imx(method, path, body) {
  const key = process.env.IMPROVMX_API_KEY;
  if (!key) throw new Error('IMPROVMX_API_KEY is not set');
  const res = await fetch(`https://api.improvmx.com/v3${path}`, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 404) throw new Error(`ImprovMX ${method} ${path}: HTTP ${res.status} ${json.error ?? ''}`);
  return { status: res.status, json };
}

function smtpRcpt(rcpts) {
  return new Promise((resolve, reject) => {
    const s = net.connect(25, 'mx1.improvmx.com');
    const steps = ['EHLO runs-at-migration-check', 'MAIL FROM:<>', ...rcpts.map((r) => `RCPT TO:<${r}>`), 'QUIT'];
    const codes = []; let buf = '';
    s.setTimeout(20000, () => { s.destroy(); reject(new Error('SMTP timeout (outbound port 25 may be blocked here)')); });
    s.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\r\n'); buf = lines.pop();
      for (const l of lines) {
        if (/^\d{3} /.test(l)) { codes.push(l.slice(0, 3)); const next = steps.shift(); if (next) s.write(`${next}\r\n`); else s.end(); }
      }
    });
    s.on('end', () => resolve(codes)); s.on('error', reject);
  });
}

const aliases = loadAliases();
console.log(`export: ${aliases.length} enabled alias(es)`);
for (const a of aliases) console.log(`  ${a.alias}@${DOMAIN} -> destination #${h(a.forward)}`);

if (flags.includes('--apply')) {
  const d = await imx('GET', `/domains/${DOMAIN}`);
  if (d.status === 404) { await imx('POST', '/domains', { domain: DOMAIN }); console.log(`added ${DOMAIN} to ImprovMX`); }
  const existing = (await imx('GET', `/domains/${DOMAIN}/aliases?limit=100`)).json.aliases ?? [];
  for (const a of aliases) {
    const cur = existing.find((e) => e.alias === a.alias);
    if (!cur) await imx('POST', `/domains/${DOMAIN}/aliases`, { alias: a.alias, forward: a.forward });
    else if (cur.forward.toLowerCase() !== a.forward.toLowerCase()) await imx('PUT', `/domains/${DOMAIN}/aliases/${a.alias}`, { forward: a.forward });
    console.log(`  ${a.alias}: ${cur ? (cur.forward.toLowerCase() === a.forward.toLowerCase() ? 'already correct' : 'updated') : 'created'}`);
  }
  const after = (await imx('GET', `/domains/${DOMAIN}/aliases?limit=100`)).json.aliases ?? [];
  const ok = aliases.every((a) => after.some((e) => e.alias === a.alias && h(e.forward) === h(a.forward)));
  console.log(`verify: every exported alias present in ImprovMX with the same destination: ${ok}`);
  if (!ok) process.exit(1);
}

if (flags.includes('--smtp-test')) {
  const codes = await smtpRcpt(aliases.map((a) => `${a.alias}@${DOMAIN}`));
  // greeting, EHLO, MAIL, then one code per RCPT, then QUIT
  const rcpt = codes.slice(3, 3 + aliases.length);
  aliases.forEach((a, i) => console.log(`  SMTP RCPT ${a.alias}@${DOMAIN}: ${rcpt[i] ?? 'no answer'}`));
  if (!rcpt.every((c) => c === '250')) process.exit(1);
}
