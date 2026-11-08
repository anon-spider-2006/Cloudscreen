/**
 * Cloudscreen UV dose model. Pure TypeScript with no React Native imports, so
 * it runs in the app, in Node tests and in the model-fit pipeline.
 *
 *  1. clearSky.ts    Allaart clear-sky UVI (SZA from suncalc, ozone, distance, altitude)
 *  2. cmf.ts         layered cloud modification factor (fit: model-fit/)
 *  3. exposure.ts    posture geometry + ground albedo
 *  4. sunscreen.ts   SPF_eff = SPF^(a_app · a_photo(D_inc) · w(t))
 *  5. dose.ts        dose in SED, burn fraction vs MED_type × c_user
 *     calibration.ts next-day redness → c_user
 *     uvSource.ts    Open-Meteo forecast / physics / offline demo
 *     satellite.ts   satellite-observed cloud effect, privacy-cell lattice
 *     groundParams.ts fitted to ARPANSA radiometers (model-fit/ground_fit.py)
 */
export * from './solar.ts';
export * from './clearSky.ts';
export * from './cmf.ts';
export * from './exposure.ts';
export * from './sunscreen.ts';
export * from './dose.ts';
export * from './calibration.ts';
export * from './uvSource.ts';
export * from './satellite.ts';
export * from './uncertainty.ts';
export { GROUND_PARAMS, GROUND_FIT_INFO } from './groundParams.ts';
