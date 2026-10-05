/**
 * RELIASTRA · TRANSACTIONAL EMAIL DESIGN SYSTEM
 * Fixtures
 *
 * Every value below is either drawn from the real domain or is explicitly
 * fabricated for preview. Nothing here is presented as production telemetry.
 *
 * The provenance values are structurally correct (64 hex chars, `ed25519`, a
 * plausible verification id) so the layout is exercised at true width, and the
 * numbers are internally consistent with the methodology: with a single
 * observation point the two corroborating signals are structurally zero, so
 * the score cannot exceed 55.00 and the ledger says so.
 */

import type {
  AttributionLedger,
  ObservationWindow,
  Provenance,
} from './contracts';

const hex = (seed: string, length: number): string => {
  let out = '';
  let h = 2166136261;
  for (let i = 0; out.length < length; i += 1) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0').slice(0, 8);
  }
  return out.slice(0, length);
};

/** A real-shaped artefact for a real-shaped incident. Fabricated values. */
export const FIXTURE_PROVENANCE: Provenance = {
  methodologyVersion: 'v1.0',
  attributionVersion: 'v1.1',
  documentChecksum: hex('document-checksum-auth0-2026-03-11', 64),
  dataHash: hex('payload-auth0-2026-03-11T04:12', 64),
  signed: true,
  signatureAlg: 'Ed25519',
  verificationUrl: 'https://reliastra.com/evidence/verify/9f2c41a7',
  verificationId: 'EV-9F2C41A7',
};

export const FIXTURE_WINDOW: ObservationWindow = {
  startedAt: '2026-03-11T04:12:07Z',
  endedAt: '2026-03-11T04:41:07Z',
  count: 30,
  intervalSeconds: 60,
  confirmThreshold: 2,
  droppedProbes: 0,
};

/**
 * 29.50 = 0.00×0.20 + 0.00×0.25 + 0.31×0.25 + 0.45×0.15 + 1.00×0.15
 * Held below 50 so the classification lands on `unknown` — the honest outcome
 * for a single vantage point, and the case most worth designing well.
 */
export const FIXTURE_LEDGER_UNKNOWN: AttributionLedger = {
  signals: [
    { name: 'temporal', score: 0 },
    { name: 'endpoint_overlap', score: 0 },
    { name: 'latency_correlation', score: 0.31 },
    { name: 'error_pattern', score: 0.45 },
    { name: 'infrastructure_baseline', score: 1 },
  ],
  score: 29.5,
  ceiling: 55,
  classification: 'unknown',
};

/**
 * 55.00 = 0.00×0.20 + 0.00×0.25 + 1.00×0.25 + 1.00×0.15 + 1.00×0.15
 * Sits exactly on the ceiling. This is the case the ceiling disclosure exists
 * for: every observable signal is maxed and the score still cannot reach 75,
 * because `vendor_failure` structurally requires a second source.
 */
export const FIXTURE_LEDGER_CEILING: AttributionLedger = {
  signals: [
    { name: 'temporal', score: 0 },
    { name: 'endpoint_overlap', score: 0 },
    { name: 'latency_correlation', score: 1 },
    { name: 'error_pattern', score: 1 },
    { name: 'infrastructure_baseline', score: 1 },
  ],
  score: 55,
  ceiling: 55,
  classification: 'multi_cause',
};

/** 43.00 = 0.00 + 0.00 + 0.85×0.25 + 0.45×0.15 + 1.00×0.15. */
export const FIXTURE_LEDGER_HIGH: AttributionLedger = {
  signals: [
    { name: 'temporal', score: 0 },
    { name: 'endpoint_overlap', score: 0 },
    { name: 'latency_correlation', score: 0.85 },
    { name: 'error_pattern', score: 0.45 },
    { name: 'infrastructure_baseline', score: 1 },
  ],
  score: 43,
  ceiling: 55,
  classification: 'unknown',
};

export const BASE = {
  recipientName: 'Adaeze',
  organisationName: 'Meridian Fintech',
  dashboardUrl: 'https://reliastra.com/dashboard',
  supportEmail: 'support@reliastra.com',
  address: 'Reliastra · 14B Admiralty Way, Lekki Phase 1, Lagos · Nigeria',
  preferencesUrl: 'https://reliastra.com/dashboard/settings/notifications',
};
