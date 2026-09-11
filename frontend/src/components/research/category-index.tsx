import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container, Eyebrow, Section } from '@/components/site/primitives';
import { Breadcrumb } from '@/components/site/primitives';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd, canonicalUrl, SITE_URL } from '@/lib/seo';
import {
  PUBLIC_ROUTES,
  RESEARCH_CATEGORIES,
  researchCategoryArticles,
  researchCategoryRoute,
  researchRoute,
  RESEARCH_HUBS,
  researchHubRoute,
} from '@/lib/routes';
import { formatArticleDate, isoDate, readingTimeFor } from '@/lib/research-meta';
import { bylineFor } from '@/lib/research/authors';
import { researchPaper } from '@/lib/research/corpus';
import { EVIDENCE_BASIS_LABEL } from '@/lib/research/types';

/**
 * A research category index.
 *
 * A category exists because papers exist for it. `notFound()` is called when
 * the segment is not a declared category *or* when a declared category has no
 * papers - both cases must 404 rather than render an empty shell, because an
 * empty index is a thin page and thin pages are how a corpus loses standing.
 */
export function ResearchCategoryPage({ slug }: { slug: string }) {
  const category = RESEARCH_CATEGORIES.find((c) => c.slug === slug);
  const articles = [...researchCategoryArticles(slug)].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  if (!category || articles.length === 0) notFound();

  const path = researchCategoryRoute(slug);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Research', path: PUBLIC_ROUTES.research },
            { name: category.title, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(path),
            url: canonicalUrl(path),
            name: `${category.title} - RELIASTRA Research`,
            description: category.lede,
            isPartOf: { '@id': `${SITE_URL}/#website` },
            inLanguage: 'en',
            hasPart: articles.map((a) => ({
              '@type': 'TechArticle',
              headline: a.title,
              description: a.summary,
              datePublished: isoDate(a.publishedAt),
              url: canonicalUrl(researchRoute(a.slug)),
            })),
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-12 md:py-16">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
              { name: category.title, href: path },
            ]}
            className="mb-8"
          />
          <Eyebrow>Research · {category.title}</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[18ch]">{category.title}</h1>
          <p className="ob-lede mt-5 max-w-[62ch]">{category.lede}</p>

          <dl className="mt-10 grid max-w-3xl grid-cols-3 gap-x-8 gap-y-5 border-t border-[var(--ob-line)] pt-6">
            <div>
              <dt className="ob-label mb-2">Papers</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{articles.length}</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Publisher</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">Reliastra, Inc.</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Latest</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                {formatArticleDate(articles[0].publishedAt)}
              </dd>
            </div>
          </dl>
        </Container>
      </header>

      <Section tone="void" aria-labelledby="category-papers">
        <Container>
          <h2 id="category-papers" className="ob-label mb-2">
            Papers in this category
          </h2>
          <ul>
            {articles.map((a) => {
              const paper = researchPaper(a.slug);
              return (
                <li key={a.slug}>
                  <Link
                    href={researchRoute(a.slug)}
                    className="group grid gap-5 border-t border-[var(--ob-line)] py-9 transition-colors hover:border-[var(--ob-line-3)] lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)] lg:gap-14"
                  >
                    <div className="flex flex-col gap-3">
                      <p className="ob-label">
                        <time dateTime={isoDate(a.publishedAt)}>{formatArticleDate(a.publishedAt)}</time>
                        {' · '}
                        {readingTimeFor(a.slug)}
                        {paper ? ` · ${paper.researchType.toLowerCase()}` : ''}
                      </p>
                      <h3 className="ob-h2 max-w-[28ch] transition-colors group-hover:text-[var(--ob-signal)]">
                        {a.title}
                      </h3>
                      {paper && (
                        <p className="max-w-[62ch] border-l-2 border-[var(--ob-signal)] pl-4 text-[14px] leading-[1.6] text-[var(--ob-text-3)]">
                          <span className="ob-mono mr-2 text-[10px] uppercase tracking-[0.1em] text-[var(--ob-signal)]">
                            Question
                          </span>
                          {paper.researchQuestion}
                        </p>
                      )}
                      <p className="max-w-[68ch] text-[15px] leading-[1.65] text-[var(--ob-text-3)]">
                        {a.summary}
                      </p>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {(paper?.domains ?? []).map((d) => (
                          <li key={d} className="text-[12.5px] text-[var(--ob-text-4)]">
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <dl className="flex flex-col gap-3 self-start lg:text-right">
                      <div>
                        <dt className="ob-label mb-1">Author</dt>
                        <dd className="text-[13px] text-[var(--ob-text-3)]">{bylineFor(paper?.author)}</dd>
                      </div>
                      {'updatedAt' in a && a.updatedAt && (
                        <div>
                          <dt className="ob-label mb-1">Updated</dt>
                          <dd className="text-[13px] text-[var(--ob-text-3)]">
                            {formatArticleDate(a.updatedAt)}
                          </dd>
                        </div>
                      )}
                      {paper && (
                        <div>
                          <dt className="ob-label mb-1">Evidence basis</dt>
                          <dd className="text-[13px] text-[var(--ob-text-3)]">
                            {EVIDENCE_BASIS_LABEL[paper.evidenceBasis]}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </Section>

      <Section tone="base" aria-labelledby="category-elsewhere">
        <Container>
          <h2 id="category-elsewhere" className="ob-label mb-6">
            Elsewhere in the corpus
          </h2>
          <ul className="grid gap-x-14 gap-y-1 md:grid-cols-2">
            {RESEARCH_HUBS.filter((h) => h.slug !== slug).map((h) => (
              <li key={h.slug}>
                <Link
                  href={researchHubRoute(h.slug)}
                  className="group flex flex-col gap-1.5 border-t border-[var(--ob-line)] py-5"
                >
                  <span className="text-[15px] font-semibold text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                    {h.title}
                  </span>
                  <span className="text-[13px] leading-[1.55] text-[var(--ob-text-4)]">
                    Live observatory hub · measured records and the research built on them
                  </span>
                </Link>
              </li>
            ))}
            {RESEARCH_CATEGORIES.filter((c) => c.slug !== slug).map((c) => (
              <li key={c.slug}>
                <Link
                  href={researchCategoryRoute(c.slug)}
                  className="group flex flex-col gap-1.5 border-t border-[var(--ob-line)] py-5"
                >
                  <span className="text-[15px] font-semibold text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                    {c.title}
                  </span>
                  <span className="text-[13px] leading-[1.55] text-[var(--ob-text-4)]">
                    {researchCategoryArticles(c.slug).length} papers
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={PUBLIC_ROUTES.track}
                className="group flex flex-col gap-1.5 border-t border-[var(--ob-line)] py-5"
              >
                <span className="text-[15px] font-semibold text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                  Public dependency index
                </span>
                <span className="text-[13px] leading-[1.55] text-[var(--ob-text-4)]">
                  The live records these papers audit
                </span>
              </Link>
            </li>
          </ul>
        </Container>
      </Section>
    </>
  );
}
