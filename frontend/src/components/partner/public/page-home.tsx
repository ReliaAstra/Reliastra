'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  ShieldCheck,
  FileText,
  LayoutDashboard,
  Boxes,
  BookOpen,
  Users,
  CircleDollarSign,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePartnerStore } from '@/stores/partner-store';
import type { PartnerPage } from '@/types/partner';
import { CommissionBasisNote } from '../commission-basis-note';
import { readApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type NavigateFn = (page: PartnerPage) => void;

/* ────────────────────────────────────────────────────────────────────────────
   RELIASTRA Partner Program — landing page.

   Positioning: a partnership program for technical creators and publishers,
   not a generic affiliate scheme. Hierarchy: Trust → Fit → Value → Access →
   Economics → Application. Every claim on this page is backed by something
   that exists in the product: the commission policy, the public tracking
   surface, the evidence engine, the published documentation and legal pages.
   ──────────────────────────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </p>
  );
}

function SectionHead({
  id,
  label,
  title,
  lede,
}: {
  id?: string;
  label: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="max-w-2xl">
      <SectionLabel>{label}</SectionLabel>
      <h2
        id={id}
        className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
      >
        {title}
      </h2>
      {lede && (
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          {lede}
        </p>
      )}
    </div>
  );
}

/* ── Shared style constants ──────────────────────────────────────────────── */

const cyanLink =
  'inline-flex items-center gap-1 text-[13px] font-medium text-[#0891B2] underline-offset-4 hover:underline dark:text-[#22D3EE]';

/* ── Hero program facts (all real, product-backed numbers) ───────────────── */

const PROGRAM_FACTS = [
  { label: 'Commission rate', value: '30%', note: 'Recurring, all plans' },
  { label: 'Attribution', value: '90 days', note: 'First-party referral link' },
  { label: 'Minimum payout', value: '$50.00', note: 'Bank · USDC · USDT' },
  { label: 'Cost to join', value: 'Free', note: 'No fee, no obligation' },
];

export function PageHome() {
  const navigate = usePartnerStore((s) => s.navigate);

  return (
    <div className="bg-background text-foreground">
      <Hero navigate={navigate} />
      <TrustSection />
      <PublishersSection />
      <BenefitsSection />
      <AccessSection />
      <PlacementSection />
      <HowItWorks />
      <QualitySection />
      <FitSection />
      <ApplicationSection navigate={navigate} />
      <CommissionSection />
      <TransparencySection />
      <FinalCta navigate={navigate} />
    </div>
  );
}

/* ── 01 · HERO ────────────────────────────────────────────────────────────── */

function Hero({ navigate }: { navigate: NavigateFn }) {
  return (
    <section id="program" className="relative border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* Left — copy */}
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/30 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0891B2] dark:bg-[#22D3EE]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Partner Program · Technical Publishers
              </span>
            </div>

            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
              Partner with RELIASTRA
            </h1>
            <p className="mt-5 text-xl font-medium leading-snug tracking-tight text-foreground/90 sm:text-2xl">
              Bring credible infrastructure intelligence to your audience.
            </p>

            <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
              RELIASTRA works with technical creators and publishers who educate
              audiences about cloud infrastructure, reliability, cybersecurity,
              DevOps, SaaS, and modern software systems. We provide the
              infrastructure intelligence, evidence, data, and a serious product.
              You provide trusted distribution, education, analysis, and audience
              reach.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                onClick={() => navigate('signup')}
                className="h-11 gap-2 px-7 text-sm font-medium"
              >
                Apply to the Partner Program
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate('landing')}
                className="h-11 px-7 text-sm font-medium"
              >
                Explore RELIASTRA
              </Button>
            </div>

            <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground/90">
              A professional partnership for credible technical publishers — not a
              generic affiliate network. No fee to apply, no requirement to become
              a salesperson.
            </p>
          </div>

          {/* Right — program facts + public evidence strip */}
          <div className="lg:pt-2">
            <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Program at a glance
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                  Current program terms
                </span>
              </div>
              <dl>
                {PROGRAM_FACTS.map((f, i) => (
                  <div
                    key={f.label}
                    className={cn(
                      'flex items-center justify-between px-5 py-4',
                      i !== PROGRAM_FACTS.length - 1 && 'border-b border-border/50'
                    )}
                  >
                    <dt className="text-[13px] text-muted-foreground">
                      {f.label}
                      <span className="block text-[11px] text-muted-foreground/60">
                        {f.note}
                      </span>
                    </dt>
                    <dd className="font-mono text-lg font-semibold tabular-nums tracking-tight text-foreground">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <Link
              href="/track"
              className="group mt-4 flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-5 py-4 transition-colors hover:bg-muted/40"
            >
              <span className="flex items-center gap-3">
                <Activity className="size-4 text-[#0891B2] dark:text-[#22D3EE]" />
                <span className="text-[13px] text-muted-foreground">
                  Public infrastructure tracking — live, independent measurements
                  at{' '}
                  <span className="font-mono text-foreground">reliastra.com/track</span>
                </span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 02 · TRUST / CREDIBILITY ─────────────────────────────────────────────── */

const TRUST_ITEMS = [
  {
    icon: Activity,
    title: 'Public infrastructure tracking',
    body: 'Live, independent measurements of third-party services — real endpoints, real probe data, published at reliastra.com/track.',
    href: '/track',
    hrefLabel: 'View public tracking',
    external: false,
  },
  {
    icon: FileText,
    title: 'SLA evidence reports',
    body: 'Timestamped, independently verified evidence of vendor failures, generated from the platform\u2019s own observations — the core of the Pro product.',
    href: '/track',
    hrefLabel: 'See the evidence engine',
    external: false,
  },
  {
    icon: ShieldCheck,
    title: 'Deterministic attribution',
    body: 'Incident attribution is computed by a deterministic engine that correlates vendor failure with your own incidents — not heuristic status-page scraping.',
    href: 'https://api.reliastra.com/docs',
    hrefLabel: 'Read the API reference',
    external: true,
  },
  {
    icon: LayoutDashboard,
    title: 'Public API & documentation',
    body: 'A published OpenAPI reference, and API access included with the Pro plan. The product is inspectable, not a black box.',
    href: 'https://api.reliastra.com/docs',
    hrefLabel: 'Open documentation',
    external: true,
  },
  {
    icon: ShieldCheck,
    title: 'Security & data practice',
    body: 'First-party attribution, no third-party tracking in referral attribution, and published legal terms. Read the Privacy Policy.',
    href: '/privacy',
    hrefLabel: 'Read the Privacy Policy',
    external: false,
  },
  {
    icon: Users,
    title: 'Company & contact',
    body: 'Reliastra, Inc. — with published sales and billing contacts and a human support queue that answers every enquiry.',
    href: '/terms',
    hrefLabel: 'Company & terms',
    external: false,
  },
];

function TrustSection() {
  return (
    <section id="trust" className="border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="The platform behind the program"
          title="A real product, independently verifiable."
          lede="Before you attach your name to RELIASTRA, verify it the way your audience will. The product ships, the data is public, and the documentation is published."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="bg-background p-6 sm:p-7">
              <item.icon className="size-4 text-muted-foreground/60" />
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(cyanLink, 'mt-4')}
                >
                  {item.hrefLabel}
                  <ArrowUpRight className="size-3.5" />
                </a>
              ) : (
                <Link href={item.href} className={cn(cyanLink, 'mt-4')}>
                  {item.hrefLabel}
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted-foreground/80">
          We do not publish customer logos, press mentions, or aggregate
          statistics we cannot stand behind. What is verifiable — the product,
          the public data, and the terms — is linked above.
        </p>
      </div>
    </section>
  );
}

/* ── 03 · WHY TECHNICAL PUBLISHERS ────────────────────────────────────────── */

const CONTENT_TYPES = [
  'Technical articles',
  'YouTube videos',
  'Newsletters',
  'Research',
  'Infrastructure explainers',
  'Incident analysis',
  'Cloud reliability content',
  'Dependency analysis',
  'Cybersecurity / infrastructure education',
  'Product comparisons and technical commentary',
];

function PublishersSection() {
  return (
    <section id="publishers" className="border-b border-border/40 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHead
              label="Why the program exists"
              title="Your audience already asks the question RELIASTRA answers."
              lede="Technical audiences increasingly care about what actually happens inside the infrastructure they depend on. RELIASTRA produces useful infrastructure intelligence and evidence that can support the work you already do."
            />
            <p className="mt-6 max-w-xl border-l-2 border-border/70 pl-5 text-[15px] leading-relaxed text-muted-foreground">
              You are not required to become a salesperson. You are an
              independent technical publisher using a serious infrastructure
              product. Your credibility is the asset — and RELIASTRA is designed
              to reinforce it rather than spend it.
            </p>
          </div>

          <div>
            <SectionLabel>Material it can support</SectionLabel>
            <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {CONTENT_TYPES.map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-2.5 border-b border-border/50 py-3 text-[14px] text-foreground/90"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-[#0891B2] dark:bg-[#22D3EE]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 04 · WHAT PARTNERS RECEIVE ───────────────────────────────────────────── */

const BENEFITS = [
  {
    icon: CircleDollarSign,
    title: 'Revenue',
    body: 'A recurring commission of 30% on eligible subscription revenue from customers you refer, for as long as they remain subscribed.',
  },
  {
    icon: LayoutDashboard,
    title: 'Professional partner account',
    body: 'A dedicated partner dashboard for attribution, referrals, commissions, and earnings — the same evidence-grade tooling the rest of RELIASTRA is built on.',
  },
  {
    icon: Boxes,
    title: 'Product access',
    body: 'Appropriate access to RELIASTRA so you can genuinely understand and demonstrate the product. Start on the free plan; upgrade when it is useful.',
  },
  {
    icon: Activity,
    title: 'Research & data access',
    body: 'Where appropriate, data, reports, infrastructure observations, and product material useful for technical content.',
  },
  {
    icon: BookOpen,
    title: 'Partner resources',
    body: 'Product documentation, screenshots, technical explanations, product briefs, and approved messaging.',
  },
  {
    icon: Users,
    title: 'Direct relationship',
    body: 'Serious partners have a direct line to the RELIASTRA team — including senior leadership where appropriate — for collaboration, technical questions, and content coordination.',
  },
];

function BenefitsSection() {
  return (
    <section id="benefits" className="border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="What partners receive"
          title="Product, evidence, and a professional relationship."
          lede="RELIASTRA provides the substance. What it does not provide is scripted sales copy, or any expectation that you publish it."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="bg-background p-6 sm:p-7">
              <b.icon className="size-4 text-muted-foreground/60" />
              <h3 className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
                {b.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 05 · DIRECT RELATIONSHIP / HUMAN TRUST ───────────────────────────────── */

const ACCESS_POINTS = [
  'Partnership enquiries',
  'Technical clarification',
  'Collaboration opportunities',
  'Content coordination',
  'Research opportunities',
  'Strategic discussions',
];

function AccessSection() {
  return (
    <section id="access" className="border-b border-border/40 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHead
              label="A direct relationship"
              title="A direct relationship with RELIASTRA."
              lede="This is not an anonymous affiliate system. Qualified partners have direct access to the RELIASTRA team — including senior leadership where appropriate — for:"
            />
            <ul className="mt-6 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {ACCESS_POINTS.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2.5 border-b border-border/50 py-3 text-[14px] text-foreground/90"
                >
                  <span className="h-1 w-1 shrink-0 rounded-full bg-[#0891B2] dark:bg-[#22D3EE]" />
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-muted-foreground/90">
              There are real people accountable for this relationship — not a
              referral link left unattended.
            </p>
          </div>

          {/* Founder card */}
          <div className="lg:pt-2">
            <div className="rounded-lg border border-border/70 bg-background p-7 sm:p-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Founder &amp; Principal Contact
              </p>

              <div className="mt-6 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/40">
                  <span className="text-base font-semibold text-foreground">EO</span>
                </div>
                <div>
                  <p className="text-[15px] font-semibold tracking-tight text-foreground">
                    Emmanuel Osei
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Founder &amp; CEO, RELIASTRA
                  </p>
                </div>
              </div>

              <p className="mt-6 text-[14px] leading-relaxed text-muted-foreground">
                &ldquo;RELIASTRA exists because infrastructure teams needed
                independent evidence of what actually happened when a dependency
                failed. I am directly involved in the partner program, and
                available to serious publishers for collaboration, technical
                questions, and content opportunities.&rdquo;
              </p>

              <div className="mt-6 border-t border-border/60 pt-5">
                <p className="text-[13px] leading-relaxed text-muted-foreground/90">
                  For serious collaboration, qualified partners are connected
                  with the right person — including senior leadership where the
                  work warrants it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 06 · PROFESSIONAL PLACEMENT ──────────────────────────────────────────── */

const CHANNELS = [
  'Technical articles',
  'Editorial references',
  'Tutorials',
  'YouTube videos',
  'Newsletters',
  'Product walkthroughs',
  'Infrastructure research',
  'Technical comparisons',
  'Resource pages',
  'Relevant educational content',
  'Appropriate website placements',
  'Sponsored editorial, where explicitly disclosed',
];

function PlacementSection() {
  return (
    <section id="placement" className="border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="How partners feature RELIASTRA"
          title="Professional placement, not coupon codes."
          lede="Partners promote RELIASTRA the way serious publishers cover any serious tool — through useful, accurate content for an audience that cares."
        />

        <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <li
                key={c}
                className="flex items-center gap-2.5 border-b border-border/50 py-3 text-[14px] text-foreground/90"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-[#0891B2] dark:bg-[#22D3EE]" />
                {c}
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-7 sm:p-8">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-[#0891B2] dark:text-[#22D3EE]" />
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                Editorial integrity matters
              </h3>
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-muted-foreground">
              Partners are never expected to make unsupported claims.
              Advertising and sponsorship should be clearly disclosed where
              required. Your credibility is an asset — RELIASTRA is built to
              reinforce it, not to damage it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 07 · HOW IT WORKS ────────────────────────────────────────────────────── */

const STEPS = [
  {
    n: '01',
    title: 'Apply',
    body: 'Create your account and verify your email. There is no fee and no waiting list.',
  },
  {
    n: '02',
    title: 'Receive access',
    body: 'Your partner account, referral link, and resources are issued immediately.',
  },
  {
    n: '03',
    title: 'Publish',
    body: 'Publish relevant technical content for an audience that cares about infrastructure, reliability, and security.',
  },
  {
    n: '04',
    title: 'Refer',
    body: 'Qualified readers sign up through your referral link. Attribution is recorded at signup, and self-referrals are excluded.',
  },
  {
    n: '05',
    title: 'Earn',
    body: 'Earn a 30% recurring commission on eligible subscription revenue. Commissions become payable after the 30-day hold.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border/40 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="How it works"
          title="A simple, structured process."
          lede="Five steps, no unnecessary complexity. Activation is immediate; commission eligibility begins when a referred customer subscribes."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 md:grid-cols-5">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-background p-6">
              <span className="font-mono text-[13px] tracking-widest text-muted-foreground/50">
                {s.n}
              </span>
              <h3 className="mt-3 text-[14px] font-semibold tracking-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 08 · PARTNER QUALITY ─────────────────────────────────────────────────── */

function QualitySection() {
  return (
    <section id="quality" className="border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>Quality over volume</SectionLabel>
          <blockquote className="text-2xl font-medium leading-snug tracking-tight text-foreground sm:text-[28px]">
            &ldquo;RELIASTRA does not aim to build the largest partner
            directory. We aim to work with publishers whose audiences genuinely
            care about infrastructure, reliability, security, and modern
            software systems.&rdquo;
          </blockquote>
          <p className="mx-auto mt-6 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            The program is open to credible technical publishers. We would rather
            support a smaller number of partners well than a larger number
            poorly. There is no artificial cap — only a clear standard.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── 09 · IDEAL PARTNER ───────────────────────────────────────────────────── */

const FIT_ITEMS = [
  'Publish technical content consistently',
  'Have an audience interested in cloud, infrastructure, security, SaaS, DevOps, or software engineering',
  'Care about technical accuracy',
  'Have a credible publishing history',
  'Prefer useful tools over generic sponsorships',
  'Want long-term relationships rather than one-off promotions',
];

const NOT_FIT_ITEMS = [
  'Run primarily general entertainment or lifestyle content',
  'Promote unrelated products indiscriminately',
  'Publish misleading technical claims',
  'Operate spam-heavy affiliate sites',
  'Have no meaningful technical audience',
];

function FitSection() {
  return (
    <section id="fit" className="border-b border-border/40 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="Fit"
          title="Who this program is for."
          lede="A clear definition of fit — for you and for us. If the first column describes you, we would welcome an application."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background p-7 sm:p-8">
            <div className="flex items-center gap-2.5">
              <Check className="size-4 text-[#16A34A] dark:text-[#22C55E]" />
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                You may be a strong fit if you
              </h3>
            </div>
            <ul className="mt-5 space-y-3">
              {FIT_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-foreground/90">
                  <span className="mt-2 h-px w-4 shrink-0 bg-border" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border/70 bg-background p-7 sm:p-8">
            <div className="flex items-center gap-2.5">
              <X className="size-4 text-muted-foreground/60" />
              <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                Probably not a fit if you
              </h3>
            </div>
            <ul className="mt-5 space-y-3">
              {NOT_FIT_ITEMS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-px w-4 shrink-0 bg-border" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-border/60 pt-5 text-[13px] leading-relaxed text-muted-foreground/80">
              None of this is a judgment on your work — it is a definition of
              where the partnership is genuinely useful on both sides.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 10 · APPLICATION ─────────────────────────────────────────────────────── */

function ApplicationSection({
  navigate,
}: {
  navigate: NavigateFn;
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    website: '',
    platform: '',
    publication: '',
    category: '',
    geography: '',
    audience: '',
    recentWork: '',
    why: '',
    how: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<any>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !form.website.trim() ||
      !form.platform ||
      !form.publication.trim() ||
      !form.category ||
      !form.geography ||
      !form.audience ||
      !form.why.trim() ||
      !form.how.trim()
    ) {
      setError('Please complete all required fields before submitting.');
      return;
    }

    setLoading(true);

    const subject = `Partner application — ${form.name.trim()}`;
    const message = [
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      `Website: ${form.website.trim()}`,
      `Primary platform: ${form.platform}`,
      `Publication / audience: ${form.publication.trim()}`,
      `Content category: ${form.category}`,
      `Audience geography: ${form.geography}`,
      `Approximate audience size: ${form.audience}`,
      `Recent technical content: ${form.recentWork.trim() || '—'}`,
      ``,
      `Why RELIASTRA: ${form.why.trim()}`,
      `How I expect to feature RELIASTRA: ${form.how.trim()}`,
    ].join('\n');

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), subject, message }),
      });

      if (!res.ok) {
        const apiError = await readApiError(res, 'Submission failed');
        throw new Error(apiError.message);
      }

      setSubmitted(true);
      toast.success('Application received — the RELIASTRA team will respond');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('reach') || msg.includes('fetch')) {
        setError('Unable to reach RELIASTRA. Please check your connection and try again.');
      } else {
        setError(msg || 'Unable to submit your application. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

  return (
    <section id="apply" className="border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* Left — process */}
          <div>
            <SectionHead
              label="Application"
              title="Apply to the Partner Program."
              lede="A short, structured intake. There is no fee and no obligation. Creating your account activates the program immediately; the intake below helps us support your work properly."
            />

            <div className="mt-8 space-y-4">
              {[
                {
                  n: '1',
                  title: 'Create your account',
                  body: 'Name, email, and password — then verify your email. Activation is immediate and free.',
                },
                {
                  n: '2',
                  title: 'Receive partner access',
                  body: 'Your partner dashboard and referral link are issued at once.',
                },
                {
                  n: '3',
                  title: 'Share your publication context',
                  body: 'The intake on the right reaches the team directly, so we can support your work from day one.',
                },
              ].map((s) => (
                <div key={s.n} className="flex gap-4">
                  <span className="font-mono text-[13px] tracking-widest text-muted-foreground/50">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold tracking-tight text-foreground">
                      {s.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {s.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <Button
                onClick={() => navigate('signup')}
                className="h-11 gap-2 px-6 text-sm font-medium"
              >
                Apply to the Partner Program
                <ArrowRight className="size-4" />
              </Button>
              <p className="mt-3 text-[12px] text-muted-foreground/80">
                Formal activation. Your referral link is issued immediately after
                email verification.
              </p>
            </div>
          </div>

          {/* Right — intake form */}
          <div className="rounded-lg border border-border/70 bg-background p-6 sm:p-8">
            {submitted ? (
              <div className="py-6 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-muted/30">
                  <Check className="size-5 text-[#16A34A] dark:text-[#22C55E]" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Application received
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
                  Thank you. The RELIASTRA team will review your publication and
                  respond to{' '}
                  <span className="font-mono text-[13px] text-foreground">
                    {form.email.trim()}
                  </span>
                  . To activate your partner account now:
                </p>
                <Button
                  onClick={() => navigate('signup')}
                  className="mt-6 h-11 gap-2 px-6 text-sm font-medium"
                >
                  Create your partner account
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Partnership intake
                </p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                  Tell us about your publication
                </h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  This reaches the team directly and is not used for anything
                  except your application.
                </p>

                {error && (
                  <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="app-name" className="text-xs font-mono uppercase tracking-wider">
                        Name
                      </Label>
                      <Input id="app-name" value={form.name} onChange={set('name')} placeholder="Jane Doe" autoComplete="name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="app-email" className="text-xs font-mono uppercase tracking-wider">
                        Email
                      </Label>
                      <Input id="app-email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="app-website" className="text-xs font-mono uppercase tracking-wider">
                        Website
                      </Label>
                      <Input id="app-website" value={form.website} onChange={set('website')} placeholder="https://…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="app-platform" className="text-xs font-mono uppercase tracking-wider">
                        Primary platform
                      </Label>
                      <select id="app-platform" value={form.platform} onChange={set('platform')} className={selectClass}>
                        <option value="" disabled>Select…</option>
                        <option>YouTube</option>
                        <option>Newsletter</option>
                        <option>Blog / website</option>
                        <option>X (Twitter)</option>
                        <option>LinkedIn</option>
                        <option>Podcast</option>
                        <option>Twitch / livestream</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="app-publication" className="text-xs font-mono uppercase tracking-wider">
                      Publication / audience
                    </Label>
                    <Input id="app-publication" value={form.publication} onChange={set('publication')} placeholder="The name of your channel, newsletter, or publication" />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="app-category" className="text-xs font-mono uppercase tracking-wider">
                        Content category
                      </Label>
                      <select id="app-category" value={form.category} onChange={set('category')} className={selectClass}>
                        <option value="" disabled>Select…</option>
                        <option>Cloud infrastructure</option>
                        <option>DevOps</option>
                        <option>Cybersecurity</option>
                        <option>SaaS</option>
                        <option>Developer tools</option>
                        <option>AI infrastructure</option>
                        <option>Reliability / SRE</option>
                        <option>Software engineering</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="app-geography" className="text-xs font-mono uppercase tracking-wider">
                        Audience geography
                      </Label>
                      <select id="app-geography" value={form.geography} onChange={set('geography')} className={selectClass}>
                        <option value="" disabled>Select…</option>
                        <option>Global</option>
                        <option>North America</option>
                        <option>United Kingdom</option>
                        <option>Europe</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="app-audience" className="text-xs font-mono uppercase tracking-wider">
                        Approx. audience size
                      </Label>
                      <select id="app-audience" value={form.audience} onChange={set('audience')} className={selectClass}>
                        <option value="" disabled>Select…</option>
                        <option>Under 1,000</option>
                        <option>1,000 – 10,000</option>
                        <option>10,000 – 50,000</option>
                        <option>50,000 – 250,000</option>
                        <option>250,000+</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="app-recent" className="text-xs font-mono uppercase tracking-wider">
                      Examples of recent technical content <span className="text-muted-foreground/60">(optional)</span>
                    </Label>
                    <Textarea id="app-recent" value={form.recentWork} onChange={set('recentWork')} rows={2} placeholder="Links to 1–3 recent pieces your audience values." className="resize-none" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="app-why" className="text-xs font-mono uppercase tracking-wider">
                      Why do you want to work with RELIASTRA?
                    </Label>
                    <Textarea id="app-why" value={form.why} onChange={set('why')} rows={3} placeholder="A few sentences on why this is a fit for your publication." className="resize-none" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="app-how" className="text-xs font-mono uppercase tracking-wider">
                      How do you expect to feature RELIASTRA?
                    </Label>
                    <Textarea id="app-how" value={form.how} onChange={set('how')} rows={3} placeholder="Articles, tutorials, videos, newsletter mentions — in your own words." className="resize-none" />
                  </div>

                  <Button type="submit" disabled={loading} className="h-11 w-full text-sm font-medium">
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      'Submit application'
                    )}
                  </Button>

                  <p className="text-center text-[12px] leading-relaxed text-muted-foreground/80">
                    Submitting reaches the RELIASTRA team. It does not create an
                    account. You may also{' '}
                    <button
                      type="button"
                      onClick={() => navigate('signup')}
                      className="font-medium text-[#0891B2] underline-offset-4 hover:underline dark:text-[#22D3EE]"
                    >
                      create your account
                    </button>{' '}
                    directly.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 11 · COMMISSION ──────────────────────────────────────────────────────── */

const COMMISSION_TERMS = [
  {
    title: 'Rate',
    body: '30% of eligible subscription revenue, recurring — every month a referred customer remains subscribed. The rate applies uniformly across all plans.',
  },
  {
    title: 'Attribution',
    body: 'Attribution is via your unique referral link (reliastra.com/r/{code}). The link is first-party, stored for 90 days, and recorded at signup. Self-referrals are not eligible.',
  },
  {
    title: 'When commissions are earned',
    body: 'Commission is recorded only from confirmed payments — never from signups. Each commission is held for 30 days to cover refunds and chargebacks, then becomes payable.',
  },
  {
    title: 'Payout',
    body: 'Minimum payout of $50.00, paid via bank transfer, USDC, or USDT. Refunds and chargebacks reverse the associated commission; a churned customer stops future accrual.',
  },
];

function CommissionSection() {
  return (
    <section id="commission" className="border-b border-border/40 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="Commission"
          title="The economics, stated plainly."
          lede="No hidden thresholds, no tiers to negotiate, no caps. The structure below is what the product actually implements."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Left — worked example */}
          <div className="rounded-lg border border-border/70 bg-background p-7 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Worked example
            </p>

            <div className="mt-6 flex items-center gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">
                  Pro subscription
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  $39<span className="text-base text-muted-foreground">/mo</span>
                </p>
              </div>
              <ArrowRight className="mx-2 size-5 shrink-0 text-muted-foreground/40" />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground/70">
                  Your commission (30%)
                </p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  $11.70<span className="text-base text-muted-foreground">/mo</span>
                </p>
              </div>
            </div>

            <p className="mt-6 border-t border-border/60 pt-5 text-[13px] leading-relaxed text-muted-foreground">
              While that customer remains subscribed. Ten active referred
              customers at that rate is{' '}
              <span className="font-mono text-foreground">$117.00/mo</span> — for
              illustration, based on the published Pro list price.
            </p>

            <div className="mt-5">
              <CommissionBasisNote />
            </div>
          </div>

          {/* Right — terms */}
          <div className="grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 sm:grid-cols-2">
            {COMMISSION_TERMS.map((t) => (
              <div key={t.title} className="bg-background p-6">
                <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
                  {t.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 12 · TRUST & TRANSPARENCY ────────────────────────────────────────────── */

const TRANSPARENCY_LINKS: {
  label: string;
  desc: string;
  href: string;
  external?: boolean;
  page?: PartnerPage;
}[] = [
  {
    label: 'Partner terms',
    desc: 'The agreement that governs the partner program.',
    page: 'terms',
    href: '',
  },
  {
    label: 'Privacy Policy',
    desc: 'How data is collected, stored, and used.',
    href: '/privacy',
  },
  {
    label: 'Public tracking',
    desc: 'Live, independent measurements of third-party services.',
    href: '/track',
  },
  {
    label: 'API documentation',
    desc: 'The published OpenAPI reference for the platform.',
    href: 'https://api.reliastra.com/docs',
    external: true,
  },
  {
    label: 'Contact',
    desc: 'A human support queue that answers every enquiry.',
    page: 'support',
    href: '',
  },
  {
    label: 'Terms of Service',
    desc: 'The terms under which the product is provided.',
    href: '/terms',
  },
];

function TransparencySection() {
  const navigate = usePartnerStore((s) => s.navigate);

  return (
    <section id="trust-links" className="border-b border-border/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <SectionHead
          label="Trust & transparency"
          title="Built to withstand scrutiny."
          lede="Everything below is published and reachable — the kind of page a journalist, a procurement professional, or a cybersecurity reviewer could open and verify."
        />

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
          {TRANSPARENCY_LINKS.map((l) => {
            const inner = (
              <>
                <h3 className="text-[14px] font-semibold tracking-tight text-foreground">
                  {l.label}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                  {l.desc}
                </p>
              </>
            );
            const className = 'block bg-background p-6 transition-colors hover:bg-muted/30';

            if (l.page) {
              const page = l.page;
              return (
                <button
                  key={l.label}
                  onClick={() => navigate(page)}
                  className={cn(className, 'text-left')}
                >
                  {inner}
                </button>
              );
            }
            if (l.external) {
              return (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {inner}
                </a>
              );
            }
            return (
              <Link key={l.label} href={l.href} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 13 · FINAL CTA ───────────────────────────────────────────────────────── */

function FinalCta({ navigate }: { navigate: NavigateFn }) {
  return (
    <section className="bg-neutral-950 text-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>
            <span className="text-neutral-400">Partner Program</span>
          </SectionLabel>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Build with evidence.
            <br />
            Publish with confidence.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-neutral-400">
            A professional partnership for technical publishers who cover
            infrastructure, reliability, security, and modern software systems.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => navigate('signup')}
              className="h-11 gap-2 bg-neutral-50 px-7 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
            >
              Apply to the Partner Program
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('support')}
              className="h-11 border-neutral-700 px-7 text-sm font-medium text-neutral-200 hover:bg-neutral-900 hover:text-neutral-50"
            >
              Contact RELIASTRA
            </Button>
          </div>

          <p className="mt-8 text-[12px] text-neutral-500">
            The beginning of a professional relationship — not a link, left
            unattended.
          </p>
        </div>
      </div>
    </section>
  );
}
