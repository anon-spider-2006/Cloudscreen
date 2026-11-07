/**
 * Step 1: clear-sky UV index from Allaart et al. (2004), "An empirical model to
 * predict the UV-index based on solar zenith angles and total ozone",
 * Meteorol. Appl. 11, 59–65. Fitted to Brewer data at De Bilt and Paramaribo.
 *
 * Stage 1 (ozone-free proxy):
 *   μ0  = cos(SZA)
 *   μx  = μ0(1 − ε) + ε
 *   UVA = (D0/D)² · S · μx · exp(−τ/μx)
 * Stage 2 (ozone):
 *   X   = 1000 · μ0 / TO
 *   UVW = UVA · (F · X^G + H/TO + J)
 *
 * Form verified against the TEMIS description of the operational product:
 * https://www.temis.nl/uvradiation/product/uvi-uvd.html (additive stage 2).
 *
 * Two parameter sets:
 *  - 'temis2017': KNMI/TEMIS v2.0 refit on more De Bilt + Paramaribo data.
 *    Output is erythemal W/m², so UVI = UVW / 0.025. DEFAULT.
 *  - 'allaart2004': the original paper's values, scaled to give UVI directly.
 *
 * Published error budget: ≲10% max without snow. Ozone sensitivity is about 4%
 * UVI per 3% ozone, so a 300 DU climatological default is acceptable. Implicit
 * aerosol: AOD(368 nm) ≈ 0.3, SSA ≈ 0.9 (TEMIS aerosol note).
 */
import { DEG, solarZenithDeg, sunEarthDistanceFactor } from './solar.ts';

export interface AllaartParams {
  S: number;
  eps: number;
  tau: number;
  F: number;
  G: number;
  H: number;
  J: number;
  toUVI: number; //multiply by this to get UVI from UVW
}

export const ALLAART_PARAMS = {
  temis2017: { S: 2.0877, tau: 1.0597, eps: 0.2755, F: 0.0477, G: 1.6325, H: 5.6499, J: 0.0485, toUVI: 1 / 0.025 },
  allaart2004: { S: 1.24, tau: 0.58, eps: 0.17, F: 2.0, G: 1.62, H: 280, J: 1.4, toUVI: 1 },
} as const satisfies Record<string, AllaartParams>;

export type AllaartVersion = keyof typeof ALLAART_PARAMS;

export const DEFAULT_OZONE_DU = 300;

// UVI increase per km of altitude when there is no snow cover (Allaart et al.)
export const ALTITUDE_GAIN_PER_KM = 0.05;

export interface ClearSkyInput {
  szaDeg: number; // solar zenith angle, degrees
  ozoneDU?: number; // total ozone column, Dobson units, default 300
  distanceFactor?: number; // (D/D_0)^2 Sun-Earth distance factor (1 at 1 AU, 0.9833–1.0167 over the year). Default 1.
  altitudeKm?: number; // altitude above sea level, km, default 0. Used to scale UVI by 5% per km.
  version?: AllaartVersion; // which parameter set to use, default 'temis2017'
}

export function allaartClearSkyUVI({
  szaDeg,
  ozoneDU = DEFAULT_OZONE_DU,
  distanceFactor = 1,
  altitudeKm = 0,
  version = 'temis2017',
}: ClearSkyInput): number {
  if (szaDeg >= 90) return 0;
  const { S, eps, tau, F, G, H, J, toUVI } = ALLAART_PARAMS[version];
  const mu0 = Math.cos(szaDeg * DEG);
  const mux = mu0 * (1 - eps) + eps;
  const uva = distanceFactor * S * mux * Math.exp(-tau / mux);
  const X = (1000 * mu0) / ozoneDU;
  const uvw = uva * (F * Math.pow(X, G) + H / ozoneDU + J);
  return uvw * toUVI * (1 + ALTITUDE_GAIN_PER_KM * Math.max(0, altitudeKm));
}

// Convenience: clear-sky UVI at a time and place (suncalc zenith + distance term).
export function clearSkyUVIAt(
  date: Date,
  lat: number,
  lon: number,
  opts: { ozoneDU?: number; altitudeKm?: number; version?: AllaartVersion } = {},
): number {
  return allaartClearSkyUVI({
    szaDeg: solarZenithDeg(date, lat, lon),
    distanceFactor: sunEarthDistanceFactor(date),
    ...opts,
  });
}
