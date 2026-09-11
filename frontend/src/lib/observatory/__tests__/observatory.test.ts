import { describe, expect, it } from 'vitest';
import {
  availability,
  count,
  deriveState,
  duration,
  elapsed,
  endpointParts,
  latency,
  severityState,
  statusCode,
  utcClock,
  utcCompact,
  utcDate,
  utcStamp,
} from '@/lib/observatory/format';
import { articleFor, buildIsDownAnswer } from '@/lib/observatory/answer';
import { mergeIncidents } from '@/lib/observatory/incidents';

describe('the direct answer', () => {
  const base = {
    name: 'Example',
    endpointHost: 'status.example.com',
    regions: ['us-east'],
    current: {
      timestamp: '2026-09-10T20:08:38.000Z',
      latency_ms: 553,
      status_code: 200,
      is_up: true,
    },
    window24h: {
      window: '24h',
      total_observations: 276,
      uptime_percentage: 100,
      avg_latency_ms: 553,
      p95_latency_ms: 798,
    },
    cadenceSeconds: 60,
  };

  it('answers a healthy endpoint with scope, numbers and no vendor-wide claim', () => {
    const a = buildIsDownAnswer({
      ...base,
      verdict: deriveState('operational', base.current),
    });
    expect(a.question).toBe('Is Example down?');
    expect(a.lead).toMatch(/No sign of it right now/);
    expect(a.lead).toMatch(/status\.example\.com/);
    // The scoping caveat is mandatory text, not decoration.
    expect(a.caveats[0]).toMatch(/not a statement that every Example service/);
    expect(a.facts[0]).toMatch(/HTTP 200 in 553 ms/);
    expect(a.facts[0]).toMatch(/10 Sep 2026 20:08:38 UTC/);
    expect(a.facts[1]).toMatch(/276 observations/);
    // Never claims the whole vendor is healthy.
    expect(a.lead).not.toMatch(/\bOpenAI\b/);
  });

  it('answers stale data by refusing to assert a current state', () => {
    const a = buildIsDownAnswer({ ...base, verdict: deriveState('stale', base.current) });
    expect(a.lead).toMatch(/Unknown/);
    expect(a.lead).toMatch(/stale/);
    // Facts still describe the stored observation, as history.
    expect(a.facts[0]).toMatch(/Latest observation/);
  });

  it('answers a missing observation without fabricating one', () => {
    const a = buildIsDownAnswer({
      ...base,
      current: null,
      window24h: null,
      cadenceSeconds: null,
      verdict: deriveState('unknown', null),
    });
    expect(a.lead).toMatch(/Unknown/);
    expect(a.facts[0]).toMatch(/no observation/);
    expect(a.facts[1]).toMatch(/did not answer/);
  });

  it('never prints the metrics endpoint silence as a percentage', () => {
    const a = buildIsDownAnswer({ ...base, window24h: null, verdict: deriveState('operational', base.current) });
    expect(a.facts[1]).not.toMatch(/%/);
  });

  it('picks the article for the following word', () => {
    expect(articleFor('OpenAI')).toBe('an');
    expect(articleFor('Stripe')).toBe('a');
    expect(articleFor('Auth0')).toBe('an');
  });
});
import { formatCoordinate, regionInfo } from '@/lib/observatory/regions';
import type { TrackIncident, TrackPublicIncident } from '@/lib/track-api';

/**
 * These are the rules that make the public record trustworthy. Each test
 * corresponds to a specific way the API can hand the UI something that is
 * technically a number and factually not a measurement.
 */

describe('availability', () => {
  it('refuses to print 100% for a window with no observations', () => {
    // get_endpoint_stats returns uptime_percentage 100.0 when total == 0.
    expect(availability(100, 0)).toBe('insufficient data');
    expect(availability(100, null)).toBe('insufficient data');
    expect(availability(100, undefined)).toBe('insufficient data');
  });

  it('prints a real availability with two decimals when observations exist', () => {
    expect(availability(99.9512, 864)).toBe('99.95%');
    expect(availability(100, 12)).toBe('100.00%');
  });

  it('reports no data when the percentage itself is missing', () => {
    expect(availability(null, 20)).toBe('no data');
  });
});

describe('latency', () => {
  it('treats zero milliseconds as an absence, not a measurement', () => {
    expect(latency(0)).toBe('no data');
    expect(latency(null)).toBe('no data');
    expect(latency(undefined)).toBe('no data');
    expect(latency(Number.NaN)).toBe('no data');
  });

  it('formats real latency with thousands separators', () => {
    expect(latency(1415)).toBe('1,415');
    expect(latency(4.25)).toBe('4.3');
  });
});

describe('scalars', () => {
  it('distinguishes an absent status code from a zero one', () => {
    expect(statusCode(null)).toBe('no data');
    expect(statusCode(200)).toBe('200');
    expect(statusCode(503)).toBe('503');
  });

  it('formats counts and durations', () => {
    expect(count(77760)).toBe('77,760');
    expect(count(null)).toBe('no data');
    expect(duration(45)).toBe('45s');
    expect(duration(1320)).toBe('22m');
    expect(duration(3900)).toBe('1h 05m');
    expect(duration(90000)).toBe('1d 1h');
    expect(duration(null)).toBe('no data');
  });
});

describe('timestamps', () => {
  const iso = '2026-09-07T18:51:08.000Z';

  it('always formats in UTC, to the second', () => {
    expect(utcClock(iso)).toBe('18:51:08');
    expect(utcStamp(iso)).toBe('07 Sep 2026 18:51:08 UTC');
    expect(utcCompact(iso)).toBe('07 Sep 18:51:08');
    expect(utcDate(iso)).toBe('07 Sep 2026');
  });

  it('returns null rather than a fabricated date for missing input', () => {
    expect(utcStamp(null)).toBeNull();
    expect(utcStamp('not-a-date')).toBeNull();
    expect(elapsed(null)).toBe('no observation');
  });

  it('measures elapsed time from a fixed now', () => {
    const now = Date.parse(iso) + 125_000;
    expect(elapsed(iso, now)).toBe('2m');
  });
});

describe('deriveState', () => {
  it('leads with the most recent observation when it failed', () => {
    const v = deriveState('operational', { is_up: false, timestamp: '2026-09-07T18:51:08Z' });
    expect(v.state).toBe('critical');
    expect(v.word).toBe('Not responding');
  });

  it('reports degraded from the rolled-up status', () => {
    expect(deriveState('degraded', { is_up: true, timestamp: '2026-09-07T18:51:08Z' }).state).toBe(
      'degraded'
    );
  });

  it('reports responding only when something was observed', () => {
    expect(deriveState('operational', null).state).toBe('healthy');
    expect(deriveState(null, { is_up: true, timestamp: '2026-09-07T18:51:08Z' }).state).toBe(
      'healthy'
    );
  });

  it('never defaults an unmeasured dependency to healthy', () => {
    const v = deriveState(null, null);
    expect(v.state).toBe('unknown');
    expect(v.word).toBe('No observations');
    expect(deriveState('unknown', { is_up: null, timestamp: null }).state).toBe('unknown');
  });

  it('maps down-style vocabularies onto critical rather than unknown', () => {
    expect(deriveState('down', null).state).toBe('critical');
    expect(deriveState('outage', null).state).toBe('critical');
  });

  it('treats staleness as a precondition of every other state word', () => {
    // 'stale' outranks even a failed latest observation: hours-old data
    // describes the past, and "Not responding" would assert a present.
    const stale = deriveState('stale', { is_up: false, timestamp: '2026-09-07T18:51:08Z' });
    expect(stale.state).toBe('unknown');
    expect(stale.word).toBe('Not observed recently');
    expect(stale.qualifier).toMatch(/15-minute staleness/);
    // A stale record whose last observation succeeded must never read "Responding".
    expect(deriveState('stale', { is_up: true, timestamp: '2026-09-07T18:51:08Z' }).word).toBe(
      'Not observed recently'
    );
  });

  it('ties success wording to the probe rule, not to vendor health', () => {
    const v = deriveState('operational', null);
    expect(v.qualifier).toMatch(/expected response/);
    expect(v.qualifier).not.toMatch(/operational|healthy service/i);
    expect(deriveState('degraded', null).qualifier).toMatch(/status other than the one the probe expects/);
  });
});

describe('severity colour', () => {
  it('spends colour only on the severities that warrant it', () => {
    expect(severityState('critical')).toBe('critical');
    expect(severityState('major')).toBe('degraded');
    expect(severityState('minor')).toBe('unknown');
  });
});

describe('endpointParts', () => {
  it('splits a real URL and degrades safely on a malformed one', () => {
    expect(endpointParts('https://api.stripe.com/v1/charges')).toEqual({
      protocol: 'HTTPS',
      host: 'api.stripe.com',
      path: '/v1/charges',
    });
    expect(endpointParts('nonsense').protocol).toBe('not recorded');
  });
});

describe('regions', () => {
  it('resolves published coordinates for known region codes', () => {
    const r = regionInfo('eu-west-1');
    expect(r.place).toBe('Dublin, Ireland');
    expect(formatCoordinate(r.lat, r.lon)).toBe('53.35° N, 6.26° W');
  });

  it('never invents a coordinate for an unknown code', () => {
    const r = regionInfo('zz-nowhere-9');
    expect(r.place).toBeNull();
    expect(r.lat).toBeNull();
    expect(formatCoordinate(r.lat, r.lon)).toBeNull();
  });
});

describe('mergeIncidents', () => {
  const opened: TrackIncident[] = [
    {
      incident_id: 'inc_1',
      dependency_name: 'Acme production Stripe key',
      started_at: '2026-09-01T10:00:00Z',
      resolved_at: '2026-09-01T10:22:00Z',
      severity: 'minor',
      status: 'resolved',
      duration_seconds: 1320,
    },
    {
      incident_id: 'inc_2',
      dependency_name: 'internal-billing-dep',
      started_at: '2026-09-07T17:52:08Z',
      resolved_at: null,
      severity: 'major',
      status: 'open',
      duration_seconds: null,
    },
  ];

  const published: TrackPublicIncident[] = [
    {
      incident_id: 'inc_2',
      vendor_name: 'auth0',
      title: 'Token endpoint latency above threshold',
      started_at: '2026-09-07T17:52:08Z',
      resolved_at: null,
      duration_minutes: null,
      severity: 'major',
      status: 'open',
      max_latency_ms: null,
      downtime_percentage: null,
      has_evidence_report: true,
      download_token: null,
    },
  ];

  it('deduplicates by incident id and prefers the published title', () => {
    const merged = mergeIncidents(opened, published);
    expect(merged).toHaveLength(2);
    expect(merged[0].incident_id).toBe('inc_2');
    expect(merged[0].title).toBe('Token endpoint latency above threshold');
    expect(merged[0].hasEvidence).toBe(true);
  });

  it('never surfaces a customer dependency name', () => {
    const merged = mergeIncidents(opened, published);
    const serialised = JSON.stringify(merged);
    expect(serialised).not.toContain('Acme production Stripe key');
    expect(serialised).not.toContain('internal-billing-dep');
  });

  it('sorts newest first and tolerates either endpoint being unavailable', () => {
    expect(mergeIncidents(null, null)).toEqual([]);
    const onlyPublished = mergeIncidents(null, published);
    expect(onlyPublished).toHaveLength(1);
    const merged = mergeIncidents(opened, null);
    expect(merged.map((m) => m.incident_id)).toEqual(['inc_2', 'inc_1']);
    expect(merged[0].title).toBe('Observed failure window');
  });

  it('does not turn a null duration into a zero', () => {
    const merged = mergeIncidents(opened, published);
    expect(merged[0].durationSeconds).toBeNull();
    expect(merged[1].durationSeconds).toBe(1320);
  });
});
