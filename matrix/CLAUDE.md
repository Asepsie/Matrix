# CLAUDE.md — Project Matrix

## What this project is
A single-file HTML R&D portfolio management tool that outputs dist/matrix.html.
Source lives in src/. Build with: node build.js

## Architecture context
See **ARCHITECTURE.md** for non-obvious design context (read it before touching
data/persistence). It currently covers data & persistence — the three storage
layers, the per-dataset `eng.id` identity gotcha, and the restore invariant.
Append a new section there whenever you learn something non-obvious about another
area.

## Module map (read the relevant file, not the whole project)

| Task | File to read |
|------|-------------|
| Add a field to Engineer | src/data/model.js only |
| Fix allocation/cost bug | src/core/helpers.js |
| Fix save/load/sanitise | src/core/persist.js (+ ARCHITECTURE.md) |
| Fix photos / backup / restore | src/core/photo.js, src/sections/backup.js (+ ARCHITECTURE.md) |
| AI advisor / chatbot (WebLLM) | src/sections/ai.js (+ ARCHITECTURE.md) |
| Navigation / rail / topbar / overlays | src/sections/railnav.js, src/styles/nav.css (+ ARCHITECTURE.md) |
| Portfolio (project) analytics | src/sections/portfolio.js |
| Cross-functional charter (demands / square / financials / deck) | src/sections/charter.js, src/core/financial.js (+ ARCHITECTURE.md) |
| Change org chart rendering | src/sections/org.js |
| Change nine-box logic | src/sections/ninebox.js |
| Fix ID card modal (engineer) | src/sections/idcard.js |
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
5. No duplicate top-level declarations across bundled files — declare each
   identifier in one file only (the flat bundle is one shared scope; a
   duplicate let/const is a load-time SyntaxError the browser throws on)
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
