export const metadata = {
  title: 'About',
  description:
    'runs-at.dev is a free subdomain registry, not a top-level domain. What that means, why it exists, and who runs it.',
  alternates: { canonical: 'https://runs-at.dev/about' },
  openGraph: { title: 'About · runs-at.dev' },
};

const MONO = 'font-(family-name:--font-mono)';
const P = 'max-w-[640px] text-[16px] leading-[1.6] text-(--color-ash)';
const LINK = 'text-(--color-ink) underline';
const CODE = `slit-inline bg-(--color-card) px-1.5 py-0.5 ${MONO} text-[0.9em] text-(--color-ink)`;

// A numbered sheet section: a heavy rule, the mono index, then the heading
// and its content. Beside the index on wide screens, below it on phones and
// in the 768px column the side-rail ads need from 1680px.
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

export default function About() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16 min-[1680px]:max-w-3xl">
      <div className={`border-b border-(--line) pb-3 ${MONO} text-[12px] tracking-[0.08em] text-(--color-muted) uppercase`}>
        runs-at.dev // about
      </div>

      <h1 className="mt-10 text-[clamp(3.5rem,19vw,8rem)] leading-[0.85] font-normal text-(--color-ink) uppercase sm:mt-14">About</h1>

      <Block index="01" title="What this is">
        <p className={P}>
          runs-at.dev gives away subdomains under one domain, runs-at.dev. Sign
          in with GitHub, claim a name like <code className={CODE}>you.runs-at.dev</code>, and
          it's live within seconds. No DNS panel, no yearly renewal on your end.
        </p>
      </Block>

      <Block index="02" title="It is not a top-level domain">
        <p className={P}>
          Say it plainly: this is a subdomain registry, not a TLD. A real top-level domain
          means an ICANN application. The 2026 round's evaluation fee alone is $227,000, before
          you've built or run a registry to back it. That's not a plausible route to a
          distinctive-looking address for a side project.
        </p>
        <div className="hard-shadow border-2 border-(--line-strong) bg-(--color-card)">
          <p className={`border-b-2 border-(--line-strong) px-4 py-1.5 ${MONO} text-[12px] tracking-[0.08em] text-(--color-muted) uppercase`}>
            Note
          </p>
          <p className="p-4 text-[15px] leading-[1.6] text-(--color-ash) sm:p-5">
            runs-at.dev gets the same feeling, a name that isn't <code className={CODE}>vercel.app</code> or
            <code className={CODE}> github.io</code>, for the price of one domain: about $10 a year. Every
            name you claim lives under runs-at.dev, which its operator registered and answers
            for.
          </p>
        </div>
      </Block>

      <Block index="03" title="Why it exists">
        <p className={P}>
          Free subdomains under a memorable root are a genuinely useful thing to give away.
          They make side projects, personal sites, and one-off tools look like they belong to
          someone, without asking anyone to run their own DNS. The idea isn't new, and it
          shouldn't have to be:{' '}
          <a className={LINK} href="https://www.is-a.dev">is-a.dev</a>,{' '}
          <a className={LINK} href="https://js.org">js.org</a>, and{' '}
          <a className={LINK} href="https://eu.org">eu.org</a> all did it first, and
          runs-at.dev exists because that pattern is worth having more than once.
        </p>
      </Block>

      <Block index="04" title="Who runs it">
        <p className={P}>
          runs-at.dev is registered and operated by{' '}
          <a className={LINK} href="https://github.com/preetmendpara">@preetmendpara</a>,
          the party responsible for what runs under it. It is operated in the open, with the
          source and the rules on GitHub. See the{' '}
          <a className={LINK} href="/policy">policy</a> for what that
          responsibility actually covers.
        </p>
      </Block>

      <Block index="05" title="The source">
        <div className="border-2 border-(--line-strong)">
          <p className={`border-b-2 border-(--line-strong) px-4 py-1.5 ${MONO} text-[12px] tracking-[0.08em] text-(--color-muted) uppercase`}>
            Source
          </p>
          <p className="p-4 text-[16px] leading-[1.6] text-(--color-ash) sm:p-5">
            Every claim, every hosting record, and every rule CI enforces lives in the public
            repo: <a className={`${LINK} ${MONO} text-[0.9em] break-all`} href="https://github.com/preetmendpara/runs-at.dev">github.com/preetmendpara/runs-at.dev</a>.
            Nothing about how a name gets claimed or reclaimed happens outside git history.
          </p>
        </div>
      </Block>
    </main>
  );
}
