import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PUBLIC_PAGES } from '@/lib/seo';
import robots from '@/app/robots';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Source with comments removed, so assertions test declarations, not prose. */
const codeOf = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/**
 * The URL identity contract.
 *
 * Forensic finding: the root layout used to declare
 * `alternates.canonical: https://reliastra.com` and
 * `openGraph.url: https://reliastra.com`. Next.js merges route metadata
 * with the layout, so every page that did not set its own identity -
 * `/observatory/incidents` and every filtered view, the legal pages -
 * canonicalized to the homepage and reported `og:url` as the homepage.
 * Search systems then associated deep-page titles/snippets with
 * `https://reliastra.com/`. The layout carried the defect; the pages only
 * inherited it.
 *
 * The contract, enforced here:
 *
 *   canonical(path) === SITE_URL + normalized(path), page by page
 *   og:url(path) === canonical(path), page by page
 *   the homepage is the ONLY page whose identity is the bare origin
 *
 * These are source scans, not renders: identity must be present in the
 * declaration, not assembled at request time where a fallback could
 * silently substitute the homepage.
 */

describe('root layout carries no page identity', () => {
  it('declares no canonical', () => {
    expect(codeOf('src/app/layout.tsx')).not.toMatch(/canonical/);
  });

  it('declares no openGraph url', () => {
    const source = codeOf('src/app/layout.tsx');
    const openGraph = source.slice(source.indexOf('openGraph'));
    // An image fallback (`url: "/opengraph-image.png"`) is not a page
    // identity; a page URL is. Only the latter may not appear here.
    const pageUrls = [...openGraph.matchAll(/^\s*url:(.*)$/gm)]
      .map((m) => m[1].trim())
      .filter((value) => !value.includes('opengraph-image') && !value.includes('logo'));
    expect(pageUrls).toEqual([]);
  });
});

describe('fixed public pages declare self identity', () => {
  // PUBLIC_PAGES entries that resolve to one literal file. Entries served
  // by a dynamic route (glossary terms, hub papers) are covered by the
  // family test below instead.
  const DYNAMIC_PREFIXES = ['/glossary/', '/research/', '/docs/'];
  const toFile = (path: string) =>
    path === '/' ? 'src/app/page.tsx' : `src/app${path}/page.tsx`;
  const cases = PUBLIC_PAGES.map((p) => p.path);

  it.each(cases)('%s', (path) => {
    const file = toFile(path);
    if (!existsSync(join(ROOT, file))) {
      // No literal file: the path must belong to a known dynamic family,
      // whose identity is asserted in the family test. An unknown prefix
      // here means a sitemap URL with no route behind it.
      expect(
        DYNAMIC_PREFIXES.some((prefix) => path.startsWith(prefix)),
        `${path} has no page file and no known dynamic family`
      ).toBe(true);
      return;
    }
    const source = codeOf(file);
    const usesBuilder = source.includes('buildMetadata');
    if (usesBuilder) {
      // buildMetadata emits canonicalUrl(path) + matching og:url.
      expect(source).toMatch(/buildMetadata\(\{/);
      return;
    }
    expect(source, `${path} must declare its own canonical`).toMatch(/canonical/);
    expect(source, `${path} must declare its own openGraph`).toMatch(/openGraph/);
  });
});

describe('dynamic public families declare self identity per record', () => {
  const families = [
    'src/app/observatory/page.tsx',
    'src/app/observatory/[vendor]/page.tsx',
    'src/app/observatory/[vendor]/incidents/[id]/page.tsx',
    'src/app/observatory/incidents/page.tsx',
    'src/app/down/[vendor]/page.tsx',
    'src/app/docs/[slug]/page.tsx',
    'src/app/glossary/[term]/page.tsx',
    'src/app/research/[slug]/page.tsx',
  ];

  it.each(families)('%s', (file) => {
    const source = codeOf(file);
    if (source.includes('buildMetadata')) {
      // buildMetadata emits canonicalUrl(path) + matching og:url.
      expect(source).toMatch(/buildMetadata\(\{/);
      return;
    }
    expect(source, `${file} must compute a canonical`).toMatch(/canonical/);
    expect(source, `${file} must render an openGraph block`).toMatch(/openGraph/);
    // An og:url must exist that is NOT the bare origin. Both the explicit
    // `url: <expr>` form and the `url,` shorthand (bound to a self variable)
    // count; literals are checked individually below.
    const explicit = [...source.matchAll(/^\s*url:\s*([^,\n]+)/gm)].map((m) => m[1].trim());
    const shorthand = /^\s*url,$/m.test(source);
    expect(explicit.length + (shorthand ? 1 : 0), `${file} must set og:url`).toBeGreaterThan(0);
    for (const url of explicit) {
      expect(url, `${file} must not point og:url at the bare origin`).not.toMatch(
        /^['"]?https?:\/\/reliastra\.com['"]?$/
      );
      expect(url, `${file} must not point og:url at SITE_URL alone`).not.toBe('SITE_URL');
    }
    if (shorthand) {
      // The shorthand must resolve to a self URL variable, not the origin.
      expect(source, `${file} binds og:url to a computed self URL`).toMatch(
        /const url = canonicalUrl\(/
      );
    }
  });

  it('resolves the incidents index og:url from the same path as its canonical', () => {
    const source = codeOf('src/app/observatory/incidents/page.tsx');
    expect(source).toMatch(/canonicalPath/);
    expect(source).toMatch(/url:\s*selfUrl/);
  });
});

describe('homepage is the only bare-origin identity', () => {
  it('no non-root page claims canonicalUrl("/") as its identity', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (!full.includes('(console)') && !full.includes('/admin/') && !full.includes('/api/')) walk(full);
        } else if (entry === 'page.tsx') {
          files.push(full);
        }
      }
    };
    walk(join(ROOT, 'src/app'));
    for (const file of files) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (rel === 'src/app/page.tsx') continue;
      // The Organization's own URL legitimately IS the homepage (creator /
      // publisher references, breadcrumb home entries). Everything else
      // naming the bare origin is a page identifying as the homepage.
      const source = codeOf(rel)
        .split('\n')
        .filter((line) => !/creator|publisher|path:\s*['"]\/['"]/.test(line))
        .join('\n');
      expect(source, `${file} must not identify as the homepage`).not.toMatch(
        /canonicalUrl\(\s*['"]\/['"]\s*\)/
      );
    }
  });
});

describe('robots keeps the contract private where it must be', () => {
  it('disallows auth working surfaces but not the question pages', () => {
    const text = JSON.stringify(robots());
    expect(text).toContain('/auth');
    expect(text).not.toMatch(/"disallow":"\/down/);
  });
});
