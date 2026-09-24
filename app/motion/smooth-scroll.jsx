'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { gsap, ScrollTrigger } from './gsap.js';
import { prefersReducedMotion, hasFinePointer } from './config.js';

// Lenis smooths the wheel/keyboard scroll it already received. It does not
// hijack direction, distance or target: a wheel notch still travels the
// distance the OS asked for, it just arrives over a few frames instead of
// one. Anchor links, Home/End, space, find-in-page and the scrollbar all keep
// working, which is the line between smoothing and scroll-jacking.
//
// Mounted once in the root layout. It renders nothing.
export default function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    // Touch devices keep native scrolling. Momentum there is implemented by
    // the OS compositor off the main thread; replacing it with a JS loop is
    // measurably worse on a phone, and it breaks pull-to-refresh and the
    // address-bar collapse. Reduced motion opts out for the obvious reason.
    if (prefersReducedMotion() || !hasFinePointer()) return;

    let lenis;
    let cancelled = false;

    // Loaded on demand so the ~10KB never reaches a phone or a visitor who
    // asked for reduced motion -- the two cases that would not use it.
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;

      lenis = new Lenis({
        // ~0.5s to settle. High enough to feel smoothed, low enough that the
        // page still lands where the wheel said it would.
        lerp: 0.12,
        wheelMultiplier: 1,
        // Anything inside an overflow container (the DNS table on a narrow
        // window, a code block) scrolls natively.
        prevent: (node) => node.hasAttribute?.('data-lenis-prevent'),
      });

      // One RAF loop for the whole page: GSAP's ticker drives Lenis instead
      // of Lenis running a second loop of its own. Two independent loops is
      // how scroll-linked animation ends up a frame behind the scroll.
      const raf = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      lenis.on('scroll', ScrollTrigger.update);

      lenis._teardown = () => {
        gsap.ticker.remove(raf);
        gsap.ticker.lagSmoothing(500, 33);
      };
    });

    return () => {
      cancelled = true;
      lenis?._teardown?.();
      lenis?.destroy();
    };
  }, []);

  // A client-side navigation replaces the document's content while
  // ScrollTrigger still holds start/end positions measured against the old
  // one. Every trigger is recalculated after the new route paints, which is
  // also what stops a reveal from firing at the wrong scroll offset.
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return null;
}
