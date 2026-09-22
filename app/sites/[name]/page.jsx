import { notFound, redirect } from 'next/navigation';
import { getRecord } from '../../../lib/registry.js';
import { isValidRedirectUrl } from '../../../lib/schema.js';
import { cardMetadata } from '../../../lib/metadata.js';
import { REPO_URL } from '../../../lib/repo.js';
import { StatusBadge } from '../../components/ui.jsx';

// Record freshness, not the GitHub profile's: a name claimed just now must
// stop serving a cached 404 within seconds, not up to an hour.
export const revalidate = 30;

// Wildcard DNS makes every grammar-valid hostname live, so an anonymous curl
// loop over a few thousand names can exhaust the shared registry quota. A
// dedicated card-read token keeps that failure mode from taking down claiming.
const CARD_TOKEN = process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN;

async function githubProfile(login) {
  const res = await fetch(`https://api.github.com/users/${login}`, {
    // Authorization only when a token actually exists: `Bearer undefined`
    // is a malformed credential GitHub answers with 401, not an anonymous
    // request — the same trap lib/claim-banner.jsx guards against.
    headers: CARD_TOKEN
      ? { Accept: 'application/vnd.github+json', Authorization: `Bearer ${CARD_TOKEN}` }
      : { Accept: 'application/vnd.github+json' },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchRecord(name) {
  const fetchImpl = (url, init) => fetch(url, { ...init, next: { revalidate: 30 } });
  return getRecord(name, { token: CARD_TOKEN, fetchImpl });
}

// Both this and the page below read the record and the GitHub profile. Next
// memoises identical fetches across generateMetadata and the render for one
// request, and both calls go through the same helpers with the same options,
// so a card still costs one registry read and one profile read, not two of
// each. That matters here specifically: these reads come out of CARD_TOKEN's
// hourly quota, which the wildcard makes trivially easy to exhaust.
export async function generateMetadata({ params }) {
  const { name } = await params;
  const record = await fetchRecord(name);
  // An unclaimed wildcard hit is the claim page, not an error: the title
  // must say what the page says (available, claim it), or agents and link
  // previews read "Not found" for a 200 page whose whole job is conversion.
  if (!record) {
    return {
      title: { absolute: `${name}.runs-on.dev is available · runs-on.dev` },
      description: 'This name is not claimed yet. Claim it with GitHub in seconds, free, forever.',
      robots: { index: false },
    };
  }

  const profile = await githubProfile(record.owner.github);
  // Field-by-field merge, same as the page below: record.profile wins where
  // set, GitHub fills the rest, so title/description and the rendered card
  // can never disagree.
  const merged = {
    ...profile,
    name: record.profile?.name ?? profile?.name,
    bio: record.profile?.bio ?? profile?.bio,
  };
  return cardMetadata({ name, record, profile: merged });
}

export default async function Site({ params }) {
  const { name } = await params;
  const record = await fetchRecord(name);

  // Instead of calling notFound() (which loses access to the name), render
  // the claim page directly. This converts misspelling traffic into claims:
  // the visitor sees the name is available, can claim it in one click, and
  // gets suggestions for nearby claimed names.
  if (!record) return <ClaimPage name={name} />;

  const records = record.records ?? {};
  if (records.URL && Object.keys(records).length === 1) {
    // Re-validate at render time, not just at CI review time: the record
    // could have been merged before this rule existed or before it
    // tightened, and this is an open-redirect surface on a trusted domain.
    // Plain redirect() (not permanentRedirect) answers with a 307 here,
    // preserving method and intent and telling browsers not to cache the
    // redirect permanently, unlike a 301/308.
    if (!isValidRedirectUrl(records.URL)) notFound();
    redirect(records.URL);
  }

  const profile = await githubProfile(record.owner.github);

  // The record's profile block overrides what GitHub reports, field by
  // field: an owner who set profile.name keeps their chosen display name
  // even when the GitHub profile says something else, and an unset field
  // falls back rather than blanking the card. cardMetadata receives the
  // merged view so the page and its meta tags can never disagree.
  const overrides = record.profile ?? {};
  const displayName = overrides.name ?? profile?.name;
  const bio = overrides.bio ?? profile?.bio;
  const links = Array.isArray(overrides.links) ? overrides.links : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      <p className="font-(family-name:--font-mono) text-xs tracking-[0.08em] text-(--color-muted) uppercase">
        domains/{name}.json
      </p>

      <div className="slit-frame mt-5 rounded-lg bg-(--color-card) p-6 sm:p-8">
        <div className="flex items-center gap-5">
          {profile?.avatar_url && (
            <span className="slit-frame inline-block shrink-0 rounded-full p-[3px]">
              <img
                src={profile.avatar_url}
                alt=""
                width={64}
                height={64}
                className="rounded-full"
              />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0">
                <a
                  href={`https://${name}.runs-on.dev`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[23px] leading-[1.07] font-normal tracking-[-0.004em] text-(--color-ink) underline decoration-(--color-blue) decoration-2 underline-offset-[6px] sm:text-[34px] sm:tracking-[-0.005em]"
                >
                  {name}.runs-on.dev
                </a>
              </h1>
              <a
                href="/manage"
                className="slit-frame [--slit-over:8px] rounded-full px-3 py-1 font-(family-name:--font-mono) text-xs text-(--color-muted) transition-colors hover:text-(--color-ink)"
              >
                manage
              </a>
            </div>
            {displayName && <p className="mt-1.5 text-sm text-(--color-muted)">{displayName}</p>}
          </div>
        </div>

        {bio && <p className="mt-5 max-w-[540px] text-[16px] leading-[1.5] text-(--color-ash)">{bio}</p>}

        {links.length > 0 && (
          <ul className="mt-6 space-y-12">
            {links.map((link) => (
              <li key={`${link.label}-${link.url}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="slit-frame flex items-center justify-between rounded-lg px-4 py-3 font-(family-name:--font-mono) text-sm text-(--color-ink) transition-colors"
                >
                  <span className="truncate">{link.label}</span>
                  <span aria-hidden className="ml-3 shrink-0 text-(--color-muted)">↗</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <dl className="slit-top mt-8 space-y-1.5 pt-5 font-(family-name:--font-mono) text-xs sm:text-[13px]">
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-(--color-muted)">owner</dt>
            <dd>
              <a
                className="text-(--color-ink) underline"
                href={`https://github.com/${record.owner.github}`}
              >
                @{record.owner.github}
              </a>
            </dd>
          </div>
          {record.claimedAt && (
            <div className="flex gap-4">
              <dt className="w-24 shrink-0 text-(--color-muted)">claimedAt</dt>
              <dd className="text-(--color-ink)">{record.claimedAt}</dd>
            </div>
          )}
          {/* The banner links must be absolute to the apex: this page renders
              on <name>.runs-on.dev hosts, where a relative /banner/<name>
              would be rewritten by proxy.js into /sites/<name>/banner/... and
              404. The banner route lives on runs-on.dev itself. */}
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-(--color-muted)">share</dt>
            <dd className="text-(--color-muted)">
              <a
                className="text-(--color-ink) underline"
                href={`https://runs-on.dev/banner/${name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                banner
              </a>
              {' / '}
              <a
                className="text-(--color-ink) underline"
                href={`https://runs-on.dev/banner/${name}?theme=dark`}
                target="_blank"
                rel="noopener noreferrer"
              >
                dark
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-sm text-(--color-muted)">
        This name is registered on{' '}
        <a className="text-(--color-ink) underline" href="https://runs-on.dev">
          runs-on.dev
        </a>
        . Claim your own.
      </p>

      <p className="mt-2 font-(family-name:--font-mono) text-xs text-(--color-muted)">
        The record above is{' '}
        <a
          className="text-(--color-ink) underline"
          href={`${REPO_URL}/blob/main/domains/${name}.json`}
          target="_blank"
          rel="noopener noreferrer"
        >
          domains/{name}.json
        </a>
        , in a public repo you can read without asking anyone.{' '}
        <a
          className="text-(--color-ink) underline"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          ★ Star the registry
        </a>
      </p>
    </main>
  );
}

// Renders when a name isn't claimed. Converts misspelling traffic into
// claims: shows the name is available, a claim button, and suggestions
// for nearby claimed names (Levenshtein distance <= 2).

// Simple Levenshtein distance, enough for short subdomain names.
function editDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return matrix[a.length][b.length];
}

async function findSimilarNames(attempted) {
  try {
    const res = await fetch('https://api.github.com/repos/zordhalo/runs-on.dev/contents/domains', {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN
          ? { Authorization: `Bearer ${process.env.CARD_TOKEN ?? process.env.REGISTRY_TOKEN}` }
          : {}),
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const entries = await res.json();
    const claimed = entries
      .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
      .map((e) => e.name.replace('.json', ''));

    return claimed
      .filter((c) => c !== attempted && editDistance(attempted, c) <= 2)
      .map((c) => ({ name: c, distance: editDistance(attempted, c) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((s) => s.name);
  } catch {
    return [];
  }
}

async function ClaimPage({ name }) {
  const suggestions = await findSimilarNames(name);

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
      <StatusBadge tone="live" pulse>Available</StatusBadge>

      <h1 className="mt-7 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        {name}.runs-on.dev
      </h1>

      <p className="mt-4 max-w-md text-[16px] leading-[1.5] text-(--color-muted)">
        This name isn&rsquo;t claimed yet. It could be yours in seconds, free, forever.
      </p>

      <a
        href={`/api/auth/github?claim=${encodeURIComponent(name)}`}
        className="btn-pill mt-8"
      >
        Claim {name}.runs-on.dev
        <span aria-hidden="true">→</span>
      </a>

      {suggestions.length > 0 && (
        <div className="slit-top mt-12 w-full max-w-sm pt-7">
          <p className="font-(family-name:--font-mono) text-xs text-(--color-muted)">
            did you mean…
          </p>
          <ul className="mt-3 space-y-2">
            {suggestions.map((s) => (
              <li key={s}>
                <a
                  href={`https://${s}.runs-on.dev`}
                  className="font-(family-name:--font-mono) text-sm text-(--color-ink) underline"
                >
                  {s}.runs-on.dev
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-12 font-(family-name:--font-mono) text-xs text-(--color-muted)">
        <a className="text-(--color-ink) underline" href="https://runs-on.dev">
          runs-on.dev
        </a>{' '}
        · every name here is a file in a{' '}
        <a
          className="text-(--color-ink) underline"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          public repo
        </a>
      </p>
    </main>
  );
}
