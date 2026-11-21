// One snapshot of the registry for every page that counts it.
//
// The homepage readout, the homepage map and /stats used to read `domains/`
// off the deployed bundle, so they showed the registry as it stood at the
// last deploy. Claims are data commits and data commits do not deploy (see
// .github/workflows/deploy.yml), so the figures drifted from the registry by
// every claim since the last scheduled build, and drifted from each other
// whenever the pages were built at different times: the homepage was
// re-read per lambda, /stats was baked at build time.
//
// The registry on GitHub is the single source of truth. This module reads
// all of `domains/` from it in ONE GraphQL request, pinned to one commit so
// the listing and the file contents can never disagree, and hands every page
// the same object. When GitHub cannot be read, it falls back to the copy of
// `domains/` that shipped with the deploy and says so (`source: 'bundle'`),
// rather than serving an empty or half-read registry as the truth.
//
// Counting rules, written down once:
//   claims  = every domains/<name>.json file at the snapshot commit. A file
//             is a claim; there is no pending or soft-deleted state on disk
//             (a release deletes the file, a pending pull request has no file
//             on the default branch yet).
//   owners  = distinct owner.github logins, case-insensitive.
//   invalid = files that are not parseable JSON or whose name does not match
//             the file name. They still count as claims (the name is taken
//             either way, validate.yml refuses a second claim on it) and are
//             listed so a reconciliation can find them.
//
// Pure apart from the injected fetch and fs reads, so the decisions are
// testable without Next or the network.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_SLUG } from './repo.js';

export const REGISTRY_TAG = 'registry';
const GRAPHQL = 'https://api.github.com/graphql';

// A live read that comes back much smaller than the bundled copy is far more
// likely a partial or broken response than half the registry having been
// released since the deploy. Releases are rare and one at a time.
const SHRINK_GUARD = 0.9;

const QUERY = `query($owner: String!, $name: String!, $ref: String!) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) {
      target {
        ... on Commit {
          oid
          committedDate
          file(path: "domains") {
            object {
              ... on Tree {
                entries { name type object { ... on Blob { text isTruncated } } }
              }
            }
          }
        }
      }
    }
  }
}`;

// Parse a list of { file, text } into records plus diagnostics. Never throws:
// a bad file is reported, not allowed to take the whole page down.
export function parseEntries(entries) {
  const records = [];
  const invalid = [];
  for (const { file, text } of entries) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -'.json'.length);
    if (typeof text !== 'string') {
      invalid.push({ name, reason: 'unreadable' });
      records.push({ name, owner: { github: '' }, claimedAt: null, records: {} });
      continue;
    }
    try {
      const record = JSON.parse(text);
      if (record?.name !== name) invalid.push({ name, reason: 'name-mismatch' });
      records.push(record);
    } catch {
      invalid.push({ name, reason: 'bad-json' });
      records.push({ name, owner: { github: '' }, claimedAt: null, records: {} });
    }
  }
  records.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { records, invalid };
}

export function snapshotFrom({ entries, source, commit = null, committedAt = null, fetchedAt = new Date() }) {
  const { records, invalid } = parseEntries(entries);
  const owners = new Set(
    records.map((r) => r?.owner?.github).filter((g) => typeof g === 'string' && g).map((g) => g.toLowerCase()),
  );
  return {
    source,
    commit,
    // The registry's own time: the commit the numbers were counted at. This is
    // what "last updated" means to a visitor, not when the page happened to
    // render.
    asOf: committedAt,
    fetchedAt: fetchedAt.toISOString(),
    claims: records.length,
    owners: owners.size,
    invalid,
    records,
  };
}

export function readBundledEntries(dir = join(process.cwd(), 'domains')) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      try {
        return { file, text: readFileSync(join(dir, file), 'utf8') };
      } catch {
        return { file, text: null };
      }
    });
}

export async function fetchLiveEntries({ token, fetchImpl = fetch, repo = REPO_SLUG, branch = 'main' } = {}) {
  if (!token) throw Object.assign(new Error('no registry token'), { code: 'no-token' });
  const [owner, name] = repo.split('/');
  const res = await fetchImpl(GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { owner, name, ref: `refs/heads/${branch}` } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Object.assign(new Error(`graphql ${res.status}`), { code: 'http', status: res.status });
  const body = await res.json();
  if (body.errors?.length) throw Object.assign(new Error(`graphql: ${body.errors[0].message}`), { code: 'graphql' });
  const commit = body.data?.repository?.ref?.target;
  const tree = commit?.file?.object?.entries;
  if (!commit?.oid || !Array.isArray(tree)) throw Object.assign(new Error('graphql: no domains tree'), { code: 'shape' });
  const entries = tree
    .filter((e) => e.type === 'blob')
    .map((e) => ({ file: e.name, text: e.object?.isTruncated ? null : e.object?.text ?? null }));
  return { entries, commit: commit.oid, committedAt: commit.committedDate };
}

// Decide which snapshot is the truth for this render, and log why when it is
// not the live one. `log` is injectable so tests can assert on the reason.
export async function loadRegistrySnapshot({
  token,
  fetchImpl = fetch,
  bundled = () => readBundledEntries(),
  now = () => new Date(),
  log = (msg) => console.warn(msg),
} = {}) {
  let fallback = null;
  const bundle = () => {
    if (!fallback) {
      try {
        fallback = snapshotFrom({ entries: bundled(), source: 'bundle', fetchedAt: now() });
      } catch (err) {
        log(`registry-snapshot: bundled domains/ unreadable: ${err.message}`);
        fallback = snapshotFrom({ entries: [], source: 'empty', fetchedAt: now() });
      }
    }
    return fallback;
  };

  let live;
  try {
    const got = await fetchLiveEntries({ token, fetchImpl });
    live = snapshotFrom({ ...got, source: 'github', fetchedAt: now() });
  } catch (err) {
    if (err.code !== 'no-token') log(`registry-snapshot: live read failed (${err.message}); serving the deployed copy`);
    return { ...bundle(), stale: true };
  }

  const base = bundle();
  if (base.claims > 0 && live.claims < base.claims * SHRINK_GUARD) {
    log(`registry-snapshot: live read has ${live.claims} claims against ${base.claims} deployed; treating it as partial`);
    return { ...base, stale: true };
  }
  if (live.invalid.length) {
    log(`registry-snapshot: ${live.invalid.length} unparseable claim file(s): ${live.invalid.map((i) => `${i.name}(${i.reason})`).join(' ')}`);
  }
  return { ...live, stale: false };
}
