import { strict as assert } from 'assert';
import { test } from 'node:test';

/* Mirror of the per-field UPDATE diff (collab.js collabFlatten / collabChangeList) as
   pure functions, so the audit diff is verified without a browser/Yjs. Keep in lockstep.
   The diff compares the previous vs current CANONICAL entity and lists changed leaf
   fields {f, from, to}; nested objects recurse to dotted paths, arrays are opaque
   (count), uid-ref fields are relabelled + resolved to entity names. */

const REF_FIELDS = { engUid: 'engineer', projectUid: 'project', reportsToUid: 'manager', successorUid: 'successor' };
const DIFF_CAP = 14;

function flatten(o, prefix, out) {
  out = out || {}; prefix = prefix || '';
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (k === 'uid') continue;
      const v = o[k], key = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
      else out[key] = Array.isArray(v) ? ('[' + v.length + ' item' + (v.length === 1 ? '' : 's') + ']') : v;
    }
  }
  return out;
}
const short = v => (v === undefined || v === null || v === '') ? '∅'
  : (s => s.length > 60 ? s.slice(0, 60) + '…' : s)(typeof v === 'string' ? v : JSON.stringify(v));
const refName = (base, uid, engs, projs) => {
  if (!uid) return '∅';
  const e = (base === 'projectUid' ? projs : engs).find(x => x.uid === uid);
  return e ? (e.name || '(x)') : '(removed)';
};
function changeList(oldO, newO, engs = [], projs = []) {
  const a = flatten(oldO), b = flatten(newO), keys = {}, changes = [];
  for (const k in a) keys[k] = 1; for (const k in b) keys[k] = 1;
  Object.keys(keys).forEach(k => {
    if (JSON.stringify(a[k]) === JSON.stringify(b[k])) return;
    const base = k.split('.').pop();
    if (REF_FIELDS[base]) changes.push({ f: REF_FIELDS[base], from: refName(base, a[k], engs, projs), to: refName(base, b[k], engs, projs) });
    else changes.push({ f: k, from: short(a[k]), to: short(b[k]) });
  });
  if (changes.length > DIFF_CAP) {
    const extra = changes.length - DIFF_CAP;
    return changes.slice(0, DIFF_CAP).concat([{ f: '…', from: '', to: '(+' + extra + ' more fields)' }]);
  }
  return changes;
}

test('a simple field edit is captured as from → to', () => {
  const chg = changeList({ name: 'Ann', monthlyCost: 8000 }, { name: 'Ann', monthlyCost: 9000 });
  assert.equal(chg.length, 1);
  assert.deepEqual(chg[0], { f: 'monthlyCost', from: '8000', to: '9000' });
});

test('nested idcard fields flatten to dotted paths', () => {
  const chg = changeList({ idcard: { grade: 5, seniority: 'Senior' } }, { idcard: { grade: 6, seniority: 'Senior' } });
  assert.deepEqual(chg, [{ f: 'idcard.grade', from: '5', to: '6' }]);
});

test('allocation month edits show under allocs.<month>', () => {
  const chg = changeList({ allocs: { '2026-03': 0.5 } }, { allocs: { '2026-03': 0.8 } });
  assert.deepEqual(chg, [{ f: 'allocs.2026-03', from: '0.5', to: '0.8' }]);
});

test('uid-ref changes are relabelled and resolved to names (not raw uuids)', () => {
  const engs = [{ uid: 'X', name: 'Ann' }, { uid: 'Y', name: 'Bob' }];
  const chg = changeList({ engUid: 'X' }, { engUid: 'Y' }, engs, []);
  assert.deepEqual(chg, [{ f: 'engineer', from: 'Ann', to: 'Bob' }]);
});

test('an empty → set value reads as ∅ → value', () => {
  const chg = changeList({ idcard: { notes: '' } }, { idcard: { notes: 'call Monday' } });
  assert.deepEqual(chg, [{ f: 'idcard.notes', from: '∅', to: 'call Monday' }]);
});

test('arrays are opaque (count), not deep-diffed', () => {
  const chg = changeList({ skills: [{ name: 'A' }] }, { skills: [{ name: 'A' }, { name: 'B' }] });
  assert.deepEqual(chg, [{ f: 'skills', from: '[1 item]', to: '[2 items]' }]);
});

test('no change → empty list (no spurious update entry)', () => {
  assert.equal(changeList({ name: 'Ann', idcard: { grade: 5 } }, { name: 'Ann', idcard: { grade: 5 } }).length, 0);
});

test('the uid field itself is never reported as an edit', () => {
  assert.equal(changeList({ uid: 'X', name: 'Ann' }, { uid: 'X', name: 'Ann' }).length, 0);
});

test('more than the cap of changed fields is truncated with an overflow marker', () => {
  const a = {}, b = {};
  for (let i = 0; i < 20; i++) { a['f' + i] = i; b['f' + i] = i + 100; }
  const chg = changeList(a, b);
  assert.equal(chg.length, DIFF_CAP + 1);
  assert.equal(chg[DIFF_CAP].f, '…');
  assert.match(chg[DIFF_CAP].to, /\+6 more fields/);
});
