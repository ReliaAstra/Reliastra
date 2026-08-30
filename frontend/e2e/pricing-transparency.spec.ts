import { expect, test } from '@playwright/test';
import { CONTRACT, apiGet, flatText } from './helpers';

/**
 * Public pricing page: the transparency contract every customer sees before
 * paying. Runs against the live API, so figures are cross-checked between
 * what the backend publishes, what the Paystack catalog holds, and what the
 * DOM renders — and the FX reference (when configured) is proven to be a
 * labelled estimate that does NOT feed the charge.
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
  // ("…(NGN)per month") and CSS uppercases labels — we assert content, not
  // typography.
  const hay = text.toLowerCase().replace(/\s+/g, '');
  for (const needle of needles) {
    expect(hay).toContain(needle.toLowerCase().replace(/\s+/g, ''));
  }
}

test.describe('pricing transparency (public)', () => {
  test('Pro card shows the full transparency block, monthly and annual', async ({
    page,
    request,
  }) => {
    const currency = await apiGet<CurrencyInfo>(request, '/api/v1/billing/currency');

    // The backend itself is the contract: NGN prices are real, provider-
    // payable amounts, USD product prices are separate, and they differ —
    // ₦60,000.00 is not $39 converted at any nearby rate.
    expect(currency.product_currency).toBe(CONTRACT.productCurrency);
    expect(currency.payment_currency).toBe(CONTRACT.paymentCurrency);
    expect(currency.payment_provider).toBe(CONTRACT.provider);
    expect(currency.notice).toBe(CONTRACT.notice);
    expect(currency.plan_payment_amounts.pro.monthly).toBe(CONTRACT.actualChargeDisplay);
    expect(currency.plan_payment_amounts.pro.annual).toBe(CONTRACT.annualChargeDisplay);

    await page.goto('/#pricing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.querySelector('#pricing')?.scrollIntoView());

    // Every plan carries the mandated three-line disclosure. First anchor on
    // the resolved backend figure (the card renders a "pending" placeholder
    // for a beat while the currency call is in flight on a cold dev server).
    const pro = page.locator('[data-testid="pricing-card-pro"]');
    await expect(pro).toBeVisible();
    await expect(
      page.locator('[data-testid="payment-charge-pro"]').first(),
    ).toHaveText(CONTRACT.actualChargeDisplay, { timeout: 30_000 });
    const proText = await flatText(pro);
    expectTextContains(proText, 'Product price $39.00 (USD)');
    expectTextContains(proText, 'Actual charge ₦60,000.00 (NGN) per month');
    expectTextContains(proText, 'Payment provider Paystack');

    // The notice is full-size and verbatim — not a footnote. (The container
    // also holds the section heading + FX panel, so assert containment of
    // the exact sentence rather than string equality of the whole block.)
    const notice = page.locator('[data-testid="pricing-currency-notice"]').first();
    await expect(notice).toBeVisible();
    expectTextContains(await flatText(notice), CONTRACT.notice);

    // Annual: both figures update together; nothing stays silently monthly.
    await page.getByRole('button', { name: /^annual/i }).first().click();
    await expect(page.locator('[data-testid="payment-charge-pro"]').first()).toHaveText(
      CONTRACT.annualChargeDisplay,
      { timeout: 15_000 },
    );
    const annualText = await flatText(pro);
    expectTextContains(annualText, 'Product price $390.00 (USD)');
    expectTextContains(annualText, 'Actual charge ₦600,000.00 (NGN) per year');

    // Enterprise: contact-sales only, zero self-serve checkout figures.
    const ent = page.locator('[data-testid="pricing-card-enterprise"]');
    const entText = await flatText(ent);
    expectTextContains(entText, 'Custom pricing');
    expectTextContains(entText, 'Contact Sales');
    expect(entText).not.toMatch(/₦/);
    expect(entText).not.toMatch(/Actual charge/i);

    // Back to monthly — the toggle round-trips without residue.
    await page.getByRole('button', { name: /^monthly/i }).first().click();
    expectTextContains(await flatText(pro), 'per month');

    // FX reference: shown only if the backend has one. When present it must
    // read as a labelled, sourced, timestamped estimate — and the charge
    // must remain the published NGN price regardless of the rate value.
    if (currency.fx_reference) {
      const panel = page.locator('[data-testid="fx-reference-panel"]').first();
      await expect(panel).toBeVisible();
      const panelText = await flatText(panel);
      expectTextContains(panelText, 'estimate');
      expectTextContains(panelText, currency.fx_reference.provider, 'not the price you pay');
      expectTextContains(panelText, currency.fx_reference.disclaimer);
      expect(currency.fx_reference.disclaimer).toContain('never used to determine your actual charge');
      // The panel exists next to the charge line — and the charge line has
      // NOT moved to a converted figure.
      expectTextContains(await flatText(pro), CONTRACT.actualChargeDisplay);
    } else {
      await expect(page.locator('[data-testid="fx-reference-panel"]')).toHaveCount(0);
    }
  });
});
