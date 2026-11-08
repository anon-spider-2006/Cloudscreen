# Cloudscreen — Mobile Application Specification

**Project Name:** Cloudscreen  
**Platform:** iOS and Android (Expo; also runs on web for development and testing)  
**Application Type:** Mobile health, wellness, and environmental tracking  
**Version:** 2.0 (November 2026)  
**Status:** Built. The dose model, the app (five tabs plus modal screens), the ground-truth fit, the demo persona and the test suite all exist. Each requirement below is marked **Built**, **Partly built** or **Not built**.

> **Where the details live.** The code is the source of truth. [MODEL_SPEC.md](MODEL_SPEC.md) explains every model file, formula, fitted value and limitation in plain English. This spec describes the product: what the app does, for whom, and the rules it must follow. Where this spec and the code disagree, fix the spec.

---

# 1. Project Overview

## 1.1 Concept

Cloudscreen estimates a person's cumulative ultraviolet (UV) dose through the day. It combines location, UV index, satellite-observed and forecast clouds, time outdoors, posture and surroundings, sunscreen, wet skin, and individual skin sensitivity.

Weather apps show the UV index at one instant. Cloudscreen instead adds up **erythemally weighted UV dose**, measured in Standard Erythema Doses (SED), and compares it with a burn threshold that it learns from the user's own skin.

It models:
- the UV reaching the skin, given posture, the ground around the user, and shade;
- how much protection sunscreen still gives as it wears off and breaks down;
- how close the user is to a sunburn, given as a **range** that reflects real measured uncertainty.

The burn threshold starts from skin type and is corrected by next-morning redness reports.

The app gives real-time estimates, a time-to-burn range, cautious alerts, sunscreen reminders, history and trends, a day planner, and a full offline demo.

## 1.2 Problem Statement

Most weather apps report the UV index as an instantaneous value without accounting for:

- how long someone has been outdoors;
- how UV changes through the day;
- where they are and what the clouds are actually doing;
- whether sunscreen was applied, when, and how much protection is left;
- posture, shade, reflective ground (sand, snow, water) and wet skin;
- their individual susceptibility to sunburn;
- cumulative exposure across several outings.

Users therefore underestimate their total UV, especially on long outings or when conditions change.

## 1.3 Proposed Solution

A local-first mobile app that estimates UV dose by combining environmental data, outdoor tracking and user-reported protection.

It keeps three quantities distinct (§4.6):

- **Ambient dose:** UV on a flat horizontal surface, the standard UV index × time.
- **Unprotected skin dose:** UV reaching the exposed skin after posture, ground reflection, shade and wet skin. It's what the skin would get with no sunscreen.
- **Protected skin dose:** the unprotected skin dose divided by the sunscreen's current effective SPF. This drives the burn estimate.

Sunscreen coverage, clothing, shade and personal sensitivity can't be measured by a phone. So every personal estimate is shown as approximate, with a range, never as a clinical measurement.

## 1.4 Differentiation

Forecast-only apps such as Sunwise (iOS) turn the UV index and skin type into "minutes left". They assume open sky and bare skin, ignore sunscreen, and keep no history. Cloudscreen gives the same instant answer, then goes further:

| | Forecast-only apps | Cloudscreen |
|---|---|---|
| Instant "time to burn" | One number | A range (cautious to optimistic), from measured error (§7.2) |
| Clouds | Assumes clear sky | Satellite-observed clouds where available, forecast clouds elsewhere, fitted to ground UV instruments (§3.3) |
| Sunscreen | Not modeled | Effective SPF that wears off and breaks down (§5.2) |
| Shade | Not modeled | One-tap shade levels, including "shade on sand protects less" (§4.5) |
| Body site | Single number | Tracks face/arms and shoulders, and shows which burns first |
| Posture, ground, snow, altitude, wet skin | Not modeled | Modeled |
| History | None | Sessions, logging after the fact, and trends (§7.4) |
| Personal threshold | Skin-type table | Bayesian estimate that narrows with each check-in (§6.4) |
| Planning | Hourly + 7-day UV | Hourly + 7-day UV, plus a planner using your own burn estimate (§7.5) |
| Transparency | Explains SED arithmetic | "Why this number?" shows every factor and its uncertainty (§7.7) |
| Privacy | Sends your location | Providers only see an ~11 km cell; the exact point stays on the phone (§17) |

**Pitch line:** *Forecast apps tell you how long you could last under a clear sky with bare skin. Cloudscreen tracks what actually happened (the clouds the satellite saw, shade, your posture, sunscreen wearing off, a swim) and learns your skin.*

## 1.5 Target Audience

- People who spend a lot of time outdoors: runners, hikers, cyclists, beachgoers, travellers.
- People who want sunscreen reminders and a record of their sun exposure.
- Users across all skin types I–VI.

The app is for general wellness and sun-safety education, not medical diagnosis or treatment.

# 2. Project Goals

## 2.1 Primary Goals

| # | Goal | Status |
|---|---|---|
| 1 | Estimate cumulative erythemally weighted UV dose during outdoor activities | Built |
| 2 | Retrieve location-specific UV and cloud conditions, using satellite observations where available | Built |
| 3 | Track outdoor time manually, and allow logging it after the fact | Built (automatic detection not built) |
| 4 | Record sunscreen and model how its protection fades | Built |
| 5 | Estimate progress toward a sunburn and the time remaining, as a range, using a threshold that learns the user's skin | Built |
| 6 | Show understandable visualizations of exposure and trends | Built |
| 7 | Warn early about burn progress, sunscreen and check-ins | Built |
| 8 | Keep a history of UV exposure and outdoor activity | Built |
| 9 | Offer a complete offline demo with a realistic person and history | Built (§7.8) |

## 2.2 Secondary Goals

1. Forecast exposure for planned activities. **Built** (planner, §7.5).
2. Wearable and fitness-platform integrations. **Not built.**
3. Privacy-conscious location handling. **Built** (privacy cell, §17). Background tracking is **not built**.
4. Educational information about UV and sun protection. **Partly built** ("Why this number?", the methodology card in Profile).

## 2.3 We do not

- Diagnose sunburn, skin cancer, or other medical conditions.
- Guarantee that any exposure duration is safe.
- Measure UV with the phone's camera or sensors.
- Measure actual sunscreen coverage. Protection is modeled from what the user logs, with stated assumptions.
- Treat a calculated threshold as a safe daily allowance. Staying below the burn estimate does not mean no harm.
- Replace professional medical advice or sun-protection guidelines.

# 3. Core Features

## 3.1 User Onboarding and Profile

### Description

On first launch, users go through a four-step onboarding (`app/src/app/onboarding.tsx`). A **"Just looking? Try the demo"** link on every step opens the demo instead (§7.8).

| Step | Question | Stored as |
|---|---|---|
| 1 of 4: your skin | How does your skin react to sun? Six plain-language answers plus "Not sure" (§6.1) | `skinType` |
| 2 of 4: sunscreen | What do you usually wear? SPF | `spf` (filter, amount and water resistance default, and can be edited later) |
| 3 of 4: location | Where are you? "Use my location" or pick a city | `place` |
| 4 of 4: alerts | Turn on alerts, or not now | `notifications` |

### Profile fields (`Profile` in `app/src/state/store.ts`)

| Field | Type | Default |
|---|---|---|
| `skinType` | 1–6 | 2 |
| `cUser` | personal MED multiplier, from the calibration posterior median | 1 |
| `medLogSpread` | posterior spread of personal MED (§6.4) | the skin type's prior |
| `calibrationResetAt` | check-ins answered before this are ignored | — |
| `spf`, `filter`, `mgPerCm2`, `waterResistant` | sunscreen defaults | 30, `photostable`, 1 mg/cm², false |
| `preset` | default activity (§7.3) | `walk` |
| `reminderMin` | reapply reminder interval | 120 |
| `uvMode` | `forecast` or `physics`; `demo` only inside the demo | `forecast` |
| `notifications` | on/off | from onboarding |

### Requirements

- Explain during onboarding that skin type is only a starting point, refined by morning check-ins. **Built.**
- Let users skip optional questions and edit everything later in Profile. **Built.**
- Request location permission only when the user taps "Use my location". **Built.**
- Offer manual city selection. **Built.**
- Measurement units (metric/imperial). **Not built**: dose is always in SED and temperature isn't shown.

---

## 3.2 Location Tracking

### Description

The app needs the user's location for local UV and clouds, and handles it with privacy first (§17).

### Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| LOC-001 | Request foreground location permission only when needed | Built |
| LOC-002 | Get coordinates from device location services (last known within 30 min, else a balanced-accuracy fix), rounded to 0.01° on the device | Built |
| LOC-003 | Support manual city selection | Built (fixed city list) |
| LOC-004 | Record a location accuracy with every place: the GPS fix's reported accuracy (minimum 1 km; large when Precise Location is off or only coarse permission is granted), or 10 km for a picked city | Built (`Place.accuracyKm`) |
| LOC-005 | Refresh conditions when the user moves to a different privacy cell (§17) | Built |
| LOC-006 | Background tracking only when explicitly enabled and supported | Not built |
| LOC-007 | Stop location updates when no session is active | Built (location is only read on request) |
| LOC-008 | Let the user pause location collection | Not built (not needed while location is only read on request) |

### Privacy

The exact point and its accuracy never leave the phone. Providers only ever see a fixed ~11 km privacy cell, and the same request is sent whether the user shared precise GPS, coarse location or picked a city (§17.2, SEC-003).

---

## 3.3 UV Index and Environmental Data

### Description

UV is built from several sources. Each was fitted or checked against ground UV instruments (MODEL_SPEC §6).

### Data used

| Data | Source | Purpose |
|---|---|---|
| UV index, clear-sky UV index, low/mid/high cloud cover, grid elevation | Open-Meteo forecast API: 2 days back, 7 days ahead, hourly | NWP clouds; the legacy UV path; the 7-day outlook |
| CAMS clear-sky UV index | Open-Meteo air-quality API: 2 days back, about 4.5 days ahead | Clear-sky UV including forecast ozone and aerosol |
| Satellite surface irradiance (GHI) | Open-Meteo satellite API: Himawari, MSG, MTG, about 5 km, every 10–15 min | Observed cloud effect |
| Solar position, Sun–Earth distance | computed on the device (`solar.ts`, suncalc) | Clear-sky physics, geometry, sun colour |

**Satellite coverage:** Europe, Africa, South America, Asia and Australia. **North America is not covered** (no GOES data yet); there the app uses forecast clouds.

### How UVI(t) is produced (`readUV`, `uvSource.ts`)

| Mode | UV | When |
|---|---|---|
| `forecast` (default) | clear = 0.88 × CAMS clear-sky UV (Allaart if CAMS is missing). Clouds come from the satellite over observed periods and blend back to the ground-fitted cloud layers after the last observation. Raw Open-Meteo UV is used only when CAMS is missing. | Normal use |
| `physics` | Allaart clear sky × the Open-Meteo-fitted cloud factor, with satellite mixed in the same way | Chosen in Profile, or the automatic fallback when there is no forecast |
| `demo` | Allaart clear sky × user-chosen clouds, fully offline | Only inside the demo (§7.8) |

**Measured accuracy** (daily dose error against ARPANSA radiometers, leave-one-station-out; MODEL_SPEC §6):

| Source | Daily dose error | Days under-predicted by > 20% |
|---|---:|---:|
| Raw Open-Meteo UV (the old default) | 24.8% | 9.0% |
| Forecast chain without satellite | 14.3% | 4.2% |
| With satellite, live (data ~60 min late) | 7.1% | 0.3% |
| With satellite, after the fact | 5.8% | 0.5% |

### Sanity Clamp

A UVI above `1.5 × max(clear-sky values) + 0.5`, or below 0, is treated as bad data. It's clamped into range and flagged `clamped: true`, and Home shows a banner. **Built.**

### Modeling Rule

**Each UV value carries exactly one cloud effect.** The satellite cloud factor *replaces* the forecast's cloud effect rather than multiplying it, and a cloud factor is never applied to a value that already includes clouds (ENV-009). Values from `physics` and `demo` mode are modeled scenarios and must never be labelled as measured.

### Requirements

| ID | Requirement | Status |
|---|---|---|
| ENV-001 | Get current or latest UV conditions | Built |
| ENV-002 | Get hourly forecasts (7 days) | Built |
| ENV-003 | Cache and refresh sparingly: forecast every 30 min; satellite one full 50 h fetch, then the last 3 h every 10 min, merged; an uncovered cell rechecked daily | Built |
| ENV-004 | Show the age of the data ("Forecast, updated 4:12 pm"; banner when older than 3 h) | Built |
| ENV-005 | Say where the UV comes from, in plain words (§7.2) | Built |
| ENV-006 | Handle outages and missing values: CAMS or satellite failures fall back silently, a forecast failure shows a banner and uses the offline estimate | Built |
| ENV-007 | Never silently substitute stale data for live data | Built |
| ENV-008 | Record provenance for calculations | Partly built: sessions store the model version, max UV and whether the offline estimate was used; there are no per-observation records |
| ENV-009 | Never apply a cloud factor to a UVI that already includes clouds | Built, tested |
| ENV-010 | Show when a reading was clamped or came from the offline estimate | Built |

---

# 4. UV Dose Calculation Engine

The engine lives in `app/src/model/` as pure TypeScript with no React Native imports, so the same code runs in the app, in Node tests and in the offline fit pipeline. App-level logic (sessions, time to burn, alerts, trends, check-ins) is in `app/src/engine/`. **Every formula and fitted value is documented in MODEL_SPEC.md**; this section gives the product-level rules.

## 4.1 Pipeline

```text
 solar.ts        sun position, Sun–Earth distance
     │
 uvSource.ts     clear sky (0.88 × CAMS, or Allaart)  ×  cloud factor (satellite ↔ forecast layers)
     │           ── satellite.ts: privacy lattice, on-device aggregation, persistence
     ▼
 exposure.ts     × geometry G           posture, ground reflection, shade
     ▼
 sunscreen.ts    ÷ effective SPF        under-application, breakdown, wear
     ▼
 dose.ts         × wet skin             swimming 25%, sweating 16% lower MED, fades over 20 min
                 ∫ dt → SED → burn fraction = dose ÷ (MED_type × c_user)
     ▼
 uncertainty.ts  measured error band → time-to-burn range, cautious alerts
 calibration.ts  next-morning redness → Bayesian posterior of personal MED
```

## 4.2 Units

The UV index is proportional to erythemally weighted irradiance: E = 0.025 × UVI W/m². One SED = 100 J/m². For constant UVI on a flat surface, SED = 0.015 × UVI × minutes. For example, 30 minutes at UVI 6 is **2.7 SED ambient**.

## 4.3 Step 1 — Clear-Sky UV

- **Forecast mode:** 0.88 × CAMS clear-sky UV. CAMS includes forecast ozone and aerosol, so its ratio to ground instruments stays flat across the year and needs only a single scale factor.
- **Fallback, physics and demo:** the Allaart (TEMIS 2017) formula from sun angle and ozone (300 DU climatology), plus 5% per km of altitude.
  - Measured limitation: with ozone fixed at 300 DU it is off by ±15–20% across the ozone season.
- **Not used any more:** Open-Meteo's own clear-sky UV. It is 22% low with the sun high and up to 45% high with it low.

## 4.4 Step 2 — Cloud Effect

| Source | Cloud factor | Used |
|---|---|---|
| Satellite | min(GHI ÷ clear-sky GHI, 1)^0.876, per ~5 km pixel, aggregated on the device (§17) | Observed periods; persists with weight e^(−lag/4 h) after the last observation |
| Forecast cloud layers, ground fit | 1 − Σ aᵢ cᵢ^bᵢ (full overcast 0.40) | Forecast mode with CAMS |
| Forecast cloud layers, Open-Meteo fit | same form, fitted to Open-Meteo's own UV | Physics and demo modes |

Fitted parameters are generated by the `model-fit/` scripts into `cmfParams.ts` and `groundParams.ts`. **Never edit them by hand.**

## 4.5 Step 3 — Exposure Geometry

UVI is measured on a flat surface; skin mostly isn't. The geometry factor G converts horizontal UV to UV on skin:
- **Position:** upright or lying.
- **Direct versus scattered light.**
- **Ground reflection:** grass 2%, pavement 7%, water 8%, sand 20%, snow 80%, plus a snow multiple-reflection boost.
- **Shade:** none, umbrella or dense. Shade values are assumptions.

**Worst site:** upright outings track face/arms *and* shoulders together, and the app headlines whichever burns first (usually the shoulders, in about a third of the time at midday). Lying outings track one site. "Shoulders" is not a separate position the user picks.

**Shade on reflective ground:** an umbrella on sand only about halves the dose to upright skin, because reflected UV comes from below. The app says this whenever shade is chosen on sand, water or snow.

## 4.6 Dose Quantities

| Quantity | Meaning | Stored as |
|---|---|---|
| **Ambient dose** | UV on a flat surface | `Session.ambientSED` |
| **Unprotected skin dose** | UV on the skin site with no sunscreen, wet-skin factor included | site `SessionState.bareSED` (older sessions fall back to `ambientSED`) |
| **Protected skin dose** | Unprotected skin dose ÷ effective SPF | site `SessionState.doseSED` |

The unprotected skin dose is always shown next to the protected dose, so a sunscreen-adjusted number never appears on its own. Each site's `SessionState.ambientSED` is the physical UV at that site, unaffected by wet skin.

## 4.7 Time Integration

- **Dose is integrated over time,** never computed as one daily UVI × total time. `advance()` steps in sub-steps of at most 60 s, keeping dose, sunscreen breakdown and wet-skin drying coupled.
- **Timestamps drive it, not ticks.** The session is stepped from the last update to now, so gaps (the app in the background) are filled from the stored data when it reopens.
- **`project()` simulates forward** over up to 12 h or until sunset and returns the fraction timeline. Time to burn reads three times off one projection (§7.2).

## 4.8 Step 5 — Burn Estimate

burn fraction = protected skin dose ÷ (MED_type × c_user)

At 1.0 the model estimates just-perceptible redness at the worst site. MED_type is the skin-type starting point (§6.2), and c_user comes from the calibration posterior (§6.4).

**Uncertainty:** every projection carries a band combining two things:
- the measured UV error for the current source and horizon (MODEL_SPEC §7), widened for coarse locations;
- the person's MED uncertainty.

They become the time-to-burn range (§7.2) and the cautious alert factor (§8).

## 4.9 Outdoor Exposure Detection

### Manual Tracking (Built)

Start, pause, resume and end a session on Track. This is the authoritative way to record outdoor time.

### Logging Time After the Fact (Built)

"Add time I was outside" (Home and History) adds a session for today or yesterday:
- **Inputs:** date, start time in 15-minute steps, duration in hours and minutes, the activity picker (§7.3), and sunscreen (none, or the default SPF at the start).
- **Same calculation as a live session,** using the stored forecast for those hours.
- **Validation:** sessions must not end in the future, overlap an existing session, or be more than two days old. Adjacent sessions are allowed.
- **Labelling:** "added later", and counted like live sessions in totals, trends and check-ins.

### Automatic Tracking (Not built)

Possible future inputs: GPS and motion patterns, or schedules. Movement must never be treated as being outdoors, since the user may be driving or sitting by a window.

---

# 5. Sunscreen Tracking

## 5.1 Logging (Built, `app/src/app/sunscreen.tsx`)

| Field | Options |
|---|---|
| SPF on the label | defaults from Profile |
| How much? | Light 0.5, Typical 1, Generous 2 mg/cm² |
| Type | Mineral / photostable, or Chemical (avobenzone/octinoxate) |
| Water resistant | yes/no |
| When? | Now, 15 min ago, 30 min ago, 1 h ago |

- **During a session:** logging applies to it straight away (a new film each time) and is tied to the session.
- **Just before going out:** sunscreen put on in the last 4 hours carries into a session started afterwards.
- **Not built:** editing or deleting an application, body-area tracking, and notes.

## 5.2 Sunscreen Film Model (`sunscreen.ts`)

Effective SPF = SPF_label raised to three shrinking factors (MODEL_SPEC §9):

| Factor | What it models | Basis |
|---|---|---|
| Application | less than the 2 mg/cm² lab amount (default 1 mg/cm²: SPF 30 starts at about SPF 9) | Assumption (geometric mean of the bounds) |
| Breakdown | UV breaking down the filters, driven by the dose that has hit the film | Fit to Gonzalez et al. 2007 |
| Wear | rubbing, sweat, water: τ = 2 h dry, 2× sweating, 4× swimming; water-resistant labels halve the extra wear | Assumption |

The app must:
1. always show the unprotected skin dose next to the protected one;
2. never present SPF as a multiplier of safe time (SPF 30 buys hours, not 30×);
3. default to typical application (1 mg/cm²), never the lab amount;
4. start a new film on each application, without ever reducing the dose already received;
5. show the current effective SPF and label the assumptions.

**Salt water:** sea, lake and pool get the same wear rate. Some tests suggest salt water removes sunscreen faster, but results are product-dependent, so no separate rate is modelled (§23).

## 5.3 Reapplication Reminders (Built)

A local notification fires `reminderMin` (default 120) after the last application while a session is running: "Time to think about reapplying. It's been 2 h since your last sunscreen. Follow your product's directions." It never implies that reapplying resets the dose received.

## 5.4 Protection Events

| Event | How it's captured | Effect |
|---|---|---|
| Sunscreen | Log sunscreen | New film |
| Shade on/off | Activity picker shade | Removes direct sun and part of the sky (§4.5) |
| Swimming, sweating | Activity picker skin state | Faster wear, and wet skin lowers MED (§6.5) |
| Clothing, hat, towel drying | Not captured | Not modeled |

---

# 6. Personalized Exposure Interpretation

## 6.1 Skin Type

| Onboarding answer | Type |
|---|---|
| Always burns, never tans | I |
| Burns easily, tans minimally | II |
| Sometimes burns, tans gradually | III |
| Rarely burns, tans well | IV |
| Very rarely burns, tans deeply | V |
| Never burns | VI |
| Not sure | II (cautious default) |

Self-reported type is an unreliable guide to UVB sensitivity (Brenner & Hearing 2008). It is only the starting point of the calibration prior (§6.4).

## 6.2 Minimum Erythema Dose

Typical MED by type (`MED_SED`), used as the prior median: I 2.5, II 3, III 4, IV 5, V 7, VI 10 SED.

For types V and VI the app says that even darker skin gets UV DNA damage before any visible burn, and that no redness doesn't mean no damage.

## 6.3 Exposure Indicators

Shown on Home and Track:
- current UVI and its category (§16.2);
- estimated burn progress as a % of the estimated threshold;
- the time-to-burn range;
- unprotected skin dose and ambient dose;
- sunscreen status and current effective SPF.

Wording rules:
- say "estimated burn progress" or "your estimated burn threshold", never "safe limit";
- the range's earlier end is "plan on the earlier time";
- alerts say "may" ("You may be at 80%…");
- falling below 100% is never presented as safety.

## 6.4 Personal Calibration (Bayesian, `calibration.ts`)

**The check-in:**
- **Question:** the morning after an outing, "Any redness?", with three answers: no redness, a little pink, burned (sore or very red).
- **Timing:** 9:00 the next day, and at least 12 h after the session, because redness peaks 8–24 h after exposure.

**The estimate:** a posterior over the person's MED, computed exactly on a grid.
- **Prior per stated type:**
  - 70% that type and 15% each neighbour. The split is an assumption.
  - Within-type spread of 0.40 for types I–IV, from published phototest spreads, and an assumed 0.50 for V–VI.
- **Reading an answer:** an ordinal model (none below 1 MED, pink 1–2 MED, burned above 2 MED), with noise from:
  - the measured UV error;
  - report fuzz;
  - sunscreen (if worn);
  - 5% of answers treated as random.
- **Evidence per day:** the sum of that day's sessions at their worst site. Demo sessions never count.
- **Results:**
  - `cUser` = posterior median ÷ the type's typical MED.
  - The posterior spread widens the time-to-burn range and makes alerts earlier for new users; both tighten with check-ins.
- **Reset** keeps old answers but ignores them. Changing skin type re-reads all answers against the new prior.

**Simulation** (MODEL_SPEC, calibration report): over 30 check-ins, across all types I–VI, the typical error falls from 33–45% to 9–16%. The old step rule drifted to about 2× off.

## 6.5 Wet Skin

Wet skin burns sooner, because water soaked into the outer skin layer reflects and scatters less UV:

| Activity | MED lowered by | Evidence |
|---|---|---|
| Swimming (sea, lake or pool) | 25% | salt-water bath phototests: −23% and −31% |
| Sweating | 16% | median after jogging or a sauna |

- **Wetness, not salt:** tap water and sea-strength salt water both lower MED, while near-saturated brine doesn't. So the type of water doesn't matter.
- **Drying:** the effect fades linearly over 20 minutes once dry.
- **Assumption:** a swimming outing keeps the skin wet throughout. UV absorbed while submerged isn't modelled, so this errs toward more dose.

---

# 7. User Interface and Screens

## 7.1 Navigation Structure

Five tabs: **Home, Track, Forecast, History, Profile.** They use native tabs on iOS and Android (Liquid Glass on iOS 26) and a floating glass capsule on web.

Modal screens:
- Why this number?
- Log sunscreen
- Add time outside
- Morning check-in
- Demo
- Session details
- Onboarding

## 7.2 Home Dashboard (Built)

Top to bottom:
1. **Wordmark** (the O drawn as a cloud) and the date.
2. **Headline,** then the **place** (tappable, opens Profile) and **where the UV comes from**, in plain words:

   | Situation | Line |
   |---|---|
   | Satellite | "Forecast with live satellite clouds, updated 4:12 pm" |
   | No satellite | "Forecast, updated 4:12 pm" |
   | Forecast not loaded | "Offline estimate until the forecast loads" |
   | Physics chosen | "Cloudscreen's own sky model" |
   | Demo | "Demo sky, offline" |

3. **Banners when relevant:**
   - a burn alert;
   - a pending morning check-in;
   - forecast unavailable;
   - value clamped;
   - forecast older than 3 h.
4. **Under this sky:** UV index, category, the sun icon and an hourly UV chart.
5. **Time to burn (est.):** the current activity, then:
   - **bare skin** and **with your SPF** as ranges ("35–50 min", "Possible after 1 h 20 min", "Not expected today");
   - which site burns first;
   - "Most likely ~42 min; plan on the earlier time";
   - Why this number?
6. **Your day outside:** burn progress %, unprotected skin dose, ambient dose, time outside, and what an SED is.
7. **A layer of care:** sunscreen status ("SPF 50, put on at 12:10 (45 min ago)" or "None today. Last time: …") and Log sunscreen.
8. **Session and logging buttons:** Start outdoor session (or "Open your running session"), and Add time I was outside.

**How the range is calculated:**
- One 2-minute-resolution projection per site, read off at three targets: central fraction 1/hi (cautious), 1 (most likely), 1/lo (optimistic).
- The band combines the measured UV error for the current source and horizon with the skin uncertainty.
- It is capped at sunset, or 12 h.

| ID | Requirement | Status |
|---|---|---|
| HOME-001 | Show the latest UV index | Built |
| HOME-002 | Show today's burn progress, unprotected skin dose and ambient dose | Built |
| HOME-003 | Update live estimates as time passes (once a minute) | Built |
| HOME-004 | Show sunscreen status | Built |
| HOME-005 | Direct access to session controls | Built |
| HOME-006 | Indicate stale, clamped, offline or demo data | Built |
| HOME-007 | Show the pending morning check-in | Built |
| HOME-008 | Time to burn without a session | Built |
| HOME-009 | Offer "Add time I was outside" | Built |

## 7.3 Track Screen and the Activity Picker (Built)

**While a session runs:**
- session card (UV, timer);
- burn progress per site, with bars;
- "Shoulders burn first, in 35–50 min";
- dose card (on skin, unprotected, ambient, the current rate in plain words, current effective SPF);
- Log sunscreen;
- Pause/Resume and End.

**With no session:**
- "If you go out now" with both ranges;
- Start outdoor session.

**The activity picker** (`components/cs/activity-picker.tsx`) is the same on Track, Add time outside and the planner. It offers only the inputs the model distinguishes:

| Preset | Position | Ground | Skin state |
|---|---|---|---|
| Walk / errands (default) | upright | pavement | dry |
| Run / cycle | upright | pavement | sweating |
| Park / picnic | upright | grass | dry |
| Beach | lying | sand | swimming |
| Pool / lake | lying | water | swimming |
| Ski / snow | upright | snow | sweating |

- **Shade:** open sun, umbrella / awning, or dense trees / covered porch.
- **"Adjust details ›"** opens position (upright / lying down), the five ground types, and sweat or water (dry, sweating, swimming / in water). Each option says what it does.
- **Changing any detail makes the activity "Custom".**
- **Labels everywhere** come from one rule: the matching preset's name, or "Custom: Lying down, Dry sand, Sweating".
- **During a session,** a change applies from that moment and keeps the dose so far.
- **In Profile,** picking a default activity clears a custom choice for the next session.

## 7.4 History (Built)

**Trends card:**
- **Last 7 days against the 7 before** (rolling): time outside, dose on your skin, and days near a burn (≥ 80%).
- **Sunscreen over 30 days:**
  - the share of outdoor time after sunscreen went on, from each session's event timeline, with pauses excluded;
  - the share of dose it actually removed when worn, against the label SPF.
- **How well the app knows your skin:** the burn-dose estimate and its likely range, with a chart narrowing over check-ins ("42% narrower than when you started").

**Skin dose, last 14 days:** a bar chart coloured by peak burn progress.

**Per-day cards:**
- time outside and dose;
- a peak burn progress bar;
- each session as its activity label, with the time underneath (and "added later");
- the session's protected dose, tapping through to details.

**Session details:**
- activity, times, duration, average and peak UV;
- peak burn progress and site;
- the event timeline;
- settings at the end;
- the check-in answer and the resulting estimate.

| ID | Requirement | Status |
|---|---|---|
| HIST-001 | Store completed sessions locally | Built |
| HIST-002 | Aggregate by local calendar day | Built |
| HIST-003 | Handle midnight and timezones | Built (local day keys; tested across year rollover) |
| HIST-004 | Let users delete sessions | Built |
| HIST-005 | Recalculate summaries after edits | Built (summaries are computed from sessions) |
| HIST-006 | Add past sessions, labelled "added later" | Built |

Demo sessions are excluded from trends and calibration.

## 7.5 Forecast and Planner (Built)

- **Hourly UV** for today or tomorrow.
- **7-day outlook:** each day's peak UV, its category, and the hours at UV 3+. Days 3–7 are marked "(outlook)" as less reliable.
- **Planner:**
  - **Inputs:** a duration (15 min to 3 h), the activity picker (its own copy, starting from the last choice), and sunscreen (none or the default SPF).
  - **How it works:** projects every 30-minute start time between sunrise and sunset.
  - **Output:** peak burn progress by start time, the lowest-UV windows (lowest third), and for a selected start, the dose and when the threshold would be reached.
  - **Wording:** "lowest-UV windows", never "safe times".
  - **Limitation:** the planner ranks with the central estimate, not the range.

## 7.6 Profile and Settings (Built)

- **Skin type.**
- **Personal calibration:** "Your burn dose: about 2.5 SED, likely 1.8–3.4 SED", how it was learned, recent check-ins, and Reset calibration.
- **Location:** Use my location, or pick a city.
- **Sunscreen defaults:** SPF, filter, amount, water resistance, and the reminder interval.
- **Default activity.**
- **Notifications** on/off.
- **UV source:** forecast (default) or Cloudscreen's own physics model.
- **Try the demo** card (or "You're in the demo").
- **How Cloudscreen estimates:** the methodology, assumptions and model version.
- **Privacy:** everything stays on this device; Delete all data.

**Not built:** units, data export, cloud sync, background tracking settings.

## 7.7 "Why this number?" (Built)

A modal with every factor behind the current number:

```text
Clear-sky UV (sun 28° from overhead)   9.8   reference: Allaart at 300 DU; the UV index uses CAMS clear sky
× clouds                               0.72  implied: UV index ÷ clear sky (clouds from satellite)
= UV index                             7.1
× shoulders on pavement                0.95  Walk / errands, open sun
× wet skin                             1.33  shown only when swimming or sweating
÷ sunscreen, now                       6.1
= dose rate on skin                    0.017 SED/min
Your estimated threshold               2.5 SED
→ time left                            35–50 min
UV uncertainty over that time          −30% to +24%
```

The values above are illustrative; the screen shows live ones. Each row notes whether its value is measured, fitted or assumed.

## 7.8 Demo Mode (Built, `app/src/demo/mackenzie.ts`, `app/src/app/demo.tsx`)

A complete, made-up person, so every screen has something to show, fully offline:

- **The persona:**
  - Mackenzie McHale, an executive producer in Manhattan. This is a fan reference to HBO's *The Newsroom*; swap the name before any public release.
  - Skin type II with a hidden true MED of about 2.7 SED. SPF 50, chemical, applied at 1 mg/cm², not water-resistant.
- **Her history:**
  - two weeks in Manhattan: a rooftop-lunch burn, then better habits;
  - Saturday 14 August 2027: a 30-minute lunch under an umbrella on a Lake George dock, then an evening hike up Cascade Mountain (trailhead 640 m, summit 1,249 m).
- **Built by the real engine.** Each check-in answer is tested against the dose the model gives her.
- **Entering:** Profile ("Try the demo"), or "Just looking? Try the demo" in onboarding. An intro sheet explains who she is and that your data is set aside.
- **While it's running:**
  - a coral strip on every screen ("Demo: Mackenzie, 17:15 · Controls ›");
  - the controls: jump to 12:30 on the dock, 5:15 at the trailhead or 7:00 on the summit, set the sky (low, mid and high cloud), restart, or exit;
  - the clock runs from the chosen moment.
- **Your data is safe:**
  - your real data is saved aside, including while the app is closed, and restored exactly on exit;
  - the demo never fetches anything or uses your location;
  - its only notification is one scripted sunscreen nudge, 30 s after entering or jumping (an in-app banner without permission). There is none on the summit, where the UV is too low.
- **Leftover cleanup:** if real data ever holds a demo place or demo mode (the pre-persona demo left "Miami, FL (demo)"), it's cleared on load.

---

# 8. Notification System

## 8.1 Notification Categories

| Notification | Trigger | Status |
|---|---|---|
| Burn progress 50% / 80% / 100% | The **cautious** dose (central × the band's high end for the session's outdoor time) crosses the threshold. Scheduled ahead by projecting to threshold ÷ factor, so the alert time never slides later. Wording: "You may be at…" | Built |
| Reapply reminder | `reminderMin` after the last sunscreen during a session | Built |
| Morning check-in | 9:00 the next day, at least 12 h after the session; one per day | Built |
| Demo sunscreen nudge | 30 s after entering the demo or jumping to the dock or trailhead | Built |
| High UV, long session, planned-outing forecast, data unavailable | — | Not built |

## 8.2 Notification Requirements

| ID | Requirement | Status |
|---|---|---|
| NOTIF-001 | Ask for permission only when needed. On Android 13+ the channel is created first, otherwise the prompt never shows | Built |
| NOTIF-002 | Respect the user's setting; demo data never schedules real alerts | Built |
| NOTIF-003 | No duplicates: fixed identifiers per purpose, so rescheduling replaces | Built |
| NOTIF-004 | Cancel or reschedule when sessions end or settings change | Built |
| NOTIF-005 | No alarming language: "may", "estimated", never "safe" | Built |
| NOTIF-006 | Work within background limits by scheduling ahead from the projection | Built |
| NOTIF-007 | Each threshold fires at most once per session | Built |
| NOTIF-008 | At most one morning check-in per day | Built |

**Implementation notes:**
- Local notifications only, through expo-notifications, which work in Expo Go.
- They use the "Cloudscreen" channel on Android.
- The web build uses a stand-in module that does nothing, so the library isn't loaded there.

---

# 9. Technical Architecture

## 9.1 Technology Stack

| Component | Technology |
|---|---|
| Framework | React Native 0.88, Expo SDK 58, TypeScript |
| Navigation | Expo Router (native tabs; modals) |
| State | Zustand, persisted |
| Local storage | `expo-sqlite/kv-store` (native), `localStorage` (web), as one JSON document |
| Location | expo-location |
| Notifications | expo-notifications (local only) |
| Graphics and charts | react-native-svg, custom components |
| Solar position | suncalc |
| Data | Open-Meteo forecast, air-quality (CAMS) and satellite APIs; no backend |
| Model fitting (offline) | Node (`fetch.ts`, `ground.ts`, `calibration_sim.ts`) and Python/scipy (`fit.py`, `ground_fit.py`) in `model-fit/` |
| Tests | Node's built-in test runner (unit, integration), Playwright (end-to-end); see §18 |
| Not used | TanStack Query, SecureStore, a backend, accounts |

The app is **local-first**: dose calculations, sessions, sunscreen, history, calibration and the demo all work on the device with no account and no server.

## 9.2 High-Level Architecture

```text
Presentation   app/src/app (screens) · components/cs (UI kit: glass controls, activity picker,
               trends, charts, wordmark, demo strip, sun icon)
                 │
State          app/src/state/store.ts: Zustand store, persistence, demo snapshot, refresh, alerts
                 │
App engine     app/src/engine: sessions, time to burn, cautious alerts, planner, replay,
               check-ins, trends, activity labels (pure, Node-testable)
                 │
Model          app/src/model: solar, clearSky, cmf, uvSource, satellite, exposure, sunscreen,
               dose, calibration, uncertainty, generated params (pure, Node-testable)
                 │
Services       app/src/services: location, notifications (.web stand-in)
                 │
Network        Open-Meteo forecast, air-quality and satellite APIs (privacy cell only)
```

## 9.3 Architectural Principles

1. Keep scientific calculations independent of the UI. Model and engine code have no React Native imports.
2. Use pure functions for dose calculations.
3. Store timestamps as epoch milliseconds (UTC) and display in local time.
4. Persist everything locally.
5. Keep providers replaceable: a new source must produce the same `Forecast` or `SatelliteObs` shape.
6. Never send the exact location (§17).
7. Separate measured, fitted and assumed values, and label each in the UI.
8. Generated parameters only come from the fit scripts.

---

# 10. Data Models

The persisted state is one JSON document (§11). The main types are defined in code; this section summarizes them.

## 10.1 Profile

See §3.1. `skinProfile(profile)` converts it to the model's `SkinProfile` (`{ skinType, cUser, medLogSpread }`).

## 10.2 Place

```typescript
interface Place {
  lat: number; lon: number;        // rounded to 0.01° on device
  name: string;
  source: 'gps' | 'manual' | 'demo';
  accuracyKm?: number;             // GPS fix accuracy (≥ 1 km) or 10 km for a city; never sent
  elevationM?: number;             // demo places; real places use the forecast's elevation
}
```

## 10.3 Environmental Data

- **`Forecast`:** `{ lat, lon, elevationM, hours: HourlyPoint[], fetchedAt }`, where each hour has its centre time, `uvi`, `uviClear`, `clouds` and `uviClearCams`. The lat/lon is the privacy-cell centre.
- **`SatelliteObs`:** `{ provider, cell, points (5×5 lattice), slots: { t, cmf[] }[], stepMs, covered, fetchedAt }`, as per-pixel UV cloud factors.
- **`UVReading`:** what `readUV` returns. It holds `uvi`, `szaDeg` and `cmf`, plus:
  - `mode`, `clamped` and `cloudSource` (where the value came from);
  - `satWeight` and `satObsT` (how much the satellite counted, and which slot);
  - `uviRange` (spread across nearby pixels);
  - `errorClass` (which error band applies);
  - `uviClearAllaart`, `cmfLayers` and `cmfObserved` (diagnostics for "Why this number?").

## 10.4 Session

```typescript
interface Session {
  id: string;
  status: 'active' | 'paused' | 'completed';
  trackingMode: 'manual' | 'retroactive';
  startedAt: number; endedAt?: number; lastT: number;
  preset: Preset; settings: ExposureSettings;      // label via activityLabel(preset, settings)
  sites: Partial<Record<Posture, SessionState>>;   // one per tracked site
  worstSite: Posture; peakFraction: number; thresholdsFired: number[];
  outdoorSeconds: number; ambientSED: number;      // ambient = flat surface
  maxUVI: number; uviSeconds: number; usedFallback: boolean;
  cUserAtSession: number;
  lastSunscreenAt?: number; lastSpf?: number;
  events: { t: number; kind: 'start'|'pause'|'resume'|'end'|'sunscreen'|'settings'; detail?: string }[];
  demo?: boolean;                                  // recorded in demo mode: excluded from calibration and trends
  modelVersion: string;                            // MODEL_VERSION
}

interface SessionState { t: number; doseSED: number; ambientSED: number; bareSED?: number; hydration?: number; film: FilmState | null }
```

Sessions keep an event timeline rather than separate interval records. Settings changes during a session apply from that moment (`changeSettings`).

## 10.5 Sunscreen Application

`LoggedSunscreen = SunscreenApplication & { id, sessionId? }`, where `SunscreenApplication` is `{ spfLabel, filter, mgPerCm2, waterResistant, appliedAt }`.

## 10.6 Check-In

```typescript
interface CheckIn {
  day: string; sessionIds: string[]; promptAt: number;
  predictedFraction: number; cUserBefore: number;
  doseSED?: number; doseLogSigma?: number; sunscreen?: boolean;  // evidence for the posterior
  redness?: 'none' | 'pink' | 'burned'; answeredAt?: number;
  cUserAfter?: number; medAfter?: { median: number; q10: number; q90: number };
}
```

---

# 11. Local Persistence

- **One document:** the Zustand store is saved as a single JSON document under the key `cloudscreen-v1`, using `expo-sqlite/kv-store` on the phone and `localStorage` on web (`app/src/state/storage*.ts`).
- **What's saved:** profile, place, forecast, satellite observations, the shade and custom activity choice, the active session, sessions, the sunscreen log, check-ins, the demo state and the real-data snapshot. Banners, loading flags and errors aren't saved.
- **Versioned migrations:** version 2 clears leftover demo places and demo mode from real data.
- **Storage failures:** if storage is blocked (private browsing, for example), the app keeps working without saving.
- **Not built:** relational tables, per-interval records, data export.

---

# 12. Calculation Implementation

## 12.1 Public API (selected)

| Function | Where | Purpose |
|---|---|---|
| `fetchForecast(lat, lon)` | `model/uvSource.ts` | Open-Meteo forecast + CAMS clear sky |
| `fetchSatellite(cell, signal?, pastHours?)`, `mergeSatellite` | `model/satellite.ts` | Satellite lattice, incremental refresh |
| `readUV(query, mode, { forecast, satellite, demoClouds })` | `model/uvSource.ts` | UV at time t → `UVReading` |
| `advance`, `project`, `burnFraction`, `explainRate` | `model/dose.ts` | Dose integration, projection, breakdown |
| `doseBand`, `withSpatial`, `withSkin` | `model/uncertainty.ts` | Measured error band |
| `medPosterior`, `priorPosterior`, `cUserOf` | `model/calibration.ts` | Bayesian MED |
| `timeToBurnNow`, `bandFor`, `cautiousFactor` | `engine/index.ts` | Range and cautious alerts |
| `startSession`, `stepSession`, `changeSettings`, `applySunscreen`, `setStatus` | `engine/index.ts` | Session lifecycle |
| `planDay`, `checkInForDay`, `answerCheckIn`, `calibrate` | `engine/index.ts` | Planner and calibration |
| `weekCompare`, `sunscreenHabit`, `skinLearning` | `engine/index.ts` | Trends |
| `presetMatching`, `activityLabel`, `describeSettings` | `engine/index.ts` | Activity vocabulary |
| `buildDemo(moment)` | `demo/mackenzie.ts` | Demo persona state |

## 12.2 Session Loop

The root layout runs `tick()` every 15 s and whenever the app comes to the foreground:
- it steps the active session from its last update to now (in ≤ 5-min environment steps);
- it checks the cautious alert thresholds;
- it reschedules notifications if the projected times changed;
- it refreshes the forecast and satellite data when they're due.

## 12.3 Calculation Engine Requirements

| ID | Requirement | Status |
|---|---|---|
| CALC-001 | Non-negative finite UV; zero below the horizon | Built |
| CALC-002 | Dose from elapsed time, not timer ticks | Built, tested |
| CALC-003 | No overlapping sessions (half-open intervals) | Built, tested |
| CALC-004 | Pauses stop dose | Built, tested |
| CALC-005 | Settings and sunscreen changes apply from their moment | Built (one known display bug: right after a position change the summary can read 0 until the next update; see §18) |
| CALC-006 | Missing data never becomes zero UV | Built, tested |
| CALC-007 | Ambient, unprotected and protected dose tracked separately; reapplying never reduces dose | Built |
| CALC-008 | Summaries recompute after edits | Built |
| CALC-009 | Full precision internally; round only for display | Built |
| CALC-010 | Store a model version with every session | Built (`MODEL_VERSION`) |
| CALC-011 | Calibration affects future sessions only; past sessions keep their `cUserAtSession` | Built |

---

# 13. Environmental Data Service

## 13.1 Provider Abstraction

The model consumes two shapes, `Forecast` and `SatelliteObs`. Any new provider (for example a GOES service for North America) must produce one of them, and receives only the privacy cell (§17).

## 13.2 Refresh Workflow (`refreshForecast` in the store)

1. Work out the privacy cell for the current place.
2. **Forecast and CAMS:** refetch if more than 30 minutes old or the cell has changed.
3. **Satellite:**
   - **Normal refresh:** if more than 10 minutes old, fetch the last 3 hours and merge.
   - **Full fetch** (50 hours): on first use, or when the cell or slot length changes.
   - **No coverage:** an uncovered cell is rechecked once a day.
4. **Failures:**
   - a forecast failure shows a banner, and the offline estimate is used;
   - a satellite or CAMS failure keeps what's already there and falls back silently.

Nothing is fetched while the demo runs, or for a demo place.

## 13.3 Failure Handling

- **Sessions keep recording time** without data. The dose catches up when data arrives.
- **Never assume UV is zero.**
- **No forecast point** means the offline physics estimate, labelled as such. The session records `usedFallback`, and its page says "Part of it used the offline estimate".
- **Logging after the fact** uses forecast data and is labelled "added later". It's never presented as measured.

## 13.4 Fit and Validation Pipelines (`model-fit/`, offline)

| Script | Output |
|---|---|
| `fetch.ts` + `fit.py` | `cmfParams.ts`, `report.md`: cloud layers fitted to Open-Meteo's UV, used in physics/demo |
| `ground.ts` + `ground_fit.py` | `groundParams.ts`, `ground_report.md`: fitted to ARPANSA radiometers at 8 Australian stations, 2024 |
| `calibration_sim.ts` | `calibration_report.md`: 3,000 virtual users per type, two worlds |

**What the ground fit produces:**
- the CAMS clear-sky scale;
- the satellite exponent and cap;
- the satellite persistence settings (chosen by a safety rule);
- the ground-fitted cloud layers;
- the measured dose error band.

Every fitted score is leave-one-station-out. The raw ground data (~240 MB) is cached locally and gitignored.

---

# 14. Session Management

## 14.1 State Machine

```text
START → ACTIVE ⇄ PAUSED
          │
         END → COMPLETED
```

## 14.2 State Rules (Built, tested)

- **One active session at a time:** a second start does nothing.
- **Paused sessions** don't add dose.
- **Completed sessions** can't resume.
- **Persistence:** timestamps and the full model state (including the sunscreen film and skin wetness) are saved, and restored after a restart.
- **Repeated or out-of-order updates** never double-count dose.
- **Changing activity** during a session keeps the dose so far.

## 14.3 Background Behaviour

- The app doesn't rely on a JavaScript timer while in the background.
- Because the session is stepped from timestamps, reopening the app fills in the elapsed time using the stored forecast and satellite data.
- Alerts are scheduled ahead as local notifications, so they fire even when the app isn't running.
- **Not built:** background location tracking. It would need testing on real devices.

---

# 15. Application Workflows

## 15.1 First-Time User

Welcome → skin → sunscreen → location → alerts → Home. Or "Just looking? Try the demo" at any step.

## 15.2 Starting a Session

Track → pick an activity and shade → Start outdoor session. Recent sunscreen carries in. The dose accumulates from timestamps, and alerts are scheduled from the cautious projection.

## 15.3 Logging Sunscreen

Log sunscreen (Home, Track) → SPF, amount, type, water resistance, when → a new film on the running session → the reminder is rescheduled.

## 15.4 Ending a Session

End → the session is completed and saved → its alerts are cancelled → the morning check-in is scheduled → the session details open.

## 15.5 Morning Check-In

A notification (and a Home banner) at 9:00 the next day → "Any redness?" → the answer updates the posterior → Profile and Trends show the new estimate and range.

---

# 16. UI/UX Design Guidelines

## 16.1 Design Direction

Quick to read outdoors, calm and friendly, with sun and cloud motifs.

**Typography:**
- Bricolage Grotesque for large headings;
- Geneva/system sans for body text;
- uppercase tracked labels for section titles.

**Controls:**
- chips, buttons, dropdowns, banners and tab pills are airy glass capsules (`components/cs/glass.tsx`);
- **one flat, slightly see-through colour per control**, with a hairline border;
- no gradients or sheen;
- a gentle shrink when pressed;
- a selected item is tinted sky glass with bolder text.

**Colour:**
- cream and navy surfaces, sky blue, sun yellow and coral accents, in light and dark modes;
- the "Under this sky" card uses a lighter sky blue.

**Icons:**
- the two-tone sun on the horizon (yellow top, coral lower half);
- the cloud O in the wordmark.

**Writing:**
- plain words;
- no jargon ("offline estimate", not "physics fallback");
- no " · " separators: use a title with a detail line, commas or full sentences.

**Layout:**
- text wraps inside rows on narrow phones;
- short values (doses, percentages) stay on one line;
- long values wrap, aligned right;
- checked at 320, 360 and 375 px wide.

## 16.2 UV Index Categories

| UV Index | Category | Colour |
|---|---|---|
| 0–2 | Low | Green |
| 3–5 | Moderate | Yellow |
| 6–7 | High | Orange |
| 8–10 | Very High | Red |
| 11+ | Extreme | Purple |

These describe instantaneous UV, not a person's accumulated exposure.

## 16.3 Accessibility

- Contrast should meet WCAG AA for text. For example, secondary text on the sky card is 5.3:1.
- Colour never carries meaning alone: categories always have labels, and selected chips also use bold text.
- Charts have text descriptions, and touch targets are at least 38–50 px.
- The demo strip and wordmark have screen-reader labels.

---

# 17. Privacy and Security

## 17.1 Privacy Principles

The app handles location and self-reported skin information, so privacy is built into the architecture.

**Location:**
- **What providers see:** only a fixed 0.1° (~11 km) privacy cell: its centre for the forecast and CAMS, and the same 5×5 lattice around it for satellite.
- **Why fixed cells:** every point in a cell maps to the same centre, so repeated requests can't be averaged back to the user.
- **Stays on the phone:** the exact point (rounded to 0.01°) and its accuracy. They only shape the on-device satellite aggregation and the error band.
- **Coarse locations:** they lean toward the clearer, higher-UV end of the nearby pixels.

## 17.2 Requirements

| ID | Requirement | Status |
|---|---|---|
| SEC-001 | Store data locally by default; no account | Built |
| SEC-002 | HTTPS for all requests | Built |
| SEC-003 | Never store or send precise location beyond what's needed | Built (privacy cell; 0.01° on device) |
| SEC-004 | Minimum permissions (foreground location on request; notifications on request) | Built |
| SEC-005 | Let users delete all data | Built (Delete all data) |
| SEC-006 | No names, emails or birth dates | Built |
| SEC-007 | No advertising or analytics | Built |
| SEC-008 | Secure tokens if accounts are added | Not applicable (no accounts) |
| SEC-009 | Document third-party data sharing (Open-Meteo receives the privacy cell) | Partly built (Profile privacy card; no full policy yet) |
| SEC-010 | A user-facing privacy policy | Not built |

---

# 18. Testing Strategy

Run from `app/`. The model and engine tests run directly on TypeScript with Node's built-in test runner. `tests/support/register.mjs` replaces only the phone-only APIs (notifications, location) and uses the real web storage.

| Layer | Command | What | Count |
|---|---|---|---|
| Unit | `npm run test:unit` | `src/model/model.test.ts`, one test per physical claim: clear sky, clouds, geometry, shade, sunscreen, wet skin, dose, privacy grid, satellite, Bayesian MED, error bands. Plus `tests/unit/`: formatting, location, storage | 47 |
| Integration | `npm run test:integration` | `src/engine/engine.test.ts`: sessions, alerts, ranges, planner, check-ins, trends, demo, activity labels, sun colour. Plus `tests/integration/`: the real store, forecast parsing and failures, boundaries | 53 |
| End-to-end | `npm run test:e2e` | Playwright against the real web app (fixed clock, weather blocked), desktop Chrome and Pixel 7: onboarding, all tabs, a full session, sunscreen across reload, duration inputs, past-session overlap, calendar, demo enter/exit | 8 scenarios × 2 |
| Everything | `npm run test:all` | | |

Typecheck (`npm run typecheck`) and lint (`npm run lint`) must pass.

**Known failing test (left on purpose):** "changing activity mid-session retains accumulated exposure". It catches a real display bug: just after a position change, the session summary reads 0 until the next update (CALC-005). The dose itself isn't lost.

## 18.1 Scientific Validation

Validation is kept separate from code correctness:

| What | How | Where |
|---|---|---|
| Dose arithmetic | unit tests | `model.test.ts` |
| UV sources against real instruments | ARPANSA ground backtest, leave-one-station-out, including real-time latency | `model-fit/ground_report.md` |
| Error band coverage | held-out stations | `ground_report.md` |
| Calibration learning | simulation, two worlds, all skin types | `model-fit/calibration_report.md` |
| Demo realism | every check-in answer checked against the model's dose | `engine.test.ts` |

**Not validated yet:**
- US and European ground stations;
- the sunscreen wear and application assumptions;
- shade values;
- real users' check-ins.

The app must not claim clinical validation.

---

# 19. Performance Requirements

| Item | Target | Status |
|---|---|---|
| Time to burn (one projection per site, three readings) | ≲ 20 ms | Built (~10–17 ms measured) |
| 12 h projection with satellite data | ≲ 10 ms | Built (~5 ms, cached aggregation) |
| Calibration posterior | ≲ 1 ms | Built |
| Network | forecast every 30 min; satellite 3 h every 10 min; nothing in demo | Built |
| Location | read only on request; no polling | Built |
| Offline | history, sunscreen, sessions and the demo all work; missing data is labelled | Built |

---

# 20. MVP Scope

## 20.1 Built

- [x] Onboarding, profile and settings; "Just looking? Try the demo".
- [x] Foreground location and manual cities; privacy cell.
- [x] Current UV, hourly chart, 7-day outlook, planner.
- [x] Satellite clouds, CAMS clear sky and the ground-fitted forecast chain, with fallbacks.
- [x] Manual sessions: start, pause, resume, end; logging after the fact.
- [x] Dose model: geometry, shade, sunscreen film, wet skin, worst site.
- [x] Time to burn as a range; cautious alerts at 50/80/100%.
- [x] One activity picker everywhere; consistent labels.
- [x] Sunscreen logging and reapply reminders.
- [x] Morning check-in; Bayesian calibration.
- [x] History, session details, Trends.
- [x] "Why this number?"
- [x] Demo persona with controls and a scripted nudge.
- [x] Local persistence and delete-all.
- [x] Unit, integration and end-to-end tests.

## 20.2 Not Built / Deferred

- [ ] Satellite for North America (a small GOES service that returns the privacy-cell lattice).
- [ ] Fix the activity-change summary bug (§18).
- [ ] Automatic indoor/outdoor detection; background location.
- [ ] Editing or deleting sunscreen entries; clothing and hats; units.
- [ ] High-UV, long-session and planned-outing notifications.
- [ ] Data export; privacy policy; cloud sync and accounts.
- [ ] Wearables and widgets.
- [ ] A range in the planner.
- [ ] Validation outside Australia; real-user calibration data.

---

# 21. Development Roadmap

| Phase | Status |
|---|---|
| 1. Foundation: Expo, Router, design system, persistence | Done |
| 2. Environmental data: forecast, CAMS, satellite, privacy cell | Done (no North America satellite) |
| 3. Dose engine and sessions | Done |
| 4. Sunscreen and calibration | Done (Bayesian) |
| 5. History, trends, planner | Done |
| 6. Testing and validation | Done for code and Australian ground truth; physical-device and background testing still to do |
| 7. Next | GOES for North America; US ground validation (e.g. the USDA UVMRP network); privacy policy; fix the known summary bug; device testing; a range in the planner |

---

# 22. Future Enhancements

- **Automatic outdoor detection** with confidence scores and user correction.
- **Wearables:** Apple HealthKit, Android Health Connect.
- **Smarter planning:** calendar integration; "leave by" suggestions that keep an outing under 50%.
- **Protection modelling:**
  - clothing (UPF) and hats;
  - measured shade values;
  - more body sites;
  - underwater UV;
  - a salt-water sunscreen wear rate, once same-product evidence exists.
- **Widgets:** current UV, today's dose, the running session, last sunscreen.
- **Education:** UVA/UVB, SED, SPF, clouds and UV, shade, skin health.
- **A moving sun icon** that follows the sun's height, using the existing time-of-day colour helper (`utils/sun-color.ts`).

---

# 23. Risks and Limitations

| Risk | Impact | Mitigation |
|---|---|---|
| No satellite in North America | Forecast clouds only (14% daily dose error instead of 6–7%) | Show the source; GOES service planned |
| All ground validation is Australian | Fitted values may not transfer (aerosol, ozone) | State on the methodology card; validate in the US and Europe |
| Satellite latency (~1 h; MSG ~2 h) | Weaker real-time estimate | Persistence tuned on a live backtest; the band widens |
| Error band too narrow at some stations (up to 20–32% above) | Overconfidence | "Plan on the earlier time"; cautious alerts; documented |
| Skin-type MED is a rough start | Early estimates off for a given person | Bayesian prior with misclassification; wide early ranges; check-ins |
| Calibration checked only on simulated people | Assumptions may be wrong | Shipped settings err safe in the harsher simulated world; collect real data |
| Sunscreen wear and amount assumptions | Effective SPF off | Labelled; unprotected dose always shown |
| Wet-skin evidence from small forearm studies | Size of effect uncertain | Conservative (errs toward more dose); documented |
| Shade values assumed | Shaded dose off | Labelled; reflective-ground warning |
| Users read burn % as a safe limit | False reassurance | Wording rules; ranges; DNA-damage note for V–VI |
| Logging after the fact uses forecast data | Past dose may be off | Labelled "added later" |
| Days 3–7 of the forecast | Poor plans | Marked "(outlook)" |
| The demo uses a TV character's name | Public release | Swap the name in one place |
| Background restrictions | Gaps | Timestamp-based catch-up; alerts scheduled ahead |
| Privacy | Trust | Privacy cell; local-first; no account |

---

# 24. Definition of Done

The MVP is complete when:

1. A user can pick a city or grant location, and providers only ever see the privacy cell. **Done**
2. The app shows UV with its source and freshness in plain words. **Done**
3. A user can start, pause, resume and end a session, or add one afterwards. **Done**
4. Ambient, unprotected and protected dose are computed by `@/model` and tested. **Done**
5. Burn progress and a time-to-burn range are shown with "estimate" wording. **Done**
6. Activity, shade and details change the estimate, the same way on every screen. **Done**
7. Sessions survive restarts. **Done**
8. Missing, clamped and fallback data is communicated. **Done**
9. Users can log sunscreen and see its current effective SPF. **Done**
10. Reapply reminders and cautious 50/80/100% alerts work. **Done** (needs device testing)
11. The morning check-in updates the Bayesian estimate. **Done**
12. The demo works fully offline without touching real data. **Done**
13. The planner suggests lowest-UV windows up to 7 days ahead. **Done**
14. "Why this number?" shows every factor. **Done**
15. History shows daily totals, sessions and trends. **Done**
16. Core flows work on physical iOS and Android devices. **Partly** (Expo Go checks; formal device testing outstanding)
17. Estimates are never presented as medical measurements. **Done**
18. The privacy policy and methodology are accessible in the app. **Partly** (methodology card done; policy not written)
19. The test suite passes. **Partly** (one known failing test, §18)

---

# 25. Using the App (the intended first experience)

1. Open the app: current UV, where it comes from, and **time to burn now** as a range, with the site that burns first.
2. Pick an activity (Walk, Beach, Ski…) and shade, then **Start outdoor session**.
3. Watch burn progress and the range update; get a cautious alert before you get close.
4. Log sunscreen: the projection extends, and the effective SPF fades.
5. End the session; answer tomorrow's check-in; watch your estimate narrow.
6. Forgot to track? Add the time afterwards.
7. Plan tomorrow with the lowest-UV windows.
8. See your trends in History.

For presenting: **"Just looking? Try the demo"** shows Mackenzie's evening in the Adirondacks, fully offline. Use Controls to jump between the dock, the trailhead and the summit.

---

# 26. Project Directory Structure

```text
Cloudscreen/
├── SPECS.md                  this document
├── MODEL_SPEC.md             the model in plain English (formulas, fits, limits)
├── model-fit/                offline fits and validation (§13.4)
│   ├── fetch.ts, fit.py                → app/src/model/cmfParams.ts, report.md
│   ├── ground.ts, ground_fit.py        → app/src/model/groundParams.ts, ground_report.md
│   ├── calibration_sim.ts              → calibration_report.md
│   └── data/                           cached downloads (ground data gitignored)
└── app/                      Expo app
    ├── playwright.config.ts
    ├── tests/                unit, integration, e2e, support (Node stand-ins), RESULTS.md
    └── src/
        ├── app/              screens: (tabs)/ index, track, forecast, history, profile;
        │                     why, sunscreen, add-session, checkin, demo, onboarding, session/[id]
        ├── components/cs/    glass, ui, activity-picker, trends, charts, select,
        │                     wordmark, sun-mark, sun-color, demo-strip
        ├── demo/             mackenzie.ts (persona, built by the engine)
        ├── engine/           index.ts + engine.test.ts (sessions, ranges, trends, …)
        ├── model/            solar, clearSky, cmf, cmfParams (generated), uvSource,
        │                     satellite, groundParams (generated), uncertainty,
        │                     exposure, sunscreen, dose, calibration, model.test.ts
        ├── services/         location, notifications (+ .web stand-in)
        ├── state/            store.ts, storage.ts / storage.web.ts
        ├── hooks/, constants/theme.ts, utils/ (format, sun-color)
```

---

# 27. Final Product Vision

Cloudscreen is a privacy-conscious personal sun journal. It connects the UV that actually reached you (from satellites, forecasts and physics, checked against ground instruments) with your time outside, what you were doing, and your sunscreen.

Its central idea is to turn changing UV, clouds, posture, ground, shade, wet skin and sunscreen wear into a cumulative skin dose in SED. It then compares that dose with a burn threshold that learns your own skin, and is honest about uncertainty: a range, not a false-precision countdown.

Next: satellite coverage and ground validation for North America, real-device testing, and a privacy policy. Later, automatic activity recognition, wearables, and clothing and shade modelling.
