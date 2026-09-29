import { Section, Quote } from '../docs/components.jsx';
import PageHeader from '../components/page-header.jsx';

export const metadata = {
  title: 'Privacy',
  description: 'What runs-at.dev stores, what is public by design, the sign-in cookie, privacy-friendly page counts, and the HilltopAds banner advertising.',
  alternates: { canonical: 'https://runs-at.dev/privacy' },
  openGraph: { title: 'Privacy · runs-at.dev' },
};

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <PageHeader label="privacy" crumb="Privacy" title="What is stored, what is not">
        The short version: no visitor tracking, no hidden database. Your record is a public file
        you can read, and this page is the full list of what the site keeps.
      </PageHeader>

      <div className="surface-cream mt-12 border-2 border-(--line-strong) px-5 pb-10 sm:px-10 [&>section:first-child]:mt-8">
      <Section title="Public by design">
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          A claim writes <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em] text-(--color-ink)">domains/&lt;name&gt;.json</code> to a
          public GitHub repository: the name, your GitHub login, the claim timestamp, any DNS
          records you set, and an optional display profile. Git history keeps every past version.
          That publicity is the registry&rsquo;s integrity model, not a side effect.
        </p>
      </Section>

      <Section title="Sign-in and the session cookie">
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
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
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          When a name is claimed, the request&rsquo;s edge-inferred country (an ISO code like{' '}
          <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em] text-(--color-ink)">IN</code>) is
          written into the record, and nothing more precise. It feeds the aggregate claim map on
          the stats page. It is never a city, never an IP address, written exactly once at the
          moment of the claim, and never refreshed or enriched afterwards. To remove it entirely,
          release the name (it goes back to the pool) and claim again.
        </p>
      </Section>

      <Section title="What is and is not collected">
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          runs-at.dev itself does no visitor fingerprinting, no location lookups on page views, and
          builds no profile from how you browse. The advertising described below comes from a third
          party and is covered separately.
        </p>
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
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

      <Section title="Advertising">
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          runs-at.dev shows banner advertising provided by HilltopAds. There are three 300&times;250
          banners, and none of them runs on claimed{' '}
          <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em] text-(--color-ink)">*.runs-at.dev</code>{' '}
          names.
        </p>
        <ul className="list-disc space-y-2 pl-6 text-[15px] leading-[1.6] text-(--color-ash) marker:text-(--color-muted) sm:text-base">
          <li>
            <strong className="font-normal text-(--color-ink)">One on the homepage.</strong> It loads
            lazily: nothing is requested from HilltopAds for it until the banner comes close to the
            visible part of the page.
          </li>
          <li>
            <strong className="font-normal text-(--color-ink)">Two beside the content</strong>, one on
            each side, on the documentation, the FAQ, and the about, policy, privacy, contact and blog
            pages. They appear, and their code loads, only on screens at least 1680 pixels wide; on
            smaller screens nothing is requested for them. They are not used on the homepage, the
            stats page, the manage and admin pages, sign-in, the API, or the debugging and
            profile-card pages.
          </li>
        </ul>
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          Once a banner loads, your browser connects to HilltopAds&rsquo; servers to fetch and display
          the ad. Like other advertising technology, HilltopAds may receive and process technical
          information about that request to deliver and measure ads. What it collects, and how it
          uses it, is described in{' '}
          <a className="text-(--color-ink) underline" href="https://hilltopads.com/privacy-policy" rel="noopener noreferrer">HilltopAds&rsquo; privacy policy</a>.
          runs-at.dev does not pass your GitHub sign-in to HilltopAds, and the session cookie is
          marked so that no script on the page, the ads&rsquo; included, can read it.
        </p>
      </Section>

      <Section title="Third parties the site talks to">
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          GitHub&rsquo;s API (your public profile fills the sign-in session and the profile card),
          live DNS resolvers (to answer the &ldquo;is it working?&rdquo; panel), Vercel (which
          hosts the site and counts page views), and Cloudflare (which runs the DNS for
          runs-at.dev and answers every claimed name before passing the request on). A visit to any
          <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em] text-(--color-ink)">*.runs-at.dev</code> name
          therefore passes through Cloudflare. None of these receive anything beyond what is needed
          to answer your request. Some pages also load banner ads from HilltopAds, as described under
          Advertising above.
        </p>
      </Section>

      <Section title="Removing your data">
        <p className="text-[15px] leading-[1.6] text-(--color-ash) sm:text-base">
          Release the name on the <a className="text-(--color-ink) underline" href="/manage">manage page</a> and
          the record (country field included) is deleted from the registry. Git history on the
          public repo keeps past versions of records, as it must for a registry whose integrity is
          its history; truly sensitive data should never go into a record in the first place.
        </p>
      </Section>
      </div>
    </main>
  );
}
