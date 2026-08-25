/* ►► SECTION: TIMELINE ◄◄ Timeline tab: per-project Gantt grid, resource conflicts, drag-to-reorder
 *
 * Functions defined in this file:
 *   toggleTimelineConflict — toggles the "conflicts only" filter and re-renders
 *   _tlDragStart           — drag start for a timeline project row
 *   _tlDragEnd             — drag end for a timeline project row
 *   _tlDragOver            — dragover handler enabling row drop
 *   _tlDrop                — reorders project rows on drop
 *   renderTimeline         — renders the timeline grid (project bars, engineer rows, conflicts)
 *
 * Note: renderTimeline references exportTimelinePDF() in a button onclick — that
 *       function is referenced-but-undefined in the original monolith (preserved verbatim).
 */

// Persisted timeline state
if(typeof _tlState==='undefined'){
  var _tlState={
    conflictOnly: false,
    projOrder:    [],
    mode:         'gantt',   // 'gantt' (committed) | 'plan' (capacity-scheduled pipeline)
  };
}

// toggles the "conflicts only" filter and re-renders
function toggleTimelineConflict(){
  _tlState.conflictOnly=!_tlState.conflictOnly;
  renderTimeline();
}

// Drag-and-drop: batch reorder, only re-render on drop
var _tlDragSrcIdx=null;

// drag start for a timeline project row
function _tlDragStart(e,idx){
  _tlDragSrcIdx=idx;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',String(idx));
  setTimeout(function(){if(e.target)e.target.style.opacity='0.4';},0);
}
// drag end for a timeline project row
function _tlDragEnd(e){
  if(e.target)e.target.style.opacity='';
  _tlDragSrcIdx=null;
}
// dragover handler enabling row drop
function _tlDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
}
// reorders project rows on drop
function _tlDrop(e,targetIdx){
  e.preventDefault();
  var src=_tlDragSrcIdx;
  if(src===null||src===targetIdx)return;
  var arr=_tlState.projOrder;
  var moved=arr.splice(src,1)[0];
  arr.splice(targetIdx,0,moved);
  _tlDragSrcIdx=null;
  renderTimeline();
}

/* ══ Capacity-scheduled pipeline — the pure engine (see TIMELINE-PLAN.md) ══════
   Global-free: takes plain inputs, returns plain data, imported by tests/timeline.test.js.
   Reuses the demand model (charter.demand) + the pipelineCapacity supply math, but kept
   month-resolved so candidates can be scheduled and levelled over time. */

// Spread one candidate's demand over months from a start index. Duration = ceil(fteMonths
// / peakFte) at peakFte per month (final month partial); split across disciplines by the
// byGroup proportions (no byGroup → a single '_unassigned' bucket). Cells outside
// [startIdx, horizon) are dropped and flag `clipped` (the candidate runs past the plan).
export function tlSpreadDemand(demand, startIdx, horizon){
  demand = demand || {};
  var peak = +demand.peakFte, total = +demand.fteMonths;
  var out = { startIdx:startIdx, duration:0, cells:[], clipped:false };
  if(!(peak>0) || !(total>0)) return out;
  var duration = Math.ceil(total/peak);
  out.duration = duration;
  var bg = (demand.byGroup && typeof demand.byGroup==='object') ? demand.byGroup : {};
  var keys = Object.keys(bg).filter(function(k){ return +bg[k]>0; });
  var sumBg = keys.reduce(function(s,k){ return s + (+bg[k]); }, 0);
  for(var d=0; d<duration; d++){
    var idx = startIdx + d;
    var load = (d===duration-1) ? (total - peak*(duration-1)) : peak;   // last month is the remainder
    if(load<=0) continue;
    if(idx<0 || idx>=horizon){ out.clipped = true; continue; }
    var byGroup = {};
    if(keys.length){ keys.forEach(function(k){ byGroup[k] = load * (+bg[k]/sumBg); }); }
    else { byGroup._unassigned = load; }
    out.cells.push({ idx:idx, total:load, byGroup:byGroup });
  }
  return out;
}

// Per-month capacity from an engUtil-shaped list (the same rows pipelineCapacity rolls up):
// { supply, committed, free, byGroup:{gid:{supply,committed,free}} } for each month. A fully
// medical/resigned month with zero alloc adds no supply (matches pipelineCapacity).
export function tlCapacityByMonth(engUtilList, months){
  engUtilList = engUtilList || []; months = months || [];
  var per = months.map(function(){ return { supply:0, committed:0, free:0, byGroup:{} }; });
  function grp(cell, gid){ return cell.byGroup[gid] || (cell.byGroup[gid] = { supply:0, committed:0, free:0 }); }
  engUtilList.forEach(function(eu){
    var gid = eu.grpId || eu.grp || '_ungrouped';
    months.forEach(function(m, i){
      var st = eu.monthStatus && eu.monthStatus[m];
      var a = (eu.monthAllocs && eu.monthAllocs[m]) || 0;
      if((st==='m'||st==='r') && a===0) return;          // inactive person-month
      var cell = per[i], gg = grp(cell, gid);
      cell.supply += 1; gg.supply += 1;
      var c = Math.min(a, 1);
      cell.committed += c; gg.committed += c;
    });
  });
  per.forEach(function(cell){
    cell.free = Math.max(0, cell.supply - cell.committed);
    Object.keys(cell.byGroup).forEach(function(k){ var gg = cell.byGroup[k]; gg.free = Math.max(0, gg.supply - gg.committed); });
  });
  return per;
}

// Schedule candidates (in the given order) against the per-month free envelope. Draws each
// candidate's spread down a running clone of the free capacity; records `breach` for every
// month×discipline (and the month total) that would go negative — even if the total fits.
export function tlSchedule(candidates, capByMonth){
  candidates = candidates || []; capByMonth = capByMonth || [];
  var horizon = capByMonth.length;
  var freeTot = capByMonth.map(function(c){ return c.free; });
  var freeG = capByMonth.map(function(c){ var o = {}; Object.keys(c.byGroup||{}).forEach(function(k){ o[k] = c.byGroup[k].free; }); return o; });
  var results = [];
  candidates.forEach(function(cand){
    var sp = tlSpreadDemand(cand.demand, cand.startIdx||0, horizon);
    var breach = [];
    sp.cells.forEach(function(cell){
      var i = cell.idx;
      if(cell.total > freeTot[i] + 1e-9) breach.push({ monthIdx:i, gid:null, short:cell.total-freeTot[i] });
      Object.keys(cell.byGroup).forEach(function(gid){
        var avail = (freeG[i] && freeG[i][gid]!=null) ? freeG[i][gid] : null;
        if(avail!=null && cell.byGroup[gid] > avail + 1e-9) breach.push({ monthIdx:i, gid:gid, short:cell.byGroup[gid]-avail });
      });
      freeTot[i] -= cell.total;
      Object.keys(cell.byGroup).forEach(function(gid){ if(freeG[i] && freeG[i][gid]!=null) freeG[i][gid] -= cell.byGroup[gid]; });
    });
    results.push({ id:cand.id, spread:sp, breach:breach, clipped:sp.clipped });
  });
  return { results:results, freeTot:freeTot, freeByGroup:freeG };
}

// Earliest start index at which a candidate fits under free capacity for its whole duration
// (against the BASE envelope, ignoring other candidates). -1 if it never fits in the horizon.
export function tlEarliestFit(demand, capByMonth, fromIdx){
  capByMonth = capByMonth || []; fromIdx = fromIdx || 0;
  var horizon = capByMonth.length;
  for(var s=fromIdx; s<horizon; s++){
    var sp = tlSpreadDemand(demand, s, horizon);
    if(!sp.cells.length) return -1;      // no positive demand → nothing to place
    if(sp.clipped) break;                // any later start also runs past the horizon
    var ok = true;
    for(var c=0; c<sp.cells.length && ok; c++){
      var cell = sp.cells[c], i = cell.idx;
      if(cell.total > capByMonth[i].free + 1e-9){ ok = false; break; }
      var keys = Object.keys(cell.byGroup);
      for(var k=0; k<keys.length; k++){
        var gid = keys[k], gg = capByMonth[i].byGroup[gid];
        if(gg && cell.byGroup[gid] > gg.free + 1e-9){ ok = false; break; }
      }
    }
    if(ok) return s;
  }
  return -1;
}

/* ══ Capacity-plan mode — the forward scheduler UI (see TIMELINE-PLAN.md) ══════ */

// The Gantt/Plan mode toggle, shown atop both views.
function tlModeBar(){
  function b(mode,label){ var on=_tlState.mode===mode;
    return '<button onclick="tlSetMode(\''+mode+'\')" class="sm'+(on?' active':'')+'" style="font-size:9px;padding:2px 10px'
      +(on?';border-color:var(--accent);color:var(--accent);background:rgba(200,241,53,.08)':'')+'">'+label+'</button>'; }
  return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em">VIEW</span>'
    +b('gantt','▦ '+t('Gantt (committed)'))+b('plan','⛰ '+t('Capacity plan'))+'</div>';
}
function tlSetMode(m){ _tlState.mode=(m==='plan'?'plan':'gantt'); renderTimeline(); }

// Candidate rows for the plan: proposed/on_hold projects with a demand estimate; startIdx from
// the persisted charter.demand.startMonth (unset → unscheduled = "to place").
function tlPlanCandidates(months){
  var out=[];
  projects.forEach(function(p){
    var lc=(typeof projLifecycle==='function')?projLifecycle(p):'active';
    if(lc!=='proposed' && lc!=='on_hold') return;
    var dem=(p.charter && p.charter.demand && typeof p.charter.demand==='object')?p.charter.demand:null;
    if(!dem || !(+dem.fteMonths>0)) return;
    var sm=(typeof dem.startMonth==='string')?dem.startMonth:null;
    var idx=(sm && months.indexOf(sm)>=0)?months.indexOf(sm):0;
    out.push({ id:p.id, name:p.name||'Untitled', color:safeColor(p.color||'var(--accent)'),
      demand:dem, startMonth:(sm && months.indexOf(sm)>=0)?sm:null, startIdx:idx,
      scheduled:!!(sm && months.indexOf(sm)>=0) });
  });
  return out;
}

// A summary row (free capacity / committed) across the month axis.
function tlPlanRow(label, months, LW, CW, fn, hero){
  var h='<div style="display:flex;border-bottom:1px solid var(--border);background:'+(hero?'rgba(200,241,53,.03)':'transparent')+'">'
   +'<div style="width:'+LW+'px;flex-shrink:0;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);padding:6px 8px;border-right:1px solid var(--border)">'+escH(label)+'</div><div style="display:flex">';
  months.forEach(function(m,i){
    var d=fn(i);
    h+='<div title="'+escH(d.val)+'" style="width:'+CW+'px;flex-shrink:0;height:26px;border-right:1px solid var(--border);position:relative;display:flex;align-items:flex-end;justify-content:center">'
     +'<div style="width:70%;height:'+Math.max(2,d.barH)+'%;background:'+(d.neg?'var(--danger)':d.col)+';opacity:'+(d.faint?0.3:0.5)+'"></div>'
     +'<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:7px;font-family:IBM Plex Mono,monospace;color:'+d.col+'">'+escH(d.val)+'</span></div>';
  });
  return h+'</div></div>';
}

// One candidate row: swatch + name + breach flag + start selector, then its spread bars.
function tlPlanCandRow(cand, months, LW, CW, result, supplyMax){
  var breachMonth={}, loadByIdx={};
  if(result){ result.breach.forEach(function(b){ breachMonth[b.monthIdx]=1; });
    result.spread.cells.forEach(function(c){ loadByIdx[c.idx]=c.total; }); }
  var opts='<option value="">'+escH(t('— place —'))+'</option>'
    +months.map(function(m){ return '<option value="'+escH(m)+'"'+(cand.startMonth===m?' selected':'')+'>'+m.slice(5,7)+'/'+m.slice(2,4)+'</option>'; }).join('');
  var flag='';
  if(result && result.breach.length) flag='<span title="'+escH(t('over capacity'))+'" style="color:var(--danger);font-size:9px">⛔</span>';
  else if(result && result.clipped) flag='<span title="'+escH(t('runs past the period'))+'" style="color:var(--warn);font-size:9px">⋯</span>';
  else if(cand.scheduled) flag='<span title="'+escH(t('fits'))+'" style="color:var(--accent);font-size:9px">✓</span>';
  var h='<div style="display:flex;border-bottom:1px solid var(--border)'+(!cand.scheduled?';opacity:.7':'')+'">'
   +'<div style="width:'+LW+'px;flex-shrink:0;display:flex;align-items:center;gap:5px;padding:4px 8px;border-right:1px solid var(--border)">'
   +'<span style="width:8px;height:8px;border-radius:2px;background:'+cand.color+';flex-shrink:0"></span>'
   +'<span style="font-size:10px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+escH(cand.name)+'">'+escH(cand.name)+'</span>'
   +flag
   +'<select onchange="tlSetStart('+cand.id+',this.value)" title="'+escH(t('Start month'))+'" style="font-size:8px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:1px 2px;max-width:52px">'+opts+'</select>'
   +'</div><div style="display:flex">';
  months.forEach(function(m,i){
    var load=loadByIdx[i]||0, barH=Math.round(Math.min(1,load/supplyMax)*100), br=breachMonth[i];
    h+='<div style="width:'+CW+'px;flex-shrink:0;height:24px;border-right:1px solid var(--border);display:flex;align-items:flex-end;justify-content:center">'
     +(load>0?'<div title="'+load.toFixed(1)+' FTE" style="width:74%;height:'+Math.max(6,barH)+'%;background:'+(br?'var(--danger)':cand.color)+';border-radius:2px 2px 0 0"></div>':'')
     +'</div>';
  });
  return h+'</div></div>';
}

// The capacity-plan view: FREE + COMMITTED summary rows, then scheduled + palette candidates.
function renderTimelinePlan(body, months, cur){
  var CW=Math.max(24,Math.min(42,Math.floor(760/months.length))), LW=214;
  var cands=tlPlanCandidates(months);
  var scheduled=cands.filter(function(c){return c.scheduled;});
  var unscheduled=cands.filter(function(c){return !c.scheduled;});
  var engUtilList=[]; try{ engUtilList=Object.values(_buildEngUtil(months)); }catch(e){}
  var cap=tlCapacityByMonth(engUtilList, months);
  var sched=tlSchedule(scheduled, cap);
  var supplyMax=Math.max(1, cap.reduce(function(m,c){ return Math.max(m,c.supply); },0));

  var h='<div style="display:flex;flex-direction:column;height:100%;gap:0">'+tlModeBar();
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">'
   +'<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">'+t('CAPACITY PLAN — SCHEDULE THE PIPELINE')+'</h3>'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('{a} scheduled · {b} to place · {n} months',{a:scheduled.length,b:unscheduled.length,n:months.length})+'</span>'
   +'<div style="flex:1"></div>'
   +'<div style="display:flex;gap:8px;font-size:9px;font-family:IBM Plex Mono,monospace;align-items:center">'
   +'<span style="color:var(--accent)">▲ free</span><span style="color:var(--danger)">⛔ over capacity</span></div>'
   +'<button onclick="tlAutoLevel()" class="sm" style="font-size:9px;padding:2px 10px;border-color:var(--accent);color:var(--accent)">⚡ '+t('Auto-level')+'</button>'
   +'</div>';
  if(!cands.length){ body.innerHTML=h+'<div style="color:var(--muted);font-size:11px;padding:22px;font-family:IBM Plex Mono,monospace">'+t('No candidates to schedule — set a project to Proposed and give it a demand estimate (peak FTE + FTE·months) on the Pipeline board.')+'</div></div>'; return; }

  h+='<div style="flex:1;overflow:auto;min-height:0"><div style="min-width:'+(LW+months.length*CW+8)+'px">';
  // month header
  h+='<div style="display:flex;position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--border)">'
   +'<div style="width:'+LW+'px;flex-shrink:0;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);padding:4px 8px;border-right:1px solid var(--border)">'+t('CANDIDATE / START')+'</div><div style="display:flex">'
   +months.map(function(m){ var isCur=m===cur; return '<div style="width:'+CW+'px;flex-shrink:0;text-align:center;font-family:IBM Plex Mono,monospace;font-size:8px;color:'+(isCur?'var(--accent)':'var(--muted)')+';padding:3px 0;border-right:1px solid var(--border)">'+m.slice(5,7)+'/'+m.slice(2,4)+'</div>'; }).join('')
   +'</div></div>';
  // free (after scheduling) + committed rows
  h+=tlPlanRow('▲ '+t('Free FTE'), months, LW, CW, function(i){
    var f=sched.freeTot[i], col=f<-0.001?'var(--danger)':(f<1?'var(--warn)':'var(--accent)');
    return { val:f.toFixed(1), col:col, barH:Math.round(Math.min(1,Math.max(0,f)/supplyMax)*100), neg:f<-0.001 };
  }, true);
  h+=tlPlanRow('░ '+t('Committed'), months, LW, CW, function(i){
    return { val:cap[i].committed.toFixed(1), col:'var(--muted)', barH:Math.round(cap[i].committed/supplyMax*100), faint:true };
  }, false);
  // candidate rows
  scheduled.forEach(function(c,k){ h+=tlPlanCandRow(c, months, LW, CW, sched.results[k], supplyMax); });
  unscheduled.forEach(function(c){ h+=tlPlanCandRow(c, months, LW, CW, null, supplyMax); });
  h+='</div></div></div>';
  body.innerHTML=h;
}

// Set / clear a candidate's scheduled start (persisted on charter.demand.startMonth).
function tlSetStart(pid, month){
  var p=projects.find(function(x){return x.id===Number(pid);}); if(!p) return;
  if(!p.charter||typeof p.charter!=='object') p.charter=makeCharter();
  if(!p.charter.demand||typeof p.charter.demand!=='object') p.charter.demand=makeCharterDemand();
  p.charter.demand.startMonth=(month===''||month==null)?null:String(month);
  saveState(); renderTimeline();
}
// Greedy resource-level: place every candidate at its earliest fit against the running envelope.
function tlAutoLevel(){
  var months=getMonthRange(); if(!months.length) return;
  var engUtilList=[]; try{ engUtilList=Object.values(_buildEngUtil(months)); }catch(e){}
  var cap=tlCapacityByMonth(engUtilList, months);
  var free=cap.map(function(c){ var bg={}; Object.keys(c.byGroup).forEach(function(k){ bg[k]={free:c.byGroup[k].free}; }); return { free:c.free, byGroup:bg }; });
  var cands=projects.filter(function(p){ var lc=projLifecycle(p); return (lc==='proposed'||lc==='on_hold') && p.charter && p.charter.demand && +p.charter.demand.fteMonths>0; });
  var changed=0;
  cands.forEach(function(p){
    var dem=p.charter.demand, s=tlEarliestFit(dem, free, 0);
    if(s<0) return;
    var sp=tlSpreadDemand(dem, s, months.length);
    sp.cells.forEach(function(cell){ free[cell.idx].free-=cell.total;
      Object.keys(cell.byGroup).forEach(function(gid){ if(free[cell.idx].byGroup[gid]) free[cell.idx].byGroup[gid].free-=cell.byGroup[gid]; }); });
    if(dem.startMonth!==months[s]){ dem.startMonth=months[s]; changed++; }
  });
  if(changed) saveState();
  renderTimeline();
}

// renders the timeline grid (project bars, engineer rows, conflicts)
function renderTimeline(){
  var body=G('res-body');if(!body)return;
  var months=getMonthRange();
  var cur=curMonth();

  if(!months.length){
    body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:200px;flex-direction:column;gap:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px"><div style="font-size:28px">📅</div><div>Set FROM and TO dates in the header first</div></div>';
    return;
  }

  if(_tlState.mode==='plan'){ renderTimelinePlan(body, months, cur); return; }

  // Build conflict map: for each engineer per month, sum allocations
  var engMonthSum={};
  engineers.filter(function(e){return !e.vacant;}).forEach(function(eng){
    engMonthSum[eng.id]={};
    months.forEach(function(m){
      engMonthSum[eng.id][m]=allocRows.filter(function(r){return r.engId===eng.id;})
        .reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);
    });
  });

  // Projects that have at least one allocation row
  var _allActive=projects.filter(function(p){
    return allocRows.some(function(r){return r.projectId===p.id&&months.some(function(m){return r.allocs&&r.allocs[m]>0;});});
  });
  // Sync drag order
  var _activeIds=_allActive.map(function(p){return p.id;});
  _tlState.projOrder=_tlState.projOrder.filter(function(id){return _activeIds.indexOf(id)>=0;});
  _activeIds.forEach(function(id){if(_tlState.projOrder.indexOf(id)<0)_tlState.projOrder.push(id);});
  var activeProjects=_tlState.projOrder.map(function(id){return _allActive.find(function(p){return p.id===id;});}).filter(Boolean);
  // Conflict-only filter
  if(_tlState.conflictOnly){
    activeProjects=activeProjects.filter(function(proj){
      var pRows=allocRows.filter(function(r){return r.projectId===proj.id;});
      var eIds=pRows.map(function(r){return r.engId;});
      return months.some(function(m){return eIds.some(function(eid){return engMonthSum[eid]&&engMonthSum[eid][m]>1.005;});});
    });
  }

  var CELL_W=Math.max(22,Math.min(40,Math.floor(800/months.length)));
  var ROW_H=34;
  var LABEL_W=200;
  var ENG_H=24;

  var h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';
  h+=tlModeBar();
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'
   +'<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">PROJECT TIMELINE &amp; RESOURCE CONFLICTS</h3>'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+activeProjects.length+' active projects · '+months.length+' months</span>'
   +'<div style="flex:1"></div>'
   +'<div style="display:flex;gap:8px;font-size:9px;font-family:IBM Plex Mono,monospace;align-items:center">'
   +'<span style="color:var(--accent)">█ allocated</span>'
   +'<span style="color:var(--danger)">█ conflict &gt;100%</span>'
   +'<span style="color:var(--accent2)">█ current month</span>'
   +'<span style="color:var(--muted)">░ partial</span>'
   +'</div>'
   +'<button onclick="toggleTimelineConflict()" class="sm'
   +(_tlState.conflictOnly?' active':'')+'" '
   +'style="font-size:9px;padding:2px 8px'
   +(_tlState.conflictOnly?';border-color:var(--danger);color:var(--danger)':'')+'">'
   +'⚠ CONFLICTS ONLY'+(_tlState.conflictOnly?' ✓':'')+' </button>'
   +'<button class="add-row-btn" onclick="exportTimelinePDF()" style="border-color:#5be5c8;color:#5be5c8;font-size:9px">&#8595; PDF</button>'
   +'</div>'
   +'<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);margin-bottom:6px">↕ Drag rows to reorder · hover cells for details</div>';

  // ── Scrollable grid ────────────────────────────────────────────
  h+='<div style="flex:1;overflow:auto;min-height:0">';
  h+='<div style="min-width:'+(LABEL_W+months.length*CELL_W+8)+'px">';

  // Month header row
  h+='<div style="display:flex;position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--border)">'
   +'<div style="width:'+LABEL_W+'px;flex-shrink:0;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);padding:4px 8px;border-right:1px solid var(--border)">PROJECT / ENGINEERS</div>'
   +'<div style="display:flex">'
   +months.map(function(m){
     var isCur=m===cur;
     var label=m.slice(5,7)+'/'+m.slice(2,4);
     return '<div style="width:'+CELL_W+'px;flex-shrink:0;text-align:center;font-family:IBM Plex Mono,monospace;font-size:'+(CELL_W<28?'7':'8')+'px;color:'+(isCur?'var(--accent)':'var(--muted)')+';padding:3px 0;'+(isCur?'background:rgba(200,241,53,.06)':'')+';border-right:1px solid var(--border)">'+label+'</div>';
   }).join('')
   +'</div></div>';

  // Project rows
  activeProjects.forEach(function(proj){
    var pcol=safeColor(proj.color);
    var sec=sections.find(function(s){return s.id===proj.sectionId;});
    var projRows=allocRows.filter(function(r){return r.projectId===proj.id;});
    var projEngs=projRows.map(function(r){return engineers.find(function(e){return e.id===r.engId;});}).filter(Boolean);
    projEngs=[...new Map(projEngs.map(function(e){return [e.id,e];})).values()];

    // Project bar: presence per month
    var projPresence=months.map(function(m){return projRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);});
    var projStartIdx=projPresence.findIndex(function(v){return v>0;});
    var projEndIdx=projPresence.length-1-[...projPresence].reverse().findIndex(function(v){return v>0;});

    // Project header row
    h+='<div draggable="true" '      +'ondragstart="_tlDragStart(event,'+activeProjects.indexOf(proj)+')" '      +'ondragend="_tlDragEnd(event)" '      +'ondragover="_tlDragOver(event)" '      +'ondrop="_tlDrop(event,'+activeProjects.indexOf(proj)+')" '      +'style="display:flex;align-items:stretch;border-bottom:1px solid var(--border);cursor:grab">'
     +'<div style="width:'+LABEL_W+'px;flex-shrink:0;display:flex;align-items:center;gap:6px;padding:4px 8px;border-right:1px solid var(--border);background:var(--surface)">'
     +'<span style="color:var(--muted);font-size:10px;margin-right:2px">⠿</span>'
     +'<div style="width:8px;height:8px;border-radius:2px;background:'+pcol+';flex-shrink:0"></div>'
     +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;font-weight:700;color:'+pcol+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:'+(LABEL_W-40)+'px" title="'+escH(proj.name)+'">'+escH(proj.name)+'</div>'
     +(sec?'<div style="font-size:8px;color:var(--muted);white-space:nowrap">'+escH(sec.name)+'</div>':'')
     +'</div>'
     +'<div style="display:flex;position:relative">'
     +months.map(function(m,i){
       var v=projPresence[i];
       var isCur=m===cur;
       var inProj=v>0.001;
       var isStart=i===projStartIdx;
       var isEnd=i===projEndIdx;
       var bg=!inProj?'transparent':isCur?'rgba(200,241,53,.25)':'rgba(200,241,53,.12)';
       var border=isStart?'border-left:2px solid '+pcol+';':'';
       var border2=isEnd?'border-right:2px solid '+pcol+';':'';
       var fteLabel=v>0.1?Math.round(v*10)/10+'':'' ;
       return '<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+ROW_H+'px;background:'+bg+';'+border+border2+
         (isCur?'border-top:1px solid rgba(200,241,53,.3);border-bottom:1px solid rgba(200,241,53,.3);':'')+
         'display:flex;align-items:center;justify-content:center;border-right:1px solid rgba(255,255,255,.04)">'
         +(inProj&&CELL_W>25?'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--accent);opacity:.7">'+fteLabel+'</span>':'')
         +'</div>';
     }).join('')
     +'</div></div>';

    // Engineer rows within this project
    projEngs.forEach(function(eng){
      var engRows=projRows.filter(function(r){return r.engId===eng.id;});
      var photo=_photoCache&&_photoCache.get(eng.id);
      var ini=(eng.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
      var av=photo
        ?'<img src="'+photo+'" style="width:14px;height:14px;border-radius:50%;object-fit:cover;flex-shrink:0">'
        :'<div style="width:14px;height:14px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:var(--muted);flex-shrink:0">'+ini+'</div>';

      h+='<div style="display:flex;align-items:stretch;border-bottom:1px solid rgba(255,255,255,.04)">'
       +'<div style="width:'+LABEL_W+'px;flex-shrink:0;display:flex;align-items:center;gap:5px;padding:2px 8px 2px 20px;border-right:1px solid var(--border)">'
       +av
       +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:'+(LABEL_W-50)+'px">'+escH(eng.name)+'</div>'
       +'</div>'
       +'<div style="display:flex">'
       +months.map(function(m){
         var v=engRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);
         var totalV=engMonthSum[eng.id]&&engMonthSum[eng.id][m]||0;
         var isConflict=totalV>1.005;
         var isCur=m===cur;
         var alpha=Math.round(v*80);
         var bg=v<0.01?'transparent':isConflict?'rgba(241,67,53,0.'+Math.min(90,40+alpha)+')':'rgba(200,241,53,0.'+(20+Math.round(v*60))+')';
         var pctLabel=v>0.05?Math.round(v*100)+'':'' ;
         return '<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+ENG_H+'px;background:'+bg+';'+(isCur?'border-top:1px solid rgba(200,241,53,.2);border-bottom:1px solid rgba(200,241,53,.2);':'')+
           'display:flex;align-items:center;justify-content:center;border-right:1px solid rgba(255,255,255,.03)" title="'+escH(eng.name)+' · '+m+' · '+Math.round(v*100)+'%'+(isConflict?' ⚠ CONFLICT: total '+Math.round(totalV*100)+'%':'')+'"><span style="font-family:IBM Plex Mono,monospace;font-size:7px;color:'+(isConflict?'var(--danger)':'var(--accent)')+';opacity:.8">'+( CELL_W>25?pctLabel:'')+'</span></div>';
       }).join('')
       +'</div></div>';
    });
  });

  // ── Conflict summary row ────────────────────────────────────────
  var conflictEngs=engineers.filter(function(eng){
    return months.some(function(m){return engMonthSum[eng.id]&&engMonthSum[eng.id][m]>1.005;});
  });
  if(conflictEngs.length){
    h+='<div style="margin-top:16px;padding:10px 12px;background:rgba(241,67,53,.08);border:1px solid rgba(241,67,53,.3);border-radius:7px">'
     +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--danger);margin-bottom:8px;letter-spacing:.06em">&#9888; ALLOCATION CONFLICTS</div>'
     +'<div style="display:flex;flex-direction:column;gap:4px">';
    conflictEngs.forEach(function(eng){
      var cmths=months.filter(function(m){return engMonthSum[eng.id][m]>1.005;});
      var projNames=cmths.map(function(m){
        return allocRows.filter(function(r){return r.engId===eng.id&&r.allocs&&r.allocs[m]>0;}).map(function(r){
          var p=projects.find(function(p){return p.id===r.projectId;});return p?p.name:'?';
        }).filter(Boolean);
      }).flat();
      var uniqueProjs=[...new Set(projNames)];
      h+='<div style="display:flex;align-items:center;gap:8px;font-size:9px;font-family:IBM Plex Mono,monospace">'
       +'<span style="color:var(--danger);font-weight:700">'+escH(eng.name)+'</span>'
       +'<span style="color:var(--muted)">over-allocated in '+cmths.slice(0,4).map(function(m){return m.slice(0,7);}).join(', ')+(cmths.length>4?'…':'')+'</span>'
       +'<span style="color:var(--muted)">across: '+uniqueProjs.slice(0,3).map(function(n){return escH(n);}).join(', ')+(uniqueProjs.length>3?'…':'')+'</span>'
       +'</div>';
    });
    h+='</div></div>';
  }

  h+='</div></div></div>';
  body.innerHTML=h;
}
