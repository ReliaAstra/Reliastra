import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLink,
  Container,
  DataRow,
  Eyebrow,
  Section,
  SectionHeader,
} from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES, partnerUrl } from '@/lib/routes';

/* ── 02 · The problem ───────────────────────────────────────────────────── */

/**
 * The dependency classes named below are examples of what the product is
 * built to observe. They are rendered as text, never as logos: a logo wall on
 * a marketing site reads as an endorsement, and RELIASTRA has no relationship
 * with these companies. The caption says so explicitly.
 */
const DEPENDENCY_CLASSES: [string, string[]][] = [
  ['Payments', ['Stripe', 'Paystack', 'Adyen']],
  ['Identity', ['Auth0', 'Okta', 'Clerk']],
  ['Compute & edge', ['AWS', 'Cloudflare', 'Vercel']],
  ['Model APIs', ['OpenAI', 'Anthropic', 'Mistral']],
  ['Messaging', ['Twilio', 'SendGrid', 'Postmark']],
  ['Data & DNS', ['Managed Postgres', 'Redis', 'Route 53']],
];

export function ProblemSection() {
  return (
    <Section id="problem" tone="void" aria-labelledby="problem-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="02">The problem</Eyebrow>
            <h2 id="problem-title" className="ob-h2 max-w-[18ch]">
              You are accountable for infrastructure you do not operate.
            </h2>
            <p className="ob-body-lg">
              A modern application is mostly other people’s systems. Payments,
              identity, delivery, storage, inference, DNS — each one is a
              dependency with its own failure modes, its own status page, and
              its own commercial interest in how an outage is described.
            </p>
            <p className="ob-body">
              When something breaks, your monitoring tells you <em>what</em>{' '}
              broke inside your perimeter. It rarely tells you <em>why</em>, and
              it never tells you whose fault it was. The vendor’s status page is
              written by the vendor. Your logs stop at your edge. The gap
              between those two records is where postmortems stall, SLA claims
              die, and customers stop believing you.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-px sm:grid-cols-2">
              {DEPENDENCY_CLASSES.map(([label, examples]) => (
                <div
                  key={label}
                  className="border-t border-[var(--ob-line)] py-5 sm:pr-8"
                >
                  <p className="ob-label mb-3">{label}</p>
                  <ul className="flex flex-col gap-1.5">
                    {examples.map((e) => (
                      <li
                        key={e}
                        className="text-[14.5px] leading-snug text-[var(--ob-text-2)]"
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="ob-small max-w-[52ch] border-t border-[var(--ob-line)] pt-5">
              Examples of the dependency classes RELIASTRA is built to observe.
              Any HTTP endpoint can be monitored. Naming a service here
              indicates no relationship, endorsement or partnership with it.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── 03 · What RELIASTRA is ─────────────────────────────────────────────── */

export function EvidenceLayerSection() {
  return (
    <section
      className="relative overflow-hidden border-t border-[var(--ob-line)] bg-[var(--ob-void)]"
      aria-labelledby="layer-title"
    >
      <div className="absolute inset-0">
        <Image
          src="/media/fiber-patch-panel.jpg"
          alt="Dense single-mode fibre jumpers dressed into a carrier patch panel, connectors seated in rows of illuminated ports."
          fill
          sizes="100vw"
          quality={70}
          loading="lazy"
          className="ob-photo object-cover object-center opacity-45"
        />
        <div className="ob-scrim-left absolute inset-0" aria-hidden />
        <div
          className="absolute inset-0 bg-[var(--ob-void)]/45"
          aria-hidden
        />
      </div>

      <Container className="relative py-24 md:py-36 lg:py-44">
        <div className="max-w-[46rem]">
          <Eyebrow index="03">RELIASTRA</Eyebrow>
          <h2 id="layer-title" className="ob-h1 mt-6 max-w-[16ch]">
            An independent evidence layer around your dependencies.
          </h2>
          <p className="ob-body-lg mt-7">
            RELIASTRA sits outside your infrastructure and outside your
            vendors’. It measures the external services you depend on from
            regions neither party controls, keeps every observation, and turns
            that record into something you can hand to a vendor, an auditor, a
            board or a customer.
          </p>
          <p className="ob-body mt-5">
            It is not another uptime checker pointed at your own site. It is the
            third record — the one nobody in the argument owns.
          </p>
          <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
            <ArrowLink href={PUBLIC_ROUTES.externalDependencyIntelligence}>
              What External Dependency Intelligence means
            </ArrowLink>
            <ArrowLink href={PUBLIC_ROUTES.product}>Platform overview</ArrowLink>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ── 04 · How it works ──────────────────────────────────────────────────── */

const STEPS: { n: string; title: string; body: string; href: string }[] = [
  {
    n: '01',
    title: 'Observe',
    body: 'Every dependency is checked on a fixed interval from multiple regions, on infrastructure that belongs to neither you nor the vendor. Each check records latency, status code, and the region it originated from.',
    href: PUBLIC_ROUTES.dependencyMonitoring,
  },
  {
    n: '02',
    title: 'Correlate',
    body: 'Regional results are resolved into a single verdict by quorum, so one bad probe is not an outage. Confirmed vendor degradation is then aligned against the timeline of your own incident.',
    href: PUBLIC_ROUTES.incidentEvidence,
  },
  {
    n: '03',
    title: 'Document',
    body: 'A confirmed event becomes a durable record: start, end, duration, severity, the regions that saw it, and the observations underneath it. Nothing is backfilled and nothing is inferred.',
    href: PUBLIC_ROUTES.slaEvidence,
  },
  {
    n: '04',
    title: 'Prove',
    body: 'The record is exported as a timestamped, checksummed evidence report you can attach to a vendor support case, a customer postmortem, or an internal review.',
    href: PUBLIC_ROUTES.docsEvidence,
  },
];

export function HowItWorksSection() {
  return (
    <Section id="how-it-works" tone="base" aria-labelledby="how-title">
      <Container>
        <SectionHeader
          index="04"
          eyebrow="Method"
          id="how-title"
          title="Observe. Correlate. Document. Prove."
          lede="Four stages, in order. Each one only accepts what the stage before it can support."
        />

        <ol className="mt-16 grid gap-px md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex flex-col gap-4 border-t border-[var(--ob-line)] pt-7 xl:pr-8"
            >
              <span className="ob-label text-[var(--ob-signal)]">{step.n}</span>
              <h3 className="ob-h3">{step.title}</h3>
              <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                {step.body}
              </p>
              <Link
                href={step.href}
                className="mt-auto pt-3 text-[12.5px] font-medium text-[var(--ob-text-4)] transition-colors hover:text-[var(--ob-signal)]"
              >
                Detail →
              </Link>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}

/* ── 05 · The dependency chain ──────────────────────────────────────────── */

const CHAIN: { label: string; note: string }[] = [
  { label: 'Organization', note: 'The business carrying the obligation' },
  { label: 'Application', note: 'What your customers actually touch' },
  { label: 'External dependencies', note: 'The services you do not operate' },
  { label: 'Observed telemetry', note: 'Multi-region checks, retained per plan' },
  { label: 'Evidence', note: 'Timestamped, checksummed, exportable' },
  { label: 'Attribution', note: 'Which party the failure belongs to' },
];

export function DependencyChainSection() {
  return (
    <Section id="chain" tone="void" aria-labelledby="chain-title">
      <Container>
        <SectionHeader
          index="05"
          eyebrow="External Dependency Intelligence"
          id="chain-title"
          title="From a business obligation to a provable cause."
          lede="Accountability travels down this chain. RELIASTRA instruments the three links at the bottom, which are the three nobody else keeps."
        />

        <ol className="mt-16 grid gap-px lg:grid-cols-6">
          {CHAIN.map((node, i) => {
            const instrumented = i >= 3;
            return (
              <li
                key={node.label}
                className="relative flex gap-5 border-t border-[var(--ob-line)] pt-6 lg:flex-col lg:gap-4 lg:pr-6"
              >
                <span
                  aria-hidden
                  className="ob-label shrink-0 pt-0.5"
                  style={
                    instrumented ? { color: 'var(--ob-signal)' } : undefined
                  }
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[var(--ob-text)]">
                    {node.label}
                  </h3>
                  <p className="text-[13px] leading-[1.55] text-[var(--ob-text-4)]">
                    {node.note}
                  </p>
                  {instrumented && (
                    <span className="ob-label mt-1 text-[var(--ob-signal)]">
                      RELIASTRA
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Container>
    </Section>
  );
}

/* ── 06 · Evidence artifact ─────────────────────────────────────────────── */

/**
 * A structural preview of the evidence artifact.
 *
 * This is deliberately NOT a screenshot of a dashboard, and deliberately NOT
 * presented as a real incident. Every field name below is a field the product
 * actually produces; the values are illustrative and the panel says so in its
 * own header. Fabricating a "real" incident on the marketing page of an
 * evidence product would be self-defeating.
 */
export function EvidenceArtifactSection() {
  return (
    <Section id="evidence" tone="base" aria-labelledby="evidence-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="06">Evidence</Eyebrow>
            <h2 id="evidence-title" className="ob-h2 max-w-[15ch]">
              A record that survives the incident.
            </h2>
            <p className="ob-body">
              Chat scrollback and a screenshot of a status page are not
              evidence. An evidence report is a structured artifact: what was
              observed, from where, when it started, when it recovered, how
              confident the verdict is, and a checksum so the file can be shown
              to be unaltered.
            </p>
            <p className="ob-body">
              Evidence generation and deterministic attribution are Pro
              capabilities. Every new organization starts on a 14-day Pro trial,
              so you can produce a real one before you decide anything.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              <ArrowLink href={PUBLIC_ROUTES.slaEvidence}>
                How SLA evidence works
              </ArrowLink>
              <ArrowLink href={PUBLIC_ROUTES.docsEvidence}>
                Evidence documentation
              </ArrowLink>
            </div>
          </div>

          <figure className="ob-inset overflow-hidden">
            <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ob-line)] px-5 py-3.5">
              <span className="ob-label">Evidence report · field structure</span>
              <span className="ob-label text-[var(--ob-signal)]">
                Illustrative values
              </span>
            </figcaption>

            <dl className="px-5 pb-2">
              {[
                ['report_id', 'ev_01JD4M2Q7X8A3RK9TZ0B'],
                ['dependency', 'payments-api'],
                ['window_start', '2025-11-14T09:12:41Z'],
                ['window_end', '2025-11-14T09:48:06Z'],
                ['duration', '35m 25s'],
                ['severity', 'major'],
                ['observed_from', 'eu-west-1 · us-east-1 · ap-south-1'],
                ['quorum', '3 of 3 regions failing'],
                ['attribution', 'external_dependency'],
                ['confidence', 'high'],
                ['observations', '142 checks retained'],
                ['sha256', '9f2c…a417'],
              ].map(([k, v], i) => (
                <div
                  key={k}
                  className={`flex items-baseline justify-between gap-6 py-2.5 ${
                    i > 0 ? 'border-t border-[var(--ob-line)]' : ''
                  }`}
                >
                  <dt className="ob-mono text-[var(--ob-text-4)]">{k}</dt>
                  <dd className="ob-mono text-right text-[var(--ob-text)]">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="border-t border-[var(--ob-line)] px-5 py-3.5 text-[12px] leading-[1.55] text-[var(--ob-text-4)]">
              Field names match the artifact RELIASTRA generates. The values
              above are an example, not a recorded incident.
            </p>
          </figure>
        </div>
      </Container>
    </Section>
  );
}

/* ── 09 · Agencies and MSPs ─────────────────────────────────────────────── */

export function AgenciesSection() {
  return (
    <section
      className="relative overflow-hidden border-t border-[var(--ob-line)]"
      aria-labelledby="agencies-title"
    >
      <div className="absolute inset-0">
        <Image
          src="/media/noc-operations.jpg"
          alt="An unattended network operations room at night, desks dark and a wall of dimmed telemetry displays showing muted charts."
          fill
          sizes="100vw"
          quality={70}
          loading="lazy"
          className="ob-photo object-cover object-center opacity-40"
        />
        <div className="absolute inset-0 bg-[var(--ob-void)]/70" aria-hidden />
      </div>

      <Container className="relative py-24 md:py-32">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="09">Agencies · MSPs · consultancies</Eyebrow>
            <h2 id="agencies-title" className="ob-h2 max-w-[17ch]">
              You are held responsible for stacks you inherited.
            </h2>
            <p className="ob-body-lg">
              When a client’s checkout stops working, the call comes to you —
              regardless of whether the fault is in your code, their
              configuration, or a payment provider two networks away. Without an
              independent record, that conversation is decided by whoever
              sounds most certain.
            </p>
          </div>

          <dl className="flex flex-col">
            {[
              [
                'Separate what you own from what you don’t',
                'Client work is isolated into its own group, so each engagement has its own dependencies, incidents and evidence.',
              ],
              [
                'Answer the client before they ask',
                'Vendor degradation that touches a client’s stack is attributed and documented while the incident is still open.',
              ],
              [
                'Hand over something durable',
                'Client-facing reports and shareable portals mean the retainer conversation is about a record, not a recollection.',
              ],
            ].map(([term, desc]) => (
              <div
                key={term}
                className="border-t border-[var(--ob-line)] py-6"
              >
                <dt className="text-[15.5px] font-semibold leading-snug text-[var(--ob-text)]">
                  {term}
                </dt>
                <dd className="mt-2 max-w-[58ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                  {desc}
                </dd>
              </div>
            ))}
            <p className="ob-small mt-5 max-w-[58ch]">
              Client groups, client-facing reports and white-label branding are
              Enterprise capabilities. The{' '}
              <Link href={PUBLIC_ROUTES.agencies} className="ob-link">
                agency page
              </Link>{' '}
              shows the workflow, the console and what each plan grants.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Link
                href={PUBLIC_ROUTES.agencies}
                className="ob-btn ob-btn-outline ob-btn-sm"
              >
                For agencies
              </Link>
              <Link
                href={PUBLIC_ROUTES.pricing}
                className="ob-btn ob-btn-outline ob-btn-sm"
              >
                Pricing
              </Link>
            </div>
          </dl>
        </div>
      </Container>
    </section>
  );
}

/* ── 10 · Partner program ───────────────────────────────────────────────── */

export function PartnerSection() {
  return (
    <Section id="partners" tone="base" aria-labelledby="partners-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="10">Partner program</Eyebrow>
            <h2 id="partners-title" className="ob-h2 max-w-[18ch]">
              Bring dependency accountability to the organizations you advise.
            </h2>
            <p className="ob-body-lg">
              Consultants, agencies, MSPs, infrastructure engineers and
              technical communities can join the RELIASTRA Partner Network,
              refer organizations that need external dependency visibility, and
              earn recurring commission on the accounts they bring.
            </p>
            <p className="ob-body">
              Referrals are attributed through a tracked partner link, and the
              partner dashboard reports referrals, commission and payouts
              directly from the same ledger that pays them.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Link href={PUBLIC_ROUTES.partner} className="ob-btn ob-btn-outline">
                Partner program
              </Link>
              <Link
                href={partnerUrl('signup')}
                className="ob-btn ob-btn-outline"
              >
                Apply as a partner
              </Link>
            </div>
          </div>

          <dl className="flex flex-col self-start">
            {[
              ['Who it is for', 'Consultancies, agencies, MSPs, infrastructure professionals, technical creators and communities.'],
              ['Attribution', 'A tracked referral link ties every signup to the partner who introduced it.'],
              ['Commission', 'Published in full on the program pages, including tier thresholds and payout terms.'],
              ['Onboarding', 'Apply, verify your email, and the partner workspace is available immediately.'],
            ].map(([term, desc]) => (
              <div key={term} className="border-t border-[var(--ob-line)] py-5">
                <dt className="ob-label mb-2">{term}</dt>
                <dd className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
                  {desc}
                </dd>
              </div>
            ))}
            <p className="ob-small mt-4">
              Commission rates, tiers and payout schedules are stated on the{' '}
              <Link href={partnerUrl('commission')} className="ob-link">
                commission page
              </Link>
              . A partner account is separate from a customer account.
            </p>
          </dl>
        </div>
      </Container>
    </Section>
  );
}

/* ── Reference: plain-language answers ──────────────────────────────────── */

/**
 * Explicit, machine-legible definitions.
 *
 * Search engines and language models should not have to infer what this
 * company does from a hero line. These are real definitions in semantic
 * markup (`dl` / `dt` / `dd`), they mirror the FAQPage structured data emitted
 * by the page, and they are genuinely useful to a first-time reader.
 */
export const HOME_DEFINITIONS: { q: string; a: string }[] = [
  {
    q: 'What is RELIASTRA?',
    a: 'RELIASTRA is an external dependency intelligence platform. It independently monitors the third-party APIs and services an organization depends on, correlates their failures with that organization’s own incidents, attributes the fault to the responsible party, and generates timestamped, checksummed evidence reports.',
  },
  {
    q: 'What is External Dependency Intelligence?',
    a: 'External Dependency Intelligence is the practice of measuring, documenting and proving the behaviour of infrastructure a business relies on but does not operate — payment processors, identity providers, cloud platforms, model APIs, DNS and messaging services. It combines independent observation, incident correlation, fault attribution and durable evidence.',
  },
  {
    q: 'What problem does RELIASTRA solve?',
    a: 'Internal monitoring shows that a service failed but not who caused it. Vendor status pages are written by the vendor. RELIASTRA supplies the missing third record: independent measurement of the dependency itself, so an organization can determine whether an outage originated inside its own systems or in a service it buys.',
  },
  {
    q: 'Who is RELIASTRA for?',
    a: 'Engineering and infrastructure teams at software companies, platform and SRE teams responsible for uptime commitments, agencies and managed service providers accountable for client stacks, and founders or operators who must explain outages to customers.',
  },
  {
    q: 'What does RELIASTRA monitor?',
    a: 'Any HTTP endpoint. In practice this means third-party APIs and services such as payment providers, authentication providers, cloud and edge platforms, model inference APIs, messaging and email delivery, managed databases and DNS.',
  },
  {
    q: 'What is reliability evidence?',
    a: 'Reliability evidence is a structured, timestamped record of an observed failure: the dependency involved, the window it was degraded, the regions that observed the degradation, the number of retained observations, the attribution verdict and its confidence, and a checksum that lets the artifact be verified as unaltered.',
  },
  {
    q: 'How does RELIASTRA generate evidence?',
    a: 'Checks run on a fixed interval from multiple regions on infrastructure separate from both the customer and the vendor. Regional results are resolved by quorum into a single verdict, confirmed degradation is aligned against the customer’s incident timeline, and the resulting record is exported as a timestamped, checksummed report.',
  },
  {
    q: 'How does dependency attribution work?',
    a: 'Attribution is deterministic, not probabilistic. RELIASTRA compares the observed state of each external dependency against the customer’s incident window. Where independently confirmed vendor degradation overlaps the incident, the incident is attributed to that dependency with a stated confidence level. Where the timelines do not support a claim, no claim is made.',
  },
  {
    q: 'What is RELIASTRA Research?',
    a: 'RELIASTRA Research is the company’s public technical publication. It documents measurement methodology, dependency failure analysis and the standards RELIASTRA holds its own data to, so customers can inspect how reliability records are produced before relying on them commercially.',
  },
  {
    q: 'What are public dependency pages?',
    a: 'Public dependency pages are the independently measured status pages RELIASTRA publishes for tracked vendors at /track. Each page reports current state, observed availability over 7 and 30 days, latency, incident history and the methodology behind the measurement — useful to any engineer, customer or not.',
  },
];

export function ReferenceSection() {
  return (
    <Section id="reference" tone="void" aria-labelledby="reference-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow>Reference</Eyebrow>
            <h2 id="reference-title" className="ob-h2 max-w-[14ch]">
              Plainly, what this is.
            </h2>
            <p className="ob-body">
              Definitions, not positioning. If you are evaluating RELIASTRA for
              a security review, an architecture decision or an investment
              conversation, start here.
            </p>
            <div className="mt-2">
              <ArrowLink href={PUBLIC_ROUTES.glossary}>
                Full glossary of terms
              </ArrowLink>
            </div>
          </div>

          <dl className="flex flex-col">
            {HOME_DEFINITIONS.map((item) => (
              <div key={item.q} className="border-t border-[var(--ob-line)] py-6">
                <dt className="ob-h4">{item.q}</dt>
                <dd className="mt-2.5 max-w-[70ch] text-[14.5px] leading-[1.7] text-[var(--ob-text-3)]">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}

/* ── 12 · Final CTA ─────────────────────────────────────────────────────── */

export function FinalCTASection() {
  return (
    <section
      className="relative overflow-hidden border-t border-[var(--ob-line)]"
      aria-labelledby="final-cta-title"
    >
      <div className="absolute inset-0">
        <Image
          src="/media/edge-infrastructure-night.jpg"
          alt="An edge facility and lattice communications tower at dusk, cable trays running across the foreground under a single amber lamp."
          fill
          sizes="100vw"
          quality={70}
          loading="lazy"
          className="ob-photo object-cover object-center opacity-55"
        />
        <div className="ob-scrim-bottom absolute inset-0" aria-hidden />
      </div>

      <Container className="relative flex min-h-[520px] flex-col justify-end py-24 md:min-h-[620px] md:py-32">
        <Eyebrow index="12">Start</Eyebrow>
        <h2 id="final-cta-title" className="ob-h1 mt-6 max-w-[14ch]">
          Know what you depend on. Prove what it did.
        </h2>
        <p className="ob-body-lg mt-6">
          Add your first dependency and RELIASTRA begins observing it from
          independent regions on the next check interval. Every new organization
          gets a 14-day Pro trial — attribution and evidence included, no card
          required.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
            Start monitoring
          </Link>
          <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-outline">
            Browse public dependency data
          </Link>
        </div>
        <dl className="mt-12 grid max-w-3xl grid-cols-1 gap-px border-t border-[var(--ob-line)] pt-6 sm:grid-cols-3">
          <DataRow label="Trial" className="border-t-0 sm:col-span-3">
            14 days of Pro on every new organization. No payment method
            required to start.
          </DataRow>
          <DataRow label="Free tier" className="sm:col-span-3">
            Continues after the trial: 3 dependencies, 1-minute checks, email
            alerts.
          </DataRow>
          <DataRow label="Data" className="sm:col-span-3">
            Monitoring data and evidence reports belong to the account holder
            and are never shared with the vendors being measured.
          </DataRow>
        </dl>
      </Container>
    </section>
  );
}
