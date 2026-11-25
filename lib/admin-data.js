// Everything the admin dashboard shows, computed from the registry snapshot
// (the same live read the homepage and /stats use). Pure: no fetch, no Next,
// so the numbers are testable.
import { providerFor } from './stats.js';

const DAY = 86_400_000;

export function modeOfRecord(r) {
  if (r?.nameservers?.length) return 'delegated';
  const rec = r?.records ?? {};
  if (rec.URL) return 'redirect';
  if (rec.CNAME || rec.A?.length || rec.AAAA?.length) return 'hosted';
  if (rec.TXT?.length || rec.MX?.length) return 'dns-only';
  if (Object.keys(r?.subdomains ?? {}).length) return 'card+subdomains';
  return 'card';
}

export function targetOf(r) {
  if (r?.nameservers?.length) return r.nameservers.join(', ');
  const rec = r?.records ?? {};
  if (rec.URL) return rec.URL;
  if (rec.CNAME) return rec.CNAME;
  if (rec.A?.length) return rec.A.join(', ');
  if (rec.AAAA?.length) return rec.AAAA.join(', ');
  if (rec.MX?.length) return rec.MX.map((m) => m.value).join(', ');
  return '';
}

// One row per claimed name, newest first.
export function nameRows(records = []) {
  return records
    .filter((r) => r && typeof r.name === 'string')
    .map((r) => ({
      name: r.name,
      owner: r.owner?.github ?? '',
      claimedAt: r.claimedAt ?? null,
      mode: modeOfRecord(r),
      target: targetOf(r),
      provider: providerFor(r.records ?? {}) ?? '',
      subdomains: Object.keys(r.subdomains ?? {}).length,
      country: r.country ?? '',
      hasProfile: Boolean(r.profile),
      ds: (r.ds ?? []).length,
    }))
    .sort((a, b) => String(b.claimedAt).localeCompare(String(a.claimedAt)));
}

// One row per GitHub account: what it holds and when it last claimed.
export function userRows(rows = []) {
  const byOwner = new Map();
  for (const row of rows) {
    const key = row.owner.toLowerCase();
    if (!key) continue;
    if (!byOwner.has(key)) byOwner.set(key, { login: row.owner, names: [], latest: null, country: row.country });
    const u = byOwner.get(key);
    u.names.push(row.name);
    if (!u.latest || String(row.claimedAt) > String(u.latest)) u.latest = row.claimedAt;
    if (!u.country && row.country) u.country = row.country;
  }
  return [...byOwner.values()]
    .map((u) => ({ ...u, names: u.names.sort(), count: u.names.length }))
    .sort((a, b) => b.count - a.count || String(b.latest).localeCompare(String(a.latest)));
}

export function overview(rows = [], { now = Date.now() } = {}) {
  const count = (pred) => rows.filter(pred).length;
  const byMode = {};
  const byProvider = {};
  const byCountry = {};
  for (const r of rows) {
    byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
    if (r.provider) byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
    if (r.country) byCountry[r.country] = (byCountry[r.country] ?? 0) + 1;
  }
  const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
  const since = (days) => count((r) => r.claimedAt && now - Date.parse(r.claimedAt) <= days * DAY);
  const owners = new Set(rows.map((r) => r.owner.toLowerCase()).filter(Boolean));
  return {
    claims: rows.length,
    owners: owners.size,
    multiNameOwners: userRows(rows).filter((u) => u.count > 1).length,
    last24h: since(1),
    last7d: since(7),
    last30d: since(30),
    byMode: top(byMode, 10),
    providers: top(byProvider, 10),
    countries: top(byCountry, 10),
  };
}
