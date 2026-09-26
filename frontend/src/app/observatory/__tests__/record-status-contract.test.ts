import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The response contract of the public observatory, asserted against the pages.
 *
 * These routes cannot be exercised over HTTP in this environment - the
 * measurement API is unreachable from here - so, as with the record sections,
 * the composition is asserted against the source. What is pinned is the part
 * that a rendered page cannot show and a crawler pays for:
 *
 *   record read          -> 200, indexable
 *   API answered 404     -> 404, `noindex`
 *   API did not answer   -> throw, so the boundary returns a 5xx and the URL
 *                           stays indexed for retry
 *
 * The defect this prevents is specific and was live: a transient API failure
 * produced `noindex` on a canonical, sitemap-listed dependency record *and*
 * served it at HTTP 200 with a headline and no data. A crawler cannot unlearn
 * either half of that, and the record has to earn its way back.
 */

const APP = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(APP, rel), 'utf8');

const hub = read('page.tsx');
const record = read('[vendor]/page.tsx');
const incident = read('[vendor]/incidents/[id]/page.tsx');
const sections = readFileSync(
  resolve(__dirname, '../../../components/observatory/record-sections.tsx'),
  'utf8'
);

describe('the dependency record', () => {
  it('reads through the three-way contract, not a null-or-throw wrapper', () => {
    expect(record).toContain('readVendorRecord(');
    expect(record).toContain('readVendorDetail(');
    // The legacy wrapper returns `null` for absent and throws for unreadable; a
    // page that catches that throw and renders is how the 200 failure page came
    // back the first time.
    expect(record).not.toContain('fetchVendorRecord');
  });

  it('throws when the record could not be read', () => {
    expect(record).toMatch(/read\.kind === 'unreadable'/);
    expect(record).toContain('throw new RecordUnreadableError');
  });

  it('404s when the API says the record does not exist', () => {
    expect(record).toMatch(/read\.kind === 'missing'/);
    expect(record).toContain('notFound()');
  });

  it('marks an unreadable record indexable and only a missing one noindex', () => {
    const metadata = record.slice(
      record.indexOf('export async function generateMetadata'),
      record.indexOf('export default async function')
    );
    const unreadable = metadata.slice(
      metadata.indexOf("read.kind === 'unreadable'"),
      metadata.indexOf("read.kind === 'missing'")
    );
    const missing = metadata.slice(metadata.indexOf("read.kind === 'missing'"));

    expect(unreadable).toContain('index: true');
    expect(unreadable).not.toContain('index: false');
    expect(missing).toContain('index: false');
  });

  it('renders no failure state of its own', () => {
    expect(record).not.toContain('RecordUnavailable');
    expect(sections).not.toContain('export function RecordUnavailable');
  });

  it('has an error boundary to turn the throw into a 5xx', () => {
    expect(existsSync(resolve(APP, '[vendor]/error.tsx'))).toBe(true);
  });
});

describe('the incident record', () => {
  it('distinguishes all five outcomes', () => {
    // `observed` is the detector-only record: same stable URL, measurement
    // wording, no evidence publication - a real 200, not a hidden 404.
    // The union lives on the shared loader (page + sidecar resolve one
    // record through one code path), so it is asserted there.
    const loader = read('../../lib/observatory/incident-record.ts');
    for (const kind of ['ok', 'observed', 'vendor-missing', 'incident-missing', 'unreadable']) {
      expect(loader, `outcome ${kind}`).toContain(`'${kind}'`);
    }
    // ...and the page must consume the loader, not its own copy.
    expect(incident).toContain('loadIncidentRecord');
  });

  it('throws when the incident list could not be read', () => {
    expect(incident).toContain('throw new RecordUnreadableError');
  });

  it('404s only when the dependency or the incident is absent', () => {
    expect(incident).toMatch(/loaded\.kind !== 'ok' && loaded\.kind !== 'observed'\) notFound\(\)/);
  });

  it('marks an unreadable incident indexable', () => {
    const metadata = incident.slice(
      incident.indexOf('export async function generateMetadata'),
      incident.indexOf('export default async function')
    );
    const unreadable = metadata.slice(
      metadata.indexOf("loaded.kind === 'unreadable'"),
      metadata.indexOf("loaded.kind !== 'ok'")
    );

    expect(unreadable).toContain('index: true');
    expect(unreadable).not.toContain('index: false');
  });

  it('resolves a detector record by id, not by scraping a list', () => {
    // The page must not need the vendor incident list to answer "does this
    // id exist" - the single-incident read is one throttled call either way,
    // and a wrong-vendor id on this path is a 404, not a redirect. The read
    // lives on the shared loader; the page (and its sidecar) must not
    // re-implement it.
    const loader = read('../../lib/observatory/incident-record.ts');
    expect(loader).toContain('readPublicIncident(');
    expect(loader).not.toContain('fetchVendorIncidents');
    expect(incident).not.toContain('fetchVendorIncidents');
  });

  it('does not describe a published record as permanent', () => {
    // The public channel lists incidents for a bounded window; a URL that 404s
    // on a schedule must not be advertised as forever.
    expect(incident).not.toMatch(/permanent public incident record/i);
  });
});

describe('the observatory index', () => {
  it('lets a failed catalog read throw instead of rendering an empty index', () => {
    // A 200 index with no rows publishes the claim that RELIASTRA observes
    // nothing, on a page that is canonical and sitemap-listed.
    expect(hub).not.toContain('catch');
    expect(hub).not.toMatch(/kind="error"/);
    expect(hub).toContain('fetchTrackedVendorsAll(');
  });

  it('has an error boundary of its own', () => {
    expect(existsSync(resolve(APP, 'error.tsx'))).toBe(true);
    expect(read('error.tsx')).toContain("'use client'");
  });

  it('takes the state column from the catalog instead of re-fetching it', () => {
    /**
     * The catalog row already carries `recent_status`. Resolving it per row
     * meant 24 extra upstream calls per render into a rate limit every reader
     * of the site shares - and left every row past the 24th without a state.
     */
    expect(hub).toContain('r.item.recent_status');
    expect(hub).not.toContain('r.detail.recent_status');
  });

  it('never prints an unread region as a count of zero', () => {
    expect(hub).toContain('not read');
    expect(hub).not.toMatch(/>\s*none\s*</);
  });
});

describe('every observatory route goes through the deployment gate', () => {
  it('routes its robots directive through robotsDirective', () => {
    for (const [name, source] of [
      ['index', hub],
      ['record', record],
      ['incident', incident],
    ] as const) {
      expect(source, `${name} page`).toContain('robotsDirective(');
      expect(source, `${name} page`).not.toMatch(/robots: \{ index: (true|false), follow: true \}/);
    }
  });

  it('advertises the machine-readable discovery files', () => {
    for (const [name, source] of [
      ['index', hub],
      ['record', record],
      ['incident', incident],
    ] as const) {
      expect(source, `${name} page`).toContain('DISCOVERY_ALTERNATES');
    }
  });
});

describe('the incident record JSON sidecar', () => {
  const sidecar = read('[vendor]/incidents/[id]/index.json/route.ts');

  it('resolves the same record as the page, through the shared loader', () => {
    // One source of truth, two renderers: the sidecar must not re-read or
    // scrape the HTML page.
    expect(sidecar).toContain('loadIncidentRecord(');
    expect(sidecar).not.toContain('readVendorDetail(');
    expect(sidecar).not.toContain('readPublicIncident(');
  });

  it('serves noindex - the HTML record is the indexable unit', () => {
    expect(sidecar).toContain("'X-Robots-Tag': 'noindex'");
  });

  it('404s for absent records', () => {
    expect(sidecar).toContain('status: 404');
  });

  it('throws on an unreadable API rather than answering 404', () => {
    // The mapping layer throws RecordUnreadableError for `unreadable`; the
    // route must not catch it into a 404.
    expect(sidecar).not.toMatch(/catch/);
    expect(
      read('../../lib/observatory/incident-record.ts')
    ).toMatch(/throw new RecordUnreadableError/);
  });
});
