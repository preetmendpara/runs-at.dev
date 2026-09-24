'use client';

import { useRef } from 'react';
import HeroScene from './hero-scene.jsx';

// Full-bleed host for the hero and the scene behind it. The hero section
// itself is width-capped, so the canvas lives out here instead: spanning the
// whole row without a w-screen, which would count the scrollbar and push the
// page into horizontal scroll.
//
// `isolate` gives the stage its own stacking context, so the canvas can sit
// at -z-10 behind the hero without falling behind the page background.
// The stage is also the scene's event source: pointer events on it reach
// both the hero's own controls and the 3D nodes behind them.
export default function HeroStage({ children }) {
  const ref = useRef(null);
  return (
    <div ref={ref} className="relative isolate">
      <HeroScene eventSource={ref} />
      {children}
    </div>
  );
}
