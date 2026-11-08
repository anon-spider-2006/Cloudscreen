/**
 * App state (Zustand), persisted locally through the SQLite key-value store.
 * All dose maths lives in src/engine and src/model; this file only wires state to it.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  answerCheckIn,
  applySunscreen,
  changeSettings,
  checkInForDay,
  currentFraction,
  envAtFor,
  localDayKey,
  newlyCrossed,
  overlaps,
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
} from '@/model';
import { DEMO_PLACE, kmBetween, type Place } from '@/services/location';
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
}

interface Actions {
  setProfile: (p: Partial<Profile>) => void;
  setPlace: (p: Place) => void;
  refreshForecast: (force?: boolean) => Promise<void>;
  setShade: (s: Shade) => void;
  setPreset: (p: Preset) => void;
  setCustom: (x: ExposureSettings | null) => void;
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
  startDemo: () => void;
  stopDemo: () => void;
  clearBanner: () => void;
  deleteAll: () => void;
}

export type Store = State & Actions;

// ---------------------------------------------------------------- selectors / helpers (pure)

export const nowFor = (p: Profile) => Date.now() + (p.uvMode === 'demo' ? p.demoClockOffsetMs : 0);

export const skinProfile = (p: Profile): SkinProfile => ({ skinType: p.skinType, cUser: p.cUser });

export function uvContext(s: Pick<State, 'place' | 'forecast' | 'profile'>): UVContext | null {
  if (!s.place) return null;
  const forecastUsable = s.forecast && kmBetween(s.forecast, s.place) < 25;
  return {
    lat: s.place.lat,
    lon: s.place.lon,
    mode: s.profile.uvMode,
    forecast: forecastUsable ? s.forecast! : undefined,
    demoClouds: s.profile.demoClouds,
  };
}

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
function thresholdMinutes(s: Session, ctx: UVContext, profile: SkinProfile): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const envAt = envAtFor(ctx);
  for (const th of [0.5, 0.8, 1]) {
    if (s.thresholdsFired.includes(th)) continue;
    let best: number | null = null;
    for (const [posture, st] of Object.entries(s.sites)) {
      const p = project(st!, envAt, { ...s.settings, posture: posture as ExposureSettings['posture'] }, { ...profile, cUser: s.cUserAtSession }, {
        target: th,
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

// ---------------------------------------------------------------- store

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      place: null,
      forecast: null,
      forecastError: null,
      fetching: false,
      shade: 'none',
      custom: null,
      active: null,
      sessions: [],
      sunscreen: [],
      checkIns: [],
      banner: null,

      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

      setPlace: (place) => {
        set({ place });
        void get().refreshForecast();
      },

      refreshForecast: async (force = false) => {
        const { place, forecast, fetching } = get();
        if (!place || fetching || place.source === 'demo') return;
        const fresh = forecast && Date.now() - forecast.fetchedAt < 30 * 60_000 && kmBetween(forecast, place) < 10;
        if (fresh && !force) return;
        set({ fetching: true });
        try {
          const f = await fetchForecast(place.lat, place.lon);
          set({ forecast: f, forecastError: null, fetching: false });
        } catch (e) {
          set({ forecastError: e instanceof Error ? e.message : 'Forecast unavailable', fetching: false });
        }
      },

      setShade: (shade) => {
        set({ shade });
        const { active } = get();
        if (active && active.status !== 'completed') {
          get().tick();
          const a = get().active!;
          set({ active: changeSettings(a, a.lastT, { ...a.settings, shade }, a.preset) });
          lastAlertKey = '';
          get().tick();
        }
      },

      setPreset: (preset) => {
        set((s) => ({ profile: { ...s.profile, preset }, custom: null }));
        const { active, shade } = get();
        if (active && active.status !== 'completed') {
          get().tick();
          const a = get().active!;
          set({ active: changeSettings(a, a.lastT, settingsForPreset(preset, shade), preset) });
          lastAlertKey = '';
          get().tick();
        }
      },

      setCustom: (custom) => {
        set({ custom });
        const { active, shade, profile } = get();
        if (active && active.status !== 'completed' && custom) {
          get().tick();
          const a = get().active!;
          set({ active: changeSettings(a, a.lastT, { ...custom, shade }, profile.preset) });
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
        const crossed = newlyCrossed(next, fraction);
        const updated = crossed.length ? { ...next, thresholdsFired: [...next.thresholdsFired, ...crossed] } : next;
        set({
          active: updated,
          banner: crossed.length
            ? crossed.includes(1)
              ? 'Estimated burn threshold reached'
              : `About ${Math.round(Math.max(...crossed) * 100)}% of your estimated burn threshold`
            : s.banner,
        });
        if (updated.status === 'active' && s.profile.notifications) {
          const mins = thresholdMinutes(updated, ctx, profile);
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
        const answered = answerCheckIn({ ...c, cUserBefore: s.profile.cUser }, r, Date.now());
        set({
          checkIns: s.checkIns.map((x) => (x.day === day ? answered : x)),
          profile: { ...s.profile, cUser: answered.cUserAfter ?? s.profile.cUser },
        });
        void notify.cancel(`checkin-${day}`);
      },

      resetCalibration: () => set((s) => ({ profile: { ...s.profile, cUser: 1 } })),

      startDemo: () => {
        // "Miami, July, noon": next 15 July at 12:30 EDT, clear sky, physics model.
        const y = new Date().getUTCFullYear();
        let target = Date.UTC(y, 6, 15, 16, 30);
        if (target < Date.now() - 180 * 86_400_000) target = Date.UTC(y + 1, 6, 15, 16, 30);
        const s = get();
        if (s.active) get().end();
        set({
          place: DEMO_PLACE,
          profile: { ...s.profile, uvMode: 'demo', demoClockOffsetMs: target - Date.now(), demoClouds: { low: 0, mid: 0, high: 0 } },
        });
      },

      stopDemo: () => {
        const s = get();
        if (s.active) get().end();
        set({ profile: { ...s.profile, uvMode: 'forecast', demoClockOffsetMs: 0 }, place: s.place?.source === 'demo' ? null : s.place });
      },

      clearBanner: () => set({ banner: null }),

      deleteAll: () => {
        void notify.cancelBurnAlerts();
        set({ profile: DEFAULT_PROFILE, place: null, forecast: null, active: null, sessions: [], sunscreen: [], checkIns: [], custom: null, shade: 'none' });
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
