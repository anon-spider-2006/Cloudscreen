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
