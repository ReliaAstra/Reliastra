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
}

/**
 * Canonical pre-payment disclosure (verbatim).
 *
 * Kept as a multi-line string concatenation on purpose: the backend drift
 * guard reads this exact expression.
 */
export const PAYMENT_CURRENCY_NOTICE =
  'Please note that all transactions are currently processed in Nigerian Naira ' +
  '(NGN). We are actively working towards enabling payments in US Dollars (USD) ' +
  'to better serve our global user base. However, due to ongoing legal and ' +
  'regulatory compliance requirements, this transition has been temporarily ' +
  'delayed. We appreciate your patience and understanding as we work diligently ' +
  'to resolve this matter.';

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
