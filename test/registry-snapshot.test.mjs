import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntries, snapshotFrom, loadRegistrySnapshot } from '../lib/registry-snapshot.js';

const rec = (name, github = name, claimedAt = '2026-11-01T00:00:00.000Z') => ({
  file: `${name}.json`,
  text: JSON.stringify({ name, owner: { github }, claimedAt, records: {} }),
});

function graphql(entries, { oid = 'abc1234def', committedDate = '2026-11-21T00:45:06Z' } = {}) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        repository: {
          ref: {
            target: {
              oid,
              committedDate,
              file: { object: { entries: entries.map((e) => ({ name: e.file, type: 'blob', object: { text: e.text, isTruncated: false } })) } },
            },
          },
        },
      },
    }),
  });
}

const quiet = () => {};

test('every claim file counts once; owners dedupe case-insensitively', () => {
  const s = snapshotFrom({ entries: [rec('a', 'Pat'), rec('b', 'pat'), rec('c', 'Lee'), { file: 'README', text: 'x' }], source: 't' });
  assert.equal(s.claims, 3);
  assert.equal(s.owners, 2);
  assert.deepEqual(s.invalid, []);
});

test('an unparseable or mismatched file is still a claim, and is reported', () => {
  const { records, invalid } = parseEntries([
    rec('ok'),
    { file: 'broken.json', text: '{nope' },
    { file: 'other.json', text: JSON.stringify({ name: 'different', owner: { github: 'x' }, records: {} }) },
    { file: 'big.json', text: null },
  ]);
  assert.equal(records.length, 4);
  assert.deepEqual(invalid.map((i) => i.reason).sort(), ['bad-json', 'name-mismatch', 'unreadable']);
});

test('the live registry wins over the deployed copy, with its commit time as asOf', async () => {
  const live = [rec('a'), rec('b'), rec('c'), rec('new')];
  const s = await loadRegistrySnapshot({ token: 't', fetchImpl: graphql(live), bundled: () => [rec('a'), rec('b'), rec('c')], log: quiet });
  assert.equal(s.source, 'github');
  assert.equal(s.stale, false);
  assert.equal(s.claims, 4);
  assert.equal(s.commit, 'abc1234def');
  assert.equal(s.asOf, '2026-11-21T00:45:06Z');
});

test('a failed live read falls back to the deployed copy and logs why', async () => {
  const logs = [];
  const s = await loadRegistrySnapshot({
    token: 't',
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
    bundled: () => [rec('a'), rec('b')],
    log: (m) => logs.push(m),
  });
  assert.equal(s.source, 'bundle');
  assert.equal(s.stale, true);
  assert.equal(s.claims, 2);
  assert.match(logs[0], /live read failed \(graphql 502\)/);
});

test('graphql errors and a thrown fetch fall back too', async () => {
  const errs = await loadRegistrySnapshot({
    token: 't', fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ message: 'rate limited' }] }) }),
    bundled: () => [rec('a')], log: quiet,
  });
  assert.equal(errs.source, 'bundle');
  const thrown = await loadRegistrySnapshot({ token: 't', fetchImpl: async () => { throw new Error('ECONNRESET'); }, bundled: () => [rec('a')], log: quiet });
  assert.equal(thrown.source, 'bundle');
});

test('a live read far smaller than the deployed copy is treated as partial', async () => {
  const deployed = Array.from({ length: 100 }, (_, i) => rec(`n${i}`));
  const logs = [];
  const s = await loadRegistrySnapshot({ token: 't', fetchImpl: graphql(deployed.slice(0, 40)), bundled: () => deployed, log: (m) => logs.push(m) });
  assert.equal(s.source, 'bundle');
  assert.equal(s.claims, 100);
  assert.match(logs[0], /treating it as partial/);
});

test('one or two releases since the deploy are accepted as real', async () => {
  const deployed = Array.from({ length: 100 }, (_, i) => rec(`n${i}`));
  const s = await loadRegistrySnapshot({ token: 't', fetchImpl: graphql(deployed.slice(0, 98)), bundled: () => deployed, log: quiet });
  assert.equal(s.source, 'github');
  assert.equal(s.claims, 98);
});

test('no token (local dev) quietly uses the deployed copy', async () => {
  const logs = [];
  const s = await loadRegistrySnapshot({ fetchImpl: async () => { throw new Error('must not be called'); }, bundled: () => [rec('a')], log: (m) => logs.push(m) });
  assert.equal(s.source, 'bundle');
  assert.deepEqual(logs, []);
});

test('the snapshot is plain JSON (safe for the Next data cache)', async () => {
  const s = await loadRegistrySnapshot({ token: 't', fetchImpl: graphql([rec('a')]), bundled: () => [rec('a')], log: quiet });
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('homepage and /stats figures come from the same snapshot, so they cannot drift', async () => {
  // Both pages read snapshot.records; stats.summarize(total) and the readout
  // (snapshot.claims) must agree for any registry.
  const { summarize } = await import('../lib/stats.js');
  const s = await loadRegistrySnapshot({ token: 't', fetchImpl: graphql([rec('a'), rec('b', 'A'), rec('c')]), bundled: () => [], log: quiet });
  const stats = summarize(s.records);
  assert.equal(stats.total, s.claims);
  assert.equal(stats.owners, s.owners);
});
