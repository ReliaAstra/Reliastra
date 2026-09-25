import type { Metadata } from 'next';
import { HomeLanding } from '@/components/site/home/home-landing';
import { HOME_DEFINITIONS } from '@/components/site/home/sections';
import { JsonLd } from '@/components/seo/json-ld';
import {
  SITE_URL,
  canonicalUrl,
  faqJsonLd,
  organizationJsonLd,
  softwareAppJsonLd,
  websiteJsonLd,
  DISCOVERY_ALTERNATES,
} from '@/lib/seo';
import { robotsDirective } from '@/lib/indexability';


export const metadata: Metadata = {
  // Absolute so the root layout's `%s | RELIASTRA` template does not double the
  // brand: the homepage already leads with RELIASTRA.
  title: { absolute: 'RELIASTRA — Independent Evidence for External Dependencies' },
  description:
    'RELIASTRA independently observes the APIs and external services your software depends on, confirms persistent failures, correlates incidents, and produces verifiable evidence records.',
  alternates: { canonical: canonicalUrl('/'), ...DISCOVERY_ALTERNATES },
  robots: robotsDirective({ index: true, follow: true }),
  openGraph: {
    title: 'RELIASTRA — Independent Evidence for External Dependencies',
    description:
      'Independent observation of the third-party APIs your software depends on. Deterministic fault confirmation. Verifiable evidence.',
    url: SITE_URL + '/',
    siteName: 'RELIASTRA',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1584, height: 396, alt: 'RELIASTRA — independent evidence for the external dependencies your software depends on' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RELIASTRA — Independent Evidence for External Dependencies',
    description: 'Observe third-party APIs. Confirm faults. Keep verifiable evidence.',
    images: [`${SITE_URL}/opengraph-image.png`],
  },
};

/**
 * Homepage - server-rendered for crawlers, interactive after hydration.
 *
 * The landing (
 * brand, H1, proposition, links) is fully server-rendered as the initial
 * HTML - no crawler ever receives an empty shell. A `<noscript>` duplicate
 * is deliberately omitted: the SSR landing already carries the content
 * without JavaScript, and a second copy would split the page across two H1s.
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
            name: 'RELIASTRA — Independent Evidence for External Dependencies',
            description:
              'Observe the external services software depends on, record every probe, and keep verifiable evidence.',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            about: { '@id': `${SITE_URL}/#organization` },
            inLanguage: 'en',
          },
          // Built from the definitions the page actually renders, so the
          // structured data cannot describe a different product than the copy.
          faqJsonLd(HOME_DEFINITIONS),
        ]}
      />
      {/* No-JS / minimal-crawler fallback: the SSR landing above already
          carries H1 + copy + links without JavaScript, so this lists only
          the canonical destinations as plain links (no second H1). */}
      <noscript>
        <div>
          <p>
            RELIASTRA observes the external services your software depends on:
            independent probes, deterministic fault confirmation, and verifiable
            evidence records.
          </p>
          <ul>
            <li><a href="/product">Product</a></li>
            <li><a href="/product/evidence">Evidence records</a></li>
            <li><a href="/observatory">Public observatory</a></li>
            <li><a href="/docs/quickstart">Quickstart</a></li>
            <li><a href="/docs/methodology">Methodology</a></li>
            <li><a href="/research">Research</a></li>
            <li><a href="/pricing">Pricing</a></li>
            <li><a href="/about">About</a></li>
          </ul>
        </div>
      </noscript>
      <HomeLanding />
    </>
  );
}
