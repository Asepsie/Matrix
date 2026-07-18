import { strict as assert } from 'assert';
import { test } from 'node:test';

/* Mirror of collab3way's decision table (sections/collab.js) as a pure function, so
   the merge algorithm can be verified deterministically without a browser/Yjs. Keep
   this in lockstep with the real function. It merges base vs local vs remote per uid,
   records which values were pushed to the "doc", and emits conflict records. */
function merge3(base, local, remote) {
  const out = {};
  const pushed = {};      // uid -> value written to the shared doc (my resolution)
  const deleted = [];     // uids deleted from the doc
  const conflicts = [];   // {uid, kept, overwritten}
  const uids = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const J = v => (v === undefined ? undefined : JSON.stringify(v));
  for (const uid of uids) {
    const b = base[uid], l = local[uid], r = remote[uid];
    const bj = J(b), lj = J(l), rj = J(r);
    if (lj === rj) { if (r !== undefined) out[uid] = r; }                 // agree / both deleted
    else if (lj === bj) { if (r !== undefined) out[uid] = r; else deleted.push(uid); } // only they changed
    else if (rj === bj) {                                                 // only I changed
      if (l !== undefined) { out[uid] = l; pushed[uid] = l; } else deleted.push(uid);
    } else {                                                              // both changed → conflict
      if (l !== undefined) { out[uid] = l; pushed[uid] = l; conflicts.push({ uid, kept: l, overwritten: r }); }
      else { out[uid] = r; conflicts.push({ uid, kept: r, overwritten: '(deleted locally)' }); }
    }
  }
  return { out, pushed, deleted, conflicts };
}

const eng = (uid, name, extra = {}) => ({ uid, name, ...extra });

test('only-I-changed → my edit is kept and pushed to the doc', () => {
  const base = { a: eng('a', 'Ann') };
  const local = { a: eng('a', 'Ann (my edit)') };
  const remote = { a: eng('a', 'Ann') };            // they left it at base
  const { out, pushed, conflicts } = merge3(base, local, remote);
  assert.equal(out.a.name, 'Ann (my edit)');
  assert.ok(pushed.a, 'my value is pushed to the shared doc');
  assert.equal(conflicts.length, 0);
});

test('only-they-changed → their edit is taken, nothing pushed', () => {
  const base = { a: eng('a', 'Ann') };
  const local = { a: eng('a', 'Ann') };
  const remote = { a: eng('a', 'Ann (their edit)') };
  const { out, pushed, conflicts } = merge3(base, local, remote);
  assert.equal(out.a.name, 'Ann (their edit)');
  assert.deepEqual(pushed, {});
  assert.equal(conflicts.length, 0);
});

test('both changed the SAME record → conflict: mine kept live, theirs preserved in the log', () => {
  const base = { a: eng('a', 'Ann') };
  const local = { a: eng('a', 'Ann — offline on A') };
  const remote = { a: eng('a', 'Ann — online on B') };
  const { out, pushed, conflicts } = merge3(base, local, remote);
  assert.equal(out.a.name, 'Ann — offline on A');       // mine wins live
  assert.ok(pushed.a);                                   // and is pushed so peers converge
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kept.name, 'Ann — offline on A');
  assert.equal(conflicts[0].overwritten.name, 'Ann — online on B');  // the overwritten value is NOT lost
});

test('different records added on each side → both survive (no conflict)', () => {
  const base = {};
  const local = { a: eng('a', 'A-new') };
  const remote = { b: eng('b', 'B-new') };
  const { out, conflicts } = merge3(base, local, remote);
  assert.ok(out.a && out.b);
  assert.equal(Object.keys(out).length, 2);
  assert.equal(conflicts.length, 0);
});

test('I deleted, they left it → deletion propagates', () => {
  const base = { a: eng('a', 'Ann') };
  const local = {};                                  // I deleted a
  const remote = { a: eng('a', 'Ann') };
  const { out, deleted, conflicts } = merge3(base, local, remote);
  assert.equal(out.a, undefined);
  assert.deepEqual(deleted, ['a']);
  assert.equal(conflicts.length, 0);
});

test('I deleted, they edited → their edit is kept (data not lost) and flagged as conflict', () => {
  const base = { a: eng('a', 'Ann') };
  const local = {};                                  // I deleted
  const remote = { a: eng('a', 'Ann (their edit)') };// they edited
  const { out, conflicts } = merge3(base, local, remote);
  assert.equal(out.a.name, 'Ann (their edit)');      // keep the surviving edit
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].overwritten, '(deleted locally)');
});

test('agree (both made the identical change) → no conflict', () => {
  const base = { a: eng('a', 'Ann') };
  const same = eng('a', 'Ann (same)');
  const { conflicts } = merge3(base, { a: same }, { a: { ...same } });
  assert.equal(conflicts.length, 0);
});

test('realistic offline-divergence scenario converges with exactly one conflict', () => {
  // A (offline) and B (online) both started from the same synced base.
  const base = { x: eng('x', 'Chen'), y: eng('y', 'Dana') };
  const local = { x: eng('x', 'Chen — A offline'), y: eng('y', 'Dana'), an: eng('an', 'A-new') };   // A: edit x, add an
  const remote = { x: eng('x', 'Chen — B online'), y: eng('y', 'Dana'), bn: eng('bn', 'B-new') };   // B: edit x, add bn
  const { out, conflicts } = merge3(base, local, remote);
  // both new people survive
  assert.ok(out.an && out.bn);
  // untouched record unchanged
  assert.equal(out.y.name, 'Dana');
  // the doubly-edited record: exactly one conflict, mine kept, theirs preserved
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].uid, 'x');
  assert.equal(out.x.name, 'Chen — A offline');
  assert.equal(conflicts[0].overwritten.name, 'Chen — B online');
  // final set = {x, y, an, bn}
  assert.deepEqual(Object.keys(out).sort(), ['an', 'bn', 'x', 'y']);
});
