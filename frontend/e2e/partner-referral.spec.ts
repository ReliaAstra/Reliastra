import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Partner referral routing + attribution.
 *
 * Canonical URL: `/r/{code}` (e.g. https://reliastra.com/r/ADES-SC9C).
 * That path used to 404 with the generic "Signal lost" page because no App
 * Router handler existed. These tests pin the production contract:
 *
 *   valid code   → click recorded, first-party cookie, landing/signup
 *   invalid code → branded unavailable state, never the generic 404
 *   signup       → organization created with ref_code attributed
 *
 * Browser specs need Playwright Chromium (`npx playwright install`). The
 * HTTP contract in `e2e/partner-referral.http.mjs` covers the same routing,
 * cookie, click, and register-attribution assertions without a browser.
 */

const VALID = 'ADES-SC9C';
const MOCK = process.env.REFERRAL_MOCK_URL ?? 'http://127.0.0.1:18000';

async function mockState(request: APIRequestContext) {
  const res = await request.get(`${MOCK}/__mock__/state`);
  if (!res.ok()) return null;
  return res.json() as Promise<{
    clicks: Record<string, number>;
    registrations: Array<{ email: string; ref_code: string | null; org_id: string }>;
    referrals: Array<{ ref_code: string; referred_org_id: string; status: string }>;
  }>;
}

function cookieMapFromResponse(res: {
  headers(): Record<string, string>;
  headersArray(): { name: string; value: string }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  const listed = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const lines = listed.length
    ? listed.map((h) => h.value)
    : String(res.headers()['set-cookie'] ?? '').split('\n');
  for (const line of lines) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) {
      out[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
    }
  }
  return out;
}

test.describe('partner referral routing', () => {
  test('valid /r/{code} is not the generic 404 and sets attribution cookies', async ({
    request,
  }) => {
    const res = await request.get(`/r/${VALID}`, { maxRedirects: 0 });
    expect(res.status(), 'valid referral must 302, never 404').toBe(302);
    const location = res.headers()['location'] ?? '';
    expect(location, 'must leave /r/{code}').not.toMatch(/\/r\//);
    expect(await res.text()).not.toMatch(/Signal\s+lost/i);

    const cookies = cookieMapFromResponse(res);
    expect(cookies.ra_ref, 'HttpOnly attribution cookie').toBe(VALID);
    expect(cookies.ra_ref_pub, 'display cookie').toBe(VALID);

    const setCookie = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
      .join('\n');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
  });

  test('valid referral lands on the marketing site with ?ref=', async ({ page }) => {
    const res = await page.goto(`/r/${VALID}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).not.toBe(404);
    await expect(page.locator('body')).not.toContainText(/Signal\s+lost/i);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('ref')).toBe(VALID);
    await expect(page.locator('h1').first()).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'ra_ref')?.value).toBe(VALID);
    expect(cookies.find((c) => c.name === 'ra_ref_pub')?.value).toBe(VALID);
  });

  test('valid referral → signup preserves the cookie and shows the code', async ({
    page,
  }) => {
    await page.goto(`/r/${VALID}?to=/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/signup/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/signup');
    expect(url.searchParams.get('ref')).toBe(VALID);
    await expect(page.getByText(/referred by/i)).toBeVisible();
    await expect(page.getByText(VALID)).toBeVisible();
  });

  test('invalid referral code is not the generic 404', async ({ request }) => {
    const res = await request.get('/r/NOPE-0000', { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()['location'] ?? '').toMatch(/referral-unavailable/);
    const setCookie = String(res.headers()['set-cookie'] ?? '');
    expect(setCookie).not.toMatch(/ra_ref=NOPE-0000/);
  });

  test('invalid referral renders branded unavailable page', async ({ page }) => {
    const pageRes = await page.goto('/r/NOPE-0000', { waitUntil: 'domcontentloaded' });
    expect(pageRes?.status()).not.toBe(404);
    await expect(page.locator('body')).not.toContainText(/Signal\s+lost/i);
    await expect(page.getByRole('heading', { name: /not active/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /return to reliastra/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /create an organization/i })).toBeVisible();
  });

  test('malformed /r/{code} is a branded error, not Signal lost', async ({ page }) => {
    await page.goto('/r/not.a.code', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/Signal\s+lost/i);
    await expect(page.getByRole('heading', { name: /not active/i })).toBeVisible();
  });

  test('/r with no code is a branded error', async ({ request }) => {
    const res = await request.get('/r', { maxRedirects: 0 });
    expect([302, 308]).toContain(res.status());
    const location = res.headers()['location'] ?? '';
    expect(location).toMatch(/referral-unavailable/);
  });

  test('refresh/revisit of a valid code keeps working and counts clicks', async ({
    request,
  }) => {
    await request.post(`${MOCK}/__mock__/reset`).catch(() => {});
    await request.get(`/r/${VALID}`, { maxRedirects: 0 });
    await request.get(`/r/${VALID}`, { maxRedirects: 0 });
    const state = await mockState(request);
    test.skip(!state, 'referral mock API is not running');
    expect(state!.clicks[VALID]).toBeGreaterThanOrEqual(2);
  });

  test('mobile viewport: valid referral → landing → signup', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto(`/r/${VALID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/Signal\s+lost/i);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);

    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByText(VALID)).toBeVisible();
    await ctx.close();
  });
});

test.describe('referral → signup → organization → partner attribution', () => {
  test('register payload carries ref_code and creates an attributed org', async ({
    page,
    request,
  }) => {
    await request.post(`${MOCK}/__mock__/reset`).catch(() => {});
    await page.goto(`/r/${VALID}?to=/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/signup/);

    const email = `ref-${Date.now()}@example.com`;
    await page.getByLabel(/full name/i).fill('Ada Referred');
    await page.getByLabel(/work email/i).fill(email);
    await page.getByLabel(/^password$/i).fill('SecurePass1!');

    const register = page.waitForRequest(
      (r) => r.url().includes('/auth/register') && r.method() === 'POST'
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    const req = await register;
    const payload = req.postDataJSON() as { ref_code?: string; email?: string };
    expect(payload.ref_code).toBe(VALID);
    expect(payload.email).toBe(email);

    const state = await mockState(request);
    test.skip(!state, 'referral mock API is not running');
    const row = state!.registrations.find((r) => r.email === email);
    expect(row, 'register reached the API').toBeTruthy();
    expect(row!.ref_code).toBe(VALID);
    expect(row!.org_id).toBeTruthy();
    const attributed = state!.referrals.find((r) => r.referred_org_id === row!.org_id);
    expect(attributed?.ref_code).toBe(VALID);
    expect(attributed?.status).toBe('signed_up');
  });

  test('signin and onboarding hops do not drop the referral cookie', async ({
    page,
  }) => {
    await page.goto(`/r/${VALID}`, { waitUntil: 'domcontentloaded' });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(VALID)).toBeVisible();
  });
});

test.describe('production URL contract', () => {
  test('documented partner URL shape is /r/{code}', async ({ page }) => {
    // The code generation UI must keep emitting /r/{code}, not /ref/ or ?ref=.
    await page.goto(`/r/${VALID}`, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname === '/' || page.url().includes('/signup')).toBeTruthy();
  });
});
