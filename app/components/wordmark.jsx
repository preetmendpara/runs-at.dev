// The wordmark is a plain link home, set as a system identifier: mono,
// in a square ink tag. Upstream counted triple taps here to flip the claim
// map into an alternate artwork; runs-at.dev ships without that artwork, so
// the counting, the event it dispatched and the half-second navigation
// delay it needed to settle the click count are all gone.
export default function Wordmark() {
  return (
    <a
      href="/"
      className="shrink-0 border border-(--color-ink) px-1.5 py-1 font-(family-name:--font-mono) text-[13px] font-medium sm:px-2 sm:text-[15px] text-(--color-ink) no-underline"
    >
      runs-at<span className="text-(--color-muted)">.dev</span>
    </a>
  );
}
