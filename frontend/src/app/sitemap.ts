import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com';
  const now = new Date();

  // Static public routes — vendor pages are dynamic, listed via Track API in production sitemap
  const routes = ['', '/track', '/login', '/signup', '/verify-email'].map((path) => ({
    url: `${base}${path || '/'}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.7,
  }));

  return routes;
}
