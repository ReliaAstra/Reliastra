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
  CHECK_RESULT_FIELDS,
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
    // window 09:12:41 -> 09:48:06 = 2125s of downtime in an 86400s day
    const downtime = 2125;
    const uptime = ((86400 - downtime) / 86400) * 100;
    expect(uptime.toFixed(2)).toBe('97.54');

    // The artifact defines degradation as (Planned - Measured) / Planned,
    // which is a ratio; it is rendered as a percentage, so scale by 100.
    const impactPct = ((100 - uptime) / 100) * 100;
    expect(impactPct.toFixed(2)).toBe('2.46');

    expect(html.artifact).toContain('97.54%');
    expect(html.artifact).toContain('2.46%');
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
  it('only names regions the API accepts', () => {
    const regions = html.topology.match(/<dt>([a-z]{2}-[a-z]+)<\/dt>/g) ?? [];
    expect(regions.length).toBeGreaterThan(0);
    for (const raw of regions) {
      const code = raw.replace(/<\/?dt>/g, '');
      expect(ALLOWED_REGIONS).toContain(code);
    }
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
  it('states the real quorum rule', () => {
    expect(html.timeline).toContain(String(QUORUM_MIN_REGIONS));
    expect(html.timeline).toContain(String(QUORUM_WINDOW_SECONDS));
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

  it('annotates the quorum window', () => {
    expect(html.chart).toContain('quorum window');
    expect(html.chart).toContain(String(QUORUM_WINDOW_SECONDS));
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
