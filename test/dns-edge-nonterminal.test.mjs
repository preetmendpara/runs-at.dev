import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desiredFromClaims } from '../lib/dns/records.js';
import { planDnsChanges, planZoneVerificationRecords } from '../lib/dns.js';

const claim = (name, records = {}, subdomains) => ({ name, owner: { github: 'x' }, claimedAt: '2026-11-01T00:00:00Z', records, ...(subdomains ? { subdomains } : {}) });
const a = (recs, name) => recs.filter((r) => r.type === 'A' && r.name === `${name}.runs-at.dev.`).map((r) => r.content);
const opts = { planDnsChanges, planZoneVerificationRecords, edgeIp: '192.0.2.10' };

test('a card claim with sub-records gets an explicit edge A (the wildcard no longer covers it)', () => {
  const recs = desiredFromClaims([claim('acid', {}, { prod: { CNAME: 'x.github.io' } })], 'runs-at.dev', opts);
  assert.deepEqual(a(recs, 'acid'), ['192.0.2.10']);
});

test('a URL claim with a _vercel TXT below it also gets the edge A', () => {
  const recs = desiredFromClaims([claim('go', { URL: 'https://example.com' }, { _vercel: { TXT: ['vc-domain-verify=go.runs-at.dev,abc'] } })], 'runs-at.dev', opts);
  assert.deepEqual(a(recs, 'go'), ['192.0.2.10']);
});

test('a bare card claim stays on the wildcard; pointed and advanced claims are untouched', () => {
  const recs = desiredFromClaims([
    claim('bare'),
    claim('pointed', { CNAME: 'x.github.io' }, { www: { CNAME: 'x.github.io' } }),
    claim('mail', { MX: [{ priority: 10, value: 'mx.example.com' }] }, { _dmarc: { TXT: ['v=DMARC1; p=none'] } }),
  ], 'runs-at.dev', opts);
  assert.deepEqual(a(recs, 'bare'), []);
  assert.deepEqual(a(recs, 'pointed'), []);
  assert.deepEqual(a(recs, 'mail'), []);
});

test('without an edge address nothing is added', () => {
  const recs = desiredFromClaims([claim('acid', {}, { prod: { CNAME: 'x.github.io' } })], 'runs-at.dev', { planDnsChanges, planZoneVerificationRecords });
  assert.deepEqual(a(recs, 'acid'), []);
});
