// The sign-in flow end to end, with GitHub stubbed: every cookie the app sets
// must be a valid __Host- cookie, and cookies without the prefix -- the kind
// a claimed name pointed at its owner's own server can plant for the whole
// .runs-at.dev domain -- must be ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET as start } from '../app/api/auth/github/route.js';
import { GET as callback } from '../app/api/auth/github/callback/route.js';
import {
  readCookie,
  readSession,
  sessionFromRequest,
  signSession,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_CLAIM_COOKIE,
} from '../lib/session.js';

process.env.GITHUB_CLIENT_ID = 'client-id';
process.env.GITHUB_CLIENT_SECRET = 'client-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.APP_ORIGIN = 'https://runs-at.dev';

// A browser only stores a __Host- cookie that is Secure, has Path=/ and no
// Domain. Deletions (Max-Age=0) of the retired names are exempt.
function assertHostCookie(setCookie) {
  const [pair, ...attrs] = setCookie.split(';').map((s) => s.trim());
  const name = pair.slice(0, pair.indexOf('='));
  if (attrs.includes('Max-Age=0') && !name.startsWith('__Host-')) return;
  assert.ok(name.startsWith('__Host-'), `${name} lacks the __Host- prefix`);
  assert.ok(attrs.includes('Secure'), `${name} is not Secure`);
  assert.ok(attrs.includes('Path=/'), `${name} is not Path=/`);
  assert.ok(!attrs.some((a) => /^domain=/i.test(a)), `${name} sets a Domain`);
}

function withGitHubStub(fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('login/oauth/access_token')) return Response.json({ access_token: 'gho_x' });
    if (String(url).endsWith('/user')) return Response.json({ login: 'preetmendpara', avatar_url: 'a', name: 'P', bio: '', created_at: '2020-01-01T00:00:00Z', public_repos: 3 });
    throw new Error(`unexpected fetch ${url}`);
  };
  return fn().finally(() => { globalThis.fetch = real; });
}

test('sign-in start sets only valid __Host- cookies', async () => {
  const res = await start(new Request('https://runs-at.dev/api/auth/github?claim=alice'));
  const cookies = res.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  cookies.forEach(assertHostCookie);
  assert.ok(cookies[0].startsWith(`${OAUTH_STATE_COOKIE}=`));
  assert.ok(cookies[1].startsWith(`${OAUTH_CLAIM_COOKIE}=alice;`));
  assert.match(res.headers.get('location'), /redirect_uri=https%3A%2F%2Fruns-at\.dev%2Fapi%2Fauth%2Fgithub%2Fcallback/);
});

test('a full sign-in issues a working __Host-session and clears the rest', () => withGitHubStub(async () => {
  const begin = await start(new Request('https://runs-at.dev/api/auth/github?claim=alice'));
  const jar = begin.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const state = readCookie(jar, OAUTH_STATE_COOKIE);

  const res = await callback(new Request(`https://runs-at.dev/api/auth/github/callback?code=c&state=${state}`, { headers: { cookie: jar } }));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/?signed-in=1&claim=alice');

  const cookies = res.headers.getSetCookie();
  cookies.forEach(assertHostCookie);
  const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const value = session.split(';')[0].slice(SESSION_COOKIE.length + 1);
  assert.equal(readSession(value, process.env.SESSION_SECRET).login, 'preetmendpara');

  for (const name of [OAUTH_STATE_COOKIE, OAUTH_CLAIM_COOKIE, 'oauth_state', 'oauth_claim', 'session']) {
    assert.ok(cookies.some((c) => c.startsWith(`${name}=;`) && c.includes('Max-Age=0')), `${name} is not cleared`);
  }
}));

test('a planted, unprefixed oauth_state cannot complete a sign-in', () => withGitHubStub(async () => {
  const res = await callback(new Request('https://runs-at.dev/api/auth/github/callback?code=c&state=evil', { headers: { cookie: 'oauth_state=evil' } }));
  assert.equal(res.status, 400);
}));

test('an unprefixed session cookie is not a session', () => {
  const valid = signSession({ login: 'preetmendpara' }, process.env.SESSION_SECRET);
  const req = (cookie) => new Request('https://runs-at.dev/api/claim', { headers: { cookie } });
  assert.equal(sessionFromRequest(req(`session=${valid}`), process.env.SESSION_SECRET), null);
  assert.equal(sessionFromRequest(req(`other=1; ${SESSION_COOKIE}=${valid}`), process.env.SESSION_SECRET).login, 'preetmendpara');
});

test('readCookie matches whole names only', () => {
  assert.equal(readCookie('a=1; __Host-session=x', '__Host-session'), 'x');
  assert.equal(readCookie('x__Host-session=bad', '__Host-session'), undefined);
  assert.equal(readCookie('', 'a'), undefined);
  assert.equal(readCookie(null, 'a'), undefined);
});
