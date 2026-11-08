/**
 * App state (Zustand), persisted locally through the SQLite key-value store.
 * All dose maths lives in src/engine and src/model; this file only wires state to it.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  answerCheckIn,
  applySunscreen,
  calibrate,
  changeSettings,
  checkInForDay,
  currentFraction,
  cautiousFactor,
  envAtFor,
  localDayKey,
  newlyCrossed,
  overlaps,
  presetMatching,
  setStatus,
  settingsForPreset,
  startSession,
  stepSession,
  type CheckIn,
  type Session,
  type UVContext,
} from '@/engine';
import {
  fetchForecast,
  project,
  type CloudLayers,
  type ExposureSettings,
  type FilterType,
  type Forecast,
  type Preset,
  type Redness,
  type Shade,
  type SkinProfile,
  type SkinType,
  type SunscreenApplication,
  type UVMode,
  type SatelliteObs,
  cellKey,
  cUserOf,
  fetchSatellite,
  priorPosterior,
  mergeSatellite,
  privacyCell,
  SAT_REFRESH_PAST_HOURS,
} from '@/model';
import { buildDemo, DEMO_MOMENTS, DEMO_NUDGE_AFTER_S, DEMO_NUDGES, DEMO_PROFILE, DEMO_START, type DemoMoment } from '@/demo/mackenzie';
import { accuracyKmOf, kmBetween, type Place } from '@/services/location';
import * as notify from '@/services/notifications';

import { kvStorage } from './storage';

export interface Profile {
  onboarded: boolean;
  skinType: SkinType;
  cUser: number;
  spf: number;
  filter: FilterType;
  mgPerCm2: number;
  waterResistant: boolean;
  preset: Preset;
  reminderMin: number;
  uvMode: UVMode;
  notifications: boolean;
  demoClouds: CloudLayers;
  /** Demo clock: added to Date.now() while uvMode is 'demo'. */
  demoClockOffsetMs: number;
  /** Check-ins answered before this are ignored by calibration ("Reset calibration"). */
  calibrationResetAt?: number;
  /** Posterior spread of personal MED (see SkinProfile.medLogSpread). Absent = prior for the skin type. */
  medLogSpread?: { lo: number; hi: number };
}

export interface LoggedSunscreen extends SunscreenApplication {
  id: string;
  sessionId?: string;
}

export const DEFAULT_PROFILE: Profile = {
  onboarded: false,
  skinType: 2,
  cUser: 1,
  spf: 30,
  filter: 'photostable',
  mgPerCm2: 1,
  waterResistant: false,
  preset: 'walk',
  reminderMin: 120,
  uvMode: 'forecast',
  notifications: true,
  demoClouds: { low: 0, mid: 0, high: 0 },
  demoClockOffsetMs: 0,
};

interface State {
  profile: Profile;
  place: Place | null;
  forecast: Forecast | null;
  forecastError: string | null;
  /** Satellite cloud observations for the place's privacy cell (null = not fetched / failed). */
  satellite: SatelliteObs | null;
  fetching: boolean;
  /** Pre-session choice; copied into a session at start. */
  shade: Shade;
  /** Custom settings override for the next session (null = use preset). */
  custom: ExposureSettings | null;
  active: Session | null;
  sessions: Session[];
  sunscreen: LoggedSunscreen[];
  checkIns: CheckIn[];
  /** Fired-in-foreground thresholds waiting for an in-app banner. */
  banner: string | null;
  /** Demo persona in use, or null. */
  demo: { moment: DemoMoment } | null;
  /** The real user's data while a demo is running. */
  realSnapshot: RealSnapshot | null;
}

/** The parts of state a demo replaces (and exit restores). */
type RealSnapshot = Pick<State, 'profile' | 'place' | 'forecast' | 'satellite' | 'shade' | 'custom' | 'active' | 'sessions' | 'sunscreen' | 'checkIns'>;

interface Actions {
  setProfile: (p: Partial<Profile>) => void;
  setPlace: (p: Place) => void;
  refreshForecast: (force?: boolean) => Promise<void>;
  /**
   * The one way screens set what you're doing: full settings incl. shade. A preset
   * match becomes the remembered activity; anything else is kept as custom. A
   * running session switches from now on and keeps its dose.
   */
  setActivity: (x: ExposureSettings) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  end: () => void;
  tick: () => void;
  logSunscreen: (app: Omit<SunscreenApplication, 'appliedAt'> & { appliedAt?: number }) => void;
  addPastSession: (a: { start: number; end: number; preset: Preset; shade: Shade; sunscreenAt?: number | null; settings?: ExposureSettings }) => { ok: true } | { ok: false; reason: string };
  deleteSession: (id: string) => void;
  answerCheckIn: (day: string, r: Redness) => void;
  resetCalibration: () => void;
  /** Enter the Mackenzie demo (sets your data aside); if already in it, jump to `moment`. */
  enterDemo: (moment?: DemoMoment) => void;
  jumpDemo: (moment: DemoMoment) => void;
  /** Leave the demo and put your data back exactly as it was. */
  exitDemo: () => void;
  clearBanner: () => void;
  deleteAll: () => void;
}

export type Store = State & Actions;

// ---------------------------------------------------------------- selectors / helpers (pure)

export const nowFor = (p: Profile) => Date.now() + (p.uvMode === 'demo' ? p.demoClockOffsetMs : 0);

export const skinProfile = (p: Profile): SkinProfile => ({
  skinType: p.skinType,
  cUser: p.cUser,
  medLogSpread: p.medLogSpread ?? priorPosterior(p.skinType).logSpread,
});

/** Profile with cUser and spread recomputed from all answered check-ins since the last reset. */
function recalibrated(p: Profile, checkIns: CheckIn[]): Profile {
  const post = calibrate(p.skinType, checkIns, p.calibrationResetAt ?? 0);
  return { ...p, cUser: cUserOf(p.skinType, post), medLogSpread: post.logSpread };
}

export function uvContext(s: Pick<State, 'place' | 'forecast' | 'profile'> & Partial<Pick<State, 'satellite'>>): UVContext | null {
  if (!s.place) return null;
  const forecastUsable = s.forecast && kmBetween(s.forecast, s.place) < 25;
  const sat = s.satellite;
  const satUsable = sat && sat.covered && cellKey(sat.cell) === cellKey(privacyCell(s.place.lat, s.place.lon));
  return {
    lat: s.place.lat,
    lon: s.place.lon,
    accuracyKm: accuracyKmOf(s.place),
    altitudeKm: s.place.elevationM != null ? s.place.elevationM / 1000 : undefined,
    mode: s.profile.uvMode,
    forecast: forecastUsable ? s.forecast! : undefined,
    satellite: satUsable ? sat! : undefined,
    demoClouds: s.profile.demoClouds,
  };
}

/** Satellite refresh: native slots land every 10–15 min; an uncovered cell is rechecked daily. */
const SAT_TTL_MS = 10 * 60_000;
const SAT_UNCOVERED_TTL_MS = 24 * 3_600_000;
/** Within this age an incremental fetch (last few hours) is merged instead of re-fetching 50 h. */
const SAT_INCREMENTAL_MAX_AGE_MS = (SAT_REFRESH_PAST_HOURS - 1) * 3_600_000;

export const defaultSunscreen = (p: Profile, at: number): SunscreenApplication => ({
  spfLabel: p.spf,
  filter: p.filter,
  mgPerCm2: p.mgPerCm2,
  waterResistant: p.waterResistant,
  appliedAt: at,
});

export const settingsFor = (s: Pick<State, 'profile' | 'shade' | 'custom'>): ExposureSettings =>
  s.custom ? { ...s.custom, shade: s.shade } : settingsForPreset(s.profile.preset, s.shade);

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Minutes until each unfired threshold for the worst site, projected from now with the forecast. */
function thresholdMinutes(s: Session, ctx: UVContext, profile: SkinProfile, cautious: number): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const envAt = envAtFor(ctx);
  for (const th of [0.5, 0.8, 1]) {
    if (s.thresholdsFired.includes(th)) continue;
    let best: number | null = null;
    for (const [posture, st] of Object.entries(s.sites)) {
      const p = project(st!, envAt, { ...s.settings, posture: posture as ExposureSettings['posture'] }, { ...profile, cUser: s.cUserAtSession }, {
        target: th / cautious, // alerts use the cautious dose (central × band hi)
        horizonMin: 8 * 60,
        stepMin: 2,
      });
      if (p.minutesToTarget !== null && (best === null || p.minutesToTarget < best)) best = p.minutesToTarget;
    }
    out[String(th)] = best;
  }
  return out;
}

let lastAlertKey = '';

// ---------------------------------------------------------------- demo nudge

let demoNudgeTimer: ReturnType<typeof setTimeout> | null = null;

function cancelDemoNudge() {
  if (demoNudgeTimer) clearTimeout(demoNudgeTimer);
  demoNudgeTimer = null;
  void notify.cancel('demo-nudge');
}

/**
 * The demo's scripted sunscreen notification, DEMO_NUDGE_AFTER_S after entering or
 * jumping. A real OS notification when allowed (asks once, since the user just chose
 * to start the demo); otherwise, or on web, an in-app banner.
 */
function scheduleDemoNudge(moment: DemoMoment) {
  cancelDemoNudge();
  const nudge = DEMO_NUDGES[moment];
  if (!nudge) return;
  void notify.ensurePermission().then(async (ok) => {
    if (ok && (await notify.canNotify())) {
      await notify.scheduleDemoNudge(DEMO_NUDGE_AFTER_S, nudge.title, nudge.body);
      return;
    }
    demoNudgeTimer = setTimeout(() => {
      demoNudgeTimer = null;
      const s = useStore.getState();
      // the banner appends ". Tap to dismiss.", so drop the body's final full stop
      if (s.demo?.moment === moment) useStore.setState({ banner: `${nudge.title} ${nudge.body.replace(/\.$/, '')}` });
    }, DEMO_NUDGE_AFTER_S * 1000);
  });
}

/** Mackenzie's state at a demo moment, built by the real engine. The demo clock starts at that moment and runs. */
function demoSlices(moment: DemoMoment) {
  const d = buildDemo(moment);
  const base: Profile = { ...DEFAULT_PROFILE, ...DEMO_PROFILE, demoClockOffsetMs: DEMO_MOMENTS[moment].t - Date.now() };
  return {
    profile: recalibrated(base, d.checkIns),
    place: d.place as Place,
    forecast: null,
    satellite: null,
    shade: (d.active?.settings.shade ?? 'none') as Shade,
    custom: null,
    active: d.active,
    sessions: d.sessions,
    sunscreen: d.sunscreen as LoggedSunscreen[],
    checkIns: d.checkIns,
  };
}

// ---------------------------------------------------------------- store

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      place: null,
      forecast: null,
      forecastError: null,
      satellite: null,
      fetching: false,
      shade: 'none',
      custom: null,
      active: null,
      sessions: [],
      sunscreen: [],
      checkIns: [],
      banner: null,
      demo: null,
      realSnapshot: null,

      setProfile: (p) =>
        set((s) => {
          const next = { ...s.profile, ...p };
          // the prior depends on skin type, and old answers are re-read against it
          const profile = p.skinType != null && p.skinType !== s.profile.skinType ? recalibrated(next, s.checkIns) : next;
          // choosing a default activity replaces any custom choice for the next session
          return p.preset != null ? { profile, custom: null } : { profile };
        }),

      setPlace: (place) => {
        if (get().demo) return; // the demo has its own places; don't touch the real one or fetch
        set({ place });
        void get().refreshForecast();
      },

      refreshForecast: async (force = false) => {
        const { place, forecast, satellite, fetching, demo } = get();
        if (!place || fetching || demo || place.source === 'demo') return;
        // Providers only ever see the privacy cell centre, never the user's point (SPECS §3.2 Privacy)
        const cell = privacyCell(place.lat, place.lon);
        const now = Date.now();
        const fcFresh = forecast && now - forecast.fetchedAt < 30 * 60_000 && cellKey(forecast) === cellKey(cell);
        const sameCell = satellite && cellKey(satellite.cell) === cellKey(cell);
        const satFresh = sameCell && now - satellite.fetchedAt < (satellite.covered ? SAT_TTL_MS : SAT_UNCOVERED_TTL_MS);
        // incremental only when what we hold is native-step, covered and recent; otherwise a full fetch
        const satIncremental =
          sameCell && satellite.covered && satellite.stepMs != null && now - satellite.fetchedAt < SAT_INCREMENTAL_MAX_AGE_MS;
        if (fcFresh && satFresh && !force) return;
        set({ fetching: true });
        const [f, sat] = await Promise.allSettled([
          fcFresh && !force ? Promise.resolve(forecast!) : fetchForecast(cell.lat, cell.lon),
          satFresh && !force
            ? Promise.resolve(satellite!)
            : satIncremental
              ? fetchSatellite(cell, undefined, SAT_REFRESH_PAST_HOURS).then((fresh) => mergeSatellite(get().satellite, fresh))
              : fetchSatellite(cell),
        ]);
        set({
          fetching: false,
          ...(f.status === 'fulfilled'
            ? { forecast: f.value, forecastError: null }
            : { forecastError: f.reason instanceof Error ? f.reason.message : 'Forecast unavailable' }),
          // satellite is an enhancement: on failure keep whatever we had, NWP clouds cover the gap
          ...(sat.status === 'fulfilled' ? { satellite: sat.value } : {}),
        });
      },

      setActivity: (x) => {
        const match = presetMatching(x, get().profile.preset);
        const shade = x.shade ?? 'none';
        set((s) => ({
          shade,
          custom: match ? null : { ...x, shade },
          profile: match ? { ...s.profile, preset: match } : s.profile,
        }));
        const { active, profile } = get();
        if (active && active.status !== 'completed') {
          get().tick();
          const a = get().active!;
          set({ active: changeSettings(a, a.lastT, { ...x, shade }, match ?? profile.preset) });
          lastAlertKey = '';
          get().tick();
        }
      },

      start: () => {
        const s = get();
        if (s.active && s.active.status !== 'completed') return; // only one active session (§14.2)
        const now = nowFor(s.profile);
        let session = startSession(now, s.profile.preset, s.shade, skinProfile(s.profile));
        if (s.custom) session = changeSettings(session, now, { ...s.custom, shade: s.shade }, s.profile.preset);
        session.demo = s.profile.uvMode === 'demo';
        // sunscreen applied in the last few hours carries into the session
        const recent = [...s.sunscreen].reverse().find((a) => now - a.appliedAt < 4 * 3_600_000 && a.appliedAt <= now);
        if (recent) session = applySunscreen(session, recent);
        set({ active: session });
        lastAlertKey = '';
        if (s.profile.notifications) void notify.ensurePermission();
      },

      pause: () => {
        get().tick();
        const a = get().active;
        if (!a || a.status !== 'active') return;
        set({ active: setStatus(a, nowFor(get().profile), 'paused') });
        void notify.cancelBurnAlerts();
      },

      resume: () => {
        const a = get().active;
        if (!a || a.status !== 'paused') return;
        const now = nowFor(get().profile);
        set({ active: setStatus({ ...a, lastT: now }, now, 'active') });
        lastAlertKey = '';
        get().tick();
      },

      end: () => {
        get().tick();
        const { active, profile, sessions } = get();
        if (!active) return;
        const done = setStatus(active, nowFor(profile), 'completed');
        const all = [done, ...sessions];
        set({ active: null, sessions: all });
        void notify.cancelBurnAlerts();
        void notify.cancel('sunscreen');
        if (!done.demo) upsertCheckIn(localDayKey(done.startedAt));
      },

      tick: () => {
        const s = get();
        const a = s.active;
        const ctx = uvContext(s);
        if (!a || !ctx) return;
        const now = nowFor(s.profile);
        const profile = skinProfile(s.profile);
        const next = stepSession(a, now, envAtFor(ctx), profile);
        const { fraction } = currentFraction(next, profile);
        // Alerts err early: they fire on the cautious dose, central × the measured 90th-percentile band.
        const k = cautiousFactor(ctx, now, next.outdoorSeconds / 3600, profile.medLogSpread);
        const crossed = newlyCrossed(next, fraction * k);
        const updated = crossed.length ? { ...next, thresholdsFired: [...next.thresholdsFired, ...crossed] } : next;
        set({
          active: updated,
          banner: crossed.length
            ? crossed.includes(1)
              ? 'You may have reached your estimated burn threshold'
              : `You may be at about ${Math.round(Math.max(...crossed) * 100)}% of your estimated burn threshold`
            : s.banner,
        });
        if (updated.status === 'active' && s.profile.notifications) {
          const mins = thresholdMinutes(updated, ctx, profile, k);
          const key = JSON.stringify(mins);
          if (key !== lastAlertKey) {
            lastAlertKey = key;
            void notify.scheduleBurnAlerts(mins);
          }
        }
      },

      logSunscreen: (app) => {
        const s = get();
        const now = nowFor(s.profile);
        const entry: LoggedSunscreen = { ...app, appliedAt: app.appliedAt ?? now, id: id(), sessionId: s.active?.id };
        set({ sunscreen: [...s.sunscreen, entry] });
        if (s.active && s.active.status !== 'completed') {
          get().tick();
          set({ active: applySunscreen(get().active!, entry) });
          lastAlertKey = '';
          get().tick();
        }
        if (s.profile.notifications) {
          const elapsedMin = (now - entry.appliedAt) / 60_000;
          void notify.ensurePermission().then((ok) => {
            if (ok) void notify.scheduleSunscreenReminder(Math.max(1, Math.round(s.profile.reminderMin - elapsedMin)));
          });
        }
      },

      addPastSession: ({ start, end, preset, shade, sunscreenAt, settings }) => {
        const s = get();
        const ctx = uvContext(s);
        const now = nowFor(s.profile);
        if (!ctx) return { ok: false, reason: 'Set a location first.' };
        if (end <= start) return { ok: false, reason: 'End must be after start.' };
        if (end > now) return { ok: false, reason: 'That time hasn’t happened yet.' };
        if (now - start > 2 * 24 * 3_600_000) return { ok: false, reason: 'Only today and yesterday can be added.' };
        const clash = [...s.sessions, ...(s.active ? [s.active] : [])].some((x) => overlaps(x, start, end, now));
        if (clash) return { ok: false, reason: 'Overlaps a session you already have.' };
        // Wire the form to existing integration functions; no dose rules change.
        let session = startSession(start, preset, shade, skinProfile(s.profile), 'retroactive');
        if (settings) session = changeSettings(session, start, { ...settings, shade }, preset);
        if (sunscreenAt != null && sunscreenAt <= start) {
          session = applySunscreen(session, { ...defaultSunscreen(s.profile, sunscreenAt), appliedAt: start });
        }
        if (sunscreenAt != null && sunscreenAt > start && sunscreenAt < end) {
          session = stepSession(session, sunscreenAt, envAtFor(ctx), skinProfile(s.profile));
          session = applySunscreen(session, defaultSunscreen(s.profile, sunscreenAt));
        }
        session = stepSession(session, end, envAtFor(ctx), skinProfile(s.profile));
        session = setStatus(session, end, 'completed');
        session.demo = s.profile.uvMode === 'demo';
        set({ sessions: [session, ...s.sessions].sort((a, b) => b.startedAt - a.startedAt) });
        if (!session.demo) upsertCheckIn(localDayKey(start));
        return { ok: true };
      },

      deleteSession: (sid) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== sid) })),

      answerCheckIn: (day, r) => {
        const s = get();
        const c = s.checkIns.find((x) => x.day === day);
        if (!c || c.answeredAt) return;
        const resetAt = s.profile.calibrationResetAt ?? 0;
        const answered = answerCheckIn({ ...c, cUserBefore: s.profile.cUser }, r, Date.now(), s.profile.skinType, s.checkIns, resetAt);
        const checkIns = s.checkIns.map((x) => (x.day === day ? answered : x));
        set({ checkIns, profile: recalibrated(s.profile, checkIns) });
        void notify.cancel(`checkin-${day}`);
      },

      resetCalibration: () =>
        set((s) => ({ profile: recalibrated({ ...s.profile, calibrationResetAt: Date.now() }, s.checkIns) })),

      enterDemo: (moment = DEMO_START) => {
        const s = get();
        if (s.demo) return get().jumpDemo(moment);
        // set the real data aside (persisted, so it survives the app closing mid-demo)
        const realSnapshot: RealSnapshot = {
          profile: s.profile, place: s.place, forecast: s.forecast, satellite: s.satellite, shade: s.shade,
          custom: s.custom, active: s.active, sessions: s.sessions, sunscreen: s.sunscreen, checkIns: s.checkIns,
        };
        void notify.cancelBurnAlerts();
        void notify.cancel('sunscreen');
        set({ realSnapshot, demo: { moment }, ...demoSlices(moment), banner: null, forecastError: null });
        lastAlertKey = '';
        scheduleDemoNudge(moment);
      },

      jumpDemo: (moment) => {
        if (!get().demo) return;
        set({ demo: { moment }, ...demoSlices(moment), banner: null });
        lastAlertKey = '';
        scheduleDemoNudge(moment);
      },

      exitDemo: () => {
        cancelDemoNudge();
        const s = get();
        const real = s.realSnapshot;
        if (real) set({ ...real, demo: null, realSnapshot: null, banner: null, forecastError: null });
        // old-style demo (sky and clock only, before personas): just switch the mode back
        else set({ demo: null, profile: { ...s.profile, uvMode: 'forecast', demoClockOffsetMs: 0 }, place: s.place?.source === 'demo' ? null : s.place });
        lastAlertKey = '';
        void get().refreshForecast(true);
      },

      clearBanner: () => set({ banner: null }),

      deleteAll: () => {
        void notify.cancelBurnAlerts();
        set({ profile: DEFAULT_PROFILE, place: null, forecast: null, satellite: null, active: null, sessions: [], sunscreen: [], checkIns: [], custom: null, shade: 'none', demo: null, realSnapshot: null });
      },
    }),
    {
      name: 'cloudscreen-v1',
      storage: createJSONStorage(() => kvStorage),
      partialize: ({ banner, fetching, forecastError, ...rest }) => rest,
      version: 1,
    },
  ),
);

/** Create or refresh the check-in for a day and (re)schedule its notification. */
function upsertCheckIn(day: string) {
  const s = useStore.getState();
  const existing = s.checkIns.find((c) => c.day === day);
  if (existing?.answeredAt) return;
  const c = checkInForDay(s.sessions, day, s.profile.cUser);
  if (!c) return;
  useStore.setState({ checkIns: [...s.checkIns.filter((x) => x.day !== day), c] });
  if (s.profile.notifications) void notify.ensurePermission().then((ok) => {
      if (ok) void notify.scheduleCheckIn(day, c.promptAt);
    });
}

export function pendingCheckIn(s: Pick<State, 'checkIns' | 'sessions'>): CheckIn | null {
  const now = Date.now();
  return s.checkIns.filter((c) => !c.answeredAt && c.promptAt <= now && now - c.promptAt < 3 * 86_400_000).sort((a, b) => b.promptAt - a.promptAt)[0] ?? null;
}
