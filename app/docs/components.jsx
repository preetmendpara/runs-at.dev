// Shared building blocks for the /docs section, set as a field manual: a
// ruled header, sections opened by a 2px rule, code and records in square
// frames, callouts with a labelled edge. Everything speaks the site's tokens
// (mono labels, carbon panels, hard rules) rather than a docs-only system.

const MONO = 'font-(family-name:--font-mono)';

// Top rule of every docs page: the site identifier on the left, the page's
// own breadcrumb as a bracketed label on the right.
export function Eyebrow({ children }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-(--line) pb-3">
      <span className={`${MONO} text-[12px] tracking-[0.08em] text-(--color-muted) uppercase`}>
        runs-at.dev // documentation
      </span>
      <p className="meta">{children}</p>
    </div>
  );
}

export function DocTitle({ children }) {
  return (
    <h1 className="mt-8 text-[clamp(1.85rem,7vw,3.25rem)] leading-[1] font-normal tracking-[-0.01em] break-words text-(--color-ink) uppercase sm:mt-12">
      {children}
    </h1>
  );
}

export function Lede({ children }) {
  return (
    <p className="mt-6 max-w-[640px] border-l-[6px] border-(--color-accent) pl-4 text-[17px] leading-[1.5] text-(--color-ash) sm:text-[19px]">
      {children}
    </p>
  );
}

// A manual section: a heavy rule, then the heading, then the content. Docs
// pages use this in place of the site-wide Section so the rest of the site
// keeps its own look.
export function Section({ title, children }) {
  return (
    <section className="mt-14 border-t-2 border-(--line-strong) pt-5 sm:mt-16">
      <h2 className="text-[22px] leading-[1.15] font-normal text-(--color-ink) sm:text-[26px]">
        <span aria-hidden="true" className="mr-2 text-(--color-accent-ink)">§</span>
        {title}
      </h2>
      <div className="mt-6 space-y-6 text-(--color-ink)">{children}</div>
    </section>
  );
}

// A labelled callout: square frame, a mono tag on the edge.
function Callout({ label, tone = 'note', children }) {
  const edge = tone === 'warning' ? 'border-(--color-flag)' : 'border-(--line-strong)';
  const stock = tone === 'warning' ? 'bg-(--color-card)' : 'surface-cream';
  const tag = tone === 'warning' ? 'text-(--color-flag)' : 'text-(--color-muted)';
  return (
    <div className={`border-2 ${edge} ${stock}`}>
      <p className={`border-b ${edge} px-4 py-1.5 ${MONO} text-[12px] tracking-[0.08em] uppercase ${tag}`}>{label}</p>
      <p className="p-4 text-sm leading-relaxed text-(--color-ash)">{children}</p>
    </div>
  );
}

export function Quote({ children }) {
  return <Callout label="Note">{children}</Callout>;
}

// Inline code, e.g. a field name or filename mentioned in prose.
export function C({ children }) {
  return (
    <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em] break-words text-(--color-ash)">
      {children}
    </code>
  );
}

// Raw source block: square frame, wraps long lines instead of scrolling the
// page.
export function Code({ children }) {
  return (
    <pre className={`surface-ink border border-(--line-strong) p-4 ${MONO} text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-(--color-ash) sm:text-[13px]`}>
      <code>{children}</code>
    </pre>
  );
}

// A JSON record example with its file path as the frame's title bar, the
// same pairing used by the claim form (domains/<name>.json).
export function Record({ path, children }) {
  return (
    <div className="surface-ink border-2 border-(--line-strong)">
      <p className={`border-b-2 border-(--line-strong) px-4 py-2 ${MONO} text-[12px] break-all text-(--color-ink)`}>{path}</p>
      <pre className={`p-4 ${MONO} text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-(--color-ash) sm:text-[13px]`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

// A flagged constraint the schema cannot express, labelled and edged in the
// flag token so it reads as distinct from a normal Quote callout.
export function Warning({ children }) {
  return <Callout label="Warning" tone="warning">{children}</Callout>;
}

export function DocList({ items }) {
  return (
    <ul className="border-2 border-(--line-strong)">
      {items.map((item) => (
        <li key={item.href} className="border-b border-(--line) last:border-b-0">
          <a
            className="group flex items-baseline justify-between gap-4 px-4 py-3 no-underline hover:bg-(--color-accent)"
            href={item.href}
          >
            <span>
              <span className="text-sm text-(--color-ink) underline decoration-(--line-strong) underline-offset-4 group-hover:text-white sm:text-base">
                {item.label}
              </span>
              {item.note && (
                <span className="ml-2 text-sm text-(--color-muted) group-hover:text-white"> · {item.note}</span>
              )}
            </span>
            <span aria-hidden="true" className={`${MONO} shrink-0 text-(--color-muted) group-hover:text-white`}>→</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Every provider guide ends in the same place: a record that has to reach
// domains/<name>.json. There are two ways to get it there and the guides
// walk through the pull request one, so this names the shorter path once,
// in one component, rather than in thirteen hand-written step lists.
export function ApplyNote() {
  return (
    <Callout label="Note">
      Two ways to apply this. The quickest is{' '}
      <a className="text-(--color-ink) underline" href="/manage">
        runs-at.dev/manage
      </a>
      : sign in, pick the record type, paste the value, save. It writes the same
      commit to the registry and DNS follows within seconds. The steps below do
      it by pull request instead, which is what you want if you would rather
      review the change first. Either way handles <C>subdomains</C> entries.
    </Callout>
  );
}
