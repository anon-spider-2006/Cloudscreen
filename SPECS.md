# Cloudscreen — Mobile Application Specification

**Project Name:** Cloudscreen  
**Platform:** iOS and Android  
**Application Type:** Mobile health, wellness, and environmental tracking  
**Version:** 1.4  
**Status:** Product specification. The dose model is built and tested in `app/src/model/`; the UI is not built yet.

> The model is the source of truth for every formula and constant in this spec. [MODEL_SPEC.md](MODEL_SPEC.md) gives a plain-English tour of each file. If this spec and the code disagree, fix the spec.

---

# 1. Project Overview

## 1.1 Concept

Cloudscreen is a mobile application that estimates a user's cumulative ultraviolet (UV) radiation exposure and calculates approximate erythemal dose throughout the day using location, UV index, cloud cover, outdoor activity duration, sunscreen application, and individual skin sensitivity.

Unlike conventional weather applications that display only the current UV index, Cloudscreen estimates **cumulative erythemally weighted UV dose**, allowing users to understand how much UV exposure they have accumulated over time.

It goes further than a dose counter. It models the UV that reaches the user's skin given their posture and the ground around them, how much protection their sunscreen still gives as it wears off and breaks down, and how close they are to a sunburn. That burn estimate starts from skin type and is corrected by the user's own next-morning reports.

The application will provide real-time exposure estimates, a projected time until sunburn, personalized notifications, sunscreen reminders, historical trends, and recommendations for reducing excessive UV exposure.

## 1.2 Problem Statement

Most weather applications report UV index as an instantaneous measurement without accounting for:

- How long someone has been outdoors.
- How UV intensity changes throughout the day.
- Their geographic location and local weather conditions.
- Cloud cover and its effect on surface UV radiation.
- Whether sunscreen was applied, when it was applied, and its SPF.
- Their individual susceptibility to sunburn.
- Cumulative UV exposure across multiple outdoor sessions.

Consequently, users may underestimate their total UV exposure, especially during prolonged outdoor activities or when conditions change.

## 1.3 Proposed Solution

Develop a mobile application that continuously or periodically estimates UV exposure by integrating environmental data, outdoor activity tracking, and user-reported sun protection.

The system will calculate an estimated cumulative UV dose, display exposure trends, and provide proactive alerts when predefined exposure thresholds are approached.

The application must clearly distinguish between three quantities (defined in §4.6):

- **Ambient dose:** UV on a flat horizontal surface, the standard UV index × time.
- **Unprotected skin dose:** UV reaching the exposed skin, after posture and ground reflection.
- **Protected skin dose:** the unprotected skin dose divided by the sunscreen's current effective SPF. This drives the burn estimate.

Because sunscreen effectiveness, clothing, shade, and personal susceptibility cannot be measured directly by a phone, all personalized estimates must be presented as approximate rather than clinically validated measurements.

## 1.4 Differentiation

Forecast-only apps such as Sunwise (iOS) turn the UV index and skin type into "minutes left". They assume open sky and bare skin, ignore sunscreen, keep no history, and say they can't account for shade. Cloudscreen gives the same instant answer (§7.2, "Time to burn now"), then goes further on everything such apps leave out:

| | Forecast-only apps | Cloudscreen |
|---|---|---|
| Instant "time to burn" | Yes | Yes, with clouds and your sunscreen |
| Clouds | Assumes clear sky (conservative) | Cloud-adjusted forecast; three-layer cloud model in physics/demo |
| Sunscreen | Not modeled | Effective SPF that wears off and breaks down over time |
| Shade | "Can't know you were under a tree" | One-tap shade levels (§4.5) |
| Body site | Single number | Tracks face/arms and shoulders; shows which burns first |
| Posture, ground, snow, altitude | Not modeled | Modeled |
| History | None | Sessions, plus logging time after the fact |
| Personal threshold | Skin-type table only | Skin-type starting point + morning calibration |
| Planning | Hourly + 7-day UV | Hourly + 7-day UV, plus best-time planner with your own burn estimate |
| Transparency | Explains SED arithmetic | "Why this number?" breakdown on every reading |
| Platforms | iPhone, Apple Watch, widgets | iOS and Android (widgets/Watch deferred, §22.5) |

**Pitch line:** *Forecast apps tell you how long you could last under a clear sky with bare skin. Cloudscreen tracks what actually happened: clouds, shade, your posture, and sunscreen wearing off. Then it learns your skin.*

## 1.5 Target Audience

- Individuals who spend significant time outdoors.
- Runners, hikers, cyclists, and outdoor athletes.
- Beachgoers and travelers.
- Individuals interested in monitoring sun exposure.
- People who want sunscreen application reminders.
- Users with varying degrees of skin sensitivity.

The application is intended for general wellness and sun-safety education, not medical diagnosis or treatment.

# 2. Project Goals

## 2.1 Primary Goals

1. Estimate cumulative erythemally weighted UV dose during outdoor activities.
2. Automatically retrieve location-specific UV and weather conditions.
3. Track outdoor exposure duration through manual and optional automatic methods.
4. Record sunscreen applications and model how their protection fades over time.
5. Estimate progress toward a sunburn and project the time remaining, using a skin-type starting point refined by personal calibration.
6. Provide understandable visualizations of daily UV exposure.
7. Notify users about high UV conditions, burn-progress thresholds, and relevant sun-protection actions.
8. Maintain a historical record of UV exposure and outdoor activity.
9. Work fully offline in a demo mode with user-chosen cloud conditions.

## 2.2 Secondary Goals

1. Provide forecasts of expected exposure during planned activities.
2. Support wearable and fitness-platform integrations.
3. Provide privacy-conscious background location tracking.
4. Offer educational information about UV radiation and sun protection.

## 2.3 We do not

- Diagnose sunburn, skin cancer, or other medical conditions.
- Guarantee that a particular exposure duration is safe.
- Measure actual UV radiation using the phone's camera.
- Measure actual sunscreen coverage. Sunscreen protection is modeled from what the user logs, with stated assumptions.
- Treat a calculated dose threshold as a universally safe daily UV allowance. Staying below the burn estimate does not mean no harm.
- Replace professional medical advice or sun-protection guidelines.

# 3. Core Features

## 3.1 User Onboarding and Profile

### Description

On first launch, users complete a short onboarding flow to configure their exposure tracking preferences.

### Required Inputs

| Field | Type | Description |
|---|---|---|
| Skin type | Enum | Fitzpatrick I–VI, chosen through plain-language burn/tan questions (mapping in §6.1) |
| Typical sunscreen SPF | Integer | Default labelled SPF |
| Sunscreen filter type | Enum | `photostable` (mineral or stabilized) or `chemical` (avobenzone/octinoxate); default `photostable` |
| Sunscreen reminder interval | Integer | User-configurable minutes |
| Location preference | Enum | Automatic or manually selected |
| Notification preferences | Boolean | Enable or disable reminders |
| Measurement units | Enum | Metric or imperial |

### Optional Inputs

- Usual sunscreen amount (light, typical, generous); default typical = 1 mg/cm².
- Default activity preset (§7.3), which sets posture, surface and activity together. Default `walk`.
- Water-resistant sunscreen (yes/no).
- Typical outdoor activity patterns.
- Clothing and shade habits.

### Requirements

- Explain during onboarding that skin type is only a starting point, and that the app learns from next-morning redness check-ins (§6.4).
- Users must be able to skip optional questions.
- Users must be able to edit profile information.
- Location permissions must be requested contextually.
- Users must be able to use manual location selection.

---

## 3.2 Location Tracking

### Description

The application retrieves the user's location to obtain geographically relevant UV and weather conditions.

### Functional Requirements

**LOC-001:** Request foreground location permission when necessary.

**LOC-002:** Retrieve coordinates using device location services.

**LOC-003:** Support manual city or location selection.

**LOC-004:** Associate environmental observations with timestamps and geographic coordinates.

**LOC-005:** Update environmental conditions when the user moves sufficiently far to change the relevant forecast grid.

**LOC-006:** Support background tracking only when explicitly enabled and supported by the operating system.

**LOC-007:** Stop unnecessary location updates when no tracking session is active.

**LOC-008:** Allow the user to pause location collection.

### Implementation Considerations

- Use coarse location when sufficient.
- Avoid continuous GPS polling.
- Prefer significant-location-change events and adaptive sampling.
- Cache recent environmental observations.
- Use the device's timezone for display while storing timestamps in UTC.
- Handle missing location permissions gracefully.

### Privacy

Precise coordinates should remain on the device whenever possible. If coordinates are sent to weather providers, disclose this in the privacy policy.

---

## 3.3 UV Index and Environmental Data

### Description

Retrieve UV index and relevant environmental conditions from a weather or UV data provider.

### Required Data

| Data | Unit | Purpose |
|---|---|---|
| UV index (`uv_index`) | Unitless, hourly | Cloud-adjusted UV used for dose |
| Clear-sky UV index (`uv_index_clear_sky`) | Unitless, hourly | Sanity bound and cloud-effect display |
| Cloud cover, low / mid / high (`cloud_cover_low`, `_mid`, `_high`) | Percent, hourly | Cloud modification factor, split between direct and scattered UV |
| Grid elevation | Meters | Altitude correction in physics mode |
| Timestamp | UTC | Match conditions to exposure intervals |
| Latitude / longitude | Degrees | Location and solar position |

Solar zenith angle and Sun–Earth distance are computed on the device (`solar.ts`, using suncalc) rather than fetched.

The model uses three cloud layers rather than one total cover. The fit (§13.5) shows a weighted RMSE of 0.210 with layers vs 0.252 with a single total-cover number.

### Optional Data (not used by the model yet)

- Ozone column. The model defaults to 300 DU climatology; UVI changes about 4% for every 3% change in ozone.
- Snow cover. The surface is chosen by the user for now.
- Temperature, humidity, air quality.

### Provider

**Open-Meteo** forecast API (`fetchForecast` in `uvSource.ts`): hourly values, `past_days=2` (for logging time after the fact, §4.9), `forecast_days=7` (for the 7-day view and planner, §7.5), timezone GMT. Hours with any missing variable are dropped.

Open-Meteo hourly UV values are **means over the preceding hour**. The model places each value at the middle of that hour (timestamp − 30 min) and interpolates linearly between those midpoints. Before the first or after the last point it holds the nearest value.

The provider must stay replaceable (§13.1).

### UV Source Modes

`readUV` produces UVI(t) in one of three modes:

| Mode | UVI | Clouds | Use |
|---|---|---|---|
| `forecast` (default) | Open-Meteo `uv_index` | Already included by the provider. The fitted cloud factor is computed only for display and for the direct/scattered split | Normal use |
| `physics` | Our Allaart clear-sky UV × our fitted cloud factor | Open-Meteo cloud layers | Cross-check; automatic fallback when no forecast point is available |
| `demo` | Our Allaart clear-sky UV × fitted cloud factor | Chosen by the user with sliders | Fully offline; hackathon demo ("Miami, July, noon") |

If `forecast` is requested but no forecast is available, `readUV` falls back to `physics` and reports `mode: 'physics'`. The UI must show which mode produced the current value.

**Prefer `forecast` mode.** Our clear-sky model and Open-Meteo's clear-sky value disagree a lot at low sun. The median ratio is 1.21 near overhead sun and 0.38 at a zenith angle of 75–85° (§13.5), so `physics` mode reads far lower in the morning and evening.

### Sanity Clamp

A forecast UVI above `1.5 × max(our clear sky, provider clear sky) + 0.5`, or below 0, is treated as bad data. It is clamped into range and the reading is flagged `clamped: true`. Clamped readings must be visibly marked and recorded with the observation.

### Important Modeling Rule

**Do not apply an additional cloud-cover correction when the UV index provided by the data source already represents cloud-adjusted surface UV.**

Cloud cover alone is not a reliable universal UV attenuation factor. Thin clouds can transmit substantial UV, and some cloud configurations can temporarily enhance surface UV.

The model enforces this: in `forecast` mode the cloud factor is never multiplied into UVI. It is applied to UVI only in `physics` and `demo` modes, where the starting value is clear-sky.

The calibrated cloud model is described in §4.4. Values from `physics` and `demo` mode are modeled scenarios and must never be labeled as measured or forecast.

### Requirements

**ENV-001:** Retrieve current or latest available UV conditions.

**ENV-002:** Retrieve hourly UV forecasts.

**ENV-003:** Cache responses to minimize network requests.

**ENV-004:** Display the age of environmental observations.

**ENV-005:** Identify whether UV values are observed, modeled, or forecast.

**ENV-006:** Handle API outages and missing values.

**ENV-007:** Never silently substitute stale data for live measurements.

**ENV-008:** Store provider name, timestamp, UV source mode, clamp flag, and cloud-adjustment status for every observation used in calculations.

**ENV-009:** Never apply the cloud modification factor to a UVI that is already cloud-adjusted.

**ENV-010:** Show the user when a reading was clamped or came from the `physics` fallback.

---

# 4. UV Dose Calculation Engine

This is the central component of the application. It lives in `app/src/model/` as pure TypeScript with no React Native imports, so the same code runs in the app, in Node tests, and in the offline fit pipeline.

## 4.1 Pipeline

```text
 solar.ts       sun position (zenith angle), Sun–Earth distance
     │
     ▼
 clearSky.ts    Step 1  clear-sky UVI          (Allaart / TEMIS 2017)
     │
     ▼
 cmf.ts         Step 2  × cloud modification factor  (physics/demo only)
     │
 uvSource.ts    ── or ── forecast UVI from Open-Meteo (already cloudy)
     │
     ▼
 exposure.ts    Step 3  × geometry factor G     (posture, ground albedo)
     │
     ▼
 sunscreen.ts   Step 4  ÷ effective SPF         (film wear + photodegradation)
     │
     ▼
 dose.ts        Step 5  ∫ dt → SED → burn fraction = dose / (MED_type × c_user)
     │
 calibration.ts         next-morning redness → updates c_user
```

## 4.2 Units

The UV index is proportional to erythemally weighted irradiance:

\[
E_{\mathrm{ery}} = 0.025 \times UVI \quad [\mathrm{W/m^2}]
\]

One Standard Erythema Dose is \(1\ SED = 100\ J/m^2\). For constant UVI on a horizontal surface:

\[
SED = 0.015 \times UVI \times t_{\mathrm{minutes}}
\]

**Example:** 30 minutes at UVI 6 is an **ambient** dose of 0.015 × 6 × 30 = **2.7 SED**. This is the standard horizontal-surface figure, not what any particular patch of skin receives (§4.5).

## 4.3 Step 1 — Clear-Sky UV Index (`clearSky.ts`)

Empirical model from Allaart et al. (2004), *Meteorol. Appl.* 11, 59–65, in the additive form used by the TEMIS operational product:

\[
\mu_0 = \cos(SZA), \qquad \mu_x = \mu_0(1-\varepsilon) + \varepsilon
\]

\[
UVA = (D_0/D)^2 \cdot S \cdot \mu_x \cdot e^{-\tau/\mu_x}
\]

\[
X = 1000\,\mu_0 / TO, \qquad UVW = UVA \cdot (F X^G + H/TO + J)
\]

| Input | Default | Source |
|---|---|---|
| Solar zenith angle (SZA) | computed | suncalc (`solarZenithDeg`) |
| Sun–Earth distance factor \((D_0/D)^2\) | computed | ±3.3% over the year (`sunEarthDistanceFactor`) |
| Total ozone \(TO\) | 300 DU | climatology; ~4% UVI per 3% ozone |
| Altitude | Open-Meteo grid elevation | +5% UVI per km |
| Parameter set | `temis2017` | KNMI/TEMIS v2.0 refit; `allaart2004` (original paper) is kept for comparison |

Published error: ≲10% without snow. Implicit aerosol: AOD(368 nm) ≈ 0.3. Sun at or below the horizon (SZA ≥ 90°) gives 0. Check value: overhead sun at 300 DU gives about 11.8.

## 4.4 Step 2 — Cloud Modification Factor (`cmf.ts`)

Used only in `physics` and `demo` modes (§3.3).

\[
CMF = 1 - \sum_{i \in \{low,\,mid,\,high\}} a_i \, c_i^{\,b_i}, \qquad c_i \in [0, 1]
\]

| Layer | \(a_i\) | \(b_i\) |
|---|---:|---:|
| Low | 0.2239 | 0.8354 |
| Mid | 0.2559 | 0.7839 |
| High | 0.1201 | 1.1622 |

- The parameters are generated by `model-fit/fit.py` into `cmfParams.ts`. **Do not edit them by hand** (§13.5).
- \(\sum a_i\) is constrained to [0.5, 0.6], so full overcast removes 50–60% of UV (Allaart et al. 2004). The shipped fit gives CMF = 0.40 at full overcast.
- Low cloud blocks more than high cloud.
- CMF ≤ 1 by construction, so the brief UV spikes from broken cloud are not represented.

## 4.5 Step 3 — Exposure Geometry (`exposure.ts`)

UVI is defined on a horizontal surface; skin mostly is not. The geometry factor \(G\) converts horizontal UV to UV on the exposed skin:

\[
E_{\mathrm{skin}} = 0.025 \cdot UVI \cdot G
\]

\[
G = \left[f_{dir} R_{dir}(\beta,\theta) + (1-f_{dir})\tfrac{1+\cos\beta}{2} + \rho\,\tfrac{1-\cos\beta}{2}\right] \cdot K_{snow}
\]

- \(\beta\): skin tilt from horizontal, set by posture.
- \(R_{dir}\): how much direct sunlight a tilted surface gets compared with a flat one, averaged over all facing directions (people turn around).
- \(f_{dir} = 0.6\,\mu_0^{0.8} \cdot CMF\): the share of UV arriving as direct sunlight. *Assumption:* clouds remove direct light first.
- \(\rho\): ground UV albedo (how much UV the surface reflects).
- \(K_{snow} = 1 + 0.35\rho\), for snow only: +28% from multiple reflection.

| Posture | Tilt β | Meaning | G at SZA 30°, grass |
|---|---:|---|---:|
| `upright` (default) | 90° | face, arms, torso | ≈ 0.34 |
| `shoulders` | 20° | shoulders, top of head, nose bridge; the first to burn when upright | ≈ 0.95 |
| `lying` | 0° | lying face-up | 1.00 |

| Surface | UV albedo ρ |
|---|---:|
| Grass / soil | 0.02 |
| Pavement / concrete | 0.07 |
| Open water | 0.08 |
| Dry sand | 0.20 |
| Fresh snow | 0.80 |

Albedo matters only for snow, sand and to a lesser degree water. For upright skin, snow gives 2–3× the dose on grass. The UI must not oversell the other surfaces.

**Example:** the same 30 minutes at UVI 6 (SZA 30°) gives an **unprotected skin dose** of about **0.92 SED** upright, compared with 2.7 SED ambient.

### Shade

Shade blocks the direct beam entirely and a share of the scattered sky light. Ground reflection is left unshaded, because the ground around a shaded person is usually still in sun:

\[
G_{shade} = \left[V \cdot (1-f_{dir})\tfrac{1+\cos\beta}{2} + \rho\,\tfrac{1-\cos\beta}{2}\right] \cdot K_{snow}
\]

| Shade (`SHADES`) | Visible sky V | G upright, grass (SZA 30°) | G upright, sand |
|---|---:|---:|---:|
| `none` (default) | 1.0 | 0.34 | 0.43 |
| `umbrella` (umbrella, awning) | 0.5 | 0.13 | 0.22 |
| `dense` (dense trees, covered porch) | 0.3 | 0.08 | 0.17 |

*V values are assumptions, not fitted to data.* The model does reproduce the well-known effect that **an umbrella on sand only halves the dose to upright skin**, because sand reflects UV up from below. The UI should say this when shade is chosen on sand, water or snow.

Shade is a per-interval setting, like posture. Changing it splits the interval.

### Worst Site ("burns first")

Sunburn is local: different body sites get very different doses. The app tracks **two sites in parallel** (`WORST_SITE_POSTURES`):

- **Face/arms:** `upright`.
- **Shoulders, top of head, nose bridge:** `shoulders`.

Both run through `advance()` with the same environment and sunscreen. The UI headlines whichever site has the higher burn fraction.

**Example:** UVI 8, SZA 25°, grass, skin type II, no sunscreen. Shoulders reach 1.0 in about **28 min**; face and arms in about **80 min**. The app shows *"Your shoulders will burn first, in about 28 min."*

When the preset is lying down, only the `lying` site is tracked.

## 4.6 Dose Quantities

| Quantity | Definition | Model field | Primary use |
|---|---|---|---|
| **Ambient dose** | \(\frac{1}{100}\int 0.025\,UVI\,dt\) on a horizontal surface | not stored; equals `ambientSED` when G = 1 | Comparison with standard UV references |
| **Unprotected skin dose** | \(\frac{1}{100}\int 0.025\,UVI\,G\,dt\) | `SessionState.ambientSED` | "What you'd have without sunscreen" |
| **Protected skin dose** | \(\frac{1}{100}\int 0.025\,UVI\,G / SPF_{eff}(t)\,dt\) | `SessionState.doseSED` | Burn fraction (§4.8) |

> **Naming note:** the code field `ambientSED` already includes G, so it is the *unprotected skin* dose, not the ambient dose defined here. It should be renamed (for example `unprotectedSkinSED`), and a true ambient field added if the UI needs one.

The unprotected skin dose must always be shown alongside the protected dose, so a sunscreen-adjusted number never appears alone.

## 4.7 Time Integration (`dose.ts`)

Dose is integrated over time and never computed as one daily UVI × total time:

\[
SED_{\mathrm{total}} = \sum_i \frac{0.025 \cdot UVI_i \cdot G_i \cdot \Delta t_i}{100 \cdot SPF_{eff,i}}
\]

- `advance(state, dtSec, env, settings)` is a pure function. It splits `dtSec` into sub-steps of at most **60 s**. For each sub-step it updates the sunscreen film to the midpoint, evaluates SPF_eff there, adds the dose, then completes the film update. This keeps dose and film degradation coupled.
- Environment (`uvi`, `szaDeg`, `cmf`) is held constant within one `advance` call. Callers must split calls at changes in session state, sunscreen, posture, surface, activity or location.
- Hourly UVI is interpolated linearly between hour midpoints (§3.3).
- `project(state, envAt, settings, profile)` simulates forward in **2-minute** steps over a **12-hour** horizon, sampling every **10 minutes**. It returns `minutesToTarget` (default target: burn fraction 1.0, or `null` if not reached), `fractionAtHorizon`, and a `timeline` of `[time, burn fraction, SPF_eff]`.

### Example (ambient, horizontal)

| Interval | UV Index | Duration | Ambient dose |
|---|---:|---:|---:|
| 11:00–11:20 | 4 | 20 min | 1.20 SED |
| 11:20–11:40 | 6 | 20 min | 1.80 SED |
| 11:40–12:00 | 7 | 20 min | 2.10 SED |
| **Total** | | **60 min** | **5.10 SED** |

## 4.8 Step 5 — Burn Estimate

\[
\text{burn fraction} = \frac{\text{protected skin dose}}{MED_{type} \times c_{user}}
\]

At 1.0 the model estimates just-perceptible redness. \(MED_{type}\) is a skin-type starting point (§6.2), and \(c_{user}\) is the personal calibration multiplier (§6.4, default 1).

**Worked examples** (UVI 8, SZA 25°, upright, grass, skin type II, \(c_{user}\) = 1):

| Protection | Time to burn fraction 1.0 |
|---|---:|
| None | ≈ 80 min |
| SPF 30, 1 mg/cm², photostable, dry | ≈ 204 min |

SPF 30 buys hours, not 30×, because typical application and wear-off reduce its protection (§5.2).

---

## 4.9 Outdoor Exposure Detection

### Manual Tracking

Users can explicitly start, pause, resume, and end an outdoor session.

Manual tracking is the authoritative MVP method for determining outdoor time.

### Logging Time After the Fact

Users can add a session they forgot to track: "I was out 12:00–14:00 at the beach."

- Allowed for any time within the forecast's past window: today and yesterday (`past_days=2`).
- The user picks start, end, location (default: current), activity preset, shade, and any sunscreen applied with its time.
- The app replays the interval through `advance()` using the stored hourly forecast for those hours. This is the same calculation as a live session.
- Retroactive intervals are stored with `exposureState: OUTDOOR_CONFIRMED` (the user confirmed being outside), `calculationStatus: "estimated"`, and the session's `trackingMode: "retroactive"`.
- They count toward daily totals and feed the morning check-in like live sessions.
- They must not overlap an existing session (CALC-003). The UI offers to trim or merge.
- The UI labels them "Added later · from forecast data", because the UV values were forecasts, not measurements (§13.3).

### Automatic Tracking — Future Feature

Optional automatic detection may use:

- GPS and motion patterns.
- User-defined schedules.

Automatic detection must not equate movement with outdoor exposure. A user may be driving, riding public transportation, walking indoors, or sitting beside a window.

### Exposure State

Each interval must have one of the following states:

- `OUTDOOR_CONFIRMED`
- `INDOOR_CONFIRMED`
- `OUTDOOR_INFERRED`
- `UNKNOWN`

Only confirmed outdoor intervals should contribute to the primary MVP exposure total.

Inferred intervals may be displayed separately, with clear uncertainty labeling.

---

# 5. Sunscreen Tracking

## 5.1 Sunscreen Application Logging

Users can log sunscreen application with one tap.

### Data Fields

| Field | Type | Required |
|---|---|---|
| Application timestamp | DateTime | Yes |
| Labelled SPF | Integer | Yes (defaults from profile) |
| Filter type | `photostable` / `chemical` | Yes (defaults from profile) |
| Amount applied | `light` (0.5) / `typical` (1.0) / `generous` (2.0) mg/cm² | Yes (default `typical`) |
| Water resistant | Boolean | Yes (default false) |
| Body area | Enum or list | Optional, not used by the model |
| Reapplication | Boolean | Yes |
| Notes | String | No |

### User Actions

- Apply sunscreen now.
- Record an earlier application.
- Reapply sunscreen.
- Edit or delete an application.
- Set default SPF.
- Configure reminders.

## 5.2 Sunscreen Film Model (`sunscreen.ts`)

SPF is a lab ratio measured at 2 mg/cm² on fresh film. Real-world protection is lower and falls over time. The model represents one application as a **film** whose effective SPF shrinks through an exponent:

\[
SPF_{eff} = SPF_{label}^{\;a_{app} \cdot a_{photo}(D_{inc}) \cdot w(t)}, \qquad SPF_{eff} \ge 1
\]

**Why an exponent:** transmission is \(T = 10^{-A}\) and \(SPF \approx 1/T\). If absorbance falls to a fraction *a* of its starting value, then \(SPF_{eff} = SPF^a\). A 25% absorbance loss takes SPF 15 to about 7.6: a small degradation causes a large loss of protection.

| Factor | What it models | Formula | Basis |
|---|---|---|---|
| \(a_{app}\) | Under-application, amount *m* vs the 2 mg/cm² standard | Geometric mean of the pessimistic \(SPF^{m/2}\) and optimistic \(SPF \cdot m/2\) bounds | **Assumption** (choice of mean) |
| \(a_{photo}\) | UV breaking down the filters, driven by the UV dose that has hit the film (not clock time) | \(a_\infty + (1-a_\infty)e^{-k D_{inc}}\) | Fit to Gonzalez et al. 2007 |
| \(w(t)\) | Rubbing, sweat and water | \(e^{-t_{wear}/\tau}\), τ = 2 h dry (half-life ≈ 1.4 h) | **Assumption** |

| Filter type | \(a_\infty\) | k (per SED) | Meaning |
|---|---:|---:|---|
| `photostable` | 0.95 | 0.05 | Mineral (ZnO/TiO₂) or modern stabilized filters |
| `chemical` | 0.40 | 0.12 | Unstabilized avobenzone + octinoxate, the Gonzalez worst case (reproduces 0.92 at 1.4 SED and 0.63 at 7.3 SED) |

| Activity | Wear-rate multiplier | Water-resistant label |
|---|---:|---|
| `dry` | 1× | 1× |
| `sweating` | 2× | 1.5× |
| `swimming` | 4× | 2.5× |

A water-resistant label halves the *extra* wear from sweat and water.

**Amount defaults:** the model default is **1 mg/cm²** (surveys report people apply 0.5–1.0). At 1 mg/cm², SPF 30 starts at about SPF 9.

**Example:** SPF 30, 1 mg/cm², photostable, dry, upright at UVI 8 for 2 h. Effective SPF falls to about 2.2. The protected skin dose is about 1.2 SED, against 4.5 SED unprotected.

### Implementation Requirements

The application must:

1. Always calculate and show the unprotected skin dose alongside the protected dose.
2. Never present SPF as a multiplier of safe outdoor time.
3. Default to typical (1 mg/cm²) application unless the user says otherwise, never to the lab-test amount.
4. Never assume sunscreen prevents all UV-related harm.
5. Show the current effective SPF and label the model's assumptions (amount, filter type, wear rate).
6. Start a new film on each application or reapplication. Reapplying never lowers the accumulated dose.
7. Treat the wear rule and how amount is handled as assumptions to revisit when validation data is available.

## 5.3 Sunscreen Reapplication Reminders

Default reminder behavior:

- Remind users to reapply according to product directions, commonly every two hours while outdoors.
- Support earlier reminders after swimming, heavy sweating, or towel drying.
- Allow user-configurable reminders.
- Avoid implying that reapplication resets accumulated UV exposure.

### Example Notification

> You've been outdoors for nearly two hours since your last sunscreen application. Consider reapplying according to your sunscreen's instructions.

## 5.4 Protection Events

The application should support logging:

- Sunscreen application.
- Entering shade.
- Putting on protective clothing.
- Wearing a hat.
- Swimming.
- Heavy sweating.
- Towel drying.

How each event affects the model:

| Event | Effect |
|---|---|
| Swimming, heavy sweating | Sets the activity to `swimming` or `sweating`, which speeds sunscreen wear (§5.2) |
| Towel drying | Logged only. *Proposed:* prompt the user to reapply |
| Entered / left shade | Sets `shade` (`umbrella` or `dense`, back to `none` on leaving), which removes direct sun and part of the sky light (§4.5) |
| Clothing, hat | Logged only. Not modeled in the MVP |

None of these events ever changes the ambient dose.

---

# 6. Personalized Exposure Interpretation

## 6.1 Skin Type

Users choose a Fitzpatrick skin type (I–VI) through plain-language questions about how they burn and tan.

| Onboarding answer | Skin type |
|---|---|
| Always burns, never tans | I |
| Burns easily, tans minimally | II |
| Sometimes burns, tans gradually | III |
| Rarely burns, tans well | IV |
| Very rarely burns, tans deeply | V |
| Never burns | VI |
| Not sure | II (cautious default) |

Self-reported skin type is an unreliable guide to UVB sensitivity (Brenner & Hearing 2008). It is used only as the **starting point** for the burn estimate, which calibration then corrects (§6.4).

## 6.2 Minimum Erythema Dose

The Minimum Erythema Dose (MED) is the dose that produces just-perceptible skin redness. The model uses central values by skin type (`MED_SED` in `dose.ts`):

| Skin type | I | II | III | IV | V | VI |
|---|---:|---:|---:|---:|---:|---:|
| MED (SED) | 2.5 | 3 | 4 | 5 | 7 | 10 |

The 4× range from I to VI is consistent with Brenner & Hearing: darker skin needs 3–4× the dose to reach 1 MED, and melanin protects by at most 10–15×.

The personal threshold is \(MED_{type} \times c_{user}\). The app must present it as an estimate that improves with check-ins, never as a clinically measured MED.

**Skin types V and VI** (`DNA_DAMAGE_WARNING_TYPES`): even the darkest skin shows DNA damage at or below 1 MED. For these users the app must say that no visible burn does not mean no damage.

## 6.3 Exposure Indicators

The application shows:

- **UV intensity:** the current UVI and its category (§16.2).
- **Burn progress (headline):** the burn fraction from §4.8, shown as a percentage of the user's *estimated* burn threshold, with the projected minutes remaining from `project()`.
- **Unprotected skin dose:** always shown next to burn progress.
- **Ambient dose:** in SED, for comparison with standard references.
- **Sunscreen status:** time since application and current effective SPF.

Wording rules:

- Call it "estimated burn progress" or "toward your estimated burn threshold". Never "safe limit" or "safe UV allowance".
- Show beside the number that the estimate improves with morning check-ins.
- Falling below 100% must never be shown as a guarantee of safety.

## 6.4 Personal Calibration (`calibration.ts`)

After each outdoor session, the app asks **"Any redness today?"** the next morning, with three answers: `none`, `pink`, `burned`.

**Timing:** 9:00 local time the next day, and at least 12 hours after the session ended (`calibrationPromptTime`). UVB redness appears about 4 hours after exposure and peaks at 8–24 hours, so asking the same evening under-reports.

**Update rule.** Let *F* be the peak burn fraction predicted for the session, using the `c_user` in effect at the time:

| Answer | What it implies | Update |
|---|---|---|
| `pink` | True MED ≈ dose, so \(c_{obs} = c \cdot F\) | Move toward \(c_{obs}\) in log space |
| `burned` | True MED ≈ dose / 2, so \(c_{obs} = c \cdot F / 2\) | Move toward \(c_{obs}\) in log space |
| `none` | True MED > dose | Only informative if F ≥ 1. Then nudge up by \(0.25 \ln(\min(F, 2))\) in log space |

- When the observation is below the current value, the update moves **half** the gap (rate 0.5). When it is above, it moves a **quarter** of the gap (rate 0.25). Burning earlier than predicted moves the estimate decisively; reaching the limit without redness nudges it up.
- Each report changes `c_user` by at most ×2 or ÷2.
- `c_user` is kept within [⅓, 3].
- Redness reported after a predicted fraction below 0.15 is ignored, since it probably has another cause.
- Users can view and reset `c_user` in Profile.

---

# 7. User Interface and Screens

## 7.1 Navigation Structure

The application will have five primary sections:

1. Home
2. Track
3. History
4. Forecast
5. Profile

## 7.2 Home Dashboard

### Purpose

Provide an immediate overview of current UV conditions and accumulated exposure.

### Components

- Current UV index.
- UV risk category.
- Location, weather data timestamp, and UV source mode (forecast, physics or demo).
- **"Time to burn now" card**, shown before any session is started (see below).
- Today's estimated burn progress (% of estimated threshold) and projected minutes remaining.
- Today's unprotected skin dose and ambient dose in SED, with a description of what SED is.
- Total confirmed outdoor time.
- Time since last sunscreen application and current effective SPF.
- Current tracking status.
- Quick sunscreen logging button.
- Start or resume outdoor tracking button.
- Daily UV trend chart.
- "Why this number?" link on the time-to-burn card and the current dose rate (§7.7).

### "Time to burn now"

The app's instant answer, available the moment it opens with no session and no setup beyond skin type.

- Runs `project()` from a fresh `newSession(now)`, using the forecast as `envAt(t)`, the default preset, and today's dose so far added on.
- Shows two numbers:
  - **Unprotected:** no film.
  - **With your sunscreen:** a new film from the profile defaults (SPF, filter, amount).
- Each number is for the worst site (§4.5).
- If the estimate does not reach 100% before sunset, show "Not expected to reach your estimated threshold today" instead of a time. Never say "safe".
- Refreshes when the forecast hour changes, or when the preset or location changes.

```text
┌──────────────────────────────┐
│ TIME TO BURN NOW  (est.)     │
│  Bare skin      ~28 min      │
│  With SPF 30    ~1 h 45 min  │
│  Shoulders burn first · Walk │
│  Why this number? ›          │
└──────────────────────────────┘
```

### Example Layout

```text
┌──────────────────────────────┐
│ CLOUDSCREEN                  │
│ Troy, NY • forecast          │
│                              │
│ CURRENT UV INDEX             │
│          6.2                 │
│          HIGH                │
│                              │
│ EST. BURN PROGRESS           │
│   ███████░░░░░  58%          │
│   ~45 min left at this UV    │
│                              │
│ SKIN DOSE (unprotected)      │
│        2.45 SED              │
│                              │
│ OUTDOOR TIME                 │
│        48 minutes            │
│                              │
│ SUNSCREEN                    │
│ SPF 30 • 10:45 AM • now ~9   │
│                              │
│ [ Log Sunscreen ]            │
│ [ Start Outdoor Session ]    │
│                              │
│ UV TREND                     │
│ ▁▂▄▆█▇▅▃▁                   │
│ 8 AM             6 PM       │
│                              │
│ Home Track History Forecast  │
└──────────────────────────────┘
```

### Functional Requirements

**HOME-001:** Display the latest available UV index.

**HOME-002:** Display today's estimated burn progress, unprotected skin dose and ambient dose from confirmed outdoor intervals.

**HOME-003:** Update active-session dose estimates as time passes.

**HOME-004:** Display sunscreen application history.

**HOME-005:** Provide direct access to session controls.

**HOME-006:** Clearly indicate stale, forecast, clamped, modeled (physics/demo), or unavailable environmental data.

**HOME-007:** Show the pending morning redness check-in when one is due (§6.4).

**HOME-008:** Show "Time to burn now" (unprotected and with default sunscreen) without requiring a session, within 2 seconds of launch when a cached forecast exists.

**HOME-009:** Offer "Add time I was outside" for logging after the fact (§4.9).

---

## 7.3 Active Tracking Screen

### Purpose

Display exposure accumulation during an outdoor session.

### Components

- Active session timer.
- Current UV index.
- Estimated burn progress and projected minutes to burn (`project()`).
- Protected and unprotected session skin dose.
- Current estimated dose rate.
- Projected burn-progress and effective-SPF curve (from the `project()` timeline).
- Sunscreen status: time since application and current effective SPF.
- **Activity preset chips** (`PRESETS`), one tap each:

  | Preset | Posture | Surface | Activity |
  |---|---|---|---|
  | Walk / errands (default) | upright | pavement | dry |
  | Run / cycle | upright | pavement | sweating |
  | Park / picnic | upright | grass | dry |
  | Beach | lying | sand | swimming |
  | Pool / lake | lying | water | swimming |
  | Ski / snow | upright | snow | sweating |

  The individual posture, surface and activity can still be edited under "Customize". Altitude is applied automatically from the forecast elevation, which matters most for Ski.
- **Shade toggle:** open sun, umbrella, or dense shade (§4.5).
- **Worst-site line:** "Shoulders burn first · ~28 min", or both sites side by side when expanded.
- "Why this number?" on the dose rate (§7.7).
- Pause and end controls.
- Log sunscreen action.

### Example

```text
┌──────────────────────────────┐
│ ACTIVE OUTDOOR SESSION       │
│                              │
│         00:42:18             │
│                              │
│ CURRENT UV                   │
│           7.1                │
│                              │
│ EST. BURN PROGRESS           │
│   █████░░░░░░░  41%          │
│   ~70 min to burn            │
│                              │
│ SKIN DOSE                    │
│ 0.40 SED  (1.10 unprotected) │
│                              │
│ SUNSCREEN                    │
│ SPF 50 • 65 min ago • now ~6 │
│                              │
│ Walk • Open sun         [✎]  │
│ Shoulders burn first         │
│                              │
│ [ Log Sunscreen ]            │
│                              │
│ [ Pause ]     [ End ]        │
└──────────────────────────────┘
```

### Behavior

- Session duration advances while tracking is active.
- Dose calculations use timestamped environmental observations.
- Changing preset, posture, surface, activity or shade splits the interval and applies from that moment forward.
- Each site (§4.5) keeps its own `SessionState`. Burn-progress alerts use the worst site.
- Pausing stops dose accumulation.
- Ending a session saves its final intervals and totals.
- Closing or backgrounding the app must not silently end an active session.
- On app restart, reconstruct elapsed session intervals from timestamps and available environmental data.
- Mark reconstructed intervals with insufficient data as uncertain rather than silently filling them with invented values.

---

## 7.4 Exposure History Screen

### Purpose

Allow users to review historical UV exposure.

### Views

- Daily
- Weekly
- Monthly
- Individual session

### Visualizations

- Daily accumulated SED bar chart.
- Outdoor time trend.
- UV exposure by hour.
- Session comparison.
- Sunscreen application timeline.

### Session Details

Each session should display:

- Start and end times.
- Duration.
- Approximate location.
- Ambient, unprotected skin, and protected skin dose (SED).
- Peak estimated burn progress, and the redness check-in answer if given.
- Average and maximum UV index.
- Environmental data quality.
- Sunscreen events.
- Protection events.
- Whether any intervals were inferred or missing.

### Requirements

**HIST-001:** Store completed sessions locally.

**HIST-002:** Aggregate dose by local calendar day.

**HIST-003:** Support sessions crossing midnight and timezones.

**HIST-004:** Allow users to delete sessions.

**HIST-005:** Recalculate historical summaries after edits.

**HIST-006:** Support adding sessions after the fact for today and yesterday (§4.9), visibly labeled as added later from forecast data.

---

## 7.5 UV Forecast Screen

### Purpose

Help users understand anticipated UV intensity and plan outdoor activities.

### Components

- Current UV index.
- Hourly UV forecast for today and tomorrow.
- **7-day forecast:** daily peak UVI and the hours above UVI 3, from `forecast_days=7`.
- UV index peak.
- Cloud-cover forecast.
- Sunrise and sunset where available.
- Planner (below).

### Planner and Best Time

Users enter:

- Day (up to 7 days ahead) and duration.
- Activity preset and shade.
- Planned sunscreen (none, or profile default).
- Location (default: current).

The app runs `project()` from **every 30-minute start time** between sunrise and sunset for that day, using the forecast as `envAt(t)` and the worst site. It shows:

- A strip chart of peak burn progress by start time.
- The **lowest-UV windows**: the start times with the lowest peak burn progress, highlighted.
- For a selected start time: estimated skin dose, ambient dose, peak burn progress, and when the estimate would reach 100%, if it does.

The run must take under 1 second on a phone: about 26 runs of 2-minute steps over the chosen duration.

### Example

A planned 45-minute walk tomorrow may display (illustrative numbers):

> 11:00 → about 70% of your estimated burn threshold · 17:00 → about 15%. Lowest-UV windows: before 09:30 and after 16:30. Forecast uncertainty and shade may change actual exposure.

Wording: say "lowest-UV windows" and "lower estimated exposure". Never "safe times". The application must not represent a lower forecast dose as a guarantee that sun protection is unnecessary.

Forecasts beyond 2 days are less reliable. Mark days 3–7 as "outlook".

---

## 7.6 Profile and Settings

### Sections

**Personal Preferences**
- Skin type.
- Personal calibration (`c_user`), shown as "your threshold is about N× the typical value for your skin type", with a reset button and check-in history.
- Default sunscreen SPF, filter type, amount, water resistance.
- Default activity preset.
- Units.
- Timezone behavior.

**Tracking**
- Manual or automatic tracking.
- UV source mode: forecast (default), physics, or demo with cloud sliders.
- Location permissions.
- Background tracking.
- Sampling preferences.

**Notifications**
- Burn-progress alerts (50%, 80%, 100%).
- Morning redness check-in.
- Sunscreen reminders.
- High UV notifications.
- Active session reminders.

**Privacy**
- Location-data controls.
- Export data.
- Delete data.
- Cloud synchronization preferences.

**About**
- Scientific methodology.
- Data sources.
- Calculation assumptions.
- Limitations and disclaimers.

---

## 7.7 "Why this number?"

A bottom sheet that opens from the time-to-burn card, the dose rate, and any session's details. It shows every factor in the chain for the current reading:

```text
WHY THIS NUMBER?
  Clear-sky UV (sun 28° from overhead)    9.8
  × clouds (low 40%, mid 10%)             0.72    from forecast
  = UV index                              7.1
  × your shoulders, on grass              0.95
  ÷ sunscreen SPF 30, now                 6.1     applied 75 min ago
  = 0.017 SED/min on skin
  Your estimated threshold                3.0 SED  type II × 1.00
  → about 28 min left at this UV
  Assumptions · Model tests · Fit report  ›
```

Data comes from `readUV()` (`uviClearAllaart`, `cmfLayers`, `cmfObserved`, `mode`, `clamped`) and `explainRate()` (`geometry`, `spfEff`, `sedPerMin`, `sedPerMinUnprotected`).

- In `forecast` mode the cloud row shows the provider's implied cloud effect (`cmfObserved`, forecast ÷ clear sky), labeled "from forecast". The fitted factor is not applied (§3.3).
- Every row links to its methodology entry, which says whether the value comes from a study or is an assumption.
- Lines are illustrative above. The real sheet shows live values.

---

# 8. Notification System

## 8.1 Notification Categories

| Notification | Trigger | Priority |
|---|---|---|
| Burn progress 50% / 80% | Burn fraction crosses 0.5 / 0.8 during a session (`ALERT_THRESHOLDS`) | Medium / High |
| Estimated burn threshold reached | Burn fraction crosses 1.0 | High |
| Morning check-in | `calibrationPromptTime(sessionEnd)`: 9:00 the next day, at least 12 h after the session | Low |
| High UV alert | UV index enters high category | Medium |
| Sunscreen reminder | Configured interval elapsed during outdoor session, or effective SPF has fallen sharply | Medium |
| Session reminder | Long-running active session | Low |
| Forecast alert | High UV forecast for a planned session | Low |
| Data unavailable | Environmental updates fail during tracking | Medium |

## 8.2 Notification Requirements

**NOTIF-001:** Request notification permission only when needed.

**NOTIF-002:** Respect user preferences.

**NOTIF-003:** Prevent duplicate reminders.

**NOTIF-004:** Cancel or reschedule reminders when sessions end or sunscreen is reapplied.

**NOTIF-005:** Avoid alarming language. Burn-progress alerts must say "estimated" and never imply that exposure below a threshold is safe.

**NOTIF-006:** Account for platform restrictions on background execution. Burn-progress alerts can be scheduled ahead using `project()`'s `minutesToTarget`, and must be rescheduled whenever inputs change.

**NOTIF-007:** Fire each burn-progress threshold at most once per session.

**NOTIF-008:** Schedule at most one morning check-in per day, covering all of the previous day's sessions.

### Example Burn-Progress Notification

> You're at about 80% of your estimated burn threshold. At the current UV, that's roughly 20 more minutes. Consider shade or reapplying sunscreen.

---

# 9. Technical Architecture

## 9.1 Recommended Technology Stack

| Component | Technology | Status |
|---|---|---|
| Mobile framework | React Native 0.88 with Expo SDK 58 and TypeScript | Installed |
| Navigation | Expo Router | Installed |
| Solar position | suncalc | Installed |
| Dose model | `app/src/model/` (pure TS, imported as `@/model`) | Built and tested |
| UI components | React Native / custom design system | Planned |
| State management | Zustand | Planned |
| Data fetching | TanStack Query | Planned |
| Local database | SQLite (expo-sqlite) | Planned |
| Location | Expo Location | Planned |
| Notifications | Expo Notifications | Planned |
| Secure storage | Expo SecureStore | Planned |
| Charts | React Native SVG-based chart library | Planned |
| Weather integration | Open-Meteo (`fetchForecast`) | Built |
| Model fitting (offline) | Node `fetch.ts` + Python/scipy `fit.py` in `model-fit/` | Built |
| Backend (optional) | FastAPI | Deferred |
| Backend database (optional) | PostgreSQL | Deferred |
| Authentication (optional) | Supabase Auth or equivalent | Deferred |
| Testing | `node --test` for the model; Jest, React Native Testing Library, Maestro for the app | Model tests built |
| CI/CD | GitHub Actions | Planned |

The MVP should be designed as a **local-first application**. A backend is not necessary for basic dose calculations, sunscreen logging, or session history.

A backend can be introduced later for account synchronization, aggregated analytics, and shared settings.

## 9.2 High-Level Architecture

```text
              MOBILE APPLICATION
┌──────────────────────────────────────┐
│                                      │
│           Presentation Layer         │
│                                      │
│  Home  Track  History  Forecast      │
│                                      │
├──────────────────────────────────────┤
│                                      │
│           Application Layer          │
│                                      │
│  Session Manager                     │
│  Notification Manager                │
│  User Preferences                    │
│  History Aggregator                  │
│                                      │
├──────────────────────────────────────┤
│                                      │
│             Domain Layer             │
│                                      │
│  @/model  (app/src/model, built)     │
│   solar · clearSky · cmf · exposure  │
│   sunscreen · dose · calibration     │
│   uvSource                           │
│  Exposure Interval Builder           │
│                                      │
├──────────────────────────────────────┤
│                                      │
│           Infrastructure             │
│                                      │
│  SQLite          Location Services   │
│  Weather API     Notifications       │
│                                      │
└──────────────────────────────────────┘
                 │
                 ▼
          WEATHER / UV API
```

## 9.3 Architectural Principles

1. Keep scientific calculations independent of UI components.
2. Use pure functions for dose calculations.
3. Store timestamps in UTC.
4. Persist sessions and events locally.
5. Keep environmental provider integrations replaceable.
6. Avoid requiring a network connection for historical viewing.
7. Maintain provenance for environmental observations.
8. Separate observed data from assumptions and inferred values.
9. Design background tracking around actual iOS and Android limitations.

---

# 10. Data Models

The following TypeScript interfaces represent the application's stored objects. Where a model type exists (`SkinProfile`, `SunscreenApplication`, `ExposureSettings`, `UVReading`, `CalibrationReport`), the stored object must convert to it without loss. Types prefixed `Stored` are app-side records. Model types are imported from `@/model`.

## 10.1 User Profile

```typescript
import type { SkinType, FilterType, Posture, Surface, Shade, Activity, Preset, UVMode } from "@/model";

interface UserProfile {
  id: string;

  skinType: SkinType;          // 1–6, from onboarding (§6.1)
  cUser: number;               // personal MED multiplier, default 1, bounded [1/3, 3]

  defaultSPF: number;
  defaultFilter: FilterType;   // "photostable" | "chemical"
  defaultAmountMgCm2: number;  // default 1
  defaultWaterResistant: boolean;
  defaultPreset: Preset;       // default "walk"; sets posture, surface, activity
  uvMode: UVMode;              // default "forecast"

  sunscreenReminderMinutes: number;

  automaticTrackingEnabled: boolean;
  notificationsEnabled: boolean;

  createdAt: string;
  updatedAt: string;
}
```

## 10.2 Location Sample

```typescript
interface LocationSample {
  id: string;
  timestamp: string;

  latitude: number;
  longitude: number;

  accuracyMeters?: number;
  source: "gps" | "network" | "manual";
}
```

## 10.3 Environmental Observation

```typescript
interface EnvironmentalObservation {
  id: string;

  timestamp: string;

  latitude: number;
  longitude: number;

  uvIndex: number;              // value used for dose (after clamp)
  uvIndexClearSkyProvider?: number;
  uvIndexClearSkyModel: number; // our Allaart clear-sky UV
  cloudLow: number;             // 0–1
  cloudMid: number;
  cloudHigh: number;
  cmfLayers: number;            // fitted cloud factor

  mode: UVMode;                 // "forecast" | "physics" | "demo"
  clamped: boolean;

  uvIndexType:
    | "cloud_adjusted"
    | "clear_sky"
    | "unknown";

  dataType:
    | "observed"
    | "modeled"
    | "forecast";

  provider: string;
  fetchedAt: string;

  solarZenithDegrees: number;
  elevationMeters?: number;
}
```

## 10.4 Exposure Session

```typescript
interface ExposureSession {
  id: string;

  startTime: string;
  endTime?: string;

  status:
    | "active"
    | "paused"
    | "completed";

  trackingMode:
    | "manual"
    | "retroactive"                  // added after the fact (§4.9)
    | "automatic";

  preset: Preset;                    // preset at session start

  totalOutdoorSeconds: number;
  ambientDoseSED: number;            // horizontal, G = 1
  unprotectedSkinDoseSED: number;    // worst site; model: SessionState.ambientSED
  protectedSkinDoseSED: number;      // worst site; model: SessionState.doseSED
  peakBurnFraction: number;          // worst site; fed to calibration
  worstSite: Posture;                // site that reached the highest fraction
  siteStates: Partial<Record<Posture, SessionState>>; // one per tracked site (§4.5)
  cUserAtSession: number;            // c_user used for this session's prediction
  thresholdsFired: number[];         // e.g. [0.5, 0.8]

  modelVersion: string;              // CALC-010

  createdAt: string;
  updatedAt: string;
}
```

The live model state (`SessionState` = `{ t, doseSED, ambientSED, film }`) is persisted together with the session so `advance()` can resume after a restart.

## 10.5 Exposure Interval

```typescript
interface ExposureInterval {
  id: string;
  sessionId: string;

  startTime: string;
  endTime: string;

  exposureState:
    | "OUTDOOR_CONFIRMED"
    | "INDOOR_CONFIRMED"
    | "OUTDOOR_INFERRED"
    | "UNKNOWN";

  uvIndex: number | null;
  ambientDoseSED: number | null;
  unprotectedSkinDoseSED: number | null;
  protectedSkinDoseSED: number | null;

  // ExposureSettings in effect for the whole interval
  posture: Posture;
  surface: Surface;
  activity: Activity;              // "dry" | "sweating" | "swimming"
  shade: Shade;                    // "none" | "umbrella" | "dense"
  geometryFactor: number | null;
  effectiveSPFStart: number | null;
  effectiveSPFEnd: number | null;

  environmentalObservationId?: string;

  calculationStatus:
    | "calculated"
    | "estimated"
    | "missing_data";
}
```

## 10.6 Sunscreen Application

```typescript
interface StoredSunscreenApplication {
  id: string;

  timestamp: string;               // model: appliedAt (epoch ms)
  spf: number;                     // model: spfLabel
  filter: FilterType;              // model: filter
  amount: "light" | "typical" | "generous";
  mgPerCm2: number;                // 0.5 / 1.0 / 2.0 → model: mgPerCm2
  waterResistant: boolean;         // model: waterResistant

  bodyAreas?: string[];            // not used by the model

  isReapplication: boolean;
  notes?: string;
}

// Conversion to the model type
const toModel = (s: StoredSunscreenApplication): SunscreenApplication => ({
  spfLabel: s.spf,
  filter: s.filter,
  mgPerCm2: s.mgPerCm2,
  waterResistant: s.waterResistant,
  appliedAt: Date.parse(s.timestamp),
});
```

`SunscreenApplication` is the model's type. The stored record is named `StoredSunscreenApplication` so the two don't collide.

## 10.7 Protection Event

```typescript
interface ProtectionEvent {
  id: string;

  timestamp: string;

  type:
    | "entered_shade"
    | "left_shade"
    | "put_on_clothing"
    | "removed_clothing"
    | "swimming"
    | "heavy_sweating"
    | "towel_drying";

  notes?: string;
}
```

## 10.8 Calibration Report

```typescript
interface StoredCalibrationReport {
  id: string;
  date: string;                    // local calendar day the sessions happened
  sessionIds: string[];
  promptedAt: string;              // from calibrationPromptTime()
  answeredAt?: string;

  predictedFraction: number;       // peak burn fraction across those sessions
  redness?: Redness;               // "none" | "pink" | "burned"

  cUserBefore: number;
  cUserAfter?: number;             // updateCUser(cUserBefore, { predictedFraction, redness })
}
```

---

# 11. Database Schema

SQLite will be used for local persistence.

## 11.1 Tables

```sql
CREATE TABLE user_profiles (
    id TEXT PRIMARY KEY,
    skin_type INTEGER NOT NULL CHECK (skin_type BETWEEN 1 AND 6),
    c_user REAL NOT NULL DEFAULT 1,
    default_spf INTEGER NOT NULL,
    default_filter TEXT NOT NULL DEFAULT 'photostable',
    default_amount_mg_cm2 REAL NOT NULL DEFAULT 1,
    default_water_resistant INTEGER NOT NULL DEFAULT 0,
    default_preset TEXT NOT NULL DEFAULT 'walk',
    uv_mode TEXT NOT NULL DEFAULT 'forecast',
    sunscreen_reminder_minutes INTEGER NOT NULL,
    automatic_tracking_enabled INTEGER NOT NULL,
    notifications_enabled INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE exposure_sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT NOT NULL,
    tracking_mode TEXT NOT NULL,
    total_outdoor_seconds INTEGER NOT NULL DEFAULT 0,
    ambient_dose_sed REAL NOT NULL DEFAULT 0,
    unprotected_skin_dose_sed REAL NOT NULL DEFAULT 0,
    protected_skin_dose_sed REAL NOT NULL DEFAULT 0,
    peak_burn_fraction REAL NOT NULL DEFAULT 0,
    preset TEXT NOT NULL,
    worst_site TEXT,
    site_states_json TEXT,
    c_user_at_session REAL NOT NULL,
    thresholds_fired TEXT NOT NULL DEFAULT '[]',
    model_state_json TEXT,
    model_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE environmental_observations (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    uv_index REAL NOT NULL,
    uv_index_clear_sky_provider REAL,
    uv_index_clear_sky_model REAL NOT NULL,
    cloud_low REAL NOT NULL,
    cloud_mid REAL NOT NULL,
    cloud_high REAL NOT NULL,
    cmf_layers REAL NOT NULL,
    mode TEXT NOT NULL,
    clamped INTEGER NOT NULL DEFAULT 0,
    uv_index_type TEXT NOT NULL,
    data_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    solar_zenith_degrees REAL NOT NULL,
    elevation_meters REAL
);

CREATE TABLE exposure_intervals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    exposure_state TEXT NOT NULL,
    uv_index REAL,
    ambient_dose_sed REAL,
    unprotected_skin_dose_sed REAL,
    protected_skin_dose_sed REAL,
    posture TEXT NOT NULL,
    surface TEXT NOT NULL,
    activity TEXT NOT NULL,
    shade TEXT NOT NULL DEFAULT 'none',
    geometry_factor REAL,
    effective_spf_start REAL,
    effective_spf_end REAL,
    environmental_observation_id TEXT,
    calculation_status TEXT NOT NULL,

    FOREIGN KEY (session_id)
        REFERENCES exposure_sessions(id),

    FOREIGN KEY (environmental_observation_id)
        REFERENCES environmental_observations(id)
);

CREATE TABLE sunscreen_applications (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    spf INTEGER NOT NULL,
    filter TEXT NOT NULL,
    amount TEXT NOT NULL,
    mg_per_cm2 REAL NOT NULL,
    water_resistant INTEGER NOT NULL,
    body_areas TEXT,
    is_reapplication INTEGER NOT NULL,
    notes TEXT
);

CREATE TABLE calibration_reports (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    session_ids TEXT NOT NULL,
    prompted_at TEXT NOT NULL,
    answered_at TEXT,
    predicted_fraction REAL NOT NULL,
    redness TEXT,
    c_user_before REAL NOT NULL,
    c_user_after REAL
);

CREATE TABLE protection_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    notes TEXT
);
```

## 11.2 Database Requirements

- Enable foreign key enforcement.
- Index intervals by session and start time.
- Index environmental observations by timestamp and location.
- Index sunscreen applications by timestamp.
- One calibration report per local day (`UNIQUE(date)`).
- Use transactions when saving session intervals and updating totals.
- Support database migrations.
- Avoid duplicating interval records after application restarts.
- Treat stored session totals as cached aggregates that can be rebuilt from intervals.

---

# 12. UV Dose Calculation Implementation

The engine is implemented in `app/src/model/` and re-exported from `index.ts`, so the app imports everything from `@/model`. `model.test.ts` doubles as runnable usage examples.

## 12.1 Public API

| Function | File | Purpose |
|---|---|---|
| `fetchForecast(lat, lon, signal?)` | `uvSource.ts` | Open-Meteo hourly UV, clear-sky UV and cloud layers, plus elevation |
| `readUV(query, mode, { forecast, demoClouds })` | `uvSource.ts` | UVI, SZA and cloud factor right now → `UVReading` (an `Environment` plus mode, clamp flag and diagnostics) |
| `clearSkyUVIAt(date, lat, lon, opts)` | `clearSky.ts` | Allaart clear-sky UVI |
| `cloudModificationFactor(layers)` | `cmf.ts` | Fitted layered cloud factor |
| `geometryFactor({ szaDeg, posture, surface, cmf, shade })` | `exposure.ts` | G |
| `newFilm(app)`, `effectiveSPF(film)` | `sunscreen.ts` | Sunscreen film and its current SPF |
| `newSession(t, film?)` | `dose.ts` | Empty `SessionState` |
| `advance(state, dtSec, env, settings)` | `dose.ts` | Pure step forward in time |
| `burnFraction(state, profile)` | `dose.ts` | Protected dose / (MED_type × c_user) |
| `project(state, envAt, settings, profile, opts)` | `dose.ts` | Minutes to burn, plus a timeline |
| `explainRate(env, settings, film)` | `dose.ts` | Factors behind the dose rate, for "Why this number?" (§7.7) |
| `PRESETS`, `WORST_SITE_POSTURES` | `dose.ts` | Activity presets (§7.3); sites tracked in parallel (§4.5) |
| `SHADES` | `exposure.ts` | Shade levels and visible-sky factors (§4.5) |
| `updateCUser(c, report)`, `calibrationPromptTime(end)` | `calibration.ts` | Personal calibration |

## 12.2 Session Loop

```typescript
import {
  fetchForecast, readUV, newSession, newFilm, advance,
  burnFraction, project, ALERT_THRESHOLDS,
} from "@/model";

const forecast = await fetchForecast(lat, lon);
let state = newSession(Date.now());

// on sunscreen logged:
state = { ...state, film: newFilm(toModel(application)) };

// on each tick, resume, or app foreground — use elapsed wall-clock time, not tick count
function step(now: number) {
  const env = readUV({ t: state.t, lat, lon }, profile.uvMode, { forecast });
  state = advance(state, (now - state.t) / 1000, env, settings);
  const f = burnFraction(state, profile);           // check against ALERT_THRESHOLDS
  const p = project(state, (t) => readUV({ t, lat, lon }, profile.uvMode, { forecast }),
                    settings, profile);              // p.minutesToTarget for the UI and scheduled alerts
}
```

For long gaps (for example after the app was backgrounded), the caller must split the gap so that each `advance` call covers at most one forecast hour. The environment is held constant inside a single call.

## 12.3 Calculation Engine Requirements

**CALC-001:** Use nonnegative finite UV values. The model clamps negative UVI to 0 and returns G = 0 when the sun is below the horizon.

**CALC-002:** Calculate dose using elapsed seconds, not UI timer ticks.

**CALC-003:** Prevent overlapping intervals from double-counting dose.

**CALC-004:** Split intervals at pause and resume boundaries.

**CALC-005:** Split intervals when location, forecast hour, posture, surface, activity, shade, or sunscreen state changes.

**CALC-006:** Keep missing intervals distinct from zero-dose intervals.

**CALC-007:** Track ambient, unprotected skin, and protected skin dose as separate totals. Never subtract one from another, and never reduce accumulated dose on reapplication.

**CALC-008:** Recalculate summaries after session edits.

**CALC-009:** Preserve numerical precision internally and round only for display.

**CALC-010:** Store a model version identifier with every session, covering the Allaart parameter set, the cloud-fit parameters (`CMF_FIT_INFO`), and the MED table, so historical estimates can be reproduced. *The model does not export a `MODEL_VERSION` constant yet; add one.*

**CALC-011:** Calibration may change `c_user` for future sessions only. Past sessions keep the `c_user` they were computed with.

---

# 13. Environmental Data Service

## 13.1 Provider Abstraction

```typescript
interface UVDataProvider {
  getCurrentConditions(
    latitude: number,
    longitude: number
  ): Promise<EnvironmentalObservation>;

  getHourlyForecast(
    latitude: number,
    longitude: number,
    startTime: string,
    endTime: string
  ): Promise<EnvironmentalObservation[]>;
}
```

The weather provider must be interchangeable without modifying the dose calculation engine.

The current implementation is Open-Meteo through `fetchForecast`, which returns a `Forecast` (`{ lat, lon, elevationM, hours: HourlyPoint[], fetchedAt }`). `readUV` consumes it. A future provider adapter must produce the same `Forecast` shape, including clear-sky UV and the three cloud layers, or `physics` mode and the sanity clamp lose their inputs.

## 13.2 Data Retrieval Workflow

```text
1. Get current location
        |
        v
2. Check local weather cache
        |
        v
3. Is cached data sufficiently fresh?
        |
    YES / NO
     |     |
     |     v
     |   Fetch provider data
     |     |
     |     v
     |   Validate and normalize
     |     |
     v     v
4. Select relevant UV observations
        |
        v
5. Construct exposure intervals
        |
        v
6. Calculate ambient SED
        |
        v
7. Persist and update UI
```

## 13.3 API Failure Handling

If the API is unavailable:

- Continue recording outdoor session timestamps.
- Use a sufficiently recent cached observation only under a documented freshness policy.
- Display a warning when UV estimates cannot be updated.
- Preserve intervals requiring later reconstruction.
- Never silently assume UV index is zero.
- Do not claim a later forecast reconstruction is an observed historical measurement.
- `readUV` falls back to `physics` mode (our clear-sky UV × cloud factor) when no forecast point is available. With no cloud data at all it assumes clear sky, which overestimates. That interval must be marked `estimated` and the fallback shown in the UI.

## 13.4 Caching

Suggested initial policies:

- Current conditions: provider-dependent, typically refreshed every 15–30 minutes.
- Hourly forecast: cache according to provider update frequency.
- Location changes: refresh when the current cached forecast is no longer geographically representative.
- Historical data: retain observations used in completed session calculations.

These are initial engineering defaults, not guarantees of environmental accuracy.

## 13.5 Cloud-Factor Fit Pipeline (`model-fit/`, offline)

Not part of the app. Run it when the cloud model or data changes. See `model-fit/README.md`.

1. **`fetch.ts`** downloads 2025 hourly Open-Meteo UV and cloud layers for 12 cities (Cape Town, De Bilt, Denver, London, Miami, Mumbai, Phoenix, Quito, Seattle, Singapore, Sydney, Troy NY) over four 3-week windows (Jan, Apr, Jul, Oct). It runs our `clearSky.ts` on every hour and writes `data/hourly.csv`.
2. **`fit.py`** fits aᵢ and bᵢ with scipy against `uv_index / uv_index_clear_sky`, weighted by clear-sky UVI, using daytime hours with clear-sky UVI ≥ 1. The fit is constrained to Σa ∈ [0.5, 0.6]. It writes:
   - `app/src/model/cmfParams.ts` (generated, shipped)
   - `report.md` (numbers for the presentation)
   - `cmf_fit.png` (figure)

**Current results:** 9,553 points. Weighted RMSE 0.210, leave-one-city-out RMSE 0.207 (worst: London 0.387; best: Phoenix 0.106). R² 0.35. A single total-cover model gives RMSE 0.252.

**Clear-sky cross-check** (median ratio of our Allaart clear-sky UV to Open-Meteo's clear-sky UV):

| SZA | 0–20° | 20–35° | 35–50° | 50–65° | 65–75° | 75–85° |
|---|---:|---:|---:|---:|---:|---:|
| Ratio | 1.21 | 1.10 | 0.88 | 0.62 | 0.45 | 0.38 |

This disagreement is unresolved. It is why `forecast` is the default mode (§3.3) and `physics` is a cross-check.

---

# 14. Session Management

## 14.1 Session State Machine

```text
           START
             |
             v
          ACTIVE
          /    \
         /      \
      PAUSE     END
        |        |
        v        v
      PAUSED  COMPLETED
        |
      RESUME
        |
        v
      ACTIVE
```

## 14.2 State Rules

- Only one active session is allowed at a time.
- A paused session does not accumulate dose.
- A completed session cannot resume without an explicit new session or edit workflow.
- Session start and end timestamps must be persisted.
- Application restarts must restore the previous state.
- Device clock changes must not produce negative durations.
- Intervals must be nonoverlapping and chronologically ordered.

## 14.3 Background Behavior

iOS and Android impose restrictions on background execution.

The application must not rely on a continuously running JavaScript timer while backgrounded.

Instead:

1. Persist timestamps, session state, and the model `SessionState` (including the sunscreen film).
2. Use supported background location capabilities only when permitted.
3. Reconstruct elapsed intervals when the app resumes.
4. Use cached forecasts or historical observations where available.
5. Flag periods with insufficient environmental information.

Background tracking requires testing on physical iOS and Android devices, including permission changes, process termination, and battery-saving modes.

---

# 15. Application Workflows

## 15.1 First-Time User

```text
Install App
    |
    v
Welcome / Explanation
    |
    v
Configure Preferences
    |
    v
Choose Location Mode
    |
    v
Configure Notifications
    |
    v
Home Dashboard
```

## 15.2 Starting an Outdoor Session

```text
Tap Start
    |
    v
Create Session
    |
    v
Get Location
    |
    v
Fetch UV Data
    |
    v
Begin Tracking
    |
    v
Accumulate Dose
    |
    v
Update Dashboard
```

## 15.3 Logging Sunscreen

```text
Tap Log Sunscreen
    |
    v
Choose SPF, filter type, amount, water resistance
(prefilled from profile)
    |
    v
Confirm Application Time
    |
    v
Start new film (newFilm)
    |
    v
Save Application
    |
    v
Update Sunscreen Status
    |
    v
Reschedule Reminder
```

## 15.4 Ending a Session

```text
Tap End
    |
    v
Finalize Intervals
    |
    v
Calculate Session Totals
    |
    v
Persist Session
    |
    v
Cancel Session Reminders
    |
    v
Schedule Morning Check-In (calibrationPromptTime)
    |
    v
Display Session Summary
```

## 15.5 Morning Check-In

```text
Notification at 9:00 next day
    |
    v
"Any redness today?"  none / pink / burned
    |
    v
updateCUser(c_user, { predictedFraction, redness })
    |
    v
Save report, update profile c_user
    |
    v
Show "your threshold estimate changed from X to Y"
```

---

# 16. UI/UX Design Guidelines

## 16.1 Design Direction

The interface should be optimized for quick interactions outdoors, yet be playful and use cloud/sun motifs throughout the UI.

### Visual Characteristics

- Large, readable UV index values.
- High-contrast text.
- Clear dose and duration labels.
- Simple charts.
- Minimal navigation depth.
- Large touch targets.
- Accessible light and dark themes.
- Distinct visual indicators for current, forecast, and missing data.
- Blue and yellow color scheme with lighter shades for light mode and darker shades for dark mode

## 16.2 UV Index Categories

Use standard public-health UV index categories:

| UV Index | Category | Suggested Color |
|---|---|---|
| 0–2 | Low | Green |
| 3–5 | Moderate | Yellow |
| 6–7 | High | Orange |
| 8–10 | Very High | Red |
| 11+ | Extreme | Purple |

These colors describe instantaneous UV intensity, not a person's accumulated exposure or individual medical risk.

## 16.3 Accessibility

- Ensure sufficient contrast.
- Never rely on color alone to communicate risk.
- Provide text descriptions of charts.
- Use large touch targets.
- Support one-handed operation.

---

# 17. Privacy and Security

## 17.1 Privacy Principles

The application processes potentially sensitive information, including location history and self-reported skin characteristics.

Privacy must be considered during initial architecture rather than added later.

## 17.2 Requirements

**SEC-001:** Store user data locally by default.

**SEC-002:** Use HTTPS for all external API requests.

**SEC-003:** Avoid unnecessary precise location storage.

**SEC-004:** Request minimum necessary permissions.

**SEC-005:** Allow users to delete historical records.

**SEC-006:** Avoid collecting names, emails, or birth dates for basic functionality.

**SEC-007:** Do not share personal exposure history with advertising services.

**SEC-008:** Store authentication tokens securely if accounts are introduced.

**SEC-009:** Clearly document third-party weather API data sharing.

**SEC-010:** Provide a user-facing privacy policy.

# 18. Testing Strategy

## 18.1 Unit Tests

### Model Tests (built: `app/src/model/model.test.ts`)

Run from `app/` with `npm run test:model` (`node --test`; Node ≥ 23.6 runs TypeScript directly). Each test checks one physical claim; all 19 pass.

| Area | Claim checked |
|---|---|
| Clear sky | Overhead sun at 300 DU ≈ 11.8 (TEMIS 2017) and ≈ 11.4 (2004); De Bilt midsummer ≈ 7.1; ≈ 4% UVI per 3% ozone; +5%/km altitude; ±3.3% distance factor; 0 below horizon |
| Solar | Miami solar noon in July, SZA ≈ 4° |
| Cloud factor | Clear = 1; full overcast 0.40–0.50; Σa ∈ [0.5, 0.6]; decreasing as cover rises; low cloud blocks more than high |
| Geometry | Upright at SZA 30° in 0.30–0.45; lying = 1; snow 2–3× grass for upright skin; snow lying = 1.28 |
| Sunscreen | SPF 15^0.75 ≈ 7.6; Gonzalez photodegradation reproduced; under-application between the bounds; wear τ = 2 h; swimming wears faster |
| Dose | 1 h at UVI 8, lying, unprotected = 7.2 SED; type II at UVI 10 reaches 1 MED in ≈ 20 min; SPF 30 extends this by hours, not 30× |
| Calibration | Pink lowers c, burned lowers it more; no redness at F ≥ 1 nudges up; trivial doses are ignored; bounded at ⅓; prompt at 9:00 next day |
| UV source | Demo = physics; forecast not multiplied by the cloud factor again; sanity clamp; physics fallback without a forecast |
| Shade | Blocks the direct beam and part of the sky; less effective on sand because ground reflection is unshaded; passed through `advance()` |
| Worst site | Shoulders reach the threshold in under half the time of face/arms at high sun |
| Breakdown and presets | `explainRate` factors multiply to the `advance()` dose rate; every preset is a valid setting |

### Ambient Dose Conversion (posture `lying`, G = 1, no sunscreen)

| Test | Input | Expected |
|---|---|---|
| Zero UV | UVI 0, 60 min | 0 SED |
| Low UV | UVI 2, 30 min | 0.9 SED |
| High UV | UVI 8, 60 min | 7.2 SED |
| Short interval | UVI 10, 1 min | 0.15 SED |
| Zero duration | UVI 6, 0 min | 0 SED |
| Negative UV | UVI −1 | Treated as 0 (model clamps) |
| Negative duration | −60 seconds | No change (model clamps `dtSec` to ≥ 0) |

*Proposed additional model tests:* the planner's best start time falls away from solar noon; replaying a past interval gives the same dose as a live session over it; `project()` respects horizon and target; `readUV` interpolates between hour midpoints; `advance` with a long `dtSec` matches many short steps.

### Session Logic

- Starting a session creates a record.
- Pausing stops accumulation.
- Resuming continues accumulation.
- Ending finalizes the session.
- Duplicate start actions do not create overlapping active sessions.
- Restarting the app restores session state.
- Intervals crossing midnight are assigned correctly.
- Missing UV observations are not interpreted as zero.

### Sunscreen Logic

- Application events save correct timestamps.
- Reapplication updates reminder scheduling.
- Editing an application updates the displayed timeline.
- Sunscreen events do not erase ambient exposure.
- A reminder is not duplicated after an application restart.

## 18.2 Integration Tests

- Location service to weather API.
- Weather API to normalization layer.
- Environmental observations to calculation engine.
- Session manager to SQLite.
- Sunscreen logging to notifications.
- Session completion to history.
- Permission revocation while tracking.

## 18.3 End-to-End Tests

**Scenario A:** User starts a 30-minute outdoor session, logs sunscreen, pauses, resumes, and ends tracking.

**Scenario B:** User denies location permission and tracks using a manually selected city.

**Scenario C:** Weather API becomes unavailable during an active session.

**Scenario D:** User closes and reopens the app during a session.

**Scenario E:** User reviews historical exposure across multiple days.

**Scenario F:** A session crosses midnight or a daylight-saving-time transition.

## 18.4 Scientific Validation

The calculation engine must be tested independently against known UV index-to-SED conversions.

Environmental accuracy must be evaluated separately from mathematical correctness.

Validation should distinguish:

1. Correctness of UV index-to-dose conversion.
2. Accuracy of the environmental provider's UV estimates.
3. Accuracy of our clear-sky and cloud models. The current fit target is Open-Meteo model output; the next step is ground radiometers (EPA/NOAA UV network).
4. Accuracy of inferred outdoor time.
5. Uncertainty introduced by shade, clothing, and the geometry factor.
6. Uncertainty of the sunscreen film model, especially the assumed wear rate and the handling of application amount.
7. Whether calibration converges, using check-in data from real users.

The application must not claim clinically validated personal UV exposure without supporting evidence.

---

# 19. Performance Requirements

## 19.1 Responsiveness

- Home screen should display cached data promptly.
- Session controls should respond immediately.
- Dose calculations should not block UI rendering.
- History charts should support efficient aggregation.

## 19.2 Battery Efficiency

- Avoid unnecessary GPS polling.
- Avoid excessive API requests.
- Calculate dose from timestamps rather than high-frequency timers.
- Batch database writes where appropriate.
- Use platform-supported background services.
- Measure battery impact on physical devices.

## 19.3 Offline Behavior

The application must support:

- Viewing historical sessions.
- Logging sunscreen.
- Starting and stopping manual sessions.
- Recording timestamps.
- Using cached UV forecasts where appropriate.

If environmental data is unavailable, the application must clearly identify incomplete dose estimates.

---

# 20. MVP Scope

## 20.1 Required MVP Features

- [ ] Onboarding and user preferences.
- [ ] Automatic foreground location retrieval.
- [ ] Manual location selection.
- [ ] Current UV index display.
- [ ] Hourly UV forecast and 7-day outlook.
- [ ] Planner with lowest-UV windows (§7.5).
- [ ] Cloud-cover display.
- [ ] Manual outdoor session tracking.
- [ ] Session pause, resume, and end.
- [x] Dose model: clear sky, cloud factor, geometry, sunscreen film, dose, burn fraction (`app/src/model/`).
- [x] Open-Meteo forecast client and UV source modes.
- [x] Personal calibration logic.
- [ ] Dose, burn progress and minutes-to-burn wired into the UI.
- [ ] "Time to burn now" card on Home, no session needed (§7.2).
- [ ] Activity preset chips, plus custom posture/surface/activity (§7.3).
- [ ] Shade toggle (§4.5; model built).
- [ ] Worst-site tracking and "burns first" display (§4.5).
- [ ] Logging time after the fact (§4.9).
- [ ] "Why this number?" sheet (§7.7; `explainRate` built).
- [ ] Demo mode with cloud sliders.
- [ ] Burn-progress notifications (50/80/100%).
- [ ] Morning redness check-in.
- [ ] Sunscreen application logging (SPF, filter, amount, water resistance).
- [ ] Sunscreen reminders.
- [ ] Local SQLite persistence.
- [ ] Daily exposure summary.
- [ ] Session history.
- [ ] Basic UV trend charts.
- [ ] Error handling for missing environmental data.
- [ ] Privacy settings and local data deletion.
- [ ] Scientific methodology and limitations page.

## 20.2 Features Deferred Beyond MVP

- [ ] Automatic indoor/outdoor detection.
- [ ] Advanced background tracking.
- [ ] Wearable integration.
- [ ] Cloud synchronization.
- [ ] User accounts.
- [ ] Validating the sunscreen and calibration models against real data.
- [ ] Ozone column from a data source (currently 300 DU climatology).
- [ ] Smartwatch companion app.
- [ ] Detailed clothing and shade models.
- [ ] Historical data export.
- [ ] Multi-device synchronization.

---

# 21. Development Roadmap

## Phase 1 — Project Foundation

**Objective:** Establish the mobile application architecture.

### Tasks

- Initialize Expo and TypeScript project.
- Configure Expo Router.
- Set up navigation.
- Implement design tokens and reusable components.
- Configure SQLite.
- Define domain models.
- Create initial database migrations.
- Implement settings persistence.

### Deliverable

A functioning mobile app shell with navigation and local persistence.

## Phase 2 — Environmental Data Integration

**Objective:** Retrieve and display location-specific UV information.

### Tasks

- Implement location permissions.
- Add manual location selection.
- Integrate weather provider.
- Normalize environmental observations.
- Add caching and error handling.
- Display UV index and hourly forecast.
- Show data freshness and source.

### Deliverable

A working UV dashboard with live or forecast environmental data.

## Phase 3 — UV Dose Engine

**Objective:** Implement scientifically grounded dose and burn estimates.

### Tasks

- [x] Clear-sky UV, cloud factor fit, geometry, sunscreen film, dose integration, burn fraction, projection, calibration (`app/src/model/`).
- [x] Model unit tests.
- [ ] Add a `MODEL_VERSION` export; rename `SessionState.ambientSED` → `unprotectedSkinSED`.
- [ ] Implement the session state machine around `advance()`.
- [ ] Add pause, resume, and end controls.
- [ ] Persist exposure intervals and `SessionState`.
- [ ] Handle missing environmental data.

### Deliverable

An outdoor session tracker that shows estimated burn progress, minutes to burn, and skin and ambient SED.

## Phase 4 — Sunscreen Tracking

**Objective:** Add sun-protection logging and reminders.

### Tasks

- Create sunscreen application interface (SPF, filter, amount, water resistance).
- Store application events and start a new film on each.
- Implement default sunscreen preferences.
- Show current effective SPF.
- Add reapplication reminders.
- Add the morning redness check-in and `c_user` update.
- Display sunscreen history.
- Add reminder configuration.

### Deliverable

A functional sunscreen tracking system integrated with outdoor sessions.

## Phase 5 — History and Visualization

**Objective:** Provide meaningful exposure analytics.

### Tasks

- Build daily summary screen.
- Build session detail screen.
- Add UV exposure charts.
- Aggregate daily and weekly SED.
- Display sunscreen events alongside exposure.
- Support session deletion and recalculation.

### Deliverable

A complete exposure history and analytics interface.

## Phase 6 — Testing and Release Preparation

**Objective:** Prepare a stable MVP.

### Tasks

- Complete unit and integration tests.
- Validate scientific calculations.
- Test location and notification permissions.
- Test background and restart behavior.
- Optimize battery consumption.
- Perform accessibility review.
- Write privacy policy.
- Complete beta testing on physical devices.

### Deliverable

An MVP ready for beta distribution on iOS and Android.

---

# 22. Future Enhancements

## 22.1 Automatic Outdoor Detection

Use sensor fusion and activity recognition to estimate whether a user is outdoors.

This feature should produce confidence scores and permit user corrections.

## 22.2 Wearable Integration

Integrate with supported fitness platforms and wearable devices to import outdoor activity intervals.

Potential sources include Apple HealthKit and Android Health Connect, subject to platform permissions and available data.

## 22.3 Smart Exposure Forecasting

The planner and lowest-UV windows are now in the MVP (§7.5). Later additions:

- Calendar integration: flag outdoor events with high estimated exposure.
- "Leave by" suggestions: start times that keep a planned activity under 50% of the estimated threshold.

## 22.4 Advanced Protection Modeling

Already in the model: application amount, reapplication, water and sweat wear, body orientation (posture), worst-site tracking, shade, reflective surfaces, photodegradation.

Still to explore:

- Clothing coverage (UPF).
- Better shade values: measure visible-sky factors for real shade types instead of the assumed 0.5 / 0.3.
- Sites beyond face/arms and shoulders (back when lying face-down, legs).
- Per-body-site doses (track face, shoulders and arms separately rather than one posture).
- Ozone from a data source instead of climatology.
- Broken-cloud UV enhancement.

Any protection model should have documented assumptions, uncertainty estimates, and validation evidence before influencing user-facing risk interpretation.

## 22.5 Home Screen Widgets

Provide quick access to:

- Current UV index.
- Today's ambient SED.
- Active tracking status.
- Last sunscreen application.

## 22.6 Educational Features

Include explanations of:

- UVA and UVB radiation.
- UV index categories.
- Erythemal dose and SED.
- Sunscreen SPF.
- Cloud cover and UV.
- Shade and protective clothing.
- UV exposure and skin health.

---

# 23. Risks and Limitations

| Risk | Impact | Mitigation |
|---|---|---|
| UV forecast inaccuracies | Incorrect dose estimates | Show source, age, and uncertainty |
| Cloud cover modeling errors | Over- or underestimation | Prefer cloud-adjusted forecast UV; cloud factor used only in physics/demo |
| Cloud fit trained on model output | Errors in the fit target carry into our cloud factor | State this on the methodology page; refit against ground radiometers |
| Clear-sky model disagreement at low sun (ratio down to 0.38) | Physics mode underestimates mornings and evenings | `forecast` is the default; show the mode |
| Broken-cloud enhancement not modeled (CMF ≤ 1) | Brief underestimates on partly cloudy days | Document as a limitation |
| Sunscreen wear and amount assumptions | Effective SPF may be too high or too low | Label as assumptions; always show unprotected dose |
| Skin-type MED is a rough starting point | Early burn estimates may be wrong for a given user | Cautious "not sure" default; morning calibration; clear "estimate" wording |
| Users read burn % as a safe limit | False reassurance | Wording rules (§6.3); DNA-damage note for types V–VI |
| Wrong posture or surface chosen | Dose off by up to 3× | Activity presets; worst-site display; one-tap changes on the Track screen |
| Shade visible-sky factors are assumed | Shaded dose may be too high or too low | Label as an assumption; warn that shade on sand, water or snow protects less |
| Retroactive sessions use forecast, not observed, UV | Past dose may be off | Label "Added later · from forecast data"; mark intervals `estimated` |
| 7-day outlook is uncertain beyond 2 days | Plans based on poor forecasts | Mark days 3–7 as "outlook"; rerun the planner as the day nears |
| Indoor/outdoor ambiguity | Incorrect exposure duration | Manual tracking for MVP |
| Sunscreen effectiveness variability | Misleading protected-dose estimates | Keep ambient dose primary |
| GPS battery consumption | Poor user experience | Adaptive location sampling |
| Background execution restrictions | Tracking gaps | Timestamp-based recovery |
| Missing internet connectivity | Incomplete environmental data | Cache and flag missing intervals |
| User forgets to track | Incomplete daily history | Clearly label recorded exposure |
| Privacy concerns | Reduced trust | Local-first storage and data minimization |

---

# 24. Definition of Done

The MVP is complete when:

1. A user can select a location or grant foreground location access.
2. The application retrieves and displays relevant UV data, with its source mode and freshness.
3. A user can start, pause, resume, and end an outdoor session.
4. The application computes ambient, unprotected skin, and protected skin dose in SED using `@/model`, and the model tests pass.
5. The application shows estimated burn progress and projected minutes to burn, with "estimate" wording.
6. A user can set posture, surface and activity, and the dose updates accordingly.
7. Sessions, including sunscreen film state, persist across ordinary app restarts.
8. Missing, clamped, or fallback environmental data is clearly communicated.
9. Users can log sunscreen applications and see the current effective SPF.
10. Users receive configurable sunscreen reminders and burn-progress alerts at 50%, 80% and 100%.
11. Users receive a morning redness check-in, and their answer updates `c_user`.
12. Demo mode works fully offline.
13. Home shows "Time to burn now" without a session, and the planner suggests lowest-UV windows up to 7 days ahead.
14. Shade, presets and worst-site display change the estimates, and "Why this number?" shows every factor.
15. A user can add a session they forgot to track for today or yesterday.
16. Users can view daily totals and completed sessions.
17. Core flows work on physical iOS and Android devices.
18. The application clearly communicates that estimates are not medical measurements.
19. The privacy policy and scientific methodology (including model assumptions and limitations) are accessible within the app.

---

# 25. Recommended Initial Implementation

The most practical first version is a **manual outdoor-session tracker that uses the built model to show live burn progress**.

The initial user experience should be:

1. Open the app and see the current UV index and **time to burn now**: bare skin vs with your sunscreen, worst site first.
2. Pick a preset (Walk, Beach, Ski…) and tap **Start Outdoor Session**.
3. Watch estimated burn progress and minutes to burn update over time.
4. Log sunscreen with one tap and see the projection extend, and the effective SPF fade.
5. Receive burn-progress and sunscreen reminders.
6. End the session and review the dose.
7. Answer the next-morning redness check-in.
8. Forgot to track? Add the time afterwards.
9. Plan tomorrow with the planner's lowest-UV windows.
10. View daily and historical exposure trends.

For the hackathon demo, run the same flow in **demo mode** with cloud sliders, so it works offline and conditions can be chosen ("Miami, July, noon").

The physics is already built and tested. The remaining work is the UI, persistence and notifications around it.

---

# 26. Project Directory Structure

Current layout. Items marked *(planned)* do not exist yet.

```text
Cloudscreen/
├── SPECS.md                 this document
├── MODEL_SPEC.md            plain-English tour of the model
├── model-fit/               offline cloud-factor fit (§13.5)
│   ├── fetch.ts             Open-Meteo download + clear-sky → data/hourly.csv
│   ├── fit.py               scipy fit → cmfParams.ts, report.md, cmf_fit.png
│   ├── report.md
│   └── data/hourly.csv
└── app/                     Expo app
    ├── app.json
    ├── package.json         npm run test:model
    └── src/
        ├── app/             Expo Router screens (currently the Expo template)
        │   ├── _layout.tsx
        │   ├── index.tsx            → Home        (planned)
        │   ├── track.tsx            (planned)
        │   ├── history.tsx          (planned)
        │   ├── forecast.tsx         (planned)
        │   ├── profile.tsx          (planned)
        │   ├── onboarding/          (planned)
        │   └── session/[id].tsx     (planned)
        ├── model/           dose engine, imported as @/model (built)
        │   ├── solar.ts  clearSky.ts  cmf.ts  cmfParams.ts (generated)
        │   ├── exposure.ts  sunscreen.ts  dose.ts  calibration.ts
        │   ├── uvSource.ts  index.ts
        │   └── model.test.ts
        ├── components/      (template components; UV cards and charts planned)
        ├── hooks/
        ├── constants/theme.ts
        ├── services/        location, notifications   (planned)
        ├── database/        SQLite, migrations, repositories (planned)
        └── store/           Zustand session + preferences (planned)
```

---

# 27. Final Product Vision

Cloudscreen should evolve from a simple UV index viewer into a privacy-conscious personal exposure journal that connects environmental UV conditions, time outdoors, and sun-protection behavior.

Its central differentiator is turning changing UV intensity, cloud, posture, ground and sunscreen wear into a cumulative skin dose in **Standard Erythema Doses (SED)**, and comparing that dose to a burn threshold that learns from the user's own skin.

The app should prioritize understandable information, accurate calculations, transparent uncertainty, and practical sun-protection reminders rather than presenting estimated values as precise medical predictions.

The first release should establish a reliable foundation for outdoor tracking, environmental data integration, sunscreen logging, and exposure history. Future releases can expand into automatic activity recognition, wearables, clothing and shade modeling, and validation against ground measurements.