/**
 * The canonical RELIASTRA methodology, stated once.
 *
 * This module exists because the public site was publishing a methodology the
 * backend does not implement. The homepage told visitors that "a fault needs at
 * least two regions to agree inside one 60-second window" and that dependencies
 * are "checked from every region you configure". Neither statement is true of
 * the deployed system: `OBSERVATION_TOPOLOGY` defaults to `single`, one worker
 * executes every probe, and `region` is a scheduling label carried on the
 * result row, not a second opinion. The evidence artifact and the console were
 * already corrected for this; the marketing pages were not, so a visitor could
 * read one methodology on the homepage and its opposite inside a document of
 * record.
 *
 * The rule this file enforces: **every public surface that describes how the
 * product works reads its numbers and its wording from here**, and
 * `src/lib/__tests__/methodology.test.ts` fails the suite when a public page
 * claims a topology, a threshold or a capability this module does not declare.
 *
 * Sources of truth, verify before editing:
 *   - backend/app/config.py                       OBSERVATION_TOPOLOGY,
 *                                                 SINGLE_TOPOLOGY_FAILURE_CHECKS
 *   - backend/app/modules/checks/detection.py     DetectionRule, thresholds
 *   - backend/app/modules/attribution/service.py  WEIGHTS, thresholds, version
 *   - backend/app/modules/checks/constants.py     QUORUM_* (multi topology)
 *   - frontend/src/lib/product-contract.ts        transcribed contract
 */

import {
  ATTRIBUTION_METHODOLOGY_VERSION,
  ATTRIBUTION_WEIGHTS,
  CHECK_INTERVAL_SECONDS,
  CLASSIFICATION_THRESHOLDS,
  DETECTION_FAILURE_CHECKS,
  DETECTION_RECOVERY_CHECKS,
  EVIDENCE_EXPIRY_DAYS,
  EVIDENCE_SCHEMA_VERSION,
  OBSERVATION_POINT_COUNT,
  OBSERVATION_POINT_LABEL,
  PRIMARY_OBSERVATION_REGION,
} from './product-contract';

/* ── Observation ────────────────────────────────────────────────────────── */

/**
 * How many independent places probes are issued from. One, today. Anything the
 * site says about confirmation has to follow from this number, not from the
 * multi-point rule that exists in code but is not deployed.
 */
export const OBSERVATION_POINTS = OBSERVATION_POINT_COUNT;

export const OBSERVATION_POINT = OBSERVATION_POINT_LABEL;

/** The scheduling label the single worker stamps on each result row. */
export const OBSERVATION_LABEL = PRIMARY_OBSERVATION_REGION;

/** Default interval between probes for a dependency, in seconds. */
export const PROBE_INTERVAL_SECONDS = CHECK_INTERVAL_SECONDS;

/** What one probe records. These are the columns; nothing else is captured. */
export const OBSERVATION_FIELDS = [
  { field: 'executed_at', note: 'UTC timestamp the probe completed' },
  { field: 'status_code', note: 'HTTP status, or null on a transport error' },
  { field: 'latency_ms', note: 'Wall-clock time from request to completed response, redirect hops included' },
  { field: 'is_up', note: 'The pass/fail the detector reads' },
  { field: 'error_message', note: 'Transport error text, when there was one' },
  { field: 'region', note: 'Scheduling label of the worker that ran the probe' },
] as const;

/* ── Detection ──────────────────────────────────────────────────────────── */

/**
 * How a fault is confirmed under the deployed single-point topology.
 *
 * One failed probe is recorded and not declared: the rule requires the failure
 * to survive the next check. Under a genuinely independent fleet the rule is a
 * quorum instead - but that topology is not deployed, so the public site does
 * not describe it as though it were.
 */
export const DETECTION = {
  /** Rule identifier printed in the evidence artifact and the audit log. */
  ruleId: 'single.consecutive_failures',
  recoveryRuleId: 'single.consecutive_successes',
  /** Consecutive failed checks required to open an incident. */
  failureChecks: DETECTION_FAILURE_CHECKS,
  /** Consecutive successful checks required to resolve one. */
  recoveryChecks: DETECTION_RECOVERY_CHECKS,
  /** The interval those checks are spaced at, so the debounce has a duration. */
  intervalSeconds: CHECK_INTERVAL_SECONDS,
} as const;

/** The confirmation window in plain words: N failures at one interval apart. */
export const DETECTION_WINDOW = `at least ${DETECTION.failureChecks} consecutive failed checks, one check interval apart`;

export const DETECTION_SENTENCE = `An incident opens after ${DETECTION.failureChecks} consecutive failed checks from the ${OBSERVATION_POINT.toLowerCase()} and resolves after ${DETECTION.recoveryChecks} consecutive successes. A single failed probe is recorded, not declared.`;

/* ── Attribution ────────────────────────────────────────────────────────── */

/**
 * Classification is a deterministic weighted sum, not a judgement call. The
 * site prints the weights and the thresholds because a reader who disagrees
 * with a verdict should be able to recompute it.
 */
export const ATTRIBUTION = {
  methodologyVersion: ATTRIBUTION_METHODOLOGY_VERSION,
  weights: ATTRIBUTION_WEIGHTS,
  vendorFailureAt: CLASSIFICATION_THRESHOLDS.vendor_failure,
  multiCauseAt: CLASSIFICATION_THRESHOLDS.multi_cause,
  /** Ordered signal list with weights rendered as percentages. */
  signals: (
    [
      ['temporal', 'Temporal overlap', 'Did the dependency degrade inside the incident window?'],
      ['endpoint_overlap', 'Endpoint overlap', 'Was the failing endpoint one this dependency serves?'],
      ['latency_correlation', 'Latency correlation', 'Did latency move with the failures?'],
      ['error_pattern', 'Error pattern', 'Are the errors one coherent class, or several?'],
      ['infrastructure_baseline', 'Infrastructure baseline', 'Were RELIASTRA’s own probes healthy while this happened?'],
    ] as const
  ).map(([key, label, question]) => ({
    key,
    label,
    question,
    weight: ATTRIBUTION_WEIGHTS[key],
  })),
} as const;

/**
 * What the score does and does not establish. This list is deliberately blunt,
 * and it appears next to the verdict on every surface that renders one.
 */
export const ATTRIBUTION_LIMITS = [
  'A score is a correlation between two timelines. It is not proof of causation, and RELIASTRA does not describe it as one.',
  'Only observations of dependencies you have configured contribute. An unmonitored dependency cannot be attributed.',
  'Below 50 the engine returns `unknown`, which is a result: the timelines did not support a claim.',
] as const;

/* ── Evidence ───────────────────────────────────────────────────────────── */

export const EVIDENCE = {
  /** Detached-signature algorithm and the hash used over the payload. */
  dataHash: 'SHA-256',
  schemaVersion: EVIDENCE_SCHEMA_VERSION,
  /** Retained and re-verifiable for this long after issue. */
  retentionDays: EVIDENCE_EXPIRY_DAYS,
  /** Verification is unauthenticated: the token in the document is the proof. */
  verificationPath: '/reports',
} as const;

/** What an evidence record can be used for, and what it cannot. */
export const EVIDENCE_CAN = [
  'Show what this dependency did during a window, from outside your network and the vendor’s.',
  'Show the observations the conclusion rests on, individually, with timestamps.',
  'Show that the document has not been altered since it was issued.',
] as const;

export const EVIDENCE_CANNOT = [
  'Establish what happened inside the vendor’s infrastructure. The probe records the path it took, not the vendor’s internals.',
  'Establish that every one of the vendor’s customers was affected. One observation point measures one path.',
  'Prove a contract was breached. It reports measurements; your agreement with the vendor decides what they mean.',
] as const;

/* ── The network ────────────────────────────────────────────────────────── */

/**
 * Where the product is going, separated from what exists. The site may describe
 * the direction; it may not borrow credibility from it. Nothing here is
 * measured, counted or rendered as a live figure.
 */
export const NETWORK_DIRECTION = [
  'Independent observations — what RELIASTRA measures itself, today.',
  'Application signals — what a participating application can report about its own dependency calls.',
  'Correlation — the same dependency degrading for unrelated applications at the same time.',
  'Attribution — a dependency’s behaviour described from many vantage points instead of one.',
] as const;

/* ── Sentences shared across surfaces ───────────────────────────────────── */

/** The one-line answer to "what does RELIASTRA do", used in metadata and docs. */
export const PRODUCT_ONE_LINE =
  'RELIASTRA probes the external services your software depends on, records what happened, and keeps a verifiable record of it.';

/** The honesty clause. Printed wherever a capability set is listed. */
export const SCOPE_NOTE = `Probes are issued from ${OBSERVATION_POINTS} observation point today, on a ${PROBE_INTERVAL_SECONDS}-second interval by default. Every page that reports a measurement says which window it covers and how many observations stand behind it.`;
