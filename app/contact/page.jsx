export const metadata = {
  title: 'Contact',
  description: 'How to reach runs-at.dev: abuse reports, name support, registry bugs, and the public source of every rule.',
  alternates: { canonical: 'https://runs-at.dev/contact' },
  openGraph: { title: 'Contact · runs-at.dev' },
};

const MONO = 'font-(family-name:--font-mono)';
const P = 'max-w-[640px] text-[16px] leading-[1.6] text-(--color-ash)';
const LINK = 'text-(--color-ink) underline';
const TAG = `${MONO} text-[12px] tracking-[0.08em] uppercase`;

// A numbered contact block: a heavy rule, the mono index, then the channel
// heading and its content. Beside the index on wide screens, below it on
// phones and in the 768px column the side-rail ads need from 1680px.
function Block({ index, title, children }) {
  return (
    <section className="mt-14 border-t-2 border-(--line-strong) pt-5 sm:mt-16">
      <div className="grid gap-4 lg:max-[1679px]:grid-cols-[120px_1fr] lg:max-[1679px]:gap-10">
        <p className="text-[44px] leading-none text-(--color-accent)" style={{ fontFamily: 'var(--font-display)' }} aria-hidden="true">{index}</p>
        <div className="min-w-0">
          <h2 className="text-[22px] leading-[1.15] font-normal text-(--color-ink) sm:text-[26px]">{title}</h2>
          <div className="mt-5 space-y-6">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function Contact() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16 min-[1680px]:max-w-3xl">
      <div className={`flex flex-wrap items-baseline justify-between gap-3 border-b border-(--line) pb-3 ${TAG} text-(--color-muted)`}>
        <span>runs-at.dev // contact</span>
        <p className="meta">Contact</p>
      </div>

      <h1 className="mt-10 text-[clamp(3rem,16vw,7.5rem)] leading-[0.88] font-normal text-(--color-ink) uppercase sm:mt-14">
        Reach us
      </h1>
      <p className="mt-8 max-w-[600px] border-l-[6px] border-(--color-accent) pl-4 text-[17px] leading-[1.5] text-(--color-ash) sm:text-[19px]">
        One registry, a few honest channels. Everything structural (the rules, the
        records, the code) is public first; email covers the rest.
      </p>

      <Block index="01" title="Abuse and security">
        <p className={P}>
          Phishing, impersonation, malware, or a name squatting a brand: email{' '}
          <a className={LINK} href="mailto:abuse@runs-at.dev">abuse@runs-at.dev</a> with the
          name and one line about what it is doing. Reclamation for the clear cases is same-day, no
          lawyer needed. Security reports about the site itself go to the same address; please do
          not open a public issue for anything exploitable.
        </p>
      </Block>

      <Block index="02" title="Name and record support">
        <p className={P}>
          Claimed a name and it is not resolving, or a record will not save? The{' '}
          <a className={LINK} href="/manage">manage page</a> has a live
          &ldquo;did it work?&rdquo; panel, and the{' '}
          <a className={LINK} href="/docs/guides">hosting guides</a> cover every
          provider&rsquo;s gotchas. If you are still stuck, the registry&rsquo;s{' '}
          <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev/issues">
            issue tracker
          </a>{' '}
          is the right place: include the name and what you expected.
        </p>
      </Block>

      <Block index="03" title="Everything else">
        <p className={P}>
          runs-at.dev is built and operated by{' '}
          <a className={LINK} href="https://github.com/preetmendpara">@preetmendpara</a>. The{' '}
          <a className={LINK} href="https://github.com/preetmendpara/runs-at.dev">
            public repo
          </a>{' '}
          is where product decisions happen in the open, and the{' '}
          <a className={LINK} href="/policy">policy</a> page is the contract.
        </p>
        <div className="border-2 border-(--line-strong) bg-(--color-card)">
          <p className={`border-b-2 border-(--line-strong) px-4 py-1.5 ${TAG} text-(--color-muted)`}>Note</p>
          <p className="p-4 text-[15px] leading-[1.6] text-(--color-ash) sm:p-5">
            A public registry answers in public. Email works for the private things; for everything
            else, an issue you can link to beats a message nobody else can read.
          </p>
        </div>
      </Block>
    </main>
  );
}
