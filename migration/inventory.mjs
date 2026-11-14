// Counts the registry from disk and exports live DNS from Cloudflare's
// authoritative server. Usage: node migration/inventory.mjs [--export]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resolver, resolve4 } from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { planDnsChanges } from '../lib/dns.js';

const D = 'runs-at.dev';
const read = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const claims = read('domains');
const owners = read('owners');
const ents = read('entitlements');

const rootTypes = {}, subTypes = {}, rootValues = {}, subValues = {};
let subdomainEntries = 0, claimsWithSubs = 0, noRecords = 0;
for (const c of claims) {
  const r = c.records ?? {};
  if (!Object.keys(r).length && !Object.keys(c.subdomains ?? {}).length) noRecords++;
  for (const [t, v] of Object.entries(r)) { rootTypes[t] = (rootTypes[t] ?? 0) + 1; rootValues[t] = (rootValues[t] ?? 0) + (Array.isArray(v) ? v.length : 1); }
  const subs = Object.entries(c.subdomains ?? {});
  if (subs.length) claimsWithSubs++;
  subdomainEntries += subs.length;
  for (const [, sr] of subs) for (const [t, v] of Object.entries(sr)) { subTypes[t] = (subTypes[t] ?? 0) + 1; subValues[t] = (subValues[t] ?? 0) + (Array.isArray(v) ? v.length : 1); }
}
const planned = claims.flatMap(planDnsChanges);
const plannedByType = {};
for (const p of planned) plannedByType[p.type] = (plannedByType[p.type] ?? 0) + 1;
const counts = {
  claims: claims.length, owners: owners.length, entitlements: ents.length,
  ownerNameRefs: owners.reduce((n, o) => n + (o.names?.length ?? 0), 0),
  claimsWithoutAnyRecords: noRecords, claimsWithSubdomains: claimsWithSubs, subdomainEntries,
  rootRecordKeysByType: rootTypes, rootRecordValuesByType: rootValues,
  subdomainRecordKeysByType: subTypes, subdomainRecordValuesByType: subValues,
  plannedDnsRecordsTotal: planned.length, plannedDnsRecordsByType: plannedByType,
};
console.log(JSON.stringify(counts, null, 2));
if (!process.argv.includes('--export')) process.exit(0);

const nsIps = await resolve4('aida.ns.cloudflare.com');
const res = new Resolver({ timeout: 5000, tries: 2 });
res.setServers([nsIps[0]]);
const fns = { SOA: 'resolveSoa', NS: 'resolveNs', A: 'resolve4', AAAA: 'resolve6', MX: 'resolveMx', TXT: 'resolveTxt', CAA: 'resolveCaa', CNAME: 'resolveCname' };
async function q(name, type) {
  try {
    let a = await res[fns[type]](name);
    if (type === 'TXT') a = a.map((parts) => parts.join(''));
    if (type === 'MX') a = a.map((m) => ({ priority: m.priority, value: m.exchange }));
    return { ok: true, answers: a };
  } catch (e) { return { ok: false, code: e.code }; }
}
const norm = (v) => (typeof v === 'string' ? v.replace(/\.$/, '').toLowerCase() : `${v.priority} ${v.value.replace(/\.$/, '').toLowerCase()}`);

const apex = {};
for (const t of ['SOA', 'NS', 'A', 'AAAA', 'MX', 'TXT', 'CAA']) apex[t] = await q(D, t);
const probe = `probe-${randomBytes(6).toString('hex')}.${D}`;
const wildcard = { probe, A: await q(probe, 'A'), AAAA: await q(probe, 'AAAA'), CNAME: await q(probe, 'CNAME') };
const system = {};
for (const n of ['www', '_vercel']) for (const t of n === '_vercel' ? ['TXT'] : ['A', 'AAAA', 'CNAME']) system[`${n}.${D} ${t}`] = await q(`${n}.${D}`, t);

// Group declared records by fqdn+type so each lookup happens once.
const groups = new Map();
for (const c of claims) for (const p of planDnsChanges(c)) {
  const k = `${p.name}.${D}|${p.type}`;
  if (!groups.has(k)) groups.set(k, { claim: c.name, fqdn: `${p.name}.${D}`, type: p.type, declared: [] });
  groups.get(k).declared.push(p.type === 'MX' ? { priority: p.priority, value: p.value } : p.value);
}
const entries = [...groups.values()];
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < entries.length) {
    const e = entries[i++];
    e.live = await q(e.fqdn, e.type);
    const live = new Set((e.live.answers ?? []).map(norm));
    e.missing = e.declared.filter((v) => !live.has(norm(v)));
    e.status = e.missing.length === 0 ? 'live' : e.missing.length === e.declared.length ? 'missing' : 'partial';
  }
}));
entries.sort((a, b) => a.fqdn.localeCompare(b.fqdn) || a.type.localeCompare(b.type));
const summary = { groups: entries.length, live: 0, partial: 0, missing: 0, declaredValues: 0, missingValues: 0 };
for (const e of entries) { summary[e.status]++; summary.declaredValues += e.declared.length; summary.missingValues += e.missing.length; }
const out = {
  exportedAt: new Date().toISOString(), zone: D, server: { host: 'aida.ns.cloudflare.com', ip: nsIps[0] },
  note: 'URL records are app-level redirects and plan no DNS record; they are excluded here. Names whose records are "missing" are not created at Cloudflare (sync-dns fails with 400 Record quota exceeded) and are answered by the proxied wildcard instead.',
  registryCounts: counts, apex, wildcard, system, summary,
  notLive: entries.filter((e) => e.status !== 'live').map((e) => `${e.fqdn} ${e.type}`),
  records: entries,
};
writeFileSync('migration/backup/live-dns-export.json', `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ apexSOA: apex.SOA, summary, wildcard }, null, 2));
