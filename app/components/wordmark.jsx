// The wordmark is a plain link home. Upstream counted triple taps here to
// flip the claim map into an alternate artwork; runs-at.dev ships without
// that artwork, so the counting, the event it dispatched and the half-second
// navigation delay it needed to settle the click count are all gone.
export default function Wordmark() {
  return (
    <a
      href="/"
      className="text-[18px] tracking-[-0.01em] text-(--color-ink) no-underline"
    >
      runs-at<span className="text-(--color-muted)">.dev</span>
    </a>
  );
}
