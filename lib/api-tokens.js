// Personal API tokens for the REST API (/api/v1). Same construction as the
// deploy tokens in tokens.js -- an HMAC-signed, stateless payload -- with its
// own prefix and scope so a deploy token can never be replayed here and the
// other way round.
//
// Revocation: a token carries `iat`. "Revoke all my tokens" stores a
// not-before time for the login; any token issued before it is refused. That
// is the only state the API keeps, and it fails closed: if the store cannot
// be read, the request is refused rather than let through.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const API_TOKEN_PREFIX = 'rat1';
export const API_TOKEN_SCOPE = 'dns';
export const API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const sign = (body, secret) => createHmac('sha256', secret).update(`${API_TOKEN_PREFIX}.${body}`).digest('base64url');

// `actor` is the session at mint time. createdAt and publicRepos ride along
// because the delegation gate (lib/delegation.js) needs them.
export function signApiToken(actor, secret, { now = Date.now() } = {}) {
  const payload = {
    login: actor.login,
    id: actor.id,
    createdAt: actor.createdAt,
    publicRepos: actor.publicRepos,
    scope: API_TOKEN_SCOPE,
    iat: now,
    exp: now + API_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${API_TOKEN_PREFIX}.${body}.${sign(body, secret)}`, payload };
}

export function readApiToken(raw, secret, { now = Date.now() } = {}) {
  if (typeof raw !== 'string' || !secret) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== API_TOKEN_PREFIX) return null;
  const [, body, provided] = parts;
  const a = Buffer.from(provided);
  const b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.scope !== API_TOKEN_SCOPE || typeof payload.login !== 'string') return null;
  if (!Number.isFinite(payload.exp) || !Number.isFinite(payload.iat) || now >= payload.exp) return null;
  return payload;
}

export function bearer(request) {
  const header = request.headers.get('authorization') ?? '';
  return header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

// ── Revocation store (Vercel Blob) ────────────────────────────────────────
// One small JSON per login: { notBefore }. Not secret, so the blob being
// public-readable leaks nothing but "this login once revoked tokens".
const revokedPath = (login) => `api-tokens/revoked/${login.toLowerCase()}.json`;
const cache = new Map();
const CACHE_MS = 30_000;

export async function readNotBefore(login, { now = Date.now(), loader } = {}) {
  const hit = cache.get(login.toLowerCase());
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const load = loader ?? (async (l) => {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: revokedPath(l), limit: 1 });
    if (!blobs.length) return 0;
    const res = await fetch(blobs[0].url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`revocation read ${res.status}`);
    return Number((await res.json()).notBefore) || 0;
  });
  const value = await load(login);
  cache.set(login.toLowerCase(), { at: now, value });
  return value;
}

export async function revokeAll(login, { now = Date.now(), writer } = {}) {
  const write = writer ?? (async (l, body) => {
    const { put } = await import('@vercel/blob');
    await put(revokedPath(l), body, { access: 'public', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
  });
  await write(login, JSON.stringify({ notBefore: now }));
  cache.set(login.toLowerCase(), { at: now, value: now });
  return now;
}

// The whole authentication step for an API request. Returns
// { actor } or { status, body } to answer with.
export async function authenticate(request, { secret = process.env.API_TOKEN_SECRET, now = Date.now(), loader } = {}) {
  if (!secret) return { status: 503, body: { error: 'not_configured' } };
  const raw = bearer(request);
  if (!raw) return { status: 401, body: { error: 'token_required', hint: 'Send Authorization: Bearer rat1.… (create one at https://runs-at.dev/manage).' } };
  const actor = readApiToken(raw, secret, { now });
  if (!actor) return { status: 401, body: { error: 'invalid_token' } };
  let notBefore;
  try {
    notBefore = await readNotBefore(actor.login, { now, loader });
  } catch {
    return { status: 503, body: { error: 'busy', retryInMs: 4000 } };
  }
  if (actor.iat < notBefore) return { status: 401, body: { error: 'token_revoked' } };
  return { actor };
}
