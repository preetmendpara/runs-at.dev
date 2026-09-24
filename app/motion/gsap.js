'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// GSAP is registered exactly once, here. Every motion module imports `gsap`
// from this file rather than from the package, so a plugin can never be
// registered twice and no component has to remember to do it.
//
// registerPlugin is idempotent in GSAP, but the single import point matters
// for a second reason: ScrollTrigger reads the scroller on first use, and the
// Lenis bridge in smooth-scroll.jsx has to talk to the SAME ScrollTrigger
// instance this file exports.
let registered = false;
if (typeof window !== 'undefined' && !registered) {
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export { gsap, ScrollTrigger };
