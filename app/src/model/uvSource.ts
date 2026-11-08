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
 *
 * 'forecast' mode, ground-fitted chain (model-fit/ground_fit.py, ARPANSA radiometers):
 *   clear = s · CAMS_clear   (CAMS carries forecast ozone + aerosol; Allaart at 300 DU
 *                            when CAMS is missing, e.g. beyond its ~4.5-day horizon)
 *   NWP   = clear · CMF_ground(low, mid, high)   when CAMS is present
 *         = Open-Meteo uv_index                  otherwise (legacy path)
 *   UVI   = w · clear · CMF_sat + (1 − w) · NWP
 * with w = 1 over satellite-observed hours, decaying after the last one.
 * Leave-one-station-out daily dose error: 24.8% for raw Open-Meteo UVI, 14.3%
 * for the NWP chain, 5.8% with satellite. Each term carries exactly one cloud
 * effect (ENV-009).
 *
 * 'physics' keeps its documented chain: Allaart × layered CMF (Open-Meteo fit),
 * with satellite mixed in the same way. 'demo' never uses the network.
 *
 * CAMS values (air-quality API) are instantaneous at the label time, so the hour
 * mean is the average of the hour's two edges.
 */
import { clearSkyUVIAt } from './clearSky.ts';
import { cloudModificationFactor, type CloudLayers } from './cmf.ts';
import { GROUND_PARAMS } from './groundParams.ts';
import type { ErrorClass } from './uncertainty.ts';
import type { Environment } from './dose.ts';
import { satelliteCMFAt, type SatelliteObs, type SatelliteTimeOpts } from './satellite.ts';
import { solarZenithDeg } from './solar.ts';

export interface HourlyPoint {
  /** Hour centre, epoch ms. */
  t: number;
  uvi: number;
  uviClear: number;
  clouds: CloudLayers;
  /** CAMS clear-sky UVI, hour mean, unscaled. Null/absent beyond CAMS's horizon or if that fetch failed. */
  uviClearCams?: number | null;
}

export interface Forecast {
  lat: number;
  lon: number;
  elevationM: number;
  hours: HourlyPoint[];
  fetchedAt: number;
}

const OM_VARS = 'uv_index,uv_index_clear_sky,cloud_cover_low,cloud_cover_mid,cloud_cover_high';

/** CAMS clear-sky UVI keyed by label time (epoch ms). Empty on failure: it's an enhancement. */
async function fetchCamsClear(lat: number, lon: number, signal?: AbortSignal): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  try {
    const res = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&hourly=uv_index_clear_sky&past_days=2&forecast_days=5&timezone=GMT`,
      { signal },
    );
    if (!res.ok) return m;
    const h = ((await res.json()) as { hourly: { time: string[]; uv_index_clear_sky: (number | null)[] } }).hourly;
    h.time.forEach((s, i) => {
      const v = h.uv_index_clear_sky[i];
      if (v != null) m.set(Date.parse(s + 'Z'), v);
    });
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return m;
}

export async function fetchForecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=${OM_VARS}&past_days=2&forecast_days=7&timezone=GMT`;
  const [res, cams] = await Promise.all([fetch(url, { signal }), fetchCamsClear(lat, lon, signal)]);
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
    const label = Date.parse(h.time[i] + 'Z');
    const c0 = cams.get(label - 3_600_000);
    const c1 = cams.get(label);
    hours.push({
      t: label - 1_800_000,
      uvi,
      uviClear,
      clouds: { low: low / 100, mid: mid / 100, high: high / 100 },
      uviClearCams: c0 != null && c1 != null ? (c0 + c1) / 2 : null,
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
    uviClearCams: a.uviClearCams != null && b.uviClearCams != null ? L(a.uviClearCams, b.uviClearCams) : null,
  };
}

export type UVMode = 'forecast' | 'physics' | 'demo';
/** Where the cloud effect in `uvi` came from. */
export type CloudSource = 'satellite' | 'nwp' | 'user';

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
  cloudSource: CloudSource;
  /** Weight given to the satellite (0 = none). */
  satWeight: number;
  /** Plausible UVI range from spatial spread + location uncertainty (satellite only). */
  uviRange: [number, number] | null;
  /** Centre of the satellite hour used, epoch ms. */
  satObsT: number | null;
  /** Which chain made `uvi`, for the measured error band (uncertainty.ts). Null in demo: a scenario, not an estimate. */
  errorClass: ErrorClass | null;
}

/** Forecast UVI above this multiple of our clear sky is treated as bad data. */
const SANITY_MAX_OVER_CLEAR = 1.5;

export interface UVQuery {
  t: number;
  lat: number;
  lon: number;
  altitudeKm?: number;
  ozoneDU?: number;
  /** Location uncertainty, km (0 = exact). Stays on device; only shapes satellite aggregation. */
  accuracyKm?: number;
}

export function readUV(
  q: UVQuery,
  mode: UVMode,
  src: { forecast?: Forecast; demoClouds?: CloudLayers; satellite?: SatelliteObs; satOpts?: SatelliteTimeOpts },
): UVReading {
  const date = new Date(q.t);
  const szaDeg = solarZenithDeg(date, q.lat, q.lon);
  const altitudeKm = q.altitudeKm ?? (src.forecast ? Math.max(0, src.forecast.elevationM) / 1000 : 0);
  const clear = clearSkyUVIAt(date, q.lat, q.lon, { altitudeKm, ozoneDU: q.ozoneDU });
  const hp = mode === 'demo' ? null : interp(src.forecast?.hours ?? [], q.t);
  const clouds = hp?.clouds ?? src.demoClouds ?? { low: 0, mid: 0, high: 0 };
  const cmfLayers = cloudModificationFactor(clouds);
  const sat = mode !== 'demo' && src.satellite ? satelliteCMFAt(src.satellite, q.t, q, q.accuracyKm ?? 0, src.satOpts) : null;
  const w = sat?.weight ?? 0;
  const satFields = {
    cloudSource: (mode === 'demo' ? 'user' : w > 0 ? 'satellite' : 'nwp') as CloudSource,
    satWeight: w,
    satObsT: sat?.obsT ?? null,
  };

  if (mode === 'forecast' && hp) {
    const cams = hp.uviClearCams;
    const clearRef = cams != null ? GROUND_PARAMS.camsClearScale * cams : clear;
    const cmfGround = cloudModificationFactor(hp.clouds, GROUND_PARAMS.layers);
    const uviNwp = cams != null ? clearRef * cmfGround : hp.uvi;
    const nwpCmf = cams != null ? cmfGround : hp.uviClear > 0.3 ? hp.uvi / hp.uviClear : cmfLayers;
    const bound = Math.max(clear, hp.uviClear, clearRef) * SANITY_MAX_OVER_CLEAR + 0.5;
    const blend = (cmfSat: number) => w * clearRef * cmfSat + (1 - w) * uviNwp;
    const raw = sat ? blend(sat.cmf) : uviNwp;
    const clamped = raw > bound || raw < 0;
    const fit = (x: number) => Math.min(bound, Math.max(0, x));
    const uvi = fit(raw);
    return {
      mode, szaDeg, uvi, uviClearAllaart: clear, cmfLayers, clamped,
      cmf: sat ? w * sat.cmf + (1 - w) * nwpCmf : cmfLayers,
      cmfObserved: clear > 0.3 ? uvi / clear : null,
      ...satFields,
      uviRange: sat ? [fit(blend(sat.lo)), fit(blend(sat.hi))] : null,
      errorClass: w > 0 ? 'sat' : cams != null ? 'nwp' : 'legacy',
    };
  }
  // 'physics', 'demo', or forecast unavailable → fall back to physics
  const mix = (cmfSat: number) => w * cmfSat + (1 - w) * cmfLayers;
  const cmf = sat ? mix(sat.cmf) : cmfLayers;
  return {
    mode: mode === 'forecast' ? 'physics' : mode,
    szaDeg,
    uvi: clear * cmf,
    uviClearAllaart: clear,
    cmfLayers,
    cmf,
    cmfObserved: null,
    clamped: false,
    ...satFields,
    uviRange: sat ? [clear * mix(sat.lo), clear * mix(sat.hi)] : null,
    errorClass: mode === 'demo' ? null : 'physics',
  };
}
