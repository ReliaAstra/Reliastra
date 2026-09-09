import Link from 'next/link';
import { PublicObservations } from './public-observations';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { fetchTrackedVendors, type TrackVendorListItem } from '@/lib/track-api';
import { PUBLIC_ROUTES, SHARE_ROUTES } from '@/lib/routes';

/**
 * 08 · Public dependency intelligence.
 *
 * Real data or nothing. This section server-fetches the same public catalog
 * that powers `/track`; if the measurement network cannot be reached it says
 * so plainly instead of rendering placeholder rows. A monitoring product that
 * fakes status on its own homepage has already lost the argument it is making.
 */

export async function LiveIntelligenceSection() {
  let vendors: TrackVendorListItem[] | null = null;
  let unreachable = false;

  try {
    const page = await fetchTrackedVendors(9);
    vendors = page.items ?? [];
  } catch {
    unreachable = true;
  }

  return (
    <Section id="public-intelligence" tone="raised" aria-labelledby="live-title">
      <Container>
        <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5">
            <Eyebrow index="09">Public dependency index</Eyebrow>
            <h2 id="live-title" className="ob-h2 max-w-[18ch]">
              Public vendors, measured from outside.
            </h2>
          </div>
          <p className="ob-body max-w-[44ch]">
            What RELIASTRA’s own probes observe. Not vendor-reported. No
            account required.
          </p>
        </div>

        {unreachable && (
          <div className="ob-alert mt-10 max-w-[60ch]">
            <p className="ob-label mb-2">Measurement network unreachable</p>
            <p>
              Live observations could not be loaded. No placeholder status is
              shown. Try the{' '}
              <Link href={PUBLIC_ROUTES.track} className="ob-link">
                public dependency index
              </Link>
              .
            </p>
          </div>
        )}

        {!unreachable && vendors && vendors.length === 0 && (
          <div className="ob-alert mt-10 max-w-[60ch]">
            <p className="ob-label mb-2">No public vendors tracked yet</p>
            <p>Tracked vendors will be published here.</p>
          </div>
        )}

        {!unreachable && vendors && vendors.length > 0 && (
          <PublicObservations initial={vendors} />
        )}

        <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-4">
          <ArrowLink href={PUBLIC_ROUTES.track}>
            Open the index
          </ArrowLink>
          <p className="ob-small">
            Per vendor: current state, availability, latency, incidents,
            methodology.
          </p>
        </div>
      </Container>
    </Section>
  );
}
