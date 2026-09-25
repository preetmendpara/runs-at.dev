import { adminFromRequest } from '../../../../lib/admin.js';
import { getOwnerIndex } from '../../../../lib/owners.js';
import { API, headers } from '../../../../lib/registry.js';
import {
  getEntitlement,
  updateEntitlement,
  heldNames,
  applyGrant,
  applyRevoke,
  parseAmount,
  slotSummary,
} from '../../../../lib/entitlements.js';

const TOKEN = () => process.env.REGISTRY_TOKEN;
const LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;
const REASON_MAX = 200;

// Reads made right after a write must see it, not a cached copy.
const uncachedFetch = (url, init) => fetch(url, { ...init, cache: 'no-store' });

const deny = ({ status, error }) => Response.json({ error }, { status });
const busy = () => Response.json({ error: 'busy' }, { status: 503, headers: { 'Retry-After': '4' } });

function targetLogin(value) {
  const login = typeof value === 'string' ? value.trim().replace(/^@/, '').toLowerCase() : '';
  return LOGIN.test(login) ? login : null;
}

// What the panel shows for one account. `used` is every slot held -- the
// authoritative names in entitlements/, plus any the derived index knows --
// the same count /api/claim enforces against.
async function view(login) {
  const [index, entitlement] = await Promise.all([
    getOwnerIndex(login, { token: TOKEN(), fetchImpl: uncachedFetch }),
    getEntitlement(login, { token: TOKEN(), fetchImpl: uncachedFetch }),
  ]);
  const domains = heldNames(entitlement, index?.names);
  return {
    login,
    domains,
    ...slotSummary(entitlement, domains.length),
    history: entitlement.history,
  };
}

export async function GET(request) {
  const auth = adminFromRequest(request);
  if (!auth.session) return deny(auth);

  const login = targetLogin(new URL(request.url).searchParams.get('login'));
  if (!login) return Response.json({ error: 'invalid_login' }, { status: 400 });

  try {
    return Response.json(await view(login), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return busy();
  }
}

export async function POST(request) {
  const auth = adminFromRequest(request);
  if (!auth.session) return deny(auth);

  // The session cookie is SameSite=Lax, which already keeps it off cross-site
  // POSTs; a same-origin check on top costs nothing for the one endpoint that
  // changes allowances.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: 'bad_origin' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const login = targetLogin(body.login);
  const amount = parseAmount(body.amount);
  const action = body.action;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, REASON_MAX) : '';
  if (!login) return Response.json({ error: 'invalid_login' }, { status: 400 });
  if (!amount) return Response.json({ error: 'invalid_amount' }, { status: 400 });
  if (action !== 'grant' && action !== 'revoke') return Response.json({ error: 'invalid_action' }, { status: 400 });

  // A grant to a login that does not exist is a typo, and slots granted to it
  // would sit waiting for whoever registers that login next.
  if (action === 'grant') {
    const res = await uncachedFetch(`${API}/users/${login}`, { headers: headers(TOKEN()) }).catch(() => null);
    if (res?.status === 404) return Response.json({ error: 'unknown_user' }, { status: 404 });
    if (!res?.ok) return busy();
  }

  const by = auth.session.login;
  // The same compare-and-swap every slot change goes through, so a grant or
  // revoke and a claim for this account are applied one after the other. A
  // revoke is judged against the slots held at the moment it is written, so
  // it can never leave more names held than the new allowance.
  const message = `entitlement: ${action} ${amount} ${action === 'grant' ? 'to' : 'from'} @${login} by @${by}`
    + (reason ? ` (${reason.replace(/[\r\n]+/g, ' ')})` : '');
  const result = await updateEntitlement(login, (ent, held) => {
    const change = action === 'grant'
      ? applyGrant({ ...ent, names: held }, { amount, by, reason })
      : applyRevoke({ ...ent, names: held }, { amount, used: held.length, by, reason });
    if (!change.ok) return { refuse: change.code, revocable: change.revocable };
    return { entitlement: change.entitlement, message, held };
  }, { token: TOKEN(), fetchImpl: uncachedFetch });

  if (!result.ok) {
    if (result.reason === 'below_required' || result.reason === 'too_large') {
      return Response.json({ error: result.reason, revocable: result.revocable }, { status: 409 });
    }
    return busy();
  }
  return Response.json({
    login,
    domains: result.held,
    ...slotSummary(result.entitlement, result.held.length),
    history: result.entitlement.history,
  });
}
