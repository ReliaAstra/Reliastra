import type { MetadataRoute } from 'next';

import { SHARE_ROUTES } from '@/lib/routes';
import { SITE_INDEXABLE } from '@/lib/indexability';
import {
  readCatalogForDiscovery,
  readVendorPublicIncidents,
  type TrackVendorListItem,
} from '@/lib/track-api';
import {
  dedupeByUrl,
  mapWithConcurrency,
  siteBase,
  staticSitemapEntries,
  type Sitemap,
  type SitemapEntry,
} from '@/lib/sitemap-source';
import { renderAtRequestTime } from '@/lib/render-at-request-time';

/**
 * Production sitemap: canonical indexable URLs only.
 *
 * Excludes (deliberately): authenticated console routes, /admin/*, auth
 * pages (/login, /signup, /verify-email, /reset-password), token-scoped
 * shares (/reports/*), /checkout, /api/*, and the removed B2B surfaces
 * (partner portal, client portals) - none of which must create index bloat.
 * The `/agencies` marketing page is a first-class route again and is listed.
 *
 * Includes: every canonical page in `PUBLIC_PAGES` (marketing, docs, glossary,
 * research hubs, categories and papers), the public dependency records
 * enumerated from the measurement API's catalog, and the incident records the
 * published-incident endpoint actually returns. No URL is emitted because a
 * route could render it; a URL enters the sitemap when the data behind it
 * exists.
 *
 * ── Two rules this file is built around ───────────────────────────────────
 *
 * A sitemap is a *list of URLs that exist*. It is not a report of current
 * measurements, and it must not react to a transient read failure by
 * retracting URLs that still resolve. So:
 *
 *  1. When the catalog cannot be read, discovery falls back to the last good
 *     list for up to six hours (typed as stale, logged), and past that this
 *     function throws. A 500 leaves the crawler holding the previous sitemap;
 *     a 200 with the records missing tells it those records are gone, and it
 *     drops URLs that are still live. The old behaviour was the second one.
 *  2. `lastmod` is only emitted where a real date is known - a paper's
 *     revision date, a record's last observation, an incident's resolution.
 *     Claiming `now` for every static page on every request trains crawlers to
 *     ignore the field everywhere, including where it means something.
 */

/**
 * No route-level `revalidate`: this route renders per request (see
 * `renderAtRequestTime()` below), so an ISR interval would be inert - and an
 * inert export is how this file came to look cached when it was not.
 * Caching lives in the reads
 * (`lib/track-api.ts` carries `next.revalidate`) and in the last-good fallback
 * that `readCatalogForDiscovery` keeps for six hours.
 */

/**
 * How many records get their published incidents enumerated, and how many of
 * those reads may be in flight at once.
 *
 * The incident read is one request per record, into a rate limit the rest of
 * the site shares. The ceiling on records is a bound on the sitemap's own
 * cost, not a truncation of the catalog: every record URL is listed
 * regardless, and incident URLs are discovered for the first
 * `INCIDENT_DISCOVERY_LIMIT` of them.
 */
const INCIDENT_DISCOVERY_LIMIT = 200;
const INCIDENT_DISCOVERY_CONCURRENCY = 4;

/** A date only if it parses; `undefined` otherwise, so no entry lies. */
function dateOrUndefined(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function vendorEntries(base: string, vendors: TrackVendorListItem[]): SitemapEntry[] {
  return vendors.map((vendor) => {
    const lastModified = dateOrUndefined(vendor.last_check_at);
    return {
      url: `${base}${SHARE_ROUTES.observatoryVendor(vendor.vendor_name)}`,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
      ...(lastModified ? { lastModified } : {}),
    };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Rendered per request, never baked at build time: the build has no
  // measurement API to read, so a prerender here would either fail the build or
  // cache a failure state and serve it as fact. `lib/render-at-request-time.ts`
  // carries the reasoning, including why this is not `force-dynamic`.
  await renderAtRequestTime();
  /**
   * A deployment that must not be indexed publishes no URLs at all. Emitting
   * the production record set from a preview or self-hosted origin is how a
   * crawler ends up holding two sitemaps for the same records; see
   * `lib/indexability.ts`.
   */
  if (!SITE_INDEXABLE) return [];

  const base = siteBase();
  const entries = staticSitemapEntries(base);

  // Throws when the catalog is unreadable and no last-good list remains: see
  // rule 1 above. A stale list is served deliberately and logged, never
  // silently.
  const catalog = await readCatalogForDiscovery({ pageSize: 100, maxPages: 20 });
  if (catalog.stale) {
    console.warn(
      `[sitemap] catalog unreadable; emitted ${catalog.vendors.length} record URLs from the ` +
        `last good read at ${catalog.readAt?.toISOString() ?? 'unknown time'}`
    );
  }

  const vendors = catalog.vendors.filter((v) => v.is_public !== false && v.vendor_name);
  entries.push(...vendorEntries(base, vendors));

  const discovered = await mapWithConcurrency(
    vendors.slice(0, INCIDENT_DISCOVERY_LIMIT),
    INCIDENT_DISCOVERY_CONCURRENCY,
    async (vendor): Promise<SitemapEntry[]> => {
      const read = await readVendorPublicIncidents(vendor.vendor_name);
      // An unreadable incident list contributes no URLs this cycle. It does not
      // remove the record's own URL, and it must not throw: one vendor's
      // failure should not take the whole sitemap down with it.
      if (read.kind !== 'ok') return [];

      return read.value
        .filter((incident) => incident.incident_id)
        .map((incident) => {
          const lastModified = dateOrUndefined(incident.resolved_at ?? incident.started_at);
          return {
            url: `${base}${SHARE_ROUTES.observatoryIncident(
              vendor.vendor_name,
              incident.incident_id
            )}`,
            changeFrequency: 'monthly' as const,
            priority: 0.7,
            ...(lastModified ? { lastModified } : {}),
          };
        });
    }
  );

  for (const incidentEntries of discovered) entries.push(...incidentEntries);

  return dedupeByUrl(entries);
}
