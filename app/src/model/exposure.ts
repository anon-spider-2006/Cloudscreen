/**
 * Step 3: exposure geometry and ground albedo.
 *
 * UVI is defined on a horizontal surface. Skin is not horizontal, so the
 * erythemal irradiance on skin is
 *
 *   E = 0.025 · UVI · G      [W/m², erythemally weighted]
 *
 * G treats the exposed site as a surface tilted β from horizontal, averaged over
 * all azimuths (people turn around). Global horizontal UV is split into direct
 * and isotropic-diffuse parts. For erythemal UV, diffuse dominates except near
 * overhead sun:
 *
 *   G = [f_dir · R_dir(β, θ)  +  (1 − f_dir) · (1 + cos β)/2  +  ρ · (1 − cos β)/2] · K_snow
 *
 *   R_dir   = ⟨max(0, cosθ cosβ + sinθ sinβ cosφ)⟩_φ / cosθ   (direct-beam tilt ratio)
 *   f_dir   = 0.6 · μ0^0.8 · CMF          (assumption: clouds remove direct first)
 *   ρ       = surface UV albedo
 *   K_snow  = 1 + 0.35ρ for snow only     (multiple reflection boosts downwelling
 *                                           UV; ρ = 0.8 → +28%, the figure reported
 *                                           by Allaart et al.)
 *
 * Albedo only matters for snow, sand and water. Grass and pavement reflect a few
 * percent of UV. Don't oversell the surface picker.
 *
 * Shade: a shade structure blocks the direct beam entirely and a fraction of
 * the diffuse sky. ASSUMPTION: the sky term is scaled by a visible-sky factor
 * V (umbrella 0.5, dense canopy 0.3). Ground reflection is left unshaded because
 * the surrounding ground is usually still sunlit, which is why shade at the beach
 * protects much less than people expect.
 *
 *   G_shade = [V · (1 − f_dir) · (1 + cos β)/2  +  ρ · (1 − cos β)/2] · K_snow
 */
import { DEG } from './solar.ts';

export const SURFACES = {
  grass: { albedo: 0.02, label: 'Grass / soil' },
  pavement: { albedo: 0.07, label: 'Pavement / concrete' },
  water: { albedo: 0.08, label: 'Open water' },
  sand: { albedo: 0.2, label: 'Dry sand' },
  snow: { albedo: 0.8, label: 'Fresh snow' },
} as const;
export type Surface = keyof typeof SURFACES;

/** Tilt β of the most relevant exposed skin, degrees from horizontal. */
export const POSTURES = {
  /** Upright: face, arms, torso are near vertical. Default. */
  upright: 90,
  /** Shoulders, top of head and nose bridge, the first sites to burn when upright. */
  shoulders: 20,
  /** Lying on a towel facing up. */
  lying: 0,
} as const;
export type Posture = keyof typeof POSTURES;

/** Visible-sky factor V for diffuse UV under shade. Direct beam is blocked whenever shaded. Assumptions, not fits. */
export const SHADES = {
  none: { skyView: 1, label: 'Open sun' },
  umbrella: { skyView: 0.5, label: 'Umbrella / awning' },
  dense: { skyView: 0.3, label: 'Dense trees / covered porch' },
} as const;
export type Shade = keyof typeof SHADES;

/** Fraction of global horizontal erythemal UV that arrives as direct beam. */
export function directFraction(szaDeg: number, cmf = 1): number {
  if (szaDeg >= 90) return 0;
  const mu0 = Math.cos(szaDeg * DEG);
  return 0.6 * Math.pow(mu0, 0.8) * Math.min(1, Math.max(0, cmf));
}

/** Azimuth-averaged ratio of direct irradiance on a β-tilted plane to a horizontal one. */
export function directTiltRatio(szaDeg: number, tiltDeg: number): number {
  const th = szaDeg * DEG;
  const be = tiltDeg * DEG;
  const mu0 = Math.cos(th);
  if (mu0 <= 0.01) return 0;
  const N = 72;
  let sum = 0;
  for (let k = 0; k < N; k++) {
    const phi = ((k + 0.5) / N) * 2 * Math.PI;
    sum += Math.max(0, mu0 * Math.cos(be) + Math.sin(th) * Math.sin(be) * Math.cos(phi));
  }
  return sum / N / mu0;
}

export interface GeometryInput {
  szaDeg: number;
  posture?: Posture;
  /** Overrides posture with an explicit tilt, degrees. */
  tiltDeg?: number;
  surface?: Surface;
  /** Cloud modification factor; shifts the direct/diffuse split. */
  cmf?: number;
  /** Shade over the person. Default 'none'. */
  shade?: Shade;
}

export function geometryFactor({ szaDeg, posture = 'upright', tiltDeg, surface = 'grass', cmf = 1, shade = 'none' }: GeometryInput): number {
  if (szaDeg >= 90) return 0;
  const beta = (tiltDeg ?? POSTURES[posture]) * DEG;
  const rho = SURFACES[surface].albedo;
  const fDir = directFraction(szaDeg, cmf);
  const direct = shade === 'none' ? fDir * directTiltRatio(szaDeg, beta / DEG) : 0;
  const sky = direct + SHADES[shade].skyView * (1 - fDir) * (1 + Math.cos(beta)) / 2;
  const ground = rho * (1 - Math.cos(beta)) / 2;
  const kSnow = surface === 'snow' ? 1 + 0.35 * rho : 1;
  return (sky + ground) * kSnow;
}

/** Erythemal irradiance on skin, W/m². */
export function skinIrradiance(uvi: number, g: number): number {
  return 0.025 * Math.max(0, uvi) * g;
}
