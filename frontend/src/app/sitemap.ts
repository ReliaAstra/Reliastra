import type { MetadataRoute } from 'next';
import {
  AUTH_ROUTES,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  partnerUrl,
  researchRoute,
} from '@/lib/routes';

/**
 * Public sitemap.
 *
 * Derived from `@/lib/routes` so a route the app actually serves and a route
 * the sitemap advertises cannot diverge. `/privacy` and `/terms` were being
 * served but never listed here, and the research articles did not exist at all.
 *
 * Vendor pages (`/track/[vendor]`) are intentionally excluded: they are dynamic
 * and would need the Track API to enumerate.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com';
  const now = new Date();

  const highPriority = [PUBLIC_ROUTES.home, PUBLIC_ROUTES.track];
  const paths = [
    PUBLIC_ROUTES.home,
    PUBLIC_ROUTES.track,
    PUBLIC_ROUTES.research,
    ...RESEARCH_ARTICLES.map((article) => researchRoute(article.slug)),
    PUBLIC_ROUTES.privacy,
    PUBLIC_ROUTES.terms,
    AUTH_ROUTES.login,
    AUTH_ROUTES.signup,
    AUTH_ROUTES.verifyEmail,
    AUTH_ROUTES.resetPassword,
    // Partner network entry points. These are query-parameter routes on `/`
    // because the partner experience is state-routed; listing them keeps the
    // public partner surface discoverable.
    partnerUrl('home'),
    partnerUrl('signup'),
  ];

  return [...new Set(paths)].map((path) => ({
    url: `${base}${path === PUBLIC_ROUTES.home ? '/' : path}`,
    lastModified:
      RESEARCH_ARTICLES.find((a) => path === researchRoute(a.slug))
        ? new Date(
            RESEARCH_ARTICLES.find((a) => path === researchRoute(a.slug))!
              .publishedAt
          )
        : now,
    changeFrequency: 'weekly' as const,
    priority: highPriority.includes(path as (typeof highPriority)[number]) ? 1 : 0.7,
  }));
}
