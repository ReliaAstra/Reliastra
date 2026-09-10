import type { EvidenceStatus } from './types';

/**
 * One description of "what is the evidence situation for this incident".
 *
 * Every console surface that mentions evidence renders through this, so the
 * list, the incident record and the agency portfolio cannot disagree about
 * what a state means. The rules are deliberately derived from the API payload
 * rather than inferred from the presence of a report id: `failed` with a
 * linked artifact from an earlier attempt is a real possibility, and the state
 * field is the authority.
 */
export interface EvidenceStateView {
  /** Normalised state, including `unknown` for payloads that predate it. */
  key: EvidenceStatus | 'unknown';
  /** Short label for a table cell. */
  label: string;
  /** Colour intent, mapped to the existing design tokens by the caller. */
  tone: 'ok' | 'busy' | 'warn' | 'muted';
  /** Longer explanation, used as a tooltip or an inline note. */
  hint: string;
  /** What the console should offer, if anything. */
  action: 'open' | 'retry' | 'upgrade' | 'none';
}

interface EvidenceFields {
  evidence_report_id?: string | null;
  evidence_status?: string | null;
  evidence_error?: string | null;
}

const NOT_ENTITLED_HINT =
  'SLA evidence reports are not included in this plan. Upgrade to generate them.';

export function evidenceState(incident: EvidenceFields): EvidenceStateView {
  const hasReport = Boolean(incident.evidence_report_id);

  switch (incident.evidence_status) {
    case 'available':
      return {
        key: 'available',
        label: 'Available',
        tone: 'ok',
        hint: 'A report was generated from this incident window and is stored.',
        action: hasReport ? 'open' : 'retry',
      };
    case 'generating':
      return {
        key: 'generating',
        label: 'Generating',
        tone: 'busy',
        hint: 'Generation was requested when the incident resolved and is in progress.',
        action: 'none',
      };
    case 'failed':
      return {
        key: 'failed',
        label: 'Failed',
        tone: 'warn',
        hint:
          incident.evidence_error?.trim() ||
          'Generation failed. The incident record is unaffected; generation can be retried.',
        action: 'retry',
      };
    case 'not_entitled':
      return {
        key: 'not_entitled',
        label: 'Not on plan',
        tone: 'muted',
        hint: incident.evidence_error?.trim() || NOT_ENTITLED_HINT,
        action: 'upgrade',
      };
    case 'pending':
      return {
        key: 'pending',
        label: 'Queued',
        tone: 'muted',
        hint: 'Generation has not started. It is requested when the incident resolves.',
        action: hasReport ? 'open' : 'none',
      };
    default:
      break;
  }

  // Payloads from before the state field existed: fall back to what can
  // actually be proven, which is whether an artifact is linked.
  if (hasReport) {
    return {
      key: 'available',
      label: 'Available',
      tone: 'ok',
      hint: 'A report is linked to this incident.',
      action: 'open',
    };
  }
  return {
    key: 'unknown',
    label: 'Not generated',
    tone: 'muted',
    hint: 'No evidence has been generated for this incident yet.',
    action: 'none',
  };
}

/** Ordering weight so "available" sorts first in the incidents table. */
export function evidenceRank(incident: EvidenceFields): number {
  const view = evidenceState(incident);
  return { available: 0, generating: 1, pending: 2, failed: 3, unknown: 4 }[
    view.key === 'not_entitled' ? 'unknown' : view.key
  ];
}
