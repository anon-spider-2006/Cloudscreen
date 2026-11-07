# UV Dose Tracker — Mobile Application Specification

**Project Name:** UV Dose Tracker  
**Platform:** iOS and Android  
**Application Type:** Mobile health, wellness, and environmental tracking  
**Version:** 1.0 — MVP and Future Roadmap  
**Status:** Product and Technical Specification

---

# 1. Project Overview

## 1.1 Concept

UV Dose Tracker is a mobile application that estimates a user's cumulative ultraviolet (UV) radiation exposure throughout the day using location, UV index, cloud cover, outdoor activity duration, sunscreen application, and individual skin sensitivity.

Unlike conventional weather applications that display only the current UV index, UV Dose Tracker estimates **cumulative erythemally weighted UV dose**, allowing users to understand how much UV exposure they have accumulated over time.

The application will provide real-time exposure estimates, personalized notifications, sunscreen reminders, historical trends, and recommendations for reducing excessive UV exposure.

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

The application must clearly distinguish between **ambient UV dose** and **modeled skin-effective UV dose**. Because sunscreen effectiveness, clothing, shade, and personal susceptibility cannot be measured directly by a phone, all personalized estimates must be presented as approximate rather than clinically validated measurements.

## 1.4 Target Audience

- Individuals who spend significant time outdoors.
- Runners, hikers, cyclists, and outdoor athletes.
- Beachgoers and travelers.
- Individuals interested in monitoring sun exposure.
- People who want sunscreen application reminders.
- Users with varying degrees of skin sensitivity.

The application is intended for general wellness and sun-safety education, not medical diagnosis or treatment.

---

# 2. Project Goals

## 2.1 Primary Goals

1. Estimate cumulative erythemally weighted UV dose during outdoor activities.
2. Automatically retrieve location-specific UV and weather conditions.
3. Track outdoor exposure duration through manual and optional automatic methods.
4. Record sunscreen applications and estimate their protective effects.
5. Provide understandable visualizations of daily UV exposure.
6. Notify users about high UV conditions and relevant sun-protection actions.
7. Maintain a historical record of UV exposure and outdoor activity.

## 2.2 Secondary Goals

1. Support personalized skin-sensitivity settings.
2. Provide forecasts of expected exposure during planned activities.
3. Support wearable and fitness-platform integrations.
4. Provide privacy-conscious background location tracking.
5. Offer educational information about UV radiation and sun protection.

## 2.3 Non-Goals

The initial release will not:

- Diagnose sunburn, skin cancer, or other medical conditions.
- Guarantee that a particular exposure duration is safe.
- Measure actual UV radiation using the phone's camera.
- Determine actual sunscreen coverage or effectiveness.
- Treat a calculated dose threshold as a universally safe daily UV allowance.
- Replace professional medical advice or sun-protection guidelines.

---

# 3. Core Features

## 3.1 User Onboarding and Profile

### Description

On first launch, users complete a short onboarding flow to configure their exposure tracking preferences.

### Required Inputs

| Field | Type | Description |
|---|---|---|
| Skin sensitivity | Enum | Self-reported tendency to burn |
| Typical sunscreen SPF | Integer | Default SPF used |
| Sunscreen reminder interval | Integer | User-configurable minutes |
| Location preference | Enum | Automatic or manually selected |
| Notification preferences | Boolean | Enable or disable reminders |
| Measurement units | Enum | Metric or imperial |

### Optional Inputs

- Fitzpatrick skin phototype (I–VI), with an explanation of its limitations.
- Typical outdoor activity patterns.
- Preferred outdoor activity categories.
- Clothing and shade habits.
- Usual sunscreen application method.

### Requirements

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
| UV index | Unitless | Estimate erythemal irradiance |
| Cloud cover | Percentage | Environmental context |
| Timestamp | UTC | Match conditions to exposure intervals |
| Latitude | Degrees | Geographic positioning |
| Longitude | Degrees | Geographic positioning |
| UV forecast | Hourly | Exposure prediction |

### Optional Data

- Solar elevation angle.
- Ozone column.
- Altitude.
- Direct and diffuse UV irradiance.
- Cloud-adjusted UV index.
- Temperature and humidity.
- Snow cover or surface reflectivity.
- Air-quality data.

### Data Source Candidates

- Open-Meteo.
- OpenUV or equivalent UV-focused providers.
- National weather agencies.
- Other providers offering hourly UV forecasts and historical data.

Provider selection must be based on documented coverage, update frequency, licensing, historical availability, and whether UV values already account for clouds.

### Important Modeling Rule

**Do not apply an additional cloud-cover correction when the UV index provided by the data source already represents cloud-adjusted surface UV.**

Cloud cover alone is not a reliable universal UV attenuation factor. Thin clouds can transmit substantial UV, and some cloud configurations can temporarily enhance surface UV.

If only clear-sky UV is available, the application may use a documented, calibrated cloud-transmission model. Otherwise, it should display clear-sky exposure as a scenario rather than pretending it is a measured cloud-adjusted value.

### Requirements

**ENV-001:** Retrieve current or latest available UV conditions.

**ENV-002:** Retrieve hourly UV forecasts.

**ENV-003:** Cache responses to minimize network requests.

**ENV-004:** Display the age of environmental observations.

**ENV-005:** Identify whether UV values are observed, modeled, or forecast.

**ENV-006:** Handle API outages and missing values.

**ENV-007:** Never silently substitute stale data for live measurements.

**ENV-008:** Store provider name, timestamp, and cloud-adjustment status for every observation used in calculations.

---

# 4. UV Dose Calculation Engine

This is the central component of the application. **For all modeling, refer to MODEL_SPEC.md before referencing the below section. Use this section to fill in gaps, not as a source of truth.**

## 4.1 Scientific Background

The UV index is proportional to erythemally weighted UV irradiance, which represents UV radiation weighted by its potential to cause skin reddening.

The standard relationship is:

\[
E_{\mathrm{ery}} = \frac{UVI}{40}
\]

Where:

- \(E_{\mathrm{ery}}\) is erythemally weighted irradiance in W/m².
- \(UVI\) is the ultraviolet index.

Equivalently:

\[
E_{\mathrm{ery}} = 0.025 \times UVI
\]

The accumulated erythemal radiant exposure is:

\[
H_{\mathrm{ery}} = \int E_{\mathrm{ery}}(t)\,dt
\]

For a constant UV index over an interval:

\[
H_{\mathrm{ery}} = 0.025 \times UVI \times t
\]

Where \(t\) is measured in seconds and \(H_{\mathrm{ery}}\) in J/m².

## 4.2 Standard Erythema Dose (SED)

One Standard Erythema Dose is defined as:

\[
1\ SED = 100\ J/m^2
\]

Therefore:

\[
SED = \frac{H_{\mathrm{ery}}}{100}
\]

For a constant UV index over a period measured in minutes:

\[
SED = 0.015 \times UVI \times t_{\mathrm{minutes}}
\]

### Example

A user spends 30 minutes outdoors at a UV index of 6.

\[
SED = 0.015 \times 6 \times 30
\]

\[
SED = 2.7
\]

The estimated ambient erythemal exposure is **2.7 SED**.

This is an ambient horizontal-surface estimate, not necessarily the exact dose received by any particular part of the user's body.

---

## 4.3 Time-Varying UV Exposure

UV index changes with time, location, weather, and solar position.

The application must calculate dose using discrete time intervals rather than multiplying a single daily UV index by total outdoor time.

For intervals indexed by \(i\):

\[
SED_{\mathrm{total}} =
\sum_{i=1}^{n} 0.015 \times UVI_i \times \Delta t_i
\]

Where:

- \(UVI_i\) is the estimated UV index during interval \(i\).
- \(\Delta t_i\) is the interval duration in minutes.

### Sampling Strategy

- Target integration resolution: 1 minute.
- Weather API updates: based on provider availability and caching.
- Interpolate between valid hourly UV observations where appropriate.
- Recalculate when the user's location changes significantly.
- Split intervals at outdoor-session, sunscreen, and protection-state changes.

The calculation must not assume that the UV index stays constant throughout the day.

### Example

| Interval | UV Index | Duration | Dose |
|---|---:|---:|---:|
| 11:00–11:20 | 4 | 20 min | 1.20 SED |
| 11:20–11:40 | 6 | 20 min | 1.80 SED |
| 11:40–12:00 | 7 | 20 min | 2.10 SED |
| **Total** | | **60 min** | **5.10 SED** |

---

## 4.4 Outdoor Exposure Detection

### Manual Tracking

Users can explicitly start, pause, resume, and end an outdoor session.

Manual tracking is the authoritative MVP method for determining outdoor time.

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
| SPF | Integer | Yes |
| Body area | Enum or list | Optional |
| Amount applied | Enum | Optional |
| Water resistance | Enum | Optional |
| Reapplication | Boolean | Yes |
| Notes | String | No |

### User Actions

- Apply sunscreen now.
- Record an earlier application.
- Reapply sunscreen.
- Edit or delete an application.
- Set default SPF.
- Configure reminders.

## 5.2 SPF and Modeled Protection

SPF is a laboratory-derived ratio related to the erythemal UV dose needed to produce a specified response on protected versus unprotected skin under standardized testing conditions.

A simplified idealized calculation is:

\[
H_{\mathrm{effective}} =
\frac{H_{\mathrm{ambient}}}{SPF}
\]

For example, 3 SED of ambient exposure with an idealized SPF 30 protection factor would correspond mathematically to 0.1 SED.

**This is not a reliable prediction of real-world protected skin dose.**

Actual protection depends on application thickness, coverage, water exposure, sweating, abrasion, product formulation, and other factors.

### Implementation Requirements

The application must:

1. Always calculate ambient dose independently of sunscreen.
2. Treat sunscreen-adjusted dose as an optional modeled scenario.
3. Never present SPF as a guaranteed multiplier of safe outdoor time.
4. Never automatically assume that logged sunscreen was applied adequately.
5. Never assume sunscreen prevents all UV-related harm.
6. Clearly label the modeled protection assumptions.

For the MVP, sunscreen logs should primarily support reminders and protection-history visualization. An advanced protection model may be added after validation.

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

For the MVP, these events may be recorded without modifying the ambient UV dose calculation.

---

# 6. Personalized Exposure Interpretation

## 6.1 Skin Sensitivity

Users may select a self-reported skin sensitivity or optionally provide a Fitzpatrick phototype.

This information can help personalize educational messaging but must not be used to claim a clinically accurate individual sunburn threshold without appropriate validation.

## 6.2 Minimum Erythema Dose

Minimum Erythema Dose (MED) refers to the minimum erythemally weighted UV exposure required to produce perceptible skin redness under defined assessment conditions.

MED varies substantially between individuals and conditions.

The application may explain MED educationally, but should not assign a precise personal MED based solely on skin type.

## 6.3 Exposure Indicators

The application should distinguish:

**UV intensity:** How strong the UV radiation is at a particular time.

**Ambient accumulated dose:** Total modeled erythemal UV exposure during recorded outdoor intervals.

**Protection history:** Sunscreen and other sun-protection actions logged by the user.

**Modeled protected dose:** Optional experimental estimate with clearly documented assumptions.

Avoid displaying a universal percentage such as "80% of your safe UV limit".

Instead, use SED values, historical comparisons, and environmental risk messaging.

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
- Location and weather data timestamp.
- Today's accumulated ambient SED, with description of what SED is
- Total confirmed outdoor time.
- Time since last sunscreen application.
- Current tracking status.
- Quick sunscreen logging button.
- Start or resume outdoor tracking button.
- Daily UV trend chart.

### Example Layout

```text
┌──────────────────────────────┐
│ UV DOSE TRACKER              │
│ Troy, NY                     │
│                              │
│ CURRENT UV INDEX             │
│          6.2                 │
│          HIGH                │
│                              │
│ TODAY'S AMBIENT DOSE         │
│        2.45 SED              │
│                              │
│ OUTDOOR TIME                 │
│        48 minutes            │
│                              │
│ SUNSCREEN                    │
│ SPF 30 • Applied 10:45 AM    │
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

**HOME-002:** Display today's cumulative confirmed ambient dose.

**HOME-003:** Update active-session dose estimates as time passes.

**HOME-004:** Display sunscreen application history.

**HOME-005:** Provide direct access to session controls.

**HOME-006:** Clearly indicate stale, forecast, or unavailable environmental data.

---

## 7.3 Active Tracking Screen

### Purpose

Display exposure accumulation during an outdoor session.

### Components

- Active session timer.
- Current UV index.
- Accumulated session dose.
- Current estimated dose rate.
- UV index over time.
- Sunscreen status.
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
│ SESSION DOSE                 │
│        3.25 SED              │
│                              │
│ DOSE RATE                    │
│       0.107 SED/min          │
│                              │
│ SUNSCREEN                    │
│ SPF 50 • 65 min ago          │
│                              │
│ [ Log Sunscreen ]            │
│                              │
│ [ Pause ]     [ End ]        │
└──────────────────────────────┘
```

### Behavior

- Session duration advances while tracking is active.
- Dose calculations use timestamped environmental observations.
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
- Ambient accumulated SED.
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

---

## 7.5 UV Forecast Screen

### Purpose

Help users understand anticipated UV intensity and plan outdoor activities.

### Components

- Current UV index.
- Hourly UV forecast.
- UV index peak.
- Cloud-cover forecast.
- Sunrise and sunset where available.
- Optional planned-session dose estimate.

### Planned Exposure Calculator

Users enter:

- Planned start time.
- Planned end time.
- Location.
- Expected outdoor duration.

The application estimates ambient dose over the selected interval using forecast UV values.

### Example

A planned 45-minute walk may display:

> Estimated ambient exposure: 1.8 SED. Forecast uncertainty and shade conditions may change actual exposure.

The application must not represent a lower forecast dose as a guarantee that sun protection is unnecessary.

---

## 7.6 Profile and Settings

### Sections

**Personal Preferences**
- Skin sensitivity.
- Default sunscreen SPF.
- Units.
- Timezone behavior.

**Tracking**
- Manual or automatic tracking.
- Location permissions.
- Background tracking.
- Sampling preferences.

**Notifications**
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

# 8. Notification System

## 8.1 Notification Categories

| Notification | Trigger | Priority |
|---|---|---|
| High UV alert | UV index enters high category | Medium |
| Sunscreen reminder | Configured interval elapsed during outdoor session | Medium |
| Session reminder | Long-running active session | Low |
| Forecast alert | High UV forecast for a planned session | Low |
| Data unavailable | Environmental updates fail during tracking | Medium |

## 8.2 Notification Requirements

**NOTIF-001:** Request notification permission only when needed.

**NOTIF-002:** Respect user preferences.

**NOTIF-003:** Prevent duplicate reminders.

**NOTIF-004:** Cancel or reschedule reminders when sessions end or sunscreen is reapplied.

**NOTIF-005:** Avoid alarming language or medically unsupported predictions.

**NOTIF-006:** Account for platform restrictions on background execution.

---

# 9. Technical Architecture

## 9.1 Recommended Technology Stack

| Component | Technology |
|---|---|
| Mobile framework | React Native with Expo and TypeScript |
| Navigation | Expo Router |
| UI components | React Native / custom design system |
| State management | Zustand |
| Data fetching | TanStack Query |
| Local database | SQLite |
| Location | Expo Location |
| Notifications | Expo Notifications |
| Secure storage | Expo SecureStore |
| Charts | React Native SVG-based chart library |
| Weather integration | Open-Meteo or selected UV API |
| Backend (optional) | FastAPI |
| Backend database (optional) | PostgreSQL |
| Authentication (optional) | Supabase Auth or equivalent |
| Testing | Jest, React Native Testing Library, Detox or Maestro |
| CI/CD | GitHub Actions |

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
│  UV Dose Calculator                  │
│  Environmental Data Normalizer       │
│  Protection Event Manager            │
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

The following TypeScript interfaces represent the application's domain objects.

## 10.1 User Profile

```typescript
interface UserProfile {
  id: string;
  skinSensitivity:
    | "burns_very_easily"
    | "burns_easily"
    | "sometimes_burns"
    | "rarely_burns"
    | "unknown";

  fitzpatrickType?: 1 | 2 | 3 | 4 | 5 | 6;

  defaultSPF: number;
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

  uvIndex: number;
  cloudCoverPercent?: number;

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

  solarElevationDegrees?: number;
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
    | "automatic";

  totalOutdoorSeconds: number;
  ambientDoseSED: number;

  createdAt: string;
  updatedAt: string;
}
```

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

  environmentalObservationId?: string;

  calculationStatus:
    | "calculated"
    | "estimated"
    | "missing_data";
}
```

## 10.6 Sunscreen Application

```typescript
interface SunscreenApplication {
  id: string;

  timestamp: string;
  spf: number;

  bodyAreas?: string[];

  applicationAmount?:
    | "unknown"
    | "light"
    | "recommended";

  waterResistanceMinutes?: number;

  isReapplication: boolean;
  notes?: string;
}
```

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

---

# 11. Database Schema

SQLite will be used for local persistence.

## 11.1 Tables

```sql
CREATE TABLE user_profiles (
    id TEXT PRIMARY KEY,
    skin_sensitivity TEXT NOT NULL,
    fitzpatrick_type INTEGER,
    default_spf INTEGER NOT NULL,
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE environmental_observations (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    uv_index REAL NOT NULL,
    cloud_cover_percent REAL,
    uv_index_type TEXT NOT NULL,
    data_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    solar_elevation_degrees REAL
);

CREATE TABLE exposure_intervals (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    exposure_state TEXT NOT NULL,
    uv_index REAL,
    ambient_dose_sed REAL,
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
    body_areas TEXT,
    application_amount TEXT,
    water_resistance_minutes INTEGER,
    is_reapplication INTEGER NOT NULL,
    notes TEXT
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
- Use transactions when saving session intervals and updating totals.
- Support database migrations.
- Avoid duplicating interval records after application restarts.
- Treat stored session totals as cached aggregates that can be rebuilt from intervals.

---

# 12. UV Dose Calculation Implementation

## 12.1 Pure Calculation Function

```typescript
export function calculateAmbientSED(
  uvIndex: number,
  durationSeconds: number
): number {
  if (
    !Number.isFinite(uvIndex) ||
    !Number.isFinite(durationSeconds) ||
    uvIndex < 0 ||
    durationSeconds < 0
  ) {
    throw new Error("Invalid UV exposure inputs");
  }

  const erythemalIrradiance = uvIndex * 0.025;

  const doseJoulesPerM2 =
    erythemalIrradiance * durationSeconds;

  return doseJoulesPerM2 / 100;
}
```

## 12.2 Accumulation

```typescript
interface DoseInterval {
  uvIndex: number;
  durationSeconds: number;
}

export function calculateTotalSED(
  intervals: DoseInterval[]
): number {
  return intervals.reduce((total, interval) => {
    return total + calculateAmbientSED(
      interval.uvIndex,
      interval.durationSeconds
    );
  }, 0);
}
```

## 12.3 Dose Rate

```typescript
export function calculateSEDPerMinute(
  uvIndex: number
): number {
  return calculateAmbientSED(uvIndex, 60);
}
```

## 12.4 Numerical Integration

When interpolating between UV values at the start and end of an interval, the application may use the trapezoidal rule:

\[
SED_i =
0.015 \times
\frac{UVI_{start}+UVI_{end}}{2}
\times \Delta t_{\mathrm{minutes}}
\]

This assumes linear change between the two UV values.

Do not interpolate across large data gaps without clearly labeling the resulting estimate.

## 12.5 Calculation Engine Requirements

**CALC-001:** Use nonnegative finite UV values.

**CALC-002:** Calculate dose using elapsed seconds, not UI timer ticks.

**CALC-003:** Prevent overlapping intervals from double-counting dose.

**CALC-004:** Split intervals at pause and resume boundaries.

**CALC-005:** Split intervals when location or environmental inputs change materially.

**CALC-006:** Keep missing intervals distinct from zero-dose intervals.

**CALC-007:** Do not subtract sunscreen-adjusted dose from accumulated ambient dose.

**CALC-008:** Recalculate summaries after session edits.

**CALC-009:** Preserve numerical precision internally and round only for display.

**CALC-010:** Maintain a version identifier for the calculation methodology so historical estimates can be reproduced.

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

## 13.4 Caching

Suggested initial policies:

- Current conditions: provider-dependent, typically refreshed every 15–30 minutes.
- Hourly forecast: cache according to provider update frequency.
- Location changes: refresh when the current cached forecast is no longer geographically representative.
- Historical data: retain observations used in completed session calculations.

These are initial engineering defaults, not guarantees of environmental accuracy.

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

1. Persist timestamps and session state.
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
Choose SPF
    |
    v
Confirm Application Time
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
Display Session Summary
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

### Dose Calculation

| Test | Input | Expected |
|---|---|---|
| Zero UV | UVI 0, 60 min | 0 SED |
| Low UV | UVI 2, 30 min | 0.9 SED |
| High UV | UVI 8, 60 min | 7.2 SED |
| Short interval | UVI 10, 1 min | 0.15 SED |
| Zero duration | UVI 6, 0 min | 0 SED |
| Invalid UV | UVI -1 | Error |
| Invalid duration | -60 seconds | Error |

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
3. Accuracy of inferred outdoor time.
4. Uncertainty introduced by shade, clothing, and body orientation.
5. Uncertainty of any sunscreen-adjusted exposure model.

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
- [ ] Hourly UV forecast.
- [ ] Cloud-cover display.
- [ ] Manual outdoor session tracking.
- [ ] Session pause, resume, and end.
- [ ] Ambient erythemal dose calculation in SED.
- [ ] Sunscreen application logging.
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
- [ ] Advanced sunscreen-effectiveness modeling.
- [ ] Personalized MED modeling.
- [ ] Smartwatch companion app.
- [ ] Detailed clothing and shade models.
- [ ] Predictive exposure notifications.
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

**Objective:** Implement scientifically grounded ambient dose calculations.

### Tasks

- Implement UV index-to-SED conversion.
- Implement interval integration.
- Implement session state machine.
- Add pause, resume, and end controls.
- Persist exposure intervals.
- Handle missing environmental data.
- Implement unit tests.

### Deliverable

An outdoor session tracker that estimates cumulative ambient SED.

## Phase 4 — Sunscreen Tracking

**Objective:** Add sun-protection logging and reminders.

### Tasks

- Create sunscreen application interface.
- Store application events.
- Implement default SPF preferences.
- Add reapplication reminders.
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

Allow users to plan activities and compare expected ambient UV dose across different times.

Example:

> Compare the estimated ambient UV exposure for a 45-minute walk at 11 AM versus 5 PM.

## 22.4 Advanced Protection Modeling

Explore modeling of:

- Clothing coverage.
- Shade exposure.
- Sunscreen application amount.
- Sunscreen reapplication.
- Water exposure.
- Body orientation.
- Reflective surfaces.

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
| Cloud cover modeling errors | Over- or underestimation | Prefer cloud-adjusted UV data |
| Indoor/outdoor ambiguity | Incorrect exposure duration | Manual tracking for MVP |
| Sunscreen effectiveness variability | Misleading protected-dose estimates | Keep ambient dose primary |
| GPS battery consumption | Poor user experience | Adaptive location sampling |
| Background execution restrictions | Tracking gaps | Timestamp-based recovery |
| Missing internet connectivity | Incomplete environmental data | Cache and flag missing intervals |
| Skin sensitivity variability | Misleading individual risk predictions | Avoid unsupported personal thresholds |
| User forgets to track | Incomplete daily history | Clearly label recorded exposure |
| Privacy concerns | Reduced trust | Local-first storage and data minimization |

---

# 25. Definition of Done

The MVP is complete when:

1. A user can select a location or grant foreground location access.
2. The application retrieves and displays relevant UV data.
3. A user can start, pause, resume, and end an outdoor session.
5. The application correctly calculates ambient erythemal dose in SED.
6. Sessions persist across ordinary app restarts.
7. Missing environmental data is clearly communicated.
8. Users can log sunscreen applications.
9. Users can receive configurable sunscreen reminders.
10. Users can view daily totals and completed sessions.
13. Core flows work on physical iOS and Android devices.
14. The application clearly communicates that estimates are not medical measurements.
15. The privacy policy and scientific methodology are accessible within the app.

---

# 26. Recommended Initial Implementation

The most practical first version is a **manual outdoor-session tracker with automatic UV data retrieval and cumulative ambient SED calculation**.

The initial user experience should be:

1. Open the app and view the current UV index.
2. Tap **Start Outdoor Session**.
3. Let the app accumulate estimated ambient UV dose over time.
4. Log sunscreen application with one tap.
5. Receive sunscreen reminders when appropriate.
6. End the session and review the accumulated dose.
7. View daily and historical exposure trends.

This approach delivers the application's primary value without depending on unreliable automatic outdoor detection or unvalidated sunscreen-effectiveness assumptions.

The architecture should nevertheless support more advanced tracking and personalization later.

---

# 27. Suggested Project Directory Structure

```text
uv-dose-tracker/
│
├── app/
│   ├── _layout.tsx
│   ├── onboarding/
│   │   └── index.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── track.tsx
│   │   ├── history.tsx
│   │   ├── forecast.tsx
│   │   └── profile.tsx
│   └── session/
│       └── [id].tsx
│
├── src/
│   ├── components/
│   │   ├── UVIndexCard.tsx
│   │   ├── DoseSummary.tsx
│   │   ├── SessionTimer.tsx
│   │   ├── SunscreenButton.tsx
│   │   └── UVChart.tsx
│   │
│   ├── domain/
│   │   ├── dose/
│   │   │   ├── calculator.ts
│   │   │   ├── integration.ts
│   │   │   └── types.ts
│   │   ├── sessions/
│   │   │   ├── sessionManager.ts
│   │   │   └── types.ts
│   │   └── sunscreen/
│   │       ├── reminders.ts
│   │       └── types.ts
│   │
│   ├── services/
│   │   ├── locationService.ts
│   │   ├── weatherService.ts
│   │   ├── notificationService.ts
│   │   └── uvProvider.ts
│   │
│   ├── database/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   └── repositories/
│   │       ├── sessionRepository.ts
│   │       ├── weatherRepository.ts
│   │       └── sunscreenRepository.ts
│   │
│   ├── hooks/
│   │   ├── useCurrentUV.ts
│   │   ├── useExposureSession.ts
│   │   └── useSunscreen.ts
│   │
│   ├── store/
│   │   ├── sessionStore.ts
│   │   └── preferencesStore.ts
│   │
│   ├── utils/
│   │   ├── dates.ts
│   │   └── formatting.ts
│   │
│   └── theme/
│       ├── colors.ts
│       └── typography.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── assets/
├── app.json
├── package.json
├── tsconfig.json
└── README.md
```

---

# 28. Final Product Vision

UV Dose Tracker should evolve from a simple UV index viewer into a privacy-conscious personal exposure journal that connects environmental UV conditions, time outdoors, and sun-protection behavior.

Its central differentiator is the conversion of changing UV intensity into a cumulative, scientifically defined exposure quantity: **Standard Erythema Dose (SED)**.

The app should prioritize understandable information, accurate calculations, transparent uncertainty, and practical sun-protection reminders rather than presenting estimated values as precise medical predictions.

The first release should establish a reliable foundation for outdoor tracking, environmental data integration, sunscreen logging, and exposure history. Future releases can expand into automatic activity recognition, wearables, and more sophisticated exposure modeling once those capabilities can be validated.