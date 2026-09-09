import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DistinctionSection } from '@/components/observatory/record-sections';
import type { VendorRecord } from '@/lib/track-api';

/**
 * The `#distinction` section.
 *
 * `e2e/observatory.spec.ts` has asserted this section for some time: it
 * expects a `#distinction` element between `#methodology` and `#dependency`
 * whose text states that the record is not the official vendor status page
 * and that RELIASTRA does not ingest or mirror vendor-reported state. No
 * component had ever rendered it, so that assertion had never passed.
 *
 * The record page cannot be exercised over HTTP in this environment - the
 * measurement API is unreachable from here - so the section is asserted by
 * rendering it against a fixture record. That covers the claim and the id;
 * the page composition that places it in the spine is asserted separately
 * against the source.
 */

const fixture = {
  detail: {
    vendor_name: 'api.example.com',
    display_name: 'Example API',
  },
} as unknown as VendorRecord;

const render = () => renderToStaticMarkup(<DistinctionSection record={fixture} />);

describe('distinction section', () => {
  it('renders under the id the specification expects', () => {
    expect(render()).toContain('id="distinction"');
  });

  it('states that this is not the official vendor status page', () => {
    expect(render()).toMatch(/official vendor status/i);
  });

  it('states that vendor-reported state is not ingested or mirrored', () => {
    expect(render()).toMatch(/does not ingest/i);
    expect(render()).toMatch(/does not ingest, mirror/i);
  });

  it('is labelled for assistive technology', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="distinction-h"');
    expect(html).toContain('id="distinction-h"');
  });

  it('names the vendor it is measuring rather than speaking generally', () => {
    expect(render()).toContain('Example API');
  });

  it('carries no certification or endorsement claim', () => {
    const html = render();
    expect(html).not.toMatch(/SOC\s*2|ISO\s*27001|PCI\s*DSS|GDPR/i);
    // The copy denies endorsement ("not affiliated with or endorsed by"), so
    // assert the denial is present rather than asserting the words are
    // absent - the bare phrase appearing is the point of the sentence.
    expect(html).toContain('not affiliated with or endorsed by');
  });

  it('emits no heading level that would collide with the record page', () => {
    // RecordSection renders the section title as an h2 with a known id; the
    // body must not introduce competing headings.
    const html = render();
    expect(html.match(/<h1/g)).toBeNull();
    expect(html.match(/<h3/g)).toBeNull();
  });
});
