import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownedNamesFor } from '../lib/owned-names.js';

const rec = (name, github) => ({ name, owner: { github }, records: {} });
const reads = (files) => (n) => files[n] ?? null;

test('lists every verified name, including admin-granted ones only in the entitlement', async () => {
  const r = await ownedNamesFor('Pat', {
    readIndex: () => ({ names: ['bravo'] }),
    readEntitlement: () => ({ login: 'pat', included: 1, adminGranted: 1, names: ['alpha', 'bravo'] }),
    readRecord: reads({ alpha: rec('alpha', 'pat'), bravo: rec('bravo', 'Pat') }),
  });
  assert.deepEqual(r.names, ['alpha', 'bravo']);
});

test('a name whose file names someone else is never listed', async () => {
  const r = await ownedNamesFor('pat', {
    readIndex: () => ({ names: ['alpha', 'stolen'] }),
    readEntitlement: () => null,
    readRecord: reads({ alpha: rec('alpha', 'pat'), stolen: rec('stolen', 'lee') }),
  });
  assert.deepEqual(r.names, ['alpha']);
  assert.equal(r.slotsFree, 0);
});

test('no names and no entitlement leaves the default slot free', async () => {
  const r = await ownedNamesFor('pat', { readIndex: () => null, readEntitlement: () => null, readRecord: () => null });
  assert.deepEqual(r.names, []);
  assert.equal(r.slotsFree, 1);
});

test('read failures degrade to nothing owned rather than throwing', async () => {
  const r = await ownedNamesFor('pat', {
    readIndex: () => { throw new Error('rate limited'); },
    readEntitlement: () => Promise.reject(new Error('x')),
    readRecord: () => null,
  });
  assert.deepEqual(r.names, []);
});
