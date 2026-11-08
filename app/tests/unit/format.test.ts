import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fmtMinutes, fmtBurnRange, fmtDuration, fmtShortDuration, fmtTime, fmtSED, fmtPct } from '../../src/utils/format.ts';

for (const [input, expected] of [[null, '—'], [0, '~1 min'], [59, '~59 min'], [60, '~1 h'], [119, '~2 h'], [125, '~2 h 5 min']] as const) {
  test(`minutes: ${input} → ${expected}`, () => assert.equal(fmtMinutes(input), expected));
}
for (const [input, expected] of [[-5, '0:00'], [59, '0:59'], [60, '1:00'], [3661, '1:01:01']] as const) {
  test(`duration: ${input}`, () => assert.equal(fmtDuration(input), expected));
}
test('burn ranges communicate uncertainty and unreachable thresholds', () => {
  assert.equal(fmtBurnRange({ minutes: null, soonest: null, latest: null }), 'Not expected today');
  assert.equal(fmtBurnRange({ minutes: null, soonest: 30, latest: null }), 'Possible after 30 min');
  assert.equal(fmtBurnRange({ minutes: 40, soonest: 30, latest: null }), '30 min or later');
  assert.equal(fmtBurnRange({ minutes: 40, soonest: 30, latest: 50 }), '30–50 min');
});
test('time uses local clock; dose precision, percentages and durations retain units', () => {
  assert.equal(fmtTime(new Date(2026, 6, 15, 9, 5).getTime()), '9:05');
  assert.equal(fmtSED(0.123), '0.12 SED');
  assert.equal(fmtSED(12.34), '12.3 SED');
  assert.equal(fmtPct(1.25), '125%');
  assert.equal(fmtShortDuration(5400), '1 h 30 min');
});
