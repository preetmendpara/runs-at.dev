import { Section, Quote } from '../../components/Section.jsx';
import { C, Code, DocList, DocTitle, Eyebrow, Lede, Record } from '../components.jsx';
import { SITE_OG_IMAGE } from '../../../lib/og.js';

export const metadata = {
  title: 'How to get a free developer subdomain',
  description:
    'Sign in with GitHub, check a name, claim it, and point it at your host. Learn the eligibility rules and how additional domains can be managed later.',
  alternates: { canonical: 'https://runs-at.dev/docs/quickstart' },
  openGraph: { title: 'How to get a free developer subdomain · runs-at.dev', images: SITE_OG_IMAGE },
};

const P = 'text-sm leading-relaxed sm:text-base';
const LINK = 'text-(--color-ink) underline';
const LIST = `list-disc space-y-2 pl-6 ${P}`;

export default function Quickstart() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Quickstart</Eyebrow>
      <DocTitle>Get a free subdomain in four steps</DocTitle>
      <Lede>
        Sign in with GitHub, pick a name, claim it, and point it at your project. This page takes
        you from nothing to a working yourname.runs-at.dev, and covers what to do when you want
        more than one.
      </Lede>

      <Section title="Before you start">
        <p className={P}>
          A runs-at.dev name is a subdomain of runs-at.dev, not a domain registered to you. If you
          are unsure which you need, read{' '}
          <a className={LINK} href="/docs/free-subdomain-vs-domain">free subdomain vs free domain</a>{' '}
          first. To claim one you need:
        </p>
        <ul className={LIST}>
          <li>
            A GitHub account that is at least 30 days old and has at least one public repository.
            Both are checked when you claim, using the details GitHub provides at sign-in.
          </li>
          <li>
            A free domain slot. Every eligible account includes one; if you already hold a name,
            another one needs an extra slot granted by the administrator.
          </li>
        </ul>
        <p className={P}>
          Names are 2 to 32 characters long and use lowercase letters, digits and hyphens. A name
          cannot begin or end with a hyphen, cannot have two hyphens as its third and fourth
          characters, and some names are reserved.
        </p>
      </Section>

      <Section title="Sign in with GitHub">
        <p className={P}>
          On the <a className={LINK} href="/">homepage</a>, use the Sign in with GitHub button. GitHub
          asks you to approve read access to your public profile, then sends you back to runs-at.dev
          signed in. Your GitHub login becomes the owner of every name you claim, and the same
          sign-in is how you manage them afterwards.
        </p>
        <p className={P}>
          You can check whether a name is free before signing in. You only need to be signed in for
          the claim itself.
        </p>
      </Section>

      <Section title="Check and claim a name">
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>Type the name you want into the box on the homepage.</li>
          <li>
            Read the line under it. It tells you when a name is available, when it is already
            claimed, when it is reserved, and when it breaks one of the naming rules.
          </li>
          <li>Press Claim it while you are signed in.</li>
        </ol>
        <p className={P}>
          A successful claim ends with a message that the name is yours. Behind that, runs-at.dev
          adds a small public record for your name to the registry, owned by your GitHub account:
        </p>
        <Record path="domains/yourname.json">{`{
  "name": "yourname",
  "owner": { "github": "your-github-login" },
  "claimedAt": "<when you claimed it>",
  "records": {}
}`}</Record>
        <p className={P}>
          With no records set, the name shows a profile card built from your GitHub account, so it
          is useful from the moment you claim it. If the claim is refused, the message says why:
          for example that the account is too new or has no public repository yet, or that you have
          used all your domain slots.
        </p>
      </Section>

      <Section title="Point it at your hosting">
        <p className={P}>
          Open <a className={LINK} href="/manage">runs-at.dev/manage</a> and pick the name. From
          there you can keep the profile card, send visitors to another address with a redirect,
          point the name at a site you host elsewhere, or add DNS records yourself. runs-at.dev runs
          the DNS for your name, so you do not need a DNS provider of your own.
        </p>
        <p className={P}>For the most common hosts, follow the guide for yours:</p>
        <ul className={LIST}>
          <li>
            <a className={LINK} href="/docs/guides/github-pages">Free subdomain for GitHub Pages</a>
          </li>
          <li>
            <a className={LINK} href="/docs/guides/vercel">Free subdomain for Vercel</a>
          </li>
          <li>
            <a className={LINK} href="/docs/guides/netlify">Free subdomain for Netlify</a>
          </li>
          <li>
            <a className={LINK} href="/docs/guides/cloudflare-pages">Free subdomain for Cloudflare Pages</a>
          </li>
        </ul>
        <p className={P}>
          Each record type and which ones can be combined is covered in the{' '}
          <a className={LINK} href="/docs/records">DNS record reference</a>.
        </p>
      </Section>

      <Section title="Check that it works">
        <ul className={LIST}>
          <li>
            <strong className="font-normal text-(--color-ink)">On /manage.</strong> Each name has a
            status panel. <C>Live</C> means visitors get what you set up, <C>Redirecting</C> means
            they are being sent on to your redirect address, <C>Not working yet</C> means they still
            see the profile card, and <C>Not answering</C> means nothing responded where the name
            points.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">On the debug page.</strong>{' '}
            <C>runs-at.dev/debug/yourname</C> shows the record, what DNS is answering right now and
            what the name serves, and names the missing step when something is stuck. It is public,
            so you can share the link when asking for help.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">From a terminal.</strong> A DNS lookup
            shows what your name currently points at, for example:
          </li>
        </ul>
        <Code>{`dig +short yourname.runs-at.dev CNAME`}</Code>
      </Section>

      <Section title="Managing more than one domain">
        <p className={P}>
          Each eligible GitHub account includes one domain. If you need more, for separate projects
          for example, the administrator can grant additional domain slots to your account. Slots are
          permission to claim; you still claim each extra name yourself, the same way as the first.
        </p>
        <p className={P}>
          Every name your account owns appears on{' '}
          <a className={LINK} href="/manage">runs-at.dev/manage</a> under one sign-in. The page shows
          how many domains you have used out of how many you are allowed, lets you switch between
          your names, and links to claiming another one while a slot is free. Releasing a name
          frees its slot again.
        </p>
      </Section>

      <Section title="Claiming through a pull request">
        <p className={P}>
          If you would rather use Git than the website, you can claim a name by pull request against
          the public registry. The same rules apply as on the website.
        </p>
        <ol className={`list-decimal space-y-2 pl-6 ${P}`}>
          <li>
            Fork{' '}
            <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev">the registry</a> and
            add one file, <C>domains/yourname.json</C>, shaped like the record above with your own
            GitHub login as the owner.
          </li>
          <li>
            Open a pull request that changes only that file. Automated checks confirm the name, your
            account&apos;s eligibility and that you have a free slot.
          </li>
          <li>
            While the pull request is open, a slot is held for the name so it counts against your
            allowance straight away. The checks run again once that hold is in place.
          </li>
          <li>
            When the pull request is merged, the name is yours. If it is closed without being merged,
            the held slot is released.
          </li>
        </ol>
        <Quote>
          Claiming on the website is quicker: the name is written for you with no pull request to
          wait on.
        </Quote>
      </Section>

      <Section title="What to do next">
        <DocList
          items={[
            { href: '/manage', label: 'Manage your domains', note: 'records, status and more slots' },
            { href: '/docs/records', label: 'DNS record reference', note: 'every record type and what can share a name' },
            { href: '/docs/seo', label: 'SEO on a runs-at.dev name', note: 'indexing a site on your subdomain' },
            { href: '/docs/free-subdomain-vs-domain', label: 'Free subdomain vs free domain', note: 'when a registered domain fits better' },
            { href: '/faq', label: 'FAQ', note: 'cost, ownership, limits and reclaiming' },
          ]}
        />
      </Section>
    </main>
  );
}
