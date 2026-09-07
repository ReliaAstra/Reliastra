'use client';

import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type Point = { t: string; v: number };

/**
 * Latency / measurement plot.
 *
 * Hand-rolled SVG rather than a charting library: these are single-series
 * line plots with one threshold rule, and pulling a full chart runtime into
 * the console for that is the kind of weight section 26 rules out. Recharts
 * stays available for anything genuinely interactive.
 *
 * Accessibility: the drawing is `aria-hidden` and the same data is exposed as
 * a real `<table>` in a `<details>` underneath. A screen-reader user gets the
 * numbers, not a description of a picture.
 */
export function Plot({
  points,
  unit = 'ms',
  threshold,
  height = 132,
  label,
  state = 'ok',
  formatValue = (v: number) => String(Math.round(v)),
  formatTime,
}: {
  points: Point[];
  unit?: string;
  /** Draws a dashed rule — e.g. the configured alert threshold. */
  threshold?: number | null;
  height?: number;
  label: string;
  state?: 'ok' | 'warn' | 'crit';
  formatValue?: (v: number) => string;
  formatTime?: (t: string) => string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

  /**
   * Axis labels carry a date once the window is longer than half a day.
   * Without this a 24-hour series printed the same `18:10 UTC` at both ends,
   * which reads as a plot of nothing.
   */
  const fmtTime = useMemo(() => {
    if (formatTime) return formatTime;
    const span =
      points.length > 1
        ? new Date(points[points.length - 1].t).getTime() - new Date(points[0].t).getTime()
        : 0;
    const withDate = span > 12 * 3600_000;
    return (t: string) => {
      const iso = new Date(t).toISOString();
      return withDate
        ? `${iso.slice(5, 10).replace('-', '/')} ${iso.slice(11, 16)} UTC`
        : `${iso.slice(11, 16)} UTC`;
    };
  }, [formatTime, points]);

  const geom = useMemo(() => {
    if (points.length < 2) return null;
    const w = 1000;
    const h = height;
    const padT = 10;
    const padB = 18;
    const values = points.map((p) => p.v);
    const max = Math.max(...values, threshold ?? 0) * 1.12 || 1;
    const min = 0;
    const x = (i: number) => (i / (points.length - 1)) * w;
    const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = `${line} L${w},${h - padB} L0,${h - padB} Z`;
    return { w, h, padB, max, x, y, line, area };
  }, [points, height, threshold]);

  const stroke =
    state === 'crit' ? 'var(--obc-crit)' : state === 'warn' ? 'var(--obc-warn)' : 'var(--obc-ok)';

  if (!geom) {
    return (
      <div
        className="flex items-center border border-[var(--obc-line)] px-4 text-[12px] text-[var(--obc-text-4)]"
        style={{ height }}
      >
        Not enough observations to plot. A series appears once at least two
        checks have completed.
      </div>
    );
  }

  const hoveredPoint = hover != null ? points[hover] : null;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${geom.w} ${geom.h}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height }}
          aria-hidden
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - box.left) / box.width;
            setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
          }}
        >
          <defs>
            <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              className="obc-grid"
              x1={0}
              x2={geom.w}
              y1={geom.y(geom.max * f)}
              y2={geom.y(geom.max * f)}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {threshold != null && threshold > 0 && (
            <line
              className="obc-thresh"
              x1={0}
              x2={geom.w}
              y1={geom.y(threshold)}
              y2={geom.y(threshold)}
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path d={geom.area} fill={`url(#${id}-f)`} />
          <path
            d={geom.line}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />

          {hover != null && (
            <line
              x1={geom.x(hover)}
              x2={geom.x(hover)}
              y1={0}
              y2={geom.h - geom.padB}
              stroke="var(--obc-line-3)"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Readout follows the cursor position in text, not in a floating card. */}
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="obc-mono text-[var(--obc-text-4)]">
            {fmtTime(points[0].t)}
          </span>
          <span
            className={cn(
              'obc-mono',
              hoveredPoint ? 'text-[var(--obc-text)]' : 'text-[var(--obc-text-4)]'
            )}
          >
            {hoveredPoint
              ? `${fmtTime(hoveredPoint.t)} · ${formatValue(hoveredPoint.v)} ${unit}`
              : `peak ${formatValue(Math.max(...points.map((p) => p.v)))} ${unit}`}
          </span>
          <span className="obc-mono text-[var(--obc-text-4)]">
            {fmtTime(points[points.length - 1].t)}
          </span>
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-[var(--obc-text-4)] hover:text-[var(--obc-text-2)]">
          {label} — view {points.length} observations as a table
        </summary>
        <div className="obc-scroll mt-2 max-h-56 overflow-y-auto border border-[var(--obc-line)]">
          <table className="obc-table">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr>
                <th scope="col">Observed at (UTC)</th>
                <th scope="col" className="obc-num">
                  Value ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.t}>
                  <td className="obc-mono">{fmtTime(p.t)}</td>
                  <td className="obc-num">{formatValue(p.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/**
 * Availability strip: one cell per observation window, coloured by outcome.
 * Reads like a status-page bar but is built from real check results, and each
 * cell carries a title so hovering states the window and the verdict.
 */
export function CheckStrip({
  cells,
  label,
}: {
  cells: { at: string; up: boolean; latency?: number | null; region?: string }[];
  label: string;
}) {
  if (!cells.length) {
    return (
      <p className="text-[12px] text-[var(--obc-text-4)]">
        No observations recorded in this window.
      </p>
    );
  }
  return (
    <div>
      <div className="flex items-stretch gap-[2px]" role="img" aria-label={label}>
        {cells.map((c, i) => (
          <span
            key={`${c.at}-${i}`}
            title={`${new Date(c.at).toISOString().slice(0, 16).replace('T', ' ')} UTC · ${
              c.up ? 'up' : 'down'
            }${c.latency != null ? ` · ${Math.round(c.latency)} ms` : ''}${
              c.region ? ` · ${c.region}` : ''
            }`}
            className="h-7 min-w-[3px] flex-1"
            style={{
              background: c.up ? 'var(--obc-ok)' : 'var(--obc-crit)',
              opacity: c.up ? 0.55 : 0.9,
            }}
          />
        ))}
      </div>
      <p className="sr-only">
        {cells.filter((c) => c.up).length} of {cells.length} observations succeeded.
      </p>
    </div>
  );
}
