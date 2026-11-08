# Test results — November 8, 2026

The suite includes the 54 existing model/engine cases, 45 new unit/integration cases, and eight new end-to-end scenarios run in two browser profiles.

| Layer | Passed | Failed | Total |
| --- | ---: | ---: | ---: |
| Unit | 47 | 0 | 47 |
| Integration | 51 | 1 | 52 |
| E2E: desktop Chromium | 8 | 0 | 8 |
| E2E: mobile Chromium / Pixel 7 emulation | 8 | 0 | 8 |
| Total | 114 | 1 | 115 |

TypeScript typecheck and repository ESLint pass. The final full browser run completed in 2.2 minutes with no retries. An earlier mobile route check exceeded its 15-second assertion timeout while Metro was still bundling. With a 45-second cold-route allowance, that full run passed.

The tab-navigation case was then strengthened to click the actual bottom-menu links. Both desktop and mobile variants passed a targeted rerun (2/2). Its locator filters hidden cached tab trees, which Expo intentionally keeps mounted; the other 14 browser cases were unchanged.

## Confirmed regression, left unfixed

`tests/integration/store.test.ts`: **changing activity mid-session retains accumulated exposure**.

Reproduction: start an upright session, advance ten minutes under deterministic Miami midday conditions, then change to lying down. Before the change, the displayed protected dose is **1.602449868754106 SED**. Immediately afterward `skinDose(active).protectedSED` returns **0**, although the per-site dose is still present.

Cause: `changeSettings` replaces the posture-site keys but retains the previous `worstSite`; `stepSession` returns early when the timestamp has not advanced. `skinDose` then cannot find the old site and reports zero. A later advancing tick can recompute the worst site. This is a transient summary issue, not evidence that the underlying dose was erased.

The regression remains an ordinary failing test. No production model, engine, or application behavior was changed, in accordance with the earlier restriction on model modifications. The suite is therefore deliberately **not all green**.

## What was exercised

- Existing physics, clouds, satellite handling, sunscreen, wet skin, calibration, uncertainty and trends.
- Formatting and time boundaries, storage security failures, location accuracy and permission denial.
- Real store/engine session start, ticks, pause/resume/end, duplicate starts, activity transitions, sunscreen logging/carryover and history.
- Retroactive session duration/future/age validation, missing location, overlap rejection, adjacent intervals, custom settings and deletion.
- Profile/session persistence and rehydration, exclusion of transient state, demo snapshot restoration, check-in selection, duplicate answers and calibration reset.
- Forecast/CAMS parsing, optional-provider outages, HTTP errors, cancellation and offline operation.
- Browser onboarding and all five tabs, browser runtime errors, horizontal overflow, session history, sunscreen, hour/minute option ranges, invalid durations, calendar selection and demo exit.

## Scope and reproducibility

Node 24 and Playwright Chromium on Windows were used. Browser tests fix time at July 15, 2026, 13:00 America/New_York and block external weather requests. They run the real Expo web app and its fallback calculations. Node tests substitute only device notification/location APIs and use the real web persistence adapter.

Mobile results are browser emulation, not native Android/iPhone results. Real notification delivery, GPS, native SQLite, background execution and Safari/WebKit were not tested. Passing numerical regression tests also does not establish clinical validity.

See [README.md](README.md) for commands and boundaries. The full browser HTML report is generated at `playwright-report/index.html`; Node JUnit reports were generated at `unit-results.xml` and `integration-results.xml`. These generated files are gitignored.
