import { describe, expect, it } from 'vitest';

import {
  incidentRecordSidecar,
  type IncidentRecordLoad,
} from '@/lib/observatory/incident-record';
import type {
  TrackObservedIncidentDetail,
  TrackVendorDetail,
} from '@/lib/track-api';
import { RecordUnreadableError } from '@/lib/track-api';

/**
 * The incident record JSON sidecar's content decisions, as a table over the
 * same five load outcomes the HTML page resolves. Pure mapper, no I/O: what
 * each outcome publishes is pinned here, not discovered in a snapshot.
 */

const vendorDetail = {
  vendor_name: 'stripe',
  display_name: 'Stripe',
} as TrackVendorDetail;

const observedIncident = {
  incident_id: '11111111-2222-3333-4444-555555555555',
  vendor_name: 'stripe',
  vendor_display_name: 'Stripe',
  category: 'payments',
  target_name: 'Official status page',
  endpoint_url: 'https://status.stripe.com',
  region: 'us-east',
  status: 'resolved',
  severity: 'major',
  failure_kind: 'http_5xx',
  started_at: '2026-09-25T12:05:00Z',
  detected_at: '2026-09-25T12:10:00Z',
  resolved_at: '2026-09-25T12:25:00Z',
  duration_seconds: 1200,
  observation_count: 6,
  failure_count: 4,
  methodology_version: 'v1.0',
  attribution_status: 'observed',
  status_codes: [503],
  first_observation_id: 'a',
  last_observation_id: 'f',
  detection_rule: 'consecutive_failures',
  detection_metadata: { threshold: 2 },
  description: 'RELIASTRA probes recorded 4 consecutive failed observations.',
  evidence: {
    version: 2,
    incident_status: 'resolved',
    artifact_schema_version: '1.0',
    methodology_version: 'v1.0',
    data_hash: 'c'.repeat(64),
    byte_size: 2048,
    observation_count: 6,
    observations_truncated: false,
    generated_at: '2026-09-25T12:26:00Z',
  },
} as TrackObservedIncidentDetail;

const observedWithoutEvidence = {
  ...observedIncident,
  evidence: null,
} as TrackObservedIncidentDetail;

describe('the incident record JSON sidecar', () => {
  it('renders the observed record with its evidence pointer', () => {
    const sidecar = incidentRecordSidecar('stripe', observedIncident.incident_id, {
      kind: 'observed',
      detail: vendorDetail,
      incident: observedIncident,
    });

    expect(sidecar.status).toBe(200);
    const document = sidecar.document as Record<string, any>;
    expect(document.artifact.kind).toBe('reliastra.observatory.incident_record');
    expect(document.record.kind).toBe('observed');
    expect(document.record.incident_id).toBe(observedIncident.incident_id);
    expect(document.record.endpoint_url).toBe(observedIncident.endpoint_url);
    expect(document.record.region).toBe('us-east');
    expect(document.record.description).toBe(observedIncident.description);

    expect(document.evidence.url).toBe(
      `/api/v1/public/incidents/${observedIncident.incident_id}/evidence`
    );
    expect(document.evidence.version_url).toBe(
      `/api/v1/public/incidents/${observedIncident.incident_id}/evidence/versions/2`
    );
    expect(document.evidence.payload_sha256).toBe('c'.repeat(64));
    expect(document.evidence.version).toBe(2);

    // The sidecar points at the human record; the canonical host matches the
    // deployment's site URL, the path matches the HTML page exactly.
    expect(document.links.html).toContain(
      `/observatory/stripe/incidents/${observedIncident.incident_id}`
    );
  });

  it('publishes evidence as null when no artifact is frozen yet', () => {
    const sidecar = incidentRecordSidecar('stripe', observedIncident.incident_id, {
      kind: 'observed',
      detail: vendorDetail,
      incident: observedWithoutEvidence,
    });

    expect(sidecar.status).toBe(200);
    expect((sidecar.document as Record<string, any>).evidence).toBeNull();
  });

  it('renders the evidence-published record with its report attached', () => {
    const merged = {
      incident_id: 'pub-1',
      title: 'Partial degradation of the API',
      status: 'resolved',
      started_at: '2026-09-20T00:00:00Z',
      resolved_at: null,
      severity: 'partial_outage',
      affected: [],
    } as any;
    const publicRecord = {
      incident_id: 'pub-1',
      has_evidence_report: true,
    } as any;
    const sidecar = incidentRecordSidecar('stripe', 'pub-1', {
      kind: 'ok',
      detail: vendorDetail,
      incident: merged,
      publicRecord,
      merged: [merged],
    });

    expect(sidecar.status).toBe(200);
    const document = sidecar.document as Record<string, any>;
    expect(document.record.kind).toBe('evidence-published');
    expect(document.record.incident.incident_id).toBe('pub-1');
    expect(document.record.evidence_report).toEqual(publicRecord);
  });

  it.each([
    ['vendor-missing', { kind: 'vendor-missing' }],
    ['incident-missing', { kind: 'incident-missing' }],
  ] as [string, IncidentRecordLoad][])(
    'answers 404 for %n',
    (_name, load) => {
      const sidecar = incidentRecordSidecar('stripe', 'whatever', load);
      expect(sidecar.status).toBe(404);
    }
  );

  it('throws on unreadable - never answers 404 for a timeout', () => {
    // Existence is unknown when the API did not answer. A 404 here would
    // let a transient failure retract a published record's data endpoint.
    expect(() =>
      incidentRecordSidecar('stripe', 'whatever', {
        kind: 'unreadable',
        reason: 'timeout',
      })
    ).toThrow(RecordUnreadableError);
  });
});
