import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signSession, readSession, SESSION_TTL_MS } from '../lib/session.js';

const secret = 'test-secret-value';

test('round-trips a payload', () => {
  const now = Date.now();
  const cookie = signSession({ login: 'zordhalo' }, secret, { now });
  assert.deepEqual(readSession(cookie, secret, { now }), {
    login: 'zordhalo',
    exp: now + SESSION_TTL_MS,
  });
});

test('rejects a tampered payload', () => {
  const cookie = signSession({ login: 'zordhalo' }, secret);
  const [body, sig] = cookie.split('.');
  const forged = `${Buffer.from(JSON.stringify({ login: 'admin' })).toString('base64url')}.${sig}`;
  assert.equal(readSession(forged, secret), null);
});

test('rejects a signature from a different secret', () => {
  const cookie = signSession({ login: 'zordhalo' }, 'other-secret');
  assert.equal(readSession(cookie, secret), null);
});

test('rejects malformed cookies without throwing', () => {
  assert.equal(readSession('', secret), null);
  assert.equal(readSession('no-dot', secret), null);
  assert.equal(readSession('a.b.c', secret), null);
});

// The cookie's Max-Age only tells a cooperating browser when to stop sending
// the session. It is not an expiry on the credential itself, so the lifetime
// has to live inside the signed payload where readSession enforces it.
test('stamps an expiry and accepts a session inside it', () => {
  const now = Date.now();
  const cookie = signSession({ login: 'zordhalo' }, secret, { now });
  const out = readSession(cookie, secret, { now: now + 1000 });
  assert.equal(out.login, 'zordhalo');
  assert.equal(out.exp, now + SESSION_TTL_MS);
});

test('rejects a session past its expiry', () => {
  const now = Date.now();
  const cookie = signSession({ login: 'zordhalo' }, secret, { now });
  assert.equal(readSession(cookie, secret, { now: now + SESSION_TTL_MS + 1 }), null);
});

test('expires exactly at the boundary, not a millisecond later', () => {
  const now = Date.now();
  const cookie = signSession({ login: 'zordhalo' }, secret, { now });
  assert.notEqual(readSession(cookie, secret, { now: now + SESSION_TTL_MS - 1 }), null);
  assert.equal(readSession(cookie, secret, { now: now + SESSION_TTL_MS }), null);
});

test('rejects a legacy session carrying no expiry', () => {
  // Signed with the real secret, so the HMAC is valid -- only the missing exp
  // can reject it. Sessions issued before this change must fail closed.
  const body = Buffer.from(JSON.stringify({ login: 'zordhalo' })).toString('base64url');
  const legacy = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
  assert.equal(readSession(legacy, secret), null);
});

test('rejects a non-numeric expiry', () => {
  for (const exp of ['9999999999999', null, {}, NaN]) {
    const body = Buffer.from(JSON.stringify({ login: 'zordhalo', exp })).toString('base64url');
    const forged = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
    assert.equal(readSession(forged, secret), null, `exp ${JSON.stringify(exp)}`);
  }
});

test('an extended expiry does not survive the signature check', () => {
  const now = Date.now();
  const cookie = signSession({ login: 'zordhalo' }, secret, { now });
  const sig = cookie.split('.')[1];
  const stretched = Buffer.from(
    JSON.stringify({ login: 'zordhalo', exp: now + 10 * SESSION_TTL_MS }),
  ).toString('base64url');
  assert.equal(readSession(`${stretched}.${sig}`, secret), null);
});
