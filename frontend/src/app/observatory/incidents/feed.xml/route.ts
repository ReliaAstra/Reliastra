import { canonicalUrl, SITE_NAME } from '@/lib/seo';
import { SHARE_ROUTES } from '@/lib/routes';
import { readPublicIncidents } from '@/lib/track-api';

export const revalidate = 60;

/**
 * RSS 2.0 feed of publicly detected incidents.
 *
 * Every item is one detector-confirmed record: the title says what failed
 * for whom and how it ended, the link is the human record, the guid is the
 * incident id itself (the record's canonical identity), and the description
 * carries the exact measurement statement, never a paraphrase. A feed is
 * where a "is X down?" automation first looks, so precision here is worth
 * the bytes.
 *
 * Serving policy matches the page: the last N confirmed incidents, newest
 * first. If the API is unreadable the feed still serves, as a valid,
 * intentionally empty document - a 5xx feed is what makes feed readers
 * hammer an infrastructure page during a widely-felt outage.
 */

const FEED_LIMIT = 25;
const WINDOW_DAYS = 30;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(): Promise<Response> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const read = await readPublicIncidents({ limit: FEED_LIMIT, since });
  const items = read.kind === 'ok' ? read.value.items : [];

  const now = new Date();

  const itemXml = items
    .map((incident) => {
      const target = incident.target_name ?? incident.endpoint_url;
      const stateText = incident.resolved_at ? 'resolved' : 'open';
      const title = `${incident.vendor_display_name} ${target} failure window (${stateText})`;
      const link = canonicalUrl(
        SHARE_ROUTES.observatoryIncident(incident.vendor_name, incident.incident_id)
      );
      // The summary read carries no `description` field; the feed states the
      // claim itself, endpoint scoped, never "the vendor was down".
      const description =
        `RELIASTRA observed consecutive failed probes against ${target} for ` +
        `${incident.vendor_display_name} from ${incident.region} during ` +
        `${incident.started_at}${incident.resolved_at ? ` to ${incident.resolved_at}` : ' (open)'}.`;
      return `    <item>
      <title>${xmlEscape(title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(incident.incident_id)}</guid>
      <pubDate>${xmlEscape(new Date(incident.started_at).toUTCString())}</pubDate>
      <category>${xmlEscape(incident.category)}</category>
      <description>${xmlEscape(description)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(SITE_NAME)} - observed dependency incidents</title>
    <link>${xmlEscape(canonicalUrl(SHARE_ROUTES.observatoryIncidents))}</link>
    <description>Incidents independently detected by ${xmlEscape(SITE_NAME)} probes across the public dependency catalog. Endpoint scoped, region named, detection rule stated on every record.</description>
    <language>en</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <ttl>1</ttl>
${itemXml}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
