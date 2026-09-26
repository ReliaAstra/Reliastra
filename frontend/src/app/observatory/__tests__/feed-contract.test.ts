import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The serving contract of every RSS route, asserted against the sources.
 *
 * The rule that matters most is the degrade rule: an unreadable measurement
 * API degrades a feed to a valid empty document, because a 5xx feed is how
 * outage storms get amplified - feed readers poll infrastructure hardest
 * exactly when it is failing. The one deliberate exception is the
 * per-vendor feed's 404 for an untracked name: that URL was never valid.
 */

const OBSERVATORY = resolve(__dirname, '..');
const read = (rel: string) =>
  readFileSync(resolve(OBSERVATORY, rel), 'utf8');

const builder = read('../../lib/observatory/feed.ts');
const globalFeed = read('incidents/feed.xml/route.ts');
const vendorFeed = read('[vendor]/incidents/feed.xml/route.ts');
const catalogFeed = read('catalog.xml/route.ts');

describe('the shared feed builder', () => {
  it('is the only place feed XML is composed', () => {
    for (const [name, route] of [
      ['global', globalFeed],
      ['per-vendor', vendorFeed],
      ['catalog', catalogFeed],
    ] as const) {
      expect(route, `${name} feed uses the shared builder`).toContain(
        'rssChannelXml('
      );
      expect(route, `${name} feed uses shared headers`).toContain(
        'feedHeaders()'
      );
    }
  });

  it('keeps the degrade rule stated where a reader can find it', () => {
    expect(builder).toMatch(/valid, intentionally empty document/);
  });
});

describe('the global incident feed', () => {
  it('reads the cross-vendor search, never a parallel source', () => {
    expect(globalFeed).toContain('readPublicIncidents(');
  });

  it('degrades to empty items on an unreadable API, never a 5xx', () => {
    expect(globalFeed).toMatch(/read\.kind === 'ok' \? read\.value\.items : \[\]/);
    expect(globalFeed).not.toMatch(/throw /);
  });
});

describe('the per-vendor incident feed', () => {
  it('reads the same search with the vendor filter', () => {
    expect(vendorFeed).toContain('readPublicIncidents(');
    expect(vendorFeed).toContain('vendor: detailRead.value.vendor_name');
  });

  it('404s when the catalog does not name the vendor', () => {
    expect(vendorFeed).toMatch(/detailRead\.kind === 'missing'/);
    expect(vendorFeed).toContain('status: 404');
  });

  it('degrades to an empty channel on an unreadable API', () => {
    // Both read failures (identity and items) fall back to no items.
    expect(vendorFeed).toMatch(
      /incidentsRead\.kind === 'ok' \? incidentsRead\.value\.items : \[\]/
    );
    expect(vendorFeed).toMatch(/: \[\];/);
    expect(vendorFeed).not.toMatch(/throw /);
  });

  it('scopes the channel description away from vendor-wide claims', () => {
    expect(vendorFeed).toContain('never a claim about');
  });
});

describe('the catalog feed', () => {
  it('reads the discovery catalog with its last-good fallback', () => {
    expect(catalogFeed).toContain('readCatalogForDiscovery(');
  });

  it('guids on the vendor slug and never invents a pubDate', () => {
    expect(catalogFeed).toContain('<guid isPermaLink="false">');
    expect(catalogFeed).toMatch(/created_at \? new Date\(vendor\.created_at\) : null/);
  });

  it('never renders a customer dependency', () => {
    expect(catalogFeed).toMatch(/is_public !== false/);
  });
});

describe('feeds and the URL surface', () => {
  it('are not sitemap entries', () => {
    // Feeds are data endpoints for feed readers, not indexable pages; the
    // sitemap composes from PUBLIC_PAGES + catalog discoveries only.
    const sitemapSource = read('../../lib/sitemap-source.ts');
    expect(sitemapSource).not.toContain('feed.xml');
    expect(sitemapSource).not.toContain('catalog.xml');
  });
});
