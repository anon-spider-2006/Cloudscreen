/**
 * Solar geometry inputs. Position comes from suncalc.
 */
import { getPosition } from 'suncalc';

const DEG = Math.PI / 180;

/** Solar zenith angle in degrees (0 = directly above, 90 = horizon; >90 = below horizon). */
export function solarZenithDeg(date: Date, lat: number, lon: number): number {
  return 90 - getPosition(date, lat, lon).altitude;
}

/** Solar azimuth in degrees, north-based clockwise. */
export function solarAzimuthDeg(date: Date, lat: number, lon: number): number {
  return getPosition(date, lat, lon).azimuth;
}

/**
 * Sun–Earth distance factor (D0/D)^2. About +3.3% at perihelion (early Jan)
 * and −3.3% at aphelion (early Jul). Standard Spencer-style approximation.
 */
export function sunEarthDistanceFactor(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - start) / 86_400_000; // 0-based, fractional
  return 1 + 0.0334 * Math.cos((2 * Math.PI * (dayOfYear - 2.7)) / 365.25);
}

/** The sun's height above the horizon (degrees; negative = below) and whether it's still climbing (morning). */
export function solarPhase(date: Date, lat: number, lon: number): { elevationDeg: number; rising: boolean } {
  const z = solarZenithDeg(date, lat, lon);
  const zLater = solarZenithDeg(new Date(date.getTime() + 10 * 60_000), lat, lon);
  return { elevationDeg: 90 - z, rising: zLater < z };
}

export { DEG };
