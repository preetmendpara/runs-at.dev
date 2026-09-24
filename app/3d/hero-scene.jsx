'use client';

import { Component, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { hasWebGL, detectTier } from './config.js';
import { prefersReducedMotion } from '../motion/config.js';

// three.js, fiber and drei are only fetched once the gate below has decided
// to render. A visitor without WebGL never downloads them.
const Scene = dynamic(() => import('./scene.jsx'), { ssr: false });

// The 3D layer behind the homepage hero. Everything it shows is decorative:
// the hostname, the claim form and the explanation of the pipeline are all
// ordinary DOM on top of it. So every failure mode ends the same way -- this
// renders nothing and the 2D page is exactly what it was before.
export default function HeroScene({ eventSource }) {
  // Null on the server and on first client render, so the markup matches
  // and there is nothing to hydrate. The decision is made after mount.
  const [gate, setGate] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) return;
    setGate({ tier: detectTier(), still: prefersReducedMotion() });
  }, []);

  if (!gate) return null;

  return (
    <div
      aria-hidden="true"
      // Phones reserve 40px on the right for the side dock (the pr-10 on the
      // page wrapper). The canvas extends into that strip, so the atmosphere
      // runs to the screen edge under the dock instead of stopping in a hard
      // line 40px short of it. The network itself is laid out inside the
      // hero's own box, so no node or line lands under the dock. The strip is
      // inside the viewport, so this adds no horizontal scroll.
      className="three-stage pointer-events-none absolute inset-y-0 left-0 -right-10 -z-10 sm:right-0"
      // Fades in once the first frame exists, so the canvas never appears as
      // an empty black rectangle while three.js initialises.
      data-ready={ready ? 'true' : 'false'}
    >
      <SceneBoundary>
        <Scene tier={gate.tier} still={gate.still} eventSource={eventSource} onReady={() => setReady(true)} />
      </SceneBoundary>
    </div>
  );
}

// A lost GPU context, a shader that fails to compile on some driver, a chunk
// that fails to load: any of them throws inside the canvas. Caught here, the
// failure takes the decoration with it and nothing else.
class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
