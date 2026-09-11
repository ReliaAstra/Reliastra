'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/dashboard/api';
import { keys, usePlan, useDependencies, useBillingTransactions } from '@/lib/dashboard/queries';
import { getPlan, retentionLabel } from '@/lib/dashboard/plans';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import { formatMinorUnits, paymentAmountFor } from '@/lib/billing/currency';
import { COMMERCIAL_COPY, REFUND_POLICY_PATH } from '@/lib/billing/commercial-terms';
import { PageHead, Section, Row, Failure, RowsSkeleton } from '@/components/console/primitives';
import { formatUtc } from '@/lib/dashboard/format';
import type { BillingTransactionItem } from '@/lib/dashboard/types';

export function BillingPage() {
  const { data: plan, isError: planError, refetch: refetchPlan } = usePlan();
  const { data: deps } = useDependencies();
  const transactions = useBillingTransactions();
  const { currency: fallbackCurrency } = usePaymentCurrency();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const checked = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'resume' | null>(null);

  useEffect(() => {
    const ref = params.get('pay_ref') || params.get('reference');
    if (!ref || checked.current === ref) return;
    checked.current = ref;
    void api.verifyTransaction(ref).then((result) => {
      setConfirmation(
        result.verified
          ? `Payment confirmed · ${result.amount_display ?? formatMinorUnits(result.amount_minor, result.currency ?? 'NGN')}`
          : 'Payment confirmation pending'
      );
      void queryClient.invalidateQueries({ queryKey: keys.plan });
      void queryClient.invalidateQueries({ queryKey: keys.billingTransactions });
    }).catch(() =>
      setConfirmation('Unable to verify payment. Contact billing support with your payment reference.')
    );
  }, [params, queryClient]);

  if (planError && !plan) {
    return <Failure title="Billing unavailable" body="Unable to load your subscription." onRetry={() => void refetchPlan()} />;
  }
  if (!plan) {
    return <><PageHead title="Billing" /><RowsSkeleton rows={4} cols={3} /></>;
  }

  const current = getPlan(plan.plan);
  const effective = getPlan(plan.effective_plan ?? plan.plan);
  const currency = plan.payment?.payment_currency ? plan.payment : fallbackCurrency;
  const annual = plan.billing_interval === 'annual';
  const paid = current.id !== 'free' && current.id !== 'enterprise';
  const price = paymentAmountFor(currency, current.id, annual ? 'annual' : 'monthly');
  const evaluation = (plan.is_evaluation_active ?? plan.is_trial_active) === true;
  const limit = plan.max_dependencies ?? effective.dependencies;
  const used = deps?.length;
  const percentage = used != null && limit ? Math.min(100, used / limit * 100) : 0;
  const history = transactions.data?.items ?? [];
  const listUsd = formatMinorUnits((annual ? current.priceAnnual ?? 0 : current.priceMonthly ?? 0) * 100, 'USD');
  const checkoutHref = `/checkout?plan=pro&interval=${annual ? 'annual' : 'monthly'}`;
  const trialSummary = plan.trial_summary || COMMERCIAL_COPY.trialSummary;
  const cancellationSummary = plan.cancellation_summary || COMMERCIAL_COPY.cancellationSummary;
  const refundSummary = plan.refund_summary || COMMERCIAL_COPY.refundSummary;

  const runCancel = async () => {
    setBusy('cancel');
    setActionError(null);
    try {
      await api.cancelSubscription();
      setConfirmCancel(false);
      await queryClient.invalidateQueries({ queryKey: keys.plan });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel.');
    } finally {
      setBusy(null);
    }
  };

  const runResume = async () => {
    setBusy('resume');
    setActionError(null);
    try {
      await api.resumeSubscription();
      await queryClient.invalidateQueries({ queryKey: keys.plan });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to resume.');
    } finally {
      setBusy(null);
    }
  };

  const upgradeLabel = current.id === 'free' ? 'Subscribe to Pro' : 'Change plan';

  return <>
    <PageHead
      title="Billing"
      meta={<p className="text-[13px] text-[var(--obc-text-3)]">Subscription, payment method, invoices and cancellation.</p>}
      actions={
        current.id === 'enterprise'
          ? <a className="obc-btn" href="mailto:billing@reliastra.com">Contact billing</a>
          : <Link className="obc-btn obc-btn-primary" href={checkoutHref} data-testid="billing-upgrade">{upgradeLabel}</Link>
      }
    />
    {confirmation && (
      <p role="status" data-testid="payment-confirmation" className="mt-5 border border-[var(--obc-line)] p-4 text-[13px]">
        {confirmation}
      </p>
    )}
    {actionError && <p role="alert" className="mt-5 border border-[var(--obc-line)] p-4 text-[13px]">{actionError}</p>}

    <Section title="Current subscription">
      <div className="grid gap-8 border border-[var(--obc-line)] bg-[var(--obc-base)] p-5 sm:p-6 lg:grid-cols-[1fr_1fr]" data-testid="billing-plan">
        <div>
          <p className="obc-label">
            {plan.cancel_at_period_end
              ? 'Cancels at period end'
              : evaluation
                ? `${effective.name} evaluation`
                : plan.subscription_status ?? 'Current subscription'}
          </p>
          <h2 className="mt-3 text-[32px] font-medium tracking-[-0.04em]">
            {evaluation ? effective.name : current.name}
          </h2>
          <p className="obc-mono mt-3 text-[var(--obc-text)]" style={{ fontSize: paid ? 22 : 13 }}>
            {current.id === 'free'
              ? (evaluation ? 'No charge during evaluation' : 'No charge')
              : current.id === 'enterprise'
                ? 'Custom pricing'
                : price ?? listUsd}
            {paid && (price || listUsd) && (
              <span className="ml-2 text-[12px] text-[var(--obc-text-3)]">/ {annual ? 'year' : 'month'}</span>
            )}
          </p>
          {paid && (
            <p className="mt-2 text-[12px] text-[var(--obc-text-3)]">
              Product price {listUsd}.
              {currency.differs_from_product_currency
                ? ` Charged in ${currency.payment_currency} at the current exchange rate.`
                : null}
              {plan.next_charge_amount_display && !plan.cancel_at_period_end
                ? ` Next renewal ${plan.next_charge_amount_display}.`
                : null}
            </p>
          )}
        </div>
        <dl className="self-center">
          <Row label="Billing cycle">{paid ? (annual ? 'Annual' : 'Monthly') : 'n/a'}</Row>
          <Row label="Payment currency">{paid ? currency.payment_currency : 'n/a'}</Row>
          {plan.current_period_start && <Row label="Current period starts">{formatUtc(plan.current_period_start, 'dd MMM yyyy')}</Row>}
          {plan.current_period_end && <Row label="Current period ends">{formatUtc(plan.current_period_end, 'dd MMM yyyy')}</Row>}
          {evaluation && <Row label="Evaluation remaining">{plan.evaluation_days_remaining ?? plan.trial_days_remaining ?? 0} days</Row>}
          {evaluation && <Row label="Base plan">{current.name}</Row>}
          <Row label="Status">
            {plan.cancel_at_period_end
              ? 'Cancels at period end'
              : plan.subscription_status ?? (evaluation ? 'Evaluation' : 'Free')}
          </Row>
        </dl>
      </div>
      {evaluation && (
        <p className="mt-3 max-w-[72ch] text-[13px] leading-relaxed text-[var(--obc-text-3)]" data-testid="billing-trial">
          {trialSummary} After the trial, Pro is billed in NGN at the current exchange rate. Subscribing starts billing immediately.
        </p>
      )}
    </Section>

    <Section title="Usage">
      <div className="grid gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] sm:grid-cols-3">
        <div className="bg-[var(--obc-base)] p-5">
          <p className="obc-label">Monitors</p>
          <p className="obc-mono mt-3" style={{ fontSize: 22 }}>
            {used ?? 'n/a'} <span className="text-[13px] text-[var(--obc-text-3)]">/ {limit ?? 'custom'}</span>
          </p>
          {limit != null && used != null && (
            <progress aria-label="Monitor usage" value={percentage} max={100} className="mt-4 h-1 w-full accent-[var(--obc-signal)]" />
          )}
        </div>
        <div className="bg-[var(--obc-base)] p-5">
          <p className="obc-label">Observation retention</p>
          <p className="obc-mono mt-3" style={{ fontSize: 22 }}>{retentionLabel(plan.data_retention_days ?? effective.retentionDays)}</p>
        </div>
        <div className="bg-[var(--obc-base)] p-5">
          <p className="obc-label">Team member limit</p>
          <p className="obc-mono mt-3" style={{ fontSize: 22 }}>{plan.max_team_members ?? effective.teamMembers ?? 'Unlimited'}</p>
        </div>
      </div>
    </Section>

    <Section title="Payment method">
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[var(--obc-line)] px-5 py-4" data-testid="billing-payment-method">
        <div>
          <p className="text-[13px] text-[var(--obc-text)]">
            {plan.payment_method_display
              ? plan.payment_method_display
              : current.id === 'free'
                ? 'No payment method on file'
                : 'Payment method not on file'}
          </p>
          {plan.payment_method_exp_month && plan.payment_method_exp_year ? (
            <p className="mt-1 text-[12px] text-[var(--obc-text-3)]">
              Expires {String(plan.payment_method_exp_month).padStart(2, '0')}/{plan.payment_method_exp_year}
            </p>
          ) : null}
          <p className="mt-1 text-[12px] text-[var(--obc-text-3)]">
            {plan.billing_email ? `Receipts: ${plan.billing_email}` : 'Billing contact is the organization owner.'}
            {plan.organization_name ? ` · ${plan.organization_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {current.id !== 'enterprise' && (
            <Link className="obc-btn obc-btn-sm" href={checkoutHref}>Update payment method</Link>
          )}
          <a className="obc-btn obc-btn-sm" href="mailto:billing@reliastra.com">Billing support</a>
        </div>
      </div>
    </Section>

    <Section title="Invoices and receipts">
      {transactions.isLoading ? <RowsSkeleton rows={3} cols={5} /> : transactions.isError ? (
        <Failure title="History unavailable" body="Unable to load payments." onRetry={() => void transactions.refetch()} />
      ) : history.length === 0 ? (
        <p className="border border-[var(--obc-line)] p-5 text-[13px] text-[var(--obc-text-3)]">No payments recorded</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--obc-line)]" data-testid="billing-history">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">Recorded subscription payments</caption>
            <thead className="obc-label">
              <tr>
                {['Date', 'Description', 'Product', 'Charged', 'Status', 'Documents'].map((label) => (
                  <th scope="col" key={label} className="px-4 py-3 font-normal">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((tx) => (
                <HistoryRow key={tx.id} tx={tx} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>

    <Section title="Cancellation and refunds">
      <div className="border border-[var(--obc-line)] p-5 text-[13px] leading-relaxed text-[var(--obc-text-2)]" data-testid="billing-cancel-terms">
        <p>{cancellationSummary}</p>
        <p className="mt-3">{COMMERCIAL_COPY.cancellationAfterEffect}</p>
        <p className="mt-3">{refundSummary}</p>
        <p className="mt-3">
          <Link className="obc-link" href={REFUND_POLICY_PATH}>Refund policy</Link>
          {' · '}
          <Link className="obc-link" href="/terms">Terms of Service</Link>
        </p>
        {plan.can_cancel && !confirmCancel && (
          <button
            type="button"
            className="obc-btn obc-btn-sm mt-5"
            data-testid="cancel-subscription"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel subscription
          </button>
        )}
        {plan.can_cancel && confirmCancel && (
          <div className="mt-5 border-t border-[var(--obc-line)] pt-4">
            <p>
              Access continues until {plan.current_period_end ? formatUtc(plan.current_period_end, 'dd MMM yyyy') : 'the end of the paid period'}.
              This does not refund the current period.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="obc-btn obc-btn-sm"
                data-testid="confirm-cancel-subscription"
                disabled={busy === 'cancel'}
                onClick={() => void runCancel()}
              >
                {busy === 'cancel' ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
              <button type="button" className="obc-btn obc-btn-sm" onClick={() => setConfirmCancel(false)}>
                Keep subscription
              </button>
            </div>
          </div>
        )}
        {plan.can_resume && (
          <button
            type="button"
            className="obc-btn obc-btn-sm mt-5"
            data-testid="resume-subscription"
            disabled={busy === 'resume'}
            onClick={() => void runResume()}
          >
            {busy === 'resume' ? 'Resuming…' : 'Resume subscription'}
          </button>
        )}
      </div>
    </Section>
  </>;
}

function HistoryRow({ tx }: { tx: BillingTransactionItem }) {
  const [error, setError] = useState<string | null>(null);

  const openDoc = async (kind: 'invoice' | 'receipt', download: boolean) => {
    setError(null);
    try {
      await api.openBillingDocument(tx.id, kind, download);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open document.');
    }
  };

  const paid = tx.status === 'success';
  return (
    <tr className="border-t border-[var(--obc-line)]" data-testid={`transaction-row-${tx.reference}`}>
      <td className="whitespace-nowrap px-4 py-4">{formatUtc(tx.paid_at ?? tx.created_at, 'dd MMM yyyy')}</td>
      <td className="px-4 py-4">
        <span>{tx.display_plan} · {tx.billing_interval}</span>
        <span className="obc-mono mt-1 block max-w-[220px] break-all text-[var(--obc-text-4)]">{tx.reference}</span>
        {tx.invoice_number ? <span className="mt-1 block text-[11px] text-[var(--obc-text-4)]">{tx.invoice_number}</span> : null}
        {error ? <span className="mt-1 block text-[11px]">{error}</span> : null}
      </td>
      <td className="obc-mono whitespace-nowrap px-4 py-4">{tx.product_price_display ?? '—'}</td>
      <td className="obc-mono whitespace-nowrap px-4 py-4">{tx.charged_amount_display}</td>
      <td className="px-4 py-4 capitalize">{tx.status === 'success' ? 'Paid' : tx.status}</td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="obc-link text-[12px]" data-testid={`invoice-view-${tx.reference}`} onClick={() => void openDoc('invoice', false)}>
            View invoice
          </button>
          <button type="button" className="obc-link text-[12px]" data-testid={`invoice-download-${tx.reference}`} onClick={() => void openDoc('invoice', true)}>
            Download
          </button>
          {paid && (
            <>
              <button type="button" className="obc-link text-[12px]" data-testid={`receipt-view-${tx.reference}`} onClick={() => void openDoc('receipt', false)}>
                View receipt
              </button>
              <button type="button" className="obc-link text-[12px]" data-testid={`receipt-download-${tx.reference}`} onClick={() => void openDoc('receipt', true)}>
                Receipt
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
