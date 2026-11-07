/**
 * Where UVI(t) comes from.
 *
 *  'forecast' Open-Meteo uv_index (already includes clouds). The fitted CMF is
 *             computed for display and for the direct/diffuse split, but NOT
 *             applied to UVI a second time.
 *  'physics'  Our own chain: Allaart clear-sky × fitted CMF(low, mid, high), with
 *             only cloud layers taken from the forecast.
 *  'demo'     Fully offline: Allaart clear-sky × CMF from user-chosen clouds.
 *             Physics, not fake numbers ("Miami, July, noon").
 *
 * Open-Meteo hourly UV values are means over the PRECEDING hour; we interpolate
 * linearly between hour centres.
 */
import { clearSkyUVIAt } from './clearSky.ts';
import { cloudModificationFactor, type CloudLayers } from './cmf.ts';
import type { Environment } from './dose.ts';
import { solarZenithDeg } from './solar.ts';

export interface HourlyPoint {
  /** Hour centre, epoch ms. */
  t: number;
  uvi: number;
  uviClear: number;
  clouds: CloudLayers;
}

export interface Forecast {
  lat: number;
  lon: number;
  elevationM: number;
  hours: HourlyPoint[];
  fetchedAt: number;
}

const OM_VARS = 'uv_index,uv_index_clear_sky,cloud_cover_low,cloud_cover_mid,cloud_cover_high';

export async function fetchForecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=${OM_VARS}&past_days=1&forecast_days=2&timezone=GMT`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = (await res.json()) as {
    elevation: number;
    hourly: { time: string[] } & Record<string, (number | null)[]>;
  };
  const h = j.hourly;
  const hours: HourlyPoint[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const vals = [h.uv_index[i], h.uv_index_clear_sky[i], h.cloud_cover_low[i], h.cloud_cover_mid[i], h.cloud_cover_high[i]];
    if (vals.some((v) => v == null)) continue;
    const [uvi, uviClear, low, mid, high] = vals as number[];
    hours.push({
      t: Date.parse(h.time[i] + 'Z') - 1_800_000,
      uvi,
      uviClear,
      clouds: { low: low / 100, mid: mid / 100, high: high / 100 },
    });
  }
  return { lat, lon, elevationM: j.elevation, hours, fetchedAt: Date.now() };
}

function interp(hours: HourlyPoint[], t: number): HourlyPoint | null {
  if (hours.length === 0) return null;
  if (t <= hours[0].t) return hours[0];
  const last = hours[hours.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = hours.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (hours[m].t <= t) lo = m;
    else hi = m;
  }
  const a = hours[lo];
  const b = hours[hi];
  const w = (t - a.t) / (b.t - a.t);
  const L = (x: number, y: number) => x + (y - x) * w;
  return {
    t,
    uvi: L(a.uvi, b.uvi),
    uviClear: L(a.uviClear, b.uviClear),
    clouds: { low: L(a.clouds.low, b.clouds.low), mid: L(a.clouds.mid, b.clouds.mid), high: L(a.clouds.high, b.clouds.high) },
  };
}

export type UVMode = 'forecast' | 'physics' | 'demo';

export interface UVReading extends Environment {
  mode: UVMode;
  /** Our Allaart clear-sky UVI. */
  uviClearAllaart: number;
  /** Fitted layered CMF. */
  cmfLayers: number;
  /** Forecast UVI / our clear-sky (display only; includes model disagreement). */
  cmfObserved: number | null;
  /** Forecast value was outside physical bounds and was clamped. */
  clamped: boolean;
}

/** Forecast UVI above this multiple of our clear sky is treated as bad data. */
const SANITY_MAX_OVER_CLEAR = 1.5;

export interface UVQuery {
  t: number;
  lat: number;
  lon: number;
  altitudeKm?: number;
  ozoneDU?: number;
}

export function readUV(q: UVQuery, mode: UVMode, src: { forecast?: Forecast; demoClouds?: CloudLayers }): UVReading {
  const date = new Date(q.t);
  const szaDeg = solarZenithDeg(date, q.lat, q.lon);
  const altitudeKm = q.altitudeKm ?? (src.forecast ? Math.max(0, src.forecast.elevationM) / 1000 : 0);
  const clear = clearSkyUVIAt(date, q.lat, q.lon, { altitudeKm, ozoneDU: q.ozoneDU });
  const hp = mode === 'demo' ? null : interp(src.forecast?.hours ?? [], q.t);
  const clouds = hp?.clouds ?? src.demoClouds ?? { low: 0, mid: 0, high: 0 };
  const cmfLayers = cloudModificationFactor(clouds);

  if (mode === 'forecast' && hp) {
    const bound = Math.max(clear, hp.uviClear) * SANITY_MAX_OVER_CLEAR + 0.5;
    const clamped = hp.uvi > bound || hp.uvi < 0;
    const uvi = Math.min(bound, Math.max(0, hp.uvi));
    return {
      mode, szaDeg, uvi, uviClearAllaart: clear, cmfLayers, clamped,
      cmf: cmfLayers,
      cmfObserved: clear > 0.3 ? uvi / clear : null,
    };
  }
  // 'physics', 'demo', or forecast unavailable → fall back to physics
  return {
    mode: mode === 'forecast' ? 'physics' : mode,
    szaDeg,
    uvi: clear * cmfLayers,
    uviClearAllaart: clear,
    cmfLayers,
    cmf: cmfLayers,
    cmfObserved: null,
    clamped: false,
  };
}
