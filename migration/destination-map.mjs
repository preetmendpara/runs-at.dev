// Maps every source item (claim, owner, entitlement, declared DNS record, live
// system record) to its migration destination, and writes
// migration/reports/{destination-map.json,source-vs-destination.{json,md},
// reconciliation.json,SHA256SUMS}. Exits 1 if any claim or declared record has
// no destination. Deterministic: no timestamps. Usage: node migration/destination-map.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { planDnsChanges, planZoneVerificationRecords } from '../lib/dns.js';
import { canonical } from '../scripts/export-zone.mjs';
import { loadRegistry, reconcile } from './reconcile.mjs';

const REGISTRY = 'stays in Git registry (unchanged)';
const NO_USERS = 'stays in Git registry (unchanged, not migrated: PowerDNS stores no users)';
const tally = (list, key) => list.reduce((m, x) => ({ ...m, [key(x)]: (m[key(x)] ?? 0) + 1 }), {});
const rrset = (r) => ({ name: r.name || '@', type: r.type });

export function buildDestinationMap({ domains, owners, entitlements }, zone, live) {
  const zoneByCanon = new Map(zone.records.map((r) => [canonical(r), r]));
  const missing = [];
  const claims = [];
  const declared = [];
  for (const { file, data } of domains) {
    const planned = planDnsChanges(data);
    const urls = [data.records?.URL, ...Object.values(data.subdomains ?? {}).map((s) => s.URL)].filter(Boolean);
    const recs = planned.map((r) => {
      const z = zoneByCanon.get(canonical(r));
      const entry = { claim: data.name, ...r, sub: r.name !== data.name, destination: z ? { zone: zone.zone, rrset: rrset(z), rdata: canonical(z) } : null };
      if (!z) missing.push(`record ${canonical(r)} (claim ${data.name})`);
      declared.push(entry);
      return entry.destination && { ...entry.destination.rrset, value: r.value };
    });
    const mirror = planZoneVerificationRecords([data]).map((r) => {
      const z = zoneByCanon.get(canonical(r));
      if (!z) missing.push(`mirror ${canonical(r)} (claim ${data.name})`);
      return z && rrset(z);
    });
    const kind = planned.length ? 'dns' : urls.length ? 'url-only' : 'card-only';
    claims.push({
      file: `domains/${file}`, name: data.name, owner: String(data.owner?.github).toLowerCase(), kind,
      registry: REGISTRY,
      zoneRecords: planned.length ? recs : 'no DNS record by design (' + (kind === 'url-only' ? 'URL redirect served by the app off the wildcard' : 'profile card served off the wildcard') + ', lib/dns.js planFor)',
      ...(mirror.length && { zoneLevelMirror: mirror }),
      urlEntries: urls.length,
    });
  }
  // Live system records: what was observed at Cloudflare and where it goes.
  const sys = [];
  const put = (name, type, value, note) => {
    const z = zone.records.find((r) => r.source.startsWith('system') && (r.name || '@') === name && r.type === type && (r.value === value || canonical(r) === canonical({ name: r.name, type, value: value?.value ?? value, priority: value?.priority })));
    sys.push({ name, type, value, destination: note ?? (z ? { zone: zone.zone, rrset: rrset(z), source: z.source } : 'NOT IN ZONE') });
  };
  const ans = (x) => (x?.ok && Array.isArray(x.answers) ? x.answers : []);
  const EMAIL = 'needs replacement off Cloudflare (Cloudflare Email Routing); copied verbatim into zone for parity only';
  const PROXY = 'needs replacement off Cloudflare (proxied wildcard -> cloudflare/worker.js); copied verbatim into zone for parity only';
  if (live.apex.SOA?.ok) sys.push({ name: '@', type: 'SOA', value: `${live.apex.SOA.answers.nsname} ${live.apex.SOA.answers.hostmaster}`, destination: { zone: zone.zone, rrset: { name: '@', type: 'SOA' }, replacedBy: zone.soa } });
  for (const v of ans(live.apex.NS)) sys.push({ name: '@', type: 'NS', value: v, destination: { zone: zone.zone, rrset: { name: '@', type: 'NS' }, replacedBy: zone.records.filter((r) => r.type === 'NS').map((r) => r.value) } });
  for (const v of ans(live.apex.A)) put('@', 'A', v);
  for (const v of ans(live.apex.MX)) put('@', 'MX', v);
  for (const v of ans(live.apex.TXT)) put('@', 'TXT', v);
  for (const s of sys) if (s.type === 'MX' || (s.type === 'TXT' && /_spf\.mx\.cloudflare\.net/.test(s.value))) s.replacement = EMAIL;
  for (const v of ans(live.wildcard.A)) { put('*', 'A', v); sys.at(-1).replacement = PROXY; }
  for (const v of ans(live.wildcard.AAAA)) { put('*', 'AAAA', v); sys.at(-1).replacement = PROXY; }
  for (const v of ans(live.system['www.runs-at.dev CNAME'])) put('www', 'CNAME', v);
  for (const v of ans(live.system['_vercel.runs-at.dev TXT'])) {
    const z = zone.records.find((r) => r.name === '_vercel' && r.value === v);
    sys.push({ name: '_vercel', type: 'TXT', value: v, destination: z ? { zone: zone.zone, rrset: rrset(z), source: z.source } : 'NOT IN ZONE' });
  }
  for (const s of sys) if (s.destination === 'NOT IN ZONE') missing.push(`live system ${s.name} ${s.type}`);
  const zoneOnly = zone.records.filter((r) => r.source === 'system:glue').map((r) => ({ ...rrset(r), value: r.value, note: 'PowerDNS glue, placeholder addresses (RFC 5737) until the real nameserver IPs exist' }));

  return {
    zone: zone.zone, zoneSerial: zone.serial,
    claims, declaredRecords: declared,
    owners: owners.map(({ file }) => ({ file: `owners/${file}`, destination: NO_USERS })),
    entitlements: entitlements.map(({ file }) => ({ file: `entitlements/${file}`, destination: NO_USERS })),
    liveSystemRecords: sys, zoneOnlyRecords: zoneOnly,
    missing,
  };
}

export function summarize(reg, zone, live, map, rec) {
  const decl = map.declaredRecords;
  const source = {
    claims: reg.domains.length, owners: reg.owners.length, entitlements: reg.entitlements.length,
    declaredRecords: decl.length,
    declaredByType: tally(decl, (r) => r.type),
    declaredRootByType: tally(decl.filter((r) => !r.sub), (r) => r.type),
    declaredSubdomainByType: tally(decl.filter((r) => r.sub), (r) => r.type),
    claimsWithSubdomains: reg.domains.filter((d) => Object.keys(d.data.subdomains ?? {}).length).length,
    urlEntries: map.claims.reduce((n, c) => n + c.urlEntries, 0),
    claimsByKind: tally(map.claims, (c) => c.kind),
    zoneLevelVercelMirrorValues: map.claims.reduce((n, c) => n + (c.zoneLevelMirror?.length ?? 0), 0),
    liveSystemRecords: map.liveSystemRecords.length,
    liveClaimRecordGroups: live.summary,
  };
  const destination = {
    zoneRecords: zone.records.length,
    zoneByType: tally(zone.records, (r) => r.type),
    zoneBySource: tally(zone.records, (r) => r.source.startsWith('claim:') ? 'claim' : r.source),
    registryFilesUnchanged: { domains: reg.domains.length, owners: reg.owners.length, entitlements: reg.entitlements.length },
    claimsMapped: map.claims.length, declaredRecordsMapped: decl.filter((r) => r.destination).length,
    liveSystemNeedingReplacement: map.liveSystemRecords.filter((s) => s.replacement).length,
  };
  const zc = destination.zoneBySource;
  const mismatches = [
    { what: 'zone records vs declared records', source: decl.length, destination: zone.records.length, explanation: `zone adds ${zone.records.length - decl.length} non-claim records: ${Object.entries(zc).filter(([k]) => k !== 'claim').map(([k, v]) => `${v} ${k}`).join(', ')}` },
    { what: 'zone header counts.total vs records[]', source: zone.counts.total, destination: zone.records.length, explanation: 'counts.total includes the SOA (scripts/export-zone.mjs: all.length + 1); records[] does not' },
    { what: 'claims vs claims with zone records', source: reg.domains.length, destination: map.claims.filter((c) => c.kind === 'dns').length, explanation: `${source.claimsByKind['card-only'] ?? 0} card-only + ${source.claimsByKind['url-only'] ?? 0} URL-only claims plan no DNS record by design (lib/dns.js planFor)` },
    { what: 'URL entries vs zone records', source: source.urlEntries, destination: 0, explanation: 'URL redirects are served by the app off the wildcard; no DNS record by design' },
    { what: 'owners/entitlements vs PowerDNS', source: reg.owners.length + reg.entitlements.length, destination: 0, explanation: 'PowerDNS stores no users; both stay in the Git registry unchanged' },
    { what: 'entitlements vs owners', source: reg.entitlements.length, destination: reg.owners.length, explanation: `${rec.counts.entitlementsWithoutOwnersFile} entitlement files have no owners file (${Object.entries(rec.entitlementsWithoutOwnersFileByReason).map(([k, v]) => `${v}: ${k}`).join('; ')}); see migration/RECONCILIATION.md` },
    { what: 'declared values not live at Cloudflare', source: live.summary.declaredValues, destination: live.summary.missingValues, explanation: 'present in zone (from registry) but absent live: Cloudflare record quota, answered by the wildcard today; PowerDNS will serve them' },
  ];
  return { source, destination, mismatches, missing: map.missing };
}

function markdown(s) {
  const kv = (o) => Object.entries(o).sort().map(([k, v]) => `${k} ${v}`).join(', ');
  return `# Source vs destination

Generated by \`node migration/destination-map.mjs\` from the working tree. Deterministic (no timestamps).

## Source

| Item | Count |
|---|---|
| Claims (domains/*.json) | ${s.source.claims} |
| Owners (owners/*.json) | ${s.source.owners} |
| Entitlements (entitlements/*.json) | ${s.source.entitlements} |
| Claims by kind | ${kv(s.source.claimsByKind)} |
| Claims with subdomains | ${s.source.claimsWithSubdomains} |
| URL entries | ${s.source.urlEntries} |
| Declared DNS records | ${s.source.declaredRecords} (${kv(s.source.declaredByType)}) |
| ...at claim root | ${kv(s.source.declaredRootByType)} |
| ...in subdomains | ${kv(s.source.declaredSubdomainByType)} |
| Zone-level \`_vercel\` mirror values | ${s.source.zoneLevelVercelMirrorValues} |
| Live system records observed | ${s.source.liveSystemRecords} |

## Destination

| Item | Count |
|---|---|
| Zone records total | ${s.destination.zoneRecords} |
| Zone by type | ${kv(s.destination.zoneByType)} |
| Zone by source | ${kv(s.destination.zoneBySource)} |
| Claims mapped | ${s.destination.claimsMapped} |
| Declared records mapped to an exact RRset | ${s.destination.declaredRecordsMapped} |
| Registry files left unchanged in Git | domains ${s.destination.registryFilesUnchanged.domains}, owners ${s.destination.registryFilesUnchanged.owners}, entitlements ${s.destination.registryFilesUnchanged.entitlements} |
| Live system records needing replacement off Cloudflare | ${s.destination.liveSystemNeedingReplacement} |

## Mismatches

| What | Source | Destination | Explanation |
|---|---|---|---|
${s.mismatches.map((m) => `| ${m.what} | ${m.source} | ${m.destination} | ${m.explanation} |`).join('\n')}

Unmapped items: ${s.missing.length}${s.missing.length ? '\n\n' + s.missing.map((m) => `- ${m}`).join('\n') : ''}
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reg = loadRegistry('.');
  const zone = JSON.parse(readFileSync('migration/zone/runs-at.dev.json', 'utf8'));
  const live = JSON.parse(readFileSync('migration/backup/live-dns-export.json', 'utf8'));
  const map = buildDestinationMap(reg, zone, live);
  const rec = reconcile(reg);
  const s = summarize(reg, zone, live, map, rec);
  mkdirSync('migration/reports', { recursive: true });
  const out = {
    'migration/reports/destination-map.json': JSON.stringify(map, null, 2) + '\n',
    'migration/reports/reconciliation.json': JSON.stringify(rec, null, 2) + '\n',
    'migration/reports/source-vs-destination.json': JSON.stringify(s, null, 2) + '\n',
    'migration/reports/source-vs-destination.md': markdown(s),
  };
  for (const [f, body] of Object.entries(out)) writeFileSync(f, body);
  const hashed = [...Object.keys(out), 'migration/zone/runs-at.dev.json', 'migration/zone/runs-at.dev.zone'].filter(existsSync);
  writeFileSync('migration/reports/SHA256SUMS', hashed.map((f) => `${createHash('sha256').update(readFileSync(f)).digest('hex')} *${f}`).join('\n') + '\n');
  console.log(JSON.stringify({ source: s.source, destination: s.destination, missing: s.missing.length }, null, 2));
  if (map.missing.length) { console.error(`unmapped: ${map.missing.join('; ')}`); process.exit(1); }
}
