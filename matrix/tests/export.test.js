import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  exportField, exportHTML, exportBrand, EXPORT_PRINT_CSS, EXPORT_PAPER,
  exportLoadPrefs, exportSavePrefs, exportLoadCustomTemplates, exportSaveCustomTemplates,
  EXPORT_TEMPLATES_KEY,
} from '../src/core/export.js';

// exportLoadPrefs/exportSavePrefs/exportLoad(Save)CustomTemplates all touch
// `localStorage`, which does not exist as a global in plain Node — each test
// that needs it installs a tiny in-memory stand-in and removes it afterwards
// so tests stay isolated (mirrors how exportLoadPrefs already tolerates a
// missing localStorage via its own try/catch, for the no-storage case).
function fakeLocalStorage(){
  const store = {};
  return {
    getItem: (k) => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

/* ── exportField — the "safe path is the easy path" helper ─────────────── */

test('exportField escapes label and value', () => {
  const html = exportField('<b>Label</b>', '<script>alert(1)</script>');
  assert.ok(!html.includes('<b>Label</b>'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;b&gt;Label&lt;/b&gt;'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('exportField renders an em-dash for null/empty values', () => {
  assert.ok(exportField('X', null).includes('—'));
  assert.ok(exportField('X', '').includes('—'));
  assert.ok(exportField('X', 0).includes('>0<'));
});

/* ── EXPORT_PRINT_CSS — the single source of truth every deliverable shares ─ */

test('EXPORT_PRINT_CSS forces color-adjust so backgrounds/badges do not drop out on print', () => {
  assert.match(EXPORT_PRINT_CSS, /-webkit-print-color-adjust:exact!important/);
  assert.match(EXPORT_PRINT_CSS, /print-color-adjust:exact!important/);
});

test('EXPORT_PRINT_CSS paginates .export-page but not the last one', () => {
  assert.match(EXPORT_PRINT_CSS, /\.export-page\{page-break-after:always/);
  assert.match(EXPORT_PRINT_CSS, /\.export-page:last-child\{page-break-after:avoid/);
});

/* ── exportBrand — theme resolution ──────────────────────────────────────── */

test('exportBrand() with no localStorage falls back to the APP theme (not paper) and default org name', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  const brand = exportBrand();
  assert.equal(brand.theme, 'app');
  assert.equal(brand.name, 'Project Matrix');
  assert.equal(brand.logo, '');
  assert.notEqual(brand.palette, EXPORT_PAPER, 'app theme must not silently be the paper palette');
  globalThis.localStorage = saved;
});

test('exportBrand({theme:"light"}) always returns the paper palette, overriding any saved default', () => {
  globalThis.localStorage = fakeLocalStorage();
  exportSavePrefs({ orgName: '', logo: '', theme: 'app' });
  const brand = exportBrand({ theme: 'light' });
  assert.equal(brand.theme, 'light');
  assert.equal(brand.palette, EXPORT_PAPER);
  delete globalThis.localStorage;
});

test('exportSavePrefs/exportLoadPrefs round-trip org name + theme (the Settings › EXPORT THEME control)', () => {
  globalThis.localStorage = fakeLocalStorage();
  exportSavePrefs({ orgName: 'Acme R&D', logo: '', theme: 'light' });
  const prefs = exportLoadPrefs();
  assert.equal(prefs.orgName, 'Acme R&D');
  assert.equal(prefs.theme, 'light');
  const brand = exportBrand();
  assert.equal(brand.name, 'Acme R&D');
  assert.equal(brand.theme, 'light');
  delete globalThis.localStorage;
});

test('exportLoadPrefs rejects a garbage theme value back to the app-theme default', () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem('eim_export_prefs', JSON.stringify({ theme: 'not-a-theme' }));
  assert.equal(exportLoadPrefs().theme, 'app');
  delete globalThis.localStorage;
});

/* ── templates — per-deliverable, saved separately from prefs ───────────── */

test('exportLoadCustomTemplates returns [] when nothing has been saved yet', () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.deepEqual(exportLoadCustomTemplates('exec'), []);
  delete globalThis.localStorage;
});

test('exportSaveCustomTemplates/exportLoadCustomTemplates round-trip, keyed per deliverable', () => {
  globalThis.localStorage = fakeLocalStorage();
  exportSaveCustomTemplates('exec', [{ id: 't1', name: 'My board pack', blocks: ['scorecard', 'attention'] }]);
  exportSaveCustomTemplates('profiles', [{ id: 't2', name: 'Team only', blocks: ['roster'] }]);
  assert.deepEqual(exportLoadCustomTemplates('exec'), [{ id: 't1', name: 'My board pack', blocks: ['scorecard', 'attention'] }]);
  assert.deepEqual(exportLoadCustomTemplates('profiles'), [{ id: 't2', name: 'Team only', blocks: ['roster'] }]);
  assert.deepEqual(exportLoadCustomTemplates('charter'), [], 'an untouched deliverable stays empty');
  delete globalThis.localStorage;
});

test('exportLoadCustomTemplates drops malformed entries instead of throwing', () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem(EXPORT_TEMPLATES_KEY, JSON.stringify({
    exec: [{ id: 'ok', name: 'OK', blocks: ['a'] }, { id: 'bad-no-blocks' }, null, 'nope'],
  }));
  assert.deepEqual(exportLoadCustomTemplates('exec'), [{ id: 'ok', name: 'OK', blocks: ['a'] }]);
  delete globalThis.localStorage;
});

/* ── exportHTML — shell structure ────────────────────────────────────────── */

test('exportHTML produces a standalone document with cover, pages and CSS vars from the brand palette', () => {
  const brand = { name: 'Project Matrix', logo: '', theme: 'light', palette: EXPORT_PAPER };
  const html = exportHTML({
    title: 'Executive Summary',
    subtitle: 'Q3 Plan',
    brand,
    pages: ['<div id="marker">PAGE-1</div>'],
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.ok(html.includes('<title>Executive Summary</title>'));
  assert.ok(html.includes('Executive Summary'));
  assert.ok(html.includes('Q3 Plan'));
  assert.ok(html.includes('id="marker">PAGE-1'));
  assert.ok(html.includes('--bg:' + brand.palette.bg));
  assert.ok(html.includes('--accent:' + brand.palette.accent));
  assert.match(html, /@page\{size:A4 portrait;margin:14mm\}/);
});

test('exportHTML honours orientation:landscape for the @page rule', () => {
  const html = exportHTML({ title: 'Deck', pages: [], orientation: 'landscape' });
  assert.match(html, /@page\{size:A4 landscape;margin:14mm\}/);
});

test('exportHTML defaults title/pages when spec is empty', () => {
  const html = exportHTML({});
  assert.ok(html.includes('<title>Export</title>'));
  assert.match(html, /^<!DOCTYPE html>[\s\S]*<\/html>$/);
});

/* ── XSS — a hostile title/subtitle/brand cannot break out of the shell ──── */

test('exportHTML escapes a hostile title/subtitle/brand name — no breakout, no script execution', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = exportHTML({
    title: evil,
    subtitle: evil,
    brand: { name: evil, logo: '', palette: EXPORT_PAPER },
    pages: [],
  });
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'title/subtitle/brand name must not inject a raw tag');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('exportHTML escapes a hostile logo dataURL (attribute breakout)', () => {
  const evilLogo = '"><script>alert(1)</script>';
  const html = exportHTML({ title: 'X', brand: { name: 'Org', logo: evilLogo, palette: EXPORT_PAPER }, pages: [] });
  assert.ok(!/<script>alert\(1\)<\/script>/.test(html));
  assert.ok(html.includes('src="&quot;&gt;&lt;script&gt;'));
});

test('exportHTML clamps a hostile palette color via safeColor (CSS breakout)', () => {
  const attack = 'red;position:fixed;top:0;left:0;width:100vw;height:100vh';
  const html = exportHTML({
    title: 'X',
    brand: { name: 'Org', logo: '', palette: { ...EXPORT_PAPER, accent: attack } },
    pages: [],
  });
  assert.ok(!html.includes(attack), 'the raw CSS-injection payload must not reach the stylesheet');
  assert.ok(html.includes('--accent:var(--muted)'));
});
