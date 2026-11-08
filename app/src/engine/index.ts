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
import { wall } from '../utils/time.ts';
import {
  ALERT_THRESHOLDS,
  CMF_FIT_INFO,
  MED_SED,
  PRESETS,
  SHADES,
  SURFACES,
  WORST_SITE_POSTURES,
  advance,
  burnFraction,
  calibrationPromptTime,
  doseBand,
  effectiveSPF,
  explainRate,
  newFilm,
  newSession,
  project,
  readUV,
  SAT_PIXEL_KM,
  cUserOf,
  medPosterior,
  priorPosterior,
  withSkin,
  withSpatial,
  type DoseReport,
  type MedPosterior,
  type SkinType,
  type CloudLayers,
  type DoseBand,
  type ExposureSettings,
  type Forecast,
  type Posture,
  type Preset,
  type Redness,
  type SessionState,
  type SatelliteObs,
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
  /** Location uncertainty, km. Stays on device. */
  accuracyKm?: number;
  /** Altitude above sea level, km (UV +5%/km). Default: the forecast's elevation, else 0. */
  altitudeKm?: number;
  forecast?: Forecast;
  satellite?: SatelliteObs;
  demoClouds?: CloudLayers;
}

export function readAt(ctx: UVContext, t: number): UVReading {
  return readUV({ t, lat: ctx.lat, lon: ctx.lon, accuracyKm: ctx.accuracyKm, altitudeKm: ctx.altitudeKm }, ctx.mode, {
    forecast: ctx.forecast,
    satellite: ctx.satellite,
    demoClouds: ctx.demoClouds,
  });
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
  // unprotected = what bare skin would have got (incl. wet skin); older sessions only have the physical dose
  return { protectedSED: st?.doseSED ?? 0, unprotectedSED: st?.bareSED ?? st?.ambientSED ?? 0 };
}

// ---------------------------------------------------------------- activity: one vocabulary for every screen

const SURFACE_LABEL = Object.fromEntries(Object.entries(SURFACES).map(([k, v]) => [k, v.label])) as Record<keyof typeof SURFACES, string>;
const SHADE_LABEL = Object.fromEntries(Object.entries(SHADES).map(([k, v]) => [k, v.label])) as Record<keyof typeof SHADES, string>;

/**
 * The choices the model actually distinguishes. Posture: any upright setting tracks
 * face/arms and shoulders together (sitesFor), so 'shoulders' is not a separate
 * choice: it behaves exactly like upright and is labelled as such.
 */
export const POSITION_CHOICES = ['upright', 'lying'] as const;
export const SKIN_CHOICES = ['dry', 'sweating', 'swimming'] as const;

export const POSITION_LABEL: Record<Posture, string> = { upright: 'Upright', shoulders: 'Upright', lying: 'Lying down' };
export const SKIN_LABEL: Record<ExposureSettings['activity'], string> = { dry: 'Dry', sweating: 'Sweating', swimming: 'Swimming / in water' };
/** One-line meaning of each skin state, in model terms. */
export const SKIN_HELP: Record<ExposureSettings['activity'], string> = {
  dry: 'Normal wear on sunscreen.',
  sweating: 'Moving enough to sweat, or just hot: sunscreen wears 2× faster and wet skin burns about 16% sooner.',
  swimming: 'In and out of the water: sunscreen wears 4× faster and wet skin burns about 25% sooner.',
};

const normPosture = (p: Posture): Posture => (p === 'shoulders' ? 'upright' : p);

/** The preset these settings are (shade ignored), or null if they're custom. */
export function presetMatching(x: ExposureSettings, prefer?: Preset): Preset | null {
  const same = (k: Preset) => {
    const p = PRESETS[k];
    return p.posture === normPosture(x.posture) && p.surface === x.surface && p.activity === x.activity;
  };
  if (prefer && same(prefer)) return prefer;
  return (Object.keys(PRESETS) as Preset[]).find(same) ?? null;
}

/** "Position, ground, skin" in words. */
export function describeSettings(x: ExposureSettings): string {
  const parts = [POSITION_LABEL[x.posture], SURFACE_LABEL[x.surface], SKIN_LABEL[x.activity]];
  if (x.shade && x.shade !== 'none') parts.push(SHADE_LABEL[x.shade]);
  return parts.join(', ');
}

/** What to call an outing: its preset if the settings match one, otherwise "Custom: …". */
export function activityLabel(preset: Preset, x: ExposureSettings): string {
  const p = presetMatching(x, preset);
  return p ? PRESETS[p].label : `Custom: ${describeSettings({ ...x, shade: 'none' })}`;
}

// ---------------------------------------------------------------- time to burn now

export interface SiteProjection {
  site: Posture;
  /** Central estimate. null = not reached before the horizon (sunset or 12 h). */
  minutes: number | null;
  /**
   * Cautious: if UV runs at the high end of the measured error band (90th
   * percentile, model-fit/ground_report.md). Plan on this one. Equals `minutes`
   * in demo mode.
   */
  soonest: number | null;
  /** Optimistic end (10th percentile). null = not before the horizon. */
  latest: number | null;
}

export interface TimeToBurn {
  bare: SiteProjection[];
  withSunscreen: SiteProjection[] | null;
  /** Worst site: smallest cautious minutes. */
  bareWorst: SiteProjection;
  sunscreenWorst: SiteProjection | null;
}

/**
 * Error band on burn fraction for a dose projected `hours` ahead from `now`:
 * the measured UV band for the current source (+ spatial spread for coarse
 * locations), combined with the person's MED uncertainty. Demo mode has no UV
 * band (it's a scenario) but still carries the skin term. Null = nothing to show.
 */
export function bandFor(ctx: UVContext, now: number, skin?: { lo: number; hi: number }): ((hours: number) => DoseBand) | null {
  const r = readAt(ctx, now);
  if (!r.errorClass && !skin) return null;
  const cls = r.errorClass;
  // The measured band already includes pixel-to-pixel cloud variation for a precise user (the
  // backtest scored precise predictions); only location uncertainty beyond a pixel adds to it.
  const coarse = (ctx.accuracyKm ?? 0) > SAT_PIXEL_KM;
  const uvBand = (hours: number) => {
    const b = doseBand(cls!, hours);
    return coarse ? withSpatial(b, r.uvi, r.uviRange) : b;
  };
  return (hours) => withSkin(cls ? uvBand(hours) : { lo: 1, hi: 1 }, skin);
}

/**
 * Cautious multiplier on a session's burn fraction so far (alerts use fraction × this).
 * Band width for the session's outdoor time; 1 when there's no uncertainty to apply.
 */
export function cautiousFactor(ctx: UVContext, now: number, outdoorHours: number, skin?: { lo: number; hi: number }): number {
  const b = bandFor(ctx, now, skin);
  return b ? b(Math.max(0.5, outdoorHours)).hi : 1;
}

/** Minutes from the timeline start until fraction ≥ target, interpolated; null if never. */
function crossingMinutes(tl: [number, number, number][], target: number): number | null {
  if (tl.length === 0) return null;
  if (tl[0][1] >= target) return 0;
  for (let i = 1; i < tl.length; i++) {
    if (tl[i][1] >= target) {
      const [t0, f0] = tl[i - 1];
      const [t1, f1] = tl[i];
      const w = f1 > f0 ? (target - f0) / (f1 - f0) : 1;
      return (t0 + (t1 - t0) * w - tl[0][0]) / 60_000;
    }
  }
  return null;
}

function minutesUntilSunset(now: number, lat: number, lon: number): number {
  const times = getTimes(new Date(now), lat, lon);
  const sunset = times.sunset?.getTime();
  if (!sunset || Number.isNaN(sunset) || sunset <= now) return 0;
  return Math.ceil((sunset - now) / 60_000);
}

function pickWorst(list: SiteProjection[]): SiteProjection {
  const key = (s: SiteProjection) => [s.soonest ?? Infinity, s.minutes ?? Infinity];
  return [...list].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1])[0];
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
  const band = bandFor(ctx, now, profile.medLogSpread);
  const run = (film: SunscreenApplication | null): SiteProjection[] =>
    sitesFor(settings).map((site) => {
      const start: SessionState = { ...newSession(now, film ? newFilm(film) : null), doseSED: priorDoseSED };
      // one projection at full resolution; all three times are read off its timeline
      const p = project(start, envAt, { ...settings, posture: site }, profile, { horizonMin, stepMin: 2, sampleMin: 2 });
      const minutes = crossingMinutes(p.timeline, 1);
      if (!band) return { site, minutes, soonest: minutes, latest: minutes };
      // cautious: whole dose × hi reaches 1 ⇔ central fraction reaches 1/hi. The band depends on the
      // horizon, which is the answer, so iterate once.
      const h0 = (minutes ?? horizonMin) / 60;
      let soonest = crossingMinutes(p.timeline, 1 / band(h0).hi);
      soonest = crossingMinutes(p.timeline, 1 / band((soonest ?? horizonMin) / 60).hi);
      const latest = crossingMinutes(p.timeline, 1 / band(h0).lo);
      return { site, minutes, soonest, latest };
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

/** Calendar day of t in the app's time zone (the device's, or the demo's), as YYYY-MM-DD. */
export function localDayKey(t: number): string {
  const w = wall(t);
  return `${w.y}-${String(w.mo + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
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
  /** Day's predicted skin dose at the worst site, SED (sum over sessions). Absent on pre-Bayesian check-ins. */
  doseSED?: number;
  /** Log-SD of that dose from the UV model (measured band for the day's outdoor time). */
  doseLogSigma?: number;
  sunscreen?: boolean;
  redness?: Redness;
  cUserAfter?: number;
  /** Posterior after this answer, SED. */
  medAfter?: { median: number; q10: number; q90: number };
  answeredAt?: number;
}

const Z90 = 1.2816;
const logSigmaOf = (b: DoseBand) => Math.log(b.hi / b.lo) / (2 * Z90);

/** Build (or refresh) the check-in for the day of a finished session. */
export function checkInForDay(sessions: Session[], day: string, cUser: number): CheckIn | null {
  // demo sessions are scenarios, not real skin (Session.demo): never calibrate on them
  const daySessions = sessions.filter((s) => localDayKey(s.startedAt) === day && s.status === 'completed' && !s.demo);
  if (daySessions.length === 0) return null;
  const lastEnd = Math.max(...daySessions.map((s) => s.endedAt ?? s.lastT));
  // redness reflects the whole day's dose, so add the sessions up (each at its worst site)
  const doseSED = daySessions.reduce((a, s) => a + (s.sites[s.worstSite]?.doseSED ?? 0), 0);
  const hours = daySessions.reduce((a, s) => a + s.outdoorSeconds, 0) / 3600;
  const cls = daySessions.some((s) => s.usedFallback) ? 'physics' : 'nwp'; // sessions don't record satellite use: take the wider of the two
  return {
    day,
    sessionIds: daySessions.map((s) => s.id),
    promptAt: calibrationPromptTime(new Date(lastEnd)).getTime(),
    predictedFraction: Math.max(...daySessions.map((s) => s.peakFraction)),
    cUserBefore: cUser,
    doseSED,
    doseLogSigma: logSigmaOf(doseBand(cls, Math.max(0.5, hours))),
    sunscreen: daySessions.some((s) => s.lastSunscreenAt != null),
  };
}

/** A check-in as evidence. Pre-Bayesian check-ins are reconstructed from the fraction they stored. */
export function reportOf(c: CheckIn, skinType: SkinType): DoseReport | null {
  if (!c.redness) return null;
  return {
    doseSED: c.doseSED ?? c.predictedFraction * MED_SED[skinType] * c.cUserBefore,
    doseLogSigma: c.doseLogSigma ?? logSigmaOf(doseBand('nwp', 2)),
    sunscreen: c.sunscreen ?? false,
    redness: c.redness,
  };
}

/** Posterior from every answered check-in since the last reset. */
export function calibrate(skinType: SkinType, checkIns: readonly CheckIn[], resetAt = 0): MedPosterior {
  const reports = checkIns
    .filter((c) => c.answeredAt != null && c.answeredAt > resetAt)
    .sort((a, b) => a.answeredAt! - b.answeredAt!)
    .map((c) => reportOf(c, skinType))
    .filter((r): r is DoseReport => r !== null);
  return reports.length ? medPosterior(skinType, reports) : priorPosterior(skinType);
}

/** Posterior after adding one more answer (for the check-in record). */
export function calibrateWith(skinType: SkinType, checkIns: readonly CheckIn[], resetAt: number, extra: DoseReport): MedPosterior {
  return medPosterior(skinType, [
    ...checkIns
      .filter((c) => c.answeredAt != null && c.answeredAt > resetAt)
      .map((c) => reportOf(c, skinType))
      .filter((r): r is DoseReport => r !== null),
    extra,
  ]);
}

/**
 * Record the answer and the posterior it leads to. `prior` = the other answered
 * check-ins since the last reset; the store sets profile.cUser from medAfter.
 */
export function answerCheckIn(c: CheckIn, redness: Redness, now: number, skinType: SkinType, prior: readonly CheckIn[] = [], resetAt = 0): CheckIn {
  const answered: CheckIn = { ...c, redness, answeredAt: now };
  const post = calibrateWith(skinType, prior.filter((x) => x.day !== c.day), resetAt, reportOf(answered, skinType)!);
  return { ...answered, cUserAfter: cUserOf(skinType, post), medAfter: { median: post.median, q10: post.q10, q90: post.q90 } };
}

export { explainRate };

// ---------------------------------------------------------------- trends (History tab)

const DAY_MS = 86_400_000;
/** Near-burn day: peak estimated burn progress at or above this. */
export const NEAR_BURN_FRACTION = 0.8;

export interface PeriodStats {
  outdoorSeconds: number;
  /** Dose your skin actually got (with sunscreen, worst site), SED. */
  protectedSED: number;
  /** Days whose peak estimated burn progress reached NEAR_BURN_FRACTION. */
  nearBurnDays: number;
  /** Days with at least one session. */
  activeDays: number;
}

/** Real (non-demo) completed sessions that started in [from, to). */
const realSessions = (sessions: readonly Session[], from: number, to: number) =>
  sessions.filter((s) => !s.demo && s.status === 'completed' && s.startedAt >= from && s.startedAt < to);

function periodStats(sessions: readonly Session[], profile: SkinProfile): PeriodStats {
  const days = summarizeDays([...sessions], profile);
  return {
    outdoorSeconds: days.reduce((a, d) => a + d.outdoorSeconds, 0),
    protectedSED: days.reduce((a, d) => a + d.protectedSED, 0),
    nearBurnDays: days.filter((d) => d.peakFraction >= NEAR_BURN_FRACTION).length,
    activeDays: days.length,
  };
}

/** The last 7 days vs the 7 before them (rolling, so no locale-dependent week start). Demo sessions excluded. */
export function weekCompare(sessions: readonly Session[], profile: SkinProfile, now: number) {
  return {
    thisWeek: periodStats(realSessions(sessions, now - 7 * DAY_MS, now + 1), profile),
    lastWeek: periodStats(realSessions(sessions, now - 14 * DAY_MS, now - 7 * DAY_MS), profile),
  };
}

/** Seconds outside after the first sunscreen application, from the session's event timeline (pauses excluded). */
export function sunscreenSeconds(s: Session): number {
  const events = [...s.events].sort((a, b) => a.t - b.t);
  const end = s.endedAt ?? s.lastT;
  let active = false;
  let covered = false;
  let last = s.startedAt;
  let total = 0;
  for (const e of events) {
    const t = Math.min(Math.max(e.t, s.startedAt), end);
    if (active && covered) total += (t - last) / 1000;
    last = t;
    if (e.kind === 'start' || e.kind === 'resume') active = true;
    else if (e.kind === 'pause' || e.kind === 'end') active = false;
    else if (e.kind === 'sunscreen') covered = true;
  }
  if (active && covered) total += (end - last) / 1000;
  return Math.min(Math.max(0, total), s.outdoorSeconds);
}

export interface SunscreenHabit {
  days: number;
  outdoorSeconds: number;
  /** Outdoor time after sunscreen went on. */
  coveredSeconds: number;
  sessions: number;
  sessionsWithSunscreen: number;
  /**
   * On sessions with sunscreen: share of the bare-skin dose it removed (0–1), or
   * null if none. Session totals, so time before applying and wear-off count:
   * this is what the habit achieved, not the label SPF.
   */
  doseCut: number | null;
  /** Mean label SPF on those sessions. */
  labelSpf: number | null;
}

/** Sunscreen habit over the last `days` days. Demo sessions excluded. */
export function sunscreenHabit(sessions: readonly Session[], now: number, days = 30): SunscreenHabit {
  const list = realSessions(sessions, now - days * DAY_MS, now + 1);
  const withSs = list.filter((s) => s.lastSunscreenAt != null);
  const bare = withSs.reduce((a, s) => a + skinDose(s).unprotectedSED, 0);
  const prot = withSs.reduce((a, s) => a + skinDose(s).protectedSED, 0);
  const spfs = withSs.map((s) => s.lastSpf).filter((x): x is number => x != null);
  return {
    days,
    outdoorSeconds: list.reduce((a, s) => a + s.outdoorSeconds, 0),
    coveredSeconds: list.reduce((a, s) => a + sunscreenSeconds(s), 0),
    sessions: list.length,
    sessionsWithSunscreen: withSs.length,
    doseCut: bare > 0 ? Math.max(0, 1 - prot / bare) : null,
    labelSpf: spfs.length ? spfs.reduce((a, b) => a + b, 0) / spfs.length : null,
  };
}

export interface SkinLearningPoint {
  /** 0 = before any check-in (the skin-type prior). */
  n: number;
  t: number | null;
  redness: Redness | null;
  /** Personal MED estimate and 80% range, SED. */
  median: number;
  q10: number;
  q90: number;
}

/** How the MED estimate and its range evolved with each check-in since the last reset. */
export function skinLearning(skinType: SkinType, checkIns: readonly CheckIn[], resetAt = 0): SkinLearningPoint[] {
  const answered = checkIns.filter((c) => c.answeredAt != null && c.answeredAt > resetAt).sort((a, b) => a.answeredAt! - b.answeredAt!);
  const p0 = priorPosterior(skinType);
  const out: SkinLearningPoint[] = [{ n: 0, t: null, redness: null, median: p0.median, q10: p0.q10, q90: p0.q90 }];
  answered.forEach((c, i) => {
    const p = calibrate(skinType, answered.slice(0, i + 1), resetAt);
    out.push({ n: i + 1, t: c.answeredAt!, redness: c.redness ?? null, median: p.median, q10: p.q10, q90: p.q90 });
  });
  return out;
}

/** How much narrower the 80% range is now than at the start (0–1, in log terms). */
export function rangeNarrowing(points: readonly SkinLearningPoint[]): number {
  const w = (p: SkinLearningPoint) => Math.log(p.q90 / p.q10);
  return points.length < 2 ? 0 : Math.max(0, 1 - w(points[points.length - 1]) / w(points[0]));
}
