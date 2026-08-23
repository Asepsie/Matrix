/* ►► SECTION: PIPELINE ◄◄ INSIGHTS › Pipeline — new-project intake & feasibility.
 *
 * A read-only decision AID for the front of the funnel: which CANDIDATE projects
 * (still in the early gate stages) should we green-light, given a fixed money
 * budget AND a fixed pool of engineers? It joins three engines the rest of the
 * app keeps apart:
 *   · value/return  — ecDataset() (NPV / risk-adj NPV / IRR / PI / investment)
 *   · people        — pipelineCapacity() (free FTE·months = bench headroom)
 *   · lifecycle     — the stage-gate (gtCurStageIdx / gtStageReadiness): a project
 *                     is a candidate while it sits BEFORE the commit gate.
 *
 * The one piece of genuinely new data is the per-candidate resource-demand
 * ESTIMATE on the charter (charter.demand: peakFte / fteMonths) — a candidate is
 * not staffed month-by-month yet, so its demand is forecast, editable inline here.
 *
 * Ranks candidates by bang-for-buck, then walks the ranked list accumulating
 * € and FTE·months; the first candidate that would breach EITHER ceiling is the
 * fund/defer cut line (a greedy frontier). Nothing here mutates state except the
 * inline demand inputs (→ saveState). Board controls (budget/sort/commit gate)
 * are session-only. Functions use the pipe / _pipe / PIPE_ name prefixes.
 */

// ── Session-only board state (never persisted) ──────────────────────────
var _pipeBudgetEur=null;     // € budget ceiling for candidate investment (null → no limit)
var _pipeCommitIdx=null;     // stage index a project must REACH to be committed (null → auto)
var _pipeSort='npvPerFte';   // ranking metric: 'npvPerFte' | 'npvPerEur' | 'npv'
var _pipeExpanded={};        // pid → true when its per-discipline demand editor is open

// The active methodology's stages (empty array if none configured).
function pipeStages(){ var m=(typeof gtModel==='function')?gtModel():null; return (m&&Array.isArray(m.stages))?m.stages:[]; }

// Stage index a project must reach to count as COMMITTED (out of the pipeline).
// Default = 2 (past OPEN + SELECT in the seed methodology), clamped to [1, nStages].
function pipeCommitIdx(){
  var n=pipeStages().length;
  var d=(_pipeCommitIdx==null)?2:_pipeCommitIdx;
  return Math.max(1,Math.min(d,Math.max(1,n)));
}

// A project is a CANDIDATE (awaiting a funding decision) while its lifecycle is
// 'proposed' or 'on_hold'. Funding it flips lifecycle to 'active' (→ it leaves the
// board and starts consuming capacity). The gate stage still drives go/no-go
// readiness, but no longer defines candidacy.
function pipeIsCandidate(p){
  var lc=projLifecycle(p);
  return lc==='proposed' || lc==='on_hold';
}

function _pipeProjById(pid){ return projects.find(function(p){return p.id===Number(pid);})||null; }

// The demand estimate off a project's charter (nulls preserved, negatives clamped).
// `byGroup` is the optional per-discipline (engGroup id → FTE·months) breakdown; only
// positive entries are kept, so an empty/absent map means "no per-discipline estimate".
function pipeDemand(p){
  var c=(p&&p.charter&&typeof p.charter==='object')?p.charter:makeCharter();
  var d=(c.demand&&typeof c.demand==='object')?c.demand:makeCharterDemand();
  function num(v){ if(v==null||v==='') return null; var n=+v; return (Number.isFinite(n)&&n>=0)?n:null; }
  var bg={}; var src=(d.byGroup&&typeof d.byGroup==='object')?d.byGroup:{};
  Object.keys(src).forEach(function(gid){ var n=+src[gid]; if(Number.isFinite(n)&&n>0) bg[gid]=n; });
  return { peakFte:num(d.peakFte), fteMonths:num(d.fteMonths), byGroup:bg };
}

// Build the ranked candidate rows, joining ecDataset() economics with demand.
function pipeRows(){
  var eco=(typeof ecDataset==='function')?ecDataset():[];
  var byId={}; eco.forEach(function(r){ byId[r.p.id]=r; });
  var stages=pipeStages();
  var rows=[];
  projects.forEach(function(p){
    if(!pipeIsCandidate(p)) return;
    var e=byId[p.id]||{};
    var dem=pipeDemand(p);
    var npv=(e.npv==null)?null:e.npv;
    var radj=(e.riskAdjNpv==null)?npv:e.riskAdjNpv;
    rows.push({
      p:p, name:p.name||t('Untitled'), color:safeColor(p.color||'var(--accent)'),
      npv:npv, riskAdjNpv:radj, pi:(e.pi==null?null:e.pi), irr:(e.irr==null?null:e.irr),
      invested:(e.invested==null?0:e.invested), rev:(e.chanRev||0),
      intent:(p.tacticalIntent||''), conflicts:(e.conflicts||0),
      alignMin:(e.alignMin==null?null:e.alignMin), rpnMax:(e.rpnMax||0),
      peakFte:dem.peakFte, fteMonths:dem.fteMonths, byGroup:dem.byGroup,
      stageIdx:stages.length?gtCurStageIdx(p,stages):0,
    });
  });
  rows.forEach(function(r){ r.score=pipeScore(r); });
  rows.sort(function(a,b){ return b.score-a.score; });
  return rows;
}

// Bang-for-buck score by the active metric. Candidates with no NPV sink last.
// `sort` defaults to the session metric so callers stay unchanged; passing it
// explicitly keeps the function global-free (unit-testable without _pipeSort).
export function pipeScore(r,sort){
  sort=sort||_pipeSort;
  var v=r.riskAdjNpv;
  if(v==null) return -Infinity;
  if(sort==='npv') return v;
  if(sort==='npvPerEur') return r.invested>0 ? v/r.invested : (v>0?Infinity:v);
  // default: NPV per FTE·month (people are the scarce constraint)
  return (r.fteMonths&&r.fteMonths>0) ? v/r.fteMonths : (v>0?-Infinity:v);
}

// Greedy frontier: walk ranked rows, fund while cumulative € AND FTE·months both
// stay under their ceilings; the first breach is the cut (rest deferred).
// `capByGroup` (optional: engGroup id → free FTE·months) adds a per-discipline ceiling —
// a row whose `byGroup` demand would push ANY one discipline over its free capacity is
// deferred even when the € and total-FTE ceilings still fit, and gets `r.groupBreach=[gid…]`.
// Omit it (or a row with no `byGroup`) to keep the plain total-only behaviour.
export function pipeFrontier(rows,budgetEur,freeCap,capByGroup){
  var cumInv=0, cumFte=0, cut=false, cumG={};
  rows.forEach(function(r){
    var inv=r.invested||0, fte=r.fteMonths||0;
    var bg=(r.byGroup&&typeof r.byGroup==='object')?r.byGroup:null;
    var tentInv=cumInv+inv, tentFte=cumFte+fte;
    var okBudget=(budgetEur==null)||(tentInv<=budgetEur);
    var okCap=(freeCap==null||freeCap<=0)?true:(tentFte<=freeCap);
    // per-discipline ceiling (only when both a byGroup demand and a group-free map exist)
    var okGrp=true, breach=null;
    if(bg && capByGroup){
      Object.keys(bg).forEach(function(gid){
        var need=(+bg[gid])||0; if(need<=0) return;
        var freeG=capByGroup[gid]; if(freeG==null) return;   // unknown discipline → no ceiling
        if(((cumG[gid]||0)+need) > freeG){ okGrp=false; (breach||(breach=[])).push(gid); }
      });
    }
    if(!cut && okBudget && okCap && okGrp){
      r.funded=true; cumInv=tentInv; cumFte=tentFte;
      if(bg) Object.keys(bg).forEach(function(gid){ cumG[gid]=(cumG[gid]||0)+((+bg[gid])||0); });
    } else {
      r.funded=false; cut=true;
      if(breach) r.groupBreach=breach;
    }
    r.cumInv=cumInv; r.cumFte=cumFte;
  });
  return { cumInv:cumInv, cumFte:cumFte, cumByGroup:cumG };
}

/* ── Inline demand editors (the only state mutation) ─────────────────── */
function pipeSetDemand(pid,field,val){
  var p=_pipeProjById(pid); if(!p) return;
  if(!p.charter||typeof p.charter!=='object') p.charter=makeCharter();
  if(!p.charter.demand||typeof p.charter.demand!=='object') p.charter.demand=makeCharterDemand();
  var n=(val===''||val==null)?null:Math.max(0,+val);
  if(n!=null&&!Number.isFinite(n)) n=null;
  p.charter.demand[field]=n;
  saveState();
  renderPipelineTab();
}
// Per-discipline demand input (engGroup id → FTE·months). Empty/0 clears the entry.
function pipeSetGroupDemand(pid,gid,val){
  var p=_pipeProjById(pid); if(!p) return;
  if(!p.charter||typeof p.charter!=='object') p.charter=makeCharter();
  if(!p.charter.demand||typeof p.charter.demand!=='object') p.charter.demand=makeCharterDemand();
  if(!p.charter.demand.byGroup||typeof p.charter.demand.byGroup!=='object') p.charter.demand.byGroup={};
  var n=(val===''||val==null)?null:Math.max(0,+val);
  if(n==null||!Number.isFinite(n)||n===0) delete p.charter.demand.byGroup[gid];
  else p.charter.demand.byGroup[gid]=n;
  saveState();
  renderPipelineTab();
}
function pipeToggleExpand(pid){ if(_pipeExpanded[pid]) delete _pipeExpanded[pid]; else _pipeExpanded[pid]=true; renderPipelineTab(); }
// Encode an engGroup id for a single-quoted JS-string arg inside a double-quoted HTML
// attribute (JS-escape backslash/quote first, then HTML-escape). JSON.stringify would
// emit double quotes that terminate the onchange="" attribute — so never use it here.
function _pipeGidArg(gid){ return escH(String(gid).replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }
function pipeSetBudget(v){ var n=(v===''||v==null)?null:+v; _pipeBudgetEur=(n!=null&&Number.isFinite(n)&&n>=0)?n*1e6:null; renderPipelineTab(); }
function pipeSetSort(v){ _pipeSort=String(v||'npvPerFte'); renderPipelineTab(); }
function pipeSetCommit(v){ _pipeCommitIdx=Number(v); renderPipelineTab(); }

// Open a candidate's charter (deep-link, closes the res overlay like other openers).
function pipeOpenCharter(pid){ var p=_pipeProjById(pid); if(p&&typeof openCharter==='function') openCharter(p.id); }

/* ── Funding decisions — the persisted fund/hold/kill actions ─────────── */
// Record a lifecycle transition on a candidate (Fund → active, Hold → on_hold,
// Kill → cancelled). `ask` prompts for an optional reason (logged in the decision
// history). A cancelled prompt aborts the whole action.
function pipeDecide(pid,next,ask){
  var p=_pipeProjById(pid); if(!p) return;
  var reason=null;
  if(ask){ reason=prompt(t('Reason (optional):'),''); if(reason===null) return; }
  if(projSetLifecycle(p,next,reason)){ saveState(); renderPipelineTab(); }
}
// Create a fresh candidate (lifecycle 'proposed') from a name prompt.
function pipeAddCandidate(){
  var name=(prompt(t('New candidate project name:'),'')||'').trim(); if(!name) return;
  var p=makeProject({ name:name, id:nextId++, lifecycle:'proposed', costSource:'manual', planCost:null });
  projects.push(p);
  saveState(); renderPipelineTab();
}
// Bulk-activate every current candidate (proposed/on_hold) in one step — the antidote to
// the item-2 migration funding a large existing portfolio one row at a time. Confirm first;
// each transition is logged via projSetLifecycle so the decision history stays complete.
function pipeFundAll(){
  var cands=projects.filter(pipeIsCandidate);
  if(!cands.length){ alert(t('No candidates to fund.')); return; }
  if(!confirm(t('Fund all {n} candidate(s)? Each is set to Active and starts consuming capacity.',{n:cands.length}))) return;
  var reason=t('Bulk-funded from Pipeline board');
  var changed=0;
  cands.forEach(function(p){ if(projSetLifecycle(p,'active',reason)) changed++; });
  if(changed) saveState();
  renderPipelineTab();
}

/* ── Render ──────────────────────────────────────────────────────────── */
function renderPipelineTab(){
  var body=G('res-body'); if(!body) return;
  var months=getMonthRange();
  var cap=(typeof pipelineCapacity==='function')?pipelineCapacity(months):{free:0,supply:0,people:0};
  var stages=pipeStages();
  var rows=pipeRows();

  var h='<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';
  h+='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);letter-spacing:.06em">'+t('⛛ PIPELINE — INTAKE & FEASIBILITY')+'</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
    +(months.length?t('capacity over {n} month(s) · FROM/TO period',{n:months.length}):t('set a FROM/TO period for capacity'))
    +'</span>';
  var candCount=projects.filter(pipeIsCandidate).length;
  if(candCount) h+='<button onclick="pipeFundAll()" title="'+escH(t('Set every candidate to Active in one step'))+'" style="margin-left:auto;background:var(--bg);color:var(--accent);border:1px solid var(--accent);border-radius:6px;font-size:11px;font-weight:700;padding:6px 12px;cursor:pointer">'+t('⚡ Fund all ({n})',{n:candCount})+'</button>';
  h+='<button onclick="pipeAddCandidate()" style="'+(candCount?'':'margin-left:auto;')+'background:var(--accent);color:#0f0f11;border:none;border-radius:6px;font-size:11px;font-weight:700;padding:6px 12px;cursor:pointer">'+t('＋ Add candidate')+'</button>'
    +'</div>';

  if(!projects.length){ body.innerHTML=h+pfEmpty(t('No projects yet — ＋ Add candidate above, or add projects on the matrix and set their lifecycle to Proposed.'))+'</div>'; return; }

  // Portfolio disposition — where every project sits, candidates or not.
  h+=pipeLifecycleBreakdown();

  h+=pipeControls(stages);

  if(!rows.length){ body.innerHTML=h+pfEmpty(t('No candidates awaiting a decision — no project is Proposed or On Hold. ＋ Add candidate above, or set a project’s lifecycle to Proposed in its edit panel to evaluate it here.'))+'</div>'; return; }

  var capG={}; if(cap.byGroup) Object.keys(cap.byGroup).forEach(function(k){ capG[k]=cap.byGroup[k].free; });
  var fr=pipeFrontier(rows,_pipeBudgetEur,cap.free,capG);
  h+=pipeScorecard(rows,cap,fr);
  h+=pfSection(t('CANDIDATE RANKING'),
      t('Candidates (Proposed or On Hold), ranked by the metric above. Peak FTE and effort (FTE·months) are your pre-staffing ESTIMATE — edit inline; everything else comes from the charter financials. Rows above the cut line fit the budget and free-capacity ceilings. Use Fund / Hold / Kill to record the decision.'),
      pipeTable(rows,cap));
  h+=pfSection(t('EFFICIENT FRONTIER — money vs people'),
      t('Cumulative investment (€, teal) and cumulative effort (FTE·months, lime) as you fund candidates down the ranking, each shown against its ceiling (100%). Whichever curve hits 100% first is the binding constraint; the dashed line is the fund/defer cut.'),
      pipeFrontierSVG(rows,cap,_pipeBudgetEur));
  if(stages.length){
    h+=pfSection(t('GO / NO-GO — commit-gate readiness'),
      t('Weighted readiness of each candidate against the commit gate’s criteria (from Gate & PI). A blocked mandatory criterion means the investment decision cannot pass yet, however attractive the return.'),
      pipeGoNoGo(rows,stages));
  }
  h+='</div>';
  body.innerHTML=h;
}

// Controls: budget, ranking metric, commit-gate selector.
function pipeControls(stages){
  var budgetM=(_pipeBudgetEur==null)?'':(_pipeBudgetEur/1e6);
  var sortOpt=function(v,lbl){ return '<option value="'+v+'"'+(_pipeSort===v?' selected':'')+'>'+escH(lbl)+'</option>'; };
  var commitOpts='';
  var n=stages.length, ci=pipeCommitIdx();
  for(var i=1;i<=Math.max(1,n);i++){
    var nm=(stages[i-1]?stages[i-1].name:('#'+i));
    commitOpts+='<option value="'+i+'"'+(i===ci?' selected':'')+'>'+escH(t('committed once past {s}',{s:nm}))+'</option>';
  }
  var box='background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;padding:5px 7px';
  var lab='font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px';
  var h='<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">';
  h+='<div style="display:flex;flex-direction:column"><span style="'+lab+'">'+t('Budget (M€)')+'</span>'
    +'<input type="number" min="0" step="0.1" value="'+budgetM+'" placeholder="'+t('no limit')+'" onchange="pipeSetBudget(this.value)" style="'+box+';width:120px"></div>';
  h+='<div style="display:flex;flex-direction:column"><span style="'+lab+'">'+t('Rank by')+'</span>'
    +'<select onchange="pipeSetSort(this.value)" style="'+box+'">'
    +sortOpt('npvPerFte',t('NPV per FTE·month'))+sortOpt('npvPerEur',t('NPV per € invested'))+sortOpt('npv',t('Risk-adj NPV'))
    +'</select></div>';
  if(stages.length){
    h+='<div style="display:flex;flex-direction:column"><span style="'+lab+'">'+t('Commit gate')+'</span>'
      +'<select onchange="pipeSetCommit(this.value)" style="'+box+'">'+commitOpts+'</select></div>';
  }
  h+='</div>';
  return h;
}

// Portfolio disposition strip — a chip per lifecycle state present, with counts
// and a total-investment read. The single place to see fund/hold/kill/EoL spread.
function pipeLifecycleBreakdown(){
  var by={}; projects.forEach(function(p){ var id=projLifecycle(p); (by[id]||(by[id]={n:0})).n++; });
  var chips=PROJECT_LIFECYCLE.filter(function(s){return by[s.id];}).map(function(s){
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:4px 11px;font-size:11px">'
      +'<span style="width:8px;height:8px;border-radius:2px;background:'+safeColor(s.color)+'"></span>'
      +escH(t(s.label))+' <b style="font-family:IBM Plex Mono,monospace">'+by[s.id].n+'</b></span>';
  }).join('');
  return '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-right:2px">'+t('PORTFOLIO DISPOSITION')+'</span>'+chips+'</div>';
}

function pipeScorecard(rows,cap,fr){
  var sumNpv=rows.reduce(function(s,r){return s+(r.riskAdjNpv||0);},0);
  var sumInv=rows.reduce(function(s,r){return s+(r.invested||0);},0);
  var sumFte=rows.reduce(function(s,r){return s+(r.fteMonths||0);},0);
  var funded=rows.filter(function(r){return r.funded;});
  var fundedNpv=funded.reduce(function(s,r){return s+(r.riskAdjNpv||0);},0);
  var noEst=rows.filter(function(r){return r.fteMonths==null;}).length;
  var capColor=(cap.free>0 && sumFte>cap.free)?'var(--danger)':'var(--accent)';
  var h='<div style="display:flex;gap:10px;flex-wrap:wrap">';
  h+=pfKpi(rows.length, t('CANDIDATES'), t('{n} non-candidate excluded',{n:projects.length-rows.length}));
  h+=pfKpi(pfEur(sumNpv), t('Σ RISK-ADJ NPV'), t('all candidates'), sumNpv>=0?'var(--accent2)':'var(--danger)');
  h+=pfKpi(pfEur(sumInv), t('Σ INVESTMENT'), _pipeBudgetEur==null?t('no budget set'):t('budget {b}',{b:pfEur(_pipeBudgetEur)}), (_pipeBudgetEur!=null&&sumInv>_pipeBudgetEur)?'var(--danger)':'var(--text)');
  h+=pfKpi(sumFte.toFixed(0)+' ', t('Σ FTE·MONTHS'), t('free capacity {f}',{f:cap.free.toFixed(0)}), capColor);
  h+=pfKpi(funded.length, t('FUNDABLE NOW'), t('{v} of Σ NPV captured',{v:pfEur(fundedNpv)}), 'var(--accent)');
  if(noEst) h+=pfKpi(noEst, t('NO ESTIMATE'), t('add peak / FTE·months'), 'var(--warn)');
  h+='</div>';
  return h;
}

function pipeTable(rows,cap){
  var thStyle='text-align:right;padding:7px 8px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap';
  var thL=thStyle+';text-align:left';
  var h='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';
  h+='<thead><tr>'
    +'<th style="'+thL+'">'+t('#')+'</th>'
    +'<th style="'+thL+'">'+t('Candidate')+'</th>'
    +'<th style="'+thStyle+'">'+t('Risk-adj NPV')+'</th>'
    +'<th style="'+thStyle+'">'+t('IRR')+'</th>'
    +'<th style="'+thStyle+'">'+t('PI')+'</th>'
    +'<th style="'+thStyle+'">'+t('Investment')+'</th>'
    +'<th style="'+thStyle+'">'+t('Peak FTE')+'</th>'
    +'<th style="'+thStyle+'">'+t('FTE·months')+'</th>'
    +'<th style="'+thStyle+'">'+t('NPV / FTE·mo')+'</th>'
    +'<th style="'+thStyle+'">'+t('Fit')+'</th>'
    +'<th style="'+thStyle+'">'+t('Decision')+'</th>'
    +'</tr></thead><tbody>';
  var cutShown=false;
  var inStyle='width:58px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:3px 5px;text-align:right';
  rows.forEach(function(r,i){
    // Draw the fund/defer divider before the first deferred row.
    if(!r.funded && !cutShown){
      cutShown=true;
      h+='<tr><td colspan="11" style="padding:3px 8px;border-top:2px dashed var(--warn)">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--warn);letter-spacing:.06em">'+t('— CUT LINE · below = defer to next cycle —')+'</span></td></tr>';
    }
    var pid=r.p.id;
    var npvColor=(r.riskAdjNpv==null)?'var(--muted)':(r.riskAdjNpv>=0?'var(--accent2)':'var(--danger)');
    var perFte=(r.riskAdjNpv!=null&&r.fteMonths&&r.fteMonths>0)?pfEur(r.riskAdjNpv/r.fteMonths):'—';
    var fit=pipeFitBadge(r,cap);
    var lc=projLifecycle(r.p);
    var rec=r.funded
      ? '<span style="color:var(--accent);font-weight:700" title="'+escH(t('recommended: fits budget & capacity'))+'">'+t('FUND')+'</span>'
      : '<span style="color:var(--muted)" title="'+escH(t('recommended: defer — beyond a ceiling or negative return'))+'">'+t('Defer')+'</span>';
    var btn='display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:2px 6px;margin:1px 0 0 3px;cursor:pointer;border:1px solid';
    var acts='<div style="margin-top:2px;white-space:nowrap">'
      +'<a onclick="pipeDecide('+pid+',\'active\')" title="'+escH(t('Fund — mark Active, starts consuming capacity'))+'" style="'+btn+' var(--accent);color:var(--accent)">'+t('Fund')+'</a>'
      +(lc==='on_hold'?'':'<a onclick="pipeDecide('+pid+',\'on_hold\',true)" title="'+escH(t('Hold — pause, keep in pipeline'))+'" style="'+btn+' var(--warn);color:var(--warn)">'+t('Hold')+'</a>')
      +'<a onclick="pipeDecide('+pid+',\'cancelled\',true)" title="'+escH(t('Kill — cancel this candidate'))+'" style="'+btn+' var(--danger);color:var(--danger)">'+t('Kill')+'</a>'
      +'</div>';
    var decide=rec+(lc==='on_hold'?'<div style="font-size:9px;color:var(--warn);font-family:IBM Plex Mono,monospace">'+t('ON HOLD')+'</div>':'')+acts;
    var td='padding:6px 8px;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap';
    var tdL='padding:6px 8px;border-bottom:1px solid var(--border);text-align:left';
    var rowBg=r.funded?'':'opacity:.62';
    h+='<tr style="'+rowBg+'">'
      +'<td style="'+tdL+';color:var(--muted);font-family:IBM Plex Mono,monospace">'+(i+1)+'</td>'
      +'<td style="'+tdL+'"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:'+r.color+';margin-right:7px;vertical-align:middle"></span>'
        +'<a onclick="pipeOpenCharter('+pid+')" style="cursor:pointer;color:var(--text);text-decoration:none;border-bottom:1px dotted var(--muted)">'+escH(r.name)+'</a></td>'
      +'<td style="'+td+';color:'+npvColor+';font-family:IBM Plex Mono,monospace">'+(r.riskAdjNpv==null?'—':pfEur(r.riskAdjNpv))+'</td>'
      +'<td style="'+td+';font-family:IBM Plex Mono,monospace">'+(r.irr==null?'—':fmtPct(r.irr*100))+'</td>'
      +'<td style="'+td+';font-family:IBM Plex Mono,monospace">'+(r.pi==null?'—':(+r.pi).toFixed(2))+'</td>'
      +'<td style="'+td+';font-family:IBM Plex Mono,monospace">'+(r.invested?pfEur(r.invested):'—')+'</td>'
      +'<td style="'+td+'"><input type="number" min="0" step="0.5" value="'+(r.peakFte==null?'':r.peakFte)+'" onchange="pipeSetDemand('+pid+',\'peakFte\',this.value)" style="'+inStyle+'"></td>'
      +'<td style="'+td+'"><input type="number" min="0" step="1" value="'+(r.fteMonths==null?'':r.fteMonths)+'" onchange="pipeSetDemand('+pid+',\'fteMonths\',this.value)" style="'+inStyle+'">'+pipeGroupToggle(r)+'</td>'
      +'<td style="'+td+';font-family:IBM Plex Mono,monospace;color:'+npvColor+'">'+perFte+'</td>'
      +'<td style="'+td+'">'+fit+'</td>'
      +'<td style="'+td+'">'+decide+'</td>'
      +'</tr>';
    if(_pipeExpanded[pid] && engGroups.length) h+=pipeGroupRow(r,cap);
  });
  h+='</tbody></table></div>';
  return h;
}

// Strategic-fit badge from tactical intent + charter conflicts + discipline breach.
function pipeFitBadge(r,cap){
  var out='';
  if(r.intent){
    var ic={Defend:'🛡️',Grow:'📈',Adapt:'🔄',Diversify:'🧭'}[r.intent]||'•';
    out+='<span title="'+escH(t('Tactical intent'))+'" style="font-size:11px">'+ic+'</span> ';
  }
  if(r.conflicts>0) out+='<span title="'+escH(t('unresolved trade-off conflicts'))+'" style="color:var(--danger);font-family:IBM Plex Mono,monospace;font-size:10px">⚠'+r.conflicts+'</span>';
  else if(r.alignMin!=null&&r.alignMin>0) out+='<span title="'+escH(t('lowest function alignment'))+'" style="color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:10px">'+r.alignMin+'/10</span>';
  // Per-discipline capacity breach — a function over its free FTE·months even if the total fits.
  if(r.groupBreach && r.groupBreach.length){
    var bg=(cap&&cap.byGroup)||{};
    var names=r.groupBreach.map(function(gid){ return (bg[gid]&&bg[gid].name)||gid; });
    out+=' <span title="'+escH(t('Over free capacity in: {g}',{g:names.join(', ')}))+'" style="color:var(--warn);font-family:IBM Plex Mono,monospace;font-size:10px">⛔'+names.length+'</span>';
  }
  return out||'<span style="color:var(--dim)">—</span>';
}

// The "▾ by function" toggle shown under the FTE·months input (only when groups exist).
function pipeGroupToggle(r){
  if(!engGroups.length) return '';
  var pid=r.p.id, open=!!_pipeExpanded[pid];
  var n=r.byGroup?Object.keys(r.byGroup).length:0;
  var lbl=(open?'▾ ':'▸ ')+t('by function')+(n?(' ('+n+')'):'');
  return '<div style="margin-top:3px"><a onclick="pipeToggleExpand('+pid+')" style="cursor:pointer;font-size:9px;color:var(--muted);text-decoration:none;border-bottom:1px dotted var(--dim)" title="'+escH(t('Split this candidate’s effort across disciplines'))+'">'+lbl+'</a></div>';
}

// The expanded detail row: one small FTE·months input per engGroup, each with a
// free-capacity hint. Sum vs the headline total is shown so mismatches are visible.
function pipeGroupRow(r,cap){
  var pid=r.p.id, bg=r.byGroup||{}, capG=(cap&&cap.byGroup)||{};
  var inS='width:52px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:10px;padding:2px 4px;text-align:right';
  var sum=0; Object.keys(bg).forEach(function(g){ sum+=(+bg[g])||0; });
  var cells=engGroups.map(function(g){
    var val=bg[g.id]==null?'':bg[g.id];
    var freeG=capG[g.id]?capG[g.id].free:null;
    var over=(freeG!=null && (+bg[g.id]||0)>freeG);
    var hint=(freeG!=null)?(t('free')+' '+freeG.toFixed(0)):t('n/a');
    return '<div style="display:flex;flex-direction:column;gap:2px;min-width:74px">'
      +'<span style="font-size:9px;color:'+safeColor(g.color)+';font-family:IBM Plex Mono,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px" title="'+escH(g.name)+'">'+escH(g.name)+'</span>'
      +'<input type="number" min="0" step="1" value="'+val+'" onchange="pipeSetGroupDemand('+pid+',\''+_pipeGidArg(g.id)+'\',this.value)" style="'+inS+(over?';border-color:var(--warn);color:var(--warn)':'')+'">'
      +'<span style="font-size:8px;color:'+(over?'var(--warn)':'var(--dim)')+';font-family:IBM Plex Mono,monospace">'+escH(hint)+'</span></div>';
  }).join('');
  var mism=(r.fteMonths!=null && sum>0 && Math.abs(sum-r.fteMonths)>0.5);
  return '<tr><td colspan="11" style="padding:8px 10px 10px 34px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)">'
    +'<div style="display:flex;gap:6px;align-items:baseline;margin-bottom:6px">'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">'+t('DEMAND BY DISCIPLINE (FTE·months)')+'</span>'
      +'<span style="font-size:9px;color:'+(mism?'var(--warn)':'var(--dim)')+';font-family:IBM Plex Mono,monospace">'+t('Σ {s}',{s:sum.toFixed(0)})+(mism?(' ≠ '+t('total {t}',{t:(r.fteMonths==null?'—':r.fteMonths)})):'')+'</span>'
    +'</div>'
    +'<div style="display:flex;gap:12px;flex-wrap:wrap">'+cells+'</div></td></tr>';
}

// Two cumulative curves (€ and FTE·months), each normalised to its ceiling.
function pipeFrontierSVG(rows,cap,budgetEur){
  var n=rows.length;
  if(!n) return pfEmpty(t('No candidates to plot.'));
  var totInv=rows.reduce(function(s,r){return s+(r.invested||0);},0);
  var budgetRef=(budgetEur!=null&&budgetEur>0)?budgetEur:(totInv>0?totInv:1);   // € normaliser
  var capRef=(cap.free>0)?cap.free:0;                                            // FTE normaliser
  var W=760,H=200,pL=44,pR=90,pT=16,pB=30, iW=W-pL-pR, iH=H-pT-pB;
  // cumulative (normalised) series
  var cInv=0,cFte=0, ptsInv=[], ptsFte=[], maxY=1.2, cutIdx=-1;
  rows.forEach(function(r,i){
    cInv+=(r.invested||0); cFte+=(r.fteMonths||0);
    var yi=cInv/budgetRef, yf=capRef>0?cFte/capRef:0;
    ptsInv.push(yi); ptsFte.push(yf);
    maxY=Math.max(maxY,yi,yf);
    if(r.funded) cutIdx=i;
  });
  function X(i){ return pL+(n<=1?iW/2:iW*i/(n-1)); }
  function Y(v){ return pT+iH-(v/maxY)*iH; }
  var svg='';
  // ceiling line at 100%
  var yC=Y(1);
  svg+='<line x1="'+pL+'" y1="'+yC.toFixed(1)+'" x2="'+(W-pR)+'" y2="'+yC.toFixed(1)+'" stroke="var(--warn)" stroke-width="1" stroke-dasharray="5 3" opacity="0.8"/>';
  svg+='<text x="'+(W-pR+6)+'" y="'+(yC+3).toFixed(1)+'" font-size="9" fill="var(--warn)" font-family="IBM Plex Mono,monospace">'+t('ceiling')+'</text>';
  // grid baseline
  svg+='<line x1="'+pL+'" y1="'+(pT+iH)+'" x2="'+(W-pR)+'" y2="'+(pT+iH)+'" stroke="var(--border)" stroke-width="1"/>';
  // cut vertical
  if(cutIdx>=0 && cutIdx<n-1){
    var xc=(X(cutIdx)+X(cutIdx+1))/2;
    svg+='<line x1="'+xc.toFixed(1)+'" y1="'+pT+'" x2="'+xc.toFixed(1)+'" y2="'+(pT+iH)+'" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>';
    svg+='<text x="'+(xc+4).toFixed(1)+'" y="'+(pT+10)+'" font-size="9" fill="var(--muted)" font-family="IBM Plex Mono,monospace">'+t('cut')+'</text>';
  }
  function path(pts,color){
    var d=pts.map(function(v,i){ return (i?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1); }).join(' ');
    return '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>';
  }
  if(capRef>0) svg+=path(ptsFte,'var(--accent)');
  svg+=path(ptsInv,'var(--accent2)');
  // end dots
  svg+='<circle cx="'+X(n-1).toFixed(1)+'" cy="'+Y(ptsInv[n-1]).toFixed(1)+'" r="3" fill="var(--accent2)"/>';
  if(capRef>0) svg+='<circle cx="'+X(n-1).toFixed(1)+'" cy="'+Y(ptsFte[n-1]).toFixed(1)+'" r="3" fill="var(--accent)"/>';
  // y labels 0 / 100%
  svg+='<text x="'+(pL-6)+'" y="'+(yC+3).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--dim)" font-family="IBM Plex Mono,monospace">100%</text>';
  svg+='<text x="'+(pL-6)+'" y="'+(pT+iH+3)+'" text-anchor="end" font-size="9" fill="var(--dim)" font-family="IBM Plex Mono,monospace">0</text>';
  var legend='<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;font-family:IBM Plex Mono,monospace;color:var(--muted)">'
    +'<span><span style="display:inline-block;width:14px;height:3px;background:var(--accent2);vertical-align:middle;margin-right:5px"></span>'+t('cumulative € invested')+'</span>'
    +'<span><span style="display:inline-block;width:14px;height:3px;background:var(--accent);vertical-align:middle;margin-right:5px"></span>'+t('cumulative FTE·months')+'</span>'
    +(capRef<=0?'<span style="color:var(--warn)">'+t('· no free capacity in this period')+'</span>':'')
    +'</div>';
  return '<div style="overflow-x:auto"><svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="'+t('Cumulative investment and effort against their ceilings')+'">'+svg+'</svg></div>'+legend;
}

// Commit-gate readiness per candidate (go / no-go).
function pipeGoNoGo(rows,stages){
  var gateStage=stages[pipeCommitIdx()-1]; if(!gateStage) return pfEmpty(t('No commit gate configured.'));
  var signals=(typeof gtBuildSignalMap==='function')?gtBuildSignalMap():{};
  var h='<div style="display:flex;flex-direction:column;gap:8px">';
  h+='<div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('Gate: {g}',{g:escH(gateStage.name)})+'</div>';
  rows.forEach(function(r){
    var gp=(r.p.gatePlan&&typeof r.p.gatePlan==='object')?r.p.gatePlan:makeGatePlan();
    var rd=(typeof gtStageReadiness==='function')?gtStageReadiness(gateStage,gp,signals[r.p.id]||{}):{pct:0,blocked:false};
    var col=rd.blocked?'var(--danger)':(rd.pct>=100?'var(--accent)':'var(--warn)');
    var status=rd.blocked?t('NO-GO'):(rd.pct>=100?t('GO'):t('{p}% ready',{p:rd.pct}));
    h+='<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="width:170px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escH(r.name)+'">'
        +'<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+r.color+';margin-right:6px"></span>'+escH(r.name)+'</div>'
      +'<div style="flex:1;height:12px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+Math.max(0,Math.min(100,rd.pct))+'%;background:'+col+'"></div></div>'
      +'<div style="width:90px;text-align:right;font-family:IBM Plex Mono,monospace;font-size:10px;color:'+col+'">'+status+'</div></div>';
  });
  h+='</div>';
  return h;
}
