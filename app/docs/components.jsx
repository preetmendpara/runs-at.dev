// Shared building blocks for the /docs section. Every piece reuses the
// site's design tokens and motifs (mono meta labels, the carbon panel inside
// a graphite hairline, the record-block look from the claim form and site
// profile page) rather than introducing a new visual system for docs.

export function Eyebrow({ children }) {
  return <p className="meta">{children}</p>;
}

export function DocTitle({ children }) {
  return (
    <h1 className="mt-3 text-[34px] leading-[1.03] font-normal tracking-[-0.005em] text-(--color-ink) sm:text-[44px] sm:tracking-[-0.007em]">
      {children}
    </h1>
  );
}

export function Lede({ children }) {
  return (
    <p className="mt-5 max-w-[600px] text-[18px] leading-[1.4] text-(--color-muted) sm:text-[21px] sm:leading-[1.35]">
      {children}
    </p>
  );
}

// Inline code, e.g. a field name or filename mentioned in prose.
export function C({ children }) {
  return (
    <code className="slit-inline bg-(--color-card) px-1.5 py-0.5 font-(family-name:--font-mono) text-[0.9em] text-(--color-ash)">
      {children}
    </code>
  );
}

export function Code({ children }) {
  return (
    <pre className="slit-frame rounded-lg bg-(--color-card) p-4 font-(family-name:--font-mono) text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word] text-(--color-ash)">
      <code>{children}</code>
    </pre>
  );
}

// A JSON record example with the path label above it, the same pairing
// used by the claim form (domains/<name>.json) and the site profile page.
export function Record({ path, children }) {
  return (
    <div className="slit-bar-l py-1 pl-4">
      <p className="font-(family-name:--font-mono) text-[11px] text-(--color-muted) sm:text-xs">{path}</p>
      <div className="mt-2">
        <Code>{children}</Code>
      </div>
    </div>
  );
}

// A flagged constraint the schema cannot express, styled with the flag
// token rather than the signal one, so it reads as distinct from a normal
// Quote callout.
export function Warning({ children }) {
  return (
    <p className="slit-bar-l slit-bar-flag rounded-r-lg bg-(--color-card) p-4 pl-5 text-sm leading-relaxed text-(--color-ash)">
      {children}
    </p>
  );
}

export function DocList({ items }) {
  return (
    <ul className="slit-rows slit-y">
      {items.map((item) => (
        <li key={item.href}>
          <a
            className="group flex items-baseline justify-between gap-4 py-3 no-underline"
            href={item.href}
          >
            <span>
              <span className="text-sm text-(--color-ink) underline decoration-(--color-rule) underline-offset-4 transition-colors group-hover:decoration-(--color-ink) sm:text-base">
                {item.label}
              </span>
              {item.note && <span className="ml-2 text-sm text-(--color-muted)"> · {item.note}</span>}
            </span>
            <span aria-hidden="true" className="shrink-0 text-(--color-muted) transition-colors group-hover:text-(--color-ink)">→</span>
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
    <p className="slit-bar-l rounded-r-lg bg-(--color-card) p-4 pl-5 text-sm leading-relaxed text-(--color-ash)">
      Two ways to apply this. The quickest is{' '}
      <a className="text-(--color-ink) underline" href="/manage">
        runs-on.dev/manage
      </a>
      : sign in, pick the record type, paste the value, save. It writes the same
      commit to the registry and DNS follows within seconds. The steps below do
      it by pull request instead, which is what you want if you would rather
      review the change first. Either way handles <C>subdomains</C> entries.
    </p>
  );
}
