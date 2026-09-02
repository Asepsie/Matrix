/* ►► SECTION: DASHBOARD ◄◄ Resource balancer: capacity vitals, supply/demand, over/under-allocation, replacements
 *
 * Functions defined in this file:
 *   _dashMonths        — returns the full month range for dashboard calculations
 *   _buildCostMaps     — computes project cost maps with optional engineer/project filters
 *   renderResDashboard — renders the Resource Balancer: capacity supply/demand, availability, utilisation, over-allocation & rebalancing
 *   setEngDashGroup    — sets the engineer utilisation group-by mode and re-renders
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

let _balProjId = null;
let _balMode = 'balance';   // Balancer mode: 'balance' (portfolio supply/demand + rebalancing, default) | 'project' (per-project resourcing)

/* Resource Balancer dispatcher — TWO modes on one screen. BALANCE = the portfolio
   supply/demand + capacity-by-function + availability + utilisation + over-allocation
   with rebalancing suggestions (engine _dashBestCandidate/showDashReplacements/
   pipelineCapacity never left the file). BY PROJECT = per-project resourcing. The mode
   toggle is prepended AFTER the sub-view renders, so neither sub-view is refactored. */
export function renderResDashboard(){
  var body=G('res-body'); if(!body) return;
  if(_balMode==='project') _balProjectView(); else _balPortfolioView();
  body.insertAdjacentHTML('afterbegin', _balModeToggle());
}
export function balSetMode(m){ _balMode=(m==='project')?'project':'balance'; renderResDashboard(); }
function _balModeToggle(){
  function mb(id,label,tip){ return '<button class="bal-mode-btn'+(_balMode===id?' on':'')+'" title="'+escH(tip)+'" onclick="balSetMode(&#39;'+id+'&#39;)">'+escH(label)+'</button>'; }
  return '<div class="bal-mode">'
    +mb('balance',t('⚖ Balance'),t('Team capacity vs demand, availability and rebalancing across the whole portfolio'))
    +mb('project',t('▤ By project'),t('One project: who is on it, their time and cost, and its gate roadmap'))
    +'</div>';
}

/* ►► BALANCER-EXPORT ◄◄ Resource balancer (capacity + per-resource utilisation) on the
 * shared export engine. Curated blocks — capacity summary, per-person utilisation table,
 * over-allocation conflicts — built from the SAME _buildEngUtil / _costCounts engine the
 * BALANCE view reads, so the export and the on-screen numbers agree. balx-prefixed. */
function balxData(){
  var months=getMonthRange();
  var engUtil=(typeof _buildEngUtil==='function')?_buildEngUtil(months):{};
  var counted=Object.values(engUtil).filter(function(eu){return _costCounts(eu.eng);});
  function inactive(eu,m){ var s=eu.monthStatus&&eu.monthStatus[m]; return (s==='m'||s==='r')&&(eu.monthAllocs[m]||0)===0; }
  var supply=0,engaged=0,demand=0;
  counted.forEach(function(eu){ months.forEach(function(m){ if(inactive(eu,m))return; supply+=1; var a=eu.monthAllocs[m]||0; engaged+=Math.min(a,1); demand+=a; }); });
  var rows=counted.map(function(eu){
    var vals=months.map(function(m){return eu.monthAllocs[m]||0;}).concat([0]);
    var peak=Math.max.apply(null,vals);
    return { eng:eu.eng, util:Math.round((eu.utilizationRate||0)*100), peak:Math.round(peak*100), over:eu.overMonths||[] };
  }).sort(function(a,b){return b.util-a.util;});
  return {
    months:months, counted:counted, rows:rows,
    supply:supply, engaged:engaged, idle:Math.max(0,supply-engaged), over:Math.max(0,demand-engaged),
    util:supply>0?Math.round(engaged/supply*100):0,
    overCount:counted.filter(function(eu){return (eu.overMonths||[]).length>0;}).length,
    benchCount:rows.filter(function(r){return r.peak===0;}).length,
  };
}
function balxGroupName(eng){ var g=engGroups.find(function(g){return g.id===eng.groupId;}); return g?g.name:''; }
function balxGroupColor(eng){ var g=engGroups.find(function(g){return g.id===eng.groupId;}); return safeColor(g?g.color:'var(--muted)','var(--muted)'); }
function balExportBlocks(){
  var mono='font-family:IBM Plex Mono,monospace';
  var tile=function(val,label,sub,color){
    return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:120px;flex:1">'
      +'<div style="font-size:22px;font-weight:700;color:'+(color||'var(--text)')+';line-height:1.1">'+val+'</div>'
      +'<div style="'+mono+';font-size:9px;color:var(--muted);letter-spacing:.06em;margin-top:5px">'+escH(label)+'</div>'
      +(sub?'<div style="font-size:10px;color:var(--muted);margin-top:2px">'+escH(sub)+'</div>':'')+'</div>';
  };
  return [
    {id:'summary', label:t('Capacity summary'), render:function(){
      var d=balxData();
      if(!d.months.length) return '<div style="font-size:11px;color:var(--muted)">'+escH(t('Set a FROM/TO period to compute capacity.'))+'</div>';
      var rnd=function(v){return Math.round(v);};
      var h='<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Capacity summary'))+'</h2>';
      h+='<div style="display:flex;gap:10px;flex-wrap:wrap">';
      h+=tile(rnd(d.supply), t('SUPPLY (FTE·mo)'), t('counted capacity over period'), 'var(--accent2)');
      h+=tile(rnd(d.engaged), t('ENGAGED (FTE·mo)'), d.util+'% '+t('utilisation'), 'var(--accent)');
      h+=tile(rnd(d.idle), t('IDLE (FTE·mo)'), t('bench headroom'));
      h+=tile(rnd(d.over), t('OVER (FTE·mo)'), t('demand beyond 1.0 FTE'), d.over>0?'var(--danger)':'var(--text)');
      h+=tile(d.overCount, t('OVER-ALLOCATED'), t('{n} on bench',{n:d.benchCount}), d.overCount?'var(--danger)':'var(--text)');
      h+='</div>';
      return h;
    }},
    {id:'people', label:t('Per-resource utilisation'), render:function(){
      var d=balxData();
      if(!d.rows.length) return '';
      var h='<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Per-resource utilisation'))+'</h2>';
      h+='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:var(--surface)">';
      [t('PERSON'),t('GROUP'),t('UTILISATION'),t('PEAK'),t('STATUS')].forEach(function(c){h+='<th style="text-align:left;padding:5px 8px;border:1px solid var(--border);'+mono+';font-size:9px;color:var(--muted)">'+escH(c)+'</th>';});
      h+='</tr></thead><tbody>';
      d.rows.forEach(function(r){
        var uc=r.util>100?'var(--danger)':(r.util>=60?'var(--accent)':'var(--accent2)');
        var status=r.peak===0?t('on bench'):(r.over.length?t('over-allocated'):t('ok'));
        var sc=r.peak===0?'var(--muted)':(r.over.length?'var(--danger)':'var(--accent)');
        h+='<tr>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:var(--text);font-weight:600">'+escH(r.eng.name)+(r.eng.role?'<br><span style="font-weight:400;color:var(--muted);font-size:9px">'+escH(r.eng.role)+'</span>':'')+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border)"><span style="color:'+balxGroupColor(r.eng)+'">'+escH(balxGroupName(r.eng))+'</span></td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);min-width:120px"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;background:var(--border);border-radius:3px;height:6px;overflow:hidden"><div style="height:6px;border-radius:3px;background:'+uc+';width:'+Math.min(100,r.util)+'%"></div></div><span style="'+mono+';color:'+uc+';font-weight:700">'+r.util+'%</span></div></td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);'+mono+';color:'+(r.peak>100?'var(--danger)':'var(--muted)')+'">'+r.peak+'%</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:'+sc+';font-weight:600">'+escH(status)+'</td>'
          +'</tr>';
      });
      h+='</tbody></table>';
      return h;
    }},
    {id:'conflicts', label:t('Over-allocation conflicts'), render:function(){
      var d=balxData();
      var over=d.rows.filter(function(r){return r.over.length;});
      var head='<h2 style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--text)">'+escH(t('Over-allocation conflicts'))+'</h2>';
      if(!over.length) return head+'<div style="font-size:11px;color:var(--muted)">'+escH(t('No over-allocations in this period.'))+'</div>';
      var h=head+'<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:var(--surface)">';
      [t('PERSON'),t('MONTHS OVER 100%'),t('PEAK')].forEach(function(c){h+='<th style="text-align:left;padding:5px 8px;border:1px solid var(--border);'+mono+';font-size:9px;color:var(--muted)">'+escH(c)+'</th>';});
      h+='</tr></thead><tbody>';
      over.forEach(function(r){
        h+='<tr>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:var(--text);font-weight:600">'+escH(r.eng.name)+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:var(--danger)">'+r.over.map(function(m){return escH(m.slice(0,7));}).join(', ')+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);'+mono+';color:var(--danger);font-weight:700">'+r.peak+'%</td>'
          +'</tr>';
      });
      h+='</tbody></table>';
      return h;
    }},
  ];
}
// opens the shared export builder for the Resource balancer
function balExportOpen(){
  if(typeof projects==='undefined'||!projects.length){ alert(t('No projects yet — add projects on the matrix.')); return; }
  if(!getMonthRange().length){ alert(t('Set FROM and TO dates in the header first.')); return; }
  var teamName=(G('res-title-input')?G('res-title-input').value:'')||'';
  var n=getMonthRange().length;
  exportOpenBuilder({
    deliverableId:'balancer',
    title:t('Resource balancer'),
    subtitleDefault:teamName+(teamName?' · ':'')+t('{n} month(s)',{n:n}),
    blocks:balExportBlocks(),
    ctx:{},
    orientation:'landscape', pageSize:'A3', rasterWidth:1600,
    builtinTemplates:[
      {id:'full', name:t('Full'), blocks:['summary','people','conflicts']},
      {id:'summary', name:t('Summary + conflicts'), blocks:['summary','conflicts']},
    ],
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}

// ── PROJECT mode — per-project resourcing (picker + gate roadmap + team/time/cost). Numbers
// are ABSOLUTE (no share-of-portfolio); computed off allocRows so an archived project still shows.
function _balProjectView(){
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
  // Archived (terminal) projects are hidden by default; the currently-selected one is kept
  // so viewing an archived project (e.g. opened from the Archive browser) still works.
  projects.slice().filter(function(p){ return (typeof projIsArchived!=='function') || !projIsArchived(p) || p.id===_balProjId; })
    .sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).forEach(function(p){
    var arch=(typeof projIsArchived==='function')&&projIsArchived(p);
    h+='<option value="'+p.id+'"'+(p.id===_balProjId?' selected':'')+'>'+escH(p.name||t('Untitled'))+(arch?' ('+escH(t('archived'))+')':'')+'</option>';
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

// ── BALANCE mode — restored portfolio balancer (supply/demand, availability, utilisation,
// over-allocation + rebalancing). Its engine functions survived the earlier rework.
function _balPortfolioView(){
  var body=G('res-body');if(!body)return;
  var months=_dashMonths();
  var cur=_dashCur();
  // "This month" clamped into the visible plan period, so the current-month KPIs
  // (FTE this month, bench, peak fallback) stay meaningful when the period does
  // not span today. The chart keeps the real `cur` (no marker when out of range).
  var curInRange=months.length?(months.indexOf(cur)>=0?cur:(cur<months[0]?months[0]:months[months.length-1])):cur;

  if(!months.length){
    body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:200px;flex-direction:column;gap:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px"><div style="font-size:28px">📅</div><div>'+t('Set FROM and TO dates in the header to see the dashboard')+'</div></div>';
    return;
  }

  var cm=_buildCostMaps(months,engDashFilterEng,engDashFilterProj);
  var projCost=cm.projCost,filteredRows=cm.filteredRows;
  var engUtil=_buildEngUtil(months);
  var engById=_engByIdMap();

  // "Counted" engineers — the canonical cost-inclusion set (ARCHITECTURE.md ›
  // Cost model) applied to engUtil. engUtil already drops vacancies and
  // planning-only-without-includeInCost; _costCounts additionally drops
  // excludeFromCalc. Every headline KPI below is computed over this set so the
  // numbers agree with the utilisation grid (which skips excludeFromCalc) and
  // with the cost figures (which gate on _costCounts) — otherwise an excluded
  // engineer inflates OVERALLOCATED / ON BENCH / AVG-UTIL while hidden from the grid.
  var countedUtil=Object.values(engUtil).filter(function(eu){return _costCounts(eu.eng);});

  // FTE calcs — gate on _costCounts so FTE demand counts the same population as
  // the cost bars (vacancies count as planned demand; excludeFromCalc never does).
  var fteByEng={};
  filteredRows.forEach(function(r){
    if(!r.engId)return;
    var eng=engById.get(r.engId);if(!eng||!_costCounts(eng))return;
    var v=r.allocs&&r.allocs[curInRange]!=null?_allocNum(r.allocs[curInRange]):0;
    fteByEng[r.engId]=(fteByEng[r.engId]||0)+v;
  });
  var fteCur=Object.values(fteByEng).reduce(function(s,v){return s+Math.min(v,1);},0);
  var fteRaw=Object.values(fteByEng).reduce(function(s,v){return s+v;},0);

  var overCount=countedUtil.filter(function(eu){return eu.overMonths.length>0;}).length;
  var allocatedEngCount=Object.keys(fteByEng).length;
  var projStaffedCount=Object.keys(projCost).length;
  var totalActiveEngs=countedUtil.length;

  // Bench = counted engineers with zero allocation in the current (in-range) month
  var benchEngs=countedUtil.filter(function(eu){return (eu.monthAllocs[curInRange]||0)===0;});
  var benchCount=benchEngs.length;

  // Avg team utilisation over full period (same counted population as the denominator)
  var avgUtil=totalActiveEngs>0
    ?(countedUtil.reduce(function(s,eu){return s+eu.utilizationRate;},0)/totalActiveEngs*100).toFixed(0)
    :0;

  // ── Capacity supply vs demand (FTE·months over the period) ──────
  // The balancing backbone: how much counted capacity exists (supply), how much
  // is engaged (capped at 1.0 FTE), how much sits idle, and where raw demand runs
  // past 1.0 FTE (over-capacity). Everything downstream — hero, gauge, chart and
  // the capacity-by-function table — reads these, so the headline and detail agree.
  var _nMonths=months.length;
  // A month drops out of supply only when the engineer is fully medical/resigned
  // that month (status m/r AND no working allocation) — a single 'm' row on one
  // project must not zero a real availability on another.
  function _monthInactive(eu,m){
    var s=eu.monthStatus&&eu.monthStatus[m];
    return (s==='m'||s==='r')&&(eu.monthAllocs[m]||0)===0;
  }
  var _supplyMo=0, _engagedMo=0, _demandMo=0;
  countedUtil.forEach(function(eu){
    months.forEach(function(m){
      if(_monthInactive(eu,m))return;
      _supplyMo+=1;
      var a=eu.monthAllocs[m]||0;
      _engagedMo+=Math.min(a,1);
      _demandMo+=a;
    });
  });
  var _utilPct=_supplyMo>0?Math.round(_engagedMo/_supplyMo*100):0;
  var _idleMo=Math.max(0,_supplyMo-_engagedMo);   // free FTE·months (bench capacity)
  var _overMo=Math.max(0,_demandMo-_engagedMo);   // demand beyond 1.0 FTE (over-capacity)

  // SPOF count from skill data
  var skillMap=buildSkillMap();
  var spofSkills=Object.values(skillMap).filter(function(sm){return sm.holders.length===1&&sm.cat==='crit';});
  var spofEngIds=new Set(spofSkills.map(function(sm){return sm.holders[0].eng.id;}));

  // ── Un-funded / on-hold suppression, made VISIBLE (not a silent zero) ──────────
  // Allocations on non-capacity-consuming projects (proposed / on_hold / terminal) are
  // excluded from utilisation above (see _computeEngUtil › capSet). A person booked only
  // on such projects therefore reads 0%/bench even though they're really allocated — the
  // "over-allocated shows 0" report. We recompute the RAW (unsuppressed) bookings here so
  // the balancer can name what's hidden and why, without changing the capacity math.
  var _capSet=(typeof _projCapacitySet==='function')?_projCapacitySet():null;
  var _hiddenByEng={};     // engId -> {byMonth:{}, peak}
  var _hiddenProjSet={};   // projId -> true (suppressed AND staffed in-period)
  if(_capSet){
    allocRows.forEach(function(r){
      if(r.engId==null || r.projectId==null || _capSet.has(r.projectId)) return;  // only suppressed projects
      var eng=engById.get(r.engId); if(!eng || !_costCounts(eng)) return;
      months.forEach(function(m){
        var v=r.allocs&&r.allocs[m];
        var n=(v==='p')?1:((v==='m'||v==='r')?0:(+v||0));
        if(n<=0) return;
        var hb=_hiddenByEng[r.engId]||(_hiddenByEng[r.engId]={byMonth:{}});
        hb.byMonth[m]=(hb.byMonth[m]||0)+n;
        _hiddenProjSet[r.projectId]=true;
      });
    });
    Object.keys(_hiddenByEng).forEach(function(k){
      var bm=_hiddenByEng[k].byMonth,pk=0;
      Object.keys(bm).forEach(function(m){ if(bm[m]>pk)pk=bm[m]; });
      _hiddenByEng[k].peak=pk;
    });
  }
  var _hiddenProjIds=Object.keys(_hiddenProjSet).map(Number);

  var h='';

  // ── Filter / action toolbar ────────────────────────────────────
  var _projMap=_projByIdMap();
  var allEngNames=[...new Set(allocRows.map(function(r){var e=engById.get(r.engId);return e?e.name:null;}).filter(Boolean))].sort();
  var allProjNames=[...new Set(allocRows.map(function(r){var p=_projMap.get(r.projectId);return p?p.name:null;}).filter(Boolean))].sort();
  var clearBtn=(engDashFilterEng.size||engDashFilterProj.size)?'<button class="sm" onclick="engDashFilterEng=new Set();engDashFilterProj=new Set();renderResDashboard()">&#215; '+t('CLEAR')+'</button>':'';
  h+='<div class="db-toolbar">'
   +'<span class="db-tb-label">'+t('FILTER:')+'</span>'
   +multiSelectHTML('dash-eng',allEngNames,engDashFilterEng,'onDashFilterEngChange',t('Engineers'))
   +multiSelectHTML('dash-proj',allProjNames,engDashFilterProj,'onDashFilterProjChange',t('Projects'))
   +clearBtn
   +'<div style="flex:1"></div>'
   +'<button class="sm" onclick="balExportOpen()" title="'+escH(t('Export capacity summary + per-resource utilisation as PDF or HTML'))+'">📄 '+t('EXPORT')+'</button>'
   +'</div>';

  // ── Suppression banner — why some people read 0% / bench ────────
  if(_hiddenProjIds.length){
    var _hpNames=_hiddenProjIds.slice(0,4).map(function(pid){var p=_projMap.get(pid);return escH(p?(p.name||t('Untitled')):('#'+pid));});
    var _moreH=_hiddenProjIds.length-_hpNames.length;
    var _hiddenEngCount=Object.keys(_hiddenByEng).length;
    h+='<div class="db-suppress">'
      +'<div class="db-suppress-ic">&#9888;</div>'
      +'<div class="db-suppress-tx">'
      +'<div class="db-suppress-h">'+t('{n} project(s) are proposed or on hold — their staffing is hidden from capacity',{n:_hiddenProjIds.length})+'</div>'
      +'<div class="db-suppress-s">'+_hpNames.join(' · ')+(_moreH>0?' +'+_moreH+' '+t('more'):'')
        +' · '+t('{n} person(s) affected',{n:_hiddenEngCount})
        +' — '+t('set a project Active/In-Service (project editor or Pipeline) to count its allocations here')+'</div>'
      +'</div>'
      +'<button class="sm" onclick="railGo(event,&#39;pipeline&#39;)">'+t('OPEN PIPELINE')+'</button>'
      +'</div>';
  }

  // ── Hero band: team capacity + how much of it is engaged ───────
  h+='<div class="db-hero">'
   +'<div class="db-card db-hero-cost">'
   +'<div>'
   +'<div class="db-eyebrow">'+t('TEAM CAPACITY')+' · '+t('{n} months',{n:_nMonths})+'</div>'
   +'<div class="db-hero-big">'+totalActiveEngs+'</div>'
   +'<div class="db-hero-sub">'+t('counted engineers')+' · <b>'+_supplyMo.toFixed(0)+'</b> '+t('FTE·months available')+' · <b>'+projStaffedCount+'/'+projects.length+'</b> '+t('projects staffed')+'</div>'
   +(_overMo>0.5?'<div class="db-warnpill">&#9888; '+_overMo.toFixed(1)+' '+t('FTE·months over capacity')+'</div>':'')
   +'<div style="margin-top:12px">'
   +'<div style="height:8px;border-radius:5px;overflow:hidden;display:flex;background:var(--db-track)"><i style="width:'+_utilPct+'%;background:var(--accent2)"></i></div>'
   +'<div style="display:flex;justify-content:space-between;font-family:var(--db-mono);font-size:9px;color:var(--muted);margin-top:5px"><span>'+_engagedMo.toFixed(0)+' '+t('engaged')+'</span><span>'+_idleMo.toFixed(0)+' '+t('idle')+'</span></div>'
   +'</div>'
   +'</div>'
   +'</div>'
   +'<div class="db-card db-gauge">'
   +'<div class="db-gauge-head"><span class="db-eyebrow">'+t('CAPACITY ENGAGED')+'</span><span class="db-gauge-pct">'+_utilPct+'%</span></div>'
   +'<div class="db-gauge-track"><div class="db-gauge-fill" style="width:'+_utilPct+'%"></div><div class="db-gauge-rest"></div></div>'
   +'<div class="db-gauge-legend"><span><b>'+_engagedMo.toFixed(0)+'</b> '+t('FTE·mo engaged')+'</span><span>'+t('of')+' <b>'+_supplyMo.toFixed(0)+'</b> '+t('available')+'</span></div>'
   +'<div class="db-gauge-legend" style="margin-top:-4px"><span class="db-muted">'+t('the rest is bench capacity')+'</span></div>'
   +'</div>'
   +'</div>';

  // ── Health strip: capacity + risk state ────────────────────────
  h+='<div class="db-strip">'
   +'<div class="db-stat"><span class="db-sev"></span>'
   +'<div class="db-stat-v">'+fteCur.toFixed(1)+'</div><div class="db-stat-k">'+t('FTE THIS MONTH')+'</div>'
   +'<div class="db-stat-d">'+curInRange+(curInRange!==cur?' · '+t('nearest planned month'):'')+(fteRaw>fteCur?' · '+t('demand')+' '+fteRaw.toFixed(1):'')+'</div></div>'
   +'<div class="db-stat db-stat--click'+(+avgUtil>90?' db-stat--alert':+avgUtil<50?' db-stat--info':'')+'" onclick="_availPanel.open=!_availPanel.open;renderResDashboard()" title="'+t('Click to show availability panel')+'"><span class="db-sev"></span>'
   +'<div class="db-stat-v"'+(+avgUtil>=50&&+avgUtil<=90?' style="color:var(--accent)"':'')+'>'+avgUtil+'%</div><div class="db-stat-k">'+t('AVG UTILISATION')+' '+(_availPanel.open?'▼':'▶')+'</div>'
   +'<div class="db-stat-d">'+t('across full plan period')+' · '+t('{n} engineers',{n:totalActiveEngs})+'</div></div>'
   +'<div class="db-stat'+(overCount?' db-stat--alert':'')+'"><span class="db-sev"></span>'
   +'<div class="db-stat-v"'+(overCount?'':' style="color:var(--accent)"')+'>'+overCount+'</div><div class="db-stat-k">'+t('OVERALLOCATED')+'</div>'
   +'<div class="db-stat-d">'+(overCount?t('Engineers &gt;100% in some months'):t('All within capacity'))+'</div>'
   +(overCount?'<span class="db-chip db-chip--alert">'+t('needs rebalancing')+'</span>':'')+'</div>'
   +'<div class="db-stat db-stat--click'+(benchCount>0?' db-stat--info':'')+'" onclick="_availPanel.open=true;_availPanel.threshold=1;renderResDashboard()" title="'+t('Click to show bench resources')+'"><span class="db-sev"></span>'
   +'<div class="db-stat-v"'+(benchCount>0?'':' style="color:var(--accent)"')+'>'+benchCount+'</div><div class="db-stat-k">'+t('ON BENCH')+'</div>'
   +'<div class="db-stat-d">'+t('Unallocated this month')+(_idleMo>0?' · '+_idleMo.toFixed(0)+' '+t('FTE·mo idle'):'')+'</div>'
   +(benchCount>0?'<span class="db-chip db-chip--info">'+benchEngs.map(function(eu){return escH(eu.name.split(' ')[0]);}).slice(0,3).join(', ')+(benchCount>3?'…':'')+'</span>':'')+'</div>'
   +'<div class="db-stat'+(spofSkills.length?' db-stat--warn':'')+'"><span class="db-sev"></span>'
   +'<div class="db-stat-v"'+(spofSkills.length?'':' style="color:var(--accent)"')+'>'+spofSkills.length+'</div><div class="db-stat-k">'+t('CRITICAL SPOF SKILLS')+'</div>'
   +'<div class="db-stat-d">'+t('Single-person critical skills')+'</div>'
   +(spofSkills.length?'<a class="db-chip db-chip--warn" onclick="skGo(event,\'risk\')" style="cursor:pointer;text-decoration:none">'+t('view risk tab')+' →</a>':'')+'</div>'
   +'</div>';

  // ── Monthly demand vs capacity chart ───────────────────────────
  // Raw FTE demand per month (uncapped, so over-allocation shows) against the
  // counted capacity line. Bars turn red where demand outruns capacity.
  var curIdx=months.indexOf(cur);
  var moDemand=months.map(function(m){
    var byE={};
    filteredRows.forEach(function(r){
      if(!r.engId)return;
      var eng=engById.get(r.engId);if(!eng||!_costCounts(eng))return;
      var v=r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0;
      byE[r.engId]=(byE[r.engId]||0)+v;
    });
    return Object.values(byE).reduce(function(s,v){return s+v;},0);
  });
  var moSupply=months.map(function(m){return countedUtil.reduce(function(s,eu){return s+(_monthInactive(eu,m)?0:1);},0);});
  var maxY=Math.max.apply(null,moDemand.concat(moSupply).concat([1]));
  // geometry — faint grid, demand bars (accent/current/over), capacity line
  var _pL=44,_pR=16,_pT=14,_pB=26,_chH=130;
  var _slot=Math.max(26,Math.min(64,Math.floor((880-_pL-_pR)/months.length)));
  var _chW=_pL+_pR+_slot*months.length,_bw=Math.round(_slot*0.5);
  var _innerH=_chH-_pT-_pB,_baseY=_chH-_pB;
  var svg='';
  for(var _g=0;_g<=3;_g++){
    var _gy=_pT+_innerH*_g/3, _gv=(maxY*(1-_g/3));
    svg+='<line x1="'+_pL+'" y1="'+_gy.toFixed(1)+'" x2="'+(_chW-_pR)+'" y2="'+_gy.toFixed(1)+'" stroke="var(--border)" stroke-width="'+(_g===3?1:0.6)+'" opacity="'+(_g===3?1:0.5)+'"/>'
      +'<text x="'+(_pL-8)+'" y="'+(_gy+3).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--dim)" font-family="IBM Plex Mono,monospace">'+_gv.toFixed(0)+'</text>';
  }
  moDemand.forEach(function(v,i){
    var bh=Math.round(v/maxY*_innerH), x=_pL+_slot*i+(_slot-_bw)/2, y=_baseY-bh;
    var isCur=i===curIdx, isOver=v>moSupply[i]+0.001;
    var fill=isOver?'var(--danger)':(isCur?'var(--accent)':'var(--accent2)');
    svg+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+_bw+'" height="'+bh+'" rx="2" fill="'+fill+'" opacity="'+(isOver?0.85:isCur?0.95:0.5)+'"/>';
    if(months[i].endsWith('-01')||i===0||months.length<=12)
      svg+='<text x="'+(_pL+_slot*i+_slot/2).toFixed(1)+'" y="'+(_chH-9)+'" text-anchor="middle" font-size="8.5" fill="'+(isCur?'var(--accent)':'var(--dim)')+'" font-family="IBM Plex Mono,monospace">'+(months.length<=12?months[i].slice(5):months[i].slice(0,4))+'</text>';
  });
  var _cpts=moSupply.map(function(v,i){return [_pL+_slot*i+_slot/2, _baseY-(v/maxY)*_innerH];});
  svg+='<path d="M'+_cpts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L')+'" fill="none" stroke="var(--text)" stroke-width="1.6" stroke-dasharray="4 3" opacity="0.7" stroke-linejoin="round"/>';
  h+='<div class="db-sec"><div class="db-sec-title">'+t('MONTHLY DEMAND vs CAPACITY')
   +'<span class="db-spacer"></span><span class="db-legend">'
   +'<i><span class="db-swatch" style="background:var(--accent2)"></span>'+t('FTE demand')+'</i>'
   +'<i><span class="db-swatch" style="background:var(--danger)"></span>'+t('Over capacity')+'</i>'
   +'<i><span class="db-swatch" style="background:var(--text)"></span>'+t('Capacity')+'</i>'
   +'</span></div>'
   +'<div class="db-card db-chart-card" style="overflow-x:auto"><svg class="db-chart" viewBox="0 0 '+_chW+' '+_chH+'" width="'+_chW+'" height="'+_chH+'" role="img" aria-label="'+t('Monthly FTE demand bars against a capacity line')+'">'+svg+'</svg></div></div>';

  // ── Capacity by function: supply vs demand ─────────────────────
  // Structural over/under by group — the gap you can't see person-by-person.
  var _sdGroups={};
  countedUtil.forEach(function(eu){
    var key=eu.grp||t('Ungrouped'), color=eu.grpColor||'var(--muted)';
    if(!_sdGroups[key])_sdGroups[key]={color:color,supply:0,engaged:0,demand:0,n:0};
    var g=_sdGroups[key];g.n++;
    months.forEach(function(m){
      if(_monthInactive(eu,m))return;
      g.supply+=1;var a=eu.monthAllocs[m]||0;g.engaged+=Math.min(a,1);g.demand+=a;
    });
  });
  var _sdKeys=Object.keys(_sdGroups).sort(function(a,b){return (_sdGroups[b].demand-_sdGroups[b].supply)-(_sdGroups[a].demand-_sdGroups[a].supply);});
  if(_sdKeys.length){
    h+='<div class="db-sec"><div class="db-sec-title">'+t('CAPACITY BY FUNCTION')+' <span class="db-hint">'+t('supply vs demand · FTE·months')+'</span></div>'
      +'<div class="db-table-card"><table class="db-table"><thead><tr>'
      +'<th>'+t('FUNCTION')+'</th><th>'+t('PEOPLE')+'</th><th>'+t('SUPPLY')+'</th><th>'+t('DEMAND')+'</th><th>'+t('BALANCE')+'</th><th>'+t('ENGAGED')+'</th>'
      +'</tr></thead><tbody>';
    _sdKeys.forEach(function(k){
      var g=_sdGroups[k], net=g.demand-g.supply;
      var pct=g.supply>0?Math.min(100,Math.round(g.engaged/g.supply*100)):0;
      var netCol=net>0.5?'var(--danger)':net<-0.5?'var(--accent2)':'var(--muted)';
      var label=net>0.5?t('short'):net<-0.5?t('slack'):t('balanced');
      var barCol=net>0.5?'var(--danger)':'var(--accent2)';
      h+='<tr>'
       +'<td><span class="db-pname"><span class="db-dot" style="background:'+safeColor(g.color)+'"></span>'+escH(k)+'</span></td>'
       +'<td class="db-num db-muted">'+g.n+'</td>'
       +'<td class="db-num">'+g.supply.toFixed(0)+'</td>'
       +'<td class="db-num">'+g.demand.toFixed(1)+'</td>'
       +'<td><span style="color:'+netCol+';font-weight:600">'+(net>0?'+':'')+net.toFixed(1)+'</span> <span class="db-muted" style="font-size:9px">'+label+'</span></td>'
       +'<td><div class="db-share-cell"><div class="db-share-bar"><i style="width:'+pct+'%;background:'+barCol+'"></i></div><span class="db-muted" style="min-width:28px">'+pct+'%</span></div></td>'
       +'</tr>';
    });
    h+='</tbody></table></div></div>';
  }


  // ── Availability panel ──────────────────────────────────────────
  if(_availPanel.open){
    var _avThresh = _availPanel.threshold; // max util% to be considered "available"
    var _avGroup  = _availPanel.groupBy;
    var _avSel    = _availPanel.selected;

    // Build list of available engineers (utilisation < threshold)
    var _avEngs = Object.values(engUtil).filter(function(eu){
      return eu.utilizationRate*100 < _avThresh;
    }).sort(function(a,b){ return a.utilizationRate - b.utilizationRate; });

    // Panel header
    h+='<div id="avail-panel" class="db-avail">'
     +'<div class="db-avail-head">'
     +'<span class="db-avail-title">'+t('◉ AVAILABILITY')+'</span>'
     // threshold slider
     +'<div class="db-avail-ctl">'
     +'<span>'+t('SHOW &lt;')+'</span>'
     +'<input type="range" min="1" max="100" step="5" value="'+_avThresh+'"'
     +' style="width:80px;accent-color:var(--accent)" title="'+t('Show engineers with utilisation below this %')+'"'
     +' oninput="this.nextElementSibling.textContent=this.value+\'%\';_availPanel.threshold=+this.value;renderResDashboard()">'
     +'<span style="font-family:var(--db-mono);font-size:9px;color:var(--accent);min-width:30px">'+_avThresh+'%</span>'
     +'</div>'
     // group by selector
     +'<div class="db-avail-ctl">'
     +'<span>'+t('GROUP:')+'</span>'
     +(function(){var _lbl={availability:t('AVAILABILITY'),project:t('PROJECT'),function:t('FUNCTION'),location:t('LOCATION')};return ['availability','project','function','location'].map(function(g){
       return '<button class="sm'+(g===_avGroup?' active':'')+'" '
         +'style="font-size:9px;padding:2px 7px'+(g===_avGroup?';border-color:var(--accent);color:var(--accent)':'')+'" '
         +'onclick="_availPanel.groupBy=\''+g+'\';renderResDashboard()">'+_lbl[g]+'</button>';
     }).join('');})()
     +'</div>'
     // actions
     +'<div style="margin-left:auto;display:flex;align-items:center;gap:6px">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('{n} available',{n:_avEngs.length})+'</span>'
     +'<button class="sm" style="font-size:9px;padding:2px 7px" onclick="availSelectAll()" title="'+t('Select all visible')+'">'+t('☑ All')+'</button>'
     +'<button class="sm" style="font-size:9px;padding:2px 7px" onclick="availSelectNone()" title="'+t('Clear selection')+'">'+t('☐ None')+'</button>'
     +'<button class="sm primary" style="font-size:9px;padding:2px 8px" onclick="availShowCapability()" title="'+t('Show capability summary for selected engineers')+'">'+t('⚡ What can we do?')+'</button>'
     +'<button class="sm" style="font-size:9px;padding:2px 7px" onclick="_availPanel.open=false;renderResDashboard()">✕</button>'
     +'</div>'
     +'</div>';

    // Group the list
    var _avGroups = {};
    _avEngs.forEach(function(eu){
      var key;
      if(_avGroup==='availability'){
        var pct=Math.round(eu.utilizationRate*100);
        key = pct===0?t('🪑 On bench (0%)'):pct<25?t('◔ Low (<25%)'):pct<50?t('◑ Medium (<50%)'):t('◕ High (<{n}%)',{n:_avThresh});
      } else if(_avGroup==='project'){
        key = eu.projIds.length===0?t('— No project'):eu.projIds.map(function(pid){
          var p=projects.find(function(p){return p.id===pid;});return p?p.name:'?';
        }).join(', ');
      } else if(_avGroup==='function'){
        key = eu.grp||t('— No group');
      } else {
        key = eu.loc||t('— No location');
      }
      if(!_avGroups[key]) _avGroups[key]=[];
      _avGroups[key].push(eu);
    });

    if(_avEngs.length===0){
      h+='<div style="text-align:center;padding:20px;font-family:var(--db-mono);font-size:11px;color:var(--muted)">'+t('No engineers below {n}% utilisation in this period',{n:_avThresh})+'</div>';
    } else {
      Object.keys(_avGroups).sort().forEach(function(gkey){
        var gEngs = _avGroups[gkey];
        h+='<div style="margin-bottom:10px">'
         +'<div class="db-avail-gkey">'+escH(gkey)+' <span style="color:var(--dim)">('+gEngs.length+')</span></div>'
         +'<div class="db-avail-grid">';
        gEngs.forEach(function(eu){
          var pct=Math.round(eu.utilizationRate*100);
          var col=pct===0?'var(--accent2)':pct<25?'var(--accent2)':pct<50?'var(--accent)':'var(--muted)';
          var sel=_avSel.has(eu.eng.id);
          var topSkills=(eu.eng.skills||[]).slice(0,3).map(function(s){return escH(s.name);}).join(', ');
          h+='<div class="db-acard'+(sel?' db-sel':'')+'" style="border-left-color:'+eu.grpColor+'"'
           +' onclick="availToggle('+eu.eng.id+')" title="'+t('Click to select/deselect')+'">'
           +'<div class="db-acard-row">'
           +'<input type="checkbox" '+(sel?'checked':'')+' style="accent-color:var(--accent);pointer-events:none" tabindex="-1">'
           +'<div style="flex:1">'
           +'<div class="db-acard-name">'+escH(eu.name)+'</div>'
           +(eu.role?'<div style="font-size:9px;color:var(--muted)">'+escH(eu.role)+'</div>':'')
           +'</div>'
           +'<div class="db-acard-pct" style="color:'+col+'">'+pct+'%</div>'
           +'</div>'
           +(topSkills?'<div style="font-size:9px;color:var(--dim);margin-top:4px">'+topSkills+'</div>':'')
           +'<div class="db-ubar" style="margin-top:6px"><i style="width:'+pct+'%;background:'+col+'"></i></div>'
           +'</div>';
        });
        h+='</div></div>';
      });
    }

    // Capability summary (shown when engineers are selected)
    if(_avSel.size>0){
      var _selEngs=Object.values(engUtil).filter(function(eu){return _avSel.has(eu.eng.id);});
      var _totalAvailFTE=_selEngs.reduce(function(s,eu){return s+(1-eu.utilizationRate);},0);
      var _skillMap={};
      _selEngs.forEach(function(eu){
        (eu.eng.skills||[]).forEach(function(s){
          if(!_skillMap[s.name]) _skillMap[s.name]={count:0,maxLevel:0};
          _skillMap[s.name].count++;
          _skillMap[s.name].maxLevel=Math.max(_skillMap[s.name].maxLevel,+s.level||0);
        });
      });
      var _topSkills=Object.entries(_skillMap).sort(function(a,b){return b[1].count-a[1].count||b[1].maxLevel-a[1].maxLevel;}).slice(0,12);
      h+='<div id="avail-capability" class="db-cap">'
       +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">'
       +'<span class="db-cap-title">⚡ '+t('TEAM CAPABILITY')+' — '+t('{n} selected',{n:_selEngs.length})+'</span>'
       +'<span style="font-family:var(--db-mono);font-size:9px;color:var(--muted)">~'+_totalAvailFTE.toFixed(1)+' '+t('available FTE')+'</span>'
       +'</div>'
       +'<div style="display:flex;gap:16px;flex-wrap:wrap">'
       // Engineers list
       +'<div style="flex:1;min-width:160px">'
       +'<div style="font-family:var(--db-mono);font-size:9px;color:var(--muted);margin-bottom:5px">'+t('ENGINEERS')+'</div>'
       +_selEngs.map(function(eu){
         var avail=Math.round((1-eu.utilizationRate)*100);
         return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'
           +'<div class="db-dot" style="width:6px;height:6px;background:'+eu.grpColor+'"></div>'
           +'<span style="font-size:11px;color:var(--text)">'+escH(eu.name)+'</span>'
           +'<span style="font-family:var(--db-mono);font-size:9px;color:var(--accent);margin-left:auto">~'+avail+'% '+t('free')+'</span>'
           +'</div>';
       }).join('')
       +'</div>'
       // Skills
       +(_topSkills.length?
         '<div style="flex:2;min-width:200px">'
         +'<div style="font-family:var(--db-mono);font-size:9px;color:var(--muted);margin-bottom:5px">'+t('KEY SKILLS')+'</div>'
         +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
         +_topSkills.map(function(kv){
           return '<span class="db-skillchip">'
             +escH(kv[0])
             +(kv[1].count>1?'<span style="opacity:.6"> ×'+kv[1].count+'</span>':'')
             +'</span>';
         }).join('')
         +'</div></div>'
       :'')
       +'</div>'
       +'</div>';
    }

    h+='</div>';
  }

  // ── Engineer utilisation ───────────────────────────────────────
  h+='<div class="db-sec"><div class="db-sec-title">'+t('ENGINEER UTILISATION')+' <span class="db-hint">'+t('counted resources only')+'</span>'
   +'<span class="db-spacer"></span>'
   +'<span class="db-legend"><i>'+t('GROUP BY:')+'</i></span>'
   +'<button class="sm'+(engDashGroupBy==='group'?' active':'')+'" onclick="setEngDashGroup(\'group\')">'+t('FUNCTION')+'</button>'
   +'<button class="sm'+(engDashGroupBy==='project'?' active':'')+'" onclick="setEngDashGroup(\'project\')">'+t('PROJECT')+'</button>'
   +'<button class="sm'+(engDashGroupBy==='location'?' active':'')+'" onclick="setEngDashGroup(\'location\')">'+t('LOCATION')+'</button>'
   +'</div>';

  // Build grouping
  var utilByKey={};
  Object.values(engUtil).forEach(function(eu){
    if(!_costCounts(eu.eng))return; // excluded from calc — keep group counts and cards in sync
    if(engDashFilterEng&&engDashFilterEng.size&&!engDashFilterEng.has(eu.name))return;
    var key,color;
    if(engDashGroupBy==='group'){key=eu.grp||t('Ungrouped');color=eu.grpColor;}
    else if(engDashGroupBy==='location'){key=eu.loc||t('Unknown');color='var(--accent2)';}
    else{
      // by project
      var projIds=eu.projIds;
      if(!projIds.length){
        var _unassignedLbl=t('Unassigned');
        if(!utilByKey[_unassignedLbl])utilByKey[_unassignedLbl]={color:'var(--muted)',members:[]};
        utilByKey[_unassignedLbl].members.push(eu);return;
      }
      projIds.forEach(function(pid){
        var p=projects.find(function(p){return p.id===pid;});
        var pk=p?p.name:t('Unknown');
        if(!utilByKey[pk])utilByKey[pk]={color:p?p.color:'var(--muted)',members:[]};
        if(!utilByKey[pk].members.find(function(m){return m.name===eu.name&&m._projId===pid;})){
          var projRows=allocRows.filter(function(r){return r.engId===eu.eng.id&&r.projectId===pid;});
          var projMonthAllocs={};
          months.forEach(function(m){projMonthAllocs[m]=projRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);});
          var pt=Object.values(projMonthAllocs).reduce(function(s,v){return s+v;},0);
          var pa=months.length>0?pt/months.length:0;
          utilByKey[pk].members.push(Object.assign({},eu,{avgAlloc:pa,totAlloc:pt,_projId:pid}));
        }
      });return;
    }
    if(!utilByKey[key])utilByKey[key]={color:color,members:[]};
    utilByKey[key].members.push(eu);
  });

  for(var gk in utilByKey){
    var ug=utilByKey[gk];
    h+='<div class="db-ugroup">'
     +'<div class="db-ugroup-head">'
     +'<span class="db-dot" style="background:'+safeColor(ug.color)+'"></span>'
     +'<span class="db-ugroup-name">'+escH(gk)+'</span>'
     +'<span class="db-ugroup-count">'+t('{n} engineer(s)',{n:ug.members.length})+'</span>'
     +'</div>'
     +'<div class="db-util-grid">';
    ug.members.forEach(function(eu){
      // excludeFromCalc already filtered when building utilByKey (count stays in sync)
      var pct=Math.round(eu.avgAlloc*100);
      var utilPct=Math.round(eu.utilizationRate*100);
      var isOver=eu.overMonths&&eu.overMonths.length>0;
      var isBench=(eu.monthAllocs[curInRange]||0)===0;
      var isSpof=spofEngIds.has(eu.eng.id);
      var hb=_hiddenByEng[eu.eng.id];  // raw bookings on suppressed (un-funded/on-hold) projects
      var col=isOver?'var(--danger)':isBench?'var(--accent2)':pct>80?'var(--accent)':'var(--accent2)';
      var cls=isOver?' db-ucard--over':isBench?' db-ucard--bench':isSpof?' db-ucard--spof':'';
      var emv=months.map(function(m){return eu.monthAllocs&&eu.monthAllocs[m]?eu.monthAllocs[m]:0;});
      var eSpark=_dbSparkBars(emv,{w:88,h:18,curIdx:curIdx,overMax:1.005,overColor:'var(--danger)'});
      h+='<div class="db-ucard'+cls+'">'
       +'<div class="db-uname">'+escH(eu.name)
       +(isOver?'<span class="db-tag db-tag--over">&#9888; '+t('OVER')+'</span>':'')
       +(isBench?'<span class="db-tag db-tag--bench">'+t('BENCH')+'</span>':'')
       +(isSpof?'<span class="db-tag db-tag--spof">SPOF</span>':'')
       +((hb&&hb.peak>0)?'<span class="db-tag db-tag--hidden" title="'+escH(t('Booked on proposed/on-hold projects, which are excluded from capacity'))+'">&#8709; '+t('HIDDEN')+'</span>':'')
       +'</div>'
       +'<div class="db-urole">'+(eu.role?escH(eu.role):'')+(eu.role&&eu.loc?' · ':'')+escH(eu.loc||'')+'</div>'
       +'<div class="db-upct" style="color:'+col+'">'+pct+'%</div>'
       +'<div class="db-umeta">'+t('avg active')+' · '+utilPct+'% '+t('full period')+'</div>'
       +'<div style="margin-top:6px">'+eSpark+'</div>'
       +(isOver?'<div class="db-umeta" style="color:var(--danger)">&#9888; '+t('Over:')+' '+eu.overMonths.slice(0,3).map(function(m){return m.slice(0,7);}).join(', ')+(eu.overMonths.length>3?'…':'')+'</div>':'')
       +'<div class="db-umeta">'+eu.activeMonths+'/'+eu.months+' '+t('active mo')+' · '+utilPct+'% '+t('full period')+'</div>'
       +((hb&&hb.peak>0)?'<div class="db-umeta db-hidden-note">&#8709; '+t('up to {n} FTE/mo on un-funded projects (hidden)',{n:hb.peak.toFixed(1)})+'</div>':'')
       +'<button class="db-ubtn'+(isOver?'':' db-ubtn--alt')+'" onclick="showDashReplacements('+eu.eng.id+',this)">&#128270; '+(isOver?t('FIND REPLACEMENTS'):t('FIND ALTERNATIVES'))+'</button>'
       +'</div>';
    });
    h+='</div></div>';
  }
  h+='</div>';


  // ── Overworked resources + conflict summary ───────────────────────
  var _overEngs = countedUtil.filter(function(eu){ return eu.overMonths.length > 0; });
  var _conflictData = _overEngs.map(function(eu){
    var conflictProjs = {};
    eu.overMonths.forEach(function(m){
      var rows = filteredRows.filter(function(r){ return r.engId===eu.eng.id && r.allocs && r.allocs[m] > 0; });
      rows.forEach(function(r){
        var p = projects.find(function(p){ return p.id===r.projectId; });
        if(!p) return;
        if(!conflictProjs[p.id]) conflictProjs[p.id] = {p:p, months:[]};
        conflictProjs[p.id].months.push(m);
      });
    });
    return { eu:eu, conflictProjs:Object.values(conflictProjs) };
  });

  if(_conflictData.length){
    h+='<div class="db-sec"><div class="db-sec-title">'+t('⚠ OVERLOADED RESOURCES &amp; CONFLICTS')+'</div>'
      +'<div style="display:flex;flex-direction:column;gap:6px">';

    _conflictData.forEach(function(cd){
      var eu = cd.eu;
      var eg = engGroups.find(function(g){ return g.id===eu.eng.groupId; });
      var grpColor = eg ? eg.color : 'var(--muted)';
      var overPct = Math.round(Math.max.apply(null, eu.overMonths.map(function(m){
        return filteredRows.filter(function(r){return r.engId===eu.eng.id;})
          .reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);
      }).concat([0]))*100);

      h+='<div class="db-conflict">';
      h+='<div class="db-conflict-head">'
        +'<span class="db-conflict-name">'+escH(eu.eng.name)+'</span>'
        +(eu.eng.role?'<span style="font-size:9px;color:var(--muted)">'+escH(eu.eng.role)+'</span>':'')
        +'<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(120,120,140,.15);color:'+grpColor+'">'+escH(eg?eg.name:'')+'</span>'
        +'<div style="flex:1"></div>'
        +'<span class="db-conflict-peak">'+overPct+'% '+t('peak')+'</span>'
        +'<span style="font-family:var(--db-mono);font-size:9px;color:var(--muted)">'+t('{n} month(s)',{n:eu.overMonths.length})+'</span>'
        +'</div>';
      // Over months mini chips
      h+='<div class="db-cflex" style="margin-bottom:6px">';
      eu.overMonths.slice(0,8).forEach(function(m){
        h+='<span class="db-mchip">'+m.slice(0,7)+'</span>';
      });
      if(eu.overMonths.length>8) h+='<span style="font-size:8px;color:var(--muted)">+'+( eu.overMonths.length-8)+'</span>';
      h+='</div>';
      // Conflicting projects
      if(cd.conflictProjs.length){
        h+='<div style="font-family:var(--db-mono);font-size:8px;color:var(--muted);margin-bottom:4px;letter-spacing:.04em">'+t('CONFLICTS ACROSS:')+'</div>'
          +'<div class="db-cflex">';
        cd.conflictProjs.forEach(function(cp){
          h+='<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:'+(cp.p.color||'var(--muted)')+'22;border:1px solid '+(cp.p.color||'var(--muted)')+'44;color:'+(cp.p.color||'var(--text)')+'">'+escH(cp.p.name)+'<span style="color:var(--muted);margin-left:4px">'+cp.months.length+t('mo')+'</span></span>';
        });
        h+='</div>';
      }
      // Proactive rebalancing suggestion — the single best available substitute.
      var _sug=_dashBestCandidate(eu.eng.id);
      if(_sug){
        h+='<div class="db-cflex" style="margin-top:6px;align-items:center">'
          +'<span style="font-family:var(--db-mono);font-size:8px;color:var(--muted);letter-spacing:.04em">'+t('SUGGESTED SWAP:')+'</span>'
          +'<span style="font-size:10px;color:var(--accent)">↔ '+escH(_sug.eng.name)+'</span>'
          +'<span style="font-size:9px;color:var(--muted)">'+Math.round(_sug.headroom*100)+'% '+t('free')
          +(_sug.total?' · '+_sug.skills+'/'+_sug.total+' '+t('skills'):'')
          +(_sug.same?'':' · '+t('other group'))+'</span>'
          +'</div>';
      }
      h+='<div style="display:flex;gap:6px">'
        +'<button class="db-ubtn" style="flex:1" onclick="showDashReplacements('+eu.eng.id+',this)">🔍 '+t('FIND REPLACEMENTS')+'</button>'
        +'<button class="db-ubtn db-ubtn--alt" style="flex:1" onclick="tlOpenResource('+eu.eng.id+')" title="'+escH(t('See this person’s allocation over time'))+'">◧ '+t('TIMELINE')+'</button>'
        +'</div>';
      h+='</div>';
    });
    h+='</div></div>';
  }


  body.innerHTML=h;
}

// Sets the selected project for the balancer and re-renders.
export function balSetProject(id){ _balProjId=id; renderResDashboard(); }

// Default project = the one with the most allocation rows (i.e. the most staffed), else
// the first active project, else the first project.
function _balDefaultProject(){
  var arch=function(p){ return (typeof projIsArchived==='function')&&projIsArchived(p); };
  var counts={};
  (typeof allocRows!=='undefined'?allocRows:[]).forEach(function(r){ if(r.projectId!=null&&r.engId!=null) counts[r.projectId]=(counts[r.projectId]||0)+1; });
  var best=null,bestN=-1;
  projects.forEach(function(p){ if(arch(p))return; var n=counts[p.id]||0; if(n>bestN){bestN=n;best=p.id;} });
  if(best!=null && bestN>0) return best;
  var act=projects.find(function(p){ return !arch(p) && ((typeof projIsActivePortfolio==='function')?projIsActivePortfolio(p):true); });
  if(act) return act.id;
  var live=projects.find(function(p){ return !arch(p); });
  return live?live.id:(projects[0]?projects[0].id:null);
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
    h+='<tr><td class="bal-c-name">'+escH(a.eng.name)+(a.eng.role?'<span class="bal-role"> · '+escH(a.eng.role)+'</span>':'')
      +'<button class="bal-find" title="'+escH(t('Find available people with the same function or skills'))+'" onclick="showDashReplacements('+a.eng.id+',this)">&#128270;</button>'
      +'<button class="bal-find" title="'+escH(t('See this person’s allocation over time'))+'" onclick="tlOpenResource('+a.eng.id+')">&#9703;</button></td>'
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
  h+='</tbody></table></div>'
    +'<div id="bal-repl-host"></div>'   // full-width host for the per-row replacement finder
    +'</div>';
  return h;
}

// Sets the engineer utilisation group-by mode and re-renders the dashboard.
export function setEngDashGroup(by){ engDashGroupBy=by; renderResDashboard(); }

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
// Toggles one skill in the replacement panel's per-panel skill filter, then
// re-renders the panel. The trigger button (which owns the persisted filter, keyed
// by data-repl-eng) is re-resolved from the DOM; the skill rides on the pill's
// data-repl-skill attribute so no user-authored value is ever spliced into handler JS.
export function _replToggleSkill(pill){
  var skill = pill.getAttribute('data-repl-skill');
  var engId = +pill.getAttribute('data-repl-for');
  var b = document.querySelector('[data-repl-eng="'+engId+'"]');
  if(!b) return;
  var f = b._replSkillFilter || [];
  var i = f.indexOf(skill);
  if(i>=0) f.splice(i,1); else f.push(skill);
  b._replSkillFilter = f;
  var panel = document.getElementById('dash-repl-panel-'+engId);
  if(panel) panel.remove();
  showDashReplacements(engId, b);
}

// Shows or hides the replacement candidate panel for an engineer (same function/group +
// overlapping skills + free capacity). Triggered from the ⚖ Balance utilisation cards,
// the overload-conflict cards, and the ▤ By-project team rows.
export function showDashReplacements(engId, btn) {
  // Table context (▤ By-project view): the finder is triggered from a compact per-row
  // 🔍 button inside a <tr>, where a full-width panel can't live. In that case render
  // into the shared #bal-repl-host below the table (single-open) and leave the icon
  // button's label alone. Detecting the <tr> here means the skill-pill re-entry (which
  // re-resolves btn via [data-repl-eng]) stays consistent without threading a param.
  var tr = (btn && btn.closest) ? btn.closest('tr') : null;
  var host = tr ? document.getElementById('bal-repl-host') : null;
  // Toggle: if already open, close it
  var existing = document.getElementById('dash-repl-panel-' + engId);
  if (existing) { existing.remove(); if(!tr) btn.textContent = '🔍 '+t('FIND REPLACEMENTS'); return; }
  if(!tr) btn.textContent = t('▲ CLOSE');

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
          // Skill + engId travel via escH-escaped data attributes read back with getAttribute
          // (never interpolated into the JS of the handler) — the old inline-IIFE form embedded
          // [data-repl-eng=\"id\"], whose \" closed the double-quoted onclick attribute early and
          // threw SyntaxError on click. data-skill also keeps user-authored skill names XSS-safe.
          return '<button data-repl-skill="'+escH(s)+'" data-repl-for="'+engId+'"'
            + ' onclick="_replToggleSkill(this)" '
            + 'style="font-family:IBM Plex Mono,monospace;font-size:9px;padding:2px 7px;'
            + 'border-radius:10px;cursor:pointer;border:1px solid '+(active?'var(--accent)':'var(--border)')+';'
            + 'background:'+(active?'rgba(200,241,53,.15)':'var(--bg)')+';'
            + 'color:'+(active?'var(--accent)':'var(--muted)')+';">'
            + escH(s) + '</button>';
        }).join('')
      + '</div></div>'
    : '';

  // ── Panel HTML ────────────────────────────────────────────────────
  var h = '<div id="dash-repl-panel-'+engId+'" class="dash-repl-panel" style="margin-top:8px;padding:10px;'
    + 'background:var(--surface);border:1px solid var(--border);border-radius:6px;'
    + 'border-top:2px solid var(--danger)">'
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

  // Insert: into the shared host (▤ By-project table view) or after the button's card.
  // The panel carries grid-column:1/-1 so it spans full width when inserted into the
  // .db-util-grid CSS grid (afterend of a .db-ucard) instead of squishing into one cell.
  if (host) {
    host.innerHTML = h;   // single-open below the project team table
  } else {
    var card = btn.closest('.db-ucard') || btn.closest('.db-conflict') || btn.closest('.kpi-card') || btn.parentElement;
    card.insertAdjacentHTML('afterend', h);
  }

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
