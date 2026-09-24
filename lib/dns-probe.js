import dns from 'node:dns/promises';

// The "what is this name actually serving" probe, shared by /api/dns-check
// (the manage page's verify loop) and the public /debug/<name> page. Kept in
// lib so both answer with the same verdict for the same name at the same
// moment; a debug page that disagreed with the panel it explains would be
// worse than no page at all.

const ZONE = 'runs-at.dev';
const PROBE_TIMEOUT_MS = 8000;

// SSRF guard: the record's A entries and any redirect target must not point
// at a private network the server can reach. lib/schema.js accepts any valid
// IPv4 including loopback, link-local, and RFC 1918 ranges — the schema
// governs what DNS can express, not what an endpoint should fetch.
const PRIVATE_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
];

// TOCTOU: this resolves the name once, then `fetch` below resolves it again
// independently. A short-TTL record could answer public here and private on
// the second lookup (DNS rebinding). Fixing properly means resolving once and
// connecting to the pinned address, which is more machinery than this
// warrants today: `redirect: 'manual'` means at most a `<title>` comes back,
// from a host inside our own zone, and the schema only accepts A records
// (no AAAA, so no `::1` bypass). The reasoning lives here so it isn't
// rediscovered.
async function resolveAndCheckPrivate(hostname) {
  const addresses = await dns.resolve4(hostname).catch(() => []);
  return addresses.some((addr) => PRIVATE_RANGES.some((pattern) => pattern.test(addr)));
}

// No redirect following. The initial URL is always <name>.runs-at.dev
// (grammar-validated by every caller), so the destination is constrained by
// DNS, not by whoever set the record. A URL-redirect name still classifies
// correctly: the registry's own wildcard serves the 307 itself, and the probe
// sees the registry's answer, not the redirect target.
export async function probe(name) {
  const host = `${name}.${ZONE}`;
  try {
    if (await resolveAndCheckPrivate(host)) {
      return { ok: true, refused: true, finalHost: host, title: '', finalUrl: `https://${host}/` };
    }
    const res = await fetch(`https://${host}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { 'user-agent': 'runs-at-dev-probe (github.com/preetmendpara/runs-at.dev)' },
    });
    const location = res.headers.get('location');
    // A 3xx without following the redirect: classify by the status, don't
    // fetch wherever it points.
    if (res.status >= 300 && res.status < 400 && location) {
      return { ok: true, finalHost: host, title: '', finalUrl: location, redirected: true };
    }
    const body = await res.text();
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim() ?? '';
    return { ok: true, finalHost: host, title, finalUrl: `https://${host}/` };
  } catch {
    return { ok: false };
  }
}

// ── Which subdomain labels to verify, and how ────────────────
//
// /api/dns-check resolves the claimed name itself; a record may also publish
// under labels (`blog`, `mail`, `_vercel`), and a table row on one of those
// had nothing to compare against. The labels come from the committed record,
// never from the request: the endpoint takes only `name`, so there is no way
// to ask it to resolve an arbitrary hostname.
//
// Only the types a label actually declares are looked up -- a label with one
// CNAME costs one query, not five -- and the whole plan is capped, so a
// request stays bounded whatever a record holds.
export const LABEL_LOOKUP_CAP = 12;
export const LABEL_TYPES = ['CNAME', 'A', 'AAAA', 'TXT', 'MX'];

// The same grammar lib/schema.js enforces. Re-checked here rather than
// trusted, so a record written under an older rule can never build a
// hostname this was not meant to resolve.
const LABEL_RE = /^_?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const NESTED_LABEL_RE = /^_[a-z0-9]([a-z0-9-]{0,61}[a-z0-9]?)?\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9]?)?$/;

export function planLabelLookups(record, { cap = LABEL_LOOKUP_CAP } = {}) {
  const subdomains = record?.subdomains ?? {};
  const plan = [];

  for (const label of Object.keys(subdomains)) {
    if (!LABEL_RE.test(label) && !NESTED_LABEL_RE.test(label)) continue;
    const declared = subdomains[label] ?? {};
    for (const type of LABEL_TYPES) {
      if (!(type in declared)) continue;
      if (plan.length >= cap) return plan;
      plan.push({ label, type });
    }
  }
  return plan;
}

// Runs a plan against the resolver. Each lookup fails quietly to an empty
// array, as the rest of the check does: one label that does not resolve must
// not take down the answer for every other row.
export async function resolveLabels(plan, name, { zone = ZONE, resolver = dns } = {}) {
  const out = {};
  await Promise.all(plan.map(async ({ label, type }) => {
    const host = `${label}.${name}.${zone}`;
    const answers = await lookupType(resolver, type, host).catch(() => []);
    (out[label] ??= {})[type.toLowerCase()] = answers;
  }));
  return out;
}

function lookupType(resolver, type, host) {
  if (type === 'CNAME') return resolver.resolveCname(host);
  if (type === 'A') return resolver.resolve4(host);
  if (type === 'AAAA') return resolver.resolve6(host);
  if (type === 'MX') return resolver.resolveMx(host);
  return resolver.resolveTxt(host).then((records) => records.map((chunks) => chunks.join('')));
}
