import { strict as assert } from 'assert';
import { test } from 'node:test';

// pipeScore / pipeFrontier are global-free (pipeScore takes its sort metric as a
// param; pipeFrontier takes both ceilings). pipelineCapacity delegates the FTE·month
// roll-up to a synthetic engUtil map we inject through globalThis (its impure inputs —
// _buildEngUtil / _memo / _monthsKey / t — are the seam; _costCounts is the real,
// pure one from helpers.js). Both source modules are load-clean, so a static import
// only defines the functions; the shims below are read at CALL time.
import { pipeScore, pipeFrontier } from '../src/sections/pipeline.js';
import { _costCounts } from '../src/core/helpers.js';
import { pipelineCapacity } from '../src/sections/dashboard.js';

// A candidate ranking row — only the fields pipeScore / pipeFrontier read.
function row(over){
  return Object.assign({ riskAdjNpv:0, invested:0, fteMonths:0 }, over||{});
}

/* ── pipeScore ──────────────────────────────────────────────────────── */

test('pipeScore: npvPerFte = risk-adj NPV per FTE·month (default metric)', () => {
  assert.equal(pipeScore(row({riskAdjNpv:1200, fteMonths:12}), 'npvPerFte'), 100);
  // no sort arg → same default metric
  assert.equal(pipeScore(row({riskAdjNpv:1200, fteMonths:12})), 100);
});

test('pipeScore: npvPerEur = risk-adj NPV per € invested', () => {
  assert.equal(pipeScore(row({riskAdjNpv:500, invested:1000}), 'npvPerEur'), 0.5);
});

test('pipeScore: npv = raw risk-adj NPV', () => {
  assert.equal(pipeScore(row({riskAdjNpv:777, invested:1000, fteMonths:12}), 'npv'), 777);
});

test('pipeScore: null NPV sinks last (-Infinity) under every metric', () => {
  assert.equal(pipeScore(row({riskAdjNpv:null, fteMonths:5}), 'npvPerFte'), -Infinity);
  assert.equal(pipeScore(row({riskAdjNpv:null, invested:5}), 'npvPerEur'), -Infinity);
  assert.equal(pipeScore(row({riskAdjNpv:null}), 'npv'), -Infinity);
});

test('pipeScore: zero effort — positive value ranks worst, non-positive keeps its NPV', () => {
  // per-FTE with no demand estimate: a positive return can't be divided → sinks (-Inf),
  // so it never jumps the queue on a missing denominator; a <=0 return stays as its NPV.
  assert.equal(pipeScore(row({riskAdjNpv:900, fteMonths:0}), 'npvPerFte'), -Infinity);
  assert.equal(pipeScore(row({riskAdjNpv:-50, fteMonths:0}), 'npvPerFte'), -50);
});

test('pipeScore: zero € — positive value ranks best, non-positive keeps its NPV', () => {
  assert.equal(pipeScore(row({riskAdjNpv:900, invested:0}), 'npvPerEur'), Infinity);
  assert.equal(pipeScore(row({riskAdjNpv:-50, invested:0}), 'npvPerEur'), -50);
});

/* ── pipeFrontier ───────────────────────────────────────────────────── */

test('pipeFrontier: funds down the list until the FIRST breach, then stops (greedy)', () => {
  const rows = [
    row({invested:100, fteMonths:10}),
    row({invested:100, fteMonths:10}),
    row({invested:100, fteMonths:10}),
  ];
  // budget 250 → first two fit (200), third would hit 300 > 250 → cut.
  const out = pipeFrontier(rows, 250, null);
  assert.deepEqual(rows.map(r=>r.funded), [true, true, false]);
  assert.equal(out.cumInv, 200);
  assert.equal(out.cumFte, 20);
  // cumulatives freeze at the cut: funded rows carry the running sum, the rest the frozen total.
  assert.deepEqual(rows.map(r=>r.cumInv), [100, 200, 200]);
});

test('pipeFrontier: capacity ceiling can bind before budget', () => {
  const rows = [ row({invested:10, fteMonths:8}), row({invested:10, fteMonths:8}) ];
  const out = pipeFrontier(rows, 1e9, 10);   // huge budget, 10 FTE·months free
  assert.deepEqual(rows.map(r=>r.funded), [true, false]);   // 8 fits, 16 > 10
  assert.equal(out.cumFte, 8);
});

test('pipeFrontier: null budget = capacity-only ceiling', () => {
  const rows = [ row({invested:1e6, fteMonths:5}), row({invested:1e6, fteMonths:5}) ];
  pipeFrontier(rows, null, 12);              // € ignored entirely
  assert.deepEqual(rows.map(r=>r.funded), [true, true]);   // 10 <= 12, budget never binds
});

test('pipeFrontier: free capacity <=0 is treated as no-capacity-limit', () => {
  const rows = [ row({invested:1, fteMonths:100}), row({invested:1, fteMonths:100}) ];
  pipeFrontier(rows, null, 0);               // 0 free → capacity check disabled (budget null too)
  assert.deepEqual(rows.map(r=>r.funded), [true, true]);
});

test('pipeFrontier: once the cut fires, later rows stay deferred even if they would fit', () => {
  const rows = [
    row({invested:100, fteMonths:0}),   // fits
    row({invested:999, fteMonths:0}),   // breaks the 200 budget → cut here
    row({invested:1,   fteMonths:0}),   // would fit alone, but the greedy stop already fired
  ];
  pipeFrontier(rows, 200, null);
  assert.deepEqual(rows.map(r=>r.funded), [true, false, false]);
});

test('pipeFrontier: missing invested/fteMonths default to 0 (no NaN cumulatives)', () => {
  const rows = [ {}, {} ];
  const out = pipeFrontier(rows, 100, 100);
  assert.deepEqual(rows.map(r=>r.funded), [true, true]);
  assert.equal(out.cumInv, 0);
  assert.equal(out.cumFte, 0);
});

/* ── pipeFrontier — per-discipline ceiling (byGroup + capByGroup) ────── */

test('pipeFrontier: a candidate over ONE discipline is deferred though budget + total fit', () => {
  const rows = [ row({invested:1, fteMonths:5, byGroup:{eng:10}}) ];
  pipeFrontier(rows, 1e9, 1000, { eng:3 });   // huge €, huge total free, but only 3 free in eng
  assert.equal(rows[0].funded, false);
  assert.deepEqual(rows[0].groupBreach, ['eng']);
});

test('pipeFrontier: a candidate whose disciplines all fit is funded (no breach flag)', () => {
  const rows = [ row({invested:1, fteMonths:4, byGroup:{eng:2, design:2}}) ];
  pipeFrontier(rows, 1e9, 1000, { eng:5, design:5 });
  assert.equal(rows[0].funded, true);
  assert.equal(rows[0].groupBreach, undefined);
});

test('pipeFrontier: discipline demand accumulates across funded rows', () => {
  const rows = [ row({fteMonths:3, byGroup:{eng:3}}), row({fteMonths:3, byGroup:{eng:3}}) ];
  const out = pipeFrontier(rows, null, 1000, { eng:5 });   // 3 fits, 3+3=6 > 5
  assert.deepEqual(rows.map(r=>r.funded), [true, false]);
  assert.deepEqual(rows[1].groupBreach, ['eng']);
  assert.equal(out.cumByGroup.eng, 3);
});

test('pipeFrontier: omitting capByGroup keeps the plain total-only behaviour', () => {
  const rows = [ row({fteMonths:5, byGroup:{eng:999}}) ];
  pipeFrontier(rows, null, 1000);              // no 4th arg → per-discipline check skipped
  assert.equal(rows[0].funded, true);
});

test('pipeFrontier: a discipline absent from capByGroup carries no ceiling', () => {
  const rows = [ row({fteMonths:5, byGroup:{unknown:999}}) ];
  pipeFrontier(rows, null, 1000, { eng:1 });   // "unknown" not in the map → unconstrained
  assert.equal(rows[0].funded, true);
  assert.equal(rows[0].groupBreach, undefined);
});

test('pipeFrontier: multiple breached disciplines are all listed', () => {
  const rows = [ row({fteMonths:20, byGroup:{eng:10, design:10}}) ];
  pipeFrontier(rows, null, 1000, { eng:3, design:3 });
  assert.equal(rows[0].funded, false);
  assert.deepEqual(rows[0].groupBreach.slice().sort(), ['design','eng']);
});

/* ── pipelineCapacity (FTE·month roll-up) ───────────────────────────── */

// Wire the impure seam: a synthetic engUtil map stands in for _buildEngUtil, so we
// exercise the supply/engaged/free arithmetic on known inputs. Set before any call.
function withCapacity(engUtil, months, fn){
  const g = globalThis;
  const saved = { _memo:g._memo, _monthsKey:g._monthsKey, _buildEngUtil:g._buildEngUtil, _costCounts:g._costCounts, t:g.t };
  g._memo = (k, f) => f();                       // passthrough (no caching in tests)
  g._monthsKey = (m) => m.join(',');
  g._buildEngUtil = () => engUtil;               // inject the synthetic roster
  g._costCounts = _costCounts;                    // the real, pure predicate
  g.t = (s) => s;
  try { return fn(); }
  finally { Object.assign(g, saved); }
}

// One engineer's engUtil entry. status: per-month 'a'ctive / 'm'edical / 'r'esigned.
function eu(over){
  return Object.assign({
    eng:{ excludeFromCalc:false },
    grp:'Core', grpId:'g1', grpColor:'#fff',
    monthAllocs:{}, monthStatus:{},
  }, over||{});
}

test('pipelineCapacity: supply = 1 per active person-month; free = supply − engaged', () => {
  const months = ['2026-01','2026-02'];
  const roster = {
    a: eu({ monthAllocs:{'2026-01':0.5, '2026-02':1} }),   // engaged 0.5 + 1
    b: eu({ monthAllocs:{'2026-01':0,   '2026-02':0} }),   // idle
  };
  const cap = withCapacity(roster, months, () => pipelineCapacity(months));
  assert.equal(cap.supply, 4);                 // 2 people × 2 months
  assert.equal(cap.engaged, 1.5);              // 0.5 + 1 (b contributes 0)
  assert.equal(cap.free, 2.5);                 // 4 − 1.5
  assert.equal(cap.people, 2);
});

test('pipelineCapacity: engaged caps a month at 1 FTE, demand keeps the overflow', () => {
  const months = ['2026-01'];
  const roster = { a: eu({ monthAllocs:{'2026-01':1.4} }) };   // 140% loaded
  const cap = withCapacity(roster, months, () => pipelineCapacity(months));
  assert.equal(cap.supply, 1);
  assert.equal(cap.engaged, 1);                // min(1.4, 1)
  assert.ok(Math.abs(cap.demand - 1.4) < 1e-9);  // raw demand preserved
  assert.ok(Math.abs(cap.over - 0.4) < 1e-9);    // demand − engaged (float-tolerant)
  assert.equal(cap.free, 0);                   // no bench headroom
});

test('pipelineCapacity: a fully medical/resigned month with zero alloc adds no supply', () => {
  const months = ['2026-01','2026-02'];
  const roster = {
    a: eu({ monthStatus:{'2026-01':'m'}, monthAllocs:{'2026-01':0, '2026-02':1} }),
  };
  const cap = withCapacity(roster, months, () => pipelineCapacity(months));
  assert.equal(cap.supply, 1);                 // only 2026-02 counts (Jan is inactive)
  assert.equal(cap.engaged, 1);
  assert.equal(cap.free, 0);
});

test('pipelineCapacity: an on-leave month that is STILL allocated keeps counting', () => {
  const months = ['2026-01'];
  const roster = { a: eu({ monthStatus:{'2026-01':'r'}, monthAllocs:{'2026-01':0.3} }) };
  const cap = withCapacity(roster, months, () => pipelineCapacity(months));
  assert.equal(cap.supply, 1);                 // resigned but still holds work → active
  assert.equal(cap.engaged, 0.3);
});

test('pipelineCapacity: excludeFromCalc people are dropped before the roll-up', () => {
  const months = ['2026-01'];
  const roster = {
    a: eu({ monthAllocs:{'2026-01':1} }),
    b: eu({ eng:{ excludeFromCalc:true }, monthAllocs:{'2026-01':1} }),
  };
  const cap = withCapacity(roster, months, () => pipelineCapacity(months));
  assert.equal(cap.people, 1);                 // b excluded
  assert.equal(cap.supply, 1);
  assert.equal(cap.engaged, 1);
});

test('pipelineCapacity: byGroup splits supply/engaged/free per function', () => {
  const months = ['2026-01'];
  const roster = {
    a: eu({ grpId:'g1', grp:'Core',   monthAllocs:{'2026-01':1} }),
    b: eu({ grpId:'g2', grp:'Design', monthAllocs:{'2026-01':0} }),
  };
  const cap = withCapacity(roster, months, () => pipelineCapacity(months));
  assert.equal(cap.byGroup.g1.engaged, 1);
  assert.equal(cap.byGroup.g1.free, 0);
  assert.equal(cap.byGroup.g2.free, 1);        // Design fully idle
  assert.equal(cap.byGroup.g2.people, 1);
});

test('pipelineCapacity: no months → empty roll-up (all zero)', () => {
  const cap = withCapacity({ a: eu({ monthAllocs:{'2026-01':1} }) }, [], () => pipelineCapacity([]));
  assert.equal(cap.supply, 0);
  assert.equal(cap.free, 0);
  assert.equal(cap.months, 0);
});
