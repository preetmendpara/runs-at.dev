import { sessionFromRequest } from '../../../lib/session.js';
import { evaluateClaim } from '../../../lib/claim.js';
import { putRecord } from '../../../lib/registry.js';
import { updateOwnerIndex } from '../../../lib/owners.js';
import { reserveSlot, settleSlot } from '../../../lib/entitlements.js';
import { createRateLimiter, rateLimitHeaders } from '../../../lib/throttle.js';

const TOKEN = () => process.env.REGISTRY_TOKEN;

// Same rationale as /api/records: claiming spends the same shared
// REGISTRY_TOKEN quota (entitlement and owner-index reads and writes plus a
// record write per attempt), so a looped or leaned-on button must be capped per account here
// too, not just on the edit endpoint.
const CLAIM_WINDOW_MS = 10 * 60 * 1000;
const CLAIM_MAX = 12;
const takeClaim = createRateLimiter({ windowMs: CLAIM_WINDOW_MS, max: CLAIM_MAX });

const BUSY_RESPONSE = () =>
  Response.json({ error: 'busy', retryInMs: 4000 }, { status: 503, headers: { 'Retry-After': '4' } });

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';

  const session = sessionFromRequest(request, process.env.SESSION_SECRET);

  if (session?.login) {
    const budget = takeClaim(session.login.toLowerCase());
    if (!budget.ok) {
      const seconds = Math.ceil(budget.retryAfterMs / 1000);
      return Response.json(
        { error: 'rate_limited', retryInMs: budget.retryAfterMs },
        { status: 429, headers: { 'Retry-After': String(seconds), ...rateLimitHeaders(budget) } },
      );
    }
  }

  // No pre-flight existence check: putRecord's atomic create already answers
  // "taken" via its `exists` reason, at the same status/code, for one less
  // GitHub request. It also degrades safely under rate limiting, unlike a
  // pre-flight getRecord call which throws on 403/429.
  // Claim-time country capture: Vercel's edge stamps every request with
  // x-vercel-ip-country (ISO alpha-2 of the client IP). Nothing to call, no
  // database; absent locally, and a malformed value simply records nothing.
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const decision = evaluateClaim({
    name,
    session,
    existing: null,
    // The per-account limit is not decided here: reserveSlot below decides it
    // atomically, and can reclaim a slot this snapshot would count as used.
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
  });
  if (!decision.ok) return refusal(decision.code, decision.status);

  // Take the slot in entitlements/<login>.json before writing the record. That
  // write is a compare-and-swap which re-checks the allowance against a fresh
  // read, so claims, releases, swaps and admin changes for one account are
  // applied one after another: a second claim racing this one sees this
  // reservation and is refused once the allowance is used up. The check in
  // evaluateClaim above is only the fast path.
  const reservation = await reserveSlot(session.login, name, { token: TOKEN() });
  if (!reservation.ok) {
    if (reservation.reason === 'limit_reached') return refusal('limit_reached', 403, reservation.held);
    return BUSY_RESPONSE();
  }

  const result = await putRecord(decision.record, { token: TOKEN() });

  // Confirm the slot, or hand it back if nothing was written. A slot this
  // claim did not reserve (the name was already held) is left as it was. If
  // settling fails the reservation simply stays pending: it keeps counting
  // until it expires and is checked against domains/, so a failure here can
  // only leave the account short a slot for a while, never over its limit.
  if (reservation.reserved || result.ok) {
    const settled = await settleSlot(session.login, name, result.ok, { token: TOKEN() })
      .catch(() => ({ ok: false, reason: 'threw' }));
    if (!settled.ok) console.warn(`slot settle failed for ${session.login}/${name}: ${settled.reason}`);
  }

  if (result.ok) {
    // The owners/ index is derived (sync-owners rebuilds it from domains/ on
    // this push); updating it now only keeps /manage current in the meantime.
    const indexed = await updateOwnerIndex(session.login, (names) => (names.includes(name) ? null : [...names, name]), {
      token: TOKEN(),
    }).catch(() => ({ ok: false, reason: 'threw' }));
    if (!indexed.ok && indexed.reason !== 'refused') {
      console.warn(`owner index write failed for ${session.login}: ${indexed.reason}`);
    }
    return Response.json({ claimed: name, commit: result.commit ?? null });
  }

  if (result.reason === 'exists') {
    return Response.json({ error: 'taken' }, { status: 409 });
  }

  if (result.reason === 'ratelimited') {
    return BUSY_RESPONSE();
  }

  return Response.json({ error: 'server_error' }, { status: 500 });
}

// Hand back the names this account already holds. Only limit_reached needs
// them, but they cost nothing to include and they are the caller's own
// records, not anyone else's. Without them the form can only say "you have
// used your slots" without saying where those names are.
function refusal(code, status, names) {
  const owned = names?.length ? names : undefined;
  return Response.json({ error: code, owned }, { status });
}
