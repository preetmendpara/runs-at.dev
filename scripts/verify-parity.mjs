// Compare what the registry declares against an exported zone file, and
// optionally against live answers from one nameserver.
//
//   node scripts/verify-parity.mjs [--zone migration/zone/runs-at.dev.zone] [--server 192.0.2.1] [--json]
//
// Exit 0 only when every registry record is present (zone and, if asked,
// live) and nothing is mismatched. `extra` lists zone records that are not
// registry claims; system records (apex, www, wildcard, glue, _vercel mirror)
// are reported separately and do not fail the run.
import { readFile } from 'node:fs/promises';
import { Resolver } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import { loadClaims, registryRecords, zoneVerificationRecords, parseZone, canonical, sha256, DOMAIN } from './export-zone.mjs';

const key = (r) => `${r.name.toLowerCase()} ${r.type}`;

export function compare(declared, zone, system = []) {
  const zoneSet = new Set(zone.map(canonical));
  const declSet = new Set(declared.map(canonical));
  const sysSet = new Set(system.map(canonical));
  const zoneByKey = new Map();
  for (const r of zone) zoneByKey.set(key(r), [...(zoneByKey.get(key(r)) ?? []), r]);

  const missing = [], mismatched = [];
  for (const r of declared) {
    if (zoneSet.has(canonical(r))) continue;
    const there = zoneByKey.get(key(r));
    if (there) mismatched.push({ declared: canonical(r), zone: there.map(canonical) });
    else missing.push(canonical(r));
  }
  const extraAll = zone.filter((r) => !declSet.has(canonical(r)) && r.type !== 'SOA');
  const extra = extraAll.filter((r) => !sysSet.has(canonical(r)) && !['', 'ns1', 'ns2', 'www', '*', '_vercel'].includes(r.name)).map(canonical);
  return {
    declared: declSet.size, zone: zoneSet.size, matched: declared.filter((r) => zoneSet.has(canonical(r))).length,
    missing, mismatched, extra, system: extraAll.length - extra.length,
    declaredSha256: sha256(declSet), zoneSha256: sha256([...zoneSet].filter((l) => declSet.has(l))),
  };
}

async function liveAnswers(resolver, r) {
  const host = r.name ? `${r.name}.${DOMAIN}` : DOMAIN;
  try {
    switch (r.type) {
      case 'A': return await resolver.resolve4(host);
      case 'AAAA': return await resolver.resolve6(host);
      case 'CNAME': return (await resolver.resolveCname(host)).map((v) => v.toLowerCase().replace(/\.$/, ''));
      case 'TXT': return (await resolver.resolveTxt(host)).map((c) => c.join(''));
      case 'MX': return (await resolver.resolveMx(host)).map((m) => `${m.priority} ${m.exchange.toLowerCase()}`);
    }
  } catch (err) { return { error: err.code ?? err.message }; }
  return [];
}

export async function compareLive(declared, server, { timeout = 3000 } = {}) {
  const resolver = new Resolver({ timeout, tries: 2 });
  resolver.setServers([server]);
  const missing = [], answered = [];
  for (const r of declared) {
    const got = await liveAnswers(resolver, r);
    const want = r.type === 'MX' ? `${r.priority} ${r.value.toLowerCase()}`
      : r.type === 'CNAME' ? r.value.toLowerCase().replace(/\.$/, '') : r.value;
    if (Array.isArray(got) && got.includes(want)) answered.push(canonical(r));
    else missing.push({ record: canonical(r), live: got });
  }
  return { server, queried: declared.length, matched: answered.length, missing, liveSha256: sha256(answered) };
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const claims = await loadClaims(arg('--domains') ?? 'domains');
  const declared = registryRecords(claims);
  const zone = parseZone(await readFile(arg('--zone') ?? `migration/zone/${DOMAIN}.zone`, 'utf8'));
  const report = { zone: compare(declared, zone, zoneVerificationRecords(claims)) };
  if (arg('--server')) report.live = await compareLive(declared, arg('--server'));

  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    const z = report.zone;
    console.log(`zone: declared ${z.declared}, in zone ${z.zone}, matched ${z.matched}, missing ${z.missing.length}, mismatched ${z.mismatched.length}, extra ${z.extra.length}, system ${z.system}`);
    console.log(`  declared sha256 ${z.declaredSha256}\n  zone     sha256 ${z.zoneSha256}`);
    for (const m of z.missing) console.log(`  MISSING  ${m}`);
    for (const m of z.mismatched) console.log(`  MISMATCH ${m.declared} -> ${m.zone.join(' | ')}`);
    for (const m of z.extra) console.log(`  EXTRA    ${m}`);
    if (report.live) {
      const l = report.live;
      console.log(`live @${l.server}: queried ${l.queried}, matched ${l.matched}, missing ${l.missing.length}, sha256 ${l.liveSha256}`);
      for (const m of l.missing) console.log(`  LIVE-MISSING ${m.record} (${JSON.stringify(m.live)})`);
    }
  }
  const z = report.zone;
  const bad = z.missing.length + z.mismatched.length + z.extra.length + (report.live?.missing.length ?? 0);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => { console.error(`verify-parity: ${err.message}`); process.exit(2); });
}
