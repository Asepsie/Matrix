import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  HOME_THRESHOLDS, HOME_BAND_RANK,
  homeHash, homeMondayKey, homeEngImpact,
  homeClassifyPerson, homeClassifyProject,
  homeSuppress, homeApplyState, homeFilterItems, homeRank,
} from '../src/sections/home.js';

// A minimal analytics-dataset person row (only the fields the classifier reads).
function person(over){
  return Object.assign({
    id:1, uid:'u1', name:'Ann Lee',
    riskScore:0, riskFactors:[],
    utilizationPct:100, monthlyCost:5000,
    reviewCurrencyMonths:5, tenureMonths:24,
    spofSkills:[], hasKTPlan:true,
    isManager:false, grade:5, hasSuccessor:true,
    _eng:{},
  }, over||{});
}
const NOW = new Date('2026-07-24T12:00:00Z');
const popt = (o)=>Object.assign({ engProjects:{}, projRiskAdj:{}, thresholds:HOME_THRESHOLDS, now:NOW, engagement:{touchpoints:[]} }, o||{});

test('retention band: >=50 critical, 25–49 warn, <25 none', () => {
  const crit = homeClassifyPerson(person({riskScore:60}), popt());
  const warn = homeClassifyPerson(person({riskScore:30}), popt());
  const none = homeClassifyPerson(person({riskScore:10}), popt());
  const rc = crit.find(i=>i.concern==='retention-risk');
  const rw = warn.find(i=>i.concern==='retention-risk');
  assert.equal(rc.band, 'critical');
  assert.equal(rw.band, 'warn');
  assert.equal(none.find(i=>i.concern==='retention-risk'), undefined);
});

test('over-allocation band: >130 critical else warn; bench watch', () => {
  const hot  = homeClassifyPerson(person({utilizationPct:140}), popt());
  const warm = homeClassifyPerson(person({utilizationPct:120}), popt());
  const idle = homeClassifyPerson(person({utilizationPct:2}), popt());
  assert.equal(hot.find(i=>i.concern==='over-allocation').band, 'critical');
  assert.equal(warm.find(i=>i.concern==='over-allocation').band, 'warn');
  assert.equal(idle.find(i=>i.concern==='bench').band, 'watch');
});

test('stale-review fires on >15mo or never-reviewed-but-tenured', () => {
  const stale = homeClassifyPerson(person({reviewCurrencyMonths:20}), popt());
  const never = homeClassifyPerson(person({reviewCurrencyMonths:null, tenureMonths:18}), popt());
  const fresh = homeClassifyPerson(person({reviewCurrencyMonths:3}), popt());
  assert.ok(stale.some(i=>i.concern==='stale-review'));
  assert.ok(never.some(i=>i.concern==='stale-review'));
  assert.ok(!fresh.some(i=>i.concern==='stale-review'));
});

test('engagement-due: overdue is warn, this-week is watch', () => {
  const cur = homeMondayKey(NOW);
  const prev = homeMondayKey(new Date(NOW.getTime()-7*864e5));
  const thisWk = homeClassifyPerson(person(), popt({ engagement:{touchpoints:[{week:cur,done:false}]} }));
  const overdue = homeClassifyPerson(person(), popt({ engagement:{touchpoints:[{week:prev,done:false}]} }));
  const done = homeClassifyPerson(person(), popt({ engagement:{touchpoints:[{week:cur,done:true}]} }));
  assert.equal(thisWk.find(i=>i.concern==='engagement-due').band, 'watch');
  assert.equal(overdue.find(i=>i.concern==='engagement-due').band, 'warn');
  assert.equal(done.find(i=>i.concern==='engagement-due'), undefined);
});

test('suppression: critical retention hides same person capacity/gov cards', () => {
  const items = homeClassifyPerson(person({riskScore:60, utilizationPct:140}), popt());
  assert.ok(items.some(i=>i.concern==='over-allocation'));   // present pre-suppression
  const kept = homeSuppress(items);
  assert.ok(kept.some(i=>i.concern==='retention-risk'));
  assert.ok(!kept.some(i=>i.concern==='over-allocation'));   // suppressed
});

test('suppression: over-allocation on a NON-risky person survives', () => {
  const items = homeClassifyPerson(person({riskScore:0, utilizationPct:140}), popt());
  const kept = homeSuppress(items);
  assert.ok(kept.some(i=>i.concern==='over-allocation'));
});

test('impact: two-project blast sum, ×1.5 SPOF boost', () => {
  const engProjects = { 1:[10,20] };
  const projRiskAdj = { 10:1000, 20:2000 };
  const plain = homeEngImpact(person(), engProjects, projRiskAdj, HOME_THRESHOLDS);
  const spof  = homeEngImpact(person({spofSkills:['x'], hasKTPlan:false}), engProjects, projRiskAdj, HOME_THRESHOLDS);
  assert.equal(plain, 3000);
  assert.equal(spof, 4500);
});

test('impact: project uses its own risk-adjusted NPV, negatives floored to 0', () => {
  const a = homeClassifyProject({ p:{id:10,uid:'p10',name:'X'}, sig:{riskAdjNpv:1234, npv:9999, conflicts:1}, readiness:{blocked:false,pct:100} }, {thresholds:HOME_THRESHOLDS});
  assert.equal(a[0].impact, 1234);
  const b = homeClassifyProject({ p:{id:11,uid:'p11',name:'Y'}, sig:{riskAdjNpv:-500, conflicts:2}, readiness:{blocked:false,pct:100} }, {thresholds:HOME_THRESHOLDS});
  assert.equal(b[0].impact, 0);
});

test('rank: band before impact, impact desc within band, title tiebreak', () => {
  const mk = (band,impact,title)=>({band,impact,title});
  const sorted = homeRank([
    mk('watch',999,'z'), mk('critical',10,'b'), mk('critical',100,'a'), mk('warn',50,'m'),
    mk('critical',100,'a2'),
  ]);
  assert.deepEqual(sorted.map(i=>i.title), ['a','a2','b','m','z']);
});

test('hash resurface: dismissed while unchanged stays hidden; changed signal reappears + prunes', () => {
  const item = { id:'c:project:p1', hash:'h1', band:'warn', impact:1, title:'x' };
  const prefs = { snoozed:{}, dismissed:{ 'c:project:p1':{ hash:'h1' } } };
  assert.equal(homeApplyState([item], prefs, NOW).length, 0);            // unchanged → hidden
  const changed = Object.assign({}, item, { hash:'h2' });
  const out = homeApplyState([changed], prefs, NOW);
  assert.equal(out.length, 1);                                           // signal changed → resurfaces
  assert.equal(prefs.dismissed['c:project:p1'], undefined);             // stale dismissal pruned
});

test('snooze: future snooze hides, past snooze shows', () => {
  const item = { id:'x', hash:'h', band:'watch', impact:0, title:'t' };
  const future = { snoozed:{ x:{ until:new Date(NOW.getTime()+864e5).toISOString() } }, dismissed:{} };
  const past   = { snoozed:{ x:{ until:new Date(NOW.getTime()-864e5).toISOString() } }, dismissed:{} };
  assert.equal(homeApplyState([item], future, NOW).length, 0);
  assert.equal(homeApplyState([item], past, NOW).length, 1);
});

test('null-tolerance: an all-null project signal yields no items', () => {
  const items = homeClassifyProject({
    p:{id:9,uid:'p9',name:'Empty'},
    sig:{npv:null,riskAdjNpv:null,pi:null,unitMargin:null,conflicts:null,dtcGap:null,chanHHI:null},
    readiness:{blocked:false,pct:100,blockers:[]},
  }, {thresholds:HOME_THRESHOLDS});
  assert.equal(items.length, 0);
});

test('filter: domain + minBand', () => {
  const items = [
    { domain:'people', band:'critical' }, { domain:'people', band:'watch' },
    { domain:'portfolio', band:'warn' }, { domain:'governance', band:'critical' },
  ];
  assert.equal(homeFilterItems(items, 'people', 'watch').length, 2);
  assert.equal(homeFilterItems(items, 'all', 'warn').length, 3);        // drops the lone watch
  assert.equal(homeFilterItems(items, 'governance', 'critical').length, 1);
  assert.equal(HOME_BAND_RANK.critical < HOME_BAND_RANK.watch, true);
});

test('homeHash is stable and differs on change', () => {
  assert.equal(homeHash('abc'), homeHash('abc'));
  assert.notEqual(homeHash('abc'), homeHash('abd'));
});
