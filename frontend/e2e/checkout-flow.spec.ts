import { expect, test } from '@playwright/test';
import {
  CONTRACT,
  PAYSTACK_MOCK,
  createAccount,
  decodeMailRaw,
  decodeMimeWords,
  flatText,
  lastPaystackInit,
  expectTextContains,
  resetPaystackMock,
  signIn,
} from './helpers';

/**
 * THE core journey, through the real UI end to end:
 *   sign in -> billing -> plan chooser -> checkout review -> hosted Paystack
 *   payment -> redirected back -> confirmation + persisted history + receipt.
 *
 * The assertion that matters: the exact amount + currency the RELIASTRA
 * backend asked Paystack to charge EQUALS what the customer was shown —
 * ₦60,000.00 on screen == 6,000,000 kobo + currency NGN upstream. Never
 * USD minor units, never an FX calculation.
 */

const PASSWORD = 'Journey!2026';

test.describe('checkout to payment', () => {
  test.beforeEach(async ({ request }) => {
    await resetPaystackMock(request);
  });

  test('Pro monthly: screen figure == provider request, then receipt trail', async ({
    page,
    request,
  }) => {
    const email = `e2e-billing-${Date.now()}@reliastra.dev`;

    // A real account, created through the app's own signup + emailed OTP.
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);

    // Land on the console billing page and open the plan chooser.
    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^upgrade$/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /choose your plan/i })).toBeVisible();

    // Transparency is mandatory on the chooser too.
    // Anchor first on the resolved figure so no assertion can catch the
    // placeholder state of the shared currency fetch.
    await expect(
      dialog.locator('[data-testid="payment-charge-pro"]').first(),
    ).toHaveText(CONTRACT.actualChargeDisplay, { timeout: 30_000 });
    const chooserText = await flatText(dialog);
    expectTextContains(chooserText, 'Product price $39.00 (USD)');
    expectTextContains(chooserText, 'Actual charge ₦60,000.00 (NGN) per month');
    expectTextContains(chooserText, 'Payment provider Paystack');
    expectTextContains(chooserText, CONTRACT.notice);

    // Confirm -> review step: the last RELIASTRA-owned screen before the
    // provider, and its CTA names the provider + exact figure.
    await dialog.getByRole('button', { name: /upgrade to pro/i }).click();
    await expect(
      dialog.getByRole('heading', { name: /review your subscription/i }),
    ).toBeVisible();
    const charge = dialog.locator('[data-testid="payment-charge-pro"]');
    await expect(charge).toHaveText(CONTRACT.actualChargeDisplay);
    expectTextContains(
      await flatText(dialog.locator('[data-testid="payment-transparency-pro"]')),
      'Payment provider Paystack',
    );
    const cta = dialog.getByRole('button', { name: /continue to paystack/i });
    await expect(cta).toBeVisible();
    // The button itself restates the exact figure the provider will charge.
    expectTextContains(await flatText(cta), 'Continue to Paystack', CONTRACT.actualChargeDisplay);

    // Pay. The browser leaves RELIASTRA for the hosted checkout page — the
    // same figure must be on it.
    await dialog.getByRole('button', { name: /continue to paystack/i }).click();
    await page.waitForURL(`${PAYSTACK_MOCK}/pay/**`, { timeout: 90_000 });
    // The provider's hosted URL carries the reference; grab it here because
    // the billing page tidies ?pay_ref= out of the address bar once handled.
    const payRef = decodeURIComponent(page.url().split('/pay/')[1]);
    const hostedText = await flatText(page.locator('body'));
    expectTextContains(hostedText, 'NGN 60,000.00');

    // What the backend actually asked Paystack to charge (captured upstream).
    const init = await lastPaystackInit(request);
    expect(init, 'no initialize captured by the Paystack stand-in').not.toBeNull();
    expect(init!.amount).toBe(CONTRACT.paymentAmountMinor); // 6_000_000 kobo
    expect(init!.currency).toBe(CONTRACT.paymentCurrency); // "NGN"
    expect(init!.amount).not.toBe(CONTRACT.productAmountMinor); // NOT USD minor units
    // The reconciliation metadata rides along (minor units as strings by
    // contract) — and the two amounts are DIFFERENT numbers, which is the
    // whole point: the kobo amount was never a USD→NGN reinterpretation.
    expect(init!.metadata).toMatchObject({
      currency: CONTRACT.paymentCurrency,
      amount_minor: String(CONTRACT.paymentAmountMinor),
      product_currency: CONTRACT.productCurrency,
      product_amount_minor: String(CONTRACT.productAmountMinor),
    });
    expect(init!.metadata!.amount_minor).not.toBe(init!.metadata!.product_amount_minor);

    // Customer pays on the hosted page and is returned to RELIASTRA.
    await page.getByRole('button', { name: /^pay NGN/i }).click();
    await page.waitForURL(/\/settings\/billing\?pay_ref=/, { timeout: 90_000 });

    // Confirmation banner: built from what the GATEWAY reported, not re-read
    // from the catalog, and re-states both currencies + the provider.
    const banner = page.locator('[data-testid="payment-confirmation"]');
    await expect(banner).toBeVisible({ timeout: 60_000 });
    const bannerText = await flatText(banner);
    expectTextContains(bannerText, '₦60,000.00 (NGN)');
    expectTextContains(bannerText, '$39.00 (USD)');
    expect(bannerText).toMatch(/Payment provider Paystack/i);

    // Billing history now carries the real, persisted charge — labelled in
    // both currencies and linked to the provider reference.
    const ref = payRef;
    const row = page.locator(`[data-testid="transaction-row-${ref}"]`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    const rowText = await flatText(row);
    expectTextContains(rowText, '₦60,000.00 (NGN)');
    expectTextContains(rowText, '$39.00 (USD)');

    // The API's own view of history agrees with what the UI shows.
    // (Authenticated with the same bearer token the app store holds —
    // localStorage is browser-side, the request fixture is not the browser.)
    const txRes = await request.get('/api/v1/billing/transactions', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Organization-ID': organizationId,
      },
    });
    expect(txRes.ok()).toBeTruthy();
    const txBody = await txRes.json();
    const tx = txBody.items.find((t: { reference: string }) => t.reference === ref);
    expect(tx, 'transaction not persisted server-side').toBeTruthy();
    expect(tx.charged_amount_minor).toBe(CONTRACT.paymentAmountMinor);
    expect(tx.charged_currency).toBe(CONTRACT.paymentCurrency);
    expect(tx.product_amount_minor).toBe(CONTRACT.productAmountMinor);
    expect(tx.product_currency).toBe(CONTRACT.productCurrency);
    expect(tx.status).toBe('success'); // persisted provider status; the UI words it as “successful”
    expect(txBody.payment.notice).toBe(CONTRACT.notice);

    // The receipt email states the same figures, labelled.
    const mails = await request.get('http://127.0.0.1:8025/');
    expect(mails.ok()).toBeTruthy();
    const { messages } = await mails.json();
    const receipt = (messages as { subject: string; to: string; raw: string }[]).find(
      (m) =>
        /receipt/i.test(decodeMimeWords(m.subject)) &&
        m.to.toLowerCase().includes(email),
    );
    expect(receipt, 'no receipt email captured for this run').toBeTruthy();
    const body = decodeMailRaw(receipt!.raw).replace(/\s+/g, ' ');
    expectTextContains(body, 'Product price: $39.00 (USD)');
    expectTextContains(body, 'Actual charge: ₦60,000.00 (NGN)');
    expectTextContains(body, 'Payment provider: Paystack');
    expectTextContains(body, 'collected by Paystack in NGN');
  });
});
