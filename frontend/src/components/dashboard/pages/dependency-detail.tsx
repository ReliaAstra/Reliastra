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
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { retentionLabel } from '@/lib/dashboard/plans';

export function DependencyDetailPage({ id }: { id: string }) {
  const { data: dep, isLoading } = useDependency(id);
  const { data: history } = useDependencyHistory(id);
  const { data: results } = useDependencyResults(id);
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

  if (isLoading || !dep) {
    return <RsSkeleton className="h-64 w-full" />;
  }

  const stats = [
    { label: 'Uptime', value: formatUptime(history?.uptime_percentage ?? row?.uptime_percentage_24h ?? 100) },
    { label: 'Avg latency', value: `${Math.round(history?.avg_latency_ms ?? row?.avg_latency_ms_24h ?? 0)}ms` },
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
            {(results ?? []).map((r, i, arr) => (
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
