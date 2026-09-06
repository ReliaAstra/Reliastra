import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Breadcrumb,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { RESEARCH_ARTICLES, researchRoute, PUBLIC_ROUTES } from '@/lib/routes';
import { JsonLd } from '@/components/seo/json-ld';
import { SITE_URL, breadcrumbJsonLd, canonicalUrl } from '@/lib/seo';
import { formatArticleDate, isoDate, readingTimeFor } from '@/lib/research-meta';

export const metadata: Metadata = {
  title: 'Research - Independent infrastructure intelligence',
  description:
    'RELIASTRA Research publishes the measurement methodology behind every reliability record: how vendor availability is observed, how incidents are attributed, and the claims we refuse to make.',
  alternates: { canonical: canonicalUrl(PUBLIC_ROUTES.research) },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'RELIASTRA Research - Independent infrastructure intelligence',
    description:
      'The measurement methodology behind every RELIASTRA reliability record, published so it can be checked.',
    url: canonicalUrl(PUBLIC_ROUTES.research),
    type: 'website',
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'RELIASTRA Research',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RELIASTRA Research',
    description: 'How RELIASTRA measures vendor reliability, published in public.',
    images: [`${SITE_URL}/opengraph-image`],
  },
};

/**
 * The research index.
 *
 * Positioned as a technical publication rather than a company blog: a
 * masthead, a standing editorial statement, a lead article with real weight,
 * and an archive listing with dates, reading time and subject tags.
 *
 * Categories and tags are read from `RESEARCH_ARTICLES` — the same constant
 * that produces `generateStaticParams`, the sitemap and the footer. No topic
 * taxonomy is invented here that the content does not actually carry.
 */
export default function ResearchIndexPage() {
  const [lead, ...archive] = RESEARCH_ARTICLES;
  const subjects = Array.from(
    new Set(RESEARCH_ARTICLES.flatMap((a) => a.tags))
  );

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
            hasPart: RESEARCH_ARTICLES.map((a) => ({
              '@type': 'TechArticle',
              headline: a.title,
              description: a.summary,
              datePublished: isoDate(a.publishedAt),
              url: canonicalUrl(researchRoute(a.slug)),
            })),
          },
        ]}
      />

      {/* Masthead */}
      <header className="relative overflow-hidden border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <div className="absolute inset-0">
          <Image
            src="/media/fiber-patch-panel.jpg"
            alt=""
            aria-hidden
            fill
            sizes="100vw"
            quality={70}
            className="ob-photo object-cover object-center opacity-[0.18]"
          />
          <div className="absolute inset-0 bg-[var(--ob-base)]/70" aria-hidden />
        </div>

        <Container className="relative py-14 md:py-24">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
            ]}
            className="mb-9"
          />
          <Eyebrow>RELIASTRA Research</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[15ch]">
            Independent infrastructure intelligence.
          </h1>
          <p className="ob-lede mt-6">
            Customers take RELIASTRA reliability records into commercial
            conversations with their vendors. That only works if the method can
            be inspected. Everything published here describes how the product
            actually behaves — not a marketing summary of it.
          </p>

          <dl className="mt-12 grid max-w-4xl grid-cols-2 gap-x-10 gap-y-6 border-t border-[var(--ob-line)] pt-7 sm:grid-cols-4">
            <div>
              <dt className="ob-label mb-2">Published</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                {RESEARCH_ARTICLES.length} papers
              </dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Publisher</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">Reliastra, Inc.</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Licence</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">Free to read</dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Standard</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                Method disclosed
              </dd>
            </div>
          </dl>
        </Container>
      </header>

      {/* Subjects — real tags from the corpus, not an invented taxonomy */}
      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <Container className="flex flex-wrap items-center gap-x-8 gap-y-3 py-5">
          <span className="ob-label">Subjects</span>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {subjects.map((tag) => (
              <li
                key={tag}
                className="text-[13px] text-[var(--ob-text-3)]"
              >
                {tag}
              </li>
            ))}
          </ul>
        </Container>
      </div>

      {/* Lead paper */}
      <Section tone="void" divider={false} aria-labelledby="lead-heading">
        <Container>
          <p className="ob-label mb-8 border-b border-[var(--ob-line)] pb-4">
            Latest
          </p>
          <article>
            <Link
              href={researchRoute(lead.slug)}
              className="group grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16"
            >
              <div className="flex flex-col gap-6">
                <p className="ob-label">
                  {lead.category} ·{' '}
                  <time dateTime={isoDate(lead.publishedAt)}>
                    {formatArticleDate(lead.publishedAt)}
                  </time>{' '}
                  · {readingTimeFor(lead.slug)}
                </p>
                <h2
                  id="lead-heading"
                  className="ob-h1 max-w-[15ch] transition-colors group-hover:text-[var(--ob-signal)]"
                >
                  {lead.title}
                </h2>
                <p className="max-w-[62ch] text-[16.5px] leading-[1.7] text-[var(--ob-text-3)]">
                  {lead.summary}
                </p>
                <span className="ob-label mt-1 text-[var(--ob-signal)]">
                  Read the paper →
                </span>
              </div>
              <ul className="flex flex-col self-end border-t border-[var(--ob-line)] lg:border-t-0">
                {lead.tags.map((t) => (
                  <li
                    key={t}
                    className="border-b border-[var(--ob-line)] py-3 text-[13px] text-[var(--ob-text-4)]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </Link>
          </article>
        </Container>
      </Section>

      {/* Archive */}
      <Section tone="base" aria-labelledby="archive-heading">
        <Container>
          <h2 id="archive-heading" className="ob-label mb-2">
            Archive
          </h2>
          <ul>
            {archive.map((article) => (
              <li key={article.slug}>
                <Link
                  href={researchRoute(article.slug)}
                  className="group grid gap-4 border-t border-[var(--ob-line)] py-8 transition-colors hover:border-[var(--ob-line-3)] lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,180px)] lg:gap-12"
                >
                  <p className="ob-label pt-1.5">
                    <time dateTime={isoDate(article.publishedAt)}>
                      {formatArticleDate(article.publishedAt)}
                    </time>
                  </p>
                  <div className="flex flex-col gap-2.5">
                    <h3 className="ob-h3 transition-colors group-hover:text-[var(--ob-signal)]">
                      {article.title}
                    </h3>
                    <p className="max-w-[64ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-3)]">
                      {article.summary}
                    </p>
                  </div>
                  <p className="ob-label pt-1.5 lg:text-right">
                    {article.category}
                    <br />
                    <span className="text-[var(--ob-text-4)]">
                      {readingTimeFor(article.slug)}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* Standing editorial policy — the trust surface */}
      <Section tone="void" aria-labelledby="policy-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Editorial standard</Eyebrow>
              <h2 id="policy-heading" className="ob-h2 max-w-[14ch]">
                What we will not publish.
              </h2>
              <p className="ob-body">
                These commitments constrain the product as much as the writing.
                They are stated in full in the research agenda.
              </p>
              <div className="mt-2">
                <ArrowLink href={researchRoute('reliastra-research-agenda')}>
                  Read the research agenda
                </ArrowLink>
              </div>
            </div>
            <ul className="flex flex-col">
              {[
                'Vendor rankings without the measurement window, sample size and methodology stated alongside them.',
                'Synthetic data presented as observation, or missed probes backfilled after the fact.',
                'Causal claims derived from correlated timelines.',
                'Customer endpoints, credentials or identities on any public surface.',
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

      <Section tone="base" tight aria-labelledby="research-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="research-cta" className="ob-h2 max-w-[18ch]">
                Reading is one thing. Measuring your own stack is another.
              </h2>
              <p className="ob-body max-w-[56ch]">
                The public dependency index shows what RELIASTRA’s probes
                observe for tracked vendors right now — no account required.
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
