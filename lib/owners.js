import { API, REPO, headers, getContentsMeta } from './registry.js';

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
    body: JSON.stringify(payload),
  });

  if (res.status === 403 || res.status === 429) return { ok: false, reason: 'ratelimited' };
  if (!res.ok) return { ok: false, reason: 'error' };
  return { ok: true };
}
