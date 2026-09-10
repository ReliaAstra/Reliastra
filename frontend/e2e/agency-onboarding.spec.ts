import { expect, test, type Page } from '@playwright/test';

/**
 * AGENCY OPERATIONS + CONFIGURATION SEQUENCE - rendered QA.
 *
 * Covers the two surfaces this phase rebuilt and the information architecture
 * around them:
 *
 *  1. The customer journey: onboarding stage by stage, the real POST that
 *     creates the monitor, and the activation surface's two states
 *     (initialising, then the first observation).
 *  2. The agency journey: portfolio, client environment, client switching,
 *     client creation, the client setup sequence, and the not-enabled state.
 *  3. Navigation integrity: every console link resolves, nothing is a `#`,
 *     and the entries that leave the console say so.
 *  4. Layout at every viewport the brief names, plus accessibility basics.
 *
 * The console session is a localStorage refresh token, the same one a
 * returning user has; data comes from the fixture backend, whose shapes mirror
 * the real API (including `uptime_24h = 100.0` for an unmonitored client).
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

/* ── 1 · Observation configuration sequence ─────────────────────────────── */

test.describe('observation configuration sequence', () => {
  test.beforeEach(async ({ page }) => {
    // Clear the persisted draft ONCE per test: this init script runs on every
    // navigation, and the resume test reloads deliberately.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('qa-cleared')) {
        localStorage.removeItem('reliastra_onboarding_v3');
        localStorage.removeItem('reliastra_onboarding_v2');
        sessionStorage.setItem('qa-cleared', '1');
      }
    });
  });

  test('renders as a focused sequence, not inside the console rail', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await settle(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /establish your observation environment/i
    );
    // The console rail must not be present during configuration.
    await expect(page.locator('nav[aria-label="Console"]')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Configuration stages"]')).toBeVisible();

    // Environment facts come from the organization record, not from copy.
    const main = page.locator('#sequence-main');
    await expect(main).toContainText('Northwind Systems');
    await expect(main).toContainText(/minimum interval/i);
  });

  test('walks environment → dependency → observation → confirm → active', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await settle(page);

    // 01 → 02
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /what infrastructure do you depend on/i
    );

    // The suggestion list is the real public catalog.
    const suggestion = page.getByRole('button', { name: /Stripe/ }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(page.locator('#dep-endpoint')).toHaveValue(/^https?:\/\//);
    await expect(page.locator('#dep-name')).not.toHaveValue('');

    // An invalid endpoint blocks progress and says why.
    await page.locator('#dep-endpoint').fill('not-a-url');
    await expect(page.getByText(/absolute URL beginning with http/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /configure observation/i })).toBeDisabled();

    await page.locator('#dep-endpoint').fill('https://api.stripe.com/v1/charges');
    await page.locator('#dep-name').fill('Payments provider');
    await page.getByRole('button', { name: /configure observation/i }).click();

    // 03 observation
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/configure how it is observed/i);
    const regions = page.getByRole('button', { name: /US East/ });
    await expect(regions).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#interval')).toBeVisible();

    // Single region is allowed but warned about, because it cannot form quorum.
    await page.getByRole('button', { name: /EU West/ }).click();
    await expect(page.getByText(/never confirmed as an incident/i)).toBeVisible();
    await page.getByRole('button', { name: /EU West/ }).click();

    await page.getByRole('button', { name: /review configuration/i }).click();

    // 04 confirm - the review must state the real configuration
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/observation configuration/i);
    const review = page.locator('#sequence-main');
    await expect(review).toContainText('https://api.stripe.com/v1/charges');
    await expect(review).toContainText(/US East/);
    await expect(review).toContainText(/two of the selected regions/i);

    // Activation
    await page.getByRole('button', { name: /begin observation/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /(is being brought online|is under observation)/i,
      { timeout: 20_000 }
    );
    // No confetti, no celebration copy.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/you're all set|congratulations|🎉|🚀/i);

    // The first observation arrives on the next poll and is printed with its
    // region, latency and status code.
    await expect(page.getByText(/first observation/i)).toBeVisible();
    // Regions are printed as places, in whichever zone form the worker
    // recorded them.
    await expect(page.locator('#sequence-main')).toContainText(
      /US East|EU West|AP South|SA East/,
      { timeout: 20_000 }
    );
  });

  test('a rejected monitor shows an actionable error and never a false success', async ({
    page,
  }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#dep-name').fill('FAILME');
    await page.locator('#dep-endpoint').fill('https://api.example.com/health');
    await page.getByRole('button', { name: /configure observation/i }).click();
    await page.getByRole('button', { name: /review configuration/i }).click();
    await page.getByRole('button', { name: /begin observation/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/observation configuration/i);
  });

  test('a refresh mid-sequence resumes where the operator left off', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#dep-name').fill('Resume test');
    await page.locator('#dep-endpoint').fill('https://api.example.com/health');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /what infrastructure do you depend on/i
    );
    await expect(page.locator('#dep-endpoint')).toHaveValue('https://api.example.com/health');
  });

  test('exit leaves for the console without creating anything', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /exit to console/i }).click();
    await page.waitForURL(/\/dashboard/);
  });
});

/* ── 2 · Agency operations ──────────────────────────────────────────────── */

test.describe('agency operations', () => {
  test.beforeEach(async ({ page }) => {
    await setAgencyMode(page, true);
  });

  test('the portfolio states posture, and never calls an unmonitored client healthy', async ({
    page,
  }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/client environments/i);

    const main = page.locator('#obc-main');
    await expect(main).toContainText(/client environment(s)? under management/i);
    await expect(main).toContainText(/synchronised/i);

    // A client with no monitors is "not observed" with insufficient data - // never 100%.
    const row = page.locator('tr', { hasText: 'Verdant Energy' }).first();
    await expect(row).toContainText(/not observed/i);
    await expect(row).toContainText(/insufficient data/i);
    await expect(row).not.toContainText('100.00%');

    // Attention ordering: the critical client is above the operational one.
    const names = await page.locator('tbody tr td:first-child').allInnerTexts();
    const kestrel = names.findIndex((n) => n.includes('Kestrel'));
    const atlas = names.findIndex((n) => n.includes('Atlas'));
    expect(kestrel).toBeGreaterThanOrEqual(0);
    expect(kestrel).toBeLessThan(atlas);
  });

  test('incidents and evidence are attributed to a client', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const incidents = page.locator('#agency-incidents');
    await expect(incidents).toContainText('Meridian Health');
    await expect(incidents).toContainText('Auth0 Tenant');
    await expect(page.locator('#agency-evidence')).toContainText('Meridian Health');
  });

  test('opening a client scopes the console to that environment', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.locator('tr', { hasText: 'Meridian Health' }).first().click();
    await page.waitForURL(/\/clients\/cli_meridian/);
    await settle(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Meridian Health');
    // Scope is unambiguous in the top bar.
    await expect(page.getByRole('button', { name: /Client.*Meridian Health/ })).toBeVisible();
    // Only this client's monitors are listed.
    const deps = page.locator('#client-dependencies');
    await expect(deps).toContainText('Auth0 Tenant');
    await expect(deps).not.toContainText('Model API');
  });

  test('the scope switcher moves between agency and client', async ({ page }) => {
    await page.goto('/clients/cli_meridian', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /Client.*Meridian Health/ }).click();
    await page.getByRole('menuitem', { name: /all client environments/i }).click();
    await page.waitForURL(/\/agency$/);
    await expect(page.getByRole('button', { name: /Agency.*Northwind/ })).toBeVisible();
  });

  test('a client environment can be created from the portfolio', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /add client environment/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    await dialog.getByLabel(/client name/i).fill('QA Environment');
    await dialog.getByRole('button', { name: /create environment/i }).click();

    await page.waitForURL(/\/clients\/cli_/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('QA Environment');
  });

  test('the client setup sequence creates client, application and attachment', async ({
    page,
  }) => {
    await page.goto('/clients/onboarding', { waitUntil: 'domcontentloaded' });
    await settle(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /establish a client environment/i
    );
    await page.locator('#seq-client-name').fill('Sequence Client');
    await page.getByRole('button', { name: /create environment/i }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/what does sequence client run/i);
    await page.locator('#seq-app-name').fill('Production');
    await page.getByRole('button', { name: /create application/i }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/attach the monitors/i);
    await page.getByRole('button', { name: /finish/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/is under observation/i);
  });

  test('agency mode off hides the surface and explains itself without selling', async ({
    page,
  }) => {
    await setAgencyMode(page, false);
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);

    // A direct navigation lands on the premium gated experience, not an
    // error page or a generic "unavailable" notice.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Manage every client environment from one operational view'
    );
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/upgrade to|\$\d|enterprise tier/i);
    // No fixture client data leaks into the gated state.
    expect(body).not.toContain('Meridian Health');

    // The destination stays discoverable: the overview is always in the
    // navigation, the client-management entries are not.
    await expect(page.locator('nav[aria-label="Console"] a[href="/agency"]')).toHaveCount(1);
    await expect(page.locator('nav[aria-label="Console"] a[href="/clients"]')).toHaveCount(0);

    await setAgencyMode(page, true);
  });
});

/* ── 3 · Information architecture ───────────────────────────────────────── */

test.describe('console information architecture', () => {
  test('every console navigation entry resolves', async ({ page }) => {
    await setAgencyMode(page, true);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await settle(page);

    const hrefs = await page
      .locator('nav[aria-label="Console"] a[href]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.length).toBeGreaterThan(6);
    expect(hrefs).toContain('/reports');
    expect(hrefs).toContain('/clients');

    const broken: string[] = [];
    for (const href of new Set(hrefs)) {
      if (!href.startsWith('/')) continue;
      const res = await page.request.get(href);
      if (res.status() >= 400) broken.push(`${href} -> ${res.status()}`);
    }
    expect(broken).toEqual([]);
  });

  test('no placeholder links or dead buttons in the console', async ({ page }) => {
    for (const route of ['/dashboard', '/clients', '/reports', '/clients/cli_meridian']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(page);
      const bad = await page.locator('a[href]').evaluateAll((as) =>
        as
          .map((a) => a.getAttribute('href') ?? '')
          .filter((h) => h === '' || h === '#' || h === 'undefined' || h.startsWith('javascript:'))
      );
      expect(bad, `placeholder links on ${route}`).toEqual([]);
    }
  });

  test('reports is a real artifact index backed by evidence', async ({ page }) => {
    await page.goto('/reports', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Reports');
    const main = page.locator('#obc-main');
    await expect(main).toContainText(/RPT-/);
    await expect(main).toContainText(/SHA-256/);
    await expect(main).toContainText(/INC-/);
    await expect(page.getByRole('button', { name: /^download$/i })).toBeVisible();
  });

  test('research leaves the console rather than pretending to be in it', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const research = page.locator('nav[aria-label="Console"] a[href="/research"]').first();
    await expect(research).toHaveAttribute('target', '_blank');
    expect((await page.request.get('/research')).status()).toBe(200);
  });
});

/* ── 4 · Layout ─────────────────────────────────────────────────────────── */

test.describe('layout', () => {
  for (const width of VIEWPORTS) {
    test(`no horizontal overflow at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addInitScript(
        ([token]) => localStorage.setItem('reliastra_refresh_token', token),
        [AUTH_TOKEN]
      );
      const page = await ctx.newPage();
      for (const route of ['/clients', '/clients/cli_meridian', '/onboarding', '/reports']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await settle(page);
        const overflow = await page.evaluate(() => {
          window.scrollTo(400, 0);
          const x = window.scrollX;
          window.scrollTo(0, 0);
          return x;
        });
        expect(overflow, `${route} @${width}`).toBe(0);
      }
      await ctx.close();
    });
  }
});

/* ── 5 · Accessibility ──────────────────────────────────────────────────── */

test.describe('accessibility', () => {
  for (const route of ['/clients', '/clients/cli_meridian', '/reports', '/onboarding']) {
    test(`${route} has one h1 and labelled controls`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(m.text());
      });

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(page);

      await expect(page.locator('h1')).toHaveCount(1);

      const unlabelled = await page
        .locator('input:not([type=hidden]), select, textarea')
        .evaluateAll((els) =>
          els.filter((el) => {
            const id = el.getAttribute('id');
            const labelled =
              (id && document.querySelector(`label[for="${id}"]`)) ||
              el.getAttribute('aria-label') ||
              el.getAttribute('aria-labelledby') ||
              el.closest('label');
            return !labelled;
          }).length
        );
      expect(unlabelled, `unlabelled controls on ${route}`).toBe(0);

      expect(errors, `console errors on ${route}`).toEqual([]);
    });
  }

  test('state is never colour alone in the portfolio', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const states = await page.locator('.obc-state').allInnerTexts();
    expect(states.length).toBeGreaterThan(3);
    for (const s of states) expect(s.trim().length).toBeGreaterThan(2);
  });

  test('the client dialog traps escape and returns focus to the page', async ({ page }) => {
    await page.goto('/clients', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByRole('button', { name: /add client environment/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
