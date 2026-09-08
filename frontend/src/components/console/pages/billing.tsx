'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { getPlan, isEnterprise, nextPlan, retentionLabel, intervalLabel } from '@/lib/dashboard/plans';
import { api } from '@/lib/dashboard/api';
import { keys, useBillingTransactions, useDependencies, usePlan } from '@/lib/dashboard/queries';
import { formatUtc } from '@/lib/dashboard/format';
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
import {
  Empty,
  Fact,
  Failure,
  PageHead,
  Row,
  RowsSkeleton,
  Section,
} from '@/components/console/primitives';

/**
 * Billing.
 *
 * Recomposed into the console language, with the money contract untouched:
 * every figure is a backend-resolved string, the product price and the actual
 * charge are always shown together with the currency each is in, and the
 * payment-confirmation banner restates what the gateway settled rather than
 * re-reading the catalogue. The transparency components are rendered inside a
 * `dark` scope because they carry their own light/dark palettes and the app
 * root does not set the class.
 */
export function BillingPage() {
  const { data: plan } = usePlan();
  const storePlan = useAppStore((s) => s.plan);
  const { currency: fallbackCurrency } = usePaymentCurrency();
  // A partial `payment` payload must not become the string "undefined" next to
  // a price. Only an object that actually carries a payment currency is used.
  const currency = plan?.payment?.payment_currency ? plan.payment : fallbackCurrency;
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: deps } = useDependencies();
  const {
    data: txData,
    isError: txError,
    isLoading: txLoading,
    refetch: refetchTx,
  } = useBillingTransactions();

  // Returned from the provider? Verify once, then restate the real charge.
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const checkedRef = useRef<string | null>(null);
  const [paid, setPaid] = useState<Awaited<ReturnType<typeof api.verifyTransaction>> | null>(null);

  useEffect(() => {
    const reference = searchParams.get('pay_ref') || searchParams.get('reference');
    if (!reference || checkedRef.current === reference) return;
    checkedRef.current = reference;
    // Deliberately no liveness flag: in StrictMode the cleanup lands before
    // the request resolves, and dropping a SUCCESSFUL verification would mean
    // the customer paid and saw nothing.
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
    window.history.replaceState(null, '', '/settings/billing');
  }, [searchParams, queryClient]);

  const p = plan ?? storePlan;

  if (!p) {
    return (
      <>
        <div className="border-b border-[var(--obc-line-2)] py-6">
          <div className="obc-skel h-6 w-40" />
          <div className="obc-skel mt-3 h-3 w-72" />
        </div>
        <div className="obc-section">
          <RowsSkeleton rows={4} cols={3} />
        </div>
      </>
    );
  }

  const current = getPlan(p.effective_plan ?? p.plan);
  const underlying = getPlan(p.plan);
  const used = deps?.length ?? 0;
  const limit = p.max_dependencies ?? current.dependencies;
  const limitIsCustom = limit == null;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const evaluationActive = (p.is_evaluation_active ?? p.is_trial_active) === true;
  const daysLeft = p.evaluation_days_remaining ?? p.trial_days_remaining ?? 0;
  const evaluationLength = p.trial_length_days ?? 14;
  const fallback = p.fallback_info ?? null;
  const isPaidPlan = underlying.id !== 'free';
  const transactions = txData?.items ?? [];
  const interval = p.billing_interval === 'annual' ? 'annual' : 'monthly';

  return (
    <>
      <PageHead
        title="Billing"
        meta={
          <>
            <Fact label="Plan" value={underlying.name} mono={false} />
            {p.subscription_status && (
              <Fact label="Subscription" value={p.subscription_status} mono={false} />
            )}
            <Fact
              label="Dependencies"
              value={limitIsCustom ? `${used} · custom limit` : `${used}/${limit}`}
              state={!limitIsCustom && limit != null && used >= limit ? 'warn' : undefined}
            />
            {p.current_period_end && (underlying.priceMonthly ?? 0) > 0 && (
              <Fact label="Renews" value={formatUtc(p.current_period_end, 'yyyy-MM-dd')} />
            )}
          </>
        }
        actions={
          isEnterprise(underlying.id) ? (
            <a href="mailto:sales@reliastra.com?subject=Enterprise%20plan" className="obc-btn">
              Contact sales
            </a>
          ) : (
            <button type="button" className="obc-btn obc-btn-primary" onClick={() => openUpgrade()}>
              {underlying.id === 'free' ? 'Upgrade' : 'Change plan'}
            </button>
          )
        }
      />

      {paid && (
        <section
          className="mt-5 border border-[var(--obc-ok)]/35 bg-[var(--obc-ok-wash)] px-4 py-4"
          data-testid="payment-confirmation"
          aria-live="polite"
        >
          <p className="obc-label text-[var(--obc-text-2)]">Payment confirmed. Plan active</p>
          <dl className="mt-3 grid gap-x-10 sm:grid-cols-2">
            <Row label="Plan" mono>
              {getPlan(paid.plan).name}
            </Row>
            <Row label="Payment provider" mono>
              {paid.payment_provider ?? paymentProviderName(currency)}
            </Row>
            <Row label="Product price" mono>
              {paid.product_price_display ?? 'n/a'}
            </Row>
            <Row label="Actual charge" mono>
              {paid.amount_display ??
                formatMinorUnits(paid.amount_minor, paid.currency ?? currency.payment_currency)}
            </Row>
          </dl>
          <p className="obc-mono mt-3 text-[var(--obc-text-4)]">
            reference {paid.reference} · recorded in payment history below
          </p>
        </section>
      )}

      <Section
        title="Current plan"
        hint={
          underlying.priceMonthly == null
            ? 'Custom pricing.'
            : `List price $${underlying.priceMonthly}/month. ${billedInLabel(currency)}.`
        }
      >
        {underlying.id !== 'free' && !isEnterprise(underlying.id) && (
          <dl
            className="grid gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] sm:grid-cols-3"
            data-testid="billing-transparency"
          >
            <div className="bg-[var(--obc-base)] p-4">
              <dt className="obc-label">Product price</dt>
              <dd className="obc-mono mt-2 text-[15px] text-[var(--obc-text)]">
                {formatMinorUnits(
                  ((interval === 'annual' ? underlying.priceAnnual : underlying.priceMonthly) ?? 0) *
                    100,
                  currency.product_currency
                )}
                <span className="obc-unit"> / {interval === 'annual' ? 'yr' : 'mo'}</span>
              </dd>
            </div>
            <div className="bg-[var(--obc-base)] p-4">
              <dt className="obc-label">
                {p.subscription_status === 'active' ? 'Next charge' : 'Actual charge'}
              </dt>
              <dd
                className="obc-mono mt-2 text-[15px] text-[var(--obc-text)]"
                data-testid="billing-next-charge"
              >
                {p.next_charge_amount_display ??
                  paymentAmountFor(currency, underlying.id, interval) ??
                  currencyLabel(currency)}
              </dd>
            </div>
            <div className="bg-[var(--obc-base)] p-4">
              <dt className="obc-label">Payment provider</dt>
              <dd className="mt-2 text-[13px] text-[var(--obc-text)]">
                {paymentProviderName(currency)}
              </dd>
            </div>
          </dl>
        )}

        {/* The disclosure components carry their own palettes; `dark` opts
            them into the variant that belongs in this console. */}
        <div className="dark mt-4" data-testid="billing-currency-notice">
          <PaymentCurrencyNotice info={currency} heading="Payment currency" />
          <FxReferencePanel info={currency} className="mt-3" />
        </div>

        {current.id !== underlying.id && !evaluationActive && (
          <p className="mt-3 text-[11.5px] text-[var(--obc-text-4)]">
            Effective limits currently follow {current.name}.
          </p>
        )}
      </Section>

      {evaluationActive && !isPaidPlan && (
        <Section
          title="Evaluation"
          hint="Full product access, no card required. Configuration and history are preserved at expiry."
        >
          <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] p-4">
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="obc-figure text-[var(--obc-signal)]">{daysLeft}</span>
              <span className="text-[13px] text-[var(--obc-text-2)]">
                day{daysLeft === 1 ? '' : 's'} remaining of {evaluationLength}
                {daysLeft <= 3 ? ', ends soon' : ''}
              </span>
            </p>
            <div
              className="mt-3 h-[3px] w-full max-w-sm bg-[var(--obc-line-2)]"
              role="img"
              aria-label={`${daysLeft} of ${evaluationLength} evaluation days remaining`}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.round(((evaluationLength - daysLeft) / evaluationLength) * 100)}%`,
                  background: daysLeft <= 3 ? 'var(--obc-crit)' : 'var(--obc-signal)',
                }}
              />
            </div>

            {fallback && fallback.dependencies_configured > 0 && daysLeft <= 7 && daysLeft > 0 && (
              <div className="mt-5 grid gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] sm:grid-cols-2">
                <div className="bg-[var(--obc-base)] p-4">
                  <p className="obc-label">During evaluation</p>
                  <dl className="mt-2">
                    <Row label="Dependencies monitored" mono>
                      {fallback.dependencies_configured}
                    </Row>
                    <Row label="Retention" mono>
                      {fallback.retention_days_current} days
                    </Row>
                    <Row label="Evidence records" mono>
                      included
                    </Row>
                  </dl>
                </div>
                <div className="bg-[var(--obc-base)] p-4">
                  <p className="obc-label">On Free, after expiry</p>
                  <dl className="mt-2">
                    <Row label="Dependencies active" mono>
                      {fallback.free_dependency_limit}
                    </Row>
                    <Row label="Dependencies paused" mono>
                      {Math.max(
                        0,
                        fallback.dependencies_configured - fallback.free_dependency_limit
                      )}
                    </Row>
                    <Row label="Retention" mono>
                      {fallback.retention_days_free} day
                      {fallback.retention_days_free === 1 ? '' : 's'}
                    </Row>
                  </dl>
                </div>
              </div>
            )}
            <p className="mt-3 text-[11.5px] text-[var(--obc-text-4)]">
              Nothing is deleted at expiry. Paused dependencies keep their configuration and history
              and resume on upgrade.
            </p>
          </div>
        </Section>
      )}

      {!evaluationActive && underlying.id === 'free' && (
        <Section title="Evaluation ended">
          <div className="border border-[var(--obc-warn)]/35 bg-[var(--obc-warn-wash)] px-4 py-4">
            <p className="text-[13px] text-[var(--obc-text)]">
              This workspace has returned to the Free plan. Configuration and historical data are
              preserved; capabilities beyond Free limits are paused.
            </p>
            {fallback && (
              <dl className="mt-3 max-w-xl">
                <Row label="Dependencies configured" mono>
                  {fallback.dependencies_configured}
                </Row>
                <Row label="Active on Free" mono>
                  {Math.min(fallback.dependencies_configured, fallback.free_dependency_limit)}
                </Row>
                <Row label="Paused (preserved)" mono>
                  {fallback.dependencies_paused_if_expired}
                </Row>
                <Row label="Retention" mono>
                  {fallback.retention_days_current} → {fallback.retention_days_free} days
                </Row>
                <Row label="Evidence records" mono>
                  {fallback.evidence_available ? 'paused until upgrade' : 'not on Free'}
                </Row>
                <Row label="Team members" mono>
                  {fallback.team_members} (Free allows {fallback.team_free_limit})
                </Row>
              </dl>
            )}
          </div>
        </Section>
      )}

      <Section title="Usage and limits" hint="Authoritative figures from your entitlement, not the catalogue.">
        <div className="border border-[var(--obc-line)] bg-[var(--obc-base)] p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="obc-label">Monitored dependencies</span>
            <span
              className="obc-mono"
              style={{
                color:
                  !limitIsCustom && limit != null && used >= limit
                    ? '#E3BE7A'
                    : 'var(--obc-text)',
              }}
            >
              {limitIsCustom ? `${used} · custom` : `${used} / ${limit}`}
            </span>
          </div>
          <div className="mt-2 h-[3px] w-full bg-[var(--obc-line-2)]">
            <div
              className="h-full"
              style={{
                width: `${limitIsCustom ? 100 : pct}%`,
                background: pct > 80 ? 'var(--obc-warn)' : 'var(--obc-text-4)',
              }}
            />
          </div>
          {!limitIsCustom && limit != null && used >= limit && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--obc-warn)]/35 bg-[var(--obc-warn-wash)] px-3 py-2.5">
              <p className="text-[12.5px] text-[var(--obc-text-2)]">
                Plan limit of {limit} reached. {nextPlan(underlying.id).name} raises it to{' '}
                {nextPlan(underlying.id).dependencies}.
              </p>
              <button
                type="button"
                className="obc-btn obc-btn-sm"
                onClick={() => openUpgrade('limit')}
              >
                Compare plans
              </button>
            </div>
          )}

          <dl className="mt-5 grid gap-x-10 border-t border-[var(--obc-line)] pt-1 sm:grid-cols-3">
            <Row label="Minimum check interval" mono>
              {p.min_check_interval_seconds == null
                ? 'custom'
                : intervalLabel(p.min_check_interval_seconds)}
            </Row>
            <Row label="Observation retention" mono>
              {retentionLabel(p.data_retention_days ?? current.retentionDays)}
            </Row>
            <Row label="Team members" mono>
              {(p.max_team_members ?? current.teamMembers) == null
                ? 'unlimited'
                : (p.max_team_members ?? current.teamMembers)}
            </Row>
          </dl>
        </div>
      </Section>

      <Section
        title="Included capabilities"
        hint={
          evaluationActive
            ? 'Available for the duration of your evaluation.'
            : `Granted by ${underlying.name}.`
        }
      >
        <ul className="max-w-2xl border border-[var(--obc-line)]">
          {[
            { label: `${limitIsCustom ? 'Custom' : limit} monitored dependencies`, ok: true },
            {
              label: `${retentionLabel(p.data_retention_days ?? current.retentionDays)} observation retention`,
              ok: true,
            },
            { label: 'Email alerts and incident detection', ok: true },
            { label: 'Evidence records', ok: current.evidence },
            { label: 'Deterministic vendor attribution', ok: current.attribution },
            { label: 'API access', ok: current.api },
            { label: 'Client workspaces and white-label', ok: current.clientGroups },
          ].map((f) => (
            <li
              key={f.label}
              className="flex items-center justify-between gap-4 border-b border-[var(--obc-line)] px-4 py-2.5 last:border-b-0"
            >
              <span
                className={
                  f.ok
                    ? 'text-[12.5px] text-[var(--obc-text-2)]'
                    : 'text-[12.5px] text-[var(--obc-text-4)]'
                }
              >
                {f.label}
              </span>
              <span className="shrink-0">
                {f.ok ? (
                  <span className="obc-mono text-[var(--obc-text-3)]">included</span>
                ) : (
                  <button
                    type="button"
                    className="obc-link text-[11.5px]"
                    onClick={() => openUpgrade()}
                  >
                    not included. Compare plans
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Payment method"
        hint={`Card details are held by ${paymentProviderName(currency)}, never by RELIASTRA.`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--obc-line)] bg-[var(--obc-base)] px-4 py-3.5">
          <p className="text-[12.5px] text-[var(--obc-text-3)]">
            No card on file. An evaluation does not require one.
          </p>
          <button type="button" className="obc-btn obc-btn-sm" onClick={() => openUpgrade()}>
            Add payment method
          </button>
        </div>
      </Section>

      <Section
        title="Payment history"
        hint={`Charged in ${currencyLabel(currency)} · processed by ${paymentProviderDisplay(currency)}. Each row is what the provider settled.`}
      >
        {txLoading ? (
          <RowsSkeleton rows={3} cols={3} />
        ) : txError && !transactions.length ? (
          <Failure
            title="Payment history unavailable"
            body="Your receipts exist and are unaffected; the console could not read them just now."
            onRetry={() => refetchTx()}
          />
        ) : transactions.length ? (
          <ul className="border border-[var(--obc-line)]">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                data-testid={`transaction-row-${tx.reference}`}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[var(--obc-line)] px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="text-[13px] text-[var(--obc-text)]">
                    {tx.display_plan}{' '}
                    <span className="text-[var(--obc-text-3)]">· {tx.billing_interval}</span>
                    {tx.status !== 'success' && (
                      <span
                        className="ml-2 text-[11.5px]"
                        style={{ color: tx.status === 'refunded' ? '#E3BE7A' : '#E58C85' }}
                      >
                        {tx.status}
                      </span>
                    )}
                  </span>
                  <span className="obc-mono mt-0.5 block text-[var(--obc-text-4)]">
                    {formatUtc(tx.paid_at ?? tx.created_at, 'yyyy-MM-dd HH:mm')} · {tx.provider} ref{' '}
                    {tx.reference}
                  </span>
                </span>
                <span className="text-right">
                  <span className="obc-mono block text-[var(--obc-text)]">
                    {tx.charged_amount_display}
                  </span>
                  {tx.product_price_display &&
                    tx.product_price_display !== tx.charged_amount_display && (
                      <span className="obc-mono block text-[var(--obc-text-4)]">
                        product price {tx.product_price_display}
                      </span>
                    )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="No payments recorded"
            body="Receipts appear when a payment settles. Each shows the amount and currency actually charged."
            action={
              <button type="button" className="obc-btn obc-btn-sm" onClick={() => openUpgrade()}>
                View plans
              </button>
            }
          />
        )}
      </Section>
    </>
  );
}
