import { describe, expect, it } from 'vitest';
import {
  GLOBE_AMBIENT_LONGITUDE_DEGREES_PER_SECOND,
  GLOBE_LONGITUDE_DEGREES_PER_SECOND,
  GLOBE_MAX_ROTATION_STEP_MS,
  advanceLongitude,
  hasPublishedCoordinates,
  normalizeLongitude,
  type ObservationPoint,
} from '../infrastructure-visualization';

function point(latitude: number | null, longitude: number | null): ObservationPoint {
  return {
    id: 'observer',
    label: 'Observation point',
    region: 'us-east',
    latitude,
    longitude,
    state: 'unknown',
    observedAt: null,
  };
}

describe('infrastructure globe geographic contract', () => {
  it('does not place a worker region label without published coordinates', () => {
    expect(hasPublishedCoordinates(point(null, null))).toBe(false);
  });

  it('accepts only valid latitude and longitude pairs', () => {
    expect(hasPublishedCoordinates(point(0, 0))).toBe(true);
    expect(hasPublishedCoordinates(point(-90, -180))).toBe(true);
    expect(hasPublishedCoordinates(point(90, 180))).toBe(true);
    expect(hasPublishedCoordinates(point(91, 0))).toBe(false);
    expect(hasPublishedCoordinates(point(0, -181))).toBe(false);
    expect(hasPublishedCoordinates(point(Number.NaN, 0))).toBe(false);
  });
});

describe('infrastructure globe rotation', () => {
  it('turns a full revolution in the documented time', () => {
    expect(360 / GLOBE_LONGITUDE_DEGREES_PER_SECOND).toBe(180);
    // The sign-in backdrop is atmosphere behind a form: it must never be the
    // faster of the two.
    expect(GLOBE_AMBIENT_LONGITUDE_DEGREES_PER_SECOND).toBeLessThan(
      GLOBE_LONGITUDE_DEGREES_PER_SECOND,
    );
    expect(360 / GLOBE_AMBIENT_LONGITUDE_DEGREES_PER_SECOND).toBe(360);
  });

  it('is frame-rate independent, so capped redraws keep the same wall-clock rate', () => {
    const oneLongFrame = advanceLongitude(0, 100, GLOBE_LONGITUDE_DEGREES_PER_SECOND);
    const sixShortFrames = [0, 1, 2, 3, 4, 5].reduce(
      (degrees) => advanceLongitude(degrees, 100 / 6, GLOBE_LONGITUDE_DEGREES_PER_SECOND),
      0,
    );
    expect(sixShortFrames).toBeCloseTo(oneLongFrame, 9);
    expect(oneLongFrame).toBeCloseTo(0.2, 9);
  });

  it('wraps longitude into [0, 360) instead of drifting out of range', () => {
    expect(advanceLongitude(359.9, 100, GLOBE_LONGITUDE_DEGREES_PER_SECOND)).toBeCloseTo(0.1, 9);
    expect(normalizeLongitude(-18)).toBe(342);
    expect(normalizeLongitude(720)).toBe(0);
    expect(normalizeLongitude(Number.NaN)).toBe(0);
  });

  it('spends a stalled frame at the normal rate rather than teleporting', () => {
    const stalled = advanceLongitude(0, 30_000, GLOBE_LONGITUDE_DEGREES_PER_SECOND);
    const clamped = advanceLongitude(
      0,
      GLOBE_MAX_ROTATION_STEP_MS,
      GLOBE_LONGITUDE_DEGREES_PER_SECOND,
    );
    expect(stalled).toBeCloseTo(clamped, 9);
    // Unclamped, the same 30-second gap would have carried the globe 60°.
    expect(stalled).toBeLessThanOrEqual(1);
  });

  it('never rewinds on a zero, negative or non-finite delta', () => {
    expect(advanceLongitude(42, 0, GLOBE_LONGITUDE_DEGREES_PER_SECOND)).toBe(42);
    expect(advanceLongitude(42, -16, GLOBE_LONGITUDE_DEGREES_PER_SECOND)).toBe(42);
    expect(advanceLongitude(42, Number.NaN, GLOBE_LONGITUDE_DEGREES_PER_SECOND)).toBe(42);
    expect(advanceLongitude(42, 16, Number.NaN)).toBe(42);
  });
});
