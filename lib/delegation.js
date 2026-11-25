// Custom nameservers for a claimed name: who may set them, and the live check
// that runs before a delegation is committed.
//
// A delegation hands `<name>.runs-at.dev` to servers we do not run, so two
// things are checked first:
//   - the account: older than 30 days with a public repository, the same bar
//     eligibility.js applies to claiming, held here even for names granted by
//     an admin;
//   - the servers: each listed nameserver must resolve and answer for the name
//     (an SOA for it). Publishing a delegation to servers that do not answer
//     takes the name offline -- a "lame delegation" -- and looks like our
//     outage to every visitor.
import { Resolver } from 'node:dns/promises';
import { normalizeNameserver } from './schema.js';

const DAY = 86_400_000;
export const DELEGATION_MIN_ACCOUNT_DAYS = 30;

export function mayDelegate(session, { now = Date.now() } = {}) {
  const created = Date.parse(session?.createdAt ?? '');
  if (Number.isNaN(created) || now - created < DELEGATION_MIN_ACCOUNT_DAYS * DAY) {
    return { ok: false, reason: `Custom nameservers need a GitHub account at least ${DELEGATION_MIN_ACCOUNT_DAYS} days old.` };
  }
  if (!(Number(session?.publicRepos) >= 1)) {
    return { ok: false, reason: 'Custom nameservers need a GitHub account with at least one public repository.' };
  }
  return { ok: true };
}

// ── Lame delegations: tell the owner, then hand the name back ──────────────
//
// A name whose nameservers stopped answering is dark for every visitor. The
// daily health check opens one issue per such name (the owner is mentioned),
// and if the name is still lame LAME_GRACE_DAYS after that issue opened, the
// delegation is removed so the name falls back to runs-at.dev DNS (its
// profile card). An issue whose name answers again, or is no longer
// delegated, is closed. Pure: the script owns the network.
export const LAME_LABEL = 'lame-delegation';
export const LAME_GRACE_DAYS = 7;
export const lameTitle = (name) => `${name}.runs-at.dev nameservers are not answering`;
const titleName = (title) => /^([a-z0-9-]+)\.runs-at\.dev nameservers are not answering$/.exec(String(title ?? ''))?.[1] ?? null;

export function planLameActions({ lame = [], delegated = [], issues = [], now = Date.now(), cap = 5 }) {
  const lameSet = new Set(lame);
  const open = new Map();
  for (const issue of issues) {
    const name = titleName(issue.title);
    if (name && issue.state === 'open') open.set(name, issue);
  }
  const toOpen = lame.filter((n) => !open.has(n)).slice(0, cap);
  const toRevert = lame
    .filter((n) => open.has(n) && now - Date.parse(open.get(n).created_at) >= LAME_GRACE_DAYS * 86_400_000)
    .map((n) => ({ name: n, issue: open.get(n).number }));
  const delegatedSet = new Set(delegated);
  const toClose = [...open.entries()]
    .filter(([n]) => !lameSet.has(n) || !delegatedSet.has(n))
    .map(([n, issue]) => ({ name: n, issue: issue.number, recovered: delegatedSet.has(n) }));
  return { toOpen, toRevert, toClose };
}

export function lameIssueBody(name, owner, detail) {
  return `${owner ? `@${owner} — ` : ''}\`${name}.runs-at.dev\` is delegated to your own nameservers, but they are not answering for it, so the name is unreachable for everyone.

What failed: ${detail}

**Fix:** make sure \`${name}.runs-at.dev\` exists as a zone at your DNS provider and the nameservers listed on [/manage](https://runs-at.dev/manage?name=${name}) are the ones it gave you. Or switch back to runs-at.dev DNS there.

If it is still not answering ${LAME_GRACE_DAYS} days after this issue opened, the delegation is removed automatically and the name falls back to runs-at.dev DNS (your profile card). You can delegate again any time.

---
Opened automatically by the daily health check.`;
}

// Returns { ok, results: [{ host, ok, detail }] }. `makeResolver` is injected
// for tests; by default a fresh resolver with short timeouts.
export async function checkNameservers(fqdn, hosts, {
  makeResolver = () => new Resolver({ timeout: 3000, tries: 2 }),
} = {}) {
  const lookup = makeResolver();
  const results = await Promise.all(hosts.map(async (raw) => {
    const host = normalizeNameserver(raw);
    let addresses = [];
    try {
      addresses = await lookup.resolve4(host);
    } catch {
      try { addresses = await lookup.resolve6(host); } catch { /* none */ }
    }
    if (!addresses.length) return { host, ok: false, detail: 'does not resolve to an address' };

    const ask = makeResolver();
    ask.setServers(addresses.slice(0, 2));
    try {
      const soa = await ask.resolveSoa(fqdn);
      return soa ? { host, ok: true, address: addresses[0], detail: `answers (serial ${soa.serial})` } : { host, ok: false, detail: 'no SOA for this name' };
    } catch (err) {
      const why = err?.code === 'ENOTFOUND' ? 'has no zone for this name yet'
        : err?.code === 'EREFUSED' ? 'refuses queries for this name'
        : err?.code === 'ETIMEOUT' ? 'did not answer'
        : 'does not answer for this name';
      return { host, ok: false, detail: why };
    }
  }));
  return { ok: results.every((r) => r.ok), results };
}
