import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { planBackfill, serializeEntitlement } from '../lib/entitlements.js';

// One-time: give every account that already owns names an authoritative
// entitlements/<login>.json (1 included, 0 granted, the names it owns now).
//
//   node scripts/backfill-entitlements.mjs [--root <checkout>] [--write]
//
// Without --write it only prints the plan. With --write it creates the missing
// files in that checkout and nothing else: domains/ and owners/ are never
// written, and an entitlement file that already exists is never touched.
// Run it against a fresh checkout of main and commit the result; if the push
// is refused because main moved, pull and run it again -- it is idempotent,
// and a file created meanwhile by the site is simply kept.
const args = process.argv.slice(2);
const root = path.resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : path.join(import.meta.dirname, '..'));
const write = args.includes('--write');

async function readJsonDir(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return Promise.all(files.map(async (file) => ({ file, record: JSON.parse(await readFile(path.join(dir, file), 'utf8')) })));
}

const records = await readJsonDir(path.join(root, 'domains'));
const existing = new Map(
  (await readJsonDir(path.join(root, 'entitlements'))).map(({ file, record }) => [file.replace(/\.json$/, ''), record]),
);
const plan = planBackfill(records, existing);

console.log(`domain records: ${records.length}`);
console.log(`owners: ${plan.create.length + plan.kept.length}`);
console.log(`entitlement files to create: ${plan.create.length}`);
console.log(`existing entitlement files kept unchanged: ${plan.kept.length}`);
for (const { login, missing } of plan.kept) {
  if (missing.length) console.log(`  kept ${login}: does not list ${missing.join(', ')}`);
}
if (plan.skipped.length) console.log(`skipped (no valid owner or name): ${plan.skipped.join(', ')}`);

if (write) {
  await mkdir(path.join(root, 'entitlements'), { recursive: true });
  for (const { path: file, entitlement } of plan.create) {
    // 'wx' refuses to replace a file, so a racing creation is never clobbered.
    await writeFile(path.join(root, file), serializeEntitlement(entitlement), { flag: 'wx' });
  }
  console.log(`wrote ${plan.create.length} file(s) under ${path.join(root, 'entitlements')}`);
} else {
  console.log('dry run: nothing written (pass --write to create the files)');
}
