# BACKLOG — Project Matrix

The single list of forward work. Replaces the old scattered `*-PLAN.md` docs (their
shipped history is in git). Add items here; move the big *why/how* into
[ARCHITECTURE.md](ARCHITECTURE.md) only once it's built and non-obvious.

**Convention:** `[P1]` do-next · `[P2]` soon · `[P3]` someday · `[IDEA]` unshaped.
Each item is one line of intent + enough context to start. Ground rule for every item:
finish with **`npm run verify`** green (build + unit + smoke).

---

## ► NEXT UP — new-user onboarding & safety (P1, designed 2026-09-02)

The problem: every valuable view is a **join** over data entered elsewhere, so a new user lands on
zeros / "set FROM–TO dates first" and doesn't know the order. The fix is to make the app *safe to
explore* with three coordinated features. Design was settled with the user — **do not re-litigate**
the principles below (data-driven not scripted; dismissible; undo single-user-first). Build in this
suggested order (each de-risks the next); **confirm scope + ask questions before starting each.**

**The value spine (the ordered path to first value) — the shared model behind A + the empty states:**

| Stage | Action (view) | "done" test |
|-------|---------------|-------------|
| Team | add people (Roster) | `engineers.filter(e=>!e.vacant).length > 0` |
| Projects | add projects (Matrix) | `projects.length > 0` |
| Horizon | set FROM–TO period (res header) | `getMonthRange().length > 0` |
| Allocate | staff people→projects (Plan) | some `allocRows` alloc > 0 **and** ≥1 project `lifecycle==='active'` |
| Review | Balancer · Exec · Home · Analytics | unlocked once the 4 above are done (destination, never "done") |
| Deepen (optional) | Charter € · Gate · Skills · nine-box/DISC · risks | enriches Review; sub-progress, never blocking |

### C. One-click "Load sample data"  ·  smallest, highest immediate value — suggested first
- A first-run **"Load sample data"** button (Home / first-run landing) that imports the bundled
  `demo/matrix_demo_backup.json` (40 people / 6 projects) so a newcomer sees every view alive in
  one click, plus a **"Clear & start mine"** counterpart. Reuse `importFullBackup`'s apply path
  (see `backup.js`) but read the bundled asset instead of a file input (the smoke net already has a
  headless replica of that apply logic in `tests/smoke.mjs` → `applyBackupState`, use it as the map).
- **Gotcha:** the demo predates the lifecycle model (no `gateConfig`), so imported projects migrate
  to `proposed` and their capacity is suppressed → set them `active` on load (as the smoke net does),
  OR regenerate the demo against the current schema first (see *Known small debts*).

### A. Data-driven value-spine strip ("you are here")  ·  the guided tour, reincarnated
- A slim, persistent strip (top of Home or a collapsible header band) rendering the spine above.
  Each node's state is **computed live from data** (table above) — done / current / locked / optional
  — so it's self-updating and **never a stale scripted tour** (that's why `tour.js` was removed; see
  [Guided tour] below). "Current" = the first incomplete stage (or the view you're on). Clicking a
  node deep-links via `railGo(null, viewId)`.
- **Dismissible & self-retiring** (this is required): inline, never a modal, never blocks input;
  **Dismiss** (hide now) + **Don't show again** (permanent), stored in a **per-device pref** like
  `eim_home_prefs` / rail prefs — NOT app state, NOT backups, NOT collab. Auto-hides once the spine
  is complete; re-openable from Help ("Show setup guide").
- Pair with **teaching empty states**: generalize the Balancer's suppression-banner pattern so every
  empty view says *why* it's empty and links the fix ("No allocations yet — staff the Plan →").

### B. Global undo / redo (Ctrl-Z / Ctrl-Shift-Z)  ·  the biggest confidence win, largest effort
- Removes the "I'll break something" fear that blocks new users. Feasible because every mutation
  funnels through `saveState()`/`saveNow()` and the main state (`engineers`/`projects`/`allocRows` +
  in-memory nine-box/DISC placements) is plain JSON. Implement a **ring buffer (~30–50) of prior
  state snapshots**; Ctrl-Z restores previous + re-renders; hook at the **committed (post-debounce)**
  save so one undo = one logical edit.
- **Caveats (scope carefully):** (1) do NOT hijack Ctrl-Z while focused in input/textarea/select —
  reuse boot.js's existing `inInput` gate, let the field's native undo win; (2) include placements in
  the snapshot, leave **photos** to Snapshots (IndexedDB, rarer destructive ops); (3) **collab room**
  is the hard part — a naive full-state restore re-pushes old values and can clobber a teammate's
  concurrent edit, so ship **v1 single-user-robust** and either treat undo as a normal local change
  or later adopt Yjs `Y.UndoManager`; (4) add **redo** and a small toast ("Undid: added project
  Alpha") reusing the change descriptions already built for the collab audit log.
- Relationship: **undo = fine-grained recent edits; Snapshots = coarse named checkpoints** — they
  complement, don't replace.

### Supporting (fold in alongside)
- `[P2]` **Lifecycle-`proposed` trap:** a freshly added project defaults to `proposed` → capacity
  suppressed → Balancer reads 0% → new user thinks it's broken. Default a manually-added project to
  `active`, or make the suppression loud + self-explaining on first encounter.
- `[P3]` **Progressive rail disclosure:** start a new user in a basics set (Home, Roster, Matrix,
  Plan, Balancer) and reveal advanced domains (Gate & PI, DTC, Channels, Pipeline, deep Analytics,
  Collaborate) behind a "Show advanced" toggle.
- `[P3]` **Degrade the network-dependent features gracefully:** Collaborate (Yjs) and AI advisor
  (WebLLM) dynamically import from esm.sh + need the relay — make both clearly optional with a plain
  "needs a network connection" message so a newcomer never hits a confusing failure.

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
