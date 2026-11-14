// Pure RRset diff: desired vs current normalized records -> creates, updates,
// deletes, each an RRset { name, type, ttl, records: [content...] } sorted by
// name then type. Duplicates collapse. Running it on its own output's result
// yields an empty plan (idempotent).
//
// Protected names are never created, changed or deleted here:
//   - SOA anywhere, NS at the apex
//   - every record at the apex itself (operator-managed: A, MX, TXT, ...)
//   - the wildcard and anything under it
//   - any first label in data/reserved-infrastructure.json (www, ns1, ns2
//     glue, mail, _dmarc, ...) and everything below it
// A desired record at a protected name comes back in `rejected`, not applied.
import infrastructure from '../../data/reserved-infrastructure.json' with { type: 'json' };

const RESERVED = new Set(infrastructure);

export function claimLabel(name, zone) {
  const z = `.${zone.replace(/\.$/, '')}.`;
  if (!name.endsWith(z)) return null;
  return name.slice(0, -z.length).split('.').pop();
}

export function isProtected(name, type, zone) {
  const apex = `${zone.replace(/\.$/, '')}.`;
  if (type === 'SOA' || name === apex) return true;
  const label = claimLabel(name, zone);
  if (label === null) return true; // out of zone: never ours
  return label === '*' || name.startsWith('*.') || RESERVED.has(label);
}

const group = (records) => {
  const sets = new Map();
  for (const r of records) {
    const key = `${r.name}\t${r.type}`;
    if (!sets.has(key)) sets.set(key, { name: r.name, type: r.type, ttl: r.ttl, records: new Set() });
    sets.get(key).records.add(r.content);
  }
  for (const s of sets.values()) s.records = [...s.records].sort();
  return sets;
};
const order = (a, b) => (a.name === b.name ? a.type.localeCompare(b.type) : a.name.localeCompare(b.name));

// owned(name): may this run delete RRsets at `name`? Defaults to everything
// not protected. keep(record): current records always carried into desired.
export function diffRecords(desired, current, { zone, owned = () => true, keep = () => false } = {}) {
  const rejected = desired.filter((r) => isProtected(r.name, r.type, zone));
  const want = group([
    ...desired.filter((r) => !isProtected(r.name, r.type, zone)),
    ...current.filter((r) => keep(r) && !isProtected(r.name, r.type, zone)),
  ]);
  const have = group(current.filter((r) => !isProtected(r.name, r.type, zone)));

  const creates = [], updates = [], deletes = [];
  for (const [key, w] of want) {
    const h = have.get(key);
    if (!h) creates.push(w);
    else if (h.ttl !== w.ttl || h.records.join('\n') !== w.records.join('\n')) updates.push(w);
  }
  for (const [key, h] of have) if (!want.has(key) && owned(h.name)) deletes.push({ ...h });
  return {
    creates: creates.sort(order),
    updates: updates.sort(order),
    deletes: deletes.sort(order),
    rejected: [...group(rejected).values()].sort(order),
  };
}
