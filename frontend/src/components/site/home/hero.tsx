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

/** The public thesis, staged like the thing it describes: one Earth, full-bleed. */
export function HomeHero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative flex min-h-[100svh] flex-col overflow-hidden bg-black"
    >
      {/*
        The Earth is the hero. Full-viewport, rotating, no markers: there are
        no verified coordinates to plot, so none are plotted. Interactive
        steering is off here on purpose — this is a cinematic surface, not the
        instrument. The observatory page owns the steerable globe.
      */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-center">
        <div className="w-[175vmin] max-w-none shrink-0 opacity-90 sm:w-[150vmin] lg:ml-[38vmin] lg:w-[125vmin]">
          <InfrastructureGlobe
            mode="landing"
            observations={[currentObservationPoint]}
            interactive={false}
            className="[&>div]:max-w-none"
            label="Slowly rotating orthographic Earth with coastline and graticule. No observation coordinates are published, so no location markers are shown."
          />
        </div>
      </div>
      {/* Legibility scrims: left for the headline, top for the floating header, bottom for the fine print. */}
      <div aria-hidden className="ob-scene-scrim" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.85),transparent_30%)]"
      />

      <div className="ob-container relative z-[1] flex flex-1 flex-col justify-center pb-24 pt-36 md:pt-40">
        <h1
          id="hero-title"
          className="max-w-[10ch] text-[clamp(3rem,7vw,6.25rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--ob-text)]"
        >
          Infrastructure you can prove.
        </h1>
        <p className="mt-7 max-w-[44ch] text-[clamp(1.0625rem,1.4vw,1.25rem)] leading-[1.6] text-[var(--ob-text-2)]">
          RELIASTRA independently observes the external services your software
          depends on — and keeps a verifiable record of what they did.
        </p>

        <div className="mt-10">
          <p className="ob-label">Service starting at</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="ob-figure ob-figure-xl">$9</span>
            <span className="text-[1.125rem] text-[var(--ob-text-3)]">/mo</span>
          </p>
        </div>

        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-primary">
            Start monitoring
          </Link>
          <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-outline">
            Open public observatory
          </Link>
        </div>
      </div>

      {/*
        Fine print, Starlink-style: one honest line pinned to the foot of the
        scene. The topology disclaimer lives here now — not as a bordered
        callout competing with the headline, but as the quiet fact it is.
      */}
      <div className="relative z-[1] border-t border-[var(--ob-line)] bg-[rgba(0,0,0,0.55)]">
        <div className="ob-container flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          {/*
            One expression, one text node: React emits comment separators
            between adjacent JSX text nodes, and the honesty contract test
            matches `1 observation point` on the tag-stripped markup. Split
            nodes would read `1  observation  point` and fail it.
          */}
          <p className="text-[12px] leading-[1.6] text-[var(--ob-text-4)]">
            {`${OBSERVATION_POINTS} observation ${OBSERVATION_POINTS === 1 ? 'point' : 'points'} today${OBSERVATION_LABEL ? ` (${OBSERVATION_LABEL})` : ''} · every record says so. No quorum claimed.`}
          </p>
          <Link href={PUBLIC_ROUTES.productEvidence} className="ob-link shrink-0 text-[12.5px]">
            How evidence is produced <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
