import {
  readPublicIncident,
  readVendorDetail,
  readVendorPublicIncidents,
  RecordUnreadableError,
  publicIncidentEvidencePath,
  type TrackObservedIncidentDetail,
  type TrackPublicIncident,
  type TrackVendorDetail,
  type UnreadableReason,
} from '@/lib/track-api';
// RecordUnreadableError is re-thrown here so both renderers fail the same
// way on an unreadable API.
import { mergeIncidents, type MergedIncident } from '@/lib/observatory/incidents';
import { canonicalUrl } from '@/lib/seo';
import { SHARE_ROUTES } from '@/lib/routes';

/**
 * The canonical loader for one public incident record URL.
 *
 * Extracted from the record page so the page (HTML) and the `.json` sidecar
 * (machine readable) resolve the SAME record through the SAME reads and the
 * SAME decision logic - one source of truth, two renderers. Neither surface
 * synthesises, defaults or re-truths anything here.
 *
 * Five outcomes, because they are not the same statement:
 *
 *  - `ok`               the incident is in the evidence-published set.
 *  - `observed`         detector-confirmed (RELIASTRA's own probes), no
 *                       evidence publication attached - resolved by id from
 *                       the public incident API.
 *  - `vendor-missing`   the API answered 404 for the vendor itself.
 *  - `incident-missing` the vendor exists and this incident does not (or
 *                       belongs to a different vendor than the URL names).
 *  - `unreadable`       the API did not answer - existence unknown.
 *
 * `ok`/`observed` render 200; the missing kinds 404 `noindex`; unreadable
 * throws so the nearest error boundary returns a 5xx and the URL keeps its
 * indexability. A timeout must never be able to withdraw a published record.
 */

export type IncidentRecordLoad =
  | {
      kind: 'ok';
      detail: TrackVendorDetail;
      incident: MergedIncident;
      publicRecord: TrackPublicIncident | null;
      merged: MergedIncident[];
    }
  | { kind: 'observed'; detail: TrackVendorDetail; incident: TrackObservedIncidentDetail }
  | { kind: 'vendor-missing' }
  | { kind: 'incident-missing' }
  | { kind: 'unreadable'; reason: UnreadableReason };

export async function loadIncidentRecord(
  vendor: string,
  id: string
): Promise<IncidentRecordLoad> {
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

/**
 * The machine-readable twin of the record page: the same canonical objects
 * the HTML rendered, plus the pointers a machine needs (the human record and
 * the evidence artifact). Pure mapper over a completed load, so the sidecar's
 * content decisions are testable without network I/O.
 *
 * The `ok` branch (org-published evidence) is a phase 4 surface; its sidecar
 * carries the merged record the page rendered. The `observed` branch is the
 * phase 5 canonical detector record and additionally links its frozen
 * evidence document when one exists.
 */
export type IncidentRecordSidecar =
  | { status: 200; document: Record<string, unknown> }
  | { status: 404; document: Record<string, never> };

export function incidentRecordSidecar(
  vendor: string,
  id: string,
  load: IncidentRecordLoad
): IncidentRecordSidecar {
  if (load.kind === 'unreadable') {
    // Existence unknown: the URL stays indexed and the handler throws for a
    // 5xx. A sidecar must never answer "no such record" for a timeout - the
    // same rule the HTML page follows.
    throw new RecordUnreadableError(load.reason, '/public/incidents');
  }
  if (load.kind === 'vendor-missing' || load.kind === 'incident-missing') {
    return { status: 404, document: {} };
  }

  const pagePath = SHARE_ROUTES.observatoryIncident(vendor, id);

  if (load.kind === 'observed') {
    const incident = load.incident;
    return {
      status: 200,
      document: {
        artifact: {
          kind: 'reliastra.observatory.incident_record',
          format: 'json-sidecar',
          schema_version: '1.0',
          rendered_from: 'the same canonical reads as the HTML record page',
        },
        record: {
          kind: 'observed',
          incident_id: incident.incident_id,
          vendor: incident.vendor_name,
          vendor_display_name: incident.vendor_display_name,
          category: incident.category,
          target_name: incident.target_name,
          endpoint_url: incident.endpoint_url,
          region: incident.region,
          status: incident.status,
          severity: incident.severity,
          failure_kind: incident.failure_kind,
          started_at: incident.started_at,
          detected_at: incident.detected_at,
          resolved_at: incident.resolved_at,
          duration_seconds: incident.duration_seconds,
          observation_count: incident.observation_count,
          failure_count: incident.failure_count,
          methodology_version: incident.methodology_version,
          attribution_status: incident.attribution_status,
          status_codes: incident.status_codes,
          first_observation_id: incident.first_observation_id,
          last_observation_id: incident.last_observation_id,
          detection_rule: incident.detection_rule,
          detection_metadata: incident.detection_metadata,
          description: incident.description,
        },
        evidence:
          incident.evidence != null
            ? {
                url: publicIncidentEvidencePath(incident.incident_id),
                version_url: `/api/v1/public/incidents/${encodeURIComponent(incident.incident_id)}/evidence/versions/${incident.evidence.version}`,
                version: incident.evidence.version,
                artifact_schema_version: incident.evidence.artifact_schema_version,
                methodology_version: incident.evidence.methodology_version,
                payload_sha256: incident.evidence.data_hash,
                byte_size: incident.evidence.byte_size,
                observation_count: incident.evidence.observation_count,
                observations_truncated: incident.evidence.observations_truncated,
                generated_at: incident.evidence.generated_at,
                incident_status: incident.evidence.incident_status,
              }
            : null,
        links: {
          html: canonicalUrl(pagePath),
          vendor_record: canonicalUrl(
            SHARE_ROUTES.observatoryVendor(load.detail.vendor_name)
          ),
        },
      },
    };
  }

  const { incident, publicRecord } = load;
  return {
    status: 200,
    document: {
      artifact: {
        kind: 'reliastra.observatory.incident_record',
        format: 'json-sidecar',
        schema_version: '1.0',
        rendered_from: 'the same canonical reads as the HTML record page',
      },
      record: {
        kind: 'evidence-published',
        incident,
        evidence_report: publicRecord,
      },
      evidence: null,
      links: {
        html: canonicalUrl(pagePath),
        vendor_record: canonicalUrl(
          SHARE_ROUTES.observatoryVendor(load.detail.vendor_name)
        ),
      },
    },
  };
}
