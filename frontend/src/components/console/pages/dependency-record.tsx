'use client';

import Link from 'next/link';
import { CheckExecution } from '@/components/console/check-execution';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import {
  useDeleteDependency,
  useDependency,
  useDependencyHistory,
  useDependencyResults,
  useHealth,
  useIncidents,
  useLatency,
} from '@/lib/dashboard/queries';
import {
  durationBetween,
  formatLatency,
  formatUptime,
  formatUtc,
  incidentCode,
  timeAgo,
} from '@/lib/dashboard/format';
import { OBSERVATION_POINT_LABEL } from '@/lib/product-contract';
import { intervalLabel, retentionLabel } from '@/lib/dashboard/plans';
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
  toState,
} from '@/components/console/primitives';
import { CheckStrip, Plot } from '@/components/console/telemetry';
import { DataTable, type Column } from '@/components/console/data-table';
import type { CheckResult } from '@/lib/dashboard/types';

/**
 * Dependency record.
 *
 * Everything here answers "is this thing healthy, since when, from where, and
 * what did we record". The prior page fed the latency chart from a response
 * shape the API does not return (`{timestamp, latency_ms}` against an actual
 * `{points:[{t,v}]}`), so the chart was permanently empty; that is fixed, and
 * an empty series now says it is empty rather than drawing nothing.
 */
export function DependencyRecordPage({ id }: { id: string }) {
  const dep = useDependency(id);
  const history = useDependencyHistory(id);
  const results = useDependencyResults(id);
  const latency = useLatency(id);
  const health = useHealth();
  const incidents = useIncidents(undefined, 50);
  const del = useDeleteDependency();
  const setAdd = useAppStore((s) => s.setAddDependencyOpen);
  const plan = useAppStore((s) => s.plan);
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const row = health.data?.find((h) => h.dependency_id === id);
  const depIncidents = useMemo(
    () => (incidents.data ?? []).filter((i) => i.dependency_id === id),
    [incidents.data, id]
  );
  const open = depIncidents.find((i) => !i.resolved_at);

  // RELIASTRA probes from one place, so the checks are a single time-ordered
  // stream, not a set of parallel series to compare against each other.
  const stream = useMemo(
    () =>
      [...(results.data ?? [])].sort(
        (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()
      ),
    [results.data]
  );

  if (dep.isLoading) {
    return (
      <>
        <div className="border-b border-[var(--obc-line-2)] py-6">
          <div className="obc-skel h-6 w-64" />
          <div className="obc-skel mt-3 h-3 w-96" />
        </div>
        <div className="obc-section">
          <RowsSkeleton rows={5} cols={4} />
        </div>
      </>
    );
  }

  if (dep.isError || !dep.data) {
    return (
      <div className="obc-section">
        <Failure
          title="Dependency unavailable"
          body="This dependency could not be retrieved. It may have been deleted, or the API could not be reached. Nothing about the monitoring configuration has changed."
          onRetry={() => dep.refetch()}
        />
      </div>
    );
  }

  const d = dep.data;
  const status = row?.current_status ?? (d.is_active ? 'unknown' : 'paused');
  const points = latency.data?.points ?? [];

  // Headline figures for the observation stream. Derived here, not inside the
  // markup, so the panel reads as data rather than as an inline computation.
  const lastObservation = stream.length ? stream[stream.length - 1] : null;
  const observationsUp = stream.filter((r) => r.is_up).length;
  const observationStale =
    lastObservation !== null &&
    Date.now() - Date.parse(lastObservation.executed_at) >
      Math.max(90, d.check_interval_seconds * 3) * 1000;

  return (
    <>
      <PageHead
        eyebrow={
          <span className="obc-mono">
            {d.method} · {intervalLabel(d.check_interval_seconds)}
          </span>
        }
        title={d.name}
        meta={
          <>
            <State status={status} live={Boolean(open)} />
            <Fact
              label="Availability 24h"
              value={
                row?.uptime_percentage_24h != null
                  ? formatUptime(row.uptime_percentage_24h)
                  : 'no data'
              }
            />
            <Fact
              label="Latency 24h"
              value={
                row?.avg_latency_ms_24h != null
                  ? `${formatLatency(row.avg_latency_ms_24h)} ms`
                  : 'no data'
              }
            />
            <Fact
              label="Last observation"
              value={row?.last_check_at ? timeAgo(row.last_check_at) : 'no observation'}
            />
          </>
        }
        actions={
          <>
            <button type="button" className="obc-btn" onClick={() => setAdd(true, d.id)}>
              Edit configuration
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="obc-btn"
                  style={{ borderColor: 'var(--obc-crit)', color: '#E58C85' }}
                  disabled={del.isPending}
                  onClick={async () => {
                    await del.mutateAsync(d.id);
                    router.push('/dependencies');
                  }}
                >
                  {del.isPending ? 'Removing…' : 'Confirm removal'}
                </button>
                <button type="button" className="obc-btn" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="obc-btn" onClick={() => setConfirmDelete(true)}>
                Remove
              </button>
            )}
          </>
        }
      />

      <p className="obc-mono mt-4 break-all text-[var(--obc-text-3)]">{d.endpoint_url}</p>

      {open && (
        <div
          role="status"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-[var(--obc-crit)]/35 bg-[var(--obc-crit-wash)] px-4 py-3"
        >
          <span className="flex flex-wrap items-center gap-4">
            <span className="obc-mono text-[var(--obc-signal)]">
              {incidentCode(open.id, open.display_id)}
            </span>
            <span className="text-[12.5px] text-[var(--obc-text)]">
              {open.title || open.root_cause}
            </span>
            <span className="obc-mono text-[var(--obc-text-3)]">
              open {durationBetween(open.started_at, null)}
            </span>
          </span>
          <Link href={`/incidents/${open.id}`} className="obc-btn obc-btn-sm">
            Open incident
          </Link>
        </div>
      )}

      <CheckExecution id={id} />

      <Section
        title="Observed latency"
        hint={
          latency.isError
            ? undefined
            : 'Measured at the RELIASTRA observation point, over the last 24 hours, in UTC.'
        }
      >
        {latency.isLoading ? (
          <div className="obc-skel h-[132px] w-full" />
        ) : latency.isError ? (
          <Failure
            body="The latency series could not be retrieved. Treat the gap as unmeasured, not as healthy."
            lastGood={row?.last_check_at ? formatUtc(row.last_check_at, 'HH:mm:ss') : null}
            onRetry={() => latency.refetch()}
          />
        ) : points.length < 2 ? (
          <Empty
            title="Not enough observations to plot"
            body="A latency series needs at least two recorded checks. The first points appear once monitoring has run for a full interval."
          />
        ) : (
          <>
            <Plot
              points={points}
              unit="ms"
              threshold={d.alert_threshold_ms}
              state={toState(status) === 'ok' ? 'ok' : toState(status) === 'warn' ? 'warn' : 'crit'}
              label={`Observed latency for ${d.name} over the last 24 hours`}
            />
            <p className="mt-2 text-[11px] text-[var(--obc-text-4)]">
              {d.alert_threshold_ms
                ? `Dashed rule is the configured alert threshold (${d.alert_threshold_ms} ms). `
                : 'No alert threshold configured. '}
              History is retained for {retentionLabel(plan?.data_retention_days ?? null)} on your
              current plan.
            </p>
          </>
        )}
      </Section>

      <Section title="24-hour totals">
        {history.isError ? (
          <Failure
            body="Aggregate totals could not be retrieved. The underlying checks are unaffected."
            onRetry={() => history.refetch()}
          />
        ) : history.isLoading ? (
          <RowsSkeleton rows={1} cols={5} />
        ) : (
          <div className="grid grid-cols-2 gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] md:grid-cols-5">
            {[
              {
                label: 'Availability',
                value:
                  history.data && history.data.total_checks > 0 && history.data.uptime_percentage != null
                    ? formatUptime(history.data.uptime_percentage)
                    : null,
              },
              {
                label: 'Average latency',
                value:
                  history.data && history.data.total_checks > 0 && history.data.avg_latency_ms != null
                    ? formatLatency(history.data.avg_latency_ms)
                    : null,
                unit: 'ms',
              },
              { label: 'Checks run', value: history.data?.total_checks ?? null },
              { label: 'Checks up', value: history.data?.total_up ?? null },
              {
                label: 'Checks down',
                value: history.data?.total_down ?? null,
                state: history.data?.total_down ? ('crit' as const) : undefined,
              },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--obc-base)] p-4">
                <Readout label={s.label} value={s.value} unit={s.unit} state={s.state} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Observation stream"
        hint="Every recorded check, oldest to newest, from the single RELIASTRA observation point."
      >
        {results.isLoading ? (
          <RowsSkeleton rows={3} cols={2} />
        ) : results.isError ? (
          <Failure
            body="Check results could not be retrieved."
            onRetry={() => results.refetch()}
          />
        ) : stream.length === 0 ? (
          <Empty
            title="No checks recorded yet"
            body="Checks run on the configured interval. If none appear after one interval, investigate the checking pipeline, not this endpoint."
          />
        ) : (
          <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13px] text-[var(--obc-text)]">{OBSERVATION_POINT_LABEL}</p>
              <State
                status={
                  observationStale
                    ? 'unknown'
                    : lastObservation?.is_up
                      ? 'operational'
                      : 'down'
                }
              />
            </div>
            <div className="mt-3">
              <CheckStrip
                cells={stream.map((r) => ({
                  at: r.executed_at,
                  up: r.is_up,
                  latency: r.latency_ms,
                }))}
                label={`${stream.length} checks from the ${OBSERVATION_POINT_LABEL}`}
              />
            </div>
            <dl className="mt-3">
              <Row label="Checks" mono>
                {observationsUp}/{stream.length} up
              </Row>
              <Row label="Last observation" mono>
                {lastObservation ? formatUtc(lastObservation.executed_at, 'HH:mm:ss') : 'none'}
              </Row>
              <Row label="Last latency" mono>
                {lastObservation?.is_up
                  ? `${formatLatency(lastObservation.latency_ms)} ms`
                  : 'no response'}
              </Row>
            </dl>
          </div>
        )}
      </Section>

      <ObservationLog
        results={results.data}
        loading={results.isLoading}
        error={results.isError}
        onRetry={() => results.refetch()}
      />

      <Section
        title="Incidents"
        hint="Every incident recorded against this dependency."
        action={<SectionLink href="/incidents">All incidents</SectionLink>}
      >
        {incidents.isLoading ? (
          <RowsSkeleton rows={2} cols={3} />
        ) : !depIncidents.length ? (
          <Empty
            title="No incidents recorded"
            body="No incident records are available for this dependency."
          />
        ) : (
          <ul className="border border-[var(--obc-line)]">
            {depIncidents.map((i) => (
              <li key={i.id} className="border-b border-[var(--obc-line)] last:border-b-0">
                <Link
                  href={`/incidents/${i.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3.5 py-2.5 transition-colors hover:bg-[var(--obc-hover)]"
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="obc-mono text-[var(--obc-signal)]">
                      {incidentCode(i.id, i.display_id)}
                    </span>
                    <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">
                      {i.title || i.root_cause}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-6">
                    <State status={i.status} live={!i.resolved_at} />
                    <span className="obc-mono text-[var(--obc-text-3)]">
                      {formatUtc(i.started_at, 'MMM d HH:mm')}
                    </span>
                    <span className="obc-mono w-16 text-right text-[var(--obc-text-3)]">
                      {durationBetween(i.started_at, i.resolved_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Configuration"
        action={
          <button type="button" className="obc-btn obc-btn-sm" onClick={() => setAdd(true, d.id)}>
            Edit
          </button>
        }
      >
        <div className="grid gap-x-10 md:grid-cols-2">
          <dl>
            <Row label="Endpoint" mono>
              <span className="break-all">{d.endpoint_url}</span>
            </Row>
            <Row label="Method" mono>
              {d.method}
            </Row>
            <Row label="Expected status" mono>
              {d.expected_status_codes.join(', ')}
            </Row>
            <Row label="Custom headers" mono>
              {d.has_headers ? 'configured' : 'none'}
            </Row>
            <Row label="Timeout" mono>
              {d.timeout_seconds}s
            </Row>
          </dl>
          <dl>
            <Row label="Check interval" mono>
              {intervalLabel(d.check_interval_seconds)}
            </Row>
            <Row label="Next check" mono>
              {d.next_check_at ? formatUtc(d.next_check_at, 'HH:mm:ss') : 'not scheduled'}
            </Row>
            <Row label="Observation point" mono>
              {OBSERVATION_POINT_LABEL}
            </Row>
            <Row label="Alert threshold" mono>
              {d.alert_threshold_ms ? `${d.alert_threshold_ms} ms` : 'none set'}
            </Row>
            <Row label="Monitoring" mono>
              {d.is_active ? 'active' : 'paused'}
            </Row>
          </dl>
        </div>
      </Section>
    </>
  );
}

function ObservationLog({
  results,
  loading,
  error,
  onRetry,
}: {
  results: CheckResult[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const [limit, setLimit] = useState(25);
  const sorted = useMemo(
    () =>
      [...(results ?? [])].sort(
        (a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
      ),
    [results]
  );
  const rows = sorted.slice(0, limit);

  const columns: Column<CheckResult>[] = [
    {
      key: 'time',
      header: 'Observed (UTC)',
      width: 150,
      numeric: true,
      sort: (r) => r.executed_at,
      render: (r) => formatUtc(r.executed_at, 'MMM d HH:mm:ss'),
    },
    {
      key: 'result',
      header: 'Result',
      width: 120,
      sort: (r) => (r.is_up ? 1 : 0),
      render: (r) => <State status={r.is_up ? 'operational' : 'down'} />,
    },
    {
      key: 'code',
      header: 'Status code',
      width: 100,
      numeric: true,
      sort: (r) => r.status_code ?? 0,
      render: (r) => r.status_code ?? <span className="text-[var(--obc-text-4)]">none</span>,
    },
    {
      key: 'latency',
      header: 'Latency',
      width: 100,
      numeric: true,
      sort: (r) => r.latency_ms,
      render: (r) =>
        r.is_up ? (
          <>
            {formatLatency(r.latency_ms)}
            <span className="ml-1 text-[10px] text-[var(--obc-text-4)]">ms</span>
          </>
        ) : (
          <span className="text-[var(--obc-text-4)]">none</span>
        ),
    },
    {
      key: 'quorum',
      header: 'Confirmed',
      width: 100,
      sort: (r) => (r.quorum_confirmed ? 0 : 1),
      render: (r) => (
        <span className="text-[12px] text-[var(--obc-text-3)]">
          {r.quorum_confirmed ? 'confirmed' : 'not confirmed'}
        </span>
      ),
    },
    {
      key: 'error',
      header: 'Error',
      sort: (r) => r.error_message ?? '',
      render: (r) =>
        r.error_message ? (
          <span className="truncate text-[12px] text-[#E58C85]">{r.error_message}</span>
        ) : (
          <span className="text-[var(--obc-text-4)]">none</span>
        ),
    },
  ];

  return (
    <Section
      title="Observation log"
      hint="Raw check results, most recent first. This is the material an evidence record is built from."
    >
      {loading ? (
        <RowsSkeleton rows={6} cols={6} />
      ) : error ? (
        <Failure
          body="The observation log could not be retrieved. The checks themselves may exist; retry, and treat any gap as unmeasured rather than healthy."
          onRetry={onRetry}
        />
      ) : !sorted.length ? (
        <Empty
          title="No observations recorded"
          body="Once the first check completes, every result is listed here with its latency, status code and confirmation state."
        />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            caption="Check results, most recent first"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="obc-mono text-[var(--obc-text-4)]">
              showing {rows.length} of {sorted.length}
            </p>
            {rows.length < sorted.length && (
              <button
                type="button"
                className="obc-btn obc-btn-sm"
                onClick={() => setLimit((l) => l + 50)}
              >
                Show more
              </button>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
