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
import { getPlan, nextPlan, trialInfo, TRIAL_LENGTH_DAYS } from '@/lib/dashboard/plans';
import {
  useHealth,
  useIncidents,
  useSummary,
  useVendors,
} from '@/lib/dashboard/queries';
import {
  confidenceFromScore,
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

function uptimeColor(v: number) {
  if (v >= 99.9) return 'text-rs-text';
  if (v >= 99) return 'text-rs-degraded';
  return 'text-rs-down';
}

function TrialBanner() {
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const { data: summary } = useSummary();
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.plan);
  const trial = trialInfo(org?.created_at);
  const [hidden, setHidden] = useState(false);
  const count = summary?.active_dependencies_count ?? 0;

  useEffect(() => {
    setHidden(localStorage.getItem('reliastra_dismiss_trial_banner') === '1');
  }, []);

  if (hidden) return null;

  // ── Active trial: countdown + what you keep when you upgrade ──
  if (trial.active) {
    const urgent = trial.daysLeft <= 3;
    return (
      <div className="rs-trial-banner relative mb-8 overflow-hidden rounded-xl border border-rs-brand/25 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="shrink-0 text-rs-brand" />
              <p className="rs-trial-title text-sm font-semibold">
                Professional Trial — {TRIAL_LENGTH_DAYS} days, every feature unlocked
              </p>
            </div>
            <p className="rs-trial-support mt-1 text-[13px] leading-relaxed">
              You are on day {TRIAL_LENGTH_DAYS - trial.daysLeft} of {TRIAL_LENGTH_DAYS}.{' '}
              Upgrade before it ends and your 100 dependencies, 5-second checks,
              branded evidence reports and API access carry over — nothing to reconfigure.
            </p>
            <div className="rs-trial-progress-track mt-3 h-1.5 max-w-md">
              <div
                className="rs-trial-progress-fill h-full rounded-full transition-[width] duration-500"
                data-urgent={urgent}
                style={{ width: `${Math.round(trial.elapsedPct * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            <span
              className="rs-trial-days font-mono text-2xl font-bold leading-none"
              data-urgent={urgent}
            >
              {trial.daysLeft}
              <span className="ml-1 text-xs font-medium uppercase tracking-wide text-rs-text-tertiary">
                day{trial.daysLeft === 1 ? '' : 's'} left
              </span>
            </span>
            <RsButton onClick={() => openUpgrade('trial')} className="whitespace-nowrap px-4 py-2 text-[13px]">
              Keep Professional
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

  // ── Post-trial free plan: usage nudge ──
  if (current.id !== 'free') return null;
  if (count < 2) return null;
  const nxt = nextPlan(current.id);

  return (
    <div className="relative mb-6 flex items-center justify-between rounded-[10px] border border-[rgba(37,99,235,0.2)] bg-rs-brand-subtle px-[18px] py-3.5">
      <div className="flex items-start gap-3 pr-8">
        <Info size={16} className="mt-0.5 text-rs-brand" />
        <div>
          <p className="text-sm text-rs-text">
            You are monitoring {count} of {current.dependencies} dependencies on the Free plan.
          </p>
          <p className="mt-0.5 text-[13px] text-rs-text-secondary">
            Upgrade to {nxt.name} for {nxt.dependencies} dependencies and {nxt.retention} of history.
          </p>
        </div>
      </div>
      <RsButton
        className="hidden shrink-0 px-3.5 py-1.5 text-[13px] sm:inline-flex"
        onClick={() => openUpgrade('limit')}
      >
        Upgrade to {nxt.name}
      </RsButton>
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-rs-text-tertiary hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
        onClick={() => {
          localStorage.setItem('reliastra_dismiss_limit_banner', '1');
          setHidden(true);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function HealthTable() {
  const { data, isLoading } = useHealth();
  const router = useRouter();
  if (isLoading) return <TableSkeleton />;
  if (!data?.length) {
    return (
      <EmptyState
        icon={<Link2 size={32} />}
        title="No dependencies monitored"
        body="Add your first vendor to start tracking external health."
        actionLabel="Add dependency"
        onAction={() => useAppStore.getState().setAddDependencyOpen(true)}
        helpLabel="How do dependencies work?"
          onHelp={() => window.open('mailto:support@reliastra.com?subject=How%20do%20dependencies%20work%3F')}
      />
    );
  }

  return (
    <>
      {/* Desktop table — ≥1024px per spec */}
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
                data-clickable="true"
              >
                <td className="px-4">
                  <div className="text-sm font-medium text-rs-text">{row.name}</div>
                  <div className="mt-1 max-w-[280px] truncate font-mono text-xs text-rs-text-tertiary">
                    {row.endpoint_url}
                  </div>
                </td>
                <td className="px-4"><StatusBadge status={row.current_status} /></td>
                <td className="px-4 text-right font-mono text-sm text-rs-text">
                  {formatUptime(row.uptime_percentage_24h)}
                </td>
                <td className="px-4 text-right font-mono text-sm text-rs-text">
                  {formatLatency(row.avg_latency_ms_24h)}
                  <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                </td>
                <td className="px-4 text-right text-xs text-rs-text-tertiary">
                  {timeAgo(row.last_check_at)}
                </td>
                <td className="px-4 text-right">
                  <ChevronRight size={16} className="rs-table-chevron ml-auto text-rs-text-tertiary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards — <1024px stacked */}
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
  const conf =
    incident.confidence ||
    (incident as { correlation_confidence?: number }).correlation_confidence != null
      ? confidenceFromScore((incident as { correlation_confidence?: number }).correlation_confidence ?? 0.9)
      : 'HIGH';
  const accent =
    incident.severity === 'critical'
      ? 'bg-rs-down'
      : incident.severity === 'major'
        ? 'bg-rs-degraded'
        : 'bg-rs-text-tertiary';
  const confColor =
    conf === 'HIGH' ? 'text-rs-up' : conf === 'MEDIUM' ? 'text-rs-degraded' : 'text-rs-text-tertiary';
  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="relative block overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated px-5 py-4 transition-[border-color] duration-150 hover:border-rs-border"
    >
      <span className={cn('absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl', accent)} />
      <div className="flex items-start justify-between">
        <div className="flex items-center">
          <span className="font-mono text-xs font-medium text-rs-text-accent">
            {incidentCode(incident.id, incident.display_id)}
          </span>
          <span className="ml-2 text-sm font-medium text-rs-text">
            {incident.title || incident.description || 'Incident'}
          </span>
        </div>
        <span className="text-xs text-rs-text-tertiary">{timeAgo(incident.started_at)}</span>
      </div>
      <div className="mt-2 text-xs text-rs-text-tertiary">
        {incident.vendor || 'Vendor'} / {incident.region || 'Multi-region'} ·{' '}
        <span className={confColor}>{conf}</span> · {timeAgo(incident.started_at)}
      </div>
    </Link>
  );
}

export function OverviewPage() {
  const { data: summary, isLoading } = useSummary();
  const { data: incidents, isLoading: incLoading } = useIncidents('open', 5);
  const { data: vendors, isLoading: vLoading } = useVendors();
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const current = getPlan(plan?.plan);
  const router = useRouter();

  // Explicit element type: inferred from the literals, `usage` and
  // `context` exist on only one member, so narrowing on `'usage' in s`
  // collapsed the else-branch to `never` and the build failed.
  const stats: OverviewStat[] = [
    {
      label: 'Dependencies',
      value: summary?.active_dependencies_count ?? 0,
      icon: Link2,
      bg: 'rgba(37,99,235,0.1)',
      color: '#2563EB',
      usage: {
        used: summary?.active_dependencies_count ?? 0,
        total: current.dependencies,
      },
      context: `${Math.max(0, current.dependencies - (summary?.active_dependencies_count ?? 0))} remaining of ${current.dependencies}`,
      valueClass: 'text-rs-text',
      iconClass: 'rs-stat-icon-brand',
    },
    {
      label: 'Open incidents',
      value: summary?.open_incidents_count ?? 0,
      icon: AlertTriangle,
      bg: 'rgba(239,68,68,0.1)',
      color: '#EF4444',
      valueClass: (summary?.open_incidents_count ?? 0) > 0 ? 'text-rs-down' : 'text-rs-text',
      iconClass: 'rs-stat-icon-down',
    },
    {
      label: 'Overall uptime',
      value: formatUptime(summary?.overall_uptime_percentage ?? 0),
      icon: Activity,
      bg: 'rgba(16,185,129,0.1)',
      color: '#10B981',
      valueClass: uptimeColor(summary?.overall_uptime_percentage ?? 100),
      iconClass: 'rs-stat-icon-up',
    },
    {
      label: 'Alerts today',
      value: summary?.alerts_today_count ?? 0,
      icon: Bell,
      bg: 'rgba(245,158,11,0.1)',
      color: '#F59E0B',
      valueClass: (summary?.alerts_today_count ?? 0) > 0 ? 'text-rs-degraded' : 'text-rs-text',
      iconClass: 'rs-stat-icon-degraded',
    },
  ];

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="rs-page-title text-2xl font-semibold tracking-[-0.02em]">Dashboard</h1>
          <p className="mt-1.5 text-sm text-rs-text-tertiary">
            Monitor your external dependencies and incident correlation.
          </p>
        </div>
        <RsButton
          onClick={() => {
            const count = summary?.active_dependencies_count ?? 0;
            if (count >= current.dependencies) useAppStore.getState().openUpgrade('limit');
            else setAdd(true);
          }}
        >
          <Plus size={16} />
          Add dependency
        </RsButton>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : stats.map((s) => {
              const Icon = s.icon;
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
                            s.usage.used / s.usage.total >= 0.8 ? 'bg-rs-degraded' : 'bg-rs-brand'
                          )}
                          data-level={s.usage.used / s.usage.total >= 0.8 ? 'warn' : 'ok'}
                          style={{
                            width: `${Math.min(100, Math.round((s.usage.used / s.usage.total) * 100))}%`,
                          }}
                        />
                      </div>
                      {s.usage.used / s.usage.total >= 0.6 && (
                        <button
                          type="button"
                          onClick={() => useAppStore.getState().openUpgrade('limit')}
                          className="rs-usage-meter-link mt-1.5 text-[11px] font-medium text-rs-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                        >
                          Need more? See paid tiers →
                        </button>
                      )}
                    </div>
                  ) : (
                    s.context && <div className="rs-stat-context mt-2 text-xs text-rs-text-tertiary">{s.context}</div>
                  )}
                </div>
              );
            })}
      </div>

      <TrialBanner />

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
              title="No open incidents"
              body="When a dependency fails quorum, it will appear here with correlation context."
              actionLabel="View dependencies"
              onAction={() => router.push('/dependencies')}
              helpLabel="How does correlation work?"
              onHelp={() => window.open('mailto:support@reliastra.com?subject=How%20does%20correlation%20work%3F')}
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
          href="/dependencies"
        />
        {vLoading ? (
          <div className="mt-4"><TableSkeleton rows={4} /></div>
        ) : (
          <>
            <div className="rs-table-wrap mt-4 hidden overflow-hidden lg:block">
              <table className="rs-table w-full border-separate border-spacing-0">
                <thead>
                  <tr className="rs-table-header h-11">
                    {['Vendor', 'Status', 'Uptime 24h', 'Latency', 'Last check'].map((h) => (
                      <th key={h} className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(vendors ?? []).slice(0, 6).map((v, i, arr) => (
                    <tr key={v.id} className={cn('rs-table-row h-14', i !== arr.length - 1 && 'border-b border-rs-border-subtle')}>
                      <td className="px-4 text-sm font-medium text-rs-text">{v.display_name}</td>
                      <td className="px-4"><StatusBadge status={v.recent_status} disablePulse /></td>
                      <td className="px-4 font-mono text-sm text-rs-text">
                        {formatUptime(v.uptime_percentage_24h ?? 99.9)}
                      </td>
                      <td className="px-4 font-mono text-sm text-rs-text">
                        {formatLatency(v.avg_latency_ms ?? 0)}
                        <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                      </td>
                      <td className="px-4 text-xs text-rs-text-tertiary">{timeAgo(v.last_check_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:hidden">
              {(vendors ?? []).slice(0, 6).map((v) => (
                <div
                  key={v.id}
                  className="min-w-[200px] snap-start rounded-xl border border-rs-border-subtle bg-rs-elevated p-4"
                >
                  <div className="text-sm font-medium text-rs-text">{v.display_name}</div>
                  <div className="mt-2"><StatusBadge status={v.recent_status} disablePulse /></div>
                  <div className="mt-3 font-mono text-sm text-rs-text">
                    {formatUptime(v.uptime_percentage_24h ?? 99.9)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
