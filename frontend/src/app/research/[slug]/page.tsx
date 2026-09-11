import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ResearchPaperTemplate } from '@/components/research/research-paper';
import { researchPaper } from '@/lib/research/corpus';
import { SiteShell } from '@/components/site/site-shell';
import { Breadcrumb, Container } from '@/components/site/primitives';
import { JsonLd } from '@/components/seo/json-ld';
import {
  RESEARCH_ARTICLES,
  researchHubRoute,
  researchRoute,
  researchStandaloneArticles,
  PUBLIC_ROUTES,
} from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';
import { breadcrumbJsonLd, canonicalUrl, SITE_URL } from '@/lib/seo';
import { isoDate } from '@/lib/research-meta';

type Params = { params: Promise<{ slug: string }> };

/**
 * Statically generate exactly the published top-level slugs.
 *
 * Derived from the same `RESEARCH_ARTICLES` constant that the footer links, the
 * research index and the sitemap use, so a linked slug and a generated route
 * cannot drift apart - the divergence that produced the original 404s.
 */
export function generateStaticParams() {
  // Top-level articles only. Hub-qualified slugs live at
  // `/research/{hub}/{slug}` and category articles at
  // `/research/{category}/{slug}`; both are redirected from here, so no
  // article is ever reachable at two addresses.
  return researchStandaloneArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  if (!article) return { title: 'Not found', robots: { index: false } };

  const url = canonicalUrl(researchRoute(slug));
  return {
    title: `${article.title} - RELIASTRA Research`,
    description: article.summary,
    keywords: [...article.tags],
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.summary,
      publishedTime: isoDate(article.publishedAt),
      section: article.category,
      tags: [...article.tags],
      url,
      siteName: 'RELIASTRA',
      images: [
        {
          url: `${SITE_URL}/opengraph-image.png`,
          width: 1200,
          height: 630,
          alt: article.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.summary,
      images: [`${SITE_URL}/opengraph-image.png`],
    },
  };
}

/**
 * Unknown slugs return a real 404 rather than a placeholder or a redirect to
 * `/research`. Silently redirecting would hide broken links instead of
 * surfacing them, and would make a stale navigation link look healthy.
 */
export default async function ResearchArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  const content = RESEARCH_ARTICLE_BODIES[slug];

  if (!article || !content) {
    notFound();
  }

  // A hub- or category-qualified slug asked of the top-level route is
  // answered by its canonical address - a permanent redirect, never a second
  // render, so the corpus cannot fork into two indexable URLs.
  if (researchRoute(slug) !== `/research/${slug}`) {
    permanentRedirect(researchRoute(slug));
  }

  const updatedAt = 'updatedAt' in article ? article.updatedAt : undefined;

  return (
    <SiteShell>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Research', path: PUBLIC_ROUTES.research },
          { name: article.title, path: researchRoute(slug) },
        ])}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container width="read" className="flex flex-wrap items-center justify-between gap-4 py-5 lg:!max-w-[820px]">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
              { name: article.title, href: researchRoute(slug) },
            ]}
          />
          <Link
            href={PUBLIC_ROUTES.research}
            className="ob-label transition-colors hover:text-[var(--ob-signal)]"
          >
            ← All research
          </Link>
        </Container>
      </div>

      <ResearchPaperTemplate
        meta={{
          title: article.title,
          summary: article.summary,
          publishedAt: article.publishedAt,
          ...(updatedAt ? { updatedAt } : {}),
          category: article.category,
          tags: [...article.tags],
          path: researchRoute(slug),
          authorId: researchPaper(slug)?.author,
        }}
        paper={researchPaper(slug)}
        sections={content.sections}
        evidence={content.evidence}
        methodology={content.methodology}
        related={content.related}
        vendorLinks={[
          { href: PUBLIC_ROUTES.track, label: 'Public dependency index' },
          { href: PUBLIC_ROUTES.research, label: 'Research home' },
          {
            href: PUBLIC_ROUTES.externalDependencyIntelligence,
            label: 'External Dependency Intelligence',
          },
        ]}
      >
        {content.body}
      </ResearchPaperTemplate>
    </SiteShell>
  );
}
