/**
 * Step 2: cloud modification factor from layered cloud cover.
 *
 *   CMF = 1 − Σᵢ aᵢ · cᵢ^bᵢ,  i ∈ {low, mid, high},  cᵢ ∈ [0, 1]
 *
 * Parameters are fitted in model-fit/fit.py with Σaᵢ ∈ [0.5, 0.6] (full overcast
 * gives 50–60% reduction, Allaart et al. 2004).
 *
 * Fit target is Open-Meteo model output (uv_index / uv_index_clear_sky), NOT
 * ground radiometers. Known limitation: CMF ≤ 1 by construction, so broken-cloud
 * enhancement (UVI briefly above clear sky) is not represented.
 */
import { CMF_PARAMS } from './cmfParams.ts';

export interface CloudLayers {
  /** Fractions in [0, 1]. Open-Meteo returns percent: divide by 100. */
  low: number;
  mid: number;
  high: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function cloudModificationFactor(c: CloudLayers, params = CMF_PARAMS): number {
  const { a, b } = params;
  const reduction =
    a.low * Math.pow(clamp01(c.low), b.low) +
    a.mid * Math.pow(clamp01(c.mid), b.mid) +
    a.high * Math.pow(clamp01(c.high), b.high);
  return clamp01(1 - reduction);
}

export { CMF_PARAMS };
export { CMF_FIT_INFO } from './cmfParams.ts';
