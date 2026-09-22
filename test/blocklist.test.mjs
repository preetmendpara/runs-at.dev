import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReserved } from '../lib/blocklist.js';

test('reserves infrastructure labels', () => {
  assert.deepEqual(isReserved('www'), { reserved: true, list: 'infrastructure' });
  assert.deepEqual(isReserved('api'), { reserved: true, list: 'infrastructure' });
});

test('reserves brand names', () => {
  assert.equal(isReserved('stripe').list, 'brands');
  assert.equal(isReserved('anthropic').list, 'brands');
});

test('allows ordinary names', () => {
  assert.deepEqual(isReserved('lucas'), { reserved: false });
  assert.deepEqual(isReserved('my-agent'), { reserved: false });
});

test('matches case-insensitively and trims', () => {
  assert.equal(isReserved('WWW').reserved, true);
  assert.equal(isReserved(' api ').reserved, true);
});

test('does not substring-match', () => {
  assert.equal(isReserved('apiary').reserved, false);
  assert.equal(isReserved('stripey').reserved, false);
});
