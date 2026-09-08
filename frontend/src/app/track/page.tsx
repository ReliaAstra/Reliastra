import type { Metadata } from 'next';
import Link from 'next/link';

import {
  fetchTrackedVendors,
  fetchVendorDetail,
  regionsOf,
  type TrackVendorDetail,
  type TrackVendorListItem,
} from '@/lib/track-api';
import { deriveState, NO_OBSERVATION, utcStamp, elapsed } from '@/lib/observatory/format';
import { canonicalUrl, breadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';
import { PreferredSourceSection } from '@/components/seo/preferred-source';
import { AUTH_ROUTES, PUBLIC_ROUTES, RESEARCH_ARTICLES, SHARE_ROUTES, researchRoute } from '@/lib/routes';
import { Breadcrumb } from '@/components/site/primitives';
import {
  Notice,
  ObservatoryShell,
  RecordSection,
  RecordTable,
  SpecRow,
  StateWord,
  Value,
  type RecordColumn,
} from '@/components/observatory/primitives';

/**
 * The observatory index.
 *
 * The catalog endpoint returns identity and observation time only - no health
 * verdict - so the index resolves each entry's state from the per-vendor
 * detail endpoint (which derives it from the five most recent observations)
 * rather than printing a green dot next to every row. Resolution is capped, in
 * order, and failures degrade to "not read" rather than to "operational".
 */

export const metadata: Metadata = {
  title: 'Public infrastructure observatory - independently measured dependency records',
  description:
    'Independent, multi-region observation of the third-party APIs modern products depend on. Availability, latency and incident history measured by RELIASTRA probes, not self-reported by the vendor.',
  alternates: { canonical: canonicalUrl(PUBLIC_ROUTES.track) },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Public infrastructure observatory - RELIASTRA',
    description:
      'Independent, multi-region records for third-party APIs. Measured, not self-reported.',
    url: canonicalUrl(PUBLIC_ROUTES.track),
    type: 'website',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'RELIASTRA public infrastructure observatory',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Public infrastructure observatory - RELIASTRA',
    description: 'Independent availability, latency and incident history for third-party APIs.',
    images: ['/opengraph-image.png'],
  },
};

export const revalidate = 60;

/** How many catalog entries get their state resolved on this page. */
const RESOLVE_LIMIT = 24;

interface CatalogRow {
  item: TrackVendorListItem;
  detail: TrackVendorDetail | null;
  /** False when the detail endpoint did not answer for this entry. */
  read: boolean;
}

export default async function ObservatoryIndexPage() {
  let page: Awaited<ReturnType<typeof fetchTrackedVendors>> | null = null;
  let failed = false;
  try {
    page = await fetchTrackedVendors();
  } catch {
    failed = true;
  }

  const items = page?.items ?? [];

  const rows: CatalogRow[] = await Promise.all(
    items.map(async (item, i) => {
      if (i >= RESOLVE_LIMIT) return { item, detail: null, read: true };
      try {
        const detail = await fetchVendorDetail(item.vendor_name);
        return { item, detail, read: detail !== null };
      } catch {
        return { item, detail: null, read: false };
      }
    })
  );

  const observedTimes = items
    .map((v) => v.last_check_at)
    .filter((t): t is string => !!t)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  const freshest = observedTimes[0] ?? null;
  const categories = new Set(items.map((v) => v.category)).size;
  const regionSet = new Set<string>();
  for (const r of rows) if (r.detail) for (const g of regionsOf(r.detail)) regionSet.add(g);

  const columns: RecordColumn<CatalogRow>[] = [
    {
      key: 'name',
      head: 'Dependency',
      width: 'minmax(0,1fr)',
      mobile: 'lead',
      cell: (r) => (
        <span className="text-[14.5px] font-medium tracking-[-0.01em] text-[var(--ob-text)]">
          {r.item.display_name}
        </span>
      ),
    },
    {
      key: 'category',
      head: 'Category',
      width: 'minmax(0,150px)',
      cell: (r) => (
        <span className="text-[13px] text-[var(--ob-text-3)]">
          {r.item.category.replace(/[-_]/g, ' ')}
        </span>
      ),
    },
    {
      key: 'state',
      head: 'Observed state',
      width: 'minmax(0,190px)',
      mobile: 'trail',
      cell: (r) => {
        if (!r.read) return <span className="obs-void text-[13px]">not read</span>;
        if (!r.detail) return <span className="obs-void text-[13px]">not resolved</span>;
        const v = deriveState(r.detail.recent_status, null);
        return <StateWord size="sm" state={v.state} word={v.word} />;
      },
    },
    {
      key: 'regions',
      head: 'Regions',
      width: 'minmax(0,110px)',
      align: 'right',
      cell: (r) =>
        r.detail ? (
          <Value>{String(regionsOf(r.detail).length)}</Value>
        ) : (
          <span className="obs-void text-[13px]">none</span>
        ),
    },
    {
      key: 'observed',
      head: 'Last observation',
      width: 'minmax(0,180px)',
      align: 'right',
      cell: (r) => (
        <Value>{r.item.last_check_at ? `${elapsed(r.item.last_check_at)} ago` : NO_OBSERVATION}</Value>
      ),
    },
  ];

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.track },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.track),
            url: canonicalUrl(PUBLIC_ROUTES.track),
            name: 'Public infrastructure observatory',
            description:
              'Independent, multi-region observation of third-party APIs: availability, latency and incident history.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
            hasPart: items.slice(0, 20).map((v) => ({
              '@type': 'WebPage',
              name: `${v.display_name} reliability record`,
              url: canonicalUrl(SHARE_ROUTES.trackVendor(v.vendor_name)),
            })),
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.track },
            ]}
          />
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-12 pt-10 md:pb-16 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">Public infrastructure observatory</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>Open record · no account required</span>
          </p>
          <h1 className="obs-name mt-6 max-w-[15ch]">Dependency records</h1>
          <p className="obs-descriptor mt-6 max-w-[62ch]">
            Independent observations of public third-party APIs. Nothing is read from a vendor
            status page.
          </p>

          <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-[var(--ob-line-2)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <IndexFact term="Dependencies under observation">
              {items.length ? String(items.length) : '0'}
            </IndexFact>
            <IndexFact term="Categories">{categories ? String(categories) : '0'}</IndexFact>
            <IndexFact term="Observation regions in use">
              {regionSet.size ? [...regionSet].sort().join(' · ') : 'none'}
            </IndexFact>
            <IndexFact term="Most recent observation">
              {freshest ? utcStamp(freshest) : NO_OBSERVATION}
            </IndexFact>
          </dl>
        </div>
      </header>

      <RecordSection
        index="01"
        id="catalog"
        tone="base"
        title="Dependencies under observation"
        note={
          <>
            State is resolved from the five most recent observations. Entries beyond the first{' '}
            {RESOLVE_LIMIT} are listed without a state.
          </>
        }
        aside={<span className="ob-label md:text-right">Revalidated every 60 seconds</span>}
      >
        {failed ? (
          <Notice kind="error" title="Measurement network unreachable">
            The catalog could not be retrieved. No cached list is shown.
          </Notice>
        ) : rows.length ? (
          <RecordTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.item.id}
            rowHref={(r) => SHARE_ROUTES.trackVendor(r.item.vendor_name)}
            caption={`${items.length} dependency record${items.length === 1 ? '' : 's'} in the public catalog. Times are relative to the most recent completed observation; open a record for exact UTC timestamps.`}
          />
        ) : (
          <Notice title="No public dependency records yet">
            Records appear once public APIs are under observation.
          </Notice>
        )}
      </RecordSection>

      <RecordSection
        index="02"
        id="reading"
        title="How to read this index"
        note="What each column means."
      >
        <dl className="flex flex-col">
          <SpecRow term="Observed state" wide>
            From the five most recent observations: responding when all five returned a valid
            response, degraded when any did not.
          </SpecRow>
          <SpecRow term="Last observation" wide>
            The most recent completed check. Freshness, not health.
          </SpecRow>
          <SpecRow term="Regions" wide>
            Observation regions scheduled for the dependency. Two are required before an incident
            is opened.
          </SpecRow>
          <SpecRow term="Independence" wide>
            Every figure originates from a RELIASTRA probe. Vendor status pages are not ingested.
          </SpecRow>
          <SpecRow term="Scope" wide>
            Public endpoints only. Customer endpoints and credentials never appear here.
          </SpecRow>
        </dl>
        <p className="ob-small mt-8">
          Method:{' '}
          <Link href={researchRoute('how-reliastra-measures-vendor-reliability')} className="ob-link">
            {RESEARCH_ARTICLES[1].title}
          </Link>
          .
        </p>
      </RecordSection>

      <RecordSection
        index="03"
        id="preferred-source"
        tone="base"
        title="Follow the record"
        note="The record updates whether or not anyone is watching it."
      >
        <PreferredSourceSection variant="vendor" />
      </RecordSection>

      <section className="obs-section bg-[var(--ob-void)]" aria-labelledby="index-cta">
        <div className="ob-container py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end lg:gap-16">
            <div className="flex flex-col gap-5">
              <p className="ob-label obs-label-signal">Your own record</p>
              <h2 id="index-cta" className="ob-h2 max-w-[20ch]">
                Your product depends on a specific list.
              </h2>
              <p className="ob-body max-w-[58ch]">
                Observe the services your product calls. Attribute incidents. Keep the record.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                  Start monitoring
                </Link>
                <Link href={PUBLIC_ROUTES.pricing} className="ob-btn ob-btn-outline">
                  View pricing
                </Link>
              </div>
              <p className="ob-small">
                Or read{' '}
                <Link href={PUBLIC_ROUTES.dependencyMonitoring} className="ob-link">
                  how dependency monitoring works
                </Link>{' '}
                first.
              </p>
            </div>
          </div>
        </div>
      </section>
    </ObservatoryShell>
  );
}

function IndexFact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="ob-label">{term}</dt>
      <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}
