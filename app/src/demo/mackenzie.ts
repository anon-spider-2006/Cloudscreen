/**
 * Demo person: Mackenzie McHale (fan reference to HBO's The Newsroom; swap the
 * name before any public release). A made-up history, built with the real
 * engine so every number on screen comes from the model.
 *
 * Story: an executive producer's first day off after the 2026 election cycle.
 * Two weeks of history in Manhattan (a rooftop burn, then better habits), and on
 * Saturday 14 August 2027 a long lunch on a Lake George dock followed by an
 * evening hike up Cascade Mountain in the Adirondack High Peaks.
 *
 * Pure TypeScript (no React Native), so it runs in node tests.
 */
import {
  answerCheckIn,
  calibrate,
  applySunscreen,
  changeSettings,
  checkInForDay,
  envAtFor,
  localDayKey,
  setStatus,
  settingsForPreset,
  startSession,
  stepSession,
  type CheckIn,
  type Session,
  type UVContext,
} from '../engine/index.ts';
import { cUserOf, type Preset, type Redness, type Shade, type SkinProfile, type SunscreenApplication } from '../model/index.ts';

export const DEMO_PERSONA = {
  name: 'Mackenzie McHale',
  role: 'Executive producer, Manhattan',
  blurb:
    'Her first real day off after the election cycle. A long lunch on a Lake George dock with no sunscreen, then an evening hike up Cascade Mountain before sunset.',
} as const;

/** Profile fields for the demo (the store adds calibration from her check-ins). */
export const DEMO_PROFILE = {
  onboarded: true,
  skinType: 2 as const,
  cUser: 1,
  spf: 50,
  filter: 'chemical' as const,
  mgPerCm2: 1,
  waterResistant: false,
  preset: 'walk' as const,
  reminderMin: 120,
  uvMode: 'demo' as const,
  notifications: false, // never schedule real alerts on the phone from demo data
  demoClouds: { low: 0, mid: 0, high: 0 },
  calibrationResetAt: 0,
};

export interface DemoPlace {
  name: string;
  lat: number;
  lon: number;
  source: 'demo';
  accuracyKm: number;
  elevationM: number;
}

const place = (name: string, lat: number, lon: number, elevationM: number): DemoPlace => ({ name, lat, lon, elevationM, source: 'demo', accuracyKm: 0 });

export const DEMO_PLACES = {
  manhattan: place('Manhattan, NY (demo)', 40.7128, -74.006, 10),
  lakeGeorge: place('Lake George, NY (demo)', 43.4262, -73.7123, 98),
  trailhead: place('Cascade Mountain trailhead, NY (demo)', 44.2216, -73.888, 640),
  summit: place('Cascade Mountain summit, NY (demo)', 44.219, -73.8604, 1249),
};

/** Eastern Daylight Time, 2027. */
const at = (day: string, hm: string) => Date.parse(`2027-${day}T${hm}:00-04:00`);

export type DemoMoment = 'dock' | 'trailhead' | 'summit';

export const DEMO_MOMENTS: Record<DemoMoment, { label: string; short: string; t: number; place: DemoPlace }> = {
  dock: { label: '12:30 on the Lake George dock', short: '12:30 Dock', t: at('08-14', '12:30'), place: DEMO_PLACES.lakeGeorge },
  trailhead: { label: '5:15 pm at the trailhead', short: '5:15 Trailhead', t: at('08-14', '17:15'), place: DEMO_PLACES.trailhead },
  summit: { label: '7:00 pm on the summit', short: '7:00 Summit', t: at('08-14', '19:00'), place: DEMO_PLACES.summit },
};
export const DEMO_START: DemoMoment = 'trailhead';

/** Seconds after entering (or jumping) before the scripted sunscreen nudge. */
export const DEMO_NUDGE_AFTER_S = 30;

/**
 * The scripted notification for a moment (null = none: on the summit at 7 pm the
 * UV is too low for a sunscreen nudge to be honest). Wording matches what the
 * model shows at that moment (see the demo tests).
 */
export const DEMO_NUDGES: Record<DemoMoment, { title: string; body: string } | null> = {
  dock: {
    title: 'No sunscreen at lunch',
    body: 'UV is high on the dock and you’re not wearing any. Put SPF 50 on, or stay under the umbrella.',
  },
  trailhead: {
    title: 'Sunscreen before the hike?',
    body: 'UV is low now, but lunch on the dock already counts toward today. Over a 2½-hour hike you could reach your burn threshold. Put SPF 50 on first.',
  },
  summit: null,
};

const ctxFor = (p: DemoPlace): UVContext => ({
  lat: p.lat,
  lon: p.lon,
  accuracyKm: 0,
  altitudeKm: p.elevationM / 1000,
  mode: 'demo',
  demoClouds: DEMO_PROFILE.demoClouds,
});

const sunscreenAt = (t: number): SunscreenApplication => ({
  spfLabel: DEMO_PROFILE.spf,
  filter: DEMO_PROFILE.filter,
  mgPerCm2: DEMO_PROFILE.mgPerCm2,
  waterResistant: DEMO_PROFILE.waterResistant,
  appliedAt: t,
});

/** One outing, scripted step by step and integrated by the engine. */
interface Outing {
  start: number;
  minutes: number;
  preset: Preset;
  shade: Shade;
  where: DemoPlace;
  /** Sunscreen application times (may be just before start). */
  sunscreen?: number[];
  /** Pause: start time and length in minutes. */
  pause?: { at: number; minutes: number };
  /** Change of shade/place part-way (e.g. trees → open summit). */
  change?: { at: number; shade: Shade; where: DemoPlace };
  retroactive?: boolean;
  redness?: Redness;
}

/** Integrate an outing up to `until` (default: its end), judged against `profile` (her calibration at the time). */
function runOuting(o: Outing, profile: SkinProfile, until = Infinity): Session | null {
  if (until <= o.start) return null;
  const pauseMs = o.pause ? o.pause.minutes * 60_000 : 0;
  const end = o.start + o.minutes * 60_000 + pauseMs;
  let s = startSession(o.start, o.preset, o.shade, profile, o.retroactive ? 'retroactive' : 'manual');
  let envAt = envAtFor(ctxFor(o.where));
  const marks: { t: number; act: (x: Session) => Session }[] = [];
  for (const t of o.sunscreen ?? []) {
    if (t <= o.start) s = applySunscreen(s, sunscreenAt(t));
    else marks.push({ t, act: (x) => applySunscreen(x, sunscreenAt(t)) });
  }
  if (o.pause) {
    const p = o.pause;
    marks.push({ t: p.at, act: (x) => setStatus(x, p.at, 'paused') });
    marks.push({ t: p.at + p.minutes * 60_000, act: (x) => setStatus(x, p.at + p.minutes * 60_000, 'active') });
  }
  if (o.change) {
    const c = o.change;
    marks.push({
      t: c.at,
      act: (x) => {
        envAt = envAtFor(ctxFor(c.where));
        return changeSettings(x, c.at, { ...settingsForPreset(o.preset, c.shade) }, o.preset);
      },
    });
  }
  marks.sort((a, b) => a.t - b.t);
  const stop = Math.min(end, until);
  for (const m of marks) {
    if (m.t > stop) break;
    s = stepSession(s, m.t, envAt, profile);
    s = m.act(s);
  }
  s = stepSession(s, stop, envAt, profile);
  return stop >= end ? setStatus(s, end, 'completed') : s;
}

const M = DEMO_PLACES.manhattan;
/** Two weeks in Manhattan, then today's lunch and hike. */
const HISTORY: Outing[] = [
  // last week: little time outside, no sunscreen, one burn
  { start: at('08-02', '12:30'), minutes: 90, preset: 'walk', shade: 'none', where: M, redness: 'burned' }, // rooftop lunch between rundown meetings
  { start: at('08-04', '07:00'), minutes: 35, preset: 'run', shade: 'none', where: M, redness: 'none' }, // Hudson River path
  { start: at('08-06', '13:00'), minutes: 105, preset: 'picnic', shade: 'umbrella', where: M, redness: 'pink' }, // Bryant Park, reading wires under an umbrella (it doesn't block everything)
  // this week: more time outside, better habits
  {
    start: at('08-08', '10:00'),
    minutes: 60,
    preset: 'pool',
    shade: 'umbrella',
    where: M,
    sunscreen: [at('08-08', '10:00'), at('08-08', '10:55')],
    pause: { at: at('08-08', '10:30'), minutes: 20 },
  }, // rooftop pool lounger under an umbrella, a break inside, reapplied after
  { start: at('08-09', '07:00'), minutes: 40, preset: 'run', shade: 'none', where: M, sunscreen: [at('08-09', '06:55')], redness: 'none' },
  { start: at('08-11', '12:15'), minutes: 50, preset: 'walk', shade: 'none', where: M, sunscreen: [at('08-11', '12:10')], redness: 'none' }, // lunch outside, with sunscreen this time
  { start: at('08-12', '18:00'), minutes: 40, preset: 'walk', shade: 'none', where: M }, // home along the river
  { start: at('08-13', '12:00'), minutes: 30, preset: 'walk', shade: 'none', where: M, retroactive: true, redness: 'pink' }, // added after the fact
];

const LUNCH: Outing = { start: at('08-14', '12:15'), minutes: 30, preset: 'picnic', shade: 'umbrella', where: DEMO_PLACES.lakeGeorge };
const HIKE: Outing = {
  start: at('08-14', '17:30'),
  minutes: 150,
  preset: 'walk',
  shade: 'dense', // wooded lower trail
  where: DEMO_PLACES.trailhead,
  change: { at: at('08-14', '18:40'), shade: 'none', where: DEMO_PLACES.summit }, // open rock near the top
};

export interface DemoState {
  place: DemoPlace;
  sessions: Session[];
  active: Session | null;
  checkIns: CheckIn[];
  sunscreen: (SunscreenApplication & { id: string; sessionId?: string })[];
  now: number;
}

/** Everything the store needs for the demo at a given moment. */
export function buildDemo(moment: DemoMoment): DemoState {
  const { t: now, place: here } = DEMO_MOMENTS[moment];
  const sessions: Session[] = [];
  let active: Session | null = null;
  const sunscreen: DemoState['sunscreen'] = [];
  const checkIns: CheckIn[] = [];

  const k = DEMO_PROFILE.skinType;
  // chronological: each outing is judged against her calibration so far, and its
  // next-morning check-in is answered before the next outing (one outing a day)
  for (const o of [...HISTORY, LUNCH, HIKE]) {
    const profile: SkinProfile = { skinType: k, cUser: cUserOf(k, calibrate(k, checkIns.filter((c) => c.answeredAt! < o.start))) };
    const s = runOuting(o, profile, now);
    if (!s) continue;
    if (s.status === 'completed') sessions.push(s);
    else active = s;
    for (const t of o.sunscreen ?? []) if (t <= now) sunscreen.push({ ...sunscreenAt(t), id: `demo-ss-${t}`, sessionId: s.id });
    if (o.redness && s.status === 'completed') {
      const c = checkInForDay(sessions, localDayKey(o.start), profile.cUser);
      if (c && c.promptAt + 30 * 60_000 <= now) checkIns.push(answerCheckIn(c, o.redness, c.promptAt + 30 * 60_000, k, checkIns));
    }
  }

  sessions.sort((a, b) => b.startedAt - a.startedAt);
  return { place: here, sessions, active, checkIns, sunscreen, now };
}
