import { describe, expect, it } from 'vitest';

import {
  answerInputFromRecord,
  articleFor,
  buildIsDownAnswer,
} from '@/lib/observatory/answer';
import {
  normalizeSubject,
  vendorQuestionPath,
  vendorQuestionSidecar,
  type ResolvedQuestion,
} from '@/lib/observatory/questions';
import { RecordUnreadableError } from '@/lib/track-api';
import type { VendorRecord } from '@/lib/track-api';

/**
 * The question engine's content decisions, as tables over pure functions.
 * No network, no module mocks: what each subject/sidecar/outcome publishes
 * is pinned here, exactly as the incident-record sidecar tests do.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const T0 = '2026-09-26T12:00:00Z';
const T1 = '2026-09-26T12:01:00Z';

function current(overrides: Partial<NonNullable<VendorRecord['regionObservations'][number]['current']>> = {}) {
  return {
    timestamp: T1,
    latency_ms: 210,
    status_code: 200,
    is_up: true,
    ...overrides,
  };
}

/** A fully specified record; every test overrides only what it pins. */
function record(overrides: Partial<VendorRecord> = {}): VendorRecord {
  return {
    detail: {
      id: 'v-1',
      vendor_name: 'example',
      display_name: 'Example',
      category: 'payments',
      recent_status: 'operational',
      last_check_at: T1,
      is_public: true,
      endpoints: [
        {
          id: 'ep-1',
          endpoint_url: 'https://status.example.com',
          regions: ['us-east-1'],
          health_status: 'operational',
          is_active: true,
          last_check_at: T1,
        },
      ],
    },
    metrics: {
      metrics: {
        '24h': {
          window: '24h',
          total_observations: 1440,
          uptime_percentage: 99.9,
          avg_latency_ms: 205,
          p95_latency_ms: 480,
        },
      },
    },
    regionObservations: [
      { region: 'us-east-1', current: current(), reachable: true, cadenceSeconds: 60 },
    ],
    incidents: [],
    publicIncidents: [],
    regions: ['us-east-1'],
    pulse: null,
    ...overrides,
  } as VendorRecord;
}

/* ── Slug grammar ─────────────────────────────────────────────────────────── */

describe('question slug grammar', () => {
  it('normalizes casing and surrounding whitespace', () => {
    expect(normalizeSubject('  Stripe ')).toBe('stripe');
    expect(normalizeSubject('OPENAI')).toBe('openai');
  });

  it('treats an empty subject as no subject at all', () => {
    expect(normalizeSubject('')).toBeNull();
    expect(normalizeSubject('   ')).toBeNull();
  });

  it('builds the canonical path for a subject', () => {
    expect(vendorQuestionPath('stripe')).toBe('/down/stripe');
    expect(vendorQuestionPath('open ai')).toBe('/down/open%20ai');
  });
});

/* ── Answer composition (shared with the record page) ────────────────────── */

describe('answerInputFromRecord', () => {
  it('derives a healthy verdict from a fresh successful observation', () => {
    const input = answerInputFromRecord(record());
    expect(input.verdict.state).toBe('healthy');
    expect(input.name).toBe('Example');
    expect(input.endpointHost).toBe('status.example.com');
    expect(input.regions).toEqual(['us-east-1']);
    expect(input.current?.timestamp).toBe(T1);
    expect(input.window24h?.total_observations).toBe(1440);
    expect(input.cadenceSeconds).toBe(60);
  });

  it('derives critical from a failed latest observation, regardless of the status word', () => {
    const input = answerInputFromRecord(
      record({
        regionObservations: [
          { region: 'us-east-1', current: current({ is_up: false, status_code: 503 }), reachable: true, cadenceSeconds: 60 },
        ],
      })
    );
    expect(input.verdict.state).toBe('critical');
    expect(input.verdict.word).toBe('Expectation not met');
  });

  it('refuses to assert a current state when the record is stale', () => {
    const input = answerInputFromRecord(
      record({
        detail: {
          id: 'v-1',
          vendor_name: 'example',
          display_name: 'Example',
          category: 'payments',
          recent_status: 'stale',
          last_check_at: T0,
          is_public: true,
          endpoints: [{ id: 'ep-1', endpoint_url: 'https://status.example.com', regions: ['us-east-1'], health_status: 'operational', is_active: true, last_check_at: T1 }],
        },
      })
    );
    expect(input.verdict.state).toBe('unknown');
    expect(input.verdict.word).toBe('Not observed recently');
  });

  it('carries no fabricated endpoint host when the URL does not parse', () => {
    const input = answerInputFromRecord(
      record({
        detail: {
          id: 'v-1',
          vendor_name: 'example',
          display_name: 'Example',
          category: 'payments',
          recent_status: 'operational',
          last_check_at: T1,
          is_public: true,
          endpoints: [{ id: 'ep-1', endpoint_url: 'not a url', regions: ['us-east-1'], health_status: 'operational', is_active: true, last_check_at: T1 }],
        },
      })
    );
    expect(input.endpointHost).toBeNull();
  });

  it('picks the freshest observation across regions and the first derivable cadence', () => {
    const input = answerInputFromRecord(
      record({
        regionObservations: [
          { region: 'us-east-1', current: current({ timestamp: T0 }), reachable: true, cadenceSeconds: null },
          { region: 'eu-west-1', current: current({ timestamp: T1 }), reachable: true, cadenceSeconds: 120 },
        ],
        regions: ['us-east-1', 'eu-west-1'],
      })
    );
    expect(input.current?.timestamp).toBe(T1);
    expect(input.cadenceSeconds).toBe(120);
  });
});

/* ── The composed answer ──────────────────────────────────────────────────── */

describe('the composed vendor question', () => {
  it('asks the question the way people type it and never claims the whole vendor', () => {
    const answer = buildIsDownAnswer(answerInputFromRecord(record()));
    expect(answer.question).toBe('Is Example down?');
    expect(answer.lead).toMatch(/status\.example\.com/);
    expect(answer.caveats[0]).toMatch(/not a statement that every Example service/);
  });

  it('articles the question correctly for vowel-initial vendors', () => {
    expect(articleFor('OpenAI')).toBe('an');
    expect(articleFor('Stripe')).toBe('a');
  });
});

/* ── The JSON sidecar ─────────────────────────────────────────────────────── */

function resolved(overrides: Partial<VendorRecord> = {}): ResolvedQuestion {
  const rec = record(overrides);
  const input = answerInputFromRecord(rec);
  return {
    kind: 'is-down',
    vendor: 'example',
    record: rec,
    input,
    answer: buildIsDownAnswer(input),
  };
}

describe('the question JSON sidecar', () => {
  it('publishes the composed answer with stored-field provenance', () => {
    const sidecar = vendorQuestionSidecar('Example', { kind: 'ok', question: resolved() });
    expect(sidecar.status).toBe(200);
    const document = sidecar.document as Record<string, any>;

    expect(document.artifact.kind).toBe('reliastra.observatory.answer');
    expect(document.artifact.question_kind).toBe('is-down');
    expect(document.question).toBe('Is Example down?');
    expect(document.answer.lead).toBe(
      buildIsDownAnswer(answerInputFromRecord(record())).lead
    );
    // as_of is the observation's own timestamp, never a serve-time clock.
    expect(document.answer.observed_as_of).toBe(T1);
    expect(document.answer.state).toBe('healthy');
    expect(document.subject.vendor).toBe('example');
    expect(document.subject.display_name).toBe('Example');
    expect(document.subject.endpoint_url).toBe('https://status.example.com');
    expect(document.subject.regions).toEqual(['us-east-1']);
    expect(document.links.vendor_record).toContain('/observatory/example');
    expect(document.links.html).toContain('/down/example');
  });

  it('publishes observed_as_of null when no observation exists, not a fake stamp', () => {
    const sidecar = vendorQuestionSidecar('example', {
      kind: 'ok',
      question: resolved({
        regionObservations: [
          { region: 'us-east-1', current: null, reachable: false, cadenceSeconds: null },
        ],
      }),
    });
    expect((sidecar.document as Record<string, any>).answer.observed_as_of).toBeNull();
  });

  it('answers 404 for a subject the catalog does not name', () => {
    const sidecar = vendorQuestionSidecar('nobody', { kind: 'missing' });
    expect(sidecar.status).toBe(404);
  });

  it('throws on unreadable - never answers 404 for a timeout', () => {
    expect(() =>
      vendorQuestionSidecar('example', { kind: 'unreadable', reason: 'timeout' })
    ).toThrow(RecordUnreadableError);
  });
});
