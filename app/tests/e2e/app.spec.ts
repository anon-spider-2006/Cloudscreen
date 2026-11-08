import { expect, test, type Page } from '@playwright/test';

const profile = {
  onboarded: true, skinType: 2, cUser: 1, spf: 30, filter: 'photostable',
  mgPerCm2: 1, waterResistant: false, preset: 'walk', reminderMin: 120,
  uvMode: 'physics', notifications: false, demoClouds: { low: 0, mid: 0, high: 0 }, demoClockOffsetMs: 0,
};
async function seed(page: Page) {
  await page.addInitScript((p) => {
    if (!localStorage.getItem('cloudscreen-v1')) localStorage.setItem('cloudscreen-v1', JSON.stringify({ version: 1, state: {
      profile: p, place: { lat: 25.76, lon: -80.19, name: 'Miami, FL', source: 'manual' },
      forecast: null, satellite: null, shade: 'none', custom: null, active: null,
      sessions: [], sunscreen: [], checkIns: [], demo: null, realSnapshot: null,
    } }));
  }, profile);
}
async function pick(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole('radio', { name: option, exact: true }).click();
}
async function persisted(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('cloudscreen-v1')!).state);
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-07-15T17:00:00Z'));
  // Test the real offline fallback rather than relying on live forecast availability.
  await page.route(/https:\/\/.*open-meteo\.com\//, (route) => route.abort());
});

test('first-run onboarding validates choices and completes without permissions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Make room for the outdoors.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: 'Sometimes burns, tans gradually' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'SPF 50', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Miami, FL', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await expect(page.getByText('Making your day a little brighter')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Making your day a little brighter')).toBeVisible();
  expect((await persisted(page)).profile).toMatchObject({ skinType: 3, spf: 50, onboarded: true, notifications: false });
});

test('all main tabs render offline without uncaught browser errors', async ({ page }) => {
  await seed(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  for (const [tab, content] of [['Home', 'Making your day a little brighter'], ['Forecast', '7-day outlook'], ['History', 'No sessions yet.'], ['Profile', 'Reset calibration'], ['Track', 'Start outdoor session']]) {
    if (tab !== 'Home') await page.getByRole('link', { name: tab, exact: true }).click();
    // Expo keeps visited tab trees mounted; ignore matching text in hidden tabs.
    await expect(page.getByText(content, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('session start, pause, resume and end creates a persisted history record', async ({ page }) => {
  await seed(page); await page.goto('/track');
  await page.getByRole('button', { name: 'Start outdoor session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect((await persisted(page)).active.status).toBe('paused');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'End', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).sessions.length).toBe(1);
  const state = await persisted(page);
  expect(state.active).toBeNull();
  expect(state.sessions[0].status).toBe('completed');
  await page.goto('/history');
  await expect(page.getByText('No sessions yet.')).toHaveCount(0);
});

test('sunscreen is saved and remains after reload', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Log sunscreen', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).sunscreen.length).toBe(1);
  await page.reload();
  expect((await persisted(page)).sunscreen[0].spfLabel).toBe(30);
});

test('duration dropdowns expose all hours and minutes and reject zero/future durations', async ({ page }) => {
  await seed(page); await page.goto('/add-session');
  await expect(page.getByRole('button', { name: 'Add session', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^Hours:/ }).click();
  await expect(page.getByRole('radio')).toHaveCount(25);
  await page.getByRole('radio', { name: '0 h', exact: true }).click();
  await expect(page.getByText('Choose a duration greater than zero.')).toBeVisible();
  await page.getByRole('button', { name: /^Minutes:/ }).click();
  await expect(page.getByRole('radio')).toHaveCount(60);
  await page.getByRole('radio', { name: '59 min', exact: true }).click();
  await pick(page, 'Started at', '0:00');
  await pick(page, 'Hours', '24 h');
  await expect(page.getByText('This session ends in the future. Choose an earlier start or a shorter duration.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add session', exact: true })).toBeDisabled();
});

test('past session saves and an overlapping second entry is rejected', async ({ page }) => {
  await seed(page); await page.goto('/');
  await page.getByRole('button', { name: 'Add time I was outside', exact: true }).click();
  await pick(page, 'Started at', '0:00');
  await pick(page, 'Hours', '0 h');
  await pick(page, 'Minutes', '15 min');
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).sessions.length).toBe(1);
  await page.goto('/add-session');
  await pick(page, 'Started at', '0:00');
  await pick(page, 'Hours', '0 h');
  await pick(page, 'Minutes', '15 min');
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Overlaps a session you already have.');
  expect((await persisted(page)).sessions).toHaveLength(1);
});

test('calendar disables future dates and clears the chosen start when date changes', async ({ page }) => {
  await seed(page); await page.goto('/add-session');
  await pick(page, 'Started at', '0:00');
  const dateLabel = 'Wed, July 15, 2026';
  await page.getByRole('button', { name: dateLabel, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Thu Jul 16 2026', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tue Jul 14 2026', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Started at: Choose', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add session', exact: true })).toBeDisabled();
});

test('demo can be entered and exited without losing real profile data', async ({ page }) => {
  await seed(page); await page.goto('/demo');
  await page.getByRole('button', { name: 'Start demo', exact: true }).click();
  await expect.poll(async () => !!(await persisted(page)).demo).toBe(true);
  await page.goto('/demo');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Exit demo/ }).click();
  await expect.poll(async () => (await persisted(page)).demo).toBeNull();
  expect((await persisted(page)).profile.spf).toBe(30);
  expect((await persisted(page)).sessions).toHaveLength(0);
});
