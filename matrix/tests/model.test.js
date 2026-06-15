import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  makeEngineer, makeIdCard, makeSuccessionPlan,
  makeProject, makeAllocRow, makeSkill, makeCop, makeReview,
} from '../src/data/model.js';

test('makeEngineer — all required top-level fields present', () => {
  const e = makeEngineer();
  const required = [
    'id', 'name', 'monthlyCost', 'groupId', 'role', 'location',
    'vacant', 'planningOnly', 'includeInCost', 'excludeFromCalc',
    'includeTalent', 'skills', 'idcard',
  ];
  for (const f of required) {
    assert.ok(Object.prototype.hasOwnProperty.call(e, f), `missing field: ${f}`);
  }
});

test('makeEngineer — correct defaults', () => {
  const e = makeEngineer();
  assert.equal(e.name,            'New Engineer');
  assert.equal(e.monthlyCost,     8000);
  assert.equal(e.groupId,         null);
  assert.equal(e.vacant,          false);
  assert.equal(e.planningOnly,    false);
  assert.equal(e.includeInCost,   false);
  assert.equal(e.excludeFromCalc, false);
  assert.equal(e.includeTalent,   true);
  assert.deepEqual(e.skills, []);
});

test('makeEngineer — overrides are applied', () => {
  const e = makeEngineer({ name: 'Alice', monthlyCost: 9000 });
  assert.equal(e.name,        'Alice');
  assert.equal(e.monthlyCost, 9000);
  assert.equal(e.includeTalent, true); // unoverridden defaults stay
});

test('makeIdCard — all required fields present', () => {
  const c = makeIdCard();
  const required = [
    'reportsTo', 'manager', 'seniority', 'startdate', 'reviewdate',
    'languages', 'gender', 'aspirations', 'strengths', 'devarea', 'notes',
    'comparatio', 'contract', 'photo', 'cops', 'reviews',
    'succession', '_isDictionary',
  ];
  for (const f of required) {
    assert.ok(Object.prototype.hasOwnProperty.call(c, f), `missing idcard field: ${f}`);
  }
});

test('makeIdCard — succession is a makeSuccessionPlan object', () => {
  const c = makeIdCard();
  assert.ok(c.succession !== null && typeof c.succession === 'object');
  assert.ok(Object.prototype.hasOwnProperty.call(c.succession, 'successorId'));
  assert.ok(Object.prototype.hasOwnProperty.call(c.succession, 'successorFreeText'));
  assert.ok(Object.prototype.hasOwnProperty.call(c.succession, 'timeframe'));
  assert.ok(Object.prototype.hasOwnProperty.call(c.succession, 'gaps'));
});

test('makeEngineer — idcard is nested and contains succession', () => {
  const e = makeEngineer();
  assert.ok(e.idcard && typeof e.idcard === 'object');
  assert.ok(e.idcard.succession && typeof e.idcard.succession === 'object');
});

test('nested arrays are not shared references between calls', () => {
  const e1 = makeEngineer();
  const e2 = makeEngineer();
  assert.notEqual(e1.skills,            e2.skills,            'skills array shared');
  assert.notEqual(e1.idcard,            e2.idcard,            'idcard object shared');
  assert.notEqual(e1.idcard.cops,       e2.idcard.cops,       'idcard.cops array shared');
  assert.notEqual(e1.idcard.reviews,    e2.idcard.reviews,    'idcard.reviews array shared');
  assert.notEqual(e1.idcard.succession, e2.idcard.succession, 'idcard.succession object shared');
});

test('makeProject — all required fields present with correct defaults', () => {
  const p = makeProject();
  assert.equal(p.x,          5);
  assert.equal(p.y,          5);
  assert.equal(p.vis,        5);
  assert.equal(p.ena,        5);
  assert.equal(p.visible,    true);
  assert.equal(p.costSource, 'plan');
  assert.equal(p.planCost,   0);
  assert.equal(p.impactEur,  null);
  assert.deepEqual(p.todos,      []);
  assert.deepEqual(p.risks,      []);
  assert.deepEqual(p.milestones, []);
  assert.deepEqual(p.actions,    []);
});

test('makeProject — nested arrays are not shared references', () => {
  const p1 = makeProject();
  const p2 = makeProject();
  assert.notEqual(p1.todos,      p2.todos);
  assert.notEqual(p1.risks,      p2.risks);
  assert.notEqual(p1.milestones, p2.milestones);
  assert.notEqual(p1.actions,    p2.actions);
});

test('makeAllocRow — correct shape', () => {
  const r = makeAllocRow();
  assert.equal(r.engId,      null);
  assert.equal(r.projectId,  null);
  assert.equal(r.budgetLine, '');
  assert.ok(r.allocs !== null && typeof r.allocs === 'object');
});

test('makeAllocRow — allocs objects are not shared', () => {
  const r1 = makeAllocRow();
  const r2 = makeAllocRow();
  assert.notEqual(r1.allocs, r2.allocs);
});

test('makeSkill — correct defaults', () => {
  const s = makeSkill();
  assert.equal(s.cat,   'mand');
  assert.equal(s.level, 3);
  assert.equal(s.domain, '');
});

test('makeCop — correct shape', () => {
  const c = makeCop();
  assert.ok(Object.prototype.hasOwnProperty.call(c, 'name'));
  assert.ok(Object.prototype.hasOwnProperty.call(c, 'goal'));
  assert.ok(Object.prototype.hasOwnProperty.call(c, 'notes'));
});

test('makeReview — correct shape', () => {
  const r = makeReview();
  assert.ok(Object.prototype.hasOwnProperty.call(r, 'year'));
  assert.ok(Object.prototype.hasOwnProperty.call(r, 'rating'));
  assert.ok(Object.prototype.hasOwnProperty.call(r, 'comments'));
});

test('makeSuccessionPlan — correct shape', () => {
  const s = makeSuccessionPlan();
  assert.equal(s.successorId,       '');
  assert.equal(s.successorFreeText, '');
  assert.equal(s.timeframe,         '');
  assert.equal(s.gaps,              '');
});
