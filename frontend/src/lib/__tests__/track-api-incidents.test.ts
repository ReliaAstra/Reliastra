import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchVendorIncidents,
  readPublicIncident,
  readPublicIncidents,
  readVendorIncidents,
} from '@/lib/track-api';

/**
 * The public incident intelligence readers.
 *
 * The contract under test: `/public/incidents` is a cursor search (filters
 * go in the query string exactly once, filters nobody set cost no bytes),
 * and both readers keep the three-way read - 'ok', 'missing' (the API said
 * 404: the URL 404s), 'unreadable' (the API did not answer: the URL 5xxs) -
 * because the incident detail page forks its response status on it.
 */

const INCIDENT = {
  incident_id: 'f7c1d2e3-0000-4000-8000-000000000001',
  vendor_name: 'stripe',
  vendor_display_name: 'Stripe',
  category: 'payments',
  target_name: 'Official status page',
  endpoint_url: 'https://status.stripe.com',
  region: 'us-east',
  status: 'open',
  severity: 'major',
  failure_kind: 'http_5xx',
  started_at: '2026-09-25T12:00:00Z',
  detected_at: '2026-09-25T12:05:00Z',
  resolved_at: null,
  duration_seconds: null,
  observation_count: 2,
  failure_count: 2,
  methodology_version: 'v1.0',
  attribution_status: 'observed',
};

let calls: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      if (url.includes(`/public/incidents/${INCIDENT.incident_id}`)) {
        return jsonResponse(INCIDENT);
      }
      if (url.includes('/public/incidents?') || url.endsWith('/public/incidents')) {
        return jsonResponse({ items: [INCIDENT], next_cursor: 'next', has_more: true });
      }
      if (/\/vendors\/stripe\/incidents\?/.test(url)) {
        return jsonResponse({ vendor_name: 'stripe', incidents: [
          { incident_id: INCIDENT.incident_id, dependency_name: 'Official status page',
            started_at: INCIDENT.started_at, resolved_at: null, status: 'open' },
        ] });
      }
      return jsonResponse({ detail: 'not found' }, 404);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readPublicIncidents', () => {
  it('builds the search query once, only from set filters', async () => {
    const read = await readPublicIncidents({
      vendor: 'stripe',
      status: 'open',
      cursor: '2026-09-20T00:00:00Z|abc',
    });
    expect(calls).toHaveLength(1);
    const [url] = calls;
    expect(url).toContain('/public/incidents?');
    expect(url.match(/vendor=/g)).toHaveLength(1);
    expect(url).toContain('status=open');
    expect(url).not.toContain('category=');
    expect(url).not.toContain('limit=');
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') {
      expect(read.value.items[0].incident_id).toBe(INCIDENT.incident_id);
      expect(read.value.next_cursor).toBe('next');
      expect(read.value.has_more).toBe(true);
    }
  });

  it('no filters means no query string at all', async () => {
    await readPublicIncidents();
    expect(calls[0]).not.toContain('?');
  });
});

describe('readPublicIncident', () => {
  it('returns the detail record for a known id', async () => {
    const read = await readPublicIncident(INCIDENT.incident_id);
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') {
      expect(read.value.vendor_name).toBe('stripe');
      expect(read.value.attribution_status).toBe('observed');
    }
  });

  it('distinguishes a 404 from silence', async () => {
    const missing = await readPublicIncident('does-not-exist');
    expect(missing.kind).toBe('missing');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => { throw new Error('network down'); })
    );
    const unreadable = await readPublicIncident(INCIDENT.incident_id);
    expect(unreadable.kind).toBe('unreadable');
  });
});

describe('the vendor incident list', () => {
  it('returns the detected incidents, not an empty placeholder', async () => {
    const incidents = await fetchVendorIncidents('stripe');
    expect(incidents).toHaveLength(1);
    expect(incidents?.[0].status).toBe('open');
  });

  it('readVendorIncidents keeps the three-way distinction', async () => {
    const read = await readVendorIncidents('stripe');
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') {
      expect(read.value[0].incident_id).toBe(INCIDENT.incident_id);
    }
    const missing = await readVendorIncidents('no-such-vendor');
    expect(missing.kind).toBe('missing');
  });
});
