// Profile-card registry reads under GitHub failure.
//
// The public card decides between "this name is claimed" and "this name is
// available" from getRecord. Only a real 404 may mean available. A rate limit
// (403/429) or an outage (5xx) must surface as an error -- if any of them
// returned null, every claimed name whose cache had expired would render the
// claim page during a GitHub incident or a quota burst. Verified end to end
// against a local build: a warm card keeps rendering from cache while GitHub
// refuses requests, and a cold one fails with a 500, never a false "available".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRecord } from '../lib/registry.js';

const stub = (status, body) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    };
  };
  return { fetchImpl, calls };
};

for (const status of [403, 429, 500, 502, 503]) {
  test(`card read: GitHub ${status} throws, never reads as unclaimed`, async () => {
    const { fetchImpl } = stub(status);
    await assert.rejects(getRecord('preet', { fetchImpl }), (err) => err.status === status);
  });
}

test('card read: only a 404 reads as unclaimed', async () => {
  const { fetchImpl } = stub(404);
  assert.equal(await getRecord('nobody-here', { fetchImpl }), null);
});

test('card read: one request per lookup, authenticated with the card token', async () => {
  const record = { name: 'preet', owner: { github: 'preetmendpara' }, claimedAt: '2026-01-01T00:00:00.000Z', records: {} };
  const { fetchImpl, calls } = stub(200, {
    content: Buffer.from(JSON.stringify(record)).toString('base64'),
    sha: 'abc',
  });
  assert.deepEqual(await getRecord('preet', { fetchImpl, token: 'card-token' }), record);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/contents\/domains\/preet\.json$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer card-token');
});

test('card read: no Authorization header when no token is configured', async () => {
  const { fetchImpl, calls } = stub(404);
  await getRecord('preet', { fetchImpl });
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

// ── Cache windows on the profile page ─────────────────────────────────────
// Next.js requires `export const revalidate` to be a literal in the page
// file, so these read the source rather than an imported constant.
const PAGE = readFileSync(join(import.meta.dirname, '..', 'app', 'sites', '[name]', 'page.jsx'), 'utf8');

test('card cache: the page revalidates hourly, with the webhook as the fast path', () => {
  assert.match(PAGE, /^export const revalidate = 3600;$/m);
  // The webhook that makes the hour a fallback rather than the freshness
  // window must still exist and still target this route.
  const hook = readFileSync(join(import.meta.dirname, '..', 'app', 'api', 'revalidate', 'route.js'), 'utf8');
  assert.match(hook, /revalidatePath\(`\/sites\/\$\{match\[1\]\}`\)/);
});

test('card cache: the registry record read is cached for the same hour', () => {
  const fetchRecord = PAGE.slice(PAGE.indexOf('async function fetchRecord'), PAGE.indexOf('export async function generateMetadata'));
  assert.match(fetchRecord, /next: \{ revalidate: 3600 \}/);
  assert.match(fetchRecord, /getRecord\(name, \{ token: CARD_TOKEN, fetchImpl \}\)/);
});

test('card cache: the GitHub profile read keeps its one-hour cache', () => {
  const profile = PAGE.slice(PAGE.indexOf('async function githubProfile'), PAGE.indexOf('async function fetchRecord'));
  assert.match(profile, /next: \{ revalidate: 3600 \}/);
});

test('card cache: no 30-second window survives anywhere on the page', () => {
  assert.doesNotMatch(PAGE, /revalidate(:| =) 30\b/);
});
