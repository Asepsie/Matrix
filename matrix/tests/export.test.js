import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  exportField, exportHTML, exportBrand, EXPORT_PRINT_CSS, EXPORT_PAPER,
  exportLoadPrefs, exportSavePrefs, exportLoadCustomTemplates, exportSaveCustomTemplates,
  EXPORT_TEMPLATES_KEY, EXPORT_LAST_KEY,
  exportHTMLParts, exportLoadLast, exportSaveLast, EXPORT_RASTER_CSS_FIXUP,
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

test('EXPORT_PRINT_CSS hides .no-print elements on the printed page', () => {
  assert.match(EXPORT_PRINT_CSS, /\.no-print\{display:none!important\}/);
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

test('exportHTML honours pageSize:A3 (wide grids like the profiles dashboard)', () => {
  const html = exportHTML({ title: 'Dashboard', pages: [], orientation: 'landscape', pageSize: 'A3' });
  assert.match(html, /@page\{size:A3 landscape;margin:14mm\}/);
});

test('exportHTML falls back to A4 for an unrecognised pageSize', () => {
  const html = exportHTML({ title: 'X', pages: [], pageSize: 'Legal' });
  assert.match(html, /@page\{size:A4 portrait;margin:14mm\}/);
});

test('exportHTML gives A3 pages a much wider .export-page than the A4 default', () => {
  // real bug: a 5-column card grid squeezed into the 920px width meant for a single-column
  // document made every card "small and tight" (field values wrapping mid-word for lack of
  // room) even after the equal-column grid bug was fixed. A3 (currently only used by the
  // profiles dashboard's multi-column grid) needs real extra width, not just a taller/wider
  // print page size.
  const a4 = exportHTML({ title: 'X', pages: [] });
  const a3 = exportHTML({ title: 'X', pages: [], pageSize: 'A3' });
  assert.match(a4, /\.export-page\{max-width:920px/);
  assert.match(a3, /\.export-page\{max-width:1600px/);
});

test('exportHTML forces overflow-wrap/word-break globally so an unbreakable token (URL, etc.) cannot force a grid column wider than its share', () => {
  // real bug: the profiles dashboard is a CSS grid of 1fr columns; one card with a long
  // unbroken string (a URL in someone's notes) forced that grid track wider than the rest,
  // visibly breaking the equal-column layout. Root cause was CSS grid items defaulting to
  // min-width:auto (fixed per-deliverable, see profiles.js) PLUS text having no wrap hint at
  // all (fixed here, once, for every deliverable).
  const html = exportHTML({ title: 'X', pages: [] });
  assert.match(html, /\*\{[^}]*overflow-wrap:break-word/);
  assert.match(html, /\*\{[^}]*word-break:break-word/);
});

test('exportHTML embeds a manual print button (no more auto-triggered print)', () => {
  const html = exportHTML({ title: 'X', pages: [] });
  assert.match(html, /class="no-print"[^>]*onclick="window\.print\(\)"/);
  assert.ok(!html.includes('window.addEventListener("load"'), 'no auto-print script should remain');
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

/* ── layout / cover / pagination — the page model ──────────────────────── */

const PAPER_BRAND = { name: 'Org', logo: '', palette: EXPORT_PAPER };

test('exportHTMLParts splits the document into css + body, and exportHTML composes exactly those', () => {
  const spec = { title: 'Pack', brand: PAPER_BRAND, pages: ['<p>a</p>'] };
  const parts = exportHTMLParts(spec);
  assert.ok(parts.css.includes('.export-page'), 'css half carries the page rules');
  assert.ok(parts.body.includes('<p>a</p>'), 'body half carries the page content');
  assert.ok(!parts.body.includes('<style>'), 'the halves must not overlap');
  const html = exportHTML(spec);
  assert.ok(html.includes('<style>' + parts.css + '</style>'));
  assert.ok(html.includes('<body>' + parts.body + '</body>'));
});

test('page layout stamps an accurate "N / M" on every page (Chromium has no @page margin boxes)', () => {
  const html = exportHTML({ title: 'Pack', brand: PAPER_BRAND, pages: ['<p>a</p>', '<p>b</p>', '<p>c</p>'] });
  assert.ok(html.includes('>1 / 3<'));
  assert.ok(html.includes('>2 / 3<'));
  assert.ok(html.includes('>3 / 3<'));
});

test('a single-page export claims no page number', () => {
  const html = exportHTML({ title: 'One', brand: PAPER_BRAND, pages: ['<p>a</p>'] });
  assert.ok(!html.includes('1 / 1'), 'numbering one page of one is noise');
  assert.ok(html.includes('ex-pagehead'), 'the running head is still there');
});

test('flow layout runs sections continuously and claims no page numbers (the browser picks the breaks)', () => {
  const pages = ['<p>a</p>', '<p>b</p>', '<p>c</p>'];
  // the cover carries `class="export-page ex-cover"`, so count the class token,
  // not the whole attribute
  const countPages = (html) => html.split('class="export-page').length - 1;

  const flow = exportHTMLParts({ title: 'Pack', brand: PAPER_BRAND, pages, layout: 'flow' }).body;
  assert.equal(countPages(flow), 2, 'flow is the cover + ONE page container, not one page per block');
  assert.equal(flow.split('class="ex-block"').length - 1, 3);
  assert.ok(!/\d \/ 3/.test(flow), 'a stamped number would be a guess once the browser paginates');

  const paged = exportHTMLParts({ title: 'Pack', brand: PAPER_BRAND, pages }).body;
  assert.equal(countPages(paged), 4, 'page layout: cover + one page per block');
  assert.ok(exportHTML({ title: 'Pack', brand: PAPER_BRAND, pages, layout: 'flow' }).includes('break-inside:avoid'),
    'sections must not straddle a page boundary in flow layout');
});

test('cover:false drops the cover page (a one-section export should not be two pages)', () => {
  // assert against the BODY — the stylesheet mentions .ex-cover either way
  const spec = { title: 'Pack', brand: PAPER_BRAND, pages: ['<p>a</p>'] };
  assert.ok(exportHTMLParts(spec).body.includes('ex-cover'), 'cover stays on by default (back-compat)');
  assert.ok(!exportHTMLParts({ ...spec, cover: false }).body.includes('ex-cover'));
});

test('the raster/SVG fixup pins the cover height with NO viewport unit (else the PNG clips)', () => {
  // The on-screen/print cover legitimately uses 70vh (inline on the ex-cover div)...
  assert.match(exportHTMLParts({ title: 'P', brand: PAPER_BRAND, pages: ['<p>a</p>'] }).body,
    /ex-cover[^>]*min-height:70vh/, 'screen/print cover fills the page via 70vh');
  // ...but the fixup appended for the single-image paths must override it with a
  // fixed px height. A `vh` here resolves against the whole foreignObject (the
  // entire image), ballooning the cover and clipping the chart below it — the
  // exact "PNG shows only half the page" bug this guards.
  assert.match(EXPORT_RASTER_CSS_FIXUP, /\.ex-cover\{min-height:\d+px!important\}/);
  assert.ok(!/vh/.test(EXPORT_RASTER_CSS_FIXUP), 'the raster fixup must never reintroduce viewport units');
});

test('the footer actually repeats — fixed-positioned in print, not appended once after the last page', () => {
  const html = exportHTML({ title: 'Pack', brand: PAPER_BRAND, pages: ['<p>a</p>', '<p>b</p>'] });
  assert.ok(html.includes('.ex-foot{position:fixed'), 'ex-foot must be fixed under @media print to repeat');
  assert.ok(html.includes('body{padding-bottom:16mm}'), 'body needs clearance or the footer covers the last lines');
});

/* ── exportSaveLast/exportLoadLast — the builder's implicit memory ─────── */

test('exportSaveLast/exportLoadLast round-trip the whole picker state, per deliverable', () => {
  globalThis.localStorage = fakeLocalStorage();
  try {
    exportSaveLast('exec', {
      included: ['scorecard', 'burn'], theme: 'light', format: 'html',
      columns: 4, layout: 'flow', paper: 'a3l', cover: false,
    });
    const got = exportLoadLast('exec');
    assert.deepEqual(got.included, ['scorecard', 'burn']);
    assert.equal(got.theme, 'light');
    assert.equal(got.format, 'html');
    assert.equal(got.columns, 4);
    assert.equal(got.layout, 'flow');
    assert.equal(got.paper, 'a3l');
    assert.equal(got.cover, false);
    assert.equal(exportLoadLast('profiles'), null, 'deliverables must not share one selection');
  } finally { delete globalThis.localStorage; }
});

test('exportLoadLast rejects garbage values instead of feeding them to the shell', () => {
  globalThis.localStorage = fakeLocalStorage();
  try {
    globalThis.localStorage.setItem(EXPORT_LAST_KEY, JSON.stringify({
      exec: { included: 'not-an-array', theme: 'neon', layout: 'sideways', cover: 'yes' },
    }));
    const got = exportLoadLast('exec');
    assert.equal(got.included, null);
    assert.equal(got.theme, null);
    assert.equal(got.layout, null);
    assert.equal(got.cover, null);
  } finally { delete globalThis.localStorage; }
});

test('exportLoadLast survives a corrupt store', () => {
  globalThis.localStorage = fakeLocalStorage();
  try {
    globalThis.localStorage.setItem(EXPORT_LAST_KEY, '{not json');
    assert.equal(exportLoadLast('exec'), null);
  } finally { delete globalThis.localStorage; }
});
