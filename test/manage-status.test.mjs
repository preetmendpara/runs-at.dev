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

// ── Feature cards ────────────────────────────────────────────
import { featureCards, PUBLISHING_WINDOW_MS } from '../lib/manage-status.js';

const cards = (over = {}) => featureCards({ savedMode: 'card', records: {}, check: null, now: 1_000_000, ...over });
const byId = (list, id) => list.find((c) => c.id === id);

test('exactly one card is in use, and it matches the saved record', () => {
  const list = cards({ savedMode: 'cname', records: { CNAME: 'you.github.io' } });
  assert.equal(list.filter((c) => c.inUse).length, 1);
  assert.equal(byId(list, 'cname').inUse, true);
  assert.equal(byId(list, 'cname').summary, 'you.github.io');
  for (const id of ['card', 'url', 'advanced']) {
    assert.equal(byId(list, id).status.label, 'Not in use');
    assert.equal(byId(list, id).status.detail, null, `${id} carries no verdict`);
  }
});

test('the four options always appear, in a fixed order', () => {
  assert.deepEqual(cards().map((c) => c.id), ['card', 'cname', 'url', 'advanced']);
});

test('a working name reads Live on its own card only', () => {
  const list = cards({ savedMode: 'cname', records: { CNAME: 'you.github.io' }, check: { serving: { status: 'ok', title: 'My site' } } });
  assert.equal(byId(list, 'cname').status.tone, 'live');
  assert.match(byId(list, 'cname').status.detail, /My site/);
  assert.equal(byId(list, 'cname').action, 'Change');
});

test('a card answer on a pointed name needs attention and offers the fix', () => {
  const list = cards({ savedMode: 'cname', records: { CNAME: 'you.github.io' }, check: { serving: { status: 'stuck' } } });
  assert.equal(byId(list, 'cname').status.label, 'Needs attention');
  assert.equal(byId(list, 'cname').action, 'Fix this');
});

// The most common false alarm: DNS is committed but the sync workflow has
// not published it yet, so the name still answers with the card.
test('a save made moments ago reads as publishing, not as broken', () => {
  const now = 1_000_000;
  const list = cards({ savedMode: 'cname', records: { CNAME: 'you.github.io' }, check: { serving: { status: 'stuck' } }, savedAt: now - 30_000, now });
  assert.equal(byId(list, 'cname').status.tone, 'waiting');
  assert.match(byId(list, 'cname').status.detail, /minute or two/);
});

test('past the publishing window the same answer is a problem again', () => {
  const now = 1_000_000;
  const list = cards({ savedMode: 'cname', records: { CNAME: 'you.github.io' }, check: { serving: { status: 'stuck' } }, savedAt: now - PUBLISHING_WINDOW_MS - 1, now });
  assert.equal(byId(list, 'cname').status.tone, 'attention');
});

test('the profile card in use is live and edits its own details', () => {
  const list = cards({ savedMode: 'card', check: { serving: { status: 'card' } } });
  assert.equal(byId(list, 'card').status.tone, 'live');
  assert.equal(byId(list, 'card').action, 'Edit card details');
});

test('a redirect names where it sends people', () => {
  const list = cards({ savedMode: 'url', records: { URL: 'https://example.com' }, check: { serving: { status: 'redirect', finalUrl: 'https://example.com' } } });
  assert.equal(byId(list, 'url').summary, 'https://example.com');
  assert.equal(byId(list, 'url').status.tone, 'live');
});

test('DNS records counts what is published and manages them', () => {
  const list = cards({ savedMode: 'advanced', records: { A: ['1.2.3.4'], TXT: ['a', 'b'] }, check: { serving: { status: 'ok' } } });
  assert.equal(byId(list, 'advanced').summary, '3 records');
  assert.equal(byId(list, 'advanced').action, 'Manage records');
  assert.equal(featureCards({ savedMode: 'advanced', records: { A: ['1.2.3.4'] } })[3].summary, '1 record');
});

test('before the first check nothing is declared broken', () => {
  const list = cards({ savedMode: 'cname', records: { CNAME: 'you.github.io' }, check: null });
  assert.equal(byId(list, 'cname').status.tone, 'checking');
  assert.notEqual(byId(list, 'cname').action, 'Fix this');
});
