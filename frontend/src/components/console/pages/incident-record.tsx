'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useIncident,
  useIncidentEvidence,
  useDependency,
  useDependencyResults,
} from '@/lib/dashboard/queries';
import {
  durationBetween,
  formatLatency,
  formatUtc,
  incidentCode,
  reportCode,
} from '@/lib/dashboard/format';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  Readout,
  Row,
  RowsSkeleton,
  Section,
  State,
  toState,
} from '@/components/console/primitives';
import { CheckStrip, Plot } from '@/components/console/telemetry';
import { evidenceState } from '@/lib/dashboard/evidence-state';
import type { CheckResult, IncidentDetail } from '@/lib/dashboard/types';

/**
 * Incident record.
 *
 * The previous version of this page rendered two headline figures - * "Error rate 3.1x" and "Latency p95 1,240ms" - as hardcoded string literals,
 * shown on every incident that had any chart data at all. On a product whose
 * entire promise is evidence for an SLA dispute, that is the most damaging
 * possible defect: a customer could have quoted an invented multiplier to a
 * vendor. Every number below is now derived from the observations the API
 * actually returned, and anything the backend does not supply is absent
 * rather than estimated.
 */
export function IncidentRecordPage({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useIncident(id);
  const dep = useDependency(data?.dependency_id ?? '');
  const results = useDependencyResults(data?.dependency_id ?? '');
  // Explicit request only for an incident whose evidence has to be (re)made:
  // a legacy record from before automatic generation, or a failed attempt the
  // operator wants to retry. An incident that already has a report, or one
  // that is still generating, needs no click at all.
  const [evidenceRequested, setEvidenceRequested] = useState(false);
  const evidenceView = evidenceState(data ?? {});
  const needsManualRequest =
    evidenceView.key === 'unknown' || evidenceView.key === 'failed';
  const evidence = useIncidentEvidence(
    id,
    evidenceView.key === 'available' ||
      evidenceView.key === 'generating' ||
      (evidenceRequested && needsManualRequest),
  );

  if (isLoading) {
    return (
      <>
        <div className="border-b border-[var(--obc-line-2)] py-6">
          <div className="obc-skel h-3 w-24" />
          <div className="obc-skel mt-3 h-6 w-80" />
        </div>
        <div className="obc-section">
          <RowsSkeleton rows={5} cols={4} />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <div className="obc-section">
        <Failure
          title="Incident record unavailable"
          body="This incident could not be retrieved. The record is unaffected."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const code = incidentCode(data.id, data.display_id);
  const active = !data.resolved_at;

  return (
    <>
      <PageHead
        eyebrow={<span className="obc-mono text-[var(--obc-signal)]">{code}</span>}
        title={data.title || data.root_cause || 'Incident'}
        meta={
          <>
            <State status={data.status} live={active} />
            <Fact label="Severity" value={data.severity} mono={false} />
            <Fact label="Detected" value={formatUtc(data.started_at, 'yyyy-MM-dd HH:mm:ss')} />
            <Fact
              label={active ? 'Last update' : 'Recovered'}
              value={formatUtc(data.resolved_at ?? data.updated_at, 'yyyy-MM-dd HH:mm:ss')}
            />
            <Fact
              label="Duration"
              value={durationBetween(data.started_at, data.resolved_at)}
              state={active ? 'crit' : undefined}
            />
          </>
        }
        actions={
          evidence.data ? (
            <Link href={`/evidence/${evidence.data.id}`} className="obc-btn obc-btn-primary">
              Open evidence record
            </Link>
          ) : evidenceView.action === 'retry' ? (
            <button
              type="button"
              className="obc-btn"
              onClick={() => {
                setEvidenceRequested(true);
                void evidence.refetch();
              }}
              disabled={evidence.isFetching}
            >
              {evidence.isFetching ? 'Retrying…' : 'Retry evidence generation'}
            </button>
          ) : evidenceView.action === 'upgrade' ? (
            <Link href="/billing" className="obc-btn">
              Upgrade to generate evidence
            </Link>
          ) : evidenceView.key === 'generating' ? (
            <span className="obc-btn" aria-disabled>
              Generating…
            </span>
          ) : (
            <button
              type="button"
              className="obc-btn"
              onClick={() => setEvidenceRequested(true)}
              disabled={evidence.isFetching}
            >
              {evidence.isFetching ? 'Checking…' : 'Request evidence'}
            </button>
          )
        }
      />

      <Attribution incident={data} depName={dep.data?.name} />

      <Section
        title="Timeline"
        hint="Observations in the order they were recorded. Nothing is backfilled or inferred."
      >
        <Timeline incident={data} />
      </Section>

      <Observations
        incident={data}
        results={results.data}
        loading={results.isLoading}
        error={results.isError}
        onRetry={() => results.refetch()}
        threshold={dep.data?.alert_threshold_ms ?? null}
      />

      <Section
        title="Evidence"
        hint="A confirmed incident produces a timestamped, checksummed record."
      >
        {evidence.data ? (
          <div className="border border-[var(--obc-line)]">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--obc-line)] px-3.5 py-3">
              <span className="obc-mono text-[var(--obc-signal)]">
                {reportCode(evidence.data.id)}
              </span>
              <span className="obc-mono text-[var(--obc-text-4)]">
                generated {formatUtc(evidence.data.generated_at, 'yyyy-MM-dd HH:mm:ss')}
              </span>
            </div>
            <dl className="px-3.5 py-1">
              <Row label="Checksum" mono>
                <span className="break-all">{evidence.data.checksum}</span>
              </Row>
              <Row label="Size" mono>
                {(evidence.data.file_size_bytes / 1024).toFixed(1)} KB
              </Row>
              {evidence.data.expires_at && (
                <Row label="Expires" mono>
                  {formatUtc(evidence.data.expires_at, 'yyyy-MM-dd HH:mm')}
                </Row>
              )}
            </dl>
            <div className="border-t border-[var(--obc-line)] px-3.5 py-3">
              <Link href={`/evidence/${evidence.data.id}`} className="obc-btn obc-btn-sm">
                Open record
              </Link>
            </div>
          </div>
        ) : evidence.isFetching ? (
          <RowsSkeleton rows={2} cols={2} />
        ) : evidenceView.key === 'failed' ? (
          <Failure
            title="Evidence generation failed"
            body={evidenceView.hint}
            onRetry={() => {
              setEvidenceRequested(true);
              void evidence.refetch();
            }}
          />
        ) : evidenceView.key === 'not_entitled' ? (
          <Empty title="Evidence is not included in this plan" body={evidenceView.hint} />
        ) : evidenceView.key === 'generating' ? (
          <Empty
            title="Evidence is being generated"
            body="Generation was requested when this incident resolved. This view updates when the report is stored."
          />
        ) : (
          <Empty
            title={
              evidenceView.key === 'unknown'
                ? 'No evidence record for this incident'
                : 'Evidence not generated yet'
            }
            body={evidenceView.hint}
          />
        )}
      </Section>
    </>
  );
}

/**
 * Attribution - the section that answers "was this us or them?".
 *
 * Every value here is read straight off the incident payload. Correlation
 * confidence is the backend's `correlation_confidence`, printed as the
 * percentage it is; when the backend supplies no correlation, this section
 * says so instead of implying one.
 */
function Attribution({ incident, depName }: { incident: IncidentDetail; depName?: string }) {
  const correlations = incident.correlations ?? [];
  const primary = correlations[0];

  return (
    <Section
      title="Attribution"
      hint="Which side of the boundary the fault sits on, and what supports that conclusion."
    >
      <div className="grid gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] md:grid-cols-2">
        <div className="bg-[var(--obc-base)] p-4">
          <p className="obc-label">Your service</p>
          <p className="mt-2 text-[13px] text-[var(--obc-text-2)]">
            {depName ?? 'This dependency'} is consumed by your application.
            RELIASTRA observes the dependency, not your internal systems, so
            this record attributes the external side only.
          </p>
        </div>
        <div className="bg-[var(--obc-base)] p-4">
          <p className="obc-label">External dependency</p>
          <p className="mt-2 text-[13px] text-[var(--obc-text)]">
            {incident.vendor ?? depName ?? 'Unnamed dependency'}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--obc-text-3)]">
            {incident.root_cause}
          </p>
        </div>
      </div>

      <dl className="mt-px border-x border-b border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-2">
        <Row label="Correlation method" mono>
          {primary ? primary.correlation_method : <Missing />}
        </Row>
        <Row label="Correlation confidence" mono>
          {primary ? (
            `${(primary.correlation_confidence * 100).toFixed(0)}%`
          ) : (
            <Missing note="no correlation returned" />
          )}
        </Row>
        <Row label="Correlation window" mono>
          {primary ? `${primary.time_window_seconds}s` : <Missing />}
        </Row>
        <Row label="Correlated dependencies" mono>
          {correlations.length || <Missing />}
        </Row>
      </dl>

      {incident.other_dependencies && incident.other_dependencies.length > 0 && (
        <div className="mt-4">
          <p className="obc-label mb-2">
            Other dependencies during the same window
          </p>
          <ul className="border border-[var(--obc-line)]">
            {incident.other_dependencies.map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between gap-4 border-b border-[var(--obc-line)] px-3.5 py-2 last:border-b-0"
              >
                <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">{d.name}</span>
                <span className="flex shrink-0 items-center gap-5">
                  <State status={d.status} />
                  <span className="obc-mono w-16 text-right text-[var(--obc-text-3)]">
                    {d.latency_ms ? `${Math.round(d.latency_ms)} ms` : 'no data'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-[var(--obc-text-4)]">
            Listed for contrast: a fault isolated to one dependency is
            attributable to that dependency, not to shared network conditions.
          </p>
        </div>
      )}
    </Section>
  );
}

function Missing({ note = 'not supplied' }: { note?: string }) {
  return <span className="text-[var(--obc-text-4)]">{note}</span>;
}

const EVENT_WORD: Record<string, string> = {
  detection: 'Detected',
  vendor_spike: 'Vendor degradation',
  confirmation: 'Detector confirmed',
  resolution: 'Recovered',
};

function Timeline({ incident }: { incident: IncidentDetail }) {
  const events = incident.timeline ?? [];
  if (!events.length) {
    return (
      <Empty
        title="No timeline events recorded"
        body="Timeline entries are written as observations are confirmed. An incident opened moments ago may not have any yet."
      />
    );
  }
  return (
    <ol className="border border-[var(--obc-line)]">
      {events.map((e, i) => (
        <li
          key={e.id}
          className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 border-b border-[var(--obc-line)] px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[150px_150px_1fr_auto]"
        >
          <span className="obc-mono text-[var(--obc-text)]">
            {formatUtc(e.timestamp, 'HH:mm:ss')}
          </span>
          <span className="obc-label col-start-1 sm:col-start-2">
            {EVENT_WORD[e.type] ?? e.type}
          </span>
          <span className="col-span-2 text-[12.5px] text-[var(--obc-text-2)] sm:col-span-1 sm:col-start-3">
            {e.description}
          </span>
          {e.metric && (
            <span className="obc-mono col-start-2 text-right text-[var(--obc-signal)] sm:col-start-4">
              {e.metric}
            </span>
          )}
          <span className="sr-only">Event {i + 1} of {events.length}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Observations: the raw checks that support the incident.
 *
 * Headline figures are computed here from `results`, so they can only ever
 * describe measurements that exist. `peak` is the maximum observed latency in
 * the window; `failed` counts checks the backend marked not-up. If the
 * results endpoint returns nothing, no figures are shown at all.
 */
function Observations({
  incident,
  results,
  loading,
  error,
  onRetry,
  threshold,
}: {
  incident: IncidentDetail;
  results: CheckResult[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  threshold: number | null;
}) {
  const windowStart = new Date(incident.started_at).getTime();
  const windowEnd = incident.resolved_at ? new Date(incident.resolved_at).getTime() : Date.now();

  const inWindow = useMemo(
    () =>
      (results ?? [])
        .filter((r) => {
          const t = new Date(r.executed_at).getTime();
          return t >= windowStart - 15 * 60_000 && t <= windowEnd + 15 * 60_000;
        })
        .sort((a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()),
    [results, windowStart, windowEnd]
  );

  const stats = useMemo(() => {
    if (!inWindow.length) return null;
    const latencies = inWindow.filter((r) => r.is_up && r.latency_ms > 0).map((r) => r.latency_ms);
    const failed = inWindow.filter((r) => !r.is_up).length;
    return {
      observations: inWindow.length,
      failed,
      peak: latencies.length ? Math.max(...latencies) : null,
      median: latencies.length
        ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
        : null,
      quorum: inWindow.filter((r) => r.quorum_confirmed).length,
    };
  }, [inWindow]);

  const state = toState(incident.status);
  const plotState = state === 'crit' ? 'crit' : state === 'warn' ? 'warn' : 'ok';

  return (
    <Section
      title="Observations"
      hint="Checks recorded inside the incident window at the RELIASTRA observation point."
    >
      {loading ? (
        <RowsSkeleton rows={4} cols={4} />
      ) : error ? (
        <Failure
          body="The observations behind this incident could not be retrieved."
          onRetry={onRetry}
        />
      ) : !stats ? (
        <Empty
          title="No observations in this window"
          body="The console found no check results inside the incident window. This can happen while an incident is still opening, or if the retention window for this plan has passed."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] md:grid-cols-4">
            {[
              { label: 'Observations', value: stats.observations },
              { label: 'Failed checks', value: stats.failed, state: stats.failed ? ('crit' as const) : undefined },
              {
                label: 'Peak latency',
                value: stats.peak != null ? formatLatency(stats.peak) : null,
                unit: 'ms',
              },
              {
                label: 'Median latency',
                value: stats.median != null ? formatLatency(stats.median) : null,
                unit: 'ms',
              },
            ].map((r) => (
              <div key={r.label} className="bg-[var(--obc-base)] p-4">
                <Readout label={r.label} value={r.value} unit={r.unit} state={r.state} />
              </div>
            ))}
          </div>

          <p className="mt-2 text-[11px] text-[var(--obc-text-4)]">
            Computed from the {stats.observations} check results recorded inside this window.
            Figures quoted in the timeline come from the detector and may differ in sampling.
          </p>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="obc-label mb-2">Observed latency</p>
              <Plot
                points={inWindow
                  .filter((r) => r.latency_ms > 0)
                  .map((r) => ({ t: r.executed_at, v: r.latency_ms }))}
                unit="ms"
                threshold={threshold}
                state={plotState}
                label="Observed latency during the incident window"
              />
              {threshold != null && (
                <p className="mt-1.5 text-[11px] text-[var(--obc-text-4)]">
                  Dashed rule is the configured alert threshold ({threshold} ms).
                </p>
              )}
            </div>
            <div>
              <p className="obc-label mb-2">Check outcomes</p>
              <CheckStrip
                cells={inWindow.map((r) => ({
                  at: r.executed_at,
                  up: r.is_up,
                  latency: r.latency_ms,
                }))}
                label={`${inWindow.length} checks during the incident window`}
              />
              <dl className="mt-4">
                <Row label="Detector-confirmed checks" mono>
                  {stats.quorum} of {stats.observations}
                </Row>
                <Row label="Window" mono>
                  {formatUtc(incident.started_at, 'HH:mm')} →{' '}
                  {incident.resolved_at ? formatUtc(incident.resolved_at, 'HH:mm') : 'ongoing'}
                </Row>
              </dl>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
