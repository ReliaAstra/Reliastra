'use client';

import Link from 'next/link';
import { CircleDashed, LifeBuoy } from 'lucide-react';

import type { CheckoutQuote } from '@/lib/dashboard/api';

/**
 * Checkout exists but cannot be offered for this plan right now.
 *
 * The honest alternative to a button that will fail. RELIASTRA does not price a
 * plan it has not published in the payment currency, and it does not let a
 * customer discover that mid-payment; the refusal happens here, in plain
 * language, with a human route out.
 */
export function CheckoutUnavailable({ quote }: { quote: CheckoutQuote }) {
  return (
    <section
      aria-labelledby="checkout-unavailable-heading"
      className="mx-auto max-w-[560px]"
      data-testid="checkout-unavailable"
    >
      <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated px-5 py-6 sm:px-6 sm:py-7">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rs-brand-subtle text-rs-brand">
          <CircleDashed size={20} aria-hidden="true" />
        </span>
        <h2
          id="checkout-unavailable-heading"
          className="mt-4 text-[19px] font-semibold tracking-tight text-rs-text"
        >
          Online checkout is not available for this plan yet
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-rs-text-secondary">
          {quote.unavailable_message ??
            'We are not able to take payment for this plan through self-serve checkout at the moment.'}
        </p>
        <dl className="mt-5 divide-y divide-rs-border-subtle border-y border-rs-border-subtle">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-[12.5px] text-rs-text-tertiary">Plan</dt>
            <dd className="text-[13px] font-medium text-rs-text">
              RELIASTRA {quote.display_plan}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-[12.5px] text-rs-text-tertiary">Price</dt>
            <dd className="font-mono text-[13px] font-medium text-rs-text">
              {quote.product_price_display ?? 'Custom'}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <a
            href="mailto:billing@reliastra.com"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rs-brand px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-rs-brand-hover"
          >
            <LifeBuoy size={15} aria-hidden="true" />
            Contact billing
          </a>
          <Link
            href="/#pricing"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rs-border px-4 text-[13.5px] font-semibold text-rs-text transition-colors hover:bg-rs-hover"
          >
            Back to pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
