import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
  SectionHeader,
} from '@/components/site/primitives';
import { AUTH_ROUTES, EXTERNAL_LINKS, PUBLIC_ROUTES } from '@/lib/routes';
import { DependencyTopology } from '@/components/site/visuals/dependency-topology';
import { IncidentTimeline } from '@/components/site/visuals/incident-timeline';
import { EvidenceArtifact } from '@/components/site/visuals/evidence-artifact';
import { LatencyChart } from '@/components/site/visuals/latency-chart';
import { AttributionSignals } from '@/components/site/visuals/attribution-signals';

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

/* ── 07 · How it works ──────────────────────────────────────────────────── */

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
          index="07"
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

/* ── 06 · Evidence ──────────────────────────────────────────────────────── */

/**
 * The artifact, the chart it embeds, and the arithmetic behind its verdict.
 *
 * Every field label here comes from `backend/templates/evidence/default.html`
 * and every classification and weight from the attribution engine, asserted by
 * `product-contract.test.ts`. The previous version of this section rendered
 * `attribution: external_dependency` - a value the engine cannot produce - and
 * claimed the field names matched the artifact when most did not.
 */
export function EvidenceArtifactSection() {
  return (
    <Section id="evidence" tone="void" aria-labelledby="evidence-title">
      <Container>
        <SectionHeader
          index="06"
          eyebrow="Evidence"
          id="evidence-title"
          title="A record that survives the incident."
          lede="What was observed, from where, when it started, when it recovered, and a checksum that proves the file is unaltered."
        >
          <div className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
            <ArrowLink href={PUBLIC_ROUTES.slaEvidence}>
              How evidence works
            </ArrowLink>
            <ArrowLink href={PUBLIC_ROUTES.docsEvidence}>Documentation</ArrowLink>
          </div>
        </SectionHeader>

        <div className="mt-14 grid gap-px lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          <EvidenceArtifact />
          <div className="flex flex-col gap-10">
            <LatencyChart />
            <AttributionSignals />
          </div>
        </div>

        <p className="ob-small mt-10 max-w-[62ch]">
          Attribution and evidence are Pro capabilities. Every new organization
          starts on a 14-day Pro trial.
        </p>
      </Container>
    </Section>
  );
}

/* ── 04 · What RELIASTRA observes ───────────────────────────────────────── */

/**
 * The product's actual shape, drawn instead of described: your application
 * calls a dependency, and RELIASTRA measures the same dependency from regions
 * that belong to neither of you.
 */
export function ObservationSection() {
  return (
    <Section id="observation" tone="base" aria-labelledby="observation-title">
      <Container>
        <SectionHeader
          index="04"
          eyebrow="What it observes"
          id="observation-title"
          title="The same dependency. Measured from outside both of you."
          lede="Your application sees a failed request. RELIASTRA sees whether the endpoint was failing for everyone, from where, and for how long."
        />

        <div className="mt-14">
          <DependencyTopology />
        </div>
      </Container>
    </Section>
  );
}

/* ── 05 · The incident, as a sequence ───────────────────────────────────── */

/**
 * One incident end to end. This is the section that explains the product
 * without asking the visitor to read a manual: failures appear, independent
 * observation confirms them, the detection rule is met, the engine attributes,
 * the record is written.
 */
export function IncidentStorySection() {
  return (
    <Section id="incident" tone="void" aria-labelledby="incident-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-20">
          <div className="flex flex-col gap-6 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow index="05">Incident</Eyebrow>
            <h2 id="incident-title" className="ob-h2 max-w-[15ch]">
              Checkout fails. Whose fault was it?
            </h2>
            <p className="ob-body">
              Five minutes, start to finished record. This is what the product
              does while your team is still arguing about it.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              <ArrowLink href={PUBLIC_ROUTES.incidentEvidence}>
                How attribution works
              </ArrowLink>
              <ArrowLink href={PUBLIC_ROUTES.dependencyMonitoring}>
                How checks run
              </ArrowLink>
            </div>
          </div>

          <IncidentTimeline />
        </div>
      </Container>
    </Section>
  );
}


/* ── 11 · Who builds this ───────────────────────────────────────────────── */

/**
 * The maintainer section. The homepage answers "who is building it" in four
 * sentences and links out for the rest - it is a statement of accountability,
 * not a biography.
 */
export function MaintainerSection() {
  return (
    <Section id="maintainer" tone="base" tight aria-labelledby="maintainer-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow>Who builds this</Eyebrow>
            <h2 id="maintainer-title" className="ob-h2 max-w-[14ch]">
              An engineering project, not a company front.
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              <ArrowLink href={PUBLIC_ROUTES.about}>About the project</ArrowLink>
              <a
                href={EXTERNAL_LINKS.github}
                className="ob-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <p className="ob-body-lg max-w-[62ch]">
              RELIASTRA is built and maintained by one infrastructure engineer.
              The detection methodology, the evidence format and the research
              behind them are the same work, published where you can check it -
              which is also why the product is $9 a month and the person who
              built it answers the support inbox.
            </p>
            <p className="ob-body max-w-[62ch]">
              The direction is larger than the product: a dependency
              intelligence network built from independent observations across
              real software systems. It is being earned one observation at a
              time, not claimed in advance.
            </p>
          </div>
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
    a: 'A failure must persist: two consecutive checks from the same observation point must fail before an incident opens, so one dropped probe is recorded but not declared. If multiple independent observation points exist, confirmed agreement between them opens an incident instead.',
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

/* ── 13 · Final CTA ─────────────────────────────────────────────────────── */

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
        <Eyebrow index="13">Start</Eyebrow>
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
