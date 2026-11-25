import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord, validateDs } from '../lib/schema.js';
import { planDnsChanges, planZoneVerificationRecords } from '../lib/dns.js';
import { desiredFromClaims, validateDesired } from '../lib/dns/records.js';
import { mayDelegate, checkNameservers } from '../lib/delegation.js';
import { classifyClaim } from '../lib/health.js';

const base = { name: 'preet', owner: { github: 'p' }, claimedAt: '2026-01-01T00:00:00Z', records: {} };
const DS = '56919 13 2 A44A3CF52453541B3648844C105EC5BD600CFC4DE5CD84C3BA8BFA3E4E2393AD';
const NS = ['aida.ns.cloudflare.com', 'damon.ns.cloudflare.com'];

test('schema: a delegated name with 2 nameservers and a DS is valid', () => {
  assert.deepEqual(validateRecord({ ...base, nameservers: NS, ds: [DS] }), { ok: true, errors: [] });
});

test('schema: delegation refuses records, subdomains, a lone nameserver, runs-at.dev servers and bad DS', () => {
  assert.equal(validateRecord({ ...base, records: { CNAME: 'x.github.io' }, nameservers: NS }).ok, false);
  assert.equal(validateRecord({ ...base, subdomains: { www: { CNAME: 'x.github.io' } }, nameservers: NS }).ok, false);
  assert.equal(validateRecord({ ...base, nameservers: ['a.example.com'] }).ok, false);
  assert.equal(validateRecord({ ...base, nameservers: ['ns1.runs-at.dev', 'b.example.com'] }).ok, false);
  assert.equal(validateRecord({ ...base, nameservers: ['a.example.com', 'a.example.com'] }).ok, false);
  assert.equal(validateRecord({ ...base, ds: [DS] }).ok, false, 'ds without nameservers');
  assert.equal(validateDs('56919 13 2 ABCD'), false, 'digest too short for SHA-256');
  assert.equal(validateDs(DS), true);
});

test('dns plan: a delegated claim publishes NS and DS at its name and nothing else', () => {
  const plan = planDnsChanges({ ...base, nameservers: ['AIDA.ns.cloudflare.com.', 'damon.ns.cloudflare.com'], ds: [DS.toLowerCase()] });
  assert.deepEqual(plan, [
    { type: 'NS', name: 'preet', value: 'aida.ns.cloudflare.com' },
    { type: 'NS', name: 'preet', value: 'damon.ns.cloudflare.com' },
    { type: 'DS', name: 'preet', value: DS },
  ]);
});

test('zone records: NS and DS validate, and a delegated name gets no edge A', () => {
  const recs = desiredFromClaims([{ ...base, nameservers: NS, ds: [DS] }], 'runs-at.dev', { planDnsChanges, planZoneVerificationRecords, edgeIp: '192.0.2.10' });
  assert.deepEqual(validateDesired(recs), []);
  assert.deepEqual(recs.map((r) => `${r.type} ${r.content}`), ['NS aida.ns.cloudflare.com.', 'NS damon.ns.cloudflare.com.', `DS ${DS}`]);
});

test('gate: account age and a public repository', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  assert.equal(mayDelegate({ createdAt: '2026-05-20T00:00:00Z', publicRepos: 3 }, { now }).ok, false);
  assert.equal(mayDelegate({ createdAt: '2025-01-01T00:00:00Z', publicRepos: 0 }, { now }).ok, false);
  assert.equal(mayDelegate({ createdAt: '2025-01-01T00:00:00Z', publicRepos: 1 }, { now }).ok, true);
});

function fakeResolver({ addresses = {}, soa = {} }) {
  return () => {
    let servers = [];
    return {
      setServers: (s) => { servers = s; },
      resolve4: async (h) => { if (addresses[h]) return addresses[h]; throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); },
      resolve6: async () => { throw Object.assign(new Error('x'), { code: 'ENODATA' }); },
      resolveSoa: async () => { const r = soa[servers[0]]; if (r) return r; throw Object.assign(new Error('x'), { code: 'EREFUSED' }); },
    };
  };
}

test('pre-check: every nameserver must resolve and answer for the name', async () => {
  const makeResolver = fakeResolver({
    addresses: { 'aida.ns.cloudflare.com': ['192.0.2.1'], 'damon.ns.cloudflare.com': ['192.0.2.2'] },
    soa: { '192.0.2.1': { serial: 7 } },
  });
  const r = await checkNameservers('preet.runs-at.dev', NS, { makeResolver });
  assert.equal(r.ok, false);
  assert.deepEqual(r.results.map((x) => x.ok), [true, false]);
  assert.match(r.results[1].detail, /refuses/);

  const ok = await checkNameservers('preet.runs-at.dev', NS, {
    makeResolver: fakeResolver({
      addresses: { 'aida.ns.cloudflare.com': ['192.0.2.1'], 'damon.ns.cloudflare.com': ['192.0.2.2'] },
      soa: { '192.0.2.1': { serial: 7 }, '192.0.2.2': { serial: 7 } },
    }),
  });
  assert.equal(ok.ok, true);
});

test('health: a delegated name is reported as delegated, never stuck or down', () => {
  assert.equal(classifyClaim({ ...base, nameservers: NS }, { ok: false }), 'delegated');
});
