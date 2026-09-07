'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useAllApplications,
  useClients,
  useDependencies,
  useEvidence,
  useIncidents,
} from '@/lib/dashboard/queries';
import { api } from '@/lib/dashboard/api';
import { useAppStore } from '@/stores/app-store';
import { applicationIndex, attributeEvidence } from '@/lib/agency/portfolio';
import { formatUtc, incidentCode, reportCode, timeAgo } from '@/lib/dashboard/format';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
  SectionLink,
} from '@/components/console/primitives';
import { DataTable, type Column } from '@/components/console/data-table';
import type { EvidenceReport } from '@/lib/dashboard/types';

/**
 * EVIDENCE → REPORTS.
 *
 * The distinction this route exists to make: `/evidence` is the incident-side
 * view — which failure was recorded, what caused it, what the record says.
 * This is the artifact side — which files exist, when they were generated,
 * what they hash to, and how to get one into an email to a vendor.
 *
 * Every action here is a real endpoint: `GET /v1/evidence` lists the reports,
 * `GET /v1/evidence/{id}` returns a signed download URL, and
 * `POST /v1/evidence/{id}/regenerate` produces a fresh artifact. There is no
 * "export" button that does nothing, and no report format that the backend
 * cannot produce.
 */
export function ReportsPage() {
  const org = useAppStore((s) => s.org);
  const reports = useEvidence();
  const incidents = useIncidents(undefined, 100);
  const deps = useDependencies();
  const clients = useClients(Boolean(org?.has_agency_mode));

  const clientIds = useMemo(() => (clients.data ?? []).map((c) => c.id), [clients.data]);
  const applications = useAllApplications(clientIds, Boolean(org?.has_agency_mode));
  const index = useMemo(
    () => applicationIndex(applications.data ?? []),
    [applications.data]
  );

  const attributed = useMemo(
    () =>
      attributeEvidence(
        reports.data ?? [],
        incidents.data ?? [],
        deps.data ?? [],
        index,
        (clients.data ?? []).map((c) => ({ id: c.id, name: c.name }))
      ),
    [reports.data, incidents.data, deps.data, index, clients.data]
  );

  const agency = Boolean(org?.has_agency_mode);

  const columns: Column<(typeof attributed)[number]>[] = [
    {
      key: 'code',
      header: 'Report',
      width: 130,
      sort: (r) => r.report.generated_at,
      render: (r) => (
        <span className="font-[family-name:var(--ob-font-mono)] text-[12.5px] text-[var(--obc-text)]">
          {reportCode(r.report.id)}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      sort: (r) => r.dependency?.name ?? '',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] text-[var(--obc-text)]">
            {r.dependency?.name ?? 'Dependency not in the current list'}
          </p>
          <p className="truncate text-[11.5px] text-[var(--obc-text-4)]">
            {r.incident ? r.incident.root_cause : 'Incident record'}
          </p>
        </div>
      ),
    },
    ...(agency
      ? [
          {
            key: 'client',
            header: 'Client',
            width: 160,
            sort: (r: (typeof attributed)[number]) => r.clientName ?? '',
            render: (r: (typeof attributed)[number]) =>
              r.clientName ? (
                <span className="text-[12.5px] text-[var(--obc-text-2)]">{r.clientName}</span>
              ) : (
                <span className="text-[12px] text-[var(--obc-text-4)]">unattributed</span>
              ),
          },
        ]
      : []),
    {
      key: 'incident',
      header: 'Incident',
      width: 130,
      sort: (r) => r.incident?.started_at ?? '',
      // Plain text, not a link: the row is already a link to the record, and
      // an anchor inside an anchor is invalid HTML that React refuses to
      // hydrate. The record page links the incident.
      render: (r) =>
        r.incident ? (
          <span className="font-[family-name:var(--ob-font-mono)] text-[12px] text-[var(--obc-text-2)]">
            {incidentCode(r.incident.id, r.incident.display_id)}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--obc-text-4)]">—</span>
        ),
    },
    {
      key: 'generated',
      header: 'Generated',
      width: 150,
      sort: (r) => r.report.generated_at,
      render: (r) => (
        <span title={formatUtc(r.report.generated_at, 'dd MMM yyyy HH:mm:ss')}>
          {timeAgo(r.report.generated_at)}
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      numeric: true,
      width: 100,
      sort: (r) => r.report.file_size_bytes,
      render: (r) => (
        <>
          {(r.report.file_size_bytes / 1024).toFixed(0)}
          <span className="obc-unit">KB</span>
        </>
      ),
    },
    {
      key: 'integrity',
      header: 'Checksum',
      width: 150,
      render: (r) => (
        <span className="truncate font-[family-name:var(--ob-font-mono)] text-[11px] text-[var(--obc-text-4)]">
          {r.report.checksum.replace(/^sha256:/, '').slice(0, 12)}…
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Evidence"
        title="Reports"
        meta={
          <>
            <Fact label="Reports" value={reports.data?.length ?? '—'} />
            <Fact
              label="Most recent"
              value={
                reports.data?.[0]?.generated_at
                  ? formatUtc(reports.data[0].generated_at, 'dd MMM HH:mm')
                  : 'none'
              }
            />
            <Fact label="Integrity" value="SHA-256" />
          </>
        }
        actions={<SectionLink href="/evidence">Evidence records</SectionLink>}
      />

      <p className="max-w-[82ch] py-5 text-[13px] leading-[1.7] text-[var(--obc-text-2)]">
        A report is the artifact generated from a confirmed incident: the observations that
        triggered it, the regions they came from, their timestamps, and a SHA-256 checksum that
        makes the file verifiable after it leaves this console. Download links are signed and
        expire; regenerating produces a new artifact from the same stored observations.
      </p>

      <Section
        title="Generated reports"
        hint="Every artifact your organization can produce right now."
        id="reports"
      >
        {reports.isError ? (
          <Failure
            body="The report index could not be read. No list is shown rather than a partial one — a missing report here would look like evidence that was never generated."
            onRetry={() => reports.refetch()}
          />
        ) : reports.isLoading ? (
          <RowsSkeleton rows={4} cols={6} />
        ) : attributed.length ? (
          <>
            <DataTable
              rows={attributed}
              columns={columns}
              rowKey={(r) => r.report.id}
              rowHref={(r) => `/evidence/${r.report.id}`}
              caption="Generated evidence reports with their incident, size and checksum"
              initialSort={{ key: 'generated', dir: 'desc' }}
              stackBelow="xl"
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {attributed.slice(0, 1).map((r) => (
                <ReportActions key={r.report.id} report={r.report} />
              ))}
            </div>
          </>
        ) : (
          <Empty
            title="No reports generated"
            body="A report is produced when RELIASTRA confirms an incident against one of your monitors. Until an incident is recorded there is no artifact to generate — nothing here is a placeholder."
            action={
              <Link href="/dependencies" className="obc-btn obc-btn-sm">
                Review monitored dependencies
              </Link>
            }
          />
        )}
      </Section>

      <Section title="What a report contains" id="report-contents">
        <dl className="grid max-w-[90ch] gap-x-10 gap-y-5 sm:grid-cols-2">
          {[
            [
              'Observations',
              'Every check result inside the incident window, with region, latency, status code and transport error.',
            ],
            [
              'Attribution',
              'The dependency the incident was raised against and the correlation the system recorded.',
            ],
            [
              'Integrity',
              'A SHA-256 checksum of the artifact, printed in the console so a recipient can verify the file they were sent.',
            ],
            [
              'Validity',
              'Download links are signed and expire; the underlying record does not change when a link does.',
            ],
          ].map(([term, body]) => (
            <div key={term}>
              <dt className="obc-label">{term}</dt>
              <dd className="mt-1.5 text-[12.5px] leading-[1.65] text-[var(--obc-text-2)]">
                {body}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}

/**
 * Download and regenerate for the most recent report, surfaced at index level
 * so the common action does not require opening a record first.
 */
function ReportActions({ report }: { report: EvidenceReport }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    setState('working');
    setMessage(null);
    try {
      const detail = await api.evidenceById(report.id);
      const url = detail.download_url;
      if (!url) {
        setMessage('The service did not return a download location for this report.');
        setState('error');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      setState('idle');
    } catch {
      setMessage('The download link could not be issued. Try again in a moment.');
      setState('error');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="obc-label">Latest report {reportCode(report.id)}</span>
      <button
        type="button"
        className="obc-btn obc-btn-sm"
        onClick={download}
        disabled={state === 'working'}
      >
        {state === 'working' ? 'Requesting link…' : 'Download'}
      </button>
      <Link href={`/evidence/${report.id}`} className="obc-btn obc-btn-sm">
        Open record
      </Link>
      {message && (
        <span role="alert" className="text-[12px] text-[#E58C85]">
          {message}
        </span>
      )}
    </div>
  );
}
