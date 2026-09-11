import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ResearchPaperTemplate } from '@/components/research/research-paper';
import { researchPaper } from '@/lib/research/corpus';
import { SiteShell } from '@/components/site/site-shell';
import { Breadcrumb, Container } from '@/components/site/primitives';
import { JsonLd } from '@/components/seo/json-ld';
import {
  RESEARCH_ARTICLES,
  researchHubRoute,
  researchRoute,
  type ResearchHubSlug,
} from '@/lib/routes';
import { PUBLIC_ROUTES } from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';
import { breadcrumbJsonLd, canonicalUrl, SITE_URL } from '@/lib/seo';
import { isoDate } from '@/lib/research-meta';

/**
 * Articles inside a research hub: `/research/{hub}/{slug}`.
 *
 * The hub prefix is part of the article's identity, not decoration: the
 * canonical URL, the sitemap entry, the breadcrumb and every internal link
 * are produced by the same `researchRoute()` helper, so an article can exist
 * at exactly one address. The top-level `/research/[slug]` route refuses
 * hub-qualified slugs, which makes a duplicate URL structurally impossible.
 */

type Params = { params: Promise<{ slug: string }> };

const HUB: ResearchHubSlug = 'ai-infrastructure';

export function generateStaticParams() {
  return RESEARCH_ARTICLES.filter((a) => 'hub' in a && a.hub === HUB).map((a) => ({
    slug: a.slug,
  }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = RESEARCH_ARTICLES.find(
    (a) => a.slug === slug && 'hub' in a && a.hub === HUB
  );
  if (!article) return { title: 'Not found', robots: { index: false } };

  const path = researchRoute(slug);
  const url = canonicalUrl(path);
  const updatedAt = 'updatedAt' in article ? article.updatedAt : undefined;
  return {
    title: `${article.title} - RELIASTRA AI infrastructure research`,
    description: article.summary,
    keywords: [...article.tags],
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.summary,
      publishedTime: isoDate(article.publishedAt),
      ...(updatedAt ? { modifiedTime: isoDate(updatedAt) } : {}),
      section: article.category,
      tags: [...article.tags],
      url,
      siteName: 'RELIASTRA',
      images: [
        {
          url: `${SITE_URL}/opengraph-image.png`,
          width: 1200,
          height: 630,
          alt: `${article.title} - RELIASTRA research`,
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

export default async function HubArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = RESEARCH_ARTICLES.find(
    (a) => a.slug === slug && 'hub' in a && a.hub === HUB
  );
  const content = RESEARCH_ARTICLE_BODIES[slug];
  if (!article || !content) notFound();

  const hubTitle = 'AI Infrastructure Status & Reliability';
  const updatedAt = 'updatedAt' in article ? article.updatedAt : undefined;

  return (
    <SiteShell>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Research', path: PUBLIC_ROUTES.research },
          { name: hubTitle, path: researchHubRoute(HUB) },
          { name: article.title, path: researchRoute(slug) },
        ])}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container width="read" className="flex flex-wrap items-center justify-between gap-4 py-5 lg:!max-w-[820px]">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
              { name: hubTitle, href: researchHubRoute(HUB) },
              { name: article.title, href: researchRoute(slug) },
            ]}
          />
          <Link
            href={researchHubRoute(HUB)}
            className="ob-label transition-colors hover:text-[var(--ob-signal)]"
          >
            ← AI infrastructure hub
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
          parent: { name: hubTitle, href: researchHubRoute(HUB) },
        }}
        paper={researchPaper(slug)}
        sections={content.sections}
        evidence={content.evidence}
        methodology={content.methodology}
        related={content.related}
        vendorLinks={[
          { href: PUBLIC_ROUTES.track, label: 'Public dependency index' },
          { href: researchHubRoute(HUB), label: 'AI infrastructure hub' },
          { href: PUBLIC_ROUTES.research, label: 'Research home' },
        ]}
      >
        {content.body}
      </ResearchPaperTemplate>
    </SiteShell>
  );
}
