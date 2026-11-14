// Turns the registry's planned changes (lib/dns.js planDnsChanges shape:
// { type, name relative, value, priority }) into normalized zone records, and
// validates normalized records before anything is sent to a provider.
//
// CAA and SRV are validated here, at the provider layer, but NOT added to
// lib/schema.js: the default provider's record body (toCloudflareRecord) sends
// a flat `content`, which Cloudflare rejects for CAA/SRV, and the /manage
// editor has no fields for them. Accepting them in claim files would let an
// owner save records production cannot publish. NS is not accepted at all:
// a claim file has no way to express that a delegation is ownership-safe
// (an NS on `x.<name>` hands that subtree to whatever server it names, outside
// every check the registry makes), so delegation stays out of the schema.
export const DEFAULT_TTL = 300; // matches toCloudflareRecord

export const fqdn = (name, zone) => `${name ? `${name}.` : ''}${zone}.`.toLowerCase();
const dotted = (host) => (host.endsWith('.') ? host : `${host}.`).toLowerCase();
const quote = (text) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function toZoneRecords(changes, zone) {
  return changes.map((c) => {
    const name = fqdn(c.name, zone);
    let content;
    switch (c.type) {
      case 'TXT': content = quote(c.value); break;
      case 'CNAME': content = dotted(c.value); break;
      case 'MX': content = `${c.priority} ${dotted(c.value)}`; break;
      case 'AAAA': content = c.value.toLowerCase(); break;
      default: content = c.value;
    }
    return { name, type: c.type, ttl: DEFAULT_TTL, content };
  });
}

const HOST = /^(?=.{1,254}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9])?\.)+$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const CAA = /^(\d{1,3}) (issue|issuewild|iodef) "([^"\\]*)"$/;
const SRV = /^(\d{1,5}) (\d{1,5}) (\d{1,5}) (\S+)$/;
export const ZONE_TYPES = new Set(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA', 'SRV']);

export function validateZoneRecord(r) {
  if (!HOST.test(r.name) && !/^\*\./.test(r.name)) return `bad name ${r.name}`;
  if (!ZONE_TYPES.has(r.type)) return `unsupported type ${r.type} at ${r.name}`;
  const c = String(r.content ?? '');
  const bad = () => `bad ${r.type} content at ${r.name}: ${c}`;
  switch (r.type) {
    case 'A': return IPV4.test(c) ? null : bad();
    case 'AAAA': return /^[0-9a-f:.]+$/.test(c) && c.includes(':') ? null : bad();
    case 'CNAME': return HOST.test(c) ? null : bad();
    case 'TXT': return /^".*"$/s.test(c) ? null : bad();
    case 'MX': {
      const [p, host, extra] = c.split(' ');
      return extra === undefined && /^\d{1,5}$/.test(p) && +p <= 65535 && HOST.test(host ?? '') ? null : bad();
    }
    case 'CAA': {
      const m = CAA.exec(c);
      return m && +m[1] <= 255 ? null : bad();
    }
    case 'SRV': {
      const m = SRV.exec(c);
      if (!/^_[a-z0-9-]+\._(tcp|udp|tls)\./.test(r.name)) return `SRV name must be _service._proto at ${r.name}`;
      return m && [m[1], m[2], m[3]].every((n) => +n <= 65535) && (m[4] === '.' || HOST.test(m[4])) ? null : bad();
    }
  }
  return null;
}

// Every error in the desired set: bad records, and CNAME sharing a name with
// anything (including a second, different CNAME).
export function validateDesired(records) {
  const errors = [];
  const byName = new Map();
  for (const r of records) {
    const e = validateZoneRecord(r);
    if (e) errors.push(e);
    if (!byName.has(r.name)) byName.set(r.name, new Set());
    byName.get(r.name).add(r.type === 'CNAME' ? `CNAME ${r.content}` : r.type);
  }
  for (const [name, kinds] of byName) {
    if ([...kinds].some((k) => k.startsWith('CNAME')) && kinds.size > 1) errors.push(`CNAME cannot coexist with other records at ${name}`);
  }
  return errors.sort();
}

// The whole zone this registry asks for: every claim's records plus the
// zone-level `_vercel` mirror (lib/dns.js), as normalized zone records.
// PowerDNS has no 50-value TXT cap, so no fitZoneVerification step here.
export function desiredFromClaims(claims, zone, { planDnsChanges, planZoneVerificationRecords }) {
  const changes = claims.flatMap((claim) => planDnsChanges(claim));
  changes.push(...planZoneVerificationRecords(claims, { domain: zone }));
  return toZoneRecords(changes, zone);
}
