import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accuracyKmOf, kmBetween, locate } from '../../src/services/location.ts';
test('distance is symmetric, zero for identical coordinates and plausible across cities', () => {
  const ny = { lat: 40.7128, lon: -74.006 };
  const miami = { lat: 25.7617, lon: -80.1918 };
  assert.equal(kmBetween(ny, ny), 0);
  assert.ok(Math.abs(kmBetween(ny, miami) - kmBetween(miami, ny)) < 1e-8);
  assert.ok(kmBetween(ny, miami) > 1700 && kmBetween(ny, miami) < 1800);
});
test('location uncertainty respects source and explicit accuracy', () => {
  const base = { lat: 0, lon: 0, name: 'Test' };
  assert.equal(accuracyKmOf({ ...base, source: 'manual' }), 10);
  assert.equal(accuracyKmOf({ ...base, source: 'gps' }), 1);
  assert.equal(accuracyKmOf({ ...base, source: 'demo' }), 0);
  assert.equal(accuracyKmOf({ ...base, source: 'gps', accuracyKm: 15 }), 15);
});
test('denied device permissions return an actionable result', async () => {
  assert.deepEqual(await locate(), { ok: false, reason: 'denied' });
});
