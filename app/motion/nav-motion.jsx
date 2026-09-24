'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap } from './gsap.js';
import { prefersReducedMotion, MICRO, EASE } from './config.js';

// Wraps the existing header markup. It adds two things and changes nothing
// about what the nav contains or how its links behave:
//
//   1. a one-time entrance, so the bar settles in rather than appearing
//   2. a scrolled state, which the header's own CSS reads via data-scrolled
//
// The bar never moves or resizes on scroll -- only the rule under it gains
// weight. A nav that shrinks or lifts as you scroll pushes the content under
// it around, which is the "jumping" this is meant to avoid.
export default function NavMotion({ children, className = '' }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      if (!prefersReducedMotion()) {
        // -8px, once. Small enough that a visitor reads it as the page
        // arriving rather than as the nav doing a trick.
        gsap.fromTo(
          el,
          { opacity: 0, y: -8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: EASE,
            clearProps: 'transform',
          },
        );
      }
    }, ref);

    // Scroll state is a data attribute, not a style write: the listener does
    // no measuring beyond window.scrollY (which never forces layout) and sets
    // the attribute only when the boolean actually flips, so a long scroll
    // costs one DOM write, not one per frame.
    let scrolled = false;
    const onScroll = () => {
      const next = window.scrollY > 8;
      if (next === scrolled) return;
      scrolled = next;
      el.dataset.scrolled = next ? 'true' : 'false';
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      ctx.revert();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-nav
      className={className}
      style={{ transition: `background-color ${MICRO}s ease` }}
    >
      {children}
    </div>
  );
}
