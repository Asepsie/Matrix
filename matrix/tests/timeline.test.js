import { strict as assert } from 'assert';
import { test } from 'node:test';

// The Timeline capacity engine is global-free (plain in → plain out), so a static import
// is enough — no globalThis seam needed. See TIMELINE-PLAN.md.
import { tlSpreadDemand, tlCapacityByMonth, tlSchedule, tlEarliestFit } from '../src/sections/timeline.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ── tlSpreadDemand ─────────────────────────────────────────────────── */

test('tlSpreadDemand: even demand → peakFte per month, whole months', () => {
  const sp = tlSpreadDemand({ peakFte:2, fteMonths:6 }, 0, 12);
  assert.equal(sp.duration, 3);                 // 6 / 2
  assert.equal(sp.cells.length, 3);
  assert.deepEqual(sp.cells.map(c => c.idx), [0, 1, 2]);
  sp.cells.forEach(c => assert.ok(near(c.total, 2)));
  assert.equal(sp.clipped, false);
});

test('tlSpreadDemand: uneven demand → final month carries the remainder', () => {
  const sp = tlSpreadDemand({ peakFte:2, fteMonths:5 }, 0, 12);   // ceil(5/2)=3 months: 2,2,1
  assert.equal(sp.duration, 3);
  assert.ok(near(sp.cells[0].total, 2));
  assert.ok(near(sp.cells[1].total, 2));
  assert.ok(near(sp.cells[2].total, 1));         // remainder
  assert.ok(near(sp.cells.reduce((s, c) => s + c.total, 0), 5));  // conserves fteMonths
});

test('tlSpreadDemand: starts at startIdx', () => {
  const sp = tlSpreadDemand({ peakFte:1, fteMonths:2 }, 4, 12);
  assert.deepEqual(sp.cells.map(c => c.idx), [4, 5]);
});

test('tlSpreadDemand: byGroup splits each month by discipline proportion', () => {
  const sp = tlSpreadDemand({ peakFte:4, fteMonths:4, byGroup:{ eng:3, design:1 } }, 0, 12);
  assert.equal(sp.cells.length, 1);              // 4/4 = 1 month, load 4
  const g = sp.cells[0].byGroup;
  assert.ok(near(g.eng, 3));                     // 4 * 3/4
  assert.ok(near(g.design, 1));                  // 4 * 1/4
});

test('tlSpreadDemand: no byGroup → single _unassigned bucket', () => {
  const sp = tlSpreadDemand({ peakFte:1, fteMonths:1 }, 0, 12);
  assert.ok(near(sp.cells[0].byGroup._unassigned, 1));
});

test('tlSpreadDemand: cells past the horizon are dropped and flagged clipped', () => {
  const sp = tlSpreadDemand({ peakFte:1, fteMonths:4 }, 2, 4);   // months 2,3 fit; 4,5 clipped
  assert.deepEqual(sp.cells.map(c => c.idx), [2, 3]);
  assert.equal(sp.clipped, true);
});

test('tlSpreadDemand: null / zero demand → empty spread, no crash', () => {
  assert.equal(tlSpreadDemand({}, 0, 12).cells.length, 0);
  assert.equal(tlSpreadDemand({ peakFte:0, fteMonths:5 }, 0, 12).cells.length, 0);
  assert.equal(tlSpreadDemand({ peakFte:2, fteMonths:0 }, 0, 12).cells.length, 0);
});

/* ── tlCapacityByMonth ──────────────────────────────────────────────── */

const eu = (over) => Object.assign({ grpId:'eng', monthAllocs:{}, monthStatus:{} }, over || {});
const MS = ['2026-01', '2026-02'];

test('tlCapacityByMonth: supply = active people/month; free = supply − committed', () => {
  const cap = tlCapacityByMonth([
    eu({ monthAllocs:{ '2026-01':0.5, '2026-02':1 } }),
    eu({ monthAllocs:{ '2026-01':0,   '2026-02':0 } }),
  ], MS);
  assert.equal(cap[0].supply, 2);
  assert.ok(near(cap[0].committed, 0.5));
  assert.ok(near(cap[0].free, 1.5));
  assert.equal(cap[1].committed, 1);
  assert.equal(cap[1].free, 1);
});

test('tlCapacityByMonth: committed caps at 1/person/month', () => {
  const cap = tlCapacityByMonth([ eu({ monthAllocs:{ '2026-01':1.6 } }) ], MS);
  assert.equal(cap[0].committed, 1);             // min(1.6,1)
  assert.equal(cap[0].free, 0);
});

test('tlCapacityByMonth: a fully medical/resigned month with 0 alloc adds no supply', () => {
  const cap = tlCapacityByMonth([ eu({ monthStatus:{ '2026-01':'m' }, monthAllocs:{ '2026-01':0, '2026-02':1 } }) ], MS);
  assert.equal(cap[0].supply, 0);
  assert.equal(cap[1].supply, 1);
});

test('tlCapacityByMonth: byGroup free per discipline', () => {
  const cap = tlCapacityByMonth([
    eu({ grpId:'eng',    monthAllocs:{ '2026-01':1 } }),
    eu({ grpId:'design', monthAllocs:{ '2026-01':0 } }),
  ], MS);
  assert.equal(cap[0].byGroup.eng.free, 0);
  assert.equal(cap[0].byGroup.design.free, 1);
});

/* ── tlSchedule ─────────────────────────────────────────────────────── */

// Build a flat capByMonth: `n` months, each with `free` total and per-group free.
const flatCap = (n, free, byGroup) => Array.from({ length:n }, () => ({
  supply:free, committed:0, free,
  byGroup:Object.fromEntries(Object.entries(byGroup || {}).map(([k, v]) => [k, { supply:v, committed:0, free:v }])),
}));

test('tlSchedule: a candidate within free capacity has no breach', () => {
  const cap = flatCap(6, 3);
  const out = tlSchedule([{ id:1, demand:{ peakFte:2, fteMonths:4 }, startIdx:0 }], cap);
  assert.equal(out.results[0].breach.length, 0);
});

test('tlSchedule: a candidate over the monthly total is breached', () => {
  const cap = flatCap(6, 1);
  const out = tlSchedule([{ id:1, demand:{ peakFte:2, fteMonths:2 }, startIdx:0 }], cap);  // needs 2/mo, only 1 free
  assert.ok(out.results[0].breach.some(b => b.gid === null));
});

test('tlSchedule: per-discipline breach fires even when the month total fits', () => {
  const cap = flatCap(3, 5, { eng:1, design:5 });   // 5 total free, but eng only 1
  const out = tlSchedule([{ id:1, demand:{ peakFte:2, fteMonths:2, byGroup:{ eng:2 } }, startIdx:0 }], cap);
  const b = out.results[0].breach.find(x => x.gid === 'eng');
  assert.ok(b, 'expected an eng breach');
  assert.ok(near(b.short, 1));                    // needs 2 eng, 1 free
});

test('tlSchedule: demand accumulates across candidates (2nd draws the remaining free)', () => {
  const cap = flatCap(3, 2);
  const out = tlSchedule([
    { id:1, demand:{ peakFte:2, fteMonths:2 }, startIdx:0 },   // fills month 0 (2/2)
    { id:2, demand:{ peakFte:2, fteMonths:2 }, startIdx:0 },   // month 0 now full → breach
  ], cap);
  assert.equal(out.results[0].breach.length, 0);
  assert.ok(out.results[1].breach.some(b => b.gid === null));
  assert.ok(near(out.freeTot[0], -2));            // running envelope reflects both draws
});

test('tlSchedule: staggered starts avoid the collision', () => {
  const cap = flatCap(4, 2);
  const out = tlSchedule([
    { id:1, demand:{ peakFte:2, fteMonths:2 }, startIdx:0 },
    { id:2, demand:{ peakFte:2, fteMonths:2 }, startIdx:1 },   // different month → fits
  ], cap);
  assert.equal(out.results[0].breach.length, 0);
  assert.equal(out.results[1].breach.length, 0);
});

/* ── tlEarliestFit ──────────────────────────────────────────────────── */

test('tlEarliestFit: returns the first month that fits', () => {
  // month 0 free 0, months 1..5 free 3 → a 2/mo candidate first fits at idx 1
  const cap = flatCap(6, 3); cap[0].free = 0; cap[0].byGroup = {};
  const s = tlEarliestFit({ peakFte:2, fteMonths:2 }, cap, 0);
  assert.equal(s, 1);
});

test('tlEarliestFit: respects per-discipline capacity', () => {
  const cap = flatCap(4, 9, { eng:0, design:9 });
  cap[2].byGroup.eng.free = 5;                    // eng only opens up at month 2
  const s = tlEarliestFit({ peakFte:2, fteMonths:2, byGroup:{ eng:2 } }, cap, 0);
  assert.equal(s, 2);
});

test('tlEarliestFit: never fits within horizon → -1', () => {
  const cap = flatCap(3, 1);                      // 1 free, candidate needs 2/mo
  assert.equal(tlEarliestFit({ peakFte:2, fteMonths:2 }, cap, 0), -1);
});
