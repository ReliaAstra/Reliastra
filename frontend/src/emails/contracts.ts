/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Shared contracts
 *
 * Every prop on every class is either required or explicitly optional-with-a-
 * stated-meaning. There is no `string | undefined` that silently renders as an
 * empty cell: a missing observation count is a fact about the deployment, and
 * the design has to be able to say so rather than print a blank.
 */

import type { HealthKey } from './tokens';

export type { HealthKey };

/** The five weighted signals, in the order the methodology declares them. */
export interface AttributionSignal {
  name:
    | 'temporal'
    | 'endpoint_overlap'
    | 'latency_correlation'
    | 'error_pattern'
    | 'infrastructure_baseline';
  /** Normalized 0-1. */
  score: number;
}

/**
 * The provenance block.
 *
 * These are the fields the backend genuinely holds on an evidence artefact
 * (`EvidenceReportDownloadResponse`) plus the attribution result
 * (`AttributionResultResponse`). Nothing here is decorative and nothing is
 * invented at send time - the compile step and the binding service populate
 * these from the API, and a missing value renders as an explicit statement of
 * absence.
 */
export interface Provenance {
  /** `methodology_version` on the artefact, e.g. `v1.0`. */
  methodologyVersion: string;
  /** Attribution engine version, `v1.1`. Distinct from the artefact's. */
  attributionVersion?: string;
  /** SHA-256 over the rendered document. Distinct from the payload hash. */
  documentChecksum: string;
  /** SHA-256 over the canonical incident payload. */
  dataHash?: string;
  /** Ed25519 over the payload. */
  signed: boolean;
  signatureAlg?: string;
  verificationUrl: string;
  verificationId?: string;
}

export interface ObservationWindow {
  startedAt: string;
  endedAt: string;
  /** How many observations the window contains. */
  count: number;
  /** Cadence in seconds. */
  intervalSeconds: number;
  /** Consecutive failures required to open. */
  confirmThreshold: number;
  /** Probes that produced no result at all, and are recorded rather than hidden. */
  droppedProbes?: number;
}

export interface AttributionLedger {
  signals: AttributionSignal[];
  score: number;
  /** Highest score this observation topology could have produced. */
  ceiling: number;
  classification:
    | 'vendor_failure'
    | 'multi_cause'
    | 'infrastructure_issue'
    | 'unknown';
}

/** Shared by every class. */
export interface BaseProps {
  recipientName: string;
  organisationName: string;
  dashboardUrl: string;
  supportEmail: string;
  /** Physical sending address. Required on commercial mail in several markets. */
  address: string;
  preferencesUrl?: string;
}

export const DEFAULTS = {
  dashboardUrl: 'https://reliastra.com/dashboard',
  supportEmail: 'support@reliastra.com',
  address: 'Reliastra · Lagos, Nigeria',
  preferencesUrl: 'https://reliastra.com/dashboard/settings/notifications',
} as const;

/** Maps an incident/observation status onto the four system-state colours. */
export const stateFor = (
  classification: AttributionLedger['classification'] | string,
  status?: string,
): HealthKey => {
  if (classification === 'vendor_failure') return 'down';
  if (classification === 'multi_cause') return 'degraded';
  if (classification === 'infrastructure_issue') return 'degraded';
  if (classification === 'unknown') return 'unknown';
  switch (status) {
    case 'resolved':
    case 'operational':
    case 'up':
      return 'up';
    case 'degraded':
      return 'degraded';
    case 'down':
    case 'failed':
      return 'down';
    default:
      return 'unknown';
  }
};

export const STATE_WORD: Record<HealthKey, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Failed',
  unknown: 'Indeterminate',
};

/** Formats an ISO timestamp the way the rest of the product does: UTC, explicit. */
export const stamp = (iso: string): string =>
  `${iso.replace('T', ' ').replace(/\+.*$/, '').replace(/\.\d+Z?$/, '')} UTC`;
