import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateName } from '../lib/name.js';

test('accepts ordinary names', () => {
  for (const n of ['lucas', 'ab', 'my-agent', 'a1', 'x'.repeat(32)]) {
    assert.equal(validateName(n).ok, true, `expected ${n} to be valid`);
  }
});

test('rejects bad lengths', () => {
  assert.deepEqual(validateName('a'), { ok: false, reason: 'length' });
  assert.deepEqual(validateName('x'.repeat(33)), { ok: false, reason: 'length' });
  assert.deepEqual(validateName(''), { ok: false, reason: 'length' });
});

test('rejects non-ascii and uppercase', () => {
  assert.equal(validateName('Lucas').reason, 'charset');
  assert.equal(validateName('lucás').reason, 'charset');
  assert.equal(validateName('my_agent').reason, 'charset');
});

test('rejects leading and trailing hyphens', () => {
  assert.equal(validateName('-lucas').reason, 'hyphen');
  assert.equal(validateName('lucas-').reason, 'hyphen');
});

test('rejects the punycode prefix pattern', () => {
  assert.equal(validateName('xn--abc').reason, 'punycode');
  assert.equal(validateName('ab--cd').reason, 'punycode');
});

test('rejects non-string input', () => {
  assert.equal(validateName(null).ok, false);
  assert.equal(validateName(42).ok, false);
});
