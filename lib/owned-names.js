// Every name a signed-in account owns, and whether it may still claim one.
//
// Shared by the homepage (which shows "is yours" instead of the claim form),
// the nav (which says "Claimed" instead of "Claim yours") and /api/me. A name
// counts whether it came from a claim, a swap or an admin grant: the owners/
// index and the entitlement record only nominate candidates, and each one's
// domain file must name this login before it is listed (resolveManagedNames).
import { getOwnerIndex } from './owners.js';
import { getRecord } from './registry.js';
import { getEntitlement, heldNames, totalAllowed } from './entitlements.js';
import { resolveManagedNames } from './manage-select.js';

export async function ownedNamesFor(login, {
  token,
  readIndex = (l) => getOwnerIndex(l, { token }),
  readEntitlement = (l) => getEntitlement(l, { token }),
  readRecord = (n) => getRecord(n, { token }),
} = {}) {
  if (!login) return { names: [], records: {}, slotsFree: 0 };
  const [index, entitlement] = await Promise.all([
    Promise.resolve().then(() => readIndex(login)).catch(() => null),
    Promise.resolve().then(() => readEntitlement(login)).catch(() => null),
  ]);
  const { owned } = await resolveManagedNames({
    login,
    candidates: [...(index?.names ?? []), ...(entitlement?.names ?? [])],
    readRecord,
  });
  const names = owned.map((o) => o.name).sort();
  const records = Object.fromEntries(owned.map((o) => [o.name, o.record]));
  // No entitlement file = the default single slot.
  const allowed = entitlement ? totalAllowed(entitlement) : 1;
  const used = entitlement ? heldNames(entitlement, names).length : names.length;
  return { names, records, slotsFree: Math.max(0, allowed - used) };
}
