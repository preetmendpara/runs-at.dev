import { Section, Quote } from '../../../components/Section.jsx';
import { C, Code, DocList, DocTitle, Eyebrow, Lede, Record, Warning } from '../../components.jsx';
import { SITE_OG_IMAGE } from '../../../../lib/og.js';

export const metadata = {
  title: 'Free subdomain for Netlify',
  description:
    'Connect yourname.runs-at.dev to a Netlify site: add the domain in Netlify, configure the DNS record, and verify that the custom domain is working.',
  alternates: { canonical: 'https://runs-at.dev/docs/guides/netlify' },
  openGraph: { title: 'Free subdomain for Netlify · runs-at.dev', images: SITE_OG_IMAGE },
};

const P = 'text-sm leading-relaxed sm:text-base';
const LINK = 'text-(--color-ink) underline';

export default function NetlifyGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Guides / Netlify</Eyebrow>
      <DocTitle>Use a free runs-at.dev subdomain with Netlify</DocTitle>
      <Lede>
        Your Netlify site keeps building and deploying the way it does today. This guide gives it a
        short runs-at.dev address to share instead of the netlify.app one.
      </Lede>

      <Section title="What you'll end up with">
        <p className={P}>
          Picture a documentation site deployed on Netlify as <C>docs-example.netlify.app</C>. Once
          you are done, <C>https://docs-example.runs-at.dev</C> opens that same site, with a
          certificate that Netlify manages for the new name.
        </p>
        <p className={P}>Two separate systems cooperate to make that happen:</p>
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Netlify</strong> hosts the site. It
            has to be told the full hostname it should answer for, and it handles the certificate.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev</strong> controls the DNS
            for your name. You save one record in the registry and it is published for you; you do
            not use Netlify DNS or any other DNS provider for this.
          </li>
        </ul>
        <p className={P}>
          A free subdomain for Netlify needs both halves. DNS alone sends visitors to Netlify, but
          Netlify only serves your site once it knows the name belongs to it.
        </p>
      </Section>

      <Section title="Before you start">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>A Netlify site that already works at its netlify.app address.</li>
          <li>
            A claimed runs-at.dev name. See the{' '}
            <a className={LINK} href="/docs/quickstart">quickstart</a> if you have not claimed one.
            One name comes free with each GitHub account, and the administrator can grant more if you
            run several sites.
          </li>
          <li>Access to the site&apos;s domain settings in Netlify.</li>
        </ul>
      </Section>

      <Section title="Add the domain in Netlify">
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>In Netlify, open the site and go to its domain management settings.</li>
          <li>
            Add a domain and enter the full hostname, <C>docs-example.runs-at.dev</C>. Netlify
            treats it as a domain whose DNS is hosted elsewhere, which is correct: the registry runs
            it.
          </li>
          <li>
            Note the DNS setting Netlify shows for that hostname. For a subdomain it asks for a CNAME
            pointing at your site, and the value it gives is the one to use in the next step.
          </li>
        </ol>
        <Quote>
          Netlify will not create or change runs-at.dev records for you, and it does not need to.
          Whatever Netlify asks you to publish, you publish through runs-at.dev.
        </Quote>
      </Section>

      <Section title="Add the DNS record">
        <p className={P}>
          Put the target Netlify showed you in the <C>CNAME</C> of your record. For a subdomain this
          is normally your site&apos;s own netlify.app address, which is unique to your site, so copy
          it from your Netlify settings rather than guessing it. Enter the hostname only, with no{' '}
          <C>https://</C> and no trailing dot.
        </p>
        <Record path="domains/docs-example.json">{`"records": { "CNAME": "docs-example.netlify.app" }`}</Record>
        <p className={P}>Save it one of two ways:</p>
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Dashboard.</strong> At{' '}
            <a className={LINK} href="/manage">runs-at.dev/manage</a>, choose the name, open{' '}
            <C>Point to my hosting</C>, pick <C>Netlify</C>, paste the target and save. The field
            starts empty on purpose.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">Pull request.</strong> Fork{' '}
            <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev">the registry</a>,
            update the <C>records</C> block in <C>domains/docs-example.json</C>, and open a pull
            request; it is published once merged.
          </li>
        </ol>
        <p className={P}>
          The registry publishes this record as plain DNS rather than through a proxy, so Netlify
          sees requests for your hostname directly and can issue its certificate. A CNAME must be
          the only record on your name; the{' '}
          <a className={LINK} href="/docs/records">record reference</a> covers what can share it.
        </p>
      </Section>

      <Section title="Check the domain configuration">
        <p className={P}>
          Go back to the domain settings in Netlify. Once the record is live, Netlify can confirm
          that <C>docs-example.runs-at.dev</C> points at the site, and its HTTPS section reports the
          certificate for the name. Until both are complete, the custom domain is not fully set up,
          even if DNS already resolves.
        </p>
        <p className={P}>
          If Netlify shows an additional DNS step for this hostname, do what it shows. Any record it
          asks for is added through runs-at.dev as well.
        </p>
      </Section>

      <Section title="Check that it works">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Netlify domain settings</strong> list
            the name without outstanding DNS work, and HTTPS shows a certificate for it.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/manage</strong> shows{' '}
            <C>Live</C> in the status panel, followed by your page&apos;s title, once visitors reach
            the site.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/debug/docs-example</strong>{' '}
            (with your own name) shows the record, what DNS answers, what the name serves, and which
            step is missing if it is stuck.
          </li>
          <li>From a terminal, the CNAME should name your Netlify site:</li>
        </ul>
        <Code>{`dig +short docs-example.runs-at.dev CNAME
# docs-example.netlify.app.`}</Code>
      </Section>

      <Section title="Common problems">
        <dl className={`space-y-6 ${P}`}>
          <div>
            <dt className="text-(--color-ink)">Netlify does not accept the domain</dt>
            <dd className="mt-1 text-(--color-ash)">
              Make sure you entered the whole hostname, <C>docs-example.runs-at.dev</C>, and not{' '}
              <C>runs-at.dev</C> alone. A hostname can only belong to one Netlify site at a time, so
              if it is attached to another of your sites, remove it there first.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">Netlify says the DNS is not configured correctly</dt>
            <dd className="mt-1 text-(--color-ash)">
              Compare the CNAME in your record with the target in Netlify&apos;s settings. The
              dashboard refuses a target with <C>https://</C> or anything after the hostname, so
              enter the bare address. If the record was saved moments ago, it may not be published
              yet; the status panel shows when it is still waiting.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The dashboard says records conflict</dt>
            <dd className="mt-1 text-(--color-ash)">
              A CNAME cannot sit beside A, AAAA, TXT or MX records, or a redirect, on the same name.
              Remove the others, then save the CNAME on its own.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">
              The status panel says <C>Not working yet</C>
            </dt>
            <dd className="mt-1 text-(--color-ash)">
              Visitors still get the runs-at.dev profile card. When the record points at a
              netlify.app address, that almost always means Netlify has not been told about the
              hostname: add it under the site&apos;s domain settings. The debug page gives the same
              diagnosis.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">Added in Netlify, but nothing responds</dt>
            <dd className="mt-1 text-(--color-ash)">
              The status panel reports <C>Not answering</C> when the target does not respond. Open
              the netlify.app address directly; if that fails as well, look at the site&apos;s latest
              deploy in Netlify.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The name opens something unexpected</dt>
            <dd className="mt-1 text-(--color-ash)">
              The profile card means the steps above are unfinished. A different Netlify site means
              the CNAME names that site&apos;s netlify.app address, or the hostname was added to the
              wrong site in Netlify.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">HTTPS has not completed</dt>
            <dd className="mt-1 text-(--color-ash)">
              Netlify issues the certificate itself and can only do so once the hostname reaches it.
              Confirm DNS is correct first, then check the HTTPS section of the site&apos;s domain
              settings for its current state.
            </dd>
          </div>
        </dl>
        <Warning>
          If you later move the site, update this record and remove the hostname from the old
          Netlify site, or both places will still claim the name.
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
            { href: '/docs/guides/cloudflare-pages', label: 'Cloudflare Pages' },
          ]}
        />
      </Section>
    </main>
  );
}
