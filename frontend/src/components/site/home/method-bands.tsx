import Link from 'next/link';
import { ArrowLink, Container, Eyebrow } from '@/components/site/primitives';
import {
  DETECTION,
  EVIDENCE,
  OBSERVATION_LABEL,
  PROBE_INTERVAL_SECONDS,
} from '@/lib/methodology';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';

/**
 * The method, in one band. Three sentences a buyer repeats in a meeting —
 * observe, confirm, prove — each with the link to the page that shows its
 * working. The proof itself (charts, timelines, the evidence artifact) lives
 * on `/product` and `/product/evidence`, where it has room. The homepage
 * states the claim and gets out of the way.
 */
const ROWS: { title: string; body: string; href: string; link: string }[] = [
  {
    title: 'Observe',
    body: `Every endpoint you register is checked every ${PROBE_INTERVAL_SECONDS} seconds from infrastructure that is neither yours nor the vendor's. ${OBSERVATION_LABEL} is the observation point today, and every record says so.`,
    href: DOCS_ROUTES.monitoring,
    link: 'Monitoring docs',
  },
  {
    title: 'Confirm',
    body: `Failed checks are replayed against your incident window. ${DETECTION.failureChecks} consecutive failures open an incident, ${DETECTION.recoveryChecks} consecutive successes close it — no vendor status page involved.`,
    href: DOCS_ROUTES.incidents,
    link: 'Incident model',
  },
  {
    title: 'Prove',
    body: `A resolved incident becomes a signed record: the window, every observation inside it, the availability arithmetic, and a SHA-256 checksum. Retained ${EVIDENCE.retentionDays} days, verifiable by anyone.`,
    href: PUBLIC_ROUTES.productEvidence,
    link: 'Inside a record',
  },
];

export function MethodSection() {
  return (
    <section
      id="observation"
      aria-labelledby="observation-title"
      className="border-t border-[var(--ob-line)] bg-[var(--ob-void)]"
    >
      <Container className="py-24 md:py-32 lg:py-36">
        <div className="flex max-w-[60ch] flex-col gap-7">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="observation-title" className="ob-scene-title">
            Three steps, all published.
          </h2>
        </div>

        <div className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-3">
          {ROWS.map((row) => (
            <div key={row.title} className="border-t border-[var(--ob-line)] pt-6">
              <h3 className="text-[17px] font-semibold tracking-[-0.014em] text-[var(--ob-text)]">
                {row.title}
              </h3>
              <p className="mt-3 text-[14px] leading-[1.7] text-[var(--ob-text-3)]">
                {row.body}
              </p>
              <div className="mt-5">
                <ArrowLink href={row.href}>{row.link}</ArrowLink>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 sm:flex-row">
          <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-primary">
            Start monitoring
          </Link>
          <Link href={DOCS_ROUTES.methodology} className="ob-btn ob-btn-outline">
            Read the methodology
          </Link>
        </div>
      </Container>
    </section>
  );
}
