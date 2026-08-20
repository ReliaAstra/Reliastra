import { formatDistanceToNowStrict, format } from 'date-fns';

export function incidentCode(id: string, displayId?: string): string {
  if (displayId) return displayId;
  const compact = id.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `INC-${compact}`;
}

export function reportCode(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `RPT-${compact}`;
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
    return `${format(new Date(iso), pattern)} UTC`;
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

export function formatUptime(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(value >= 99.9 ? 2 : 2)}%`;
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

export function regionLabel(code: string): string {
  const map: Record<string, string> = {
    'us-east': 'US East',
    'us-west': 'US West',
    'eu-west': 'EU West',
    'ap-south': 'AP South',
    'ap-southeast': 'AP Southeast',
    'sa-east': 'SA East',
  };
  return map[code] || code;
}
