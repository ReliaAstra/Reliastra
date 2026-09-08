import Link from 'next/link';
import { PlanMatrix } from '@/components/site/plan-matrix';
import { CurrencyFootnote } from '@/components/site/billing-disclosure';
import { PUBLIC_ROUTES } from '@/lib/routes';



/**
 * 11 · Pricing on the homepage.
 *
 * A summary, not a second pricing page: plan, price, the limits that decide
 * the choice, the amount actually charged, and one link to the full terms.
 * Three columns of type separated by rules, not three glowing cards.
 *
 * The columns come from the same `PlanMatrix` the `/pricing` page renders, so
 * the two surfaces cannot drift.
 */
export function PricingSummary() {
  return (
    <section
      id="pricing"
      className="ob-section border-t border-[var(--ob-line)] bg-[var(--ob-void)]"
      aria-labelledby="pricing-title"
    >
      <div className="ob-container">
        <div className="flex flex-col gap-6 pb-9 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5">
            <p className="ob-label flex items-center gap-3">
              <span className="text-[var(--ob-signal)]">10</span>
              <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
              Pricing
            </p>
            <h2 id="pricing-title" className="ob-h2 max-w-[16ch]">
              Three plans. Enforced server-side.
            </h2>
          </div>
          <p className="ob-body max-w-[44ch]">
            14-day Pro trial on every new organization. No payment method
            required.
          </p>
        </div>

        <PlanMatrix />

        <div className="flex flex-col gap-5 border-t border-[var(--ob-line)] pt-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <CurrencyFootnote />
          <Link
            href={PUBLIC_ROUTES.pricing}
            className="ob-btn ob-btn-outline ob-btn-sm shrink-0"
          >
            Full pricing and terms
          </Link>
        </div>
      </div>
    </section>
  );
}
