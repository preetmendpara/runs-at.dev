// Compare a raw Cloudflare export (scripts/export-cloudflare-dns.mjs) with
// what the registry declares, and print a SANITIZED Markdown report: counts,
// mismatch totals and the SHA-256 of the whole export only. No record names, values or
// targets are printed, because the report is published to the job summary of
// a public repository while the raw export stays on the runner.
//
//   node scripts/reconcile-cloudflare.mjs <export-dir> [--registry domains]
//
// Exit codes: 0 report produced; 2 bad input.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadClaims, registryRecords, zoneVerificationRecords, canonical, sha256, DOMAIN } from './export-zone.mjs';

const SYSTEM_LABELS = new Set(['', 'www', '*', '_vercel']);

// Cloudflare record -> the {name,type,value,priority} shape canonical() takes.
export function fromCloudflare(r) {
  const suffix = `.${DOMAIN}`;
  const fq = String(r.name).toLowerCase();
  const name = fq === DOMAIN ? '' : fq.endsWith(suffix) ? fq.slice(0, -suffix.length) : null;
  if (name === null) return null; // outside the zone: ignore
  let value = String(r.content ?? '');
  if (r.type === 'TXT' && /^".*"$/s.test(value)) {
    // Cloudflare may return TXT content as one or more quoted strings.
    value = [...value.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join('');
  }
  return { name, type: r.type, value, ...(r.priority !== undefined ? { priority: r.priority } : {}) };
}

export function reconcile({ cloudflare, declared }) {
  const cf = new Map();
  let outOfZone = 0;
  for (const r of cloudflare) {
    const n = fromCloudflare(r);
    if (!n) { outOfZone++; continue; }
    cf.set(canonical(n), n);
  }
  const want = new Map(declared.map((r) => [canonical(r), r]));
  const matched = [...want.keys()].filter((k) => cf.has(k));
  const missing = [...want.keys()].filter((k) => !cf.has(k));
  const extra = [...cf.keys()].filter((k) => !want.has(k));
  const isSystem = (k) => SYSTEM_LABELS.has(cf.get(k).name);
  return {
    cloudflareTotal: cloudflare.length,
    cloudflareInZone: cf.size,
    outOfZone,
    declared: want.size,
    matched: matched.length,
    missingInCloudflare: missing.length,
    extraInCloudflare: extra.length,
    extraSystem: extra.filter(isSystem).length,
    extraOther: extra.filter((k) => !isSystem(k)).length,
    sha: {
      declared: sha256(want.keys()),
      cloudflare: sha256(cf.keys()),
      matched: sha256(matched),
    },
  };
}

function countBy(list, key) {
  const out = {};
  for (const x of list) out[x[key]] = (out[x[key]] ?? 0) + 1;
  return out;
}

async function main(argv) {
  const dir = argv[0];
  if (!dir) { console.error('usage: reconcile-cloudflare.mjs <export-dir>'); process.exit(2); }
  const i = argv.indexOf('--registry');
  const registryDir = i >= 0 ? argv[i + 1] : 'domains';
  const rawPath = join(dir, 'cloudflare-dns-export.json');
  const raw = readFileSync(rawPath, 'utf8');
  const cloudflare = JSON.parse(raw);
  const summary = JSON.parse(readFileSync(join(dir, 'cloudflare-dns-summary.json'), 'utf8'));
  const claims = await loadClaims(registryDir);
  const declared = [...registryRecords(claims), ...zoneVerificationRecords(claims)];
  const r = reconcile({ cloudflare, declared });

  const byType = countBy(cloudflare, 'type');
  const lines = [
    '## Cloudflare zone export — sanitized reconciliation',
    '',
    'Counts and checksums only. The raw export stayed on the runner and was deleted.',
    '',
    `| Item | Count |`,
    `|---|---|`,
    `| Registry claims | ${claims.length} |`,
    `| Records the registry declares (incl. \`_vercel\` mirror) | ${r.declared} |`,
    `| Cloudflare records (all pages) | ${r.cloudflareTotal} |`,
    `| Cloudflare pages read | ${summary.pages} |`,
    `| Proxied records | ${summary.proxied} |`,
    `| Declared and present in Cloudflare | ${r.matched} |`,
    `| Declared but missing from Cloudflare | ${r.missingInCloudflare} |`,
    `| In Cloudflare, not declared: system names (apex, www, wildcard, _vercel) | ${r.extraSystem} |`,
    `| In Cloudflare, not declared: other | ${r.extraOther} |`,
    `| Outside the zone | ${r.outOfZone} |`,
    '',
    `Cloudflare records by type: ${Object.entries(byType).sort().map(([t, n]) => `${t} ${n}`).join(', ')}`,
    '',
    `Whole-export SHA-256: \`${createHash('sha256').update(raw).digest('hex')}\``,
    '',
  ];
  console.log(lines.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Error class only: a JSON or file error message can quote export contents.
  main(process.argv.slice(2)).catch((err) => { console.error(`reconcile-cloudflare: failed (${err?.name ?? 'Error'})`); process.exit(2); });
}
