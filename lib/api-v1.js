// Shared plumbing for the /api/v1 routes: auth, per-token rate limits, and
// one JSON response shape. Kept tiny on purpose; the rules for what a write
// may do live in record-update.js, not here.
import { authenticate } from './api-tokens.js';
import { createRateLimiter, rateLimitHeaders } from './throttle.js';

export const API_VERSION = 'v1';

const BASE = { 'cache-control': 'no-store', 'x-api-version': API_VERSION };

export function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...BASE, ...headers } });
}

// Reads and writes are budgeted apart: polling your records must never eat
// the allowance a real change needs. Writes match the browser path
// (12 per 10 minutes per login).
const takeRead = createRateLimiter({ windowMs: 60_000, max: 60 });
const takeWrite = createRateLimiter({ windowMs: 10 * 60_000, max: 12 });

export async function withActor(request, kind, fn, opts = {}) {
  const auth = await authenticate(request, opts);
  if (!auth.actor) return json(auth.body, auth.status);
  const take = kind === 'write' ? takeWrite : takeRead;
  const budget = take(auth.actor.login.toLowerCase());
  if (!budget.ok) {
    return json({ error: 'rate_limited', retryInMs: budget.retryAfterMs }, 429, {
      'Retry-After': String(Math.ceil(budget.retryAfterMs / 1000)),
      ...rateLimitHeaders(budget),
    });
  }
  const res = await fn(auth.actor);
  for (const [k, v] of Object.entries(rateLimitHeaders(budget))) res.headers.set(k, String(v));
  return res;
}

// The public shape of a record over the API: what the owner can set, plus
// the read-only facts. Nothing here that is not already in the public repo.
export function publicRecord(record) {
  if (!record) return null;
  const { name, owner, claimedAt, records = {}, subdomains, nameservers, ds, profile } = record;
  return {
    name,
    fqdn: `${name}.runs-at.dev`,
    owner: owner?.github ?? null,
    claimedAt: claimedAt ?? null,
    dns: nameservers?.length ? 'delegated' : 'runs-at.dev',
    records,
    subdomains: subdomains ?? {},
    nameservers: nameservers ?? [],
    ds: ds ?? [],
    profile: profile ?? null,
  };
}
