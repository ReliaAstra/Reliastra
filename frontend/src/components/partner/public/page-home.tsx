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
import { navigatePartner } from '@/components/partner/public/navigation';

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

// Institutional - no pulsing, no gradients, no cartoon
export function PageHome() {
  const navigate = navigatePartner;

  return (
    <div className="bg-[var(--ob-void)] text-foreground">
      {/* ===== HERO - institutional, precise ===== */}
      <section className="relative border-b border-[var(--ob-line)]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(242,242,238,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,242,238,0.10)_1px,transparent_1px)] bg-[size:48px_48px] opacity-[0.04] dark:opacity-[0.05]" aria-hidden />
        <div className="relative mx-auto max-w-[1120px] px-6 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="max-w-[760px]">
            <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[var(--ob-line)] bg-[var(--ob-base)] px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ob-healthy)]" aria-hidden />
              <span className="font-mono text-[11px] font-medium tracking-[0.14em] text-[var(--ob-text-3)]">TECHNICAL PUBLISHER PROGRAM</span>
            </motion.div>

            <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1} className="text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--ob-text)] sm:text-[40px] lg:text-[46px]">
              Partner with RELIASTRA
              <span className="block font-normal tracking-[-0.02em] text-[var(--ob-text-3)]">Bring credible infrastructure intelligence to your audience.</span>
            </motion.h1>

            <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2} className="mt-5 max-w-[640px] text-[15px] leading-[1.6] text-[var(--ob-text-3)] sm:text-[16px]">
              RELIASTRA works with technical creators and publishers who cover cloud infrastructure, reliability, cybersecurity, DevOps, SaaS, and modern software systems - and whose audiences expect technical accuracy.
            </motion.p>

            <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate('signup')} className="h-11 rounded-[10px] bg-[var(--ob-raised)] px-7 text-sm font-medium text-[var(--ob-text)] hover:bg-[var(--ob-elevated)]">
                Apply to the Partner Program
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('premium')} className="h-11 rounded-[10px] border-[var(--ob-line-2)] bg-[var(--ob-void)] px-7 text-sm font-medium text-[var(--ob-text-2)] hover:bg-[var(--ob-base)] dark:bg-transparent">
                Explore RELIASTRA
              </Button>
            </motion.div>

            <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={4} className="mt-4 font-mono text-xs text-[var(--ob-text-4)]">
              For technical publishers with credible niche audiences · US, Canada, UK & EU
            </motion.p>
          </div>
        </div>
      </section>

      {/* ===== TRUST / CREDIBILITY - This company exists ===== */}
      <section className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-4)]">Institutional credibility</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">Built as infrastructure, not marketing.</h2>
            </div>
            <p className="max-w-[420px] text-sm leading-relaxed text-[var(--ob-text-3)]">RELIASTRA is real infrastructure software - not an affiliate platform with a product attached.</p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--ob-line)] bg-[var(--ob-elevated)] sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Network, title: 'Independent multi-region monitoring', desc: 'Continuous checks from distributed probes. Not self-reported status pages.' },
              { icon: BarChart3, title: 'Public tracking', desc: 'Live vendor status, uptime and incident history at /track - measured, not marketed.' },
              { icon: FileCheck2, title: 'Verifiable evidence', desc: 'Timestamped, checksummed SLA reports with incident correlation.' },
              { icon: BookOpen, title: 'Technical documentation', desc: 'Product docs, methodology notes, and integration guides.' },
              { icon: Code2, title: 'API availability', desc: 'Programmatic access for checks, incidents, and evidence where your plan allows.' },
              { icon: Lock, title: 'Security practices', desc: 'HMAC-signed share links, scoped audit logs, least-privilege RBAC.' },
            ].map((c) => (
              <div key={c.title} className="bg-[var(--ob-void)] p-6">
                <c.icon className="mb-3 size-5 text-[var(--ob-text-2)]" aria-hidden />
                <h3 className="text-sm font-semibold text-[var(--ob-text)]">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--ob-text-3)]">{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs text-[var(--ob-text-4)]">
            <Link href="/track" className="rounded-full border border-[var(--ob-line)] bg-[var(--ob-void)] px-3 py-1.5 hover:bg-[var(--ob-base)]">/track → public status</Link>
            <Link href="/privacy" className="rounded-full border border-[var(--ob-line)] bg-[var(--ob-void)] px-3 py-1.5 hover:bg-[var(--ob-base)]">Privacy</Link>
            <Link href="/terms" className="rounded-full border border-[var(--ob-line)] bg-[var(--ob-void)] px-3 py-1.5 hover:bg-[var(--ob-base)]">Terms</Link>
            <Link href="/support" className="rounded-full border border-[var(--ob-line)] bg-[var(--ob-void)] px-3 py-1.5 hover:bg-[var(--ob-base)]">Contact</Link>
          </div>
        </div>
      </section>

      {/* ===== WHY TECHNICAL PUBLISHERS ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-4)]">Why this partnership exists</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">Technical audiences care about what actually happens inside the infrastructure they depend on.</h2>
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-[var(--ob-text-3)]">
              Teams choosing databases, queues, auth providers, and cloud services don&apos;t need another uptime monitor. They need independent intelligence they can trust - and a publisher who can explain what it means for real systems.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--ob-line)] bg-[var(--ob-base)] p-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ob-text-4)]">Use RELIASTRA for</p>
            <ul className="mt-4 grid gap-2.5 text-sm leading-relaxed text-[var(--ob-text-2)]">
              {['Technical articles & deep dives', 'YouTube videos & walkthroughs', 'Newsletters & research briefs', 'Infrastructure explainers', 'Incident analysis & postmortems', 'Cloud reliability & dependency analysis', 'Cybersecurity / infra education', 'Product comparisons with evidence'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-2 h-px w-4 shrink-0 bg-[var(--ob-elevated)]" aria-hidden />{t}</li>
              ))}
            </ul>
            <p className="mt-5 border-t border-[var(--ob-line)] pt-4 font-mono text-xs text-[var(--ob-text-4)]">You are positioned as an independent technical publisher using a serious product - not a salesperson.</p>
          </div>
        </div>
      </section>

      {/* ===== WHAT PARTNERS RECEIVE ===== */}
      <section className="border-y border-[var(--ob-line)] bg-[var(--ob-base)]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-4)]">What partners receive</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">A professional partner account - restrained, not promotional.</h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-[var(--ob-line)] bg-[var(--ob-elevated)] sm:grid-cols-2 lg:grid-cols-3">
            {[
              { k: 'Revenue', v: 'Recurring commission for qualified referrals (30% of subscription, 90-day attribution, minimum payout, payable after hold).' },
              { k: 'Professional Partner Account', v: 'Dedicated dashboard for attribution, referrals, and earnings - isolated per partner, audited.' },
              { k: 'Product Access', v: 'Appropriate access so you can genuinely understand and demonstrate RELIASTRA.' },
              { k: 'Research / Data Access', v: 'Where appropriate: infrastructure observations, reports, and materials useful for technical content.' },
              { k: 'Partner Resources', v: 'Product assets, screenshots, technical explanations, briefs, and approved messaging - editorial integrity required.' },
              { k: 'Direct Relationship', v: 'Qualified partners have direct access to RELIASTRA - partnership, technical, and research discussions.' },
            ].map((c) => (
              <div key={c.k} className="bg-[var(--ob-void)] p-6">
                <h3 className="text-sm font-semibold text-[var(--ob-text)]">{c.k}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ob-text-3)]">{c.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-xs text-[var(--ob-text-4)]">No unlimited support promises. Resources are professional and proportionate to fit and audience quality.</p>
        </div>
      </section>

      {/* ===== DIRECT RELATIONSHIP ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ob-line)] bg-[var(--ob-base)] px-3 py-1.5">
              <Handshake className="size-4 text-[var(--ob-text-2)]" />
              <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--ob-text-3)]">DIRECT RELATIONSHIP</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">A direct relationship with RELIASTRA.</h2>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-[var(--ob-text-3)]">RELIASTRA is not an anonymous affiliate system. Approved partners have a human point of contact for the relationship - not a ticket queue.</p>
          </div>
          <div className="rounded-xl border border-[var(--ob-line)] bg-[var(--ob-void)] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ob-text-4)]">Qualified partners have direct access for</p>
            <ul className="mt-4 grid gap-2 text-sm text-[var(--ob-text-2)]">
              {['Partnership enquiries', 'Technical clarification', 'Collaboration opportunities', 'Content coordination', 'Research opportunities', 'Strategic discussions'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-2 h-px w-4 bg-[var(--ob-elevated)]" />{t}</li>
              ))}
            </ul>
            <p className="mt-5 rounded-lg bg-[var(--ob-base)] p-3 font-mono text-xs leading-relaxed text-[var(--ob-text-3)]">Qualified partners have direct access to the RELIASTRA team, including senior leadership where appropriate.</p>
          </div>
        </div>
      </section>

      {/* ===== PROFESSIONAL PLACEMENT ===== */}
      <section className="border-y border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">Professional placement. Editorial integrity matters.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ob-text-3)]">Your credibility is an asset. RELIASTRA reinforces it - never encourages unsupported claims. Sponsorship must be clearly disclosed.</p>
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
              <div key={c.t} className="rounded-xl border border-[var(--ob-line)] p-5">
                <h3 className="text-sm font-semibold text-[var(--ob-text)]">{c.t}</h3>
                <p className="mt-1 text-sm text-[var(--ob-text-3)]">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-4)]">How it works</p>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-[var(--ob-line)] bg-[var(--ob-elevated)] md:grid-cols-3 lg:grid-cols-6">
          {['Sign up', 'Get approved', 'Receive access & resources', 'Publish relevant technical content', 'Generate qualified referrals', 'Earn recurring commission'].map((s, i) => (
            <div key={s} className="bg-[var(--ob-void)] p-5">
              <div className="font-mono text-xs text-[var(--ob-text-4)]">0{i + 1}</div>
              <p className="mt-2 text-sm font-medium leading-snug text-[var(--ob-text)]">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== PARTNER QUALITY ===== */}
      <section className="border-y border-[var(--ob-line)] bg-[var(--ob-base)]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">Quality over volume.</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ob-text-3)]">RELIASTRA does not aim to build the largest partner directory. We work with publishers whose audiences genuinely care about infrastructure, reliability, security, and modern software systems. Selectivity, without fake exclusivity.</p>
          </div>
        </div>
      </section>

      {/* ===== IDEAL PARTNER ===== */}
      <section className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--ob-line)] bg-[var(--ob-void)] p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ob-text)]">You may be a strong fit if you</h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-[var(--ob-text-2)]">
              {['Publish technical content consistently', 'Have an audience interested in cloud, infrastructure, security, SaaS, DevOps, or software engineering', 'Care about technical accuracy', 'Have a credible publishing history', 'Prefer useful tools over generic sponsorships', 'Want long-term relationships rather than one-off promotions'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-[var(--ob-healthy)]" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--ob-line)] bg-[var(--ob-base)] p-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ob-text)]">Probably not a fit if you</h3>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-[var(--ob-text-3)]">
              {['Run primarily general entertainment/lifestyle content', 'Promote unrelated products indiscriminately', 'Publish misleading technical claims', 'Operate spam-heavy affiliate sites', 'Have no meaningful technical audience'].map((t) => (
                <li key={t} className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-[var(--ob-text-4)]" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== COMMISSION - clear, professional ===== */}
      <section className="border-y border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ob-text-4)]">Commission</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--ob-text)]">Transparent economics.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ob-text-3)]">A single rate, recurring, no tiers or hidden thresholds. Built for technical publishers who prefer predictable, long-term economics over one-time bounties.</p>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="text-5xl font-semibold tracking-[-0.03em] text-[var(--ob-text)]">30%</span>
                <span className="text-sm text-[var(--ob-text-3)]">recurring</span>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ob-line)]">
              <div className="grid grid-cols-1 divide-y divide-[var(--ob-line)]">
                {[
                  ['Attribution', '90-day cookie / link window'],
                  ['Recurring vs one-time', 'Recurring - as long as referral remains paying customer'],
                  ['When payable', 'After 30-day hold and minimum payout threshold'],
                  ['Payout method', 'Partner dashboard - bank / payout destination on file'],
                  ['Self-referrals', 'Excluded - no commission on your own signups'],
                  ['Fraud / abuse', 'Excluded - automated, bulk, or fraudulent referrals void'],
                  ['Eligibility', 'Applies to Pro plan referrals; terms may evolve, see Partner Agreement'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 px-5 py-3.5">
                    <span className="text-sm font-medium text-[var(--ob-text)]">{k}</span>
                    <span className="max-w-[60%] text-right text-sm text-[var(--ob-text-3)]">{v}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] px-5 py-3">
                <p className="font-mono text-xs text-[var(--ob-text-4)]">Example: $39 Pro → $11.70/mo to you. Customer pays $39, you earn 30% recurring.</p>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center font-mono text-xs text-[var(--ob-text-4)]">If a rule is not yet implemented, this page reflects only what is actually supported. See Partner Agreement for the binding terms.</p>
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
            <Link key={label} href={href} className="rounded-full border border-[var(--ob-line)] px-3 py-1.5 text-[var(--ob-text-3)] hover:bg-[var(--ob-base)]">
              {label}
            </Link>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-[var(--ob-text-4)]">
          This page withstands scrutiny from technical creators, software companies, agencies, investors, journalists, procurement, and cybersecurity professionals.
        </p>
      </section>

      {/* ===== FINAL CTA - restrained, premium ===== */}
      <section className="border-t border-[var(--ob-line)] bg-[var(--ob-raised)] text-[var(--ob-text)]">
        <div className="mx-auto max-w-[1120px] px-6 py-14 sm:px-8 sm:py-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ob-text-4)]">A professional relationship</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">Build with evidence. Publish with confidence.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--ob-text-4)]">Join technical publishers who bring credible infrastructure intelligence to their audiences - and earn recurring revenue for doing so.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" onClick={() => navigate('signup')} className="h-11 rounded-[10px] bg-[var(--ob-void)] px-7 text-sm font-medium text-[var(--ob-text)] hover:bg-[var(--ob-raised)]">
                Apply to the RELIASTRA Partner Program
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
              <Button variant="outline" size="lg" asChild className="h-11 rounded-[10px] border-[var(--ob-line-3)] bg-transparent px-7 text-sm font-medium text-[var(--ob-text)] hover:bg-[var(--ob-elevated)] hover:text-[var(--ob-text)]">
                <Link href="/support">Contact RELIASTRA</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
