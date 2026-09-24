'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap } from './gsap.js';
import { prefersReducedMotion, REVEAL, RISE, EASE, STAGGER } from './config.js';

// The one reveal primitive. Everything on the site that arrives -- a hero
// line, a section, a card, a table row -- goes through this, so timing and
// easing cannot drift apart page to page.
//
// It is a client component wrapping server-rendered children. The children
// stay server components; only the wrapper ships JS, so a reveal costs a div
// and nothing else in the payload.
//
// `data-reveal` on the wrapper is what globals.css uses to hold the element
// at opacity 0 before hydration, which is what stops a flash of fully
// visible content that then fades in. A <noscript> override in the layout
// puts it back for a visitor without JS.
export default function Reveal({
  children,
  as: Tag = 'div',
  // Reveal on scroll (default), or immediately on mount -- for above-the-fold
  // content, which would otherwise wait for a scroll that never comes.
  immediate = false,
  delay = 0,
  duration = REVEAL,
  y = RISE,
  // Animate the wrapper's direct children in sequence instead of the wrapper
  // itself. The wrapper is revealed instantly so its layout never shifts.
  stagger = false,
  className = '',
  ...rest
}) {
  const ref = useRef(null);

  // useLayoutEffect, not useEffect: the initial hidden state must be set
  // before the browser paints, or the element flashes at full opacity for a
  // frame. React warns about this on the server, which is why the whole
  // component is client-only.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion: show everything, immediately, with no transition. The
    // CSS rule already un-hides it, so this only has to not animate.
    if (prefersReducedMotion()) {
      gsap.set(el, { clearProps: 'all' });
      return;
    }

    // gsap.context scopes every selector and tween created inside it to this
    // element, and ctx.revert() on unmount kills the tweens, removes the
    // inline styles GSAP wrote, and disposes the ScrollTrigger. That single
    // call is the entire cleanup story -- there is no manual kill list to
    // keep in sync.
    const ctx = gsap.context(() => {
      const targets = stagger ? Array.from(el.children) : el;
      if (stagger) gsap.set(el, { opacity: 1 });

      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: EASE,
          stagger: stagger ? STAGGER : 0,
          // Transform and opacity only: both are compositor properties, so a
          // reveal never triggers layout or paint on the main thread.
          force3D: true,
          // Leaving the transform behind would create a containing block for
          // every descendant, which breaks position: fixed inside a revealed
          // section. Clearing it once the tween lands avoids that.
          clearProps: 'transform',
          ...(immediate
            ? {}
            : {
                scrollTrigger: {
                  trigger: el,
                  // Fires when the element is ~12% into the viewport: late
                  // enough to be deliberate, early enough that a fast
                  // scroller never catches it mid-fade.
                  start: 'top 88%',
                  once: true,
                },
              }),
        },
      );
    }, ref);

    return () => ctx.revert();
  }, [immediate, delay, duration, y, stagger]);

  return (
    <Tag ref={ref} data-reveal className={className} {...rest}>
      {children}
    </Tag>
  );
}
