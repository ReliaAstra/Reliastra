'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { api } from '@/lib/dashboard/api';
import { keys, usePlan, useDependencies, useBillingTransactions } from '@/lib/dashboard/queries';
import { getPlan, retentionLabel } from '@/lib/dashboard/plans';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';
import { formatMinorUnits, paymentAmountFor } from '@/lib/billing/currency';
import { PageHead, Section, Row, Failure, RowsSkeleton } from '@/components/console/primitives';
import { formatUtc } from '@/lib/dashboard/format';

export function BillingPage() {
  const { data: plan, isError: planError, refetch: refetchPlan } = usePlan();
  const { data: deps } = useDependencies();
  const transactions = useBillingTransactions();
  const { currency: fallbackCurrency } = usePaymentCurrency();
  const openUpgrade = useAppStore(s => s.openUpgrade);
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const checked = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  useEffect(() => {
    const ref = params.get('pay_ref') || params.get('reference');
    if (!ref || checked.current === ref) return;
    checked.current = ref;
    void api.verifyTransaction(ref).then(result => {
      setConfirmation(result.verified ? `Payment confirmed · ${result.amount_display ?? formatMinorUnits(result.amount_minor, result.currency ?? 'NGN')}` : 'Payment confirmation pending');
      void queryClient.invalidateQueries({ queryKey: keys.plan });
      void queryClient.invalidateQueries({ queryKey: keys.billingTransactions });
    }).catch(() => setConfirmation('Unable to verify payment. Contact billing support with your payment reference.'));
  }, [params, queryClient]);

  if (planError && !plan) return <Failure title="Billing unavailable" body="Unable to load your subscription." onRetry={() => void refetchPlan()} />;
  if (!plan) return <><PageHead title="Billing" /><RowsSkeleton rows={4} cols={3} /></>;
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

  return <>
    <PageHead title="Billing" meta={<p className="text-[13px] text-[var(--obc-text-3)]">Manage your plan and payments.</p>}
      actions={current.id === 'enterprise' ? <a className="obc-btn" href="mailto:billing@reliastra.com">Contact billing</a> : <button className="obc-btn obc-btn-primary" onClick={() => openUpgrade()}>{current.id === 'free' ? 'Upgrade plan' : 'Change plan'}</button>} />
    {confirmation && <p role="status" className="mt-5 border border-[var(--obc-line)] p-4 text-[13px]">{confirmation}</p>}

    <Section title="Current plan">
      <div className="grid gap-8 border border-[var(--obc-line)] bg-[var(--obc-base)] p-5 sm:p-6 lg:grid-cols-[1fr_1fr]" data-testid="billing-plan">
        <div>
          <p className="obc-label">{evaluation ? `${effective.name} evaluation` : plan.subscription_status ?? 'Current subscription'}</p>
          <h2 className="mt-3 text-[32px] font-medium tracking-[-0.04em]">{evaluation ? effective.name : current.name}</h2>
          <p className="obc-mono mt-3 text-[var(--obc-text)]" style={{ fontSize: paid ? 22 : 13 }}>
            {current.id === 'free' ? (evaluation ? 'No charge during evaluation' : 'No charge') : current.id === 'enterprise' ? 'Custom pricing' : price ?? 'Price unavailable'}
            {paid && price && <span className="ml-2 text-[12px] text-[var(--obc-text-3)]">/ {annual ? 'year' : 'month'}</span>}
          </p>
          {paid && currency.differs_from_product_currency && <p className="mt-2 text-[12px] text-[var(--obc-text-3)]">USD list price: {formatMinorUnits((annual ? current.priceAnnual ?? 0 : current.priceMonthly ?? 0) * 100, 'USD')}. Charged at the published {currency.payment_currency} price.</p>}
        </div>
        <dl className="self-center">
          <Row label="Billing cycle">{paid ? (annual ? 'Annual' : 'Monthly') : '—'}</Row>
          <Row label="Payment currency">{paid ? currency.payment_currency : '—'}</Row>
          {plan.current_period_end && <Row label="Current period ends">{formatUtc(plan.current_period_end, 'dd MMM yyyy')}</Row>}
          {evaluation && <Row label="Evaluation remaining">{plan.evaluation_days_remaining ?? plan.trial_days_remaining ?? 0} days</Row>}
          {evaluation && <Row label="Base plan">{current.name}</Row>}
          <Row label="Status">{plan.subscription_status ?? (evaluation ? 'Evaluation' : 'Free')}</Row>
        </dl>
      </div>
    </Section>

    <Section title="Usage">
      <div className="grid gap-px border border-[var(--obc-line)] bg-[var(--obc-line)] sm:grid-cols-3">
        <div className="bg-[var(--obc-base)] p-5">
          <p className="obc-label">Monitors</p><p className="obc-mono mt-3" style={{ fontSize: 22 }}>{used ?? '—'} <span className="text-[13px] text-[var(--obc-text-3)]">/ {limit ?? 'custom'}</span></p>
          {limit != null && used != null && <progress aria-label="Monitor usage" value={percentage} max={100} className="mt-4 h-1 w-full accent-[var(--obc-signal)]" />}
        </div>
        <div className="bg-[var(--obc-base)] p-5"><p className="obc-label">Observation retention</p><p className="obc-mono mt-3" style={{ fontSize: 22 }}>{retentionLabel(plan.data_retention_days ?? effective.retentionDays)}</p></div>
        <div className="bg-[var(--obc-base)] p-5"><p className="obc-label">Team member limit</p><p className="obc-mono mt-3" style={{ fontSize: 22 }}>{plan.max_team_members ?? effective.teamMembers ?? 'Unlimited'}</p></div>
      </div>
    </Section>

    <Section title="Payment method">
      <div className="flex flex-wrap items-center justify-between gap-4 border border-[var(--obc-line)] px-5 py-4">
        <p className="text-[13px] text-[var(--obc-text-3)]">{current.id === 'free' ? 'No payment method required' : 'Payment method details unavailable'}</p>
        <a className="obc-btn obc-btn-sm" href="mailto:billing@reliastra.com">Billing support</a>
      </div>
    </Section>

    <Section title="Billing history">
      {transactions.isLoading ? <RowsSkeleton rows={3} cols={4} /> : transactions.isError ?
        <Failure title="History unavailable" body="Unable to load payments." onRetry={() => void transactions.refetch()} /> :
        history.length === 0 ? <p className="border border-[var(--obc-line)] p-5 text-[13px] text-[var(--obc-text-3)]">No payments recorded</p> :
        <div className="overflow-x-auto border border-[var(--obc-line)]">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">Recorded subscription payments</caption>
            <thead className="obc-label"><tr>{['Date', 'Description', 'Amount', 'Status'].map(label => <th scope="col" key={label} className="px-4 py-3 font-normal">{label}</th>)}</tr></thead>
            <tbody>{history.map(tx => <tr key={tx.id} className="border-t border-[var(--obc-line)]" data-testid={`transaction-row-${tx.reference}`}>
              <td className="whitespace-nowrap px-4 py-4">{formatUtc(tx.paid_at ?? tx.created_at, 'dd MMM yyyy')}</td>
              <td className="px-4 py-4"><span>{tx.display_plan} · {tx.billing_interval}</span><span className="obc-mono mt-1 block max-w-[220px] break-all text-[var(--obc-text-4)]">{tx.reference}</span></td>
              <td className="obc-mono whitespace-nowrap px-4 py-4">{tx.charged_amount_display}</td><td className="px-4 py-4 capitalize">{tx.status === 'success' ? 'Paid' : tx.status}</td>
            </tr>)}</tbody>
          </table>
        </div>}
    </Section>
    {paid && <div className="mb-8 border-t border-[var(--obc-line)] pt-5"><a className="obc-link text-[12px]" href="mailto:billing@reliastra.com?subject=Subscription%20management">Request subscription changes</a></div>}
  </>;
}
