'use client';

import { useEffect, useState } from 'react';

// Split-flap grid: 28 x 8 tiles stretched over the wrapped content's exact
// box. Each tile is two halves hinged at the centre (top half rotates from
// its bottom edge, bottom half from its top edge), flipping in with a
// column-then-row stagger like an airport board.
const TILES_X = 28;
const TILES_Y = 8;
const SWEEP_IN_MS = 2400;
const SWEEP_OUT_MS = 2000;
const ART_HOLD_MS = 5000;

const TILES = [];
for (let j = 0; j < TILES_Y; j++) {
  for (let i = 0; i < TILES_X; i++) {
    TILES.push({ i, j, delay: i * 45 + j * 25 });
  }
}

// Cover-fit geometry: the artwork is wider than the frame, so it is scaled
// by the aspect quotient until its height fills the box; the overflow crops
// symmetrically. Everything is in percentages of a tile half, which is why
// the img is taller-wider than 100% and shifted by LEFT_BASE tile widths.
const ART_ASPECT = 2048 / 593;
const MAP_ASPECT = 1120 / 500;
const IMG_W_PCT = 100 * TILES_X * (ART_ASPECT / MAP_ASPECT);
const LEFT_BASE = (TILES_X / 2) * (1 - ART_ASPECT / MAP_ASPECT);

// Wraps a map visual with the wordmark easter egg: three quick taps on the
// wordmark flip whatever children render here into the alternate artwork
// through the split-flap sweep, hold it for five seconds, then peel back.
// Every phase transition is owned by the effect below with cleanup, so no
// sequence of taps can strand a phase. The [data-claim-map] marker is what
// the wordmark probes before dispatching, which is why it must wrap the map
// itself.
export default function FlapFrame({ children }) {
  // map -> to-art -> art -> to-map -> map
  const [phase, setPhase] = useState('map');

  useEffect(() => {
    if (phase === 'to-art') {
      const t = setTimeout(() => setPhase('art'), SWEEP_IN_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'art') {
      const t = setTimeout(() => setPhase('to-map'), ART_HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === 'to-map') {
      const t = setTimeout(() => setPhase('map'), SWEEP_OUT_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    const flip = () => {
      setPhase((p) => {
        if (p === 'map') return 'to-art';
        if (p === 'art') return 'to-map';
        return p; // a sweep already in flight swallows further taps
      });
    };
    window.addEventListener('runs-on:flipmap', flip);
    return () => window.removeEventListener('runs-on:flipmap', flip);
  }, []);

  // Only the settled artwork hides the wrapped content. During both sweeps
  // it stays visible behind the tiles, so the way back reads as the map
  // being revealed, not an empty canvas.
  const showingArt = phase === 'art';

  return (
    <div className="relative" data-claim-map>
      <div
        className="transition-opacity duration-700"
        style={{ opacity: showingArt ? 0 : 1 }}
      >
        {children}
      </div>

      {phase !== 'map' && (
        <div aria-hidden="true" data-flap-phase={phase} className="pointer-events-none absolute inset-0 z-10">
          <div
            className={`flap-grid h-full w-full ${phase === 'to-art' ? 'flap-in' : phase === 'to-map' ? 'flap-out' : 'flap-rest'}`}
            style={{
              gridTemplateColumns: `repeat(${TILES_X}, 1fr)`,
              gridTemplateRows: `repeat(${TILES_Y}, 1fr)`,
            }}
          >
              {TILES.map(({ i, j, delay }) => (
                <div key={`${i}-${j}`} className="flap-tile" style={{ '--d': `${delay}ms` }}>
                  <div className="flap-half flap-top">
                    <img
                      src="/ascii-art.png"
                      alt=""
                      style={{
                        width: `${IMG_W_PCT}%`,
                        height: `${TILES_Y * 2 * 100}%`,
                        left: `${(LEFT_BASE - i) * 100}%`,
                        top: `${-j * 200}%`,
                      }}
                    />
                  </div>
                  <div className="flap-half flap-bottom">
                    <img
                      src="/ascii-art.png"
                      alt=""
                      style={{
                        width: `${IMG_W_PCT}%`,
                        height: `${TILES_Y * 2 * 100}%`,
                        left: `${(LEFT_BASE - i) * 100}%`,
                        top: `${-j * 200 - 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
