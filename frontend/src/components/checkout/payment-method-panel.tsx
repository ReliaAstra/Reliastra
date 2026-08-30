'use client';

import { Check, Loader2, Lock, ShieldCheck } from 'lucide-react';

import type { CheckoutQuote } from '@/lib/dashboard/api';
import type { CheckoutPhase } from './checkout-experience';
import { TrustMarks } from './trust-marks';
import { cn } from '@/lib/utils';

/**
 * The last RELIASTRA screen before money moves.
 *
 * Its job is that nothing after it is unexpected: the exact charge, the
 * currency, the method, the provider and the interval are restated in the
 * customer's own terms, and the button says what clicking it does — opens
 * Paystack's secure payment experience — instead of implying the payment is
 * finished here.
 *
 * Methods are rendered from `quote.payment_methods`, which the backend derives
 * from its channel policy. This panel has no list of methods of its own and no
 * "more options" affordance: a global customer is shown international card,
 * because that is the rail Paystack supports everywhere and the only one this
 * transaction is opened with. A Nigerian-only method (USSD, Pay with Bank, QR)
 * cannot appear here by editing a component — it would have to be enabled in the
 * backend policy first, and that change is deliberate and per-currency.
 */
export function PaymentMethodPanel({
  quote,
  phase,
  handingOff,
  session,
  onContinue,
}: {
  quote: CheckoutQuote;
  phase: CheckoutPhase;
  handingOff: boolean;
  session: { reference?: string; amount_display?: string | null } | null;
  onContinue: () => void;
}) {
  const methods = quote.payment_methods ?? [];
  const busy = phase === 'preparing' || phase === 'verifying';
  const paying = phase === 'paying';
  const blocked = !quote.checkout_enabled || methods.length === 0;

  const ctaLabel =
    phase === 'preparing'
      ? 'Starting secure payment…'
      : paying
        ? 'Complete payment in the secure window'
        : handingOff
          ? 'Returning to RELIASTRA…'
          : phase === 'verifying'
            ? 'Confirming your payment…'
            : 'Continue to secure payment';

  return (
    <aside
      aria-label="Payment"
      className="lg:sticky lg:top-8 lg:self-start"
    >
      <div className="overflow-hidden rounded-2xl border border-rs-border-subtle bg-rs-elevated">
        <div className="border-b border-rs-border-subtle px-5 py-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rs-text-tertiary">
            Payment method
          </h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <ul className="space-y-2.5" role="radiogroup" aria-label="Payment method">
            {methods.map((method) => (
              <li key={method.id}>
                <MethodOption method={method} selected />
              </li>
            ))}
            {methods.length === 0 ? (
              <li className="rounded-xl border border-dashed border-rs-border px-4 py-6 text-center text-[13px] text-rs-text-tertiary">
                No payment method is currently available for this plan.
              </li>
            ) : null}
          </ul>

          {/* Final review — the promise restated one last time, in the same
              words the backend used everywhere else on this flow. */}
          <div className="rounded-xl border border-rs-border-subtle bg-rs-base px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rs-text-tertiary">
              You are paying
            </p>
            <dl className="mt-2.5 space-y-1.5 text-[13px]">
              <ReviewRow
                label="Plan"
                value={`RELIASTRA ${quote.display_plan}`}
                dataTestId="checkout-review-plan"
              />
              <ReviewRow
                label="Billing"
                value={
                  quote.billing_interval === 'annual' ? 'Annual (12 months)' : 'Monthly'
                }
              />
              <ReviewRow
                label="Commercial price"
                value={quote.product_price_display ?? '—'}
              />
              <ReviewRow
                label="Payment currency"
                value={quote.payment_currency_name}
              />
              <ReviewRow
                label="Amount to be charged"
                value={quote.payment_amount_display ?? '—'}
                strong
                dataTestId="checkout-review-amount"
              />
              <ReviewRow
                label="Payment provider"
                value={quote.payment_provider_display ?? quote.payment_provider}
              />
            </dl>
          </div>

          <button
            type="button"
            onClick={onContinue}
            disabled={busy || paying || blocked}
            className={cn(
              'group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5',
              'text-[14px] font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-brand focus-visible:ring-offset-2 focus-visible:ring-offset-rs-elevated',
              'disabled:cursor-not-allowed',
              blocked
                ? 'border border-rs-border-subtle bg-rs-base text-rs-text-tertiary'
                : 'bg-rs-brand text-white hover:bg-rs-brand-hover active:scale-[0.995] disabled:opacity-80'
            )}
            data-testid="checkout-continue"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Lock size={15} aria-hidden="true" className="opacity-90" />
            )}
            <span>{ctaLabel}</span>
            {/* The figure rides on the button itself: the last thing a customer
                reads before paying should be what they are paying. */}
            {!busy && !paying && quote.payment_amount_display ? (
              <span className="font-mono text-[13px] font-medium opacity-90 tabular-nums">
                · {quote.payment_amount_display}
              </span>
            ) : null}
          </button>

          {session?.reference ? (
            <p className="text-center text-[11px] leading-relaxed text-rs-text-tertiary">
              Reference <span className="font-mono">{session.reference}</span>
            </p>
          ) : null}

          {paying || handingOff ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-lg bg-rs-brand-subtle px-3 py-2 text-center text-[12px] leading-relaxed text-rs-text-secondary"
            >
              {handingOff
                ? 'Opening the secure payment page. We will confirm your plan the moment you are back.'
                : 'A secure Paystack window is open. Finish your card details there — RELIASTRA never sees them.'}
            </p>
          ) : null}

          {quote.already_subscribed ? (
            <p className="rounded-lg border border-rs-border-subtle px-3 py-2 text-[12px] leading-relaxed text-rs-text-secondary">
              This workspace is already subscribed to RELIASTRA {quote.display_plan} on{' '}
              {quote.billing_interval === 'annual' ? 'annual' : 'monthly'} billing. Paying again
              would add a second charge for a covered period.
            </p>
          ) : null}
        </div>

        <TrustMarks />
      </div>
    </aside>
  );
}

/**
 * One payment method, as a selected radio.
 *
 * It is rendered as selected-and-disabled rather than a bare label because the
 * customer *is* choosing: the affordance acknowledges the choice they made and
 * shows what is available, which is what a clean single-option checkout needs to
 * feel considered instead of limited.
 */
function MethodOption({
  method,
  selected,
}: {
  method: CheckoutQuote['payment_methods'][number];
  selected: boolean;
}) {
  const networks = method.networks ?? [];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3.5 transition-colors',
        selected
          ? 'border-rs-brand/40 bg-rs-brand-subtle'
          : 'border-rs-border-subtle bg-rs-elevated'
      )}
      role="radio"
      aria-checked={selected}
      aria-disabled="true"
      data-testid={`checkout-method-${method.id}`}
    >
      <span
        className={cn(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-rs-brand bg-rs-brand text-white' : 'border-rs-border'
        )}
        aria-hidden="true"
      >
        {selected ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[14px] font-semibold text-rs-text">{method.label}</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rs-text-tertiary">
            <ShieldCheck size={11} aria-hidden="true" />
            Secured by {method.provider ?? 'Paystack'}
          </span>
        </div>
        {networks.length ? (
          <p className="mt-1 font-mono text-[11.5px] tracking-tight text-rs-text-secondary">
            {networks.join('  ·  ')}
          </p>
        ) : null}
        {method.description ? (
          <p className="mt-1.5 text-[12px] leading-relaxed text-rs-text-tertiary">
            {method.description}
          </p>
        ) : null}
        {method.supports_international === false && method.markets?.length ? (
          // A locally-enabled rail (a future GHS mobile-money deployment) is
          // labelled with where it works rather than presented as universal.
          <p className="mt-1.5 text-[11.5px] text-rs-text-tertiary">
            Available for payments from {method.markets.join(', ')}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  strong,
  dataTestId,
  ...rest
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** See ``PriceCard``: the hook is applied as ``data-testid`` on purpose. */
  dataTestId?: string;
  [key: string]: unknown;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-rs-text-tertiary">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-right break-words',
          strong
            ? 'font-mono text-[14px] font-semibold text-rs-text tabular-nums'
            : 'font-medium text-rs-text'
        )}
        {...rest}
        data-testid={dataTestId}
      >
        {value}
      </dd>
    </div>
  );
}
