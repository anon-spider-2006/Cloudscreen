## The model specs

The UV dose model lives in `app/src/model/`. It is pure TypeScript with no React Native imports, so the same code runs in the app, in Node tests and in the offline fit pipeline. `app/src/engine/` sits between the model and the screens.

The chain, start to finish:

```
clear-sky UV  ×  cloud factor  →  UVI(t)  ×  skin geometry  ÷  sunscreen  ×  wet skin  →  dose (SED)  ÷  your MED  →  burn fraction
(CAMS / Allaart)  (satellite / NWP)          (exposure.ts)     (sunscreen.ts)  (dose.ts)     (dose.ts)      (calibration.ts)
```

Every estimate also carries a measured error band (uncertainty.ts), which turns "time to burn" into a range and makes alerts fire early.

Numbers below come from the generated reports: `model-fit/report.md` (Open-Meteo cloud fit), `model-fit/ground_report.md` (ARPANSA ground truth) and `model-fit/calibration_report.md` (skin calibration simulation).

### 1. solar.ts: where the sun is

- solarZenithDeg: the sun's angle from straight overhead (0 is overhead, 90 is the horizon), computed by suncalc.
- sunEarthDistanceFactor: the Earth is about 3% closer to the sun in January, so sunlight is about 3% stronger then.

### 2. clearSky.ts: UV on a cloudless day (Allaart)

- allaartClearSkyUVI is the Allaart formula: sun angle plus ozone gives UVI.
- mu0, mux and uva cover how much UV gets through the atmosphere. X and the F·X^G + H/TO + J bracket cover how much ozone absorbs.
- There are two parameter sets: the original 2004 paper and the 2017 TEMIS refit, which is the default.
- Altitude adds 5% per km.
- clearSkyUVIAt is the convenience version that takes a date and location.
- Role now: physics and demo modes, and the clear-sky fallback in forecast mode when CAMS is missing. In forecast mode the clear sky normally comes from CAMS (section 6).
- Measured limitation: with ozone fixed at 300 DU, Allaart is off by ±15–20% over the year against ground instruments. It follows the ozone season (reads high in October, low in April in the Southern Hemisphere).

### 3. cmf.ts: what clouds remove (from cloud-cover layers)

- cloudModificationFactor takes low, mid and high cloud cover (each 0–1) and a parameter set, and returns a multiplier from 0 to 1. A value of 1 means clouds aren't blocking anything.
- CMF = 1 − Σ aᵢ·cᵢ^bᵢ. There are two parameter sets, both generated, so don't edit them by hand:
  - CMF_PARAMS (cmfParams.ts, from fit.py): fitted to Open-Meteo's own uv_index ÷ uv_index_clear_sky. Used by physics and demo modes.
  - GROUND_PARAMS.layers (groundParams.ts, from ground_fit.py): fitted to ARPANSA radiometers. Used by forecast mode when there's no satellite.
- CMF ≤ 1 by construction, so brief broken-cloud UV spikes aren't represented. The ground fit also found no benefit from allowing them in hourly means.

### 4. uvSource.ts: where UVI(t) comes from

- fetchForecast calls two Open-Meteo APIs in parallel for the privacy-cell centre (section 13):
  - the forecast API: hourly uv_index, uv_index_clear_sky and low/mid/high cloud, from 2 days back (for logging time after the fact) to 7 days ahead (for the planner);
  - the air-quality API: CAMS clear-sky UV, about 4.5 days ahead. CAMS values are instantaneous at the label time, so the hour mean is the average of the hour's two edges. If this fetch fails, the forecast still works.
- readUV answers "what's the UV at time t?" in one of three modes:
  - 'forecast' (default), the ground-fitted chain:
    - clear = 0.88 × CAMS clear-sky (Allaart if CAMS is missing)
    - NWP = clear × CMF_ground(layers) when CAMS is present; otherwise raw Open-Meteo uv_index (the legacy path)
    - UVI = w · clear · CMF_sat + (1 − w) · NWP, where w is the satellite weight (section 5)
  - 'physics': Allaart clear-sky × CMF_PARAMS from Open-Meteo's cloud layers, with satellite mixed in the same way. It's also the automatic fallback when no forecast point is available.
  - 'demo': fully offline, with user-chosen clouds. It never uses the network or the satellite.
- Each term carries exactly one cloud effect, so clouds are never applied twice.
- Sanity check: if a value is impossibly high (above 1.5 × clear sky + 0.5), it's clamped and the reading sets clamped: true.
- Each reading also reports:
  - cloudSource: 'satellite', 'nwp' or 'user'
  - satWeight and satObsT: how much the satellite counted, and which slot
  - uviRange: plausible range across nearby satellite pixels
  - errorClass: which chain produced the value, so the matching error band can be applied (section 7)

### 5. satellite.ts: clouds as observed, not modelled

- Why: Open-Meteo's cloud layers are weather-model output. They say where the model put cloud, not where cloud was, and cloud fraction can't see how thick a cloud is (Open-Meteo fit R² ≈ 0.35). Geostationary satellites measure how much sunlight reaches the ground every 10–15 min at ~5 km.
- Source: Open-Meteo's satellite API (Himawari, MSG, MTG). It covers Europe, Africa, South America, Asia and Australia. North America isn't covered yet (no GOES): the response is all nulls, the observations are marked covered: false, and the app uses the NWP chain. An uncovered cell is rechecked daily.
- On the device, per pixel and per slot:
  - clear-sky index k_c = GHI ÷ clear-sky GHI. The clear sky is Haurwitz, averaged over the slot, or the provider's own value where it gives one (MTG).
  - UV cloud factor = min(k_c, 1)^0.876. The exponent and cap are fitted to ground UV (section 6). The first guess, 0.6, under-attenuated UV.
  - Below a mean clear-sky GHI of 50 W/m² (low sun) the value is unusable, and UV is negligible anyway.
- Time:
  - Data come at the native step (10 min Himawari/MTG, 15 min MSG), about 40–60 min behind real time.
  - The store does one full 50 h fetch, then every 10 min re-fetches the last 3 h and merges it in (mergeSatellite). Older slots are kept, newer values win, and anything past 50 h is dropped.
  - Over observed slots the satellite is used directly, interpolated between slot centres.
  - After the last slot, the mean of the last 10 min persists with weight e^(−lag/4 h), and readUV blends back to the NWP chain. τ and the window are tuned on the live ground backtest (section 6).
  - The aggregated series per (observations, point, accuracy) is cached and looked up by binary search, so a 12 h projection (360 readings) takes ~5 ms.
- Spatial aggregation for location uncertainty (section 13):
  - Precise users get their own pixel (Gaussian-weighted median, σ ≈ half a pixel).
  - Coarse users get a σ equal to their accuracy and a quantile sliding toward the 75th percentile, the clearer, higher-UV end. For a burn app, uncertainty should err toward more UV.
  - Every reading also reports a 10–90% range across nearby pixels.

### 6. groundParams.ts: fitted to real UV instruments

- Generated by model-fit/ground_fit.py. Don't edit by hand.
- Ground truth: ARPANSA one-minute UV Index from calibrated radiometers at 8 Australian stations (Darwin, Townsville, Brisbane, Sydney, Melbourne, Kingston, Perth, Alice Springs), in four 3-week windows of 2024. That's 5,344 daytime hours, inside satellite coverage.
- The backtest runs the app's own readUV on exactly what the app would have fetched for each station's privacy cell. Fitted scores are leave-one-station-out.
- Fitted values:
  - camsClearScale 0.88: CAMS clear-sky reads 14% high, but its ratio to ground is flat across months, because it carries forecast ozone and aerosol. Open-Meteo's own clear-sky is 22% low with the sun high and up to 45% high with it low, so the app no longer uses it.
  - uvSwExponent 0.876 and kcMax 1.0: the satellite cloud factor.
  - persistTauH 4 h and persistWindowMin 10: the satellite hand-off. The rule picks the lowest daily dose error among native-data variants at 60 min latency whose under-days ≤ 0.5%. Longer τ lowers error slightly but raises under-days, so the safety cap decides.
  - layers: the layered CMF refit on measured UV (full overcast CMF 0.40).
  - doseBand: the error band table (section 7).
- Daily dose error (leave-one-station-out unless noted). Under-days are days where predicted dose is less than 80% of measured.

| UV source | daily dose error | under-days |
|---|---|---|
| Raw Open-Meteo UVI (the old default) | 24.8% | 9.0% |
| Physics (Allaart × Open-Meteo-fit CMF) | 19.9% | 20.2% |
| New no-satellite chain (0.88 × CAMS × ground CMF) | 14.3% | 4.2% |
| Satellite, all data arrived (after the fact) | 5.8% | 0.5% |
| Satellite, live (60 min latency, as shipped) | 7.1% | 0.3% |

### 7. uncertainty.ts: how wrong a projected dose can be

- doseBand(source, hours) gives the 10th–90th percentile of measured ÷ predicted dose for a projection that many hours ahead.
  - The projection test starts every 30 min and uses only data available at the start, with 60 min satellite latency.
  - There's one band per source: sat, nwp, legacy (raw Open-Meteo), physics. Demo has none, because it's a scenario.
  - It's log-linear in horizon, clamped to 0.5–8 h. Errors shrink with horizon because passing clouds average out.

| source | 0.5 h | 2 h | 8 h |
|---|---|---|---|
| sat | 0.70–1.24 | 0.75–1.22 | 0.83–1.21 |
| nwp | 0.64–1.29 | 0.71–1.25 | 0.81–1.23 |
| legacy | 0.41–1.27 | 0.48–1.26 | 0.60–1.21 |
| physics | 0.67–1.40 | 0.72–1.37 | 0.76–1.33 |

- withSpatial widens the band by the nearby-pixel range, only when location is coarser than a satellite pixel (~5 km). The measured band already includes pixel-to-pixel variation for a precise user.
- withSkin adds the personal-MED uncertainty from the calibration posterior (section 11). The two are independent, so they combine in quadrature in log space.
- Coverage on held-out stations is ~79% inside (80% nominal) and ~10% above. But at single stations, measured dose lands above the band up to 20% of the time with satellite (Sydney) and 25–32% without it. Treat the cautious time as "plan for this", not a worst case.

### 8. exposure.ts: what actually hits your skin

- UVI is measured on a flat, horizontal surface, but skin points in all directions. geometryFactor (G) converts horizontal UV to UV on skin.
- Posture: upright (face and arms, G ≈ 0.35 at midday), shoulders, or lying (G = 1).
- Direct vs scattered light: most UV arrives scattered from the whole sky rather than straight from the sun. The direct share falls with the cloud factor.
- Ground reflection (SURFACES): negligible for grass, large for snow.
- Shade (SHADES): none, umbrella or dense. Shade blocks direct sun and part of the sky, but not reflection from the ground, so an umbrella on sand only halves your dose. The shade values are assumptions.
- skinIrradiance gives E = 0.025 · UVI · G, in W/m².

### 9. sunscreen.ts: what sunscreen blocks

- Effective SPF is the labelled SPF raised to three shrinking exponents:
  - applicationExponent: you applied less than the 2 mg/cm² used in lab testing.
  - photoRetention: UV breaks down the film. The chemical type degrades and photostable barely does.
  - wearRetention: rubbing, sweat and water. It halves about every 1.4 h when dry, and faster when sweating or swimming.
- A FilmState tracks one application: how much UV has hit it and how worn it is. effectiveSPF combines those into the current SPF.
- The wear speed-ups (sweating 2×, swimming 4×; water-resistant labels halve the extra) are assumptions.
- Sea, lake and pool water get the same wear rate. Some tests suggest salt water removes sunscreen faster than fresh water, but results depend heavily on the product (one study: 96–99% of SPF kept; a consumer test: 59% lost after 40 min immersion), and I found no clean same-product comparison. So there is no separate salt-water rate.

### 10. dose.ts: adding it all up

- MED_SED: the typical burn dose for each skin type, from 2.5 SED (type I) to 10 SED (type VI). It's the starting point (prior median) for calibration, not a fixed threshold.
- SkinProfile holds:
  - skinType;
  - cUser: the personal multiplier, the calibration posterior median ÷ MED_SED;
  - medLogSpread: how unsure the posterior still is.
- SessionState holds the dose so far, the sunscreen film, and how wet the skin is (hydration).
- advance(state, seconds, env, settings) steps time forward. Each second outside adds UV ÷ SPF × the wet-skin factor to your dose, and wears the sunscreen.
- Wet skin burns sooner. Water soaked into the outer skin layer reflects and scatters less UV, so the MED drops while skin is wet:

| activity | MED lowered by | evidence |
|---|---|---|
| swimming (sea, lake or pool) | 25% | 5% salt water: −23.4% (Gambichler & Schröpl 1998, n = 24) and −31%, 130 → 90 mJ/cm² (Schempp et al. 1999, n = 12) |
| sweating | 16% | median after 15 min jogging or 10 min sauna (Moehrle et al. 2000, n = 22; mean 17%, up to 41%) |
| dry | 0 | |

  - **It's wetness, not salt.** Tap water and 4% salt (about sea strength) both lower the MED, while near-saturated brine and Dead Sea water don't (Boer et al. 1982). So sea, lake and pool get the same factor.
  - **Drying:** the effect was gone after 20 min of drying (Boer 1982, tap water). Wetting is immediate. The fade is ASSUMED linear, so swim-wet skin is back to normal in 20 min and sweat in about 13 min.
  - **Swimming outings:** ASSUMED to keep the skin wet throughout (in and out of the water).
  - **How it's applied:** as a dose multiplier 1/(1 − r) on skin dose. The ambient (physical) dose is unchanged, burnFraction stays dose ÷ dry-skin MED, and calibration keeps learning the dry-skin MED.
  - **Effect** (Miami noon, type II): Beach/Pool bare skin 18 → 13 min, and 48 → 41 min with SPF 30. Run/cycle 19 → 16 min. Walk unchanged.
  - **Evidence quality:** small forearm phototests after controlled baths or exercise, not real swims.
- burnFraction is dose ÷ (MED_SED × cUser). At 1.0 you reach your estimated MED.
- project simulates forward using envAt(t) and returns minutes to a target fraction plus the fraction timeline.
- ALERT_THRESHOLDS: 50%, 80% and 100%, applied to the cautious fraction (section 12).
- PRESETS bundles posture, surface and activity for one-tap outings (walk, run, picnic, beach, pool, ski).
- WORST_SITE_POSTURES lists the sites tracked side by side (face/arms and shoulders). Shoulders usually burn first, in about a third of the time at midday.
- explainRate breaks the current dose rate into its factors (UVI, G, effective SPF, wet skin) for the "Why this number?" screen.

### 11. calibration.ts: learning your real skin (Bayesian)

- The next morning the app asks "any redness?". calibrationPromptTime schedules it for 9am the next day, at least 12 h after the session, because redness peaks 8–24 h after exposure.
- Each answer updates a posterior over your personal MED, computed exactly on a 1-D grid in ln MED (241 points, under 1 ms).
- Prior per stated Fitzpatrick type:
  - 70% that type and 15% each neighbour, because self-reported type is unreliable (Brenner & Hearing 2008). The split is an assumption.
  - Medians are MED_SED.
  - Within-type log-spread is 0.40 for I–IV. Published phototests show coefficients of variation of 0.3–0.5 within a type. V–VI use an assumed 0.50, because no measured spread was found.
- Likelihood: an ordinal model on e = ln(dose) − ln(MED) + noise:
  - none means e < 0; pink means 0 ≤ e < ln 2; burned means e ≥ ln 2 ("burned" ≈ 2 MED).
  - The noise combines the measured UV error for that day's outdoor time, report fuzz (0.30, assumed) and sunscreen uncertainty (0.50 if worn, assumed).
  - 5% of answers are treated as random (heat, rubbing, a mis-tap), so one odd morning can't swing it.
- Evidence per day: the sum of that day's sessions at their worst site. Demo sessions are excluded.
- What the app does with it:
  - profile.cUser = posterior median ÷ MED_SED, so every existing caller is unchanged.
  - The posterior spread feeds the time-to-burn range and alerts. A new user gets a wide range and early alerts, and both tighten with check-ins.
  - Reset keeps old answers but ignores those before the reset.
  - Changing skin type re-reads all answers against the new prior.
  - Pre-Bayesian check-ins are reconstructed from the fraction they stored.
- Report-noise settings: wider "robust" values (0.45 / 0.70 / 10%) were tested and rejected. If the assumptions hold, they shrug off real redness and over-trust rises from 3% to 13%. See section 14.
- updateCUser (the old step rule) is kept only for comparison in the simulation.

### 12. engine (src/engine/index.ts): sessions, time to burn, alerts, check-ins, trends

- timeToBurnNow runs one projection per body site at 2-minute resolution and reads three times off its timeline:
  - soonest: the central fraction reaches 1 / band.hi. This is the cautious time, iterated once because the band depends on the horizon.
  - minutes: the fraction reaches 1, the most likely time.
  - latest: the fraction reaches 1 / band.lo.
  - The band is bandFor(ctx, now, skin): the UV band for the current source, plus spatial spread for coarse locations, plus skin uncertainty.
  - The UI shows "soonest–latest" (e.g. "35–50 min") and says "plan on the earlier time". It takes ~10–17 ms per refresh.
- Alerts (store tick):
  - They fire when the cautious fraction, central × cautiousFactor, crosses 50/80/100%. The factor is the band's hi for the session's outdoor time, including skin uncertainty.
  - Future notifications are scheduled by projecting the central path to threshold ÷ factor.
  - Scaling the whole dose, not just future UV, keeps the alert time from sliding later on every tick. A test checks this.
  - The wording says "You may be at…".
- checkInForDay builds a check-in from the day's non-demo sessions: total worst-site dose, its UV log-SD, and whether sunscreen was used. answerCheckIn records the answer and the posterior after it (medAfter). calibrate rebuilds the posterior from all answers since the last reset.
- The planner (planDay) still ranks start times with the central estimate only.
- Activity input is the same on every screen (components/cs/activity-picker.tsx: Track, Add time outside and the Forecast planner). It offers exactly the inputs the model distinguishes:
  - the 6 presets (each a bundle of position, ground and skin state);
  - shade;
  - details: position (upright or lying; any upright setting tracks face/arms and shoulders, so "shoulders" isn't a separate choice), ground (5 surfaces), and skin state (dry, sweating or swimming), each with its effect explained.
  - Changing a detail makes it "Custom". Every label comes from activityLabel(preset, settings): the matching preset's name, or "Custom · Position · Ground · Skin". So a session is never shown under a preset it doesn't match.
  - The store's single setActivity action records the choice, remembering a preset match as the default and anything else as custom. A running session switches from then on and keeps its dose. Picking a default activity in Profile clears any custom choice for the next session.
- Trends (History tab, components/cs/trends.tsx) are computed on device from saved sessions and check-ins. Demo sessions are excluded.
  - weekCompare: the last 7 days vs the 7 before them (rolling, so no locale-dependent week start). It covers time outside, the dose your skin actually got (with sunscreen, worst site), and near-burn days (peak burn progress ≥ 80%).
  - sunscreenHabit (30 days): the share of outdoor time after sunscreen went on, read from each session's start/pause/resume/sunscreen/end events, so pauses don't count. It also gives the share of the bare-skin dose sunscreen removed on days you wore it. That uses session totals, so time before applying and wear-off count: it's what the habit achieved, not the label SPF.
  - skinLearning: the MED estimate and 80% range after each check-in since the last reset, starting from the skin-type prior. rangeNarrowing reports how much narrower the range is now (in log terms).
  - The bare-skin dose (SessionState.bareSED) includes the wet-skin factor, so sunscreen comparisons are like for like on swimming days. Older sessions fall back to the physical dose.

### 13. Location and privacy (services/location.ts, model/satellite.ts, state/store.ts)

- Providers only ever see a fixed 0.1° (~11 km) privacy cell:
  - its centre, for the forecast and CAMS requests;
  - the same 5×5 lattice around it, for satellite.
  - Every point in the cell maps to the same centre, so repeated queries can't be averaged back to the user's point.
- The exact point (rounded to 0.01° on device) and its accuracy never leave the phone. They only shape on-device aggregation and the error band.
- Place.accuracyKm comes from:
  - the GPS fix's reported accuracy (large when Precise Location is off or only coarse permission is granted, minimum 1 km);
  - 10 km for a picked city;
  - 0 for demo.
- The same request is sent whether the user shared precise location, coarse location or picked a city.

### 14. index.ts

- Re-exports everything, so the app can write `import { project, readUV } from '@/model'`.

### 15. Demo mode (src/demo/mackenzie.ts, src/app/demo.tsx)

- **The persona:** a made-up person, Mackenzie McHale (a fan reference to HBO's The Newsroom; swap the name before any public release). Skin type II, with a hidden true MED of about 2.7 SED. She uses SPF 50, chemical, applied at 1 mg/cm², not water-resistant.
- **Her history:**
  - two weeks in Manhattan, with a rooftop-lunch burn on 2 Aug and better habits the week after;
  - today, Sat 14 Aug 2027: a 30 min lunch under an umbrella on a Lake George dock, then an evening hike up Cascade Mountain (trailhead 640 m, summit 1,249 m; wooded lower trail, then open rock).
- **Built by the real engine:** buildDemo(moment) creates all of it. Each outing is judged against her calibration at the time, and each next-morning check-in is answered before the next outing. So every number on screen is the model's, and a test checks every check-in answer against her computed dose.
- **Three moments:**

| moment | UV | today so far | bare-skin time to burn |
|---|---|---|---|
| 12:30 on the dock (lunch running) | 7.7 | 16% | 54 min–1 h 55 min |
| 5:15 pm at the trailhead (start) | 1.6 | 31% | possible after 1 h 20 min |
| 7:00 pm on the summit (hike running) | 0.2 | 42% | not expected today |

- **The Trends story:** more time out this week than last (250 vs 230 min) but much less dose (6.1 vs 14.5 SED), and near-burn days down from 2 to 1. Sunscreen cut her dose by 81% when worn, against SPF 50 on the label. Her estimate settles at about 2.5 SED, below the type II average, with the range 42% narrower.
- **Behaviour:**
  - Enter from Profile or "Just looking? Try the demo" in onboarding.
  - The real profile, place, forecast, satellite data, sessions, sunscreen log, check-ins and any active session are set aside in realSnapshot. That's persisted, so it survives the app closing mid-demo, and exit restores it exactly.
  - A coral strip on every screen shows the persona and demo clock, and opens the controls: jump to a moment, the sky sliders, restart, exit.
  - The demo clock runs from the chosen moment. The demo never fetches and never schedules notifications, and location changes are ignored.
  - It replaces the old Miami demo, which changed only the sky and clock.

## The fit pipeline (offline; not part of the app)

All scripts import the app's own model code, so the pipeline scores what ships. Run them from the repo root (Node ≥ 23.6, plus Python with numpy, pandas and scipy).

- model-fit/fetch.ts → data/hourly.csv. Downloads 2025 hourly UV and cloud data for 12 cities and 4 seasons from Open-Meteo, and runs clearSky.ts on every hour.
- model-fit/fit.py → cmfParams.ts, report.md, cmf_fit.png. Fits CMF_PARAMS to Open-Meteo's uv_index ÷ uv_index_clear_sky, constrained so full overcast gives a 50–60% reduction.
- model-fit/ground.ts → data/ground/*.csv (a few minutes on the first run while it downloads ~170 MB; about 1 min from cache). It:
  - downloads ARPANSA minute data, and checks each station's timezone against solar noon (the run fails if a station is off);
  - fetches the archived forecast, native and hourly satellite data, and CAMS for each privacy cell.
  - It writes three files:
    - hourly_ground.csv: every mode, hour by hour;
    - live_ground.csv: real-time simulation where the app only sees data that has arrived;
    - proj_ground.csv: projections 0.5–8 h ahead from data as of the start.
- model-fit/ground_fit.py → groundParams.ts and ground_report.md. It:
  - fits the CAMS scale, the satellite exponent and cap, and the ground layered CMF, all leave-one-station-out;
  - picks τ and the persistence window by the safety rule;
  - fits the dose band and reports its held-out coverage.
- model-fit/calibration_sim.ts → calibration_report.md (~70 s, seeded). It:
  - runs 3,000 virtual users per type I–VI over 30 outings, comparing the Bayesian posterior with the old step rule;
  - uses two worlds: "as assumed", and "harsher", where the assumptions are wrong in the unsafe direction;
  - includes the report-noise sensitivity test.
- model-fit/README.md: how to re-run each fit, the decisions the data forced, and the limitations to say out loud.

### What the calibration simulation shows

After 30 check-ins, across types I–VI:

| | old step rule | Bayesian |
|---|---|---|
| typical error in your MED ("as assumed") | 56–67% (gets worse over time) | 9% |
| typical error ("harsher") | 94–128% | 16% |
| thinks you have 25%+ more time than you do | 0–5% | 2–4% |
| pink when leaving at the cautious 100% | — | 11–13% ("harsher": 7–8%) |

The old rule ratchets your MED down to about half its true value, so it tells people to go inside far too early. In the "harsher" world, the Bayesian 80% interval holds the truth only ~59% of the time, but it errs on the safe side.

## Tests

- app/src/model/model.test.ts (29 tests) and app/src/engine/engine.test.ts (22 tests). Run them with `npm run test:model` from app/. They also work as runnable examples of how to call each function.
- One test per claim, for example:
  - overhead sun gives about 11.8;
  - 1 h at UVI 8 lying unprotected gives 7.2 SED;
  - all points in a privacy cell map to the same centre;
  - the satellite factor replaces NWP clouds, not multiplies them;
  - persistence uses the recent mean and respects the latency cutoff;
  - the dose band narrows with horizon;
  - soonest ≤ most likely ≤ latest;
  - cautious alerts don't slide later;
  - "pink" moves the MED estimate toward that day's dose;
  - swimming and sweating raise skin dose by 1/(1 − r), physical dose doesn't change, and the effect is gone 20 min after drying;
  - demo sessions are never calibration evidence;
  - the trends: rolling week comparison, sunscreen time with pauses excluded, the dose sunscreen removed, and the skin range narrowing with check-ins;
  - the demo persona: each moment's sessions, check-in answers consistent with her dose, and the trends story.

## Known limits and next steps

- **North America has no satellite data** until GOES is added. That needs a small backend that reads NOAA's GOES files for the privacy cell only. Until then the no-satellite chain applies (14.3% daily dose error).
- **Every ground station is Australian:** low aerosol and Southern Hemisphere ozone. The CAMS scale, satellite exponent, cloud refit and error band haven't been checked against US or European instruments.
- **Satellite latency** (~55–60 min) was measured in one session. Europe's MSG runs about 2 h late, which the 90-min row of the live table suggests costs about 1.3 points of daily dose error.
- **Calibration is checked on simulated people.** The prior split (70/15/15), the noise values and the type V–VI spread are assumptions until real check-in data can test them. Types V–VI rarely burn, so their answers are mostly "none".
- **Uncertainty covers UV and skin, but not sunscreen amount**, except as extra noise on calibration days.
- **Swimming errs toward more dose.** Water absorbs UV while you're submerged, but the model assumes full exposure, and it also assumes the skin stays wet for the whole outing. The wet-skin sizes come from small forearm studies, and the fade shape is an assumption. A salt-water sunscreen wear rate isn't modelled (the evidence is product-dependent).
- **Hot-weather sweating on a "walk"** isn't captured. Only the sweating presets (run, ski) get the factor.
- **The day planner** still shows one number, not a range.
