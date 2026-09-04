'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Code2,
  FileCheck2,
  Handshake,
  Lock,
  Network,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePartnerStore } from '@/stores/partner-store';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

// Institutional — no pulsing, no gradients, no cartoon
export function PageHome() {
  const navigate = usePartnerStore((s) => s.navigate);

  return (
    <div className="bg-white text-foreground dark:bg-[#0A0A0F] dark:text-zinc-100">
      {/* ===== HERO — institutional, precise ===== */}
      <section className="relative border-b border-zinc-200 dark:border-white/[0.08]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#E4E4E7_1px,transparent_1px),linear-gradient(to_bottom,#E4E4E7_1px,transparent_1px)] bg-[size:48px_48px] opacity-[0.04] dark:opacity-[0.05]" aria-hidden />
        <div className="relative mx-auto max-w-[1120px] px-6 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="max-w-[760px]">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500" aria-hidden />
              <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-zinc-600 dark:text-zinc-400">TECHNICAL PUBLISHER PROGRAM</span>
            </motion.div>

            <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1} className="text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-900 dark:text-white sm:text-[40px] lg:text-[46px]">
              Partner with RELIASTRA
              <span className="block font-normal tracking-[-0.02em] text-zinc-600 dark:text-zinc-400">Bring credible infrastructure intelligence to your audience.</span>
            </motion.h1>

            <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2} className="mt-5 max-w-[640px] text-[15px] leading-[1.6] text-zinc-600 dark:text-zinc-400 sm:text-[16px]">
              RELIASTRA works with technical creators and publishers who cover cloud infrastructure, reliability, cybersecurity, DevOps, SaaS, and modern software systems — and whose audiences expect technical accuracy.
            </motion.p>

            <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate('signup')} className="h-11 rounded-[10px] bg-zinc-900 px-7 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100">
                Apply to the Partner Program
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('premium')} className="h-11 rounded-[10px] border-zinc-300 bg-white px-7 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/15 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/[0.06]">
                Explore RELIASTRA
              </Button>
            </motion.div>

            <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={4} className="mt-4 font-mono text-xs text-zinc-500 dark:text-zinc-500">
              For technical publishers with credible niche audiences · US, Canada, UK & EU
            </motion.p>
          </div>
        </div>
      </section>

      {/* ===== TRUST / CREDIBILITY — This company exists ===== */}
      <section className="border-b border-zinc-200 bg-[#FAFAFA] dark:border-white/[0.06] dark:bg-[#0F0F12]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Institutional credibility</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">Built as infrastructure, not marketing.</h2>
            </div>
            <p className="max-w-[420px] text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">RELIASTRA is real infrastructure software — not an affiliate platform with a product attached.</p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 dark:border-white/10 dark:bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Network, title: 'Independent multi-region monitoring', desc: 'Continuous checks from distributed probes. Not self-reported status pages.' },
              { icon: BarChart3, title: 'Public tracking', desc: 'Live vendor status, uptime and incident history at /track — measured, not marketed.' },
              { icon: FileCheck2, title: 'Verifiable evidence', desc: 'Timestamped, checksummed SLA reports with incident correlation.' },
              { icon: BookOpen, title: 'Technical documentation', desc: 'Product docs, methodology notes, and integration guides.' },
              { icon: Code2, title: 'API availability', desc: 'Programmatic access for checks, incidents, and evidence where your plan allows.' },
              { icon: Lock, title: 'Security practices', desc: 'HMAC-signed share links, scoped audit logs, least-privilege RBAC.' },
            ].map((c) => (
              <div key={c.title} className="bg-white p-6 dark:bg-[#131318]">
                <c.icon className="mb-3 size-5 text-zinc-700 dark:text-zinc-300" aria-hidden />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs text-zinc-500 dark:text-zinc-500">
            <Link href="/track" className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]">/track → public status</Link>
            <Link href="/privacy" className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04]">Privacy</Link>
            <Link href="/terms" className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04]">Terms</Link>
            <Link href="/support" className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04]">Contact</Link>
          </div>
        </div>
      </section>

      {/* ===== WHY TECHNICAL PUBLISHERS ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Why this partnership exists</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">Technical audiences care about what actually happens inside the infrastructure they depend on.</h2>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Teams choosing databases, queues, auth providers, and cloud services don&apos;t need another uptime monitor. They need independent intelligence they can trust — and a publisher who can explain what it means for real systems.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">Use RELIASTRA for</p>
            <ul className="mt-4 grid gap-2.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {['Technical articles & deep dives', 'YouTube videos & walkthroughs', 'Newsletters & research briefs', 'Infrastructure explainers', 'Incident analysis & postmortems', 'Cloud reliability & dependency analysis', 'Cybersecurity / infra education', 'Product comparisons with evidence'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-2 h-px w-4 shrink-0 bg-zinc-300 dark:bg-white/20" aria-hidden />{t}</li>
              ))}
            </ul>
            <p className="mt-5 border-t border-zinc-200 pt-4 font-mono text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-500">You are positioned as an independent technical publisher using a serious product — not a salesperson.</p>
          </div>
        </div>
      </section>

      {/* ===== WHAT PARTNERS RECEIVE ===== */}
      <section className="border-y border-zinc-200 bg-[#FAFAFA] dark:border-white/[0.06] dark:bg-[#0F0F12]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">What partners receive</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">A professional partner account — restrained, not promotional.</h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 dark:border-white/10 dark:bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { k: 'Revenue', v: 'Recurring commission for qualified referrals (30% of subscription, 90-day attribution, minimum payout, payable after hold).' },
              { k: 'Professional Partner Account', v: 'Dedicated dashboard for attribution, referrals, and earnings — isolated per partner, audited.' },
              { k: 'Product Access', v: 'Appropriate access so you can genuinely understand and demonstrate RELIASTRA.' },
              { k: 'Research / Data Access', v: 'Where appropriate: infrastructure observations, reports, and materials useful for technical content.' },
              { k: 'Partner Resources', v: 'Product assets, screenshots, technical explanations, briefs, and approved messaging — editorial integrity required.' },
              { k: 'Direct Relationship', v: 'Qualified partners have direct access to RELIASTRA — partnership, technical, and research discussions.' },
            ].map((c) => (
              <div key={c.k} className="bg-white p-6 dark:bg-[#131318]">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{c.k}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{c.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-xs text-zinc-500">No unlimited support promises. Resources are professional and proportionate to fit and audience quality.</p>
        </div>
      </section>

      {/* ===== DIRECT RELATIONSHIP ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
              <Handshake className="size-4 text-zinc-700 dark:text-zinc-300" />
              <span className="font-mono text-[11px] tracking-[0.14em] text-zinc-600 dark:text-zinc-400">DIRECT RELATIONSHIP</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">A direct relationship with RELIASTRA.</h2>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">RELIASTRA is not an anonymous affiliate system. Approved partners have a human point of contact for the relationship — not a ticket queue.</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#131318]">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">Qualified partners have direct access for</p>
            <ul className="mt-4 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              {['Partnership enquiries', 'Technical clarification', 'Collaboration opportunities', 'Content coordination', 'Research opportunities', 'Strategic discussions'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-2 h-px w-4 bg-zinc-300 dark:bg-white/20" />{t}</li>
              ))}
            </ul>
            <p className="mt-5 rounded-lg bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-600 dark:bg-white/[0.03] dark:text-zinc-400">Qualified partners have direct access to the RELIASTRA team, including senior leadership where appropriate.</p>
          </div>
        </div>
      </section>

      {/* ===== PROFESSIONAL PLACEMENT ===== */}
      <section className="border-y border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-[#0A0A0F]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">Professional placement. Editorial integrity matters.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Your credibility is an asset. RELIASTRA reinforces it — never encourages unsupported claims. Sponsorship must be clearly disclosed.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { t: 'Technical articles', d: 'Editorial references with context' },
              { t: 'Tutorials', d: 'Step-by-step with real product usage' },
              { t: 'YouTube videos', d: 'Walkthroughs, incident breakdowns' },
              { t: 'Newsletters', d: 'Curated research & reliability notes' },
              { t: 'Research & explainers', d: 'Infrastructure investigations' },
              { t: 'Comparisons', d: 'Technical, evidence-backed commentary' },
              { t: 'Resource pages', d: 'Relevant educational hubs' },
              { t: 'Appropriate placements', d: 'Relevant, disclosed, non-intrusive' },
              { t: 'Sponsored editorial', d: 'Explicitly disclosed when required' },
            ].map((c) => (
              <div key={c.t} className="rounded-xl border border-zinc-200 p-5 dark:border-white/10">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{c.t}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">How it works</p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 dark:border-white/10 dark:bg-white/10 md:grid-cols-3 lg:grid-cols-6">
          {['Sign up', 'Get approved', 'Receive access & resources', 'Publish relevant technical content', 'Generate qualified referrals', 'Earn recurring commission'].map((s, i) => (
            <div key={s} className="bg-white p-5 dark:bg-[#131318]">
              <div className="font-mono text-xs text-zinc-400">0{i + 1}</div>
              <p className="mt-2 text-sm font-medium leading-snug text-zinc-900 dark:text-white">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== PARTNER QUALITY ===== */}
      <section className="border-y border-zinc-200 bg-[#FAFAFA] dark:border-white/[0.06] dark:bg-[#0F0F12]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">Quality over volume.</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">RELIASTRA does not aim to build the largest partner directory. We work with publishers whose audiences genuinely care about infrastructure, reliability, security, and modern software systems. Selectivity, without fake exclusivity.</p>
          </div>
        </div>
      </section>

      {/* ===== IDEAL PARTNER ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#131318]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900 dark:text-white">You may be a strong fit if you</h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {['Publish technical content consistently', 'Have an audience interested in cloud, infrastructure, security, SaaS, DevOps, or software engineering', 'Care about technical accuracy', 'Have a credible publishing history', 'Prefer useful tools over generic sponsorships', 'Want long-term relationships rather than one-off promotions'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-emerald-600" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-white/[0.03]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-900 dark:text-white">Probably not a fit if you</h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {['Run primarily general entertainment/lifestyle content', 'Promote unrelated products indiscriminately', 'Publish misleading technical claims', 'Operate spam-heavy affiliate sites', 'Have no meaningful technical audience'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-zinc-400" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== COMMISSION — clear, professional ===== */}
      <section className="border-y border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-[#0A0A0F]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Commission</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-white">Transparent economics.</h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">A single rate, recurring, no tiers or hidden thresholds. Built for technical publishers who prefer predictable, long-term economics over one-time bounties.</p>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="text-5xl font-semibold tracking-[-0.03em] text-zinc-900 dark:text-white">30%</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">recurring</span>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-white/10">
              <div className="grid grid-cols-1 divide-y divide-zinc-200 dark:divide-white/10">
                {[
                  ['Attribution', '90-day cookie / link window'],
                  ['Recurring vs one-time', 'Recurring — as long as referral remains paying customer'],
                  ['When payable', 'After 30-day hold and minimum payout threshold'],
                  ['Payout method', 'Partner dashboard — bank / payout destination on file'],
                  ['Self-referrals', 'Excluded — no commission on your own signups'],
                  ['Fraud / abuse', 'Excluded — automated, bulk, or fraudulent referrals void'],
                  ['Eligibility', 'Applies to Pro plan referrals; terms may evolve, see Partner Agreement'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 px-5 py-3.5">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">{k}</span>
                    <span className="max-w-[60%] text-right text-sm text-zinc-600 dark:text-zinc-400">{v}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="font-mono text-xs text-zinc-500">Example: $39 Pro → $11.70/mo to you. Customer pays $39, you earn 30% recurring.</p>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center font-mono text-xs text-zinc-500">If a rule is not yet implemented, this page reflects only what is actually supported. See Partner Agreement for the binding terms.</p>
        </div>
      </section>

      {/* ===== TRUST & TRANSPARENCY ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-12 sm:px-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
          {[
            ['Terms', '/terms'],
            ['Privacy', '/privacy'],
            ['Partner Agreement', '/terms'],
            ['Contact', '/support'],
            ['Security', '/privacy'],
            ['Docs', '/track'],
            ['Status', '/track'],
            ['Evidence', '/track'],
          ].map(([label, href]) => (
            <Link key={label} href={href} className="rounded-full border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/[0.06]">
              {label}
            </Link>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-zinc-500">
          This page withstands scrutiny from technical creators, software companies, agencies, investors, journalists, procurement, and cybersecurity professionals.
        </p>
      </section>

      {/* ===== FINAL CTA — restrained, premium ===== */}
      <section className="border-t border-zinc-200 bg-zinc-900 text-white dark:border-white/[0.06] dark:bg-[#0F0F12]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">A professional relationship</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">Build with evidence. Publish with confidence.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">Join technical publishers who bring credible infrastructure intelligence to their audiences — and earn recurring revenue for doing so.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => navigate('signup')} className="h-11 rounded-[10px] bg-white px-7 text-sm font-medium text-zinc-900 hover:bg-zinc-100">
                Apply to the RELIASTRA Partner Program
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
              <Button variant="outline" size="lg" asChild className="h-11 rounded-[10px] border-white/20 bg-transparent px-7 text-sm font-medium text-white hover:bg-white/10 hover:text-white">
                <Link href="/support">Contact RELIASTRA</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
