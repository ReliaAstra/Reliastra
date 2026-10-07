/**
 * 06 · PARTNER & PAYOUT — the commercial relationship.
 *
 * Partner mail has one job the product does not do for us: be unmistakably
 * from a human who can sign a contract. So the design spends its weight on
 * reciprocity — the terms are printed in full, the commission maths is shown
 * line by line rather than as a percentage, and the money is in the same
 * currency on both sides of the message.
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
import { DEFAULTS, stamp, type BaseProps } from '../contracts';

export type PartnerEvent =
  | 'invitation'
  | 'terms'
  | 'payout_sent'
  | 'payout_pending';

export interface PartnerProps extends BaseProps {
  event: PartnerEvent;
  partnerCompany: string;
  partnerContact: string;
  /** Recurring share, printed as a percentage and as money. */
  commissionRate?: string;
  /** Line-item commission breakdown, already computed. */
  earnings?: { label: string; value: string; mono?: boolean }[];
  periodStart?: string;
  periodEnd?: string;
  payoutAmountUsd?: string;
  payoutReference?: string;
  paidVia?: string;
  paidAt?: string;
  /** Days until the invitation lapses. */
  invitationValidDays?: number;
  /** What the partner gets for signing. */
  benefits?: string[];
  nextStep?: string;
  /** Section toggles. All default to shown. */
  showTerms?: boolean;
  showBreakdown?: boolean;
  showBenefits?: boolean;
  showAction?: boolean;
  showSignoff?: boolean;
}

export const Partner: React.FC<PartnerProps> = ({
  recipientName = 'there',
  organisationName,
  event,
  partnerCompany,
  partnerContact,
  commissionRate,
  earnings,
  periodStart,
  periodEnd,
  payoutAmountUsd,
  payoutReference,
  paidVia,
  paidAt,
  invitationValidDays,
  benefits,
  nextStep,
  showTerms,
  showBreakdown,
  showBenefits,
  showAction,
  showSignoff,
  dashboardUrl = DEFAULTS.dashboardUrl,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
}) => {
  const sec = sectionIndexer();
  const headline =
    event === 'invitation'
      ? `${partnerCompany} is invited to partner with RELIASTRA`
      : event === 'terms'
        ? 'Your partner agreement'
        : event === 'payout_sent'
          ? `Payout of ${payoutAmountUsd ?? '—'} sent`
          : 'Payout is pending verification';

  return (
    <Doc
      previewText={`${headline}. ${commissionRate ? `Recurring ${commissionRate}. ` : ''}${partnerCompany} × RELIASTRA partnership.`}
      masthead={<Masthead classification="Partner programme" />}
    >
      <Lede>{headline}</Lede>

      {event === 'invitation' ? (
        <>
          <Paragraph>
            Hello {partnerContact}, I would like to invite{' '}
            <strong>{partnerCompany}</strong> to the RELIASTRA partner
            programme. The short version: your clients have the same problem
            you solve — they cannot prove whether an outage was theirs or a
            vendor's — and RELIASTRA produces the independent record that
            settles it.
          </Paragraph>
          <Paragraph>
            Partners earn recurring revenue by introducing that capability to
            their own customers, under their own brand, without taking on
            operational responsibility.
          </Paragraph>
        </>
      ) : event === 'terms' ? (
        <Paragraph>
          Hello {partnerContact}, the partner agreement for{' '}
          <strong>{partnerCompany}</strong> is set out below. These are the
          actual terms, not a summary — if anything reads ambiguously, say so
          and it will be rewritten before signature.
        </Paragraph>
      ) : event === 'payout_sent' ? (
        <Paragraph>
          Hello {partnerContact}, the commission for {partnerCompany} covering{' '}
          {periodStart && periodEnd
            ? `${stamp(periodStart)} to ${stamp(periodEnd)}`
            : 'the last period'}{' '}
          has been paid. The breakdown is below so you can reconcile it against
          your own records without asking us.
        </Paragraph>
      ) : (
        <Paragraph>
          Hello {partnerContact}, commission for {partnerCompany} is calculated
          and awaiting payout verification. This normally takes a few business
          days and does not require action from you.
        </Paragraph>
      )}

      {(commissionRate || earnings?.length || payoutAmountUsd) && showTerms !== false && (
        <>
          <SectionHeading index={sec.next()} title="Commercial terms" />
          <DataRegister
            caption={event.startsWith('payout') ? 'This period' : 'Recurring'}
            rows={[
              { label: 'Partner', value: partnerCompany },
              { label: 'Contact', value: partnerContact },
              ...(commissionRate
                ? [{ label: 'Commission', value: commissionRate, mono: true }]
                : []),
              ...(periodStart && periodEnd
                ? [
                    {
                      label: 'Period',
                      value: `${stamp(periodStart)} → ${stamp(periodEnd)}`,
                      mono: true,
                    },
                  ]
                : []),
              ...(payoutAmountUsd
                ? [{ label: 'Payout', value: payoutAmountUsd, mono: true }]
                : []),
              ...(payoutReference
                ? [{ label: 'Reference', value: payoutReference, mono: true }]
                : []),
              ...(paidVia ? [{ label: 'Paid via', value: paidVia, mono: true }] : []),
              ...(paidAt ? [{ label: 'Sent', value: stamp(paidAt), mono: true }] : []),
            ]}
          />
        </>
      )}

      {earnings?.length && showBreakdown !== false ? (
        <>
          <SectionHeading index={sec.next()} title="Commission breakdown" />
          <DataRegister caption="Line items" rows={earnings} />
        </>
      ) : null}

      {benefits?.length && showBenefits !== false ? (
        <>
          <SectionHeading index={sec.next()} title="What the programme includes" />
          <DataRegister
            caption="Included"
            rows={benefits.map((benefit, i) => ({ label: `${i + 1}`, value: benefit }))}
          />
        </>
      ) : null}

      {event === 'payout_pending' ? (
        <Advisory state="degraded">
          A payout is held when the partner's payout details are incomplete or
          recently changed. We will tell you exactly which field is missing
          rather than leaving the payment unexplained.
        </Advisory>
      ) : null}

      {nextStep ? (
        <>
          <SectionHeading index={sec.next()} title="Next step" />
          <Paragraph>{nextStep}</Paragraph>
        </>
      ) : null}

      {showAction !== false && (
        <Action href={`${dashboardUrl}/partners`}>
          {event === 'invitation' ? 'Review the programme' : 'Open partner console'}
        </Action>
      )}


      {showSignoff !== false && <Signoff role="Partnerships · Reliastra" />}
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`Partner programme correspondence for ${partnerCompany}. ${organisationName} is the RELIASTRA entity issuing this invitation and administering partner payouts.`}
        replyTo={supportEmail}
        address={address}
        legalNote={`Commission is stated in USD and paid in USD${
          paidVia ? ` via ${paidVia}` : ''
        }. Partner earnings are attributable to the partner's own customers; RELIASTRA does not warrant a customer's dependency will not fail.${
          invitationValidDays
            ? ` This invitation is open for ${invitationValidDays} days.`
            : ''
        }`}
      />    </Doc>
  );
};
