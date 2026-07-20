import { strict as assert } from 'assert';
import { test } from 'node:test';

/* Mirror of the surgical roster-patch decision logic
   (collab.js collabRosterSnapshot / collabSectionsSig / collabComputeRosterPatch),
   as pure functions so the "surgical vs full-render" decision table can be verified
   without a browser. Keep in lockstep with those functions.

   The point: on a steady-state remote apply, repaint only the FEW project rows that
   changed in place (fast, no scroll-jump), but fall back to a full renderList on any
   STRUCTURAL change — a project added/removed, moved between sections, or any `sections`
   edit — because those change which group a row belongs to / the list's shape. */

function snapshot(projects) {
  const o = {};
  projects.forEach(p => { if (p && p.id != null) o[p.id] = { sig: JSON.stringify(p), sec: (p.sectionId == null ? '' : String(p.sectionId)) }; });
  return o;
}
function sectionsSig(sections) { return JSON.stringify(sections || []); }

// Returns the merged {structural, ids} changeset (mirrors collabComputeRosterPatch's merge).
function computeRosterPatch(oldRoster, oldSecSig, projects, sections, pending) {
  const pp = { structural: false, ids: {} };
  if (sectionsSig(sections) !== oldSecSig) { pp.structural = true; }
  else {
    const oldIds = Object.keys(oldRoster).map(Number).sort((a, b) => a - b).join(',');
    const newIds = projects.map(p => p.id).sort((a, b) => a - b).join(',');
    if (newIds !== oldIds) { pp.structural = true; }
    else projects.forEach(p => {
      const o = oldRoster[p.id];
      if (!o) { pp.structural = true; return; }
      if ((p.sectionId == null ? '' : String(p.sectionId)) !== o.sec) { pp.structural = true; return; }
      if (JSON.stringify(p) !== o.sig) { pp.ids[p.id] = 1; }
    });
  }
  if (!pending) return pp;
  if (pending.structural || pp.structural) return { structural: true, ids: {} };
  Object.keys(pp.ids).forEach(id => { pending.ids[id] = 1; });
  return pending;
}

const proj = (id, over) => Object.assign({ id, name: 'P' + id, color: '#5be5c8', visible: true, sectionId: null }, over || {});

test('in-place field change → surgical patch of only that row', () => {
  const projects = [proj(1), proj(2), proj(3)];
  const snap = snapshot(projects), sec = sectionsSig([]);
  projects[1].name = 'renamed';
  const pp = computeRosterPatch(snap, sec, projects, [], null);
  assert.equal(pp.structural, false);
  assert.deepEqual(Object.keys(pp.ids), ['2']);
});

test('no change → empty non-structural changeset (nothing repainted)', () => {
  const projects = [proj(1), proj(2)];
  const snap = snapshot(projects), sec = sectionsSig([]);
  const pp = computeRosterPatch(snap, sec, projects, [], null);
  assert.equal(pp.structural, false);
  assert.deepEqual(pp.ids, {});
});

test('project added → structural (full render)', () => {
  const projects = [proj(1), proj(2)];
  const snap = snapshot(projects), sec = sectionsSig([]);
  projects.push(proj(3));
  const pp = computeRosterPatch(snap, sec, projects, [], null);
  assert.equal(pp.structural, true);
});

test('project removed → structural', () => {
  const projects = [proj(1), proj(2), proj(3)];
  const snap = snapshot(projects), sec = sectionsSig([]);
  projects.splice(1, 1);
  const pp = computeRosterPatch(snap, sec, projects, [], null);
  assert.equal(pp.structural, true);
});

test('project moved between sections (sectionId change) → structural', () => {
  const projects = [proj(1, { sectionId: 10 }), proj(2)];
  const snap = snapshot(projects), sec = sectionsSig([{ id: 10, name: 'S' }]);
  projects[0].sectionId = null;                 // moved out of its group
  const pp = computeRosterPatch(snap, sec, projects, [{ id: 10, name: 'S' }], null);
  assert.equal(pp.structural, true);
});

test('sections edited (rename) → structural even if projects unchanged', () => {
  const projects = [proj(1, { sectionId: 10 })];
  const secs = [{ id: 10, name: 'Old' }];
  const snap = snapshot(projects), sec = sectionsSig(secs);
  const secs2 = [{ id: 10, name: 'New' }];
  const pp = computeRosterPatch(snap, sec, projects, secs2, null);
  assert.equal(pp.structural, true);
});

test('merge: two non-structural applies union their changed ids', () => {
  const projects = [proj(1), proj(2), proj(3), proj(4)];
  // apply 1: id 2 changes
  const snap1 = snapshot(projects), sec1 = sectionsSig([]);
  projects[1].name = 'two';
  let pending = computeRosterPatch(snap1, sec1, projects, [], null);
  // apply 2 lands before the deferred render: id 4 changes
  const snap2 = snapshot(projects), sec2 = sectionsSig([]);
  projects[3].name = 'four';
  pending = computeRosterPatch(snap2, sec2, projects, [], pending);
  assert.equal(pending.structural, false);
  assert.deepEqual(Object.keys(pending.ids).sort(), ['2', '4']);
});

test('merge: a structural apply after a pending non-structural one wins (full render)', () => {
  const projects = [proj(1), proj(2)];
  const snap1 = snapshot(projects), sec1 = sectionsSig([]);
  projects[0].name = 'one';
  let pending = computeRosterPatch(snap1, sec1, projects, [], null);   // {ids:{1}}
  const snap2 = snapshot(projects), sec2 = sectionsSig([]);
  projects.push(proj(3));                                              // structural
  pending = computeRosterPatch(snap2, sec2, projects, [], pending);
  assert.equal(pending.structural, true);
  assert.deepEqual(pending.ids, {});
});
