import Link from 'next/link';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { EVIDENCE_CAN, EVIDENCE_CANNOT } from '@/lib/methodology';
import { CodeBlock } from '@/components/docs/code-block';
import {
  EVIDENCE_FIGURES,
  EVIDENCE_REPORT_SECTIONS,
} from '@/lib/product-contract';
import {
  ATTRIBUTION,
  DETECTION,
  DETECTION_SENTENCE,
  EVIDENCE,
  NETWORK_DIRECTION,
  OBSERVATION_FIELDS,
  OBSERVATION_POINT,
  OBSERVATION_POINTS,
  OBSERVATION_LABEL,
  PROBE_INTERVAL_SECONDS,
} from '@/lib/methodology';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES, researchRoute } from '@/lib/routes';

/* ── 01 · The problem ───────────────────────────────────────────────────── */

/**
 * Dependency classes the product is built to observe. Rendered as text, never
 * as logos: a logo wall reads as an endorsement, and RELIASTRA has no
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
    <Section id="problem" tone="base" aria-labelledby="problem-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="01">The gap</Eyebrow>
            <h2 id="problem-title" className="ob-h2 max-w-[20ch]">
              Your monitoring stops at your edge. The status page is written by
              the vendor.
            </h2>
            <p className="ob-body-lg">
              Between those two facts is the only record that would settle the
              argument: what the dependency actually did, measured by someone
              with no stake in either answer.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-x-6 gap-px lg:grid-cols-3">
              {DEPENDENCY_CLASSES.map(([label, examples]) => (
                <div key={label} className="border-t border-[var(--ob-line)] py-5">
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
              Examples only. Any HTTP endpoint can be observed. Naming a service
              implies no relationship with it.
            </p>
          </div>
        </div>

        {/* The distinction, stated as a table rather than as adjectives. */}
        <div className="mt-16 ob-scroll-x overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[13.5px]">
            <caption className="ob-label mb-4 text-left">
              Three records of the same outage
            </caption>
            <thead>
              <tr className="border-y border-[var(--ob-line-2)]">
                {['', 'Your APM', 'The vendor’s status page', 'RELIASTRA'].map((h) => (
                  <th
                    key={h || 'row'}
                    scope="col"
                    className="ob-label px-4 py-3 text-left align-bottom"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                [
                  'Says the dependency failed',
                  'No — it sees your errors, not the cause',
                  'Only after the vendor decides to say so',
                  'Yes — the probe observed it directly',
                ],
                [
                  'Retained as evidence',
                  'Your own logs, in your own account',
                  'Edited in place; history is not published',
                  'Immutable artifact with a checksum and a verification URL',
                ],
                [
                  'Verifiable by a third party',
                  'No',
                  'No',
                  'Yes — no account required',
                ],
                [
                  'Says what it cannot establish',
                  'Rarely',
                  'No',
                  'On every surface, including this page',
                ],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-[var(--ob-line)]">
                  <th
                    scope="row"
                    className="px-4 py-4 text-left align-top text-[13.5px] font-medium text-[var(--ob-text-2)]"
                  >
                    {row[0]}
                  </th>
                  {row.slice(1).map((cell, i) => (
                    <td
                      key={i}
                      className={`px-4 py-4 align-top leading-[1.6] ${
                        i === 2 ? 'text-[var(--ob-text-2)]' : 'text-[var(--ob-text-3)]'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </Section>
  );
}

/* ── 02 · Observation ───────────────────────────────────────────────────── */

export function ObservationSection() {
  return (
    <Section id="observation" tone="void" aria-labelledby="observation-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="02">Observation</Eyebrow>
            <h2 id="observation-title" className="ob-h2 max-w-[18ch]">
              Every probe leaves a row. Nothing is inferred from a summary.
            </h2>
            <p className="ob-body-lg">
              A probe is one HTTP request issued from RELIASTRA infrastructure.
              It reads the status and the headers, closes the connection, and
              writes what it saw. Response bodies are never captured.
            </p>
            <p className="ob-body">
              Probes are issued every {PROBE_INTERVAL_SECONDS} seconds by
              default, from{' '}
              {OBSERVATION_POINTS === 1
                ? `one observation point (${OBSERVATION_LABEL})`
                : `${OBSERVATION_POINTS} observation points`}
              . That is the resolution of every claim made from this data, and it
              is stated with the claims rather than in a footnote.
            </p>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
              <ArrowLink href={DOCS_ROUTES.monitoring}>Monitoring docs</ArrowLink>
              <ArrowLink href={DOCS_ROUTES.configuration}>Configuration</ArrowLink>
            </div>
          </div>

          <div>
            <p className="ob-label mb-4">Columns on every observation</p>
            <dl className="flex flex-col">
              {OBSERVATION_FIELDS.map(({ field, note }) => (
                <div
                  key={field}
                  className="grid gap-1.5 border-t border-[var(--ob-line)] py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-6"
                >
                  <dt className="ob-mono text-[12.5px] text-[var(--ob-text)]">{field}</dt>
                  <dd className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    {note}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="ob-small mt-5 max-w-[54ch]">
              A probe measures the path from {OBSERVATION_POINT} to that
              endpoint. It cannot see the vendor’s internals, their other
              customers, or any region it did not call from — and no claim on
              this site is built as though it could.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── 03 · Confirmation ──────────────────────────────────────────────────── */

export function IncidentSection() {
  return (
    <Section id="incident" tone="raised" aria-labelledby="incident-title">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Eyebrow index="03">Confirmation</Eyebrow>
            <h2 id="incident-title" className="ob-h2 max-w-[18ch]">
              One dropped probe is recorded, not declared.
            </h2>
            <p className="ob-body-lg">{DETECTION_SENTENCE}</p>
            <p className="ob-body">
              The decision is a pure function of the stored observations — no
              clock reads, no randomness, no thresholds tuned per dependency. A
              decision can be replayed from the rows that produced it, and the
              rule identifier travels with the incident into the evidence
              record.
            </p>
            <Link
              href={researchRoute('how-reliastra-measures-vendor-reliability')}
              className="ob-link self-start text-[13.5px]"
            >
              The detection rule, in full →
            </Link>
          </div>

          <div className="flex flex-col gap-6">
            <CodeBlock
              lang="text"
              caption={`The rule that actually runs · ${DETECTION.ruleId}`}
              code={`// Consecutive-failure confirmation (single observation point)
trailingFailures = count of failed checks
                  ending at the current check
if trailingFailures >= ${DETECTION.failureChecks}
   and no incident open:
        open incident
        started_at = first failure of the run

// Recovery
trailingSuccesses >= ${DETECTION.recoveryChecks}
   and incident open  ->  resolve`}
            />
            <div className="ob-alert ob-alert-note max-w-[62ch]">
              <p className="ob-label mb-2">Deliberately not claimed</p>
              <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
                {OBSERVATION_POINTS === 1
                  ? 'There is no regional quorum, because there is no fleet of independent points to agree with each other. Two scheduling labels from one worker are one machine’s opinion, and this product will not present that as independent confirmation.'
                  : 'Agreement is counted across genuinely independent observation points only.'}{' '}
                <Link href={DOCS_ROUTES.methodology} className="ob-link">
                  Read why
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── 04 · Evidence ──────────────────────────────────────────────────────── */

export function EvidenceSection() {
  return (
    <Section id="evidence" tone="void" aria-labelledby="evidence-title">
      <Container>
        <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5">
            <Eyebrow index="04">Evidence</Eyebrow>
            <h2 id="evidence-title" className="ob-h2 max-w-[18ch]">
              A record you can hand to someone who does not trust you.
            </h2>
          </div>
          <p className="ob-body max-w-[46ch]">
            Written once, retained for {EVIDENCE.retentionDays} days, and
            verifiable by a third party with no account and no cooperation from
            RELIASTRA beyond a public hash.
          </p>
        </div>

        <div className="grid gap-14 pt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-20">
          <div>
            <p className="ob-label mb-5">
              What the artifact opens with
            </p>
            <ol className="grid gap-px sm:grid-cols-2">
              {EVIDENCE_FIGURES.map((figure, i) => (
                <li
                  key={figure}
                  className="flex items-baseline gap-4 border-t border-[var(--ob-line)] py-4"
                >
                  <span className="ob-label ob-label-signal">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[14.5px] text-[var(--ob-text-2)]">{figure}</span>
                </li>
              ))}
            </ol>

            <p className="ob-label mb-5 mt-12">Then ten sections, in this order</p>
            <ol className="flex flex-col">
              {EVIDENCE_REPORT_SECTIONS.map((section, i) => (
                <li
                  key={section}
                  className="flex items-baseline gap-4 border-t border-[var(--ob-line)] py-3"
                >
                  <span className="ob-label w-6 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    {section}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-10">
            <div>
              <p className="ob-label mb-4">Inside the record</p>
              <ul className="flex flex-col gap-3">
                {EVIDENCE_CAN.map((line) => (
                  <li key={line} className="flex gap-3 text-[13.5px] leading-[1.6] text-[var(--ob-text-2)]">
                    <span aria-hidden className="ob-label ob-label-signal pt-1">
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="ob-label mb-4">What it does not establish</p>
              <ul className="flex flex-col gap-3">
                {EVIDENCE_CANNOT.map((line) => (
                  <li key={line} className="flex gap-3 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                    <span aria-hidden className="ob-label pt-1">
                      —
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--ob-line)] pt-6">
              <ArrowLink href={PUBLIC_ROUTES.productEvidence}>
                What an evidence record contains
              </ArrowLink>
              <ArrowLink href={DOCS_ROUTES.verification}>Verify one</ArrowLink>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── 05 · Integration ───────────────────────────────────────────────────── */

const CLI_SNIPPET = `$ reliastra deps add "Payments API" https://api.example.com/health \\
    --interval 60
$ reliastra checks recent --limit 5
$ reliastra verify 8Kd2xQ7m --file evidence.pdf
# exit 0 · the file matches the record
# exit 4 · a missing record, or a file that changed`;

const API_SNIPPET = `curl -sS https://api.reliastra.com/v1/incidents \\
  -H "Authorization: Bearer $RELIASTRA_TOKEN" \\
  | jq '.items[] | {id, severity, started_at}'`;

const HOOK_SNIPPET = `{
  "event": "incident.opened",
  "data": {
    "incident_id": "9f1c8b0e-…",
    "dependency_id": "d4e5f6a7-…",
    "started_at": "2026-09-18T09:53:00Z",
    "detection": { "rule": "single.consecutive_failures" }
  }
}`;

export function IntegrationSection() {
  return (
    <Section id="integration" tone="base" aria-labelledby="integration-title">
      <Container>
        <div className="grid gap-6 pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow index="05">Integration</Eyebrow>
            <h2 id="integration-title" className="ob-h2 max-w-[18ch]">
              It fits the tools you already run.
            </h2>
          </div>
          <p className="ob-body">
            A REST API with scoped keys, a CLI with meaningful exit codes, and
            webhooks for the events you want pushed. Nothing requires moving
            your incident process into another dashboard.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
          {[
            {
              label: 'CLI',
              href: DOCS_ROUTES.cli,
              blurb:
                'Login once, script the rest. `--json` emits the API’s own shape, and verification returns a status code so it works as a CI gate.',
              code: CLI_SNIPPET,
              lang: 'bash',
            },
            {
              label: 'REST API',
              href: DOCS_ROUTES.api,
              blurb:
                'Every product surface is an endpoint. Scoped API keys, cursor pagination, and the FastAPI OpenAPI document served by the API itself.',
              code: API_SNIPPET,
              lang: 'bash',
            },
            {
              label: 'Webhooks',
              href: DOCS_ROUTES.webhooks,
              blurb:
                'Incident opened, incident resolved, evidence ready. Retried with backoff, each delivery carrying an id you can deduplicate on.',
              code: HOOK_SNIPPET,
              lang: 'json',
            },
          ].map((card) => (
            <div key={card.label} className="flex flex-col gap-4 border-t border-[var(--ob-line)] pt-7">
              <h3 className="ob-h3">{card.label}</h3>
              <p className="text-[13.5px] leading-[1.7] text-[var(--ob-text-3)]">{card.blurb}</p>
              <CodeBlock lang={card.lang} code={card.code} />
              <ArrowLink href={card.href} className="mt-auto">
                {card.label} documentation
              </ArrowLink>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ── 09 · Reference ─────────────────────────────────────────────────────── */

/**
 * Short, machine-legible definitions. They mirror the FAQPage structured data
 * emitted by the page.
 *
 * Every sentence here has to survive contact with the detector. An earlier
 * revision of this array described the confirmation rule correctly and the
 * evidence contents as "the regions that observed it" — a claim the deployed
 * topology cannot support.
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
            <Eyebrow index="09">Reference</Eyebrow>
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

/* ── 10 · Maintainer ────────────────────────────────────────────────────── */

export function MaintainerSection() {
  return (
    <Section id="maintainer" tone="void" aria-labelledby="maintainer-title">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)] lg:gap-20">
          <div className="flex flex-col gap-5">
            <Eyebrow index="10">Who builds this</Eyebrow>
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
              the product are one person’s work — which is why it is one price,
              and why the person who built it answers the support inbox.
            </p>

            <div className="border-t border-[var(--ob-line)] pt-6">
              <p className="ob-label mb-4">Where the network is going</p>
              <ol className="grid gap-px sm:grid-cols-2">
                {NETWORK_DIRECTION.map((step, i) => (
                  <li
                    key={step}
                    className="flex items-baseline gap-3 border-t border-[var(--ob-line)] py-3"
                  >
                    <span className="ob-label shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-[13px] leading-[1.6] text-[var(--ob-text-3)]">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="ob-small mt-4 max-w-[58ch]">
                The first step is the product. The rest is described as
                direction, not as capability — nothing above is measured,
                counted, or rendered as a live figure anywhere on this site.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ── 11 · Final CTA ─────────────────────────────────────────────────────── */

export function FinalCTASection() {
  return (
    <Section tone="base" tight aria-labelledby="final-cta-title">
      <Container>
        <div className="flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-5">
            <h2 id="final-cta-title" className="ob-h2 max-w-[20ch]">
              Add one dependency you already own.
            </h2>
            <p className="ob-body max-w-[54ch]">
              Read what the probe records for a day before deciding whether the
              rest of it is worth your attention. The trial needs no card.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
              Start observing
            </Link>
            <Link href={PUBLIC_ROUTES.observatory} className="ob-btn ob-btn-outline">
              See the public data first
            </Link>
          </div>
        </div>
      </Container>
    </Section>
  );
}
