// Export runs-at.dev as a BIND zone file for the PowerDNS migration.
//
//   NS1_IPV4=… NS2_IPV4=… node scripts/export-zone.mjs [--serial 2026111301] [--out dir]
//   node scripts/export-zone.mjs --placeholder-glue      # TEST-NET glue, NOT FOR PRODUCTION
//
// Claim records come from domains/*.json through planDnsChanges (lib/dns.js),
// the exact planner sync-dns.mjs uses, so names map the same way: records ->
// <name>, subdomains.<label> -> <label>.<name>, URL -> no DNS record (the app
// serves it off the wildcard). System records (apex, www, wildcard) are copied
// from the live Cloudflare export in migration/backup/live-dns-export.json;
// nothing is invented. `_vercel` at the zone level is the same mirror
// sync-dns.mjs maintains (planZoneVerificationRecords, capped, oldest first).
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planDnsChanges, planZoneVerificationRecords, ZONE_VERIFICATION_CAP } from '../lib/dns.js';

export const DOMAIN = 'runs-at.dev';
export const TTL = 300; // same TTL toCloudflareRecord sets
export const PLACEHOLDER_GLUE = { ns1: '192.0.2.1', ns2: '192.0.2.2' };
export const PLACEHOLDER_BANNER = '; *** NOT FOR PRODUCTION: placeholder TEST-NET glue (192.0.2.0/24) ***';

export async function loadClaims(dir = 'domains') {
  const claims = [];
  for (const file of (await readdir(dir)).sort()) {
    if (file.endsWith('.json')) claims.push(JSON.parse(await readFile(join(dir, file), 'utf8')));
  }
  return claims;
}

// Every DNS record the registry asks for, in planDnsChanges' shape plus `source`.
export function registryRecords(claims) {
  const out = [];
  for (const claim of claims) {
    for (const r of planDnsChanges(claim)) out.push({ ...r, source: `claim:${claim.name}` });
  }
  return out;
}

// Zone-level _vercel mirror, as sync-dns.mjs publishes it.
export function zoneVerificationRecords(claims) {
  const sorted = [...claims].sort((a, b) => String(a.claimedAt ?? '').localeCompare(String(b.claimedAt ?? '')));
  return planZoneVerificationRecords(sorted)
    .slice(0, ZONE_VERIFICATION_CAP)
    .map((r) => ({ ...r, source: 'system:_vercel-mirror' }));
}

const answers = (q) => (q?.ok ? q.answers : []);

// Apex / www / wildcard as observed live. Throws if the export is missing,
// rather than guessing values.
export function systemRecords(live) {
  if (!live?.apex) throw new Error('live DNS export missing or has no apex section');
  const out = [];
  const add = (type, name, value, priority) =>
    out.push({ type, name, value, ...(priority !== undefined && { priority }), source: 'system:live-export' });
  // Cloudflare serves the apex as a flattened CNAME to the same Vercel target
  // as www (checked against the Cloudflare export). Pinning today's resolved
  // addresses would break when Vercel changes them, so the apex becomes an
  // ALIAS to that target (expand-alias in pdns.conf). Without a www CNAME the
  // live A/AAAA answers are kept.
  const wwwTarget = answers(live.system?.['www.runs-at.dev CNAME'])[0];
  if (wwwTarget && answers(live.apex.A).length) add('ALIAS', '', wwwTarget);
  else {
    for (const v of answers(live.apex.A)) add('A', '', v);
    for (const v of answers(live.apex.AAAA)) add('AAAA', '', v);
  }
  for (const mx of answers(live.apex.MX)) add('MX', '', mx.value, mx.priority);
  for (const v of answers(live.apex.TXT)) add('TXT', '', Array.isArray(v) ? v.join('') : v);
  for (const v of answers(live.apex.CAA)) add('CAA', '', v);
  for (const v of answers(live.system?.['www.runs-at.dev CNAME'])) add('CNAME', 'www', v);
  // Non-mirror TXT hand-placed at _vercel survives, as sync-dns leaves it alone.
  for (const v of answers(live.system?.['_vercel.runs-at.dev TXT'])) {
    const s = Array.isArray(v) ? v.join('') : v;
    if (!s.startsWith('vc-domain-verify=')) add('TXT', '_vercel', s);
  }
  // DKIM keys (<selector>._domainkey) published at Cloudflare, e.g. Email
  // Routing's cf2024-1: kept verbatim until mail moves (PRODUCTION_DEPENDENCIES).
  for (const [key, q] of Object.entries(live.system ?? {})) {
    const m = /^(.+._domainkey).runs-at.dev TXT$/.exec(key);
    if (m) for (const v of answers(q)) add('TXT', m[1], Array.isArray(v) ? v.join('') : v);
  }
  // Wildcard: today ONE proxied Cloudflare record (answered by
  // cloudflare/worker.js) that resolves to Cloudflare anycast addresses. Those
  // addresses stop serving the cards once the zone leaves Cloudflare, so a
  // production export points * at the Caddy edge (EDGE_IPV4, the edge_ip
  // OpenTofu output) or WILDCARD_CNAME; main() refuses otherwise.
  if (process.env.EDGE_IPV4) out.push({ type: 'A', name: '*', value: process.env.EDGE_IPV4, source: 'system:edge' });
  else if (process.env.WILDCARD_CNAME) add('CNAME', '*', process.env.WILDCARD_CNAME);
  else {
    for (const v of answers(live.wildcard?.A)) add('A', '*', v);
    for (const v of answers(live.wildcard?.AAAA)) add('AAAA', '*', v);
  }
  return out;
}

const fqdn = (v) => (v.endsWith('.') ? v : `${v}.`);
const owner = (name) => (name === '' ? '@' : name);

function txtRdata(value) {
  const chunks = [];
  for (let i = 0; i < value.length || i === 0; i += 255) chunks.push(value.slice(i, i + 255));
  return chunks.map((c) => `"${c.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(' ');
}

export function rdata(r) {
  switch (r.type) {
    case 'CNAME': case 'ALIAS': return fqdn(r.value.toLowerCase());
    case 'MX': return `${r.priority} ${fqdn(r.value.toLowerCase())}`;
    case 'TXT': return txtRdata(r.value);
    default: return r.value;
  }
}

// One canonical line per record; used for dedupe, comparison and checksums.
export const canonical = (r) => `${r.name.toLowerCase()} ${r.type} ${rdata(r)}`;

export const sha256 = (lines) => createHash('sha256').update([...lines].sort().join('\n')).digest('hex');

export function serialFor(date = new Date(), seq = 1) {
  if (seq < 0 || seq > 99) throw new Error('serial sequence must be 0-99');
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  return Number(`${d}${String(seq).padStart(2, '0')}`);
}

export function resolveGlue({ placeholder = false, env = process.env } = {}) {
  if (placeholder) return { ...PLACEHOLDER_GLUE, placeholder: true };
  const ns1 = env.NS1_IPV4, ns2 = env.NS2_IPV4;
  if (!ns1 || !ns2) {
    throw new Error('NS1_IPV4 and NS2_IPV4 must be set to the reserved public IPs of ns1/ns2 (or pass --placeholder-glue for a NOT FOR PRODUCTION test file)');
  }
  for (const ip of [ns1, ns2]) if (isIP(ip) !== 4) throw new Error(`not an IPv4 address: ${ip}`);
  return { ns1, ns2, placeholder: false };
}

// `extra`: operator-supplied records that exist in the Cloudflare zone but in
// no registry file and no live-export system name (the undeclared record(s)
// the sanitized reconciliation counts). Passed with --extra <file.json>, kept
// out of Git; each becomes source 'system:operator-extra'.
export function buildZone({ claims, live, glue, serial, extra = [] }) {
  const records = [];
  const seen = new Set();
  const duplicates = [];
  const operator = extra.map((r) => ({ ...r, source: 'system:operator-extra' }));
  for (const r of [...systemRecords(live), ...operator, ...zoneVerificationRecords(claims), ...registryRecords(claims)]) {
    const key = canonical(r);
    if (seen.has(key)) { duplicates.push(key); continue; }
    seen.add(key);
    records.push(r);
  }
  // RFC 1034: a CNAME owner holds nothing else. Refuse rather than emit a
  // zone PowerDNS would reject or serve inconsistently.
  const byName = new Map();
  for (const r of records) byName.set(r.name, [...(byName.get(r.name) ?? []), r.type]);
  const conflicts = [...byName].filter(([, t]) => t.includes('CNAME') && t.length > 1).map(([n]) => n || '@');
  if (conflicts.length) throw new Error(`CNAME coexists with other data at: ${conflicts.join(', ')}`);

  const soa = { type: 'SOA', name: '', value: `ns1.${DOMAIN}. hostmaster.${DOMAIN}. ${serial} 900 300 1209600 300` };
  const ns = ['ns1', 'ns2'].map((h) => ({ type: 'NS', name: '', value: `${h}.${DOMAIN}.` }));
  const glueRecs = ['ns1', 'ns2'].map((h) => ({ type: 'A', name: h, value: glue[h], source: 'system:glue' }));
  return { soa, ns, glue: glueRecs, records, duplicates };
}

export function renderZone(zone, { placeholder = false } = {}) {
  const line = (r) => `${owner(r.name).padEnd(40)} ${TTL} IN ${r.type.padEnd(5)} ${rdata(r)}`;
  const out = [];
  if (placeholder) out.push(PLACEHOLDER_BANNER);
  out.push(`; ${DOMAIN} generated by scripts/export-zone.mjs from the Git registry`, `$ORIGIN ${DOMAIN}.`, `$TTL ${TTL}`);
  out.push(`@ 3600 IN SOA ${zone.soa.value}`);
  for (const r of zone.ns) out.push(`@ 3600 IN NS ${r.value}`);
  out.push('', '; glue');
  for (const r of zone.glue) out.push(line(r));
  out.push('', '; system + claims');
  const sorted = [...zone.records].sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type) || rdata(a).localeCompare(rdata(b)));
  for (const r of sorted) out.push(line(r));
  return out.join('\n') + '\n';
}

// Parser for the subset of BIND this exporter writes (one record per line,
// owner TTL IN TYPE rdata). Good enough for verify-parity; not a general parser.
export function parseZone(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith(';') || l.startsWith('$')) continue;
    const m = /^(\S+)\s+\d+\s+IN\s+(\S+)\s+(.*)$/.exec(l);
    if (!m) throw new Error(`cannot parse zone line: ${l}`);
    const [, own, type, rd] = m;
    const name = own === '@' ? '' : own;
    if (type === 'TXT') {
      const value = [...rd.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1].replace(/\\(.)/g, '$1')).join('');
      out.push({ name, type, value });
    } else if (type === 'MX') {
      const [p, v] = rd.split(/\s+/);
      out.push({ name, type, value: v.replace(/\.$/, ''), priority: Number(p) });
    } else if (type === 'CNAME') {
      out.push({ name, type, value: rd.replace(/\.$/, '') });
    } else out.push({ name, type, value: rd });
  }
  return out;
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const placeholder = argv.includes('--placeholder-glue');
  const outDir = arg('--out') ?? 'migration/zone';
  const liveFile = arg('--live') ?? 'migration/backup/live-dns-export.json';
  const serial = arg('--serial') ? Number(arg('--serial')) : serialFor(new Date(), Number(process.env.SERIAL_SEQ ?? 1));
  if (!/^\d{10}$/.test(String(serial))) throw new Error(`serial must be YYYYMMDDnn, got ${serial}`);

  const glue = resolveGlue({ placeholder });
  if (!placeholder && !process.env.EDGE_IPV4 && !process.env.WILDCARD_CNAME) {
    throw new Error('EDGE_IPV4 (the edge_ip output) or WILDCARD_CNAME must be set: the live wildcard answers are Cloudflare proxy addresses that stop working off Cloudflare');
  }
  if (process.env.EDGE_IPV4 && !/^(\d{1,3}\.){3}\d{1,3}$/.test(process.env.EDGE_IPV4)) throw new Error('EDGE_IPV4 is not an IPv4 address');
  const claims = await loadClaims(arg('--domains') ?? 'domains');
  const live = JSON.parse(await readFile(liveFile, 'utf8'));
  const extra = arg('--extra') ? JSON.parse(await readFile(arg('--extra'), 'utf8')) : [];
  const zone = buildZone({ claims, live, glue, serial, extra });
  const text = renderZone(zone, { placeholder });

  const countBy = (rs) => rs.reduce((m, r) => ((m[r.type] = (m[r.type] ?? 0) + 1), m), {});
  const all = [...zone.ns, ...zone.glue, ...zone.records];
  const json = {
    zone: DOMAIN, serial, ttl: TTL,
    notForProduction: placeholder,
    generatedAt: new Date().toISOString(),
    claims: claims.length,
    counts: { total: all.length + 1, byType: countBy(all), registry: zone.records.filter((r) => r.source.startsWith('claim:')).length },
    duplicatesDropped: zone.duplicates,
    zoneFileSha256: createHash('sha256').update(text).digest('hex'),
    recordsSha256: sha256(all.map(canonical)),
    soa: zone.soa.value,
    records: all.map((r) => ({ name: r.name, type: r.type, value: r.value, ...(r.priority !== undefined && { priority: r.priority }), source: r.source ?? 'system:ns' }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type) || a.value.localeCompare(b.value)),
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${DOMAIN}.zone`), text);
  await writeFile(join(outDir, `${DOMAIN}.json`), JSON.stringify(json, null, 2) + '\n');
  if (placeholder) console.log('WARNING: placeholder TEST-NET glue; this zone is NOT FOR PRODUCTION');
  console.log(`wrote ${join(outDir, `${DOMAIN}.zone`)} serial ${serial}: ${json.counts.total - 1} records + SOA ${JSON.stringify(json.counts.byType)}, ${json.counts.registry} from claims, ${zone.duplicates.length} duplicates dropped`);
  console.log(`zone sha256 ${json.zoneFileSha256}  records sha256 ${json.recordsSha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => { console.error(`export-zone: ${err.message}`); process.exit(1); });
}
