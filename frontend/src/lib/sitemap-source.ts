import type { MetadataRoute } from 'next';

import { PUBLIC_PAGES } from '@/lib/seo';
import { RESEARCH_ARTICLES, SHARE_ROUTES, researchRoute } from '@/lib/routes';
import { SITE_URL } from '@/lib/site-url';

/**
 * Pure sitemap composition.
 *
 * This module exists so the sitemap's *rules* can be tested without a network,
 * a filesystem or a Next.js request context: which URLs are eligible, what a
 * `lastmod` is allowed to claim, and how duplicates are resolved. `app/sitemap.ts`
 * is then only the part that has to be impure - reading the catalog.
 *
 * Two defects lived in the previous inline version and both are structural
 * rather than incidental, which is why they are encoded here as functions with
 * tests:
 *
 *  1. Research papers were emitted twice (once from `PUBLIC_PAGES`, which
 *     already contains every article, and once from a second mapping of
 *     `RESEARCH_ARTICLES`), with two different `lastmod` values for the same
 *     URL. A sitemap that contradicts itself about one URL is a signal the
 *     site does not know its own canonical set.
 *  2. Every static entry claimed `lastModified: now`, on every request. A
 *     `lastmod` that changes whenever a crawler asks is worse than no
 *     `lastmod`: it trains the crawler to ignore the field, including on the
 *     records where the date is real.
 */

export type Sitemap = MetadataRoute.Sitemap;
export type SitemapEntry = Sitemap[number];

/**
 * Absolute site origin with no trailing slash.
 *
 * Defaults to the same `SITE_URL` every canonical URL on the site is built
 * from, so the sitemap and the pages cannot disagree about the origin. The
 * argument is a test seam.
 */
export function siteBase(envUrl?: string | null): string {
  return (envUrl ?? SITE_URL).replace(/\/$/, '');
}

/** Canonical absolute URL for one path, keeping `/` as `/`. */
export function absoluteUrl(base: string, path: string): string {
  return path === '/' ? `${base}/` : `${base}${path}`;
}

/** The real edit date of one research paper, or `null` when the corpus carries none. */
export function articleLastModified(
  article: (typeof RESEARCH_ARTICLES)[number]
): Date | null {
  const raw =
    'updatedAt' in article && typeof article.updatedAt === 'string'
      ? article.updatedAt
      : article.publishedAt;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The static half of the sitemap, derived from `PUBLIC_PAGES` alone.
 *
 * `lastModified` is emitted only where a real date exists - today that means
 * the research papers, whose corpus carries publication and revision dates.
 * Everything else omits the field rather than inventing one.
 */
export function staticSitemapEntries(base: string = siteBase()): Sitemap {
  const knownDates = new Map<string, Date>();
  for (const article of RESEARCH_ARTICLES) {
    const date = articleLastModified(article);
    if (date) knownDates.set(researchRoute(article.slug), date);
  }

  return PUBLIC_PAGES.map((page) => {
    const lastModified = knownDates.get(page.path);
    return {
      url: absoluteUrl(base, page.path),
      changeFrequency: page.changeFrequency,
      priority: page.priority,
      ...(lastModified ? { lastModified } : {}),
    };
  });
}

/**
 * One entry per measured vendor: its direct-answer question page
 * (`/down/{vendor}`, "Is {vendor} down?").
 *
 * The URL set is exactly the vendor set passed in - the same catalog read
 * that produced the record URLs, so the two lists cannot disagree about
 * which vendors exist. No lastmod: the answer re-composes on every
 * revalidation from observations that carry their own timestamps in the
 * facts, so the sitemap has no separate date to claim.
 */
export function questionEntries(
  base: string,
  vendors: ReadonlyArray<{ vendor_name: string | null | undefined }>
): Sitemap {
  return vendors
    .filter((vendor) => !!vendor.vendor_name)
    .map((vendor) => ({
      url: absoluteUrl(base, SHARE_ROUTES.vendorQuestion(vendor.vendor_name as string)),
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    }));
}

/**
 * One entry per URL.
 *
 * The first entry for a URL wins on `changeFrequency` and `priority`, because
 * that is the entry the caller listed deliberately. A known `lastModified`
 * beats an unknown one regardless of order, so merging a discovered record set
 * into the static set cannot erase a real date.
 */
export function dedupeByUrl(entries: readonly SitemapEntry[]): Sitemap {
  const byUrl = new Map<string, SitemapEntry>();

  for (const entry of entries) {
    const existing = byUrl.get(entry.url);
    if (!existing) {
      byUrl.set(entry.url, { ...entry });
      continue;
    }
    if (!existing.lastModified && entry.lastModified) {
      existing.lastModified = entry.lastModified;
    }
  }

  return [...byUrl.values()];
}

/**
 * Map with a ceiling on simultaneous in-flight promises.
 *
 * Discovery reads one endpoint per record. Unbounded `Promise.all` over a
 * growing catalog would fire every one of them at once into a rate limit that
 * the rest of the site shares, so the concurrency is explicit and small.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(limit, items.length || 1));
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
