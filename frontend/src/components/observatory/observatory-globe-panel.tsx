'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, MapPinOff } from 'lucide-react';
import { InfrastructureGlobe } from '@/components/observatory/infrastructure-globe';
import type { GlobeDependency, ObservationPoint } from '@/lib/infrastructure-visualization';
import { OBSERVATION_POINTS } from '@/lib/methodology';
import { elapsed, latency, utcStamp } from '@/lib/observatory/format';
import { cn } from '@/lib/utils';

const stateClass: Record<GlobeDependency['status'], string> = {
  healthy: 'bg-[var(--ob-healthy)]',
  degraded: 'bg-[var(--ob-degraded)]',
  critical: 'bg-[var(--ob-critical)]',
  unknown: 'bg-[var(--ob-text-4)]',
};

export function ObservatoryGlobePanel({
  title,
  description,
  dependencies,
  totalDependencies,
  regionLabels,
  latestObservation,
}: {
  title: string;
  description: string;
  dependencies: GlobeDependency[];
  totalDependencies: number;
  regionLabels: string[];
  latestObservation: string | null;
}) {
  const [selectedId, setSelectedId] = useState(dependencies[0]?.id ?? null);
  const selected = useMemo(
    () => dependencies.find((dependency) => dependency.id === selectedId) ?? dependencies[0] ?? null,
    [dependencies, selectedId],
  );
  const observationPoints: ObservationPoint[] = [
    {
      id: 'reliastra-primary-observer',
      label: 'RELIASTRA observation point',
      region: null,
      latitude: null,
      longitude: null,
      state: 'unknown',
      observedAt: null,
    },
  ];

  return (
    <section aria-labelledby="observatory-thesis" className="border-y border-[var(--ob-line)] bg-[var(--ob-base)]">
      <div className="ob-container py-7 md:py-10">
        <div className="obs-globe-layout grid items-start gap-x-8 gap-y-7 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-x-10 lg:gap-y-0">
          <div className="obs-globe-main order-1 min-w-0 lg:py-7">
            <p className="ob-label obs-label-signal">Public infrastructure observatory</p>
            <h1
              id="observatory-thesis"
              className="mt-4 max-w-[24ch] text-[clamp(1.5rem,3.25vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--ob-text)]"
            >
              {title}
            </h1>
            <p className="mt-4 max-w-[58ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
              {description}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-[var(--ob-line)] py-3">
              <div>
                <dt className="ob-label">Public dependencies</dt>
                <dd className="mt-1 font-mono text-[20px] tabular-nums text-[var(--ob-text)]">
                  {totalDependencies.toLocaleString('en-US')}
                </dd>
              </div>
              <div>
                <dt className="ob-label">Observation points</dt>
                <dd className="mt-1 font-mono text-[20px] tabular-nums text-[var(--ob-text)]">
                  {OBSERVATION_POINTS}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="ob-label">Latest completed observation</dt>
                <dd className="mt-1 text-[12px] tabular-nums text-[var(--ob-text-2)]">
                  {latestObservation ? (
                    <time dateTime={latestObservation} title={utcStamp(latestObservation) ?? undefined}>
                      {elapsed(latestObservation)} ago
                    </time>
                  ) : (
                    'No observation time recorded'
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="obs-globe-map order-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="mb-1 flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
              <div>
                <p className="ob-label">Geographic reference</p>
                <h2 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-[var(--ob-text)] md:text-[21px]">
                  Global observation surface
                </h2>
              </div>
              <p className="max-w-[38ch] text-[11.5px] leading-[1.5] text-[var(--ob-text-4)]">
                No node or route is inferred from an unpublished position or a worker region code.
              </p>
            </div>
            <div className="relative mx-auto w-full max-w-[690px] lg:max-w-none">
              <InfrastructureGlobe
                mode="observatory"
                observations={observationPoints}
                interactive
                label="Orthographic Earth with real coastline geometry. No observation marker is displayed because the public source does not publish a verified location."
              />
              <div className="pointer-events-none absolute left-[4%] top-[8%] hidden items-center gap-2 border border-[var(--ob-line)] bg-[var(--ob-void)]/90 px-3 py-2 sm:flex">
                <MapPinOff size={13} className="text-[var(--ob-text-4)]" aria-hidden="true" />
                <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--ob-text-3)]">NO VERIFIED POSITION</span>
              </div>
            </div>
            <p className="-mt-1 px-2 text-[11px] leading-[1.5] text-[var(--ob-text-4)]">
              Region labels are worker assignments, not coordinates, independent vantage points, or geographic corroboration.
            </p>
          </div>

          <aside className="obs-globe-details order-3 min-w-0 border-t border-[var(--ob-line)] pt-5 lg:col-start-1 lg:row-start-2 lg:mt-0">
            <p className="ob-label mb-3">Dependency records</p>
            {dependencies.length ? (
              <ul className="divide-y divide-[var(--ob-line)] border-y border-[var(--ob-line)]">
                {dependencies.slice(0, 5).map((dependency) => (
                  <li key={dependency.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(dependency.id)}
                      aria-pressed={selected?.id === dependency.id}
                      className={cn(
                        'flex min-h-12 w-full items-center justify-between gap-4 px-2 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ob-signal)]',
                        selected?.id === dependency.id && 'bg-white/[0.035]',
                      )}
                    >
                      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ob-text-2)]">{dependency.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--ob-text-3)]">
                        <span className={cn('size-1.5 rounded-full', stateClass[dependency.status])} aria-hidden="true" />
                        {dependency.statusLabel}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-y border-[var(--ob-line)] py-4 text-[13px] leading-[1.6] text-[var(--ob-text-3)]">
                The catalog returned no public dependency records. No sample locations are supplied.
              </p>
            )}

            {totalDependencies > dependencies.length && (
              <p className="mt-3 text-[11.5px] text-[var(--ob-text-4)]">
                Showing {dependencies.length} of {totalDependencies.toLocaleString('en-US')} records.{' '}
                <Link href="#catalog" className="ob-link">Browse full catalog</Link>
              </p>
            )}

            {selected && (
              <div aria-live="polite" className="mt-5 border-l border-[var(--ob-line-2)] pl-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="text-[14px] font-semibold text-[var(--ob-text)]">{selected.name}</h3>
                  <span className="text-[11px] text-[var(--ob-text-3)]">{selected.category ?? 'Dependency'}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <dt className="ob-label">Observed state</dt>
                    <dd className="mt-1 text-[12px] text-[var(--ob-text-2)]">{selected.statusLabel}</dd>
                  </div>
                  <div>
                    <dt className="ob-label">Latest latency</dt>
                    <dd className="mt-1 font-mono text-[12px] tabular-nums text-[var(--ob-text-2)]">
                      {selected.latencyMs != null && selected.latencyMs > 0 ? `${latency(selected.latencyMs)} ms` : 'No data'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="ob-label">Worker region label</dt>
                    <dd className="mt-1 text-[12px] text-[var(--ob-text-2)]">
                      {selected.regionLabels.length ? selected.regionLabels.join(' · ') : 'Not configured'}
                      <span className="text-[var(--ob-text-4)]"> · not independent origins</span>
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="ob-label">Last observation</dt>
                    <dd className="mt-1 text-[12px] tabular-nums text-[var(--ob-text-2)]">
                      {selected.lastObservedAt ? utcStamp(selected.lastObservedAt) : 'No observation recorded'}
                    </dd>
                  </div>
                </dl>
                <Link href={selected.href} className="ob-link mt-4 inline-flex items-center gap-1.5 text-[12.5px]">
                  Open record <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </div>
            )}
            <p className="mt-5 text-[11.5px] leading-[1.55] text-[var(--ob-text-4)]">
              {regionLabels.length ? `Labels in the current catalog: ${regionLabels.join(' · ')}.` : 'No worker region labels are configured in the current catalog.'}
              {' '}They do not count as independent observation origins.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
