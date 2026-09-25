// Capacity: the registry at 1,000+ claimed names.
//
// Every test here builds a synthetic registry (N claims, N distinct owners)
// in memory or in a throwaway temp directory. Nothing reads or writes the real
// domains/ or owners/. The point is to run the production code paths that
// touch the whole registry -- parsing, stats, owner indexing, DNS planning,
// sweep, availability -- at a size the live registry has not reached yet, and
// to pin the one fact the architecture depends on: a claim by itself costs
// zero DNS records, because *.runs-at.dev is a single wildcard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { validateRecord } from '../lib/schema.js';
import { readRegistry } from '../lib/registry-files.js';
import { summarize } from '../lib/stats.js';
import { geoPlacement } from '../lib/geo-placement.js';
import { planDnsChanges, planSweep, reconcileDnsRecords } from '../lib/dns.js';
import { evaluateClaim, MAX_NAMES_PER_ACCOUNT } from '../lib/claim.js';
import { countOwnedNames, localDomainSource } from '../lib/pr.js';
import { claimedNamesFromTree, similarNames } from '../lib/similar-names.js';
import { validateName } from '../lib/name.js';
import { isReserved } from '../lib/blocklist.js';

const N = 1200;
const pad = (i) => String(i).padStart(4, '0');

// A realistic mix. Most claims keep the default profile card (no records at
// all); a minority point somewhere or add their own records.
function syntheticClaim(i) {
  const base = {
    name: `user${pad(i)}`,
    owner: { github: `dev-${pad(i)}` },
    claimedAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
  };
  const kind = i % 10;
  if (kind <= 6) return { ...base, records: {} }; // 70% profile card
  if (kind <= 8) return { ...base, records: { CNAME: `dev-${pad(i)}.github.io` } }; // 20% hosting
  return {
    ...base, // 10% custom records
    records: { A: [`203.0.113.${i % 250}`], AAAA: ['2001:db8::1'], TXT: [`site-verification=${pad(i)}`] },
  };
}

const CLAIMS = Array.from({ length: N }, (_, i) => syntheticClaim(i + 1));
const session = { login: 'newcomer', createdAt: '2020-01-01T00:00:00Z', publicRepos: 3 };
const timed = (fn) => {
  const t = process.hrtime.bigint();
  const out = fn();
  return { out, ms: Number(process.hrtime.bigint() - t) / 1e6 };
};

function writeRegistry(dir, claims) {
  mkdirSync(dir, { recursive: true });
  for (const c of claims) writeFileSync(join(dir, `${c.name}.json`), `${JSON.stringify(c, null, 2)}\n`);
}

test(`capacity: all ${N} synthetic records pass schema validation`, () => {
  const bad = CLAIMS.map(validateRecord).filter((r) => !r.ok);
  assert.equal(bad.length, 0, JSON.stringify(bad[0]));
});

test(`capacity: every synthetic name is a valid, unreserved label`, () => {
  for (const c of CLAIMS) {
    assert.equal(validateName(c.name).ok, true, c.name);
    assert.equal(isReserved(c.name).reserved, false, c.name);
  }
});

test(`capacity: readRegistry parses ${N} files from disk`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cap-reg-'));
  try {
    writeRegistry(dir, CLAIMS);
    const { out, ms } = timed(() => readRegistry(dir));
    assert.equal(out.length, N);
    assert.equal(new Set(out.map((r) => r.name)).size, N);
    // Generous ceiling: this runs once per server instance / build, not per
    // request. It is here to catch an accidental quadratic, not to benchmark.
    assert.ok(ms < 5000, `readRegistry took ${ms}ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`capacity: stats count ${N} claims and ${N} owners exactly`, () => {
  const { out, ms } = timed(() => summarize(CLAIMS, { now: new Date('2026-06-01T00:00:00Z') }));
  assert.equal(out.total, N);
  assert.equal(out.owners, N);
  assert.ok(ms < 2000, `summarize took ${ms}ms`);
});

test(`capacity: geo placement handles ${N} owners`, () => {
  const { out, ms } = timed(() => geoPlacement(CLAIMS, {}, {}));
  assert.equal(out.total, N);
  assert.ok(ms < 2000, `geoPlacement took ${ms}ms`);
});

test('capacity: a profile-card claim plans zero DNS records -- the wildcard serves it', () => {
  const cards = CLAIMS.filter((c) => Object.keys(c.records).length === 0);
  assert.ok(cards.length >= 800);
  for (const c of cards) assert.deepEqual(planDnsChanges(c), [], c.name);
});

test(`capacity: DNS records are spent only by names that set their own`, () => {
  const planned = CLAIMS.flatMap(planDnsChanges);
  const withRecords = CLAIMS.filter((c) => Object.keys(c.records).length > 0).length;
  // 20% CNAME (1 record) + 10% A+AAAA+TXT (3 records) = 0.2N + 0.3N.
  assert.equal(planned.length, N * 0.2 + N * 0.3);
  assert.equal(withRecords, N * 0.3);
  // So zone usage tracks custom-record adoption, not the number of claims:
  // 1,200 claims here cost 600 records; the same 1,200 as profile cards
  // would cost none.
});

test(`capacity: sweep over ${N} claims against an in-sync zone finds no drift`, () => {
  const zone = CLAIMS.flatMap(planDnsChanges).map((c) => ({
    type: c.type,
    name: c.name,
    value: c.value,
    mxPriority: c.priority,
  }));
  const { out: drift, ms } = timed(() => planSweep(CLAIMS, zone));
  assert.deepEqual(drift, []);
  assert.ok(ms < 3000, `planSweep took ${ms}ms`);
});

test('capacity: sweep isolates one drifted name among the rest', () => {
  const zone = CLAIMS.flatMap(planDnsChanges)
    .map((c) => ({ type: c.type, name: c.name, value: c.value, mxPriority: c.priority }))
    .filter((r) => r.name !== 'user0008'); // user0008 is a CNAME claim; drop its record
  const drift = planSweep(CLAIMS, zone);
  assert.deepEqual(drift.map((d) => d.name), ['user0008']);
});

test('capacity: reconciling one name is independent of registry size', () => {
  const c = CLAIMS[9]; // a custom-records claim
  const desired = planDnsChanges(c);
  const existing = desired.map((d) => ({ type: d.type, name: d.name, value: d.value }));
  const { remove, create } = reconcileDnsRecords(existing, desired);
  assert.deepEqual([remove.length, create.length], [0, 0]);
});

test('capacity: availability -- a new name is claimable with the registry full', () => {
  const r = evaluateClaim({ name: 'fresh-name', session, existing: null, ownedCount: 0 });
  assert.equal(r.ok, true);
});

test('capacity: availability -- an existing name among many is reported taken', () => {
  const existing = CLAIMS[N - 1];
  const r = evaluateClaim({ name: existing.name, session, existing, ownedCount: 0 });
  assert.equal(r.code, 'taken');
});

test('capacity: the one-name rule holds at any registry size', () => {
  assert.equal(MAX_NAMES_PER_ACCOUNT, 1);
  const r = evaluateClaim({ name: 'second-name', session, existing: null, ownedCount: 1 });
  assert.equal(r.code, 'limit_reached');
});

test('capacity: there is no total-claims ceiling in the claim decision', () => {
  // evaluateClaim never sees the registry size -- only this account's count
  // and whether this one name exists -- so N has no way to refuse a claim.
  for (const ownedCount of [0]) {
    const r = evaluateClaim({ name: `user${pad(N + 1)}`, session, existing: null, ownedCount });
    assert.equal(r.ok, true);
  }
});

test(`capacity: PR owned-name count is correct over ${N} records given a complete listing`, async () => {
  const byFile = new Map(CLAIMS.map((c) => [`domains/${c.name}.json`, c]));
  let reads = 0;
  const count = await countOwnedNames('dev-0700', {
    listDomainEntries: async () => CLAIMS.map((c) => ({ type: 'file', name: `${c.name}.json` })),
    readRecord: async (p) => {
      reads += 1;
      return byFile.get(p);
    },
  });
  assert.equal(count, 1);
  // One read per record. CI now serves these reads from a local checkout
  // (localDomainSource), so they cost disk reads, not GitHub API requests.
  assert.equal(reads, N);
});

test(`capacity: sync-owners rebuilds ${N} owner files, then is a no-op`, () => {
  const root = mkdtempSync(join(tmpdir(), 'cap-owners-'));
  try {
    // The real script, run against a synthetic checkout: it resolves domains/
    // and owners/ relative to its own location.
    mkdirSync(join(root, 'scripts'));
    cpSync(join(import.meta.dirname, '..', 'scripts', 'sync-owners.mjs'), join(root, 'scripts', 'sync-owners.mjs'));
    writeRegistry(join(root, 'domains'), CLAIMS);

    const first = timed(() => execFileSync(process.execPath, [join(root, 'scripts', 'sync-owners.mjs')], { encoding: 'utf8' }));
    const owners = readdirSync(join(root, 'owners')).filter((f) => f.endsWith('.json'));
    assert.equal(owners.length, N);
    const sample = JSON.parse(readFileSync(join(root, 'owners', 'dev-0042.json'), 'utf8'));
    assert.deepEqual(sample, { github: 'dev-0042', names: ['user0042'] });
    assert.ok(first.ms < 30000, `sync-owners took ${first.ms}ms`);

    // Second run over an unchanged registry writes nothing.
    const second = execFileSync(process.execPath, [join(root, 'scripts', 'sync-owners.mjs')], { encoding: 'utf8' });
    assert.doesNotMatch(second, /-> \d+ name/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Fix 1: pull-request owner counting reads a checkout, not the API ──────
// The Contents API lists at most 1,000 files per directory, so an owner whose
// record sorted past the first 1,000 was invisible to the one-name check.
// These tests put the only matching records beyond that point and make any
// network access fail, so they pass only if counting is local and complete.

function withNoNetwork(fn) {
  return async () => {
    const real = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('network access during owner counting');
    };
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
    }
  };
}

test(
  `capacity: PR owner counting finds an owner past the first 1,000 of ${N} files, from disk`,
  withNoNetwork(async () => {
    const root = mkdtempSync(join(tmpdir(), 'cap-pr-'));
    try {
      writeRegistry(join(root, 'domains'), CLAIMS);
      writeFileSync(join(root, 'domains', '.gitkeep'), '');
      const source = localDomainSource(root);

      // dev-1150 owns user1150: the 1,150th file, beyond any 1,000-entry cap.
      assert.equal(await countOwnedNames('dev-1150', source), 1);
      assert.equal(await countOwnedNames('DEV-1150', source), 1, 'login comparison is case-insensitive');
      assert.equal(await countOwnedNames('nobody-here', source), 0);
      const entries = await source.listDomainEntries();
      assert.equal(entries.filter((e) => e.name.endsWith('.json')).length, N);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }),
);

test(
  'capacity: PR owner counting sees a second name owned past entry 1,000 (one-name rule holds)',
  withNoNetwork(async () => {
    const root = mkdtempSync(join(tmpdir(), 'cap-pr2-'));
    try {
      // dev-0005 already owns user0005 (early in the listing) and, in this
      // scenario, also zz-late-name, which sorts after all 1,200 others.
      const late = { ...syntheticClaim(5), name: 'zz-late-name' };
      writeRegistry(join(root, 'domains'), [...CLAIMS, late]);
      assert.equal(await countOwnedNames('dev-0005', localDomainSource(root)), 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }),
);

test('capacity: PR owner counting still fails closed on a corrupt record', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cap-pr3-'));
  try {
    writeRegistry(join(root, 'domains'), CLAIMS.slice(0, 5));
    writeFileSync(join(root, 'domains', 'broken.json'), '{ not json');
    await assert.rejects(countOwnedNames('dev-0001', localDomainSource(root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Fix 2: suggestions list the registry through the Git Trees API ────────

// The shape GET /repos/{owner}/{repo}/git/trees/main:domains returns.
function treeBody(names) {
  return {
    sha: 'f'.repeat(40),
    truncated: false,
    tree: [
      { path: '.gitkeep', type: 'blob', mode: '100644' },
      ...names.map((n) => ({ path: `${n}.json`, type: 'blob', mode: '100644' })),
      { path: 'nested', type: 'tree', mode: '040000' },
    ],
  };
}

test('capacity: the registry listing keeps every name past the first 1,000', () => {
  const names = Array.from({ length: 1500 }, (_, i) => `user${pad(i + 1)}`);
  const claimed = claimedNamesFromTree(treeBody(names));
  assert.equal(claimed.length, 1500, '.gitkeep and the subtree are skipped; nothing is capped');
  assert.equal(claimed[1499], 'user1500');
});

test('capacity: suggestions surface a claimed name that sits past entry 1,000', () => {
  const names = Array.from({ length: 1500 }, (_, i) => `user${pad(i + 1)}`);
  names.splice(1400, 0, 'kittycat'); // the only near match, at position 1,401
  assert.deepEqual(similarNames('kittycap', claimedNamesFromTree(treeBody(names))), ['kittycat']);
});

test('capacity: suggestion ranking is unchanged -- nearest first, at most three, never itself', () => {
  const claimed = ['preet', 'pret', 'preets', 'prat', 'zzz'];
  assert.deepEqual(similarNames('preet', claimed), ['pret', 'preets', 'prat']);
  assert.deepEqual(claimedNamesFromTree({}), []);
  assert.deepEqual(claimedNamesFromTree(null), []);
});
