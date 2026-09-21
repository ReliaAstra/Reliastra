'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { useDependencies, useHealth, useIncidents } from '@/lib/dashboard/queries';
import {
  formatLatency,
  formatUptime,
  incidentCode,
  timeAgo,
} from '@/lib/dashboard/format';
import {
  Empty,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
  State,
  toState,
} from '@/components/console/primitives';
import { DataTable, TableFilters, type Column } from '@/components/console/data-table';
import type { Dependency, DependencyHealth, Incident } from '@/lib/dashboard/types';
import Link from 'next/link';

type Row = Dependency & {
  health?: DependencyHealth;
  incident?: Incident;
};

const STATE_RANK = { crit: 0, warn: 1, idle: 2, ok: 3 } as const;

export function DependenciesPage() {
  const deps = useDependencies();
  const health = useHealth();
  const incidents = useIncidents('open', 50);
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const plan = useAppStore((s) => s.plan);
  const limit = getPlan(plan?.effective_plan ?? plan?.plan).dependencies;

  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all');

  const rows: Row[] = useMemo(() => {
    const byDep = new Map<string, DependencyHealth>();
    for (const h of health.data ?? []) byDep.set(h.dependency_id, h);
    const incByDep = new Map<string, Incident>();
    for (const i of incidents.data ?? []) if (!i.resolved_at) incByDep.set(i.dependency_id, i);
    return (deps.data ?? []).map((d) => ({
      ...d,
      health: byDep.get(d.id),
      incident: incByDep.get(d.id),
    }));
  }, [deps.data, health.data, incidents.data]);

  const statusOf = (r: Row) => r.health?.current_status ?? (r.is_active ? 'unknown' : 'paused');

  const counts = useMemo(() => {
    const c = { all: rows.length, faulty: 0, paused: 0 };
    for (const r of rows) {
      const s = toState(statusOf(r));
      if (s === 'crit' || s === 'warn') c.faulty += 1;
      if (!r.is_active) c.paused += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (segment === 'faulty') {
          const s = toState(statusOf(r));
          if (s !== 'crit' && s !== 'warn') return false;
        }
        if (segment === 'paused' && r.is_active) return false;
        if (!q) return true;
        return [r.name, r.endpoint_url].some((v) =>
          String(v).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => STATE_RANK[toState(statusOf(a))] - STATE_RANK[toState(statusOf(b))]);
  }, [rows, query, segment]);

  function onAdd() {
    if (limit != null && rows.length >= limit) openUpgrade('limit');
    else setAdd(true);
  }

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Dependency',
      sort: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] text-rs-text">{r.name}</span>
          <span className="rs-mono truncate text-[11px] text-rs-text-tertiary">
            {r.method} {r.endpoint_url}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sort: (r) => STATE_RANK[toState(statusOf(r))],
      render: (r) => <State status={statusOf(r)} live={Boolean(r.incident)} />,
    },
    {
      key: 'latency',
      header: 'Latency 24h',
      width: 110,
      numeric: true,
      sort: (r) => r.health?.avg_latency_ms_24h ?? -1,
      render: (r) =>
        (r.health?.avg_latency_ms_24h ?? 0) > 0 ? (
          <>
            {formatLatency(r.health!.avg_latency_ms_24h)}
            <span className="ml-1 text-[10px] text-rs-text-tertiary">ms</span>
          </>
        ) : (
          <span className="text-rs-text-tertiary">—</span>
        ),
    },
    {
      key: 'uptime',
      header: 'Availability 24h',
      width: 130,
      numeric: true,
      sort: (r) => r.health?.uptime_percentage_24h ?? -1,
      render: (r) =>
        r.health?.uptime_percentage_24h != null ? (
          formatUptime(r.health.uptime_percentage_24h)
        ) : (
          <span className="text-rs-text-tertiary">—</span>
        ),
    },
    {
      key: 'last',
      header: 'Last observation',
      width: 140,
      numeric: true,
      sort: (r) => r.health?.last_check_at ?? '',
      render: (r) =>
        r.health?.last_check_at ? (
          <span className="text-[12px] text-rs-text-tertiary">{timeAgo(r.health.last_check_at)}</span>
        ) : (
          <span className="text-rs-text-tertiary">—</span>
        ),
    },
    {
      key: 'incident',
      header: 'Active incident',
      width: 130,
      sort: (r) => (r.incident ? 0 : 1),
      render: (r) =>
        r.incident ? (
          <Link
            href={`/incidents/${r.incident.id}`}
            className="rs-mono text-rs-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            onClick={(e) => e.stopPropagation()}
          >
            {incidentCode(r.incident.id, r.incident.display_id)}
          </Link>
        ) : (
          <span className="text-rs-text-tertiary">—</span>
        ),
    },
  ];

  const atLimit = limit != null && rows.length >= limit;

  return (
    <>
      <PageHead title="Dependencies"
        description={`${rows.length}${limit != null ? ` / ${limit}` : ''} monitored · ${counts.faulty} faults${counts.paused ? ` · ${counts.paused} paused` : ''}`}
        actions={
          <button type="button" className="rs-button rs-button-primary rs-button-sm" onClick={onAdd}>
            Add dependency
          </button>
        }
      />

      <Section title="Monitored endpoints" hint="Checked on the configured interval from the RELIASTRA observation point.">
        {deps.isLoading ? (
          <RowsSkeleton rows={6} cols={6} />
        ) : deps.isError ? (
          <Failure title="Dependency list unavailable" body="The list could not be retrieved. Checks continue to run." onRetry={() => deps.refetch()} />
        ) : !rows.length ? (
          <Empty
            title="No dependencies monitored"
            body="Add your first external service. Checks start on the next interval."
            action={
              <button type="button" className="rs-button rs-button-primary rs-button-sm" onClick={onAdd}>
                Add dependency
              </button>
            }
          />
        ) : (
          <>
            <TableFilters
              query={query}
              onQuery={setQuery}
              placeholder="Filter by name or URL"
              active={segment}
              onSegment={setSegment}
              segments={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'faulty', label: 'Faults', count: counts.faulty },
                { id: 'paused', label: 'Paused', count: counts.paused },
              ]}
              right={
                health.isError ? (
                  <span className="text-[11.5px] text-rs-down">Health readings unavailable. Statuses may be stale</span>
                ) : atLimit ? (
                  <span className="text-[11.5px] text-rs-text-tertiary">Plan limit reached ({limit})</span>
                ) : null
              }
            />
            {visible.length ? (
              <DataTable
                rows={visible}
                columns={columns}
                rowKey={(r) => r.id}
                rowHref={(r) => `/dependencies/${r.id}`}
                rowState={(r) => (toState(statusOf(r)) === 'crit' ? 'crit' : undefined)}
                caption="Monitored dependencies, faults first"
              />
            ) : (
              <Empty title="No dependencies match this filter" body="Clear the filter to see the full list." />
            )}
          </>
        )}
      </Section>
    </>
  );
}
