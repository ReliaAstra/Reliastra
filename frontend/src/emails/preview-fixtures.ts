/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Preview fixtures
 *
 * One realistic render per class, used by the compile step and by the preview
 * harness so the two can never drift. Values are fabricated for layout
 * demonstration and internally consistent with the methodology arithmetic;
 * none of them is production telemetry.
 */

import {
  BASE,
  FIXTURE_LEDGER_CEILING,
  FIXTURE_LEDGER_HIGH,
  FIXTURE_LEDGER_UNKNOWN,
  FIXTURE_PROVENANCE,
  FIXTURE_WINDOW,
} from './fixtures';
import type { EmailClassId } from './registry';

export const PREVIEW: Record<EmailClassId, unknown> = {
  dependency_failure: {
    ...BASE,
    dependencyName: 'Auth0 /api/v2/token',
    endpoint: 'https://meridian.auth0.com/oauth/token',
    vendorName: 'Auth0',
    ledger: FIXTURE_LEDGER_UNKNOWN,
    window: FIXTURE_WINDOW,
    provenance: FIXTURE_PROVENANCE,
  },

  evidence_delivery: {
    ...BASE,
    reportId: 'b41f9c02-7ae4-4d19-9c3f-2f8a6e15d7b0',
    incidentId: '5d2e8a71-4c93-4f60-b2a7-91e0c34d8f52',
    dependencyName: 'Auth0 /api/v2/token',
    fileName: 'RS-EV-9F2C41A7-auth0-token-2026-03-11.pdf',
    fileSizeBytes: 486_219,
    generatedAt: '2026-03-11T04:44:19Z',
    retentionDays: 90,
    provenance: FIXTURE_PROVENANCE,
    downloadUrl: 'https://reliastra.com/evidence/9f2c41a7/download',
    note: 'Released at your request. The observation series in this document covers the window named on page one and nothing outside it.',
  },

  customer_dependency_alert: {
    ...BASE,
    dependencyName: 'Cloudflare DNS',
    endpoint: 'https://api.cloudflare.com/client/v4/zones',
    vendorName: 'Cloudflare',
    ledger: FIXTURE_LEDGER_HIGH,
    window: { ...FIXTURE_WINDOW, count: 18, startedAt: '2026-03-11T06:02:44Z', endedAt: '2026-03-11T06:20:44Z' },
    provenance: FIXTURE_PROVENANCE,
    nextProbeSeconds: 42,
    remediation:
      'Your three replicas resolve correctly and reach Cloudflare directly, so this is not a DNS configuration error on your side. Check whether any request path is pinned to a single Cloudflare colo — intermittent 530s during a Cloudflare edge event usually come from one colo, not the anycast address. No change is required if your error budget can absorb the current rate.',
  },

  billing: {
    ...BASE,
    recipientName: 'Adaeze',
    organisationName: 'Meridian Fintech',
    event: 'payment_succeeded',
    planName: 'Developer',
    amountUsd: '$9.00 USD',
    amountCharged: '₦11,945.72 NGN',
    paymentCurrency: 'NGN',
    fxRate: '1 USD = 1327.30 NGN',
    fxSource: 'open.er-api.com (ExchangeRate-API)',
    invoiceId: 'INV-2026-03-00418',
    paymentMethod: 'Visa ···· 4242',
    paidAt: '2026-03-11T09:22:05Z',
    nextBillingDate: '2026-04-11T09:22:05Z',
    receiptUrl: 'https://reliastra.com/dashboard/billing/invoices/INV-2026-03-00418',
  },

  support_reply: {
    ...BASE,
    recipientName: 'Adaeze',
    ticketRef: 'TKT-4821',
    agentName: 'Emmanuel Adeshina',
    agentRole: 'Founder',
    firstResponse: true,
    slaTargetHours: 8,
    ticketUrl: 'https://reliastra.com/dashboard/support/TKT-4821',
    awaitingCustomer: true,
    awaitingOn:
      'The HTTP status code returned for the 04:12 UTC window. A 503 means Auth0 answered you; a timeout with no response means the request never landed. Reply with the code and I will tell you which conclusion the evidence supports.',
    context: [
      { label: 'Plan', value: 'Developer' },
      { label: 'Dependencies', value: '4 of 25 used' },
      { label: 'Alert rule', value: 'vendor_failure → alerts@', mono: true },
      { label: 'Checks today', value: '9,840', mono: true },
      { label: 'Retention', value: '90 days' },
    ],
    body: [
      'You are right that your alert fired at 04:12 UTC and that our public observatory page shows Auth0 as operational for the same window. Those are not in conflict, and the difference is the whole point of the product.',
      'Our observatory page reports what a single public observation point saw. Your alert fired from your own workspace against your own endpoint, from your network, on a different path. Both can be true. What I would do is treat the two as independent signals rather than treating either as a correction of the other.',
      'One detail would let me tell you whether the 04:12 window is attributable to Auth0 or to your own egress path: the HTTP status code you received. A 503 means Auth0 answered you; a timeout with no response means the request never landed. Those lead to different conclusions and our ledger scores them differently.',
    ],
  },

  partner: {
    ...BASE,
    recipientName: 'Tunde',
    organisationName: 'Northwind Systems',
    event: 'payout_sent',
    partnerCompany: 'Northwind Systems',
    partnerContact: 'Tunde',
    commissionRate: '30% recurring',
    payoutAmountUsd: '$214.50 USD',
    payoutReference: 'PNW-2026-03-0007',
    paidVia: 'Paystack transfer',
    paidAt: '2026-03-01T14:02:00Z',
    periodStart: '2026-02-01T00:00:00Z',
    periodEnd: '2026-02-28T23:59:59Z',
    earnings: [
      { label: 'Subscriptions introduced', value: '4', mono: true },
      { label: 'Parties activated', value: '4', mono: true },
      { label: 'Gross subscription value', value: '$715.00', mono: true },
      { label: 'Refund adjustments', value: '$0.00', mono: true },
      { label: 'Commission rate', value: '30%', mono: true },
      { label: 'Commission payable', value: '$214.50', mono: true },
    ],
    nextStep:
      'Nothing is required from you. The next statement is issued on 1 April and covers March activations.',
  },

  vendor_ops: {
    ...BASE,
    recipientName: 'Auth0 Support',
    organisationName: 'Reliastra',
    vendorCompany: 'Okta (Auth0)',
    vendorName: 'Auth0',
    vendorStatusPage: 'https://status.auth0.com',
    observatoryUrl: 'https://reliastra.com/observatory/auth0',
    endpoint: 'https://meridian.auth0.com/oauth/token',
    window: FIXTURE_WINDOW,
    ledger: FIXTURE_LEDGER_UNKNOWN,
    provenance: FIXTURE_PROVENANCE,
    request:
      'Was an incident open for the Auth0 custom-domain token endpoint in that window? If not, we think one should be opened, and we are happy to supply the signed observation series as supporting evidence.',
    assessment:
      'All 30 probes in the window returned HTTP 502 with no upstream response body. A 502 means the request reached an Auth0 edge and was refused there, which places the failure upstream of our observer. We found no drop in request volume that would suggest a rate limit, and the same endpoint succeeded from a second location we operate for a different customer.',
  },

  security: {
    ...BASE,
    recipientName: 'Adaeze',
    organisationName: 'Meridian Fintech',
    event: 'new_device_login',
    actorEmail: 'adaeze@meridianfintech.com',
    occurredAt: '2026-03-11T22:41:08Z',
    ipAddress: '102.89.34.17',
    location: 'not resolved',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/134.0',
    detail:
      'A successful sign-in from a browser that has never been used on this workspace, with no prior session in the preceding 30 days from this network.',
    auditRef: 'aud_7c1e93b4028f',
    requiresConfirmation: true,
  },

  internal_ops: {
    ...BASE,
    alertTitle: 'Evidence signing queue stalled',
    alertKind: 'evidence_generation_failure',
    component: 'evidence.tasks',
    environment: 'production',
    detectedAt: '2026-03-11T05:58:31Z',
    severity: 'critical',
    suppressed: false,
    detail:
      'The Ed25519 signing worker has been returning 503 from the signing key provider for 11 minutes. 14 incident reports are queued with no signing attempt. Unsigned artefacts are being generated and served, which is worse than not generating them at all.',
    facts: [
      { label: 'Queued reports', value: '14', mono: true },
      { label: 'Oldest queued', value: '11 min', mono: true },
      { label: 'Key provider', value: 'sodium sealed-box', mono: true },
      { label: 'Last success', value: '05:47:12Z', mono: true },
      { label: 'Failure code', value: 'provider_unavailable', mono: true },
      { label: 'Retry policy', value: 'exponential, max 8', mono: true },
      { label: 'Retention at risk', value: 'none — 90d window', mono: true },
    ],
    actionsRequired: [
      'Halt serving unsigned artefacts — an unsigned report claims a signed field it does not have.',
      'Check whether reports 41–54 already sent without a signature and notify affected organisations.',
      'Rotate the signing key only after the queue drains; rotating first invalidates every queued payload hash.',
    ],
    runbookUrl: 'https://reliastra.com/docs/runbooks/evidence-signing-stall',
  },
};
