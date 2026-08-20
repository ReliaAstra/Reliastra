import type { AdminPeriod, AttentionItem, HealthStatus } from '@/types/admin';

export const ADMIN_PERIODS: Array<{ value: AdminPeriod; label: string }> = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: '365d', label: '12M' },
];

export function formatAdminCurrency(value: number | null | undefined, currency = 'USD', compact = false) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatMinorCurrency(value: number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return formatAdminCurrency(value / 100, currency);
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: Math.abs(value) > 999 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, options: { sign?: boolean; fractionDigits?: number } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const fractionDigits = options.fractionDigits ?? 1;
  const prefix = options.sign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(fractionDigits)}%`;
}

export function formatRatioPercent(value: number | null | undefined, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatAdminDate(value?: string | null, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    ...(includeTime
      ? { hour: 'numeric' as const, minute: '2-digit' as const }
      : {}),
  }).format(date);
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (Number.isNaN(elapsed)) return '—';
  const seconds = Math.max(0, Math.round(elapsed / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatAdminDate(value);
}

export function humanize(value?: string | null) {
  if (!value) return '—';
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function healthTone(status?: HealthStatus) {
  const normalized = String(status || 'unknown').toLowerCase();
  if (['healthy', 'ok', 'running', 'active', 'resolved'].includes(normalized)) return 'healthy';
  if (['critical', 'error', 'failed', 'down', 'banned'].includes(normalized)) return 'critical';
  if (['degraded', 'warning', 'pending', 'at_risk', 'churning', 'suspended'].includes(normalized)) return 'warning';
  return 'neutral';
}

export function attentionHref(item: AttentionItem): string {
  const params = new URLSearchParams();
  switch (item.target_resource) {
    case 'support_ticket':
      if (item.type === 'urgent_support') params.set('priority', 'urgent');
      if (item.type === 'unassigned_support') params.set('status', 'open');
      return `/admin/support${params.size ? `?${params.toString()}` : ''}`;
    case 'organization':
    case 'customer':
      return item.target_id ? `/admin/customers/${item.target_id}` : '/admin/customers?health=at_risk';
    case 'partner_payout':
    case 'partner':
      return '/admin/partners';
    case 'error_log':
    case 'operations':
      return '/admin/operations';
    case 'incident':
      return '/admin/product';
    default:
      break;
  }

  // Backend attention links intentionally point at API resources. Never send a
  // browser to them; translate only known client routes and otherwise land on
  // the relevant command-center page.
  if (item.href?.includes('/support/')) return '/admin/support';
  if (item.href?.includes('/operations/')) return '/admin/operations';
  if (item.href?.includes('/partners/')) return '/admin/partners';
  if (item.href?.includes('/customers/')) return '/admin/customers';
  return '/admin';
}

export function searchHitHref(resourceType: string, id: string, title: string) {
  switch (resourceType) {
    case 'customer':
      return `/admin/customers/${id}`;
    case 'organization':
      return `/admin/customers?search=${encodeURIComponent(title)}`;
    case 'ticket':
      return `/admin/support/${id}`;
    case 'partner':
      return `/admin/partners/${id}`;
    case 'campaign':
      return `/admin/communications?campaign=${encodeURIComponent(id)}`;
    default:
      return '/admin';
  }
}

export function initials(name?: string | null) {
  if (!name) return 'A';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  return tokens.slice(0, 2).map((token) => token[0]).join('').toUpperCase() || 'A';
}
