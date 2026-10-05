/**
 * 02 · EVIDENCE DELIVERY — the signed artefact, released.
 *
 * Sent when a report is generated and someone needs to hold it: a customer, an
 * auditor, a claims handler, a lawyer. The design goal is that the recipient
 * can prove, independently, that the document is what RELIASTRA says it is —
 * and equally, that RELIASTRA cannot quietly change it afterwards.
 */

import * as React from 'react';

import {
  Action,
  Advisory,
  Artefact,
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
import { DEFAULTS, stamp, type BaseProps, type Provenance } from '../contracts';

export interface EvidenceDeliveryProps extends BaseProps {
  reportId: string;
  incidentId: string;
  dependencyName: string;
  fileName: string;
  fileSizeBytes: number;
  generatedAt: string;
  expiresAt?: string;
  /** Retention is a plan limit; stating it prevents a "where did it go" ticket. */
  retentionDays?: number;
  provenance: Provenance;
  downloadUrl?: string;
  note?: string;
}

export const EvidenceDelivery: React.FC<EvidenceDeliveryProps> = ({
  recipientName = 'there',
  organisationName,
  reportId,
  incidentId,
  dependencyName,
  fileName,
  fileSizeBytes,
  generatedAt,
  expiresAt,
  retentionDays,
  provenance,
  downloadUrl,
  note,
  dashboardUrl = DEFAULTS.dashboardUrl,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
}) => {
  const sec = sectionIndexer();
  const kb = Math.max(1, Math.round(fileSizeBytes / 1024));
  const href = downloadUrl ?? provenance.verificationUrl;

  return (
    <Doc
      previewText={`Signed evidence for ${dependencyName}. Verify the SHA-256 and Ed25519 signature independently at ${provenance.verificationId ?? provenance.verificationUrl}.`}
      masthead={<Masthead classification="Evidence artefact" />}
    >
      <Lede>Signed evidence for {dependencyName}</Lede>

      <Paragraph>
        Hello {recipientName}, the evidence document for the{' '}
        <strong>{dependencyName}</strong> incident of{' '}
        <strong>{stamp(generatedAt)}</strong> has been generated and is
        released to you below.
      </Paragraph>

      {note ? <Paragraph muted>{note}</Paragraph> : null}

      <SectionHeading index={sec.next()} title="Artefact" />
      <Artefact
        name={fileName}
        meta={`${kb.toLocaleString('en-US')} KB · PDF · generated ${stamp(generatedAt)}`}
        sha256={provenance.documentChecksum}
      />

      <SectionHeading index={sec.next()} title="Verify it independently" />
      <Paragraph muted>
        Every claim in the document is checkable by a third party who has no
        relationship with RELIASTRA and no account. Two hashes are printed
        below because they cover different things: the document hash covers
        these rendered bytes, the payload hash covers the facts of the incident
        before they were laid out.
      </Paragraph>

      <DataRegister
        caption="Provenance"
        rows={[
          { label: 'Verification', value: provenance.verificationId ?? '—', mono: true },
          { label: 'Methodology', value: provenance.methodologyVersion, mono: true },
          {
            label: 'Attribution engine',
            value: provenance.attributionVersion ?? '—',
            mono: true,
          },
          { label: 'Document SHA-256', value: provenance.documentChecksum, mono: true },
          {
            label: 'Payload SHA-256',
            value: provenance.dataHash ?? 'not issued',
            mono: true,
          },
          {
            label: 'Signature',
            value: provenance.signed
              ? `${provenance.signatureAlg ?? 'Ed25519'} · valid`
              : 'unsigned deployment',
            mono: true,
            tone: provenance.signed ? 'up' : 'unknown',
          },
          { label: 'Report', value: reportId, mono: true },
          { label: 'Incident', value: incidentId, mono: true },
          { label: 'Organisation', value: organisationName },
        ]}
      />

      <Advisory state={provenance.signed ? 'up' : 'unknown'}>
        {provenance.signed ? (
          <>
            The payload is signed with an Ed25519 key held by{' '}
            {organisationName}. Recomputing the payload hash and checking the
            signature against the published key detects any alteration after
            issue — including one made by us.
          </>
        ) : (
          <>
            This deployment does not issue signatures. The hashes above still
            detect alteration <em>after</em> generation, but nothing binds them
            to us: anyone could produce a matching document. Treat the
            signature field as absent, not as valid.
          </>
        )}
      </Advisory>

      <Action href={href}>Open the verification record</Action>


      <Signoff role="Reliastra Evidence" />
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`You receive this because ${organisationName} holds this evidence record. It documents a measurement we took of a third party's endpoint; it is not legal advice and not an admission of fault by any party.`}
        verification={{
          label: 'Public verification record',
          href: provenance.verificationUrl,
          id: provenance.verificationId,
        }}
        methodologyVersion={provenance.methodologyVersion}
        replyTo={supportEmail}
        address={address}
        legalNote={`Generated ${stamp(generatedAt)}.${
          expiresAt
            ? ` Available until ${stamp(expiresAt)}.`
            : retentionDays
              ? ` Retained for ${retentionDays} days on your plan.`
              : ''
        } After expiry the verification record remains; the downloadable document does not. Measurements in this document were taken from a single observation point.`}
      />    </Doc>
  );
};
