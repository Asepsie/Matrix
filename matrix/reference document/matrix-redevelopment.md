# Project Matrix — Redevelopment Architecture

**Version:** 1.0  
**Status:** Proposal  
**Context:** Redevelopment of `matrix.html` (~14,500 lines, single-file monolith) into a maintainable, Claude Code-friendly multi-file project that still compiles to a single distributable HTML file.

---

## 1. The Problem with the Current Architecture

The current `matrix.html` is a 650 KB single-file application. It works well for end-users (one file, no server, no install), but it has structural problems that make AI-assisted development painful:

- **Claude Code context limits:** At ~14,500 lines, the full file exceeds what fits comfortably in a context window. Every edit requires reading thousands of irrelevant lines to find the target.
- **No module boundaries:** All 446 functions live in one flat JS scope. A change to the allocation logic can accidentally shadow a global used by the org chart renderer.
- **No build-time safety net:** There is no test runner, no linter, no type checking. The only validation is manual inspection and a Python regex script.
- **CSS is buried:** ~35 KB of CSS is embedded before the HTML skeleton, making visual iteration slow.
- **Feature additions require searching:** Adding a field to `engineer` touches six separate locations with no tooling to verify you got all of them.
- **Git diffs are useless:** A one-line logic change produces a noisy diff across an unrelated section of a 14,500-line file.

The goal of this redevelopment is to fix all of the above while keeping the end-user experience identical: a single `.html` file they open in a browser, with no server and no internet dependency.

---

## 2. Core Principle: Build-to-Single-File

The key insight is that the single-file output is a **deployment format**, not a source format. The source can be as modular as needed, and a build step assembles the final `matrix.html`. This is the same approach used by virtually every modern frontend project (Vite, esbuild, webpack). We just run it in Claude Code's bash environment instead of a CI server.

```
src/               ← you edit this
  ├── data/
  ├── sections/
  ├── styles/
  └── templates/
build.js           ← node build.js → dist/matrix.html
dist/
  └── matrix.html  ← you distribute this (unchanged end-user experience)
```

The build step is a simple Node.js script with zero external dependencies beyond what's already in any Node install. It does three things: concatenate CSS, bundle JS modules, and inject everything into an HTML shell. Total build time: under one second.

---

## 3. Proposed Directory Structure

```
matrix/
├── build.js                    Build script — outputs dist/matrix.html
├── package.json                { "type": "module" } + scripts
├── CLAUDE.md                   Claude Code context file
│
├── src/
│   ├── index.html              HTML shell (static overlays, modal skeletons)
│   │
│   ├── styles/
│   │   ├── base.css            CSS variables, reset, typography
│   │   ├── layout.css          Panels, overlays, grid
│   │   ├── components.css      Buttons, inputs, cards, badges
│   │   ├── table.css           Alloc table, sticky columns
│   │   └── print.css           Print / PDF export overrides
│   │
│   ├── data/
│   │   └── model.js            Canonical data model + factory functions
│   │
│   ├── core/
│   │   ├── globals.js          State variables, constants, nextId counters
│   │   ├── helpers.js          escH, G, curMonth, getMonthRange, _allocNum, _allocCost
│   │   ├── persist.js          saveState, loadState, sanitise, IndexedDB wrappers
│   │   └── photo.js            idbCompressAndSave, idbGetPhoto, idbPreloadAll
│   │
│   └── sections/
│       ├── roster.js           engCardHTML, addEngineer, addPlanningResource
│       ├── plan.js             renderResPlan, allocRowHTML, exportPlan*
│       ├── dashboard.js        renderResDashboard, _buildCostMaps, _buildEngUtil
│       ├── timeline.js         renderTimeline
│       ├── development.js      renderDevelopment, _devFormula
│       ├── skills.js           renderSkillsTab, skill risk, skill categories
│       ├── idcard.js           openIdCardModal, saveIdCardModal, CoPs, reviews, succession
│       ├── org.js              buildOrgTree, orgLayout, renderOrgChart, exports
│       ├── profiles.js         renderProfilesTab
│       ├── heatmap.js          renderHeatmap
│       ├── ninebox.js          renderNineBox, drag/drop, exports
│       ├── disc.js             renderDiscMatrix
│       ├── backup.js           exportFullBackup, importFullBackup
│       └── nav.js              showResTab, setActivePill, openOrgChart
│
├── dist/
│   └── matrix.html             ← build output, the file you distribute
│
└── tests/
    ├── helpers.test.js         Unit tests for _allocNum, _allocCost, escH
    ├── persist.test.js         Sanitise round-trip tests
    └── model.test.js           Factory function tests
```

Total: ~16 source files producing one output file. Each source file is 200–800 lines — comfortable for a single Claude Code context.

---

## 4. The Data Model Layer (`src/data/model.js`)

The biggest current pain point is that the data model is implicit — scattered across `addEngineer()`, `loadState()` sanitise blocks, the ID card modal, and six other locations. A change to the `Engineer` type requires manual updates everywhere.

The solution is a single `model.js` that owns the canonical shape of every entity. It exports factory functions that return objects with all fields at their default values. Every other module imports from here.

```js
// src/data/model.js

export function makeEngineer(overrides = {}) {
  return {
    id:              null,
    name:            'New Engineer',
    monthlyCost:     8000,
    groupId:         null,
    role:            '',
    location:        '',
    vacant:          false,
    planningOnly:    false,
    includeInCost:   false,
    excludeFromCalc: false,
    includeTalent:   true,
    skills:          [],
    idcard:          makeIdCard(),
    ...overrides,
  };
}

export function makeIdCard(overrides = {}) {
  return {
    reportsTo:         '',
    manager:           '',
    seniority:         '',
    startdate:         '',
    reviewdate:        '',
    languages:         '',
    gender:            '',
    aspirations:       '',
    strengths:         '',
    devarea:           '',
    notes:             '',
    comparatio:        null,
    contract:          '',
    photo:             '',
    cops:              [],
    reviews:           [],
    succession:        makeSuccessionPlan(),
    _isDictionary:     false,
    ...overrides,
  };
}

export function makeSuccessionPlan(overrides = {}) {
  return {
    successorId:        '',
    successorFreeText:  '',
    timeframe:          '',
    gaps:               '',
    ...overrides,
  };
}

export function makeProject(overrides = {}) { /* ... */ }
export function makeAllocRow(overrides = {}) { /* ... */ }
export function makeSkill(overrides = {}) { /* ... */ }
export function makeCop(overrides = {}) { /* ... */ }
export function makeReview(overrides = {}) { /* ... */ }
```

Now `loadState()` sanitise logic becomes:

```js
// src/core/persist.js
import { makeEngineer, makeIdCard, makeSuccessionPlan } from '../data/model.js';

function sanitiseEngineer(e) {
  const defaults = makeEngineer();
  const idcDefaults = makeIdCard();
  const succDefaults = makeSuccessionPlan();

  // Merge missing top-level fields
  for (const key of Object.keys(defaults)) {
    if (e[key] === undefined) e[key] = defaults[key];
  }
  // Merge missing idcard fields
  for (const key of Object.keys(idcDefaults)) {
    if (e.idcard[key] === undefined) e.idcard[key] = idcDefaults[key];
  }
  // Merge missing succession fields
  for (const key of Object.keys(succDefaults)) {
    if (e.idcard.succession[key] === undefined)
      e.idcard.succession[key] = succDefaults[key];
  }
}
```

**When you add a new field to `Engineer`:** add it once, in `makeEngineer()`. The sanitise loop picks it up automatically, `addEngineer()` uses the factory function, and tests verify the round-trip. Zero manual syncing.

---

## 5. The Build Script (`build.js`)

The build script is a plain Node.js ESM script with no external dependencies. It runs in under one second.

```js
// build.js
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC = './src';
const OUT = './dist/matrix.html';

// 1. Concatenate CSS
const CSS_FILES = [
  'styles/base.css',
  'styles/layout.css',
  'styles/components.css',
  'styles/table.css',
  'styles/print.css',
];
const css = CSS_FILES
  .map(f => readFileSync(join(SRC, f), 'utf8'))
  .join('\n');

// 2. Bundle JS — ordered for dependency resolution
// (simple topological order: data → core → sections → nav)
const JS_FILES = [
  'data/model.js',
  'core/globals.js',
  'core/helpers.js',
  'core/persist.js',
  'core/photo.js',
  'sections/roster.js',
  'sections/plan.js',
  'sections/dashboard.js',
  'sections/timeline.js',
  'sections/development.js',
  'sections/skills.js',
  'sections/idcard.js',
  'sections/org.js',
  'sections/profiles.js',
  'sections/heatmap.js',
  'sections/ninebox.js',
  'sections/disc.js',
  'sections/backup.js',
  'sections/nav.js',
];

const js = JS_FILES
  .map(f => {
    const content = readFileSync(join(SRC, f), 'utf8');
    // Strip ES module import/export keywords — the bundle is a single scope
    return content
      .replace(/^export (function|const|let|var|class)/gm, '$1')
      .replace(/^export default /gm, '')
      .replace(/^import .* from ['"].*['"];?\s*$/gm, '')
      + `\n/* ◄◄ END: ${f} ►► */\n`;
  })
  .join('\n');

// 3. Inject into HTML shell
const shell = readFileSync(join(SRC, 'index.html'), 'utf8');
const output = shell
  .replace('<!-- {{CSS}} -->', `<style>\n${css}\n</style>`)
  .replace('<!-- {{JS}} -->', `<script>\n${js}\n</script>`);

writeFileSync(OUT, output);
console.log(`Built → ${OUT} (${Math.round(output.length / 1024)} KB)`);
```

Run with:

```bash
node build.js
```

Or add to `package.json`:

```json
{
  "name": "project-matrix",
  "type": "module",
  "scripts": {
    "build": "node build.js",
    "watch": "node --watch build.js",
    "test":  "node --test tests/*.test.js",
    "check": "node -e \"const h=require('fs').readFileSync('dist/matrix.html','utf8'); const js=h.slice(h.indexOf('<script>')+8,h.indexOf('</script>')); require('child_process').execSync('node --check /tmp/_chk.js', {input:js}); console.log('OK')\""
  }
}
```

The `--watch` flag (native Node.js ≥ 18) rebuilds automatically on any source change — no Vite, no webpack, no esbuild required.

---

## 6. Module Scope Strategy

The current file uses a flat global scope (all functions and `let` variables at the top level of the `<script>` block). The new source files use ES module syntax (`import`/`export`) during development but the build script strips these keywords before injecting into the HTML bundle. The result is the same flat global scope in the output — 100% backward compatible with existing event handlers in the HTML like `onclick="renderOrgChart()"`.

This means:
- **During development:** Claude Code can import/export between files for static analysis and type inference
- **In the output bundle:** functions are globals, just as today
- **No breaking changes:** all `onclick=` attributes in `index.html` continue to work

The one discipline required is that cross-module calls must reference functions by their global name, not via import. The convention in `CLAUDE.md` will document this.

---

## 7. `CLAUDE.md` — Claude Code Context File

This is the most important file in the project for AI-assisted development. It replaces the current `matrix_dev_reference.md` and is read automatically by Claude Code at the start of every session.

```markdown
# CLAUDE.md — Project Matrix

## What this project is
A single-file HTML R&D portfolio management tool that outputs dist/matrix.html.
Source lives in src/. Build with: node build.js

## Module map (read the relevant file, not the whole project)

| Task | File to read |
|------|-------------|
| Add a field to Engineer | src/data/model.js only |
| Fix allocation/cost bug | src/core/helpers.js |
| Fix save/load/sanitise | src/core/persist.js |
| Change org chart rendering | src/sections/org.js |
| Change nine-box logic | src/sections/ninebox.js |
| Fix ID card modal | src/sections/idcard.js |
| Add a tab | src/sections/nav.js + new src/sections/mytab.js |
| Change CSS | src/styles/*.css (don't touch dist/) |

## Build
node build.js → dist/matrix.html
node --test tests/*.test.js → run unit tests

## Critical invariants (checked by build.js)
1. No </script> inside JS strings — split as '<scr'+'ipt>'
2. All alloc arithmetic uses _allocNum() / _allocCost() — never raw multiply
3. Never shadow globals with local vars of same name (_allocCost, etc.)
4. h+= chains: no semicolons until the last line of a chain

## Adding a field to Engineer (the right way)
1. Add to makeEngineer() in src/data/model.js
2. If it's on idcard, add to makeIdCard() instead
3. That's it — sanitise, addEngineer, addPlanningResource all use the factory
4. Add UI in src/sections/idcard.js (openIdCardModal + saveIdCardModal)
5. node build.js && open dist/matrix.html

## Adding a tab
1. Create src/sections/mytab.js with renderMyTab()
2. Add to JS_FILES array in build.js
3. Add button in src/index.html res-header
4. Add case in src/sections/nav.js showResTab()
5. node build.js

## CSS variables
--bg, --surface, --border, --text, --muted, --dim
--accent (#c8f135 lime), --accent2 (#5be5c8 teal)
--danger (#f14335), --warn (#f1a435)

## Key globals (defined in src/core/globals.js)
engineers[], projects[], allocRows[], engGroups[], sections[]
_nineBoxPlacements{}, _discPlacements{}, _ktPlans{}
resActiveTab, planViewMode, nextEngId, nextAllocId
```

---

## 8. Test Strategy

The current file has zero automated tests. The new structure makes unit testing trivial because pure functions can be imported in isolation.

```js
// tests/helpers.test.js
import { strict as assert } from 'assert';
import { _allocNum, _allocCost } from '../src/core/helpers.js';

// _allocNum
assert.equal(_allocNum(0.5), 0.5,   '50% FTE');
assert.equal(_allocNum('m'),  0,     'medical = 0 FTE');
assert.equal(_allocNum('p'),  1.0,   'PTO = 1 FTE');
assert.equal(_allocNum('r'),  0,     'resigned = 0 FTE');
assert.equal(_allocNum(1.0),  1.0,   'full FTE');

// _allocCost
assert.equal(_allocCost(0.5, 8000), 4000,  '50% of 8000');
assert.equal(_allocCost('m', 8000), 0,     'medical = no cost');
assert.equal(_allocCost('p', 8000), 8000,  'PTO = full cost');
assert.equal(_allocCost('r', 8000), 0,     'resigned = no cost');

console.log('helpers.test.js: all assertions passed');
```

```js
// tests/persist.test.js
import { strict as assert } from 'assert';
import { makeEngineer, makeIdCard } from '../src/data/model.js';

// Round-trip: a minimal stored object gains all default fields after sanitise
const stored = { id: 1, name: 'Alice', monthlyCost: 9000 }; // old format
const defaults = makeEngineer();
for (const key of Object.keys(defaults)) {
  if (stored[key] === undefined) stored[key] = defaults[key];
}
assert.ok(stored.idcard,             'idcard added');
assert.ok(stored.idcard.succession,  'succession added');
assert.equal(stored.includeTalent, true, 'includeTalent defaulted');

console.log('persist.test.js: all assertions passed');
```

Run with `node --test tests/helpers.test.js` (native Node.js test runner, no Jest needed).

---

## 9. Migration Strategy

The goal is to reach the new architecture incrementally without breaking the working application. The migration has four phases.

### Phase 1 — Scaffold (1 session, ~30 min)

Create the directory structure, `build.js`, and `CLAUDE.md`. Copy the current `matrix.html` content into the appropriate files by mechanically splitting on `/* ►► SECTION: X ◄◄ */` markers. At the end of Phase 1, `node build.js` produces a `dist/matrix.html` that is byte-for-byte equivalent to the original.

Steps:
1. Create `src/index.html` — extract `<style>` and `<script>` content, leave `<!-- {{CSS}} -->` and `<!-- {{JS}} -->` placeholders
2. Create `src/styles/base.css` — paste the existing CSS block
3. Create one `src/sections/*.js` per `SECTION:` marker — paste the JS content verbatim
4. Create `build.js` with the concatenation logic above
5. Run `node build.js` and diff against original — should be identical except for section separator comments

No logic changes in Phase 1. It's a pure structural reorganisation.

### Phase 2 — Data model extraction (1 session, ~45 min)

Create `src/data/model.js` with all factory functions. Update `src/core/persist.js` to use the loop-based sanitise pattern. Write `tests/persist.test.js`. This is the highest-value change: every future field addition becomes a one-line edit in one file.

### Phase 3 — Core helpers isolation (1 session, ~30 min)

Move `_allocNum`, `_allocCost`, `escH`, `G`, `getMonthRange`, `curMonth` to `src/core/helpers.js`. Write `tests/helpers.test.js`. Add the invariant check to `build.js` (the current Python script, ported to JS).

### Phase 4 — Section cleanup (ongoing, one section per session)

For each section file: add JSDoc comments to public functions, break large render functions into smaller named helpers, remove dead code. No behaviour changes. Validate with `node build.js && open dist/matrix.html` after each section.

---

## 10. Build Script Invariant Checks

Port the current Python validation script into `build.js` so it runs automatically on every build:

```js
// In build.js, after writing the output file

function validateOutput(outputPath) {
  const html = readFileSync(outputPath, 'utf8');
  const jsStart = html.indexOf('<script>') + 8;
  const jsEnd = html.indexOf('</script>');
  const js = html.slice(jsStart, jsEnd);

  // 1. Script tag balance
  const opens  = (html.match(/<script/g) || []).length;
  const closes = (html.match(/<\/script>/g) || []).length;
  if (opens !== 2 || closes !== 2)
    throw new Error(`Script tag imbalance: ${opens} open, ${closes} close`);

  // 2. No </script> inside JS block
  if (/<\/script>/i.test(js))
    throw new Error('</script> found inside JS block — split the string literal');

  // 3. No raw alloc multiplication
  if (/allocs\[m\]\s*\*/.test(js))
    throw new Error('Raw alloc multiplication — use _allocCost()');

  console.log('✓ All invariant checks passed');
}

validateOutput(OUT);
```

---

## 11. Is This Feasible?

Yes. Here is an honest assessment of the effort:

| Phase | Estimated effort | Risk |
|-------|-----------------|------|
| Phase 1: Scaffold | 1–2 hours, one Claude Code session | Low — mechanical split, no logic changes |
| Phase 2: Data model | 1 hour | Low — additive change, tests verify correctness |
| Phase 3: Core helpers | 45 min | Low — moving existing functions |
| Phase 4: Section cleanup | 30–60 min per section | Low per section; 16 sections total |

The full migration can be done across several short sessions without ever breaking the working application. At any point, `node build.js` produces a valid `dist/matrix.html` and `npm test` validates core logic.

The net result for Claude Code development:
- Ask Claude to modify the org chart → Claude reads only `src/sections/org.js` (~700 lines)
- Add a field to Engineer → Claude reads only `src/data/model.js` (~80 lines)
- Fix a dashboard cost bug → Claude reads `src/sections/dashboard.js` + `src/core/helpers.js`

No more navigating a 14,500-line monolith. No more risk of accidentally touching an unrelated section. Tests catch regressions before the file is even opened in a browser.

---

## 12. Things That Do Not Change

To be explicit about what the end-user experience is after this migration:

- The distributed file is still `matrix.html` — a single file, no server, no internet dependency
- All existing `localStorage` data loads correctly (the data model is backward-compatible via sanitise)
- All IndexedDB photo data continues to work
- The `matrix-tour.js` companion file is still supported (it's referenced in `index.html`, unchanged)
- All existing features work identically
- The dark theme, CSS variables, and IBM Plex Mono font are unchanged
- Export functions (SVG, PNG, CSV, PDF popup) are unchanged

The only thing that changes is the developer experience: the source is modular, testable, and navigable.
