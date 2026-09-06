import Link from 'next/link';
import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { GLOSSARY_TERMS } from '@/lib/seo';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Glossary - Dependency intelligence concepts',
  description:
    'Precise definitions: External Dependency Intelligence, incident attribution, SLA evidence, vendor reliability, dependency telemetry, infrastructure evidence.',
  path: '/glossary',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Glossary', href: '/glossary' },
];

export default function GlossaryPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Glossary', path: '/glossary' },
        ])}
      />
      <MarketingPage
        eyebrow="Concepts"
        title="Glossary"
        lede="The category’s vocabulary, defined once and used consistently: every term states its problem, why it matters, an example, and RELIASTRA’s approach."
        breadcrumbs={crumbs}
        related={[
          { label: 'External Dependency Intelligence', href: '/external-dependency-intelligence', description: 'The pillar page for the category.' },
          { label: 'Documentation', href: '/docs', description: 'From definitions to operations.' },
          { label: 'Research', href: '/research', description: 'Methodology behind the terms.' },
        ]}
      >
        <Prose>
          <p>
            Each entry follows one structure - definition, problem, why it matters,
            practical example, how RELIASTRA approaches it, related concepts - so
            humans and machines meet the same meaning everywhere.
          </p>
        </Prose>
        <nav aria-label="Glossary terms" className="mt-6 grid gap-3 sm:grid-cols-2">
          {GLOSSARY_TERMS.map((g) => (
            <Link
              key={g.slug}
              href={`/glossary/${g.slug}`}
              className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:border-cyan-600 dark:border-white/10 dark:hover:border-cyan-400"
            >
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{g.term}</span>
              <span className="mt-1 block text-xs leading-relaxed text-zinc-500">{g.short}</span>
            </Link>
          ))}
        </nav>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'DefinedTermSet',
              '@id': canonicalUrl('/glossary'),
              url: canonicalUrl('/glossary'),
              name: 'RELIASTRA glossary - dependency intelligence concepts',
              hasDefinedTerm: GLOSSARY_TERMS.map((g) => ({
                '@type': 'DefinedTerm',
                name: g.term,
                description: g.definition,
                url: canonicalUrl(`/glossary/${g.slug}`),
              })),
            }),
          }}
        />
      </MarketingPage>
    </>
  );
}
