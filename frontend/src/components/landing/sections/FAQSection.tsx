'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const ease = [0.25, 0.1, 0.25, 1] as const;

const FAQS = [
  {
    q: 'How is Reliastra different from regular uptime monitoring?',
    a: 'Regular uptime monitors check your own infrastructure from the outside. Reliastra monitors your vendors’ APIs from independent locations: completely separate from your stack. It doesn’t just tell you a vendor is down; it correlates vendor degradation with your service metrics and generates evidence reports you can send directly to vendor support to claim SLA credits.',
  },
  {
    q: 'What counts as an “independent” verification?',
    a: 'Reliastra runs checks from multiple cloud regions (US East, US West, EU) on infrastructure that is completely separate from yours and the vendor’s. Each check is timestamped and logged with full metadata. This means when a vendor says “everything looks fine on our end,” you have third-party proof from locations they don’t control.',
  },
  {
    q: 'Which vendors do you support?',
    a: 'Any HTTP endpoint. Reliastra works with any vendor that exposes an API: Stripe, Auth0, Twilio, Cloudflare, OpenAI, PagerDuty, AWS, and hundreds more. If it has a URL and returns a status code, we can monitor it. Setup takes about 30 seconds per vendor.',
  },
  {
    q: 'How do SLA evidence reports work?',
    a: 'When a vendor incident is detected, Reliastra automatically compiles a timestamped report including: independent verification from multiple regions, the exact duration of degradation, your correlated service impact, and the calculated SLA credit amount. Reports are generated in a format accepted by major cloud vendors and can be shared with vendor support in one click.',
  },
  {
    q: 'Will this actually help me get SLA credits?',
    a: 'Yes. Structured, independent evidence is the basis of successful SLA credit claims. Vendors are more likely to honor credit claims when presented with timestamped, third-party verification rather than screenshots or manual reports.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is encrypted at rest (AES-256) and in transit (TLS 1.3). SOC 2 Type II certification is in progress. Monitoring data and evidence reports are owned by the account holder and are not shared with vendors or third parties.',
  },
];

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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
            FAQ
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            Common questions.
          </h2>
        </motion.div>

        <div className="mx-auto max-w-3xl">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div
                key={i}
                className="border-b border-[#E4E4E7] dark:border-white/10"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.5, delay: i * 0.06, ease }}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-4 py-6 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="pr-4 text-base font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                    {faq.q}
                  </span>
                  <motion.span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#E4E4E7] dark:border-white/15'
                    )}
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Plus className="h-3.5 w-3.5 text-[#52525B] dark:text-[#A1A1AA]" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
