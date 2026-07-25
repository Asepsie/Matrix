# HOME-PLAN — Personal Home & cross-domain Action Queue

> **STATUS (2026-07-24): Phase 1 (engine) + Phase 2 (view/widgets/customization) SHIPPED.**
> Built in [src/sections/home.js](src/sections/home.js) + [src/styles/home.css](src/styles/home.css);
> tests in [tests/home-actions.test.js](tests/home-actions.test.js) (14, green). **Design change
> the user chose during the build:** the "fixed Action-Queue hero" below was replaced by an
> **"everything is a widget"** fully-customizable grid — the Action Queue is the default hero
> *widget* but is removable/movable/resizable like any other. The engine spec (concern catalog,
> impact, ranking, suppression, snooze/resurface, item schema) shipped **as written below**; the
> layout/persistence model is now the widget grid. See **ARCHITECTURE.md › Personal Home** for the
> as-built design. **Remaining (Phase 3/4):** the optional `Brief me` AI card, migrating exec's
> "my week" onto Home, per-user-in-room layouts, and portfolio-value widgets in the library. The
> rest of this file is the original spec, kept for rationale/history.

Build plan for a **personal entry point** to Project Matrix. Self-contained: a
cleared session should be able to start building from this file alone. Read
`CLAUDE.md` (build/invariants) and the relevant `ARCHITECTURE.md` sections for the
producers this feature consumes (People analytics, Gate & PI, Portfolio economics,
Executive summary, Talent engagement).

---

## Why this exists

The **Executive summary** (`exec.js`, `INSIGHTS › Executive summary`) *aggregates*
cross-domain numbers but it is fixed, read-only, one altitude (portfolio strategy),
and it is *everyone's* page. It does not **compose** (the user can't build their own
view) and it does not **act** (no ranked "what do I do next"). A personal Home is a
different job: **yours**, action-first, remembered per device, and the default landing.

The unique asset it exploits: the **people × portfolio join** — no mainstream tool
connects "this person is a flight risk *and* the KT-less sole holder of a skill on
your highest-NPV project, which is blocked at a gate." Matrix already computes every
piece; Home is the surface that fuses them. The join already exists inside
`gtBuildSignalMap()` (talent→projects via `allocRows`); Home makes it the front door.

## Locked design decisions (do not re-litigate)

- **Shape:** the hero is a ranked cross-domain **Action Queue** ("what needs you, in
  consequence order"). Curated widget tiles sit below it; an optional AI brief narrates
  the same findings.
- **Seeding:** one **smart default** layout (editable), not role presets, not a blank canvas.
- **Widgets:** a **curated home-widget library** (purpose-built, screen-sized) in a new
  global registry — not embedded full-section renders, not the export block registries.
- **Insights:** **rule-based cards + optional AI brief** (deterministic cross-domain
  cards; WebGPU-gated LLM narration of the top findings).
- **Ranking:** **severity band + impact tiebreak** (Critical/Warn/Watch, then € impact
  within band). No composite "magic score".
- **Item granularity:** **per entity × concern** — one card per fixable concern, where a
  concern maps to exactly one target surface.
- **Item state:** **snooze-until-date + dismiss-until-signal-changes** (content-hash
  resurface). State lives per-device in `eim_home_prefs`.
- **Persistence:** per-device UI pref (`eim_home_prefs`), like `eim_rail_prefs` — **not**
  app state, **not** in backups/collab sync. (Per-user-in-room layouts = Phase 4, optional.)
- **Relationship to exec:** Home **coexists** with the Executive summary (does not replace
  it). Exec's *personal* pieces — `xsPlannerPins`/`xsScheduleSection` ("my week", pinned
  todos, drag-to-day) — migrate onto Home in Phase 4; exec keeps portfolio-strategy tiles.

## Mockup (target look)

A dark, mono, lime/teal product screen: pinned-open nav rail with **Home** at the top and
active; a top bar with `All / People / Portfolio / Gov` filters + a `Brief me` button; the
Action Queue as stacked cards (severity left-border band, a `People × Portfolio` tag on
fused items, why line, metric chips, a recommended action + deep-link buttons, snooze/
dismiss); a row of 4 compact metric tiles; an AI brief card. (Rail is collapsed-to-icons
by default in the real app; shown pinned-open in the mockup for legibility.)

## Phasing

1. **Action Engine + queue** — the pure `homeBuildActions(ctx)` engine, state layer, tests.
   The whole cross-domain merge. Shippable/verifiable on its own (no UI required to test).
2. **Home view + UI** — new rail view, render the queue, the curated widget tiles + one
   smart default, drag-reorder/show-hide tiles, per-device persistence, set as default landing.
3. **AI brief** — `Brief me` card feeding the top structured findings into `ai.js` (WebLLM).
4. **Polish** — migrate exec's "my week" onto Home; optional per-user-in-room layouts (key
   off collab actor); saved queue presets/filters.

---

# PHASE 1 SPEC — `homeBuildActions(ctx)` engine

Phase 1 is the **pure engine + state filtering + unit tests**. No rendering, no rail view,
no tiles, no AI. Output is the contract Phase 2 renders. Mutates nothing except the
per-device `eim_home_prefs` key.

## File & bundle wiring

- New `src/sections/home.js`, everything `home`/`_home`/`HOME_`-prefixed (flat-bundle
  invariant #5 — declare each identifier once across the whole bundle).
- New per-device key `eim_home_prefs` (mirrors `eim_rail_prefs`; **not** app state/backups).
- Add `home.js` to `JS_FILES` in `build.js` **after** `analytics.js`, `gate.js`, `econ.js`,
  `charter.js`, `engagement.js` — it reads their bundle globals: `buildAnalyticsDataset`,
  `gtBuildSignalMap`, `gtStageReadiness`, `gtCurStageIdx`, `ecDataset`, `chtConflicts`,
  `tegEng`, plus `allocRows`/`projects`/`gateConfig`.
- **Testability split:** keep the pure classifiers (`homeBand*`, `homeEngImpact`, `homeRank`,
  `homeApplyState`, `homeHash`, per-concern `homeClassify*`) taking **plain inputs**, separate
  from the thin gather wrapper that calls the (non-importable) producers. Tests feed fixtures
  to the pure fns — the producers are bundle globals, not importable, so don't test through them.

## Producers this engine reads (all existing)

| Producer | Returns | Notes |
|---|---|---|
| `buildAnalyticsDataset()` | people rows (active, non-vacant, non-planning, non-excluded), keyed by `id` | Memoised. Row carries `riskScore`, `riskFactors`, `comparatio`, `spofSkills[]`, `hasKTPlan`, `nineBoxMove`, `utilizationPct`, `reviewCurrencyMonths`, `tenureMonths`, `isManager`, `grade`, `hasSuccessor`, `name` |
| `anRiskModel(d)` | `{score, factors:[{k,p}]}` | Already fuses over-alloc + stale-review + SPOF + bench + below-market-star + declining-nine-box + no-successor into one 0–100 score |
| `gtBuildSignalMap()` | `{projId:{npv,riskAdjNpv,pi,blended,unitMargin,conflicts,cost,dtcGap,alignMin,chanHHI,riskScore,spof}}` | `riskScore` = worst team member; `spof` = SPOF-without-KT count. Builds the `allocRows` people↔project join internally |
| `gtStageReadiness(stage,gp,signals)` | `{rows,pct,blocked,blockers[]}` | Blocker = mandatory criterion not `pass`/`na` |
| `gtCurStageIdx(p,stages)` | current stage index | `stages` = `gateConfig.model.stages` |
| `ecDataset()` | per-project value rows | Source of `riskAdjNpv`, `conflicts`, etc. (also feeds `gtBuildSignalMap`) |
| `chtConflicts(c)` | conflict list (must-have vs sacrificed dim) | count already in `sig.conflicts` |
| `tegEng(eng)` | `{tier, touchpoints:[{type,week,done,note,ts}]}` | `week` = Monday date key `YYYY-MM-DD` |

## Item schema

```js
{ id,          // `${concern}:${entityType}:${entityUid}` — stable dedup/state key
  concern,     // 'retention-risk' | 'gate-blocked' | … (11 below)
  domain,      // 'people' | 'portfolio' | 'governance'
  entityType,  // 'engineer' | 'project'
  entityUid,   // DURABLE uid — state/resurface key (survives reload + collab merge)
  entityId,    // numeric id — for deep-link open() (DOM/opener wiring uses id)
  band,        // 'critical' | 'warn' | 'watch'
  impact,      // € number — the tiebreak
  title, why,  // strings (why may be string[] of factor labels)
  metrics,     // [{label,val,tone}] → Phase-2 chips
  action,      // recommended-next-step label
  target,      // {view, open()} deep-link descriptor
  hash }       // content hash of the material signal → resurface trigger
```

Carry **both** `entityUid` (durable — state/resurface key; survives reload + merge, per the
uid identity model) **and** `entityId` (numeric — the openers `openIdCardModal`/`gtOpenDetail`
take the numeric id).

## Concern catalog (the full sweep — 11 concerns)

Thresholds centralized in `HOME_THRESHOLDS` (one tunable object).

**People** (per `buildAnalyticsDataset()` row `d`; project join via `engProjects`):

| concern | fires when | band | target `open()` | hash inputs |
|---|---|---|---|---|
| `retention-risk` | `anRiskModel(d).score ≥ 25` | ≥50 critical, else warn | `openIdCardModal(id)` + Engagement | band + sorted factor keys |
| `over-allocation` | `utilizationPct > 105` | >130 critical, else warn | `railGo(null,'plan')` | `round(util/10)` |
| `bench` | `utilizationPct < 10` | watch | `railGo(null,'plan')` | bool |
| `stale-review` | `reviewCurrencyMonths > 15` or (null & `tenureMonths > 12`) | watch | `openIdCardModal(id)` | month bucket |
| `engagement-due` | `tegEng` has undone touchpoint this week / overdue | overdue warn, else watch | `railGo(null,'engagement')` | count + earliest week |

**Portfolio** (per `gtBuildSignalMap()` entry `s` + gate readiness):

| concern | fires when | band | target `open()` | hash inputs |
|---|---|---|---|---|
| `gate-blocked` | `gtStageReadiness(curStage,gp,s).blocked` | critical | `gtOpenDetail(pid)` | sorted blocker crit ids |
| `gate-behind` | not blocked & `pct < 50` | watch | `gtOpenDetail(pid)` | pct bucket |
| `charter-conflict` | `s.conflicts > 0` | warn | `chtOpenDecision(pid)` | conflict count |
| `value-destroying` | `s.pi != null && s.pi < 1` | warn | `openCharter(pid)` → financials | sign + pi bucket |
| `low-unit-margin` | `s.unitMargin != null && s.unitMargin < 15` | watch | `openCharter(pid)` | margin bucket |
| `dtc-gap` | `s.dtcGap > 0` | watch | DTC picker(pid) | gap bucket |
| `channel-concentration` | `s.chanHHI != null && s.chanHHI > 0.6` | watch | `openChannels(pid)` | hhi bucket |

`gate-blocked`/`gate-behind` use the real `gtStageReadiness(stage,gp,signals)` +
`gtCurStageIdx(p, gateConfig.model.stages)` (default `makeGatePlan()` when `p.gatePlan` absent).

### `HOME_THRESHOLDS` (starting values — tune later)

```js
const HOME_THRESHOLDS = {
  retentionMin:25, retentionCrit:50,   // from anRiskColor bands
  overallocPct:105, overallocCrit:130, // 105 from anRiskModel
  benchPct:10,                         // from anRiskModel
  staleReviewMonths:15,                // from anRiskModel
  gateBehindPct:50,
  marginPct:15,                        // NEW — confirm
  hhi:0.6,                             // NEW — normalised HHI (chanConcentration)
  spofBoost:1.5,
};
```
`retentionMin/Crit`, `overallocPct`, `benchPct`, `staleReviewMonths` reuse existing app
conventions; `marginPct`, `hhi`, `gateBehindPct`, `spofBoost` are new — start here, tune.

## Impact (the tiebreak)

- **Project concern:** `impact = max(0, s.riskAdjNpv ?? s.npv)`.
- **Person concern:** blast-radius = Σ over allocated projects of `max(0, projRiskAdjNpv)`,
  **×`spofBoost` if SPOF** (`d.spofSkills.length && !d.hasKTPlan`). Reverse of the join
  `gtBuildSignalMap` builds internally:
  ```js
  const engProjects={};
  (allocRows||[]).forEach(a=>{ if(a.engId==null||a.projectId==null) return;
    (engProjects[a.engId]||(engProjects[a.engId]=[])).push(a.projectId); });
  ```
- **`bench`** uses the person's loaded monthly cost as impact (its consequence is wasted
  spend, not project value).

## Ranking

```js
const BAND_RANK={critical:0,warn:1,watch:2};
items.sort((a,b)=> BAND_RANK[a.band]-BAND_RANK[b.band]
                || b.impact-a.impact
                || (a.title<b.title?-1:1));   // deterministic tie
```
Band first, impact second — no composite score. (Phase 2 may still *display* the € impact.)

## Suppression / dedup

- `id = concern:entityType:entityUid` → natural dedup.
- **A person's `over-allocation`/`bench`/`stale-review`/`engagement-due` are suppressed when
  that person already has a *Critical* `retention-risk` card** (its `why` already names them;
  avoids stacking one human's problems). Over-allocation on a *non-risky* person still shows.
- A project's `gate-blocked` and `charter-conflict` stay **separate** — different fix surfaces.

## State: snooze + resurface-on-change

```js
eim_home_prefs = { snoozed:{[id]:{until:ISO}}, dismissed:{[id]:{hash,ts}} }  // +layout in Phase 2
```
`homeApplyState(items, prefs, now)`:
- drop if `snoozed[id] && snoozed[id].until > now`;
- if `dismissed[id]`: `hash===item.hash` → drop (still resolved); `hash !== item.hash` →
  **resurface** and prune the stale dismissal.

`homeHash(str)` = short base36 rolling hash over each concern's hash-input string (catalog
col 3). Dismiss captures the current hash; a materially worse signal changes the hash →
the item comes back. **Hash on `entityUid`, never numeric `id`** (survives reload/merge).

## Public API

```js
homeBuildActions(ctx) → Item[]
// ctx = { now=new Date(), domainFilter='all', minBand='watch', prefs=homeLoadPrefs() }
```
Pipeline: gather datasets → run the 11 concern classifiers → suppression → `homeApplyState`
→ domain/minBand filter → sort. `homeRawItems(ctx)` (no state filter) backs tests and a
Phase-2 "show dismissed" toggle. **Null-tolerant throughout:** a project with no charter
yields no portfolio items (all sigs null); a talent-only dataset yields only people items;
never throws (every producer call is guarded, mirroring `gtBuildSignalMap`'s try/catch).

## Deep-link openers (confirm exact names when wiring `target.open()`)

`openIdCardModal(id)` (idcard.js) · `gtOpenDetail(pid)` (gate.js, sets `_gtProjId`+view) ·
`chtOpenDecision(pid)` / `openCharter(pid)` (charter.js) · `openChannels(pid)` (channels.js) ·
DTC picker (dtc.js) · `railGo(null,'plan'|'engagement'|'analytics')` (railnav.js).
**Two-arg `railGo(ev, viewId)` gotcha:** buttons must pass the event; the engine's `open()`
closures pass `null` as the event. `open()` also pre-selects the entity (numeric `entityId`).

## Tests — `tests/home-actions.test.js`

- band mapping per concern (fixtures);
- suppression (Critical retention hides same person's capacity/gov cards; over-alloc on
  non-risky person survives);
- impact (two-project sum; ×1.5 SPOF boost; project uses own `riskAdjNpv`);
- sort (band before impact; impact desc within band; deterministic tie by title);
- hash resurface (dismiss→hidden; changed signal→reappears; stale dismissal pruned);
- snooze (future hidden; past shown);
- null-tolerance (no-charter project yields no portfolio items; talent-only dataset yields
  only people items; no throw);
- `domainFilter` + `minBand` filters.

## Invariants to honor (see CLAUDE.md)

Prefix-unique top-level names (#3, #5); no `word =` inside comments (#5 line-checker reads it
as a declaration); emitted bundle parses as classic script (#6, `vm.Script`); **no state
mutation** (engine is read-only except `eim_home_prefs`). `escH`/`safeColor` on synced fields
is a **Phase 2 render** concern — the engine emits raw data strings; Phase 2 must escape at
every sink (no central choke point — see ARCHITECTURE.md › XSS).

## Build / verify

`node build.js` → `dist/matrix.html`; `node --test tests/home-actions.test.js`. Phase 1 has
no UI, so verification is the unit tests + a console check (`homeBuildActions()` against the
40-person demo backup returns a sane ranked list with the fused people×portfolio items on top).
