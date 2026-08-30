'use client';

import type { CheckoutQuote } from '@/lib/dashboard/api';
import { FxReferencePanel } from '@/components/billing/PaymentCurrencyNotice';
import { cn } from '@/lib/utils';

/**
 * What the customer is buying, what it costs, and what will actually leave
 * their account — on one screen, before anything happens.
 *
 * Three rules this component obeys, because the whole checkout is built on them:
 *
 * 1. **Every figure is a string from the backend.** `₦60,000.00 (NGN)` is
 *    rendered exactly as the resolver that prices the Paystack transaction
 *    formatted it. There is no currency table, no multiplier and no `*`
 *    footnote computed here: an amount a browser composes is an amount a
 *    browser can get wrong, and on a payment page "wrong" means mis-billed.
 * 2. **The interval control changes the question, not the answer.** Switching
 *    to annual refetches the quote from the backend, which returns a different
 *    published price. The component never computes an annual figure from a
 *    monthly one.
 * 3. **The USD price and the NGN charge are both shown, and both labelled.**
 *    Nothing about this checkout is allowed to be a surprise discovered after a
 *    click.
 */
export function OrderSummary({
  quote,
  interval,
  onIntervalChange,
}: {
  quote: CheckoutQuote;
  interval: 'monthly' | 'annual';
  onIntervalChange: (next: 'monthly' | 'annual') => void;
}) {
  const periodWord = quote.period_word ?? (interval === 'annual' ? 'year' : 'month');

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="checkout-order-heading"
        className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rs-text-tertiary">
              Your plan
            </p>
            <h2
              id="checkout-order-heading"
              className="mt-1.5 text-xl font-semibold tracking-tight text-rs-text sm:text-2xl"
            >
              RELIASTRA {quote.display_plan}
            </h2>
            {quote.description ? (
              <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-rs-text-secondary">
                {quote.description}
              </p>
            ) : null}
          </div>

          <IntervalToggle interval={interval} onChange={onIntervalChange} />
        </div>

        {/* The two prices, side by side and equal in weight — because to the
            customer they are equally true. Presenting the charged amount small
            and grey, or only inside the provider, is the pattern this checkout
            exists to avoid. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <PriceCard
            label="RELIASTRA price"
            value={quote.product_price_display ?? '—'}
            sub={`Billed per ${periodWord} in ${quote.product_currency}`}
          />
          <PriceCard
            label="Amount charged today"
            value={quote.payment_amount_display ?? 'To be confirmed'}
            sub={`Sent to ${quote.payment_provider} in ${quote.payment_currency_name}`}
            accent
            dataTestId="checkout-charge-amount"
          />
        </div>

        {quote.billing_email ? (
          <dl className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-rs-border-subtle pt-4 text-[13px]">
            <dt className="text-rs-text-tertiary">Receipt and account</dt>
            <dd className="font-medium text-rs-text" data-testid="checkout-billing-email">
              {quote.billing_email}
            </dd>
            {quote.organization_name ? (
              <>
                <span className="text-rs-text-tertiary" aria-hidden="true">
                  ·
                </span>
                <dd className="text-rs-text-secondary">{quote.organization_name}</dd>
              </>
            ) : null}
          </dl>
        ) : null}

        {quote.trial_note ? (
          <p className="mt-4 rounded-lg bg-rs-brand-subtle px-3 py-2 text-[12px] leading-relaxed text-rs-text-secondary">
            {quote.trial_note}
          </p>
        ) : null}
      </section>

      <CurrencyExplanation quote={quote} />
    </div>
  );
}

/**
 * The currency explanation, shown before payment rather than discovered after.
 *
 * The wording is not authored here: `currency_notice` is the canonical
 * disclosure the backend also uses in receipts and confirmation email, so the
 * sentence on this screen and the sentence in the customer's inbox are the same
 * object. If the backend ever has nothing to disclose (charging in the price
 * list's own currency) the section is omitted entirely rather than replaced with
 * a generic reassurance.
 */
function CurrencyExplanation({ quote }: { quote: CheckoutQuote }) {
  const fx = quote.fx_reference;
  if (!quote.currency_notice && !fx) return null;

  return (
    <section
      aria-labelledby="checkout-currency-heading"
      className="rounded-2xl border border-rs-border-subtle bg-rs-elevated p-5 sm:p-6"
    >
      <h3
        id="checkout-currency-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rs-text-tertiary"
      >
        Why you are charged in {quote.payment_currency}
      </h3>
      {quote.currency_notice ? (
        <p
          className="mt-2.5 text-[13px] leading-relaxed text-rs-text-secondary"
          data-testid="checkout-currency-notice"
        >
          {quote.currency_notice}
        </p>
      ) : null}
      <dl className="mt-4 grid gap-2 text-[13px] sm:grid-cols-[150px_minmax(0,1fr)]">
        <FieldLabel>Price list currency</FieldLabel>
        <FieldValue>{quote.product_currency}</FieldValue>
        <FieldLabel>Payment currency</FieldLabel>
        <FieldValue data-testid="checkout-payment-currency">
          {quote.payment_currency_name}
        </FieldValue>
        <FieldLabel>Collected by</FieldLabel>
        <FieldValue>{quote.payment_provider_display ?? quote.payment_provider}</FieldValue>
      </dl>
      <FxReferencePanel className="mt-4" fx={fx} />
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-rs-text-tertiary">
      {children}
    </dt>
  );
}

function FieldValue({
  children,
  ...rest
}: {
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <dd className="font-medium text-rs-text" {...rest}>
      {children}
    </dd>
  );
}

/**
 * Monthly / annual.
 *
 * A real radio group rather than two buttons: the choice changes what is
 * charged, so it is a form control with keyboard semantics, and its label says
 * what selecting it does ("billed yearly") instead of relying on colour.
 */
function IntervalToggle({
  interval,
  onChange,
}: {
  interval: 'monthly' | 'annual';
  onChange: (next: 'monthly' | 'annual') => void;
}) {
  const options: { id: 'monthly' | 'annual'; label: string; hint: string }[] = [
    { id: 'monthly', label: 'Monthly', hint: 'billed every month' },
    { id: 'annual', label: 'Annual', hint: 'billed once a year' },
  ];

  return (
    <fieldset className="shrink-0">
      <legend className="sr-only">Billing interval</legend>
      <div
        role="radiogroup"
        aria-label="Billing interval"
        className="inline-flex rounded-xl border border-rs-border-subtle bg-rs-base p-1"
      >
        {options.map((option) => {
          const active = option.id === interval;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={option.hint}
              onClick={() => onChange(option.id)}
              className={cn(
                'min-h-10 rounded-lg px-3.5 text-[13px] font-medium transition-colors sm:px-4',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-brand',
                active
                  ? 'bg-rs-elevated text-rs-text shadow-[0_1px_2px_rgba(11,18,32,0.06)]'
                  : 'text-rs-text-tertiary hover:text-rs-text-secondary'
              )}
              data-testid={`checkout-interval-${option.id}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PriceCard({
  label,
  value,
  sub,
  accent,
  dataTestId,
  ...rest
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  /**
   * Test hook, applied as the DOM attribute React actually understands. It has to
   * be destructured rather than left in ``...rest``: ``dataTestId`` spread onto an
   * element is dropped with a warning, which would leave the hook looking present
   * in source while the page quietly lacked it.
   */
  dataTestId?: string;
  [key: string]: unknown;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3.5',
        accent
          ? 'border-rs-brand/25 bg-rs-brand-subtle'
          : 'border-rs-border-subtle bg-rs-base'
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rs-text-tertiary">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 font-mono text-[19px] font-semibold leading-tight tracking-tight text-rs-text sm:text-[21px]',
          // Tabular figures so a long Naira amount does not jitter between
          // renders or look misaligned against the USD line beside it.
          'tabular-nums'
        )}
        {...rest}
        data-testid={dataTestId}
      >
        {value}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-rs-text-tertiary">{sub}</p>
    </div>
  );
}
