import { expect, test } from '@playwright/test';
import {
  CONTRACT,
  PAYSTACK_MOCK,
  allPaystackInits,
  createAccount,
  decodeMailRaw,
  decodeMimeWords,
  expectTextContains,
  flatText,
  lastPaystackInit,
  resetPaystackMock,
  signIn,
} from './helpers';

/**
 * Getting TO the checkout, and getting back.
 *
 * The checkout page itself is covered by `checkout-page.spec.ts`. This file owns
 * the two seams around it, because those are where a customer is most likely to
 * be stranded:
 *
 *   1. **Entry.** Every paid-plan action in the product must arrive at
 *      RELIASTRA's own checkout with the plan and interval already chosen — not
 *      start a payment from inside a modal, and not open a provider tab that the
 *      customer then has to find their way back from. The upgrade dialog's job
 *      ends at handing over intent.
 *
 *   2. **Return.** A customer who comes back to a signed-in session — from the
 *      provider's hosted page, from an email link, or by pressing reload — must
 *      land on a state that tells them the truth about their payment. That
 *      includes the older `?pay_ref=` links already sitting in people's browser
 *      history and in sent receipts: the route changed, the link did not.
 */

const PASSWORD = 'Journey!2026';

test.describe('checkout entry and return', () => {
  test.beforeEach(async ({ request }) => {
    await resetPaystackMock(request);
  });

  test("the plan chooser hands off to RELIASTRA's checkout, price intact", async ({
    page,
    request,
  }) => {
    const email = `e2e-entry-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);

    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^upgrade$/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /choose your plan/i })).toBeVisible();

    // Transparency is mandatory on the chooser too, anchored on the resolved
    // figure so no assertion can catch a loading placeholder.
    await expect(dialog.locator('[data-testid="payment-charge-pro"]').first()).toHaveText(
      CONTRACT.actualChargeDisplay,
      { timeout: 30_000 },
    );
    const chooser = await flatText(dialog);
    expectTextContains(
      chooser,
      'Product price $39.00 (USD)',
      'Actual charge ₦60,000.00 (NGN)',
      'Payment provider Paystack',
      CONTRACT.notice,
    );

    // Choosing PRO opens the checkout — it does not pay from here. The dialog is
    // RELIASTRA's, the payment is Paystack's, and the review step belongs to the
    // page whose URL the customer can go back to.
    await dialog.getByRole('button', { name: /upgrade to pro/i }).click();
    await page.waitForURL(/\/checkout\?/, { timeout: 60_000 });
    expect(page.url()).toContain('plan=pro');
    expect(page.url()).not.toContain(PAYSTACK_MOCK);

    // The hand-off carries intent, and the page re-prices it server-side.
    await expect(page.locator('[data-testid="checkout-charge-amount"]')).toHaveText(
      CONTRACT.actualChargeDisplay,
      { timeout: 60_000 },
    );
    await expect(page.locator('[data-testid="checkout-review-plan"]')).toContainText(/RELIASTRA Pro/);
    // No payment has been started by arriving here.
    expect(await lastPaystackInit(request)).toBeNull();

    // Pay, from the checkout page, on the checkout page's own terms.
    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(page.locator('#reliastra-mock-paystack-overlay')).toBeVisible({
      timeout: 60_000,
    });
    await page.locator('#reliastra-mock-paystack-overlay button[data-out="success"]').click();
    await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
      timeout: 60_000,
    });

    const init = await lastPaystackInit(request);
    expect(init!.amount).toBe(CONTRACT.paymentAmountMinor);
    expect(init!.currency).toBe(CONTRACT.paymentCurrency);
    expect(init!.channels).toEqual(['card']);

    // And the console now reflects a paid plan without another click.
    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    const row = page.locator(`[data-testid="transaction-row-${init!.reference}"]`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    expectTextContains(
      await flatText(row),
      CONTRACT.actualChargeDisplay,
      CONTRACT.productAmountDisplay,
    );
  });

  test('the annual choice survives the hand-off', async ({ page, request }) => {
    const email = `e2e-entry-annual-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);

    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^upgrade$/i }).first().click();
    const dialog = page.getByRole('dialog');
    const annual = dialog.getByRole('button', { name: /annual/i }).first();
    if (await annual.isVisible().catch(() => false)) {
      await annual.click();
      await expect(dialog.locator('[data-testid="payment-charge-pro"]').first()).toHaveText(
        CONTRACT.annualChargeDisplay,
        { timeout: 30_000 },
      );
      await dialog.getByRole('button', { name: /upgrade to pro/i }).click();
      await page.waitForURL(/\/checkout\?/, { timeout: 60_000 });
      expect(page.url()).toContain('interval=annual');
      await expect(page.locator('[data-testid="checkout-charge-amount"]')).toHaveText(
        CONTRACT.annualChargeDisplay,
        { timeout: 60_000 },
      );
      await page.locator('[data-testid="checkout-continue"]').click();
      await expect(page.locator('#reliastra-mock-paystack-overlay')).toBeVisible({
        timeout: 60_000,
      });
      const init = await lastPaystackInit(request);
      expect(init!.amount).toBe(CONTRACT.annualAmountMinor);
      expect(init!.metadata).toMatchObject({ billing_interval: 'annual' });
    } else {
      // No annual control in this build: the checkout must not invent one.
      expect(await flatText(dialog)).not.toMatch(/annual/i);
    }
  });

  test('the landing page sends new customers to an account, not to a payment', async ({
    page,
  }) => {
    /**
     * Checkout is organization-scoped: the quote is priced against an account and
     * the receipt has to arrive in somebody's mailbox. A visitor with no
     * workspace therefore goes to signup — a checkout they could only be turned
     * away from is a worse first impression than an honest queue.
     */
    await page.goto('/#pricing', { waitUntil: 'domcontentloaded' });
    const cta = page.locator('[data-testid="pricing-cta-pro"]');
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.getByRole('button').click();
    await page.waitForURL(/\/signup/, { timeout: 30_000 });
    expect(page.url()).not.toContain('checkout');
  });

  test('a reference from an older link still resolves to the payment', async ({
    page,
    request,
  }) => {
    /**
     * `?pay_ref=` predates this checkout page: it is in sent receipts, in browser
     * history, and in tabs left open over a weekend. It must not become a dead
     * link or — worse — a second chance to pay. Visiting it with a paid reference
     * verifies that reference and reports what was actually collected.
     */
    const email = `e2e-payref-${Date.now()}@reliastra.dev`;
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);

    // Take a payment through the checkout, then come back the old way.
    await page.goto('/checkout?plan=pro&interval=monthly', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-continue"]')).toBeVisible({
      timeout: 60_000,
    });
    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(page.locator('#reliastra-mock-paystack-overlay')).toBeVisible({
      timeout: 60_000,
    });
    await page.locator('#reliastra-mock-paystack-overlay button[data-out="success"]').click();
    await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
      timeout: 60_000,
    });
    const init = await lastPaystackInit(request);

    await page.goto(`/settings/billing?pay_ref=${init!.reference}`, {
      waitUntil: 'domcontentloaded',
    });
    const banner = page.locator('[data-testid="payment-confirmation"]');
    await expect(banner).toBeVisible({ timeout: 60_000 });
    expectTextContains(
      await flatText(banner),
      CONTRACT.actualChargeDisplay,
      CONTRACT.productAmountDisplay,
    );
    // The address bar is tidied, so the banner cannot be re-triggered by refresh
    // into a state the customer reads as a second charge.
    expect(page.url()).not.toContain('pay_ref=');

    // Nothing new was asked of Paystack by coming back: one payment, one capture.
    const captures = await allPaystackInits(request);
    expect(captures.length).toBe(1);

    const planRes = await request.get('/api/v1/billing/plan', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-ID': organizationId },
    });
    expect((await planRes.json()).plan).toBe('pro');
  });

  test('a paid plan never shows an upgrade path that charges again by accident', async ({
    page,
    request,
  }) => {
    const email = `e2e-aftermath-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await page.goto('/checkout?plan=pro', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-continue"]')).toBeVisible({
      timeout: 60_000,
    });
    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(page.locator('#reliastra-mock-paystack-overlay')).toBeVisible({
      timeout: 60_000,
    });
    await page.locator('#reliastra-mock-paystack-overlay button[data-out="success"]').click();
    await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
      timeout: 60_000,
    });

    // Returning to checkout for a plan already held must not be an invitation to
    // buy it twice: the page says what the account already is.
    await page.goto('/checkout?plan=pro&interval=monthly', { waitUntil: 'domcontentloaded' });
    const body = await flatText(page.locator('main'));
    expectTextContains(
      body,
      'already subscribed to RELIASTRA Pro on monthly billing',
      'Paying again would add a second charge for a covered period',
    );

    // The receipt email states the figures the page stated.
    const mails = await request.get(
      `${process.env.E2E_MAIL_URL ?? 'http://127.0.0.1:8025'}/`,
    );
    const { messages } = await mails.json();
    const receipt = (messages as { subject: string; to: string; raw: string }[]).find(
      (m) => /receipt/i.test(decodeMimeWords(m.subject)) && m.to.toLowerCase().includes(email),
    );
    expect(receipt, 'no receipt email captured').toBeTruthy();
    const receiptText = decodeMailRaw(receipt!.raw);
    expectTextContains(
      receiptText,
      'Product price: $39.00 (USD)',
      'Actual charge: ₦60,000.00 (NGN)',
      'Payment provider: Paystack',
    );
    // The reference belongs on the receipt: it is the only thing a customer can
    // quote to support, and the only key into the record we persisted.
    const init = await lastPaystackInit(request);
    expect(receiptText).toContain(init!.reference);
  });
});
