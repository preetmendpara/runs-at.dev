import { Section, Quote } from '../components/Section.jsx';

export const metadata = {
  title: 'Privacy',
  description: 'What runs-at.dev stores, what it never tracks, and what is public by design. One sign-in cookie, privacy-friendly page counts, and no hidden data.',
  alternates: { canonical: 'https://runs-at.dev/privacy' },
  openGraph: { title: 'Privacy · runs-at.dev' },
};

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="meta">Privacy</p>
      <h1 className="mt-3 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        What is stored, what is not
      </h1>
      <p className="mt-4 max-w-[600px] text-[16px] leading-[1.5] text-(--color-muted)">
        The short version: no visitor tracking, no hidden database. Your record is a public file
        you can read, and this page is the full list of what the site keeps.
      </p>

      <Section title="Public by design">
        <p className="text-sm leading-relaxed sm:text-base">
          A claim writes <code className="rounded-[4px] border border-(--color-rule) bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em]">domains/&lt;name&gt;.json</code> to a
          public GitHub repository: the name, your GitHub login, the claim timestamp, any DNS
          records you set, and an optional display profile. Git history keeps every past version.
          That publicity is the registry&rsquo;s integrity model, not a side effect.
        </p>
      </Section>

      <Section title="Sign-in and the session cookie">
        <p className="text-sm leading-relaxed sm:text-base">
          Signing in runs through GitHub OAuth. The site stores a single signed, HttpOnly cookie
          holding your login and a few public profile facts, expiring after 24 hours. Two more
          cookies exist only during sign-in: one that checks the sign-in started here, and one that
          remembers which name you were claiming. Both last ten minutes and are cleared the moment
          you land back on the site. There is no account record on this side: the cookie plus
          GitHub is the whole identity. Sign out (or wait a day) and nothing about you remains on
          the server.
        </p>
      </Section>

      <Section title="The claim-time country field">
        <p className="text-sm leading-relaxed sm:text-base">
          When a name is claimed, the request&rsquo;s edge-inferred country (an ISO code like{' '}
          <code className="rounded-[4px] border border-(--color-rule) bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em]">IN</code>) is
          written into the record, and nothing more precise. It feeds the aggregate claim map on
          the stats page. It is never a city, never an IP address, written exactly once at the
          moment of the claim, and never refreshed or enriched afterwards. To remove it entirely,
          release the name (it goes back to the pool) and claim again.
        </p>
      </Section>

      <Section title="What is and is not collected">
        <p className="text-sm leading-relaxed sm:text-base">
          No visitor fingerprinting. No advertising cookies. No location lookups on page views. No
          profile built from how you browse.
        </p>
        <p className="text-sm leading-relaxed sm:text-base">
          One thing is counted: the site uses Vercel Analytics, which records page views without
          cookies and without identifying visitors. It tells the operator which pages get used; it
          cannot follow a person across pages, sites, or visits.
        </p>
        <Quote>
          One exception to &ldquo;nothing&rdquo;: like any host, the deployment platform keeps
          standard request logs for abuse and outage handling. Those belong to the platform, not
          to this registry, and they are not used for the map or the stats.
        </Quote>
      </Section>

      <Section title="Third parties the site talks to">
        <p className="text-sm leading-relaxed sm:text-base">
          GitHub&rsquo;s API (your public profile fills the sign-in session and the profile card),
          live DNS resolvers (to answer the &ldquo;is it working?&rdquo; panel), Vercel (which
          hosts the site and counts page views), and Cloudflare (which runs the DNS for
          runs-at.dev and answers every claimed name before passing the request on). A visit to any
          <code className="rounded-[4px] border border-(--color-rule) bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em]">*.runs-at.dev</code> name
          therefore passes through Cloudflare. None of these receive anything beyond what is needed
          to answer your request.
        </p>
      </Section>

      <Section title="Removing your data">
        <p className="text-sm leading-relaxed sm:text-base">
          Release the name on the <a className="text-(--color-ink) underline" href="/manage">manage page</a> and
          the record (country field included) is deleted from the registry. Git history on the
          public repo keeps past versions of records, as it must for a registry whose integrity is
          its history; truly sensitive data should never go into a record in the first place.
        </p>
      </Section>
    </main>
  );
}
