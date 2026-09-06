import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Contact — Talk to RELIASTRA',
  description:
    'Contact RELIASTRA: support, sales and security. Support at support@reliastra.com, Enterprise sales at sales@reliastra.com.',
  path: '/contact',
});

const crumbs = [
  { name: 'Home', href: '/' },
  { name: 'Contact', href: '/contact' },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Contact', path: '/contact' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'ContactPage',
            '@id': canonicalUrl('/contact'),
            url: canonicalUrl('/contact'),
            name: 'Contact — Talk to RELIASTRA',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Company"
        title="Talk to RELIASTRA"
        lede="Support, sales and security — real inboxes, answered by the team that operates the measurement network."
        breadcrumbs={crumbs}
        related={[
          { label: 'Documentation', href: '/docs', description: 'Answers before you ask.' },
          { label: 'Pricing', href: '/pricing', description: 'Enterprise scoping starts here.' },
          { label: 'Status', href: '/status', description: 'Check platform health first.' },
          { label: 'About', href: '/about', description: 'Why we exist.' },
        ]}
      >
        <Prose>
          <h2>Support</h2>
          <p>
            <a href="mailto:support@reliastra.com">support@reliastra.com</a> — account,
            monitoring, evidence and billing questions. Include your organization name
            and, for incident questions, the dependency and window (UTC).
          </p>
          <h2>Sales (Enterprise)</h2>
          <p>
            <a href="mailto:sales@reliastra.com?subject=Enterprise%20plan">sales@reliastra.com</a> —
            custom scale, client isolation, white-label reporting and custom retention.
          </p>
          <h2>Billing</h2>
          <p>
            <a href="mailto:billing@reliastra.com?subject=Pro%20plan%20pricing">billing@reliastra.com</a> —
            subscriptions, invoices and Pro plan pricing.
          </p>
          <h2>Before writing in</h2>
          <p>
            The <a href="/docs">docs</a> cover setup, monitoring, evidence and the API;
            <a href="/status"> status</a> reports platform health; the{' '}
            <a href="/research/how-reliastra-measures-vendor-reliability">methodology</a> answers
            most measurement questions.
          </p>
        </Prose>
      </MarketingPage>
    </>
  );
}
