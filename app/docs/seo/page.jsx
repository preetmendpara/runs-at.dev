import { Section, Quote } from '../../components/Section.jsx';
import { Eyebrow, DocTitle, Lede, C, Code, Record, Warning } from '../components.jsx';

export const metadata = {
  title: 'SEO',
  description:
    'How search engines treat a runs-on.dev name: why robots.txt and sitemaps are per host, why a URL redirect cannot rank, and which canonical to declare.',
  alternates: { canonical: 'https://runs-on.dev/docs/seo' },
  openGraph: { title: 'SEO · runs-on.dev' },
};

export default function Seo() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / SEO</Eyebrow>
      <DocTitle>SEO on a runs-on.dev name</DocTitle>
      <Lede>
        To a search engine, your name is its own site. It gets indexed on its own, ranks on its
        own, and starts with none of the registry&apos;s reputation.
      </Lede>

      <Section title="A subdomain is its own site">
        <p className="text-sm leading-relaxed sm:text-base">
          Nothing about sitting under runs-on.dev helps or hurts you. The name has to earn its own
          links like any other host. That cuts both ways, and which way depends entirely on which
          record type you use.
        </p>
      </Section>

      <Section title="Redirect names cannot rank">
        <p className="text-sm leading-relaxed sm:text-base">
          A <C>URL</C> record sends visitors somewhere else with a 307. Nothing is served at your
          name, so there is nothing to index.
        </p>
        <Record path="domains/you.json">{`"records": { "URL": "https://github.com/you" }`}</Record>
        <p className="text-sm leading-relaxed sm:text-base">
          The 307 is deliberately temporary, which means search engines keep treating your name as
          the canonical rather than passing its signals to the target. A permanent 301 would
          consolidate them, but it would also be cached by browsers indefinitely and strand every
          visitor the day you repoint the name.
        </p>
        <Quote>
          Use a redirect because it is a short address you can hand to people, not because you
          expect it to rank. If you want the target to rank, link people to the target.
        </Quote>
      </Section>

      <Section title="Hosted names can rank fully">
        <p className="text-sm leading-relaxed sm:text-base">
          Point the name at a host you control and you serve every byte, so every ordinary SEO
          lever is yours: titles, descriptions, structured data, internal links, page speed. The
          registry is not in the request path at all once DNS resolves.
        </p>
        <Record path="domains/you.json">{`"records": { "CNAME": "cname.vercel-dns.com" }`}</Record>
        <p className="text-sm leading-relaxed sm:text-base">
          See <a className="text-(--color-signal) underline" href="/docs/guides">the guides</a> for
          the record each provider wants.
        </p>
      </Section>

      <Section title="robots.txt and sitemaps are per host">
        <p className="text-sm leading-relaxed sm:text-base">
          This is the one that catches people. <C>robots.txt</C> is scoped to a single hostname.
          The registry&apos;s <C>runs-on.dev/robots.txt</C> says nothing at all about your name, and
          you cannot inherit it, edit it, or be blocked by it. Serve your own, and reference the
          sitemap by its full URL on your own host.
        </p>
        <Code>{`# https://you.runs-on.dev/robots.txt
User-Agent: *
Allow: /

Sitemap: https://you.runs-on.dev/sitemap.xml`}</Code>
        <p className="text-sm leading-relaxed sm:text-base">
          A name with no hosting has no <C>robots.txt</C> of its own and returns 404 for it, which
          crawlers read as no restrictions.
        </p>
      </Section>

      <Section title="Pick one canonical">
        <p className="text-sm leading-relaxed sm:text-base">
          If the same pages live at both <C>you.runs-on.dev</C> and your own domain, search engines
          have to guess which is the real address, and they will split the signals while they do
          it. Say it explicitly on every page.
        </p>
        <Code>{`<link rel="canonical" href="https://you.runs-on.dev/about">`}</Code>
        <p className="text-sm leading-relaxed sm:text-base">
          If the runs-on.dev name is the only home for the content, point it at itself. If it
          mirrors a site you already run, point it at that site instead, and be consistent on every
          page rather than mixing the two.
        </p>
      </Section>

      <Section title="Verifying in Search Console and Bing">
        <p className="text-sm leading-relaxed sm:text-base">
          Add <C>https://you.runs-on.dev</C> as its own property. It will not appear under a
          property for runs-on.dev, and you cannot verify the registry domain itself. A URL-prefix
          property verified by an HTML file or meta tag is simplest when you are hosting real
          content. To verify by DNS instead, a <C>TXT</C> record on your own name works.
        </p>
        <Record path="domains/you.json">{`"records": {
  "CNAME": "cname.vercel-dns.com",
  "TXT": ["google-site-verification=your-token-here"]
}`}</Record>
        <p className="text-sm leading-relaxed sm:text-base">
          For a token that has to sit on an underscore label, use <C>subdomains</C>.
        </p>
        <Record path="domains/you.json">{`"subdomains": {
  "_acme-challenge": { "TXT": ["your-token-here"] }
}`}</Record>
        <Warning>
          <C>TXT</C> coexists with <C>A</C> and <C>MX</C> but never with <C>CNAME</C> at the same
          label. The{' '}
          <a className="text-(--color-signal) underline" href="/docs/records">
            record reference
          </a>{' '}
          explains why.
        </Warning>
      </Section>

      <Section title="HTTPS is already handled">
        <p className="text-sm leading-relaxed sm:text-base">
          <C>.dev</C> is on the HSTS preload list as a whole TLD, with force-https and
          include-subdomains set. Browsers upgrade every request to a runs-on.dev name before it
          leaves the machine, and the registry sends <C>Strict-Transport-Security</C> on top of
          that.
        </p>
        <p className="text-sm leading-relaxed sm:text-base">
          The practical effect is that you never have an http copy of your site competing with the
          https one, which is a duplicate-URL problem you would otherwise have to redirect your way
          out of.
        </p>
      </Section>

      <Section title="The profile card">
        <p className="text-sm leading-relaxed sm:text-base">
          A claimed name with no records is served a profile card off the wildcard. Each card
          carries its own title, description and canonical, so it can be indexed as its own page,
          but it is still one short page about a name. Point the name at real hosting if you want
          something that competes in search.
        </p>
      </Section>

      <Section title="One limitation worth knowing">
        <p className="text-sm leading-relaxed sm:text-base">
          runs-on.dev is not on the{' '}
          <a className="text-(--color-signal) underline" href="https://publicsuffix.org">
            Public Suffix List
          </a>{' '}
          yet. Until it is, a cookie scoped to <C>.runs-on.dev</C> is readable by every other name
          in the registry.
        </p>
        <Warning>
          Scope your cookies to <C>you.runs-on.dev</C> and nothing broader, and do not put session
          tokens or anything else sensitive in a cookie set above your own host.
        </Warning>
      </Section>

      <Section title="Checklist">
        <ul className="space-y-1.5 text-sm leading-relaxed sm:text-base">
          <li>Hosting, not a redirect, if you want to rank.</li>
          <li>
            Your own <C>robots.txt</C> and <C>sitemap.xml</C>, on your own host.
          </li>
          <li>One canonical, declared on every page.</li>
          <li>Its own Search Console and Bing property.</li>
          <li>Cookies scoped to your name only.</li>
        </ul>
      </Section>
    </main>
  );
}
