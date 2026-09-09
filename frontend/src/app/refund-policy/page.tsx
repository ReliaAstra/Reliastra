import type { Metadata } from 'next';
import { MarketingPage, Prose } from '@/components/marketing/marketing-page';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbJsonLd } from '@/lib/seo';
import { PUBLIC_ROUTES } from '@/lib/routes';
import { BILLING_EMAIL, COMMERCIAL_COPY, TRIAL_DAYS } from '@/lib/billing/commercial-terms';

export const metadata: Metadata = {
  title: 'Refund Policy - RELIASTRA',
  description:
    'How RELIASTRA handles cancellation, collected payments, and refund requests. There is no advertised money-back window.',
  alternates: { canonical: PUBLIC_ROUTES.refundPolicy },
};

const SECTIONS = [
  { title: 'Eligibility', body: COMMERCIAL_COPY.refundSummary },
  { title: 'Refund period', body: COMMERCIAL_COPY.refundPeriod },
  { title: 'How to request a refund', body: COMMERCIAL_COPY.refundHowTo },
  { title: 'Where refunds are sent', body: COMMERCIAL_COPY.refundDestination },
  {
    title: 'Processing',
    body: 'Issued refunds are processed by Paystack to the original payment method. The corresponding billing history row is marked refunded. Partner commissions on a refunded payment are reversed.',
  },
  { title: 'Cancellation versus refund', body: COMMERCIAL_COPY.cancellationVersusRefund },
  {
    title: 'Promotional and discounted subscriptions',
    body: 'If a discounted or promotional payment is refunded, the refund is of the amount actually collected. Partner commissions on that payment are reversed.',
  },
  { title: 'Trial', body: COMMERCIAL_COPY.trialSummary },
  { title: 'After the trial', body: COMMERCIAL_COPY.trialEndSummary },
  { title: 'Price after trial', body: COMMERCIAL_COPY.priceAfterTrial },
  { title: 'What happens after cancellation', body: COMMERCIAL_COPY.cancellationAfterEffect },
];

export default function RefundPolicyPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Refund Policy"
      lede="Cancellation is defined. A fixed money-back window is not. This page restates how collected payments are handled."
      breadcrumbs={[
        { name: 'Home', href: '/' },
        { name: 'Refund Policy', href: PUBLIC_ROUTES.refundPolicy },
      ]}
      related={[
        {
          label: 'Terms of Service',
          href: PUBLIC_ROUTES.terms,
          description: 'Cancellation takes effect at the end of the paid period.',
        },
        {
          label: 'Pricing',
          href: PUBLIC_ROUTES.pricing,
          description: 'List price, trial, and billing interval.',
        },
      ]}
    >
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Refund Policy', path: PUBLIC_ROUTES.refundPolicy },
        ])}
      />
      <p className="ob-label">Last updated: September 2026</p>

      <Prose className="mt-8">
        <p>
          RELIASTRA Pro is billed through Paystack. The {TRIAL_DAYS}-day evaluation
          does not require a payment method. This policy does not invent a refund
          window that the Terms of Service do not define.
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
          </section>
        ))}
        <section>
          <h2>Contact</h2>
          <p>
            Billing questions:{' '}
            <a href={`mailto:${BILLING_EMAIL}`}>{BILLING_EMAIL}</a>.
          </p>
        </section>
      </Prose>
    </MarketingPage>
  );
}
