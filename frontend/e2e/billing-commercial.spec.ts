import { expect, test } from '@playwright/test';
import {
  CONTRACT,
  continueToSecurePayment,
  createAccount,
  expectTextContains,
  flatText,
  lastPaystackInit,
  resetPaystackMock,
  signIn,
} from './helpers';

const PASSWORD = 'Commercial!2026';

test.describe('commercial billing experience', () => {
  test.beforeEach(async ({ request }) => {
    await resetPaystackMock(request);
  });

  test('pricing, refund policy and checkout all state $39 with no money-back window', async ({
    page,
    request,
  }) => {
    const pricing = await request.get('/api/v1/pricing');
    expect(pricing.ok()).toBeTruthy();
    const body = await pricing.json();
    const pro = body.plans.find((p: { plan: string }) => p.plan === 'pro');
    expect(pro.price_usd).toBe(39);
    expect(pro.price_annual_usd).toBe(390);
    expect(pro.transparency.monthly.product_price).toBe(CONTRACT.productAmountDisplay);
    expect(body.refund_policy_path).toBe('/refund-policy');
    expect(body.refund_summary).toMatch(/does not advertise a fixed money-back window/i);

    const terms = await request.get('/api/v1/billing/terms');
    expect(terms.ok()).toBeTruthy();
    const policy = await terms.json();
    expect(policy.pro_price_usd).toBe(39);
    expect(policy.refund_period_days).toBeNull();
    expect(policy.trial_length_days).toBe(14);
    expect(policy.trial_requires_payment).toBe(false);

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });
    const proCard = page.locator('[data-testid="pricing-card-pro"]');
    await expect(proCard).toBeVisible({ timeout: 30_000 });
    expectTextContains(await flatText(proCard), 'Product price $39.00 (USD)');
    expect(await flatText(page.locator('main'))).toMatch(/\$39/);
    expect(await flatText(page.locator('main'))).not.toMatch(/\$19\.00/);

    await page.goto('/refund-policy', { waitUntil: 'domcontentloaded' });
    const refund = await flatText(page.locator('main'));
    expectTextContains(
      refund,
      'does not advertise a fixed money-back window',
      'billing@reliastra.com',
      'Cancellation',
    );
    expect(refund.toLowerCase()).not.toMatch(/14-day money-back|30-day money-back/);

    await page.goto('/checkout?plan=standard&interval=monthly', { waitUntil: 'domcontentloaded' });
    const signedOut = page.locator('[data-testid="checkout-signed-out"]');
    await expect(signedOut).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain('plan=standard');
  });

  test('checkout requires terms, then billing history invoices and cancel/resume work', async ({
    page,
    request,
  }) => {
    const email = `e2e-commercial-${Date.now()}@reliastra.dev`;
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);

    await page.goto('/checkout?plan=standard&interval=monthly', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="checkout-review-plan"]')).toContainText(/RELIASTRA Pro/, {
      timeout: 60_000,
    });
    await expect(page.getByText(CONTRACT.productAmountDisplay).first()).toBeVisible();
    const commercial = page.locator('[data-testid="checkout-commercial-terms"]');
    await expect(commercial).toBeVisible();
    expectTextContains(
      await flatText(commercial),
      'You may cancel at any time',
      'does not advertise a fixed money-back window',
    );

    const continueBtn = page.locator('[data-testid="checkout-continue"]');
    await expect(continueBtn).toBeDisabled();
    await continueToSecurePayment(page);
    await expect(page.locator('#reliastra-mock-paystack-overlay')).toBeVisible({ timeout: 60_000 });
    await page.locator('#reliastra-mock-paystack-overlay button[data-out="success"]').click();
    await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
      timeout: 60_000,
    });

    const init = await lastPaystackInit(request);
    expect(init!.amount).toBe(CONTRACT.paymentAmountMinor);
    expect(init!.metadata).toMatchObject({
      product_amount_minor: String(CONTRACT.productAmountMinor),
    });

    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="billing-plan"]')).toBeVisible({ timeout: 60_000 });
    expectTextContains(await flatText(page.locator('[data-testid="billing-plan"]')), 'Pro');
    const row = page.locator(`[data-testid="transaction-row-${init!.reference}"]`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    expectTextContains(
      await flatText(row),
      CONTRACT.actualChargeDisplay,
      CONTRACT.productAmountDisplay,
    );

    const invoiceView = page.locator(`[data-testid="invoice-view-${init!.reference}"]`);
    const [popup] = await Promise.all([
      page.waitForEvent('popup').catch(() => null),
      invoiceView.click(),
    ]);
    if (popup) {
      await popup.waitForLoadState('domcontentloaded');
      expectTextContains(await flatText(popup.locator('body')), 'Invoice', 'RELIASTRA');
      await popup.close();
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Organization-ID': organizationId,
    };
    const txRes = await request.get('/api/v1/billing/transactions', { headers });
    const tx = (await txRes.json()).items.find(
      (t: { reference: string }) => t.reference === init!.reference,
    );
    expect(tx.invoice_url).toContain('/invoice');
    const invoice = await request.get(
      `/api/v1/billing/transactions/${tx.id}/invoice`,
      { headers },
    );
    expect(invoice.ok()).toBeTruthy();
    expect(invoice.headers()['content-type'] ?? '').toMatch(/html/);
    const invoiceHtml = await invoice.text();
    expect(invoiceHtml).toContain('$39.00 (USD)');
    expect(invoiceHtml).toContain(init!.reference);

    const receipt = await request.get(
      `/api/v1/billing/transactions/${tx.id}/receipt`,
      { headers },
    );
    expect(receipt.ok()).toBeTruthy();
    expect(await receipt.text()).toContain('Receipt');

    await expect(page.locator('[data-testid="cancel-subscription"]')).toBeVisible();
    await page.locator('[data-testid="cancel-subscription"]').click();
    await page.locator('[data-testid="confirm-cancel-subscription"]').click();
    await expect(page.locator('[data-testid="resume-subscription"]')).toBeVisible({
      timeout: 30_000,
    });
    const cancelled = await request.get('/api/v1/billing/plan', { headers });
    expect((await cancelled.json()).cancel_at_period_end).toBe(true);

    await page.locator('[data-testid="resume-subscription"]').click();
    await expect(page.locator('[data-testid="cancel-subscription"]')).toBeVisible({
      timeout: 30_000,
    });
    const resumed = await request.get('/api/v1/billing/plan', { headers });
    expect((await resumed.json()).cancel_at_period_end).toBe(false);
    expect((await resumed.json()).plan).toBe('pro');
  });

  test('failed payment stays on Free and is listed in history', async ({ page, request }) => {
    const email = `e2e-failpay-${Date.now()}@reliastra.dev`;
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await page.goto('/checkout?plan=pro&interval=monthly', { waitUntil: 'domcontentloaded' });
    await continueToSecurePayment(page);
    await expect(page.locator('#reliastra-mock-paystack-overlay')).toBeVisible({ timeout: 60_000 });
    await page.locator('#reliastra-mock-paystack-overlay button[data-out="decline"]').click();
    await expect(page.locator('[data-testid="checkout-failure"]')).toBeVisible({ timeout: 60_000 });

    const planRes = await request.get('/api/v1/billing/plan', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-ID': organizationId },
    });
    expect((await planRes.json()).plan).toBe('free');
  });
});
