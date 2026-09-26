import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  readPublicIncident,
  readVendorDetail,
  readVendorPublicIncidents,
  RecordUnreadableError,
  regionsOf,
  type TrackObservedIncidentDetail,
  type TrackPublicIncident,
  type TrackVendorDetail,
  type UnreadableReason,
} from '@/lib/track-api';
import {
  duration as fmtDuration,
  INCIDENT_STATUS_LABEL,
  latency,
  NOT_RECORDED,
  SEVERITY_LABEL,
  severityState,
  utcStamp,
  type ObservedState,
} from '@/lib/observatory/format';
import { mergeIncidents, type MergedIncident } from '@/lib/observatory/incidents';
import { breadcrumbJsonLd, canonicalUrl, DISCOVERY_ALTERNATES } from '@/lib/seo';
import { robotsDirective } from '@/lib/indexability';
import { PUBLIC_INCIDENT_WINDOW_DAYS } from '@/lib/methodology';
import { JsonLd } from '@/components/seo/json-ld';
import {
  PUBLIC_ROUTES,
  SHARE_ROUTES,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
import { Breadcrumb } from '@/components/site/primitives';
import { ObservedIncidentRecord } from '@/components/observatory/observed-incident-record';
import {
  Notice,
  ObservatoryShell,
  RecordSection,
  SpecRow,
  StateWord,
} from '@/components/observatory/primitives';
import { EvidenceRequest } from '@/components/observatory/evidence-request';

/**
 * A published public incident record.
 *
 * This page renders if and only if the incident appears in the measurement
 * API's published-incident set for this dependency
 * (`GET /v1/vendors/{name}/incidents/public`). There is no seeded example, no
 * placeholder incident, and no incident inferred from an outside report: an
 * incident RELIASTRA did not measure has no page here, full stop. The route is
 * live so that when the first measured incident is published it lands on a
 * stable URL immediately, linked from the vendor record, the vendor index, and
 * the sitemap.
 *
 * How long it stays published is a backend property, not a claim this page
 * gets to make: the published set covers
 * `settings.PUBLIC_INCIDENT_WINDOW_DAYS` of incident history, aligned to the
 * evidence-retention period the API documents. Once a record leaves that
 * window this URL 404s, so nothing here or in `llms.txt` describes these pages
 * as permanent.
 *
 * Response contract (the reason this page has four outcomes instead of two):
 * published incident -> 200 `index`; dependency or incident absent -> 404
 * `noindex`; measurement API did not answer -> throw, so the vendor segment's
 * error boundary returns a 5xx and the URL stays indexed for retry. A timeout
 * must never be able to withdraw a published record from the index.
 *
 * What is rendered: the incident's own stored fields, the observation scope of
 * the vendor record it belongs to, and - as on every observatory page - the
 * distinction between what was measured and what is simply not present.
 */

interface PageProps {
  params: Promise<{ vendor: string; id: string }>;
}

export const revalidate = 300;

/**
 * Four outcomes, because they are not the same statement:
 *
 *  - `ok`              the incident is in the published set. Render it.
 *  - `vendor-missing`  the API answered 404 for the dependency itself, so no
 *                      incident of its can have a page. 404, `noindex`.
 *  - `incident-missing` the dependency is readable and this incident is not in
 *                      its published set. 404, `noindex`.
 *  - `unreadable`      the API did not answer. Existence is unknown: 5xx so a
 *                      crawler retries, and never `noindex`.
 *
 * The previous shape collapsed the last case into the second and third: a
 * timeout returned `null`, which rendered a 200 "record unavailable" page and
 * emitted `noindex` on a URL that is in the sitemap and described as a
 * permanent public record.
 */
type IncidentLoad =
  | {
      kind: 'ok';
      detail: TrackVendorDetail;
      incident: MergedIncident;
      publicRecord: TrackPublicIncident | null;
      merged: MergedIncident[];
    }
  /**
   * A detector-derived public incident: confirmed by RELIASTRA's own probes
   * but carrying no evidence publication. It gets the same stable URL terms
   * as an evidence-published record, rendered from the measurement claim.
   */
  | { kind: 'observed'; detail: TrackVendorDetail; incident: TrackObservedIncidentDetail }
  | { kind: 'vendor-missing' }
  | { kind: 'incident-missing' }
  | { kind: 'unreadable'; reason: UnreadableReason };

async function load(vendor: string, id: string): Promise<IncidentLoad> {
  const detailRead = await readVendorDetail(vendor);
  if (detailRead.kind === 'missing') return { kind: 'vendor-missing' };
  if (detailRead.kind === 'unreadable') {
    return { kind: 'unreadable', reason: detailRead.reason };
  }
  const detail = detailRead.value;

  const publishedRead = await readVendorPublicIncidents(vendor);
  if (publishedRead.kind === 'missing') return { kind: 'incident-missing' };
  if (publishedRead.kind === 'unreadable') {
    return { kind: 'unreadable', reason: publishedRead.reason };
  }

  const published = publishedRead.value;
  const merged = mergeIncidents(null, published);
  const incident = merged.find((m) => m.incident_id === id) ?? null;

  if (!incident) {
    /**
     * Not an evidence-published incident - it may still be an incident
     * RELIASTRA's public detector confirmed (the newer canonical source).
     * Read it by id from the public incident API; the read is throttled the
     * same way, so a probe of unknown ids costs what a published one costs.
     */
    const observedRead = await readPublicIncident(id);
    if (observedRead.kind === 'missing') return { kind: 'incident-missing' };
    if (observedRead.kind === 'unreadable') {
      return { kind: 'unreadable', reason: observedRead.reason };
    }
    const observed = observedRead.value;
    /**
     * The vendor slug is part of the URL identity. An incident id that
     * resolves to a different vendor on this path is a 404, not a redirect
     * (the path simply does not name that record). The slug comparison is
     * case-insensitive only because URLs can arrive in any casing.
     */
    if (observed.vendor_name.toLowerCase() !== vendor.toLowerCase()) {
      return { kind: 'incident-missing' };
    }
    return { kind: 'observed', detail, incident: observed };
  }

  const publicRecord: TrackPublicIncident | null =
    published.find((p) => p.incident_id === id) ?? null;

  return { kind: 'ok', detail, incident, publicRecord, merged };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vendor, id } = await params;
  const path = SHARE_ROUTES.observatoryIncident(vendor, id);
  const url = canonicalUrl(path);

  const loaded = await load(vendor, id);

  /**
   * The API did not answer, so whether this incident exists is unknown. The
   * URL keeps its indexability and the body throws for a 5xx. `noindex` here
   * would withdraw a published, sitemap-listed record on the strength of a
   * timeout - and a withdrawn URL that later returns is a re-crawl the site
   * has to earn back.
   */
  if (loaded.kind === 'unreadable') {
    return {
      title: 'Incident record - RELIASTRA observatory',
      alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
      robots: robotsDirective({ index: true, follow: true }),
    };
  }

  /** Either the dependency or the incident is absent. The body 404s to match. */
  if (loaded.kind !== 'ok' && loaded.kind !== 'observed') {
    return {
      title: 'Incident record - RELIASTRA observatory',
      alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
      robots: robotsDirective({ index: false, follow: true }),
    };
  }

  if (loaded.kind === 'observed') {
    const { detail: observedDetail, incident: observedIncident } = loaded;
    const target = observedIncident.target_name ?? observedIncident.endpoint_url;
    const title = `${target} failure window - ${observedDetail.display_name} observed incident (RELIASTRA)`;
    const description =
      `RELIASTRA observed a failure window against ${target} for ` +
      `${observedDetail.display_name}: opened ${utcStamp(observedIncident.started_at) ?? 'not recorded'}, ` +
      `${observedIncident.resolved_at ? `resolved ${utcStamp(observedIncident.resolved_at)}` : 'open at last read'}, ` +
      `measured from ${observedIncident.region}. The published detection rule, the observed ` +
      `status codes and the exact claim - with what it does not establish.`;
    return {
      title,
      description,
      alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
      robots: robotsDirective({ index: true, follow: true }),
      openGraph: {
        title,
        description,
        url,
        type: 'article',
        siteName: 'RELIASTRA',
      },
    };
  }

  const { detail, incident } = loaded;
  const title = `${incident.title} - ${detail.display_name} incident record (RELIASTRA)`;
  const description =
    `RELIASTRA public incident record for ${detail.display_name}: opened ` +
    `${utcStamp(incident.started_at) ?? 'not recorded'}, ` +
    `${incident.resolved_at ? `resolved ${utcStamp(incident.resolved_at)}` : 'open at last read'}. ` +
    `Measured endpoint observations, published evidence where released, and explicit limits.`;

  return {
    title,
    description,
    alternates: { canonical: url, ...DISCOVERY_ALTERNATES },
    robots: robotsDirective({ index: true, follow: true }),
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      siteName: 'RELIASTRA',
      images: [
        {
          url: '/opengraph-image.png',
          width: 1584,
          height: 396,
          alt: `RELIASTRA incident record for ${detail.display_name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image.png'],
    },
  };
}

export default async function IncidentRecordPage({ params }: PageProps) {
  const { vendor, id } = await params;
  const loaded = await load(vendor, id);

  /**
   * Existence unknown. Throwing is the response: the nearest error boundary
   * (`observatory/[vendor]/error.tsx`) renders it as a 5xx, which is what tells
   * a crawler to retry, and under ISR the last good render keeps serving.
   */
  if (loaded.kind === 'unreadable') {
    throw new RecordUnreadableError(
      loaded.reason,
      `/vendors/${vendor}/incidents/public`
    );
  }

  /** The dependency or the incident is absent: a real 404, not a soft one. */
  if (loaded.kind !== 'ok' && loaded.kind !== 'observed') notFound();

  /**
   * Detector-derived record: the same stable URL, rendered from the
   * measurement claim itself. Distinct component so an observed record can
   * never accidentally wear evidence-published language.
   */
  if (loaded.kind === 'observed') {
    return <ObservedIncidentRecord detail={loaded.detail} incident={loaded.incident} />;
  }

  const { detail, incident, publicRecord } = loaded;

  const path = SHARE_ROUTES.observatoryIncident(detail.vendor_name, incident.incident_id);
  const regions = regionsOf(detail);
  const endpointHost = (() => {
    try {
      return new URL(detail.endpoints?.[0]?.endpoint_url ?? '').host;
    } catch {
      return null;
    }
  })();

  const statusWord = INCIDENT_STATUS_LABEL[incident.status.toLowerCase()] ?? incident.status;
  const stateWord = (
    incident.status.toLowerCase() === 'resolved'
      ? 'Resolved'
      : incident.status.toLowerCase() === 'false_positive'
        ? 'Withdrawn'
        : 'Open'
  ) as string;
  const sev = SEVERITY_LABEL[incident.severity.toLowerCase()] ?? incident.severity;

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.observatory },
            { name: detail.display_name, path: SHARE_ROUTES.observatoryVendor(detail.vendor_name) },
            { name: incident.title, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(path),
            url: canonicalUrl(path),
            name: `${incident.title} - ${detail.display_name} incident record`,
            isPartOf: { '@id': canonicalUrl(SHARE_ROUTES.observatoryVendor(detail.vendor_name)) },
            inLanguage: 'en',
            datePublished: incident.started_at,
            ...(incident.resolved_at ? { dateModified: incident.resolved_at } : {}),
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.observatory },
              { name: detail.display_name, href: SHARE_ROUTES.observatoryVendor(detail.vendor_name) },
              { name: 'Incident', href: path },
            ]}
          />
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-10 pt-10 md:pb-12 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">Public incident record</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>Incident {incident.incident_id}</span>
          </p>
          <h1 className="ob-h1 mt-6 max-w-[24ch]">{incident.title}</h1>
          <p className="obs-descriptor mt-5 max-w-[68ch]">
            {detail.display_name} - dependency record{' '}
            <Link href={SHARE_ROUTES.observatoryVendor(detail.vendor_name)} className="ob-link">
              /{detail.vendor_name}
            </Link>
            {endpointHost ? `, observed endpoint ${endpointHost}` : ''}.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--ob-line-2)] pt-5">
            <StateWord
              state={
                (incident.status.toLowerCase() === 'resolved'
                  ? 'healthy'
                  : incident.status.toLowerCase() === 'false_positive'
                    ? 'unknown'
                    : severityState(incident.severity)) as ObservedState
              }
              word={stateWord}
              size="sm"
            />
            <span className="ob-label">Severity: {sev}</span>
            <span className="ob-label">Status: {statusWord}</span>
          </div>
        </div>
      </header>

      <RecordSection
        index="01"
        id="window"
        tone="base"
        title="Incident window"
        note="Every timestamp below is the stored record's own field, printed in UTC. An absent field reads “not recorded” - it was never measured or never published, and this page does not infer it."
      >
        <dl className="flex flex-col">
          <SpecRow term="Opened" wide>
            {utcStamp(incident.started_at) ?? NOT_RECORDED}
          </SpecRow>
          <SpecRow term="Recovered" wide>
            {incident.resolved_at ? (
              utcStamp(incident.resolved_at)
            ) : (
              <span className="obs-void">{NOT_RECORDED} - open at last read</span>
            )}
          </SpecRow>
          <SpecRow term="Duration" wide>
            {incident.durationSeconds != null
              ? `${fmtDuration(incident.durationSeconds)} (from the stored window)`
              : NOT_RECORDED}
          </SpecRow>
          <SpecRow term="Downtime share" wide>
            {publicRecord?.downtime_percentage != null
              ? `${publicRecord.downtime_percentage.toFixed(2)}% of the window`
              : NOT_RECORDED}
          </SpecRow>
          <SpecRow term="Peak latency" wide>
            {publicRecord?.max_latency_ms != null
              ? `${latency(publicRecord.max_latency_ms)} ms`
              : NOT_RECORDED}
          </SpecRow>
          <SpecRow term="Observation scope" wide>
            {regions.length
              ? `Stored observations for this dependency are produced from: ${regions.join(', ')}.`
              : 'No observation regions are declared on the current endpoint configuration.'}{' '}
            Per-region failure attribution inside the incident window is only
            as granular as the origins that were running.
          </SpecRow>
        </dl>
      </RecordSection>

      <RecordSection
        index="02"
        id="measured"
        title="What RELIASTRA measured"
        note="The published incident record's own fields, read off the measurement API."
      >
        <p className="ob-body max-w-[76ch]">
          RELIASTRA lists an incident on the public channel when an organisation monitoring{' '}
          {detail.display_name} publishes its evidence report for a measured failure window. The
          report binds per-region observations, status codes, latency, timestamps and the
          detection rule that opened the incident into one checksummed artifact; this page is the
          public index entry for that artifact, not the artifact itself.
        </p>
        {publicRecord?.has_evidence_report ? (
          <div className="mt-8 border-t border-[var(--ob-line)] pt-6">
            <EvidenceRequest
              incidentId={publicRecord.incident_id}
              vendorName={detail.vendor_name}
              incidentTitle={publicRecord.title || incident.title}
            />
          </div>
        ) : (
          <Notice title="No released artifact yet">
            This incident has no evidence report released to the public channel, so the
            underlying observations remain in the account that collected them. The window above is
            the published index data.
          </Notice>
        )}
      </RecordSection>

      <RecordSection
        index="03"
        id="not-established"
        tone="base"
        title="What this record does not establish"
        note={`A published record includes the boundaries of its own claims. This page is published for ${PUBLIC_INCIDENT_WINDOW_DAYS} days after the incident opened - the window the public evidence channel retains - after which this URL stops resolving.`}
      >
        <dl className="flex flex-col">
          <SpecRow term="Causation" wide>
            Not established. RELIASTRA correlates the incident window with dependency behaviour
            and states confidence levels; it does not certify why anything failed.
          </SpecRow>
          <SpecRow term="Vendor acknowledgement" wide>
            {detail.display_name} may have recorded this window differently, later, or not at all.
            RELIASTRA does not ingest, mirror or reconcile vendor-reported status, so no
            reconciliation is offered here either way.
          </SpecRow>
          <SpecRow term="Complete impact" wide>
            The incident describes the observed endpoint from the observed origins. Customer impact
            beyond that surface - your requests, your regions, your integrations - is outside this
            record.
          </SpecRow>
          <SpecRow term="Field completeness" wide>
            Fields the API does not carry (affected-region lists, per-error counts) print as “not
            recorded” on this page rather than being reconstructed from public reports.
          </SpecRow>
        </dl>
      </RecordSection>

      <RecordSection
        index="04"
        id="context"
        title="Where this fits"
      >
        <ul className="flex flex-col">
          {[
            {
              href: SHARE_ROUTES.observatoryVendor(detail.vendor_name),
              label: `${detail.display_name} - current record`,
              kind: 'Live observatory',
            },
            {
              href: researchRoute('how-reliastra-measures-vendor-reliability'),
              label: 'How RELIASTRA measures vendor reliability',
              kind: 'Methodology',
            },
            {
              href: PUBLIC_ROUTES.productEvidence,
              label: 'What an evidence record contains',
              kind: 'Product',
            },
            ...(detail.category === 'ai'
              ? [
                  {
                    href: researchHubRoute('ai-infrastructure'),
                    label: 'AI infrastructure hub',
                    kind: 'Research',
                  },
                ]
              : []),
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex items-baseline justify-between gap-6 border-t border-[var(--ob-line)] py-3 first:border-t-0"
              >
                <span className="text-[14px] text-[var(--ob-text)] transition-colors hover:text-[var(--ob-signal)]">
                  {l.label}
                </span>
                <span className="ob-label">{l.kind}</span>
              </Link>
            </li>
          ))}
        </ul>
      </RecordSection>
    </ObservatoryShell>
  );
}


