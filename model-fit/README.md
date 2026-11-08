# Model fits

## Ground-truth backtest (ARPANSA radiometers)

```bash
node model-fit/ground.ts         # ARPANSA 1-min UV + Open-Meteo forecast/satellite/CAMS → data/ground/hourly_ground.csv
python3 model-fit/ground_fit.py  # → app/src/model/groundParams.ts, ground_report.md
```

`ground.ts` runs the app's own `readUV` on what the app would have fetched for each station's privacy cell, so the
report scores the shipped code. ARPANSA timestamps are local standard time; each station's offset is checked
against solar noon and the run fails if it's off. Fitted rows are leave-one-station-out. Results:
[ground_report.md](ground_report.md). The limitation to state: every station is Australian.

## Calibration simulation (Bayesian MED vs the old step rule)

```bash
node model-fit/calibration_sim.ts   # → calibration_report.md (~70 s, seeded)
```

Virtual users of every skin type, two worlds (the app's assumptions hold / they're wrong in the unsafe direction), plus a
report-noise sensitivity test. Simulated people, not data: it checks the learner, not the priors.

## Cloud modification factor fit (Open-Meteo target)

```bash
node model-fit/fetch.ts      # Open-Meteo history → data/hourly.csv (raw responses cached in data/raw/)
python3 model-fit/fit.py     # → app/src/model/cmfParams.ts, report.md, cmf_fit.png
```

`fetch.ts` imports the app's own `clearSky.ts`/`solar.ts`, so the pipeline and the app share one
implementation. Needs Node ≥ 23.6 and `npm install` in `app/` (for suncalc). Python needs numpy, pandas, scipy
(matplotlib optional).

## What is fitted

`CMF = 1 − Σ aᵢ·cᵢ^bᵢ` over the low/mid/high layers, with `0.5 ≤ Σaᵢ ≤ 0.6` (full overcast → 50–60%
reduction, Allaart et al. 2004), weighted by clear-sky UVI. The data are 12 cities × 4 three-week windows in 2025.
Results and leave-one-city-out validation are in [report.md](report.md).

## Decisions made from the data

- **Target is `uv_index / uv_index_clear_sky` (Open-Meteo / Open-Meteo), not `uv_index / our Allaart`.** Our
  Allaart clear-sky and Open-Meteo's clear-sky disagree as a function of zenith angle: Allaart is ~20% higher near
  overhead sun and 2–3× lower at SZA > 65°. Allaart agrees with the independent Madronich fit (12.5·μ₀^2.42), so
  Open-Meteo is the outlier. Dividing by Allaart would fold that SZA bias into the "cloud" factor.
- **Allaart parameters:** the form (additive stage 2) is confirmed against
  [TEMIS](https://www.temis.nl/uvradiation/product/uvi-uvd.html). The default is the TEMIS v2.0 (2017) refit; the
  original 2004 values are kept as `version: 'allaart2004'`. They differ by < 4% at moderate SZA.
- **Hour alignment:** Open-Meteo hourly UV is the mean over the preceding hour, so we average clear-sky over that hour.

## For the slide (say these out loud)

- We fit to **another model's output, not ground-truth radiometers**. The EPA/NOAA ground UV network would be the
  stronger target.
- Layered cover beats one total-cover number (RMSE 0.210 vs 0.252), but cloud *fraction* can't see optical depth:
  R² ≈ 0.35.
- In Open-Meteo, mid cloud gets a coefficient as large as low cloud's. Layers combine super-additively: all three at
  100% cuts ~80%, while each alone cuts only 8–15%.
- CMF ≤ 1 by construction: **no broken-cloud enhancement** (UVI briefly above clear sky). Open-Meteo can't produce
  it either (0.02% of hours).
