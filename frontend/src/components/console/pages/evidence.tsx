'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { hasEvidence } from '@/lib/dashboard/plans';
import { useEvidence, useIncidents } from '@/lib/dashboard/queries';
import { formatUtc, incidentCode, reportCode } from '@/lib/dashboard/format';
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  RowsSkeleton,
  Section,
} from '@/components/console/primitives';
import { DataTable, TableFilters, type Column } from '@/components/console/data-table';
import type { EvidenceReport, Incident } from '@/lib/dashboard/types';

type Record_ = EvidenceReport & { incident?: Incident };

/**
 * Evidence library.
 *
 * A register of records, not a feed of cards: the fields that matter in a
 * dispute — record id, the incident it covers, the dependency, the window it
 * describes, its checksum and its expiry — are all columns, and the checksum
 * is visible in the list because it is the thing that makes the record worth
 * anything. Confidence is printed only when the backend returns it; the old
 * library defaulted absent values to "MEDIUM".
 */
export function EvidencePage() {
  const evidence = useEvidence();
  const incidents = useIncidents(undefined, 50);
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const allowed = hasEvidence(plan?.effective_plan ?? plan?.plan);
  const [query, setQuery] = useState('');

  const byIncident = useMemo(() => {
    const m = new Map<string, Incident>();
    for (const i of incidents.data ?? []) m.set(i.id, i);
    return m;
  }, [incidents.data]);

  const rows: Record_[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (evidence.data ?? [])
      .map((r) => ({ ...r, incident: byIncident.get(r.incident_id) }))
      .filter((r) =>
        q
          ? [r.title, r.vendor, reportCode(r.id), r.checksum, r.incident?.title]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
  }, [evidence.data, byIncident, query]);

  const columns: Column<Record_>[] = [
    {
      key: 'code',
      header: 'Record',
      width: 250,
      sort: (r) => r.generated_at,
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="obc-mono text-[var(--obc-signal)]">{reportCode(r.id)}</span>
          <span className="truncate text-[12.5px] text-[var(--obc-text)]">
            {r.title || 'Evidence record'}
          </span>
        </span>
      ),
    },
    {
      key: 'incident',
      header: 'Incident',
      width: 130,
      sort: (r) => r.incident_id,
      render: (r) => (
        <span className="obc-mono text-[var(--obc-text-2)]">
          {incidentCode(r.incident_id, r.incident?.display_id)}
        </span>
      ),
    },
    {
      key: 'dependency',
      header: 'Dependency',
      sort: (r) => r.vendor ?? '',
      render: (r) =>
        r.vendor ? (
          <span className="truncate text-[12.5px] text-[var(--obc-text-2)]">{r.vendor}</span>
        ) : (
          <span className="text-[var(--obc-text-4)]">not recorded</span>
        ),
    },
    {
      key: 'generated',
      header: 'Generated (UTC)',
      width: 160,
      numeric: true,
      sort: (r) => r.generated_at,
      render: (r) => formatUtc(r.generated_at, 'yyyy-MM-dd HH:mm'),
    },
    {
      key: 'checksum',
      header: 'Checksum',
      width: 150,
      render: (r) => (
        <span className="obc-mono truncate text-[11px] text-[var(--obc-text-3)]" title={r.checksum}>
          {r.checksum.replace(/^sha256:/, '').slice(0, 16)}…
        </span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      width: 90,
      numeric: true,
      sort: (r) => r.file_size_bytes,
      render: (r) => (
        <>
          {(r.file_size_bytes / 1024).toFixed(0)}
          <span className="ml-1 text-[10px] text-[var(--obc-text-4)]">KB</span>
        </>
      ),
    },
    {
      key: 'expires',
      header: 'Retention',
      width: 130,
      sort: (r) => r.expires_at ?? '',
      render: (r) =>
        r.expires_at ? (
          <span className="text-[12px] text-[var(--obc-text-3)]">
            until {formatUtc(r.expires_at, 'yyyy-MM-dd')}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--obc-text-3)]">indefinite</span>
        ),
    },
  ];

  return (
    <>
      <PageHead
        title="Evidence records"
        meta={
          <>
            <Fact label="Records" value={evidence.data?.length ?? '—'} />
            <Fact
              label="Source"
              value="confirmed incidents"
              mono={false}
            />
          </>
        }
      />

      <Section
        title="Record register"
        hint="Each record is a timestamped, checksummed account of one incident: the observations behind it, the regions that made them, and the correlation used to attribute the fault."
      >
        {!allowed ? (
          <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] px-6 py-10">
            <p className="obc-label text-[var(--obc-text-3)]">
              Evidence records are not included in your plan
            </p>
            <p className="obc-body mt-3 max-w-[62ch]">
              Monitoring and incident detection continue as normal. Evidence generation —
              the checksummed record used to support an SLA claim — requires a paid plan.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="obc-btn obc-btn-primary"
                onClick={() => openUpgrade('evidence')}
              >
                Compare plans
              </button>
              <Link href="/incidents" className="obc-btn">
                View incidents
              </Link>
            </div>
          </div>
        ) : evidence.isLoading ? (
          <RowsSkeleton rows={5} cols={5} />
        ) : evidence.isError ? (
          <Failure
            title="Evidence register unavailable"
            body="The register could not be retrieved. Stored records are unaffected — this is a read failure in the console."
            onRetry={() => evidence.refetch()}
          />
        ) : !evidence.data?.length ? (
          <Empty
            title="No evidence records"
            body="A record is generated once an incident is confirmed by multiple regions and its observation window closes. Records appear here automatically; nothing needs to be requested."
            action={
              <Link href="/incidents" className="obc-btn obc-btn-sm">
                View incidents
              </Link>
            }
          />
        ) : (
          <>
            <TableFilters
              query={query}
              onQuery={setQuery}
              placeholder="Filter by record, dependency or checksum"
            />
            {rows.length ? (
              <DataTable
                rows={rows}
                columns={columns}
                rowKey={(r) => r.id}
                rowHref={(r) => `/evidence/${r.id}`}
                caption="Evidence records, most recent first"
              />
            ) : (
              <Empty
                title="No records match this filter"
                body="Clear the filter to see the full register."
              />
            )}
          </>
        )}
      </Section>
    </>
  );
}
