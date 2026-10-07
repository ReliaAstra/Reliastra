/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Compose-time prop builders.
 *
 * The compiled templates ship fixtures baked in, so they can never be sent.
 * Sending renders the same components here, at compose time, with real values:
 * the operator's form entries plus the provenance-bound record values. Because
 * rendering happens with live data, every conditional branch, state colour,
 * ledger computation and section number derives from the actual send — nothing
 * is frozen from a fixture.
 *
 * Input is the flat `variables` map (snake_case names from the registry).
 * Parsing is strict: a missing required value, a non-numeric number, a bad
 * date or an unknown enum throws FieldError naming the field, which the render
 * route turns into a 422 the form displays inline. A template that cannot name
 * its missing field is a template that will be sent incomplete.
 */

import { Billing, type BillingProps } from './classes/billing';
import {
  CustomerDependencyAlert,
  type CustomerDependencyAlertProps,
} from './classes/customer-dependency-alert';
import {
  DependencyFailure,
  type DependencyFailureProps,
} from './classes/dependency-failure';
import {
  EvidenceDelivery,
  type EvidenceDeliveryProps,
} from './classes/evidence-delivery';
import { InternalOps, type InternalOpsProps } from './classes/internal-ops';
import { Partner, type PartnerProps } from './classes/partner';
import { Security, type SecurityProps } from './classes/security';
import { SupportReply, type SupportReplyProps } from './classes/support-reply';
import { VendorOps, type VendorOpsProps } from './classes/vendor-ops';
import type { AttributionLedger, ObservationWindow, Provenance } from './contracts';
import type { EmailClassId } from './registry';

export type Variables = Record<string, string | undefined>;

export class FieldError extends Error {
  field: string;
  constructor(field: string, reason: string) {
    super(`${field}: ${reason}`);
    this.name = 'FieldError';
    this.field = field;
  }
}

/** Fill `{{name}}` placeholders in the backend's dialect (optional spaces). */
export const fillSubject = (subject: string, vars: Variables): string =>
  subject.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, name: string) =>
    vars[name] !== undefined && vars[name] !== '' ? String(vars[name]) : m,
  );

const str = (v: Variables, name: string): string | undefined => {
  const raw = v[name];
  if (raw === undefined) return undefined;
  const t = String(raw).trim();
  return t === '' ? undefined : t;
};

const reqStr = (v: Variables, name: string): string => {
  const t = str(v, name);
  if (t === undefined) throw new FieldError(name, 'required value is missing');
  return t;
};

const reqNum = (v: Variables, name: string): number => {
  const t = str(v, name);
  if (t === undefined) throw new FieldError(name, 'required value is missing');
  const n = Number(t);
  if (!Number.isFinite(n)) throw new FieldError(name, `not a number: ${t}`);
  return n;
};

const optNum = (v: Variables, name: string): number | undefined => {
  const t = str(v, name);
  if (t === undefined) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new FieldError(name, `not a number: ${t}`);
  return n;
};

/** Accepts ISO input and the backend's display stamp ("2026-03-11 04:12:07 UTC"). */
export const toISO = (value: string, name: string): string => {
  const t = value.trim();
  const display = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/;
  const m = display.exec(t);
  const iso = m ? `${m[1]}T${m[2]}Z` : t;
  if (Number.isNaN(Date.parse(iso))) throw new FieldError(name, `not a date: ${value}`);
  return iso;
};

const reqISO = (v: Variables, name: string): string => {
  const t = str(v, name);
  if (t === undefined) throw new FieldError(name, 'required value is missing');
  return toISO(t, name);
};

const optISO = (v: Variables, name: string): string | undefined => {
  const t = str(v, name);
  if (t === undefined) return undefined;
  return toISO(t, name);
};

const BOOLS: Record<string, boolean> = {
  true: true, '1': true, yes: true, on: true,
  false: false, '0': false, no: false, off: false,
};

const parseBool = (v: Variables, name: string, what: string): boolean | undefined => {
  const t = str(v, name);
  if (t === undefined) return undefined;
  const b = BOOLS[t.toLowerCase()];
  if (b === undefined) throw new FieldError(name, `${what}; use true or false`);
  return b;
};

const reqBool = (v: Variables, name: string, what: string): boolean => {
  const b = parseBool(v, name, what);
  if (b === undefined) throw new FieldError(name, 'required value is missing');
  return b;
};

/** Section toggle. Absent means shown: fixtures and hand-built maps that
    predate toggles render the full document, byte-identical to before. */
const show = (v: Variables, name: string): boolean =>
  parseBool(v, name, 'whether to include this section') ?? true;

const reqEnum = <T extends string>(v: Variables, name: string, allowed: readonly T[]): T => {
  const t = str(v, name);
  if (t === undefined) throw new FieldError(name, 'required value is missing');
  if (!allowed.includes(t as T)) {
    throw new FieldError(name, `must be one of: ${allowed.join(' / ')}`);
  }
  return t as T;
};

/** "label: value" per line; throws with the line number on malformed rows. */
const parseRows = (v: Variables, name: string): { label: string; value: string }[] | undefined => {
  const t = str(v, name);
  if (t === undefined) return undefined;
  return t.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const at = line.indexOf(':');
    if (at < 1) throw new FieldError(name, `line ${i + 1} needs "label: value"`);
    return { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
  });
};

/** Plain non-empty lines. */
const parseLines = (v: Variables, name: string): string[] | undefined => {
  const t = str(v, name);
  if (t === undefined) return undefined;
  return t.split('\n').map((l) => l.trim()).filter(Boolean);
};

/** Deterministic open rule: two consecutive failures open an incident. */
const CONFIRM_THRESHOLD = 2;

const SIGNALS = [
  'temporal',
  'endpoint_overlap',
  'latency_correlation',
  'error_pattern',
  'infrastructure_baseline',
] as const;

type SignalName = (typeof SIGNALS)[number];

const CLASSIFICATIONS = ['vendor_failure', 'multi_cause', 'infrastructure_issue', 'unknown'] as const;

const base = (v: Variables) => ({
  recipientName: str(v, 'recipient_name'),
  organisationName: reqStr(v, 'organisation_name'),
  dashboardUrl: str(v, 'dashboard_url'),
  supportEmail: str(v, 'support_email'),
  address: str(v, 'address'),
  preferencesUrl: str(v, 'preferences_url'),
});

const windowOf = (v: Variables): ObservationWindow => ({
  startedAt: reqISO(v, 'window_start'),
  endedAt: reqISO(v, 'window_end'),
  count: reqNum(v, 'observation_count'),
  intervalSeconds: reqNum(v, 'interval_seconds'),
  confirmThreshold: reqNum(v, 'confirm_threshold'),
  droppedProbes: optNum(v, 'dropped_probes'),
});

const ledgerOf = (v: Variables): AttributionLedger => ({
  signals: SIGNALS.map((name: SignalName) => ({
    name,
    score: reqNum(v, `${name}_score`),
  })),
  score: reqNum(v, 'confidence_score'),
  ceiling: reqNum(v, 'confidence_ceiling'),
  classification: reqEnum(v, 'classification', CLASSIFICATIONS),
});

const provenanceOf = (v: Variables, opts: { signedRequired: boolean }): Provenance => {
  const signed = opts.signedRequired
    ? reqBool(v, 'signed', 'whether an Ed25519 signature is attached')
    : (parseBool(v, 'signed', 'whether an Ed25519 signature is attached') ?? false);
  return {
    methodologyVersion: reqStr(v, 'methodology_version'),
    attributionVersion: str(v, 'attribution_version'),
    documentChecksum: reqStr(v, 'document_checksum'),
    dataHash: str(v, 'data_hash'),
    signed,
    signatureAlg: str(v, 'signature_alg'),
    verificationUrl: reqStr(v, 'verification_url'),
    verificationId: str(v, 'verification_id'),
  };
};

const builders: Record<EmailClassId, (v: Variables) => object> = {
  dependency_failure: (v): DependencyFailureProps => ({
    ...base(v),
    dependencyName: reqStr(v, 'dependency_name'),
    endpoint: reqStr(v, 'endpoint'),
    vendorName: reqStr(v, 'vendor_name'),
    ledger: ledgerOf(v),
    window: windowOf(v),
    provenance: provenanceOf(v, { signedRequired: true }),
    resolvedAt: optISO(v, 'resolved_at'),
    showAttribution: show(v, 'show_attribution'),
    showObservations: show(v, 'show_observations'),
    showArtefact: show(v, 'show_artefact'),
    showSignoff: show(v, 'show_signoff'),
  }),

  customer_dependency_alert: (v): CustomerDependencyAlertProps => ({
    ...base(v),
    dependencyName: reqStr(v, 'dependency_name'),
    endpoint: reqStr(v, 'endpoint'),
    vendorName: reqStr(v, 'vendor_name'),
    ledger: ledgerOf(v),
    window: windowOf(v),
    provenance: provenanceOf(v, { signedRequired: false }),
    remediation: reqStr(v, 'remediation'),
    nextProbeSeconds: optNum(v, 'next_probe_seconds'),
    showMeasurement: show(v, 'show_measurement'),
    showConclusion: show(v, 'show_conclusion'),
    showAction: show(v, 'show_action'),
    showSignoff: show(v, 'show_signoff'),
  }),

  evidence_delivery: (v): EvidenceDeliveryProps => ({
    ...base(v),
    reportId: reqStr(v, 'report_id'),
    incidentId: reqStr(v, 'incident_id'),
    dependencyName: reqStr(v, 'dependency_name'),
    fileName: reqStr(v, 'file_name'),
    fileSizeBytes: reqNum(v, 'file_size_bytes'),
    generatedAt: reqISO(v, 'generated_at'),
    expiresAt: optISO(v, 'expires_at'),
    retentionDays: optNum(v, 'retention_days'),
    provenance: provenanceOf(v, { signedRequired: true }),
    downloadUrl: str(v, 'download_url'),
    note: str(v, 'note'),
    showArtefact: show(v, 'show_artefact'),
    showProvenance: show(v, 'show_provenance'),
    showAction: show(v, 'show_action'),
    showSignoff: show(v, 'show_signoff'),
  }),

  billing: (v): BillingProps => {
    const event = reqEnum(v, 'event', [
      'payment_succeeded', 'payment_failed', 'trial_ending',
      'trial_expired', 'plan_changed', 'refund_processed',
    ] as const);
    const daysRemaining = optNum(v, 'days_remaining');
    return {
      ...base(v),
      event,
      planName: reqStr(v, 'plan_name'),
      amountUsd: reqStr(v, 'amount_usd'),
      amountCharged: str(v, 'amount_charged'),
      paymentCurrency: str(v, 'payment_currency'),
      fxRate: str(v, 'fx_rate'),
      fxSource: str(v, 'fx_source'),
      invoiceId: str(v, 'invoice_id'),
      paidAt: optISO(v, 'paid_at'),
      trialEndsAt: optISO(v, 'trial_ends_at'),
      daysRemaining,
      nextBillingDate: optISO(v, 'next_billing_date'),
      fallbackLimits: parseRows(v, 'fallback_limits'),
      failureReason: str(v, 'failure_reason'),
      paymentMethod: str(v, 'payment_method'),
      receiptUrl: str(v, 'receipt_url'),
      showTransaction: show(v, 'show_transaction'),
      showAction: show(v, 'show_action'),
      showSignoff: show(v, 'show_signoff'),
    };
  },

  support_reply: (v): SupportReplyProps => {
    const awaitingCustomer = parseBool(v, 'awaiting_customer', 'whether the ticket waits on the customer') ?? false;
    const awaitingOn = str(v, 'awaiting_on');
    if (awaitingCustomer && !awaitingOn) {
      throw new FieldError('awaiting_on', 'required whenever awaiting_customer is set: a "what we need" heading with nothing under it trains the reader to skim it');
    }
    const body = [reqStr(v, 'body_1')];
    const second = str(v, 'body_2');
    if (second) body.push(second);
    return {
      ...base(v),
      ticketRef: reqStr(v, 'ticket_ref'),
      agentName: reqStr(v, 'agent_name'),
      agentRole: str(v, 'agent_role'),
      firstResponse: reqBool(v, 'first_response', 'whether this is the first reply on the thread'),
      body,
      ticketUrl: str(v, 'ticket_url'),
      awaitingCustomer,
      awaitingOn,
      slaTargetHours: optNum(v, 'sla_target_hours'),
      showContext: show(v, 'show_context'),
      showAction: show(v, 'show_action'),
      showSignoff: show(v, 'show_signoff'),
    };
  },

  partner: (v): PartnerProps => {
    const event = reqEnum(v, 'event', [
      'invitation', 'terms', 'payout_sent', 'payout_pending',
    ] as const);
    const earnings = parseRows(v, 'earnings');
    return {
      ...base(v),
      event,
      partnerCompany: reqStr(v, 'partner_company'),
      partnerContact: reqStr(v, 'partner_contact'),
      commissionRate: str(v, 'commission_rate'),
      earnings: earnings?.map((r) => ({ label: r.label, value: r.value, mono: true as const })),
      periodStart: optISO(v, 'period_start'),
      periodEnd: optISO(v, 'period_end'),
      payoutAmountUsd: str(v, 'payout_amount_usd'),
      payoutReference: str(v, 'payout_reference'),
      paidVia: str(v, 'paid_via'),
      paidAt: optISO(v, 'paid_at'),
      invitationValidDays: optNum(v, 'invitation_valid_days'),
      benefits: parseLines(v, 'benefits'),
      nextStep: str(v, 'next_step'),
      showTerms: show(v, 'show_terms'),
      showBreakdown: show(v, 'show_breakdown'),
      showBenefits: show(v, 'show_benefits'),
      showAction: show(v, 'show_action'),
      showSignoff: show(v, 'show_signoff'),
    };
  },

  vendor_ops: (v): VendorOpsProps => {
    const enclosures = parseLines(v, 'enclosures');
    return {
      ...base(v),
      vendorCompany: reqStr(v, 'vendor_company'),
      vendorStatusPage: str(v, 'vendor_status_page'),
      observatoryUrl: str(v, 'observatory_url'),
      vendorName: reqStr(v, 'vendor_name'),
      endpoint: reqStr(v, 'endpoint'),
      window: windowOf(v),
      provenance: {
        methodologyVersion: reqStr(v, 'methodology_version'),
        attributionVersion: undefined,
        documentChecksum: 'not issued',
        dataHash: undefined,
        signed: false,
        signatureAlg: undefined,
        verificationUrl: reqStr(v, 'verification_url'),
        verificationId: str(v, 'verification_id'),
      },
      request: reqStr(v, 'request'),
      threadRef: str(v, 'thread_ref'),
      showObservations: show(v, 'show_observations'),
      showEnclosed: show(v, 'show_enclosed'),
      showAction: show(v, 'show_action'),
      showSignoff: show(v, 'show_signoff'),
      attachments: enclosures?.map((line, i) => {
        const m = /^(.*)\s+(?:sha256:)?([0-9a-fA-F]{16,})\s*$/.exec(line);
        if (!m) throw new FieldError('enclosures', `line ${i + 1} needs "filename sha256:<hex>"`);
        return { name: m[1].trim(), sha256: m[2] };
      }),
      assessment: str(v, 'assessment'),
    };
  },

  security: (v): SecurityProps => {
    const event = reqEnum(v, 'event', [
      'new_device_login', 'admin_action', 'secret_rotated',
      'api_key_created', 'suspicious_activity', 'domain_changed',
    ] as const);
    const actorEmail = reqStr(v, 'actor_email');
    if (!actorEmail.includes('@')) throw new FieldError('actor_email', 'not an email address');
    return {
      ...base(v),
      event,
      actorEmail,
      actorLabel: str(v, 'actor_label'),
      occurredAt: reqISO(v, 'occurred_at'),
      ipAddress: reqStr(v, 'ip_address'),
      location: str(v, 'location'),
      userAgent: str(v, 'user_agent'),
      detail: reqStr(v, 'detail'),
      containment: str(v, 'containment'),
      requiresConfirmation: reqBool(v, 'requires_confirmation', 'whether the operator must confirm the action'),
      auditRef: str(v, 'audit_ref'),
      contactFirst: parseBool(v, 'contact_first', 'whether remediation is unsafe by email') ?? false,
      securityEmail: str(v, 'security_email'),
      showEvent: show(v, 'show_event'),
      showAction: show(v, 'show_action'),
      showSignoff: show(v, 'show_signoff'),
    };
  },

  internal_ops: (v): InternalOpsProps => {
    const facts = parseRows(v, 'facts');
    if (!facts || facts.length === 0) {
      throw new FieldError('facts', 'at least one "label: value" fact is required: an alert with no facts is noise');
    }
    return {
      ...base(v),
      alertTitle: reqStr(v, 'alert_title'),
      alertKind: reqStr(v, 'alert_kind'),
      component: reqStr(v, 'component'),
      environment: reqStr(v, 'environment'),
      detectedAt: reqISO(v, 'detected_at'),
      severity: reqEnum(v, 'severity', ['info', 'warning', 'critical'] as const),
      detail: reqStr(v, 'detail'),
      facts: facts.map((r) => ({ label: r.label, value: r.value, mono: true as const })),
      actionsRequired: parseLines(v, 'actions_required') ?? [],
      runbookUrl: str(v, 'runbook_url'),
      suppressed: parseBool(v, 'suppressed', 'whether the alert did not page') ?? false,
      showActions: show(v, 'show_actions'),
      showAction: show(v, 'show_action'),
    };
  },
};

/** Build render-ready props for a class from flat form/bound variables. */
export const buildProps = (classId: EmailClassId, variables: Variables): object => {
  const build = builders[classId];
  if (!build) throw new FieldError('class_id', `unknown message class: ${classId}`);
  return build(variables);
};

/** Validate a value map against a class's required specs; returns missing names. */
export const missingRequired = (required: string[], variables: Variables): string[] =>
  required.filter((name) => {
    const raw = variables[name];
    return raw === undefined || String(raw).trim() === '';
  });
