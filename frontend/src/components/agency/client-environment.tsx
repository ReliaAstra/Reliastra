'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useAllApplications,
  useApplications,
  useClients,
  useCreateApplication,
  useDependencies,
  useEvidence,
  useIncidents,
  usePortfolio,
  useUpdateDependency,
} from '@/lib/dashboard/queries';
import { useAppStore } from '@/stores/app-store';
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
  applicationIndex,
  attributeEvidence,
  clientAvailability,
  clientLatency,
  dependenciesOfClient,
  isMeasured,
  unassignedDependencies,
} from '@/lib/agency/portfolio';
import type { Dependency, DependencyHealth, Incident } from '@/lib/dashboard/types';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  Readout,
  Row,
  RowsSkeleton,
  Section,
  SectionLink,
  State,
} from '@/components/console/primitives';
import { DataTable, type Column } from '@/components/console/data-table';
import { useHealth } from '@/lib/dashboard/queries';
import { AgencyGatedExperience } from './gated';
import { hasAgencyWorkspace } from '@/lib/agency/access';

/**
 * A client environment.
 *
 * Entering one should feel like entering a dedicated infrastructure
 * environment, so the page is scoped end to end: every table on it contains
 * only this client's applications, monitors, incidents and evidence, and the
 * header says which environment you are inside before it says anything else.
 *
 * The applications layer is not decoration - it is the join the backend uses.
 * A monitor becomes part of a client by being attached to one of that client's
 * applications, which is why attaching is done here rather than being buried
 * in the dependency record.
 */
export function ClientEnvironmentPage({ clientId }: { clientId: string }) {
  const org = useAppStore((s) => s.org);
  const plan = useAppStore((s) => s.plan);
  const agencyEnabled = hasAgencyWorkspace(org, plan);
  // Every read on this page is client-management data: a disabled
  // organization must not request it, so each query is gated on the same
  // entitlement the navigation uses.
  const portfolio = usePortfolio(agencyEnabled);
  const clients = useClients(agencyEnabled);
  const apps = useApplications(clientId, agencyEnabled);
  const deps = useDependencies(agencyEnabled);
  const health = useHealth(agencyEnabled);
  const incidents = useIncidents(undefined, 50, agencyEnabled);
  const evidence = useEvidence(agencyEnabled);
  const [addingApp, setAddingApp] = useState(false);

  const clientIds = useMemo(() => (clients.data ?? []).map((c) => c.id), [clients.data]);
  const allApplications = useAllApplications(clientIds, agencyEnabled);
  const index = useMemo(
    () => applicationIndex(allApplications.data ?? []),
    [allApplications.data]
  );

  const client = portfolio.data?.clients.find((c) => c.id === clientId) ?? null;
  const record = clients.data?.find((c) => c.id === clientId) ?? null;

  const clientDeps = useMemo(
    () => dependenciesOfClient(deps.data ?? [], index, clientId),
    [deps.data, index, clientId]
  );
  const depIds = useMemo(() => new Set(clientDeps.map((d) => d.id)), [clientDeps]);

  const healthById = useMemo(
    () => new Map((health.data ?? []).map((h) => [h.dependency_id, h])),
    [health.data]
  );

  const clientIncidents = useMemo(
    () => (incidents.data ?? []).filter((i) => depIds.has(i.dependency_id)),
    [incidents.data, depIds]
  );
  const openIncidents = clientIncidents.filter((i) => !i.resolved_at);

  const clientEvidence = useMemo(
    () =>
      attributeEvidence(
        evidence.data ?? [],
        incidents.data ?? [],
        deps.data ?? [],
        index,
        (portfolio.data?.clients ?? []).map((c) => ({ id: c.id, name: c.name }))
      ).filter((row) => row.clientId === clientId),
    [evidence.data, incidents.data, deps.data, index, portfolio.data, clientId]
  );

  const orphans = useMemo(
    () => unassignedDependencies(deps.data ?? [], index),
    [deps.data, index]
  );

  const lastObserved = useMemo(() => {
    const times = clientDeps
      .map((d) => healthById.get(d.id)?.last_check_at)
      .filter((t): t is string => !!t)
      .sort((a, b) => Date.parse(b) - Date.parse(a));
    return times[0] ?? null;
  }, [clientDeps, healthById]);

  if (!org) {
    // Session still resolving: show the page shape, not a not-found state.
    return (
      <>
        <PageHead eyebrow="Client environment" title="Client environment" />
        <div className="py-6">
          <RowsSkeleton rows={4} cols={4} />
        </div>
      </>
    );
  }
  if (!agencyEnabled) return <AgencyGatedExperience />;

  if (portfolio.isError || clients.isError) {
    return (
      <>
        <PageHead eyebrow="Client environment" title="Environment unavailable" />
        <div className="py-6">
          <Failure
            body="This client environment could not be retrieved. Nothing is shown in its place: a rollup assembled from a partial read would misstate a client's posture."
            onRetry={() => {
              portfolio.refetch();
              clients.refetch();
            }}
          />
        </div>
      </>
    );
  }

  if (!portfolio.isLoading && !clients.isLoading && !client && !record) {
    return (
      <>
        <PageHead eyebrow="Client environment" title="No such client environment" />
        <div className="py-6">
          <Empty
            title="Not found in this organization"
            body="This identifier does not match a client environment your organization owns. It may have been created under a different organization, or the link may be stale."
            action={
              <Link href="/clients" className="obc-btn obc-btn-sm">
                Back to client environments
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const measured = client ? isMeasured(client) : clientDeps.length > 0;

  const depColumns: Column<Dependency>[] = [
    {
      key: 'name',
      header: 'Monitor',
      sort: (d) => d.name.toLowerCase(),
      render: (d) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--obc-text)]">{d.name}</p>
          <p className="truncate font-[family-name:var(--ob-font-mono)] text-[11px] text-[var(--obc-text-4)]">
            {d.endpoint_url}
          </p>
        </div>
      ),
    },
    {
      key: 'application',
      header: 'Application',
      width: 160,
      sort: (d) => d.application_id ?? '',
      render: (d) => (
        <span className="text-[12.5px] text-[var(--obc-text-2)]">
          {(apps.data ?? []).find((a) => a.id === d.application_id)?.name ?? 'unassigned'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      sort: (d) => healthById.get(d.id)?.current_status ?? 'zz',
      render: (d) => <State status={healthById.get(d.id)?.current_status ?? 'unknown'} />,
    },
    {
      key: 'uptime',
      header: 'Availability 24h',
      numeric: true,
      width: 140,
      sort: (d) => healthById.get(d.id)?.uptime_percentage_24h ?? -1,
      render: (d) => {
        const h = healthById.get(d.id);
        if (!h || h.total_checks_24h === 0 || h.uptime_percentage_24h == null) {
          return <span className="text-[var(--obc-text-4)]">no monitors</span>;
        }
        return formatUptime(h.uptime_percentage_24h);
      },
    },
    {
      key: 'latency',
      header: 'Mean latency',
      numeric: true,
      width: 130,
      sort: (d) => healthById.get(d.id)?.avg_latency_ms_24h ?? -1,
      render: (d) => {
        const value = healthById.get(d.id)?.avg_latency_ms_24h;
        if (!value) return <span className="text-[var(--obc-text-4)]">no data</span>;
        return (
          <>
            {formatLatency(value)}
            <span className="obc-unit">ms</span>
          </>
        );
      },
    },
    {
      key: 'last',
      header: 'Last observation',
      width: 150,
      sort: (d) => healthById.get(d.id)?.last_check_at ?? '',
      render: (d) => {
        const at = healthById.get(d.id)?.last_check_at;
        return at ? timeAgo(at) : <span className="text-[var(--obc-text-4)]">never</span>;
      },
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={
          <span className="flex items-center gap-2">
            <Link href="/clients" className="hover:text-[var(--obc-signal)]">
              Agency operations
            </Link>
            <span aria-hidden className="text-[var(--obc-line-3)]">
              /
            </span>
            <span>Client environment</span>
          </span>
        }
        title={client?.name ?? record?.name ?? 'Client environment'}
        meta={
          <>
            {measured ? (
              <State
                status={client?.status ?? 'unknown'}
                live={client?.status === 'critical'}
              />
            ) : (
              <State status="unknown" label="Not observed" />
            )}
            <Fact
              label="Last observation"
              value={lastObserved ? formatUtc(lastObserved, 'HH:mm:ss') : 'none'}
            />
            <Fact label="Applications" value={apps.data?.length ?? 0} />
            <Fact label="Monitors" value={clientDeps.length} />
          </>
        }
        actions={
          <button
            type="button"
            className="obc-btn obc-btn-sm"
            onClick={() => setAddingApp((v) => !v)}
          >
            {addingApp ? 'Close' : 'Add application'}
          </button>
        }
      />

      {(client?.description || record?.description) && (
        <p className="max-w-[80ch] py-4 text-[12.5px] text-[var(--obc-text-3)]">
          {client?.description ?? record?.description}
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-b border-[var(--obc-line)] py-6 lg:grid-cols-4">
        <Readout
          label="Availability 24h"
          value={
            client
              ? clientAvailability(client.uptime_24h, client.dependency_count)
              : undefined
          }
          sub={measured ? 'Across every monitor in this environment' : 'No monitor has reported yet'}
          state={measured && client && client.uptime_24h < 99 ? 'warn' : undefined}
        />
        <Readout
          label="Mean latency"
          value={client ? clientLatency(client.avg_latency_ms, client.dependency_count) : undefined}
          unit={measured && client && client.avg_latency_ms > 0 ? 'ms' : undefined}
          sub="Mean across this client's monitors"
        />
        <Readout
          label="Open incidents"
          value={openIncidents.length}
          sub={openIncidents.length ? 'Confirmed against this client' : 'None currently open'}
          state={openIncidents.length ? 'crit' : undefined}
        />
        <Readout
          label="Evidence records"
          value={clientEvidence.length}
          sub="Generated from this client's incidents"
        />
      </div>

      {addingApp && (
        <ApplicationForm clientId={clientId} onDone={() => setAddingApp(false)} />
      )}

      <Section
        title="Applications"
        hint="Monitors are attached to applications, and applications belong to this client. That chain is what attributes an incident to a client."
        id="applications"
      >
        {apps.isLoading ? (
          <RowsSkeleton rows={2} cols={3} />
        ) : (apps.data ?? []).length ? (
          <div className="border border-[var(--obc-line)]">
            {(apps.data ?? []).map((application) => {
              const attached = clientDeps.filter((d) => d.application_id === application.id);
              return (
                <div
                  key={application.id}
                  className="flex flex-col gap-2 border-b border-[var(--obc-line)] px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--obc-text)]">
                      {application.name}
                    </p>
                    {application.description && (
                      <p className="truncate text-[11.5px] text-[var(--obc-text-4)]">
                        {application.description}
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
                    {attached.length} monitor{attached.length === 1 ? '' : 's'}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No applications in this environment"
            body="An application is what a monitor attaches to: a product, a service, an environment."
            action={
              <button
                type="button"
                className="obc-btn obc-btn-sm"
                onClick={() => setAddingApp(true)}
              >
                Add application
              </button>
            }
          />
        )}
      </Section>

      <Section
        title="Dependency health"
        hint="Every external dependency observed on behalf of this client."
        action={<SectionLink href="/dependencies">All dependencies</SectionLink>}
        id="client-dependencies"
      >
        {deps.isLoading || health.isLoading ? (
          <RowsSkeleton rows={4} cols={5} />
        ) : clientDeps.length ? (
          <DataTable
            rows={clientDeps}
            columns={depColumns}
            rowKey={(d) => d.id}
            rowHref={(d) => `/dependencies/${d.id}`}
            caption={`Dependencies monitored for this client environment`}
          />
        ) : (
          <Empty
            title="No monitors attached"
            body="This environment has no dependency attached to any of its applications, so no availability can be reported for it. Attach an existing monitor below, or add a dependency and assign it to one of this client's applications."
          />
        )}
      </Section>

      {(apps.data ?? []).length > 0 && orphans.length > 0 && (
        <Section
          title="Attach an existing monitor"
          hint="Monitors that belong to your organization but to no client yet."
          id="attach-monitor"
        >
          <AttachMonitors
            orphans={orphans}
            applications={(apps.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
          />
        </Section>
      )}

      <Section
        title="Incidents"
        hint="Confirmed failures against this client's monitors."
        action={<SectionLink href="/incidents">All incidents</SectionLink>}
        id="client-incidents"
      >
        {incidents.isLoading ? (
          <RowsSkeleton rows={3} cols={4} />
        ) : clientIncidents.length ? (
          <div className="border border-[var(--obc-line)]">
            {clientIncidents.slice(0, 10).map((incident) => (
              <IncidentRow
                key={incident.id}
                incident={incident}
                dependencyName={
                  clientDeps.find((d) => d.id === incident.dependency_id)?.name ?? 'Monitor'
                }
              />
            ))}
          </div>
        ) : (
          <Empty
            title="No incidents recorded"
            body="RELIASTRA has not confirmed a failure against this client's monitors. That is a statement about what has been observed, not a guarantee about services this environment does not monitor."
          />
        )}
      </Section>

      <Section
        title="Evidence records"
        hint="The artifacts you can hand this client, or their vendor."
        action={<SectionLink href="/reports">All reports</SectionLink>}
        id="client-evidence"
      >
        {evidence.isLoading ? (
          <RowsSkeleton rows={2} cols={4} />
        ) : clientEvidence.length ? (
          <div className="border border-[var(--obc-line)]">
            {clientEvidence.map(({ report, dependency }) => (
              <Link
                key={report.id}
                href={`/evidence/${report.id}`}
                className="grid grid-cols-1 gap-2 border-b border-[var(--obc-line)] px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--obc-raised)] lg:grid-cols-[130px_minmax(0,1fr)_150px_130px] lg:items-center lg:gap-4"
              >
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] text-[var(--obc-text-3)]">
                  {reportCode(report.id)}
                </span>
                <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">
                  {dependency?.name ?? 'Incident record'}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
                  {formatUtc(report.generated_at, 'dd MMM HH:mm')}
                </span>
                <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-4)]">
                  {(report.file_size_bytes / 1024).toFixed(0)} KB
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="No evidence for this client yet"
            body="An evidence record is produced when RELIASTRA confirms an incident against one of this client's monitors. Until then there is nothing to hand over."
          />
        )}
      </Section>

      <Section title="Environment record" id="client-record">
        <dl className="max-w-[70ch]">
          <Row label="Client identifier" mono>
            {clientId}
          </Row>
          <Row label="Created" mono>
            {record?.created_at ? formatUtc(record.created_at, 'dd MMM yyyy HH:mm') : 'not recorded'}
          </Row>
          <Row label="Applications" mono>
            {apps.data?.length ?? 0}
          </Row>
          <Row label="Monitors attached" mono>
            {clientDeps.length}
          </Row>
          <Row label="Rollup source">
            Availability and incident counts are computed by the API across this client&apos;s
            monitors over the last 24 hours.
          </Row>
        </dl>
      </Section>
    </>
  );
}

/* ── Incident row ────────────────────────────────────────────────────────── */

function IncidentRow({
  incident,
  dependencyName,
}: {
  incident: Incident;
  dependencyName: string;
}) {
  return (
    <Link
      href={`/incidents/${incident.id}`}
      className="grid grid-cols-1 gap-2 border-b border-[var(--obc-line)] px-3 py-3 transition-colors last:border-b-0 hover:bg-[var(--obc-raised)] lg:grid-cols-[120px_minmax(0,1fr)_130px_140px_120px] lg:items-center lg:gap-4"
    >
      <span className="font-[family-name:var(--ob-font-mono)] text-[12px] text-[var(--obc-text-3)]">
        {incidentCode(incident.id, incident.display_id)}
      </span>
      <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">
        {dependencyName} · {incident.root_cause}
      </span>
      <State status={incident.status} live={!incident.resolved_at} />
      <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-3)]">
        {formatUtc(incident.started_at, 'dd MMM HH:mm')}
      </span>
      <span className="font-[family-name:var(--ob-font-mono)] text-[12px] tabular-nums text-[var(--obc-text-4)]">
        {durationBetween(incident.started_at, incident.resolved_at)}
      </span>
    </Link>
  );
}

/* ── Application creation ────────────────────────────────────────────────── */

function ApplicationForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const create = useCreateApplication();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('An application needs a name.');
      return;
    }
    try {
      await create.mutateAsync({
        clientId,
        body: { name: name.trim(), description: description.trim() || undefined },
      });
      setName('');
      setDescription('');
      onDone();
    } catch {
      setError('The application could not be created. Check your permissions and try again.');
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-b border-[var(--obc-line)] py-5"
      aria-label="Add application"
    >
      <p className="obc-label mb-3">New application in this environment</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
        <div>
          <label className="obc-field-label" htmlFor="application-name">
            Name
          </label>
          <input
            id="application-name"
            className="obc-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            required
          />
        </div>
        <div>
          <label className="obc-field-label" htmlFor="application-description">
            Description (optional)
          </label>
          <input
            id="application-description"
            className="obc-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </div>
        <button type="submit" className="obc-btn obc-btn-primary" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add application'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-[#E58C85]">
          {error}
        </p>
      )}
    </form>
  );
}

/* ── Attaching monitors ──────────────────────────────────────────────────── */

/**
 * Attaching a monitor is a PATCH of `application_id` on the dependency - the
 * same field the API already exposes. Nothing is copied or duplicated: the
 * monitor keeps its history and simply starts rolling up to this client.
 */
function AttachMonitors({
  orphans,
  applications,
}: {
  orphans: Dependency[];
  applications: Array<{ id: string; name: string }>;
}) {
  const update = useUpdateDependency();
  const [target, setTarget] = useState(applications[0]?.id ?? '');
  const [pending, setPending] = useState<string | null>(null);

  return (
    <div className="border border-[var(--obc-line)]">
      <div className="flex flex-col gap-3 border-b border-[var(--obc-line)] px-3 py-3 sm:flex-row sm:items-end">
        <div className="sm:w-[280px]">
          <label className="obc-field-label" htmlFor="attach-application">
            Attach to application
          </label>
          <select
            id="attach-application"
            className="obc-input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[11.5px] leading-[1.6] text-[var(--obc-text-4)] sm:pb-2">
          The monitor keeps its full observation history; only its owning application changes.
        </p>
      </div>
      {orphans.map((d) => (
        <div
          key={d.id}
          className="flex flex-col gap-2 border-b border-[var(--obc-line)] px-3 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] text-[var(--obc-text)]">{d.name}</p>
            <p className="truncate font-[family-name:var(--ob-font-mono)] text-[11px] text-[var(--obc-text-4)]">
              {d.endpoint_url}
            </p>
          </div>
          <button
            type="button"
            className="obc-btn obc-btn-sm shrink-0"
            disabled={!target || pending === d.id}
            onClick={async () => {
              setPending(d.id);
              try {
                await update.mutateAsync({ id: d.id, body: { application_id: target } });
              } finally {
                setPending(null);
              }
            }}
          >
            {pending === d.id ? 'Attaching…' : 'Attach'}
          </button>
        </div>
      ))}
    </div>
  );
}

export type { DependencyHealth };
