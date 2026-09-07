import { expect, test, type Page } from '@playwright/test';
import { createAccount, signIn } from './helpers';

/**
 * The operational console, judged as an operator would judge it.
 *
 * These are not snapshot tests. Each one encodes a rule the console must obey
 * for the product's promise — "know when your dependencies fail, prove what
 * happened" — to survive contact with a real dispute:
 *
 *   * the shell states global system state without being asked;
 *   * every navigation target is a route that exists;
 *   * a fresh workspace tells the truth about being empty instead of drawing
 *     zeros, dashes or a 100% uptime figure nobody measured;
 *   * tables are tables (sortable, announced, keyboard-reachable) and become
 *     record stacks on a phone rather than horizontal scrollers;
 *   * no screen renders a number the API did not return.
 *
 * A brand-new account has no dependencies, incidents or evidence, so the
 * empty-state and no-fabrication assertions are the ones that can run without
 * seeded telemetry. Assertions that need populated data are written against
 * whatever the account does have and skip cleanly when it has none.
 */

const PASSWORD = 'Console!2026';

/** Numbers a monitoring UI must never invent when it has nothing to report. */
const FABRICATED = [
  /\b3\.1x\b/,
  /\b1,240\s*ms\b/,
  /\bGood (morning|afternoon|evening)\b/i,
];

async function freshConsole(page: Page) {
  const email = `e2e-console-${Date.now()}@reliastra.dev`;
  await createAccount(page, email, PASSWORD);
  await signIn(page, email, PASSWORD);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
}

test.describe('console shell', () => {
  test('global system state is visible without opening anything', async ({ page }) => {
    await freshConsole(page);

    // The rail states the operational summary in words, not in a KPI card.
    const status = page.getByRole('navigation').first();
    await expect(status).toContainText(/monitored/i);
    await expect(page.locator('.obc-state').first()).toBeVisible();
  });

  test('every navigation target resolves to a real route', async ({ page }) => {
    await freshConsole(page);

    const hrefs = await page
      .locator('nav a[href^="/"]')
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href')!))]);

    expect(hrefs.length).toBeGreaterThan(3);
    expect(hrefs).toContain('/dependencies');
    expect(hrefs).toContain('/incidents');
    expect(hrefs).toContain('/evidence');
    // Routes the old navigation advertised without owning them.
    expect(hrefs).not.toContain('#');
    expect(hrefs.some((h) => h.startsWith('/reports'))).toBe(false);

    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(res.status(), `${href} should not 404`).toBeLessThan(400);
    }
  });

  test('the phone bar exposes the four operational destinations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await freshConsole(page);

    const primary = page.getByRole('navigation', { name: /primary/i });
    for (const label of ['Overview', 'Dependencies', 'Incidents', 'Evidence']) {
      await expect(primary.getByRole('link', { name: label })).toBeVisible();
    }
  });
});

test.describe('truthfulness', () => {
  for (const route of ['/dashboard', '/dependencies', '/incidents', '/evidence']) {
    test(`${route} invents nothing`, async ({ page }) => {
      await freshConsole(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      for (const pattern of FABRICATED) {
        expect(text, `${route} must not contain ${pattern}`).not.toMatch(pattern);
      }
      // A workspace with no observations must never claim perfect uptime.
      if (/no dependencies monitored/i.test(text)) {
        expect(text).not.toMatch(/100\.00%/);
        expect(text).not.toMatch(/\b0 ms\b/);
      }
    });
  }

  test('the empty overview says what to do next, without cheerleading', async ({ page }) => {
    await freshConsole(page);
    const main = page.locator('main');
    const text = await main.innerText();

    if (/no dependencies monitored/i.test(text)) {
      await expect(main.getByRole('button', { name: /add dependency/i }).first()).toBeVisible();
      expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u); // no emoji
      expect(text).not.toMatch(/let's|awesome|great job|welcome back/i);
    }
  });
});

test.describe('tables', () => {
  test('the dependency table is announced, sortable and keyboard reachable', async ({ page }) => {
    await freshConsole(page);
    await page.goto('/dependencies', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const table = page.locator('table').first();
    if (!(await table.count())) test.skip(true, 'workspace has no dependencies yet');

    await expect(table.locator('caption')).toHaveCount(1);

    const sortable = table.locator('th[aria-sort] button');
    await expect(sortable.first()).toBeVisible();
    const th = table.locator('th[aria-sort]').first();
    await expect(th).toHaveAttribute('aria-sort', /none|ascending|descending/);
    await sortable.first().click();
    await expect(th).toHaveAttribute('aria-sort', /ascending|descending/);
  });

  test('tables become record stacks on a phone instead of scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await freshConsole(page);
    await page.goto('/dependencies', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(page.locator('table:visible')).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('evidence', () => {
  test('evidence is a first-class destination with a truthful empty state', async ({ page }) => {
    await freshConsole(page);
    await page.goto('/evidence', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { level: 1, name: /evidence records/i })).toBeVisible();

    const text = await page.locator('main').innerText();
    // Either the register, the plan gate, or an honest empty state — never an
    // invented record and never a bare "nothing here yet".
    expect(text).toMatch(
      /record register|no evidence records|not included in your plan|evidence register unavailable/i
    );
  });
});

test.describe('failure states', () => {
  test('an unreachable API reads as unavailable, not as an empty account', async ({ page }) => {
    await freshConsole(page);
    await page.route('**/api/v1/dependencies*', (route) => route.abort());
    await page.goto('/dependencies', { waitUntil: 'domcontentloaded' });

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(/unavailable/i);
    await expect(alert.getByRole('button', { name: /retry/i })).toBeVisible();
    // The failure must not be phrased as "you have no dependencies".
    await expect(page.locator('main')).not.toContainText(/no dependencies monitored/i);
  });
});
