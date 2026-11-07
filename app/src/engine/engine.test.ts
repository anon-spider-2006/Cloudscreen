// Run: npm run test:model   (covers src/model and src/engine)
/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerCheckIn,
  applySunscreen,
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

test('days and check-in: summary per day; pink after high prediction lowers c_user', () => {
  const s = replaySession({ start: NOON, end: NOON + 40 * 60_000, ctx, profile, preset: 'walk', shade: 'none' });
  const day = localDayKey(s.startedAt);
  const [sum] = summarizeDays([s], profile);
  assert.equal(sum.day, day);
  assert.ok(sum.peakFraction > 0.5);
  const c = checkInForDay([s], day, 1)!;
  assert.ok(c.promptAt > s.endedAt! + 12 * 3_600_000 - 1);
  const answered = answerCheckIn(c, 'pink', c.promptAt);
  assert.ok(answered.cUserAfter! !== 1);
  assert.equal(checkInForDay([s], '1999-01-01', 1), null);
});
