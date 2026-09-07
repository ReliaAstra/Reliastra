/**
 * Observation-region metadata.
 *
 * The API returns region *codes* (`us-east-1`, `eu-west-1`, ...) - the same
 * identifiers the check workers are scheduled against. This module maps a code
 * to its published location so the record can say *where* an observation came
 * from, and plot it honestly.
 *
 * Two rules:
 *  - This is reference data about a region identifier, not a measurement. It
 *    never adds, softens or infers anything about the vendor.
 *  - An unrecognised code is returned as itself with no location. It is listed
 *    in the region table and omitted from the plot, and the plot caption says
 *    how many regions could be placed. Guessing a coordinate would be
 *    fabricating the observation topology.
 */

export interface RegionInfo {
  /** The raw code exactly as the API returned it. */
  code: string;
  /** Published location, or null when the code is not one we can place. */
  place: string | null;
  /** Degrees north, -90..90. */
  lat: number | null;
  /** Degrees east, -180..180. */
  lon: number | null;
}

const CATALOG: Record<string, { place: string; lat: number; lon: number }> = {
  // North America
  'us-east-1': { place: 'N. Virginia, US', lat: 38.95, lon: -77.45 },
  'us-east-2': { place: 'Ohio, US', lat: 40.0, lon: -83.0 },
  'us-east': { place: 'Eastern United States', lat: 38.95, lon: -77.45 },
  'us-west-1': { place: 'N. California, US', lat: 37.35, lon: -121.96 },
  'us-west-2': { place: 'Oregon, US', lat: 45.87, lon: -119.69 },
  'us-west': { place: 'Western United States', lat: 45.87, lon: -119.69 },
  'us-central-1': { place: 'Iowa, US', lat: 41.26, lon: -95.94 },
  'ca-central-1': { place: 'Montréal, Canada', lat: 45.5, lon: -73.57 },
  // South America
  'sa-east-1': { place: 'São Paulo, Brazil', lat: -23.55, lon: -46.63 },
  // Europe
  'eu-west-1': { place: 'Dublin, Ireland', lat: 53.35, lon: -6.26 },
  'eu-west-2': { place: 'London, United Kingdom', lat: 51.51, lon: -0.13 },
  'eu-west-3': { place: 'Paris, France', lat: 48.86, lon: 2.35 },
  'eu-west': { place: 'Western Europe', lat: 53.35, lon: -6.26 },
  'eu-central-1': { place: 'Frankfurt, Germany', lat: 50.11, lon: 8.68 },
  'eu-north-1': { place: 'Stockholm, Sweden', lat: 59.33, lon: 18.07 },
  'eu-south-1': { place: 'Milan, Italy', lat: 45.46, lon: 9.19 },
  // Africa & Middle East
  'af-south-1': { place: 'Cape Town, South Africa', lat: -33.92, lon: 18.42 },
  'af-west-1': { place: 'Lagos, Nigeria', lat: 6.52, lon: 3.38 },
  'me-south-1': { place: 'Bahrain', lat: 26.07, lon: 50.56 },
  'me-central-1': { place: 'Dubai, UAE', lat: 25.2, lon: 55.27 },
  // Asia Pacific
  'ap-south-1': { place: 'Mumbai, India', lat: 19.08, lon: 72.88 },
  'ap-southeast-1': { place: 'Singapore', lat: 1.35, lon: 103.82 },
  'ap-southeast-2': { place: 'Sydney, Australia', lat: -33.87, lon: 151.21 },
  'ap-northeast-1': { place: 'Tokyo, Japan', lat: 35.68, lon: 139.69 },
  'ap-northeast-2': { place: 'Seoul, South Korea', lat: 37.57, lon: 126.98 },
  'ap-east-1': { place: 'Hong Kong', lat: 22.32, lon: 114.17 },
};

export function regionInfo(code: string): RegionInfo {
  const hit = CATALOG[code.toLowerCase()];
  if (!hit) return { code, place: null, lat: null, lon: null };
  return { code, place: hit.place, lat: hit.lat, lon: hit.lon };
}

export function regionInfos(codes: string[]): RegionInfo[] {
  return codes.map(regionInfo);
}

/** `38.95° N, 77.45° W` - the coordinate as it is printed in the record. */
export function formatCoordinate(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}
