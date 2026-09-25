import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API, REPO, headers, getContentsMeta, getRecord, onBranch } from './registry.js';
import { getOwnerIndex } from './owners.js';
import { INCLUDED_DOMAINS } from './claim.js';
import { validateName } from './name.js';

export { INCLUDED_DOMAINS };

// How many names an account may hold, and which slots it holds right now.
//
// entitlements/<login>.json is the authoritative record of both:
//
//   included      the one name every eligible account gets
//   adminGranted  extra slots the maintainer granted (any non-negative integer)
//   names         every name holding a slot: claimed, or reserved mid-claim
//   pending       name -> ISO time, for slots reserved but not yet confirmed
//                 by a written domains/<name>.json
//   pullRequests  name -> pull request number, for slots an open pull request
//                 holds until it is merged or closed
//   history       the audit trail of grants and revokes
//
// Every change to slots -- claim, release, swap, grant, revoke -- is a
// compare-and-swap on this one file, so they are applied one after another
// and no interleaving can leave more names held than allowed. owners/ stays a
// derived index: it is only ever unioned in as a lower bound (it may know
// names claimed by pull request, or held before this file existed), so a
// stale, rebuilt or deleted index can add slots to the count but never
// remove one.
//
// An account with no file has the default: 1 included, 0 granted. Each source
// of slots is its own field, so a later source is one more term in
// totalAllowed, not a rewrite.

// A reservation older than this whose domain file never appeared belongs to
// a claim that died mid-flight (a function times out long before this). Until
// then it counts, so a crash fails closed rather than freeing the slot early.
export const PENDING_TTL_MS = 10 * 60 * 1000;

const LOGIN_SHAPE = /^[a-z0-9-]{1,39}$/;

export function entitlementPath(login) {
  const lower = String(login ?? '').toLowerCase();
  if (!LOGIN_SHAPE.test(lower)) throw new Error(`invalid login: ${login}`);
  return `entitlements/${lower}.json`;
}

const isCount = (n) => Number.isSafeInteger(n) && n >= 0;
const cleanNames = (list) =>
  Array.isArray(list) ? [...new Set(list.filter((n) => typeof n === 'string' && validateName(n).ok))] : [];

// A malformed value never widens an allowance: a bad adminGranted reads as 0.
// Names are kept whatever else is wrong, so slots are never dropped by a parse.
export function normalizeEntitlement(data, login) {
  const names = cleanNames(data?.names);
  const pending = {};
  for (const [name, at] of Object.entries(data?.pending ?? {})) {
    if (names.includes(name) && typeof at === 'string') pending[name] = at;
  }
  // name -> pull request number, for slots reserved by an open pull request.
  // Unlike a website reservation these never expire on a timer: a review can
  // take days. They end when the pull request closes (closePullRequestSlot).
  const pullRequests = {};
  for (const [name, pr] of Object.entries(data?.pullRequests ?? {})) {
    if (names.includes(name) && Number.isSafeInteger(pr) && pr > 0) pullRequests[name] = pr;
  }
  return {
    github: String(data?.github ?? login ?? '').toLowerCase(),
    included: INCLUDED_DOMAINS,
    adminGranted: isCount(data?.adminGranted) ? data.adminGranted : 0,
    names,
    pending,
    pullRequests,
    history: Array.isArray(data?.history) ? data.history : [],
  };
}

export function totalAllowed(ent) {
  return ent.included + ent.adminGranted;
}

// Slots held: the authoritative names plus anything the derived index knows
// that this file does not yet (pull-request claims, pre-existing names).
export function heldNames(ent, indexNames = []) {
  return [...new Set([...ent.names, ...cleanNames(indexNames)])];
}

export function slotSummary(ent, used) {
  const total = totalAllowed(ent);
  return {
    included: ent.included,
    adminGranted: ent.adminGranted,
    total,
    used,
    available: Math.max(0, total - used),
  };
}

// A grant or revoke quantity: any positive whole number. No upper bound by
// design; the maintainer decides.
export function parseAmount(value) {
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function applyGrant(ent, { amount, by, reason, at = new Date() }) {
  const adminGranted = ent.adminGranted + amount;
  if (!Number.isSafeInteger(adminGranted)) return { ok: false, code: 'too_large' };
  return {
    ok: true,
    entitlement: {
      ...ent,
      adminGranted,
      history: [...ent.history, { at: at.toISOString(), by, action: 'grant', amount, reason, adminGranted }],
    },
  };
}

// Only unused slots can be taken back: the grant may not drop below what the
// slots held right now (claimed and reserved) already need.
export function applyRevoke(ent, { amount, used, by, reason, at = new Date() }) {
  const minimum = Math.max(0, used - ent.included);
  const adminGranted = ent.adminGranted - amount;
  if (adminGranted < minimum) {
    return { ok: false, code: 'below_required', revocable: Math.max(0, ent.adminGranted - minimum) };
  }
  return {
    ok: true,
    entitlement: {
      ...ent,
      adminGranted,
      history: [...ent.history, { at: at.toISOString(), by, action: 'revoke', amount, reason, adminGranted }],
    },
  };
}

// Throws on a read failure (rate limit, outage): callers fail closed.
export async function getEntitlement(login, opts = {}) {
  const meta = await getContentsMeta(entitlementPath(login), opts);
  const ent = normalizeEntitlement(meta?.data, login);
  Object.defineProperty(ent, 'sha', { value: meta?.sha, enumerable: false });
  return ent;
}

// Compare-and-swap on the file's sha. A create (no sha) is refused if the
// file appeared meanwhile, an update if it changed: both come back 'stale'.
export async function putEntitlement(ent, { token, sha, message, fetchImpl = fetch }) {
  const payload = {
    message,
    content: Buffer.from(serializeEntitlement(ent)).toString('base64'),
  };
  if (sha) payload.sha = sha;
  const res = await fetchImpl(`${API}/repos/${REPO}/contents/${entitlementPath(ent.github)}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(onBranch(payload)),
  });
  if (res.status === 403 || res.status === 429) return { ok: false, reason: 'ratelimited' };
  if (res.status === 409 || res.status === 422) return { ok: false, reason: 'stale' };
  if (!res.ok) return { ok: false, reason: 'error' };
  return { ok: true };
}

// The one read-modify-write every slot change goes through. `change` gets the
// entitlement and the slots held (authoritative names unioned with the index)
// and returns { entitlement, message } to write, or { refuse: code, ... } to
// stop. A write that lost a race is retried against a fresh read, so the
// decision is always made on the state it is written over.
export async function updateEntitlement(login, change, { token, fetchImpl = fetch, attempts = 5 } = {}) {
  let last = 'stale';
  for (let i = 0; i < attempts; i++) {
    let ent;
    let index;
    try {
      [ent, index] = await Promise.all([
        getEntitlement(login, { token, fetchImpl }),
        getOwnerIndex(login, { token, fetchImpl }),
      ]);
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    let out;
    try {
      out = await change(ent, heldNames(ent, index?.names));
    } catch {
      return { ok: false, reason: 'unreadable' };
    }
    if (out.refuse) return { ok: false, reason: out.refuse, ...out };
    if (!out.entitlement) return { ok: true, entitlement: ent, unchanged: true, ...out };
    const write = await putEntitlement(out.entitlement, { token, fetchImpl, sha: ent.sha, message: out.message });
    if (write.ok) return { ok: true, ...out };
    last = write.reason;
    if (last !== 'stale') break;
  }
  return { ok: false, reason: last };
}

// Held slots that no longer have a name behind them: a domain file that is
// gone or owned by someone else, or a reservation whose claim died. Fresh
// reservations are always kept. Throws if a record cannot be read, so the
// caller fails closed instead of freeing a slot it could not check.
async function staleSlots(login, ent, held, { token, fetchImpl, now }) {
  const stale = [];
  const confirmed = [];
  for (const name of held) {
    const at = ent.pending[name];
    if (at && now - Date.parse(at) < PENDING_TTL_MS) continue;
    const pr = ent.pullRequests[name];
    // A pull request's slot is held for as long as the pull request is open.
    if (pr && (await pullRequestState(pr, { token, fetchImpl })) === 'open') continue;
    const record = await getRecord(name, { token, fetchImpl });
    if (record && String(record.owner?.github ?? '').toLowerCase() === login.toLowerCase()) {
      if (at || pr) confirmed.push(name);
    } else {
      stale.push(name);
    }
  }
  return { stale, confirmed };
}

// 'open' or 'closed'. Throws when it cannot tell, so the slot stays held.
async function pullRequestState(number, { token, fetchImpl }) {
  const res = await fetchImpl(`${API}/repos/${REPO}/pulls/${number}`, { headers: headers(token) });
  if (!res.ok) {
    const err = new Error(`pull request read failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return (await res.json()).state;
}

const omit = (map, drop) => Object.fromEntries(Object.entries(map).filter(([n]) => !drop.includes(n)));
const withoutPending = omit;
// Clear every reservation mark for these names, website and pull request.
const unmark = (ent, drop) => ({ pending: omit(ent.pending, drop), pullRequests: omit(ent.pullRequests, drop) });

// Take a slot for `name` before its domain file is written. Refused when every
// slot is held; at that point held slots are checked against domains/ first,
// so a slot left behind by a release, a moderation removal or a crashed claim
// is reclaimed -- only after its reservation has expired.
export function reserveSlot(login, name, { token, fetchImpl = fetch, now = () => Date.now() } = {}) {
  return updateEntitlement(login, async (ent, held) => {
    if (held.includes(name)) return { reserved: false };
    let names = held;
    let marks = unmark(ent, []);
    if (names.length >= totalAllowed(ent)) {
      const { stale, confirmed } = await staleSlots(login, ent, names, { token, fetchImpl, now: now() });
      names = names.filter((n) => !stale.includes(n));
      marks = unmark(ent, [...stale, ...confirmed]);
      if (names.length >= totalAllowed(ent)) return { refuse: 'limit_reached', held: names };
    }
    return {
      reserved: true,
      entitlement: {
        ...ent,
        ...marks,
        names: [...names, name],
        pending: { ...marks.pending, [name]: new Date(now()).toISOString() },
      },
      message: `slots: reserve ${name} for @${login}`,
    };
  }, { token, fetchImpl });
}

// After the domain write: confirm the slot, or hand it back if the write failed.
export function settleSlot(login, name, created, { token, fetchImpl = fetch } = {}) {
  return updateEntitlement(login, (ent) => {
    if (created) {
      if (!ent.pending[name]) return {};
      return {
        entitlement: { ...ent, pending: withoutPending(ent.pending, [name]) },
        message: `slots: confirm ${name} for @${login}`,
      };
    }
    if (!ent.names.includes(name)) return {};
    return {
      entitlement: {
        ...ent,
        names: ent.names.filter((n) => n !== name),
        ...unmark(ent, [name]),
      },
      message: `slots: return ${name} for @${login}`,
    };
  }, { token, fetchImpl });
}

// A released name frees its slot.
export function releaseSlot(login, name, { token, fetchImpl = fetch } = {}) {
  return updateEntitlement(login, (ent, held) => {
    if (!held.includes(name)) return {};
    return {
      entitlement: {
        ...ent,
        names: held.filter((n) => n !== name),
        ...unmark(ent, [name]),
      },
      message: `slots: release ${name} for @${login}`,
    };
  }, { token, fetchImpl });
}

// A swap moves a slot from one name to another: the count never changes, so
// it needs no free slot and spends none. `to` stays pending until its domain
// file is written, so a swap that dies midway still holds the slot.
export function swapSlot(login, from, to, { token, fetchImpl = fetch, now = () => Date.now() } = {}) {
  return updateEntitlement(login, (ent, held) => ({
    entitlement: {
      ...ent,
      names: [...held.filter((n) => n !== from && n !== to), to],
      pullRequests: omit(ent.pullRequests, [from, to]),
      pending: { ...withoutPending(ent.pending, [from]), [to]: new Date(now()).toISOString() },
    },
    message: `slots: swap ${from} to ${to} for @${login}`,
  }), { token, fetchImpl });
}

// Undo swapSlot when the swap failed before anything changed on disk.
export function unswapSlot(login, from, to, { token, fetchImpl = fetch } = {}) {
  return updateEntitlement(login, (ent, held) => ({
    entitlement: {
      ...ent,
      names: [...held.filter((n) => n !== from && n !== to), from],
      pending: withoutPending(ent.pending, [to]),
    },
    message: `slots: undo swap ${from} to ${to} for @${login}`,
  }), { token, fetchImpl });
}

// ── pull-request claims ───────────────────────────────────────────────────
// A pull request that adds a name takes its slot here, in the authoritative
// record, BEFORE it can be merged: validate.yml refuses a new-name pull
// request unless this reservation is on main. So from the moment a pull
// request can merge, the website already counts its name, and there is no
// window after the merge in which the account looks one name short. Called
// by the trusted pr-slots workflow, which runs base-branch code only.

// Reserve `name` for pull request `pr`. Any other name this pull request held
// (its file was renamed in a later push) is handed back first. Refused, like a
// website claim, when every slot is held.
export function reservePullRequestSlot(login, name, pr, { token, fetchImpl = fetch, now = () => Date.now() } = {}) {
  return updateEntitlement(login, async (ent, held) => {
    const previous = Object.keys(ent.pullRequests).filter((n) => ent.pullRequests[n] === pr && n !== name);
    let names = held.filter((n) => !previous.includes(n));
    let marks = unmark(ent, previous);
    if (ent.pullRequests[name] === pr && !previous.length) return { reserved: false };
    if (!names.includes(name)) {
      if (names.length >= totalAllowed(ent)) {
        const { stale, confirmed } = await staleSlots(login, ent, names, { token, fetchImpl, now: now() });
        names = names.filter((n) => !stale.includes(n));
        marks = unmark({ ...ent, ...marks }, [...stale, ...confirmed]);
        if (names.length >= totalAllowed(ent)) return { refuse: 'limit_reached', held: names };
      }
      names = [...names, name];
    }
    return {
      reserved: true,
      entitlement: {
        ...ent,
        names,
        pending: omit(marks.pending, [name]),
        pullRequests: { ...marks.pullRequests, [name]: pr },
      },
      message: `slots: reserve ${name} for @${login} (pull request #${pr})`,
    };
  }, { token, fetchImpl });
}

// The pull request closed. Merged: its name now has a domain file, so the
// slot stays and only the mark goes -- and a name merged without a
// reservation (a maintainer override) is recorded all the same, so the
// website counts it from here on. Closed unmerged: the slot is handed back.
export function closePullRequestSlot(login, name, pr, merged, { token, fetchImpl = fetch } = {}) {
  return updateEntitlement(login, (ent, held) => {
    const mine = Object.keys(ent.pullRequests).filter((n) => ent.pullRequests[n] === pr);
    if (merged) {
      if (!mine.length && held.includes(name) && ent.names.includes(name)) return {};
      return {
        entitlement: {
          ...ent,
          names: [...new Set([...held.filter((n) => !mine.includes(n) || n === name), name])],
          ...unmark(ent, mine),
        },
        message: `slots: confirm ${name} for @${login} (pull request #${pr} merged)`,
      };
    }
    if (!mine.length) return {};
    return {
      entitlement: { ...ent, names: held.filter((n) => !mine.includes(n)), ...unmark(ent, mine) },
      message: `slots: return ${mine.join(', ')} for @${login} (pull request #${pr} closed)`,
    };
  }, { token, fetchImpl });
}

// CI reads the allowance from the same checkout it counts names from, so a
// pull-request claim is judged by exactly the rule /api/claim applies.
export function localEntitlementSource(root) {
  return async (login) => {
    try {
      return normalizeEntitlement(JSON.parse(await readFile(join(root, entitlementPath(login)), 'utf8')), login);
    } catch (err) {
      if (err.code === 'ENOENT') return normalizeEntitlement(null, login);
      throw err;
    }
  };
}

// One-time backfill for accounts that held names before entitlements/ existed.
// Pure: given every domain record and every existing entitlement file, it
// returns the files to create. Deterministic (owners and names sorted) and
// idempotent (an account that already has a file is never rewritten, so a
// second run creates nothing). The names come from domains/ itself, the
// registry, never from the derived owners/ index. An existing file is left
// exactly as it is -- grants, history and all -- and any owned name it does
// not list is reported; the claim path still counts those through the index.
//
// records: [{ file, record }] for domains/*.json
// existing: Map of lowercased login -> parsed entitlement file
export function planBackfill(records, existing = new Map()) {
  const byOwner = new Map();
  const skipped = [];
  for (const { file, record } of records) {
    const login = String(record?.owner?.github ?? '').toLowerCase();
    const name = file.replace(/\.json$/, '');
    if (!LOGIN_SHAPE.test(login) || !validateName(name).ok || record?.name !== name) {
      skipped.push(file);
      continue;
    }
    if (!byOwner.has(login)) byOwner.set(login, []);
    byOwner.get(login).push(name);
  }

  const create = [];
  const kept = [];
  for (const login of [...byOwner.keys()].sort()) {
    const names = byOwner.get(login).sort();
    if (existing.has(login)) {
      const listed = normalizeEntitlement(existing.get(login), login).names;
      kept.push({ login, missing: names.filter((n) => !listed.includes(n)) });
      continue;
    }
    create.push({
      login,
      path: entitlementPath(login),
      entitlement: { github: login, included: INCLUDED_DOMAINS, adminGranted: 0, names, pending: {}, history: [] },
    });
  }
  return { create, kept, skipped: skipped.sort() };
}

export const serializeEntitlement = (ent) => `${JSON.stringify(ent, null, 2)}\n`;