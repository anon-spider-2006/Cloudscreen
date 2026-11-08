/**
 * Personal MED calibration from next-day redness reports (c_user).
 *
 * Fitzpatrick type is a prior (Brenner & Hearing 2008: self-reported phototype is
 * not a reliable index of UVB sensitivity). After each session we ask
 * "any redness?" the NEXT MORNING. UVB erythema appears ~4 h after exposure and
 * peaks at 8–24 h, so asking that evening under-reports.
 *
 * MED is by definition the dose giving just-perceptible redness, so:
 *   'pink'   → true MED ≈ D       (c_obs = c · F)
 *   'burned' → true MED ≈ D / 2   (c_obs = c · F / 2)
 *   'none'   → true MED > D       (only informative if we predicted F ≥ 1)
 * where F = D / (MED_type · c) is the fraction we predicted. Updates are damped
 * in log space and clamped, so one odd day can't swing the model.
 */
import { MED_SED, type SkinType } from './dose.ts';

export type Redness = 'none' | 'pink' | 'burned';

export const C_USER_BOUNDS = [1 / 3, 3] as const;
const LEARN_RATE_DOWN = 0.5; // burned earlier than predicted: move decisively
const LEARN_RATE_UP = 0.25; // reached the limit with no redness: nudge
const MAX_STEP = 2; // at most ×2 or ÷2 per report
const MIN_FRACTION_FOR_REPORT = 0.15; // redness after a trivial dose is probably something else

export interface CalibrationReport {
  /** Peak burn fraction F predicted for the session (using c at the time). */
  predictedFraction: number;
  redness: Redness;
}

export function updateCUser(c: number, r: CalibrationReport): number {
  const F = r.predictedFraction;
  if (!(F > 0)) return c;
  let logStep = 0;
  if (r.redness === 'none') {
    if (F >= 1) logStep = LEARN_RATE_UP * Math.log(Math.min(F, 2));
  } else {
    if (F < MIN_FRACTION_FOR_REPORT) return c;
    const cObs = c * F * (r.redness === 'burned' ? 0.5 : 1);
    logStep = (cObs < c ? LEARN_RATE_DOWN : LEARN_RATE_UP) * Math.log(cObs / c);
  }
  logStep = Math.max(-Math.log(MAX_STEP), Math.min(Math.log(MAX_STEP), logStep));
  const next = c * Math.exp(logStep);
  return Math.min(C_USER_BOUNDS[1], Math.max(C_USER_BOUNDS[0], next));
}

/** When to ask: 9:00 local the next day, and at least 12 h after the session ended. */
export function calibrationPromptTime(sessionEnd: Date): Date {
  const d = new Date(sessionEnd);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const minT = sessionEnd.getTime() + 12 * 3_600_000;
  return new Date(Math.max(d.getTime(), minT));
}

// ---------------------------------------------------------------- Bayesian calibration
/**
 * Personal MED as a posterior, not a point.
 * (Report-noise settings: wider "robust" values were tested in
 * model-fit/calibration_sim.ts and rejected: they shrug off real redness and
 * raise over-trust when the assumptions hold. See calibration_report.md.) Replaces updateCUser in the app
 * (kept above for comparison in model-fit/calibration_sim.ts).
 *
 * PRIOR on ln M (M = personal MED, SED), per stated Fitzpatrick type k:
 *   0.70 · N(ln MED_k, σ_k²) + 0.15 · N(ln MED_{k−1}, σ²) + 0.15 · N(ln MED_{k+1}, σ²)
 *   - medians MED_k = MED_SED (dose.ts)
 *   - σ_k = 0.40 for types I–IV: measured within-type coefficients of variation
 *     are 0.3–0.5 (solar-simulator and UVB phototesting studies), i.e. σ ≈ 0.28–0.45
 *     in log units. ASSUMPTION for V–VI (no phototest spread found): 0.50.
 *   - the neighbour weights encode that self-reported type is unreliable
 *     (Brenner & Hearing 2008). ASSUMPTION: 70/15/15.
 *
 * LIKELIHOOD of a next-morning report after a day with predicted skin dose D:
 *   latent severity  e = ln D − ln M + ε,   ε ~ N(0, s²)
 *   none  if e < 0;   pink  if 0 ≤ e < ln 2;   burned  if e ≥ ln 2
 *   s² = σ_dose² + σ_report² (+ σ_sunscreen² if sunscreen was worn)
 *   - σ_dose: the measured UV error for that exposure (uncertainty.ts doseBand)
 *   - σ_report = 0.30 ASSUMPTION: how far "just pink" sits from exactly 1 MED
 *   - σ_sunscreen = 0.50 ASSUMPTION: real application varies ~0.5–2 mg/cm²
 *   - 5% of reports are treated as noise (redness from heat, rubbing, a wrong
 *     answer), so one odd morning can't swing the estimate. This replaces the old
 *     "ignore reports below 15% predicted" rule.
 *
 * POSTERIOR on a 1-D grid (exact, ~0.1 ms). Summaries: median (the estimate),
 * 10th / 90th percentiles (how sure we are). Used two ways: cUser = median / MED_k
 * keeps every existing caller working, and the log-spread feeds the time-to-burn
 * range and cautious alerts, so a new user's alerts start early and tighten as
 * check-ins come in.
 */

export const PRIOR_LOG_SIGMA: Record<SkinType, number> = { 1: 0.4, 2: 0.4, 3: 0.4, 4: 0.4, 5: 0.5, 6: 0.5 };
export const PRIOR_STATED_WEIGHT = 0.7;
export const REPORT_LOG_SIGMA = 0.3;
export const SUNSCREEN_LOG_SIGMA = 0.5;
export const REPORT_OUTLIER_P = 0.05;
/** "Burned" ≈ 2 MED (matches the old calibration rule). */
const LN_BURN = Math.log(2);

const GRID_N = 241;
const GRID_LO = Math.log(0.5);
const GRID_HI = Math.log(60);
const GRID = Array.from({ length: GRID_N }, (_, i) => GRID_LO + ((GRID_HI - GRID_LO) * i) / (GRID_N - 1));

export interface DoseReport {
  /** Predicted skin dose that day at the worst site, SED (central estimate). */
  doseSED: number;
  /** Log-SD of that dose from the UV model alone (uncertainty.ts). */
  doseLogSigma: number;
  sunscreen: boolean;
  redness: Redness;
}

export interface MedPosterior {
  /** SED. */
  median: number;
  q10: number;
  q90: number;
  /** ln(median / q10), ln(q90 / median): skin-side spread for the time-to-burn band. */
  logSpread: { lo: number; hi: number };
  /** Reports that went into it. */
  n: number;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function logPrior(skinType: SkinType): number[] {
  const comps: [number, number][] = [[skinType, PRIOR_STATED_WEIGHT]];
  const side = (1 - PRIOR_STATED_WEIGHT) / 2;
  if (skinType > 1) comps.push([skinType - 1, side]);
  if (skinType < 6) comps.push([skinType + 1, side]);
  const total = comps.reduce((a, c) => a + c[1], 0);
  return GRID.map((x) => {
    let p = 0;
    for (const [k, w] of comps) {
      const sd = PRIOR_LOG_SIGMA[k as SkinType];
      const z = (x - Math.log(MED_SED[k as SkinType])) / sd;
      p += (w / total) * Math.exp(-0.5 * z * z) / sd;
    }
    return Math.log(Math.max(p, 1e-300));
  });
}

export interface LikelihoodOpts {
  reportSigma?: number;
  sunscreenSigma?: number;
  outlierP?: number;
}

/** P(report | ln M = ·) as a function, with the per-report terms worked out once. `o`: simulation sensitivity test only. */
function likelihoodFor(r: DoseReport, o: LikelihoodOpts = {}): (x: number) => number {
  const { reportSigma = REPORT_LOG_SIGMA, sunscreenSigma = SUNSCREEN_LOG_SIGMA, outlierP = REPORT_OUTLIER_P } = o;
  const s = Math.sqrt(r.doseLogSigma ** 2 + reportSigma ** 2 + (r.sunscreen ? sunscreenSigma ** 2 : 0));
  const lnD = Math.log(Math.max(1e-6, r.doseSED));
  const red = r.redness;
  return (x) => {
    const m = lnD - x;
    const pPinkOrWorse = normCdf(m / s);
    const pBurned = normCdf((m - LN_BURN) / s);
    const p = red === 'none' ? 1 - pPinkOrWorse : red === 'pink' ? pPinkOrWorse - pBurned : pBurned;
    return (1 - outlierP) * p + outlierP / 3;
  };
}

/** P(report | ln M = x). */
export const reportLikelihood = (r: DoseReport, x: number, o?: LikelihoodOpts): number => likelihoodFor(r, o)(x);

function quantile(cdf: number[], q: number): number {
  let i = 0;
  while (i < cdf.length - 1 && cdf[i] < q) i++;
  if (i === 0) return Math.exp(GRID[0]);
  const w = (q - cdf[i - 1]) / Math.max(1e-12, cdf[i] - cdf[i - 1]);
  return Math.exp(GRID[i - 1] + (GRID[i] - GRID[i - 1]) * w);
}

/** Incremental form (used by the simulation): log-posterior on the grid. */
export const priorGrid = (skinType: SkinType): number[] => logPrior(skinType);

export function addReport(lp: number[], r: DoseReport, o?: LikelihoodOpts): number[] {
  if (!(r.doseSED > 0)) return lp;
  const L = likelihoodFor(r, o);
  for (let i = 0; i < GRID_N; i++) lp[i] += Math.log(L(GRID[i]));
  return lp;
}

export function summarize(lp: readonly number[], n: number): MedPosterior {
  const mx = Math.max(...lp);
  const w = lp.map((v) => Math.exp(v - mx));
  const total = w.reduce((a, b) => a + b, 0);
  const cdf: number[] = [];
  let c = 0;
  for (const v of w) cdf.push((c += v / total));
  const median = quantile(cdf, 0.5);
  const q10 = quantile(cdf, 0.1);
  const q90 = quantile(cdf, 0.9);
  return { median, q10, q90, logSpread: { lo: Math.log(median / q10), hi: Math.log(q90 / median) }, n };
}

export function medPosterior(skinType: SkinType, reports: readonly DoseReport[]): MedPosterior {
  const lp = logPrior(skinType);
  for (const r of reports) addReport(lp, r);
  return summarize(lp, reports.length);
}

const priorCache = new Map<SkinType, MedPosterior>();
/** Posterior with no reports (memoized). */
export function priorPosterior(skinType: SkinType): MedPosterior {
  let p = priorCache.get(skinType);
  if (!p) priorCache.set(skinType, (p = medPosterior(skinType, [])));
  return p;
}

/** The app's c_user for a posterior (keeps personalMED / burnFraction unchanged). */
export const cUserOf = (skinType: SkinType, post: MedPosterior) => post.median / MED_SED[skinType];
