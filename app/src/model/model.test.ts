// Run: npm run test:model   (node --test, Node ≥ 23.6 runs TS directly)
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALERT_THRESHOLDS,
  advance,
  aggregateSlot,
  allaartClearSkyUVI,
  GROUND_PARAMS,
  doseBand,
  medPosterior,
  MED_SED,
  normCdf,
  mergeSatellite,
  PERSISTENCE_TAU_H,
  withSpatial,
  buildSatelliteObs,
  latticeFor,
  privacyCell,
  satelliteCMFAt,
  uvCmfFromGHI,
  type SatelliteObs,
  applicationExponent,
  burnFraction,
  calibrationPromptTime,
  cloudModificationFactor,
  CMF_PARAMS,
  effectiveSPF,
  explainRate,
  geometryFactor,
  PRESETS,
  WORST_SITE_POSTURES,
  newFilm,
  newSession,
  nextHydration,
  SKIN_HYDRATION_MED_REDUCTION,
  photoRetention,
  project,
  readUV,
  solarZenithDeg,
  sunEarthDistanceFactor,
  updateCUser,
  type Environment,
  type ExposureSettings,
} from './index.ts';

const near = (a: number, b: number, tol: number, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);

test('Allaart: overhead sun, 300 DU ≈ 11–12 (both parameter sets)', () => {
  near(allaartClearSkyUVI({ szaDeg: 0 }), 11.8, 0.2, 'temis2017');
  near(allaartClearSkyUVI({ szaDeg: 0, version: 'allaart2004' }), 11.4, 0.2, '2004');
});

test('Allaart: De Bilt midsummer (SZA 29°, 330 DU) ≈ 7', () => {
  near(allaartClearSkyUVI({ szaDeg: 29, ozoneDU: 330 }), 7.1, 0.2);
});

test('Allaart: ozone sensitivity ≈ 4% UVI per 3% ozone (at moderate SZA)', () => {
  const a = allaartClearSkyUVI({ szaDeg: 30, ozoneDU: 300 });
  const b = allaartClearSkyUVI({ szaDeg: 30, ozoneDU: 309 });
  near((a - b) / a, 0.04, 0.015);
});

test('Allaart: altitude +5%/km, distance term ±3.3%', () => {
  const base = allaartClearSkyUVI({ szaDeg: 30 });
  near(allaartClearSkyUVI({ szaDeg: 30, altitudeKm: 2 }) / base, 1.1, 1e-9);
  near(sunEarthDistanceFactor(new Date('2025-01-03T12:00Z')), 1.0334, 0.001);
  near(sunEarthDistanceFactor(new Date('2025-07-04T12:00Z')), 0.9666, 0.001);
  assert.equal(allaartClearSkyUVI({ szaDeg: 95 }), 0);
});

test('suncalc: Miami July solar noon SZA ≈ 4°', () => {
  // Solar noon Miami ≈ 17:29 UTC in mid July; declination ≈ 21.5°, lat 25.76°
  near(solarZenithDeg(new Date('2025-07-15T17:29Z'), 25.76, -80.19), 4.3, 0.5);
});

test('CMF: clear = 1, full overcast = 40–50% (Σa constrained to 0.5–0.6), monotone, low > high', () => {
  assert.equal(cloudModificationFactor({ low: 0, mid: 0, high: 0 }), 1);
  const full = cloudModificationFactor({ low: 1, mid: 1, high: 1 });
  assert.ok(full >= 0.4 - 1e-9 && full <= 0.5 + 1e-9, `full overcast CMF ${full}`);
  const sum = CMF_PARAMS.a.low + CMF_PARAMS.a.mid + CMF_PARAMS.a.high;
  assert.ok(sum >= 0.5 - 1e-6 && sum <= 0.6 + 1e-6);
  assert.ok(cloudModificationFactor({ low: 1, mid: 0, high: 0 }) < cloudModificationFactor({ low: 0, mid: 0, high: 1 }));
  let prev = 1;
  for (let c = 0; c <= 1; c += 0.1) {
    const v = cloudModificationFactor({ low: c, mid: c, high: c });
    assert.ok(v <= prev + 1e-12);
    prev = v;
  }
});

test('Geometry: upright at high sun ≈ 0.3–0.45; lying ≈ 1; low sun favours vertical skin', () => {
  const up = geometryFactor({ szaDeg: 30, posture: 'upright' });
  assert.ok(up > 0.3 && up < 0.45, `upright ${up}`);
  near(geometryFactor({ szaDeg: 30, posture: 'lying' }), 1, 1e-9);
  // at SZA 75° a vertical face can receive about as much as or more than horizontal
  assert.ok(geometryFactor({ szaDeg: 75, posture: 'upright' }) > 0.5 * geometryFactor({ szaDeg: 75, posture: 'lying' }));
});

test('Albedo: snow ≈ 2–3× for vertical skin (ground fills half its view), negligible for grass', () => {
  const grass = geometryFactor({ szaDeg: 40, surface: 'grass' });
  const pave = geometryFactor({ szaDeg: 40, surface: 'pavement' });
  const snow = geometryFactor({ szaDeg: 40, surface: 'snow' });
  assert.ok(pave / grass < 1.1);
  assert.ok(snow / grass > 2 && snow / grass < 3, `snow/grass ${snow / grass}`);
  // lying flat sees no ground, so only the downwelling boost (+28%) remains
  near(geometryFactor({ szaDeg: 40, surface: 'snow', posture: 'lying' }), 1.28, 1e-9);
});

test('Shade: blocks direct beam and part of the sky; ground reflection still gets through', () => {
  const open = geometryFactor({ szaDeg: 30, posture: 'upright' });
  const umb = geometryFactor({ szaDeg: 30, posture: 'upright', shade: 'umbrella' });
  const dense = geometryFactor({ szaDeg: 30, posture: 'upright', shade: 'dense' });
  near(geometryFactor({ szaDeg: 30, posture: 'upright', shade: 'none' }), open, 1e-12);
  assert.ok(dense < umb && umb < open, `${dense} < ${umb} < ${open}`);
  // On sand an umbrella protects proportionally less than on grass (reflected UV is unshaded)
  const ratio = (s: 'grass' | 'sand') =>
    geometryFactor({ szaDeg: 30, surface: s, shade: 'umbrella' }) / geometryFactor({ szaDeg: 30, surface: s });
  assert.ok(ratio('sand') > ratio('grass'));
  // shaded dose is plumbed through advance()
  const env: Environment = { uvi: 8, szaDeg: 30, cmf: 1 };
  const x: ExposureSettings = { posture: 'upright', surface: 'grass', activity: 'dry' };
  const a = advance(newSession(0), 3600, env, x).doseSED;
  const b = advance(newSession(0), 3600, env, { ...x, shade: 'umbrella' }).doseSED;
  near(b / a, umb / open, 1e-9);
});

test('Worst site: shoulders burn before face/arms at high sun', () => {
  const env = () => ({ uvi: 8, szaDeg: 25, cmf: 1 });
  const p = { skinType: 2 as const, cUser: 1 };
  const [up, sh] = WORST_SITE_POSTURES.map(
    (posture) => project(newSession(0), env, { posture, surface: 'grass', activity: 'dry' }, p).minutesToTarget!,
  );
  assert.ok(sh < up / 2, `shoulders ${sh} vs upright ${up}`);
});

test('explainRate: factors multiply to the dose rate; presets are valid settings', () => {
  const env: Environment = { uvi: 6, szaDeg: 30, cmf: 1 };
  const film = newFilm({ spfLabel: 30, filter: 'photostable', mgPerCm2: 1, waterResistant: false, appliedAt: 0 });
  const r = explainRate(env, PRESETS.picnic, film);
  near(r.sedPerMinUnprotected, (0.025 * 6 * r.geometry * 60) / 100, 1e-12);
  near(r.sedPerMin * r.spfEff, r.sedPerMinUnprotected, 1e-12);
  near(r.sedPerMin * 10, advance(newSession(0, film), 600, env, PRESETS.picnic).doseSED, 0.01);
  for (const pr of Object.values(PRESETS)) assert.ok(geometryFactor({ szaDeg: 30, ...pr }) > 0);
});

test('Wet skin: swimming ×1/(1−0.25), sweating ×1/(1−0.16), physical dose unchanged; fades within 20 min once dry', () => {
  const env: Environment = { uvi: 8, szaDeg: 20, cmf: 1 };
  const x = (activity: 'dry' | 'sweating' | 'swimming'): ExposureSettings => ({ posture: 'lying', surface: 'grass', activity });
  const dry = advance(newSession(0), 3600, env, x('dry'));
  const swim = advance(newSession(0), 3600, env, x('swimming'));
  const sweat = advance(newSession(0), 3600, env, x('sweating'));
  near(swim.doseSED / dry.doseSED, 1 / (1 - SKIN_HYDRATION_MED_REDUCTION.swimming), 1e-9);
  near(sweat.doseSED / dry.doseSED, 1 / (1 - SKIN_HYDRATION_MED_REDUCTION.sweating), 1e-9);
  near(swim.ambientSED, dry.ambientSED, 1e-12); // the sky didn't change, only the skin
  // out of the water: elevated while drying, back to normal after 20 min
  const drying = advance(swim, 20 * 60, env, x('dry'));
  assert.equal(drying.hydration, 0);
  const dryRef = advance(dry, 20 * 60, env, x('dry'));
  const extra = drying.doseSED - swim.doseSED - (dryRef.doseSED - dry.doseSED);
  assert.ok(extra > 0, 'some extra dose while drying');
  const after = advance(drying, 600, env, x('dry'));
  near(after.doseSED - drying.doseSED, advance(dryRef, 600, env, x('dry')).doseSED - dryRef.doseSED, 1e-9);
  // sweat dries faster than a swim (less water to lose)
  assert.equal(nextHydration(SKIN_HYDRATION_MED_REDUCTION.sweating, 'dry', 13 * 60), 0);
  assert.ok(nextHydration(SKIN_HYDRATION_MED_REDUCTION.swimming, 'dry', 13 * 60) > 0);
  // older saved sessions without the field behave as dry skin
  const legacy = { t: 0, doseSED: 0, ambientSED: 0, film: null };
  near(advance(legacy, 600, env, x('dry')).doseSED, advance(newSession(0), 600, env, x('dry')).doseSED, 1e-12);
  // the "why" breakdown carries the same factor
  near(explainRate(env, x('swimming'), null).wetSkin, 1 / 0.75, 1e-12);
});

test('Sunscreen: SPF^a — 25% absorbance loss halves SPF 15', () => {
  near(Math.pow(15, 0.75), 7.6, 0.1);
});

test('Sunscreen: photodegradation reproduces Gonzalez least-stable product', () => {
  near(photoRetention(1.4, 'chemical'), 0.92, 0.02);
  near(photoRetention(7.3, 'chemical'), 0.63, 0.03);
  assert.ok(photoRetention(7.3, 'photostable') > 0.95);
});

test('Sunscreen: under-application sits between pessimistic and optimistic bounds', () => {
  const S = 30;
  const a = 0.5; // 1 mg/cm²
  const mid = Math.pow(S, applicationExponent(S, 1));
  assert.ok(mid > Math.pow(S, a) && mid < S * a, `SPF_eff ${mid}`);
  near(applicationExponent(S, 2), 1, 1e-9);
});

test('Sunscreen: wear-off — SPF decays toward 1, faster when swimming', () => {
  const app = { spfLabel: 30, filter: 'photostable' as const, mgPerCm2: 2, waterResistant: false, appliedAt: 0 };
  const env: Environment = { uvi: 0, szaDeg: 30, cmf: 1 };
  const dry: ExposureSettings = { posture: 'upright', surface: 'grass', activity: 'dry' };
  const swim: ExposureSettings = { ...dry, activity: 'swimming' };
  const s0 = newSession(0, newFilm(app));
  near(effectiveSPF(s0.film), 30, 1e-9);
  const sDry = advance(s0, 7200, env, dry);
  const sSwim = advance(s0, 7200, env, swim);
  near(effectiveSPF(sDry.film), Math.pow(30, Math.exp(-1)), 0.01); // τ = 2 h
  assert.ok(effectiveSPF(sSwim.film) < effectiveSPF(sDry.film));
});

test('Dose: 1 h at UVI 8 lying unprotected = 7.2 SED', () => {
  const s = advance(newSession(0), 3600, { uvi: 8, szaDeg: 20, cmf: 1 }, { posture: 'lying', surface: 'grass', activity: 'dry' });
  near(s.doseSED, 7.2, 1e-6); // 0.025 × 8 × 3600 / 100
});

test('Dose: type II unprotected lying at UVI 10 reaches 1 MED in 20 min; SPF 30 buys hours, not 30×', () => {
  const x: ExposureSettings = { posture: 'lying', surface: 'grass', activity: 'dry' };
  const env = () => ({ uvi: 10, szaDeg: 10, cmf: 1 });
  const p = { skinType: 2 as const, cUser: 1 };
  const bare = project(newSession(0), env, x, p, { stepMin: 1 });
  near(bare.minutesToTarget!, 20, 1.5); // 3 SED / (0.025·10 W/m²) = 1200 s
  const film = newFilm({ spfLabel: 30, filter: 'photostable', mgPerCm2: 2, waterResistant: false, appliedAt: 0 });
  const prot = project(newSession(0, film), env, x, p, { stepMin: 1 });
  // wear-off means it's much less than 30 × 20 = 600 min
  assert.ok(prot.minutesToTarget! > 60 && prot.minutesToTarget! < 600, `protected ${prot.minutesToTarget}`);
  assert.ok(burnFraction(newSession(0), p) === 0);
  assert.deepEqual([...ALERT_THRESHOLDS], [0.5, 0.8, 1]);
});

test('Calibration: burned below prediction lowers c; no redness at limit nudges up; bounded', () => {
  assert.ok(updateCUser(1, { predictedFraction: 0.6, redness: 'pink' }) < 1);
  assert.ok(updateCUser(1, { predictedFraction: 0.6, redness: 'burned' }) < updateCUser(1, { predictedFraction: 0.6, redness: 'pink' }));
  const up = updateCUser(1, { predictedFraction: 1.4, redness: 'none' });
  assert.ok(up > 1 && up < 1.2, `up ${up}`);
  assert.equal(updateCUser(1, { predictedFraction: 0.5, redness: 'none' }), 1);
  assert.equal(updateCUser(1, { predictedFraction: 0.05, redness: 'pink' }), 1);
  let c = 1;
  for (let i = 0; i < 20; i++) c = updateCUser(c, { predictedFraction: 0.2, redness: 'burned' });
  near(c, 1 / 3, 1e-9);
  const ask = calibrationPromptTime(new Date(2026, 6, 4, 15, 0));
  assert.equal(ask.getDate(), 5);
  assert.equal(ask.getHours(), 9);
});

test('UV source: demo mode is physics; forecast is not re-multiplied by CMF; sanity clamp', () => {
  const q = { t: Date.parse('2025-07-15T17:29Z'), lat: 25.76, lon: -80.19 };
  const demo = readUV(q, 'demo', { demoClouds: { low: 0, mid: 0, high: 0 } });
  assert.ok(demo.uvi > 10 && demo.uvi < 13.5, `Miami July noon ${demo.uvi}`);
  const cloudy = readUV(q, 'demo', { demoClouds: { low: 1, mid: 0, high: 0 } });
  near(cloudy.uvi, demo.uvi * cloudy.cmfLayers, 1e-9);
  const forecast = {
    lat: q.lat, lon: q.lon, elevationM: 0, fetchedAt: 0,
    hours: [{ t: q.t, uvi: 6, uviClear: 11, clouds: { low: 1, mid: 0, high: 0 } }],
  };
  const f = readUV(q, 'forecast', { forecast });
  assert.equal(f.uvi, 6);
  assert.equal(f.clamped, false);
  const bad = readUV(q, 'forecast', { forecast: { ...forecast, hours: [{ ...forecast.hours[0], uvi: 60 }] } });
  assert.ok(bad.clamped && bad.uvi < 20);
  // no forecast → physics fallback
  assert.equal(readUV(q, 'forecast', {}).mode, 'physics');
});

// ---------------------------------------------------------------- satellite + privacy

test('Privacy: every point in a cell maps to the same centre; lattice is fixed and contains the cell', () => {
  const a = privacyCell(42.7284, -73.6918);
  const b = privacyCell(42.7011, -73.6002);
  assert.deepEqual(a, b);
  assert.deepEqual(a, { lat: 42.75, lon: -73.65 });
  const pts = latticeFor(a);
  assert.equal(pts.length, 25);
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  assert.ok(Math.min(...lats) <= 42.7 && Math.max(...lats) >= 42.8);
  assert.ok(Math.min(...lons) <= -73.7 && Math.max(...lons) >= -73.6);
  // southern / western hemispheres snap too
  assert.deepEqual(privacyCell(-33.8688, 151.2093), { lat: -33.85, lon: 151.25 });
});

test('Satellite CMF (ground-fitted): clear = 1, overcast k_c 0.3 cuts UV ~60–70%, capped at k_c max, low sun unusable', () => {
  near(uvCmfFromGHI(800, 800)!, 1, 1e-12);
  near(uvCmfFromGHI(240, 800)!, Math.pow(0.3, GROUND_PARAMS.uvSwExponent), 1e-12);
  // ARPANSA fit: UV is attenuated less than broadband (p < 1) but more than the old 0.6 guess
  assert.ok(GROUND_PARAMS.uvSwExponent > 0.6 && GROUND_PARAMS.uvSwExponent < 1);
  near(uvCmfFromGHI(1200, 800)!, Math.pow(GROUND_PARAMS.kcMax, GROUND_PARAMS.uvSwExponent), 1e-12);
  assert.equal(uvCmfFromGHI(10, 30), null);
  assert.equal(uvCmfFromGHI(null, 800), null);
  // monotone in k_c
  assert.ok(uvCmfFromGHI(300, 800)! < uvCmfFromGHI(500, 800)!);
});

// Lattice where the west half is overcast (0.4) and the east half clear (1.0)
const cell = privacyCell(51.5, -0.12);
const pts = latticeFor(cell);
const split = pts.map((p) => (p.lon < cell.lon ? 0.4 : 1.0));

test('Aggregation: precise user gets their own pixel; coarse user leans to the clearer (higher-UV) side', () => {
  const west = { lat: cell.lat, lon: cell.lon - 0.1 };
  const precise = aggregateSlot(pts, split, west, 0.05)!;
  near(precise.cmf, 0.4, 1e-12);
  const coarse = aggregateSlot(pts, split, west, 15)!;
  assert.ok(coarse.cmf > precise.cmf, `coarse ${coarse.cmf} should be more conservative than ${precise.cmf}`);
  assert.ok(coarse.lo <= coarse.cmf && coarse.cmf <= coarse.hi);
  near(coarse.lo, 0.4, 1e-12);
  near(coarse.hi, 1.0, 1e-12);
  // too few valid pixels → no answer rather than a guess
  assert.equal(aggregateSlot(pts, split.map((v, i) => (i < 20 ? null : v)), west, 1), null);
});

function obsAt(t0: number, values: (number | null)[][], covered = true): SatelliteObs {
  return { provider: 'test', cell, points: pts, covered, fetchedAt: 0, slots: values.map((cmf, i) => ({ t: t0 + i * 3_600_000, cmf })) };
}

test('UV source + satellite: overrides NWP clouds in observed hours, decays back to NWP, never in demo (no CAMS → legacy path)', () => {
  const t0 = Date.parse('2025-06-21T11:30Z');
  const q = { t: t0, lat: cell.lat, lon: cell.lon + 0.02 };
  const forecast = {
    lat: cell.lat, lon: cell.lon, elevationM: 0, fetchedAt: 0,
    hours: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ t: t0 + i * 3_600_000, uvi: 7, uviClear: 7, clouds: { low: 0, mid: 0, high: 0 } })),
  };
  // NWP says clear; satellite saw thick cloud for two hours
  const sat = obsAt(t0, [pts.map(() => 0.5), pts.map(() => 0.5)]);
  const base = readUV(q, 'forecast', { forecast });
  assert.equal(base.cloudSource, 'nwp');
  assert.equal(base.uvi, 7);
  const now = readUV(q, 'forecast', { forecast, satellite: sat });
  assert.equal(now.cloudSource, 'satellite');
  // without CAMS the satellite factor multiplies Allaart clear sky
  near(now.uvi, now.uviClearAllaart * 0.5, 1e-9);
  near(now.cmf, 0.5, 1e-9);
  near(now.uviRange![0], now.uvi, 1e-9);
  near(now.uviRange![1], now.uvi, 1e-9);
  // 3.5 h after the last observation ends: weight e^(−3.5/τ), NWP takes the rest
  const later = readUV({ ...q, t: t0 + 5 * 3_600_000 }, 'forecast', { forecast, satellite: sat });
  near(later.satWeight, Math.exp(-3.5 / PERSISTENCE_TAU_H), 1e-9);
  const satTerm = later.uviClearAllaart * 0.5;
  near(later.uvi, later.satWeight * satTerm + (1 - later.satWeight) * 7, 1e-9);
  // physics mode mixes satellite CMF with layered CMF
  const phys = readUV(q, 'physics', { satellite: sat });
  near(phys.uvi, phys.uviClearAllaart * 0.5, 1e-9);
  // demo ignores satellite entirely; uncovered obs is a no-op
  assert.equal(readUV(q, 'demo', { satellite: sat, demoClouds: { low: 0, mid: 0, high: 0 } }).cloudSource, 'user');
  assert.equal(readUV(q, 'forecast', { forecast, satellite: { ...sat, covered: false } }).uvi, 7);
});

test('UV source + CAMS: clear sky = s × CAMS; NWP clouds via ground-fitted layers; satellite on top; one cloud effect each', () => {
  const t0 = Date.parse('2025-06-21T11:30Z');
  const q = { t: t0, lat: cell.lat, lon: cell.lon };
  const clouds = { low: 0.6, mid: 0.2, high: 0.5 };
  const forecast = {
    lat: cell.lat, lon: cell.lon, elevationM: 0, fetchedAt: 0,
    hours: [0, 1].map((i) => ({ t: t0 + i * 3_600_000, uvi: 4, uviClear: 7, clouds, uviClearCams: 8 })),
  };
  const clearRef = GROUND_PARAMS.camsClearScale * 8;
  const nwp = readUV(q, 'forecast', { forecast });
  near(nwp.uvi, clearRef * cloudModificationFactor(clouds, GROUND_PARAMS.layers), 1e-9);
  assert.equal(nwp.cloudSource, 'nwp');
  // satellite replaces the NWP cloud effect; it is not multiplied on top of it
  const sat = obsAt(t0, [pts.map(() => 0.7), pts.map(() => 0.7)]);
  near(readUV(q, 'forecast', { forecast, satellite: sat }).uvi, clearRef * 0.7, 1e-9);
  // CAMS missing for an hour (beyond its horizon) → raw Open-Meteo UVI, as before
  const noCams = { ...forecast, hours: forecast.hours.map((h) => ({ ...h, uviClearCams: null })) };
  assert.equal(readUV(q, 'forecast', { forecast: noCams }).uvi, 4);
});

test('Satellite native step: 10-min slots, persistence of the recent mean, latency cutoff, incremental merge', () => {
  const step = 600_000;
  const t0 = Date.parse('2025-01-10T02:05Z'); // first slot centre (Sydney-ish midday)
  // six 10-min slots: four at 0.4, then two at 1.0
  const vals = [0.4, 0.4, 0.4, 0.4, 1.0, 1.0];
  const obs: SatelliteObs = {
    provider: 'test', cell, points: pts, covered: true, fetchedAt: 0, stepMs: step,
    slots: vals.map((v, i) => ({ t: t0 + i * step, cmf: pts.map(() => v) })),
  };
  const lastEnd = t0 + 5 * step + step / 2;
  // inside the observed period: interpolated, weight 1
  const mid = satelliteCMFAt(obs, t0 + 3.5 * step, cell, 0)!;
  near(mid.cmf, 0.7, 1e-9);
  assert.equal(mid.weight, 1);
  // persistence: mean of the last `persistMin`, weight e^(−lag/τ)
  const after = satelliteCMFAt(obs, lastEnd + 3_600_000, cell, 0, { tauH: 2, persistMin: 20 })!;
  near(after.cmf, 1.0, 1e-9);
  near(after.weight, Math.exp(-0.5), 1e-9);
  near(satelliteCMFAt(obs, lastEnd + 3_600_000, cell, 0, { persistMin: 60 })!.cmf, (4 * 0.4 + 2 * 1.0) / 6, 1e-9);
  // latency cutoff hides slots that haven't arrived: last two slots unseen → persists 0.4
  const live = satelliteCMFAt(obs, lastEnd, cell, 0, { cutoffT: lastEnd - 2 * step, persistMin: 10 })!;
  near(live.cmf, 0.4, 1e-9);
  assert.ok(live.weight < 1);
  // incremental merge: newer values fill in, old slots kept, sorted, same object shape
  const older: SatelliteObs = { ...obs, slots: obs.slots.slice(0, 4), fetchedAt: t0 };
  const fresh: SatelliteObs = { ...obs, slots: obs.slots.slice(3), fetchedAt: lastEnd };
  const merged = mergeSatellite(older, fresh);
  assert.deepEqual(merged.slots.map((s) => s.t), obs.slots.map((s) => s.t));
  assert.equal(merged.fetchedAt, lastEnd);
  // different cell → start over
  assert.equal(mergeSatellite({ ...older, cell: { lat: 0, lon: 0 } }, fresh), fresh);
  // tuned constants come from the generated fit
  assert.equal(PERSISTENCE_TAU_H, GROUND_PARAMS.persistTauH);
});

test('Bayesian MED: prior per type is ordered and wide; reports move it the right way and narrow it', () => {
  const pri = ([1, 2, 3, 4, 5, 6] as const).map((k) => medPosterior(k, []));
  for (let k = 1; k < 6; k++) assert.ok(pri[k].median > pri[k - 1].median, `type ${k + 1} median above type ${k}`);
  for (const p of pri) assert.ok(p.q90 / p.q10 > 2, 'prior 80% interval spans > 2×');
  near(pri[1].median, MED_SED[2], 0.15); // stated-type median, nudged by the neighbour mixture
  const rep = (doseSED: number, redness: 'none' | 'pink' | 'burned', sunscreen = false) => ({ doseSED, doseLogSigma: 0.15, sunscreen, redness });
  // pink at 2 SED → MED ≈ 2; burned at 2 → lower still; none at 6 → higher
  const pink = medPosterior(2, [rep(2, 'pink')]);
  const burned = medPosterior(2, [rep(2, 'burned')]);
  const none = medPosterior(2, [rep(6, 'none')]);
  assert.ok(burned.median < pink.median && pink.median < pri[1].median && none.median > pri[1].median);
  // consistent evidence narrows the interval
  const many = medPosterior(2, Array.from({ length: 10 }, (_, i) => rep(2 + 0.2 * (i % 3), i % 2 ? 'pink' : 'none')));
  assert.ok(many.q90 / many.q10 < pink.q90 / pink.q10 && many.q90 / many.q10 < 1.6, `width ${many.q90 / many.q10}`);
  // sunscreen days are less informative (dose less certain)
  const ss = medPosterior(2, [rep(2, 'pink', true)]);
  assert.ok(Math.abs(Math.log(ss.median / pri[1].median)) < Math.abs(Math.log(pink.median / pri[1].median)));
  // one odd report among many can't swing it (outlier term)
  const odd = medPosterior(2, [...Array.from({ length: 8 }, () => rep(4, 'none')), rep(0.5, 'burned')]);
  assert.ok(odd.median > 3, `median ${odd.median}`);
  // the old rule is kept for comparison; the app uses the posterior
  assert.ok(updateCUser(1, { predictedFraction: 0.6, redness: 'pink' }) < 1);
  near(normCdf(0), 0.5, 1e-9);
  near(normCdf(1.2816), 0.9, 1e-4);
});

test('Dose band: hi > 1 > lo, narrows with horizon, clamps to the fitted range; spatial spread widens it', () => {
  for (const cls of ['sat', 'nwp', 'legacy', 'physics'] as const) {
    const b = doseBand(cls, 1);
    assert.ok(b.lo < 1 && b.hi > 1, cls);
    assert.deepEqual(doseBand(cls, 0.1), doseBand(cls, 0.5));
    assert.deepEqual(doseBand(cls, 20), doseBand(cls, 8));
  }
  const s = (h: number) => doseBand('sat', h);
  assert.ok(s(0.5).hi - s(0.5).lo > s(8).hi - s(8).lo);
  // exact at a fitted node, between neighbours elsewhere
  near(s(2).hi, GROUND_PARAMS.doseBand.sat.hi[2], 1e-12);
  assert.ok(s(3).hi <= Math.max(s(2).hi, s(4).hi) && s(3).hi >= Math.min(s(2).hi, s(4).hi));
  const wide = withSpatial(s(1), 6, [5, 7.5]);
  near(wide.hi, s(1).hi * 1.25, 1e-12);
  near(wide.lo, s(1).lo * (5 / 6), 1e-12);
  assert.deepEqual(withSpatial(s(1), 6, null), s(1));
  // readings say which band applies
  const q = { t: Date.parse('2025-07-15T17:29Z'), lat: 25.76, lon: -80.19 };
  assert.equal(readUV(q, 'demo', { demoClouds: { low: 0, mid: 0, high: 0 } }).errorClass, null);
  assert.equal(readUV(q, 'physics', {}).errorClass, 'physics');
});

test('Satellite obs: all-null provider response = not covered (e.g. North America today)', () => {
  const t = Date.parse('2025-06-21T11:30Z');
  const series = pts.map(() => ({ time: [t, t + 3_600_000], ghi: [null, null] }));
  const obs = buildSatelliteObs('test', cell, pts, series);
  assert.equal(obs.covered, false);
  assert.equal(satelliteCMFAt(obs, t, cell, 0), null);
  // with data, computed on device from Haurwitz clear sky: June noon London clear → CMF ≈ 1
  const clear = buildSatelliteObs('test', cell, pts, pts.map(() => ({ time: [t], ghi: [820] })));
  const v = satelliteCMFAt(clear, t, cell, 0)!;
  assert.ok(v.cmf > 0.9 && v.cmf <= 1.12, `clear-day CMF ${v.cmf}`);
});
