import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { DEFAULT_PROFILE, useStore, uvContext, settingsFor, defaultSunscreen, pendingCheckIn } from '../../src/state/store.ts';
import { skinDose, currentSPF } from '../../src/engine/index.ts';
import { cUserOf, priorPosterior } from '../../src/model/index.ts';
import { calls } from '../support/notifications.ts';

const NOON = Date.parse('2026-07-15T17:00:00Z');
let clock = NOON;
const get = () => useStore.getState();
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  clock = NOON;
  mock.method(Date, 'now', () => clock);
  mock.method(globalThis, 'fetch', async () => { throw new Error('Offline test'); });
  useStore.setState({ ...useStore.getInitialState(), profile: { ...DEFAULT_PROFILE, onboarded: true, notifications: false, uvMode: 'physics' }, place: { lat: 25.76, lon: -80.19, name: 'Miami', source: 'manual' } }, true);
  calls.length = 0;
});
afterEach(() => {
  if (get().demo) get().exitDemo();
  mock.restoreAll();
  mock.timers.reset();
});
test('profile helpers preserve custom exposure, SPF and location context', () => {
  assert.equal(defaultSunscreen({ ...get().profile, spf: 50 }, NOON).spfLabel, 50);
  assert.equal(uvContext({ ...get(), place: null }), null);
  assert.equal(uvContext(get())?.accuracyKm, 10);
  assert.deepEqual(settingsFor({ ...get(), custom: { posture: 'lying', surface: 'sand', activity: 'dry' }, shade: 'dense' }), { posture: 'lying', surface: 'sand', activity: 'dry', shade: 'dense' });
});
test('session start → tick → pause → resume → end preserves elapsed time and dose', () => {
  get().start();
  const id = get().active!.id;
  clock += 600_000; get().tick();
  const dose = skinDose(get().active!).protectedSED;
  assert.ok(dose > 0);
  get().pause(); clock += 600_000; get().tick();
  assert.equal(skinDose(get().active!).protectedSED, dose);
  get().resume(); clock += 300_000; get().end();
  assert.equal(get().active, null);
  assert.equal(get().sessions[0].id, id);
  assert.equal(get().sessions[0].status, 'completed');
  assert.equal(get().sessions[0].outdoorSeconds, 900);
  assert.ok(skinDose(get().sessions[0]).protectedSED > dose);
  assert.ok(calls.includes('cancelBurnAlerts'));
});
test('sunscreen applies to active session and logs its session ID', () => {
  get().start(); clock += 300_000; get().tick();
  const before = skinDose(get().active!).protectedSED;
  get().logSunscreen({ spfLabel: 50, filter: 'photostable', mgPerCm2: 2, waterResistant: true });
  assert.equal(get().sunscreen[0].sessionId, get().active!.id);
  assert.ok(currentSPF(get().active!) > 1);
  assert.equal(skinDose(get().active!).protectedSED, before);
});
test('changing activity mid-session retains accumulated exposure', () => {
  get().start(); clock += 600_000; get().tick();
  const dose = skinDose(get().active!).protectedSED;
  get().setActivity({ posture: 'lying', surface: 'sand', activity: 'swimming', shade: 'umbrella' });
  assert.equal(get().active!.settings.surface, 'sand');
  assert.ok(Math.max(...Object.values(get().active!.sites).map((site) => site!.doseSED)) >= dose);
  const reported = skinDose(get().active!).protectedSED;
  assert.ok(reported >= dose, `Dose summary fell from ${dose} SED to ${reported} SED after changing posture`);
});
for (const [name, start, end] of [
  ['zero duration', NOON - 60_000, NOON - 60_000],
  ['negative duration', NOON - 60_000, NOON - 120_000],
  ['future end', NOON - 60_000, NOON + 60_000],
  ['older than two days', NOON - 3 * 86_400_000, NOON - 3 * 86_400_000 + 60_000],
] as const) test(`past session rejects ${name} without mutation`, () => {
  assert.equal(get().addPastSession({ start, end, preset: 'walk', shade: 'none' }).ok, false);
  assert.equal(get().sessions.length, 0);
});
test('past session requires a location', () => {
  useStore.setState({ place: null });
  assert.deepEqual(get().addPastSession({ start: NOON - 600_000, end: NOON, preset: 'walk', shade: 'none' }), { ok: false, reason: 'Set a location first.' });
});
test('past sessions persist custom settings, reject overlaps, allow adjacent intervals and delete', () => {
  const args = { start: NOON - 3600_000, end: NOON - 1800_000, preset: 'walk' as const, shade: 'dense' as const, settings: { posture: 'lying' as const, surface: 'snow' as const, activity: 'sweating' as const }, sunscreenAt: NOON - 3600_000 };
  assert.equal(get().addPastSession(args).ok, true);
  assert.equal(get().sessions[0].settings.surface, 'snow');
  assert.equal(get().sessions[0].settings.shade, 'dense');
  assert.equal(get().sessions[0].trackingMode, 'retroactive');
  assert.equal(get().addPastSession(args).ok, false);
  assert.equal(get().addPastSession({ ...args, start: args.end, end: NOON }).ok, true);
  get().deleteSession(get().sessions[0].id);
  assert.equal(get().sessions.length, 1);
});
test('network failure clears loading state and retains usable offline context', async () => {
  await get().refreshForecast(true);
  assert.equal(get().fetching, false);
  assert.ok(get().forecastError);
  assert.ok(uvContext(get()));
});
test('demo jumps do not replace the real snapshot, and exit restores it', () => {
  get().setProfile({ spf: 70 });
  const real = { profile: get().profile, place: get().place, sessions: get().sessions };
  get().enterDemo();
  assert.ok(get().demo);
  assert.ok(get().sessions.length > 0);
  get().enterDemo();
  get().exitDemo();
  assert.equal(get().profile.spf, 70);
  assert.deepEqual(get().profile, real.profile);
  assert.deepEqual(get().place, real.place);
  assert.deepEqual(get().sessions, real.sessions);
});
test('delete all clears user data and restores default onboarding state', () => {
  get().start(); get().end(); get().deleteAll();
  assert.equal(get().sessions.length, 0);
  assert.equal(get().sunscreen.length, 0);
  assert.equal(get().checkIns.length, 0);
  assert.equal(get().active, null);
  assert.equal(get().place, null);
  assert.equal(get().profile.onboarded, false);
});

test('persistence rehydrates profile and sessions while excluding transient flags', async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    get().setProfile({ spf: 70 });
    get().start(); clock += 60_000; get().end();
    useStore.setState({ banner: 'temporary', fetching: true, forecastError: 'temporary' });
    const serialized = storage.get('cloudscreen-v1')!;
    const saved = JSON.parse(serialized);
    assert.equal(saved.state.profile.spf, 70);
    assert.equal(saved.state.sessions.length, 1);
    for (const field of ['banner', 'fetching', 'forecastError']) assert.equal(field in saved.state, false);
    useStore.setState({ profile: { ...DEFAULT_PROFILE }, sessions: [] });
    storage.set('cloudscreen-v1', serialized);
    await useStore.persist.rehydrate();
    assert.equal(get().profile.spf, 70);
    assert.equal(get().sessions.length, 1);
  } finally {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('a second start cannot overwrite an active session', () => {
  get().start(); const id = get().active!.id;
  clock += 60_000; get().start();
  assert.equal(get().active!.id, id);
  assert.equal(get().active!.startedAt, NOON);
});

test('inactive lifecycle actions are harmless', () => {
  assert.doesNotThrow(() => { get().pause(); get().resume(); get().end(); get().tick(); });
  assert.equal(get().active, null);
  assert.equal(get().sessions.length, 0);
});

test('recent sunscreen carries into a new session but an expired application does not', () => {
  const app = { spfLabel: 30, filter: 'photostable' as const, mgPerCm2: 2, waterResistant: false };
  get().logSunscreen({ ...app, appliedAt: clock - 60_000 }); get().start();
  assert.ok(get().active!.lastSunscreenAt);
  get().end();
  clock += 5 * 3600_000; get().start();
  assert.equal(get().active!.lastSunscreenAt, undefined);
});

test('pending check-in selects latest due unanswered report and excludes expired or future prompts', () => {
  const base = { sessionIds: [], predictedFraction: 0.8, cUserBefore: 1 };
  const checkIns = [
    { ...base, day: 'old', promptAt: clock - 4 * 86_400_000 },
    { ...base, day: 'future', promptAt: clock + 1000 },
    { ...base, day: 'answered', promptAt: clock - 100, answeredAt: clock - 50 },
    { ...base, day: 'due', promptAt: clock - 1000 },
    { ...base, day: 'older-due', promptAt: clock - 2000 },
  ];
  assert.equal(pendingCheckIn({ checkIns, sessions: [] })?.day, 'due');
});

test('check-in answers calibrate once; reset retains history but restores the prior', () => {
  useStore.setState({ checkIns: [{ day: '2026-07-14', sessionIds: [], promptAt: clock - 1000, predictedFraction: 0.8, cUserBefore: 1, doseSED: 2, doseLogSigma: 0.2 }] });
  get().answerCheckIn('2026-07-14', 'pink');
  assert.equal(get().checkIns[0].redness, 'pink');
  assert.equal(get().checkIns[0].answeredAt, clock);
  const calibrated = get().profile.cUser;
  get().answerCheckIn('2026-07-14', 'none');
  assert.equal(get().checkIns[0].redness, 'pink');
  assert.equal(get().profile.cUser, calibrated);
  clock += 1000; get().resetCalibration();
  const prior = priorPosterior(get().profile.skinType);
  assert.equal(get().profile.cUser, cUserOf(get().profile.skinType, prior));
  assert.deepEqual(get().profile.medLogSpread, prior.logSpread);
  assert.equal(get().checkIns.length, 1);
});
