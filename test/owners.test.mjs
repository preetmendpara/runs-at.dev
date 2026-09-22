import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOwnerIndex, putOwnerIndex } from '../lib/owners.js';

function stubFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch: ${url}`);
    return { ok: next.status < 400, status: next.status, json: async () => next.body ?? {} };
  };
  impl.calls = calls;
  return impl;
}

test('getOwnerIndex returns null when the index is absent', async () => {
  const fetchImpl = stubFetch([{ status: 404 }]);
  assert.equal(await getOwnerIndex('zordhalo', { fetchImpl }), null);
});

test('getOwnerIndex parses an existing index', async () => {
  const index = { github: 'zordhalo', names: ['lucas'] };
  const content = Buffer.from(JSON.stringify(index)).toString('base64');
  const fetchImpl = stubFetch([{ status: 200, body: { content, encoding: 'base64' } }]);
  assert.deepEqual(await getOwnerIndex('zordhalo', { fetchImpl }), index);
});

test('getOwnerIndex lowercases the login before requesting', async () => {
  const fetchImpl = stubFetch([{ status: 404 }]);
  await getOwnerIndex('ZordHalo', { fetchImpl });
  assert.match(fetchImpl.calls[0].url, /owners\/zordhalo\.json/);
});

test('getOwnerIndex refuses a login with path traversal', async () => {
  const fetchImpl = stubFetch([]);
  await assert.rejects(() => getOwnerIndex('../secrets', { fetchImpl }));
  assert.equal(fetchImpl.calls.length, 0);
});

test('getOwnerIndex refuses a login with invalid characters', async () => {
  const fetchImpl = stubFetch([]);
  await assert.rejects(() => getOwnerIndex('zor$dhalo', { fetchImpl }));
  assert.equal(fetchImpl.calls.length, 0);
});

test('putOwnerIndex creates a new index with no sha', async () => {
  const fetchImpl = stubFetch([{ status: 201 }]);
  const out = await putOwnerIndex('zordhalo', ['lucas'], { token: 't', fetchImpl });
  assert.deepEqual(out, { ok: true });
  const write = fetchImpl.calls[0];
  assert.equal(write.init.method, 'PUT');
  const payload = JSON.parse(write.init.body);
  assert.equal(payload.sha, undefined);
  const decoded = JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8'));
  assert.deepEqual(decoded, { github: 'zordhalo', names: ['lucas'] });
});

test('putOwnerIndex passes sha when updating an existing index', async () => {
  const fetchImpl = stubFetch([{ status: 200 }]);
  const out = await putOwnerIndex('zordhalo', ['lucas', 'second'], {
    token: 't',
    fetchImpl,
    sha: 'abc123',
  });
  assert.deepEqual(out, { ok: true });
  const write = fetchImpl.calls[0];
  const payload = JSON.parse(write.init.body);
  assert.equal(payload.sha, 'abc123');
});

test('putOwnerIndex refuses an invalid login', async () => {
  const fetchImpl = stubFetch([]);
  await assert.rejects(() => putOwnerIndex('Bad/Login', ['x'], { token: 't', fetchImpl }));
  assert.equal(fetchImpl.calls.length, 0);
});
