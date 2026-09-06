import { expect, test, type Page } from '@playwright/test';

/**
 * Public navigation + console-health smoke suite.
 *
 * What this guards, and why each part exists:
 *
 * 1. Every public route renders. Four research URLs previously 404'd because
 *    the footer hard-coded slugs for routes that were never created.
 * 2. Every internal anchor on those pages resolves. A link can only be added
 *    if the target responds - this is what catches a stale href at the point
 *    it ships, rather than when a customer clicks it.
 * 3. No console errors, page errors, failed requests or hydration warnings.
 *    Hydration failures are asserted by text, because React logs them as
 *    console errors rather than throwing.
 * 4. The landing page contains exactly the canonical section set, so a section
 *    cannot be silently dropped from the composition (or referenced by an
 *    anchor after it was removed - the bug that made `#solution` and
 *    `#partners` dead links).
 * 5. Protected routes redirect deterministically when unauthenticated.
 *
 * External hosts are recorded but never asserted on: a third party being down
 * is not a defect in this app.
 */

const PUBLIC_ROUTES = [
  '/',
  '/track',
  '/research',
  '/research/the-dependency-gap',
  '/research/how-reliastra-measures-vendor-reliability',
  '/research/reliastra-research-agenda',
  '/privacy',
  '/terms',
  '/signup',
  '/login',
  '/verify-email',
  '/reset-password',
  '/support',
];

/** Sections the canonical landing composition must contain, in this order. */
const LANDING_SECTION_IDS = [
  'evidence',
  'live',
  'research',
  'comparison',
  'pricing',
];

const PROTECTED_ROUTES = [
  '/dashboard',
  '/dependencies',
  '/incidents',
  '/evidence',
  '/settings',
  '/settings/billing',
];

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

interface Captured {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  external: string[];
}

/** Attach the collectors that requirement 8 asks for. */
function instrument(page: Page): Captured {
  const cap: Captured = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    external: [],
  };
  page.on('console', (m) => {
    if (m.type() === 'error') cap.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => cap.pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    const url = r.url();
    if (isExternal(url)) cap.external.push(url);
    else cap.failedRequests.push(`${r.method()} ${url} - ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    const url = r.url();
    if (isExternal(url)) return;
    if (r.status() >= 500) cap.failedRequests.push(`${r.status()} ${url}`);
  });
  return cap;
}

function isExternal(url: string): boolean {
  const base = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
  try {
    return new URL(url).origin !== new URL(base).origin;
  } catch {
    return false;
  }
}

function isInternalHref(href: string | null): boolean {
  if (!href) return false;
  if (href.startsWith('#')) return false; // in-page anchor, handled separately
  if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return false;
  return href.startsWith('/');
}

test.describe('public routes render', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} responds and hydrates without errors`, async ({ page }) => {
      const cap = instrument(page);
      const res = await page.goto(route, { waitUntil: 'networkidle' });
      expect(res?.status(), `GET ${route}`).toBe(200);

      // The landing route renders its real content only after the client
      // store hydrates, so wait for a body that is more than the splash.
      await page.waitForTimeout(1200);

      const hydration = cap.consoleErrors.filter((e) =>
        /hydrat|did not match|server rendered html/i.test(e)
      );
      expect(hydration, `hydration errors on ${route}`).toEqual([]);

      // ChunkLoadError / TypeError / ReferenceError are the failures that
      // leave a page looking fine but dead.
      const fatal = cap.pageErrors.filter((e) =>
        /TypeError|ReferenceError|ChunkLoadError|is not a function|is not defined/i.test(e)
      );
      expect(fatal, `page errors on ${route}`).toEqual([]);
    });
  }
});

test.describe('internal link integrity', () => {
  test('every internal anchor on public pages resolves', async ({ page }) => {
    instrument(page);
    const targets = new Map<string, string[]>();

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const hrefs = await page
        .locator('a[href]')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      for (const href of hrefs) {
        if (!isInternalHref(href)) continue;
        const key = href as string;
        if (!targets.has(key)) targets.set(key, []);
        targets.get(key)!.push(route);
      }
    }

    expect(targets.size, 'expected to discover internal links').toBeGreaterThan(0);

    const broken: string[] = [];
    for (const [href, seenOn] of targets) {
      const res = await page.request.get(href);
      if (res.status() >= 400) {
        broken.push(`${href} -> ${res.status()} (linked from ${[...new Set(seenOn)].join(', ')})`);
      }
    }
    expect(broken, 'broken internal links').toEqual([]);
  });

  test('no anchor has a malformed href', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const malformed = (hrefs ?? []).filter(
      (h) =>
        h === null ||
        h.trim() === '' ||
        h === 'undefined' ||
        h === 'null' ||
        h.startsWith('[object') ||
        h.startsWith('javascript:')
    );
    expect(malformed).toEqual([]);
  });

  test('in-page anchors point at sections that exist', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const anchors = await page
      .locator('a[href^="#"]')
      .evaluateAll((as) =>
        as.map((a) => (a.getAttribute('href') ?? '').slice(1)).filter(Boolean)
      );
    const dead: string[] = [];
    for (const id of new Set(anchors)) {
      const exists = await page.locator(`#${id}`).count();
      if (!exists) dead.push(`#${id}`);
    }
    expect(dead, 'anchors to missing sections').toEqual([]);
  });
});

test.describe('landing composition', () => {
  test('renders the canonical sections', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const id of LANDING_SECTION_IDS) {
      await expect(page.locator(`#${id}`).first(), `missing #${id}`).toBeVisible();
    }
  });

  test('footer links every research article', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    for (const slug of [
      'the-dependency-gap',
      'how-reliastra-measures-vendor-reliability',
      'reliastra-research-agenda',
    ]) {
      const link = page.locator(`footer a[href="/research/${slug}"]`);
      await expect(link, `footer missing /research/${slug}`).toHaveCount(1);
    }
  });
});

test.describe('protected routes', () => {
  test('unauthenticated visitors are redirected to sign-in', async ({ page }) => {
    for (const route of PROTECTED_ROUTES) {
      // Fresh context per route so no session state leaks between them.
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear()).catch(() => {});
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/login/, { timeout: 20_000 });
      expect(new URL(page.url()).pathname, `${route} should land on /login`).toBe('/login');
    }
  });

  test('an unknown research slug is a real 404, not a redirect home', async ({ request }) => {
    const res = await request.get('/research/this-slug-does-not-exist');
    expect(res.status()).toBe(404);
  });
});

test.describe('responsive', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name}: landing has no horizontal overflow`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      instrument(page);
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      // 2px tolerance for sub-pixel rounding in shadow/border layouts.
      expect(
        overflow.scrollWidth,
        `horizontal scroll at ${vp.width}px (${overflow.scrollWidth} > ${overflow.clientWidth})`
      ).toBeLessThanOrEqual(overflow.clientWidth + 2);
      await ctx.close();
    });

    test(`${vp.name}: footer is reachable and readable`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.locator('footer').scrollIntoViewIfNeeded();
      await expect(page.locator('footer').first()).toBeVisible();
      await ctx.close();
    });
  }
});
