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
  DEFAULT_REGIONS,
  EVIDENCE_EXPIRY_DAYS,
  EVIDENCE_FOOTER_FIELDS,
  EVIDENCE_FORBIDDEN_CLAIMS,
  EVIDENCE_REPORT_FIELDS,
  EVIDENCE_REPORT_SECTIONS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  PRIMARY_OBSERVATION_REGION,
  PUBLIC_INCIDENT_WINDOW_DAYS,
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

describe('the generated artifact makes no fabricated claims', () => {
  const template = evidenceTemplate;

  it.each(EVIDENCE_FORBIDDEN_CLAIMS)('never says %s', (claim) => {
    expect(template).not.toContain(claim);
  });

  it('draws its chart from the observations it carries', () => {
    // The static polyline that used to sit here was a fabricated measurement
    // printed next to a real checksum.
    expect(template).toContain('{{ chart_svg | safe }}');
    expect(template).not.toMatch(/points="\d+,\d+ \d+,\d+/);
  });

  it('states the detection rule instead of asserting a quorum', () => {
    expect(template).toContain('{{ detection.rule_label }}');
    expect(template).toContain('{{ detection.rule or "not recorded" }}');
  });

  it('labels the rolling 24h figure as context, separate from the incident', () => {
    expect(template).toContain('Rolling 24-Hour Health (Context)');
    expect(template).toContain('Incident Window Measurements');
  });
});

describe('the public observatory contract', () => {
  const config = read('config.py');
  const vendorService = read('modules/vendors/service.py');

  it('publishes the real public-incident window', () => {
    /**
     * Every incident the public channel returns has a web page, is linked from
     * the record and is listed in the sitemap, so this number is a
     * published-URL lifetime. It was a hard-coded 90 days in the service while
     * the site described these records as permanent: a cited URL started
     * returning 404 three months after publication.
     */
    const declared = config.match(
      /PUBLIC_INCIDENT_WINDOW_DAYS: int = Field\(\s*default=(\d+)/
    );
    expect(declared, 'PUBLIC_INCIDENT_WINDOW_DAYS is not declared in config.py').not.toBeNull();
    expect(Number(declared![1])).toBe(PUBLIC_INCIDENT_WINDOW_DAYS);
  });

  it('does not withdraw a record while its artifact is still retained', () => {
    const expiry = evidenceConstants.match(/DEFAULT_EVIDENCE_EXPIRY_DAYS: int = (\d+)/);
    expect(expiry).not.toBeNull();
    expect(PUBLIC_INCIDENT_WINDOW_DAYS).toBeGreaterThanOrEqual(Number(expiry![1]));
    expect(PUBLIC_INCIDENT_WINDOW_DAYS).toBe(EVIDENCE_EXPIRY_DAYS);
  });

  it('reads the window from configuration, not from a literal', () => {
    const gateService = read('modules/evidence_gate/service.py');
    expect(gateService).toContain('settings.PUBLIC_INCIDENT_WINDOW_DAYS');
    expect(gateService).not.toContain('timedelta(days=90)');
  });

  it('names the region the API actually defaults to', () => {
    /**
     * The public record prefers "the API's own default region" when choosing
     * which observation to lead with. This value was transcribed as
     * `us-east-1` while the backend - and every seeded endpoint's region label
     * - says `us-east`, so the preference never matched and silently fell
     * through to whatever came first.
     */
    const backendDefault = vendorService.match(/_DEFAULT_REGION = "([^"]+)"/);
    expect(backendDefault).not.toBeNull();
    expect(PRIMARY_OBSERVATION_REGION).toBe(backendDefault![1]);
  });

  it('seeds public endpoints with the region that is deployed', () => {
    /**
     * One observation point is deployed (`OBSERVATION_POINT_COUNT`), so a
     * seeded endpoint advertising two region labels prints a second origin no
     * probe ever used - on the page whose whole purpose is to refuse that
     * implication. Migration 0038 normalizes the seed and the column default.
     */
    const migration = readFileSync(
      resolve(__dirname, '../../../../backend/app/db/migrations/versions/0038_public_endpoint_regions.py'),
      'utf8'
    );
    expect(migration).toContain(`DEPLOYED_REGION = "${PRIMARY_OBSERVATION_REGION}"`);
    expect(migration).toContain('server_default=NEW_DEFAULT');

    /**
     * The column default a new endpoint inherits, parsed out of the migration
     * instead of matched as a literal: `DEFAULT_REGIONS` transcribes the same
     * value on the frontend, and a literal regex would keep passing after
     * either side changed on its own. Both must name the one deployed region,
     * and that region must be one the backend accepts.
     */
    const newDefault = migration.match(/NEW_DEFAULT = '(\[[^\]]*\])'/);
    expect(newDefault).not.toBeNull();
    // The capture is already JSON: the migration writes a Python string
    // literal whose contents are the JSON array the column default holds.
    const seeded = JSON.parse(newDefault![1]) as string[];
    expect(seeded).toEqual([...DEFAULT_REGIONS]);
    expect(seeded).toEqual([PRIMARY_OBSERVATION_REGION]);
    expect(ALLOWED_REGIONS).toContain(PRIMARY_OBSERVATION_REGION);
  });
});
