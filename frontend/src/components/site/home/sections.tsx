import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
  SectionHeader,
} from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES, partnerUrl } from '@/lib/routes';

/* ── 02 · The problem ───────────────────────────────────────────────────── */

/**
 * Dependency classes the product is built to observe. Rendered as text,
 * never as logos: a logo wall reads as an endorsement, and RELIASTRA has no
 * relationship with these companies. The caption says so.
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
              Your monitoring stops at your edge. The vendor’s status page is
              written by the vendor. Nobody keeps the record in between.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-x-6 gap-px lg:grid-cols-3">
              {DEPENDENCY_CLASSES.map(([label, examples]) => (
                <div
                  key={label}
                  className="border-t border-[var(--ob-line)] py-5"
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
              Examples only. Any HTTP endpoint can be monitored. Naming a
              service implies no relationship with it.
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

      <Container className="relative py-24 md:py-32 lg:py-40">
        <div className="max-w-[46rem]">
          <Eyebrow index="03">RELIASTRA</Eyebrow>
          <h2 id="layer-title" className="ob-h1 mt-6 max-w-[16ch]">
            An independent record of your dependencies.
          </h2>
          <p className="ob-body-lg mt-7">
            RELIASTRA measures external services from infrastructure neither
            you nor the vendor controls, keeps every observation, and exports
            the record.
          </p>
          <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
            <ArrowLink href={PUBLIC_ROUTES.product}>Platform overview</ArrowLink>
            <ArrowLink href={PUBLIC_ROUTES.externalDependencyIntelligence}>
              The category
            </ArrowLink>
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
    body: 'Each dependency is checked on a fixed interval from every region you configure. Latency, status code and origin are recorded.',
    href: PUBLIC_ROUTES.dependencyMonitoring,
  },
  {
    n: '02',
    title: 'Correlate',
    body: 'A fault needs at least two regions to agree inside one 60-second window. Confirmed degradation is aligned with your incident.',
    href: PUBLIC_ROUTES.incidentEvidence,
  },
  {
    n: '03',
    title: 'Document',
    body: 'A confirmed event becomes a record: start, end, severity, regions, and the observations under it. Nothing is backfilled.',
    href: PUBLIC_ROUTES.slaEvidence,
  },
  {
    n: '04',
    title: 'Prove',
    body: 'The record is exported as a timestamped, checksummed report for a vendor case, a postmortem or a review.',
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
        />

        <ol className="mt-14 grid gap-px md:grid-cols-2 xl:grid-cols-4">
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

/* ── 05 · Evidence artifact ─────────────────────────────────────────────── */

/**
 * A structural preview of the evidence artifact. Not a screenshot, not a real
 * incident. Field names match what the product produces; the values are
 * illustrative and the panel says so in its own header.
 */
export function EvidenceArtifactSection() {
  return (
    <Section id="evidence" tone="void" aria-labelledby="evidence-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="05">Evidence</Eyebrow>
            <h2 id="evidence-title" className="ob-h2 max-w-[15ch]">
              A record that survives the incident.
            </h2>
            <p className="ob-body">
              What was observed, from where, when it started, when it
              recovered, and a checksum that proves the file is unaltered.
            </p>
            <p className="ob-small">
              Attribution and evidence are Pro capabilities. Every new
              organization starts on a 14-day Pro trial.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              <ArrowLink href={PUBLIC_ROUTES.slaEvidence}>
                How evidence works
              </ArrowLink>
              <ArrowLink href={PUBLIC_ROUTES.docsEvidence}>
                Documentation
              </ArrowLink>
            </div>
          </div>

          <figure className="ob-inset overflow-hidden">
            <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ob-line)] px-5 py-3.5">
              <span className="ob-label">Evidence report · fields</span>
              <span className="ob-label text-[var(--ob-signal)]">
                Example values
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
                ['regions', 'eu-west · us-east'],
                ['quorum', '2 of 2 regions failing'],
                ['attribution', 'external_dependency'],
                ['observations', '142 retained'],
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
              Field names match the generated artifact. Values are an example,
              not a recorded incident.
            </p>
          </figure>
        </div>
      </Container>
    </Section>
  );
}

/* ── 08 · Agencies and MSPs ─────────────────────────────────────────────── */

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
            <Eyebrow index="08">Agencies · MSPs</Eyebrow>
            <h2 id="agencies-title" className="ob-h2 max-w-[17ch]">
              Held responsible for stacks you inherited.
            </h2>
            <p className="ob-body-lg">
              When a client’s checkout fails, the call comes to you. An
              independent record settles whose fault it was.
            </p>
          </div>

          <dl className="flex flex-col">
            {[
              [
                'Client isolation',
                'Each client has its own dependencies, incidents and evidence.',
              ],
              [
                'Attribution per client',
                'Vendor degradation is attributed while the incident is open.',
              ],
              [
                'Shareable records',
                'Client-facing reports and portals, from the same record.',
              ],
            ].map(([term, desc]) => (
              <div
                key={term}
                className="border-t border-[var(--ob-line)] py-5"
              >
                <dt className="text-[15px] font-semibold leading-snug text-[var(--ob-text)]">
                  {term}
                </dt>
                <dd className="mt-1.5 max-w-[58ch] text-[14px] leading-[1.6] text-[var(--ob-text-3)]">
                  {desc}
                </dd>
              </div>
            ))}
            <p className="ob-small mt-5 max-w-[58ch]">
              Client groups, client reports and white-label branding are
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

/* ── 09 · Partner program ───────────────────────────────────────────────── */

export function PartnerSection() {
  return (
    <Section id="partners" tone="base" tight aria-labelledby="partners-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="09">Partner program</Eyebrow>
            <h2 id="partners-title" className="ob-h2 max-w-[16ch]">
              Refer the organizations you advise.
            </h2>
            <p className="ob-body">
              Consultancies, agencies and technical publishers earn recurring
              commission on referred accounts. Referrals are attributed through
              a tracked link.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Link href={PUBLIC_ROUTES.partner} className="ob-btn ob-btn-outline">
                Partner program
              </Link>
              <Link href={partnerUrl('signup')} className="ob-btn ob-btn-outline">
                Apply
              </Link>
            </div>
          </div>

          <dl className="flex flex-col self-start">
            {[
              ['Commission', 'Published in full on the commission page.'],
              ['Attribution', 'A tracked link ties each signup to the partner.'],
              ['Accounts', 'A partner account is separate from a customer account.'],
            ].map(([term, desc]) => (
              <div key={term} className="border-t border-[var(--ob-line)] py-5">
                <dt className="ob-label mb-2">{term}</dt>
                <dd className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}

/* ── Reference: plain-language definitions ──────────────────────────────── */

/**
 * Short, machine-legible definitions in semantic markup. They mirror the
 * FAQPage structured data emitted by the page.
 */
export const HOME_DEFINITIONS: { q: string; a: string }[] = [
  {
    q: 'What is RELIASTRA?',
    a: 'An external dependency intelligence platform. It monitors third-party APIs independently, correlates their failures with your incidents, and generates timestamped, checksummed evidence reports.',
  },
  {
    q: 'What does it monitor?',
    a: 'Any HTTP endpoint: payment providers, identity providers, cloud platforms, model APIs, messaging, managed databases, DNS.',
  },
  {
    q: 'How is an incident confirmed?',
    a: 'At least two observation regions must fail inside the same 60-second window. A single failing region is recorded, not declared.',
  },
  {
    q: 'What is in an evidence report?',
    a: 'The dependency, the incident window, the regions that observed it, the retained observations, the attribution result, and a SHA-256 checksum.',
  },
  {
    q: 'How does attribution work?',
    a: 'Deterministically. Confirmed vendor degradation is compared against your incident window. Where the timelines do not support a claim, no claim is made.',
  },
];

export function ReferenceSection() {
  return (
    <Section id="reference" tone="void" tight aria-labelledby="reference-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow>Reference</Eyebrow>
            <h2 id="reference-title" className="ob-h2 max-w-[14ch]">
              Definitions.
            </h2>
            <div className="mt-2">
              <ArrowLink href={PUBLIC_ROUTES.glossary}>Full glossary</ArrowLink>
            </div>
          </div>

          <dl className="flex flex-col">
            {HOME_DEFINITIONS.map((item) => (
              <div key={item.q} className="border-t border-[var(--ob-line)] py-5">
                <dt className="ob-h4">{item.q}</dt>
                <dd className="mt-2 max-w-[70ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
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

/* ── 11 · Final CTA ─────────────────────────────────────────────────────── */

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

      <Container className="relative flex min-h-[440px] flex-col justify-end py-20 md:min-h-[520px] md:py-28">
        <Eyebrow index="11">Start</Eyebrow>
        <h2 id="final-cta-title" className="ob-h1 mt-6 max-w-[14ch]">
          Know what you depend on. Prove what it did.
        </h2>
        <p className="ob-body-lg mt-6 max-w-[44ch]">
          14-day Pro trial on every new organization. No payment method
          required.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
            Start monitoring
          </Link>
          <Link href={PUBLIC_ROUTES.pricing} className="ob-btn ob-btn-outline">
            Pricing
          </Link>
        </div>
      </Container>
    </section>
  );
}
