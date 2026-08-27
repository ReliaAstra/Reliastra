'use client';

import { useAppStore } from '@/stores/app-store';
import { getPlan } from '@/lib/dashboard/plans';
import { useDependencies, usePlan } from '@/lib/dashboard/queries';
import { formatDate } from '@/lib/dashboard/format';
import { mockInvoices, mockPayment } from '@/lib/dashboard/mock';
import { RsButton } from '../ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '../ui/empty-state';
import { FileText } from 'lucide-react';

export function BillingPage() {
  const { data: plan } = usePlan();
  const storePlan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const { data: deps } = useDependencies();
  const current = getPlan(plan?.plan ?? storePlan?.plan);
  const used = deps?.length ?? 0;
  const limit = current.dependencies;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const fill = pct > 80 ? '#F59E0B' : '#2563EB';
  const payment = mockPayment;
  const invoices = mockInvoices;

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">Billing</h1>
        <p className="mt-1.5 text-sm text-rs-text-tertiary">Plan, usage, and invoices.</p>
      </div>

      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Current plan
            </div>
            <div className="mt-2 font-mono text-[32px] font-bold tracking-[-0.02em] text-rs-text">
              {current.name}
            </div>
            <div className="mt-1 text-sm text-rs-text-secondary">
              ${current.priceMonthly}/mo
              {storePlan?.current_period_end && (
                <> · Renews {formatDate(storePlan.current_period_end)}</>
              )}
            </div>
          </div>
          <RsButton onClick={() => openUpgrade()}>
            {current.id === 'free' ? 'Upgrade' : 'Manage'}
          </RsButton>
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-rs-text">Dependencies monitored</div>
          <div className="font-mono text-sm text-rs-text">
            {used} / {limit}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-rs-border-subtle">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-rs-text-tertiary">
              Payment method
            </div>
            {payment ? (
              <p className="mt-2 font-mono text-sm text-rs-text">
                {payment.brand} •••• {payment.last4} · {payment.exp_month}/{payment.exp_year}
              </p>
            ) : (
              <p className="mt-2 text-sm text-rs-text-secondary">No card on file. Trials do not require a card.</p>
            )}
          </div>
          <RsButton variant="secondary">Update</RsButton>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-rs-text">Invoices</h2>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            title="No invoices yet"
            body="Invoices appear after a paid subscription is billed."
            actionLabel="View plans"
            onAction={() => openUpgrade()}
            helpLabel="How does billing work?"
            onHelp={() => window.open('mailto:support@reliastra.com?subject=Billing%20question')}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
            <table className="w-full">
              <thead>
                <tr className="h-11">
                  {['Date', 'Amount', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-rs-text-tertiary">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.id} className={cn('h-14', i !== invoices.length - 1 && 'border-b border-rs-border-subtle')}>
                    <td className="px-4 text-sm text-rs-text">{formatDate(inv.date)}</td>
                    <td className="px-4 font-mono text-sm text-rs-text">${inv.amount_usd}</td>
                    <td className="px-4 text-sm capitalize text-rs-text-secondary">{inv.status}</td>
                    <td className="px-4 text-right text-sm text-rs-text-accent">Download PDF</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
