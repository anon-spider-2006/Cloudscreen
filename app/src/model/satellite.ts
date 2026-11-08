/**
 * Satellite-observed cloud effect, with location privacy built in.
 *
 * WHY: Open-Meteo's cloud_cover_low/mid/high are NWP model output. They say
 * where the model put cloud, not where cloud was, and cloud fraction can't see
 * optical depth (CMF fit R² ≈ 0.35). Geostationary satellites measure surface
 * shortwave irradiance (GHI) every 10–15 min at ~5 km. The ratio to clear sky
 * captures thickness as well as cover.
 *
 * CHAIN (per satellite pixel, per hour, all on device):
 *   k_c     = GHI_sat / GHI_clear                 clear-sky index, clamped [0, KC_MAX]
 *   CMF_UV  = k_c ^ UV_SW_EXPONENT                UV is attenuated less than broadband
 *   (uvSource.ts multiplies CMF_UV by the scaled CAMS clear-sky UVI)
 *
 *   GHI_clear: the provider's value where one exists (MTG), else Haurwitz
 *   (1098 μ0 e^(−0.057/μ0)), averaged over the hour like the data.
 *
 *   UV_SW_EXPONENT and KC_MAX are FITTED to ARPANSA ground radiometers
 *   (8 Australian stations, 2024; model-fit/ground_fit.py → groundParams.ts).
 *   The fit gives p ≈ 0.88 (the earlier 0.6 guess under-attenuated UV), and a
 *   cap of 1.0: in hourly means, broken-cloud enhancement doesn't pay off.
 *
 * PRIVACY: the network only ever sees a fixed PRIVACY_CELL_DEG (~11 km) cell
 * and a fixed 5×5 lattice of points around it. That is the same request whether
 * the user shared precise GPS, coarse location or picked a city. The exact
 * point and its accuracy stay on device. Accuracy only changes how the device
 * aggregates the lattice:
 *   precise  → σ ≈ half a pixel, weighted median: effectively your pixel
 *   coarse   → σ = accuracy, a higher quantile: the clearer (higher-UV) end of
 *              what's plausible nearby. For a burn app, uncertainty should err
 *              toward more UV, not less.
 *
 * TIME: satellite is observation, not forecast. Data come at the native step
 * (10 min Himawari/MTG, 15 min MSG), ~1 h behind real time. Within observed
 * slots it is used directly; after the last one, the mean of the last
 * PERSIST_WINDOW_MIN persists with weight e^(−lag/PERSISTENCE_TAU_H), and NWP
 * takes over (see uvSource.ts). Both constants are tuned on ground data.
 */
import { GROUND_PARAMS } from './groundParams.ts';
import { DEG, solarZenithDeg } from './solar.ts';

export const PRIVACY_CELL_DEG = 0.1;
export const SAT_LATTICE_DEG = 0.05;
/** Lattice half-width in points: 5×5 = ±0.1°, covers the cell plus a margin of one cell. */
export const SAT_LATTICE_HALF = 2;
export const SAT_PIXEL_KM = 5;
/** Fitted to ARPANSA radiometers (model-fit/ground_fit.py). */
export const UV_SW_EXPONENT: number = GROUND_PARAMS.uvSwExponent;
export const KC_MAX: number = GROUND_PARAMS.kcMax;
const HOUR_MS = 3_600_000;
/** How far back a full fetch goes (covers the forecast's 2 past days for after-the-fact logging). */
export const SAT_FULL_PAST_HOURS = 50;
/** Incremental refresh window: a few hours re-fetched and merged. */
export const SAT_REFRESH_PAST_HOURS = 3;
/** Tuned on a live (latency-aware) ground backtest, see model-fit/ground_report.md. */
export const PERSISTENCE_TAU_H: number = GROUND_PARAMS.persistTauH;
export const PERSIST_WINDOW_MIN: number = GROUND_PARAMS.persistWindowMin;
/** Below this mean clear-sky GHI (low sun) k_c is too noisy to use; UV is negligible anyway. */
const MIN_CLEAR_GHI = 50;
/** A slot needs this share of lattice pixels valid to be used. */
const MIN_VALID_SHARE = 0.4;
/** Accuracy at which aggregation is fully conservative. */
const COARSE_KM = 10;
const Q_PRECISE = 0.5;
const Q_COARSE = 0.75;

export interface LatLon {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------- privacy grid

/** Centre of the fixed privacy cell containing (lat, lon). Same input cell → identical output, so repeat queries don't average out to the true point. */
export function privacyCell(lat: number, lon: number, cellDeg = PRIVACY_CELL_DEG): LatLon {
  const snap = (x: number) => Math.round(((Math.floor(x / cellDeg) + 0.5) * cellDeg) * 1e6) / 1e6;
  return { lat: snap(lat), lon: snap(lon) };
}

export const cellKey = (c: LatLon) => `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;

/** The fixed lattice requested from the provider for a cell (row-major, south→north, west→east). */
export function latticeFor(cell: LatLon, half = SAT_LATTICE_HALF, step = SAT_LATTICE_DEG): LatLon[] {
  const pts: LatLon[] = [];
  for (let i = -half; i <= half; i++)
    for (let j = -half; j <= half; j++)
      pts.push({ lat: Math.round((cell.lat + i * step) * 1e6) / 1e6, lon: Math.round((cell.lon + j * step) * 1e6) / 1e6 });
  return pts;
}

function km(a: LatLon, b: LatLon): number {
  const dy = (b.lat - a.lat) * 111.2;
  const dx = (b.lon - a.lon) * 111.2 * Math.cos(((a.lat + b.lat) / 2) * DEG);
  return Math.hypot(dx, dy);
}

// ---------------------------------------------------------------- per-pixel physics

/** Haurwitz clear-sky GHI, W/m². */
export function haurwitzGHI(szaDeg: number): number {
  const mu0 = Math.cos(szaDeg * DEG);
  return mu0 <= 0.01 ? 0 : 1098 * mu0 * Math.exp(-0.057 / mu0);
}

/** Mean clear-sky GHI over the slot centred at tCentre (satellite values are slot means). */
export function slotMeanClearGHI(tCentre: number, p: LatLon, stepMs = HOUR_MS): number {
  const N = Math.max(2, Math.round(stepMs / 600_000)); // ~10-min sub-samples
  let s = 0;
  for (let k = 0; k < N; k++) s += haurwitzGHI(solarZenithDeg(new Date(tCentre + ((k + 0.5) / N - 0.5) * stepMs), p.lat, p.lon));
  return s / N;
}

/** Hourly special case, kept for the fit pipeline. */
export const hourMeanClearGHI = (tCentre: number, p: LatLon) => slotMeanClearGHI(tCentre, p, HOUR_MS);

/** UV cloud modification factor from satellite GHI, or null when sun is too low / data missing. */
export function uvCmfFromGHI(ghi: number | null, ghiClear: number | null): number | null {
  if (ghi == null || ghiClear == null || !(ghiClear >= MIN_CLEAR_GHI)) return null;
  const kc = Math.min(KC_MAX, Math.max(0, ghi / ghiClear));
  return Math.pow(kc, UV_SW_EXPONENT);
}

// ---------------------------------------------------------------- observations

export interface SatelliteSlot {
  /** Slot centre, epoch ms. */
  t: number;
  /** CMF_UV per lattice point (same order as `points`); null = unusable. */
  cmf: (number | null)[];
}

export interface SatelliteObs {
  provider: string;
  cell: LatLon;
  points: LatLon[];
  /** Sorted by t, unique. */
  slots: SatelliteSlot[];
  /** Slot length, ms: 10 min (Himawari, MTG), 15 min (MSG) or 1 h. Absent = 1 h (older persisted data). */
  stepMs?: number;
  /** False when the provider has no satellite over this cell (e.g. North America on Open-Meteo today). */
  covered: boolean;
  fetchedAt: number;
}

const stepOf = (o: SatelliteObs) => o.stepMs ?? HOUR_MS;

type OMSatPoint = {
  hourly?: { time: string[]; shortwave_radiation?: (number | null)[]; shortwave_radiation_clear_sky?: (number | null)[] };
};

/** Build observations from per-point GHI series (times = slot centres). Exported for tests and other providers. */
export function buildSatelliteObs(
  provider: string,
  cell: LatLon,
  points: LatLon[],
  series: { time: number[]; ghi: (number | null)[]; ghiClear?: (number | null)[] }[],
  fetchedAt = Date.now(),
  stepMs = HOUR_MS,
): SatelliteObs {
  const covered = series.some((s) => s.ghi.some((v) => v != null));
  const times = series[0]?.time ?? [];
  const slots: SatelliteSlot[] = times.map((t, h) => ({
    t,
    cmf: points.map((p, i) => {
      const s = series[i];
      const ghi = s?.ghi[h] ?? null;
      const clear = s?.ghiClear?.[h] ?? (ghi == null ? null : slotMeanClearGHI(t, p, stepMs));
      return uvCmfFromGHI(ghi, clear);
    }),
  }));
  return { provider, cell, points, slots, stepMs, covered, fetchedAt };
}

/** Smallest positive spacing between consecutive labels (the native step). */
function detectStep(labels: number[]): number {
  let step = Infinity;
  for (let i = 1; i < labels.length; i++) {
    const d = labels[i] - labels[i - 1];
    if (d > 0 && d < step) step = d;
  }
  return Number.isFinite(step) ? step : HOUR_MS;
}

/**
 * Fetch the privacy-cell lattice from Open-Meteo's satellite API (one request) at
 * the satellite's native step (10–15 min). Only the cell-derived lattice is sent,
 * never the user's coordinates. `pastHours` small = incremental refresh; merge it
 * into what you have with mergeSatellite.
 */
export async function fetchSatellite(cell: LatLon, signal?: AbortSignal, pastHours = SAT_FULL_PAST_HOURS): Promise<SatelliteObs> {
  const points = latticeFor(cell);
  const url =
    `https://satellite-api.open-meteo.com/v1/archive?latitude=${points.map((p) => p.lat.toFixed(3)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(3)).join(',')}` +
    `&hourly=shortwave_radiation,shortwave_radiation_clear_sky&models=satellite_radiation_seamless` +
    `&temporal_resolution=native&past_hours=${pastHours}&forecast_hours=0&timezone=GMT`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo satellite ${res.status}`);
  const raw = (await res.json()) as OMSatPoint | OMSatPoint[];
  const arr = Array.isArray(raw) ? raw : [raw];
  const labels = (arr[0]?.hourly?.time ?? []).map((s) => Date.parse(s + 'Z'));
  const stepMs = detectStep(labels);
  const series = arr.map((r) => ({
    // label = end of the averaging step; centre is half a step earlier
    time: (r.hourly?.time ?? []).map((s) => Date.parse(s + 'Z') - stepMs / 2),
    ghi: r.hourly?.shortwave_radiation ?? [],
    ghiClear: r.hourly?.shortwave_radiation_clear_sky,
  }));
  return buildSatelliteObs('open-meteo-satellite', cell, points, series, Date.now(), stepMs);
}

/**
 * Merge an incremental fetch into existing observations for the same cell.
 * Newer non-null values win; slots older than SAT_FULL_PAST_HOURS are dropped.
 * Returns `fresh` unchanged if cell or step differ (start over).
 */
export function mergeSatellite(old: SatelliteObs | null, fresh: SatelliteObs, now = fresh.fetchedAt): SatelliteObs {
  if (!old || cellKey(old.cell) !== cellKey(fresh.cell) || stepOf(old) !== stepOf(fresh) || old.points.length !== fresh.points.length) return fresh;
  const byT = new Map<number, SatelliteSlot>();
  for (const s of old.slots) byT.set(s.t, s);
  for (const s of fresh.slots) {
    const prev = byT.get(s.t);
    byT.set(s.t, prev ? { t: s.t, cmf: s.cmf.map((v, i) => v ?? prev.cmf[i]) } : s);
  }
  const minT = now - SAT_FULL_PAST_HOURS * HOUR_MS;
  const slots = [...byT.values()].filter((s) => s.t >= minT).sort((a, b) => a.t - b.t);
  return { ...fresh, slots, covered: old.covered || fresh.covered };
}

// ---------------------------------------------------------------- spatial aggregation (on device)

export interface SpatialCMF {
  /** Value used for dose: median when precise, toward the 75th percentile when coarse. */
  cmf: number;
  /** Weighted 10th–90th percentile across plausible nearby pixels. */
  lo: number;
  hi: number;
}

function weightedQuantile(vw: [number, number][], q: number): number {
  const s = [...vw].sort((a, b) => a[0] - b[0]);
  const total = s.reduce((acc, x) => acc + x[1], 0);
  let c = 0;
  for (const [v, w] of s) {
    c += w;
    if (c >= q * total) return v;
  }
  return s[s.length - 1][0];
}

/**
 * Aggregate one slot to the user's point. σ grows with location uncertainty;
 * the quantile slides from median (precise) to Q_COARSE (≥ COARSE_KM).
 */
export function aggregateSlot(points: LatLon[], cmf: (number | null)[], at: LatLon, accuracyKm: number): SpatialCMF | null {
  const valid = cmf.filter((v) => v != null).length;
  if (valid === 0 || valid < MIN_VALID_SHARE * cmf.length) return null;
  const sigma = Math.max(SAT_PIXEL_KM / 2, accuracyKm);
  const vw: [number, number][] = [];
  points.forEach((p, i) => {
    const v = cmf[i];
    if (v == null) return;
    const d = km(at, p);
    vw.push([v, Math.exp(-(d * d) / (2 * sigma * sigma))]);
  });
  if (vw.reduce((a, x) => a + x[1], 0) < 1e-6) return null;
  const u = Math.min(1, Math.max(0, accuracyKm / COARSE_KM));
  return {
    cmf: weightedQuantile(vw, Q_PRECISE + (Q_COARSE - Q_PRECISE) * u),
    lo: weightedQuantile(vw, 0.1),
    hi: weightedQuantile(vw, 0.9),
  };
}

// ---------------------------------------------------------------- temporal

export interface SatelliteCMF extends SpatialCMF {
  /** Trust in the satellite value at t: 1 inside observed slots, decaying after the last one. */
  weight: number;
  /** Centre of the satellite slot used, epoch ms. */
  obsT: number;
}

export interface SatelliteTimeOpts {
  /** Persistence e-folding time after the last observation, hours. */
  tauH?: number;
  /** Persisted value = mean of valid slots in this window before the last one (smooths 10-min noise), minutes. */
  persistMin?: number;
  /** Backtests only: pretend slots ending after this instant haven't arrived yet. */
  cutoffT?: number;
}

interface AggSlot extends SpatialCMF {
  t: number;
  end: number;
}

/** Aggregated valid slots per (obs, point, accuracy). Obs objects are immutable, so cache by identity. */
const aggCache = new WeakMap<SatelliteObs, Map<string, AggSlot[]>>();

function aggregatedSeries(obs: SatelliteObs, at: LatLon, accuracyKm: number): AggSlot[] {
  let m = aggCache.get(obs);
  if (!m) aggCache.set(obs, (m = new Map()));
  const key = `${at.lat.toFixed(4)},${at.lon.toFixed(4)},${accuracyKm.toFixed(2)}`;
  let out = m.get(key);
  if (!out) {
    const half = stepOf(obs) / 2;
    out = [];
    for (const s of obs.slots) {
      const a = aggregateSlot(obs.points, s.cmf, at, accuracyKm);
      if (a) out.push({ ...a, t: s.t, end: s.t + half });
    }
    if (m.size > 16) m.clear();
    m.set(key, out);
  }
  return out;
}

/** First index in [0, n) with pred false→true boundary (pred must be monotone). */
function lowerBound(n: number, pred: (i: number) => boolean): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Don't interpolate across gaps longer than this (night, outage). */
const MAX_BRIDGE_MS = 2 * HOUR_MS;

/**
 * Satellite cloud factor at time t for a point with the given accuracy.
 * Inside the observed period: linear interpolation between slot centres
 * (weight 1). After the last available slot: persistence of the recent mean,
 * with weight e^(−lag/τ). Before the first slot / no coverage: null.
 */
export function satelliteCMFAt(obs: SatelliteObs, t: number, at: LatLon, accuracyKm = 0, opts: SatelliteTimeOpts = {}): SatelliteCMF | null {
  if (!obs.covered) return null;
  const { tauH = PERSISTENCE_TAU_H, persistMin = PERSIST_WINDOW_MIN, cutoffT } = opts;
  const all = aggregatedSeries(obs, at, accuracyKm);
  const n = cutoffT == null ? all.length : lowerBound(all.length, (i) => all[i].end > cutoffT);
  if (n === 0) return null;
  const half = stepOf(obs) / 2;
  const i = lowerBound(n, (k) => all[k].t >= t);
  if (i < n) {
    const s = all[i];
    const p = i > 0 ? all[i - 1] : null;
    if (p && s.t - p.t <= MAX_BRIDGE_MS) {
      const w = (t - p.t) / (s.t - p.t);
      const L = (x: number, y: number) => x + (y - x) * w;
      return { cmf: L(p.cmf, s.cmf), lo: L(p.lo, s.lo), hi: L(p.hi, s.hi), weight: 1, obsT: w < 0.5 ? p.t : s.t };
    }
    if (t >= s.t - half) return { cmf: s.cmf, lo: s.lo, hi: s.hi, weight: 1, obsT: s.t };
    return p ? persist(all, i, t, tauH, persistMin) : null; // across a night/outage: decays to nothing
  }
  return persist(all, n, t, tauH, persistMin);
}

/** Persistence from the slots before index `n` (exclusive). */
function persist(all: AggSlot[], n: number, t: number, tauH: number, persistMin: number): SatelliteCMF | null {
  const last = all[n - 1];
  if (t <= last.end) return { cmf: last.cmf, lo: last.lo, hi: last.hi, weight: 1, obsT: last.t };
  const from = last.end - persistMin * 60_000;
  let k = n - 1;
  let c = 0, lo = 0, hi = 0, m = 0;
  while (k >= 0 && all[k].end > from) {
    c += all[k].cmf;
    lo += all[k].lo;
    hi += all[k].hi;
    m++;
    k--;
  }
  if (m === 0) {
    c = last.cmf; lo = last.lo; hi = last.hi; m = 1;
  }
  const weight = Math.exp(-(t - last.end) / HOUR_MS / tauH);
  return weight < 0.02 ? null : { cmf: c / m, lo: lo / m, hi: hi / m, weight, obsT: last.t };
}
