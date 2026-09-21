/**
 * Server-side data access for the public observatory (`/observatory`, `/observatory/[vendor]`).
 * The module keeps its original name because two published research papers cite
 * this path as an artifact URL; renaming the file would break their references.
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
 * `incidents`) instead of the single aggregate call.
 *
 * ── Caching policy (this is what keeps the routes indexable) ───────────────
 *
 * Every read below goes through the Next.js Data Cache with an explicit
 * `revalidate` and cache tags. Nothing on the public read path opts out of
 * caching, because a single uncached fetch forces the whole
 * route to render dynamically at request time - which makes the
 * `export const revalidate` on the pages inert, sends one crawler hit through
 * as 13-25 upstream calls, and turns any transient API failure into a
 * user-visible failure instead of a stale-but-honest render.
 *
 * Lifetimes are per data class, not global: identity and current observation
 * revalidate at 60s (the catalog is Redis-cached 60s upstream anyway),
 * aggregates and incident lists at 300s. A crawler therefore costs at most one
 * upstream call per vendor per minute no matter how many URLs it opens.
 *
 * Every read also carries an 8s abort. Before this, a hung upstream left the
 * render waiting on the platform's own timeout, so a slow API and a dead API
 * were indistinguishable from the outside.
 */

import { PRIMARY_OBSERVATION_REGION } from '@/lib/product-contract';

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

/**
 * The region the API resolves when a read does not name one.
 *
 * Taken from the transcribed backend contract rather than written out here:
 * this value used to be `'us-east-1'` while `_DEFAULT_REGION` in
 * `backend/app/modules/vendors/service.py` - and every seeded endpoint's
 * region label - is `'us-east'`, so the record's preference for "the API's own
 * default region" never matched anything and silently fell through.
 */
export const DEFAULT_REGION = PRIMARY_OBSERVATION_REGION;

/* ── Read semantics ─────────────────────────────────────────────────────── */

/**
 * Why a read did not produce a record. Every value here means "existence is
 * unknown" - none of them may be reported to a crawler as "this record does
 * not exist".
 */
export type UnreadableReason = 'timeout' | 'http' | 'network' | 'malformed';

/**
 * The three conclusions a public read can reach, kept distinct because each
 * demands a different HTTP response:
 *
 *  - `ok`         the API answered with the record. Render it, index it.
 *  - `missing`    the API answered 404. The record does not exist: the URL
 *                 must 404 and carry `noindex`. That is a statement about
 *                 existence, and it is the only thing `noindex` may say.
 *  - `unreadable` the API did not answer (timeout, 5xx, 429, malformed body).
 *                 Whether the record exists is *unknown*, so the URL must
 *                 return a 5xx that a crawler retries and must never be
 *                 marked `noindex`.
 *
 * Collapsing `unreadable` into `missing` was the defect this type exists to
 * prevent: one transient API failure emitted `noindex` on canonical,
 * sitemap-listed dependency records and served a 200 page with no data on it.
 */
export type RecordRead<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: UnreadableReason };

export function isRecordOk<T>(read: RecordRead<T>): read is { kind: 'ok'; value: T } {
  return read.kind === 'ok';
}

export function isRecordMissing<T>(read: RecordRead<T>): read is { kind: 'missing' } {
  return read.kind === 'missing';
}

export function isRecordUnreadable<T>(
  read: RecordRead<T>
): read is { kind: 'unreadable'; reason: UnreadableReason } {
  return read.kind === 'unreadable';
}

/**
 * Thrown by a page body when the record it is about to render could not be
 * read. Throwing - rather than returning a component - is the point: the error
 * boundary produces a 5xx, which is the only response that tells a crawler
 * "retry this URL", and under ISR it leaves the last good render in the cache.
 */
export class RecordUnreadableError extends Error {
  readonly reason: UnreadableReason;
  readonly status: number | null;
  readonly path: string;
  constructor(reason: UnreadableReason, path: string, status: number | null = null) {
    super(`Observatory record unreadable (${reason}) for ${path}`);
    this.name = 'RecordUnreadableError';
    this.reason = reason;
    this.status = status;
    this.path = path;
  }
}

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

/** Hard ceiling on one upstream read. A hung API must not outlive the render. */
const REQUEST_TIMEOUT_MS = Number(process.env.RELIASTRA_API_TIMEOUT_MS ?? 8_000);

/**
 * Shared secret identifying this server as the site's own reader, so the
 * backend can keep server-rendered reads out of the per-client-IP public
 * bucket. Server-only by construction: it is read from a non-`NEXT_PUBLIC_`
 * variable and never rendered into HTML. When it is unset the header is
 * omitted and the backend falls back to IP identity - degraded, never broken.
 */
const READER_TOKEN = process.env.RELIASTRA_READER_TOKEN;

/** Data Cache lifetime and invalidation tags for one endpoint class. */
interface CachePolicy {
  revalidate: number;
  tags: string[];
}

/** 60s for identity and current observation; the catalog is Redis-cached 60s upstream. */
const LIVE_POLICY = 60;
/** 300s for aggregates and incident lists: they move slower and cost more. */
const AGGREGATE_POLICY = 300;

function classifyFailure(err: unknown): { reason: UnreadableReason; status: number | null } {
  if (err instanceof TrackApiError) return { reason: 'http', status: err.status };
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { reason: 'timeout', status: null };
  }
  if (err instanceof SyntaxError) return { reason: 'malformed', status: null };
  return { reason: 'network', status: null };
}

async function getJson<T>(path: string, policy: CachePolicy): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (READER_TOKEN) headers['x-reliastra-reader'] = READER_TOKEN;

  const res = await fetch(`${BACKEND_URL}/v1${path}`, {
    headers,
    next: { revalidate: policy.revalidate, tags: policy.tags },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new TrackApiError(res.status, path);
  return (await res.json()) as T;
}

/**
 * The only read primitive the public pages should use: it never throws for a
 * condition that merely means "could not read", so callers cannot accidentally
 * turn an outage into a 404.
 */
async function readJson<T>(path: string, policy: CachePolicy): Promise<RecordRead<T>> {
  try {
    return { kind: 'ok', value: await getJson<T>(path, policy) };
  } catch (err) {
    if (err instanceof TrackApiError && err.status === 404) return { kind: 'missing' };
    return { kind: 'unreadable', reason: classifyFailure(err).reason };
  }
}

/**
 * Legacy convenience wrapper: `null` on 404, throws on anything else.
 *
 * Retained for the callers that only need "value or absent" (client-facing
 * section composition, research pages). New crawler-facing code must use the
 * `read*` functions so an unreadable record cannot be mistaken for a missing
 * one.
 */
async function getJsonOrNull<T>(path: string, policy: CachePolicy): Promise<T | null> {
  const read = await readJson<T>(path, policy);
  if (read.kind === 'missing') return null;
  if (read.kind === 'unreadable') {
    throw new RecordUnreadableError(read.reason, path);
  }
  return read.value;
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

/** Cache tags for one vendor, so a single record can be invalidated alone. */
function vendorTags(vendor: string, suffix?: string): string[] {
  const base = `vendor:${vendor}`;
  return suffix ? ['observatory', base, `${base}:${suffix}`] : ['observatory', base];
}

const CATALOG_POLICY: CachePolicy = {
  revalidate: LIVE_POLICY,
  tags: ['observatory', 'vendors:catalog'],
};

/** Public vendor catalog (cursor paginated, Redis-cached 60s upstream). */
export function fetchTrackedVendors(limit = 60): Promise<TrackVendorsPage> {
  return getJson<TrackVendorsPage>(`/vendors?limit=${limit}`, CATALOG_POLICY);
}

/** The catalog as a three-way read, for callers that must not guess. */
export function readCatalog(limit = 60): Promise<RecordRead<TrackVendorsPage>> {
  return readJson<TrackVendorsPage>(`/vendors?limit=${limit}`, CATALOG_POLICY);
}

/**
 * Every public vendor in the catalog, walked cursor by cursor.
 *
 * The single-page read silently truncated discovery: the sitemap listed at
 * most 100 records and the index printed `items.length` from a 60-item read as
 * though it were the size of the catalog. Walking the cursor makes both
 * numbers true. `maxPages` is a hard bound so a backend that returns a cursor
 * which never advances cannot loop forever.
 */
export async function fetchTrackedVendorsAll(options?: {
  pageSize?: number;
  maxPages?: number;
}): Promise<TrackVendorListItem[]> {
  const pageSize = options?.pageSize ?? 100;
  const maxPages = options?.maxPages ?? 20;

  const items: TrackVendorListItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const q = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) q.set('cursor', cursor);
    const result = await getJson<TrackVendorsPage>(`/vendors?${q}`, CATALOG_POLICY);

    for (const item of result.items ?? []) {
      if (!item?.vendor_name || seen.has(item.vendor_name)) continue;
      seen.add(item.vendor_name);
      items.push(item);
    }

    if (!result.has_more || !result.next_cursor || result.next_cursor === cursor) break;
    cursor = result.next_cursor;
  }

  return items;
}

const detailPolicy = (vendor: string): CachePolicy => ({
  revalidate: LIVE_POLICY,
  tags: vendorTags(vendor, 'detail'),
});

/** Identity, rolled-up recent status and the observed endpoints. */
export function fetchVendorDetail(vendor: string): Promise<TrackVendorDetail | null> {
  return getJsonOrNull<TrackVendorDetail>(`/vendors/${enc(vendor)}`, detailPolicy(vendor));
}

/**
 * Identity as a three-way read.
 *
 * This is the function that decides whether a record URL 404s or 5xxs, so it
 * is the one place where "the API said 404" and "the API did not answer" must
 * stay separate all the way to the caller.
 */
export function readVendorDetail(vendor: string): Promise<RecordRead<TrackVendorDetail>> {
  return readJson<TrackVendorDetail>(`/vendors/${enc(vendor)}`, detailPolicy(vendor));
}

/** Availability / latency aggregates for every window the API supports. */
export function fetchVendorMetrics(vendor: string): Promise<TrackMetrics | null> {
  return getJsonOrNull<TrackMetrics>(`/vendors/${enc(vendor)}/metrics`, {
    revalidate: AGGREGATE_POLICY,
    tags: vendorTags(vendor, 'metrics'),
  });
}

/** Bucketed observation history for one window and one observation region. */
export function fetchVendorTimeline(
  vendor: string,
  window: TrackWindow = DEFAULT_WINDOW,
  region?: string
): Promise<TrackTimeline | null> {
  const q = new URLSearchParams({ window });
  if (region) q.set('region', region);
  return getJsonOrNull<TrackTimeline>(`/vendors/${enc(vendor)}/timeline?${q}`, {
    // The short window feeds the masthead pulse and must stay near-live; the
    // long windows are history and move only at their trailing edge.
    revalidate: window === '1h' ? LIVE_POLICY : AGGREGATE_POLICY,
    tags: vendorTags(vendor, `timeline:${window}:${region ?? 'default'}`),
  });
}

/**
 * All incidents RELIASTRA opened against this vendor's endpoints.
 *
 * NOTE: the backend returns an empty list here by design - public probes
 * persist observations, and customer incident records stay tenant-private even
 * for a public URL (`app/modules/vendors/service.py`, `get_vendor_incidents`).
 * The public incident list below is the only populated source, so the record
 * composition no longer spends a rate-limited call on this endpoint. It is
 * kept exported for the API surface and for tests that assert the emptiness.
 */
export async function fetchVendorIncidents(
  vendor: string,
  limit = 50
): Promise<TrackIncident[] | null> {
  const res = await getJsonOrNull<{ vendor_name: string; incidents: TrackIncident[] }>(
    `/vendors/${enc(vendor)}/incidents?limit=${limit}`,
    { revalidate: AGGREGATE_POLICY, tags: vendorTags(vendor, 'incidents') }
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
  >(`/vendors/${enc(vendor)}/incidents/public`, {
    revalidate: AGGREGATE_POLICY,
    tags: vendorTags(vendor, 'incidents:public'),
  });
  if (!res) return null;
  return Array.isArray(res) ? res : (res.incidents ?? []);
}

/** Published incidents as a three-way read (used by incident discovery). */
export async function readVendorPublicIncidents(
  vendor: string
): Promise<RecordRead<TrackPublicIncident[]>> {
  const read = await readJson<
    TrackPublicIncident[] | { vendor_name: string; incidents: TrackPublicIncident[] }
  >(`/vendors/${enc(vendor)}/incidents/public`, {
    revalidate: AGGREGATE_POLICY,
    tags: vendorTags(vendor, 'incidents:public'),
  });
  if (read.kind !== 'ok') return read;
  const value = read.value;
  return { kind: 'ok', value: Array.isArray(value) ? value : (value.incidents ?? []) };
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
  /**
   * Always `null` today: the public `/vendors/{name}/incidents` endpoint
   * returns an empty list by design (customer incident records stay
   * tenant-private even for a public URL), so the composition does not spend a
   * rate-limited call on it. `publicIncidents` is the populated source. The
   * field is retained because `mergeIncidents` and the incidents section take
   * both sides, and so that a future backend change has somewhere to land.
   */
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
 * Returns the three-way read: `missing` means the API answered 404 ("no such
 * public vendor" - the URL must 404), `unreadable` means the identity itself
 * could not be read ("existence unknown" - the URL must 5xx and stay indexed).
 * Secondary sections stay tolerant: a record must render its header, telemetry
 * and methodology when an aggregate endpoint is unavailable, and those
 * sections say so instead of taking the page down.
 */
export async function readVendorRecord(vendor: string): Promise<RecordRead<VendorRecord>> {
  const detailRead = await readVendorDetail(vendor);
  if (detailRead.kind !== 'ok') return detailRead;

  const detail = detailRead.value;
  const regions = regionsOf(detail);

  const [metrics, publicIncidents] = await Promise.all([
    soft(fetchVendorMetrics(vendor)),
    soft(fetchVendorPublicIncidents(vendor)),
  ]);

  // The public `/incidents` endpoint is empty by design (see the note on
  // `fetchVendorIncidents`); requesting it only consumed rate-limit budget
  // that every other reader of the site shares.
  const incidents: TrackIncident[] | null = null;

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

  return {
    kind: 'ok',
    value: { detail, metrics, regionObservations, incidents, publicIncidents, regions, pulse },
  };
}

/**
 * Legacy wrapper: `null` when the vendor is absent, throws when it could not
 * be read. Prefer `readVendorRecord` - a caller that catches this wrapper's
 * throw and renders a 200 has re-created the defect the union type prevents.
 */
export async function fetchVendorRecord(vendor: string): Promise<VendorRecord | null> {
  const read = await readVendorRecord(vendor);
  if (read.kind === 'missing') return null;
  if (read.kind === 'unreadable') {
    throw new RecordUnreadableError(read.reason, `/vendors/${enc(vendor)}`);
  }
  return read.value;
}

/* ── Discovery reads (sitemap) ─────────────────────────────────────────── */

/**
 * The vendor list as discovery sees it.
 *
 * `stale` is part of the type on purpose. A sitemap is a list of URLs that
 * exist, not a report of current measurements, so serving the last good list
 * is legitimate here and illegitimate everywhere else - but only if the caller
 * can tell which one it got and says so.
 */
export interface DiscoveryCatalog {
  vendors: TrackVendorListItem[];
  /** True when this list is the last successful read, not a fresh one. */
  stale: boolean;
  /** When these vendors were actually read from the API. */
  readAt: Date | null;
}

/** How long a last-good catalog may stand in for a live one. */
const DISCOVERY_STALE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Process-local last-good catalog.
 *
 * Deliberately module state and not the Data Cache: the Data Cache is what
 * makes the *page* renders cheap, while this exists to stop a transient
 * catalog failure from withdrawing every record URL from `sitemap.xml`. It
 * lives as long as the server process, which for a standalone deployment is
 * long enough to ride out an API restart.
 */
let lastGoodCatalog: { vendors: TrackVendorListItem[]; readAt: number } | null = null;

/** Reset the last-good catalog. Test seam; nothing in the app calls it. */
export function resetDiscoveryCatalog(): void {
  lastGoodCatalog = null;
}

/**
 * Read the full public catalog for URL discovery.
 *
 * On failure this falls back to the last good list for up to six hours and
 * marks it stale; past that it throws, because a sitemap that silently omits
 * every dependency record is worse than no sitemap at all - the crawler reads
 * the omission as a withdrawal and drops URLs that still resolve.
 */
export async function readCatalogForDiscovery(options?: {
  pageSize?: number;
  maxPages?: number;
}): Promise<DiscoveryCatalog> {
  try {
    const vendors = await fetchTrackedVendorsAll(options);
    const readAt = Date.now();
    lastGoodCatalog = { vendors, readAt };
    return { vendors, stale: false, readAt: new Date(readAt) };
  } catch (err) {
    const reason = classifyFailure(err);
    if (lastGoodCatalog && Date.now() - lastGoodCatalog.readAt <= DISCOVERY_STALE_TTL_MS) {
      console.warn(
        `[track-api] catalog read failed (${reason.reason}); serving last-good ` +
          `discovery list from ${new Date(lastGoodCatalog.readAt).toISOString()} ` +
          `(${lastGoodCatalog.vendors.length} vendors)`
      );
      return {
        vendors: lastGoodCatalog.vendors,
        stale: true,
        readAt: new Date(lastGoodCatalog.readAt),
      };
    }
    throw err;
  }
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
 * The interval at which observations have actually been arriving, estimated
 * from the timeline itself.
 *
 * The configured check interval is not exposed on any public endpoint, so the
 * record reports the cadence it can *measure* instead of asserting a schedule
 * it cannot see. Returns null when the window carries no observations.
 *
 * ── Why this is not simply `bucket / mean observations per bucket` ─────────
 *
 * It used to be, and that estimator is bounded above by the bucket length: an
 * occupied bucket holds at least one observation, so the mean over occupied
 * buckets is never below 1 and `bucket / mean` never exceeds `bucket`. When
 * the true interval is longer than the resolution - a 300-second schedule
 * aggregated into one-minute buckets, which is the deployed case - every
 * occupied bucket holds exactly one observation, the mean is 1, and the
 * estimator returns the bucket length. The public record printed "about every
 * 60 seconds" for a dependency probed every 300 seconds as a result.
 *
 * Density and spacing are complementary, so the estimator picks by regime:
 *
 *  - More than one observation per occupied bucket → the schedule is finer
 *    than the resolution, density carries the interval, and the bucket is not
 *    a ceiling. `bucket / mean` is correct here.
 *  - One observation per occupied bucket → density carries nothing (the empty
 *    buckets that would have carried it are not returned by the API at all),
 *    so the spacing between occupied bucket starts is used instead. The median
 *    rather than the mean, so a single missed probe does not move the answer.
 *
 * Both branches are resolution-independent in the regime they handle, which is
 * the property the old estimator lacked. The bound and the captured series
 * that exposed it are written up at
 * /research/measurement-integrity/probe-interval-from-bucketed-telemetry.
 */
export function observedCadenceSeconds(timeline: TrackTimeline | null): number | null {
  if (!timeline || !timeline.points.length) return null;

  const bucket = RESOLUTION_SECONDS[timeline.resolution];
  const occupied = timeline.points.filter((p) => p.observation_count > 0);
  if (!occupied.length) return null;

  const total = occupied.reduce((sum, p) => sum + p.observation_count, 0);
  const mean = total / occupied.length;

  // Regime 1: denser than the resolution.
  if (bucket && mean > 1) return Math.max(1, Math.round(bucket / mean));

  // Regime 2: sparser than the resolution - measure the spacing instead.
  const starts = occupied
    .map((p) => Date.parse(p.timestamp))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (starts.length >= 2) {
    const deltas: number[] = [];
    for (let i = 1; i < starts.length; i += 1) {
      const delta = (starts[i] - starts[i - 1]) / 1000;
      if (delta > 0) deltas.push(delta);
    }
    if (deltas.length) {
      deltas.sort((a, b) => a - b);
      const mid = Math.floor(deltas.length / 2);
      const median =
        deltas.length % 2 === 1 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
      return Math.max(1, Math.round(median));
    }
  }

  // Fallback: a single occupied bucket, so no spacing exists. Window length
  // over total observations is still resolution-independent, but it assumes
  // the window is fully covered - which a brand-new dependency's is not.
  const from = Date.parse(timeline.from);
  const to = Date.parse(timeline.to);
  if (Number.isFinite(from) && Number.isFinite(to) && total > 0) {
    return Math.max(1, Math.round((to - from) / 1000 / total));
  }

  // Not derivable. Printing the bucket length here is exactly the error this
  // function was rewritten to stop making.
  return null;
}
