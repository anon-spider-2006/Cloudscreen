import { appTimeZone, wall } from './time.ts';

export function fmtMinutes(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `~${Math.max(1, Math.round(m))} min`;
  const h = Math.floor(m / 60);
  const r = Math.round((m - h * 60) / 5) * 5;
  return r === 0 || r === 60 ? `~${r === 60 ? h + 1 : h} h` : `~${h} h ${r} min`;
}

/** Bare minutes/hours, no "~" (for ranges). */
function plainMinutes(m: number): string {
  return fmtMinutes(m).replace(/^~/, '');
}

/**
 * Time-to-burn as a range: cautious (soonest) to optimistic (latest).
 * "35–50 min", "1 h 10 min–2 h", "35 min or later", "possible after 3 h", "Could be now".
 */
export function fmtBurnRange(p: { minutes: number | null; soonest: number | null; latest: number | null }): string {
  const { minutes, soonest, latest } = p;
  if (soonest === null) return 'Not expected today';
  // the cautious end is already reached: say so plainly rather than "1 min or later"
  if (soonest < 1) return 'Could be now';
  if (minutes === null) return `Possible after ${plainMinutes(soonest)}`;
  if (latest === null) return `${plainMinutes(soonest)} or later`;
  const a = plainMinutes(soonest);
  const b = plainMinutes(latest);
  if (a === b) return fmtMinutes(soonest);
  // share the unit when both are in minutes: "35–50 min"
  if (soonest < 59.5 && latest < 59.5) return `${a.replace(' min', '')}–${b}`;
  return `${a}–${b}`;
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}

export function fmtShortDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtTime(t: number): string {
  const w = wall(t);
  return `${w.h}:${String(w.mi).padStart(2, '0')}`;
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: appTimeZone() });
}

export const fmtSED = (x: number) => `${x < 10 ? x.toFixed(2) : x.toFixed(1)} SED`;
export const fmtPct = (f: number) => `${Math.round(f * 100)}%`;

export const SITE_LABEL: Record<string, string> = {
  upright: 'Face & arms',
  shoulders: 'Shoulders',
  lying: 'Front (lying)',
};
