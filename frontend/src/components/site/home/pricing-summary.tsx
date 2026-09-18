import Link from 'next/link';
import { Eyebrow } from '@/components/site/primitives';
import { CurrencyFootnote } from '@/components/site/billing-disclosure';
import { getPlan } from '@/lib/dashboard/plans';
import { dependencyLabel, intervalLabel, retentionLabel } from '@/lib/dashboard/plans';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * 10 · Pricing, on the homepage.
 *
 * One plan, one number, four limits, and a link. The previous version rendered
 * the plan matrix — a capability table built for a plan ladder — which is the
 * wrong instrument for a product that has exactly one plan and no upgrade
 * path to compare against.
 *
 * The limits are read from the same plan metadata the console and the pricing
 * page use, so this section cannot advertise a number the backend does not
 * enforce.
 */
export function PricingSummary() {
  const plan = getPlan('pro');
  const limits: [string, string][] = [
    ['Dependencies', dependencyLabel(plan.dependencies)],
    ['Check interval', intervalLabel(plan.minIntervalSeconds)],
    ['Retention', retentionLabel(plan.retentionDays)],
  ];

  return (
    <section
      id="pricing"
      className="ob-section border-t border-[var(--ob-line)] bg-[var(--ob-base)]"
      aria-labelledby="pricing-title"
    >
      <div className="ob-container">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="08">Pricing</Eyebrow>
            <h2 id="pricing-title" className="ob-h2 max-w-[16ch]">
              One engineer. One plan. $9 a month.
            </h2>
            <p className="ob-body-lg max-w-[46ch]">
              Every capability the product has, on every account. No plan
              ladder, no seats, no annual negotiation, and no tier where the
              evidence gets better.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start the trial
              </Link>
              <Link href={PUBLIC_ROUTES.pricing} className="ob-btn ob-btn-outline">
                Terms and currency
              </Link>
            </div>
          </div>

          <div className="flex flex-col">
            <p className="ob-label mb-5">The plan</p>
            <div className="flex items-baseline gap-3 border-t border-[var(--ob-line)] pt-6">
              <span className="ob-figure">$9</span>
              <span className="ob-label">/ month · USD</span>
            </div>
            <p className="ob-small mt-3">
              14-day trial on every new account. No payment method required to
              start, and nothing that expires into a locked account.
            </p>

            <dl className="mt-8 flex flex-col">
              {limits.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-6 border-t border-[var(--ob-line)] py-4"
                >
                  <dt className="ob-label">{label}</dt>
                  <dd className="ob-mono text-[12.5px] text-[var(--ob-text-2)]">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 border-t border-[var(--ob-line)] pt-6">
              <CurrencyFootnote />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
