import type { Metadata } from 'next';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo';
import { PUBLIC_ROUTES } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Terms of Service - RELIASTRA',
  description: 'The terms governing use of the RELIASTRA dependency monitoring, incident correlation, and evidence platform.',
  alternates: { canonical: '/terms' },
};

const SECTIONS = [
  {
    title: '1. The service',
    body: 'RELIASTRA monitors third-party endpoints you configure ("dependencies"), correlates their failures with your reported incidents, attributes likely causes using a deterministic engine, and generates verifiable evidence reports. The service is provided over a subscription with plan-based limits.',
  },
  {
    title: '2. Accounts & trials',
    body: 'You must provide accurate registration information and are responsible for activity under your account. New organizations receive a free trial with elevated capabilities for fourteen (14) days from account creation. Trial eligibility and expiration are determined solely by RELIASTRA\'s systems; attempting to circumvent trial limits may result in suspension. When a trial ends, the organization reverts to its underlying plan unless a paid subscription is active.',
  },
  {
    title: '3. Acceptable use',
    body: [
      'You may only monitor endpoints you are authorized to test. Do not configure checks against systems you do not own or operate without permission.',
      'Do not use the service to attack, overload, or probe beyond reasonable health-check load any third party; check intervals are capped by plan for this reason.',
      'Do not attempt to access other organizations\' data, share tokens or API keys publicly, or reverse engineer platform controls.',
    ],
  },
  {
    title: '4. Plans, billing & payouts',
    body: 'Paid plans renew monthly until cancelled and are billed through our payment provider. Plan limits (dependency count, team size, retention, check interval) are enforced server-side. Partner referral commissions accrue per the partner program terms shown at enrollment, including hold periods and payout minimums; commission reversals apply on refunds and chargebacks of the underlying subscription payment.',
  },
  {
    title: '5. Evidence reports',
    body: 'Evidence reports reflect measurements recorded by RELIASTRA probes during the stated window and are bound to checksums you can verify through public verification links. They document observed behavior; they do not by themselves constitute legal determinations of fault or contractual SLA credits, which remain governed by your agreements with the relevant vendor.',
  },
  {
    title: '6. Availability & liability',
    body: 'We target high availability but do not warrant uninterrupted service. To the maximum extent permitted by law, RELIASTRA\'s aggregate liability is limited to the amounts you paid in the three months preceding the claim, and we are not liable for indirect or consequential damages.',
  },
  {
    title: '7. Termination & contact',
    body: 'You may cancel at any time; access continues to the end of the paid period. We may suspend accounts that violate these terms. Questions: support@reliastra.com.',
  },
];

/**
 * Terms of service.
 *
 * Clause text is unchanged. Only the container and typography were rebuilt so
 * the page has site navigation, a breadcrumb trail and a readable measure.
 */
export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Terms of Service"
      lede="The terms governing use of the RELIASTRA dependency monitoring, incident correlation and evidence platform."
      breadcrumbs={[
        { name: 'Home', href: '/' },
        { name: 'Terms of Service', href: PUBLIC_ROUTES.terms },
      ]}
      related={[
        {
          label: 'Privacy Policy',
          href: PUBLIC_ROUTES.privacy,
          description: 'What data is collected and how it is handled.',
        },
        {
          label: 'Pricing & billing terms',
          href: PUBLIC_ROUTES.pricing,
          description: 'Trials, renewal, currency and enforcement.',
        },
      ]}
    >
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Terms of Service', path: PUBLIC_ROUTES.terms },
        ])}
      />
      <p className="ob-label">Last updated: August 2026</p>

      <Prose className="mt-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {Array.isArray(s.body) ? (
              <ul>
                {s.body.map((paragraph, i) => (
                  <li key={i}>{paragraph}</li>
                ))}
              </ul>
            ) : (
              <p>{s.body}</p>
            )}
          </section>
        ))}
      </Prose>

      <div className="ob-alert ob-alert-note mt-12">
        <p className="text-[14px] leading-[1.65] text-[var(--ob-text-2)]">
          These terms govern the RELIASTRA product. Partner Network
          participants are additionally bound by the partner program terms
          presented at enrollment.
        </p>
      </div>
    </MarketingPage>
  );
}
