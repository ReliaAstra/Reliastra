import { SHARE_ROUTES, incidentSearchQuery } from '@/lib/routes';

/**
 * One place that decides what a `/observatory/incidents` parametrization IS:
 * which filters reach the API, which search engine gets to index the URL,
 * and what the canonical URL for it is.
 *
 * The discipline: the bare page and single-axis filters (one of vendor /
 * category / region / status) are indexable and canonical to themselves -
 * each is a deliberate intent ("Twilio incidents", "open incidents"). Every
 * other parametrization - time bounds, failure kind, multi-axis
 * combinations, pagination cursors, stray parameters - is `noindex, follow`
 * with a canonical to the base URL. An unbounded parameter space with
 * indexed URLs is a crawl trap; a bounded one with curated URLs is a
 * directory.
 */

/** The filter dimensions that can each form one indexable axis. */
export const INCIDENT_INDEX_AXES = ['vendor', 'category', 'region', 'status'] as const;

/** Query params the resolver knows how to read; anything else is URL litter. */
const KNOWN_PARAM_KEYS = new Set([
  ...INCIDENT_INDEX_AXES,
  'failure_kind',
  'since',
  'until',
  'cursor',
  'limit',
]);

export interface IncidentSearchFilters {
  vendor?: string;
  category?: string;
  region?: string;
  status?: 'open' | 'resolved';
  failureKind?: string;
  since?: string;
  until?: string;
}

export interface ResolvedIncidentSearch {
  filters: IncidentSearchFilters;
  cursor?: string;
  /** Whether this parametrization is allowed into the search index. */
  indexable: boolean;
  /** The canonical URL for this parametrization (never carries a cursor). */
  canonicalPath: string;
}

function pick(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = sp[key];
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveIncidentSearch(
  sp: Record<string, string | string[] | undefined>
): ResolvedIncidentSearch {
  const vendor = pick(sp, 'vendor')?.toLowerCase();
  const category = pick(sp, 'category')?.toLowerCase();
  const region = pick(sp, 'region')?.toLowerCase();
  const rawStatus = pick(sp, 'status')?.toLowerCase();
  const status = rawStatus === 'open' || rawStatus === 'resolved' ? rawStatus : undefined;
  const failureKind = pick(sp, 'failure_kind')?.toLowerCase();
  const since = pick(sp, 'since');
  const until = pick(sp, 'until');
  const cursor = pick(sp, 'cursor');

  const stray = Object.keys(sp).filter(
    (k) => !KNOWN_PARAM_KEYS.has(k) && pick(sp, k)
  );

  const activeAxes = INCIDENT_INDEX_AXES.filter(
    (axis) =>
      ({ vendor, category, region, status } as Record<string, string | undefined>)[axis]
  );

  const indexable =
    !cursor &&
    activeAxes.length <= 1 &&
    !failureKind &&
    !since &&
    !until &&
    stray.length === 0;

  /**
   * The canonical keeps only the recognized axes, never the cursor, the
   * time bounds or the failure kind: those filter the view, they do not
   * define a resource. A parametrization that is not indexable canonicalizes
   * to the base search URL rather than to a look-alike param URL.
   */
  const canonicalPath = indexable
    ? incidentSearchQuery({ vendor, category, region, status })
    : SHARE_ROUTES.observatoryIncidents;

  return {
    filters: { vendor, category, region, status, failureKind, since, until },
    cursor,
    indexable,
    canonicalPath,
  };
}

/** Presentational label for the detector's failure-kind enum. */
export function failureKindLabel(kind: string): string {
  switch (kind) {
    case 'http_5xx':
      return 'HTTP 5xx responses';
    case 'http_4xx':
      return 'HTTP 4xx responses';
    case 'transport':
      return 'Transport failure';
    case 'timeout':
      return 'Probe timeouts';
    case 'mixed':
      return 'Mixed failure modes';
    default:
      return 'Not classified';
  }
}
