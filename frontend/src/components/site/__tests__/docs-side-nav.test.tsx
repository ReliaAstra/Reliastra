import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { DocsSideNav } from '@/components/site/docs-side-nav';
import { DOCS_NAV } from '@/components/site/nav-config';
import { PUBLIC_ROUTES } from '@/lib/routes';

/**
 * Documentation side navigation.
 *
 * Rendered and asserted because the failure this guards is invisible to a
 * type check: a guide added to the docs tree without being added to the spine
 * compiles, builds and renders fine - it is simply unreachable from the
 * navigation, which is the exact defect the docs rail exists to prevent.
 */

const render = (activeHref: string) =>
  renderToStaticMarkup(<DocsSideNav activeHref={activeHref} />);

describe('docs side navigation', () => {
  it('links every guide declared in the nav config', () => {
    const html = render(PUBLIC_ROUTES.docs);
    for (const item of DOCS_NAV) {
      expect(html, `missing link to ${item.href}`).toContain(`href="${item.href}"`);
      expect(html).toContain(item.label);
    }
  });

  it('marks exactly one entry as current, in both layouts', () => {
    for (const item of DOCS_NAV) {
      const html = render(item.href);
      const rail = html.match(/ob-docs-nav-link is-active/g) ?? [];
      const pill = html.match(/ob-docs-nav-pill is-active/g) ?? [];
      expect(rail.length, `rail active count on ${item.href}`).toBe(1);
      expect(pill.length, `pill active count on ${item.href}`).toBe(1);
      expect(html).toContain(`href="${item.href}"`);
    }
  });

  it('marks nothing current for a route outside the spine', () => {
    const html = render('/docs/not-a-real-guide');
    expect(html).not.toContain('is-active');
    expect(html).not.toContain('aria-current');
  });

  it('exposes an accessible navigation landmark', () => {
    const html = render(PUBLIC_ROUTES.docs);
    expect(html).toContain('<nav aria-label="Documentation"');
  });

  it('only targets routes that exist', () => {
    // The spine is built from lib/routes constants, so a typo cannot produce
    // a dead link. This is the assertion that would catch one being
    // hand-written instead.
    for (const item of DOCS_NAV) {
      expect(Object.values(PUBLIC_ROUTES)).toContain(item.href);
    }
  });

  it('lists the guides in reading order, starting at the overview', () => {
    expect(DOCS_NAV[0].href).toBe(PUBLIC_ROUTES.docs);
    expect(DOCS_NAV.map((i) => i.href)).toEqual([
      PUBLIC_ROUTES.docs,
      PUBLIC_ROUTES.docsQuickstart,
      PUBLIC_ROUTES.docsMonitoring,
      PUBLIC_ROUTES.docsEvidence,
      PUBLIC_ROUTES.docsApi,
    ]);
  });

  it('is a server component with no client runtime', () => {
    expect(render(PUBLIC_ROUTES.docs)).not.toContain('<script');
  });
});
