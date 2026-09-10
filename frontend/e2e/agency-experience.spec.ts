import { expect, test, type Page } from '@playwright/test';

/**
 * AGENCIES EXPERIENCE - the always-visible, first-class destination.
 *
 * The requirement: every authenticated customer organization sees Agencies
 * in the console (desktop rail and mobile menu), the destination opens the
 * agency operations overview at /agency, and the protected capability stays
 * gated - non-eligible organizations get a premium feature-discovery
 * presentation and no agency portfolio/client requests, while eligible ones
 * (Enterprise or explicitly enabled) get the live multi-client experience.
 *
 * The public marketing page owns /agencies and is asserted untouched; the
 * authenticated route is /agency. The fixture backend (127.0.0.1:8787)
 * flips the organization flag via PATCH /v1/orgs/current.
 */

const AUTH_TOKEN = 'qa-refresh-token';
const FIXTURE = 'http://127.0.0.1:8787';

const VIEWPORTS = [375, 390, 412, 768, 1024, 1280, 1440, 1920];

const IGNORED = [
  /news\.google\.com/i,
  /ERR_CONNECTION_CLOSED/i,
  /analytics\/visit/i,
  /status of 404/i,
];

test.use({ storageState: { cookies: [], origins: [] } });

async function signedIn(page: Page) {
  await page.addInitScript(
    ([token]) => {
      localStorage.setItem('reliastra_refresh_token', token);
    },
    [AUTH_TOKEN]
  );
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

/** Flip the fixture organization's agency capability. */
async function setAgencyMode(page: Page, on: boolean) {
  const res = await page.request.patch(`${FIXTURE}/v1/orgs/current`, {
    data: { has_agency_mode: on },
  });
  expect(res.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await signedIn(page);
});

test.afterAll(async ({ request }) => {
  // Leave the fixture in its default state for the next spec.
  await request.patch(`${FIXTURE}/v1/orgs/current`, { data: { has_agency_mode: true } });
});

/* ── 1 · Discoverability: every authenticated organization sees Agencies ── */

test.describe('discoverability', () => {
  test('desktop sidebar shows the Agencies entry for a non-eligible organization', async ({
    page,
  }) => {
    await setAgencyMode(page, false);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await settle(page);

    const nav = page.locator('nav[aria-label="Console"]');
    await expect(nav.getByRole('link', { name: 'Agency overview' })).toHaveCount(1);
    await expect(nav).toContainText('Agencies');
    // Client-management entries follow the entitlement, the overview does not.
    await expect(nav.locator('a[href="/clients"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/clients/onboarding"]')).toHaveCount(0);
  });

  test('desktop sidebar shows client navigation for an eligible organization', async ({
    page,
  }) => {
    await setAgencyMode(page, true);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await settle(page);

    const nav = page.locator('nav[aria-label="Console"]');
    await expect(nav.locator('a[href="/agency"]')).toHaveCount(1);
    await expect(nav.locator('a[href="/clients"]')).toHaveCount(1);
    await expect(nav.locator('a[href="/clients/onboarding"]')).toHaveCount(1);
  });

  test('mobile menu exposes Agencies with the same rule', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(
      ([token]) => localStorage.setItem('reliastra_refresh_token', token),
      [AUTH_TOKEN]
    );
    const page = await ctx.newPage();

    // Non-eligible: the overview is in the menu, the client entries are not.
    await setAgencyMode(page, false);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    let menu = page.locator('#obc-menu');
    await expect(menu.locator('a[href="/agency"]')).toHaveCount(1);
    await expect(menu).toContainText('Agencies');
    await expect(menu.locator('a[href="/clients"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close' }).click();

    // Eligible: the client entries appear in the same menu.
    await setAgencyMode(page, true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    menu = page.locator('#obc-menu');
    await expect(menu.locator('a[href="/agency"]')).toHaveCount(1);
    await expect(menu.locator('a[href="/clients"]')).toHaveCount(1);
    await expect(menu.locator('a[href="/clients/onboarding"]')).toHaveCount(1);

    await ctx.close();
  });
});

/* ── 2 · Gated state: premium feature discovery, no agency requests ─────── */

test.describe('gated state', () => {
  test.beforeEach(async ({ page }) => {
    await setAgencyMode(page, false);
  });

  test('/agency renders the premium gated experience', async ({ page }) => {
    await page.goto('/agency', { waitUntil: 'domcontentloaded' });
    await settle(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Manage every client environment from one operational view'
    );
    await expect(page.getByRole('link', { name: 'Talk to RELIASTRA' }).first()).toHaveAttribute(
      'href',
      '/contact'
    );
    await expect(page.getByRole('link', { name: 'Review Enterprise capabilities' }).first()).toHaveAttribute(
      'href',
      '/pricing'
    );
    const body = await page.locator('body').innerText();
    // Accurate entitlement statement, no selling, no fabricated numbers.
    expect(body).toContain(
      'Agency operations is available to Enterprise organizations and organizations explicitly enabled by RELIASTRA.'
    );
    expect(body).not.toMatch(/upgrade to|\$\d|enterprise tier/i);
  });

  test('a non-eligible organization issues no agency portfolio or client requests', async ({
    page,
  }) => {
    const agencyRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/v1/agency/portfolio') || url.includes('/v1/clients')) {
        agencyRequests.push(url);
      }
    });

    await page.goto('/agency', { waitUntil: 'domcontentloaded' });
    await settle(page);

    expect(agencyRequests).toEqual([]);
  });

  test('direct navigation to client-management routes renders the gated state', async ({
    page,
  }) => {
    for (const route of ['/clients', '/clients/cli_meridian', '/clients/onboarding']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        'Manage every client environment from one operational view'
      );
      const body = await page.locator('body').innerText();
      // No fixture client data on a gated surface.
      expect(body, `fixture data on ${route}`).not.toContain('Meridian Health');
    }
  });
});

/* ── 3 · Enabled state: live multi-client operations ─────────────────────── */

test.describe('enabled state', () => {
  test.beforeEach(async ({ page }) => {
    await setAgencyMode(page, true);
  });

  test('/agency renders the live agency operations overview', async ({ page }) => {
    await page.goto('/agency', { waitUntil: 'domcontentloaded' });
    await settle(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /client environments/i
    );
    const main = page.locator('#obc-main');
    await expect(main).toContainText('Northwind Systems');
    await expect(main).toContainText('Meridian Health');
    await expect(main).toContainText('Verdant Energy');
    // The unmonitored client is reported as not observed, never healthy.
    const verdant = page.locator('tr', { hasText: 'Verdant Energy' }).first();
    await expect(verdant).toContainText(/not observed/i);
    // Management actions and the portal share are present.
    await expect(page.getByRole('button', { name: /add client environment/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /open client portal/i })).toBeVisible();
  });

  test('client navigation links into the individual environments', async ({ page }) => {
    await page.goto('/agency', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.locator('tr', { hasText: 'Meridian Health' }).first().click();
    await page.waitForURL(/\/clients\/cli_meridian/);
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meridian Health');
    // The top bar states the active scope.
    await expect(page.getByRole('button', { name: /Client.*Meridian Health/ })).toBeVisible();
  });

  test('the top-bar scope control switches back to the agency overview', async ({
    page,
  }) => {
    await page.goto('/clients/cli_meridian', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /Client.*Meridian Health/ }).click();
    await page.getByRole('menuitem', { name: /all client environments/i }).click();
    await page.waitForURL(/\/agency$/);
    await expect(page.getByRole('button', { name: /Agency.*Northwind/ })).toBeVisible();
  });
});

/* ── 4 · One entitlement across every surface ────────────────────────────── */

test.describe('entitlement consistency', () => {
  test('command palette and top-bar scope follow the same rule', async ({ page }) => {
    // Non-eligible: the overview is reachable from the palette; no client
    // management, and the top bar shows no scope control.
    await setAgencyMode(page, false);
    await page.goto('/agency', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(
      page.locator('header button[aria-haspopup="menu"]')
    ).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('button', { name: 'Agency overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Client environments' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /client: /i })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Eligible: the same surfaces expose the client hierarchy.
    await setAgencyMode(page, true);
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toHaveCount(1);

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('button', { name: 'Agency overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Client environments' })).toBeVisible();
    await expect(page.getByRole('button', { name: /client: meridian health/i })).toBeVisible();
  });
});

/* ── 5 · Routing: public page untouched, alias redirects ─────────────────── */

test.describe('routing', () => {
  test('the public /agencies marketing page remains accessible and unchanged', async ({
    page,
  }) => {
    const res = await page.request.get('/agencies');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('For agencies & MSPs');

    await page.goto('/agencies', { waitUntil: 'domcontentloaded' });
    await settle(page);
    // The public page is not wrapped in the authenticated console.
    await expect(page.locator('nav[aria-label="Console"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('/organization redirects to the agency overview', async ({ page }) => {
    await setAgencyMode(page, true);
    await page.goto('/organization', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/agency$/);
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/client environments/i);
  });
});

/* ── 6 · Layout and hygiene on the new destination ───────────────────────── */

test.describe('layout and hygiene', () => {
  test('no horizontal overflow on /agency at every named viewport', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(
      ([token]) => localStorage.setItem('reliastra_refresh_token', token),
      [AUTH_TOKEN]
    );
    const page = await ctx.newPage();

    for (const mode of [true, false]) {
      await setAgencyMode(page, mode);
      for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/agency', { waitUntil: 'domcontentloaded' });
        await settle(page);
        const overflow = await page.evaluate(() => {
          window.scrollTo(400, 0);
          const x = window.scrollX;
          window.scrollTo(0, 0);
          return x;
        });
        expect(overflow, `/agency @${width} (agency ${mode ? 'on' : 'off'})`).toBe(0);
      }
    }
    await ctx.close();
  });

  test('no placeholder links or console errors on the agency surfaces', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) {
        errors.push(m.text());
      }
    });

    const routes = ['/agency', '/clients', '/clients/cli_meridian', '/clients/onboarding'];
    for (const mode of [true, false]) {
      await setAgencyMode(page, mode);
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await settle(page);
        const bad = await page.locator('a[href]').evaluateAll((as) =>
          as
            .map((a) => a.getAttribute('href') ?? '')
            .filter((h) => h === '' || h === '#' || h === 'undefined' || h.startsWith('javascript:'))
        );
        expect(bad, `placeholder links on ${route} (agency ${mode ? 'on' : 'off'})`).toEqual([]);
      }
    }
    expect(errors).toEqual([]);
  });
});
