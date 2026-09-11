import type { Metadata } from 'next';
import { ResearchCategoryArticlePage } from '@/components/research/category-article';
import { RESEARCH_ARTICLES, researchRoute } from '@/lib/routes';
import { canonicalUrl, SITE_URL } from '@/lib/seo';
import { isoDate } from '@/lib/research-meta';
import { researchPaper } from '@/lib/research/corpus';

const CATEGORY = 'measurement-integrity';
const CATEGORY_TITLE = 'Measurement integrity';

type Params = { params: Promise<{ slug: string }> };

/**
 * Exactly the published slugs in this category. A slug that belongs to another
 * category or to the top level is not generated here; if it is requested, the
 * page permanently redirects to its canonical address.
 */
export function generateStaticParams() {
  return RESEARCH_ARTICLES.filter(
    (a) => 'section' in a && a.section === CATEGORY
  ).map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = RESEARCH_ARTICLES.find((a) => a.slug === slug);
  if (!article || !('section' in article && article.section === CATEGORY)) {
    return { title: 'Not found | RELIASTRA', robots: { index: false } };
  }
  const url = canonicalUrl(researchRoute(slug));
  const paper = researchPaper(slug);
  return {
    title: `${article.title} - RELIASTRA Research`,
    description: article.summary,
    keywords: [...article.tags],
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title: article.title,
      description: paper?.abstract ?? article.summary,
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

export default async function MeasurementIntegrityArticlePage({ params }: Params) {
  const { slug } = await params;
  return (
    <ResearchCategoryArticlePage
      category={CATEGORY}
      categoryTitle={CATEGORY_TITLE}
      slug={slug}
    />
  );
}
