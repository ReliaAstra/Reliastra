import Link from 'next/link';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import {
  DETECTION,
  OBSERVATION_POINT,
} from '@/lib/methodology';
import { RESEARCH_AUTHORS } from '@/lib/research/authors';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/* ── 10 · Reference ─────────────────────────────────────────────────────── */

/**
 * Short, machine-legible definitions. They mirror the FAQPage structured data
 * emitted by the page, so the structured data cannot describe a different
 * product than the copy. Four questions only: the rest of the answers live
 * on `/product`, `/docs/methodology` and `/security`, which this page links to.
 */
export const HOME_DEFINITIONS: { q: string; a: string }[] = [
  {
    q: 'What is RELIASTRA?',
    a: 'An external dependency observation product. It probes the third-party services your software depends on, from infrastructure you do not operate, records what each probe saw, and keeps a verifiable record of what happened.',
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

/**
 * The founder, briefly. One portrait, one paragraph, one link: the full
 * profile — disciplines, published work, operating stack — lives on `/about`.
 * A founder-led infrastructure product has to show the engineer; a paragraph
 * asserting that a real person is behind it is the weakest possible version
 * of that claim, so this section points at the evidence instead of
 * reproducing it.
 */
export function MaintainerSection() {
  const author = RESEARCH_AUTHORS[0];

  return (
    <Section id="maintainer" tone="void" aria-labelledby="maintainer-title">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1.38fr)] lg:gap-16">
          {/*
            Portrait, name, role. A founder-led infrastructure product has to
            show the engineer; a paragraph asserting that a real person is
            behind it is the weakest possible version of that claim.
          */}
          <div className="flex flex-col items-start gap-5">
            <Eyebrow>Founder &amp; principal engineer</Eyebrow>
            <div
              className="relative w-full max-w-[300px] overflow-hidden border border-[var(--ob-line-2)] bg-[var(--ob-raised)]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <img
                src="/media/maintainer-lg.webp"
                srcSet="/media/maintainer-sm.webp 320w, /media/maintainer-md.webp 640w, /media/maintainer-lg.webp 960w"
                sizes="(max-width: 1023px) 300px, 300px"
                alt={`${author.name}, founder and principal engineer of RELIASTRA`}
                width={960}
                height={960}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[17px] font-semibold tracking-[-0.014em] text-[var(--ob-text)]">
                {author.name}
              </p>
              <p className="ob-label">{author.role}</p>
            </div>
            <ArrowLink href={PUBLIC_ROUTES.about}>Full profile</ArrowLink>
          </div>

          <div className="flex flex-col gap-5">
            <h2 id="maintainer-title" className="ob-scene-title max-w-[22ch]">
              The engineer who operates the measurement network.
            </h2>
            <p className="ob-body-lg max-w-[62ch]">{author.bio}</p>
            <p className="ob-small max-w-[62ch]">
              The stack he designs and runs: Go for the CLI and probe tooling,
              Python and FastAPI for the API, Postgres and Redis, Celery for the
              scheduled measurement work, SHA-256 and Ed25519 for the evidence
              records.
            </p>
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
          <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-primary">
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
