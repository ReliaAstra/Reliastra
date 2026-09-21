import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PRODUCTION_HOSTS, isIndexableSite } from '@/lib/site-url';

/**
 * Which deployments may be indexed, and the guard that keeps the two
 * implementations of that rule - `lib/site-url.ts` and `next.config.ts` - from
 * drifting apart.
 *
 * The gate exists because every page publishes a canonical URL pointing at the
 * production origin. A preview, staging or self-hosted build that serves
 * `index, follow` asks a crawler to index a duplicate of the real dependency
 * records, and the duplicate is the one that gets found first.
 */

const CONFIG = readFileSync(resolve(__dirname, '../../../next.config.ts'), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('isIndexableSite', () => {
  it('indexes the canonical production host', () => {
    expect(isIndexableSite('https://reliastra.com')).toBe(true);
    expect(isIndexableSite('https://www.reliastra.com')).toBe(true);
  });

  it('does not index any other host', () => {
    for (const url of [
      'https://staging.reliastra.com',
      'https://preview-abc123.e2b.app',
      'https://reliastra-git-fix-vercel.app',
      'https://reliastra.example',
      'https://reliastra.com.evil.test',
      'http://localhost:3000',
    ]) {
      expect(isIndexableSite(url), url).toBe(false);
    }
  });

  it('does not index an origin it cannot parse', () => {
    expect(isIndexableSite('not a url')).toBe(false);
    expect(isIndexableSite('')).toBe(false);
  });

  it('is case- and trailing-slash-insensitive about the host', () => {
    expect(isIndexableSite('https://RELIASTRA.com/')).toBe(true);
    expect(isIndexableSite('https://WWW.reliastra.com')).toBe(true);
  });

  it('honours an explicit opt-in for a self-hosted deployment', () => {
    expect(isIndexableSite('https://deps.example.test', 'true')).toBe(true);
  });

  it('honours an explicit opt-out even on the production host', () => {
    expect(isIndexableSite('https://reliastra.com', 'false')).toBe(false);
  });

  it('ignores an override value that is not a boolean', () => {
    expect(isIndexableSite('https://staging.reliastra.com', 'yes')).toBe(false);
    expect(isIndexableSite('https://reliastra.com', 'TRUE')).toBe(true);
  });
});

describe('robotsDirective', () => {
  it('passes a page’s own preference through on the production host', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://reliastra.com');
    vi.resetModules();
    const { robotsDirective, SITE_INDEXABLE } = await import('@/lib/indexability');

    expect(SITE_INDEXABLE).toBe(true);
    expect(robotsDirective({ index: true, follow: true })).toEqual({
      index: true,
      follow: true,
    });
    // A page that asks not to be indexed is still not indexed.
    expect(robotsDirective({ index: false, follow: true })).toEqual({
      index: false,
      follow: true,
    });
  });

  it('overrides every page on a host that must not be indexed', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.reliastra.example');
    vi.resetModules();
    const { robotsDirective, SITE_INDEXABLE } = await import('@/lib/indexability');

    expect(SITE_INDEXABLE).toBe(false);
    expect(robotsDirective({ index: true, follow: true })).toEqual({
      index: false,
      follow: false,
      noarchive: true,
    });
  });
});

describe('next.config.ts applies the same gate', () => {
  /**
   * The config file is evaluated outside the app bundle and cannot import
   * `lib/site-url.ts`, so the rule is written there a second time. This is the
   * drift guard: if one list changes, this fails.
   */
  it('names exactly the production hosts this module names', () => {
    const block = CONFIG.slice(CONFIG.indexOf('const INDEXABLE_DEPLOYMENT'));
    expect(block).not.toBe('');
    const hosts = [...block.matchAll(/CONFIGURED_HOST === "([^"]+)"/g)].map((m) => m[1]);

    expect(new Set(hosts)).toEqual(new Set([...PRODUCTION_HOSTS]));
  });

  it('reads the same override variable', () => {
    expect(CONFIG).toContain('process.env.NEXT_PUBLIC_SITE_INDEXABLE');
    expect(CONFIG).toContain('"true"');
    expect(CONFIG).toContain('"false"');
  });

  it('sends X-Robots-Tag when the deployment is not indexable', () => {
    // The header is the half of the gate that holds even on a route that sets
    // its own metadata, so it has to be there.
    expect(CONFIG).toContain('INDEXABLE_DEPLOYMENT');
    expect(CONFIG).toMatch(/X-Robots-Tag/);
    expect(CONFIG).toMatch(/noindex, nofollow, noarchive/);
  });

  it('does not send an invalid X-Frame-Options token', () => {
    /**
     * `ALLOWALL` is not a valid X-Frame-Options value: browsers ignored it, and
     * in production it collided with the SAMEORIGIN Caddy sets on every
     * response, putting two headers on one document.
     *
     * The config keeps a comment explaining why the header is gone, so the token
     * is checked against the code lines only. The second assertion is the actual
     * fix: Caddy owns X-Frame-Options, so the app must not emit a header entry
     * for it at all - a valid value would still be a second header.
     */
    const code = CONFIG.split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toContain('ALLOWALL');
    expect(CONFIG).not.toMatch(/key:\s*['"]X-Frame-Options['"]/i);
  });

  it('does not set Content-Type for the llms files the route handlers own', () => {
    const llmsBlocks = [...CONFIG.matchAll(/source: "\/llms[^"]*",\s*headers: \[([^\]]*)\]/g)];
    for (const block of llmsBlocks) {
      expect(block[1]).not.toContain('Content-Type');
    }
    /**
     * The stronger form, and the one that holds today: the `/llms*` header
     * entries were removed outright rather than edited, so the loop above has
     * nothing to iterate. What must stay true is that no header rule anywhere
     * in this file sets Content-Type - a route handler knows the charset it
     * emitted, and a second header on the same response is the defect.
     */
    expect(CONFIG).not.toMatch(/key:\s*['"]Content-Type['"]/i);
  });
});
