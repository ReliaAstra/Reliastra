import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  fetchVendorDetail,
  fetchVendorIncidents,
  fetchVendorPublicIncidents,
  regionsOf,
  type TrackPublicIncident,
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
import { mergeIncidents } from '@/lib/observatory/incidents';
import { canonicalUrl, breadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';
import {
  PUBLIC_ROUTES,
  SHARE_ROUTES,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
import { Breadcrumb } from '@/components/site/primitives';
import {
  Notice,
  ObservatoryShell,
  RecordSection,
  SpecRow,
  StateWord,
} from '@/components/observatory/primitives';
import { EvidenceRequest } from '@/components/observatory/evidence-request';

/**
 * A permanent public incident record.
 *
 * This page renders if and only if the incident exists in one of the two
 * public incident endpoints of the measurement API for this vendor. There is
 * no seeded example, no placeholder incident, and no incident inferred from an
 * outside report: an incident RELIASTRA did not measure has no page here, full
 * stop. The route is live so that when the first measured incident is
 * published it lands on a stable URL immediately, linked from the vendor
 * record, the vendor index, and the sitemap.
 *
 * What is rendered: the incident's own stored fields, the observation scope of
 * the vendor record it belongs to, and - as on every observatory page - the
 * distinction between what was measured and what is simply not present.
 */

interface PageProps {
  params: Promise<{ vendor: string; id: string }>;
}

export const revalidate = 300;

async function load(vendor: string, id: string) {
  let detail: Awaited<ReturnType<typeof fetchVendorDetail>> = null;
  try {
    detail = await fetchVendorDetail(vendor);
  } catch {
    detail = null;
  }
  if (!detail) return null;

  const [all, published] = await Promise.all([
    fetchVendorIncidents(vendor).catch(() => null),
    fetchVendorPublicIncidents(vendor).catch(() => null),
  ]);

  const merged = mergeIncidents(all, published);
  const incident = merged.find((m) => m.incident_id === id) ?? null;
  const publicRecord: TrackPublicIncident | null =
    (published ?? []).find((p) => p.incident_id === id) ?? null;

  return { detail, incident, publicRecord, merged };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { vendor, id } = await params;
  const path = SHARE_ROUTES.trackIncident(vendor, id);
  const url = canonicalUrl(path);

  let loaded: Awaited<ReturnType<typeof load>> = null;
  try {
    loaded = await load(vendor, id);
  } catch {
    loaded = null;
  }
  if (!loaded || !loaded.incident) {
    return {
      title: 'Incident record - RELIASTRA observatory',
      alternates: { canonical: url },
      robots: { index: false, follow: true },
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
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      siteName: 'RELIASTRA',
      images: [
        {
          url: '/opengraph-image.png',
          width: 1200,
          height: 630,
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
  if (!loaded) {
    // The vendor's identity could not be read: say "unavailable", never "not found".
    return (
      <ObservatoryShell>
        <div className="ob-container py-20 md:py-28">
          <p className="ob-label obs-label-crit">Record unavailable</p>
          <h1 className="ob-h1 mt-5 max-w-[24ch]">The measurement API could not be read.</h1>
          <p className="ob-lede mt-6 max-w-[62ch]">
            RELIASTRA may hold this incident record; the API did not answer, and a page about
            reliability must not guess its own data. Try again shortly, or open the vendor record.
          </p>
          <p className="mt-8">
            <Link href={SHARE_ROUTES.trackVendor(vendor)} className="ob-link">
              Back to the {vendor} record
            </Link>
          </p>
        </div>
      </ObservatoryShell>
    );
  }
  const { detail, incident, publicRecord } = loaded;
  if (!incident) notFound();

  const path = SHARE_ROUTES.trackIncident(detail.vendor_name, incident.incident_id);
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
            { name: 'Observatory', path: PUBLIC_ROUTES.track },
            { name: detail.display_name, path: SHARE_ROUTES.trackVendor(detail.vendor_name) },
            { name: incident.title, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(path),
            url: canonicalUrl(path),
            name: `${incident.title} - ${detail.display_name} incident record`,
            isPartOf: { '@id': canonicalUrl(SHARE_ROUTES.trackVendor(detail.vendor_name)) },
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
              { name: 'Observatory', href: PUBLIC_ROUTES.track },
              { name: detail.display_name, href: SHARE_ROUTES.trackVendor(detail.vendor_name) },
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
            <Link href={SHARE_ROUTES.trackVendor(detail.vendor_name)} className="ob-link">
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
        note="A permanent record includes the boundaries of its own claims."
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
              href: SHARE_ROUTES.trackVendor(detail.vendor_name),
              label: `${detail.display_name} - current record`,
              kind: 'Live observatory',
            },
            {
              href: researchRoute('how-reliastra-measures-vendor-reliability'),
              label: 'How RELIASTRA measures vendor reliability',
              kind: 'Methodology',
            },
            {
              href: PUBLIC_ROUTES.incidentEvidence,
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


