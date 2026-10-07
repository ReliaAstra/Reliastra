/**
 * Normalized inputs for the infrastructure globe. The renderer only receives
 * claims the measurement layer can support; unknown coordinates stay null and
 * are never inferred from a region label.
 */
export type InfrastructureGlobeMode =
  | 'landing'
  | 'observatory'
  | 'incident'
  | 'evidence'
  | 'dependency'
  | 'login';

export type InfrastructureState = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface ObservationPoint {
  id: string;
  label: string;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  state: InfrastructureState;
  observedAt: string | null;
}

export interface GlobeDependency {
  id: string;
  name: string;
  endpoint?: string | null;
  category?: string | null;
  status: InfrastructureState;
  statusLabel: string;
  regionLabels: string[];
  lastObservedAt: string | null;
  latencyMs: number | null;
  href: string;
}

export interface GlobeIncident {
  id: string;
  dependencyId: string;
  affectedRegions: string[];
  severity: InfrastructureState;
  agreement: number | null;
  startedAt: string | null;
  evidenceHref: string | null;
}

/* ── Continuous rotation ─────────────────────────────────────────────────── */

/**
 * How fast the globe turns without being touched.
 *
 * One full revolution every three minutes at the primary rate. That is slow
 * enough to stay a reference surface rather than a carousel, and fast enough
 * that a visitor who never touches it still sees the world move — the globe is
 * the only animated element on the page, so it carries the "this is live"
 * signal on its own.
 *
 * The sign-in backdrop drifts at half speed: it sits behind a form at 14%
 * opacity, where it is atmosphere and must never pull the eye off the fields.
 */
export const GLOBE_LONGITUDE_DEGREES_PER_SECOND = 2;
export const GLOBE_AMBIENT_LONGITUDE_DEGREES_PER_SECOND = 1;

/**
 * Longest frame gap still treated as continuous motion, in milliseconds.
 *
 * A stalled tab, a long main-thread task or a throttled background frame can
 * hand the animation loop a multi-second delta. Integrating it would teleport
 * the globe a visible arc in a single redraw; clamping spends the gap at the
 * normal rate instead, so the motion never jumps.
 */
export const GLOBE_MAX_ROTATION_STEP_MS = 500;

/** Keep longitude in [0, 360) so long sessions never accumulate precision loss. */
export function normalizeLongitude(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

/**
 * Advance longitude by `elapsedMs` at `degreesPerSecond`.
 *
 * Frame-rate independent by construction: the caller may redraw at 60Hz, 30Hz
 * or 12Hz (mobile and the ambient backdrop redraw less often) and the globe
 * still covers the same arc in the same wall-clock time.
 */
export function advanceLongitude(
  degrees: number,
  elapsedMs: number,
  degreesPerSecond: number,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return normalizeLongitude(degrees);
  const rate = Number.isFinite(degreesPerSecond) ? degreesPerSecond : 0;
  const step = (Math.min(elapsedMs, GLOBE_MAX_ROTATION_STEP_MS) / 1000) * rate;
  return normalizeLongitude(degrees + step);
}

/** Geographic placement is rendered only when both coordinates are real. */
export function hasPublishedCoordinates(point: ObservationPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude !== null &&
    point.longitude !== null &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}
