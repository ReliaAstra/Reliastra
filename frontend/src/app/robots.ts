import type { MetadataRoute } from 'next';

import { SITE_INDEXABLE } from '@/lib/indexability';
import { siteBase } from '@/lib/sitemap-source';

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
 *
 * ── Why there is no `Allow: /` ────────────────────────────────────────────
 *
 * A blanket allow used to sit in this rule, and Next.js emits `Allow` lines
 * before `Disallow` lines for a rule. The Robots Exclusion Protocol has two
 * readings of that ordering: longest-match (Google, and Python's
 * `urllib.robotparser` from 3.13) where `Allow: /` loses to any more specific
 * `Disallow`, and first-match (Python `urllib.robotparser` up to 3.12, and
 * ports of it - which is where a lot of LLM and agent crawlers live) where
 * `Allow: /` matches everything first and voids every `Disallow` below it.
 * Under the second reading this file published the console, the admin surface
 * and the auth pages as crawlable.
 *
 * Everything not disallowed is allowed by default, so the blanket `Allow` was
 * never adding permission - only ambiguity. A non-production deployment gets
 * an unconditional `Disallow: /` instead; see `lib/indexability.ts`.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteBase();

  /**
   * A deployment that is not the production site must not be indexed, and the
   * only reliable way to say that to every crawler is an unconditional
   * disallow. Note there is deliberately no `sitemap` line here: advertising a
   * sitemap from a preview host is how preview URLs end up in an index.
   */
  if (!SITE_INDEXABLE) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

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
    '/r/',
    '/r',
    '/referral-unavailable',
    // The plain-Markdown guides are published at /docs/<slug>.md, which stays
    // crawlable. /docs-md/ is only the internal destination of that rewrite
    // (see next.config.ts) - the same words at a second URL, so crawlers get
    // one canonical path and the handler adds X-Robots-Tag: noindex as well.
    '/docs-md/',
  ];
  return {
    rules: [
      {
        userAgent: '*',
        // No blanket `allow`: see the note at the top of this file. Everything
        // not listed below is crawlable by default, and the omission is what
        // keeps the disallow list meaningful to a first-match interpreter.
        disallow,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
