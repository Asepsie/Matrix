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
