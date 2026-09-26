import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The single-segment resolution contract.
 *
 * `/observatory/{slug}` is one URL space shared by two entity types: vendor
 * records and taxonomy categories (e.g. `/observatory/stripe` and
 * `/observatory/payments`). The resolution rules pinned here are what keep
 * that shared segment from ever lying:
 *
 *   vendor found              -> 200 vendor record
 *   vendor missing            -> category lookup
 *   category found            -> 200 category page
 *   category unreadable       -> throw for a 5xx, never a fake page
 *   both missing              -> 404
 */

const APP = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(APP, rel), 'utf8');

const segment = read('[vendor]/page.tsx');
const index = read('page.tsx');

describe('category resolution at /observatory/[slug]', () => {
  it('resolves a missing vendor through the category reader, in both body and metadata', () => {
    expect(segment).toContain('readCategory(');
    // Metadata must mirror the body's resolution, or the two can disagree
    // about indexability for the same URL.
    const metadata = segment.slice(
      segment.indexOf('export async function generateMetadata'),
      segment.indexOf('export default async function'),
    );
    expect(metadata).toContain('readCategory(');
  });

  it('renders the dedicated category page, not a vendor page missing data', () => {
    expect(segment).toContain('<CategoryRecord');
    expect(existsSync(resolve(APP, '../../components/observatory/category-page.tsx'))).toBe(true);
  });

  it('keeps the three-way contract for the category lookup itself', () => {
    expect(segment).toMatch(/categoryRead\.kind === 'unreadable'/);
    expect(segment).toMatch(/categoryRead\.kind === 'missing'/);
    expect(segment).toContain('throw new RecordUnreadableError');
    expect(segment).toContain('notFound()');
  });

  it('keeps a noindex escape only for the both-missing case', () => {
    expect(segment).toContain('index: false');
    expect(segment).toContain('index: true');
  });

  it('links vendor records and category pages through the shared segment', () => {
    // One helper per entity; both produce /observatory/{slug} URLs.
    expect(segment).toContain('observatoryCategory');
  });

  it('renders the category page from canonical API data only', () => {
    const page = readFileSync(
      resolve(APP, '../../components/observatory/category-page.tsx'),
      'utf8',
    );
    expect(page).toContain('TrackCategoryDetail');
    expect(page).toContain("'CollectionPage'");
    expect(page).toContain('Breadcrumb');
    // No category roll-up figure: unlike endpoints must not be averaged.
    expect(page).not.toMatch(/uptime_percentage/i);
    expect(page).not.toContain('avg_latency');
  });
});

describe('category discovery from the index and sitemap', () => {
  it('reads the taxonomy on the observatory index', () => {
    expect(index).toContain('readCategories(');
  });

  it('enumerates categories in the sitemap only from a live taxonomy read', () => {
    const sitemap = readFileSync(resolve(APP, '../sitemap.ts'), 'utf8');
    expect(sitemap).toContain('readCategories(');
    expect(sitemap).toContain("categoriesRead.kind === 'ok'");
  });
});
