/**
 * 09 · INTERNAL OPERATIONS — the machine talking to the operator.
 *
 * The only class with no external recipient. It is terse by design: this mail
 * is read at 03:00 by someone who wants the facts, not reassurance. No
 * signoff, no CTA, no marketing cadence - just what changed, the evidence
 * class, and the two things that need a human decision.
 */

import * as React from 'react';

import {
  Action,
  ClassificationBanner,
  DataRegister,
  Doc,
  Footer,
  Hairline,
  Lede,
  Masthead,
  Paragraph,
  SectionHeading,
  sectionIndexer,
} from '../primitives';
import { DEFAULTS, stamp, stateFor, STATE_WORD, type BaseProps } from '../contracts';

export interface InternalOpsProps extends BaseProps {
  alertTitle: string;
  /** Machine-readable class of the event: `evidence_failure`, `queue_backlog`, … */
  alertKind: string;
  component: string;
  environment: string;
  detectedAt: string;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  /** Structured key/value facts pulled from the emitting system. */
  facts: { label: string; value: string; mono?: boolean }[];
  /** Named human actions, in priority order. Empty renders nothing. */
  actionsRequired: string[];
  runbookUrl?: string;
  /** Set when the alert is a replay or an operator drill. */
  suppressed?: boolean;
}

export const InternalOps: React.FC<InternalOpsProps> = ({
  alertTitle,
  alertKind,
  component,
  environment,
  detectedAt,
  severity,
  detail,
  facts,
  actionsRequired,
  runbookUrl,
  suppressed,
  supportEmail = DEFAULTS.supportEmail,
  address = DEFAULTS.address,
}) => {
  const sec = sectionIndexer();
  const state = stateFor('', severity === 'critical' ? 'down' : severity === 'warning' ? 'degraded' : 'unknown');
  const word = severity.toUpperCase();

  return (
    <Doc
      previewText={`[${word}] ${component}/${environment} · ${alertKind} · ${detectedAt} · ${actionsRequired.length} action(s) required`}
      masthead={<Masthead classification={`${environment} · ${word}`} />}
    >
      <ClassificationBanner state={state}>
        {word} · {alertKind} · {component}
      </ClassificationBanner>

      <Lede>{alertTitle}</Lede>

      <Paragraph>
        <span
          style={{
            fontFamily: "'SFMono-Regular',Consolas,Menlo,monospace",
            fontSize: '11px',
            letterSpacing: '0.01em',
            color: '#6E7686',
          }}
        >
          {stamp(detectedAt)} · {environment} · {component}
        </span>
      </Paragraph>

      <Paragraph>{detail}</Paragraph>

      {suppressed ? (
        <Paragraph muted>
          <strong>Notification suppressed.</strong> This alert did not page and
          did not open an incident. It is recorded for the audit trail only.
        </Paragraph>
      ) : null}

      <SectionHeading index={sec.next()} title="Emitting facts" />
      <DataRegister
        caption="As reported by the source system"
        rows={facts.map((fact) => ({
          label: fact.label,
          value: fact.value,
          mono: fact.mono,
        }))}
      />

      {actionsRequired.length ? (
        <>
          <SectionHeading index={sec.next()} title="Requires a human" />
          <Paragraph muted>
            {actionsRequired.length === 1
              ? 'One decision is outstanding.'
              : `${actionsRequired.length} decisions are outstanding, in priority order.`}
          </Paragraph>
          <DataRegister
            caption="Action queue"
            rows={actionsRequired.map((action, i) => ({
              label: `A${i + 1}`,
              value: action,
            }))}
          />
        </>
      ) : (
        <SectionHeading index={sec.next()} title="Requires a human" />
      )}

      {runbookUrl ? <Action href={runbookUrl} ghost>Open runbook</Action> : null}

      <Hairline spaceBefore={28} spaceAfter={6} />
      <Footer
        purpose={`Internal operational alert from the Reliastra platform. Not for customer distribution. Do not forward outside the operations group.`}
        methodologyVersion={`${alertKind} · ${environment}`}
        replyTo={supportEmail}
        address={address}
        legalNote="Alerts are emitted from system state at the moment of detection. No model inference is involved in deciding to send this message."
      />
    </Doc>
  );
};
