import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES } from '@/lib/seo';
import { RESEARCH_ARTICLES, researchRoute } from '@/lib/routes';
import { fetchTrackedVendors } from '@/lib/track-api';

/**
 * Production sitemap: canonical indexable URLs only.
 *
 * Excludes (deliberately): authenticated console routes, /admin/*, auth
 * pages (/login, /signup, /verify-email, /reset-password), token-scoped
 * shares (/portal/*, /reports/*), /checkout, /api/*, partner auth/support
 * slugs (/partner/login, /partner/signup, …), and legacy `/?page=*`
 * query URLs (permanently redirected to `/partner/*` by the proxy) — none
 * of which must create index bloat.
 * Includes: all canonical marketing/docs/glossary/research pages plus live
 * public vendor pages enumerated from the Track API (with graceful fallback
 * when the API is unreachable at build time).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com').replace(/\/$/, '');
  const now = new Date();

  const researchLastMod = new Map(
    RESEARCH_ARTICLES.map((a) => [researchRoute(a.slug), new Date(a.publishedAt)]),
  );

  const staticEntries: MetadataRoute.Sitemap = [
    ...PUBLIC_PAGES.map((p) => ({
      url: p.path === '/' ? `${base}/` : `${base}${p.path}`,
      lastModified: researchLastMod.get(p.path) ?? now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...RESEARCH_ARTICLES.map((a) => ({
      url: `${base}${researchRoute(a.slug)}`,
      lastModified: new Date(a.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  // Dynamic vendor pages — only for vendors the API actually returns.
  // Never fabricate vendor URLs: if the API is unreachable, emit the static
  // set only. Vendor detail pages revalidate every 60s; the sitemap lists
  // them so crawlers can discover legitimate telemetry-backed pages.
  try {
    const page = await fetchTrackedVendors(100);
    const vendorEntries: MetadataRoute.Sitemap = (page.items ?? [])
      .filter((v) => v.is_public !== false && v.vendor_name)
      .map((v) => ({
        url: `${base}/track/${encodeURIComponent(v.vendor_name)}`,
        lastModified: v.last_check_at ? new Date(v.last_check_at) : now,
        changeFrequency: 'hourly' as const,
        priority: 0.8,
      }));
    const seen = new Set(staticEntries.map((e) => e.url));
    return [...staticEntries, ...vendorEntries.filter((e) => !seen.has(e.url))];
  } catch {
    return staticEntries;
  }
}
