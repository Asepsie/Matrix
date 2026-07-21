# Deliverable & Output Layer — Implementation Plan

> **STATUS UPDATE (2026-07-20) — read this before the rest of the doc.** This plan
> underestimated the problem: an app-wide audit found **~40 export functions across 10
> files**, not the handful implied below, and several claims here are now stale (the charter
> deck/synopsis in §3 "D2/D3" already exist, just not via this engine). Scope was explicitly
> narrowed with the user after that audit — see `ARCHITECTURE.md` › "Export engine" and
> memory `output-layer-export-engine` for the current, confirmed design:
> - Only the **~22 visual/print** exports (PDF/PNG/SVG/HTML) are in scope for this engine;
>   the ~15 plain CSV/JSON data-dump exports stay as they are (out of scope, by design).
> - The engine now has a **drag-and-drop content/template builder** (`exportOpenBuilder`,
>   not in this plan's original §2) and a **Settings › EXPORT THEME** control (app theme
>   default / light print theme, user-overridable per export) — the plan's §2.2 "light paper
>   default" idea was rejected in favor of a real user-facing choice.
> - The exec pack (D1) and ALL FOUR profile-related deliverables (single profile, profiles
>   dashboard, "full profiles", project brief — D4) are fully migrated onto the shared
>   drag-and-drop builder, incl. FORMAT/COLUMNS controls and no more auto-triggered print —
>   see ARCHITECTURE.md › "Export engine" › "profiles.js: full builder migration". The rest of
>   this document's phasing (D2–D5) is directionally still useful but not authoritative —
>   re-confirm scope with the user before resuming, rather than treating the table in §4 as a
>   checklist.

**Audience:** a developer starting a fresh session on Project Matrix.
**Goal:** turn the tool's rich data model into **great, professional, versatile,
easy-to-use deliverables** — the one-page cockpits, decks, briefs and profile packs
people actually present. Valuable for training (produce a polished artifact from a
scenario) and a credibility requirement for professional use.

Read **CLAUDE.md** and **ARCHITECTURE.md** first. This plan assumes the build/bundle
model described there (single-file `dist/matrix.html`, `node build.js`, classic-script
bundle, no framework).

---

## 1. Why this, and the core idea

The data model is deep (nine-box, DISC, skills, portfolio, charter, econ). What's thin
is the layer that **communicates** it. Today that layer exists but is **fragmented and
incomplete**:

- **Fragmented:** every export re-invents its own HTML shell, print CSS, color-adjust
  hacks and palette extraction. See in [profiles.js](src/sections/profiles.js):
  `profileExportPDF`, `profilesExportAllPDF`, `exportProfilesDashboardPDF/HTML/PNG/SVG`,
  `buildBriefHTML`/`exportProjectBrief`, `buildSingleProfilePageHTML`,
  `buildProfilesPageHTML`, `getProfileExportPalette`. Each opens `window.open` +
  `document.write` + `window.print` and hand-rolls its own `@media print` block.
- **Incomplete:** the **charter deck** and **executive synopsis** don't exist yet
  (overlay shells `cht-deck-overlay` / `cht-syn-overlay` are already referenced in
  [railnav.js](src/sections/railnav.js) close-list but never built; `chtOverviewTab`
  fields say they "feed the deck"). The **executive summary** ([exec.js](src/sections/exec.js)
  `renderExecTab`) is on-screen only — **no export path at all**.
- **Unowned:** [src/styles/print.css](src/styles/print.css) is an empty stub
  (`/* to be migrated */`) — all print styling lives duplicated inside JS builders.

**Core idea: build ONE export engine, then express every deliverable through it.**
Consolidate the scattered builders into a single, XSS-safe, branded rendering pipeline,
then add the two missing surfaces (deck, synopsis) and give the exec cockpit an export.
This is what makes the outputs feel like one professional product instead of six
different popups.

---

## 2. Target architecture — the Export Engine

New file: **`src/core/export.js`** (add to `JS_FILES` in `build.js`). One engine, used
by every deliverable surface. It owns everything the current builders duplicate.

### 2.1 The document shell — `exportOpen(spec)`

A single function that opens a print-ready window/tab and streams a **consistent**
document: cover, header/footer, page-break rules, print color-adjust, theming. Every
deliverable passes a `spec`, never its own `document.write` boilerplate.

```
exportOpen({
  title,                       // tab + <title> + cover title
  subtitle,                    // e.g. project name / date range
  brand,                       // { name, logo?, accent, palette } — see exportBrand()
  format,                      // 'print' | 'html' | 'png' | 'svg'
  pages: [ htmlString, ... ],  // each is one logical page/section (already escaped)
  autoprint: true,
})
```

Responsibilities (all currently copy-pasted per builder — centralise here):
- The `<!DOCTYPE>` + `<head>` with charset/title.
- **Print CSS** — migrate the duplicated `@media print{@page{size:A4;margin:…}}` +
  `-webkit-print-color-adjust:exact` rules out of the JS builders into a **single shared
  string constant** (`EXPORT_PRINT_CSS`) here, and finally populate
  [print.css](src/styles/print.css) for the on-screen side. One source of truth.
- The `<scr'+'ipt>…window.print…<\/script>` trigger (keep the split-token form — build.js
  invariant #1, no literal `</script>` in a JS string).
- Cover page + running header/footer + page-number CSS counters.

### 2.2 Branding — `exportBrand()`

Generalise the existing `getProfileExportPalette()` into a shared brand object so ALL
deliverables look identical:
- Pull the theme palette (the CSS vars in CLAUDE.md: `--bg/--surface/--text/--accent`…).
- Add an **org name + optional logo** (new UI-only pref, store alongside the rail prefs
  in `localStorage 'eim_rail_prefs'` — NOT app state/backups, mirror that pattern from
  ARCHITECTURE › nav rail). This is what makes it look "professional / white-labelled"
  and is the seam a future licence/tier could gate.
- Light "paper" theme for print by default (dark screen theme wastes toner); offer a
  "match screen theme" toggle.

### 2.3 XSS discipline (do NOT regress)

`document.write` **executes scripts** — ARCHITECTURE › XSS calls the profiles export the
single biggest sink. Every interpolated data field MUST go through `escH()` (text) or
`safeColor()` (colors) from [helpers.js](src/core/helpers.js). The engine should make the
safe path the easy path: helpers like `exportField(label,value)` that escape internally,
so a deliverable author can't forget. Add breakout tests (mirror
`tests/helpers.test.js`).

### 2.4 Chart/visual reuse

Deliverables need charts. Reuse the existing SVG builders rather than new deps
(`xsBubbleSvg`/`xsBurnSvg` in exec.js, `chtTriangleSVG`/`chtFinChartsHTML` in charter.js,
nine-box/matrix SVG). Factor the "give me an SVG for X as a self-contained string" calls
so both the on-screen view and the export share them. SVG embeds cleanly in print and is
crisp at any zoom — prefer it over PNG. Keep PNG/`toDataURL` as a best-effort fallback
(the profiles PNG export already documents the browser-security limitation).

---

## 3. The deliverables (surfaces)

Ordered by value. Each is a thin `spec` builder on top of the engine.

### D1 — Executive one-pager export  *(highest value, lowest effort)*
The exec cockpit ([exec.js](src/sections/exec.js) `renderExecTab`) already computes KPIs,
scorecard, spend, burn, attention — it just can't leave the screen. Add
`exportExecPack()` that feeds those same sections as `pages[]` to `exportOpen`. Because
the data functions already exist (`xsScorecard`, `xsSpendSection`, `xsBurnSvg`,
`xsAttention`), this is mostly wiring + a cover. **Ship this first — it proves the engine
end-to-end with minimal new logic.**

### D2 — Charter deck  *(the marquee missing feature)*
Build `chtDeck(projId)` rendering into the existing `cht-deck-overlay` shell. A **slide
deck** from the charter: cover (project + prize) → the one-paragraph case (overview) →
demands/conflicts → financials (NPV/IRR/payback via `chtFinResultsHTML`, charts via
`chtFinChartsHTML`, the trade-off triangle `chtTriangleSVG`) → decision card. On-screen
it's a slide viewer (prev/next, one `.slide` per section); "Export" hands the same slides
to `exportOpen({format:'print'})` with `@page{size:A4 landscape}` for a PDF deck. Versatile
= same content, two renderings (present on screen, export to PDF).

### D3 — Executive synopsis  *(the narrative deliverable)*
Build `chtSynopsis()` into `cht-syn-overlay`: a one-page **written** brief (not slides) —
auto-composed prose from the charter fields (situation → recommendation → financial case
→ ask), editable before export. This is the "great and easy" artifact for training: fill
the charter, get a presentable synopsis. Keep generation deterministic (pure function of
the dataset — no LLM dependency; the AI advisor stays optional/separate).

### D4 — Consolidate profile & portfolio exports  *(consolidation, not new UX)*
Re-point the existing profile/dashboard/brief builders in
[profiles.js](src/sections/profiles.js) at the engine so they drop their private shells
and share branding/print CSS. No user-facing feature change — this removes the
duplication that would otherwise multiply as D1–D3 land, and is where most of the
XSS-sink surface lives. Do it **after** D1 proves the engine so you refactor against a
known-good target.

### D5 — Unified "Export" affordance  *(the "easy to use" payoff)*
One consistent entry point instead of scattered buttons: an **Export** action (rail util
and/or a button on each view) opening a small picker — *what* (current view / exec pack /
charter deck / profile pack / portfolio brief) × *format* (PDF / standalone HTML / image)
× *scope* (all / filtered / selected). Presets ("Board pack", "1:1 profile", "Portfolio
review") make the common cases one click. This is what turns a pile of export functions
into a feature users can find.

---

## 4. Phasing

| Phase | Deliverable | Effort | Notes |
|-------|-------------|--------|-------|
| 0 | `export.js` engine skeleton: `exportOpen`, `exportBrand`, shared `EXPORT_PRINT_CSS`, escape helpers + tests | S | Foundation. No user-visible change yet. |
| 1 | **D1** exec one-pager export | S | Proves the engine end-to-end. First shippable win. |
| 2 | **D2** charter deck | M | The flagship. Uses existing charter/fin SVGs. |
| 3 | **D3** executive synopsis | M | Deterministic prose composer. |
| 4 | **D4** migrate profiles/brief onto the engine | M | Consolidation; kills duplication + shrinks XSS surface. |
| 5 | **D5** unified Export picker + presets + branding UI | S–M | The "easy to use" layer over everything above. |

Ship each phase independently (each is a usable increment). Phase 1 delivers value on day
one; the engine matures under real use before the big refactor in phase 4.

---

## 5. Constraints & gotchas (read before coding)

- **Single-file, no bundler.** New code = a new file in `JS_FILES` (build.js). No
  imports of external libs at build time; runtime dynamic `import()` is allowed (the
  Yjs/WebLLM pattern) but the output layer should need **no new deps** — SVG + print CSS
  cover it.
- **build.js invariants (CLAUDE.md §Critical invariants):** no literal `</script>` in JS
  strings (`'<scr'+'ipt>'`); the bundle must parse as a classic sloppy-mode script
  (`vm.Script`); **no duplicate top-level declarations** across files (the flat bundle is
  one scope — prefix everything `export*`/`EXPORT_*` and declare each identifier once);
  watch the line-based duplicate-decl checker (avoid `word =` in comments).
- **XSS:** `document.write` executes scripts — `escH()` every text field, `safeColor()`
  every color, at every interpolation. ARCHITECTURE › XSS is mandatory reading; there is
  no central choke point, so the engine's job is to *provide* one for exports.
- **Print fidelity:** always include `-webkit-print-color-adjust:exact` /
  `print-color-adjust:exact` or backgrounds/badges drop out (the existing builders show
  the exact incantation). Default to a light paper theme.
- **i18n:** labels via `t()`; but never route a user-data string through `t()` (interp
  inserts vars verbatim — pre-escape). Deck/synopsis static chrome should be translatable.
- **State is read-only here.** Exports are **pure functions of the dataset** (exec.js
  already states this) — the output layer must never mutate `engineers`/`projects`/etc.
  No `saveState()` from an export path.
- **Reuse the DOM placeholders:** `cht-deck-overlay` / `cht-syn-overlay` already exist in
  index.html's overlay set and railnav's close-list — wire into them, add the boot-timing
  care noted in ARCHITECTURE › nav rail (overlays after `{{JS}}` aren't in the DOM at boot).

---

## 6. Acceptance criteria

- One shared engine; **zero** per-deliverable `document.write` boilerplate remaining after
  phase 4. `print.css` populated; no duplicated `@media print` blocks in JS.
- Every deliverable renders with identical branding (org name/logo/palette) and a cover.
- Exec pack, charter deck, synopsis, profile pack, portfolio brief all reachable from one
  **Export** picker with format + scope options and at least 3 presets.
- XSS: a hostile project/engineer name **and** color exports without breakout or script
  execution — add to `tests/helpers.test.js` (mirror the existing in-browser check).
- `node build.js` passes all invariants; `node --test tests/*.test.js` green (add
  `tests/export.test.js`: shell structure, escape helpers, brand fallback, deterministic
  synopsis output for a fixed dataset).
- Verified in-browser via the preview workflow: open each deliverable, confirm print
  preview is clean (page breaks, colors, cover), screenshot as proof.

---

## 7. First session — concrete starting task

1. Create `src/core/export.js`, add to `JS_FILES`. Implement `exportOpen(spec)` +
   `EXPORT_PRINT_CSS` by **lifting** the shell/print logic out of
   `buildSingleProfilePageHTML` / `exportProfilesDashboardPDF` (don't invent — extract the
   proven code). Implement `exportBrand()` from `getProfileExportPalette()`.
2. Implement **D1 `exportExecPack()`** in exec.js calling the engine — smallest path to a
   real, shippable PDF and the engine's first real consumer.
3. Add `tests/export.test.js` (shell + escape) and verify the exec pack in the preview
   browser; screenshot the print preview.
4. Only then start D2 (charter deck).

Leave D4 (profiles migration) until the engine is proven by D1–D2, so the refactor targets
a stable API.

---

*Append a short section to ARCHITECTURE.md once the engine lands (its shape, the
brand-prefs storage key, and the XSS-safe export-field pattern) — future sessions will
need it, same convention as the rest of that doc.*
