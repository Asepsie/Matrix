# PIPELINE & PROJECT-LIFECYCLE — plan & TODO

Scope: `INSIGHTS › Pipeline` ([src/sections/pipeline.js](src/sections/pipeline.js)) and the
project-lifecycle model it rides on. Full design/rationale lives in **ARCHITECTURE.md ›
"Pipeline board"** and **"Project lifecycle"** — read those first. This file is the running
TODO for the section: what's shipped, what's next, and the one open decision.

---

## Shipped (do not redo)

- **Pipeline board** — candidate ranking (NPV / IRR / PI / investment vs a peak-FTE /
  FTE·months demand estimate), dual-ceiling **efficient frontier** (€ budget + free
  capacity), go/no-go gate readiness. Candidacy = lifecycle (`proposed`/`on_hold`).
- **`charter.demand`** = `{peakFte, fteMonths, byGroup}` — pre-staffing forecast, edited
  inline in the ranking table.
- **`pipelineCapacity(months)`** ([dashboard.js](src/sections/dashboard.js)) — pure free-
  FTE·months roll-up.
- **Project lifecycle** — persisted `project.lifecycle` (+ `lifecycleReason`,
  `lifecycleHistory[]`); source of truth `PROJECT_LIFECYCLE` ([globals.js](src/core/globals.js)):
  `proposed·active·on_hold·cancelled·in_service·maintenance·maint_cancelled·withdrawn·eol`.
  Accessors + `projSetLifecycle` ([helpers.js](src/core/helpers.js)).
- **Decisions** — Fund/Hold/Kill buttons + `＋ Add candidate` on the board; a `#e-lifecycle`
  dropdown in the project edit panel. Both log via `projSetLifecycle`.
- **Capacity/cost suppression** — held/cancelled/withdrawn/EoL projects stop counting in
  `_computeEngUtil` + `_computeCostMaps`. Safe-by-default (existing + new projects = `active`).

---

## Persistence / retro-compat audit (2026-08-23)  ·  DONE
Audited the data model + all capture/restore surfaces for the new fields (`lifecycle`,
`lifecycleReason`, `lifecycleHistory`, `charter.demand.{peakFte,fteMonths,byGroup}`, gatePlan):
- **Ride `projects[]` for free** — all 4 surfaces serialise `projects`+`gateConfig` wholesale
  (`_doSave`, `captureScope`, `exportFullBackup`, and collab `collabCanonical` = full clone minus
  local id). Nested fields need no MUST_PERSIST entry. Verified a snapshot's IDB record carries
  `lifecycle` + `charter.demand.byGroup` + `gateConfig`.
- **Retro-compat back-fill** (verified in-browser): old charter with no demand → `{peakFte:null,
  fteMonths:null,byGroup:{}}`; demand pre-byGroup → existing values kept, `byGroup:{}` added (no
  loss); full new demand preserved exactly. Lifecycle migration honours a CUSTOM methodology's
  first stage (`discover` → proposed, past it → active).
- **Round-trips verified:** localStorage reload, snapshot capture→restore (lifecycle + byGroup +
  gateConfig all survive).
- **BUG FIXED — `importFullBackup` ordering** ([backup.js](src/sections/backup.js)): `gateConfig`
  was loaded AFTER `sanitiseProjects`, so a PRE-lifecycle backup with a custom methodology would
  mis-migrate against the session's config. Moved the gateConfig load above `sanitiseProjects`,
  matching `loadState`/`restoreSnap`. No format-version bump needed (fields are additive within
  `projects[]`, so backups are bidirectionally compatible).

## Bug-check pass (2026-08-22)  ·  DONE
High-effort review of the items 3–8 diff; 3 correctness bugs found + fixed (252 tests green,
all verified in-browser):
1. **Dead gate handlers** (gate.js) — `gtSetManual`/`gtSetNote`/`gtToggleFold`/`gtSetRoadmap`
   embedded `JSON.stringify(stringId)` inside a **double-quoted** `on*=""` attribute; the inner
   `"` terminated the attribute, so manual criteria ticks, notes, methodology fold, and PI
   roadmap selects were ALL dead. Fixed with `.replace(/"/g,'&quot;')` (the ai.js/matrix.js
   idiom). Pre-existing, not from this session's items — surfaced while fixing the same class of
   bug in item 6.
2. **Home deep-links** (home.js `homeOpenFor`) — the new `hold-stale`/`candidate-stale` action
   cards had no navigation branch → their buttons did nothing. Wired hold-stale → gate detail,
   candidate-stale → pipeline.
3. **Go at final stage** (gate.js `gtDecide`) — funding a project already at the last gate popped
   a spurious "Already at the final stage" alert; now only advances when a next stage exists.

## TODO (priority order)

### 1. Unit tests for the pure engine  ·  DONE (2026-08-21)
Added `tests/pipeline.test.js` (21) + `tests/lifecycle.test.js` (14) — `node --test
tests/*.test.js` green (240 total). Coverage:
- `pipeScore` — npvPerFte / npvPerEur / npv metrics + null-NPV sinks last + zero-denominator
  edges. Refactored to `pipeScore(r, sort)` (sort defaults to `_pipeSort`) so it's global-free.
- `pipeFrontier` — greedy cut respects BOTH ceilings; budget-null = capacity-only; free<=0 =
  no cap limit; first breach stops (later fitting rows stay deferred); funded flags +
  cumulatives; missing invested/fteMonths → 0 (no NaN).
- `pipelineCapacity` — supply/engaged/free/over + byGroup roll-up, engaged capped at 1/mo,
  inactive (medical/resigned & zero-alloc) months excluded, `excludeFromCalc` dropped. The
  synthetic-engUtil seam is injected via globalThis (`_buildEngUtil`/`_memo`/`_monthsKey`/`t`);
  `_costCounts` is the real pure predicate.
- `projSetLifecycle` — writes state+reason, appends history, returns changed-or-not, rejects
  unknown states, no-op on same-state/no-reason, records same-state-with-new-reason, keeps
  prior reason on null-reason transition, accumulates in order.
- `_projCapacitySet` — only `consumes:true` states in the set; unset lifecycle → active →
  counts. (Memoised by epoch — tests call `_invalidateMemo()` between projects changes.)
- **Approach note:** these modules are load-clean (no top-level global calls), so pipeline.js
  and dashboard.js are imported statically and their in-body globals shimmed on globalThis at
  call time; globals.js runs `t()`/`makeGateConfig()` at LOAD, so lifecycle.test.js shims those
  then DYNAMICALLY imports it to reuse the real `PROJECT_LIFECYCLE` (single source of truth).
  Source touched: `pipeScore`/`pipeFrontier` gained `export` (build.js strips it).

### 2. Candidacy migration  ·  DONE (2026-08-21)
**Decision:** a project with no (or invalid) lifecycle is normalised by GATE POSITION —
at the **initial gate** (first stage of the active/custom methodology, or no `stageId` set)
→ `proposed`; advanced past it → `active`. `makeProject` default is now `proposed` (a new
project sits at the initial gate). Implemented in `sanitiseProjects` + `_projAtInitialGate`
([persist.js](src/core/persist.js)); no version flag needed — the `lifecycle===undefined`
guard makes it one-time per project. Verified: unset/first-stage → proposed, later stages →
active. **Watch:** a portfolio that never engaged gates (all `stageId=''`) migrates ENTIRELY
to proposed → its demand is suppressed until funded; a "Fund all / bulk-activate" helper is a
possible follow-up if that proves too aggressive.

### 3. Gate board Go / Kill / Hold buttons  ·  DONE (2026-08-22)
A **GATE DECISION** bar (`gtDecisionBar`/`gtDecBtn`/`gtDecide` in [gate.js](src/sections/gate.js))
on the Projects detail, below the stage controls: current-disposition badge (from
`projLifecycleDef`) + Go / Hold / Kill. `gtDecide` prompts for an optional reason (cancel
aborts) then routes through `projSetLifecycle` (Go→`active`, Hold→`on_hold`, Kill→`cancelled`).
- **Two independent axes, one source of truth each.** Go additionally passes the gate by
  calling `gtStepStage(id,1)` — so stage moves (blocked-override confirm + `gatePlan.history`)
  stay owned by gtStepStage; the disposition (`project.lifecycle` + `lifecycleHistory`) is owned
  by projSetLifecycle. Decline the blocked-override and the project is still funded but holds
  its stage. Hold/Kill never touch the stage. `gtDecide` does its own `saveState()` after, so
  the disposition persists even when the advance early-returns.
- **Verified in-browser** (seeded 3-project set, landed on `gate` › PROJECTS): Go on a Proposed
  project → `proposed→active` logged **and** `open→select` logged (badge → Funded/Active); Kill
  → `active→cancelled`, stage unchanged (badge → Cancelled); Hold → `on_hold`, stage unchanged
  (badge → On Hold). All persisted to `eim_v4`.

### 4. Matrix dimming for held/terminal states  ·  DONE (2026-08-22)
Lifecycle cue in the matrix draw path ([matrix.js](src/sections/matrix.js), the dot pass +
label pass): `!projIsActivePortfolio(p)` (cancelled/withdrawn/eol) renders every node element
at `opacity 0.3` (ring, inner dot, todo count, leader line ×0.5, label); `on_hold` stays full
opacity but gains a dashed `var(--warn)` marker ring (`r=DOT_R+3`, `pointer-events:none`).
Positions are untouched — opacity-only, so no layout/collision-grouping change; nodes stay
interactive (opacity keeps pointer events). `safeColor` untouched (the marker uses a literal
CSS var, not user data).
- **Verified in-browser** (5 projects, one per state, landed on `matrix`): active/in_service →
  opacity 1; cancelled/eol → 0.3 on ring **and** label; on_hold → opacity 1 + exactly one
  dashed marker ring; all 5 nodes rendered, no console errors.

### 5. Action Queue nudges for lifecycle  ·  DONE (2026-08-22)
Two project concerns added to the pure engine ([home.js](src/sections/home.js) `homeClassifyProject`):
- **`hold-stale`** (governance, warn): `lifecycle==='on_hold'` for `>= holdStaleDays` (90),
  aged from the LATEST `to:'on_hold'` entry in `lifecycleHistory` vs `o.now` (a re-hold resets
  the clock). Action → Gate & PI.
- **`candidate-stale`** (portfolio, warn): `lifecycle==='proposed'` AND value-destroying (PI<1
  OR risk-adj NPV<0). Action → Pipeline. The generic `value-destroying` block is now guarded
  `lc!=='proposed'` so a candidate gets the decide-to-kill framing, NOT a duplicate card.
- **Plumbing:** the gather layer passes `lifecycle` + `lifecycleHistory` + `now` into the
  classifier (the classifier stays global-free — reads plain fields, no `projLifecycle` global).
  New threshold `holdStaleDays:90`; domain/title maps extended.
- **Accept met:** 6 new cases in [home-actions.test.js](tests/home-actions.test.js) (246 green);
  verified in-browser — a 120-day on_hold project surfaces *"…has been on hold too long — On
  hold 120 days"* in the live Action Queue (WARN), no console errors.

### 6. Per-discipline demand  ·  DONE (2026-08-22)
`charter.demand.byGroup` (engGroup id → FTE·months) is now editable and enforced:
- **Engine:** `pipeFrontier(rows, budget, freeCap, capByGroup?)` gained an optional 4th arg —
  a per-discipline free-FTE·months map. A row whose `byGroup` demand would push ANY discipline
  over its free capacity is deferred even when € + total-FTE still fit, and gets
  `r.groupBreach=[gid…]`. Omit the arg (or a row without `byGroup`) → unchanged total-only
  behaviour (all existing frontier tests still pass). `pipeDemand`/`pipeRows` carry `byGroup`;
  `renderPipelineTab` builds `capByGroup` from `cap.byGroup[gid].free`.
- **UI:** a "▸ by function" expander per candidate ([pipeline.js](src/sections/pipeline.js)
  `pipeGroupToggle`/`pipeGroupRow`, session `_pipeExpanded`) reveals one FTE·months input per
  engGroup with a free-capacity hint (over-capacity fields turn warn) and a Σ-vs-total mismatch
  note; `pipeSetGroupDemand` writes `charter.demand.byGroup`. The Fit column shows a `⛔`
  breach badge naming the over-capacity discipline(s).
- **Bug fixed inline:** `JSON.stringify(g.id)` inside a double-quoted `onchange=""` terminated
  the attribute (broke the handler). New `_pipeGidArg` JS-escapes then HTML-escapes for a
  single-quoted arg. **NOTE for the bug pass:** gate.js `gtSetManual`/`gtSetNote`/`gtStatusBtn`
  use the same `JSON.stringify(id)`-in-a-double-quoted-attribute pattern — likely the same latent
  bug; check them.
- **Accept met:** 6 new frontier tests (per-discipline cut, breach list, accumulation, omitted
  arg, unknown discipline). Verified in-browser: expander edits persist to `byGroup` (`{eng:8,
  design:4}`), toggle count + live inputs update, no console errors.

### 7. Bulk lifecycle action ("Fund all candidates" / bulk-activate)  ·  DONE (2026-08-22)
`pipeFundAll` ([pipeline.js](src/sections/pipeline.js)) + a header **⚡ Fund all (N)** button
(shown only when N>0). Confirms, then sets every candidate (`pipeIsCandidate` = proposed/on_hold)
to `active` via `projSetLifecycle` with a `'Bulk-funded from Pipeline board'` reason, one
`saveState`, then re-render (capacity recomputes off the fresh lifecycle set).
- **Verified in-browser:** 3 candidates (2 proposed + 1 on_hold) → all Active, each with a
  logged transition (incl. `on_hold→active`); a pre-existing Active project untouched (no new
  history); the button disappears once no candidates remain.

### 8. confirmAdd → makeProject  ·  DONE (2026-08-22)
`confirmAdd` ([modals.js](src/sections/modals.js)) now builds via `makeProject({…overrides})`
(id/name/x/y/vis/ena/note/color/costSource:'manual'/planCost:null/sectionId), so charter,
gatePlan, lifecycle, lifecycleHistory, impactEur, etc. are present at creation instead of
sanitise-back-filled. Also removed the old literal's duplicate `vis`/`ena` keys.
- **Verified in-browser:** a matrix-added project has `charter.demand.byGroup`, `gatePlan`,
  `lifecycle:'proposed'`, `uid`, `costSource:'manual'`, `planCost:null` — all at creation.

### 8. confirmAdd → makeProject  ·  LOW  ·  (chip task_7ef1f665)
[modals.js](src/sections/modals.js) `confirmAdd` builds a raw literal — migrate to
`makeProject({...overrides})` so new fields aren't sanitise-dependent. Independent of the rest.

---

## Ground rules for any session touching this section

- Build: `node build.js` → `dist/matrix.html`. Tests: `node --test tests/*.test.js`.
- Invariants are enforced by build.js — heed all six (esp. #5 duplicate top-level decls, and
  **never write `*/` inside a block comment** — it silently broke the bundle in session 1).
- A green `node build.js` only PARSES the bundle (`vm.Script`); it does **not** prove it runs
  in a browser. Verify in-browser for anything user-visible.
- **Verify-in-browser recipe** (the pane has no compositor, isolated JS eval can't see bundle
  globals, hover-drawers don't open): serve `dist/` via the `matrix-dist` launch config, seed
  a minimal `eim_v4` payload into `localStorage` (sanitise fills the rest), set
  `eim_rail_prefs.landing` to the target view id to skip rail navigation, reload, then read
  state through `document`/DOM queries. `saveState` is debounced — re-read after a tool-call
  gap to see the flush.
- New persisted project fields ride `projects[]` → no MUST_PERSIST entry needed. New top-level
  STATE keys DO need adding to all three capture surfaces (see ARCHITECTURE.md › capture parity).
