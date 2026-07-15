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
    engagement:    makeEngagement(),      // talent-engagement cadence (tier + weekly touchpoints)
    _isDictionary: false,
    ...overrides,
  };
}

// Talent-engagement plan for one person: a retention tier (null = not in the plan)
// plus scheduled/completed touchpoints. Rides save/backup with the engineer's idcard.
// A touchpoint = { type, week, done, note, ts } where `week` is a Monday date key
// 'YYYY-MM-DD' and `type` is an ENGAGEMENT_ACTIONS id.
export function makeEngagement(overrides = {}) {
  return {
    tier:        null,   // null = not in plan · 1 = closest cadence · 2 · 3
    touchpoints: [],
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
    tacticalIntent: '',   // strategic posture: '' | Defend | Grow | Adapt | Diversify
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
    gatePlan:    makeGatePlan(),   // per-project stage-gate + PI state (see gate.js)
    ...overrides,
  };
}

/* ══ Gate & PI — configurable stage-gate + increment planning ══════════
   Portfolio-level GOVERNANCE config: ONE active methodology (an ordered list
   of stages, each with readiness criteria) applied across every project, a
   reusable template library (max GATE_TEMPLATE_MAX), and the PI/increment time
   boxes. Lives on the single global `gateConfig` so it rides save/backup/
   snapshot. Per-project state (current stage + manual criterion overrides +
   target increment) lives on `project.gatePlan` — deliberately NOT `project.gate`,
   which is a pre-existing string label. Readiness is HYBRID: a criterion is
   either ticked by hand (`manual`) or evaluated against a computed signal
   (`auto`: dimension op threshold) drawn from the existing analytics datasets. */
export function makeGateConfig(overrides = {}) {
  return {
    model:      makeGateModel(),   // the ACTIVE methodology
    templates:  [],                // saved methodologies (name + stages), max GATE_TEMPLATE_MAX
    increments: [],                // PI time boxes (makeIncrement)
    piOrder:    [],                // project ids in PI-planning display order (planning-only, NOT the global projects[] order)
    piSelected: [],                // project ids selected/focused in the PI board (the rest collapse together)
    ...overrides,
  };
}
// The active methodology: a name + an ordered list of stages.
export function makeGateModel(overrides = {}) {
  return { name: 'Stage-Gate', stages: defaultGateStages(), ...overrides };
}
// One stage/gate. `criteria` are the readiness checks that must clear before a
// project may advance past it. `color` is an optional swatch (blank = palette).
export function makeGateStage(overrides = {}) {
  return { id: '', name: 'New stage', desc: '', color: '', criteria: [], ...overrides };
}
// One readiness criterion. `kind:'manual'` = a hand-ticked check; `kind:'auto'`
// = evaluated live as (signal `dimension` `op` `threshold`) against the datasets.
// `mandatory` blocks advancement when unmet; `weight` scales its share of score.
export function makeGateCriterion(overrides = {}) {
  return { id: '', text: '', mandatory: false, weight: 1,
           kind: 'manual', dimension: '', op: '>=', threshold: 0, ...overrides };
}
// A PI / increment = a named time box. start/end are 'YYYY-MM' month strings.
export function makeIncrement(overrides = {}) {
  return { id: '', name: '', start: '', end: '', ...overrides };
}
// Per-project gate state (on project.gatePlan). `stageId` = current stage;
// `criteria` = manual override status keyed by criterion id ('pass'|'fail'|'na');
// `targetIncrementId` = the PI this project is committed to clear its NEXT gate in;
// `roadmap` = the PI-board commitment map { [incrementId]: stageId } — the stage the
// project plans to be AT by the end of that increment (drives the roadmap grid).
// `piItems` = per-increment PI-plan content { [incrementId]: makeGatePiItems() } —
// the milestones + major objectives committed for that increment (drives the PI plan).
export function makeGatePlan(overrides = {}) {
  return { stageId: '', criteria: {}, targetIncrementId: '', roadmap: {}, piItems: {}, history: [], ...overrides };
}
// PI-plan content for ONE (project, increment): a list of dated milestones and a
// list of major objectives. Kept separate from execution milestones/todos — this
// is the forward PI commitment, not the running backlog.
export function makeGatePiItems(overrides = {}) {
  return { milestones: [], objectives: [], ...overrides };
}
// One PI milestone: free text + optional target month + a done flag.
export function makeGateMilestone(overrides = {}) {
  return { id: '', text: '', date: '', done: false, ...overrides };
}
// One PI major objective: a free-text bullet.
export function makeGateObjective(overrides = {}) {
  return { id: '', text: '', ...overrides };
}
// The seed methodology: OPEN → SELECT → DO → IMPLEMENT → PRODUCE → SELL, with a
// light mix of manual + auto criteria so the hybrid model is visible out of the
// box. Fully editable — users rename/add/remove/reorder to fit their process.
export function defaultGateStages() {
  const C = makeGateCriterion;
  return [
    { id:'open', name:'OPEN', desc:'Idea intake & framing', color:'#5be5c8', criteria:[
      C({ id:'open-case', text:'Opportunity described / business case sketched', mandatory:true }),
      C({ id:'open-fit',  text:'Strategic fit confirmed' }),
    ]},
    { id:'select', name:'SELECT', desc:'Go / no-go to invest', color:'#c8f135', criteria:[
      C({ id:'sel-npv',  text:'Positive NPV', mandatory:true, kind:'auto', dimension:'npv', op:'>', threshold:0 }),
      C({ id:'sel-conf', text:'No trade-off conflicts', kind:'auto', dimension:'conflicts', op:'==', threshold:0 }),
      C({ id:'sel-spon', text:'Sponsor assigned' }),
    ]},
    { id:'do', name:'DO', desc:'Development', color:'#a78bfa', criteria:[
      C({ id:'do-align', text:'Functions aligned (min ≥ 6)', kind:'auto', dimension:'alignMin', op:'>=', threshold:6 }),
      C({ id:'do-proto', text:'Prototype validated', mandatory:true }),
    ]},
    { id:'implement', name:'IMPLEMENT', desc:'Industrialization', color:'#f1a435', criteria:[
      C({ id:'imp-dtc',  text:'Unit cost at/under target', kind:'auto', dimension:'dtcGap', op:'<=', threshold:0 }),
      C({ id:'imp-qual', text:'Qualification tests passed', mandatory:true }),
    ]},
    { id:'produce', name:'PRODUCE', desc:'Ramp to volume', color:'#3bd4b8', criteria:[
      C({ id:'prod-line', text:'Production line ready', mandatory:true }),
      C({ id:'prod-supply', text:'Supply chain secured' }),
    ]},
    { id:'sell', name:'SELL', desc:'Launch & scale', color:'#f14335', criteria:[
      C({ id:'sell-margin', text:'Blended margin ≥ 20%', kind:'auto', dimension:'blended', op:'>=', threshold:20 }),
      C({ id:'sell-gtm',    text:'Go-to-market plan approved', mandatory:true }),
    ]},
  ].map(makeGateStage);
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
    channelModel: makeChannelModel(),
    ...overrides,
  };
}

// Go-to-market CHANNEL model (on the charter). The go-to-market synoptic:
// company/project → channels → segments. `basis` sets what each channel's `pct`
// means: 'revenue' (split the charter's expected revenue → € per channel),
// 'volume' (split `totalUnits` → units per channel) or 'emphasis' (a relative
// go-to-market weighting only). Percentages are shares that ideally sum to 100.
export function makeChannelModel(overrides = {}) {
  return {
    company: '',            // labels the top of the synoptic (per-project)
    basis: 'revenue',       // 'revenue' | 'volume' | 'emphasis'
    totalUnits: null,       // used only when basis==='volume'
    channels: ['OEM','Distributor','E-commerce','Retail','Partner'].map(name => makeChannel({ name })),
    ...overrides,
  };
}
// One go-to-market channel. `pct` = share (%); `margin` = channel margin (%);
// `partner` = named partner/account; `segment` = the single downstream customer
// segment this channel serves (one segment per channel — a segment reached via
// two channels appears under each, so the synoptic never needs crossing arrows).
// `color` is an optional swatch (assigned from a palette by index when blank).
export function makeChannel(overrides = {}) {
  return { name: '', pct: 0, margin: null, partner: '', segment: '', color: '', note: '', ...overrides };
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
    variableCostPerUnit: 0,         // EUR per unit — PRODUCTION cost / COGS (drives gross margin)
    commercialCostPerUnit: 0,       // EUR per unit — commercial cost (distribution, commissions,
                                    // discounts). Gross − commercial = commercial margin.
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
