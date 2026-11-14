// Ask each authoritative server directly for every record the registry
// declares (registry records + the zone-level `_vercel` mirror), over UDP
// (Node's resolver) and over TCP (dig +tcp). Prints counts only; lists the
// failing records if any. Also reports, as its own line, the records that
// Cloudflare does not serve today (migration/missing-from-cloudflare.json).
//
//   node infra/test/check-servers.mjs 127.0.0.11:5300 127.0.0.12:5301
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { loadClaims, registryRecords, zoneVerificationRecords, canonical, DOMAIN } from '../../scripts/export-zone.mjs';
import { serverResolver } from '../../lib/dns/pipeline.js';

const servers = process.argv.slice(2);
if (!servers.length) {
  console.error('usage: check-servers.mjs <ip:port> [ip:port...]');
  process.exit(2);
}
const claims = await loadClaims('domains');
const declared = [...registryRecords(claims), ...zoneVerificationRecords(claims)];
const missingList = existsSync('migration/missing-from-cloudflare.json')
  ? new Set(JSON.parse(readFileSync('migration/missing-from-cloudflare.json', 'utf8')).records.map((r) => r.canonical))
  : new Set();

const fq = (name) => (name ? `${name}.${DOMAIN}` : DOMAIN);
const dot = (h) => `${h.replace(/\.$/, '')}.`.toLowerCase();
const quote = (t) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
// The answer one record must contain, in the presentation form both
// serverResolver and dig +short produce.
const want = (r) => r.type === 'CNAME' ? dot(r.value)
  : r.type === 'MX' ? `${r.priority} ${dot(r.value)}`
  : r.type === 'TXT' ? quote(r.value) : r.value;

function digTcp(server, name, type) {
  const [ip, port] = server.split(':');
  const out = execFileSync('dig', [`@${ip}`, '-p', port || '53', '+tcp', '+short', '+time=3', '+tries=2', name, type], { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
    // dig splits long TXT into "a" "b"; join chunks like the resolver does.
    .map((l) => (type === 'TXT' ? quote(txtChunks(l)) : type === 'CNAME' || type === 'MX' ? l.toLowerCase() : l));
}

// dig prints TXT as one or more quoted strings, with \" \\ and \DDD escapes.
function txtChunks(line) {
  return (line.match(/"((?:[^"\\]|\\.)*)"/g) ?? [])
    .map((s) => s.slice(1, -1).replace(/\\(\d{3}|.)/g, (_, e) => (/^\d{3}$/.test(e) ? String.fromCharCode(Number(e)) : e)))
    .join('');
}

let failed = 0;
for (const server of servers) {
  const udp = serverResolver(server);
  const res = { udp: 0, tcp: 0, missingUdp: 0, missingTcp: 0, bad: [] };
  for (const r of declared) {
    const w = want(r);
    let u = [];
    try { u = await udp(fq(r.name), r.type); } catch {}
    const t = digTcp(server, fq(r.name), r.type);
    const okU = u.includes(w);
    const okT = t.includes(w);
    if (okU) res.udp++;
    if (okT) res.tcp++;
    if (missingList.has(canonical(r))) {
      if (okU) res.missingUdp++;
      if (okT) res.missingTcp++;
    }
    if (!okU || !okT) res.bad.push(`${canonical(r)} (udp ${okU}, tcp ${okT})`);
  }
  console.log(`${server}: declared ${declared.length}, UDP ${res.udp}/${declared.length}, TCP ${res.tcp}/${declared.length}; Cloudflare-missing set ${missingList.size}: UDP ${res.missingUdp}, TCP ${res.missingTcp}`);
  for (const b of res.bad) console.log(`  NOT ANSWERED ${b}`);
  if (res.bad.length || res.missingUdp !== missingList.size || res.missingTcp !== missingList.size) failed++;
}
process.exit(failed ? 1 : 0);
