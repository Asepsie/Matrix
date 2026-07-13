/* ►► SECTION: EXECUTIVE-SUMMARY ◄◄ INSIGHTS › Executive summary.
 *
 * A one-page, read-only cross-domain COCKPIT. Where the existing Summary overlay
 * is execution detail (risks/actions/todos/milestones), this is portfolio-strategy
 * altitude: value + cost + capacity + talent + risk on a single screen, each tile a
 * pure function of an EXISTING dataset — nothing here mutates state or invents a
 * number:
 *   value/decision  — ecDataset()        (NPV / risk-adj NPV / PI / revenue / margin / conflicts)
 *   cost / spend    — pfBuildDataset()    (loaded team cost, ROI, overdue milestones)
 *   capacity        — _buildEngUtil()     (FTE this month, bench) — same source as the cost dashboard
 *   people / talent — buildAnalyticsDataset() (headcount, comparatio, Talent Risk Score)
 *   skills          — buildSkillMap()     (single points of failure)
 *   route-to-market — chanConcentration() (channel HHI)
 *
 * Shares the global FROM/TO period like every Resources tab. All ids `xs`-prefixed
 * (flat-bundle uniqueness). KPI cards / callouts drill into their source tab via
 * railGo(). The only new primitive is xsBubbleSvg (value × risk × cost).
 */

// Spend-map controls (UI-only, mirrors the Portfolio-analytics treemap).
var _xsSpend={ by:'cost', group:'none' };

// KPI card. `sub` may contain HTML. `clickTo` = a rail view id → drill to source tab.
function xsKpi(val,label,sub,color,clickTo){
  const click=clickTo?' onclick="railGo(event,\''+clickTo+'\')" title="'+escH(t('Open {v}',{v:clickTo}))+'"':'';
  return '<div class="xs-kpi" style="flex:1;min-width:140px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:11px 13px'+(clickTo?';cursor:pointer':'')+'"'+click+'>'
    +'<div style="font-size:20px;font-weight:700;color:'+(color||'var(--text)')+';line-height:1.1">'+val+'</div>'
    +'<div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;letter-spacing:.05em;text-transform:uppercase;margin-top:4px">'+escH(label)+'</div>'
    +(sub?'<div style="font-size:10px;color:var(--dim);margin-top:2px">'+sub+'</div>':'')+'</div>';
}

// The FROM/TO current month clamped into the period (matches the cost dashboard, so
// "FTE this month" / bench stay meaningful when the plan doesn't span today).
function xsCurInRange(months){
  const cur=_dashCur();
  if(!months.length) return cur;
  if(months.indexOf(cur)>=0) return cur;
  return cur<months[0]?months[0]:months[months.length-1];
}

// Per-month {cost, utilPct} over the period. Cost = loaded team cost (uncapped,
// project-attribution lens, same math as pfBuildDataset). Utilisation = allocated
// FTE ÷ headcount (from _buildEngUtil, the cost-dashboard primitive), so a value
// over 100% flags portfolio-wide over-allocation.
function xsMonthlySeries(months){
  const engById=_engByIdMap();
  const util=_buildEngUtil(months);
  const engs=Object.values(util);
  const cap=engs.length||1;
  return months.map(function(m){
    let cost=0;
    allocRows.forEach(function(r){
      if(r.projectId==null) return;
      const eng=engById.get(r.engId), mc=eng?(eng.monthlyCost||0):0;
      cost+=_allocCost(r.allocs?r.allocs[m]:null, mc);
    });
    const alloc=engs.reduce(function(s,eu){return s+(eu.monthAllocs[m]||0);},0);
    return {m:m, cost:cost, utilPct:alloc/cap*100};
  });
}

// ── entry point ──────────────────────────────────────────────────────────────
function renderExecTab(){
  const body=G('res-body'); if(!body) return;
  const months=getMonthRange();
  let h='<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';
  h+='<div style="display:flex;align-items:baseline;gap:10px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);letter-spacing:.06em">'+t('◎ EXECUTIVE SUMMARY')+'</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
    +(months.length?t('over {n} month(s) · FROM/TO period · click a tile to drill in',{n:months.length}):t('set a FROM/TO period for cost & capacity'))
    +'</span></div>';
  if(!projects.length && !engineers.length){ body.innerHTML=h+pfEmpty(t('Nothing to summarise yet — add projects and a team.'))+'</div>'; return; }

  h+=xsScorecard(months);

  // Two headline visuals side by side (equal height; stack on narrow).
  const eco=ecDataset();
  h+='<div class="xs-eqrow">'
    +'<div class="xs-col" id="xs-sec-spend">'+xsSpendSection()+'</div>'
    +'<div class="xs-col">'+pfSection(t('VALUE vs RISK'), t('Each project by NPV (value) and total risk exposure (Σ RPN). Bubble size = team cost. Top-right = valuable AND risky — your watch list.'), xsBubbleSvg(eco))+'</div>'
    +'</div>';

  h+='<div id="xs-sec-burn">'+pfSection(t('COST BURN'), t('Loaded team cost per month (bars, left €) with resource utilisation (line, right %) and the period average. Marker = current month.'), xsBurnSvg(months))+'</div>';

  h+=pfSection(t('NEEDS ATTENTION'), t('The few things worth a decision this week — pulled from talent risk, delivery, and channel concentration.'), xsAttention(months));

  h+='<div id="xs-sec-sched">'+xsScheduleSection()+'</div>';

  h+='<div id="xs-sec-pins">'+xsPlannerPins()+'</div>';

  h+='</div>';
  body.innerHTML=h;
}

// Re-render the "my week" surfaces in place after a check-off (no scroll jump).
function xsRefreshWeek(){
  const s=G('xs-sec-sched'); if(s) s.innerHTML=xsScheduleSection();
  const p=G('xs-sec-pins');  if(p) p.innerHTML=xsPlannerPins();
}

// ── WEEK PLANNER — drag meetings & pinned tasks onto a day ────────────────────
// Meetings carry a per-week `tp.day`; pinned tasks/actions carry an `execDay`
// (both optional ISO 'YYYY-MM-DD'; when unset the item stays in the Unscheduled
// pool). Nothing is placed by due date — the user drags what they plan that day.
function xsScheduleSection(){
  const monday=(typeof tegMonday==='function')?tegMonday(new Date()):new Date();
  const iso=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
  const days=[]; for(let i=0;i<7;i++){ const d=new Date(monday); d.setDate(monday.getDate()+i); days.push(d); }
  const dayKeys=days.map(iso), todayISO=iso(new Date());
  const dayNames=[t('Mon'),t('Tue'),t('Wed'),t('Thu'),t('Fri'),t('Sat'),t('Sun')];
  const inWeek=function(k){ return !!k && dayKeys.indexOf(k)>=0; };

  const meetings=(typeof tegThisWeekList==='function')?tegThisWeekList():[];
  const tasks=xsPinnedItems().filter(function(it){return it.kind!=='risk';});  // to-dos + actions
  const open='<button class="sm" onclick="railGo(event,\'engagement\')" style="border-color:var(--accent);color:var(--accent)">'+t('Engagement planner →')+'</button>';

  if(!meetings.length && !tasks.length){
    return pfSectionShell(t('WEEK PLANNER'), t('Drag meetings and pinned tasks onto a day.'), open,
      pfEmpty(t('Nothing to plan yet — pin tasks/actions (📌) in Backlog & planner and add touchpoints in the Engagement planner.')));
  }

  // Draggable chips (checkbox = done; onmousedown stopPropagation so ticking never starts a drag).
  const meetChip=function(x){
    const tcol=TEG_TIER_COLOR[x.en.tier]||'var(--muted)', m=tegActionMeta(x.tp.type);
    return '<div draggable="true" ondragstart="xsDragStart(event,\'m|'+x.eng.id+'\')" title="'+escH((x.eng.name||'')+' — '+t(m.label))+'" '
      +'style="display:flex;align-items:center;gap:6px;border:1px solid '+tcol+';border-radius:13px;padding:3px 8px;background:'+tcol+'14;cursor:grab;font-size:11px'+(x.tp.done?';opacity:.55':'')+'">'
      +'<input type="checkbox"'+(x.tp.done?' checked':'')+' onmousedown="event.stopPropagation()" onchange="xsSchedToggleMeeting('+x.eng.id+')" style="width:13px;height:13px;cursor:pointer">'
      +'<span style="color:'+tcol+';font-weight:600'+(x.tp.done?';text-decoration:line-through':'')+'">'+m.icon+' '+escH((x.eng.name||'').split(' ')[0])+'</span></div>';
  };
  const taskChip=function(it){
    const col=it.kind==='action'?'#a78bfa':'var(--accent)';
    return '<div draggable="true" ondragstart="xsDragStart(event,\'t|'+it.p.id+'|'+it.kind+'|'+it.id+'\')" title="'+escH((it.text||'')+' · '+(it.p.name||''))+'" '
      +'style="display:flex;align-items:flex-start;gap:5px;border:1px solid '+col+'55;border-left:3px solid '+col+';border-radius:5px;padding:4px 7px;background:var(--surface);cursor:grab;font-size:10px'+(it.done?';opacity:.55':'')+'">'
      +'<input type="checkbox"'+(it.done?' checked':'')+' onmousedown="event.stopPropagation()" onchange="xsPinToggleDone('+it.p.id+',\''+it.kind+'\','+it.id+')" style="width:12px;height:12px;margin-top:1px;cursor:pointer;flex-shrink:0">'
      +'<span style="color:var(--text);line-height:1.25'+(it.done?';text-decoration:line-through':'')+'">'+escH((it.text||t('(empty)')).slice(0,40))+'</span></div>';
  };

  // Unscheduled pool (droppable → clears the day).
  const poolMeet=meetings.filter(function(x){return !inWeek(x.tp.day);});
  const poolTask=tasks.filter(function(it){return !inWeek(it.execDay);});
  let inner='<div ondragover="xsDragOver(event)" ondrop="xsDrop(event,\'\')" '
    +'style="border:1px dashed var(--border);border-radius:8px;padding:8px 10px;margin-bottom:10px">'
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:6px">'+t('UNSCHEDULED — drag onto a day')+'</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:6px;min-height:26px">';
  poolMeet.forEach(function(x){ inner+=meetChip(x); });
  poolTask.forEach(function(it){ inner+=taskChip(it); });
  if(!poolMeet.length && !poolTask.length) inner+='<span style="font-size:10px;color:var(--accent2)">'+t('all scheduled ✓')+'</span>';
  inner+='</div></div>';

  // Day columns (droppable → sets the day).
  inner+='<div style="display:flex;gap:6px;overflow-x:auto">';
  days.forEach(function(d,i){
    const key=iso(d), isToday=key===todayISO;
    const dMeet=meetings.filter(function(x){return x.tp.day===key;});
    const dTask=tasks.filter(function(it){return it.execDay===key;});
    inner+='<div ondragover="xsDragOver(event)" ondrop="xsDrop(event,\''+key+'\')" '
      +'style="flex:1;min-width:106px;border:1px '+(isToday?'solid var(--accent2)':'dashed var(--border)')+';border-radius:7px;background:'+(isToday?'rgba(91,229,200,.06)':'var(--bg)')+';display:flex;flex-direction:column">'
      +'<div style="padding:4px 7px;border-bottom:1px solid var(--border);font-family:IBM Plex Mono,monospace;font-size:9px;color:'+(isToday?'var(--accent2)':'var(--muted)')+'">'+escH(dayNames[i])+' '+d.getDate()+(isToday?' • '+t('today'):'')+'</div>'
      +'<div style="padding:5px;display:flex;flex-direction:column;gap:5px;min-height:64px;flex:1">';
    dMeet.forEach(function(x){ inner+=meetChip(x); });
    dTask.forEach(function(it){ inner+=taskChip(it); });
    if(!dMeet.length && !dTask.length) inner+='<span style="font-size:9px;color:var(--dim)">·</span>';
    inner+='</div></div>';
  });
  inner+='</div>';
  inner+='<div style="font-size:9px;color:var(--dim);margin-top:6px;font-family:IBM Plex Mono,monospace">'+t('drag a chip onto a day · drag back to Unscheduled to remove · checkbox marks it done')+'</div>';

  return pfSectionShell(t('WEEK PLANNER'), t('Week of {w} · drag engagement meetings and pinned tasks onto the day you plan to do them.',{w:(typeof tegWeekLabel==='function'?tegWeekLabel(iso(monday)):'')}), open, inner);
}
function xsSchedToggleMeeting(engId){
  const eng=engineers.find(function(e){return e.id===engId;}); if(!eng) return;
  const tp=(typeof tegTp==='function')?tegTp(tegEng(eng),tegCurWeek()):null;
  if(tp){ tp.done=!tp.done; saveState(); }
  xsRefreshWeek();
}
// Drag-and-drop day planner. Token: 'm|engId' (meeting) or 't|pid|kind|id' (task).
function xsDragStart(ev,token){ if(ev.dataTransfer){ ev.dataTransfer.setData('text/plain',token); ev.dataTransfer.effectAllowed='move'; } }
function xsDragOver(ev){ ev.preventDefault(); if(ev.dataTransfer) ev.dataTransfer.dropEffect='move'; }
function xsDrop(ev,dayKey){
  ev.preventDefault();
  const tok=ev.dataTransfer?ev.dataTransfer.getData('text/plain'):''; if(!tok) return;
  const parts=tok.split('|');
  if(parts[0]==='m'){
    const eng=engineers.find(function(e){return e.id==parts[1];}); if(!eng) return;   // loose: token is string
    const tp=(typeof tegTp==='function')?tegTp(tegEng(eng),tegCurWeek()):null;
    if(tp){ tp.day=dayKey||null; saveState(); }
  } else if(parts[0]==='t'){
    const p=projects.find(function(x){return x.id==parts[1];}); if(!p) return;
    const r=(typeof projItemRaw==='function')?projItemRaw(p,parts[2],+parts[3]):null;
    if(r){ r.execDay=dayKey||null; saveState(); }
  }
  xsRefreshWeek();
}

// ── "My week" — todos/risks/actions pinned (📌) from Backlog & planner ────────
function xsPinnedItems(){
  const out=[], today=new Date();
  const asg=function(o){ return (typeof resolveAssignee==='function')?resolveAssignee(o):(o.owner||o.member||''); };
  projects.forEach(function(p){
    (p.todos||[]).forEach(function(td){ if(td.execPin) out.push({p:p,kind:'todo',id:td.id,text:td.text||'',done:!!td.done,priority:td.priority||'',due:td.due||'',execDay:td.execDay||null,assignee:asg(td),overdue:!!td.due&&!td.done&&new Date(td.due)<today}); });
    (p.risks||[]).forEach(function(r){ if(r.execPin){ const st=r.status||'open', closed=/closed|done|resolved|mitigated/i.test(st); out.push({p:p,kind:'risk',id:r.id,text:r.desc||'',done:closed,priority:r.priority||'',due:'',execDay:r.execDay||null,assignee:asg(r),overdue:false}); } });
    (p.actions||[]).forEach(function(a){ if(a.execPin){ const st=a.status||'Open', done=/done|complete|closed/i.test(st); const due=a.due||a.end||''; out.push({p:p,kind:'action',id:a.id,text:a.desc||'',done:done,priority:a.priority||'',due:due,execDay:a.execDay||null,assignee:asg(a),overdue:!!due&&!done&&new Date(due)<today}); } });
  });
  return out;
}
function xsPlannerPins(){
  const items=xsPinnedItems();
  const meta={todo:{label:'Task',color:'var(--accent)'},risk:{label:'Risk',color:'var(--danger)'},action:{label:'Action',color:'#a78bfa'}};
  const open='<button class="sm" onclick="railGo(event,\'backlog\')" style="border-color:var(--accent);color:var(--accent)">'+t('Backlog & planner →')+'</button>';
  let inner;
  if(!items.length){
    inner=pfEmpty(t('Nothing pinned yet — click the 📌 on any task, risk or action in Backlog & planner to plan it into your week.'));
  } else {
    items.sort(function(a,b){ return (a.done-b.done)||(b.overdue-a.overdue); });
    inner='<div style="display:flex;flex-direction:column;gap:2px">';
    items.forEach(function(it){
      const m=meta[it.kind];
      inner+='<div style="display:flex;align-items:center;gap:9px;font-size:12px;padding:6px 4px;border-bottom:1px solid var(--border)">'
        +'<input type="checkbox"'+(it.done?' checked':'')+' onchange="xsPinToggleDone('+it.p.id+',\''+it.kind+'\','+it.id+')" style="width:15px;height:15px;cursor:pointer;flex-shrink:0">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:3px;background:'+m.color+'22;color:'+m.color+';flex-shrink:0">'+escH(t(m.label))+'</span>'
        +'<span style="flex:1;color:var(--text)'+(it.done?';text-decoration:line-through;opacity:.55':'')+'">'+escH(it.text||t('(empty)'))+'</span>'
        +(it.assignee?'<span style="color:var(--accent2);font-size:10px;flex-shrink:0">'+escH(it.assignee)+'</span>':'')
        +(it.due?'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;flex-shrink:0;color:'+(it.overdue?'var(--danger)':'var(--muted)')+'">'+(it.overdue?'⚠ ':'')+escH(it.due)+'</span>':'')
        +'<span style="color:var(--dim);font-size:9px;flex-shrink:0" title="'+escH(it.p.name||'')+'">'+escH((it.p.name||'').slice(0,14))+'</span>'
        +'<button onclick="xsPinRemove('+it.p.id+',\''+it.kind+'\','+it.id+')" title="'+t('Unpin')+'" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;flex-shrink:0">✕</button>'
        +'</div>';
    });
    inner+='</div>';
  }
  const doneN=items.filter(function(i){return i.done;}).length;
  return pfSectionShell(t('MY WEEK — pinned items'), t('{d}/{n} done · tasks, risks & actions you pinned from Backlog & planner.',{d:doneN,n:items.length}), open, inner);
}
function xsPinToggleDone(pid,kind,id){
  const p=projects.find(function(x){return x.id===pid;}); if(!p) return;
  if(typeof projToggleItemDone==='function') projToggleItemDone(p,kind,id);
  saveState();
  xsRefreshWeek();
}
function xsPinRemove(pid,kind,id){
  const p=projects.find(function(x){return x.id===pid;}); if(!p) return;
  const r=(typeof projItemRaw==='function')?projItemRaw(p,kind,id):null; if(r) r.execPin=false;
  saveState();
  xsRefreshWeek();
}

// ── KPI strip — the whole app in one row ─────────────────────────────────────
function xsScorecard(months){
  const eco=ecDataset();
  const sum=function(k){ return eco.reduce(function(s,d){return s+(Number(d[k])||0);},0); };
  const totNpv=eco.reduce(function(s,d){return s+(d.npv||0);},0);
  const totInv=sum('invested'), totRev=sum('chanRev'), totCost=sum('cost');
  const totGP=eco.reduce(function(s,d){return s+(d.grossProfit||0);},0);
  const anyGP=eco.some(function(d){return d.grossProfit!=null;});
  const pi=totInv>0?(totNpv+totInv)/totInv:null;
  const blended=(anyGP&&totRev>0)?totGP/totRev*100:null;
  const riskAdj=eco.reduce(function(s,d){return s+(d.riskAdjNpv||0);},0);
  const conflicts=eco.reduce(function(s,d){return s+d.conflicts;},0);
  const hiRisk=eco.filter(function(d){return d.rpnMax>=300;}).length;

  // Capacity (same primitive as the cost dashboard).
  const engUtil=_buildEngUtil(months);
  const cir=xsCurInRange(months);
  const utilVals=Object.values(engUtil);
  const bench=utilVals.filter(function(eu){return (eu.monthAllocs[cir]||0)===0;}).length;
  const fteNow=utilVals.reduce(function(s,eu){return s+(eu.monthAllocs[cir]||0);},0);
  const benchPct=utilVals.length?Math.round(bench/utilVals.length*100):0;

  // Roster / talent.
  const an=buildAnalyticsDataset();
  const headcount=engineers.filter(function(e){return !e.vacant;}).length;
  const vacancies=engineers.filter(function(e){return e.vacant;}).length;
  const comps=an.map(function(d){return d.comparatio;}).filter(function(v){return v!=null&&isFinite(v);});
  const avgComp=comps.length?comps.reduce(function(s,v){return s+v;},0)/comps.length:null;
  const talentRisk=an.filter(function(d){return d.riskScore>=50;}).length;

  // Skills SPOF.
  const skillMap=(typeof buildSkillMap==='function')?buildSkillMap():{};
  const spofSkills=Object.values(skillMap).filter(function(s){return s.holders&&s.holders.length===1;});
  const spofEng=new Set(); spofSkills.forEach(function(s){s.holders.forEach(function(hh){spofEng.add(hh.eng.id);});});
  const critSpof=spofSkills.filter(function(s){return s.cat==='crit';}).length;

  // Burn direction.
  const series=xsMonthlySeries(months).filter(function(s){return s.cost>0;});
  let arrow='', burnSub=t('loaded team cost');
  if(series.length>=2){
    const d=series[series.length-1].cost-series[0].cost;
    arrow=d>0?'<span style="color:var(--warn)">▲</span> ':d<0?'<span style="color:var(--accent2)">▼</span> ':'';
    burnSub=arrow+t('trend over period');
  }

  const cards=[
    xsKpi(pfEur(totNpv), t('Portfolio NPV'), t('risk-adj {v}',{v:pfEur(riskAdj)}), totNpv>=0?'var(--accent2)':'var(--danger)','econ'),
    xsKpi(pi==null?'—':pi.toFixed(2)+'×', t('Portfolio PI'), t('value per € invested'), pi!=null&&pi>=1?'var(--accent2)':'var(--muted)','econ'),
    xsKpi(pfEur(totRev), t('Expected revenue'), blended==null?t('set channel margins'):t('{v} blended margin',{v:blended.toFixed(0)+'%'}), 'var(--text)','portfolio'),
    xsKpi(pfEur(totCost), t('Plan cost'), burnSub, 'var(--text)','dashboard'),
    xsKpi(fteNow.toFixed(1), t('FTE this month'), t('{n} on bench ({p}%)',{n:bench,p:benchPct}), bench?'var(--accent2)':'var(--text)','dashboard'),
    xsKpi(String(headcount), t('Headcount'), vacancies?t('{n} open req(s) · CR {c}',{n:vacancies,c:avgComp==null?'—':avgComp.toFixed(2)}):t('comparatio {c}',{c:avgComp==null?'—':avgComp.toFixed(2)}), 'var(--text)','roster'),
    xsKpi(String(talentRisk), t('Talent at risk'), t('score ≥ 50'), talentRisk?'var(--danger)':'var(--accent2)','analytics'),
    xsKpi(String(hiRisk), t('High-risk projects'), t('RPN ≥ 300'), hiRisk?'var(--danger)':'var(--accent2)','portfolio'),
    xsKpi(String(spofEng.size), t('SPOF people'), critSpof?t('{n} critical',{n:critSpof}):t('unique-skill holders'), spofEng.size?'var(--warn)':'var(--accent2)','skillrisk'),
    xsKpi(String(conflicts), t('Trade-off conflicts'), t('must-have vs sacrificed'), conflicts?'var(--danger)':'var(--accent2)','econ'),
  ].join('');
  return '<div style="display:flex;flex-wrap:wrap;gap:10px">'+cards+'</div>';
}

// ── spend map (interactive: cost|revenue · flat|by intent) ───────────────────
function xsSpendSection(){
  const ds=pfBuildDataset();
  const by=_xsSpend.by, grouped=_xsSpend.group==='intent';
  const items=ds.map(function(d){return {d:d,value:(by==='revenue'?d.rev:d.cost)};}).filter(function(x){return x.value>0;});
  const controls='<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
    +pfToggle("xsSpendSet('by','cost')",t('Size: Cost'),by==='cost')
    +pfToggle("xsSpendSet('by','revenue')",t('Size: Revenue'),by==='revenue')
    +'<span style="width:1px;height:16px;background:var(--border);margin:0 3px"></span>'
    +pfToggle("xsSpendSet('group','none')",t('Flat'),!grouped)
    +pfToggle("xsSpendSet('group','intent')",t('By tactical intent'),grouped)+'</span>';
  const empty=by==='revenue'?t('No revenue to map — add € impact or impact+enabler.'):t('No team cost to map — allocate a team over the period.');
  const inner=!items.length?pfEmpty(empty):(grouped?pfTreemapGroupedSvg(items,by):pfTreemapSvg(items));
  const hint=grouped
    ? t('Grouped by tactical intent. Area = {area} · colour = ROI rank (green best → red worst).',{area:(by==='revenue'?t('revenue'):t('team cost'))})
    : t('Where {what} concentrates over the period. Area = {area} · colour = ROI rank (green best → red worst).',{what:(by==='revenue'?t('value'):t('spend')),area:(by==='revenue'?t('revenue'):t('team cost'))});
  return pfSectionShell(t('SPEND MAP'), hint, controls, inner);
}
function xsSpendSet(key,val){
  _xsSpend[key]=val;
  const el=G('xs-sec-spend'); if(el) el.innerHTML=xsSpendSection();
}

// ── value × risk × cost bubble (the one new chart) ───────────────────────────
function xsBubbleSvg(eco){
  const rows=eco.filter(function(d){return d.npv!=null || d.rpnSum>0 || d.cost>0;});
  if(!rows.length) return pfEmpty(t('No projects with value, risk or cost in the period.'));
  const W=680,H=340,PADl=58,PADr=18,PADt=16,PADb=44;
  const pw=W-PADl-PADr, ph=H-PADt-PADb;
  const npvs=rows.map(function(d){return d.npv||0;});
  let xmin=Math.min.apply(null,npvs.concat([0])), xmax=Math.max.apply(null,npvs.concat([0]));
  if(xmin===xmax){ xmin-=1; xmax+=1; }
  const xpad=(xmax-xmin)*0.08; xmin-=xpad; xmax+=xpad;
  const ymax=Math.max.apply(null,rows.map(function(d){return d.rpnSum;}).concat([1]))*1.12;
  const maxCost=Math.max.apply(null,rows.map(function(d){return d.cost;}).concat([1]));
  const X=function(v){return PADl+(v-xmin)/(xmax-xmin)*pw;};
  const Y=function(v){return PADt+ph-(ymax?v/ymax:0)*ph;};
  const R=function(c){return 5+Math.sqrt(Math.max(0,c)/maxCost)*22;};
  let h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;max-height:360px;font-family:IBM Plex Mono,monospace">';
  // grid
  for(let i=0;i<=4;i++){
    const gy=PADt+i/4*ph;
    h+='<line x1="'+PADl+'" y1="'+gy.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+gy.toFixed(1)+'" stroke="#2a2a32" stroke-width=".5"/>';
  }
  // zero-NPV divider (value creates ↔ destroys)
  const zx=X(0);
  if(zx>=PADl&&zx<=PADl+pw){
    h+='<line x1="'+zx.toFixed(1)+'" y1="'+PADt+'" x2="'+zx.toFixed(1)+'" y2="'+(PADt+ph)+'" stroke="var(--danger)" stroke-width=".8" stroke-dasharray="3 3" opacity=".55"/>';
    h+='<text x="'+(zx+3).toFixed(1)+'" y="'+(PADt+9)+'" fill="var(--danger)" font-size="8" opacity=".8">NPV 0</text>';
  }
  // bubbles (largest cost first so small ones stay clickable on top)
  rows.slice().sort(function(a,b){return b.cost-a.cost;}).forEach(function(d){
    const cx=X(d.npv||0), cy=Y(d.rpnSum), r=R(d.cost);
    const col=d.color||'var(--accent)';
    h+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+col+'33" stroke="'+col+'" stroke-width="1.3"><title>'+escH(d.name+' — NPV '+pfEur(d.npv||0)+' · Σ RPN '+Math.round(d.rpnSum)+' · cost '+pfEur(d.cost))+'</title></circle>';
  });
  // label the top few by cost
  rows.slice().sort(function(a,b){return b.cost-a.cost;}).slice(0,5).forEach(function(d){
    const cx=X(d.npv||0), cy=Y(d.rpnSum), r=R(d.cost);
    const nm=d.name.length>16?d.name.slice(0,15)+'…':d.name;
    h+='<text x="'+cx.toFixed(1)+'" y="'+(cy-r-3).toFixed(1)+'" fill="var(--text)" font-size="8.5" text-anchor="middle" style="paint-order:stroke;stroke:var(--bg);stroke-width:2.5px">'+escH(nm)+'</text>';
  });
  // axes
  h+='<line x1="'+PADl+'" y1="'+(PADt+ph)+'" x2="'+(PADl+pw)+'" y2="'+(PADt+ph)+'" stroke="var(--border)" stroke-width="1"/>';
  h+='<line x1="'+PADl+'" y1="'+PADt+'" x2="'+PADl+'" y2="'+(PADt+ph)+'" stroke="var(--border)" stroke-width="1"/>';
  h+='<text x="'+(PADl+pw/2).toFixed(1)+'" y="'+(H-8)+'" fill="var(--muted)" font-size="9" text-anchor="middle">'+escH(t('NPV (value) →'))+'</text>';
  h+='<text transform="translate(14,'+(PADt+ph/2).toFixed(1)+') rotate(-90)" fill="var(--muted)" font-size="9" text-anchor="middle">'+escH(t('↑ risk (Σ RPN)'))+'</text>';
  h+='</svg>';
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">'+t('bubble = a project · size = team cost · dashed line = NPV break-even · top-right = high value & high risk')+'</div>';
  return h;
}

// Smallest "nice" axis ceiling ≥ v that divides cleanly into 4 gridlines — used to
// auto-scale both axes to their data with round labels (no fixed 100% cap).
function xsNiceMax4(v){
  if(!(v>0)) return 4;
  const pow=Math.pow(10,Math.floor(Math.log10(v)));
  const n=v/pow;   // 1 … <10
  const c = n<=1?1 : n<=1.2?1.2 : n<=1.6?1.6 : n<=2?2 : n<=2.4?2.4 : n<=3?3 : n<=4?4 : n<=5?5 : n<=6?6 : n<=8?8 : 10;
  return c*pow;
}

// ── cost burn — dual axis (cost bars + €-gridded left axis; utilisation line on
//    the right axis with an average reference), month ticks + a "now" marker ────
function xsBurnSvg(months){
  if(months.length<1) return pfEmpty(t('Set a FROM/TO period to see the burn.'));
  const series=xsMonthlySeries(months);
  const costs=series.map(function(s){return s.cost;});
  const total=costs.reduce(function(s,v){return s+v;},0);
  if(total<=0) return pfEmpty(t('No allocated cost in the period.'));
  const n=series.length;
  const maxCost=xsNiceMax4(Math.max.apply(null,costs.concat([1])));       // auto-scaled, round
  const utils=series.map(function(s){return s.utilPct;});
  const maxUtil=xsNiceMax4(Math.max.apply(null,utils.concat([1])));       // auto-scaled to the data
  const avgCost=total/n;
  const activeU=utils.filter(function(v){return v>0;});
  const avgUtil=activeU.length?activeU.reduce(function(a,b){return a+b;},0)/activeU.length:0;

  const W=680,H=210,PADl=56,PADr=50,PADt=22,PADb=30;
  const pw=W-PADl-PADr, ph=H-PADt-PADb;
  const X=function(i){return PADl+(n===1?pw/2:i/(n-1)*pw);};
  const YC=function(v){return PADt+ph-(v/maxCost)*ph;};        // left: cost
  const YU=function(v){return PADt+ph-(Math.min(v,maxUtil)/maxUtil)*ph;};   // right: utilisation
  const cir=xsCurInRange(months);
  const bw=Math.max(3,Math.min(30,pw/n*0.62));

  let h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;overflow:visible" role="img" aria-label="'+escH(t('Cost burn'))+'">';
  // horizontal grid + dual-axis labels (5 ticks; left = € accent, right = % warn)
  for(let g=0;g<=4;g++){
    const gy=PADt+g/4*ph;
    h+='<line x1="'+PADl+'" y1="'+gy.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+gy.toFixed(1)+'" stroke="var(--border)" stroke-width=".5"/>';
    h+='<text x="'+(PADl-7)+'" y="'+(gy+3).toFixed(1)+'" fill="var(--accent)" font-size="8" text-anchor="end" font-family="IBM Plex Mono,monospace">'+escH(pfEur(maxCost*(4-g)/4))+'</text>';
    h+='<text x="'+(PADl+pw+7)+'" y="'+(gy+3).toFixed(1)+'" fill="var(--warn)" font-size="8" text-anchor="start" font-family="IBM Plex Mono,monospace">'+Math.round(maxUtil*(4-g)/4)+'%</text>';
  }
  // cost bars (muted so the utilisation line reads on top)
  series.forEach(function(s,i){
    const bx=X(i)-bw/2, by=YC(s.cost);
    h+='<rect x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(0,(PADt+ph-by)).toFixed(1)+'" fill="var(--accent)" opacity=".34" rx="1"><title>'+escH(fmtMonth(s.m)+' — '+pfEur(s.cost)+' · '+Math.round(s.utilPct)+'% util')+'</title></rect>';
  });
  // "now" marker (after the bars so it stays visible)
  series.forEach(function(s,i){
    if(s.m===cir){
      h+='<line x1="'+X(i).toFixed(1)+'" y1="'+PADt+'" x2="'+X(i).toFixed(1)+'" y2="'+(PADt+ph)+'" stroke="var(--accent2)" stroke-width="1" stroke-dasharray="3 2" opacity=".85"/>';
      h+='<text x="'+X(i).toFixed(1)+'" y="'+(PADt-6)+'" fill="var(--accent2)" font-size="8" text-anchor="middle" font-family="IBM Plex Mono,monospace">'+t('now')+'</text>';
    }
  });
  // average-utilisation reference + inline label
  const ay=YU(avgUtil);
  h+='<line x1="'+PADl+'" y1="'+ay.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+ay.toFixed(1)+'" stroke="var(--warn)" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>';
  h+='<text x="'+(PADl+3)+'" y="'+(ay-3).toFixed(1)+'" fill="var(--warn)" font-size="7.5" font-family="IBM Plex Mono,monospace" opacity=".85">'+escH(t('avg {v}%',{v:Math.round(avgUtil)}))+'</text>';
  // utilisation line (dark halo under a warn stroke so it pops over the bars)
  let up='';
  series.forEach(function(s,i){ up+=(up?'L':'M')+X(i).toFixed(1)+' '+YU(s.utilPct).toFixed(1)+' '; });
  h+='<path d="'+up.trim()+'" fill="none" stroke="var(--bg)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
  h+='<path d="'+up.trim()+'" fill="none" stroke="var(--warn)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
  series.forEach(function(s,i){ h+='<circle cx="'+X(i).toFixed(1)+'" cy="'+YU(s.utilPct).toFixed(1)+'" r="2.4" fill="var(--warn)" stroke="var(--bg)" stroke-width="1"/>'; });
  // baseline + x month ticks (thinned so labels never collide)
  h+='<line x1="'+PADl+'" y1="'+(PADt+ph)+'" x2="'+(PADl+pw)+'" y2="'+(PADt+ph)+'" stroke="var(--border)" stroke-width="1"/>';
  const step=Math.ceil(n/8);
  series.forEach(function(s,i){
    if(i%step!==0 && i!==n-1) return;
    h+='<text x="'+X(i).toFixed(1)+'" y="'+(PADt+ph+13)+'" fill="var(--muted)" font-size="8" text-anchor="middle" font-family="IBM Plex Mono,monospace">'+escH(fmtMonth(s.m))+'</text>';
  });
  h+='</svg>';
  // stat chips under the chart
  const chip=function(v,l,c){ return '<span style="font-family:IBM Plex Mono,monospace;font-size:10px"><b style="color:'+(c||'var(--text)')+'">'+v+'</b> <span style="color:var(--muted)">'+escH(l)+'</span></span>'; };
  h+='<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:8px">'
    +chip(pfEur(total),t('total'),'var(--text)')
    +chip(pfEur(avgCost),t('avg / month'),'var(--accent)')
    +chip(pfEur(maxCost),t('peak / month'),'var(--accent)')
    +chip(Math.round(avgUtil)+'%',t('avg utilisation'),'var(--warn)')
    +chip(t('{n} mo',{n:n}),t('period'),'var(--muted)')
    +'</div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);align-items:center">'
    +'<span><span style="color:var(--accent)">▮</span> '+t('cost / month (left €)')+'</span>'
    +'<span><span style="color:var(--warn)">━</span> '+t('utilisation (right %)')+'</span>'
    +'<span><span style="color:var(--warn)">┄</span> '+t('period average')+'</span></div>';
  return h;
}

// ── needs-attention callouts ─────────────────────────────────────────────────
function xsAttention(months){
  const items=[];

  // Top talent risks (from the Talent Risk Radar).
  const an=buildAnalyticsDataset().filter(function(d){return d.riskScore>0;}).sort(function(a,b){return b.riskScore-a.riskScore;}).slice(0,3);
  an.forEach(function(d){
    const col=(typeof anRiskColor==='function')?anRiskColor(d.riskScore):'var(--danger)';
    const top=(d.riskFactors&&d.riskFactors.length)?d.riskFactors[0].label:'';
    items.push({icon:'●',iconCol:col,text:'<b>'+escH(d.name)+'</b> — '+t('talent risk {s}',{s:d.riskScore})+(top?' <span style="color:var(--dim)">· '+escH(top)+'</span>':''),to:'analytics'});
  });

  // Delivery — overdue milestones.
  let overdue=0, worstName='', worstN=0;
  projects.forEach(function(p){
    const n=(p.milestones||[]).filter(function(m){return m.end&&!m.done&&new Date(m.end)<new Date();}).length;
    overdue+=n; if(n>worstN){ worstN=n; worstName=p.name; }
  });
  if(overdue>0) items.push({icon:'📅',iconCol:'var(--danger)',text:t('{n} overdue milestone(s)',{n:overdue})+(worstName?' <span style="color:var(--dim)">· '+t('worst: {p} ({n})',{p:escH(worstName),n:worstN})+'</span>':''),to:'portfolio'});

  // Delivery — blocked actions.
  let blocked=0;
  projects.forEach(function(p){ blocked+=(p.actions||[]).filter(function(a){return a.status==='Blocked';}).length; });
  if(blocked>0) items.push({icon:'⛔',iconCol:'var(--warn)',text:t('{n} blocked action(s) across the portfolio',{n:blocked}),to:'portfolio'});

  // Route-to-market — channel concentration.
  const cc=(typeof chanConcentration==='function')?chanConcentration(projects):null;
  if(cc&&cc.channel&&cc.channel.hhi!=null&&cc.channel.hhi>=0.5){
    items.push({icon:'◆',iconCol:'var(--warn)',text:t('Revenue is concentrated in one channel',{})+' <span style="color:var(--dim)">· '+t('{name} {pct}% (HHI {h})',{name:escH(cc.channel.top),pct:Math.round(cc.channel.topPct),h:cc.channel.hhi.toFixed(2)})+'</span>',to:'econ'});
  }

  // Trade-off conflicts.
  const conflicts=ecDataset().reduce(function(s,d){return s+d.conflicts;},0);
  if(conflicts>0) items.push({icon:'⚠',iconCol:'var(--danger)',text:t('{n} trade-off conflict(s) — a must-have on a sacrificed dimension',{n:conflicts}),to:'econ'});

  if(!items.length) return '<div style="font-size:12px;color:var(--accent2);font-family:IBM Plex Mono,monospace">'+t('✓ Nothing flagged — no talent-risk, delivery or concentration alerts.')+'</div>';
  let h='<div style="display:flex;flex-direction:column;gap:2px">';
  items.forEach(function(it){
    h+='<div onclick="railGo(event,\''+it.to+'\')" style="display:flex;align-items:center;gap:9px;font-size:12px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer">'
      +'<span style="color:'+it.iconCol+';flex-shrink:0;width:16px;text-align:center">'+it.icon+'</span>'
      +'<span style="color:var(--text)">'+it.text+'</span></div>';
  });
  h+='</div>';
  return h;
}
