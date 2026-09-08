'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TrackTimelinePoint } from '@/lib/track-api';
import {
  latency as fmtLatency,
  utcCompact,
  utcShort,
  utcStamp,
  windowLabel,
} from '@/lib/observatory/format';

/* ═══════════════════════════════════════════════════════════════════════════
   Historical telemetry.

   The centre of the record. Design constraints, all of them deliberate:

   - One trace, 1.25px, in text white. Latency is the measurement; colour is
     reserved for failure and for the incident bands, so the eye finds the bad
     part of the window immediately and nothing else competes.
   - The line BREAKS at a failed bucket. Interpolating across an outage would
     draw a latency that was never observed.
   - Axes carry units and real UTC timestamps. A chart without units is
     decoration.
   - The inspected value is printed in a fixed readout row above the plot, not
     in a floating tooltip. Nothing moves, nothing overlaps the data, and the
     row is present before you hover - so the chart has no empty state and the
     page has no layout shift.
   - Two viewBoxes rather than one stretched viewBox: uniform scaling would
     make the axis type 3px tall on a 375px phone.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TelemetryIncident {
  id: string;
  title: string;
  started_at: string;
  resolved_at: string | null;
}

interface Props {
  points: TrackTimelinePoint[];
  window: string;
  resolution: string;
  region: string;
  from: string;
  to: string;
  /** p95 for this window, from the metrics endpoint. Drawn as a threshold. */
  p95: number | null;
  incidents: TelemetryIncident[];
}

interface Geometry {
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  stripH: number;
  /** Compact geometry drops the annotations that cannot fit on a phone. */
  compact: boolean;
}

const DESKTOP: Geometry = {
  w: 1000, h: 300, padL: 52, padR: 16, padT: 18, padB: 34, stripH: 9, compact: false,
};
const MOBILE: Geometry = {
  w: 380, h: 260, padL: 40, padR: 8, padT: 14, padB: 30, stripH: 8, compact: true,
};

export function TelemetryChart({
  points,
  window: win,
  resolution,
  region,
  from,
  to,
  p95,
  incidents,
}: Props) {
  const [cursor, setCursor] = useState<number | null>(null);

  const stats = useMemo(() => summarise(points), [points]);
  const active = cursor !== null && points[cursor] ? points[cursor] : points[points.length - 1];
  const activeIsCursor = cursor !== null && !!points[cursor];

  const incidentById = useMemo(() => {
    const m = new Map<string, TelemetryIncident>();
    for (const i of incidents) m.set(i.id, i);
    return m;
  }, [incidents]);

  if (!points.length) {
    return (
      <div className="border border-[var(--ob-line)] bg-[var(--ob-base)] p-6">
        <p className="ob-label mb-2">No historical observations in this window</p>
        <p className="max-w-[70ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
          RELIASTRA has not recorded a completed observation for this dependency over the last{' '}
          {windowLabel(win)} from {region}. Nothing is drawn here rather than a flat line, because a
          flat line would assert an availability that was never measured. Once observations begin,
          each bucket appears here at the resolution the API aggregates to, and any failure or
          incident window is marked on the same axis.
        </p>
      </div>
    );
  }

  const summary =
    `Latency observed from ${region} between ${utcStamp(from)} and ${utcStamp(to)}, ` +
    `aggregated into ${resolution} buckets. ${points.length} buckets, ` +
    `${stats.failed} with a failed observation. ` +
    `Peak ${fmtLatency(stats.max)} ms, mean ${fmtLatency(stats.mean)} ms.`;

  return (
    <figure className="m-0 flex flex-col gap-3">
      {/* Fixed readout row: the inspected bucket, or the most recent one. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-[var(--ob-line)] py-3 sm:grid-cols-4">
        <ReadoutCell
          label={activeIsCursor ? 'Inspected bucket' : 'Latest bucket'}
          value={utcCompact(active.timestamp) ?? 'no data'}
        />
        <ReadoutCell label="Mean latency" value={fmtLatency(active.avg_latency_ms)} unit="ms" />
        <ReadoutCell
          label="Response"
          value={active.is_up ? (active.status_code ? String(active.status_code) : 'responded') : 'no response'}
          tone={active.is_up ? undefined : 'critical'}
        />
        <ReadoutCell label="Observations" value={String(active.observation_count)} />
      </div>

      <Plot
        geo={DESKTOP}
        className="hidden w-full md:block"
        points={points}
        stats={stats}
        p95={p95}
        cursor={cursor}
        setCursor={setCursor}
        summary={summary}
        incidentById={incidentById}
      />
      <Plot
        geo={MOBILE}
        className="block w-full md:hidden"
        points={points}
        stats={stats}
        p95={p95}
        cursor={cursor}
        setCursor={setCursor}
        summary={summary}
        incidentById={incidentById}
      />

      <figcaption className="ob-small max-w-[80ch]">
        {summary} Buckets with no successful response break the trace and are marked in red on the
        availability strip. Shaded columns are windows in which RELIASTRA had an incident open
        against this dependency.
      </figcaption>
    </figure>
  );
}

/* ── Readout cell ───────────────────────────────────────────────────────── */

function ReadoutCell({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'critical';
}) {
  const muted = value === 'no data';
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="ob-label">{label}</span>
      <span
        className={cn(
          'obs-num obs-num-sm truncate',
          muted && 'obs-void',
          tone === 'critical' && 'text-[var(--ob-critical)]'
        )}
      >
        {value}
        {!muted && unit && <span className="obs-unit">{unit}</span>}
      </span>
    </div>
  );
}

/* ── Plot ───────────────────────────────────────────────────────────────── */

interface PlotProps {
  geo: Geometry;
  className?: string;
  points: TrackTimelinePoint[];
  stats: Summary;
  p95: number | null;
  cursor: number | null;
  setCursor: (i: number | null) => void;
  summary: string;
  incidentById: Map<string, TelemetryIncident>;
}

function Plot({
  geo,
  className,
  points,
  stats,
  p95,
  cursor,
  setCursor,
  summary,
  incidentById,
}: PlotProps) {
  const { w, h, padL, padR, padT, padB, stripH } = geo;
  const svgRef = useRef<SVGSVGElement | null>(null);

  const plotW = w - padL - padR;
  const plotH = h - padT - padB - stripH - 6;
  const yMax = niceCeil(Math.max(stats.max, p95 ?? 0, 1));
  const n = points.length;

  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const colW = n > 0 ? plotW / n : plotW;

  // Trace, broken at failed buckets so no line is drawn through an outage.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.is_up && p.avg_latency_ms > 0) {
      current.push(`${x(i).toFixed(2)},${y(p.avg_latency_ms).toFixed(2)}`);
    } else if (current.length) {
      segments.push(current.join(' '));
      current = [];
    }
  });
  if (current.length) segments.push(current.join(' '));

  // Contiguous incident windows, for the shaded bands.
  const bands: Array<{ from: number; to: number; id: string }> = [];
  points.forEach((p, i) => {
    if (!p.incident_id) return;
    const last = bands[bands.length - 1];
    if (last && last.id === p.incident_id && last.to === i - 1) last.to = i;
    else bands.push({ from: i, to: i, id: p.incident_id });
  });

  const ticks = axisTicks(points, geo.compact ? 3 : 6);

  const onMove = useCallback(
    (clientX: number) => {
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const rel = ((clientX - rect.left) / rect.width) * w;
      const idx = Math.round(((rel - padL) / plotW) * (n - 1));
      setCursor(Math.max(0, Math.min(n - 1, idx)));
    },
    [n, padL, plotW, setCursor, w]
  );

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.shiftKey ? Math.max(1, Math.round(n / 10)) : 1;
      const base = cursor ?? n - 1;
      setCursor(Math.max(0, Math.min(n - 1, base + (e.key === 'ArrowRight' ? step : -step))));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(n - 1);
    } else if (e.key === 'Escape') {
      setCursor(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${w} ${h}`}
      className={cn('obs-plot', className)}
      role="img"
      tabIndex={0}
      aria-label={`${summary} Use the arrow keys to inspect individual buckets.`}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerLeave={() => setCursor(null)}
      onKeyDown={onKey}
    >
      {/* Horizontal grid + latency axis */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const yy = padT + plotH - f * plotH;
        return (
          <g key={f}>
            <line
              x1={padL}
              x2={w - padR}
              y1={yy}
              y2={yy}
              className={f === 0 ? 'obs-grid-strong' : 'obs-grid'}
            />
            <text x={padL - 8} y={yy + 3} textAnchor="end" className="obs-axis">
              {Math.round(yMax * f).toLocaleString('en-US')}
            </text>
          </g>
        );
      })}
      <text
        x={padL - 8}
        y={padT - 6}
        textAnchor="end"
        className="obs-axis"
        style={{ letterSpacing: '0.1em' }}
      >
        ms
      </text>

      {/* Incident bands, drawn under the trace */}
      {bands.map((b) => {
        const bx = x(b.from) - colW / 2;
        const bw = Math.max(colW, x(b.to) - x(b.from) + colW);
        const inc = incidentById.get(b.id);
        return (
          <g key={`${b.id}-${b.from}`}>
            <rect x={bx} y={padT} width={bw} height={plotH} className="obs-incident-band" />
            <line
              x1={bx}
              x2={bx}
              y1={padT}
              y2={padT + plotH}
              stroke="var(--ob-critical)"
              strokeWidth={1}
              opacity={0.7}
            />
            {!geo.compact && bw > 46 && (
              <text x={bx + 5} y={padT + 11} className="obs-axis" style={{ fill: 'var(--ob-critical)' }}>
                {truncateTo(inc?.title ?? 'Incident window', Math.floor((bw - 10) / 5.4))}
              </text>
            )}
          </g>
        );
      })}

      {/* Failed buckets: a hairline at full height, so an outage is visible
          even when it is one bucket wide in a 90-day window. */}
      {points.map((p, i) =>
        p.is_up ? null : (
          <line
            key={`f-${i}`}
            x1={x(i)}
            x2={x(i)}
            y1={padT}
            y2={padT + plotH}
            className="obs-fail"
            opacity={0.55}
          />
        )
      )}

      {/* p95 threshold */}
      {p95 && p95 > 0 && p95 <= yMax && (
        <g>
          <line x1={padL} x2={w - padR} y1={y(p95)} y2={y(p95)} className="obs-thresh" />
          <text x={w - padR} y={y(p95) - 5} textAnchor="end" className="obs-axis" style={{ fill: 'var(--ob-signal)' }}>
            p95 {Math.round(p95).toLocaleString('en-US')} ms
          </text>
        </g>
      )}

      {/* Trace */}
      {segments.map((seg, i) => {
        const coords = seg.split(' ');
        const first = coords[0].split(',')[0];
        const last = coords[coords.length - 1].split(',')[0];
        const base = (padT + plotH).toFixed(2);
        return (
          <g key={i}>
            {coords.length > 1 && (
              <polygon className="obs-trace-fill" points={`${first},${base} ${seg} ${last},${base}`} />
            )}
            <polyline className="obs-trace" points={seg} />
          </g>
        );
      })}

      {/* Cursor */}
      {cursor !== null && points[cursor] && (
        <g>
          <line x1={x(cursor)} x2={x(cursor)} y1={padT} y2={padT + plotH} className="obs-cursor" />
          {points[cursor].is_up && points[cursor].avg_latency_ms > 0 && (
            <circle cx={x(cursor)} cy={y(points[cursor].avg_latency_ms)} r={2.5} fill="var(--ob-signal)" />
          )}
        </g>
      )}

      {/* Time axis */}
      {ticks.map((t) => (
        <g key={t.index}>
          <line
            x1={x(t.index)}
            x2={x(t.index)}
            y1={padT + plotH}
            y2={padT + plotH + 4}
            className="obs-grid-strong"
          />
          <text
            x={x(t.index)}
            y={h - 6}
            textAnchor={t.index === 0 ? 'start' : t.index === points.length - 1 ? 'end' : 'middle'}
            className="obs-axis"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* Availability strip */}
      <g transform={`translate(0, ${padT + plotH + 10})`}>
        {points.map((p, i) => (
          <rect
            key={`s-${i}`}
            x={x(i) - colW / 2}
            y={0}
            width={Math.max(colW - (colW > 6 ? 0.5 : 0), 0.6)}
            height={stripH}
            className={p.is_up ? 'obs-strip-ok' : 'obs-strip-fail'}
          />
        ))}
      </g>
    </svg>
  );
}

/* ── Maths ──────────────────────────────────────────────────────────────── */

interface Summary {
  max: number;
  mean: number;
  failed: number;
}

function summarise(points: TrackTimelinePoint[]): Summary {
  let max = 0;
  let sum = 0;
  let seen = 0;
  let failed = 0;
  for (const p of points) {
    if (!p.is_up) failed += 1;
    if (p.is_up && p.avg_latency_ms > 0) {
      max = Math.max(max, p.avg_latency_ms);
      sum += p.avg_latency_ms;
      seen += 1;
    }
  }
  return { max, mean: seen ? sum / seen : 0, failed };
}

/** Fit a label to the pixel width available inside an incident band. */
function truncateTo(text: string, chars: number): string {
  const upper = text.toUpperCase();
  if (chars <= 3) return '';
  return upper.length <= chars ? upper : `${upper.slice(0, chars - 1)}…`;
}

/** Round the axis top to something a human reads without decoding. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function axisTicks(points: TrackTimelinePoint[], wanted: number) {
  const n = points.length;
  if (n === 0) return [];
  const step = Math.max(1, Math.floor((n - 1) / Math.max(1, wanted - 1)));
  const out: Array<{ index: number; label: string }> = [];
  for (let i = 0; i < n; i += step) {
    out.push({ index: i, label: utcShort(points[i].timestamp) ?? '' });
  }
  // The series must end with its real end time, but a tick two pixels from
  // the previous one prints two overlapping labels - so the neighbour is
  // dropped rather than the truth.
  const last = n - 1;
  if (out[out.length - 1]?.index !== last) {
    if (last - out[out.length - 1].index < step * 0.6) out.pop();
    out.push({ index: last, label: utcShort(points[last].timestamp) ?? '' });
  }
  return out;
}
