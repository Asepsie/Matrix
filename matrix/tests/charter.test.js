import { strict as assert } from 'assert';
import { test } from 'node:test';
import { makeProject, makeCharter, makeCharterFinancials, makeDecisionCard, makeInvestmentItem, makeDemand,
  makeCostModel, makeSubsystem, makeLever, makeCostItem, makeCompetitor, makeScenario } from '../src/data/model.js';
import {
  calculateFinancials, computeNPV, computeIRR, computeYield,
  computePayback, computeBreakEvenUnits, computeCumulative, fmtEur,
  effectiveInvestment, effectiveVarCost, finUnitFactor, finUnitSym, fmtMoneyUnit,
  dtcTarget,
} from '../src/core/financial.js';

/* ── Data model ─────────────────────────────────────────────────────────── */

test('makeProject — carries a charter with the expected branches', () => {
  const p = makeProject();
  assert.ok(p.charter && typeof p.charter === 'object');
  for (const k of ['strategy','rnd','offer','procurement','industrialization','financials','decision']) {
    assert.ok(Object.prototype.hasOwnProperty.call(p.charter, k), `missing charter.${k}`);
  }
  assert.equal(p.charter.status, 'Draft');
});

test('makeCharter — no approval fields (dropped by design), euro financials', () => {
  const c = makeCharter();
  assert.ok(!('approvers' in c), 'approvals should not be modelled');
  assert.equal(c.financials.discountRate, 0.10);
  assert.deepEqual(c.financials.cashFlows, []);
});

test('makeCharter — each function is just alignment + demands; overview at top level', () => {
  const c = makeCharter();
  for (const sec of ['strategy','rnd','offer','procurement','industrialization']) {
    assert.deepEqual(Object.keys(c[sec]).sort(), ['alignment','demands']);
    assert.equal(c[sec].alignment, null);
    assert.deepEqual(c[sec].demands, []);
    assert.ok(!('owner' in c[sec]), `${sec}.owner should not exist (single-user tool)`);
  }
  // overview specifics moved to charter top level
  assert.ok('businessCase' in c && 'expectedRevenueM' in c);
});

test('makeDemand — default shape (incl. response fields)', () => {
  const d = makeDemand();
  assert.equal(d.text, '');
  assert.equal(d.dimension, '');
  assert.equal(d.mustHave, false);
  assert.equal(d.response, '');
  assert.equal(d.responseNote, '');
});

test('makeCharter — carries a costModel; sub-factories have expected shape', () => {
  const c = makeCharter();
  assert.deepEqual(c.costModel, { subsystems: [], levers: [], competitors: [] });
  assert.deepEqual(makeSubsystem(), { name:'', target:null, current:null, owner:'', include:true, items:[] });
  assert.deepEqual(makeCostItem(), { name:'', cost:0, include:true });
  assert.deepEqual(makeLever(), { name:'', subsystem:'', saving:0, status:'idea', owner:'' });
  assert.deepEqual(makeCompetitor(), { name:'', sellingPrice:0, cogs:0, volumeSaving:0, brandPremium:0 });
  const a = makeCharter(), b = makeCharter();
  assert.notEqual(a.costModel.subsystems, b.costModel.subsystems);   // independent arrays
  assert.notEqual(makeSubsystem().items, makeSubsystem().items);
});

test('dtcTarget — envelope from margin mode / target margin / entered cost', () => {
  // targetCost mode → derived max cost
  assert.equal(dtcTarget(makeCharterFinancials({ marginMode:'targetCost', pricePerUnit:50, targetMarginPct:40 })), 30);
  // compute mode but a target margin set → price × (1 − margin)
  assert.equal(dtcTarget(makeCharterFinancials({ pricePerUnit:100, targetMarginPct:30 })), 70);
  // no target → falls back to entered variable cost
  assert.equal(dtcTarget(makeCharterFinancials({ variableCostPerUnit:22 })), 22);
  // nothing defined → null
  assert.equal(dtcTarget(makeCharterFinancials()), null);
});

test('makeCharter — demand arrays are independent per call', () => {
  const a = makeCharter(), b = makeCharter();
  assert.notEqual(a.strategy.demands, b.strategy.demands);
});

test('makeCharter — nested objects/arrays are not shared between calls', () => {
  const a = makeCharter(), b = makeCharter();
  assert.notEqual(a.financials, b.financials);
  assert.notEqual(a.financials.cashFlows, b.financials.cashFlows);
  assert.notEqual(a.decision, b.decision);
  assert.notEqual(a.decision.nonNegotiables, b.decision.nonNegotiables);
  assert.notEqual(a.decision.stances, b.decision.stances);
});

test('makeDecisionCard — 4-dimension stances, all balanced by default', () => {
  const d = makeDecisionCard();
  assert.deepEqual(Object.keys(d.stances).sort(), ['features','productCost','projectCost','time']);
  for (const k of Object.keys(d.stances)) assert.equal(d.stances[k], 'balance');
  assert.ok(!('priorityPrimary' in d), 'old triangle fields should be gone');
  assert.deepEqual(d.nonNegotiables, []);
  assert.deepEqual(d.flexibilities, []);
});

test('makeDecisionCard — configurable-triangle fields (points + scenarios)', () => {
  const d = makeDecisionCard();
  assert.equal(d.points.length, 3, 'primary triangle plots 3 points');
  assert.equal(new Set(d.points).size, 3, 'the 3 plotted points are distinct');
  for (const k of d.points) assert.ok(['features','time','productCost','projectCost'].includes(k));
  assert.deepEqual(d.scenarios, [], 'no comparison scenarios by default');
});

test('makeScenario — named comparison triangle keeps 3 points + 4 stances', () => {
  const s = makeScenario();
  assert.equal(s.name, '');
  assert.equal(s.points.length, 3);
  assert.deepEqual(Object.keys(s.stances).sort(), ['features','productCost','projectCost','time']);
  // nested structures are fresh per call (no shared references)
  const s2 = makeScenario();
  assert.notEqual(s.points, s2.points);
  assert.notEqual(s.stances, s2.stances);
});

/* ── NPV ────────────────────────────────────────────────────────────────────
 * Oracles hand-computed, NOT taken from the task spec (whose expected values
 * were arithmetically wrong). Convention: investment at t=0, flows at t=1..N.
 * A: 300/1.1 + 300/1.21 + 300/1.331 + 300/1.4641 − 1000 = −49.04
 * B: 1000/1.08 + 1200/1.1664 + 1500/1.259712 + 2000/1.360489 − 5000 = −384.46
 */

test('computeNPV — case A (negative, ~-49.04)', () => {
  const npv = computeNPV(1000, [300,300,300,300], 0.10);
  assert.ok(Math.abs(npv - (-49.04)) < 0.5, `NPV=${npv}`);
});

test('computeNPV — case B (negative, ~-384.46)', () => {
  const npv = computeNPV(5000, [1000,1200,1500,2000], 0.08);
  assert.ok(Math.abs(npv - (-384.46)) < 0.5, `NPV=${npv}`);
});

test('computeNPV — zero discount rate is a plain sum minus investment', () => {
  assert.equal(computeNPV(1000, [300,300,300,300], 0), 200);
});

test('computeNPV — guards against rate = -100%', () => {
  assert.equal(computeNPV(1000, [300], -1), null);
});

/* ── IRR ────────────────────────────────────────────────────────────────────
 * The right IRR test is "does plugging it back zero the NPV" — not a magic
 * number. (The spec's IRRs, e.g. 21.8% for 4×300 on 1000, were wrong: true IRR
 * is ~7.7%.)
 */

test('computeIRR — root makes NPV ~ 0 (case A) and is ~7.7%', () => {
  const irr = computeIRR(1000, [300,300,300,300]);
  assert.ok(irr != null);
  assert.ok(Math.abs(computeNPV(1000, [300,300,300,300], irr)) < 1e-4, 'IRR does not zero NPV');
  assert.ok(irr > 0.07 && irr < 0.08, `IRR=${irr}`);
});

test('computeIRR — profitable project (positive NPV at 8%) has IRR > 8%', () => {
  const flows = [2000,2500,3000,3500];
  const irr = computeIRR(5000, flows);
  assert.ok(irr != null && irr > 0.08);
  assert.ok(Math.abs(computeNPV(5000, flows, irr)) < 1e-4);
});

test('computeIRR — loss-making project has a valid NEGATIVE IRR (not null)', () => {
  // 1000 out, only 200 ever comes back → IRR is real but deeply negative.
  const irr = computeIRR(1000, [100,100]);
  assert.ok(irr != null && irr < 0, `IRR=${irr}`);
  assert.ok(Math.abs(computeNPV(1000, [100,100], irr)) < 1e-4);
});

test('computeIRR — no sign change (all inflows, no outlay) → null', () => {
  assert.equal(computeIRR(0, [100,100]), null);
});

/* ── Yield / Payback / Break-even ───────────────────────────────────────── */

test('computeYield — average flow over investment, as %', () => {
  // avg(300)=300, /1000 = 30%
  assert.equal(computeYield(1000, [300,300,300,300]), 30);
});

test('computeYield — zero investment → null (no divide by zero)', () => {
  assert.equal(computeYield(0, [300]), null);
});

test('computePayback — interpolates within the crossing year', () => {
  // cum: 300,600,900,1200; crosses 1000 during year 4 at 100/300 → 3.333
  const pb = computePayback(1000, [300,300,300,300]);
  assert.ok(Math.abs(pb - 3.333) < 0.01, `payback=${pb}`);
});

test('computePayback — never recovered → null', () => {
  assert.equal(computePayback(1000, [100,100]), null);
});

test('computeBreakEvenUnits — investment / contribution margin (~166.67)', () => {
  // Spec claimed 250; correct is 10000/(100-40)=166.67.
  const u = computeBreakEvenUnits(10000, 100, 40);
  assert.ok(Math.abs(u - 166.6667) < 0.001, `units=${u}`);
});

test('computeBreakEvenUnits — non-positive margin → null', () => {
  assert.equal(computeBreakEvenUnits(10000, 40, 40), null);
  assert.equal(computeBreakEvenUnits(10000, 30, 40), null);
});

test('computeCumulative — running total series', () => {
  assert.deepEqual(computeCumulative([100,200,-50,300]), [100,300,250,550]);
});

/* ── Formatting + master entry point ────────────────────────────────────── */

test('fmtEur — compact euro formatting and null → dash', () => {
  assert.equal(fmtEur(1_200_000), '€1.2M');
  assert.equal(fmtEur(340_000), '€340k');
  assert.equal(fmtEur(4_200), '€4.2k');
  assert.equal(fmtEur(512), '€512');
  assert.equal(fmtEur(-49), '-€49');
  assert.equal(fmtEur(null), '—');
});

test('calculateFinancials — returns raw metrics + formatted display map', () => {
  const r = calculateFinancials(makeCharterFinancials({
    initialInvestment: 1000, cashFlows: [300,300,300,300], discountRate: 0.10,
    pricePerUnit: 100, variableCostPerUnit: 40,
  }));
  assert.ok(Math.abs(r.npv - (-49.04)) < 0.5);
  assert.ok(r.irr > 0.07 && r.irr < 0.08);
  assert.equal(r.yieldPct, 30);
  assert.deepEqual(r.cumulative, [300,600,900,1200]);
  assert.ok(typeof r.display.npv === 'string');
  assert.equal(r.display.irr.endsWith('%'), true);
});

test('calculateFinancials — tolerates empty/garbage input without throwing', () => {
  const r = calculateFinancials({});
  assert.ok(r.npv === 0);           // -0 outlay + no flows (=== treats -0 as 0)
  assert.equal(r.irr, null);
  assert.equal(r.display.irr, '—');
});

/* ── Detailed investment breakdown + units ──────────────────────────────── */

test('makeCharterFinancials — has unit + investment breakdown defaults', () => {
  const f = makeCharterFinancials();
  assert.equal(f.unit, 'eur');
  assert.deepEqual(f.investment, { items: [], amortUnits: null });
});

test('makeInvestmentItem — default shape', () => {
  const it = makeInvestmentItem();
  assert.equal(it.category, 'labor');
  assert.equal(it.target, 'kpi');
  assert.equal(it.amount, 0);
});

test('effectiveInvestment — base + only the KPI-targeted items', () => {
  const f = makeCharterFinancials({
    initialInvestment: 1000,
    investment: { items: [
      makeInvestmentItem({ amount: 500, target: 'kpi' }),      // counts
      makeInvestmentItem({ amount: 300, target: 'unit' }),     // does NOT count here
      makeInvestmentItem({ amount: 200, target: 'kpi', category:'expense' }), // counts
    ], amortUnits: 100 },
  });
  assert.equal(effectiveInvestment(f), 1700);   // 1000 + 500 + 200
});

test('effectiveVarCost — base + unit-targeted items spread over amortUnits', () => {
  const f = makeCharterFinancials({
    variableCostPerUnit: 40,
    investment: { items: [
      makeInvestmentItem({ amount: 6000, target: 'unit' }),    // spread
      makeInvestmentItem({ amount: 999,  target: 'kpi' }),     // ignored here
    ], amortUnits: 600 },
  });
  assert.equal(effectiveVarCost(f), 50);        // 40 + 6000/600
});

test('effectiveVarCost — no amortUnits ⇒ unit-targeted pool is ignored (no div-by-zero)', () => {
  const f = makeCharterFinancials({
    variableCostPerUnit: 40,
    investment: { items: [ makeInvestmentItem({ amount: 6000, target: 'unit' }) ], amortUnits: 0 },
  });
  assert.equal(effectiveVarCost(f), 40);
});

test('calculateFinancials — breakdown feeds NPV outlay and break-even margin', () => {
  const f = makeCharterFinancials({
    initialInvestment: 0,
    cashFlows: [300,300,300,300], discountRate: 0.10,
    pricePerUnit: 100, variableCostPerUnit: 40,
    investment: { items: [
      makeInvestmentItem({ amount: 1000, target: 'kpi' }),     // → outlay 1000
      makeInvestmentItem({ amount: 600,  target: 'unit' }),    // → +10/unit over 60 units
    ], amortUnits: 60 },
  });
  const r = calculateFinancials(f);
  assert.equal(r.effInvestment, 1000);
  assert.equal(r.effVarCost, 50);               // 40 + 600/60
  assert.ok(Math.abs(r.npv - (-49.04)) < 0.5);  // same as case A (outlay 1000)
  // break-even units = 1000 / (100 - 50) = 20
  assert.ok(Math.abs(r.breakEvenUnits - 20) < 1e-9, `be=${r.breakEvenUnits}`);
});

test('margin mode: targetCost derives max unit cost from price + target margin', () => {
  const f = makeCharterFinancials({ marginMode:'targetCost', pricePerUnit:50, targetMarginPct:40, initialInvestment:1000 });
  const r = calculateFinancials(f);
  assert.equal(r.directVarCost, 30);         // 50 × (1 − 0.40)
  assert.equal(r.derivedCost, 30);
  assert.equal(r.marginPerUnit, 20);         // 50 − 30
  assert.equal(r.marginPct, 40);             // hits the target
});

test('margin mode: targetPrice derives required price from cost + target margin', () => {
  const f = makeCharterFinancials({ marginMode:'targetPrice', variableCostPerUnit:30, targetMarginPct:40 });
  const r = calculateFinancials(f);
  assert.ok(Math.abs(r.derivedPrice - 50) < 1e-9);   // 30 / (1 − 0.40)
  assert.ok(Math.abs(r.marginPct - 40) < 1e-9);
});

test('margin mode: compute (default) leaves price & cost as entered', () => {
  const r = calculateFinancials(makeCharterFinancials({ pricePerUnit:50, variableCostPerUnit:20 }));
  assert.equal(r.derivedPrice, null);
  assert.equal(r.derivedCost, null);
  assert.equal(r.marginPerUnit, 30);
});

test('margin mode: targetCost margin excludes amortized per-unit (break-even includes it)', () => {
  const f = makeCharterFinancials({
    marginMode:'targetCost', pricePerUnit:50, targetMarginPct:40, initialInvestment:1000,
    investment:{ items:[{label:'Tool',category:'amortized',amount:50000,target:'unit'}], amortUnits:100000 },
  });
  const r = calculateFinancials(f);
  assert.equal(r.marginPerUnit, 20);         // product margin = 50 − 30 (excludes €0.50 amort)
  assert.equal(r.effVarCost, 30.5);          // 30 direct + 0.50 amortized
  // break-even uses fully-loaded: 1000 / (50 − 30.5) = 51.28 → 52
  assert.ok(Math.abs(r.breakEvenUnits - (1000/19.5)) < 1e-6);
});

test('gross vs commercial margin — waterfall split', () => {
  const r = calculateFinancials(makeCharterFinancials({
    pricePerUnit: 100, variableCostPerUnit: 40, commercialCostPerUnit: 15,
  }));
  assert.equal(r.grossMarginPerUnit, 60);        // 100 − 40
  assert.equal(r.grossMarginPct, 60);
  assert.equal(r.commercialMarginPerUnit, 45);   // 100 − 40 − 15
  assert.equal(r.commercialMarginPct, 45);
  assert.equal(r.marginPerUnit, 60);             // legacy alias = gross
  assert.equal(r.display.commercialMarginPerUnit, '€45');
});

test('commercial margin — back-compat: no commercial cost ⇒ commercial = gross', () => {
  const r = calculateFinancials(makeCharterFinancials({
    pricePerUnit: 100, variableCostPerUnit: 40,   // commercialCostPerUnit defaults 0
  }));
  assert.equal(r.commercialMarginPerUnit, r.grossMarginPerUnit);
  assert.equal(r.commercialMarginPct, r.grossMarginPct);
});

test('commercial cost feeds effVarCost & break-even (fully loaded)', () => {
  const r = calculateFinancials(makeCharterFinancials({
    initialInvestment: 1000, pricePerUnit: 100,
    variableCostPerUnit: 40, commercialCostPerUnit: 10,
  }));
  assert.equal(r.effVarCost, 50);                // 40 production + 10 commercial
  // break-even uses commercial margin (price − effVarCost) = 50 → 1000/50 = 20
  assert.ok(Math.abs(r.breakEvenUnits - 20) < 1e-9, `be=${r.breakEvenUnits}`);
  assert.equal(r.grossMarginPerUnit, 60);        // gross unchanged by commercial cost
});

test('commercial margin — target-margin mode still drives GROSS only', () => {
  const r = calculateFinancials(makeCharterFinancials({
    marginMode:'targetCost', pricePerUnit:50, targetMarginPct:40, commercialCostPerUnit:5,
  }));
  assert.equal(r.grossMarginPerUnit, 20);        // 50 − 30 (derived production cost), hits target
  assert.equal(r.grossMarginPct, 40);
  assert.equal(r.commercialMarginPerUnit, 15);   // 20 − 5
});

test('commercial/gross margin — null-safe on empty input', () => {
  const r = calculateFinancials({});
  assert.equal(r.grossMarginPct, null);
  assert.equal(r.commercialMarginPct, null);
  assert.equal(r.display.commercialMarginPerUnit, '—');
});

test('makeCharterFinancials — carries commercialCostPerUnit default 0', () => {
  assert.equal(makeCharterFinancials().commercialCostPerUnit, 0);
});

test('calculateFinancials — margin, ROI and profitability index', () => {
  const r = calculateFinancials(makeCharterFinancials({
    initialInvestment: 1000, cashFlows: [300,300,300,300], discountRate: 0.10,
    pricePerUnit: 100, variableCostPerUnit: 40,
  }));
  assert.equal(r.marginPerUnit, 60);            // 100 - 40
  assert.equal(r.marginPct, 60);                // 60 / 100
  assert.equal(r.roi, 20);                      // (1200 - 1000) / 1000
  assert.ok(Math.abs(r.profitabilityIndex - 0.951) < 0.01, `PI=${r.profitabilityIndex}`); // (npv+init)/init
});

test('calculateFinancials — margin/ROI/PI null-safe on empty input', () => {
  const r = calculateFinancials({});
  assert.equal(r.roi, null);                    // no investment
  assert.equal(r.profitabilityIndex, null);
  assert.equal(r.marginPct, null);              // no price
  assert.equal(r.display.roi, '—');
});

test('investmentType is no longer part of the financials model', () => {
  const f = makeCharterFinancials();
  assert.ok(!('investmentType' in f), 'investmentType should be removed');
});

test('unit helpers — factor, symbol, and unit-aware formatting', () => {
  assert.equal(finUnitFactor('meur'), 1e6);
  assert.equal(finUnitFactor('keur'), 1e3);
  assert.equal(finUnitFactor('eur'), 1);
  assert.equal(finUnitSym('meur'), 'M€');
  assert.equal(fmtMoneyUnit(1_500_000, 'meur'), '1.5 M€');
  assert.equal(fmtMoneyUnit(1_500_000, 'keur'), '1,500 k€');
  assert.equal(fmtMoneyUnit(null, 'eur'), '—');
});
