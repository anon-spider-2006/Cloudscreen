import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { kvStorage } from '../../src/state/storage.web.ts';
afterEach(() => { Reflect.deleteProperty(globalThis, 'localStorage'); });
test('web storage round-trips values and removes them', () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k),
  } });
  assert.equal(kvStorage.getItem('profile'), null);
  kvStorage.setItem('profile', '{"spf":50}');
  assert.equal(kvStorage.getItem('profile'), '{"spf":50}');
  kvStorage.removeItem('profile');
  assert.equal(kvStorage.getItem('profile'), null);
});
test('blocked storage does not crash the app', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  assert.equal(kvStorage.getItem('x'), null);
  assert.doesNotThrow(() => kvStorage.setItem('x', 'y'));
  assert.doesNotThrow(() => kvStorage.removeItem('x'));
});
test('server rendering works without localStorage', () => {
  Reflect.deleteProperty(globalThis, 'localStorage');
  assert.equal(kvStorage.getItem('x'), null);
  assert.doesNotThrow(() => kvStorage.setItem('x', 'y'));
});
