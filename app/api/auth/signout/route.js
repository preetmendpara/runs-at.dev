import { SESSION_COOKIE } from '../../../../lib/session.js';

// POST, not GET, so a link or image elsewhere cannot sign anyone out. The
// session is a signed cookie with no server-side record, so signing out is
// the browser forgetting it.
export async function POST() {
  const headers = new Headers({ Location: '/' });
  headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(null, { status: 303, headers });
}
