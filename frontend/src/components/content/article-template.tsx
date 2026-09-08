import Link from 'next/link';
import type { ReactNode } from 'react';
import { PreferredSourceSection } from '@/components/seo/preferred-source';
import { Container, Eyebrow } from '@/components/site/primitives';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { formatArticleDate, isoDate, readingMinutes } from '@/lib/research-meta';

export type ArticleMeta = {
  title: string;
  summary: string;
  publishedAt: string; // ISO
  updatedAt?: string;
  author?: string;
  organization?: string;
  category?: string;
  tags?: string[];
  /** Canonical article path, e.g. `/research/the-dependency-gap`. */
  path?: string;
};

export type RelatedLink = { href: string; label: string; description?: string };

type Props = {
  meta: ArticleMeta;
  children: ReactNode;
  evidence?: ReactNode;
  methodology?: ReactNode;
  related?: RelatedLink[];
  vendorLinks?: RelatedLink[];
};

/**
 * Research article layout.
 *
 * Structure (unchanged contract, rebuilt presentation):
 *   type → title → thesis → publication metadata → body → key findings /
 *   evidence → methodology & sources → related research → CTA.
 *
 * Reading rules applied here:
 * - One column, ~68 characters. Long-form technical prose is unreadable at
 *   full width and the previous template let it run to 720px of small grey.
 * - 17px base with 1.75 line-height, and the same scale on mobile - a
 *   research paper read on a phone is the common case, not the edge case.
 * - Metadata is a real `<dl>` and dates are real `<time>` elements, so the
 *   visible metadata and the structured data are the same facts.
 * - Nothing is wrapped in an app shell: the article is the page.
 */
export function ArticleTemplate({
  meta,
  children,
  evidence,
  methodology,
  related,
  vendorLinks,
}: Props) {
  const pageId = `https://reliastra.com${meta.path ?? ''}`;
  const minutes = readingMinutes([children, evidence, methodology]);
  const byline = meta.author ?? meta.organization ?? 'Reliastra';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.title,
    description: meta.summary,
    datePublished: isoDate(meta.publishedAt),
    dateModified: isoDate(meta.updatedAt ?? meta.publishedAt),
    wordCount: minutes * 225,
    timeRequired: `PT${minutes}M`,
    keywords: meta.tags?.join(', '),
    articleSection: meta.category,
    author: meta.author
      ? { '@type': 'Person', name: meta.author }
      : { '@type': 'Organization', name: meta.organization ?? 'Reliastra' },
    publisher: {
      '@type': 'Organization',
      name: 'Reliastra',
      logo: {
        '@type': 'ImageObject',
        url: 'https://reliastra.com/logo.svg',
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageId },
    inLanguage: 'en',
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)] pb-12 pt-10 md:pb-16">
        <Container width="read" className="lg:!max-w-[820px]">
          <Eyebrow>{meta.category ?? 'Research'}</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[20ch] text-[clamp(2rem,4.6vw,3.25rem)]">
            {meta.title}
          </h1>
          <p className="mt-6 max-w-[60ch] text-[clamp(1rem,1.4vw,1.1875rem)] leading-[1.6] text-[var(--ob-text-2)]">
            {meta.summary}
          </p>

          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--ob-line)] pt-6">
            <div>
              <dt className="ob-label mb-1.5">Author</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{byline}</dd>
            </div>
            <div>
              <dt className="ob-label mb-1.5">Published</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                <time dateTime={isoDate(meta.publishedAt)}>
                  {formatArticleDate(meta.publishedAt)}
                </time>
              </dd>
            </div>
            {meta.updatedAt && (
              <div>
                <dt className="ob-label mb-1.5">Updated</dt>
                <dd className="ob-mono text-[var(--ob-text-2)]">
                  <time dateTime={isoDate(meta.updatedAt)}>
                    {formatArticleDate(meta.updatedAt)}
                  </time>
                </dd>
              </div>
            )}
            <div>
              <dt className="ob-label mb-1.5">Reading time</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                {minutes} min
              </dd>
            </div>
            {meta.tags && meta.tags.length > 0 && (
              <div>
                <dt className="ob-label mb-1.5">Subjects</dt>
                <dd className="ob-mono text-[var(--ob-text-2)]">
                  {meta.tags.join(' · ')}
                </dd>
              </div>
            )}
          </dl>
        </Container>
      </header>

      {/* Body */}
      <Container width="read" className="lg:!max-w-[820px]">
        <div className="ob-prose py-14 md:py-20">{children}</div>
      </Container>

      {/* Evidence & data */}
      {evidence && (
        <section
          aria-labelledby="article-evidence"
          className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-14"
        >
          <Container width="read" className="lg:!max-w-[820px]">
            <h2 id="article-evidence" className="ob-label mb-6">
              Evidence &amp; data
            </h2>
            <div className="ob-prose">{evidence}</div>
          </Container>
        </section>
      )}

      {/* Methodology & sources */}
      {methodology && (
        <section
          aria-labelledby="article-methodology"
          className="border-t border-[var(--ob-line)] py-14"
        >
          <Container width="read" className="lg:!max-w-[820px]">
            <h2 id="article-methodology" className="ob-label mb-6">
              Methodology &amp; sources
            </h2>
            <div className="ob-prose">{methodology}</div>
          </Container>
        </section>
      )}

      {/* Related research */}
      {related && related.length > 0 && (
        <section
          aria-labelledby="article-related"
          className="border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-14"
        >
          <Container width="read" className="lg:!max-w-[820px]">
            <h2 id="article-related" className="ob-label mb-2">
              Related research
            </h2>
            <ul>
              {related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="group flex flex-col gap-2 border-t border-[var(--ob-line)] py-5 transition-colors hover:border-[var(--ob-line-3)]"
                  >
                    <span className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
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

      {/* Preferred Source */}
      <div className="ob-no-print border-t border-[var(--ob-line)] py-12">
        <Container width="read" className="lg:!max-w-[820px]">
          <PreferredSourceSection variant="research" />
        </Container>
      </div>

      {/* CTA */}
      <section
        aria-labelledby="article-cta"
        className="ob-no-print border-t border-[var(--ob-line)] bg-[var(--ob-base)] py-16"
      >
        <Container width="read" className="lg:!max-w-[820px]">
          <h2 id="article-cta" className="ob-h3 max-w-[24ch]">
            Monitor this dependency class with RELIASTRA.
          </h2>
          <p className="ob-body mt-3">
            Add the external services this analysis applies to and RELIASTRA
            begins observing them from independent regions on the next check
            interval.
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
