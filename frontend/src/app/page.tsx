import type { Metadata } from 'next';
import { HomeClient } from '@/components/home/home-client';
import { HomeLanding } from '@/components/site/home/home-landing';
import { JsonLd } from '@/components/seo/json-ld';
import {
  SITE_URL,
  canonicalUrl,
  faqJsonLd,
  organizationJsonLd,
  softwareAppJsonLd,
  websiteJsonLd,
} from '@/lib/seo';

const HOME_FAQS = [
  {
    q: 'How is RELIASTRA different from uptime monitoring?',
    a: 'Uptime monitors check your own infrastructure. RELIASTRA monitors the third-party APIs you depend on from its own infrastructure, correlates their degradation with your incidents, and generates evidence reports you can send to a vendor.',
  },
  {
    q: 'What counts as an independent observation?',
    a: 'A check issued from RELIASTRA infrastructure, separate from yours and the vendor’s, recorded with its timestamp, region, status code and latency.',
  },
  {
    q: 'Which vendors can RELIASTRA monitor?',
    a: 'Any HTTP endpoint that returns a status code.',
  },
  {
    q: 'What is in an evidence report?',
    a: 'The incident window, the dependency, the regions that observed it, the retained observations, the attribution result and a SHA-256 checksum of the report.',
  },
  {
    q: 'Who can see my monitoring data?',
    a: 'Your organization. Monitoring data and evidence reports are never shared with the vendors being measured.',
  },
];

export const metadata: Metadata = {
  title: 'RELIASTRA - External Dependency Intelligence',
  description:
    'Independent monitoring of the third-party APIs you depend on. Incidents attributed to the responsible dependency. Timestamped, checksummed evidence.',
  alternates: { canonical: canonicalUrl('/') },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'RELIASTRA - External Dependency Intelligence',
    description:
      'Independent monitoring of third-party APIs. Incident attribution. Timestamped, checksummed evidence.',
    url: SITE_URL + '/',
    siteName: 'RELIASTRA',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630, alt: 'RELIASTRA - External Dependency Intelligence' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RELIASTRA - External Dependency Intelligence',
    description: 'Monitor third-party APIs. Attribute incidents. Export evidence.',
    images: [`${SITE_URL}/opengraph-image.png`],
  },
};

/**
 * Homepage - server-rendered for crawlers, interactive after hydration.
 *
 * The interactive partner/console shell lives in `HomeClient`, which
 * server-renders the full landing (brand, H1, proposition, links) as the
 * initial HTML - no crawler ever receives an empty shell that depends on
 * client-side auth resolution. A `<noscript>` duplicate is deliberately
 * omitted: the SSR landing already carries the content without JavaScript,
 * and a second copy would split the page across two H1s.
 */
export default function Home() {
  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          softwareAppJsonLd(),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl('/'),
            url: canonicalUrl('/'),
            name: 'RELIASTRA - External Dependency Intelligence',
            description:
              'Monitor third-party APIs independently, attribute incidents, and generate SLA evidence.',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            about: { '@id': `${SITE_URL}/#organization` },
            inLanguage: 'en',
          },
          faqJsonLd(HOME_FAQS),
        ]}
      />
      {/* No-JS / minimal-crawler fallback: the SSR landing above already
          carries H1 + copy + links without JavaScript, so this lists only
          the canonical destinations as plain links (no second H1). */}
      <noscript>
        <div>
          <p>
            RELIASTRA - External Dependency Intelligence. Independent
            monitoring of third-party APIs, incident attribution and evidence.
          </p>
          <ul>
            <li><a href="/product">Product</a></li>
            <li><a href="/external-dependency-intelligence">External Dependency Intelligence</a></li>
            <li><a href="/dependency-monitoring">Dependency monitoring</a></li>
            <li><a href="/sla-evidence">SLA evidence</a></li>
            <li><a href="/incident-evidence">Incident evidence</a></li>
            <li><a href="/track">Track vendors</a></li>
            <li><a href="/pricing">Pricing</a></li>
            <li><a href="/docs">Documentation</a></li>
            <li><a href="/research">Research</a></li>
          </ul>
        </div>
      </noscript>
      <HomeClient landing={<HomeLanding />} />
    </>
  );
}
