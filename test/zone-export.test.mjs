import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  loadClaims, registryRecords, buildZone, renderZone, parseZone, canonical, resolveGlue,
  serialFor, PLACEHOLDER_BANNER,
} from '../scripts/export-zone.mjs';
import { compare } from '../scripts/verify-parity.mjs';

const claims = await loadClaims('domains');
// The live export is a local, gitignored backup (migration/backup/). Without it
// (a fresh CI checkout) the system records come from a TEST-NET fixture with
// the same shape; every assertion below is about registry records and zone
// structure, not about the live values.
const LIVE_FILE = 'migration/backup/live-dns-export.json';
const ok = (answers) => ({ ok: true, answers });
const live = existsSync(LIVE_FILE)
  ? JSON.parse(await readFile(LIVE_FILE, 'utf8'))
  : {
      apex: { A: ok(['192.0.2.10']), AAAA: ok([]), MX: ok([{ priority: 10, value: 'mx.example.net' }]), TXT: ok(['v=spf1 -all']), CAA: ok([]) },
      system: { 'www.runs-at.dev CNAME': ok(['www-target.example.net']), '_vercel.runs-at.dev TXT': ok([]) },
      wildcard: { A: ok(['192.0.2.20']), AAAA: ok([]) },
    };
const glue = resolveGlue({ placeholder: true });
const zone = buildZone({ claims, live, glue, serial: 2026111301 });
const text = renderZone(zone, { placeholder: true });
const parsed = parseZone(text);

test('every registry record is in the exported zone', () => {
  const r = compare(registryRecords(claims), parsed);
  assert.equal(r.missing.length, 0);
  assert.equal(r.mismatched.length, 0);
  assert.equal(r.extra.length, 0);
  assert.equal(r.matched, registryRecords(claims).length);
});

test('no duplicate records', () => {
  const lines = parsed.map(canonical);
  assert.equal(new Set(lines).size, lines.length);
});

test('SOA, NS and glue are present', () => {
  assert.match(text, /^@ 3600 IN SOA ns1\.runs-at\.dev\. hostmaster\.runs-at\.dev\. 2026111301 /m);
  assert.equal(parsed.filter((r) => r.type === 'NS' && r.name === '').length, 2);
  assert.ok(parsed.some((r) => r.name === 'ns1' && r.type === 'A'));
  assert.ok(parsed.some((r) => r.name === 'ns2' && r.type === 'A'));
});

test('URL records produce no DNS record; the wildcard serves them', () => {
  const urlClaims = claims.filter((c) => c.records?.URL);
  assert.ok(urlClaims.length > 0);
  for (const c of urlClaims) {
    assert.ok(!parsed.some((r) => r.type === 'URL'));
    if (!c.records.CNAME && !c.records.A) assert.ok(!parsed.some((r) => r.name === c.name && r.type !== 'TXT' && r.type !== 'MX'));
  }
  assert.ok(parsed.some((r) => r.name === '*'));
});

test('placeholder glue is TEST-NET and flagged NOT FOR PRODUCTION', () => {
  assert.ok(text.startsWith(PLACEHOLDER_BANNER));
  assert.ok(parsed.filter((r) => r.name.startsWith('ns')).every((r) => r.value.startsWith('192.0.2.')));
  assert.ok(!renderZone(zone).includes('NOT FOR PRODUCTION'));
});

test('real glue is required unless placeholder is asked for', () => {
  assert.throws(() => resolveGlue({ env: {} }), /NS1_IPV4/);
  assert.throws(() => resolveGlue({ env: { NS1_IPV4: 'x', NS2_IPV4: '1.2.3.4' } }), /IPv4/);
  assert.deepEqual(resolveGlue({ env: { NS1_IPV4: '198.51.100.1', NS2_IPV4: '198.51.100.2' } }),
    { ns1: '198.51.100.1', ns2: '198.51.100.2', placeholder: false });
});

test('serial is YYYYMMDDnn', () => {
  assert.equal(serialFor(new Date('2026-11-13T12:00:00Z'), 3), 2026111303);
});

test('TXT with quotes and >255 chars round-trips', () => {
  const long = 'a"b\\' + 'x'.repeat(600);
  const z = buildZone({ claims: [{ name: 't', claimedAt: '', records: { TXT: [long] } }], live, glue, serial: 2026111301 });
  const back = parseZone(renderZone(z)).find((r) => r.name === 't');
  assert.equal(back.value, long);
});

test('CNAME next to other data is refused', () => {
  assert.throws(() => buildZone({ claims: [{ name: 'www', records: { TXT: ['x'] } }], live, glue, serial: 2026111301 }), /CNAME coexists/);
});

test('systemRecords: EDGE_IPV4 replaces the Cloudflare-proxied wildcard answers', async () => {
  const { systemRecords } = await import('../scripts/export-zone.mjs');
  const live = { apex: {}, wildcard: { A: { ok: true, answers: ['198.51.100.1', '198.51.100.2'] }, AAAA: { ok: true, answers: ['2001:db8::1'] } } };
  process.env.EDGE_IPV4 = '192.0.2.21';
  try {
    const wild = systemRecords(live).filter((r) => r.name === '*');
    assert.deepEqual(wild.map((r) => `${r.type} ${r.value}`), ['A 192.0.2.21']);
  } finally { delete process.env.EDGE_IPV4; }
});
