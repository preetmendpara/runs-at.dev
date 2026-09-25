'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SIDE_RAIL_MIN_WIDTH, sideRailsAllowed } from '../../lib/side-rail-routes.js';

// Two HilltopAds 300x250 zones, one per side, exactly as the provider
// generated them. They are separate zones on purpose: each zone's script
// refuses to render a second time in the same page load (it sets a global
// flag, aaf076 for the left zone and ede896 for the right), so one zone
// cannot fill both rails.
const LEFT_ZONE = String.raw`(function(yoi){
var d = document,
    s = d.createElement('script'),
    l = d.currentScript || d.scripts[d.scripts.length - 1];
s.settings = yoi || {};
s.src = "\/\/conventionalresponse.com\/bAX.Vvs\/dSG\/l\/0sYgWucN\/sewmO9\/u-ZCUslYkrPqTPcy0qNpTokJ2\/MszAM-tJNzzbQp1\/OKTWYMzCN\/wf";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})`;

const RIGHT_ZONE = String.raw`(function(cmsg){
var d = document,
    s = d.createElement('script'),
    l = d.currentScript || d.scripts[d.scripts.length - 1];
s.settings = cmsg || {};
s.src = "\/\/conventionalresponse.com\/b\/XKVssZd.Gcld0gYPWEcU\/reCm_9tujZLUQl\/kFPJT\/ck0_NATvk-2XNHDsk\/tPNNzrQV1\/OzT\/Y\/1\/M\/wV";
s.async = true;
s.referrerPolicy = 'no-referrer-when-downgrade';
l.parentNode.insertBefore(s, l);
})({})`;

// Desktop side rails beside the narrow docs column. Mounted once in the root
// layout, which stays mounted across client-side navigation, so each zone is
// started at most once per page load: after that its slot is only shown or
// hidden, never rebuilt. The rails scroll with the page content and stop above
// the footer, so they never cover the navigation, the footer or the content.
export default function SideAdRails() {
  const pathname = usePathname();
  const [wide, setWide] = useState(false);
  const [onPage, setOnPage] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SIDE_RAIL_MIN_WIDTH}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setOnPage(sideRailsAllowed(pathname, window.location.hostname));
  }, [pathname]);

  const show = wide && onPage;

  return (
    <div aria-hidden={!show} className={show ? 'pointer-events-none absolute inset-0 hidden min-[1680px]:block' : 'hidden'}>
      <Rail side="left" snippet={LEFT_ZONE} active={show} />
      <Rail side="right" snippet={RIGHT_ZONE} active={show} />
    </div>
  );
}

// One reserved 300x250 slot. Its zone script runs the first time the rail is
// actually shown, and never again in this page load.
function Rail({ side, snippet, active }) {
  const slot = useRef(null);

  useEffect(() => {
    const el = slot.current;
    if (!active || !el || el.dataset.loaded) return;
    el.dataset.loaded = '1';
    const script = document.createElement('script');
    script.text = snippet;
    el.appendChild(script);
  }, [active, snippet]);

  // Positioned from the centre of the page: the 768px column spans +/-384px,
  // then a 32px gutter, then the 300px ad.
  const position = side === 'left' ? 'right-[calc(50%+416px)]' : 'left-[calc(50%+416px)]';

  return (
    <aside aria-label="Advertisement" className={`absolute top-0 bottom-0 ${position} w-[300px] pt-16`}>
      <div className="pointer-events-auto sticky top-24">
        <p className="meta mb-2">Advertisement</p>
        <div ref={slot} className="slit-frame h-[250px] w-[300px] overflow-hidden rounded-lg" />
      </div>
    </aside>
  );
}
