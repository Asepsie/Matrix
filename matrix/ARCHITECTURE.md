# ARCHITECTURE — Project Matrix

Minimal context for future sessions. Add new sections as other areas get touched;
keep entries short — record what is *non-obvious from the code*, not a full tour.

---

## Data & persistence

Three persistence layers with **two different identity models**. This split is the
source of most data bugs.

| Layer | Where | Keyed by | Holds |
|-------|-------|----------|-------|
| Main state | localStorage `eim_v4` (`SK`) | — (whole arrays/objects) | `engineers[]`, `projects[]`, `allocRows[]`, placements, axis/UI |
| Photos | IndexedDB `EIM_Photos` + in-memory `_photoCache` | `String(eng.id)` | compressed JPEG dataURLs |
| Talent | IndexedDB `EIM_TalentData` | inner keys = `eng.id` | nine-box / disc placements, nbYear |
| Snapshots | IndexedDB `eim_snaps` (index + data stores) | snapshot `id` (Date.now) | time-travel copies of main state |

### Key facts (non-obvious)

- **`eng.id` is a per-dataset sequential counter** (`nextEngId`), **not** globally
  unique. Two different backups both have engineers `1,2,3…` referring to different
  people. IndexedDB is per-origin and dataset-independent, so id-keyed blobs
  (photos, placements) collide across datasets unless restore replaces them.
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

### Known remaining risk (not yet fixed)

The root cause — sequential `eng.id` instead of a globally unique `uid` — is still
present. Tier-1 fix makes restore authoritative but depends on every restore path
getting replace-semantics right. Notably `handleSnapImport`
([src/core/persist.js](src/core/persist.js)) can import a *full project JSON* as a
snapshot, which then restores via `restoreSnap` (no photo replace) — still
vulnerable. Durable fix (Tier 2): add per-engineer `uid`, key photos/placements by
it, migrate `id → uid`.

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
canvas is no longer the front door — it's one view under WORK.

### Key facts (non-obvious)

- **Single source of truth: the global `activeView`** (id string, e.g. `'roster'`,
  `'matrix'`, `'ninebox'`) — declared **once** in [globals.js](src/core/globals.js),
  default `'roster'`. The router **`railGo(viewId)`** sets it, routes, and refreshes the
  rail highlight + the `DOMAIN › View` breadcrumb in `#topbar`.
- **Views vs actions.** *Views* set `activeView` and change the visible surface; `railRoute`
  dispatches them: the 12 Resources tabs via `openRes()`+`showResTab(tab)`, plus
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
  UI-only prefs — `{hoverMode, landing, railWidth}` — persist in **`localStorage
  'eim_rail_prefs'`**, deliberately separate from app state (`SK='eim_v4'`) and **not** part
  of the data model or backups. First run shows `#landing-firstrun` to pick the default view.

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

The **Resources overlay** (`#res-overlay`) hosts 12 tabs rendered into `#res-body` by
`showResTab(tab)` ([src/sections/nav.js](src/sections/nav.js)). The global FROM/TO period
(`#res-start`/`#res-end`) is **shared by every tab** (`getMonthRange()` in helpers.js).
**Adding a tab:** new `src/sections/mytab.js` with `renderMyTab()` → add to `JS_FILES`
(build.js) → add a `showResTab` case + the highlight-loop array → add a rail view in
`RAIL_DOMAINS` + `RAIL_RES_TABS` (railnav.js). (Old `CLAUDE.md` step "add a button in
res-header" is obsolete — the rail owns navigation now.)

- **Two analytics tabs.** *People analytics* = [analytics.js](src/sections/analytics.js)
  (`renderAnalyticsTab`, a story/dimension/template engine). *Portfolio analytics* =
  [portfolio.js](src/sections/portfolio.js) (`renderPortfolioAnalytics`) — project-side
  €/ROI/gate/sector/risk plus treemap, cost-over-time burn, and a distribution panel
  (histogram + Gaussian / Pareto). All `pf`-prefixed; reuses `getMonthRange` / `_allocCost` /
  `_engByIdMap`. Interactive sub-controls re-render only their own wrapper via `pfSet`.
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
- **WORK › Financials analysis** (`#cht-overlay`) — Overview / Demands / Financials tabs
  (`chtOpenFinancials` → per mode). `openCharter(projId)` renders it.
- **WORK › Trade-off decision** (`#dec-overlay`) — the configurable triangle(s) +
  non-negotiables/flexibilities (`chtOpenDecisionView` → per mode; `chtOpenDecision(projId)`).
- Both share one selected project (`_chtProjId`) and a **picker MODE** from Settings
  (`railChartPicker()` → `'hub' | 'dropdown'`, persisted in `eim_rail_prefs.chartPicker`):
  - `hub` — `openCharterHub(target)` shows `#chthub-overlay` (the card grid). A card opens the
    matching panel (`target` = 'financials' | 'decision') stacked **above** the hub. One hub
    overlay serves both panels via `_chtHubTarget`.
  - `dropdown` — the panel opens directly with a `<select>` in its header (`#cht-pick`/`#dec-pick`,
    rendered by `chtRenderPicker`), like Design-to-cost's `#dtc-picker`.
- **Both panels are VIEWS now** (rail-inset `left:var(--rail)`), NOT modals: `#cht-overlay`
  and `#dec-overlay` are `z-index:410` so they sit **above** the hub (`z400`) — closing a panel
  reveals the hub again. Only the deck/synopsis stay full-cover modals (z1150).
- **Rail-highlight sync on close** is done inside `chtClose`/`chtCloseDecision` via
  `chtSyncRailAfterClose()` (NOT the railnav `railWrapClosers` wrap): it resets `activeView`
  to `'matrix'` only when NO charter surface (panel or hub) is left showing and we're not
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

A **second WORK rail view** (`WORK › Design to cost`) — a *view*, not a modal, so its
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

## Localization (i18n)

Runtime translation layer in [src/core/i18n.js](src/core/i18n.js) (loaded **first** in
`JS_FILES`, so `t()` is available to every later file including globals). Shipped languages:
**English (base) + French + Chinese**, chosen in Settings. Rolled out **phased, shell-first**.

> **Living status, how-to, conventions, and the ordered remaining TODO are in
> [I18N.md](I18N.md) — read that to continue the work.** This section is the durable design
> rationale only.

Done so far (966 keys, all translated): Phase 0 seam · Phase 1 shell chrome (rail, Settings,
first-run, Help) · Phase 2 partial — matrix canvas, Roster + engineer card, Resources period
header, Resource plan, org-chart header/tools/dialogs + headcount-KPI, cost dashboard (+ replacement
finder + add-resource modal), Portfolio + People analytics, Team profiles, and section-6 modals &
misc (idcard, backup, tooltip, sidebar, Summary overlay, AI advisor dialogs, project-window
risk/schedule/actions modals) — all DOM chrome. Deliberately left English: SVG chart `<text>`,
the AI LLM prompt/context, stored status/priority option values, print-doc/CSV export builders.
Remaining: nine-box, DISC, development, skills, heatmap, charter, dtc, timeline, org node/context-
menus; then Phase 3 (SVG labels, print docs, `i18nNum`/`i18nDate` wiring). See I18N.md.

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
