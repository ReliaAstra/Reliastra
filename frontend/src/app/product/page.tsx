import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import {
  DETECTION,
  ATTRIBUTION,
  OBSERVATION_FIELDS,
  OBSERVATION_LABEL,
  OBSERVATION_POINTS,
  PROBE_INTERVAL_SECONDS,
  SCOPE_NOTE,
} from '@/lib/methodology';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES, RETIRED_ROUTES } from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Product',
  description:
    'What RELIASTRA observes, how a fault is confirmed, what the evidence record contains, and how to reach all of it from your own systems.',
  path: PUBLIC_ROUTES.product,
});

/**
 * The product page.
 *
 * This replaces four capability pages that divided the same two subjects -
 * observation and evidence - between them, each with its own metadata, its own
 * diagram and its own wording for the detection rule. Splitting a single
 * explanation across four URLs is how a product ends up describing itself
 * inconsistently, which is exactly what had happened: one of those pages
 * claimed a regional quorum the deployed detector does not perform.
 *
 * The page is ordered as the pipeline is: observe → confirm → attribute →
 * record → integrate. Each step states what it does and what it cannot.
 */
export default function ProductPage() {
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Product', href: PUBLIC_ROUTES.product },
  ];

  const steps = [
    {
      n: '01',
      title: 'Probe',
      body: `An HTTP request every ${PROBE_INTERVAL_SECONDS} seconds by default, from one observation point, reading status and headers and closing the connection.`,
      detail: `Observation point: ${OBSERVATION_LABEL}`,
    },
    {
      n: '02',
      title: 'Confirm',
      body: `${DETECTION.failureChecks} consecutive failed checks open an incident; ${DETECTION.recoveryChecks} consecutive successes close it. A pure function of the stored rows.`,
      detail: `Rule: ${DETECTION.ruleId}`,
    },
    {
      n: '03',
      title: 'Attribute',
      body: `Five weighted signals, summed and compared against two thresholds. Deterministic, versioned, and printed next to every verdict.`,
      detail: `Methodology ${ATTRIBUTION.methodologyVersion}`,
    },
    {
      n: '04',
      title: 'Record',
      body: 'A resolved incident becomes an artifact: the window, every observation in it, the arithmetic, the verdict, and a checksum over the payload.',
      detail: 'Retained 365 days, verifiable without an account',
    },
  ];

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, path: c.href }))),
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            '@id': canonicalUrl(PUBLIC_ROUTES.product),
            name: 'RELIASTRA',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Web, REST API, CLI',
            description:
              'External dependency observation: independent probes, deterministic fault confirmation, and verifiable evidence records.',
            publisher: { '@id': `${SITE_URL}/#organization` },
          },
        ]}
      />

      <header className="relative overflow-hidden border-b border-[var(--ob-line)] bg-black">
        <div aria-hidden className="ob-scene-media">
          <img
            src="/media/scene-edge.webp"
            srcSet="/media/scene-edge-sm.webp 1366w, /media/scene-edge.webp 1672w"
            sizes="100vw"
            alt=""
            loading="eager"
            decoding="async"
            style={{ objectPosition: '72% 50%' }}
          />
          <div className="ob-scene-scrim" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.88),transparent_45%)]" />
        </div>
        <Container className="relative z-[1] flex min-h-[78vh] flex-col justify-end pb-16 pt-36 md:pb-20">
          <Breadcrumb items={crumbs} className="mb-9" />
          <Eyebrow>Platform</Eyebrow>
          <h1 className="ob-display mt-6 max-w-[12ch]">
            Observe. Correlate. Prove.
          </h1>
          <p className="ob-lede mt-7 max-w-[54ch]">
            RELIASTRA does four things, and each of them is a place where a
            weaker tool starts guessing. This page states what each step does,
            what it is allowed to conclude, and what it deliberately does not.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
              Start monitoring
            </Link>
            <Link href={DOCS_ROUTES.quickstart} className="ob-btn ob-btn-outline">
              Add your first dependency
            </Link>
          </div>
        </Container>
      </header>

      {/* ── The pipeline, as the product viewport ── */}
      <Section tone="void" divider={false} aria-labelledby="pipeline-title">
        <Container>
          <div className="flex flex-col gap-6 pb-12">
            <Eyebrow index="01">The pipeline</Eyebrow>
            <h2 id="pipeline-title" className="ob-scene-title max-w-[14ch]">
              Four steps. No guessing.
            </h2>
          </div>
          <ol className="grid gap-px border border-[var(--ob-line)] bg-[var(--ob-line)] md:grid-cols-2 xl:grid-cols-4">
            {steps.map((step) => (
              <li
                key={step.n}
                className="flex flex-col gap-4 bg-[var(--ob-base)] p-7"
              >
                <span className="ob-label ob-label-strong">{step.n}</span>
                <h3 className="ob-h3">{step.title}</h3>
                <p className="text-[14px] leading-[1.68] text-[var(--ob-text-3)]">
                  {step.body}
                </p>
                <p className="ob-label mt-auto pt-3">{step.detail}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ── Observation ── */}
      <Section tone="void" aria-labelledby="obs-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <div className="flex flex-col gap-6">
              <Eyebrow index="02">Observation</Eyebrow>
              <h2 id="obs-title" className="ob-h2 max-w-[18ch]">
                What a probe records, and nothing more.
              </h2>
              <p className="ob-body">
                Six fields, one row per probe. Everything downstream - the
                confirmation, the availability arithmetic, the artifact - is
                derived from rows like this one, which is why they are retained
                individually rather than aggregated on write.
              </p>
              <dl className="flex flex-col">
                {OBSERVATION_FIELDS.map(({ field, note }) => (
                  <div
                    key={field}
                    className="grid gap-1.5 border-t border-[var(--ob-line)] py-3.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-6"
                  >
                    <dt className="ob-mono text-[12.5px] text-[var(--ob-text)]">{field}</dt>
                    <dd className="text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                      {note}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-6">
              <CodeBlock
                lang="json"
                caption="GET /v1/checks/recent"
                code={`[
  {
    "id": "c_01J8K4",
    "dependency_id": "dep_9f1c",
    "executed_at": "2026-09-18T09:53:00Z",
    "status_code": null,
    "latency_ms": null,
    "is_up": false,
    "error_message": "connect timeout",
    "region": "${OBSERVATION_LABEL}"
  }
]`}
              />
              <div className="ob-alert max-w-[62ch]">
                <p className="ob-label mb-2">Two failures, two meanings</p>
                <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-2)]">
                  A <span className="ob-mono">null</span> status with a transport
                  error is a different fact from a{' '}
                  <span className="ob-mono">503</span>. Both are failures to the
                  detector; only one of them is a response. The artifact keeps
                  the distinction, because a vendor reading it will ask.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Confirmation ── */}
      <Section tone="raised" aria-labelledby="confirm-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-20">
            <div className="flex flex-col gap-6">
              <Eyebrow index="03">Confirmation</Eyebrow>
              <h2 id="confirm-title" className="ob-h2 max-w-[18ch]">
                Persistence is the honest signal when there is one vantage
                point.
              </h2>
              <p className="ob-body-lg">
                {OBSERVATION_POINTS === 1
                  ? `There is one observation point, so there is no second opinion to appeal to. A fault is therefore confirmed by persistence: the same probe failing ${DETECTION.failureChecks} checks in a row.`
                  : 'Agreement across independent observation points confirms a fault.'}
              </p>
              <p className="ob-body">
                This is the part of the methodology most often misdescribed, by
                RELIASTRA included: an earlier version of this site claimed
                regional agreement for a detector that never had a region to
                agree with. The rule identifier, its threshold and its reason
                string now travel with the incident and into the record, so the
                claim and the mechanism cannot drift apart again.
              </p>
              <Link href={DOCS_ROUTES.methodology} className="ob-link self-start text-[13.5px]">
                The full methodology →
              </Link>
            </div>

            <div className="flex flex-col gap-6">
              {[
                {
                  title: 'Opens an incident',
                  detail: `${DETECTION.ruleId} · threshold ${DETECTION.failureChecks}`,
                  body: 'started_at is the first failure of the qualifying run, so the window covers the outage rather than the check that noticed it.',
                },
                {
                  title: 'Resolves an incident',
                  detail: `${DETECTION.recoveryRuleId} · threshold ${DETECTION.recoveryChecks}`,
                  body: 'Resolution means this path answered successfully twice. It is not a vendor confirmation and not a claim that the cause was fixed.',
                },
                {
                  title: 'Records without declaring',
                  detail: 'below the threshold',
                  body: 'A failure run that never reaches the threshold stays in the record as observations. It opens nothing and is not hidden.',
                },
              ].map((item) => (
                <div key={item.title} className="border-t border-[var(--ob-line)] pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <h3 className="text-[15px] font-semibold text-[var(--ob-text)]">
                      {item.title}
                    </h3>
                    <span className="ob-mono text-[11.5px] text-[var(--ob-text-4)]">
                      {item.detail}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Attribution ── */}
      <Section tone="void" aria-labelledby="attr-title">
        <Container>
          <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-5">
              <Eyebrow index="04">Attribution</Eyebrow>
              <h2 id="attr-title" className="ob-h2 max-w-[18ch]">
                Arithmetic, printed with its weights.
              </h2>
            </div>
            <p className="ob-body max-w-[46ch]">
              A reader who disagrees with a verdict should be able to recompute
              it. Every weight below is public, and the version that produced a
              result is stamped on the result.
            </p>
          </div>

          <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20">
            <div className="ob-scroll-x overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b border-[var(--ob-line-2)]">
                    {['Signal', 'Weight', 'Question it answers'].map((h) => (
                      <th key={h} scope="col" className="ob-label px-4 py-3 text-left align-bottom">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ATTRIBUTION.signals.map((signal) => (
                    <tr key={signal.key} className="border-b border-[var(--ob-line)]">
                      <th scope="row" className="px-4 py-4 text-left font-medium text-[var(--ob-text)]">
                        {signal.label}
                      </th>
                      <td className="ob-mono px-4 py-4 text-[var(--ob-text-3)]">
                        {signal.weight.toFixed(2)}
                      </td>
                      <td className="px-4 py-4 leading-[1.6] text-[var(--ob-text-3)]">
                        {signal.question}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-5">
              <p className="ob-label">Classification</p>
              {[
                ['vendor_failure', `confidence ≥ ${ATTRIBUTION.vendorFailureAt}`],
                ['multi_cause', `≥ ${ATTRIBUTION.multiCauseAt} and < ${ATTRIBUTION.vendorFailureAt}`],
                ['infrastructure_issue', 'below the thresholds, with RELIASTRA’s own probes degraded'],
                ['unknown', 'everything else - a result, not an error'],
              ].map(([name, when]) => (
                <div
                  key={name}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-[var(--ob-line)] pt-4"
                >
                  <span className="ob-mono text-[12.5px] text-[var(--ob-text)]">{name}</span>
                  <span className="text-[12.5px] text-[var(--ob-text-4)]">{when}</span>
                </div>
              ))}
              <p className="ob-small mt-2 max-w-[54ch]">
                A score is an alignment between two timelines. It is not proof
                of causation, and no surface in this product describes it as
                one.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Individually metered ── */}
      <Section tone="base" aria-labelledby="limits-title">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow index="05">Scope</Eyebrow>
              <h2 id="limits-title" className="ob-h2 max-w-[16ch]">
                What this product does not do.
              </h2>
              <p className="ob-body">
                {SCOPE_NOTE}
              </p>
            </div>
            <ul className="flex flex-col">
              {[
                ['It does not watch your infrastructure.', 'It watches the external services your infrastructure calls. Your own hosts, containers and databases are somebody else’s product.'],
                ['It does not read response bodies.', 'The probe reads status and headers and closes. No payload ever reaches storage.'],
                ['It does not see inside the vendor.', 'It measures the path it called from. Vendor-internal state, other customers and other regions are outside what this data can establish.'],
                ['It does not backfill.', 'A missed probe is missing. The record says so rather than reconstructing it.'],
                ['It does not publish your dependencies.', 'The observatory covers endpoints RELIASTRA measures as its own public record. Customer dependencies are never included.'],
              ].map(([title, body]) => (
                <li key={title} className="border-t border-[var(--ob-line)] py-5">
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                    {title}
                  </p>
                  <p className="mt-2 max-w-[64ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* ── Integrate ── */}
      <Section tone="void" aria-labelledby="integrate-title">
        <Container>
          <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-5">
              <Eyebrow index="06">Integrate</Eyebrow>
              <h2 id="integrate-title" className="ob-h2 max-w-[18ch]">
                Reach it from where the work already happens.
              </h2>
            </div>
            <p className="ob-body max-w-[44ch]">
              The console renders the same objects the API returns. Nothing is
              available in one and not the other.
            </p>
          </div>

          <div className="grid gap-8 pt-10 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Quickstart', href: DOCS_ROUTES.quickstart, body: 'First observation in about five minutes.' },
              { label: 'REST API', href: DOCS_ROUTES.api, body: 'Scoped keys, cursor pagination, the OpenAPI document served by the API.' },
              { label: 'CLI', href: DOCS_ROUTES.cli, body: 'Scriptable, --json output, and a verification command that returns a status code.' },
              { label: 'Webhooks', href: DOCS_ROUTES.webhooks, body: 'Incident and evidence events pushed to your own endpoint.' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col gap-3 border-t border-[var(--ob-line)] pt-6 transition-colors hover:border-[var(--ob-line-3)]"
              >
                <span className="text-[15.5px] font-semibold tracking-[-0.012em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                  {item.label}
                </span>
                <span className="text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                  {item.body}
                </span>
                <span aria-hidden className="ob-label mt-auto pt-3">
                  Read →
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="base" tight aria-labelledby="product-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="product-cta" className="ob-h3 max-w-[26ch]">
                One endpoint you already depend on is enough to judge this.
              </h2>
              <p className="ob-body max-w-[56ch]">
                Add it, watch the observations accumulate, and read the detector’s
                first decision. The trial needs no card.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start monitoring
              </Link>
              <Link href={PUBLIC_ROUTES.productEvidence} className="ob-btn ob-btn-outline">
                Evidence records
              </Link>
            </div>
          </div>
        </Container>
      </Section>

      {/* A note for anyone arriving from a retired URL: the page they wanted is
          this one, and it is worth saying which of the old pages folded in. */}
      <Section tone="void" tight>
        <Container>
          <p className="ob-small max-w-[70ch]">
            This page replaces{' '}
            <span className="ob-mono">{RETIRED_ROUTES.dependencyMonitoring}</span> and{' '}
            <span className="ob-mono">{RETIRED_ROUTES.externalDependencyIntelligence}</span>.
            Evidence moved to{' '}
            <Link href={PUBLIC_ROUTES.productEvidence} className="ob-link">
              /product/evidence
            </Link>
            , and the public index is now the{' '}
            <Link href={PUBLIC_ROUTES.observatory} className="ob-link">
              observatory
            </Link>
            . Old URLs redirect permanently.
          </p>
        </Container>
      </Section>
    </SiteShell>
  );
}
