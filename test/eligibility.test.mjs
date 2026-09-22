import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEligibility } from '../lib/eligibility.js';

const now = new Date('2026-08-30T00:00:00Z');

test('accepts an established account', () => {
  const user = { created_at: '2020-01-01T00:00:00Z', public_repos: 4 };
  assert.deepEqual(checkEligibility(user, now), { ok: true });
});

test('rejects an account younger than 30 days', () => {
  const user = { created_at: '2026-08-20T00:00:00Z', public_repos: 4 };
  assert.deepEqual(checkEligibility(user, now), { ok: false, reason: 'age' });
});

test('accepts an account exactly 30 days old', () => {
  const user = { created_at: '2026-07-31T00:00:00Z', public_repos: 1 };
  assert.equal(checkEligibility(user, now).ok, true);
});

test('rejects an account with no public repos', () => {
  const user = { created_at: '2020-01-01T00:00:00Z', public_repos: 0 };
  assert.deepEqual(checkEligibility(user, now), { ok: false, reason: 'repos' });
});

test('rejects malformed input rather than throwing', () => {
  assert.equal(checkEligibility(null, now).ok, false);
  assert.equal(checkEligibility({ created_at: 'nonsense', public_repos: 3 }, now).ok, false);
});
