'use client';

import { useEffect, useRef } from 'react';

// HilltopAds zone "runs-at-main-banner" (MultiTag Banner 300x250), exactly as
// the provider generated it. It locates itself with document.currentScript
// and inserts the ad script beside itself, so running it inside the box below
// makes the ad render in that box.
const HILLTOP_SNIPPET = String.raw`(function(ommp){
var d = document,
    s = d.createElement('script'),
    l = d.currentScript || d.scripts[d.scripts.length - 1];
s.settings = ommp || {};
s.src = "\/\/conventionalresponse.com\/bUXMVQs.dRG-lP0\/YZWYcF\/heom\/9cuvZ\/Uzl\/koP_TMcy0\/NfTsk\/zgN\/DXkitWNPzFQM1OOpTQMG1dM\/wp";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})`;

// One 300x250 banner. The box is reserved before anything loads, so the ad
// arriving never moves the page, and the provider's code only runs once the
// box is near the viewport, so it costs nothing on the first render.
export default function AdBanner() {
  const slot = useRef(null);

  useEffect(() => {
    const el = slot.current;
    if (!el) return undefined;
    let done = false;
    const load = () => {
      if (done || el.dataset.loaded) return;
      done = true;
      el.dataset.loaded = '1';
      const script = document.createElement('script');
      script.text = HILLTOP_SNIPPET;
      el.appendChild(script);
    };
    if (!('IntersectionObserver' in window)) {
      load();
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <aside aria-label="Advertisement" className="mx-auto mt-16 flex w-full max-w-[300px] flex-col items-center">
      <p className="meta mb-2 self-start">Advertisement</p>
      <div
        ref={slot}
        className="slit-frame h-[250px] w-[300px] max-w-full overflow-hidden rounded-lg"
      />
    </aside>
  );
}
