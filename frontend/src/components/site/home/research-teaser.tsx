import Link from 'next/link';
import { Container, Eyebrow } from '@/components/site/primitives';
import { SceneLinks } from './scenes';
import {
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  researchRoute,
} from '@/lib/routes';

/**
 * 07 · Research, as full-width typographic rows instead of a card band.
 * Three papers that carry the product's argument; the index carries the rest.
 */
const FEATURED_SLUGS = [
  'the-dependency-gap',
  'how-reliastra-measures-vendor-reliability',
  'availability-record-audit',
] as const;

export function ResearchTeaser() {
  const featured = FEATURED_SLUGS.map((slug) =>
    RESEARCH_ARTICLES.find((a) => a.slug === slug)
  ).filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <section
      id="research"
      aria-labelledby="research-title"
      className="border-t border-[var(--ob-line)] bg-[var(--ob-base)]"
    >
      <Container className="py-24 md:py-32">
        <div className="flex flex-col gap-9 pb-14 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-7">
            <Eyebrow index="07">Research</Eyebrow>
            <h2 id="research-title" className="ob-scene-title max-w-[14ch]">
              The method is published.
            </h2>
          </div>
          <div className="lg:pb-2">
            <SceneLinks
              items={[{ href: PUBLIC_ROUTES.research, label: 'All research' }]}
            />
          </div>
        </div>

        <div>
          {featured.map((article) => (
            <Link key={article.slug} href={researchRoute(article.slug)} className="ob-teaser group">
              <span className="ob-teaser-row">
                <span className="ob-teaser-title max-w-[26ch]">{article.title}</span>
                <span className="ob-teaser-meta flex flex-col items-end gap-2">
                  <span className="ob-label">{article.category}</span>
                  <span className="ob-label">{article.publishedAt.slice(0, 4)}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
