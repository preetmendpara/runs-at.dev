import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signApiToken, readApiToken, authenticate, API_TOKEN_TTL_MS } from '../lib/api-tokens.js';
import { signSiteToken } from '../lib/tokens.js';
import { updateRecord } from '../lib/record-update.js';
import { publicRecord } from '../lib/api-v1.js';

const SECRET = 'test-secret';
const actor = { login: 'Pat', id: 1, createdAt: '2020-01-01T00:00:00Z', publicRepos: 3 };
const req = (token) => new Request('https://runs-at.dev/api/v1/me', { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('API token: round-trips, expires, and rejects tampering and deploy tokens', () => {
  const now = Date.parse('2026-11-25T00:00:00Z');
  const { token } = signApiToken(actor, SECRET, { now });
  assert.match(token, /^rat1\./);
  assert.equal(readApiToken(token, SECRET, { now }).login, 'Pat');
  assert.equal(readApiToken(token, SECRET, { now: now + API_TOKEN_TTL_MS }), null);
  assert.equal(readApiToken(token, 'other', { now }), null);
  const [p, body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), login: 'admin' })).toString('base64url');
  assert.equal(readApiToken(`${p}.${forged}.${sig}`, SECRET, { now }), null);
  // A deploy token signed with the same secret is not an API token.
  const deploy = signSiteToken({ login: 'Pat', scope: 'sites' }, SECRET, { now }).replace(/^rod1/, 'rat1');
  assert.equal(readApiToken(deploy, SECRET, { now }), null);
});

test('authenticate: missing, invalid, revoked, ok, and fail-closed store', async () => {
  const now = Date.parse('2026-11-25T00:00:00Z');
  const { token } = signApiToken({ ...actor, login: 'auth-user' }, SECRET, { now });
  assert.equal((await authenticate(req(), { secret: SECRET, now })).status, 401);
  assert.equal((await authenticate(req('rat1.x.y'), { secret: SECRET, now })).body.error, 'invalid_token');
  assert.equal((await authenticate(req(token), { secret: undefined, now })).status, 503);
  assert.equal((await authenticate(req(token), { secret: SECRET, now, loader: async () => now + 1 })).body.error, 'token_revoked');
  const { token: t2 } = signApiToken({ ...actor, login: 'store-down' }, SECRET, { now });
  assert.equal((await authenticate(req(t2), { secret: SECRET, now, loader: async () => { throw new Error('down'); } })).status, 503);
  const { token: t3 } = signApiToken({ ...actor, login: 'fine' }, SECRET, { now });
  assert.equal((await authenticate(req(t3), { secret: SECRET, now, loader: async () => 0 })).actor.login, 'fine');
});

const base = { name: 'alpha', owner: { github: 'pat' }, claimedAt: '2026-11-01T00:00:00Z', records: {} };
const deps = (data, writes = []) => ({
  readMeta: async () => (data ? { data, sha: 'abc' } : null),
  writeRecord: async (head) => { writes.push(head); return { ok: true, commit: 'c1' }; },
  probeNameservers: async () => ({ ok: true, results: [{ host: 'a', ok: true, address: '192.0.2.1' }] }),
  probeDs: async () => ({ ok: true }),
});

test('updateRecord: owner can set a CNAME; others and bad input are refused', async () => {
  const writes = [];
  const ok = await updateRecord({ actor, name: 'alpha', body: { records: { CNAME: 'pat.github.io' } }, deps: deps(base, writes) });
  assert.equal(ok.status, 200);
  assert.equal(writes[0].records.CNAME, 'pat.github.io');

  const other = await updateRecord({ actor: { ...actor, login: 'mallory' }, name: 'alpha', body: { records: { CNAME: 'x.example' } }, deps: deps(base) });
  assert.equal(other.status, 403);

  assert.equal((await updateRecord({ actor, name: 'Bad_Name!', body: {}, deps: deps(base) })).status, 400);
  assert.equal((await updateRecord({ actor, name: 'zulu', body: {}, deps: deps(null) })).status, 404);
  const unchanged = await updateRecord({ actor, name: 'alpha', body: { records: {} }, deps: deps(base) });
  assert.equal(unchanged.body.unchanged, true);
});

test('updateRecord: delegation needs an eligible account and answering servers', async () => {
  const young = { ...actor, createdAt: new Date().toISOString() };
  const ns = { nameservers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] };
  assert.equal((await updateRecord({ actor: young, name: 'alpha', body: ns, deps: deps(base) })).body.error, 'delegation_not_allowed');
  const lame = { ...deps(base), probeNameservers: async () => ({ ok: false, results: [{ host: 'ada.ns.cloudflare.com', ok: false, detail: 'has no zone for this name yet' }] }) };
  assert.equal((await updateRecord({ actor, name: 'alpha', body: ns, deps: lame })).body.error, 'nameservers_not_ready');
  const writes = [];
  const done = await updateRecord({ actor, name: 'alpha', body: ns, deps: deps(base, writes) });
  assert.equal(done.status, 200);
  assert.deepEqual(writes[0].nameservers, ns.nameservers);
});

test('publicRecord: stable API shape', () => {
  const r = publicRecord({ ...base, nameservers: ['a.ns.example', 'b.ns.example'] });
  assert.equal(r.fqdn, 'alpha.runs-at.dev');
  assert.equal(r.dns, 'delegated');
  assert.equal(r.owner, 'pat');
});
