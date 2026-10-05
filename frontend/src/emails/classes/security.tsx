/**
 * 08 · SECURITY NOTICE — to an account holder about their own account.
 *
 * Written so that a recipient who is NOT the legitimate operator can also act
 * on it. That drives three decisions: the event is stated before the
 * remediation, every actionable link is printed as full text (a phishing
 * detector can read them and a compromised mailbox cannot hide them), and the
 * "this wasn't you" instruction sits directly under the event line rather than
 * in the footer where nobody reads it.
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
import { DEFAULTS, stamp, stateFor, STATE_WORD, type BaseProps } from '../contracts';

export type SecurityEvent =
  | 'new_device_login'
  | 'admin_action'
  | 'secret_rotated'
  | 'api_key_created'
  | 'suspicious_activity'
  | 'domain_changed';

export interface SecurityProps extends BaseProps {
  event: SecurityEvent;
  actorEmail: string;
  actorLabel?: string;
  occurredAt: string;
  /** IP, region, ASN — exactly what the audit log holds. No enrichment. */
  ipAddress: string;
  location?: string;
  userAgent?: string;
  /** The specific mutation, as a sentence. */
  detail: string;
  /** What RELIASTRA did in response, if anything. */
  containment?: string;
  /** True when the operator is expected to confirm this action. */
  requiresConfirmation: boolean;
  /** Audit-log id, so support can cite it precisely. */
  auditRef?: string;
  /** Escape hatch if the action is unsafe to take from the email. */
  contactFirst?: boolean;
  /**
   * Address that receives replies to a security notice. Separate from
   * ``supportEmail`` on purpose: a compromised account's reply path is exactly
   * what an attacker controls, so security correspondence must not share a
   * mailbox with general support.
   */
  securityEmail?: string;
}

const TITLES: Record<SecurityEvent, { headline: string; classification: string }> = {
  new_device_login: {
    headline: 'New sign-in to your workspace',
    classification: 'Security · authentication',
  },
  admin_action: {
    headline: 'Administrative action on your workspace',
    classification: 'Security · privileged change',
  },
  secret_rotated: {
    headline: 'A stored secret was rotated',
    classification: 'Security · credential change',
  },
  api_key_created: {
    headline: 'A new API key was issued',
    classification: 'Security · credential change',
  },
  suspicious_activity: {
    headline: 'Activity we have flagged on your workspace',
    classification: 'Security · review required',
  },
  domain_changed: {
    headline: 'Your sending domain record changed',
    classification: 'Security · configuration change',
  },
};

export const Security: React.FC<SecurityProps> = ({
  recipientName = 'there',
  organisationName,
  event,
  actorEmail,
  actorLabel,
  occurredAt,
  ipAddress,
  location,
  userAgent,
  detail,
  containment,
  requiresConfirmation,
  auditRef,
  contactFirst,
  dashboardUrl = DEFAULTS.dashboardUrl,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
  securityEmail = 'security@reliastra.com',
}) => {
  const sec = sectionIndexer();
  const title = TITLES[event];
  const state =
    event === 'suspicious_activity'
      ? 'down'
      : requiresConfirmation
        ? 'degraded'
        : 'unknown';
  const word = STATE_WORD[state];

  return (
    <Doc
      previewText={`${title.headline} · ${actorEmail} from ${ipAddress}${location ? ` (${location})` : ''} at ${stamp(occurredAt)}.${
        requiresConfirmation ? ' Confirmation required.' : ''
      }`}
      masthead={<Masthead classification={title.classification} />}
    >
      <Lede>{title.headline}</Lede>

      <Paragraph>
        {actorLabel ?? 'An account'} at{' '}
        <strong style={{ wordBreak: 'break-all' }}>{actorEmail}</strong>{' '}
        {event === 'new_device_login' ? 'signed in' : 'performed an action'}{' '}
        from <strong style={{ wordBreak: 'break-all' }}>{ipAddress}</strong>
        {location ? ` (${location})` : ''} at {stamp(occurredAt)}.
      </Paragraph>

      <Advisory state={state}>
        <strong>
          {requiresConfirmation
            ? 'If this was not you, revoke access now.'
            : 'If this was not you, tell us now.'}
        </strong>{' '}
        Revoking a session takes effect immediately and does not delete your
        evidence history or affect scheduled probes. If you did not perform
        this action, treat the account as compromised: change the workspace
        password and rotate every stored secret before continuing.
      </Advisory>

      <SectionHeading index={sec.next()} title="Event" />
      <DataRegister
        caption="From the audit log"
        rows={[
          { label: 'Event', value: title.classification.replace('Security · ', '') },
          { label: 'Actor', value: actorEmail, mono: true },
          { label: 'Occurred', value: stamp(occurredAt), mono: true },
          { label: 'Source IP', value: ipAddress, mono: true },
          { label: 'Location', value: location ?? 'not resolved', mono: true },
          { label: 'User agent', value: userAgent ?? 'not recorded', mono: true },
          { label: 'Organisation', value: organisationName },
          ...(auditRef ? [{ label: 'Audit ref', value: auditRef, mono: true }] : []),
        ]}
      />

      <SectionHeading index={sec.next()} title="What happened" />
      <Paragraph>{detail}</Paragraph>

      {containment ? (
        <>
          <SectionHeading index={sec.next()} title="What we did" />
          <Paragraph>{containment}</Paragraph>
        </>
      ) : null}

      {contactFirst ? (
        <Paragraph muted>
          We have deliberately not put a one-click remediation link in this
          message. Reply to {securityEmail} from the address on the workspace
          and we will confirm the event before you change anything.
        </Paragraph>
      ) : (
        <Action href={`${dashboardUrl}/settings/security`}>
          Review account security
        </Action>
      )}


      <Signoff role="Reliastra Security" />
      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`Security notice for ${organisationName}. Sent to workspace administrators because a privileged or authentication event was recorded on this account.`}
        replyTo={securityEmail}
        address={address}
        legalNote="Fields above are reproduced verbatim from the audit log. RELIASTRA does not perform IP geolocation enrichment; where no location is shown, none was resolved. We will never ask you for a password, an API key or a seed phrase by email."
      />    </Doc>
  );
};
