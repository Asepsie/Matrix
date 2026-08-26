/* ►► SECTION: DASHBOARD ◄◄ Resource balancer: capacity vitals, supply/demand, over/under-allocation, replacements
 *
 * Functions defined in this file:
 *   _dashMonths        — returns the full month range for dashboard calculations
 *   _buildCostMaps     — computes project cost maps with optional engineer/project filters
 *   renderResDashboard — renders the Resource Balancer: capacity supply/demand, availability, utilisation, over-allocation & rebalancing
 *   setEngDashGroup    — sets the engineer utilisation group-by mode and re-renders
 *   exportDashboardPDF — switches to the dashboard tab (if needed) then triggers PDF export
 *   _doExportDashboardPDF — builds and opens the print-ready dashboard HTML in a new window
 *   transferPlanCosts  — transfers resource plan costs to each project's planCost field
 *   showDashReplacements — shows/hides the replacement-candidate panel for an overloaded engineer
 *   toggleDashSector   — toggles a collapsible cost-by-project sector row
 *   openAddResourceModal — opens the add-resource modal pre-filled from a source engineer
 *   confirmAddResource — validates the modal, creates the engineer, navigates to roster
 */

// Returns the full month range for dashboard calculations.
export function _dashMonths(){ return getMonthRange(); }

/* _dashCur() and _buildEngUtil() are defined in helpers.js (bundled earlier) — do not redeclare */

// Compute cost maps. Memoised by month range + the active filter sets.
export function _buildCostMaps(months,filterEng,filterProj){
  var fk=(filterEng&&filterEng.size?[...filterEng].sort().join('~'):'*')+'#'+(filterProj&&filterProj.size?[...filterProj].sort().join('~'):'*');
  return _memo('costMaps:'+_monthsKey(months)+':'+fk, function(){ return _computeCostMaps(months,filterEng,filterProj); });
}
function _computeCostMaps(months,filterEng,filterProj){
  var engById=_engByIdMap(), projById=_projByIdMap();
  var projCost={},totalCost=0,unassignedCost=0;
  var filtered=allocRows.filter(function(r){
    if(filterEng&&filterEng.size){var e=engById.get(r.engId);if(!e||!filterEng.has(e.name))return false;}
    if(filterProj&&filterProj.size){var p=projById.get(r.projectId);if(!p||!filterProj.has(p.name))return false;}
    return true;
  });
  var capSet=_projCapacitySet();
  filtered.forEach(function(r){
    var eng=engById.get(r.engId);if(!eng||!_costCounts(eng))return;
    if(r.projectId!=null && !capSet.has(r.projectId))return;   // suppressed-lifecycle project: no cost
    var cost=months.reduce(function(s,m){return s+(r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);},0);
    if(r.projectId){projCost[r.projectId]=(projCost[r.projectId]||0)+cost;}
    else{unassignedCost+=cost;}
    totalCost+=cost;
  });
  return {projCost:projCost,totalCost:totalCost,unassignedCost:unassignedCost,filteredRows:filtered};
}

/* ── Capacity supply/free — the one source of truth for "how much room" ──
   A pure, memoised roll-up of the same supply math the Resource Balancer hero
   computes inline (counted engineers, minus months an engineer is fully
   medical/resigned, minus the FTE already engaged). Extracted so the Pipeline
   board can weigh candidate demand against real free capacity WITHOUT the
   dashboard render. Returns FTE·months over the given range, plus a per-group
   breakdown. `free` = idle FTE·months = the bench headroom new projects can draw. */
export function pipelineCapacity(months){
  months=months||[];
  return _memo('pipeCap:'+_monthsKey(months), function(){
    var engUtil=_buildEngUtil(months);
    var counted=Object.values(engUtil).filter(function(eu){return _costCounts(eu.eng);});
    function inactive(eu,m){ var s=eu.monthStatus&&eu.monthStatus[m]; return (s==='m'||s==='r')&&(eu.monthAllocs[m]||0)===0; }
    var supply=0, engaged=0, demand=0, byGroup={};
    counted.forEach(function(eu){
      var key=eu.grp||t('Ungrouped'), color=eu.grpColor||'var(--muted)';
      var g=byGroup[eu.grpId||key]||(byGroup[eu.grpId||key]={name:key,color:color,supply:0,engaged:0,demand:0,people:0});
      g.people++;
      months.forEach(function(m){
        if(inactive(eu,m))return;
        supply+=1; g.supply+=1;
        var a=eu.monthAllocs[m]||0;
        engaged+=Math.min(a,1); g.engaged+=Math.min(a,1);
        demand+=a; g.demand+=a;
      });
    });
    Object.keys(byGroup).forEach(function(k){ var g=byGroup[k]; g.free=Math.max(0,g.supply-g.engaged); });
    return {
      months:months.length, people:counted.length,
      supply:supply, engaged:engaged, demand:demand,
      free:Math.max(0,supply-engaged),        // idle FTE·months = bench headroom
      over:Math.max(0,demand-engaged),
      byGroup:byGroup,
    };
  });
}

/* Shared mini bar-sparkline used by cost-by-project, project-detail and the
   per-engineer utilisation cards (replaces four near-identical inline loops).
   opts: {w,h,gap,color,curIdx,curColor,opacity,round,min,minBar}. */
export function _dbSparkBars(values, opts){
  opts=opts||{};
  var w=opts.w||110, h=opts.h||16, gap=opts.gap==null?1:opts.gap;
  var n=values.length||1, bw=Math.max(1,Math.floor(w/n)-gap);
  var max=Math.max.apply(null, values.concat([opts.min||1]));
  var color=opts.color||'var(--accent2)', curColor=opts.curColor||'var(--accent)';
  var round=opts.round==null?1:opts.round, op=opts.opacity==null?0.7:opts.opacity;
  var out='';
  values.forEach(function(v,i){
    var bh=Math.max(opts.minBar||0, Math.round(v/max*h)), x=i*(bw+gap);
    // over-threshold bars (e.g. >1 FTE) win over the current-month highlight
    var c=(opts.overMax!=null&&v>opts.overMax)?(opts.overColor||'var(--danger)'):(opts.curIdx===i?curColor:color);
    out+='<rect x="'+x+'" y="'+(h-bh)+'" width="'+bw+'" height="'+bh+'" rx="'+round+'" fill="'+c+'" opacity="'+op+'"/>';
  });
  return '<svg width="'+w+'" height="'+h+'" style="display:block">'+out+'</svg>';
}

// Renders the Resource Balancer: capacity supply/demand vitals, demand-vs-capacity chart, capacity by function, availability, utilisation grid and over-allocation with proactive rebalancing suggestions.
// ── Resource Balancer — PROJECT-CENTRIC (team · time · cost, absolute) ──
// Reworked from a portfolio supply/demand dashboard into a per-project view: pick a
// project, see exactly who works on it, how much time each person spends month by month,
// and what it costs. All numbers are ABSOLUTE — no share-of-portfolio, no relative %.
// Computed straight off allocRows so it is truthful regardless of lifecycle suppression.
let _balProjId = null;

export function renderResDashboard(){
  var body=G('res-body'); if(!body) return;
  if(typeof projects==='undefined' || !projects.length){
    body.innerHTML=_balEmpty(t('No projects yet — add projects on the matrix.'));
    return;
  }
  var months=getMonthRange();
  if(_balProjId==null || !projects.some(function(p){return p.id===_balProjId;})) _balProjId=_balDefaultProject();
  var proj=projects.find(function(p){return p.id===_balProjId;});
  var h='';

  // ── Toolbar: project picker + lifecycle chip ──
  h+='<div class="bal-toolbar"><span class="bal-tb-label">'+escH(t('PROJECT'))+'</span>'
    +'<select class="bal-pick" onchange="balSetProject(+this.value)">';
  projects.slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).forEach(function(p){
    h+='<option value="'+p.id+'"'+(p.id===_balProjId?' selected':'')+'>'+escH(p.name||t('Untitled'))+'</option>';
  });
  h+='</select>';
  var lc=(typeof projLifecycleDef==='function')?projLifecycleDef(proj):null;
  if(lc){ var lcc=safeColor(lc.color,'var(--muted)');
    h+='<span class="bal-lc" style="color:'+lcc+';border-color:'+lcc+'55;background:'+lcc+'18">'+escH(lc.label)+'</span>'; }
  h+='<div style="flex:1"></div></div>';

  // ── Gate roadmap band ──
  h+=_balGateRoadmap(proj);

  // ── Resourcing (needs a period) ──
  if(!months.length){ h+=_balEmpty(t('Set FROM and TO dates in the header to see the resourcing plan.')); }
  else h+=_balResourcing(proj, months);

  body.innerHTML=h;
}

// Sets the selected project for the balancer and re-renders.
export function balSetProject(id){ _balProjId=id; renderResDashboard(); }

// Default project = the one with the most allocation rows (i.e. the most staffed), else
// the first active project, else the first project.
function _balDefaultProject(){
  var counts={};
  (typeof allocRows!=='undefined'?allocRows:[]).forEach(function(r){ if(r.projectId!=null&&r.engId!=null) counts[r.projectId]=(counts[r.projectId]||0)+1; });
  var best=null,bestN=-1;
  projects.forEach(function(p){ var n=counts[p.id]||0; if(n>bestN){bestN=n;best=p.id;} });
  if(best!=null && bestN>0) return best;
  var act=projects.find(function(p){ return (typeof projIsActivePortfolio==='function')?projIsActivePortfolio(p):true; });
  return act?act.id:(projects[0]?projects[0].id:null);
}

function _balKpi(v,l,c){ return '<div class="bal-kpi"><div class="bal-kpi-v" style="color:'+(c||'var(--text)')+'">'+escH(v)+'</div><div class="bal-kpi-l">'+escH(l)+'</div></div>'; }
function _balEmpty(msg){ return '<div class="bal-empty">'+escH(msg)+'</div>'; }

// ── Gate roadmap band for one project ───────────────────────────────────────
// PI increments (dated time boxes on gateConfig.increments) are the timeline; each
// increment shows the stage the project COMMITTED to reach by then (gatePlan.roadmap)
// plus that increment's milestones. Falls back to a stage stepper when no increments exist.
function _balGateRoadmap(proj){
  var stages=[]; try{ stages=(typeof gateConfig!=='undefined'&&gateConfig.model&&gateConfig.model.stages)||[]; }catch(e){}
  if(!stages.length) return '';
  var gp=proj.gatePlan||(typeof makeGatePlan==='function'?makeGatePlan():{stageId:'',roadmap:{},piItems:{}});
  var curIdx=(typeof gtCurStageIdx==='function')?gtCurStageIdx(proj,stages):0;
  var curStage=stages[curIdx]||{};
  var incs=[]; try{ incs=(gateConfig.increments||[]).slice(); }catch(e){}
  var allDated=incs.length && incs.every(function(iv){return iv.start;});
  if(allDated) incs.sort(function(a,b){ return String(a.start).localeCompare(String(b.start)); });

  var h='<div class="bal-rm"><div class="bal-rm-head"><span class="bal-rm-title">'+escH(t('GATE ROADMAP'))+'</span>'
    +'<span class="bal-rm-now">'+escH(t('Now at'))+' <b style="color:'+safeColor(curStage.color,'var(--accent)')+'">'
    +escH(curStage.name||('Stage '+(curIdx+1)))+'</b> <span class="bal-rm-ix">'+(curIdx+1)+'/'+stages.length+'</span></span></div>';

  if(!incs.length){
    h+='<div class="bal-step">';
    stages.forEach(function(s,i){
      var state=i<curIdx?'done':(i===curIdx?'cur':'todo'); var col=safeColor(s.color,'var(--muted)');
      if(i>0) h+='<div class="bal-step-line'+(i<=curIdx?' done':'')+'"></div>';
      h+='<div class="bal-step-node bal-step-'+state+'"><span class="bal-step-dot" style="background:'
        +(state==='todo'?'var(--surface)':col)+';border-color:'+col+'"></span>'
        +'<span class="bal-step-name">'+escH(s.name||('Stage '+(i+1)))+'</span></div>';
    });
    h+='</div><div class="bal-rm-hint">'+escH(t('Define PI increments in Gate & PI to plan a dated roadmap.'))+'</div></div>';
    return h;
  }

  var curMon=(typeof curMonth==='function')?curMonth():'';
  var stById={}; stages.forEach(function(s,i){ stById[s.id]={s:s,i:i}; });
  h+='<div class="bal-rm-track">';
  incs.forEach(function(iv){
    var tgt=stById[(gp.roadmap&&gp.roadmap[iv.id])||''];
    var isNow=iv.start&&iv.end&&curMon&&curMon>=iv.start&&curMon<=iv.end;
    var mies=(gp.piItems&&gp.piItems[iv.id]&&gp.piItems[iv.id].milestones)||[];
    h+='<div class="bal-rm-col'+(isNow?' bal-rm-col-now':'')+'">'
      +'<div class="bal-rm-inc">'+escH(iv.name||'PI')+(isNow?' <span class="bal-rm-nowtag">'+escH(t('NOW'))+'</span>':'')+'</div>'
      +'<div class="bal-rm-dates">'+escH((iv.start||'—')+' → '+(iv.end||'—'))+'</div>';
    if(tgt){ var col=safeColor(tgt.s.color,'var(--muted)');
      h+='<div class="bal-rm-stage" style="color:'+col+';border-color:'+col+'66;background:'+col+'18">'+escH(tgt.s.name||'')+'</div>';
    } else { h+='<div class="bal-rm-stage bal-rm-stage-none">—</div>'; }
    if(mies.length){
      h+='<div class="bal-rm-mies">';
      mies.slice(0,4).forEach(function(mi){
        h+='<div class="bal-rm-mi" title="'+escH((mi.text||'')+(mi.date?(' · '+mi.date):''))+'">'
          +'<span class="bal-rm-mi-dot'+(mi.done?' done':'')+'"></span>'+escH(mi.text||t('milestone'))+'</div>';
      });
      if(mies.length>4) h+='<div class="bal-rm-mi-more">+'+(mies.length-4)+'</div>';
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div></div>';
  return h;
}

// ── Resourcing detail: team × months (time) + cost, absolute ────────────────
function _balResourcing(proj, months){
  var engById=(typeof _engByIdMap==='function')?_engByIdMap():(function(){var m=new Map();engineers.forEach(function(e){m.set(e.id,e);});return m;})();
  var rows=allocRows.filter(function(r){ return r.projectId===proj.id && r.engId!=null; });
  var byEng={};
  rows.forEach(function(r){
    var e=engById.get(r.engId); if(!e) return;
    var a=byEng[r.engId]||(byEng[r.engId]={eng:e,m:{},fte:0,cost:0,peak:0});
    months.forEach(function(mo){
      var v=r.allocs?r.allocs[mo]:null; if(v==null) return;
      a.m[mo]=(a.m[mo]||0)+_allocNum(v); a.fte+=_allocNum(v); a.cost+=_allocCost(v,e.monthlyCost);
    });
  });
  var team=Object.keys(byEng).map(function(k){return byEng[k];}).filter(function(a){return a.fte>0;});
  team.forEach(function(a){ months.forEach(function(mo){ if((a.m[mo]||0)>a.peak)a.peak=a.m[mo]; }); });
  team.sort(function(x,y){return y.fte-x.fte;});

  var mFte=months.map(function(mo){ return team.reduce(function(s,a){return s+(a.m[mo]||0);},0); });
  var mCost=months.map(function(mo){ return team.reduce(function(s,a){return s+((a.m[mo]||0)*(a.eng.monthlyCost||0));},0); });
  var totCost=team.reduce(function(s,a){return s+a.cost;},0);
  var totFte=team.reduce(function(s,a){return s+a.fte;},0);
  var peak=0,peakIdx=-1; mFte.forEach(function(v,i){ if(v>peak){peak=v;peakIdx=i;} });
  var money=function(v){ return v>=1000?Math.round(v/1000).toLocaleString()+' k€':Math.round(v)+' €'; };

  var h='<div class="bal-res"><div class="bal-kpis">'
    +_balKpi(money(totCost),t('Total cost'),'var(--accent2)')
    +_balKpi(totFte.toFixed(1),t('FTE·months'),'var(--text)')
    +_balKpi(peak.toFixed(2),t('Peak FTE')+(peakIdx>=0?(' · '+fmtMonth(months[peakIdx])):''),'var(--accent)')
    +_balKpi(String(team.length),t('People'),'var(--text)')
    +'</div>';

  if(!team.length){ h+=_balEmpty(t('No one is staffed on this project yet. Add allocation rows in the Resource plan.'))+'</div>'; return h; }

  h+='<div class="bal-grid-wrap"><table class="bal-grid"><thead><tr>'
    +'<th class="bal-c-name">'+escH(t('PERSON'))+'</th><th class="bal-c-fn">'+escH(t('FUNCTION'))+'</th>'
    +'<th class="bal-c-mo">'+escH(t('€/MO'))+'</th>';
  months.forEach(function(mo){ h+='<th class="bal-c-mo">'+escH(fmtMonth(mo))+'</th>'; });
  h+='<th class="bal-c-tot">'+escH(t('FTE·MO'))+'</th><th class="bal-c-cost">'+escH(t('COST'))+'</th></tr></thead><tbody>';
  team.forEach(function(a){
    var g=engGroups.find(function(gg){return gg.id===a.eng.groupId;});
    h+='<tr><td class="bal-c-name">'+escH(a.eng.name)+(a.eng.role?'<span class="bal-role"> · '+escH(a.eng.role)+'</span>':'')+'</td>'
      +'<td class="bal-c-fn">'+(g?'<span style="color:'+safeColor(g.color,'var(--muted)')+'">'+escH(g.name)+'</span>':'—')+'</td>'
      +'<td class="bal-c-mo bal-permo">'+((a.eng.monthlyCost||0)?Math.round(a.eng.monthlyCost/1000)+'k':'')+'</td>';
    months.forEach(function(mo){
      var v=a.m[mo]||0; var pct=Math.round(v*100);
      var bg=v>0?('background:rgba(200,241,53,'+Math.min(0.30,v*0.30).toFixed(3)+')'):'';
      h+='<td class="bal-c-mo'+(v>1.005?' bal-over':'')+'" style="'+bg+'">'+(pct?pct+'%':'')+'</td>';
    });
    h+='<td class="bal-c-tot">'+a.fte.toFixed(1)+'</td><td class="bal-c-cost">'+money(a.cost)+'</td></tr>';
  });
  h+='<tr class="bal-foot"><td class="bal-c-name">'+escH(t('TOTAL FTE'))+'</td><td class="bal-c-fn"></td><td class="bal-c-mo"></td>';
  mFte.forEach(function(v){ h+='<td class="bal-c-mo">'+(v?v.toFixed(1):'')+'</td>'; });
  h+='<td class="bal-c-tot">'+totFte.toFixed(1)+'</td><td class="bal-c-cost"></td></tr>';
  h+='<tr class="bal-foot"><td class="bal-c-name">'+escH(t('COST'))+'</td><td class="bal-c-fn"></td><td class="bal-c-mo"></td>';
  mCost.forEach(function(v){ h+='<td class="bal-c-mo bal-cost-cell">'+(v?Math.round(v/1000)+'k':'')+'</td>'; });
  h+='<td class="bal-c-tot"></td><td class="bal-c-cost">'+money(totCost)+'</td></tr>';
  h+='</tbody></table></div></div>';
  return h;
}

// Sets the engineer utilisation group-by mode and re-renders the dashboard.
export function setEngDashGroup(by){ engDashGroupBy=by; renderResDashboard(); }

/* ►► SECTION: DASH-EXPORT ◄◄ Dashboard PDF export */
// switches to the dashboard tab (if needed) then triggers PDF export
export function exportDashboardPDF(){
  var wasOnDashboard=(resActiveTab==='dashboard');
  if(!wasOnDashboard){
    showResTab('dashboard');
    setTimeout(function(){_doExportDashboardPDF();},120);
  } else {
    _doExportDashboardPDF();
  }
}

// builds and opens the print-ready dashboard HTML in a new window
export function _doExportDashboardPDF(){
  var body=G('res-body');
  if(!body||!body.innerHTML.trim()){
    alert('No dashboard content. Set FROM and TO dates first, then open the Dashboard tab.');
    return;
  }

  var content=body.innerHTML;
  var planName=(G('res-title-input')?G('res-title-input').value:'Resource Plan');
  // The balancer is per-project now — name the selected project in the title/subtitle.
  var balProj=(typeof projects!=='undefined')?projects.find(function(p){return p.id===_balProjId;}):null;
  var projName=balProj?(balProj.name||'Untitled'):'';
  var title=planName+' — Resource Balancer'+(projName?(' · '+projName):'');
  var dateStr=new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});

  // Pull the live bal-* (and legacy db-*) class rules from the page so the print window
  // renders the real design. With print-tuned :root tokens below, every var(--…) reference
  // (inline styles, SVG fills AND these classes) resolves to a print-legible colour.
  var dbRules='';
  try{
    [].forEach.call(document.styleSheets,function(ss){
      var rules; try{ rules=ss.cssRules; }catch(e){ return; }
      if(!rules) return;
      [].forEach.call(rules,function(r){
        if(r.selectorText && (r.selectorText.indexOf('.bal-')>=0 || r.selectorText.indexOf('.db-')>=0)) dbRules+=r.cssText+'\n';
      });
    });
  }catch(e){}

  var win=window.open('','_blank');
  if(!win){alert('Pop-up blocked — please allow pop-ups.');return;}

  // Print-tuned token overrides (light ground; lime→dark-green so it reads on paper).
  var css=':root{'
    +'--bg:#ffffff;--surface:#ffffff;--surface2:#f4f6f8;--border:#dee2e6;'
    +'--text:#1a1a2e;--muted:#5f6b7a;--dim:#9aa3ad;'
    +'--accent:#2d6a1f;--accent2:#1e6b5e;--danger:#c0271b;--warn:#b45309;'
    +'--db-mono:\'IBM Plex Mono\',ui-monospace,Menlo,monospace;--db-r:9px;--db-track:#e6e9ec;}'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;background:#fff;padding:20px;font-size:12px;font-variant-numeric:tabular-nums}'
    +dbRules
    // static print: drop interactive controls, un-clip the scrollable chart/grid/roadmap
    +'.db-toolbar,.bal-toolbar,button,select,input[type=range],input[type=checkbox]{display:none!important}'
    +'.db-chart-card,.bal-grid-wrap,.bal-rm-track{overflow:visible!important}'
    +'.bal-rm-track{flex-wrap:wrap}'
    +'.bal-grid th{position:static!important}'   // sticky header prints as static
    +'.bal-grid,.bal-grid td,.bal-grid th{border-color:#dee2e6!important}'
    +'.report-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #2d6a1f}'
    +'.report-title{font-size:20px;font-weight:700;color:#1a1a2e}'
    +'.report-date{font-size:10px;color:#5f6b7a;margin-top:3px}'
    +'.report-footer{margin-top:20px;padding-top:10px;border-top:1px solid #dee2e6;font-size:9px;color:#9aa3ad;display:flex;justify-content:space-between}'
    +'@media print{@page{size:A3 landscape;margin:8mm}body{padding:6px}}';

  win.document.write('<!DOCTYPE html><html><head>'
    +'<meta charset="UTF-8">'
    +'<title>'+escH(title)+'</title>'
    +'<style>'+css+'</style></head><body>'
    +'<div class="report-header">'
    +'<div><div class="report-title">'+escH(title)+'</div>'
    +'<div class="report-date">Generated '+dateStr
    +(projName?' · Project: '+escH(projName):'')
    +'</div></div>'
    +'<div style="font-size:9px;color:#9aa3ad;text-align:right;font-family:monospace">Project Matrix</div>'
    +'</div>'
    +content
    +'<div class="report-footer">'
    +'<span>'+escH(title)+'</span>'
    +'<span>Project Matrix · '+dateStr+'</span>'
    +'</div>'
    +'<scr'+'ipt>window.addEventListener("load",function(){setTimeout(window.print,500);});<\/script>'
    +'</body></html>');
  win.document.close();
}

// Transfers resource plan costs to each project's planCost field and saves state.
export function transferPlanCosts(){
  takeSnap('Auto: before plan transfer','projects','',true);
  var months=getMonthRange();
  var projCost={};
  allocRows.forEach(function(r){
    if(!r.projectId)return;
    var eng=engineers.find(function(e){return e.id===r.engId;});if(!eng||!_costCounts(eng))return;
    var cost=months.reduce(function(s,m){return s+(r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);},0);
    projCost[r.projectId]=(projCost[r.projectId]||0)+cost;
  });
  var updated=0;
  projects.forEach(function(p){
    if(projCost[p.id]!=null){p.planCost=Math.round(projCost[p.id]);p.costSource='plan';updated++;}
  });
  saveState();
  alert(t('Done — {n} projects updated from Resource Plan.',{n:updated}));
}

/* ── Dashboard replacement finder + add-resource (monolith DASHBOARD section) ── */

// Best available substitute for an overloaded engineer (current month):
// most same-group headroom + skill overlap wins. Feeds the proactive
// "suggested swap" line on each over-allocation card. Returns null if none.
export function _dashBestCandidate(engId){
  var eng=engineers.find(function(e){return e.id===engId;});
  if(!eng)return null;
  var cur=_dashCur();
  var wantSkills=(eng.skills||[]).map(function(s){return (s.name||'').toLowerCase();});
  function headroom(e){
    var fte=allocRows.filter(function(r){return r.engId===e.id;})
      .reduce(function(s,r){return s+(r.allocs&&r.allocs[cur]!=null?_allocNum(r.allocs[cur]):0);},0);
    return Math.max(0,1-fte);
  }
  function skillMatch(e){
    var es=(e.skills||[]).map(function(s){return (s.name||'').toLowerCase();});
    return wantSkills.filter(function(s){return es.indexOf(s)>=0;}).length;
  }
  var scored=engineers
    .filter(function(e){return !e.vacant&&e.id!==engId&&_costCounts(e);})
    .map(function(e){return {eng:e,headroom:headroom(e),skills:skillMatch(e),same:e.groupId===eng.groupId};})
    .filter(function(c){return c.headroom>0.1;})
    .sort(function(a,b){
      if(b.same!==a.same)return (b.same?1:0)-(a.same?1:0);
      if(b.skills!==a.skills)return b.skills-a.skills;
      return b.headroom-a.headroom;
    });
  if(!scored.length)return null;
  return {eng:scored[0].eng,headroom:scored[0].headroom,skills:scored[0].skills,total:wantSkills.length,same:scored[0].same};
}

/* ── Dashboard: replacement finder ─────────────────────────────────── */
// Shows or hides the replacement candidate panel for an overloaded engineer.
export function showDashReplacements(engId, btn) {
  // Toggle: if already open, close it
  var existing = document.getElementById('dash-repl-panel-' + engId);
  if (existing) { existing.remove(); btn.textContent = '🔍 '+t('FIND REPLACEMENTS'); return; }
  btn.textContent = t('▲ CLOSE');

  var eng = engineers.find(function(e){ return e.id === engId; });
  if (!eng) return;

  var months   = getMonthRange();
  var cur      = _dashCur();
  var engSkills = (eng.skills || []).map(function(s){ return s.name.toLowerCase(); });

  // Build allocation map: engId → curAlloc FTE this month
  var curAllocMap = {};
  engineers.filter(function(e){ return !e.vacant; }).forEach(function(e){
    var fte = allocRows.filter(function(r){ return r.engId===e.id; })
      .reduce(function(s,r){ return s+(r.allocs&&r.allocs[cur]?+r.allocs[cur]:0); }, 0);
    curAllocMap[e.id] = fte;
  });

  // Skill filter state — persisted per-panel on the button element
  var selectedSkills = btn._replSkillFilter || [];

  // Find candidates: same group, not overallocated, not the engineer themselves
  var sameGroup = engineers.filter(function(e){
    return !e.vacant && e.id !== engId && e.groupId === eng.groupId;
  });
  // Also include engineers from other groups (secondary list)
  var otherGroups = engineers.filter(function(e){
    return !e.vacant && e.id !== engId && e.groupId !== eng.groupId;
  });

  function candidateScore(e) {
    var alloc = curAllocMap[e.id] || 0;
    var headroom = Math.max(0, 1 - alloc); // free capacity
    // Skill match score
    var eSkills = (e.skills||[]).map(function(s){ return s.name.toLowerCase(); });
    var matchedSkills = selectedSkills.length
      ? selectedSkills.filter(function(s){ return eSkills.includes(s); }).length
      : 0;
    return { e:e, alloc:alloc, headroom:headroom, matched:matchedSkills,
             pct:Math.round(alloc*100) };
  }

  function filterCandidates(list) {
    var scored = list.map(candidateScore);
    // If skills selected, require at least one match
    if (selectedSkills.length) {
      scored = scored.filter(function(c){ return c.matched > 0; });
    }
    // Sort: most headroom first, then most skill matches
    scored.sort(function(a,b){
      if (selectedSkills.length && b.matched !== a.matched) return b.matched - a.matched;
      return b.headroom - a.headroom;
    });
    return scored;
  }

  var sameCandidates   = filterCandidates(sameGroup);
  var otherCandidates  = filterCandidates(otherGroups).slice(0, 5);

  // ── Build panel HTML ─────────────────────────────────────────────
  function perfSym(e) {
    var key = _nineBoxPlacements[e.uid];
    if (!key) return '';
    var p = parseInt(key.split('-')[0], 10);
    return p===3 ? '<span style="color:#c8f135">▲</span>'
         : p===2 ? '<span style="color:#888">●</span>'
         :         '<span style="color:#f14335">▼</span>';
  }

  function candidateRow(c, highlight) {
    var eg = engGroups.find(function(g){ return g.id===c.e.groupId; });
    var grpColor = eg ? eg.color : 'var(--muted)';
    var availCol = c.headroom > 0.4 ? 'var(--accent)' : c.headroom > 0.1 ? '#f1a435' : 'var(--danger)';
    var matchBadge = selectedSkills.length
      ? '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(200,241,53,.12);'
        + 'color:var(--accent);border:1px solid rgba(200,241,53,.3);margin-left:4px">'
        + c.matched + '/' + selectedSkills.length + ' '+t('skills')+'</span>'
      : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;'
      + 'border-radius:5px;background:'+(highlight?'rgba(200,241,53,.05)':'var(--bg)')
      + ';border:1px solid var(--border);margin-bottom:3px">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:700;'
      + 'color:var(--text);display:flex;align-items:center;gap:5px">'
      + escH(c.e.name) + matchBadge + perfSym(c.e)
      + '</div>'
      + '<div style="font-size:8px;color:var(--muted)">'
      + escH(c.e.role||'') + (c.e.role&&eg?' · ':'') + (eg?'<span style="color:'+grpColor+'">'+escH(eg.name)+'</span>':'')
      + '</div>'
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:'+availCol+'">'
      + c.pct + '%</div>'
      + '<div style="font-size:8px;color:var(--muted)">' + Math.round(c.headroom*100) + '% '+t('free')+'</div>'
      + '</div>'
      + '</div>';
  }

  // ── Skill pills ───────────────────────────────────────────────────
  var skillPills = engSkills.length
    ? '<div style="margin-bottom:8px">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);'
      + 'letter-spacing:.06em;margin-bottom:4px">'+t('FILTER BY SKILL (click to toggle):')+'</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
      + engSkills.map(function(s){
          var active = selectedSkills.includes(s);
          return '<button onclick="(function(b,s){'
            + 'var f=b._replSkillFilter||[];'
            + 'var i=f.indexOf(s);'
            + 'if(i>=0){f.splice(i,1);}else{f.push(s);}'
            + 'b._replSkillFilter=f;'
            + "document.getElementById('dash-repl-panel-"+engId+"').remove();"
            + 'showDashReplacements('+engId+',b);'
            + '})(document.querySelector(\'[data-repl-eng=\\"'+engId+'\\"]\'),\''+s.replace(/'/g,"\\'")+'\')" '
            + 'style="font-family:IBM Plex Mono,monospace;font-size:9px;padding:2px 7px;'
            + 'border-radius:10px;cursor:pointer;border:1px solid '+(active?'var(--accent)':'var(--border)')+';'
            + 'background:'+(active?'rgba(200,241,53,.15)':'var(--bg)')+';'
            + 'color:'+(active?'var(--accent)':'var(--muted)')+';">'
            + escH(s) + '</button>';
        }).join('')
      + '</div></div>'
    : '';

  // ── Panel HTML ────────────────────────────────────────────────────
  var h = '<div id="dash-repl-panel-'+engId+'" style="margin-top:8px;padding:10px;'
    + 'background:var(--surface);border:1px solid var(--border);border-radius:6px;'
    + 'border-top:2px solid var(--danger)">'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--danger);'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--danger);letter-spacing:.07em;margin-bottom:8px">'+t('REPLACEMENT CANDIDATES FOR')+' ' + escH(eng.name.toUpperCase()) + '</div>'
    + skillPills;

  if (sameCandidates.length) {
    var eg = engGroups.find(function(g){ return g.id===eng.groupId; });
    h += '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);'
      + 'margin-bottom:4px;letter-spacing:.05em">'+t('SAME GROUP')+(eg?' — '+escH(eg.name):'')+' ('+sameCandidates.length+')</div>';
    sameCandidates.slice(0, 6).forEach(function(c){ h += candidateRow(c, true); });
  } else {
    h += '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);padding:4px 0">'
      + t('No available candidates in same group')
      + (selectedSkills.length ? ' '+t('with selected skills.') : '.') + '</div>';
  }

  if (otherCandidates.length && !selectedSkills.length) {
    h += '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);'
      + 'margin-top:8px;margin-bottom:4px;letter-spacing:.05em">'+t('OTHER GROUPS')+' ('+otherCandidates.length+')</div>';
    otherCandidates.forEach(function(c){ h += candidateRow(c, false); });
  }

  if (!sameCandidates.length && !otherCandidates.length) {
    h += '<div style="font-size:9px;color:var(--muted);padding:4px 0">'+t('No available replacements found.')+'</div>';
  }

  // Add resource button at bottom of panel
  h += '<div style="padding:8px 10px;border-top:1px solid var(--border);margin-top:4px">'
    + '<button onclick="openAddResourceModal(' + engId + ')" '
    + 'style="width:100%;font-family:IBM Plex Mono,monospace;font-size:9px;padding:4px 0;'
    + 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;'
    + 'cursor:pointer;letter-spacing:.04em">'+t('+ ADD RESOURCE')+'</button>'
    + '</div>';
  h += '</div>';

  // Insert panel after the button's parent card
  var card = btn.closest('.db-ucard') || btn.closest('.kpi-card') || btn.parentElement;
  card.insertAdjacentHTML('afterend', h);

  // Store skill filter on the button for re-renders
  btn.setAttribute('data-repl-eng', engId);
  btn._replSkillFilter = selectedSkills;
}

// Toggles collapsible cost-by-project sector row open/closed.
export function toggleDashSector(name,safeId){
  _dashSectorOpen[name]=!_dashSectorOpen[name];
  var c=document.getElementById(safeId);
  var arrow=document.getElementById('dsec-arrow-'+safeId);
  if(c)c.style.display=_dashSectorOpen[name]?'block':'none';
  if(arrow)arrow.textContent=_dashSectorOpen[name]?'▼':'▶';
}


/* ── Add Resource from replacement finder ──────────────────────────
   Creates a new engineer pre-filled from the overloaded engineer's
   profile, adds them to the roster and org automatically.
   Called from showDashReplacements panel.
   ────────────────────────────────────────────────────────────────── */
// Opens the add-resource modal pre-filled from a source engineer's profile.
export function openAddResourceModal(fromEngId) {
  var fromEng = engineers.find(function(e){ return e.id === fromEngId; });

  // Remove existing modal if present
  var ex = document.getElementById('add-resource-modal');
  if (ex) ex.remove();

  var groups = engGroups.map(function(g){
    return '<option value="'+g.id+'"'+(fromEng&&g.id===fromEng.groupId?' selected':'')+'>'+escH(g.name)+'</option>';
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'add-resource-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:900;'
    +'display:flex;align-items:center;justify-content:center;';

  modal.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);'
    +'border-radius:12px;padding:24px;width:min(460px,95vw);display:flex;flex-direction:column;gap:12px">'
    +'<div style="display:flex;align-items:center;gap:10px">'
    +'<h3 style="font-family:IBM Plex Mono,monospace;font-size:12px;letter-spacing:.06em;color:var(--muted);margin:0">'+t('ADD RESOURCE')+'</h3>'
    +(fromEng?'<span style="font-size:10px;color:var(--muted)">'+t('— based on the profile of {name}',{name:escH(fromEng.name)})+'</span>':'')
    +'<div style="flex:1"></div>'
    +'<button onclick="document.getElementById(\'add-resource-modal\').remove()" '
    +'style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer">✕</button>'
    +'</div>'

    // Name
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">'+t('FULL NAME *')+'</label>'
    +'<input id="nar-name" class="eng-card-inp" placeholder="'+t('e.g. Jane Doe')+'" style="width:100%">'
    +'</div>'

    // Role — prefill from source eng
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">'+t('ROLE')+'</label>'
    +'<input id="nar-role" class="eng-card-inp" value="'+escH(fromEng?fromEng.role||'':'')
    +'" placeholder="'+t('e.g. Senior R&D')+'" style="width:100%">'
    +'</div>'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">'+t('LOCATION')+'</label>'
    +'<input id="nar-location" class="eng-card-inp" value="'+escH(fromEng?fromEng.location||'':'')
    +'" placeholder="'+t('e.g. Montreal')+'" style="width:100%">'
    +'</div>'
    +'</div>'

    // Group + cost
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">'+t('ROSTER GROUP')+'</label>'
    +'<select id="nar-group" style="background:var(--bg);border:1px solid var(--border);color:var(--text);'
    +'font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;width:100%">'
    +'<option value="">'+t('— No group —')+'</option>'+groups
    +'</select>'
    +'</div>'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">'+t('MONTHLY COST (€)')+'</label>'
    +'<input id="nar-cost" class="eng-card-inp" type="number" value="'+(fromEng?fromEng.monthlyCost||8000:8000)
    +'" placeholder="8000" style="width:100%">'
    +'</div>'
    +'</div>'

    // Copy skills checkbox
    +(fromEng&&(fromEng.skills||[]).length
      ? '<label style="display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer">'
        +'<input type="checkbox" id="nar-copy-skills" checked style="accent-color:var(--accent)">'
        +'<span style="color:var(--text)">'+t('Copy skills from {name}',{name:escH(fromEng.name)})+'</span>'
        +'<span style="font-size:9px;color:var(--muted)">('+t('{n} skills',{n:fromEng.skills.length})+')</span>'
        +'</label>'
      : '')

    // Org placement: reports to
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">'+t('REPORTS TO (org chart)')+'</label>'
    +'<select id="nar-reportsto" style="background:var(--bg);border:1px solid var(--border);color:var(--text);'
    +'font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;width:100%">'
    +'<option value="">'+t('— Not set —')+'</option>'
    +(fromEng&&fromEng.idcard&&fromEng.idcard.reportsTo
      ? engineers.filter(function(e){ return !e.vacant; }).map(function(e){
          var sel = String(e.id)===String(fromEng.idcard.reportsTo)?' selected':'';
          return '<option value="'+e.id+'"'+sel+'>'+escH(e.name)+'</option>';
        }).join('')
      : engineers.filter(function(e){ return !e.vacant; }).map(function(e){
          return '<option value="'+e.id+'">'+escH(e.name)+'</option>';
        }).join('')
    )
    +'</select>'
    +'</div>'

    // Vacancy toggle
    +'<label style="display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer">'
    +'<input type="checkbox" id="nar-vacant" style="accent-color:var(--accent)">'
    +'<span style="color:var(--text)">'+t('Add as vacancy (open position)')+'</span>'
    +'</label>'

    // Actions
    +'<div style="display:flex;gap:8px;margin-top:4px">'
    +'<button class="primary" onclick="confirmAddResource('+fromEngId+')" '
    +'style="flex:1;font-family:IBM Plex Mono,monospace;letter-spacing:.04em">'+t('✓ ADD TO ROSTER')+'</button>'
    +'<button onclick="document.getElementById(\'add-resource-modal\').remove()" '
    +'style="font-family:IBM Plex Mono,monospace">'+t('CANCEL')+'</button>'
    +'</div>'
    +'</div>';

  document.body.appendChild(modal);
  document.getElementById('nar-name').focus();
}

// Validates the add-resource modal, creates the engineer, navigates to roster, and shows a toast.
export function confirmAddResource(fromEngId) {
  var name = (document.getElementById('nar-name').value||'').trim();
  if (!name) { alert(t('Name is required.')); return; }

  var fromEng   = engineers.find(function(e){ return e.id === fromEngId; });
  var role      = (document.getElementById('nar-role').value||'').trim();
  var location  = (document.getElementById('nar-location').value||'').trim();
  var groupId   = +document.getElementById('nar-group').value || null;
  var cost      = +document.getElementById('nar-cost').value  || 8000;
  var vacant    = document.getElementById('nar-vacant').checked;
  var reportsTo = document.getElementById('nar-reportsto').value || '';
  var copySkills= document.getElementById('nar-copy-skills')
                  && document.getElementById('nar-copy-skills').checked;

  // Deep-copy skills from source if requested
  var skills = [];
  if (copySkills && fromEng) {
    skills = JSON.parse(JSON.stringify(fromEng.skills || []));
  }

  // Build idcard with reportsTo for org chart (canonical camelCase key + manager name).
  var mgrEng = reportsTo ? engineers.find(function(e){ return String(e.id)===String(reportsTo); }) : null;
  var idcard = makeIdCard();
  if (reportsTo) { idcard.reportsTo = String(reportsTo); idcard.manager = mgrEng ? mgrEng.name : ''; }

  // Create the engineer via the factory so every flag + idcard sub-object stays
  // in sync (see CLAUDE.md › Adding a field to Engineer). A raw literal here would
  // silently omit planningOnly/includeInCost/excludeFromCalc/includeTalent and the
  // idcard sub-objects newer code dereferences.
  var newEng = makeEngineer({
    id:           nextEngId++,
    name:         name,
    monthlyCost:  cost,
    groupId:      groupId,
    role:         role,
    location:     location,
    vacant:       vacant,
    skills:       skills,
    idcard:       idcard,
  });

  engineers.push(newEng);

  // Expand the group if it exists
  if (groupId) {
    var g = engGroups.find(function(g){ return g.id === groupId; });
    if (g) g.collapsed = false;
  }

  saveState();

  document.getElementById('add-resource-modal').remove();

  // Show success and navigate to roster
  var msg = '✓ ' + t('{name} added to roster',{name:name})
    + (groupId ? ' (' + (engGroups.find(function(g){return g.id===groupId;})||{}).name + ')' : '')
    + (reportsTo ? '\n  '
        + t('Org chart: reports to {name}',{name:(engineers.find(function(e){ return String(e.id)===String(reportsTo); })||{}).name}) : '')
    + (copySkills && skills.length ? '\n  ' + t('{n} skills copied',{n:skills.length}) : '');

  // Switch to roster to show the new engineer
  showResTab('roster');
  renderResActiveTab();

  // Brief toast
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);'
    +'background:var(--surface);border:1px solid var(--accent);border-radius:8px;'
    +'padding:10px 20px;font-family:IBM Plex Mono,monospace;font-size:11px;'
    +'color:var(--accent);z-index:999;white-space:pre-line;text-align:center;'
    +'box-shadow:0 4px 20px rgba(0,0,0,.4)';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function(){ toast.remove(); }, 3500);
}
