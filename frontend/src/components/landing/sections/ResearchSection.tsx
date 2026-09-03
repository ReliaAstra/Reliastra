'use client';

import { motion } from 'framer-motion';
import { FileSearch, Network, ShieldCheck } from 'lucide-react';
import { PreferredSourceSection } from '@/components/seo/preferred-source';

const ease = [0.25, 0.1, 0.25, 1] as const;

const ITEMS = [
  {
    icon: Network,
    title: 'How we map the dependency graph',
    body: 'Every monitored endpoint is checked from multiple regions. Reliastra correlates your own service metrics with vendor degradation to separate causation from coincidence.',
  },
  {
    icon: FileSearch,
    title: 'Independent of the vendor\u2019s status page',
    body: 'Status pages describe intent, not behavior. Our observations come from the network path itself, so the record reflects what actually happened.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for the vendor conversation',
    body: 'Timestamped, checksummed evidence reports give you a defensible record when negotiating credits. Credit decisions stay with the vendor; the record is yours.',
  },
];

export function ResearchSection() {
  return (
    <section id="research" className="bg-[#FAFAFA] py-32 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
          className="mb-12 max-w-2xl"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]">
            UNDER THE HOOD
          </p>
          <h2 className="mb-5 text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            The evidence engine, explained.
          </h2>
          <p className="leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            Reliastra is a monitoring product first and an evidence product second. Here is how
            the pieces fit together.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {ITEMS.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.6, delay: i * 0.1, ease }}
              className="rounded-2xl border border-[#E4E4E7] bg-white p-7 dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#0891B2]/10 text-[#0891B2] dark:bg-[#22D3EE]/10 dark:text-[#22D3EE]">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mb-2 text-lg font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA]">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease }}
          className="mx-auto mt-10 max-w-2xl"
        >
          <PreferredSourceSection variant="research" />
        </motion.div>
      </div>
    </section>
  );
}
