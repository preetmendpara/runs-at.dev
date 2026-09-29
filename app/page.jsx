import { cookies } from 'next/headers';
import ClaimForm from './claim-form.jsx';
import OwnedName from './owned-name.jsx';
import JsonLd from './components/JsonLd.jsx';
import HomeMap from './components/home-map.jsx';
import AdBanner from './components/ad-banner.jsx';
import { CLAIM_GEO } from './components/claim-geo.js';
import { geoPlacement } from '../lib/geo-placement.js';
import { readRegistry } from '../lib/registry-files.js';
import countryCentroids from '../scripts/country-centroids.json';
import { readSession, SESSION_COOKIE } from '../lib/session.js';
import { getOwnerIndex } from '../lib/owners.js';
import { getEntitlement, heldNames, totalAllowed } from '../lib/entitlements.js';
import { getRecord } from '../lib/registry.js';
import { REPO_URL } from '../lib/repo.js';

const DESCRIPTION =
  'Claim a free yourname.runs-at.dev with your GitHub account. One domain is included, additional domains can be granted, and you can manage DNS for GitHub Pages, Vercel, Netlify and Cloudflare Pages.';

export const metadata = {
  // absolute: the homepage names the site itself, so no template suffix.
  title: { absolute: 'Free developer subdomains · runs-at.dev' },
  description: DESCRIPTION,
  alternates: { canonical: 'https://runs-at.dev' },
  openGraph: { title: 'Free developer subdomains · runs-at.dev', description: DESCRIPTION },
  twitter: { title: 'Free developer subdomains · runs-at.dev', description: DESCRIPTION },
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://runs-at.dev/#website',
      url: 'https://runs-at.dev',
      name: 'runs-at.dev',
      description: 'Free developer subdomains: claim yourname.runs-at.dev with a GitHub account.',
      publisher: { '@id': 'https://runs-at.dev/#operator' },
    },
    {
      '@type': 'Person',
      '@id': 'https://runs-at.dev/#operator',
      name: 'preetmendpara',
      description: 'Operates the runs-at.dev free subdomain registry.',
      url: 'https://github.com/preetmendpara',
      sameAs: ['https://github.com/preetmendpara/runs-at.dev', 'https://github.com/preetmendpara'],
      contactPoint: [
        {
          '@type': 'ContactPoint',
          email: 'abuse@runs-at.dev',
          contactType: 'abuse reports and support',
          url: 'https://runs-at.dev/contact',
        },
      ],
    },
  ],
};

const LINKS = [
  { href: '/docs/quickstart', label: 'Quickstart', note: 'from sign-in to a working name' },
  { href: '/docs/guides', label: 'Hosting guides', note: 'every provider walkthrough in one place' },
  { href: '/docs/seo', label: 'SEO', note: 'how search engines treat a subdomain' },
  { href: '/faq', label: 'FAQ', note: 'cost, ownership, limits and reclaiming' },
  { href: '/openapi.json', label: 'API', note: 'OpenAPI description for scripts and agents' },
  { href: 'https://github.com/preetmendpara/runs-at.dev', label: 'GitHub', note: 'source code and the registry files', external: true },
];

// Shared text styles for the homepage blocks.
const MONO = 'font-(family-name:--font-mono)';
const LABEL = `${MONO} text-[12px] tracking-[0.08em] uppercase text-(--color-muted)`;
const BODY = 'text-[16px] leading-[1.55] text-(--color-ash)';
const LINK = 'text-(--color-ink) underline';
const CODE = `${MONO} text-[15px] text-(--color-ink)`;

const PROVIDERS = [
  { href: '/docs/guides/github-pages', label: 'GitHub Pages', record: 'CNAME' },
  { href: '/docs/guides/vercel', label: 'Vercel', record: 'CNAME' },
  { href: '/docs/guides/netlify', label: 'Netlify', record: 'CNAME' },
  { href: '/docs/guides/cloudflare-pages', label: 'Cloudflare Pages', record: 'CNAME' },
];

const STEPS = [
  { key: 'Sign in', body: 'Sign in with GitHub. Your GitHub login becomes the owner of every name you claim.' },
  { key: 'Choose', body: 'Type the name you want in the box above; it tells you whether it is still free.' },
  {
    key: 'Claim',
    body: (
      <>
        Claim it. runs-at.dev writes <span className={CODE}>domains/yourname.json</span> into the public
        registry, and the name resolves from then on.
      </>
    ),
  },
  { key: 'Point DNS', body: 'Point it wherever your project lives, or keep the profile card.' },
];

const SPEC = [
  {
    key: 'included',
    value:
      'one runs-at.dev name for every eligible GitHub account: at least 30 days old, with at least one public repository.',
  },
  { key: 'more', value: 'extra domain slots, granted by the administrator when a project needs its own name.' },
  {
    key: 'dns',
    value:
      'a profile card built from your GitHub profile, a redirect, a CNAME to your host, or A, AAAA, TXT and MX records you manage yourself.',
  },
  {
    key: 'status',
    value: 'a live check for every name you own, plus a public diagnosis page you can share when something is not resolving.',
  },
];

// A homepage section on the page grid: the index numeral and label set in a
// narrow left column like a manual's margin, the content in the wide one.
function Block({ index, label, id, children, className = '' }) {
  return (
    <section aria-labelledby={id} className={`mx-auto max-w-[1200px] px-4 sm:px-6 ${className}`}>
      <div className="grid gap-6 border-t-2 border-(--line-strong) pt-6 lg:grid-cols-[240px_1fr] lg:gap-12">
        <div className="flex items-baseline gap-3 lg:block">
          <p className="text-[44px] leading-none text-(--color-accent) lg:text-[64px]" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">
            {index}
          </p>
          <h2 id={id} className={`${MONO} text-[12px] tracking-[0.12em] text-(--color-ink) uppercase lg:mt-3`}>
            {label}
          </h2>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

// Record type column for the registry readout: what the name points at,
// straight from its file. An empty records object serves the profile card.
function recordKind(record) {
  const keys = Object.keys(record.records || {});
  return keys.length ? keys.join(' + ') : 'CARD';
}

// Only for a signed-in visitor: this page is the highest-traffic route on the
// site and these reads come out of REGISTRY_TOKEN's quota, the same one
// claiming depends on. It already renders dynamically because it reads
// cookies, so nothing is being given up on caching. Fails soft -- a lookup
// that cannot run falls back to the claim form, which is what every visitor
// saw before.
async function ownedName(session) {
  if (!session?.login) return null;
  const token = process.env.REGISTRY_TOKEN;
  const [index, entitlement] = await Promise.all([
    getOwnerIndex(session.login, { token }).catch(() => null),
    getEntitlement(session.login, { token }).catch(() => null),
  ]);
  const name = index?.names?.[0];
  if (!name) return null;
  // An owner with a free slot (granted by the maintainer) gets the claim form,
  // so they can claim another name; the form fails soft to the truth anyway.
  if (entitlement && heldNames(entitlement, index.names).length < totalAllowed(entitlement)) return null;
  const record = await getRecord(name, { token }).catch(() => null);
  // An index entry whose record cannot be read (a stale index after a swap,
  // or a transient read failure) must not render as "your name is a bare
  // card": fall back to the claim form, which answers with the truth.
  if (!record) return null;
  return { name, record };
}

// Map placement recounted against the live registry. The page renders
// dynamically (session state is in the flow), but these numbers only change
// when the registry does, i.e. on deploy, so the disk read is memoised per
// lambda instance rather than paid per request.
let registryMemo = null;
function registry() {
  if (!registryMemo) registryMemo = readRegistry();
  return registryMemo;
}

export default async function Home() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = raw ? readSession(raw, process.env.SESSION_SECRET) : null;
  const owned = await ownedName(session);
  const registryList = registry();
  const placement = geoPlacement(registryList, CLAIM_GEO, countryCentroids);
  const recent = [...registryList]
    .sort((a, b) => String(b.claimedAt).localeCompare(String(a.claimedAt)))
    .slice(0, 8);

  const readout = [
    ['Names', `${registryList.length} claimed`],
    ['On map', `${placement.resolved} placed`],
    ['Included', '1 per GitHub account'],
    ['Sign-in', 'GitHub'],
    ['Registry', 'public'],
    ['License', 'AGPL-3.0'],
  ];

  return (
    <main>
      <JsonLd data={websiteJsonLd} />

      {/* ── Masthead: the headline as a printed poster, an index card of
          registry facts pinned beside it, and the lede set wide below. */}
      <section className="mx-auto max-w-[1200px] px-4 pt-8 sm:px-6 sm:pt-12">
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b-2 border-(--line-strong) pb-2 ${LABEL}`}>
          <span className="text-(--color-ink)">runs-at.dev // free subdomain registry</span>
          <span className="inline-flex items-center gap-2 text-(--color-ink)">
            <span aria-hidden="true" className="pulse-dot inline-block h-2 w-2 bg-(--color-pulse)" />
            System online
          </span>
        </div>

        <div className="mt-10 grid gap-10 lg:mt-16 lg:grid-cols-[1fr_320px] lg:gap-14">
          <div className="min-w-0">
            <h1 className="text-[clamp(2.6rem,12.5vw,7rem)] leading-[0.86] font-normal tracking-[-0.02em] text-(--color-ink) uppercase lg:text-[clamp(3.2rem,8vw,7rem)]">
              <span className="block">Free</span>{' '}
              <span className="block">developer</span>{' '}
              <span className="block text-(--color-accent)">subdomains</span>{' '}
              <span className={`mt-6 block text-[14px] leading-none tracking-[0.12em] text-(--color-muted) normal-case ${MONO}`}>
                at runs-at.dev
              </span>
            </h1>
          </div>

          {/* Index card: ruled rows with dotted leaders, card stock on paper. */}
          <dl className={`hard-shadow self-end border-2 border-(--line-strong) bg-(--color-card) ${MONO} text-[13px]`}>
            <div className="flex items-center justify-between border-b-2 border-(--line-strong) bg-(--color-ink) px-4 py-2 text-[11px] tracking-[0.12em] text-(--color-paper) uppercase">
              <span>Status readout</span>
              <span aria-hidden="true">№ 01</span>
            </div>
            {readout.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2 border-b border-(--line) px-4 py-2.5 last:border-b-0">
                <dt className="tracking-[0.08em] text-(--color-muted) uppercase">{key}</dt>
                <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-(--color-muted)" />
                <dd className="text-right text-(--color-ink)">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-10 grid gap-6 border-t border-(--line) pt-6 lg:mt-14 lg:grid-cols-[240px_1fr] lg:gap-12">
          <p className={`${LABEL}`}>Abstract</p>
          <p className="max-w-[720px] text-[20px] leading-[1.45] text-(--color-ash) sm:text-[24px] sm:leading-[1.35]">
            A name of your own, under a domain someone else runs. Claim{' '}
            <span className={CODE}>yourname.runs-at.dev</span> with your GitHub account and point it at
            GitHub Pages, Vercel, Netlify, Cloudflare Pages or DNS records of your choosing.
          </p>
        </div>
      </section>

      {/* ── Claim terminal: a full-width ink plate. The claim form itself is
          unchanged; the plate re-points the colour tokens around it. */}
      <section id="claim" aria-label="Claim a name" className="surface-ink mt-16 scroll-mt-20 sm:mt-24">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[240px_1fr] lg:gap-12">
          <div className={`${MONO} text-[12px] tracking-[0.12em] uppercase`}>
            <p className="text-(--color-accent-ink)">Form 00</p>
            <p className="mt-2 text-(--color-ink)">{owned ? 'Your name' : 'Enter your name'}</p>
            <p className="mt-2 text-(--color-muted)">claim // domains/*.json</p>
          </div>
          <div className="flex justify-center border-2 border-(--line-strong) bg-(--color-card) px-4 py-10 sm:px-8 sm:py-14">
            {owned ? (
              <OwnedName name={owned.name} record={owned.record} />
            ) : (
              <ClaimForm signedIn={Boolean(session)} />
            )}
          </div>
        </div>
      </section>

      <Block index="01" label="Registry" id="registry" className="mt-20 sm:mt-28">
        <div className="grid gap-8 xl:grid-cols-[1fr_1.35fr] xl:gap-12">
          <p className={BODY}>
            Each name is a small JSON file in a public repository, and that file is the only thing
            deciding where the name goes. Anyone can read who owns a name and what it points at, and
            every change is a commit you can look back through. The claim map and the{' '}
            <a className={LINK} href="/stats">stats page</a> are drawn from those same files.
          </p>

          <div className={`border-2 border-(--line-strong) bg-(--color-card) ${MONO} text-[13px]`}>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[1fr_96px_96px] gap-4 border-b-2 border-(--line-strong) px-4 py-2 text-[11px] tracking-[0.12em] text-(--color-muted) uppercase sm:grid"
            >
              <span>Name</span>
              <span>Record</span>
              <span className="text-right">Claimed</span>
            </div>
            <ol aria-label="Most recently claimed names">
              {recent.map((record) => (
                <li
                  key={record.name}
                  className="grid gap-1 border-b border-(--line) px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_96px_96px] sm:gap-4"
                >
                  <span className="break-all text-(--color-ink)">
                    {record.name}
                    <span className="text-(--color-muted)">.runs-at.dev</span>
                  </span>
                  <span className="text-(--color-muted)">
                    <span aria-hidden="true" className="mr-2 inline-block h-1.5 w-1.5 bg-(--color-pulse) align-middle" />
                    {recordKind(record)}
                  </span>
                  <span className="text-(--color-muted) sm:text-right">
                    {String(record.claimedAt || '').slice(0, 10)}
                  </span>
                </li>
              ))}
            </ol>
            <div className={`flex flex-wrap justify-between gap-2 border-t-2 border-(--line-strong) px-4 py-2 ${LABEL}`}>
              <span>
                {recent.length} of {registryList.length} shown
              </span>
              <a className="text-(--color-ink) underline" href={`${REPO_URL}/tree/main/domains`} target="_blank" rel="noopener noreferrer">
                full registry ↗
              </a>
            </div>
          </div>
        </div>
      </Block>

      {/* ── The dot-matrix claim map on a ink plate, where its light dots
          were drawn to sit. */}
      <div className="surface-ink mt-20 pb-6 sm:mt-28">
        <HomeMap heading points={placement.points} resolved={placement.resolved} total={placement.total} />
      </div>

      <Block index="02" label="How claiming works" id="how" className="mt-20 sm:mt-28">
        <ol className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, i) => (
            <li
              key={step.key}
              className="border-b border-(--line) py-6 first:pt-0 sm:[&:nth-child(-n+2)]:pt-0 xl:border-b-0"
            >
              <p className="text-[72px] leading-[0.8] text-(--color-ink)" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </p>
              <p className={`mt-5 ${MONO} text-[12px] tracking-[0.12em] text-(--color-accent-ink) uppercase`}>/ {step.key}</p>
              <p className="mt-3 max-w-[34ch] text-[15px] leading-[1.55] text-(--color-ash)">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className={`mt-6 ${BODY}`}>
          The <a className={LINK} href="/docs/quickstart">quickstart</a> walks through each step,
          including claiming by pull request if you prefer.
        </p>
      </Block>

      {/* ── Specification on a cream band: a big statement against a ruled
          spec sheet, then the two explanatory columns. */}
      <div className="surface-cream mt-20 py-14 sm:mt-28 sm:py-20">
        <Block index="03" label="What you get" id="spec">
          <div className="grid gap-10 xl:grid-cols-[0.9fr_1.1fr] xl:gap-14">
            <p className="text-[30px] leading-[1.05] text-(--color-ink) sm:text-[40px]" style={{ fontFamily: 'var(--font-display)' }}>
              One free domain for your GitHub account, and room to grow.
            </p>
            <dl className={`border-t-2 border-(--line-strong) ${MONO} text-[14px]`}>
              {SPEC.map((row) => (
                <div key={row.key} className="grid gap-1 border-b border-(--line) py-4 sm:grid-cols-[110px_1fr] sm:gap-6">
                  <dt className="text-[11px] tracking-[0.12em] text-(--color-accent-ink) uppercase">{row.key}</dt>
                  <dd className="leading-[1.55] text-(--color-ink)">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            <div>
              <h3 className={`${MONO} text-[12px] tracking-[0.12em] text-(--color-ink) uppercase`}>What is a free subdomain?</h3>
              <p className={`mt-3 ${BODY}`}>
                <span className={CODE}>yourname.runs-at.dev</span> is a hostname one level below runs-at.dev,
                which the operator registered and keeps paying for. You pick the first part, and it works
                like any address: point it at a site, a redirect or DNS records of your choosing. What you
                do not get is a domain of your own. There is nothing to buy or renew, and nothing to move
                to a registrar later.
              </p>
            </div>
            <div>
              <h3 className={`${MONO} text-[12px] tracking-[0.12em] text-(--color-ink) uppercase`}>When to use one</h3>
              <p className={`mt-3 ${BODY}`}>
                That trade-off suits portfolios, demos, docs and side projects that deserve a clean address
                today. When a project needs a name you own outright, register a domain for it; see{' '}
                <a className={LINK} href="/docs/free-subdomain-vs-domain">Free subdomain vs free domain</a>{' '}
                for what that difference means in practice.
              </p>
            </div>
          </div>
        </Block>
      </div>

      <Block index="04" label="Point it at your hosting" id="hosting" className="mt-20 sm:mt-28">
        <p className={`max-w-[640px] ${BODY}`}>
          Each guide covers the setting on your host, the record to add on runs-at.dev, and how to tell
          when it is working.
        </p>
        <div className={`mt-8 border-2 border-(--line-strong) bg-(--color-card) ${MONO} text-[13px]`}>
          <div
            aria-hidden="true"
            className="grid grid-cols-[1fr_auto] gap-4 border-b-2 border-(--line-strong) bg-(--color-ink) px-4 py-2 text-[11px] tracking-[0.12em] text-(--color-paper) uppercase sm:grid-cols-[1fr_100px_120px]"
          >
            <span>Platform</span>
            <span className="hidden sm:block">Record</span>
            <span className="text-right">Guide</span>
          </div>
          <ul>
            {PROVIDERS.map((p) => (
              <li key={p.href} className="border-b border-(--line) last:border-b-0">
                <a
                  href={p.href}
                  className="group grid grid-cols-[1fr_auto] gap-4 px-4 py-3.5 no-underline hover:bg-(--color-accent) sm:grid-cols-[1fr_100px_120px]"
                >
                  <span className="tracking-[0.04em] text-(--color-ink) uppercase group-hover:text-white">
                    Free subdomain for {p.label}
                  </span>
                  <span className="hidden text-(--color-muted) group-hover:text-white sm:block">{p.record}</span>
                  <span className="text-right text-(--color-ink) group-hover:text-white">Read →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p className={`mt-6 ${BODY}`}>
          Other hosts and record types: the{' '}
          <a className={LINK} href="/docs/records">DNS record reference</a> lists every record type and
          what can share a name, and <a className={LINK} href="/docs/guides">hosting guides</a> has every
          provider walkthrough.
        </p>
      </Block>

      {/* ── Two sheets side by side: managing names, and the source. */}
      <section className="mx-auto mt-20 max-w-[1200px] px-4 sm:mt-28 sm:px-6">
        <div className="grid gap-px border-2 border-(--line-strong) bg-(--line-strong) lg:grid-cols-2">
          <div className="bg-(--color-paper) p-6 sm:p-10">
            <p className="text-[44px] leading-none text-(--color-accent)" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">05</p>
            <h2 id="manage" className={`mt-3 ${MONO} text-[12px] tracking-[0.12em] text-(--color-ink) uppercase`}>Manage multiple domains</h2>
            <p className="mt-6 text-[24px] leading-[1.15] text-(--color-ink)">Every name you own, behind one sign-in.</p>
            <p className={`mt-5 ${BODY}`}>
              <a className={LINK} href="/manage">runs-at.dev/manage</a> lists all the names your GitHub account
              owns and shows how many slots you have used. Pick a name to edit its records, swap it for
              another or release it; the others stay as they are. When a slot is free, you can claim another
              name from the same place.
            </p>
          </div>
          <div className="surface-ink p-6 sm:p-10">
            <p className="text-[44px] leading-none text-(--color-accent)" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">06</p>
            <h2 id="source" className={`mt-3 ${MONO} text-[12px] tracking-[0.12em] text-(--color-ink) uppercase`}>Open source</h2>
            <p className={`mt-6 ${MONO} text-[13px] break-all text-(--color-muted)`}>github.com/preetmendpara/runs-at.dev</p>
            <dl className={`mt-4 border-t border-(--line) ${MONO} text-[13px]`}>
              {[
                ['License', 'AGPL-3.0'],
                ['Covers', 'the registry, its validation rules and this site'],
                ['Terms', 'free, on a best-effort basis'],
              ].map(([key, value]) => (
                <div key={key} className="grid gap-1 border-b border-(--line) py-3 sm:grid-cols-[100px_1fr] sm:gap-4">
                  <dt className="text-[11px] tracking-[0.12em] text-(--color-muted) uppercase">{key}</dt>
                  <dd className="text-(--color-ink)">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a
                className="btn-pill"
                href="https://github.com/preetmendpara/runs-at.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub <span aria-hidden="true">↗</span>
              </a>
              <a className={`${LINK} ${MONO} text-[13px]`} href="/policy">
                Read the policy
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* The one ad slot on the page, on its own cream band: below the
          explanatory content, far from the claim form, before the index. */}
      <div className="surface-cream mt-20 py-12 sm:mt-28">
        <AdBanner />
      </div>

      <Block index="07" label="Where to go next" id="next" className="mt-20 sm:mt-28">
        <ul className={`border-t-2 border-(--line-strong) ${MONO}`}>
          {LINKS.map((link) => (
            <li key={link.href} className="border-b border-(--line)">
              <a
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group grid gap-1 py-4 no-underline transition-transform duration-75 hover:translate-x-1 sm:grid-cols-[220px_1fr_auto] sm:items-baseline sm:gap-6"
              >
                <span className="text-[18px] tracking-[0.02em] text-(--color-ink) uppercase group-hover:text-(--color-accent-ink)">{link.label}</span>
                <span className="text-[13px] text-(--color-muted)">{link.note}</span>
                <span aria-hidden="true" className="hidden text-(--color-accent-ink) sm:block">
                  {link.external ? '↗' : '→'}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Block>

      <Block index="08" label="Report abuse" id="abuse" className="mt-20 sm:mt-28">
        <p className="border-l-[6px] border-(--color-flag) bg-(--color-card) p-5 text-[16px] leading-[1.55] text-(--color-ash) sm:p-6">
          Seen a runs-at.dev name used for phishing, malware or impersonation? Send the name and what you
          saw to abuse@runs-at.dev. Names used that way are taken back.
        </p>
      </Block>
    </main>
  );
}
