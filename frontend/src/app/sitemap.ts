import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES } from '@/lib/seo';
import { RESEARCH_ARTICLES, researchRoute } from '@/lib/routes';
import { fetchTrackedVendors, fetchVendorPublicIncidents } from '@/lib/track-api';

/**
 * Production sitemap: canonical indexable URLs only.
 *
 * Excludes (deliberately): authenticated console routes, /admin/*, auth
 * pages (/login, /signup, /verify-email, /reset-password), token-scoped
 * shares (/portal/*, /reports/*), /checkout, /api/*, partner auth/support
 * slugs (/partner/login, /partner/signup, …), legacy `/?page=*` query URLs
 * (permanently redirected to `/partner/*` by the proxy), and the former
 * `/partner/tiers` + `/partner/premium` pages (now permanent redirects) -
 * none of which must create index bloat.
 *
 * Includes: all canonical marketing/docs/glossary/research pages, the
 * research hub and its nested articles, live public vendor pages enumerated
 * from the Track API, and - only when the measurement API actually lists them -
 * permanent public incident pages. No URL is ever emitted because a route
 * could render it; a URL enters the sitemap when the data behind it exists.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com').replace(/\/$/, '');
  const now = new Date();

  /** An article's lastmod follows its most recent substantive edit. */
  const articleModified = (a: (typeof RESEARCH_ARTICLES)[number]): Date =>
    'updatedAt' in a && typeof a.updatedAt === 'string'
      ? new Date(a.updatedAt)
      : new Date(a.publishedAt);

  const staticEntries: MetadataRoute.Sitemap = [
    ...PUBLIC_PAGES.map((p) => ({
      url: p.path === '/' ? `${base}/` : `${base}${p.path}`,
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...RESEARCH_ARTICLES.map((a) => ({
      url: `${base}${researchRoute(a.slug)}`,
      lastModified: articleModified(a),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  // Dynamic vendor pages - only for vendors the API actually returns.
  // Never fabricate vendor URLs: if the API is unreachable, emit the static
  // set only. Vendor detail pages revalidate every 60s; the sitemap lists
  // them so crawlers can discover legitimate telemetry-backed pages.
  // Incident pages join the same way: fetched per vendor, included only when
  // the published-incident endpoint actually returns a record.
  try {
    const page = await fetchTrackedVendors(100);
    const vendors = (page.items ?? []).filter((v) => v.is_public !== false && v.vendor_name);
    const vendorEntries: MetadataRoute.Sitemap = vendors.map((v) => ({
      url: `${base}/track/${encodeURIComponent(v.vendor_name)}`,
      lastModified: v.last_check_at ? new Date(v.last_check_at) : now,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    }));

    const incidentEntries: MetadataRoute.Sitemap = (
      await Promise.all(
        vendors.slice(0, 24).map(async (v) => {
          try {
            const incidents = await fetchVendorPublicIncidents(v.vendor_name);
            return (incidents ?? []).map((inc) => ({
              url: `${base}/track/${encodeURIComponent(v.vendor_name)}/incidents/${inc.incident_id}`,
              lastModified: new Date(inc.resolved_at ?? inc.started_at),
              changeFrequency: 'monthly' as const,
              priority: 0.7,
            }));
          } catch {
            return [] as MetadataRoute.Sitemap;
          }
        })
      )
    ).flat();

    const seen = new Set(staticEntries.map((e) => e.url));
    return [
      ...staticEntries,
      ...vendorEntries.filter((e) => !seen.has(e.url)),
      ...incidentEntries.filter((e) => !seen.has(e.url)),
    ];
  } catch {
    return staticEntries;
  }
}
