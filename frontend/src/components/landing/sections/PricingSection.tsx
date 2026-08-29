'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { goTo } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    positioning: 'Start measuring your dependencies.',
    dependencies: '3 monitored dependencies',
    featured: false,
    features: [
      'Custom endpoint URLs',
      '24-hour data retention',
      'Email alerts',
      'Basic incident detection',
    ],
    cta: 'Start free',
    ctaStyle:
      'bg-white border border-[#E4E4E7] text-[#09090B] hover:bg-[#F8F9FA] dark:bg-white/5 dark:border-white/15 dark:text-white dark:hover:bg-white/10',
  },
  {
    key: 'starter',
    name: 'Starter',
    price: '$19',
    period: '/mo',
    positioning: 'Track more of your stack.',
    dependencies: '10 monitored dependencies',
    featured: false,
    features: [
      '7-day data retention',
      'Email alerts',
      'Limited attribution',
      'Basic dependency history',
    ],
    cta: 'Start Starter',
    ctaStyle:
      'bg-white border border-[#E4E4E7] text-[#09090B] hover:bg-[#F8F9FA] dark:bg-white/5 dark:border-white/15 dark:text-white dark:hover:bg-white/10',
  },
  {
    key: 'standard',
    name: 'Standard',
    price: '$49',
    period: '/mo',
    positioning: 'Investigate and prove dependency failures.',
    dependencies: '30 monitored dependencies',
    featured: true,
    features: [
      '30-day data retention',
      'Incident correlation',
      'Evidence generation',
      'Slack alerts',
      'Historical analysis',
    ],
    cta: 'Start Standard',
    ctaStyle: 'bg-[#0891B2] text-white hover:bg-[#0E7490] dark:bg-[#0891B2] dark:hover:bg-[#0E7490]',
    badge: 'Most Popular',
  },
];

const PROFESSIONAL = {
  key: 'professional',
  name: 'Professional',
  price: '$99',
  period: '/mo',
  positioning: 'Operate dependency intelligence at team scale.',
  dependencies: '100 monitored dependencies',
  features: [
    '90-day evidence retention',
    'Advanced incident correlation',
    'Automated dependency attribution',
    'Custom-branded evidence reports',
    'Exportable PDF/JSON evidence',
    'Faster check intervals',
    'All notification channels',
    'Historical dependency analysis',
    'Team collaboration',
  ],
};

const AGENCY = {
  key: 'agency',
  name: 'Agency',
  price: '$199',
  period: '/mo',
  positioning: 'Prove reliability across your client portfolio.',
  dependencies: '500 monitored dependencies',
  features: [
    'Client workspaces',
    'Client isolation',
    'White-label branding',
    'Client-facing evidence reports',
    'Shared dependency intelligence',
    'Everything in Professional',
  ],
};

export function PricingSection() {
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
        </motion.div>

        {/* Pricing Cards */}
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              className={cn(
                'relative rounded-xl p-7',
                plan.featured
                  ? 'border-2 border-[#0891B2] bg-white shadow-[0_0_0_1px_#0891B2,0_0_60px_rgba(8,145,178,0.1)] dark:border-[#22D3EE] dark:bg-[#131318] dark:shadow-[0_0_0_1px_#22D3EE,0_0_60px_rgba(34,211,238,0.12)]'
                  : 'border border-[#E4E4E7] bg-white shadow-card dark:border-white/10 dark:bg-[#131318]'
              )}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: i * 0.1, ease }}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0891B2] px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-[#22D3EE] dark:text-[#0A0A0F]">
                  {plan.badge}
                </span>
              )}

              <p className="text-sm font-semibold text-[#52525B] dark:text-[#A1A1AA]">{plan.name}</p>

              <div className="mt-2 flex items-baseline gap-0.5">
                <span className="text-[40px] font-bold leading-none tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-sm text-[#A1A1AA] dark:text-[#71717A]">{plan.period}</span>
                )}
              </div>

              <p className="mt-2 text-[13px] leading-relaxed text-[#71717A] dark:text-[#71717A]">
                {plan.positioning}
              </p>

              <p className="mt-4 font-mono text-xs font-medium text-[#0891B2] dark:text-[#22D3EE]">
                {plan.dependencies}
              </p>

              <div className="my-5 border-t border-[#F0F0F0] dark:border-white/10" />

              <ul className="space-y-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[13px] text-[#52525B] dark:text-[#A1A1AA]"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A] dark:text-[#22C55E]"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => goTo('signup')}
                className={cn(
                  'mt-6 block w-full rounded-[10px] py-3 text-center text-[13px] font-semibold leading-[44px] transition-colors',
                  plan.ctaStyle
                )}
              >
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>

        {/* Professional + Agency Row */}
        <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          <motion.div
            className="rounded-xl border border-[#E4E4E7] bg-white p-7 shadow-card dark:border-white/10 dark:bg-[#131318]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.3, ease }}
          >
            <p className="text-sm font-semibold text-[#52525B] dark:text-[#A1A1AA]">
              {PROFESSIONAL.name}
            </p>
            <div className="mt-2 flex items-baseline gap-0.5">
              <span className="text-[40px] font-bold leading-none tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                {PROFESSIONAL.price}
              </span>
              <span className="text-sm text-[#A1A1AA] dark:text-[#71717A]">
                {PROFESSIONAL.period}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#71717A] dark:text-[#71717A]">
              {PROFESSIONAL.positioning}
            </p>
            <p className="mt-4 font-mono text-xs font-medium text-[#0891B2] dark:text-[#22D3EE]">
              {PROFESSIONAL.dependencies}
            </p>
            <div className="my-5 border-t border-[#F0F0F0] dark:border-white/10" />
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {PROFESSIONAL.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[#52525B] dark:text-[#A1A1AA]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A] dark:text-[#22C55E]" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => goTo('login')}
              className="mt-6 block w-full rounded-[10px] bg-[#0A0A0F] py-3 text-center text-[13px] font-semibold leading-[44px] text-white transition-colors hover:bg-[#1A1A2F] dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]"
            >
              Learn more
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-[#71717A] dark:text-[#71717A]">
              Engineering organizations operate on this — not just monitor with it.
            </p>
          </motion.div>

          <motion.div
            className="rounded-xl border border-[#E4E4E7] bg-[#F8F9FA] p-7 dark:border-white/10 dark:bg-[#1A1A20]"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, delay: 0.38, ease }}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#52525B] dark:text-[#A1A1AA]">
                {AGENCY.name}
              </p>
              <span className="rounded-full bg-[#0A0A0F] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-white dark:text-[#0A0A0F]">
                Built for Agencies
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-0.5">
              <span className="text-[40px] font-bold leading-none tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                {AGENCY.price}
              </span>
              <span className="text-sm text-[#A1A1AA] dark:text-[#71717A]">{AGENCY.period}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#71717A] dark:text-[#71717A]">
              {AGENCY.positioning}
            </p>
            <p className="mt-4 font-mono text-xs font-medium text-[#0891B2] dark:text-[#22D3EE]">
              {AGENCY.dependencies}
            </p>
            <div className="my-5 border-t border-[#E4E4E7] dark:border-white/10" />
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {AGENCY.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13px] text-[#52525B] dark:text-[#A1A1AA]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A] dark:text-[#22C55E]" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => goTo('login')}
              className="mt-6 block w-full rounded-[10px] bg-[#0A0A0F] py-3 text-center text-[13px] font-semibold leading-[44px] text-white transition-colors hover:bg-[#1A1A2F] dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]"
            >
              Learn more
            </button>
            <p className="mt-3 text-center text-[11px] text-[#A1A1AA] dark:text-[#71717A]">
              Need more than 500 dependencies?{' '}
              <button
                onClick={() => goTo('support')}
                className="font-medium text-[#0891B2] underline-offset-2 hover:underline dark:text-[#22D3EE]"
              >
                Contact us
              </button>
            </p>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
              Sell infrastructure intelligence — not just uptime.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
