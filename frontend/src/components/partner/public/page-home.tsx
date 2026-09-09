'use client';

import Link from 'next/link';
import { partnerUrl } from '@/lib/routes';

/**
 * Partner program overview.
 *
 * Five blocks: what the program is, what a partner receives, the commission
 * terms as the backend enforces them, who it is for, and one action. Every
 * figure on this page mirrors backend configuration (PARTNER_COMMISSION_RATE,
 * PARTNER_COMMISSION_HOLD_DAYS, PARTNER_MINIMUM_PAYOUT_MINOR); nothing here
 * is a target or an aspiration.
 */
export function PageHome() {
  return (
    <div className="bg-[var(--ob-void)]">
      {/* Hero */}
      <section className="border-b border-[var(--ob-line)]">
        <div className="ob-container py-16 md:py-24">
          <p className="ob-label">Partner program</p>
          <h1 className="ob-h1 mt-5 max-w-[16ch]">Refer the organizations you advise.</h1>
          <p className="ob-lede mt-6">
            Recurring commission on every subscription attributed to your link.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={partnerUrl('signup')} className="ob-btn ob-btn-signal">
              Sign up
            </Link>
            <Link href={partnerUrl('commission')} className="ob-btn ob-btn-outline">
              Commission terms
            </Link>
          </div>
        </div>
      </section>

      {/* Terms */}
      <section className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <div className="ob-container py-14 md:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div>
              <p className="ob-label">Commission</p>
              <h2 className="ob-h2 mt-4 max-w-[14ch]">One rate. Recurring.</h2>
              <p className="mt-8 flex items-baseline gap-3">
                <span className="text-[56px] font-semibold leading-none tracking-[-0.03em] text-[var(--ob-text)]">
                  30%
                </span>
                <span className="ob-body">of each subscription payment</span>
              </p>
            </div>
            <dl className="flex flex-col">
              {[
                ['Attribution', 'The referral code on your link, replayed at signup.'],
                ['Duration', 'For as long as the referred organization pays.'],
                ['Hold', '30 days after a payment settles.'],
                ['Minimum payout', '$50 (USD 5,000 minor units).'],
                ['Destination changes', '24-hour cooldown before the next payout.'],
                ['Excluded', 'Self-referrals, refunded payments, fraudulent signups.'],
              ].map(([term, body]) => (
                <div
                  key={term}
                  className="grid gap-2 border-t border-[var(--ob-line)] py-4 sm:grid-cols-[minmax(150px,200px)_1fr] sm:gap-8"
                >
                  <dt className="ob-label pt-1">{term}</dt>
                  <dd className="text-[14.5px] leading-[1.65] text-[var(--ob-text-2)]">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="ob-small mt-8">
            Example: a $19 Pro subscription earns $5.70 per month. Binding terms are in the{' '}
            <Link href={`/partner/terms`} className="ob-link">
              partner agreement
            </Link>
            .
          </p>
        </div>
      </section>

      {/* What you receive */}
      <section className="border-b border-[var(--ob-line)]">
        <div className="ob-container py-14 md:py-20">
          <p className="ob-label">Partner account</p>
          <h2 className="ob-h2 mt-4 max-w-[16ch]">What you receive.</h2>
          <ul className="mt-10 grid gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Referral link', 'One code, one link, tracked from click to subscription.'],
              ['Dashboard', 'Referrals, commission status and payout history.'],
              ['Payouts', 'Requested from the dashboard once the balance clears the minimum.'],
              ['Support', 'A partner support channel for attribution and payout questions.'],
            ].map(([term, body]) => (
              <li key={term} className="border-t border-[var(--ob-line)] pt-4">
                <p className="text-[14.5px] font-semibold text-[var(--ob-text)]">{term}</p>
                <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Fit */}
      <section className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <div className="ob-container py-14 md:py-20">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <p className="ob-label">A fit</p>
              <ul className="mt-5 flex flex-col">
                {[
                  'Consultancies and agencies that run client infrastructure',
                  'Technical publishers covering reliability, cloud or security',
                  'Advisors who recommend tooling to engineering teams',
                ].map((t) => (
                  <li
                    key={t}
                    className="border-t border-[var(--ob-line)] py-3.5 text-[14.5px] text-[var(--ob-text-2)]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="ob-label">Not a fit</p>
              <ul className="mt-5 flex flex-col">
                {[
                  'Coupon, cashback or bulk affiliate sites',
                  'Audiences with no engineering or operations role',
                  'Referring your own organization',
                ].map((t) => (
                  <li
                    key={t}
                    className="border-t border-[var(--ob-line)] py-3.5 text-[14.5px] text-[var(--ob-text-3)]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="ob-container py-14 md:py-20">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="ob-h2 max-w-[16ch]">Create a partner account.</h2>
              <p className="ob-body mt-4 max-w-[52ch]">
                Your referral link is issued on signup.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:shrink-0">
              <Link href={partnerUrl('signup')} className="ob-btn ob-btn-signal">
                Sign up
              </Link>
              <Link href={partnerUrl('faq')} className="ob-btn ob-btn-outline">
                FAQ
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
