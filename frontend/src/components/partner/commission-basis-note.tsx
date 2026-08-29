'use client';

import { Info } from 'lucide-react';
import { currencyLabel, currencyNotice } from '@/lib/billing/currency';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import { cn } from '@/lib/utils';

/**
 * One statement of the basis behind the partner earnings figures.
 *
 * Partner pages illustrate earnings from RELIASTRA's USD list price, while the
 * backend records a commission in the currency the referred customer is
 * actually charged. Rather than restating prices in both currencies on every
 * partner screen, these surfaces say what they are computed from and where the
 * real money moves — using the same `/billing/currency` answer the customer
 * surfaces read, so the note cannot contradict them.
 *
 * It renders nothing when there is nothing to explain: if the processing
 * currency is the one the price list uses, the two views already agree.
 */
export function CommissionBasisNote({ className }: { className?: string }) {
  const { currency } = usePaymentCurrency();
  if (!currencyNotice(currency)) return null;
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground',
        className
      )}
      data-testid="commission-basis-note"
    >
      <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        Figures here are computed from the Pro list price in US Dollars (USD). A
        commission is recorded in the currency the referred customer is charged
        in — currently {currencyLabel(currency)} — and payouts are reported in
        that currency.
      </span>
    </p>
  );
}
