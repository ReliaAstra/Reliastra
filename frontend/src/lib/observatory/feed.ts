import type { TrackObservedIncident } from '@/lib/track-api';
import { canonicalUrl, SITE_NAME } from '@/lib/seo';
import { SHARE_ROUTES } from '@/lib/routes';

/**
 * The shared RSS 2.0 discipline for every RELIASTRA feed.
 *
 * One builder, several feeds: the cross-vendor incident feed, the per-vendor
 * incident feeds, and the catalog feed all emit through these functions, so
 * the feed contract - guid identity, measurement-exact descriptions,
 * escaping, the degrade-to-empty rule - is written once and cannot drift
 * between feeds.
 *
 * The rules, and why they are rules:
 *
 * - **guid is the record's canonical identity** (incident id, vendor slug),
 *   never a URL that changes when the origin moves and never a per-request
 *   value. A feed reader deduplicates on it.
 * - **Descriptions carry the exact measurement statement**, never a
 *   paraphrase and never a vendor-wide claim ("consecutive failed probes
 *   against {endpoint} from {region}", not "{vendor} is down"). A feed is
 *   where "is X down?" automations first look, so precision here is worth
 *   the bytes.
 * - **A feed degrades to a valid, intentionally empty document when the API
 *   is unreadable.** A 5xx feed is what makes feed readers hammer an
 *   infrastructure page during a widely-felt outage; an empty 200 with a
 *   fresh lastBuildDate is quiet by comparison and states nothing false -
 *   an empty channel asserts "no items this cycle", not "no incidents ever".
 * - **pubDate only when a real date exists** (an incident's start, a
 *   vendor's catalog creation). Inventing a date is how feeds train readers
 *   to ignore them.
 */

export const FEED_LIMIT = 25;
export const FEED_WINDOW_DAYS = 30;

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The statement an incident feed item carries. Endpoint scoped, region
 * named, window exact - the same wording the RSS feed of the global search
 * has always used, now the only wording any RELIASTRA feed uses.
 */
export function incidentItemDescription(incident: TrackObservedIncident): string {
  const target = incident.target_name ?? incident.endpoint_url;
  return (
    `RELIASTRA observed consecutive failed probes against ${target} for ` +
    `${incident.vendor_display_name} from ${incident.region} during ` +
    `${incident.started_at}${incident.resolved_at ? ` to ${incident.resolved_at}` : ' (open)'}.`
  );
}

export function incidentItemTitle(incident: TrackObservedIncident): string {
  const target = incident.target_name ?? incident.endpoint_url;
  const stateText = incident.resolved_at ? 'resolved' : 'open';
  return `${incident.vendor_display_name} ${target} failure window (${stateText})`;
}

export function incidentFeedItemXml(incident: TrackObservedIncident): string {
  const link = canonicalUrl(
    SHARE_ROUTES.observatoryIncident(incident.vendor_name, incident.incident_id)
  );
  return `    <item>
      <title>${xmlEscape(incidentItemTitle(incident))}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(incident.incident_id)}</guid>
      <pubDate>${xmlEscape(new Date(incident.started_at).toUTCString())}</pubDate>
      <category>${xmlEscape(incident.category)}</category>
      <description>${xmlEscape(incidentItemDescription(incident))}</description>
    </item>`;
}

export interface FeedChannel {
  title: string;
  link: string;
  description: string;
  /** Rendered `<item>` blocks, newest first. Empty for a quiet cycle. */
  items: string[];
}

/**
 * The RSS 2.0 document for a channel. `lastBuildDate` is serve time: it
 * states when this document was composed, which is a fact the server owns
 * (unlike item dates, which are facts of the records).
 */
export function rssChannelXml(channel: FeedChannel): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(channel.title)}</title>
    <link>${xmlEscape(channel.link)}</link>
    <description>${xmlEscape(channel.description)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>1</ttl>
${channel.items.join('\n')}
  </channel>
</rss>`;
}

/** Response headers shared by every feed route. */
export function feedHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
  };
}
