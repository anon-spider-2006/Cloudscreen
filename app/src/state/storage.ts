// SQLite-backed key-value store (expo-sqlite/kv-store). Local-first: nothing leaves the device (SEC-001).
import Storage from 'expo-sqlite/kv-store';
import type { StateStorage } from 'zustand/middleware';

export const kvStorage: StateStorage = {
  getItem: (k) => Storage.getItem(k),
  setItem: (k, v) => Storage.setItem(k, v),
  removeItem: (k) => Storage.removeItem(k),
};
