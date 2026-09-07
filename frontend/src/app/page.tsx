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
    q: 'How is RELIASTRA different from regular uptime monitoring?',
    a: 'Regular uptime monitors check your own infrastructure from the outside. RELIASTRA monitors your vendors’ APIs from independent locations, correlates vendor degradation with your incidents, and generates evidence reports you can send to vendor support to claim SLA credits.',
  },
  {
    q: 'What counts as an independent verification?',
    a: 'RELIASTRA runs checks from multiple cloud regions on infrastructure separate from yours and the vendor’s. Each check is timestamped and logged with full metadata, giving third-party proof from locations the vendor does not control.',
  },
  {
    q: 'Which vendors can RELIASTRA monitor?',
    a: 'Any HTTP endpoint: Stripe, Auth0, Twilio, Cloudflare, OpenAI, PagerDuty, AWS, and hundreds more. If it has a URL and returns a status code, it can be monitored.',
  },
  {
    q: 'How do SLA evidence reports work?',
    a: 'When a vendor incident is detected, RELIASTRA compiles a timestamped report with independent multi-region verification, exact degradation duration, correlated service impact, and the calculated SLA credit amount.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Monitoring data and evidence reports belong to the account holder and are never shared with vendors or third parties.',
  },
];

export const metadata: Metadata = {
  title: 'RELIASTRA - External Dependency Intelligence',
  description:
    'Know when your dependencies fail. Prove what happened. RELIASTRA monitors third-party APIs independently, attributes incidents to the responsible vendor, and generates timestamped SLA evidence.',
  alternates: { canonical: canonicalUrl('/') },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'RELIASTRA - External Dependency Intelligence',
    description:
      'Monitor third-party APIs independently. When vendors fail, generate timestamped SLA evidence reports to claim credits and prove fault.',
    url: SITE_URL + '/',
    siteName: 'RELIASTRA',
    type: 'website',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'RELIASTRA - External Dependency Intelligence' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RELIASTRA - External Dependency Intelligence',
    description: 'Monitor third-party APIs. Prove vendor failures. Claim SLA credits.',
    images: [`${SITE_URL}/opengraph-image`],
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
            RELIASTRA - External Dependency Intelligence. Know when your
            dependencies fail. Prove what happened.
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
