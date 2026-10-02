import Link from 'next/link';
import { InfrastructureGlobe } from '@/components/observatory/infrastructure-globe';
import type { ObservationPoint } from '@/lib/infrastructure-visualization';
import { OBSERVATION_LABEL, OBSERVATION_POINTS } from '@/lib/methodology';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

const currentObservationPoint: ObservationPoint = {
  id: 'reliastra-primary-observer',
  label: 'RELIASTRA observation point',
  region: OBSERVATION_LABEL,
  latitude: null,
  longitude: null,
  state: 'unknown',
  observedAt: null,
};

/** The public thesis, paired with an honest view of the deployed topology. */
export function HomeHero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="overflow-hidden border-b border-[var(--ob-line)] bg-[var(--ob-void)]"
    >
      <div className="ob-container pt-[102px] md:pt-[126px]">
        <div className="grid items-center gap-8 pb-9 md:gap-12 lg:min-h-[660px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-7 lg:pb-10 xl:min-h-[710px]">
          <div className="relative z-[1] order-1 flex flex-col items-start lg:py-10">
            <p className="ob-eyebrow mb-6">Independent infrastructure observation</p>
            <h1
              id="hero-title"
              className="max-w-[24ch] text-[clamp(2.15rem,4.1vw,3.75rem)] font-semibold leading-[1.055] tracking-[-0.05em] text-[var(--ob-text)]"
            >
              Reliastra observes the world&apos;s external infrastructure and turns distributed observations into evidence.
            </h1>
            <p className="mt-6 max-w-[49ch] text-[clamp(1rem,1.25vw,1.125rem)] leading-[1.7] text-[var(--ob-text-2)]">
              Independent probes record what a dependency returned. Persistent failures are
              classified, attributed against a published method, and retained in a verifiable
              incident record.
            </p>

            <div className="mt-7 max-w-[49ch] border-l border-[var(--ob-signal)]/60 pl-4">
              <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                <span className="font-medium text-[var(--ob-text-2)]">
                  Current topology: {OBSERVATION_POINTS} observation{' '}
                  {OBSERVATION_POINTS === 1 ? 'point' : 'points'}.
                </span>{' '}
                Public region labels do not establish independent geographic origins, so this map
                does not plot unverified locations or imply quorum.
              </p>
            </div>

            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-primary">
                Start observing
              </Link>
              <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-outline">
                Open public observatory
              </Link>
            </div>
          </div>

          <div className="order-2 min-w-0 lg:-mr-8 xl:-mr-12">
            <div className="mx-auto w-full max-w-[620px] lg:max-w-none">
              <InfrastructureGlobe
                mode="landing"
                observations={[currentObservationPoint]}
                interactive
                label="Slowly rotating orthographic Earth with coastline and graticule. No observation coordinates are published, so no location markers are shown."
              />
            </div>
            <div className="mx-auto mt-1 flex max-w-[600px] flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-[var(--ob-line)] px-1 pt-4 text-[11px] text-[var(--ob-text-4)] lg:mt-0">
              <span>GEOGRAPHIC REFERENCE · NATURAL EARTH</span>
              <span>PLACED OBSERVATION LOCATIONS · NOT PUBLISHED</span>
            </div>
          </div>
        </div>

        <div className="grid border-t border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8">
          <p className="text-[12px] font-medium tracking-[0.025em] text-[var(--ob-text-2)]">
            Observation <span className="px-2 text-[var(--ob-text-4)]">/</span> Persistent condition{' '}
            <span className="px-2 text-[var(--ob-text-4)]">/</span> Attribution{' '}
            <span className="px-2 text-[var(--ob-text-4)]">/</span> Verifiable evidence
          </p>
          <Link href={PUBLIC_ROUTES.product + '/evidence'} className="ob-link mt-3 text-[12.5px] sm:mt-0">
            How evidence is produced <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
