'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ALL_PLANS, getPlan, type PlanMeta } from '@/lib/dashboard/plans';
import { planCta, planLimits } from '@/components/site/plan-data';
import { PlanChargeSummary } from '@/components/site/billing-disclosure';
import { cn } from '@/lib/utils';

export type BillingInterval = 'monthly' | 'annual';

function priceFor(p: PlanMeta, interval: BillingInterval) {
  if (p.priceMonthly === null) return null;
  return interval === 'annual' ? p.priceAnnual : p.priceMonthly;
}

/**
 * The plan columns, shared by the homepage summary and `/pricing`.
 *
 * One implementation, two placements - so the price a visitor sees on the
 * homepage and the price on the pricing page can never disagree.
 *
 * Columns, not cards: hairline rules separate the plans and the type does the
 * ranking. The only colour in the block is the accent on the recommended
 * plan's badge and CTA.
 *
 * Client-side only because of the interval toggle and the backend-resolved
 * charge currency. Everything else about the block is static.
 */
export function PlanMatrix({
  showCharges = true,
  className,
}: {
  /** Render the per-plan transparency triple (list price / charge / provider). */
  showCharges?: boolean;
  className?: string;
}) {
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const groupId = useId();

  return (
    <div className={className}>
      {/* Interval control */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--ob-line)] pb-5">
        <span id={groupId} className="ob-label">
          Billing interval
        </span>
        <div
          role="group"
          aria-labelledby={groupId}
          className="inline-flex items-stretch border border-[var(--ob-line-2)]"
        >
          {(
            [
              ['monthly', 'Monthly'],
              ['annual', 'Annual'],
            ] as const
          ).map(([value, label]) => {
            const active = interval === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setInterval(value)}
                className={cn(
                  'px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors',
                  active
                    ? 'bg-[var(--ob-signal)] text-[var(--ob-void)]'
                    : 'text-[var(--ob-text-3)] hover:text-[var(--ob-text)]'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="ob-small">
          {interval === 'annual'
            ? 'Annual plans include two months.'
            : 'Switch to annual to include two months.'}
        </p>
      </div>

      <div className="grid lg:grid-cols-3">
        {ALL_PLANS.map((id, i) => {
          const p = getPlan(id);
          const cta = planCta(p);
          const price = priceFor(p, interval);
          const isPaid = price !== null && price > 0;

          return (
            <div
              key={p.id}
              data-testid={`pricing-card-${p.id}`}
              className={cn(
                'flex flex-col gap-7 py-10 lg:px-10',
                i === 0 && 'lg:pl-0',
                i === ALL_PLANS.length - 1 && 'lg:pr-0',
                i > 0 &&
                  'border-t border-[var(--ob-line)] lg:border-l lg:border-t-0'
              )}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <h3 className="ob-h3">{p.name}</h3>
                  {p.badge && (
                    <span className="ob-label text-[var(--ob-signal)]">
                      {p.badge}
                    </span>
                  )}
                </div>

                <p className="ob-figure" data-testid={`pricing-price-${p.id}`}>
                  {price === null ? (
                    <span className="text-[0.46em] tracking-[-0.01em]">
                      Custom pricing
                    </span>
                  ) : (
                    <>
                      ${price}
                      <span className="ml-1 text-[0.42em] font-normal tracking-normal text-[var(--ob-text-4)]">
                        {interval === 'annual' ? '/year' : '/month'}
                      </span>
                    </>
                  )}
                </p>

                <p className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                  {p.tagline}
                </p>
              </div>

              <dl className="flex flex-col">
                {planLimits(p).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 border-t border-[var(--ob-line)] py-2.5"
                  >
                    <dt className="ob-label">{label}</dt>
                    <dd className="ob-mono text-[var(--ob-text-2)]">{value}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 border-t border-[var(--ob-line)] py-2.5">
                  <dt className="ob-label">Alerts</dt>
                  <dd className="ob-mono text-[var(--ob-text-2)]">{p.alerts}</dd>
                </div>
              </dl>

              {/* The amount that will actually leave the customer's account.
                  Resolved by the backend, never computed in the browser. */}
              {showCharges && isPaid && (
                <PlanChargeSummary
                  plan={p.id}
                  interval={interval}
                  productPrice={`$${price}.00 (USD)`}
                />
              )}

              <div className="mt-auto" data-testid={`pricing-cta-${p.id}`}>
                <Link
                  href={cta.href}
                  className={cn(
                    'ob-btn ob-btn-block',
                    p.badge ? 'ob-btn-signal' : 'ob-btn-outline'
                  )}
                >
                  {cta.label}
                </Link>
                {p.isEnterprise && (
                  <p className="ob-small mt-3">
                    Scoped with you: retention, regions, seats and contractual
                    terms.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
