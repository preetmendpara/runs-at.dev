// The failure kinds that used to be collapsed into `stuck` / `down` and so
// were reported as the owner's hosting problem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyClaim, planIssueOpens, probeErrorKind, looksUndeployed } from '../lib/health.js';

const base = { name: 'lucas', owner: { github: 'zordhalo' }, claimedAt: '2026-08-30T00:00:00Z' };
const pointed = { ...base, records: { CNAME: 'lucas.github.io' } };
const card = { ok: true, status: 200, finalHost: 'lucas.runs-at.dev', title: 'Lucas (lucas.runs-at.dev)' };

test('a declared record missing from DNS is ours (dns-missing), not the owner\'s stuck', () => {
  // The wildcard answers an unpublished name with the card, which on its own
  // reads exactly like an unverified provider.
  assert.equal(classifyClaim(pointed, card), 'stuck');
  assert.equal(classifyClaim(pointed, card, { dnsMissing: true }), 'dns-missing');
});

test('dns-missing never opens an owner nudge issue', () => {
  const rows = [{ name: 'lucas', status: 'dns-missing' }, { name: 'ana', status: 'stuck' }];
  assert.deepEqual(planIssueOpens(rows, []), [{ name: 'ana' }]);
});

test('dns-missing does not apply to card or redirect claims', () => {
  assert.equal(classifyClaim({ ...base, records: {} }, null, { dnsMissing: true }), 'card');
  assert.equal(classifyClaim({ ...base, records: { URL: 'https://x.example' } }, null, { dnsMissing: true }), 'redirect');
});

test('probe failures are separated by cause', () => {
  assert.equal(classifyClaim(pointed, { ok: false, error: 'dns' }), 'bad-target');
  assert.equal(classifyClaim(pointed, { ok: false, error: 'tls' }), 'tls');
  assert.equal(classifyClaim(pointed, { ok: false, error: 'timeout' }), 'down');
  assert.equal(classifyClaim(pointed, { ok: false }), 'down');
});

test('a provider "nothing deployed" page is no-deployment; an owner 404 is http-error', () => {
  assert.equal(
    classifyClaim(pointed, { ok: true, status: 404, finalHost: 'lucas.runs-at.dev', title: 'Site not found', noDeployment: true }),
    'no-deployment',
  );
  assert.equal(classifyClaim(pointed, { ok: true, status: 500, finalHost: 'lucas.runs-at.dev', title: 'Oops' }), 'http-error');
  assert.equal(classifyClaim(pointed, { ok: true, status: 200, finalHost: 'lucas.runs-at.dev', title: 'Lucas' }), 'ok');
});

test('probeErrorKind reads Node fetch causes', () => {
  assert.equal(probeErrorKind(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })), 'dns');
  assert.equal(probeErrorKind(Object.assign(new TypeError('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } })), 'tls');
  assert.equal(probeErrorKind(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } })), 'tls');
  assert.equal(probeErrorKind(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })), 'timeout');
  assert.equal(probeErrorKind(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })), 'connect');
  assert.equal(probeErrorKind(new Error('weird')), 'other');
});

test('looksUndeployed only matches provider pages on an error status', () => {
  assert.equal(looksUndeployed(404, 'The deployment could not be found. DEPLOYMENT_NOT_FOUND'), true);
  assert.equal(looksUndeployed(404, "<h1>There isn't a GitHub Pages site here.</h1>"), true);
  assert.equal(looksUndeployed(200, 'DEPLOYMENT_NOT_FOUND'), false);
  assert.equal(looksUndeployed(404, 'my own custom 404'), false);
});
