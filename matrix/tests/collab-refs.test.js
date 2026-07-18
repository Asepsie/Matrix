import { strict as assert } from 'assert';
import { test } from 'node:test';

/* Mirror of the uid-anchored intra-dataset reference machinery
   (persist.js refsBackfill/refsRelink + collab.js collabCanonical/collabMaterialize)
   as pure functions, so the collision-healing can be verified without a browser/Yjs.
   Keep in lockstep with those functions.

   The bug being fixed: allocRow.engId / idcard.reportsTo are per-dataset id counters.
   Two people creating new entities OFFLINE both draw id 5 → on merge the two "id 5"
   engineers are different humans, so an allocation keyed by engId:5 lands on the wrong
   one. Fix: mirror each id ref to a durable uid ref (backfill, uid←id), strip the local
   id from the synced form (canonical), then rebuild ids from uids after merge (materialize
   + relink, id←uid) — assigning fresh local ids so nothing collides. */

function refMaps(engs, projs) {
  const engIdToUid = {}, engUidToId = {}, projIdToUid = {}, projUidToId = {};
  engs.forEach(e => { if (e.uid) { if (e.id != null) engIdToUid[String(e.id)] = e.uid; engUidToId[e.uid] = e.id; } });
  projs.forEach(p => { if (p.uid) { if (p.id != null) projIdToUid[String(p.id)] = p.uid; projUidToId[p.uid] = p.id; } });
  return { engIdToUid, engUidToId, projIdToUid, projUidToId };
}
function refsBackfill(engs, projs, allocs) {                     // uid ← id
  const m = refMaps(engs, projs);
  allocs.forEach(r => {
    r.engUid     = (r.engId != null     && m.engIdToUid[String(r.engId)])     ? m.engIdToUid[String(r.engId)]     : null;
    r.projectUid = (r.projectId != null && m.projIdToUid[String(r.projectId)])? m.projIdToUid[String(r.projectId)]: null;
  });
  engs.forEach(e => {
    const ic = e.idcard; if (!ic) return;
    ic.reportsToUid = (ic.reportsTo && m.engIdToUid[String(ic.reportsTo)]) ? m.engIdToUid[String(ic.reportsTo)] : '';
  });
}
function canonical(o, type) {                                   // strip local id + numeric refs
  const c = JSON.parse(JSON.stringify(o));
  delete c.id;
  if (type === 'allocRow') { delete c.engId; delete c.projectId; }
  else if (type === 'engineer' && c.idcard) { delete c.idcard.reportsTo; }
  return c;
}
function refsRelink(engs, projs, allocs) {                      // id ← uid
  const m = refMaps(engs, projs);
  allocs.forEach(r => {
    r.engId     = (r.engUid     && m.engUidToId[r.engUid]     != null) ? m.engUidToId[r.engUid]     : null;
    r.projectId = (r.projectUid && m.projUidToId[r.projectUid] != null) ? m.projUidToId[r.projectUid] : null;
  });
  engs.forEach(e => {
    const ic = e.idcard; if (!ic) return;
    ic.reportsTo = (ic.reportsToUid && m.engUidToId[ic.reportsToUid] != null) ? String(m.engUidToId[ic.reportsToUid]) : '';
  });
}
function uidIdMap(arr) { const m = {}; arr.forEach(o => { if (o.uid && o.id != null) m[o.uid] = o.id; }); return m; }
function materialize(engs, projs, allocs, prev, ctr) {          // assign local ids + relink
  engs.forEach(e   => { if (e.uid) e.id = (prev.eng[e.uid]   != null) ? prev.eng[e.uid]   : ctr.eng++; });
  projs.forEach(p  => { if (p.uid) p.id = (prev.proj[p.uid]  != null) ? prev.proj[p.uid]  : ctr.proj++; });
  allocs.forEach(r => { if (r.uid) r.id = (prev.alloc[r.uid] != null) ? prev.alloc[r.uid] : ctr.alloc++; });
  refsRelink(engs, projs, allocs);
}
// Union two canonical {uid:obj} maps into merged arrays (both-created entities survive).
function unionArrays(aMap, bMap) {
  const out = {}; for (const k in aMap) out[k] = aMap[k]; for (const k in bMap) if (!(k in out)) out[k] = bMap[k];
  return Object.values(out);
}
// Resolve an allocation to the engineer it points at, THE WAY THE APP DOES — by numeric engId.
const engOf = (alloc, engs) => engs.find(e => String(e.id) === String(alloc.engId));

test('colliding engId across two offline datasets → allocation stays on the right person', () => {
  // Dataset A: Ann is engineer id 5 (uid X); an allocation references her by engId 5.
  const aEng = [{ id: 5, uid: 'X', name: 'Ann', idcard: { reportsTo: '' } }];
  const aAlloc = [{ id: 1, uid: 'A1', engId: 5, projectId: null }];
  refsBackfill(aEng, [], aAlloc);
  assert.equal(aAlloc[0].engUid, 'X');                          // durable ref captured

  // Dataset B (created offline, same counters): Bob is ALSO engineer id 5 (uid Y).
  const bEng = [{ id: 5, uid: 'Y', name: 'Bob', idcard: { reportsTo: '' } }];
  const bAlloc = [{ id: 1, uid: 'B1', engId: 5, projectId: null }];
  refsBackfill(bEng, [], bAlloc);
  assert.equal(bAlloc[0].engUid, 'Y');

  // They sync: the doc holds CANONICAL entities keyed by uid (no numeric id at all).
  const engMerged  = unionArrays({ X: canonical(aEng[0], 'engineer') }, { Y: canonical(bEng[0], 'engineer') });
  const allocMerged = unionArrays({ A1: canonical(aAlloc[0], 'allocRow') }, { B1: canonical(bAlloc[0], 'allocRow') });
  assert.equal(engMerged[0].id, undefined, 'numeric id never travels');
  assert.equal(allocMerged[0].engId, undefined);

  // Client A materialises: Ann keeps her local id 5; Bob is new → fresh id.
  const prev = { eng: { X: 5 }, proj: {}, alloc: { A1: 1 } };
  const ctr = { eng: 6, proj: 1, alloc: 2 };
  materialize(engMerged, [], allocMerged, prev, ctr);

  // The ids are now UNIQUE and each allocation resolves to the correct human.
  const ann = engMerged.find(e => e.uid === 'X'), bob = engMerged.find(e => e.uid === 'Y');
  assert.notEqual(ann.id, bob.id, 'the id collision is healed');
  const a1 = allocMerged.find(r => r.uid === 'A1'), b1 = allocMerged.find(r => r.uid === 'B1');
  assert.equal(engOf(a1, engMerged).name, 'Ann');               // NOT Bob
  assert.equal(engOf(b1, engMerged).name, 'Bob');               // NOT Ann
});

test('reportsTo survives an id collision (manager link follows the uid)', () => {
  // Ann (id 5, uid X) manages Dana (id 7, uid P).
  const engs = [
    { id: 5, uid: 'X', name: 'Ann',  idcard: { reportsTo: '' } },
    { id: 7, uid: 'P', name: 'Dana', idcard: { reportsTo: '5' } },
  ];
  refsBackfill(engs, [], []);
  assert.equal(engs[1].idcard.reportsToUid, 'X');

  // After a merge Ann's local id is reassigned (say another dataset's id-5 won the slot).
  const canon = engs.map(e => canonical(e, 'engineer'));
  const merged = unionArrays(
    { X: canon[0], P: canon[1] },
    { Q: canonical({ id: 5, uid: 'Q', name: 'Zoe', idcard: { reportsTo: '' } }, 'engineer') } // Zoe grabbed id 5
  );
  const prev = { eng: { Q: 5 }, proj: {}, alloc: {} };           // Zoe holds local id 5
  const ctr = { eng: 6, proj: 1, alloc: 1 };
  materialize(merged, [], [], prev, ctr);

  const dana = merged.find(e => e.uid === 'P'), ann = merged.find(e => e.uid === 'X');
  // Dana's manager is still Ann (by uid), NOT Zoe who now holds the old numeric id 5.
  assert.equal(dana.idcard.reportsTo, String(ann.id));
  assert.equal(merged.find(e => String(e.id) === dana.idcard.reportsTo).name, 'Ann');
});

test('backfill/relink round-trips (single dataset, no collision) — no ref change', () => {
  const engs = [{ id: 5, uid: 'X', name: 'Ann', idcard: { reportsTo: '' } }];
  const projs = [{ id: 2, uid: 'PR', name: 'Apollo' }];
  const allocs = [{ id: 1, uid: 'A1', engId: 5, projectId: 2 }];
  refsBackfill(engs, projs, allocs);
  const before = JSON.stringify(allocs);
  materialize(engs, projs, allocs, { eng: { X: 5 }, proj: { PR: 2 }, alloc: { A1: 1 } }, { eng: 6, proj: 3, alloc: 2 });
  assert.equal(allocs[0].engId, 5);
  assert.equal(allocs[0].projectId, 2);
  assert.equal(JSON.stringify(allocs), before, 'a non-colliding dataset is unchanged');
});

test('a deleted engineer leaves a dangling ref cleared (not pointed at a stranger)', () => {
  const allocs = [{ id: 1, uid: 'A1', engUid: 'GHOST', engId: 99, projectUid: null, projectId: null }];
  refsRelink([{ id: 5, uid: 'X', name: 'Ann', idcard: {} }], [], allocs);
  assert.equal(allocs[0].engId, null, 'unresolvable uid → null, never a wrong id');
});
