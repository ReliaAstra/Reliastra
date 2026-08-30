'use client';

import { CreditCard, Info, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  currencyNotice,
  formatFxRate,
  usableFxReference,
  fxReference,
  isCheckoutReady,
  paymentAmountFor,
  paymentProviderDisplay,
  type FxReference,
  type PaymentCurrencyInfo,
} from '@/lib/billing/currency';

/**
 * Canonical payment transparency primitives.
 *
 * ONE file owns every RELIASTRA-owned sentence a customer sees before, during
 * and after a payment. Pricing grid, upgrade modal, pre-payment confirmation,
 * billing page — they all import from here, so no surface can paraphrase,
 * miniaturize or skip the disclosure.
 *
 * Design intent (product spec §9/§10): the currency explanation is an
 * *informational* note, not a warning. Muted tinted container, info glyph, no
 * red, no alarm. The currency name is always real text — never conveyed by a
 * symbol or a colour alone — and blocks are marked up so assistive tech
 * announces them as notes/tables.
 */

/**
 * What this plan costs, what will actually be charged, and who charges it.
 *
 * The mandatory transparency triple, rendered as a hairline table so it reads
 * as product documentation rather than a disclaimer:
 *
 *   Product price     $39.00 (USD)
 *   Actual charge     ₦60,000.00 (NGN)  per month
 *   Payment provider  Paystack
 *
 * Every figure is a backend-resolved string ({@linkcode paymentAmountFor}):
 * the charge line is literally the minor-unit amount the API sends to
 * Paystack, formatted server-side. When no payment price has been published
 * the charge line states that honestly — the component never derives a
 * number, and neither may any caller.
 *
 * `emphasis`:
 * - `card` — compact block for pricing cards and plan choosers;
 * - `panel` — full-framed version for the checkout review and billing page.
 */
export function PlanPaymentSummary({
  info,
  plan,
  interval = 'monthly',
  productPrice,
  emphasis = 'card',
  className,
}: {
  info?: PaymentCurrencyInfo | null;
  plan: string;
  interval?: 'monthly' | 'annual';
  /** USD product list price, pre-formatted by the caller (e.g. "$39.00 (USD)"). */
  productPrice: string;
  emphasis?: 'card' | 'panel';
  className?: string;
}) {
  const charged = paymentAmountFor(info, plan, interval);
  const checkoutReady = isCheckoutReady(info);
  const provider = paymentProviderDisplay(info);
  const periodWord = interval === 'annual' ? 'year' : 'month';

  const rows = (
    <>
      <TransparencyRow label="Product price" value={productPrice} />
      <TransparencyRow
        label="Actual charge"
        value={
          charged ? (
            <span
              className="font-mono font-semibold text-[#09090B] dark:text-[#FAFAFA]"
              data-testid={`payment-charge-${plan}`}
            >
              {charged}
            </span>
          ) : (
            <span
              className="text-[#52525B] dark:text-[#A1A1AA]"
              data-testid={`payment-charge-${plan}`}
            >
              {checkoutReady ? 'Confirmed at checkout' : 'Pending price confirmation'}
            </span>
          )
        }
        hint={charged ? `per ${periodWord}` : undefined}
        emphasize={emphasis === 'panel'}
      />
      <TransparencyRow label="Payment provider" value={provider} last />
    </>
  );

  if (emphasis === 'panel') {
    return (
      <div
        data-testid={`payment-transparency-${plan}`}
        className={cn(
          'rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]',
          className
        )}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717A] dark:text-[#8A8A93]">
          <CreditCard size={12} aria-hidden="true" />
          Payment details
        </div>
        <dl className="divide-y divide-[#F0F0F0] dark:divide-white/[0.06]">{rows}</dl>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)} data-testid={`payment-currency-${plan}`}>
      <div data-testid={`payment-transparency-${plan}`}>
        <dl className="divide-y divide-[#F0F0F0] rounded-lg border border-[#EFEFEF] bg-[#FAFAFA]/70 dark:divide-white/[0.06] dark:border-white/10 dark:bg-white/[0.02]">
          {rows}
        </dl>
      </div>
      {!isCheckoutReady(info) ? (
        <p className="text-[11px] font-medium text-[#71717A] dark:text-[#8A8A93]">
          Our {info?.payment_currency_name ?? 'NGN'} price for this plan is being
          confirmed — billing will set it up directly.
        </p>
      ) : null}
    </div>
  );
}

function TransparencyRow({
  label,
  value,
  hint,
  last,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  last?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        emphasize ? 'px-0 py-2' : 'px-2.5 py-1.5',
        !last && emphasize && 'border-b border-[#F0F0F0] dark:border-white/[0.06]'
      )}
    >
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-[0.04em] text-[#71717A] dark:text-[#8A8A93]">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[12px] leading-snug break-words">
        {value}
        {hint ? (
          <span className="ml-1 text-[11px] text-[#A1A1AA] dark:text-[#71717A]">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * Canonical payment-currency disclosure.
 *
 * Renders the mandated paragraph verbatim from `lib/billing/currency`, in an
 * informational (never alarming) container, beside the plan decision it
 * explains.
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
 * The FX reference footnote, when the backend has one.
 *
 * Renders ONLY a sourced, timestamped estimate. The label states it is an
 * estimate; the source is named and linked so the figure is verifiable; the
 * retrieval time is shown; and the disclaimer makes plain that the charge was
 * not computed from this rate. If the payload is missing or stale-but-absent,
 * the whole panel is omitted — never replaced with a guessed number.
 */
export function FxReferencePanel({
  info,
  fx: fxOverride,
  className,
}: {
  info?: PaymentCurrencyInfo | null;
  /**
   * A reference resolved elsewhere (the checkout quote carries its own), used
   * instead of reading one off `info`. Kept as an input rather than a second
   * component so there is exactly one rendering of this panel — and exactly one
   * place its labelling can be weakened.
   */
  fx?: FxReference | null;
  className?: string;
}) {
  // Both sources pass one validity gate: a rate is displayed only if it is a
  // positive, finite, fully-labelled number. Absent or invalid -> no panel.
  const fx = usableFxReference(
    fxOverride !== undefined ? fxOverride : fxReference(info)
  );
  if (!fx) return null;
  const retrievedAt = formatFxTimestamp(fx.retrieved_at);

  return (
    <aside
      role="note"
      aria-label="Exchange rate reference"
      data-testid="fx-reference-panel"
      className={cn(
        'rounded-lg border border-[#E4E4E7] bg-white px-3.5 py-2.5 text-left dark:border-white/10 dark:bg-white/[0.02]',
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#71717A] dark:text-[#8A8A93]">
          {fx.label}
        </p>
        <p className="font-mono text-[12px] font-medium text-[#09090B] dark:text-[#FAFAFA]">
          {formatFxRate(fx)}
        </p>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[#71717A] dark:text-[#8A8A93]">
        Source:{' '}
        <a
          href={fx.provider_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-[#0891B2] underline-offset-2 hover:underline dark:text-[#22D3EE]"
        >
          <ShieldCheck size={11} aria-hidden="true" />
          {fx.provider}
        </a>
        {fx.source_timestamp ? ` · quoted ${fx.source_timestamp}` : ''}
        {retrievedAt ? ` · fetched ${retrievedAt}` : ''}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-[#71717A] dark:text-[#8A8A93]">
        {fx.disclaimer}
      </p>
    </aside>
  );
}

function formatFxTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
