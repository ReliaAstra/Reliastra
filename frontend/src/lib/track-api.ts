/**
 * Server-side data access for the public Track experience.
 *
 * Fetches the real public vendor API (rate-limited, Redis-cached on the
 * backend) directly from the RELIASTRA API using the same base URL the
 * client-side proxy uses. Nothing here fabricates values: every field
 * rendered on /track comes from these responses, and failures surface as
 * explicit error/empty states.
 */

const BACKEND_URL =
  process.env.RELIASTRA_API_URL?.replace(/\/$/, '') ||
  'https://api.reliastra.com';

const REVALIDATE_SECONDS = 60;

export interface TrackVendorListItem {
  id: string;
  vendor_name: string;
  display_name: string;
  category: string;
  is_public: boolean;
  last_check_at: string | null;
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

export interface TrackCurrent {
  timestamp: string | null;
  latency_ms: number | null;
  status_code: number | null;
  is_up: boolean | null;
}

export interface TrackDeveloperInfo {
  vendor: {
    id: string;
    vendor_name: string;
    display_name: string;
    category: string;
    is_public: boolean;
    last_check_at: string | null;
    recent_status?: string;
    endpoints: TrackEndpoint[];
  };
  current_status: TrackCurrent;
  metrics_24h: {
    metrics: Record<string, { window: string; total_observations: number; uptime_percentage: number; avg_latency_ms: number; p95_latency_ms: number | null }>;
  };
  recent_incidents: Array<{
    incident_id: string;
    dependency_name: string;
    started_at: string;
    resolved_at: string | null;
    severity: string;
    status: string;
    duration_seconds: number | null;
  }>;
  uptime_7d: number;
  uptime_30d: number;
  avg_latency_24h: number;
  p95_latency_24h: number | null;
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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}/v1${path}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`Track API ${res.status} for ${path}`), { status: res.status });
  }
  return (await res.json()) as T;
}

/** First page of the public vendor catalog. */
export async function fetchTrackedVendors(limit = 60): Promise<TrackVendorsPage> {
  return getJson<TrackVendorsPage>(`/vendors?limit=${limit}`);
}

/**
 * Single aggregate call for one vendor — detail, current status, 24h
 * metrics, recent incidents, and 7d/30d uptime in one request.
 * Returns null for a 404 so callers can render "unknown vendor".
 */
export async function fetchVendorTrack(vendorName: string): Promise<TrackDeveloperInfo | null> {
  try {
    return await getJson<TrackDeveloperInfo>(
      `/vendors/${encodeURIComponent(vendorName)}/developer`
    );
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Public incidents with evidence availability for one vendor. */
export async function fetchVendorPublicIncidents(
  vendorName: string
): Promise<{ vendor_name: string; incidents: TrackPublicIncident[] }> {
  return getJson(`/vendors/${encodeURIComponent(vendorName)}/incidents/public`);
}
