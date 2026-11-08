/**
 * Calibration simulation: does the Bayesian MED posterior learn real skin, for
 * every Fitzpatrick type, better than the old step rule (updateCUser)?
 *
 *   node model-fit/calibration_sim.ts      → model-fit/calibration_report.md
 *
 * Virtual users: a stated type, a true MED, 30 outings, a next-morning report
 * after each. Runs the app's own calibration code (app/src/model/calibration.ts).
 *
 * Two worlds:
 *   'as assumed'  truth follows the prior and report model the app assumes. A
 *                 self-consistency check, not validation against people.
 *   'harsher'     the assumptions are wrong in the unsafe direction: wider
 *                 within-type spread, self-reported type right only 50% of the
 *                 time, noisier reports, more random answers, worse sunscreen.
 *
 * Outing policy (same for every method, so estimators are compared fairly): the
 * user stays out until the app's central estimate says f × their MED, with f
 * log-uniform in [0.3, 1.4] (people leave early or overstay). 40% of days with
 * sunscreen.
 *
 * Seeded RNG: results are reproducible.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addReport,
  doseBand,
  MED_SED,
  PRIOR_LOG_SIGMA,
  priorGrid,
  summarize,
  updateCUser,
  type DoseReport,
  type LikelihoodOpts,
  type MedPosterior,
  type Redness,
  type SkinType,
} from '../app/src/model/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const USERS = 3000;
const DAYS = 30;
const CHECKPOINTS = [0, 3, 7, 14, 30];
const TYPES: SkinType[] = [1, 2, 3, 4, 5, 6];
const Z90 = 1.2816;

// ---------------------------------------------------------------- RNG (mulberry32 + Box–Muller)
let seed = 20261108;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randn = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

interface World {
  name: string;
  statedRight: number; // P(true type = stated)
  sigmaWithin: (k: SkinType) => number;
  reportSigma: number;
  sunscreenSigma: number;
  outlierP: number;
}
const WORLDS: World[] = [
  { name: 'as assumed', statedRight: 0.7, sigmaWithin: (k) => PRIOR_LOG_SIGMA[k], reportSigma: 0.3, sunscreenSigma: 0.5, outlierP: 0.05 },
  { name: 'harsher', statedRight: 0.5, sigmaWithin: (k) => PRIOR_LOG_SIGMA[k] + 0.15, reportSigma: 0.45, sunscreenSigma: 0.7, outlierP: 0.1 },
];

// UV error for a typical 2 h outing with satellite (the app's measured band)
const UV_BAND = doseBand('sat', 2);
const UV_SIGMA = Math.log(UV_BAND.hi / UV_BAND.lo) / (2 * Z90);

function trueType(stated: SkinType, w: World): SkinType {
  const u = rand();
  if (u < w.statedRight) return stated;
  const down = stated > 1;
  const up = stated < 6;
  if (down && up) return (u < w.statedRight + (1 - w.statedRight) / 2 ? stated - 1 : stated + 1) as SkinType;
  return (down ? stated - 1 : stated + 1) as SkinType;
}

function report(trueDose: number, M: number, w: World): Redness {
  if (rand() < w.outlierP) return (['none', 'pink', 'burned'] as const)[Math.floor(rand() * 3)];
  const e = Math.log(trueDose / M) + w.reportSigma * randn();
  return e < 0 ? 'none' : e < Math.log(2) ? 'pink' : 'burned';
}

/** Cautious personal MED for a posterior: central ÷ the combined UV + skin band (as the app's alerts use). */
const cautiousMed = (p: MedPosterior) => p.median / Math.exp(Math.sqrt(Math.log(UV_BAND.hi) ** 2 + p.logSpread.lo ** 2));

interface Acc {
  err: number[]; // |ln est − ln true|
  over: number; // est > 1.25 × true
  covered: number;
  q10Fail: number;
  pinkCentral: number; // leaving at central 100% → true dose ≥ true MED
  pinkCautious: number;
  n: number;
}
const newAcc = (): Acc => ({ err: [], over: 0, covered: 0, q10Fail: 0, pinkCentral: 0, pinkCautious: 0, n: 0 });
type Method = 'prior' | 'old' | 'bayes';

/** Sensitivity: the app's settings vs wider "robust" ones. */
const SETTINGS: { name: string; opts: LikelihoodOpts }[] = [
  { name: 'shipped (0.30 / 0.50 / 5%)', opts: {} },
  { name: 'robust (0.45 / 0.70 / 10%)', opts: { reportSigma: 0.45, sunscreenSigma: 0.7, outlierP: 0.1 } },
];

function simulate(w: World, opts: LikelihoodOpts = {}) {
  const out: Record<number, Record<number, Record<Method, Acc>>> = {};
  for (const k of TYPES) {
    out[k] = {};
    for (const c of CHECKPOINTS) out[k][c] = { prior: newAcc(), old: newAcc(), bayes: newAcc() };
    const prior = summarize(priorGrid(k), 0);
    for (let u = 0; u < USERS; u++) {
      const tk = trueType(k, w);
      const M = MED_SED[tk] * Math.exp(w.sigmaWithin(tk) * randn());
      let cOld = 1;
      const lp = priorGrid(k);
      let post = prior;
      const record = (day: number) => {
        const a = out[k][day];
        const ests: [Method, number][] = [['prior', prior.median], ['old', MED_SED[k] * cOld], ['bayes', post.median]];
        for (const [m, est] of ests) {
          const acc = a[m];
          acc.err.push(Math.abs(Math.log(est / M)));
          if (est > 1.25 * M) acc.over++;
          // leave when the central estimate hits 100%: does the real dose reach the real MED?
          if (est * Math.exp(UV_SIGMA * randn()) >= M) acc.pinkCentral++;
          acc.n++;
        }
        const pb = a.bayes;
        if (post.q10 <= M && M <= post.q90) pb.covered++;
        if (post.q10 > M) pb.q10Fail++;
        if (cautiousMed(post) * Math.exp(UV_SIGMA * randn()) >= M) pb.pinkCautious++;
        const pp = a.prior;
        if (prior.q10 <= M && M <= prior.q90) pp.covered++;
        if (prior.q10 > M) pp.q10Fail++;
        if (cautiousMed(prior) * Math.exp(UV_SIGMA * randn()) >= M) pp.pinkCautious++;
      };
      record(0);
      for (let day = 1; day <= DAYS; day++) {
        const f = Math.exp(Math.log(0.3) + (Math.log(1.4) - Math.log(0.3)) * rand());
        const sunscreen = rand() < 0.4;
        // each method plans the outing from its own estimate; the report comes from the true dose
        const plan = (est: number) => f * est;
        const truth = (D: number) => D * Math.exp(UV_SIGMA * randn() + (sunscreen ? w.sunscreenSigma * randn() : 0));
        // old rule
        const dOld = plan(MED_SED[k] * cOld);
        cOld = updateCUser(cOld, { predictedFraction: dOld / (MED_SED[k] * cOld), redness: report(truth(dOld), M, w) });
        // Bayesian
        const dB = plan(post.median);
        const r: DoseReport = { doseSED: dB, doseLogSigma: UV_SIGMA, sunscreen, redness: report(truth(dB), M, w) };
        addReport(lp, r, opts);
        post = summarize(lp, day);
        if (CHECKPOINTS.includes(day)) record(day);
      }
    }
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

const L: string[] = ['# Calibration simulation (generated by calibration_sim.ts)\n'];
L.push(
  `${USERS} virtual users per stated skin type, ${DAYS} outings each, next-morning report after each. ` +
    `UV error per outing from the measured band (satellite, 2 h: log-SD ${UV_SIGMA.toFixed(2)}). Seeded, reproducible.\n`,
);
L.push(
  '- **error**: median factor between estimated and true MED (10% = typically off by ×1.10).\n' +
    '- **over-trust**: estimated MED > 1.25 × true, i.e. the app thinks you have 25%+ more time than you do.\n' +
    '- **pink at 100%**: if you leave exactly when the app says 100%, how often the real dose still reaches your real MED. ' +
    '"central" = the single estimate; "cautious" = what the Bayesian alerts use (UV and skin uncertainty combined).\n' +
    '- **80% interval**: how often the true MED is inside the posterior 10th–90th percentile (should be ~80%).\n',
);

for (const w of WORLDS) {
  const res = simulate(w);
  L.push(`\n## World: ${w.name}\n`);
  if (w.name === 'harsher') L.push('Within-type spread +0.15, stated type right 50%, report noise 0.45, sunscreen noise 0.7, 10% random answers.\n');
  for (const k of TYPES) {
    L.push(`\n### Type ${['I', 'II', 'III', 'IV', 'V', 'VI'][k - 1]} (prior median ${MED_SED[k]} SED)\n`);
    L.push('| check-ins | error: old rule | error: Bayes | over-trust: old | over-trust: Bayes | pink at 100%: old | pink at 100%: Bayes central | pink at 100%: Bayes cautious | 80% interval holds truth |');
    L.push('|---|---|---|---|---|---|---|---|---|');
    for (const c of CHECKPOINTS) {
      const a = res[k][c];
      const e = (acc: Acc) => pct(Math.exp(median(acc.err)) - 1);
      L.push(
        `| ${c} | ${e(a.old)} | ${e(a.bayes)} | ${pct(a.old.over / a.old.n)} | ${pct(a.bayes.over / a.bayes.n)} | ` +
          `${pct(a.old.pinkCentral / a.old.n)} | ${pct(a.bayes.pinkCentral / a.bayes.n)} | ${pct(a.bayes.pinkCautious / a.bayes.n)} | ${pct(a.bayes.covered / a.bayes.n)} |`,
      );
    }
  }
}
L.push('\n## Sensitivity: report-noise settings (after 30 check-ins, averaged over types I–VI)\n');
L.push('| world | likelihood settings (report σ / sunscreen σ / random answers) | error | over-trust | pink at cautious 100% | 80% interval holds truth |');
L.push('|---|---|---|---|---|---|');
for (const w of WORLDS) {
  for (const st of SETTINGS) {
    const res = simulate(w, st.opts);
    const all = TYPES.map((k) => res[k][30].bayes);
    const err = all.flatMap((a) => a.err);
    const sum = (f: (a: Acc) => number) => all.reduce((x, a) => x + f(a), 0) / all.reduce((x, a) => x + a.n, 0);
    L.push(
      `| ${w.name} | ${st.name} | ${pct(Math.exp(median(err)) - 1)} | ${pct(sum((a) => a.over))} | ${pct(sum((a) => a.pinkCautious))} | ${pct(sum((a) => a.covered))} |`,
    );
  }
}
L.push(
  '\nShipped settings are kept: if the assumptions hold, robust settings under-react to real redness (over-trust and ' +
    'cautious-pink rise). If reality is harsher, shipped settings give too-narrow intervals but err on the safe side.\n',
);
L.push(
  '\n## Limits\n\n- Simulated people, not real ones. The "harsher" world shows what happens if the assumptions are wrong; it is not data.\n' +
    '- Real check-in answers may be biased (people forget, or under-report mild pink), which no world here models.\n' +
    '- Types V–VI rarely reach a burn dose, so most reports are "none" and learning is slow by nature.\n',
);
writeFileSync(join(HERE, 'calibration_report.md'), L.join('\n') + '\n');
console.log(L.join('\n'));
