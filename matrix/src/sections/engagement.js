/* ►► SECTION: TALENT-ENGAGEMENT ◄◄ TALENT › Engagement.
 *
 * The ACTION layer for talent retention. The rest of the app diagnoses WHO needs
 * attention (Talent Risk Radar, Development priority); this plans WHAT to do and
 * WHEN, and records that it happened. Two surfaces over one dataset:
 *   • This week      — the talents due this week + a check-off action list.
 *   • Cadence planner — a weeks × talents grid; assign each key person a retention
 *                       TIER, then Auto-generate a rotation (tier 1 = most frequent)
 *                       and hand-edit any cell.
 *
 * Data lives on `eng.idcard.engagement = { tier, touchpoints:[{type,week,done,note,ts}] }`
 * (makeEngagement in model.js), so it rides save / backup / snapshot with the person
 * and is back-filled by sanitiseEngineer. `week` is a Monday date key 'YYYY-MM-DD'.
 * All ids `teg`-prefixed. A compact "this week" widget also appears on the Executive
 * summary (xsEngagementWidget in exec.js) and links here.
 */

// The engagement action library (also used by the exec widget).
var ENGAGEMENT_ACTIONS=[
  {id:'oneonone',    icon:'🗣', label:'1:1 meeting'},
  {id:'recognition', icon:'🌟', label:'Recognition'},
  {id:'development', icon:'🌱', label:'Development talk'},
  {id:'career',      icon:'🎯', label:'Career check-in'},
  {id:'wellbeing',   icon:'☕', label:'Wellbeing / skip-level'},
  {id:'stretch',     icon:'🚀', label:'Stretch assignment'},
  {id:'feedback',    icon:'📝', label:'Feedback'},
];
// UI-only planner state (horizon + per-tier weeks-between-touchpoints). Not persisted.
var _tegState={ weeks:8, freq:{1:2, 2:3, 3:6}, view:'grid' };
var TEG_TIER_COLOR={1:'#c8f135', 2:'#5be5c8', 3:'#a78bfa'};

function tegActionMeta(id){
  for(var i=0;i<ENGAGEMENT_ACTIONS.length;i++) if(ENGAGEMENT_ACTIONS[i].id===id) return ENGAGEMENT_ACTIONS[i];
  return {id:id,icon:'•',label:id||t('Touchpoint')};
}
// Defensive accessor — ensures a fresh engagement object (tolerates un-sanitised data).
function tegEng(eng){
  if(!eng.idcard) eng.idcard={};
  var en=eng.idcard.engagement;
  if(!en||typeof en!=='object'){ en={tier:null,touchpoints:[]}; eng.idcard.engagement=en; }
  if(!Array.isArray(en.touchpoints)) en.touchpoints=[];
  return en;
}
function tegEngById(id){ return engineers.find(function(e){return e.id===id;}); }
function tegTp(en,week){ for(var i=0;i<en.touchpoints.length;i++) if(en.touchpoints[i].week===week) return en.touchpoints[i]; return null; }

// ── week math (Monday-based, avoids ISO-week edge cases) ─────────────────────
function tegMonday(d){ d=new Date(d); var day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d; }
function tegWeekKey(d){ var m=tegMonday(d); return m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0')+'-'+String(m.getDate()).padStart(2,'0'); }
function tegCurWeek(){ return tegWeekKey(new Date()); }
function tegWeekList(n){ var out=[], m=tegMonday(new Date()); for(var i=0;i<n;i++){ var w=new Date(m); w.setDate(m.getDate()+i*7); out.push(tegWeekKey(w)); } return out; }
function tegWeekLabel(key){ var p=key.split('-'), dt=new Date(+p[0],+p[1]-1,+p[2]);
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]+' '+dt.getDate(); }

// Engineers currently IN the plan (tier assigned), sorted tier then name.
function tegPlanEngs(){
  return engineers.filter(function(e){ return !e.vacant && tegEng(e).tier!=null; })
    .sort(function(a,b){ var ta=tegEng(a).tier, tb=tegEng(b).tier; return ta!==tb ? ta-tb : (a.name||'').localeCompare(b.name||''); });
}
// {eng,en,tp} for every planned talent with a touchpoint in the CURRENT week.
function tegThisWeekList(){
  var wk=tegCurWeek();
  return tegPlanEngs().map(function(e){ var en=tegEng(e); return {eng:e,en:en,tp:tegTp(en,wk)}; })
    .filter(function(x){ return x.tp; });
}

// ── entry point ──────────────────────────────────────────────────────────────
function renderEngagement(){
  var body=G('res-body'); if(!body) return;
  var h='<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';
  h+='<div style="display:flex;align-items:baseline;gap:10px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);letter-spacing:.06em">'+t('◎ TALENT ENGAGEMENT')+'</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('keep your key people engaged — plan the touchpoints, then work the week')+'</span></div>';
  h+='<div id="teg-board">'+tegBoardSection()+'</div>';
  h+='<div id="teg-planner">'+tegPlannerSection()+'</div>';
  h+='<div id="teg-assign">'+tegAssignSection()+'</div>';
  h+='</div>';
  body.innerHTML=h;
}

// ── 1. this-week board ───────────────────────────────────────────────────────
function tegBoardSection(){
  var wk=tegCurWeek(), list=tegThisWeekList();
  var inner;
  if(!list.length){
    inner=pfEmpty(tegPlanEngs().length
      ? t('Nothing scheduled for this week. Add touchpoints in the planner below, or Auto-generate a rotation.')
      : t('No key talents yet — add people to the plan at the bottom, then generate a cadence.'));
  } else {
    inner='<div style="display:flex;flex-direction:column;gap:8px">';
    list.forEach(function(x){
      var tier=x.en.tier, tcol=TEG_TIER_COLOR[tier]||'var(--muted)';
      var m=tegActionMeta(x.tp.type);
      var opts=ENGAGEMENT_ACTIONS.map(function(a){return '<option value="'+a.id+'"'+(a.id===x.tp.type?' selected':'')+'>'+a.icon+' '+escH(t(a.label))+'</option>';}).join('');
      inner+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--border);border-left:3px solid '+tcol+';border-radius:8px;padding:9px 12px;background:var(--surface)">'
        +'<label style="display:flex;align-items:center;gap:7px;cursor:pointer;min-width:190px">'
        +'<input type="checkbox"'+(x.tp.done?' checked':'')+' onchange="tegToggleDone('+x.eng.id+',\''+wk+'\')" style="width:15px;height:15px;cursor:pointer">'
        +'<span style="font-weight:600;color:'+tcol+'">'+escH(x.eng.name||'')+'</span>'
        +'<span style="font-size:8px;font-family:IBM Plex Mono,monospace;color:'+tcol+'">T'+tier+'</span></label>'
        +'<select class="cht-sel" onchange="tegSetType('+x.eng.id+',\''+wk+'\',this.value)" style="font-size:11px">'+opts+'</select>'
        +'<input type="text" value="'+escH(x.tp.note||'')+'" placeholder="'+t('note…')+'" onchange="tegSetNote('+x.eng.id+',\''+wk+'\',this.value)" style="flex:1;min-width:160px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px;padding:4px 8px">'
        +(x.tp.done?'<span style="font-size:10px;color:var(--accent2);font-family:IBM Plex Mono,monospace">'+t('done')+'</span>':'')
        +'</div>';
    });
    inner+='</div>';
  }
  var done=list.filter(function(x){return x.tp.done;}).length;
  var hint=t('Week of {w} · {d}/{n} done',{w:tegWeekLabel(wk),d:done,n:list.length});
  return pfSection(t('THIS WEEK'), hint, inner);
}

// ── 2. cadence planner (grid + auto-generate) ────────────────────────────────
function tegPlannerSection(){
  var planEngs=tegPlanEngs();
  var freqCtl=function(tier){ return '<label style="display:inline-flex;align-items:center;gap:3px;color:'+TEG_TIER_COLOR[tier]+'">T'+tier
    +'<input type="number" min="1" max="12" value="'+_tegState.freq[tier]+'" onchange="tegSetFreq('+tier+',this.value)" style="width:38px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;padding:2px 4px"></label>'; };
  var vTog=function(v,label){ return '<button onclick="tegSet(\'view\',\''+v+'\')" style="background:'+(_tegState.view===v?'rgba(200,241,53,.12)':'var(--bg)')
    +';border:1px solid '+(_tegState.view===v?'var(--accent)':'var(--border)')+';color:'+(_tegState.view===v?'var(--accent)':'var(--muted)')
    +';font-family:IBM Plex Mono,monospace;font-size:10px;padding:3px 9px;border-radius:5px;cursor:pointer">'+escH(label)+'</button>'; };
  var controls='<span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-family:IBM Plex Mono,monospace;font-size:10px">'
    +vTog('grid',t('▦ Grid'))+vTog('calendar',t('🗓 Calendar'))
    +'<span style="width:1px;height:16px;background:var(--border)"></span>'
    +'<label style="color:var(--muted)">'+t('weeks')+' <select class="cht-sel" onchange="tegSet(\'weeks\',this.value)" style="font-size:11px">'
    +[4,8,12,16].map(function(n){return '<option value="'+n+'"'+(n===_tegState.weeks?' selected':'')+'>'+n+'</option>';}).join('')+'</select></label>'
    +'<span style="color:var(--muted)">'+t('every N wks:')+'</span>'+freqCtl(1)+freqCtl(2)+freqCtl(3)
    +'<button class="sm" onclick="tegAutoGenerate()" style="border-color:var(--accent);color:var(--accent)">⟳ '+t('Auto-generate')+'</button>'
    +'<button class="sm" onclick="tegClearPlan()">'+t('Clear touchpoints')+'</button></span>';
  var inner=!planEngs.length ? pfEmpty(t('Add key talents below to build a cadence.'))
    : (_tegState.view==='calendar' ? tegCalendarBody(planEngs) : tegGridBody(planEngs));
  return pfSectionShell(t('CADENCE PLANNER'), t('Assign a tier, set how often each tier gets a touch, then Auto-generate a rotation and hand-edit any cell.'), controls, inner);
}

// Compact weeks × talents grid (the overview / rhythm view).
function tegGridBody(planEngs){
  var weeks=tegWeekList(_tegState.weeks), cur=tegCurWeek();
  var th='<th style="text-align:left;padding:4px 8px;position:sticky;left:0;background:var(--surface)">'+t('Talent')+'</th>'
    +weeks.map(function(wk){return '<th style="padding:4px 5px;font-weight:500;color:'+(wk===cur?'var(--accent2)':'var(--muted)')+'">'+escH(tegWeekLabel(wk))+'</th>';}).join('');
  var rows='';
  [1,2,3].forEach(function(tier){
    var tEngs=planEngs.filter(function(e){return tegEng(e).tier===tier;});
    if(!tEngs.length) return;
    rows+='<tr><td colspan="'+(weeks.length+1)+'" style="padding:6px 8px 2px;font-family:IBM Plex Mono,monospace;font-size:9px;letter-spacing:.06em;color:'+TEG_TIER_COLOR[tier]+'">'+t('TIER {n}',{n:tier})+' · '+t('every {n} wk',{n:_tegState.freq[tier]})+'</td></tr>';
    tEngs.forEach(function(eng){
      var en=tegEng(eng);
      var tds='<td style="padding:3px 8px;position:sticky;left:0;background:var(--surface);white-space:nowrap;color:var(--text)">'+escH(eng.name||'')+'</td>';
      weeks.forEach(function(wk){
        var tp=tegTp(en,wk);
        var sym=tp?(tp.done?'✓':'●'):'·';
        var col=tp?(tp.done?'var(--accent2)':TEG_TIER_COLOR[tier]):'var(--dim)';
        var bg=wk===cur?'rgba(91,229,200,.06)':'transparent';
        var title=tp?tegActionMeta(tp.type).label+(tp.done?' — '+t('done'):''):t('click to schedule');
        tds+='<td onclick="tegCellClick('+eng.id+',\''+wk+'\')" title="'+escH(title)+'" style="text-align:center;cursor:pointer;background:'+bg+';color:'+col+';font-size:13px;padding:3px 5px">'+sym+'</td>';
      });
      rows+='<tr>'+tds+'</tr>';
    });
  });
  return '<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;min-width:100%"><thead><tr>'+th+'</tr></thead><tbody>'+rows+'</tbody></table></div>'
    +'<div style="font-size:9px;color:var(--dim);margin-top:8px;font-family:IBM Plex Mono,monospace">'+t('click a cell: · schedule → ● done → ✓ remove. Teal column = this week.')+'</div>';
}

// Week-by-week calendar with rich per-touchpoint context (avatar, role, tier,
// talent-risk, editable action + note, done). One card per week in the horizon.
function tegCalendarBody(planEngs){
  var weeks=tegWeekList(_tegState.weeks), cur=tegCurWeek();
  var riskById={};
  if(typeof buildAnalyticsDataset==='function') buildAnalyticsDataset().forEach(function(d){ riskById[d.id]=d.riskScore; });
  var h='<div style="display:flex;flex-direction:column;gap:10px">';
  weeks.forEach(function(wk){
    var entries=[];
    planEngs.forEach(function(eng){ var tp=tegTp(tegEng(eng),wk); if(tp) entries.push({eng:eng,en:tegEng(eng),tp:tp}); });
    var isCur=wk===cur, done=entries.filter(function(x){return x.tp.done;}).length;
    h+='<div style="border:1px solid '+(isCur?'var(--accent2)':'var(--border)')+';border-radius:8px;background:var(--surface);overflow:hidden">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;background:'+(isCur?'rgba(91,229,200,.08)':'var(--bg)')+';border-bottom:1px solid var(--border)">'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:11px;color:'+(isCur?'var(--accent2)':'var(--text)')+'">'+t('Week of {w}',{w:tegWeekLabel(wk)})+(isCur?' · '+t('THIS WEEK'):'')+'</span>'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+(entries.length?t('{d}/{n} done',{d:done,n:entries.length}):t('nothing scheduled'))+'</span></div>';
    if(entries.length){
      h+='<div style="display:flex;flex-direction:column">';
      entries.forEach(function(x){
        var tier=x.en.tier, tcol=TEG_TIER_COLOR[tier]||'var(--muted)';
        var ini=(typeof engInitials==='function')?engInitials(x.eng.name):(x.eng.name||'?').slice(0,2).toUpperCase();
        var rs=riskById[x.eng.id];
        var opts=ENGAGEMENT_ACTIONS.map(function(a){return '<option value="'+a.id+'"'+(a.id===x.tp.type?' selected':'')+'>'+a.icon+' '+escH(t(a.label))+'</option>';}).join('');
        h+='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid var(--border)">'
          +'<label style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:210px">'
          +'<input type="checkbox"'+(x.tp.done?' checked':'')+' onchange="tegToggleDone('+x.eng.id+',\''+wk+'\')" style="width:15px;height:15px;cursor:pointer;flex-shrink:0">'
          +'<span style="width:26px;height:26px;border-radius:50%;background:'+tcol+'22;border:1.5px solid '+tcol+';display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:'+tcol+';font-family:IBM Plex Mono,monospace;flex-shrink:0">'+escH(ini)+'</span>'
          +'<span><span style="font-weight:600;color:'+(x.tp.done?'var(--muted)':'var(--text)')+(x.tp.done?';text-decoration:line-through':'')+'">'+escH(x.eng.name||'')+'</span>'
          +'<span style="display:block;font-size:9px;color:var(--muted)">'+escH(x.eng.role||'')+' · T'+tier+(rs?' · <span style="color:'+(typeof anRiskColor==='function'?anRiskColor(rs):'var(--muted)')+'">'+t('risk {s}',{s:rs})+'</span>':'')+'</span></span></label>'
          +'<select class="cht-sel" onchange="tegSetType('+x.eng.id+',\''+wk+'\',this.value)" style="font-size:11px">'+opts+'</select>'
          +'<input type="text" value="'+escH(x.tp.note||'')+'" placeholder="'+t('note…')+'" onchange="tegSetNote('+x.eng.id+',\''+wk+'\',this.value)" style="flex:1;min-width:140px;background:var(--bg);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:11px;padding:4px 8px">'
          +'</div>';
      });
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  return h;
}

// ── 3. key-talent tier assignment ────────────────────────────────────────────
function tegAssignSection(){
  var riskById={};
  if(typeof buildAnalyticsDataset==='function') buildAnalyticsDataset().forEach(function(d){ riskById[d.id]=d.riskScore; });
  var engs=engineers.filter(function(e){return !e.vacant;})
    .sort(function(a,b){ return (riskById[b.id]||0)-(riskById[a.id]||0) || (a.name||'').localeCompare(b.name||''); });
  if(!engs.length) return pfSection(t('KEY TALENTS'), t('No people yet.'), pfEmpty(t('Add engineers to the roster first.')));
  var inPlan=engs.filter(function(e){return tegEng(e).tier!=null;}).length;
  var inner='<div style="display:flex;flex-direction:column;gap:4px">';
  engs.forEach(function(eng){
    var en=tegEng(eng), rs=riskById[eng.id];
    var sel=[['','—']].concat([[1,'T1'],[2,'T2'],[3,'T3']]).map(function(o){
      return '<option value="'+o[0]+'"'+(String(en.tier==null?'':en.tier)===String(o[0])?' selected':'')+'>'+o[1]+'</option>';
    }).join('');
    var tcol=en.tier!=null?TEG_TIER_COLOR[en.tier]:'var(--border)';
    inner+='<div style="display:flex;align-items:center;gap:10px;padding:5px 8px;border:1px solid var(--border);border-left:3px solid '+tcol+';border-radius:6px;background:var(--surface)">'
      +'<span style="flex:1;color:var(--text);font-size:12px">'+escH(eng.name||'')+'<span style="color:var(--muted);font-size:10px"> · '+escH(eng.role||'')+'</span></span>'
      +(rs?'<span title="'+t('Talent risk score')+'" style="font-family:IBM Plex Mono,monospace;font-size:10px;color:'+(typeof anRiskColor==='function'?anRiskColor(rs):'var(--muted)')+'">risk '+rs+'</span>':'')
      +'<select class="cht-sel" onchange="tegSetTier('+eng.id+',this.value)" style="font-size:11px">'+sel+'</select></div>';
  });
  inner+='</div>';
  return pfSection(t('KEY TALENTS'), t('{n} in the plan · sorted by talent-risk. Assign a tier (T1 = closest cadence) to add someone.',{n:inPlan}), inner);
}

// ── mutations (all persist + re-render) ──────────────────────────────────────
function tegSetTier(id,val){
  var eng=tegEngById(id); if(!eng) return;
  tegEng(eng).tier=(val===''||val==null)?null:(+val);
  saveState(); renderEngagement();
}
function tegSet(key,val){ _tegState[key]=(key==='weeks')?((+val)||_tegState.weeks):val; renderEngagement(); }
function tegSetFreq(tier,val){ var v=Math.max(1,Math.min(12,(+val)||1)); _tegState.freq[tier]=v; renderEngagement(); }
function tegCellClick(id,week){
  var eng=tegEngById(id); if(!eng) return; var en=tegEng(eng);
  var idx=en.touchpoints.findIndex(function(tp){return tp.week===week;});
  if(idx<0) en.touchpoints.push({type:'oneonone',week:week,done:false,note:'',ts:Date.now()});
  else if(!en.touchpoints[idx].done) en.touchpoints[idx].done=true;
  else en.touchpoints.splice(idx,1);
  saveState(); renderEngagement();
}
function tegToggleDone(id,week){
  var eng=tegEngById(id); if(!eng) return; var tp=tegTp(tegEng(eng),week);
  if(tp){ tp.done=!tp.done; saveState(); renderEngagement(); }
}
function tegSetType(id,week,type){
  var eng=tegEngById(id); if(!eng) return; var tp=tegTp(tegEng(eng),week);
  if(tp){ tp.type=type; saveState(); renderEngagement(); }
}
// Note edits fire on blur (onchange) and DON'T re-render, so the field keeps focus.
function tegSetNote(id,week,val){
  var eng=tegEngById(id); if(!eng) return; var tp=tegTp(tegEng(eng),week);
  if(tp){ tp.note=val; saveState(); }
}
// Auto-generate a tiered rotation across the horizon (skips weeks already scheduled).
function tegAutoGenerate(){
  var weeks=tegWeekList(_tegState.weeks);
  tegPlanEngs().forEach(function(eng){
    var en=tegEng(eng), f=_tegState.freq[en.tier]||4, k=0;
    weeks.forEach(function(wk,i){
      if(i%f!==0) return;
      if(!tegTp(en,wk)){
        var type=ENGAGEMENT_ACTIONS[k%ENGAGEMENT_ACTIONS.length].id;
        en.touchpoints.push({type:type,week:wk,done:false,note:'',ts:Date.now()});
      }
      k++;
    });
  });
  saveState(); renderEngagement();
}
function tegClearPlan(){
  if(typeof confirm==='function' && !confirm(t('Remove all scheduled touchpoints? Tier assignments are kept.'))) return;
  var horizon=tegWeekList(_tegState.weeks);
  tegPlanEngs().forEach(function(eng){
    var en=tegEng(eng);
    en.touchpoints=en.touchpoints.filter(function(tp){ return tp.done || horizon.indexOf(tp.week)<0; }); // keep history + out-of-window
  });
  saveState(); renderEngagement();
}
