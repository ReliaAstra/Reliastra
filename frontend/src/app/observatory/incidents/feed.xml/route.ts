import { canonicalUrl, SITE_NAME } from '@/lib/seo';
import { SHARE_ROUTES } from '@/lib/routes';
import { readPublicIncidents } from '@/lib/track-api';
import {
  FEED_LIMIT,
  FEED_WINDOW_DAYS,
  feedHeaders,
  incidentFeedItemXml,
  rssChannelXml,
} from '@/lib/observatory/feed';

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


/**
 * Items come from the cross-vendor public incident search - the same read
 * the search page serves, not a parallel rendering of it. Unreadable API
 * degrades to a valid, intentionally empty document: the rule (and its
 * reason) lives in `lib/observatory/feed.ts`.
 */
export async function GET(): Promise<Response> {
  const since = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
  const read = await readPublicIncidents({ limit: FEED_LIMIT, since });
  const items = read.kind === 'ok' ? read.value.items : [];

  const xml = rssChannelXml({
    title: `${SITE_NAME} - observed dependency incidents`,
    link: canonicalUrl(SHARE_ROUTES.observatoryIncidents),
    description:
      'Incidents independently detected by ' + SITE_NAME +
      ' probes across the public dependency catalog. Endpoint scoped, region named, detection rule stated on every record.',
    items: items.map(incidentFeedItemXml),
  });

  return new Response(xml, { headers: feedHeaders() });
}
