import Link from 'next/link';
import { PublicObservations } from './public-observations';
import { ArrowLink, Container, Eyebrow, Section } from '@/components/site/primitives';
import { fetchTrackedVendors, type TrackVendorListItem } from '@/lib/track-api';
import { DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * 08 · The public observatory.
 *
 * Real data or an explicit statement that there is none. This section
 * server-fetches the same public catalog that powers `/observatory`; if the
 * measurement API cannot be reached it says so plainly instead of rendering
 * placeholder rows. A measurement product that invents status on its own
 * homepage has already lost the argument it is making — and the empty state is
 * not an embarrassment, it is the same discipline the product sells.
 */
export async function ObservatorySection() {
  let vendors: TrackVendorListItem[] | null = null;
  let unreachable = false;

  try {
    const page = await fetchTrackedVendors(9);
    vendors = page.items ?? [];
  } catch {
    unreachable = true;
  }

  return (
    <Section id="observatory" tone="void" aria-labelledby="observatory-title">
      <Container>
        <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5">
            <Eyebrow index="07">Public observatory</Eyebrow>
            <h2 id="observatory-title" className="ob-h2 max-w-[20ch]">
              The same probes, published where anyone can read them.
            </h2>
          </div>
          <p className="ob-body max-w-[46ch]">
            What RELIASTRA’s own probes observe. Not vendor-reported, no account
            required, and every figure printed with the window and the number of
            observations behind it.
          </p>
        </div>

        {unreachable && (
          <div className="ob-alert mt-10 max-w-[64ch]">
            <p className="ob-label mb-2">Measurement API unreachable</p>
            <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
              Live observations could not be loaded, so nothing is shown here.
              No placeholder status is rendered in its place — an invented row
              would be indistinguishable from a real one.{' '}
              <Link href={PUBLIC_ROUTES.observatory} className="ob-link">
                Try the observatory
              </Link>
              .
            </p>
          </div>
        )}

        {!unreachable && vendors && vendors.length === 0 && (
          <div className="ob-alert mt-10 max-w-[64ch]">
            <p className="ob-label mb-2">No public records published</p>
            <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
              The API responded and returned no vendors. That is a fact about the
              public index, not an outage — and it is reported as one.
            </p>
          </div>
        )}

        {!unreachable && vendors && vendors.length > 0 && (
          <PublicObservations initial={vendors} />
        )}

        <div className="mt-12 flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <ArrowLink href={PUBLIC_ROUTES.observatory}>Open the observatory</ArrowLink>
          <p className="ob-small max-w-[52ch]">
            Per vendor: current state, availability with its observation count,
            latency, incident history and the methodology that produced each
            figure.{' '}
            <Link href={DOCS_ROUTES.methodology} className="ob-link">
              Methodology
            </Link>
          </p>
        </div>
      </Container>
    </Section>
  );
}
