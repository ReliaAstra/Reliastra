'use client';

import { cn } from '@/lib/utils';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import {
  currencyNotice,
  formatFxRate,
  fxReference,
  isCheckoutReady,
  paymentAmountFor,
  paymentProviderName,
  usableFxReference,
} from '@/lib/billing/currency';

/**
 * Payment-currency disclosure, in the public site's visual language.
 *
 * IMPORTANT: every *sentence* here still comes from `lib/billing/currency` - * `currencyNotice()`, `paymentAmountFor()`, `paymentProviderName()`,
 * `formatFxRate()` and the FX `label`/`disclaimer` fields. That module is the
 * canonical wording (it is byte-compared against the backend's transactional
 * email copy in the backend test suite). This component changes the container
 * only. It must never paraphrase, shorten or compute a currency figure.
 *
 * The charge currency is resolved by the same backend endpoint that prices the
 * Paystack transaction, so the site cannot advertise a currency checkout does
 * not use.
 */

export function PaymentCurrencyDisclosure({
  className,
  heading = 'Billing currency',
}: {
  className?: string;
  heading?: string;
}) {
  const { currency } = usePaymentCurrency();
  const notice = currencyNotice(currency);
  const fx = usableFxReference(fxReference(currency));

  if (!notice && !fx) return null;

  return (
    <aside
      role="note"
      aria-label={heading}
      data-testid="pricing-currency-notice"
      className={cn('ob-alert ob-alert-note', className)}
    >
      <p className="ob-label mb-2 text-[var(--ob-signal)]">{heading}</p>
      {notice && (
        <p className="max-w-[76ch] text-[13px] leading-[1.65] text-[var(--ob-text-2)]">
          {notice}
        </p>
      )}
      {fx && (
        <div
          data-testid="fx-reference-panel"
          className="mt-4 border-t border-[var(--ob-line)] pt-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="ob-label">{fx.label}</p>
            <p className="ob-mono text-[var(--ob-text)]">{formatFxRate(fx)}</p>
          </div>
          <p className="mt-1.5 text-[12px] leading-[1.55] text-[var(--ob-text-4)]">
            {fx.disclaimer} Source:{' '}
            <a
              href={fx.provider_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ob-link"
            >
              {fx.provider}
            </a>
            {fx.source_timestamp ? ` · quoted ${fx.source_timestamp}` : ''}
          </p>
        </div>
      )}
    </aside>
  );
}

/**
 * The transparency triple for one plan: list price, the amount actually
 * charged, and who charges it. Rendered as a hairline definition list so it
 * reads as documentation rather than a disclaimer.
 */
export function PlanChargeSummary({
  plan,
  interval,
  productPrice,
  className,
}: {
  plan: string;
  interval: 'monthly' | 'annual';
  /** Pre-formatted list price, e.g. "$19.00 (USD)". */
  productPrice: string;
  className?: string;
}) {
  const { currency } = usePaymentCurrency();
  const charged = paymentAmountFor(currency, plan, interval);
  const ready = isCheckoutReady(currency);
  const period = interval === 'annual' ? 'year' : 'month';

  return (
    <dl
      data-testid={`payment-transparency-${plan}`}
      className={cn('flex flex-col', className)}
    >
      <Row label="Product price" value={productPrice} />
      <Row
        label="Actual charge"
        value={
          <span data-testid={`payment-charge-${plan}`}>
            {charged ? (
              <>
                <span className="text-[var(--ob-text)]">{charged}</span>{' '}
                <span className="text-[var(--ob-text-4)]">per {period}</span>
              </>
            ) : ready ? (
              'Confirmed at checkout'
            ) : (
              'Pending price confirmation'
            )}
          </span>
        }
      />
      <Row label="Payment provider" value={paymentProviderName(currency)} />
    </dl>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-[var(--ob-line)] py-2">
      <dt className="ob-label">{label}</dt>
      <dd className="ob-mono text-right text-[var(--ob-text-3)]">{value}</dd>
    </div>
  );
}

/** One-line note shown where the full disclosure would be too heavy. */
export function CurrencyFootnote({ className }: { className?: string }) {
  const { currency } = usePaymentCurrency();
  const notice = currencyNotice(currency);
  if (!notice) return null;
  return (
    <p className={cn('ob-small max-w-[76ch]', className)}>{notice}</p>
  );
}
