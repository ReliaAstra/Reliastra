import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container, Eyebrow } from '@/components/site/primitives';
import { PreferredSourceSection } from '@/components/seo/preferred-source';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { formatArticleDate, isoDate, readingMinutes } from '@/lib/research-meta';
import { bylineFor, RESEARCH_PUBLISHER, researchAuthor } from '@/lib/research/authors';
import { EVIDENCE_BASIS_LABEL, type EvidenceBasis, type ResearchPaper } from '@/lib/research/types';
import {
  datasetJsonLd,
  paperCitation,
  personJsonLd,
  publisherJsonLd,
  researchArticleJsonLd,
  researchWebPageJsonLd,
} from '@/lib/research/structured-data';
import { breadcrumbJsonLd, canonicalUrl } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';

/**
 * The research paper template.
 *
 * This is a paper, not a post, and the layout enforces that:
 *
 *  - A **document record** at the top exposes title, author, dates, research
 *    question, abstract, key findings, scope and method as plain HTML text.
 *    An LLM that never executes JavaScript and never sees the design can
 *    still state what the document is, what it asked and what it found.
 *  - Every finding carries its **evidence basis**. "Measured" and "reasoned"
 *    render differently, because they are different claims.
 *  - **Limitations are a section, not a footnote.** A paper without stated
 *    limits cannot be distinguished from marketing.
 *  - **References are numbered and linked** from the record, and artifacts
 *    are listed with their paths so a reader can re-run the work.
 *
 * Everything here is server-rendered. No client bundle is loaded to read a
 * paper.
 */

export type PaperMeta = {
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  category?: string;
  tags?: string[];
  path: string;
  authorId?: string;
  /** Parent crumb (hub or category) for the breadcrumb trail. */
  parent?: { name: string; href: string };
};

export type PaperSection = { id: string; label: string };

type Props = {
  meta: PaperMeta;
  paper?: ResearchPaper;
  sections?: PaperSection[];
  children: ReactNode;
  evidence?: ReactNode;
  methodology?: ReactNode;
  related?: { href: string; label: string; description?: string }[];
  vendorLinks?: { href: string; label: string }[];
};

const BASIS_STYLE: Record<EvidenceBasis, string> = {
  measured: 'border-[var(--ob-healthy)] text-[var(--ob-healthy)]',
  derived: 'border-[var(--ob-signal)] text-[var(--ob-signal)]',
  sourced: 'border-[var(--ob-line-3)] text-[var(--ob-text-3)]',
  reasoned: 'border-[var(--ob-line-3)] text-[var(--ob-text-3)]',
};

/* ── Small pieces ────────────────────────────────────────────────────────── */

function RecordRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-6 gap-y-1 border-t border-[var(--ob-line)] py-3.5">
      <dt className="ob-label pt-0.5">{term}</dt>
      <dd className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}

function BasisTag({ basis }: { basis: EvidenceBasis }) {
  return (
    <span
      className={`inline-block border px-1.5 py-px align-middle font-mono text-[9.5px] uppercase tracking-[0.09em] ${BASIS_STYLE[basis]}`}
    >
      {EVIDENCE_BASIS_LABEL[basis]}
    </span>
  );
}

/* ── The paper ───────────────────────────────────────────────────────────── */

export function ResearchPaperTemplate({
  meta,
  paper,
  sections,
  children,
  evidence,
  methodology,
  related,
  vendorLinks,
}: Props) {
  const minutes = readingMinutes([children, evidence, methodology]);
  const wordCount = minutes * 225;
  const author = researchAuthor(meta.authorId);
  const byline = bylineFor(meta.authorId);
  const url = canonicalUrl(meta.path);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Research', path: PUBLIC_ROUTES.research },
    ...(meta.parent ? [{ name: meta.parent.name, path: meta.parent.href }] : []),
    { name: meta.title, path: meta.path },
  ];

  const jsonLd = [
    breadcrumbJsonLd(crumbs),
    researchArticleJsonLd(paper, {
      title: meta.title,
      summary: meta.summary,
      path: meta.path,
      publishedAt: isoDate(meta.publishedAt),
      updatedAt: meta.updatedAt ? isoDate(meta.updatedAt) : undefined,
      category: meta.category,
      tags: meta.tags,
      authorId: meta.authorId,
      readingMinutes: minutes,
      wordCount,
    }),
    researchWebPageJsonLd(paper, {
      title: meta.title,
      summary: meta.summary,
      path: meta.path,
      publishedAt: isoDate(meta.publishedAt),
      updatedAt: meta.updatedAt ? isoDate(meta.updatedAt) : undefined,
    }),
    ...(paper ? [personJsonLd(meta.authorId), datasetJsonLd(paper, meta.path)] : []),
  ].filter(Boolean) as object[];

  const toc: PaperSection[] = [
    ...(sections ?? []),
    ...(paper ? [{ id: 'paper-findings', label: 'Key findings' }] : []),
    ...(evidence ? [{ id: 'paper-observations', label: 'Observations & evidence' }] : []),
    ...(paper ? [{ id: 'paper-limitations', label: 'Limitations' }] : []),
    ...(paper ? [{ id: 'paper-implications', label: 'Practical implications' }] : []),
    ...(methodology ? [{ id: 'paper-methodology', label: 'Methodology' }] : []),
    ...(paper?.references.length ? [{ id: 'paper-references', label: 'References' }] : []),
    ...(paper?.artifacts.length ? [{ id: 'paper-artifacts', label: 'Artifacts & reproduction' }] : []),
    ...(paper?.relatedEvidence.length || related?.length
      ? [{ id: 'paper-related', label: 'Related RELIASTRA evidence' }]
      : []),
  ];

  const relatedLinks = [
    ...(paper?.relatedEvidence ?? []),
    ...(related ?? []).filter((r) => !paper?.relatedEvidence.some((p) => p.href === r.href)),
  ];

  return (
    <article>
      <JsonLd data={jsonLd} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)] pb-12 pt-10 md:pb-16">
        <Container width="read" className="lg:!max-w-[840px]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Eyebrow>{meta.category ?? 'Research'}</Eyebrow>
            {paper && (
              <span className="ob-label text-[var(--ob-text-4)]">
                {paper.researchType} · basis: {EVIDENCE_BASIS_LABEL[paper.evidenceBasis]}
              </span>
            )}
          </div>

          <h1 className="ob-h1 mt-5 max-w-[22ch] text-[clamp(1.85rem,4.2vw,3rem)]">
            {meta.title}
          </h1>

          <p className="mt-6 max-w-[62ch] text-[clamp(1rem,1.35vw,1.125rem)] leading-[1.62] text-[var(--ob-text-2)]">
            {meta.summary}
          </p>

          <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--ob-line)] pt-6">
            <div>
              <dt className="ob-label mb-1.5">Author</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                {author?.url ? (
                  <a href={author.url} className="underline decoration-[var(--ob-signal)] underline-offset-4">
                    {byline}
                  </a>
                ) : (
                  byline
                )}
              </dd>
            </div>
            <div>
              <dt className="ob-label mb-1.5">Published</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                <time dateTime={isoDate(meta.publishedAt)}>{formatArticleDate(meta.publishedAt)}</time>
              </dd>
            </div>
            {meta.updatedAt && (
              <div>
                <dt className="ob-label mb-1.5">Updated</dt>
                <dd className="ob-mono text-[var(--ob-text-2)]">
                  <time dateTime={isoDate(meta.updatedAt)}>{formatArticleDate(meta.updatedAt)}</time>
                </dd>
              </div>
            )}
            <div>
              <dt className="ob-label mb-1.5">Reading time</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{minutes} min · {wordCount.toLocaleString('en-US')} words</dd>
            </div>
            {paper?.observation && (
              <div>
                <dt className="ob-label mb-1.5">Observation window</dt>
                <dd className="ob-mono text-[var(--ob-text-2)]">
                  {paper.observation.startedAt.slice(0, 10)} → {paper.observation.endedAt.slice(5, 16)} UTC
                </dd>
              </div>
            )}
            {meta.tags && meta.tags.length > 0 && (
              <div className="min-w-[16rem]">
                <dt className="ob-label mb-1.5">Subjects</dt>
                <dd className="ob-mono text-[var(--ob-text-2)]">{meta.tags.join(' · ')}</dd>
              </div>
            )}
          </dl>
        </Container>
      </header>

      {/* ── Document record: the machine-readable contract ───────────────── */}
      {paper && (
        <section
          aria-labelledby="paper-record"
          className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <div className="py-10">
              <h2 id="paper-record" className="ob-label mb-1">
                Document record
              </h2>
              <p className="mb-6 max-w-[64ch] text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
                The complete metadata for this paper, as text. Everything a retrieval system needs
                to identify, summarise and cite the document is in this block.
              </p>

              <dl>
                <RecordRow term="Title">{meta.title}</RecordRow>
                <RecordRow term="Author">
                  {byline}
                  {author ? `, ${author.role}` : `, ${RESEARCH_PUBLISHER.imprint}, ${RESEARCH_PUBLISHER.name}`}
                </RecordRow>
                <RecordRow term="Published">
                  <time dateTime={isoDate(meta.publishedAt)}>{formatArticleDate(meta.publishedAt)}</time>
                </RecordRow>
                <RecordRow term="Updated">
                  <time dateTime={isoDate(meta.updatedAt ?? meta.publishedAt)}>
                    {formatArticleDate(meta.updatedAt ?? meta.publishedAt)}
                  </time>
                </RecordRow>
                <RecordRow term="Research question">{paper.researchQuestion}</RecordRow>
                <RecordRow term="Abstract">{paper.abstract}</RecordRow>
                <RecordRow term="Key findings">
                  <ol className="flex flex-col gap-1.5">
                    {paper.keyFindings.map((f, i) => (
                      <li key={f.claim.slice(0, 48)}>
                        <span className="ob-mono mr-2 text-[var(--ob-text-4)]">{i + 1}.</span>
                        {f.claim}
                      </li>
                    ))}
                  </ol>
                </RecordRow>
                <RecordRow term="Scope">{paper.scope}</RecordRow>
                <RecordRow term="Methodology">{paper.methodologySummary}</RecordRow>
                <RecordRow term="Research type">
                  {paper.researchType} · strongest evidence basis: {EVIDENCE_BASIS_LABEL[paper.evidenceBasis]}
                </RecordRow>
                <RecordRow term="Technical domains">{paper.domains.join(', ')}</RecordRow>
                <RecordRow term="Entities">
                  <ul className="flex flex-col gap-1">
                    {paper.entities.map((e) => (
                      <li key={`${e.role}:${e.name}`}>
                        <span className="ob-mono text-[var(--ob-text-4)]">{e.role}:</span> {e.name}
                        {e.note ? ` — ${e.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </RecordRow>
                {paper.observation && (
                  <RecordRow term="Measurement window">
                    <span className="ob-mono">
                      {paper.observation.startedAt} → {paper.observation.endedAt}
                    </span>
                    <br />
                    Source: <span className="ob-mono">{paper.observation.source}</span>
                    <br />
                    Protocol: {paper.observation.protocol}
                    <br />
                    Regions: {paper.observation.regions.join(', ')}
                    <br />
                    Observations: {paper.observation.observations ?? 'not counted'}
                    <br />
                    Method: {paper.observation.method}
                  </RecordRow>
                )}
                {paper.dataset && (
                  <RecordRow term="Dataset">
                    {paper.dataset.name} — <span className="ob-mono">{paper.dataset.path}</span> (
                    {paper.dataset.format}, {paper.dataset.license})
                  </RecordRow>
                )}
                <RecordRow term="Canonical URL">
                  <span className="ob-mono">{url}</span>
                </RecordRow>
                <RecordRow term="Citation">
                  <span className="ob-mono">
                    {paperCitation({
                      title: meta.title,
                      authorId: meta.authorId,
                      publishedAt: isoDate(meta.publishedAt),
                      path: meta.path,
                    })}
                  </span>
                </RecordRow>
              </dl>
            </div>
          </Container>
        </section>
      )}

      {/* ── Contents ─────────────────────────────────────────────────────── */}
      {toc.length > 3 && (
        <nav
          aria-label="Paper contents"
          className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <ol className="flex flex-wrap gap-x-7 gap-y-2 py-5">
              {toc.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="ob-label text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-signal)]"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </Container>
        </nav>
      )}

      {/* ── Key findings ─────────────────────────────────────────────────── */}
      {paper && (
        <section
          id="paper-findings"
          aria-labelledby="paper-findings-h"
          className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <div className="py-12">
              <h2 id="paper-findings-h" className="ob-label mb-6">
                Key findings
              </h2>
              <ol className="flex flex-col">
                {paper.keyFindings.map((f, i) => (
                  <li
                    key={f.claim.slice(0, 48)}
                    className="grid grid-cols-[minmax(0,2.5rem)_minmax(0,1fr)] gap-x-5 border-t border-[var(--ob-line)] py-5"
                  >
                    <span className="ob-mono pt-0.5 text-[var(--ob-signal)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[15.5px] leading-[1.65] text-[var(--ob-text)]">{f.claim}</p>
                      <BasisTag basis={f.basis} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Container>
        </section>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <Container width="read" className="lg:!max-w-[840px]">
        <div className="ob-prose py-14 md:py-16">{children}</div>
      </Container>

      {/* ── Observations & evidence ──────────────────────────────────────── */}
      {evidence && (
        <section
          id="paper-observations"
          aria-labelledby="paper-observations-h"
          className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-observations-h" className="ob-label mb-6">
              Observations &amp; evidence
            </h2>
            <div className="ob-prose">{evidence}</div>
          </Container>
        </section>
      )}

      {/* ── Limitations ──────────────────────────────────────────────────── */}
      {paper && paper.limitations.length > 0 && (
        <section
          id="paper-limitations"
          aria-labelledby="paper-limitations-h"
          className="border-t border-[var(--ob-line)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-limitations-h" className="ob-label mb-2">
              Limitations
            </h2>
            <p className="mb-6 max-w-[62ch] text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
              What this paper cannot establish. Read these before quoting any figure above.
            </p>
            <ul className="flex flex-col">
              {paper.limitations.map((l) => (
                <li
                  key={l.slice(0, 48)}
                  className="border-t border-[var(--ob-line)] py-4 text-[15px] leading-[1.65] text-[var(--ob-text-2)]"
                >
                  {l}
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {/* ── Practical implications ───────────────────────────────────────── */}
      {paper && paper.recommendations.length > 0 && (
        <section
          id="paper-implications"
          aria-labelledby="paper-implications-h"
          className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-implications-h" className="ob-label mb-6">
              Practical architecture implications
            </h2>
            <ul className="flex flex-col">
              {paper.recommendations.map((r) => (
                <li key={r.title} className="border-t border-[var(--ob-line)] py-5">
                  <h3 className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                    {r.title}
                  </h3>
                  <p className="mt-2 max-w-[66ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
                    {r.detail}
                  </p>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {/* ── Methodology ──────────────────────────────────────────────────── */}
      {methodology && (
        <section
          id="paper-methodology"
          aria-labelledby="paper-methodology-h"
          className="border-t border-[var(--ob-line)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-methodology-h" className="ob-label mb-6">
              Methodology &amp; sources
            </h2>
            <div className="ob-prose">{methodology}</div>
          </Container>
        </section>
      )}

      {/* ── References ───────────────────────────────────────────────────── */}
      {paper && paper.references.length > 0 && (
        <section
          id="paper-references"
          aria-labelledby="paper-references-h"
          className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-references-h" className="ob-label mb-6">
              References
            </h2>
            <ol className="flex flex-col">
              {paper.references.map((r, i) => (
                <li
                  key={r.id}
                  id={`ref-${r.id}`}
                  className="grid grid-cols-[minmax(0,2.5rem)_minmax(0,1fr)] gap-x-5 border-t border-[var(--ob-line)] py-4"
                >
                  <span className="ob-mono pt-0.5 text-[var(--ob-text-4)]">[{i + 1}]</span>
                  <div className="flex flex-col gap-1">
                    <p className="text-[14.5px] leading-[1.55] text-[var(--ob-text-2)]">
                      {r.url ? (
                        <a
                          href={r.url}
                          rel="nofollow noopener"
                          target="_blank"
                          className="underline decoration-[var(--ob-signal)] underline-offset-4 hover:text-[var(--ob-signal)]"
                        >
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                      {r.identifier && <span className="ob-mono"> · {r.identifier}</span>}
                    </p>
                    <p className="text-[12.5px] leading-[1.5] text-[var(--ob-text-4)]">
                      {[
                        r.publisher,
                        r.publishedAt ? `published ${r.publishedAt}` : null,
                        r.accessedAt ? `accessed ${r.accessedAt}` : null,
                        r.kind.replace(/-/g, ' '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {r.note && (
                      <p className="text-[12.5px] leading-[1.5] text-[var(--ob-text-4)]">{r.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      )}

      {/* ── Artifacts ────────────────────────────────────────────────────── */}
      {paper && paper.artifacts.length > 0 && (
        <section
          id="paper-artifacts"
          aria-labelledby="paper-artifacts-h"
          className="border-t border-[var(--ob-line)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-artifacts-h" className="ob-label mb-2">
              Artifacts &amp; reproduction
            </h2>
            <p className="mb-6 max-w-[64ch] text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
              Versioned in the RELIASTRA monorepo under{' '}
              <span className="ob-mono text-[var(--ob-text-3)]">research/</span>. Each artifact is
              readable on its own; the paper is the argument, the artifact is the work.
            </p>
            <ul className="flex flex-col">
              {paper.artifacts.map((a) => (
                <li key={a.label} className="border-t border-[var(--ob-line)] py-5">
                  <p className="ob-label mb-2 text-[var(--ob-signal)]">
                    {a.kind}
                    {a.format ? ` · ${a.format}` : ''}
                  </p>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                    {a.label}
                  </h3>
                  <p className="mt-1.5 max-w-[66ch] text-[14px] leading-[1.6] text-[var(--ob-text-3)]">
                    {a.description}
                  </p>
                  {(a.path || a.url) && (
                    <p className="mt-2 ob-mono text-[12.5px] text-[var(--ob-text-4)]">
                      {a.url ? (
                        <a href={a.url} className="underline decoration-[var(--ob-signal)] underline-offset-4">
                          {a.url}
                        </a>
                      ) : (
                        a.path
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {/* ── Related RELIASTRA evidence ───────────────────────────────────── */}
      {relatedLinks.length > 0 && (
        <section
          id="paper-related"
          aria-labelledby="paper-related-h"
          className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-14"
        >
          <Container width="read" className="lg:!max-w-[840px]">
            <h2 id="paper-related-h" className="ob-label mb-2">
              Related RELIASTRA evidence
            </h2>
            <p className="mb-6 max-w-[64ch] text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
              Records, methodology and definitions this paper depends on - not a recommendation
              engine, the actual graph.
            </p>
            <ul>
              {relatedLinks.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="group flex flex-col gap-1.5 border-t border-[var(--ob-line)] py-5 transition-colors hover:border-[var(--ob-line-3)]"
                  >
                    <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                      {r.label}
                    </span>
                    {r.description && (
                      <span className="text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
                        {r.description}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}

      {/* ── Author ───────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="paper-author-h"
        className="border-t border-[var(--ob-line)] py-12"
      >
        <Container width="read" className="lg:!max-w-[840px]">
          <h2 id="paper-author-h" className="ob-label mb-5">
            Authorship
          </h2>
          {author ? (
            <div className="flex flex-col gap-2">
              <p className="text-[16px] font-semibold text-[var(--ob-text)]">
                {author.name}
                <span className="ml-3 text-[13px] font-normal text-[var(--ob-text-4)]">
                  {author.role}
                </span>
              </p>
              <p className="max-w-[66ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
                {author.bio}
              </p>
              {author.domains && (
                <p className="ob-mono text-[12.5px] text-[var(--ob-text-4)]">
                  {author.domains.join(' · ')}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[16px] font-semibold text-[var(--ob-text)]">
                {RESEARCH_PUBLISHER.imprint}
              </p>
              <p className="max-w-[66ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
                Published by {RESEARCH_PUBLISHER.name}. Every measurement cited here was issued by
                RELIASTRA&rsquo;s own observation infrastructure or read from a public endpoint at
                the timestamp shown; every artifact is versioned in the RELIASTRA repository so the
                arithmetic can be checked by anyone.
              </p>
              <p className="ob-mono text-[12.5px] text-[var(--ob-text-4)]">
                {publisherJsonLd().name} · {RESEARCH_PUBLISHER.url}
              </p>
            </div>
          )}
          <p className="mt-6 max-w-[66ch] border-t border-[var(--ob-line)] pt-5 text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
            Cite as: <span className="ob-mono">{paperCitation({
              title: meta.title,
              authorId: meta.authorId,
              publishedAt: isoDate(meta.publishedAt),
              path: meta.path,
            })}</span>
          </p>
        </Container>
      </section>

      {/* ── Preferred source ─────────────────────────────────────────────── */}
      <div className="ob-no-print border-t border-[var(--ob-line)] py-12">
        <Container width="read" className="lg:!max-w-[840px]">
          <PreferredSourceSection variant="research" />
        </Container>
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="paper-cta"
        className="ob-no-print border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-16"
      >
        <Container width="read" className="lg:!max-w-[840px]">
          <h2 id="paper-cta" className="ob-h3 max-w-[26ch]">
            Observe the dependencies this analysis applies to.
          </h2>
          <p className="ob-body mt-3 max-w-[58ch]">
            RELIASTRA issues its own requests to your external dependencies, records every
            observation with its timestamp and origin, and keeps the record yours.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
              Start monitoring
            </Link>
            <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-outline">
              Public dependency index
            </Link>
          </div>

          {vendorLinks && vendorLinks.length > 0 && (
            <nav
              aria-label="Continue reading"
              className="mt-10 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--ob-line)] pt-6"
            >
              {vendorLinks.map((v) => (
                <Link
                  key={v.href}
                  href={v.href}
                  className="ob-label transition-colors hover:text-[var(--ob-signal)]"
                >
                  {v.label} →
                </Link>
              ))}
            </nav>
          )}
        </Container>
      </section>
    </article>
  );
}
