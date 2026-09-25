import { API, REPO, headers, getContentsMeta, onBranch } from './registry.js';

// GitHub logins are case-insensitive but the contents API path is
// case-sensitive, so index filenames use the login lowercased. Validate
// strictly after lowercasing so a hostile login string (e.g. containing
// `../`) can't escape the `owners/` prefix.
const LOGIN_SHAPE = /^[a-z0-9-]{1,39}$/;

function pathFor(login) {
  const lower = login.toLowerCase();
  if (!LOGIN_SHAPE.test(lower)) {
    throw new Error(`invalid owner login: ${login}`);
  }
  return `owners/${lower}.json`;
}

// Returns the parsed contents of owners/<login>.json, or null if absent. The
// file's `sha` (needed by putOwnerIndex to update rather than create) is
// attached as a non-enumerable property so it rides along without showing up
// in equality checks or JSON.stringify of the returned index.
export async function getOwnerIndex(login, opts = {}) {
  const meta = await getContentsMeta(pathFor(login), opts);
  if (!meta) return null;
  Object.defineProperty(meta.data, 'sha', { value: meta.sha, enumerable: false });
  return meta.data;
}

export async function putOwnerIndex(login, names, { token, fetchImpl = fetch, sha } = {}) {
  const path = pathFor(login);
  const record = { github: login.toLowerCase(), names };

  const payload = {
    message: `index: ${login} owns ${names.length} name${names.length === 1 ? '' : 's'}`,
    content: Buffer.from(`${JSON.stringify(record, null, 2)}\n`).toString('base64'),
  };
  if (sha) payload.sha = sha;

  const res = await fetchImpl(`${API}/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(onBranch(payload)),
  });

  if (res.status === 403 || res.status === 429) return { ok: false, reason: 'ratelimited' };
  // The sha no longer matches (409), or a create found the file already there
  // (422): someone else wrote the index since it was read.
  if (res.status === 409 || res.status === 422) return { ok: false, reason: 'stale' };
  if (!res.ok) return { ok: false, reason: 'error' };
  return { ok: true };
}

// Read-modify-write of one account's index, as a compare-and-swap on its sha.
// `change` gets the names as read and returns the new list, or null to leave
// the index alone (`{ ok: false, reason: 'refused' }`). A write that lost a
// race comes back 'stale' and is retried against a fresh read, so two requests
// for the same account are applied one after the other, never over each other.
// This is what makes the per-account limit hold under concurrent claims.
export async function updateOwnerIndex(login, change, { token, fetchImpl = fetch, attempts = 4 } = {}) {
  let last = 'stale';
  for (let i = 0; i < attempts; i++) {
    let index;
    try {
      index = await getOwnerIndex(login, { token, fetchImpl });
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    const before = Array.isArray(index?.names) ? index.names : [];
    const names = change(before);
    if (!names) return { ok: false, reason: 'refused', names: before };
    const result = await putOwnerIndex(login, names, { token, fetchImpl, sha: index?.sha });
    if (result.ok) return { ok: true, names, before };
    last = result.reason;
    if (last !== 'stale') break;
  }
  return { ok: false, reason: last };
}
