'use client';

import { motion } from 'framer-motion';
import { Eye, GitCompare, FileCheck } from 'lucide-react';

const ease = [0.25, 0.1, 0.25, 1] as const;

const PAIN_CARDS = [
  {
    icon: Eye,
    title: 'Blind to Vendor Failures',
    body: 'Your monitoring only sees your own stack. When a vendor API starts returning 5xx errors, your dashboards show healthy: because from your infrastructure’s perspective, everything is fine. You’re the last to know.',
  },
  {
    icon: GitCompare,
    title: 'No Causal Evidence',
    body: 'Vendors say “everything looks fine on our end.” Without independent, timestamped verification from outside your infrastructure, you have nothing to counter their claim. Your word against theirs.',
  },
  {
    icon: FileCheck,
    title: 'Credits Left on the Table',
    body: 'SLA credits require evidence: downtime duration, affected endpoints, independent verification. Without automated evidence collection, claiming credits is manual, tedious, and usually abandoned.',
  },
];

export function ProblemSection() {
  return (
    <section className="bg-white py-32 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mx-auto mb-16 max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
            THE 2 AM WAR ROOM
          </p>
          <h2 className="mb-6 text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            You know the conversation. &lsquo;Is it us or them?&rsquo;
          </h2>
          <p className="leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            Your pager goes off. Your site is down. Your team jumps on a call. Someone
            checks Stripe’s status page :  green. Someone checks
            AWS :  green. Forty-five minutes later, you find the root
            cause buried in a vendor’s API latency spike. Your customers don’t
            care whose fault it was. But your CFO will when you can’t prove it for
            the SLA claim.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PAIN_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              className="rounded-2xl border border-[#F0F0F0] bg-[#F8F9FA] p-8 transition-all duration-300 hover:-translate-y-4 hover:border-[#0891B2]/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-[#131318] dark:hover:border-[#22D3EE]/30"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: i * 0.15, ease }}
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0891B2]/10">
                <card.icon className="h-6 w-6 text-[#0891B2] dark:text-[#22D3EE]" aria-hidden="true" />
              </div>
              <h3 className="mb-3 text-lg font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
