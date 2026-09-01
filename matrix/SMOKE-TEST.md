# SMOKE-TEST.md — Post-IA-reframe (Track B) full-app smoke test

Run this after the **Track B navigation-simplification** work to confirm every merged
view still works end-to-end in the real app. Self-contained: assumes no prior context.

Track B collapsed the rail from ~29 views to **18** by merging redundant views into
lenses/modes/tabs and cutting/relocating a few. Nothing lost; the CAPACITY commit-loop
was *added*. This test walks the new structure.

---

## 0. Run the app (required — `file://` will NOT work in the browser pane)

```bash
node build.js                 # must print "✓ All invariant checks passed"
node --test tests/*.test.js    # must print 271 pass, 0 fail
```

Then serve `dist/` over localhost and open it in the in-app Browser pane
(`file://` won't run the bundle there):

```bash
python -m http.server 8899 --directory dist
```

Open `http://localhost:8899/matrix.html`. A `404` for the favicon in the console is
**benign** — ignore it. There should be **zero other console errors** at any step.

> **Verify via DOM, not screenshots.** Screenshots don't composite reliably in the
> automation pane. Use `read_page` / `javascript_tool` (read element ids, class lists,
> `innerHTML.length`) — that's ground truth here.

---

## 1. Seed a dataset (paste into the page console / `javascript_tool`)

Gives you: 2 projects (one **active** with charter+financials+channel+cost, one
**proposed** with a capacity demand), 2 engineers (one skilled → a SPOF), one allocation.

```js
(function(){
  // period so getMonthRange() is non-empty
  var s=document.getElementById('res-start'), e=document.getElementById('res-end');
  if(s&&e){ s.value='2026-01'; e.value='2026-08'; }
  // active project with full charter data
  var p=makeProject({name:'Aurora'}); p.id=1; p.lifecycle='active'; p.sector='Core'; p.x=6; p.y=8; p.vis=7; p.ena=5;
  var c=p.charter; c.priority='High'; c.status='In Review'; c.businessCase='Flagship platform.';
  c.expectedRevenueM=12.5; c.financials.initialInvestment=2000000; c.financials.cashFlows=[500000,900000,1200000,1400000];
  c.financials.discountRate=0.1; c.financials.pricePerUnit=100; c.financials.variableCostPerUnit=60;
  c.strategy.alignment=8; c.rnd.alignment=6; c.decision.stances.time='sacrifice';
  c.channelModel=makeChannelModel(); c.channelModel.channels=[
    Object.assign(makeChannel(),{name:'Direct',pct:60,margin:40,partner:'Acme',segment:'Enterprise'}),
    Object.assign(makeChannel(),{name:'Reseller',pct:40,margin:25,partner:'Chan',segment:'SMB'})];
  c.costModel={subsystems:[{name:'Board',target:30,current:35,include:true,items:[]}],levers:[],competitors:[]};
  projects.push(p);
  // proposed candidate with a capacity demand (for the commit-loop)
  var q=makeProject({name:'Beacon'}); q.id=2; q.lifecycle='proposed';
  q.charter.demand={peakFte:2, fteMonths:6, byGroup:{}, startMonth:'2026-02'};
  projects.push(q);
  // engineers: Ana holds a critical SPOF skill
  var a=makeEngineer({name:'Ana'}); a.id=1; a.vacant=false; a.monthlyCost=8000;
  a.skills=[{name:'Rust',level:5,cat:'crit',domain:'Backend'},{name:'SQL',level:4,cat:'mand',domain:'Backend'}];
  var b=makeEngineer({name:'Ben'}); b.id=2; b.vacant=false; b.monthlyCost=7000;
  b.skills=[{name:'SQL',level:3,cat:'mand',domain:'Backend'}];
  engineers.push(a,b);
  // one allocation of Ana onto Aurora
  var r={uid:newUid(),id:(typeof nextAllocId!=='undefined'?nextAllocId++:1),engId:1,projectId:1,allocs:{'2026-01':0.8,'2026-02':0.8,'2026-03':0.8},budgetLine:''};
  allocRows.push(r);
  saveState();
  return 'seeded: '+projects.length+' projects, '+engineers.length+' engineers, '+allocRows.length+' allocs';
})();
```

Reload once after seeding so everything re-reads from state.

---

## 2. Current navigation map (what you should see)

**Rail domains → views (17):**

| Domain | Views |
|--------|-------|
| **HOME** | Home |
| **PORTFOLIO** | Portfolio matrix · Pipeline · Gate & PI · **Project workspace** · Portfolio analytics |
| **PLAN** | **Resource plan** · Resource balancer · Backlog & planner |
| **PEOPLE** | Roster · Org chart · **Skills** `SPOF` · **Talent placement** (Nine-box\|DISC lens) · Development · Engagement · **People analytics** |
| **REVIEW** | Executive summary |

**Rail utility foot (7):** Export · Collaborate · Archive · **Data** · AI advisor · Settings · Help

**Gone from the rail (merged/cut/relocated):** Financials analysis, Trade-off decision,
Channel mix, Design to cost (→ Project workspace tabs) · Portfolio economics (→ Portfolio
analytics *Economics* lens) · Compare (→ matrix `⧉ COMPARE` toolbar button) · Skill risk
(→ Skills *Risk* lens) · Heatmap (**removed**) · Timeline (→ Resource plan *Gantt/Ribbon/
Capacity* modes) · Team profiles (→ People analytics *Profiles* lens) · Project brief (→
**Export** door deliverable) · Summary (**cut**) · Snapshots/Backup/Restore (→ **Data** menu) ·
Nine-box, DISC (→ **Talent placement** *Nine-box/DISC* lens).

---

## 3. Checklist — click through each and confirm

Track any failure with the exact view + console error. Expected: every item passes, no
console errors (favicon 404 aside).

### PORTFOLIO
- [ ] **Project workspace** (`PORTFOLIO › Project workspace`): a project picker + tab bar
  **Overview · Demands · Financials · Trade-off · Channels · Design-to-cost**. Switch every
  tab — each renders. Edit one field per tab (e.g. business case, a cash flow, a stance, a
  channel share, a subsystem target); reload; confirm it persisted. Slides/Synopsis buttons
  open. ← BACK / Esc returns to the matrix cleanly (rail highlight correct).
- [ ] **Portfolio analytics**: header has an **Overview | Economics** lens toggle. Overview
  shows ROI/treemap/burn/gates/sectors/risk/distribution. Economics shows NPV/PI capital
  allocation, channel profit pools, margin realism, decision quality, mix-shift what-if.
  Interactive controls in each lens re-render in place.
- [ ] **Portfolio matrix**: toolbar has Y-AXIS `IMPACT/VISIBILITY/ENABLER` **and** a
  `⧉ COMPARE` button. Click Compare → two-panel dual-Y split (seeded from current Y-mode);
  Esc closes it and returns to the matrix (not a stray back-nav). The `c` key also opens it.

### PLAN
- [ ] **Resource plan**: a **MODE bar** `GRID · GANTT · RIBBON · CAPACITY`. GRID = the
  editable allocation grid (edit a cell → persists, stays in GRID). GANTT/RIBBON/CAPACITY
  render the timeline views with the same shared bar.
- [ ] **CAPACITY commit-loop**: in CAPACITY mode, the *Beacon* candidate row (start month set)
  shows a **⤓ Commit** button. Click it → confirm dialog → after confirming, an auto snapshot
  is taken and unassigned staffing rows appear on Beacon in the GRID (by-project grouping).
  The button flips to ✓. Beacon stays `proposed` (funding is separate). Re-commit replaces
  only its own committed rows (a manual unassigned row survives).

### PEOPLE
- [ ] **Skills**: an **Matrix | Risk** lens toggle. Matrix = skill inventory (rename/merge/
  split, domains). Risk = SPOF/coverage/KT planner (Ana's `Rust` shows as a critical SPOF).
- [ ] **Talent placement**: a **Nine-box | DISC** lens toggle. Nine-box = the Perf×Potential
  grid (drag-to-place, per-year history/compare). DISC = the four behavioural quadrants. Lens is
  remember-last (switch to DISC, reload → opens on DISC). Both drag surfaces still edit + persist;
  each lens's EXPORT button opens the builder (needs ≥1 placement).
- [ ] **People analytics**: an **Analytics | Profiles** lens toggle. Analytics = story/
  dimension charts. Profiles = the team card grid (Export dashboard / full / CSV buttons).

### Utilities
- [ ] **Data** (rail foot): opens a small menu with **Snapshots / Backup / Restore**. Snapshots
  opens the snapshot browser; Backup downloads a full backup; Restore prompts for a file. Esc
  closes the menu.
- [ ] **Export** (rail foot): the picker lists **Project brief** (domain PORTFOLIO) among the
  deliverables. Open it → the shared builder opens with **one toggle per project** (project
  scope) + content blocks (team/risks/todos/milestones/actions) + PDF/HTML. Toggling a project
  off drops it from the preview.

### Cross-links (regression check)
- [ ] **Resource balancer** `⊟ TIMELINE` button → Resource plan (Gantt). A per-resource `◧`
  link → Resource plan (Ribbon), lane focused.
- [ ] **Executive summary** KPIs/alerts drill correctly: NPV/PI/conflicts → Portfolio analytics
  *Economics* lens; SPOF people → Skills *Risk* lens; overdue/blocked → Portfolio analytics
  *Overview*.
- [ ] **`s` key** opens the Executive summary (the cut Summary's successor).
- [ ] **Home** deep-links (Action Queue): charter-conflict → workspace Trade-off; value-
  destroying → workspace Financials; dtc-gap → workspace Design-to-cost; channel-concentration
  → workspace Channels.

---

## 4. Pass criteria
- `node build.js` clean, `node --test tests/*.test.js` = 271/0.
- Every checklist item passes.
- **Zero console errors** across the whole walk (favicon 404 excepted).

Design detail for any item is in **ARCHITECTURE.md** (search the relevant Track B section) and
the running plan lives in the `ia-reframe` memory.
