import type { MetadataRoute } from 'next';

/**
 * Deliberate crawler policy.
 *
 * Index: homepage, marketing pages, research, docs, glossary, public vendor
 * tracking pages, legal pages.
 *
 * Keep out of the index: authenticated console (/dashboard, /dependencies,
 * /incidents, /evidence, /clients, /settings, /onboarding, /support),
 * /admin/*, auth pages, token-scoped shares (/portal/*, /reports/*),
 * /checkout (per-customer, uncacheable), and /api/*.
 *
 * CSS/JS/image resources are NOT blocked - crawlers need them to render
 * public pages.
 */
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com').replace(/\/$/, '');
  const disallow = [
    '/admin/',
    '/admin',
    '/dashboard',
    '/dependencies',
    '/incidents',
    '/evidence',
    '/clients',
    '/settings',
    '/onboarding',
    '/support',
    '/portal/',
    '/portal',
    '/reports/',
    '/reports',
    '/checkout',
    '/api/',
    '/api',
    '/login',
    '/signup',
    '/verify-email',
    '/reset-password',
  ];
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
