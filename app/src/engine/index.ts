/**
 * App engine: pure functions between the dose model (src/model) and the UI.
 * No React or Expo imports, so it runs under `node --test` like the model.
 *
 *  - environment: build envAt(t) from the forecast / physics / demo source
 *  - sessions:    multi-site live sessions (§4.5 worst site), pause/resume, sunscreen
 *  - timeToBurn:  instant "time to burn now" (§7.2)
 *  - planner:     best start times over a day (§7.5)
 *  - replay:      sessions added after the fact (§4.9)
 *  - calibration: next-morning check-in (§6.4)
 */
import { getTimes } from 'suncalc';
import {
  ALERT_THRESHOLDS,
  CMF_FIT_INFO,
  MED_SED,
  PRESETS,
  WORST_SITE_POSTURES,
  advance,
  burnFraction,
  calibrationPromptTime,
  effectiveSPF,
  explainRate,
  newFilm,
  newSession,
  project,
  readUV,
  updateCUser,
  type CloudLayers,
  type ExposureSettings,
  type Forecast,
  type Posture,
  type Preset,
  type Redness,
  type SessionState,
  type Shade,
  type SkinProfile,
  type SunscreenApplication,
  type UVMode,
  type UVReading,
} from '../model/index.ts';

export const MODEL_VERSION = `cloudscreen-model-1 (allaart temis2017, cmf ${CMF_FIT_INFO.points}pts rmse ${CMF_FIT_INFO.rmse})`;

// ---------------------------------------------------------------- environment

export interface UVContext {
  lat: number;
  lon: number;
  mode: UVMode;
  forecast?: Forecast;
  demoClouds?: CloudLayers;
}

export function readAt(ctx: UVContext, t: number): UVReading {
  return readUV({ t, lat: ctx.lat, lon: ctx.lon }, ctx.mode, { forecast: ctx.forecast, demoClouds: ctx.demoClouds });
}

export const envAtFor = (ctx: UVContext) => (t: number) => readAt(ctx, t);

/** Horizontal (ambient) SED for dt seconds at uvi. */
const ambientSED = (uvi: number, dtSec: number) => (0.025 * Math.max(0, uvi) * dtSec) / 100;

export function sitesFor(settings: ExposureSettings): Posture[] {
  return settings.posture === 'lying' ? ['lying'] : [...WORST_SITE_POSTURES];
}

export function settingsForPreset(preset: Preset, shade: Shade = 'none'): ExposureSettings {
  const { posture, surface, activity } = PRESETS[preset];
  return { posture, surface, activity, shade };
}

// ---------------------------------------------------------------- sessions

export type SessionStatus = 'active' | 'paused' | 'completed';
export type TrackingMode = 'manual' | 'retroactive';

export interface SessionEvent {
  t: number;
  kind: 'start' | 'pause' | 'resume' | 'end' | 'sunscreen' | 'settings';
  detail?: string;
}

export interface Session {
  id: string;
  status: SessionStatus;
  trackingMode: TrackingMode;
  startedAt: number;
  endedAt?: number;
  /** Time the dose was last integrated up to. */
  lastT: number;
  preset: Preset;
  settings: ExposureSettings;
  /** One model state per tracked body site. */
  sites: Partial<Record<Posture, SessionState>>;
  outdoorSeconds: number;
  ambientSED: number;
  peakFraction: number;
  worstSite: Posture;
  thresholdsFired: number[];
  cUserAtSession: number;
  lastSunscreenAt?: number;
  lastSpf?: number;
  events: SessionEvent[];
  /** Max UVI seen, and dose-weighted sum for the average. */
  maxUVI: number;
  uviSeconds: number;
  usedFallback: boolean;
  /** Recorded in demo mode; excluded from calibration. */
  demo?: boolean;
  modelVersion: string;
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function startSession(
  now: number,
  preset: Preset,
  shade: Shade,
  profile: SkinProfile,
  trackingMode: TrackingMode = 'manual',
): Session {
  const settings = settingsForPreset(preset, shade);
  const sites: Partial<Record<Posture, SessionState>> = {};
  for (const p of sitesFor(settings)) sites[p] = newSession(now);
  return {
    id: uid(),
    status: 'active',
    trackingMode,
    startedAt: now,
    lastT: now,
    preset,
    settings,
    sites,
    outdoorSeconds: 0,
    ambientSED: 0,
    peakFraction: 0,
    worstSite: sitesFor(settings)[0],
    thresholdsFired: [],
    cUserAtSession: profile.cUser,
    events: [{ t: now, kind: 'start', detail: PRESETS[preset].label }],
    maxUVI: 0,
    uviSeconds: 0,
    usedFallback: false,
    modelVersion: MODEL_VERSION,
  };
}

/** Largest step with constant environment. Forecast is hourly; 5 min keeps interpolation smooth. */
const MAX_ENV_STEP_S = 300;

/** Integrate the session from lastT to `now`. Paused/completed sessions only move the clock. */
export function stepSession(s: Session, now: number, envAt: (t: number) => UVReading, profile: SkinProfile): Session {
  if (now <= s.lastT) return s;
  if (s.status !== 'active') {
    const sites = mapSites(s.sites, (st) => ({ ...st, t: now }));
    return { ...s, lastT: now, sites };
  }
  let t = s.lastT;
  let sites = s.sites;
  let { ambientSED: amb, outdoorSeconds, maxUVI, uviSeconds, usedFallback } = s;
  while (t < now) {
    const dt = Math.min(MAX_ENV_STEP_S, (now - t) / 1000);
    const env = envAt(t + (dt * 1000) / 2);
    if (env.mode !== 'forecast' && env.mode !== 'demo') usedFallback = true;
    sites = mapSites(sites, (st, posture) => advance({ ...st, t }, dt, env, { ...s.settings, posture }));
    amb += ambientSED(env.uvi, dt);
    outdoorSeconds += dt;
    maxUVI = Math.max(maxUVI, env.uvi);
    uviSeconds += env.uvi * dt;
    t += dt * 1000;
  }
  const { worst, fraction } = worstOf(sites, { skinType: profile.skinType, cUser: s.cUserAtSession });
  return {
    ...s,
    lastT: now,
    sites,
    ambientSED: amb,
    outdoorSeconds,
    maxUVI,
    uviSeconds,
    usedFallback,
    worstSite: worst,
    peakFraction: Math.max(s.peakFraction, fraction),
  };
}

function mapSites(
  sites: Partial<Record<Posture, SessionState>>,
  f: (st: SessionState, p: Posture) => SessionState,
): Partial<Record<Posture, SessionState>> {
  const out: Partial<Record<Posture, SessionState>> = {};
  for (const [p, st] of Object.entries(sites) as [Posture, SessionState][]) out[p] = f(st, p);
  return out;
}

export function worstOf(sites: Partial<Record<Posture, SessionState>>, p: SkinProfile) {
  let worst: Posture = 'upright';
  let fraction = -1;
  for (const [posture, st] of Object.entries(sites) as [Posture, SessionState][]) {
    const f = burnFraction(st, p);
    if (f > fraction) {
      fraction = f;
      worst = posture;
    }
  }
  return { worst, fraction: Math.max(0, fraction) };
}

export function currentFraction(s: Session, profile: SkinProfile) {
  return worstOf(s.sites, { skinType: profile.skinType, cUser: s.cUserAtSession });
}

export function setStatus(s: Session, now: number, status: SessionStatus): Session {
  const kind = status === 'paused' ? 'pause' : status === 'active' ? 'resume' : 'end';
  return {
    ...s,
    status,
    endedAt: status === 'completed' ? now : s.endedAt,
    events: [...s.events, { t: now, kind }],
  };
}

/** Change preset/shade/custom settings from `now` on. Sites are re-created if the posture family changes. */
export function changeSettings(s: Session, now: number, settings: ExposureSettings, preset: Preset): Session {
  const oldSites = sitesFor(s.settings).join();
  const newSiteList = sitesFor(settings);
  let sites = s.sites;
  if (oldSites !== newSiteList.join()) {
    // keep the worst existing dose as the starting dose for the new site(s), so switching posture never resets dose
    const ref = s.sites[s.worstSite] ?? Object.values(s.sites)[0] ?? newSession(now);
    sites = {};
    for (const p of newSiteList) sites[p] = { ...ref, t: now, film: ref.film ? { ...ref.film } : null };
  }
  return {
    ...s,
    preset,
    settings,
    sites,
    events: [...s.events, { t: now, kind: 'settings', detail: describeSettings(settings) }],
  };
}

export function applySunscreen(s: Session, app: SunscreenApplication): Session {
  return {
    ...s,
    sites: mapSites(s.sites, (st) => ({ ...st, film: newFilm(app) })),
    lastSunscreenAt: app.appliedAt,
    lastSpf: app.spfLabel,
    events: [...s.events, { t: app.appliedAt, kind: 'sunscreen', detail: `SPF ${app.spfLabel}` }],
  };
}

/** Thresholds (0.5, 0.8, 1) newly crossed since the last check. */
export function newlyCrossed(s: Session, fraction: number): number[] {
  return ALERT_THRESHOLDS.filter((th) => fraction >= th && !s.thresholdsFired.includes(th));
}

export function currentSPF(s: Session): number {
  return effectiveSPF(s.sites[s.worstSite]?.film ?? null);
}

export function skinDose(s: Session) {
  const st = s.sites[s.worstSite];
  return { protectedSED: st?.doseSED ?? 0, unprotectedSED: st?.ambientSED ?? 0 };
}

export function describeSettings(x: ExposureSettings): string {
  return `${x.posture}, ${x.surface}, ${x.activity}${x.shade && x.shade !== 'none' ? `, ${x.shade} shade` : ''}`;
}

// ---------------------------------------------------------------- time to burn now

export interface SiteProjection {
  site: Posture;
  minutes: number | null;
}

export interface TimeToBurn {
  bare: SiteProjection[];
  withSunscreen: SiteProjection[] | null;
  /** Worst site: smallest minutes. null minutes = not reached before horizon. */
  bareWorst: SiteProjection;
  sunscreenWorst: SiteProjection | null;
}

function minutesUntilSunset(now: number, lat: number, lon: number): number {
  const times = getTimes(new Date(now), lat, lon);
  const sunset = times.sunset?.getTime();
  if (!sunset || Number.isNaN(sunset) || sunset <= now) return 0;
  return Math.ceil((sunset - now) / 60_000);
}

function pickWorst(list: SiteProjection[]): SiteProjection {
  return [...list].sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity))[0];
}

export function timeToBurnNow(args: {
  now: number;
  ctx: UVContext;
  profile: SkinProfile;
  settings: ExposureSettings;
  /** Today's protected dose so far at the worst site, SED. */
  priorDoseSED?: number;
  sunscreen?: SunscreenApplication | null;
}): TimeToBurn {
  const { now, ctx, profile, settings, priorDoseSED = 0, sunscreen } = args;
  const horizonMin = Math.max(2, Math.min(12 * 60, minutesUntilSunset(now, ctx.lat, ctx.lon)));
  const envAt = envAtFor(ctx);
  const run = (film: SunscreenApplication | null): SiteProjection[] =>
    sitesFor(settings).map((site) => {
      const start: SessionState = { ...newSession(now, film ? newFilm(film) : null), doseSED: priorDoseSED };
      const p = project(start, envAt, { ...settings, posture: site }, profile, { horizonMin, stepMin: 2 });
      return { site, minutes: p.minutesToTarget };
    });
  const bare = run(null);
  const withSunscreen = sunscreen ? run({ ...sunscreen, appliedAt: now }) : null;
  return {
    bare,
    withSunscreen,
    bareWorst: pickWorst(bare),
    sunscreenWorst: withSunscreen ? pickWorst(withSunscreen) : null,
  };
}

// ---------------------------------------------------------------- planner

export interface PlanSlot {
  start: number;
  /** Peak burn fraction over the planned duration at the worst site. */
  peakFraction: number;
  worstSite: Posture;
  skinSED: number;
  ambientSED: number;
  minutesToBurn: number | null;
}

export interface Plan {
  slots: PlanSlot[];
  sunrise: number;
  sunset: number;
  /** Start times in the lowest third of peak fraction. */
  lowest: number[];
}

/** Evaluate every `stepMin` start time between sunrise and sunset-duration on the day of `day`. */
export function planDay(args: {
  day: number;
  durationMin: number;
  ctx: UVContext;
  profile: SkinProfile;
  settings: ExposureSettings;
  sunscreen?: SunscreenApplication | null;
  stepMin?: number;
}): Plan {
  const { day, durationMin, ctx, profile, settings, sunscreen, stepMin = 30 } = args;
  const times = getTimes(new Date(day), ctx.lat, ctx.lon);
  const sunrise = times.sunrise?.getTime() ?? NaN;
  const sunset = times.sunset?.getTime() ?? NaN;
  const envAt = envAtFor(ctx);
  const slots: PlanSlot[] = [];
  if (Number.isNaN(sunrise) || Number.isNaN(sunset)) return { slots, sunrise, sunset, lowest: [] };
  const first = Math.ceil(sunrise / (stepMin * 60_000)) * stepMin * 60_000;
  for (let start = first; start + durationMin * 60_000 <= sunset + 1; start += stepMin * 60_000) {
    let best: PlanSlot | null = null;
    for (const site of sitesFor(settings)) {
      let st = newSession(start, sunscreen ? newFilm({ ...sunscreen, appliedAt: start }) : null);
      let amb = 0;
      const x = { ...settings, posture: site };
      const step = 5;
      let minutesToBurn: number | null = null;
      for (let m = 0; m < durationMin; m += step) {
        const dt = Math.min(step, durationMin - m) * 60;
        const env = envAt(st.t + (dt * 1000) / 2);
        st = advance(st, dt, env, x);
        amb += ambientSED(env.uvi, dt);
        if (minutesToBurn === null && burnFraction(st, profile) >= 1) minutesToBurn = m + step;
      }
      const f = burnFraction(st, profile);
      if (!best || f > best.peakFraction)
        best = { start, peakFraction: f, worstSite: site, skinSED: st.doseSED, ambientSED: amb, minutesToBurn };
    }
    if (best) slots.push(best);
  }
  const sorted = [...slots].sort((a, b) => a.peakFraction - b.peakFraction);
  const cut = sorted[Math.max(0, Math.floor(sorted.length / 3) - 1)]?.peakFraction ?? 0;
  const lowest = slots.filter((s) => s.peakFraction <= cut).map((s) => s.start);
  return { slots, sunrise, sunset, lowest };
}

/** Daily UV outlook from the forecast: peak UVI and hours with UVI ≥ 3, per UTC-offset local day. */
export function dailyOutlook(forecast: Forecast, tzOffsetMin: number) {
  const days = new Map<string, { day: string; peak: number; hoursAbove3: number; t: number }>();
  for (const h of forecast.hours) {
    const local = new Date(h.t - tzOffsetMin * 60_000);
    const key = local.toISOString().slice(0, 10);
    const d = days.get(key) ?? { day: key, peak: 0, hoursAbove3: 0, t: h.t };
    d.peak = Math.max(d.peak, h.uvi);
    if (h.uvi >= 3) d.hoursAbove3 += 1;
    days.set(key, d);
  }
  return [...days.values()];
}

// ---------------------------------------------------------------- replay (added after the fact)

export function replaySession(args: {
  start: number;
  end: number;
  ctx: UVContext;
  profile: SkinProfile;
  preset: Preset;
  shade: Shade;
  sunscreen?: SunscreenApplication | null;
}): Session {
  const { start, end, ctx, profile, preset, shade, sunscreen } = args;
  const envAt = envAtFor(ctx);
  let s = startSession(start, preset, shade, profile, 'retroactive');
  if (sunscreen && sunscreen.appliedAt <= start) s = applySunscreen(s, { ...sunscreen, appliedAt: start });
  if (sunscreen && sunscreen.appliedAt > start && sunscreen.appliedAt < end) {
    s = stepSession(s, sunscreen.appliedAt, envAt, profile);
    s = applySunscreen(s, sunscreen);
  }
  s = stepSession(s, end, envAt, profile);
  return setStatus(s, end, 'completed');
}

export function overlaps(a: { startedAt: number; endedAt?: number }, start: number, end: number, now: number) {
  const aEnd = a.endedAt ?? now;
  return a.startedAt < end && start < aEnd;
}

// ---------------------------------------------------------------- days and calibration

export function localDayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface DaySummary {
  day: string;
  sessions: number;
  outdoorSeconds: number;
  ambientSED: number;
  unprotectedSED: number;
  protectedSED: number;
  peakFraction: number;
}

export function summarizeDays(sessions: Session[], profile: SkinProfile): DaySummary[] {
  const by = new Map<string, DaySummary>();
  for (const s of sessions) {
    const key = localDayKey(s.startedAt);
    const d = by.get(key) ?? { day: key, sessions: 0, outdoorSeconds: 0, ambientSED: 0, unprotectedSED: 0, protectedSED: 0, peakFraction: 0 };
    const dose = skinDose(s);
    d.sessions += 1;
    d.outdoorSeconds += s.outdoorSeconds;
    d.ambientSED += s.ambientSED;
    d.unprotectedSED += dose.unprotectedSED;
    d.protectedSED += dose.protectedSED;
    d.peakFraction = Math.max(d.peakFraction, dose.protectedSED / (medFor(profile.skinType) * s.cUserAtSession), s.peakFraction);
    by.set(key, d);
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

const medFor = (t: SkinProfile['skinType']) => MED_SED[t];

/** Protected dose today at the worst site, summed over today's sessions. */
export function todayProtectedSED(sessions: Session[], now: number): number {
  const key = localDayKey(now);
  return sessions.filter((s) => localDayKey(s.startedAt) === key).reduce((a, s) => a + skinDose(s).protectedSED, 0);
}

export interface CheckIn {
  day: string;
  sessionIds: string[];
  promptAt: number;
  predictedFraction: number;
  cUserBefore: number;
  redness?: Redness;
  cUserAfter?: number;
  answeredAt?: number;
}

/** Build (or refresh) the check-in for the day of a finished session. */
export function checkInForDay(sessions: Session[], day: string, cUser: number): CheckIn | null {
  const daySessions = sessions.filter((s) => localDayKey(s.startedAt) === day && s.status === 'completed');
  if (daySessions.length === 0) return null;
  const lastEnd = Math.max(...daySessions.map((s) => s.endedAt ?? s.lastT));
  return {
    day,
    sessionIds: daySessions.map((s) => s.id),
    promptAt: calibrationPromptTime(new Date(lastEnd)).getTime(),
    predictedFraction: Math.max(...daySessions.map((s) => s.peakFraction)),
    cUserBefore: cUser,
  };
}

export function answerCheckIn(c: CheckIn, redness: Redness, now: number): CheckIn {
  const cUserAfter = updateCUser(c.cUserBefore, { predictedFraction: c.predictedFraction, redness });
  return { ...c, redness, cUserAfter, answeredAt: now };
}

export { explainRate };
