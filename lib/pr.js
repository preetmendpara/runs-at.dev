import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateName } from './name.js';
import { validateRecord } from './schema.js';
import { isReserved } from './blocklist.js';
import { checkEligibility } from './eligibility.js';
import { withinNameLimit } from './claim.js';
import { totalAllowed } from './entitlements.js';
import { sameLogin, validateEdit } from './edit.js';

const DOMAIN_FILE = /^domains\/([a-z0-9-]+)\.json$/;

// Raised when a record file cannot be parsed at all, so the caller can tell a
// contributor's stray brace apart from an internal fault and report it as the
// review finding it is.
export class RecordParseError extends Error {
  constructor(path, cause) {
    super(`${path} is not valid JSON: ${cause.message}`);
    this.name = 'RecordParseError';
    this.path = path;
    this.cause = cause;
  }
}

// Hand-editing the JSON is the documented way to change a record, so a stray
// brace is a routine contributor mistake rather than a broken pipeline. Left
// as a bare JSON.parse it throws out of the whole validation run, replacing
// the list of findings with a Node stack trace -- which is precisely the
// state that leaves someone unable to see what is wrong with their own pull
// request. Parsing through here turns it back into a reportable error.
export function parseRecordFile(path, text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new RecordParseError(path, err);
  }
}

// Read a record file at a specific git ref. The API call is injected so the
// function is testable without env vars or network access — the script
// provides the real GitHub fetcher, tests provide a stub (issue #84).
export async function readRecordAt(path, ref, { api }) {
  // Path is relative to the repo: the injected `api` already carries the
  // `/repos/{owner}/{repo}` prefix. Emitting `/repos/...` here too produced
  // `/repos/{owner}/{repo}/repos/contents/...`, which 404s — and since a
  // failed read returns null, validateChangeset reported every record PR as
  // "could not read the changed file" and failed it closed.
  const res = await api(`/contents/${path}?ref=${ref}`);
  if (!res.ok) return null;
  const body = await res.json();
  return parseRecordFile(path, Buffer.from(body.content, 'base64').toString('utf8'));
}

// Counted from domains/ itself rather than the owners/ index, because domains/
// is the registry — the index is derived data rebuilt after merge by
// sync-owners, and a stale or missing index must never read as "owns nothing"
// and hand out a second name.
//
// The API call and the record parser are injected so the counting logic is
// testable without env vars or network access. The `path`/`ReferenceError`
// bug in #81 silently rejected every new claim for days; it would have been
// caught by any test at all, but this function couldn't be imported to test
// it (issue #84).
export async function countOwnedNames(login, { listDomainEntries, readRecord }) {
  const entries = await listDomainEntries();
  const records = entries.filter((e) => e.type === 'file' && e.name.endsWith('.json'));

  const target = login.toLowerCase();
  let owned = 0;

  // Modest concurrency: enough to keep a few hundred records quick, low enough
  // not to trip secondary rate limits on a shared Actions IP.
  const BATCH = 10;
  for (let i = 0; i < records.length; i += BATCH) {
    const slice = records.slice(i, i + BATCH);
    const parsed = await Promise.all(slice.map((entry) => readRecord(`domains/${entry.name}`)));
    for (const rec of parsed) {
      if (String(rec?.owner?.github ?? '').toLowerCase() === target) owned += 1;
    }
  }

  return owned;
}

// The registry source CI counts from: a checkout on disk, not the GitHub API.
// The validate workflow checks out the pull request's exact base commit, so
// reading domains/ from that checkout sees the same records the API read at
// BASE_SHA did -- with two differences that matter at scale:
//
//   - no listing cap. The Contents API returns at most 1,000 entries for a
//     directory; past that, owned names were silently missed and the
//     one-name rule stopped holding for pull-request claims.
//   - no request per record. Reading every record over the API cost one
//     request each, and at ~1,000 names one validation spent the Actions
//     token's whole hourly allowance.
//
// root is the checkout directory; entries keep the Contents API's shape
// ({ type, name }) so countOwnedNames is unchanged.
export function localDomainSource(root) {
  const dir = join(root, 'domains');
  return {
    listDomainEntries: async () =>
      (await readdir(dir, { withFileTypes: true })).map((d) => ({ type: d.isFile() ? 'file' : 'dir', name: d.name })),
    readRecord: async (filePath) => parseRecordFile(filePath, await readFile(join(root, filePath), 'utf8')),
  };
}
// The five gates /api/claim applies through evaluateClaim, re-applied here.
// A pull request is now a first-class way to claim a name, which means this
// branch is a second front door onto the same registry — if it checks any
// fewer of them, the way to bypass a gate is simply to open a PR instead of
// using the site. Kept in the same order as evaluateClaim so the two read
// side by side.
async function validateNewClaim({ head, name, prAuthor, getUser, countOwnedNames, getEntitlement, prNumber, now }) {
  const errors = [];

  // A record is owned by whoever the file says owns it, so a PR may only
  // introduce one naming its own author. Without this, anyone could open a
  // PR claiming a name on behalf of another account and burn that account's
  // one-name allowance.
  if (!sameLogin(head.owner?.github, prAuthor)) {
    errors.push(`a claim must name its own author as owner (@${prAuthor})`);
    // Every remaining gate is scoped to the author, so checking them against
    // a record that claims to be someone else's would report nonsense.
    return errors;
  }

  const reserved = isReserved(name);
  if (reserved.reserved) {
    errors.push(`${name} is reserved (${reserved.list})`);
  }

  // claimedAt is the moment the name was taken. A future timestamp is either
  // a mistake or an attempt to win a tie-break against a later claim.
  const claimedAt = Date.parse(head.claimedAt);
  if (!Number.isNaN(claimedAt) && claimedAt > now.getTime() + 60_000) {
    errors.push('claimedAt cannot be in the future');
  }

  // Both lookups fail closed. An unavailable GitHub API or a rate limit must
  // never read as "eligible" or "owns nothing" — load is exactly when a land
  // grab happens, which is the same reasoning /api/claim uses when it answers
  // busy rather than letting an uncounted claim through.
  let user;
  try {
    user = await getUser(prAuthor);
  } catch {
    return [...errors, 'could not check account eligibility, try re-running this check'];
  }
  if (!user) {
    return [...errors, 'could not check account eligibility, try re-running this check'];
  }

  const eligible = checkEligibility(user, now);
  if (!eligible.ok) {
    errors.push(eligible.reason === 'age'
      ? 'account must be at least 30 days old to claim a name'
      : 'account must have at least one public repository to claim a name');
  }

  // The allowance comes from the same base checkout as the count, read by the
  // same rule /api/claim uses: one included name plus any admin-granted slots.
  let owned;
  let allowed;
  let entitlement;
  try {
    entitlement = await getEntitlement(prAuthor);
    // Slots held in the entitlement record count too: a website claim that has
    // reserved a slot but not yet written its file is invisible on disk. This
    // pull request's own reservation is not one of the others.
    const others = (entitlement.names ?? []).filter((n) => n !== name);
    owned = Math.max(await countOwnedNames(prAuthor), others.length);
    allowed = totalAllowed(entitlement);
  } catch {
    return [...errors, 'could not check how many names you already own, try re-running this check'];
  }
  if (!Number.isInteger(owned) || !Number.isInteger(allowed)) {
    return [...errors, 'could not check how many names you already own, try re-running this check'];
  }

  if (!withinNameLimit(prAuthor, name, owned, allowed)) {
    errors.push(`domain limit reached: @${prAuthor} already owns ${owned} of ${allowed} allowed`);
  }

  // The slot must already be taken in the authoritative record on main, by the
  // pr-slots workflow. Then the website counts this name from before the merge
  // onward, and no website claim can slip in between the merge and the record
  // catching up. A missing reservation is either still being written (this
  // check re-runs once it lands) or was refused because every slot is held.
  if (prNumber !== undefined && entitlement.pullRequests?.[name] !== prNumber) {
    errors.push(`no slot is reserved for ${name} by pull request #${prNumber} yet; the pr-slots check reserves it, and this check re-runs when it does`);
  }

  return errors;
}

export async function validateChangeset({
  files,
  prAuthor,
  readFile,
  readBase,
  getUser,
  countOwnedNames,
  getEntitlement,
  prNumber,
  now = new Date(),
}) {
  const errors = [];

  if (!Array.isArray(files) || files.length !== 1) {
    return { ok: false, errors: ['a pull request must change exactly one file'] };
  }

  const [file] = files;

  // A rename arrives as ONE file entry carrying only the new path, so without this the
  // changeset falls into the new-record branch and never checks who owned the old file.
  // That lets anyone rename someone else's record into a name they own, deleting the
  // victim's registration with no ownership check at all.
  if (file.status === 'renamed' || file.previous_filename) {
    return { ok: false, errors: ['renaming a record is not allowed'] };
  }

  const match = DOMAIN_FILE.exec(file.filename);
  if (!match) {
    return { ok: false, errors: [`only domains/<name>.json may be changed, got ${file.filename}`] };
  }

  const nameFromPath = match[1];
  const base = await readBase(file.filename);

  // POLICY.md promises phishing/malware names get pulled without notice, which
  // requires an owner (or a maintainer) to be able to release a name by PR. The
  // head file no longer exists once removed, so this must branch before readFile.
  if (file.status === 'removed') {
    if (!base) return { ok: false, errors: ['could not read the record being removed'] };
    if (!sameLogin(base.owner?.github, prAuthor)) {
      errors.push(`only the owner (@${base.owner?.github}) may remove this record`);
    }
    return { ok: errors.length === 0, errors };
  }

  const head = await readFile(file.filename);
  if (!head) return { ok: false, errors: ['could not read the changed file'] };

  if (!validateName(nameFromPath).ok) errors.push('filename fails the name grammar');
  if (head.name !== nameFromPath) errors.push('filename must match the record name');

  // Changing an existing record is the same operation the site's editor
  // performs, so it is gated by the same shared validator rather than a
  // second copy of the rules here. validateEdit runs the schema check for
  // this branch; the new-claim branch runs its own, so every path validates
  // the record exactly once.
  if (base) {
    errors.push(...validateEdit({ base, head, editor: prAuthor }).errors);
  } else {
    const schema = validateRecord(head);
    if (!schema.ok) errors.push(...schema.errors);

    errors.push(...await validateNewClaim({
      head,
      name: nameFromPath,
      prAuthor,
      getUser,
      countOwnedNames,
      getEntitlement,
      prNumber,
      now,
    }));
  }

  return { ok: errors.length === 0, errors };
}
