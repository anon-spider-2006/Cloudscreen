"""
Ground-truth backtest, stage 2: score every UV source against ARPANSA radiometers
and fit the satellite chain to measured UV (not to another model).

    node model-fit/ground.ts && python3 model-fit/ground_fit.py

Fits (weighted by clear-sky UVI, so the hours that drive dose count most):
  1. s        CAMS clear-sky scale:      UVI_clear = s * CAMS_clear
  2. p, kmax  satellite exponent / cap:  UVI = s * CAMS_clear * min(k_c, kmax)^p
  3. a_i, b_i layered CMF on the measured ratio  ground / (s * CAMS_clear)
  4. tau, window  satellite persistence, from the LIVE simulation (ground.ts):
                  lowest daily dose error among native-data variants at the measured
                  60-min latency whose under-days <= LIVE_MAX_UNDER_PCT
  5. dose band    10th/90th percentile of measured/predicted dose for projections
                  0.5–8 h ahead from data as of the start (ground.ts PROJECTION),
                  per UV source. Drives the time-to-burn range and cautious alerts.
Every fitted score is leave-one-station-out: the station being scored was not
in the fit.

Writes:
  app/src/model/groundParams.ts   (generated; imported by the app)
  model-fit/ground_report.md
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from fit import LAYERS, cmf as layered_cmf, fit as fit_layers  # noqa: E402

KMAX_GRID = [1.0, 1.1, 1.2, 1.3]
MIN_CLEAR_UVI = 1.0
UNDER = 0.8  # a day is "dangerously under-predicted" if predicted dose < 80% of measured
LIVE_MAX_UNDER_PCT = 0.5
BAND_Q = (0.10, 0.90)
BAND_CLASSES = ["sat", "nwp", "legacy", "physics"]
BAND_MIN_MEAN_UVI = 1.0  # only burn-relevant windows


def dose_band():
    d = pd.read_csv(HERE / "data" / "ground" / "proj_ground.csv").dropna()
    band, cover = {}, {}
    for cls in BAND_CLASSES:
        hs, lo, hi, med, n = [], [], [], [], []
        cov_in, cov_above = [], []
        for H, g in d.groupby("h"):
            g = g[g[cls] / H >= BAND_MIN_MEAN_UVI]
            r = g.meas / g[cls]
            hs.append(float(H)); lo.append(round(float(r.quantile(BAND_Q[0])), 3)); hi.append(round(float(r.quantile(BAND_Q[1])), 3))
            med.append(float(r.median())); n.append(len(g))
            for city in g.city.unique():  # leave-one-station-out coverage
                tr, te = g[g.city != city], g[g.city == city]
                rt, rr = tr.meas / tr[cls], te.meas / te[cls]
                a, b = rt.quantile(BAND_Q[0]), rt.quantile(BAND_Q[1])
                cov_in.append(((rr >= a) & (rr <= b)).mean()); cov_above.append((city, float((rr > b).mean())))
        band[cls] = {"h": hs, "lo": lo, "hi": hi}
        worst = max(cov_above, key=lambda x: x[1])
        cover[cls] = {"median": med, "n": n, "inside": float(np.mean(cov_in)), "above": float(np.mean([x[1] for x in cov_above])), "worst": worst}
    return band, cover


def load():
    d = pd.read_csv(HERE / "data" / "ground" / "hourly_ground.csv")
    d["cams_c"] = (d.cams_clear + d.cams_clear_prev) / 2
    d["cams_a"] = (d.cams_uvi + d.cams_uvi_prev) / 2
    d = d.dropna(subset=["cams_c", "cams_a", "kc_sat", "pred_forecast", "pred_physics", "pred_app_nwp", "pred_sat_d0"])
    d = d[(d.uvi_allaart >= MIN_CLEAR_UVI) & (d.cams_c > 0)].copy()
    for l in LAYERS:
        d[l] = d[f"c_{l}"]
    d["w"] = d.cams_c
    # local day for daily dose (all stations are UTC+8..+10; nights are excluded anyway)
    d["day"] = (pd.to_datetime(d.time) + pd.Timedelta(hours=9)).dt.date
    return d.reset_index(drop=True)


def clear_mask(d):
    return (d.kc_sat > 0.97) & (d.kc_sat < 1.1)


# ---------------------------------------------------------------- fits

def fit_scale(d):
    c = d[clear_mask(d)]
    w = c.w
    # weighted least squares through the origin: ground ≈ s * cams_c
    return float((w * c.uvi_ground * c.cams_c).sum() / (w * c.cams_c ** 2).sum())


def sat_pred(d, s, p, kmax):
    return s * d.cams_c * np.power(d.kc_sat.clip(lower=0, upper=kmax), p)


def fit_sat(d, s):
    best = None
    for kmax in KMAX_GRID:
        def loss(p):
            e = sat_pred(d, s, p, kmax) - d.uvi_ground
            return float((d.w * e * e).sum() / d.w.sum())
        r = minimize_scalar(loss, bounds=(0.2, 2.0), method="bounded")
        if best is None or r.fun < best[2]:
            best = (float(r.x), kmax, float(r.fun))
    return best[0], best[1]


def fit_layers_ground(d, s):
    g = d.copy()
    g["y"] = (g.uvi_ground / (s * g.cams_c)).clip(upper=1.0)
    for l in LAYERS:
        g[l] = g[f"c_{l}"]
    p, _ = fit_layers(g, constrained=True)
    return p


def fit_all(d):
    s = fit_scale(d)
    p, kmax = fit_sat(d, s)
    lay = fit_layers_ground(d, s)
    return {"s": s, "p": p, "kmax": kmax, "layers": lay}


def predict_new(d, P):
    out = pd.DataFrame(index=d.index)
    out["sat_new"] = sat_pred(d, P["s"], P["p"], P["kmax"])
    out["fallback_new"] = P["s"] * d.cams_c * layered_cmf(P["layers"], d[LAYERS].to_numpy())
    out["cams_scaled"] = P["s"] * d.cams_a
    return out


def loco_predictions(d):
    parts = []
    for city in sorted(d.city.unique()):
        P = fit_all(d[d.city != city])
        parts.append(predict_new(d[d.city == city], P))
    return pd.concat(parts).loc[d.index]


# ---------------------------------------------------------------- scoring

def score(d, col):
    e = d[col] - d.uvi_ground
    days = d.groupby(["city", "day"]).agg(pred=(col, "sum"), obs=("uvi_ground", "sum"), n=("uvi_ground", "size"))
    days = days[(days.n >= 6) & (days.obs > 3)]
    rel = days.pred / days.obs - 1
    return {
        "rmse": float(np.sqrt((e ** 2).mean())),
        "bias_pct": float(100 * e.sum() / d.uvi_ground.sum()),
        "r": float(np.corrcoef(d[col], d.uvi_ground)[0, 1]),
        "dose_mape": float(100 * rel.abs().mean()),
        "dose_bias": float(100 * rel.mean()),
        "under_days": float(100 * (days.pred < UNDER * days.obs).mean()),
        "days": int(len(days)),
    }


MODES = [
    ("pred_forecast", "Open-Meteo forecast UVI (app default, no satellite)"),
    ("pred_physics", "Physics: Allaart x layered CMF (current fit)"),
    ("cams_scaled", "CAMS all-sky UVI x s (LOCO)"),
    ("fallback_new", "NEW fallback: s x CAMS clear x layered CMF refit on ground (LOCO)"),
    ("sat_new", "NEW satellite: s x CAMS clear x k_c^p, no delay (LOCO)"),
    ("pred_app_nwp", "App as shipped (TS readUV), no satellite (in-sample)"),
    ("pred_sat_d0", "App as shipped, satellite, no delay (in-sample)"),
    ("pred_sat_d1", "App as shipped, satellite 1 h late (in-sample)"),
    ("pred_sat_d2", "App as shipped, satellite 2 h late (in-sample)"),
]


def live_scores(d):
    L = pd.read_csv(HERE / "data" / "ground" / "live_ground.csv").drop(columns=["uvi_ground"])
    x = d[["city", "time", "day", "uvi_ground"]].merge(L, on=["city", "time"]).dropna()
    cols = [c for c in L.columns if c not in ("city", "time")]
    return {c: score(x, c) for c in cols}


def pick_live(ls):
    import re
    cands = []
    for name, sc in ls.items():
        m = re.fullmatch(r"native_w(\d+)_tau([\d.]+)", name)  # native, 60-min latency
        if m and sc["under_days"] <= LIVE_MAX_UNDER_PCT:
            cands.append((sc["dose_mape"], name, int(m.group(1)), float(m.group(2))))
    _, name, w, tau = min(cands)
    return name, w, tau


def main():
    d = load()
    P = fit_all(d)
    ls = live_scores(d)
    live_name, live_w, live_tau = pick_live(ls)
    dband, cover = dose_band()
    d = d.join(loco_predictions(d))
    scores = {k: score(d, k) for k, _ in MODES}

    # per-station LOCO for the new satellite chain and today's default
    per_city = {
        c: {k: score(g, k) for k in ("pred_forecast", "sat_new", "fallback_new")}
        for c, g in d.groupby("city")
    }
    clear = d[clear_mask(d)]
    band = pd.cut(clear.sza, [0, 20, 35, 50, 65, 85])
    clear_by_sza = {
        str(b): {
            "n": int(len(g)),
            "allaart": float((g.uvi_ground / g.uvi_allaart).median()),
            "om_clear": float((g.uvi_ground / g.uvi_om_clear).median()),
            "cams_scaled": float((g.uvi_ground / (P["s"] * g.cams_c)).median()),
        }
        for b, g in clear.groupby(band, observed=True)
    }
    month = clear.time.str[5:7]
    clear_by_month = {
        m: {
            "allaart": float((g.uvi_ground / g.uvi_allaart).median()),
            "cams_scaled": float((g.uvi_ground / (P["s"] * g.cams_c)).median()),
        }
        for m, g in clear.groupby(month)
    }

    lay = P["layers"]
    params = {
        "camsClearScale": round(P["s"], 4),
        "uvSwExponent": round(P["p"], 4),
        "kcMax": P["kmax"],
        "persistTauH": live_tau,
        "persistWindowMin": live_w,
        "doseBand": dband,
        "layers": {
            "a": {l: round(float(lay[i]), 4) for i, l in enumerate(LAYERS)},
            "b": {l: round(float(lay[3 + i]), 4) for i, l in enumerate(LAYERS)},
        },
    }
    sn, sf = scores["sat_new"], scores["pred_forecast"]
    (ROOT / "app" / "src" / "model" / "groundParams.ts").write_text(
        f"""// GENERATED by model-fit/ground_fit.py. Do not edit by hand.
// Fitted to ARPANSA ground radiometers ({d.city.nunique()} stations, {len(d)} daytime hours, 2024),
// weighted by clear-sky UVI. All scores are leave-one-station-out.
//   UVI_clear = camsClearScale * CAMS uv_index_clear_sky (mean of the hour's two edges)
//   satellite: UVI = UVI_clear * min(k_c, kcMax)^uvSwExponent
//   fallback:  UVI = UVI_clear * (1 - sum_i a_i c_i^b_i)
export const GROUND_PARAMS = {json.dumps(params, indent=2)} as const;

export const GROUND_FIT_INFO = {{
  stations: {d.city.nunique()},
  hours: {len(d)},
  satDoseMape: {sn['dose_mape']:.1f},
  satUnderDaysPct: {sn['under_days']:.1f},
  forecastDoseMape: {sf['dose_mape']:.1f},
  forecastUnderDaysPct: {sf['under_days']:.1f},
  liveDoseMape: {ls[live_name]['dose_mape']:.1f},
  liveUnderDaysPct: {ls[live_name]['under_days']:.1f},
  target: 'ARPANSA broadband UV radiometers (data.gov.au, CC BY 2.5 AU)',
}} as const;
"""
    )

    L = []
    L.append("# Ground-truth backtest (generated by ground_fit.py)\n")
    L.append(
        f"**Ground truth:** ARPANSA one-minute UV Index from calibrated radiometers, averaged to hours. "
        f"{d.city.nunique()} stations ({', '.join(sorted(d.city.unique()))}), four 3-week windows in 2024 "
        f"(Jan/Apr/Jul/Oct), {len(d)} daytime hours, {sn['days']} station-days.\n"
    )
    L.append(
        "**Model side:** the app's own `readUV`, fed with what the app would have fetched for the privacy cell "
        "(Open-Meteo historical forecast, satellite GHI on the 5x5 lattice, CAMS via the air-quality API). "
        "Fitted rows are **leave-one-station-out**.\n"
    )
    L.append("## Scorecard\n")
    L.append(
        "Daily dose = sum of hourly UVI over the station-day. *Under-days* = share of days where predicted dose "
        f"< {int(UNDER * 100)}% of measured: the dangerous direction for a burn app.\n"
    )
    L.append("| source | hourly RMSE (UVI) | hourly bias | r | daily dose error | daily dose bias | under-days |")
    L.append("|---|---|---|---|---|---|---|")
    for k, label in MODES:
        s = scores[k]
        L.append(
            f"| {label} | {s['rmse']:.2f} | {s['bias_pct']:+.1f}% | {s['r']:.3f} | {s['dose_mape']:.1f}% | "
            f"{s['dose_bias']:+.1f}% | {s['under_days']:.1f}% |"
        )
    L.append("\n## Live: what the app knows in real time\n")
    L.append(
        "The rows above give the satellite every slot. Live, the app only has slots that have *arrived*: Open-Meteo "
        "serves Himawari ~55–60 min behind real time (measured Nov 2026). ground.ts samples the app every 10 min through "
        "each ground hour with only the data available at that instant, then persists the last value with weight "
        "e^(−lag/τ) and blends to the no-satellite chain.\n"
    )
    L.append(
        f"Rule: lowest daily dose error among native-data variants at 60-min latency with under-days <= "
        f"{LIVE_MAX_UNDER_PCT}%. Picked **{live_name}** (window {live_w} min, τ = {live_tau:g} h).\n"
    )
    L.append("| variant | daily dose error | daily dose bias | under-days | hourly RMSE |")
    L.append("|---|---|---|---|---|")
    show = [
        ("pred_app_nwp", "no satellite"),
        ("hourly_tau2", "hourly data, τ 2 h (before step 4)"),
        ("hourly_tau4", "hourly data, τ 4 h"),
        ("native_w10_tau1", "native, 10-min window, τ 1 h"),
        ("native_w10_tau2", "native, 10-min window, τ 2 h"),
        ("native_w10_tau4", "native, 10-min window, τ 4 h"),
        ("native_w10_tau8", "native, 10-min window, τ 8 h"),
        ("native_w30_tau4", "native, 30-min window, τ 4 h"),
        ("native_w60_tau4", "native, 60-min window, τ 4 h"),
        ("native_w30_tau4_lat30", "native, τ 4 h, if latency were 30 min"),
        ("native_w30_tau4_lat90", "native, τ 4 h, if latency were 90 min"),
        ("native_hindcast", "native, all data arrived (after-the-fact)"),
    ]
    for k, label in show:
        v = ls[k]
        L.append(f"| {label} | {v['dose_mape']:.1f}% | {v['dose_bias']:+.1f}% | {v['under_days']:.1f}% | {v['rmse']:.2f} |")
    t12 = ls["native_w10_tau12"]
    L.append(
        f"\nLonger τ keeps lowering error slightly but raises under-days (τ 12 h: {t12['dose_mape']:.1f}% / "
        f"{t12['under_days']:.1f}%), so the safety cap decides.\n"
    )
    L.append("\n## Dose band for time-to-burn (projections from data as of the start)\n")
    L.append(
        f"From each start (every 30 min), predicted dose over the next H hours with only data available then, vs measured. "
        f"Band = {int(BAND_Q[0] * 100)}th–{int(BAND_Q[1] * 100)}th percentile of measured/predicted, burn-relevant windows "
        f"(mean predicted UVI >= {BAND_MIN_MEAN_UVI}). The app multiplies the whole dose by `hi` for the cautious time and "
        "alerts, and by `lo` for the optimistic time.\n"
    )
    L.append("| source | " + " | ".join(f"{h:g} h" for h in dband["sat"]["h"]) + " | LOCO inside band | LOCO above band (worst station) |")
    L.append("|---|" + "---|" * len(dband["sat"]["h"]) + "---|---|")
    for cls in BAND_CLASSES:
        b, c = dband[cls], cover[cls]
        cells = " | ".join(f"{lo:.2f}–{hi:.2f}" for lo, hi in zip(b["lo"], b["hi"]))
        L.append(f"| {cls} | {cells} | {100 * c['inside']:.0f}% | {100 * c['above']:.0f}% ({c['worst'][0]} {100 * c['worst'][1]:.0f}%) |")
    L.append(
        "\nNominal: 80% inside, 10% above. Averaged over held-out stations the band is close to nominal, but at single "
        "stations measured dose lands above it up to the worst-station figure shown. Treat the cautious time as \"plan for "
        "this\", not a worst case.\n"
    )
    L.append("\n## Fitted parameters (all stations)\n")
    L.append(f"- CAMS clear-sky scale s = **{P['s']:.3f}** (CAMS clear-sky reads {100 * (1 / P['s'] - 1):.0f}% high)")
    L.append(
        f"- Satellite exponent p = **{P['p']:.3f}** with k_c cap {P['kmax']} "
        f"(shipped guess was 0.6, cap 1.2). Overcast k_c = 0.3 gives CMF {0.3 ** P['p']:.2f}."
    )
    L.append(
        "- Layered CMF on ground: "
        + " | ".join(f"{l}: a={lay[i]:.3f}, b={lay[3 + i]:.2f}" for i, l in enumerate(LAYERS))
        + f" (full overcast CMF {1 - lay[:3].sum():.2f})"
    )
    L.append("\n## Clear-sky curves vs ground (satellite-clear hours, median ground / model)\n")
    L.append("| SZA band | n | Allaart (300 DU) | Open-Meteo clear | s x CAMS clear |")
    L.append("|---|---|---|---|---|")
    for b, v in clear_by_sza.items():
        L.append(f"| {b} | {v['n']} | {v['allaart']:.3f} | {v['om_clear']:.3f} | {v['cams_scaled']:.3f} |")
    L.append("\n| month (2024) | Allaart (300 DU) | s x CAMS clear |")
    L.append("|---|---|---|")
    for m, v in clear_by_month.items():
        L.append(f"| {m} | {v['allaart']:.3f} | {v['cams_scaled']:.3f} |")
    L.append(
        "\nAllaart's error follows the Southern Hemisphere ozone cycle (October high ozone → reads high; April low → reads "
        "low), because the app uses a fixed 300 DU. CAMS carries forecast ozone and aerosol, so its ratio is flat across "
        "months and needs only one scale factor.\n"
    )
    L.append("## Per station (leave-one-station-out)\n")
    L.append("| station | forecast dose error | forecast under-days | NEW satellite dose error | NEW satellite under-days | NEW fallback dose error |")
    L.append("|---|---|---|---|---|---|")
    for c, v in per_city.items():
        L.append(
            f"| {c} | {v['pred_forecast']['dose_mape']:.1f}% | {v['pred_forecast']['under_days']:.1f}% | "
            f"{v['sat_new']['dose_mape']:.1f}% | {v['sat_new']['under_days']:.1f}% | {v['fallback_new']['dose_mape']:.1f}% |"
        )
    L.append("\n## Limitations (say these out loud)\n")
    L.append(
        "- All stations are in Australia: low aerosol and Southern Hemisphere ozone. The CAMS scale and satellite exponent "
        "are fitted there; no US or European ground station is in the fit yet.\n"
        "- Broadband radiometers have their own ~5% calibration uncertainty.\n"
        "- The historical forecast is stitched from short-lead runs, which flatters the forecast compared with a 2-day-ahead plan.\n"
        "- Hourly means hide minute-scale broken-cloud spikes.\n"
    )
    (HERE / "ground_report.md").write_text("\n".join(L) + "\n")
    print("\n".join(L[:20]))
    print(json.dumps(params, indent=2))


if __name__ == "__main__":
    main()
