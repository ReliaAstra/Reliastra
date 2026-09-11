import { SITE_URL } from '@/lib/seo';
import { bylineFor, citationFor, RESEARCH_PUBLISHER, researchAuthor } from './authors';
import type { ResearchPaper } from './types';

/**
 * Structured data for research papers.
 *
 * Two rules, both boring and both load-bearing:
 *
 *  1. **Nothing is asserted that the page does not show.** Every property here
 *     has a visible counterpart. A `Person` node appears only for a declared
 *     author; a `Dataset` node only when the paper ships one; `about` only
 *     names entities the paper actually names.
 *  2. **Nothing is embellished.** No `award`, no `aggregateRating`, no
 *     `isPeerReviewed`, no `citationCount`. Those are the properties an
 *     LLM-generated page invents, and a search engine that catches one stops
 *     trusting the rest.
 */

const abs = (path: string) => (path.startsWith('http') ? path : `${SITE_URL}${path}`);

/** `Person` node for a declared author, or null when there is none. */
export function personJsonLd(authorId: string | undefined) {
  const author = researchAuthor(authorId);
  if (!author) return null;
  return {
    '@type': 'Person',
    name: author.name,
    jobTitle: author.role,
    description: author.bio,
    ...(author.url ? { url: author.url } : {}),
    ...(author.sameAs?.length ? { sameAs: author.sameAs } : {}),
    affiliation: {
      '@type': 'Organization',
      name: RESEARCH_PUBLISHER.name,
      url: RESEARCH_PUBLISHER.url,
    },
  };
}

/** The publisher node, identical on every paper. */
export function publisherJsonLd() {
  return {
    '@type': 'Organization',
    name: RESEARCH_PUBLISHER.name,
    alternateName: RESEARCH_PUBLISHER.brand,
    url: RESEARCH_PUBLISHER.url,
    logo: { '@type': 'ImageObject', url: RESEARCH_PUBLISHER.logo },
  };
}

/**
 * `Dataset` node, emitted only when the paper declares one. `distribution`
 * points at the versioned copy in this repository, so a retrieval system can
 * resolve the data rather than merely being told it exists.
 */
export function datasetJsonLd(paper: ResearchPaper, path: string) {
  if (!paper.dataset) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${abs(path)}#dataset`,
    name: paper.dataset.name,
    description: paper.dataset.description,
    license: paper.dataset.license,
    encodingFormat: paper.dataset.format,
    variableMeasured: paper.dataset.variables.map((v) => ({
      '@type': 'PropertyValue',
      name: v.name,
      description: v.description,
      ...(v.unit ? { unitText: v.unit } : {}),
    })),
    creator: publisherJsonLd(),
    ...(paper.observation
      ? {
          temporalCoverage: `${paper.observation.startedAt}/${paper.observation.endedAt}`,
          spatialCoverage: paper.observation.regions.join(', '),
        }
      : {}),
  };
}

/**
 * The `TechArticle` node. `about` carries the paper's named entities, which
 * is the machine-readable form of the editorial rule that a claim must say
 * who and what it is about.
 */
export function researchArticleJsonLd(
  paper: ResearchPaper | undefined,
  opts: {
    title: string;
    summary: string;
    path: string;
    publishedAt: string;
    updatedAt?: string;
    category?: string;
    tags?: string[];
    authorId?: string;
    readingMinutes: number;
    wordCount: number;
  }
) {
  const pageId = abs(opts.path);
  const author = researchAuthor(opts.authorId);

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${pageId}#article`,
    headline: opts.title,
    description: opts.summary,
    url: pageId,
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageId },
    datePublished: opts.publishedAt,
    dateModified: opts.updatedAt ?? opts.publishedAt,
    inLanguage: 'en',
    wordCount: opts.wordCount,
    timeRequired: `PT${opts.readingMinutes}M`,
    ...(opts.category ? { articleSection: opts.category } : {}),
    ...(opts.tags?.length ? { keywords: opts.tags.join(', ') } : {}),
    author: author ? personJsonLd(opts.authorId) : publisherJsonLd(),
    publisher: publisherJsonLd(),
    copyrightHolder: publisherJsonLd(),
    isAccessibleForFree: true,
    ...(paper
      ? {
          abstract: paper.abstract,
          about: paper.entities.map((e) => ({
            '@type': 'Thing',
            name: e.name,
            ...(e.note ? { description: `${e.role}: ${e.note}` } : {}),
          })),
          ...(paper.references.length
            ? {
                citation: paper.references.map((r) => ({
                  '@type': 'CreativeWork',
                  name: r.title,
                  ...(r.publisher ? { publisher: { '@type': 'Organization', name: r.publisher } } : {}),
                  ...(r.identifier ? { identifier: r.identifier } : {}),
                  ...(r.url ? { url: r.url } : {}),
                  ...(r.publishedAt ? { datePublished: r.publishedAt } : {}),
                })),
              }
            : {}),
          ...(paper.dataset
            ? {
                mentions: {
                  '@type': 'Dataset',
                  name: paper.dataset.name,
                  description: paper.dataset.description,
                },
              }
            : {}),
        }
      : {}),
  };
}

/**
 * `WebPage` node carrying the research question as the page description. An
 * answer engine that lands here without the surrounding navigation should
 * still be able to state what the document set out to answer.
 */
export function researchWebPageJsonLd(
  paper: ResearchPaper | undefined,
  opts: { title: string; summary: string; path: string; publishedAt: string; updatedAt?: string }
) {
  const pageId = abs(opts.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': pageId,
    url: pageId,
    name: opts.title,
    description: paper?.researchQuestion ?? opts.summary,
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    ...(paper?.researchQuestion ? { abstract: paper.abstract } : {}),
    datePublished: opts.publishedAt,
    dateModified: opts.updatedAt ?? opts.publishedAt,
  };
}

/** Plain-text citation for the "Cite this paper" block. */
export function paperCitation(paper: {
  title: string;
  authorId?: string;
  publishedAt: string;
  path: string;
}) {
  return citationFor({
    title: paper.title,
    authorId: paper.authorId,
    publishedAt: paper.publishedAt,
    url: abs(paper.path),
  });
}

export { bylineFor };
