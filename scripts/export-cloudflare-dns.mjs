// Read-only export of every DNS record in the Cloudflare zone, for the
// PowerDNS migration baseline. Walks all pages of /dns_records (every type),
// and writes:
//
//   <out>/cloudflare-dns-export.json   full records, ordered by name/type/content
//   <out>/cloudflare-dns-summary.json  counts by type and proxied flag, zone serial
//   <out>/SHA256SUMS                   checksums of both files
//
// Only GET requests are made: this script never creates, edits or deletes a
// record. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID (the same secrets
// sync-dns.yml uses); the token is only ever sent in the Authorization header.
//
//   node scripts/export-cloudflare-dns.mjs [out-dir] [--quiet]
//
// Record contents are never printed. --quiet also suppresses the counts summary
// (used in CI, where the sanitized report comes from reconcile-cloudflare.mjs).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE = process.env.CLOUDFLARE_ZONE_ID;
const ARGS = process.argv.slice(2);
const OUT = ARGS.find((a) => !a.startsWith('--')) || 'migration/backup/cloudflare';
const QUIET = ARGS.includes('--quiet');
const PER_PAGE = 100;

if (!TOKEN || !ZONE) {
  console.error('export-cloudflare-dns: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required');
  process.exit(2);
}
if (!/^[0-9a-f]{32}$/i.test(ZONE)) {
  console.error('export-cloudflare-dns: CLOUDFLARE_ZONE_ID is not a zone id');
  process.exit(2);
}

// Errors raised here carry only paths, status codes and counts. Anything else
// (network or parse errors) is reported by its class name alone, so no
// response body, record value or token can reach the Actions log.
function safe(message) {
  const e = new Error(message);
  e.safe = true;
  return e;
}
function fail(err) {
  console.error(`export-cloudflare-dns: ${err?.safe ? err.message : `failed (${err?.name ?? 'Error'})`}`);
  process.exit(1);
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

async function get(path) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE}${path}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.ok) {
      // Never echo a parse error: its message can quote the response body.
      try {
        return await res.json();
      } catch {
        throw safe('response was not valid JSON');
      }
    }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw safe(`GET ${path.split('?')[0] || '/'}: HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

const zone = (await get('')).result;
const records = [];
let totalPages = 1;
for (let page = 1; page <= totalPages; page++) {
  const body = await get(`/dns_records?per_page=${PER_PAGE}&page=${page}`);
  records.push(...body.result);
  totalPages = body.result_info?.total_pages ?? 1;
  const total = body.result_info?.total_count;
  if (page === totalPages && typeof total === 'number' && records.length !== total) {
    throw safe(`pagination mismatch: fetched ${records.length}, API reports ${total}`);
  }
}

// Keep what a migration needs; drop account metadata.
const normalized = records
  .map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    content: r.content,
    ttl: r.ttl,
    proxied: Boolean(r.proxied),
    ...(r.priority !== undefined ? { priority: r.priority } : {}),
    ...(r.data ? { data: r.data } : {}),
    comment: r.comment ?? null,
    created_on: r.created_on,
    modified_on: r.modified_on,
  }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type) || String(a.content).localeCompare(String(b.content)));

const byType = {};
for (const r of normalized) byType[r.type] = (byType[r.type] ?? 0) + 1;
const summary = {
  zone: zone.name,
  status: zone.status,
  plan: zone.plan?.name ?? null,
  name_servers: zone.name_servers,
  exported_at: new Date().toISOString(),
  pages: totalPages,
  total: normalized.length,
  by_type: byType,
  proxied: normalized.filter((r) => r.proxied).length,
};

mkdirSync(OUT, { recursive: true });
const files = {
  'cloudflare-dns-export.json': JSON.stringify(normalized, null, 2) + '\n',
  'cloudflare-dns-summary.json': JSON.stringify(summary, null, 2) + '\n',
};
const sums = [];
for (const [name, text] of Object.entries(files)) {
  writeFileSync(join(OUT, name), text);
  sums.push(`${createHash('sha256').update(text).digest('hex')}  ${name}`);
}
writeFileSync(join(OUT, 'SHA256SUMS'), sums.join('\n') + '\n');
if (!QUIET) console.log(JSON.stringify(summary, null, 2));
else console.log(`exported ${summary.total} records over ${summary.pages} page(s)`);
