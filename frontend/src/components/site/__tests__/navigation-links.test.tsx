import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';
import {
  FOOTER_GROUPS,
  HEADER_ACTIONS,
  PRIMARY_NAV,
  PRODUCT_PANEL,
  SOCIAL_LINKS,
  type NavLink,
} from '@/components/site/nav-config';
import {
  ADMIN_ROUTES,
  AUTH_ROUTES,
  CONSOLE_ROUTES,
  DOCS_ROUTES,
  LANDING_SECTIONS,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  RESEARCH_CATEGORIES,
  RESEARCH_HUBS,
  RETIRED_ROUTES,
  researchCategoryArticles,
  researchCategoryRoute,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';

/**
 * Link-integrity test for the public navigation.
 *
 * Why this exists: the previous footer hard-coded `/research` and three
 * article slugs while no such route existed, labelled a link "System status"
 * and pointed it at `/track`, and wired two entries to `scrollToId` with
 * section ids that no rendered component defined. `scrollToId` silently
 * scrolls to the top when an id is missing, so those were dead links that
 * still looked alive. None of that is caught by a type check, a build, or a
 * smoke test that only asserts HTTP 200 on the homepage.
 *
 * This renders the real header and footer server-side and validates every
 * href they emit against the route table in `@/lib/routes`, so a link can only
 * be added if the route it targets is declared.
 */

const STATIC_ROUTES = new Set<string>([
  ...Object.values(PUBLIC_ROUTES),
  ...Object.values(AUTH_ROUTES),
  ...Object.values(CONSOLE_ROUTES),
  ...Object.values(ADMIN_ROUTES),
  ...Object.values(DOCS_ROUTES),
  ...RESEARCH_ARTICLES.map((a) => researchRoute(a.slug)),
  ...RESEARCH_HUBS.map((h) => researchHubRoute(h.slug)),
  // A category route exists only while it holds a paper; the route 404s
  // otherwise, so an empty category is not a valid destination.
  ...RESEARCH_CATEGORIES.filter((c) => researchCategoryArticles(c.slug).length > 0).map((c) =>
    researchCategoryRoute(c.slug)
  ),
]);

// The partner portal and agency surfaces are removed (stage-1 B2B removal):
// no public navigation may point at them.
const REMOVED_B2B_URLS = [
  '/partner',
  '/agencies',
  '/portal',
  '/agency',
  '/clients',
];

/**
 * Anchors that legitimately point at a section on the homepage, plus the two
 * skip-link targets rendered by the shell itself.
 */
const SECTION_ANCHORS = new Set([
  ...LANDING_SECTIONS.map((id) => `#${id}`),
  '#main',
  '#auth-form',
]);

function hrefsOf(markup: string): string[] {
  return [...markup.matchAll(/<a\b[^>]*?\shref="([^"]*)"/gi)].map((m) => m[1]);
}

function linksOf(markup: string): { href: string; label: string }[] {
  return [
    ...markup.matchAll(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi),
  ].map((m) => ({
    href: m[1],
    label: m[2].replace(/<[^>]*>/g, '').trim(),
  }));
}

function isExternal(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  );
}

/** A path pattern for `/observatory/[vendor]`, the one dynamic public route linked. */
function isDynamicVendorRoute(href: string): boolean {
  return /^\/observatory\/[^/?#]+$/.test(href);
}

function flattenNavConfig(): NavLink[] {
  return [
    ...PRIMARY_NAV,
    ...PRODUCT_PANEL.flatMap((g) => g.links),
    ...FOOTER_GROUPS.flatMap((g) => g.links),
    ...SOCIAL_LINKS,
    HEADER_ACTIONS.signIn,
    HEADER_ACTIONS.start,
  ];
}

describe('public navigation link integrity', () => {
  const headerMarkup = renderToStaticMarkup(<SiteHeader />);
  const footerMarkup = renderToStaticMarkup(<SiteFooter />);
  const allHrefs = [...hrefsOf(headerMarkup), ...hrefsOf(footerMarkup)];

  it('renders anchors at all', () => {
    expect(allHrefs.length).toBeGreaterThan(0);
  });

  it('emits no malformed or placeholder href', () => {
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
          !isDynamicVendorRoute(href)
      );
    expect(unresolved).toEqual([]);
  });

  it('only anchors to homepage sections that are actually rendered', () => {
    const anchors = allHrefs.filter((href) => href.startsWith('#'));
    const stale = anchors.filter((href) => !SECTION_ANCHORS.has(href));
    expect(stale).toEqual([]);
  });

  it('links only to research slugs that are generated routes', () => {
    const valid = new Set<string>([
      ...RESEARCH_ARTICLES.map((a) => researchRoute(a.slug)),
      // Hubs are generated static routes under the same prefix.
      ...RESEARCH_HUBS.map((h) => researchHubRoute(h.slug)),
    ]);
    const researchHrefs = allHrefs.filter((href) =>
      href.startsWith(`${PUBLIC_ROUTES.research}/`)
    );
    for (const href of researchHrefs) {
      expect(valid.has(href)).toBe(true);
    }
  });

  it('never links to the removed B2B surfaces', () => {
    // The partner portal, agencies page and client portals are unmounted.
    // A navigation link to one of these is a regression.
    for (const href of allHrefs) {
      expect(REMOVED_B2B_URLS.some((u) => href === u || href.startsWith(u + '/'))).toBe(false);
    }
  });

  it('links the technical creator program from the footer', () => {
    const creatorLinks = linksOf(footerMarkup).filter((l) =>
      /creator/i.test(l.label)
    );
    expect(creatorLinks.length).toBeGreaterThan(0);
    for (const l of creatorLinks) {
      expect(l.href).toBe(PUBLIC_ROUTES.creators);
    }
  });

  it('points every status-labelled link at the status route', () => {
    // Regression guard: the previous footer labelled an entry "System status"
    // and pointed it at the vendor index, which is a different page entirely.
    //
    // The pattern matches a *destination* label - "Status", "System status" -
    // and deliberately not any label containing the word. Research titles are
    // allowed to discuss status pages ("/research/ai-infrastructure/
    // status-page-payload-anatomy" is titled "What a status-page payload
    // actually asserts"), and a broad /\bstatus\b/ misfires on them: it fails
    // a correct link rather than catching a wrong one.
    const statusLinks = linksOf(footerMarkup).filter((l) =>
      /^(system |service |platform |vendor |network )?status$/i.test(l.label.trim())
    );
    expect(statusLinks.length).toBeGreaterThan(0);
    for (const l of statusLinks) {
      expect(l.href).toBe(PUBLIC_ROUTES.status);
    }
  });

  it('has no dead scroll actions in the footer', () => {
    // Every footer entry must be a real link, not a button wired to a
    // non-existent section id.
    const footerButtons = footerMarkup.match(/<button\b/gi) ?? [];
    expect(footerButtons).toEqual([]);
  });

  it('keeps every configured nav destination resolvable', () => {
    for (const { href, label } of flattenNavConfig()) {
      expect(label.length, `empty label for ${href}`).toBeGreaterThan(0);
      if (isExternal(href) || href.startsWith('#')) continue;
      expect(
        STATIC_ROUTES.has(href) ||
          isDynamicVendorRoute(href),
        `unresolved nav href: ${href}`
      ).toBe(true);
    }
  });

  it('uses descriptive labels, never vague category words', () => {
    // Sitelink candidates must be prominent, stable, crawlable links with
    // labels that name their destination - never "Explore" or "Solutions".
    const banned = [/^explore$/i, /^solutions$/i, /^platform$/i, /^learn$/i, /^more$/i];
    for (const { label } of flattenNavConfig()) {
      for (const pattern of banned) {
        expect(pattern.test(label), `banned nav label: ${label}`).toBe(false);
      }
    }
  });

  it('exposes the branded-SERP concept destinations', () => {
    const hrefs = new Set(flattenNavConfig().map((l) => l.href));
    for (const href of [
      PUBLIC_ROUTES.creators,
      PUBLIC_ROUTES.product,
      PUBLIC_ROUTES.product,
      PUBLIC_ROUTES.productEvidence,
      PUBLIC_ROUTES.productEvidence,
      PUBLIC_ROUTES.observatory,
      PUBLIC_ROUTES.docs,
      PUBLIC_ROUTES.pricing,
      PUBLIC_ROUTES.security,
      PUBLIC_ROUTES.research,
    ]) {
      expect(hrefs.has(href), `missing nav destination: ${href}`).toBe(true);
    }
  });

  it('renders the product panel links without JavaScript', () => {
    // The desktop panel is always mounted (visibility-only toggle), so the
    // hierarchy links exist in the SSR HTML crawlers receive.
    expect(headerMarkup).toContain(PUBLIC_ROUTES.product);
    expect(headerMarkup).toContain(PUBLIC_ROUTES.product);
    expect(headerMarkup).toContain(PUBLIC_ROUTES.productEvidence);
  });

  it('links the research index and every hub from the footer', () => {
    // The footer deliberately does not list all nine papers: a nine-item
    // research column is a directory, not navigation, and it pushed the
    // legal and project rows off the first screen. The index page is the
    // place that must reach every paper, and the test below checks it there.
    const hrefs = new Set(hrefsOf(footerMarkup));
    expect(hrefs.has(PUBLIC_ROUTES.research)).toBe(true);
    for (const hub of RESEARCH_HUBS) {
      expect(
        hrefs.has(researchHubRoute(hub.slug)),
        `footer does not link hub ${hub.slug}`
      ).toBe(true);
    }
  });

  it('links every published paper from the research index', async () => {
    const { default: ResearchPage } = await import('@/app/research/page');
    const html = renderToStaticMarkup(await ResearchPage());
    const hrefs = new Set(hrefsOf(html));
    for (const article of RESEARCH_ARTICLES) {
      expect(
        hrefs.has(researchRoute(article.slug)),
        `research index does not link ${article.slug}`
      ).toBe(true);
    }
  });

  it('never points at a retired URL', () => {
    // The consolidation retired four capability pages and /track. A link to
    // one of them still works - through a 308 - which is exactly why it needs
    // a test: the redirect hides the stale destination from a reader but not
    // from a crawler, and the next person to edit navigation would never
    // notice. `RETIRED_ROUTES` is the single list of what must not be linked.
    const retired = Object.values(RETIRED_ROUTES);
    for (const href of allHrefs) {
      for (const path of retired) {
        expect(
          href === path || href.startsWith(`${path}/`),
          `link to retired URL ${path}`
        ).toBe(false);
      }
    }
  });
});
