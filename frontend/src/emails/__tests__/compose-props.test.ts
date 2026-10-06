import { describe, expect, it } from 'vitest';

import {
  buildProps,
  FieldError,
  fillSubject,
  missingRequired,
  toISO,
} from '../compose-props';
import { toText } from '../to-text';
import type { DependencyFailureProps } from '../classes/dependency-failure';

const incidentVars = {
  recipient_name: 'Adaeze',
  organisation_name: 'Meridian Fintech',
  severity: 'Critical',
  state_word: 'Failed',
  dependency_name: 'Auth0 /api/v2/token',
  vendor_name: 'Auth0',
  endpoint: 'https://meridian.auth0.com/oauth/token',
  window_start: '2026-03-11T04:12:07Z',
  window_end: '2026-03-11T04:41:07Z',
  observation_count: '30',
  interval_seconds: '60',
  confirm_threshold: '2',
  confidence_score: '29.50',
  confidence_ceiling: '55.00',
  classification: 'unknown',
  methodology_version: 'v1.0',
  document_checksum: 'a'.repeat(64),
  signed: 'true',
  verification_url: 'https://reliastra.com/evidence/verify/9f2c41a7',
  temporal_score: '0.0000',
  endpoint_overlap_score: '0.0000',
  latency_correlation_score: '0.3100',
  error_pattern_score: '0.4500',
  infrastructure_baseline_score: '1.0000',
};

describe('toISO', () => {
  it('passes ISO through', () => {
    expect(toISO('2026-03-11T04:12:07Z', 'window_start')).toBe('2026-03-11T04:12:07Z');
  });
  it('parses the backend display stamp back to ISO', () => {
    expect(toISO('2026-03-11 04:12:07 UTC', 'window_start')).toBe('2026-03-11T04:12:07Z');
  });
  it('rejects garbage with the field name', () => {
    try {
      toISO('soon-ish', 'window_start');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FieldError);
      expect((err as FieldError).field).toBe('window_start');
    }
  });
});

describe('fillSubject', () => {
  it('substitutes known variables and leaves unknown tokens', () => {
    expect(fillSubject('[{{severity}}] {{dependency_name}} is {{state_word}}', incidentVars)).toBe(
      '[Critical] Auth0 /api/v2/token is Failed',
    );
    expect(fillSubject('Hello {{missing_var}}', incidentVars)).toBe('Hello {{missing_var}}');
  });
});

describe('missingRequired', () => {
  it('reports blank and absent names only', () => {
    expect(missingRequired(['a', 'b', 'c'], { a: 'x', b: '  ' })).toEqual(['b', 'c']);
  });
});

describe('dependency_failure builder', () => {
  it('assembles typed props from flat variables', () => {
    const props = buildProps('dependency_failure', incidentVars) as DependencyFailureProps;
    expect(props.dependencyName).toBe('Auth0 /api/v2/token');
    expect(props.window.count).toBe(30);
    expect(props.window.confirmThreshold).toBe(2);
    expect(props.window.startedAt).toBe('2026-03-11T04:12:07Z');
    expect(props.ledger.score).toBe(29.5);
    expect(props.ledger.ceiling).toBe(55);
    expect(props.ledger.classification).toBe('unknown');
    expect(props.ledger.signals).toHaveLength(5);
    expect(props.ledger.signals[2]).toMatchObject({ name: 'latency_correlation', score: 0.31 });
    expect(props.provenance.signed).toBe(true);
    expect(props.provenance.documentChecksum).toBe('a'.repeat(64));
  });

  it('accepts the backend display stamp for dates', () => {
    const props = buildProps('dependency_failure', {
      ...incidentVars,
      window_start: '2026-03-11 04:12:07 UTC',
    }) as DependencyFailureProps;
    expect(props.window.startedAt).toBe('2026-03-11T04:12:07Z');
  });

  it('names the offending field on bad input', () => {
    expect(() => buildProps('dependency_failure', { ...incidentVars, observation_count: 'many' })).toThrowError(
      /observation_count/,
    );
    expect(() => buildProps('dependency_failure', { ...incidentVars, classification: 'maybe' })).toThrowError(
      /classification/,
    );
    const { dependency_name: _drop, ...without } = incidentVars;
    expect(() => buildProps('dependency_failure', without)).toThrowError(/dependency_name/);
  });

  it('rejects unknown classes', () => {
    expect(() => buildProps('nope' as never, {})).toThrowError(/unknown message class/);
  });
});

describe('other builders (smoke)', () => {
  const base = {
    recipient_name: 'Adaeze',
    organisation_name: 'Meridian Fintech',
  };
  it('evidence_delivery assembles numbers and dates', () => {
    const props = buildProps('evidence_delivery', {
      ...base,
      report_id: 'b41f9c02-7ae4-4d19-9c3f-2f8a6e15d7b0',
      incident_id: '5d2e8a71-4c93-4f60-b2a7-91e0c34d8f52',
      dependency_name: 'Auth0 /api/v2/token',
      file_name: 'RS-EV-9F2C41A7.pdf',
      file_size_bytes: '486219',
      generated_at: '2026-03-11T04:44:19Z',
      methodology_version: 'v1.0',
      document_checksum: 'c'.repeat(64),
      signed: 'false',
      verification_url: 'https://reliastra.com/evidence/verify/9f2c41a7',
    }) as { fileSizeBytes: number; provenance: { signed: boolean } };
    expect(props.fileSizeBytes).toBe(486219);
    expect(props.provenance.signed).toBe(false);
  });

  it('billing honours the event enum', () => {
    expect(() =>
      buildProps('billing', { ...base, event: 'hacked', plan_name: 'Developer', amount_usd: '$9.00' }),
    ).toThrowError(/must be one of/);
    const props = buildProps('billing', {
      ...base,
      event: 'payment_failed',
      plan_name: 'Developer',
      amount_usd: '$9.00',
    }) as { event: string };
    expect(props.event).toBe('payment_failed');
  });

  it('support_reply enforces the ask invariant', () => {
    expect(() =>
      buildProps('support_reply', {
        ...base,
        ticket_ref: 'TKT-1',
        agent_name: 'A',
        first_response: 'true',
        body_1: 'Hi.',
        awaiting_customer: 'true',
      }),
    ).toThrowError(/awaiting_on/);
  });

  it('security validates the actor email shape', () => {
    expect(() =>
      buildProps('security', {
        ...base,
        event: 'admin_action',
        actor_email: 'not-an-email',
        occurred_at: '2026-03-11T04:12:07Z',
        ip_address: '203.0.113.7',
        detail: 'Changed X.',
        requires_confirmation: 'true',
      }),
    ).toThrowError(/actor_email/);
  });

  it('internal_ops requires at least one fact', () => {
    expect(() =>
      buildProps('internal_ops', {
        ...base,
        severity: 'critical',
        component: 'worker',
        environment: 'production',
        alert_kind: 'queue_backlog',
        alert_title: 'Backlog growing',
        detected_at: '2026-03-11T04:12:07Z',
        detail: 'Depth 9000.',
        facts: '',
      }),
    ).toThrowError(/facts/);
  });

  it('partner, vendor_ops and customer alert assemble', () => {
    const partner = buildProps('partner', {
      ...base,
      event: 'invitation',
      partner_company: 'Acme',
      partner_contact: 'Sam',
    }) as { event: string };
    expect(partner.event).toBe('invitation');
    const vendor = buildProps('vendor_ops', {
      ...base,
      vendor_company: 'Auth0',
      vendor_name: 'Auth0',
      endpoint: 'https://meridian.auth0.com/oauth/token',
      window_start: '2026-03-11T04:12:07Z',
      window_end: '2026-03-11T04:41:07Z',
      observation_count: '30',
      interval_seconds: '60',
      confirm_threshold: '2',
      request: 'Were you aware of an incident in this window?',
      methodology_version: 'v1.0',
      verification_url: 'https://reliastra.com/evidence/verify/9f2c41a7',
    }) as { request: string };
    expect(vendor.request).toContain('aware');
    const alert = buildProps('customer_dependency_alert', {
      ...incidentVars,
      remediation: 'Check the colo pinning.',
    }) as { remediation: string };
    expect(alert.remediation).toContain('colo');
  });
});

describe('toText', () => {
  it('keeps preheader text and strips tags', () => {
    const out = toText('<div style="display:none">Preview line</div><p>Hello <strong>Ada</strong></p>');
    expect(out).toContain('Preview line');
    expect(out).toContain('Hello Ada');
    expect(out).not.toContain('<');
  });
});
