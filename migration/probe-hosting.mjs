// For each Cloudflare-missing CNAME/A record, ask the hosting target whether
// it actually serves that hostname: an HTTPS request sent to the target's
// address with the claimed name as SNI and Host header (curl --resolve), so
// it needs no DNS for the name itself. Certificate errors are expected (a
// host cannot issue one while the name does not resolve), so -k is used and
// only the HTTP status, the host's "not configured" signature and the
// certificate subject are recorded.
//
//   node migration/probe-hosting.mjs  -> migration/reports/hosting-probe.json
import { execFileSync } from 'node:child_process';
import { Resolver } from 'node:dns/promises';
import { readFileSync, writeFileSync } from 'node:fs';

const pub = new Resolver({ timeout: 5000, tries: 2 });
pub.setServers(['1.1.1.1', '8.8.8.8']);
const { missing } = JSON.parse(readFileSync('migration/reports/missing-records.json', 'utf8'));

const NOT_CONFIGURED = [
  [/There isn't a GitHub Pages site here/i, 'GitHub Pages: no site configured for this name'],
  [/DEPLOYMENT_NOT_FOUND|The deployment could not be found on Vercel/i, 'Vercel: no deployment for this name'],
  [/Invalid Configuration|This domain is not configured/i, 'host: domain not configured'],
];

function curl(host, ip, scheme = 'https') {
  const port = scheme === 'https' ? 443 : 80;
  try {
    const out = execFileSync('curl', ['-sk', '--max-time', '15', '-o', '-', '-w', '\n@@%{http_code} %{redirect_url}',
      '--resolve', `${host}:${port}:${ip}`, `${scheme}://${host}/`], { encoding: 'utf8', maxBuffer: 4 << 20 });
    const at = out.lastIndexOf('\n@@');
    const [code, redirect] = out.slice(at + 3).split(' ');
    return { body: out.slice(0, at), code: Number(code), redirect: redirect || null };
  } catch {
    return { body: '', code: 0, redirect: null };
  }
}

async function ipv4For(target) {
  try { return (await pub.resolve4(target))[0]; } catch { return null; }
}

const results = [];
for (const m of missing) {
  if (!['CNAME', 'A'].includes(m.type)) continue;
  const ip = m.type === 'A' ? m.value : await ipv4For(m.value);
  if (!ip) { results.push({ fqdn: m.fqdn, verdict: 'unreachable', detail: 'target has no IPv4 address' }); continue; }
  // HTTPS first; hosts that refuse TLS for a name they hold no certificate
  // for (Vercel, some PaaS) still answer plain HTTP for configured names.
  let r = curl(m.fqdn, ip);
  let scheme = 'https';
  if (r.code === 0) { r = curl(m.fqdn, ip, 'http'); scheme = 'http'; }
  const notConfigured = NOT_CONFIGURED.find(([re]) => re.test(r.body));
  let verdict, detail;
  if (r.code === 0) { verdict = 'unreachable'; detail = 'no response over HTTPS or HTTP'; }
  else if (notConfigured) { verdict = 'host-not-configured'; detail = notConfigured[1]; }
  else if (r.code >= 200 && r.code < 400) { verdict = 'serves-name'; detail = `${scheme} ${r.code}${r.redirect ? ` -> ${r.redirect}` : ''}`; }
  else { verdict = 'responds-error'; detail = `${scheme} ${r.code}`; }
  results.push({ fqdn: m.fqdn, type: m.type, target: m.value, verdict, detail });
}
writeFileSync('migration/reports/hosting-probe.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + '\n');
for (const r of results) console.log(`${r.fqdn} ${r.verdict} (${r.detail})`);
