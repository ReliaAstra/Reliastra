'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { EvidenceReportPreview } from '@/components/landing/shared/EvidenceReportPreview';

const ease = [0.25, 0.1, 0.25, 1] as const;

const FEATURES = [
  'Multi-region independent verification timestamps',
  'Correlated vendor degradation with your service metrics',
  'Court-ready format accepted by major cloud vendors',
  'One-click generation and sharing with vendor support',
];

export function EvidenceSection() {
  return (
    <section className="bg-white py-32 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease }}
          >
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
              SLA EVIDENCE
            </p>
            <h2 className="mb-6 text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
              SLA evidence reports.
            </h2>
            <p className="mb-8 leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
              Screenshots and Slack messages don&apos;t cut it. Reliastra keeps
              independent, timestamped observations of the endpoints you depend on.
              Credit decisions still sit with the vendor; the record is yours.
            </p>
            <ul className="space-y-4">
              {FEATURES.map((feature, i) => (
                <motion.li
                  key={feature}
                  className="flex items-start gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-100px' }}
                  transition={{ duration: 0.6, delay: 0.1 + i * 0.08, ease }}
                >
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A] dark:text-[#22C55E]"
                    aria-hidden="true"
                  />
                  <span className="text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                    {feature}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, delay: 0.2, ease }}
          >
            <EvidenceReportPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
