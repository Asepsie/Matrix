import { strict as assert } from 'assert';
import { test } from 'node:test';
import { makeEngineer, makeProject, makeAllocRow } from '../src/data/model.js';

/* Mirror of the per-field flatten/unflatten (collab.js collabFlattenEntity /
   collabUnflattenEntity) — the foundation of increment C (real-time per-field CRDT
   merge). Keep in lockstep with those functions.

   Why: to let two people edit DIFFERENT fields of the SAME entity concurrently and have
   Yjs merge them (instead of whole-object last-write-wins), each entity is stored as one
   doc entry PER LEAF FIELD. Flatten produces {dottedPath: leafValue}; unflatten rebuilds
   the object. Rule: recurse plain objects (per-field for scalars + map-like fields);
   arrays are ATOMIC leaves (element list-CRDT is out of scope); an empty object is an
   atomic {} leaf so it round-trips. The critical property is LOSSLESS ROUND-TRIP over the
   real entity shapes — otherwise sync would silently drop data. */

function isPlainObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function flatten(o) {
  const out = {};
  (function walk(v, prefix) {
    Object.keys(v).forEach(k => {
      const val = v[k], p = prefix ? prefix + '.' + k : k;
      if (isPlainObj(val)) { if (Object.keys(val).length) walk(val, p); else out[p] = {}; }
      else out[p] = val;
    });
  })(o || {}, '');
  return out;
}
function unflatten(flat) {
  const o = {};
  Object.keys(flat || {}).sort((a, b) => a.split('.').length - b.split('.').length).forEach(p => {
    const segs = p.split('.'); let cur = o;
    for (let i = 0; i < segs.length - 1; i++) { if (!isPlainObj(cur[segs[i]])) cur[segs[i]] = {}; cur = cur[segs[i]]; }
    const leaf = segs[segs.length - 1], val = flat[p];
    if (isPlainObj(val) && !Object.keys(val).length && isPlainObj(cur[leaf]) && Object.keys(cur[leaf]).length) return;
    cur[leaf] = clone(val);
  });
  return o;
}

/* ── lossless round-trip over the REAL factory shapes ── */
test('round-trip — a fresh engineer (deep idcard/nextMove/succession/engagement) is lossless', () => {
  const e = makeEngineer();
  assert.deepEqual(unflatten(flatten(e)), e);
});

test('round-trip — a fresh project (huge nested charter + gatePlan) is lossless', () => {
  const p = makeProject();
  assert.deepEqual(unflatten(flatten(p)), p);
});

test('round-trip — a fresh allocRow (allocs map) is lossless', () => {
  const r = makeAllocRow();
  assert.deepEqual(unflatten(flatten(r)), r);
});

test('round-trip — a populated engineer (skills, cops, reviews, filled idcard) is lossless', () => {
  const e = makeEngineer({ name: 'Ann Lee', role: 'Staff', skills: [{ name: 'Optics', level: 4 }] });
  e.idcard.grade = 7; e.idcard.notes = 'a\nmultiline\tnote'; e.idcard.comparatio = 0.98;
  e.idcard.cops = [{ name: 'CoP1', goal: 'g', notes: 'n' }];
  e.idcard.reviews = [{ year: '2025', rating: 'A', comments: 'c' }];
  e.idcard.nextMove.position = 'Lead'; e.idcard.nextMove.show = true;
  e.idcard.engagement.tier = 2; e.idcard.engagement.touchpoints = [{ type: '1on1', week: '2026-03-02', done: false }];
  assert.deepEqual(unflatten(flatten(e)), e);
});

test('round-trip — a populated allocs map keeps every month', () => {
  const r = makeAllocRow({ allocs: { '2026-01': 0.5, '2026-02': 1, '2026-03': 'p' } });
  const rt = unflatten(flatten(r));
  assert.deepEqual(rt, r);
  assert.deepEqual(rt.allocs, { '2026-01': 0.5, '2026-02': 1, '2026-03': 'p' });
});

/* ── per-field granularity: different-field edits touch disjoint paths ── */
test('flatten — allocs are per-month leaves (so two people editing different months merge)', () => {
  const f = flatten(makeAllocRow({ allocs: { '2026-01': 0.5, '2026-02': 1 } }));
  assert.equal(f['allocs.2026-01'], 0.5);
  assert.equal(f['allocs.2026-02'], 1);
});

test('flatten — deep idcard scalars are individual leaves; arrays stay atomic', () => {
  const f = flatten(makeEngineer());
  assert.ok('idcard.grade' in f);
  assert.ok('idcard.nextMove.position' in f);
  assert.ok('idcard.succession.timeframe' in f);
  assert.ok(Array.isArray(f['skills']));        // whole array is one leaf, not skills.0.*
  assert.ok(Array.isArray(f['idcard.cops']));
});

test('two disjoint-field edits produce non-overlapping changed paths (the merge win)', () => {
  const base = makeEngineer({ name: 'Ann' });
  const a = clone(base); a.idcard.notes = 'A edited notes';       // person A edits notes
  const b = clone(base); b.role = 'Principal';                    // person B edits role
  const fb = flatten(base), fa = flatten(a), fbb = flatten(b);
  const changedA = Object.keys(fa).filter(k => JSON.stringify(fa[k]) !== JSON.stringify(fb[k]));
  const changedB = Object.keys(fbb).filter(k => JSON.stringify(fbb[k]) !== JSON.stringify(fb[k]));
  assert.deepEqual(changedA, ['idcard.notes']);
  assert.deepEqual(changedB, ['role']);
  // disjoint → Yjs merges both without conflict
  assert.equal(changedA.filter(k => changedB.includes(k)).length, 0);
});

/* ── merge edge: one peer leaves a map empty, another adds a key → both survive unflatten ── */
test('unflatten — empty-object leaf + a child key from a merge coexist (no clobber)', () => {
  // Simulates the doc after merge holding BOTH keys for the same container.
  const merged = { 'gatePlan.criteria': {}, 'gatePlan.criteria.open-case': 'pass', 'gatePlan.stageId': 'do' };
  const o = unflatten(merged);
  assert.deepEqual(o.gatePlan.criteria, { 'open-case': 'pass' });
  assert.equal(o.gatePlan.stageId, 'do');
});

test('unflatten — a genuinely empty map round-trips as {}', () => {
  assert.deepEqual(unflatten({ 'allocs': {} }), { allocs: {} });
});

/* ── composite-key write/read semantics (mirror of collabWriteEntityDiff / collabMapSnapshot,
   using a plain Map as the doc; encryption is a passthrough here) ── */
const SEP = String.fromCharCode(1);   // uid-path composite-key separator (matches COLLAB_KEYSEP)
function writeEntityDiff(map, uid, canon, lastFields) {
  const flat = flatten(canon), last = lastFields[uid] || {}, next = {}, seen = {}, sets = [], dels = [];
  Object.keys(flat).forEach(path => {
    seen[path] = 1;
    const vjs = JSON.stringify(flat[path] === undefined ? null : flat[path]); next[path] = vjs;
    if (last[path] !== vjs) { map.set(uid + SEP + path, clone(flat[path])); sets.push(path); }
  });
  Object.keys(last).forEach(path => { if (!seen[path]) { map.delete(uid + SEP + path); dels.push(path); } });
  lastFields[uid] = next;
  return { sets, dels };
}
function mapSnapshot(map) {
  const byUid = {};
  map.forEach((v, key) => { const i = key.indexOf(SEP); if (i < 0) return; const uid = key.slice(0, i), path = key.slice(i + 1); (byUid[uid] || (byUid[uid] = {}))[path] = v; });
  const out = {}; Object.keys(byUid).forEach(uid => { out[uid] = unflatten(byUid[uid]); }); return out;
}

test('writeEntityDiff — first write emits every leaf; read reconstructs the entity', () => {
  const e = makeEngineer({ name: 'Ann', role: 'E1' }); const uid = e.uid; delete e.id;
  const map = new Map(), last = {};
  const { sets } = writeEntityDiff(map, uid, e, last);
  assert.ok(sets.length > 10 && sets.includes('name') && sets.includes('idcard.grade'));
  assert.deepEqual(mapSnapshot(map)[uid], e);
});

test('writeEntityDiff — a one-field edit re-emits ONLY that field', () => {
  const e = makeEngineer({ name: 'Ann', role: 'E1' }); const uid = e.uid; delete e.id;
  const map = new Map(), last = {};
  writeEntityDiff(map, uid, e, last);
  const e2 = clone(e); e2.role = 'Staff';
  const { sets, dels } = writeEntityDiff(map, uid, e2, last);
  assert.deepEqual(sets, ['role']);
  assert.deepEqual(dels, []);
  assert.equal(mapSnapshot(map)[uid].role, 'Staff');
  assert.equal(mapSnapshot(map)[uid].name, 'Ann');
});

test('writeEntityDiff — a removed field deletes its key', () => {
  const r = makeAllocRow({ allocs: { '2026-01': 1, '2026-02': 0.5 } }); const uid = r.uid; delete r.id;
  const map = new Map(), last = {};
  writeEntityDiff(map, uid, r, last);
  const r2 = clone(r); delete r2.allocs['2026-02'];              // a month cleared
  const { sets, dels } = writeEntityDiff(map, uid, r2, last);
  assert.deepEqual(dels, ['allocs.2026-02']);
  assert.deepEqual(sets, []);
  assert.deepEqual(mapSnapshot(map)[uid].allocs, { '2026-01': 1 });
});

test('mapSnapshot — two entities in one map are separated by uid', () => {
  const a = makeProject({ name: 'A' }), b = makeProject({ name: 'B' });
  delete a.id; delete b.id;
  const map = new Map(), last = {};
  writeEntityDiff(map, a.uid, a, last);
  writeEntityDiff(map, b.uid, b, last);
  const snap = mapSnapshot(map);
  assert.equal(snap[a.uid].name, 'A');
  assert.equal(snap[b.uid].name, 'B');
});
