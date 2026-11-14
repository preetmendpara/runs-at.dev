import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { assertProvider } from '../lib/dns/provider.js';
import { createPowerDnsProvider } from '../lib/dns/powerdns.js';
import { createCloudflareProvider } from '../lib/dns/cloudflare.js';
import { diffRecords, isProtected } from '../lib/dns/diff.js';
import { toZoneRecords, validateDesired, validateZoneRecord, desiredFromClaims } from '../lib/dns/records.js';
import { runPipeline, verifyRecords } from '../lib/dns/pipeline.js';
import { planDnsChanges, planZoneVerificationRecords } from '../lib/dns.js';
import { validateRecord } from '../lib/schema.js';

const ZONE = 'runs-at.dev';
const rec = (name, type, content, ttl = 300) => ({ name, type, content, ttl });
const noSleep = async () => {};

// Fake fetch: answers from a queue, records every call.
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, ...init, body: init.body && JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const { status = 200, body = '' } = next ?? {};
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
  };
  fn.calls = calls;
  return fn;
}

const pdns = (responses, extra = {}) => {
  const fetch = fakeFetch(responses);
  return { fetch, p: createPowerDnsProvider({ apiUrl: 'http://pdns:8081/', apiKey: 'sekret-key', zone: ZONE, fetch, sleep: noSleep, ...extra }) };
};

test('both adapters implement the provider interface', () => {
  assertProvider(pdns([]).p);
  assertProvider(createCloudflareProvider({ token: 't', zoneId: 'a'.repeat(32), fetch: fakeFetch([]) }));
  assert.throws(() => assertProvider({ listRecords() {} }), /missing: createZone/);
});

test('powerdns: lists rrsets, skipping disabled records, and sends the key only as a header', async () => {
  const { p, fetch } = pdns([{ body: { rrsets: [
    { name: 'a.runs-at.dev.', type: 'A', ttl: 300, records: [{ content: '1.2.3.4', disabled: false }, { content: '5.6.7.8', disabled: true }] },
  ] } }]);
  assert.deepEqual(await p.listRecords(), [rec('a.runs-at.dev.', 'A', '1.2.3.4')]);
  assert.equal(fetch.calls[0].url, 'http://pdns:8081/api/v1/servers/localhost/zones/runs-at.dev.');
  assert.equal(fetch.calls[0].headers['X-API-Key'], 'sekret-key');
});

test('powerdns: syncZone sends one PATCH (DELETE first, then REPLACE) and rectifies', async () => {
  const { p, fetch } = pdns([{ status: 204 }, { status: 200, body: { result: 'Rectified' } }]);
  const applied = await p.syncZone({
    creates: [{ name: 'x.runs-at.dev.', type: 'A', ttl: 300, records: ['1.2.3.4'] }],
    updates: [],
    deletes: [{ name: 'y.runs-at.dev.', type: 'CNAME', ttl: 300, records: ['z.'] }],
  });
  assert.equal(applied, true);
  assert.equal(fetch.calls[0].method, 'PATCH');
  assert.deepEqual(fetch.calls[0].body.rrsets, [
    { name: 'y.runs-at.dev.', type: 'CNAME', changetype: 'DELETE' },
    { name: 'x.runs-at.dev.', type: 'A', ttl: 300, changetype: 'REPLACE', records: [{ content: '1.2.3.4', disabled: false }] },
  ]);
  assert.equal(fetch.calls[1].method, 'PUT');
  assert.match(fetch.calls[1].url, /\/zones\/runs-at\.dev\.\/rectify$/);
  assert.equal(await p.syncZone({ creates: [], updates: [], deletes: [] }), false);
});

test('powerdns: notify is PUT .../notify', async () => {
  const { p, fetch } = pdns([{ body: { result: 'Notification queued' } }]);
  await p.notify();
  assert.equal(fetch.calls[0].method, 'PUT');
  assert.match(fetch.calls[0].url, /\/zones\/runs-at\.dev\.\/notify$/);
});

test('powerdns: retries 5xx and network errors with backoff, then succeeds', async () => {
  const waits = [];
  const { p, fetch } = pdns([{ status: 503 }, new Error('ECONNRESET'), { body: { version: '4.9' } }], { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(await p.healthCheck(), { ok: true, detail: 'pdns 4.9' });
  assert.equal(fetch.calls.length, 3);
  assert.deepEqual(waits, [250, 500]);
});

test('powerdns: 4xx is not retried, and errors never contain the key', async () => {
  const { p, fetch } = pdns([{ status: 422, body: { error: 'RRset x.: bad content' } }]);
  await assert.rejects(p.createRecord({ name: 'x.runs-at.dev.', type: 'A', ttl: 300, records: ['nope'] }), (err) => {
    assert.match(err.message, /422 RRset x\.: bad content/);
    assert.doesNotMatch(err.message, /sekret/);
    return true;
  });
  assert.equal(fetch.calls.length, 1);
});

test('powerdns: gives up after the retry budget with the last error', async () => {
  const { p, fetch } = pdns([{ status: 500 }, { status: 500 }, { status: 502, body: 'bad gateway' }], { retries: 2 });
  await assert.rejects(p.notify(), /502 bad gateway/);
  assert.equal(fetch.calls.length, 3);
});

test('powerdns: refuses to start without url and key', () => {
  assert.throws(() => createPowerDnsProvider({ apiUrl: '', apiKey: '' }), /PDNS_API_URL and PDNS_API_KEY/);
});

test('cloudflare adapter: same body and 404-delete rule as the sync script', async () => {
  const fetch = fakeFetch([{ status: 200, body: { success: true } }, { status: 404, body: '' }]);
  const cf = createCloudflareProvider({ token: 't', zoneId: 'a'.repeat(32), fetch });
  await cf.createRecord({ type: 'CNAME', name: 'lucas', value: 'lucas.vercel.app' });
  assert.deepEqual(fetch.calls[0].body, { type: 'CNAME', name: 'lucas.runs-at.dev', content: 'lucas.vercel.app', ttl: 300, proxied: false });
  assert.equal(await cf.deleteRecord({ id: 'gone', type: 'A', name: 'x' }), true);
});

test('records: registry changes become presentation-form zone records', () => {
  assert.deepEqual(toZoneRecords([
    { type: 'CNAME', name: 'lucas', value: 'Lucas.vercel.app' },
    { type: 'TXT', name: '_atproto.lucas', value: 'did="x\\y"' },
    { type: 'MX', name: 'lucas', value: 'mx.example.com', priority: 10 },
  ], ZONE), [
    rec('lucas.runs-at.dev.', 'CNAME', 'lucas.vercel.app.'),
    rec('_atproto.lucas.runs-at.dev.', 'TXT', '"did=\\"x\\\\y\\""'),
    rec('lucas.runs-at.dev.', 'MX', '10 mx.example.com.'),
  ]);
});

test('records: CAA and SRV validation', () => {
  assert.equal(validateZoneRecord(rec('x.runs-at.dev.', 'CAA', '0 issue "letsencrypt.org"')), null);
  assert.equal(validateZoneRecord(rec('x.runs-at.dev.', 'CAA', '128 iodef "mailto:a@b.c"')), null);
  assert.match(validateZoneRecord(rec('x.runs-at.dev.', 'CAA', '0 issue letsencrypt.org')), /bad CAA/);
  assert.match(validateZoneRecord(rec('x.runs-at.dev.', 'CAA', '300 issue "a"')), /bad CAA/);
  assert.equal(validateZoneRecord(rec('_sip._tcp.x.runs-at.dev.', 'SRV', '10 5 5060 sip.example.com.')), null);
  assert.match(validateZoneRecord(rec('x.runs-at.dev.', 'SRV', '10 5 5060 sip.example.com.')), /_service\._proto/);
  assert.match(validateZoneRecord(rec('_sip._tcp.x.runs-at.dev.', 'SRV', '10 5 70000 sip.example.com.')), /bad SRV/);
  assert.match(validateZoneRecord(rec('x.runs-at.dev.', 'NS', 'ns.evil.com.')), /unsupported type NS/);
});

test('records: CNAME may not share a name, but a repeated identical CNAME is fine', () => {
  assert.deepEqual(validateDesired([rec('a.runs-at.dev.', 'CNAME', 'b.'), rec('a.runs-at.dev.', 'CNAME', 'b.')]), []);
  assert.equal(validateDesired([rec('a.runs-at.dev.', 'CNAME', 'b.'), rec('a.runs-at.dev.', 'CNAME', 'c.')]).length, 1);
  assert.equal(validateDesired([rec('a.runs-at.dev.', 'CNAME', 'b.'), rec('a.runs-at.dev.', 'TXT', '"x"')]).length, 1);
});

test('diff: creates, updates and deletes, deterministically ordered', () => {
  const desired = [rec('b.runs-at.dev.', 'A', '2.2.2.2'), rec('a.runs-at.dev.', 'A', '1.1.1.1'), rec('c.runs-at.dev.', 'TXT', '"new"')];
  const current = [rec('c.runs-at.dev.', 'TXT', '"old"'), rec('d.runs-at.dev.', 'CNAME', 'x.'), rec('b.runs-at.dev.', 'A', '2.2.2.2')];
  const plan = diffRecords(desired, current, { zone: ZONE });
  assert.deepEqual(plan.creates.map((s) => s.name), ['a.runs-at.dev.']);
  assert.deepEqual(plan.updates, [{ name: 'c.runs-at.dev.', type: 'TXT', ttl: 300, records: ['"new"'] }]);
  assert.deepEqual(plan.deletes.map((s) => s.name), ['d.runs-at.dev.']);
  assert.deepEqual(diffRecords([...desired].reverse(), [...current].reverse(), { zone: ZONE }), plan);
});

test('diff: a TTL change is an update', () => {
  const plan = diffRecords([rec('a.runs-at.dev.', 'A', '1.1.1.1', 300)], [rec('a.runs-at.dev.', 'A', '1.1.1.1', 3600)], { zone: ZONE });
  assert.equal(plan.updates.length, 1);
});

test('diff: duplicates collapse into one RRset value', () => {
  const plan = diffRecords([rec('a.runs-at.dev.', 'TXT', '"x"'), rec('a.runs-at.dev.', 'TXT', '"x"')], [], { zone: ZONE });
  assert.deepEqual(plan.creates, [{ name: 'a.runs-at.dev.', type: 'TXT', ttl: 300, records: ['"x"'] }]);
});

test('diff: idempotent once applied', () => {
  const desired = [rec('a.runs-at.dev.', 'A', '1.1.1.1'), rec('a.runs-at.dev.', 'A', '2.2.2.2')];
  const plan = diffRecords(desired, [], { zone: ZONE });
  const applied = plan.creates.flatMap((s) => s.records.map((c) => rec(s.name, s.type, c, s.ttl)));
  assert.deepEqual(diffRecords(desired, applied, { zone: ZONE }), { creates: [], updates: [], deletes: [], rejected: [] });
});

test('diff: system records are never deleted or overwritten', () => {
  const system = [
    rec('runs-at.dev.', 'SOA', 'ns1.runs-at.dev. hostmaster.runs-at.dev. 1 10800 3600 604800 3600'),
    rec('runs-at.dev.', 'NS', 'ns1.runs-at.dev.'),
    rec('runs-at.dev.', 'A', '216.198.79.1'),
    rec('runs-at.dev.', 'MX', '10 route1.mx.cloudflare.net.'),
    rec('ns1.runs-at.dev.', 'A', '192.0.2.1'),
    rec('ns2.runs-at.dev.', 'A', '192.0.2.2'),
    rec('www.runs-at.dev.', 'CNAME', 'x.vercel-dns-017.com.'),
    rec('*.runs-at.dev.', 'A', '192.0.2.9'),
    rec('_dmarc.runs-at.dev.', 'TXT', '"v=DMARC1"'),
    rec('other.zone.', 'A', '192.0.2.3'),
  ];
  // Desired is empty: nothing above may be deleted.
  assert.deepEqual(diffRecords([], system, { zone: ZONE }), { creates: [], updates: [], deletes: [], rejected: [] });
  // Desired tries to overwrite them: refused, reported, not applied.
  const hostile = [rec('ns1.runs-at.dev.', 'A', '6.6.6.6'), rec('runs-at.dev.', 'NS', 'ns.evil.'), rec('www.runs-at.dev.', 'CNAME', 'evil.'), rec('blog.www.runs-at.dev.', 'A', '6.6.6.6')];
  const plan = diffRecords(hostile, system, { zone: ZONE });
  assert.deepEqual([plan.creates, plan.updates, plan.deletes], [[], [], []]);
  assert.equal(plan.rejected.length, 4);
  assert.equal(isProtected('lucas.runs-at.dev.', 'A', ZONE), false);
  assert.equal(isProtected('lucas.runs-at.dev.', 'SOA', ZONE), true);
});

test('diff: owned() limits deletes, keep() preserves hand-placed values', () => {
  const current = [rec('stray.runs-at.dev.', 'A', '1.1.1.1'), rec('_vercel.runs-at.dev.', 'TXT', '"hand"'), rec('_vercel.runs-at.dev.', 'TXT', '"vc-domain-verify=old.runs-at.dev,ab"')];
  const plan = diffRecords([rec('_vercel.runs-at.dev.', 'TXT', '"vc-domain-verify=new.runs-at.dev,cd"')], current, {
    zone: ZONE,
    owned: (n) => n !== 'stray.runs-at.dev.',
    keep: (r) => r.content === '"hand"',
  });
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.updates[0].records, ['"hand"', '"vc-domain-verify=new.runs-at.dev,cd"']);
});

// Pipeline with an in-memory provider.
function memoryProvider(initial = []) {
  let records = [...initial];
  const log = [];
  return {
    log,
    get records() { return records; },
    async listRecords() { return records; },
    async syncZone(plan) {
      log.push('apply');
      const touched = new Set([...plan.creates, ...plan.updates, ...plan.deletes].map((s) => `${s.name}\t${s.type}`));
      records = records.filter((r) => !touched.has(`${r.name}\t${r.type}`));
      for (const s of [...plan.creates, ...plan.updates]) for (const c of s.records) records.push(rec(s.name, s.type, c, s.ttl));
      return touched.size > 0;
    },
    async notify() { log.push('notify'); },
  };
}
const resolverFor = (provider) => async (name, type) => provider.records.filter((r) => r.name === name && r.type === type).map((r) => r.content);

test('pipeline: applies, notifies, verifies primary and secondary', async () => {
  const provider = memoryProvider();
  const desired = [rec('a.runs-at.dev.', 'A', '1.1.1.1')];
  const report = await runPipeline({
    desired, provider, zone: ZONE, sleep: noSleep,
    primary: { name: 'primary', resolve: resolverFor(provider) },
    secondaries: [{ name: 'secondary', resolve: resolverFor(provider) }],
  });
  assert.equal(report.ok, true);
  assert.deepEqual(provider.log, ['apply', 'notify']);
  assert.deepEqual(report.verification.map((v) => v.ok), [true, true]);
  // Second run: nothing to do, still verified.
  const again = await runPipeline({ desired, provider, zone: ZONE, sleep: noSleep, primary: { name: 'p', resolve: resolverFor(provider) } });
  assert.equal(again.ok, true);
  assert.equal(again.applied, false);
});

test('pipeline: a secondary that never catches up is a failure, not a success', async () => {
  const provider = memoryProvider();
  const report = await runPipeline({
    desired: [rec('a.runs-at.dev.', 'A', '1.1.1.1')], provider, zone: ZONE, sleep: noSleep, verifyAttempts: 2,
    primary: { name: 'primary', resolve: resolverFor(provider) },
    secondaries: [{ name: 'secondary', resolve: async () => [] }],
  });
  assert.equal(report.ok, false);
  assert.equal(report.verification[1].ok, false);
  assert.deepEqual(report.verification[1].mismatches[0].got, []);
});

test('pipeline: a resolver error (timeout) counts as a mismatch', async () => {
  const r = await verifyRecords([rec('a.runs-at.dev.', 'A', '1.1.1.1')], async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }); });
  assert.equal(r.ok, false);
});

test('pipeline: invalid desired state stops before touching the provider', async () => {
  const provider = memoryProvider();
  const report = await runPipeline({ desired: [rec('a.runs-at.dev.', 'A', '999.1.1.1')], provider, zone: ZONE });
  assert.equal(report.ok, false);
  assert.equal(report.stage, 'validate');
  assert.deepEqual(provider.log, []);
});

test('pipeline: refuses mass deletion and an unverified run', async () => {
  const many = Array.from({ length: 30 }, (_, i) => rec(`n${i}.runs-at.dev.`, 'A', '1.1.1.1'));
  const provider = memoryProvider(many);
  const report = await runPipeline({ desired: [], provider, zone: ZONE });
  assert.equal(report.ok, false);
  assert.match(report.errors[0], /refusing to delete 30/);
  assert.deepEqual(provider.log, []);
  const none = await runPipeline({ desired: [], provider: memoryProvider(), zone: ZONE });
  assert.equal(none.ok, false);
  assert.match(none.errors[0], /no verification target/);
});

// Every claim file, as it stands today: still valid under lib/schema.js, and
// its whole zone passes the provider-layer validation.
test('registry: every domains/*.json still validates, and the full zone is publishable', () => {
  const files = readdirSync('domains').filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  const claims = files.map((f) => JSON.parse(readFileSync(`domains/${f}`, 'utf8')));
  const invalid = claims.filter((c) => !validateRecord(c).ok).map((c) => c.name);
  assert.deepEqual(invalid, []);
  const desired = desiredFromClaims(claims, ZONE, { planDnsChanges, planZoneVerificationRecords });
  assert.deepEqual(validateDesired(desired), []);
  assert.equal(desired.filter((r) => r.type === 'URL').length, 0);
});
