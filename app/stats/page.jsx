import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarize } from '../../lib/stats.js';
import { readRegistry } from '../../lib/registry-files.js';
import { geoPlacement } from '../../lib/geo-placement.js';
import { CLAIM_GEO } from '../components/claim-geo.js';
import countryCentroids from '../../scripts/country-centroids.json';
import { GrowthChart } from './growth-chart.jsx';
import ConfettiStat from './confetti-stat.jsx';
import ClaimMap from '../components/claim-map.jsx';

export const metadata = {
  title: 'Stats',
  description:
    'How many names have been claimed on runs-at.dev, by whom, and what people point them at. Counted straight from the public registry.',
  alternates: { canonical: 'https://runs-at.dev/stats' },
  openGraph: { title: 'Stats · runs-at.dev' },
};

// Read at build time, never per request. Deploys run from GitHub Actions on
// merge to main, so a claim and this page's rebuild are the same event -- the
// numbers are never more than one merge stale. Reading `domains/` off disk
// also keeps the page off the GitHub API entirely, which matters because the
// wildcard makes that quota trivially easy to exhaust (see app/sites).
export const dynamic = 'force-static';

const USAGE_LABELS = {
  card: 'Profile card',
  cname: 'Pointed at a host',
  url: 'Redirect to a URL',
  advanced: 'Custom DNS records',
};

const MONO = 'font-(family-name:--font-mono)';
const LABEL = `${MONO} text-[12px] tracking-[0.08em] uppercase text-(--color-muted)`;
const NOTE = `${MONO} text-[12px] leading-[1.6] text-(--color-muted)`;

// A numbered block, the homepage's pattern: a heavy rule, then a mono index
// and label in a narrow left column, the content beside it on wide screens.
function Block({ index, label, id, children }) {
  return (
    <section aria-labelledby={id} className="mt-20 border-t-2 border-(--line-strong) pt-6 sm:mt-28">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-12">
        <h2 id={id} className={`${MONO} text-[12px] tracking-[0.12em] text-(--color-ink) uppercase`}>
          <span className="mb-2 block text-[40px] leading-none tracking-normal text-(--color-accent)" style={{ fontFamily: 'var(--font-display)' }}>{index}</span>
          {label}
        </h2>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </section>
  );
}

// Secondary readout cell: label and number on one row on phones, stacked
// from 640px where the cell is a column of the readout.
function Stat({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-4 sm:block sm:px-6 sm:py-6">
      <div className="meta whitespace-nowrap">{label}</div>
      <div className="text-[40px] leading-none text-(--color-ink) sm:mt-4 sm:text-[56px]" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
    </div>
  );
}

function day(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

// A ruled two-column ledger: a heading row, then one row per entry.
function Ledger({ head, rows }) {
  return (
    <div className={`border-2 border-(--line-strong) ${MONO} text-[13px]`}>
      <div aria-hidden="true" className="flex justify-between gap-4 border-b-2 border-(--line-strong) px-4 py-2 text-[12px] tracking-[0.08em] text-(--color-muted) uppercase">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      <ul>
        {rows.map(([key, label, count]) => (
          <li key={key} className="flex items-baseline justify-between gap-4 border-b border-(--line) px-4 py-3 last:border-b-0">
            <span className="text-(--color-ink)">{label}</span>
            <span className="text-(--color-ink) tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Stats() {
  const registry = readRegistry();
  const stats = summarize(registry);
  const placement = geoPlacement(registry, CLAIM_GEO, countryCentroids);
  const usage = Object.entries(stats.usage).filter(([, count]) => count > 0);

  // Blocks are numbered in the order they render; empty ones are skipped.
  let n = 0;
  const next = () => String(++n).padStart(2, '0');

  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-(--line) pb-3 ${LABEL}`}>
        <span>runs-at.dev // registry statistics</span>
        <span>source: domains/*.json</span>
      </div>

      <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[1fr_380px] lg:items-end lg:gap-16">
        <h1 className="text-[clamp(2.4rem,11vw,6.5rem)] leading-[0.92] font-normal tracking-[-0.01em] text-(--color-ink) uppercase lg:text-[clamp(3rem,7.5vw,6.5rem)]">
          <span className="block">Registry</span>{' '}
          <span className="block">/ Stats</span>
        </h1>
        <p className="max-w-[560px] text-[16px] leading-[1.55] text-(--color-ash)">
          Every name here is a file in a public repo, so these numbers are just that repo
          counted. Nothing is estimated and nothing is tracked about visitors.
        </p>
      </div>

      {/* Readout: the total is the primary figure; the other two sit in a
          ruled column beside it (below it on phones). */}
      <section aria-labelledby="readout" className="mt-12 sm:mt-16">
        <h2 id="readout" className="sr-only">Where things stand</h2>
        <div className="surface-ink hard-shadow grid border-2 border-(--line-strong) sm:grid-cols-[3fr_2fr]">
          <div className="border-b-2 border-(--line-strong) sm:border-r-2 sm:border-b-0">
            <ConfettiStat label="Names claimed" value={stats.total} />
          </div>
          <div className="grid divide-y divide-(--line)">
            <Stat label="People" value={stats.owners} />
            <Stat label="Claimed this week" value={stats.claimedThisWeek} />
          </div>
        </div>
      </section>

      {stats.cumulative.length > 1 && (
        <Block index={next()} label="Names claimed over time" id="growth">
          <div className="border-2 border-(--line-strong) bg-(--color-card) p-4 sm:p-6">
            <GrowthChart series={stats.cumulative} />
          </div>
        </Block>
      )}

      {placement.resolved > 0 && (
        <Block index={next()} label="Where claims come from" id="geo">
          <div className="surface-ink border-2 border-(--line-strong) p-4 sm:p-6">
            <ClaimMap points={Object.values(placement.points)} total={placement.total} />
          </div>
          <p className={`border-l-2 border-(--line-strong) pl-4 ${NOTE}`}>
            {placement.resolved} of {placement.total} owners resolved: coordinates come from the
            country captured at claim time and the public location field on GitHub profiles,
            recounted against the live registry on every rebuild (scripts/geocode-owners.mjs
            enriches the map for claims older than the country field). Blank or unplaceable
            locations count toward nothing, and everything here is approximate.
          </p>
        </Block>
      )}

      {usage.length > 0 && (
        <Block index={next()} label="What people do with them" id="usage">
          <Ledger
            head={['Use', 'Names']}
            rows={usage.sort((a, b) => b[1] - a[1]).map(([mode, count]) => [mode, USAGE_LABELS[mode], count])}
          />
        </Block>
      )}

      {stats.hosts.length > 0 && (
        <Block index={next()} label="Where the sites are hosted" id="hosts">
          <Ledger head={['Host', 'Names']} rows={stats.hosts.map((host) => [host.provider, host.provider, host.count])} />
          <p className={`border-l-2 border-(--line-strong) pl-4 ${NOTE}`}>
            Counted from CNAME targets. Anything self-hosted or unrecognised is
            &ldquo;Other&rdquo;. The hostname stays out of it.
          </p>
        </Block>
      )}

      {stats.recent.length > 0 && (
        <Block index={next()} label="Recently claimed" id="recent">
          <div className={`border-2 border-(--line-strong) ${MONO} text-[13px]`}>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[1fr_200px_110px] gap-4 border-b-2 border-(--line-strong) px-4 py-2 text-[12px] tracking-[0.08em] text-(--color-muted) uppercase sm:grid"
            >
              <span>Name</span>
              <span>Owner</span>
              <span className="text-right">Claimed</span>
            </div>
            <ul>
              {stats.recent.map((claim) => (
                <li
                  key={claim.name}
                  className="grid gap-1 border-b border-(--line) px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_200px_110px] sm:gap-4"
                >
                  <a className="break-all text-(--color-ink) underline" href={`https://${claim.name}.runs-at.dev`}>
                    {claim.name}.runs-at.dev
                  </a>
                  <span className="break-all text-(--color-muted)">@{claim.github}</span>
                  <span className="text-(--color-muted) sm:text-right">{day(claim.claimedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Block>
      )}
    </main>
  );
}
