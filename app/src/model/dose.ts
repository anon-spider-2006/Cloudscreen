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
 *
 * Wet skin burns sooner. Water soaked into the outer skin layer reflects and
 * scatters less UV, so the MED drops while skin is wet:
 *   - swimming: 25%. 5% salt water lowered MED by 23.4% (Gambichler & Schröpl
 *     1998, n = 24) and 31% (130 → 90 mJ/cm², Schempp et al. 1999, n = 12).
 *     Tap water and 4% NaCl both lower it too; near-saturated brine and Dead Sea
 *     water don't (Boer et al. 1982). So at sea-water strength (~3.5%) this is
 *     wetness, not salt: sea, lake and pool get the same factor.
 *   - sweating: 16%, the median after 15 min jogging or 10 min sauna (Moehrle
 *     et al. 2000, n = 22; mean 17%, up to 41%).
 *   - drying: the effect was gone after 20 min of drying (Boer 1982, tap water).
 *     ASSUMPTION: it fades linearly, so fully wet skin is back to normal in 20 min.
 *   - ASSUMPTION: a swimming outing keeps the skin wet throughout (in and out of
 *     the water). The UV that water absorbs while you're submerged is NOT
 *     modelled, so overall this errs toward more dose.
 * Applied as a dose multiplier 1/(1 − r) on skin dose, so burnFraction stays
 * dose ÷ dry-skin MED and calibration keeps learning the dry-skin MED.
 */
import { skinIrradiance, geometryFactor, type Posture, type Shade, type Surface } from './exposure.ts';
import { effectiveSPF, wearRate, type Activity, type FilmState } from './sunscreen.ts';

/** MED reduction while the skin is wet, by activity (see header). */
export const SKIN_HYDRATION_MED_REDUCTION: Record<Activity, number> = { dry: 0, sweating: 0.16, swimming: 0.25 };
/** Fully wet (swimming) skin is back to normal after this long dry. */
export const SKIN_DRYING_MIN = 20;
const DRY_RATE_PER_S = SKIN_HYDRATION_MED_REDUCTION.swimming / (SKIN_DRYING_MIN * 60);

/** Next hydration level after `dtSec` doing `activity`: wetting is immediate, drying linear. */
export function nextHydration(level: number, activity: Activity, dtSec: number): number {
  const target = SKIN_HYDRATION_MED_REDUCTION[activity];
  return target >= level ? target : Math.max(target, level - DRY_RATE_PER_S * dtSec);
}

/** Dose multiplier for a hydration level (the MED is that much lower). */
export const hydrationMultiplier = (level: number) => 1 / (1 - Math.min(0.9, Math.max(0, level)));

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
  /**
   * How unsure we are about this person's MED: ln(median/q10), ln(q90/median) of
   * the Bayesian posterior (calibration.ts). Widens the time-to-burn range and
   * makes alerts earlier until check-ins narrow it. Absent = no skin term.
   */
  medLogSpread?: { lo: number; hi: number };
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
  /** Default 'none'. */
  shade?: Shade;
}

/** One-tap settings bundles for common outings. */
export const PRESETS = {
  walk: { label: 'Walk / errands', posture: 'upright', surface: 'pavement', activity: 'dry', shade: 'none' },
  run: { label: 'Run / cycle', posture: 'upright', surface: 'pavement', activity: 'sweating', shade: 'none' },
  picnic: { label: 'Park / picnic', posture: 'upright', surface: 'grass', activity: 'dry', shade: 'none' },
  beach: { label: 'Beach', posture: 'lying', surface: 'sand', activity: 'swimming', shade: 'none' },
  pool: { label: 'Pool / lake', posture: 'lying', surface: 'water', activity: 'swimming', shade: 'none' },
  ski: { label: 'Ski / snow', posture: 'upright', surface: 'snow', activity: 'sweating', shade: 'none' },
} as const satisfies Record<string, ExposureSettings & { label: string }>;
export type Preset = keyof typeof PRESETS;

/** Sites tracked in parallel for the "burns first" display. Upright = face/arms, shoulders = top surfaces. */
export const WORST_SITE_POSTURES: readonly Posture[] = ['upright', 'shoulders'];

export interface SessionState {
  t: number; // epoch ms
  /** Dose on skin under sunscreen, SED. */
  doseSED: number;
  /** Unprotected ambient dose at the skin site, SED (for display). */
  ambientSED: number;
  film: FilmState | null;
  /** Current MED reduction from wet skin, 0–1 (absent on older saved sessions = 0). */
  hydration?: number;
  /** Dose bare skin would have got (wet-skin factor included, no sunscreen), SED. Absent on older sessions. */
  bareSED?: number;
}

export function newSession(t: number, film: FilmState | null = null): SessionState {
  return { t, doseSED: 0, ambientSED: 0, film, hydration: 0, bareSED: 0 };
}

const MAX_SUBSTEP_S = 60;

/**
 * Advance the session by dtSec under constant environment `env`. Pure: returns
 * a new state. Sub-steps so film degradation and dose stay coupled.
 */
export function advance(s: SessionState, dtSec: number, env: Environment, x: ExposureSettings): SessionState {
  const g = geometryFactor({ szaDeg: env.szaDeg, posture: x.posture, surface: x.surface, cmf: env.cmf, shade: x.shade });
  const E = skinIrradiance(env.uvi, g); // W/m²
  let { doseSED, ambientSED } = s;
  let hydration = s.hydration ?? 0;
  let bareSED = s.bareSED ?? s.ambientSED;
  let film = s.film ? { ...s.film } : null;
  let remaining = Math.max(0, dtSec);
  while (remaining > 0) {
    const h = Math.min(MAX_SUBSTEP_S, remaining);
    const incident = (E * h) / 100; // SED arriving at the film/skin
    // wet skin: wetting is immediate; drying uses the substep's midpoint level
    const next = nextHydration(hydration, x.activity, h);
    const wet = hydrationMultiplier(next >= hydration ? next : (hydration + next) / 2);
    hydration = next;
    if (film) {
      // midpoint: degrade half a step, evaluate SPF, then the other half
      const half = { ...film, incidentSED: film.incidentSED + incident / 2, wearHours: film.wearHours + (h / 7200) * wearRate(x.activity, film.app.waterResistant) };
      doseSED += (incident * wet) / effectiveSPF(half);
      film = { ...film, incidentSED: film.incidentSED + incident, wearHours: film.wearHours + (h / 3600) * wearRate(x.activity, film.app.waterResistant) };
    } else {
      doseSED += incident * wet;
    }
    ambientSED += incident; // physical dose, unaffected by skin state
    bareSED += incident * wet;
    remaining -= h;
  }
  return { t: s.t + dtSec * 1000, doseSED, ambientSED, film, hydration, bareSED };
}

/** Every factor behind the current dose rate, for the "Why this number?" panel. */
export interface RateBreakdown {
  uvi: number;
  geometry: number;
  spfEff: number;
  /** Wet-skin dose multiplier at steady state for the activity (1 = dry). */
  wetSkin: number;
  /** SED per minute on skin, unprotected and under the current film. */
  sedPerMinUnprotected: number;
  sedPerMin: number;
}

export function explainRate(env: Environment, x: ExposureSettings, film: FilmState | null): RateBreakdown {
  const geometry = geometryFactor({ szaDeg: env.szaDeg, posture: x.posture, surface: x.surface, cmf: env.cmf, shade: x.shade });
  const spfEff = effectiveSPF(film);
  const wetSkin = hydrationMultiplier(SKIN_HYDRATION_MED_REDUCTION[x.activity]);
  const sedPerMinUnprotected = ((skinIrradiance(env.uvi, geometry) * 60) / 100) * wetSkin;
  return { uvi: env.uvi, geometry, spfEff, wetSkin, sedPerMinUnprotected, sedPerMin: sedPerMinUnprotected / spfEff };
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
