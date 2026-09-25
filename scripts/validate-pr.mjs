import path from 'node:path';
import {
  validateChangeset,
  RecordParseError,
  readRecordAt,
  countOwnedNames,
  localDomainSource,
} from '../lib/pr.js';
import { localEntitlementSource } from '../lib/entitlements.js';

const REPO = process.env.GITHUB_REPOSITORY;
const PR = process.env.PR_NUMBER;
const TOKEN = process.env.GITHUB_TOKEN;
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;
// Checkout of the registry at BASE_SHA (see validate.yml). Required, not
// defaulted: falling back to this script's own checkout would count against
// the moving branch tip instead of the PR's base, and do it silently.
const REGISTRY_CHECKOUT = process.env.REGISTRY_CHECKOUT;

const REQUIRED = { GITHUB_REPOSITORY: REPO, PR_NUMBER: PR, GITHUB_TOKEN: TOKEN, BASE_SHA, HEAD_SHA, REGISTRY_CHECKOUT };
const missing = Object.entries(REQUIRED)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(`validate-pr: missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const api = (path) =>
  fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

// Thin wrappers around the lib functions, providing only the real GitHub
// API fetcher. The counting and parsing logic lives in lib/pr.js where it
// can be tested without env vars (issue #84).
const readAt = (path, ref) => readRecordAt(path, ref, { api: (p) => api(`/repos/${REPO}${p}`) });

// Eligibility is read from the PR author's public GitHub profile, the same two
// fields the session carries into evaluateClaim on the website. Throwing rather
// than returning null on a transport failure matters: validateChangeset treats a
// throw as "could not check" and fails the PR closed.
async function getUser(login) {
  const res = await api(`/users/${encodeURIComponent(login)}`);
  if (!res.ok) throw new Error(`GET /users/${login} -> ${res.status}`);
  const u = await res.json();
  return { created_at: u.created_at, public_repos: u.public_repos };
}

// Owned names are counted from REGISTRY_CHECKOUT, the registry as of the PR's
// base commit. No directory listing and no per-record request goes to the
// API, so the count has no 1,000-entry cap and costs nothing against the
// token's rate limit.
const countOwned = (login) => countOwnedNames(login, localDomainSource(path.resolve(REGISTRY_CHECKOUT)));
// The allowance (one included name plus admin-granted slots) from the same
// checkout, entitlements/<login>.json at BASE_SHA.
const getEntitlement = localEntitlementSource(path.resolve(REGISTRY_CHECKOUT));

const prRes = await api(`/repos/${REPO}/pulls/${PR}`);
if (!prRes.ok) {
  console.error(`validate-pr: failed to fetch PR #${PR} from ${REPO}: ${prRes.status} ${prRes.statusText}`);
  process.exit(1);
}
const { user } = await prRes.json();

const filesRes = await api(`/repos/${REPO}/pulls/${PR}/files`);
if (!filesRes.ok) {
  console.error(`validate-pr: failed to fetch changed files for PR #${PR}: ${filesRes.status} ${filesRes.statusText}`);
  process.exit(1);
}
const files = await filesRes.json();

// A RecordParseError is a finding about the pull request, not a crash, so it
// is reported through the same channel as every other finding below. Anything
// else escaping validateChangeset is genuinely unexpected and still fails
// loudly with its stack, which is what a maintainer needs to debug it.
let result;
try {
  result = await validateChangeset({
    files: files.map((f) => ({
      filename: f.filename,
      status: f.status,
      previous_filename: f.previous_filename,
    })),
    prAuthor: user.login,
    readFile: (p) => readAt(p, HEAD_SHA),
    readBase: (p) => readAt(p, BASE_SHA),
    getUser,
    countOwnedNames: countOwned,
    getEntitlement,
    // A new name must already hold a slot reserved by this pull request.
    prNumber: Number(PR),
  });
} catch (err) {
  if (!(err instanceof RecordParseError)) throw err;
  console.error('Registry validation failed:');
  console.error(`  - ${err.message}`);
  process.exit(1);
}

if (!result.ok) {
  console.error('Registry validation failed:');
  for (const err of result.errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('Registry validation passed.');
