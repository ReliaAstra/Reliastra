'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Activity, ShieldCheck } from 'lucide-react';
import { BrowserMockup } from '@/components/landing/shared/BrowserMockup';
import { IncidentCorrelationCard } from '@/components/landing/shared/IncidentCorrelationCard';
import { cn } from '@/lib/utils';
import { goTo, scrollToId } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

export function HeroSection() {
  return (
    <section
      id="top"
      className={cn(
        'relative min-h-[calc(100dvh-72px)] overflow-hidden pb-20 pt-[80px]',
        'bg-white dark:bg-[#0A0A0F]'
      )}
      style={{
        background:
          'radial-gradient(ellipse 60% 50% at 70% 40%, rgba(8,145,178,0.05) 0%, transparent 100%)',
      }}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Left Column */}
          <motion.div
            className="space-y-8"
            variants={stagger}
            initial="initial"
            animate="animate"
          >
            <motion.div variants={fadeUp}>
              <div className="inline-flex items-center gap-2.5 rounded-full border border-[#F0F0F0] bg-[#F8F9FA] px-4 py-2 dark:border-white/10 dark:bg-white/5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A34A] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                </span>
                <span className="text-xs font-semibold text-[#52525B] dark:text-[#A1A1AA]">
                  External Dependency Intelligence
                </span>
              </div>
            </motion.div>

            <motion.h1
              className="text-[40px] font-[800] leading-[1.1] tracking-[-0.03em] text-[#09090B] dark:text-[#FAFAFA] sm:text-[48px] lg:text-[64px]"
              variants={fadeUp}
            >
              <span className="font-[800]">Your site went down.</span>
              <br />
              <span className="font-[600]">Was it you, or</span>{' '}
              <span className="font-[800] text-[#0891B2] dark:text-[#22D3EE]">your vendors?</span>
            </motion.h1>

            <motion.p
              className="mt-2 max-w-lg text-lg leading-relaxed text-[#52525B] dark:text-[#A1A1AA]"
              variants={fadeUp}
            >
              Reliastra monitors the external services your infrastructure depends on,
              correlates their failures with your incidents, and produces independent
              evidence of what happened.
            </motion.p>

            <motion.div
              className="flex flex-col gap-4 sm:flex-row"
              variants={fadeUp}
            >
              <button
                onClick={() => goTo('signup')}
                className="group inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#0A0A0F] px-7 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]"
              >
                Start Free
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => scrollToId('live')}
                className="group inline-flex items-center justify-center gap-2 rounded-[10px] border border-[#E4E4E7] bg-white px-7 py-3.5 text-sm font-semibold text-[#09090B] transition-all duration-200 hover:border-[#09090B] hover:bg-[#F8F9FA] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/40"
              >
                <Activity className="h-4 w-4" />
                See Live Vendor Data
              </button>
            </motion.div>

            <motion.div
              className="flex items-center gap-2 text-sm text-[#A1A1AA] dark:text-[#71717A]"
              variants={fadeUp}
            >
              <ShieldCheck className="h-4 w-4 text-[#16A34A] dark:text-[#22C55E]" />
              <span>No credit card required · Free vendor tracking forever</span>
            </motion.div>
          </motion.div>

          {/* Right Column */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
          >
            <BrowserMockup
              url="reliastra.com/track"
              aria-label="Live independent vendor latency from Reliastra public checks"
            >
              <div className="px-4 py-6 md:px-8">
                <IncidentCorrelationCard />
              </div>
            </BrowserMockup>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
