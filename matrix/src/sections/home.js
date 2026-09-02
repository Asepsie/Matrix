/* ►► SECTION: HOME ◄◄  The personal, customizable front door.
 *
 * "Everything is a widget": a per-device grid the user composes from a curated
 * widget library. The hero widget is a cross-domain ACTION QUEUE ("what needs you,
 * ranked by consequence") that fuses the people × portfolio join no other tab
 * surfaces; every other widget is an optional, screen-sized read-out of an existing
 * dataset. Nothing here mutates app state — the only thing written is the per-device
 * pref key `eim_home_prefs` (layout + snooze/dismiss), like `eim_rail_prefs`. Never
 * app state, never in backups/collab.
 *
 * TWO layers, kept apart on purpose:
 *   1. ENGINE (pure, node-testable) — homeBuildActions + its classifiers. Takes plain
 *      inputs, calls no DOM/producer globals, so tests/home-actions.test.js feeds it
 *      fixtures. All the cross-domain merge/rank/state logic lives here.
 *   2. GATHER + UI — reads the bundle producers (buildAnalyticsDataset, gtBuildSignalMap,
 *      _buildEngUtil, tegThisWeekList …) and renders the grid. Depends on those files,
 *      so home.js loads LATE in JS_FILES.
 *
 * All identifiers are home/_home/HOME_-prefixed (flat-bundle uniqueness). Synced data
 * (names, project titles) is escH'd at every render sink; colours are static tokens.
 * i18n of Home's dynamic action text is deliberately deferred (chrome uses t()).
 */

/* ══════════════════════════════════════════════════════════════════════════
   1. ENGINE — pure classifiers, ranking, state (imported by the unit tests)
   ══════════════════════════════════════════════════════════════════════════ */

// One tunable object. retentionMin/Crit, overallocPct, benchPct, staleReviewMonths
// reuse the existing anRiskModel/anRiskColor conventions; the rest start here.
export const HOME_THRESHOLDS = {
  retentionMin:25, retentionCrit:50,
  overallocPct:105, overallocCrit:130,
  benchPct:10,
  staleReviewMonths:15,
  gateBehindPct:50,
  marginPct:15,
  hhi:0.6,
  spofBoost:1.5,
  holdStaleDays:90,
};

// Severity ordering: lower rank sorts first / is "worse".
export const HOME_BAND_RANK = { critical:0, warn:1, watch:2 };

// Which domain each concern belongs to (drives the top-bar filter chips).
const HOME_CONCERN_DOMAIN = {
  'retention-risk':'people', 'over-allocation':'people', 'bench':'people',
  'stale-review':'people', 'engagement-due':'people',
  'gate-blocked':'governance', 'gate-behind':'governance', 'hold-stale':'governance',
  'charter-conflict':'portfolio', 'value-destroying':'portfolio', 'candidate-stale':'portfolio',
  'low-unit-margin':'portfolio', 'dtc-gap':'portfolio', 'channel-concentration':'portfolio',
  'task-overdue':'planner', 'task-pinned':'planner',
};
function homeConcernDomain(c){ return HOME_CONCERN_DOMAIN[c] || 'action'; }

// Short base36 rolling hash over a signal string → the resurface trigger.
export function homeHash(str){
  str = String(str==null ? '' : str);
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

// Coarse bucket so a tiny signal drift does NOT resurface a dismissed item.
function homeBucket(n, step){ return Math.floor((+n||0) / (step||1)); }

// Monday date key 'YYYY-MM-DD' for a date (pure; mirrors tegWeekKey, no globals).
export function homeMondayKey(d){
  d = new Date(d);
  const day = (d.getDay()+6) % 7;
  d.setDate(d.getDate()-day); d.setHours(0,0,0,0);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// Blast-radius impact for a PERSON = Σ over the projects they touch of that project's
// risk-adjusted upside, ×spofBoost when they are a KT-less sole skill holder.
export function homeEngImpact(d, engProjects, projRiskAdj, thr){
  thr = thr||HOME_THRESHOLDS; engProjects = engProjects||{}; projRiskAdj = projRiskAdj||{};
  const pids = engProjects[d.id] || [];
  let blast = 0;
  pids.forEach(function(pid){ const v = projRiskAdj[pid]; if(v!=null && v>0) blast += v; });
  const spof = !!(d.spofSkills && d.spofSkills.length && !d.hasKTPlan);
  return spof ? blast*thr.spofBoost : blast;
}

// Human title (plain English — no t(); classifiers must stay node-pure).
function homePersonTitle(concern, name){
  const map = {
    'retention-risk':' is a retention risk',
    'over-allocation':' is over-allocated',
    'bench':' is on the bench',
    'stale-review':' is overdue a review',
    'engagement-due':' has an engagement touchpoint due',
  };
  return (name||'Someone') + (map[concern]||' needs attention');
}
function homeProjectTitle(concern, name){
  const map = {
    'gate-blocked':' is blocked at its gate',
    'gate-behind':' is behind on gate readiness',
    'charter-conflict':' has charter conflicts',
    'value-destroying':' is value-destroying',
    'low-unit-margin':' has a thin unit margin',
    'dtc-gap':' is over its cost target',
    'channel-concentration':' is channel-concentrated',
    'hold-stale':' has been on hold too long',
    'candidate-stale':' is a value-destroying candidate',
  };
  return (name||'A project') + (map[concern]||' needs attention');
}

// Classify ONE analytics-dataset person row `d` into zero-or-more action items.
// Pure: takes plain inputs, calls no producer/DOM globals.
export function homeClassifyPerson(d, o){
  o = o||{};
  const thr = o.thresholds||HOME_THRESHOLDS;
  const now = o.now||new Date();
  const engProjects = o.engProjects||{};
  const projRiskAdj = o.projRiskAdj||{};
  const eng = o.engagement||{ touchpoints:[] };
  const impact = homeEngImpact(d, engProjects, projRiskAdj, thr);
  const uid = d.uid, id = d.id, nm = d.name||'';
  const items = [];
  function mk(concern, band, why, metrics, action, hashIn){
    return { id:concern+':engineer:'+uid, concern:concern, domain:'people', entityType:'engineer',
      entityUid:uid, entityId:id, entityName:nm, band:band, impact:impact,
      title:homePersonTitle(concern, nm), why:why, metrics:metrics, action:action,
      hash:homeHash(concern+'|'+hashIn) };
  }
  // retention-risk (uses the composite riskScore already on the row)
  if(d.riskScore!=null && d.riskScore >= thr.retentionMin){
    const band = d.riskScore >= thr.retentionCrit ? 'critical' : 'warn';
    const factors = (d.riskFactors||[]).map(function(f){ return f.k; });
    items.push(mk('retention-risk', band, factors,
      [{ label:'Risk score', val:d.riskScore, tone:band }],
      'Open ID card · plan a retention touchpoint',
      band+'|'+factors.slice().sort().join(',')));
  }
  // over-allocation
  if(d.utilizationPct > thr.overallocPct){
    const band = d.utilizationPct > thr.overallocCrit ? 'critical' : 'warn';
    items.push(mk('over-allocation', band, ['Allocated '+d.utilizationPct+'% over the period'],
      [{ label:'Utilisation', val:d.utilizationPct+'%', tone:band }],
      'Rebalance in Resource plan',
      String(homeBucket(d.utilizationPct,10))));
  }
  // bench — impact is the wasted loaded cost, not project value
  if(d.utilizationPct < thr.benchPct){
    items.push({ id:'bench:engineer:'+uid, concern:'bench', domain:'people', entityType:'engineer',
      entityUid:uid, entityId:id, entityName:nm, band:'watch', impact:(d.monthlyCost||0),
      title:homePersonTitle('bench', nm), why:['On the bench ('+d.utilizationPct+'% utilised)'],
      metrics:[{ label:'Utilisation', val:d.utilizationPct+'%', tone:'watch' }],
      action:'Assign in Resource plan', hash:homeHash('bench|1') });
  }
  // stale-review
  const stale = d.reviewCurrencyMonths==null
    ? (d.tenureMonths!=null && d.tenureMonths > 12)
    : (d.reviewCurrencyMonths > thr.staleReviewMonths);
  if(stale){
    const lbl = d.reviewCurrencyMonths==null ? 'never reviewed' : (d.reviewCurrencyMonths+' mo since review');
    items.push(mk('stale-review', 'watch', ['Performance review is stale — '+lbl],
      [{ label:'Since review', val:d.reviewCurrencyMonths==null?'—':d.reviewCurrencyMonths+'mo', tone:'watch' }],
      'Log a review on the ID card',
      d.reviewCurrencyMonths==null ? 'never' : String(homeBucket(d.reviewCurrencyMonths,3))));
  }
  // engagement-due (undone touchpoint this week or earlier)
  const curWk = homeMondayKey(now);
  const due = (eng.touchpoints||[]).filter(function(tp){ return tp && !tp.done && tp.week && tp.week <= curWk; });
  if(due.length){
    const overdue = due.some(function(tp){ return tp.week < curWk; });
    const earliest = due.map(function(tp){ return tp.week; }).sort()[0];
    items.push(mk('engagement-due', overdue?'warn':'watch',
      [(overdue?'Overdue':'Due this week')+' — '+due.length+' engagement touchpoint(s)'],
      [{ label:'Touchpoints', val:due.length, tone:overdue?'warn':'watch' }],
      'Work the week in Engagement planner',
      due.length+'|'+earliest));
  }
  return items;
}

// Classify ONE project (its gate readiness + gtBuildSignalMap entry) into items.
// Pure. `pj = { p:{id,uid,name}, sig:{…}, readiness:{blocked,pct,blockers[]} }`.
export function homeClassifyProject(pj, o){
  o = o||{};
  const thr = o.thresholds||HOME_THRESHOLDS;
  const now = o.now||new Date();
  const nowMs = (now instanceof Date) ? now.getTime() : new Date(now).getTime();
  const p = pj.p||{}, s = pj.sig||{}, rd = pj.readiness||{};
  const lc = pj.lifecycle || 'active';                    // disposition (defaults active, mirrors projLifecycle)
  const uid = p.uid, id = p.id, nm = p.name||'Untitled';
  const baseImpact = Math.max(0, (s.riskAdjNpv!=null ? s.riskAdjNpv : (s.npv!=null ? s.npv : 0)));
  const items = [];
  function mk(concern, band, why, metrics, action, hashIn){
    return { id:concern+':project:'+uid, concern:concern, domain:homeConcernDomain(concern), entityType:'project',
      entityUid:uid, entityId:id, entityName:nm, band:band, impact:baseImpact,
      title:homeProjectTitle(concern, nm), why:why, metrics:metrics, action:action,
      hash:homeHash(concern+'|'+hashIn) };
  }
  if(rd.blocked){
    const blk = (rd.blockers||[]).map(function(c){ return c.id; }).sort();
    items.push(mk('gate-blocked', 'critical',
      ['Gate blocked — '+(rd.blockers?rd.blockers.length:0)+' mandatory criterion/criteria failing'],
      [{ label:'Readiness', val:(rd.pct==null?'—':rd.pct+'%'), tone:'critical' }],
      'Clear blockers in Gate & PI', blk.join(',')));
  } else if(pj.gateEngaged && rd.pct!=null && rd.pct < thr.gateBehindPct){
    items.push(mk('gate-behind', 'watch',
      ['Gate readiness low ('+rd.pct+'%)'],
      [{ label:'Readiness', val:rd.pct+'%', tone:'watch' }],
      'Progress criteria in Gate & PI', String(homeBucket(rd.pct,10))));
  }
  if(s.conflicts!=null && s.conflicts > 0){
    items.push(mk('charter-conflict', 'warn',
      [s.conflicts+' charter conflict(s) — a must-have on a sacrificed dimension'],
      [{ label:'Conflicts', val:s.conflicts, tone:'warn' }],
      'Resolve in Trade-off decision', String(s.conflicts)));
  }
  // A funded/active project with PI<1 is a "review financials" flag; the SAME signal on
  // a still-Proposed candidate is instead a decide-to-kill nudge (candidate-stale below).
  if(lc!=='proposed' && s.pi!=null && s.pi < 1){
    items.push(mk('value-destroying', 'warn',
      ['Profitability index below 1 (PI '+s.pi.toFixed(2)+')'],
      [{ label:'PI', val:s.pi.toFixed(2), tone:'warn' }],
      'Review financials', (s.pi<0?'neg':'pos')+String(homeBucket(s.pi*10,1))));
  }
  if(s.unitMargin!=null && s.unitMargin < thr.marginPct){
    items.push(mk('low-unit-margin', 'watch',
      ['Unit margin '+s.unitMargin.toFixed(1)+'% below target'],
      [{ label:'Unit margin', val:s.unitMargin.toFixed(1)+'%', tone:'watch' }],
      'Check pricing/cost in financials', String(homeBucket(s.unitMargin,5))));
  }
  if(s.dtcGap!=null && s.dtcGap > 0){
    items.push(mk('dtc-gap', 'watch',
      ['Unit cost over target by design-to-cost'],
      [{ label:'DTC gap', val:Math.round(s.dtcGap)+'€/u', tone:'watch' }],
      'Close the gap in Design to cost', String(homeBucket(s.dtcGap,50))));
  }
  if(s.chanHHI!=null && s.chanHHI > thr.hhi){
    items.push(mk('channel-concentration', 'watch',
      ['Channel concentration high (HHI '+s.chanHHI.toFixed(2)+')'],
      [{ label:'HHI', val:s.chanHHI.toFixed(2), tone:'watch' }],
      'Diversify in Channel mix', String(homeBucket(s.chanHHI*100,10))));
  }
  // ── Lifecycle nudges (disposition axis) ────────────────────────────────────
  // On hold too long: a paused project no one has resumed or retired. Age from the
  // most-recent transition INTO on_hold in lifecycleHistory.
  if(lc==='on_hold'){
    const hist = Array.isArray(pj.lifecycleHistory) ? pj.lifecycleHistory : [];
    let sinceMs = null;
    for(let k=hist.length-1;k>=0;k--){ if(hist[k] && hist[k].to==='on_hold'){ sinceMs = hist[k].ts; break; } }
    if(sinceMs!=null){
      const days = Math.floor((nowMs - sinceMs)/86400000);
      if(days >= thr.holdStaleDays){
        items.push(mk('hold-stale', 'warn',
          ['On hold '+days+' days — decide to resume or retire it'],
          [{ label:'On hold', val:days+'d', tone:'warn' }],
          'Resume or kill in Gate & PI', String(homeBucket(days,30))));
      }
    }
  }
  // Value-destroying candidate still Proposed: a negative-value proposal awaiting a
  // fund/kill call. Fires on PI<1 OR a negative risk-adjusted NPV.
  if(lc==='proposed'){
    const npv = (s.riskAdjNpv!=null ? s.riskAdjNpv : s.npv);
    if((s.pi!=null && s.pi < 1) || (npv!=null && npv < 0)){
      items.push(mk('candidate-stale', 'warn',
        ['Proposed candidate is value-destroying — decide to fund or kill'],
        [{ label:'PI', val:(s.pi!=null ? s.pi.toFixed(2) : '—'), tone:'warn' }],
        'Decide in Pipeline', (s.pi!=null ? 'pi'+String(homeBucket(s.pi*10,1)) : 'npvneg')));
    }
  }
  return items;
}

// Classify ONE planner task (a project to-do or action) into items. Pure.
// `tk = { pid, puid, pname, kind:'todo'|'action', id, text, done, due, execPin, overdue }`.
// This is the PLANNER half of the queue — without it every action is project-signal-derived.
export function homeClassifyTask(tk, o){
  o = o||{};
  if(tk.done) return [];
  const key = tk.pid+'-'+tk.kind+'-'+tk.id;
  const items = [];
  function mk(concern, band, why, action){
    return { id:concern+':task:'+key, concern:concern, domain:'planner', entityType:'task',
      entityUid:key, entityId:tk.pid, entityName:tk.pname||'', band:band, impact:0,
      title:(tk.text||'(untitled task)')+' — '+(tk.pname||''),
      why:why, metrics:[{ label:'Type', val:tk.kind, tone:band }],
      action:action, hash:homeHash(concern+'|'+(tk.due||'')+'|'+(tk.done?'1':'0')) };
  }
  if(tk.overdue) items.push(mk('task-overdue', 'warn', ['Overdue'+(tk.due?' since '+tk.due:'')], 'Open in Backlog & planner'));
  else if(tk.execPin) items.push(mk('task-pinned', 'watch', ['Pinned for your week'], 'Open in Backlog & planner'));
  return items;
}

// Suppress a person's capacity/governance cards when they already have a CRITICAL
// retention card (its why line already names them — avoids stacking one human's
// problems). Over-allocation on a NON-risky person still shows.
export function homeSuppress(items){
  const crit = {};
  items.forEach(function(i){ if(i.concern==='retention-risk' && i.band==='critical') crit[i.entityUid]=1; });
  const HIDE = { 'over-allocation':1, 'bench':1, 'stale-review':1, 'engagement-due':1 };
  return items.filter(function(i){
    return !(HIDE[i.concern] && i.entityType==='engineer' && crit[i.entityUid]);
  });
}

// Apply per-device snooze + dismiss-until-signal-changes. Prunes stale dismissals
// off the passed prefs object (caller persists). now = Date or ISO/ms.
export function homeApplyState(items, prefs, now){
  prefs = prefs||{}; now = now||new Date();
  const nowMs = (now instanceof Date) ? now.getTime() : new Date(now).getTime();
  const snoozed = prefs.snoozed||{}, dismissed = prefs.dismissed||{};
  const out = [];
  items.forEach(function(it){
    const sn = snoozed[it.id];
    if(sn && sn.until && new Date(sn.until).getTime() > nowMs) return;   // still snoozed
    const dm = dismissed[it.id];
    if(dm){
      if(dm.hash === it.hash) return;    // resolved and unchanged → stay hidden
      delete dismissed[it.id];           // signal changed → resurface + prune
    }
    out.push(it);
  });
  return out;
}

// Domain + severity filter (pure; used by homeBuildActions and unit-tested directly).
export function homeFilterItems(items, domainFilter, minBand){
  let out = items;
  if(domainFilter && domainFilter!=='all') out = out.filter(function(i){ return i.domain===domainFilter; });
  let mb = HOME_BAND_RANK[minBand!=null ? minBand : 'watch'];
  if(mb==null) mb = HOME_BAND_RANK.watch;
  return out.filter(function(i){ return HOME_BAND_RANK[i.band] <= mb; });
}

// Rank: severity band first, € impact second, then a deterministic title tiebreak.
export function homeRank(items){
  return items.slice().sort(function(a,b){
    return (HOME_BAND_RANK[a.band]-HOME_BAND_RANK[b.band])
        || (b.impact-a.impact)
        || (a.title<b.title ? -1 : (a.title>b.title ? 1 : 0));
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   2. GATHER — reads the live producers (bundle globals), delegates to the engine
   ══════════════════════════════════════════════════════════════════════════ */

// Defensive engagement accessor (never throws on un-sanitised data).
function homeSafeEngagement(eng){
  try{ if(typeof tegEng==='function') return tegEng(eng); }catch(e){}
  const ic = eng && eng.idcard, en = ic && ic.engagement;
  return (en && Array.isArray(en.touchpoints)) ? en : { touchpoints:[] };
}

// Assemble every raw item from the live datasets. Null-tolerant throughout — a
// producer that throws or returns nothing simply contributes no items.
function homeRawItems(o){
  o = o||{};
  const now = o.now||new Date();
  const thr = o.thresholds||HOME_THRESHOLDS;
  const items = [];

  let ds = [];
  try{ ds = (typeof buildAnalyticsDataset==='function') ? buildAnalyticsDataset() : []; }catch(e){ ds = []; }

  // Reverse the people↔project join gtBuildSignalMap builds internally.
  const engProjects = {};
  try{
    (typeof allocRows!=='undefined' ? allocRows : []).forEach(function(a){
      if(a.engId==null || a.projectId==null) return;
      (engProjects[a.engId] || (engProjects[a.engId]=[])).push(a.projectId);
    });
  }catch(e){}

  let sig = {};
  try{ sig = (typeof gtBuildSignalMap==='function') ? gtBuildSignalMap() : {}; }catch(e){ sig = {}; }
  const projRiskAdj = {};
  Object.keys(sig).forEach(function(pid){
    const s = sig[pid]||{}; const v = (s.riskAdjNpv!=null ? s.riskAdjNpv : s.npv);
    if(v!=null) projRiskAdj[pid] = v;
  });

  ds.forEach(function(d){
    const engagement = d._eng ? homeSafeEngagement(d._eng) : { touchpoints:[] };
    homeClassifyPerson(d, { engProjects:engProjects, projRiskAdj:projRiskAdj, thresholds:thr, now:now, engagement:engagement })
      .forEach(function(it){ items.push(it); });
  });

  let stages = [];
  try{ stages = (typeof gateConfig!=='undefined' && gateConfig.model && gateConfig.model.stages) || []; }catch(e){}
  try{
    (typeof projects!=='undefined' ? projects : []).forEach(function(p){
      const s = sig[p.id]; if(!s) return;
      let readiness = { blocked:false, pct:100, blockers:[] };
      let gateEngaged = false;
      try{
        const gp = p.gatePlan || (typeof makeGatePlan==='function' ? makeGatePlan() : {});
        const idx = (typeof gtCurStageIdx==='function') ? gtCurStageIdx(p, stages) : 0;
        const st = stages[idx];
        // "Engaged" = the team has actually started gating this project (advanced a
        // stage, recorded a manual criterion, or logged a transition). A fresh project
        // sitting at the default first stage with all-pending criteria is NOT usefully
        // "blocked" — that flooded the queue with one card per project.
        gateEngaged = !!(gp && (
          (Array.isArray(gp.history) && gp.history.length) ||
          (stages.length && stages[0] && gp.stageId && gp.stageId !== stages[0].id) ||
          (gp.criteria && Object.keys(gp.criteria).some(function(k){ const c=gp.criteria[k]; return c && c.status && c.status!=='pending'; }))
        ));
        if(st && typeof gtStageReadiness==='function'){
          const rd = gtStageReadiness(st, gp, s);
          // Only a HARD block (a mandatory criterion explicitly FAILING — a manual
          // 'fail', or a failing auto criterion with real data) counts here; a merely
          // 'pending' (never-assessed) mandatory criterion does not.
          const hard = (rd.blockers||[]).filter(function(c){
            return (typeof gtCritStatus==='function' ? gtCritStatus(c, gp, s) : '') === 'fail';
          });
          readiness = { blocked:hard.length>0, pct:rd.pct, blockers:hard };
        }
      }catch(e){}
      homeClassifyProject({ p:{ id:p.id, uid:p.uid, name:p.name||'Untitled' }, sig:s, readiness:readiness, gateEngaged:gateEngaged,
          lifecycle:(p.lifecycle||'active'), lifecycleHistory:(Array.isArray(p.lifecycleHistory)?p.lifecycleHistory:[]) }, { thresholds:thr, now:now })
        .forEach(function(it){ items.push(it); });
    });
  }catch(e){}

  // PLANNER — open to-dos & actions (overdue or pinned) across projects.
  try{
    homeProjectTasks(now).forEach(function(tk){
      homeClassifyTask(tk, { now:now }).forEach(function(it){ items.push(it); });
    });
  }catch(e){}

  return items;
}

// Flatten every project's open to-dos + actions into plain task rows (for the queue
// classifier AND the My Tasks widget — one source, so they never diverge).
function homeProjectTasks(now){
  const out = [];
  const today = now ? new Date(now) : new Date(); today.setHours(0,0,0,0);
  function overdue(due, done){ return !!due && !done && (new Date(due) < today); }
  (typeof projects!=='undefined' ? projects : []).forEach(function(p){
    (p.todos||[]).forEach(function(td){
      out.push({ pid:p.id, puid:p.uid, pname:p.name||'Untitled', kind:'todo', id:td.id,
        text:td.text||'', done:!!td.done, due:td.due||'', execPin:!!td.execPin,
        priority:td.priority||'', overdue:overdue(td.due, td.done) });
    });
    (p.actions||[]).forEach(function(a){
      const done = /done|complete|closed/i.test(a.status||'');
      const due = a.due || a.end || '';
      out.push({ pid:p.id, puid:p.uid, pname:p.name||'Untitled', kind:'action', id:a.id,
        text:a.desc||'', done:done, due:due, execPin:!!a.execPin,
        priority:a.priority||'', overdue:overdue(due, done) });
    });
  });
  return out;
}

// Public engine entry: gather → suppress → state → filter → rank.
// ctx = { now, domainFilter='all', minBand='watch', prefs=<per-device> }.
function homeBuildActions(ctx){
  ctx = ctx||{};
  const now = ctx.now||new Date();
  const prefs = ctx.prefs || (_homePrefs || homeLoadPrefs());
  let items = homeRawItems({ now:now, thresholds:HOME_THRESHOLDS });
  items = homeSuppress(items);
  items = homeApplyState(items, prefs, now);
  items = homeFilterItems(items, ctx.domainFilter||'all', ctx.minBand||'watch');
  return homeRank(items);
}

/* ══════════════════════════════════════════════════════════════════════════
   3. PER-DEVICE PREFS — layout + snooze/dismiss (own key, never app state/backups)
   ══════════════════════════════════════════════════════════════════════════ */

const HOME_PREFS_KEY = 'eim_home_prefs';
let _homePrefs = null;      // loaded on openHome
let _homeFilter = 'all';    // action-queue domain filter chip
let _homeEdit = false;      // customize (edit) mode
let _homeAddOpen = false;   // add-widget panel open
let _homeDragId = null;     // widget id being dragged

// One smart default layout (editable). Widths are 1–3 grid columns.
function homeDefaultLayout(){
  return [
    { id:'capacity',      w:3 },   // the join — hero
    { id:'action-queue',  w:3 },
    { id:'sections',      w:2 },   // every active project by section, with progress
    { id:'gate-stages',   w:2 },   // portfolio as a gate funnel
    { id:'decisions',     w:2 },
    { id:'portfolio',     w:1 },
    { id:'people-health', w:2 },
    { id:'headcount',     w:1 },
    { id:'my-tasks',      w:1 },
    { id:'engagement',    w:1 },
    { id:'launchpad',     w:1 },
  ];
}
function homeClampW(w){ w = +w||1; return w<1 ? 1 : (w>3 ? 3 : w); }

function homeLoadPrefs(){
  const p = { layout:homeDefaultLayout(), snoozed:{}, dismissed:{}, sampleLoaded:false };
  try{
    const raw = localStorage.getItem(HOME_PREFS_KEY);
    if(raw){
      const o = JSON.parse(raw);
      if(o && typeof o==='object'){
        if(Array.isArray(o.layout)){
          p.layout = o.layout
            .filter(function(x){ return x && x.id && homeWidgetDef(x.id); })
            .map(function(x){ return { id:x.id, w:homeClampW(x.w) }; });
        }
        if(o.snoozed && typeof o.snoozed==='object') p.snoozed = o.snoozed;
        if(o.dismissed && typeof o.dismissed==='object') p.dismissed = o.dismissed;
        p.sampleLoaded = !!o.sampleLoaded;
      }
    }
  }catch(e){}
  if(!p.layout.length) p.layout = homeDefaultLayout();
  return p;
}
function homeSavePrefs(p){ try{ localStorage.setItem(HOME_PREFS_KEY, JSON.stringify(p||_homePrefs)); }catch(e){} }

// Per-device "viewing sample data" flag (stored in eim_home_prefs — a UI pref, never app
// state / backups / collab). Set by loadSampleData; drives the Home reminder strip.
function homeSetSampleFlag(on){ if(!_homePrefs) _homePrefs = homeLoadPrefs(); _homePrefs.sampleLoaded = !!on; homeSavePrefs(_homePrefs); }
function homeIsSample(){ if(!_homePrefs) _homePrefs = homeLoadPrefs(); return !!_homePrefs.sampleLoaded; }
// "Dismiss" on the sample strip only stops the reminder — it does NOT touch the data.
function homeDismissSample(){ homeSetSampleFlag(false); renderHome(); }

/* ══════════════════════════════════════════════════════════════════════════
   4. WIDGET LIBRARY — curated, screen-sized read-outs of existing datasets
   ══════════════════════════════════════════════════════════════════════════ */

// Built as a FUNCTION (not a top-level const) so importing this module in Node for
// the engine tests never runs t() at load — top level stays global-free.
function homeWidgetDefs(){
  return [
    { id:'action-queue',   title:t('Action Queue'),        domain:'action',     defW:3, render:homeWqActionQueue,
      desc:t('Ranked cross-domain "what needs you" list') },
    { id:'capacity',       title:t('Capacity ↔ Demand'),   domain:'governance', defW:3, render:homeWqCapacity,
      desc:t('The people×project join: committed %, free capacity, discipline breaches, pipeline pressure') },
    { id:'decisions',      title:t('Decisions Pending'),   domain:'portfolio',  defW:2, render:homeWqDecisions,
      desc:t('Candidates to fund/kill, stale holds, gate reviews due') },
    { id:'sections',       title:t('Portfolio by Section'),domain:'portfolio',  defW:2, render:homeWqSections,
      desc:t('Every active project grouped by section — gate progress, lifecycle, staffing') },
    { id:'portfolio',      title:t('Portfolio Health'),    domain:'portfolio',  defW:1, render:homeWqPortfolio,
      desc:t('Risk-adjusted value, capital at risk, lifecycle funnel') },
    { id:'people-health',  title:t('People Health'),       domain:'people',     defW:2, render:homeWqPeopleHealth,
      desc:t('Retention risk, SPOF, overdue reviews') },
    { id:'engagement',     title:t('Engagement This Week'),domain:'people',     defW:1, render:homeWqEngagement,
      desc:t("This week's retention touchpoints") },
    { id:'headcount',      title:t('Headcount'),           domain:'people',     defW:1, render:homeWqHeadcount,
      desc:t('People, managers, SPOF, avg compa-ratio') },
    { id:'my-tasks',       title:t('My Tasks'),            domain:'planner',    defW:1, render:homeWqTasks,
      desc:t('Overdue & pinned to-dos and actions') },
    { id:'gate-readiness', title:t('Gate Readiness'),      domain:'governance', defW:2, render:homeWqGate,
      desc:t('Projects blocked or behind at their gate') },
    { id:'gate-stages',    title:t('Projects by Gate Stage'),domain:'governance',defW:2, render:homeWqGateStages,
      desc:t('The whole portfolio as a gate funnel — who sits at each stage') },
    { id:'cost-burn',      title:t('Team Cost'),           domain:'governance', defW:2, render:homeWqCost,
      desc:t('Loaded team cost, allocated %, bench €') },
    { id:'launchpad',      title:t('Insight Launchpad'),   domain:'action',     defW:1, render:homeWqLaunchpad,
      desc:t('Jump into the analytics: portfolio, people, exec, gate, pipeline') },
  ];
}
function homeWidgetDef(id){
  const defs = homeWidgetDefs();
  for(let i=0;i<defs.length;i++) if(defs[i].id===id) return defs[i];
  return null;
}

// ── shared render helpers ─────────────────────────────────────────────────
function homeEur(v){ return (typeof pfEur==='function') ? pfEur(v) : Math.round(+v||0)+'€'; }
function homeEmpty(msg){ return '<div class="home-empty">'+escH(t(msg))+'</div>'; }
function homeKpi(val, label, color){
  return '<div class="home-kpi"><div class="home-kpi-v" style="color:'+(color||'var(--text)')+'">'+escH(String(val))+'</div>'
    +'<div class="home-kpi-l">'+escH(t(label))+'</div></div>';
}
function homeBandColor(b){ return b==='critical' ? 'var(--danger)' : b==='warn' ? 'var(--warn)' : 'var(--accent2)'; }
function homeBandLabel(b){ return b==='critical' ? t('CRITICAL') : b==='warn' ? t('WARN') : t('WATCH'); }
function homeDomLabel(d){ return d==='people' ? t('People') : d==='governance' ? t('Gov') : d==='portfolio' ? t('Portfolio') : d==='planner' ? t('Planner') : t('Action'); }
function homeCurInRange(months){
  const cur = (typeof _dashCur==='function') ? _dashCur() : '';
  if(!months.length) return cur;
  if(months.indexOf(cur)>=0) return cur;
  return cur<months[0] ? months[0] : months[months.length-1];
}
// Escape a value for safe inclusion inside a single-quoted inline handler.
function homeAttr(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ── the ACTION QUEUE hero widget ───────────────────────────────────────────
function homeWqActionQueue(){
  const items = homeBuildActions({ domainFilter:_homeFilter, prefs:_homePrefs, now:new Date() });
  if(!items.length) return homeEmpty("Nothing needs you right now — you're clear. ✓");
  const top = items.slice(0, 10);
  let h = '';
  top.forEach(function(it){ h += homeActionCard(it); });
  if(items.length > top.length){
    h += '<div class="home-aq-more">'+escH(t('+ {n} more', { n:(items.length-top.length) }))+'</div>';
  }
  return h;
}
function homeActionCard(it){
  const col = homeBandColor(it.band);
  const impact = (it.impact && it.impact>0) ? homeEur(it.impact) : '';
  let h = '<div class="home-aq" style="border-left:3px solid '+col+'">';
  h += '<div class="home-aq-top">'
     + '<span class="home-aq-band" style="color:'+col+'">'+escH(homeBandLabel(it.band))+'</span>'
     + '<span class="home-aq-title">'+escH(it.title)+'</span>'
     + (it.entityType==='engineer' && it.impact>0 ? '<span class="home-aq-tag">'+escH(t('People × Portfolio'))+'</span>' : '')
     + '<span class="home-aq-sp"></span>'
     + (impact ? '<span class="home-aq-impact" title="'+escH(t('Value at stake'))+'">'+escH(impact)+'</span>' : '')
     + '</div>';
  if(it.why && it.why.length){
    h += '<div class="home-aq-why">';
    it.why.forEach(function(w){ h += '<span>• '+escH(w)+'</span>'; });
    h += '</div>';
  }
  if(it.metrics && it.metrics.length){
    h += '<div class="home-aq-metrics">';
    it.metrics.forEach(function(m){ h += '<span class="home-chip">'+escH(m.label)+': <b>'+escH(String(m.val))+'</b></span>'; });
    h += '</div>';
  }
  h += '<div class="home-aq-actions">'
     + '<button class="home-btn primary" onclick="homeOpenFor(\''+homeAttr(it.concern)+'\','+(+it.entityId)+')">'+escH(it.action||t('Open'))+' →</button>'
     + '<button class="home-btn" onclick="homeSnooze(\''+homeAttr(it.id)+'\')">'+escH(t('Snooze 1w'))+'</button>'
     + '<button class="home-btn" onclick="homeDismiss(\''+homeAttr(it.id)+'\',\''+homeAttr(it.hash)+'\')">'+escH(t('Dismiss'))+'</button>'
     + '</div></div>';
  return h;
}

// ── people widgets ─────────────────────────────────────────────────────────
// People Health — the merged people-risk widget (was Talent Risk + Retention + Review
// Governance, which were three cuts of the same dataset). One KPI row + the top people.
function homeWqPeopleHealth(){
  let ds = []; try{ ds = buildAnalyticsDataset(); }catch(e){}
  if(!ds.length) return homeEmpty('No people yet — add engineers to the roster.');
  const crit = ds.filter(function(d){ return d.riskScore>=50; });
  const warn = ds.filter(function(d){ return d.riskScore>=25 && d.riskScore<50; });
  const spof = ds.filter(function(d){ return d.spofSkills && d.spofSkills.length && !d.hasKTPlan; });
  const stale = ds.filter(function(d){ return d.reviewCurrencyMonths==null ? (d.tenureMonths!=null && d.tenureMonths>12) : d.reviewCurrencyMonths>15; });
  let h = '<div class="home-kpis">'
    + homeKpi(crit.length,  'Critical',    crit.length?'var(--danger)':'var(--muted)')
    + homeKpi(warn.length,  'At risk',     warn.length?'var(--warn)':'var(--muted)')
    + homeKpi(spof.length,  'SPOF · no KT',spof.length?'var(--warn)':'var(--muted)')
    + homeKpi(stale.length, 'Reviews due', stale.length?'var(--warn)':'var(--muted)')
    + '</div>';
  const top = crit.concat(warn).sort(function(a,b){ return b.riskScore-a.riskScore; }).slice(0, 6);
  if(top.length){
    const max = top[0].riskScore || 1;
    h += '<div class="home-list">';
    top.forEach(function(d){
      const col = d.riskScore>=50 ? 'var(--danger)' : 'var(--warn)';
      h += '<div class="home-row" onclick="homeOpenFor(\'retention-risk\','+(+d.id)+')">'
         + '<span class="home-row-name">'+escH(d.name||'')+'</span>'
         + '<span class="home-bar"><span style="width:'+Math.round(d.riskScore/max*100)+'%;background:'+col+'"></span></span>'
         + '<span class="home-row-val" style="color:'+col+'">'+escH(String(d.riskScore))+'</span></div>';
    });
    h += '</div>';
  } else {
    h += homeEmpty('No people-risk signals. ✓');
  }
  return h;
}
function homeWqEngagement(){
  let list = []; try{ list = (typeof tegThisWeekList==='function') ? tegThisWeekList() : []; }catch(e){}
  const open = '<button class="home-btn" onclick="railGo(null,\'engagement\')">'+escH(t('Planner →'))+'</button>';
  if(!list.length) return homeEmpty('No touchpoints this week — set a cadence in the Engagement planner.') + '<div class="home-foot">'+open+'</div>';
  const done = list.filter(function(x){ return x.tp.done; }).length;
  let h = '<div class="home-kpis">'+homeKpi(list.length, 'This week', 'var(--accent2)')+homeKpi(done, 'Done', 'var(--accent)')+'</div><div class="home-list">';
  list.slice(0, 7).forEach(function(x){
    h += '<div class="home-row"><span class="home-row-name'+(x.tp.done?' done':'')+'">'+escH(x.eng.name||'')+'</span>'
       + '<span class="home-sp"></span><span class="home-row-val">'+(x.tp.done?'✓':'•')+'</span></div>';
  });
  return h + '</div><div class="home-foot">'+open+'</div>';
}
function homeWqHeadcount(){
  let ds = []; try{ ds = buildAnalyticsDataset(); }catch(e){}
  const mgrs = ds.filter(function(d){ return d.isManager; }).length;
  const spof = ds.filter(function(d){ return d.spofSkills && d.spofSkills.length && !d.hasKTPlan; }).length;
  const comps = ds.map(function(d){ return d.comparatio; }).filter(function(v){ return v!=null; });
  const avgc = comps.length ? Math.round(comps.reduce(function(s,v){ return s+v; },0)/comps.length) : null;
  return '<div class="home-kpis">'
    + homeKpi(ds.length, 'People', 'var(--text)')
    + homeKpi(mgrs, 'Managers', 'var(--text)')
    + homeKpi(spof, 'SPOF', 'var(--warn)')
    + homeKpi(avgc==null ? '—' : avgc+'%', 'Avg compa', 'var(--text)')
    + '</div>';
}

// ── planner widget ─────────────────────────────────────────────────────────
function homeWqTasks(){
  let tasks = []; try{ tasks = homeProjectTasks(new Date()).filter(function(t){ return !t.done; }); }catch(e){}
  const open = '<button class="home-btn" onclick="railGo(null,\'backlog\')">'+escH(t('Backlog & planner →'))+'</button>';
  if(!tasks.length) return homeEmpty('No open tasks — capture to-dos/actions on a project or in Backlog & planner.') + '<div class="home-foot">'+open+'</div>';
  const overdue = tasks.filter(function(t){ return t.overdue; });
  const pinned = tasks.filter(function(t){ return t.execPin && !t.overdue; });
  let h = '<div class="home-kpis">'
    + homeKpi(tasks.length, 'Open', 'var(--text)')
    + homeKpi(overdue.length, 'Overdue', 'var(--danger)')
    + homeKpi(pinned.length, 'Pinned', 'var(--accent2)')
    + '</div>';
  const show = overdue.concat(pinned).slice(0, 7);
  if(show.length){
    h += '<div class="home-list">';
    show.forEach(function(tk){
      const col = tk.overdue ? 'var(--danger)' : 'var(--accent2)';
      h += '<div class="home-row" onclick="railGo(null,\'backlog\')" title="'+escH(tk.pname||'')+'">'
         + '<span class="home-row-name">'+escH(tk.text||'(untitled)')+'</span>'
         + '<span class="home-sp"></span>'
         + '<span class="home-row-val" style="color:'+col+'">'+escH(tk.overdue ? (tk.due||'overdue') : 'pinned')+'</span></div>';
    });
    h += '</div>';
  }
  return h + '<div class="home-foot">'+open+'</div>';
}

// ── governance / capacity widgets ──────────────────────────────────────────
// Shared gate state for Home widgets. Mirrors the Action Queue gather EXACTLY so the
// widget and the queue never disagree: a HARD block is a mandatory criterion explicitly
// FAILING (manual 'fail' or a failing auto criterion with real data) — a merely 'pending'
// (never-assessed) criterion is NOT a block. `gateEngaged` = the team has actually started
// gating (advanced a stage, recorded a criterion, or logged a transition).
function homeProjGateState(p, stages, sig){
  const out = { hardBlocked:false, pct:100, blockers:[], gateEngaged:false, idx:0, stageName:'' };
  try{
    const gp = p.gatePlan || (typeof makeGatePlan==='function' ? makeGatePlan() : {});
    const idx = (stages.length && typeof gtCurStageIdx==='function') ? gtCurStageIdx(p, stages) : 0;
    out.idx = idx;
    const st = stages[idx];
    out.stageName = st ? (st.name||'') : '';
    out.gateEngaged = !!(gp && (
      (Array.isArray(gp.history) && gp.history.length) ||
      (stages.length && stages[0] && gp.stageId && gp.stageId !== stages[0].id) ||
      (gp.criteria && Object.keys(gp.criteria).some(function(k){ const c=gp.criteria[k]; return c && c.status && c.status!=='pending'; }))
    ));
    if(st && typeof gtStageReadiness==='function'){
      const rd = gtStageReadiness(st, gp, sig||{});
      const hard = (rd.blockers||[]).filter(function(c){
        return (typeof gtCritStatus==='function' ? gtCritStatus(c, gp, sig||{}) : '') === 'fail';
      });
      out.pct = rd.pct; out.blockers = hard; out.hardBlocked = hard.length>0;
    }
  }catch(e){}
  return out;
}

function homeWqGate(){
  if(typeof projects==='undefined' || !projects.length) return homeEmpty('No projects yet — add projects on the matrix.');
  let sig = {}; try{ sig = gtBuildSignalMap(); }catch(e){}
  let stages = []; try{ stages = (typeof gateConfig!=='undefined' && gateConfig.model && gateConfig.model.stages) || []; }catch(e){}
  const rows = [];
  projects.forEach(function(p){ rows.push({ p:p, st:homeProjGateState(p, stages, sig[p.id]||{}) }); });
  // Attention = a HARD block, or an ENGAGED project sitting below half-ready. A fresh
  // project at its first gate with all-pending criteria is neither → it is not shown.
  const att = rows.filter(function(r){ return r.st.hardBlocked || (r.st.gateEngaged && r.st.pct!=null && r.st.pct<50); });
  if(!att.length) return homeEmpty('Every project is gate-ready. ✓');
  att.sort(function(a,b){ return ((a.st.hardBlocked?0:1)-(b.st.hardBlocked?0:1)) || (a.st.pct-b.st.pct); });
  let h = '';
  att.slice(0, 7).forEach(function(r){
    const col = r.st.hardBlocked ? 'var(--danger)' : 'var(--warn)';
    h += '<div class="home-row" onclick="homeOpenFor(\'gate-blocked\','+(+r.p.id)+')">'
       + '<span class="home-row-name">'+escH(r.p.name||'Untitled')+'</span>'
       + '<span class="home-bar"><span style="width:'+Math.max(3,Math.min(100,r.st.pct||0))+'%;background:'+col+'"></span></span>'
       + '<span class="home-row-val" style="color:'+col+'">'+(r.st.hardBlocked ? escH(t('BLOCKED')) : (r.st.pct+'%'))+'</span></div>';
  });
  return h;
}

// Projects by Gate Stage — the whole active portfolio laid out as a gate funnel: one row
// per stage (in methodology order) with the projects currently sitting at it as chips. A
// hard-blocked project gets a red dot. Answers "where is everything in the process?".
function homeWqGateStages(){
  if(typeof projects==='undefined' || !projects.length) return homeEmpty('No projects yet — add projects on the matrix.');
  let stages = []; try{ stages = (typeof gateConfig!=='undefined' && gateConfig.model && gateConfig.model.stages) || []; }catch(e){}
  if(!stages.length) return homeEmpty('No gate stages defined — build a methodology in Gate & PI.');
  let sig = {}; try{ sig = gtBuildSignalMap(); }catch(e){}
  const buckets = stages.map(function(){ return []; });
  projects.forEach(function(p){
    const active = (typeof projIsActivePortfolio==='function') ? projIsActivePortfolio(p) : true;
    if(!active) return;
    const gs = homeProjGateState(p, stages, sig[p.id]||{});
    const i = Math.max(0, Math.min(stages.length-1, gs.idx));
    buckets[i].push({ p:p, blocked:gs.hardBlocked });
  });
  const total = buckets.reduce(function(s,b){ return s+b.length; }, 0);
  if(!total) return homeEmpty('No active projects at a gate yet — fund candidates in the Pipeline.');
  let h = '<div class="home-gate-funnel">';
  stages.forEach(function(st, i){
    const col = safeColor(st.color, 'var(--muted)');
    const list = buckets[i];
    h += '<div class="home-gate-stage">'
       + '<div class="home-gate-lab"><span class="home-gate-dot" style="background:'+col+'"></span>'
       + '<span class="home-gate-name">'+escH(st.name || ('Stage '+(i+1)))+'</span>'
       + '<span class="home-gate-cnt">'+list.length+'</span></div>';
    if(list.length){
      h += '<div class="home-gate-chips">';
      list.forEach(function(x){
        const bc = x.blocked ? 'var(--danger)' : col;
        const open = (typeof gtOpenDetail==='function') ? ('gtOpenDetail('+(+x.p.id)+')') : '';
        h += '<span class="home-gate-chip" style="border-color:'+bc+'55" onclick="railGo(null,\'gate\');'+(open?open+';':'')+'">'
           + (x.blocked ? '<span style="color:var(--danger)">● </span>' : '')
           + escH(x.p.name||'Untitled')+'</span>';
      });
      h += '</div>';
    }
    h += '</div>';
  });
  h += '</div><div class="home-foot"><button class="home-btn" onclick="railGo(null,\'gate\')">'+escH(t('Gate board →'))+'</button></div>';
  return h;
}
// Capacity ↔ Demand — THE JOIN, promoted to the hero. Committed %, free FTE·months,
// per-discipline breaches (from pipelineCapacity.byGroup), and the forward pressure the
// current pipeline candidates would add. The one place people and projects meet.
function homeWqCapacity(){
  const months = (typeof getMonthRange==='function') ? getMonthRange() : [];
  if(!months.length) return homeEmpty('Set a FROM/TO period to see capacity vs demand.');
  let cap = null; try{ cap = (typeof pipelineCapacity==='function') ? pipelineCapacity(months) : null; }catch(e){}
  if(!cap || !cap.supply) return homeEmpty('Allocate people over the period to see capacity vs demand.');
  const pct = cap.supply>0 ? Math.round(cap.engaged/cap.supply*100) : 0;
  const overGroups = [];
  Object.keys(cap.byGroup||{}).forEach(function(k){ const g = cap.byGroup[k]; if(g && g.demand>g.supply+0.01) overGroups.push(g); });
  // forward pressure: Σ FTE·months the current candidates (proposed/on_hold) would add
  let pipeDemand = 0, cands = 0;
  try{
    (typeof projects!=='undefined'?projects:[]).forEach(function(p){
      const lc = (typeof projLifecycle==='function') ? projLifecycle(p) : 'active';
      if(lc!=='proposed' && lc!=='on_hold') return;
      const d = p.charter && p.charter.demand; const fm = d ? +d.fteMonths : NaN;
      if(fm>0){ pipeDemand += fm; cands++; }
    });
  }catch(e){}
  const col = cap.free<=0 ? 'var(--danger)' : (pct>=95 ? 'var(--warn)' : 'var(--accent)');
  let h = '<div class="home-kpis">'
    + homeKpi(pct+'%', 'Committed', col)
    + homeKpi(cap.free.toFixed(0), 'Free FTE·mo', cap.free>0?'var(--accent2)':'var(--danger)')
    + homeKpi(overGroups.length, 'Over disciplines', overGroups.length?'var(--danger)':'var(--muted)')
    + '</div>';
  h += '<div class="home-bar wide"><span style="width:'+Math.min(100,pct)+'%;background:'+col+'"></span></div>';
  if(overGroups.length){
    h += '<div class="home-tags">';
    overGroups.slice(0, 6).forEach(function(g){ h += '<span class="home-chip" style="color:var(--danger)">'+escH(g.name)+' +'+(g.demand-g.supply).toFixed(0)+'</span>'; });
    h += '</div>';
  }
  if(cands){
    const fits = pipeDemand <= cap.free;
    h += '<div style="font-size:11px;color:var(--muted);margin-top:7px">'
       + t('{n} candidate(s) would add {d} FTE·mo — ',{n:cands,d:pipeDemand.toFixed(0)})
       + '<b style="color:'+(fits?'var(--accent)':'var(--danger)')+'">'+(fits?t('fits free capacity'):t('exceeds free capacity'))+'</b></div>';
  }
  h += '<div class="home-foot">'
     + '<button class="home-btn" onclick="railGo(null,\'dashboard\')">'+escH(t('Resource balancer →'))+'</button>'
     + '<button class="home-btn" onclick="railGo(null,\'pipeline\')">'+escH(t('Pipeline →'))+'</button></div>';
  return h;
}
function homeWqCost(){
  const months = (typeof getMonthRange==='function') ? getMonthRange() : [];
  if(!months.length) return homeEmpty('Set a FROM/TO period to see team cost.');
  let util = {}; try{ util = _buildEngUtil(months); }catch(e){}
  const engs = Object.values(util);
  let team = 0, alloc = 0;
  engs.forEach(function(eu){
    months.forEach(function(m){
      team += (eu.cost||0);
      alloc += Math.min(eu.monthAllocs[m]||0, 1) * (eu.cost||0);
    });
  });
  const bench = Math.max(0, team-alloc);
  const pct = team>0 ? Math.round(alloc/team*100) : 0;
  let h = '<div class="home-kpis">'
    + homeKpi(homeEur(team), 'Team cost', 'var(--text)')
    + homeKpi(pct+'%', 'Allocated', 'var(--accent)')
    + homeKpi(homeEur(bench), 'Bench €', 'var(--warn)')
    + '</div>';
  h += '<div class="home-bar wide"><span style="width:'+pct+'%;background:var(--accent)"></span></div>';
  return h;
}

// ── portfolio widgets ──────────────────────────────────────────────────────
// Portfolio Health — the "what to build" readout the front door was missing:
// risk-adjusted portfolio value, capital tied up in sub-economic projects, and the
// lifecycle funnel. Reads ecDataset (value) + projLifecycle (funnel). Active portfolio
// only (terminal projects excluded from value, matching the capacity-suppression model).
function homeWqPortfolio(){
  if(typeof projects==='undefined' || !projects.length) return homeEmpty('No projects yet — add projects on the matrix.');
  let eco = []; try{ eco = (typeof ecDataset==='function') ? ecDataset() : []; }catch(e){}
  const byId = {}; eco.forEach(function(r){ if(r && r.p) byId[r.p.id] = r; });
  let sumVal = 0, atRisk = 0, valued = 0;
  const life = { proposed:0, active:0, in_service:0 };
  projects.forEach(function(p){
    const lc = (typeof projLifecycle==='function') ? projLifecycle(p) : 'active';
    if(life[lc]!=null) life[lc]++;
    const active = (typeof projIsActivePortfolio==='function') ? projIsActivePortfolio(p) : true;
    if(!active) return;
    const r = byId[p.id]; if(!r) return;
    const radj = (r.riskAdjNpv!=null) ? r.riskAdjNpv : (r.npv!=null ? r.npv : null);
    if(radj!=null){ sumVal += radj; valued++; }
    if(r.pi!=null && r.pi<1) atRisk += (r.invested||0);   // capital committed to sub-1-PI projects
  });
  let h = '<div class="home-kpis">'
    + homeKpi(homeEur(sumVal), 'Portfolio value', sumVal>=0?'var(--accent2)':'var(--danger)')
    + homeKpi(homeEur(atRisk), 'Capital at risk', atRisk>0?'var(--warn)':'var(--muted)')
    + homeKpi(valued, 'Valued', 'var(--text)')
    + '</div>';
  h += '<div class="home-tags">'
     + '<span class="home-chip">'+life.proposed+' '+escH(t('Proposed'))+'</span>'
     + '<span class="home-chip">→ '+life.active+' '+escH(t('Active'))+'</span>'
     + '<span class="home-chip">→ '+life.in_service+' '+escH(t('In service'))+'</span>'
     + '</div>';
  h += '<div class="home-foot"><button class="home-btn" onclick="railGo(null,\'portfolio\')">'+escH(t('Portfolio analytics →'))+'</button></div>';
  return h;
}

// Portfolio by Section — every ACTIVE-portfolio project grouped by its section, each with
// gate progress (stage i/n), lifecycle, and staffing (€ + FTE·months over the current
// period). Unlike the alert-oriented tiles, this shows projects that have NO problem — so a
// freshly funded / just-gated project appears here immediately. Staffing is computed straight
// off allocRows (not suppression-gated), so it is truthful even for a project mid-transition.
function homeWqSections(){
  if(typeof projects==='undefined' || !projects.length) return homeEmpty('No projects yet — add projects on the matrix.');
  let stages=[]; try{ stages=(typeof gateConfig!=='undefined'&&gateConfig.model&&gateConfig.model.stages)||[]; }catch(e){}
  let months=[]; try{ months=(typeof getMonthRange==='function')?getMonthRange():[]; }catch(e){}
  const engById={}; if(typeof engineers!=='undefined') engineers.forEach(function(e){ engById[e.id]=e; });
  function projStaffing(pid){
    let c=0,f=0; if(!months.length) return {cost:0,fte:0};
    allocRows.forEach(function(r){ if(r.projectId!==pid||r.engId==null) return; const e=engById[r.engId]; if(!e) return;
      months.forEach(function(m){ if(r.allocs&&r.allocs[m]!=null){ c+=_allocCost(r.allocs[m],e.monthlyCost); f+=_allocNum(r.allocs[m]); } }); });
    return {cost:c,fte:f};
  }
  const secList=(typeof sections!=='undefined'&&Array.isArray(sections))?sections:[];
  const groups={}, order=[];
  projects.forEach(function(p){
    const active=(typeof projIsActivePortfolio==='function')?projIsActivePortfolio(p):true;
    if(!active) return;
    const key=(p.sectionId!=null)?p.sectionId:'__none';
    if(!groups[key]){ groups[key]=[]; order.push(key); }
    groups[key].push(p);
  });
  if(!order.length) return homeEmpty('No active projects — fund a candidate in the Pipeline to see it here.');
  const nStages=stages.length;
  let h='';
  order.forEach(function(secId){
    const sec=secList.find(function(s){ return s.id===secId; });
    const secName=sec?sec.name:t('Unsectioned');
    const secColor=sec?safeColor(sec.color,'var(--muted)'):'var(--muted)';
    const list=groups[secId];
    h+='<div class="home-sec-grp"><div class="home-sec-h" style="border-left:3px solid '+secColor+'">'
      +'<span>'+escH(secName)+'</span><span class="home-sec-n">'+list.length+'</span></div>';
    list.forEach(function(p){
      const lc=(typeof projLifecycleDef==='function')?projLifecycleDef(p):null;
      const lcColor=safeColor(lc&&lc.color,'var(--muted)');
      const idx=(nStages&&typeof gtCurStageIdx==='function')?gtCurStageIdx(p,stages):0;
      const stName=nStages?((stages[idx]&&stages[idx].name)||''):'';
      const pct=nStages>1?Math.round(idx/(nStages-1)*100):(nStages?100:0);
      const st=projStaffing(p.id);
      const open=(typeof gtOpenDetail==='function')?('gtOpenDetail('+(+p.id)+')'):'';
      h+='<div class="home-sec-row" onclick="railGo(null,\'gate\');'+(open?open+';':'')+'">'
        +'<div class="home-sec-row-top"><span class="home-sec-name">'+escH(p.name||t('Untitled'))+'</span>'
        +'<span class="home-sec-chip" style="color:'+lcColor+';border-color:'+lcColor+'55;background:'+lcColor+'18">'+escH(lc?lc.label:'—')+'</span></div>';
      if(nStages){
        h+='<div class="home-sec-prog"><div class="home-sec-prog-bar" style="width:'+pct+'%;background:'+secColor+'"></div></div>'
          +'<div class="home-sec-meta"><span>'+escH(t('Stage {i}/{n}',{i:idx+1,n:nStages}))+(stName?' · '+escH(stName):'')+'</span>'
          +'<span>'+homeEur(st.cost)+' · '+st.fte.toFixed(1)+' FTE·mo</span></div>';
      } else {
        h+='<div class="home-sec-meta"><span>'+escH(t('No gate stages'))+'</span><span>'+homeEur(st.cost)+' · '+st.fte.toFixed(1)+' FTE·mo</span></div>';
      }
      h+='</div>';
    });
    h+='</div>';
  });
  h+='<div class="home-foot"><button class="home-btn" onclick="railGo(null,\'gate\')">'+escH(t('Gate board →'))+'</button></div>';
  return h;
}

// Decisions Pending — the forward-looking lane (vs. the problem-oriented tiles). Candidates
// awaiting a fund/kill call, projects on hold too long, and gate-blocked projects. Home stays
// READ-ONLY: every row deep-links to where the decision is actually made (Pipeline / Gate).
function homeWqDecisions(){
  if(typeof projects==='undefined' || !projects.length) return homeEmpty('No projects yet.');
  let sig = {}; try{ sig = gtBuildSignalMap(); }catch(e){}
  let stages = []; try{ stages = (typeof gateConfig!=='undefined' && gateConfig.model && gateConfig.model.stages) || []; }catch(e){}
  const now = Date.now(), rows = [];
  projects.forEach(function(p){
    const lc = (typeof projLifecycle==='function') ? projLifecycle(p) : 'active';
    if(lc==='proposed'){ rows.push({ name:p.name||'Untitled', tag:t('fund / kill'), col:'var(--accent)', go:'pipeline', ord:1 }); return; }
    if(lc==='on_hold'){
      const hist = Array.isArray(p.lifecycleHistory) ? p.lifecycleHistory : [];
      let since=null; for(let k=hist.length-1;k>=0;k--){ if(hist[k] && hist[k].to==='on_hold'){ since=hist[k].ts; break; } }
      const days = since!=null ? Math.floor((now-since)/86400000) : null;
      if(days!=null && days>=90){ rows.push({ name:p.name||'Untitled', tag:t('held {d}d',{d:days}), col:'var(--warn)', go:'gate', id:p.id, ord:2 }); return; }
    }
    // gate-blocked (hard block) → a gate review is due
    try{
      const s = sig[p.id] || {}, gp = p.gatePlan || (typeof makeGatePlan==='function'?makeGatePlan():{});
      const idx = (typeof gtCurStageIdx==='function') ? gtCurStageIdx(p, stages) : 0, st = stages[idx];
      if(st && typeof gtStageReadiness==='function'){
        const rd = gtStageReadiness(st, gp, s);
        if(rd.blocked) rows.push({ name:p.name||'Untitled', tag:t('gate review'), col:'var(--danger)', go:'gate', id:p.id, ord:3 });
      }
    }catch(e){}
  });
  if(!rows.length) return homeEmpty('No decisions pending — pipeline and gates are clear. ✓');
  rows.sort(function(a,b){ return a.ord-b.ord; });
  const nCand = rows.filter(function(r){return r.ord===1;}).length;
  let h = '<div class="home-kpis">'
    + homeKpi(nCand, 'To green-light', nCand?'var(--accent)':'var(--muted)')
    + homeKpi(rows.filter(function(r){return r.ord===2;}).length, 'Stale holds', 'var(--warn)')
    + homeKpi(rows.filter(function(r){return r.ord===3;}).length, 'Gate reviews', 'var(--danger)')
    + '</div><div class="home-list">';
  rows.slice(0, 8).forEach(function(r){
    const open = r.id!=null ? 'gtOpenDetail('+(+r.id)+')' : 'railGo(null,\''+r.go+'\')';
    h += '<div class="home-row" onclick="railGo(null,\''+r.go+'\');'+(r.id!=null?open+';':'')+'">'
       + '<span class="home-row-name">'+escH(r.name)+'</span>'
       + '<span class="home-sp"></span>'
       + '<span class="home-row-val" style="color:'+r.col+'">'+escH(r.tag)+'</span></div>';
  });
  return h + '</div>';
}

// Insight Launchpad — the fix for "insights buried": quick entries into the analytics that
// the nav reframe spread next to what they analyze. Reuses the add-card styling.
function homeWqLaunchpad(){
  const links = [
    ['portfolio', t('Portfolio analytics'), t('value · ROI · risk')],
    ['analytics', t('People analytics'),    t('talent risk · dimensions')],
    ['exec',      t('Executive summary'),   t('one-page cockpit')],
    ['gate',      t('Gate & PI'),           t('stage-gate governance')],
    ['pipeline',  t('Pipeline'),            t('intake & feasibility')],
  ];
  let h = '<div class="home-add-grid">';
  links.forEach(function(l){
    h += '<button class="home-add-card" onclick="railGo(null,\''+homeAttr(l[0])+'\')">'
       + '<span class="home-add-title">'+escH(l[1])+'</span>'
       + '<span class="home-add-desc">'+escH(l[2])+'</span></button>';
  });
  return h + '</div>';
}

/* ══════════════════════════════════════════════════════════════════════════
   5. VIEW + CUSTOMIZATION UI
   ══════════════════════════════════════════════════════════════════════════ */

function openHome(){
  if(!G('home-overlay')) return;
  _homePrefs = homeLoadPrefs();
  G('home-overlay').classList.add('show');
  renderHome();
}
function closeHome(){ const o = G('home-overlay'); if(o) o.classList.remove('show'); }

// Onboarding strip at the top of Home: a teaching empty-state when the workspace has no
// data yet (offer the sample seed + the first real step), or a dismissible reminder when
// the user is exploring the loaded sample. Returns '' when neither applies. All handlers
// (loadSampleData/clearAndStartMine/railGo) live in the flat global scope.
function homeOnboardBanner(){
  if(typeof workspaceIsEmpty==='function' && workspaceIsEmpty()){
    const canSample = (typeof sampleDataAvailable==='function' && sampleDataAvailable());
    let h = '<div class="home-onboard"><div class="home-onboard-txt"><strong>'
      + escH(t('Your workspace is empty.')) + '</strong> '
      + escH(t('Load a ready-made sample to see every view in action, or add your first person to start your own.'))
      + '</div><div class="home-onboard-btns">';
    if(canSample) h += '<button class="home-btn primary" onclick="loadSampleData()">'+escH(t('🎬 Load sample data'))+'</button>';
    h += '<button class="home-btn" onclick="railGo(null,\'roster\')">'+escH(t('＋ Add your first person'))+'</button>';
    return h + '</div></div>';
  }
  if(typeof homeIsSample==='function' && homeIsSample()){
    return '<div class="home-onboard is-sample"><div class="home-onboard-txt">'
      + escH(t('You\'re exploring sample data — every view is populated so you can see how it fits together.'))
      + '</div><div class="home-onboard-btns">'
      + '<button class="home-btn" onclick="clearAndStartMine()">'+escH(t('Clear & start mine'))+'</button>'
      + '<button class="home-btn" onclick="homeDismissSample()">'+escH(t('Dismiss'))+'</button>'
      + '</div></div>';
  }
  return '';
}

function renderHome(){
  const host = G('home-body'); if(!host) return;
  if(!_homePrefs) _homePrefs = homeLoadPrefs();
  const isDefault = (typeof railLanding!=='undefined' && railLanding==='home');
  let h = homeOnboardBanner();
  h += '<div class="home-topbar"><div class="home-filters">';
  [['all','All'],['people','People'],['planner','Planner'],['portfolio','Portfolio'],['governance','Gov']].forEach(function(f){
    h += '<button class="home-fchip'+(_homeFilter===f[0]?' on':'')+'" onclick="homeSetFilter(\''+f[0]+'\')">'+escH(t(f[1]))+'</button>';
  });
  h += '</div><span class="home-bar-sp"></span>'
     + '<button class="home-btn" onclick="homeOpenAdd()">'+escH(t('＋ Add widget'))+'</button>'
     + '<button class="home-btn'+(_homeEdit?' primary':'')+'" onclick="homeToggleEdit()">'+(_homeEdit?escH(t('✓ Done')):escH(t('⚙ Customize')))+'</button>'
     + '<button class="home-btn'+(isDefault?' primary':'')+'" onclick="homeSetDefault()" title="'+escH(t('Open Home each time the app starts'))+'">'
     +   (isDefault?escH(t('★ Default')):escH(t('☆ Set as default')))+'</button>'
     + '</div>';
  if(_homeAddOpen) h += homeAddPanel();
  h += '<div id="home-grid" class="home-grid'+(_homeEdit?' editing':'')+'">'+homeGridHTML()+'</div>';
  host.innerHTML = h;
}

function homeAddPanel(){
  const have = {}; _homePrefs.layout.forEach(function(x){ have[x.id]=1; });
  const avail = homeWidgetDefs().filter(function(d){ return !have[d.id]; });
  let h = '<div class="home-add"><div class="home-add-head">'+escH(t('Add a widget'))
    + '<button class="home-btn" onclick="homeOpenAdd()">'+escH(t('Close'))+'</button></div>';
  if(!avail.length){ h += '<div class="home-empty">'+escH(t('Every widget is already on your page.'))+'</div>'; return h+'</div>'; }
  h += '<div class="home-add-grid">';
  avail.forEach(function(d){
    h += '<button class="home-add-card" onclick="homeAddWidget(\''+homeAttr(d.id)+'\')">'
       + '<span class="home-add-title">'+escH(d.title)+'</span>'
       + '<span class="home-add-dom">'+escH(homeDomLabel(d.domain))+'</span>'
       + '<span class="home-add-desc">'+escH(d.desc||'')+'</span></button>';
  });
  return h + '</div></div>';
}

function homeGridHTML(){
  const ctx = { months:(typeof getMonthRange==='function')?getMonthRange():[], filter:_homeFilter, edit:_homeEdit };
  return _homePrefs.layout.map(function(it){ return homeWidgetHTML(it, ctx); }).join('');
}
function homeWidgetHTML(item, ctx){
  const def = homeWidgetDef(item.id); if(!def) return '';
  const w = homeClampW(item.w);
  let body = '';
  try{ body = def.render(ctx); }catch(e){ body = homeEmpty('This widget failed to render.'); }
  const hero = (item.id==='action-queue' || item.id==='capacity') ? ' home-w-hero' : '';
  // Section is always a drop TARGET; the header grip is the always-available drag
  // SOURCE (draggable anytime, no need to enter Customize — that was undiscoverable).
  let h = '<section class="home-w'+hero+'" style="grid-column:span '+w+'" data-wid="'+escH(item.id)+'"'
     + ' ondragover="homeDragOver(event,\''+homeAttr(item.id)+'\')"'
     + ' ondragleave="homeDragLeave(event)"'
     + ' ondrop="homeDrop(event,\''+homeAttr(item.id)+'\')">';
  h += '<header class="home-w-head">'
     + '<span class="home-grip" draggable="true" title="'+escH(t('Drag to reorder'))+'"'
     +   ' ondragstart="homeDragStart(event,\''+homeAttr(item.id)+'\')" ondragend="homeDragEnd(event)">⠿</span>'
     + '<span class="home-w-title">'+escH(def.title)+'</span>'
     + '<span class="home-w-dom">'+escH(homeDomLabel(def.domain))+'</span>'
     + '<span class="home-bar-sp"></span>';
  if(_homeEdit){
    h += '<button class="home-w-ctl" title="'+escH(t('Width'))+'" onclick="homeCycleWidth(\''+homeAttr(item.id)+'\')">'+w+'⤢</button>'
       + '<button class="home-w-ctl" title="'+escH(t('Move earlier'))+'" onclick="homeNudge(\''+homeAttr(item.id)+'\',-1)">◀</button>'
       + '<button class="home-w-ctl" title="'+escH(t('Move later'))+'" onclick="homeNudge(\''+homeAttr(item.id)+'\',1)">▶</button>'
       + '<button class="home-w-ctl danger" title="'+escH(t('Remove'))+'" onclick="homeRemoveWidget(\''+homeAttr(item.id)+'\')">✕</button>';
  }
  h += '</header><div class="home-wb" id="home-wb-'+escH(item.id)+'">'+body+'</div></section>';
  return h;
}

// Re-render ONE widget body in place (used by snooze/dismiss so the rest stays put).
function homeRefreshWidget(wid){
  const el = G('home-wb-'+wid); if(!el) return;
  const def = homeWidgetDef(wid); if(!def) return;
  const ctx = { months:(typeof getMonthRange==='function')?getMonthRange():[], filter:_homeFilter, edit:_homeEdit };
  try{ el.innerHTML = def.render(ctx); }catch(e){ el.innerHTML = homeEmpty('This widget failed to render.'); }
}

// ── customization actions (all persist to eim_home_prefs) ──────────────────
function homeSetFilter(f){ _homeFilter = f; renderHome(); }
function homeToggleEdit(){ _homeEdit = !_homeEdit; _homeAddOpen = false; renderHome(); }
function homeOpenAdd(){ _homeAddOpen = !_homeAddOpen; renderHome(); }
function homeIdx(id){ for(let i=0;i<_homePrefs.layout.length;i++) if(_homePrefs.layout[i].id===id) return i; return -1; }
function homeAddWidget(id){
  const def = homeWidgetDef(id); if(!def) return;
  if(homeIdx(id)>=0) return;
  _homePrefs.layout.push({ id:id, w:homeClampW(def.defW) });
  _homeAddOpen = false;
  homeSavePrefs(_homePrefs); renderHome();
}
function homeRemoveWidget(id){
  _homePrefs.layout = _homePrefs.layout.filter(function(x){ return x.id!==id; });
  homeSavePrefs(_homePrefs); renderHome();
}
function homeCycleWidth(id){
  const i = homeIdx(id); if(i<0) return;
  _homePrefs.layout[i].w = (homeClampW(_homePrefs.layout[i].w) % 3) + 1;
  homeSavePrefs(_homePrefs); renderHome();
}
function homeNudge(id, dir){
  const i = homeIdx(id), j = i+dir, L = _homePrefs.layout;
  if(i<0 || j<0 || j>=L.length) return;
  const tmp = L[i]; L[i] = L[j]; L[j] = tmp;
  homeSavePrefs(_homePrefs); renderHome();
}
function homeSetDefault(){
  if(typeof railLanding!=='undefined'){ railLanding = 'home'; if(typeof railSavePrefs==='function') railSavePrefs(); }
  renderHome();
}

// ── drag-reorder (native HTML5 DnD; grip handle is the source, always available) ──
function homeDragStart(ev, id){
  _homeDragId = id;
  try{ ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', id); }catch(e){}
  const sec = ev.currentTarget && ev.currentTarget.closest('.home-w');
  if(sec) sec.classList.add('home-dragging');
}
function homeClearDropMarks(){
  const m = document.querySelectorAll('.home-w.home-drop-before,.home-w.home-drop-after');
  for(let i=0;i<m.length;i++) m[i].classList.remove('home-drop-before','home-drop-after');
}
function homeDragOver(ev, overId){
  if(!_homeDragId || _homeDragId===overId) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  const sec = ev.currentTarget; if(!sec || !sec.classList) return;
  const r = sec.getBoundingClientRect(), after = (ev.clientX - r.left) > r.width/2;
  homeClearDropMarks();
  sec.classList.add(after ? 'home-drop-after' : 'home-drop-before');
}
function homeDragLeave(ev){ if(ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('home-drop-before','home-drop-after'); }
function homeDrop(ev, targetId){
  ev.preventDefault();
  if(_homeDragId && _homeDragId!==targetId){
    const sec = ev.currentTarget;
    const r = sec ? sec.getBoundingClientRect() : null;
    const after = r ? ((ev.clientX - r.left) > r.width/2) : false;
    const L = _homePrefs.layout, from = homeIdx(_homeDragId);
    if(from>=0){
      const moved = L.splice(from, 1)[0];
      let to = homeIdx(targetId);            // recompute after the splice
      if(to<0) to = L.length; else if(after) to += 1;
      L.splice(to, 0, moved);
      homeSavePrefs(_homePrefs); renderHome();
    }
  }
  _homeDragId = null; homeClearDropMarks();
}
function homeDragEnd(){ _homeDragId = null; homeClearDropMarks();
  const d = document.querySelector('.home-w.home-dragging'); if(d) d.classList.remove('home-dragging'); }

// ── snooze / dismiss on an action-queue item ───────────────────────────────
function homeSnooze(id){
  if(!_homePrefs.snoozed) _homePrefs.snoozed = {};
  _homePrefs.snoozed[id] = { until:new Date(Date.now()+7*24*3600*1000).toISOString() };
  homeSavePrefs(_homePrefs); homeRefreshWidget('action-queue');
}
function homeDismiss(id, hash){
  if(!_homePrefs.dismissed) _homePrefs.dismissed = {};
  _homePrefs.dismissed[id] = { hash:hash, ts:Date.now() };
  homeSavePrefs(_homePrefs); homeRefreshWidget('action-queue');
}

// ── deep-link opener: one concern → exactly one target surface + entity ────
function homeGoView(view, fn){
  if(typeof closeHome==='function') closeHome();
  // Record where we came from (Home) on the back stack so the target panel's ← BACK
  // returns here. railGo does this automatically, but these openers self-show their
  // overlay and bypass railGo, so mirror the push manually (same guard/cap as railGo).
  try{ if(typeof railNavStack!=='undefined' && typeof activeView!=='undefined' && activeView && activeView!==view){ railNavStack.push(activeView); if(railNavStack.length>60) railNavStack.shift(); } }catch(e){}
  if(typeof activeView!=='undefined') activeView = view;
  try{ fn(); }catch(e){}
  if(typeof railRender==='function') railRender();
  if(typeof railUpdateCrumb==='function') railUpdateCrumb();
}
function homeOpenFor(concern, entityId){
  const id = +entityId;
  if(concern==='retention-risk' || concern==='stale-review'){ if(typeof openIdCardModal==='function') openIdCardModal(id); return; }
  if(concern==='over-allocation' || concern==='bench'){ if(typeof railGo==='function') railGo(null,'plan'); return; }
  if(concern==='task-overdue' || concern==='task-pinned'){ if(typeof railGo==='function') railGo(null,'backlog'); return; }
  if(concern==='engagement-due'){ if(typeof railGo==='function') railGo(null,'engagement'); return; }
  if(concern==='gate-blocked' || concern==='gate-behind' || concern==='hold-stale'){
    if(typeof railGo==='function') railGo(null,'gate');
    if(typeof gtOpenDetail==='function') gtOpenDetail(id);
    return;
  }
  if(concern==='candidate-stale'){ if(typeof railGo==='function') railGo(null,'pipeline'); return; }
  if(concern==='charter-conflict'){ homeGoView('workspace', function(){ if(typeof chtOpenDecision==='function') chtOpenDecision(id); }); return; }
  if(concern==='value-destroying' || concern==='low-unit-margin'){ homeGoView('workspace', function(){ if(typeof openCharter==='function') openCharter(id,'financials'); }); return; }
  if(concern==='dtc-gap'){ homeGoView('workspace', function(){ if(typeof openDtc==='function') openDtc(); if(typeof dtcSelectProject==='function') dtcSelectProject(id); }); return; }
  if(concern==='channel-concentration'){ homeGoView('workspace', function(){ if(typeof openChannels==='function') openChannels(id); }); return; }
}
