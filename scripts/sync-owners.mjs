import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';

// owners/<login>.json is derived data: the answer to "how many names does this
// account hold", cached so the website's claim path can check the per-account
// limit in one request instead of scanning the whole registry. domains/ is the
// registry itself, so this rebuilds the index from it rather than trying to keep
// the two in step incrementally — a claim that lands by pull request never goes
// through /api/claim and so never runs putOwnerIndex, and an index that silently
// undercounts hands the account a second name it should not get.
const ROOT = path.resolve(import.meta.dirname, '..');
const DOMAINS = path.join(ROOT, 'domains');
const OWNERS = path.join(ROOT, 'owners');

const LOGIN_SHAPE = /^[a-z0-9-]{1,39}$/;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

const domainFiles = (await readdir(DOMAINS)).filter((f) => f.endsWith('.json'));

// login (lowercased, as the index filenames are) -> names held
const byOwner = new Map();

for (const file of domainFiles) {
  const record = await readJson(path.join(DOMAINS, file));
  const login = record?.owner?.github;
  if (typeof login !== 'string' || !login) {
    console.warn(`skipping domains/${file}: no owner.github`);
    continue;
  }
  const key = login.toLowerCase();
  if (!LOGIN_SHAPE.test(key)) {
    console.warn(`skipping domains/${file}: owner.github is not a valid login (${login})`);
    continue;
  }
  if (!byOwner.has(key)) byOwner.set(key, []);
  byOwner.get(key).push(record.name ?? path.basename(file, '.json'));
}

await mkdir(OWNERS, { recursive: true });
const existing = new Set((await readdir(OWNERS)).filter((f) => f.endsWith('.json')));

let written = 0;
let removed = 0;

for (const [login, names] of byOwner) {
  names.sort();
  const body = `${JSON.stringify({ github: login, names }, null, 2)}\n`;
  const file = path.join(OWNERS, `${login}.json`);

  // Only write when the content actually differs, so a run that changes nothing
  // leaves the tree clean and the workflow skips its commit entirely.
  let current = null;
  try {
    current = await readFile(file, 'utf8');
  } catch {
    // absent, so it needs writing
  }
  if (current !== body) {
    await writeFile(file, body);
    written += 1;
    console.log(`owners/${login}.json -> ${names.length} name${names.length === 1 ? '' : 's'}`);
  }
  existing.delete(`${login}.json`);
}

// Whatever is left held no names in domains/ — the record was removed or
// released, so the index entry goes too rather than lingering as a phantom
// count that blocks the account from ever claiming again.
for (const stale of existing) {
  await unlink(path.join(OWNERS, stale));
  removed += 1;
  console.log(`owners/${stale} -> removed (owns nothing)`);
}

console.log(`sync-owners: ${byOwner.size} owner(s), ${written} written, ${removed} removed.`);
