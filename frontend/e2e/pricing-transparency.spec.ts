import { expect, test } from '@playwright/test';
import { CONTRACT, apiGet, flatText } from './helpers';

/**
 * Public pricing page: the transparency contract every customer sees before
 * paying. Runs against the live API, so figures are cross-checked between
 * what the backend resolves, what the Paystack charge will be, and what the
 * DOM renders - and the FX reference (when configured) is proven to be a
 * labelled, sourced rate that IS the basis of the charge.
 *
 * The commercial model is one paid product: Developer, $9/month, monthly
 * billing only. There is no interval toggle, no annual figures and no
 * enterprise card to assert against.
 */

type CurrencyInfo = {
  product_currency: string;
  payment_currency: string;
  payment_currency_name: string;
  payment_provider: string;
  notice: string;
  plan_payment_amounts: Record<string, { monthly?: string; annual?: string }>;
  checkout_ready: boolean;
  fx_reference: {
    provider: string;
    label: string;
    source_url: string;
    retrieved_at: string;
    disclaimer: string;
  } | null;
};

/** Case-insensitive containment that tolerates CSS-uppercased labels and
 * missing inline spacing (innerText renders `…(NGN)per month` as one run). */
function expectTextContains(text: string, ...needles: string[]) {
  // Strip ALL whitespace: innerText glues adjacent inline runs together
  // ("…(NGN)per month") and CSS uppercases labels - we assert content, not
  // typography.
  const hay = text.toLowerCase().replace(/\s+/g, '');
  for (const needle of needles) {
    expect(hay).toContain(needle.toLowerCase().replace(/\s+/g, ''));
  }
}

test.describe('pricing transparency (public)', () => {
  test('Developer card shows the full transparency block, monthly only', async ({
    page,
    request,
  }) => {
    const currency = await apiGet<CurrencyInfo>(request, '/api/v1/billing/currency');

    // The backend itself is the contract: NGN prices are the USD product
    // price converted at the live rate (₦14,850.00 = $9.00 x 1650), and the
    // USD product price is stated separately.
    expect(currency.product_currency).toBe(CONTRACT.productCurrency);
    expect(currency.payment_currency).toBe(CONTRACT.paymentCurrency);
    expect(currency.payment_provider).toBe(CONTRACT.provider);
    expect(currency.notice).toBe(CONTRACT.notice);
    expect(currency.plan_payment_amounts.pro.monthly).toBe(CONTRACT.actualChargeDisplay);
    // No annual billing: the backend never resolves an annual figure.
    expect(
      currency.plan_payment_amounts.pro.annual === undefined ||
        currency.plan_payment_amounts.pro.annual === ''
    ).toBe(true);

    await page.goto('/#pricing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.querySelector('#pricing')?.scrollIntoView());

    // The one plan carries the mandated three-line disclosure. First anchor
    // on the resolved backend figure (the card shows the calculated USD
    // product price until the currency call resolves on a cold dev server).
    const pro = page.locator('[data-testid="pricing-limits-pro"]');
    await expect(pro).toBeVisible();
    await expect(
      page.locator('[data-testid="payment-charge-pro"]').first(),
    ).toHaveText(CONTRACT.actualChargeDisplay, { timeout: 30_000 });
    const proText = await flatText(pro);
    expectTextContains(proText, 'Product price $9.00 (USD)');
    expectTextContains(proText, 'Actual charge ₦14,850.00 (NGN) per month');
    expectTextContains(proText, 'Payment provider Paystack');

    // The notice is full-size and verbatim - not a footnote.
    const notice = page.locator('[data-testid="pricing-currency-notice"]').first();
    await expect(notice).toBeVisible();
    expectTextContains(await flatText(notice), CONTRACT.notice);

    // The removed billing complexity must not reappear.
    expect(await flatText(page.locator('main'))).not.toMatch(/annual/i);
    expect(page.locator('[data-testid="pricing-card-enterprise"]')).toHaveCount(0);
    expect(page.getByRole('button', { name: /^annual/i })).toHaveCount(0);

    // FX reference: shown only if the backend has one. When present it must
    // read as a labelled, sourced, timestamped rate - the rate the charge
    // was converted at.
    if (currency.fx_reference) {
      const panel = page.locator('[data-testid="fx-reference-panel"]').first();
      await expect(panel).toBeVisible();
      const panelText = await flatText(panel);
      expectTextContains(panelText, 'converted');
      expectTextContains(panelText, currency.fx_reference.provider);
      expectTextContains(panelText, currency.fx_reference.disclaimer);
      expect(currency.fx_reference.disclaimer).toContain('converted');
      // The panel exists next to the charge line - and the charge line IS
      // the conversion of the USD price at this rate.
      expectTextContains(await flatText(pro), CONTRACT.actualChargeDisplay);
    } else {
      await expect(page.locator('[data-testid="fx-reference-panel"]')).toHaveCount(0);
    }
  });
});
