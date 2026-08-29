'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { goTo } from '@/components/landing/theme';
import {
  ALL_PLANS,
  annualPrice,
  dependencyLabel,
  getPlan,
  intervalLabel,
  monthlyPrice,
  retentionLabel,
  seatLabel,
} from '@/lib/dashboard/plans';
import { isCheckoutReady } from '@/lib/billing/currency';
import {
  PaymentCurrencyNotice,
  PlanPaymentSummary,
} from '@/components/billing/PaymentCurrencyNotice';
import { usePaymentCurrency } from '@/lib/billing/use-payment-currency';

const ease = [0.25, 0.1, 0.25, 1] as const;

function FeatureRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] text-[#52525B] dark:text-[#A1A1AA]">
      {ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A] dark:text-[#22C55E]" aria-hidden="true" />
      ) : (
        <span className="mt-1.5 ml-0.5 inline-block h-1 w-1.5 rounded-full bg-[#D4D4D8] dark:bg-white/20" aria-hidden="true" />
      )}
      {label}
    </li>
  );
}

export function PricingSection() {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  // "What currency will I actually be charged in?" — resolved by the same
  // backend source of truth that prices the Paystack transaction, so this
  // section can never advertise a currency checkout does not use.
  const { currency } = usePaymentCurrency();

  return (
    <section id="pricing" className="bg-white py-32 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mx-auto mb-16 max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
            PRICING
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            Know what your infrastructure depends on.{' '}
            <span className="text-[#0891B2] dark:text-[#22D3EE]">Prove what failed.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            Start measuring for free. Upgrade to Pro to generate evidence and alert your team.
            Move to Enterprise for advanced controls, scale and client work.
          </p>
        </motion.div>

        {/* Billing interval toggle */}
        <div className="mx-auto mb-12 flex w-fit items-center gap-1 rounded-full border border-[#E4E4E7] p-1 dark:border-white/10">
          <button
            type="button"
            onClick={() => setInterval('monthly')}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              interval === 'monthly'
                ? 'bg-[#0891B2] text-white dark:bg-[#22D3EE] dark:text-[#0A0A0F]'
                : 'text-[#52525B] dark:text-[#A1A1AA]'
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval('annual')}
            className={cn(
              'rounded-full px-5 py-2 text-sm font-medium transition-colors',
              interval === 'annual'
                ? 'bg-[#0891B2] text-white dark:bg-[#22D3EE] dark:text-[#0A0A0F]'
                : 'text-[#52525B] dark:text-[#A1A1AA]'
            )}
          >
            Annual
            <span className="ml-1.5 text-xs font-semibold text-[#16A34A] dark:text-[#22C55E]">Save 2 months</span>
          </button>
        </div>

        {/* Three canonical pricing cards */}
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {ALL_PLANS.map((planId, i) => {
            const p = getPlan(planId);
            const price = interval === 'annual' ? annualPrice(p) : monthlyPrice(p);
            const paidPlan = p.id !== 'free' && !p.isEnterprise;
            const features = [
              { label: 'Custom endpoint URLs', ok: true },
              { label: 'Email alerts', ok: true },
              { label: 'Basic incident detection', ok: true },
              { label: 'Slack alerts', ok: p.slackAlerts },
              { label: 'API access', ok: p.api },
              { label: 'Deterministic attribution', ok: p.attribution },
              { label: 'Evidence generation', ok: p.evidence },
              { label: 'Historical analysis', ok: p.historicalAnalysis },
              { label: 'Custom-branded evidence', ok: p.customBrandedEvidence },
              { label: 'Client groups / isolation', ok: p.clientGroups },
              { label: 'Client-facing reports', ok: p.clientReports },
              { label: 'White-label branding', ok: p.whiteLabel },
            ];
            return (
              <motion.div
                key={p.id}
                data-testid={`pricing-card-${p.id}`}
                className={cn(
                  'relative flex flex-col rounded-xl p-7',
                  p.badge
                    ? 'border-2 border-[#0891B2] bg-white shadow-[0_0_0_1px_#0891B2,0_0_60px_rgba(8,145,178,0.1)] dark:border-[#22D3EE] dark:bg-[#131318] dark:shadow-[0_0_0_1px_#22D3EE,0_0_60px_rgba(34,211,238,0.12)]'
                    : 'border border-[#E4E4E7] bg-white shadow-card dark:border-white/10 dark:bg-[#131318]'
                )}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.6, delay: i * 0.1, ease }}
              >
                {p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0891B2] px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-[#22D3EE] dark:text-[#0A0A0F]">
                    {p.badge}
                  </span>
                )}

                <p className="text-sm font-semibold text-[#52525B] dark:text-[#A1A1AA]">{p.name}</p>

                <div
                  className="mt-2 flex items-baseline gap-0.5"
                  data-testid={`pricing-price-${p.id}`}
                >
                  <span className="text-[40px] font-bold leading-none tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                    {price}
                  </span>
                  {!p.isEnterprise && (
                    <span className="text-sm text-[#A1A1AA] dark:text-[#71717A]">
                      {interval === 'annual' ? '/yr' : '/mo'}
                    </span>
                  )}
                </div>
                {p.isEnterprise && (
                  <span className="mt-1 inline-block text-xs font-semibold text-[#0891B2] dark:text-[#22D3EE]">
                    Custom pricing
                  </span>
                )}
                {p.id === 'pro' && interval === 'annual' && (
                  <span className="mt-1 inline-block text-xs font-medium text-[#16A34A] dark:text-[#22C55E]">
                    Save 2 months
                  </span>
                )}

                {/* The USD figure above is the list price; this is the
                    currency and amount the card is actually charged in. The
                    wording lives in one shared component (billing/
                    PaymentCurrencyNotice) so no surface can drift. */}
                {paidPlan && (
                  <PlanPaymentSummary
                    info={currency}
                    plan={p.id}
                    interval={interval}
                    className="mt-2"
                  />
                )}

                <p className="mt-2 text-[13px] leading-relaxed text-[#71717A] dark:text-[#71717A]">
                  {p.tagline}
                </p>

                <p className="mt-4 font-mono text-xs font-medium text-[#0891B2] dark:text-[#22D3EE]">
                  {dependencyLabel(p.dependencies)} · {intervalLabel(p.minIntervalSeconds)} · {retentionLabel(p.retentionDays)} · {seatLabel(p.teamMembers)}
                </p>

                <div className="my-5 border-t border-[#F0F0F0] dark:border-white/10" />

                <ul className="space-y-2.5">
                  {features.map((f) => (
                    <FeatureRow key={f.label} label={f.label} ok={f.ok} />
                  ))}
                </ul>

                <div className="mt-auto" data-testid={`pricing-cta-${p.id}`}>
                  {p.isEnterprise ? (
                    <a
                      href="mailto:sales@reliastra.com?subject=Enterprise%20plan"
                      className="mt-6 block w-full rounded-[10px] bg-[#0A0A0F] py-3 text-center text-[13px] font-semibold leading-[44px] text-white transition-colors hover:bg-[#1A1A2F] dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]"
                    >
                      Contact Sales
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => goTo('signup')}
                      className={cn(
                        'mt-6 block w-full rounded-[10px] py-3 text-center text-[13px] font-semibold leading-[44px] transition-colors',
                        p.badge
                          ? 'bg-[#0891B2] text-white hover:bg-[#0E7490] dark:bg-[#0891B2] dark:hover:bg-[#0E7490]'
                          : 'bg-white border border-[#E4E4E7] text-[#09090B] hover:bg-[#F8F9FA] dark:bg-white/5 dark:border-white/15 dark:text-white dark:hover:bg-white/10'
                      )}
                    >
                      {p.id === 'free' ? 'Start free' : `Upgrade to ${p.name}`}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Plan information → currency disclosure → next step. One instance of
            the canonical paragraph for the whole pricing view. */}
        <div className="mx-auto mt-10 max-w-3xl" data-testid="pricing-currency-notice">
          <PaymentCurrencyNotice info={currency} heading="Billing currency" />
        </div>

        <p className="mt-10 text-center text-sm text-[#52525B] dark:text-[#A1A1AA]">
          Built for growing SaaS teams and agencies.{' '}
          <a
            href="mailto:sales@reliastra.com?subject=Enterprise%20plan"
            className="font-medium text-[#0891B2] underline-offset-2 hover:underline dark:text-[#22D3EE]"
          >
            Contact Sales
          </a>{' '}
          for custom requirements, client isolation and white-label reporting.
        </p>
        {!isCheckoutReady(currency) && (
          <p className="mx-auto mt-6 max-w-3xl text-center text-[13px] leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            Self-serve checkout opens as soon as our {currency.payment_currency_name} price list is
            published. Write to{' '}
            <a
              href="mailto:billing@reliastra.com?subject=Pro%20plan%20pricing"
              className="font-medium text-[#0891B2] underline-offset-2 hover:underline dark:text-[#22D3EE]"
            >
              billing@reliastra.com
            </a>{' '}
            and we will set your subscription up directly.
          </p>
        )}
      </div>
    </section>
  );
}
