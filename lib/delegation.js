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
      return soa ? { host, ok: true, detail: `answers (serial ${soa.serial})` } : { host, ok: false, detail: 'no SOA for this name' };
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
