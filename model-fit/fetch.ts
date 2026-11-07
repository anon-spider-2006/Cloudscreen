/**
 * Stage 1 of the CMF fit: pull historical hourly UV + layered cloud cover from
 * Open-Meteo, and compute our own Allaart clear-sky UVI for every hour using
 * the exact module the app ships (app/src/model/clearSky.ts).
 *
 *   node model-fit/fetch.ts            (Node ≥ 23.6, runs TS directly)
 *
 * Writes model-fit/data/hourly.csv
 *
 * Open-Meteo hourly UV values are means over the PRECEDING hour, so we average
 * clear-sky UVI over that hour (6 sub-samples) rather than evaluating at the
 * label time (this alignment correlates better with Open-Meteo's clear-sky
 * curve than evaluating at the label: r = 0.98 vs 0.95).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allaartClearSkyUVI, type AllaartVersion } from '../app/src/model/clearSky.ts';
import { solarZenithDeg, sunEarthDistanceFactor } from '../app/src/model/solar.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

// Spread over latitude, climate, cloud regime and altitude.
const CITIES = [
  { name: 'Troy NY', lat: 42.73, lon: -73.68 },
  { name: 'Miami', lat: 25.76, lon: -80.19 },
  { name: 'Seattle', lat: 47.61, lon: -122.33 },
  { name: 'Denver', lat: 39.74, lon: -104.99 },
  { name: 'Phoenix', lat: 33.45, lon: -112.07 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'De Bilt', lat: 52.1, lon: 5.18 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Cape Town', lat: -33.92, lon: 18.42 },
  { name: 'Quito', lat: -0.18, lon: -78.47 },
];

// One window per season. Northern-hemisphere labels.
const WINDOWS = [
  ['2025-01-06', '2025-01-26'],
  ['2025-04-07', '2025-04-27'],
  ['2025-07-07', '2025-07-27'],
  ['2025-10-06', '2025-10-26'],
];

const VARS = ['uv_index', 'uv_index_clear_sky', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high'];

interface OMResponse {
  elevation: number;
  hourly: Record<string, (number | null)[]> & { time: string[] };
}

async function fetchWindow(lat: number, lon: number, start: string, end: string): Promise<OMResponse> {
  const cache = join(HERE, 'data', 'raw', `${lat}_${lon}_${start}_${end}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8')) as OMResponse;
  mkdirSync(dirname(cache), { recursive: true });
  const url =
    `https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}&hourly=${VARS.join(',')}&timezone=GMT`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const body = await res.text();
      writeFileSync(cache, body);
      return JSON.parse(body) as OMResponse;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Open-Meteo failed: ${url}`);
}

/** Mean clear-sky UVI over the hour ending at `end`. */
function hourMeanClearSky(end: Date, lat: number, lon: number, altKm: number, version: AllaartVersion): number {
  const N = 6;
  let sum = 0;
  for (let k = 0; k < N; k++) {
    const t = new Date(end.getTime() - ((k + 0.5) / N) * 3_600_000);
    sum += allaartClearSkyUVI({
      szaDeg: solarZenithDeg(t, lat, lon),
      distanceFactor: sunEarthDistanceFactor(t),
      altitudeKm: altKm,
      version,
    });
  }
  return sum / N;
}

const rows: string[] = [
  'city,time,lat,lon,elev_m,sza_mid,uvi_om,uvi_om_clear,uvi_allaart,uvi_allaart2004,c_low,c_mid,c_high',
];

for (const c of CITIES) {
  for (const [start, end] of WINDOWS) {
    const d = await fetchWindow(c.lat, c.lon, start, end);
    const h = d.hourly;
    const altKm = Math.max(0, d.elevation) / 1000;
    for (let i = 0; i < h.time.length; i++) {
      const vals = VARS.map((v) => h[v][i]);
      if (vals.some((v) => v == null)) continue;
      const [uvi, uviClear, low, mid, high] = vals as number[];
      const t = new Date(h.time[i] + 'Z');
      const mid30 = new Date(t.getTime() - 1_800_000);
      const sza = solarZenithDeg(mid30, c.lat, c.lon);
      if (sza > 85) continue;
      const allaart = hourMeanClearSky(t, c.lat, c.lon, altKm, 'temis2017');
      const allaart2004 = hourMeanClearSky(t, c.lat, c.lon, altKm, 'allaart2004');
      rows.push(
        [c.name, h.time[i], c.lat, c.lon, d.elevation, sza.toFixed(3), uvi, uviClear,
          allaart.toFixed(4), allaart2004.toFixed(4), low, mid, high].join(','),
      );
    }
    process.stdout.write('.');
  }
  console.log(` ${c.name}`);
}

mkdirSync(join(HERE, 'data'), { recursive: true });
writeFileSync(join(HERE, 'data', 'hourly.csv'), rows.join('\n') + '\n');
console.log(`wrote ${rows.length - 1} daytime hourly rows`);
