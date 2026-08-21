'use client';

import { motion } from 'framer-motion';
import { Satellite, GitCompare, FileText } from 'lucide-react';
import { CorrelationTimeline } from '@/components/landing/shared/CorrelationTimeline';

const ease = [0.25, 0.1, 0.25, 1] as const;

const BENTO_CARDS = [
  {
    icon: Satellite,
    sublabel: 'INDEPENDENT VENDOR MONITORING',
    title: 'Track Every Critical Vendor',
    body: 'Deploy lightweight checks from independent regions that monitor your vendors’ APIs directly. Monitoring runs on infrastructure completely separate from yours. Detect vendor failures before they affect your users.',
  },
  {
    icon: GitCompare,
    sublabel: 'CROSS-REFERENCE YOUR STACK',
    body: 'Automatically correlate vendor degradation events with your own service metrics. When your error rates spike, Reliastra evaluates whether a vendor is a likely contributor.',
    title: 'Cross-Reference Your Stack',
  },
  {
    icon: FileText,
    sublabel: 'TIMESTAMPED SLA EVIDENCE',
    title: 'Generate SLA Evidence Reports',
    body: 'Generate a timestamped report with independent observations, check metadata, and correlated impact. Vendors still decide credits; the report is evidence, not a guarantee.',
  },
];

export function SolutionSection() {
  return (
    <section id="solution" className="bg-[#F8F9FA] py-32 dark:bg-[#131318]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mx-auto mb-16 max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
            HOW IT WORKS
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            Track. Correlate. Prove.
          </h2>
        </motion.div>

        <div className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {BENTO_CARDS.map((card, i) => (
            <motion.div
              key={card.sublabel}
              className="rounded-2xl border border-[#E4E4E7] bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300 hover:-translate-y-4 hover:border-[#0891B2]/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-[#1A1A20] dark:shadow-none dark:hover:border-[#22D3EE]/30"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: i * 0.1, ease }}
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#0891B2]/10">
                <card.icon className="h-6 w-6 text-[#0891B2] dark:text-[#22D3EE]" aria-hidden="true" />
              </div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
                {card.sublabel}
              </p>
              <h3 className="mb-3 text-lg font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                {card.body}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="relative overflow-hidden rounded-3xl bg-[#0A0A0F] p-10 text-white md:p-16 dark:border dark:border-white/5"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, ease }}
        >
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
            aria-hidden="true"
          />
          <div className="relative z-10">
            <div className="mb-4 text-center">
              <h3 className="mb-3 text-2xl font-semibold text-white">Live Correlation Engine</h3>
              <p className="text-sm text-white/50">
                See how Reliastra correlates vendor degradation with your service impact in real-time.
              </p>
            </div>
            <CorrelationTimeline />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
