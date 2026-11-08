/**
 * How wrong a projected UV dose can be, from the ground-truth backtest.
 *
 * model-fit/ground.ts projects dose 0.5–8 h ahead from each start time using only
 * data available then, and compares with ARPANSA radiometers. doseBand gives the
 * 10th/90th percentile of measured/predicted for that horizon and UV source:
 * the measured dose fell between lo × predicted and hi × predicted 80% of the time
 * (≈79% on held-out stations, worse at some single stations; see
 * model-fit/ground_report.md).
 *
 * Errors shrink with horizon (passing clouds average out), so short exposures get
 * the widest band. The band covers UV only, not skin sensitivity or sunscreen.
 */
import { GROUND_PARAMS } from './groundParams.ts';

/** Which chain produced the UVI. Each has its own measured error. */
export type ErrorClass = 'sat' | 'nwp' | 'legacy' | 'physics';

export interface DoseBand {
  /** Measured / predicted, 10th percentile (< 1). */
  lo: number;
  /** Measured / predicted, 90th percentile (> 1). Cautious multiplier. */
  hi: number;
}

/** Band for a projection `hours` long. Log-linear in horizon, clamped to the fitted 0.5–8 h. */
export function doseBand(cls: ErrorClass, hours: number): DoseBand {
  const { h, lo, hi } = GROUND_PARAMS.doseBand[cls];
  const x = Math.log(Math.min(h[h.length - 1], Math.max(h[0], hours)));
  let i = 0;
  while (i < h.length - 2 && x > Math.log(h[i + 1])) i++;
  const w = (x - Math.log(h[i])) / (Math.log(h[i + 1]) - Math.log(h[i]));
  const L = (a: readonly number[]) => a[i] + (a[i + 1] - a[i]) * w;
  return { lo: L(lo), hi: L(hi) };
}

/**
 * Add skin uncertainty (posterior log-spread of personal MED, calibration.ts) to
 * a UV band. Independent errors: combine in quadrature in log space.
 */
export function withSkin(b: DoseBand, skin?: { lo: number; hi: number }): DoseBand {
  if (!skin) return b;
  return {
    lo: Math.exp(-Math.hypot(Math.log(b.lo), skin.hi)), // optimistic: MED at its high end
    hi: Math.exp(Math.hypot(Math.log(b.hi), skin.lo)), // cautious: MED at its low end
  };
}

/**
 * Widen a band by spatial spread (coarse location: the plausible UVI range across
 * nearby satellite pixels, from UVReading.uviRange). Multiplicative, so conservative.
 */
export function withSpatial(b: DoseBand, uvi: number, range: [number, number] | null): DoseBand {
  if (!range || !(uvi > 0.1)) return b;
  return { lo: b.lo * Math.min(1, range[0] / uvi), hi: b.hi * Math.max(1, range[1] / uvi) };
}
