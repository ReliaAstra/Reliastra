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
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan, nextPlan } from '@/lib/dashboard/plans';
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

function uptimeColor(v: number) {
  if (v >= 99.9) return 'text-rs-text';
  if (v >= 99) return 'text-rs-degraded';
  return 'text-rs-down';
}

function LimitBanner() {
  const plan = useAppStore((s) => s.plan);
  const { data: summary } = useSummary();
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.plan);
  const nxt = nextPlan(plan?.plan);
  const [hidden, setHidden] = useState(true);
  const count = summary?.active_dependencies_count ?? 0;

  useEffect(() => {
    const dismissed = localStorage.getItem('reliastra_dismiss_limit_banner');
    setHidden(Boolean(dismissed));
  }, []);

  if (hidden) return null;
  if (current.id !== 'free') return null;
  if (count < 2) return null;

  return (
    <div className="relative mb-6 flex items-center justify-between rounded-[10px] border border-[rgba(37,99,235,0.2)] bg-rs-brand-subtle px-[18px] py-3.5">
      <div className="flex items-start gap-3 pr-8">
        <Info size={16} className="mt-0.5 text-rs-brand" />
        <div>
          <p className="text-sm text-rs-text">
            You are monitoring {count} of {current.dependencies} dependencies on the Free plan.
          </p>
          <p className="mt-0.5 text-[13px] text-rs-text-secondary">
            Upgrade to Starter to monitor 10 dependencies and unlock 7-day retention.
          </p>
        </div>
      </div>
      <RsButton
        className="hidden shrink-0 px-3.5 py-1.5 text-[13px] sm:inline-flex"
        onClick={() => openUpgrade('limit')}
      >
        Upgrade to Starter
      </RsButton>
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-rs-text-tertiary"
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
        onHelp={() => window.open('https://docs.reliastra.com/dependencies', '_blank')}
      />
    );
  }

  return (
    <>
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated md:block">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="h-11 border-b border-rs-border-subtle">
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
                  'h-14 cursor-pointer transition-colors duration-150 hover:bg-rs-hover',
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
                  <ChevronRight size={16} className="ml-auto text-rs-border hover:text-rs-text-secondary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-3 md:hidden">
        {data.map((row) => (
          <Link
            key={row.dependency_id}
            href={`/dependencies/${row.dependency_id}`}
            className="block rounded-xl border border-rs-border-subtle bg-rs-elevated p-4"
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

  const stats = [
    {
      label: 'Dependencies',
      value: summary?.active_dependencies_count ?? 0,
      icon: Link2,
      bg: 'rgba(37,99,235,0.1)',
      color: '#2563EB',
      context: `${Math.max(0, current.dependencies - (summary?.active_dependencies_count ?? 0))} remaining of ${current.dependencies}`,
      valueClass: 'text-rs-text',
    },
    {
      label: 'Open incidents',
      value: summary?.open_incidents_count ?? 0,
      icon: AlertTriangle,
      bg: 'rgba(239,68,68,0.1)',
      color: '#EF4444',
      valueClass: (summary?.open_incidents_count ?? 0) > 0 ? 'text-rs-down' : 'text-rs-text',
    },
    {
      label: 'Overall uptime',
      value: formatUptime(summary?.overall_uptime_percentage ?? 0),
      icon: Activity,
      bg: 'rgba(16,185,129,0.1)',
      color: '#10B981',
      valueClass: uptimeColor(summary?.overall_uptime_percentage ?? 100),
    },
    {
      label: 'Alerts today',
      value: summary?.alerts_today_count ?? 0,
      icon: Bell,
      bg: 'rgba(245,158,11,0.1)',
      color: '#F59E0B',
      valueClass: (summary?.alerts_today_count ?? 0) > 0 ? 'text-rs-degraded' : 'text-rs-text',
    },
  ];

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Dashboard</h1>
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
                  className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5 transition-[border-color] duration-150 hover:border-rs-border"
                >
                  <div
                    className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: s.bg }}
                  >
                    <Icon size={18} color={s.color} />
                  </div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
                    {s.label}
                  </div>
                  <div className={cn('font-mono text-[32px] font-bold leading-none tracking-[-0.02em]', s.valueClass)}>
                    {s.value}
                  </div>
                  {'context' in s && s.context && (
                    <div className="mt-2 text-xs text-rs-text-tertiary">{s.context}</div>
                  )}
                </div>
              );
            })}
      </div>

      <LimitBanner />

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
              onHelp={() => window.open('https://docs.reliastra.com/incidents', '_blank')}
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
            <div className="mt-4 hidden overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated md:block">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="h-11">
                    {['Vendor', 'Status', 'Uptime 24h', 'Latency', 'Last check'].map((h) => (
                      <th key={h} className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(vendors ?? []).slice(0, 6).map((v, i, arr) => (
                    <tr key={v.id} className={cn('h-14', i !== arr.length - 1 && 'border-b border-rs-border-subtle')}>
                      <td className="px-4 text-sm font-medium text-rs-text">{v.display_name}</td>
                      <td className="px-4"><StatusBadge status={v.recent_status} /></td>
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
            <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:hidden">
              {(vendors ?? []).slice(0, 6).map((v) => (
                <div
                  key={v.id}
                  className="min-w-[200px] snap-start rounded-xl border border-rs-border-subtle bg-rs-elevated p-4"
                >
                  <div className="text-sm font-medium text-rs-text">{v.display_name}</div>
                  <div className="mt-2"><StatusBadge status={v.recent_status} /></div>
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
