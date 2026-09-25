import { Section, Quote } from '../../components/Section.jsx';
import { C, DocList, DocTitle, Eyebrow, Lede } from '../components.jsx';
import { SITE_OG_IMAGE } from '../../../lib/og.js';

const TITLE = "Free subdomain vs free domain: what's the difference";
const DESCRIPTION =
  "A runs-at.dev subdomain is free but lives under someone else's domain. Learn the difference in ownership, DNS control, SEO, email, and when buying a domain makes sense.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://runs-at.dev/docs/free-subdomain-vs-domain' },
  openGraph: { title: `${TITLE} · runs-at.dev`, description: DESCRIPTION, images: SITE_OG_IMAGE },
};

const P = 'text-sm leading-relaxed sm:text-base';
const LINK = 'text-(--color-ink) underline';
const LIST = `list-disc space-y-2 pl-6 ${P}`;

export default function FreeSubdomainVsDomain() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Free subdomain vs domain</Eyebrow>
      <DocTitle>Free subdomain or your own domain?</DocTitle>
      <Lede>
        Searches for a free domain often end at offers that are really something else. This page
        explains the difference plainly, including what runs-at.dev is and is not, so you can pick
        what fits your project.
      </Lede>

      <Section title="What a subdomain is">
        <p className={P}>
          Web addresses are read from the right. In <C>yourname.runs-at.dev</C>, the part that was
          registered with a registrar is <C>runs-at.dev</C>: that is the parent domain. Everything to
          the left of it is a subdomain, a name the owner of the parent can create and hand out
          without registering anything new.
        </p>
        <p className={P}>
          Compare that with <C>yourname.com</C>. There, <C>yourname.com</C> is itself the registered
          domain, and whoever registered it decides everything underneath it.
        </p>
        <Quote>
          runs-at.dev is a subdomain service. A name you claim here is a subdomain of runs-at.dev,
          not a domain registered to you.
        </Quote>
      </Section>

      <Section title={'What a "free domain" offer usually means'}>
        <p className={P}>
          The phrase covers several different things, and it is worth checking which one you are
          looking at before you sign up:
        </p>
        <ul className={LIST}>
          <li>
            A domain included for the first year with a hosting or website-builder plan, which then
            renews at the normal price.
          </li>
          <li>
            A registration on an extension that some provider gives away, with its own rules about
            renewal and use.
          </li>
          <li>
            A subdomain on someone else&apos;s domain, which is what runs-at.dev offers. Nothing is
            registered in your name, and there is no renewal to pay.
          </li>
        </ul>
        <p className={P}>
          None of these is better in general. They answer different needs, and the rest of this page
          goes through where they differ.
        </p>
      </Section>

      <Section title="Ownership and control">
        <p className={P}>
          When you register <C>yourname.com</C>, the registration is in your name for as long as you
          renew it. You can move it between registrars, choose any DNS provider, and create as many
          subdomains as you like.
        </p>
        <p className={P}>With a runs-at.dev name the arrangement is different:</p>
        <ul className={LIST}>
          <li>
            The operator registered <C>runs-at.dev</C> and renews it. You never register or pay for
            it, and you cannot take it with you.
          </li>
          <li>
            Your claim is recorded against your GitHub account in a public file,{' '}
            <C>domains/yourname.json</C>, and only you can change or release it.
          </li>
          <li>
            The name is granted under the site&apos;s{' '}
            <a className={LINK} href="/policy">policy</a>, which allows names to be reclaimed, for
            example for abuse. It is a free, best-effort service rather than a purchase.
          </li>
          <li>
            Every eligible GitHub account gets one name included, and the administrator can grant
            extra slots for more.
          </li>
        </ul>
      </Section>

      <Section title="DNS and hosting">
        <p className={P}>
          On your claimed subdomain you choose what it does, using the record types this service
          supports: show a profile card built from your GitHub account, redirect visitors elsewhere,
          point it at your hosting with a CNAME, or publish A, AAAA, TXT and MX records. The{' '}
          <a className={LINK} href="/docs/records">DNS record reference</a> lists them and the rules
          for combining them.
        </p>
        <p className={P}>
          What you cannot do is change anything outside your own name. Settings that apply to the
          whole of <C>runs-at.dev</C> belong to the operator. With a domain of your own, the entire
          DNS zone is yours to manage with whichever provider you pick.
        </p>
        <p className={P}>
          For the common hosts there are step-by-step guides:{' '}
          <a className={LINK} href="/docs/guides/github-pages">free subdomain for GitHub Pages</a>,{' '}
          <a className={LINK} href="/docs/guides/vercel">free subdomain for Vercel</a>,{' '}
          <a className={LINK} href="/docs/guides/netlify">free subdomain for Netlify</a> and{' '}
          <a className={LINK} href="/docs/guides/cloudflare-pages">free subdomain for Cloudflare Pages</a>.
        </p>
      </Section>

      <Section title="SEO">
        <p className={P}>
          Search engines generally treat a hostname as its own site. A site served at{' '}
          <C>yourname.runs-at.dev</C> is indexed as that hostname, separately from other names under
          the same parent, and from anything at <C>runs-at.dev</C> itself.
        </p>
        <p className={P}>
          Being a subdomain does not by itself stop a page from being found or ranked. What decides
          that is mostly the page: whether it is useful, well built and linked to. The same is true on
          a registered domain. No choice of address guarantees a position in search results.
        </p>
        <p className={P}>
          Two practical differences are worth knowing. A name set up as a redirect serves no content,
          so there is nothing at that address to rank. And if you plan to move to your own domain
          later, the address people link to now is the one that collects those links. The{' '}
          <a className={LINK} href="/docs/seo">SEO guide for runs-at.dev names</a> covers canonical
          addresses, robots.txt and search console verification.
        </p>
      </Section>

      <Section title="Email">
        <p className={P}>
          A subdomain comes with an address, not with a mailbox. runs-at.dev does not host email.
          What you can do is publish MX records on your own name so that mail for it goes to an email
          service you already use or sign up for; the{' '}
          <a className={LINK} href="/docs/guides/email-forwarding">email forwarding guide</a> shows one
          way to set that up.
        </p>
        <p className={P}>
          Mail settings that belong to the parent domain are not yours to change, because you do not
          own <C>runs-at.dev</C>. If email under your own name is central to what you do, that is a
          strong reason to register a domain.
        </p>
      </Section>

      <Section title="When a free subdomain makes sense">
        <ul className={LIST}>
          <li>A portfolio, résumé or personal page that needs a tidy address now.</li>
          <li>Documentation, a demo or a side project hosted on GitHub Pages, Vercel, Netlify or Cloudflare Pages.</li>
          <li>Trying out an idea before you know whether it deserves a domain.</li>
          <li>Keeping a stable short link you can repoint as a project moves between hosts.</li>
        </ul>
        <p className={P}>
          In all of these, the appeal is a clean address with no purchase and no renewal to remember.
        </p>
      </Section>

      <Section title="When to buy your own domain">
        <p className={P}>These are reasons people commonly choose to register a domain; weigh them for your situation:</p>
        <ul className={LIST}>
          <li>
            <strong className="font-normal text-(--color-ink)">Brand ownership.</strong> A business or
            long-running project usually wants a name it controls outright.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">Portability.</strong> A registered
            domain moves with you between registrars and hosts, independent of any one service.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">Control of the whole domain.</strong>{' '}
            You set every DNS record, create any subdomains you want, and decide the domain&apos;s
            rules.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">Email.</strong> Addresses at your own
            domain, with its mail settings under your control.
          </li>
        </ul>
        <p className={P}>
          None of these makes a subdomain the wrong choice for everything else. Many people use both:
          a registered domain for the main site and free subdomains for experiments.
        </p>
      </Section>

      <Section title="Moving to your own domain later">
        <p className={P}>
          Nothing locks a project to runs-at.dev. You can register a domain whenever you are ready and
          add it to your hosting provider, the same way you added your runs-at.dev name. From then on
          you decide what the old name does, from the dashboard:
        </p>
        <ul className={LIST}>
          <li>
            Keep it pointing at the same site, so both addresses work while people update their
            links.
          </li>
          <li>
            Set it to a <C>URL</C> redirect to the new domain. runs-at.dev sends that redirect as a
            temporary one, so it is a convenience for visitors rather than a way to move search
            signals; the <a className={LINK} href="/docs/seo">SEO guide</a> explains the reasoning.
          </li>
          <li>Release the name when you no longer need it, so someone else can claim it.</li>
        </ul>
        <p className={P}>
          None of this happens automatically. The move, and any redirects on your new domain, are
          yours to set up.
        </p>
      </Section>

      <Section title="Related guides">
        <DocList
          items={[
            { href: '/', label: 'Claim a free subdomain', note: 'check a name and claim it with GitHub' },
            { href: '/docs/quickstart', label: 'Quickstart', note: 'from sign-in to a working name' },
            { href: '/docs/records', label: 'DNS record reference', note: 'what each record type does' },
            { href: '/docs/seo', label: 'SEO on a runs-at.dev name' },
            { href: '/docs/guides/github-pages', label: 'Free subdomain for GitHub Pages' },
            { href: '/docs/guides/vercel', label: 'Free subdomain for Vercel' },
            { href: '/docs/guides/netlify', label: 'Free subdomain for Netlify' },
            { href: '/docs/guides/cloudflare-pages', label: 'Free subdomain for Cloudflare Pages' },
            { href: '/faq', label: 'FAQ', note: 'cost, ownership, limits and reclaiming' },
          ]}
        />
      </Section>
    </main>
  );
}
