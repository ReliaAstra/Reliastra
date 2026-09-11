import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { SiteShell } from '@/components/site/site-shell';
import { Breadcrumb, Container } from '@/components/site/primitives';
import { PUBLIC_ROUTES, RESEARCH_ARTICLES, researchCategoryRoute, researchRoute } from '@/lib/routes';
import { RESEARCH_ARTICLE_BODIES } from '@/content/research-articles';
import { researchPaper } from '@/lib/research/corpus';
import { ResearchPaperTemplate, type PaperSection } from './research-paper';

/**
 * Renders one paper at `/research/{category}/{slug}`.
 *
 * Three guards, in order:
 *
 *  1. The slug must be a published article with a body.
 *  2. Its canonical address must be this address. A paper reachable at two
 *     URLs is a duplicate, and duplicates split a corpus's authority - so a
 *     misfiled slug is permanently redirected, never rendered twice.
 *  3. The category segment must be the article's declared section.
 */
export function ResearchCategoryArticlePage({
  category,
  categoryTitle,
  slug,
}: {
  category: string;
  categoryTitle: string;
  slug: string;
}) {
  const article = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  const content = RESEARCH_ARTICLE_BODIES[slug];

  if (!article || !content) notFound();
  if (researchRoute(slug) !== `${researchCategoryRoute(category)}/${slug}`) {
    permanentRedirect(researchRoute(slug));
  }

  const paper = researchPaper(slug);
  const updatedAt = 'updatedAt' in article ? article.updatedAt : undefined;

  return (
    <SiteShell>
      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container
          width="read"
          className="flex flex-wrap items-center justify-between gap-4 py-5 lg:!max-w-[840px]"
        >
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
              { name: categoryTitle, href: researchCategoryRoute(category) },
              { name: article.title, href: researchRoute(slug) },
            ]}
          />
          <Link
            href={researchCategoryRoute(category)}
            className="ob-label transition-colors hover:text-[var(--ob-signal)]"
          >
            ← All papers in this category
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
          authorId: paper?.author,
          parent: { name: categoryTitle, href: researchCategoryRoute(category) },
        }}
        paper={paper}
        sections={content.sections as PaperSection[] | undefined}
        evidence={content.evidence}
        methodology={content.methodology}
        related={content.related}
        vendorLinks={[
          { href: PUBLIC_ROUTES.track, label: 'Public dependency index' },
          { href: PUBLIC_ROUTES.research, label: 'Research home' },
          { href: PUBLIC_ROUTES.externalDependencyIntelligence, label: 'External Dependency Intelligence' },
        ]}
      >
        {content.body}
      </ResearchPaperTemplate>
    </SiteShell>
  );
}
