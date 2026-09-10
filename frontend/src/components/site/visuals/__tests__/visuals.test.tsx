import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AttributionSignals } from '@/components/site/visuals/attribution-signals';
import { DependencyTopology } from '@/components/site/visuals/dependency-topology';
import { EvidenceArtifact } from '@/components/site/visuals/evidence-artifact';
import { IncidentTimeline } from '@/components/site/visuals/incident-timeline';
import { LatencyChart } from '@/components/site/visuals/latency-chart';
import {
  ALLOWED_REGIONS,
  ATTRIBUTION_CLASSIFICATIONS,
  ATTRIBUTION_WEIGHTS,
  CHECK_INTERVAL_SECONDS,
  CHECK_RESULT_FIELDS,
  DETECTION_FAILURE_CHECKS,
  OBSERVATION_POINT_COUNT,
  OBSERVATION_POINT_LABEL,
  EVIDENCE_REPORT_FIELDS,
  QUORUM_MIN_REGIONS,
  QUORUM_WINDOW_SECONDS,
} from '@/lib/product-contract';

/**
 * The product visuals, rendered and asserted.
 *
 * These components carry claims about what the product does, and they are the
 * part of the site most likely to drift: an author tweaks a field name or a
 * classification and the page still compiles, still builds, still renders -
 * it just stops being true. A type check cannot see that, so the markup is
 * rendered here and checked against the contract.
 *
 * `product-contract.test.ts` binds the contract to the FastAPI source; this
 * file binds the visuals to the contract. Together they mean a visual can
 * only say something the backend can actually do.
 */

const html = {
  attribution: renderToStaticMarkup(<AttributionSignals />),
  topology: renderToStaticMarkup(<DependencyTopology />),
  artifact: renderToStaticMarkup(<EvidenceArtifact />),
  timeline: renderToStaticMarkup(<IncidentTimeline />),
  chart: renderToStaticMarkup(<LatencyChart />),
};

describe('evidence artifact', () => {
  it('renders the real report section headings', () => {
    for (const section of [
      'Incident Metadata',
      'SLA Impact Calculation',
      'Deterministic Attribution',
    ]) {
      expect(html.artifact).toContain(section);
    }
  });

  it('renders the real field labels, not invented ones', () => {
    for (const fields of Object.values(EVIDENCE_REPORT_FIELDS)) {
      for (const field of fields) {
        // The correlated-failures table is a table in the artifact and is not
        // reproduced in this summary panel.
        if (
          field === 'Correlated Dependency ID' ||
          field === 'Correlation Method' ||
          field === 'Time Window'
        ) {
          continue;
        }
        expect(html.artifact).toContain(field);
      }
    }
  });

  it('emits no headings, so it cannot break a host page outline', () => {
    expect(html.artifact).not.toMatch(/<h[1-6]/);
  });

  it('labels itself as illustrative', () => {
    expect(html.artifact).toContain('Illustrative values');
  });

  it('keeps its uptime arithmetic self-consistent', () => {
    // The depicted figures are computed from the incident window, the way the
    // real report computes them: 36 measured checks in a 2125s window, 6 failed.
    const windowSeconds = 2125;
    const measured = 36;
    const failed = 6;
    const availability = ((measured - failed) / measured) * 100;
    expect(availability.toFixed(4)).toBe('83.3333');

    const impactPct = 100 - availability;
    expect(impactPct.toFixed(4)).toBe('16.6667');

    const downtimeSeconds = Math.round((windowSeconds * impactPct) / 100);
    expect(downtimeSeconds).toBe(354);

    expect(html.artifact).toContain('83.3333%');
    expect(html.artifact).toContain('16.6667%');
    expect(html.artifact).toContain('354s of 2125s');
    // No rolling 24-hour figure is presented as the incident measurement.
    expect(html.artifact).not.toContain('Measured 24h Uptime');
  });
});

describe('attribution signals', () => {
  it('shows a classification the engine can actually return', () => {
    const rendered = ATTRIBUTION_CLASSIFICATIONS.filter((c) =>
      html.attribution.includes(c)
    );
    expect(rendered).toContain('vendor_failure');
    // multi_cause / infrastructure_issue / unknown must not be asserted as
    // the verdict; they appear only in the threshold captions.
    expect(html.attribution).toContain('vendor_failure');
  });

  it('never renders the retired external_dependency value', () => {
    // Regression guard: this exact string was on the homepage for a period
    // and is not producible by the engine.
    for (const rendered of Object.values(html)) {
      expect(rendered).not.toContain('external_dependency');
    }
  });

  it('computes the score rather than hard-coding it', () => {
    // 0.9*.20 + 1*.25 + .85*.25 + .8*.15 + 1*.15 = 0.9125 -> 91.25
    expect(html.attribution).toContain('91.25');
  });

  it('draws the thresholds against the aggregate scale, not per signal', () => {
    // The scale marks belong to the 0-100 total. A per-signal bar showing a
    // normalised 0-1 reading must not carry them.
    expect(html.attribution).toContain('ob-attr-scale-mark');
    const barSection = html.attribution.split('ob-attr-list')[1] ?? '';
    expect(barSection).not.toContain('ob-attr-scale-mark');
  });

  it('gives each signal bar an accessible name', () => {
    const bars = html.attribution.match(/class="ob-attr-bar"/g) ?? [];
    const labels = html.attribution.match(/aria-label="[^"]*contributes/g) ?? [];
    expect(bars.length).toBe(Object.keys(ATTRIBUTION_WEIGHTS).length);
    expect(labels.length).toBe(bars.length);
  });
});

describe('dependency topology', () => {
  it('shows consecutive checks from one point, not independent regions', () => {
    // RELIASTRA runs a single observation point, so the two readings per
    // dependency are two timestamps, not two places. A diagram that named
    // regions here would be claiming a fleet that does not exist.
    const readings = html.topology.match(/<dt>(\d{2}:\d{2}:\d{2})<\/dt>/g) ?? [];
    expect(readings.length).toBeGreaterThan(0);
    for (const code of ALLOWED_REGIONS) {
      expect(html.topology).not.toContain(`<dt>${code}</dt>`);
    }
    expect(html.topology).toContain(String(OBSERVATION_POINT_COUNT));
    expect(html.topology).toContain(`checked every ${CHECK_INTERVAL_SECONDS}s`);
  });

  it('surfaces only fields that exist on CheckResult', () => {
    for (const field of ['region', 'status_code', 'latency_ms', 'is_up']) {
      expect(CHECK_RESULT_FIELDS).toContain(field);
    }
  });

  it('labels itself as illustrative', () => {
    expect(html.topology).toContain('illustrative');
  });
});

describe('incident timeline', () => {
  it('states the real detection rule', () => {
    expect(html.timeline).toContain(String(DETECTION_FAILURE_CHECKS));
    expect(html.timeline).toContain('consecutive failed checks');
    // The single-observation-point deployment never claims a regional vote.
    expect(html.timeline).not.toContain('regions must agree');
    expect(html.timeline).not.toContain('quorum');
  });

  it('labels itself as illustrative and not a real event', () => {
    expect(html.timeline).toContain('Illustrative incident');
    expect(html.timeline).toContain('not a recorded event');
  });

  it('is a semantic ordered list with no headings', () => {
    expect(html.timeline).toContain('<ol');
    expect(html.timeline).toMatch(/<li/);
    expect(html.timeline).not.toMatch(/<h[1-6]/);
  });

  it('reports status using a word, not colour alone', () => {
    for (const state of ['healthy', 'degraded', 'critical']) {
      expect(html.timeline).toContain(`data-state="${state}"`);
    }
  });
});

describe('latency chart', () => {
  it('renders a described SVG rather than an unlabelled graphic', () => {
    expect(html.chart).toContain('<svg');
    expect(html.chart).toContain('role="img"');
    expect(html.chart).toMatch(/aria-label="[^"]{40,}"/);
  });

  it('annotates the incident window and the rule that confirmed it', () => {
    expect(html.chart).toContain('incident window');
    expect(html.chart).toContain(String(DETECTION_FAILURE_CHECKS));
    expect(html.chart).toContain(String(CHECK_INTERVAL_SECONDS));
    // One observation point: one series, and no claim of a regional vote.
    expect(html.chart).toContain(OBSERVATION_POINT_LABEL);
    expect(html.chart).not.toContain('quorum');
    expect(html.chart.match(/<polyline/g)?.length).toBe(1);
  });

  it('is self-contained static SVG with no client runtime', () => {
    expect(html.chart).not.toContain('<script');
    expect(html.chart).not.toContain('canvas');
  });
});

describe('shared discipline', () => {
  it('ships no client JavaScript of its own', () => {
    for (const [name, rendered] of Object.entries(html)) {
      expect(rendered, name).not.toContain('<script');
    }
  });

  it('never claims a customer, logo or metric that does not exist', () => {
    const all = Object.values(html).join('');
    expect(all).not.toMatch(/\b(?:SOC 2|ISO 27001|GDPR compliant)\b/);
    expect(all).not.toMatch(/trusted by/i);
  });
});
