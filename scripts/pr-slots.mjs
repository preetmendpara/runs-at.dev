import { API, headers } from '../lib/registry.js';
import { validateName } from '../lib/name.js';
import { reservePullRequestSlot, closePullRequestSlot } from '../lib/entitlements.js';

// Keeps a pull request's slot in entitlements/<author>.json in step with the
// pull request (see .github/workflows/pr-slots.yml):
//
//   opened / synchronize / reopened  reserve the slot for the name it adds
//   closed, merged                   confirm it (the domain file now exists)
//   closed, not merged               hand it back
//
// Runs trusted base-branch code only. The pull request's own files are read
// as data over the API and never executed.
const { GITHUB_TOKEN: TOKEN, REGISTRY_REPO: REPO, PR, ACTION, MERGED, AUTHOR, HEAD_SHA } = process.env;
for (const [key, value] of Object.entries({ GITHUB_TOKEN: TOKEN, REGISTRY_REPO: REPO, PR, ACTION, AUTHOR, HEAD_SHA })) {
  if (!value) {
    console.error(`pr-slots: missing ${key}`);
    process.exit(1);
  }
}
const pr = Number(PR);
const opts = { token: TOKEN };

const api = async (path) => {
  const res = await fetch(`${API}/repos/${REPO}${path}`, { headers: headers(TOKEN) });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
};

// The name this pull request claims: exactly one added domains/<name>.json
// whose record names the author as owner. Anything else claims nothing here,
// and validate.yml reports what is wrong with it.
async function claimedName() {
  const files = await api(`/pulls/${pr}/files?per_page=2`);
  if (files.length !== 1 || files[0].status !== 'added') return null;
  const match = /^domains\/([a-z0-9-]+)\.json$/.exec(files[0].filename);
  if (!match || !validateName(match[1]).ok) return null;
  const body = await api(`/contents/${files[0].filename}?ref=${HEAD_SHA}`).catch(() => null);
  let record;
  try {
    record = JSON.parse(Buffer.from(body?.content ?? '', 'base64').toString('utf8'));
  } catch {
    return null;
  }
  return String(record?.owner?.github ?? '').toLowerCase() === AUTHOR.toLowerCase() ? match[1] : null;
}

const name = await claimedName();
let result;
if (ACTION === 'closed') {
  result = MERGED === 'true' && name
    ? await closePullRequestSlot(AUTHOR, name, pr, true, opts)
    : await closePullRequestSlot(AUTHOR, name ?? '', pr, false, opts);
} else if (name) {
  result = await reservePullRequestSlot(AUTHOR, name, pr, opts);
} else {
  // No longer (or never) a claim: release anything this pull request held.
  result = await closePullRequestSlot(AUTHOR, '', pr, false, opts);
}

console.log(`pr-slots: #${pr} ${ACTION}${ACTION === 'closed' ? ` (merged: ${MERGED})` : ''} name=${name ?? '-'} -> ${JSON.stringify({ ok: result.ok, reason: result.reason, reserved: result.reserved, unchanged: result.unchanged })}`);
// A refusal (every slot held) is an answer, not a failure: validate reports it.
if (!result.ok && result.reason !== 'limit_reached') process.exit(1);
