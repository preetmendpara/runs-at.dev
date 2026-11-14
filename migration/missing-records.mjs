// Investigate every record the registry declares that Cloudflare does not
// serve. The registry (domains/*.json) is the source of truth; Cloudflare is
// only asked what it answers today.
//
// For each declared record (registry planDnsChanges + the zone-level
// `_vercel` mirror, the same set sync-dns publishes) this queries the
// Cloudflare authoritative nameserver directly. Each missing one is checked
// against its claim file (owner, claim date, raw registry entry), and its
// target is probed: CNAME/MX targets resolve, A targets accept TCP on
// 443/80, TXT needs no target. Finally the record is checked to be
// publishable in a PowerDNS zone (no CNAME conflict, valid rdata).
//
//   node migration/missing-records.mjs            -> migration/reports/missing-records.json
//
// Read-only: DNS queries and TCP connects only. Never writes to Cloudflare.
import { Resolver, resolve4 } from 'node:dns/promises';
import { connect } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { loadClaims, registryRecords, zoneVerificationRecords, canonical, DOMAIN, TTL } from '../scripts/export-zone.mjs';

const fqdn = (name) => (name === '' ? DOMAIN : `${name}.${DOMAIN}`);
const norm = (s) => String(s).toLowerCase().replace(/\.$/, '');

async function cloudflareResolver() {
  const ip = (await resolve4('aida.ns.cloudflare.com'))[0];
  const r = new Resolver({ timeout: 5000, tries: 3 });
  r.setServers([ip]);
  return { r, ip };
}

// What Cloudflare answers for one declared record: true if present.
async function present(res, rec) {
  const host = fqdn(rec.name);
  try {
    switch (rec.type) {
      case 'CNAME': return (await res.resolveCname(host)).map(norm).includes(norm(rec.value));
      case 'A': return (await res.resolve4(host)).includes(rec.value);
      case 'AAAA': return (await res.resolve6(host)).includes(rec.value);
      case 'MX': return (await res.resolveMx(host)).some((m) => norm(m.exchange) === norm(rec.value) && m.priority === rec.priority);
      case 'TXT': return (await res.resolveTxt(host)).map((c) => c.join('')).includes(rec.value);
      default: return false;
    }
  } catch {
    return false;
  }
}

function tcp(host, port, ms = 5000) {
  return new Promise((resolve) => {
    const s = connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(ms, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

// Public recursive resolution of a target, independent of Cloudflare.
const pub = new Resolver({ timeout: 5000, tries: 2 });
pub.setServers(['1.1.1.1', '8.8.8.8']);
async function resolvesAnywhere(host) {
  const out = [];
  for (const fn of ['resolve4', 'resolve6', 'resolveCname']) {
    try { out.push(...(await pub[fn](host))); } catch {}
  }
  return out;
}

async function probeTarget(rec) {
  switch (rec.type) {
    case 'CNAME': {
      const answers = await resolvesAnywhere(rec.value);
      if (!answers.length) return { reachable: false, detail: 'CNAME target does not resolve publicly' };
      const v4 = answers.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      const https = v4 ? await tcp(v4, 443) : null;
      return { reachable: true, detail: `target resolves (${answers.length} answer(s))${https === null ? '' : https ? ', TCP 443 open' : ', TCP 443 closed'}` };
    }
    case 'A': {
      const [h443, h80] = [await tcp(rec.value, 443), await tcp(rec.value, 80)];
      return { reachable: h443 || h80, detail: `TCP 443 ${h443 ? 'open' : 'closed'}, TCP 80 ${h80 ? 'open' : 'closed'}` };
    }
    case 'AAAA':
      return { reachable: await tcp(rec.value, 443), detail: 'TCP 443 over IPv6' };
    case 'MX': {
      const answers = await resolvesAnywhere(rec.value);
      return { reachable: answers.length > 0, detail: answers.length ? 'mail exchanger resolves' : 'mail exchanger does not resolve' };
    }
    case 'TXT':
      return { reachable: null, detail: 'TXT has no target; value is published as-is' };
    default:
      return { reachable: null, detail: 'unsupported type' };
  }
}

// Can this record be published in the zone next to everything else?
function publishable(rec, all) {
  const same = all.filter((r) => r.name === rec.name);
  if (rec.type === 'CNAME' && same.some((r) => r.type !== 'CNAME')) return { ok: false, why: 'CNAME shares its name with other data' };
  if (rec.type !== 'CNAME' && same.some((r) => r.type === 'CNAME')) return { ok: false, why: 'name also has a CNAME' };
  if (rec.type === 'TXT' && rec.value.length > 4000) return { ok: false, why: 'TXT too long' };
  return { ok: true, why: 'valid rdata, no conflicts' };
}

const claims = await loadClaims('domains');
const byName = new Map(claims.map((c) => [c.name, c]));
const declared = [...registryRecords(claims), ...zoneVerificationRecords(claims)];
const { r: cf, ip } = await cloudflareResolver();

const checked = [];
for (const rec of declared) checked.push({ rec, live: await present(cf, rec) });
const missing = checked.filter((c) => !c.live).map((c) => c.rec);

const details = [];
for (const rec of missing) {
  const claimName = rec.source.startsWith('claim:') ? rec.source.slice(6) : null;
  const claim = claimName ? byName.get(claimName) : null;
  const label = claim && rec.name !== claim.name ? rec.name.slice(0, -(claim.name.length + 1)) : null;
  const raw = claim ? (label ? claim.subdomains?.[label] : claim.records) : null;
  const owners = claim ? JSON.parse(readFileSync(`owners/${claim.owner.github.toLowerCase()}.json`, 'utf8')) : null;
  details.push({
    fqdn: fqdn(rec.name),
    type: rec.type,
    value: rec.value,
    ...(rec.priority !== undefined ? { priority: rec.priority } : {}),
    ttl: TTL,
    source: rec.source,
    claim: claim ? claim.name : null,
    owner: claim ? claim.owner.github : null,
    ownerFileListsClaim: owners ? owners.names.includes(claim.name) : null,
    claimedAt: claim ? claim.claimedAt : null,
    registryEntry: raw ?? null,
    target: await probeTarget(rec),
    powerdns: publishable(rec, declared),
    canonical: canonical(rec),
  });
}

const out = {
  generatedAt: new Date().toISOString(),
  cloudflareNameserver: ip,
  registry: { claims: claims.length },
  declared: declared.length,
  presentInCloudflare: checked.length - missing.length,
  missingFromCloudflare: missing.length,
  missing: details,
};
mkdirSync('migration/reports', { recursive: true });
writeFileSync('migration/reports/missing-records.json', JSON.stringify(out, null, 2) + '\n');
console.log(`declared ${out.declared}, present ${out.presentInCloudflare}, missing ${out.missingFromCloudflare}`);
for (const d of details) {
  console.log(`${d.fqdn} ${d.type} owner=${d.owner} claimed=${d.claimedAt?.slice(0, 10)} target=${d.target.reachable} (${d.target.detail}) pdns=${d.powerdns.ok}`);
}
