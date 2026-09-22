import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, providerFor } from '../lib/stats.js';

const at = (iso) => new Date(iso);

function rec(over = {}) {
  return {
    name: 'a',
    owner: { github: 'Someone' },
    claimedAt: '2026-01-01T12:00:00.000Z',
    records: {},
    ...over,
  };
}

test('an empty registry summarises to zeroes, not NaN or undefined', () => {
  const s = summarize([], { now: at('2026-01-10T00:00:00.000Z') });
  assert.equal(s.total, 0);
  assert.equal(s.owners, 0);
  assert.equal(s.claimedThisWeek, 0);
  assert.equal(s.first, null);
  assert.equal(s.latest, null);
  assert.deepEqual(s.cumulative, []);
  assert.deepEqual(s.recent, []);
});

test('counts names and owners, deduping logins case-insensitively', () => {
  const s = summarize(
    [
      rec({ name: 'one', owner: { github: 'Zyaxxy' } }),
      rec({ name: 'two', owner: { github: 'zyaxxy' } }),
      rec({ name: 'three', owner: { github: 'lucas' } }),
    ],
    { now: at('2026-01-02T00:00:00.000Z') },
  );
  assert.equal(s.total, 3);
  assert.equal(s.owners, 2);
});

test('cumulative is a dense daily series through today, so gaps read as flat', () => {
  const s = summarize(
    [
      rec({ name: 'one', claimedAt: '2026-01-01T12:00:00.000Z' }),
      rec({ name: 'two', claimedAt: '2026-01-04T12:00:00.000Z' }),
    ],
    { now: at('2026-01-05T09:00:00.000Z') },
  );
  assert.deepEqual(
    s.cumulative,
    [
      { date: '2026-01-01', claims: 1, total: 1 },
      { date: '2026-01-02', claims: 0, total: 1 },
      { date: '2026-01-03', claims: 0, total: 1 },
      { date: '2026-01-04', claims: 1, total: 2 },
      { date: '2026-01-05', claims: 0, total: 2 },
    ],
  );
});

test('claims on the same day collapse into one bucket', () => {
  const s = summarize(
    [
      rec({ name: 'one', claimedAt: '2026-01-01T00:30:00.000Z' }),
      rec({ name: 'two', claimedAt: '2026-01-01T23:30:00.000Z' }),
    ],
    { now: at('2026-01-01T23:59:00.000Z') },
  );
  assert.deepEqual(s.cumulative, [{ date: '2026-01-01', claims: 2, total: 2 }]);
});

test('reports the first and latest claim timestamps', () => {
  const s = summarize(
    [
      rec({ name: 'mid', claimedAt: '2026-01-04T12:00:00.000Z' }),
      rec({ name: 'old', claimedAt: '2026-01-01T12:00:00.000Z' }),
      rec({ name: 'new', claimedAt: '2026-01-06T12:00:00.000Z' }),
    ],
    { now: at('2026-01-07T00:00:00.000Z') },
  );
  assert.equal(s.first, '2026-01-01T12:00:00.000Z');
  assert.equal(s.latest, '2026-01-06T12:00:00.000Z');
});

test('claimedThisWeek counts only the trailing seven days', () => {
  const s = summarize(
    [
      rec({ name: 'recent', claimedAt: '2026-01-09T00:00:00.000Z' }),
      rec({ name: 'old', claimedAt: '2026-01-01T00:00:00.000Z' }),
    ],
    { now: at('2026-01-10T00:00:00.000Z') },
  );
  assert.equal(s.claimedThisWeek, 1);
});

test('recent claims come back newest first, capped at the limit', () => {
  const s = summarize(
    [
      rec({ name: 'a', claimedAt: '2026-01-01T00:00:00.000Z' }),
      rec({ name: 'b', claimedAt: '2026-01-03T00:00:00.000Z' }),
      rec({ name: 'c', claimedAt: '2026-01-02T00:00:00.000Z' }),
    ],
    { now: at('2026-01-04T00:00:00.000Z'), recentLimit: 2 },
  );
  assert.deepEqual(
    s.recent,
    [
      { name: 'b', github: 'Someone', claimedAt: '2026-01-03T00:00:00.000Z' },
      { name: 'c', github: 'Someone', claimedAt: '2026-01-02T00:00:00.000Z' },
    ],
  );
});

test('usage breaks names down by record mode, always with all four keys', () => {
  const s = summarize(
    [
      rec({ name: 'card' }),
      rec({ name: 'host', records: { CNAME: 'cname.vercel-dns.com' } }),
      rec({ name: 'link', records: { URL: 'https://example.com' } }),
    ],
    { now: at('2026-01-02T00:00:00.000Z') },
  );
  assert.deepEqual(s.usage, { card: 1, cname: 1, url: 1, advanced: 0 });
});

test('a name with an unparseable claimedAt still counts but skips the curve', () => {
  const s = summarize(
    [
      rec({ name: 'good', claimedAt: '2026-01-01T00:00:00.000Z' }),
      rec({ name: 'broken', claimedAt: 'not a date' }),
    ],
    { now: at('2026-01-01T12:00:00.000Z') },
  );
  assert.equal(s.total, 2);
  assert.deepEqual(s.cumulative, [{ date: '2026-01-01', claims: 1, total: 1 }]);
});

test('providerFor names the host behind a known CNAME target', () => {
  assert.equal(providerFor({ CNAME: 'cname.vercel-dns.com' }), 'Vercel');
  assert.equal(providerFor({ CNAME: 'e7a81f500a55fdf8.vercel-dns-017.com' }), 'Vercel');
  assert.equal(providerFor({ CNAME: 'myapp.netlify.app' }), 'Netlify');
  assert.equal(providerFor({ CNAME: 'user.github.io' }), 'GitHub Pages');
  assert.equal(providerFor({ CNAME: 'site.pages.dev' }), 'Cloudflare Pages');
});

test('providerFor calls an unrecognised host Other, not by its hostname', () => {
  assert.equal(providerFor({ CNAME: 'ingress.my-homelab.example' }), 'Other');
  assert.equal(providerFor({ CNAME: 'fly.dev.' }), 'Other');
});

test('providerFor has nothing to say about a name with no CNAME', () => {
  assert.equal(providerFor({}), null);
  assert.equal(providerFor({ URL: 'https://example.com' }), null);
  assert.equal(providerFor({ A: ['1.2.3.4'] }), null);
});

test('hosts counts CNAME targets by provider, busiest first', () => {
  const s = summarize(
    [
      rec({ name: 'a', records: { CNAME: 'cname.vercel-dns.com' } }),
      rec({ name: 'b', records: { CNAME: 'x.vercel-dns-017.com' } }),
      rec({ name: 'c', records: { CNAME: 'site.netlify.app' } }),
      rec({ name: 'd', records: { CNAME: 'ingress.my-homelab.example' } }),
      rec({ name: 'e', records: { URL: 'https://example.com' } }),
      rec({ name: 'f' }),
    ],
    { now: at('2026-01-02T00:00:00.000Z') },
  );
  assert.deepEqual(s.hosts, [
    { provider: 'Vercel', count: 2 },
    { provider: 'Netlify', count: 1 },
    { provider: 'Other', count: 1 },
  ]);
});
