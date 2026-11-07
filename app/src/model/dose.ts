/**
 * Step 5: dose integration and burn threshold.
 *
 *   E(t)       = 0.025 · UVI(t) · G(t)                       [W/m²]
 *   D          = (1/100) ∫ E / SPF_eff dt                     [SED; 1 SED = 100 J/m²]
 *   fraction   = D / (MED_type × c_user)
 *
 * MED by Fitzpatrick type is a PRIOR. Brenner & Hearing (2008): darker skin needs
 * 3–4× the dose to reach 1 MED, melanin protection is at most 10–15×, and
 * phototype is self-reported and unreliable, so c_user is calibrated from
 * next-day redness (calibration.ts). Our I→VI span is 4×.
 */
import { skinIrradiance, geometryFactor, type Posture, type Surface } from './exposure.ts';
import { effectiveSPF, wearRate, type Activity, type FilmState } from './sunscreen.ts';

export type SkinType = 1 | 2 | 3 | 4 | 5 | 6;

/** Minimal erythemal dose, SED. Central values. */
export const MED_SED: Record<SkinType, number> = { 1: 2.5, 2: 3, 3: 4, 4: 5, 5: 7, 6: 10 };
/** Brenner & Hearing: even the darkest skin shows DNA damage at or below 1 MED. */
export const DNA_DAMAGE_WARNING_TYPES: readonly SkinType[] = [5, 6];
/** Notification thresholds on the burn fraction. */
export const ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

export interface SkinProfile {
  skinType: SkinType;
  /** Personal calibration multiplier on MED (1 = prior). */
  cUser: number;
}

export function personalMED(p: SkinProfile): number {
  return MED_SED[p.skinType] * p.cUser;
}

/** Instantaneous conditions at the user's location. */
export interface Environment {
  uvi: number;
  szaDeg: number;
  /** Cloud modification factor (used for the direct/diffuse split only, never re-applied to uvi). */
  cmf: number;
}

export interface ExposureSettings {
  posture: Posture;
  surface: Surface;
  activity: Activity;
}

export interface SessionState {
  t: number; // epoch ms
  /** Dose on skin under sunscreen, SED. */
  doseSED: number;
  /** Unprotected ambient dose at the skin site, SED (for display). */
  ambientSED: number;
  film: FilmState | null;
}

export function newSession(t: number, film: FilmState | null = null): SessionState {
  return { t, doseSED: 0, ambientSED: 0, film };
}

const MAX_SUBSTEP_S = 60;

/**
 * Advance the session by dtSec under constant environment `env`. Pure: returns
 * a new state. Sub-steps so film degradation and dose stay coupled.
 */
export function advance(s: SessionState, dtSec: number, env: Environment, x: ExposureSettings): SessionState {
  const g = geometryFactor({ szaDeg: env.szaDeg, posture: x.posture, surface: x.surface, cmf: env.cmf });
  const E = skinIrradiance(env.uvi, g); // W/m²
  let { doseSED, ambientSED } = s;
  let film = s.film ? { ...s.film } : null;
  let remaining = Math.max(0, dtSec);
  while (remaining > 0) {
    const h = Math.min(MAX_SUBSTEP_S, remaining);
    const incident = (E * h) / 100; // SED arriving at the film/skin
    if (film) {
      // midpoint: degrade half a step, evaluate SPF, then the other half
      const half = { ...film, incidentSED: film.incidentSED + incident / 2, wearHours: film.wearHours + (h / 7200) * wearRate(x.activity, film.app.waterResistant) };
      doseSED += incident / effectiveSPF(half);
      film = { ...film, incidentSED: film.incidentSED + incident, wearHours: film.wearHours + (h / 3600) * wearRate(x.activity, film.app.waterResistant) };
    } else {
      doseSED += incident;
    }
    ambientSED += incident;
    remaining -= h;
  }
  return { t: s.t + dtSec * 1000, doseSED, ambientSED, film };
}

export function burnFraction(s: SessionState, p: SkinProfile): number {
  return s.doseSED / personalMED(p);
}

export interface Projection {
  /** Minutes from s.t until fraction reaches `target`, or null within horizon. */
  minutesToTarget: number | null;
  /** Fraction at end of horizon. */
  fractionAtHorizon: number;
  /** Sampled [epoch ms, fraction, SPF_eff] every `sampleMin` minutes. */
  timeline: [number, number, number][];
}

/** Forward-simulate staying outside, using a forecast `envAt(t)`. */
export function project(
  s: SessionState,
  envAt: (t: number) => Environment,
  x: ExposureSettings,
  p: SkinProfile,
  { target = 1, horizonMin = 12 * 60, stepMin = 2, sampleMin = 10 } = {},
): Projection {
  let cur = s;
  let hit: number | null = burnFraction(cur, p) >= target ? 0 : null;
  const timeline: [number, number, number][] = [[cur.t, burnFraction(cur, p), effectiveSPF(cur.film)]];
  for (let m = stepMin; m <= horizonMin; m += stepMin) {
    cur = advance(cur, stepMin * 60, envAt(cur.t + stepMin * 30_000), x);
    const f = burnFraction(cur, p);
    if (hit === null && f >= target) hit = m;
    if (m % sampleMin === 0) timeline.push([cur.t, f, effectiveSPF(cur.film)]);
  }
  return { minutesToTarget: hit, fractionAtHorizon: burnFraction(cur, p), timeline };
}
