import { JsonLd } from '@/components/seo/json-ld';
import { AgenciesPage } from '@/components/agencies/agencies-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'For agencies & MSPs',
  description:
    'RELIASTRA helps agencies, MSPs and infrastructure consultants prove what happened when a client infrastructure fails: client environments, incident attribution, and evidence-backed client reports.',
  path: '/agencies',
});

export default function AgenciesPageRoute() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'For agencies & MSPs', path: '/agencies' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/agencies'),
            url: canonicalUrl('/agencies'),
            name: 'For agencies & MSPs - RELIASTRA',
            description:
              'RELIASTRA helps agencies, MSPs and infrastructure consultants prove what happened when client infrastructure fails.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <AgenciesPage />
    </>
  );
}
