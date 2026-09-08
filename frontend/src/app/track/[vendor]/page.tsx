import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  DEFAULT_WINDOW,
  fetchTrackedVendors,
  fetchVendorDetail,
  fetchVendorRecord,
  isTrackWindow,
  regionsOf,
  TELEMETRY_RANGES,
  type TrackVendorListItem,
  type TrackWindow,
} from '@/lib/track-api';
import {
  availability,
  deriveState,
  latency,
  NO_OBSERVATION,
  utcStamp,
  windowLabel,
} from '@/lib/observatory/format';
import { canonicalUrl, breadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';
import { PUBLIC_ROUTES, SHARE_ROUTES } from '@/lib/routes';
import { Breadcrumb } from '@/components/site/primitives';
import { ObservatoryShell, RecordSection } from '@/components/observatory/primitives';
import {
  CurrentObservationSection,
  DependencyInfoSection,
  EvidenceSection,
  IncidentsSection,
  Masthead,
  MethodologySection,
  NetworkSection,
  RecordCTA,
  RecordUnavailable,
  RelatedSection,
  StateSection,
} from '@/components/observatory/record-sections';
import { mergeIncidents } from '@/lib/observatory/incidents';
import {
  TelemetryControls,
  TelemetryPanel,
  TelemetrySkeleton,
} from '@/components/observatory/telemetry-panel';

/**
 * The public record for one observed dependency.
 *
 * Composition notes:
 *  - Server-rendered end to end. The only client code is the elapsed-time
 *    readout, the chart cursor and the evidence request form; all three
 *    hydrate around content that is already in the HTML.
 *  - The telemetry series lives in its own Suspense boundary keyed by
 *    window+region, so switching range streams a new chart into a page that
 *    never unmounts.
 *  - Range and region are URL state, which makes every view of this record a
 *    shareable and crawlable address.
 */

export const revalidate = 60;

interface PageProps {
  params: Promise<{ vendor: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/* ── Metadata ───────────────────────────────────────────────────────────── */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vendor } = await params;
  let detail: Awaited<ReturnType<typeof fetchVendorDetail>> = null;
  try {
    detail = await fetchVendorDetail(vendor);
  } catch {
    detail = null;
  }

  const path = SHARE_ROUTES.trackVendor(vendor);
  const url = canonicalUrl(path);

  if (!detail) {
    return {
      title: 'Dependency record - RELIASTRA observatory',
      description:
        'Independently measured availability, latency and incident history for third-party APIs.',
      alternates: { canonical: url },
      robots: { index: false, follow: true },
    };
  }

  const name = detail.display_name;
  const regions = regionsOf(detail);
  const title = `${name} status and reliability record - independently measured`;
  const description =
    `Independent observation of ${name}. Availability, latency, incident history ` +
    `and published evidence measured by RELIASTRA probes` +
    (regions.length ? ` from ${regions.join(', ')}` : '') +
    `, not taken from ${name}'s status page.`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    keywords: [
      `${name} status`,
      `${name} outage`,
      `${name} api latency`,
      `${name} uptime`,
      'independent monitoring',
      'external dependency intelligence',
    ],
    openGraph: {
      title: `${name} - independently measured reliability record`,
      description,
      url,
      type: 'article',
      images: [
        {
          url: '/opengraph-image.png',
          width: 1200,
          height: 630,
          alt: `RELIASTRA observation record for ${name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} - independently measured reliability record`,
      description,
      images: ['/opengraph-image.png'],
    },
  };
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default async function VendorRecordPage({ params, searchParams }: PageProps) {
  const { vendor } = await params;
  const sp = await searchParams;

  const windowParam = one(sp.window);
  const win: TrackWindow =
    isTrackWindow(windowParam) && TELEMETRY_RANGES.includes(windowParam)
      ? windowParam
      : DEFAULT_WINDOW;

  let record;
  try {
    record = await fetchVendorRecord(vendor);
  } catch {
    return (
      <ObservatoryShell>
        <RecordUnavailable vendorName={vendor} />
      </ObservatoryShell>
    );
  }

  if (!record) notFound();

  const { detail, regions } = record;

  // The API defaults the timeline to us-east-1. If this dependency is not
  // observed from there, defaulting would draw an empty chart for a vendor
  // that has plenty of data - so the first declared region is used instead.
  const requested = one(sp.region);
  const selectedRegion =
    requested && regions.includes(requested)
      ? requested
      : regions.length && !regions.includes('us-east-1')
        ? regions[0]
        : regions.includes('us-east-1')
          ? 'us-east-1'
          : undefined;

  // The freshest observation across every region, which is what "last
  // observation" means on a multi-region record.
  const observationTimes = [
    detail.last_check_at,
    ...record.regionObservations.map((r) => r.current?.timestamp ?? null),
  ].filter((t): t is string => !!t);
  const lastObservation =
    observationTimes.length > 0
      ? observationTimes.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b))
      : null;

  const freshest =
    record.regionObservations
      .map((r) => r.current)
      .filter((c): c is NonNullable<typeof c> => !!c && !!c.timestamp)
      .sort((a, b) => Date.parse(b.timestamp!) - Date.parse(a.timestamp!))[0] ?? null;

  const verdict = deriveState(detail.recent_status, freshest);

  const cadenceSeconds =
    record.regionObservations.map((r) => r.cadenceSeconds).find((c) => !!c) ?? null;

  const incidents = mergeIncidents(record.incidents, record.publicIncidents);
  const published = (record.publicIncidents ?? []).filter((p) => p.has_evidence_report);

  let catalog: TrackVendorListItem[] = [];
  try {
    catalog = (await fetchTrackedVendors(24)).items;
  } catch {
    catalog = [];
  }

  const m24 = record.metrics?.metrics?.['24h'] ?? null;
  const m30 = record.metrics?.metrics?.['30d'] ?? null;
  const basePath = SHARE_ROUTES.trackVendor(detail.vendor_name);

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.track },
            { name: detail.display_name, path: basePath },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'Dataset',
            '@id': `${canonicalUrl(basePath)}#dataset`,
            name: `${detail.display_name} availability and latency observations`,
            description: `Independent observations of ${detail.display_name}'s public endpoints: availability, response latency and incident history measured by RELIASTRA.`,
            url: canonicalUrl(basePath),
            license: canonicalUrl(PUBLIC_ROUTES.terms),
            isAccessibleForFree: true,
            creator: { '@type': 'Organization', name: 'RELIASTRA', url: canonicalUrl('/') },
            spatialCoverage: regions.length ? regions.join(', ') : undefined,
            variableMeasured: [
              { '@type': 'PropertyValue', name: 'Availability', unitText: 'percent' },
              { '@type': 'PropertyValue', name: 'Response latency', unitText: 'ms' },
            ],
            dateModified: lastObservation ?? undefined,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(basePath),
            url: canonicalUrl(basePath),
            name: `${detail.display_name} reliability record`,
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
            about: { '@type': 'Thing', name: detail.display_name },
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.track },
              { name: detail.display_name, href: basePath },
            ]}
          />
        </div>
      </div>

      <Masthead
        record={record}
        verdict={verdict}
        lastObservation={lastObservation}
        cadenceSeconds={cadenceSeconds}
      />

      {/* Crawlable summary, composed from the record. Visually hidden: every
          figure in it is already on screen in the masthead and sections 01-02,
          and printing it twice made the page read like a brochure. */}
      <section aria-labelledby="summary-h" className="sr-only">
        <div>
          <h2 id="summary-h">Summary of this record</h2>
          <div>
            <p>
              {detail.display_name} is a {detail.category.replace(/[-_]/g, ' ')} dependency under
              continuous observation by RELIASTRA. Requests are issued to its public endpoints from{' '}
              {regions.length ? regions.join(', ') : 'RELIASTRA observation regions'}
              {cadenceSeconds ? ` about every ${cadenceSeconds} seconds per region` : ''}, and every
              response is stored with its latency, status code and timestamp. The last observation
              recorded was {utcStamp(lastObservation) ?? NO_OBSERVATION}.
            </p>
            <p>
              Over the last 24 hours RELIASTRA recorded{' '}
              {m24 ? m24.total_observations.toLocaleString('en-US') : 'no'} observations, an
              availability of {availability(m24?.uptime_percentage, m24?.total_observations)} and a
              mean response of {latency(m24?.avg_latency_ms)} ms; over 30 days,{' '}
              {availability(m30?.uptime_percentage, m30?.total_observations)}.{' '}
              {incidents.length
                ? `${incidents.length} incident record${incidents.length === 1 ? '' : 's'} ${
                    incidents.length === 1 ? 'has' : 'have'
                  } been opened against this dependency, ${
                    published.length ? `${published.length} with published evidence.` : 'none with published evidence yet.'
                  }`
                : 'No public incident records are available.'}{' '}
              Availability, latency and incident history below are measured, not reported by the
              vendor.
            </p>
          </div>
        </div>
      </section>

      <CurrentObservationSection record={record} />

      <StateSection record={record} verdict={verdict} lastObservation={lastObservation} />

      <RecordSection
        index="03"
        id="telemetry"
        title="Historical telemetry"
        note={
          <>
            Every point is the mean latency of the observations inside one bucket, at the
            resolution the measurement API aggregates to for the selected range. Failed buckets
            break the line; incident windows are shaded. Ranges are limited to the windows the API
            can aggregate.
          </>
        }
        aside={
          <TelemetryControls
            basePath={basePath}
            window={win}
            region={selectedRegion}
            regions={regions}
          />
        }
      >
        <Suspense key={`${win}:${selectedRegion ?? 'default'}`} fallback={<TelemetrySkeleton />}>
          <TelemetryPanel
            vendor={detail.vendor_name}
            window={win}
            region={selectedRegion}
            metrics={record.metrics}
            publicIncidents={record.publicIncidents}
          />
        </Suspense>
        <p className="ob-small mt-6">
          Viewing {windowLabel(win)}
          {selectedRegion ? ` from ${selectedRegion}` : ''}. Other ranges:{' '}
          {TELEMETRY_RANGES.filter((r) => r !== win).map((r, i, arr) => (
            <span key={r}>
              <Link
                href={`${basePath}?window=${r}${selectedRegion ? `&region=${selectedRegion}` : ''}#telemetry`}
                className="ob-link"
              >
                {windowLabel(r)}
              </Link>
              {i < arr.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
      </RecordSection>

      <NetworkSection record={record} />

      <IncidentsSection
        incidents={incidents}
        unavailable={record.incidents === null && record.publicIncidents === null}
        vendorName={detail.display_name}
      />

      <EvidenceSection
        published={published}
        vendorName={detail.vendor_name}
        unavailable={record.publicIncidents === null}
      />

      <MethodologySection record={record} cadenceSeconds={cadenceSeconds} />

      <DependencyInfoSection record={record} />

      <RelatedSection vendors={catalog} currentVendor={detail.vendor_name} />

      <RecordCTA vendorName={detail.display_name} />
    </ObservatoryShell>
  );
}
