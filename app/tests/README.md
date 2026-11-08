# Cloudscreen tests

Use Node 24 (Node's built-in TypeScript stripping and synchronous module hooks are required).

```bash
npm ci
npx playwright install chromium
npm run test:unit
npm run test:integration
npm run test:e2e
npm run typecheck
npm run lint
```

On a fresh Ubuntu CI runner, use `npx playwright install --with-deps chromium` to install browser system dependencies too.

`npm test` runs unit and integration tests. `npm run test:all` runs those followed by E2E; like a normal CI gate it stops on the first failing layer. Run the three layer commands separately to collect all results when investigating a known failure.

## Coverage by layer

| Layer | Production code exercised | Important cases |
| --- | --- | --- |
| Unit | Model, formatting, web storage, location helpers | UV physics, cloud/satellite interpretation, sunscreen wear and wet skin, dose and calibration, uncertainty, time/unit formatting, blocked or absent storage, location accuracy and denied permissions |
| Integration | Real engine, real Zustand store, real web persistence, provider parsing | Session lifecycle, pause gaps, custom activity changes, duplicate starts, sunscreen carryover, retroactive validation and overlap, demo isolation, persistence/rehydration, forecast parsing and optional CAMS failures, cancellation, threshold/date boundaries |
| E2E | Actual Expo web app in Chromium, desktop and Pixel 7 viewport | First-run onboarding, reload persistence, all five tabs, page errors and horizontal overflow, session controls/history, sunscreen, full duration option ranges, future/zero validation, saving and rejecting overlapping sessions, calendar reset, demo restoration |

The E2E clock is fixed at July 15, 2026, 13:00 America/New_York. Each test gets a clean browser context. Weather endpoints are blocked deliberately: these tests verify the real offline fallback rather than a live external provider. The onboarding test starts with no saved state; other tests seed a minimal profile via the app's persisted-storage format. No production test bypasses or test-only app routes are added.

## Native boundaries

`support/register.mjs` resolves the app's `@/` aliases for Node, selects the production web storage adapter, and substitutes device notification and Expo Location APIs. The store, engine, model, and location permission handling remain real. Notification doubles record calls but do not validate operating-system delivery.

The mobile E2E project is mobile **browser emulation**, not an Android/iOS native-device run. Native SQLite, actual GPS permission prompts, OS notifications, background/resume behavior, iOS Safari/WebKit, and screen-reader behavior still require device or platform-specific testing.

## Reports and failure policy

Playwright writes `playwright-report/index.html`, `test-results/e2e-results.json`, and screenshots/traces on failure. Open its report with `npx playwright show-report`. Generated reports and local browser/tool caches are excluded from version control.

Known regression tests remain ordinary failing tests, rather than being skipped or marked expected-failure. In particular, changing posture families can leave `worstSite` referencing a removed site until a later tick; the store regression checks that the immediately displayed dose does not drop. The engine/model were left unchanged because their modification requires explicit authorization.
