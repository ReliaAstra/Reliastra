import { describe, expect, it } from 'vitest';

import { PUBLIC_PAGES } from '@/lib/seo';
import { RESEARCH_ARTICLES, researchRoute } from '@/lib/routes';
import {
  absoluteUrl,
  articleLastModified,
  dedupeByUrl,
  mapWithConcurrency,
  siteBase,
  staticSitemapEntries,
} from '@/lib/sitemap-source';

/**
 * The sitemap's composition rules, tested without a network.
 *
 * Two defects lived here and both are invisible in a rendered page: every
 * research paper was listed twice with two different `lastmod` values, and
 * every static entry claimed to have been modified at the moment the sitemap
 * was requested. A sitemap is the one document where a crawler takes the
 * site's word for what exists and when it changed, so it has to be right in
 * the ways that cannot be seen.
 */

describe('the static half of the sitemap', () => {
  const entries = staticSitemapEntries('https://reliastra.com');

  it('emits every public page exactly once', () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(entries).toHaveLength(PUBLIC_PAGES.length);
  });

  it('lists each research paper once, not twice', () => {
    for (const article of RESEARCH_ARTICLES) {
      const url = `https://reliastra.com${researchRoute(article.slug)}`;
      expect(entries.filter((e) => e.url === url)).toHaveLength(1);
    }
  });

  it('gives a research paper its real revision date', () => {
    for (const article of RESEARCH_ARTICLES) {
      const url = `https://reliastra.com${researchRoute(article.slug)}`;
      const entry = entries.find((e) => e.url === url);
      expect(entry?.lastModified).toEqual(articleLastModified(article) ?? undefined);
      expect(entry?.lastModified).toBeInstanceOf(Date);
    }
  });

  it('omits lastmod rather than inventing one', () => {
    // A `lastmod` that changes on every request trains a crawler to ignore the
    // field, including on the records where the date is real. Pages whose
    // source carries no date must ship without one.
    const dated = entries.filter((e) => e.lastModified);
    const undated = entries.filter((e) => !e.lastModified);

    expect(undated.length).toBeGreaterThan(0);
    expect(dated.length).toBe(RESEARCH_ARTICLES.length);

    const homepage = entries.find((e) => e.url === 'https://reliastra.com/');
    expect(homepage?.lastModified).toBeUndefined();
  });

  it('never emits a lastmod in the future or at the epoch', () => {
    for (const entry of entries) {
      if (!entry.lastModified) continue;
      const time = new Date(entry.lastModified).getTime();
      expect(Number.isNaN(time)).toBe(false);
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThanOrEqual(Date.now());
    }
  });

  it('keeps the homepage URL a bare origin', () => {
    expect(entries.some((e) => e.url === 'https://reliastra.com/')).toBe(true);
    expect(absoluteUrl('https://reliastra.com', '/')).toBe('https://reliastra.com/');
    expect(absoluteUrl('https://reliastra.com', '/observatory')).toBe(
      'https://reliastra.com/observatory'
    );
  });
});

describe('siteBase', () => {
  it('strips a trailing slash and defaults to the canonical origin', () => {
    expect(siteBase('https://example.test/')).toBe('https://example.test');
    expect(siteBase('')).toBe('');
    expect(siteBase()).toBe('https://reliastra.com');
  });
});

describe('dedupeByUrl', () => {
  it('keeps one entry per URL', () => {
    const result = dedupeByUrl([
      { url: 'https://x.test/a', priority: 0.9 },
      { url: 'https://x.test/a', priority: 0.1 },
      { url: 'https://x.test/b', priority: 0.5 },
    ]);

    expect(result.map((e) => e.url)).toEqual(['https://x.test/a', 'https://x.test/b']);
  });

  it('keeps the first entry’s priority and change frequency', () => {
    const result = dedupeByUrl([
      { url: 'https://x.test/a', priority: 0.9, changeFrequency: 'daily' },
      { url: 'https://x.test/a', priority: 0.1, changeFrequency: 'yearly' },
    ]);

    expect(result[0].priority).toBe(0.9);
    expect(result[0].changeFrequency).toBe('daily');
  });

  it('prefers a known lastmod over an absent one, in either order', () => {
    const date = new Date('2026-09-01T00:00:00Z');
    expect(
      dedupeByUrl([
        { url: 'https://x.test/a' },
        { url: 'https://x.test/a', lastModified: date },
      ])[0].lastModified
    ).toEqual(date);
    expect(
      dedupeByUrl([
        { url: 'https://x.test/a', lastModified: date },
        { url: 'https://x.test/a' },
      ])[0].lastModified
    ).toEqual(date);
  });

  it('does not mutate the entries it is given', () => {
    const input = [{ url: 'https://x.test/a' }, { url: 'https://x.test/a' }];
    dedupeByUrl(input);
    expect(input).toHaveLength(2);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('never exceeds the concurrency ceiling', async () => {
    // Discovery reads one endpoint per record into a rate limit the rest of the
    // site shares, so the ceiling is the point of the helper.
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 40 }, (_, i) => i), 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return null;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('handles an empty list and a ceiling above its length', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (n) => n)).toEqual([1, 2]);
  });

  it('treats a ceiling below one as one', async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n) => n)).toEqual([1, 2, 3]);
  });
});
