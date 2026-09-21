/**
 * The rendering contract for every surface that reads the measurement API.
 *
 * Two facts drive it, and they pull in opposite directions:
 *
 *  1. `next build` prerenders any route with no request-time dependency, and the
 *     build environment has no measurement API. A prerender of these surfaces is
 *     never neutral: it either fails the build (where the read throws, because a
 *     5xx beats publishing an empty index) or bakes the *failure state* into the
 *     deployment artifact, where the caught read renders "the measurement API
 *     cannot be reached" and every visitor is served that until the next deploy.
 *  2. The reads are cached on purpose - `lib/track-api.ts` attaches
 *     `next.revalidate` to each one - because the hub's fan-out is a catalog walk
 *     plus a bounded detail prefix. Anything that turns those fetches back into
 *     `no-store` puts the whole fan-out on every request path, which is the
 *     defect the dependency-index audit recorded as C1.
 *
 * `renderAtRequestTime()` satisfies both: it stops prerendering at one line and
 * leaves the Data Cache alone. These tests hold the line in both directions -
 * the surfaces that must render per request, and the per-path record pages that
 * must stay on ISR so a failed revalidation keeps serving the last good render.
 *
 * Source-level, on purpose: the behaviour being protected is what the *build*
 * does, and a build is not something a unit test can run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND = join(__dirname, '..', '..', '..');
const source = (relative: string): string => readFileSync(join(FRONTEND, relative), 'utf8');

const SIGNAL = 'await renderAtRequestTime();';

/**
 * Route-segment config actually declared by a file.
 *
 * Filtered to lines that begin with the declaration: these routes are documented
 * in place, and the prose explains why `force-dynamic` and an inert `revalidate`
 * are *not* used. Matching the raw source would read that explanation as the
 * defect it is describing.
 */
const segmentConfig = (src: string): string[] =>
  src
    .split('\n')
    .filter((line) => /^\s*export const (revalidate|dynamic|dynamicParams|fetchCache)\b/.test(line))
    .map((line) => line.trim());

/**
 * Surfaces that read the catalog, with the first upstream read on their request
 * path. The signal has to come first: `connection()` only excludes work that
 * follows it, so a read placed above it is still prerendered at build time.
 *
 * `llms.txt` names its helper rather than `readCatalogForDiscovery` because the
 * read lives in `recordsSection()`, defined above the handler that calls it.
 */
const REQUEST_TIME_SURFACES = [
  {
    path: 'src/app/sitemap.ts',
    firstRead: 'await readCatalogForDiscovery(',
    surface: 'sitemap.xml',
  },
  {
    path: 'src/app/observatory/page.tsx',
    firstRead: 'await fetchTrackedVendorsAll(',
    surface: '/observatory',
  },
  {
    path: 'src/app/llms.txt/route.ts',
    firstRead: 'await recordsSection()',
    surface: '/llms.txt',
  },
  {
    path: 'src/app/research/ai-infrastructure/page.tsx',
    firstRead: 'await fetchTrackedVendors(60)',
    surface: '/research/ai-infrastructure',
  },
  {
    path: 'src/components/site/home/index-scene.tsx',
    firstRead: 'await fetchTrackedVendors(9)',
    surface: 'the homepage index section',
  },
] as const;

/**
 * Record pages, prerendered per path and revalidated on an interval. They must
 * NOT take the request-time signal: it would pull them out of ISR and remove the
 * last-good-render fallback that keeps a record readable through an outage.
 */
const PER_PATH_ISR_SURFACES = [
  { path: 'src/app/observatory/[vendor]/page.tsx', revalidate: 'export const revalidate = 60;' },
  {
    path: 'src/app/observatory/[vendor]/incidents/[id]/page.tsx',
    revalidate: 'export const revalidate = 300;',
  },
] as const;

describe('request-time rendering', () => {
  it('signals before the first upstream read on every surface that reads the catalog', () => {
    for (const { path, firstRead, surface } of REQUEST_TIME_SURFACES) {
      const src = source(path);
      const signalAt = src.indexOf(SIGNAL);
      const readAt = src.indexOf(firstRead);

      expect(signalAt, `${surface} never calls renderAtRequestTime() - a build prerenders it`).toBeGreaterThan(-1);
      expect(readAt, `${surface}: could not find its first read (${firstRead})`).toBeGreaterThan(-1);
      expect(
        signalAt,
        `${surface} reads upstream before signalling, so that read still runs at build time`
      ).toBeLessThan(readAt);
    }
  });

  it('routes the signal through Next connection(), so a build actually stops prerendering', () => {
    const helper = source('src/lib/render-at-request-time.ts');

    expect(helper).toContain("import { connection } from 'next/server'");
    expect(helper).toContain('await connection();');
  });

  it('does not reach for force-dynamic, which would discard the Data Cache these reads live in', () => {
    for (const { path, surface } of REQUEST_TIME_SURFACES) {
      // Equivalent to { cache: 'no-store', next: { revalidate: 0 } } on every
      // fetch in the route: it stops prerendering too, and reopens C1.
      const declared = segmentConfig(source(path));
      expect(declared, `${surface} opts out of caching wholesale: ${declared.join(', ')}`).toEqual(
        declared.filter((line) => !line.includes('force-dynamic'))
      );
    }
  });

  it('declares no route-level revalidate where the route renders per request', () => {
    for (const { path, surface } of REQUEST_TIME_SURFACES) {
      // Inert config reads like a guarantee. The audit that prompted this found
      // `export const revalidate = 60` on a route that could never be revalidated.
      const declared = segmentConfig(source(path));
      expect(declared, `${surface} exports an inert revalidate: ${declared.join(', ')}`).toEqual(
        declared.filter((line) => !line.startsWith('export const revalidate'))
      );
    }
  });

  it('leaves the per-path record pages on ISR', () => {
    for (const { path, revalidate } of PER_PATH_ISR_SURFACES) {
      const src = source(path);

      expect(src, `${path} lost its revalidation interval`).toContain(revalidate);
      expect(src, `${path} took the request-time signal and left ISR`).not.toContain(SIGNAL);
    }
  });
});
