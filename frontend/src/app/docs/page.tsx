import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  ArrowLink,
  Container,
  Eyebrow,
  Section,
} from '@/components/site/primitives';
import { DocsSideNav } from '@/components/docs/docs-side-nav';
import { DOCS } from '@/lib/docs/corpus';
import { AUTH_ROUTES, DOCS_ROUTES, PUBLIC_ROUTES } from '@/lib/routes';
import { SITE_URL, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Documentation',
  description:
    'RELIASTRA documentation: quickstart, configuration, monitoring, incidents, evidence, verification, the REST API, the CLI, webhooks and the measurement methodology.',
  path: PUBLIC_ROUTES.docs,
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Docs', href: PUBLIC_ROUTES.docs },
];

/**
 * The documentation index.
 *
 * Grouped by what the reader is doing - start, operate, integrate, reference -
 * rather than by feature name, because a reader arrives with a task. Each entry
 * carries the guide's own one-line summary, so the index is the corpus rather
 * than a re-description of it.
 */
export default function DocsIndexPage() {
  const groups = ['Start', 'Operate', 'Integrate', 'Reference'] as const;

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, path: c.href }))),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(PUBLIC_ROUTES.docs),
            url: canonicalUrl(PUBLIC_ROUTES.docs),
            name: 'RELIASTRA Documentation',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            inLanguage: 'en',
          },
        ]}
      />

      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-14 md:py-20">
          <Eyebrow>Documentation</Eyebrow>
          <h1 className="ob-h1 mt-5 max-w-[20ch]">Everything, stated once.</h1>
          <p className="ob-lede mt-6">
            How RELIASTRA observes a dependency, what it does with the
            observations, and how to call all of it from your own systems. Every
            number in these guides is read from the running code, not restated
            from memory.
          </p>
          <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3">
            <ArrowLink href={DOCS_ROUTES.quickstart}>Start with the quickstart</ArrowLink>
            <ArrowLink href={DOCS_ROUTES.methodology}>Read the methodology</ArrowLink>
          </div>
        </Container>
      </header>

      <Section tone="void" divider={false} tight>
        <Container>
          <div className="grid gap-12 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-16">
            <DocsSideNav activeHref={PUBLIC_ROUTES.docs} />

            <div className="min-w-0">
              {groups.map((group) => {
                const docs = DOCS.filter((doc) => doc.group === group);
                if (!docs.length) return null;
                return (
                  <section key={group} aria-labelledby={`group-${group}`} className="mb-14 last:mb-0">
                    <h2 id={`group-${group}`} className="ob-label mb-1">
                      {group}
                    </h2>
                    <ul>
                      {docs.map((doc) => (
                        <li key={doc.slug}>
                          <Link
                            href={DOCS_ROUTES[doc.slug as keyof typeof DOCS_ROUTES]}
                            className="group flex flex-col gap-2 border-t border-[var(--ob-line)] py-6 transition-colors hover:border-[var(--ob-line-3)]"
                          >
                            <span className="text-[16px] font-semibold tracking-[-0.012em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                              {doc.title}
                            </span>
                            <span className="max-w-[68ch] text-[13.5px] leading-[1.65] text-[var(--ob-text-3)]">
                              {doc.summary}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="base" tight aria-labelledby="docs-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="docs-cta" className="ob-h3 max-w-[26ch]">
                An account is the shortest path to a real observation.
              </h2>
              <p className="ob-body max-w-[58ch]">
                Add one dependency you already own, and read what the probe
                records before deciding whether the rest is useful.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start observing
              </Link>
              <Link href={DOCS_ROUTES.cli} className="ob-btn ob-btn-outline">
                Use the CLI
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}
