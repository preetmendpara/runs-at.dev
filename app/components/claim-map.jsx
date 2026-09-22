'use client';

import { useState } from 'react';
import { DotMap, ContinentChart } from './ui.jsx';
import FlapFrame from './flap-frame.jsx';

// The claim map as one interactive unit: the dot-matrix world carries the
// heat and the split-flap easter egg (FlapFrame), and the continent cards
// beneath it filter it. The selection lives here so the map and the cards
// can never disagree.
export default function ClaimMap({ points, total, heading = false }) {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <FlapFrame>
        <DotMap points={points} filter={selected} className="h-auto w-full" />
      </FlapFrame>
      <div className={heading ? 'mx-auto max-w-[900px] px-6 pt-10 pb-4' : 'mt-6'}>
        <ContinentChart
          heading={heading}
          points={points}
          total={total}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </div>
  );
}
