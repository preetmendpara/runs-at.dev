import { Section, Quote } from '../../../components/Section.jsx';
import { C, DocList, DocTitle, Eyebrow, Lede, Record, Warning } from '../../components.jsx';
import { SITE_OG_IMAGE } from '../../../../lib/og.js';

export const metadata = {
  title: 'Free subdomain for Vercel',
  description:
    'Connect yourname.runs-at.dev to a Vercel project: configure the domain, add the DNS record, handle verification when required, and confirm the setup works.',
  alternates: { canonical: 'https://runs-at.dev/docs/guides/vercel' },
  openGraph: { title: 'Free subdomain for Vercel · runs-at.dev', images: SITE_OG_IMAGE },
};

const P = 'text-sm leading-relaxed sm:text-base';
const LINK = 'text-(--color-ink) underline';

export default function VercelGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Guides / Vercel</Eyebrow>
      <DocTitle>Use a free runs-at.dev subdomain with Vercel</DocTitle>
      <Lede>
        Keep deploying on Vercel exactly as you do now, and give the project a clean address like
        myproject.runs-at.dev instead of the long one Vercel generates.
      </Lede>

      <Section title="What you'll end up with">
        <p className={P}>
          Say your project is called <C>myproject</C> and you have claimed{' '}
          <C>myproject.runs-at.dev</C>. At the end of this guide, opening{' '}
          <C>https://myproject.runs-at.dev</C> serves your latest production deployment, with a
          certificate Vercel issues for that name. Builds, previews and environment variables stay
          where they are.
        </p>
        <p className={P}>
          It helps to know who controls what, because this setup spans two places:
        </p>
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Your Vercel account</strong> holds the
            project. You tell it which hostnames it should answer for.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev</strong> holds the DNS for
            your name. You set the record there, from the dashboard or by pull request, and the
            registry publishes it. You never need a DNS provider of your own.
          </li>
        </ul>
        <p className={P}>
          A free subdomain for Vercel only works when both sides agree: DNS sends the name to
          Vercel, and your project accepts it.
        </p>
      </Section>

      <Section title="Before you start">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>A Vercel project with at least one successful production deployment.</li>
          <li>
            A claimed runs-at.dev name. The{' '}
            <a className={LINK} href="/docs/quickstart">quickstart</a> walks through claiming one.
            Each GitHub account includes one free name, and the administrator can grant more if you
            want a separate address for another project.
          </li>
          <li>Permission to change domain settings on the Vercel project.</li>
        </ul>
      </Section>

      <Section title="Add your domain in Vercel">
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>Open the project on Vercel and go to Settings → Domains.</li>
          <li>
            Add <C>myproject.runs-at.dev</C>, the full name. Do not add <C>runs-at.dev</C> on its
            own: that domain belongs to the registry, and the steps below only work for your name.
          </li>
          <li>
            Leave the tab open. Vercel now lists the DNS it expects for this name, and possibly a
            verification record as well. You will copy values from it in the next two steps.
          </li>
        </ol>
        <Quote>
          Starting on the Vercel side is deliberate. The CNAME target and any verification token
          are specific to your project, so the only reliable source for them is what Vercel shows
          you after you add the domain.
        </Quote>
      </Section>

      <Section title="Add the DNS record">
        <p className={P}>
          For a subdomain, Vercel asks for a CNAME record. Vercel shows the exact CNAME target for
          your project in the Domains panel. Use that value as the DNS target in runs-at.dev, without
          a trailing dot, since the registry only accepts plain hostnames.
        </p>
        <Record path="domains/myproject.json">{`"records": { "CNAME": "<target shown in your Vercel Domains tab>" }`}</Record>
        <p className={P}>Then save it in one of two ways:</p>
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">From the dashboard.</strong> At{' '}
            <a className={LINK} href="/manage">runs-at.dev/manage</a>, select the name, open{' '}
            <C>Point to my hosting</C> and choose <C>Vercel</C>. Replace whatever the target field
            starts with by the value from your Domains panel, then save.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">By pull request.</strong> Fork{' '}
            <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev">the registry</a>,
            set the <C>records</C> block of <C>domains/myproject.json</C>, and open a pull request.
            It is published to DNS after it is merged.
          </li>
        </ol>
        <Warning>
          Do not use your deployment address, the one ending in <C>.vercel.app</C>, as the target.
          Vercel picks the project to serve from the hostname in each request, and{' '}
          <C>myproject.runs-at.dev</C> only matches your project once it is added under Domains and
          pointed at the target Vercel gives for it.
        </Warning>
      </Section>

      <Section title="Complete verification if Vercel requests it">
        <p className={P}>
          <C>runs-at.dev</C> itself belongs to a different Vercel account from yours, so when you add
          a name under it Vercel may ask you to prove you control that specific name. If it does,
          the Domains tab shows a <C>TXT</C> record whose value begins with{' '}
          <C>vc-domain-verify=myproject.runs-at.dev,</C> followed by a token. If no such record is
          shown, skip this section.
        </p>
        <p className={P}>
          The challenge does not go next to the CNAME. It goes on a label one level below your name,{' '}
          <C>_vercel</C>, which the registry stores under <C>subdomains</C>:
        </p>
        <Record path="domains/myproject.json">{`{
  "records": { "CNAME": "<target shown in your Vercel Domains tab>" },
  "subdomains": {
    "_vercel": {
      "TXT": ["vc-domain-verify=myproject.runs-at.dev,<token from Vercel>"]
    }
  }
}`}</Record>
        <p className={P}>
          On <a className={LINK} href="/manage">the dashboard</a> this is a subdomain row: label{' '}
          <C>_vercel</C>, type <C>TXT</C>, and the whole value pasted as Vercel shows it. The
          registry also copies that value to <C>_vercel.runs-at.dev</C>, the place Vercel reads the
          challenge from for names under this domain. You only ever edit your own entry.
        </p>
        <p className={P}>
          Only a challenge that names your own hostname is published. One that starts with{' '}
          <C>vc-domain-verify=runs-at.dev,</C> means the bare <C>runs-at.dev</C> was added in Vercel
          instead of your name; publishing it would hand the whole domain to one account, so the
          registry refuses it.
        </p>
        <p className={P}>
          Once the record is live, press Refresh next to the domain in Vercel so it checks again.
        </p>
      </Section>

      <Section title="Check that it works">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Vercel Domains tab.</strong> The name
            shows Valid Configuration once Vercel accepts the DNS and has issued the certificate.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/manage.</strong> The status
            panel for the name reads <C>Live</C> with your page title once visitors reach your
            project, and <C>Not working yet</C> while they still see the profile card.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/debug/myproject.</strong>{' '}
            The public diagnosis page shows the record, the live DNS answers and what the name serves,
            and names the specific Vercel step that is missing when the name is stuck.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">The address itself.</strong> Open{' '}
            <C>https://myproject.runs-at.dev</C> and confirm it is your production deployment.
          </li>
        </ul>
      </Section>

      <Section title="Common problems">
        <dl className={`space-y-6 ${P}`}>
          <div>
            <dt className="text-(--color-ink)">Vercel reports an invalid configuration</dt>
            <dd className="mt-1 text-(--color-ash)">
              Compare the CNAME in your record with the target in the Domains tab, character for
              character, and check it has no trailing dot or <C>https://</C>. If the record was just
              saved, it may not be published yet; the status panel on the dashboard says when it is
              still waiting.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">Vercel asks for domain verification</dt>
            <dd className="mt-1 text-(--color-ash)">
              Add the <C>_vercel</C> TXT exactly as described above. The value has to begin with{' '}
              <C>vc-domain-verify=</C> followed by your full name; a challenge for any other hostname
              is never published.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The dashboard rejects the record</dt>
            <dd className="mt-1 text-(--color-ash)">
              A CNAME cannot share your name with other records, so it cannot sit beside an A, AAAA,
              TXT, MX or redirect. Remove those, and put the verification TXT under the{' '}
              <C>_vercel</C> subdomain rather than on the name itself. The{' '}
              <a className={LINK} href="/docs/records">record reference</a> lists what can coexist.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">DNS looks right, but Vercel has not verified it</dt>
            <dd className="mt-1 text-(--color-ash)">
              When the CNAME and the TXT are both published, everything on the runs-at.dev side is
              done. Press Refresh in the Domains tab. If the domain was removed and added again in
              Vercel, it issues a new token and the old TXT no longer matches, so copy the current
              one.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The status panel is not Live</dt>
            <dd className="mt-1 text-(--color-ash)">
              <C>Not working yet</C> means the name still shows the runs-at.dev profile card, so
              Vercel has not taken the name over yet; the debug page tells you which step. Not
              answering means nothing responded at the target, which usually points to a wrong
              target or a project with no production deployment.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The name opens something unexpected</dt>
            <dd className="mt-1 text-(--color-ash)">
              If you see the runs-at.dev profile card, the steps above are not finished. If you see a
              different Vercel project, the name is attached to that project under Domains; remove it
              there and add it to the right one.
            </dd>
          </div>
        </dl>
      </Section>

      <Section title="Related guides">
        <DocList
          items={[
            { href: '/docs/quickstart', label: 'Quickstart', note: 'claim a free subdomain first' },
            { href: '/docs/records', label: 'Record reference', note: 'record types and subdomains' },
            { href: '/docs/seo', label: 'SEO on a runs-at.dev name', note: 'indexing a hosted site' },
            { href: '/docs/guides/github-pages', label: 'GitHub Pages' },
            { href: '/docs/guides/netlify', label: 'Netlify' },
            { href: '/docs/guides/cloudflare-pages', label: 'Cloudflare Pages' },
          ]}
        />
      </Section>
    </main>
  );
}
