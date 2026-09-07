import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleTemplate } from '@/components/content/article-template';
import { SiteShell } from '@/components/site/site-shell';
import { Breadcrumb, Container } from '@/components/site/primitives';
import { JsonLd } from '@/components/seo/json-ld';
import { RESEARCH_ARTICLES, researchRoute, PUBLIC_ROUTES } from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';
import { breadcrumbJsonLd, canonicalUrl, SITE_URL } from '@/lib/seo';
import { isoDate } from '@/lib/research-meta';

type Params = { params: Promise<{ slug: string }> };

/**
 * Statically generate exactly the published slugs.
 *
 * Derived from the same `RESEARCH_ARTICLES` constant that the footer links, the
 * research index and the sitemap use, so a linked slug and a generated route
 * cannot drift apart - the divergence that produced the original 404s.
 */
export function generateStaticParams() {
  return RESEARCH_ARTICLES.map((article) => ({ slug: article.slug }));
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

      <ArticleTemplate
        meta={{
          title: article.title,
          summary: article.summary,
          publishedAt: article.publishedAt,
          category: article.category,
          tags: [...article.tags],
          organization: 'Reliastra',
          path: researchRoute(slug),
        }}
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
      </ArticleTemplate>
    </SiteShell>
  );
}
