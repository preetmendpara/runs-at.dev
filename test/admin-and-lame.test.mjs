import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameRows, userRows, overview, modeOfRecord } from '../lib/admin-data.js';
import { planLameActions, lameTitle, LAME_GRACE_DAYS } from '../lib/delegation.js';
import { dsFor, keyTag, parseDnskeys, buildQuery, checkDs } from '../lib/dnskey.js';
import { POST as adminNames } from '../app/api/admin/names/route.js';

const rec = (name, github, extra = {}) => ({ name, owner: { github }, claimedAt: '2026-11-20T00:00:00Z', records: {}, ...extra });

test('admin data: modes, users grouped case-insensitively, overview counts', () => {
  const records = [
    rec('alpha', 'Pat', { records: { CNAME: 'pat.github.io' } }),
    rec('bravo', 'pat'),
    rec('charlie', 'lee', { records: { URL: 'https://x.example' } }),
    rec('delta', 'kim', { nameservers: ['a.ns.example', 'b.ns.example'] }),
  ];
  assert.equal(modeOfRecord(records[3]), 'delegated');
  const rows = nameRows(records);
  assert.deepEqual(rows.map((r) => r.mode).sort(), ['card', 'delegated', 'hosted', 'redirect']);
  const users = userRows(rows);
  assert.equal(users[0].login.toLowerCase(), 'pat');
  assert.deepEqual(users[0].names, ['alpha', 'bravo']);
  const o = overview(rows, { now: Date.parse('2026-11-25T00:00:00Z') });
  assert.equal(o.claims, 4);
  assert.equal(o.owners, 3);
  assert.equal(o.multiNameOwners, 1);
  assert.equal(o.last7d, 4);
  assert.equal(o.last24h, 0);
});

test('admin names API refuses anyone but the admin', async () => {
  const res = await adminNames(new Request('https://runs-at.dev/api/admin/names', { method: 'POST', body: JSON.stringify({ name: 'alpha', action: 'release' }) }));
  assert.equal(res.status, 401);
});

const DAY = 86_400_000;
const issue = (name, number, daysOld, now) => ({ title: lameTitle(name), number, state: 'open', created_at: new Date(now - daysOld * DAY).toISOString() });

test('lame delegations: open once, revert after the grace period, close when recovered', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  const plan = planLameActions({
    lame: ['newly', 'waiting', 'expired'],
    delegated: ['newly', 'waiting', 'expired', 'healed'],
    issues: [issue('waiting', 1, 2, now), issue('expired', 2, LAME_GRACE_DAYS + 1, now), issue('healed', 3, 3, now), issue('gone', 4, 1, now)],
    now,
  });
  assert.deepEqual(plan.toOpen, ['newly']);
  assert.deepEqual(plan.toRevert, [{ name: 'expired', issue: 2 }]);
  assert.deepEqual(plan.toClose.map((c) => [c.name, c.recovered]).sort(), [['gone', false], ['healed', true]]);
});

test('DS: one derived DS per digest type, in presentation form', () => {
  // Synthetic key bytes (flags 257, protocol 3, algorithm 13). The derivation
  // was also checked by hand against runs-at.dev's live key: checkDs accepts
  // its published DS "56919 13 2 A44A…93AD" when queried from ns1.
  const key = Buffer.from('0101030dd9e0f4a7d5a3fdbb4e33d0d4d2a43ec74b1bdfc0bd4f4cc77c3c19e15c11dc2bc1ec3da19c3bf1fa30c07b8cfa1c99a8bb6c1df0e4c1a12bb6e9ceb4fd5ea64d', 'hex');
  const ds = dsFor('runs-at.dev', key);
  assert.equal(ds.length, 3);
  assert.match(ds[1], new RegExp(`^${keyTag(key)} 13 2 [0-9A-F]{64}$`));
});

test('DS check: matching DS passes, unknown DS and no keys fail', async () => {
  const key = Buffer.from('0101030d' + 'ab'.repeat(64), 'hex');
  const good = dsFor('x.runs-at.dev', key)[1];
  assert.equal((await checkDs('x.runs-at.dev', [good.toLowerCase()], '192.0.2.1', { fetchKeys: async () => [key] })).ok, true);
  assert.equal((await checkDs('x.runs-at.dev', [`1 13 2 ${'0'.repeat(64)}`], '192.0.2.1', { fetchKeys: async () => [key] })).ok, false);
  assert.equal((await checkDs('x.runs-at.dev', [good], '192.0.2.1', { fetchKeys: async () => [] })).ok, false);
});

test('DNSKEY wire: a built query parses back to the keys in an answer', () => {
  const q = buildQuery('x.runs-at.dev', 48, 7);
  const key = Buffer.from('0101030d' + 'cd'.repeat(64), 'hex');
  const header = Buffer.from(q.subarray(0, 12));
  header.writeUInt16BE(1, 6); // one answer
  const rr = Buffer.alloc(10);
  rr.writeUInt16BE(48, 0); rr.writeUInt16BE(1, 2); rr.writeUInt32BE(300, 4); rr.writeUInt16BE(key.length, 8);
  const msg = Buffer.concat([header, q.subarray(12), Buffer.from([0xc0, 12]), rr, key]);
  assert.deepEqual(parseDnskeys(msg), [key]);
});
