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
