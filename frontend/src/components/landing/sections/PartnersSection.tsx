'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { goTo } from '@/components/landing/theme';

const ease = [0.25, 0.1, 0.25, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.6, ease },
  }),
};

const STATS = [
  { value: '30%', label: 'Recurring commission' },
  { value: '$0', label: 'Cost to join' },
  { value: '90 days', label: 'Attribution window' },
  { value: 'Monthly', label: 'Crypto payouts' },
];

const ROLES = [
  { name: 'Consultants', desc: 'You advise companies on infrastructure. You already have the trust.' },
  { name: 'Agencies', desc: 'You build and manage systems for clients. Distribution is natural.' },
  { name: 'MSPs', desc: 'You manage operations. Your clients depend on your recommendations.' },
  { name: 'Developers', desc: 'You build the software. Your network trusts your technical judgment.' },
  { name: 'Engineers', desc: 'You run production systems. You know what matters in infrastructure.' },
  { name: 'Founders', desc: 'You lead companies. Your network looks to you for tooling advice.' },
  { name: 'Creators', desc: 'You produce content about technology. Your audience listens.' },
  { name: 'Communities', desc: 'You run technical communities. Members trust shared recommendations.' },
];

const TESTIMONIALS = [
  {
    quote:
      'I recommended RELIASTRA to three infrastructure clients during a consulting engagement. Two subscribed within a week. I now earn recurring revenue from work I was already doing.',
    name: 'Marcus Webb',
    role: 'Infrastructure Consultant',
    badge: '$440+/mo earned',
  },
  {
    quote:
      'Our agency runs on RELIASTRA internally. When clients ask what we use for incident correlation, the answer naturally leads to a referral. It feels organic, not salesy.',
    name: 'Sarah Lin',
    role: 'CTO, Operations Agency',
    badge: '$870+/mo earned',
  },
  {
    quote:
      'I posted a single breakdown of how we use RELIASTRA for post-incident reviews. That one piece of content generated eight trial signups and four paying customers.',
    name: 'David Okafor',
    role: 'DevOps Content Creator',
    badge: '$580+/mo earned',
  },
];

export function PartnersSection() {
  return (
    <section id="partners" className="bg-white py-32 dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-12">
        {/* Header */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="mb-4 font-mono text-xs uppercase tracking-widest text-[#0891B2] dark:text-[#22D3EE]"
          >
            PARTNER NETWORK
          </motion.p>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-3xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-4xl"
          >
            Turn your network into recurring revenue.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="mt-5 leading-relaxed text-[#52525B] dark:text-[#A1A1AA]"
          >
            Share RELIASTRA with people who depend on critical infrastructure. When they
            subscribe, you earn 30% every month they remain a paying customer.
          </motion.p>
          <motion.div
            variants={fadeUp}
            custom={3}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <button
              onClick={() => goTo('signup')}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A0A0F] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1A1A2F] dark:bg-white dark:text-[#0A0A0F] dark:hover:bg-[#E4E4E7]"
            >
              BECOME A PARTNER
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => goTo('how-it-works')}
              className="rounded-[10px] border border-[#E4E4E7] bg-white px-7 py-3.5 text-sm font-semibold text-[#09090B] transition-colors hover:bg-[#F8F9FA] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              HOW IT WORKS
            </button>
          </motion.div>
        </motion.div>

        {/* Stats */}
        <motion.div
          className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E4E4E7] bg-[#E4E4E7] dark:border-white/10 dark:bg-white/10 lg:grid-cols-4"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              custom={i}
              className="bg-[#F8F9FA] p-8 text-center dark:bg-[#131318]"
            >
              <p className="font-mono text-3xl font-bold text-[#0891B2] dark:text-[#22D3EE] sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-2 font-mono text-xs uppercase tracking-widest text-[#71717A] dark:text-[#71717A]">
                {s.label}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Who is this for */}
        <motion.div
          className="mt-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="mb-3 font-mono text-xs uppercase tracking-widest text-[#71717A] dark:text-[#71717A]"
          >
            WHO IS THIS FOR
          </motion.p>
          <motion.h3
            variants={fadeUp}
            custom={1}
            className="mb-10 max-w-lg text-2xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-3xl"
          >
            You already have access to the people who need RELIASTRA.
          </motion.h3>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[#E4E4E7] bg-[#E4E4E7] dark:border-white/10 dark:bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role, i) => (
              <motion.div
                key={role.name}
                variants={fadeUp}
                custom={i}
                className="bg-white p-6 transition-all duration-200 hover:-translate-y-px hover:bg-[#F8F9FA] dark:bg-[#131318] dark:hover:bg-[#1A1A20]"
              >
                <h4 className="mb-2 text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">
                  {role.name}
                </h4>
                <p className="text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                  {role.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Testimonials */}
        <motion.div
          className="mt-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          <motion.p
            variants={fadeUp}
            custom={0}
            className="mb-3 font-mono text-xs uppercase tracking-widest text-[#71717A] dark:text-[#71717A]"
          >
            WHAT PARTNERS SAY
          </motion.p>
          <motion.h3
            variants={fadeUp}
            custom={1}
            className="mb-10 max-w-lg text-2xl font-semibold tracking-tight text-[#09090B] dark:text-[#FAFAFA] sm:text-3xl"
          >
            Trusted by infrastructure professionals.
          </motion.h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                variants={fadeUp}
                custom={i}
                className="flex h-full flex-col rounded-2xl border border-[#E4E4E7] bg-white p-6 transition-all duration-200 hover:-translate-y-px hover:border-[#0891B2]/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#131318] dark:hover:border-[#22D3EE]/30"
              >
                <p className="font-mono text-xs text-[#0891B2] dark:text-[#22D3EE]">PARTNER TESTIMONIAL</p>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6">
                  <p className="text-sm font-semibold text-[#09090B] dark:text-[#FAFAFA]">{t.name}</p>
                  <p className="text-xs text-[#71717A] dark:text-[#71717A]">{t.role}</p>
                  <span className="mt-3 inline-flex items-center rounded-full border border-[#16A34A]/20 bg-[#16A34A]/10 px-3 py-1 font-mono text-xs font-semibold text-[#16A34A] dark:text-[#22C55E]">
                    {t.badge}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Dark CTA band */}
      <div className="mx-auto mt-20 max-w-[1200px] px-6 md:px-12">
        <motion.div
          className="relative overflow-hidden rounded-3xl bg-[#0A0A0F] px-6 py-16 text-center dark:border dark:border-white/5"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease }}
        >
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
            aria-hidden="true"
          />
          <div className="relative z-10">
            <h3 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Your next customer could already be in your network.
            </h3>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/50">
              Get someone to subscribe. Earn 30% every month. It&apos;s that simple.
            </p>
            <button
              onClick={() => goTo('signup')}
              className="mt-8 inline-flex items-center gap-2 rounded-[10px] bg-white px-8 py-4 text-sm font-semibold text-[#0A0A0F] transition-colors hover:bg-white/90 dark:bg-white dark:text-[#0A0A0F]"
            >
              BECOME A PARTNER
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
