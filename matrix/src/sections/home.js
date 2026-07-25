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
};

// Severity ordering: lower rank sorts first / is "worse".
export const HOME_BAND_RANK = { critical:0, warn:1, watch:2 };

// Which domain each concern belongs to (drives the top-bar filter chips).
const HOME_CONCERN_DOMAIN = {
  'retention-risk':'people', 'over-allocation':'people', 'bench':'people',
  'stale-review':'people', 'engagement-due':'people',
  'gate-blocked':'governance', 'gate-behind':'governance',
  'charter-conflict':'portfolio', 'value-destroying':'portfolio',
  'low-unit-margin':'portfolio', 'dtc-gap':'portfolio', 'channel-concentration':'portfolio',
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
  const p = pj.p||{}, s = pj.sig||{}, rd = pj.readiness||{};
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
      ['Gate blocked — '+(rd.blockers?rd.blockers.length:0)+' mandatory criterion/criteria unmet'],
      [{ label:'Readiness', val:(rd.pct==null?'—':rd.pct+'%'), tone:'critical' }],
      'Clear blockers in Gate & PI', blk.join(',')));
  } else if(rd.pct!=null && rd.pct < thr.gateBehindPct){
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
  if(s.pi!=null && s.pi < 1){
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
      try{
        const gp = p.gatePlan || (typeof makeGatePlan==='function' ? makeGatePlan() : {});
        const idx = (typeof gtCurStageIdx==='function') ? gtCurStageIdx(p, stages) : 0;
        const st = stages[idx];
        if(st && typeof gtStageReadiness==='function') readiness = gtStageReadiness(st, gp, s);
      }catch(e){}
      homeClassifyProject({ p:{ id:p.id, uid:p.uid, name:p.name||'Untitled' }, sig:s, readiness:readiness }, { thresholds:thr })
        .forEach(function(it){ items.push(it); });
    });
  }catch(e){}

  return items;
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
    { id:'action-queue', w:3 },
    { id:'talent-risk',  w:1 },
    { id:'gate-readiness', w:2 },
    { id:'capacity',     w:1 },
    { id:'headcount',    w:1 },
    { id:'engagement',   w:1 },
  ];
}
function homeClampW(w){ w = +w||1; return w<1 ? 1 : (w>3 ? 3 : w); }

function homeLoadPrefs(){
  const p = { layout:homeDefaultLayout(), snoozed:{}, dismissed:{} };
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
      }
    }
  }catch(e){}
  if(!p.layout.length) p.layout = homeDefaultLayout();
  return p;
}
function homeSavePrefs(p){ try{ localStorage.setItem(HOME_PREFS_KEY, JSON.stringify(p||_homePrefs)); }catch(e){} }

/* ══════════════════════════════════════════════════════════════════════════
   4. WIDGET LIBRARY — curated, screen-sized read-outs of existing datasets
   ══════════════════════════════════════════════════════════════════════════ */

// Built as a FUNCTION (not a top-level const) so importing this module in Node for
// the engine tests never runs t() at load — top level stays global-free.
function homeWidgetDefs(){
  return [
    { id:'action-queue',   title:t('Action Queue'),        domain:'action',     defW:3, render:homeWqActionQueue,
      desc:t('Ranked cross-domain "what needs you" list') },
    { id:'talent-risk',    title:t('Talent Risk Radar'),   domain:'people',     defW:1, render:homeWqTalentRisk,
      desc:t('Your highest-risk people') },
    { id:'retention',      title:t('Retention Watch'),     domain:'people',     defW:1, render:homeWqRetention,
      desc:t('Risk bands + who is critical') },
    { id:'review-gov',     title:t('Review Governance'),   domain:'people',     defW:1, render:homeWqReviewGov,
      desc:t('People overdue a performance review') },
    { id:'engagement',     title:t('Engagement This Week'),domain:'people',     defW:1, render:homeWqEngagement,
      desc:t("This week's retention touchpoints") },
    { id:'headcount',      title:t('Headcount'),           domain:'people',     defW:1, render:homeWqHeadcount,
      desc:t('People, managers, SPOF, avg compa-ratio') },
    { id:'gate-readiness', title:t('Gate Readiness'),      domain:'governance', defW:2, render:homeWqGate,
      desc:t('Projects blocked or behind at their gate') },
    { id:'capacity',       title:t('Capacity & Bench'),    domain:'governance', defW:1, render:homeWqCapacity,
      desc:t('FTE this month, bench, over-allocation') },
    { id:'cost-burn',      title:t('Team Cost'),           domain:'governance', defW:2, render:homeWqCost,
      desc:t('Loaded team cost, allocated %, bench €') },
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
function homeDomLabel(d){ return d==='people' ? t('People') : d==='governance' ? t('Gov') : d==='portfolio' ? t('Portfolio') : t('Action'); }
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
function homeWqTalentRisk(){
  let ds = []; try{ ds = buildAnalyticsDataset(); }catch(e){}
  const rows = ds.filter(function(d){ return d.riskScore>0; })
    .sort(function(a,b){ return b.riskScore-a.riskScore; }).slice(0, 6);
  if(!rows.length) return homeEmpty('No talent-risk signals yet — place people on the nine-box and log reviews.');
  const max = rows[0].riskScore || 1;
  let h = '';
  rows.forEach(function(d){
    const col = d.riskScore>=50 ? 'var(--danger)' : d.riskScore>=25 ? 'var(--warn)' : 'var(--accent2)';
    h += '<div class="home-row" onclick="homeOpenFor(\'retention-risk\','+(+d.id)+')">'
       + '<span class="home-row-name">'+escH(d.name||'')+'</span>'
       + '<span class="home-bar"><span style="width:'+Math.round(d.riskScore/(max||1)*100)+'%;background:'+col+'"></span></span>'
       + '<span class="home-row-val" style="color:'+col+'">'+escH(String(d.riskScore))+'</span></div>';
  });
  return h;
}
function homeWqRetention(){
  let ds = []; try{ ds = buildAnalyticsDataset(); }catch(e){}
  const crit = ds.filter(function(d){ return d.riskScore>=50; });
  const warn = ds.filter(function(d){ return d.riskScore>=25 && d.riskScore<50; });
  let h = '<div class="home-kpis">'
    + homeKpi(crit.length, 'Critical', 'var(--danger)')
    + homeKpi(warn.length, 'At risk', 'var(--warn)')
    + homeKpi(ds.length, 'Headcount', 'var(--text)')
    + '</div>';
  if(crit.length){
    h += '<div class="home-tags">';
    crit.slice(0, 8).forEach(function(d){ h += '<span class="home-chip clk" onclick="homeOpenFor(\'retention-risk\','+(+d.id)+')">'+escH(d.name||'')+'</span>'; });
    h += '</div>';
  }
  return h;
}
function homeWqReviewGov(){
  let ds = []; try{ ds = buildAnalyticsDataset(); }catch(e){}
  const stale = ds.filter(function(d){ return d.reviewCurrencyMonths==null ? (d.tenureMonths!=null && d.tenureMonths>12) : d.reviewCurrencyMonths>15; });
  if(!stale.length) return homeEmpty('All performance reviews are current. ✓');
  stale.sort(function(a,b){
    const am = a.reviewCurrencyMonths==null ? 999 : a.reviewCurrencyMonths;
    const bm = b.reviewCurrencyMonths==null ? 999 : b.reviewCurrencyMonths;
    return bm-am;
  });
  let h = '<div class="home-kpis">'+homeKpi(stale.length, 'Overdue reviews', 'var(--warn)')+'</div><div class="home-list">';
  stale.slice(0, 7).forEach(function(d){
    const lbl = d.reviewCurrencyMonths==null ? 'never' : d.reviewCurrencyMonths+' mo';
    h += '<div class="home-row" onclick="homeOpenFor(\'stale-review\','+(+d.id)+')"><span class="home-row-name">'+escH(d.name||'')+'</span>'
       + '<span class="home-sp"></span><span class="home-row-val">'+escH(lbl)+'</span></div>';
  });
  return h + '</div>';
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

// ── governance / capacity widgets ──────────────────────────────────────────
function homeWqGate(){
  if(typeof projects==='undefined' || !projects.length) return homeEmpty('No projects yet — add projects on the matrix.');
  let sig = {}; try{ sig = gtBuildSignalMap(); }catch(e){}
  let stages = []; try{ stages = (typeof gateConfig!=='undefined' && gateConfig.model && gateConfig.model.stages) || []; }catch(e){}
  const rows = [];
  projects.forEach(function(p){
    const s = sig[p.id] || {};
    let rd = { blocked:false, pct:100, blockers:[] };
    try{
      const gp = p.gatePlan || (typeof makeGatePlan==='function' ? makeGatePlan() : {});
      const idx = (typeof gtCurStageIdx==='function') ? gtCurStageIdx(p, stages) : 0;
      const st = stages[idx];
      if(st && typeof gtStageReadiness==='function') rd = gtStageReadiness(st, gp, s);
    }catch(e){}
    rows.push({ p:p, rd:rd });
  });
  const att = rows.filter(function(r){ return r.rd.blocked || (r.rd.pct!=null && r.rd.pct<50); });
  if(!att.length) return homeEmpty('Every project is gate-ready. ✓');
  att.sort(function(a,b){ return ((a.rd.blocked?0:1)-(b.rd.blocked?0:1)) || (a.rd.pct-b.rd.pct); });
  let h = '';
  att.slice(0, 7).forEach(function(r){
    const col = r.rd.blocked ? 'var(--danger)' : 'var(--warn)';
    h += '<div class="home-row" onclick="homeOpenFor(\'gate-blocked\','+(+r.p.id)+')">'
       + '<span class="home-row-name">'+escH(r.p.name||'Untitled')+'</span>'
       + '<span class="home-bar"><span style="width:'+Math.max(3,Math.min(100,r.rd.pct||0))+'%;background:'+col+'"></span></span>'
       + '<span class="home-row-val" style="color:'+col+'">'+(r.rd.blocked ? escH(t('BLOCKED')) : (r.rd.pct+'%'))+'</span></div>';
  });
  return h;
}
function homeWqCapacity(){
  const months = (typeof getMonthRange==='function') ? getMonthRange() : [];
  let util = {}; try{ util = _buildEngUtil(months); }catch(e){}
  const engs = Object.values(util);
  if(!engs.length) return homeEmpty('Set a FROM/TO period and allocate people to see capacity.');
  const cur = homeCurInRange(months);
  let fte = 0, bench = 0, over = 0;
  engs.forEach(function(eu){ const a = eu.monthAllocs[cur]||0; fte += a; if(a<0.1) bench++; if(a>1.05) over++; });
  return '<div class="home-kpis">'
    + homeKpi(fte.toFixed(1), 'FTE this month', 'var(--text)')
    + homeKpi(bench, 'On bench', 'var(--accent2)')
    + homeKpi(over, 'Over-allocated', 'var(--warn)')
    + '</div>';
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

function renderHome(){
  const host = G('home-body'); if(!host) return;
  if(!_homePrefs) _homePrefs = homeLoadPrefs();
  const isDefault = (typeof railLanding!=='undefined' && railLanding==='home');
  let h = '<div class="home-topbar"><div class="home-filters">';
  [['all','All'],['people','People'],['portfolio','Portfolio'],['governance','Gov']].forEach(function(f){
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
  const hero = item.id==='action-queue' ? ' home-w-hero' : '';
  let h = '<section class="home-w'+hero+'" style="grid-column:span '+w+'" data-wid="'+escH(item.id)+'"';
  if(_homeEdit){
    h += ' draggable="true"'
      + ' ondragstart="homeDragStart(event,\''+homeAttr(item.id)+'\')"'
      + ' ondragover="homeDragOver(event)"'
      + ' ondrop="homeDrop(event,\''+homeAttr(item.id)+'\')"'
      + ' ondragend="homeDragEnd(event)"';
  }
  h += '><header class="home-w-head">'
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

// ── drag-reorder (native HTML5 DnD, edit mode only) ────────────────────────
function homeDragStart(ev, id){
  _homeDragId = id;
  try{ ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', id); }catch(e){}
}
function homeDragOver(ev){ if(_homeDragId){ ev.preventDefault(); try{ ev.dataTransfer.dropEffect='move'; }catch(e){} } }
function homeDrop(ev, targetId){
  ev.preventDefault();
  if(_homeDragId && _homeDragId!==targetId){
    const L = _homePrefs.layout, from = homeIdx(_homeDragId);
    if(from>=0){
      const moved = L.splice(from, 1)[0];
      const to = homeIdx(targetId);
      L.splice(to<0 ? L.length : to, 0, moved);
      homeSavePrefs(_homePrefs); renderHome();
    }
  }
  _homeDragId = null;
}
function homeDragEnd(){ _homeDragId = null; }

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
  if(typeof activeView!=='undefined') activeView = view;
  try{ fn(); }catch(e){}
  if(typeof railRender==='function') railRender();
  if(typeof railUpdateCrumb==='function') railUpdateCrumb();
}
function homeOpenFor(concern, entityId){
  const id = +entityId;
  if(concern==='retention-risk' || concern==='stale-review'){ if(typeof openIdCardModal==='function') openIdCardModal(id); return; }
  if(concern==='over-allocation' || concern==='bench'){ if(typeof railGo==='function') railGo(null,'plan'); return; }
  if(concern==='engagement-due'){ if(typeof railGo==='function') railGo(null,'engagement'); return; }
  if(concern==='gate-blocked' || concern==='gate-behind'){
    if(typeof railGo==='function') railGo(null,'gate');
    if(typeof gtOpenDetail==='function') gtOpenDetail(id);
    return;
  }
  if(concern==='charter-conflict'){ homeGoView('decision', function(){ if(typeof chtOpenDecision==='function') chtOpenDecision(id); }); return; }
  if(concern==='value-destroying' || concern==='low-unit-margin'){ homeGoView('charters', function(){ if(typeof openCharter==='function') openCharter(id); }); return; }
  if(concern==='dtc-gap'){ homeGoView('dtc', function(){ if(typeof openDtc==='function') openDtc(); if(typeof dtcSelectProject==='function') dtcSelectProject(id); }); return; }
  if(concern==='channel-concentration'){ homeGoView('channels', function(){ if(typeof openChannels==='function') openChannels(id); }); return; }
}
