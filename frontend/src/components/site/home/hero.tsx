import Image from 'next/image';
import { CTA, Container } from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Homepage hero.
 *
 * A full-viewport photograph of physical infrastructure with the smallest
 * amount of type that can carry the positioning. No cards, no mock dashboard,
 * no floating shapes.
 *
 * Technical notes:
 * - `100svh` (not `100vh`) so mobile browser chrome cannot crop the CTA.
 * - The image is `priority` + `fetchPriority=high`: it is the LCP element.
 * - The drift animation is a 42s scale/translate on the image only, and it
 *   collapses entirely under `prefers-reduced-motion`.
 * - The scrim is a flat black gradient, so text contrast is deterministic
 *   regardless of how the photograph crops at a given viewport.
 */
export function HomeHero() {
  return (
    <section
      id="top"
      /* Full-viewport on phones and laptops, capped at 820px so a large
         display does not push the first line of copy out of view. */
      className="relative flex h-[100svh] max-h-[820px] min-h-[600px] flex-col justify-end overflow-hidden bg-[var(--ob-void)]"
      aria-labelledby="hero-title"
    >
      <div className="absolute inset-0">
        <Image
          src="/media/hero-datacenter-aisle.jpg"
          alt="A containment aisle inside a data hall at night, server cabinets receding into darkness with status indicators lit along their front panels."
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          quality={82}
          className="ob-photo ob-drift object-cover object-center"
        />
        <div className="ob-scrim-bottom absolute inset-0" aria-hidden />
      </div>

      <Container className="relative pb-14 pt-32 md:pb-20">
        <p className="ob-label ob-rise ob-rise-1 mb-7 flex items-center gap-3">
          <span aria-hidden className="block h-px w-8 bg-[var(--ob-signal)]" />
          External Dependency Intelligence
        </p>

        <h1 id="hero-title" className="ob-display ob-rise ob-rise-2 max-w-[16ch]">
          Infrastructure
          <br />
          you can prove.
        </h1>

        <p className="ob-rise ob-rise-3 mt-8 max-w-[44ch] text-[clamp(1rem,1.6vw,1.3125rem)] leading-[1.55] text-[var(--ob-text-2)]">
          Independent observation of the services you depend on. Incidents
          attributed. Evidence you can hand over.
        </p>

        <div className="ob-rise ob-rise-4 mt-10 flex flex-col gap-3 sm:flex-row">
          <CTA href={AUTH_ROUTES.signup} tone="signal">
            Start monitoring
          </CTA>
          <CTA href={PUBLIC_ROUTES.track} tone="outline">
            Public dependency index
          </CTA>
        </div>
      </Container>

      {/* Bottom rail: the three things the product does. Not metrics. */}
      <div className="relative border-t border-[var(--ob-line)] bg-[var(--ob-void)]/70 supports-[backdrop-filter]:backdrop-blur-sm">
        <Container>
          <dl className="grid grid-cols-1 divide-y divide-[var(--ob-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              ['Observe', 'Checks run outside your network and the vendor’s.'],
              ['Correlate', 'Vendor degradation aligned with your incident window.'],
              ['Prove', 'Timestamped, checksummed, exportable records.'],
            ].map(([term, desc], i) => (
              <div
                key={term}
                className={`flex flex-col gap-1.5 py-5 ${i > 0 ? 'sm:pl-8' : ''} ${i < 2 ? 'sm:pr-8' : ''}`}
              >
                <dt className="ob-label">{term}</dt>
                <dd className="text-[13px] leading-[1.5] text-[var(--ob-text-3)]">
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </div>
    </section>
  );
}
