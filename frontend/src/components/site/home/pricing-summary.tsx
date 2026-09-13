import Link from 'next/link';
import { PlanMatrix } from '@/components/site/plan-matrix';
import { CurrencyFootnote } from '@/components/site/billing-disclosure';
import { PUBLIC_ROUTES } from '@/lib/routes';
import { Eyebrow } from '@/components/site/primitives';


/**
 * 12 · Pricing on the homepage. The index is the section's position in
 * `HomeLanding`'s order, so it is stated once here rather than being re-derived
 * by whoever notices that two sections are numbered 10.
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
            <Eyebrow index="12">Pricing</Eyebrow>
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
