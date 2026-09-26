import Link from 'next/link';

import { JsonLd } from '@/components/seo/json-ld';
import {
  ObservatoryShell,
  RecordSection,
  SpecRow,
  StateWord,
} from '@/components/observatory/primitives';
import { Breadcrumb } from '@/components/site/primitives';
import {
  duration as fmtDuration,
  INCIDENT_STATUS_LABEL,
  NOT_RECORDED,
  SEVERITY_LABEL,
  utcStamp,
} from '@/lib/observatory/format';
import { breadcrumbJsonLd, canonicalUrl } from '@/lib/seo';
import {
  PUBLIC_ROUTES,
  SHARE_ROUTES,
  incidentSearchQuery,
  researchRoute,
} from '@/lib/routes';
import type {
  TrackObservedIncidentDetail,
  TrackVendorDetail,
} from '@/lib/track-api';
import { publicIncidentEvidencePath } from '@/lib/track-api';

/**
 * The public record of a detector-confirmed incident - an incident
 * RELIASTRA's own probes opened, with no evidence publication attached.
 *
 * Deliberately a separate component from the evidence-published record: the
 * two claim different things, and sharing the layout is exactly how an
 * observed record would come to wear evidence language. Everything on this
 * page is a stored measurement field or an explicit absence; the description
 * the API carries is the bounded claim ("probes in {region} recorded N
 * consecutive failed observations against {endpoint}"), never "the vendor
 * was down".
 */

/**
 * The frozen evidence artifact of this record, when one exists.
 *
 * The descriptor comes on the incident detail (the same read that rendered
 * this page), and the link serves the backend's exact stored bytes through
 * the site's v1 proxy - a verifier hashes what was frozen, never a
 * re-serialisation. Absence is printed as what it is: the artifact has not
 * been generated yet, and this section says so instead of implying the
 * record is unverifiable.
 */
function EvidenceArtifactSection({ incident }: { incident: TrackObservedIncidentDetail }) {
  const evidence = incident.evidence;

  return (
    <RecordSection
      index="04"
      id="evidence"
      tone="base"
      title="Evidence artifact"
      note="A frozen, hashed document of this record's window: the claim, the detection rule, and every observation row it rests on. Deterministic, reproducible from stored data, immutable once written."
    >
      {evidence ? (
        <dl className="flex flex-col">
          <SpecRow term="Artifact" wide>
            <a
              href={publicIncidentEvidencePath(incident.incident_id)}
              className="ob-link break-all"
            >
              {publicIncidentEvidencePath(incident.incident_id)}
            </a>{' '}
            - JSON, served byte-for-byte as stored
          </SpecRow>
          <SpecRow term="Content hash" wide>
            sha256: <span className="break-all">{evidence.data_hash}</span>
          </SpecRow>
          <SpecRow term="Freeze" wide>
            version {evidence.version}, taken while the incident was{' '}
            {evidence.incident_status === 'resolved' ? 'resolved' : 'open'} (
            {utcStamp(evidence.generated_at) ?? NOT_RECORDED}); later freezes
            supersede, never edit, and each stays at its own versioned URL
          </SpecRow>
          <SpecRow term="Coverage" wide>
            {evidence.observation_count} observation
            {evidence.observation_count === 1 ? '' : 's'} in the window
            {evidence.observations_truncated
              ? ' - the artifact discloses that rows beyond the cap were dropped'
              : ''}
          </SpecRow>
          <SpecRow term="Verification" wide>
            Remove the &quot;verification&quot; key from the document,
            re-serialise with sorted keys and compact separators, and SHA-256
            the UTF-8 bytes: the digest must equal the hash above. The recipe
            ships inside every artifact.
          </SpecRow>
        </dl>
      ) : (
        <p className="max-w-[78ch] text-[14.5px] leading-relaxed text-[var(--ob-text-2)]">
          No frozen artifact yet for this record&apos;s current state - the
          freeze runs shortly after a record opens or resolves, so one may
          appear here within minutes. The record&apos;s fields above are the
          claim meanwhile, exactly as the detector wrote them; nothing on this
          page depends on the artifact existing.
        </p>
      )}
    </RecordSection>
  );
}

function failureStateText(kind: string): string {
  switch (kind) {
    case 'http_5xx':
      return 'server-side HTTP errors (5xx) at the probed endpoint';
    case 'http_4xx':
      return 'client-visible HTTP errors (4xx) at the probed endpoint';
    case 'timeout':
      return 'probe timeouts';
    case 'transport':
      return 'transport-level failures (connection or TLS)';
    case 'mixed':
      return 'mixed failure modes';
    default:
      return 'failures';
  }
}

export function ObservedIncidentRecord({
  detail,
  incident,
}: {
  detail: TrackVendorDetail;
  incident: TrackObservedIncidentDetail;
}) {
  const path = SHARE_ROUTES.observatoryIncident(detail.vendor_name, incident.incident_id);
  const target = incident.target_name ?? incident.endpoint_url;
  const resolved = incident.resolved_at != null;
  const statusWord =
    INCIDENT_STATUS_LABEL[incident.status.toLowerCase()] ?? incident.status;
  const severityWord = SEVERITY_LABEL[incident.severity.toLowerCase()] ?? incident.severity;

  const endpointHost = (() => {
    try {
      return new URL(incident.endpoint_url).host;
    } catch {
      return null;
    }
  })();

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.observatory },
            {
              name: detail.display_name,
              path: SHARE_ROUTES.observatoryVendor(detail.vendor_name),
            },
            { name: `${target} failure window`, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(path),
            url: canonicalUrl(path),
            name: `${target} failure window - ${detail.display_name} observed incident`,
            isPartOf: {
              '@id': canonicalUrl(SHARE_ROUTES.observatoryVendor(detail.vendor_name)),
            },
            inLanguage: 'en',
            datePublished: incident.started_at,
            ...(resolved && incident.resolved_at
              ? { dateModified: incident.resolved_at }
              : {}),
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Observatory', href: PUBLIC_ROUTES.observatory },
              {
                name: detail.display_name,
                href: SHARE_ROUTES.observatoryVendor(detail.vendor_name),
              },
              { name: 'Observed incident', href: path },
            ]}
          />
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-10 pt-10 md:pb-12 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">Observed incident record</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>Detected by RELIASTRA probes</span>
          </p>
          <h1 className="ob-h1 mt-6 max-w-[26ch]">
            {target} failure window - {detail.display_name}
          </h1>
          <p className="obs-descriptor mt-5 max-w-[68ch]">
            Incident {incident.incident_id}
            {endpointHost ? ` - endpoint ${endpointHost}` : ''}, measured from{' '}
            {incident.region}. Confirming rule: {incident.observation_count} consecutive
            failed observations{incident.failure_count ? ` counted ${incident.failure_count} of them` : ''}.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--ob-line-2)] pt-5">
            <StateWord
              state={resolved ? 'healthy' : 'degraded'}
              word={resolved ? 'Resolved' : 'Open'}
              size="sm"
            />
            <span className="ob-label">Severity: {severityWord}</span>
            <span className="ob-label">Status: {statusWord}</span>
            <span className="ob-label">Attribution: OBSERVED by RELIASTRA</span>
          </div>
        </div>
      </header>

      <RecordSection
        index="01"
        id="window"
        tone="base"
        title="Observed window"
        note="Every timestamp is a stored field of this record, printed in UTC. The window begins at the first failure the rule counted and ends, for a resolved record, at the observation run whose consecutive successes closed it."
      >
        <dl className="flex flex-col">
          <SpecRow term="Opened" wide>
            {utcStamp(incident.started_at) ?? NOT_RECORDED}
          </SpecRow>
          <SpecRow term="Confirmed" wide>
            {utcStamp(incident.detected_at) ?? NOT_RECORDED} - the run that made the failure
            count reach the threshold; this record did not exist before it
          </SpecRow>
          <SpecRow term="Recovered" wide>
            {resolved && incident.resolved_at ? (
              utcStamp(incident.resolved_at)
            ) : (
              <span className="obs-void">{NOT_RECORDED} - open at last read</span>
            )}
          </SpecRow>
          <SpecRow term="Duration" wide>
            {incident.duration_seconds != null
              ? `${fmtDuration(incident.duration_seconds)} (from the stored window)`
              : NOT_RECORDED}
          </SpecRow>
        </dl>
      </RecordSection>

      <RecordSection
        index="02"
        id="basis"
        tone="base"
        title="What was measured"
        note="The record is a summary of an observation run set. The referenced observation ids resolve to stored probe entries inside the retention window; the detector keeps no second, narrative version of them."
      >
        <dl className="flex flex-col">
          <SpecRow term="Endpoint observed" wide>
            {target} - {incident.endpoint_url}
          </SpecRow>
          <SpecRow term="Measured from" wide>
            {incident.region} - the only observation region named in this record; nothing
            about other regions is claimed or inferred
          </SpecRow>
          <SpecRow term="Failed observations" wide>
            {incident.failure_count}
            {incident.observation_count !== incident.failure_count
              ? `, counted consecutively across ${incident.observation_count} observations in the trigger set`
              : ', consecutive through the trigger set'}
          </SpecRow>
          <SpecRow term="Failure shape" wide>
            {failureStateText(incident.failure_kind)}
            {incident.status_codes && incident.status_codes.length
              ? ` - status codes recorded: ${incident.status_codes.join(', ')}`
              : ''}
          </SpecRow>
          {incident.first_observation_id || incident.last_observation_id ? (
            <SpecRow term="Observation references" wide>
              {incident.first_observation_id && <>first {incident.first_observation_id} </>}
              {incident.last_observation_id && <>last {incident.last_observation_id}</>}
            </SpecRow>
          ) : null}
        </dl>
      </RecordSection>

      <RecordSection
        index="03"
        id="claim"
        tone="base"
        title="The claim, in full"
      >
        <p className="max-w-[78ch] text-[14.5px] leading-relaxed text-[var(--ob-text-2)]">
          {incident.description ??
            `RELIASTRA probes in ${incident.region} recorded consecutive ${failureStateText(incident.failure_kind)} against this endpoint for ${detail.display_name} during the window above.`}{' '}
          That is all of it. Nothing about the vendor as a whole, nothing about other regions,
          nothing about your requests - the record you are reading is the measurement, not a
          narration of it.
        </p>
      </RecordSection>

      <EvidenceArtifactSection incident={incident} />

      <RecordSection
        index="05"
        id="not-established"
        tone="base"
        title="What this record does not establish"
        note="The boundaries are part of the record, not a disclaimer under it."
      >
        <dl className="flex flex-col">
          <SpecRow term="Causation" wide>
            Not established. A 5xx can be the vendor, a shared middle path, or the probe's own
            egress - the record reports what came back, not why.
          </SpecRow>
          <SpecRow term="Vendor acknowledgement" wide>
            {detail.display_name} may have recorded this window differently, later, or not at
            all. RELIASTRA does not ingest vendor-reported status, so no reconciliation is
            offered either way.
          </SpecRow>
          <SpecRow term="Global reach" wide>
            This window is named for {incident.region}. A record from one observation region
            never settles the question in another.
          </SpecRow>
          <SpecRow term="Customer impact" wide>
            Whether your requests were affected is your measurement to make - this record
            carries only RELIASTRA's own probes.
          </SpecRow>
        </dl>
      </RecordSection>

      <RecordSection index="06" id="context" title="Where this fits">
        <ul className="flex flex-col">
          {[
            {
              href: SHARE_ROUTES.observatoryVendor(detail.vendor_name),
              label: `${detail.display_name} - current record`,
              kind: 'Live observatory',
            },
            {
              href: incidentSearchQuery({ vendor: detail.vendor_name }),
              label: `All observed incidents - ${detail.vendor_name}`,
              kind: 'Incident search',
            },
            {
              href: SHARE_ROUTES.observatoryIncidents,
              label: 'Cross-vendor observed incident search',
              kind: 'Incident search',
            },
            {
              href: researchRoute('how-reliastra-measures-vendor-reliability'),
              label: 'How RELIASTRA measures vendor reliability',
              kind: 'Methodology',
            },
          ].map((link) => (
            <li
              key={link.href}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--ob-line)] py-3.5 last:border-b-0"
            >
              <Link href={link.href} className="ob-link text-[14px]">
                {link.label}
              </Link>
              <span className="ob-label">{link.kind}</span>
            </li>
          ))}
        </ul>
      </RecordSection>
    </ObservatoryShell>
  );
}
