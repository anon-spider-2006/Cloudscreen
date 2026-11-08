// Run: npm run test:model   (covers src/model and src/engine)
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fmtBurnRange } from '../utils/format.ts';
import { sunColorFor } from '../utils/sun-color.ts';
import { buildDemo, DEMO_MOMENTS, DEMO_NUDGES, DEMO_PROFILE } from '../demo/mackenzie.ts';
import { cUserOf, project, solarPhase } from '../model/index.ts';
import {
  answerCheckIn,
  applySunscreen,
  activityLabel,
  bandFor,
  calibrate,
  describeSettings,
  presetMatching,
  sitesFor,
  rangeNarrowing,
  readAt,
  skinDose,
  skinLearning,
  sunscreenHabit,
  sunscreenSeconds,
  weekCompare,
  cautiousFactor,
  changeSettings,
  checkInForDay,
  currentFraction,
  envAtFor,
  localDayKey,
  newlyCrossed,
  planDay,
  replaySession,
  setStatus,
  settingsForPreset,
  startSession,
  stepSession,
  summarizeDays,
  timeToBurnNow,
  type UVContext,
} from './index.ts';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);

// Miami, 15 July 2025, demo mode (physics, clear sky): deterministic and offline.
const NOON = Date.parse('2025-07-15T17:30Z');
const ctx: UVContext = { lat: 25.76, lon: -80.19, mode: 'demo', demoClouds: { low: 0, mid: 0, high: 0 } };
const profile = { skinType: 2 as const, cUser: 1 };
const app = { spfLabel: 30, filter: 'photostable' as const, mgPerCm2: 1, waterResistant: false, appliedAt: NOON };

test('session: tracks face/arms and shoulders; shoulders become worst; pause stops dose', () => {
  const envAt = envAtFor(ctx);
  let s = startSession(NOON, 'walk', 'none', profile);
  assert.deepEqual(Object.keys(s.sites).sort(), ['shoulders', 'upright']);
  s = stepSession(s, NOON + 20 * 60_000, envAt, profile);
  assert.equal(s.worstSite, 'shoulders');
  const f = currentFraction(s, profile).fraction;
  assert.ok(f > 0.3, `fraction ${f}`);
  s = setStatus(s, NOON + 20 * 60_000, 'paused');
  const paused = stepSession(s, NOON + 60 * 60_000, envAt, profile);
  assert.equal(currentFraction(paused, profile).fraction, f);
  assert.equal(paused.outdoorSeconds, s.outdoorSeconds);
});

test('session: equal-length steps match one long step (integration is time-based, not tick-based)', () => {
  const envAt = envAtFor(ctx);
  const a = stepSession(startSession(NOON, 'picnic', 'none', profile), NOON + 3_600_000, envAt, profile);
  let b = startSession(NOON, 'picnic', 'none', profile);
  for (let i = 1; i <= 240; i++) b = stepSession(b, NOON + i * 15_000, envAt, profile);
  const fa = currentFraction(a, profile).fraction;
  const fb = currentFraction(b, profile).fraction;
  assert.ok(Math.abs(fa - fb) / fa < 0.01, `${fa} vs ${fb}`);
});

test('session: sunscreen slows accumulation; changing to lying keeps dose', () => {
  const envAt = envAtFor(ctx);
  const bare = stepSession(startSession(NOON, 'walk', 'none', profile), NOON + 30 * 60_000, envAt, profile);
  const prot = stepSession(applySunscreen(startSession(NOON, 'walk', 'none', profile), app), NOON + 30 * 60_000, envAt, profile);
  assert.ok(currentFraction(prot, profile).fraction < currentFraction(bare, profile).fraction / 3);
  const before = currentFraction(bare, profile).fraction;
  const lying = changeSettings(bare, bare.lastT, settingsForPreset('beach'), 'beach');
  assert.deepEqual(Object.keys(lying.sites), ['lying']);
  assert.ok(Math.abs(currentFraction(lying, profile).fraction - before) < 1e-9);
});

test('alerts: each threshold fires once', () => {
  const s = startSession(NOON, 'walk', 'none', profile);
  assert.deepEqual(newlyCrossed(s, 0.85), [0.5, 0.8]);
  assert.deepEqual(newlyCrossed({ ...s, thresholdsFired: [0.5, 0.8] }, 0.85), []);
});

test('time to burn now: shoulders first; sunscreen extends; prior dose shortens', () => {
  const settings = settingsForPreset('walk');
  const t = timeToBurnNow({ now: NOON, ctx, profile, settings, sunscreen: app });
  assert.equal(t.bareWorst.site, 'shoulders');
  assert.ok(t.bareWorst.minutes! > 10 && t.bareWorst.minutes! < 40, `bare ${t.bareWorst.minutes}`);
  assert.ok(t.sunscreenWorst!.minutes! > t.bareWorst.minutes! * 2);
  const later = timeToBurnNow({ now: NOON, ctx, profile, settings, priorDoseSED: 1.5 });
  assert.ok(later.bareWorst.minutes! < t.bareWorst.minutes!);
  // at night nothing is reached
  const night = timeToBurnNow({ now: Date.parse('2025-07-16T04:00Z'), ctx, profile, settings });
  assert.equal(night.bareWorst.minutes, null);
});

test('planner: lowest-UV windows avoid midday', () => {
  const plan = planDay({ day: NOON, durationMin: 45, ctx, profile, settings: settingsForPreset('walk') });
  assert.ok(plan.slots.length > 15, `${plan.slots.length} slots`);
  const noonSlot = plan.slots.reduce((a, b) => (Math.abs(b.start - NOON) < Math.abs(a.start - NOON) ? b : a));
  for (const t of plan.lowest) {
    const slot = plan.slots.find((s) => s.start === t)!;
    assert.ok(slot.peakFraction < noonSlot.peakFraction / 2);
    assert.ok(Math.abs(t - NOON) > 2.5 * 3_600_000, 'lowest window should be far from solar noon');
  }
});

test('replay: added-after session equals a live session over the same time', () => {
  const live = stepSession(startSession(NOON, 'beach', 'umbrella', profile), NOON + 7_200_000, envAtFor(ctx), profile);
  const replay = replaySession({ start: NOON, end: NOON + 7_200_000, ctx, profile, preset: 'beach', shade: 'umbrella' });
  assert.equal(replay.trackingMode, 'retroactive');
  assert.equal(replay.status, 'completed');
  assert.ok(Math.abs(currentFraction(replay, profile).fraction - currentFraction(live, profile).fraction) < 1e-9);
});

test('days and check-in: summary per day; pink moves the MED estimate toward that day\'s dose', () => {
  const s = replaySession({ start: NOON, end: NOON + 40 * 60_000, ctx, profile, preset: 'walk', shade: 'none' });
  const day = localDayKey(s.startedAt);
  const [sum] = summarizeDays([s], profile);
  assert.equal(sum.day, day);
  assert.ok(sum.peakFraction > 0.5);
  const c = checkInForDay([s], day, 1)!;
  assert.ok(c.promptAt > s.endedAt! + 12 * 3_600_000 - 1);
  assert.ok(c.doseSED! > 0 && c.doseLogSigma! > 0 && c.sunscreen === false);
  const answered = answerCheckIn(c, 'pink', c.promptAt, 2);
  // pink means MED ≈ that day's dose: the estimate moves from the type-II prior (3 SED) toward it
  const m = answered.medAfter!.median;
  assert.ok(Math.min(3, c.doseSED!) < m && m < Math.max(3, c.doseSED!), `dose ${c.doseSED}, median ${m}`);
  near(answered.cUserAfter!, answered.medAfter!.median / 3, 1e-9);
  assert.ok(answered.medAfter!.q10 < answered.medAfter!.median && answered.medAfter!.median < answered.medAfter!.q90);
  assert.equal(checkInForDay([s], '1999-01-01', 1), null);
  // demo sessions never become evidence about real skin
  assert.equal(checkInForDay([{ ...s, demo: true }], day, 1), null);
});

test('calibration: answers since reset only; pre-Bayesian check-ins still count; days add up', () => {
  const a = replaySession({ start: NOON, end: NOON + 20 * 60_000, ctx, profile, preset: 'walk', shade: 'none' });
  const b = replaySession({ start: NOON + 3_600_000, end: NOON + 3_600_000 + 20 * 60_000, ctx, profile, preset: 'walk', shade: 'none' });
  const day = localDayKey(a.startedAt);
  const both = checkInForDay([a, b], day, 1)!;
  const one = checkInForDay([a], day, 1)!;
  assert.ok(Math.abs(both.doseSED! - one.doseSED! * 2) / both.doseSED! < 0.2, 'two similar sessions ≈ twice the dose');
  const ans = answerCheckIn(both, 'burned', 1000, 2);
  assert.ok(calibrate(2, [ans]).median < calibrate(2, []).median);
  assert.deepEqual(calibrate(2, [ans], 2000), calibrate(2, [])); // answered before the reset → ignored
  // legacy record (no doseSED) is reconstructed from its stored fraction
  const legacy = { ...ans, doseSED: undefined, doseLogSigma: undefined, sunscreen: undefined };
  assert.ok(calibrate(2, [legacy]).median < calibrate(2, []).median);
});

test('time to burn: skin uncertainty widens the range (new user wider than a calibrated one)', () => {
  const settings = settingsForPreset('walk');
  const newUser = { ...profile, medLogSpread: calibrate(2, []).logSpread };
  const sure = { ...profile, medLogSpread: { lo: 0.05, hi: 0.05 } };
  const a = timeToBurnNow({ now: NOON, ctx: phys, profile: newUser, settings }).bareWorst;
  const b = timeToBurnNow({ now: NOON, ctx: phys, profile: sure, settings }).bareWorst;
  assert.ok(a.soonest! < b.soonest!, `${a.soonest} < ${b.soonest}`);
  assert.equal(a.minutes, b.minutes); // the central estimate doesn't move
  // demo: no UV band, but the skin term still gives a range
  const d = timeToBurnNow({ now: NOON, ctx, profile: newUser, settings }).bareWorst;
  assert.ok(d.soonest! < d.minutes!);
  assert.ok(cautiousFactor(ctx, NOON, 1, newUser.medLogSpread) > 1.3);
});

// ---------------------------------------------------------------- time-to-burn range + cautious alerts

// Physics mode: offline, but a real estimate, so it carries the measured error band.
const phys: UVContext = { lat: 25.76, lon: -80.19, mode: 'physics' };

test('time to burn: range from the measured band; soonest ≤ most likely ≤ latest; demo has no range', () => {
  const settings = settingsForPreset('walk');
  const demo = timeToBurnNow({ now: NOON, ctx, profile, settings });
  assert.equal(demo.bareWorst.soonest, demo.bareWorst.minutes);
  assert.equal(demo.bareWorst.latest, demo.bareWorst.minutes);
  const t = timeToBurnNow({ now: NOON, ctx: phys, profile, settings, sunscreen: app });
  const w = t.bareWorst;
  assert.ok(w.soonest! < w.minutes! && w.minutes! < w.latest!, `${w.soonest} < ${w.minutes} < ${w.latest}`);
  // the cautious time is where the central fraction reaches 1 / band.hi for that horizon
  const b = bandFor(phys, NOON)!(w.soonest! / 60);
  const ratio = w.minutes! / w.soonest!;
  assert.ok(ratio > 1 && ratio < b.hi * 1.3, `ratio ${ratio}, hi ${b.hi}`);
  assert.ok(t.sunscreenWorst!.soonest! < t.sunscreenWorst!.minutes!);
});

test('cautious factor: 1 in demo; > 1 otherwise, narrowing as the session gets longer', () => {
  assert.equal(cautiousFactor(ctx, NOON, 1), 1);
  const short = cautiousFactor(phys, NOON, 0.25);
  const long = cautiousFactor(phys, NOON, 6);
  assert.ok(short > long && long > 1, `${short} > ${long} > 1`);
  assert.equal(short, cautiousFactor(phys, NOON, 0.5)); // clamped to the fitted 0.5 h
});

test('cautious alerts: projecting to th / k from the central dose does not slide later as the session runs', () => {
  const envAt = envAtFor(phys);
  const settings = settingsForPreset('walk');
  const alertAt = (s: ReturnType<typeof startSession>, now: number) => {
    const k = cautiousFactor(phys, now, s.outdoorSeconds / 3600);
    const st = s.sites[s.worstSite]!;
    const p = project(st, envAt, { ...settings, posture: s.worstSite }, profile, { target: 0.8 / k, stepMin: 1 });
    return now + p.minutesToTarget! * 60_000;
  };
  let s = startSession(NOON - 3_600_000, 'walk', 'none', profile);
  s = stepSession(s, NOON - 3_600_000 + 60_000, envAt, profile);
  const first = alertAt(s, s.lastT);
  // check again while the alert is still in the future (a type II at Miami noon gets there in ~10 min)
  s = stepSession(s, s.lastT + 6 * 60_000, envAt, profile);
  const second = alertAt(s, s.lastT);
  assert.ok(second > s.lastT, 'still ahead');
  assert.ok(Math.abs(second - first) <= 2 * 60_000, `alert moved ${(second - first) / 60_000} min`);
  // and it is earlier than the central 80% time
  const central = project(s.sites[s.worstSite]!, envAt, { ...settings, posture: s.worstSite }, profile, { target: 0.8, stepMin: 1 });
  assert.ok(second < s.lastT + central.minutesToTarget! * 60_000);
});

test('fmtBurnRange: ranges, open ends, nothing', () => {
  assert.equal(fmtBurnRange({ minutes: 42, soonest: 35, latest: 50 }), '35–50 min');
  assert.equal(fmtBurnRange({ minutes: 100, soonest: 70, latest: 130 }), '1 h 10 min–2 h 10 min');
  assert.equal(fmtBurnRange({ minutes: 300, soonest: 240, latest: null }), '4 h or later');
  assert.equal(fmtBurnRange({ minutes: null, soonest: 400, latest: null }), 'Possible after 6 h 40 min');
  assert.equal(fmtBurnRange({ minutes: null, soonest: null, latest: null }), 'Not expected today');
  assert.equal(fmtBurnRange({ minutes: 30, soonest: 30, latest: 30 }), '~30 min');
});

// ---------------------------------------------------------------- trends

const DAY = 86_400_000;
/** A completed live session: start → (pause/resume) → end, optional sunscreen at `ssAt`. */
function outing(start: number, minutes: number, opts: { ssAt?: number; pauseAt?: number; pauseMin?: number; preset?: 'walk' | 'beach' } = {}) {
  const envAt = envAtFor(ctx);
  let s = startSession(start, opts.preset ?? 'walk', 'none', profile);
  const end = start + (minutes + (opts.pauseMin ?? 0)) * 60_000;
  const marks = [opts.ssAt, opts.pauseAt].filter((x): x is number => x != null).sort((a, b) => a - b);
  for (const m of marks) {
    s = stepSession(s, m, envAt, profile);
    if (m === opts.ssAt) s = applySunscreen(s, { ...app, appliedAt: m });
    if (m === opts.pauseAt) {
      s = setStatus(s, m, 'paused');
      s = stepSession(s, m + opts.pauseMin! * 60_000, envAt, profile);
      s = setStatus(s, m + opts.pauseMin! * 60_000, 'active');
    }
  }
  s = stepSession(s, end, envAt, profile);
  return setStatus(s, end, 'completed');
}

test('trends: this week vs last week, rolling 7 days; demo sessions excluded', () => {
  const now = NOON + 10 * DAY;
  const thisWeek = [outing(NOON + 9 * DAY, 30), outing(NOON + 8 * DAY, 60)];
  const lastWeek = [outing(NOON + 1 * DAY, 30)];
  const demo = { ...outing(NOON + 9 * DAY + 3_600_000, 60), demo: true };
  const w = weekCompare([...thisWeek, ...lastWeek, demo], profile, now);
  near(w.thisWeek.outdoorSeconds, 90 * 60, 1);
  near(w.lastWeek.outdoorSeconds, 30 * 60, 1);
  assert.equal(w.thisWeek.activeDays, 2);
  near(w.thisWeek.protectedSED, thisWeek.reduce((a, s) => a + skinDose(s).protectedSED, 0), 1e-9);
  // 60 min bare at Miami noon is far past a type-II burn: that day counts as near-burn
  assert.ok(w.thisWeek.nearBurnDays >= 1);
});

test('trends: sunscreen time follows the event timeline (pauses excluded, starts at application)', () => {
  const s = outing(NOON, 60, { ssAt: NOON + 20 * 60_000, pauseAt: NOON + 40 * 60_000, pauseMin: 30 });
  // outdoors 60 min; sunscreen from minute 20; paused 30 min in between → 40 min covered
  near(s.outdoorSeconds, 3600, 1);
  near(sunscreenSeconds(s), 40 * 60, 1);
  assert.equal(sunscreenSeconds(outing(NOON, 30)), 0);
});

test('trends: sunscreen habit — share of time covered and dose actually removed', () => {
  const now = NOON + 2 * DAY;
  const withSs = outing(NOON, 60, { ssAt: NOON });
  const bare = outing(NOON + DAY, 60);
  const h = sunscreenHabit([withSs, bare], now, 30);
  assert.equal(h.sessions, 2);
  assert.equal(h.sessionsWithSunscreen, 1);
  near(h.coveredSeconds / h.outdoorSeconds, 0.5, 0.01);
  const d = skinDose(withSs);
  near(h.doseCut!, 1 - d.protectedSED / d.unprotectedSED, 1e-9);
  assert.ok(h.doseCut! > 0.5 && h.doseCut! < 1, `cut ${h.doseCut}`);
  assert.equal(h.labelSpf, 30);
  assert.equal(sunscreenHabit([bare], now).doseCut, null);
});

test('trends: bare-skin dose includes wet skin, so sunscreen never looks counter-productive', () => {
  const swim = outing(NOON, 30, { preset: 'beach' });
  const d = skinDose(swim);
  near(d.protectedSED, d.unprotectedSED, 1e-9); // no sunscreen: protected = bare, wet factor in both
  assert.ok(d.unprotectedSED > swim.ambientSED, 'bare dose > physical dose when wet');
});

test('trends: skin learning starts at the prior and the range narrows with check-ins', () => {
  const day = (i: number) => outing(NOON + i * DAY, 20);
  const answers = [0, 1, 2, 3, 4].map((i) => {
    const s = day(i);
    const c = checkInForDay([s], localDayKey(s.startedAt), 1)!;
    return answerCheckIn(c, i % 2 ? 'pink' : 'none', s.endedAt! + 20 * 3_600_000, 2);
  });
  const pts = skinLearning(2, answers);
  assert.equal(pts.length, 6);
  assert.equal(pts[0].n, 0);
  near(pts[0].median, calibrate(2, []).median, 1e-9);
  near(pts[5].median, calibrate(2, answers).median, 1e-9);
  assert.ok(pts[5].q90 / pts[5].q10 < pts[0].q90 / pts[0].q10);
  assert.ok(rangeNarrowing(pts) > 0.2, `narrowing ${rangeNarrowing(pts)}`);
  assert.equal(rangeNarrowing(pts.slice(0, 1)), 0);
  // answers before a reset are ignored
  assert.equal(skinLearning(2, answers, Number.MAX_SAFE_INTEGER).length, 1);
});

// ---------------------------------------------------------------- demo persona (Mackenzie)


test('demo: Mackenzie at each moment — history, today, and an active session where one is running', () => {
  const t = buildDemo('trailhead');
  assert.equal(t.active, null);
  assert.equal(t.sessions.length, 9); // 8 in Manhattan + today's lunch
  assert.equal(t.checkIns.length, 6);
  assert.ok(t.sessions.every((s) => s.status === 'completed' && !s.demo), 'her sessions count in her trends and calibration');
  assert.equal(t.now, DEMO_MOMENTS.trailhead.t);
  const dock = buildDemo('dock');
  assert.equal(dock.active?.preset, 'picnic');
  assert.equal(dock.sessions.length, 8);
  const summit = buildDemo('summit');
  assert.equal(summit.active?.preset, 'walk');
  assert.equal(summit.active?.settings.shade, 'none'); // out of the trees near the top
  assert.equal(summit.place.elevationM, 1249);
  assert.equal(DEMO_PROFILE.notifications, false);
});

test('demo: every check-in answer is consistent with the dose the model gives her (true MED ≈ 2.7 SED)', () => {
  const { sessions, checkIns } = buildDemo('trailhead');
  for (const c of checkIns) {
    const dose = c.doseSED! / 2.7;
    if (c.redness === 'burned') assert.ok(dose > 2, `${c.day} burned at ${dose.toFixed(2)} MED`);
    if (c.redness === 'pink') assert.ok(dose > 0.9 && dose < 2, `${c.day} pink at ${dose.toFixed(2)} MED`);
    if (c.redness === 'none') assert.ok(dose < 0.6, `${c.day} none at ${dose.toFixed(2)} MED`);
  }
  // the app learns she burns sooner than the type-II average, and her truth is inside the range
  const post = calibrate(2, checkIns);
  assert.ok(post.median < 3 && post.q10 < 2.7 && 2.7 < post.q90, `${post.q10}–${post.median}–${post.q90}`);
  assert.ok(sessions.length > 0);
});

test('demo: the trends tell the story — more time out this week, much less dose, fewer near-burn days', () => {
  const d = buildDemo('trailhead');
  const post = calibrate(2, d.checkIns);
  const w = weekCompare(d.sessions, { skinType: 2, cUser: cUserOf(2, post) }, d.now);
  assert.ok(w.thisWeek.outdoorSeconds > w.lastWeek.outdoorSeconds);
  assert.ok(w.thisWeek.protectedSED < 0.6 * w.lastWeek.protectedSED);
  assert.ok(w.thisWeek.nearBurnDays < w.lastWeek.nearBurnDays);
  const h = sunscreenHabit(d.sessions, d.now);
  assert.ok(h.doseCut! > 0.5 && h.labelSpf === 50);
  assert.ok(rangeNarrowing(skinLearning(2, d.checkIns)) > 0.25);
});

test('demo: the scripted sunscreen nudges say what the model shows at that moment', () => {
  const post = calibrate(2, buildDemo('trailhead').checkIns);
  const prof = { skinType: 2 as const, cUser: cUserOf(2, post), medLogSpread: post.logSpread };
  const at = (m: 'dock' | 'trailhead' | 'summit') => {
    const d = buildDemo(m);
    const ctx: UVContext = { lat: d.place.lat, lon: d.place.lon, altitudeKm: d.place.elevationM / 1000, mode: 'demo', demoClouds: DEMO_PROFILE.demoClouds };
    const today = [...d.sessions, ...(d.active ? [d.active] : [])].filter((s) => localDayKey(s.startedAt) === localDayKey(d.now)).reduce((a, s) => a + skinDose(s).protectedSED, 0);
    return { reading: readAt(ctx, d.now), ttb: timeToBurnNow({ now: d.now, ctx, profile: prof, settings: settingsForPreset('walk'), priorDoseSED: today }) };
  };
  // dock: "UV is high"
  assert.ok(at('dock').reading.uvi >= 6, 'UV high on the dock');
  // trailhead: "over a 2½-hour hike you could reach your burn threshold" — cautious time within 150 min, central not
  const t = at('trailhead');
  assert.ok(t.reading.uvi < 3, 'UV low at the trailhead');
  assert.ok(t.ttb.bareWorst.soonest !== null && t.ttb.bareWorst.soonest <= 150, `soonest ${t.ttb.bareWorst.soonest}`);
  // summit: no nudge, because there's nothing to warn about
  assert.equal(DEMO_NUDGES.summit, null);
  assert.equal(at('summit').ttb.bareWorst.soonest, null);
  assert.ok(DEMO_NUDGES.dock && DEMO_NUDGES.trailhead);
});

// ---------------------------------------------------------------- activity vocabulary (every screen)

const PRESETS_LABEL = { walk: 'Walk / errands', run: 'Run / cycle', picnic: 'Park / picnic', beach: 'Beach', pool: 'Pool / lake', ski: 'Ski / snow' } as const;

test('activity: each preset matches itself; any changed detail is Custom; labels are words', () => {
  for (const k of ['walk', 'run', 'picnic', 'beach', 'pool', 'ski'] as const) {
    const x = settingsForPreset(k, 'umbrella');
    assert.equal(presetMatching(x), k, k); // shade doesn't change which activity it is
    assert.equal(activityLabel(k, x), PRESETS_LABEL[k]);
  }
  const custom = { ...settingsForPreset('walk'), activity: 'swimming' as const };
  assert.equal(presetMatching(custom), null);
  assert.equal(activityLabel('walk', custom), 'Custom: Upright, Pavement / concrete, Swimming / in water');
  // a custom outing that happens to equal another preset is labelled as that preset, not the stored one
  assert.equal(activityLabel('walk', settingsForPreset('beach')), 'Beach');
  assert.equal(describeSettings({ ...settingsForPreset('beach'), shade: 'umbrella' }), 'Lying down, Dry sand, Swimming / in water, Umbrella / awning');
});

test('activity: "shoulders" is not a separate model choice — it tracks the same sites and dose as upright', () => {
  const up = settingsForPreset('walk');
  const sh = { ...up, posture: 'shoulders' as const };
  assert.deepEqual(sitesFor(sh), sitesFor(up));
  const envAt = envAtFor(ctx);
  const a = stepSession(changeSettings(startSession(NOON, 'walk', 'none', profile), NOON, up, 'walk'), NOON + 1_800_000, envAt, profile);
  const b = stepSession(changeSettings(startSession(NOON, 'walk', 'none', profile), NOON, sh, 'walk'), NOON + 1_800_000, envAt, profile);
  near(currentFraction(b, profile).fraction, currentFraction(a, profile).fraction, 1e-12);
  // so old sessions saved with it still label as the upright preset
  assert.equal(presetMatching(sh), 'walk');
});

// ---------------------------------------------------------------- sun icon colour

test('sun icon colour: yellow in the morning, warming as the evening sun sinks, dusk below the horizon', () => {
  const SUN = '#FFDF38';
  const CORAL = '#FF8669';
  // morning stays yellow even when low
  assert.equal(sunColorFor(5, true, SUN, CORAL), SUN);
  assert.equal(sunColorFor(45, false, SUN, CORAL), SUN);
  // evening: warmer (less green, which is what separates yellow from red) the lower it gets
  const g = (h: string) => parseInt(h.slice(3, 5), 16);
  const ev = [30, 20, 12, 6, 2, 0].map((e) => sunColorFor(e, false, SUN, CORAL));
  for (let i = 1; i < ev.length; i++) assert.ok(g(ev[i]) <= g(ev[i - 1]), `${ev[i - 1]} → ${ev[i]}`);
  assert.equal(sunColorFor(4, false, SUN, CORAL), CORAL);
  assert.equal(sunColorFor(-5, true, SUN, CORAL), sunColorFor(-5, false, SUN, CORAL)); // night is night either way
  // the demo's three moments tell the evening story
  const at = (m: 'dock' | 'trailhead' | 'summit') => {
    const d = buildDemo(m);
    const p = solarPhase(new Date(d.now), d.place.lat, d.place.lon);
    return { ...p, color: sunColorFor(p.elevationDeg, p.rising, SUN, CORAL) };
  };
  assert.equal(at('dock').rising, true);
  assert.equal(at('dock').color, SUN);
  assert.equal(at('trailhead').rising, false);
  assert.ok(g(at('summit').color) < g(at('trailhead').color), 'summit sun is warmer than the trailhead sun');
});
