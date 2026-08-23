import { strict as assert } from 'assert';
import { test } from 'node:test';

// The lifecycle accessors live in helpers.js but read the PROJECT_LIFECYCLE table
// (globals.js) and — for _projCapacitySet — the `projects` array + _memo, all as bare
// bundle globals. globals.js runs t()/makeGateConfig() at MODULE LOAD, so we shim those
// on globalThis and DYNAMICALLY import it to get the real table (single source of truth),
// then expose it (and the capacity-set inputs) as globals the helpers resolve at call time.
globalThis.t = (s) => s;
globalThis.makeGateConfig = () => ({});
const { PROJECT_LIFECYCLE } = await import('../src/core/globals.js');
globalThis.PROJECT_LIFECYCLE = PROJECT_LIFECYCLE;
globalThis._memo = (k, fn) => fn();            // passthrough (no epoch cache in tests)
globalThis.projects = [];                       // _projCapacitySet reads this; set per-test
const {
  projLifecycle, projLifecycleDef, projConsumesCapacity, projIsActivePortfolio,
  projSetLifecycle, _projCapacitySet, _invalidateMemo,
} = await import('../src/core/helpers.js');

const proj = (over) => Object.assign({ id:1, name:'P' }, over||{});

/* ── accessors ──────────────────────────────────────────────────────── */

test('projLifecycle: missing/blank lifecycle reads as active (safe default)', () => {
  assert.equal(projLifecycle(proj()), 'active');
  assert.equal(projLifecycle(proj({lifecycle:''})), 'active');
  assert.equal(projLifecycle(proj({lifecycle:'proposed'})), 'proposed');
  assert.equal(projLifecycle(null), 'active');
});

test('projLifecycleDef: resolves by id; unknown id falls back to active (index 1)', () => {
  assert.equal(projLifecycleDef('on_hold').id, 'on_hold');
  assert.equal(projLifecycleDef(proj({lifecycle:'cancelled'})).id, 'cancelled');
  assert.equal(projLifecycleDef('bogus').id, 'active');   // fallback = PROJECT_LIFECYCLE[1]
});

test('projConsumesCapacity: true only for active / in_service / maintenance', () => {
  const consuming = PROJECT_LIFECYCLE.filter(s => s.consumes).map(s => s.id);
  assert.deepEqual(consuming.sort(), ['active','in_service','maintenance'].sort());
  assert.equal(projConsumesCapacity(proj({lifecycle:'active'})), true);
  assert.equal(projConsumesCapacity(proj({lifecycle:'on_hold'})), false);
  assert.equal(projConsumesCapacity(proj({lifecycle:'cancelled'})), false);
});

test('projIsActivePortfolio: terminal states drop out; on_hold stays in', () => {
  assert.equal(projIsActivePortfolio(proj({lifecycle:'active'})), true);
  assert.equal(projIsActivePortfolio(proj({lifecycle:'on_hold'})), true);
  assert.equal(projIsActivePortfolio(proj({lifecycle:'cancelled'})), false);
  assert.equal(projIsActivePortfolio(proj({lifecycle:'withdrawn'})), false);
  assert.equal(projIsActivePortfolio(proj({lifecycle:'eol'})), false);
});

/* ── projSetLifecycle ───────────────────────────────────────────────── */

test('projSetLifecycle: writes state + reason and appends a history entry', () => {
  const p = proj({lifecycle:'proposed'});
  const before = Date.now();
  const changed = projSetLifecycle(p, 'active', 'greenlit');
  assert.equal(changed, true);
  assert.equal(p.lifecycle, 'active');
  assert.equal(p.lifecycleReason, 'greenlit');
  assert.equal(p.lifecycleHistory.length, 1);
  const h = p.lifecycleHistory[0];
  assert.equal(h.from, 'proposed');
  assert.equal(h.to, 'active');
  assert.equal(h.reason, 'greenlit');
  assert.ok(h.ts >= before);
});

test('projSetLifecycle: from = the CURRENT state (default active when unset)', () => {
  const p = proj();                              // no lifecycle → reads as active
  projSetLifecycle(p, 'on_hold', 'pause');
  assert.equal(p.lifecycleHistory[0].from, 'active');
});

test('projSetLifecycle: rejects an unknown target state (no write, no history)', () => {
  const p = proj({lifecycle:'active'});
  assert.equal(projSetLifecycle(p, 'zombie', 'x'), false);
  assert.equal(p.lifecycle, 'active');
  assert.equal(p.lifecycleHistory, undefined);
});

test('projSetLifecycle: null project is a no-op', () => {
  assert.equal(projSetLifecycle(null, 'active', 'x'), false);
});

test('projSetLifecycle: same state with no new reason = no-op (no history churn)', () => {
  const p = proj({lifecycle:'active'});
  assert.equal(projSetLifecycle(p, 'active', null), false);
  assert.equal(p.lifecycleHistory, undefined);
});

test('projSetLifecycle: same state but a NEW reason still records the change', () => {
  const p = proj({lifecycle:'on_hold', lifecycleReason:'q3 freeze'});
  assert.equal(projSetLifecycle(p, 'on_hold', 'budget cut'), true);
  assert.equal(p.lifecycleReason, 'budget cut');
  assert.equal(p.lifecycleHistory.length, 1);
  assert.equal(p.lifecycleHistory[0].from, 'on_hold');
  assert.equal(p.lifecycleHistory[0].to, 'on_hold');
});

test('projSetLifecycle: a null reason on a real transition leaves prior reason intact', () => {
  const p = proj({lifecycle:'proposed', lifecycleReason:'intake note'});
  assert.equal(projSetLifecycle(p, 'active', null), true);
  assert.equal(p.lifecycle, 'active');
  assert.equal(p.lifecycleReason, 'intake note');    // only overwritten when a reason is given
  assert.equal(p.lifecycleHistory[0].reason, '');     // logged as blank
});

test('projSetLifecycle: transitions accumulate in order', () => {
  const p = proj({lifecycle:'proposed'});
  projSetLifecycle(p, 'active', 'fund');
  projSetLifecycle(p, 'on_hold', 'pause');
  projSetLifecycle(p, 'cancelled', 'kill');
  assert.deepEqual(p.lifecycleHistory.map(h => h.to), ['active','on_hold','cancelled']);
  assert.deepEqual(p.lifecycleHistory.map(h => h.from), ['proposed','active','on_hold']);
});

/* ── _projCapacitySet (suppression choke point) ─────────────────────── */

test('_projCapacitySet: only consuming projects are in the set', () => {
  _invalidateMemo();                             // set is memoised by epoch (saveState clears it)
  globalThis.projects = [
    proj({id:1, lifecycle:'active'}),
    proj({id:2, lifecycle:'proposed'}),
    proj({id:3, lifecycle:'on_hold'}),
    proj({id:4, lifecycle:'in_service'}),
    proj({id:5, lifecycle:'maintenance'}),
    proj({id:6, lifecycle:'cancelled'}),
    proj({id:7, lifecycle:'withdrawn'}),
    proj({id:8, lifecycle:'eol'}),
  ];
  const s = _projCapacitySet();
  assert.deepEqual([...s].sort((a,b)=>a-b), [1,4,5]);
  assert.equal(s.has(2), false);   // proposed suppressed
  assert.equal(s.has(3), false);   // on_hold suppressed
  assert.equal(s.has(6), false);   // cancelled suppressed
});

test('_projCapacitySet: a lifecycle-less project defaults to active → counts', () => {
  _invalidateMemo();                             // drop the previous test's cached set
  globalThis.projects = [ proj({id:9}), proj({id:10, lifecycle:'on_hold'}) ];
  const s = _projCapacitySet();
  assert.equal(s.has(9), true);    // undefined lifecycle → active → consumes
  assert.equal(s.has(10), false);
});
