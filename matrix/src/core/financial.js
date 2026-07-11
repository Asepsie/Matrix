/* ►► SECTION: FINANCIAL ◄◄ Charter financial engine: NPV / IRR / Yield /
 * Payback / Break-even. Pure, dependency-free, unit-testable in isolation.
 *
 * CONVENTIONS (fixed here so the whole app agrees):
 *   initialInvestment  outlay at t=0, a positive number.
 *   cashFlows[i]       NET cash flow for year i+1 (index 0 = year 1). May be
 *                      negative (a loss-making year).
 *   discountRate       decimal, 0.10 = 10%.
 *   pricePerUnit         selling price per unit.
 *   variableCostPerUnit  direct PRODUCTION cost / COGS (price − this = gross margin).
 *   commercialCostPerUnit  commercial cost per unit — distribution, sales
 *                      commission, discounts (gross margin − this = commercial margin).
 *
 * All money is EUR. Every metric can be null when it is undefined for the given
 * inputs (e.g. IRR of flows that never turn positive, payback that never
 * completes, break-even with a non-positive margin) — callers must handle null.
 */

// Display-unit scaling. Values are ALWAYS stored in EUR; the unit only changes
// how project-level amounts are shown/entered. eur=1, keur=1e3, meur=1e6.
const FIN_UNIT_FACTOR = { eur:1, keur:1e3, meur:1e6 };
const FIN_UNIT_SYM    = { eur:'€', keur:'k€', meur:'M€' };
export function finUnitFactor(unit){ return FIN_UNIT_FACTOR[unit]||1; }
export function finUnitSym(unit){ return FIN_UNIT_SYM[unit]||'€'; }

// Effective upfront investment = base initialInvestment + all breakdown items
// whose target is 'kpi'. This is the outlay NPV/payback/break-even see.
export function effectiveInvestment(fin){
  let inv = Number(fin.initialInvestment)||0;
  const items = (fin.investment && Array.isArray(fin.investment.items)) ? fin.investment.items : [];
  for(const it of items) if(it.target==='kpi') inv += Number(it.amount)||0;
  return inv;
}
// Resolve unit economics per the margin mode. Returns the effective price, the
// DIRECT PRODUCTION cost (COGS, drives gross margin) and the COMMERCIAL cost
// (distribution/commissions/discounts), plus whichever was derived from the
// target margin. The target-margin modes act on the GROSS margin (price vs
// production cost); the commercial cost is a plain input on top.
//   compute      → price & directVar as entered
//   targetPrice  → price = directVar / (1 − margin)   (cost-plus, gross)
//   targetCost   → directVar = price × (1 − margin)   (max allowable production cost)
export function resolveUnitEconomics(fin){
  fin=fin||{};
  const mode=fin.marginMode||'compute';
  const tm=Number(fin.targetMarginPct);
  let price=Number(fin.pricePerUnit)||0;
  let directVar=Number(fin.variableCostPerUnit)||0;
  const commercialVar=Number(fin.commercialCostPerUnit)||0;
  let derivedPrice=null, derivedCost=null;
  if(mode==='targetPrice' && tm>0 && tm<100){ price=directVar/(1-tm/100); derivedPrice=price; }
  else if(mode==='targetCost' && Number.isFinite(tm) && tm>=0 && tm<100){ directVar=price*(1-tm/100); derivedCost=directVar; }
  return { mode, price, directVar, commercialVar, derivedPrice, derivedCost };
}
// Design-to-cost envelope: the max allowable DIRECT unit cost the design must hit.
// Prefers the target-margin-derived cost; else price×(1−targetMargin); else the
// entered direct variable cost; null if none is defined.
export function dtcTarget(fin){
  const eco=resolveUnitEconomics(fin);
  if(eco.derivedCost!=null) return eco.derivedCost;
  const tm=Number(fin.targetMarginPct), price=Number(fin.pricePerUnit)||0;
  if(price>0 && tm>0 && tm<100) return price*(1-tm/100);
  const vc=Number(fin.variableCostPerUnit)||0;
  return vc>0 ? vc : null;
}

// The 'unit'-targeted investment items spread over amortUnits (€/unit), else 0.
export function amortizedPerUnit(fin){
  const inv=(fin&&fin.investment)||{};
  const items=Array.isArray(inv.items)?inv.items:[];
  let pool=0; for(const it of items) if(it.target==='unit') pool+=Number(it.amount)||0;
  const au=Number(inv.amortUnits)||0;
  return pool>0&&au>0 ? pool/au : 0;
}
// Fully-loaded variable cost per unit = production COGS + commercial cost +
// amortized per-unit. This is the cost the commercial margin & break-even use.
export function effectiveVarCost(fin){
  const eco=resolveUnitEconomics(fin);
  return eco.directVar + eco.commercialVar + amortizedPerUnit(fin);
}
// Format an EUR amount in the chosen display unit, e.g. "1.2 M€".
export function fmtMoneyUnit(baseEur, unit){
  if(baseEur==null||!Number.isFinite(baseEur)) return '—';
  let v = baseEur/finUnitFactor(unit);
  if(Math.round(v*100)/100===0) v = 0;   // avoid "-0" when tiny amounts round to zero
  return `${v.toLocaleString('en-US',{maximumFractionDigits:2})} ${finUnitSym(unit)}`;
}

// NPV of a full flow vector [cf0, cf1, …] at rate r, discounting index t from 0.
// (Internal helper; the public NPV subtracts the investment as flow at t=0.)
function _npvOfVector(flows, r){
  if(r<=-1) return NaN;              // (1+r)=0 → division by zero
  let npv=0;
  for(let t=0;t<flows.length;t++) npv+=flows[t]/Math.pow(1+r,t);
  return npv;
}

// Net Present Value: Σ_{t=1..N} CF_t/(1+r)^t − initialInvestment.
export function computeNPV(initialInvestment, cashFlows, discountRate){
  if(discountRate<=-1) return null;
  let npv=-initialInvestment;
  for(let t=0;t<cashFlows.length;t++) npv+=cashFlows[t]/Math.pow(1+discountRate,t+1);
  return npv;
}

// Internal Rate of Return: the rate where NPV = 0.
//
// The spec asked for "binary search", but bisection is only valid once a sign
// change is bracketed — and non-conventional flows (multiple sign changes) can
// have several IRRs or none. So: scan a coarse grid over [-99%, +1000%] for the
// first sign change, then bisect inside that bracket. Returns null when no real
// root is bracketed (e.g. flows that never recover the investment).
export function computeIRR(initialInvestment, cashFlows){
  const flows=[-initialInvestment, ...cashFlows];
  // Nothing to solve if there is no sign change at all in the raw flows.
  const hasPos=flows.some(f=>f>0), hasNeg=flows.some(f=>f<0);
  if(!hasPos||!hasNeg) return null;

  const f=r=>_npvOfVector(flows,r);
  const LO=-0.9999, HI=10, STEPS=1000;
  let prevR=LO, prevV=f(LO);
  for(let i=1;i<=STEPS;i++){
    const r=LO+(HI-LO)*i/STEPS;
    const v=f(r);
    if(Number.isFinite(prevV)&&Number.isFinite(v)&&(prevV===0||prevV*v<0)){
      // Bracket [prevR, r] contains a root → bisect for precision.
      let a=prevR, b=r, fa=prevV;
      for(let k=0;k<200;k++){
        const m=(a+b)/2, fm=f(m);
        if(Math.abs(fm)<1e-9||(b-a)<1e-12) return m;
        if(fa*fm<0){b=m;} else {a=m;fa=fm;}
      }
      return (a+b)/2;
    }
    prevR=r; prevV=v;
  }
  return null;
}

// Yield: average annual cash flow as a % of the initial investment.
export function computeYield(initialInvestment, cashFlows){
  if(!initialInvestment||initialInvestment<=0||cashFlows.length===0) return null;
  const avg=cashFlows.reduce((s,v)=>s+v,0)/cashFlows.length;
  return (avg/initialInvestment)*100;
}

// Payback period (undiscounted): years until cumulative cash flows cover the
// initial investment, linearly interpolated within the crossing year. Null if
// never recovered within the provided horizon.
export function computePayback(initialInvestment, cashFlows){
  let cum=0;
  for(let t=0;t<cashFlows.length;t++){
    const prev=cum;
    cum+=cashFlows[t];
    if(cum>=initialInvestment){
      const need=initialInvestment-prev;          // still to recover entering this year
      const frac=cashFlows[t]>0?need/cashFlows[t]:0;
      return t+Math.max(0,Math.min(1,frac));      // t full years + partial
    }
  }
  return null;
}

// Break-even in units: initialInvestment / contribution-margin-per-unit.
// Null when the margin is non-positive (price ≤ variable cost) — no break-even.
export function computeBreakEvenUnits(initialInvestment, pricePerUnit, variableCostPerUnit){
  const margin=pricePerUnit-variableCostPerUnit;
  if(margin<=0) return null;
  return initialInvestment/margin;
}

// Cumulative undiscounted cash flow series, [after year 1, after year 2, …].
// Used by the cumulative-cash-flow chart and its break-even marker.
export function computeCumulative(cashFlows){
  const out=[]; let cum=0;
  for(const cf of cashFlows){ cum+=cf; out.push(cum); }
  return out;
}

// ── Formatting helpers (EUR) ─────────────────────────────────────────────────
// fmtEur: compact euro, e.g. €1.2M / €340k / €512 / — for null.
export function fmtEur(v){
  if(v==null||!Number.isFinite(v)) return '—';
  const s=v<0?'-':'', a=Math.abs(v);
  if(a>=1e6) return `${s}€${(a/1e6).toFixed(a>=1e7?0:1)}M`;
  if(a>=1e3) return `${s}€${(a/1e3).toFixed(a>=1e4?0:1)}k`;
  return `${s}€${a.toFixed(0)}`;
}
export function fmtPct(v){ return v==null||!Number.isFinite(v)?'—':`${(v).toFixed(1)}%`; }
export function fmtYears(v){
  if(v==null||!Number.isFinite(v)) return '—';
  return `${v.toFixed(1)} ${v===1?'year':'years'}`;
}
export function fmtUnits(v){
  if(v==null||!Number.isFinite(v)) return '—';
  return `${Math.ceil(v).toLocaleString('en-US')} units`;
}

// Master entry point: compute every metric from a charter.financials object and
// return raw values (for charts/tests) plus a `display` map of formatted strings
// (for the UI). Tolerant of missing/garbage inputs — coerces to safe numbers.
export function calculateFinancials(fin){
  fin=fin||{};
  // Effective figures fold in the detailed investment breakdown (if any); with no
  // breakdown they equal the plain initialInvestment / variableCostPerUnit fields,
  // so existing callers/tests are unaffected.
  const init=effectiveInvestment(fin);
  const flows=(Array.isArray(fin.cashFlows)?fin.cashFlows:[]).map(v=>Number(v)||0);
  const rate=Number(fin.discountRate)||0;
  const eco=resolveUnitEconomics(fin);         // price & direct cost per margin mode
  const price=eco.price;
  const varCost=effectiveVarCost(fin);         // direct + amortized (for break-even)

  const npv=computeNPV(init,flows,rate);
  const irr=computeIRR(init,flows);                 // decimal (0.21) or null
  const yld=computeYield(init,flows);
  const payback=computePayback(init,flows);
  const beUnits=computeBreakEvenUnits(init,price,varCost);
  const cumulative=computeCumulative(flows);

  // Margin waterfall (all €/unit, can be negative):
  //   Gross margin      = price − production COGS (the target-margin modes control this).
  //   Commercial margin = gross − commercial cost (distribution/commissions/discounts).
  // Amortized per-unit investment is NOT in either margin — it belongs to break-even
  // (via effVarCost), keeping unit profitability and payback-of-investment distinct.
  const grossMargin=price-eco.directVar;
  const grossMarginPct=price>0 ? (grossMargin/price)*100 : null;
  const commercialMargin=price-eco.directVar-eco.commercialVar;
  const commercialMarginPct=price>0 ? (commercialMargin/price)*100 : null;
  // marginPerUnit/marginPct kept as the GROSS margin for back-compat with existing callers.
  const margin=grossMargin, marginPct=grossMarginPct;
  const hasEco=price>0||eco.directVar>0||eco.commercialVar>0;
  // Whole-project returns.
  const totalFlow=flows.reduce((s,v)=>s+v,0);
  const roi=init>0 ? ((totalFlow-init)/init)*100 : null;        // simple undiscounted ROI %
  const pi=(init>0 && npv!=null) ? (npv+init)/init : null;      // profitability index (PV inflows / outlay)

  return {
    npv, irr, yieldPct:yld, paybackYears:payback,
    breakEvenUnits:beUnits, breakEvenYears:payback, cumulative,
    effInvestment:init, effVarCost:varCost,
    price, directVarCost:eco.directVar, commercialVarCost:eco.commercialVar,
    derivedPrice:eco.derivedPrice, derivedCost:eco.derivedCost,
    marginPerUnit:margin, marginPct,
    grossMarginPerUnit:grossMargin, grossMarginPct,
    commercialMarginPerUnit:commercialMargin, commercialMarginPct,
    roi, profitabilityIndex:pi,
    display:{
      npv:        fmtEur(npv),
      irr:        irr==null?'—':fmtPct(irr*100),
      yieldPct:   fmtPct(yld),
      payback:    fmtYears(payback),
      breakEvenUnits: fmtUnits(beUnits),
      breakEvenTime:  fmtYears(payback),
      marginPerUnit:  hasEco ? `€${grossMargin.toLocaleString('en-US',{maximumFractionDigits:2})}` : '—',
      marginPct:      fmtPct(grossMarginPct),
      grossMarginPerUnit:      hasEco ? `€${grossMargin.toLocaleString('en-US',{maximumFractionDigits:2})}` : '—',
      grossMarginPct:          fmtPct(grossMarginPct),
      commercialMarginPerUnit: hasEco ? `€${commercialMargin.toLocaleString('en-US',{maximumFractionDigits:2})}` : '—',
      commercialMarginPct:     fmtPct(commercialMarginPct),
      roi:            fmtPct(roi),
      profitabilityIndex: pi==null?'—':pi.toFixed(2),
    },
  };
}
