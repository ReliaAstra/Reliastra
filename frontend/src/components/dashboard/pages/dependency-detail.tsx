'use client';

import { Check, X } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import { useAppStore } from '@/stores/app-store';
import {
  useDeleteDependency,
  useDependency,
  useDependencyHistory,
  useDependencyResults,
  useHealth,
  useLatency,
} from '@/lib/dashboard/queries';
import { formatLatency, formatUptime, regionLabel, timeAgo } from '@/lib/dashboard/format';
import { StatusBadge } from '../ui/status-badge';
import { RsButton } from '../ui/button';
import { RsSkeleton } from '../ui/skeleton';
import { QueryErrorState } from '../ui/query-error-state';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { retentionLabel } from '@/lib/dashboard/plans';

export function DependencyDetailPage({ id }: { id: string }) {
  const { data: dep, isLoading, isError: depError, refetch: refetchDep } = useDependency(id);
  const { data: history, isError: historyError } = useDependencyHistory(id);
  const {
    data: results,
    isLoading: resultsLoading,
    isError: resultsError,
    isFetching: resultsFetching,
    refetch: refetchResults,
  } = useDependencyResults(id);
  const { data: latency } = useLatency(id);
  const { data: health } = useHealth();
  const del = useDeleteDependency();
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const router = useRouter();
  const row = health?.find((h) => h.dependency_id === id);

  const chart = (latency as Array<{ timestamp: string; latency_ms: number }> | undefined)?.map((p) => ({
    t: p.timestamp,
    v: p.latency_ms,
    label: format(new Date(p.timestamp), 'HH:mm'),
  })) ?? [];

  if (isLoading) {
    return <RsSkeleton className="h-64 w-full" />;
  }

  // Previously `if (isLoading || !dep)` returned a skeleton, so a 404 (deleted
  // dependency) or a 500 rendered an endless shimmer with no explanation and no
  // way out. Those are different failures and now say so.
  if (depError || !dep) {
    return (
      <QueryErrorState
        title="Unable to load this dependency"
        body="It may have been deleted, or the API could not be reached. Nothing about the dependency itself has changed."
        onRetry={() => refetchDep()}
      />
    );
  }

  const stats = [
    // A failed history load must not render as a perfect score. This is an SLA
    // product: defaulting a missing uptime figure to 100% would report a
    // vendor as flawless precisely when we could not measure it.
    {
      label: 'Uptime',
      value:
        historyError && history?.uptime_percentage == null
          ? '-'
          : formatUptime(history?.uptime_percentage ?? row?.uptime_percentage_24h ?? 0),
    },
    {
      label: 'Avg latency',
      value:
        historyError && history?.avg_latency_ms == null
          ? '-'
          : `${Math.round(history?.avg_latency_ms ?? row?.avg_latency_ms_24h ?? 0)}ms`,
    },
    { label: 'Total checks', value: history?.total_checks ?? 0 },
    { label: 'Total up', value: history?.total_up ?? 0 },
    { label: 'Total down', value: history?.total_down ?? 0 },
  ];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">{dep.name}</h1>
            <StatusBadge status={row?.current_status ?? (dep.is_active ? 'operational' : 'paused')} />
          </div>
          <p className="mt-1.5 font-mono text-sm text-rs-text-tertiary">{dep.endpoint_url}</p>
        </div>
        <div className="flex gap-2">
          <RsButton variant="secondary" onClick={() => setAdd(true, dep.id)}>
            Edit
          </RsButton>
          <RsButton
            variant="danger"
            onClick={async () => {
              await del.mutateAsync(dep.id);
              router.push('/dependencies');
            }}
          >
            Delete
          </RsButton>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              {s.label}
            </div>
            <div className="font-mono text-2xl font-bold tracking-[-0.02em] text-rs-text">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-3 rounded-[10px] border border-rs-border-subtle bg-rs-elevated px-4 py-3 text-sm text-rs-text-secondary">
        Check history is retained for {retentionLabel(plan?.data_retention_days ?? 1)} on your
        current plan.
      </div>

      <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="mb-4 text-lg font-semibold text-rs-text">Latency</h2>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <CartesianGrid vertical={false} stroke="#1E293B" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={Math.max(0, Math.floor(chart.length / 6) - 1)}
              />
              <YAxis
                tick={{ fill: '#64748B', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: '#111827',
                  border: '1px solid #1E293B',
                  borderRadius: 6,
                  boxShadow: 'none',
                }}
              />
              <Area type="monotone" dataKey="v" stroke="#2563EB" fill="rgba(37,99,235,0.08)" strokeWidth={2} animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="h-11">
              {['Region', 'Time', 'Latency', 'Status', 'Up', 'Quorum'].map((h) => (
                <th key={h} className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resultsError ? (
              <tr>
                <td colSpan={6} className="px-4 py-10">
                  <QueryErrorState
                    title="Unable to load check history"
                    body="The checks may exist - this request to the API failed. Retry, and if it keeps failing treat the gap as unmeasured rather than as healthy."
                    onRetry={() => refetchResults()}
                    retrying={resultsFetching}
                  />
                </td>
              </tr>
            ) : resultsLoading && !results ? (
              <tr>
                <td colSpan={6} className="px-4 py-10">
                  <RsSkeleton className="h-32 w-full" />
                </td>
              </tr>
            ) : !results?.length ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-rs-text-tertiary"
                >
                  No checks recorded yet. Checks run on the configured interval;
                  if none appear, the pipeline - not this dependency - is the
                  thing to investigate.
                </td>
              </tr>
            ) : (
              (results ?? []).map((r, i, arr) => (
              <tr key={r.id} className={cn('h-14', i !== arr.length - 1 && 'border-b border-rs-border-subtle')}>
                <td className="px-4 text-sm text-rs-text">{regionLabel(r.region)}</td>
                <td className="px-4 text-xs text-rs-text-tertiary">{timeAgo(r.executed_at)}</td>
                <td className="px-4 font-mono text-sm text-rs-text">
                  {formatLatency(r.latency_ms)}
                  <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                </td>
                <td className="px-4 font-mono text-sm text-rs-text-secondary">{r.status_code ?? '-'}</td>
                <td className="px-4">
                  {r.is_up ? <Check size={16} className="text-rs-up" /> : <X size={16} className="text-rs-down" />}
                </td>
                <td className="px-4">
                  {r.quorum_confirmed ? <Check size={16} className="text-rs-up" /> : <X size={16} className="text-rs-down" />}
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
