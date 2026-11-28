import { sessionFromRequest } from '../../../lib/session.js';
import { createRateLimiter, rateLimitHeaders } from '../../../lib/throttle.js';
import { updateRecord } from '../../../lib/record-update.js';

// Generous enough that editing a record, looking at it, and editing again
// never trips it; tight enough that a leaned-on button cannot spend the
// registry's shared GitHub quota or fire a DNS sync per commit indefinitely.
const WRITE_WINDOW_MS = 10 * 60 * 1000;
const WRITE_MAX = 12;
const takeWrite = createRateLimiter({ windowMs: WRITE_WINDOW_MS, max: WRITE_MAX });

// The browser write path onto domains/<name>.json. It commits straight to
// main, as claiming does; the rules live in lib/record-update.js, shared with
// the REST API, and validateEdit there is the same check CI applies to a PR.
export async function POST(request) {
  const session = sessionFromRequest(request, process.env.SESSION_SECRET);
  if (!session?.login) {
    return Response.json({ error: 'signin_required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  // Ahead of the registry read: reads spend the same REGISTRY_TOKEN quota.
  const budget = takeWrite(session.login.toLowerCase());
  if (!budget.ok) {
    const seconds = Math.ceil(budget.retryAfterMs / 1000);
    return Response.json(
      { error: 'rate_limited', retryInMs: budget.retryAfterMs },
      { status: 429, headers: { 'Retry-After': String(seconds), ...rateLimitHeaders(budget) } },
    );
  }

  const out = await updateRecord({ actor: session, name: body.name, body, token: process.env.REGISTRY_TOKEN });
  const { record, ...rest } = out.body;
  return Response.json(rest, { status: out.status, headers: out.headers });
}
