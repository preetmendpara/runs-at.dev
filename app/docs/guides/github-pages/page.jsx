import { Section, Quote } from '../../../components/Section.jsx';
import { C, Code, DocList, DocTitle, Eyebrow, Lede, Record, Warning } from '../../components.jsx';
import { SITE_OG_IMAGE } from '../../../../lib/og.js';

export const metadata = {
  title: 'Free subdomain for GitHub Pages',
  description:
    'Point yourname.runs-at.dev at a GitHub Pages site: the CNAME record, the Pages setting, HTTPS, and how to confirm it works.',
  alternates: { canonical: 'https://runs-at.dev/docs/guides/github-pages' },
  openGraph: { title: 'Free subdomain for GitHub Pages · runs-at.dev', images: SITE_OG_IMAGE },
};

const P = 'text-sm leading-relaxed sm:text-base';
const LINK = 'text-(--color-ink) underline';

export default function GithubPagesGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Guides / GitHub Pages</Eyebrow>
      <DocTitle>Use a free runs-at.dev subdomain with GitHub Pages</DocTitle>
      <Lede>
        Your Pages site already lives at a github.io address. This guide gives it a shorter,
        memorable one on runs-at.dev instead, at no cost, with a certificate issued by GitHub.
      </Lede>

      <Section title="What you'll end up with">
        <p className={P}>
          Suppose your GitHub account is <C>octo-dev</C> and your site currently loads at{' '}
          <C>https://octo-dev.github.io</C>. When you finish, <C>https://octo.runs-at.dev</C> shows
          the same site. GitHub keeps hosting and building it exactly as before; the only thing that
          changes is the address visitors type. That is the whole idea of a free subdomain for
          GitHub Pages: a custom-looking address without buying and renewing a domain of your own.
        </p>
        <p className={P}>
          Two settings make it work, one on each side. runs-at.dev publishes a DNS record that sends{' '}
          <C>octo.runs-at.dev</C> to GitHub, and GitHub Pages is told that it should answer for
          that name. If either half is missing, the address will not show your site.
        </p>
      </Section>

      <Section title="Before you start">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            A GitHub Pages site that already works at its github.io address. Fix that first; a
            custom address cannot repair a site that is not publishing.
          </li>
          <li>
            A runs-at.dev name claimed with the same GitHub sign-in you will manage it with. If you
            do not have one yet, the{' '}
            <a className={LINK} href="/docs/quickstart">quickstart</a> covers claiming. Every
            account includes one free name, and the administrator can grant more if you need a
            separate address for another project.
          </li>
          <li>
            Admin access to the repository that publishes the site, since the custom-domain setting
            lives in that repository.
          </li>
        </ul>
        <p className={P}>
          You do not need a Cloudflare account or a DNS provider of your own. runs-at.dev runs the
          DNS for every name under it and publishes your record for you.
        </p>
      </Section>

      <Section title="Add the DNS record">
        <p className={P}>
          GitHub Pages expects a custom subdomain to be a CNAME pointing at your account&apos;s
          github.io host. Use your user or organization name followed by <C>.github.io</C>, with no{' '}
          <C>https://</C> and no path after it. This is true for project sites as well: a repository
          published at <C>octo-dev.github.io/portfolio</C> still takes <C>octo-dev.github.io</C> as
          its CNAME target, because GitHub routes by the requested hostname, not by the path.
        </p>
        <Record path="domains/octo.json">{`"records": { "CNAME": "octo-dev.github.io" }`}</Record>
        <p className={P}>There are two ways to save it. Both end in the same commit to the registry.</p>
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">From the dashboard.</strong> Sign in at{' '}
            <a className={LINK} href="/manage">runs-at.dev/manage</a>, choose the name if you own more
            than one, open <C>Point to my hosting</C>, pick <C>GitHub Pages</C>, and save. The
            target is prefilled from your GitHub login; change it if the site belongs to an
            organization.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">By pull request.</strong> Fork{' '}
            <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev">the registry</a>,
            set the <C>records</C> block in <C>domains/octo.json</C> as shown above, and open a pull
            request. Automated checks confirm you own the file before it can be merged, and the
            record is published to DNS once it lands.
          </li>
        </ol>
        <p className={P}>
          A CNAME has to be the only record on the name, so it replaces a URL redirect or any A,
          AAAA, TXT or MX records you had set. The{' '}
          <a className={LINK} href="/docs/records">record reference</a> explains which records can
          share a name.
        </p>
      </Section>

      <Section title="Configure GitHub Pages">
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>Open the repository that publishes the site and go to Settings → Pages.</li>
          <li>
            Under Custom domain, type <C>octo.runs-at.dev</C> (your full name, including{' '}
            <C>.runs-at.dev</C>) and press Save.
          </li>
          <li>
            Wait for the DNS check on that page to finish. GitHub looks up your name and expects to
            find the CNAME you published in the previous step.
          </li>
        </ol>
        <p className={P}>
          If the site publishes from a branch, GitHub records the custom domain by committing a file
          named <C>CNAME</C> to the root of that publishing source. Keep it; deleting or overwriting
          it removes the custom domain. If the site is built and deployed by a GitHub Actions
          workflow instead, the setting in Settings → Pages is what counts and a <C>CNAME</C> file
          is not needed.
        </p>
        <Quote>
          The order does not matter. You can save the Pages setting before or after the runs-at.dev
          record goes live; GitHub simply keeps re-checking until the two agree.
        </Quote>
      </Section>

      <Section title="Enable HTTPS">
        <p className={P}>
          GitHub requests a certificate for <C>octo.runs-at.dev</C> on its own once the DNS check
          passes. While that is in progress the Enforce HTTPS checkbox is unavailable. When it
          becomes clickable, tick it so that plain http:// requests are sent to the secure address.
        </p>
        <p className={P}>
          Nothing needs to be done on the runs-at.dev side. The record is published as plain DNS,
          not behind a proxy, so the certificate request reaches GitHub directly.
        </p>
      </Section>

      <Section title="Check that it works">
        <ul className={`list-disc space-y-2 pl-6 ${P}`}>
          <li>
            <strong className="font-normal text-(--color-ink)">Settings → Pages</strong> reports a
            successful DNS check and shows your runs-at.dev address as the live site.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/manage</strong> has a
            status panel under each name. It reads <C>Live</C> with your page&apos;s title once
            visitors get your site, and <C>Not working yet</C> while they still get the profile card.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">runs-at.dev/debug/octo</strong> (with
            your own name) is a public diagnosis page. It shows the record, what DNS answers right
            now, what the name serves, and which step is missing if it is stuck. It is a link you can
            paste into an issue.
          </li>
          <li>
            From a terminal, the CNAME should name your github.io host:
          </li>
        </ul>
        <Code>{`dig +short octo.runs-at.dev CNAME
# octo-dev.github.io.`}</Code>
      </Section>

      <Section title="Common problems">
        <dl className={`space-y-6 ${P}`}>
          <div>
            <dt className="text-(--color-ink)">The address still shows the runs-at.dev profile card</dt>
            <dd className="mt-1 text-(--color-ash)">
              DNS reaches GitHub, but GitHub has not been told to answer for this name. Check that
              Settings → Pages lists <C>octo.runs-at.dev</C> exactly, in the repository that
              publishes the site. Right after saving, the record may also still be spreading; the
              status panel says so while it waits.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">The dashboard refuses the target</dt>
            <dd className="mt-1 text-(--color-ash)">
              Enter the host only, like <C>octo-dev.github.io</C>, without <C>https://</C> or
              anything after the address, and not your own runs-at.dev name.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">GitHub&apos;s DNS check fails</dt>
            <dd className="mt-1 text-(--color-ash)">
              Confirm the CNAME targets your github.io host, with the account name spelled exactly as
              it appears in your github.io address. A target that includes a repository path or a
              typo in the account name will not pass.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">Enforce HTTPS stays unavailable</dt>
            <dd className="mt-1 text-(--color-ash)">
              The certificate is only requested after the DNS check succeeds, so resolve that first.
              If DNS is correct and the option is still greyed out, removing the custom domain in
              Settings → Pages and adding it again makes GitHub start over.
            </dd>
          </div>
          <div>
            <dt className="text-(--color-ink)">Nothing loads at all</dt>
            <dd className="mt-1 text-(--color-ash)">
              The status panel reports <C>Not answering</C> when the address the record points at does
              not respond. Open the github.io address directly; if that fails too, the problem is
              with the Pages deployment rather than the domain.
            </dd>
          </div>
        </dl>
        <Warning>
          Moving the name to another host later means changing this record. GitHub will keep the
          custom domain in Settings → Pages until you remove it there as well.
        </Warning>
      </Section>

      <Section title="Related guides">
        <DocList
          items={[
            { href: '/docs/quickstart', label: 'Quickstart', note: 'claim a free subdomain first' },
            { href: '/docs/records', label: 'Record reference', note: 'every record type and what can coexist' },
            { href: '/docs/seo', label: 'SEO on a runs-at.dev name', note: 'canonical addresses and Search Console' },
            { href: '/docs/guides/vercel', label: 'Vercel' },
            { href: '/docs/guides/netlify', label: 'Netlify' },
            { href: '/docs/guides/cloudflare-pages', label: 'Cloudflare Pages' },
          ]}
        />
      </Section>
    </main>
  );
}
