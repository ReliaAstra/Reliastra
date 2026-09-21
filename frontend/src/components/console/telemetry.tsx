'use client';

import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type Point = { t: string; v: number };

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
  threshold?: number | null;
  height?: number;
  label: string;
  state?: 'ok' | 'warn' | 'crit';
  formatValue?: (v: number) => string;
  formatTime?: (t: string) => string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);

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
    state === 'crit' ? 'var(--rs-down)' : state === 'warn' ? 'var(--rs-degraded)' : 'var(--rs-up)';

  if (!geom) {
    return (
      <div
        className="flex items-center px-4 text-[12px] text-rs-text-tertiary"
        style={{ height }}
      >
        Not enough observations to plot. A series appears once at least two checks have completed.
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
              x1={0}
              x2={geom.w}
              y1={geom.y(geom.max * f)}
              y2={geom.y(geom.max * f)}
              stroke="var(--rs-border-subtle)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {threshold != null && threshold > 0 && (
            <line
              x1={0}
              x2={geom.w}
              y1={geom.y(threshold)}
              y2={geom.y(threshold)}
              stroke="var(--rs-degraded)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
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
              stroke="var(--rs-border)"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="rs-mono text-[11px] text-rs-text-tertiary">
            {fmtTime(points[0].t)}
          </span>
          <span
            className={cn(
              'rs-mono text-[11px]',
              hoveredPoint ? 'text-rs-text' : 'text-rs-text-tertiary'
            )}
          >
            {hoveredPoint
              ? `${fmtTime(hoveredPoint.t)} · ${formatValue(hoveredPoint.v)} ${unit}`
              : `peak ${formatValue(Math.max(...points.map((p) => p.v)))} ${unit}`}
          </span>
          <span className="rs-mono text-[11px] text-rs-text-tertiary">
            {fmtTime(points[points.length - 1].t)}
          </span>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-rs-text-tertiary hover:text-rs-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus">
          {label}: view {points.length} observations as a table
        </summary>
        <div className="rs-scrollbar mt-2 max-h-56 overflow-y-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-rs-border-subtle">
                <th scope="col" className="rs-label px-2 py-2 font-normal">Observed at (UTC)</th>
                <th scope="col" className="rs-label px-2 py-2 text-right font-normal">
                  Value ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.t} className="border-b border-rs-border-subtle last:border-b-0">
                  <td className="rs-mono px-2 py-1.5 text-rs-text-secondary">{fmtTime(p.t)}</td>
                  <td className="rs-mono px-2 py-1.5 text-right text-rs-text">{formatValue(p.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function CheckStrip({
  cells,
  label,
}: {
  cells: { at: string; up: boolean; latency?: number | null }[];
  label: string;
}) {
  if (!cells.length) {
    return (
      <p className="text-[12px] text-rs-text-tertiary">
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
            }${c.latency != null ? ` · ${Math.round(c.latency)} ms` : ''}`}
            className="h-7 min-w-[3px] flex-1 rounded-sm"
            style={{
              background: c.up ? 'var(--rs-up)' : 'var(--rs-down)',
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
