'use client';

import { useRef } from 'react';

// The wordmark still goes home on a normal click (after a half-second beat,
// so the click count can settle). Three quick taps inside 1.2 seconds
// instead flip the claim map into its alternate artwork. It is an easter
// egg, so it lives on click counting rather than a visible control; pages
// without a claim map get the normal navigation. The tap log and the nav
// timer are refs, not locals: a parent re-render mid-sequence must never
// reset the count.
const TRIPLE_TAP_MS = 1200;

export default function Wordmark() {
  const taps = useRef([]);
  const navTimer = useRef(null);

  function onClick(event) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    clearTimeout(navTimer.current);

    const now = Date.now();
    taps.current = taps.current.filter((t) => now - t < TRIPLE_TAP_MS);
    taps.current.push(now);

    if (taps.current.length >= 3) {
      taps.current = [];
      if (document.querySelector('[data-claim-map]')) {
        window.dispatchEvent(new CustomEvent('runs-on:flipmap'));
        return;
      }
    }

    navTimer.current = setTimeout(() => {
      taps.current = [];
      window.location.href = '/';
    }, 500);
  }

  return (
    <a
      href="/"
      onClick={onClick}
      className="text-[18px] tracking-[-0.01em] text-(--color-ink) no-underline"
    >
      runs-on<span className="text-(--color-muted)">.dev</span>
    </a>
  );
}
