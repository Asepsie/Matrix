# BACKLOG — Project Matrix

The single list of forward work. Replaces the old scattered `*-PLAN.md` docs (their
shipped history is in git). Add items here; move the big *why/how* into
[ARCHITECTURE.md](ARCHITECTURE.md) only once it's built and non-obvious.

**Convention:** `[P1]` do-next · `[P2]` soon · `[P3]` someday · `[IDEA]` unshaped.
Each item is one line of intent + enough context to start. Ground rule for every item:
finish with **`npm run verify`** green (build + unit + smoke).

---

## Strategic (the frame, not tickets)

- **Focus over breadth.** The app's surface is enormous for its size and the value prop has
  been re-litigated repeatedly. Before building *new* surface, prefer merging/cutting to make
  the existing surface cohere. When two features overlap, consolidate rather than add a third.
- **The render architecture is the long-term risk.** Everything is `innerHTML` string-building
  with per-site manual escaping and one global scope — the root cause of the escaping, theming,
  and dead-handler bug classes. A full migration is out of scope, but: (a) keep the smoke net
  green as the guardrail, (b) don't grow the pattern where a small component could be isolated.

## Testing / safety net (just shipped — keep growing it)

- `[P2]` Extend the smoke test to **open the JS-built modals** too (ID card, skills dialog,
  charter/decision panels), so their handlers are covered by the same existence scan — today it
  covers static overlays + every rail view + every ready export. `tests/smoke.mjs`.
- `[P3]` Light **click-crawl**: after rendering each view, actually invoke a sample of its
  buttons in a sandbox to catch throws the static scan can't (guarded so it can't mutate/persist).
- `[P3]` Wire `npm run verify` into CI (GitHub Actions) with a headless Chrome so the ship gate
  runs on every push, not just locally.

## Guided tour (removed 2026-09-01 — keep the idea)

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

- `[P3]` `dashboard.js` still defines the legacy `exportDashboardPDF`/`_doExportDashboardPDF`
  (old `document.write` path) with no caller since the balancer moved onto the export engine —
  safe to delete.
- `[P3]` `#icon-picker` in `index.html` looks orphaned (nothing opens it; the live milestone
  picker is `#sched-icon-picker` in `modals.js`) — verify and remove the dead markup.
