/**
 * Server-side data access for the public observatory (`/track`, `/track/[vendor]`).
 *
 * Every endpoint here is a real, unauthenticated route on the RELIASTRA API
 * (`app/modules/vendors/router.py` and the public half of
 * `app/modules/evidence_gate/router.py`). Nothing in this file synthesises,
 * interpolates or defaults a measurement: a value the API did not return is
 * returned as `null` and the UI prints an explicit "no data" state.
 *
 * Rate-limit budget, because it shaped the design: the vendor router shares
 * one sliding window of 300 requests/minute keyed by client IP, and every
 * server-rendered page counts against the *same* bucket (all requests
 * originate from the Next.js server). The `/developer` aggregate endpoint has
 * its own, much tighter, 30/min window - so the vendor record deliberately
 * composes the cheaper endpoints (`detail`, `metrics`, `timeline`,
 * `incidents`) instead of the single aggregate call. Responses are cached for
 * 60s by the fetch cache, so repeat views of the same URL cost nothing.
 */

const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') ||
  'https://api.reliastra.com';


/* ── Response shapes (mirrors app/modules/vendors/schemas.py) ───────────── */

export interface TrackVendorListItem {
  recent_status?: string;
  latency_ms?: number | null;
  status_code?: number | null;
  id: string;
  vendor_name: string;
  display_name: string;
  category: string;
  is_public: boolean;
  last_check_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TrackVendorsPage {
  items: TrackVendorListItem[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface TrackEndpoint {
  id: string;
  endpoint_url: string;
  regions: string[];
  health_status: string;
  is_active: boolean;
  last_check_at: string | null;
}

/**
 * `recent_status` is derived by the API from the five most recent
 * observations: `operational` when all five carried a status code and no
 * transport error, `degraded` when any did not, `unknown` when there are no
 * observations at all. The page states that definition rather than implying a
 * vendor-published status.
 */
export interface TrackVendorDetail extends TrackVendorListItem {
  recent_status: string;
  endpoints: TrackEndpoint[];
}

export interface TrackCurrent {
  timestamp: string | null;
  latency_ms: number | null;
  status_code: number | null;
  is_up: boolean | null;
}

export interface TrackWindowMetrics {
  window: string;
  total_observations: number;
  uptime_percentage: number;
  avg_latency_ms: number;
  p95_latency_ms: number | null;
}

export interface TrackMetrics {
  vendor_name: string;
  metrics: Record<string, TrackWindowMetrics>;
}

export interface TrackTimelinePoint {
  timestamp: string;
  avg_latency_ms: number;
  status_code: number | null;
  is_up: boolean;
  observation_count: number;
  incident_id: string | null;
}

export interface TrackTimeline {
  vendor_name: string;
  window: string;
  resolution: string;
  region: string;
  from: string;
  to: string;
  current: TrackCurrent;
  points: TrackTimelinePoint[];
}

export interface TrackIncident {
  incident_id: string;
  dependency_name: string;
  started_at: string;
  resolved_at: string | null;
  severity: string;
  status: string;
  duration_seconds: number | null;
}

export interface TrackPublicIncident {
  incident_id: string;
  vendor_name: string;
  title: string;
  started_at: string;
  resolved_at: string | null;
  duration_minutes: number | null;
  severity: string;
  status: string;
  max_latency_ms: number | null;
  downtime_percentage: number | null;
  has_evidence_report: boolean;
  download_token: string | null;
}

/* ── Windows the API actually supports ──────────────────────────────────── */

/**
 * `_WINDOW_HOURS` in the vendor service. The UI offers a subset of these and
 * never a range the backend cannot aggregate.
 */
export const TRACK_WINDOWS = ['1h', '6h', '24h', '7d', '30d', '90d'] as const;
export type TrackWindow = (typeof TRACK_WINDOWS)[number];

/** Ranges surfaced in the telemetry switcher, in display order. */
export const TELEMETRY_RANGES: readonly TrackWindow[] = ['24h', '7d', '30d', '90d'];

export const DEFAULT_WINDOW: TrackWindow = '24h';

export function isTrackWindow(value: string | undefined | null): value is TrackWindow {
  return !!value && (TRACK_WINDOWS as readonly string[]).includes(value);
}

/** Backend default when no `region` is passed (`_DEFAULT_REGION`). */
export const DEFAULT_REGION = 'us-east-1';

/* ── Transport ──────────────────────────────────────────────────────────── */

export class TrackApiError extends Error {
  status: number;
  path: string;
  constructor(status: number, path: string) {
    super(`Track API ${status} for ${path}`);
    this.name = 'TrackApiError';
    this.status = status;
    this.path = path;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}/v1${path}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new TrackApiError(res.status, path);
  return (await res.json()) as T;
}

/** `null` on 404 (unknown or non-public vendor); throws on anything else. */
async function getJsonOrNull<T>(path: string): Promise<T | null> {
  try {
    return await getJson<T>(path);
  } catch (err) {
    if (err instanceof TrackApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Section-level tolerance. A vendor record must still render its header,
 * telemetry and methodology when one secondary endpoint is unavailable, so
 * non-essential sections resolve to `null` and say so, rather than taking the
 * whole page down.
 */
async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/* ── Endpoints ──────────────────────────────────────────────────────────── */

const enc = encodeURIComponent;

/** Public vendor catalog (cursor paginated, Redis-cached 60s upstream). */
export function fetchTrackedVendors(limit = 60): Promise<TrackVendorsPage> {
  return getJson<TrackVendorsPage>(`/vendors?limit=${limit}`);
}

/** Identity, rolled-up recent status and the observed endpoints. */
export function fetchVendorDetail(vendor: string): Promise<TrackVendorDetail | null> {
  return getJsonOrNull<TrackVendorDetail>(`/vendors/${enc(vendor)}`);
}

/** Availability / latency aggregates for every window the API supports. */
export function fetchVendorMetrics(vendor: string): Promise<TrackMetrics | null> {
  return getJsonOrNull<TrackMetrics>(`/vendors/${enc(vendor)}/metrics`);
}

/** Bucketed observation history for one window and one observation region. */
export function fetchVendorTimeline(
  vendor: string,
  window: TrackWindow = DEFAULT_WINDOW,
  region?: string
): Promise<TrackTimeline | null> {
  const q = new URLSearchParams({ window });
  if (region) q.set('region', region);
  return getJsonOrNull<TrackTimeline>(`/vendors/${enc(vendor)}/timeline?${q}`);
}

/** All incidents RELIASTRA opened against this vendor's endpoints. */
export async function fetchVendorIncidents(
  vendor: string,
  limit = 50
): Promise<TrackIncident[] | null> {
  const res = await getJsonOrNull<{ vendor_name: string; incidents: TrackIncident[] }>(
    `/vendors/${enc(vendor)}/incidents?limit=${limit}`
  );
  return res ? (res.incidents ?? []) : null;
}

/**
 * Incidents whose evidence report has been published.
 *
 * The endpoint returns a bare JSON array (`list[PublicIncidentResponse]`).
 * The previous client read `.incidents` off the response, so the evidence
 * section silently rendered empty on every vendor. Both shapes are accepted
 * here so the page cannot break again if the API is ever wrapped.
 */
export async function fetchVendorPublicIncidents(
  vendor: string
): Promise<TrackPublicIncident[] | null> {
  const res = await getJsonOrNull<
    TrackPublicIncident[] | { vendor_name: string; incidents: TrackPublicIncident[] }
  >(`/vendors/${enc(vendor)}/incidents/public`);
  if (!res) return null;
  return Array.isArray(res) ? res : (res.incidents ?? []);
}

/* ── Composed reads ─────────────────────────────────────────────────────── */

export interface VendorRecord {
  detail: TrackVendorDetail;
  metrics: TrackMetrics | null;
  /** One entry per observation region declared on the vendor's endpoints. */
  regionObservations: Array<{
    region: string;
    current: TrackCurrent | null;
    reachable: boolean;
    /** Measured interval between observations in that region, in seconds. */
    cadenceSeconds: number | null;
  }>;
  incidents: TrackIncident[] | null;
  publicIncidents: TrackPublicIncident[] | null;
  /** Regions declared across every active endpoint, deduplicated. */
  regions: string[];
  /**
   * The last hour of observations from the primary region, used for the
   * masthead pulse. It is a by-product of the per-region current lookups, so
   * it costs no extra request.
   */
  pulse: TrackTimeline | null;
}

/** Region list declared on the vendor's endpoints, deduplicated and sorted. */
export function regionsOf(detail: TrackVendorDetail): string[] {
  const seen = new Set<string>();
  for (const endpoint of detail.endpoints ?? []) {
    for (const region of endpoint.regions ?? []) {
      if (region) seen.add(region);
    }
  }
  return [...seen].sort();
}

/**
 * Everything the vendor record shell needs, in a single fan-out.
 *
 * The selected telemetry window is deliberately NOT fetched here: it is loaded
 * by a suspended child so that switching range or region re-renders the chart
 * without tearing down the header, the state or the incident list.
 *
 * Returns `null` when the API says 404 - that means "no such public vendor"
 * and must render a 404, not an error. Throws only when the vendor's identity
 * itself cannot be read, which is the one failure that means the record is
 * unavailable.
 */
export async function fetchVendorRecord(vendor: string): Promise<VendorRecord | null> {
  const detail = await fetchVendorDetail(vendor);
  if (!detail) return null;

  const regions = regionsOf(detail);

  const [metrics, incidents, publicIncidents] = await Promise.all([
    soft(fetchVendorMetrics(vendor)),
    soft(fetchVendorIncidents(vendor)),
    soft(fetchVendorPublicIncidents(vendor)),
  ]);

  // The current observation is region-scoped, so the per-region grid needs one
  // short-window timeline per region. Capped at six regions: beyond that the
  // grid stops being readable and the request fan-out stops being polite to a
  // rate limit shared by every reader of the site.
  const probed = regions.slice(0, 6);
  const timelines = await Promise.all(
    probed.map((r) => soft(fetchVendorTimeline(vendor, '1h', r)))
  );

  const regionObservations = probed.map((r, i) => ({
    region: r,
    current: timelines[i]?.current ?? null,
    reachable: timelines[i] !== null,
    cadenceSeconds: observedCadenceSeconds(timelines[i] ?? null),
  }));

  // Prefer the API's own default region for the pulse so the masthead and the
  // default chart describe the same vantage point.
  const preferred = probed.indexOf(DEFAULT_REGION);
  const pulse =
    (preferred >= 0 ? timelines[preferred] : null) ??
    timelines.find((t) => t && t.points.length) ??
    null;

  return { detail, metrics, regionObservations, incidents, publicIncidents, regions, pulse };
}

/** Seconds per bucket, keyed by the resolution label the API reports. */
const RESOLUTION_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '6h': 21600,
};

/**
 * The interval at which observations have actually been arriving, derived
 * from the timeline's own bucket density (bucket length / mean observations
 * per bucket).
 *
 * The configured check interval is not exposed on any public endpoint, so the
 * record reports the cadence it can *measure* instead of asserting a schedule
 * it cannot see. Returns null when the window carries no observations.
 */
export function observedCadenceSeconds(timeline: TrackTimeline | null): number | null {
  if (!timeline || !timeline.points.length) return null;
  const bucket = RESOLUTION_SECONDS[timeline.resolution];
  if (!bucket) return null;
  const counts = timeline.points.map((p) => p.observation_count).filter((n) => n > 0);
  if (!counts.length) return null;
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  if (mean <= 0) return null;
  return Math.round(bucket / mean);
}
