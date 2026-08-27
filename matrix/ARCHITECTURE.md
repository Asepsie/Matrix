# ARCHITECTURE — Project Matrix

Minimal context for future sessions. Add new sections as other areas get touched;
keep entries short — record what is *non-obvious from the code*, not a full tour.

---

## Pipeline board — new-project intake & feasibility (`pipeline.js`)

`INSIGHTS › Pipeline` ([src/sections/pipeline.js](src/sections/pipeline.js), all
`pipe`/`_pipe`/`PIPE_`-prefixed). A read-only **decision aid** for the front of the
funnel: rank CANDIDATE projects and check them against a money budget **and** a
people ceiling at once. It composes existing engines rather than recomputing —
the whole feature is a *join*, not new analytics.

### What it reuses (the join)

- **Value/return:** `ecDataset()` ([econ.js](src/sections/econ.js)) — the per-project
  NPV / risk-adj NPV / IRR / PI / `invested` (effInvestment). Pipeline indexes it by
  `p.id`; it does **not** call `calculateFinancials` itself.
- **People:** `pipelineCapacity(months)` ([dashboard.js](src/sections/dashboard.js)) —
  a NEW pure, memoised roll-up of the SAME supply math the Resource Balancer hero
  computes inline (counted engineers via `_costCounts`, minus fully medical/resigned
  months, minus engaged FTE). Returns `{supply, engaged, free, over, byGroup}` in
  FTE·months; `free` (idle FTE·months = bench headroom) is the capacity ceiling. The
  dashboard still has its own inline copy — the extraction exists so Pipeline can get
  capacity WITHOUT a dashboard render; delegating the dashboard to it is a future tidy.
- **Lifecycle:** `pipeIsCandidate(p)` = `projLifecycle(p)` is `'proposed'` or
  `'on_hold'` (see *Project lifecycle* below). **Candidacy is the lifecycle field, NOT
  the gate stage** (an earlier cut keyed candidacy off `gtCurStageIdx` < commit gate —
  replaced, because the disposition needs to be an explicit, logged decision, not
  inferred). The commit-gate selector now only chooses which gate `gtStageReadiness`
  scores for the go/no-go strip. Funding a candidate flips it to `'active'` (leaves the
  board, starts consuming capacity). `＋ Add candidate` creates a `makeProject({lifecycle:
  'proposed'})`; the Fund/Hold/Kill buttons call `pipeDecide` → `projSetLifecycle`.

### The one new datum — `charter.demand`

A committed project's FTE demand comes from `allocRows`; a *candidate* isn't staffed
yet, so it needs a forecast. `makeCharter().demand = makeCharterDemand()` =
`{peakFte, fteMonths, byGroup:{}}` ([model.js](src/data/model.js)); back-filled in
`sanitiseCharter` ([persist.js](src/core/persist.js)). **It rides persistence for free**
— `demand` is nested inside `project.charter`, and `projects[]` is already in all three
capture surfaces, so it needs NO `MUST_PERSIST` entry (that guard is top-level keys only).
Edited **inline in the ranking table** (the only state mutation here → `pipeSetDemand`
→ `saveState`, debounced), not on the charter tab.

### The frontier (greedy, dual-ceiling)

`pipeScore` ranks by NPV-per-FTE·month (default; toggle to per-€ or raw risk-adj NPV);
no-NPV rows sink last. `pipeFrontier` walks the ranked list accumulating € and
FTE·months and funds while BOTH stay under their ceilings; the first breach is the
fund/defer cut (rest deferred, greedy stop). The SVG normalises each cumulative to its
OWN ceiling (100% line) so "which constraint binds first" is visible; budget-null →
the € curve normalises to Σinvested (informational, never binding). Board controls
(budget in M€, sort, commit gate) are **session-only** vars, not persisted.

### ⚠ Gotcha that cost real debug time — `*/` inside a block comment

The section header comment listed the prefixes as `pipe*/_pipe*/PIPE_` — the `*/`
**closed the `/* */` block comment early**, turning the rest into code with a stray
regex literal. `build.js`'s `vm.Script` compile tolerated the garbage (V8 lazy-parse),
so **the build passed**, but the browser threw `SyntaxError: Invalid regular expression:
missing /` at top-level script eval — which **aborts everything after that file in the
bundle**, including `boot()`. Symptom: rail rendered (earlier file) but `boot` never ran
→ data loaded into localStorage but `PROJECTS 0`, and a stale `railTogglePin is not
defined` from the half-initialised page. Lesson: **never write `*/` inside a block
comment**, and a green `node build.js` does NOT prove the bundle runs in a browser —
`vm.Script` only parses, it doesn't execute top level.

### Registration & verify

Registered like any res tab: `JS_FILES` (after gate.js) + `RAIL_DOMAINS`/`RAIL_RES_TABS`
([railnav.js](src/sections/railnav.js)) + `showResTab` case & highlight array
([nav.js](src/sections/nav.js)). Verified in-browser against a seeded 5-project /
4-engineer dataset: candidate detection, ranking + re-sort on demand edit, budget ceiling
moving the cut, dual-curve frontier SVG, go/no-go readiness, inline-demand persistence,
the Fund action (proposed→active, logged, drops from the board), and capacity suppression
(holding a consuming project freed its FTE·months). Pure engine covered by
`tests/pipeline.test.js` + `tests/lifecycle.test.js` (`pipeScore`/`pipeFrontier`/
`pipelineCapacity`/`projSetLifecycle`/`_projCapacitySet`) — `pipeScore(r, sort)` takes its
metric as a param to stay global-free; the capacity roll-up is tested against a synthetic
engUtil injected via globalThis (the impure `_buildEngUtil`/`_memo` seam), and lifecycle.test
dynamic-imports globals.js (after shimming its load-time `t`/`makeGateConfig`) for the real
`PROJECT_LIFECYCLE` table.

---

## Project archive — closed/finished browser (`archive.js`)

A thin feature on top of lifecycle, NOT a new data model. **"Archived" = terminal lifecycle**
(`projLifecycleDef(p).phase==='terminal'`): `cancelled` / `withdrawn` / `eol` / **`completed`**
(the last added by this feature — a positive "finished successfully" bucket, `activePortfolio:false`,
color `#5b9e6e`). The one accessor is **`projIsArchived(p)`** ([helpers.js](src/core/helpers.js)) —
distinct from `proposed` (pipeline, also non-active) and `on_hold` (paused but live).

- **Working views hide archived by default** (keeps them clean): the Resource **plan** grid (rows +
  the row project selector; toggle `planShowArchived` in the toolbar, shown only when archived projects
  exist), the **balancer** project picker (`_balDefaultProject` skips them too), and the **charter /
  DTC / channel** project dropdowns. Every filter keeps the *currently-selected* archived project so you
  can still VIEW one. All gated `typeof projIsArchived==='function'` (engine stays load-order-safe).
- **Archive browser** = a rail UTILITY (`RAIL_UTIL` `archive`, like Snapshots): `#archive-overlay`,
  `openArchive`/`closeArchive`/`renderArchive`/`archRestore`/`archView` (arch-prefixed). Lists terminal
  projects grouped by state, each with **Restore** (→ `projSetLifecycle(p,'active',…)`, so it's logged
  in `lifecycleHistory` like any lifecycle change) and **View** (opens the balancer focused on it).
- **`completed` had to be added in TWO places** — `PROJECT_LIFECYCLE` ([globals.js](src/core/globals.js))
  AND the **hardcoded `#e-lifecycle` `<select>`** in [index.html](src/index.html) (that dropdown is NOT
  built from the table — a gotcha: adding a lifecycle state to the table alone leaves it unselectable in
  the editor). `sanitiseProjects` validates `p.lifecycle` against `PROJECT_LIFECYCLE`, so the new id is
  accepted and never reset. No persistence/capture-surface changes (lifecycle already rides `projects[]`).
- **Gate board hides archived ENTIRELY** — `gtActiveProjects()` ([gate.js](src/sections/gate.js)) filters
  terminal projects out of the pipeline kanban, the projects picker, and (via `gtProjOrder`) the PI
  roadmap + PI plan. Kept unfiltered: `gtBuildSignalMap` (data map, keyed by id) and the increment-cleanup
  loop (must touch all projects' `roadmap`).
- **Analytics/governance views exclude archived with a toggle** — shared `showArchivedProj`
  ([globals.js](src/core/globals.js)) + `analyticsProjects()` / `analyticsArchivedToggle(rerenderFn)`
  ([helpers.js](src/core/helpers.js)). Wired into **portfolio** (`pfBuildDataset`), **exec** (delivery
  loops), **backlog** (`_blItems` + project dropdowns). **Coupling to know:** `ecDataset` builds ON
  `pfBuildDataset`, so **econ inherits the filter for free** — and so do `gtBuildSignalMap`/home/pipeline
  (all downstream of `ecDataset`), which is *consistent* (archived drops out of live signals) but means
  the one `showArchivedProj` toggle has portfolio-wide reach. Gate stays visually clean regardless because
  it filters at its own view level.

## Project lifecycle — fund / hold / cancel / maintenance / withdraw / EoL

A project's **disposition**, distinct from its gate stage (forward development position)
and `tacticalIntent` (strategic posture). One persisted enum `project.lifecycle` +
`lifecycleReason` + append-only `lifecycleHistory[]` ({ts,from,to,reason}). The single
source of truth is **`PROJECT_LIFECYCLE`** ([globals.js](src/core/globals.js)) — an ordered
list of `{id,label,phase,consumes,activePortfolio,color}`:

`proposed` · `active` (Funded/Active) · `on_hold` · `cancelled` · `in_service` ·
`maintenance` · `maint_cancelled` · `withdrawn` · `eol`.

- **`consumes`** = its allocations count against team capacity (true for active /
  in_service / maintenance). **`activePortfolio`** = it belongs to the LIVE portfolio
  (terminal states — cancelled/withdrawn/eol — are history only; on_hold/maint_cancelled
  stay in the active portfolio but stop consuming).
- **Accessors** ([helpers.js](src/core/helpers.js)): `projLifecycle(p)`,
  `projLifecycleDef(idOrProj)`, `projConsumesCapacity(p)`, `projIsActivePortfolio(p)`,
  and the memoised **`_projCapacitySet()`** (project ids whose demand counts — the
  suppression choke point). `projSetLifecycle(p,next,reason)` records a transition (writes
  state + reason, appends to the log, returns whether it changed) — used by the sidebar
  editor AND the Pipeline board's `pipeDecide`.

### Capacity/cost suppression (the wiring)

`_computeEngUtil` ([helpers.js](src/core/helpers.js)) and `_computeCostMaps`
([dashboard.js](src/sections/dashboard.js)) both **skip an alloc row when
`r.projectId != null && !_projCapacitySet().has(r.projectId)`** — so a held/cancelled/EoL
project's allocations stop counting as demand, cost, utilisation, and over-allocation
everywhere at once (dashboard, analytics, plan, home, pipeline all read these two). Rows
with no `projectId` (unassigned) always count. Verified: holding a consuming project
raised free capacity by exactly its engaged FTE·months.

**Migration / defaults (by gate position, not blanket-active).** A project with no (or
invalid) `lifecycle` is normalised in `sanitiseProjects` by **`_projAtInitialGate(p)`**: at
the initial gate (its `gatePlan.stageId` is unset, or equals the FIRST stage id of the
active — possibly custom — methodology) → `'proposed'`; advanced past the first gate →
`'active'`. `makeProject`'s own default is `'proposed'` (a fresh project sits at the initial
gate = intake). The `lifecycle===undefined` guard makes the migration one-time per project
(a funded proposal is never re-derived), so no version flag is needed. **Consequence to
know:** a portfolio that never engaged the gate (every `stageId=''`) migrates ENTIRELY to
`proposed` on first load → its demand is suppressed until each project is funded. **Ordering
invariant (all three restore paths):** `gateConfig` must be assigned BEFORE `sanitiseProjects`
so `_projAtInitialGate` reads the restored dataset's (possibly custom) first stage, not the
session's. `loadState` (persist.js:380 → :424), `restoreSnap` (:984 → :985) and
`importFullBackup` ([backup.js](src/sections/backup.js): gateConfig block moved above the
`projects`/`sanitiseProjects` line, 2026-08-23 fix) all honour it. Previously importFullBackup
sanitised first, so a PRE-lifecycle backup carrying a custom methodology mis-migrated against
the session's config. Verified: a project at a custom first stage `discover` → `proposed`;
past it → `active`.

### Editing & gotchas

- **Edit surfaces:** the canonical dropdown is `#e-lifecycle` in the project edit panel
  ([index.html](src/index.html) + `populateEditor`/`saveEdit` in
  [sidebar.js](src/sections/sidebar.js)); the Pipeline board's Fund/Hold/Kill buttons are
  the fast path for candidates; the **Gate board's GATE DECISION bar** (`gtDecide` in
  [gate.js](src/sections/gate.js), Projects detail) is the reviewer's Go/Hold/Kill — Go also
  advances the stage via `gtStepStage` (disposition and gate stage are separate axes with
  separate history logs; a declined blocked-override still leaves the project funded but at its
  stage). All route through `projSetLifecycle` so every change is logged.
- **New field, no MUST_PERSIST entry needed** — `lifecycle`/`lifecycleReason`/
  `lifecycleHistory` live on the project, and `projects[]` is already in all three capture
  surfaces (that guard checks top-level state keys only).
- **`confirmAdd` now uses `makeProject`** ([modals.js](src/sections/modals.js)) — a matrix-added
  project carries `charter`/`gatePlan`/`lifecycle` (= `'proposed'`, a fresh intake) at creation,
  no longer relying on the next load's `sanitiseProjects` to back-fill. (Was a raw literal.)

---

## Personal Home — customizable widget grid + Action Queue (`home.js`)

The default front door: `HOME › Home` ([src/sections/home.js](src/sections/home.js) +
[src/styles/home.css](src/styles/home.css), all `home`/`_home`/`HOME_`-prefixed). A rail-inset
VIEW (`#home-overlay`, `left:var(--rail)`, z400, like `#brief-overlay`). **"Everything is a
widget"** — a per-device grid the user *composes* from a curated library; the ranked cross-domain
**Action Queue** is the hero widget (on by default) but is itself removable/movable/resizable like
any other. This is a deliberate change from HOME-PLAN.md's original "fixed Action-Queue hero" —
the user chose the fully-customizable model (build history in [HOME-PLAN.md](HOME-PLAN.md)).

### Two layers, kept apart (the testability split)

1. **Engine (pure, node-testable)** — `homeBuildActions(ctx)` + its classifiers (`homeClassifyPerson`
   / `homeClassifyProject`), `homeSuppress`/`homeApplyState`/`homeFilterItems`/`homeRank`/`homeHash`/
   `homeEngImpact`. These take **plain inputs**, call NO producer/DOM globals, and are the only things
   the tests import. **home.js top level must stay global-free** (no top-level `t()`/`G()` calls) so
   `import`ing it in Node runs only declarations — that's why `HOME_THRESHOLDS`/`HOME_BAND_RANK` are
   plain consts and the widget registry is a **function** (`homeWidgetDefs()`), not a top-level const.
   Classifier titles/why are **plain English literals** (no `t()`) — Home's dynamic action text is
   deliberately un-i18n'd for now; only the chrome (widget titles, buttons) goes through `t()`.
2. **Gather + UI** — `homeRawItems` reads the live producers (`buildAnalyticsDataset`,
   `gtBuildSignalMap`+`gtStageReadiness`/`gtCurStageIdx`, `_buildEngUtil`, `tegThisWeekList`,
   `allocRows`/`projects`/`gateConfig`), so `home.js` loads LATE in `JS_FILES` (after
   analytics/gate/econ/charter/engagement, before collab). Null-tolerant throughout (every producer
   call guarded — a talent-only dataset yields only people items, a no-charter project yields no
   portfolio items, never throws).

### Action Queue engine (the people × portfolio join)

One item per **entity × concern** (13 concerns across 4 domains: **people** — retention-risk/
over-allocation/bench/stale-review/engagement-due · **governance** — gate-blocked/gate-behind ·
**portfolio** — charter-conflict/value-destroying/low-unit-margin/dtc-gap/channel-concentration ·
**planner** — task-overdue/task-pinned). The **planner** concerns (`homeClassifyTask` over every
project's `p.todos`/`p.actions` via `homeProjectTasks`) exist because the first cut was all
project-signal-derived — the user's own to-dos/actions (overdue = warn, pinned `execPin` = watch,
`entityUid = pid-kind-taskid`) were missing. Item id `= concern:entityType:entityUid`. Carries **both** `entityUid`
(durable — state/resurface key, survives reload+merge) **and** `entityId` (numeric — deep-link openers).
Ranking = **severity band (critical/warn/watch) then € impact** (no composite score). Impact: a project
uses `max(0, riskAdjNpv)`; a **person's is blast-radius** = Σ over the projects they touch of that
project's risk-adjusted upside, **×`spofBoost` (1.5) if a KT-less sole skill holder** — the reverse of
the `allocRows` join `gtBuildSignalMap` builds internally. **Suppression:** a person's capacity/gov
cards are dropped when they already have a *critical* retention card (its why already names them; avoids
stacking one human's problems) — over-alloc on a *non-risky* person still shows. Thresholds live in one
tunable `HOME_THRESHOLDS`.

### State: snooze + dismiss-until-signal-changes

`homeApplyState` drops snoozed items (`snoozed[id].until > now`) and dismissed-and-unchanged items
(`dismissed[id].hash === item.hash`); a **materially worse signal changes the content hash** →
`homeHash` differs → the item **resurfaces** and the stale dismissal is pruned. Hash inputs are coarse
buckets so tiny drift doesn't resurface. All hashing is on `entityUid`, never numeric `id`.

### Persistence & customization (per-device, never app state/backups)

`eim_home_prefs = { layout:[{id,w}], snoozed:{}, dismissed:{} }` — own key, like `eim_rail_prefs`
(NOT `SK`, not in backups/collab). `homeLoadPrefs` reconciles-don't-migrate: drops unknown widget ids,
falls back to `homeDefaultLayout()` (the one smart default). Customize mode (`homeToggleEdit`) reveals
per-widget controls: **width cycle** (1→2→3 grid cols, `homeCycleWidth`), **◀▶ reorder** (`homeNudge`)
and **✕ remove** (`homeRemoveWidget`), plus native **HTML5 drag-reorder** (`homeDragStart/Over/Drop`,
same idiom as the rail page-reorder). **＋ Add widget** (`homeOpenAdd`) shows an inline panel of
not-yet-added library widgets. Every mutation persists immediately. **★ Set as default** writes
`railLanding='home'` via the rail's own `railSavePrefs` (reuses the existing landing mechanism; Home is
also the recommended first-run choice). The top-bar **filter chips** (All/People/Portfolio/Gov) filter
the Action Queue widget's domain only — they do NOT hide other widgets (add/remove owns that).

### Widget library

`homeWidgetDefs()` = `{id,title,domain,defW,render(ctx),desc}`. Library: **action** (Action Queue) ·
**people** (Talent Risk Radar, Retention Watch, Review Governance, Engagement This Week, Headcount) ·
**planner** (My Tasks — overdue & pinned to-dos/actions, `homeWqTasks` over the same `homeProjectTasks`
source as the queue) · **governance/capacity** (Gate Readiness, Capacity & Bench, Team Cost).
Portfolio-value widgets aren't in the library yet (the queue still surfaces those concerns); adding one
= append to `homeWidgetDefs()` (auto-appears in the Add panel — reconcile-don't-migrate; existing saved
layouts are NOT retro-injected, so a new widget shows up only via ＋ Add widget). The top-bar filter
chips are **All / People / Planner / Portfolio / Gov**.

### Deep-links & gotchas

`homeOpenFor(concern, entityId)` maps each concern to exactly one target surface: idcard modal
(retention/stale-review, opens over Home) · `railGo(null,'plan'|'engagement'|'gate')` (capacity/gate —
`railGo` closes Home via `closeAllOverlays` + sets `activeView`) · `homeGoView(view, fn)` for the
project overlays that self-show (`openCharter`/`chtOpenDecision`/`openChannels`/`openDtc`+
`dtcSelectProject`) — it closes Home, sets `activeView`, calls the opener, then `railRender`s so the
rail highlight stays truthful. **`railGo(ev, viewId)` is two-arg** — the engine's openers pass `null`
as the event.

- **GATE-BLOCKED noise (fixed):** `gtStageReadiness` marks a project blocked on any *mandatory*
  criterion that isn't `pass`/`na` — which includes `pending` (never-assessed) ones, so EVERY fresh
  project showed "blocked" and flooded the queue. The gather now (a) only counts a **HARD block** — a
  blocker whose `gtCritStatus` is explicitly `fail` (manual fail or a failing auto criterion with real
  data), never `pending` — and (b) only emits **gate-behind** for a project that has actually *engaged*
  the gate (`gp.history`, advanced past the first stage, or any non-pending criterion). Fresh/untouched
  projects contribute no gate items.
- **BUTTON CONTRAST (bit us):** the app's global `button.primary` is a filled-lime button with DARK
  text; `.home-btn.primary` overrode only `color:var(--accent)` → lime text on lime fill = invisible
  until focus. Any `.primary` variant MUST set the background too — `.home-btn.primary` is now
  `background:var(--accent);color:#0f0f11`.
- **CLASS-NAME COLLISION (bit us):** the control bar and the inline progress meters were BOTH
  `.home-bar` — the meter's `height:8px;overflow:hidden` collapsed the topbar to 8px and clipped its
  buttons. The topbar is now `.home-topbar`; keep the two distinct. (Verify layout via DOM geometry,
  not screenshots — the `file://` preview snapshot lags on repaints; `getBoundingClientRect` is ground
  truth, same lesson as the charter/gate sections.)
- **Drag-reorder is always on via a header grip** (`.home-grip`, `draggable`), NOT gated to Customize
  mode (that was undiscoverable — "there is no drag and drop"). The grip is the drag SOURCE; each
  `.home-w` section is the drop TARGET (`homeDragOver`/`homeDrop`, before/after by pointer-X vs
  midpoint, same insertion technique as the export builder). Width/reorder-nudge/remove controls stay
  behind Customize.
- **Rail wiring:** `home` is a domain at the TOP of `RAIL_DOMAINS` (single view); `railRoute` opens it
  (`openHome`); `closeAllOverlays`/`railOpenRes` close it; NOT in `railWrapClosers` (no ✕/back on the
  front door). `#home-overlay` is defined after `{{JS}}` in index.html (only touched by user-triggered
  `openHome`, so the boot-timing trap doesn't apply).
- Registered in `build.js` (`JS_FILES` + `CSS_FILES`). Tests:
  [tests/home-actions.test.js](tests/home-actions.test.js) (band mapping, suppression, impact/SPOF
  boost, rank, hash-resurface, snooze, null-tolerance, domain/minBand filter). Verified in-browser
  against a seeded dataset: queue ranks correctly, suppression holds, widgets/filters/deep-links/
  set-default all work, no console errors.

Distinct from the Executive summary (which aggregates but does not compose or act) — the two coexist.
Exec's *personal* pieces (`xsPlannerPins`/`xsScheduleSection` "my week") migrating onto Home is the
remaining Phase-4 polish, along with the optional AI brief (`Brief me` → `ai.js`) and per-user-in-room
layouts.

---

## Multi-user collaboration (collab.js)

`OFFER MNGT`-independent — it's a **rail utility action** (`Collaborate`, in `RAIL_UTIL`)
that opens a panel to create/join a real-time room. All in
[src/sections/collab.js](src/sections/collab.js) (`collab`/`_collab`-prefixed). This is
Phase A of the roadmap in `../matrix-relay/ARCHITECTURE.md`; it builds directly on the
`uid` identity model above.

### Key facts (non-obvious)

- **Yjs is NOT bundled** — `yjs` + `y-websocket` + `y-indexeddb` are dynamically
  `import()`-ed from esm.sh the first time the user connects (the ai.js/WebLLM pattern).
  An **import map in [index.html](src/index.html)** pins one copy of `yjs`; the providers
  load with `?external=yjs` so they bind to that same instance (the "Yjs loaded twice"
  gotcha from the relay's DEPLOY.md). **build.js gotcha:** the literal `external=` in a
  URL trips the line-based duplicate-decl checker (reads it as declaring `external`), so
  it's built as `'?external'+'=yjs'` (`COLLAB_EXT`) to split the token.
- **Per-FIELD sync keyed by `uid‖path` (inc. C).** The Y.Maps `engineers`/`projects`/`allocRows`
  hold one entry **per leaf field**, keyed by `uid + COLLAB_KEYSEP + dotted.path` (e.g.
  `<uid>‖idcard.grade`, `<uid>‖allocs.2026-03`), so Yjs merges each field independently — two
  people editing **different fields of the same entity** now both land (was whole-object LWW).
  `collabFlattenEntity`/`collabUnflattenEntity` convert an entity ⇄ its leaf map: plain objects
  recurse (per-field for scalars + map-like fields), **arrays are atomic leaves** (element-level
  list-CRDT is out of scope), an empty object is an atomic `{}` leaf (lossless). `collabWriteEntityDiff`
  writes only the *changed* leaves (+ deletes vanished ones) inside the one `'local'` transaction;
  `collabMapSnapshot` reads a map back to `{uid: canonicalObj}` (drops a leaf that fails to decrypt —
  wrong key — but keeps a legit `null`). `_collabLastFields[uid]={path:JSON}` is the per-field wire
  cache (alongside `_collabLastJson[uid]`, the entity-level change gate + audit-diff base). The
  `meta` Y.Map still holds the rest of the payload **whole-value LWW per key** (`COLLAB_META`;
  low-churn config like sections/engGroups/gateConfig — excludes transient view state). Different
  entities always merge; same-entity **different-field** now merges; same-entity **same-field** is
  still last-write-wins.
  - **Wire-format note:** this is a breaking change to the Y.Doc layout (was one encrypted blob per
    `uid`; now one encrypted value per `uid‖path`). A new client in an OLD room reads no entities
    (blob keys are ignored, `indexOf(SEP)<0`) and re-seeds per-field; local `eim_v4`/backups are
    untouched. Rebuild+share the same build to every peer and **start a fresh room** to avoid a doc
    carrying both formats.
- **Join / merge model (`collabReconcile`, runs once on the first relay sync).** The
  last-synced state is captured from IndexedDB (the **base**) via `_collabPersist.whenSynced`
  BEFORE the websocket opens — the 3-way merge needs it, so the connect flow now waits for
  y-indexeddb, snapshots base, THEN creates the `WebsocketProvider`.
  - **First time in a room** (base empty): empty room → **seed** (`collabSeed`, no log spam);
    populated room → **adopt** (`collabAdoptFromDoc`) after a confirm. **Adopt REPLACES the open
    dataset**, so — like a full-backup restore — it takes an `'Auto: before joining room'`
    `takeSnap('full')` first (only when there is local data to protect). Joining the wrong room is
    therefore always recoverable from Snapshots (`eim_snaps_v1`, a separate store the join never
    touches). This safety net was missing originally and caused a real "I lost all my data" scare.
  - **Returning to a room you've synced** (base non-empty): **3-way merge** per entity
    (`collab3way`: base vs local vs remote) — only-you-changed keeps yours (pushed),
    only-they-changed takes theirs, **both-changed = conflict** (yours stays live, theirs is
    preserved in the change log). This is what makes edits done while **fully offline/closed**
    merge in on reconnect instead of being clobbered. `collabMetaReconcile` does the same
    per meta key.
- **Offline-first push:** `_doSave`→`collabPush()` is **NOT gated on connectivity** (only on
  `_collabReconciled`), so offline edits land in the Y.Doc, y-indexeddb persists them, and
  y-websocket syncs them on reconnect. Gating on `_collabConnected` (the original bug) silently
  dropped offline edits whenever the other side had also changed something. `collabPush` writes
  only entities whose JSON changed (`_collabLastJson`) and emits **create/delete** log entries;
  `collabSeed`/reconcile pass `logChanges=false` so the initial dataset isn't logged as a burst.
- **Auto-reconnect:** `collabConnect` sets `_collabCfg.auto=true`; boot (`collabBootFromHash`)
  auto-rejoins the last room (silent — the 3-way merge reconciles closed-app edits). Manual
  `collabDisconnect` clears `auto`. A share link still prompts.
- **Change / conflict / audit log.** Append-only entries `{id,ts,actor,action
  (create|update|delete|conflict),entityType,entityUid,label, changes?, conflict?}`. Lives in
  the Y.Doc as a **Y.Array** (`log`) so it syncs to every peer and merges without conflict
  (unique ids), AND mirrors to a local store (`eim_collab_log`) so it survives offline/reload.
  `collabLogAppend` writes both (and trims the synced array to `COLLAB_LOG_YCAP` so per-field
  updates can't grow the doc unbounded); the Y.Array observer (`collabLogMergeFromDoc`) unions
  remote entries in by id. **Conflicts never lose data** — the overwritten value is kept in the
  log (future "restore this version"). Viewer = `collabHistoryOpen` (a second modal, z1120).
- **Per-field UPDATE audit.** When `collabSyncArray` sees an existing entity change, it diffs the
  previous vs current **canonical** form (`collabChangeList` → `collabFlatten`) and logs an
  `update` entry with `changes:[{f,from,to}]`. Nested objects flatten to dotted paths
  (`idcard.grade`, `allocs.2026-03`); arrays are opaque (a count); uid-ref fields are relabelled
  and **resolved to entity names at log time** (`engineer: Ann → Bob`, not a raw uuid), so the
  record stays readable and durable. Diff runs on canonical, so local id churn is never logged;
  changes cap at `COLLAB_DIFF_CAP` with an overflow marker. One entry per changed entity per push
  (the save debounce already coalesces mid-typing). Encrypted like every other log entry (id+ts
  clear, payload E2E). Tests: [tests/collab-audit.test.js](tests/collab-audit.test.js).
- **Actor identity** = self-declared name (`_collabCfg.actor`, panel field), used for
  `awareness` presence AND as the `actor` on every log entry. Verified identity later is a
  drop-in replacement — the audit seam the relay roadmap describes.
- **Echo guard:** remote map/log events with `transaction.origin==='local'` are ignored;
  `_collabApplying` blocks the push that `collabAdoptFromDoc`'s `saveNow` would otherwise
  trigger. Both are essential or edits bounce back and duplicate.
- **Focus-steal guard (bit us — twice).** A remote patch must never re-render while a
  field is focused. `collabRerender` marks `_collabDirtyView` and bails if a field is
  focused; a **700ms poll** (`collabFlushDirty`, started on connect) repaints once the
  field is free. The first design (a per-element `blur` listener + a sticky flag) stranded
  the flag when the element was removed mid-edit → **all** later re-renders silently
  froze while data kept syncing. The second (a document `focusout` listener) was fine in
  real browsers but a single missed event still stuck. The poll is event-quirk-independent
  — only acts when dirty, so it's cheap.
- **Presence** via `provider.awareness`; the peer count shows as a badge on the rail
  Collaborate icon (`rn-collab-badge`, `collabUpdateBadge`).
- **Security:** random 128-bit room id, token as a **connection param** (not in the share
  link's query), secrets in the URL **#fragment** — the three patterns from
  `../matrix-relay/test/sync-test.html`. Config persists in its own `eim_collab`
  localStorage key (relay/token/room/**key**/actor/auto), separate from `SK`.
- **E2E encryption (Phase B — DONE).** Every value written to the Y.Doc — entities, meta,
  the log Y.Array, and awareness — is **AES-256-GCM** encrypted client-side, wrapped as a
  self-describing `{c: base64url(nonce‖ciphertext‖tag)}` envelope (`collabEnc`/`collabDec`).
  The relay's stock `setupWSConnection` is **unchanged** — it still holds the room doc, but
  every value is ciphertext, so it only ever sees random uids, counts, and timing, never
  content. The 32-byte room **key** rides ONLY in the link `#fragment` (`&key=…`), never the
  query → never sent to the relay/proxy logs. Crypto is **synchronous** (`@noble/ciphers`,
  dynamic-imported like Yjs) specifically so Yjs `doc.transact` stays atomic — an async
  WebCrypto refactor would have had to split every encrypt from its `set` and break the
  single-'local'-transaction echo guard. **Change-detection stays on plaintext** JSON
  (`_collabLastJson`), so per-encryption random nonces don't cause spurious re-sends. A room
  with **no key runs in plaintext** (back-compat with pre-Phase-B rooms + mixed-room guard:
  `collabDec` passes non-`{c}` values through); the panel shows 🔒/🔓 and warns
  (`_collabDecFails`) when a link is missing/has the wrong key. New rooms mint a key by
  default (`collabNewRoom`/auto-room in `collabConnect`). Log entries keep `id`+`ts` in the
  clear (dedupe + ordering without decrypting the whole log); the payload (actor, labels =
  person names, before/after values) is encrypted. Verified in-browser: noble loads + `gcm`
  round-trips; a Yjs wire update carries no plaintext; a peer WITH the key decrypts, a peer
  WITHOUT it (≡ the relay) gets `null`. Scheme mirrored in [tests/collab-crypto.test.js](tests/collab-crypto.test.js)
  (round-trip, fresh-nonce, wrong-key + tamper rejection, plaintext passthrough).

### Live presence & cursors (Phase D — the presence half)

Real-time "who's here / who's editing what", built entirely on Yjs **awareness** (no new
Y.Doc structures, no relay change). Each peer publishes one awareness `user` field —
`{name, color, view, focus, t}` — **encrypted with `collabEnc` like every other synced value**
(a peer without the room key can't read presence either). `focus` is `{type,uid,field}` when the
peer has an entity open, else `null`.

- **Color** is derived from the Yjs `clientID` (`collabAssignColor`, a fixed 10-color palette),
  so a given peer looks identical to everyone. Rendered through `safeColor` at every sink (the
  color rides in from another user = untrusted, same XSS rule as entity colors).
- **Local focus is tracked with NO per-field wiring.** `collabHookPresence()` installs ONE
  document `focusin`/`focusout` listener on connect; it plus the entity editors' open/close hooks
  (`openIdCardModal`/`closeIdCardModal`, `openCharter`/`chtClose`, `chtOpenDecision`/`chtCloseDecision`)
  and `railGo` all call `collabPublishPresence()`, which reads the live context
  (`collabCurrentFocus()`) and broadcasts it (throttled 120 ms so rapid focus changes coalesce).
- **Tracked entity modals live in one table, `COLLAB_MODALS`** — `{overlay, banner, type, cur()}`
  per editor: ID card (engineer), charter financials (`cht-overlay`) and the trade-off decision
  panel (`dec-overlay`), both project (keyed by `_chtProjId`). `collabCurrentFocus()` walks it and
  prefers the open modal that actually **contains** the focused element (so its field id rides
  along), else the first open tracked entity, field-less. Adding another editor = one more row +
  a `#<x>-presence` banner element in [index.html](src/index.html). **Field cursors need a field
  `id`** — the ID-card inputs carry `idc-*` ids so their cursors light up; the charter inputs are
  id-less (they use `oninput`/`onchange`), so they degrade to an **entity-level banner** (who's on
  this project) with no per-field outline. `collabRenderModalPresence` renders every tracked modal's
  banner + outlines from the same table.
- **Three render surfaces**, all driven by `collabRenderPresence()` (called on every awareness
  `change` and after we publish): (1) a topbar **avatar cluster** (`#collab-presence`, overlapping
  initials, tooltip = "Alice — editing Ann Lee · Role"); (2) on the ID card, an **"Also here"
  banner** (`#idc-presence`) listing only peers focused on the *same* engineer uid, **plus a
  colored outline on the exact field each is editing** (the live cursor) — applied directly to the
  field element by id, tracked in `_collabFieldDecor` and cleared each render, so it **never
  re-renders app data and can't steal the caret**; (3) an "IN THIS ROOM" strip in the collab panel.
- **Reading peers:** `collabPeerStates()` decrypts every awareness state except our own
  (`awareness.clientID`), dropping any that fail to decrypt (wrong key). Presence is ephemeral —
  it is **not** logged, persisted, or part of the data model.

### Intra-dataset refs are uid-anchored (concurrent-creation safe)

`allocRow.engId`/`.projectId`, `idcard.reportsTo`, and `succession.successorId` are
per-dataset id counters — two people creating new entities **offline** both draw the same
`nextEngId`/`nextId`, so a naïve merge lands an allocation on the wrong engineer. Fixed by
making the numeric `id` (and every numeric id-ref) **local wiring only, stripped from the
synced form**; identity travels as durable **uid** mirrors (`engUid`/`projectUid`/
`reportsToUid`/`successorUid`, on the factories in [model.js](src/data/model.js)).

- **`collabCanonical(o,type)`** ([collab.js](src/sections/collab.js)) strips `id` + numeric
  id-refs before an entity is written to the Y.Doc (and is the form change-detection compares,
  so local id churn never triggers a spurious re-push). The relay/doc therefore hold NO numeric
  ids — id collision across a merge is **structurally impossible**.
- **`refsBackfill()`** ([persist.js](src/core/persist.js), uid ← id) derives the durable uid
  refs from the authoritative numeric refs, just before serialising (`collabPush`/`collabSeed`/
  the returning-merge read local via `collabCanonIndex`).
- **`collabMaterialize(prev)`** (id ← uid) runs on every adopt/merge: assigns each entity a
  local numeric id (reusing the pre-adopt id for a known uid via `collabCapturePrev`, so no DOM
  churn; a genuinely new uid gets a fresh counter id **after** the room's `nextEngId` high-water
  mark is applied), then **`refsRelink()`** rebuilds the numeric id-refs from the uid refs. A uid
  that no longer resolves (deleted target) clears the ref — never repoints it at a stranger.

The ~270 id read-sites and all DOM/drag wiring are **untouched** — they keep reading numeric
`id`, which is now guaranteed consistent post-merge. Verified: [tests/collab-refs.test.js](tests/collab-refs.test.js)
(colliding-engId heal, reportsTo-follows-uid, no-op round-trip, dangling-ref clear) + in-browser
against the real `collabCanonical`/`collabMaterialize`/`refs*` (two datasets that both assigned
id 5/1 to different people merge with each allocation resolving to the correct human).

### Still id-based (deliberate, lower risk)

- `engineer.groupId` → engGroup, `project.sectionId` → section, `_ktPlans[].learnerEngId`,
  and the org-chart layout keys stay id-based. engGroups/sections are LWW `meta` blobs with no
  `uid` of their own and are low-churn; concurrent-creation collision there is a far narrower
  window. Extending the uid-ref pattern to them is additive (give them a uid + a mirror field).
- **Field-level DOM patching (Phase D, second half — increments A & B done; C open).**
  - **A — open entity editor live-patches.** `collabRefreshOpenEditor()` (called at the end of
    `collabRerender`, so only on the non-focused path) walks `COLLAB_MODALS` and re-populates whichever
    editor is open from current state — the ID card (`openIdCardModal` only *sets* field values into
    static markup, so re-calling it is already a field-level patch with no scroll/layout churn) and the
    charter/decision (re-render header + the **current** `_chtTab`, scroll preserved via
    `collabRestoreScroll`). Closes a real gap: a teammate's edit to the person/project you have open now
    lands live (previously invisible until close+reopen), pairing with the presence cursors. An editor
    whose entity was **deleted** remotely closes itself.
  - **B — surgical roster row patching.** On a steady-state remote apply, `collabAdoptFromDoc` snapshots
    the roster (`collabRosterSnapshot`, `{id:{sig,sec}}`) BEFORE replacing the arrays, then
    `collabComputeRosterPatch` diffs into `_collabPendingPatch = {structural, ids}`. `collabRerender`
    calls `collabPatchRoster()`: in-place field changes → replace **only** the changed
    `.proj-item[data-pid]` rows (scroll + every other row's DOM node untouched); any **structural** change
    (project added/removed, moved between sections, or any `sections` edit) OR a changed row not currently
    in the DOM (e.g. collapsed section) → fall back to full `renderList()`. The changeset **merges** across
    applies batched behind the focus-steal defer (two applies → union of ids; a structural one wins), and
    is cleared once consumed. The **matrix stays a full SVG swap** — it's a monolithic canvas with global
    label-collision layout (one dot's move reshuffles others' label groups) and no scroll, so per-node
    patching is both unsafe and unnecessary. Decision table: [tests/collab-roster-patch.test.js](tests/collab-roster-patch.test.js).
  - The focus-steal rule still governs both A & B (a field you're typing in defers to the 700 ms poll, so
    your caret is never stolen and uncommitted text survives; the pending roster changeset waits with it).
  - **C — DONE (real-time per-field CRDT merge).** Entities are stored **per leaf field** (`uid‖path`
    Y.Map keys — see *Per-FIELD sync* above), so a same-entity concurrent *different-field* edit now
    MERGES via Yjs instead of whole-object last-write-wins. Each field value is still individually E2E
    encrypted (the `{c}` envelope is per-leaf now); reconcile's 3-way (`collab3way`) stays whole-entity
    for the OFFLINE base-vs-local-vs-remote case (writes via `collabWriteEntityDiff`/`collabDeleteEntity`),
    while the ONLINE steady state gets per-field merge for free from Yjs. Only **same-entity same-field**
    concurrent edits remain LWW (and arrays are atomic — editing the same array concurrently is still
    LWW). Verified in-browser with two real Y.Docs: a role edit on peer 1 + a notes/grade edit on peer 2
    both survive on both docs, plaintext AND encrypted, wire is ciphertext. Tests:
    [tests/collab-fields.test.js](tests/collab-fields.test.js) (round-trip losslessness over the real
    factory shapes + write-diff/delete/merge semantics). (Live presence/cursors, the first half of Phase
    D, is done — see *Live presence & cursors*.)
- **The log records create/UPDATE/delete/conflict** (per-field before/after for updates — see
  *Per-field UPDATE audit* above). Conflicts are still detected only at **reconcile** (the
  offline-divergence case, where data loss was the real risk); live simultaneous edits resolve by
  real-time LWW and are recorded as ordinary `update` entries, not flagged as conflicts.
- **No photo sync yet** — photos stay per-machine (out-of-band in IndexedDB).
- **Metadata still visible to the relay (accepted).** E2E hides content but not structure:
  the relay sees room membership, entity counts, edit timing, and the (random) uids. Hiding
  those too would need a dumb broadcast relay (transport encryption) — rejected for Phase B
  because it means a relay rewrite and loses server-held late-joiner state. Named access +
  metadata audit is the deferred Hocuspocus upgrade.

### XSS — inbound entity data is untrusted (multi-user made this real)

Single-user, a hostile `<img onerror>` in a project name only hurts yourself. **Once two
people share a room, every synced field is attacker-controlled** — a teammate's project /
engineer / group name, note, or **color** could run script in everyone else's browser.
Backups/roster imports are the same threat. The whole app renders via `innerHTML`
string-building (`h+=…`), so escaping is per-render-site, not framework-enforced. Two helpers,
both in [helpers.js](src/core/helpers.js):

- **Text → `escH()`** (already the codebase convention; ~560 call sites). Escapes `& < > "`,
  which is sufficient in double-quoted attribute and element-text contexts. **Never** interpolate
  a synced string field raw, and never route user data through `t()` (i18n interp inserts vars
  verbatim — pre-escape).
- **Color → `safeColor(c, fallback)`** (added by this audit). Colors are the sneaky vector: a
  color like `"><img …>` breaks straight out of `style="…:COLOR"` / SVG `fill="COLOR"`. `escH`
  would stop the breakout but still admits CSS-property injection (`;position:fixed;…`), so
  colors get a *validator* instead — `#hex(3/4/8)`, `rgb[a]/hsl[a](…)`, or a bare keyword pass
  through; anything else → fallback (`var(--muted)`). Apply it at (or before) every point a
  **user-editable** color reaches markup: `project.color`, `engGroup.color`, `section.color`,
  `quadrantsByMode[*].color`, channel colors (`chanColor()` wraps at source), gate `stage.color`,
  `skillCat.color`. **Static palette colors** (nine-box/DISC cell `badge`, `CAT_COL`, `AN_COLORS`,
  status-meta colors) are NOT user data — leave them, or wrap harmlessly.

The audit swept every `${…}`/`+…+` interpolation of a synced field. Biggest sink was the
**print/export builders in [profiles.js](src/sections/profiles.js)** (`document.write` into a new
window → scripts execute) — every field there was raw. Also fixed: plan.js option labels,
skills.js group-badge color + gap tooltips, and the color sinks in matrix/overlays/dashboard/
timeline/org/portfolio/econ/gate/channels/sidebar/roster/backlog/tooltip. Deliberately left:
`prompt`/`confirm`/`alert` dialogs (plain text, not HTML), `aiBuildContext` (plain text to the
LLM, not DOM), and CSV export (spreadsheet formula-injection is a separate, out-of-scope
concern). Tests: [tests/helpers.test.js](tests/helpers.test.js) (escH breakout + safeColor
passthrough/rejection). Verified in-browser: a project injected with a hostile name **and** color
renders on the matrix + sidebar with the `onerror` never firing and no breakout element created.
Note this closes the sink at **render**, so it holds for the live-sync apply path too (which does
not re-`sanitise` per patch — only the merge-finish does). **When adding any new render of a
synced field, escH the text and safeColor the color** — there is no central choke point.

### Editors MUST `saveState()` or they don't sync (bit us: allocations)

`collabPush` is hooked into `_doSave`, so **anything that mutates state but skips
`saveState()` is invisible to sync** (and isn't persisted single-user either). This bit
the resource-plan allocation cells: `plan.js setAlloc` mutated `allocs[month]` and the
cell's `onchange="setAlloc(...)"` relied solely on it — so allocation edits lived in memory
only and "didn't sync." Fixed by making `setAlloc` call `saveState()` (debounced, so bulk
loop-callers still coalesce to one write). When adding any editor, route it through
`saveState()`.

Verified: the 3-way merge decision table has deterministic unit tests
([tests/collab-merge.test.js](tests/collab-merge.test.js): only-mine / only-theirs /
both-changed→conflict / add-both / delete cases + a full offline-divergence scenario).
Two-origin browser sync (seed, adopt, live bidirectional edits, echo guard, presence, focus
guard) verified end-to-end through a local relay. **`COLLAB_DEFAULT_RELAY` note:** Heroku
migrated app domains to `<app>-<hash>.herokuapp.com`; the default relay URL was updated to
match (the old bare domain 404s), and the connect UI now distinguishes "loading library" from
"connecting to relay" with a 12s stall watchdog (a wrong/short token → 401 was the classic
"stuck connecting").

### Collab roadmap — what's left (as of 2026-07-19)

Everything above is **shipped**: Phase 0 (uid identity) · A (Y.Doc sync) · A+ (offline 3-way merge
+ change/conflict log + history) · B (E2E) · uid-anchored refs · per-field UPDATE audit · XSS audit ·
join-UX/data-loss net · Phase D presence · Phase D patching **A** (live-patch open editor), **B**
(surgical roster rows), **C** (real-time per-field CRDT merge). Remaining, none in progress:

- **Verified identity + named audit + revoke (Hocuspocus)** — real accounts, server-verified `actor`,
  per-user revoke; also closes the metadata-privacy gap. HIGH effort. **Gated by the governance
  question below.**
- **Photo sync** — photos are still per-machine (out-of-band in IndexedDB, uid-keyed); teammates don't
  see faces. Needs a uid-keyed out-of-band channel. MEDIUM. Independent of governance — the best
  standalone "next feature".
- **Array/list element-level CRDT** — arrays (`skills`/`todos`/`risks`/charter `demands`·`subsystems`·
  `channels`/`cops`/`reviews`/gate `history`) are ATOMIC LWW; concurrent edits to the *same list* are
  last-write. Would need a `Y.Array` per list. HIGH effort, LOW value (narrow window).
- **Same-field text merge** — two people in the *same text box* are still LWW; char-level needs `Y.Text`.
- **Extend uid-refs to the last id-based fields** — `engineer.groupId`, `project.sectionId`,
  `_ktPlans.learnerEngId`, org-chart layout (see *Still id-based* above). LOW, additive.
- **Patching "B-plus"** — surgical patch of the matrix (monolithic SVG, deliberately full-swap) + org
  chart on remote change. LOW value (canvas, no scroll-jump).

**⚠ Open governance question (unresolved, blocks direction):** does data policy accept
confidentiality-via-E2E-link (no named access/revoke; metadata visible to the relay), OR require named
access + audit + revoke? Latter ⇒ Hocuspocus is the priority (subsumes the metadata gap); former ⇒ the
roadmap is essentially feature-complete and the rest is polish. Resolve before the heavy Hocuspocus work.

---

## Data & persistence

Three persistence layers with **two different identity models**. This split is the
source of most data bugs.

| Layer | Where | Keyed by | Holds |
|-------|-------|----------|-------|
| Main state | localStorage `eim_v4` (`SK`) | — (whole arrays/objects) | `engineers[]`, `projects[]`, `allocRows[]`, placements, axis/UI |
| Photos | IndexedDB `EIM_Photos` + in-memory `_photoCache` | `eng.uid` (was `eng.id`) | compressed JPEG dataURLs |
| Talent | IndexedDB `EIM_TalentData` | inner keys = `eng.uid` (was `eng.id`) | nine-box / disc placements, nbYear |
| Snapshots | IndexedDB `eim_snaps` (index + data stores) | snapshot `id` (Date.now) | time-travel copies of main state |

### Key facts (non-obvious)

- **`eng.id` is a per-dataset sequential counter** (`nextEngId`), **not** globally
  unique. Two different backups both have engineers `1,2,3…` referring to different
  people. Every entity therefore also carries a durable **`uid`** (see *The `uid`
  identity model* below) — photos and talent placements are keyed by it, so they no
  longer collide across datasets. `id` is still used for intra-dataset references
  (`allocRow.engId`, `reportsTo`) and DOM wiring.
- **Photos live only in IndexedDB**, not in main state. On save, `idcard.photo` is
  stripped to `''` and the dataURL is pushed to `EIM_Photos`. `idbGetPhoto(id)` is a
  sync cache read (safe during render); `idbFetchPhoto` is the async fallback.
- **Snapshots do NOT carry photos** — they share the live `EIM_Photos` store within
  the same dataset. Never clear the photo store on snapshot restore (it would wipe
  every photo). Snapshots are intra-dataset time-travel only.
- **Full backups DO carry photos** — `exportFullBackup` embeds the whole
  `_photoCache` as `_photos`. A full-backup restore is a dataset *swap*.
- IndexedDB is per-origin = tied to the exact HTML file location. Moving/renaming
  `matrix.html` creates a new origin and the photo DB looks empty (recovery UI:
  `idbShowRecovery`).

### The restore invariant

A restore that swaps datasets (full backup) **must replace, not merge** every
id-keyed side-store, because the incoming engIds collide with the previous
dataset's. Merge = "wrong face on the wrong person".

- `importFullBackup` ([src/sections/backup.js](src/sections/backup.js)) uses
  `idbReplaceAllPhotos(photos)` (clears store + cache, writes only the backup's
  photos) and calls `talentIdbSave()` so `EIM_TalentData` matches the new dataset.
- `idbReplaceAllPhotos` rebuilds the cache from the photos map directly — never via
  `openCursor` (that would re-read ghost rows).
- `idbSavePhoto` is merge-only (PUT one key) — correct for normal editing, wrong for
  restore.

### Capture-surface parity & the sanitise contract

User data is written by **three separate capture surfaces** and they must stay in sync,
or a field saved in one is silently dropped by another on restore:

| Surface | Function | File |
|---------|----------|------|
| localStorage | `_doSave` (`JSON.stringify({…})`) | persist.js |
| Full backup | `exportFullBackup` (`state={…}`) | backup.js |
| Snapshot | `captureScope` (`full={…}`) | persist.js |

- **`finExclude` and `skillCats` were being lost** — present in `_doSave` only. Now in all
  three. **build.js has a static `MUST_PERSIST` parity guard** (check 4b) that fails the
  build if a load-bearing field is missing from any of the three blocks — add new
  user-data fields to all three (it greps the object literals by marker, so keep the
  `localStorage.setItem(SK,JSON.stringify({` / `const state={` / `const full={` markers).
- **`finExclude` reset semantics differ by path** (it's keyed by the per-dataset `eng.id`):
  full-backup restore is a dataset *swap* so `importFullBackup` **always** resets it
  (`new Set(d.finExclude||[])`) — a stale set must not bleed onto colliding new ids;
  snapshot restore is intra-dataset so `restoreSnap` overwrites **only if present**.
- **Sanitise contract: every engineer-restoring path calls `sanitiseEngineer(e)`** —
  `loadState`, `importFullBackup`, and `restoreSnap`. They previously used lighter inline
  fixups that skipped `idcard.succession/engagement/nextMove`, so an older backup could
  load engineers missing sub-objects that newer code dereferences. `sanitiseProjects`
  already covered the project side; engineers now match.
- **Roster import** (`handleRosterImport`) also runs `sanitiseEngineer` now, but carries no
  photos/placements — its confirm dialog warns they're kept by id and may not line up if the
  roster is from a different dataset (no auto-clear, by design).
- **The pre-restore safety snapshot does NOT protect photos** (snapshots share the live
  `EIM_Photos`, and restore wipes it). `importFullBackup`'s confirm says so and points the
  user at exporting a full backup first.

### The `uid` identity model (Phase 0 of multi-user — DONE)

Every engineer / project / allocRow now carries a globally-unique **`uid`**
(`newUid()` = `crypto.randomUUID`, in [model.js](src/data/model.js)) alongside the
per-dataset `id`. `id` still drives the in-session wiring that already depends on it
(`allocRow.engId`, `idcard.reportsTo`, DOM `dataset` attrs, drag payloads); `uid` is
the **durable** identity for anything that outlives one dataset or gets merged across
two — this is the prerequisite for CRDT sync (relay repo, `../matrix-relay`).

- **What is keyed by `uid`** (both in-memory AND at rest): the photo store
  (`EIM_Photos` + `_photoCache`), nine-box (`_nineBoxPlacements` / `_nineBoxHistory`
  inner keys), DISC (`_discPlacements`), and the cost-exclusion set (`_finExclude`).
  These are the identity-critical side-stores that previously collided across
  datasets ("wrong face on the wrong person").
- **What stays keyed by `id`** (deliberately, for v1 entity-level sync): `_ktPlans`
  (keyed by **skill name**, not engineer — its inner `learnerEngId` is an
  intra-dataset ref like `engId`/`reportsTo`) and the org-chart layout
  (`_orgPositions` / `_orgCollapsed`, cosmetic; its DnD does numeric-key coercion).
- **`engKey(engOrId)`** ([persist.js](src/core/persist.js)) resolves an id **or** a
  uid **or** an engineer object to the durable uid — the one helper the drag/DOM
  code (which only has the numeric id) calls before writing a placement. Photo CRUD
  resolves via `_photoKey()` ([photo.js](src/core/photo.js)), so no photo call site
  changed.

**The migration (`uidMigrate()` in [persist.js](src/core/persist.js)) is idempotent
by construction:** a uid is always a uuid, a legacy key is always a bare integer
(`isLegacyKey`), so a second pass finds nothing to do — no version flag. It runs in
**every** restoring path:

- **`loadState`** — backfills entity uids + re-keys the localStorage-sourced stores;
  persists (debounced) so the next load reuses the uids.
- **`idbBoot`** ([photo.js](src/core/photo.js)) — now **awaits** `talentIdbLoad`
  (was fire-and-forget) so the IDB-sourced nine-box/DISC are present, then re-keys
  them + the photo store (`idbMigrateToUid`) with the SAME id→uid map, and
  `saveNow`s (DOM-gated, so it can't clobber the restored res period). **Entity uids
  must persist in the same lifecycle the IDB stores are re-keyed** or a session that
  regenerated different uids would strand the placements — this is why the boot
  flush is not optional.
- **`restoreSnap`** — snapshots are intra-dataset, so it captures the pre-restore
  `id→uid` map and **reuses** the live dataset's uid for each restored id (a fresh
  random uid would orphan the already-migrated photo/nine-box). Only a genuinely new
  id gets a new uid.
- **`importFullBackup`** ([backup.js](src/sections/backup.js)) — dataset *swap*:
  `uidMigrate()` backfills/keeps uids and re-keys placements; the photo map is
  remapped with the same id→uid map **before** `idbReplaceAllPhotos`, so an old
  (id-keyed) backup's photos realign to the freshly-assigned uids while a new
  (uid-keyed) backup passes straight through.

Exports are already uid-consistent (the cache + live placements are uid-keyed, and
`exportFullBackup` just dumps them). Tests: [tests/uid.test.js](tests/uid.test.js)
(helpers + migration + cross-dataset merge safety). Verified end-to-end against the
40-person demo backup: legacy id-keyed data → all uid-keyed on load, identity
preserved (nine-box cells intact), uids byte-stable across reloads.

### Still open (by design)

`handleSnapImport` ([src/core/persist.js](src/core/persist.js)) can import a *foreign*
full-project JSON as a snapshot; its photos are saved by uid when the export carried
one (post-migration round-trips) but a truly old cross-dataset import is still
best-effort — full cross-dataset snapshot-import linkage is out of Phase 0 scope.

### Files

- [src/core/photo.js](src/core/photo.js) — photo IDB (`EIM_Photos`) + talent IDB
  (`EIM_TalentData`) CRUD, cache, compression, boot/migrate.
- [src/core/persist.js](src/core/persist.js) — localStorage save/load/sanitise,
  snapshot system (capture/restore/diff/export).
- [src/sections/backup.js](src/sections/backup.js) — full backup + roster
  export/import.
- [src/data/model.js](src/data/model.js) — `make*()` factories; the one place to add
  fields (sanitise/add/restore all flow through them).

---

## AI advisor (in-browser LLM)

All in [src/sections/ai.js](src/sections/ai.js). Header button `#ai-btn` →
`aiOpenChat()`. Runs a quantised LLM **entirely client-side via WebLLM + WebGPU** —
no backend, no API key, no data leaves the browser.

### Key facts (non-obvious)

- **Nothing is bundled.** The WebLLM library is `import()`-ed at runtime from a CDN
  (`AI_WEBLLM_CDN`, esm.run); model weights stream from **public/ungated Hugging
  Face** repos with **no credentials**. The browser caches weights (Cache API), so
  after the first download it works **offline**. `matrix.html` stays tiny.
- **Two metadata sources.** `AI_MODELS` is a curated shortlist (params + approx
  download size — *not* in WebLLM's config). VRAM + availability come live from
  `prebuiltAppConfig.model_list` (`aiVerifyAvailability` overwrites `vramGB`). A
  curated `id` MUST match a registry `model_id` or it shows "unavailable".
- **WebGPU required.** `aiHasWebGPU()` gates everything; no WebGPU → Select disabled
  with a notice. Works in Chrome/Edge, not older browsers.
- **Pre-flight before download.** `aiSelectModel` → `aiPreflight(model)` →
  `aiShowPreflight` modal before any load. It `requestAdapter()`s AND **actually
  `requestDevice()`s** (then destroys it) — this is essential: `requestAdapter`
  succeeds on a broken driver, but `requestDevice` is what throws
  `DXGI_ERROR_DEVICE_REMOVED` (D3D12 create-command-queue failure). A reject, or a
  device that's immediately `.lost`, → **block** with driver guidance (update driver,
  restart browser, check chrome://gpu). Also blocks on software-fallback adapters,
  warns on big-model-vs-small-buffer. Verdicts: block / warn / ok; only ok/warn show
  a load button → `aiProceedLoad` → `aiSetSavedModel` + `aiLoadModel`. Browsers don't
  expose total VRAM, so the shown numbers are buffer LIMITS, not free VRAM (the modal
  says so). Caveat: the device test consumes a throwaway adapter+device; WebLLM later
  requests its own fresh adapter, so no conflict.
- **Engine lifecycle is module state**, not persisted: `_aiEngine` (loaded engine),
  `_aiEngineModel` (its id), `_aiLoading`. Only the *chosen model id* persists, in
  localStorage `eim_ai_model` (`AI_MODEL_KEY`). On a fresh load the engine is NOT
  auto-loaded — `aiOpenChat` offers to (re)load the saved model on demand (cheap if
  cached). Loading is heavy, so it's always user-initiated.
- **System prompt = role + legend + data.** `aiSystemPrompt()` = `AI_ROLE`
  (instructions) + `AI_LEGEND` (a STATIC glossary — grade 1–11, comparatio,
  potential, the 9 nine-box cell meanings, skill levels, etc.) + `aiBuildContext()`.
  The legend exists because the model knows HR concepts generally but NOT *this
  tool's* scales/labels; spell them out or it guesses wrong. Keep it tight — it
  shares the ~4k-token window with the data.
- **Context is scope-aware (`_aiScope = {engIds, projIds}`, ids as strings).** A
  pre-chat menu (`aiOpenScope`) lets the user tick specific people/projects. With a
  selection, `aiBuildContext` emits FULL detail for those entities **plus their
  connections** (`aiPersonDeep` adds allocations/successor/trajectory; `aiProjectDeep`
  adds the allocated team) — and drops the broad overview. With nothing ticked it
  emits `aiOverview()` (people capped 60, projects 40). 9000-char hard cap either
  way. The menu shows a live token estimate so the user sees the budget. This is the
  key optimisation: focusing 1 person is ~150 tokens vs ~1700 for the whole org.
- **Flow:** header `#ai-btn` → `aiOpenChat` (router) → ensures engine (load if
  needed) → `aiOpenScope` (context menu) → `aiStartChat` (chat dialog). Both the
  scope menu and the chat header have a **⚙ Model** button → `aiShowModelPicker` to
  switch models (picking a different one → pre-flight → `reload`). `aiResolveEng()`
  turns manager/reportsTo id refs into names.
- **One AI dialog at a time (z-index trap).** Picker `z920` < scope `z925` < chat
  `z930` < preflight `z935`. Opening a lower-z dialog while a higher one is up makes
  it render hidden *behind* — this caused "the model can't be changed" (⚙ opened the
  picker behind the chat). So `aiShowModelPicker`/`aiOpenScope`/`aiStartChat` each
  close the other dialogs first. The picker is deliberately NOT closed during a load
  (progress renders in its `#ai-model-foot`).
- **Engine lifecycle is module state**, not persisted: `_aiEngine`, `_aiEngineModel`,
  `_aiLoading`. Only the chosen model id persists (localStorage `eim_ai_model`).
  Engine is never auto-loaded on boot (heavy) — always user-initiated.
- **SINGLETON engine + `reload()` — do NOT call `CreateMLCEngine` more than once.**
  `aiGetEngine()` lazily constructs ONE `new MLCEngine(...)`; `aiLoadModel` switches
  models via `engine.reload(id)`. Calling `CreateMLCEngine` again disposes the prior
  engine's GPU device → `Object has already been disposed`, then `Model not loaded`
  on the next request. This was a real bug; keep the singleton.
- **Stall watchdog.** `reload()`/fetch has no timeout, so a hung shard shows no
  error. `aiStartStallWatch` polls during load; if pct AND text are unchanged for
  `AI_STALL_MS` (45s) it shows a "may be stalled — reload to resume from cache" hint
  with a reload button. Any change in pct *or* the MB-counter text resets the clock
  (a flat rounded % mid-shard is not a stall). Cleared on success/failure.
- **GPU-error recovery (two tiers) + `exit_on_context_lost`.** `aiChatSend` routes
  completions through `aiRunStream`. On a **mild** lifecycle error (`aiIsLifecycleErr`:
  disposed / not loaded / tokenizer deleted) it `aiHardReset()`s and rebuilds a
  **fresh** engine via `aiGetEngine` + `reload`, retrying ONCE. On a **removed device**
  (`aiIsDeviceLost`: `DEVICE_REMOVED` / `requestDevice` / OOM / DXGI) it does NOT retry
  — on many Windows/NVIDIA setups chrome://gpu shows the **`exit_on_context_lost`**
  workaround, meaning a lost device kills the whole GPU process; nothing in-page can
  recover it. Instead it resets, shows `aiErrorHint` guidance, and surfaces a **↻
  Reload page** banner (`aiShowChatReload`, `#ai-chat-error`). Generic errors (network)
  are shown but don't reset the engine. The classic repro: model loads, first message
  works, the *second* (longer) generation trips a TDR/context-loss → device removed.
- **Chat survives the forced reload.** Because reload is the only recovery, the
  conversation + scope + model are saved to sessionStorage (`AI_CHAT_KEY`) on every
  turn (`aiPersistChat`) and restored after the model reloads (`aiRestoreChat`, called
  in `aiLoadModel`'s success). `⚠`/`↻` status messages are filtered out on restore.
- **Per-turn prompt is capped** (`AI_HISTORY_MAX=6` turns; `aiBuildContext` data cap
  6000 chars) to bound VRAM/compute and fit the conservative context window below.
- **Per-turn state reset.** `aiRunStream` calls `engine.resetChat()` (guarded) before
  each `chat.completions.create`. We send the full message array every turn (stateless
  usage), so clearing the KV-cache/state is safe and removes cross-turn engine state —
  aimed at the deterministic 2nd-turn device drop (1st turn works, 2nd fails with
  identical prompt size, which points to carried state rather than prompt length/TDR).
- **TDR-safe load (`aiReloadModel` + `AI_SAFE_CHAT_OPTS`).** All loads go through
  `aiReloadModel`, which reloads with `{context_window_size:4096, prefill_chunk_size:
  256}`. The small `prefill_chunk_size` is the key: it splits prompt processing into
  many short GPU dispatches so no single one exceeds Windows' ~2s TDR (the cause of
  the 2nd-turn `DEVICE_REMOVED`). If a model rejects the opts (e.g. sliding-window
  models like Phi-3.5), it falls back to a plain `reload`; device-loss errors are not
  retried. `DEVICE_REMOVED` is still ultimately a VRAM/driver matter — steer users to
  Llama 3.2 1B and a fresh GPU process (full browser restart) if it persists.
- **Streaming chat.** `aiRunStream` calls `engine.chat.completions.create({stream:
  true})` and consumes the async iterable in an `async` IIFE (`for await`), updating
  the last bubble (`#ai-bub-last`) per token. The system prompt (with fresh,
  scope-aware context) is rebuilt and prepended on every send; `_aiMessages` holds
  only user/assistant turns, so changing scope mid-chat just changes the next turn.

### Build note

`ai.js` uses `import()`, `async`, and `for await` — all valid in the classic-script
bundle and confirmed to pass the `vm.Script` parse invariant. Keep dynamic imports
as `import(VAR)` (not `import x from '…'`, which build.js strips).

### Status

Done: model picker + download-with-progress, static legend, scope menu with
full/connected drill-down, streaming chat.

### Optional TODO (not started, no particular order)

- [ ] **Real end-to-end download/inference test.** The whole flow is verified with a
      stubbed engine only; a real run pulls 1–2 GB onto an actual GPU. The plumbing
      is identical to the stub path, but real weights are the real test.
- [ ] **Markdown rendering of replies.** Currently plain text via `escH` in
      `aiRenderChat`/`aiRenderChatStreaming`; bullets/headings would render nicer.
- [ ] **Per-engineer "draft development plan" action** in the ID card — pre-tick that
      person in `_aiScope`, open the chat, and send a canned prompt.
- [x] **Persist chat history** — done (`aiPersistChat`/`aiRestoreChat` via
      sessionStorage `AI_CHAT_KEY`; restores after a forced reload).
- [ ] **Larger context budget for big-context models.** The 9000-char cap in
      `aiBuildContext` is conservative for ~4k-token models; raise it if a
      bigger-context model is selected.

---

## Navigation shell — the persistent nav rail

All top-level navigation lives in a persistent left **rail** ([src/sections/railnav.js](src/sections/railnav.js)
+ [src/styles/nav.css](src/styles/nav.css)). It **replaced** the old multi-group `<header>`
(removed) and the 12-button tab strip that used to sit inside `#res-header`. The matrix
canvas is no longer the front door — it's one view under OFFER MNGT (the renamed WORK domain).

### Key facts (non-obvious)

- **Single source of truth: the global `activeView`** (id string, e.g. `'roster'`,
  `'matrix'`, `'ninebox'`) — declared **once** in [globals.js](src/core/globals.js),
  default `'roster'`. The router **`railGo(viewId)`** sets it, routes, and refreshes the
  rail highlight + the `DOMAIN › View` breadcrumb in `#topbar`.
- **Views vs actions.** *Views* set `activeView` and change the visible surface; `railRoute`
  dispatches them: the Resources tabs (`RAIL_RES_TABS`) via `openRes()`+`showResTab(tab)`, plus
  `openOrgChart` / `openSummary` / `openCompare`, and `closeAllOverlays()` for the base
  matrix. *Actions* (brief/snap/backup/restore/AI/settings/help) just fire their existing
  function via `railAction` and do **not** touch `activeView`.
- **Everything keys off one CSS var `--rail`** (collapsed width; default 58px, user-set
  48–96 in Settings). The body gutter (`body{padding-left:var(--rail)}`), every full-screen
  overlay's `left:` inset, the flyout, and the rail width all reference it — change `--rail`
  in one place and the whole shell reflows. `--rail-open` (238px) is the pinned/hover width.
  `railApplyWidth()` writes `--rail` on `documentElement`.
- **Overlay insets.** The seven full-screen overlays are inset `left:var(--rail)` so the rail
  stays visible. help/compare/summary/res/snap **and `#brief-overlay`** are inset in **nav.css**
  (`#brief-overlay` is a rail view now — see below); `#org-overlay` is **inline-styled
  `position:fixed` in index.html** (inline beats the stylesheet) so it's inset *there*. Any NEW
  full-screen overlay must be inset from the left.
- **Z-index ladder.** view overlays `z400` < rail `z1000` < rail-spawned modals
  (`#settings-overlay`, `#landing-firstrun`) `z1100`. A rail-spawned modal opened while a
  view overlay is up MUST sit above `z400` or it renders hidden behind it.
- **Boot-timing trap (bit us).** The bundle runs mid-`<body>` (at the `{{JS}}` placeholder),
  so overlays defined *after* it — `#res-overlay`, `#org-overlay`, `#snap-overlay`,
  `#brief-overlay` — are **not in the DOM yet** when boot code runs; touching them throws
  (`G(...)` is null). Code that routes to them at boot must defer to `DOMContentLoaded`
  (railnav's `railLand`, and `ensureResPeriod` in boot.js). The rail *render* is safe (its
  markup is the first `<body>` child, above `{{JS}}`).
- **Overlay-close sync.** Closing a *view* overlay by its own ✕ or Esc resets
  `activeView='matrix'` so the highlight stays truthful — railnav wraps
  `closeRes/closeOrgChart/closeCompare/closeSummary` once at load, guarded by the
  `railRouting` flag so rail-driven navigation doesn't self-reset.
- **Hover-drawer + prefs.** Collapsed rail expands on hover and auto-collapses on leave
  (toggle in Settings); the pin button locks it open; `railIsOpen()`=pinned‖hoverOpen.
  UI-only prefs — `{hoverMode, landing, railWidth, chartPicker, badgeScope, scrollbar, viewOrder}` —
  persist in **`localStorage 'eim_rail_prefs'`**, deliberately separate from app state (`SK='eim_v4'`)
  and **not** part of the data model or backups. First run shows `#landing-firstrun` to pick the default view.
- **Configurable page placement (reorder + cross-domain move).** Each `.rn-sub` is `draggable`; native
  HTML5 DnD both reorders pages within a domain AND **moves them between domains**. Two persisted override
  maps (in `eim_rail_prefs`, UI-only — never app state/backups): `railViewOrder` (`{domId:[viewId,…]}`,
  order within a domain) and `railViewDomain` (`{viewId:domId}`, a page's overridden home domain). A
  **master registry captured once from the declared `RAIL_DOMAINS`** — `RAIL_VIEW_DEF_DOM` (home domain)
  + `RAIL_ALL_VIEWS` (live view objects) — is the fixed source that **`railApplyLayout()`** (called in
  `railInit`, replaces the old `railApplyOrder`) rebuilds every domain's `views` from each call: place
  each view in its effective domain (`railViewDomain` else home), then order within (stable; unknown ids
  fall to the end). It's **idempotent** and self-heals stale prefs — an override pointing at a removed
  domain falls home; a build adding/removing a view reconciles with no migration (same idea as `sanitise*`).
  `railMoveView(dragId,toDomId,targetId,after)` is the single DnD mutation path (same-domain reorder AND
  cross-domain move), persisting both the source and target domain orders. **Drop targets:** a `.rn-sub`
  (precise position, only possible in the one expanded/active domain) OR a **`.rn-dom-head`** (appends to
  that domain — the only way to reach a *collapsed* domain, since non-active domains hide their pages;
  the head highlights `.rn-drop-into` while hovering). A plain click still navigates (no drag movement →
  no `dragstart`). Re-render happens **only on drop** (a mid-drag `railRender` wipes `innerHTML` → kills
  the drag); the rail `mouseleave` auto-collapse is suppressed while `railDragging`.
  - **Organiser pop-up** (`#rail-layout-overlay`, opened from a Settings button via `rloOpen`; `z1160`,
    above the Settings modal's `z1100`): a wide board that MIRRORS the rail — one column per domain
    (`rloRenderBoard`), pages as draggable cards. It has its OWN DnD (scratch `rloDragView`, separate DOM
    from the rail strip): drop a card on another card = position next to it (`rloCardDrop`), drop on a
    column = append to that domain (`rloColDrop`). Each card also carries a domain `<select>`
    (`railLayoutSetDomain` → `railMoveView` to the domain's end) and ▲/▼ nudges (`railLayoutNudge`, adjacent
    swap) as the no-drag/touch fallback. Everything routes through the SAME persisted model + `railMoveView`
    as the rail DnD, then calls `railRender` (live rail) AND `rloRenderBoard` (the board) — so the board,
    the rail and the persisted prefs never diverge; edits apply **immediately** (like a drop), NOT on
    Settings SAVE. `railResetLayout` (the organiser's **↺ RESET LAYOUT** button) clears both override maps.
    Esc closes it (its closer is wired in boot.js's keydown handler; it's in `RAIL_MODAL_OVERLAYS` so Esc
    dismisses it without back-navigating). This replaced an earlier cramped inline list inside the Settings
    column — the board is roomier and reads as the rail it configures.
- **Short-viewport compact mode (the real fix for "tiny scrollbar on small screens").** The open rail
  (6 domain rows + an expanded domain's pages + the 7-row utility foot) overflows a short screen and
  forces the scrollbar. `@media (max-height:780px){#railnav.open …}` in nav.css tightens the domain
  rows and **folds the labeled foot into a compact wrapped icon strip** (labels off, `title` tooltips
  kept), reclaiming ~200px — enough that even the tallest domain (INSIGHTS, 8 pages) fits with **zero
  overflow** at 620px tall. Only the OPEN state on short viewports is touched; collapsed strip and tall
  screens are unchanged. The scrollbar width is now a Settings preset (`railScrollbar` thin|medium|wide →
  `--rail-sb` px via `railApplyScrollbar`; `--rail-sb-ff` drives Firefox's `scrollbar-width`, `auto` only
  for wide) as a grabbable safety net for the residual overflow on very short screens.
- **Verify gotcha — throttled transitions.** `#railnav` has `transition:width .18s`; the automation
  browser throttles CSS transitions when frames aren't painting, so a just-opened rail reads
  `offsetWidth:58` (the collapsed start value) forever, and the foot then wraps 1-per-row. When
  measuring the OPEN rail via DOM geometry, set `railnav.style.transition='none'` first, else every
  width/foot measurement is wrong. (Not a runtime bug — real browsers settle the transition.)

### Files

- [src/sections/railnav.js](src/sections/railnav.js) — rail render, `railGo`/`railRoute`
  router, `railAction`, `closeAllOverlays`, hover-drawer, Settings + first-run, width/prefs.
- [src/styles/nav.css](src/styles/nav.css) — rail / `#topbar` / `#matrix-toolbar` / flyout,
  overlay insets, icon sizing (all scaled off `--rail`). Loaded LAST so its insets win.
- [src/index.html](src/index.html) — `#railnav` markup, `#topbar` (breadcrumb + status),
  `#matrix-toolbar` (matrix-only controls, inside `#matrix-wrap`), `#settings-overlay`,
  `#landing-firstrun`.

---

## Resources tabs & analytics

The **Resources overlay** (`#res-overlay`) hosts the tabs listed in `RAIL_RES_TABS`, rendered
into `#res-body` by `showResTab(tab)` ([src/sections/nav.js](src/sections/nav.js)). The global FROM/TO period
(`#res-start`/`#res-end`) is **shared by every tab** (`getMonthRange()` in helpers.js).
**Adding a tab:** new `src/sections/mytab.js` with `renderMyTab()` → add to `JS_FILES`
(build.js) → add a `showResTab` case + the highlight-loop array → add a rail view in
`RAIL_DOMAINS` + `RAIL_RES_TABS` (railnav.js). (Old `CLAUDE.md` step "add a button in
res-header" is obsolete — the rail owns navigation now.)

- **Three analytics tabs.** *People analytics* = [analytics.js](src/sections/analytics.js)
  (`renderAnalyticsTab`, a story/dimension/template engine — see its own section below).
  *Portfolio analytics* =
  [portfolio.js](src/sections/portfolio.js) (`renderPortfolioAnalytics`) — project-side
  €/ROI/gate/sector/risk plus treemap, cost-over-time burn, a distribution panel
  (histogram + Gaussian / Pareto), and a channel-mix block (`pfChannelMix` via `chanAggregate`).
  All `pf`-prefixed; reuses `getMonthRange` / `_allocCost` / `_engByIdMap`. Interactive sub-controls
  re-render only their own wrapper via `pfSet`. *Portfolio economics* = [econ.js](src/sections/econ.js)
  (`renderEconTab`, `ec`-prefixed) — the cross-layer value×cost×channel×decision tab (its own
  ARCHITECTURE section below); it reuses `pfBuildDataset`/`pfSection`/`pfEur` and the channel helpers.
- **Spend-map treemap has two axes of control** (`_pfState.treemapBy` = `cost|revenue`,
  `_pfState.treemapGroup` = `none|intent`). `intent` mode = a **nested** treemap:
  outer cells are `project.tacticalIntent` groups (`pfTreemapGroupedSvg`, squarified twice —
  groups then members), inner cells stay ROI-rank-coloured. `PROJECT_INTENTS` /
  `PROJECT_INTENT_COLORS` (globals.js) are the shared source for the 4 postures
  (Defend / Grow / Adapt / Diversify); unassigned projects fall into an "Unassigned" group.
- **Derived project revenue.** `projRevenueM(p)` / `projRevenueIsDefault(p)`
  ([helpers.js](src/core/helpers.js)) = user-entered `impactEur` (in **M€**) when present,
  else a fallback `impact(y) + enabler(ena)`. It's a **pure computed accessor — it never
  writes back to `impactEur`** — so backups/snapshots stay consistent (only the real user
  value is stored; sanitise keeps `impactEur` null-if-unset and y/ena numeric).

### People analytics — dataset, dimensions, story views, risk model ([analytics.js](src/sections/analytics.js))

All `an`/`_an`-prefixed (flat-bundle collision rule). `renderAnalyticsTab` drives three
things off one **memoised** `buildAnalyticsDataset()` (one row per *active, non-vacant,
non-planning, non-excluded* engineer, all fields pre-computed): a **dimension × template**
compare mode (`ANALYTICS_DIMENSIONS` × `ANALYTICS_TEMPLATES`, matched by type), the
always-on **story views** (`isStoryView` templates, shown as pills), and the KPI scorecard +
auto-insights. Chart primitives are pure **SVG-string builders** (`anBarChart`/`anHistogram`/
`anBoxPlot`/`anStackedBar`/`anScatter`/`anNineBox`/`anHeatmap`); shapes carry `data-tip`
(hover, `anBindTips`) and `data-ids` (click-to-drill → ID card / people list, `anBindDrill`).

- **The dataset is the contract.** Adding an analytic = add a computed field in
  `_computeAnalyticsDataset` + a `{id,label,type,group}` entry in `ANALYTICS_DIMENSIONS`
  (types: `numeric｜ordinal｜categorical｜boolean｜ninebox`; `AN_VALUE_LABELS` maps coded
  values to axis labels). A **story view** is just a `{isStoryView:true, render(data)}`
  template — no dimension wiring. Both auto-appear in the UI. Fields flow through CSV export
  (`anExportCSV` `cols`) and are read straight from `eng.idcard` — so they ride save/backup
  with the engineer; **nothing here mutates state**.
- **Talent-lifecycle fields** (added on top of comp/career/perf/capacity/skills): review
  currency (`reviewCurrencyMonths` from `idcard.reviewdate`), `hasSuccessor` (from
  `idcard.succession`), `mobility`, `contract`, `cohortYear`, `hasNextMove`. These power the
  *Review Governance* and *Pay Progression* story views and are usable in any template.
- **Composite `anRiskModel(row)` (the Talent Risk Radar).** A **pure** 0–100 score + a factor
  breakdown, computed in a **third dataset pass** (it needs the SPOF second pass + `hasKTPlan`
  + nine-box movement already on the row). Weighted signals: below-market star (30), SPOF w/o
  KT plan (25), declining nine-box (15), over-allocated (15), stale/absent review (12), no
  successor for a manager/senior (10), on bench (8); capped at 100, banded ≥50 / 25–49 / 1–24
  via `anRiskColor`. The score is exposed as the `riskScore` **dimension**, a **KPI tile**, and
  an **auto-insight chip** — all three read the same per-row value, so they never diverge.
  It deliberately **fuses** the flight-risk logic here with the rule-based priority signals in
  [development.js](src/sections/development.js) into one ranked "who needs attention" view.

---

## Cost model — allocation → € (the one place cost bugs hide)

Every "cost" number in the app is `FTE × monthlyCost` summed over the FROM/TO months,
via **`_allocCost(v, monthlyCost)`** / **`_allocNum(v)`** ([helpers.js](src/core/helpers.js) —
invariant #2: never raw-multiply). Status letters matter: `m`/`r` (medical/resigned) = 0
cost & 0 FTE, `p` (PTO) = full cost & counts as 1.0 FTE, numeric = prorated. The subtlety
that caused real inconsistencies is **who counts** and **whether FTE is capped**, not the
per-cell math.

### Canonical inclusion policy — `_costCounts(eng)` ([helpers.js](src/core/helpers.js))

`_costCounts(eng)` = `!excludeFromCalc && (!planningOnly || includeInCost)`. **Every
project-cost-attribution path must gate on it** so headline "plan cost" agrees with the
resource-plan export and honours the flags: `_computeCostMaps` (TOTAL PLAN COST / COST BY
PROJECT / project-spending detail / monthly cost chart / burn), and `transferPlanCosts`
(writes `project.planCost`). Before this existed these paths counted *every* row, so an
engineer flagged `excludeFromCalc` — or a planning-only placeholder without `includeInCost`
— still inflated project cost and got transferred into `planCost`. **Vacancies DO count**
(planned/forecast spend), matching `plan.js`'s CSV `countsCost = !planningOnly||includeInCost`.

### Two deliberate lenses (don't "reconcile" them into one)

- **Project-attribution lens** (`_computeCostMaps` → COST BY PROJECT, TOTAL PLAN COST):
  **uncapped** per-project shares. If someone is 1.5 FTE across two projects, each project
  bears its share and the total exceeds one salary — that *is* the overallocation signal.
- **Team-cost lens** (Financial Analysis block, built from `_buildEngUtil`): caps at
  `Math.min(fte,1)` per person-month and excludes vacancies, giving the identity
  **TEAM COST = ALLOCATED + UNALLOCATED**. The old 4th KPI card "PROJ ALLOC COST" pasted the
  uncapped total next to these three, breaking the identity and inviting a false compare — it
  was removed (it merely repeated the top TOTAL PLAN COST card).

`_buildEngUtil` filters `!vacant && (!planningOnly||includeInCost)` but does **not** itself
drop `excludeFromCalc`; the Financial Analysis loop and the per-engineer card render skip
those explicitly. Keep that in mind if you add a new engUtil consumer.

### Current-month KPIs are clamped to the period

`_dashCur()` = the real calendar month. KPIs framed as "this month" (FTE THIS MONTH, ON
BENCH, per-card bench, peak-month fallback) use **`curInRange`** — `cur` clamped into
`[months[0], months[last]]` — so they stay meaningful when the plan period doesn't span today
(e.g. planning a future project). Without the clamp, `monthAllocs[cur]` is `undefined` → 0,
which silently reported *everyone on bench / 0 FTE*. The cost chart keeps the real `cur`
(so the "current" marker simply doesn't draw when out of range, which is truthful). Filtered
views: the monthly chart's FTE overlay uses `filteredRows` (like the cost bars), not the raw
`allocRows`, so filter + overlay stay in sync.

### Resource Balancer — TWO modes (`renderResDashboard` dispatches)

`renderResDashboard` (view id `dashboard`, label **"Resource balancer"**) is a **dispatcher** with a
mode toggle (`_balMode` session var, `balSetMode`, default **`'balance'`**); it calls the chosen
sub-view then **prepends** `_balModeToggle()` via `insertAdjacentHTML('afterbegin', …)` so neither
sub-view needs refactoring:

- **⚖ Balance** (default) = **`_balPortfolioView()`** — the portfolio supply/demand balancer:
  capacity vitals, demand-vs-capacity chart, capacity-by-function, **availability**, utilisation grid,
  and **over-allocation with proactive rebalancing suggestions**. Its engine —
  **`_dashBestCandidate(engId)`** (best substitute = most same-group headroom + skill overlap),
  **`showDashReplacements`**, **`openAddResourceModal`/`confirmAddResource`**, `pipelineCapacity`,
  `_buildEngUtil`, `_computeCostMaps` — uses the legacy **`db-*`** classes. **Regression history:** an
  earlier rework REPLACED `renderResDashboard`'s body with the per-project view, which silently dropped
  this whole balancing UI (the engine functions survived but were orphaned — the entry-point buttons
  lived in the removed render body). It was recovered from git (parent of the balancer-rework commit)
  and restored as `_balPortfolioView`. **Lesson: replacing a render wholesale can orphan a working
  feature — grep for callers of the functions the old body invoked before replacing it.**
- **▤ By project** = **`_balProjectView()`** — the per-project view: a **picker**
  (`balSetProject` → `_balProjId`) then a **gate roadmap band** (`_balGateRoadmap`) + **resourcing**
  (`_balResourcing`) — who's on it, each person's month-by-month time, cost per person, totals. **All
  numbers ABSOLUTE** (no share-of-portfolio). Computed off `allocRows` with `_allocNum`/`_allocCost`,
  so **not** suppression-gated (a proposed/held/archived project still shows real staffing). Uses
  `bal-*` classes ([dashboard.css](src/styles/dashboard.css) tail).
- **Gate roadmap** reuses the existing PI model: `gateConfig.increments` (dated time boxes) as the
  timeline, `gatePlan.roadmap[incId]` = the stage committed for each increment (the planned climb),
  `gatePlan.piItems[incId].milestones` plotted per column, current stage via `gtCurStageIdx`, and a
  **NOW** tag on the increment spanning `curMonth()`. **No increments defined → falls back to a stage
  stepper.** Nothing is written — it is a pure visualization of the PI board's data.
- **Shared helpers kept:** `_computeCostMaps`/`_buildCostMaps`, `_buildEngUtil`, `pipelineCapacity`,
  `_dbSparkBars` are still exported and consumed by pipeline/home — only the *rendered body* changed.
  `setEngDashGroup`/`onDashFilter*Change` still exist (now inert on this view). `_doExportDashboardPDF`
  still prints `#res-body`; colours resolve via inline `var()` + its `:root` tokens, but the `bal-*`
  layout rules aren't in its `db-*` pull — **balancer PDF export is a known follow-up**.

### Replacement finder — "select a resource → find available same-function/skills cover"

The recurring "3 sessions couldn't do it" feature. ONE engine, `showDashReplacements(engId, btn)`
+ `_dashBestCandidate(engId)` (both in [dashboard.js](src/sections/dashboard.js)): candidates =
same `groupId` (function) first, then other groups; scored by **free headroom** (1 − current-month
FTE, `_dashCur()`) and **skill overlap**; optional per-skill filter pills refine it. Wired at **three**
call sites, all routing through the same function:

- **⚖ Balance › utilisation cards** — a `.db-ubtn` on **every** `.db-ucard` now (was over-allocated
  only); non-over cards get the neutral `.db-ubtn--alt` variant + "FIND ALTERNATIVES" label.
- **⚖ Balance › overload-conflict cards** — the original `.db-conflict` button (+ a `_dashBestCandidate`
  "suggested swap" line).
- **▤ By-project › team rows** — a compact `.bal-find` 🔍 per person in `_balResourcing`.

**Three gotchas that made this fragile (all fixed 2026-08-27):**
1. **Grid-squish.** The panel is inserted `afterend` of the trigger's card. In `.db-util-grid` (a CSS
   grid) that made it a cramped ~232px grid cell. Fix: the panel carries class **`dash-repl-panel`**
   = `grid-column:1 / -1` so it spans the full row (harmless/ignored in the flex conflict list and the
   block by-project host). This was the main "doesn't work properly" symptom.
2. **Table rows can't host a `<div>` panel.** From a `.bal-find` in a `<tr>`, `showDashReplacements`
   detects `btn.closest('tr')` and renders into a shared full-width **`#bal-repl-host`** (emitted after
   the team table in `_balResourcing`) instead of after the row — single-open, and the label toggle is
   skipped for the icon button. The skill-pill re-entry re-detects the same `tr`, so it stays in the host
   with no extra param.
3. **`\"` truncated the skill-pill onclick.** The pills used to embed
   `document.querySelector('[data-repl-eng=\"'+id+'\"]')` inside a **double-quoted** `onclick="…"` — the
   `\"` is not HTML attribute escaping, so the parser **closed the attribute early**, and every pill click
   threw `SyntaxError: Invalid or unexpected token` and did nothing (this bug shipped in old builds too).
   Fixed by a named **`_replToggleSkill(pill)`** helper; the skill + engId ride on `data-repl-skill`
   /`data-repl-for` (escH-escaped, XSS-safe for user skill names) and are read back with `getAttribute` —
   never spliced into handler JS. **Rule: never put `\"` inside a double-quoted inline handler; pass data
   via escH'd `data-*` attributes and read it with `getAttribute`.**

Verified in-browser (seeded 6-eng/2-proj dataset, served over localhost since `file://` won't open in the
pane) via DOM geometry: full-width panel in both modes, correct same/other-group candidates with free %,
skill pills filter + toggle with **zero** runtime errors. Note: seeded projects with no `lifecycle`
migrate to `proposed` → capacity-suppressed → everyone reads 0%/bench; set `lifecycle:'active'` when
seeding or the balancer looks empty (not a bug — see *Project lifecycle* and the suppression banner below).

### "Over-allocated person shows 0%" — suppression made visible (⚖ Balance)

The #1 confusion: a person booked (even over-booked) on a `proposed`/`on_hold`/terminal project reads
**0% / bench** in the balancer, because `_computeEngUtil` (helpers.js) drops allocations on projects not
in `_projCapacitySet()` (`consumes:false`). For a portfolio that never engaged the gate, EVERY project
defaults to `proposed` → the whole balancer reads 0. This is the capacity-planning feature working as
designed, but it looks broken. **Decision (with the user): keep the suppression, but never show a silent
zero.** `_balPortfolioView` recomputes the RAW (unsuppressed) bookings per engineer (`_hiddenByEng`,
peak FTE/mo) + the set of suppressed-but-staffed projects (`_hiddenProjIds`) and surfaces them:

- a **`.db-suppress` banner** below the toolbar naming the count of hidden projects, who's affected, and an
  **OPEN PIPELINE** button (`railGo(event,'pipeline')`) to go fund them;
- a **`db-tag--hidden` ∅ HIDDEN chip** + a **`.db-hidden-note`** ("up to N FTE/mo on un-funded projects
  (hidden)") on each affected utilisation card. A partly-funded person shows their real funded % **and**
  the hidden note (e.g. 55% funded + 0.8 FTE/mo hidden), so the two never contradict.

This changes **no** capacity math — `_projCapacitySet`/`_computeEngUtil`/cost maps are untouched; it's a
pure read-side explanation layer. Verified: banner appears only when a suppressed project is staffed,
lists it, routes to Pipeline, and vanishes once all projects are `active` (Ada then reads her true 1.4 /
over-allocated). If a future ask is "count un-funded work in utilisation too", that's the OTHER option the
user declined here — it would mean broadening the suppression set in `_computeEngUtil` (app-wide blast
radius: exec/home/timeline/development all read `_buildEngUtil`).

## Timeline — by-resource ribbon ([timeline.js](src/sections/timeline.js))

The timeline is a mode dispatcher (`_tlState.mode`): **`gantt`** ("By project" — project rows, nested
engineer rows), **`resource`** ("By resource" — added 2026-08-27), **`plan`** (capacity scheduler).
`renderTimeline` early-returns to `renderTimelinePlan`/`renderTimelineResource`; `tlModeBar`/`tlSetMode`
gate the three.

**By-resource** = one drag-reorderable lane per engineer, each a small **SVG stacked-area ribbon**
(`_tlLaneSvg`) showing that person's allocation split by project colour over the FROM/TO months, so a
project ramping down as another ramps up reads as a visible crossover. Design decisions worth keeping:

- **Shows ALL real bookings, funded + un-funded.** Deliberately does NOT use `_buildEngUtil` (which
  suppresses proposed/on-hold) — it reads `allocRows` directly, so a person booked only on un-funded work
  still appears. Those segments render **faded (opacity 0.4)** instead of hidden — the deliberate opposite
  of the balancer's suppression, to avoid the "over-allocated shows 0%" trap (see balancer section above).
  Funded/un-funded split via `_projCapacitySet()`.
- **Geometry + ADAPTIVE vertical scale.** Per-lane independent SVG, x = `(i+0.5)*CELL_W` with the area
  extended flat to both lane edges (x=0 / x=plotW) so it fills the width. The 0→100% band is a **fixed
  `LANE_H` px (76)** so 100% always looks the same across lanes; the **over-zone height adapts** to the
  worst peak in view: `maxF = clamp(max lane peak, 1.15, 3.0)`, `OVER = (maxF-1)*LANE_H`, `yF(f)=y0 -
  clamp(f,0,maxF)*LANE_H`. So a 250% person makes every lane 190px tall with the 100% line proportionally
  low and the spike clearly taller than a 120% one — the earlier bug was a fixed `capF≈1.27` ceiling that
  made 130% and 300% render identically. Faint gridlines at each integer multiple (200/300%), a light-red
  over-zone tint above the line, red `var(--danger)` spill for the over-portion, bold per-month total %
  labels anchored to the true stack top, and a transparent per-month `<rect><title>` for the hover
  breakdown (smooth look, precise hover). Cap at 300% is visual only — the % label stays truthful above it.
- **Right-side control panel + colour management** (redesign after "neither usable nor scalable": the top
  legend became an unreadable wall with many projects, and clashing project colours were indistinguishable).
  `tlSidePanel(all, projSeen, hidden)` renders a fixed 200px right column (ribbon is `flex:1` beside it and
  scrolls — deliberately trades horizontal month room for the panel, as the user accepted): a **PROJECTS**
  list (an `<input type=color>` per project → `tlSetProjColor` writes `project.color` and `saveState`s, so
  it applies **app-wide** — matrix/gantt too — plus the project name text **colour-matched to its band**),
  a **RESOURCES** list (a show/hide checkbox per person → `tlToggleEngHidden`, session-only `hiddenEng`), and
  the capacity/over/un-funded key. The old top legend is gone.
- **Distinct palette, recolour-everything.** `TL_PALETTE` (18 dark-legible categorical colours);
  `tlAutoColorProjects(force)` assigns `palette[i%len]` to **every** project by index and persists. Runs
  **once automatically on first open** (guarded by localStorage `eim_tl_autocolor`) so bands are immediately
  separable, and again on demand from the panel's **AUTO-COLOR** button. This overwrites existing
  `project.color`s app-wide by design (the user chose app-wide + recolour-everything); per-project pickers
  fine-tune, and it's fully reversible.
- **On-ribbon labels** are now the **3 thickest bands only** (≥18px tall — avoids the pile-up the screenshot
  showed), each a dark chip **outlined and text-filled in the band's colour** so the label reads as part of
  its graphic. `var(--bg)` separators still stroke between bands; the over-portion is a translucent
  `var(--danger)` wash + red outline (NOT a solid-red fill, which read as a red "project" band).
- **Lane order** is a session-only `_tlState.engOrder` (keyed by engId, not index — like `projOrder` but
  id-keyed so it survives filtering), default peak-desc; `_tlEngDrag*` reorder. `conflictOnly` filters to
  `peak>1.005` people. Lane name → `openIdCardModal`.
- **Cross-link with the balancer (two-way).** `tlOpenResource(engId)` sets `mode='resource'`+`focusEng`,
  routes `railGo(null,'timeline')`, then scroll-focuses + highlights that lane (one-shot: `focusEng`
  cleared after render). Called from the balancer's over-allocation conflict cards (a `◧ TIMELINE` button
  beside FIND REPLACEMENTS) and the ▤ By-project team rows (a `◧` beside the 🔍). This is the "fluid
  movement between project and resource lenses" — cross-link, NOT a merge of the two tabs.

New top-level names are all `tl`-prefixed/unique (flat-bundle rule): `renderTimelineResource`,
`_tlLaneSvg`, `_tlEngDrag*`, `_tlEngDragId`, `tlOpenResource`. Verified in-browser (4-eng/4-proj seed, one
project `proposed`): crossover ribbon, red over-spill on the 130% person, faded un-funded segment, hover
breakdown, conflicts filter, drag-reorder, and the balancer→timeline focus link — zero console errors.
Screenshots don't composite in the automation pane; verified via DOM geometry (same lesson as charter/home).

### Dashboard redesign — the `db-*` class layer ([dashboard.css](src/styles/dashboard.css)) — SUPERSEDED for the balancer body

The `db-*` layer below describes the PRIOR portfolio dashboard; its classes remain in
[dashboard.css](src/styles/dashboard.css) but `renderResDashboard` no longer emits them (see the
`bal-*` rework above). `renderResDashboard` used to emit ~800 lines of per-element inline styles. It now emits
**class-based markup** styled by [src/styles/dashboard.css](src/styles/dashboard.css) (registered
in `build.js` `CSS_FILES`). Non-obvious points:

- **All classes are `db-*` prefixed** so they never collide with the shared `.kpi-card` /
  `.alloc-kpi-grid` / `.sum-section-title` / `.alloc-proj-table` used by *other* tabs (exec,
  portfolio, org). Those shared classes are untouched — the dashboard no longer uses them.
- **One shared sparkline** — `_dbSparkBars(values, opts)` (top of dashboard.js) replaced four
  near-identical inline bar loops (cost-by-project, project-detail, per-engineer util spark).
  `opts.overMax`/`overColor` colour over-threshold bars (the util spark's red over-allocated
  months); `opts.curIdx` highlights the current month.
- **"Budget consumed" was removed.** It was calendar-driven (planned-cost-in-past-months ÷
  total-planned) — meaningless for a resource portfolio with no budget. The hero now leads with
  **allocation efficiency** (`_allocPct` = allocated ÷ team cost) + a cost hero, and the health
  strip's ON BENCH tile shows **bench € (`_unallocCost`)**. The team-cost/allocated/unallocated
  totals are **hoisted to the top** of `renderResDashboard` and reused by both the hero and the
  Financial Analysis identity block, so headline and detail never diverge. A real budget-vs-plan
  view is deferred to the **charter financials** (`charter.financials`), the app's financial-model
  home — do NOT add a parallel `project.budget`.
- **PDF export (`_doExportDashboardPDF`) uses a print stylesheet, not regex.** It pulls the live
  `.db-*` rules from `document.styleSheets` and defines print-tuned `:root` tokens (light ground,
  lime→dark-green), so every `var(--…)` reference (inline styles, SVG fills, classes) resolves for
  paper. Interactive controls are hidden via CSS. The old approach string-replaced `var()`→hex on
  the markup and missed colours.

---

## Cross-functional project charter

Per-project artifact to **align the 5 functions (Strategy / R&D / Offer Mgmt /
Procurement / Industrialization) on shared priorities** and stop any one pushing an
impossible agenda. Lives on `project.charter` (so it flows through save / backup /
snapshot automatically). Logic + UI in [src/sections/charter.js](src/sections/charter.js)
(all `cht`-prefixed); pure maths in [src/core/financial.js](src/core/financial.js);
styles in [src/styles/charter.css](src/styles/charter.css); tests in
[tests/charter.test.js](tests/charter.test.js). Money is EUR everywhere. **No approvals
and no CAPEX/OPEX** by design (both were dropped — a single-user local tool can't enforce
approvals, and investment-type fed no calculation).

### Two PANELS (not a modal), a shared project + picker mode (non-obvious)

The charter is now **two rail-inset panels**, split out of the old 4-tab modal:
- **OFFER MNGT › Financials analysis** (`#cht-overlay`) — Overview / Demands / Financials tabs
  (`chtOpenFinancials` → per mode). `openCharter(projId)` renders it.
- **OFFER MNGT › Trade-off decision** (`#dec-overlay`) — the configurable triangle(s) +
  non-negotiables/flexibilities (`chtOpenDecisionView` → per mode; `chtOpenDecision(projId)`).
- Both share one selected project (`_chtProjId`) and a **picker MODE** from Settings
  (`railChartPicker()` → `'hub' | 'dropdown'`, persisted in `eim_rail_prefs.chartPicker`):
  - `hub` — `openCharterHub(target)` shows `#chthub-overlay` (the card grid). A card opens the
    matching panel stacked **above** the hub. One hub overlay serves **three** targets via
    `_chtHubTarget` (`target` = 'financials' | 'decision' | **'channels'** — the last opens the
    Channel-mix panel; see the Channel-mix section). Card badges are target-aware.
  - `dropdown` — the panel opens directly with a `<select>` in its header (`#cht-pick`/`#dec-pick`/
    `#chan-pick`, rendered by `chtRenderPicker` / `chanRenderPicker`), like Design-to-cost's `#dtc-picker`.
- **These panels are VIEWS now** (rail-inset `left:var(--rail)`), NOT modals: `#cht-overlay`,
  `#dec-overlay` and `#chan-overlay` are `z-index:410` so they sit **above** the hub (`z400`) —
  closing a panel reveals the hub again. Only the deck/synopsis stay full-cover modals (z1150).
- **Rail-highlight sync on close** is done inside `chtClose`/`chtCloseDecision`/`closeChannels` via
  `chtSyncRailAfterClose()` (NOT the railnav `railWrapClosers` wrap): it resets `activeView`
  to `'matrix'` only when NO charter surface (`cht`/`dec`/`chan` panel or hub) is left showing and we're not
  mid-navigation (`railRouting`). Wrapping `chtClose` in railnav instead would wrongly reset the
  highlight when the hub is still visible beneath a just-closed panel. `railChartPicker`,
  `railRouting`, `activeView` are read cross-file (one shared bundle scope).

### Data model (`makeCharter` in [model.js](src/data/model.js))

```
charter = {
  priority, status, businessCase, expectedRevenueM,     // Overview tab
  strategy|rnd|offer|procurement|industrialization: { alignment, demands:[] },
  financials: makeCharterFinancials(),
  decision:   makeDecisionCard(),
}
```
- **Function object is minimal**: an `alignment` (1–10) + `demands[]`. A demand
  (`makeDemand`) = `{ text, dimension, mustHave }` where `dimension` ∈ `'' | features |
  time | productCost | projectCost`. This replaced an earlier heavier per-department model
  (asks/commitments/dependency-matrix) — kept intentionally light.
- **Decision = configurable TRADE-OFF TRIANGLE(s)** (`makeDecisionCard`): `stances` for all
  **4** dimensions (kept as the canonical set — drives conflicts + DTC guidelines) each
  `'prioritize' | 'balance' | 'sacrifice'`; `points` = the **3** dimensions the primary triangle
  plots; `scenarios[]` = up to 2 named comparison triangles (`makeScenario` = `{ name, points[3],
  stances{4} }` — a full alternative, plots only its 3 `points`); plus `nonNegotiables[]` /
  `flexibilities[]`. `chtPtSet` swaps duplicates so a triangle always plots 3 distinct points.
- **Financials** (`makeCharterFinancials`): `initialInvestment`, `unit` (display scale
  `eur|keur|meur`), `cashFlows[]`, `discountRate`, `pricePerUnit`, `variableCostPerUnit`,
  `marginMode` (`compute|targetPrice|targetCost`), `targetMarginPct`, and
  `investment:{ items:[makeInvestmentItem], amortUnits }`.

### Financials-panel tabs + the decision panel

`CHT_TABS` = **Overview** (business case + revenue) · **Demands** (the board, all 5 functions
with alignment + demands) · **Financials**. `chtShowTab` routes; each tab is a pure `innerHTML`
render. **Decision moved to its own panel** (`chtRenderDecision` → `chtDecisionBody`): the
primary triangle (`chtTriangleSVG` + a 3-of-4 `chtPointPick` + the 4-stance `chtStanceGrid`),
up to 2 comparison-scenario cards (each with its own name/points/stances), the alignment radar,
conflicts, and the non-negotiables/flexibilities lists. Editing writes straight into
`project.charter` and autosaves via `saveState()`.

### Conflicts — the point of the whole thing

A **must-have demand whose dimension the project has chosen to `sacrifice`** = a conflict
(`chtConflicts(c)`). Surfaced on the Demands board (red rows + banner), the Decision tab
(banner), the hub card badge, deck slide 5, and the synopsis. This makes the classic
failure visible *before* it happens (e.g. R&D/Marketing demand low product cost, but the
project sacrificed Product cost).

### Financial engine — conventions & gotchas ([financial.js](src/core/financial.js))

- **Convention** (documented at top of file): `initialInvestment` is the t=0 outlay
  (positive); `cashFlows[i]` is the net flow for year i+1; `discountRate` is a decimal.
- **IRR = grid-scan + bisection with sign-change bracketing** (NOT naive binary search).
  Returns `null` when no real root is bracketed; returns valid *negative* IRRs for
  loss-makers. The task spec's expected NPV/IRR/break-even numbers were all wrong — tests
  use hand-verified oracles and assert IRR by zeroing NPV.
- **Display unit scales project-level money only** (investment, cash flows, NPV). Values are
  ALWAYS stored in EUR; the unit is display/entry only (`finUnitFactor`/`fmtMoneyUnit`), so
  switching units never mutates data. **Per-unit price/cost and the investment-item amounts
  stay in plain €** — the latter is deliberate: scaling item amounts by M€ once turned
  "50000" into €50bn and broke amortization (a real bug). `amortizedPerUnit()` = Σ
  unit-target item amounts ÷ `amortUnits`.
- **Margin modes** (`resolveUnitEconomics`): `compute` (price&cost→margin), `targetPrice`
  (cost + target% → required price, cost-plus), `targetCost` (price + target% → max unit
  cost, market-price-fixed). **Product margin = price − DIRECT cost** (excludes amortized);
  **break-even uses `effVarCost` = direct + amortized**. The target-mode derived value
  live-updates via `#cht-derived-val` in `chtFinRefresh` (avoids a focus-stealing full
  re-render).
- `effectiveInvestment` folds `target:'kpi'` items into the outlay; with no breakdown the
  effective figures equal the plain fields, so old callers/tests are unaffected.

### SVG visualizations (pure SVG, CSS-var themed, colour-blind-safe via text)

`chtTriangleSVG(points, stances, opts)` (trade-off triangle: 3 chosen corners, weighted-centroid
marker; weights prioritize 1.0 / balance 0.28 / sacrifice 0.04 so a prioritized corner pulls the
marker to it; `opts.small` for scenario/slide thumbnails; `chtStanceWarn` gives the "wish list /
nothing sacrificed / all sacrificed" banner — evaluated over the 3 plotted stances),
`chtRadarSVG` (alignment), `chtNpvCurveSVG` (NPV-vs-rate + IRR marker), `chtCumCashSVG`
(cumulative cash flow + break-even marker). Deck/synopsis reuse these — deck slides 1 & 4 render
the primary triangle, and slide 4 renders the scenario triangles side-by-side for comparison.

### Deck + synopsis

`chtOpenDeck` → 5 HTML slides in `#cht-deck-overlay`; `chtOpenSynopsis` → 1-page Markdown
rendered via `chtMdToHtml`. Export = **Copy Markdown** (clipboard + execCommand fallback,
`chtCopyText`) and **Print/PDF** (`chtPrintDeck` toggles `body.cht-printing` + a
`@media print` block with `print-color-adjust:exact`). Shareable-link was deliberately not
built (meaningless for a local single file).

### sanitise & migration — the load-safety net (bit us once)

`sanitiseCharter(p)` ([persist.js](src/core/persist.js), called from `sanitiseProjects`)
fills gaps against `makeCharter()` and **migrates old data**: renames the old `marketing`
function to `rnd` (keeping its data), builds `decision.stances` from scratch for legacy data,
**back-fills `decision.points` (default 3 distinct dims) + `decision.scenarios[]` (each name/
points[3]/stances{4}) for pre-triangle charters**, ensures every function has a `demands[]`.
**A stale key in one sanitise
list once made `sanitiseCharter` throw, which aborted `sanitiseProjects` → `loadState` and
made ALL projects vanish.** So: (a) keep every function-key list in sync when renaming, and
(b) the `sanitiseCharter(p)` call is wrapped in try/catch (bad charter → reset that one to
default, never block the rest).

### Extending it

Add a function field → `makeCharter` factory + `sanitiseCharter` + `CHT_FUNCS`. Add a
financial metric → `calculateFinancials` return + `display` map + results panel +
definitions accordion + a test. All new top-level names must be `cht`-prefixed / unique
(flat-bundle duplicate-declaration invariant). `charter.js` + `styles/charter.css` are
registered in `build.js` (`JS_FILES` / `CSS_FILES`).

**Verify note:** `preview_screenshot` was flaky this build — verify SVGs/values via
`preview_eval` (DOM geometry, computed stroke/fill, NaN scan), which is stronger than
pixels for numbers anyway.

### Design-to-cost workspace ([src/sections/dtc.js](src/sections/dtc.js), `dtc`-prefixed)

A **rail view under OFFER MNGT** (`OFFER MNGT › Design to cost`) — a *view*, not a modal, so its
`#dtc-overlay` stays `left:var(--rail)` (z400), wired into railnav exactly like the Charters
hub (`RAIL_DOMAINS` work views, `railRoute`, `closeAllOverlays`, `railOpenRes`,
`railWrapClosers` all include it). A project **picker** (`#dtc-picker`) at the top chooses
which project's `charter.costModel` to work on. Four sections, all reading from the charter:
1. **Target-cost cascade** — subsystems each with target/current €/unit; the **envelope** =
   `dtcTarget(financials)` (max allowable unit cost from price − target margin). Rollup shows
   over/under; a **loop-closer button** (`dtcPushCost`) writes the rolled-up current cost into
   `financials.variableCostPerUnit` (and flips `marginMode` off `targetCost` so it isn't
   re-derived away).
2. **Cost-down waterfall** — levers (saving €/unit, status idea|committed|realized); waterfall
   SVG steps Current → −realized → −committed → Projected vs the target line (ideas shown as
   remaining upside).
3. **Design guidelines** — `DTC_GUIDE[dim][stance]` do/don't rules generated from the square's
   4 stances, plus `chtConflicts` as hard constraints.
4. **Demand responses** — per charter demand: accept/mitigate/reject + note (writes back to the
   demand's `response`/`responseNote`).

Data lives on `charter.costModel = { subsystems:[makeSubsystem], levers:[makeLever],
competitors:[makeCompetitor] }` + each demand's `response` — so it flows through
save/backup and is back-filled by `sanitiseCharter`. `dtcTarget` is the one pure/testable
helper (in financial.js). Reuses charter's `cht-*` CSS + globals (`CHT_FUNCS`, `CHT_DIMS4`,
`CHT_DIM_LABEL`, `chtConflicts`, `resolveUnitEconomics`). Registered in build.js `JS_FILES`.

- **Subsystem BOM/features + include toggles.** Each subsystem has `include` and an
  optional `items:[makeCostItem {name,cost,include}]` list (collapsible; expand state is a
  module `Set` `_dtcOpen` keyed by index — UI-only, NOT persisted). `dtcSubCost(s)` = 0 if
  excluded, else the sum of INCLUDED items when it has any, else the manual `current`. So
  toggling a feature/part or a whole subsystem off is instant scenario analysis (the rollup
  drops it). When a subsystem has items its Current cell is derived/read-only.
- **Competition analysis** (`⑤`, up to 5 + an "Us" row). Per `makeCompetitor`: sellingPrice,
  cogs, volumeSaving (scale advantage), brandPremium. Derived: adjusted cost = cogs −
  volumeSaving; implied margin = price − adjusted cost − brandPremium. `dtcCompBarsSVG`
  stacks cost / margin / brand per row (Us computed from charter price + cascade current) so
  you see who wins on cost vs who charges a brand premium.
- **Never full-`dtcRender()` on a keystroke.** These sections are tables of inputs, so
  re-rendering `#dtc-body` on `oninput` destroys the focused field (→ one digit then focus +
  scroll lost; re-rendering on `onchange` breaks tabbing too). Numeric setters instead call
  **`dtcRefreshDerived()`**, which updates ONLY the computed outputs in place by id
  (`#dtc-cascade-live`, `#dtc-wf-live`, `#dtc-comp-live`, `#dtc-push`, and per-row
  `#dtc-gap-i`/`#dtc-cur-i`/`#dtc-cnt-i`/`#dtc-cadj-i`/`#dtc-cmrg-i`) — never the input
  elements. Structural changes (add/remove/toggle/expand) still do a full `dtcRender`. Same
  pattern as the charter's `chtFinRefresh`. Also: number spinners are hidden globally via
  `.cht-in[type=number]{ appearance:textfield }` + `::-webkit-*-spin-button{ none }`.

---

## Channel mix — go-to-market synoptic

`OFFER MNGT › Channel mix` ([src/sections/channels.js](src/sections/channels.js),
all `chan`-prefixed) — a **per-project** go-to-market view: a top-down synoptic of
**Company/Project → Channels → Segments**, plus an editor. Data lives on
`charter.channelModel` (via `makeChannelModel`/`makeChannel` in
[model.js](src/data/model.js)), so it rides save / backup / snapshot with the charter
and is back-filled by `sanitiseCharter` ([persist.js](src/core/persist.js)). Reuses the
`cht-*` / `dtc-*` styles (registered in `build.js`, `charter.css`). Money is EUR.

### Key facts (non-obvious)

- **It's the 3rd charter-hub target.** The rail entry `openChannelsView()` honours the
  SAME picker mode as Financials/Trade-off/DTC (`railChartPicker()` → `hub | dropdown`).
  In hub mode it opens the shared `#chthub-overlay` with `_chtHubTarget='channels'`;
  `chtRenderHub` (in charter.js) routes the card opener to `openChannels` and shows
  channel-summary badges via `chanMixSummary`. `chtSyncRailAfterClose` includes
  `chan-overlay` so closing over the hub doesn't wrongly reset the rail highlight.
  `#chan-overlay` is a rail-inset VIEW (`left:var(--rail)`, z410), like `#dec-overlay`.
- **`basis` sets what `pct` means** (`revenue | volume | emphasis`): revenue splits the
  charter's `expectedRevenueM` (M€) into € per channel; volume splits `channelModel.totalUnits`;
  emphasis is weighting only (no derived value). `pct` is ALWAYS the share regardless of basis.
- **Percentages are advisory, not enforced.** A live `chanMixSummary` shows the share total
  with a 100%-check; nothing clamps the sum. Blended margin is share-weighted over channels
  that actually have a margin — `chanMarginOf` returns `null` (not 0) for a blank margin, because
  `Number(null)===0` would otherwise drag empty margins into the average (a real bug caught in test).
- **One segment per channel (no crossing arrows).** Each channel routes to a single `segment`
  box; a segment reached via two channels simply appears under each. Arrow thickness ∝ share.
- **In-place derived refresh (the DTC pattern).** Typing in the editor calls
  `chanRefreshDerived()` — re-renders ONLY `#chan-synoptic` + `#chan-totals` + per-row value/swatch,
  never the inputs — so focus/scroll survive. Structural changes (add/remove/basis) do a full
  `chanRender`. Company/project-name edits refresh only the synoptic (the name inputs aren't touched).
- **`chanAggregate(projList)` is a pure portfolio helper** reused by INSIGHTS › Portfolio analytics
  (`pfChannelMix`): revenue per channel uses the SAME `expectedRevenueM` base as the panel (NOT
  `projRevenueM`), so the panel and the rollup agree. Projects with no expected revenue contribute €0.

## Portfolio economics — cross-layer analytics

`INSIGHTS › Portfolio economics` ([src/sections/econ.js](src/sections/econ.js),
all `ec`-prefixed) — a read-only Resources tab (`renderEconTab`) that **crosses the four
data layers** the rest of the app keeps separate: value (`charter.financials` →
`calculateFinancials`), cost (allocations via `pfBuildDataset` + design-to-cost unit cost),
route-to-market (`channelModel`), decision (`chtConflicts` + `CHT_FUNCS` alignment). Wired
like any tab: `JS_FILES`, `showResTab` case + highlight array, `RAIL_DOMAINS` insights view +
`RAIL_RES_TABS`. No new CSS file — sections are inline-styled like [portfolio.js](src/sections/portfolio.js)
and reuse its `pfSection`/`pfSectionShell`/`pfEmpty`/`pfEur` helpers.

### Key facts (non-obvious)

- **Nothing here mutates state.** Every section is a pure function of a per-project `ecDataset()`
  (financials × channel × decision × cost). The mix-shift what-if is computed at the **pool level**
  (`ΔprofitΔ = Δrevenue × (marginTo − marginFrom)`), never written back; its only state is the
  UI-only module vars `_ecMixFrom/_ecMixTo/_ecMixPct`, re-rendered into `#ec-sec-mix` by `ecMixSet`.
- **Revenue base is `expectedRevenueM`, NOT `projRevenueM`.** All €/margin figures use the charter's
  expected revenue (the same base the Channel-mix panel splits), so this tab, the channel panel, and
  the Portfolio-analytics channel block all agree. Cost/FTE come from `pfBuildDataset` (the allocation
  engine, FROM/TO period).
- **Reused pure helpers live in [channels.js](src/sections/channels.js):** `chanBlendedMargin`,
  `chanProfitPools` (revenue + gross profit by channel AND segment), `chanConcentration` (normalised
  HHI + top dependency by channel/segment/partner). `chanMarginOf` returns `null` (not 0) for a blank
  margin so empty margins don't drag averages — the same bug class caught in the channel totals.
- **Risk-adjusted NPV haircuts the UPSIDE only** (`npv>0 ? npv×(1−min(rpnMax/1000,1)) : npv`) so a
  loss is never flattered by risk. PI = `(Σnpv+Σinvested)/Σinvested` (PV inflows ÷ outlay).
- **Trajectory is the one ASYNC section.** `ecLoadTrajectory` (on a button) reads each full/projects
  snapshot via `snapIdbGetData(id)` (`Promise.all`), recomputes Σ NPV / Σ revenue / blended margin per
  snapshot with `ecTrajPoint`, appends the live state as "now", and renders sparklines into
  `#ec-traj-body`. Snapshot data isn't sanitised, so every helper it calls must tolerate missing fields
  (they do). This is the portfolio "trajectory over snapshots" that was previously deferred.

## Executive summary — one-page cockpit

`INSIGHTS › Executive summary` ([src/sections/exec.js](src/sections/exec.js), all
`xs`-prefixed) — a **read-only** cross-domain one-pager, built exactly like
[econ.js](src/sections/econ.js): a Resources tab (`renderExecTab`) rendered into
`#res-body`, sharing the global FROM/TO period, wired via `JS_FILES` (build.js) +
`showResTab` case & highlight array (nav.js) + an `insights` view in `RAIL_DOMAINS`
& `RAIL_RES_TABS` (railnav.js). No new CSS, no new persistence, **nothing mutates
state**.

It is deliberately distinct from the older **`Summary`** overlay ([overlays.js](src/sections/overlays.js),
`renderSummary`), which stays as-is: Summary is *execution* detail (risks/actions/
todos/milestones + team workload); this is *portfolio-strategy* altitude.

### Key facts (non-obvious)

- **Every tile reuses an existing dataset — no new metric is invented.** Value/decision
  from `ecDataset()` (NPV / risk-adj NPV / PI / revenue / blended margin / conflicts);
  cost & spend map from `pfBuildDataset()` + `pfTreemapSvg()`; capacity (FTE this month,
  bench) from `_buildEngUtil()` clamped via a local `xsCurInRange` (same clamp the cost
  dashboard uses, so numbers reconcile); people from `buildAnalyticsDataset()` (headcount,
  comparatio, `riskScore`); SPOF from `buildSkillMap()` (unique-skill holders); channel
  concentration from `chanConcentration()`. The only new SVG primitive is **`xsBubbleSvg`**
  (value × risk × cost — x=NPV with a dashed zero-NPV divider so it handles negative NPV,
  y=Σ RPN, r∝cost).
- **Drill-down onclicks MUST pass `event` as the first arg** — `railGo(ev, viewId)` is
  **two-arg** (the rail markup calls `railGo(event,'roster')`). Calling `railGo('analytics')`
  silently no-ops (`ev='analytics'`, `viewId=undefined` → `railDomainFor(undefined)` is null →
  early return). KPI cards and attention rows use `onclick="railGo(event,'…')"` to jump to the
  source tab; the target ids are all in `RAIL_RES_TABS`, so the router switches the tab in the
  already-open Resources overlay.
- **Honest empties.** A talent-only dataset (no charter financials/channels) shows Portfolio
  NPV `0€` / PI `—` / revenue `0€` / conflicts `0` — correct, not a bug. Cost/capacity/talent
  tiles still populate.
- **Spend map reuses the Portfolio-analytics treemap** with its own UI state (`_xsSpend
  {by:'cost'|'revenue', group:'none'|'intent'}`, `xsSpendSet` re-renders only `#xs-sec-spend`)
  — deliberately separate from `_pfState` so the two tabs don't fight over toggle state.
- **Cost burn is a dual-axis chart** (`xsBurnSvg`, `xsMonthlySeries`): bars = loaded team cost
  on a €-gridded left axis, line = resource utilisation (Σ monthAllocs ÷ headcount) on a right
  `%` axis with a dashed period-average line, month ticks thinned to ≤8 labels, a "now" marker.
  The utilisation line is drawn as a dark-halo path (a `--bg` stroke under the `--warn` stroke)
  so it reads over the bars; a colour legend sits below (rotated axis captions were dropped —
  they collided with the right-axis labels).
- **`--warn` was undefined app-wide** (base.css `:root` had accent/accent2/danger but no `--warn`,
  despite CLAUDE.md documenting `#f1a435`). Every `var(--warn)` — dashboard KPIs, econ, this chart,
  the attention icons — silently rendered **black** in SVG fills/strokes. Fixed by adding
  `--warn:#f1a435` to [base.css](src/styles/base.css); if you see amber appear where it used to be
  invisible, that's why. `--dim` lives in nav.css's `:root`, not base.css.
- **Engagement widget (`xsEngagementWidget` / `xsEngToggle`)** shows this week's touchpoints;
  its check-off re-renders ONLY `#xs-sec-engage` (never `renderEngagement`, which would clobber
  the exec tab). Full planner is TALENT › Engagement (below).
- **Axes auto-scale to the data** via `xsNiceMax4` (smallest nice ceiling ≥ max that divides
  cleanly into 4 gridlines) — no fixed 100% cap on the utilisation axis, and round € labels on
  the cost axis.
- **"My week" pinned items (`xsPlannerPins` / `xsPinnedItems`).** Any todo / risk / action can be
  flagged `execPin` via the 📌 on its Backlog-&-planner row (`blTogglePin`, sets the field through
  `projSetItemField` — no whitelist, so it persists on the item and rides save/backup; no model
  change). The exec section lists every pinned item across projects with a done checkbox and an
  unpin ✕ (`xsPinRemove`).
- **WEEK PLANNER — drag & drop (`xsScheduleSection`).** A Mon–Sun day grid plus an **Unscheduled
  pool**; the user **drags** engagement meetings and pinned to-dos/actions onto the day they plan to
  do them (NOT auto-placed by due date). Two ad-hoc optional fields carry the assignment and ride
  save/backup on their existing objects — **`tp.day`** on an engagement touchpoint, **`execDay`** on
  a pinned project item (both ISO `YYYY-MM-DD`; unset ⇒ pool; a value outside the current week falls
  back to the pool, so the plan resets each week). HTML5 DnD via `xsDragStart`/`xsDragOver`/`xsDrop`
  with a `'m|engId'` / `'t|pid|kind|id'` token in `dataTransfer`; drop zones are the pool (empty
  dayKey ⇒ clear) and each day. Checkboxes inside a draggable chip use `onmousedown=stopPropagation`
  so ticking never starts a drag. Check-offs from here OR the pins list route through **`xsRefreshWeek`**
  (re-renders `#xs-sec-sched` + `#xs-sec-pins`) so the surfaces never diverge.
- **Side-by-side cards align via `.xs-eqrow`/`.xs-col`** ([base.css](src/styles/base.css)): a flex
  row where the column stretches AND its `pfSection` card child is `flex:1`, so both panels' bottom
  borders line up (a plain flex row stretches the columns but not the cards inside them — that was
  the misalignment). Both burn axes auto-scale via `xsNiceMax4` (no forced 100% util cap).

## Gate & PI — configurable stage-gate + PI planning

`INSIGHTS › Gate & PI` ([src/sections/gate.js](src/sections/gate.js), all `gt`-prefixed) —
a **governance** tab: an editable stage-gate methodology crossed with a PI/increment time
axis, with **hybrid** readiness (manual checks + auto checks bound to the tool's existing
computed signals). Built like the other read-mostly tabs (`renderGateTab` into `#res-body`,
wired via `JS_FILES` + `showResTab` case & highlight array + `insights` view in
`RAIL_DOMAINS`/`RAIL_RES_TABS`), but it also **edits config**, so it writes state.

**Phased build — ALL FOUR phases are done.** Phase 1 = methodology editor + template library;
Phase 2 = per-project gate detail + the hybrid *resolver* (auto criteria evaluate live); Phase 3
= the Kanban **pipeline** (maturity axis, the default sub-view); Phase 4 = the **PI board** (time
axis — increments + a gate-overview matrix + a per-PI milestones/objectives plan).

The tab has a four-way sub-view toggle (`_gtView`): **PIPELINE** (default) → **PI BOARD** →
**PROJECTS** (detail) → **METHODOLOGY** (editor). `gtSetView` validates to these four. The **PI
BOARD** itself has an **inner toggle** (`_gtPiTab` = `'overview'｜'plan'`, `gtSetPiTab`) — see
Phase 4.

### Phase 3 — the Kanban pipeline

`gtPipelineView` renders one column per stage (horizontal-scroll board), each project a card in
its current stage (`gtCurStageIdx` — unset defaults to stage 0, same rule as the detail). A card
shows the project name, a readiness bar (amber when blocked), a blocker count, and a ▸ advance
button; clicking the title opens the Phase-2 detail (`gtOpenDetail` sets `_gtProjId` +
`_gtView='projects'`). The ▸ button reuses **`gtAdvance`** (confirm-override when blocked), so the
card just re-renders into the next column. A summary line tallies projects / stages / blocked.
Read-only over project data — only `gatePlan.stageId` moves.

### Phase 4 — the PI board (two inner tabs)

`gtPiBoardView` = a shared **increments editor** (CRUD + reorder over `gateConfig.increments`, each a
named time box with `start`/`end` `YYYY-MM`; `gtAddQuarters` seeds Q1–Q4 of the current year) on top,
then an **inner toggle** (`_gtPiTab`) between two matrices that share the same increment columns:

- **GATE OVERVIEW** (`gtOverviewGrid`, default) — the projects × increments **gate matrix** (each cell
  a stage `<select>` → `gatePlan.roadmap[incId] = stageId`, `● now: <current stage>` per row), but with
  three additions: a **✓ checkbox** per row toggles PI-planning **selection** (`gtPiToggleSelect`); only
  **selected** projects render as full matrix rows; **unselected** projects collapse into one
  `gtUnselectedPanel` at the bottom (a foldable chip list, `_gtUnselOpen`; a chip re-selects the project).
  Each row is `draggable` and reorders the planning order via HTML5 DnD (`gtDragStart/Over/Drop/End` →
  `gtPiReorder`, which moves the dragged id before the drop target in the full order list).
- **PI PLAN** (`gtPiPlanGrid`) — rows = **selected** projects (same order), columns = increments; each
  cell (`gtPiCell`) edits that (project, PI)'s **milestones** (text + `YYYY-MM` date + done toggle) and
  **major objectives** (text bullets), stored in `gatePlan.piItems[incId] = {milestones[], objectives[]}`.

**Selection + order are PLANNING-ONLY**, on `gateConfig.piSelected` / `gateConfig.piOrder` (arrays of
project ids) — deliberately NOT the global `projects[]` order, so reordering here has zero side effects
elsewhere. `gtProjOrder()` reconciles `piOrder` against the live `projects[]` each render (existing ids
first, new projects appended), so stale/missing ids are harmless. **`gtDelIncrement` sweeps orphaned
commitments** — it deletes that increment's key from every project's `roadmap` (not `piItems`, which is
keyed the same way but left to `sanitiseGatePlan`). Both matrices' first column is `position:sticky;left:0`.
`gatePlan.roadmap` + `gatePlan.piItems` are the Phase-4 model additions (back-filled by `sanitiseGatePlan`);
`targetIncrementId` remains in the factory unused (superseded by the per-increment `roadmap` map).
**Re-render discipline:** structural edits (add/delete milestone or objective, done-toggle, select, reorder)
re-render; free-text milestone/objective edits use `onchange` + save-only (no re-render) to keep focus.

### Phase 2 — the hybrid resolver + per-project detail

A sub-view toggle (`_gtView`, module-local) splits the tab into **PROJECTS** (default: gate
detail) and **METHODOLOGY** (the Phase-1 editor). The Projects view picks one project
(`_gtProjId`) and shows its current stage, a stage-progress strip, the weighted readiness of
the current stage, blockers, and Advance/Back.

- **`gtBuildSignalMap()` assembles `{projId -> {signal: value|null}}` once per render**, pulling
  from the SAME memoised datasets the analytics tabs use so numbers agree: value/cost/decision
  from `ecDataset()` (npv, riskAdjNpv, pi, blended, unitMargin, conflicts, cost, alignMin;
  `dtcGap = dtcCurrent − dtcTarget`), `chanConcentration([p]).channel.hhi` for `chanHHI`, and
  **project-level talent signals from `buildAnalyticsDataset()` joined to `allocRows`** — `riskScore`
  = the WORST (max) team member's score, `spof` = count of allocated engineers with unique skills
  and no KT plan. Everything is null-tolerant (a project with no charter/team simply yields nulls).
- **`gtEvalAuto` → pass/fail/na; a null signal is `na` (no data), never a false fail.** Manual
  criteria store `{status:'pass'|'fail'|'na', note}` on `gatePlan.criteria[critId]`. Clicking the
  active status chip again clears it back to `pending`.
- **Readiness = weighted pass ratio** (`gtStageReadiness`): `na` **waives** a criterion (drops it
  from the denominator); `pending`/`fail` count against. A **mandatory** criterion that isn't
  `pass` and isn't waived **blocks advancement** — `gtAdvance` then requires a confirm-override.
  Clean advances don't prompt. Every hop is appended to `gatePlan.history` (`{from,to,ts}`).
- **Re-render rules (same focus-preservation discipline as the editor):** manual status buttons,
  stage jump, advance/regress, project pick, and view toggle all re-render (they change readiness);
  the per-criterion **note field uses `onchange` and does NOT re-render** (notes don't affect score).

### Data model — one global config + per-project state (non-obvious)

- **`project.gatePlan`, NOT `project.gate`.** `project.gate` is a pre-existing **string label**;
  the per-project gate state is a separate object `gatePlan = { stageId, criteria:{[critId]:
  {status,note}}, targetIncrementId, roadmap{}, piItems{}, history[] }` (`makeGatePlan` in
  [model.js](src/data/model.js), back-filled by `sanitiseGatePlan`). Clobbering `gate` would corrupt
  the old label. `piItems[incId] = { milestones:[{id,text,date,done}], objectives:[{id,text}] }`
  (factories `makeGatePiItems` / `makeGateMilestone` / `makeGateObjective`; `sanitiseGatePlan`
  regenerates missing ids and coerces shapes).
- **The methodology is GLOBAL, in one object `gateConfig`** (`makeGateConfig`) = `{ model,
  templates[], increments[], piOrder[], piSelected[] }`. `model` = the active methodology (`{name,
  stages[]}`); each `makeGateStage` = `{id,name,desc,color,criteria[]}`; each `makeGateCriterion` =
  `{id,text,mandatory,weight, kind:'manual'|'auto', dimension,op,threshold}`; `gatePlan` =
  `{stageId, criteria{}, targetIncrementId, roadmap{[incId]:stageId}, piItems{}, history[]}`.
  `piOrder`/`piSelected` are the **planning-only** project order + PI-board selection (arrays of
  project ids, reconciled with live `projects[]` at render — see Phase 4). `templates[]` is
  the reusable library, **capped at `GATE_TEMPLATE_MAX`=5** (globals.js). Ships seeded with the
  default `defaultGateStages()` = OPEN→SELECT→DO→IMPLEMENT→PRODUCE→SELL, fully editable.
- **`gateConfig` rides save/backup/snapshot via FIVE wiring sites** (it's a top-level `let`
  in [globals.js](src/core/globals.js), reassigned on load like `projects`): the `saveState`
  payload, `loadState`, `captureScope` (full), `restoreSnap` (full/projects branch), and
  full-backup export/import ([backup.js](src/sections/backup.js)). Miss one and the config
  silently doesn't travel. `sanitiseGateConfig()` (persist.js, **wrapped in try/catch** at every
  call site — same "one bad object must not abort load" rule as `sanitiseCharter`) repairs
  structure, **generates any missing ids** (stages/criteria/templates/increments need stable
  unique ids so per-project overrides key correctly), and enforces the 5-template cap.

### Editor conventions (bit-avoidance)

- **Text/select/color edits use `onchange` and do NOT re-render** — the setter mutates
  `gateConfig` + `saveState()` and returns; the input already shows the value, so focus/scroll
  survive (same hazard the DTC/charter editors solved, solved here by simply not re-rendering).
  **Only structural changes re-render** `renderGateTab()`: add/remove/move stage or criterion,
  fold toggle, `kind` flip (must show/hide the auto-binding fields), and template apply/save/
  rename/delete/reset.
- **`saveState()` is debounced 800ms** — reading `localStorage` synchronously right after an edit
  shows the *old* value; use `saveNow()` to force a flush (this tripped up verification).
- **`GATE_SIGNALS`** is the bindable-signal list for auto criteria (npv / riskAdjNpv / pi /
  blended / unitMargin / conflicts / cost / dtcGap / alignMin / riskScore / spof / chanHHI). It
  populates the editor dropdown AND is the contract the Phase-2 resolver (`gtBuildSignalMap`)
  fills — an id here MUST be produced there or the auto criterion is permanently `na`.

**Verify note:** `screenshot` timed out repeatedly this build (flaky, as the charter section
also warns) — verified via `javascript_tool` DOM/state assertions instead. Also: a native
`alert()` (e.g. the template-library-full path) **blocks the whole preview pane** including
`navigate`; when scripting the editor, stub `window.alert`/`prompt`/`confirm` or you'll hang it.

## Navigation — ← Back replaces the per-panel ✕

Every rail **VIEW** panel's old "✕ CLOSE" (which reset `activeView='matrix'`) is now a **← BACK**
button (`railBack()` in [railnav.js](src/sections/railnav.js)) so drilling into a tab and returning
is one consistent move (e.g. Exec summary → click a KPI → analytics → ← back to Exec). True
**modals** (Settings, AI, ID card, deck, synopsis, first-run, snapshots, help) keep a real ✕.

- **`railNavStack`** records the previous `activeView` on every `railGo` (guarded by `railBackNav`
  so a back-navigation doesn't re-push). `railBack` pops to the first entry ≠ current; empty →
  Settings landing (`railLanding`), else `matrix`. Closing the current overlay is automatic —
  `railGo`→`railRoute` already tears down whatever overlay is open when it routes.
- **Esc mirrors ← Back but only for views:** boot.js checks `railAnyModalOpen()` (a hardcoded
  `RAIL_MODAL_OVERLAYS` list) BEFORE the closers run — if a modal is up, Esc dismisses just that;
  otherwise `railEscMaybeBack()` fires when a `RAIL_VIEW_OVERLAYS` overlay is showing. This keeps
  "Esc closes the ID card but stays on the roster" working.
- **The `railGo(ev, viewId)` two-arg gotcha still applies** — the buttons call `railBack()` (no
  args) but any drill-down onclick must pass `railGo(event,'id')`.

## Talent engagement planner

`TALENT › Engagement` ([src/sections/engagement.js](src/sections/engagement.js), all `teg`-prefixed)
— the **action layer** for retention: the app already diagnoses WHO needs attention (Talent Risk
Radar, Development priority); this plans WHAT touchpoint and WHEN, and records completion. Two
surfaces over one dataset: a **This-week board** (talents due this week + check-off action list)
and a **Cadence planner** (weeks × talents grid; assign a retention TIER, Auto-generate a tiered
rotation, hand-edit any cell). A compact this-week widget also sits on the Executive summary.

### Key facts (non-obvious)

- **Data rides the engineer.** `eng.idcard.engagement = { tier, touchpoints:[{type,week,done,note,
  ts}] }` (`makeEngagement` in [model.js](src/data/model.js)) — so it flows through save / backup /
  snapshot with the person, **no new top-level state**. `week` is a **Monday date key** `'YYYY-MM-DD'`
  (`tegMonday`/`tegWeekKey`), deliberately NOT an ISO week number (avoids year-boundary edge cases).
- **Fresh-per-engineer on load (a real trap).** `sanitiseEngineer`'s flat idcard merge assigns the
  SAME `idcDefaults` object to every engineer missing a key — fine for scalars, a shared-mutation
  bug for `engagement`. So [persist.js](src/core/persist.js) has an **explicit** engagement block
  that replaces the shared ref (`=== idcDefaults.engagement`) with a fresh `{tier,touchpoints:[]}`.
  `tegEng(eng)` is also a defensive accessor (lazily creates the object) so un-sanitised snapshot
  data never throws.
- **Manual tiers + auto-spread cadence** (the two choices reconciled): the user assigns each key
  person a tier by hand (`tegSetTier`, sorted by Talent Risk as a hint); `tegAutoGenerate` then
  spreads touchpoints across the horizon by per-tier frequency (`_tegState.freq`, UI-only), every
  cell then editable. Grid cell click is a 3-state cycle: schedule (●) → done (✓) → remove.
- **Two planner views (`_tegState.view`, toggle in the section header):** `grid` = the compact
  weeks × talents rhythm table (`tegGridBody`); `calendar` = one rich card per week
  (`tegCalendarBody`) with an initials avatar, role, tier, live Talent-Risk score, an editable
  action select + note, and the done checkbox. `tegSet` only numifies `weeks` — `view` is a
  string, so don't route it through the numeric coercion.
- **Note edits use `onchange` (blur), not `oninput`, and DON'T re-render** (`tegSetNote` only saves)
  so the field keeps focus — the same in-place pattern as DTC/charter. Structural changes (tier,
  cell, auto-gen) do a full `renderEngagement`.

## Localization (i18n)

Runtime translation layer in [src/core/i18n.js](src/core/i18n.js) (loaded **first** in
`JS_FILES`, so `t()` is available to every later file including globals). Shipped languages:
**English (base) + French + Chinese**, chosen in Settings. Rolled out **phased, shell-first**.

> **Living status, how-to, conventions, and the ordered remaining TODO are in
> [I18N.md](I18N.md) — read that to continue the work.** This section is the durable design
> rationale only.

Done so far (~966 keys fully translated; a further ~130 `econ.js` keys are wrapped but FR/ZH
pending — English fallback): Phase 0 seam · Phase 1 shell chrome (rail, Settings,
first-run, Help) · Phase 2 partial — matrix canvas, Roster + engineer card, Resources period
header, Resource plan, org-chart header/tools/dialogs + headcount-KPI, cost dashboard (+ replacement
finder + add-resource modal), Portfolio + People analytics, Team profiles, and section-6 modals &
misc (idcard, backup, tooltip, sidebar, Summary overlay, AI advisor dialogs, project-window
risk/schedule/actions modals) — all DOM chrome. Deliberately left English: SVG chart `<text>`,
the AI LLM prompt/context, stored status/priority option values, print-doc/CSV export builders.
Remaining: nine-box, DISC, development, skills, heatmap, charter, dtc, channels (Channel mix),
timeline, org node/context-menus, plus the FR/ZH values for the wrapped `econ.js` keys; then
Phase 3 (SVG labels, print docs, `i18nNum`/`i18nDate` wiring). See I18N.md.

**Load order:** `core/i18n.js` is the **first** file in `JS_FILES` (before `data/model.js`
and `core/globals.js`) so `t()` is defined for every later file — including globals, whose
`Y_LABELS` are wrapped. Nothing i18n depends on loads before it.

### Key facts (non-obvious)

- **KEY = the English source string.** `t('Roster')` looks up `I18N_DICT[lang]['Roster']`,
  falling back to English (the key itself) when absent. So a **partly-translated build still
  renders correctly** — wrapping more strings is purely additive, never breaks the UI. This
  was chosen deliberately over abstract keys: the app has ~10k inline literals in `h+=`
  chains, and `t(...)` is a bare expression that drops into those chains without introducing
  a semicolon (respects invariant #4) and needs no parallel `en.json`.
- **Language is a device/UI pref, NOT app data.** Stored in its own tiny localStorage key
  **`eim_lang`** (isolated from `SK='eim_v4'` AND from the rail prefs `eim_rail_prefs`), so a
  French user's backup/snapshot opens unchanged for anyone. Resolved **once at load** into
  module var `_i18nLang` (before any render); `t()` is a pure sync map lookup, safe in render.
- **Switching language reloads the page** (`i18nSetLang` → persist + `location.reload()`).
  This is intentional: a reload re-renders every surface from source, so there's zero risk of
  stale cached strings, half-translated open modals, or SVG left in the old language.
  `i18nApplyLang(code)` sets `_i18nLang` WITHOUT reloading — used only by tests (and available
  as a hook if live-switching is ever wanted).
- **The setting lives in Settings** (`#set-lang` in [index.html](src/index.html)), populated
  from `I18N_LANGS` in `railOpenSettings` and applied last in `railSaveSettings` (so the
  reload loses no other pref).
- **Static `index.html` markup can't call `t()`** (it's HTML, not JS). It's translated by a
  boot-time attribute sweep, **`i18nApplyDom(document)`**, run on `DOMContentLoaded` (so every
  static overlay — including those after the mid-body bundle — is present). Tag conventions,
  all using the **English text as the key** so English is a correct no-op:
  `data-i18n` → textContent · `data-i18n-html="…"` → innerHTML (key holds the English inline
  markup, entity-escaped in the attribute; use for the few strings with `<strong>` etc.) ·
  `data-i18n-title` / `data-i18n-ph` → title / placeholder. Keyboard-key glyphs and the
  trilingual `LANGUAGE · 语言 · Langue` label are deliberately left untagged. Use **explicit**
  key values on static tags (not bare) so the build audit can see them (below).
- **Rail labels go through `t()` at the array literal** (`RAIL_DOMAINS`/`RAIL_UTIL` in
  railnav.js), which is safe because language is fixed per page load and i18n.js loads first.
  Every consumer (rail render, breadcrumb, Settings landing dropdown) reads those, so it's a
  single translation point. `DISC`/`SPOF` are left untranslated (proper acronyms).
- **CJK has no bundled webfont** (would bloat the single-file tool). Chinese resolves to a
  system font: the body/prose stack names `PingFang SC / Microsoft YaHei / Noto Sans SC`
  ([base.css](src/styles/base.css)); `IBM Plex Mono` contexts get per-glyph browser fallback
  automatically. So Chinese *renders* everywhere; the named fonts only improve prose quality.
- **Numbers/dates via `Intl`** (`i18nNum`/`i18nDate`, locale from `i18nLocale()` = `fr-FR` /
  `zh-CN` / `en-US`). Runtime is a modern browser (WebGPU AI), so `Intl` is guaranteed — no
  hand-maintained tables. **EUR currency stays fixed**; only grouping/decimal/date order
  localize. These are defined but not yet wired into the existing hand-rolled formatters
  (`pfEur`, `fmtMoneyUnit`, thousands separators) — that's the remaining Phase 3 work.
- **SECURITY:** `t()` does not escape — it's for developer-authored UI text only. User data
  still flows through the existing `escH()` path; never pass untrusted data as a `t()` key.
- **The data boundary — do NOT translate user data.** Anything editable + persisted stays as
  stored: project/engineer names, the axis X name (`ax-x-name`), factory default names
  (`makeEngineer`'s "New Engineer", roster's "Planning Resource"), and notably the **quadrant
  labels** (`quadrantsByMode` — editable via the Q-panel, saved in state, carried in backups).
  These were left un-`t()`'d on purpose: translating a *default* would freeze a language-
  dependent label into the user's data on the next save. Fixed-chrome derivations of the same
  concept ARE translated — e.g. `Y_LABELS` (the y-axis mode caption, not persisted) and the
  toolbar's IMPACT/VISIBILITY/ENABLER buttons.
- **Wrapping JS-rendered sections:** inside `h+=\`…\`` template literals, insert `${t('…')}`
  for text and `${t('…')}` in `title=""`/`placeholder=""` slots; use interpolation for counts
  (`t('{n} engineer(s)',{n})`) rather than string concatenation, so word order stays
  translatable. `escH(userValue)` interpolations stay exactly as they are (data, not `t()`).

### Validation / verification

- **Build audit (non-fatal), `auditI18n()` in build.js** — collects every `t('…')` call across
  the bundle **plus every `data-i18n*="…"` attribute value in index.html** (HTML entities
  decoded to match the JS dict keys) and reports, per language, `translated/total` + `missing`
  + `orphaned` keys. Non-fatal by design so partial-coverage builds still ship; visible in
  build output. (This is why static tags need explicit key values, not bare `data-i18n`.)
- **Pseudo-locale `xx`** (`i18nPseudo`) — accents ASCII, pads ~40%, keeps `<tags>`/`{ph}`
  intact. Set `localStorage.eim_lang='xx'` to instantly spot truncation AND any on-screen
  string that never went through `t()` (it stays plain ASCII). Layout/longer-string check.
- **Unit tests** [tests/i18n.test.js](tests/i18n.test.js) — fallback chain, interpolation,
  pseudo, `Intl` formatting, and placeholder-parity between each key and its translation.
- **Longer strings:** FR ~+20% (truncation risk), ZH usually shorter. Rail labels only show
  in the hover-drawer (collapsed rail is icons-only) so `nowrap`+ellipsis+`title` covers them.
  The real hazard is **SVG chart/triangle/treemap/radar text** (no wrap/ellipsis) — kept for
  last and handled deliberately.

### Extending it (add a translated string)

Wrap the literal: `t('My label')`. Add its value under `fr` and `zh` in `I18N_DICT`
([i18n.js](src/core/i18n.js)). `node build.js` prints the audit (0 missing = done);
`node --test tests/i18n.test.js` checks parity. Keys with `{name}` placeholders must keep the
same placeholders in every translation (the parity test enforces this).

---

## Guided tour (src/sections/tour.js + styles/tour.css)

A **hub-and-spoke** onboarding walkthrough embedded in the Help panel. All `tour`/`_tour`-prefixed
(flat-bundle rule); themed with `var(--…)` and localized via `t()`, so it follows the app theme and
EN/FR/ZH. Registered in build.js (`JS_FILES` after railnav.js — it needs `RAIL_DOMAINS`/`railGo`/
`railPinned`/`railTogglePin`/`escH`/`t` — and `CSS_FILES`). **Not persisted, not app state, not in
backups** — pure UI help.

### Key facts (non-obvious)

- **The menu is DATA-DERIVED from `RAIL_DOMAINS`.** `tourShowMenu` renders one card per domain
  (icon + page list) straight off the rail's own domain table, so a new view/domain auto-appears in
  the tour with **zero tour wiring** — same reconcile-don't-migrate philosophy as `railApplyOrder`.
  Picking a card runs `tourDomainTrack(domId)` = an intro step + one step per `dom.views[]` + a
  `menu-end` step; **end of any track returns to the hub** (not close), so the user can pick another
  section — this is the "select specific sections to explore" model.
- **Hand-authored copy lives in `TOUR_COPY`, keyed by view id** (matrix/roster/plan/dashboard/
  skillrisk/ninebox/exec so far — the "key sections" scope). A view id **without** a `TOUR_COPY`
  entry falls back to a generated stub (`Opens <label>. Explore it now…`). **To flesh out the rest of
  the tour, add entries to `TOUR_COPY`** — that's the whole remaining task; the scaffold already
  reaches every view. `tourBasicsTrack()` is a separate concept-level intro (welcome → rail → matrix).
- **View steps drive `railGo(null, viewId)`** to open the REAL surface, then spotlight the rail entry
  via a `data-view="<id>"` attribute **added to the `.rn-sub` markup in `railRender`** (railnav.js) —
  a stable anchor, unlike the dead early-version tour that keyed off `button[onclick="…"]` on a header
  and res-tab strip that no longer exist. `railGo` accepts a null event (`if(ev&&ev.stopPropagation)`).
- **The rail is PINNED OPEN for the duration** (so page entries are visible to spotlight); the
  pre-tour pin state is captured in `_tourRailPinPrev` and **restored on `tourStop`** via `railTogglePin`.
- **Exactly one element dims the screen at a time.** Anchored steps use `#tour-spot`'s giant
  `box-shadow` (transparent hole over the item — works regardless of the rail's z-index because the
  cutout is genuinely transparent); center/menu steps hide the spot and show `#tour-overlay` (a flat
  backdrop). Showing both would dim the highlighted item too — `tourPlaceSpot` toggles between them.
- **Keyboard is a CAPTURE-phase listener** (`addEventListener('keydown',…,true)`): while active it
  handles ←/→/Esc/Enter and **`stopPropagation()`s every key** so boot.js's bubble-phase app
  shortcuts (n/s/p/o/1/2/3/…) don't fire underneath the tour. Capture + stopPropagation is what
  blocks the later bubble listener on the same `document` target.
- **DOM built lazily** (`tourBuildDOM` on first `tourStart`) — its overlay/spot/pop are appended at
  use, so the nav-rail boot-timing trap (overlays after `{{JS}}` not yet in the DOM at boot) doesn't
  apply. z-index: overlay 1189 < spot 1190 < pop 1200 (above the rail's 1000 and modals' 1100).
- **Grid blow-out gotcha (bit this build):** the menu's 2-col card grid overflowed the popup because
  a long nowrap page-list has `min-width:auto` intrinsic width — same trap the export section
  documents. Fixed with `min-width:0` on `.tour-card` (+ `overflow:hidden;text-overflow:ellipsis` on
  the sub-line). Launched from a `#help-tour-launch` button at the top of `#help-overlay`; `?` still
  opens Help (the tour is one click inside it), not the tour directly.

Verified in-browser end to end (real UI): hub renders 6 cards, basics + domain tracks navigate via
`railGo` and spotlight the correct rail item, res-tab views (nine-box) open, end-of-track returns to
the menu, `tourStop` restores the rail pin, the Help launcher opens the tour + closes Help, app
shortcuts are suppressed while active, ←/→/Esc work, no console errors.

---

## Export engine (src/core/export.js)

The shared pipeline every "deliverable" export goes through — see
`matrix/OUTPUT-LAYER-PLAN.md` for the original roadmap. **Scope, decided explicitly with the
user after an app-wide audit found ~40 export functions (not the handful the plan assumed):**
only the ~22 *visual/print* deliverables (PDF/PNG/SVG/HTML — profiles, dashboard, disc,
nine-box, org, gantt, skills, charter, exec) migrate onto this engine; the ~15 plain CSV/JSON
data dumps (roster, full backup, plan CSVs) stay as they are — they're raw data, not themed
deliverables, and don't need a cover/theme/template. **Migrated so far: exec pack (D1) and
ALL FOUR profile-related deliverables** (single profile, profiles dashboard, "full profiles"
one-page-per-person, project brief) — see *profiles.js: full builder migration* below. The
rest (disc/nine-box/org/gantt/skills PDFs, charter deck/synopsis D2/D3) remain on their old
hand-rolled `document.write`/canvas paths.

**Second-pass rework (2026-07-20, same day as the profiles.js migration):** the first pass of
the profiles.js migration only moved the document *shell* (branding/print-CSS) onto the engine
and left each export's content/theme/format exactly as fixed as before. User feedback: *"clicking
PDF export from profiles doesn't give choices, no themes, the layout is different, it still
opens a print dialog"* — i.e. it didn't actually deliver the "same options and drag-and-drop as
the Executive Summary" the user wanted. Fixed by (a) removing the auto-triggered print dialog
engine-wide, (b) adding FORMAT and COLUMNS controls to the shared builder, and (c) a new
`composeRender` escape hatch so *every* profile deliverable — not just exec.js-shaped ones —
can go through the full drag-and-drop builder. See [[output-layer-export-engine]] in memory for
the two-pass history.

Two layers:

1. **The shell** — `exportBrand`/`exportField`/`exportHTML`/`exportOpen`. Produces the actual
   popup document, now with a manual print button instead of an auto-triggered dialog (see
   below).
2. **The builder** — `exportOpenBuilder` + `exportBuilder*`. A drag-and-drop modal
   (`#export-builder-overlay`) a deliverable opens INSTEAD of calling `exportOpen` directly,
   so the user picks *which* blocks go in, their order, the theme, the output FORMAT and (where
   configured) the grid COLUMN count before anything is generated.

**Third pass — shell hardening (2026-07-21).** Before migrating any further deliverable, the
shell itself was audited and fixed, so every future migration inherits the result instead of
multiplying the defects. Decided with the user: harden first, then packs, then the remaining
migrations (dashboard, nine-box/DISC, skills/SPOF, org + gantt). What changed:

| Was | Now |
|-----|-----|
| "Running footer" printed **once**, after the last page; no page numbers at all | `.ex-foot` is `position:fixed` under `@media print` so it genuinely repeats; a per-page `.ex-pagehead` carries `org — title` + an accurate `N / M` |
| Cover page mandatory; every block forced onto its own sheet | `cover` toggle + `layout:'page'|'flow'` (flow keeps sections together with `break-inside:avoid`) |
| `orientation`/`pageSize` hardcoded per deliverable | a PAPER select (A4/A3 × portrait/landscape) in the builder |
| Builder reset every choice on each open | `exportLoadLast`/`exportSaveLast` per `deliverableId` |
| No preview — theme/layout/order were guesswork until a tab opened | live debounced `<iframe srcdoc>` preview + a page-count note |
| One throwing block killed the whole export silently | per-block try/catch; the failed section says so in place, the rest renders |
| `canvas.toBlob` null unchecked → a `.png` containing the text `"null"` | null guard + canvas dimension/area clamp (`_exportSafeScale`) |
| PNG/SVG regex-scraped `<style>`/`<body>` back out of the finished document | `exportHTMLParts()` returns `{css, body}`; both consumers build from the parts |
| Fixed 200/300 ms waits before measuring height | `_exportMeasure` waits on `document.fonts.ready` (with its own 2.5 s cap) |
| Block ids interpolated raw into inline handler strings | handlers take the element, id read back off `data-id` |
| Date hardcoded `toLocaleDateString('en')` | `exportDateStr()` via `i18nDate` (EN/FR/ZH) |
| `orgName`/`logo` read by `exportBrand` but **unsettable** — dead white-label seam | Settings › EXPORT BRANDING (name + logo upload, 200 KB cap, staged so CANCEL cancels) |

Filenames are now date-stamped (`exec_summary_2026-07-21.pdf`) so repeat exports sort and
don't collide as `pack (1).pdf`.

### Key facts (non-obvious)

- **`exportHTMLParts(spec)` is the real builder; `exportHTML` is a thin composer over it.**
  Rasterize/SVG need the CSS and body separately, and used to get them by regex-scraping the
  document string they had just been handed — which captured only the FIRST `<style>` block.
  Anything needing the halves should call `exportHTMLParts`, never re-parse `exportHTML`.
- **Page numbers are stamped at BUILD time, and only in `layout:'page'`.** Chromium does not
  support `@page` margin boxes, so `counter(page)` is unavailable — a browser-generated
  "page N of M" is impossible. In page layout each `.export-page` is exactly one sheet, so
  the stamped number is correct by construction. In `flow` layout the browser decides the
  breaks, so **no number is claimed** rather than printing a wrong one. Don't "fix" this by
  adding a counter; verify any change against a real print preview.
- **The builder preview is an `<iframe srcdoc>`, which EXECUTES inline script.** That is safe
  only because `exportHTML` has been script-free since autoprint was removed (the print button
  is an `onclick` attribute, not a script block). The iframe also carries
  `sandbox="allow-same-origin"` without `allow-scripts` as the second line of defence. **If you
  ever put a `<script>` back into the export shell, this preview starts running it on every
  keystroke** — see the "Verify gotcha" bullet below for how that bit this migration twice.
- **Last-used selection vs. saved template are different things, deliberately.** A *template*
  is named and explicitly re-appliable (`EXPORT_TEMPLATES_KEY`); *last-used* is the implicit
  memory of the whole picker state (`EXPORT_LAST_KEY`, per `deliverableId`) so re-exporting the
  same deliverable isn't a fresh setup every time. A restored selection **drops block ids that
  no longer exist** and falls back to the deliverable's default template if nothing survives —
  the same reconcile-don't-migrate idea as `railApplyOrder`.
- **`vh`/viewport units are poison in the raster (PNG) and SVG paths — `EXPORT_RASTER_CSS_FIXUP`
  neutralises them.** Those paths render the export document inside an SVG `<foreignObject>`
  whose height is the WHOLE document, so a `vh` unit resolves against the entire image, not one
  page. The cover's `min-height:70vh` (correct on screen/print) therefore ballooned to ~70% of
  the image and shoved the content below it off the bottom — a landscape-A3 analytics chart lost
  ~35–40% of its height, i.e. *"the PNG shows only half the page"*. It compounds: `_exportMeasure`
  measures inside a **10px-tall** iframe, where the same 70vh instead collapses to ~7px, so the
  captured canvas height is wrong in the OTHER direction too. `_exportMeasure` appends
  `EXPORT_RASTER_CSS_FIXUP` (`.ex-cover{min-height:200px!important}`) to the shared CSS so the
  cover is a fixed px height and measure/render agree. **Any future export CSS that reaches these
  paths must stay free of `vh`/`vw`/`vmin`/`vmax`** — a single image has no page-viewport to
  resolve them against. Guarded by a test in [tests/export.test.js](tests/export.test.js).
- **Unlike every other section file, `export.js` genuinely `import`/`export`s** (`escH`/
  `safeColor` from [helpers.js](src/core/helpers.js), `t` from [i18n.js](src/core/i18n.js))
  instead of relying on bundle-scope bare globals. The `export` keywords are stripped by
  build.js like everywhere else, but the real imports mean the pure half of this file — unlike
  exec.js/charter.js/profiles.js — can be `import`ed directly by a Node test (mirrors how
  [helpers.js](src/core/helpers.js) is tested). See [tests/export.test.js](tests/export.test.js).
  The builder half (`exportOpenBuilder`/`exportBuilder*`) is UI-only (reads `G()`/`document`)
  and is NOT exported/tested — same convention as every other section file's DOM code.
- **Theme is now a real user choice, not a hardcoded default.** Settings has an "EXPORT
  THEME" field (`#set-export-theme`, wired in `railOpenSettings`/`railSaveSettings`) —
  `'app'` (matches the live on-screen palette, the default) or `'light'` (the print-friendly
  paper palette, `EXPORT_PAPER`). Persisted in `exportLoadPrefs().theme` (own localStorage key
  `eim_export_prefs`, `EXPORT_PREFS_KEY` — UI-only, NOT app state/backups, mirrors the nav
  rail's `eim_rail_prefs` pattern but deliberately a separate key so export branding isn't
  coupled to nav layout). Each individual export can override the Settings default via the
  builder's own THEME select (`exportBrand({theme:'light'})` beats the saved default — see
  `exportBrand`'s opts.theme precedence). **The first pass of this file shipped with the
  default silently hardcoded to `'light'` and no way to change it** — that's what triggered
  the rework; don't reintroduce a hardcoded theme default outside this one Settings field.
- **`exportPalette()` is defensively wrapped** (`try{getComputedStyle(...)}catch`) so
  `exportBrand()`'s `'app'` path — which is now the DEFAULT, unlike before — stays callable
  from a Node test with no DOM; falls back to the same hardcoded dark values `getComputedStyle`
  would have returned anyway.
- **Theming trick: pages are NOT re-styled for export.** `exportHTML` writes the brand
  palette as CSS custom properties (`--bg/--surface/--border/--text/--muted/--dim/--accent/
  --accent2/--danger/--warn`) on the popup document's `:root`, so any on-screen builder that
  already renders via `var(--…)` — `pfSection`/`pfKpi`/`pfEmpty`/`pfTreemapSvg`, the `xs*`
  KPI/chart functions in exec.js — drops into an export page **completely unmodified**,
  themed either way depending on which palette got written. A couple of the reused exec.js
  builders (`xsSpendSection`'s toggle buttons, `xsAttention`'s `railGo` click) carry `onclick`
  handlers that don't exist in the popup document — deliberately left in, they no-op
  harmlessly since nobody clicks a printed/exported page.
- **Content control: a per-deliverable block registry + templates, not a fixed page list.**
  A deliverable builds an array of `{id, label}` (or `{id, label, render(ctx)}`) blocks — e.g.
  `xsExportBlocks()` in [exec.js](src/sections/exec.js) wraps `xsScorecard`/`xsSpendSection`/
  `xsBubbleSvg`/`xsBurnSvg`/`xsAttention` — plus a couple of **built-in templates** (named,
  ordered subsets, e.g. `'full'`/`'summary'`). `exportOpenBuilder` merges those built-ins with
  any **custom templates** the user has saved for that `deliverableId`
  (`exportLoadCustomTemplates`/`exportSaveCustomTemplates`, own localStorage key
  `eim_export_templates` = `EXPORT_TEMPLATES_KEY`, `{[deliverableId]: [{id,name,blocks}]}` —
  malformed entries are dropped defensively on load, not thrown). Built-in templates are
  never persisted (the caller supplies them fresh every open); only what the user explicitly
  names via "Save template" is written to storage, and only for that one deliverable.
- **Two block-composition modes — pick per deliverable.** *Default* (exec.js): each included
  block IS one page (`pages = included.map(id => block.render(ctx))`) — good for independent
  report sections. *`composeRender(includedIds, ctx)`* (profiles.js, ALL four of its
  deliverables): the deliverable gets the ordered included-id list itself and builds the final
  page(s) however it needs — e.g. one page of MANY cards where every card honours the SAME
  included field list, or one page per entity. Return a string (one page) or an array of
  strings (pages); `exportBuilderRun` normalises either way. This is what let profiles.js reuse
  the builder for "one toggle applied uniformly across N repeated cards", which doesn't fit the
  default "one block = one page" model at all.
- **FORMAT and COLUMNS are opt-in per-deliverable builder controls**, both hidden by default
  (`#exb-format-row`/`#exb-columns-row` `display:none`) so exec.js (single PDF format, no grid)
  renders identically to before. `formats:[{id,label}]` (default just `[{id:'pdf'}]`) shows a
  FORMAT select when there's more than one; `exportBuilderRun` branches: `'pdf'` → `exportOpen`,
  `'html'` → `exportDownloadBlob(exportHTML(...))`, `'png'`/`'svg'` → `exportRasterize`/
  `exportToSVG` (see below). `columns:{default,options:[...]}` shows a COLUMNS select and
  exposes the chosen number as `ctx.columns` to `render`/`composeRender` — added specifically
  because the profiles dashboard's 3-column grid used to be hardcoded with no way to change it
  (a real user complaint: *"it's 3 per row compared to more before"*).
- **`exportRasterize`/`exportToSVG` generalise what used to be profiles.js-only PNG/SVG
  converters** (hidden iframe → SVG `foreignObject` → canvas for PNG, or a standalone SVG
  wrapper) into shared, deliverable-agnostic functions any builder's `formats` list can offer.
  `exportDownloadBlob` is the one Blob+`<a>`+click download helper everything routes through.
  Both hide the shell's print button first (`_exportHideChrome`, forces `.no-print` off even
  outside `@media print`) so it doesn't get baked into the captured image.
- **Drag-and-drop is native HTML5 DnD** (`draggable`+`dragstart`/`dragover`/`drop`, the same
  idiom as `xsScheduleSection`'s week-planner chips and the rail's page-reorder — see
  *Navigation shell*), not a library. Available↔Included is `dataTransfer` carrying the block
  id; reordering **within** Included uses a pointer-Y-vs-sibling-midpoint insertion-index
  calculation (`exportBuilderDropIndex`) — standard vanilla-JS sortable-list technique,
  best-effort (not pixel-perfect when a chip is dropped back among its own immediate
  neighbours). Every drag action has a **non-drag equivalent** (click an Available chip to
  append it; ✕ button to remove an Included one) so the picker doesn't require successfully
  completing a drag gesture. `_exportBuilderState`/`_exportDragId` are module-scoped, one
  builder session at a time (matches the app's other single-open-modal patterns).
- **`export-builder-overlay` is a rail-spawned modal**, `left:var(--rail)` inset like
  `#settings-overlay`/`#landing-firstrun` (nav.css); z-index `1110`, one above the picker that
  hands off to it. It is in `RAIL_MODAL_OVERLAYS`, which — contrary to what this bullet used to
  claim — only suppresses Esc's *back-navigation*; the actual closing needs an entry in boot.js's
  Esc chain (added in the fifth pass, see above). Defined after `<!-- {{JS}} -->` in index.html like `#cht-deck-overlay`/
  `#brief-overlay` — safe because it's only ever touched by a user-triggered `exportOpenBuilder`
  call well after boot, never at boot time (the nav-rail boot-timing trap doesn't apply here).
- **`print.css` vs `EXPORT_PRINT_CSS` are two different mechanisms for two different
  documents**, kept in sync by hand (commented cross-reference in both files): `print.css`
  (bundled into `matrix.html` itself) governs printing the **live app in place**
  (`window.print()` with no popup — the charter deck's `body.cht-printing` flow in
  [charter.js](src/sections/charter.js)); `EXPORT_PRINT_CSS` (a JS string in export.js)
  governs the **popup document** `exportOpen` writes, since that's a separate document that
  never loads the bundle's stylesheet. Both carry the same rule: `-webkit-print-color-adjust:
  exact` (+ standard) or backgrounds/badges silently drop out when printed.
- **XSS-safe by construction, not by a central sanitiser.** `exportField(label,value)`
  escapes both sides internally (`escH`) — the "safe path is the easy path" per the XSS
  section above. `exportHTML` itself `escH`s title/subtitle/brand.name/brand.logo and
  `safeColor`s every palette entry it writes into `:root`. Page *content* is the caller's
  responsibility, same as the rest of the app's `innerHTML` string-building — there is still
  no framework-enforced escaping, `exportField`/`escH`/`safeColor` are just the provided
  choke point.
- **No more auto-triggered print dialog.** The first pass of this engine had `exportOpen`
  inject a `window.addEventListener("load",...setTimeout(window.print,450))` script — a print
  dialog popped the instant ANY export tab opened, including exec pack. User feedback: *"it
  still opens a print option when opening the PDF"* — removed engine-wide. `exportHTML` now
  embeds a `.no-print` **manual** "🖨 Print / Save as PDF" button (fixed top-right,
  `.no-print{display:none}` under `@media print` so it never appears on the printed/saved
  output itself); `exportOpen` no longer writes any script at all. Applies to every deliverable
  automatically — nothing in exec.js/profiles.js changed to get this.
- **Verify gotcha — `alert()`/`confirm()`/`window.print()` all block the WHOLE tab, including
  automation.** `exportOpen`'s pop-up-blocked alert, `exportBuilderDeleteTemplate`'s confirm,
  and now the print button's `window.print()` all freeze the page (and hang
  `javascript_tool`/`computer` calls against it) until dismissed; a captured `exportOpen()`
  string rendered into a live `<iframe srcdoc>` will actually EXECUTE any inline script inside
  it, so if you forget to strip an old autoprint trigger before iframe-rendering a captured
  string, it fires `window.print()` for real and hangs the tab (bit this exact migration twice —
  once from a stale captured string, once from an unstubbed `alert()` in a project-brief guard
  clause). Stub `window.alert`/`window.confirm` before calling any real export entry point, and
  when testing `exportRasterize`/`exportToSVG`/`exportDownloadBlob`, **restore**
  `URL.createObjectURL` after wrapping it in a test — wrapping it twice across two test calls
  without restoring causes infinite self-recursion (`RangeError: Maximum call stack exceeded`).
  Real popups are also blocked by the automation browser by default — `exportOpen`'s
  `window.open` returns null there — so in-page verification (mocking `window.open` to capture
  the written HTML, mocking `URL.createObjectURL` to capture a downloaded Blob's text, or
  rendering `exportHTML()`'s output into an `<iframe srcdoc>`) is the reliable way to inspect
  an export's output.
- **Charter deck/synopsis (D2/D3) still don't use this engine** — `chtOpenDeck`/
  `chtPrintDeck`/`chtOpenSynopsis` in [charter.js](src/sections/charter.js) render into the
  `cht-deck-overlay`/`cht-syn-overlay` placeholders using the in-place `window.print()` +
  `body.cht-printing` mechanism, not a popup. Per the scope decision above, migrating them is
  optional future work, not required — they're a legitimate, working, differently-themed
  (live app theme, since they print the live DOM) deliverable in their own right.
- **`exportHTML` takes a `pageSize` option** (`'A4'` default, `'A3'` for wide multi-column
  content) alongside `orientation` — added for the profiles dashboard's multi-column card grid,
  which needed more width than A4 landscape gives.
- **`exportHTML`'s base CSS forces `overflow-wrap:break-word;word-break:break-word` on `*`,
  globally, for every deliverable.** Real bug (screenshot from the user): the profiles
  dashboard grid had one card visibly MUCH wider than the rest — caused by a long unbroken
  string (a URL in that person's notes) forcing its CSS grid column past its `1fr` share,
  since grid tracks default to `min-width:auto` = "never shrink below the content's intrinsic
  minimum width", and a token with no space/slash to break at has an intrinsic width equal to
  its full rendered length. Two-part fix: this `overflow-wrap` rule (shell-level, protects
  every deliverable's free-text fields at once) + `min-width:0` on the profiles dashboard's
  per-card grid-item wrapper (see *profiles.js* below — grid-specific, can't be fixed at the
  shell level since exportHTML doesn't know which deliverables use a multi-column grid).
  Reproduced and verified with the exact reported names/data shape before AND after the fix
  (before: one column ~2x the others + horizontal scrollbar; after: equal columns, long URL
  wraps within its card). Test: [tests/export.test.js](tests/export.test.js).
- **`.export-page`'s `max-width` depends on `pageSize`: 920px for A4 (every single-column
  deliverable), 1600px for A3.** Second real bug from the SAME user report, surfaced only
  after the grid-column fix above: with the fixed-width 920px page, a 5-column card grid
  ("why so small and tight?") had ~150px per column — comfortably-sized field values like
  "Permanent" or "EN, FR, DE" were forced to wrap mid-word for lack of room, even though
  nothing was technically overflowing anymore. 920px was never meant for a wide multi-column
  grid — it's a single-document-column width, fine for exec pack/single profile/all-profiles/
  brief, wrong for the profiles dashboard. 1600px matches the PNG/SVG raster width already
  used for that same deliverable. Verified numerically (not just visually) with
  `getBoundingClientRect` inside a hidden iframe: 5 equal 251px-wide columns at 1600px, and
  confirmed "Permanent" renders as one whole word, not split. Test:
  [tests/export.test.js](tests/export.test.js).

### profiles.js: full builder migration (all four deliverables, second pass)

[src/sections/profiles.js](src/sections/profiles.js) went through the engine TWICE in one
session. **First pass (rejected by user):** shell only (`exportHTML`/`exportBrand`/`exportOpen`)
— kept every export's fixed content/layout/hardcoded format, just swapped the document
boilerplate. User feedback made clear that wasn't the ask: *"I want the same type of options and
drag and drop than the executive summary."* **Second pass (current, shipped):** all four
profile deliverables now open the SAME `exportOpenBuilder` picker exec.js uses — content
blocks, theme, format, and (dashboard only) columns, all before anything is generated.

- **One shared block registry, one shared card renderer, four thin callers.**
  `prfCardBlocks()` returns six content toggles — `basic`/`compGrade`/`skills`/`spof`/`notes`/
  `matrices` — and `buildProfileCardHTMLs(engs, includedBlocks)` is the ONE function that
  renders a card, walking `includedBlocks` **in the order given** and switching on each id. A
  block excluded from the picker is excluded from **every card on the page**, and reordering
  blocks in the picker reorders the fields **within each card** — this is the `composeRender`
  pattern (see *Key facts* above) doing real work: profile "blocks" aren't independent pages,
  they're per-entity field-group toggles applied uniformly across N repeated cards.
  - `profileExportOpen(engId)` — single profile. `composeRender` wraps one card at 440px.
    `formats:[pdf,svg]` (matches what existed before), no columns control.
  - `exportProfilesDashboardOpen()` — the card grid. `composeRender` builds a
    `grid-template-columns:repeat(ctx.columns,1fr)` wrapper around N cards.
    `formats:[pdf,html,png,svg]`, `columns:{default:3,options:[2,3,4,5]}`, A3 landscape.
  - `profilesExportAllOpen()` — one full page per person. `composeRender` returns an ARRAY (one
    440px-wrapped card per engineer), so the shell's `.export-page`/page-break machinery does
    the pagination for free. `formats:[pdf]` only (matches what existed before).
  - `exportProjectBriefOpen()` — the project brief. Blocks are `team`/`risks`/`todos`/
    `milestones`/`actions` (what used to be five checkboxes — `brief-include-team` etc. — INSIDE
    the brief panel; now inside the shared builder instead, so the brief panel only handles
    project SCOPE, not content). `buildBriefProjectBlock(p, includedIds, shared)` is the
    per-project renderer (`shared` = pre-computed `{axName,yLabel,projAllocMap}`, built once by
    `composeRender` before mapping over the selected projects — KPIs are always shown; only
    team/risks/todos/milestones/actions are gated). `formats:[pdf,html]`.
- **Card markup is 100% `var(--…)` tokens now, no `vars`/`palette` parameter threading.**
  Because `exportHTML` always writes the brand palette onto the popup document's `:root` (the
  "theming trick" above), `buildProfileCardHTMLs`/`buildBriefProjectBlock` don't need a palette
  argument at all — the exact same markup string is correct under any theme the builder's
  THEME select picks. This ALSO fixed a latent inconsistency: the old `profilesExportAllPDF`'s
  private card builder hardcoded light-mode hex colors (`#888`/`#555`/`#1a1a2e`) regardless of
  theme — now gone, replaced by the same `var(--muted)`/`var(--text)` tokens every other card
  uses.
- **Fixed two real (pre-existing) issues along the way:** (1) the profiles-dashboard group-name
  filter label was interpolated with no `escH()` anywhere on its old hand-rolled path — closed
  by `exportHTML` escaping the whole subtitle string once; (2) several color badges (Matrices
  pill, compa-ratio, risk RPN/status) used raw hex-plus-alpha-suffix tricks (`V.accent+'1a'`)
  that don't work with CSS custom properties — replaced with solid `var(--accent)`/`var(--warn)`
  backgrounds, a minor visual simplification (solid pill vs. translucent) traded for theme
  correctness.
- **Old brief-panel checkboxes removed from index.html**: `#brief-include-team/risks/todos/
  milestones/actions` are gone (the picker replaces them); the panel's two export buttons
  (`↓ EXPORT PDF` / `↓ HTML`) collapsed into one `📄 EXPORT` that opens the builder. Similarly
  in the Profiles tab: the four dashboard format buttons + "PDF (full profiles)" collapsed into
  two buttons (`📄 Export dashboard`, `📄 Export full profiles`); each card's `↓PDF`/`↓SVG`
  buttons collapsed into one `📄 Export`. CSV stays untouched (out of scope, unchanged).
- **`exportProfilesDashboardOpen`'s grid-item wrapper sets `min-width:0`** — the grid-specific
  half of the equal-column bug fix described in *Key facts* above (`overflow-wrap` alone fixes
  the TEXT wrapping; `min-width:0` is what makes the GRID actually honour equal `1fr` tracks
  regardless of content). Without it, one card with a long unbroken notes URL visibly grew
  ~2x wider than its siblings — this was reported against a real screenshot and reproduced
  exactly (same names/data shape) before confirming the fix.
- **Verified in-browser end to end**, driving the REAL UI (not just calling functions): opened
  each of the four builders via their actual buttons, changed FORMAT/COLUMNS/theme, removed a
  block via the picker's ✕, and confirmed via a captured/downloaded-blob check that the
  resulting HTML actually reflects the choice (grid column count, block presence/absence, theme
  palette, print button present and no auto-print script). Exec pack re-verified unaffected
  (format/columns rows correctly stay hidden when a deliverable doesn't configure them).
  `node build.js` + `node --test tests/*.test.js` green (179 tests).

### Fifth pass — cross-view packs + the global Export door (D5, 2026-07-21)

New file [src/sections/packs.js](src/sections/packs.js), last in `JS_FILES` before boot.js. It
sits **on top of** the engine, never inside it: `export.js` stays deliverable-agnostic and
Node-testable (it has real ESM imports), packs.js is where app knowledge is allowed.

- **`exportDeliverables()` — one registry, used by the rail's new `Export` utility action**
  (`RAIL_UTIL`, `railAction('export')` → `exportOpenPicker()`; overlay `#export-picker-overlay`).
  Each view still keeps its own Export button — the global picker is a *second* door for people
  who know what they want but not where it lives, not a replacement.
  - Every entry carries `ready` + `missing`. A deliverable with no data is **still listed** but
    greyed, showing what's missing ("Place people on the nine-box or DISC first") — discoverable
    before there is data, instead of an empty menu or an alert after the click.
  - **Project-scoped deliverables (Gantt, project brief) are deliberately NOT listed.** They
    export whichever project happens to be open, which is meaningless from a global menu; they
    keep their button on their own view where the scope is unambiguous. The picker says so in a
    footnote rather than leaving it a mystery.
- **Packs are not a new rendering path** — a pack is the ordinary `exportOpenBuilder` handed a
  *merged* block list, so it inherits templates, theme, paper, layout, preview and per-block
  error isolation for free. `packBlocksFrom(prefix, sourceLabel, list)` namespaces another
  section's registry (`nb.grid`, `disc.quadrants`) so several can merge without id collisions,
  and relabels them "Nine-box — Grid" so a chip in the picker says which view it came from.
  Three packs: **Talent review** (nine-box + DISC + profiles), **Organisation** (org + profiles),
  **Board** (exec + org headcount + nine-box distribution).
- **Profiles is the one registry that cannot be merged as-is.** Its blocks are per-person FIELD
  TOGGLES consumed via `composeRender` (one block applies to every card), not independent pages —
  merging them into a page-per-block pack would be meaningless. `packProfileCardsBlock()` wraps
  the whole card grid as a single block instead, reusing `buildProfileCardHTMLs` with a fixed
  field set. **Any future registry that uses `composeRender` needs the same treatment.**
- **Esc bug found and fixed (pre-existing, and this doc was wrong about it).** The note below
  used to claim `export-builder-overlay` was added to `RAIL_MODAL_OVERLAYS` "so Esc closes it
  first". It doesn't: that list only makes `railAnyModalOpen()` true, which **suppresses Esc's
  back-navigation** — it never closes anything. Every modal needs its own closer in boot.js's Esc
  chain, and the builder had none, so Esc did nothing to it. Both export overlays are now in that
  chain. **If you add a modal, put it in RAIL_MODAL_OVERLAYS *and* in the boot.js Esc chain — they
  do different jobs.**
- z-index: picker `1100` (the settings/modal tier), builder `1110` — the picker hands off to the
  builder, so the builder must sit above it.

### Sixth pass — People Analytics (2026-07-21)

The hardest migration so far, and the one that stretched the engine most. Two structural
differences from every prior deliverable:

**1. The first DATA-DERIVED block registry.** `anExportBlocks()` walks
`ANALYTICS_TEMPLATES.filter(isStoryView)` and emits one block per story view (`story.<id>`)
rather than hand-listing them — so a story view added to that array becomes exportable with no
wiring, matching the panel's own "add a template, it auto-appears" contract. Plus `scorecard`,
`insights` and `compare` = 13 blocks. Story views already return `{chart, stats}`, which is
almost exactly the block contract, so the adapter (`anExportChart`) is a heading + the chart +
`anSummaryStats`.

**2. Per-deliverable `controls` (new engine capability).** Analytics' compare mode is
combinatorial (dimension × dimension × template), so there is no fixed block for "the chart you
built". `spec.controls` renders extra pickers into `#exb-controls`; values merge into `ctx` (both
spread and under `ctx.controls`) and persist with the last-used selection.

- **`controls` may be an ARRAY or a FUNCTION of the current values**, re-evaluated on every
  change. The function form exists precisely for analytics: the CHART list depends on the two
  dimensions chosen above it, exactly as the panel's own template cards do.
- `exportBuilderControls()` **clamps** every value on read — a stale last-used value, or one
  invalidated by another control changing, falls back to the spec's default instead of silently
  rendering nothing.
- Defaults mirror `_anState`, so "export what I'm looking at" is the zero-click path while still
  being overridable in the picker.
- **Caveat:** control values are spread into `ctx`, so a control id shadows a ctx key of the same
  name. Avoid `theme`/`columns`/`layout`, which the builder already writes.

**The palette problem — why the usual theming trick does NOT work here.** Analytics charts are
SVG *strings* whose colours land in `fill=`/`stroke=` **presentation attributes**, and CSS
`var()` is not valid there (only in `style` attributes or stylesheets). So writing the brand
palette onto the popup's `:root` — which is how every other migrated deliverable themes itself —
cannot reach these charts, and the light paper theme would have printed near-white text on white.
This is also why `anExportPDF` always forced a dark background.

Fixed by making the palette **swappable at its single definition point**: `AN_COLORS` is now
getters over `AN_SCREEN`/`AN_PAPER`, and `anWithPalette(theme, fn)` renders a block under the
paper variant (`try/finally`, so a throwing block — an expected path, since the engine catches
per-block errors — can't strand the on-screen panel in paper colours). **All 115 `AN_COLORS.x`
call sites are untouched and still emit real hex**, and `AN_COLORS` is used nowhere outside
analytics.js, so the swap is fully contained. Three literals that duplicated palette entries
(`DCOL` in the DISC story, the trajectory legend, the heatmap's contrast ink) were routed through
`AN_COLORS` — they were the only remaining dark-theme leaks. The heatmap's ink became a new
`onFill` entry: dark on *both* themes by design (it sits on a saturated cell), which is why it
isn't just `text` inverted.

Verified both directions: a paper export contains **no** screen-palette hex and an app-theme
export contains **no** paper hex; the on-screen panel is byte-identical after an export runs.

**`anExportCSV` is untouched** — a flat data dump, out of scope by the standing decision. The
`↓ PNG`/`↓ PDF` buttons collapsed into one `📄 EXPORT`; `↓ CSV` stays beside it.

### Bug fix (2026-08-20) — `vh` clipped PNG/SVG exports to ~half the page

**Symptom (user report):** a PNG export of a People-Analytics custom/compare chart showed only
the top half of the page. Reproduced first as an isolated mechanism, then confirmed against the
**real bundled `exportHTMLParts`** in-browser: a landscape-A3 cover+chart lost **414px (~35%)** off
the bottom before the fix, **0px** after.

**Root cause — a viewport-unit mismatch across the two contexts `_exportMeasure` straddles.** The
PNG (`exportRasterize`) and SVG (`exportToSVG`) paths render the export document inside an SVG
`<foreignObject>` whose height is the **whole document**, so any `vh` resolves against the entire
image, not one page. The cover carries an inline `min-height:70vh` (correct on screen and in print,
where it fills a page). In the single image it instead ballooned to ~70% of the *whole* image and
shoved the chart below it off the bottom. It compounds in the opposite direction at measure time:
`_exportMeasure` measures inside a **10px-tall** iframe, where that same `70vh` collapses to ~7px,
so the captured canvas height is also too short. Two wrongs, same unit.

**Fix (shell-level, one line of CSS).** New exported constant
`EXPORT_RASTER_CSS_FIXUP = '.ex-cover{min-height:200px!important}'`, appended to the shared CSS
inside `_exportMeasure` (alongside the existing `.no-print` rule). It pins the cover to a fixed px
height so measure and render agree and the cover cannot balloon. Because the fixup lives in the
shared measure step, it protects **every** deliverable's PNG/SVG at once — not just analytics.
See the `vh`/viewport-unit bullet under *Key facts* for the standing rule (no `vh`/`vw`/`vmin`/`vmax`
may ever reach these paths — a single image has no page-viewport to resolve them against). Regression
test in [tests/export.test.js](tests/export.test.js) (33 export tests, 207 total, all green).

**How this was found (method worth repeating):** the two-context height mismatch was measured
empirically — render the exact `exportHTMLParts` output into a 10px-tall iframe (what
`_exportMeasure` does) *and* into an iframe sized to that measured height (what the foreignObject
becomes), then diff `body.scrollHeight`. A raster export that "looks clipped" is almost always this
measure-vs-render disagreement, not a canvas-size cap (that path is already guarded by
`_exportSafeScale`).

### Next: migrating another deliverable onto this engine (recipe)

Two deliverables use the engine now — exec.js (default per-block-page mode) and profiles.js
(all four via `composeRender`, per the pattern above). Pick whichever mode fits: independent
report sections → default; a per-entity field-group toggle repeated across many cards/pages →
`composeRender`. To move another visual export onto it (disc.js/ninebox.js/org.js/skills.js
PDF, or charter.js deck/synopsis are what's left):

1. Find its current builder function(s) — the thing that returns/writes the HTML. Identify the
   distinct visual chunks inside it — each becomes one block (a picklist item), OR if the
   deliverable repeats one unit many times (like profiles.js cards), identify the per-unit
   field-groups instead.
2. Write a `<prefix>ExportBlocks()` function returning `[{id, label}, ...]` (add `render(ctx)`
   too only if using the default per-block-page mode). Reuse the SAME on-screen rendering
   function wherever possible — per the "theming trick", `var(--…)`-based output just works
   once the palette is on `:root`, no palette-argument threading needed (see profiles.js's
   `buildProfileCardHTMLs` for the pattern).
3. Replace the old export function's body with a call to `exportOpenBuilder({deliverableId,
   title, subtitleDefault, blocks, ctx, builtinTemplates, formats, columns, composeRender})`.
   Only pass `formats`/`columns` if the deliverable actually needs them (they stay hidden
   otherwise). Keep the OLD function name so existing `onclick="..."` wiring doesn't need to
   change, UNLESS you're also consolidating multiple old buttons into one (as profiles.js did —
   fine to rename/collapse buttons when several old ones all open the same new picker).
4. If the deliverable previously had separate PNG/SVG functions, fold them into the SAME
   builder's `formats` list (`exportRasterize`/`exportToSVG` handle the conversion) instead of
   leaving them on a separate code path — this is what "same options as the others" means to a
   user; don't reintroduce a second, differently-themed export button for the same content.
5. If the deliverable exposes filters the old function read directly (e.g. `#prf-fullmode`) —
   read those into `ctx` at call time, same as exec.js reads `getMonthRange()`/`ecDataset()`.
6. Add/extend tests in the SAME style as the existing ones (pure block-registry logic isn't
   really testable — it's mostly DOM wiring — so this is more about not regressing
   `exportHTML`/`exportBrand`/template CRUD than adding new pure tests).
7. `node build.js && node --test tests/*.test.js`, then verify in-browser by driving the REAL
   UI (open the actual button, not just the function) — mock `window.open`/`alert`/`confirm`/
   `URL.createObjectURL` (restore it after!) per the "Verify gotcha" note above.

**Agreed direction (2026-07-21), in order:**

1. ~~Shell hardening~~ — DONE, see the third-pass table above.
2. ~~org + gantt + nine-box + DISC migrations~~ — DONE, see *Fourth pass* below.
3. ~~Packs + the global Export entry (D5)~~ — DONE, see *Fifth pass* below.
4. ~~People Analytics~~ — DONE, see *Sixth pass* below.
5. **Skills/SPOF + cost dashboard migrations** — the only ones left. The dashboard is hardest:
   it scrapes `#res-body` innerHTML and lifts `.db-*` rules off the live stylesheet, so it needs
   a real block registry, not a shell swap. When each lands, add its blocks to the relevant pack
   in [packs.js](src/sections/packs.js) and a row to `exportDeliverables()` — nothing else changes.

### Fourth pass — org, Gantt, nine-box and DISC migrated (2026-07-21)

Four more deliverables onto the builder, in the order agreed (cheapest first). Each collapsed
its two format buttons (`↓ SVG`/`↓ PNG`, `↓ PDF`/`↓ PNG`) into one `📄 EXPORT` that opens the
shared picker — the same consolidation profiles.js did.

- **Per-format `run` handlers (new engine capability, and the reason org/gantt were cheap).**
  `formats:[{id,label,run(o)}]` — when a format supplies `run`, `exportBuilderRun` calls it
  instead of the built-in pdf/html/png/svg branch, handing over
  `{spec, brand, ctx, included, filenameBase}`. This exists because **the org chart and the
  Gantt already emit something better than the engine's generic converters**:
  `orgBuildExportSVG`/`_ganttSVGString` produce NATIVE SVG (real vector shapes, org rasterises
  up to 8×), whereas `exportToSVG`/`exportRasterize` wrap an HTML document in a `foreignObject`.
  Forcing them through the generic path "for consistency" would have been a straight quality
  downgrade. The rule this establishes: **unify the CHROME (picker, branding, theme, paper,
  title, preview), never at the cost of the OUTPUT.** Verified the org SVG format still emits
  native vector (`<svg>` with `rect/path/line/text`, no `foreignObject`).
- **org.js** — `orgExportBlocks()` = `chart` + `headcount`; `orgExportOpen()`. `orgRenderKPI`
  was split so its body is now `orgKpiHTML()`, a pure string the export reuses verbatim rather
  than a parallel implementation that would drift. Formats: PDF (engine) + SVG/PNG (native
  `run`). A3 landscape.
- **modals.js (Gantt)** — `ganttExportBlocks()` = `chart` + `schedule` (a dated table merging
  milestones and actions); `ganttExportOpen()`. Formats: PDF (engine) + SVG/PNG (native `run`).
  The chart block strips the XML prolog (illegal mid-document) and swaps the fixed
  `width`/`height` for a `viewBox` so it scales to the page.
- **ninebox.js / disc.js** — `nbExportBlocks()` = `grid`/`distribution`/`unplaced`;
  `discExportBlocks()` = `quadrants`/`mix`/`unprofiled`. These are plain HTML, not native SVG,
  so they use the engine's own rasteriser — no `run` handler. `buildNineBoxHTML`/`buildDiscHTML`
  survive only because the legacy PNG functions still read them; nothing user-facing does.

**The theming bug this surfaced (worth understanding before migrating anything else).** Both
matrices rendered as a near-black block under the *light paper* theme — the thing the theme
exists to avoid. Two distinct causes, both "predates the engine, nobody re-checked":

1. The cells used `cell.colorSolid`/`q.colorSolid` — **opaque dark hex** (`#193d38`, `#2a1a19`).
   Every cell also carries `color`, the **translucent rgba tint** the on-screen grid uses, which
   composites over whatever background the chosen theme sets. Switched to `color`; correct on
   both themes from one markup string.
2. `_nbPeopleHTML`/`_discPeopleHTML` took a `forExport` flag that forked on **colour** as well as
   structure (`#1a1a1e`/`#e8e8ec`/`#0f0f11`). That fork predates the theme system and is exactly
   what it replaces. `forExport` now forks on **structure only** (no drag handles, no remove
   button, no "Drop here" placeholder); all colours are `var(--…)`.

Static *badge* colours (`#c8f135`, `#f14335`, the CORE PLAYER `#888`) are deliberately left —
they're the accent dots/labels, readable on both grounds, and are the category ARCHITECTURE's
XSS section already calls out as "not user data, leave them". **When migrating a deliverable,
grep its renderer for literal hex before assuming the theming trick applies** — a `var(--…)`
codebase can still hide a dark-only `forExport` branch.

**Exporting deliberately does NOT make sense for** (confirmed with the user, so a future session
doesn't "helpfully" add it): the CSV/JSON dumps (roster, full backup, plan CSVs, skill-risk CSV,
snapshot JSON — interchange data, a cover page on them is noise); Backlog & planner, Compare and
Heatmap (working surfaces whose value IS the interaction — a frozen copy is just a screenshot);
Collaborate/presence, Snapshots, Settings, Help, AI advisor (session and infrastructure state).
The change/audit log **does** warrant an export, but as evidence-grade CSV/JSON, not a themed
pack. "Summary" should become a *template* of the executive summary, not a second deliverable —
shipping both splits the mental model.

**Current state to hand off (2026-07-20):** exec pack (D1) and ALL FOUR profile deliverables
(single/dashboard/all-profiles/brief) fully on the builder, verified via the real UI. Charter
deck/synopsis (D2/D3) exist but independently, not migrated (optional). disc.js/ninebox.js/
org.js/skills.js PDF exports not started. Auto-print removed engine-wide (manual button now).
Settings theme control, the builder/template system, format/columns controls, and
`exportRasterize`/`exportToSVG` are all engine-level infrastructure — done once, reused by
every future migration for free.

### Files

- [src/core/export.js](src/core/export.js) — shell (`exportOpen`/`exportHTML`/**`exportHTMLParts`**/
  `exportBrand`/`exportField`/`exportDateStr`/`EXPORT_PRINT_CSS`/`EXPORT_PAPER`, `pageSize`/
  `layout`/`cover` options, running head+foot, manual print button) + builder
  (`exportOpenBuilder`/`exportBuilder*`, `composeRender` mode, `formats`/`columns`/`layout`/
  `paper`/`cover` controls, live `exportBuilderRenderPreview`, `exportBuilderComposeSpec` as the
  ONE compose path shared by preview and export, `exportLoadCustomTemplates`/
  `exportSaveCustomTemplates`, `exportLoadLast`/`exportSaveLast`) + shared download/rasterize
  helpers (`exportDownloadBlob`/`_exportMeasure`/`exportRasterize`/`exportToSVG`).
- [src/sections/exec.js](src/sections/exec.js) — `xsExportBlocks()` (the block registry) +
  `exportExecPack()` — default per-block-page mode, single PDF format.
- [src/sections/profiles.js](src/sections/profiles.js) — `prfCardBlocks()`/
  `buildProfileCardHTMLs()` (shared registry + renderer) + `profileExportOpen`/
  `exportProfilesDashboardOpen`/`profilesExportAllOpen` (single/dashboard/all-profiles, all
  `composeRender`-based) + `prfBriefBlocks()`/`buildBriefProjectBlock()`/
  `exportProjectBriefOpen` (the project brief). All four use `composeRender`.
- [src/index.html](src/index.html) — `#export-builder-overlay` (`#exb-format-row`/
  `#exb-format`, `#exb-columns-row`/`#exb-columns` added alongside the existing template/theme
  selects); `#brief-overlay`'s old include-checkboxes removed (content picking moved into the
  builder), its two export buttons collapsed to one.
- [src/sections/railnav.js](src/sections/railnav.js) — Settings › EXPORT THEME **and EXPORT
  BRANDING** wiring (`railOpenSettings`/`railSaveSettings` + `railPickExportLogo`/
  `railLoadExportLogo`/`railClearExportLogo`/`railRenderExportLogo`, staged in `_railExportLogo`
  so CANCEL cancels), `export-builder-overlay` in `RAIL_MODAL_OVERLAYS`.
- [src/sections/analytics.js](src/sections/analytics.js) — `AN_SCREEN`/`AN_PAPER`/`AN_COLORS`
  (getters) + `anWithPalette()`, `anExportBlocks()` (data-derived from `ANALYTICS_TEMPLATES`),
  `anExportData`/`anExportChart`/`anExportDimOptions`/`anExportScopeLabel`, `anExportOpen()`
  (the `controls` function form). `anExportCSV` deliberately unchanged.
- [src/sections/packs.js](src/sections/packs.js) — the global picker (`exportOpenPicker`/
  `exportRenderPicker`/`exportPickerGo`/`exportClosePicker`), the deliverable registry
  (`exportDeliverables`), the three packs (`packTalentOpen`/`packOrgOpen`/`packBoardOpen`) and
  the merge helpers (`packBlocksFrom`/`packProfileCardsBlock`).
- [src/sections/org.js](src/sections/org.js) — `orgKpiHTML()` (extracted from `orgRenderKPI`) +
  `orgExportBlocks()`/`orgExportOpen()`; `orgExportSVG`/`orgExportPNG` kept as native `run` handlers.
- [src/sections/modals.js](src/sections/modals.js) — `ganttExportBlocks()`/`ganttExportOpen()`;
  `exportGanttSVG`/`exportGanttPNG` kept as native `run` handlers.
- [src/sections/ninebox.js](src/sections/ninebox.js) / [src/sections/disc.js](src/sections/disc.js) —
  `nbExportBlocks()`/`nineBoxExportOpen()` and `discExportBlocks()`/`discExportOpen()`; both
  `_*PeopleHTML` helpers now fork on structure only, not colour.
- [tests/export.test.js](tests/export.test.js) — shell structure, escape helpers
  (label/value/logo/palette-color breakout), theme resolution/fallback, template CRUD
  round-trip (with a tiny in-memory `localStorage` stand-in, since Node has none), `pageSize`,
  the manual print button / no-autoprint assertion.
