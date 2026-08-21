'use client';

import { motion } from 'framer-motion';

const ease = [0.25, 0.1, 0.25, 1] as const;

export function FounderSection() {
  return (
    <section className="bg-[#F8F9FA] py-32 dark:bg-[#131318]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mx-auto mb-12 max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <h2 className="text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl">
            Built by engineers who&apos;ve been there.
          </h2>
        </motion.div>

        <motion.div
          className="mx-auto max-w-xl rounded-2xl border border-[#E4E4E7] bg-white p-10 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] text-center dark:border-white/10 dark:bg-[#1A1A20] dark:shadow-none"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <div
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#0891B2]/10"
            aria-label="Emmanuel Osei, Founder"
          >
            <span className="text-xl font-bold text-[#0891B2] dark:text-[#22D3EE]">EO</span>
          </div>

          <h3 className="text-lg font-semibold text-[#09090B] dark:text-[#FAFAFA]">Emmanuel Osei</h3>
          <p className="mt-1 text-sm text-[#A1A1AA] dark:text-[#71717A]">Founder &amp; CEO</p>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            Built Reliastra after too many production incidents that started in a vendor API
            and ended in an unprovable status-page debate. The product is the independent
            evidence layer I wanted at the time.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
