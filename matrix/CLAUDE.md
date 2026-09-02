# CLAUDE.md — Project Matrix

## What this project is
A single-file HTML R&D portfolio management tool that outputs dist/matrix.html.
Source lives in src/. Build with: node build.js

## Architecture context
Read **ARCHITECTURE.md** first — a short, distilled set of the load-bearing, non-obvious
invariants (bundle/scope model, the innerHTML + escH/safeColor render model, persistence &
uid identity, lifecycle capacity suppression, collab, the export engine, and the test/ship
gate). Forward work is in **BACKLOG.md**. Keep both lean.

## Module map (read the relevant file, not the whole project)

| Task | File to read |
|------|-------------|
| Add a field to Engineer | src/data/model.js only |
| Fix allocation/cost bug | src/core/helpers.js (+ ARCHITECTURE.md › Cost model) |
| Fix save/load/sanitise | src/core/persist.js (+ ARCHITECTURE.md) |
| Entity identity (`uid`), id→uid migration | src/data/model.js + src/core/persist.js (`uidMigrate`) (+ ARCHITECTURE.md › uid identity model) |
| Multi-user sync / conflict-merge / change history | src/sections/collab.js (+ ARCHITECTURE.md › Multi-user collaboration; relay repo ../matrix-relay) |
| Fix photos / backup / restore | src/core/photo.js, src/sections/backup.js (+ ARCHITECTURE.md) |
| AI advisor / chatbot (WebLLM) | src/sections/ai.js (+ ARCHITECTURE.md) |
| Navigation / rail / topbar / overlays | src/sections/railnav.js, src/styles/nav.css (+ ARCHITECTURE.md) |
| People / talent analytics (dimensions, story views, Talent Risk Radar) | src/sections/analytics.js |
| Portfolio (project) analytics | src/sections/portfolio.js |
| Cross-functional charter (demands / square / financials / deck) | src/sections/charter.js, src/core/financial.js (+ ARCHITECTURE.md) |
| Design-to-cost (cascade / waterfall / guidelines) | src/sections/dtc.js (+ ARCHITECTURE.md) |
| Channel mix / go-to-market synoptic | src/sections/channels.js (+ ARCHITECTURE.md) |
| Portfolio economics (now the "Economics" lens of Portfolio analytics) | src/sections/econ.js (`ecBody`) + portfolio.js lens toggle (+ ARCHITECTURE.md) |
| Executive summary (one-page cockpit) | src/sections/exec.js (+ ARCHITECTURE.md) |
| Project pipeline / intake & feasibility (candidate ranking, budget vs capacity frontier) | src/sections/pipeline.js |
| Project lifecycle (fund/hold/kill/maintenance/withdraw/EoL; capacity suppression) | src/core/globals.js (PROJECT_LIFECYCLE) + src/core/helpers.js (accessors, projSetLifecycle) (+ ARCHITECTURE.md › Project lifecycle) |
| Export deliverables (PDF/print, drag-drop block picker, templates, theme) | src/core/export.js + src/sections/packs.js (global Export door = `exportDeliverables()`) (+ ARCHITECTURE.md › Export engine) |
| Talent engagement planner (cadence/touchpoints) | src/sections/engagement.js (+ ARCHITECTURE.md) |
| Change org chart rendering | src/sections/org.js |
| Change nine-box logic | src/sections/ninebox.js |
| Fix ID card modal (engineer) | src/sections/idcard.js |
| Add a tab | src/sections/nav.js + new src/sections/mytab.js |
| Change CSS | src/styles/*.css (don't touch dist/) |
| Localization / translate a string (EN/FR/ZH) | src/core/i18n.js (status & remaining work in BACKLOG.md) |
| Personal Home (customizable widget grid + cross-domain Action Queue) | src/sections/home.js, src/styles/home.css |

## Build & ship gate
```
node build.js     → dist/matrix.html
npm test          → unit tests (pure engine functions)
npm run smoke     → real-browser smoke net (tests/smoke.mjs)
npm run verify    → build + unit + smoke = "can this ship?"  ← run before calling anything done
```
A green `node build.js` only PROVES the bundle parses — it does NOT prove it runs (see
ARCHITECTURE.md › bundle model). **`npm run verify` is the gate.**

## Full-app smoke test
`npm run smoke` (tests/smoke.mjs) replaces the old manual SMOKE-TEST.md checklist: it boots the
built app in your installed Chrome/Edge (via puppeteer-core, no download), seeds data, and asserts
every rail view renders, **every wired handler resolves to a real function** (catches the dead
`onclick` class), and every ready export opens. Current rail = 17 views across
HOME/PORTFOLIO/PLAN/PEOPLE/REVIEW + utilities (Nine-box + DISC are merged into one **Talent
placement** view with a Nine-box|DISC lens toggle — `renderTalentPlacement`/`tpSetLens`/`tpGo` in
ninebox.js; lens persisted in rail prefs).

## Critical invariants (checked by build.js)
1. No </script> inside JS strings — split as '<scr'+'ipt>'
2. All alloc arithmetic uses _allocNum() / _allocCost() — never raw multiply
3. Never shadow globals with local vars of same name (_allocCost, etc.)
4. h+= chains: no semicolons until the last line of a chain
5. No duplicate top-level declarations across bundled files — declare each
   identifier in one file only (the flat bundle is one shared scope; a
   duplicate let/const is a load-time SyntaxError the browser throws on).
   GOTCHA: the checker is line-based and does NOT strip comments — a comment
   containing `word =` (e.g. `// null = all`) is read as declaring `word`, so
   the same phrase in two files trips this. Avoid `word =` in comments.
6. The emitted bundle must parse as a classic <script> (sloppy mode) —
   build.js compiles it with vm.Script (no execution) to catch this

## Adding a field to Engineer (the right way)
1. Add to makeEngineer() in src/data/model.js
2. If it's on idcard, add to makeIdCard() instead
3. That's it — sanitise, addEngineer, addPlanningResource all use the factory
4. Add UI in src/sections/idcard.js (openIdCardModal + saveIdCardModal)
5. node build.js && open dist/matrix.html

## Adding a tab (navigation is the rail now — see ARCHITECTURE.md)
1. Create src/sections/mytab.js with renderMyTab()
2. Add to JS_FILES array in build.js
3. Add a case in src/sections/nav.js showResTab() + its highlight-loop array
4. Register on the rail: add a view to RAIL_DOMAINS and to RAIL_RES_TABS in
   src/sections/railnav.js  (the old #res-header tab strip is gone)
5. node build.js

## CSS variables
--bg, --surface, --border, --text, --muted, --dim
--accent (#c8f135 lime), --accent2 (#5be5c8 teal)
--danger (#f14335), --warn (#f1a435)

## Key globals (defined in src/core/globals.js)
engineers[], projects[], allocRows[], engGroups[], sections[]
_nineBoxPlacements{}, _discPlacements{}, _ktPlans{}
resActiveTab, planViewMode, nextEngId, nextAllocId
