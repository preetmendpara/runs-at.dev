import { Section, Quote } from '../components/Section.jsx';

export const metadata = {
  title: 'About',
  description:
    'runs-on.dev is a free subdomain registry, not a top-level domain. What that means, why it exists, and who runs it.',
  alternates: { canonical: 'https://runs-on.dev/about' },
  openGraph: { title: 'About · runs-on.dev' },
};

export default function About() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <h1 className="text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">About</h1>

      <Section title="What this is">
        <p className="text-sm leading-relaxed">
          runs-on.dev gives away subdomains under one domain that Advance Labs registered. Sign
          in with GitHub, claim a name like <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-(--color-ash)">you.runs-on.dev</code>, and
          it's live within seconds. No DNS panel, no yearly renewal on your end.
        </p>
      </Section>

      <Section title="It is not a top-level domain">
        <p className="text-sm leading-relaxed">
          Say it plainly: this is a subdomain registry, not a TLD. A real top-level domain
          means an ICANN application. The 2026 round's evaluation fee alone is $227,000, before
          you've built or run a registry to back it. That's not a plausible route to a
          distinctive-looking address for a side project.
        </p>
        <Quote>
          runs-on.dev gets the same feeling, a name that isn't <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-(--color-ash)">vercel.app</code> or
          <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-(--color-ash)"> github.io</code>, for the price of one domain: about $10 a year. Every
          name you claim lives under runs-on.dev, which Advance Labs registered and answers
          for.
        </Quote>
      </Section>

      <Section title="Why it exists">
        <p className="text-sm leading-relaxed">
          Free subdomains under a memorable root are a genuinely useful thing to give away.
          They make side projects, personal sites, and one-off tools look like they belong to
          someone, without asking anyone to run their own DNS. The idea isn't new, and it
          shouldn't have to be:{' '}
          <a className="text-(--color-signal) underline" href="https://www.is-a.dev">is-a.dev</a>,{' '}
          <a className="text-(--color-signal) underline" href="https://js.org">js.org</a>, and{' '}
          <a className="text-(--color-signal) underline" href="https://eu.org">eu.org</a> all did it first, and
          runs-on.dev exists because that pattern is worth having more than once.
        </p>
      </Section>

      <Section title="Who runs it">
        <p className="text-sm leading-relaxed">
          <a className="text-(--color-signal) underline" href="https://advancelabs.dev">Advance Labs</a> is the registrant
          of runs-on.dev and the party responsible for what runs under it. Advance Labs builds
          and ships its own software products; this registry is one of them, operated the same
          way it operates everything else: in the open, with the source and the rules on
          GitHub. See the <a className="text-(--color-signal) underline" href="/policy">policy</a> for what that
          responsibility actually covers, and Advance Labs's own guide on{' '}
          <a
            className="text-(--color-signal) underline"
            href="https://advancelabs.dev/guides/custom-domain-ending-without-icann"
          >
            picking a custom domain ending without going through ICANN
          </a>
          .
        </p>
      </Section>

      <Section title="The source">
        <p className="text-sm leading-relaxed">
          Every claim, every hosting record, and every rule CI enforces lives in the public
          repo: <a className="text-(--color-signal) underline" href="https://github.com/zordhalo/runs-on.dev">github.com/zordhalo/runs-on.dev</a>.
          Nothing about how a name gets claimed or reclaimed happens outside git history.
        </p>
      </Section>
    </main>
  );
}
