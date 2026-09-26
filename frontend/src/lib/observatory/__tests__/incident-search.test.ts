import { describe, expect, it } from 'vitest';

import {
  failureKindLabel,
  INCIDENT_INDEX_AXES,
  resolveIncidentSearch,
} from '@/lib/observatory/incident-search';
import { SHARE_ROUTES, incidentSearchQuery } from '@/lib/routes';

/**
 * The curated indexability of the incident search, as a table of decisions.
 *
 * The failure this prevents is the classic parameterized-URL defect: an
 * unbounded filter space with every combination indexable and canonical to
 * itself is a crawl trap with thousands of near-identical pages; a resolver
 * that decides "this is a directory entry, this is working search" per
 * parametrization turns the same feature into a bounded index surface.
 */

describe('incident search indexability', () => {
  it('bare page: indexable, canonical to itself', () => {
    const r = resolveIncidentSearch({});
    expect(r.indexable).toBe(true);
    expect(r.canonicalPath).toBe(SHARE_ROUTES.observatoryIncidents);
    expect(r.cursor).toBeUndefined();
  });

  it.each(INCIDENT_INDEX_AXES)('single axis %s: indexable and self-canonical', (axis) => {
    const value = axis === 'status' ? 'open' : `${axis}probe`;
    const r = resolveIncidentSearch({ [axis]: value });
    expect(r.indexable).toBe(true);
    expect(r.canonicalPath).toContain(`${axis}=${value}`);
  });

  it('two axes together: not indexable, canonical to the base page', () => {
    const r = resolveIncidentSearch({ vendor: 'twilio', status: 'open' });
    expect(r.indexable).toBe(false);
    expect(r.canonicalPath).toBe(SHARE_ROUTES.observatoryIncidents);
    // The filters still drive the search itself - only the index decision changes.
    expect(r.filters.vendor).toBe('twilio');
    expect(r.filters.status).toBe('open');
  });

  it('a pagination cursor removes indexability and never enters the canonical', () => {
    const r = resolveIncidentSearch({ cursor: '2026-09-24T12:00:00|abc' });
    expect(r.indexable).toBe(false);
    expect(r.cursor).toBe('2026-09-24T12:00:00|abc');
    expect(r.canonicalPath).toBe(SHARE_ROUTES.observatoryIncidents);
    expect(r.canonicalPath).not.toContain('cursor');
  });

  it('time bounds and failure kind are working filters, not index shapes', () => {
    for (const sp of [
      { since: '2026-09-01T00:00:00Z' },
      { until: '2026-09-25T00:00:00Z' },
      { failure_kind: 'http_5xx' },
      { vendor: 'openai', since: '2026-09-01T00:00:00Z' },
    ]) {
      expect(resolveIncidentSearch(sp).indexable).toBe(false);
    }
  });

  it('stray query parameters disqualify a URL from the index', () => {
    const r = resolveIncidentSearch({ utm_campaign: 'launch' });
    expect(r.indexable).toBe(false);
    expect(r.canonicalPath).toBe(SHARE_ROUTES.observatoryIncidents);
  });

  it('normalizes slugs and rejects unknown status values', () => {
    const r = resolveIncidentSearch({ vendor: '  Twilio ', status: 'dgrad' });
    expect(r.filters.vendor).toBe('twilio');
    expect(r.filters.status).toBeUndefined();
    // The unknown status value is dropped, not passed through: the surviving
    // single axis stays indexable, canonical to the clean vendor view.
    expect(r.indexable).toBe(true);
    expect(r.canonicalPath).toContain('vendor=twilio');
    expect(r.canonicalPath).not.toContain('status=');
  });

  it('takes the first value of a repeated param, never a joined string', () => {
    const r = resolveIncidentSearch({ vendor: ['twilio', 'openai'] });
    expect(r.filters.vendor).toBe('twilio');
  });
});

describe('incidentSearchQuery builder', () => {
  it('omits empty filters and keeps defined ones', () => {
    expect(incidentSearchQuery({ vendor: 'twilio', status: undefined })).toBe(
      `${SHARE_ROUTES.observatoryIncidents}?vendor=twilio`
    );
    expect(incidentSearchQuery({})).toBe(SHARE_ROUTES.observatoryIncidents);
  });
});

describe('failureKindLabel', () => {
  it('names every classified mode and never panics on a new enum value', () => {
    expect(failureKindLabel('http_5xx')).toBe('HTTP 5xx responses');
    expect(failureKindLabel('transport')).toBe('Transport failure');
    expect(failureKindLabel('a_future_kind')).toBe('Not classified');
  });
});
