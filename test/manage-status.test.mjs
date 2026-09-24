// The words /manage shows: what a name is doing, and what a refused save
// means. Both are the difference between an owner knowing what to do next
// and an owner reading schema internals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteStatus, friendlyError, friendlyDetail, CHECK_SCHEDULE_MS } from '../lib/manage-status.js';

const serving = (status, extra = {}) => ({ serving: { status, ...extra } });

test('a name serving its own site reads as live', () => {
  const out = siteStatus(serving('ok', { title: 'My site' }), 'cname');
  assert.equal(out.tone, 'live');
  assert.match(out.detail, /My site/);
});

test('a redirect names where visitors land', () => {
  const out = siteStatus(serving('redirect', { finalUrl: 'https://example.com' }), 'url');
  assert.equal(out.tone, 'live');
  assert.match(out.detail, /example\.com/);
});

test('the profile card is success only when the card is what was picked', () => {
  assert.equal(siteStatus(serving('card'), 'card').tone, 'live');
  const pointed = siteStatus(serving('card'), 'cname');
  assert.equal(pointed.tone, 'waiting');
  assert.equal(pointed.label, 'Not working yet');
});

test('a stuck name is never reported as working', () => {
  assert.equal(siteStatus(serving('stuck'), 'cname').tone, 'waiting');
});

// The old badge had no branch for this and displayed it as "Card", which
// told an owner whose site was down that everything was fine.
test('a name that does not answer says so', () => {
  const out = siteStatus(serving('down'), 'cname');
  assert.equal(out.tone, 'down');
  assert.equal(out.label, 'Not answering');
});

test('no reading yet reads as checking, never as a verdict', () => {
  assert.equal(siteStatus(null, 'cname').tone, 'checking');
});

test('save failures explain themselves without schema words', () => {
  assert.match(friendlyError(403, { error: 'not_owner' })[0], /owner of this name/);
  assert.match(friendlyError(409, { error: 'stale' })[0], /Reload the page/);
  assert.match(friendlyError(429, { error: 'rate_limited', retryInMs: 30000 })[0], /30 seconds/);
  assert.match(friendlyError(503, { error: 'busy' })[0], /busy/);
  assert.match(friendlyError(401, {})[0], /[Ss]ign in/);
  assert.deepEqual(friendlyError(500, {}), ['Could not save just now. Try again in a moment.']);
});

test('record errors name the thing the owner typed', () => {
  const out = friendlyError(400, { error: 'invalid_record', details: ['records.CNAME must be a hostname'] });
  assert.match(out[0], /you\.github\.io/);
  assert.ok(!out[0].includes('records.CNAME'), 'no schema path leaks through');
  assert.match(friendlyDetail('URL must be an absolute http(s) URL'), /https:\/\//);
  assert.match(friendlyDetail('subdomains._vercel.TXT must be an array'), /_vercel/);
  assert.match(friendlyDetail('MX must be an array of 1 to 5 entries'), /1 and 5/);
});

test('an unrecognised message is passed through rather than swallowed', () => {
  assert.equal(friendlyDetail('some new rule'), 'some new rule');
  assert.equal(friendlyDetail(''), 'Something in the form was not accepted.');
});

// /api/dns-check allows 10 checks a minute per name; the old panel polled
// every 8 seconds forever and ignored the refusal that followed.
test('the post-save schedule stays inside the rate limit', () => {
  assert.ok(CHECK_SCHEDULE_MS.length <= 5);
  const withinFirstMinute = CHECK_SCHEDULE_MS.filter((ms) => ms <= 60_000).length;
  assert.ok(withinFirstMinute < 10, 'leaves room for Check now and a second tab');
  assert.deepEqual([...CHECK_SCHEDULE_MS].sort((x, y) => x - y), CHECK_SCHEDULE_MS);
});
