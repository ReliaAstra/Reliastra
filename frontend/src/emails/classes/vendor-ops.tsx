/**
 * 07 · VENDOR OPERATIONS — RELIASTRA writing to a third party.
 *
 * Written to a stranger, usually a support agent who will read it once and
 * route it. Two rules shape it: lead with what we measured and when, because
 * that is the only thing they cannot get from their own logs; and never ask
 * them to confirm our finding as though their confirmation were the evidence.
 * The evidence is ours. We are handing it to them.
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
import { DEFAULTS, stamp, stateFor, STATE_WORD, type AttributionLedger, type BaseProps, type ObservationWindow, type Provenance } from '../contracts';

export interface VendorOpsProps extends BaseProps {
  vendorCompany: string;
  vendorStatusPage?: string;
  /** The public RELIASTRA page for the vendor, if one exists. */
  observatoryUrl?: string;
  vendorName: string;
  endpoint: string;
  window: ObservationWindow;
  ledger?: AttributionLedger;
  provenance: Provenance;
  /** The specific ask. One sentence, actionable. */
  request: string;
  /** Which of several open threads this continues, if any. */
  threadRef?: string;
  attachments?: { name: string; sha256: string }[];
  /** Our read of whether this is a real incident or expected behaviour. */
  assessment?: string;
  /** Section toggles. All default to shown. */
  showObservations?: boolean;
  showEnclosed?: boolean;
  showAction?: boolean;
  showSignoff?: boolean;
}

export const VendorOps: React.FC<VendorOpsProps> = ({
  recipientName = 'Support team',
  organisationName,
  vendorCompany,
  vendorStatusPage,
  observatoryUrl,
  vendorName,
  endpoint,
  window,
  ledger,
  provenance,
  request,
  threadRef,
  attachments,
  assessment,
  showObservations,
  showEnclosed,
  showAction,
  showSignoff,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
}) => {
  const sec = sectionIndexer();
  const state = ledger ? stateFor(ledger.classification) : 'unknown';
  const word = STATE_WORD[state];

  return (
    <Doc
      previewText={`Independent observation of ${vendorName}: ${window.count} consecutive failures from ${stamp(window.startedAt)}. Evidence available on request.`}
      masthead={<Masthead classification="Third-party observation report" />}
    >
      <Lede>
        Independent measurement of {vendorName}: {window.count} consecutive
        failures
      </Lede>

      <Paragraph>
        {recipientName}, we operate a public observatory that probes{' '}
        <strong>{vendorName}</strong> on a fixed interval from a single
        location. Between <strong>{stamp(window.startedAt)}</strong> and{' '}
        <strong>{stamp(window.endedAt)}</strong> we received{' '}
        <strong>{window.count} consecutive failures</strong> against the
        endpoint below.
      </Paragraph>

      <Paragraph>
        We are raising this because we can only see our own vantage point. We
        cannot see your infrastructure, and we have not assumed anything about
        the cause.
      </Paragraph>

      {showObservations !== false && (
        <>
          <SectionHeading index={sec.next()} title="What we observed" />
          <DataRegister
        caption={`${vendorName} · public observatory`}
        rows={[
          { label: 'Service', value: vendorName },
          { label: 'Endpoint', value: endpoint, mono: true },
          {
            label: 'Window',
            value: `${stamp(window.startedAt)} → ${stamp(window.endedAt)}`,
            mono: true,
          },
          {
            label: 'Observations',
            value: `${window.count} @ ${window.intervalSeconds}s`,
          },
          {
            label: 'Confirmed by',
            value: `${window.confirmThreshold} consecutive failures`,
          },
          {
            label: 'Dropped probes',
            value:
              window.droppedProbes === undefined
                ? 'none'
                : `${window.droppedProbes} recorded`,
            mono: true,
          },
          {
            label: 'Your status page',
            value: vendorStatusPage ?? 'not published',
            mono: true,
          },
          ...(ledger
            ? [
                {
                  label: 'Our classification',
                  value: ledger.classification.replace(/_/g, ' '),
                  tone: state,
                },
                {
                  label: 'Confidence',
                  value: `${ledger.score.toFixed(2)} / 100`,
                  mono: true,
                },
              ]
            : []),
        ]}
      />
        </>
      )}

      {assessment ? (
        <>
          <SectionHeading index={sec.next()} title="Our assessment" />
          <Paragraph>{assessment}</Paragraph>
        </>
      ) : null}

      <SectionHeading index={sec.next()} title="What we are asking" />
      <Paragraph>{request}</Paragraph>

      <Advisory state="unknown">
        <strong>What this is not.</strong> We are not asking{' '}
        {vendorCompany} to confirm our measurement — it is ours, and we have
        published it either way. We are asking whether{' '}
        {vendorCompany} was aware of an incident in this window, and if not,
        whether one should be opened.
      </Advisory>

      {attachments?.length && showEnclosed !== false ? (
        <>
          <SectionHeading index={sec.next()} title="Enclosed" />
          <DataRegister
            caption="Signed evidence"
            rows={attachments.map((a) => ({
              label: a.name,
              value: `sha256:${a.sha256.slice(0, 32)}…`,
              mono: true,
            }))}
          />
        </>
      ) : null}

      {showAction !== false && (
        <Action href={observatoryUrl ?? provenance.verificationUrl} ghost>
          {observatoryUrl ? `View our published record for ${vendorName}` : 'View the evidence record'}
        </Action>
      )}


      {showSignoff !== false && <Signoff role="Reliastra Observatory" />}
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`Third-party incident report sent by ${organisationName} to ${vendorCompany}. Our measurement record for ${vendorName} is published and may be cited.`}
        verification={{
          label: 'Our observation record for this window',
          href: provenance.verificationUrl,
          id: provenance.verificationId,
        }}
        methodologyVersion={provenance.methodologyVersion}
        replyTo={supportEmail}
        address={address}
        legalNote={`${window.count} observations from one location. A single vantage point cannot distinguish a vendor outage from an observer-side network fault, and we do not claim it can.${
          threadRef ? ` Regarding your earlier reference ${threadRef}.` : ''
        }`}
      />    </Doc>
  );
};
