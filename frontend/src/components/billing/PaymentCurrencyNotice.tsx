'use client';

import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  billedInLabel,
  currencyNotice,
  isCheckoutReady,
  paymentAmountFor,
  type PaymentCurrencyInfo,
} from '@/lib/billing/currency';

/**
 * Canonical payment-currency disclosure.
 *
 * ONE component, used by every RELIASTRA-owned surface where a customer is
 * about to start a Paystack payment (pricing grid, upgrade modal, pre-payment
 * confirmation, billing page). It renders the canonical paragraph from
 * `lib/billing/currency`, so no surface can paraphrase it.
 *
 * Design intent (product spec §9/§10): an *informational* note, not a warning.
 * Muted tinted container, info glyph, no red, no alarm. The currency name is
 * always real text — never conveyed by a symbol or a colour alone — and the
 * block is marked up so assistive tech announces it as a note.
 *
 * The per-plan companion lives in this file too — see
 * {@linkcode PlanPaymentSummary} — so the sentence stating what a plan is
 * billed in and what it costs exists exactly once for the whole product.
 */
export function PaymentCurrencyNotice({
  info,
  heading = 'Payment currency',
  className,
}: {
  info?: PaymentCurrencyInfo | null;
  heading?: string;
  className?: string;
}) {
  const notice = currencyNotice(info);
  if (!notice) return null;

  return (
    <aside
      role="note"
      aria-label={heading}
      className={cn(
        'flex items-start gap-3 rounded-lg border border-rs-brand/20 bg-rs-brand-subtle px-4 py-3 text-left',
        className
      )}
    >
      <Info
        size={16}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-rs-brand"
      />
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-secondary">
          {heading}
        </p>
        <p className="text-[13px] leading-relaxed text-rs-text-secondary">{notice}</p>
      </div>
    </aside>
  );
}

/**
 * What this plan is billed in, and exactly how much it costs in that currency.
 *
 * Rendered inside every plan card (marketing pricing grid, upgrade modal),
 * between the price and the card's action, so the currency of the charge is
 * present at the moment of the decision and not only at the moment of payment.
 * Both sentences come from `lib/billing/currency`; neither is composed from a
 * rate or a local format here:
 *
 * - the label is the processing currency the backend reports;
 * - the amount is the price the business published for Paystack, shown only
 *   when it exists — an unpublished price is never estimated on screen.
 */
export function PlanPaymentSummary({
  info,
  plan,
  interval = 'monthly',
  className,
}: {
  info?: PaymentCurrencyInfo | null;
  plan: string;
  interval?: 'monthly' | 'annual';
  className?: string;
}) {
  if (!currencyNotice(info)) return null;
  const charged = paymentAmountFor(info, plan, interval);
  return (
    <div className={cn('space-y-1', className)} data-testid={`payment-currency-${plan}`}>
      <p className="flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[#52525B] dark:text-[#A1A1AA]">
        <Info
          size={13}
          aria-hidden="true"
          className="mt-[2px] shrink-0 text-[#71717A] dark:text-[#8A8A93]"
        />
        <span>
          {billedInLabel(info)}
          {!isCheckoutReady(info) ? ' — pricing confirmation required' : ''}
        </span>
      </p>
      {charged ? (
        <p className="text-[12px] leading-snug text-[#71717A] dark:text-[#8A8A93]">
          Charged as{' '}
          <span className="font-mono font-medium text-[#09090B] dark:text-[#FAFAFA]">
            {charged}
          </span>{' '}
          per {interval === 'annual' ? 'year' : 'month'}
        </p>
      ) : null}
    </div>
  );
}
