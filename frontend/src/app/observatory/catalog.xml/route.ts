import { canonicalUrl, SITE_NAME } from '@/lib/seo';
import { PUBLIC_ROUTES, SHARE_ROUTES } from '@/lib/routes';
import {
  readCatalogForDiscovery,
  type TrackVendorListItem,
} from '@/lib/track-api';
import { feedHeaders, rssChannelXml, xmlEscape } from '@/lib/observatory/feed';

export const revalidate = 300;

/**
 * Catalog feed: announcements of tracked dependencies.
 *
 * One entry per vendor the observatory publishes a record for - the feed is
 * quiet unless the catalog changes, which is the point: a reader subscribes
 * to learn "what does RELIASTRA observe now", not to re-read a state that
 * changes every probe. guids are vendor slugs (stable identity), pubDate is
 * the catalog's own created_at for that vendor and is omitted when the row
 * carries none - a real date or no date, never a fabricated one.
 *
 * Items come from the discovery catalog read (the sitemap's read, with its
 * six-hour last-good fallback), so an API outage does not blank the feed on
 * the next poll; a genuinely empty catalog serves an empty channel. Like
 * every RELIASTRA feed it degrades to a valid, intentionally empty document
 * when nothing readable exists - never a 5xx.
 */

const CATALOG_FEED_LIMIT = 50;

/** One catalog entry, from stored list fields only. */
function catalogItemXml(vendor: {
  vendor_name: string;
  display_name: string;
  category: string;
  created_at?: string | null;
}): string {
  const link = canonicalUrl(SHARE_ROUTES.observatoryVendor(vendor.vendor_name));
  const categoryWord = vendor.category.replace(/[-_]/g, ' ');
  const description =
    `${SITE_NAME} publishes an independent measurement record for ` +
    `${vendor.display_name} (${categoryWord}). The record observes the listed ` +
    `public HTTP endpoint - status, latency and transport errors - with the ` +
    `observation region named on the record. It is not a statement about the ` +
    `vendor's services as a whole.`;
  const created = vendor.created_at ? new Date(vendor.created_at) : null;
  const pubDate =
    created && !Number.isNaN(created.getTime())
      ? `\n      <pubDate>${xmlEscape(created.toUTCString())}</pubDate>`
      : '';
  return `    <item>
      <title>${xmlEscape(`Now observing: ${vendor.display_name}`)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(vendor.vendor_name)}</guid>${pubDate}
      <category>${xmlEscape(vendor.category)}</category>
      <description>${xmlEscape(description)}</description>
    </item>`;
}

export async function GET(): Promise<Response> {
  /**
   * The discovery read throws when the catalog is unreadable and no
   * last-good list remains - the sitemap wants that fail-loud behavior, but
   * a feed never does: this route serves a valid, intentionally empty
   * document instead, per the shared degrade rule.
   */
  let catalogVendors: TrackVendorListItem[] = [];
  try {
    const catalog = await readCatalogForDiscovery({ pageSize: 100, maxPages: 20 });
    catalogVendors = catalog.vendors;
  } catch {
    catalogVendors = [];
  }

  const vendors = catalogVendors
    .filter((v) => v.is_public !== false && !!v.vendor_name)
    .sort((a, b) => {
      const at = a.created_at ?? '';
      const bt = b.created_at ?? '';
      if (at && bt) return bt.localeCompare(at);
      // Vendors without a real date sort last; no date is invented for them.
      return at ? -1 : bt ? 1 : 0;
    })
    .slice(0, CATALOG_FEED_LIMIT);

  const xml = rssChannelXml({
    title: `${SITE_NAME} - tracked dependencies`,
    link: canonicalUrl(PUBLIC_ROUTES.observatory),
    description:
      `Newly tracked dependencies in the ${SITE_NAME} public observatory: ` +
      `independently measured records of third-party service health, one per ` +
      `vendor RELIASTRA probes. Customer dependencies are never included.`,
    items: vendors.map(catalogItemXml),
  });

  return new Response(xml, { headers: feedHeaders() });
}
