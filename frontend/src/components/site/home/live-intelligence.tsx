import Link from 'next/link';
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

const CATEGORY_LABELS: Record<string, string> = {
  payment: 'Payments',
  communication: 'Communication',
  cloud: 'Cloud',
  storage: 'Storage',
  database: 'Database',
  auth: 'Identity',
  ai: 'Model APIs',
  other: 'Other',
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'pending';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'pending';
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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
            <Eyebrow index="07">Public dependency index</Eyebrow>
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
          <ul className="mt-4 grid gap-x-12 sm:grid-cols-2 xl:grid-cols-3">
            {vendors.map((v) => (
              <li key={v.id}>
                <Link
                  href={SHARE_ROUTES.trackVendor(v.vendor_name)}
                  className="group flex items-baseline justify-between gap-6 border-b border-[var(--ob-line)] py-5 transition-colors hover:border-[var(--ob-line-3)]"
                >
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate text-[15.5px] font-medium tracking-[-0.01em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                      {v.display_name}
                    </span>
                    <span className="ob-label">
                      {CATEGORY_LABELS[v.category] ?? v.category}
                    </span>
                  </span>
                  {/* The catalog endpoint reports when a vendor was last
                      observed, not its state - so that is all this row claims.
                      Current state lives on the vendor page, where the data
                      backing it is actually fetched. */}
                  <span className="ob-label shrink-0 whitespace-nowrap transition-colors group-hover:text-[var(--ob-signal)]">
                    {relativeTime(v.last_check_at)} →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
