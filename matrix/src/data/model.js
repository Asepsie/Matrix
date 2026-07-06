export function makeEngineer(overrides = {}) {
  return {
    id:              null,
    name:            'New Engineer',
    monthlyCost:     8000,
    groupId:         null,
    role:            '',
    location:        '',
    vacant:          false,
    planningOnly:    false,
    includeInCost:   false,
    excludeFromCalc: false,
    includeTalent:   true,
    skills:          [],
    idcard:          makeIdCard(),
    ...overrides,
  };
}

export function makeIdCard(overrides = {}) {
  return {
    reportsTo:     '',
    manager:       '',
    seniority:     '',
    potential:     '',              // Level of potential (GTP): Low / Medium / High
    mobility:      '',              // geographic / work-mode mobility, e.g. "Open to relocation"
    startdate:     '',
    reviewdate:    '',
    languages:     '',
    gender:        '',
    aspirations:   '',
    strengths:     '',
    devarea:       '',
    notes:         '',
    comparatio:    null,
    grade:         null,              // integer 1–11 (career grade)
    nextMove:      makeNextMove(),    // recommended next move (org-chart detail mode)
    contract:      '',
    photo:         '',
    cops:          [],
    reviews:       [],
    succession:    makeSuccessionPlan(),
    _isDictionary: false,
    ...overrides,
  };
}

export function makeNextMove(overrides = {}) {
  return {
    position: '',     // target position / role for the next move
    timeline: '',     // expected timeline, e.g. "6–12 months", "Q3 2026"
    show:     false,  // surface in the org-chart detailed mode
    ...overrides,
  };
}

export function makeSuccessionPlan(overrides = {}) {
  return {
    successorId:       '',
    successorFreeText: '',
    timeframe:         '',
    gaps:              '',
    ...overrides,
  };
}

export function makeProject(overrides = {}) {
  return {
    id:          null,
    name:        '',
    x:           5,
    y:           5,
    vis:         5,
    ena:         5,
    note:        '',
    color:       '#c8f135',
    gate:        '',
    currentGate: '',
    eta:         '',
    status:      '',
    sector:      '',
    impactEur:   null,
    costSource:  'plan',
    planCost:    0,
    sectionId:   null,
    visible:     true,
    todos:       [],
    risks:       [],
    milestones:  [],
    actions:     [],
    charter:     makeCharter(),   // cross-functional charter (see charter.js)
    ...overrides,
  };
}

// Cross-functional project charter. Goal: align the 5 functions on shared
// priorities and stop any one pushing an impossible agenda. Approvals are NOT
// modelled (single-user local tool). All money is EUR (like impactEur / M€).
//
// Each function has just an alignment score + a list of demands; every demand is
// tagged with the trade-off dimension it pushes and whether it's a must-have.
// The decision `stances` set the project's stance on the 4 trade-off dimensions,
// so a must-have demand on a SACRIFICED dimension surfaces as a conflict.
export function makeCharter(overrides = {}) {
  return {
    priority:     '',      // High / Medium / Low (overall charter priority)
    status:       'Draft', // Draft / In Review / Approved / Rejected (self-tracked)
    businessCase: '',      // one narrative — why this project matters (Overview tab)
    expectedRevenueM: null,// peak annual revenue in M€ (Overview tab)
    strategy:          { alignment: null, demands: [] },
    rnd:               { alignment: null, demands: [] },
    offer:             { alignment: null, demands: [] },
    procurement:       { alignment: null, demands: [] },
    industrialization: { alignment: null, demands: [] },
    financials: makeCharterFinancials(),
    decision:   makeDecisionCard(),
    costModel:  makeCostModel(),
    ...overrides,
  };
}

// One stakeholder demand. `dimension` is the trade-off corner it pushes
// ('' | features | time | productCost | projectCost); `mustHave` marks it
// non-negotiable (a must-have on a sacrificed dimension = a conflict).
// `response` is the design team's answer: '' | accept | mitigate | reject.
export function makeDemand(overrides = {}) {
  return { text: '', dimension: '', mustHave: false, response: '', responseNote: '', ...overrides };
}

// Design-to-cost model (on the charter). The unit-cost envelope comes from the
// charter financials (price − target margin); subsystems allocate it and track
// the current design estimate; levers are the cost-down actions toward target;
// competitors benchmark our cost/price structure.
export function makeCostModel(overrides = {}) {
  return { subsystems: [], levers: [], competitors: [], ...overrides };
}
// A cost line the unit-cost envelope is allocated to. amounts in €/unit.
// `include` lets you exclude it from the rollup for scenario analysis; `items`
// is an optional BOM / feature breakdown (its included items sum to `current`).
export function makeSubsystem(overrides = {}) {
  return { name: '', target: null, current: null, owner: '', include: true, items: [], ...overrides };
}
// One BOM part / feature under a subsystem. `include` toggles it in/out of analysis.
export function makeCostItem(overrides = {}) {
  return { name: '', cost: 0, include: true, ...overrides };
}
// A cost-reduction lever. saving in €/unit; status: idea | committed | realized.
export function makeLever(overrides = {}) {
  return { name: '', subsystem: '', saving: 0, status: 'idea', owner: '', ...overrides };
}
// A competitor for benchmarking. All €/unit. `volumeSaving` = cost advantage from
// scale; `brandPremium` = the part of the price that's brand, not cost/features.
// Implied margin is derived: price − (cogs − volumeSaving) − brandPremium.
export function makeCompetitor(overrides = {}) {
  return { name: '', sellingPrice: 0, cogs: 0, volumeSaving: 0, brandPremium: 0, ...overrides };
}

// Financial-analysis inputs for a charter. Convention: initialInvestment is the
// outlay at t=0 (positive); cashFlows[i] is the NET cash flow for year i+1;
// discountRate is a decimal (0.10 = 10%). See calculateFinancials() in
// src/core/financial.js for the maths.
export function makeCharterFinancials(overrides = {}) {
  return {
    initialInvestment:   0,         // base upfront outlay in EUR (before itemization)
    unit:                'eur',     // display/entry scale only: eur | keur | meur (values stored in EUR)
    cashFlows:           [],        // net annual cash flows, years 1..N (EUR)
    discountRate:        0.10,      // decimal
    pricePerUnit:        0,         // EUR per unit (unit economics — not scaled by `unit`)
    variableCostPerUnit: 0,         // EUR per unit (direct COGS)
    // Margin scenario mode: 'compute' (price & cost → margin), 'targetPrice'
    // (cost + target margin → required price), 'targetCost' (price + target
    // margin → max allowable unit cost). targetMarginPct is a percent (40 = 40%).
    marginMode:          'compute',
    targetMarginPct:     null,
    // Optional itemised investment. Each item targets either the financial KPIs
    // (adds to the upfront investment) or the unit cost (spread over amortUnits).
    investment:          { items: [], amortUnits: null },
    ...overrides,
  };
}

// One line of the detailed investment breakdown. amount is in EUR (base).
export function makeInvestmentItem(overrides = {}) {
  return {
    label:    '',
    category: 'labor',   // labor (internal labor) | expense | amortized
    amount:   0,         // EUR
    target:   'kpi',     // 'kpi' → upfront investment · 'unit' → per-unit cost
    ...overrides,
  };
}

// The Decision Card — the trade-off SQUARE. Each of the four dimensions gets a
// stance: 'prioritize' | 'balance' | 'sacrifice'. You can't prioritize
// everything, so at least one should be sacrificed (the UI warns otherwise).
// Product cost (unit economics) and Project cost (investment) are split so the
// classic "cheap to build AND cheap per unit AND full-featured AND fast" wish
// is visibly impossible.
export function makeDecisionCard(overrides = {}) {
  return {
    stances: { features:'balance', time:'balance', productCost:'balance', projectCost:'balance' },
    // The primary trade-off is now shown as a configurable TRIANGLE: `points` is
    // the 3 (of 4) dimensions plotted. The 4 stances are kept underneath (drive
    // conflicts + design guidelines); only the 3 chosen points are drawn.
    points: ['features', 'time', 'productCost'],
    scenarios: [],         // up to 2 named comparison triangles (see makeScenario)
    nonNegotiables: [],    // array of strings
    flexibilities:  [],    // array of strings
    ...overrides,
  };
}

// One named comparison scenario = an alternative trade-off triangle. Keeps its
// own 4 stances (so it's a full alternative) but plots only its 3 `points`.
export function makeScenario(overrides = {}) {
  return {
    name: '',
    points: ['features', 'time', 'productCost'],
    stances: { features:'balance', time:'balance', productCost:'balance', projectCost:'balance' },
    ...overrides,
  };
}

export function makeAllocRow(overrides = {}) {
  return {
    id:         null,
    engId:      null,
    projectId:  null,
    allocs:     {},
    budgetLine: '',
    ...overrides,
  };
}

export function makeSkill(overrides = {}) {
  return {
    name:    '',
    cat:     'mand',
    level:   3,
    domain:  '',
    gaps:    '',
    risks:   '',
    notes:   '',
    comment: '',
    ...overrides,
  };
}

export function makeCop(overrides = {}) {
  return {
    name:  '',
    goal:  '',
    notes: '',
    ...overrides,
  };
}

export function makeReview(overrides = {}) {
  return {
    year:     '',
    rating:   '',
    comments: '',
    ...overrides,
  };
}
