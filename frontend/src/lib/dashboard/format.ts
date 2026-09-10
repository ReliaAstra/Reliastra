import { formatDistanceToNowStrict, format } from 'date-fns';

/**
 * Short human-quotable codes.
 *
 * `slice(0, 4)` after stripping only dashes produced collisions and garbage
 * on non-UUID identifiers: three different evidence rows with ids `ev_a1`,
 * `ev_a2`, `ev_a3` all rendered as `RPT-EV_A`, because the underscore
 * survived and the discriminating character was past position four. Strip
 * every non-alphanumeric and take the LAST characters, which is where entropy
 * actually lives in both UUIDs and prefixed ids.
 */
function shortCode(id: string, length = 4): string {
  const compact = id.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return compact.slice(-length) || compact || '0000';
}

export function incidentCode(id: string, displayId?: string): string {
  if (displayId) return displayId;
  return `INC-${shortCode(id)}`;
}

export function reportCode(id: string): string {
  return `RPT-${shortCode(id)}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export function formatUtc(iso: string | null | undefined, pattern = 'HH:mm'): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    const utc = new Date(date.getTime() + date.getTimezoneOffset() * 60_000);
    return `${format(utc, pattern)} UTC`;
  } catch {
    return '-';
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return '-';
  }
}

export function formatUptime(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}%`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  return Math.round(ms).toString();
}

export function durationBetween(start: string, end?: string | null): string {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const mins = Math.max(0, Math.round((to - from) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string | undefined | null, email?: string): string {
  const source = (name || email || 'U').trim();
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function confidenceFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.8) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

// `regionLabel` was removed with the console's multi-node surfaces. A check
// result still carries a `region` string - it is the scheduling label the
// worker stamps on the row - but the console never prints it as a place, so
// there is nothing left to format. See `src/lib/product-contract.ts`
// (OBSERVATION_POINT_COUNT) and
// `src/components/console/__tests__/single-observation-point.test.ts`.
