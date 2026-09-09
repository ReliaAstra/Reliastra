import { describe, expect, it } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';

import { HomeLanding } from '@/components/site/home/home-landing';
import { LANDING_SECTIONS } from '@/lib/routes';

/**
 * The homepage anchors must match the homepage that actually renders.
 *
 * `LANDING_SECTIONS` is the list the header, the footer and the e2e smoke
 * suite all treat as the canonical section set. It had drifted: it declared
 * `chain`, a section no component had ever rendered, so the e2e assertion
 * that walks the list was failing on an id that could never appear. An anchor
 * pointing at it would have been a dead link that still looked alive.
 *
 * The comparison is exact equality in both directions, on purpose. A subset
 * check ("every declared id is rendered") is what allowed `chain` to survive;
 * the other direction ("every rendered section is declared") is what stops a
 * newly added section from being invisible to the navigation contract.
 *
 * Rendered with the async server renderer because `LiveIntelligenceSection`
 * fetches, and `renderToStaticMarkup` cannot suspend.
 */

async function renderLanding() {
  const stream = await renderToReadableStream(<HomeLanding />);
  await stream.allReady;
  return new Response(stream).text();
}

describe('homepage section anchors', () => {
  it('declares exactly the sections the composition renders, in order', async () => {
    const html = await renderLanding();
    const rendered = [
      ...html.matchAll(/<section[^>]*id="([^"]+)"/g),
    ].map((m) => m[1]);

    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered).toEqual([...LANDING_SECTIONS]);
  });

  it('has no duplicate section ids', async () => {
    const html = await renderLanding();
    const rendered = [
      ...html.matchAll(/<section[^>]*id="([^"]+)"/g),
    ].map((m) => m[1]);

    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it('starts at the hero and ends at the definitions', async () => {
    // Guards the narrative spine specifically: the page must open on the
    // proposition and close on the reference block before the final CTA.
    expect(LANDING_SECTIONS[0]).toBe('top');
    expect(LANDING_SECTIONS[LANDING_SECTIONS.length - 1]).toBe('reference');
  });

  it('every declared anchor resolves to a rendered target', async () => {
    const html = await renderLanding();
    for (const id of LANDING_SECTIONS) {
      expect(html, `#${id} is declared but never rendered`).toContain(
        `id="${id}"`
      );
    }
  });
});
