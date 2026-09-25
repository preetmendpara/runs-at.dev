import { cookies } from 'next/headers';
import ClaimForm from './claim-form.jsx';
import OwnedName from './owned-name.jsx';
import JsonLd from './components/JsonLd.jsx';
import { Section, Quote } from './components/Section.jsx';
import { Divider, StatusBadge } from './components/ui.jsx';
import { DocList } from './docs/components.jsx';
import HomeMap from './components/home-map.jsx';
import { CLAIM_GEO } from './components/claim-geo.js';
import { geoPlacement } from '../lib/geo-placement.js';
import { readRegistry } from '../lib/registry-files.js';
import countryCentroids from '../scripts/country-centroids.json';
import { readSession, SESSION_COOKIE } from '../lib/session.js';
import { getOwnerIndex } from '../lib/owners.js';
import { getEntitlement, heldNames, totalAllowed } from '../lib/entitlements.js';
import { getRecord } from '../lib/registry.js';

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

// Text styles shared by the explanatory sections, taken from the classes the
// page already used for its one prose block, so nothing new is introduced.
const COLUMN = 'mx-auto max-w-[600px] text-center';
const STATEMENT = 'text-[23px] leading-[1.07] font-normal tracking-[-0.005em] text-(--color-ink)';
const BODY = 'mt-5 text-[16px] leading-[1.5] text-(--color-muted)';
const MONO = 'font-(family-name:--font-mono) text-[15px]';
const LINK = 'text-(--color-ink) underline';
const FACTS = 'mx-auto mt-8 max-w-[440px] space-y-3 text-left font-(family-name:--font-mono) text-[13px]';

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

  return (
    <main>
      <JsonLd data={websiteJsonLd} />

      <h1 className="sr-only">Free developer subdomains at runs-at.dev</h1>

      {/* Hero: the claim line IS the display headline, set at 63px weight 400
          with negative tracking. Centered stack, then the dot-map world below. */}
      <section id="claim" className="mx-auto max-w-[1200px] px-6 pt-20 pb-16 text-center sm:pt-28">
        <StatusBadge tone="live" pulse>Free with GitHub sign-in</StatusBadge>

        <p className="mt-5 font-(family-name:--font-mono) text-xs tracking-[0.04em] text-(--color-muted)">
          {registryList.length} {registryList.length === 1 ? 'name' : 'names'} claimed · {placement.resolved} on the public claim map ·
          1 free domain included per GitHub account · open source
        </p>

        <div className="mt-8 flex justify-center">
          {owned ? (
            <OwnedName name={owned.name} record={owned.record} />
          ) : (
            <ClaimForm signedIn={Boolean(session)} />
          )}
        </div>
      </section>

      {/* Full-bleed dot-matrix world map carrying the claim heat. The base
          world is a static image (keeps ~1600 elements out of the HTML);
          selecting a continent dims it and spotlights that continent
          client-side. The split-flap frame keeps the easter egg alive. */}
      <HomeMap
        heading
        points={placement.points}
        resolved={placement.resolved}
        total={placement.total}
      />

      <div className="mx-auto max-w-[1200px] px-6">
        <Section title="What is a free subdomain?">
          <div className={COLUMN}>
            <p className={STATEMENT}>A name of your own, under a domain someone else runs.</p>
            <p className={BODY}>
              <span className={MONO}>yourname.runs-at.dev</span> is a hostname one level below
              runs-at.dev, which the operator registered and keeps paying for. You pick the first part,
              and it works like any address: point it at a site, a redirect or DNS records of your
              choosing. What you do not get is a domain of your own. There is nothing to buy or renew,
              and nothing to move to a registrar later.
            </p>
            <p className={BODY}>
              That trade-off suits portfolios, demos, docs and side projects that deserve a clean
              address today. When a project needs a name you own outright, register a domain for it;
              see{' '}
              <a className={LINK} href="/docs/free-subdomain-vs-domain">Free subdomain vs free domain</a>{' '}
              for what that difference means in practice.
            </p>
          </div>
        </Section>

        <Section title="What you get">
          <div className={COLUMN}>
            <p className={STATEMENT}>One free domain for your GitHub account, and room to grow.</p>
            <dl className={FACTS}>
              <div className="slit-top slit-dim pt-3">
                <dt className="meta mb-1">included</dt>
                <dd className="text-(--color-ink)">
                  one runs-at.dev name for every eligible GitHub account: at least 30 days old, with at
                  least one public repository.
                </dd>
              </div>
              <div className="slit-top slit-dim pt-3">
                <dt className="meta mb-1">more</dt>
                <dd className="text-(--color-ink)">
                  extra domain slots, granted by the administrator when a project needs its own name.
                </dd>
              </div>
              <div className="slit-top slit-dim pt-3">
                <dt className="meta mb-1">dns</dt>
                <dd className="text-(--color-ink)">
                  a profile card built from your GitHub profile, a redirect, a CNAME to your host, or
                  A, AAAA, TXT and MX records you manage yourself.
                </dd>
              </div>
              <div className="slit-top slit-dim pt-3">
                <dt className="meta mb-1">status</dt>
                <dd className="text-(--color-ink)">
                  a live check for every name you own, plus a public diagnosis page you can share when
                  something is not resolving.
                </dd>
              </div>
            </dl>
          </div>
        </Section>

        <Section title="How claiming works">
          <div className={COLUMN}>
            <ol className={`${BODY} list-decimal space-y-3 pl-6 text-left`}>
              <li>Sign in with GitHub. Your GitHub login becomes the owner of every name you claim.</li>
              <li>Type the name you want in the box above; it tells you whether it is still free.</li>
              <li>
                Claim it. runs-at.dev writes <span className={MONO}>domains/yourname.json</span> into
                the public registry, and the name resolves from then on.
              </li>
              <li>Point it wherever your project lives, or keep the profile card.</li>
            </ol>
            <p className={BODY}>
              The <a className={LINK} href="/docs/quickstart">quickstart</a> walks through each step,
              including claiming by pull request if you prefer.
            </p>
          </div>
        </Section>

        <Section title="Point it at your hosting">
          <div className={COLUMN}>
            <p className={BODY}>
              Each guide covers the setting on your host, the record to add on runs-at.dev, and how to
              tell when it is working.
            </p>
          </div>
          <DocList
            items={[
              { href: '/docs/guides/github-pages', label: 'Free subdomain for GitHub Pages' },
              { href: '/docs/guides/vercel', label: 'Free subdomain for Vercel' },
              { href: '/docs/guides/netlify', label: 'Free subdomain for Netlify' },
              { href: '/docs/guides/cloudflare-pages', label: 'Free subdomain for Cloudflare Pages' },
              { href: '/docs/records', label: 'DNS record reference', note: 'every record type and what can share a name' },
            ]}
          />
        </Section>

        <Section title="Manage multiple domains">
          <div className={COLUMN}>
            <p className={STATEMENT}>Every name you own, behind one sign-in.</p>
            <p className={BODY}>
              <a className={LINK} href="/manage">runs-at.dev/manage</a> lists all the names your GitHub
              account owns and shows how many slots you have used. Pick a name to edit its records,
              swap it for another or release it; the others stay as they are. When a slot is free, you
              can claim another name from the same place.
            </p>
          </div>
        </Section>

        <Section title="Public by design">
          <div className={COLUMN}>
            <p className={BODY}>
              Each name is a small JSON file in a public repository, and that file is the only thing
              deciding where the name goes. Anyone can read who owns a name and what it points at, and
              every change is a commit you can look back through. The claim map and the{' '}
              <a className={LINK} href="/stats">stats page</a> are drawn from those same files.
            </p>
          </div>
        </Section>

        <Section title="Open source">
          <div className={COLUMN}>
            <p className={BODY}>
              The registry, its validation rules and this site are released under AGPL-3.0 on{' '}
              <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              . The service is offered free, on a best-effort basis, under the terms in the{' '}
              <a className={LINK} href="/policy">policy</a>.
            </p>
          </div>
        </Section>

        <Section title="Where to go next">
          {/* Link grid, service-cell style: each cell outlined by its own
              fading slit (open corners), brightening on hover. */}
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 sm:gap-16 lg:grid-cols-3">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="slit-frame group rounded-lg p-6 transition-colors hover:bg-(--color-card)"
              >
                <p className="text-[14px] tracking-[0.01em] text-(--color-ink) uppercase transition-colors group-hover:text-(--color-muted)">
                  {link.label}
                  <span aria-hidden="true" className="ml-2 text-(--color-muted)">↗</span>
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-(--color-muted)">{link.note}</p>
              </a>
            ))}
          </div>
        </Section>

        <Section title="Report abuse">
          <Quote>
            Seen a runs-at.dev name used for phishing, malware or impersonation? Send the name and what
            you saw to abuse@runs-at.dev. Names used that way are taken back.
          </Quote>
        </Section>
      </div>
    </main>
  );
}
