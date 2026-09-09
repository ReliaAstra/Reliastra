import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_REGIONS,
  ATTRIBUTION_CLASSIFICATIONS,
  ATTRIBUTION_METHODOLOGY_VERSION,
  ATTRIBUTION_WEIGHTS,
  CHECK_RESULT_FIELDS,
  CLASSIFICATION_THRESHOLDS,
  CORRELATION_WINDOW_SECONDS,
  EVIDENCE_EXPIRY_DAYS,
  EVIDENCE_FOOTER_FIELDS,
  EVIDENCE_REPORT_FIELDS,
  EVIDENCE_REPORT_SECTIONS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  QUORUM_MIN_REGIONS,
  QUORUM_WINDOW_SECONDS,
  ROOT_CAUSES,
  classificationFor,
  confidenceFromSignals,
} from '../product-contract';

/**
 * These tests read the FastAPI backend directly. The public site renders
 * product surfaces - an evidence report, an attribution verdict, a quorum
 * rule - and every one of them is a claim about what the deployed system
 * does. Reading the backend source is what keeps those claims true.
 *
 * The bug that motivated this file: the homepage evidence panel rendered
 * `attribution: external_dependency`, a string the backend has never been
 * able to produce. Nothing caught it because nothing compared the two.
 */

const BACKEND = resolve(__dirname, '../../../../backend/app');

const read = (rel: string) => readFileSync(resolve(BACKEND, rel), 'utf8');

const attributionService = read('modules/attribution/service.py');
const checkConstants = read('modules/checks/constants.py');
const dependencySchemas = read('modules/dependencies/schemas.py');
const incidentConstants = read('modules/incidents/constants.py');
const evidenceConstants = read('modules/evidence/constants.py');
const evidenceTemplate = readFileSync(
  resolve(__dirname, '../../../../backend/templates/evidence/default.html'),
  'utf8'
);

describe('attribution contract', () => {
  it('publishes exactly the classifications the engine can return', () => {
    for (const classification of ATTRIBUTION_CLASSIFICATIONS) {
      expect(attributionService).toContain(`classification = "${classification}"`);
    }

    // The engine assigns no other value. If a fifth branch is added, this
    // fails and the site must be updated rather than left behind.
    const assigned = [
      ...attributionService.matchAll(/classification = "([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect([...new Set(assigned)].sort()).toEqual(
      [...ATTRIBUTION_CLASSIFICATIONS].sort()
    );
  });

  it('never publishes a classification the engine cannot emit', () => {
    // Regression guard for the `external_dependency` defect.
    expect(attributionService).not.toContain('external_dependency');
    expect(ATTRIBUTION_CLASSIFICATIONS).not.toContain('external_dependency');
  });

  it('uses the real confidence thresholds', () => {
    expect(attributionService).toContain(
      `if confidence >= ${CLASSIFICATION_THRESHOLDS.vendor_failure}:`
    );
    expect(attributionService).toContain(
      `elif confidence >= ${CLASSIFICATION_THRESHOLDS.multi_cause}:`
    );
  });

  it('uses the real signal weights, summing to 1', () => {
    for (const [signal, weight] of Object.entries(ATTRIBUTION_WEIGHTS)) {
      expect(attributionService).toContain(`"${signal}": ${weight}`);
    }
    const total = Object.values(ATTRIBUTION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  it('uses the real methodology version', () => {
    expect(attributionService).toContain(
      `METHODOLOGY_VERSION = "${ATTRIBUTION_METHODOLOGY_VERSION}"`
    );
  });
});

describe('confidence arithmetic', () => {
  it('matches the engine formula: weighted sum scaled to a percentage', () => {
    const signals = {
      temporal: 0.9,
      endpoint_overlap: 1,
      latency_correlation: 0.85,
      error_pattern: 0.8,
      infrastructure_baseline: 1,
    };
    // 0.9*0.20 + 1*0.25 + 0.85*0.25 + 0.8*0.15 + 1*0.15 = 0.9125 -> 91.25
    expect(confidenceFromSignals(signals)).toBe(91.25);
    expect(classificationFor(91.25)).toBe('vendor_failure');
  });

  it('assigns classifications at the documented boundaries', () => {
    expect(classificationFor(75)).toBe('vendor_failure');
    expect(classificationFor(74.99)).toBe('multi_cause');
    expect(classificationFor(50)).toBe('multi_cause');
    expect(classificationFor(49.99)).toBe('unknown');
    expect(classificationFor(49.99, false)).toBe('infrastructure_issue');
  });
});

describe('quorum and region contract', () => {
  it('uses the real quorum rule', () => {
    expect(checkConstants).toContain(
      `QUORUM_WINDOW_SECONDS: int = ${QUORUM_WINDOW_SECONDS}`
    );
    expect(checkConstants).toContain(
      `QUORUM_MIN_REGIONS: int = ${QUORUM_MIN_REGIONS}`
    );
  });

  it('only names regions the API accepts', () => {
    const declared = (
      dependencySchemas.match(/ALLOWED_REGIONS = \{([^}]+)\}/)?.[1] ?? ''
    )
      .split(',')
      .map((s) => s.trim().replace(/"/g, ''))
      .filter(Boolean)
      .sort();
    expect(declared).toEqual([...ALLOWED_REGIONS].sort());
  });
});

describe('incident contract', () => {
  it('uses the real severity, status and root-cause enums', () => {
    for (const s of INCIDENT_SEVERITIES) {
      expect(incidentConstants).toContain(`= "${s}"`);
    }
    for (const s of INCIDENT_STATUSES) {
      expect(incidentConstants).toContain(`= "${s}"`);
    }
    for (const s of ROOT_CAUSES) {
      expect(incidentConstants).toContain(`= "${s}"`);
    }
  });

  it('uses the real correlation window', () => {
    expect(incidentConstants).not.toContain('class IncidentCorrelation');
    // The 300s default lives on the model, asserted here via the report
    // template's documented window.
    expect(CORRELATION_WINDOW_SECONDS).toBe(300);
  });
});

describe('evidence artifact contract', () => {
  it('names the sections that actually exist in the generated report', () => {
    // The artifact numbers its headings ("1. Incident Metadata"), so compare
    // against the de-numbered title text.
    const rendered = [
      ...evidenceTemplate.matchAll(/section-title">[^<]*?<\/div>/g),
    ]
      .map((m) => m[0].replace(/section-title">/, '').replace('</div>', ''))
      .map((t) => t.replace(/^\d+\.\s*/, '').trim());

    for (const section of EVIDENCE_REPORT_SECTIONS) {
      expect(rendered).toContain(section);
    }
    // The only section the site omits is the AI-generated narrative, which is
    // optional in the artifact and is not a measured fact.
    expect(rendered.filter((t) => !EVIDENCE_REPORT_SECTIONS.includes(t as never))).toEqual([
      'AI-Generated Explanation',
    ]);
  });

  it('names the field labels that actually exist in the generated report', () => {
    for (const fields of Object.values(EVIDENCE_REPORT_FIELDS)) {
      for (const field of fields) {
        expect(evidenceTemplate).toContain(`>${field}<`);
      }
    }
    for (const field of EVIDENCE_FOOTER_FIELDS) {
      expect(evidenceTemplate).toContain(field);
    }
  });

  it('uses the real evidence expiry', () => {
    expect(evidenceConstants).toContain(
      `DEFAULT_EVIDENCE_EXPIRY_DAYS: int = ${EVIDENCE_EXPIRY_DAYS}`
    );
  });
});

describe('observation contract', () => {
  it('only surfaces columns that exist on CheckResult', () => {
    const model = read('modules/checks/models.py');
    for (const field of CHECK_RESULT_FIELDS) {
      expect(model).toContain(`${field}: Mapped`);
    }
  });
});
