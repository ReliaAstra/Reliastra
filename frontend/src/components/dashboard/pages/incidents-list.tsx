'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useIncidents } from '@/lib/dashboard/queries';
import { incidentCode, timeAgo } from '@/lib/dashboard/format';
import { EmptyState } from '../ui/empty-state';
import { TableSkeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function IncidentsListPage() {
  const { data, isLoading } = useIncidents(undefined, 50);
  const router = useRouter();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Incidents</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">
          Correlated failures across your monitored dependencies.
        </p>
      </div>
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : !data?.length ? (
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title="No incidents yet"
          body="Incidents appear when independent regional checks lose quorum on a dependency."
          actionLabel="View dependencies"
          onAction={() => router.push('/dependencies')}
          helpLabel="How are incidents detected?"
          onHelp={() => window.open('mailto:support@reliastra.com?subject=How%20are%20incidents%20detected%3F')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((incident) => {
            const accent =
              incident.severity === 'critical'
                ? 'bg-rs-down'
                : incident.severity === 'major'
                  ? 'bg-rs-degraded'
                  : 'bg-rs-text-tertiary';
            const conf = incident.confidence ?? 'HIGH';
            const confColor =
              conf === 'HIGH' ? 'text-rs-up' : conf === 'MEDIUM' ? 'text-rs-degraded' : 'text-rs-text-tertiary';
            return (
              <Link
                key={incident.id}
                href={`/incidents/${incident.id}`}
                className="relative overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated px-5 py-4 transition-[border-color] duration-150 hover:border-rs-border"
              >
                <span className={cn('absolute bottom-0 left-0 top-0 w-[3px] rounded-l-xl', accent)} />
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <span className="font-mono text-xs font-medium text-rs-text-accent">
                      {incidentCode(incident.id, incident.display_id)}
                    </span>
                    <span className="ml-2 text-sm font-medium text-rs-text">
                      {incident.title || incident.description || 'Incident'}
                    </span>
                  </div>
                  <span className="text-xs text-rs-text-tertiary">{timeAgo(incident.started_at)}</span>
                </div>
                <div className="mt-2 text-xs text-rs-text-tertiary">
                  {incident.vendor || 'Vendor'} / {incident.region || 'Multi-region'} ·{' '}
                  <span className={confColor}>{conf}</span> · {incident.status}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
