import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { observedCadenceSeconds, type TrackTimeline } from '@/lib/track-api';

/**
 * Regression test for the probe-interval estimator.
 *
 * The fixture is not synthetic. It is the response the public measurement API
 * actually returned at 2026-09-11T11:39:46Z, read from the versioned copy under
 * `research/availability-record-audit/data/` at the repository root - the same
 * bytes the published paper quotes and the audit script re-derives from.
 *
 * That coupling is deliberate. The defect this guards against only appears when
 * the probe interval is longer than the chart resolution, and a hand-written
 * fixture almost never is: whoever writes it is thinking about the estimator,
 * not about the deployment. A captured payload cannot be simplified into
 * passing.
 *
 * Paper: /research/measurement-integrity/probe-interval-from-bucketed-telemetry
 */

const CAPTURED = new URL(
  '../../../../research/availability-record-audit/data/' +
    'reliastra-openai-timeline-1h-1m-2026-09-11T1139Z.json',
  import.meta.url
);

const captured: TrackTimeline = JSON.parse(readFileSync(CAPTURED, 'utf8'));

/** The same schedule, aggregated at five-minute resolution instead of one. */
function atFiveMinuteResolution(): TrackTimeline {
  return {
    ...captured,
    window: '24h',
    resolution: '5m',
    points: captured.points.map((p) => ({ ...p, observation_count: 1 })),
  };
}

describe('the captured series', () => {
  it('is the payload the paper quotes', () => {
    expect(captured.resolution).toBe('1m');
    expect(captured.points).toHaveLength(12);
    // Every occupied bucket holds exactly one observation - the condition that
    // makes density useless and spacing necessary.
    expect(captured.points.every((p) => p.observation_count === 1)).toBe(true);
    expect(captured.points[0].timestamp).toBe('2026-09-11T10:43:00Z');
    expect(captured.points[11].timestamp).toBe('2026-09-11T11:39:00Z');
  });

  it('carries a 300-second interval in its bucket starts', () => {
    const starts = captured.points.map((p) => Date.parse(p.timestamp));
    const deltas = starts.slice(1).map((t, i) => (t - starts[i]) / 1000);
    expect(Math.min(...deltas)).toBe(300);
    expect(Math.max(...deltas)).toBe(360);
  });
});

describe('observedCadenceSeconds', () => {
  it('reads a schedule sparser than the resolution from spacing, not density', () => {
    // The estimator this replaced returned 60 here - the bucket length - for a
    // 300-second schedule, because round(60 / mean 1.0) = 60. That is the bug.
    expect(observedCadenceSeconds(captured)).toBe(300);
  });

  it('is independent of the resolution it is fed', () => {
    const oneMinute = observedCadenceSeconds(captured);
    const fiveMinute = observedCadenceSeconds(atFiveMinuteResolution());
    expect(oneMinute).toBe(300);
    expect(fiveMinute).toBe(300);
  });

  it('still reads a schedule finer than the resolution from density', () => {
    // Two observations per one-minute bucket: a 30-second schedule. Here the
    // bucket is not a ceiling, so density carries the interval.
    const dense: TrackTimeline = {
      ...captured,
      resolution: '1m',
      points: captured.points.map((p) => ({ ...p, observation_count: 2 })),
    };
    expect(observedCadenceSeconds(dense)).toBe(30);
  });

  it('falls back to window length over count for a single observation', () => {
    const single: TrackTimeline = {
      ...captured,
      points: captured.points.slice(0, 1),
    };
    // 3600s window / 1 observation.
    expect(observedCadenceSeconds(single)).toBe(3600);
  });

  it('refuses to invent a cadence when there is nothing to measure', () => {
    expect(observedCadenceSeconds(null)).toBeNull();
    expect(observedCadenceSeconds({ ...captured, points: [] })).toBeNull();
    expect(
      observedCadenceSeconds({
        ...captured,
        points: captured.points.map((p) => ({ ...p, observation_count: 0 })),
      })
    ).toBeNull();
  });

  it('is robust to a single missed probe', () => {
    // The captured series has one 360-second gap. The median absorbs it; a
    // mean would have reported 305.5 and rounded to 306.
    expect(observedCadenceSeconds(captured)).not.toBe(306);
  });
});

/**
 * The paper on this estimator prints the corrected implementation verbatim and
 * states that the shipped function is the one under test here. If the
 * implementation drifts, the published code block becomes a description of
 * something that no longer exists - so the two are checked against each other.
 * Comments are ignored; the executable lines must be identical.
 */
describe('the code printed in the paper matches the shipped estimator', () => {
  const codeLines = (source: string) =>
    source
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('//'))
      .map((line) => line.trim())
      .join('\n');

  it('is byte-for-byte the same function, comments aside', () => {
    const impl = readFileSync(new URL('../track-api.ts', import.meta.url), 'utf8');
    const implMatch = impl.match(
      /export function observedCadenceSeconds\(timeline: TrackTimeline \| null\): number \| null \{[\s\S]*?\n\}/
    );
    expect(implMatch, 'shipped estimator not found').not.toBeNull();

    const paper = readFileSync(
      new URL('../../content/research/probe-interval-from-bucketed-telemetry.tsx', import.meta.url),
      'utf8'
    );
    const start = paper.indexOf('<PRE>{`export function observedCadenceSeconds');
    expect(start, 'paper no longer prints the estimator').toBeGreaterThan(-1);
    const from = start + '<PRE>{`'.length;
    const to = paper.indexOf('}</PRE>', from);
    expect(to, 'unterminated code block').toBeGreaterThan(from);
    // `to` is the `}` of the JSX expression, so the slice stops at the
    // function's own closing brace, before the template-literal backtick.
    const printed = paper.slice(from, to).replace(/`\s*$/, '');

    expect(codeLines(printed)).toBe(codeLines(implMatch![0]));
  });
});
