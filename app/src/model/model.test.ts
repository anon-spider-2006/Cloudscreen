// Run: npm run test:model   (node --test, Node ≥ 23.6 runs TS directly)
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALERT_THRESHOLDS,
  advance,
  allaartClearSkyUVI,
  applicationExponent,
  burnFraction,
  calibrationPromptTime,
  cloudModificationFactor,
  CMF_PARAMS,
  effectiveSPF,
  geometryFactor,
  newFilm,
  newSession,
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
