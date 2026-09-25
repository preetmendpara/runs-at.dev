import { Section, Quote } from '../../../components/Section.jsx';
import { C, Code, DocList, DocTitle, Eyebrow, Lede, Record, Warning } from '../../components.jsx';
import { SITE_OG_IMAGE } from '../../../../lib/og.js';

export const metadata = {
  title: 'Free subdomain for Cloudflare Pages',
  description:
    'Connect yourname.runs-at.dev to a Cloudflare Pages project: add the custom domain, configure the DNS record, and verify that the site is responding correctly.',
  alternates: { canonical: 'https://runs-at.dev/docs/guides/cloudflare-pages' },
  openGraph: { title: 'Free subdomain for Cloudflare Pages · runs-at.dev', images: SITE_OG_IMAGE },
};

const P = 'text-sm leading-relaxed sm:text-base';
const LINK = 'text-(--color-ink) underline';

export default function CloudflarePagesGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Guides / Cloudflare Pages</Eyebrow>
      <DocTitle>Use a free runs-at.dev subdomain with Cloudflare Pages</DocTitle>
      <Lede>
        Keep the project deploying on Cloudflare Pages and give it a friendlier address on
        runs-at.dev than the one ending in pages.dev.
      </Lede>

      <Section title="What you'll end up with">
        <p className={P}>
          Take a Pages project published at <C>docs-example.pages.dev</C>. After this guide,{' '}
          <C>https://docs-example.runs-at.dev</C> loads the same deployment, and Cloudflare Pages
          looks after the certificate for the new hostname.
        </p>
        <p className={P}>Responsibility is split in two, and it helps to keep them apart:</p>
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Cloudflare Pages</strong>, in your own
            Cloudflare account, builds and serves the project and decides which custom hostnames it
            answers for.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev</strong> owns the DNS for
            every name under it. You describe the record in the registry and it is published for
            you. runs-at.dev happens to run its own DNS on Cloudflare too, but that is a separate
            account: you never need access to it, and you do not add a zone to yours.
          </li>
        </ul>
        <p className={P}>
          Getting a free subdomain for Cloudflare Pages working means telling Pages about the name
          and pointing the name at Pages. Either one alone is not enough.
        </p>
      </Section>

      <Section title="Before you start">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>A Pages project whose pages.dev address already loads correctly.</li>
          <li>
            A claimed runs-at.dev name; the{' '}
            <a className={LINK} href="/docs/quickstart">quickstart</a> covers claiming. Each GitHub
            account includes one name for free, and the administrator can grant extra slots if you
            need more.
          </li>
          <li>Access to the Pages project in your Cloudflare dashboard.</li>
        </ul>
      </Section>

      <Section title="Add the domain in Cloudflare Pages">
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>Open your Pages project in the Cloudflare dashboard and find its Custom domains tab.</li>
          <li>
            Set up a custom domain and enter the full hostname, <C>docs-example.runs-at.dev</C>.
          </li>
          <li>
            Because the parent domain is not a zone in your account, Cloudflare asks you to create
            the DNS record at the provider that runs it. Read the record it shows; that is what
            you will publish through runs-at.dev next.
          </li>
        </ol>
        <Quote>
          Do this step first. A DNS record pointing at pages.dev does not by itself make Pages serve
          your hostname; Pages has to have the name listed under the project&apos;s custom domains.
        </Quote>
      </Section>

      <Section title="Add the DNS record">
        <p className={P}>
          For a subdomain on another provider, the record is a CNAME to the project&apos;s pages.dev
          address. That address belongs to your project, so use the exact value from your Cloudflare
          dashboard, as a bare hostname with no <C>https://</C> and no trailing dot. If the dashboard
          shows something different for your setup, the dashboard wins.
        </p>
        <Record path="domains/docs-example.json">{`"records": { "CNAME": "docs-example.pages.dev" }`}</Record>
        <p className={P}>Then save the record:</p>
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">On the dashboard:</strong> at{' '}
            <a className={LINK} href="/manage">runs-at.dev/manage</a>, select the name, open{' '}
            <C>Point to my hosting</C>, choose <C>Cloudflare Pages</C>, paste your pages.dev address
            into the empty field and save.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">By pull request:</strong> fork{' '}
            <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev">the registry</a>,
            put the CNAME in <C>domains/docs-example.json</C>, and open a pull request. The record is
            published after it merges.
          </li>
        </ol>
        <p className={P}>
          runs-at.dev publishes the record as DNS only, without its own proxy in the way, so traffic
          for your hostname goes straight to Pages and Pages can issue the certificate for it. A
          CNAME has to be alone on its name; see the{' '}
          <a className={LINK} href="/docs/records">record reference</a> for what can be combined.
        </p>
      </Section>

      <Section title="Check the custom-domain status">
        <p className={P}>
          Return to the project&apos;s Custom domains tab. Cloudflare lists each hostname with its
          status, and the entry for <C>docs-example.runs-at.dev</C> moves on once Cloudflare can see
          the CNAME and has set up the certificate. Until that entry is finished, treat the setup as
          incomplete even if the hostname already resolves.
        </p>
        <p className={P}>
          If Cloudflare asks for any further DNS record for this hostname, create it through
          runs-at.dev in the same way.
        </p>
      </Section>

      <Section title="Check that it works">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Custom domains tab:</strong> the
            hostname shows as active for the project.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/manage:</strong> the status
            panel for the name reads <C>Live</C>, with your page&apos;s title, when visitors reach the
            project.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/debug/docs-example</strong>{' '}
            (your own name in place of the example): the public diagnosis page, listing the record,
            the DNS answers, what the name serves and what is missing.
          </li>
          <li>In a terminal, the CNAME should name the project:</li>
        </ul>
        <Code>{`dig +short docs-example.runs-at.dev CNAME
# docs-example.pages.dev.`}</Code>
      </Section>

      <Section title="Common problems">
        <dl className={`space-y-6 ${P}`}>
          <div>
            <dt className="text-(--color-ink)">Pages will not accept the custom domain</dt>
            <dd className="mt-1 text-(--color-ash)">
              Enter the complete hostname, <C>docs-example.runs-at.dev</C>, never <C>runs-at.dev</C>{' '}
              on its own. Check the name is not already attached to another Pages project.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The DNS record is wrong</dt>
            <dd className="mt-1 text-(--color-ash)">
              The CNAME must match the project&apos;s pages.dev address exactly. The runs-at.dev
              dashboard refuses a target that includes <C>https://</C> or a path, and one that points
              at your own runs-at.dev name.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">Records conflict</dt>
            <dd className="mt-1 text-(--color-ash)">
              A CNAME cannot share your name with A, AAAA, TXT or MX records or with a redirect.
              Remove the others before saving it.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">DNS looks right but Pages does not pick it up</dt>
            <dd className="mt-1 text-(--color-ash)">
              Make sure the hostname is listed under the project&apos;s custom domains, not just
              pointed at pages.dev. For a pages.dev target, the debug page reports exactly this: DNS
              reaches the platform, but nothing there is configured to answer for your name.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">
              The status panel says <C>Not working yet</C>
            </dt>
            <dd className="mt-1 text-(--color-ash)">
              Visitors are still getting the runs-at.dev profile card, so the record has not taken
              effect yet or was not saved. Confirm it on the dashboard; the status panel shows when a
              change is still waiting to be published. <C>Not answering</C> instead means nothing
              responded at the target.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The hostname opens something unexpected</dt>
            <dd className="mt-1 text-(--color-ash)">
              The profile card means the setup is not finished. Another site means the CNAME names a
              different pages.dev address, or the hostname is attached to a different Pages project.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The custom domain or HTTPS is still pending</dt>
            <dd className="mt-1 text-(--color-ash)">
              Pages issues the certificate itself and can only finish once it sees the CNAME. Get DNS
              right first, then follow the status Cloudflare shows on the Custom domains tab.
            </dd>
          </div>
        </dl>
        <Warning>
          When you move the project or delete it, update or remove this record too, and remove the
          hostname from the old Pages project.
        </Warning>
      </Section>

      <Section title="Related guides">
        <DocList
          items={[
            { href: '/docs/quickstart', label: 'Quickstart', note: 'claim a free subdomain first' },
            { href: '/docs/records', label: 'Record reference', note: 'record types and what can coexist' },
            { href: '/docs/seo', label: 'SEO on a runs-at.dev name', note: 'indexing a hosted site' },
            { href: '/docs/guides/github-pages', label: 'GitHub Pages' },
            { href: '/docs/guides/vercel', label: 'Vercel' },
            { href: '/docs/guides/netlify', label: 'Netlify' },
          ]}
        />
      </Section>
    </main>
  );
}
