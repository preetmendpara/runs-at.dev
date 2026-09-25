// The one-time entitlement backfill, and the pull-request guard against a
// validation that went stale while the author claimed on the website.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { planBackfill, serializeEntitlement, localEntitlementSource, totalAllowed } from '../lib/entitlements.js';
import { validateChangeset, countOwnedNames, localDomainSource } from '../lib/pr.js';

const OLD = '2020-01-01T00:00:00.000Z';
const rec = (name, github) => ({ file: `${name}.json`, record: { name, owner: { github }, claimedAt: OLD, records: {} } });

test('backfill: every owner gets 1 included, 0 granted, and every name it owns', () => {
  const plan = planBackfill([rec('preet', 'preetmendpara'), rec('zeta', 'Multi'), rec('alpha', 'multi'), rec('solo', 'solo-dev')]);
  assert.deepEqual(plan.create.map((c) => c.login), ['multi', 'preetmendpara', 'solo-dev']);
  for (const { entitlement } of plan.create) {
    assert.equal(entitlement.included, 1);
    assert.equal(entitlement.adminGranted, 0);
    assert.deepEqual(entitlement.pending, {});
    assert.deepEqual(entitlement.history, []);
  }
  assert.deepEqual(plan.create[0].entitlement.names, ['alpha', 'zeta'], 'owner matched case-insensitively, names sorted');
  assert.equal(plan.create[0].path, 'entitlements/multi.json');
});

test('backfill: an existing entitlement file is never rewritten, grants survive', () => {
  const existing = new Map([['granted', { github: 'granted', included: 1, adminGranted: 7, names: ['one'], history: [{ action: 'grant' }] }]]);
  const plan = planBackfill([rec('one', 'granted'), rec('two', 'granted')], existing);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.kept, [{ login: 'granted', missing: ['two'] }]);
});

test('backfill: records without a usable owner or name are skipped, not guessed', () => {
  const plan = planBackfill([
    { file: 'noowner.json', record: { name: 'noowner', records: {} } },
    { file: 'mismatch.json', record: { name: 'other', owner: { github: 'x' } } },
    { file: 'bad.json', record: { name: 'bad', owner: { github: '../evil' } } },
  ]);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.skipped, ['bad.json', 'mismatch.json', 'noowner.json']);
});

test('backfill script: deterministic, idempotent, and never touches domains/ or owners/', () => {
  const root = mkdtempSync(join(tmpdir(), 'backfill-'));
  mkdirSync(join(root, 'domains'));
  mkdirSync(join(root, 'owners'));
  mkdirSync(join(root, 'entitlements'));
  for (const { file, record } of [rec('aname', 'alice'), rec('bname', 'bob'), rec('bsecond', 'bob')]) {
    writeFileSync(join(root, 'domains', file), JSON.stringify(record));
  }
  writeFileSync(join(root, 'domains', '.gitkeep'), '');
  writeFileSync(join(root, 'owners', 'alice.json'), '{"github":"alice","names":["aname"]}');
  const granted = serializeEntitlement({ github: 'bob', included: 1, adminGranted: 5, names: ['bname', 'bsecond'], pending: {}, history: [] });
  writeFileSync(join(root, 'entitlements', 'bob.json'), granted);

  const snapshot = (dir) => Object.fromEntries(readdirSync(join(root, dir)).map((f) => [f, readFileSync(join(root, dir, f), 'utf8')]));
  const before = { domains: snapshot('domains'), owners: snapshot('owners') };
  const run = (...extra) => execFileSync(process.execPath, ['scripts/backfill-entitlements.mjs', '--root', root, ...extra], { encoding: 'utf8' });

  assert.match(run(), /entitlement files to create: 1/);
  assert.deepEqual(readdirSync(join(root, 'entitlements')), ['bob.json'], 'dry run writes nothing');

  run('--write');
  const first = snapshot('entitlements');
  assert.match(run('--write'), /entitlement files to create: 0/);
  assert.deepEqual(snapshot('entitlements'), first, 'second run changes nothing');

  assert.equal(first['bob.json'], granted, 'an existing grant is kept byte for byte');
  assert.deepEqual(JSON.parse(first['alice.json']), { github: 'alice', included: 1, adminGranted: 0, names: ['aname'], pending: {}, history: [] });
  assert.deepEqual({ domains: snapshot('domains'), owners: snapshot('owners') }, before);
});

// ── stale pull-request validation ─────────────────────────────────────────
// validate.yml counts from the live tip of main, so these build that tip on
// disk and run the same local sources the workflow uses.
function tip({ domains, entitlements = {} }) {
  const root = mkdtempSync(join(tmpdir(), 'tip-'));
  mkdirSync(join(root, 'domains'));
  mkdirSync(join(root, 'entitlements'));
  for (const [name, github] of Object.entries(domains)) {
    writeFileSync(join(root, 'domains', `${name}.json`), JSON.stringify({ name, owner: { github }, claimedAt: OLD, records: {} }));
  }
  for (const [login, ent] of Object.entries(entitlements)) {
    writeFileSync(join(root, 'entitlements', `${login}.json`), JSON.stringify(ent));
  }
  return root;
}

const prClaimAgainst = (root) => validateChangeset({
  files: [{ filename: 'domains/prname.json', status: 'added' }],
  prAuthor: 'author',
  readFile: async () => ({ name: 'prname', owner: { github: 'author' }, claimedAt: OLD, records: {} }),
  readBase: async () => null,
  getUser: async () => ({ created_at: OLD, public_repos: 3 }),
  countOwnedNames: (login) => countOwnedNames(login, localDomainSource(root)),
  getEntitlement: localEntitlementSource(root),
});

test('stale PR: passes at approval time, fails once the author claims on the website', async () => {
  const granted = { github: 'author', included: 1, adminGranted: 1 };
  const atApproval = tip({ domains: { first: 'author' }, entitlements: { author: { ...granted, names: ['first'] } } });
  assert.equal((await prClaimAgainst(atApproval)).ok, true);

  const afterWebsiteClaim = tip({
    domains: { first: 'author', website: 'author' },
    entitlements: { author: { ...granted, names: ['first', 'website'] } },
  });
  const revalidated = await prClaimAgainst(afterWebsiteClaim);
  assert.equal(revalidated.ok, false);
  assert.ok(revalidated.errors.some((e) => e.includes('already owns 2 of 2')));
});

test('stale PR: a website reservation not yet on disk still counts', async () => {
  const root = tip({
    domains: { first: 'author' },
    entitlements: { author: { github: 'author', included: 1, adminGranted: 1, names: ['first', 'midclaim'], pending: { midclaim: OLD } } },
  });
  assert.equal((await prClaimAgainst(root)).ok, false);
});

test('existing owners after backfill keep exactly one slot', async () => {
  const root = tip({ domains: { preet: 'preetmendpara' } });
  const plan = planBackfill([rec('preet', 'preetmendpara')]);
  writeFileSync(join(root, plan.create[0].path), serializeEntitlement(plan.create[0].entitlement));
  assert.equal(totalAllowed(await localEntitlementSource(root)('preetmendpara')), 1);
});

// ── the workflows that keep a pass fresh ──────────────────────────────────
const workflow = (name) => readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', name), 'utf8');

test('validate runs on every PR from the base-branch workflow file, and passes non-registry PRs', () => {
  const yml = workflow('validate.yml');
  assert.match(yml, /on:\n  pull_request_target:\n    types: \[opened, synchronize, reopened\]\n\n/, 'no paths filter, base-branch YAML');
  assert.doesNotMatch(yml, /^  pull_request:/m, 'a pull_request trigger would run the PR\'s own copy of this file');
  assert.match(yml, /permissions:\n  contents: read\n  pull-requests: read/);
  assert.doesNotMatch(yml, /contents: write/);
  // Every step after the scope check is gated on it; the check itself always succeeds.
  const steps = yml.slice(yml.indexOf('id: scope')).split('\n      - ').slice(1);
  assert.ok(steps.length >= 6);
  for (const step of steps) assert.match(step, /^if: steps\.scope\.outputs\.registry == 'true'/, step.slice(0, 60));
  assert.ok(yml.includes("grep -qE '^(domains|entitlements)/'"));
  // Every checkout is the base branch, and none keeps the token.
  const checkouts = yml.split('uses: actions/checkout@v5').slice(1);
  assert.equal(checkouts.length, 2);
  for (const c of checkouts) {
    assert.ok(c.includes('ref: ${{ github.event.pull_request.base.ref }}'));
    assert.ok(c.includes('persist-credentials: false'));
  }
});

test('validate counts registry state at the live base tip, validator code at base too', () => {
  const yml = workflow('validate.yml');
  const registry = yml.slice(yml.indexOf('path: .base-registry') - 200, yml.indexOf('path: .base-registry'));
  assert.match(registry, /ref: \$\{\{ github\.event\.pull_request\.base\.ref \}\}/);
  assert.doesNotMatch(yml, /head\.ref|head\.sha \}\}\n\s+path/);
  assert.match(yml, /REGISTRY_CHECKOUT: \.base-registry/);
});

test('revalidate-prs re-runs validate whenever registry data moves on main', () => {
  const yml = workflow('revalidate-prs.yml');
  assert.match(yml, /branches: \[main\]\n\s+paths: \['domains\/\*\*', 'entitlements\/\*\*'\]/);
  assert.ok(yml.includes('bash scripts/rerun-validate.sh'));
  assert.doesNotMatch(yml, /head\.ref|head\.sha|refs\/pull/, 'no pull-request code is checked out');
  assert.match(readFileSync(join(import.meta.dirname, '..', 'scripts', 'rerun-validate.sh'), 'utf8'), /gh run rerun/);
});

test('deploy ignores entitlement commits', () => {
  assert.match(workflow('deploy.yml'), /paths-ignore: \[[^\]]*'entitlements\/\*\*'/);
});

test('pr-slots runs only base-branch code under pull_request_target', () => {
  const yml = workflow('pr-slots.yml');
  assert.match(yml, /pull_request_target:/);
  assert.match(yml, /ref: \$\{\{ github\.event\.pull_request\.base\.ref \}\}/);
  assert.doesNotMatch(yml, /head\.ref|head\.repo|refs\/pull/, 'never checks out the pull request');
  assert.doesNotMatch(yml, /npm (ci|install)/, 'installs nothing the pull request could influence');
  assert.match(yml, /node scripts\/pr-slots\.mjs/);
});

test('REGISTRY_BRANCH sends every registry read and write to that branch', async () => {
  const { getEntitlement: read, putEntitlement: write } = await import('../lib/entitlements.js');
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return { status: init.method ? 201 : 404, ok: Boolean(init.method), json: async () => ({}) };
  };
  process.env.REGISTRY_BRANCH = 'staging';
  try {
    await read('someone', { fetchImpl });
    await write({ github: 'someone', names: [] }, { fetchImpl, message: 'm' });
  } finally {
    delete process.env.REGISTRY_BRANCH;
  }
  assert.match(calls[0].url, /entitlements\/someone\.json\?ref=staging$/);
  assert.equal(calls[1].body.branch, 'staging');
  await read('someone', { fetchImpl });
  assert.doesNotMatch(calls[2].url, /\?ref=/, 'unset means the default branch');
});
