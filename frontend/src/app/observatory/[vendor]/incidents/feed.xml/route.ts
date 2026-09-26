import { canonicalUrl, SITE_NAME } from '@/lib/seo';
import { SHARE_ROUTES } from '@/lib/routes';
import {
  readPublicIncidents,
  readVendorDetail,
} from '@/lib/track-api';
import {
  FEED_LIMIT,
  FEED_WINDOW_DAYS,
  feedHeaders,
  incidentFeedItemXml,
  rssChannelXml,
} from '@/lib/observatory/feed';

export const revalidate = 60;

/**
 * Per-vendor feed of the incidents RELIASTRA detected on one measured
 * vendor.
 *
 * Same read as the global incident feed - the public incident search with
 * the vendor filter - and the same item builder, so a feed reader watching
 * one vendor sees exactly the entries the cross-vendor feed carries for
 * that vendor, never a second rendering. A vendor with no incidents serves
 * a valid channel with no items: an absence of records is the honest
 * content, and it is what the vendor's record page states too.
 *
 * Serving policy, from the shared feed discipline:
 *
 *  - catalog does not name the vendor -> 404. This URL was never valid; an
 *    empty feed would assert a tracked vendor with a quiet history.
 *  - measurement API unreadable (identity or items) -> valid, intentionally
 *    empty document. A 5xx feed is how outage storms get amplified, and
 *    this is the feed most likely to be polled during one.
 */

const NOT_FOUND_BODY = 'No measured vendor is published at this address.';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ vendor: string }> }
): Promise<Response> {
  const { vendor } = await ctx.params;

  const detailRead = await readVendorDetail(vendor);
  if (detailRead.kind === 'missing') {
    return new Response(NOT_FOUND_BODY, { status: 404 });
  }

  /**
   * Existence of the feed's subject is unknown: degrade quiet, per the
   * shared rule. The identity read failing is the API being down, which is
   * exactly when a 5xx feed would amplify a storm.
   */
  const items =
    detailRead.kind === 'ok'
      ? await (async () => {
          const since = new Date(
            Date.now() - FEED_WINDOW_DAYS * 24 * 3600 * 1000
          ).toISOString();
          const incidentsRead = await readPublicIncidents({
            vendor: detailRead.value.vendor_name,
            limit: FEED_LIMIT,
            since,
          });
          return incidentsRead.kind === 'ok' ? incidentsRead.value.items : [];
        })()
      : [];

  const displayName =
    detailRead.kind === 'ok' ? detailRead.value.display_name : vendor;

  const xml = rssChannelXml({
    title: `${SITE_NAME} - ${displayName} observed incidents`,
    link: canonicalUrl(SHARE_ROUTES.observatoryVendor(vendor)),
    description:
      `Incidents independently detected by ${SITE_NAME} probes against the ` +
      `${displayName} endpoints RELIASTRA observes. Endpoint scoped, region ` +
      `named, detection rule stated on every record - never a claim about ` +
      `the vendor's services as a whole.`,
    items: items.map(incidentFeedItemXml),
  });

  return new Response(xml, { headers: feedHeaders() });
}
