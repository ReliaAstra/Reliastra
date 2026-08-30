'use client';

import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/app-store';
import { PLANS, annualPrice, dependencyLabel, getPlan, intervalLabel, monthlyPrice, retentionLabel, seatLabel } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { cn } from '@/lib/utils';
import { RsButton } from '../ui/button';
import { toast } from 'sonner';
import {
  FxReferencePanel,
  PaymentCurrencyNotice,
  PlanPaymentSummary,
} from '@/components/billing/PaymentCurrencyNotice';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import {
  currencyLabel,
  formatMinorUnits,
  isCheckoutReady,
  paymentProviderName,
} from '@/lib/billing/currency';

function Feature({ ok, children }: { ok: boolean | string; children: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-rs-text-secondary">{children}</span>
      <span className={cn('font-mono text-xs', ok ? 'text-rs-text' : 'text-rs-text-tertiary')}>
        {typeof ok === 'string' ? ok : ok ? 'Yes' : '—'}
      </span>
    </div>
  );
}

/**
 * Upgrade flow — the REAL billing path.
 *
 * Choosing a plan opens a pre-payment confirmation step, and only an explicit
 * "Continue to Paystack" calls ``POST /v1/billing/initialize`` (the backend
 * creates a Paystack transaction scoped to the caller's organization) and
 * redirects to the provider's hosted authorization page. The backend's webhook
 * + verify endpoint flip the subscription; the frontend never mutates
 * entitlement state.
 *
 * Why the confirmation step exists: the Paystack-hosted page is not ours to
 * modify, so the currency the card will be charged in has to be unambiguous
 * *before* the customer leaves RELIASTRA. That step shows the plan, the
 * product price, the amount and currency Paystack will actually charge, and the
 * canonical disclosure — all read from the same backend resolver that prices
 * the transaction.
 */
export function UpgradeModal() {
  const open = useAppStore((s) => s.upgradeOpen);
  const close = useAppStore((s) => s.closeUpgrade);
  const plan = useAppStore((s) => s.plan);
  const user = useAppStore((s) => s.user);
  // The plan a purchase would replace is the *underlying* one. An
  // organization inside its evaluation has Pro capabilities but pays for
  // nothing, so counting the trial grant as "current" disabled Pro in the
  // chooser and left trial customers with no way to subscribe at all.
  const current = getPlan(plan?.plan);
  const [pending, setPending] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const [selected, setSelected] = useState<string | null>(null);
  const { currency } = usePaymentCurrency();

  // Reset the flow whenever the dialog is dismissed or reopened.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setPending(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Back out of the confirmation step first, then close the dialog.
        if (selected) setSelected(null);
        else close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, selected]);

  if (!open) return null;

  const selectedPlan = selected ? PLANS.find((p) => p.id === selected) ?? null : null;

  const startCheckout = async (targetId: string) => {
    setPending(targetId);
    try {
      const res = await api.initializePayment(targetId, interval);
      // Hand off to Paystack; entitlement flips server-side after payment.
      window.open(res.authorization_url, '_self', 'noopener');
    } catch (err) {
      setPending(null);
      toast.error(err instanceof Error ? err.message : 'Could not start checkout', {
        description: 'If this persists, contact support@reliastra.com.',
      });
    }
  };

  return (
    <div
      className="rs-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-[rgb(11_15_25_/_0.5)] p-4"
      onClick={close}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="rs-modal-panel-xl rs-modal-in flex max-h-[90vh] w-full max-w-[900px] flex-col overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated shadow-rs-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
        aria-labelledby={selected ? 'checkout-review-title' : 'pricing-title'}
      >
        <div className="relative shrink-0 px-6 pb-4 pt-7 md:px-8 md:pt-8">
          <button
            type="button"
            onClick={() => (selected ? setSelected(null) : close())}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            aria-label={selected ? 'Back to plan selection' : 'Close'}
          >
            <X size={18} />
          </button>
          {selectedPlan ? (
            <>
              <h2 id="checkout-review-title" className="rs-page-title text-xl">
                Review your subscription
              </h2>
              <p className="mt-1 text-sm text-rs-text-tertiary">
                Confirm the plan, the billing period and the currency you will be
                charged in before continuing to Paystack.
              </p>
            </>
          ) : (
            <>
              <h2 id="pricing-title" className="rs-page-title text-xl">
                Choose your plan
              </h2>
              <p className="mt-1 text-sm text-rs-text-tertiary">
                Monitor more dependencies. Generate evidence. Protect your SLAs.
                {user?.email ? (
                  <span className="hidden sm:inline"> Billing as {user.email}.</span>
                ) : null}
              </p>
            </>
          )}
        </div>

        {selectedPlan ? (
          <CheckoutReview
            planName={selectedPlan.name}
            planId={selectedPlan.id}
            interval={interval}
            currency={currency}
            pending={pending === selectedPlan.id}
            onConfirm={() => void startCheckout(selectedPlan.id)}
            onBack={() => setSelected(null)}
          />
        ) : (
          <>
            {/* Billing interval toggle — changes the ACTUAL amount charged. */}
            <div className="flex shrink-0 items-center justify-center gap-3 px-6 pb-2">
              <button
                type="button"
                onClick={() => setInterval('monthly')}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                  interval === 'monthly' ? 'bg-rs-brand text-white' : 'text-rs-text-tertiary'
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setInterval('annual')}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                  interval === 'annual' ? 'bg-rs-brand text-white' : 'text-rs-text-tertiary'
                )}
              >
                Annual · Save 2 months
              </button>
            </div>

            <div className="flex gap-3 overflow-x-auto px-5 pb-4 rs-scrollbar md:px-6">
              {PLANS.map((p) => {
                const isCurrent = p.id === current.id;
                const isPopular = p.id === 'pro';
                const isFree = p.id === 'free';
                const isEnterprise = p.isEnterprise;
                const price = interval === 'annual' ? annualPrice(p) : monthlyPrice(p);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative flex min-w-[172px] flex-1 flex-col rounded-xl border p-4',
                      isPopular
                        ? 'border-2 border-rs-brand bg-[rgba(37,99,235,0.03)]'
                        : 'border-rs-border-subtle bg-rs-elevated'
                    )}
                  >
                    {isPopular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-rs-brand px-2.5 py-1 text-[11px] font-semibold text-white">
                        Most Popular
                      </span>
                    )}
                    {isEnterprise && (
                      <span className="mb-2 inline-flex self-start rounded bg-rs-active px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rs-text">
                        Contact Sales
                      </span>
                    )}
                    <div className="text-sm font-medium text-rs-text">{p.name}</div>
                    <div className="mt-1 min-h-[32px] text-xs leading-snug text-rs-text-tertiary">{p.tagline}</div>
                    <div className="mt-3 font-mono text-2xl font-bold tracking-[-0.02em] text-rs-text">
                      {price}
                      <span className="text-xs font-normal text-rs-text-tertiary">
                        {isEnterprise ? '' : interval === 'annual' ? '/yr' : '/mo'}
                      </span>
                    </div>
                    {!isEnterprise && !isFree && (
                      <PlanPaymentSummary
                        info={currency}
                        plan={p.id}
                        interval={interval}
                        productPrice={formatMinorUnits(
                          (interval === 'annual' ? p.priceAnnual : p.priceMonthly) != null
                            ? (interval === 'annual' ? p.priceAnnual! : p.priceMonthly!) * 100
                            : null,
                          'USD'
                        )}
                        className="mt-1"
                      />
                    )}
                    <div className="mt-4 border-t border-rs-border-subtle pt-2">
                      <Feature ok={dependencyLabel(p.dependencies)}>Dependencies</Feature>
                      <Feature ok={seatLabel(p.teamMembers)}>Team</Feature>
                      <Feature ok={intervalLabel(p.minIntervalSeconds).replace(' checks', '')}>Check interval</Feature>
                      <Feature ok={retentionLabel(p.retentionDays)}>Retention</Feature>
                      <Feature ok={p.alerts}>Alerts</Feature>
                      <Feature ok={p.evidence}>Evidence</Feature>
                      <Feature ok={p.api}>API access</Feature>
                      <Feature ok={p.clientGroups}>Client groups</Feature>
                      <Feature ok={p.whiteLabel}>White-label</Feature>
                    </div>
                    <div className="mt-4">
                      {isCurrent ? (
                        <button
                          disabled
                          className="w-full cursor-default rounded-lg py-2 text-sm text-rs-text-tertiary"
                        >
                          Current plan
                        </button>
                      ) : isFree ? (
                        <button
                          disabled
                          className="w-full cursor-default rounded-lg py-2 text-sm text-rs-text-tertiary"
                        >
                          Default tier
                        </button>
                      ) : isEnterprise ? (
                        <a
                          href="mailto:sales@reliastra.com?subject=Enterprise%20plan"
                          className="block w-full rounded-lg border border-rs-border bg-transparent py-2 text-center text-sm font-medium text-rs-text transition-colors hover:bg-rs-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
                        >
                          Contact Sales
                        </a>
                      ) : (
                        <RsButton
                          className="w-full"
                          disabled={pending !== null}
                          onClick={() => setSelected(p.id)}
                        >
                          {`Upgrade to ${p.name}`}
                        </RsButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Plan information → currency disclosure → payment CTA. The
                disclosure lives inside the flow, above the button that would
                start it, so it cannot be skipped. */}
            <div className="px-5 pb-2 md:px-6" data-testid="upgrade-currency-notice">
              <PaymentCurrencyNotice info={currency} heading="Billing currency" />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-rs-border-subtle px-6 py-4 text-xs text-rs-text-tertiary">
              <span>Secure checkout via {paymentProviderName(currency)}</span>
              <span>
                Charged in {currencyLabel(currency)} · product price in {currency.product_currency}
              </span>
              <span>Cancel anytime</span>
              <span>Questions? support@reliastra.com</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pre-payment confirmation (the last RELIASTRA-owned screen before Paystack).
 *
 * Paystack hosts its own checkout page and offers no slot for arbitrary
 * merchant copy, so nothing here tries to reach into it. Everything the
 * customer needs to know about the charge — plan, period, product price, the
 * exact amount and currency being sent, and the canonical disclosure — is
 * stated here instead.
 */
function CheckoutReview({
  planId,
  planName,
  interval,
  currency,
  pending,
  onConfirm,
  onBack,
}: {
  planId: string;
  planName: string;
  interval: 'monthly' | 'annual';
  currency: ReturnType<typeof usePaymentCurrency>['currency'];
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const meta = getPlan(planId);
  const ready = isCheckoutReady(currency);
  const productPrice = formatMinorUnits(
    (interval === 'annual' ? meta.priceAnnual : meta.priceMonthly) != null
      ? (interval === 'annual' ? meta.priceAnnual! : meta.priceMonthly!) * 100
      : null,
    'USD'
  );
  const charged = currency.plan_payment_amounts?.[planId]?.[interval];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 rs-scrollbar md:px-6">
      <div className="mx-auto max-w-[560px]">
        <dl className="rounded-xl border border-rs-border-subtle bg-rs-base p-5">
          <Row label="Plan">
            <span className="font-medium text-rs-text">{planName}</span>
          </Row>
          <Row label="Billing period">
            <span className="text-rs-text">{interval === 'annual' ? 'Annual' : 'Monthly'}</span>
          </Row>
        </dl>

        {/* The mandatory triple, one shared component with the pricing page and
            the billing page: what the plan costs, what Paystack will charge,
            who charges it. All figures are backend-resolved. */}
        <div className="mt-3">
          <PlanPaymentSummary
            info={currency}
            plan={planId}
            interval={interval}
            productPrice={productPrice}
            emphasis="panel"
            className="bg-rs-base"
          />
        </div>

        <div className="mt-4" data-testid="checkout-currency-notice">
          <PaymentCurrencyNotice info={currency} heading="Payment currency" />
        </div>

        <FxReferencePanel info={currency} className="mt-3" />

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <RsButton variant="ghost" onClick={onBack} disabled={pending}>
            <ArrowLeft size={14} className="mr-1.5" aria-hidden="true" />
            Back to plans
          </RsButton>
          {ready ? (
            <RsButton onClick={onConfirm} disabled={pending}>
              {pending
                ? 'Preparing checkout…'
                : `Continue to Paystack — ${charged ?? currencyLabel(currency)}`}
            </RsButton>
          ) : (
            <a
              href="mailto:billing@reliastra.com?subject=Pro%20plan%20subscription"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-rs-brand px-4 text-sm font-medium text-white transition-colors hover:bg-rs-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            >
              Contact billing to start your subscription
            </a>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-rs-text-tertiary sm:text-right">
          You will be redirected to {paymentProviderName(currency)} to enter your
          payment details.
          {ready
            ? ` The amount above is exactly what is sent to the provider, in ${currencyLabel(currency)} — never converted or recomputed.`
            : ''}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-2 text-[13px]',
        !last && 'border-b border-rs-border-subtle'
      )}
    >
      <dt className="shrink-0 text-rs-text-tertiary">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function EvidenceGateModal() {
  const open = useAppStore((s) => s.evidenceGateOpen);
  const setOpen = useAppStore((s) => s.setEvidenceGateOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="rs-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-[rgb(11_15_25_/_0.5)] p-4" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
      <div
        className="rs-modal-panel rs-modal-in w-full max-w-md rounded-xl border border-rs-border-subtle bg-rs-elevated p-8 shadow-rs-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <h2 className="text-lg font-semibold text-rs-text">Evidence reports are a Pro feature</h2>
        <p className="mt-2 text-sm leading-relaxed text-rs-text-secondary">
          Generate verifiable SLA evidence backed by multi-region checks — the artifact you attach
          to a refund request or executive postmortem.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <RsButton
            onClick={() => {
              setOpen(false);
              openUpgrade('evidence');
            }}
          >
            View plans
          </RsButton>
          <RsButton variant="ghost" onClick={() => setOpen(false)}>
            Maybe later
          </RsButton>
        </div>
      </div>
    </div>
  );
}
