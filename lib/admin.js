import { readSession, readCookie, SESSION_COOKIE } from './session.js';

// The one account allowed into /admin. Matched on the numeric GitHub id as
// well as the login: a login can be renamed and then registered by someone
// else, the id cannot. Sessions signed before the id was added to the payload
// carry no id and are refused until the next sign-in.
export const ADMIN = Object.freeze({ login: 'preetmendpara', id: 302369367 });

export function isAdmin(session) {
  return Boolean(
    session
      && typeof session.login === 'string'
      && session.login.toLowerCase() === ADMIN.login
      && session.id === ADMIN.id,
  );
}

// Server-side gate shared by the /admin page (through proxy.js) and the admin
// API. Only the signed session cookie is consulted; nothing the client sends
// in a body, query or header can make a request an admin one.
export function adminFromRequest(request, secret = process.env.SESSION_SECRET) {
  const raw = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const session = raw ? readSession(raw, secret) : null;
  if (!session?.login) return { status: 401, error: 'signin_required' };
  if (!isAdmin(session)) return { status: 403, error: 'forbidden' };
  return { session };
}
