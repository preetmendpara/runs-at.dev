// A step line, not a smooth curve: the total holds flat until a name is
// claimed, then jumps. Interpolating between points would draw growth on days
// nothing happened, which is exactly the lie a registry chart shouldn't tell.
//
// Hand-rolled SVG rather than a chart library. The dataset is one small array
// of {date, total}, the marks are two paths, and inline SVG picks up the theme
// tokens directly -- so a charting dependency would cost more than it saves.

const W = 720;
const H = 200;
const PAD = 8;

export function GrowthChart({ series }) {
  if (series.length < 2) return null;

  const max = series[series.length - 1].total;
  const span = W - PAD * 2;
  const x = (i) => PAD + (i / (series.length - 1)) * span;
  const y = (total) => H - PAD - (total / Math.max(max, 1)) * (H - PAD * 2);

  let line = `M ${x(0)} ${y(series[0].total)}`;
  for (let i = 1; i < series.length; i += 1) {
    line += ` H ${x(i)} V ${y(series[i].total)}`;
  }
  const area = `${line} V ${H - PAD} H ${x(0)} Z`;

  const first = series[0].date;
  const last = series[series.length - 1].date;

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Cumulative names claimed, ${first} to ${last}, ending at ${max}`}
      >
        <defs>
          {/* The baseline is a slit too: light that fades out at both ends. */}
          <linearGradient id="growth-axis" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f3f3f3" stopOpacity="0" />
            <stop offset="0.18" stopColor="#f3f3f3" stopOpacity="0.35" />
            <stop offset="0.82" stopColor="#f3f3f3" stopOpacity="0.35" />
            <stop offset="1" stopColor="#f3f3f3" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="url(#growth-axis)"
          strokeWidth="1"
        />
        <path d={area} fill="var(--signal)" fillOpacity="0.08" />
        <path
          d={line}
          fill="none"
          stroke="var(--signal)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-2 flex justify-between font-(family-name:--font-mono) text-xs text-(--color-muted)">
        <span>{first}</span>
        <span>
          {max} name{max === 1 ? '' : 's'}
        </span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}
