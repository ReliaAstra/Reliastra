import { describe, expect, it } from 'vitest';

import {
  FEED_LIMIT,
  FEED_WINDOW_DAYS,
  incidentFeedItemXml,
  incidentItemDescription,
  incidentItemTitle,
  rssChannelXml,
  xmlEscape,
} from '@/lib/observatory/feed';
import type { TrackObservedIncident } from '@/lib/track-api';

/**
 * The shared feed discipline, as tables over the pure builder. Every
 * RELIASTRA feed emits through these functions; what each element may claim
 * is pinned here.
 */

const incident = {
  incident_id: '1111-2222',
  vendor_name: 'stripe',
  vendor_display_name: 'Stripe',
  category: 'payments',
  target_name: 'Official status page',
  endpoint_url: 'https://status.stripe.com',
  region: 'us-east-1',
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
} as TrackObservedIncident;

describe('incident feed items', () => {
  it('titles what failed, for whom, and how it ended', () => {
    expect(incidentItemTitle(incident)).toBe(
      'Stripe Official status page failure window (resolved)'
    );
  });

  it('marks an open incident open, never resolved', () => {
    expect(incidentItemTitle({ ...incident, resolved_at: null })).toMatch(
      /\(open\)$/
    );
  });

  it('describes the exact measurement, endpoint scoped and region named', () => {
    const description = incidentItemDescription(incident);
    expect(description).toContain('consecutive failed probes');
    expect(description).toContain('Official status page');
    expect(description).toContain('us-east-1');
    expect(description).toContain('2026-09-25T12:05:00Z to 2026-09-25T12:25:00Z');
    // The endpoint URL names the target when the record carries no name.
    const bare = incidentItemDescription({ ...incident, target_name: null } as TrackObservedIncident);
    expect(bare).toContain('https://status.stripe.com');
    // Never a vendor-wide claim.
    expect(description.toLowerCase()).not.toMatch(/\bstripe is down\b/);
    expect(description).not.toMatch(/all .* services/);
  });

  it('guids on the incident id, not a mutable URL', () => {
    const xml = incidentFeedItemXml(incident);
    expect(xml).toContain('<guid isPermaLink="false">1111-2222</guid>');
    expect(xml).toContain('/observatory/stripe/incidents/1111-2222');
  });

  it('escapes markup-significant characters in every field', () => {
    const hostile = {
      ...incident,
      vendor_display_name: 'Acme & Co <script>',
      target_name: "Status 'Page' \"v2\"",
    } as TrackObservedIncident;
    const xml = incidentFeedItemXml(hostile);
    expect(xml).toContain('Acme &amp; Co &lt;script&gt;');
    expect(xml).toContain('Status &apos;Page&apos; &quot;v2&quot;');
    expect(xml).not.toContain('<script>');
  });

  it('falls back to the endpoint url when no target name exists', () => {
    const bare = { ...incident, target_name: null } as TrackObservedIncident;
    expect(incidentItemTitle(bare)).toContain('status.stripe.com');
  });
});

describe('the channel document', () => {
  it('is a valid RSS 2.0 document with the channel identity', () => {
    const xml = rssChannelXml({
      title: 'RELIASTRA - observed dependency incidents',
      link: 'https://reliastra.com/observatory/incidents',
      description: 'Test channel',
      items: [incidentFeedItemXml(incident)],
    });
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain('<lastBuildDate>');
    expect(xml).toContain('<ttl>1</ttl>');
    expect((xml.match(/<item>/g) ?? []).length).toBe(1);
  });

  it('an empty cycle is a valid, parseable, empty document', () => {
    const xml = rssChannelXml({
      title: 't',
      link: 'https://reliastra.com/x',
      description: 'd',
      items: [],
    });
    expect((xml.match(/<item>/g) ?? []).length).toBe(0);
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('escapes channel metadata too', () => {
    const xml = rssChannelXml({
      title: 'A & B',
      link: 'https://reliastra.com/x',
      description: 'claims <nothing>',
      items: [],
    });
    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('claims &lt;nothing&gt;');
  });
});

describe('feed constants', () => {
  it('keep the published serving policy', () => {
    // The llms files document the feeds with these semantics; changing the
    // limits is a contract change, not a tweak.
    expect(FEED_LIMIT).toBe(25);
    expect(FEED_WINDOW_DAYS).toBe(30);
  });
});

describe('xmlEscape', () => {
  it('escapes all five XML specials', () => {
    expect(xmlEscape('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});
