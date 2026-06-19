/* gen-demo-backup.js — deterministic demo dataset for Project Matrix
 *
 *   node tools/gen-demo-backup.js
 *   → writes demo/matrix_demo_backup.json  (a `full_backup` file)
 *
 * Restore it in the app via the header "↓ FULL BACKUP" import button.
 *
 * Design (per request):
 *   - 5 groups, 40 people, sizes 12/9/8/7/4 (varied; relaxed 3–8 cap so 40 fits)
 *   - 3 locations (Montréal, Paris, Bangalore), harmonized role titles per grade
 *   - Gaussian draws for pay / compa-ratio / ratings
 *   - Pareto skew for tenure, seniority pyramid, and gender ratio
 *   - Seeded discrepancies so each Analytics view shows something:
 *       flight risk · gender pay gap · SPOF skills · over/under-allocation ·
 *       under-paid veteran / over-paid newcomer (tenure–pay drift)
 *
 * Deterministic: seeded PRNG → same file every run.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ── Seeded PRNG (mulberry32) + distributions ── */
let _s = 0x9e3779b9;
function rnd(){ _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss(mean, sd){ const u = Math.max(1e-9, rnd()), v = rnd(); return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function pareto(alpha, xmin){ return xmin / Math.pow(1 - rnd(), 1 / alpha); }   // heavy right tail
function clamp(x, lo, hi){ return Math.max(lo, Math.min(hi, x)); }
function pick(arr){ return arr[Math.floor(rnd() * arr.length)]; }
function weighted(pairs){ const tot = pairs.reduce((s, p) => s + p[1], 0); let r = rnd() * tot; for (const [v, w] of pairs){ if ((r -= w) <= 0) return v; } return pairs[pairs.length - 1][0]; }
function roundTo(x, step){ return Math.round(x / step) * step; }

/* ── Reference tables ── */
const GROUPS = [
  { id: 1, name: 'Firmware & Embedded', color: '#c8f135', size: 12, domains: ['Software', 'Systems'], lead: 'Engineering Manager' },
  { id: 2, name: 'Hardware / Electronics', color: '#5be5c8', size: 9,  domains: ['Electronics', 'Thermal'], lead: 'Engineering Manager' },
  { id: 3, name: 'Mechanical & Thermal',  color: '#f1a435', size: 8,  domains: ['Mechanical', 'Thermal'], lead: 'Tech Lead' },
  { id: 4, name: 'Systems & Integration', color: '#a78bfa', size: 7,  domains: ['Systems', 'Project Management', 'Domain Expert'], lead: 'Tech Lead' },
  { id: 5, name: 'Quality & Test',        color: '#60a5fa', size: 4,  domains: ['Project Management', 'Domain Expert', 'Software'], lead: 'Tech Lead' },
];
const LOCATIONS = ['Montréal', 'Paris', 'Bangalore'];
const LOC_FACTOR = { 'Montréal': 0.9, 'Paris': 1.0, 'Bangalore': 0.45 };   // gross-pay cost-of-market factor

// seniority → {role, grade, basePay (€/month, Paris reference), perfCenter}
const TIERS = {
  'Junior':              { role: 'Junior Engineer',          grade: 1,  base: 4200,  perf: 1.8 },
  'Mid-level':           { role: 'Engineer',                 grade: 2,  base: 5600,  perf: 2.4 },
  'Senior':              { role: 'Senior Engineer',          grade: 3,  base: 7200,  perf: 2.8 },
  'Staff':               { role: 'Staff Engineer',           grade: 4,  base: 8800,  perf: 3.1 },
  'Principal':           { role: 'Principal Engineer',       grade: 5,  base: 10800, perf: 3.4 },
  'Tech Lead':           { role: 'Tech Lead',                grade: 5,  base: 9600,  perf: 3.2 },
  'Engineering Manager': { role: 'Engineering Manager',      grade: 6,  base: 10500, perf: 3.3 },
  'Director':            { role: 'Director of Engineering',  grade: 8,  base: 15500, perf: 3.6 },
};
const IC_SENIORITY = [['Junior', 30], ['Mid-level', 30], ['Senior', 22], ['Staff', 12], ['Principal', 6]];  // Pareto-ish pyramid

const RATINGS = ['U', 'D', 'M', 'M+', 'E', 'E+'];   // index 0..5
const DISC = ['D', 'I', 'S', 'C'];

const FIRST_M = ['Liam', 'Noah', 'Lucas', 'Ethan', 'Raj', 'Arjun', 'Hugo', 'Louis', 'Mathis', 'Felix', 'Omar', 'Karim', 'Diego', 'Marco', 'Sven', 'Viktor', 'Chen', 'Wei', 'Tariq', 'Pavel'];
const FIRST_F = ['Emma', 'Olivia', 'Chloé', 'Léa', 'Priya', 'Ananya', 'Sofia', 'Marie', 'Camille', 'Aisha', 'Nadia', 'Mei', 'Yuki', 'Ingrid', 'Elena', 'Sara'];
const FIRST_NB = ['Alex', 'Sam', 'Robin', 'Charlie', 'Noa'];
const LAST = ['Tremblay', 'Dubois', 'Moreau', 'Laurent', 'Sharma', 'Patel', 'Nguyen', 'Kapoor', 'Rossi', 'Müller', 'Andersson', 'Kowalski', 'Silva', 'Okafor', 'Haddad', 'Bernard', 'Fontaine', 'Lefebvre', 'Reddy', 'Iyer', 'Bianchi', 'Novak', 'Petrov', 'Costa', 'Mensah', 'Aziz', 'Lindqvist', 'Garcia', 'Park', 'Wang', 'Bouchard', 'Girard', 'Roy', 'Cloutier', 'Bensaïd', 'Khan', 'Dupont', 'Mercier', 'Faure', 'Renaud'];

/* ── Skill pools by domain. `c` = category (crit/diff/mand). `spof` marks single-holder skills. ── */
const SKILL_POOL = {
  Software:    [['Embedded C', 'mand'], ['RTOS', 'crit'], ['Firmware Architecture', 'diff'], ['Modbus', 'mand'], ['Bootloader / OTA', 'diff'], ['Unit Testing', 'mand'], ['Python Tooling', 'mand'], ['CI/CD', 'mand']],
  Electronics: [['PCB Design', 'crit'], ['Analog Design', 'diff'], ['Power Electronics', 'diff'], ['Signal Integrity', 'mand'], ['EMC Compliance', 'mand'], ['Schematic Capture', 'mand']],
  Mechanical:  [['CAD Modeling', 'mand'], ['Tolerance Analysis', 'diff'], ['DFM', 'mand'], ['Injection Molding', 'diff']],
  Thermal:     [['Heat Sink Design', 'diff'], ['Thermal Testing', 'mand']],
  Systems:     [['System Architecture', 'crit'], ['Requirements Mgmt', 'mand'], ['Integration Testing', 'mand'], ['HIL Testing', 'diff'], ['Safety (ISO 26262)', 'diff']],
  'Project Management': [['Agile / Scrum', 'mand'], ['Risk Management', 'diff'], ['Stakeholder Mgmt', 'mand']],
  Leadership:  [['People Management', 'diff'], ['Mentoring', 'mand'], ['Strategic Planning', 'diff']],
  'Domain Expert': [['HVAC Controls', 'crit'], ['Building Automation', 'diff'], ['Energy Optimization', 'diff']],
};
// Critical skills given to EXACTLY ONE person → SPOF demonstration
const SPOF_SKILLS = [
  { name: 'BACnet Stack',  domain: 'Software',    group: 1 },
  { name: 'RF Calibration', domain: 'Electronics', group: 2 },
  { name: 'Thermal CFD',   domain: 'Thermal',     group: 3 },
];

const SKILL_DOMAINS = ['Software', 'Electronics', 'Mechanical', 'Thermal', 'Systems', 'Project Management', 'Leadership', 'Domain Expert'];

/* ══════════════════════════════════════════════════════════════════
   Build engineers
   ══════════════════════════════════════════════════════════════════ */
const NOW = new Date('2026-06-18');
function isoDaysAgo(days){ const d = new Date(NOW.getTime() - days * 86400000); return d.toISOString().slice(0, 10); }

const usedNames = new Set();
function makeName(gender){
  let f, l, full, guard = 0;
  do {
    f = gender === 'F' ? pick(FIRST_F) : gender === 'NB' ? pick(FIRST_NB) : pick(FIRST_M);
    l = pick(LAST);
    full = f + ' ' + l;
  } while (usedNames.has(full) && guard++ < 200);
  usedNames.add(full);
  return full;
}

function skillsFor(group, seniority){
  const out = [];
  const names = new Set();
  const nSkills = clamp(Math.round(gauss(3.2, 1)), 2, 5);
  const domains = group.domains;
  for (let i = 0; i < nSkills; i++){
    const dom = pick(domains);
    const cand = SKILL_POOL[dom];
    if (!cand) continue;
    const [nm, cat] = pick(cand);
    if (names.has(nm)) continue;
    names.add(nm);
    out.push({
      name: nm, cat, domain: dom,
      level: clamp(Math.round(gauss(TIERS[seniority].grade >= 4 ? 4 : 3, 1)), 1, 5),
      gaps: '', risks: '', notes: '', comment: '',
    });
  }
  // leaders pick up a leadership skill
  if (['Tech Lead', 'Engineering Manager', 'Director'].includes(seniority)){
    const [nm, cat] = pick(SKILL_POOL.Leadership);
    if (!names.has(nm)) out.push({ name: nm, cat, domain: 'Leadership', level: clamp(Math.round(gauss(4, 0.7)), 3, 5), gaps: '', risks: '', notes: '', comment: '' });
  }
  return out;
}

function ratingFromCenter(center){
  const idx = clamp(Math.round(gauss(center, 0.9)), 0, 5);
  return RATINGS[idx];
}

const engineers = [];
let nextEngId = 1;
const groupLeadId = {};   // groupId → lead engId
let directorId = null;

// Pass 1: create members group by group (lead first)
for (const g of GROUPS){
  const icCount = g.size - 1 - (g.id === 4 ? 1 : 0);   // group 4 (Systems) also hosts the Director
  // Lead
  {
    const gender = weighted([['M', 62], ['F', 30], ['NB', 8]]);   // leadership slightly less skewed
    const sen = g.lead;
    const t = TIERS[sen];
    const id = nextEngId++;
    groupLeadId[g.id] = id;
    const tenureMonths = clamp(Math.round(pareto(1.5, 36)), 36, 200);   // leads tenured
    engineers.push(mkEng(id, g, sen, t, gender, tenureMonths, 2.8 + rnd() * 0.5));
  }
  // Director sits in Systems
  if (g.id === 4){
    const id = nextEngId++;
    directorId = id;
    const t = TIERS['Director'];
    const tenureMonths = clamp(Math.round(pareto(1.4, 60)), 60, 220);
    engineers.push(mkEng(id, g, 'Director', t, weighted([['M', 60], ['F', 35], ['NB', 5]]), tenureMonths, 3.2));
  }
  // ICs
  for (let i = 0; i < icCount; i++){
    const gender = weighted([['M', 68], ['F', 27], ['NB', 5]]);   // Pareto-skewed workforce
    const sen = weighted(IC_SENIORITY);
    const t = TIERS[sen];
    const id = nextEngId++;
    const tenureMonths = clamp(Math.round(pareto(1.4, 3)), 1, 190);   // many recent, few veterans
    engineers.push(mkEng(id, g, sen, t, gender, tenureMonths, null));
  }
}

function mkEng(id, group, seniority, tier, gender, tenureMonths, potBias){
  const loc = weighted(group.id === 5 ? [['Bangalore', 60], ['Paris', 25], ['Montréal', 15]]   // Quality concentrated offshore
                      : group.id === 1 ? [['Montréal', 50], ['Paris', 30], ['Bangalore', 20]]
                      : [['Paris', 45], ['Montréal', 35], ['Bangalore', 20]]);
  const pay = roundTo(clamp(gauss(tier.base * LOC_FACTOR[loc], tier.base * 0.07), 2500, 22000), 50);
  const comparatio = Math.round(clamp(gauss(100, 8), 78, 124));

  // reviews: two years, trend coherent with a center
  const center = tier.perf;
  const r2024 = ratingFromCenter(center - 0.2);
  const r2025 = ratingFromCenter(center + 0.1);
  const reviews = [
    { year: '2024', rating: r2024, comments: '' },
    { year: '2025', rating: r2025, comments: '' },
  ];

  // nine-box: potential biased by seniority/age, performance by latest rating
  const perfNB = clamp(Math.round((RATINGS.indexOf(r2025) / 5) * 2 + 1 + gauss(0, 0.4)), 1, 3);
  const potNB = clamp(Math.round((potBias != null ? potBias : 2) + gauss(0, 0.6)), 1, 3);
  const nineBox = perfNB + '-' + potNB;
  const potential = potNB === 3 ? 'High' : potNB === 2 ? 'Medium' : 'Low';
  const disc = pick(DISC);

  const eng = {
    id, name: makeName(gender), monthlyCost: pay, groupId: group.id,
    role: tier.role, location: loc,
    vacant: false, planningOnly: false, includeInCost: true, excludeFromCalc: false, includeTalent: true,
    skills: skillsFor(group, seniority),
    idcard: {
      reportsTo: '', manager: '', seniority, potential, mobility: pick(['', '', 'Open to relocation', 'Remote-friendly']),
      startdate: isoDaysAgo(Math.round(tenureMonths * 30.4)),
      reviewdate: '2026-03-15', languages: pick(['EN', 'EN, FR', 'EN, FR', 'EN, HI', 'EN, DE']),
      gender, aspirations: '', strengths: '', devarea: '', notes: '',
      comparatio, grade: tier.grade,
      nextMove: { position: '', timeline: '', show: false },
      contract: 'Permanent', photo: '',
      cops: [], reviews,
      succession: { successorId: '', successorFreeText: '', timeframe: '', gaps: '' },
      _isDictionary: false,
    },
    _nb: nineBox, _disc: disc,   // temp, pulled out into placement maps below
  };
  return eng;
}

/* ── reportsTo wiring ── */
for (const e of engineers){
  if (e.id === directorId){ e.idcard.reportsTo = ''; continue; }
  const leadId = groupLeadId[e.groupId];
  if (e.id === leadId){ e.idcard.reportsTo = String(directorId); }   // leads → Director
  else { e.idcard.reportsTo = String(leadId); }                       // ICs → their lead
}

/* ══════════════════════════════════════════════════════════════════
   Seeded discrepancies
   ══════════════════════════════════════════════════════════════════ */
const byId = id => engineers.find(e => e.id === id);
const icsOf = gid => engineers.filter(e => e.groupId === gid && e.id !== groupLeadId[gid] && e.id !== directorId);

// 1. SPOF — one unique critical skill each, on a single IC
SPOF_SKILLS.forEach((sp, i) => {
  const target = icsOf(sp.group)[i] || icsOf(sp.group)[0];
  if (target) target.skills.push({ name: sp.name, cat: 'crit', domain: sp.domain, level: 5, gaps: '', risks: 'Single point of failure — only holder in the org.', notes: '', comment: '' });
});

// 2. Flight risk — 3 high performers paid below market (compa-ratio < 95)
const flightPicks = [icsOf(1)[0], icsOf(2)[0], icsOf(3)[0]].filter(Boolean);
flightPicks.forEach(e => {
  e.idcard.comparatio = Math.round(clamp(gauss(89, 2), 84, 93));
  e.idcard.potential = 'High';
  e._nb = '3-3';
  e.idcard.reviews[1].rating = 'E';
  e.idcard.notes = 'High performer, flagged below-market pay.';
});

// 3. Gender pay gap — depress female compa-ratio in the Firmware group
engineers.filter(e => e.groupId === 1 && e.idcard.gender === 'F').forEach(e => {
  e.idcard.comparatio = Math.round(clamp(e.idcard.comparatio - gauss(11, 2), 80, 99));
});

// 4. Under-paid veteran + over-paid newcomer (tenure–pay drift)
const veteran = engineers.filter(e => e.idcard.seniority === 'Senior').sort((a, b) => new Date(a.idcard.startdate) - new Date(b.idcard.startdate))[0];
if (veteran){ veteran.idcard.comparatio = 86; veteran.idcard.notes = 'Long tenure, salary lagged behind band.'; }
const newcomer = engineers.filter(e => e.idcard.seniority === 'Mid-level').sort((a, b) => new Date(b.idcard.startdate) - new Date(a.idcard.startdate))[0];
if (newcomer){ newcomer.idcard.comparatio = 118; newcomer.idcard.startdate = isoDaysAgo(150); newcomer.idcard.notes = 'Recent hire at top of band.'; }

/* ══════════════════════════════════════════════════════════════════
   Projects + allocations (powers Capacity / Utilisation views)
   ══════════════════════════════════════════════════════════════════ */
const RES_START = '2026-01', RES_END = '2026-12';
const MONTHS = (() => { const out = []; let [y, m] = RES_START.split('-').map(Number); const [ey, em] = RES_END.split('-').map(Number); while (y < ey || (y === ey && m <= em)){ out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12){ m = 1; y++; } } return out; })();

const PROJECTS = [
  ['Rotor — Next-gen Controller', 'Product', 'G3', 9, 8, 1800000],
  ['Helios — Solar Inverter',     'Product', 'G2', 8, 7, 1200000],
  ['Atlas — Platform Refresh',    'Platform', 'G2', 6, 9, 900000],
  ['Sentinel — Safety Subsystem', 'Compliance', 'G4', 7, 6, 600000],
  ['Beacon — IoT Gateway',        'Product', 'G1', 5, 6, 400000],
  ['Internal — Tooling & CI',     'Internal', 'G1', 3, 8, 0],
];
const projects = PROJECTS.map((p, i) => ({
  id: i + 1, name: p[0], x: 5, y: p[3], vis: clamp(p[4], 1, 10), ena: clamp(10 - i, 1, 10),
  note: '', color: pick(['#c8f135', '#5be5c8', '#a78bfa', '#60a5fa', '#f1a435']),
  gate: p[2], currentGate: p[2], eta: '2026-12', status: pick(['On Track', 'On Track', 'At Risk', 'Planning']),
  sector: p[1], impactEur: p[5], costSource: 'plan', planCost: 0, sectionId: null, visible: true,
  todos: [], risks: [], milestones: [], actions: [],
}));

let nextAllocId = 1;
const allocRows = [];
const projIdsForGroup = { 1: [5, 6], 2: [2, 3], 3: [1], 4: [4, 1], 5: [4, 6] };

// utilisation target per engineer (Gaussian ~0.85), with seeded over/under cases
const overAlloc = new Set([icsOf(1)[1]?.id, icsOf(2)[1]?.id, icsOf(4)[0]?.id].filter(Boolean));
const benchSet  = new Set([icsOf(3)[2]?.id, icsOf(5)[1]?.id].filter(Boolean));

for (const e of engineers){
  if (e.id === directorId) continue;   // director not allocated to delivery
  let target;
  if (overAlloc.has(e.id)) target = 1.2;
  else if (benchSet.has(e.id)) target = 0.05;
  else target = clamp(gauss(0.85, 0.16), 0.1, 1.0);

  const pool = projIdsForGroup[e.groupId] || [6];
  if (target > 1.0 && pool.length >= 2){
    // split across two projects to exceed 100%
    addAlloc(e.id, pool[0], 0.65);
    addAlloc(e.id, pool[1], target - 0.65);
  } else {
    addAlloc(e.id, pick(pool), target);
  }
}

// a few realistic status letters (medical / PTO / resigned)
function setStatus(engId, mlist, code){ const r = allocRows.find(a => a.engId === engId); if (!r) return; mlist.forEach(m => { r.allocs[m] = code; }); }
const someoneFirmware = icsOf(1)[3]; if (someoneFirmware) setStatus(someoneFirmware.id, ['2026-04', '2026-05'], 'm');   // medical leave
const someonePTO = icsOf(2)[2]; if (someonePTO) setStatus(someonePTO.id, ['2026-08'], 'p');                            // PTO
const resigning = icsOf(5)[2]; if (resigning) setStatus(resigning.id, ['2026-10', '2026-11', '2026-12'], 'r');         // resigned

function addAlloc(engId, projectId, val){
  const allocs = {};
  const v = Math.round(clamp(val, 0, 1) * 100) / 100;
  MONTHS.forEach(m => { allocs[m] = v; });
  allocRows.push({ id: nextAllocId++, engId, projectId, allocs, budgetLine: '' });
}

/* ── KT plans (keyed by skill name; entries carry learnerEngId) ── */
const ktPlans = {};
function ktKey(name){ return 'kt_' + name; }
// pair a junior learner with each SPOF skill to de-risk it
SPOF_SKILLS.forEach(sp => {
  const learner = engineers.find(e => e.groupId === sp.group && e.idcard.seniority === 'Junior');
  if (learner) ktPlans[ktKey(sp.name)] = [{ id: Date.now() + Math.floor(rnd() * 1e6), learnerEngId: String(learner.id), targetLevel: 4, deadline: '2026-12', status: 'Planned', notes: 'De-risk SPOF: ' + sp.name }];
});

/* ── Pull nine-box / DISC placements into their maps; strip temp fields ── */
const nineBoxPlacements = {}, discPlacements = {};
engineers.forEach(e => { nineBoxPlacements[e.id] = e._nb; discPlacements[e.id] = e._disc; delete e._nb; delete e._disc; });

/* ══════════════════════════════════════════════════════════════════
   Assemble full_backup
   ══════════════════════════════════════════════════════════════════ */
const state = {
  projects, sections: [],
  engineers, engGroups: GROUPS.map(g => ({ id: g.id, name: g.name, color: g.color })),
  allocRows,
  nextId: projects.length + 1, nextTodoId: 1, nextRiskId: 1, nextMsId: 1, nextSectionId: 1, nextAnnotId: 1, nextActionId: 1,
  nextEngId, nextEngGroupId: GROUPS.length + 1, nextAllocId,
  sepX: 5, sepY: 5, scaleX: 'lin', scaleY: 'lin', yMode: 'impact',
  annotations: [], zoom: { scaleX: 1, scaleY: 1, panX: 0, panY: 0 },
  engDashGroupBy: 'group',
  skillDomains: SKILL_DOMAINS,
  ktPlans,
  orgAnnotations: [], orgLevelH: {}, orgLevelNames: {}, orgPositions: {}, orgCollapsed: {},
  orgScale: 1, orgPanX: 0, orgPanY: 0,
  nineBoxPlacements, discPlacements, nbSwapAxes: false,
  planFilterEng: [], planFilterProj: [], engDashFilterEng: [], engDashFilterProj: [],
  resTitle: 'Demo — Engineering Org', resStart: RES_START, resEnd: RES_END,
  axis: { xName: 'Effort', xMin: 0, xMax: 10, yMin: 0, yMax: 10, grid: 5 },
};

const backup = {
  _type: 'full_backup', _version: 1,
  _exportedAt: new Date().toISOString(),
  _photoCount: 0,
  _engineerCount: engineers.filter(e => !e.vacant).length,
  _projectCount: projects.length,
  state, _photos: {},
};

const outDir = join(ROOT, 'demo');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'matrix_demo_backup.json');
writeFileSync(outFile, JSON.stringify(backup, null, 2));

/* ── Console summary ── */
const byGroup = {}; engineers.forEach(e => { const n = GROUPS.find(g => g.id === e.groupId).name; byGroup[n] = (byGroup[n] || 0) + 1; });
const byLoc = {}; engineers.forEach(e => { byLoc[e.location] = (byLoc[e.location] || 0) + 1; });
const byGender = {}; engineers.forEach(e => { byGender[e.idcard.gender] = (byGender[e.idcard.gender] || 0) + 1; });
const bySen = {}; engineers.forEach(e => { bySen[e.idcard.seniority] = (bySen[e.idcard.seniority] || 0) + 1; });
const comps = engineers.map(e => e.idcard.comparatio);
console.log('✓ wrote ' + outFile);
console.log('  engineers: ' + engineers.length + ' · projects: ' + projects.length + ' · alloc rows: ' + allocRows.length);
console.log('  groups:   ', byGroup);
console.log('  locations:', byLoc);
console.log('  gender:   ', byGender);
console.log('  seniority:', bySen);
console.log('  compa-ratio: min ' + Math.min(...comps) + ' / mean ' + Math.round(comps.reduce((a, b) => a + b, 0) / comps.length) + ' / max ' + Math.max(...comps));
console.log('  over-allocated ids:', [...overAlloc], '· bench ids:', [...benchSet]);
console.log('  SPOF skills:', SPOF_SKILLS.map(s => s.name).join(', '));
