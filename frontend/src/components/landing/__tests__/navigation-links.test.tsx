import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Navbar } from '@/components/landing/sections/Navbar';
import { Footer } from '@/components/landing/sections/Footer';
import {
  ADMIN_ROUTES,
  AUTH_ROUTES,
  CONSOLE_ROUTES,
  LANDING_SECTIONS,
  PARTNER_PUBLIC_PAGES,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  researchRoute,
} from '@/lib/routes';

/**
 * Link-integrity test for the marketing navigation.
 *
 * Why this exists: the footer hard-coded `/research` and three article slugs
 * while no such route existed, and two entries pointed `scrollToId` at section
 * ids that only existed inside components the landing page does not render.
 * Because `scrollToId` silently falls back to scrolling to the top, those were
 * dead links that still looked alive. Neither class of bug is caught by a type
 * check, a build, or a smoke test that only asserts HTTP 200 on the landing
 * page itself.
 *
 * This renders the components server-side and validates every href they emit
 * against the route table in `@/lib/routes`, so a link can only be added if the
 * route it targets is declared.
 */

const STATIC_ROUTES = new Set<string>([
  ...Object.values(PUBLIC_ROUTES),
  ...Object.values(AUTH_ROUTES),
  ...Object.values(CONSOLE_ROUTES),
  ...Object.values(ADMIN_ROUTES),
  ...RESEARCH_ARTICLES.map((a) => researchRoute(a.slug)),
]);

const PARTNER_URLS = new Set([
  '/partner',
  ...PARTNER_PUBLIC_PAGES.filter((page) => page !== 'home').map(
    (page) => `/partner/${page}`
  ),
  '/partner/privacy',
  '/partner/terms',
]);

/** Anchors that legitimately point at a section on the landing page. */
const SECTION_ANCHORS = new Set(
  LANDING_SECTIONS.map((id) => `#${id}`)
);

function hrefsOf(markup: string): string[] {
  return [...markup.matchAll(/<a\b[^>]*?\shref="([^"]*)"/gi)].map((m) => m[1]);
}

function isExternal(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  );
}

/** A path pattern for `/track/[vendor]`, the one dynamic public route linked. */
function isDynamicVendorRoute(href: string): boolean {
  return /^\/track\/[^/?#]+$/.test(href);
}

describe('marketing navigation link integrity', () => {
  const navMarkup = renderToStaticMarkup(<Navbar />);
  const footerMarkup = renderToStaticMarkup(<Footer />);
  const allHrefs = [...hrefsOf(navMarkup), ...hrefsOf(footerMarkup)];

  it('renders anchors at all', () => {
    expect(allHrefs.length).toBeGreaterThan(0);
  });

  it('emits no malformed href', () => {
    const malformed = allHrefs.filter(
      (href) =>
        href.trim() === '' ||
        href === '#' ||
        href.startsWith('javascript:') ||
        href === 'undefined' ||
        href === 'null' ||
        href.startsWith('[object')
    );
    expect(malformed).toEqual([]);
  });

  it('resolves every internal href to a declared route', () => {
    const unresolved = allHrefs
      .filter((href) => !isExternal(href))
      .filter((href) => !href.startsWith('#'))
      .filter(
        (href) =>
          !STATIC_ROUTES.has(href) &&
          !PARTNER_URLS.has(href) &&
          !isDynamicVendorRoute(href)
      );
    expect(unresolved).toEqual([]);
  });

  it('only anchors to landing sections that are actually rendered', () => {
    // `scrollToId` silently scrolls to the top for a missing id, so a stale
    // anchor is a dead link that reports success. Every anchor must name a
    // section in the canonical composition.
    const anchors = allHrefs.filter((href) => href.startsWith('#'));
    const stale = anchors.filter((href) => !SECTION_ANCHORS.has(href));
    expect(stale).toEqual([]);
  });

  it('links only to research slugs that are generated routes', () => {
    const valid = new Set(RESEARCH_ARTICLES.map((a) => researchRoute(a.slug)));
    const researchHrefs = allHrefs.filter((href) =>
      href.startsWith(`${PUBLIC_ROUTES.research}/`)
    );
    // The footer must actually link the articles, otherwise this test would
    // pass vacuously after a regression removed the links.
    expect(researchHrefs.length).toBe(RESEARCH_ARTICLES.length);
    for (const href of researchHrefs) {
      expect(valid.has(href)).toBe(true);
    }
  });

  it('sends partner signup to the partner form, not customer signup', () => {
    // `/signup` is the customer registration form and never creates a partner
    // profile. A "join as partner" link pointing there silently enrols the
    // visitor as a customer instead.
    const labels = [...footerMarkup.matchAll(
      /<a\b[^>]*?href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
    )].map((m) => ({ href: m[1], label: m[2].trim() }));

    const joinAsPartner = labels.find((l) =>
      /join as partner/i.test(l.label)
    );
    expect(joinAsPartner).toBeDefined();
    expect(joinAsPartner!.href).toBe('/partner/signup');
    expect(joinAsPartner!.href).not.toBe(AUTH_ROUTES.signup);
  });

  it('has no dead scroll actions left in the footer', () => {
    // The old footer rendered `<button>` elements for Features/Partners wired
    // to non-existent section ids. Every footer entry must now be a real link.
    const footerButtons = footerMarkup.match(/<button\b/gi) ?? [];
    expect(footerButtons).toEqual([]);
  });
});
