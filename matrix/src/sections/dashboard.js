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
    var eng=engById.get(r.engId);if(!eng)return;
    var cost=months.reduce(function(s,m){return s+(r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);},0);
    if(r.projectId){projCost[r.projectId]=(projCost[r.projectId]||0)+cost;}
    else{unassignedCost+=cost;}
    totalCost+=cost;
  });
  return {projCost:projCost,totalCost:totalCost,unassignedCost:unassignedCost,filteredRows:filtered};
}

// Renders the full resource dashboard: KPI cards, monthly cost/FTE chart, cost by project, utilisation grid, financial analysis.
export function renderResDashboard(){
  var body=G('res-body');if(!body)return;
  var months=_dashMonths();
  var cur=_dashCur();

  if(!months.length){
    body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:200px;flex-direction:column;gap:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px"><div style="font-size:28px">📅</div><div>'+t('Set FROM and TO dates in the header to see the dashboard')+'</div></div>';
    return;
  }

  var cm=_buildCostMaps(months,engDashFilterEng,engDashFilterProj);
  var projCost=cm.projCost,totalCost=cm.totalCost,unassignedCost=cm.unassignedCost,filteredRows=cm.filteredRows;
  var engUtil=_buildEngUtil(months);

  // FTE calcs
  var fteByEng={};
  filteredRows.forEach(function(r){
    if(!r.engId)return;
    var v=r.allocs&&r.allocs[cur]!=null?_allocNum(r.allocs[cur]):0;
    fteByEng[r.engId]=(fteByEng[r.engId]||0)+v;
  });
  var fteCur=Object.values(fteByEng).reduce(function(s,v){return s+Math.min(v,1);},0);
  var fteRaw=Object.values(fteByEng).reduce(function(s,v){return s+v;},0);

  var overCount=Object.values(engUtil).filter(function(eu){return eu.overMonths.length>0;}).length;
  var allocatedEngCount=Object.keys(fteByEng).length;
  var projStaffedCount=Object.keys(projCost).length;
  var totalActiveEngs=engineers.filter(function(e){return !e.vacant&&!e.planningOnly&&!e.excludeFromCalc;}).length;

  // Bench = engineers with zero allocation this month
  var benchEngs=Object.values(engUtil).filter(function(eu){return eu.curAlloc===0;});
  var benchCount=benchEngs.length;

  // Avg team utilisation over full period
  var avgUtil=totalActiveEngs>0
    ?(Object.values(engUtil).reduce(function(s,eu){return s+eu.utilizationRate;},0)/totalActiveEngs*100).toFixed(0)
    :0;

  // Budget burn: cost spent so far (months <= cur)
  var pastMonths=months.filter(function(m){return m<=cur;});
  var burnCost=filteredRows.reduce(function(s,r){
    var eng=engineers.find(function(e){return e.id===r.engId;});if(!eng)return s;
    return s+pastMonths.reduce(function(ss,m){return ss+(r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);},0);
  },0);
  var burnPct=totalCost>0?Math.round(burnCost/totalCost*100):0;

  // Monthly peaks
  var moCosts=months.map(function(m){return filteredRows.reduce(function(s,r){
    var eng=engineers.find(function(e){return e.id===r.engId;});
    return s+(eng&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);
  },0);});
  var peakCostIdx=moCosts.indexOf(Math.max(...moCosts));
  var peakMonth=months[peakCostIdx]||cur;

  // SPOF count from skill data
  var skillMap=buildSkillMap();
  var spofSkills=Object.values(skillMap).filter(function(sm){return sm.holders.length===1&&sm.cat==='crit';});
  var spofEngIds=new Set(spofSkills.map(function(sm){return sm.holders[0].eng.id;}));

  var h='';

  // ── Filter bar ─────────────────────────────────────────────────
  var allEngNames=[...new Set(allocRows.map(function(r){var e=engineers.find(function(e){return e.id===r.engId;});return e?e.name:null;}).filter(Boolean))].sort();
  var allProjNames=[...new Set(allocRows.map(function(r){var p=projects.find(function(p){return p.id===r.projectId;});return p?p.name:null;}).filter(Boolean))].sort();
  var sel1Style='background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;outline:none';
  var clearBtn=(engDashFilterEng.size||engDashFilterProj.size)?'<button class="sm" onclick="engDashFilterEng=new Set();engDashFilterProj=new Set();renderResDashboard()">&#215; '+t('CLEAR')+'</button>':'';
  h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px">'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">'+t('FILTER:')+'</span>'
   +multiSelectHTML('dash-eng',allEngNames,engDashFilterEng,'onDashFilterEngChange',t('Engineers'))
   +multiSelectHTML('dash-proj',allProjNames,engDashFilterProj,'onDashFilterProjChange',t('Projects'))
   +clearBtn
   +'<div style="margin-left:auto;display:flex;gap:6px">'
   +'<button class="sm" onclick="showResTab(\'timeline\')" style="border-color:#5be5c8;color:#5be5c8">'+t('⊟ TIMELINE')+'</button>'
   +'<button class="sm" onclick="showResTab(\'development\')" style="border-color:#c8f135;color:#c8f135">'+t('★ TEAM DEVELOPMENT')+'</button>'
   +'<button class="sm" onclick="exportDashboardPDF()" style="border-color:var(--accent2);color:var(--accent2)">&#8595; PDF</button>'
   +'</div></div>';

  // ── KPI cards row 1: financial ─────────────────────────────────
  h+='<div class="alloc-kpi-grid" style="margin-bottom:10px">'
   // Total plan cost
   +'<div class="kpi-card"'+(unassignedCost>0?' style="border-color:var(--accent2)"':'')+'>'
   +'<div class="kpi-val">'+Math.round(totalCost/1000)+'k€</div>'
   +'<div class="kpi-label">'+t('TOTAL PLAN COST')+'</div>'
   +'<div class="kpi-sub">'+t('{n} months',{n:months.length})+(unassignedCost>0?'<br><span style="color:var(--accent2)">&#9888; '+Math.round(unassignedCost/1000)+'k€ '+t('unassigned')+'</span>':'')+'</div>'
   +'</div>'
   // Budget burn
   +'<div class="kpi-card" style="'+(burnPct>90?'border-color:var(--danger)':burnPct>60?'border-color:var(--accent2)':'')+'">'
   +'<div class="kpi-val" style="color:'+(burnPct>90?'var(--danger)':burnPct>60?'var(--accent2)':'var(--accent)')+'">'+burnPct+'%</div>'
   +'<div class="kpi-label">'+t('BUDGET CONSUMED')+'</div>'
   +'<div class="kpi-sub">'+Math.round(burnCost/1000)+'k€ '+t('of')+' '+Math.round(totalCost/1000)+'k€ · '+t('past months')+'</div>'
   +'</div>'
   // Peak month
   +'<div class="kpi-card">'
   +'<div class="kpi-val" style="font-size:16px">'+Math.round(Math.max(...moCosts)/1000)+'k€</div>'
   +'<div class="kpi-label">'+t('PEAK MONTH COST')+'</div>'
   +'<div class="kpi-sub">'+peakMonth+'</div>'
   +'</div>'
   // Projects staffed
   +'<div class="kpi-card">'
   +'<div class="kpi-val">'+projStaffedCount+'</div>'
   +'<div class="kpi-label">'+t('PROJECTS STAFFED')+'</div>'
   +'<div class="kpi-sub">'+t('of {n} total projects',{n:projects.length})+'</div>'
   +'</div>'
   +'</div>';

  // ── KPI cards row 2: people ────────────────────────────────────
  h+='<div class="alloc-kpi-grid" style="margin-bottom:14px">'
   // FTE this month
   +'<div class="kpi-card">'
   +'<div class="kpi-val">'+fteCur.toFixed(1)+'</div>'
   +'<div class="kpi-label">'+t('FTE THIS MONTH')+'</div>'
   +'<div class="kpi-sub">'+cur+(fteRaw>fteCur?' · '+t('demand')+' '+fteRaw.toFixed(1):'')+'</div>'
   +'</div>'
   // Team avg utilisation
   +'<div class="kpi-card" style="cursor:pointer" onclick="_availPanel.open=!_availPanel.open;renderResDashboard()" title="'+t('Click to show availability panel')+'">'
   +'<div class="kpi-val" style="color:'+(+avgUtil<50?'var(--accent2)':+avgUtil>90?'var(--danger)':'var(--accent)')+'">'+avgUtil+'%</div>'
   +'<div class="kpi-label">'+t('AVG UTILISATION')+' '+((_availPanel.open)?'▼':'▶')+'</div>'
   +'<div class="kpi-sub">'+t('across full plan period')+' · '+t('{n} engineers',{n:totalActiveEngs})+'</div>'
   +'</div>'
   // Overallocated
   +'<div class="kpi-card" style="'+(overCount?'border-color:var(--danger)':'')+'">'
   +'<div class="kpi-val" style="color:'+(overCount?'var(--danger)':'var(--accent)')+'">'+overCount+'</div>'
   +'<div class="kpi-label">'+t('OVERALLOCATED')+'</div>'
   +'<div class="kpi-sub">'+(overCount?t('Engineers &gt;100% in some months'):t('All within capacity'))+'</div>'
   +'</div>'
   // Bench (unallocated this month)
   +'<div class="kpi-card" style="'+(benchCount>0?'border-color:var(--accent2)':'')+';cursor:pointer" onclick="_availPanel.open=true;_availPanel.threshold=1;renderResDashboard()" title="'+t('Click to show bench resources')+'">'
   +'<div class="kpi-val" style="color:'+(benchCount>0?'var(--accent2)':'var(--accent)')+'">'+benchCount+'</div>'
   +'<div class="kpi-label">'+t('ON BENCH')+'</div>'
   +'<div class="kpi-sub">'+t('Unallocated this month')+(benchCount>0?' · '+benchEngs.map(function(eu){return eu.name.split(' ')[0];}).slice(0,3).join(', ')+(benchCount>3?'…':''):'')+'</div>'
   +'</div>'
   // SPOF
   +'<div class="kpi-card" style="'+(spofSkills.length?'border-color:#f1a435':'')+'">'
   +'<div class="kpi-val" style="color:'+(spofSkills.length?'#f1a435':'var(--accent)')+'">'+spofSkills.length+'</div>'
   +'<div class="kpi-label">'+t('CRITICAL SPOF SKILLS')+'</div>'
   +'<div class="kpi-sub">'+t('Single-person critical skills')+' · <a onclick="showResTab(\'skillrisk\')" style="color:var(--accent);cursor:pointer;text-decoration:underline">'+t('view risk tab')+'</a></div>'
   +'</div>'
   +'</div>';

  // ── Monthly cost chart (improved) ─────────────────────────────
  h+='<div class="sum-section-title">'+t('MONTHLY COST &amp; FTE')+'</div>';
  var maxMoCost=Math.max(...moCosts,1);
  // Monthly FTE demand
  var moFte=months.map(function(m){
    var byE={};
    allocRows.forEach(function(r){
      if(!r.engId)return;
      var v=r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0;
      byE[r.engId]=(byE[r.engId]||0)+v;
    });
    return Object.values(byE).reduce(function(s,v){return s+Math.min(v,1);},0);
  });
  var maxFte=Math.max(...moFte,1);
  var cW=Math.max(400,months.length*34+80),cH=90;
  var cbw=Math.max(5,Math.floor((cW-80)/months.length)-3);
  var bars='';
  moCosts.forEach(function(v,i){
    var bh=Math.round(v/maxMoCost*(cH-18));
    var x=60+i*(cbw+3);
    var isCur=months[i]===cur;
    var isPast=months[i]<cur;
    bars+='<rect x="'+x+'" y="'+(cH-bh-2)+'" width="'+cbw+'" height="'+bh+'" fill="'+(isCur?'var(--accent)':isPast?'#5be5c844':'#5be5c822')+'" rx="2"/>';
    // FTE dot
    var fy=cH-2-Math.round(moFte[i]/maxFte*(cH-18));
    if(i>0){
      var px=60+(i-1)*(cbw+3)+cbw/2;
      var pfy=cH-2-Math.round(moFte[i-1]/maxFte*(cH-18));
      bars+='<line x1="'+px+'" y1="'+pfy+'" x2="'+(x+cbw/2)+'" y2="'+fy+'" stroke="var(--accent2)" stroke-width="1.5" opacity="0.7"/>';
    }
    bars+='<circle cx="'+(x+cbw/2)+'" cy="'+fy+'" r="2.5" fill="var(--accent2)" opacity="0.8"/>';
    if(months[i].endsWith('-01')||i===0)
      bars+='<text x="'+(x+cbw/2)+'" y="'+(cH+12)+'" text-anchor="middle" font-size="8" fill="#6b6b78" font-family="IBM Plex Mono,monospace">'+months[i].slice(0,4)+'</text>';
    if(isCur)
      bars+='<line x1="'+(x+cbw/2)+'" y1="0" x2="'+(x+cbw/2)+'" y2="'+cH+'" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3,2" opacity="0.4"/>';
  });
  bars+='<text x="4" y="'+(cH-2)+'" font-size="8" fill="#6b6b78" font-family="IBM Plex Mono,monospace">'+Math.round(maxMoCost/1000)+'k</text>';
  bars+='<text x="4" y="'+(cH/2)+'" font-size="8" fill="#6b6b78" font-family="IBM Plex Mono,monospace">'+Math.round(maxMoCost/2000)+'k</text>';
  h+='<div style="display:flex;gap:16px;align-items:center;margin-bottom:4px">'
   +'<span style="font-size:9px;color:#5be5c8;font-family:IBM Plex Mono,monospace">'+t('▬ FTE (right scale)')+'</span>'
   +'<span style="font-size:9px;color:var(--accent);font-family:IBM Plex Mono,monospace">'+t('█ Cost · darker = past · solid = current')+'</span>'
   +'</div>';
  h+='<div class="bar-chart-wrap" style="overflow-x:auto;margin-bottom:16px"><svg width="'+cW+'" height="'+(cH+20)+'" style="display:block">'
   +'<line x1="58" y1="0" x2="58" y2="'+cH+'" stroke="var(--border)" stroke-width="1"/>'
   +'<line x1="58" y1="'+cH+'" x2="'+cW+'" y2="'+cH+'" stroke="var(--border)" stroke-width="1"/>'
   +bars+'</svg></div>';

  // ── Cost by project ────────────────────────────────────────────
  h+='<div class="sum-section-title">'+t('COST BY PROJECT')+' <span style="font-weight:300;color:var(--muted)">'+t('(by section)')+'</span></div>';
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
    h+='<div style="margin-bottom:6px;border:1px solid var(--border);border-radius:7px;overflow:hidden">';
    h+='<div style="display:flex;align-items:center;gap:7px;padding:8px 12px;cursor:pointer;background:var(--surface)'+(isOpen?';border-bottom:1px solid var(--border)':'')
      +'" onclick="toggleDashSector(this.dataset.grp,this.dataset.sid)" data-grp="'+escH(grpName)+'" data-sid="'+safeId+'">'
      +'<span id="dsec-arrow-'+safeId+'" style="font-size:9px;color:var(--muted);width:10px">'+(isOpen?'▼':'▶')+'</span>'
      +'<div style="width:8px;height:8px;border-radius:50%;background:'+g.color+';flex-shrink:0"></div>'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em">'+escH(grpName==='Unsectioned'?t('Unsectioned'):grpName)+'</span>'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-left:4px">'+t('{n} project(s)',{n:g.rows.length})+'</span>'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent);margin-left:auto">'+Math.round(grpTotal/1000)+'k€</span>'
      +'</div>';
    h+='<div id="'+safeId+'" style="display:'+(isOpen?'block':'none')+'">'
      +'<table class="alloc-proj-table"><thead><tr>'
      +'<th>'+t('PROJECT')+'</th><th style="text-align:right">'+t('COST')+'</th><th style="text-align:right">%</th>'
      +'<th style="text-align:right">'+t('FTE PEAK')+'</th><th style="min-width:120px">'+t('MONTHLY')+'</th>'
      +'</tr></thead><tbody>';
    g.rows.sort(function(a,b){return b.cost-a.cost;}).forEach(function(row){
      var p=row.p,cost=row.cost;
      var pct=totalCost?Math.round(cost/totalCost*100):0;
      var projRows=allocRows.filter(function(r){return r.projectId===p.id;});
      var monthFtes=months.map(function(m){return projRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);});
      var peakFte=Math.max.apply(null,monthFtes.concat([0]));
      var monthCosts=months.map(function(m){return projRows.reduce(function(s,r){
        var eng=engineers.find(function(e){return e.id===r.engId;});
        return s+(eng&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);
      },0);});
      var maxMo=Math.max.apply(null,monthCosts.concat([1]));
      var sparkW=110,sparkH=16,bw=Math.max(1,Math.floor(sparkW/months.length)-1);
      var bars2='';
      monthCosts.forEach(function(v,i){
        var bh=Math.round(v/maxMo*sparkH);
        bars2+='<rect x="'+i*(bw+1)+'" y="'+(sparkH-bh)+'" width="'+bw+'" height="'+bh
          +'" fill="'+(months[i]===cur?'var(--accent)':'var(--accent2)')+'" opacity="0.7"/>';
      });
      var statusBadge='';
      if(p.currentGate)statusBadge+=' <span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(120,120,140,.12);color:var(--muted)">'+escH(p.currentGate)+'</span><span style="font-size:8px;color:var(--muted)"> →</span>';
      if(p.gate)statusBadge+=' <span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(200,241,53,.1);color:var(--accent)">'+escH(p.gate)+'</span>';
      if(p.status)statusBadge+=' <span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(200,241,53,.1);color:var(--accent)">'+escH(p.status)+'</span>';
      h+='<tr>'
       +'<td style="color:'+p.color+'">'+escH(p.name)+statusBadge+'</td>'
       +'<td style="text-align:right;font-family:IBM Plex Mono,monospace;font-weight:600">'+Math.round(cost/1000)+'k€</td>'
       +'<td style="text-align:right;color:var(--muted)">'+pct+'%</td>'
       +'<td style="text-align:right;font-family:IBM Plex Mono,monospace;color:var(--accent2)">'+peakFte.toFixed(1)+' FTE</td>'
       +'<td><svg width="'+sparkW+'" height="'+sparkH+'">'+bars2+'</svg></td>'
       +'</tr>';
    });
    h+='</tbody></table></div></div>';
  });


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
    h+='<div id="avail-panel" style="background:var(--surface);border:1px solid var(--border);border-top:2px solid var(--accent);border-radius:8px;padding:14px 16px;margin:10px 0;flex-shrink:0">'
     +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent);letter-spacing:.07em">'+t('◉ AVAILABILITY')+'</span>'
     // threshold slider
     +'<div style="display:flex;align-items:center;gap:6px">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('SHOW &lt;')+'</span>'
     +'<input type="range" min="1" max="100" step="5" value="'+_avThresh+'"'
     +' style="width:80px;accent-color:var(--accent)" title="'+t('Show engineers with utilisation below this %')+'"'
     +' oninput="this.nextElementSibling.textContent=this.value+\'%\';_availPanel.threshold=+this.value;renderResDashboard()">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--accent);min-width:30px">'+_avThresh+'%</span>'
     +'</div>'
     // group by selector
     +'<div style="display:flex;align-items:center;gap:4px">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('GROUP:')+'</span>'
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
      h+='<div style="text-align:center;padding:20px;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted)">'+t('No engineers below {n}% utilisation in this period',{n:_avThresh})+'</div>';
    } else {
      Object.keys(_avGroups).sort().forEach(function(gkey){
        var gEngs = _avGroups[gkey];
        h+='<div style="margin-bottom:10px">'
         +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid var(--border)">'+escH(gkey)+' <span style="color:var(--dim)">('+gEngs.length+')</span></div>'
         +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px">';
        gEngs.forEach(function(eu){
          var pct=Math.round(eu.utilizationRate*100);
          var col=pct===0?'var(--accent2)':pct<25?'var(--accent2)':pct<50?'var(--accent)':'var(--muted)';
          var sel=_avSel.has(eu.eng.id);
          var topSkills=(eu.eng.skills||[]).slice(0,3).map(function(s){return escH(s.name);}).join(', ');
          h+='<div style="background:var(--bg);border:1px solid '+(sel?'var(--accent)':'var(--border)')+';border-left:3px solid '+eu.grpColor+';border-radius:5px;padding:7px 10px;cursor:pointer;transition:.1s"'
           +' onclick="availToggle('+eu.eng.id+')" title="Click to select/deselect">'
           +'<div style="display:flex;align-items:center;gap:6px">'
           +'<input type="checkbox" '+(sel?'checked':'')+' style="accent-color:var(--accent);pointer-events:none" tabindex="-1">'
           +'<div style="flex:1">'
           +'<div style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:var(--text)">'+escH(eu.name)+'</div>'
           +(eu.role?'<div style="font-size:9px;color:var(--muted)">'+escH(eu.role)+'</div>':'')
           +'</div>'
           +'<div style="font-family:IBM Plex Mono,monospace;font-size:13px;font-weight:700;color:'+col+'">'+pct+'%</div>'
           +'</div>'
           +(topSkills?'<div style="font-size:9px;color:var(--dim);margin-top:4px">'+topSkills+'</div>':'')
           +'<div style="height:3px;background:var(--border);border-radius:2px;margin-top:6px;overflow:hidden">'
           +'<div style="height:3px;width:'+pct+'%;background:'+col+';border-radius:2px"></div>'
           +'</div>'
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
      h+='<div id="avail-capability" style="margin-top:12px;padding:12px 14px;background:rgba(200,241,53,.05);border:1px solid rgba(200,241,53,.2);border-radius:6px">'
       +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
       +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent);letter-spacing:.06em">⚡ '+t('TEAM CAPABILITY')+' — '+t('{n} selected',{n:_selEngs.length})+'</span>'
       +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">~'+_totalAvailFTE.toFixed(1)+' '+t('available FTE')+'</span>'
       +'</div>'
       +'<div style="display:flex;gap:16px;flex-wrap:wrap">'
       // Engineers list
       +'<div style="flex:1;min-width:160px">'
       +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:5px">'+t('ENGINEERS')+'</div>'
       +_selEngs.map(function(eu){
         var avail=Math.round((1-eu.utilizationRate)*100);
         return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'
           +'<div style="width:6px;height:6px;border-radius:50%;background:'+eu.grpColor+'"></div>'
           +'<span style="font-size:11px;color:var(--text)">'+escH(eu.name)+'</span>'
           +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--accent);margin-left:auto">~'+avail+'% '+t('free')+'</span>'
           +'</div>';
       }).join('')
       +'</div>'
       // Skills
       +(_topSkills.length?
         '<div style="flex:2;min-width:200px">'
         +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:5px">'+t('KEY SKILLS')+'</div>'
         +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
         +_topSkills.map(function(kv){
           return '<span style="font-size:9px;padding:2px 7px;border-radius:3px;background:rgba(200,241,53,.1);border:1px solid rgba(200,241,53,.2);color:var(--accent)">'
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
  h+='<div style="display:flex;align-items:center;gap:8px;margin-top:8px;margin-bottom:8px">'
   +'<span class="sum-section-title" style="margin:0;border:none;padding:0">'+t('ENGINEER UTILISATION')+'</span>'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('GROUP BY:')+'</span>'
   +'<button class="sm'+(engDashGroupBy==='group'?' active':'')+'" onclick="setEngDashGroup(\'group\')">'+t('FUNCTION')+'</button>'
   +'<button class="sm'+(engDashGroupBy==='project'?' active':'')+'" onclick="setEngDashGroup(\'project\')">'+t('PROJECT')+'</button>'
   +'<button class="sm'+(engDashGroupBy==='location'?' active':'')+'" onclick="setEngDashGroup(\'location\')">'+t('LOCATION')+'</button>'
   +'</div>';

  // Build grouping
  var utilByKey={};
  Object.values(engUtil).forEach(function(eu){
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
    h+='<div style="margin-bottom:14px">'
     +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;padding-bottom:4px;border-bottom:1px solid var(--border)">'
     +'<div style="width:8px;height:8px;border-radius:50%;background:'+ug.color+';flex-shrink:0"></div>'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em">'+escH(gk)+'</span>'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-left:auto">'+t('{n} engineer(s)',{n:ug.members.length})+'</span>'
     +'</div>'
     +'<div class="alloc-kpi-grid" style="margin-bottom:0">';
    ug.members.forEach(function(eu){
      if(eu.eng.excludeFromCalc)return; // excluded from calculations
      var pct=Math.round(eu.avgAlloc*100);
      var utilPct=Math.round(eu.utilizationRate*100);
      var isOver=eu.overMonths&&eu.overMonths.length>0;
      var isBench=eu.curAlloc===0;
      var isSpof=spofEngIds.has(eu.eng.id);
      var col=isOver?'var(--danger)':isBench?'var(--accent2)':pct>80?'var(--accent)':'var(--accent2)';
      // Spark for this engineer
      var eSpark='';
      var emv=months.map(function(m){return eu.monthAllocs&&eu.monthAllocs[m]?eu.monthAllocs[m]:0;});
      var emMax=Math.max(...emv,1);
      var esW=80,esH=18,ebw=Math.max(2,Math.floor(esW/months.length)-1);
      emv.forEach(function(v,i){
        var bh=Math.round(v/emMax*esH);
        var bc=v>1.005?'var(--danger)':months[i]===cur?'var(--accent)':'var(--accent2)';
        eSpark+='<rect x="'+i*(ebw+1)+'" y="'+(esH-bh)+'" width="'+ebw+'" height="'+bh+'" fill="'+bc+'" opacity="0.7" rx="1"/>';
      });
      var totalCostEng=eu.totAlloc*(eu.cost||0);
      h+='<div class="kpi-card" style="'+(isOver?'border-color:var(--danger);background:rgba(241,67,53,.04)':isBench?'border-color:var(--accent2);background:rgba(200,241,53,.02)':'')+'">'
       +'<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">'
       +'<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--accent2)">'+escH(eu.name)+'</div>'
       +(isOver?'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;background:rgba(241,67,53,.15);color:var(--danger);padding:1px 4px;border-radius:3px">&#9888; '+t('OVER')+'</span>':'')
       +(isBench?'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;background:rgba(200,241,53,.1);color:var(--accent2);padding:1px 4px;border-radius:3px">'+t('BENCH')+'</span>':'')
       +(isSpof?'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;background:rgba(241,164,53,.1);color:#f1a435;padding:1px 4px;border-radius:3px">SPOF</span>':'')
       +'</div>'
       +'<div style="font-size:9px;color:var(--muted);margin-bottom:5px">'+(eu.role?escH(eu.role):'')+(eu.role&&eu.loc?' · ':'')+escH(eu.loc||'')+'</div>'
       +'<div style="font-size:22px;font-weight:700;color:'+col+';font-family:IBM Plex Mono,monospace;line-height:1">'+pct+'%</div>'
       +'<div style="font-size:9px;color:var(--muted);margin-top:1px">'+t('avg active')+' · '+utilPct+'% '+t('full period')+'</div>'
       +'<svg width="'+esW+'" height="'+esH+'" style="margin-top:5px;display:block">'+eSpark+'</svg>'
       +(isOver?'<div style="font-size:9px;color:var(--danger);margin-top:3px">&#9888; '+t('Over:')+' '+eu.overMonths.slice(0,3).map(function(m){return m.slice(0,7);}).join(', ')+(eu.overMonths.length>3?'…':'')+'</div>':'')
       +'<div style="font-size:9px;color:var(--muted);margin-top:3px">'+Math.round(totalCostEng/1000)+'k€ '+t('total')+' · '+eu.activeMonths+'/'+eu.months+' '+t('mo')+'</div>'
       +(isOver
         ?'<button onclick="showDashReplacements('+eu.eng.id+',this)" '
          +'style="margin-top:7px;width:100%;font-family:IBM Plex Mono,monospace;font-size:9px;'
          +'background:none;border:1px solid var(--danger);color:var(--danger);border-radius:4px;'
          +'padding:3px 0;cursor:pointer;letter-spacing:.04em" '
          +'onmouseenter="this.style.background=\'rgba(241,67,53,.12)\'" '
          +'onmouseleave="this.style.background=\'none\'">'
          +'&#128270; '+t('FIND REPLACEMENTS')+'</button>'
         :'')
       +'</div>';
    });
    h+='</div></div>';
  }


  // ── Project spending detail (collapsible) ─────────────────────────
  var _pdOpen = _dashProjDetailOpen;
  h += '<div style="margin-top:18px">'
    + '<div style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 0;border-top:1px solid var(--border)"'
    + ' onclick="(function(el){_dashProjDetailOpen=!_dashProjDetailOpen;'
    + 'var s=document.getElementById(\'dash-proj-detail\');'
    + 'if(s){s.style.display=_dashProjDetailOpen?\'block\':\'none\';}'
    + 'el.querySelector(\'.dash-pd-arrow\').textContent=_dashProjDetailOpen?\'▼\':\'▶\';})(this)">'
    + '<span class="dash-pd-arrow" style="font-size:10px;color:var(--muted)">' + (_pdOpen ? '▼' : '▶') + '</span>'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.07em">'+t('PROJECT SPENDING DETAIL')+'</span>'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-left:4px">— '+t('cost &amp; resources per project')+' · ' + t('{n} months',{n:months.length}) + '</span>'
    + '</div>'
    + '<div id="dash-proj-detail" style="display:' + (_pdOpen ? 'block' : 'none') + '">';

  var _projDetail = Object.entries(projCost)
    .map(function(kv) {
      var pid = +kv[0], cost = kv[1];
      var p = projects.find(function(p){ return p.id === pid; });
      if (!p) return null;
      var _rows = filteredRows.filter(function(r){ return r.projectId === pid && r.engId; });
      var _engMap = {};
      _rows.forEach(function(r) {
        if (!_engMap[r.engId]) _engMap[r.engId] = { fte: {}, eng: engineers.find(function(e){ return e.id === r.engId; }) };
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
    h += '<div style="padding:16px;text-align:center;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px">'+t('No project allocation data in selected period.')+'</div>';
  }

  _projDetail.forEach(function(pd) {
    var p = pd.p, pct = totalCost ? Math.round(pd.cost / totalCost * 100) : 0;
    var _moCosts = months.map(function(m) {
      return pd.resources.reduce(function(s, r){ return s + (r.fte[m] || 0) * (r.eng.monthlyCost || 0); }, 0);
    });
    var _maxMo = Math.max.apply(null, _moCosts.concat([1]));
    var _sw = 160, _sh = 20, _bw = Math.max(1, Math.floor(_sw / Math.max(months.length, 1)) - 1);
    var _bars = '';
    _moCosts.forEach(function(v, i) {
      var bh = Math.max(1, Math.round(v / _maxMo * _sh));
      _bars += '<rect x="' + i*(_bw+1) + '" y="' + (_sh-bh) + '" width="' + _bw + '" height="' + bh
        + '" fill="' + (months[i]===cur ? 'var(--accent)' : 'var(--accent2)') + '" opacity="0.7"/>';
    });

    h += '<div style="margin-bottom:10px;border:1px solid var(--border);border-left:3px solid '
      + (p.color || 'var(--muted)') + ';border-radius:6px;overflow:hidden">';

    h += '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface);flex-wrap:wrap">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:var(--text)">' + escH(p.name) + '</div>'
      + (p.currentGate ? '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(120,120,140,.12);color:var(--muted);font-family:IBM Plex Mono,monospace">' + escH(p.currentGate) + ' →</span>' : '')
      + (p.gate ? '<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(200,241,53,.08);color:var(--accent);font-family:IBM Plex Mono,monospace">' + escH(p.gate) + '</span>' : '')
      + '<div style="flex:1"></div>'
      + '<span style="font-family:IBM Plex Mono,monospace;font-size:12px;font-weight:700;color:var(--accent)">' + Math.round(pd.cost/1000) + 'k€</span>'
      + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">' + pct + '% '+t('of total')+'</span>'
      + '<svg width="' + _sw + '" height="' + _sh + '" title="'+t('Monthly cost')+'">' + _bars + '</svg>'
      + '</div>';

    if (pd.resources.length) {
      h += '<table style="width:100%;border-collapse:collapse;font-size:10px">'
        + '<thead><tr style="background:var(--bg)">'
        + '<th style="text-align:left;padding:5px 12px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.06em">'+t('RESOURCE')+'</th>'
        + '<th style="text-align:left;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('GROUP')+'</th>'
        + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('PEAK FTE')+'</th>'
        + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('FTE·MO')+'</th>'
        + '<th style="text-align:right;padding:5px 12px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('COST')+'</th>'
        + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('SHARE')+'</th>'
        + '</tr></thead><tbody>';

      pd.resources.forEach(function(r, i) {
        var share = pd.cost ? Math.round(r.cost / pd.cost * 100) : 0;
        var eg = engGroups.find(function(g){ return g.id === r.eng.groupId; });
        h += '<tr style="border-top:1px solid var(--border)' + (i%2===1?';background:rgba(255,255,255,.01)':'') + '">'
          + '<td style="padding:5px 12px;color:var(--text);font-weight:600">' + escH(r.eng.name)
          + (r.eng.role ? '<span style="font-weight:400;color:var(--muted);font-size:9px"> · ' + escH(r.eng.role) + '</span>' : '')
          + '</td>'
          + '<td style="padding:5px 8px"><span style="font-size:9px;color:' + r.grpColor + '">' + escH(eg ? eg.name : '—') + '</span></td>'
          + '<td style="padding:5px 8px;text-align:right;font-family:IBM Plex Mono,monospace;color:var(--accent2)">' + r.peakFte.toFixed(1) + '</td>'
          + '<td style="padding:5px 8px;text-align:right;font-family:IBM Plex Mono,monospace;color:var(--muted)">' + r.totalFte.toFixed(1) + '</td>'
          + '<td style="padding:5px 12px;text-align:right;font-family:IBM Plex Mono,monospace;font-weight:600;color:var(--text)">' + Math.round(r.cost/1000) + 'k€</td>'
          + '<td style="padding:5px 8px;text-align:right">'
          + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px">'
          + '<div style="width:40px;height:5px;background:var(--border);border-radius:2px;overflow:hidden">'
          + '<div style="height:5px;width:' + share + '%;background:' + (p.color||'var(--accent)') + ';border-radius:2px"></div>'
          + '</div>'
          + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);min-width:26px;text-align:right">' + share + '%</span>'
          + '</div></td>'
          + '</tr>';
      });
      h += '</tbody></table>';
    } else {
      h += '<div style="padding:8px 12px;font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('No named resources in selected period.')+'</div>';
    }
    h += '</div>';
  });

  h += '</div></div>';


  // ── Overworked resources + conflict summary ───────────────────────
  var _overEngs = Object.values(engUtil).filter(function(eu){ return eu.overMonths.length > 0; });
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
    h+='<div style="margin-top:18px">'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.07em;margin-bottom:8px;padding-top:14px;border-top:1px solid var(--border)">'+t('⚠ OVERLOADED RESOURCES &amp; CONFLICTS')+'</div>'
      +'<div style="display:flex;flex-direction:column;gap:6px">';

    _conflictData.forEach(function(cd){
      var eu = cd.eu;
      var eg = engGroups.find(function(g){ return g.id===eu.eng.groupId; });
      var grpColor = eg ? eg.color : 'var(--muted)';
      var overPct = Math.round(Math.max.apply(null, eu.overMonths.map(function(m){
        return filteredRows.filter(function(r){return r.engId===eu.eng.id;})
          .reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);
      }).concat([0]))*100);

      h+='<div style="border:1px solid rgba(241,67,53,.3);border-left:3px solid var(--danger);border-radius:6px;padding:8px 12px;background:rgba(241,67,53,.04)">';
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:var(--text)">'+escH(eu.eng.name)+'</span>'
        +(eu.eng.role?'<span style="font-size:9px;color:var(--muted)">'+escH(eu.eng.role)+'</span>':'')
        +'<span style="font-size:9px;padding:1px 6px;border-radius:3px;background:rgba(120,120,140,.15);color:'+grpColor+'">'+escH(eg?eg.name:'')+'</span>'
        +'<div style="flex:1"></div>'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:var(--danger)">'+overPct+'% '+t('peak')+'</span>'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('{n} month(s)',{n:eu.overMonths.length})+'</span>'
        +'</div>';
      // Over months mini bar
      h+='<div style="display:flex;gap:3px;margin-bottom:6px;flex-wrap:wrap">';
      eu.overMonths.slice(0,8).forEach(function(m){
        h+='<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(241,67,53,.15);color:var(--danger)">'+m.slice(0,7)+'</span>';
      });
      if(eu.overMonths.length>8) h+='<span style="font-size:8px;color:var(--muted)">+'+( eu.overMonths.length-8)+'</span>';
      h+='</div>';
      // Conflicting projects
      if(cd.conflictProjs.length){
        h+='<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);margin-bottom:4px;letter-spacing:.04em">'+t('CONFLICTS ACROSS:')+'</div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:4px">';
        cd.conflictProjs.forEach(function(cp){
          h+='<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:'+(cp.p.color||'var(--muted)')+'22;border:1px solid '+(cp.p.color||'var(--muted)')+'44;color:'+(cp.p.color||'var(--text)')+'">'+escH(cp.p.name)+'<span style="color:var(--muted);margin-left:4px">'+cp.months.length+t('mo')+'</span></span>';
        });
        h+='</div>';
      }
      // Find replacement button
      h+='<button onclick="showDashReplacements('+eu.eng.id+',this)" '
        +'style="margin-top:7px;width:100%;font-family:IBM Plex Mono,monospace;font-size:9px;'
        +'background:none;border:1px solid var(--danger);color:var(--danger);border-radius:4px;'
        +'padding:3px 0;cursor:pointer;letter-spacing:.04em" '
        +'onmouseenter="this.style.background=\'rgba(241,67,53,.12)\'" '
        +'onmouseleave="this.style.background=\'none\'">🔍 '+t('FIND REPLACEMENTS')+'</button>';
      h+='</div>';
    });
    h+='</div></div>';
  }


  // ── Financial analysis: team cost vs project allocation ─────────

  // Build financial data
  var _finMonths = months; // use same period as dashboard
  var _nMonths   = _finMonths.length;

  // Total team cost for the period (all active, non-excluded engineers × monthlyCost × months)
  var _teamCostAll  = 0, _teamCostIncl = 0;
  var _noCostWarnings = [];
  var _allocCostTotal = 0;  // cost attributed to projects

  Object.values(engUtil).forEach(function(eu) {
    var mc = eu.eng.monthlyCost || 0;
    _teamCostAll += mc * _nMonths;
    if (_finExclude.has(eu.eng.id)||(eu.eng.planningOnly&&!eu.eng.includeInCost)||eu.eng.excludeFromCalc) return;
    if (!mc) _noCostWarnings.push(eu.eng.name);
    var activeMo = _finMonths.filter(function(m){
      var s = eu.monthStatus && eu.monthStatus[m];
      return s!=='m' && s!=='r';
    }).length;
    _teamCostIncl += mc * activeMo;
    // Allocated cost = FTE × monthlyCost per month
    _finMonths.forEach(function(m) {
      var status = eu.monthStatus && eu.monthStatus[m];
      if(status==='m'||status==='r') return; // medical/resigned: no cost this month
      var fte = Math.min(eu.monthAllocs[m] || 0, 1);
      _allocCostTotal += fte * mc;
    });
  });


  var _unallocCost   = Math.max(0, _teamCostIncl - _allocCostTotal);
  var _allocPct      = _teamCostIncl > 0 ? Math.round(_allocCostTotal / _teamCostIncl * 100) : 0;
  var _unallocPct    = 100 - _allocPct;

  h += '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px">';
  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.07em">'+t('FINANCIAL ANALYSIS')+'</span>'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'
    + t('{n} months',{n:_nMonths}) + ' · ' + t('{n} engineers',{n:Object.values(engUtil).length})
    + (_finExclude.size ? ' · ' + t('{n} excluded',{n:_finExclude.size}) : '')
    + '</span>'
    + '</div>';

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

  // KPI row
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">';
  [
    { val: Math.round(_teamCostIncl/1000) + 'k€', label: t('TEAM COST PERIOD'), sub: t('{n} mo × salaries',{n:_nMonths}), col: 'var(--accent2)' },
    { val: Math.round(_allocCostTotal/1000)    + 'k€', label: t('ALLOCATED TO PROJ'), sub: _allocPct + '% '+t('of team cost'),  col: 'var(--accent)' },
    { val: Math.round(_unallocCost/1000)  + 'k€', label: t('UNALLOCATED'),       sub: _unallocPct + '% '+t('bench / overhead'), col: _unallocPct > 30 ? 'var(--warn)' : 'var(--muted)' },
    { val: Math.round(totalCost/1000)     + 'k€', label: t('PROJ ALLOC COST'),   sub: t('from allocation plan'),        col: 'var(--purple)' },
  ].forEach(function(k) {
    h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:10px 12px">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:20px;font-weight:700;color:' + k.col + '">' + k.val + '</div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.06em;margin-top:3px">' + k.label + '</div>'
      + '<div style="font-size:9px;color:var(--dim);margin-top:2px">' + k.sub + '</div>'
      + '</div>';
  });
  h += '</div>';

  // Allocation bar
  h += '<div style="margin-bottom:12px">'
    + '<div style="display:flex;justify-content:space-between;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:4px">'
    + '<span>'+t('Allocated to projects:')+' ' + _allocPct + '%</span>'
    + '<span>'+t('Unallocated:')+' ' + _unallocPct + '%</span>'
    + '</div>'
    + '<div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;display:flex">'
    + '<div style="width:' + _allocPct + '%;background:var(--accent);border-radius:5px 0 0 5px"></div>'
    + '<div style="flex:1;background:' + (_unallocPct > 30 ? 'rgba(241,164,53,.3)' : 'var(--surface)') + '"></div>'
    + '</div>'
    + '</div>';

  // Per-engineer breakdown
  var _finRows = Object.values(engUtil)
    .sort(function(a, b) { return (b.eng.monthlyCost||0) - (a.eng.monthlyCost||0); });

  h += '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px">'
    + '<thead><tr style="background:var(--surface)">'
    + '<th style="text-align:left;padding:5px 10px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em">'+t('ENGINEER')+'</th>'
    + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('MONTHLY')+'</th>'
    + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('PERIOD COST')+'</th>'
    + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('ALLOC COST')+'</th>'
    + '<th style="text-align:right;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('% ALLOC')+'</th>'
    + '<th style="text-align:center;padding:5px 8px;font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+t('EXCLUDE')+'</th>'
    + '</tr></thead><tbody>';

  _finRows.forEach(function(eu, i) {
    var mc = eu.eng.monthlyCost || 0;
    var excl = _finExclude.has(eu.eng.id);
    var engExcluded = eu.eng.excludeFromCalc;
    var _activeMoEng = _finMonths.filter(function(m){
      var s=eu.monthStatus&&eu.monthStatus[m]; return s!=='m'&&s!=='r';
    }).length;
    var periodCost = mc * _activeMoEng;
    var allocCostEng = _finMonths.reduce(function(s, m) {
      return s + Math.min(eu.monthAllocs[m] || 0, 1) * mc;
    }, 0);
    var allocPctEng = periodCost > 0 ? Math.round(allocCostEng / periodCost * 100) : 0;
    var rowBg = (excl||engExcluded) ? 'background:rgba(90,99,128,.08);' : (i%2===1 ? 'background:rgba(255,255,255,.01);' : '');
    var eg = engGroups.find(function(g){ return g.id === eu.eng.groupId; });
    h += '<tr style="border-top:1px solid var(--border);' + rowBg + ((excl||engExcluded) ? 'opacity:.4;' : '') + '">'
      + '<td style="padding:5px 10px">'
      + '<span style="font-weight:600;color:' + (engExcluded?'var(--muted)':'var(--text)') + '">' + escH(eu.eng.name) + '</span>'
      + (engExcluded ? '<span style="font-size:9px;color:var(--warn);margin-left:6px">⊘ '+t('excluded')+'</span>' : '')
      + (eg ? '<span style="font-size:9px;color:' + eg.color + ';margin-left:6px">' + escH(eg.name) + '</span>' : '')
      + (!mc ? '<span style="font-size:9px;color:var(--warn);margin-left:6px">⚠ '+t('no cost')+'</span>' : '')
      + '</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:IBM Plex Mono,monospace;color:var(--muted)">' + (mc ? mc.toLocaleString() + '€' : '—') + '</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:IBM Plex Mono,monospace;color:var(--text);font-weight:600">' + (periodCost ? Math.round(periodCost/1000) + 'k€' : '—') + '</td>'
      + '<td style="padding:5px 8px;text-align:right;font-family:IBM Plex Mono,monospace;color:var(--accent)">' + (allocCostEng ? Math.round(allocCostEng/1000) + 'k€' : '—') + '</td>'
      + '<td style="padding:5px 8px;text-align:right">'
      + (mc ? '<div style="display:flex;align-items:center;justify-content:flex-end;gap:5px">'
        + '<div style="width:40px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">'
        + '<div style="height:4px;width:' + Math.min(allocPctEng,100) + '%;background:' + (allocPctEng < 50 ? 'var(--warn)' : 'var(--accent)') + ';border-radius:2px"></div>'
        + '</div>'
        + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);min-width:28px;text-align:right">' + allocPctEng + '%</span>'
        + '</div>' : '—')
      + '</td>'
      + '<td style="padding:5px 8px;text-align:center">'
      + '<input type="checkbox" ' + (excl ? 'checked' : '') + ' '
      + 'onchange="(function(id,cb){if(cb.checked)_finExclude.add(id);else _finExclude.delete(id);saveState();clearTimeout(window._finDebounce);window._finDebounce=setTimeout(renderResDashboard,200);})('+eu.eng.id+',this)" '
      + 'style="accent-color:var(--muted);cursor:pointer" title="'+t('Exclude from financial totals')+'">'
      + '</td>'
      + '</tr>';
  });
  h += '</tbody></table>';
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

  var resolved=content
    .replace(/var\(--bg\)/g,'#f8f9fa')
    .replace(/var\(--surface\)/g,'#ffffff')
    .replace(/var\(--border\)/g,'#dee2e6')
    .replace(/var\(--text\)/g,'#1a1a2e')
    .replace(/var\(--muted\)/g,'#6b7280')
    .replace(/var\(--accent\)/g,'#2d6a1f')
    .replace(/var\(--accent2\)/g,'#1e6b5e')
    .replace(/var\(--danger\)/g,'#dc2626')
    .replace(/fill="var\(--accent\)"/g,'fill="#2d6a1f"')
    .replace(/fill="var\(--accent2\)"/g,'fill="#1e6b5e"')
    .replace(/fill="var\(--border\)"/g,'fill="#dee2e6"')
    .replace(/fill="var\(--danger\)"/g,'fill="#dc2626"')
    .replace(/fill="#5be5c866"/g,'fill="#1e6b5e66"')
    .replace(/stroke="var\(--border\)"/g,'stroke="#dee2e6"')
    .replace(/stroke="var\(--accent\)"/g,'stroke="#2d6a1f"')
    .replace(/rgba\(200,241,53,\.04\)/g,'rgba(45,106,31,.04)')
    .replace(/rgba\(200,241,53,\.1\)/g,'rgba(45,106,31,.08)')
    .replace(/rgba\(241,67,53,\.04\)/g,'rgba(220,38,38,.04)')
    .replace(/rgba\(241,67,53,\.15\)/g,'rgba(220,38,38,.12)')
    .replace(/<select[^>]*>[\s\S]*?<\/select>/g,'<span style="color:#6b7280;font-size:10px">[filtered]</span>')
    .replace(/<button[^>]*onclick="renderResDashboard\(\)"[^>]*>[\s\S]*?<\/button>/g,'')
    .replace(/<button[^>]*onclick="setEngDashGroup[^>]*>[\s\S]*?<\/button>/g,'')
    .replace(/<button[^>]*onclick="engDash[^>]*>[\s\S]*?<\/button>/g,'')
    .replace(/<button[^>]*onclick="transferPlanCosts[^>]*>[\s\S]*?<\/button>/g,'');

  var win=window.open('','_blank');
  if(!win){alert('Pop-up blocked — please allow pop-ups.');return;}

  win.document.write('<!DOCTYPE html><html><head>'
    +'<meta charset="UTF-8">'
    +'<title>'+escH(title)+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:20px;font-size:12px;}'
    +'.report-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #2d6a1f;}'
    +'.report-title{font-size:20px;font-weight:700;color:#1a1a2e;}'
    +'.report-date{font-size:10px;color:#6b7280;margin-top:3px;}'
    +'.alloc-kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px;}'
    +'.kpi-card{background:#f8f9fa;border:1px solid #dee2e6;border-radius:7px;padding:12px 14px;}'
    +'.kpi-val{font-size:22px;font-weight:700;color:#2d6a1f;font-family:monospace;line-height:1;}'
    +'.kpi-label{font-size:9px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin-top:4px;text-transform:uppercase;font-family:monospace;}'
    +'.kpi-sub{font-size:10px;color:#9ca3af;margin-top:2px;}'
    +'.sum-section-title{font-family:monospace;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid #dee2e6;}'
    +'.alloc-proj-table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px;}'
    +'.alloc-proj-table th{text-align:left;padding:4px 8px;font-family:monospace;font-size:9px;color:#6b7280;border-bottom:1px solid #dee2e6;text-transform:uppercase;letter-spacing:.04em;background:#f8f9fa;}'
    +'.alloc-proj-table td{padding:5px 8px;border-bottom:1px solid #f0f0f0;}'
    +'.progress-bar-wrap{background:#dee2e6;border-radius:2px;height:4px;}'
    +'.progress-bar{height:4px;border-radius:2px;background:#2d6a1f;}'
    +'.bar-chart-wrap{margin:4px 0 12px;overflow-x:visible;}'
    +'.dash-filter-bar{display:none!important;}'
    +'.kpi-card .kpi-val{font-size:18px;}'
    +'.report-footer{margin-top:20px;padding-top:10px;border-top:1px solid #dee2e6;font-size:9px;color:#9ca3af;display:flex;justify-content:space-between;}'
    +'@media print{'
    +'@page{size:A3 landscape;margin:8mm;}'
    +'body{padding:6px;}'
    +'.alloc-kpi-grid{grid-template-columns:repeat(5,1fr);}'
    +'}'
    +'</style></head><body>'
    +'<div class="report-header">'
    +'<div><div class="report-title">'+escH(title)+'</div>'
    +'<div class="report-date">Generated '+dateStr
    +(engDashFilterEng?' · Engineer: '+escH(engDashFilterEng):'')
    +(engDashFilterProj?' · Project: '+escH(engDashFilterProj):'')
    +'</div></div>'
    +'<div style="font-size:9px;color:#9ca3af;text-align:right;font-family:monospace">Project Matrix</div>'
    +'</div>'
    +resolved
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
    var eng=engineers.find(function(e){return e.id===r.engId;});if(!eng)return;
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
  if (existing) { existing.remove(); btn.textContent = '🔍 FIND REPLACEMENTS'; return; }
  btn.textContent = '▲ CLOSE';

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
        + c.matched + '/' + selectedSkills.length + ' skills</span>'
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
      + '<div style="font-size:8px;color:var(--muted)">' + Math.round(c.headroom*100) + '% free</div>'
      + '</div>'
      + '</div>';
  }

  // ── Skill pills ───────────────────────────────────────────────────
  var skillPills = engSkills.length
    ? '<div style="margin-bottom:8px">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);'
      + 'letter-spacing:.06em;margin-bottom:4px">FILTER BY SKILL (click to toggle):</div>'
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
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--danger);letter-spacing:.07em;margin-bottom:8px">REPLACEMENT CANDIDATES FOR ' + escH(eng.name.toUpperCase()) + '</div>'
    + skillPills;

  if (sameCandidates.length) {
    var eg = engGroups.find(function(g){ return g.id===eng.groupId; });
    h += '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);'
      + 'margin-bottom:4px;letter-spacing:.05em">SAME GROUP'+(eg?' — '+escH(eg.name):'')+' ('+sameCandidates.length+')</div>';
    sameCandidates.slice(0, 6).forEach(function(c){ h += candidateRow(c, true); });
  } else {
    h += '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);padding:4px 0">'
      + 'No available candidates in same group'
      + (selectedSkills.length ? ' with selected skills.' : '.') + '</div>';
  }

  if (otherCandidates.length && !selectedSkills.length) {
    h += '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);'
      + 'margin-top:8px;margin-bottom:4px;letter-spacing:.05em">OTHER GROUPS ('+otherCandidates.length+')</div>';
    otherCandidates.forEach(function(c){ h += candidateRow(c, false); });
  }

  if (!sameCandidates.length && !otherCandidates.length) {
    h += '<div style="font-size:9px;color:var(--muted);padding:4px 0">No available replacements found.</div>';
  }

  // Add resource button at bottom of panel
  h += '<div style="padding:8px 10px;border-top:1px solid var(--border);margin-top:4px">'
    + '<button onclick="openAddResourceModal(' + engId + ')" '
    + 'style="width:100%;font-family:IBM Plex Mono,monospace;font-size:9px;padding:4px 0;'
    + 'background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;'
    + 'cursor:pointer;letter-spacing:.04em">+ ADD RESOURCE</button>'
    + '</div>';
  h += '</div>';

  // Insert panel after the button's parent card
  var card = btn.closest('.kpi-card') || btn.parentElement;
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
    +'<h3 style="font-family:IBM Plex Mono,monospace;font-size:12px;letter-spacing:.06em;color:var(--muted);margin:0">ADD RESOURCE</h3>'
    +(fromEng?'<span style="font-size:10px;color:var(--muted)">— based on '+escH(fromEng.name)+'\'s profile</span>':'')
    +'<div style="flex:1"></div>'
    +'<button onclick="document.getElementById(\'add-resource-modal\').remove()" '
    +'style="background:none;border:none;color:var(--muted);font-size:16px;cursor:pointer">✕</button>'
    +'</div>'

    // Name
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">FULL NAME *</label>'
    +'<input id="nar-name" class="eng-card-inp" placeholder="e.g. Jane Doe" style="width:100%">'
    +'</div>'

    // Role — prefill from source eng
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">ROLE</label>'
    +'<input id="nar-role" class="eng-card-inp" value="'+escH(fromEng?fromEng.role||'':'')
    +'" placeholder="e.g. Senior R&D" style="width:100%">'
    +'</div>'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">LOCATION</label>'
    +'<input id="nar-location" class="eng-card-inp" value="'+escH(fromEng?fromEng.location||'':'')
    +'" placeholder="e.g. Montreal" style="width:100%">'
    +'</div>'
    +'</div>'

    // Group + cost
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">ROSTER GROUP</label>'
    +'<select id="nar-group" style="background:var(--bg);border:1px solid var(--border);color:var(--text);'
    +'font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;width:100%">'
    +'<option value="">— No group —</option>'+groups
    +'</select>'
    +'</div>'
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">MONTHLY COST (€)</label>'
    +'<input id="nar-cost" class="eng-card-inp" type="number" value="'+(fromEng?fromEng.monthlyCost||8000:8000)
    +'" placeholder="8000" style="width:100%">'
    +'</div>'
    +'</div>'

    // Copy skills checkbox
    +(fromEng&&(fromEng.skills||[]).length
      ? '<label style="display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer">'
        +'<input type="checkbox" id="nar-copy-skills" checked style="accent-color:var(--accent)">'
        +'<span style="color:var(--text)">Copy skills from '+escH(fromEng.name)+'</span>'
        +'<span style="font-size:9px;color:var(--muted)">('+( fromEng.skills.length)+' skills)</span>'
        +'</label>'
      : '')

    // Org placement: reports to
    +'<div class="field">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;display:block;margin-bottom:4px">REPORTS TO (org chart)</label>'
    +'<select id="nar-reportsto" style="background:var(--bg);border:1px solid var(--border);color:var(--text);'
    +'font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;width:100%">'
    +'<option value="">— Not set —</option>'
    +(fromEng&&fromEng.idcard&&fromEng.idcard.reportsto
      ? engineers.filter(function(e){ return !e.vacant; }).map(function(e){
          var sel = String(e.id)===String(fromEng.idcard.reportsto)?' selected':'';
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
    +'<span style="color:var(--text)">Add as vacancy (open position)</span>'
    +'</label>'

    // Actions
    +'<div style="display:flex;gap:8px;margin-top:4px">'
    +'<button class="primary" onclick="confirmAddResource('+fromEngId+')" '
    +'style="flex:1;font-family:IBM Plex Mono,monospace;letter-spacing:.04em">✓ ADD TO ROSTER</button>'
    +'<button onclick="document.getElementById(\'add-resource-modal\').remove()" '
    +'style="font-family:IBM Plex Mono,monospace">CANCEL</button>'
    +'</div>'
    +'</div>';

  document.body.appendChild(modal);
  document.getElementById('nar-name').focus();
}

// Validates the add-resource modal, creates the engineer, navigates to roster, and shows a toast.
export function confirmAddResource(fromEngId) {
  var name = (document.getElementById('nar-name').value||'').trim();
  if (!name) { alert('Name is required.'); return; }

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

  // Build idcard with reportsto for org chart
  var idcard = {};
  if (reportsTo) idcard.reportsto = reportsTo;

  // Create the engineer
  var newEng = {
    id:           nextEngId++,
    name:         name,
    monthlyCost:  cost,
    groupId:      groupId,
    role:         role,
    location:     location,
    vacant:       vacant,
    skills:       skills,
    idcard:       idcard,
  };

  engineers.push(newEng);

  // Expand the group if it exists
  if (groupId) {
    var g = engGroups.find(function(g){ return g.id === groupId; });
    if (g) g.collapsed = false;
  }

  saveState();

  document.getElementById('add-resource-modal').remove();

  // Show success and navigate to roster
  var msg = '✓ ' + name + ' added to roster'
    + (groupId ? ' (' + (engGroups.find(function(g){return g.id===groupId;})||{}).name + ')' : '')
    + (reportsTo ? '\n  Org chart: reports to '
        + (engineers.find(function(e){ return String(e.id)===String(reportsTo); })||{}).name : '')
    + (copySkills && skills.length ? '\n  ' + skills.length + ' skills copied' : '');

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
