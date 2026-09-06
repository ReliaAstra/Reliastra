import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleTemplate } from '@/components/content/article-template';
import { RESEARCH_ARTICLES, researchRoute, PUBLIC_ROUTES } from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';

type Params = { params: Promise<{ slug: string }> };

/**
 * Statically generate exactly the published slugs.
 *
 * Derived from the same `RESEARCH_ARTICLES` constant that the footer links, the
 * research index and the sitemap use, so a linked slug and a generated route
 * cannot drift apart — the divergence that produced the original 404s.
 */
export function generateStaticParams() {
  return RESEARCH_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  if (!article) return { title: 'Not found — RELIASTRA' };

  return {
    title: `${article.title} — RELIASTRA Research`,
    description: article.summary,
    alternates: { canonical: researchRoute(slug) },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.summary,
      publishedTime: article.publishedAt,
      url: researchRoute(slug),
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
    <main className="min-h-screen bg-white dark:bg-[#0A0A0F]">
      <div className="mx-auto max-w-[720px] px-6 pt-10">
        <Link
          href={PUBLIC_ROUTES.research}
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#71717A] transition-colors hover:text-[#0891B2] dark:hover:text-[#22D3EE]"
        >
          ← All research
        </Link>
      </div>

      <ArticleTemplate
        meta={{
          title: article.title,
          summary: article.summary,
          publishedAt: article.publishedAt,
          category: article.category,
          tags: [...article.tags],
          organization: 'Reliastra',
        }}
        evidence={content.evidence}
        methodology={content.methodology}
        related={content.related}
        vendorLinks={[
          { href: PUBLIC_ROUTES.track, label: 'Track a vendor' },
          { href: PUBLIC_ROUTES.research, label: 'Research home' },
        ]}
      >
        {content.body}
      </ArticleTemplate>
    </main>
  );
}
