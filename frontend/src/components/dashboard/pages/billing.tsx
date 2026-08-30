'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { getPlan, isEnterprise, nextPlan, retentionLabel } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { keys } from '@/lib/dashboard/queries';
import { useBillingTransactions, useDependencies, usePlan } from '@/lib/dashboard/queries';
import { formatDate } from '@/lib/dashboard/format';
import { RsButton } from '../ui/button';
import {
  FxReferencePanel,
  PaymentCurrencyNotice,
} from '@/components/billing/PaymentCurrencyNotice';
import {
  billedInLabel,
  currencyLabel,
  formatMinorUnits,
  paymentAmountFor,
  paymentProviderDisplay,
  paymentProviderName,
} from '@/lib/billing/currency';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import { cn } from '@/lib/utils';
import { EmptyState } from '../ui/empty-state';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  FileText,
  Sparkles,
} from 'lucide-react';

/**
 * Billing — every number comes from the backend's authoritative
 * ``GET /v1/billing/plan`` (plan, effective plan, evaluation state, limits)
 * plus live dependency usage. The evaluation is never computed client-side.
 * The page renders the 14-day full-access evaluation, conversion preview,
 * and post-evaluation fallback with real account consequences.
 */
export function BillingPage() {
  const { data: plan } = usePlan();
  const storePlan = useAppStore((s) => s.plan);
  // Authoritative processing currency + canonical disclosure. The plan payload
  // carries it too (`plan.payment`), so the API answer wins when both exist.
  const { currency: fallbackCurrency } = usePaymentCurrency();
  const currency = plan?.payment ?? fallbackCurrency;
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: deps } = useDependencies();
  // Payment history feeds the table below. The hook must run unconditionally
  // — the component has a loading early-return further down, and a hook after
  // it would change the hook count between renders (React error boundary).
  const { data: txData } = useBillingTransactions();

  // ── Returned from the provider? Confirm the exact charge here, once. ────
  // Paystack redirects with ?pay_ref=<reference>. Verifying through our own
  // API both provisions the plan (the webhook is a second, idempotent path)
  // and returns the figures the gateway actually settled, so the banner below
  // restates the real payment instead of the catalog price.
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const checkedRef = useRef<string | null>(null);
  const [paid, setPaid] = useState<Awaited<ReturnType<typeof api.verifyTransaction>> | null>(
    null
  );
  useEffect(() => {
    const reference =
      searchParams.get('pay_ref') || searchParams.get('reference');
    if (!reference || checkedRef.current === reference) return;
    checkedRef.current = reference;
    // No "alive" flag here on purpose: in StrictMode (and any dev re-run that
    // cleans up the first effect) the cleanup lands before the request
    // resolves, and an liveness check would silently drop a SUCCESSFUL
    // verification — the customer paid and saw nothing. The checkedRef guard
    // above is what keeps this single-flight; a setState after unmount is a
    // no-op in React 18, so the response is always applied when it arrives.
    void api
      .verifyTransaction(reference)
      .then((res) => {
        if (!res.verified) return;
        setPaid(res);
        void queryClient.invalidateQueries({ queryKey: keys.plan });
        void queryClient.invalidateQueries({ queryKey: keys.billingTransactions });
      })
      .catch(() => {
        /* the webhook remains the backstop; the plan card still refetches */
      });
    // Keep the URL readable once handled.
    window.history.replaceState(null, '', '/settings/billing');
  }, [searchParams, queryClient]);
  const p = plan ?? storePlan;
  const current = getPlan(p?.effective_plan ?? p?.plan);
  const underlying = getPlan(p?.plan);
  const used = deps?.length ?? 0;
  const limit = p?.max_dependencies ?? current.dependencies;
  // Enterprise/custom plans have no fixed dependency cap.
  const limitIsCustom = limit == null;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const fill = pct > 80 ? '#F59E0B' : pct > 60 ? '#D97706' : '#2563EB';

  if (!p) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-rs-border-subtle" />
        <div className="h-36 animate-pulse rounded-xl bg-rs-border-subtle" />
        <div className="h-24 animate-pulse rounded-xl bg-rs-border-subtle" />
      </div>
    );
  }

  const trialActive = (p.is_evaluation_active ?? p.is_trial_active) === true;
  const daysLeft = p.evaluation_days_remaining ?? p.trial_days_remaining ?? 0;
  const trialLength = p.trial_length_days ?? 14;
  const fallback = p.fallback_info ?? null;
  const isPaid = underlying.id !== 'free';
  const transactions = txData?.items ?? [];

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Billing</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">
          Plan, payment history and usage. Every amount below is what the
          provider actually settled, in the currency it settled in.
        </p>
      </div>

      {/* Returning from the provider: the exact charge, restated from the
          gateway's own figures — never from a catalog re-read. */}
      {paid && (
        <section
          className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          data-testid="payment-confirmation"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-rs-text">
                Payment confirmed — your plan is active
              </h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2">
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-rs-text-tertiary">Plan</dt>
                  <dd className="font-medium text-rs-text">{getPlan(paid.plan).name}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-rs-text-tertiary">Payment provider</dt>
                  <dd className="text-rs-text">
                    {paid.payment_provider ?? paymentProviderName(currency)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-rs-text-tertiary">Product price</dt>
                  <dd className="font-mono text-rs-text">
                    {paid.product_price_display ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 sm:justify-start">
                  <dt className="text-rs-text-tertiary">Actual charge</dt>
                  <dd className="font-mono font-semibold text-rs-text">
                    {paid.amount_display ??
                      formatMinorUnits(paid.amount_minor, paid.currency ?? currency.payment_currency)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-rs-text-tertiary">
                Reference {paid.reference} · recorded in your payment history below.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Current plan */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Current plan
            </div>
            <div className="mt-2 font-mono text-[32px] font-bold tracking-[-0.02em] text-rs-text">
              {underlying.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-rs-text-secondary">
              {/* The list price is USD; the recurring figure is the payment
                  price in the processing currency. Both sit side by side so
                  this page can never imply the card is charged USD. */}
              <span>
                {underlying.priceMonthly == null
                  ? 'Custom pricing — Contact Sales'
                  : `$${underlying.priceMonthly}/mo list price`}
              </span>
              {underlying.priceMonthly != null && (
                <span className="text-rs-text-tertiary">· {billedInLabel(currency)}</span>
              )}
              {p.subscription_status && (
                <span className="rounded-full border border-rs-border-subtle px-2 py-0.5 text-[11px] capitalize">
                  {p.subscription_status}
                </span>
              )}
              {p.current_period_end && (underlying.priceMonthly ?? 0) > 0 && (
                <span>· Renews {formatDate(p.current_period_end)}</span>
              )}
            </div>
          </div>
          {isEnterprise(underlying.id) ? (
            <a
              href="mailto:sales@reliastra.com?subject=Enterprise%20plan"
              className="inline-flex shrink-0 items-center rounded-lg border border-rs-border bg-transparent px-4 py-2 text-sm font-medium text-rs-text transition-colors hover:bg-rs-hover"
            >
              Contact Sales
            </a>
          ) : (
            <RsButton onClick={() => openUpgrade()} className="shrink-0">
              {underlying.id === 'free' ? 'Upgrade' : 'Change plan'}
            </RsButton>
          )}
        </div>

        {/* The transparency triple, from backend figures: what the plan
            costs, what will actually be charged, who charges it. */}
        {underlying.id !== 'free' && !isEnterprise(underlying.id) && (
          <dl
            className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1.5 rounded-lg border border-rs-border-subtle bg-rs-base p-4 text-[13px] sm:grid-cols-3"
            data-testid="billing-transparency"
          >
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
                Product price
              </dt>
              <dd className="mt-0.5 font-mono text-rs-text">
                {formatMinorUnits(
                  ((p.billing_interval === 'annual'
                    ? underlying.priceAnnual
                    : underlying.priceMonthly) ?? 0) * 100,
                  currency.product_currency
                )}
                <span className="ml-1 text-[11px] text-rs-text-tertiary">
                  / {p.billing_interval === 'annual' ? 'yr' : 'mo'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
                {p.subscription_status === 'active' ? 'Next charge' : 'Actual charge'}
              </dt>
              <dd
                className="mt-0.5 font-mono font-semibold text-rs-text"
                data-testid="billing-next-charge"
              >
                {p.next_charge_amount_display ??
                  paymentAmountFor(
                    currency,
                    underlying.id,
                    p.billing_interval === 'annual' ? 'annual' : 'monthly'
                  ) ??
                  currencyLabel(currency)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
                Payment provider
              </dt>
              <dd className="mt-0.5 text-rs-text">{paymentProviderName(currency)}</dd>
            </div>
          </dl>
        )}

        {/* Currency disclosure sits with the plan it describes, before the
            button that would start a payment; the FX reference is labelled
            context that never determines a charge. */}
        <div className="mt-4" data-testid="billing-currency-notice">
          <PaymentCurrencyNotice info={currency} heading="Payment currency" />
          <FxReferencePanel info={currency} className="mt-3" />
        </div>

        {/* Evaluation entitlement overlay — full product, not a cheap tier */}
        {trialActive && !isPaid && (
          <div className="mt-5 rounded-lg border border-rs-brand/25 bg-rs-brand-subtle p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-rs-brand" />
              <p className="text-sm font-semibold text-rs-text">
                14-day full-access trial · Pro capabilities
              </p>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-rs-text-secondary">
              You have <strong>14 days of full access</strong> to explore RELIASTRA without feature
              restrictions — every capability across paid tiers is available. No card required.
              {daysLeft > 0 ? (
                <>
                  {' '}<strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong> remaining
                  {daysLeft <= 3 ? ' — trial ends soon' : ''}.
                </>
              ) : null}{' '}
              Your configuration and history will be preserved; paid capabilities simply pause at
              expiry until you upgrade.
            </p>
            <div className="rs-trial-progress-track mt-3 h-1.5 max-w-sm">
              <div
                className="rs-trial-progress-fill h-full rounded-full"
                data-urgent={daysLeft <= 3}
                style={{ width: `${Math.round(((trialLength - daysLeft) / trialLength) * 100)}%` }}
              />
            </div>
            {fallback && fallback.dependencies_configured > 0 && daysLeft <= 7 && daysLeft > 0 && (
              <div className="mt-4 rounded-lg border border-rs-border-subtle bg-rs-elevated p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                  What changes after evaluation
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                  <div className="rounded-md bg-rs-base p-3">
                    <p className="text-xs font-medium text-rs-text-tertiary">Your evaluation (now)</p>
                    <p className="mt-1 text-sm text-rs-text">
                      <strong>{fallback.dependencies_configured}</strong> dependencies monitored
                    </p>
                    <p className="text-xs text-rs-text-secondary">
                      {fallback.retention_days_current} days retention · Pro evidence · API access
                    </p>
                  </div>
                  <div className="rounded-md bg-rs-base p-3">
                    <p className="text-xs font-medium text-rs-text-tertiary">Free plan (after)</p>
                    <p className="mt-1 text-sm text-rs-text">
                      <strong>{fallback.free_dependency_limit}</strong> active ·{' '}
                      <span className="text-rs-text-secondary">
                        {Math.max(0, fallback.dependencies_configured - fallback.free_dependency_limit)} paused (preserved)
                      </span>
                    </p>
                    <p className="text-xs text-rs-text-secondary">
                      {fallback.retention_days_free} day retention · Basic alerts · No evidence/API
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-rs-text-tertiary">
                  No data is deleted. Paused dependencies keep their config and history and resume when you upgrade.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Evaluation ended on free — clear, meaningful fallback */}
        {!trialActive && underlying.id === 'free' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-rs-text">Your full-access evaluation has ended.</p>
            <p className="mt-1 text-[13px] leading-relaxed text-rs-text-secondary">
              Your account has returned to the Free plan. Your configuration and historical data are
              preserved. Some capabilities are now paused because they exceed Free-plan limits.
            </p>
            {fallback && (
              <ul className="mt-3 space-y-1.5 text-[13px] text-rs-text-secondary">
                <li>
                  • <strong className="text-rs-text">{fallback.dependencies_configured}</strong> dependencies configured ·{' '}
                  <strong className="text-rs-text">{Math.min(fallback.dependencies_configured, fallback.free_dependency_limit)}</strong>{' '}
                  active on Free ·{' '}
                  <strong className="text-rs-text">{fallback.dependencies_paused_if_expired}</strong> paused (preserved)
                </li>
                <li>
                  • Advanced evidence reports —{' '}
                  {fallback.evidence_available ? 'paused until upgrade' : 'unavailable on Free'}
                </li>
                <li>
                  • Extended retention — {fallback.retention_days_current} → {fallback.retention_days_free} day
                </li>
                <li>
                  • Team: {fallback.team_members} member{fallback.team_members === 1 ? '' : 's'} (Free allows{' '}
                  {fallback.team_free_limit})
                </li>
              </ul>
            )}
          </div>
        )}

        {current.id !== underlying.id && !trialActive && (
          <p className="mt-3 text-xs text-rs-text-tertiary">
            Effective limits currently follow {current.name}.
          </p>
        )}
      </section>

      {/* Usage against authoritative limits */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-rs-text">Monitored dependencies</div>
          <div
            className={cn(
              'font-mono text-sm',
              limit != null && used >= limit ? 'text-rs-degraded' : 'text-rs-text'
            )}
          >
            {limitIsCustom ? `${used} · Custom` : `${used} / ${limit}`}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-rs-border-subtle">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${limitIsCustom ? 100 : pct}%`, background: fill }}
          />
        </div>
        {!limitIsCustom && used >= limit && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rs-degraded/30 bg-rs-degraded/10 p-3">
            <p className="text-xs leading-relaxed text-rs-text-secondary">
              You&apos;ve reached your plan limit of {limit}.{' '}
              {nextPlan(underlying.id).name} raises it to {nextPlan(underlying.id).dependencies}.
            </p>
            <button
              type="button"
              onClick={() => openUpgrade('limit')}
              className="shrink-0 text-xs font-medium text-rs-brand hover:underline"
            >
              Upgrade
            </button>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-rs-border-subtle pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Check interval
            </dt>
            <dd className="mt-1 font-mono text-sm text-rs-text">
              {p.min_check_interval_seconds == null
                ? 'Custom'
                : p.min_check_interval_seconds >= 60
                  ? `${Math.round(p.min_check_interval_seconds / 60)} min`
                  : `${p.min_check_interval_seconds}s`}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Data retention
            </dt>
            <dd className="mt-1 font-mono text-sm text-rs-text">
              {retentionLabel(p.data_retention_days ?? current.retentionDays)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Team members
            </dt>
            <dd className="mt-1 font-mono text-sm text-rs-text">
              {(p.max_team_members ?? current.teamMembers) == null ? 'Unlimited' : p.max_team_members ?? current.teamMembers}
            </dd>
          </div>
        </dl>
      </section>

      {/* Payment method — no data source yet, so the honest state is rendered */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Payment method
            </div>
            <p className="mt-2 text-sm text-rs-text-secondary">
            Card details are held by {paymentProviderName(currency)}, never by RELIASTRA. No
            card on file — trials do not require one.
          </p>
          </div>
          <RsButton variant="secondary" onClick={() => openUpgrade()}>
            Add payment method
          </RsButton>
        </div>
      </section>

      {/* What this plan includes — mirrors backend PLAN_FEATURES semantics */}
      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <h2 className="text-sm font-semibold text-rs-text">
          {trialActive ? 'Included during your Pro trial' : `Included in ${underlying.name}`}
        </h2>
        {trialActive && (
          <p className="mt-1 text-xs text-rs-text-tertiary">
            On {underlying.name}: {getPlan('free').dependencies} dependencies ·{' '}
            {retentionLabel(getPlan('free').retentionDays)} retention. Trial restores
            Pro limits.
          </p>
        )}
        <ul className="mt-3 space-y-2.5">
          {[
            { label: `${limit} monitored dependencies`, ok: true },
            { label: `${retentionLabel(p.data_retention_days ?? current.retentionDays)} check-history retention`, ok: true },
            { label: 'Email alerts & basic incident detection', ok: true },
            { label: 'Evidence reports (PDF/JSON)', ok: getPlan(p.effective_plan ?? p.plan).evidence },
            { label: 'Deterministic vendor attribution', ok: getPlan(p.effective_plan ?? p.plan).attribution },
            { label: 'API access', ok: getPlan(p.effective_plan ?? p.plan).api },
            { label: 'Client workspaces & white-label', ok: current.clientGroups },
          ].map((f) => (
            <li key={f.label} className="flex items-center gap-2.5 text-sm">
              {f.ok ? (
                <CheckCircle2 size={16} className="shrink-0 text-rs-up" />
              ) : (
                <CircleDashed size={16} className="shrink-0 text-rs-text-tertiary" />
              )}
              <span className={f.ok ? 'text-rs-text' : 'text-rs-text-tertiary'}>{f.label}</span>
              {!f.ok && (
                <button
                  type="button"
                  onClick={() => openUpgrade()}
                  className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-rs-brand hover:underline"
                >
                  Unlock <ArrowUpRight size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Payment history — the charges as the provider settled them. Rows
          read from the persisted transaction (actual charged amount and
          currency) alongside the USD product price quoted at the time. */}
      <section className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-rs-text">Payment history</h2>
          <p className="text-[11px] text-rs-text-tertiary">
            Charged in {currencyLabel(currency)} · processed by {paymentProviderDisplay(currency)}
          </p>
        </div>
        {transactions.length > 0 ? (
          <div className="divide-y divide-rs-border-subtle">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-[13px]"
                data-testid={`transaction-row-${tx.reference}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-rs-text">
                    {tx.display_plan} ·{' '}
                    <span className="capitalize text-rs-text-secondary">{tx.billing_interval}</span>
                    {tx.status !== 'success' && (
                      <span
                        className={cn(
                          'ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          tx.status === 'refunded'
                            ? 'border-amber-300/60 text-amber-700 dark:text-amber-400'
                            : 'border-rose-300/60 text-rose-700 dark:text-rose-400'
                        )}
                      >
                        {tx.status}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-rs-text-tertiary">
                    {tx.paid_at ? formatDate(tx.paid_at) : formatDate(tx.created_at)} ·{' '}
                    <span className="font-mono">{tx.provider} ref {tx.reference}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold text-rs-text" title="Actual charge, as settled by the provider">
                    {tx.charged_amount_display}
                  </p>
                  {tx.product_price_display && tx.product_price_display !== tx.charged_amount_display && (
                    <p className="text-[11px] text-rs-text-tertiary">
                      product price {tx.product_price_display}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={32} />}
            title="No payments yet"
            body="Receipts appear here the moment a payment settles. Every entry shows the amount actually charged and the currency it was charged in — not a re-derived price."
            actionLabel="View plans"
            onAction={() => openUpgrade()}
            helpLabel="How does billing work?"
            onHelp={() => window.open('mailto:support@reliastra.com?subject=Billing%20question')}
          />
        )}
      </section>
    </div>
  );
}

/** Small shield line used under the history when the disclosure applies. */
export function PaymentHistoryFootnote() {
  return null;
}