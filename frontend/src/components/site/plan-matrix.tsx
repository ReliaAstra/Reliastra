'use client';

import Link from 'next/link';
import { PlanChargeSummary } from '@/components/site/billing-disclosure';
import { getPlan, type PlanMeta } from '@/lib/dashboard/plans';
import { planCta, planLimits } from '@/components/site/plan-data';
import { cn } from '@/lib/utils';

/**
 * The plan block, shared by the homepage summary and `/pricing`.
 *
 * The commercial model is one paid product - Developer, $9/month, monthly
 * billing only - so there is no interval toggle and no plan comparison. The
 * block renders that one plan from the same `lib/dashboard/plans` metadata
 * the console and the checkout read, so the price can never disagree with
 * what the backend charges.
 */
export function PlanMatrix({
  showCharges = true,
  className,
}: {
  /** Render the transparency triple (list price / charge / provider). */
  showCharges?: boolean;
  className?: string;
}) {
  const p: PlanMeta = getPlan('pro');
  const cta = planCta(p);
  const price = p.priceMonthly;

  return (
    <div className={className}>
      <div className="grid lg:grid-cols-2">
        <div className="flex flex-col gap-7 py-10 lg:pr-12">
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h3 className="ob-h3">{p.name}</h3>
            </div>

            <p className="ob-figure" data-testid="pricing-price-pro">
              ${price}
              <span className="ml-1 text-[0.42em] font-normal tracking-normal text-[var(--ob-text-4)]">
                /month
              </span>
            </p>

            <p className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
              {p.tagline}
            </p>
          </div>

          <div className="mt-auto flex flex-col gap-3">
            <Link
              href={cta.href}
              className="ob-btn ob-btn-block ob-btn-signal"
              data-testid="pricing-cta-pro"
            >
              {cta.label}
            </Link>
            <p className="ob-small">
              14-day trial. No payment method required. After the trial, an
              account without a subscription keeps running on reduced limits.
            </p>
          </div>
        </div>

        <div
          className="flex flex-col gap-7 border-t border-[var(--ob-line)] py-10 lg:border-l lg:border-t-0 lg:pl-12"
          data-testid="pricing-limits-pro"
        >
          <dl className="flex flex-col">
            {planLimits(p).map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-t border-[var(--ob-line)] py-2.5 first:border-t-0"
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
          {showCharges && (
            <PlanChargeSummary
              plan={p.id}
              interval="monthly"
              productPrice={`$${price}.00 (USD)`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
