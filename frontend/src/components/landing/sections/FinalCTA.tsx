'use client';

import { motion } from 'framer-motion';
import { StatusDot } from '@/components/landing/shared/StatusDot';
import { cn } from '@/lib/utils';
import { goTo } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const DEMO_VENDORS = [
  { name: 'Stripe', latency: '124ms', status: 'up' as const, color: '#635BFF' },
  { name: 'Auth0', latency: '342ms', status: 'degraded' as const, color: '#EB5424' },
  { name: 'Vercel', latency: '48ms', status: 'up' as const, color: '#FFFFFF' },
];

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-[#0A0A0F] py-32">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Stop guessing. Start proving.
          </h2>
          <p className="mx-auto max-w-xl text-lg text-white/50">
            The next time a vendor takes down your service, you&apos;ll have the evidence to
            claim your credits.
          </p>
        </motion.div>

        <motion.div
          className="mx-auto mb-12 max-w-lg"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
        >
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#131318]">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-[10px] w-[10px] rounded-full bg-white/10" />
                <div className="h-[10px] w-[10px] rounded-full bg-white/10" />
                <div className="h-[10px] w-[10px] rounded-full bg-white/10" />
              </div>
              <div className="flex-1 text-center">
                <span className="font-mono text-xs text-white/30">reliastra.com/dashboard</span>
              </div>
            </div>

            <div className="space-y-0 p-5">
              {DEMO_VENDORS.map((vendor) => (
                <div
                  key={vendor.name}
                  className="flex items-center justify-between border-b border-white/5 py-2.5 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn('h-2 w-2 rounded-full')}
                      style={{ backgroundColor: vendor.color === '#FFFFFF' ? '#0891B2' : vendor.color }}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-white">{vendor.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-white/60">{vendor.latency}</span>
                    <StatusDot status={vendor.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, delay: 0.4, ease }}
        >
          <button
            onClick={() => goTo('signup')}
            className="inline-block rounded-[10px] bg-white px-8 py-4 text-base font-semibold text-[#0A0A0F] transition-colors hover:bg-white/90"
          >
            Start Free Today
          </button>
          <p className="mt-4 text-xs text-white/40">Free plan includes up to 3 dependencies · No credit card required</p>
        </motion.div>
      </div>
    </section>
  );
}
