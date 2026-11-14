// reconcile-cloudflare: counts must be right, and the published report must
// never contain a record name, value or target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fromCloudflare, reconcile } from '../scripts/reconcile-cloudflare.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const claims = [
  { name: 'alpha', owner: { github: 'a' }, claimedAt: '2026-01-01T00:00:00Z', records: { CNAME: 'alpha-secret-origin.example.net' } },
  { name: 'beta', owner: { github: 'b' }, claimedAt: '2026-01-02T00:00:00Z', records: { A: ['203.0.113.77'], TXT: ['beta-token-xyz'] } },
  { name: 'gamma', owner: { github: 'c' }, claimedAt: '2026-01-03T00:00:00Z', records: { CNAME: 'gamma-host.example.org' } },
];
const cloudflare = [
  { type: 'CNAME', name: 'alpha.runs-at.dev', content: 'alpha-secret-origin.example.net', proxied: false },
  { type: 'A', name: 'beta.runs-at.dev', content: '203.0.113.77', proxied: false },
  { type: 'TXT', name: 'beta.runs-at.dev', content: '"beta-token-xyz"', proxied: false },
  // gamma is missing (quota); two extras: a system name and an undeclared one.
  { type: 'A', name: 'runs-at.dev', content: '198.51.100.10', proxied: true },
  { type: 'CNAME', name: 'hidden-internal.runs-at.dev', content: 'private-origin.example.com', proxied: true },
];

test('fromCloudflare normalizes names and quoted TXT', () => {
  assert.deepEqual(fromCloudflare({ type: 'TXT', name: 'x.runs-at.dev', content: '"a" "b"' }), { name: 'x', type: 'TXT', value: 'ab' });
  assert.equal(fromCloudflare({ type: 'A', name: 'runs-at.dev', content: '1.2.3.4' }).name, '');
  assert.equal(fromCloudflare({ type: 'A', name: 'other.example', content: '1.2.3.4' }), null);
});

test('reconcile counts matched, missing and extra records', () => {
  const declared = [
    { name: 'alpha', type: 'CNAME', value: 'alpha-secret-origin.example.net' },
    { name: 'beta', type: 'A', value: '203.0.113.77' },
    { name: 'beta', type: 'TXT', value: 'beta-token-xyz' },
    { name: 'gamma', type: 'CNAME', value: 'gamma-host.example.org' },
  ];
  const r = reconcile({ cloudflare, declared });
  assert.equal(r.declared, 4);
  assert.equal(r.matched, 3);
  assert.equal(r.missingInCloudflare, 1);
  assert.equal(r.extraInCloudflare, 2);
  assert.equal(r.extraSystem, 1);
  assert.equal(r.extraOther, 1);
  assert.match(r.sha.declared, /^[0-9a-f]{64}$/);
});

test('published report contains counts and checksums only, no record data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfrec-'));
  const reg = join(dir, 'domains');
  mkdirSync(reg);
  for (const c of claims) writeFileSync(join(reg, `${c.name}.json`), JSON.stringify(c));
  writeFileSync(join(dir, 'cloudflare-dns-export.json'), JSON.stringify(cloudflare));
  writeFileSync(join(dir, 'cloudflare-dns-summary.json'), JSON.stringify({ pages: 1, proxied: 2 }));
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/reconcile-cloudflare.mjs'), dir, '--registry', reg], { encoding: 'utf8', cwd: ROOT });
  assert.equal(res.status, 0, res.stderr);
  const out = res.stdout;
  assert.match(out, /Declared and present in Cloudflare \| 3 \|/);
  assert.match(out, /Declared but missing from Cloudflare \| 1 \|/);
  for (const secret of ['alpha', 'beta', 'gamma', 'hidden-internal', 'secret-origin', 'private-origin', '203.0.113.77', '198.51.100.10', 'beta-token-xyz', 'example.']) {
    assert.ok(!out.includes(secret), `report leaked "${secret}"`);
  }
});

test('reconcile errors never echo export contents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfrec-'));
  writeFileSync(join(dir, 'cloudflare-dns-export.json'), '{"leak": "SECRET-TXT-VALUE-123" ,,,');
  writeFileSync(join(dir, 'cloudflare-dns-summary.json'), '{}');
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/reconcile-cloudflare.mjs'), dir], { encoding: 'utf8', cwd: ROOT });
  assert.equal(res.status, 2);
  assert.ok(!(res.stdout + res.stderr).includes('SECRET-TXT-VALUE-123'), res.stderr);
  assert.match(res.stderr, /failed \(SyntaxError\)/);
});

// The exporter against a stubbed fetch: a bad response body or an HTTP error
// must not put the body, the token or any record into the log.
function runExporter(stub) {
  const dir = mkdtempSync(join(tmpdir(), 'cfexp-'));
  const preload = join(dir, 'stub.mjs');
  writeFileSync(preload, `globalThis.fetch = async (url) => (${stub});\n`);
  return spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, join(ROOT, 'scripts/export-cloudflare-dns.mjs'), join(dir, 'out'), '--quiet'], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'TOKEN-SHOULD-NOT-APPEAR', CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef' },
  });
}

test('exporter: invalid JSON body is reported without its contents', () => {
  const res = runExporter(`{ ok: true, status: 200, json: async () => { JSON.parse('{"x":"SECRET-BODY-VALUE" ,,'); } }`);
  assert.equal(res.status, 1);
  const out = res.stdout + res.stderr;
  assert.ok(!out.includes('SECRET-BODY-VALUE'), out);
  assert.ok(!out.includes('TOKEN-SHOULD-NOT-APPEAR'), out);
  assert.match(out, /response was not valid JSON/);
});

test('exporter: HTTP errors report only path and status', () => {
  const res = runExporter(`{ ok: false, status: 403, statusText: 'SECRET-STATUS-TEXT', json: async () => ({ errors: ['SECRET-ERR'] }) }`);
  assert.equal(res.status, 1);
  const out = res.stdout + res.stderr;
  assert.match(out, /HTTP 403/);
  for (const s of ['SECRET-STATUS-TEXT', 'SECRET-ERR', 'TOKEN-SHOULD-NOT-APPEAR', '0123456789abcdef0123456789abcdef']) assert.ok(!out.includes(s), out);
});

test('exporter: success with --quiet prints only aggregate counts', () => {
  const res = runExporter(`{ ok: true, status: 200, json: async () => (String(url).includes('dns_records') ? { result: [{ type: 'TXT', name: 'x.runs-at.dev', content: 'SECRET-REC' }], result_info: { total_pages: 1, total_count: 1 } } : { result: { name: 'runs-at.dev', status: 'active', name_servers: [] } }) }`);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /^exported \d+ records over 1 page\(s\)\s*$/);
});
