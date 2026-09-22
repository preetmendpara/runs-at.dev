// Aggregation for the public /stats page. Pure functions over an array of
// already-parsed registry records: no fs, no fetch, no Next. The page reads
// `domains/` off disk at build time and hands the array in, which keeps the
// arithmetic testable on its own rather than only reachable by rendering.
import { modeOf } from './record-fields.js';

const DAY = 86_400_000;

// UTC throughout. `claimedAt` is written as an ISO instant by the claim API,
// and a growth curve that shifts a claim into a different bucket depending on
// where the build machine sits is a curve nobody can reconcile with the repo.
function dayOf(date) {
  return date.toISOString().slice(0, 10);
}

function claimDate(record) {
  const ms = Date.parse(record?.claimedAt);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function summarize(records = [], { now = new Date(), recentLimit = 8 } = {}) {
  const list = Array.isArray(records) ? records : [];

  const owners = new Set();
  const usage = { card: 0, cname: 0, url: 0, advanced: 0 };
  const hosts = new Map();
  const dated = [];

  for (const record of list) {
    const login = record?.owner?.github;
    if (typeof login === 'string' && login) owners.add(login.toLowerCase());

    usage[modeOf(record?.records ?? {})] += 1;

    const provider = providerFor(record?.records ?? {});
    if (provider) hosts.set(provider, (hosts.get(provider) ?? 0) + 1);

    // schema.js already rejects an unparseable claimedAt, so this guard only
    // fires on a record that reached disk some other way. It stays counted in
    // `total` -- the name is claimed either way -- but it can't be placed on a
    // timeline, so it sits out of the curve rather than landing on epoch zero.
    const at = claimDate(record);
    if (at) dated.push({ record, at });
  }

  dated.sort((a, b) => a.at - b.at);

  const weekAgo = now.getTime() - 7 * DAY;

  return {
    total: list.length,
    owners: owners.size,
    claimedThisWeek: dated.filter(({ at }) => at.getTime() >= weekAgo).length,
    first: dated.length ? dated[0].record.claimedAt : null,
    latest: dated.length ? dated[dated.length - 1].record.claimedAt : null,
    cumulative: cumulativeSeries(dated, now),
    usage,
    // Busiest first, ties alphabetical, so the order is stable between builds
    // rather than following whatever order readdir happened to return.
    hosts: [...hosts]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider)),
    recent: dated
      .slice(-recentLimit)
      .reverse()
      .map(({ record }) => ({
        name: record.name,
        github: record.owner.github,
        claimedAt: record.claimedAt,
      })),
  };
}

// One point per day from the first claim through today, including the days
// nothing happened. A sparse series would draw a straight line between two
// distant claims and imply steady growth that never occurred; a flat step is
// the honest shape.
function cumulativeSeries(dated, now) {
  if (!dated.length) return [];

  const perDay = new Map();
  for (const { at } of dated) {
    const key = dayOf(at);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const out = [];
  let running = 0;
  const end = Date.parse(`${dayOf(now)}T00:00:00.000Z`);
  for (let t = Date.parse(`${dayOf(dated[0].at)}T00:00:00.000Z`); t <= end; t += DAY) {
    const date = dayOf(new Date(t));
    const claims = perDay.get(date) ?? 0;
    running += claims;
    out.push({ date, claims, total: running });
  }
  return out;
}

// Known CNAME targets, longest-suffix-first so `vercel-dns-017.com` doesn't
// have to be enumerated separately from `vercel-dns.com`.
const HOSTS = [
  [/\.vercel-dns(-\d+)?\.com$/, 'Vercel'],
  [/\.vercel\.app$/, 'Vercel'],
  [/\.netlify\.app$/, 'Netlify'],
  [/\.github\.io$/, 'GitHub Pages'],
  [/\.pages\.dev$/, 'Cloudflare Pages'],
  [/\.onrender\.com$/, 'Render'],
  [/\.up\.railway\.app$/, 'Railway'],
  [/\.web\.app$/, 'Firebase'],
  [/\.firebaseapp\.com$/, 'Firebase'],
  [/\.replit\.app$/, 'Replit'],
  [/\.codeberg\.page$/, 'Codeberg Pages'],
];

export function providerFor(records = {}) {
  const target = String(records?.CNAME ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!target) return null;

  for (const [pattern, label] of HOSTS) {
    if (pattern.test(target)) return label;
  }

  // Deliberately not the target's apex domain. Showing `ingress.my-homelab.example`
  // would be better data, but it publishes a self-hosting owner's infrastructure
  // hostname on a page they never chose to appear on -- and the record exists so
  // DNS can resolve it, not so this page can enumerate it. "Other" keeps the
  // counts summing to the CNAME total without that trade.
  return 'Other';
}
