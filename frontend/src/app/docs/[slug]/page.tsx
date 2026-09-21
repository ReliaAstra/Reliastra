import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import { Breadcrumb, Container, Eyebrow, Section } from '@/components/site/primitives';
import { DocsSideNav } from '@/components/docs/docs-side-nav';
import { DocBlocks } from '@/components/docs/doc-blocks';
import { DOCS, docFor } from '@/lib/docs/corpus';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, canonicalUrl, DISCOVERY_ALTERNATES } from '@/lib/seo';
import { robotsDirective } from '@/lib/indexability';

/**
 * One documentation guide.
 *
 * Static: `generateStaticParams` reads the corpus, so a guide is a real route
 * the moment it exists in `lib/docs/corpus.ts` and cannot be a dead sidebar
 * link. The table of contents is generated from the same `sections` array the
 * body renders, so it cannot describe sections that are not there.
 */
export function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = docFor(slug);
  if (!doc) return {};
  const path = DOCS_ROUTES[slug as keyof typeof DOCS_ROUTES];
  return {
    title: `${doc.title} - RELIASTRA docs`,
    description: doc.summary,
    alternates: { canonical: canonicalUrl(path), ...DISCOVERY_ALTERNATES },
    robots: robotsDirective({ index: true, follow: true }),
    openGraph: {
      title: `${doc.title} - RELIASTRA docs`,
      description: doc.summary,
      url: canonicalUrl(path),
      siteName: 'RELIASTRA',
      type: 'article',
    },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docFor(slug);
  if (!doc) notFound();

  const path = DOCS_ROUTES[slug as keyof typeof DOCS_ROUTES];
  const index = DOCS.findIndex((d) => d.slug === slug);
  const next = DOCS[index + 1];

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Docs', path: PUBLIC_ROUTES.docs },
            { name: doc.title, path },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'TechArticle',
            '@id': canonicalUrl(path),
            url: canonicalUrl(path),
            headline: doc.title,
            description: doc.summary,
            articleSection: doc.group,
            isPartOf: { '@id': `${SITE_URL}/#website` },
            publisher: { '@id': `${SITE_URL}/#organization` },
            inLanguage: 'en',
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-12 md:py-16">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Docs', href: PUBLIC_ROUTES.docs },
              { name: doc.title, href: path },
            ]}
            className="mb-7"
          />
          <Eyebrow>{doc.group}</Eyebrow>
          <h1 className="ob-h1 mt-4 max-w-[22ch]">{doc.title}</h1>
          <p className="ob-lede mt-5">{doc.summary}</p>
        </Container>
      </header>

      <Section tone="void" divider={false} tight>
        <Container>
          <div className="grid gap-12 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-16">
            <DocsSideNav activeHref={path} />

            <article className="min-w-0 max-w-[780px]">
              {/* On-page contents. Sections are the corpus's own, so this list
                  cannot drift from the body. */}
              {doc.sections.length > 2 && (
                <nav aria-labelledby="on-this-page" className="mb-12 border border-[var(--ob-line)] bg-[var(--ob-raised)] p-5">
                  <h2 id="on-this-page" className="ob-label mb-3">
                    On this page
                  </h2>
                  <ol className="flex flex-col gap-2">
                    {doc.sections.map((section, i) => (
                      <li key={section.id} className="flex gap-3 text-[13.5px]">
                        <span className="ob-label w-5 shrink-0 pt-[3px]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <a href={`#${section.id}`} className="ob-link border-0 py-0">
                          {section.heading}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}

              {doc.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-[96px]">
                  <h2 className="ob-h3 mt-14 border-t border-[var(--ob-line)] pt-8 first:mt-0 first:border-0 first:pt-0">
                    {section.heading}
                  </h2>
                  <div className="ob-prose mt-5">
                    <DocBlocks blocks={section.blocks} />
                  </div>
                </section>
              ))}

              <div className="mt-16 flex flex-col gap-6 border-t border-[var(--ob-line)] pt-8">
                <div className="flex flex-col gap-2">
                  <p className="ob-label">Problem with this page?</p>
                  <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                    These guides live in the repository. An inaccuracy in the
                    documentation is a bug, and the fastest fix is an issue with
                    the sentence quoted.{' '}
                    <a
                      href="https://github.com/ReliAstra"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ob-link"
                    >
                      Open an issue
                    </a>
                    .
                  </p>
                </div>
                {next && (
                  <div className="flex flex-col gap-2">
                    <p className="ob-label">Next</p>
                    <Link
                      href={DOCS_ROUTES[next.slug as keyof typeof DOCS_ROUTES]}
                      className="text-[16px] font-semibold tracking-[-0.012em] text-[var(--ob-text)] transition-colors hover:text-[var(--ob-signal)]"
                    >
                      {next.title} →
                    </Link>
                    <p className="text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                      {next.summary}
                    </p>
                  </div>
                )}
              </div>
            </article>
          </div>
        </Container>
      </Section>

      <Section tone="base" tight aria-labelledby="doc-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="doc-cta" className="ob-h3 max-w-[24ch]">
                Read the methodology, or run the thing.
              </h2>
              <p className="ob-body max-w-[56ch]">
                Every rule in these guides has a page stating its thresholds and
                its limits. The other way to check it is to add a dependency and
                watch what the detector does.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start observing
              </Link>
              <Link href={DOCS_ROUTES.methodology} className="ob-btn ob-btn-outline">
                Methodology
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}
