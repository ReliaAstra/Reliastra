import Link from 'next/link';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import {
  ATTRIBUTION,
  DETECTION,
  NETWORK_DIRECTION,
  OBSERVATION_POINT,
  OBSERVATION_POINTS,
} from '@/lib/methodology';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/* ── 10 · Reference ─────────────────────────────────────────────────────── */

/**
 * Short, machine-legible definitions. They mirror the FAQPage structured data
 * emitted by the page, so the structured data cannot describe a different
 * product than the copy.
 */
export const HOME_DEFINITIONS: { q: string; a: string }[] = [
  {
    q: 'What is RELIASTRA?',
    a: 'An external dependency observation product. It probes the third-party services your software depends on, from infrastructure you do not operate, records what each probe saw, and keeps a verifiable record of what happened.',
  },
  {
    q: 'What does it observe?',
    a: 'Any HTTP endpoint that returns a status code: payment providers, identity providers, cloud platforms, model APIs, messaging, managed databases, DNS.',
  },
  {
    q: 'How is an incident confirmed?',
    a: `Deterministically, by persistence: ${DETECTION.failureChecks} consecutive failed checks from the ${OBSERVATION_POINT.toLowerCase()} open an incident, and ${DETECTION.recoveryChecks} consecutive successes resolve it. One dropped probe is recorded, not declared.`,
  },
  {
    q: 'How many places does it probe from?',
    a: `One today. There is no regional quorum claim, because a quorum needs genuinely independent observation points and this deployment has one. When that changes, the site and the records will say so.`,
  },
  {
    q: 'What is in an evidence record?',
    a: 'The dependency, the incident window and the observation topology behind it, every observation in the window, the arithmetic behind the availability figures, the attribution result with its methodology version, and a SHA-256 checksum over the payload.',
  },
  {
    q: 'How does attribution work?',
    a: `Deterministically, from five weighted signals summing to 1: ${ATTRIBUTION.signals
      .map((s) => s.label.toLowerCase())
      .join(', ')}. A score at or above ${ATTRIBUTION.vendorFailureAt} classifies as vendor failure; below ${ATTRIBUTION.multiCauseAt} the result is often \`unknown\`, which is a result rather than an error.`,
  },
  {
    q: 'Who can see my monitoring data?',
    a: 'Only your account. Dependency endpoints, headers and evidence records are never shared with the vendors being measured, and customer dependencies never appear in the public observatory.',
  },
];

export function ReferenceSection() {
  return (
    <Section id="reference" tone="raised" aria-labelledby="reference-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow>Questions, answered</Eyebrow>
            <h2 id="reference-title" className="ob-h2 max-w-[16ch]">
              The questions, answered the way the system answers them.
            </h2>
            <Link href={PUBLIC_ROUTES.glossary} className="ob-link self-start text-[13.5px]">
              Full glossary →
            </Link>
          </div>

          <dl className="flex flex-col">
            {HOME_DEFINITIONS.map(({ q, a }) => (
              <div key={q} className="border-t border-[var(--ob-line)] py-6">
                <dt className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                  {q}
                </dt>
                <dd className="mt-2.5 max-w-[68ch] text-[14px] leading-[1.7] text-[var(--ob-text-3)]">
                  {a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}

/* ── 11 · Maintainer ────────────────────────────────────────────────────── */

export function MaintainerSection() {
  return (
    <Section id="maintainer" tone="void" aria-labelledby="maintainer-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow>Who builds this</Eyebrow>
            <h2 id="maintainer-title" className="ob-h2 max-w-[16ch]">
              One engineer, and a public repository.
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              <ArrowLink href={PUBLIC_ROUTES.about}>About the maintainer</ArrowLink>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <p className="ob-body-lg max-w-[62ch]">
              RELIASTRA is built and maintained by Adeshina Emmanuel, an
              infrastructure security engineer working on identity, access
              control and system hardening across cloud, Kubernetes and AI
              environments. The detector, the evidence format, the research and
              the product are one person's work, which is why it is one price,
              and why the person who built it answers the support inbox.
            </p>

            <div className="border-t border-[var(--ob-line)] pt-6">
              <p className="ob-label mb-4">Where the network is going</p>
              <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {NETWORK_DIRECTION.map((step) => (
                  <li key={step} className="flex items-start gap-3 py-1.5">
                    <span
                      aria-hidden
                      className="mt-[7px] block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ob-line-3)]"
                    />
                    <span className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                      {step}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="ob-small mt-4 max-w-[58ch]">
                The first step is the product. The rest is described as
                direction, not as capability: nothing above is measured,
                counted, or rendered as a live figure anywhere on this site.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────────────────── */

export function FinalCTASection() {
  return (
    <section
      aria-labelledby="final-cta-title"
      className="relative overflow-hidden border-t border-[var(--ob-line)] bg-black"
    >
      <div aria-hidden className="ob-scene-media">
        <img
          src="/media/scene-fiber.webp"
          srcSet="/media/scene-fiber-sm.webp 1366w, /media/scene-fiber.webp 1672w"
          sizes="100vw"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <div className="ob-scene-scrim" />
      </div>
      <Container className="relative z-[1] flex min-h-[62vh] flex-col justify-center py-28 md:py-36">
        <p className="ob-label mb-7">Begin</p>
        <h2 id="final-cta-title" className="ob-scene-title max-w-[24ch]">
          Add one dependency you already own.
        </h2>
        <p className="ob-lede mt-7 max-w-[46ch]">
          Read what the probe records for a day before deciding whether the
          rest of it is worth your attention. The trial needs no card.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
            Start monitoring
          </Link>
          <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-outline">
            See the public data first
          </Link>
        </div>
      </Container>
    </section>
  );
}
