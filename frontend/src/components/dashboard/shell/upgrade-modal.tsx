'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { PLANS, annualPrice, dependencyLabel, getPlan, intervalLabel, monthlyPrice, retentionLabel, seatLabel } from '@/lib/dashboard/plans';
import { cn } from '@/lib/utils';
import { RsButton } from '../ui/button';
import {
  PaymentCurrencyNotice,
  PlanPaymentSummary,
} from '@/components/billing/PaymentCurrencyNotice';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import {
  currencyLabel,
  formatMinorUnits,
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
 * Plan chooser — the entry point into RELIASTRA's checkout.
 *
 * This dialog answers one question (which plan, on which interval) and then
 * hands off: selecting a paid plan routes to `/checkout`, where the quote, the
 * currency disclosure, the payment methods enabled for a global customer and the
 * Paystack hand-off all live. It used to run the payment itself, which meant two
 * screens each believed they were the last thing a customer read before money
 * moved — and only one of them was the screen the backend priced.
 *
 * Enterprise stays "Contact Sales" and Free stays the default tier: neither is
 * chargeable through self-serve, so neither is offered a checkout at all. The
 * currency disclosure is repeated here because this *is* a plan decision, and a
 * customer should never have to reach a payment screen to learn what currency
 * they are being billed in.
 */
export function UpgradeModal() {
  const open = useAppStore((s) => s.upgradeOpen);
  const close = useAppStore((s) => s.closeUpgrade);
  const plan = useAppStore((s) => s.plan);
  const user = useAppStore((s) => s.user);
  const router = useRouter();
  // The plan a purchase would replace is the *underlying* one. An
  // organization inside its evaluation has Pro capabilities but pays for
  // nothing, so counting the trial grant as "current" disabled Pro in the
  // chooser and left trial customers with no way to subscribe at all.
  const current = getPlan(plan?.plan);
  const [pending, setPending] = useState<string | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const { currency } = usePaymentCurrency();

  // Reset the flow whenever the dialog is dismissed or reopened.
  useEffect(() => {
    if (!open) setPending(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  /**
   * Enter RELIASTRA's checkout.
   *
   * The chooser used to price and launch the payment itself. That made two
   * screens responsible for the same promise — the amount a customer is
   * charged — and every copy of it a place pricing could drift. So this carries
   * intent only (plan + interval) and `/checkout` resolves everything else from
   * the backend: the quote, the payment methods enabled for a global customer,
   * the provider hand-off and the verification that decides entitlement.
   */
  const startCheckout = (targetId: string) => {
    setPending(targetId);
    close();
    router.push(`/checkout?plan=${encodeURIComponent(targetId)}&interval=${interval}`);
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
        aria-labelledby="pricing-title"
      >
        <div className="relative shrink-0 px-6 pb-4 pt-7 md:px-8 md:pt-8">
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg text-rs-text-tertiary transition-colors hover:bg-rs-hover hover:text-rs-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rs-focus"
            aria-label="Close"
          >
            <X size={18} />
          </button>
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
        </div>

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
                          onClick={() => startCheckout(p.id)}
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
