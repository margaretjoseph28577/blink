import { useRef, useState } from 'react';

/**
 * Two-series palette for the circulation trend. Validated with the dataviz
 * palette checker (light surface): CVD ΔE 15.5, normal-vision ΔE 18.0, both ≥ 3:1.
 */
export const TREND_SERIES = {
  issued: { label: 'Books issued', color: '#4173b3' },
  returned: { label: 'Books returned', color: '#059669' },
} as const;

export interface TrendPoint {
  date: string;
  issued: number;
  returned: number;
}

type SeriesKey = keyof typeof TREND_SERIES;
const SERIES_KEYS: SeriesKey[] = ['issued', 'returned'];

/** Smallest "nice" tick step that keeps the axis to ≤ 4 intervals. */
function niceStep(max: number): number {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return candidates.find((s) => max / s <= 4) ?? Math.ceil(max / 4);
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const W = 640;
const H = 220;
const PAD = { l: 34, r: 16, t: 16, b: 26 };
const BAR_MAX = 18; // px — thin marks; the slot's leftover is air
const BAR_GAP = 3; // surface gap between the two columns of a day

/** Rounded-cap column: square at the baseline, 4px radius on the data end. */
function columnPath(x: number, w: number, yTop: number, yBase: number): string {
  const r = Math.min(4, w / 2, Math.max(0, yBase - yTop));
  return [
    `M${x},${yBase}`,
    `V${yTop + r}`,
    `Q${x},${yTop} ${x + r},${yTop}`,
    `H${x + w - r}`,
    `Q${x + w},${yTop} ${x + w},${yTop + r}`,
    `V${yBase}`,
    'Z',
  ].join(' ');
}

/**
 * Issued vs returned per day as grouped columns — discrete daily counts read
 * better as columns than as lines (small integers zig-zag as a line). Hover band
 * + tooltip, legend below, hairline grid, nice integer ticks.
 */
export function TrendChart({ days }: { days: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const n = Math.max(1, days.length);
  const slot = iw / n;
  const barW = Math.min(BAR_MAX, (slot * 0.62 - BAR_GAP) / 2);
  const groupW = barW * 2 + BAR_GAP;

  const maxV = Math.max(1, ...days.flatMap((d) => [d.issued, d.returned]));
  const step = niceStep(maxV);
  const top = Math.max(step, Math.ceil(maxV / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  const slotX = (i: number) => PAD.l + i * slot;
  const center = (i: number) => slotX(i) + slot / 2;
  const barX = (i: number, key: SeriesKey) => center(i) - groupW / 2 + (key === 'issued' ? 0 : barW + BAR_GAP);
  const y = (v: number) => PAD.t + ih - (v / top) * ih;
  const baseline = y(0);

  const last = days.length - 1;
  const quiet = days.every((d) => d.issued === 0 && d.returned === 0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || days.length === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((px - PAD.l) / slot);
    setHover(i >= 0 && i < days.length ? i : null);
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full select-none"
        role="img"
        aria-label="Books issued and returned per day, last 7 days"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* hover band behind the day's columns */}
        {hover !== null && (
          <rect x={slotX(hover)} y={PAD.t - 6} width={slot} height={ih + 6} rx={6} fill="#f1f5f9" />
        )}
        {/* gridlines + y ticks: hairline, solid, recessive */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#cbd5e1' : '#e8ecf2'} strokeWidth={1} />
            <text
              x={PAD.l - 8}
              y={y(v)}
              dy="0.35em"
              textAnchor="end"
              fontSize={11}
              fill="#94a3b8"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {v.toLocaleString()}
            </text>
          </g>
        ))}
        {/* x labels */}
        {days.map((d, i) => (
          <text
            key={d.date}
            x={center(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={11}
            fontWeight={i === last ? 600 : 400}
            fill={i === last ? '#475569' : '#94a3b8'}
          >
            {i === last ? 'Today' : shortDay(d.date)}
          </text>
        ))}
        {/* columns */}
        {days.map((d, i) =>
          SERIES_KEYS.map((key) =>
            d[key] > 0 ? (
              <path
                key={`${key}-${d.date}`}
                d={columnPath(barX(i, key), barW, y(d[key]), baseline)}
                fill={TREND_SERIES[key].color}
                opacity={hover === null || hover === i ? 1 : 0.55}
                style={{ transition: 'opacity .12s' }}
              />
            ) : null,
          ),
        )}
      </svg>

      {hover !== null && days[hover] && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(center(hover) / W) * 100}%` }}
        >
          <div className="mb-1 font-semibold text-slate-700">{shortDay(days[hover].date)}</div>
          {SERIES_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2 text-slate-600">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TREND_SERIES[key].color }} />
              <span className="flex-1">{TREND_SERIES[key].label}</span>
              <span className="font-semibold tabular-nums text-slate-800">{days[hover][key]}</span>
            </div>
          ))}
        </div>
      )}

      {quiet && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-slate-400">
          No circulation in the last 7 days
        </div>
      )}

      <div className="mt-2 flex items-center justify-center gap-6 text-xs font-medium text-slate-500">
        {SERIES_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TREND_SERIES[key].color }} />
            {TREND_SERIES[key].label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Ranked horizontal bars for part-to-whole — one hue for every real category
 * (colour would only restate the length), the folded "Others" tail in gray.
 */
export function CategoryBars({ rows }: { rows: { category: string; copies: number }[] }) {
  const total = rows.reduce((s, r) => s + r.copies, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.copies));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const isOther = r.category === 'Others';
        return (
          <li key={r.category}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700" title={r.category}>
                {r.category}
              </span>
              <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                <span className="font-semibold text-slate-700">{r.copies.toLocaleString()}</span>
                {' · '}
                {Math.round((r.copies / total) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full">
              <div
                className={`h-full rounded-r ${isOther ? 'bg-slate-300' : 'bg-indigo-500'}`}
                style={{ width: `${Math.max(2, (r.copies / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
