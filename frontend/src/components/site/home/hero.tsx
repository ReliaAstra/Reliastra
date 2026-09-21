import Link from 'next/link';
import { ObservationLedger } from './observation-ledger';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import {
  DETECTION,
  OBSERVATION_LABEL,
  OBSERVATION_POINTS,
  PROBE_INTERVAL_SECONDS,
} from '@/lib/methodology';

/**
 * The homepage hero: a full-viewport mission scene.
 *
 * Composition: one near-monochrome infrastructure frame behind everything,
 * scrims that keep the type at full contrast, the proposition anchored
 * bottom-left, and a hairline-ruled deck at the foot of the viewport that
 * carries the product's own telemetry shape. Nothing on the deck invents a
 * value: the observation-point label, the interval and the rule id are read
 * from the methodology constants, and the illustrative record says it is
 * illustrative.
 *
 * The scene image is generated for RELIASTRA (public/media). It is a
 * backdrop, not a claim: no screenshot, no stock office, no one's logo.
 */
export function HomeHero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="ob-hero">
      <div className="ob-hero-media">
        <img
          src="/media/scene-data-hall.webp"
          srcSet="/media/scene-data-hall-sm.webp 1600w, /media/scene-data-hall.webp 1915w"
          sizes="100vw"
          alt=""
          fetchPriority="high"
          decoding="async"
          className="ob-drift"
        />
        <div className="ob-hero-scrim-l" aria-hidden />
        <div className="ob-hero-scrim-b" aria-hidden />
      </div>

      {/* Proposition, anchored low-left like a mission overlay. */}
      <div className="ob-container relative z-[1] flex flex-1 flex-col pt-[96px] md:pt-[120px]">
        <div className="flex flex-1 flex-col justify-end pb-10 md:pb-14">
          <p className="ob-eyebrow ob-rise ob-rise-1">
            External dependency intelligence
          </p>

          <h1
            id="hero-title"
            className="ob-display ob-rise ob-rise-2 mt-6 max-w-[24ch]"
          >
            Infrastructure you can prove.
          </h1>

          <p className="ob-rise ob-rise-3 mt-7 max-w-[46ch] text-[clamp(1rem,1.35vw,1.1875rem)] leading-[1.62] text-[var(--ob-text-2)]">
            Your infrastructure does not stop at your network edge. RELIASTRA
            independently observes the third-party services you depend on,
            aligns their failures with your incidents, and produces evidence
            you can hand over.
          </p>

          <div className="ob-rise ob-rise-4 mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
              Start monitoring
            </Link>
            <Link href={PUBLIC_ROUTES.product} className="ob-btn ob-btn-outline">
              Explore the platform
            </Link>
          </div>

          <p className="ob-rise ob-rise-4 mt-7 max-w-[52ch] text-[0.875rem] leading-[1.6] text-[var(--ob-text-3)]">
            {OBSERVATION_POINTS === 1
              ? 'One observation point today, '
              : `${OBSERVATION_POINTS} observation points today, `}
            and every surface says so, including the ones where it weakens the
            claim.{' '}
            <Link href={DOCS_ROUTES.methodology} className="ob-link">
              Read the methodology
            </Link>
            .
          </p>
        </div>
      </div>

      {/* The deck: product telemetry as the hero's instrument panel. */}
      <div className="ob-hero-deck">
        <div className="ob-container grid items-start gap-x-10 gap-y-6 py-6 lg:grid-cols-[minmax(0,572px)_minmax(0,1fr)] lg:items-center lg:py-0">
          <ObservationLedger className="lg:my-5" />

          <div className="hidden flex-col gap-5 lg:flex lg:py-5">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
              {[
                ['Observation point', OBSERVATION_LABEL],
                [
                  'Probe interval',
                  `every ${PROBE_INTERVAL_SECONDS}s`,
                ],
                [
                  'Confirmation rule',
                  `${DETECTION.ruleId} · ${DETECTION.failureChecks}`,
                ],
                ['Evidence', 'SHA-256 · retained 365 days'],
              ].map(([term, value]) => (
                <div key={term} className="flex flex-col gap-2">
                  <dt className="ob-label">{term}</dt>
                  <dd className="ob-mono text-[12px] leading-[1.5] text-[var(--ob-text-2)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex items-end justify-between gap-6 border-t border-[var(--ob-line)] pt-4">
              <p className="ob-label max-w-[34ch] leading-[1.7]">
                Telemetry values marked illustrative are illustrative. The
                fields are the real schema.
              </p>
              <span className="ob-scroll-cue">
                <span className="ob-label">Scroll</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
