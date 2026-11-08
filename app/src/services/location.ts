import * as Location from 'expo-location';

export interface Place {
  lat: number;
  lon: number;
  name: string;
  source: 'gps' | 'manual' | 'demo';
  /**
   * Horizontal uncertainty, km. GPS: the fix's reported accuracy (large when the
   * user turned off Precise Location / granted only coarse). Manual city: the
   * user could be anywhere in town. Never sent off device.
   */
  accuracyKm?: number;
  /** Elevation above sea level, m (demo places; real places take it from the forecast). */
  elevationM?: number;
}

/** Assumed spread of a picked city (km). */
export const MANUAL_ACCURACY_KM = 10;

export const accuracyKmOf = (p: Place) => p.accuracyKm ?? (p.source === 'gps' ? 1 : p.source === 'manual' ? MANUAL_ACCURACY_KM : 0);

/** Manual choices (LOC-003) and the demo scenario. */
export const CITIES: Place[] = [
  { name: 'Troy, NY', lat: 42.7284, lon: -73.6918, source: 'manual' },
  { name: 'New York, NY', lat: 40.7128, lon: -74.006, source: 'manual' },
  { name: 'Miami, FL', lat: 25.7617, lon: -80.1918, source: 'manual' },
  { name: 'Phoenix, AZ', lat: 33.4484, lon: -112.074, source: 'manual' },
  { name: 'Denver, CO', lat: 39.7392, lon: -104.9903, source: 'manual' },
  { name: 'Seattle, WA', lat: 47.6062, lon: -122.3321, source: 'manual' },
  { name: 'London, UK', lat: 51.5072, lon: -0.1276, source: 'manual' },
  { name: 'Sydney, AU', lat: -33.8688, lon: 151.2093, source: 'manual' },
  { name: 'Mumbai, IN', lat: 19.076, lon: 72.8777, source: 'manual' },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198, source: 'manual' },
];


export type LocateResult = { ok: true; place: Place } | { ok: false; reason: 'denied' | 'unavailable' };

/** Foreground-only, coarse is enough (LOC-001, "use coarse location when sufficient"). */
export async function locate(): Promise<LocateResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { ok: false, reason: 'denied' };
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60_000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const lat = Math.round(pos.coords.latitude * 100) / 100; // ~1 km: enough for the forecast grid, avoids storing precise coords (SEC-003)
    const lon = Math.round(pos.coords.longitude * 100) / 100;
    let name = 'Current location';
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (g) name = [g.city ?? g.subregion, g.region ?? g.country].filter(Boolean).join(', ') || name;
    } catch {
      // geocoder unavailable: keep generic name
    }
    // reduced/coarse permission still returns a fix, just with a large accuracy radius; the
    // 0.01° rounding adds up to ~0.8 km, so never claim better than 1 km
    const accuracyKm = Math.max(1, (pos.coords.accuracy ?? 1000) / 1000);
    return { ok: true, place: { lat, lon, name, source: 'gps', accuracyKm } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** Distance in km, for "moved far enough to refetch" (LOC-005). */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
