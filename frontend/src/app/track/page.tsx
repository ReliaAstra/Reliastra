import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchTrackedVendors, type TrackVendorListItem } from '@/lib/track-api';
import { PreferredSourceSection } from '@/components/seo/preferred-source';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { breadcrumbJsonLd, canonicalUrl } from '@/lib/seo';
import { AUTH_ROUTES, PUBLIC_ROUTES, SHARE_ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Public dependency index - independently measured vendor status',
  description:
    'Independent, multi-region observation of the third-party APIs modern products depend on. Availability, latency and incident history measured by RELIASTRA probes - not self-reported by the vendor.',
  alternates: { canonical: canonicalUrl(PUBLIC_ROUTES.track) },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Public dependency index - RELIASTRA',
    description:
      'Independent, multi-region status for third-party APIs. Measured, not self-reported.',
    url: canonicalUrl(PUBLIC_ROUTES.track),
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'RELIASTRA public dependency index',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Public dependency index - RELIASTRA',
    description:
      'Independent availability, latency and incident history for third-party APIs.',
    images: ['/opengraph-image'],
  },
};

export const revalidate = 60;

function formatWhen(iso: string | null): string {
  if (!iso) return 'no observation';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'no observation';
  const mins = Math.floor((Date.now() - parsed) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CATEGORY_LABELS: Record<string, string> = {
  payment: 'Payments',
  communication: 'Communication',
  cloud: 'Cloud',
  storage: 'Storage',
  database: 'Database',
  auth: 'Identity',
  ai: 'AI',
  other: 'Other',
};

function VendorRow({ v }: { v: TrackVendorListItem }) {
  return (
    <li>
      <Link
        href={SHARE_ROUTES.trackVendor(v.vendor_name)}
        className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-[var(--ob-line)] py-4 transition-colors hover:border-[var(--ob-line-3)] sm:grid-cols-[minmax(0,1fr)_minmax(0,160px)_minmax(0,150px)]"
      >
        <span className="truncate text-[15.5px] font-medium tracking-[-0.01em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
          {v.display_name}
        </span>
        <span className="ob-label sm:text-left">
          {CATEGORY_LABELS[v.category] ?? v.category}
        </span>
        <span className="ob-mono col-start-2 row-start-1 text-right text-[var(--ob-text-4)] sm:col-start-3 sm:row-start-auto">
          {formatWhen(v.last_check_at)}
        </span>
      </Link>
    </li>
  );
}

/**
 * The tracked-vendor catalog.
 *
 * The list endpoint returns identity and last-observation time only — it does
 * NOT return a health verdict. So this page shows exactly that and no more.
 * Rendering a green dot next to every row (as the previous version did) would
 * be a fabricated status indicator, which is the one thing a company selling
 * independent evidence cannot do.
 *
 * Both failure states are explicit and distinct: "measurement network
 * unreachable" is not the same fact as "no vendors tracked yet", and
 * collapsing them would misrepresent the system.
 */
async function VendorsList() {
  let page: Awaited<ReturnType<typeof fetchTrackedVendors>> | null = null;
  let failed = false;
  try {
    page = await fetchTrackedVendors();
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <div role="status" className="ob-alert ob-alert-error">
        <p className="ob-label mb-2">Measurement network unreachable</p>
        <p className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
          The catalog could not be retrieved from the measurement API. This page
          shows no vendors rather than a cached or approximated list.
        </p>
      </div>
    );
  }

  if (!page?.items?.length) {
    return (
      <div role="status" className="ob-alert ob-alert-note">
        <p className="ob-label mb-2">No public vendors tracked yet</p>
        <p className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
          Vendors appear here once organizations begin monitoring public APIs on
          RELIASTRA and their observations become publishable.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,160px)_minmax(0,150px)] gap-x-6 pb-3 sm:grid">
        <span className="ob-label">Vendor</span>
        <span className="ob-label">Category</span>
        <span className="ob-label text-right">Last observed</span>
      </div>
      <ul>
        {page.items.map((v) => (
          <VendorRow key={v.id} v={v} />
        ))}
      </ul>
      <p className="ob-small mt-6 border-t border-[var(--ob-line)] pt-4">
        {page.items.length} vendor{page.items.length === 1 ? '' : 's'} in the
        public catalog. Page data revalidates every 60 seconds.
      </p>
    </>
  );
}

export default function TrackIndexPage() {
  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Public dependency index', path: PUBLIC_ROUTES.track },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.track),
            url: canonicalUrl(PUBLIC_ROUTES.track),
            name: 'Public dependency index',
            description:
              'Independent, multi-region observation of third-party APIs: availability, latency and incident history.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Public dependency index', href: PUBLIC_ROUTES.track },
            ]}
            className="mb-8"
          />
          <Eyebrow>Public dependency intelligence</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[17ch]">
            Independent observation of the services you depend on.
          </h1>
          <p className="ob-lede mt-6">
            Availability, latency and incident history for third-party APIs,
            measured from RELIASTRA&apos;s regional probes. Nothing here is
            taken from a vendor status page.
          </p>
          <p className="ob-body mt-4 max-w-[62ch]">
            This index is public and requires no account. It exists so the
            measurement method can be checked by anyone before they rely on it
            commercially.
          </p>
        </Container>
      </header>

      <Section tone="void" divider={false} aria-labelledby="catalog-heading">
        <Container width="narrow">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 id="catalog-heading" className="ob-label">
              Tracked vendors
            </h2>
            <span className="ob-label text-[var(--ob-text-4)]">
              Revalidated every 60s
            </span>
          </div>
          <VendorsList />
        </Container>
      </Section>

      <Section tone="base" tight aria-labelledby="method-heading">
        <Container width="narrow">
          <h2 id="method-heading" className="ob-h3 mb-8">
            How to read this index
          </h2>
          <dl className="flex flex-col">
            {[
              [
                'Last observed',
                'The timestamp of the most recent completed probe against the vendor endpoint. It reports the freshness of the record, not the health of the service.',
              ],
              [
                'No status column',
                'The catalog endpoint returns vendor identity and observation time. A health verdict requires the per-vendor record, so open a vendor to see availability and incident history rather than inferring it here.',
              ],
              [
                'Independence',
                'Every figure originates from a RELIASTRA probe. Vendor status pages are referenced in the per-vendor view for comparison, never used as the measurement.',
              ],
              [
                'Scope',
                'Public endpoints only. Customer endpoints, credentials and private dependency graphs never appear on a public surface.',
              ],
            ].map(([term, body]) => (
              <div
                key={term}
                className="grid gap-2 border-t border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(140px,190px)_1fr] sm:gap-8"
              >
                <dt className="ob-label pt-1">{term}</dt>
                <dd className="max-w-[62ch] text-[14.5px] leading-[1.68] text-[var(--ob-text-2)]">
                  {body}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </Section>

      <Section tone="void" tight>
        <Container width="narrow">
          <PreferredSourceSection variant="vendor" />
        </Container>
      </Section>

      <Section tone="base" tight aria-labelledby="track-cta">
        <Container width="narrow">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="track-cta" className="ob-h2 max-w-[18ch]">
                Monitor your own dependencies.
              </h2>
              <p className="ob-body max-w-[56ch]">
                This index covers public vendors. RELIASTRA observes the
                specific external services your product calls, correlates their
                failures with your incidents, and generates evidence you can
                take to the vendor.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start free
              </Link>
              <Link
                href={PUBLIC_ROUTES.pricing}
                className="ob-btn ob-btn-outline"
              >
                View pricing
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}
