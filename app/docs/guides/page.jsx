import { Section } from '../../components/Section.jsx';
import { Eyebrow, DocTitle, Lede, DocList } from '../components.jsx';

export const metadata = {
  title: 'Guides',
  description: 'Copy-paste walkthroughs for pointing a runs-on.dev name at a host, email forwarding, or a social verification record.',
  alternates: { canonical: 'https://runs-on.dev/docs/guides' },
  openGraph: { title: 'Guides · runs-on.dev' },
};

export default function Guides() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Eyebrow>Docs / Guides</Eyebrow>
      <DocTitle>Guides</DocTitle>
      <Lede>
        Each guide ends with the exact JSON to put in <span className="font-(family-name:--font-mono)">domains/&lt;name&gt;.json</span>, the
        steps on the provider&apos;s side, and how to tell it worked.
      </Lede>

      <Section title="No hosting needed">
        <DocList
          items={[
            { href: '/docs/guides/url-redirect', label: 'URL redirect', note: 'a plain short link, no hosting at all' },
          ]}
        />
      </Section>

      <Section title="Hosts">
        <DocList
          items={[
            { href: '/docs/guides/vercel', label: 'Vercel' },
            { href: '/docs/guides/netlify', label: 'Netlify' },
            { href: '/docs/guides/github-pages', label: 'GitHub Pages' },
            { href: '/docs/guides/cloudflare-pages', label: 'Cloudflare Pages' },
            { href: '/docs/guides/render', label: 'Render' },
            { href: '/docs/guides/railway', label: 'Railway' },
            { href: '/docs/guides/firebase', label: 'Firebase Hosting' },
            { href: '/docs/guides/replit', label: 'Replit' },
            { href: '/docs/guides/codeberg-pages', label: 'Codeberg Pages' },
          ]}
        />
      </Section>

      <Section title="Email and verification">
        <DocList
          items={[
            { href: '/docs/guides/email-forwarding', label: 'Email forwarding', note: 'MX records, with ImprovMX as the worked example' },
            { href: '/docs/guides/bluesky-handle', label: 'Bluesky handle', note: 'an _atproto TXT subdomain' },
            { href: '/docs/guides/discord-verification', label: 'Discord verification', note: 'a _discord TXT subdomain' },
          ]}
        />
      </Section>
    </main>
  );
}
