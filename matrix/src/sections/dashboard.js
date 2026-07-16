/* ►► SECTION: DASHBOARD ◄◄ Resource dashboard: KPIs, cost charts, utilisation, filters
 *
 * Functions defined in this file:
 *   _dashMonths        — returns the full month range for dashboard calculations
 *   _buildCostMaps     — computes project cost maps with optional engineer/project filters
 *   renderResDashboard — renders the full resource dashboard: KPIs, charts, utilisation grid, financial analysis
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
  filtered.forEach(function(r){
    var eng=engById.get(r.engId);if(!eng||!_costCounts(eng))return;
    var cost=months.reduce(function(s,m){return s+(r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);},0);
    if(r.projectId){projCost[r.projectId]=(projCost[r.projectId]||0)+cost;}
    else{unassignedCost+=cost;}
    totalCost+=cost;
  });
  return {projCost:projCost,totalCost:totalCost,unassignedCost:unassignedCost,filteredRows:filtered};
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

// Renders the full resource dashboard: KPI cards, monthly cost/FTE chart, cost by project, utilisation grid, financial analysis.
export function renderResDashboard(){
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
  var projCost=cm.projCost,totalCost=cm.totalCost,unassignedCost=cm.unassignedCost,filteredRows=cm.filteredRows;
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

  // ── Financial totals: TEAM COST = ALLOCATED + UNALLOCATED ──────
  // Hoisted so the header can lead with allocation efficiency (the meaningful
  // "how much of what we pay is reaching projects" number) instead of the old
  // calendar-driven "budget consumed". The Financial Analysis section below
  // reuses these exact values — single source, so headline and detail never diverge.
  var _finMonths=months, _nMonths=months.length;
  // A month drops out of salary/period cost only when the engineer is fully
  // medical/resigned that month (status m/r AND no working allocation) — a single
  // 'm' row on one project must not zero a real allocation on another.
  function _monthInactive(eu,m){
    var s=eu.monthStatus&&eu.monthStatus[m];
    return (s==='m'||s==='r')&&(eu.monthAllocs[m]||0)===0;
  }
  var _teamCostIncl=0, _allocCostTotal=0, _noCostWarnings=[];
  Object.values(engUtil).forEach(function(eu){
    var mc=eu.eng.monthlyCost||0;
    if(_finExclude.has(eu.eng.id)||(eu.eng.planningOnly&&!eu.eng.includeInCost)||eu.eng.excludeFromCalc)return;
    if(!mc)_noCostWarnings.push(eu.eng.name);
    _finMonths.forEach(function(m){
      if(_monthInactive(eu,m))return;
      _teamCostIncl+=mc;
      _allocCostTotal+=Math.min(eu.monthAllocs[m]||0,1)*mc;
    });
  });
  var _unallocCost=Math.max(0,_teamCostIncl-_allocCostTotal);
  var _allocPct=_teamCostIncl>0?Math.round(_allocCostTotal/_teamCostIncl*100):0;
  var _unallocPct=100-_allocPct;

  // Monthly peaks
  var moCosts=months.map(function(m){return filteredRows.reduce(function(s,r){
    var eng=engById.get(r.engId);
    return s+(eng&&_costCounts(eng)&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);
  },0);});
  var peakCostIdx=moCosts.indexOf(Math.max(...moCosts));
  var peakMonth=months[peakCostIdx]||curInRange;

  // SPOF count from skill data
  var skillMap=buildSkillMap();
  var spofSkills=Object.values(skillMap).filter(function(sm){return sm.holders.length===1&&sm.cat==='crit';});
  var spofEngIds=new Set(spofSkills.map(function(sm){return sm.holders[0].eng.id;}));

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
   +'<div class="db-tb-actions">'
   +'<button class="sm" onclick="showResTab(\'timeline\')" style="border-color:#5be5c8;color:#5be5c8">'+t('⊟ TIMELINE')+'</button>'
   +'<button class="sm" onclick="showResTab(\'development\')" style="border-color:#c8f135;color:#c8f135">'+t('★ TEAM DEVELOPMENT')+'</button>'
   +'<button class="sm" onclick="exportDashboardPDF()" style="border-color:var(--accent2);color:var(--accent2)">&#8595; PDF</button>'
   +'</div></div>';

  // ── Hero band: total plan cost + allocation efficiency ─────────
  var _dbEur=function(v){v=v||0;return v>=1e6?(v/1e6).toFixed(2)+'M€':Math.round(v/1000)+'k€';};
  var _peakCost=moCosts[peakCostIdx]||0;
  // hero cost area-sparkline over the monthly cost series
  var _hsMax=Math.max.apply(null,moCosts.concat([1])),_hsW=600,_hsH=50;
  var _hsPts=moCosts.map(function(v,i){return [(moCosts.length>1?i/(moCosts.length-1):0)*_hsW,(_hsH-(v/_hsMax)*(_hsH-6)-2)];});
  var _hsArea='M0,'+_hsH+' '+_hsPts.map(function(p){return 'L'+p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' ')+' L'+_hsW+','+_hsH+' Z';
  var _hsLine='M'+_hsPts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L');
  h+='<div class="db-hero">'
   +'<div class="db-card db-hero-cost">'
   +'<div>'
   +'<div class="db-eyebrow">'+t('TOTAL PLAN COST')+' · '+t('{n} months',{n:months.length})+'</div>'
   +'<div class="db-hero-big">'+_dbEur(totalCost)+'</div>'
   +'<div class="db-hero-sub">'+t('Peak')+' <b>'+_dbEur(_peakCost)+'</b> · '+peakMonth+' · <b>'+projStaffedCount+'/'+projects.length+'</b> '+t('projects staffed')+'</div>'
   +(unassignedCost>0?'<div class="db-warnpill">&#9888; '+_dbEur(unassignedCost)+' '+t('unassigned to a project')+'</div>':'')
   +'</div>'
   +'<svg class="db-hero-spark" viewBox="0 0 '+_hsW+' '+_hsH+'" preserveAspectRatio="none" aria-hidden="true"><path d="'+_hsArea+'" fill="var(--accent)" opacity="0.16"/><path d="'+_hsLine+'" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.6"/></svg>'
   +'</div>'
   +'<div class="db-card db-gauge">'
   +'<div class="db-gauge-head"><span class="db-eyebrow">'+t('ALLOCATED TO PROJECTS')+'</span><span class="db-gauge-pct">'+_allocPct+'%</span></div>'
   +'<div class="db-gauge-track"><div class="db-gauge-fill" style="width:'+_allocPct+'%"></div><div class="db-gauge-rest"></div></div>'
   +'<div class="db-gauge-legend"><span><b>'+_dbEur(_allocCostTotal)+'</b> '+t('on projects')+'</span><span>'+t('of')+' <b>'+_dbEur(_teamCostIncl)+'</b> '+t('team cost')+'</span></div>'
   +'<div class="db-gauge-legend" style="margin-top:-4px"><span class="db-muted">'+t('the rest is bench / overhead')+'</span></div>'
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
   +'<div class="db-stat-d">'+t('Unallocated this month')+(_unallocCost>0?' · '+_dbEur(_unallocCost)+' '+t('idle'):'')+'</div>'
   +(benchCount>0?'<span class="db-chip db-chip--info">'+benchEngs.map(function(eu){return escH(eu.name.split(' ')[0]);}).slice(0,3).join(', ')+(benchCount>3?'…':'')+'</span>':'')+'</div>'
   +'<div class="db-stat'+(spofSkills.length?' db-stat--warn':'')+'"><span class="db-sev"></span>'
   +'<div class="db-stat-v"'+(spofSkills.length?'':' style="color:var(--accent)"')+'>'+spofSkills.length+'</div><div class="db-stat-k">'+t('CRITICAL SPOF SKILLS')+'</div>'
   +'<div class="db-stat-d">'+t('Single-person critical skills')+'</div>'
   +(spofSkills.length?'<a class="db-chip db-chip--warn" onclick="showResTab(\'skillrisk\')" style="cursor:pointer;text-decoration:none">'+t('view risk tab')+' →</a>':'')+'</div>'
   +'</div>';

  // ── Monthly cost & FTE chart ───────────────────────────────────
  var maxMoCost=Math.max(...moCosts,1);
  // Monthly FTE demand (same counted population as the cost bars)
  var moFte=months.map(function(m){
    var byE={};
    filteredRows.forEach(function(r){
      if(!r.engId)return;
      var eng=engById.get(r.engId);if(!eng||!_costCounts(eng))return;
      var v=r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0;
      byE[r.engId]=(byE[r.engId]||0)+v;
    });
    return Object.values(byE).reduce(function(s,v){return s+Math.min(v,1);},0);
  });
  var maxFte=Math.max(...moFte,1);
  var curIdx=months.indexOf(cur);
  // geometry — faint grid, cost bars (past/current/future), single FTE line
  var _pL=44,_pR=16,_pT=14,_pB=26,_chH=130;
  var _slot=Math.max(26,Math.min(64,Math.floor((880-_pL-_pR)/months.length)));
  var _chW=_pL+_pR+_slot*months.length,_bw=Math.round(_slot*0.5);
  var _innerH=_chH-_pT-_pB,_baseY=_chH-_pB;
  var svg='';
  for(var _g=0;_g<=3;_g++){
    var _gy=_pT+_innerH*_g/3, _gv=Math.round(maxMoCost*(1-_g/3)/1000);
    svg+='<line x1="'+_pL+'" y1="'+_gy.toFixed(1)+'" x2="'+(_chW-_pR)+'" y2="'+_gy.toFixed(1)+'" stroke="var(--border)" stroke-width="'+(_g===3?1:0.6)+'" opacity="'+(_g===3?1:0.5)+'"/>'
      +'<text x="'+(_pL-8)+'" y="'+(_gy+3).toFixed(1)+'" text-anchor="end" font-size="9" fill="var(--dim)" font-family="IBM Plex Mono,monospace">'+_gv+'k</text>';
  }
  moCosts.forEach(function(v,i){
    var bh=Math.round(v/maxMoCost*_innerH), x=_pL+_slot*i+(_slot-_bw)/2, y=_baseY-bh;
    var isCur=i===curIdx, isPast=curIdx>=0&&i<curIdx;
    svg+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+_bw+'" height="'+bh+'" rx="2" fill="'+(isCur?'var(--accent)':'var(--accent2)')+'" opacity="'+(isCur?0.95:isPast?0.55:0.28)+'"/>';
    if(months[i].endsWith('-01')||i===0||months.length<=12)
      svg+='<text x="'+(_pL+_slot*i+_slot/2).toFixed(1)+'" y="'+(_chH-9)+'" text-anchor="middle" font-size="8.5" fill="'+(isCur?'var(--accent)':'var(--dim)')+'" font-family="IBM Plex Mono,monospace">'+(months.length<=12?months[i].slice(5):months[i].slice(0,4))+'</text>';
  });
  var _fpts=moFte.map(function(v,i){return [_pL+_slot*i+_slot/2, _baseY-(v/maxFte)*_innerH];});
  svg+='<path d="M'+_fpts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join(' L')+'" fill="none" stroke="var(--warn)" stroke-width="1.8" opacity="0.85" stroke-linejoin="round"/>';
  _fpts.forEach(function(p,i){ svg+='<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(i===curIdx?3.6:2)+'" fill="'+(i===curIdx?'var(--warn)':'var(--bg)')+'" stroke="var(--warn)" stroke-width="1.4"/>'; });
  h+='<div class="db-sec"><div class="db-sec-title">'+t('MONTHLY COST &amp; FTE')
   +'<span class="db-spacer"></span><span class="db-legend">'
   +'<i><span class="db-swatch" style="background:var(--accent2)"></span>'+t('Cost')+'</i>'
   +'<i><span class="db-swatch" style="background:var(--accent)"></span>'+t('Current month')+'</i>'
   +'<i><span class="db-swatch" style="background:var(--warn)"></span>'+t('FTE demand')+'</i>'
   +'</span></div>'
   +'<div class="db-card db-chart-card" style="overflow-x:auto"><svg class="db-chart" viewBox="0 0 '+_chW+' '+_chH+'" width="'+_chW+'" height="'+_chH+'" role="img" aria-label="'+t('Monthly cost bars with FTE demand line')+'">'+svg+'</svg></div></div>';

  // ── Cost by project ────────────────────────────────────────────
  h+='<div class="db-sec"><div class="db-sec-title">'+t('COST BY PROJECT')+' <span class="db-hint">'+t('(by section)')+'</span></div>';
  var secGrouped={};
  Object.entries(projCost).forEach(function(kv){
    var pid=kv[0],cost=kv[1];
    var p=projects.find(function(p){return p.id===+pid;});if(!p)return;
    var sec=sections.find(function(s){return s.id===p.sectionId;});
    var grp=sec?sec.name:'Unsectioned';
    var grpColor=sec?sec.color:'var(--muted)';
    if(!secGrouped[grp])secGrouped[grp]={color:grpColor,rows:[]};
    secGrouped[grp].rows.push({p:p,cost:cost});
  });
  var _secKeys=Object.keys(secGrouped).sort(function(a,b){return a==='Unsectioned'?1:b==='Unsectioned'?-1:a.localeCompare(b);});
  _secKeys.forEach(function(grpName){
    var g=secGrouped[grpName];
    var grpTotal=g.rows.reduce(function(s,r){return s+r.cost;},0);
    var isOpen=!!_dashSectorOpen[grpName];
    var safeId='dsec_'+grpName.replace(/[^a-zA-Z0-9]/g,'_');
    h+='<div class="db-group">';
    h+='<div class="db-group-head'+(isOpen?' db-open':'')
      +'" onclick="toggleDashSector(this.dataset.grp,this.dataset.sid)" data-grp="'+escH(grpName)+'" data-sid="'+safeId+'">'
      +'<span class="db-group-arrow" id="dsec-arrow-'+safeId+'">'+(isOpen?'▼':'▶')+'</span>'
      +'<span class="db-dot" style="background:'+g.color+'"></span>'
      +'<span class="db-group-name">'+escH(grpName==='Unsectioned'?t('Unsectioned'):grpName)+'</span>'
      +'<span class="db-group-meta">'+t('{n} project(s)',{n:g.rows.length})+'</span>'
      +'<span class="db-group-total">'+Math.round(grpTotal/1000)+'k€</span>'
      +'</div>';
    h+='<div id="'+safeId+'" style="display:'+(isOpen?'block':'none')+'">'
      +'<table class="db-table"><thead><tr>'
      +'<th>'+t('PROJECT')+'</th><th>'+t('COST')+'</th><th>%</th>'
      +'<th>'+t('FTE PEAK')+'</th><th>'+t('MONTHLY')+'</th>'
      +'</tr></thead><tbody>';
    g.rows.sort(function(a,b){return b.cost-a.cost;}).forEach(function(row){
      var p=row.p,cost=row.cost;
      var pct=totalCost?Math.round(cost/totalCost*100):0;
      var projRows=allocRows.filter(function(r){return r.projectId===p.id;});
      var monthFtes=months.map(function(m){return projRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);});
      var peakFte=Math.max.apply(null,monthFtes.concat([0]));
      var monthCosts=months.map(function(m){return projRows.reduce(function(s,r){
        var eng=engById.get(r.engId);
        return s+(eng&&_costCounts(eng)&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);
      },0);});
      var spark=_dbSparkBars(monthCosts,{w:110,h:16,curIdx:curIdx});
      var statusBadge='';
      if(p.currentGate)statusBadge+=' <span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(120,120,140,.12);color:var(--muted)">'+escH(p.currentGate)+'</span><span style="font-size:8px;color:var(--muted)"> →</span>';
      if(p.gate)statusBadge+=' <span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(200,241,53,.1);color:var(--accent)">'+escH(p.gate)+'</span>';
      if(p.status)statusBadge+=' <span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(200,241,53,.1);color:var(--accent)">'+escH(p.status)+'</span>';
      h+='<tr>'
       +'<td><span class="db-pname"><span class="db-dot" style="background:'+(p.color||'var(--muted)')+'"></span><span style="color:'+p.color+'">'+escH(p.name)+'</span></span>'+statusBadge+'</td>'
       +'<td class="db-money">'+Math.round(cost/1000)+'k€</td>'
       +'<td class="db-muted">'+pct+'%</td>'
       +'<td class="db-num" style="color:var(--accent2)">'+peakFte.toFixed(1)+'</td>'
       +'<td>'+spark+'</td>'
       +'</tr>';
    });
    h+='</tbody></table></div></div>';
  });
  h+='</div>';


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
     +'<span class="db-dot" style="background:'+ug.color+'"></span>'
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
      var col=isOver?'var(--danger)':isBench?'var(--accent2)':pct>80?'var(--accent)':'var(--accent2)';
      var cls=isOver?' db-ucard--over':isBench?' db-ucard--bench':isSpof?' db-ucard--spof':'';
      var emv=months.map(function(m){return eu.monthAllocs&&eu.monthAllocs[m]?eu.monthAllocs[m]:0;});
      var eSpark=_dbSparkBars(emv,{w:88,h:18,curIdx:curIdx,overMax:1.005,overColor:'var(--danger)'});
      var totalCostEng=eu.totAlloc*(eu.cost||0);
      h+='<div class="db-ucard'+cls+'">'
       +'<div class="db-uname">'+escH(eu.name)
       +(isOver?'<span class="db-tag db-tag--over">&#9888; '+t('OVER')+'</span>':'')
       +(isBench?'<span class="db-tag db-tag--bench">'+t('BENCH')+'</span>':'')
       +(isSpof?'<span class="db-tag db-tag--spof">SPOF</span>':'')
       +'</div>'
       +'<div class="db-urole">'+(eu.role?escH(eu.role):'')+(eu.role&&eu.loc?' · ':'')+escH(eu.loc||'')+'</div>'
       +'<div class="db-upct" style="color:'+col+'">'+pct+'%</div>'
       +'<div class="db-umeta">'+t('avg active')+' · '+utilPct+'% '+t('full period')+'</div>'
       +'<div style="margin-top:6px">'+eSpark+'</div>'
       +(isOver?'<div class="db-umeta" style="color:var(--danger)">&#9888; '+t('Over:')+' '+eu.overMonths.slice(0,3).map(function(m){return m.slice(0,7);}).join(', ')+(eu.overMonths.length>3?'…':'')+'</div>':'')
       +'<div class="db-umeta">'+Math.round(totalCostEng/1000)+'k€ '+t('total')+' · '+eu.activeMonths+'/'+eu.months+' '+t('mo')+'</div>'
       +(isOver?'<button class="db-ubtn" onclick="showDashReplacements('+eu.eng.id+',this)">&#128270; '+t('FIND REPLACEMENTS')+'</button>':'')
       +'</div>';
    });
    h+='</div></div>';
  }
  h+='</div>';


  // ── Project spending detail (collapsible) ─────────────────────────
  var _pdOpen = _dashProjDetailOpen;
  h += '<div class="db-sec">'
    + '<div class="db-sec-title" style="cursor:pointer"'
    + ' onclick="(function(el){_dashProjDetailOpen=!_dashProjDetailOpen;'
    + 'var s=document.getElementById(\'dash-proj-detail\');'
    + 'if(s){s.style.display=_dashProjDetailOpen?\'block\':\'none\';}'
    + 'el.querySelector(\'.dash-pd-arrow\').textContent=_dashProjDetailOpen?\'▼\':\'▶\';})(this)">'
    + '<span class="dash-pd-arrow">' + (_pdOpen ? '▼' : '▶') + '</span> '+t('PROJECT SPENDING DETAIL')
    + ' <span class="db-hint">— '+t('cost &amp; resources per project')+' · ' + t('{n} months',{n:months.length}) + '</span>'
    + '</div>'
    + '<div id="dash-proj-detail" style="display:' + (_pdOpen ? 'block' : 'none') + '">';

  var _projDetail = Object.entries(projCost)
    .map(function(kv) {
      var pid = +kv[0], cost = kv[1];
      var p = projects.find(function(p){ return p.id === pid; });
      if (!p) return null;
      var _rows = filteredRows.filter(function(r){ return r.projectId === pid && r.engId && _costCounts(engById.get(r.engId)); });
      var _engMap = {};
      _rows.forEach(function(r) {
        if (!_engMap[r.engId]) _engMap[r.engId] = { fte: {}, eng: engById.get(r.engId) };
        months.forEach(function(m) {
          _engMap[r.engId].fte[m] = (_engMap[r.engId].fte[m] || 0) + (r.allocs && r.allocs[m] != null ? _allocNum(r.allocs[m]) : 0);
        });
      });
      var _resources = Object.values(_engMap).filter(function(x){ return x.eng; }).map(function(x) {
        var totalFte = months.reduce(function(s, m){ return s + (x.fte[m] || 0); }, 0);
        var peakFte  = Math.max.apply(null, months.map(function(m){ return x.fte[m] || 0; }).concat([0]));
        var engCost  = months.reduce(function(s, m){ return s + (x.fte[m] || 0) * (x.eng.monthlyCost || 0); }, 0);
        var eg = engGroups.find(function(g){ return g.id === x.eng.groupId; });
        return { eng: x.eng, fte: x.fte, totalFte: totalFte, peakFte: peakFte, cost: engCost, grpColor: eg ? eg.color : 'var(--muted)' };
      }).sort(function(a, b){ return b.cost - a.cost; });
      return { p: p, cost: cost, resources: _resources };
    })
    .filter(Boolean)
    .sort(function(a, b){ return b.cost - a.cost; });

  if (!_projDetail.length) {
    h += '<div style="padding:16px;text-align:center;color:var(--muted);font-family:var(--db-mono);font-size:11px">'+t('No project allocation data in selected period.')+'</div>';
  }

  _projDetail.forEach(function(pd) {
    var p = pd.p, pct = totalCost ? Math.round(pd.cost / totalCost * 100) : 0;
    var _moCosts = months.map(function(m) {
      return pd.resources.reduce(function(s, r){ return s + (r.fte[m] || 0) * (r.eng.monthlyCost || 0); }, 0);
    });
    var spark = _dbSparkBars(_moCosts, {w:160,h:20,curIdx:curIdx,minBar:1});

    h += '<div class="db-group" style="border-left:3px solid ' + (p.color || 'var(--muted)') + '">';

    h += '<div class="db-group-head" style="cursor:default;flex-wrap:wrap">'
      + '<span class="db-group-name" style="color:var(--text);font-weight:600;font-size:11px">' + escH(p.name) + '</span>'
      + (p.currentGate ? '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(120,120,140,.12);color:var(--muted);font-family:var(--db-mono)">' + escH(p.currentGate) + ' →</span>' : '')
      + (p.gate ? '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(200,241,53,.08);color:var(--accent);font-family:var(--db-mono)">' + escH(p.gate) + '</span>' : '')
      + '<span style="flex:1"></span>'
      + '<span class="db-group-total">' + Math.round(pd.cost/1000) + 'k€</span>'
      + '<span class="db-group-meta">' + pct + '% '+t('of total')+'</span>'
      + spark
      + '</div>';

    if (pd.resources.length) {
      h += '<table class="db-table"><thead><tr>'
        + '<th>'+t('RESOURCE')+'</th><th style="text-align:left">'+t('GROUP')+'</th><th>'+t('PEAK FTE')+'</th>'
        + '<th>'+t('FTE·MO')+'</th><th>'+t('COST')+'</th><th>'+t('SHARE')+'</th>'
        + '</tr></thead><tbody>';

      pd.resources.forEach(function(r, i) {
        var share = pd.cost ? Math.round(r.cost / pd.cost * 100) : 0;
        var eg = engGroups.find(function(g){ return g.id === r.eng.groupId; });
        h += '<tr>'
          + '<td style="font-weight:600">' + escH(r.eng.name)
          + (r.eng.role ? '<span style="font-weight:400;color:var(--muted);font-size:9px"> · ' + escH(r.eng.role) + '</span>' : '')
          + '</td>'
          + '<td style="text-align:left"><span style="font-size:9px;color:' + r.grpColor + '">' + escH(eg ? eg.name : '—') + '</span></td>'
          + '<td class="db-num" style="color:var(--accent2)">' + r.peakFte.toFixed(1) + '</td>'
          + '<td class="db-num db-muted">' + r.totalFte.toFixed(1) + '</td>'
          + '<td class="db-num" style="font-weight:600">' + Math.round(r.cost/1000) + 'k€</td>'
          + '<td><div class="db-share-cell"><div class="db-share-bar"><i style="width:' + share + '%;background:' + (p.color||'var(--accent)') + '"></i></div><span class="db-muted" style="min-width:26px">' + share + '%</span></div></td>'
          + '</tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<div style="padding:8px 12px;font-size:9px;color:var(--muted);font-family:var(--db-mono)">'+t('No named resources in selected period.')+'</div>';
    }
    h += '</div>';
  });

  h += '</div></div>';


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
      h+='<button class="db-ubtn" onclick="showDashReplacements('+eu.eng.id+',this)">🔍 '+t('FIND REPLACEMENTS')+'</button>';
      h+='</div>';
    });
    h+='</div></div>';
  }


  // ── Financial analysis: team cost vs project allocation ─────────
  // Totals (_teamCostIncl / _allocCostTotal / _unallocCost / _allocPct /
  // _unallocPct / _noCostWarnings / _monthInactive) are computed once up top and
  // reused here, so this section and the header hero never diverge.

  h += '<div class="db-sec"><div class="db-sec-title">'+t('FINANCIAL ANALYSIS')
    + ' <span class="db-hint">— '+t('{n} months',{n:_nMonths})+' · '+t('{n} engineers',{n:Object.values(engUtil).length})
    + (_finExclude.size ? ' · '+t('{n} excluded',{n:_finExclude.size}) : '')
    + '</span></div>';

  // Warnings
  if (_noCostWarnings.length) {
    h += '<div style="margin-bottom:10px;padding:8px 12px;background:rgba(241,164,53,.08);'
      + 'border:1px solid rgba(241,164,53,.3);border-radius:6px;display:flex;align-items:flex-start;gap:8px">'
      + '<span style="font-size:14px;flex-shrink:0">⚠</span>'
      + '<div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:#f1a435;margin-bottom:3px">'+t('MISSING COST DATA')+'</div>'
      + '<div style="font-size:10px;color:var(--muted)">'
      + escH(_noCostWarnings.join(', '))
      + ' '+t('— no monthly cost set. Excluded from calculation.')+'</div>'
      + '</div></div>';
  }

  // KPI row — a clean reconciliation identity: TEAM COST = ALLOCATED + UNALLOCATED.
  // (The uncapped per-project attribution total is the top "TOTAL PLAN COST" card;
  // it is NOT repeated here because, unlike ALLOCATED, it is not capped at 1 FTE and
  // so would not satisfy this identity. See ARCHITECTURE.md › Cost model.)
  h += '<div class="db-ident">';
  [
    { val: _dbEur(_teamCostIncl),   label: t('TEAM COST PERIOD'), sub: t('{n} mo × salaries',{n:_nMonths}),   col: 'var(--accent2)' },
    { val: _dbEur(_allocCostTotal), label: t('ALLOCATED TO PROJ'), sub: _allocPct + '% '+t('of team cost'),     col: 'var(--accent)' },
    { val: _dbEur(_unallocCost),    label: t('UNALLOCATED'),       sub: _unallocPct + '% '+t('bench / overhead'), col: _unallocPct > 30 ? 'var(--warn)' : 'var(--muted)' },
  ].forEach(function(k) {
    h += '<div class="db-ident-box">'
      + '<div class="db-ib-v" style="color:' + k.col + '">' + k.val + '</div>'
      + '<div class="db-ib-k">' + k.label + '</div>'
      + '<div class="db-ib-d">' + k.sub + '</div>'
      + '</div>';
  });
  h += '</div>';

  // Allocation bar (TEAM COST = ALLOCATED + UNALLOCATED)
  h += '<div style="margin-bottom:14px">'
    + '<div class="db-identbar-legend"><span>'+t('Allocated to projects:')+' <b>' + _allocPct + '%</b></span><span>'+t('Unallocated:')+' <b>' + _unallocPct + '%</b></span></div>'
    + '<div class="db-identbar"><div class="db-ib-a" style="width:' + _allocPct + '%"></div><div class="db-ib-b"></div></div>'
    + '</div>';

  // Per-engineer breakdown
  var _finRows = Object.values(engUtil)
    .sort(function(a, b) { return (b.eng.monthlyCost||0) - (a.eng.monthlyCost||0); });

  h += '<div class="db-table-card"><table class="db-table">'
    + '<thead><tr>'
    + '<th>'+t('ENGINEER')+'</th><th>'+t('MONTHLY')+'</th><th>'+t('PERIOD COST')+'</th>'
    + '<th>'+t('ALLOC COST')+'</th><th>'+t('% ALLOC')+'</th><th style="text-align:center">'+t('EXCLUDE')+'</th>'
    + '</tr></thead><tbody>';

  _finRows.forEach(function(eu, i) {
    var mc = eu.eng.monthlyCost || 0;
    var excl = _finExclude.has(eu.eng.id);
    var engExcluded = eu.eng.excludeFromCalc;
    var _activeMoEng = _finMonths.filter(function(m){ return !_monthInactive(eu,m); }).length;
    var periodCost = mc * _activeMoEng;
    var allocCostEng = _finMonths.reduce(function(s, m) {
      return s + Math.min(eu.monthAllocs[m] || 0, 1) * mc;
    }, 0);
    var allocPctEng = periodCost > 0 ? Math.round(allocCostEng / periodCost * 100) : 0;
    var eg = engGroups.find(function(g){ return g.id === eu.eng.groupId; });
    h += '<tr style="' + ((excl||engExcluded) ? 'opacity:.4' : '') + '">'
      + '<td><span style="font-weight:600;color:' + (engExcluded?'var(--muted)':'var(--text)') + '">' + escH(eu.eng.name) + '</span>'
      + (engExcluded ? '<span style="font-size:9px;color:var(--warn);margin-left:6px">⊘ '+t('excluded')+'</span>' : '')
      + (eg ? '<span style="font-size:9px;color:' + eg.color + ';margin-left:6px">' + escH(eg.name) + '</span>' : '')
      + (!mc ? '<span style="font-size:9px;color:var(--warn);margin-left:6px">⚠ '+t('no cost')+'</span>' : '')
      + '</td>'
      + '<td class="db-num db-muted">' + (mc ? mc.toLocaleString() + '€' : '—') + '</td>'
      + '<td class="db-num" style="font-weight:600">' + (periodCost ? Math.round(periodCost/1000) + 'k€' : '—') + '</td>'
      + '<td class="db-num" style="color:var(--accent)">' + (allocCostEng ? Math.round(allocCostEng/1000) + 'k€' : '—') + '</td>'
      + '<td>' + (mc ? '<div class="db-share-cell"><div class="db-share-bar"><i style="width:' + Math.min(allocPctEng,100) + '%;background:' + (allocPctEng < 50 ? 'var(--warn)' : 'var(--accent)') + '"></i></div><span class="db-muted" style="min-width:28px">' + allocPctEng + '%</span></div>' : '—') + '</td>'
      + '<td style="text-align:center">'
      + '<input type="checkbox" ' + (excl ? 'checked' : '') + ' '
      + 'onchange="(function(id,cb){if(cb.checked)_finExclude.add(id);else _finExclude.delete(id);saveState();clearTimeout(window._finDebounce);window._finDebounce=setTimeout(renderResDashboard,200);})('+eu.eng.id+',this)" '
      + 'style="accent-color:var(--muted);cursor:pointer" title="'+t('Exclude from financial totals')+'">'
      + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';
  h += '</div>';

  // ── Transfer costs + actions ───────────────────────────────────
  h+='<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
   +'<button class="primary" onclick="transferPlanCosts()">&#8658; '+t('TRANSFER PLAN COSTS TO PROJECTS')+'</button>'
   +'<span style="font-size:11px;color:var(--muted)">'+t('Updates each project cost field from the resource plan.')+'</span>'
   +'</div>';

  body.innerHTML=h;
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
  var title=(G('res-title-input')?G('res-title-input').value:'Resource Plan')+' — Dashboard';
  var dateStr=new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});

  // Pull the live db-* class rules from the page so the print window renders the
  // real design. With print-tuned :root tokens below, every var(--…) reference
  // (inline styles, SVG fills AND these classes) resolves to a print-legible
  // colour — no more brittle regex colour-swapping of the markup.
  var dbRules='';
  try{
    [].forEach.call(document.styleSheets,function(ss){
      var rules; try{ rules=ss.cssRules; }catch(e){ return; }
      if(!rules) return;
      [].forEach.call(rules,function(r){
        if(r.selectorText && r.selectorText.indexOf('.db-')>=0) dbRules+=r.cssText+'\n';
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
    // static print: drop interactive controls, un-clip the scrollable chart
    +'.db-toolbar,button,select,input[type=range],input[type=checkbox]{display:none!important}'
    +'.db-chart-card{overflow:visible!important}'
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
    +(engDashFilterEng&&engDashFilterEng.size?' · Engineer: '+escH([...engDashFilterEng].join(', ')):'')
    +(engDashFilterProj&&engDashFilterProj.size?' · Project: '+escH([...engDashFilterProj].join(', ')):'')
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
    var key = _nineBoxPlacements[e.id];
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
