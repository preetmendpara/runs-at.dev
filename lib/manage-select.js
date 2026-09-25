import { validateName } from './name.js';

// Which names the signed-in account may manage on /manage, and which one is
// open. The owners/ index and the entitlement record only nominate
// candidates: either can be stale, so every candidate's domain file is read
// and only names whose record says this login owns them are listed. The
// ?name= the browser sends is a request, never a grant -- it selects a name
// only if it survived that check.
//
// readRecord(name) -> the record, or null. Throws are treated as unreadable.
// Returns { owned: [{ name, record }], unreadable: [name], selected, refused }.
export async function resolveManagedNames({ login, candidates, requested, readRecord }) {
  const names = [...new Set(candidates.filter((n) => typeof n === 'string' && validateName(n).ok))];
  const records = await Promise.all(names.map((n) => Promise.resolve(readRecord(n)).catch(() => undefined)));

  const me = String(login ?? '').toLowerCase();
  const owned = [];
  const unreadable = [];
  names.forEach((name, i) => {
    const record = records[i];
    if (record === undefined) unreadable.push(name);
    else if (record && String(record.owner?.github ?? '').toLowerCase() === me) owned.push({ name, record });
  });

  const wanted = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (!wanted) return { owned, unreadable, selected: owned[0]?.name ?? null, refused: false };
  const hit = owned.find((o) => o.name === wanted);
  return { owned, unreadable, selected: hit ? hit.name : null, refused: !hit };
}
