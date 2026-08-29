'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronRight,
  Info,
  Link2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { effectivePlanId, getPlan } from '@/lib/dashboard/plans';
import {
  useAlertConfigs,
  useDependencies,
  useHealth,
  useIncidents,
  useSummary,
  useVendors,
} from '@/lib/dashboard/queries';
import {
  formatLatency,
  formatUptime,
  incidentCode,
  timeAgo,
} from '@/lib/dashboard/format';
import { StatusBadge } from '../ui/status-badge';
import { RsButton } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { SectionHeader } from '../ui/section-header';
import { StatSkeleton, TableSkeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import type { Incident } from '@/lib/dashboard/types';

/** A single KPI tile on the overview grid. */
type OverviewStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  bg: string;
  color: string;
  /** Present only on tiles that render a plan-limit meter. */
  usage?: { used: number; total: number };
  /** Present only on tiles that render a sub-label. */
  context?: string;
  valueClass: string;
  iconClass: string;
};

function uptimeColor(v: number | null | undefined) {
  if (v == null) return 'text-rs-text-tertiary';
  if (v >= 99.9) return 'text-rs-text';
  if (v >= 99) return 'text-rs-degraded';
  return 'text-rs-down';
}

/**
 * Trial banner — state comes exclusively from the backend's
 * ``GET /v1/billing/plan`` (``is_trial_active``, ``trial_days_remaining``).
 * The client never computes or extends trial eligibility.
 */
function TrialBanner() {
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem('reliastra_dismiss_trial_banner') === '1');
  }, []);

  if (hidden || !plan) return null;

  const active = (plan.is_evaluation_active ?? plan.is_trial_active) === true;
  const length = plan.trial_length_days ?? 14;
  const left = plan.evaluation_days_remaining ?? plan.trial_days_remaining ?? 0;
  const elapsedPct = active ? Math.min(100, Math.round(((length - left) / length) * 100)) : 100;

  // ── Active evaluation: full product, not a cheap tier ──
  if (active && left > 0) {
    const urgent = left <= 3;
    return (
      <div className="rs-trial-banner relative mb-8 overflow-hidden rounded-xl border border-rs-brand/25 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="shrink-0 text-rs-brand" />
              <p className="rs-trial-title text-sm font-semibold">
                14-day full-access evaluation — every feature unlocked
              </p>
            </div>
            <p className="rs-trial-support mt-1 text-[13px] leading-relaxed">
              You have 14 days of full access to explore RELIASTRA without feature restrictions.
              You are on day {length - left + 1} of {length}. Upgrade before it ends and your
              limits and evidence reports carry over — nothing to reconfigure.
            </p>
            <div className="rs-trial-progress-track mt-3 h-1.5 max-w-md">
              <div
                className="rs-trial-progress-fill h-full rounded-full transition-[width] duration-500"
                data-urgent={urgent}
                style={{ width: `${elapsedPct}%` }}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            <span className="rs-trial-days font-mono text-2xl font-bold leading-none" data-urgent={urgent}>
              {left}
              <span className="ml-1 text-xs font-medium uppercase tracking-wide text-rs-text-tertiary">
                day{left === 1 ? '' : 's'} left
              </span>
            </span>
            <RsButton onClick={() => openUpgrade('trial')} className="whitespace-nowrap px-4 py-2 text-[13px]">
              Keep Pro
            </RsButton>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss trial banner"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
          onClick={() => {
            localStorage.setItem('reliastra_dismiss_trial_banner', '1');
            setHidden(true);
          }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // ── Evaluation ended: preserved data, clear fallback ──
  if (!active && effectivePlanId(plan) === 'free') {
    const fb = plan.fallback_info;
    return (
      <div className="relative mb-6 rounded-[10px] border border-amber-200 bg-amber-50 px-[18px] py-3.5 dark:border-amber-900/30 dark:bg-amber-950/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 pr-2">
            <Info size={16} className="mt-0.5 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-rs-text">Your full-access evaluation has ended.</p>
              <p className="mt-0.5 text-[13px] text-rs-text-secondary">
                Your account has returned to the Free plan. Your configuration and historical data are
                preserved. Some capabilities are now paused because they exceed Free-plan limits.
                {fb ? (
                  <>
                    {' '}
                    <strong>{fb.dependencies_configured}</strong> dependencies configured ·{' '}
                    <strong>{Math.min(fb.dependencies_configured, fb.free_dependency_limit)}</strong> active on Free ·{' '}
                    <strong>{fb.dependencies_paused_if_expired}</strong> paused.
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <RsButton variant="secondary" className="hidden shrink-0 px-3.5 py-1.5 text-[13px] sm:inline-flex" onClick={() => openUpgrade()}>
            View plans
          </RsButton>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Welcome experience — premium enterprise setup. Replaces the generic checklist.
 * Shows only while workspace is empty. Directs to the dedicated onboarding flow.
 */
function WelcomePanel({ onStart }: { onStart: () => void }) {
  const user = useAppStore((s) => s.user);
  const firstName = (user?.full_name || '').split(' ')[0];
  const router = useRouter();

  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
      <div className="p-6 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="rs-eyebrow">Welcome</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text sm:text-2xl">
              Let&apos;s build your external reliability picture
              {firstName ? `, ${firstName}` : ''}.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-rs-text-secondary">
              Reliastra is independent observation for the services you depend on. We check your critical
              endpoints from <span className="font-medium text-rs-text">multiple regions</span>, correlate failures with quorum, and produce{' '}
              <span className="font-medium text-rs-text">timestamped, checksummed evidence</span> you can use with vendors and in SLA reviews.
              No synthetic data. No guesswork.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['Monitor', 'Your endpoints, our regions'],
                ['Correlate', 'Quorum + attribution'],
                ['Prove', 'Verifiable reports'],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-lg border border-rs-border-subtle bg-rs-base px-3 py-3">
                  <div className="text-xs font-semibold text-rs-text">{title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-rs-text-tertiary">{desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <RsButton onClick={() => router.push('/onboarding')}>
                Start guided setup
                <ChevronRight size={16} />
              </RsButton>
              <RsButton variant="secondary" onClick={onStart}>
                <Plus size={16} />
                Add dependency directly
              </RsButton>
              <a
                href="mailto:support@reliastra.com"
                className="rounded-lg px-3 py-2 text-sm text-rs-text-tertiary hover:text-rs-text hover:bg-rs-hover"
              >
                Talk to support
              </a>
            </div>
            <p className="mt-3 text-xs text-rs-text-tertiary">
              Guided setup takes ~5 minutes. You&apos;ll see a live observation before you finish — 14-day full-access evaluation, no card.
            </p>
          </div>
          <div className="hidden w-[320px] shrink-0 lg:block">
            <div className="rounded-xl border border-rs-border-subtle bg-rs-base p-4">
              <div className="rs-mono text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">What you&apos;ll do</div>
              <ol className="mt-3 space-y-2.5 text-sm">
                {[
                  'Choose your context (20s)',
                  'Connect first dependency',
                  'Validate & observe',
                  'See evidence model',
                  'Enable alerts',
                ].map((step, i) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rs-elevated border border-rs-border-subtle rs-mono text-xs font-medium text-rs-text-tertiary">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-6 text-rs-text-secondary">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 rounded-lg bg-rs-elevated px-3 py-2.5 text-xs leading-relaxed text-rs-text-tertiary">
                <span className="font-medium text-rs-text">Why it matters:</span> within 30 minutes you&apos;ll understand exactly what Reliastra observes, what an incident looks like, and why you&apos;d want this running continuously.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NextBestActionBanner({
  deps,
  hasAlerts,
  onAdd,
}: {
  deps: number;
  hasAlerts: boolean;
  onAdd: () => void;
}) {
  const router = useRouter();
  if (deps === 0) {
    return (
      <div className="mb-6 rounded-xl border border-rs-brand/20 bg-rs-brand-subtle p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="rs-label text-rs-text">Next step</p>
            <p className="mt-1 text-sm font-semibold text-rs-text">Add your first critical dependency</p>
            <p className="mt-1 text-sm text-rs-text-secondary">We&apos;ll validate it live and show your first observation within 60 seconds.</p>
          </div>
          <RsButton onClick={onAdd} className="shrink-0">
            <Plus size={16} /> Add dependency
          </RsButton>
        </div>
      </div>
    );
  }
  if (!hasAlerts) {
    return (
      <div className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="rs-label">Next step</p>
            <p className="mt-1 text-sm font-semibold text-rs-text">Configure incident alerts</p>
            <p className="mt-1 text-sm text-rs-text-secondary">Email is enabled by default — add Slack on Pro and above.</p>
          </div>
          <RsButton variant="secondary" onClick={() => router.push('/settings')}>
            Configure alerts
          </RsButton>
        </div>
      </div>
    );
  }
  if (deps === 1) {
    return (
      <div className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="rs-label">Next step</p>
            <p className="mt-1 text-sm font-semibold text-rs-text">Add your second dependency</p>
            <p className="mt-1 text-sm text-rs-text-secondary">A second endpoint makes correlation and evidence meaningful.</p>
          </div>
          <RsButton variant="secondary" onClick={onAdd}>
            Add dependency
          </RsButton>
        </div>
      </div>
    );
  }
  return null;
}

function HealthTable() {
  const { data, isLoading, isError, refetch } = useHealth();
  const router = useRouter();
  if (isLoading) return <TableSkeleton />;
  if (isError) {
    return (
      <div className="mt-4 rounded-xl border border-rs-border-subtle bg-rs-elevated p-8 text-center">
        <p className="text-sm text-rs-text-secondary">Could not load dependency health.</p>
        <RsButton variant="secondary" className="mt-3" onClick={() => refetch()}>Retry</RsButton>
      </div>
    );
  }
  if (!data?.length) return null;

  return (
    <>
      {/* Desktop table */}
      <div className="rs-table-wrap mt-4 hidden overflow-hidden lg:block">
        <table className="rs-table w-full border-separate border-spacing-0">
          <thead>
            <tr className="rs-table-header h-11 border-b border-rs-border-subtle">
              {['Name', 'Status', 'Uptime 24h', 'Latency', 'Last check', ''].map((h) => (
                <th
                  key={h}
                  className={cn(
                    'px-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary',
                    ['Uptime 24h', 'Latency', 'Last check', ''].includes(h) && 'text-right'
                  )}
                  style={{ width: h === 'Status' ? 120 : h === 'Uptime 24h' ? 110 : h === 'Latency' ? 90 : h === 'Last check' ? 120 : h === '' ? 40 : undefined }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.dependency_id}
                onClick={() => router.push(`/dependencies/${row.dependency_id}`)}
                className={cn(
                  'rs-table-row h-14 cursor-pointer transition-colors duration-150 hover:bg-rs-hover',
                  i !== data.length - 1 && 'border-b border-rs-border-subtle'
                )}
              >
                <td className="px-4">
                  <div className="text-sm font-medium text-rs-text">{row.name}</div>
                  <div className="mt-1 max-w-[280px] truncate font-mono text-xs text-rs-text-tertiary">
                    {row.endpoint_url}
                  </div>
                </td>
                <td className="px-4"><StatusBadge status={row.current_status} /></td>
                <td className="px-4 text-right font-mono text-sm text-rs-text">
                  {row.current_status === 'unknown' || row.uptime_percentage_24h === null ? (
                    <span className="text-rs-text-tertiary">—</span>
                  ) : (
                    formatUptime(row.uptime_percentage_24h)
                  )}
                </td>
                <td className="px-4 text-right font-mono text-sm text-rs-text">
                  {row.current_status === 'unknown' || row.uptime_percentage_24h === null ? (
                    <span className="text-rs-text-tertiary">—</span>
                  ) : (
                    <>
                      {formatLatency(row.avg_latency_ms_24h)}
                      <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                    </>
                  )}
                </td>
                <td className="px-4 text-right text-xs text-rs-text-tertiary">
                  {row.current_status === 'unknown' || !row.last_check_at ? '—' : timeAgo(row.last_check_at)}
                </td>
                <td className="px-4 text-right">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-rs-text-tertiary">
                    View <ChevronRight size={14} className="text-rs-text-tertiary" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="mt-4 space-y-3 lg:hidden">
        {data.map((row) => (
          <Link
            key={row.dependency_id}
            href={`/dependencies/${row.dependency_id}`}
            className="block rounded-xl border border-rs-border-subtle bg-rs-elevated p-4 transition-[border-color] duration-150 hover:border-rs-border"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-rs-text">{row.name}</div>
              <StatusBadge status={row.current_status} />
            </div>
            <div className="mt-1 truncate font-mono text-xs text-rs-text-tertiary">{row.endpoint_url}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-rs-text-tertiary">Uptime</div>
                <div className="font-mono text-rs-text">{formatUptime(row.uptime_percentage_24h)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.05em] text-rs-text-tertiary">Latency</div>
                <div className="font-mono text-rs-text">{formatLatency(row.avg_latency_ms_24h)} ms</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="block rounded-xl border border-rs-border-subtle bg-rs-elevated px-5 py-4 transition-[border-color] duration-150 hover:border-rs-border"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-xs font-medium text-rs-text-accent">
            {incidentCode(incident.id, incident.display_id)}
          </span>
          <span className="ml-2 text-sm font-medium text-rs-text">
            {incident.title || incident.root_cause || 'Incident'}
          </span>
        </div>
        <StatusBadge status={incident.status} />
      </div>
      <div className="mt-2 text-xs text-rs-text-tertiary">
        {incident.severity} · started {timeAgo(incident.started_at)}
      </div>
    </Link>
  );
}

export function OverviewPage() {
  const { data: summary, isLoading } = useSummary();
  const { data: incidents, isLoading: incLoading } = useIncidents('open', 5);
  const { data: vendors, isLoading: vLoading } = useVendors();
  const { data: deps } = useDependencies();
  const { data: configs } = useAlertConfigs();
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const org = useAppStore((s) => s.org);
  // Authoritative limit — reflects the effective (trial-aware) entitlement.
  const limit = plan?.max_dependencies ?? getPlan(plan?.effective_plan ?? plan?.plan).dependencies;
  const router = useRouter();

  const used = summary?.active_dependencies_count ?? deps?.length ?? 0;
  const depCount = deps?.length ?? 0;
  const hasAlerts = Boolean(configs && configs.length > 0);
  const isEmptyWorkspace = !isLoading && used === 0 && depCount === 0;

  const handleAdd = () => {
    if (limit != null && used >= limit) useAppStore.getState().openUpgrade('limit');
    else setAdd(true);
  };

  // Explicit element type: inferred from the literals, `usage` and
  // `context` exist on only one member, so narrowing on `'usage' in s`
  // collapsed the else-branch to `never` and the build failed.
  const stats: OverviewStat[] = [
    {
      label: 'Dependencies',
      value: String(used),
      icon: Link2,
      bg: 'rgba(37,99,235,0.1)',
      color: '#2563EB',
      usage: { used, total: limit ?? used },
      valueClass: 'text-rs-text',
      iconClass: 'rs-stat-icon-brand',
    },
    {
      label: 'Open incidents',
      value: String(summary?.open_incidents_count ?? 0),
      icon: AlertTriangle,
      bg: 'rgba(239,68,68,0.1)',
      color: '#EF4444',
      valueClass: (summary?.open_incidents_count ?? 0) > 0 ? 'text-rs-down' : 'text-rs-text',
      iconClass: 'rs-stat-icon-down',
    },
    {
      label: 'Overall uptime',
      value: formatUptime(summary?.overall_uptime_percentage),
      icon: Activity,
      bg: 'rgba(16,185,129,0.1)',
      color: '#10B981',
      valueClass: uptimeColor(summary?.overall_uptime_percentage),
      iconClass: 'rs-stat-icon-up',
    },
    {
      label: 'Alerts today',
      value: String(summary?.alerts_today_count ?? 0),
      icon: Bell,
      bg: 'rgba(245,158,11,0.1)',
      color: '#F59E0B',
      valueClass: (summary?.alerts_today_count ?? 0) > 0 ? 'text-rs-degraded' : 'text-rs-text',
      iconClass: 'rs-stat-icon-degraded',
    },
  ];

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-3">
        <div>
          <h1 className="rs-page-title text-2xl font-semibold tracking-[-0.02em]">
            {org?.name ? `${org.name}` : 'Dashboard'}
          </h1>
          <p className="mt-1.5 text-sm text-rs-text-tertiary">
            External dependency health and incident correlation.
          </p>
        </div>
        <RsButton onClick={handleAdd} className="shrink-0">
          <Plus size={16} />
          Add dependency
        </RsButton>
      </div>

      {isEmptyWorkspace && <WelcomePanel onStart={handleAdd} />}

      <TrialBanner />

      {!isEmptyWorkspace && !isLoading && (
        <NextBestActionBanner deps={depCount} hasAlerts={hasAlerts} onAdd={handleAdd} />
      )}

      {/* Primary signal — promoted when an open incident needs attention */}
      {!isLoading && (summary?.open_incidents_count ?? 0) > 0 && incidents && incidents[0] && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-rs-down/20 bg-rs-down-bg px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-rs-down rs-pulse-down" aria-hidden />
            <p className="text-sm text-rs-text">
              <span className="font-semibold">
                {incidents[0].title || incidents[0].vendor || 'Open incident'}
              </span>
              <span className="mx-2 text-rs-border">·</span>
              <span className="text-rs-text-secondary">
                {incidents[0].severity} · {incidents[0].status}
              </span>
            </p>
          </div>
          <Link
            href={`/incidents/${incidents[0].id}`}
            className="shrink-0 text-sm font-medium text-rs-down hover:underline"
          >
            View incident →
          </Link>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : stats.map((s) => {
              const Icon = s.icon;
              const ratio = 'usage' in s && s.usage ? s.usage.used / Math.max(s.usage.total, 1) : 0;
              return (
                <div
                  key={s.label}
                  className="rs-stat-card rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 transition-[border-color] duration-150 hover:border-rs-border"
                >
                  <div
                    className={cn('rs-stat-icon-tile mb-4 flex h-9 w-9 items-center justify-center rounded-lg', s.iconClass)}
                    style={{ background: s.bg }}
                  >
                    <Icon size={18} color={s.color} />
                  </div>
                  <div className="rs-stat-label mb-2 text-xs font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
                    {s.label}
                  </div>
                  <div className={cn('rs-stat-value font-mono text-[32px] font-bold leading-none tracking-[-0.02em]', s.valueClass)}>
                    {s.value}
                  </div>
                  {s.usage ? (
                    <div className="mt-3">
                      <div className="rs-usage-meter h-1 w-full overflow-hidden rounded-full bg-rs-hover">
                        <div
                          className={cn(
                            'rs-usage-meter-fill h-full rounded-full',
                            ratio >= 0.8 ? 'bg-rs-degraded' : 'bg-rs-brand'
                          )}
                          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-rs-text-tertiary">
                          {used} / {limit}
                        </span>
                        {ratio >= 0.6 && (
                          <button
                            type="button"
                            onClick={() => useAppStore.getState().openUpgrade('limit')}
                            className="rs-usage-meter-link text-[11px] font-medium text-rs-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                          >
                            Need more?
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    s.context && <div className="rs-stat-context mt-2 text-xs text-rs-text-tertiary">{s.context}</div>
                  )}
                </div>
              );
            })}
      </div>

      {!isEmptyWorkspace && (
        <>
          <SectionHeader
            title="Dependency health"
            subtitle="Real-time status from independent regional checks."
            href="/dependencies"
          />
          <HealthTable />

          <div className="mt-8">
            <SectionHeader
              title="Recent incidents"
              subtitle="Open issues correlated across your stack."
              href="/incidents"
            />
            <div className="mt-4 flex flex-col gap-3">
              {incLoading ? (
                <TableSkeleton rows={3} />
              ) : !incidents?.length ? (
                <EmptyState
                  icon={<AlertTriangle size={32} />}
                  title="No incident evidence yet"
                  body="Your dependencies are currently being observed from multiple regions. When Reliastra identifies meaningful degradation that passes quorum, a correlated incident with evidence will appear here."
                  actionLabel="View dependencies"
                  onAction={() => router.push('/dependencies')}
                  helpLabel="How evidence works"
                  onHelp={() => router.push('/onboarding')}
                />
              ) : (
                incidents.slice(0, 5).map((inc) => <IncidentCard key={inc.id} incident={inc} />)
              )}
            </div>
          </div>

          <div className="mt-8">
            <SectionHeader
              title="Live vendor status"
              subtitle="Public vendor posture from the Reliastra network."
              href="/track"
            />
            {vLoading ? (
              <div className="mt-4"><TableSkeleton rows={4} /></div>
            ) : !vendors?.length ? (
              <EmptyState
                icon={<Activity size={32} />}
                title="No public vendors tracked yet"
                body="As vendors join the Reliastra network, their posture appears here."
              />
            ) : (
              <>
                <div className="rs-table-wrap mt-4 hidden overflow-hidden lg:block">
                  <table className="rs-table w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="rs-table-header h-11">
                        {['Vendor', 'Status', 'Last check'].map((h) => (
                          <th key={h} className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(vendors ?? []).slice(0, 6).map((v, i, arr) => (
                        <tr
                          key={v.id}
                          onClick={() => router.push(`/track/${v.vendor_name}`)}
                          className={cn('rs-table-row h-14 cursor-pointer hover:bg-rs-hover', i !== arr.length - 1 && 'border-b border-rs-border-subtle')}
                        >
                          <td className="px-4 text-sm font-medium text-rs-text">{v.display_name}</td>
                          <td className="px-4"><StatusBadge status={v.recent_status} disablePulse /></td>
                          <td className="px-4 text-xs text-rs-text-tertiary">{timeAgo(v.last_check_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:hidden">
                  {(vendors ?? []).slice(0, 6).map((v) => (
                    <Link
                      key={v.id}
                      href={`/track/${v.vendor_name}`}
                      className="min-w-[200px] snap-start rounded-xl border border-rs-border-subtle bg-rs-elevated p-4"
                    >
                      <div className="text-sm font-medium text-rs-text">{v.display_name}</div>
                      <div className="mt-2"><StatusBadge status={v.recent_status} disablePulse /></div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
