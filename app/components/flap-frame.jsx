// Wraps a map visual. Upstream runs-on.dev flipped it into its own ASCII
// artwork here as a wordmark easter egg; runs-at.dev ships without that
// artwork, so the frame only renders the map. The [data-claim-map] marker
// stays because the wordmark probes for it before dispatching its event.
export default function FlapFrame({ children }) {
  return (
    <div className="relative" data-claim-map>
      {children}
    </div>
  );
}
