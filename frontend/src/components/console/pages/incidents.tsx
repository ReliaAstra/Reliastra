'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useDependencies, useIncidents } from '@/lib/dashboard/queries';
import {
  durationBetween,
  formatUtc,
  incidentCode,
  timeAgo,
} from '@/lib/dashboard/format';
import { evidenceRank, evidenceState } from '@/lib/dashboard/evidence-state';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
  State,
} from '@/components/console/primitives';
import { DataTable, TableFilters, type Column } from '@/components/console/data-table';
import type { Incident } from '@/lib/dashboard/types';

const SEVERITY_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 };

function severityWord(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Incidents index.
 *
 * The old version rendered incidents as a column of rounded link cards, each
 * with a coloured left bar and a confidence label that defaulted to `HIGH`
 * whenever the API omitted one - a fabricated verdict on exactly the field a
 * dispute would hinge on. This is a table: one row per incident, scannable
 * top to bottom, with active incidents pulled to the top and tinted, and
 * confidence shown only when the backend supplies it.
 */
export function IncidentsPage() {
  const { data, isLoading, isError, refetch } = useIncidents(undefined, 50);
  const deps = useDependencies();
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState('all');

  const depName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deps.data ?? []) m.set(d.id, d.name);
    return m;
  }, [deps.data]);

  const all = data ?? [];
  const openCount = all.filter((i) => !i.resolved_at).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((i) => {
        if (segment === 'active' && i.resolved_at) return false;
        if (segment === 'resolved' && !i.resolved_at) return false;
        if (!q) return true;
        return [
          i.title,
          i.root_cause,
          i.description,
          i.vendor,
          depName.get(i.dependency_id),
          incidentCode(i.id, i.display_id),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const activeDiff = Number(Boolean(a.resolved_at)) - Number(Boolean(b.resolved_at));
        if (activeDiff) return activeDiff;
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      });
  }, [all, query, segment, depName]);

  const columns: Column<Incident>[] = [
    {
      key: 'code',
      header: 'Incident',
      width: 270,
      sort: (r) => r.started_at,
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="obc-mono text-[var(--obc-signal)]">
            {incidentCode(r.id, r.display_id)}
          </span>
          <span className="truncate text-[12.5px] text-[var(--obc-text)]">
            {r.title || r.root_cause || 'Incident'}
          </span>
        </span>
      ),
    },
    {
      key: 'dependency',
      header: 'Dependency',
      sort: (r) => depName.get(r.dependency_id) ?? r.vendor ?? '',
      render: (r) => (
        <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">
          {depName.get(r.dependency_id) ?? r.vendor ?? 'Unnamed dependency'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      width: 130,
      sort: (r) => (r.resolved_at ? 1 : 0),
      render: (r) => <State status={r.status} live={!r.resolved_at} />,
    },
    {
      key: 'severity',
      header: 'Severity',
      width: 92,
      sort: (r) => SEVERITY_RANK[r.severity] ?? 9,
      render: (r) => (
        <span
          className="text-[12.5px]"
          style={{
            color:
              r.severity === 'critical'
                ? '#E58C85'
                : r.severity === 'major'
                  ? '#E3BE7A'
                  : 'var(--obc-text-3)',
          }}
        >
          {severityWord(r.severity)}
        </span>
      ),
    },
    {
      key: 'started',
      header: 'Detected (UTC)',
      width: 155,
      numeric: true,
      sort: (r) => r.started_at,
      render: (r) => (
        <span title={timeAgo(r.started_at)}>{formatUtc(r.started_at, 'MMM d HH:mm')}</span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: 90,
      numeric: true,
      sort: (r) =>
        (r.resolved_at ? new Date(r.resolved_at).getTime() : Date.now()) -
        new Date(r.started_at).getTime(),
      render: (r) => durationBetween(r.started_at, r.resolved_at),
    },
    {
      key: 'evidence',
      header: 'Evidence',
      width: 110,
      sort: (r) => evidenceRank(r),
      // The state comes from the API rather than from whether a report id is
      // present, so "generating", "failed - with the reason" and "not on your
      // plan" are each distinguishable instead of all reading "none".
      render: (r) => {
        const view = evidenceState(r);
        const toneClass =
          view.tone === 'ok'
            ? 'text-[var(--obc-text-2)]'
            : view.tone === 'warn'
              ? 'text-[var(--obc-crit)]'
              : 'text-[var(--obc-text-4)]';
        return (
          <span className={toneClass} title={view.hint}>
            {view.label}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHead
        title="Incidents"
        meta={
          <>
            <Fact label="Total" value={all.length} />
            <Fact
              label="Active"
              value={openCount}
              state={openCount ? 'crit' : undefined}
            />
            <Fact label="Window" value="last 50 records" mono={false} />
          </>
        }
      />

      <Section
        title="Incident log"
        hint="An incident opens when the detector confirms a sustained failure against a dependency. Active incidents are listed first."
      >
        {isLoading ? (
          <RowsSkeleton rows={6} cols={5} />
        ) : isError ? (
          <Failure
            title="Incident log unavailable"
            body="The incident log could not be retrieved. Monitoring is unaffected."
            onRetry={() => refetch()}
          />
        ) : !all.length ? (
          <Empty
            title="No incidents recorded"
            body="No confirmed failure has been recorded on this workspace yet. Incidents appear here as soon as the detector confirms one."
            action={
              <Link href="/dependencies" className="obc-btn obc-btn-sm">
                Review monitored dependencies
              </Link>
            }
          />
        ) : (
          <>
            <TableFilters
              query={query}
              onQuery={setQuery}
              placeholder="Filter incidents"
              active={segment}
              onSegment={setSegment}
              segments={[
                { id: 'all', label: 'All', count: all.length },
                { id: 'active', label: 'Active', count: openCount },
                { id: 'resolved', label: 'Resolved', count: all.length - openCount },
              ]}
            />
            {rows.length ? (
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.id}
                rowHref={(r) => `/incidents/${r.id}`}
                rowState={(r) => (!r.resolved_at ? 'crit' : undefined)}
                caption="Incidents, active first"
              />
            ) : (
              <Empty
                title="No incidents match this filter"
                body="Clear the filter or widen the state selection to see the full log."
              />
            )}
          </>
        )}
      </Section>
    </>
  );
}
