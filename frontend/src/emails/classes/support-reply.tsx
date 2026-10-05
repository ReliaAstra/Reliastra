/**
 * 05 · SUPPORT REPLY — a human answering a ticket.
 *
 * The class that must not look like a template. Everything machine-generated
 * above the signature is reduced to one compact context strip, and the body is
 * the agent's own words. Any automatic system mail in a support thread trains
 * the customer to ignore the thread.
 */

import * as React from 'react';

import {
  Action,
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

export interface SupportReplyProps extends BaseProps {
  ticketRef: string;
  agentName: string;
  agentRole?: string;
  /** First response on the thread, or a follow-up. */
  firstResponse: boolean;
  /** Pre-rendered agent prose. May contain simple paragraphs. */
  body: string[];
  /** The technical facts the agent is answering about. */
  context?: { label: string; value: string; mono?: boolean }[];
  ticketUrl?: string;
  /** Set when the ticket is waiting on the customer. */
  awaitingCustomer?: boolean;
  /**
   * The single thing being asked of the customer. Required whenever
   * ``awaitingCustomer`` is set: a "what we need from you" heading with nothing
   * under it is worse than no heading, because it teaches the reader to skim
   * the section that usually matters.
   */
  awaitingOn?: string;
  slaTargetHours?: number;
}

export const SupportReply: React.FC<SupportReplyProps> = ({
  recipientName = 'there',
  organisationName,
  ticketRef,
  agentName,
  agentRole = 'Support',
  firstResponse,
  body,
  context,
  ticketUrl,
  awaitingCustomer,
  awaitingOn,
  slaTargetHours,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
}) => {
  const sec = sectionIndexer();
  const href = ticketUrl ?? `${DEFAULTS.dashboardUrl}/support`;
  // Only render the ask section when there is an ask to render.
  const showAsk = Boolean(awaitingCustomer && (awaitingOn || '').trim());

  return (
    <Doc
      previewText={`${firstResponse ? 'We received your request' : 'Following up on'} · ${ticketRef}${awaitingCustomer ? ' · action needed from you' : ''}`}
      masthead={<Masthead classification={`Support · ${ticketRef}`} />}
    >
      <Lede>
        {firstResponse
          ? 'We received your request'
          : `Following up on ${ticketRef}`}
      </Lede>

      <Paragraph>
        Hello {recipientName}, {agentName} from Reliastra{agentRole && agentRole !== 'Support' ? ` (${agentRole})` : ''} here.
        {firstResponse
          ? ` Your ticket is logged as ${ticketRef} and we are on it.`
          : ''}
        {awaitingCustomer ? ' We are waiting on one detail from you — see below.' : ''}
      </Paragraph>

      <SectionHeading index={sec.next()} title="Our answer" />
      {body.map((paragraph, i) => (
        <Paragraph key={i}>{paragraph}</Paragraph>
      ))}

      {context?.length ? (
        <>
          <SectionHeading index={sec.next()} title="What we are looking at" />
          <DataRegister caption="From your account" rows={context} />
        </>
      ) : null}

      {showAsk ? (
        <>
          <SectionHeading
            title="What we need from you"
          />
          <Paragraph>{awaitingOn}</Paragraph>
        </>
      ) : null}

      <Action href={href} ghost>
        {showAsk ? 'Reply in the ticket' : 'View this ticket'}
      </Action>

      <Signoff
        name={agentName}
        role={`${agentRole}, Reliastra${
          slaTargetHours ? ` · target first response ${slaTargetHours}h` : ''
        }`}
      />

      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`Support correspondence about ticket ${ticketRef} for ${organisationName}. Replies to this address reach the agent who owns the ticket.`}
        replyTo={supportEmail}
        address={address}
        legalNote={slaTargetHours ? `Target first response: ${slaTargetHours} hours.` : undefined}
      />
    </Doc>
  );
};
