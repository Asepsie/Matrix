# ARCHITECTURE — Project Matrix

The **short, load-bearing** reference: only the non-obvious facts that cause real bugs
if forgotten. Not a feature tour (the code is the tour — see the module map in
[CLAUDE.md](CLAUDE.md)). Forward work lives in [BACKLOG.md](BACKLOG.md). Keep this file
lean — add a bullet only when something bites that the code alone doesn't explain.

> This doc was reset to essentials on 2026-09-01. The old 2700-line per-feature history
> is in git if you ever need it (`git log -- ARCHITECTURE.md`).

---

## What it is

A single-file HTML R&D portfolio-management tool. Source in `src/`, built into one
self-contained `dist/matrix.html` by `node build.js`. No runtime framework, no server.

---

## The bundle model (read before touching build.js or any top-level declaration)

`build.js` concatenates `src/index.html` + every file in `JS_FILES`/`CSS_FILES` into one
document. Consequences that bite:

- **One flat, shared scope.** Every `src/sections/*.js` and `src/core/*.js` shares a single
  global scope — as if pasted into one `<script>`. **A top-level identifier may be declared in
  ONE file only**; a duplicate `let`/`const` is a load-time `SyntaxError` that aborts everything
  after it in the bundle.
- **Inline handlers resolve against the global scope**, so any `onclick="foo()"` needs `foo`
  reachable as a global (a top-level `function`, `var`, `const`, or `let` all work — but a
  name that exists in NO file is a runtime `ReferenceError` on click). This class of bug
  (`exportTimelinePDF`, `renderRoster`, `closeIconPicker` were all real instances) is invisible
  to the build and is exactly what the smoke test catches.
- **A green `node build.js` does NOT prove the app runs.** The invariant checker is line-based
  and the final compile is `vm.Script` — which only *parses*. Two traps have shipped past it:
  a `*/` inside a `/* */` comment (closes the block early → stray code → browser throws at
  top-level), and a `word =` phrase inside a comment (read as a duplicate declaration). **After
  any change, run the smoke test** (below) — that, not the build, is the ship gate.
- Other checker rules: no literal `</script>` in a JS string (split as `'<scr'+'ipt>'`);
  all allocation arithmetic through `_allocNum()`/`_allocCost()`, never raw multiply.

## The render model (read before printing any user/synced field)

The whole UI is **`innerHTML` string-building** (`h += '<div>…'`), assigned into containers
(`#res-body` for most rail views). There is **no framework escaping and no central choke
point** — escaping is per-render-site:

- **Text → `escH()`** (the ~560-site convention). Never interpolate a user/synced string raw.
- **Color → `safeColor(c, fallback)`** — colors break straight out of `style="…:COLOR"` /
  SVG `fill="COLOR"`; a validator, not just an escape. Apply at every point a user-editable
  color (`project.color`, group/section colors, gate stage colors, …) reaches markup.
- **Never route user data through `t()`** — the i18n interpolator inserts vars verbatim; pre-escape.
- **Inbound data is untrusted.** In a shared room (or a restored backup), every entity name,
  note, and color is attacker-controlled. When you add a render of any such field, `escH` the
  text and `safeColor` the color at that site.

## SVG theming caveat

CSS `var(--…)` works inside `style="…"` and in stylesheets, but **NOT in SVG presentation
attributes** (`fill="…"`). So a chart built as an SVG string with `fill="#…"` can't be
re-themed by swapping palette vars — it needs a palette swap (analytics does this via
`AN_COLORS` getters), and it won't survive the PNG/SVG *raster* path (which wraps the doc in
a `<foreignObject>`). Chart-heavy exports (portfolio analytics) are therefore **PDF/HTML only**.

---

## Persistence & identity (the source of most data bugs)

Three storage layers, two identity models:

| Layer | Where | Keyed by | Holds |
|-------|-------|----------|-------|
| Main state | localStorage `eim_v4` (`SK`) | whole arrays | `engineers[]`, `projects[]`, `allocRows[]`, placements, UI |
| Photos | IndexedDB `EIM_Photos` + `_photoCache` | `eng.uid` | compressed JPEG dataURLs |
| Talent | IndexedDB `EIM_TalentData` | inner keys = `eng.uid` | nine-box / DISC placements |
| Snapshots | IndexedDB `eim_snaps` | snapshot id | time-travel copies of main state |

- **`eng.id` is a per-dataset counter (`nextEngId`), NOT globally unique** — two backups both
  have engineers `1,2,3` for different people. Every entity also carries a durable **`uid`**;
  photos, talent placements, and cross-user refs are keyed by uid so they don't collide across
  datasets. `id` stays for intra-dataset refs (`allocRow.engId`, `reportsTo`) and DOM wiring.
  **`makeEngineer()`/`makeProject()` do NOT auto-increment `id`** (that's `addEngineer`'s job) —
  hand-built entities must set their own id or they collide onto one entity.
- Photos live only in IndexedDB (stripped from main state on save); snapshots share the live
  photo store (never clear it on restore); full backups embed photos.
- **Restore invariant:** `gateConfig` must be assigned **before** `sanitiseProjects()` in all
  restore paths, so lifecycle migration reads the restored dataset's (possibly custom) first
  gate, not the session's.

## Project lifecycle & capacity suppression

`project.lifecycle` (enum, source of truth = `PROJECT_LIFECYCLE` in `core/globals.js`) is the
project's disposition, separate from its gate stage. Allocations on a **non-capacity-consuming**
project (proposed / on_hold / cancelled / eol) are **suppressed everywhere at once** — cost,
utilisation, over-allocation, dashboard, analytics, pipeline — via the memoised
`_projCapacitySet()` choke point in `_computeEngUtil`/`_computeCostMaps`. "Archived" = a terminal
lifecycle phase; working views hide archived by default but keep the currently-selected one.

## Multi-user collaboration (collab.js) — the parts that bite

Real-time sync over Yjs (dynamically imported from esm.sh; relay is a separate repo). Enough to
avoid breaking it:

- **`saveState()` or it doesn't sync.** `collabPush` is hooked into `_doSave`, so any editor that
  mutates state but skips `saveState()` is invisible to sync *and* not persisted single-user.
- Entities sync **per leaf field** keyed by `uid‖path`, each value **AES-256-GCM E2E** encrypted;
  the room key rides only in the link `#fragment`. Offline edits merge via a 3-way reconcile on
  reconnect. Intra-dataset refs travel as **uid mirrors** (`engUid`/`projectUid`/…), numeric ids
  stripped from the wire, so concurrent offline creation can't cross-link.

---

## Export engine (core/export.js + sections/packs.js)

One shared builder. A deliverable registers a **block list** `[{id,label,render(ctx)}]` and calls
`exportOpenBuilder({…})`; the user picks/reorders blocks, theme, and paper, previews, and exports
(PDF/HTML, sometimes PNG/SVG). Every view keeps its own Export button; the global **Export** rail
door is `exportDeliverables()` in `packs.js` (also the home of cross-view *packs*). To add one:
write `xExportBlocks()` + `xExportOpen()`, wire a button, add a row to `exportDeliverables()`.
Scope is **visual/print deliverables only** — CSV/JSON dumps stay raw (out of scope).

---

## Testing & the ship gate

- **Unit tests** (`npm test` → `node --test tests/*.test.js`) cover the **pure engine functions**
  (allocation/cost, lifecycle, collab merge/crypto/refs, home actions, export template logic).
  Keep these functions global-free so they import cleanly in Node.
- **Smoke test** (`npm run smoke` → `tests/smoke.mjs`) is the real-browser net: it drives your
  installed Chrome/Edge (via `puppeteer-core`, no download), boots `dist/matrix.html`, seeds data,
  and asserts the app **boots with no uncaught error, every rail view renders, every wired handler
  resolves to a real function, and every ready export opens**. The handler scan is what catches the
  dead-`onclick` class the build can't see.
- **`npm run verify` = build + unit + smoke = "can this ship?"** Run it before calling anything done.
  (Override the browser with `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH`.)

---

## Localization

Runtime EN/FR/ZH via `t('English key')` (`core/i18n.js`) — English is the key, missing translations
fall back to English so nothing ever renders blank. Roughly half the strings are translated; the
rest render in English. Remaining translation work is tracked in [BACKLOG.md](BACKLOG.md).
