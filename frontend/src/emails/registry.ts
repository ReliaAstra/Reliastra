/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Registry
 *
 * The catalogue is the contract between three consumers that must never
 * disagree about what a class is:
 *
 *   • the backend send path      (which variables it will substitute)
 *   • the admin Email Center     (what it tells an operator is required)
 *   • the compile step           (what it renders into stored HTML + text)
 *
 * Variables are declared per class and every declared variable is marked
 * required unless a stated reason exists. A class that can send with a blank
 * subject is a class that will.
 */

import type * as React from 'react';

import { Billing, type BillingEvent, type BillingProps } from './classes/billing';
import { CustomerDependencyAlert, type CustomerDependencyAlertProps } from './classes/customer-dependency-alert';
import { DependencyFailure, type DependencyFailureProps } from './classes/dependency-failure';
import { EvidenceDelivery, type EvidenceDeliveryProps } from './classes/evidence-delivery';
import { InternalOps, type InternalOpsProps } from './classes/internal-ops';
import { Partner, type PartnerEvent, type PartnerProps } from './classes/partner';
import { Security, type SecurityEvent, type SecurityProps } from './classes/security';
import { SupportReply, type SupportReplyProps } from './classes/support-reply';
import { VendorOps, type VendorOpsProps } from './classes/vendor-ops';

export type EmailClassId =
  | 'dependency_failure'
  | 'evidence_delivery'
  | 'customer_dependency_alert'
  | 'billing'
  | 'support_reply'
  | 'partner'
  | 'vendor_ops'
  | 'security'
  | 'internal_ops';

export type EmailAudience = 'customer' | 'prospect' | 'vendor' | 'internal';

export interface VariableSpec {
  name: string;
  required: boolean;
  /** Shown in the admin UI. A variable with no description is a mistake. */
  description: string;
  /** Populated from the live API rather than typed by an operator. */
  bound?: string;
  /** Renders as a long machine string in the compose field list. */
  machine?: boolean;
}

export interface EmailClassSpec<P> {
  id: EmailClassId;
  /** Display name in the admin Email Center. */
  name: string;
  description: string;
  audience: EmailAudience;
  component: React.FC<P>;
  /** Subject line, with `{{variable}}` placeholders in the backend's dialect. */
  subject: string;
  /** Inbox preheader intent, stated once here rather than per class. */
  preview: string;
  variables: VariableSpec[];
  /** Local-parts permitted as `From` for this class. */
  permittedSenders: string[];
  /** Compliance footer purpose statement. */
  purpose: string;
  /** True when the class asserts something a third party can check. */
  verifiable: boolean;
}

const BASE_VARS: VariableSpec[] = [
  { name: 'recipient_name', required: true, description: 'Recipient first name, or "there".' },
  { name: 'organisation_name', required: true, description: 'Workspace or company name.' },
  { name: 'support_email', required: false, description: 'Reply-to address for this class.' },
];

// ── Catalogue ──────────────────────────────────────────────────────────────

export const EMAIL_CLASSES: EmailClassSpec<unknown>[] = [
  {
    id: 'dependency_failure',
    name: 'Dependency Failure',
    description:
      'Service notification to the operator whose dependency failed. Carries the attribution ledger, the observation window and the artefact reference.',
    audience: 'customer',
    component: DependencyFailure as React.FC<unknown>,
    subject: '[{{severity}}] {{dependency_name}} is {{state_word}} — {{vendor_name}}',
    preview: 'Independent confirmation that an endpoint failed, and whose fault the evidence points at.',
    variables: [
      { name: 'severity', required: true, description: 'Banner severity word.', bound: 'incident.severity' },
      { name: 'state_word', required: true, description: 'Operational / Degraded / Failed / Indeterminate.', bound: 'attribution.classification' },
      ...BASE_VARS,
      { name: 'dependency_name', required: true, description: 'Dependency label as configured.', bound: 'dependency.name' },
      { name: 'vendor_name', required: true, description: 'Upstream vendor.', bound: 'dependency.vendor' },
      { name: 'endpoint', required: true, description: 'Probed URL.', bound: 'dependency.endpoint', machine: true },
      { name: 'window_start', required: true, description: 'First confirmed failure.', bound: 'incident.started_at', machine: true },
      { name: 'window_end', required: true, description: 'Last observation in window.', bound: 'incident.updated_at', machine: true },
      { name: 'observation_count', required: true, description: 'Observations in window.', bound: 'observations.count' },
      { name: 'interval_seconds', required: true, description: 'Probe cadence.', bound: 'dependency.interval_seconds' },
      { name: 'dropped_probes', required: false, description: 'Probes that returned no result. Recorded, never interpolated.' },
      { name: 'confidence_score', required: true, description: 'Attribution confidence 0-100.', bound: 'attribution.confidence_score', machine: true },
      { name: 'confidence_ceiling', required: true, description: 'Max reachable score for this observation topology.', machine: true },
      { name: 'classification', required: true, description: 'vendor_failure / multi_cause / infrastructure_issue / unknown.', bound: 'attribution.classification' },
      { name: 'methodology_version', required: true, description: 'Artefact methodology version.', bound: 'evidence.methodology_version', machine: true },
      { name: 'attribution_version', required: false, description: 'Attribution engine version.', bound: 'attribution.methodology_version', machine: true },
      { name: 'document_checksum', required: true, description: 'SHA-256 of the rendered document.', bound: 'evidence.checksum', machine: true },
      { name: 'data_hash', required: false, description: 'SHA-256 of the canonical incident payload.', bound: 'evidence.data_hash', machine: true },
      { name: 'signed', required: true, description: 'Whether an Ed25519 signature is attached.', bound: 'evidence.signed' },
      { name: 'verification_url', required: true, description: 'Public verification page.', bound: 'evidence.verification_url', machine: true },
            { name: 'confirm_threshold', required: true, description: 'Consecutive failures required to open. Deterministic rule: 2.' },
      { name: 'temporal_score', required: true, description: 'Temporal signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.temporal' },
      { name: 'endpoint_overlap_score', required: true, description: 'Endpoint-overlap signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.endpoint_overlap' },
      { name: 'latency_correlation_score', required: true, description: 'Latency-correlation signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.latency_correlation' },
      { name: 'error_pattern_score', required: true, description: 'Error-pattern signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.error_pattern' },
      { name: 'infrastructure_baseline_score', required: true, description: 'Infrastructure-baseline signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.infrastructure_baseline' },
{ name: 'verification_id', required: false, description: 'Short verification reference.', bound: 'evidence.verification_id', machine: true },
    ],
    permittedSenders: ['alerts@reliastra.com', 'observatory@reliastra.com'],
    purpose: 'Service notification about a measurement RELIASTRA took.',
    verifiable: true,
  },
  {
    id: 'evidence_delivery',
    name: 'Evidence Delivery',
    description:
      'Releases a signed evidence document to a customer, auditor or counterparty, with everything needed to verify it without an account.',
    audience: 'customer',
    component: EvidenceDelivery as React.FC<unknown>,
    subject: 'Signed evidence — {{dependency_name}} — {{generated_at}}',
    preview: 'A signed, independently verifiable record of one incident.',
    variables: [
      ...BASE_VARS,
      { name: 'dependency_name', required: true, description: 'Dependency the evidence covers.', bound: 'dependency.name' },
      { name: 'report_id', required: true, description: 'Evidence report UUID.', bound: 'evidence.id', machine: true },
      { name: 'incident_id', required: true, description: 'Incident UUID.', bound: 'evidence.incident_id', machine: true },
      { name: 'file_name', required: true, description: 'Artefact filename.', bound: 'evidence.filename', machine: true },
      { name: 'file_size_bytes', required: true, description: 'Artefact size.', bound: 'evidence.file_size_bytes' },
      { name: 'generated_at', required: true, description: 'Render time of the document.', bound: 'evidence.generated_at', machine: true },
      { name: 'expires_at', required: false, description: 'Download expiry, if retention-limited.', bound: 'evidence.expires_at', machine: true },
      { name: 'retention_days', required: false, description: 'Plan retention window in days.' },
      { name: 'document_checksum', required: true, description: 'SHA-256 of the rendered document.', bound: 'evidence.checksum', machine: true },
      { name: 'data_hash', required: false, description: 'SHA-256 of the canonical payload.', bound: 'evidence.data_hash', machine: true },
      { name: 'signature_alg', required: false, description: 'Signature algorithm when signed.', bound: 'evidence.signature_alg', machine: true },
      { name: 'signed', required: true, description: 'Whether an Ed25519 signature is attached.', bound: 'evidence.signed' },
      { name: 'methodology_version', required: true, description: 'Artefact methodology version.', bound: 'evidence.methodology_version', machine: true },
      { name: 'verification_url', required: true, description: 'Public verification page.', bound: 'evidence.verification_url', machine: true },
            { name: 'download_url', required: false, description: 'Direct file link. Falls back to the verification page.', machine: true },
      { name: 'note', required: false, description: 'One-paragraph cover note from the releasing operator.' },
{ name: 'verification_id', required: false, description: 'Short verification reference.', bound: 'evidence.verification_id', machine: true },
    ],
    permittedSenders: ['evidence@reliastra.com', 'security@reliastra.com'],
    purpose: 'Release of an evidence document RELIASTRA generated.',
    verifiable: true,
  },
  {
    id: 'customer_dependency_alert',
    name: 'Customer Dependency Alert',
    description:
      'Alert to a subscriber whose monitored dependency changed state. Leads with remediation, demotes the attribution ledger below the operational facts.',
    audience: 'customer',
    component: CustomerDependencyAlert as React.FC<unknown>,
    subject: '{{dependency_name}} is {{state_word}} — {{observation_count}} consecutive failures',
    preview: 'Your monitored dependency is failing, and here is what to do about it.',
    variables: [
      ...BASE_VARS,
      { name: 'state_word', required: true, description: 'Operational / Degraded / Failed / Indeterminate.', bound: 'attribution.classification' },
      { name: 'dependency_name', required: true, description: 'Dependency label.', bound: 'dependency.name' },
      { name: 'vendor_name', required: true, description: 'Upstream vendor.', bound: 'dependency.vendor' },
      { name: 'endpoint', required: true, description: 'Probed URL.', bound: 'dependency.endpoint', machine: true },
      { name: 'window_start', required: true, description: 'First confirmed failure.', bound: 'incident.started_at', machine: true },
      { name: 'window_end', required: true, description: 'Last observation.', bound: 'incident.updated_at', machine: true },
      { name: 'observation_count', required: true, description: 'Observations in window.', bound: 'observations.count' },
      { name: 'interval_seconds', required: true, description: 'Probe cadence.', bound: 'dependency.interval_seconds' },
      { name: 'confirm_threshold', required: true, description: 'Consecutive failures required to open.' },
      { name: 'next_probe_seconds', required: false, description: 'Seconds until the next scheduled probe.' },
      { name: 'remediation', required: true, description: 'The concrete next step. Never generic — this is the whole point of the class.' },
      { name: 'classification', required: true, description: 'Attribution classification.', bound: 'attribution.classification' },
      { name: 'confidence_score', required: true, description: 'Confidence 0-100.', bound: 'attribution.confidence_score', machine: true },
      { name: 'confidence_ceiling', required: true, description: 'Max reachable score for this topology.', machine: true },
      { name: 'methodology_version', required: true, description: 'Artefact methodology version.', bound: 'evidence.methodology_version', machine: true },
      { name: 'attribution_version', required: false, description: 'Attribution engine version.', bound: 'attribution.methodology_version', machine: true },
      { name: 'verification_url', required: true, description: 'Public verification page.', bound: 'evidence.verification_url', machine: true },
            { name: 'temporal_score', required: true, description: 'Temporal signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.temporal' },
      { name: 'endpoint_overlap_score', required: true, description: 'Endpoint-overlap signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.endpoint_overlap' },
      { name: 'latency_correlation_score', required: true, description: 'Latency-correlation signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.latency_correlation' },
      { name: 'error_pattern_score', required: true, description: 'Error-pattern signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.error_pattern' },
      { name: 'infrastructure_baseline_score', required: true, description: 'Infrastructure-baseline signal, 0-1, four decimals.', bound: 'attribution.signal_breakdown.infrastructure_baseline' },
{ name: 'verification_id', required: false, description: 'Short verification reference.', bound: 'evidence.verification_id', machine: true },
    ],
    permittedSenders: ['alerts@reliastra.com'],
    purpose: 'Alert configured by the recipient for a monitored dependency.',
    verifiable: true,
  },
  {
    id: 'billing',
    name: 'Billing',
    description:
      'Subscription and payment lifecycle. Always prints USD and the charged NGN together with the FX rate and its source.',
    audience: 'customer',
    component: Billing as React.FC<unknown>,
    subject: '{{event_label}} — {{plan_name}} — {{organisation_name}}',
    preview: 'A charge, a failed payment, or a trial state change on your account.',
    variables: [
      ...BASE_VARS,
      { name: 'event', required: true, description: 'payment_succeeded / payment_failed / trial_ending / trial_expired / plan_changed / refund_processed' },
      { name: 'event_label', required: true, description: 'Human label for the event, used in the subject.' },
      { name: 'plan_name', required: true, description: 'Plan display name. RELIASTRA has exactly one paid plan: Developer.', bound: 'subscription.plan' },
      { name: 'amount_usd', required: true, description: 'Product-currency amount.', bound: 'invoice.amount_usd', machine: true },
      { name: 'amount_charged', required: false, description: 'Amount actually charged in the payment currency.', bound: 'invoice.amount_paid', machine: true },
      { name: 'payment_currency', required: false, description: 'NGN for Paystack.', bound: 'invoice.currency', machine: true },
      { name: 'fx_rate', required: false, description: 'USD→payment-currency rate applied.', machine: true },
      { name: 'fx_source', required: false, description: 'Rate provider. Disclosed, never silently applied.' },
      { name: 'invoice_id', required: false, description: 'Invoice reference.', bound: 'invoice.id', machine: true },
      { name: 'payment_method', required: false, description: 'Card brand and last four. RELIASTRA stores no card data.', bound: 'invoice.method' },
      { name: 'paid_at', required: false, description: 'Settlement time.', bound: 'invoice.paid_at', machine: true },
      { name: 'next_billing_date', required: false, description: 'Next charge date.', bound: 'subscription.current_period_end', machine: true },
      { name: 'trial_ends_at', required: false, description: 'Trial expiry.', bound: 'subscription.trial_end', machine: true },
      { name: 'days_remaining', required: false, description: 'Days until trial end.' },
      { name: 'failure_reason', required: false, description: 'Processor-supplied decline reason.' },
      { name: 'fallback_limits', required: false, description: 'Limits now in effect (trial expiry). One per line: "label: value".' },
      { name: 'receipt_url', required: false, description: 'Receipt or billing page.', machine: true },
    ],
    permittedSenders: ['billing@reliastra.com', 'support@reliastra.com'],
    purpose: 'Transactional billing notice for the named account.',
    verifiable: false,
  },
  {
    id: 'support_reply',
    name: 'Support Reply',
    description:
      'Agent-authored reply on a ticket. Machine context is compressed to one strip so the thread stays readable as a conversation.',
    audience: 'customer',
    component: SupportReply as React.FC<unknown>,
    subject: '{{subject_prefix}} {{ticket_ref}}',
    preview: 'A person from Reliastra has answered your ticket.',
    variables: [
      ...BASE_VARS,
      { name: 'ticket_ref', required: true, description: 'Ticket reference.', bound: 'ticket.reference', machine: true },
      { name: 'subject_prefix', required: true, description: 'Re: or Fwd: prefix preserved from the thread.' },
      { name: 'agent_name', required: true, description: 'Agent full name. Never initial-only.', bound: 'admin.name' },
      { name: 'agent_role', required: false, description: 'Agent role.', bound: 'admin.role' },
      { name: 'first_response', required: true, description: 'Whether this is the first reply on the thread.' },
      { name: 'body_1', required: true, description: 'Agent prose. First paragraph.' },
      { name: 'body_2', required: false, description: 'Agent prose. Second paragraph.' },
      { name: 'awaiting_customer', required: false, description: 'Set when the ticket is blocked on the customer.' },
      { name: 'ticket_url', required: false, description: 'Ticket link. Falls back to the support queue.', machine: true },
      { name: 'awaiting_on', required: false, description: 'The single thing needed from the customer. Required whenever awaiting_customer is set.' },
      { name: 'sla_target_hours', required: false, description: 'Target first-response time in hours.' },
    ],
    permittedSenders: ['support@reliastra.com'],
    purpose: 'Support correspondence about the named ticket.',
    verifiable: false,
  },
  {
    id: 'partner',
    name: 'Partner & Payout',
    description:
      'Partner programme invitation, terms and commission payout. Commission is always shown as a line-item breakdown, never only as a percentage.',
    audience: 'prospect',
    component: Partner as React.FC<unknown>,
    subject: '{{event_label}} — {{partner_company}}',
    preview: 'Invitation, agreement terms, or a commission payout.',
    variables: [
      ...BASE_VARS,
      { name: 'event', required: true, description: 'invitation / terms / payout_sent / payout_pending' },
      { name: 'event_label', required: true, description: 'Human label for the event.' },
      { name: 'partner_company', required: true, description: 'Partner legal or trading name.', bound: 'partner.name' },
      { name: 'partner_contact', required: true, description: 'Partner contact first name.', bound: 'partner.contact' },
      { name: 'commission_rate', required: false, description: 'Recurring share, e.g. "30% recurring".', bound: 'partner.commission_rate' },
      { name: 'payout_amount_usd', required: false, description: 'Commission paid, in USD.', bound: 'payout.amount_usd', machine: true },
      { name: 'payout_reference', required: false, description: 'Transfer reference.', bound: 'payout.reference', machine: true },
      { name: 'period_start', required: false, description: 'Commission period start.', machine: true },
      { name: 'period_end', required: false, description: 'Commission period end.', machine: true },
      { name: 'paid_via', required: false, description: 'Payment rail used.' },
      { name: 'paid_at', required: false, description: 'Transfer time.', machine: true },
      { name: 'invitation_valid_days', required: false, description: 'Days the invitation remains open.' },
      { name: 'earnings', required: false, description: 'Commission breakdown. One per line: "label: value".' },
      { name: 'benefits', required: false, description: 'Programme inclusions. One per line.' },
      { name: 'next_step', required: false, description: 'The single next action required of the partner.' },
    ],
    permittedSenders: ['partners@reliastra.com', 'sales@reliastra.com', 'finance@reliastra.com'],
    purpose: 'Partner programme correspondence and commission settlement.',
    verifiable: false,
  },
  {
    id: 'vendor_ops',
    name: 'Vendor Operations',
    description:
      'RELIASTRA to a third-party vendor reporting an independent observation. Leads with the measurement, never asks the vendor to confirm it.',
    audience: 'vendor',
    component: VendorOps as React.FC<unknown>,
    subject: 'Independent observation report — {{vendor_name}} — {{window_start}}',
    preview: 'Our measurement of your endpoint, and one specific question.',
    variables: [
      ...BASE_VARS,
      { name: 'vendor_company', required: true, description: 'Vendor company name.', bound: 'vendor.name' },
      { name: 'vendor_name', required: true, description: 'Service name being observed.', bound: 'vendor.service' },
      { name: 'vendor_status_page', required: false, description: "The vendor's status page, if published.", machine: true },
      { name: 'endpoint', required: true, description: 'Probed URL.', bound: 'dependency.endpoint', machine: true },
      { name: 'window_start', required: true, description: 'First confirmed failure.', bound: 'incident.started_at', machine: true },
      { name: 'window_end', required: true, description: 'Last observation.', bound: 'incident.updated_at', machine: true },
      { name: 'observation_count', required: true, description: 'Observations in window.', bound: 'observations.count' },
      { name: 'interval_seconds', required: true, description: 'Probe cadence.', bound: 'dependency.interval_seconds' },
      { name: 'confirm_threshold', required: true, description: 'Consecutive failures required to open.' },
      { name: 'request', required: true, description: 'The single actionable ask. One sentence.' },
      { name: 'assessment', required: false, description: "RELIASTRA's read of whether this is a real incident." },
      { name: 'thread_ref', required: false, description: 'Prior thread reference, if continuing one.', machine: true },
      { name: 'methodology_version', required: true, description: 'Methodology version.', bound: 'evidence.methodology_version', machine: true },
      { name: 'verification_url', required: true, description: 'Public verification page.', bound: 'evidence.verification_url', machine: true },
            { name: 'enclosures', required: false, description: 'Signed evidence to list. One per line: "filename sha256:<hex>". Listed, not attached.', machine: true },
{ name: 'verification_id', required: false, description: 'Short verification reference.', bound: 'evidence.verification_id', machine: true },
    ],
    permittedSenders: ['observatory@reliastra.com', 'security@reliastra.com'],
    purpose: 'Third-party incident report published in the public record.',
    verifiable: true,
  },
  {
    id: 'security',
    name: 'Security Notice',
    description:
      'Account-holder notice for authentication or privileged-change events. Written so a recipient who is not the legitimate operator can also act.',
    audience: 'customer',
    component: Security as React.FC<unknown>,
    subject: '[Security] {{event_label}} — {{organisation_name}}',
    preview: 'A security event on your account, with the exact facts from the audit log.',
    variables: [
      ...BASE_VARS,
      { name: 'event', required: true, description: 'new_device_login / admin_action / secret_rotated / api_key_created / suspicious_activity / domain_changed' },
      { name: 'event_label', required: true, description: 'Human label for the event.' },
      { name: 'actor_email', required: true, description: 'Account that acted.', bound: 'audit.actor_email', machine: true },
      { name: 'occurred_at', required: true, description: 'Event time, verbatim from the audit log.', bound: 'audit.created_at', machine: true },
      { name: 'ip_address', required: true, description: 'Source IP. Reproduced verbatim; no enrichment.', bound: 'audit.ip_address', machine: true },
      { name: 'location', required: false, description: 'Resolved location. Absent means unresolved, not unknown-but-fine.', bound: 'audit.location' },
      { name: 'user_agent', required: false, description: 'User agent string.', bound: 'audit.user_agent', machine: true },
      { name: 'detail', required: true, description: 'The specific mutation, as one sentence.' },
      { name: 'containment', required: false, description: 'What RELIASTRA did in response.' },
      { name: 'requires_confirmation', required: true, description: 'Whether the operator must confirm the action.' },
      { name: 'actor_label', required: false, description: 'Display name for the actor. Falls back to "An account".' },
      { name: 'contact_first', required: false, description: 'Set when remediation is unsafe by email. Fail-closed: when set, no one-click link is rendered.' },
      { name: 'audit_ref', required: false, description: 'Audit-log id.', bound: 'audit.id', machine: true },
    ],
    permittedSenders: ['security@reliastra.com', 'alerts@reliastra.com'],
    purpose: 'Security notification for a privileged or authentication event.',
    verifiable: false,
  },
  {
    id: 'internal_ops',
    name: 'Internal Operations',
    description:
      'Machine-to-operator operational alert. Terse by design — read at 03:00, facts only, no CTA, no signoff.',
    audience: 'internal',
    component: InternalOps as React.FC<unknown>,
    subject: '[{{severity}}] {{component}} — {{alert_title}}',
    preview: 'Operational alert with the facts as the emitting system reported them.',
    variables: [
      { name: 'severity', required: true, description: 'info / warning / critical.' },
      { name: 'component', required: true, description: 'Emitting component.', machine: true },
      { name: 'environment', required: true, description: 'Deployment environment.', machine: true },
      { name: 'alert_kind', required: true, description: 'Machine-readable event class.', machine: true },
      { name: 'alert_title', required: true, description: 'One-line statement of what changed.' },
      { name: 'detected_at', required: true, description: 'Detection time.', machine: true },
      { name: 'detail', required: true, description: 'Detail paragraph.' },
      { name: 'actions_required', required: false, description: 'Newline-separated ordered action queue.' },
      { name: 'runbook_url', required: false, description: 'Runbook for this alert class.', machine: true },
      { name: 'facts', required: true, description: 'Emitting-system facts. One per line: "label: value".', machine: true },
      { name: 'suppressed', required: false, description: 'Set when the alert did not page and did not open an incident.' },
    ],
    permittedSenders: ['alerts@reliastra.com', 'observatory@reliastra.com'],
    purpose: 'Internal operational alert. Not for customer distribution.',
    verifiable: false,
  },
];

// ── Accessors ──────────────────────────────────────────────────────────────

export const byId = (id: string): EmailClassSpec<unknown> | undefined =>
  EMAIL_CLASSES.find((spec) => spec.id === id);

export const requiredVariables = (spec: EmailClassSpec<unknown>): string[] =>
  spec.variables.filter((v) => v.required).map((v) => v.name);

export const allVariables = (spec: EmailClassSpec<unknown>): string[] =>
  spec.variables.map((v) => v.name);

export type {
  BillingEvent,
  BillingProps,
  CustomerDependencyAlertProps,
  DependencyFailureProps,
  EvidenceDeliveryProps,
  InternalOpsProps,
  PartnerEvent,
  PartnerProps,
  SecurityEvent,
  SecurityProps,
  SupportReplyProps,
  VendorOpsProps,
};
