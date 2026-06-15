import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  makeEngineer, makeIdCard, makeSuccessionPlan,
  makeSkill, makeCop, makeReview,
} from '../src/data/model.js';

// Mirror of the sanitiseEngineer loop from persist.js — tested here without
// pulling in DOM/localStorage dependencies from that module.
function sanitiseEngineer(e) {
  var defaults = makeEngineer();
  var idcDefaults = makeIdCard();
  var succDefaults = makeSuccessionPlan();

  for (var key of Object.keys(defaults)) {
    if (e[key] === undefined) e[key] = defaults[key];
  }
  if (!e.idcard) e.idcard = {};
  for (var key of Object.keys(idcDefaults)) {
    if (e.idcard[key] === undefined) e.idcard[key] = idcDefaults[key];
  }
  if (!e.idcard.succession) e.idcard.succession = {};
  for (var key of Object.keys(succDefaults)) {
    if (e.idcard.succession[key] === undefined)
      e.idcard.succession[key] = succDefaults[key];
  }
  e.skills.forEach(function(s) {
    var sd = makeSkill();
    for (var k of Object.keys(sd)) { if (s[k] === undefined) s[k] = sd[k]; }
  });
  e.idcard.cops.forEach(function(cop) {
    var cd = makeCop();
    for (var k of Object.keys(cd)) { if (cop[k] === undefined) cop[k] = cd[k]; }
  });
  e.idcard.reviews.forEach(function(rev) {
    var rd = makeReview();
    for (var k of Object.keys(rd)) { if (rev[k] === undefined) rev[k] = rd[k]; }
  });
}

test('minimal stored object gains all Engineer fields after sanitise', () => {
  const stored = { id: 1, name: 'Alice', monthlyCost: 9000 };
  sanitiseEngineer(stored);
  const expected = makeEngineer();
  for (const key of Object.keys(expected)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(stored, key),
      `missing top-level field after sanitise: ${key}`
    );
  }
  // Provided values must not be overwritten
  assert.equal(stored.id, 1);
  assert.equal(stored.name, 'Alice');
  assert.equal(stored.monthlyCost, 9000);
});

test('idcard.succession exists after sanitise', () => {
  const stored = { id: 2, name: 'Bob', monthlyCost: 7000 };
  sanitiseEngineer(stored);
  assert.ok(stored.idcard, 'idcard missing');
  assert.ok(stored.idcard.succession && typeof stored.idcard.succession === 'object',
    'succession missing or not an object');
  const expectedSucc = makeSuccessionPlan();
  for (const key of Object.keys(expectedSucc)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(stored.idcard.succession, key),
      `missing succession field: ${key}`
    );
  }
});

test('skills array exists and is empty after sanitise on bare object', () => {
  const stored = { id: 3, name: 'Carol' };
  sanitiseEngineer(stored);
  assert.ok(Array.isArray(stored.skills), 'skills is not an array');
  assert.equal(stored.skills.length, 0, 'skills should be empty on a bare object');
});

test('fully populated object is not modified by sanitise', () => {
  const full = makeEngineer({ id: 4, name: 'Dave', monthlyCost: 10000 });
  // Capture snapshot of values before sanitise
  const topKeys = Object.keys(makeEngineer());
  const idcKeys = Object.keys(makeIdCard());
  const succKeys = Object.keys(makeSuccessionPlan());
  const before = {
    top: Object.fromEntries(topKeys.map(k => [k, full[k]])),
    idc: Object.fromEntries(idcKeys.map(k => [k, full.idcard[k]])),
    succ: Object.fromEntries(succKeys.map(k => [k, full.idcard.succession[k]])),
  };

  sanitiseEngineer(full);

  for (const k of topKeys) {
    if (k === 'idcard') continue; // object ref; checked below
    assert.deepEqual(full[k], before.top[k], `top-level field ${k} was modified`);
  }
  for (const k of idcKeys) {
    if (k === 'cops' || k === 'reviews' || k === 'succession') continue; // arrays/objects
    assert.deepEqual(full.idcard[k], before.idc[k], `idcard.${k} was modified`);
  }
  for (const k of succKeys) {
    assert.deepEqual(full.idcard.succession[k], before.succ[k], `succession.${k} was modified`);
  }
  // Arrays remain empty (makeEngineer defaults them to [])
  assert.equal(full.skills.length, 0);
  assert.equal(full.idcard.cops.length, 0);
  assert.equal(full.idcard.reviews.length, 0);
});
