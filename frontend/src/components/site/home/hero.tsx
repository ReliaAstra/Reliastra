import Link from 'next/link';
import { Container } from '@/components/site/primitives';
import { ObservationLedger } from './observation-ledger';
import { AUTH_ROUTES } from '@/lib/routes';
import { DOCS_ROUTES } from '@/lib/routes';
import { OBSERVATION_POINTS, SCOPE_NOTE } from '@/lib/methodology';

/**
 * The homepage hero.
 *
 * No photograph. The previous hero was a full-viewport data-hall image with
 * the proposition set over it, which is the visual grammar of a company
 * selling infrastructure rather than one that measures it. What an engineer
 * wants in the first screen is the product: a dependency, a run of probes, the
 * confirmation, and the record. That is what is here.
 *
 * The composition is two columns on wide screens and stacked below, so on a
 * phone the visitor reads the problem first and the product immediately after,
 * with no horizontal scrolling and no clipped table.
 */
export function HomeHero() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-[var(--ob-line)] bg-[var(--ob-void)]"
    >
      {/* A single structural grid: a hairline field, not a gradient. It reads
          as the ruled paper of a measurement instrument and costs nothing. */}
      <div aria-hidden className="ob-grid-field absolute inset-0" />

      <Container className="relative pb-16 pt-28 md:pb-24 md:pt-36 lg:pb-28">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:items-start lg:gap-16 xl:gap-20">
          <div className="max-w-[38rem]">
            <p className="ob-label ob-rise ob-rise-1 flex items-center gap-3">
              <span aria-hidden className="block h-px w-8 bg-[var(--ob-signal)]" />
              External dependency observation
            </p>

            <h1 id="hero-title" className="ob-display ob-rise ob-rise-2 mt-7">
              Your dependency failed.
              <br />
              What actually
              <br />
              happened?
            </h1>

            <p className="ob-rise ob-rise-3 mt-8 max-w-[46ch] text-[clamp(1rem,1.35vw,1.1875rem)] leading-[1.6] text-[var(--ob-text-2)]">
              RELIASTRA probes the external services your software depends on —
              from outside your network and outside the vendor’s — records every
              observation, confirms a fault deterministically, and keeps a
              record you can still verify a year later.
            </p>

            <div className="ob-rise ob-rise-4 mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start observing
              </Link>
              <Link href={DOCS_ROUTES.quickstart} className="ob-btn ob-btn-outline">
                Read the quickstart
              </Link>
            </div>

            <p className="ob-rise ob-rise-4 mt-7 max-w-[52ch] text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
              {OBSERVATION_POINTS === 1
                ? 'One observation point today, '
                : `${OBSERVATION_POINTS} observation points today, `}
              and every surface says so — including the ones where it weakens the
              claim.{' '}
              <Link href={DOCS_ROUTES.methodology} className="ob-link">
                Read the methodology
              </Link>
              .
            </p>
          </div>

          <div className="ob-rise ob-rise-3 lg:pt-4">
            <ObservationLedger />
            <p className="ob-small mt-4 max-w-[54ch]">{SCOPE_NOTE}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
