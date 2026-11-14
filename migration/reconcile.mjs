// Reconciles domains/, owners/ and entitlements/ against each other and
// classifies every discrepancy as expected-by-design (with the code that makes
// it so) or a genuine anomaly. Read-only; deterministic output (sorted, no
// timestamps). Usage: node migration/reconcile.mjs [root] [--json]
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const lower = (s) => String(s ?? '').toLowerCase();
const sorted = (a) => [...a].sort();

export function loadRegistry(root = '.') {
  const read = (dir) =>
    readdirSync(join(root, dir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((file) => ({ file, data: JSON.parse(readFileSync(join(root, dir, file), 'utf8')) }));
  return { domains: read('domains'), owners: read('owners'), entitlements: read('entitlements') };
}

const WHY = {
  ownerIndexDerived: 'owners/ is a derived index rebuilt from domains/ by scripts/sync-owners.mjs (deletes files of logins with no domain)',
  noEntitlementDefault: 'lib/entitlements.js: "An account with no file has the default: 1 included, 0 granted" (normalizeEntitlement(null))',
  entitlementOutlivesNames: 'lib/entitlements.js releaseSlot/settleSlot/closePullRequestSlot remove names but never delete the file; history and adminGranted must persist',
  heldUnion: 'lib/entitlements.js heldNames(): entitlement names are unioned with the owners index, so an owned name missing from names still counts (planBackfill reports these as kept.missing)',
  staleSlot: 'lib/entitlements.js staleSlots(): a held name whose domain file is gone or owned by someone else is reclaimed on the next limit check',
  pending: 'lib/entitlements.js reserveSlot(): pending marks a slot reserved before domains/<name>.json is written; settleSlot clears it',
  pullRequest: 'lib/entitlements.js reservePullRequestSlot(): pullRequests holds a slot for an open PR until closePullRequestSlot',
};

export function reconcile({ domains, owners, entitlements }) {
  const issues = [];
  const add = (kind, classification, item, why) => issues.push({ kind, classification, ...item, why });

  const domainByName = new Map();
  for (const { file, data } of domains) {
    const base = file.replace(/\.json$/, '');
    if (data.name !== base) add('domain-filename-mismatch', 'anomaly', { file, name: data.name }, 'validate requires domains/<name>.json to carry "name": <name>');
    domainByName.set(base, { name: base, owner: lower(data.owner?.github) });
  }
  const ownerFiles = new Map();
  const listedBy = new Map(); // name -> [login]
  for (const { file, data } of owners) {
    const login = file.replace(/\.json$/, '');
    if (lower(data.github) !== login || data.github !== login) add('owner-filename-mismatch', 'anomaly', { file, github: data.github }, 'lib/owners.js pathFor()/putOwnerIndex write owners/<lowercase login>.json with github lowercased');
    ownerFiles.set(login, data.names ?? []);
    for (const n of data.names ?? []) listedBy.set(n, [...(listedBy.get(n) ?? []), login]);
  }
  const entFiles = new Map();
  for (const { file, data } of entitlements) {
    const login = file.replace(/\.json$/, '');
    if (data.github !== login) add('entitlement-filename-mismatch', 'anomaly', { file, github: data.github }, 'lib/entitlements.js entitlementPath() keys files by lowercased login');
    entFiles.set(login, data);
  }

  // domains vs owners index
  const domainOwners = new Map(); // login -> names
  const domainRows = [];
  for (const d of [...domainByName.values()]) {
    domainOwners.set(d.owner, [...(domainOwners.get(d.owner) ?? []), d.name]);
    const idx = ownerFiles.get(d.owner);
    const row = { name: d.name, owner: d.owner, ownerFile: !!idx, listedInOwnerFile: !!idx?.includes(d.name), entitlementFile: entFiles.has(d.owner), listedInEntitlement: !!entFiles.get(d.owner)?.names?.includes(d.name) };
    domainRows.push(row);
    if (!idx) add('domain-owner-without-owners-file', 'anomaly', { name: d.name, owner: d.owner }, WHY.ownerIndexDerived + '; drift until the next sync');
    else if (!row.listedInOwnerFile) add('domain-missing-from-owners-file', 'anomaly', { name: d.name, owner: d.owner }, WHY.ownerIndexDerived + '; drift until the next sync');
  }
  for (const [name, logins] of listedBy) {
    if (logins.length > 1) add('name-in-multiple-owners-files', 'anomaly', { name, logins: sorted(logins) }, 'each domain has one owner.github, so the derived index lists a name once');
    for (const login of logins) {
      const d = domainByName.get(name);
      if (!d) add('owners-name-without-domain', 'anomaly', { name, login }, WHY.ownerIndexDerived + '; stale until the next sync');
      else if (d.owner !== login) add('owners-name-owned-by-other', 'anomaly', { name, login, owner: d.owner }, WHY.ownerIndexDerived);
    }
  }

  // entitlements vs owners vs domains
  const entNoOwner = [];
  for (const [login, e] of entFiles) {
    const names = e.names ?? [];
    const owned = domainOwners.get(login) ?? [];
    if (!ownerFiles.has(login)) {
      const reason = names.length === 0 ? 'no names held (released, returned, or PR closed)' : names.some((n) => domainByName.has(n)) ? 'holds names whose domains belong to others' : 'holds only names with no domain file (pending / PR / stale)';
      entNoOwner.push({ login, reason, names: names.length, pending: Object.keys(e.pending ?? {}).length, pullRequests: Object.keys(e.pullRequests ?? {}).length, adminGranted: e.adminGranted ?? 0, history: (e.history ?? []).length });
      add('entitlement-without-owners-file', 'expected', { login, reason }, WHY.entitlementOutlivesNames + '; ' + WHY.ownerIndexDerived);
    }
    for (const n of names) {
      const d = domainByName.get(n);
      const isPending = n in (e.pending ?? {}), isPr = n in (e.pullRequests ?? {});
      if (!d) add('entitlement-name-without-domain', 'expected', { login, name: n, pending: isPending, pullRequest: e.pullRequests?.[n] ?? null }, isPending ? WHY.pending : isPr ? WHY.pullRequest : WHY.staleSlot);
      else if (d.owner !== login) add('entitlement-name-owned-by-other', isPending || isPr ? 'expected' : 'anomaly', { login, name: n, owner: d.owner, pending: isPending, pullRequest: e.pullRequests?.[n] ?? null }, WHY.staleSlot + (isPending || isPr ? '' : '; harmless (reclaimed) but the slot is counted against this account until then'));
    }
    for (const n of owned) if (!names.includes(n)) add('owned-name-missing-from-entitlement', 'expected', { login, name: n }, WHY.heldUnion);
    for (const n of Object.keys(e.pending ?? {})) if (domainByName.get(n)?.owner === login) add('reservation-mark-on-existing-domain', 'expected', { login, name: n, pending: true }, WHY.pending + '; staleSlots confirms it on the next limit check');
    for (const n of Object.keys(e.pullRequests ?? {})) if (domainByName.get(n)?.owner === login) add('reservation-mark-on-existing-domain', 'expected', { login, name: n, pullRequest: e.pullRequests[n] }, WHY.pullRequest + ' (PR still open, or merged before the close workflow cleared the mark); staleSlots confirms it on the next limit check');
  }
  for (const login of ownerFiles.keys()) if (!entFiles.has(login)) add('owner-without-entitlement', 'expected', { login }, WHY.noEntitlementDefault + '; ' + WHY.heldUnion);

  const pendingReservations = [];
  for (const [login, e] of entFiles) {
    for (const [name, at] of Object.entries(e.pending ?? {})) pendingReservations.push({ login, name, at, domainExists: domainByName.has(name) });
    for (const [name, pr] of Object.entries(e.pullRequests ?? {})) pendingReservations.push({ login, name, pullRequest: pr, domainExists: domainByName.has(name) });
  }

  issues.sort((a, b) => JSON.stringify([a.kind, a.login ?? a.owner, a.name]).localeCompare(JSON.stringify([b.kind, b.login ?? b.owner, b.name])));
  const byKind = {};
  for (const i of issues) {
    const k = (byKind[i.kind] ??= { classification: i.classification, count: 0 });
    k.count++;
    if (k.classification !== i.classification) k.classification = 'mixed';
  }
  const ownersLogins = new Set(ownerFiles.keys()), entLogins = new Set(entFiles.keys()), domainLogins = new Set(domainOwners.keys());
  return {
    counts: {
      domains: domains.length, owners: owners.length, entitlements: entitlements.length,
      distinctDomainOwners: domainLogins.size,
      ownersNameRefs: [...ownerFiles.values()].reduce((n, l) => n + l.length, 0),
      entitlementNameRefs: [...entFiles.values()].reduce((n, e) => n + (e.names?.length ?? 0), 0),
      ownersAndEntitlement: [...ownersLogins].filter((l) => entLogins.has(l)).length,
      ownersWithoutEntitlement: [...ownersLogins].filter((l) => !entLogins.has(l)).length,
      entitlementsWithoutOwnersFile: entNoOwner.length,
      entitlementsWithAdminGrant: [...entFiles.values()].filter((e) => (e.adminGranted ?? 0) > 0).length,
      pendingReservations: pendingReservations.filter((p) => p.at).length,
      pullRequestReservations: pendingReservations.filter((p) => p.pullRequest).length,
      expected: issues.filter((i) => i.classification === 'expected').length,
      anomalies: issues.filter((i) => i.classification === 'anomaly').length,
    },
    byKind,
    entitlementsWithoutOwnersFile: entNoOwner.sort((a, b) => a.login.localeCompare(b.login)),
    entitlementsWithoutOwnersFileByReason: entNoOwner.reduce((m, e) => ({ ...m, [e.reason]: (m[e.reason] ?? 0) + 1 }), {}),
    pendingReservations: pendingReservations.sort((a, b) => (a.login + a.name).localeCompare(b.login + b.name)),
    domains: domainRows.sort((a, b) => a.name.localeCompare(b.name)),
    issues,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.');
  const r = reconcile(loadRegistry(root));
  console.log(JSON.stringify(process.argv.includes('--json') ? r : { counts: r.counts, byKind: r.byKind, entitlementsWithoutOwnersFileByReason: r.entitlementsWithoutOwnersFileByReason }, null, 2));
}
