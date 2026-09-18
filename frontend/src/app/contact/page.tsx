import { JsonLd } from '@/components/seo/json-ld';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { breadcrumbJsonLd, buildMetadata, canonicalUrl } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Contact - Talk to RELIASTRA',
  description:
    'Contact RELIASTRA: support, billing and security. A human reads every message - there is no sales team.',
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
            name: 'Contact - Talk to RELIASTRA',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
          },
        ]}
      />
      <MarketingPage
        eyebrow="Company"
        title="Talk to RELIASTRA"
        lede="Support, billing and security. Answered by the person who operates the measurement network."
        breadcrumbs={crumbs}
        related={[
          { label: 'Documentation', href: '/docs', description: 'Answers before you ask.' },
          { label: 'Pricing', href: '/pricing', description: 'One plan, $9 a month.' },
          { label: 'Status', href: '/status', description: 'Check platform health first.' },
          { label: 'About', href: '/about', description: 'Why we exist.' },
        ]}
      >
        <Prose>
          <h2>Support</h2>
          <p>
            <a href="mailto:support@reliastra.com">support@reliastra.com</a> - account,
            monitoring, evidence and billing questions. Include the email on the
            account and, for incident questions, the dependency and window (UTC).
          </p>
          <h2>Billing</h2>
          <p>
            <a href="mailto:billing@reliastra.com?subject=Developer%20plan">billing@reliastra.com</a> -
            subscriptions, invoices, refunds and the Developer plan.
          </p>
          <h2>Creators</h2>
          <p>
            Technical creators and publishers:{' '}
            <a href="/creators">how the creator program works</a> - or just
            email support with a link to your work.
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
