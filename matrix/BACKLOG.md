# BACKLOG — Project Matrix

The single list of forward work. Replaces the old scattered `*-PLAN.md` docs (their
shipped history is in git). Add items here; move the big *why/how* into
[ARCHITECTURE.md](ARCHITECTURE.md) only once it's built and non-obvious.

**Convention:** `[P1]` do-next · `[P2]` soon · `[P3]` someday · `[IDEA]` unshaped.
Each item is one line of intent + enough context to start. Ground rule for every item:
finish with **`npm run verify`** green (build + unit + smoke).

---

## ✓ SHIPPED — new-user onboarding & safety (P1, designed + built 2026-09-02)

**All three features (C · A · B) shipped 2026-09-02** — see each sub-section below. The supporting
`[P2]` lifecycle-`proposed` trap and the `[P3]` items remain open. Kept here (not deleted) because
the sub-sections document the shipped design; move detail into ARCHITECTURE.md if it needs expanding.

The problem it solved: every valuable view is a **join** over data entered elsewhere, so a new user
lands on zeros / "set FROM–TO dates first" and doesn't know the order. The fix made the app *safe to
explore* with three coordinated features (data-driven not scripted; dismissible; undo single-user-first).

**The value spine (the ordered path to first value) — the shared model behind A + the empty states:**

| Stage | Action (view) | "done" test |
|-------|---------------|-------------|
| Team | add people (Roster) | `engineers.filter(e=>!e.vacant).length > 0` |
| Projects | add projects (Matrix) | `projects.length > 0` |
| Horizon | set FROM–TO period (res header) | `getMonthRange().length > 0` |
| Allocate | staff people→projects (Plan) | some `allocRows` alloc > 0 **and** ≥1 project `lifecycle==='active'` |
| Review | Balancer · Exec · Home · Analytics | unlocked once the 4 above are done (destination, never "done") |
| Deepen (optional) | Charter € · Gate · Skills · nine-box/DISC · risks | enriches Review; sub-progress, never blocking |

### C. One-click "Load sample data"  ·  SHIPPED 2026-09-02
- `build.js` embeds `demo/matrix_demo_backup.json` as the `SAMPLE_BACKUP` global (so the single-file
  app needs no fetch — works from `file://`; emitted as `JSON.parse(<escaped-literal>)`, `</script>`
  + U+2028/9 guarded; `null` when the asset is absent → both entry points self-disable).
- `backup.js`: `importFullBackup`'s apply logic is now the shared `applyBackupState(d)` (returns the
  id→uid map; force-actives a legacy no-gateConfig/no-lifecycle dataset so its capacity isn't
  suppressed) — reused by `loadSampleData()` and mirrored by the smoke replica. `clearAndStartMine()`
  is the "start mine" counterpart (snapshot → clear → reload, same path as `resetAll`).
- Entry points: **🎬 Load sample data** on the first-run chooser + the Home empty-state banner;
  a dismissible "you're exploring sample data · Clear & start mine" strip while the sample is loaded
  (per-device `sampleLoaded` flag in `eim_home_prefs`). Smoke net covers the whole surface.

### A. Data-driven value-spine strip ("you are here")  ·  SHIPPED 2026-09-02
- `src/sections/spine.js` renders a fixed global band (`#spine-band`) ABOVE the z-400 view overlays;
  it publishes its height as CSS `--spine-h`, and `nav.css` offsets the view overlays + `body` by that
  var, so when the strip retires (`--spine-h:0`) the layout is byte-identical to before. 5 live nodes
  (Team→roster · Projects→matrix · Horizon→plan · Allocate→plan · Review→dashboard); each node's state
  (done/current/locked/ready) is recomputed from data on every render (`spineStates()`), so it can't go
  stale. Clicking deep-links via `railGo`. Re-rendered from `railGo` (nav) + `saveState` (`spineRefresh`).
- **Dismissible & self-retiring:** `spineDismiss()` (session), `spineHideForever()` (permanent — rail
  pref `railGuideOff`, per-device, NOT app state/backup/collab), auto-retires once steps 1–4 are done,
  re-openable from Help → "↳ Show setup guide" (`spineShow`).
- **Teaching empty states:** `teachEmpty({icon,title,msg,ctaLabel,ctaView})` (spine.js) generalises the
  Balancer's `db-suppress` banner (accent-tinted, escapes input, CTA deep-links). Wired into the Plan
  (no people/projects/dates/allocations) and the Balancer ("nothing to balance yet"). Smoke covers the
  strip (visible on empty, 5 nodes, handlers resolve, auto-retire) + teachEmpty escaping.

### B. Global undo / redo (Ctrl-Z / Ctrl-Shift-Z)  ·  SHIPPED 2026-09-02
- `src/core/undo.js`: a ring buffer (`_UNDO_MAX=50`) of deep-cloned `captureScope('full')` snapshots.
  `_doSave` calls `_undoRecordCommit()` (post-debounce → **one undo = one logical edit**), guarded by
  `_undoApplying` so an undo's own save doesn't re-record. `undoRedo(isRedo)` swaps undo/redo stacks,
  `_undoApply(d)` assigns the clone back intra-dataset (uids ride in the clone — no reuse dance) +
  `uidMigrate`, `saveNow()`, then `_undoRerender()`.
- Keys in `boot.js` (`Ctrl/Cmd+Z` · `Ctrl+Shift+Z`/`Ctrl+Y`) behind the `inInput` gate so a field's
  native undo wins; placed before the bare-`z` Snapshot shortcut. Small count-delta toast
  ("Undo · −1 project"). Help panel lists the shortcuts.
- **Discoverability:** always-visible `#undo-dock` (bottom-right — the `#topbar` is covered by the
  z-400 view overlays); buttons disable when their stack is empty. **Collab:** disabled while
  `collabInRoom()` (v1 single-user-first; a whole-state restore could clobber a teammate — Y.UndoManager
  is the future fix). Photos stay with Snapshots. Smoke covers the add→undo→redo round-trip.

### Supporting (fold in alongside)
- `[P2]` **Lifecycle-`proposed` trap:** a freshly added project defaults to `proposed` → capacity
  suppressed → Balancer reads 0% → new user thinks it's broken. Default a manually-added project to
  `active`, or make the suppression loud + self-explaining on first encounter.
- ✓ **Progressive rail disclosure (SHIPPED 2026-09-02):** `railAdvanced` pref (rail prefs,
  per-device). A genuine first run (no rail prefs) starts in **Basics** — `RAIL_BASIC_VIEWS`
  = Home · Matrix · Plan · Balancer · Roster, with Collaborate + AI advisor hidden
  (`RAIL_BASIC_UTIL_HIDE`); everything else is behind a rail-foot **"Show advanced" / "Basics only"**
  toggle (`railToggleAdvanced`). railRender filters domains/views/utils (the active view is always
  kept visible). Existing users (prefs without the `advanced` key) default to the full rail — never
  disrupted. `railGo` auto-reveals when you navigate to an advanced view; `loadSampleData` reveals it
  too. Smoke: `rail-disclosure` (Basics renders fewer doms/views/utils; toggle present).
- ✓ **Graceful network degrade (SHIPPED 2026-09-02):** shared `netOnline()` + `netOfflineBanner(feature)`
  in `helpers.js`. Collaborate (`collabRefreshPanel` banner + disabled Connect; `collabConnect` bails
  before the CDN load) and AI advisor (`aiShowModelPicker` banner + disabled Select; `aiOpenChat`
  routes offline users to the picker) now show a plain "needs a network connection" notice instead of
  a cryptic import/fetch failure. `boot.js` online/offline listeners refresh open panels live. Smoke:
  `net-degrade` (banners appear offline, Connect disabled, clear when back online, banner escapes input).

**Acceptance for all three:** `npm run verify` green, and extend `tests/smoke.mjs` — the spine strip
renders with resolving handlers, undo/redo fire without throwing, and the sample-data button imports
without error.

---

## Strategic (the frame, not tickets)

- **Focus over breadth.** The app's surface is enormous for its size and the value prop has
  been re-litigated repeatedly. Before building *new* surface, prefer merging/cutting to make
  the existing surface cohere. When two features overlap, consolidate rather than add a third.
- **The render architecture is the long-term risk.** Everything is `innerHTML` string-building
  with per-site manual escaping and one global scope — the root cause of the escaping, theming,
  and dead-handler bug classes. A full migration is out of scope, but: (a) keep the smoke net
  green as the guardrail, (b) don't grow the pattern where a small component could be isolated.

## Testing / safety net (shipped — keep growing it)

Shipped: `npm run verify` (build + unit + smoke) enforced by a `.githooks/pre-push` hook
(enable per clone: `git config core.hooksPath .githooks`). The smoke net (`tests/smoke.mjs`)
seeds the realistic demo backup and covers every rail view + the ID card + every utility panel
(collab/archive/data/settings/help/ai) + the Esc chain + every ready export.

- `[P3]` Extend the modal coverage to the **charter / decision editor panels** (`cht-overlay`,
  `dec-overlay`) — the ID card and utility panels are covered, these two aren't yet.
- `[P3]` Light **click-crawl**: after rendering each view, actually invoke a sample of its
  buttons in a sandbox to catch throws the static scan can't (guarded so it can't mutate/persist).
- `[P3]` Also wire `npm run verify` into **CI** (GitHub Actions, headless Chrome) as a second
  gate — the pre-push hook is local-only and can be bypassed with `--no-verify`.
- `[P3]` **Harden the build's parse gate.** `build.js`'s `vm.Script` step let a stray top-level
  `}` (from a bad edit) through — the browser caught it, the build didn't. Confirm the parse gate
  hard-fails on a `SyntaxError` (the smoke net caught this one via boot failure, but the build
  should too).

## Guided tour (removed 2026-09-01 — reincarnated as the value-spine strip)

> The chosen replacement is the **data-driven value-spine strip** in *NEXT UP › A* above — a
> live "you are here" marker, not a scripted spotlight. Prefer that over rebuilding the old tour.

- `[IDEA]` **Re-introduce a guided tour / first-run walkthrough.** The old `tour.js`
  (Help-panel hub + spotlight steps, data-driven from `RAIL_DOMAINS`) was removed because it was
  a half-finished stub (most `TOUR_COPY` unwritten) adding surface without payoff. The *idea* is
  worth keeping: a short, genuinely useful onboarding for a first-time user. If rebuilt, do it
  **content-first** (write the walkthrough copy before the framework) and make it opt-in from Help.
  Reachable from git: `git show HEAD~1:src/sections/tour.js`.

## Export coverage (engine is done; a few views still lack a deliverable)

- `[P2]` **Gate & PI export** — the stage-gate board / PI roadmap has no deliverable. Add
  `gtExportBlocks()`/`gtExportOpen()` + a picker row.
- `[P3]` **DTC and Channel-mix exports** — synoptic visuals with no export path.
- `[P3]` **Unify charter deck/synopsis** onto the shared engine (currently their own working
  `window.print()` path — legitimately different, so optional).

## Timeline → capacity-scheduled pipeline (Phases 1–5 shipped)

- `[P2]` **Fund hand-off button** on the timeline capacity view — deep-link / `projSetLifecycle`
  to fund a scheduled candidate straight from the schedule.
- `[P3]` Polish: per-discipline expand rows, richer breach flagging.

## Personal Home (Phases 1–2 shipped)

- `[P3]` Optional **`Brief me` AI card** (→ `ai.js`).
- `[P3]` Migrate exec's *personal* pieces (`xsPlannerPins`/`xsScheduleSection` "my week") onto
  Home; exec keeps the portfolio-strategy tiles.
- `[P3]` Per-user layouts when in a shared room.

## Collaboration roadmap

- `[BLOCKED]` **Open governance question (decide first):** does policy accept
  confidentiality-via-E2E-link (no named access/revoke; the relay still sees metadata —
  membership, counts, timing), OR require named access + audit + revoke? The answer sets
  direction: the latter makes Hocuspocus the priority; the former means collab is ~feature-complete.
- `[P2]` **Photo sync** — photos are still per-machine (IndexedDB, uid-keyed); teammates don't
  see faces. Needs a uid-keyed out-of-band channel. Independent of the governance question — the
  best standalone next step.
- `[P2]` **Verified identity + named audit + revoke (Hocuspocus)** — real accounts, server-verified
  `actor`, per-user revoke; also closes the metadata-privacy gap. HIGH effort. Gated by the
  governance question above.
- `[P3]` Array/list element-level CRDT (lists are atomic LWW today); same-field text merge
  (needs `Y.Text`); extend uid-refs to the last id-based fields (`groupId`, `sectionId`,
  `_ktPlans.learnerEngId`, org-chart layout).

## Localization (≈half done)

- `[P2]` Finish FR/ZH translation. ~907 of ~1900 wrapped strings are translated; the rest render
  in English via fallback. Remaining sections to wrap/translate: nine-box, DISC, skills, charter,
  DTC, timeline. Rules: `t('English key')`; never route user data through `t()` (pre-escape);
  leave stored enum VALUES in English. Build prints the per-language coverage count.

## Known small debts

- `[P3]` The demo backup (`demo/matrix_demo_backup.json`) predates the gate/lifecycle model — it
  has no `gateConfig`, so the smoke net force-sets every project `active` after import. Regenerate
  it against the current schema (incl. nine-box placements, which it also lacks) so the seed is
  faithful and the nine-box export gets smoke coverage.
- `[P3]` Stale code-comment pointers to the deleted `*-PLAN.md` docs remain in a few source files
  (export.js, persist.js, model.js, exec.js, timeline.js) and `reference document/matrix-redevelopment.md`
  still says the tour is "supported" — cosmetic, update opportunistically.
