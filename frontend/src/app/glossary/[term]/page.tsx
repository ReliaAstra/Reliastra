import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { GLOSSARY_TERMS, breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export function generateStaticParams() {
  return GLOSSARY_TERMS.map((g) => ({ term: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ term: string }> }) {
  const { term } = await params;
  const g = GLOSSARY_TERMS.find((x) => x.slug === term);
  if (!g) return { title: 'Not found | RELIASTRA' };
  return buildMetadata({
    title: `${g.term} - Definition`,
    description: g.short,
    path: `/glossary/${g.slug}`,
  });
}

export default async function GlossaryTermPage({ params }: { params: Promise<{ term: string }> }) {
  const { term } = await params;
  const g = GLOSSARY_TERMS.find((x) => x.slug === term);
  if (!g) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Glossary', path: '/glossary' },
            { name: g.term, path: `/glossary/${g.slug}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'DefinedTerm',
            '@id': canonicalUrl(`/glossary/${g.slug}`),
            name: g.term,
            description: g.definition,
            url: canonicalUrl(`/glossary/${g.slug}`),
            inDefinedTermSet: canonicalUrl('/glossary'),
          },
        ]}
      />
      <MarketingPage
        eyebrow="Glossary"
        title={g.term}
        lede={g.short}
        breadcrumbs={[
          { name: 'Home', href: '/' },
          { name: 'Glossary', href: '/glossary' },
          { name: g.term, href: `/glossary/${g.slug}` },
        ]}
        related={g.related}
      >
        <Prose>
          <h2>Definition</h2>
          <p>{g.definition}</p>
          <h2>The problem</h2>
          <p>{g.problem}</p>
          <h2>Why it matters</h2>
          <p>{g.whyItMatters}</p>
          <h2>Practical example</h2>
          <p>{g.example}</p>
          <h2>How RELIASTRA approaches it</h2>
          <p>{g.howReliastra}</p>
        </Prose>
      </MarketingPage>
    </>
  );
}
