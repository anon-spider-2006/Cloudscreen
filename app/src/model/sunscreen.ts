/**
 * Step 4: sunscreen film.
 *
 *   SPF_eff = SPF_label ^ (a_app · a_photo(D_inc) · w(t))
 *
 * Why an exponent: transmission T = 10^(−A), SPF ≈ 1/T, so if absorbance falls
 * to a fraction a of its initial value, SPF_eff = SPF^a. A 25% absorbance loss
 * takes SPF 15 to ≈7.6: small degradation, large loss of protection.
 *
 * a_app   under-application. Applied amount m vs the 2 mg/cm² test standard.
 *         Exponent model SPF^(m/2) is the pessimistic bound and linear SPF·m/2
 *         the optimistic one. ASSUMPTION: we take their geometric mean.
 * a_photo photodegradation, driven by UV dose incident on the film (not clock
 *         time). Gonzalez et al. 2007: the least stable product (EHMC + BMDBM,
 *         i.e. octinoxate + avobenzone) fell from 0.92 to 0.63 UVB absorbance
 *         between 1.4 and 7.3 SED. a = a∞ + (1 − a∞)e^(−k·D) with a∞ = 0.4,
 *         k = 0.12/SED reproduces that (0.91, 0.65). Stable products stay near 1.
 * w(t)    wear-off from rubbing, sweat and water. NOT from Gonzalez (which only
 *         measured photostability). ASSUMPTION: exponential with τ = 2 h when dry,
 *         faster when sweating or swimming.
 */

export const STANDARD_APPLICATION_MG_CM2 = 2;
/** What people typically apply (Gonzalez used 0.5; surveys report 0.5–1.0). */
export const DEFAULT_APPLICATION_MG_CM2 = 1;

export const FILTER_TYPES = {
  /** Mineral (ZnO/TiO₂) or modern stabilized organic filters. */
  photostable: { aInf: 0.95, k: 0.05, label: 'Mineral / photostable' },
  /** Unstabilized avobenzone + octinoxate, the Gonzalez worst case. */
  chemical: { aInf: 0.4, k: 0.12, label: 'Chemical (avobenzone/octinoxate)' },
} as const;
export type FilterType = keyof typeof FILTER_TYPES;

export const WEAR_TAU_HOURS = 2;
/** Wear-rate multipliers (assumptions, not literature fits). */
export const ACTIVITIES = {
  dry: 1,
  sweating: 2,
  swimming: 4,
} as const;
export type Activity = keyof typeof ACTIVITIES;
/** "Water resistant (40/80 min)" labels: halve the extra wear from water and sweat. */
const WATER_RESISTANT_EXTRA_FACTOR = 0.5;

export function applicationExponent(spfLabel: number, mgPerCm2: number): number {
  if (spfLabel <= 1) return 1;
  const a = Math.min(1, Math.max(1e-3, mgPerCm2 / STANDARD_APPLICATION_MG_CM2));
  // log SPF_eff = ½[a·ln S + ln(S·a)]  →  exponent = ½(a + 1 + ln a / ln S)
  return Math.max(0, 0.5 * (a + 1 + Math.log(a) / Math.log(spfLabel)));
}

export function photoRetention(incidentSED: number, filter: FilterType): number {
  const { aInf, k } = FILTER_TYPES[filter];
  return aInf + (1 - aInf) * Math.exp(-k * Math.max(0, incidentSED));
}

export function wearRate(activity: Activity, waterResistant: boolean): number {
  const m = ACTIVITIES[activity];
  return waterResistant ? 1 + (m - 1) * WATER_RESISTANT_EXTRA_FACTOR : m;
}

export function wearRetention(effectiveHours: number): number {
  return Math.exp(-Math.max(0, effectiveHours) / WEAR_TAU_HOURS);
}

export interface SunscreenApplication {
  spfLabel: number;
  filter: FilterType;
  mgPerCm2: number;
  waterResistant: boolean;
  appliedAt: number; // epoch ms
}

/** Mutable film state, advanced by the dose integrator. */
export interface FilmState {
  app: SunscreenApplication;
  /** Erythemal dose that has hit the film since application, SED (unattenuated). */
  incidentSED: number;
  /** Wear clock: hours × activity-rate multiplier. */
  wearHours: number;
}

export function newFilm(app: SunscreenApplication): FilmState {
  return { app, incidentSED: 0, wearHours: 0 };
}

export function filmExponent(f: FilmState): number {
  return (
    applicationExponent(f.app.spfLabel, f.app.mgPerCm2) *
    photoRetention(f.incidentSED, f.app.filter) *
    wearRetention(f.wearHours)
  );
}

export function effectiveSPF(f: FilmState | null): number {
  if (!f) return 1;
  return Math.max(1, Math.pow(f.app.spfLabel, filmExponent(f)));
}
