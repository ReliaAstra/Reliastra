import { expect, test, type Page } from '@playwright/test';
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
  setPaystackOutcome,
  signIn,
} from './helpers';

/**
 * THE RELIASTRA checkout page.
 *
 * What this file is really asserting is a single property with many faces: the
 * number the customer reads, the number RELIASTRA asks Paystack to charge, the
 * number Paystack reports collecting, the number written into the payment
 * record and the number in the receipt email are ONE fact, arriving at each
 * surface from the backend. Every test below therefore looks at the page AND at
 * `/capture` — the stand-in's record of the upstream call — because a checkout
 * can display a perfect figure while requesting a different one.
 *
 * The failure states are held to the same standard as the success: each one
 * says whether money moved, what happens next, and never shows a provider error
 * string. That distinction (a cancellation vs. a payment we cannot yet confirm)
 * is what stops a customer paying twice.
 */

const PASSWORD = 'Checkout!2026';
const METHOD = 'checkout-method-international_card';

/** The popup the app opens, from the provider stand-in, with its three outcomes. */
function overlay(page: Page) {
  return page.locator('#reliastra-mock-paystack-overlay');
}

async function openCheckout(page: Page, interval: 'monthly' | 'annual' = 'monthly') {
  await page.goto(`/checkout?plan=pro&interval=${interval}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('[data-testid="checkout-review-plan"]')).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('the checkout page', () => {
  test.beforeEach(async ({ request }) => {
    await resetPaystackMock(request);
  });

  test('shows the USD price, the exact NGN charge, and explains the two', async ({
    page,
    request,
  }) => {
    const email = `e2e-checkout-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    // The plan the backend says this page is for — not a string the route made up.
    await expect(page.locator('[data-testid="checkout-review-plan"]')).toContainText(/RELIASTRA Pro/);

    // Both figures, labelled, and never merged into one.
    const charge = page.locator('[data-testid="checkout-charge-amount"]');
    await expect(charge).toHaveText(CONTRACT.actualChargeDisplay);
    // The review block restates the same figure one last time before the click.
    await expect(page.locator('[data-testid="checkout-review-amount"]').first()).toHaveText(
      CONTRACT.actualChargeDisplay,
    );
    await expect(page.getByText(CONTRACT.productAmountDisplay).first()).toBeVisible();

    // The disclosure, verbatim from the canonical copy.
    const notice = await flatText(page.locator('[data-testid="checkout-currency-notice"]'));
    expectTextContains(notice, CONTRACT.notice);
    expectTextContains(
      await flatText(page.locator('[data-testid="checkout-payment-currency"]')),
      'Nigerian Naira',
    );

    // Any rate shown is an estimate with a source, never the price.
    const fx = page.locator('[data-testid="fx-reference-panel"]');
    if (await fx.isVisible().catch(() => false)) {
      const fxText = await flatText(fx);
      expectTextContains(fxText, 'estimate', 'not the price you pay');
      expect(fxText).toMatch(/source|retrieved/i);
    }

    // Exactly one method, and no Nigerian-local rail anywhere on the page.
    await expect(page.locator(`[data-testid="${METHOD}"]`)).toBeVisible();
    const pageText = await flatText(page.locator('main'));
    for (const local of ['bank transfer', 'ussd', 'mobile money', 'qr code', 'eft']) {
      expect(pageText.toLowerCase()).not.toContain(local);
    }

    // The payer's own address, resolved server-side and shown for confirmation.
    await expect(page.locator('[data-testid="checkout-billing-email"]')).toContainText(email);

    // And the amount is the same one the backend will ask to charge.
    const init = await lastPaystackInit(request);
    expect(init, 'the checkout page must not have paid yet').toBeNull();

    await page.locator('[data-testid="checkout-interval-annual"]').click();
    await expect(page.locator('[data-testid="checkout-charge-amount"]')).toHaveText(
      CONTRACT.annualChargeDisplay,
      { timeout: 30_000 },
    );
    // Annual is a published price, never monthly x 12 computed here.
    await expect(page.getByText(CONTRACT.annualProductDisplay).first()).toBeVisible();
    await page.locator('[data-testid="checkout-interval-monthly"]').click();
    await expect(page.locator('[data-testid="checkout-charge-amount"]')).toHaveText(
      CONTRACT.actualChargeDisplay,
    );
  });

  test('paying charges what was shown, never touches card data, and activates on verification', async ({
    page,
    request,
  }) => {
    const email = `e2e-pay-${Date.now()}@reliastra.dev`;
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    const shown = await flatText(page.locator('[data-testid="checkout-charge-amount"]'));
    expectTextContains(shown, CONTRACT.actualChargeDisplay);

    // Nothing on this page is a card form, so nothing can post card data; assert
    // it on the wire rather than by reading the markup.
    const toReliastra: string[] = [];
    await page.route('**/api/v1/**', async (route) => {
      const method = route.request().method();
      if (method !== 'GET') toReliastra.push(route.request().postData() ?? '');
      await route.continue();
    });

    await page.locator('[data-testid="checkout-continue"]').click();

    // RELIASTRA opened the transaction and the customer completes it in the
    // provider's own experience — no card field is ever rendered by us.
    await expect(overlay(page)).toBeVisible({ timeout: 60_000 });
    expect(await page.locator('input[name*="card" i], input#card-number').count()).toBe(0);
    for (const body of toReliastra) {
      expect(body.toLowerCase()).not.toMatch(/"(card_number|cardnumber|cvc|cvv|exp_month|exp_year|pan|pin)"\s*:/);
    }

    const init = await lastPaystackInit(request);
    expect(init, 'no initialize reached the provider stand-in').not.toBeNull();
    expect(init!.amount).toBe(CONTRACT.paymentAmountMinor);
    expect(init!.currency).toBe(CONTRACT.paymentCurrency);
    expect(init!.amount).not.toBe(CONTRACT.productAmountMinor);
    // A plan code would silently replace our amount with whatever the plan says.
    expect(init!.plan ?? null).toBeNull();
    // The rails are the ones the page displayed.
    expect(init!.channels).toEqual(['card']);
    expect(init!.email).toBe(email);
    // Return flow is RELIASTRA's own checkout, so verification can run there.
    expect(init!.callback_url).toContain('/checkout');
    expect(init!.metadata).toMatchObject({
      currency: CONTRACT.paymentCurrency,
      amount_minor: String(CONTRACT.paymentAmountMinor),
      product_currency: CONTRACT.productCurrency,
      product_amount_minor: String(CONTRACT.productAmountMinor),
      billing_interval: 'monthly',
    });

    // Approving in the provider UI is NOT the moment the plan activates: our
    // confirmation appears only after the server-side verification answers.
    await overlay(page).locator('button[data-out="success"]').click();

    const done = page.locator('[data-testid="checkout-confirmation"]');
    await expect(done).toBeVisible({ timeout: 60_000 });
    const doneText = await flatText(done);
    expectTextContains(
      doneText,
      CONTRACT.actualChargeDisplay,
      CONTRACT.productAmountDisplay,
      'Paystack',
    );
    expect(doneText).toContain(init!.reference);
    // The URL carries the reference, so a reload re-verifies instead of re-paying.
    expect(page.url()).toContain(init!.reference);

    // Entitlement followed verification, not the popup callback.
    const planRes = await request.get('/api/v1/billing/plan', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-ID': organizationId },
    });
    expect(planRes.ok()).toBeTruthy();
    const plan = await planRes.json();
    expect(plan.plan).toBe('pro');
    expect(plan.billing_interval).toBe('monthly');

    // The persisted record — what the billing page and any future dispute read.
    const txRes = await request.get('/api/v1/billing/transactions', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-ID': organizationId },
    });
    const tx = (await txRes.json()).items.find(
      (t: { reference: string }) => t.reference === init!.reference,
    );
    expect(tx, 'payment not persisted').toBeTruthy();
    expect(tx.charged_amount_minor).toBe(CONTRACT.paymentAmountMinor);
    expect(tx.charged_currency).toBe(CONTRACT.paymentCurrency);
    expect(tx.product_amount_minor).toBe(CONTRACT.productAmountMinor);
    expect(tx.product_currency).toBe(CONTRACT.productCurrency);
    expect(tx.status).toBe('success');
    expect(tx.verified_at, 'server verification time must be recorded').toBeTruthy();
    expect(tx.billing_interval).toBe('monthly');
    expect(tx.duplicate).toBe(false);

    // Billing history in the product states the same figures.
    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    const row = page.locator(`[data-testid="transaction-row-${init!.reference}"]`);
    await expect(row).toBeVisible({ timeout: 60_000 });
    expectTextContains(await flatText(row), CONTRACT.actualChargeDisplay, CONTRACT.productAmountDisplay);

    // And the receipt email agrees with all of it.
    const mails = await request.get(`${process.env.E2E_MAIL_URL ?? 'http://127.0.0.1:8025'}/`);
    const { messages } = await mails.json();
    const receipt = (messages as { subject: string; to: string; raw: string }[]).find(
      (m) => /receipt/i.test(decodeMimeWords(m.subject)) && m.to.toLowerCase().includes(email),
    );
    expect(receipt, 'no receipt email for this payment').toBeTruthy();
    expectTextContains(
      decodeMailRaw(receipt!.raw),
      'Product price: $39.00 (USD)',
      'Actual charge: ₦60,000.00 (NGN)',
      'Payment provider: Paystack',
    );
  });

  test('a declined card says so, keeps the reviewed amount, and offers a clean retry', async ({
    page,
    request,
  }) => {
    const email = `e2e-decline-${Date.now()}@reliastra.dev`;
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(overlay(page)).toBeVisible({ timeout: 60_000 });
    await overlay(page).locator('button[data-out="decline"]').click();

    const failure = page.locator('[data-testid="checkout-failure"]');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    const text = await flatText(failure);
    expectTextContains(text, 'declined');
    // The promise that matters: nothing was taken, and the price did not move.
    expectTextContains(text, 'Nothing was charged');
    expectTextContains(text, CONTRACT.actualChargeDisplay);
    expect(text).not.toMatch(/issuing bank|declined by/i); // the provider's words, not ours
    await expect(failure.locator('[data-testid="checkout-retry"]')).toBeVisible();

    // Retrying returns to the same review, and the plan never changed.
    await failure.locator('[data-testid="checkout-retry"]').click();
    await expect(page.locator('[data-testid="checkout-review-plan"]')).toBeVisible();
    await expect(page.locator('[data-testid="checkout-charge-amount"]')).toHaveText(
      CONTRACT.actualChargeDisplay,
    );
    const planRes = await request.get('/api/v1/billing/plan', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-ID': organizationId },
    });
    expect((await planRes.json()).plan).toBe('free');
  });

  test('cancelling the payment window is a neutral state, not a failure', async ({ page }) => {
    const email = `e2e-cancel-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(overlay(page)).toBeVisible({ timeout: 60_000 });
    await overlay(page).locator('button[data-out="cancel"]').click();

    const failure = page.locator('[data-testid="checkout-failure"]');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    const text = await flatText(failure);
    expectTextContains(text, 'Payment cancelled', 'nothing was charged', 'Your plan is unchanged');
    // No alarm styling on a state that is nothing to worry about.
    await expect(page.locator('[data-testid="checkout-failure"][data-tone]')).toHaveAttribute(
      'data-tone',
      'neutral',
    );
  });

  test('a payment we cannot yet confirm is told as a wait, never as a retry', async ({
    page,
    request,
  }) => {
    const email = `e2e-pending-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(overlay(page)).toBeVisible({ timeout: 60_000 });
    const init = await lastPaystackInit(request);
    // Settle the payment at the provider but keep the popup from reporting it,
    // then let the customer reload: verification must find it and activate.
    await setPaystackOutcome(request, init!.reference, 'pending');
    await overlay(page).locator('button[data-out="cancel"]').click();

    await page.goto(`${page.url().split('?')[0]}?plan=pro&interval=monthly&reference=${init!.reference}`, {
      waitUntil: 'domcontentloaded',
    });
    // Pending is a state with words of its own: nothing to do but wait, and no
    // second charge invited.
    const failure = page.locator('[data-testid="checkout-failure"]');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    const text = await flatText(failure);
    expectTextContains(text, 'processing');
    // "Try again" would invite a second charge for a period money already covers;
    // a wait gets a refresh, and that is the only action offered. (The standing
    // support footnote legitimately says "do not try again", so the check belongs
    // on the controls, not on the prose.)
    await expect(failure.locator('[data-testid="checkout-retry"]')).toHaveCount(0);
    const actions = (await failure.locator('button').allInnerTexts()).join(' ');
    expect(actions).toMatch(/refresh/i);
    expect(actions).not.toMatch(/try again|pay again/i);

    // When it clears, the same reference activates the plan — no re-payment.
    await setPaystackOutcome(request, init!.reference, 'success');
    await failure.locator('[data-testid="checkout-refresh"]').click();
    await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
      timeout: 60_000,
    });
  });

  test('a reference that is not ours is reported honestly', async ({ page }) => {
    const email = `e2e-ghost-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await page.goto('/checkout?plan=pro&reference=ref_that_does_not_exist', {
      waitUntil: 'domcontentloaded',
    });
    const failure = page.locator('[data-testid="checkout-failure"]');
    await expect(failure).toBeVisible({ timeout: 60_000 });
    const text = await flatText(failure);
    expectTextContains(text, 'cannot find that payment');
    expect(text).not.toMatch(/404|not found"|status_code|Traceback/);
  });

  test('a signed-out visitor keeps their place in line', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/checkout?plan=pro&interval=annual', { waitUntil: 'domcontentloaded' });
    const prompt = page.locator('[data-testid="checkout-signed-out"]');
    await expect(prompt).toBeVisible({ timeout: 60_000 });
    const link = prompt.getByRole('link', { name: /sign in/i });
    await expect(link).toBeVisible();
    // The intent survives the round trip — including the interval, which is a
    // different price.
    const next = new URL((await link.getAttribute('href'))!, page.url()).searchParams.get('next');
    expect(next).toContain('/checkout');
    expect(next).toContain('interval=annual');
    expectTextContains(await flatText(prompt), 'Nothing has been charged');
  });

  test('a second payment for a covered period is recorded and stated', async ({
    page,
    request,
  }) => {
    const email = `e2e-twice-${Date.now()}@reliastra.dev`;
    const { accessToken, organizationId } = await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    for (const _ of [0, 1]) {
      await page.locator('[data-testid="checkout-continue"]').click();
      await expect(overlay(page)).toBeVisible({ timeout: 60_000 });
      await overlay(page).locator('button[data-out="success"]').click();
      await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
        timeout: 60_000,
      });
      if (_ === 0) {
        // Come back to the review step to pay a second time, deliberately.
        await page.goto('/checkout?plan=pro&interval=monthly', {
          waitUntil: 'domcontentloaded',
        });
        await expect(page.locator('[data-testid="checkout-review-plan"]')).toBeVisible({
          timeout: 60_000,
        });
      }
    }

    const txRes = await request.get('/api/v1/billing/transactions', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-ID': organizationId },
    });
    const items = (await txRes.json()).items as { duplicate: boolean; status: string }[];
    const paid = items.filter((t) => t.status === 'success');
    expect(paid.length).toBeGreaterThanOrEqual(2);
    expect(paid.filter((t) => t.duplicate).length, 'the extra payment must be flagged').toBe(1);

    // And the page says so, rather than quietly double-applying.
    expectTextContains(
      await flatText(page.locator('[data-testid="checkout-confirmation"]')),
      'second payment',
    );
  });

  test('the popup is loaded from the configured provider, never a hardcoded one', async ({
    page,
    request,
  }) => {
    /**
     * A harness assertion, but not a throwaway one: it proves the app asks the
     * *backend* where the provider library lives. If a deployment points Paystack
     * somewhere else and the page still reached js.paystack.co, every other test
     * in this file would be asserting the behaviour of a script the product never
     * configured — and in production the reverse would mean the checkout silently
     * depends on a domain an operator has no control over.
     */
    const seen: string[] = [];
    page.on('request', (req) => {
      if (/inline\.js|paystack/i.test(req.url())) seen.push(req.url());
    });
    const email = `e2e-harness-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);
    await page.locator('[data-testid="checkout-continue"]').click();
    await expect(overlay(page)).toBeVisible({ timeout: 60_000 });

    const fromStandIn = seen.filter((url) => url.startsWith(PAYSTACK_MOCK));
    expect(fromStandIn.length, `provider script was not loaded from ${PAYSTACK_MOCK}`).toBeGreaterThan(0);
    for (const url of seen) {
      expect(url).not.toMatch(/js\.paystack\.co/);
    }
    // The page defined the object our launcher calls, from that script.
    expect(await page.evaluate(() => typeof (window as never as { PaystackPop?: unknown }).PaystackPop))
      .toBe('function');
    const capture = await request.get(`${PAYSTACK_MOCK}/capture/all`);
    expect(capture.ok(), 'Paystack stand-in is not reachable').toBeTruthy();
  });
});

test.describe('checkout on a small screen', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('320px: everything the customer needs, nothing clipped', async ({ page, request }) => {
    await resetPaystackMock(request);
    const email = `e2e-mobile-${Date.now()}@reliastra.dev`;
    await createAccount(page, email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await openCheckout(page);

    // No horizontal overflow at the narrowest supported width.
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);

    // The two figures and the CTA are on the first screen or one scroll away.
    for (const testid of [
      'checkout-charge-amount',
      'checkout-currency-notice',
      METHOD,
      'checkout-continue',
      'checkout-billing-email',
    ]) {
      const loc = page.locator(`[data-testid="${testid}"]`).first();
      await expect(loc, `${testid} missing at 320px`).toBeVisible();
      const box = await loc.boundingBox();
      expect(box, `${testid} has no box`).not.toBeNull();
      expect(box!.width, `${testid} overflows the viewport`).toBeLessThanOrEqual(320);
    }

    // Touch targets are tappable, not decorative links.
    const cta = page.locator('[data-testid="checkout-continue"]');
    const ctaBox = (await cta.boundingBox())!;
    expect(ctaBox.height).toBeGreaterThanOrEqual(44);

    // And paying works at this width too.
    await cta.click();
    await expect(overlay(page)).toBeVisible({ timeout: 60_000 });
    const approve = overlay(page).locator('button[data-out="success"]');
    const approveBox = (await approve.boundingBox())!;
    expect(approveBox.height).toBeGreaterThanOrEqual(40);
    await approve.click();
    await expect(page.locator('[data-testid="checkout-confirmation"]')).toBeVisible({
      timeout: 60_000,
    });
    const init = await lastPaystackInit(request);
    expect(init!.amount).toBe(CONTRACT.paymentAmountMinor);
  });
});
