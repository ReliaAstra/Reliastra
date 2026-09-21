'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import {
  useDependencies,
  useHealth,
  useIncidents,
  useEvidence,
  useSummary,
} from '@/lib/dashboard/queries';
import {
  durationBetween,
  formatLatency,
  formatUptime,
  formatUtc,
  incidentCode,
  reportCode,
  timeAgo,
} from '@/lib/dashboard/format';
import {
  Empty,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
  SectionLink,
  StatCard,
  State,
  toState,
} from '@/components/console/primitives';
import { DataTable, type Column } from '@/components/console/data-table';
import type { DependencyHealth, Incident } from '@/lib/dashboard/types';

export function OverviewPage() {
  const org = useAppStore((s) => s.org);
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);

  const summary = useSummary();
  const health = useHealth();
  const openIncidents = useIncidents('open', 10);
  const allIncidents = useIncidents(undefined, 8);
  const deps = useDependencies();
  const evidence = useEvidence();

  const limit = plan?.max_dependencies ?? null;
  const monitored = health.data?.length ?? deps.data?.length ?? 0;
  const active = openIncidents.data ?? [];
  const isEmptyWorkspace =
    !health.isLoading && !deps.isLoading && monitored === 0 && (deps.data?.length ?? 0) === 0;

  const handleAdd = () => {
    const used = summary.data?.active_dependencies_count ?? deps.data?.length ?? 0;
    if (limit != null && used >= limit) useAppStore.getState().openUpgrade('limit');
    else setAdd(true);
  };

  return (
    <>
      <PageHead title={org?.name ?? 'Overview'}
        description="What RELIASTRA is observing right now, what is degraded, and the evidence already on file."
        actions={
          <button type="button" onClick={handleAdd} className="rs-button rs-button-primary rs-button-sm">
            Add dependency
          </button>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monitored"
          value={limit != null ? `${monitored} / ${limit}` : monitored}
          sub={limit != null ? `of ${limit} dependencies on your plan` : 'dependencies under observation'}
        />
        <StatCard
          label="Availability 24h"
          value={formatUptime(summary.data?.overall_uptime_percentage)}
          sub="measured across all monitored endpoints"
        />
        <StatCard
          label="Open incidents"
          value={active.length}
          state={active.length > 0 ? 'crit' : 'ok'}
          sub={active.length > 0 ? 'need attention now' : 'nothing open right now'}
        />
        <StatCard
          label="Evidence records"
          value={evidence.data?.length ?? 0}
          sub="signed reports you can hand over"
        />
      </div>

      {isEmptyWorkspace ? (
        <div className="rs-section-spacing">
          <Empty
            title="No dependencies monitored"
            body="Add your first external service. The first observation lands within one check interval."
            action={
              <button type="button" onClick={handleAdd} className="rs-button rs-button-primary rs-button-sm">
                Add dependency
              </button>
            }
          />
        </div>
      ) : (
        <>
          <ActiveIncidents
            incidents={active}
            loading={openIncidents.isLoading}
            error={openIncidents.isError}
            onRetry={openIncidents.refetch}
          />

          <Section
            title="Dependency health"
            hint="Latest endpoint observations from the RELIASTRA observation point."
            action={<SectionLink href="/dependencies">All dependencies</SectionLink>}
          >
            <HealthTable
              rows={health.data ?? []}
              loading={health.isLoading}
              error={health.isError}
              onRetry={health.refetch}
              incidents={active}
            />
          </Section>

          <Section
            title="Recent incidents"
            hint="Confirmed degradation, newest first. Resolved incidents keep their record."
            action={<SectionLink href="/incidents">All incidents</SectionLink>}
          >
            {allIncidents.isLoading ? (
              <RowsSkeleton rows={4} cols={5} />
            ) : allIncidents.isError ? (
              <Failure body="The incident list could not be retrieved." onRetry={() => allIncidents.refetch()} />
            ) : !allIncidents.data?.length ? (
              <Empty
                title="No incidents recorded"
                body="Incidents appear when the detector confirms a sustained failure against a dependency."
                action={
                  <Link href="/dependencies" className="rs-button rs-button-secondary rs-button-sm">
                    Review dependencies
                  </Link>
                }
              />
            ) : (
              <IncidentTable rows={allIncidents.data} />
            )}
          </Section>

          <Section
            title="Evidence"
            hint="Timestamped, checksummed records generated from confirmed incidents."
            action={<SectionLink href="/evidence">Evidence library</SectionLink>}
          >
            {evidence.isLoading ? (
              <RowsSkeleton rows={3} cols={4} />
            ) : evidence.isError ? (
              <Failure body="The evidence library could not be retrieved." onRetry={() => evidence.refetch()} />
            ) : !evidence.data?.length ? (
              <Empty
                title="No evidence records yet"
                body="An evidence record is generated when an incident is confirmed. Each one carries the observations underneath it and a checksum you can verify."
              />
            ) : (
              <ul className="divide-y divide-rs-border-subtle">
                {evidence.data.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/evidence/${e.id}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                    >
                      <span className="flex min-w-0 items-baseline gap-3">
                        <span className="rs-mono text-rs-brand">{reportCode(e.id)}</span>
                        <span className="truncate text-[12.5px] text-rs-text-secondary">{e.title ?? 'Evidence record'}</span>
                      </span>
                      <span className="rs-mono shrink-0 text-rs-text-tertiary">{formatUtc(e.generated_at, 'yyyy-MM-dd HH:mm')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </>
  );
}

function ActiveIncidents({
  incidents,
  loading,
  error,
  onRetry,
}: {
  incidents: Incident[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <Section title="Active incidents" id="active">
      {loading ? (
        <RowsSkeleton rows={2} cols={4} />
      ) : error ? (
        <Failure body="Open incidents could not be retrieved." onRetry={onRetry} />
      ) : incidents.length === 0 ? (
        <p className="px-4 py-4 text-[13px]">
          <span className="inline-flex items-center gap-2 text-rs-text">
            <span className="rs-status-dot rs-status-dot-up" aria-hidden />
            <span>No active incidents</span>
          </span>
          <span className="ml-3 text-rs-text-tertiary">No open incident records. Check current observations below.</span>
        </p>
      ) : (
        <ul className="divide-y divide-rs-down/20">
          {incidents.map((inc) => (
            <li key={inc.id} className="bg-rs-down-bg/40">
              <Link
                href={`/incidents/${inc.id}`}
                className="flex flex-col gap-2 px-4 py-3 hover:bg-rs-down-bg/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus md:flex-row md:items-center md:justify-between"
              >
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <State status={inc.status} live />
                  <span className="rs-mono text-rs-brand">{incidentCode(inc.id, inc.display_id)}</span>
                  <span className="truncate text-[13px] font-medium text-rs-text">{inc.title || inc.root_cause || 'Incident'}</span>
                </span>
                <span className="rs-mono flex shrink-0 items-center gap-4 text-rs-text-tertiary">
                  <span>{inc.severity}</span>
                  <span>started {formatUtc(inc.started_at, 'HH:mm')}</span>
                  <span className="text-rs-text">{durationBetween(inc.started_at, inc.resolved_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function HealthTable({
  rows,
  loading,
  error,
  onRetry,
  incidents,
}: {
  rows: DependencyHealth[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  incidents: Incident[];
}) {
  if (loading) return <RowsSkeleton rows={6} cols={6} />;
  if (error) {
    return (
      <Failure
        body="Dependency health could not be retrieved. Existing observations are unaffected; this is a read failure in the console."
        onRetry={onRetry}
      />
    );
  }
  if (!rows.length) {
    return <Empty title="No dependency health yet" body="Health appears once the first check cycle completes for a monitored dependency." />;
  }

  const incidentByDep = new Map(incidents.map((i) => [i.dependency_id, i]));

  const columns: Column<DependencyHealth>[] = [
    {
      key: 'name',
      header: 'Dependency',
      sort: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-medium text-rs-text">{r.name}</span>
          <span className="rs-mono block truncate text-[10.5px] text-rs-text-tertiary">{r.endpoint_url}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 128,
      sort: (r) => r.current_status,
      render: (r) => <State status={r.current_status} live={toState(r.current_status) === 'crit'} />,
    },
    {
      key: 'uptime',
      header: 'Availability 24h',
      numeric: true,
      width: 130,
      sort: (r) => r.uptime_percentage_24h ?? -1,
      render: (r) =>
        r.uptime_percentage_24h == null ? (
          <span className="text-rs-text-tertiary">—</span>
        ) : (
          formatUptime(r.uptime_percentage_24h)
        ),
    },
    {
      key: 'latency',
      header: 'Latency 24h',
      numeric: true,
      width: 118,
      sort: (r) => r.avg_latency_ms_24h ?? -1,
      render: (r) =>
        !(r.avg_latency_ms_24h > 0) ? (
          <span className="text-rs-text-tertiary">—</span>
        ) : (
          <>
            {formatLatency(r.avg_latency_ms_24h)}
            <span className="ml-1 text-[10px] text-rs-text-tertiary">ms</span>
          </>
        ),
    },
    {
      key: 'checks',
      header: 'Checks 24h',
      numeric: true,
      width: 108,
      sort: (r) => r.total_checks_24h ?? -1,
      render: (r) => (r.total_checks_24h == null ? <span className="text-rs-text-tertiary">—</span> : r.total_checks_24h),
    },
    {
      key: 'last',
      header: 'Last observation',
      numeric: true,
      width: 150,
      sort: (r) => r.last_check_at ?? '',
      render: (r) =>
        r.last_check_at ? (
          <span title={formatUtc(r.last_check_at, 'yyyy-MM-dd HH:mm:ss')}>{timeAgo(r.last_check_at)}</span>
        ) : (
          <span className="text-rs-text-tertiary">—</span>
        ),
    },
    {
      key: 'incident',
      header: 'Incident',
      width: 108,
      render: (r) => {
        const inc = incidentByDep.get(r.dependency_id);
        return inc ? (
          <span className="rs-mono text-rs-brand">{incidentCode(inc.id, inc.display_id)}</span>
        ) : (
          <span className="text-rs-text-tertiary">—</span>
        );
      },
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.dependency_id}
      rowHref={(r) => `/dependencies/${r.dependency_id}`}
      rowState={(r) => (incidentByDep.has(r.dependency_id) ? 'crit' : undefined)}
      caption="Monitored dependencies with current status, availability, latency and last observation"
      initialSort={{ key: 'status', dir: 'asc' }}
    />
  );
}

function IncidentTable({ rows }: { rows: Incident[] }) {
  const columns: Column<Incident>[] = [
    {
      key: 'id',
      header: 'Incident',
      width: 118,
      sort: (r) => r.started_at,
      render: (r) => <span className="rs-mono text-rs-brand">{incidentCode(r.id, r.display_id)}</span>,
    },
    {
      key: 'title',
      header: 'Summary',
      sort: (r) => (r.title ?? r.root_cause ?? '').toLowerCase(),
      render: (r) => <span className="block truncate text-[12.5px] text-rs-text-secondary">{r.title || r.root_cause || 'Incident'}</span>,
    },
    {
      key: 'status',
      header: 'State',
      width: 132,
      sort: (r) => r.status,
      render: (r) => <State status={r.status} live={!r.resolved_at} />,
    },
    {
      key: 'severity',
      header: 'Severity',
      width: 96,
      sort: (r) => r.severity,
      render: (r) => <span className="text-[12px] text-rs-text-secondary">{r.severity}</span>,
    },
    {
      key: 'started',
      header: 'Detected (UTC)',
      numeric: true,
      width: 150,
      sort: (r) => r.started_at,
      render: (r) => formatUtc(r.started_at, 'MMM d HH:mm'),
    },
    {
      key: 'duration',
      header: 'Duration',
      numeric: true,
      width: 96,
      sort: (r) => new Date(r.resolved_at ?? Date.now()).getTime() - new Date(r.started_at).getTime(),
      render: (r) => durationBetween(r.started_at, r.resolved_at),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/incidents/${r.id}`}
      rowState={(r) => (!r.resolved_at ? 'crit' : undefined)}
      caption="Incidents with state, severity, detection time and duration"
    />
  );
}
