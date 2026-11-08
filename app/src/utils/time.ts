/**
 * Wall-clock time in the app's time zone.
 *
 * By default that's the device's own zone, and every function here behaves exactly
 * like the plain Date methods. The demo sets a zone (its persona lives in Italy), so
 * "9:00", "today" and "midnight" mean Italian time on any phone. Pure TS (uses Intl),
 * so the model, engine and tests can use it.
 */
let zone: string | undefined;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Set (or clear, with undefined) the zone used for all wall-clock maths and display. */
export function setAppTimeZone(z?: string) {
  zone = z;
}
export const appTimeZone = () => zone;

export interface Wall {
  y: number;
  /** 0–11 */
  mo: number;
  d: number;
  h: number;
  mi: number;
  /** 0 = Sunday */
  wd: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function formatter(z: string): Intl.DateTimeFormat {
  let f = formatters.get(z);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
    });
    formatters.set(z, f);
  }
  return f;
}

/** Calendar parts of an instant in the app zone. */
export function wall(t: number): Wall {
  if (!zone) {
    const d = new Date(t);
    return { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), wd: d.getDay() };
  }
  const p: Record<string, string> = {};
  for (const x of formatter(zone).formatToParts(new Date(t))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WEEKDAYS[p.weekday] ?? 0 };
}

/** The instant of a wall-clock time in the app zone. Day/month overflow rolls over, like Date. */
export function fromWall(y: number, mo: number, d: number, h = 0, mi = 0): number {
  if (!zone) return new Date(y, mo, d, h, mi).getTime();
  const target = Date.UTC(y, mo, d, h, mi);
  let t = target;
  for (let i = 0; i < 3; i++) {
    const w = wall(t);
    const seen = Date.UTC(w.y, w.mo, w.d, w.h, w.mi);
    if (seen === target) break;
    t += target - seen;
  }
  return t;
}

/** Same calendar day as t, at h:mi. */
export function atHour(t: number, h: number, mi = 0): number {
  const w = wall(t);
  return fromWall(w.y, w.mo, w.d, h, mi);
}
export const startOfDay = (t: number) => atHour(t, 0);
/** n calendar days later (or earlier), same wall-clock time. */
export function addDays(t: number, n: number): number {
  const w = wall(t);
  return fromWall(w.y, w.mo, w.d + n, w.h, w.mi);
}
/** Days in a month (mo 0–11). */
export const daysInMonth = (y: number, mo: number) => new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
