import Link from 'next/link';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { RESEARCH_ARTICLES, PUBLIC_ROUTES, researchRoute } from '@/lib/routes';
import { formatArticleDate, readingTimeFor } from '@/lib/research-meta';

/**
 * 07 · Research.
 *
 * Research is a trust surface, not a blog teaser. The lead item gets real
 * editorial weight; the rest are an index. Everything derives from
 * `RESEARCH_ARTICLES`, so this section cannot link to a slug that 404s.
 */
export function ResearchTeaser() {
  const [lead, ...rest] = RESEARCH_ARTICLES;

  return (
    <Section id="research" tone="void" aria-labelledby="research-title">
      <Container>
        <div className="flex flex-col gap-6 border-b border-[var(--ob-line)] pb-10 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5">
            <Eyebrow index="08">Research</Eyebrow>
            <h2 id="research-title" className="ob-h2 max-w-[18ch]">
              Our method is published, so it can be checked.
            </h2>
          </div>
          <p className="ob-body max-w-[42ch] md:text-right">
            Measurement methodology and failure analysis, in the open.
          </p>
        </div>

        <div className="grid gap-10 pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
          {/* Lead */}
          <article className="flex flex-col">
            <Link href={researchRoute(lead.slug)} className="group flex flex-col gap-5">
              <p className="ob-label">
                {lead.category} · {formatArticleDate(lead.publishedAt)} ·{' '}
                {readingTimeFor(lead.slug)}
              </p>
              <h3 className="ob-h1 max-w-[16ch] text-[clamp(1.75rem,3.4vw,2.75rem)] transition-colors group-hover:text-[var(--ob-signal)]">
                {lead.title}
              </h3>
              <p className="max-w-[58ch] text-[15.5px] leading-[1.7] text-[var(--ob-text-3)]">
                {lead.summary}
              </p>
              <span className="ob-label mt-2 text-[var(--ob-signal)]">
                Read →
              </span>
            </Link>
          </article>

          {/* Index */}
          <div className="flex flex-col">
            <p className="ob-label border-b border-[var(--ob-line)] pb-4">
              Also published
            </p>
            {rest.map((article) => (
              <Link
                key={article.slug}
                href={researchRoute(article.slug)}
                className="group flex flex-col gap-2.5 border-b border-[var(--ob-line)] py-6"
              >
                <span className="ob-label">
                  {article.category} · {formatArticleDate(article.publishedAt)}
                </span>
                <span className="text-[17px] font-semibold leading-snug tracking-[-0.015em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                  {article.title}
                </span>
                <span className="text-[13.5px] leading-[1.6] text-[var(--ob-text-4)]">
                  {article.summary}
                </span>
              </Link>
            ))}
            <div className="pt-7">
              <ArrowLink href={PUBLIC_ROUTES.research}>
                All research
              </ArrowLink>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
