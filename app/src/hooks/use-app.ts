import { useSyncExternalStore } from 'react';

import { useStore } from '@/state/store';

/** True once persisted state has loaded from storage. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useStore.persist.onFinishHydration(cb),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

const listeners = new Set<() => void>();
let tickNow = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      tickNow = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Wall clock, re-rendering once per second. */
export function useWallClock(): number {
  return useSyncExternalStore(subscribe, () => tickNow, () => tickNow);
}

/** App clock: wall clock plus the demo offset when demo mode is on. */
export function useNow(): number {
  const wall = useWallClock();
  const offset = useStore((s) => (s.profile.uvMode === 'demo' ? s.profile.demoClockOffsetMs : 0));
  return wall + offset;
}
