/**
 * The real RELIASTRA product contract, transcribed from the backend.
 *
 * Every product visual on the public site reads its vocabulary from here
 * rather than from an author's memory. That matters because the specific
 * failure this replaces is a homepage evidence panel that rendered
 * `attribution: external_dependency` - a classification the backend cannot
 * emit under any input. The four values below are the only ones
 * `AttributionEngine.compute_attribution()` can return.
 *
 * Backend sources of truth (verify before editing):
 *   - backend/app/modules/attribution/service.py     WEIGHTS, thresholds,
 *                                                    METHODOLOGY_VERSION
 *   - backend/app/modules/checks/constants.py        QUORUM_*
 *   - backend/app/modules/dependencies/schemas.py    ALLOWED_REGIONS
 *   - backend/app/modules/incidents/constants.py     IncidentSeverity,
 *                                                    IncidentStatus, RootCause
 *   - backend/templates/evidence/default.html        report sections + labels
 *   - backend/app/modules/evidence/constants.py      DEFAULT_EVIDENCE_EXPIRY_DAYS
 *
 * `src/lib/__tests__/product-contract.test.ts` asserts these values against the
 * backend source text, so drift fails the frontend test suite instead of
 * silently publishing a claim the product cannot honour.
 */

/* ── Attribution ────────────────────────────────────────────────────────── */

/**
 * The complete set of attribution classifications. Confidence thresholds are
 * applied in this order by the engine.
 */
export const ATTRIBUTION_CLASSIFICATIONS = [
  'vendor_failure',
  'multi_cause',
  'infrastructure_issue',
  'unknown',
] as const;

export type AttributionClassification =
  (typeof ATTRIBUTION_CLASSIFICATIONS)[number];

/** Minimum confidence score (0-100) at which each classification is assigned. */
export const CLASSIFICATION_THRESHOLDS = {
  vendor_failure: 75,
  multi_cause: 50,
} as const;

/**
 * Signal weights used to compute the confidence score. They sum to exactly 1,
 * which is what makes the score reproducible and auditable.
 */
export const ATTRIBUTION_WEIGHTS = {
  temporal: 0.2,
  endpoint_overlap: 0.25,
  latency_correlation: 0.25,
  error_pattern: 0.15,
  infrastructure_baseline: 0.15,
} as const;

export type AttributionSignal = keyof typeof ATTRIBUTION_WEIGHTS;

export const ATTRIBUTION_METHODOLOGY_VERSION = 'v1.0';

/** Human-readable names for the five signals. Not sent over the wire. */
export const SIGNAL_LABEL: Record<AttributionSignal, string> = {
  temporal: 'Temporal overlap',
  endpoint_overlap: 'Endpoint overlap',
  latency_correlation: 'Latency correlation',
  error_pattern: 'Error pattern',
  infrastructure_baseline: 'Infrastructure baseline',
};

/**
 * Recomputes the confidence score exactly as the engine does: weighted sum of
 * the normalised signals, scaled to a percentage, rounded to two decimals.
 *
 * Used so any illustrative figure on the site is arithmetically consistent
 * with the thresholds that decide its classification, rather than a plausible
 * looking number that contradicts them.
 */
export function confidenceFromSignals(
  signals: Record<AttributionSignal, number>
): number {
  const raw = (Object.keys(ATTRIBUTION_WEIGHTS) as AttributionSignal[]).reduce(
    (sum, name) => sum + signals[name] * ATTRIBUTION_WEIGHTS[name],
    0
  );
  return Math.round(raw * 100 * 100) / 100;
}

/** The classification the engine would assign to a given confidence score. */
export function classificationFor(
  confidence: number,
  infrastructureOk = true
): AttributionClassification {
  if (confidence >= CLASSIFICATION_THRESHOLDS.vendor_failure) {
    return 'vendor_failure';
  }
  if (confidence >= CLASSIFICATION_THRESHOLDS.multi_cause) return 'multi_cause';
  if (!infrastructureOk) return 'infrastructure_issue';
  return 'unknown';
}

/* ── Quorum ─────────────────────────────────────────────────────────────── */

/** A fault is only declared once this many regions agree inside the window. */
export const QUORUM_MIN_REGIONS = 2;
export const QUORUM_WINDOW_SECONDS = 60;

/* ── Regions ────────────────────────────────────────────────────────────── */

/**
 * Region codes. These are scheduling labels on a single worker, not
 * geographic routing claims - the site never renders a world map, city names
 * or coordinates because of it.
 *
 * `backend/app/modules/checks/tasks.py` states the deployment outright: "The
 * single-host deployment runs one worker that must execute every region's
 * probes; region stays a result label."
 */
export const ALLOWED_REGIONS = ['us-east', 'eu-west', 'ap-south', 'sa-east'] as const;
export const DEFAULT_REGIONS = ['us-east', 'eu-west'] as const;

/* ── Observation topology ───────────────────────────────────────────────── */

/**
 * How many independent places RELIASTRA currently probes from: one.
 *
 * Every probe is issued by the same single-host worker, so a `region` value on
 * a check result is a scheduling label, not a second opinion. The console
 * therefore never renders a region count, a per-region panel, a "regions that
 * observed" figure or a regional-quorum claim: those would all describe a
 * fleet that does not exist.
 *
 * `src/components/console/__tests__/single-observation-point.test.ts` fails the
 * build if a multi-node claim returns to any console surface.
 */
export const OBSERVATION_POINT_COUNT = 1;

/**
 * Consecutive failed checks required before RELIASTRA calls an incident.
 * Mirrors `SINGLE_TOPOLOGY_FAILURE_CHECKS` (default 2) in
 * `backend/app/config.py`. This is the debounce: one dropped probe is recorded,
 * not declared.
 */
export const DETECTION_FAILURE_CHECKS = 2;

/**
 * Consecutive successful checks required before an open incident resolves.
 * Mirrors `CONSECUTIVE_RECOVERY_CHECKS` in
 * `backend/app/modules/checks/constants.py`. The recovery rule is symmetric on
 * purpose: a threshold that opens on two failures but closes on one produces
 * an incident log that flutters with the target.
 */
export const DETECTION_RECOVERY_CHECKS = 2;

/** How the console names the single place measurements come from. */
export const OBSERVATION_POINT_LABEL = 'RELIASTRA observation point';

/**
 * The scheduling label the API is sent when a dependency is created. The
 * backend requires at least one entry from `ALLOWED_REGIONS`
 * (`DependencyCreate.regions`, `min_length=1`), so the console sends exactly
 * one and never exposes the choice.
 */
export const PRIMARY_OBSERVATION_REGION = 'us-east';

/* ── Incidents ──────────────────────────────────────────────────────────── */

export const INCIDENT_SEVERITIES = ['critical', 'major', 'minor'] as const;
export const INCIDENT_STATUSES = ['open', 'resolved', 'false_positive'] as const;
export const ROOT_CAUSES = [
  'vendor_failure',
  'network_issue',
  'config_error',
  'unknown',
] as const;

/**
 * Default check interval for a dependency, in seconds. Transcribed from
 * `DependencyCreate.check_interval_seconds` (default 300) in
 * `backend/app/modules/dependencies/schemas.py`. Anything that illustrates
 * "how often RELIASTRA looks" must use this rather than inventing a cadence.
 */
export const CHECK_INTERVAL_SECONDS = 300;

/** Default correlation window for cross-vendor correlation, in seconds. */
export const CORRELATION_WINDOW_SECONDS = 300;

/* ── Evidence ───────────────────────────────────────────────────────────── */

/**
 * The section headings of the generated evidence artifact, in document order,
 * transcribed from `backend/templates/evidence/default.html`. A visual that
 * claims to show the report must show these, not invented ones.
 */
export const EVIDENCE_REPORT_SECTIONS = [
  'Incident Record',
  'Detection Record',
  'Incident Window Measurements',
  'SLA Impact Calculation',
  'Observed Latency And Failures',
  'Rolling 24-Hour Health (Context)',
  'Correlated Dependency Events',
  'Deterministic Attribution',
  'Documented Observations',
  'Authenticity, Retention and Verification',
] as const;

/**
 * The finding block that opens the artifact: the four figures a reader is
 * looking for, stated before the sections that substantiate them. A visual that
 * shows the document without them is showing an export, not a report.
 */
export const EVIDENCE_FIGURES = [
  'Incident window',
  'Measured availability',
  'Measured downtime',
  'Attribution',
] as const;

/**
 * Where a recipient of the document is sent. The artifact prints
 * `<SITE_URL>/reports/<verification id>` as a link and a QR; the page lives at
 * this route. Kept here because a printed URL cannot be fixed after the fact -
 * a rename that does not move this constant breaks every document already in a
 * customer's hands.
 */
export const EVIDENCE_REPORT_PATH = '/reports';

/** Rows of the appendix table reproduced inside the PDF. */
export const EVIDENCE_OBSERVATION_COLUMNS = [
  'Executed At (UTC)',
  'Observation Point',
  'Result',
  'Latency',
  'Status',
  'Detail',
] as const;

/**
 * Field labels as they appear in the artifact. Keyed by section so a visual
 * cannot silently merge or rename fields.
 */
export const EVIDENCE_REPORT_FIELDS = {
  'Incident Record': [
    'Report Reference',
    'Incident ID',
    'Organization',
    'Monitored Dependency',
    'Severity / Status',
    'Started At (UTC)',
    'Resolved At (UTC)',
    'Measurement Window (UTC)',
    'Observation Topology',
  ],
  'Detection Record': ['Detection Rule', 'Rule Identifier', 'Detector Confirmation', 'Basis'],
  'Incident Window Measurements': [
    'Checks In Window',
    'Successful Checks',
    'Failed Checks',
    'Blocked Checks (Excluded)',
    'Measured Availability',
    'Longest Failure Run',
    'Latency (ms)',
    'First / Last Observation',
  ],
  'SLA Impact Calculation': [
    'Planned Target Uptime',
    'Measured Availability In Window',
    'SLA Degradation Impact',
    'Measured Downtime',
    'Allowance Exceeded',
    'Calculation Basis',
  ],
  'Correlated Dependency Events': [
    // The name, not the id. A reader who cannot name the second dependency
    // cannot use the correlation, and an opaque `dep_01J8…` in a document of
    // record reads like a log export.
    'Correlated Dependency',
    'Correlation Method',
    'Time Window',
    'Confidence',
  ],
  'Deterministic Attribution': [
    'Classification',
    'Confidence Score',
    'Methodology',
  ],
  'Rolling 24-Hour Health (Context)': [
    'Rolling 24h Availability',
    'Rolling 24h Average Latency',
    'Rolling 24h Checks',
  ],
  'Documented Observations': [...EVIDENCE_OBSERVATION_COLUMNS],
  'Authenticity, Retention and Verification': [
    'Verify this record',
    'Signature',
    'Retention',
    'Rendered By',
  ],
} as const;

/**
 * Phrases that must never appear in the generated artifact.
 *
 * Each one was in the template at some point and each one described something
 * RELIASTRA does not do: independent regional confirmation from a single host,
 * a quorum that was never computed, a per-region chart that was hand-typed
 * into the markup. They are listed here so a reintroduction fails a test
 * rather than reaching a customer who intends to hand the document to a
 * vendor.
 */
export const EVIDENCE_FORBIDDEN_CLAIMS = [
  'Multi-Region',
  'Quorum Confirmed',
  'Verification Regions',
  'Regions Observed',
  'Region of First Detection',
  'Per-Region Latency',
  'Measured 24h Uptime',
  'independent regional',
] as const;

/**
 * The authenticity block. `Document Checksum` is listed because the artifact
 * must state where the checksum lives: a PDF cannot contain the checksum of
 * itself, and the previous template printed the label with a value that could
 * not have been there.
 */
export const EVIDENCE_FOOTER_FIELDS = [
  'Evidence Data Hash (SHA-256)',
  'Document Checksum',
  'Public Verification ID',
  'Evidence Schema Version',
] as const;

export const EVIDENCE_EXPIRY_DAYS = 365;

/**
 * Schema version stamped on the compiled artifact. Mirrors
 * `EVIDENCE_SCHEMA_VERSION` in `backend/app/modules/evidence/service.py`: the
 * version moves only when the artifact's structure changes in a way a verifier
 * would need to know about.
 */
export const EVIDENCE_SCHEMA_VERSION = '2.0';

/* ── Check results ──────────────────────────────────────────────────────── */

/**
 * Columns recorded on every observation. A visual that depicts a check must
 * only ever surface these.
 */
export const CHECK_RESULT_FIELDS = [
  'executed_at',
  'dependency_id',
  'org_id',
  'region',
  'latency_ms',
  'status_code',
  'is_up',
  'error_message',
  'quorum_confirmed',
] as const;
