'use client';

import { useRef } from 'react';
import { Confetti } from '@/components/ui/confetti';

// Firework cadence from the Magic UI preset (twin side bursts repeating over
// a short run), the star particles printed in the site's own inks --
// vermilion, carbon, lamp-black, link blue and cream -- rather than a rainbow.
const PRINT_STARS = ['#CF4A1F', '#17171A', '#2E2A25', '#2A4D9B', '#E3DDCF'];

const STAR_BURST = {
  shapes: ['star'],
  colors: PRINT_STARS,
  scalar: 1.3,
  spread: 360,
  startVelocity: 32,
  decay: 0.95,
  gravity: 0.35,
  ticks: 150,
  zIndex: 50,
};

// globals.css honours prefers-reduced-motion for everything the stylesheet
// can reach, but these particles are painted into a canvas, where CSS cannot
// follow. The guard has to live here or the site quietly breaks its own
// promise for the visitors who asked for it. A single burst still marks the
// click, so the card keeps its affordance.
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function fireStarWorks(confettiRef) {
  if (prefersReducedMotion()) {
    confettiRef.current?.fire({
      ...STAR_BURST,
      particleCount: 24,
      ticks: 60,
      origin: { x: 0.5, y: 0.5 },
    });
    return;
  }

  const duration = 2600;
  const animationEnd = Date.now() + duration;
  const randomInRange = (min, max) => Math.random() * (max - min) + min;
  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      window.clearInterval(interval);
      return;
    }
    const particleCount = 50 * (timeLeft / duration);
    confettiRef.current?.fire({
      ...STAR_BURST,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confettiRef.current?.fire({
      ...STAR_BURST,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}

// The primary readout figure, clickable: a click fires white star fireworks
// from the screen edges. Fills its readout cell; the global focus ring marks
// keyboard focus.
export default function ConfettiStat({ value, label }) {
  const confettiRef = useRef(null);

  return (
    <>
      <Confetti
        ref={confettiRef}
        manualstart
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      />
      <button
        type="button"
        onClick={() => fireStarWorks(confettiRef)}
        aria-label={`${label}: ${value}. Activate for confetti.`}
        className="block h-full w-full cursor-pointer p-5 text-left hover:bg-(--color-paper) sm:p-8"
      >
        <div className="meta whitespace-nowrap">{label}</div>
        <div
          className="mt-6 text-[clamp(5rem,26vw,11rem)] leading-[0.85] text-(--color-ink) sm:text-[clamp(6rem,14vw,11rem)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {value}
        </div>
      </button>
    </>
  );
}
