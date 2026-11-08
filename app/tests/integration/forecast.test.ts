import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { fetchForecast } from '../../src/model/uvSource.ts';

afterEach(() => mock.restoreAll());
const hourly = {
  time: ['2026-07-15T12:00', '2026-07-15T13:00', '2026-07-15T14:00'],
  uv_index: [2, null, 6], uv_index_clear_sky: [3, 5, 7],
  cloud_cover_low: [20, 30, 40], cloud_cover_mid: [10, 20, 30], cloud_cover_high: [0, 10, 20],
};
test('forecast ingestion handles hour means, cloud units, missing rows and CAMS edge averages', async () => {
  const urls: string[] = [];
  mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify(String(url).includes('air-quality') ? { hourly: { time: ['2026-07-15T11:00', '2026-07-15T12:00'], uv_index_clear_sky: [4, 6] } } : { elevation: 20, hourly }));
  });
  const result = await fetchForecast(25.761234, -80.191234);
  assert.equal(result.hours.length, 2);
  assert.equal(result.hours[0].t, Date.parse('2026-07-15T11:30Z'));
  assert.equal(result.hours[0].clouds.low, 0.2);
  assert.equal(result.hours[0].uviClearCams, 5);
  assert.equal(result.hours[1].uviClearCams, null);
  assert.equal(result.elevationM, 20);
  assert.ok(urls.every((url) => url.includes('latitude=25.7612&longitude=-80.1912')));
});
test('optional CAMS outage leaves the core forecast usable', async () => {
  mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    if (String(url).includes('air-quality')) throw new Error('CAMS down');
    return new Response(JSON.stringify({ elevation: 0, hourly }));
  });
  const forecast = await fetchForecast(25, -80);
  assert.equal(forecast.hours.length, 2);
  assert.equal(forecast.hours[0].uviClearCams, null);
});
test('forecast HTTP failures propagate instead of becoming zero UV', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  await assert.rejects(fetchForecast(25, -80), /Open-Meteo 503/);
});
test('aborted fetch propagates cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  mock.method(globalThis, 'fetch', async () => { throw controller.signal.reason; });
  await assert.rejects(fetchForecast(25, -80, controller.signal), { name: 'AbortError' });
});
