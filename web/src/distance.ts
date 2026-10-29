// Haversine distance, mirroring internal/domain/geo.go. This is used only for
// the UI's "how far is this point from the hospital" hint; the server remains
// the authority for the LOCATION_DEVIATION flag.

export interface LatLng {
  lat: number;
  lng: number;
}

/** IUGG mean Earth radius, identical to the Go implementation. */
export const EARTH_RADIUS_METERS = 6371008.8;

/** The server's default compliance radius, used for the UI warning. */
export const LOCATION_LIMIT_METERS = 500;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const values = [a.lat, a.lng, b.lat, b.lng];
  if (!values.every((value) => Number.isFinite(value))) return Number.NaN;

  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  let h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  // Rounding can push h a hair above 1 for antipodal points, which would
  // otherwise produce NaN — same guard as the Go implementation.
  if (h > 1) h = 1;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
