import Link from 'next/link';
import { PublicObservations } from './public-observations';
import { ArrowLink, Container, Eyebrow } from '@/components/site/primitives';
import { fetchTrackedVendors, type TrackVendorListItem } from '@/lib/track-api';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * 06 · The public dependency index.
 *
 * Real data or an explicit statement that there is none. This section
 * server-fetches the same public catalog that powers `/observatory`; if the
 * measurement API cannot be reached it says so plainly instead of rendering
 * placeholder rows. A measurement product that invents status on its own
 * homepage has already lost the argument it is making, and the empty state
 * is the same discipline the product sells.
 */
export async function IndexScene() {
  let vendors: TrackVendorListItem[] | null = null;
  let unreachable = false;

  try {
    const page = await fetchTrackedVendors(9);
    vendors = page.items ?? [];
  } catch {
    unreachable = true;
  }

  return (
    <section
      id="index"
      aria-labelledby="index-title"
      className="border-t border-[var(--ob-line)] bg-[var(--ob-void)]"
    >
      <Container className="py-24 md:py-32 lg:py-36">
        <div className="flex flex-col gap-9 pb-14 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-7">
            <Eyebrow index="06">Public dependency index</Eyebrow>
            <h2 id="index-title" className="ob-scene-title max-w-[15ch]">
              The same probes, published.
            </h2>
          </div>
          <p className="ob-lede max-w-[40ch] lg:pb-1 lg:text-right">
            What RELIASTRA's own probes observe. Not vendor-reported, no
            account required, every figure printed with its window and its
            observation count.
          </p>
        </div>

        {unreachable && (
          <div className="ob-alert max-w-[64ch]">
            <p className="ob-label mb-2">Measurement API unreachable</p>
            <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
              Live observations could not be loaded, so nothing is shown here.
              No placeholder status is rendered in its place: an invented row
              would be indistinguishable from a real one.{' '}
              <Link href={PUBLIC_ROUTES.observatory} className="ob-link">
                Try the observatory
              </Link>
              .
            </p>
          </div>
        )}

        {!unreachable && vendors && vendors.length === 0 && (
          <div className="ob-alert max-w-[64ch]">
            <p className="ob-label mb-2">No public records published</p>
            <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
              The API responded and returned no vendors. That is a fact about
              the public index, not an outage, and it is reported as one.
            </p>
          </div>
        )}

        {!unreachable && vendors && vendors.length > 0 && (
          <PublicObservations initial={vendors} />
        )}

        <div className="mt-14 flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <ArrowLink href={PUBLIC_ROUTES.observatory}>Open the observatory</ArrowLink>
          <p className="ob-small max-w-[52ch]">
            Per vendor: current state, availability with its observation
            count, latency, incident history and the methodology that produced
            each figure.
          </p>
        </div>
      </Container>
    </section>
  );
}
