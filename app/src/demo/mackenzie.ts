/**
 * Demo person: Mackenzie McHale (fan reference to HBO's The Newsroom; swap the
 * name before any public release). A made-up history, built with the real
 * engine so every number on screen comes from the model.
 *
 * Story: an executive producer's first real trip after the 2026 election cycle.
 * A week in Rome (a terrace-lunch burn), then a week based in Cortina d'Ampezzo in
 * the Dolomites (better habits). On Saturday 14 August 2027 she hikes the Tre Cime
 * di Lavaredo loop, above the treeline at 2,300–2,450 m, and ends the day on the
 * terrace of Rifugio Locatelli as the sun sets behind the peaks.
 *
 * Everything happens in Italian time (CEST); the store sets the app's time zone to
 * DEMO_TIMEZONE while the demo runs, so times read the same on any phone.
 *
 * Pure TypeScript (no React Native), so it runs in node tests.
 */
import {
  answerCheckIn,
  calibrate,
  applySunscreen,
  checkInForDay,
  envAtFor,
  localDayKey,
  setStatus,
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
    'Her first real trip after the election cycle: a week in Rome, then the Dolomites. Today she hikes the Tre Cime di Lavaredo loop, above the treeline at 2,300–2,450 m.',
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
  preset: 'hike' as const,
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
  rome: place('Rome, Italy (demo)', 41.9028, 12.4964, 21),
  cortina: place('Cortina d’Ampezzo, Italy (demo)', 46.5405, 12.1357, 1224),
  braies: place('Lago di Braies, Italy (demo)', 46.6943, 12.0852, 1496),
  auronzo: place('Rifugio Auronzo, Tre Cime (demo)', 46.6127, 12.2952, 2320),
  lavaredo: place('Forcella Lavaredo, Tre Cime (demo)', 46.6191, 12.3129, 2454),
  locatelli: place('Rifugio Locatelli, Tre Cime (demo)', 46.6333, 12.3056, 2405),
};

/** The demo lives in Italian time; the app uses this zone while the demo runs. */
export const DEMO_TIMEZONE = 'Europe/Rome';
/** Central European Summer Time, 2027. */
const at = (day: string, hm: string) => Date.parse(`2027-${day}T${hm}:00+02:00`);

export type DemoMoment = 'trailhead' | 'pass' | 'rifugio';

export const DEMO_MOMENTS: Record<DemoMoment, { label: string; short: string; t: number; place: DemoPlace }> = {
  trailhead: { label: '7:45 at Rifugio Auronzo, before the hike', short: '7:45 Start', t: at('08-14', '07:45'), place: DEMO_PLACES.auronzo },
  pass: { label: '10:30 at Forcella Lavaredo, mid-hike', short: '10:30 Pass', t: at('08-14', '10:30'), place: DEMO_PLACES.lavaredo },
  rifugio: { label: '6:15 pm on the Rifugio Locatelli terrace', short: '6:15 Rifugio', t: at('08-14', '18:15'), place: DEMO_PLACES.locatelli },
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
  trailhead: {
    title: 'Sunscreen before you set off?',
    body: 'You’re at 2,300 m, where UV is about 12% stronger than at sea level, and the whole loop is above the trees. Put SPF 50 on before you start.',
  },
  pass: {
    title: 'UV is climbing fast up here',
    body: 'It will keep rising until early afternoon. Your sunscreen is still working, but reapply before you stop for lunch.',
  },
  rifugio: null,
};

const ctxFor = (p: DemoPlace): UVContext => ({
  lat: p.lat,
  lon: p.lon,
  accuracyKm: 0,
  altitudeKm: p.elevationM / 1000,
  mode: 'demo',
  demoClouds: DEMO_PROFILE.demoClouds,
});

/** Her everyday bottle, or a different product for one outing. */
const sunscreenAt = (t: number, product: Partial<SunscreenApplication> = {}): SunscreenApplication => ({
  spfLabel: DEMO_PROFILE.spf,
  filter: DEMO_PROFILE.filter,
  mgPerCm2: DEMO_PROFILE.mgPerCm2,
  waterResistant: DEMO_PROFILE.waterResistant,
  ...product,
  appliedAt: t,
});
/** The sport sunscreen she bought in Cortina for the hike: mineral, water-resistant, put on properly. */
const SPORT: Partial<SunscreenApplication> = { filter: 'photostable', waterResistant: true, mgPerCm2: 2 };

/** One outing, scripted step by step and integrated by the engine. */
interface Outing {
  start: number;
  minutes: number;
  preset: Preset;
  shade: Shade;
  where: DemoPlace;
  /** Sunscreen application times (may be just before start). */
  sunscreen?: number[];
  /** Product used on this outing (default: her everyday bottle). */
  product?: Partial<SunscreenApplication>;
  /** Pause: start time and length in minutes. */
  pause?: { at: number; minutes: number };
  /** Moving on to new places part-way (a hike over a pass); settings stay the same. */
  moves?: { at: number; where: DemoPlace }[];
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
    if (t <= o.start) s = applySunscreen(s, sunscreenAt(t, o.product));
    else marks.push({ t, act: (x) => applySunscreen(x, sunscreenAt(t, o.product)) });
  }
  if (o.pause) {
    const p = o.pause;
    marks.push({ t: p.at, act: (x) => setStatus(x, p.at, 'paused') });
    marks.push({ t: p.at + p.minutes * 60_000, act: (x) => setStatus(x, p.at + p.minutes * 60_000, 'active') });
  }
  for (const m of o.moves ?? []) {
    marks.push({
      t: m.at,
      act: (x) => {
        envAt = envAtFor(ctxFor(m.where));
        return x;
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

const R = DEMO_PLACES.rome;
const C = DEMO_PLACES.cortina;
/** A week in Rome, a week in the Dolomites, then today's hike and an evening on the rifugio terrace. */
const HISTORY: Outing[] = [
  // week 1, Rome: little sunscreen, one burn
  { start: at('08-02', '13:00'), minutes: 90, preset: 'walk', shade: 'none', where: R, redness: 'burned' }, // long lunch on a Trastevere terrace
  { start: at('08-04', '07:30'), minutes: 35, preset: 'run', shade: 'none', where: R, redness: 'none' }, // along the Tiber
  { start: at('08-06', '14:00'), minutes: 105, preset: 'picnic', shade: 'umbrella', where: R, redness: 'pink' }, // Villa Borghese under an umbrella (it doesn't block everything)
  // week 2, the Dolomites: better habits
  {
    start: at('08-08', '10:30'),
    minutes: 60,
    preset: 'pool',
    shade: 'umbrella',
    where: DEMO_PLACES.braies,
    sunscreen: [at('08-08', '10:30'), at('08-08', '11:25')],
    pause: { at: at('08-08', '11:00'), minutes: 20 },
  }, // a swim at Lago di Braies, a break in the café, reapplied after
  { start: at('08-09', '07:30'), minutes: 40, preset: 'run', shade: 'none', where: C, sunscreen: [at('08-09', '07:25')], redness: 'none' },
  { start: at('08-11', '12:15'), minutes: 50, preset: 'walk', shade: 'none', where: C, sunscreen: [at('08-11', '12:10')], redness: 'none' }, // lunch in town, with sunscreen this time
  { start: at('08-12', '18:00'), minutes: 80, preset: 'walk', shade: 'none', where: C }, // a long evening passeggiata
  { start: at('08-13', '12:30'), minutes: 30, preset: 'walk', shade: 'none', where: C, retroactive: true, redness: 'pink' }, // added after the fact
];

/**
 * Today: an early start round the Tre Cime to Rifugio Locatelli, where she's staying
 * the night (sport sunscreen on at the start, reapplied twice), then the terrace at sunset.
 */
const HIKE: Outing = {
  start: at('08-14', '08:00'),
  minutes: 240,
  preset: 'hike',
  shade: 'none', // the whole route is above the treeline
  where: DEMO_PLACES.auronzo,
  product: SPORT,
  sunscreen: [at('08-14', '07:55'), at('08-14', '09:50'), at('08-14', '11:20')],
  moves: [
    { at: at('08-14', '09:30'), where: DEMO_PLACES.lavaredo },
    { at: at('08-14', '11:00'), where: DEMO_PLACES.locatelli },
  ],
};
const TERRACE: Outing = { start: at('08-14', '18:00'), minutes: 60, preset: 'picnic', shade: 'none', where: DEMO_PLACES.locatelli }; // watching the sun go down behind the peaks

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
  for (const o of [...HISTORY, HIKE, TERRACE]) {
    const profile: SkinProfile = { skinType: k, cUser: cUserOf(k, calibrate(k, checkIns.filter((c) => c.answeredAt! < o.start))) };
    const s = runOuting(o, profile, now);
    if (!s) continue;
    if (s.status === 'completed') sessions.push(s);
    else active = s;
    for (const t of o.sunscreen ?? []) if (t <= now) sunscreen.push({ ...sunscreenAt(t, o.product), id: `demo-ss-${t}`, sessionId: s.id });
    if (o.redness && s.status === 'completed') {
      const c = checkInForDay(sessions, localDayKey(o.start), profile.cUser);
      const answerAt = c ? c.promptAt + 30 * 60_000 : Infinity;
      if (c && answerAt <= now) checkIns.push(answerCheckIn(c, o.redness, answerAt, k, checkIns));
      // due but not answered yet: it shows as the morning check-in, so the demo can answer it live
      else if (c && c.promptAt <= now) checkIns.push(c);
    }
  }

  sessions.sort((a, b) => b.startedAt - a.startedAt);
  return { place: here, sessions, active, checkIns, sunscreen, now };
}
