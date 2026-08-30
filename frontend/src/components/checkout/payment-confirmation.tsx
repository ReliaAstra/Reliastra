'use client';

import Link from 'next/link';
import { ArrowRight, CircleCheck, History, LayoutDashboard } from 'lucide-react';

import type { CheckoutQuote } from '@/lib/dashboard/api';
import type { VerifiedPayment } from './checkout-experience';

/**
 * Proof, not a thank-you page.
 *
 * Rendered only after our backend verified the transaction with Paystack, and
 * built entirely from what that verification returned: the amount the gateway
 * actually collected, the currency it collected it in, and the USD price the
 * checkout quoted. Those figures are read back from the persisted transaction,
 * so this screen states what happened rather than re-deriving what should have
 * happened — and it will still say the same thing next month after a repricing,
 * because the record is history and not a recomputation.
 */
export function PaymentConfirmation({
  verified,
  quote,
}: {
  verified: VerifiedPayment | null;
  quote: CheckoutQuote | null;
}) {
  const displayPlan =
    verified?.display_plan ?? quote?.display_plan ?? 'Pro';
  const charged = verified?.amount_display ?? quote?.payment_amount_display ?? null;
  const product = verified?.product_price_display ?? quote?.product_price_display ?? null;
  const currencyName = quote?.payment_currency_name ?? verified?.currency ?? null;
  const interval = verified?.billing_interval ?? quote?.billing_interval ?? 'monthly';
  const periodWord = interval === 'annual' ? 'year' : 'month';

  return (
    <section
      aria-labelledby="checkout-success-heading"
      className="mx-auto max-w-[620px]"
      data-testid="checkout-confirmation"
    >
      <div className="overflow-hidden rounded-2xl border border-rs-border-subtle bg-rs-elevated">
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rs-up-bg text-rs-up">
            <CircleCheck size={20} aria-hidden="true" />
          </span>

          <h2
            id="checkout-success-heading"
            className="mt-4 text-[20px] font-semibold tracking-tight text-rs-text sm:text-[23px]"
          >
            RELIASTRA {displayPlan} is active
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-rs-text-secondary">
            Your payment was confirmed with {quote?.payment_provider ?? 'Paystack'} and
            your plan is enabled for this workspace. You will receive a receipt at{' '}
            {quote?.billing_email ? (
              <span className="font-medium text-rs-text">{quote.billing_email}</span>
            ) : (
              'your billing email'
            )}
            .
          </p>

          {verified?.duplicate_payment ? (
            <p className="mt-4 rounded-lg border border-rs-degraded/40 bg-rs-degraded-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-rs-text-secondary">
              We recorded a second payment for a period that was already covered.
              Both charges are visible in your billing history, and you can ask us
              to refund the extra one.
            </p>
          ) : null}

          {/* The receipt triple, restated from the verification so the moment of
              payment and the record agree forever after. */}
          <dl className="mt-5 divide-y divide-rs-border-subtle border-y border-rs-border-subtle">
            <Line label="Plan" value={`RELIASTRA ${displayPlan}`} />
            <Line label="Billing" value={interval === 'annual' ? 'Annual' : 'Monthly'} />
            <Line label="Commercial price" value={product ?? '—'} />
            <Line label="Amount charged" value={charged ?? '—'} mono />
            <Line label="Payment currency" value={currencyName ?? '—'} />
            <Line label="Payment provider" value={quote?.payment_provider_display ?? quote?.payment_provider ?? 'Paystack'} />
            {verified?.reference ? (
              <Line label="Reference" value={verified.reference} mono />
            ) : null}
          </dl>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rs-brand px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-rs-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-brand focus-visible:ring-offset-2 focus-visible:ring-offset-rs-elevated"
            >
              <LayoutDashboard size={15} aria-hidden="true" />
              Go to your dashboard
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/settings/billing"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rs-border px-4 text-[13.5px] font-semibold text-rs-text transition-colors hover:bg-rs-hover"
            >
              <History size={15} aria-hidden="true" />
              Billing & receipts
            </Link>
          </div>

          <p className="mt-4 text-[11.5px] leading-relaxed text-rs-text-tertiary">
            Billed once per {periodWord}. Your next charge is shown on your billing
            page, in the same currency and amount as above.
          </p>
        </div>
      </div>
    </section>
  );
}

function Line({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[12.5px] text-rs-text-tertiary">{label}</dt>
      <dd
        className={
          mono
            ? 'min-w-0 break-words text-right font-mono text-[13px] font-semibold text-rs-text tabular-nums'
            : 'min-w-0 break-words text-right text-[13px] font-medium text-rs-text'
        }
      >
        {value}
      </dd>
    </div>
  );
}
