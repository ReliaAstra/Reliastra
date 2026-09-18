import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';

import {
  ATTRIBUTION_METHODOLOGY_VERSION,
  CHECK_INTERVAL_SECONDS,
  DETECTION_FAILURE_CHECKS,
  DETECTION_RECOVERY_CHECKS,
  EVIDENCE_EXPIRY_DAYS,
  EVIDENCE_SCHEMA_VERSION,
  OBSERVATION_POINT_COUNT,
} from '@/lib/product-contract';
import {
  ATTRIBUTION,
  DETECTION,
  EVIDENCE,
  OBSERVATION_POINTS,
  PROBE_INTERVAL_SECONDS,
  SCOPE_NOTE,
} from '@/lib/methodology';
import { DOCS } from '@/lib/docs/corpus';
import { HomeLanding } from '@/components/site/home/home-landing';

/**
 * One methodology, enforced.
 *
 * The defect this file exists for: the public site described a detector the
 * backend does not run. The homepage promised that "a fault needs at least two
 * regions to agree inside one 60-second window" and that dependencies are
 * "checked from every region you configure". The deployed topology is
 * `selected single` (one worker, `SINGLE_TOPOLOGY_FAILURE_CHECKS=2`), so
 * `region` on a check row is a scheduling label and the 60-second quorum rule
 * never executes. A visitor could read one methodology on the homepage and its
 * opposite inside an evidence artifact, and an engineer who spotted it would
 * be right to distrust everything else on the site.
 *
 * Three properties are checked, in increasing order of how hard they are to
 * fake:
 *
 *   1. Transcription - the numbers the public copy prints are the numbers the
 *      frontend's backend contract carries, not retyped literals.
 *   2. Restraint - no public marketing surface claims a topology, a threshold
 *      or a capability the deployed system does not have. This runs over the
 *      source files themselves, because a claim is usually introduced by
 *      rewriting a sentence, not by changing a constant.
 *   3. Disclosure - the surfaces that describe detection say out loud how many
 *      observation points exist. An honest page states the limit; it does not
 *      merely omit the lie.
 */

/* ── 1. Transcription ───────────────────────────────────────────────────── */

describe('methodology transcription', () => {
  it('prints the contract values rather than retyping them', () => {
    expect(OBSERVATION_POINTS).toBe(OBSERVATION_POINT_COUNT);
    expect(PROBE_INTERVAL_SECONDS).toBe(CHECK_INTERVAL_SECONDS);
    expect(DETECTION.failureChecks).toBe(DETECTION_FAILURE_CHECKS);
    expect(DETECTION.recoveryChecks).toBe(DETECTION_RECOVERY_CHECKS);
    expect(DETECTION.intervalSeconds).toBe(CHECK_INTERVAL_SECONDS);
    expect(ATTRIBUTION.methodologyVersion).toBe(ATTRIBUTION_METHODOLOGY_VERSION);
    expect(EVIDENCE.schemaVersion).toBe(EVIDENCE_SCHEMA_VERSION);
    expect(EVIDENCE.retentionDays).toBe(EVIDENCE_EXPIRY_DAYS);
  });

  it('derives the shipped rule id from the deployed topology', () => {
    // Under `multi` the rule id is the quorum rule; under `single` it is the
    // consecutive-failure rule. The public copy may only name the one that
    // can actually fire.
    expect(OBSERVATION_POINTS).toBe(1);
    expect(DETECTION.ruleId).toBe('single.consecutive_failures');
    expect(DETECTION.recoveryRuleId).toBe('single.consecutive_successes');
    expect(DETECTION.ruleId.startsWith('single.')).toBe(true);
  });

  it('states the limit in the shared scope note', () => {
    expect(SCOPE_NOTE).toContain(String(OBSERVATION_POINTS));
    expect(SCOPE_NOTE).toContain('observation point');
    expect(SCOPE_NOTE.toLowerCase()).toContain('window');
  });

  it('weights the attribution signals to exactly one', () => {
    const total = ATTRIBUTION.signals.reduce((sum, s) => sum + s.weight, 0);
    expect(Math.round(total * 100) / 100).toBe(1);
    expect(ATTRIBUTION.vendorFailureAt).toBeGreaterThan(ATTRIBUTION.multiCauseAt);
  });
});

/* ── 2. Restraint ───────────────────────────────────────────────────────── */

/**
 * Surfaces that make claims about how the product works. Observatory internals
 * and the console are deliberately out of scope: the former renders per-region
 * tables *and* their explanation, and the latter is a separate surface with
 * its own guard (`components/console/__tests__/single-observation-point.test.ts`).
 */
const CLAIM_SURFACES = [
  'src/components/site/home',
  'src/components/marketing',
  'src/components/site/primitives.tsx',
  'src/app/product',
  'src/app/pricing',
  'src/app/creators',
  'src/app/about',
  'src/app/page.tsx',
];

/**
 * Phrases that assert a capability the deployed system does not have. Each was
 * present in this repository before the methodology was reconciled, so each is
 * a real regression rather than a hypothetical one.
 */
const FORBIDDEN_CLAIMS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\b(two|three|four|both|multiple|all)\s+regions?\b/i,
    why: 'implies corroboration across regions; one observation point is deployed',
  },
  {
    pattern: /\bregions?\s+(?:must\s+)?agree\b/i,
    why: 'quorum language for a rule that never executes',
  },
  {
    pattern: /\bquorum[- ]confirmed\b/i,
    why: 'incidents are confirmed by consecutive checks, not by quorum',
  },
  {
    pattern: /\bevery region you\b/i,
    why: 'the API accepts one scheduler label, not a fan-out the customer chooses',
  },
  {
    pattern: /\bfrom every region\b/i,
    why: 'there is one observation point',
  },
  {
    pattern: /\bmulti[- ]region\b/i,
    why: 'no multi-region capability exists to describe',
  },
  {
    pattern: /\bregional probes?\b/i,
    why: 'probes are not regional; region is a scheduling label',
  },
  {
    pattern: /\bacross (?:all )?regions\b/i,
    why: 'aggregating by label is not coverage across geography',
  },
  {
    pattern: /\bglobal(?:ly)? (?:confirmed|corroborated|verified)\b/i,
    why: 'claims global knowledge from a single path',
  },
];

function sourceFiles(target: string): string[] {
  const absolute = join(process.cwd(), target);
  const stat = statSync(absolute);
  if (stat.isFile()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(absolute, entry.name);
    if (entry.isDirectory()) return sourceFiles(child.slice(process.cwd().length + 1));
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')
      ? [child]
      : [];
  });
}

describe('public surfaces do not claim a topology the backend does not run', () => {
  it.each(CLAIM_SURFACES)('%s', (surface) => {
    for (const file of sourceFiles(surface)) {
      if (file.endsWith('components/site/home/__tests__')) continue;
      const source = readFileSync(file, 'utf8');
      for (const { pattern, why } of FORBIDDEN_CLAIMS) {
        const match = source.match(pattern);
        expect(
          match,
          match
            ? `${file} contains "${match[0]}" - ${why}`
            : `${file} must not claim ${pattern}`
        ).toBeNull();
      }
    }
  });

  it('keeps the docs corpus on the same rule', () => {
    const text = JSON.stringify(DOCS);
    for (const { pattern, why } of FORBIDDEN_CLAIMS) {
      // The methodology guide names the retired rule explicitly in order to
      // say it does not apply, which is the one place the phrase is required.
      const withoutRetraction = text.replace(
        /Nothing on this site or in any record claims multi-region agreement[^"]*/g,
        ''
      );
      const match = withoutRetraction.match(pattern);
      expect(match, match ? `docs corpus contains "${match[0]}" - ${why}` : 'ok').toBeNull();
    }
  });

  it('names the deployed rule id in the docs rather than describing a policy', () => {
    const text = JSON.stringify(DOCS);
    expect(text).toContain(String(DETECTION.failureChecks));
    expect(text).toContain('observation point');
  });
});

/* ── 3. Disclosure ──────────────────────────────────────────────────────── */

describe('detection is described with its limit attached', () => {
  it('says how many observation points exist, on the page that explains detection', async () => {
    // The streaming renderer, because the observatory section suspends while
    // it asks the measurement API for the vendor catalog.
    const stream = await renderToReadableStream(<HomeLanding />);
    await stream.allReady;
    const html = await new Response(stream).text();
    const text = html.replace(/<[^>]+>/g, ' ');
    expect(text).toMatch(/(one|1) observation point/i);
    // And it must not promise agreement from places that do not exist.
    expect(text).not.toMatch(/two regions/i);
    expect(text).not.toMatch(/quorum-confirmed/i);
  });
});
