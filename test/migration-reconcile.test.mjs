import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync , existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry, reconcile } from '../migration/reconcile.mjs';
import { buildDestinationMap } from '../migration/destination-map.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'reconcile-'));
  for (const d of ['domains', 'owners', 'entitlements']) mkdirSync(join(root, d));
  for (const [p, data] of Object.entries(files)) writeFileSync(join(root, p), JSON.stringify(data));
  return root;
}
const ent = (github, names, extra = {}) => ({ github, included: 1, adminGranted: 0, names, pending: {}, pullRequests: {}, history: [], ...extra });
const kinds = (r) => Object.fromEntries(Object.entries(r.byKind).map(([k, v]) => [k, `${v.classification}:${v.count}`]));

test('reconcile: consistent registry has no issues', () => {
  const root = fixture({
    'domains/aa.json': { name: 'aa', owner: { github: 'Alice' }, records: {} },
    'owners/alice.json': { github: 'alice', names: ['aa'] },
    'entitlements/alice.json': ent('alice', ['aa']),
  });
  try {
    const r = reconcile(loadRegistry(root));
    assert.deepEqual(r.issues, []);
    assert.equal(r.counts.distinctDomainOwners, 1);
  } finally { rmSync(root, { recursive: true }); }
});

test('reconcile: classifies each discrepancy', () => {
  const root = fixture({
    'domains/aa.json': { name: 'aa', owner: { github: 'alice' }, records: {} },
    'domains/bb.json': { name: 'BB', owner: { github: 'bob' }, records: {} }, // filename mismatch, bob has no owners file
    'domains/cc.json': { name: 'cc', owner: { github: 'carol' }, records: {} },
    'owners/alice.json': { github: 'alice', names: ['aa', 'gone', 'cc'] }, // stale + someone else's
    'owners/carol.json': { github: 'carol', names: ['cc'] }, // cc listed twice; carol has no entitlement
    'entitlements/alice.json': ent('alice', ['aa', 'cc', 'pr-name'], { pullRequests: { 'pr-name': 4 } }),
    'entitlements/dave.json': ent('dave', []), // released everything
  });
  try {
    const r = reconcile(loadRegistry(root));
    assert.deepEqual(kinds(r), {
      'domain-filename-mismatch': 'anomaly:1',
      'domain-owner-without-owners-file': 'anomaly:1',
      'owners-name-without-domain': 'anomaly:1',
      'owners-name-owned-by-other': 'anomaly:1',
      'name-in-multiple-owners-files': 'anomaly:1',
      'entitlement-name-owned-by-other': 'anomaly:1',
      'entitlement-name-without-domain': 'expected:1',
      'entitlement-without-owners-file': 'expected:1',
      'owner-without-entitlement': 'expected:1',
    });
    assert.deepEqual(r.entitlementsWithoutOwnersFileByReason, { 'no names held (released, returned, or PR closed)': 1 });
    assert.equal(r.counts.pullRequestReservations, 1);
    // deterministic
    assert.equal(JSON.stringify(r), JSON.stringify(reconcile(loadRegistry(root))));
  } finally { rmSync(root, { recursive: true }); }
});

// Needs the locally generated zone and the live export, both gitignored
// (migration/zone/, migration/backup/). Skipped on a fresh checkout.
const HAVE_LOCAL = existsSync('migration/zone/runs-at.dev.json') && existsSync('migration/backup/live-dns-export.json');
test('destination map: every real claim and declared record has a destination', { skip: !HAVE_LOCAL && 'local migration outputs not present' }, () => {
  const reg = loadRegistry('.');
  const zone = JSON.parse(readFileSync('migration/zone/runs-at.dev.json', 'utf8'));
  const live = JSON.parse(readFileSync('migration/backup/live-dns-export.json', 'utf8'));
  const map = buildDestinationMap(reg, zone, live);
  assert.deepEqual(map.missing, []);
  assert.equal(map.claims.length, reg.domains.length);
  assert.equal(map.owners.length, reg.owners.length);
  assert.equal(map.entitlements.length, reg.entitlements.length);
  for (const c of map.claims) assert.ok(c.registry && c.zoneRecords, c.name);
  for (const r of map.declaredRecords) assert.ok(r.destination?.rrset, `${r.name} ${r.type}`);
});

test('destination map: a declared record absent from the zone is reported missing', () => {
  const reg = { domains: [{ file: 'x.json', data: { name: 'x', owner: { github: 'a' }, records: { CNAME: 'example.com' } } }], owners: [], entitlements: [] };
  const live = { apex: {}, wildcard: {}, system: {} };
  const map = buildDestinationMap(reg, { zone: 'runs-at.dev', records: [] }, live);
  assert.equal(map.missing.length, 1);
});
