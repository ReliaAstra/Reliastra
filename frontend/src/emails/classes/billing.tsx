/**
 * 04 · BILLING — subscription, payment failure, trial expiry.
 *
 * Money is the class where an unclear email costs the most trust, so the
 * design states three things with no ambiguity: what happened, what it costs,
 * and what happens if nothing is done. The USD/NGN pair is always printed
 * together with the rate and its source, because a charge of ₦11,945.72
 * against a plan priced at $9.00 is otherwise unexplainable to the recipient.
 */

import * as React from 'react';

import {
  Action,
  Advisory,
  DataRegister,
  Doc,
  Footer,
  Hairline,
  Lede,
  Masthead,
  Paragraph,
  SectionHeading,
  sectionIndexer,
  Signoff,
} from '../primitives';
import { DEFAULTS, stamp, type BaseProps, type HealthKey } from '../contracts';

export type BillingEvent =
  | 'payment_succeeded'
  | 'payment_failed'
  | 'trial_ending'
  | 'trial_expired'
  | 'plan_changed'
  | 'refund_processed';

export interface BillingProps extends BaseProps {
  event: BillingEvent;
  planName: string;
  /** Product currency. RELIASTRA prices in USD. */
  amountUsd: string;
  /** What was actually charged, in the payment currency (NGN via Paystack). */
  amountCharged?: string;
  paymentCurrency?: string;
  fxRate?: string;
  fxSource?: string;
  invoiceId?: string;
  paidAt?: string;
  /** On trial_ending / trial_expired. */
  trialEndsAt?: string;
  daysRemaining?: number;
  nextBillingDate?: string;
  /** What the account reverts to if payment is not completed. */
  fallbackLimits?: { label: string; value: string }[];
  failureReason?: string;
  /** Card brand + last four only. RELIASTRA stores no card data. */
  paymentMethod?: string;
  receiptUrl?: string;
}

type HeadlineFn = (p: {
  planName: string;
  daysRemaining?: number;
  amountCharged?: string;
  amountUsd: string;
}) => string;

const COPY: Record<
  BillingEvent,
  { headline: HeadlineFn; classification: string; tone: HealthKey }
> = {
  payment_succeeded: {
    headline: (p) => `${p.planName} is active`,
    classification: 'Payment received',
    tone: 'up',
  },
  payment_failed: {
    headline: () => 'Payment could not be completed',
    classification: 'Action required · payment failed',
    tone: 'down',
  },
  trial_ending: {
    headline: (p) =>
      p.daysRemaining === 1
        ? 'Your trial ends tomorrow'
        : `Your trial ends in ${p.daysRemaining ?? '—'} days`,
    classification: 'Trial ending',
    tone: 'degraded',
  },
  trial_expired: {
    headline: () => 'Your trial has ended',
    classification: 'Trial expired · reduced limits in effect',
    tone: 'degraded',
  },
  plan_changed: {
    headline: () => 'Your plan has changed',
    classification: 'Plan change',
    tone: 'unknown',
  },
  refund_processed: {
    headline: (p) =>
      `Refund of ${p.amountCharged ?? p.amountUsd} processed`,
    classification: 'Refund issued',
    tone: 'unknown',
  },
};

export const Billing: React.FC<BillingProps> = ({
  recipientName = 'there',
  organisationName,
  event,
  planName,
  amountUsd,
  amountCharged,
  paymentCurrency,
  fxRate,
  fxSource,
  invoiceId,
  paidAt,
  trialEndsAt,
  daysRemaining,
  nextBillingDate,
  fallbackLimits,
  failureReason,
  paymentMethod,
  receiptUrl,
  dashboardUrl = DEFAULTS.dashboardUrl,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
  preferencesUrl = DEFAULTS.preferencesUrl,
}) => {
  const sec = sectionIndexer();
  const copy = COPY[event];
  const href = receiptUrl ?? `${dashboardUrl}/billing`;
  const headline = copy.headline({
    planName,
    daysRemaining,
    amountCharged,
    amountUsd,
  });

  const rows = [
    { label: 'Plan', value: planName },
    { label: 'Product currency', value: 'USD', mono: true },
    { label: 'Amount', value: amountUsd, mono: true },
  ];
  if (amountCharged) {
    rows.push({ label: 'Charged', value: amountCharged, mono: true });
  }
  if (paymentCurrency) {
    rows.push({ label: 'Payment currency', value: paymentCurrency, mono: true });
  }
  if (fxRate) {
    rows.push({ label: 'Rate applied', value: fxRate, mono: true });
  }
  if (invoiceId) {
    rows.push({ label: 'Invoice', value: invoiceId, mono: true });
  }
  if (paymentMethod) {
    rows.push({ label: 'Method', value: paymentMethod, mono: true });
  }
  if (paidAt) {
    rows.push({ label: 'Settled', value: stamp(paidAt), mono: true });
  }
  if (nextBillingDate) {
    rows.push({ label: 'Next charge', value: stamp(nextBillingDate), mono: true });
  }

  return (
    <Doc
      previewText={`${copy.classification} · ${planName} · ${amountUsd}${amountCharged ? ` (${amountCharged} charged)` : ''}. ${organisationName}.`}
      masthead={<Masthead classification={copy.classification} />}
    >
      <Lede>{headline}</Lede>

      {event === 'payment_succeeded' ? (
        <Paragraph>
          Hello {recipientName}, your payment for <strong>{planName}</strong>{' '}
          has been received. {organisationName} now has full monitoring
          capability enabled, including evidence retention and API access.
        </Paragraph>
      ) : event === 'payment_failed' ? (
        <>
          <Paragraph>
            Hello {recipientName}, we could not collect payment for{' '}
            <strong>{planName}</strong>. Your service has <strong>not</strong>{' '}
            been cancelled — it has been held.
          </Paragraph>
          {failureReason ? (
            <Advisory state="down">
              <strong>Reason returned by the processor.</strong>{' '}
              {failureReason} No card details were stored by RELIASTRA, so this
              must be corrected with your payment provider.
            </Advisory>
          ) : null}
        </>
      ) : event === 'trial_ending' ? (
        <>
          <Paragraph>
            Hello {recipientName}, your 14-day trial of{' '}
            <strong>{planName}</strong> ends{' '}
            {trialEndsAt ? stamp(trialEndsAt) : 'soon'}. No payment method is
            required to continue on the trial, but a card is required to hold
            the paid limits afterwards.
          </Paragraph>
          <Advisory state="degraded">
            When the trial ends without a card, {organisationName} keeps running
            on reduced limits rather than stopping. Nothing is deleted and no
            evidence already generated is removed.
          </Advisory>
        </>
      ) : event === 'trial_expired' ? (
        <>
          <Paragraph>
            Hello {recipientName}, the trial for <strong>{planName}</strong>{' '}
            has ended. {organisationName} is still running, on reduced limits.
          </Paragraph>
          {fallbackLimits?.length ? (
            <DataRegister caption="Limits now in effect" rows={fallbackLimits} />
          ) : null}
        </>
      ) : event === 'plan_changed' ? (
        <Paragraph>
          Hello {recipientName}, the plan on {organisationName} has been
          changed. The new limits apply immediately; billing is prorated from
          the change date.
        </Paragraph>
      ) : (
        <Paragraph>
          Hello {recipientName}, a refund for {organisationName} has been
          processed. Depending on your bank it will appear within 5–10 business
          days.
        </Paragraph>
      )}

      <SectionHeading index={sec.next()} title="Transaction" />
      <DataRegister caption="Amounts as recorded" rows={rows} />

      {fxRate && fxSource ? (
        <Paragraph muted>
          RELIASTRA prices in USD. Your payment provider processes in{' '}
          {paymentCurrency ?? 'NGN'}; the conversion above uses the reference
          rate from <strong>{fxSource}</strong>, refreshed periodically. The
          rate that appears on your provider's statement may differ by the
          spread they apply.
        </Paragraph>
      ) : null}

      <Action href={href}>
        {event === 'payment_failed'
          ? 'Update payment method'
          : event === 'trial_ending' || event === 'trial_expired'
            ? 'Keep full limits'
            : 'Open billing'}
      </Action>


      <Signoff role="Reliastra Billing" />
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`Transactional billing notice for ${organisationName}. Sent because a charge, plan or trial state changed on this account.`}
        replyTo={supportEmail}
        address={address}
        unsubscribe={{
          label: 'Billing notices are not optional, but everything else is.',
          href: preferencesUrl,
        }}
        legalNote="Cancellation takes effect at the end of the paid period and does not by itself generate a refund. Refund requests are handled at billing@reliastra.com and processed through Paystack. RELIASTRA stores no card data."
      />    </Doc>
  );
};
