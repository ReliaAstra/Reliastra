'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Link2, Plus } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { useDeleteDependency, useDependencies, useHealth } from '@/lib/dashboard/queries';
import { formatLatency, formatUptime, timeAgo } from '@/lib/dashboard/format';
import { StatusBadge } from '../ui/status-badge';
import { RsButton } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { TableSkeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

export function DependenciesListPage() {
  const { data: deps, isLoading } = useDependencies();
  const { data: health } = useHealth();
  const del = useDeleteDependency();
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const current = getPlan(plan?.plan);
  const router = useRouter();

  const rows = (deps ?? []).map((d) => ({
    ...d,
    health: health?.find((h) => h.dependency_id === d.id),
  }));

  function onAdd() {
    if ((deps?.length ?? 0) >= current.dependencies) openUpgrade('limit');
    else setAdd(true);
  }

  return (
    <div>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Dependencies</h1>
          <p className="mt-1.5 text-sm text-rs-text-tertiary">
            Endpoints Reliastra checks independently from multiple regions.
          </p>
        </div>
        <RsButton onClick={onAdd}>
          <Plus size={16} />
          Add dependency
        </RsButton>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : !rows.length ? (
        <EmptyState
          icon={<Link2 size={32} />}
          title="No dependencies monitored"
          body="Add your first vendor to start tracking external health."
          actionLabel="Add dependency"
          onAction={onAdd}
          helpLabel="How do dependencies work?"
          onHelp={() => window.open('https://docs.reliastra.com/dependencies', '_blank')}
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated md:block">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="h-11">
                  {['Name', 'Status', 'Uptime 24h', 'Latency', 'Last check', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        'px-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary',
                        h === 'Actions' && 'text-right'
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'h-14 cursor-pointer transition-colors duration-150 hover:bg-rs-hover',
                      i !== rows.length - 1 && 'border-b border-rs-border-subtle'
                    )}
                    onClick={() => router.push(`/dependencies/${row.id}`)}
                  >
                    <td className="px-4">
                      <div className="text-sm font-medium text-rs-text">{row.name}</div>
                      <div className="mt-1 max-w-[280px] truncate font-mono text-xs text-rs-text-tertiary">
                        {row.endpoint_url}
                      </div>
                    </td>
                    <td className="px-4">
                      <StatusBadge status={row.health?.current_status ?? (row.is_active ? 'operational' : 'paused')} />
                    </td>
                    <td className="px-4 font-mono text-sm text-rs-text">
                      {formatUptime(row.health?.uptime_percentage_24h ?? 100)}
                    </td>
                    <td className="px-4 font-mono text-sm text-rs-text">
                      {formatLatency(row.health?.avg_latency_ms_24h ?? 0)}
                      <span className="ml-0.5 text-xs text-rs-text-tertiary">ms</span>
                    </td>
                    <td className="px-4 text-xs text-rs-text-tertiary">{timeAgo(row.health?.last_check_at)}</td>
                    <td className="px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="mr-3 text-sm text-rs-text-accent hover:underline"
                        onClick={() => setAdd(true, row.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-sm text-rs-down hover:underline"
                        onClick={() => del.mutate(row.id)}
                      >
                        Delete
                      </button>
                      <ChevronRight size={16} className="ml-3 inline text-rs-border" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/dependencies/${row.id}`}
                className="block rounded-xl border border-rs-border-subtle bg-rs-elevated p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-rs-text">{row.name}</div>
                  <StatusBadge status={row.health?.current_status ?? 'operational'} />
                </div>
                <div className="mt-1 truncate font-mono text-xs text-rs-text-tertiary">{row.endpoint_url}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="font-mono text-sm text-rs-text">
                    {formatUptime(row.health?.uptime_percentage_24h ?? 100)}
                  </div>
                  <div className="font-mono text-sm text-rs-text">
                    {formatLatency(row.health?.avg_latency_ms_24h ?? 0)} ms
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
