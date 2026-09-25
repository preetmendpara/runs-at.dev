// Multi-domain management: which names /manage lists and opens for a signed-in
// account, and that every write endpoint still refuses someone else's name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.SESSION_SECRET = 'test-secret';
process.env.REGISTRY_TOKEN = 'registry-token';

const { resolveManagedNames } = await import('../lib/manage-select.js');
const { signSession, SESSION_COOKIE } = await import('../lib/session.js');
const { slotSummary, normalizeEntitlement } = await import('../lib/entitlements.js');
const { REPO } = await import('../lib/registry.js');
const recordsRoute = await import('../app/api/records/route.js');
const releaseRoute = await import('../app/api/release/route.js');
const swapRoute = await import('../app/api/swap/route.js');

const OLD = '2020-01-01T00:00:00Z';
const rec = (name, github) => ({ name, owner: { github }, claimedAt: OLD, records: {} });
const REGISTRY = {
  preet: rec('preet', 'preetmendpara'),
  project: rec('project', 'preetmendpara'),
  another: rec('another', 'PreetMendpara'),
  theirs: rec('theirs', 'someone-else'),
};
const readRecord = async (name) => REGISTRY[name] ?? null;
const pick = (requested, candidates = ['preet', 'project', 'another']) =>
  resolveManagedNames({ login: 'preetmendpara', candidates, requested, readRecord });

test('an account with several domains sees all of them, the first open by default', async () => {
  const out = await pick(undefined);
  assert.deepEqual(out.owned.map((o) => o.name), ['preet', 'project', 'another']);
  assert.equal(out.selected, 'preet');
  assert.equal(out.refused, false);
});

test('either domain can be selected, and the selected one is the one returned', async () => {
  for (const name of ['preet', 'project', 'another', 'PROJECT']) {
    const out = await pick(name);
    assert.equal(out.selected, name.toLowerCase());
    assert.equal(out.owned.find((o) => o.name === out.selected).record.name, name.toLowerCase());
  }
});

test('?name= for someone else\'s, a free or a malformed name selects nothing', async () => {
  for (const name of ['theirs', 'nobody-has-this', '../etc', 'a b']) {
    const out = await pick(name);
    assert.equal(out.selected, null, name);
    assert.equal(out.refused, true, name);
  }
});

test('a stale index naming someone else\'s domain never lists or opens it', async () => {
  const out = await pick('theirs', ['preet', 'theirs']);
  assert.deepEqual(out.owned.map((o) => o.name), ['preet']);
  assert.equal(out.selected, null);
});

test('another account sees none of these domains', async () => {
  const out = await resolveManagedNames({ login: 'someone-else', candidates: ['preet', 'project'], requested: 'preet', readRecord });
  assert.deepEqual(out.owned, []);
  assert.equal(out.selected, null);
});

test('an unreadable record is reported, not dropped and not granted', async () => {
  const out = await resolveManagedNames({
    login: 'preetmendpara',
    candidates: ['preet', 'project'],
    readRecord: async (n) => { if (n === 'project') throw new Error('503'); return REGISTRY[n]; },
  });
  assert.deepEqual(out.owned.map((o) => o.name), ['preet']);
  assert.deepEqual(out.unreadable, ['project']);
});

test('"Claim another domain" shows only while a slot is free', () => {
  const two = normalizeEntitlement({ adminGranted: 1 }, 'x');
  assert.equal(slotSummary(two, 1).available, 1);
  assert.equal(slotSummary(two, 2).available, 0);
  const page = readFileSync(join(import.meta.dirname, '..', 'app', 'manage', 'page.jsx'), 'utf8');
  assert.match(page, /slots\.available > 0 \? \([\s\S]*Claim another domain[\s\S]*\) : \([\s\S]*You've used all your domain slots\./);
});

// ── write endpoints refuse a name the session does not own ────────────────
function fakeGitHub() {
  const writes = [];
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const m = pathname.match(new RegExp(`^/repos/${REPO}/contents/domains/([a-z0-9-]+)\\.json$`));
    if ((init.method ?? 'GET') !== 'GET') {
      writes.push(pathname);
      return { status: 200, ok: true, json: async () => ({}) };
    }
    const r = m && REGISTRY[m[1]];
    return r
      ? { status: 200, ok: true, json: async () => ({ content: Buffer.from(JSON.stringify(r)).toString('base64'), sha: 's' }) }
      : { status: 404, ok: false, json: async () => ({}) };
  };
  return { writes, fetchImpl };
}

const cookie = (login) => `${SESSION_COOKIE}=${signSession({ login, createdAt: OLD, publicRepos: 3 }, process.env.SESSION_SECRET)}`;
const post = (route, body, login) =>
  route.POST(new Request('https://runs-at.dev/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(login ? { cookie: cookie(login) } : {}) },
    body: JSON.stringify(body),
  }));

test('records, release and swap refuse another account\'s domain; unauthenticated is refused', async () => {
  const gh = fakeGitHub();
  const real = globalThis.fetch;
  globalThis.fetch = gh.fetchImpl;
  try {
    const cases = [
      [recordsRoute, { name: 'theirs', records: { CNAME: 'evil.example.com' } }],
      [releaseRoute, { name: 'theirs', confirm: 'theirs' }],
      [swapRoute, { from: 'theirs', to: 'stolen', confirm: 'stolen' }],
    ];
    for (const [route, body] of cases) {
      assert.equal((await post(route, body, 'preetmendpara')).status, 403, JSON.stringify(body));
      assert.equal((await post(route, body)).status, 401, `${JSON.stringify(body)} unauthenticated`);
    }
    assert.deepEqual(gh.writes, [], 'nothing was written');
  } finally {
    globalThis.fetch = real;
  }
});

// ── the session stays on the apex; public pages never need it ─────────────
test('the session cookie is host-only (__Host-, no Domain attribute)', () => {
  assert.match(SESSION_COOKIE, /^__Host-/);
  const callback = readFileSync(join(import.meta.dirname, '..', 'app', 'api', 'auth', 'github', 'callback', 'route.js'), 'utf8');
  const set = callback.match(/`\$\{SESSION_COOKIE\}=[^`]*`/)[0];
  assert.match(set, /Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(set, /Domain=/i);
});

test('the public card never reads the session, and its manage link goes to the apex', () => {
  const card = readFileSync(join(import.meta.dirname, '..', 'app', 'sites', '[name]', 'page.jsx'), 'utf8');
  assert.doesNotMatch(card, /next\/headers|cookies\(|readSession|sessionFromRequest|SESSION_COOKIE/);
  assert.ok(card.includes('href={`https://runs-at.dev/manage?name=${encodeURIComponent(name)}`}'));
});
