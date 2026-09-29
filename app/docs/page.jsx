import { SITE_OG_IMAGE } from '../../lib/og.js';

export const metadata = {
  title: 'Docs',
  description: 'Documentation for runs-at.dev: quickstart, the full record reference, provider guides, and where to find the source.',
  alternates: { canonical: 'https://runs-at.dev/docs' },
  openGraph: { title: 'Docs · runs-at.dev', images: SITE_OG_IMAGE },
};

const START = [
  { href: '/docs/quickstart', label: 'Quickstart', note: 'claim a name and get it working, end to end' },
  { href: '/docs/records', label: 'Record reference', note: 'every field, every record type, the rules' },
  { href: '/docs/guides', label: 'Guides', note: 'copy-paste walkthroughs for hosts, email, and verification' },
  { href: '/docs/seo', label: 'SEO', note: 'how search engines treat a name, and what is per host' },
  { href: '/docs/free-subdomain-vs-domain', label: 'Free subdomain vs free domain', note: 'Understand ownership, DNS, SEO, email, and when a registrable domain may make more sense.' },
  { href: '/docs/resources', label: 'Resources', note: 'the repo, the schema, abuse reporting, the policy' },
];

const GUIDES = [
  { href: '/docs/guides/url-redirect', label: 'URL redirect', note: 'no hosting needed' },
  { href: '/docs/guides/vercel', label: 'Vercel' },
  { href: '/docs/guides/netlify', label: 'Netlify' },
  { href: '/docs/guides/github-pages', label: 'GitHub Pages' },
  { href: '/docs/guides/cloudflare-pages', label: 'Cloudflare Pages' },
  { href: '/docs/guides/render', label: 'Render' },
  { href: '/docs/guides/railway', label: 'Railway' },
  { href: '/docs/guides/firebase', label: 'Firebase Hosting' },
  { href: '/docs/guides/replit', label: 'Replit' },
  { href: '/docs/guides/codeberg-pages', label: 'Codeberg Pages' },
  { href: '/docs/guides/email-forwarding', label: 'Email forwarding', note: 'MX, with ImprovMX' },
  { href: '/docs/guides/bluesky-handle', label: 'Bluesky handle', note: '_atproto TXT' },
  { href: '/docs/guides/discord-verification', label: 'Discord verification', note: '_discord TXT' },
];

const MONO = 'font-(family-name:--font-mono)';
const LABEL = `${MONO} text-[12px] tracking-[0.08em] uppercase text-(--color-muted)`;
const num = (i) => String(i + 1).padStart(2, '0');

// A numbered block, the pattern shared with / and /stats.
function Block({ index, label, id, children }) {
  return (
    <section aria-labelledby={id} className="mt-16 border-t-2 border-(--line-strong) pt-6 sm:mt-20">
      <div className="grid gap-6 lg:max-[1679px]:grid-cols-[180px_1fr] lg:max-[1679px]:gap-10">
        <h2 id={id} className={`${MONO} text-[13px] tracking-[0.08em] text-(--color-ink) uppercase`}>
          <span className="text-(--color-muted)">{index} //</span> {label}
        </h2>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

// One index row: number, title and note, arrow. Stacks the note under the
// title on phones.
function Row({ index, href, label, note }) {
  return (
    <li className="border-b border-(--line) last:border-b-0">
      <a
        href={href}
        className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 px-4 py-4 no-underline hover:bg-(--color-accent) sm:grid-cols-[3rem_minmax(0,16rem)_1fr_auto] sm:gap-x-5"
      >
        <span className={`${MONO} text-[12px] text-(--color-muted) group-hover:text-white`}>{index}</span>
        <span className="text-[16px] text-(--color-ink) group-hover:text-white">{label}</span>
        {note ? (
          <span className="col-start-2 col-end-4 mt-1 text-[14px] leading-[1.45] text-(--color-muted) group-hover:text-white sm:col-start-auto sm:col-end-auto sm:mt-0">
            {note}
          </span>
        ) : (
          <span aria-hidden="true" className="hidden sm:block" />
        )}
        <span
          aria-hidden="true"
          className={`${MONO} col-start-3 row-start-1 text-(--color-muted) group-hover:text-white sm:col-start-4`}
        >
          →
        </span>
      </a>
    </li>
  );
}

export default function Docs() {
  const [primary, ...rest] = START;

  return (
    // Wider than the old docs column below 1680px; at 1680px and up it
    // returns to the 768px column the desktop side-rail ads are placed
    // around (see lib/side-rail-routes.js).
    <main className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16 min-[1680px]:max-w-3xl">
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-(--line) pb-3 ${LABEL}`}>
        <span>runs-at.dev // documentation</span>
        <span className="meta">Docs</span>
      </div>

      <div className="mt-10 grid gap-8 lg:mt-14 lg:max-[1679px]:grid-cols-[1fr_300px] lg:max-[1679px]:items-end lg:max-[1679px]:gap-12">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.8rem,9.3vw,5rem)] leading-[0.92] font-normal tracking-[-0.01em] text-(--color-ink) uppercase lg:text-[clamp(3rem,6.5vw,5rem)]">
            Documentation
          </h1>
          <p className="mt-6 max-w-[600px] text-[17px] leading-[1.5] text-(--color-ash)">
            A claimed name serves a profile card until you point it somewhere else. Pointing it
            anywhere, including nowhere, is one JSON file, changed from the site or by pull request.
          </p>
        </div>

        <dl className={`border-2 border-(--line-strong) ${MONO} text-[13px]`}>
          <div className="border-b-2 border-(--line-strong) bg-(--color-ink) px-4 py-2 text-[12px] tracking-[0.08em] text-(--color-paper) uppercase">
            Index
          </div>
          {[
            ['Start here', `${START.length} pages`],
            ['Guides', `${GUIDES.length} walkthroughs`],
            ['Record', 'domains/<name>.json'],
          ].map(([key, value]) => (
            <div key={key} className="flex justify-between gap-4 border-b border-(--line) px-4 py-2.5 last:border-b-0">
              <dt className="whitespace-nowrap tracking-[0.08em] text-(--color-muted) uppercase">{key}</dt>
              <dd className="text-right break-all text-(--color-ink)">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Block index="01" label="Start here" id="start">
        {/* Quickstart leads the list, as it always has; it gets the heavy
            frame and shadow of a primary entry. */}
        <a
          href={primary.href}
          className="surface-ink hard-shadow group block border-2 border-(--line-strong) p-4 no-underline transition-transform duration-75 hover:-translate-y-0.5 sm:p-7"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="meta whitespace-nowrap">{num(0)} / Docs / Quickstart</span>
            <span aria-hidden="true" className={`${MONO} text-(--color-ink)`}>→</span>
          </span>
          <span className="mt-5 block text-[clamp(2rem,6vw,3.25rem)] leading-none text-(--color-ink) uppercase" style={{ fontFamily: 'var(--font-display)' }}>
            {primary.label}
          </span>
          <span className="mt-4 block text-[16px] leading-[1.5] text-(--color-ash)">{primary.note}</span>
        </a>

        <ol className="mt-8 border-2 border-(--line-strong) bg-(--color-card)">
          {rest.map((item, i) => (
            <Row key={item.href} index={num(i + 1)} {...item} />
          ))}
        </ol>
      </Block>

      <Block index="02" label="Guides" id="guides">
        <ol className="border-2 border-(--line-strong) bg-(--color-card)">
          {GUIDES.map((item, i) => (
            <Row key={item.href} index={num(i)} {...item} />
          ))}
        </ol>
      </Block>
    </main>
  );
}
