import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  newUid, isLegacyKey, uidRemapObj, uidRemapIds,
  makeEngineer, makeProject, makeAllocRow,
} from '../src/data/model.js';

/* ── newUid ─────────────────────────────────────────────────────────────── */
test('newUid — returns a valid v4-shaped uuid', () => {
  const u = newUid();
  assert.match(u, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('newUid — is unique across many calls', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(newUid());
  assert.equal(seen.size, 5000);
});

/* ── isLegacyKey (the idempotency test: uid vs bare-int) ─────────────────── */
test('isLegacyKey — a bare integer is legacy, a uuid is not', () => {
  assert.equal(isLegacyKey('3'), true);
  assert.equal(isLegacyKey(3), true);
  assert.equal(isLegacyKey('0'), true);
  assert.equal(isLegacyKey(newUid()), false);
  assert.equal(isLegacyKey('abc'), false);
});

/* ── uidRemapObj (nine-box / DISC / photo re-key) ───────────────────────── */
test('uidRemapObj — remaps legacy keys, keeps uid keys and orphans', () => {
  const uidA = newUid(), uidB = newUid(), preExisting = newUid();
  const idToUid = { '1': uidA, '2': uidB };
  const src = { '1': 'star', '2': 'core', '9': 'orphan', [preExisting]: 'already-uid' };
  const out = uidRemapObj(src, idToUid);
  assert.equal(out[uidA], 'star');
  assert.equal(out[uidB], 'core');
  assert.equal(out['9'], 'orphan');            // no mapping → passed through untouched
  assert.equal(out[preExisting], 'already-uid'); // already a uid → untouched
  assert.equal(Object.keys(out).length, 4);
});

test('uidRemapObj — is idempotent (a second pass is a no-op)', () => {
  const uidA = newUid();
  const idToUid = { '1': uidA };
  const once = uidRemapObj({ '1': 'x' }, idToUid);
  const twice = uidRemapObj(once, idToUid);
  assert.deepEqual(twice, once);
  assert.equal(twice[uidA], 'x');
});

test('uidRemapObj — tolerates null/undefined', () => {
  assert.equal(uidRemapObj(null, {}), null);
  assert.equal(uidRemapObj(undefined, {}), undefined);
});

/* ── uidRemapIds (finExclude) — orphans are DROPPED, not kept ────────────── */
test('uidRemapIds — remaps known ids and drops orphans', () => {
  const uidA = newUid(), keepUid = newUid();
  const idToUid = { '1': uidA };
  const out = uidRemapIds(['1', '9', keepUid], idToUid);
  assert.deepEqual(out.sort(), [uidA, keepUid].sort()); // '9' (orphan) dropped
});

/* ── Factories stamp a uid, and it is not shared ────────────────────────── */
test('factories — makeEngineer/makeProject/makeAllocRow each carry a uid', () => {
  assert.match(makeEngineer().uid, /-/);
  assert.match(makeProject().uid, /-/);
  assert.match(makeAllocRow().uid, /-/);
});

test('factories — two instances get DIFFERENT uids (not a shared default)', () => {
  assert.notEqual(makeEngineer().uid, makeEngineer().uid);
  assert.notEqual(makeProject().uid, makeProject().uid);
  assert.notEqual(makeAllocRow().uid, makeAllocRow().uid);
});

/* ── Migration semantics (mirror of uidMigrate's core, DOM-free) ─────────── */
// Mirrors the load-time backfill + re-key so we can assert the end-to-end
// behaviour without importing persist.js (which pulls in DOM/localStorage).
function migrate(state) {
  state.engineers.forEach(e => { if (!e.uid) e.uid = newUid(); });
  state.projects.forEach(p => { if (!p.uid) p.uid = newUid(); });
  state.allocRows.forEach(r => { if (!r.uid) r.uid = newUid(); });
  const idToUid = {};
  state.engineers.forEach(e => { if (e.id != null && e.uid) idToUid[String(e.id)] = e.uid; });
  state.nineBox = uidRemapObj(state.nineBox, idToUid);
  state.finExclude = uidRemapIds(state.finExclude, idToUid);
  return idToUid;
}

test('migration — a legacy dataset ends up fully uid-keyed and consistent', () => {
  const state = {
    engineers: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Bo' }],
    projects:  [{ id: 1, name: 'Apollo' }],
    allocRows: [{ id: 1, engId: 1 }],
    nineBox:   { '1': '3-3', '2': '2-2' },   // id-keyed placements
    finExclude: ['2'],
  };
  migrate(state);
  const ana = state.engineers[0], bo = state.engineers[1];
  assert.ok(ana.uid && bo.uid && ana.uid !== bo.uid);
  // placements now keyed by uid, and point to the right person
  assert.equal(state.nineBox[ana.uid], '3-3');
  assert.equal(state.nineBox[bo.uid], '2-2');
  assert.equal(Object.keys(state.nineBox).every(k => !isLegacyKey(k)), true);
  // finExclude re-keyed to Bo's uid
  assert.deepEqual(state.finExclude, [bo.uid]);
});

test('migration — running twice does not change a migrated dataset', () => {
  const state = {
    engineers: [{ id: 1, name: 'Ana' }],
    projects: [], allocRows: [],
    nineBox: { '1': '3-3' }, finExclude: ['1'],
  };
  migrate(state);
  const snapshot = JSON.stringify(state);
  migrate(state);   // second pass
  assert.equal(JSON.stringify(state), snapshot);
});

test('migration — a merge of two datasets keeps placements on the right people', () => {
  // The whole point of uid: engineer id=1 in two datasets are DIFFERENT people.
  const dsA = { engineers: [{ id: 1, name: 'Ana' }], projects: [], allocRows: [],
                nineBox: { '1': '3-3' }, finExclude: [] };
  const dsB = { engineers: [{ id: 1, name: 'Bo' }], projects: [], allocRows: [],
                nineBox: { '1': '1-1' }, finExclude: [] };
  migrate(dsA); migrate(dsB);
  // After migration the two "id 1" people have distinct uids and distinct cells.
  assert.notEqual(dsA.engineers[0].uid, dsB.engineers[0].uid);
  assert.equal(dsA.nineBox[dsA.engineers[0].uid], '3-3');
  assert.equal(dsB.nineBox[dsB.engineers[0].uid], '1-1');
  // Merging the placement maps now does NOT collide (would have under id keys).
  const merged = Object.assign({}, dsA.nineBox, dsB.nineBox);
  assert.equal(Object.keys(merged).length, 2);
});
