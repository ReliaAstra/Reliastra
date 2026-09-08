'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useDependency,
  useEvidenceRecord,
  useIncident,
  useRegenerateEvidence,
} from '@/lib/dashboard/queries';
import {
  durationBetween,
  formatUtc,
  incidentCode,
  regionLabel,
  reportCode,
} from '@/lib/dashboard/format';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  Row,
  RowsSkeleton,
  Section,
  State,
} from '@/components/console/primitives';

/**
 * Evidence record.
 *
 * This page is written to be read by someone who is not a customer - a vendor
 * account manager, a procurement lead, a lawyer. So it reads as a record:
 * what was observed, when, from where, how the fault was attributed, and what
 * makes the document verifiable. There is no chart here at all; the
 * measurements live in the incident, and this page states them and links to
 * them. Nothing is asserted that the API did not return.
 */
export function EvidenceRecordPage({ id }: { id: string }) {
  const record = useEvidenceRecord(id);
  const incident = useIncident(record.data?.incident_id ?? '');
  const dep = useDependency(incident.data?.dependency_id ?? '');
  const regenerate = useRegenerateEvidence();
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    const token = record.data?.share_token;
    if (!token || typeof window === 'undefined') return null;
    return `${window.location.origin}/reports/${token}`;
  }, [record.data?.share_token]);

  if (record.isLoading) {
    return (
      <>
        <div className="border-b border-[var(--obc-line-2)] py-6">
          <div className="obc-skel h-3 w-24" />
          <div className="obc-skel mt-3 h-6 w-80" />
        </div>
        <div className="obc-section">
          <RowsSkeleton rows={6} cols={2} />
        </div>
      </>
    );
  }

  if (record.isError || !record.data) {
    return (
      <div className="obc-section">
        <Failure
          title="Evidence record unavailable"
          body="This record could not be retrieved. Stored evidence is immutable and unaffected by console read failures."
          onRetry={() => record.refetch()}
        />
      </div>
    );
  }

  const r = record.data;
  const inc = incident.data;

  return (
    <>
      <PageHead
        eyebrow={<span className="obc-mono text-[var(--obc-signal)]">{reportCode(r.id)}</span>}
        title={r.title || 'Evidence record'}
        meta={
          <>
            <Fact label="Generated" value={formatUtc(r.generated_at, 'yyyy-MM-dd HH:mm:ss')} />
            <Fact
              label="Retention"
              value={r.expires_at ? `until ${formatUtc(r.expires_at, 'yyyy-MM-dd')}` : 'indefinite'}
            />
            <Fact label="Size" value={`${(r.file_size_bytes / 1024).toFixed(1)} KB`} />
          </>
        }
        actions={
          <>
            {r.download_url && (
              <a
                href={r.download_url}
                className="obc-btn obc-btn-primary"
                rel="noopener noreferrer"
                target="_blank"
              >
                Download record
              </a>
            )}
            <button
              type="button"
              className="obc-btn"
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate(r.id)}
            >
              {regenerate.isPending ? 'Regenerating…' : 'Regenerate'}
            </button>
          </>
        }
      />

      <Section
        title="Subject"
        hint="The incident this record documents."
      >
        {incident.isLoading ? (
          <RowsSkeleton rows={3} cols={2} />
        ) : incident.isError || !inc ? (
          <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-4">
            <dl>
              <Row label="Incident" mono>
                {incidentCode(r.incident_id)}
              </Row>
              <Row label="Detail" mono>
                <span className="text-[var(--obc-text-4)]">
                  incident could not be loaded in this session
                </span>
              </Row>
            </dl>
          </div>
        ) : (
          <div className="border border-[var(--obc-line)] bg-[var(--obc-base)]">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--obc-line)] px-4 py-3">
              <span className="flex flex-wrap items-baseline gap-4">
                <Link
                  href={`/incidents/${inc.id}`}
                  className="obc-mono text-[var(--obc-signal)] hover:underline"
                >
                  {incidentCode(inc.id, inc.display_id)}
                </Link>
                <span className="text-[13px] text-[var(--obc-text)]">
                  {inc.title || inc.root_cause}
                </span>
              </span>
              <State status={inc.status} live={!inc.resolved_at} />
            </div>
            <div className="grid gap-x-10 px-4 py-2 md:grid-cols-2">
              <dl>
                <Row label="Dependency" mono>
                  {dep.data ? (
                    <Link href={`/dependencies/${dep.data.id}`} className="hover:underline">
                      {dep.data.name}
                    </Link>
                  ) : (
                    (r.vendor ?? 'not recorded')
                  )}
                </Row>
                <Row label="Endpoint" mono>
                  {dep.data ? (
                    <span className="break-all">{dep.data.endpoint_url}</span>
                  ) : (
                    <span className="text-[var(--obc-text-4)]">not available</span>
                  )}
                </Row>
                <Row label="Severity" mono>
                  {inc.severity}
                </Row>
              </dl>
              <dl>
                <Row label="Detected" mono>
                  {formatUtc(inc.started_at, 'yyyy-MM-dd HH:mm:ss')}
                </Row>
                <Row label="Recovered" mono>
                  {inc.resolved_at ? (
                    formatUtc(inc.resolved_at, 'yyyy-MM-dd HH:mm:ss')
                  ) : (
                    <span className="text-[var(--obc-text-4)]">still open</span>
                  )}
                </Row>
                <Row label="Duration" mono>
                  {durationBetween(inc.started_at, inc.resolved_at)}
                </Row>
              </dl>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Observations"
        hint="The recorded events this document is built from. Timestamps are UTC as captured by the checking region."
      >
        {inc?.timeline?.length ? (
          <ol className="border border-[var(--obc-line)]">
            {inc.timeline.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[190px_1fr_auto] items-baseline gap-x-4 border-b border-[var(--obc-line)] px-3.5 py-2.5 last:border-b-0"
              >
                <span className="obc-mono text-[var(--obc-text)]">
                  {formatUtc(e.timestamp, 'yyyy-MM-dd HH:mm:ss')}
                </span>
                <span className="text-[12.5px] text-[var(--obc-text-2)]">{e.description}</span>
                {e.metric && (
                  <span className="obc-mono text-right text-[var(--obc-signal)]">{e.metric}</span>
                )}
              </li>
            ))}
          </ol>
        ) : incident.isLoading ? (
          <RowsSkeleton rows={3} cols={3} />
        ) : (
          <Empty
            title="No observation events attached"
            body="The stored record contains the underlying check data; the console could not load an event timeline for it in this session."
          />
        )}
      </Section>

      <Section
        title="Attribution"
        hint="How the fault was attributed to the external dependency."
      >
        <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-2">
          <dl>
            <Row label="Method" mono>
              {inc?.correlations?.[0]?.correlation_method ?? (
                <span className="text-[var(--obc-text-4)]">not recorded</span>
              )}
            </Row>
            <Row label="Correlation confidence" mono>
              {inc?.correlations?.[0]
                ? `${(inc.correlations[0].correlation_confidence * 100).toFixed(0)}%`
                : r.confidence ?? (
                    <span className="text-[var(--obc-text-4)]">not recorded</span>
                  )}
            </Row>
            <Row label="Correlation window" mono>
              {inc?.correlations?.[0] ? (
                `${inc.correlations[0].time_window_seconds}s`
              ) : (
                <span className="text-[var(--obc-text-4)]">not recorded</span>
              )}
            </Row>
            <Row label="Region of first detection" mono>
              {inc?.region ? (
                regionLabel(inc.region)
              ) : (
                <span className="text-[var(--obc-text-4)]">not recorded</span>
              )}
            </Row>
          </dl>
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--obc-text-4)]">
          Confidence is the detector&apos;s own correlation score for this incident. RELIASTRA does
          not estimate a figure where the detector did not produce one.
        </p>
      </Section>

      <Section
        title="Integrity"
        hint="What makes this record checkable by a third party."
      >
        <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-2">
          <dl>
            <Row label="Checksum" mono>
              <span className="break-all">{r.checksum}</span>
            </Row>
            <Row label="Record size" mono>
              {r.file_size_bytes.toLocaleString()} bytes
            </Row>
            <Row label="Generated" mono>
              {formatUtc(r.generated_at, 'yyyy-MM-dd HH:mm:ss')}
            </Row>
            <Row label="Record id" mono>
              <span className="break-all">{r.id}</span>
            </Row>
          </dl>
        </div>
        {regenerate.isError && (
          <p className="mt-2 text-[11.5px] text-[#E58C85]">
            Regeneration failed. The existing record is unchanged.
          </p>
        )}
      </Section>

      <Section
        title="Share and export"
        hint="A share link resolves to the public verification page, which confirms the checksum without exposing the workspace."
      >
        <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-4">
          {shareUrl ? (
            <>
              <p className="obc-mono break-all text-[var(--obc-text-2)]">{shareUrl}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="obc-btn obc-btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? 'Link copied' : 'Copy verification link'}
                </button>
                <Link href={`/reports/${r.share_token}`} className="obc-btn obc-btn-sm">
                  Open verification page
                </Link>
              </div>
            </>
          ) : (
            <p className="obc-body">
              No share token has been issued for this record. Download the record to distribute it,
              or regenerate it to request a verification link.
            </p>
          )}
        </div>
      </Section>
    </>
  );
}
