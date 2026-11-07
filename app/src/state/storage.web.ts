// Web: browser localStorage (SQLite on web needs WASM + COOP/COEP headers; not worth it for the web preview).
import type { StateStorage } from 'zustand/middleware';

export const kvStorage: StateStorage = {
  getItem: (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      // storage unavailable (private mode): keep running in memory
    }
  },
  removeItem: (k) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      // ignore
    }
  },
};
