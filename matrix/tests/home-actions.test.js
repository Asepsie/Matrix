import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  HOME_THRESHOLDS, HOME_BAND_RANK,
  homeHash, homeMondayKey, homeEngImpact,
  homeClassifyPerson, homeClassifyProject, homeClassifyTask,
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

test('gate-behind only fires for an ENGAGED project (fresh projects are not "behind")', () => {
  const base = { p:{id:5,uid:'p5',name:'Fresh'}, sig:{riskAdjNpv:100}, readiness:{blocked:false,pct:10,blockers:[]} };
  const fresh = homeClassifyProject(base, {thresholds:HOME_THRESHOLDS});
  const engaged = homeClassifyProject(Object.assign({}, base, {gateEngaged:true}), {thresholds:HOME_THRESHOLDS});
  assert.equal(fresh.some(i=>i.concern==='gate-behind'), false);
  assert.equal(engaged.some(i=>i.concern==='gate-behind'), true);
});

test('gate-blocked still fires on a real (hard) block regardless of engagement', () => {
  const items = homeClassifyProject({ p:{id:6,uid:'p6',name:'Stuck'}, sig:{riskAdjNpv:500}, readiness:{blocked:true,pct:20,blockers:[{id:'c1'}]} }, {thresholds:HOME_THRESHOLDS});
  assert.ok(items.some(i=>i.concern==='gate-blocked' && i.band==='critical'));
});

// ── Lifecycle nudges (disposition axis) ─────────────────────────────────────
const NOW2 = new Date('2026-08-22T12:00:00Z');
const daysAgoMs = (n) => NOW2.getTime() - n*86400000;
const popj = (o) => Object.assign({ thresholds:HOME_THRESHOLDS, now:NOW2 }, o||{});

test('hold-stale: on_hold beyond holdStaleDays fires warn; under threshold is quiet', () => {
  const mk = (days) => ({ p:{id:1,uid:'p1',name:'Paused'}, sig:{riskAdjNpv:100},
    lifecycle:'on_hold', lifecycleHistory:[{from:'active',to:'on_hold',ts:daysAgoMs(days)}] });
  const stale = homeClassifyProject(mk(120), popj());
  const fresh = homeClassifyProject(mk(30), popj());
  const s = stale.find(i=>i.concern==='hold-stale');
  assert.ok(s && s.band==='warn' && s.domain==='governance');
  assert.match(s.why[0], /120 days/);
  assert.equal(fresh.some(i=>i.concern==='hold-stale'), false);
});

test('hold-stale: exactly at the threshold fires (>=), and uses the LATEST hold transition', () => {
  const at = homeClassifyProject({ p:{id:1,uid:'p1',name:'P'}, sig:{},
    lifecycle:'on_hold', lifecycleHistory:[{to:'on_hold',ts:daysAgoMs(90)}] }, popj());
  assert.ok(at.some(i=>i.concern==='hold-stale'));
  // a re-hold resets the clock: an old hold + a recent re-hold → measured from the recent one
  const rehold = homeClassifyProject({ p:{id:1,uid:'p1',name:'P'}, sig:{}, lifecycle:'on_hold',
    lifecycleHistory:[{to:'on_hold',ts:daysAgoMs(200)},{to:'active',ts:daysAgoMs(150)},{to:'on_hold',ts:daysAgoMs(10)}] }, popj());
  assert.equal(rehold.some(i=>i.concern==='hold-stale'), false);   // only 10 days since latest hold
});

test('hold-stale: on_hold with no history entry (or not on_hold) does not fire', () => {
  const noHist = homeClassifyProject({ p:{id:1,uid:'p1',name:'P'}, sig:{}, lifecycle:'on_hold', lifecycleHistory:[] }, popj());
  assert.equal(noHist.some(i=>i.concern==='hold-stale'), false);
  const active = homeClassifyProject({ p:{id:1,uid:'p1',name:'P'}, sig:{}, lifecycle:'active' }, popj());
  assert.equal(active.some(i=>i.concern==='hold-stale'), false);
});

test('candidate-stale: a Proposed project with PI<1 or negative NPV fires warn (portfolio)', () => {
  const byPi  = homeClassifyProject({ p:{id:2,uid:'p2',name:'Weak'}, sig:{pi:0.6, riskAdjNpv:5}, lifecycle:'proposed' }, popj());
  const byNpv = homeClassifyProject({ p:{id:3,uid:'p3',name:'Neg'},  sig:{riskAdjNpv:-1000},     lifecycle:'proposed' }, popj());
  const cp = byPi.find(i=>i.concern==='candidate-stale');
  assert.ok(cp && cp.band==='warn' && cp.domain==='portfolio');
  assert.ok(byNpv.some(i=>i.concern==='candidate-stale'));
});

test('candidate-stale: a healthy Proposed candidate does not fire', () => {
  const good = homeClassifyProject({ p:{id:2,uid:'p2',name:'Strong'}, sig:{pi:1.8, riskAdjNpv:9000}, lifecycle:'proposed' }, popj());
  assert.equal(good.some(i=>i.concern==='candidate-stale'), false);
});

test('proposed value-destroyer emits candidate-stale INSTEAD of the generic value-destroying', () => {
  const proposed = homeClassifyProject({ p:{id:2,uid:'p2',name:'Weak'}, sig:{pi:0.6}, lifecycle:'proposed' }, popj());
  assert.equal(proposed.some(i=>i.concern==='candidate-stale'), true);
  assert.equal(proposed.some(i=>i.concern==='value-destroying'), false);   // not double-counted
  // a funded/active project with the same PI keeps the generic flag
  const active = homeClassifyProject({ p:{id:2,uid:'p2',name:'Weak'}, sig:{pi:0.6}, lifecycle:'active' }, popj());
  assert.equal(active.some(i=>i.concern==='value-destroying'), true);
  assert.equal(active.some(i=>i.concern==='candidate-stale'), false);
});

test('planner tasks: overdue is warn, pinned is watch, done yields nothing', () => {
  const over = homeClassifyTask({ pid:1, pname:'P', kind:'todo', id:9, text:'Ship', done:false, due:'2020-01-01', execPin:false, overdue:true }, {});
  const pin  = homeClassifyTask({ pid:1, pname:'P', kind:'action', id:8, text:'Call', done:false, due:'', execPin:true, overdue:false }, {});
  const done = homeClassifyTask({ pid:1, pname:'P', kind:'todo', id:7, text:'x', done:true, overdue:true, execPin:true }, {});
  assert.equal(over[0].concern, 'task-overdue');
  assert.equal(over[0].band, 'warn');
  assert.equal(over[0].domain, 'planner');
  assert.equal(over[0].entityUid, '1-todo-9');
  assert.equal(pin[0].concern, 'task-pinned');
  assert.equal(pin[0].band, 'watch');
  assert.equal(done.length, 0);
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
