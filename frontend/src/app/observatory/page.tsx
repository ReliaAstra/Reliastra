import type { Metadata } from 'next';
import Link from 'next/link';

import {
  fetchTrackedVendorsAll,
  readCategories,
  type TrackVendorListItem,
} from '@/lib/track-api';
import { deriveState, NO_OBSERVATION, utcStamp, elapsed } from '@/lib/observatory/format';
import { robotsDirective } from '@/lib/indexability';
import { canonicalUrl, breadcrumbJsonLd, DISCOVERY_ALTERNATES } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';
import { PreferredSourceSection } from '@/components/seo/preferred-source';
import {
  AUTH_ROUTES,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  SHARE_ROUTES,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
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
import { renderAtRequestTime } from '@/lib/render-at-request-time';

/**
 * The observatory index.
 *
 * Where each column's data comes from, because the two endpoints do not report
 * the same thing and the copy below has to match the source it actually used:
 *
 *  - Observed state comes from the catalog row itself. The catalog derives
 *    `recent_status` from the most recent observation of the dependency's
 *    primary listed endpoint (`stale` past the API's 15-minute threshold,
 *    `down` on a transport error or missing status code, otherwise
 *    `operational`). It used to come from 24 extra per-vendor detail calls
 *    per render, which was both slow and self-inflicted rate-limit pressure -
 *    and it left every row past the 24th without a state at all.
 *  - Region labels are batch-loaded by the paginated catalog API for every row.
 *
 * Failure behaviour: the catalog is this page's subject. When it cannot be
 * read the page throws, so the segment error boundary returns a 5xx. It does not
 * render an empty index at 200, which a crawler would read as "the observatory
 * has no dependencies".
 *
 * This page renders per request (see `renderAtRequestTime()` below), so there is
 * no stored render to fall back on: an outage means a 5xx until the reads
 * recover, typically within their 60s window. The record pages under it are
 * different - they are prerendered per path and revalidated on an interval, so a
 * failed revalidation leaves the last good render serving while the failure is
 * logged. An outage therefore degrades the index, not the records.
 */

export const metadata: Metadata = {
  title: 'Public infrastructure observatory - independently measured dependency records',
  description:
    'Independent HTTP observation of the public endpoints behind third-party services - availability, latency and incident history measured by RELIASTRA probes, never copied from a vendor status page.',
  alternates: { canonical: canonicalUrl(PUBLIC_ROUTES.observatory), ...DISCOVERY_ALTERNATES },
  robots: robotsDirective({ index: true, follow: true }),
  openGraph: {
    title: 'Public infrastructure observatory - RELIASTRA',
    description:
      'Independent records for third-party APIs. Measured, not self-reported.',
    url: canonicalUrl(PUBLIC_ROUTES.observatory),
    type: 'website',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1584,
        height: 396,
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

/**
 * No route-level `revalidate`: this page renders per request (see `connection()`
 * below) and its reads are cached for 60s by `lib/track-api.ts`, which is where
 * the interval is actually enforced. Declaring it here as well was inert - the
 * audit that prompted this change found `export const revalidate = 60` on a
 * route that could never be statically rendered.
 */


/** Hard bound on the catalog walk: a cursor that never advances must not loop. */
const CATALOG_MAX_PAGES = 10;

interface CatalogRow { item: TrackVendorListItem; }

export default async function ObservatoryIndexPage() {
  // Rendered per request, never baked at build time: the build has no
  // measurement API to read, so a prerender here would either fail the build or
  // cache a failure state and serve it as fact. `lib/render-at-request-time.ts`
  // carries the reasoning, including why this is not `force-dynamic`.
  await renderAtRequestTime();
  /**
   * The whole catalog, walked cursor by cursor.
   *
   * This throws when the catalog cannot be read, which is the intended
   * behaviour: the error boundary turns it into a 5xx, the one response that
   * tells a crawler to come back. A 200 page saying "no public dependency
   * records yet" during an API outage is a false statement about the
   * observatory, and it is indexable.
   */
  const items = await fetchTrackedVendorsAll({
    pageSize: 100,
    maxPages: CATALOG_MAX_PAGES,
  });

  /**
   * The taxonomy, in registry order, for the category directory. Categories
   * are discovery, not the subject of this page: if the taxonomy cannot be
   * read the catalog still renders honestly and the directory section is
   * simply absent, rather than the page pretending categories do not exist.
   */
  const categoriesRead = await readCategories();
  const taxonomy =
    categoriesRead.kind === 'ok' ? categoriesRead.value.categories : null;

  const rows: CatalogRow[] = items.map(item => ({ item }));

  const observedTimes = items
    .map((v) => v.last_check_at)
    .filter((t): t is string => !!t)
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  const freshest = observedTimes[0] ?? null;
  const categories = new Set(items.map((v) => v.category)).size;
  const regionSet = new Set<string>();
  for (const r of rows) for (const g of r.item.regions ?? []) regionSet.add(g);

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
      // Rows link to the vendor record; the category directory further down is
      // where the category itself is a destination. A nested link inside a
      // linked row is invalid HTML, so this cell stays plain text.
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
        // From the catalog row's own `recent_status`: the most recent
        // observation of the dependency's primary listed endpoint. Every row
        // carries it, so no row is printed without a state.
        const v = deriveState(r.item.recent_status, { timestamp: r.item.last_check_at, is_up: r.item.evaluation === 'expected' ? true : r.item.evaluation === 'unexpected' ? false : null, response_received: r.item.response_received, transport_status: r.item.transport_status, status_code: r.item.status_code });
        return <StateWord size="sm" state={v.state} word={v.word} />;
      },
    },
    {
      key: 'regions',
      head: 'Region labels',
      width: 'minmax(0,110px)',
      align: 'right',
      cell: (r) =>
        <Value>{r.item.region_state === 'configured' ? (r.item.regions ?? []).join(' · ') : r.item.region_state === 'unconfigured' ? 'unconfigured' : 'unknown'}</Value>,
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
            { name: 'Observatory', path: PUBLIC_ROUTES.observatory },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.observatory),
            url: canonicalUrl(PUBLIC_ROUTES.observatory),
            name: 'Public infrastructure observatory',
            description:
              'Independent HTTP observation of public third-party endpoints: availability, latency and incident history measured by RELIASTRA probes.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
            hasPart: items.slice(0, 20).map((v) => ({
              '@type': 'WebPage',
              name: `${v.display_name} reliability record`,
              url: canonicalUrl(SHARE_ROUTES.observatoryVendor(v.vendor_name)),
            })),
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.observatory },
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
            RELIASTRA probes public third-party endpoints - today, mostly vendor status sites and
            public health endpoints - and publishes what those probes measured: availability,
            latency and the records an observation produced. Each vendor page states exactly which
            endpoint stands behind its numbers. The status text a vendor publishes is never read,
            mirrored or reconciled; where a vendor page and this record disagree, both are worth
            reading.
          </p>

          <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-[var(--ob-line-2)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <IndexFact term="Dependencies under observation">
              {items.length ? String(items.length) : '0'}
            </IndexFact>
            <IndexFact term="Categories">{categories ? String(categories) : '0'}</IndexFact>
            <IndexFact term="Region labels in use">
              {regionSet.size ? [...regionSet].sort().join(' · ') : rows.every(r => r.item.region_state === 'unconfigured') ? 'unconfigured' : 'unknown'}
            </IndexFact>
            <IndexFact term="Most recent observation">
              {freshest ? utcStamp(freshest) : NO_OBSERVATION}
            </IndexFact>
          </dl>
          <p className="mt-8 border-t border-[var(--ob-line-2)] pt-5 text-[13.5px] text-[var(--ob-text-3)]">
            Failure windows these probes confirmed are published as{' '}
            <Link href={SHARE_ROUTES.observatoryIncidents} className="ob-link">
              observed incident records
            </Link>{' '}
            - searchable across every dependency above.
          </p>
        </div>
      </header>

      <RecordSection
        index="01"
        id="catalog"
        tone="base"
        title="Dependencies under observation"
        note={
          <>
            State is the catalog's own verdict per dependency, derived from the most recent
            observation of its primary listed endpoint. Region labels are endpoint configuration
            and are supplied for every displayed record by the catalog API.
          </>
        }
        aside={<span className="ob-label md:text-right">Revalidated every 60 seconds</span>}
      >
        {rows.length ? (
          <RecordTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.item.id}
            rowHref={(r) => SHARE_ROUTES.observatoryVendor(r.item.vendor_name)}
            caption={`${items.length} dependency record${items.length === 1 ? '' : 's'} in the public catalog. Times are relative to the most recent completed observation; open a record for exact UTC timestamps.`}
          />
        ) : (
          <Notice title="No public dependency records yet">
            Records appear once public APIs are under observation.
          </Notice>
        )}
      </RecordSection>

      {taxonomy && taxonomy.length ? (
        <RecordSection
          index="02"
          id="categories"
          tone="base"
          title="Categories"
          note={
            <>
              The taxonomy groups records by the kind of infrastructure the
              dependency is. A category page enumerates its records with their
              observed states; it never merges unlike endpoints into a single
              figure.
            </>
          }
          aside={<span className="ob-label md:text-right">In taxonomy order</span>}
        >
          <ul className="flex flex-col divide-y divide-[var(--ob-line)]">
            {taxonomy.map((category) => (
              <li key={category.slug}>
                <Link
                  href={SHARE_ROUTES.observatoryCategory(category.slug)}
                  className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4"
                >
                  <span className="text-[15px] font-medium tracking-[-0.01em] text-[var(--ob-text)] group-hover:underline">
                    {category.name}
                  </span>
                  <span className="ob-small mr-2">{category.slug}</span>
                  <span className="ml-auto text-[13px] tabular-nums text-[var(--ob-text-3)]">
                    {category.vendor_count} record{category.vendor_count === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </RecordSection>
      ) : null}

      <RecordSection
        index="03"
        id="reading"
        title="How to read this index"
        note="What each column means."
      >
        <dl className="flex flex-col">
          <SpecRow term="Observed state" wide>
            From the most recent observation of the dependency’s primary listed endpoint:
            responding when it received the expected response, an explicit HTTP status when the response was unexpected, no response for a transport failure, and “not observed recently” when that observation is
            older than the measurement API’s fifteen-minute staleness threshold. The record page
            reports the finer verdict - a roll-up over the five most recent observations across
            every endpoint on the record - so the two can disagree at the margin, and the record
            is the one to read. A state describes the endpoint, not the vendor’s whole service
            estate.
          </SpecRow>
          <SpecRow term="Last observation" wide>
            The most recent completed check. Freshness, not health.
          </SpecRow>
          <SpecRow term="Region labels" wide>
            The region labels scheduled for the dependency, read from the record’s endpoint
            configuration, supplied for every catalog row in one batched read. A label names the worker that ran the probe, and RELIASTRA operates one
            observation point today, so two labels are not two independent origins and nothing
            here is corroboration. Confirmation across genuinely separate sites is a property of
            deployments that have more than one.
          </SpecRow>
          <SpecRow term="Independence" wide>
            Every figure originates from a RELIASTRA probe. The status text on vendor status
            pages is not ingested - where one is listed as an observed endpoint, only its HTTP
            behaviour is measured.
          </SpecRow>
          <SpecRow term="Scope" wide>
            Public endpoints only. Customer endpoints and credentials never appear here. An empty
            incident list is an absence of published records, not proof that no outage occurred.
          </SpecRow>
        </dl>
        <p className="ob-small mt-8">
          Method:{' '}
          <Link href={researchRoute('how-reliastra-measures-vendor-reliability')} className="ob-link">
            {RESEARCH_ARTICLES[1].title}
          </Link>
          . Topic hub:{' '}
          <Link href={researchHubRoute('ai-infrastructure')} className="ob-link">
            AI infrastructure status &amp; reliability
          </Link>
          .
        </p>
      </RecordSection>

      <RecordSection
        index="04"
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
                  Start observing
                </Link>
                <Link href={PUBLIC_ROUTES.pricing} className="ob-btn ob-btn-outline">
                  View pricing
                </Link>
              </div>
              <p className="ob-small">
                Or read{' '}
                <Link href={PUBLIC_ROUTES.product} className="ob-link">
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
