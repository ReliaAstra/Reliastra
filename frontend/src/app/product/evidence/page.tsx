import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { CodeBlock } from '@/components/docs/code-block';
import { EvidenceArtifact } from '@/components/site/visuals/evidence-artifact';
import { EVIDENCE_CAN, EVIDENCE_CANNOT, EVIDENCE, SCOPE_NOTE } from '@/lib/methodology';
import {
  EVIDENCE_FOOTER_FIELDS,
  EVIDENCE_FIGURES,
  EVIDENCE_REPORT_FIELDS,
  EVIDENCE_REPORT_SECTIONS,
} from '@/lib/product-contract';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Evidence records',
  description:
    'What a RELIASTRA evidence record contains: the incident window, every observation in it, the attribution verdict, the checksums, and how a third party verifies it without an account.',
  path: PUBLIC_ROUTES.productEvidence,
});

/**
 * Evidence records.
 *
 * The artifact is the most distinctive object in the product and the one most
 * likely to be read by somebody who has never heard of RELIASTRA - a vendor
 * support engineer, an account manager, an arbitrator. So the page is written
 * for that reader as much as for the customer: what is inside, how it is
 * checked, and what it does not say.
 *
 * Every heading, field label and figure in the mock below is transcribed from
 * the report template through `product-contract.ts`. If the template changes,
 * this page fails a test rather than describing a document that no longer
 * exists.
 */
export default function EvidenceProductPage() {
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Product', href: PUBLIC_ROUTES.product },
    { name: 'Evidence', href: PUBLIC_ROUTES.productEvidence },
  ];

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, path: c.href }))),
          {
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            '@id': canonicalUrl(PUBLIC_ROUTES.productEvidence),
            url: canonicalUrl(PUBLIC_ROUTES.productEvidence),
            headline: 'RELIASTRA evidence records',
            description:
              'The contents, integrity model and verification procedure of a RELIASTRA evidence record.',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            publisher: { '@id': `${SITE_URL}/#organization` },
            inLanguage: 'en',
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb items={crumbs} className="mb-8" />
          <Eyebrow>Evidence</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[19ch]">
            The part of the incident that survives the conversation.
          </h1>
          <p className="ob-lede mt-6 max-w-[64ch]">
            An evidence record is a compiled artifact for one incident: what was
            measured, over what window, from where, what the detector concluded,
            and the hashes that let a stranger check none of it was altered.
          </p>
          <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
            <ArrowLink href={DOCS_ROUTES.evidence}>Evidence documentation</ArrowLink>
            <ArrowLink href={DOCS_ROUTES.verification}>Verification procedure</ArrowLink>
          </div>
        </Container>
      </header>

      {/* ── The artifact ── */}
      <Section tone="void" divider={false} tight aria-labelledby="artifact-title">
        <Container width="narrow">
          <h2 id="artifact-title" className="sr-only">
            The artifact
          </h2>
          <EvidenceArtifact />
          <p className="ob-small mt-5 max-w-[68ch]">
            Illustrative structure. The field labels and section order are the
            ones the renderer emits; the values shown are an example, not a real
            incident.
          </p>
        </Container>
      </Section>

      {/* ── What it opens with ── */}
      <Section tone="void" aria-labelledby="figures-title">
        <Container>
          <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-5">
              <Eyebrow index="01">The finding</Eyebrow>
              <h2 id="figures-title" className="ob-h2 max-w-[18ch]">
                Four figures before the sections that substantiate them.
              </h2>
            </div>
            <p className="ob-body max-w-[46ch]">
              A reader opens a document of record with one question. Answer it on
              the first page, then show the working — a report that makes
              somebody hunt for the number is a report that gets skimmed.
            </p>
          </div>
          <ol className="grid gap-px pt-10 sm:grid-cols-2 xl:grid-cols-4">
            {EVIDENCE_FIGURES.map((figure, i) => (
              <li
                key={figure}
                className="flex flex-col gap-4 border-t border-[var(--ob-line)] pt-6 xl:pr-8"
              >
                <span className="ob-label ob-label-signal">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[16px] font-semibold tracking-[-0.012em] text-[var(--ob-text)]">
                  {figure}
                </span>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* ── Sections and fields ── */}
      <Section tone="raised" aria-labelledby="sections-title">
        <Container>
          <div className="flex flex-col gap-5">
            <Eyebrow index="02">Contents</Eyebrow>
            <h2 id="sections-title" className="ob-h2 max-w-[20ch]">
              Ten sections, and the fields in each.
            </h2>
          </div>

          <div className="mt-12 flex flex-col">
            {EVIDENCE_REPORT_SECTIONS.map((section, i) => {
              const fields = (EVIDENCE_REPORT_FIELDS as Record<string, readonly string[]>)[section];
              return (
                <div
                  key={section}
                  className="grid gap-4 border-t border-[var(--ob-line)] py-7 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16"
                >
                  <div className="flex items-baseline gap-4">
                    <span className="ob-label shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-[15.5px] font-semibold tracking-[-0.012em] text-[var(--ob-text)]">
                      {section}
                    </h3>
                  </div>
                  {fields ? (
                    <ul className="flex flex-wrap gap-x-6 gap-y-2">
                      {fields.map((field) => (
                        <li
                          key={field}
                          className="ob-mono text-[11.5px] leading-[1.7] text-[var(--ob-text-3)]"
                        >
                          {field}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                      The chart, drawn from the observations in the appendix
                      rather than from a separate aggregate.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ── Integrity ── */}
      <Section tone="void" aria-labelledby="integrity-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <div className="flex flex-col gap-6">
              <Eyebrow index="03">Integrity</Eyebrow>
              <h2 id="integrity-title" className="ob-h2 max-w-[18ch]">
                Three separate things are being proved.
              </h2>
              <p className="ob-body">
                A checksum over the payload, a checksum over the rendered bytes,
                and a signature over the payload. They answer different
                questions, so the artifact reports them separately instead of
                collapsing them into one reassuring word.
              </p>
              <dl className="flex flex-col">
                {[
                  ['Evidence data hash', `SHA-256 over the canonical ${EVIDENCE.schemaVersion} payload — the incident's facts as data.`],
                  ['Document checksum', 'SHA-256 over the rendered file. A PDF cannot contain the hash of itself, so this lives on the record.'],
                  ['Signature', 'Ed25519 over the payload bytes, when the deployment has a signing key. Public key at /v1/verify/keys.'],
                ].map(([term, def]) => (
                  <div key={term} className="border-t border-[var(--ob-line)] py-5">
                    <dt className="text-[14.5px] font-semibold text-[var(--ob-text)]">{term}</dt>
                    <dd className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                      {def}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-6">
              <CodeBlock
                lang="json"
                caption="GET /v1/verify/{verification-id} · no authentication"
                code={`{
  "found": true,
  "incident_id": "9f1c8b0e-…",
  "time_window": {
    "start": "2026-09-18T09:53:00+00:00",
    "end": "2026-09-18T10:07:00+00:00"
  },
  "data_hash": "3f9a…c41e",
  "report_checksum": "0c72…a1b9",
  "methodology_version": "v1.0",
  "authenticity": {
    "signed": true,
    "algorithm": "Ed25519",
    "signature_covers": "canonical payload bytes",
    "public_keys": "/v1/verify/keys"
  }
}`}
              />
              <div className="flex flex-col gap-2">
                <p className="ob-label">Footer fields</p>
                <ul className="flex flex-wrap gap-x-6 gap-y-2">
                  {EVIDENCE_FOOTER_FIELDS.map((field) => (
                    <li key={field} className="ob-mono text-[11.5px] text-[var(--ob-text-3)]">
                      {field}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="ob-small max-w-[56ch]">
                {SCOPE_NOTE}
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Limits ── */}
      <Section tone="base" aria-labelledby="limits-title">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
            <div className="flex flex-col gap-6">
              <Eyebrow index="04">What it establishes</Eyebrow>
              <ul className="flex flex-col gap-4">
                {EVIDENCE_CAN.map((line) => (
                  <li key={line} className="flex gap-4 border-t border-[var(--ob-line)] pt-5">
                    <span aria-hidden className="ob-label ob-label-signal pt-1">
                      ✓
                    </span>
                    <span className="max-w-[56ch] text-[14px] leading-[1.65] text-[var(--ob-text-2)]">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-6">
              <Eyebrow index="05">What it does not</Eyebrow>
              <ul className="flex flex-col gap-4">
                {EVIDENCE_CANNOT.map((line) => (
                  <li key={line} className="flex gap-4 border-t border-[var(--ob-line)] pt-5">
                    <span aria-hidden className="ob-label pt-1">
                      —
                    </span>
                    <span className="max-w-[56ch] text-[14px] leading-[1.65] text-[var(--ob-text-3)]">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="void" tight aria-labelledby="evidence-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="evidence-cta" className="ob-h3 max-w-[26ch]">
                The only way to judge a record is to see one.
              </h2>
              <p className="ob-body max-w-[56ch]">
                Start observing a dependency you already run, and the first
                confirmed incident produces a real one — with your endpoint on it
                and nobody else’s.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start observing
              </Link>
              <Link href={PUBLIC_ROUTES.product} className="ob-btn ob-btn-outline">
                Back to the product
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}


