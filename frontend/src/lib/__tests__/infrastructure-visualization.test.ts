import { describe, expect, it } from 'vitest';
import { hasPublishedCoordinates, type ObservationPoint } from '../infrastructure-visualization';

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
