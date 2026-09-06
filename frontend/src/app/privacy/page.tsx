import type { Metadata } from 'next';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo';
import { PUBLIC_ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Privacy Policy - RELIASTRA',
  description: 'How RELIASTRA collects, uses, and protects customer data across its monitoring, evidence, and billing systems.',
  alternates: { canonical: '/privacy' },
};

const SECTIONS = [
  {
    title: 'What we collect',
    body: [
      'Account data you provide at registration: name, work email, organization name, and authentication credentials (hashed) or federated identity tokens from Google or GitHub.',
      'Monitoring data: the endpoint URLs, HTTP methods, headers and expected responses of the dependencies you configure us to check, plus the results of those checks (timing, status codes, regional origin).',
      'Operational metadata: incident records, correlation results, generated evidence reports, audit-log entries for security-relevant actions, and billing state.',
      'First-party acquisition attribution: the campaign parameters that brought you to our site (UTM source/medium/campaign and landing path). We use first-party storage only - no third-party advertising cookies.',
    ],
  },
  {
    title: 'How we use it',
    body: [
      'To run the service: scheduling checks, detecting incidents, correlating vendor failures with your alerts, generating evidence reports, and delivering notifications through the channels you configure.',
      'To secure accounts: authentication, session management, rate limiting, payout-destination change verification, and abuse prevention.',
      'To bill accurately: subscription state, usage against plan limits, and payment processing through our payment provider (Paystack). Card details are handled by the provider; RELIASTRA never stores full card numbers.',
      'We do not sell personal data, and we do not share monitoring data with other customers. Public Track pages only ever show aggregated posture for vendors that have been made public - never customer endpoints or credentials.',
    ],
  },
  {
    title: 'Evidence & public data',
    body: [
      'Evidence reports belong to the organization that generated them. They are exposed publicly only through explicit share links or verification references created by that organization.',
      'The public verification endpoint confirms a report exists and binds its checksum - it does not disclose endpoints, headers, or account details.',
    ],
  },
  {
    title: 'Retention',
    body: [
      'Check history is retained according to your plan (24 hours on Free up to 90 days on Pro, with custom retention on Enterprise) and is pruned automatically by scheduled jobs.',
      'Billing records are retained as long as required for tax and accounting compliance.',
    ],
  },
  {
    title: 'Your choices & contact',
    body: [
      'You may update your organization data in Settings, export or delete dependencies at any time, and request account deletion by contacting support@reliastra.com.',
    ],
  },
];

/**
 * Privacy policy.
 *
 * The policy text is unchanged - it is a legal document, not copy to be
 * rewritten for tone. What changed is that it now renders inside the standard
 * site shell (it previously had no header, no footer and no route back except
 * one small link), and the body uses the shared `.ob-prose` reading scale so
 * it is legible on a phone.
 */
export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Privacy Policy"
      lede="How RELIASTRA collects, uses and protects customer data across its monitoring, evidence and billing systems."
      breadcrumbs={[
        { name: 'Home', href: '/' },
        { name: 'Privacy Policy', href: PUBLIC_ROUTES.privacy },
      ]}
      related={[
        {
          label: 'Terms of Service',
          href: PUBLIC_ROUTES.terms,
          description: 'The agreement governing use of the platform.',
        },
        {
          label: 'Security',
          href: PUBLIC_ROUTES.security,
          description: 'How the platform is operated and protected.',
        },
      ]}
    >
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Privacy Policy', path: PUBLIC_ROUTES.privacy },
        ])}
      />
      <p className="ob-label">Last updated: August 2026</p>

      <Prose className="mt-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            <ul>
              {s.body.map((paragraph, i) => (
                <li key={i}>{paragraph}</li>
              ))}
            </ul>
          </section>
        ))}
      </Prose>

      <div className="ob-alert ob-alert-note mt-12">
        <p className="text-[14px] leading-[1.65] text-[var(--ob-text-2)]">
          Questions about this policy? Contact{' '}
          <a href="mailto:support@reliastra.com" className="ob-link">
            support@reliastra.com
          </a>
          . If you arrived from the Partner Network, note that partners are
          additionally covered by the partner-specific terms presented during
          program enrollment.
        </p>
      </div>
    </MarketingPage>
  );
}
