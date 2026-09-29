// The wordmark is a plain link home: a pixel prompt mark (the same drawing
// as app/icon.svg -- an ink chevron and a vermilion block cursor on paper,
// drawn on a 4px grid) beside the name set in mono. Upstream counted triple
// taps here to flip the claim map into an alternate artwork; runs-at.dev
// ships without that artwork, so that behaviour is gone.
export function LogoMark({ className = '' }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" shapeRendering="crispEdges" className={className}>
      <rect width="32" height="32" fill="var(--ink)" />
      <rect x="2" y="2" width="28" height="28" fill="var(--paper)" />
      <g fill="var(--ink)">
        <rect x="7" y="8" width="4" height="4" />
        <rect x="10" y="11" width="4" height="4" />
        <rect x="13" y="14" width="4" height="4" />
        <rect x="10" y="17" width="4" height="4" />
        <rect x="7" y="20" width="4" height="4" />
      </g>
      <rect x="18" y="20" width="8" height="4" fill="var(--accent)" />
    </svg>
  );
}

export default function Wordmark() {
  return (
    <a
      href="/"
      className="group flex shrink-0 items-center gap-2 font-(family-name:--font-mono) text-[13px] font-medium tracking-[0.02em] text-(--color-ink) no-underline sm:text-[15px]"
    >
      <LogoMark className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
      <span className="border-b-2 border-transparent group-hover:border-(--color-accent)">
        runs-at<span className="text-(--color-muted)">.dev</span>
      </span>
    </a>
  );
}
