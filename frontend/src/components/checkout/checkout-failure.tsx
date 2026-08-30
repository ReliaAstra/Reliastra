'use client';

import Link from 'next/link';
import { CircleAlert, CircleCheck, LifeBuoy, RotateCcw } from 'lucide-react';

import type { CheckoutQuote } from '@/lib/dashboard/api';
import type { CheckoutFailureCopy } from '@/lib/billing/checkout-errors';
import { cn } from '@/lib/utils';

/**
 * Every non-success terminal state, in one component.
 *
 * A payment failure has two facts a customer needs immediately and usually
 * cannot infer: whether money moved, and what to do next. So this screen always
 * states both — the wording comes from `checkout-errors` keyed by the backend's
 * reason slug — and never shows a provider's raw message. "Amount must be
 * greater than 100" is not an explanation of anything to a buyer; "your card was
 * declined, nothing was charged, try another card" is.
 *
 * The tone is restrained on purpose. A declined card is an ordinary event with a
 * clear remedy, and dressing it in alarm converts a retry into a support ticket.
 */
export function CheckoutFailure({
  failure,
  quote,
  session,
  onRetry,
  onRefresh,
}: {
  failure: CheckoutFailureCopy;
  quote: CheckoutQuote | null;
  session: { reference?: string } | null;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const tone = failure.tone ?? 'problem';
  return (
    <section
      aria-labelledby="checkout-failure-heading"
      aria-live="polite"
      className="mx-auto max-w-[620px]"
      data-testid="checkout-failure"
      data-tone={tone}
    >
      <div className="overflow-hidden rounded-2xl border border-rs-border-subtle bg-rs-elevated">
        <div className="flex items-start gap-3.5 px-5 py-5 sm:px-6 sm:py-6">
          <span
            className={cn(
              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              tone === 'neutral' && 'bg-rs-brand-subtle text-rs-brand',
              tone === 'attention' && 'bg-rs-degraded-bg text-rs-degraded',
              tone === 'problem' && 'bg-rs-down-bg text-rs-down'
            )}
            aria-hidden="true"
          >
            {tone === 'neutral' ? (
              <CircleCheck size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="checkout-failure-heading"
              className="text-[17px] font-semibold tracking-tight text-rs-text sm:text-[19px]"
            >
              {failure.title}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-rs-text-secondary">
              {failure.body}
            </p>
            <p className="mt-3 rounded-lg bg-rs-base px-3.5 py-2.5 text-[13px] leading-relaxed font-medium text-rs-text">
              {failure.action}
            </p>

            {quote?.payment_amount_display ? (
              <dl className="mt-4 grid gap-1.5 border-t border-rs-border-subtle pt-4 text-[12.5px] sm:grid-cols-[132px_minmax(0,1fr)]">
                <Row label="Plan" value={`RELIASTRA ${quote.display_plan}`} />
                <Row label="Was to be charged" value={quote.payment_amount_display} />
                <Row
                  label="Payment currency"
                  value={quote.payment_currency_name}
                />
                {session?.reference ? (
                  <Row label="Reference" value={session.reference} mono />
                ) : null}
              </dl>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {failure.retry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rs-brand px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-rs-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-brand focus-visible:ring-offset-2 focus-visible:ring-offset-rs-elevated"
                  data-testid="checkout-retry"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Try again
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRefresh}
                  data-testid="checkout-refresh"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rs-border px-4 text-[13.5px] font-semibold text-rs-text transition-colors hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-brand"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Refresh
                </button>
              )}
              <Link
                href="/settings/billing"
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[13.5px] font-medium text-rs-text-secondary transition-colors hover:text-rs-text"
              >
                View billing
              </Link>
              {failure.support ? (
                <a
                  href="mailto:billing@reliastra.com"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-[13.5px] font-medium text-rs-text-secondary transition-colors hover:text-rs-text sm:ml-auto"
                >
                  <LifeBuoy size={15} aria-hidden="true" />
                  Contact billing
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[11.5px] leading-relaxed text-rs-text-tertiary">
        If you believe this payment succeeded, do not try again — we match every
        charge automatically. Email{' '}
        <a
          href="mailto:billing@reliastra.com"
          className="font-medium text-rs-text-secondary underline underline-offset-2"
        >
          billing@reliastra.com
        </a>{' '}
        and we will resolve it.
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-rs-text-tertiary">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words text-right font-medium text-rs-text',
          mono && 'font-mono text-[12px]'
        )}
      >
        {value}
      </dd>
    </>
  );
}
