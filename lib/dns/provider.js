// The DNS provider contract. Every adapter in lib/dns/ returns an object with
// these methods; scripts/sync-dns.mjs picks one with DNS_PROVIDER.
//
// Records crossing this interface are normalized:
//   { name: 'blog.lucas.runs-at.dev.', type: 'CNAME', ttl: 300, content: 'x.example.com.' }
// i.e. fully qualified names with a trailing dot and content in zone-file
// presentation form (TXT quoted, MX "<prio> <host>.", CNAME targets dotted).
// The Cloudflare adapter keeps the shape the existing sync uses instead
// ({ id, type, name relative, value, mxPriority }), because it wraps that code
// unchanged; see lib/dns/cloudflare.js.
//
//   createZone(opts)            create the zone on the provider
//   deleteZone()                remove the zone
//   getZone()                   zone metadata (null when it does not exist)
//   listRecords()               every record currently served
//   createRecord(rec)           add a record (an RRset for PowerDNS)
//   updateRecord(rec)           replace a record / RRset
//   deleteRecord(rec)           remove a record / RRset
//   syncZone(plan)              apply a diff from lib/dns/diff.js
//   verifyZone(desired, resolve) compare what a resolver answers with desired
//   healthCheck()               { ok, detail } for the API itself
export const PROVIDER_METHODS = [
  'createZone', 'deleteZone', 'getZone', 'listRecords', 'createRecord',
  'updateRecord', 'deleteRecord', 'syncZone', 'verifyZone', 'healthCheck',
];

export function assertProvider(provider) {
  const missing = PROVIDER_METHODS.filter((m) => typeof provider?.[m] !== 'function');
  if (missing.length) throw new Error(`DNS provider is missing: ${missing.join(', ')}`);
  return provider;
}
