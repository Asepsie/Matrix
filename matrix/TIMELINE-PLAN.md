# TIMELINE → CAPACITY-SCHEDULED PIPELINE — plan & TODO

Scope: turn the Timeline ([src/sections/timeline.js](src/sections/timeline.js)) from a
read-only Gantt of *committed* work into a **forward capacity planner** — schedule
pipeline candidates against the team's free capacity over time, per discipline, and see
where they breach. This operationalises the whole reframe thesis ("what to build **and**
who builds it") on the time axis. Part of the IA reframe (see the `ia-reframe` memory);
follows the PIPELINE-PLAN / HOME conventions.

---

## The idea in one paragraph

Today's Timeline shows active projects' allocations month-by-month (from `allocRows`) with
engineer-conflict highlighting. It says nothing about **headroom** or the **pipeline**. The
new **Capacity-plan mode** adds three stacked lanes on the same month axis:

1. **Committed** — active projects' load per month (today's Timeline data).
2. **Free capacity** — the headroom envelope per month (supply − committed), total **and per
   discipline** (engGroup), reusing the `pipelineCapacity` supply math but resolved per month.
3. **Scheduled candidates** — pipeline candidates (`proposed`/`on_hold`) placed at a start
   month; each spreads its `charter.demand` across months and draws down the free envelope.

Set/drag a candidate's start month → the plan re-levels and flags any month × discipline that
goes negative. The Pipeline board's *static* single-period greedy frontier becomes a
**scheduled, resource-leveled plan**: *"when can we start candidate X without over-committing
Engineering in Q3?"*

It reuses everything already built: `charter.demand {peakFte, fteMonths, byGroup}` (per-
discipline demand), `pipelineCapacity`/`_buildEngUtil` (supply), `allocRows` (committed),
`projLifecycle` (candidacy), the per-discipline breach idea from `pipeFrontier`.

---

## The pure engine (Phase 1 — DONE 2026-08-23, global-free)

Built in [timeline.js](src/sections/timeline.js) + `tests/timeline.test.js` (19 tests, 271 total
green): `tlSpreadDemand`, `tlCapacityByMonth`, `tlSchedule`, `tlEarliestFit` — all `export`ed,
statically imported into Node (no globalThis seam needed, they're fully pure). Original spec below.

## The pure engine — spec

All in timeline.js, `tl`-prefixed, importable into Node like pipeline.test.js:

- **`tlSpreadDemand(demand, startIdx, horizon)`** — from `{peakFte, fteMonths, byGroup}` +
  a start month index + the horizon length, return a per-month load: `{ months:[{total, byGroup:{gid:load}}…] }`.
  Duration = `ceil(fteMonths / peakFte)` (peakFte = monthly rate; final month partial), split
  across disciplines by the `byGroup` proportions; clamp to `[startIdx, horizon)`. No byGroup →
  all load in an `_unassigned` bucket. Null/zero demand → empty spread.
- **`tlCapacityByMonth(engUtilList, months)`** — per-month `{supply, committed, free, byGroup:{gid:{supply,committed,free}}}`
  from an engUtil-shaped list (the same input `pipelineCapacity` rolls up, but kept month-
  resolved). `committed` caps at 1/person/month; `free = max(0, supply − committed)`. Pure.
- **`tlSchedule(candidates, capByMonth)`** — walk candidates in ranked order; for each, spread
  its demand from its `startIdx` and draw down a running free-envelope copy; set
  `cand.scheduled = {startIdx, spread}` and `cand.breach = [{monthIdx, gid, short}]` for every
  month×discipline that would go negative. Returns the post-plan envelope. Non-mutating on the
  capacity input (works on a clone).
- **`tlEarliestFit(demand, capByMonth, fromIdx)`** — the earliest start index at which the
  spread fits under free capacity for its whole duration (the auto-level helper); `-1` if it
  never fits in the horizon.
- **Accept:** `tests/timeline.test.js` green — spread duration/partition/clamp, per-month
  free math, breach detection (total AND per-discipline), earliest-fit, empty/null tolerance.
  Follow the pipeline.test.js globalThis-seam pattern for any engUtil input.

---

## Status — SHIPPED 2026-08-23 (Phases 1–5)

Decisions taken: **(1) persist** on `charter.demand.startMonth`; **(2) manual + Auto-level**;
**(3) what-if overlay** (never writes `allocRows`). All built & verified in-browser:
- **Phase 2** — `tlCapacityByMonth(Object.values(_buildEngUtil(months)), months)` is the seam.
- **Phase 3** — Gantt/Plan **mode toggle** (`tlModeBar`/`tlSetMode`); the plan view
  (`renderTimelinePlan`) shows FREE + COMMITTED summary rows and per-candidate spread rows over
  the month axis.
- **Phase 4** — per-candidate start selector (`tlSetStart` → persists `startMonth`) + **Auto-level**
  (`tlAutoLevel`, greedy earliest-fit drawing down a running envelope). Model: `startMonth` added to
  `makeCharterDemand` + back-filled in `sanitiseCharter` (rides `projects[]`, retro-compat null).
- **Phase 5** — per-candidate ✓ fits / ⛔ over-capacity / ⋯ clipped flag + red breach cells (from
  `tlSchedule.breach`, per-discipline aware). Fund hand-off (deep-link/`projSetLifecycle`) still TODO.
- **Verified:** scheduled candidate fits (✓); Auto-level placed the two that fit and **refused** an
  over-capacity one (needs 3 FTE/mo in a 2-person discipline); manual over-placement flags ⛔;
  starts persist; Gantt mode unregressed; no console errors.

**Remaining:** Phase 5 Fund hand-off button · Phase 6 polish (per-discipline expand rows, richer
breach tooltip naming the month/discipline, empty-state copy, i18n sweep).

## ⛔ STOP after Phase 1 — three decisions before any UI/behaviour (RESOLVED — see Status above)

These change data and/or model semantics, so confirm before building:

1. **Where the scheduled start persists.** Recommend `charter.demand.startMonth` (a `'YYYY-MM'`
   string or null) — rides `projects[]` for free (add to `makeCharterDemand` + `sanitiseCharter`,
   retro-compat back-fill = null). Alternative: session-only (like the Pipeline board controls),
   which means the plan evaporates on reload. **Recommend persisted.**
2. **Auto-level vs. manual.** Does the planner auto-place candidates at earliest-fit
   (`tlEarliestFit`), or does the user set each start by hand? **Recommend both:** manual start +
   an "Auto-level" button that fills starts with earliest-fit in ranked order.
3. **Capacity model = overlay, not mutation.** Committed baseline = `allocRows` of *active*
   projects; scheduled candidates are a **what-if overlay** that never writes `allocRows`
   (funding a candidate later, via the Pipeline board, is what creates real allocations). Confirm
   this what-if framing (the alternative — provisionally reserving capacity — is bigger scope).

---

## Phases (after the decisions)

### 2. Month-resolved capacity seam · MEDIUM
Feed `tlCapacityByMonth` from the live `_buildEngUtil(months)` (the impure edge). Keep the roll-up
(`pipelineCapacity`) and this per-month view consistent — ideally derive the roll-up from the
per-month result so they can't drift.

### 3. Capacity-plan MODE on the Timeline · HIGH
A mode toggle on the Timeline view: **Gantt (committed)** — today's grid — vs **Capacity plan
(forward)** — the three-lane view. Per-month free shown as a headroom bar (green→amber→red as it
fills); per-discipline sub-rows optional/expandable. Monolithic re-render is fine.
- **Accept:** the mode renders committed + free + scheduled lanes over the month range; a
  breached month×discipline reads at a glance; no regression to the existing Gantt.

### 4. Scheduling interaction + persistence · HIGH
A candidate palette (the `proposed`/`on_hold` projects with demand). Set a start month
(dropdown or drag onto the axis); "Auto-level" button; clear. Writes `charter.demand.startMonth`
(per decision 1) → `saveState`.
- **Accept:** moving a start re-levels live; auto-level fills feasible starts; persists across
  reload.

### 5. Breach flagging + fund hand-off · MEDIUM
Per-candidate "fits / breaches {discipline} in {month}" summary (reuse `tlSchedule.breach`); a
**Fund** action that deep-links to the Pipeline board / calls `projSetLifecycle('active')` so the
plan turns into commitment where the decision is actually owned.
- **Accept:** a candidate over one discipline in one month is flagged even if the total fits;
  Fund transitions it and it moves from the candidate lane toward committed on next render.

### 6. Polish · LOWER
i18n wrap, empty states (no period / no candidates / no capacity), reduced-motion, verify-in-
browser against a seeded multi-discipline dataset.

---

## Ground rules

- Build: `node build.js`. Tests: `node --test tests/*.test.js`. Heed the six invariants — esp.
  **never write `*/` in a block comment**, and no duplicate top-level declarations.
- A green build only *parses* the bundle; verify anything user-visible in-browser (seed a period +
  engineers + allocRows + candidates with `charter.demand`, land on `timeline`, read the DOM).
- Keep the Phase-1 engine **global-free** (import into Node without DOM/globals), per the
  pipeline.test.js pattern.
- New field `charter.demand.startMonth` rides `projects[]` → no MUST_PERSIST entry; DO add it to
  `makeCharterDemand` + `sanitiseCharter` (retro-compat back-fill to null).
- Reuse, don't reinvent: `pipelineCapacity` supply math, `pipeFrontier` per-discipline breach
  shape, `charter.demand.byGroup`, `projLifecycle`/`pipeIsCandidate`.
