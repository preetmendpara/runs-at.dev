'use client';

import { useEffect, useState } from 'react';
import { Canvas, advance } from '@react-three/fiber';
import { gsap, ScrollTrigger } from '../motion/gsap.js';
import { NODES, EDGES, TIERS, FALLBACK_ANCHOR, FOV } from './config.js';

const FULL_REGION = { x: 0, y: 0, w: 1, h: 1 };
import { sceneState } from './use-scene-state.js';
import Network, { Particles } from './network.jsx';
import CameraRig from './camera.jsx';

// The canvas and its clock. Loaded only on the client, and only after the
// capability gate in hero-scene.jsx has decided WebGL is present, so three.js
// never reaches the server bundle or a browser that cannot use it.
//
// One clock for the whole site: the canvas runs with frameloop="never" and
// is advanced from GSAP's ticker -- the same ticker that already drives
// Lenis. Three.js, Lenis and every tween share one requestAnimationFrame,
// so a scroll, a tween and a rendered frame always agree on the time.
export default function Scene({ tier: tierName, still, eventSource, onReady }) {
  const tier = TIERS[tierName];
  const [anchor, setAnchor] = useState(FALLBACK_ANCHOR);
  const [region, setRegion] = useState(FULL_REGION);

  // Three boxes, all measured against the canvas itself:
  //
  //   canvas -- may be wider than the content (see hero-scene.jsx)
  //   region -- the hero's own box ([data-scene-region]); nodes are laid out
  //             inside it, so they frame the content, not the canvas edges
  //   anchor -- the hostname ([data-scene-anchor]); the ports meet its ends
  //
  // Re-measured whenever any of them changes size -- which includes the name
  // shrinking as a long one is typed, since the hero scales its type down.
  // Never measured per frame.
  useEffect(() => {
    const stage = eventSource.current;
    const canvasBox = () => stage.querySelector('.three-stage');
    const measure = () => {
      const box = canvasBox();
      if (!box) return;
      const c = box.getBoundingClientRect();
      if (!c.width || !c.height) return;
      const frac = (r) => ({ x: (r.left - c.left) / c.width, y: (r.top - c.top) / c.height, w: r.width / c.width, h: r.height / c.height });

      const regionEl = stage.querySelector('[data-scene-region]');
      setRegion(regionEl ? frac(regionEl.getBoundingClientRect()) : FULL_REGION);

      const el = stage.querySelector('[data-scene-anchor]');
      if (!el) return setAnchor(FALLBACK_ANCHOR);
      // The marked element may be a full-width flex row; the name is only
      // as wide as its children. Measure their union, not the row.
      const rects = (el.children.length ? [...el.children] : [el]).map((p) => p.getBoundingClientRect());
      const left = Math.min(...rects.map((x) => x.left));
      const right = Math.max(...rects.map((x) => x.right));
      const top = Math.min(...rects.map((x) => x.top));
      const bottom = Math.max(...rects.map((x) => x.bottom));
      setAnchor({
        fx: ((left + right) / 2 - c.left) / c.width,
        fy: ((top + bottom) / 2 - c.top) / c.height,
        fw: (right - left) / c.width,
        fh: (bottom - top) / c.height,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    for (const sel of ['.three-stage', '[data-scene-region]', '[data-scene-anchor]']) {
      const el = stage.querySelector(sel);
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [eventSource]);

  // Pointer, written straight into sceneState. A window listener rather than
  // canvas events: the canvas sits under the hero content and never receives
  // pointer events itself, and the camera should lean even when the pointer
  // is over the headline.
  useEffect(() => {
    if (still || !tier.pointer) return;
    const onMove = (e) => {
      sceneState.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      sceneState.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      sceneState.pointer.x = sceneState.pointer.y = 0;
    };
  }, [still, tier.pointer]);

  // The clock. Only runs while the hero is on screen: past it, nothing is
  // visible, so rendering would be pure cost. The tab-hidden case needs no
  // code -- GSAP's ticker already stops when the page is hidden.
  useEffect(() => {
    if (still) return;
    const tick = (time) => advance(time * 1000);
    let running = false;
    const start = () => { if (!running) { gsap.ticker.add(tick); running = true; } };
    const stop = () => { if (running) { gsap.ticker.remove(tick); running = false; } };

    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()));
    io.observe(eventSource.current);
    return () => { io.disconnect(); stop(); };
  }, [still, eventSource]);

  // The choreography hook, used once so it is known to work: as the hero
  // scrolls away the camera eases back and down, as if the view were lifting
  // off the network toward the rest of the page. Scrubbed, so it tracks the
  // scroll exactly and reverses on the way up. Later sections add their own
  // tweens on sceneState the same way.
  useEffect(() => {
    if (still) return;
    const base = { ...sceneState.camera };
    const tween = gsap.to(sceneState.camera, {
      z: base.z + 3,
      y: base.y - 0.8,
      lookY: base.lookY - 0.4,
      ease: 'none',
      scrollTrigger: { trigger: eventSource.current, start: 'top top', end: 'bottom top', scrub: true },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      Object.assign(sceneState.camera, base);
    };
  }, [still, eventSource]);

  return (
    <Canvas
      // "never": frames come only from the GSAP ticker above. "demand" for a
      // still scene: it draws once when mounted and whenever it is resized,
      // and otherwise costs nothing at all.
      frameloop={still ? 'demand' : 'never'}
      dpr={[1, tier.dprMax]}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 0, sceneState.camera.z] }}
      gl={{ antialias: tier.antialias, alpha: true, powerPreference: 'low-power' }}
      eventSource={eventSource}
      eventPrefix="client"
      onCreated={() => {
        // ScrollTrigger measured the page before the canvas existed; the
        // hero's height has not changed, but re-measuring is cheap and makes
        // the camera tween start at the right offset regardless.
        ScrollTrigger.refresh();
        onReady?.();
      }}
    >
      <CameraRig parallax={!still && tier.pointer} />
      <Particles count={tier.particles} />
      <Network nodes={NODES} edges={EDGES} anchor={anchor} region={region} interactive={!still && tier.pointer} pulses={!still && tier.pulses} />
    </Canvas>
  );
}
