import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlaps, localDayKey, startSession, envAtFor, stepSession, currentFraction, newlyCrossed, setStatus } from '../../src/engine/index.ts';

test('overlap detection uses half-open intervals and handles a running session', () => {
  assert.equal(overlaps({ startedAt: 10, endedAt: 20 }, 20, 30, 100), false);
  assert.equal(overlaps({ startedAt: 10, endedAt: 20 }, 0, 10, 100), false);
  assert.equal(overlaps({ startedAt: 10, endedAt: 20 }, 19, 30, 100), true);
  assert.equal(overlaps({ startedAt: 10 }, 50, 60, 100), true);
  assert.equal(overlaps({ startedAt: 10 }, 100, 110, 100), false);
});
test('local day boundaries use local calendar dates, including year rollover', () => {
  assert.equal(localDayKey(new Date(2026, 11, 31, 23, 59).getTime()), '2026-12-31');
  assert.equal(localDayKey(new Date(2027, 0, 1, 0, 0).getTime()), '2027-01-01');
});
test('threshold crossings include exact boundaries and never refire', () => {
  const session = startSession(0, 'walk', 'none', { skinType: 2, cUser: 1 });
  assert.deepEqual(newlyCrossed(session, 0.499), []);
  assert.deepEqual(newlyCrossed(session, 0.5), [0.5]);
  assert.deepEqual(newlyCrossed(session, 1), [0.5, 0.8, 1]);
  assert.deepEqual(newlyCrossed({ ...session, thresholdsFired: [0.5, 0.8, 1] }, 2), []);
});
test('repeated and out-of-order ticks do not double-count session dose', () => {
  const at = Date.parse('2026-07-15T17:00Z');
  const profile = { skinType: 2 as const, cUser: 1 };
  const env = envAtFor({ lat: 25.76, lon: -80.19, mode: 'demo', demoClouds: { low: 0, mid: 0, high: 0 } });
  const session = stepSession(startSession(at, 'walk', 'none', profile), at + 600_000, env, profile);
  assert.equal(stepSession(session, at + 600_000, env, profile), session);
  assert.equal(stepSession(session, at, env, profile), session);
  const ended = setStatus(session, session.lastT, 'completed');
  const later = stepSession(ended, at + 1200_000, env, profile);
  assert.equal(currentFraction(later, profile).fraction, currentFraction(ended, profile).fraction);
  assert.equal(later.outdoorSeconds, ended.outdoorSeconds);
});
