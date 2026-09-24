// The table's data model: one row per published record, converted to and from
// the registry's own shape. Everything here is what Step B's UI will rely on,
// so the mapping is tested before any of it is on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordsToRows, rowsToRecords, validateRow, ROW_TYPES } from '../lib/record-fields.js';
import { validateRecord } from '../lib/schema.js';
import { planDnsChanges } from '../lib/dns.js';
import { classifyClaim } from '../lib/health.js';

const claim = (over = {}) => ({
  name: 'lucas',
  owner: { github: 'someone' },
  claimedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

// ── Round trips ──────────────────────────────────────────────
test('a record file survives rows and back unchanged', () => {
  const record = claim({
    records: { A: ['203.0.113.10', '203.0.113.11'], TXT: ['v=spf1 -all'], MX: [{ priority: 10, value: 'mx.example.com' }] },
    subdomains: { blog: { CNAME: 'you.github.io' }, _vercel: { TXT: ['vc-domain-verify=lucas.runs-at.dev,ab12'] } },
  });
  const back = rowsToRecords(recordsToRows(record));
  assert.deepEqual(back.records, record.records);
  assert.deepEqual(back.subdomains, record.subdomains);
});

test('every row type round-trips, including AAAA and MX priorities', () => {
  const record = claim({
    records: { A: ['203.0.113.10'], AAAA: ['2606:4700:3037::6815:7eb'], TXT: ['one', 'two'], MX: [{ priority: 5, value: 'a.example.com' }, { priority: 10, value: 'b.example.com' }] },
  });
  const rows = recordsToRows(record);
  assert.deepEqual(rows.map((r) => r.type), ['A', 'AAAA', 'TXT', 'TXT', 'MX', 'MX']);
  assert.equal(rows.find((r) => r.type === 'MX').priority, 5);
  assert.deepEqual(rowsToRecords(rows).records, record.records);
});

// The save replaces `records` wholesale, so anything the table does not model
// must be carried through rather than deleted. A redirect is the live case.
test('a redirect on the name survives an edit made through rows', () => {
  const record = claim({ records: { URL: 'https://example.com' } });
  const rows = recordsToRows(record);
  assert.deepEqual(rows, [], 'a redirect publishes no DNS row');
  const back = rowsToRecords(rows, { keep: record.records });
  assert.deepEqual(back.records, { URL: 'https://example.com' });
});

test('an underscore label a provider asked for is preserved exactly', () => {
  const record = claim({ subdomains: { '_vercel.recruitment': { TXT: ['vc-domain-verify=lucas.runs-at.dev,ff01'] } } });
  const back = rowsToRecords(recordsToRows(record));
  assert.deepEqual(back.subdomains, record.subdomains);
});

test('rows fold back into the array shape the registry stores', () => {
  const rows = [
    { label: '', type: 'A', value: '203.0.113.10' },
    { label: '', type: 'A', value: '203.0.113.11' },
    { label: 'mail', type: 'MX', value: 'mx.example.com', priority: 10 },
  ];
  assert.deepEqual(rowsToRecords(rows), {
    records: { A: ['203.0.113.10', '203.0.113.11'] },
    subdomains: { mail: { MX: [{ priority: 10, value: 'mx.example.com' }] } },
  });
});

test('an empty row is someone mid-edit, not a request to publish nothing', () => {
  assert.deepEqual(rowsToRecords([{ label: '', type: 'A', value: '   ' }]), { records: {}, subdomains: {} });
});

test('a hostname pasted from a console is normalised, a TXT value is not', () => {
  const out = rowsToRecords([
    { label: '', type: 'CNAME', value: 'You.GitHub.IO.' },
    { label: '_x', type: 'TXT', value: 'Token-With-CASE' },
  ]);
  assert.equal(out.records.CNAME, 'you.github.io');
  assert.deepEqual(out.subdomains._x.TXT, ['Token-With-CASE']);
});

// What rows produce must be a record the registry itself accepts; otherwise
// the table can build something the save path rejects.
test('rows produce a record the schema accepts', () => {
  const rows = [
    { label: '', type: 'A', value: '203.0.113.10' },
    { label: '', type: 'AAAA', value: '2606:4700:3037::6815:7eb' },
    { label: 'mail', type: 'MX', value: 'mx.example.com', priority: 10 },
  ];
  const { records, subdomains } = rowsToRecords(rows);
  assert.equal(validateRecord(claim({ records, subdomains })).ok, true);
});

// ── Validation ───────────────────────────────────────────────
test('addresses are checked per type', () => {
  assert.equal(validateRow({ type: 'A', label: '', value: '203.0.113.10' }, []), null);
  assert.match(validateRow({ type: 'A', label: '', value: '2606::1' }, []), /IPv4/);
  assert.equal(validateRow({ type: 'AAAA', label: '', value: '2606:4700:3037::6815:7eb' }, []), null);
  assert.match(validateRow({ type: 'AAAA', label: '', value: '203.0.113.10' }, []), /IPv6/);
});

test('a CNAME must be a hostname, not a URL', () => {
  assert.equal(validateRow({ type: 'CNAME', label: '', value: 'you.github.io' }, []), null);
  assert.match(validateRow({ type: 'CNAME', label: '', value: 'https://you.github.io/x' }, []), /hostname/);
});

test('MX needs a priority in range and a hostname', () => {
  assert.equal(validateRow({ type: 'MX', label: '', value: 'mx.example.com', priority: 10 }, []), null);
  assert.match(validateRow({ type: 'MX', label: '', value: 'mx.example.com' }, []), /priority/);
  assert.match(validateRow({ type: 'MX', label: '', value: 'mx.example.com', priority: 70000 }, []), /priority/);
});

test('a TXT value stops at 255 characters', () => {
  assert.equal(validateRow({ type: 'TXT', label: '', value: 'x'.repeat(255) }, []), null);
  assert.match(validateRow({ type: 'TXT', label: '', value: 'x'.repeat(256) }, []), /255/);
});

// DNS forbids it, Cloudflare refuses it, and the schema rejects it: better to
// say so in the form than after a failed save.
test('a CNAME cannot share a name with another record, in either order', () => {
  const existing = { label: 'blog', type: 'A', value: '203.0.113.10' };
  assert.match(validateRow({ type: 'CNAME', label: 'blog', value: 'you.github.io' }, [existing]), /only record/);
  const cname = { label: 'blog', type: 'CNAME', value: 'you.github.io' };
  assert.match(validateRow({ type: 'A', label: 'blog', value: '203.0.113.10' }, [cname]), /only record/);
});

test('a CNAME beside a record on a different name is fine', () => {
  const other = { label: 'mail', type: 'A', value: '203.0.113.10' };
  assert.equal(validateRow({ type: 'CNAME', label: 'blog', value: 'you.github.io' }, [other]), null);
});

// ── Security: a row must never reach outside its own name ────
test('a label cannot escape the claimed name', () => {
  for (const label of ['x.bob', '../bob', 'bob.runs-at.dev', 'a b', 'UPPER.case', '.']) {
    assert.match(validateRow({ type: 'A', label, value: '203.0.113.10' }, []), /label/i, label);
  }
});

test('a label that escapes is also refused by the registry schema', () => {
  const { subdomains } = rowsToRecords([{ label: 'x.bob', type: 'A', value: '203.0.113.10' }]);
  assert.equal(validateRecord(claim({ records: {}, subdomains })).ok, false);
});

test('an unknown row type is dropped rather than written', () => {
  assert.deepEqual(rowsToRecords([{ label: '', type: 'NS', value: 'ns1.example.com' }]), { records: {}, subdomains: {} });
  assert.match(validateRow({ type: 'NS', label: '', value: 'ns1.example.com' }, []), /record type/);
  assert.deepEqual(ROW_TYPES, ['A', 'AAAA', 'CNAME', 'TXT', 'MX']);
});

// ── AAAA reaches DNS and reads as a pointed name ─────────────
test('the sync planner publishes AAAA records', () => {
  const changes = planDnsChanges({ name: 'lucas', records: { AAAA: ['2606:4700:3037::6815:7eb'] } });
  assert.deepEqual(changes, [{ type: 'AAAA', name: 'lucas', value: '2606:4700:3037::6815:7eb' }]);
});

test('an AAAA-only name is pointed somewhere, not a profile card', () => {
  const record = { name: 'lucas', records: { AAAA: ['2606:4700:3037::6815:7eb'] } };
  assert.equal(classifyClaim(record, { ok: false }), 'down');
  assert.equal(classifyClaim(record, { ok: true, finalHost: 'elsewhere', title: 'Site' }), 'ok');
});

test('the schema accepts the IPv6 forms providers hand out', () => {
  for (const value of ['::1', '2606:4700:3037::6815:7eb', '2001:0db8:0000:0000:0000:ff00:0042:8329', '::ffff:203.0.113.10', 'fe80::1']) {
    assert.equal(validateRecord(claim({ records: { AAAA: [value] } })).ok, true, value);
  }
  for (const value of ['203.0.113.10', '2001::db8::1', 'gggg::1', '', '2001:db8']) {
    assert.equal(validateRecord(claim({ records: { AAAA: [value] } })).ok, false, value);
  }
});

test('AAAA cannot coexist with a CNAME on the same name', () => {
  const out = validateRecord(claim({ records: { CNAME: 'you.github.io', AAAA: ['::1'] } }));
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => e.includes('CNAME cannot coexist')));
});
