// One place for every duration, easing and capability check the motion layer
// uses, so timing stays consistent across pages and a change lands everywhere
// at once. Values are seconds, because that is what GSAP takes.

// Micro: hover, focus, press, small state flips. Fast enough to read as
// response rather than animation.
export const MICRO = 0.2;

// Reveal: an element arriving. Long enough to be deliberate, short enough
// that scrolling never waits on it.
export const REVEAL = 0.55;

// Hero: the one place a longer beat is justified, because it is the first
// thing rendered and nothing is competing with it.
export const HERO = 0.7;

// Distance an element travels on entry. Deliberately small: the motion is
// meant to direct the eye, not to move furniture.
export const RISE = 14;

// A single ease everywhere. Decelerating, no overshoot -- an infrastructure
// tool should not bounce.
export const EASE = 'power2.out';

// Gap between staggered siblings. Below ~60ms a stagger reads as a single
// event; much above ~120ms it reads as a queue.
export const STAGGER = 0.08;

// Reduced motion is read live rather than cached: a visitor can flip the OS
// setting without reloading, and the next reveal should respect it.
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Pointer-based effects (hover lifts, magnetic pulls) are meaningless without
// a hover-capable pointer and actively harmful on touch, where they fire on
// tap and leave an element stuck in its hover state.
export function hasFinePointer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
