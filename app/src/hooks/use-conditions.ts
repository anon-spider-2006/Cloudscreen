import { useMemo } from 'react';

import { readAt, timeToBurnNow, todayProtectedSED, worstOf } from '@/engine';
import { useNow } from '@/hooks/use-app';
import { defaultSunscreen, settingsFor, skinProfile, uvContext, useStore } from '@/state/store';

/** Current reading and "time to burn now", recomputed once per minute (and on input changes). */
export function useConditions() {
  const now = useNow();
  const minute = Math.floor(now / 60_000);
  const place = useStore((s) => s.place);
  const forecast = useStore((s) => s.forecast);
  const profile = useStore((s) => s.profile);
  const shade = useStore((s) => s.shade);
  const custom = useStore((s) => s.custom);
  const sessions = useStore((s) => s.sessions);
  const active = useStore((s) => s.active);

  return useMemo(() => {
    const at = minute * 60_000;
    const ctx = uvContext({ place, forecast, profile });
    if (!ctx) return null;
    const reading = readAt(ctx, at);
    const settings = active ? active.settings : settingsFor({ profile, shade, custom });
    const sp = skinProfile(profile);
    // today's dose so far: completed sessions + the active one (worst site)
    const activeDose = active ? (active.sites[worstOf(active.sites, sp).worst]?.doseSED ?? 0) : 0;
    const prior = todayProtectedSED(sessions, at) + activeDose;
    const ttb = timeToBurnNow({ now: at, ctx, profile: sp, settings, priorDoseSED: prior, sunscreen: defaultSunscreen(profile, at) });
    return { ctx, reading, settings, ttb, priorDoseSED: prior, at };
  }, [minute, place, forecast, profile, shade, custom, sessions, active]);
}
