import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  DEFAULT_REGION,
  TRACK_WINDOWS,
  type TrackCurrent,
  type TrackIncident,
  type TrackPublicIncident,
  type TrackVendorListItem,
  type VendorRecord,
} from '@/lib/track-api';
import {
  availability,
  count,
  duration,
  endpointParts,
  INCIDENT_STATUS_LABEL,
  latency,
  NO_OBSERVATION,
  NOT_RECORDED,
  SEVERITY_LABEL,
  severityState,
  statusCode,
  utcCompact,
  utcDate,
  utcStamp,
  windowLabel,
  type ObservedState,
  type StateVerdict,
} from '@/lib/observatory/format';
import { mergeIncidents, type MergedIncident } from '@/lib/observatory/incidents';
import type { BuiltAnswer } from '@/lib/observatory/answer';
import { regionInfo } from '@/lib/observatory/regions';
import {
  Readout,
  RecordSection,
  RecordTable,
  Notice,
  SpecRow,
  StateWord,
  Value,
  type RecordColumn,
} from './primitives';
import { LiveObservation } from './live-observation';
import { EvidenceRequest } from './evidence-request';
import {
  AUTH_ROUTES,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  SHARE_ROUTES,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';

/* ═══════════════════════════════════════════════════════════════════════════
   The vendor record, section by section.

   Every value below is printed from a field the public API returned. Where a
   field is absent the section says which fact is missing and why, and never
   substitutes a plausible one. That rule is the product.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Masthead ───────────────────────────────────────────────────────────── */

/**
 * The last hour of observations, one column per bucket.
 *
 * It sits in the masthead because it answers "is something happening right
 * now" before a reader has scrolled anywhere: sixty minutes of real results,
 * green where a response came back and red where none did. It is static SVG -
 * no animation, no hover, no hydration - and it is drawn only when there is
 * something to draw.
 */
function PulseStrip({ timeline }: { timeline: NonNullable<VendorRecord['pulse']> }) {
  const points = timeline.points;
  const failed = points.filter((p) => !p.is_up).length;
  const observations = points.reduce((n, p) => n + p.observation_count, 0);
  const W = 600;
  const H = 22;
  const gap = points.length > 90 ? 0 : 1;
  const colW = W / points.length;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <span className="ob-label">Last hour · {timeline.region}</span>
        <span className="ob-label">
          {observations.toLocaleString('en-US')} observations · {failed} failed
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Last hour of observations from ${timeline.region}: ${points.length} buckets, ${failed} containing a failed observation.`}
      >
        {points.map((p, i) => (
          <rect
            key={p.timestamp}
            x={i * colW}
            y={0}
            width={Math.max(colW - gap, 0.6)}
            height={H}
            className={p.is_up ? 'obs-strip-ok' : 'obs-strip-fail'}
          />
        ))}
      </svg>
      <figcaption className="flex items-baseline justify-between">
        <span className="ob-label">−60 min</span>
        <span className="ob-label">now</span>
      </figcaption>
    </figure>
  );
}



export function Masthead({
  record,
  verdict,
  lastObservation,
  cadenceSeconds,
  answer,
}: {
  record: VendorRecord;
  verdict: StateVerdict;
  lastObservation: string | null;
  cadenceSeconds: number | null;
  /**
   * The data-composed direct answer to "is {vendor} down?" (see
   * `lib/observatory/answer`). Built by the page from the same record so the
   * masthead, the answer and the sections can never disagree.
   */
  answer: BuiltAnswer;
}) {
  const { detail, regions } = record;
  const primaryEndpoint = detail.endpoints?.[0];
  const parts = primaryEndpoint ? endpointParts(primaryEndpoint.endpoint_url) : null;

  return (
    <header className="bg-[var(--ob-void)]">
      <div className="ob-container pb-12 pt-10 md:pb-16 md:pt-14">
        <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[var(--ob-signal)]">Public infrastructure observatory</span>
          <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
          <span>Record {detail.vendor_name}</span>
        </p>

        {/* The name spans the full measure. At this scale it is the page's
            only piece of "art", and it is the one thing a reader needs to
            recognise in half a second during an outage. */}
        <h1 className="obs-name mt-7">{detail.display_name}</h1>

        {/* Three blocks, two layouts. On a phone they read in the order a
            reader needs during an incident - dependency, state, last
            observation, then the last hour. On a wide screen the state stack
            moves into its own column and the pulse anchors the bottom of the
            first. Ordering is CSS, so the DOM order stays the reading order. */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-16">
          <p className="obs-descriptor order-1 max-w-[56ch] lg:col-start-1 lg:row-start-1">
            {detail.display_name} is observed by probing{' '}
            {detail.endpoints.length === 1 ? 'its public' : 'the public'}{' '}
            {detail.endpoints.length === 1 ? (
              <code className="ob-mono text-[0.92em]">{primaryEndpoint.endpoint_url}</code>
            ) : (
              `${detail.endpoints.length} endpoints`
            )}{' '}
            {regions.length > 0
              ? `from ${regions.length} observation region${regions.length === 1 ? '' : 's'}`
              : 'from no declared regions yet'}
            . RELIASTRA measures the HTTP behaviour of the listed endpoint - its state is not a
            statement about every service {detail.display_name} operates.
          </p>


          <div className="order-2 flex flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="flex flex-col gap-3 border-t border-[var(--ob-line-2)] pt-5">
              <StateWord state={verdict.state} word={verdict.word} />
              <p className="max-w-[46ch] text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                {verdict.qualifier}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-[var(--ob-line)] pt-5">
              <span className="ob-label">Last observation</span>
              {lastObservation ? (
                <>
                  <span className="obs-num obs-num-lg">
                    {utcStamp(lastObservation)?.split(' ').slice(3).join(' ')}
                  </span>
                  <span className="obs-num obs-num-sm text-[var(--ob-text-3)]">
                    {utcDate(lastObservation)}
                  </span>
                </>
              ) : (
                <span className="obs-void text-[13px]">{NO_OBSERVATION}</span>
              )}
            </div>

            <LiveObservation
              timestamp={lastObservation}
              cadenceSeconds={cadenceSeconds}
              className="border-t border-[var(--ob-line)] pt-5"
            />
          </div>

          {record.pulse && record.pulse.points.length > 0 && (
            <div className="order-3 border-t border-[var(--ob-line)] pt-5 lg:col-start-1 lg:row-start-2 lg:self-end">
              <PulseStrip timeline={record.pulse} />
            </div>
          )}
        </div>

        {/* The direct answer. A reader who arrived searching "is {vendor}
            down?" gets a complete, quotable answer here - question as a real
            heading, answer composed from the same facts the sections below
            expand. Nothing in this block is prose decoration: every clause
            traces to a field the measurement API returned. */}
        <section
          id="is-down-answer"
          aria-labelledby="is-down-h"
          className="mt-12 flex flex-col gap-4 border-t border-[var(--ob-line-2)] pt-6"
        >
          <h2 id="is-down-h" className="ob-h4 max-w-[40ch]">
            {answer.question}
          </h2>
          <p className="max-w-[74ch] text-[15px] leading-[1.65] text-[var(--ob-text-2)]">
            {answer.lead}
          </p>
          <ul className="flex flex-col gap-1.5" aria-label="Measured facts behind the answer">
            {answer.facts.map((f) => (
              <li key={f} className="ob-small max-w-[88ch]">
                {f}
              </li>
            ))}
          </ul>
          <p className="ob-small max-w-[88ch] text-[var(--ob-text-4)]">{answer.caveats[0]}</p>
          <p className="ob-small max-w-[88ch] text-[var(--ob-text-4)]">{answer.caveats[1]}</p>
          <p className="ob-small">
            {detail.category === 'ai' && (
              <>
                <Link href={researchHubRoute('ai-infrastructure')} className="ob-link">
                  AI infrastructure hub
                </Link>{' '}
                ·{' '}
              </>
            )}
            <Link
              href={researchRoute('how-reliastra-measures-vendor-reliability')}
              className="ob-link"
            >
              measurement methodology
            </Link>
          </p>
        </section>

        {/* Record strip: the identity facts, inline, no cards. */}
        <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-[var(--ob-line-2)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <StripFact term="Category">{detail.category.replace(/[-_]/g, ' ')}</StripFact>
          <StripFact term="Observed endpoint">
            {parts ? (
              <span className="break-all">{parts.host}</span>
            ) : (
              <span className="obs-void">{NOT_RECORDED}</span>
            )}
          </StripFact>
          <StripFact term="Observation regions">
            {regions.length ? regions.join(' · ') : <span className="obs-void">{NOT_RECORDED}</span>}
          </StripFact>
          <StripFact term="Measured by">RELIASTRA probes</StripFact>
        </dl>
      </div>
    </header>
  );
}

function StripFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="ob-label">{term}</dt>
      <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}

/* ── 01 · Current observation ───────────────────────────────────────────── */

interface RegionRow {
  region: string;
  current: TrackCurrent | null;
  reachable: boolean;
}

export function CurrentObservationSection({ record }: { record: VendorRecord }) {
  const rows = record.regionObservations;

  const columns: RecordColumn<RegionRow>[] = [
    {
      key: 'region',
      head: 'Region',
      width: 'minmax(0,190px)',
      mobile: 'lead',
      cell: (r) => {
        const info = regionInfo(r.region);
        return (
          <span className="flex flex-col">
            <span className="obs-num obs-num-sm">{r.region}</span>
            {info.place && (
              <span className="ob-small text-[var(--ob-text-4)]">{info.place}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'latency',
      head: 'Latency',
      width: 'minmax(0,110px)',
      align: 'right',
      cell: (r) => (
        <>
          <Value>{latency(r.current?.latency_ms)}</Value>
          {r.current?.latency_ms ? <span className="obs-unit">ms</span> : null}
        </>
      ),
    },
    {
      key: 'code',
      head: 'Status',
      width: 'minmax(0,90px)',
      align: 'right',
      cell: (r) => <Value>{statusCode(r.current?.status_code)}</Value>,
    },
    {
      key: 'result',
      head: 'Result',
      width: 'minmax(0,130px)',
      mobile: 'trail',
      cell: (r) =>
        !r.reachable ? (
          <span className="obs-void text-[13px]">unreachable</span>
        ) : r.current?.is_up === true ? (
          <StateWord size="sm" state="healthy" word="Responded" />
        ) : r.current?.is_up === false ? (
          <StateWord size="sm" state="critical" word="No response" />
        ) : (
          <span className="obs-void text-[13px]">{NO_OBSERVATION}</span>
        ),
    },
    {
      key: 'at',
      head: 'Observed (UTC)',
      width: 'minmax(0,180px)',
      align: 'right',
      cell: (r) => <Value>{utcCompact(r.current?.timestamp ?? null) ?? NO_OBSERVATION}</Value>,
    },
  ];

  return (
    <RecordSection
      index="01"
      id="current-observation"
      title="Current observation"
      note="The most recent completed observation per region. One request, one response, one timestamp."
      aside={
        <span className="ob-label text-right">
          {rows.length} region{rows.length === 1 ? '' : 's'} · region-scoped
        </span>
      }
    >
      {rows.length ? (
        <RecordTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.region}
          from="lg"
          caption={
            rows.length >= 2
              ? 'A region reporting no response is not automatically an outage: an incident is confirmed when independent observation points agree - two or more within the same 60-second window where a multi-origin fleet is in place, or consecutive failures from the single observation point under the deployed single-origin topology.'
              : 'These observations come from a single origin, so they can show that the endpoint answered or did not - they cannot corroborate a vendor-wide outage, and no incident record is opened from them. A region reporting no response is a fact about this path, at this minute.'
          }
        />
      ) : (
        <Notice title="No observation regions declared">
          The API returned no region list for this dependency&apos;s endpoints, so no per-region
          observation can be shown. Aggregate figures below still reflect every observation
          recorded against the endpoint.
        </Notice>
      )}
    </RecordSection>
  );
}

/* ── 02 · State and availability ────────────────────────────────────────── */

export function StateSection({
  record,
  verdict,
  lastObservation,
}: {
  record: VendorRecord;
  verdict: StateVerdict;
  lastObservation: string | null;
}) {
  const metrics = record.metrics?.metrics ?? null;
  const windows = TRACK_WINDOWS.filter((w) => metrics?.[w]);

  interface WindowRow {
    window: string;
  }

  const columns: RecordColumn<WindowRow>[] = [
    {
      key: 'window',
      head: 'Window',
      width: 'minmax(0,1fr)',
      mobile: 'lead',
      cell: (r) => <span className="text-[13.5px] text-[var(--ob-text)]">{windowLabel(r.window)}</span>,
    },
    {
      key: 'obs',
      head: 'Observations',
      width: 'minmax(0,140px)',
      align: 'right',
      cell: (r) => <Value>{count(metrics?.[r.window]?.total_observations)}</Value>,
    },
    {
      key: 'avail',
      head: 'Availability',
      width: 'minmax(0,150px)',
      align: 'right',
      mobile: 'trail',
      cell: (r) => (
        <Value>
          {availability(
            metrics?.[r.window]?.uptime_percentage,
            metrics?.[r.window]?.total_observations
          )}
        </Value>
      ),
    },
    {
      key: 'avg',
      head: 'Mean latency',
      width: 'minmax(0,150px)',
      align: 'right',
      cell: (r) => (
        <>
          <Value>{latency(metrics?.[r.window]?.avg_latency_ms)}</Value>
          {metrics?.[r.window]?.avg_latency_ms ? <span className="obs-unit">ms</span> : null}
        </>
      ),
    },
    {
      key: 'p95',
      head: '95th percentile',
      width: 'minmax(0,150px)',
      align: 'right',
      cell: (r) => (
        <>
          <Value>{latency(metrics?.[r.window]?.p95_latency_ms)}</Value>
          {metrics?.[r.window]?.p95_latency_ms ? <span className="obs-unit">ms</span> : null}
        </>
      ),
    },
  ];

  return (
    <RecordSection
      index="02"
      id="state"
      tone="base"
      title="Observed state and availability"
      note={
        <>
          An observation counts as successful when the probe received the response its target
          expects - for these public records, HTTP 200 within a 15-second deadline. Timeouts,
          transport errors and other status codes count as failures. No observations reads as
          insufficient data, never 100%.
        </>
      }
      aside={
        <div className="flex flex-col gap-2 md:items-end">
          <StateWord state={verdict.state} word={verdict.word} size="sm" />
          <span className="ob-label md:text-right">
            Last check {utcStamp(lastObservation) ?? NO_OBSERVATION}
          </span>
          <span className="ob-label md:text-right">
            {record.regions.length} region{record.regions.length === 1 ? '' : 's'} observed
          </span>
        </div>
      }
    >
      {windows.length ? (
        <RecordTable
          columns={columns}
          rows={windows.map((w) => ({ window: w }))}
          rowKey={(r) => r.window}
          caption="Every window is computed by the measurement API over stored observations at read time. Latency figures are milliseconds; a mean of zero means no successful response was recorded in the window and is printed as no data."
        />
      ) : (
        <Notice kind="error" title="Aggregates unavailable">
          The metrics endpoint did not return for this dependency. Availability and latency
          aggregates are omitted rather than estimated from the visible series.
        </Notice>
      )}
    </RecordSection>
  );
}

/* ── 04 · Observation network ───────────────────────────────────────────── */

export function NetworkSection({
  record,
  children,
}: {
  record: VendorRecord;
  /** The coordinate plot, rendered by the page (it is a server component). */
  children?: ReactNode;
}) {
  interface Row {
    region: string;
    current: TrackCurrent | null;
    reachable: boolean;
    cadenceSeconds: number | null;
  }

  const rows: Row[] = record.regionObservations;

  const columns: RecordColumn<Row>[] = [
    {
      key: 'region',
      head: 'Region',
      width: 'minmax(0,130px)',
      mobile: 'lead',
      cell: (r) => <span className="obs-num obs-num-sm">{r.region}</span>,
    },
    {
      key: 'cadence',
      head: 'Observed cadence',
      width: 'minmax(0,150px)',
      align: 'right',
      cell: (r) =>
        r.cadenceSeconds ? (
          <span className="obs-num obs-num-sm">
            {r.cadenceSeconds}
            <span className="obs-unit">s</span>
          </span>
        ) : (
          <span className="obs-void text-[13px]">no data</span>
        ),
    },
    {
      key: 'latency',
      head: 'Latest latency',
      width: 'minmax(0,140px)',
      align: 'right',
      mobile: 'trail',
      cell: (r) => (
        <>
          <Value>{latency(r.current?.latency_ms)}</Value>
          {r.current?.latency_ms ? <span className="obs-unit">ms</span> : null}
        </>
      ),
    },
  ];

  return (
    <RecordSection
      index="04"
      id="network"
      title="Observation network"
      note="The observation regions scheduled for this dependency. An incident requires at least two regions to fail inside the same window."
    >
      <div className="flex flex-col gap-10">
        {children}
        {rows.length ? (
          <RecordTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.region}
            caption="Cadence is measured from the density of observations in the last hour, not read from a configured schedule: the public API does not expose the check interval, so this record reports the interval it can verify."
          />
        ) : (
          <Notice title="No regions declared">
            This dependency&apos;s endpoint records carry no region list.
          </Notice>
        )}
      </div>
    </RecordSection>
  );
}

/* ── 05 · Observed incidents ────────────────────────────────────────────── */

export function IncidentsSection({
  incidents,
  unavailable,
  vendorName,
  basePath,
  regionCount,
}: {
  incidents: MergedIncident[];
  unavailable: boolean;
  vendorName: string;
  /** Vendor record path; incident rows link to their permanent records. */
  basePath: string;
  /** Regions declared on the record - decides the corroboration sentence. */
  regionCount: number;
}) {
  const columns: RecordColumn<MergedIncident>[] = [
    {
      key: 'window',
      head: 'Window (UTC)',
      width: 'minmax(0,290px)',
      cell: (i) => (
        <span className="obs-num obs-num-sm">
          {utcDate(i.started_at) ?? NOT_RECORDED}
          <span className="text-[var(--ob-text-3)]">
            {'  '}
            {timeOf(i.started_at)} → {i.resolved_at ? timeOf(i.resolved_at) : 'open'}
          </span>
        </span>
      ),
    },
    {
      key: 'title',
      head: 'Record',
      width: 'minmax(0,1fr)',
      mobile: 'lead',
      cell: (i) => (
        <Link
          href={`${basePath}/incidents/${i.incident_id}`}
          className="ob-link text-[13.5px]"
        >
          {i.title} →
        </Link>
      ),
    },
    {
      key: 'duration',
      head: 'Duration',
      width: 'minmax(0,110px)',
      align: 'right',
      cell: (i) => <Value>{i.durationSeconds != null ? duration(i.durationSeconds) : 'ongoing'}</Value>,
    },
    {
      key: 'severity',
      head: 'Severity',
      width: 'minmax(0,130px)',
      mobile: 'trail',
      cell: (i) => (
        <StateWord
          size="sm"
          state={severityState(i.severity) as ObservedState}
          word={SEVERITY_LABEL[i.severity.toLowerCase()] ?? i.severity}
        />
      ),
    },
    {
      key: 'status',
      head: 'Status',
      width: 'minmax(0,120px)',
      cell: (i) => (
        <span className="text-[13px] text-[var(--ob-text-2)]">
          {INCIDENT_STATUS_LABEL[i.status.toLowerCase()] ?? i.status}
        </span>
      ),
    },
    {
      key: 'evidence',
      head: 'Evidence',
      width: 'minmax(0,120px)',
      align: 'right',
      cell: (i) =>
        i.hasEvidence ? (
          <Link href="#evidence" className="ob-link text-[13px]">
            Published
          </Link>
        ) : (
          <span className="obs-void text-[13px]">not published</span>
        ),
    },
  ];

  return (
    <RecordSection
      index="05"
      id="incidents"
      tone="base"
      title="Observed incidents"
      note={
        <>
          Public incident records for {vendorName} are published when the organisation holding the
          monitoring releases an evidence report. The public probing pipeline itself stores
          endpoint observations; it does not open incident records, and this record is observed
          from{' '}
          {regionCount > 1
            ? `${regionCount} origins`
            : 'a single origin'}
          , so an empty list here is a statement about the public
          incident channel - never a claim that no outage occurred.
        </>
      }
      aside={
        <div className="flex flex-col gap-1 md:items-end">
          <span className="ob-label">
            {incidents.length} record{incidents.length === 1 ? '' : 's'}
          </span>
          <span className="ob-label">Published evidence: rolling 90 days</span>
        </div>
      }
    >
      {unavailable ? (
        <Notice kind="error" title="Incident history unavailable">
          The incident endpoint could not be read. This record shows no incidents rather than an
          empty history, because those are different facts and only one of them is currently known.
        </Notice>
      ) : incidents.length ? (
        <RecordTable
          columns={columns}
          rows={incidents}
          rowKey={(i) => i.incident_id}
          from="xl"
          caption="Times are UTC. An open incident has no resolution time because RELIASTRA has not yet observed a qualifying recovery. Every row is a permanent record at its own address."
        />
      ) : (
        <Notice title="No public incident records">
          RELIASTRA holds no public incident record for {vendorName} in the rolling 90-day
          published-evidence window. That is an absence of published records, not evidence of an
          absence of outages: endpoint-level failures that did not produce a released evidence
          report never enter this channel. Use the observations above for what was measured.
        </Notice>
      )}
    </RecordSection>
  );
}

function timeOf(iso: string): string {
  const stamp = utcStamp(iso);
  return stamp ? stamp.split(' ').slice(3, 4).join('') : NOT_RECORDED;
}

/* ── 06 · Evidence ──────────────────────────────────────────────────────── */

export function EvidenceSection({
  published,
  vendorName,
  unavailable,
}: {
  published: TrackPublicIncident[];
  vendorName: string;
  unavailable: boolean;
}) {
  return (
    <RecordSection
      index="06"
      id="evidence"
      title="Evidence records"
      note={
        <>
          The checksummed artifact behind an incident: observations, regions, timestamps.
          Released to a named requester, not an open link.
        </>
      }
      aside={
        <Link href={PUBLIC_ROUTES.incidentEvidence} className="ob-link text-[13px]">
          What an evidence record contains
        </Link>
      }
    >
      {unavailable ? (
        <Notice kind="error" title="Evidence index unavailable">
          The published-evidence endpoint could not be read, so this section cannot say whether
          evidence exists for this dependency.
        </Notice>
      ) : published.length ? (
        <div className="flex flex-col">
          {published.map((p) => (
            <article
              key={p.incident_id}
              className="flex flex-col items-start gap-4 border-t border-[var(--ob-line)] py-6"
            >
              <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <h3 className="text-[15.5px] font-medium tracking-[-0.01em] text-[var(--ob-text)]">
                    {p.title}
                  </h3>
                  <p className="ob-small">Incident {p.incident_id.slice(0, 8)}</p>
                </div>
                <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 lg:w-[560px]">
                  <EvidenceFact term="Detected">{utcStamp(p.started_at) ?? NOT_RECORDED}</EvidenceFact>
                  <EvidenceFact term="Duration">
                    {p.duration_minutes != null ? duration(p.duration_minutes * 60) : 'ongoing'}
                  </EvidenceFact>
                  <EvidenceFact term="Severity">
                    {SEVERITY_LABEL[p.severity.toLowerCase()] ?? p.severity}
                  </EvidenceFact>
                  <EvidenceFact term="Peak latency">
                    {p.max_latency_ms != null ? `${latency(p.max_latency_ms)} ms` : NOT_RECORDED}
                  </EvidenceFact>
                </dl>
              </div>
              {p.has_evidence_report ? (
                <EvidenceRequest
                  incidentId={p.incident_id}
                  vendorName={vendorName}
                  incidentTitle={p.title}
                />
              ) : (
                <p className="ob-small">
                  No report has been generated for this incident record.
                </p>
              )}
            </article>
          ))}
          <span className="border-t border-[var(--ob-line)]" />
        </div>
      ) : (
        <Notice title="No published evidence for this dependency">
          <p>
            Evidence records appear here when an organization monitoring {vendorName} on RELIASTRA
            publishes the report for an incident. Until then the incident history above is the
            public record, and the underlying observations remain in the accounts that collected
            them.
          </p>
          <p className="mt-3">
            <Link href={PUBLIC_ROUTES.slaEvidence} className="ob-link">
              How evidence is used in an SLA claim
            </Link>
          </p>
        </Notice>
      )}
    </RecordSection>
  );
}

function EvidenceFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="ob-label">{term}</dt>
      <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}

/* ── 07 · Methodology ───────────────────────────────────────────────────── */

export function MethodologySection({
  record,
  cadenceSeconds,
}: {
  record: VendorRecord;
  cadenceSeconds: number | null;
}) {
  const { detail, regions } = record;
  return (
    <RecordSection
      index="07"
      id="methodology"
      tone="base"
      title="How RELIASTRA knows this"
      note="What is measured, and what is not."
      aside={
        <Link
          href={researchRoute('how-reliastra-measures-vendor-reliability')}
          className="ob-link text-[13px]"
        >
          Full methodology
        </Link>
      }
    >
      <dl className="flex flex-col">
        <SpecRow term="Source" wide>
          Scheduled workers issue real HTTP requests to the endpoints listed at the bottom of
          this record, from{' '}
          {regions.length ? (
            <span className="obs-num obs-num-sm">{regions.join(', ')}</span>
          ) : (
            'RELIASTRA regions'
          )}
          . Where a listed endpoint is {detail.display_name}&apos;s public status site, the probe
          measures that site&apos;s own availability and response time as an HTTP service; the
          status text it publishes is not read, parsed, ingested or reconciled.
        </SpecRow>
        <SpecRow term="Interval" wide>
          {cadenceSeconds
            ? `About every ${cadenceSeconds} seconds per region, measured from the last hour of observations. `
            : 'Not derivable from the current window. '}
          The configured interval is not exposed publicly.
        </SpecRow>
        <SpecRow term="Success" wide>
          The probe records a success when the endpoint returns the response it is configured to
          expect - HTTP 200 for every public record, within a 15-second deadline, following at
          most five redirect hops. A slow but correct response is latency, not downtime.
        </SpecRow>
        <SpecRow term="Failure" wide>
          A timeout, a transport error, a redirect the security policy blocks, or any status code
          other than the expected one. Each is stored with its error type so the causes stay
          distinguishable.
        </SpecRow>
        <SpecRow term="Incident opens" wide>
          For public records like this one, nothing: the public pipeline stores observations and
          does not open incidents. Customer monitoring under the deployed single-origin topology
          opens an incident after two consecutive failed checks from one observation point; with
          a genuine multi-origin fleet, two or more independent points must agree inside a
          60-second window. Two labels from one worker never count as agreement.
        </SpecRow>
        <SpecRow term="Incident closes" wide>
          Two consecutive successful observations from the same observation point - or, under a
          multi-origin fleet, from at least two points - so flapping does not open and close a
          record repeatedly.
        </SpecRow>
        <SpecRow term="Availability" wide>
          Successful observations divided by all observations in the window. A window with no
          observations is insufficient data, never 100%.
        </SpecRow>
        <SpecRow term="Latency" wide>
          Mean and 95th percentile of response times in the window, in milliseconds, across all
          regions. The chart breaks the line where a bucket has no successful response.
        </SpecRow>
        <SpecRow term="Freshness" wide>
          Rendered on the server and revalidated every 60 seconds. An observation older than 15
          minutes marks the record stale rather than healthy or down. All timestamps are UTC.
        </SpecRow>
        <SpecRow term="Not vendor status" wide>
          {detail.display_name}&apos;s own status reporting is not ingested, mirrored or
          reconciled. The two can disagree - a measured endpoint can be up while services are
          degraded, and vice versa. Read both.
        </SpecRow>
        <SpecRow term="Limits" wide>
          These figures describe the listed endpoints, observed from the listed regions. They are
          not a statement about every service the vendor operates, about specific API routes or
          models, or about your integration.
        </SpecRow>
      </dl>
    </RecordSection>
  );
}

/* ── 08 · What this record is not ───────────────────────────────────────── */

/**
 * The distinction that makes this page worth reading instead of the vendor's
 * own status page.
 *
 * This section existed as an e2e expectation long before it existed as a
 * component: `observatory.spec.ts` asserts a `#distinction` section stating
 * that the record is not the official vendor status page and that RELIASTRA
 * does not ingest or mirror vendor-reported state. No component had ever
 * rendered it, so that assertion had never passed. The claim itself is the
 * core of the product - measurement from outside both networks - so it
 * belongs here as its own section rather than buried in a specification row.
 */
export function DistinctionSection({ record }: { record: VendorRecord }) {
  const { detail } = record;
  return (
    <RecordSection
      index="08"
      id="distinction"
      tone="base"
      title="This is not a status page"
      note="What this record is, and what it deliberately is not."
    >
      <dl className="flex flex-col">
        <SpecRow term="Endpoint vs service" wide>
          {detail.endpoints?.length === 1 &&
          /status/i.test(detail.endpoints[0].endpoint_url) ? (
            <>
              The endpoint observed here ({endpointParts(detail.endpoints[0].endpoint_url).host})
              is {detail.display_name}&apos;s public status site. This record measures that
              endpoint&apos;s HTTP behaviour - whether it answers, how fast, with what status. A
              status site can be perfectly reachable while the services it reports on are
              degraded, and unreachable while they are healthy. This record answers neither
              question; it answers the first one exactly.
            </>
          ) : (
            <>
              This record measures the behaviour of the listed endpoints only. Whether an endpoint
              stands for a whole service is a property of what RELIASTRA observes, not of this
              page: no endpoint here is treated as a proxy for every service{' '}
              {detail.display_name} operates.
            </>
          )}
        </SpecRow>
        <SpecRow term="Official vendor status" wide>
          This is not {detail.display_name}&apos;s official vendor status page, and
          it is not affiliated with or endorsed by them. It is an independent
          measurement of the endpoints listed in this record.
        </SpecRow>
        <SpecRow term="Vendor-reported state" wide>
          RELIASTRA does not ingest, mirror or reconcile vendor-reported state.
          Nothing here is copied from a status page, an aggregator or a
          vendor API. Every figure is derived from observations RELIASTRA
          issued itself.
        </SpecRow>
        <SpecRow term="Why that matters" wide>
          A status page is written by the party whose reliability it describes,
          and is updated when that party decides to update it. An independent
          record is written by the observer. Where the two disagree, both are
          worth reading - but only one of them is yours to keep.
        </SpecRow>
        <SpecRow term="Scope" wide>
          These observations describe the listed endpoints from the listed
          regions. They are not a statement about every service{' '}
          {detail.display_name} operates, or about your specific integration.
        </SpecRow>
      </dl>
    </RecordSection>
  );
}

/* ── 09 · Dependency information ────────────────────────────────────────── */

export function DependencyInfoSection({ record }: { record: VendorRecord }) {
  const { detail } = record;
  return (
    <RecordSection
      index="09"
      id="dependency"
      tone="base"
      title="Dependency information"
      note="The configuration this record was produced from, as the measurement API reports it."
    >
      <div className="flex flex-col gap-10">
        {detail.endpoints?.length ? (
          <div className="flex flex-col">
            {detail.endpoints.map((e) => {
              const parts = endpointParts(e.endpoint_url);
              return (
                <div
                  key={e.id}
                  className="grid gap-5 border-t border-[var(--ob-line)] py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-16"
                >
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="ob-label">Observed endpoint</span>
                    <code className="break-all font-[family-name:var(--ob-font-mono)] text-[13.5px] text-[var(--ob-text)]">
                      {e.endpoint_url}
                    </code>
                    <span className="ob-small">
                      {parts.protocol} · host {parts.host} · path {parts.path || '/'}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                    <EvidenceFact term="Regions">
                      {e.regions?.length ? e.regions.join(', ') : NOT_RECORDED}
                    </EvidenceFact>
                    <EvidenceFact term="Active">{e.is_active ? 'yes' : 'no'}</EvidenceFact>
                    <EvidenceFact term="Endpoint state">{e.health_status}</EvidenceFact>
                  </dl>
                </div>
              );
            })}
            <span className="border-t border-[var(--ob-line)]" />
          </div>
        ) : (
          <Notice title="No endpoint records returned">
            The API returned no endpoint list for this dependency, so the observed URL cannot be
            published.
          </Notice>
        )}

        <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <EvidenceFact term="Record identifier">{detail.vendor_name}</EvidenceFact>
          <EvidenceFact term="Category">{detail.category.replace(/[-_]/g, ' ')}</EvidenceFact>
          <EvidenceFact term="Record opened">
            {utcDate(detail.created_at ?? null) ?? NOT_RECORDED}
          </EvidenceFact>
          <EvidenceFact term="Visibility">{detail.is_public ? 'public' : 'private'}</EvidenceFact>
        </dl>
      </div>
    </RecordSection>
  );
}

/* ── 10 · Related records ──────────────────────────────────────────────── */

export function RelatedSection({
  vendors,
  currentVendor,
}: {
  vendors: TrackVendorListItem[];
  currentVendor: string;
}) {
  const others = vendors.filter((v) => v.vendor_name !== currentVendor).slice(0, 8);
  return (
    <RecordSection
      index="10"
      id="related"
      title="Related records"
      note="Other dependencies under observation."
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-4">
          <h3 className="ob-label">Dependencies under observation</h3>
          {others.length ? (
            <ul className="flex flex-col">
              {others.map((v) => (
                <li key={v.id}>
                  <Link
                    href={SHARE_ROUTES.trackVendor(v.vendor_name)}
                    className="group flex items-baseline justify-between gap-6 border-t border-[var(--ob-line)] py-3 transition-colors hover:border-[var(--ob-line-3)]"
                  >
                    <span className="text-[14px] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                      {v.display_name}
                    </span>
                    <span className="ob-label">{v.category.replace(/[-_]/g, ' ')}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={PUBLIC_ROUTES.track}
                  className="flex items-baseline gap-2 border-t border-[var(--ob-line)] py-3 text-[13px] text-[var(--ob-signal)]"
                >
                  All tracked dependencies →
                </Link>
              </li>
            </ul>
          ) : (
            <p className="ob-small">
              No other public dependency records are available from the catalog right now.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="ob-label">Method and reference</h3>
          <ul className="flex flex-col">
            {RESEARCH_ARTICLES.map((a) => (
              <li key={a.slug}>
                <Link
                  href={researchRoute(a.slug)}
                  className="group flex flex-col gap-1 border-t border-[var(--ob-line)] py-3"
                >
                  <span className="text-[14px] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                    {a.title}
                  </span>
                  <span className="ob-label">{a.category}</span>
                </Link>
              </li>
            ))}
            {[
              { href: PUBLIC_ROUTES.docsMonitoring, label: 'Monitoring documentation', kind: 'Docs' },
              { href: PUBLIC_ROUTES.docsEvidence, label: 'Evidence documentation', kind: 'Docs' },
              {
                href: PUBLIC_ROUTES.externalDependencyIntelligence,
                label: 'External dependency intelligence',
                kind: 'Concept',
              },
              { href: PUBLIC_ROUTES.glossary, label: 'Measurement glossary', kind: 'Reference' },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex flex-col gap-1 border-t border-[var(--ob-line)] py-3"
                >
                  <span className="text-[14px] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                    {l.label}
                  </span>
                  <span className="ob-label">{l.kind}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </RecordSection>
  );
}

/* ── Conversion ─────────────────────────────────────────────────────────── */

export function RecordCTA({ vendorName }: { vendorName: string }) {
  return (
    <section className="obs-section bg-[var(--ob-void)]" aria-labelledby="record-cta">
      <div className="ob-container py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end lg:gap-16">
          <div className="flex flex-col gap-5">
            <p className="ob-label obs-label-signal">Your own record</p>
            <h2 id="record-cta" className="ob-h2 max-w-[20ch]">
              {vendorName} is one dependency. Your product has a list.
            </h2>
            <p className="ob-body max-w-[58ch]">
              Observe the services your product calls. Attribute incidents. Keep the record.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start monitoring
              </Link>
              <Link href={PUBLIC_ROUTES.pricing} className="ob-btn ob-btn-outline">
                Pricing
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Failure state ──────────────────────────────────────────────────────── */

/**
 * Rendered when the vendor's own identity cannot be read. It must never
 * resemble a healthy record: no figures, no state word, no chart frame.
 */
export function RecordUnavailable({ vendorName }: { vendorName: string }) {
  return (
    <div className="ob-container py-20 md:py-28">
      <p className="ob-label obs-label-crit">Observation unavailable</p>
      <h1 className="ob-h1 mt-5 max-w-[20ch]">
        This record could not be read from the measurement network.
      </h1>
      <p className="ob-lede mt-6 max-w-[62ch]">
        The measurement API is unreachable. No cached or approximate figure is shown for{' '}
        {vendorName}.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href={SHARE_ROUTES.trackVendor(vendorName)} className="ob-btn ob-btn-outline">
          Retry this record
        </Link>
        <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-outline">
          All tracked dependencies
        </Link>
        <Link href={PUBLIC_ROUTES.status} className="ob-btn ob-btn-outline">
          RELIASTRA platform status
        </Link>
      </div>
      <p className="ob-small mt-10 max-w-[62ch]">
        If this persists, the platform status page reports whether the measurement network itself is
        degraded. The default observation region is {DEFAULT_REGION}.
      </p>
    </div>
  );
}
