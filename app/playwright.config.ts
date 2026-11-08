import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  // Metro lazily compiles routes on first use; mobile transforms may be cold.
  expect: { timeout: 45_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:8097', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-US', timezoneId: 'America/New_York' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node node_modules/expo/bin/cli start --web --port 8097',
    url: 'http://127.0.0.1:8097',
    timeout: 240_000,
    reuseExistingServer: false,
    env: { CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' },
    stdout: 'pipe',
  },
});
