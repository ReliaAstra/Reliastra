/**
 * Payment currency — the single source of truth for the frontend.
 *
 * RELIASTRA prices products in USD (see `lib/dashboard/plans.ts`, which mirrors
 * the backend's `PLAN_PRICES_USD`). Paystack currently *charges* in Nigerian
 * Naira. Those are two different things and this module keeps them apart:
 * nothing here converts one currency into another, and no amount is computed
 * from an exchange rate — every payment figure is a string the backend
 * resolved from its published payment-price catalog.
 *
 * The disclosure paragraph below is the ONE canonical version in the web tier.
 * Components import it; they never restate it, so the pricing page, the upgrade
 * modal, the billing page and the pre-payment confirmation cannot drift.
 * `backend/tests/unit/test_transactional_email_footer.py` compares it
 * byte-for-byte against the backend copy used in transactional email.
 */

/**
 * A market reference rate, shown ONLY as context next to a real charge.
 *
 * It is display data from the backend (`app.core.fx_reference`): labelled an
 * estimate, attributed to a verifiable source and timestamped. It never
 * determines what is charged — the amount sent to Paystack comes from the
 * published payment-price catalog, and the frontend must not use this number
 * for anything a customer pays.
 */
export interface FxReference {
  available?: boolean;
  source_currency: string;
  payment_currency: string;
  /** Reference units of the payment currency per 1 product-currency unit. */
  rate: number;
  /** When the SOURCE says the quote was true (its own timestamp). */
  source_timestamp: string | null;
  /** When RELIASTRA read it, ISO-8601 UTC. */
  retrieved_at: string;
  provider: string;
  provider_url: string;
  source_url: string;
  /** Heading label, e.g. "Exchange rate reference (estimate — not the price you pay)". */
  label: string;
  /** Mandatory wording that the estimate is not the billing basis. */
  disclaimer: string;
}

export interface PaymentCurrencyInfo {
  /** Currency RELIASTRA's price list is denominated in (USD). */
  product_currency: string;
  /** ISO code Paystack actually charges, e.g. "NGN". */
  payment_currency: string;
  /** Plain-language name, e.g. "Nigerian Naira (NGN)". */
  payment_currency_name: string;
  /** Typographic symbol, e.g. "₦". Never used on its own to convey currency. */
  payment_symbol: string;
  /** True when the charged currency differs from the list-price currency. */
  differs_from_product_currency: boolean;
  /** Canonical disclosure. `null` when there is nothing to disclose. */
  notice: string | null;
  /** False when no payment price is published for the processing currency. */
  checkout_ready: boolean;
  /**
   * `plan -> interval -> formatted amount` for payment prices the business has
   * published. Empty means unpublished, in which case no amount may be shown:
   * the UI states the currency and stops, because deriving a figure client-side
   * is exactly the mis-billing this separation prevents.
   */
  plan_payment_amounts?: Record<string, Record<string, string>>;
  /** The processor that collects the money — part of the transparency triple. */
  payment_provider?: string;
  /** Longer form for payment-surface copy, e.g. "Paystack — secure hosted checkout". */
  payment_provider_display?: string;
  /**
   * Market reference estimate shown for context only. `null`/absent when
   * disabled or unavailable — surfaces then hide the reference entirely; a
   * fallback rate would be an invented one.
   */
  fx_reference?: FxReference | null;
}

/**
 * Canonical pre-payment disclosure (verbatim).
 *
 * Kept as a multi-line string concatenation on purpose: the backend drift
 * guard reads this exact expression.
 */
export const PAYMENT_CURRENCY_NOTICE =
  "RELIASTRA's plans are priced in USD. Our current Paystack payment flow " +
  'processes payments in NGN. We are working toward enabling USD payment ' +
  'options for our global customers.';

/** Fallback provider identity when the API has not answered yet. */
export const PAYMENT_PROVIDER = 'Paystack';
export const PAYMENT_PROVIDER_DISPLAY = 'Paystack — secure hosted checkout';

/**
 * Fallback used only for the *disclosure*, never for a price.
 *
 * The marketing page must not silently drop a legally meaningful notice
 * because a fetch failed, so the copy here mirrors `app/config.py` and
 * `app/core/payment_pricing.py`. What it deliberately does NOT claim:
 *
 * - `checkout_ready: false` — without the backend's answer we cannot know the
 *   Paystack account can price this plan, so no surface may present a live
 *   "continue to payment" action on the strength of this object.
 * - `plan_payment_amounts: {}` — amounts are business-published numbers; a
 *   stale or invented Naira figure is a mis-charge risk, so the UI shows the
 *   currency without a number until `/api/v1/billing/currency` answers.
 * - `fx_reference: null` — a missing estimate must not be replaced by an
 *   assumed rate. Absent means "do not show a reference", always.
 *
 * The notice itself is what a customer needs before deciding; the amount and
 * the CTA are what the API decides.
 */
export const DEFAULT_PAYMENT_CURRENCY: PaymentCurrencyInfo = {
  product_currency: 'USD',
  payment_currency: 'NGN',
  payment_currency_name: 'Nigerian Naira (NGN)',
  payment_symbol: '\u20a6',
  differs_from_product_currency: true,
  notice: PAYMENT_CURRENCY_NOTICE,
  checkout_ready: false,
  plan_payment_amounts: {},
  payment_provider: PAYMENT_PROVIDER,
  payment_provider_display: PAYMENT_PROVIDER_DISPLAY,
  fx_reference: null,
};

/**
 * Format a minor-unit amount as the backend does: symbol, grouped amount and
 * the ISO code in parentheses. The code is never omitted — a bare "\u20a6" is not
 * an accessible or unambiguous way to communicate currency.
 */
export function formatMinorUnits(minor: number | null | undefined, currency: string): string {
  if (minor == null) return '';
  const amount = (minor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${amount} (${currency})` : `${amount} ${currency}`;
}

const SYMBOLS: Record<string, string> = {
  NGN: '\u20a6',
  USD: '$',
  GHS: '\u20b5',
  ZAR: 'R',
  KES: 'KSh',
  EUR: '\u20ac',
  GBP: '\u00a3',
};

/**
 * Resolve the notice to show for a given currency config.
 *
 * `null` means "no disclosure applies" — i.e. the processing currency is the
 * same one the price list uses, so showing a Naira paragraph would itself be
 * misleading.
 */
export function currencyNotice(
  info: PaymentCurrencyInfo | null | undefined
): string | null {
  const config = info ?? DEFAULT_PAYMENT_CURRENCY;
  if (!config.differs_from_product_currency) return null;
  return config.notice ?? PAYMENT_CURRENCY_NOTICE;
}

/** "Nigerian Naira (NGN)" — always includes the code as words. */
export function currencyLabel(info: PaymentCurrencyInfo | null | undefined): string {
  const config = info ?? DEFAULT_PAYMENT_CURRENCY;
  return config.payment_currency_name || config.payment_currency;
}

export function isCheckoutReady(info: PaymentCurrencyInfo | null | undefined): boolean {
  return (info ?? DEFAULT_PAYMENT_CURRENCY).checkout_ready;
}

/**
 * The published payment amount for a plan/interval, as a ready-made string
 * from the backend (e.g. "\u20a660,000.00 (NGN)"). `null` when the business has
 * not published that price — callers must then omit the amount rather than
 * compute one.
 */
export function paymentAmountFor(
  info: PaymentCurrencyInfo | null | undefined,
  plan: string,
  interval: 'monthly' | 'annual' = 'monthly'
): string | null {
  const amounts = (info ?? DEFAULT_PAYMENT_CURRENCY).plan_payment_amounts;
  return amounts?.[plan]?.[interval] ?? null;
}

/** "Billed in Nigerian Naira (NGN)" — the short form used inside a card. */
export function billedInLabel(info: PaymentCurrencyInfo | null | undefined): string {
  return `Billed in ${currencyLabel(info)}`;
}

/** The processor's name as the customer should see it. */
export function paymentProviderName(info: PaymentCurrencyInfo | null | undefined): string {
  return (info ?? DEFAULT_PAYMENT_CURRENCY).payment_provider || PAYMENT_PROVIDER;
}

/** The longer provider line, e.g. for the checkout review panel. */
export function paymentProviderDisplay(
  info: PaymentCurrencyInfo | null | undefined
): string {
  return (info ?? DEFAULT_PAYMENT_CURRENCY).payment_provider_display || PAYMENT_PROVIDER_DISPLAY;
}

/**
 * The FX estimate to display beside prices, or `null`.
 *
 * Only surfaced when the currency actually differs and the backend returned a
 * fresh, sourced, timestamped payload. `null` hides the panel — there is no
 * default rate, and no component may substitute one.
 */
export function fxReference(
  info: PaymentCurrencyInfo | null | undefined
): FxReference | null {
  const config = info ?? DEFAULT_PAYMENT_CURRENCY;
  if (!config.differs_from_product_currency) return null;
  return usableFxReference(config.fx_reference);
}

/**
 * Is a reference safe to show?
 *
 * The validity test lives here, not in each surface: a panel that renders a
 * rate without checking it is a panel that can render `null`, `0` or a
 * half-parsed object, and a wrong exchange rate on a payment page is worse than
 * no rate at all. Surfaces that resolve an FX reference from somewhere other
 * than `PaymentCurrencyInfo` (the checkout quote does) must pass it through
 * this same gate.
 */
export function usableFxReference(fx: FxReference | null | undefined): FxReference | null {
  if (!fx || fx.available === false) return null;
  if (typeof fx.rate !== 'number' || !Number.isFinite(fx.rate) || fx.rate <= 0) return null;
  if (!fx.source_currency || !fx.payment_currency) return null;
  return fx;
}

/** "1 USD ≈ ₦1,650.00 NGN" style copy — explicitly an estimate. */
export function formatFxRate(fx: FxReference): string {
  const symbol = SYMBOLS[fx.payment_currency] ?? '';
  const amount = fx.rate.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `1 ${fx.source_currency} \u2248 ${symbol}${amount} (${fx.payment_currency})`;
}
