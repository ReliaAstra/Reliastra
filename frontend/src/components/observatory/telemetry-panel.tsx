import Link from 'next/link';
import {
  fetchVendorTimeline,
  observedCadenceSeconds,
  TELEMETRY_RANGES,
  type TrackMetrics,
  type TrackPublicIncident,
  type TrackWindow,
} from '@/lib/track-api';
import { TelemetryChart, type TelemetryIncident } from './telemetry-chart';
import { Readout, Notice } from './primitives';
import {
  availability,
  count,
  latency,
  RESOLUTION_LABEL,
  utcStamp,
  windowLabel,
} from '@/lib/observatory/format';

/**
 * The telemetry section body.
 *
 * Rendered inside its own Suspense boundary, keyed by window + region, so that
 * changing range re-requests only the series: the masthead, the state and the
 * incident record stay on screen and nothing below the chart moves.
 */
export async function TelemetryPanel({
  vendor,
  window: win,
  region,
  metrics,
  publicIncidents,
}: {
  vendor: string;
  window: TrackWindow;
  region?: string;
  metrics: TrackMetrics | null;
  publicIncidents: TrackPublicIncident[] | null;
}) {
  let timeline;
  try {
    timeline = await fetchVendorTimeline(vendor, win, region);
  } catch {
    timeline = null;
  }

  if (!timeline) {
    return (
      <Notice kind="error" title="Telemetry unavailable">
        The observation series for this window could not be read from the measurement API. The rest
        of this record is unaffected. No approximate or cached series is drawn in its place.
      </Notice>
    );
  }

  const m = metrics?.metrics?.[win] ?? null;
  const cadence = observedCadenceSeconds(timeline);

  const incidents: TelemetryIncident[] = (publicIncidents ?? []).map((i) => ({
    id: i.incident_id,
    title: i.title,
    started_at: i.started_at,
    resolved_at: i.resolved_at,
  }));

  return (
    <div className="flex flex-col gap-8">
      <TelemetryChart
        points={timeline.points}
        window={timeline.window}
        resolution={timeline.resolution}
        region={timeline.region}
        from={timeline.from}
        to={timeline.to}
        p95={m?.p95_latency_ms ?? null}
        incidents={incidents}
      />

      <div className="grid grid-cols-2 gap-x-8 gap-y-7 border-t border-[var(--ob-line)] pt-6 lg:grid-cols-4">
        <Readout
          label={`Observations · ${windowLabel(win)}`}
          value={count(m?.total_observations ?? null)}
          note="Completed checks aggregated into this window"
        />
        <Readout
          label="Availability"
          value={availability(m?.uptime_percentage, m?.total_observations)}
          note="Responses with a status code and no transport error"
        />
        <Readout label="Mean latency" value={latency(m?.avg_latency_ms)} unit="ms" note="Arithmetic mean across all regions" />
        <Readout label="95th percentile" value={latency(m?.p95_latency_ms)} unit="ms" note="Drawn as the dashed threshold above" />
      </div>

      <dl className="grid gap-x-8 gap-y-4 border-t border-[var(--ob-line)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <SeriesFact term="Window">
          {utcStamp(timeline.from)} → {utcStamp(timeline.to)}
        </SeriesFact>
        <SeriesFact term="Bucket resolution">
          {RESOLUTION_LABEL[timeline.resolution] ?? timeline.resolution} per point ·{' '}
          {timeline.points.length} points
        </SeriesFact>
        <SeriesFact term="Observation region">{timeline.region}</SeriesFact>
        <SeriesFact term="Observed cadence">
          {cadence ? `≈ every ${cadence}s in this window` : 'not derivable from this window'}
        </SeriesFact>
      </dl>
    </div>
  );
}

function SeriesFact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="ob-label">{term}</dt>
      <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}

/* ── Controls ───────────────────────────────────────────────────────────── */

/**
 * Range and region switching are plain links that change the URL, not client
 * state. Three reasons: every range is a shareable, crawlable URL; the series
 * is fetched and rendered on the server, so no chart library ships to the
 * browser; and it works with JavaScript disabled.
 */
export function TelemetryControls({
  basePath,
  window: win,
  region,
  regions,
}: {
  basePath: string;
  window: TrackWindow;
  region?: string;
  regions: string[];
}) {
  const href = (next: { window?: TrackWindow; region?: string | null }) => {
    const q = new URLSearchParams();
    const w = next.window ?? win;
    if (w !== '24h') q.set('window', w);
    const r = next.region === null ? undefined : (next.region ?? region);
    if (r) q.set('region', r);
    const qs = q.toString();
    return `${basePath}${qs ? `?${qs}` : ''}#telemetry`;
  };

  return (
    <div className="flex flex-col items-start gap-3 md:items-end">
      <div className="flex items-center gap-3">
        <span className="ob-label">Range</span>
        <nav className="obs-switch" aria-label="Telemetry range">
          {TELEMETRY_RANGES.map((r) => (
            <Link
              key={r}
              href={href({ window: r })}
              className="obs-tab"
              aria-current={r === win ? 'true' : undefined}
              scroll={false}
            >
              {r}
            </Link>
          ))}
        </nav>
      </div>
      {regions.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="ob-label">Region</span>
          <nav className="obs-switch" aria-label="Observation region">
            {regions.slice(0, 4).map((r) => (
              <Link
                key={r}
                href={href({ region: r })}
                className="obs-tab"
                aria-current={r === region ? 'true' : undefined}
                scroll={false}
              >
                {r}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

/* ── Loading ────────────────────────────────────────────────────────────── */

/** Shown only while a different range is being fetched. */
export function TelemetrySkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <p className="ob-label obs-label-signal">Initialising observation series…</p>
      <div className="h-[260px] w-full border border-[var(--ob-line)] bg-[var(--ob-base)] md:h-[300px]" />
      <p className="ob-small">
        Requesting aggregated observations from the measurement API. No values are shown until they
        arrive.
      </p>
    </div>
  );
}
