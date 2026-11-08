/**
 * Ground-truth backtest, stage 1: measured UV vs what the app would have said.
 *
 *   node model-fit/ground.ts            (Node ≥ 23.6, runs TS directly)
 *
 * Ground truth: ARPANSA one-minute UV Index from calibrated broadband
 * radiometers (data.gov.au, CC BY 2.5 AU). Timestamps are LOCAL STANDARD time
 * (no daylight saving). This is checked per station from the daily peak vs solar
 * noon, not assumed.
 *
 * Model side: the app's own readUV (app/src/model), fed with what the app would
 * have fetched:
 *   - Open-Meteo historical forecast (uv_index, clear-sky UV, cloud layers) at the
 *     privacy-cell centre, as the store now requests it
 *   - Open-Meteo satellite GHI on the same 5×5 privacy lattice
 * Satellite latency is simulated by hiding slots that wouldn't have arrived yet.
 *
 * CAMS (Open-Meteo air quality) values are instantaneous at the label time, so
 * the hour mean is the average of the two edges (r 0.985 vs 0.969 / 0.917 for
 * either edge alone, on clear hours).
 *
 * Writes model-fit/data/ground/hourly_ground.csv (one row per station-hour).
 *
 * LIVE simulation (data/ground/live_ground.csv): for each ground hour the app is
 * sampled every 10 min, and at each instant it sees only satellite slots that
 * ended at least LATENCY before then (measured ~55–60 min for Himawari via
 * Open-Meteo, Nov 2026). Variants: hourly vs native (10-min) data, persistence
 * τ, and the smoothing window of the persisted value.
 *
 * PROJECTION test (data/ground/proj_ground.csv): what "time to burn" does. From
 * each start t0 (every 30 min), predict dose over the next H hours using only data
 * available at t0, against measured dose from the minute data. Gives the error
 * band of a projected dose as a function of horizon, per UV source.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSatelliteObs,
  GROUND_PARAMS,
  hourMeanClearGHI,
  latticeFor,
  privacyCell,
  readUV,
  solarZenithDeg,
  type Forecast,
  type HourlyPoint,
  type SatelliteObs,
} from '../app/src/model/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, 'data', 'ground', 'raw');
mkdirSync(RAW, { recursive: true });

/** Spread over climate: tropical wet, tropical dry-winter, subtropical, temperate, Mediterranean, desert, cool maritime. */
const STATIONS = [
  { name: 'Darwin', slug: 'darwin', utcOffsetH: 9.5 },
  { name: 'Townsville', slug: 'townsville', utcOffsetH: 10 },
  { name: 'Brisbane', slug: 'brisbane', utcOffsetH: 10 },
  { name: 'Sydney', slug: 'sydney', utcOffsetH: 10 },
  { name: 'Melbourne', slug: 'melbourne', utcOffsetH: 10 },
  { name: 'Kingston', slug: 'kingston', utcOffsetH: 10 },
  { name: 'Perth', slug: 'perth', utcOffsetH: 8 },
  { name: 'Alice Springs', slug: 'alice-springs', utcOffsetH: 9.5 },
];
const YEAR = 2024;
/** Same seasonal sampling as fetch.ts (austral summer/autumn/winter/spring). */
const WINDOWS = [
  ['2024-01-08', '2024-01-28'],
  ['2024-04-08', '2024-04-28'],
  ['2024-07-08', '2024-07-28'],
  ['2024-10-07', '2024-10-27'],
];
/** Satellite delays to simulate (ms after the end of the averaging hour). 0 = hindcast / after-the-fact logging. */
const SAT_DELAYS_H = [0, 1, 2];
const COARSE_KM = 10;

interface LiveVariant {
  name: string;
  native: boolean;
  tauH: number;
  persistMin: number;
  latencyMin: number | null; // null = hindcast (everything already arrived)
}
const TAUS = [0.5, 1, 2, 3, 4, 6, 8, 12];
const LIVE: LiveVariant[] = [
  ...TAUS.map((tauH) => ({ name: `hourly_tau${tauH}`, native: false, tauH, persistMin: 60, latencyMin: 60 })),
  ...[10, 30, 60].flatMap((persistMin) =>
    TAUS.map((tauH) => ({ name: `native_w${persistMin}_tau${tauH}`, native: true, tauH, persistMin, latencyMin: 60 })),
  ),
  ...[30, 90].flatMap((latencyMin) =>
    TAUS.map((tauH) => ({ name: `native_w30_tau${tauH}_lat${latencyMin}`, native: true, tauH, persistMin: 30, latencyMin })),
  ),
  ...[30, 90].flatMap((latencyMin) =>
    TAUS.map((tauH) => ({ name: `hourly_tau${tauH}_lat${latencyMin}`, native: false, tauH, persistMin: 60, latencyMin })),
  ),
  { name: 'native_hindcast', native: true, tauH: 2, persistMin: 30, latencyMin: null },
];
const LIVE_SUBSTEPS_MIN = [5, 15, 25, 35, 45, 55];
const PROJ_H = [0.5, 1, 2, 4, 8];
const PROJ_LATENCY_MIN = 60;
const PROJ_SUBSTEP_MIN = 10;
/** Shipped persistence settings (groundParams), so the projection test scores the app as configured. */
const SHIPPED_SAT = { tauH: GROUND_PARAMS.persistTauH, persistMin: GROUND_PARAMS.persistWindowMin };

async function getCached(file: string, url: string): Promise<string> {
  const p = join(RAW, file);
  if (existsSync(p)) return readFileSync(p, 'utf8');
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const body = await res.text();
      writeFileSync(p, body);
      return body;
    }
    console.warn(`  ${res.status} ${url.slice(0, 90)}… retrying`);
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}

// ---------------------------------------------------------------- ARPANSA

interface Ground {
  lat: number;
  lon: number;
  /** epoch ms (UTC) → UVI, one-minute samples */
  minutes: Map<number, number>;
}

async function arpansa(slug: string, utcOffsetH: number): Promise<Ground> {
  const meta = JSON.parse(
    await getCached(`arpansa-${slug}-meta.json`, `https://data.gov.au/data/api/3/action/package_show?id=ultraviolet-radiation-index-${slug}`),
  ) as { result: { resources: { name: string; url: string }[] } };
  const res = meta.result.resources.find((r) => r.name.includes(`-${YEAR}`));
  if (!res) throw new Error(`no ${YEAR} file for ${slug}`);
  const csv = await getCached(`arpansa-${slug}-${YEAR}.csv`, res.url);
  const minutes = new Map<number, number>();
  let lat = NaN;
  let lon = NaN;
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [dt, la, lo, uv] = line.split(',');
    if (!uv) continue;
    const v = Number(uv);
    if (!Number.isFinite(v) || v < 0) continue;
    lat = Number(la);
    lon = Number(lo);
    // "YYYY-MM-DD HH:MM:SS" local standard → UTC
    minutes.set(Date.parse(dt.replace(' ', 'T') + 'Z') - utcOffsetH * 3_600_000, v);
  }
  return { lat, lon, minutes };
}

/** Median (daily peak − solar noon) over the clearest days, minutes. Guards the timezone assumption. */
function peakOffsetMin(g: Ground): number {
  const byDay = new Map<string, [number, number]>();
  for (const [t, v] of g.minutes) {
    const d = new Date(t + 12 * 3_600_000).toISOString().slice(0, 10); // rough local day
    const cur = byDay.get(d);
    if (!cur || v > cur[1]) byDay.set(d, [t, v]);
  }
  const days = [...byDay.values()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  // solar noon = minimum zenith within ±6 h of the observed peak
  const diffs = days.map(([t]) => {
    let best = t;
    for (let m = -360; m <= 360; m++) {
      const u = t + m * 60_000;
      if (solarZenithDeg(new Date(u), g.lat, g.lon) < solarZenithDeg(new Date(best), g.lat, g.lon)) best = u;
    }
    return (t - best) / 60_000;
  });
  diffs.sort((a, b) => a - b);
  return diffs[diffs.length >> 1];
}

/** Mean UVI over the hour ending at `labelMs` (Open-Meteo convention), or null if < 50 samples. */
function hourMean(g: Ground, labelMs: number): number | null {
  let s = 0;
  let n = 0;
  for (let k = 0; k < 60; k++) {
    const v = g.minutes.get(labelMs - (60 - k) * 60_000);
    if (v != null) {
      s += v;
      n++;
    }
  }
  return n >= 50 ? s / n : null;
}

// ---------------------------------------------------------------- Open-Meteo

const OM_VARS = 'uv_index,uv_index_clear_sky,cloud_cover_low,cloud_cover_mid,cloud_cover_high';

async function forecastWindow(lat: number, lon: number, start: string, end: string): Promise<Forecast> {
  const body = await getCached(
    `om-fc_${lat}_${lon}_${start}.json`,
    `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&start_date=${start}&end_date=${end}&hourly=${OM_VARS}&timezone=GMT`,
  );
  const j = JSON.parse(body) as { elevation: number; hourly: { time: string[] } & Record<string, (number | null)[]> };
  const h = j.hourly;
  const hours: HourlyPoint[] = [];
  for (let i = 0; i < h.time.length; i++) {
    const v = [h.uv_index[i], h.uv_index_clear_sky[i], h.cloud_cover_low[i], h.cloud_cover_mid[i], h.cloud_cover_high[i]];
    if (v.some((x) => x == null)) continue;
    const [uvi, uviClear, lo, mi, hi] = v as number[];
    hours.push({ t: Date.parse(h.time[i] + 'Z') - 1_800_000, uvi, uviClear, clouds: { low: lo / 100, mid: mi / 100, high: hi / 100 } });
  }
  return { lat, lon, elevationM: j.elevation, hours, fetchedAt: 0 };
}

/** CAMS (via Open-Meteo air quality): clear-sky UV with forecast ozone + aerosol, and all-sky UV. Keyed by label time. */
async function camsWindow(lat: number, lon: number, start: string, end: string) {
  const body = await getCached(
    `om-cams_${lat}_${lon}_${start}.json`,
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&hourly=uv_index,uv_index_clear_sky,aerosol_optical_depth&start_date=${start}&end_date=${end}&timezone=GMT`,
  );
  const h = (JSON.parse(body) as { hourly: { time: string[] } & Record<string, (number | null)[]> }).hourly;
  const m = new Map<number, { uvi: number | null; clear: number | null; aod: number | null }>();
  h.time.forEach((s, i) => m.set(Date.parse(s + 'Z'), { uvi: h.uv_index[i], clear: h.uv_index_clear_sky[i], aod: h.aerosol_optical_depth[i] }));
  return m;
}

async function satelliteWindow(cellLat: number, cellLon: number, start: string, end: string) {
  const cell = { lat: cellLat, lon: cellLon };
  const points = latticeFor(cell);
  const body = await getCached(
    `om-sat_${cellLat}_${cellLon}_${start}.json`,
    `https://satellite-api.open-meteo.com/v1/archive?latitude=${points.map((p) => p.lat.toFixed(3)).join(',')}` +
      `&longitude=${points.map((p) => p.lon.toFixed(3)).join(',')}` +
      `&hourly=shortwave_radiation&models=satellite_radiation_seamless&start_date=${start}&end_date=${end}&timezone=GMT`,
  );
  const arr = JSON.parse(body) as { hourly: { time: string[]; shortwave_radiation: (number | null)[] } }[];
  const series = arr.map((r) => ({
    time: r.hourly.time.map((s) => Date.parse(s + 'Z') - 1_800_000),
    ghi: r.hourly.shortwave_radiation,
  }));
  return { obs: buildSatelliteObs('open-meteo-satellite', cell, points, series, 0), series, points };
}

/** Native-step (10-min Himawari) lattice, as the app now fetches it. */
async function satelliteWindowNative(cellLat: number, cellLon: number, start: string, end: string) {
  const cell = { lat: cellLat, lon: cellLon };
  const points = latticeFor(cell);
  const body = await getCached(
    `om-satnative_${cellLat}_${cellLon}_${start}.json`,
    `https://satellite-api.open-meteo.com/v1/archive?latitude=${points.map((p) => p.lat.toFixed(3)).join(',')}` +
      `&longitude=${points.map((p) => p.lon.toFixed(3)).join(',')}` +
      `&hourly=shortwave_radiation&models=satellite_radiation_seamless&temporal_resolution=native` +
      `&start_date=${start}&end_date=${end}&timezone=GMT`,
  );
  const arr = JSON.parse(body) as { hourly: { time: string[]; shortwave_radiation: (number | null)[] } }[];
  const labels = arr[0].hourly.time.map((s) => Date.parse(s + 'Z'));
  let step = Infinity;
  for (let i = 1; i < labels.length; i++) step = Math.min(step, labels[i] - labels[i - 1]);
  const series = arr.map((r) => ({ time: r.hourly.time.map((s) => Date.parse(s + 'Z') - step / 2), ghi: r.hourly.shortwave_radiation }));
  return buildSatelliteObs('open-meteo-satellite', cell, points, series, 0, step);
}

/** The app's view of the satellite at time t, given a delivery delay. */
function asOf(obs: SatelliteObs, t: number, delayH: number): SatelliteObs {
  if (delayH === 0) return obs;
  const cutoff = t - delayH * 3_600_000 - 1_800_000; // slot centre + 30 min = end of hour, + delay
  return { ...obs, slots: obs.slots.filter((s) => s.t <= cutoff) };
}

// ---------------------------------------------------------------- main

const cols = [
  'city', 'time', 'lat', 'lon', 'sza',
  'uvi_ground', 'uvi_om', 'uvi_om_clear', 'uvi_allaart', 'c_low', 'c_mid', 'c_high',
  'cams_uvi', 'cams_uvi_prev', 'cams_clear', 'cams_clear_prev', 'aod',
  'ghi_sat', 'ghi_clear_haurwitz', 'kc_sat',
  'pred_forecast', 'pred_physics', 'pred_app_nwp',
  ...SAT_DELAYS_H.map((d) => `pred_sat_d${d}`), ...SAT_DELAYS_H.map((d) => `w_sat_d${d}`),
  'pred_sat_coarse', 'range_lo_coarse', 'range_hi_coarse',
];
const rows: string[] = [cols.join(',')];
const projRows: string[] = [['city', 't0', 'h', 'meas', 'sat', 'nwp', 'legacy', 'physics'].join(',')];
const liveRows: string[] = [['city', 'time', 'uvi_ground', 'pred_app_nwp', ...LIVE.map((v) => v.name)].join(',')];
const f4 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '' : x.toFixed(4));

for (const st of STATIONS) {
  const g = await arpansa(st.slug, st.utcOffsetH);
  const off = peakOffsetMin(g);
  if (Math.abs(off) > 25) throw new Error(`${st.name}: daily peak is ${off.toFixed(0)} min from solar noon; check utcOffsetH`);
  const cell = privacyCell(g.lat, g.lon);
  let n = 0;
  for (const [start, end] of WINDOWS) {
    const fc = await forecastWindow(cell.lat, cell.lon, start, end);
    const { obs, series, points } = await satelliteWindow(cell.lat, cell.lon, start, end);
    const cams = await camsWindow(cell.lat, cell.lon, start, end);
    const native = await satelliteWindowNative(cell.lat, cell.lon, start, end);
    // what the app now fetches: forecast hours carry CAMS clear-sky (hour mean of the two edges)
    const fcApp: Forecast = {
      ...fc,
      hours: fc.hours.map((h) => {
        const a = cams.get(h.t - 1_800_000)?.clear;
        const b = cams.get(h.t + 1_800_000)?.clear;
        return { ...h, uviClearCams: a != null && b != null ? (a + b) / 2 : null };
      }),
    };
    // nearest lattice pixel to the station = what a precise user gets
    const d2 = points.map((p) => (p.lat - g.lat) ** 2 + ((p.lon - g.lon) * Math.cos((g.lat * Math.PI) / 180)) ** 2);
    const iNear = d2.indexOf(Math.min(...d2));
    for (const hp of fc.hours) {
      const t = hp.t; // hour centre
      const ground = hourMean(g, t + 1_800_000);
      if (ground == null) continue;
      const q = { t, lat: g.lat, lon: g.lon, accuracyKm: 0.05 };
      const base = readUV(q, 'forecast', { forecast: fc }); // legacy: raw Open-Meteo UVI
      if (base.szaDeg > 85) continue;
      const phys = readUV(q, 'physics', { forecast: fc });
      const appNwp = readUV(q, 'forecast', { forecast: fcApp });
      const sat = SAT_DELAYS_H.map((dh) => readUV(q, 'forecast', { forecast: fcApp, satellite: asOf(obs, t, dh) }));
      const coarse = readUV({ ...q, accuracyKm: COARSE_KM }, 'forecast', { forecast: fcApp, satellite: obs });
      const cm = cams.get(t + 1_800_000);
      const cmPrev = cams.get(t - 1_800_000); // alignment unknown: keep the previous label too
      const hi = series[iNear].time.indexOf(t);
      const ghi = hi >= 0 ? series[iNear].ghi[hi] : null;
      const ghiClear = hourMeanClearGHI(t, points[iNear]);
      rows.push(
        [
          st.name, new Date(t + 1_800_000).toISOString().slice(0, 16), g.lat, g.lon, base.szaDeg.toFixed(3),
          f4(ground), f4(hp.uvi), f4(hp.uviClear), f4(base.uviClearAllaart), f4(hp.clouds.low), f4(hp.clouds.mid), f4(hp.clouds.high),
          f4(cm?.uvi), f4(cmPrev?.uvi), f4(cm?.clear), f4(cmPrev?.clear), f4(cm?.aod),
          f4(ghi), f4(ghiClear), f4(ghi != null && ghiClear > 0 ? ghi / ghiClear : null),
          f4(base.uvi), f4(phys.uvi), f4(appNwp.uvi),
          ...sat.map((r) => f4(r.uvi)), ...sat.map((r) => f4(r.satWeight)),
          f4(coarse.uvi), f4(coarse.uviRange?.[0]), f4(coarse.uviRange?.[1]),
        ].join(','),
      );
      n++;

      // live: average the app's reading over the hour, each instant seeing only what had arrived
      const live = LIVE.map((v) => {
        let sum = 0;
        for (const m of LIVE_SUBSTEPS_MIN) {
          const u = t - 1_800_000 + m * 60_000;
          const satOpts = { tauH: v.tauH, persistMin: v.persistMin, cutoffT: v.latencyMin == null ? undefined : u - v.latencyMin * 60_000 };
          sum += readUV({ ...q, t: u }, 'forecast', { forecast: fcApp, satellite: v.native ? native : obs, satOpts }).uvi;
        }
        return sum / LIVE_SUBSTEPS_MIN.length;
      });
      liveRows.push([st.name, new Date(t + 1_800_000).toISOString().slice(0, 16), f4(ground), f4(appNwp.uvi), ...live.map(f4)].join(','));
    }

    // projections from each t0, data as of t0
    const t0First = Date.parse(start + 'T00:00:00Z');
    const t0Last = Date.parse(end + 'T00:00:00Z') + 86_400_000 - 8 * 3_600_000;
    for (let t0 = t0First; t0 <= t0Last; t0 += 1_800_000) {
      if (solarZenithDeg(new Date(t0), g.lat, g.lon) > 80) continue;
      const satOpts = { ...SHIPPED_SAT, cutoffT: t0 - PROJ_LATENCY_MIN * 60_000 };
      for (const H of PROJ_H) {
        const nMin = H * 60;
        let ms = 0, mn = 0;
        for (let k = 0; k < nMin; k++) {
          const v = g.minutes.get(t0 + k * 60_000);
          if (v != null) { ms += v; mn++; }
        }
        if (mn < 0.9 * nMin) continue;
        let ps = 0, pn = 0, pl = 0, pp = 0, k = 0;
        for (let m = PROJ_SUBSTEP_MIN / 2; m < nMin; m += PROJ_SUBSTEP_MIN) {
          const u = t0 + m * 60_000;
          const q = { t: u, lat: g.lat, lon: g.lon, accuracyKm: 0.05 };
          ps += readUV(q, 'forecast', { forecast: fcApp, satellite: native, satOpts }).uvi;
          pn += readUV(q, 'forecast', { forecast: fcApp }).uvi;
          pl += readUV(q, 'forecast', { forecast: fc }).uvi;
          pp += readUV(q, 'physics', { forecast: fc }).uvi;
          k++;
        }
        // doses in UVI·hours (×0.9 = SED on a horizontal surface)
        projRows.push([st.name, new Date(t0).toISOString().slice(0, 16), H, f4((ms / mn) * H), f4((ps / k) * H), f4((pn / k) * H), f4((pl / k) * H), f4((pp / k) * H)].join(','));
      }
    }
    process.stdout.write('.');
  }
  console.log(` ${st.name}: ${n} hours, peak−noon ${off.toFixed(0)} min, cell ${cell.lat},${cell.lon}`);
}

writeFileSync(join(HERE, 'data', 'ground', 'hourly_ground.csv'), rows.join('\n') + '\n');
writeFileSync(join(HERE, 'data', 'ground', 'live_ground.csv'), liveRows.join('\n') + '\n');
writeFileSync(join(HERE, 'data', 'ground', 'proj_ground.csv'), projRows.join('\n') + '\n');
console.log(`wrote ${projRows.length - 1} projection windows`);
console.log(`wrote ${rows.length - 1} station-hours`);
