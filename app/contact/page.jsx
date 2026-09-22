import { Section, Quote } from '../components/Section.jsx';

export const metadata = {
  title: 'Contact',
  description: 'How to reach runs-on.dev: abuse reports, name support, registry bugs, and the public source of every rule.',
  alternates: { canonical: 'https://runs-on.dev/contact' },
  openGraph: { title: 'Contact · runs-on.dev' },
};

export default function Contact() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <p className="meta">Contact</p>
      <h1 className="mt-3 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
        Reach us
      </h1>
      <p className="mt-4 max-w-[600px] text-[16px] leading-[1.5] text-(--color-muted)">
        One registry, a few honest channels. Everything structural (the rules, the
        records, the code) is public first; email covers the rest.
      </p>

      <Section title="Abuse and security">
        <p className="text-sm leading-relaxed sm:text-base">
          Phishing, impersonation, malware, or a name squatting a brand: email{' '}
          <a className="text-(--color-ink) underline" href="mailto:abuse@runs-on.dev">abuse@runs-on.dev</a> with the
          name and one line about what it is doing. Reclamation for the clear cases is same-day, no
          lawyer needed. Security reports about the site itself go to the same address; please do
          not open a public issue for anything exploitable.
        </p>
      </Section>

      <Section title="Name and record support">
        <p className="text-sm leading-relaxed sm:text-base">
          Claimed a name and it is not resolving, or a record will not save? The{' '}
          <a className="text-(--color-ink) underline" href="/manage">manage page</a> has a live
          &ldquo;did it work?&rdquo; panel, and the{' '}
          <a className="text-(--color-ink) underline" href="/docs/guides">hosting guides</a> cover every
          provider&rsquo;s gotchas. If you are still stuck, the registry&rsquo;s{' '}
          <a className="text-(--color-ink) underline" href="https://github.com/zordhalo/runs-on.dev/issues">
            issue tracker
          </a>{' '}
          is the right place: include the name and what you expected.
        </p>
      </Section>

      <Section title="Everything else">
        <p className="text-sm leading-relaxed sm:text-base">
          runs-on.dev is built and operated by{' '}
          <a className="text-(--color-ink) underline" href="https://advancelabs.dev">Advance Labs</a>. The
          operator&rsquo;s own site carries the current ways to get in touch; the{' '}
          <a className="text-(--color-ink) underline" href="https://github.com/zordhalo/runs-on.dev">
            public repo
          </a>{' '}
          is where product decisions happen in the open, and the{' '}
          <a className="text-(--color-ink) underline" href="/policy">policy</a> page is the contract.
        </p>
        <Quote>
          A public registry answers in public. Email works for the private things; for everything
          else, an issue you can link to beats a message nobody else can read.
        </Quote>
      </Section>
    </main>
  );
}
