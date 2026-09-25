// Domain slots: one included name per account plus any number the maintainer
// grants. Covers the pure rules, the admin gate and API, and the claim,
// release and swap routes end to end against an in-memory GitHub whose
// contents API enforces sha compare-and-swap the way the real one does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SESSION_SECRET = 'test-secret';
process.env.REGISTRY_TOKEN = 'registry-token';

const { signSession, SESSION_COOKIE } = await import('../lib/session.js');
const {
  normalizeEntitlement, totalAllowed, slotSummary, parseAmount, applyGrant, applyRevoke,
  getEntitlement, localEntitlementSource, reserveSlot, PENDING_TTL_MS,
  reservePullRequestSlot, closePullRequestSlot,
} = await import('../lib/entitlements.js');
const { ADMIN, isAdmin, adminFromRequest } = await import('../lib/admin.js');
const { validateChangeset } = await import('../lib/pr.js');
const { REPO } = await import('../lib/registry.js');
const claimRoute = await import('../app/api/claim/route.js');
const releaseRoute = await import('../app/api/release/route.js');
const swapRoute = await import('../app/api/swap/route.js');
const adminRoute = await import('../app/api/admin/entitlements/route.js');

// ── in-memory GitHub ──────────────────────────────────────────────────────
function fakeGitHub({ users = [] } = {}) {
  const files = new Map();
  let seq = 0;
  const set = (path, data) => files.set(path, { text: JSON.stringify(data), sha: `s${++seq}` });
  const read = (path) => (files.has(path) ? JSON.parse(files.get(path).text) : null);
  const reply = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const prefix = `/repos/${REPO}/contents/`;
  // fail(method, path) -> a status to answer instead, for failure injection.
  // after(method, path, body) runs once a write has landed and before the
  // writer hears back, to interleave other work at exactly that point.
  // pulls: number -> { state, files: [{ filename, status }], head: { path: record } }
  const gh = { files, set, read, fail: () => null, after: async () => {}, pulls: new Map() };

  async function fetchImpl(url, init = {}) {
    // Yield so concurrent requests genuinely interleave.
    await new Promise((r) => setImmediate(r));
    const { pathname } = new URL(url);
    if (pathname.startsWith('/users/')) {
      return reply(users.includes(pathname.slice(7)) ? 200 : 404, { login: pathname.slice(7) });
    }
    const pull = pathname.match(new RegExp(`^/repos/${REPO}/pulls/(\\d+)(/files)?$`));
    if (pull) {
      const p = gh.pulls.get(Number(pull[1]));
      if (!p) return reply(404);
      return pull[2] ? reply(200, p.files) : reply(200, { state: p.state });
    }
    const ref = new URL(url).searchParams.get('ref');
    if (ref && pathname.startsWith(prefix)) {
      const p = [...gh.pulls.values()].find((x) => x.sha === ref);
      const rec = p?.head?.[decodeURIComponent(pathname.slice(prefix.length))];
      return rec ? reply(200, { content: Buffer.from(JSON.stringify(rec)).toString('base64'), sha: 'h' }) : reply(404);
    }
    if (!pathname.startsWith(prefix)) return reply(404);
    const path = decodeURIComponent(pathname.slice(prefix.length));
    const cur = files.get(path);
    const method = init.method ?? 'GET';
    const injected = gh.fail(method, path);
    if (injected) return reply(injected);
    if (method === 'GET') {
      return cur ? reply(200, { content: Buffer.from(cur.text).toString('base64'), sha: cur.sha }) : reply(404);
    }
    const body = JSON.parse(init.body);
    if (method === 'PUT') {
      if (cur && body.sha !== cur.sha) return reply(body.sha ? 409 : 422);
      if (!cur && body.sha) return reply(409);
      files.set(path, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: `s${++seq}` });
      await gh.after(method, path, body);
      return reply(cur ? 200 : 201, { commit: { sha: `c${seq}` } });
    }
    if (method === 'DELETE') {
      if (!cur || body.sha !== cur.sha) return reply(409);
      files.delete(path);
      await gh.after(method, path, body);
      return reply(200);
    }
    return reply(405);
  }
  gh.fetchImpl = fetchImpl;
  return gh;
}

async function withGitHub(gh, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = gh.fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const OLD = '2020-01-01T00:00:00Z';
const cookieFor = (payload) =>
  `${SESSION_COOKIE}=${signSession({ createdAt: OLD, publicRepos: 3, ...payload }, process.env.SESSION_SECRET)}`;
const ADMIN_COOKIE = cookieFor({ login: ADMIN.login, id: ADMIN.id });

const post = (route, body, cookie) =>
  route.POST(new Request('https://runs-at.dev/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));

const claim = (login, name) => post(claimRoute, { name }, cookieFor({ login }));

// Seed an account: domains it owns, the owner index, and an optional grant.
function seed(gh, login, names, adminGranted) {
  for (const name of names) {
    gh.set(`domains/${name}.json`, { name, owner: { github: login }, claimedAt: OLD, records: {} });
  }
  if (names.length) gh.set(`owners/${login}.json`, { github: login, names });
  if (adminGranted !== undefined) gh.set(`entitlements/${login}.json`, { github: login, included: 1, adminGranted, names, pending: {}, history: [] });
}

const ownedDomains = (gh, login) =>
  [...gh.files.keys()].filter((p) => p.startsWith('domains/') && gh.read(p).owner.github === login);

// ── 1. default ────────────────────────────────────────────────────────────
test('default account: 1 included, 0 granted, 1 total', async () => {
  const ent = normalizeEntitlement(null, 'someone');
  assert.deepEqual(slotSummary(ent, 0), { included: 1, adminGranted: 0, total: 1, used: 0, available: 1 });
  const gh = fakeGitHub();
  const read = await getEntitlement('someone', { fetchImpl: gh.fetchImpl });
  assert.equal(totalAllowed(read), 1);
});

test('a malformed entitlement file never widens the allowance', () => {
  for (const adminGranted of [-3, 1.5, '10', null, Infinity]) {
    assert.equal(totalAllowed(normalizeEntitlement({ adminGranted }, 'x')), 1);
  }
});

test('amounts: any positive whole number, nothing else', () => {
  for (const ok of [1, 3, 10, 100, 250000, '42']) assert.ok(parseAmount(ok), String(ok));
  for (const bad of [0, -1, 1.5, 'abc', '', null, undefined, '1e3', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseAmount(bad), null, String(bad));
  }
});

// ── 2-5. admin grants of any size ─────────────────────────────────────────
for (const amount of [1, 3, 10, 100]) {
  test(`admin grant +${amount}: total becomes ${1 + amount} and is audited`, async () => {
    const login = `grantee-${amount}`;
    const gh = fakeGitHub({ users: [login] });
    const res = await withGitHub(gh, () =>
      post(adminRoute, { login, action: 'grant', amount, reason: 'Beta tester' }, ADMIN_COOKIE));
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.adminGranted, amount);
    assert.equal(out.total, 1 + amount);
    assert.equal(out.available, 1 + amount);
    const stored = gh.read(`entitlements/${login}.json`);
    assert.equal(stored.adminGranted, amount);
    assert.equal(stored.history.at(-1).action, 'grant');
    assert.equal(stored.history.at(-1).by, ADMIN.login);
    assert.equal(stored.history.at(-1).reason, 'Beta tester');
  });
}

test('grants accumulate: 3 granted, +10 more, 14 total', async () => {
  const gh = fakeGitHub({ users: ['friend'] });
  seed(gh, 'friend', ['friend', 'project'], 3);
  const res = await withGitHub(gh, () => post(adminRoute, { login: 'friend', action: 'grant', amount: 10 }, ADMIN_COOKIE));
  const out = await res.json();
  assert.deepEqual(
    { included: out.included, adminGranted: out.adminGranted, total: out.total, used: out.used, available: out.available },
    { included: 1, adminGranted: 13, total: 14, used: 2, available: 12 },
  );
});

test('admin grant to a login GitHub does not know is refused', async () => {
  const gh = fakeGitHub();
  const res = await withGitHub(gh, () => post(adminRoute, { login: 'no-such-user', action: 'grant', amount: 1 }, ADMIN_COOKIE));
  assert.equal(res.status, 404);
  assert.equal(gh.files.size, 0);
});

// ── 6-7. claiming up to the allowance, and no further ──────────────────────
test('an account claims up to its allowance, then is refused', async () => {
  const gh = fakeGitHub();
  seed(gh, 'multi', [], 2);
  await withGitHub(gh, async () => {
    for (const name of ['multione', 'multitwo', 'multithree']) {
      assert.equal((await claim('multi', name)).status, 200, name);
    }
    const over = await claim('multi', 'multifour');
    assert.equal(over.status, 403);
    assert.equal((await over.json()).error, 'limit_reached');
  });
  assert.equal(ownedDomains(gh, 'multi').length, 3);
  assert.deepEqual(gh.read('owners/multi.json').names, ['multione', 'multitwo', 'multithree']);
});

test('a default account gets exactly one name', async () => {
  const gh = fakeGitHub();
  await withGitHub(gh, async () => {
    assert.equal((await claim('solo', 'soloname')).status, 200);
    assert.equal((await claim('solo', 'soloagain')).status, 403);
  });
  assert.equal(ownedDomains(gh, 'solo').length, 1);
});

test('a taken name hands the reserved slot back', async () => {
  const gh = fakeGitHub();
  seed(gh, 'other', ['takenname']);
  await withGitHub(gh, async () => {
    assert.equal((await claim('unlucky', 'takenname')).status, 409);
    assert.deepEqual(gh.read('entitlements/unlucky.json').names, []);
    assert.equal((await claim('unlucky', 'freename')).status, 200);
  });
});

// ── 8. release ────────────────────────────────────────────────────────────
test('releasing a name frees its slot immediately', async () => {
  const gh = fakeGitHub();
  seed(gh, 'releaser', ['relone', 'reltwo', 'relthree'], 2);
  await withGitHub(gh, async () => {
    assert.equal((await claim('releaser', 'relfour')).status, 403);
    const rel = await post(releaseRoute, { name: 'reltwo', confirm: 'reltwo' }, cookieFor({ login: 'releaser' }));
    assert.equal(rel.status, 200);
    assert.deepEqual(gh.read('owners/releaser.json').names, ['relone', 'relthree']);
    assert.equal((await claim('releaser', 'relfour')).status, 200);
  });
});

// ── 9. swap ───────────────────────────────────────────────────────────────
test('a swap replaces the name without spending another slot', async () => {
  const gh = fakeGitHub();
  seed(gh, 'swapper', ['swapold'], 1);
  await withGitHub(gh, async () => {
    const res = await post(swapRoute, { from: 'swapold', to: 'swapnew', confirm: 'swapnew' }, cookieFor({ login: 'swapper' }));
    assert.equal(res.status, 200);
    assert.deepEqual(gh.read('owners/swapper.json').names, ['swapnew']);
    // Allowance 2, one name held: still exactly one slot free.
    assert.equal((await claim('swapper', 'swapextra')).status, 200);
    assert.equal((await claim('swapper', 'swapmore')).status, 403);
  });
  assert.deepEqual(ownedDomains(gh, 'swapper').sort(), ['domains/swapextra.json', 'domains/swapnew.json']);
});

// ── 10. concurrency ───────────────────────────────────────────────────────
test('two simultaneous claims cannot exceed the allowance', async () => {
  const gh = fakeGitHub();
  seed(gh, 'racer', ['racerone'], 1);
  const results = await withGitHub(gh, () => Promise.all([claim('racer', 'racertwo'), claim('racer', 'racerthree')]));
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 200).length, 1, `statuses ${statuses}`);
  assert.equal(ownedDomains(gh, 'racer').length, 2);
  assert.equal(gh.read('owners/racer.json').names.length, 2);
});

test('a burst of simultaneous first claims yields exactly one name', async () => {
  const gh = fakeGitHub();
  const names = ['burstone', 'bursttwo', 'burstthree', 'burstfour', 'burstfive'];
  const results = await withGitHub(gh, () => Promise.all(names.map((n) => claim('burster', n))));
  assert.ok(results.some((r) => r.status === 200));
  assert.equal(ownedDomains(gh, 'burster').length, 1);
});

// ── 11. pull-request claims use the same rule ──────────────────────────────
function prClaim({ owned, adminGranted }) {
  return validateChangeset({
    files: [{ filename: 'domains/prname.json', status: 'added' }],
    prAuthor: 'prauthor',
    readFile: async () => ({ name: 'prname', owner: { github: 'prauthor' }, claimedAt: OLD, records: {} }),
    readBase: async () => null,
    getUser: async () => ({ created_at: OLD, public_repos: 3 }),
    countOwnedNames: async () => owned,
    getEntitlement: async () => normalizeEntitlement({ adminGranted }, 'prauthor'),
  });
}

test('PR claims: default account, first allowed, second refused', async () => {
  assert.equal((await prClaim({ owned: 0, adminGranted: 0 })).ok, true);
  const second = await prClaim({ owned: 1, adminGranted: 0 });
  assert.equal(second.ok, false);
  assert.ok(second.errors.some((e) => e.includes('already owns 1 of 1')));
});

test('PR claims: 3 granted allows up to 4, refuses the fifth', async () => {
  assert.equal((await prClaim({ owned: 3, adminGranted: 3 })).ok, true);
  assert.equal((await prClaim({ owned: 4, adminGranted: 3 })).ok, false);
});

test('PR claims: an unreadable allowance fails closed', async () => {
  const out = await validateChangeset({
    files: [{ filename: 'domains/prname.json', status: 'added' }],
    prAuthor: 'prauthor',
    readFile: async () => ({ name: 'prname', owner: { github: 'prauthor' }, claimedAt: OLD, records: {} }),
    readBase: async () => null,
    getUser: async () => ({ created_at: OLD, public_repos: 3 }),
    countOwnedNames: async () => 0,
    getEntitlement: async () => { throw new Error('unreadable'); },
  });
  assert.equal(out.ok, false);
});

test('PR claims: a pull request may not edit an allowance', async () => {
  const out = await validateChangeset({
    files: [{ filename: 'entitlements/prauthor.json', status: 'modified' }],
    prAuthor: 'prauthor',
  });
  assert.equal(out.ok, false);
});

test('CI reads the allowance from the base checkout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ent-'));
  const read = localEntitlementSource(root);
  assert.equal(totalAllowed(await read('nobody')), 1);
  mkdirSync(join(root, 'entitlements'));
  writeFileSync(join(root, 'entitlements', 'granted.json'), JSON.stringify({ github: 'granted', included: 1, adminGranted: 3 }));
  assert.equal(totalAllowed(await read('Granted')), 4);
});

// ── 12. admin access ──────────────────────────────────────────────────────
const adminGet = (cookie) =>
  adminRoute.GET(new Request('https://runs-at.dev/api/admin/entitlements?login=friend', { headers: cookie ? { cookie } : {} }));

test('admin: unauthenticated is rejected', async () => {
  assert.equal((await adminGet()).status, 401);
  assert.equal((await post(adminRoute, { login: 'x', action: 'grant', amount: 1 })).status, 401);
});

test('admin: any other GitHub account is rejected, including granting itself', async () => {
  const other = cookieFor({ login: 'friend', id: 1 });
  assert.equal((await adminGet(other)).status, 403);
  const gh = fakeGitHub({ users: ['friend'] });
  const res = await withGitHub(gh, () => post(adminRoute, { login: 'friend', action: 'grant', amount: 100 }, other));
  assert.equal(res.status, 403);
  assert.equal(gh.files.size, 0);
});

test('admin: the login alone is not enough, the GitHub id must match too', async () => {
  assert.equal((await adminGet(cookieFor({ login: ADMIN.login }))).status, 403);
  assert.equal((await adminGet(cookieFor({ login: ADMIN.login, id: ADMIN.id + 1 }))).status, 403);
  assert.equal(isAdmin({ login: 'PreetMendpara', id: ADMIN.id }), true);
});

test('admin: @preetmendpara is accepted', async () => {
  const gh = fakeGitHub();
  seed(gh, 'friend', ['friend', 'project'], 3);
  const res = await withGitHub(gh, () => adminGet(ADMIN_COOKIE));
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.deepEqual(out.domains, ['friend', 'project']);
  assert.equal(out.total, 4);
  assert.equal(out.available, 2);
});

test('admin: a forged cookie is rejected', () => {
  const forged = `${SESSION_COOKIE}=${signSession({ login: ADMIN.login, id: ADMIN.id }, 'wrong-secret')}`;
  const req = new Request('https://runs-at.dev/admin', { headers: { cookie: forged } });
  assert.equal(adminFromRequest(req).status, 401);
});

test('admin: a cross-origin POST is rejected', async () => {
  const res = await adminRoute.POST(new Request('https://runs-at.dev/api/admin/entitlements', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: ADMIN_COOKIE, origin: 'https://evil.example' },
    body: JSON.stringify({ login: 'friend', action: 'grant', amount: 1 }),
  }));
  assert.equal(res.status, 403);
});

// ── 13. revoke ────────────────────────────────────────────────────────────
test('revoke: unused slots come back, used ones do not', async () => {
  const gh = fakeGitHub();
  seed(gh, 'friend', ['friend', 'project'], 3);
  await withGitHub(gh, async () => {
    // 2 names held, 1 included, so at least 1 granted slot is in use.
    const ok = await post(adminRoute, { login: 'friend', action: 'revoke', amount: 2, reason: 'trial over' }, ADMIN_COOKIE);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).adminGranted, 1);
    const tooFar = await post(adminRoute, { login: 'friend', action: 'revoke', amount: 1 }, ADMIN_COOKIE);
    assert.equal(tooFar.status, 409);
    assert.deepEqual(await tooFar.json(), { error: 'below_required', revocable: 0 });
  });
  const stored = gh.read('entitlements/friend.json');
  assert.equal(stored.adminGranted, 1);
  assert.equal(stored.history.at(-1).action, 'revoke');
});

test('revoke rule, directly', () => {
  const ent = normalizeEntitlement({ adminGranted: 5 }, 'x');
  assert.equal(applyRevoke(ent, { amount: 5, used: 1, by: 'a' }).ok, true);
  assert.equal(applyRevoke(ent, { amount: 5, used: 2, by: 'a' }).revocable, 4);
  assert.equal(applyGrant(ent, { amount: 7, by: 'a' }).entitlement.adminGranted, 12);
});

// ── authoritative slot accounting under concurrency ───────────────────────
// The invariant every scenario below must end in: no more domains owned, and
// no more slots held, than the account is allowed; and every owned domain
// holds a slot.
function assertConsistent(gh, login) {
  const ent = normalizeEntitlement(gh.read(`entitlements/${login}.json`), login);
  const total = totalAllowed(ent);
  const owned = ownedDomains(gh, login).map((p) => p.slice('domains/'.length, -'.json'.length));
  assert.ok(owned.length <= total, `owns ${owned.length} of ${total}: ${owned}`);
  assert.ok(ent.names.length <= total, `holds ${ent.names.length} of ${total}: ${ent.names}`);
  for (const name of owned) assert.ok(ent.names.includes(name), `${name} owned but holds no slot`);
  return { ent, owned, total };
}

const release = (login, name) => post(releaseRoute, { name, confirm: name }, cookieFor({ login }));
const swap = (login, from, to) => post(swapRoute, { from, to, confirm: to }, cookieFor({ login }));
const adminChange = (login, action, amount) => post(adminRoute, { login, action, amount }, ADMIN_COOKIE);

test('concurrency 1: allowed 2, used 1, two simultaneous claims: exactly one succeeds', async () => {
  const gh = fakeGitHub();
  seed(gh, 'cone', ['coneone'], 1);
  const results = await withGitHub(gh, () => Promise.all([claim('cone', 'conetwo'), claim('cone', 'conethree')]));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 403]);
  assert.equal(assertConsistent(gh, 'cone').owned.length, 2);
});

test('concurrency 2: allowed 3, used 2, many simultaneous claims: exactly one succeeds', async () => {
  const gh = fakeGitHub();
  seed(gh, 'ctwo', ['ctwoa', 'ctwob'], 2);
  const names = ['ctwoc', 'ctwod', 'ctwoe', 'ctwof'];
  const results = await withGitHub(gh, () => Promise.all(names.map((n) => claim('ctwo', n))));
  assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.status).join());
  assert.equal(assertConsistent(gh, 'ctwo').owned.length, 3);
});

test('concurrency 3: an owners/ rebuild or delete mid-claim cannot free a slot', async () => {
  for (const rebuild of ['stale', 'deleted']) {
    const gh = fakeGitHub();
    const login = `rebuild-${rebuild}`;
    seed(gh, login, ['rbone'].map((n) => `${n}${rebuild}`), 1);
    let nested;
    // Right after claim B has reserved its slot and before it writes its
    // domain file: sync-owners rebuilds the index from domains/ (which does
    // not have B yet) or the index is deleted outright, and claim C runs.
    gh.after = async (method, path, body) => {
      if (nested || path !== `entitlements/${login}.json` || !body.message.includes('reserve')) return;
      nested = 'running';
      if (rebuild === 'stale') gh.set(`owners/${login}.json`, { github: login, names: [`rbone${rebuild}`] });
      else gh.files.delete(`owners/${login}.json`);
      nested = await claim(login, `rbthree${rebuild}`);
    };
    const b = await withGitHub(gh, () => claim(login, `rbtwo${rebuild}`));
    assert.equal(b.status, 200);
    assert.equal(nested.status, 403, rebuild);
    assert.equal(assertConsistent(gh, login).owned.length, 2);
  }
});

test('concurrency 4: simultaneous revoke and claim never exceed the allowance', async () => {
  for (let i = 0; i < 6; i++) {
    const gh = fakeGitHub();
    const login = `revclaim${i}`;
    seed(gh, login, [`rca${i}`, `rcb${i}`], 2);
    const ops = [adminChange(login, 'revoke', 1), claim(login, `rcc${i}`)];
    await withGitHub(gh, () => Promise.all(i % 2 ? ops.reverse() : ops));
    assertConsistent(gh, login);
  }
});

test('concurrency 5: simultaneous grant and claim end in a valid state', async () => {
  const gh = fakeGitHub({ users: ['grantclaim'] });
  seed(gh, 'grantclaim', ['gca'], 0);
  await withGitHub(gh, () => Promise.all([adminChange('grantclaim', 'grant', 1), claim('grantclaim', 'gcb')]));
  const { ent } = assertConsistent(gh, 'grantclaim');
  assert.equal(ent.adminGranted, 1);
  assert.equal(ent.history.length, 1);
});

test('concurrency 6: release during a claim keeps slot accounting valid', async () => {
  const gh = fakeGitHub();
  seed(gh, 'relclaim', ['rla', 'rlb'], 1);
  await withGitHub(gh, () => Promise.all([release('relclaim', 'rla'), claim('relclaim', 'rlc')]));
  const { ent, owned } = assertConsistent(gh, 'relclaim');
  assert.deepEqual([...ent.names].sort(), [...owned].sort());
});

test('concurrency 7: swap during a claim keeps slot accounting valid', async () => {
  const gh = fakeGitHub();
  seed(gh, 'swclaim', ['swa', 'swb'], 1);
  const results = await withGitHub(gh, () => Promise.all([swap('swclaim', 'swa', 'swx'), claim('swclaim', 'swc')]));
  assert.equal(results[0].status, 200);
  assert.equal(results[1].status, 403);
  const { ent, owned } = assertConsistent(gh, 'swclaim');
  assert.deepEqual([...ent.names].sort(), ['swb', 'swx']);
  assert.deepEqual([...owned].sort(), ['swb', 'swx']);
});

test('concurrency 8: a claim dying after reserving fails closed until the reservation expires', async () => {
  const gh = fakeGitHub();
  seed(gh, 'crash', [], 0);
  await withGitHub(gh, async () => {
    const reserved = await reserveSlot('crash', 'crashone', { token: 't' });
    assert.equal(reserved.ok, true);
    // Died here: no domain file, no settle. The slot must still count.
    assert.equal((await claim('crash', 'crashtwo')).status, 403);

    // Once the reservation is older than any claim can live, it is checked
    // against domains/, found empty, and reclaimed.
    const ent = gh.read('entitlements/crash.json');
    ent.pending.crashone = new Date(Date.now() - PENDING_TTL_MS - 1000).toISOString();
    gh.set('entitlements/crash.json', ent);
    assert.equal((await claim('crash', 'crashtwo')).status, 200);
  });
  const { ent, owned } = assertConsistent(gh, 'crash');
  assert.deepEqual(ent.names, ['crashtwo']);
  assert.deepEqual(owned, ['domains/crashtwo.json'].map((p) => p.slice(8, -5)));
});


test('a record that cannot be read while reclaiming fails closed', async () => {
  const gh = fakeGitHub();
  seed(gh, 'unreadable', ['urone'], 0);
  gh.fail = (method, path) => (method === 'GET' && path === 'domains/urone.json' ? 500 : null);
  const res = await withGitHub(gh, () => claim('unreadable', 'urtwo'));
  assert.equal(res.status, 503);
  assert.equal(ownedDomains(gh, 'unreadable').length, 1);
});

test('a released-by-PR name is reclaimed once the account is at its limit', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prreleased', ['prgone'], 0);
  gh.files.delete('domains/prgone.json');
  gh.set('owners/prreleased.json', { github: 'prreleased', names: [] });
  assert.equal((await withGitHub(gh, () => claim('prreleased', 'prnew'))).status, 200);
  assert.deepEqual(assertConsistent(gh, 'prreleased').ent.names, ['prnew']);
});

const adminView = async (login) =>
  (await adminRoute.GET(new Request(`https://runs-at.dev/api/admin/entitlements?login=${login}`, { headers: { cookie: ADMIN_COOKIE } }))).json();

test('deleting or rebuilding owners/ never changes the entitlement record', async () => {
  const gh = fakeGitHub();
  seed(gh, 'idx', ['idxa', 'idxb'], 1);
  const before = gh.files.get('entitlements/idx.json').text;
  gh.files.delete('owners/idx.json');
  await withGitHub(gh, async () => {
    assert.equal((await claim('idx', 'idxc')).status, 403);
    const view = await adminView('idx');
    assert.deepEqual({ used: view.used, available: view.available, total: view.total }, { used: 2, available: 0, total: 2 });
  });
  assert.equal(gh.files.get('entitlements/idx.json').text, before);
});

test('an existing account with no entitlement file keeps 1 included and its name', async () => {
  const gh = fakeGitHub();
  seed(gh, 'legacy', ['legacyname']);
  await withGitHub(gh, async () => {
    assert.equal((await claim('legacy', 'legacytwo')).status, 403);
    const view = await adminView('legacy');
    assert.deepEqual({ included: view.included, adminGranted: view.adminGranted, used: view.used }, { included: 1, adminGranted: 0, used: 1 });
  });
});

test('a failed domain write whose rollback also fails keeps the slot held', async () => {
  const gh = fakeGitHub();
  seed(gh, 'rollback', [], 0);
  let reserved = false;
  gh.after = async (method, path) => { if (path === 'entitlements/rollback.json') reserved = true; };
  gh.fail = (method, path) =>
    method === 'PUT' && (path === 'domains/rbfirst.json' || (reserved && path === 'entitlements/rollback.json')) ? 500 : null;
  await withGitHub(gh, async () => {
    assert.equal((await claim('rollback', 'rbfirst')).status, 500);
    gh.fail = () => null;
    assert.equal((await claim('rollback', 'rbsecond')).status, 403);
  });
  assert.deepEqual(gh.read('entitlements/rollback.json').names, ['rbfirst']);
  assert.equal(ownedDomains(gh, 'rollback').length, 0);
});

// ── pull-request claims hold their slot before merge ──────────────────────
// A PR claim reserves in entitlements/ (pr-slots workflow), is merged by
// adding its domain file, and is confirmed on close. These drive the same
// library calls the workflow script makes.
const T = { token: 't' };
function mergePr(gh, login, name) {
  // The merge lands the domain file; sync-owners has not run yet, so the
  // owners/ index is stale.
  gh.set(`domains/${name}.json`, { name, owner: { github: login }, claimedAt: OLD, records: {} });
}

test('PR merge then an immediate website claim cannot exceed the allowance', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prfast', ['prfa'], 1);
  gh.pulls.set(7, { state: 'open' });
  await withGitHub(gh, async () => {
    assert.equal((await reservePullRequestSlot('prfast', 'prfb', 7, T)).ok, true);
    // Before the merge, the website already counts the PR's name.
    assert.equal((await claim('prfast', 'prfc')).status, 403);
    mergePr(gh, 'prfast', 'prfb');
    gh.pulls.set(7, { state: 'closed' });
    // Immediately after the merge, before any confirmation or index rebuild.
    assert.equal((await claim('prfast', 'prfc')).status, 403);
    assert.equal((await closePullRequestSlot('prfast', 'prfb', 7, true, T)).ok, true);
    assert.equal((await claim('prfast', 'prfc')).status, 403);
  });
  const { ent, owned } = assertConsistent(gh, 'prfast');
  assert.deepEqual([...owned].sort(), ['prfa', 'prfb']);
  assert.deepEqual(ent.pullRequests, {});
});

test('two website claims racing a PR merge: exactly the free slots are used', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prrace', ['pra'], 2);
  gh.pulls.set(8, { state: 'open' });
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prrace', 'prb', 8, T);
    mergePr(gh, 'prrace', 'prb');
    const results = await Promise.all([
      claim('prrace', 'prc'),
      claim('prrace', 'prd'),
      closePullRequestSlot('prrace', 'prb', 8, true, T),
    ]);
    assert.equal(results.slice(0, 2).filter((r) => r.status === 200).length, 1);
  });
  assert.equal(assertConsistent(gh, 'prrace').owned.length, 3);
});

test('a PR reservation is refused when every slot is held', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prfull', ['pfa'], 0);
  const out = await withGitHub(gh, () => reservePullRequestSlot('prfull', 'pfb', 9, T));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'limit_reached');
});

test('PR merge + admin grant stays valid', async () => {
  const gh = fakeGitHub({ users: ['prgrant'] });
  seed(gh, 'prgrant', ['pga'], 1);
  gh.pulls.set(10, { state: 'open' });
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prgrant', 'pgb', 10, T);
    mergePr(gh, 'prgrant', 'pgb');
    await Promise.all([closePullRequestSlot('prgrant', 'pgb', 10, true, T), adminChange('prgrant', 'grant', 1)]);
  });
  const { ent } = assertConsistent(gh, 'prgrant');
  assert.equal(ent.adminGranted, 2);
  assert.deepEqual([...ent.names].sort(), ['pga', 'pgb']);
});

test('PR reservation + admin revoke: slots held by an open PR cannot be revoked', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prrevoke', ['pva'], 2);
  gh.pulls.set(11, { state: 'open' });
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prrevoke', 'pvb', 11, T);
    const tooFar = await adminChange('prrevoke', 'revoke', 2);
    assert.equal(tooFar.status, 409);
    assert.equal((await tooFar.json()).revocable, 1);
    const both = await Promise.all([adminChange('prrevoke', 'revoke', 1), claim('prrevoke', 'pvc')]);
    assert.ok(both.some((r) => r.status === 200));
    mergePr(gh, 'prrevoke', 'pvb');
    await closePullRequestSlot('prrevoke', 'pvb', 11, true, T);
  });
  assertConsistent(gh, 'prrevoke');
});

test('PR closed unmerged hands its slot back', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prclose', ['pca'], 1);
  gh.pulls.set(12, { state: 'open' });
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prclose', 'pcb', 12, T);
    assert.equal((await claim('prclose', 'pcc')).status, 403);
    gh.pulls.set(12, { state: 'closed' });
    await closePullRequestSlot('prclose', 'pcb', 12, false, T);
    assert.equal((await claim('prclose', 'pcc')).status, 200);
  });
  assert.deepEqual(assertConsistent(gh, 'prclose').ent.names.sort(), ['pca', 'pcc']);
});

test('an open PR keeps its slot at the limit; a closed one whose cleanup never ran is reclaimed', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prheal', ['pha'], 1);
  gh.pulls.set(13, { state: 'open' });
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prheal', 'phb', 13, T);
    assert.equal((await claim('prheal', 'phc')).status, 403, 'open PR holds the slot');
    gh.pulls.set(13, { state: 'closed' }); // closed, never merged, no cleanup
    assert.equal((await claim('prheal', 'phc')).status, 200, 'closed and unmerged: reclaimed');
  });
  assertConsistent(gh, 'prheal');
});

test('a PR that changes its name moves its reservation instead of taking another', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prmove', [], 1);
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prmove', 'pmfirst', 14, T);
    await reservePullRequestSlot('prmove', 'pmsecond', 14, T);
  });
  const ent = gh.read('entitlements/prmove.json');
  assert.deepEqual(ent.names, ['pmsecond']);
  assert.deepEqual(ent.pullRequests, { pmsecond: 14 });
});

test('a PR merged without a reservation (maintainer override) is recorded on close', async () => {
  const gh = fakeGitHub();
  seed(gh, 'proverride', ['poa'], 0);
  mergePr(gh, 'proverride', 'pob');
  await withGitHub(gh, () => closePullRequestSlot('proverride', 'pob', 15, true, T));
  assert.deepEqual(gh.read('entitlements/proverride.json').names.sort(), ['poa', 'pob']);
  // Over the allowance now, so every further claim is refused.
  assert.equal((await withGitHub(gh, () => claim('proverride', 'poc'))).status, 403);
});

test('owners/ rebuilt without the merged PR name cannot free its slot', async () => {
  const gh = fakeGitHub();
  seed(gh, 'prsync', ['psa'], 1);
  gh.pulls.set(16, { state: 'open' });
  await withGitHub(gh, async () => {
    await reservePullRequestSlot('prsync', 'psb', 16, T);
    mergePr(gh, 'prsync', 'psb');
    gh.set('owners/prsync.json', { github: 'prsync', names: ['psa'] });
    assert.equal((await claim('prsync', 'psc')).status, 403);
    gh.files.delete('owners/prsync.json');
    assert.equal((await claim('prsync', 'psc')).status, 403);
  });
  assertConsistent(gh, 'prsync');
});

test('validate refuses a new-name PR until its slot is reserved on main', async () => {
  const base = (pullRequests) => ({
    files: [{ filename: 'domains/vname.json', status: 'added' }],
    prAuthor: 'vauthor',
    readFile: async () => ({ name: 'vname', owner: { github: 'vauthor' }, claimedAt: OLD, records: {} }),
    readBase: async () => null,
    getUser: async () => ({ created_at: OLD, public_repos: 3 }),
    countOwnedNames: async () => 0,
    getEntitlement: async () => normalizeEntitlement({ adminGranted: 0, names: Object.keys(pullRequests), pullRequests }, 'vauthor'),
    prNumber: 21,
  });
  const unreserved = await validateChangeset(base({}));
  assert.equal(unreserved.ok, false);
  assert.ok(unreserved.errors.some((e) => e.includes('no slot is reserved')));
  assert.equal((await validateChangeset(base({ vname: 22 }))).ok, false, 'another PR\'s reservation does not count');
  assert.equal((await validateChangeset(base({ vname: 21 }))).ok, true);
});

test('pr-slots script: reserves on open, confirms on merge, against the fake GitHub', async () => {
  const gh = fakeGitHub();
  seed(gh, 'scripted', ['sca'], 1);
  gh.pulls.set(30, {
    state: 'open',
    sha: 'headsha',
    files: [{ filename: 'domains/scb.json', status: 'added' }],
    head: { 'domains/scb.json': { name: 'scb', owner: { github: 'Scripted' }, claimedAt: OLD, records: {} } },
  });
  const run = async (action, merged) => {
    Object.assign(process.env, {
      GITHUB_TOKEN: 't', REGISTRY_REPO: REPO, PR: '30', ACTION: action, MERGED: String(merged), AUTHOR: 'Scripted', HEAD_SHA: 'headsha',
    });
    await withGitHub(gh, () => import(`../scripts/pr-slots.mjs?${action}-${Math.random()}`));
  };
  await run('opened', false);
  assert.deepEqual(gh.read('entitlements/scripted.json').pullRequests, { scb: 30 });
  mergePr(gh, 'scripted', 'scb');
  gh.pulls.get(30).state = 'closed';
  await run('closed', true);
  const ent = gh.read('entitlements/scripted.json');
  assert.deepEqual(ent.pullRequests, {});
  assert.deepEqual(ent.names.sort(), ['sca', 'scb']);
});
