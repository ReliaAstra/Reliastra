import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import {
  RESEARCH_ARTICLES,
  RESEARCH_CATEGORIES,
  RESEARCH_HUBS,
  PUBLIC_ROUTES,
  researchCategoryArticles,
  researchCategoryRoute,
  researchHubArticles,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_URL, breadcrumbJsonLd, canonicalUrl } from '@/lib/seo';
import { isoDate, readingTimeFor } from '@/lib/research-meta';
import { bylineFor } from '@/lib/research/authors';
import { RESEARCH_PAPERS, researchPaper } from '@/lib/research/corpus';
import { EVIDENCE_BASIS_LABEL } from '@/lib/research/types';
import { ResearchIndex, type ResearchIndexEntry } from '@/components/research/research-index';

export const metadata: Metadata = {
  title: 'Research - Independent infrastructure intelligence',
  description:
    'RELIASTRA Research investigates how digital systems fail when their dependencies, control planes, APIs and security boundaries interact. Published measurements, methodology, datasets and the claims we refuse to make.',
  alternates: { canonical: canonicalUrl(PUBLIC_ROUTES.research) },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'RELIASTRA Research - Independent infrastructure intelligence',
    description:
      'Dependency failure attribution, AI infrastructure reliability, telemetry integrity and cloud trust boundaries - measured, documented and reproducible.',
    url: canonicalUrl(PUBLIC_ROUTES.research),
    type: 'website',
    images: [
      {
        url: `${SITE_URL}/opengraph-image.png`,
        width: 1200,
        height: 630,
        alt: 'RELIASTRA Research',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RELIASTRA Research',
    description:
      'Measurement methodology, dependency failure analysis and the standards RELIASTRA holds its own data to.',
    images: [`${SITE_URL}/opengraph-image.png`],
  },
};

/**
 * The research index.
 *
 * Structured as a corpus, not a feed: an editorial position, the collections
 * the papers belong to, and the whole corpus in one crawlable list that can be
 * narrowed by domain, type, vendor and evidence basis without ever creating a
 * second URL.
 *
 * Every paper appears in the server-rendered HTML. Facets toggle `hidden` on
 * the client, so a crawler sees all of it and no facet becomes a thin page.
 */
export default function ResearchIndexPage() {
  const entries: ResearchIndexEntry[] = [...RESEARCH_ARTICLES]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((article) => {
      const paper = researchPaper(article.slug);
      const hub = 'hub' in article ? article.hub : undefined;
      const section = 'section' in article ? article.section : undefined;
      const group = hub
        ? (RESEARCH_HUBS.find((h) => h.slug === hub)?.navLabel ?? hub)
        : section
          ? (RESEARCH_CATEGORIES.find((c) => c.slug === section)?.title ?? section)
          : 'Research';
      const groupHref = hub
        ? researchHubRoute(hub)
        : section
          ? researchCategoryRoute(section)
          : PUBLIC_ROUTES.research;

      return {
        slug: article.slug,
        href: researchRoute(article.slug),
        title: article.title,
        summary: article.summary,
        question: paper?.researchQuestion,
        group,
        groupHref,
        category: article.category,
        publishedAt: isoDate(article.publishedAt),
        updatedAt: 'updatedAt' in article ? isoDate(article.updatedAt) : undefined,
        domains: paper ? [...paper.domains] : [],
        researchType: paper?.researchType,
        evidenceBasis: paper ? EVIDENCE_BASIS_LABEL[paper.evidenceBasis] : undefined,
        tags: [...article.tags],
        vendors: paper
          ? paper.entities.filter((e) => e.role === 'vendor').map((e) => e.name)
          : [],
        author: bylineFor(paper?.author),
        readingTime: readingTimeFor(article.slug),
      };
    });

  const measured = RESEARCH_PAPERS.filter((p) => p.evidenceBasis === 'measured').length;
  const reproducible = RESEARCH_PAPERS.filter((p) =>
    p.artifacts.some((a) => a.kind === 'script' || a.kind === 'dataset')
  ).length;
  const datasets = RESEARCH_PAPERS.filter((p) => p.dataset).length;

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Research', path: PUBLIC_ROUTES.research },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': `${SITE_URL}/research`,
            url: `${SITE_URL}/research`,
            name: 'RELIASTRA Research',
            description:
              'Independent infrastructure intelligence: measurement methodology, dependency failure analysis and the standards RELIASTRA holds its own data to.',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            inLanguage: 'en',
            publisher: {
              '@type': 'Organization',
              name: 'Reliastra, Inc.',
              url: SITE_URL,
            },
            hasPart: entries.map((e) => ({
              '@type': 'TechArticle',
              headline: e.title,
              description: e.summary,
              datePublished: e.publishedAt,
              ...(e.updatedAt ? { dateModified: e.updatedAt } : {}),
              url: canonicalUrl(e.href),
              ...(e.question ? { abstract: e.question } : {}),
            })),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'RELIASTRA research corpus',
            itemListElement: entries.map((e, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: canonicalUrl(e.href),
              name: e.title,
            })),
          },
        ]}
      />

      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
            ]}
            className="mb-9"
          />
          <Eyebrow>Research</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[20ch]">
            The gap between what operators think is happening and what the evidence shows.
          </h1>
          <p className="ob-lede mt-6 max-w-[62ch]">
            RELIASTRA Research investigates how digital systems fail when their dependencies,
            control planes, APIs, AI providers and security boundaries interact. Papers here state a
            question, show the evidence, separate observation from inference, and name what they
            cannot prove.
          </p>

          <dl className="mt-12 grid max-w-4xl grid-cols-2 gap-x-10 gap-y-6 border-t border-[var(--ob-line)] pt-7 md:grid-cols-4">
            <div>
              <dt className="ob-label mb-2">Papers</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{entries.length}</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Built on measurement</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{measured}</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">With an artifact</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{reproducible}</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Published datasets</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">{datasets}</dd>
            </div>
          </dl>
        </Container>
      </header>

      {/* ── Collections ──────────────────────────────────────────────────── */}
      <Section tone="void" aria-labelledby="collections-heading">
        <Container>
          <h2 id="collections-heading" className="ob-label mb-8">
            Collections
          </h2>
          <ul>
            {RESEARCH_HUBS.map((hub) => (
              <li key={hub.slug}>
                <Link
                  href={researchHubRoute(hub.slug)}
                  className="group grid gap-5 border-t border-[var(--ob-line)] py-9 transition-colors hover:border-[var(--ob-line-3)] lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:gap-14"
                >
                  <div className="flex flex-col gap-3">
                    <p className="ob-label text-[var(--ob-signal)]">
                      Live observatory hub · {researchHubArticles(hub.slug).length} papers · measured
                      records
                    </p>
                    <h3 className="ob-h2 max-w-[26ch] transition-colors group-hover:text-[var(--ob-signal)]">
                      {hub.title}
                    </h3>
                    <p className="max-w-[70ch] text-[15px] leading-[1.65] text-[var(--ob-text-3)]">
                      {hub.lede}
                    </p>
                  </div>
                  <p className="ob-label self-end lg:text-right">
                    Open the hub →
                  </p>
                </Link>
              </li>
            ))}
            {RESEARCH_CATEGORIES.map((cat) => (
              <li key={cat.slug}>
                <Link
                  href={researchCategoryRoute(cat.slug)}
                  className="group grid gap-5 border-t border-[var(--ob-line)] py-9 transition-colors hover:border-[var(--ob-line-3)] lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:gap-14"
                >
                  <div className="flex flex-col gap-3">
                    <p className="ob-label text-[var(--ob-signal)]">
                      Category · {researchCategoryArticles(cat.slug).length} papers
                    </p>
                    <h3 className="ob-h2 max-w-[26ch] transition-colors group-hover:text-[var(--ob-signal)]">
                      {cat.title}
                    </h3>
                    <p className="max-w-[70ch] text-[15px] leading-[1.65] text-[var(--ob-text-3)]">
                      {cat.lede}
                    </p>
                  </div>
                  <p className="ob-label self-end lg:text-right">
                    {researchCategoryArticles(cat.slug).length} papers →
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* ── The corpus ───────────────────────────────────────────────────── */}
      <section aria-labelledby="corpus-heading" className="bg-[var(--ob-base)] pb-16 pt-12">
        <div className="mx-auto w-full max-w-[1200px] px-[var(--ob-gutter)]">
          <h2 id="corpus-heading" className="ob-label mb-2">
            All papers
          </h2>
          <p className="max-w-[68ch] text-[14px] leading-[1.6] text-[var(--ob-text-4)]">
            Newest first. Every entry states its research question, its evidence basis and its
            reading time. Filtering narrows this list; it does not create a new page.
          </p>
        </div>
        <div className="mt-8">
          <ResearchIndex entries={entries} />
        </div>
      </section>

      {/* ── Editorial standard ───────────────────────────────────────────── */}
      <Section tone="void" aria-labelledby="policy-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Editorial standard</Eyebrow>
              <h2 id="policy-heading" className="ob-h2 max-w-[16ch]">
                What we will not publish.
              </h2>
              <p className="max-w-[46ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
                Technical credibility is the only asset a research corpus has. Every paper is
                written against the list on the right before it is written against anything else.
              </p>
              <div className="mt-2">
                <ArrowLink href={researchRoute('reliastra-research-agenda')}>
                  Research agenda
                </ArrowLink>
              </div>
              <div>
                <ArrowLink href={researchRoute('how-reliastra-measures-vendor-reliability')}>
                  Measurement methodology
                </ArrowLink>
              </div>
            </div>
            <ul className="flex flex-col">
              {[
                'Vendor rankings without window, sample size and method.',
                'Synthetic data as observation. Backfilled probes.',
                'Causal claims from correlated timelines.',
                'Customer endpoints, credentials or identities.',
                'A finding labelled "measured" that no measurement supports.',
                'A paper without stated limitations.',
              ].map((line) => (
                <li
                  key={line}
                  className="border-t border-[var(--ob-line)] py-5 text-[15px] leading-[1.65] text-[var(--ob-text-2)]"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* ── Evidence ─────────────────────────────────────────────────────── */}
      <Section tone="base" tight aria-labelledby="research-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="research-cta" className="ob-h2 max-w-[20ch]">
                The records these papers are built on.
              </h2>
              <p className="ob-body max-w-[58ch]">
                Independently measured observations for tracked dependencies, published without an
                account. The audit papers above read the same endpoints you can read.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-signal">
                Public dependency index
              </Link>
              <Link
                href={PUBLIC_ROUTES.externalDependencyIntelligence}
                className="ob-btn ob-btn-outline"
              >
                The category
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}
