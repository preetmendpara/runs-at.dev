import { sessionFromRequest } from '../../../../lib/session.js';
import { signApiToken, revokeAll, authenticate, API_TOKEN_TTL_MS } from '../../../../lib/api-tokens.js';
import { createRateLimiter, rateLimitHeaders } from '../../../../lib/throttle.js';
import { json } from '../../../../lib/api-v1.js';

export const dynamic = 'force-dynamic';

const takeMint = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });

// Minting needs the browser session: a token can never mint another token,
// so a leaked one cannot extend its own life.
export async function POST(request) {
  const session = sessionFromRequest(request, process.env.SESSION_SECRET);
  if (!session?.login) return json({ error: 'signin_required' }, 401);
  const secret = process.env.API_TOKEN_SECRET;
  if (!secret) return json({ error: 'not_configured' }, 503);
  const budget = takeMint(session.login.toLowerCase());
  if (!budget.ok) {
    return json({ error: 'rate_limited', retryInMs: budget.retryAfterMs }, 429, {
      'Retry-After': String(Math.ceil(budget.retryAfterMs / 1000)), ...rateLimitHeaders(budget),
    });
  }
  const now = Date.now();
  const { token } = signApiToken(session, secret, { now });
  return json({ token, scope: 'dns', expiresAt: new Date(now + API_TOKEN_TTL_MS).toISOString() });
}

// Revoke every API token for the account, from the browser session or with
// any still-valid token (a script that suspects a leak can kill them all,
// itself included).
export async function DELETE(request) {
  let login = sessionFromRequest(request, process.env.SESSION_SECRET)?.login;
  if (!login) {
    const auth = await authenticate(request);
    if (!auth.actor) return json(auth.body, auth.status);
    login = auth.actor.login;
  }
  try {
    const at = await revokeAll(login);
    return json({ revoked: true, notBefore: new Date(at).toISOString() });
  } catch {
    return json({ error: 'busy', retryInMs: 4000 }, 503, { 'Retry-After': '4' });
  }
}
