'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import {
  useAllApplications,
  useClients,
  useCreateClient,
  useDependencies,
  useEvidence,
  useIncidents,
  usePortfolio,
} from '@/lib/dashboard/queries';
import {
  durationBetween,
  formatUtc,
  incidentCode,
  reportCode,
  timeAgo,
} from '@/lib/dashboard/format';
import {
  agencyPosture,
  applicationIndex,
  attributeEvidence,
  attributeIncidents,
  byAttention,
  clientAvailability,
  clientLatency,
  isMeasured,
  unassignedDependencies,
} from '@/lib/agency/portfolio';
import type { PortfolioClient } from '@/lib/dashboard/types';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
  SectionLink,
  State,
} from '@/components/console/primitives';
import { DataTable, type Column } from '@/components/console/data-table';
import { AgencyUnavailable, ClientCreateDialog, PortfolioShare } from './parts';

/**
 * AGENCY OPERATIONS — the multi-client console.
 *
 * This is not a second dashboard. The customer console answers "what is my
 * infrastructure doing"; this answers "which of my clients' infrastructure
 * needs me right now", and it is ordered by that question: posture line,
 * client environments sorted by attention, active incidents attributed across
 * clients, evidence, then the monitors that belong to no client yet.
 *
 * Two facts the API cannot state on its own are stated here:
 *  - A client with no monitored dependency comes back as `operational` with
 *    `uptime_24h = 100.0`, because the service averages an empty list. It is
 *    rendered as "not observed" / "insufficient data", never as healthy.
 *  - Incidents and evidence carry no client id. They are attributed by walking
 *    incident → dependency → application → client, and anything that does not
 *    resolve stays visibly unattributed rather than being assigned a guess.
 */
export function AgencyPortfolioPage() {
  const router = useRouter();
  const org = useAppStore((s) => s.org);
  const [creating, setCreating] = useState(false);

  const portfolio = usePortfolio();
  const clients = useClients();
  const deps = useDependencies();
  const openIncidents = useIncidents('open', 50);
  // Evidence is attributed through its incident, and an incident that produced
  // a report is usually resolved - so attribution reads the full list, not the
  // open one, or every historical report would render as "unattributed".
  const allIncidents = useIncidents(undefined, 100);
  const evidence = useEvidence();

  const clientIds = useMemo(() => (clients.data ?? []).map((c) => c.id), [clients.data]);
  const applications = useAllApplications(clientIds);

  const index = useMemo(
    () => applicationIndex(applications.data ?? []),
    [applications.data]
  );

  const rows = useMemo(
    () => [...(portfolio.data?.clients ?? [])].sort(byAttention),
    [portfolio.data]
  );

  const posture = portfolio.data ? agencyPosture(portfolio.data) : null;

  const clientNames = useMemo(
    () => (portfolio.data?.clients ?? []).map((c) => ({ id: c.id, name: c.name })),
    [portfolio.data]
  );

  const incidents = useMemo(
    () =>
      attributeIncidents(
        openIncidents.data ?? [],
        deps.data ?? [],
        index,
        clientNames
      ),
    [openIncidents.data, deps.data, index, clientNames]
  );

  const evidenceRows = useMemo(
    () =>
      attributeEvidence(
        (evidence.data ?? []).slice(0, 8),
        allIncidents.data ?? [],
        deps.data ?? [],
        index,
        clientNames
      ),
    [evidence.data, allIncidents.data, deps.data, index, clientNames]
  );

  const orphans = useMemo(
    () => unassignedDependencies(deps.data ?? [], index),
    [deps.data, index]
  );

  // Capability, not paywall: the surface exists for organizations the backend
  // has flagged. It is never presented as something to buy.
  if (org && !org.has_agency_mode) return <AgencyUnavailable />;

  if (portfolio.isError) {
    return (
      <>
        <PageHead eyebrow="Agency operations" title="Client environments" />
        <div className="py-6">
          <Failure
            body="The client portfolio could not be retrieved. No client posture is shown rather than a cached or partial one — an agency operator acting on a stale rollup is worse than one who knows the rollup is missing."
            onRetry={() => portfolio.refetch()}
          />
        </div>
      </>
    );
  }

  const columns: Column<PortfolioClient>[] = [
    {
      key: 'name',
      header: 'Client environment',
      sort: (c) => c.name.toLowerCase(),
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[var(--obc-text)]">{c.name}</p>
          {c.description && (
            <p className="truncate text-[11.5px] text-[var(--obc-text-4)]">{c.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      sort: (c) => c.status,
      render: (c) =>
        isMeasured(c) ? (
          <State status={c.status} live={c.status === 'critical'} />
        ) : (
          <State status="unknown" label="Not observed" />
        ),
    },
    {
      key: 'apps',
      header: 'Applications',
      numeric: true,
      width: 110,
      sort: (c) => c.application_count,
      render: (c) => c.application_count,
    },
    {
      key: 'deps',
      header: 'Dependencies',
      numeric: true,
      width: 120,
      sort: (c) => c.dependency_count,
      render: (c) =>
        c.dependency_count ? (
          c.dependency_count
        ) : (
          <span className="text-[var(--obc-text-4)]">none</span>
        ),
    },
    {
      key: 'uptime',
      header: 'Availability 24h',
      numeric: true,
      width: 140,
      sort: (c) => (isMeasured(c) ? c.uptime_24h : -1),
      render: (c) => (
        <span className={isMeasured(c) ? undefined : 'text-[var(--obc-text-4)]'}>
          {clientAvailability(c.uptime_24h, c.dependency_count)}
        </span>
      ),
    },
    {
      key: 'latency',
      header: 'Mean latency',
      numeric: true,
      width: 130,
      sort: (c) => (isMeasured(c) ? c.avg_latency_ms : -1),
      render: (c) => {
        const value = clientLatency(c.avg_latency_ms, c.dependency_count);
        const measured = /^[\d,]+$/.test(value);
        return (
          <span className={measured ? undefined : 'text-[var(--obc-text-4)]'}>
            {value}
            {measured && <span className="obc-unit">ms</span>}
          </span>
        );
      },
    },
    {
      key: 'incidents',
      header: 'Open incidents',
      numeric: true,
      width: 130,
      sort: (c) => c.open_incidents,
      render: (c) =>
        c.open_incidents ? (
          <span className="text-[#E58C85]">{c.open_incidents}</span>
        ) : (
          <span className="text-[var(--obc-text-4)]">—</span>
        ),
    },
    {
      key: 'last',
      header: 'Last incident',
      width: 140,
      sort: (c) => c.last_incident_at ?? '',
      render: (c) =>
        c.last_incident_at ? (
          timeAgo(c.last_incident_at)
        ) : (
          <span className="text-[var(--obc-text-4)]">none recorded</span>
        ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Agency operations"
        title={org?.name ? `${org.name} · client environments` : 'Client environments'}
        meta={
          <>
            <Fact
              label="Environments"
              value={portfolio.data ? portfolio.data.totals.clients : '—'}
            />
            <Fact
              label="Dependencies observed"
              value={portfolio.data ? portfolio.data.totals.dependencies : '—'}
            />
            <Fact
              label="Unassigned monitors"
              value={portfolio.data ? portfolio.data.unassigned_monitors : '—'}
            />
            <Fact
              label="Synchronised"
              value={
                portfolio.data ? formatUtc(portfolio.data.generated_at, 'HH:mm:ss') : '—'
              }
            />
          </>
        }
        actions={
          <>
            {portfolio.data && <PortfolioShare token={portfolio.data.share_token} />}
            <button
              type="button"
              className="obc-btn obc-btn-primary obc-btn-sm"
              onClick={() => setCreating(true)}
            >
              Add client environment
            </button>
          </>
        }
      />

      {/* Posture. One line of counts, not four coloured tiles. */}
      {posture && posture.total > 0 && (
        <div className="flex flex-col gap-5 border-b border-[var(--obc-line)] py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-end gap-5">
            <p className="font-[family-name:var(--ob-font-mono)] text-[42px] leading-none tabular-nums text-[var(--obc-text)]">
              {posture.total}
            </p>
            <div className="pb-1">
              <p className="obc-label">
                client environment{posture.total === 1 ? '' : 's'} under management
              </p>
              <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {[
                  { n: posture.operational, word: 'operational', status: 'operational' },
                  { n: posture.degraded, word: 'degraded', status: 'degraded' },
                  { n: posture.critical, word: 'critical', status: 'critical' },
                  { n: posture.unmeasured, word: 'not observed', status: 'unknown' },
                ]
                  .filter((i) => i.n > 0)
                  .map((i) => (
                    <li key={i.word}>
                      <State status={i.status} label={`${i.n} ${i.word}`} />
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <dt className="obc-label">Open incidents</dt>
              <dd
                className={`obc-figure mt-1.5 ${posture.openIncidents ? 'text-[#E58C85]' : ''}`}
              >
                {posture.openIncidents}
              </dd>
            </div>
            <div>
              <dt className="obc-label">Availability 24h · observed monitors</dt>
              <dd className="obc-figure mt-1.5">
                {portfolio.data && portfolio.data.totals.dependencies > 0
                  ? `${portfolio.data.totals.avg_uptime_24h.toFixed(2)}%`
                  : <span className="text-[15px] font-normal text-[var(--obc-text-4)]">insufficient data</span>}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <Section
        title="Client environments"
        hint="Sorted by what needs attention. Availability is only reported for environments that have monitors."
        id="client-environments"
      >
        {portfolio.isLoading || clients.isLoading ? (
          <RowsSkeleton rows={4} cols={6} />
        ) : rows.length ? (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(c) => c.id}
            rowHref={(c) => `/clients/${c.id}`}
            rowState={(c) => (c.status === 'critical' ? 'crit' : undefined)}
            stackBelow="xl"
            caption="Client environments with rolled-up availability, incidents and monitor counts"
          />
        ) : (
          <Empty
            title="No client environments"
            body="Add a client environment to begin managing external dependency reliability across organizations. Each environment groups its own applications, monitors, incidents and evidence, and rolls up here."
            action={
              <button
                type="button"
                className="obc-btn obc-btn-primary obc-btn-sm"
                onClick={() => setCreating(true)}
              >
                Add client environment
              </button>
            }
          />
        )}
      </Section>

      <Section
        title="Active incidents across clients"
        hint="Attributed by monitor: incident → dependency → application → client."
        action={<SectionLink href="/incidents">All incidents</SectionLink>}
        id="agency-incidents"
      >
        {openIncidents.isLoading ? (
          <RowsSkeleton rows={3} cols={5} />
        ) : incidents.length ? (
          <div className="border border-[var(--obc-line)]">
            {incidents.map(({ incident, dependency, clientId, clientName }) => (
              <Link
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="grid grid-cols-1 gap-2 border-b border-[var(--obc-line)] px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--obc-raised)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_130px_120px_140px_110px] lg:items-center lg:gap-4"
              >
                <span className="truncate text-[13px] font-medium text-[var(--obc-text)]">
                  {clientName ?? (
                    <span className="text-[var(--obc-text-4)]">unassigned monitor</span>
                  )}
                </span>
                <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">
                  {dependency?.name ?? 'Dependency not in the current list'}
                </span>
                <State status={incident.status} live={!incident.resolved_at} />
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
                  {formatUtc(incident.started_at, 'HH:mm:ss')}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
                  {durationBetween(incident.started_at, incident.resolved_at)} open
                </span>
                <span className="text-[11.5px] uppercase tracking-[0.1em] text-[var(--obc-text-4)]">
                  {incident.evidence_report_id ? 'Evidence ready' : 'No report yet'}
                </span>
                <span className="sr-only">
                  {incidentCode(incident.id, incident.display_id)}
                  {clientId ? ` for client ${clientName}` : ''}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="No active incidents"
            body="No client environment currently has an open incident. Incidents appear here the moment RELIASTRA confirms a failure against a monitor that belongs to one of your clients."
          />
        )}
      </Section>

      <Section
        title="Recent evidence by client"
        hint="Which client has a record you can act on, and which incident produced it."
        action={<SectionLink href="/reports">All reports</SectionLink>}
        id="agency-evidence"
      >
        {evidence.isLoading ? (
          <RowsSkeleton rows={3} cols={4} />
        ) : evidenceRows.length ? (
          <div className="border border-[var(--obc-line)]">
            {evidenceRows.map(({ report, incident, dependency, clientName }) => (
              <Link
                key={report.id}
                href={`/evidence/${report.id}`}
                className="grid grid-cols-1 gap-2 border-b border-[var(--obc-line)] px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--obc-raised)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_150px] lg:items-center lg:gap-4"
              >
                <span className="truncate text-[13px] text-[var(--obc-text)]">
                  {clientName ?? (
                    <span className="text-[var(--obc-text-4)]">unattributed</span>
                  )}
                </span>
                <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">
                  {dependency?.name ?? incident?.root_cause ?? 'Incident record'}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] text-[var(--obc-text-3)]">
                  {reportCode(report.id)}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
                  {timeAgo(report.generated_at)}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="No evidence records yet"
            body="An evidence record is generated when RELIASTRA confirms an incident against one of your monitors. Records appear here attributed to the client whose application the monitor belongs to."
          />
        )}
      </Section>

      {orphans.length > 0 && (
        <Section
          title="Unassigned monitors"
          hint="These monitors belong to your organization but not to any client application, so they roll up to no client."
          id="unassigned-monitors"
        >
          <div className="border border-[var(--obc-line)]">
            {orphans.map((d) => (
              <div
                key={d.id}
                className="flex flex-col gap-2 border-b border-[var(--obc-line)] px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-[var(--obc-text)]">{d.name}</p>
                  <p className="truncate font-[family-name:var(--ob-font-mono)] text-[11.5px] text-[var(--obc-text-4)]">
                    {d.endpoint_url}
                  </p>
                </div>
                <button
                  type="button"
                  className="obc-btn obc-btn-sm shrink-0"
                  onClick={() => router.push(`/dependencies/${d.id}`)}
                >
                  Assign to a client
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {creating && (
        <ClientCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/clients/${id}`);
          }}
        />
      )}
    </>
  );
}

/** Re-exported so the route file stays a one-liner. */
export { useCreateClient };
