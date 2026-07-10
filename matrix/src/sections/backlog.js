/* ►► SECTION: BACKLOG ◄◄ Cross-project backlog & planner: aggregates every
 * to-do, risk and action across all projects into one editable list with type +
 * project filters, grouping and light analytics. This is the roomy home for
 * managing work items; the project panel keeps only a short task list.
 *
 * Reads the existing shapes via the unified accessor layer in helpers.js
 * (projItems / projItemRaw / proj*  + resolveAssignee). Editing depth:
 *   - TASKS (to-dos): full — text, priority, assignee, due, estimate, done, delete.
 *   - RISKS / ACTIONS: lighter — priority, assignee, done + a ↗ link to their own
 *     project-window tab for deep fields (FMEA / gantt / mitigation).
 *
 * Functions defined in this file:
 *   _blItems / renderBacklogTab      — flatten + render
 *   blToggleType / blSetGroup        — view controls
 *   _blSetProjectFilter / blSetProjectFilter — project scope (⤢ from the panel)
 *   blQuickAdd                        — add a task to a project
 *   blToggleDone/blCyclePrio/blSetText/blSetAssignee/blSetField/blDelete/blOpenTab — inline edit
 */

// Active work-item types (module state; not persisted).
var _blTypes    = { todo:true, risk:true, action:true };
// Group-by mode: 'project' | 'assignee' | 'type' | 'priority'.
var _blGroupBy  = 'project';
// Project scope: null = all projects; else a project id (set by the panel ⤢ button).
var _blProjFilter = null;

// Type presentation: label + accent colour used for badges/toggles.
var _BL_TYPE_META = {
  todo:   { label:'To-dos',  color:'var(--muted)'  },
  risk:   { label:'Risks',   color:'var(--danger)' },
  action: { label:'Actions', color:'var(--accent2)'},
};

// Coarse High/Med/Low fallback for a risk with no explicit priority, from the
// FMEA RPN (sev·occ·det) when present, else probability·impact. '' if unscored.
function _blRiskPriority(r){
  var rpn = (r.sev&&r.occ&&r.det) ? r.sev*r.occ*r.det : (r.prob||0)*(r.imp||0);
  if(!rpn) return '';
  if(r.sev&&r.occ&&r.det) return rpn>=200?'High':rpn>=80?'Medium':'Low';
  return rpn>=6?'High':rpn>=3?'Medium':'Low';
}

// Flatten projects into normalized rows honouring the type + project filters.
// Each row: {pid,pname,pcolor,kind,id,ref,text,assignee,status,priority,due,estimateD,done,overdue}.
function _blItems(){
  var today=new Date(), rows=[];
  projects.forEach(function(p){
    if(_blProjFilter!=null && p.id!==_blProjFilter) return;
    if(_blTypes.todo)(p.todos||[]).forEach(function(td){
      rows.push({ pid:p.id,pname:p.name,pcolor:p.color,kind:'todo',id:td.id,ref:td,
        text:td.text||'',assignee:resolveAssignee(td),status:td.done?'Done':'Open',
        priority:td.priority||'',due:td.due||'',estimateD:td.estimateD,done:!!td.done,
        overdue:!!(td.due)&&!td.done&&new Date(td.due)<today });
    });
    if(_blTypes.risk)(p.risks||[]).forEach(function(r){
      var st=r.status||'open', closed=/closed|done|resolved|mitigated/i.test(st);
      rows.push({ pid:p.id,pname:p.name,pcolor:p.color,kind:'risk',id:r.id,ref:r,
        text:r.desc||'',assignee:resolveAssignee(r),status:st,
        priority:r.priority||_blRiskPriority(r),due:'',estimateD:null,done:closed,overdue:false });
    });
    if(_blTypes.action)(p.actions||[]).forEach(function(a){
      var st=a.status||'Open', done=/done|complete|closed/i.test(st);
      var dueStr=a.due||a.end||'', overdue=!!dueStr&&!done&&new Date(dueStr)<today;
      rows.push({ pid:p.id,pname:p.name,pcolor:p.color,kind:'action',id:a.id,ref:a,
        text:a.desc||'',assignee:resolveAssignee(a),status:st,
        priority:a.priority||'',due:dueStr,estimateD:a.estimateD,done:done,overdue:overdue });
    });
  });
  return rows;
}

// small coloured chip
function _blChip(txt,color,bg){
  return '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:3px;'
    +'background:'+(bg||'rgba(120,120,140,.12)')+';color:'+(color||'var(--muted)')+'">'+escH(txt)+'</span>';
}

// project <option> list (value = pid; selVal picks the current one)
function _blProjectOptions(selVal){
  return projects.slice().sort(function(a,b){return String(a.name).localeCompare(b.name);})
    .map(function(p){return '<option value="'+p.id+'"'+(selVal===p.id?' selected':'')+'>'+escH(p.name)+'</option>';}).join('');
}

// one editable backlog row (tasks: full edit; risks/actions: lighter)
function _blRowHTML(r){
  var m=_BL_TYPE_META[r.kind], isTask=r.kind==='todo', raw=r.ref||{};
  var freeText=(raw.assigneeId==null)?(raw.owner||raw.member||''):'';
  var prTitle=(r.priority||t('No priority'))+' — '+t('click to change');
  var h='<div class="bl-row'+(r.done?' bl-done':'')+'">'
    +'<input type="checkbox" class="bl-check" '+(r.done?'checked':'')+' onchange="blToggleDone('+r.pid+',\''+r.kind+'\','+r.id+')">'
    +_blChip(t(m.label),m.color)
    +'<button class="todo-prio '+(r.priority==='High'?'p-high':r.priority==='Medium'?'p-medium':r.priority==='Low'?'p-low':'p-none')+'" title="'+prTitle+'" onclick="blCyclePrio('+r.pid+',\''+r.kind+'\','+r.id+')"></button>'
    +(isTask
       ?'<input class="bl-text" value="'+escH(r.text)+'" onchange="blSetText('+r.pid+',\'todo\','+r.id+',this.value)">'
       :'<span class="bl-text-ro'+(r.done?' bl-strike':'')+'">'+escH(r.text||t('(empty)'))+'</span>')
    +'<select class="bl-assignee alloc-sel" onchange="blSetAssignee('+r.pid+',\''+r.kind+'\','+r.id+',this.value)">'+assigneeOptionsHTML(raw.assigneeId!=null?raw.assigneeId:null,freeText)+'</select>'
    +(isTask
       ?'<input type="date" class="bl-due" value="'+escH(r.due||'')+'" onchange="blSetField('+r.pid+',\'todo\','+r.id+',\'due\',this.value)">'
        +'<input type="number" class="bl-est" min="0" step="0.5" value="'+(r.estimateD!=null?r.estimateD:'')+'" placeholder="'+t('d')+'" title="'+t('Estimate (FTE-days)')+'" onchange="blSetField('+r.pid+',\'todo\','+r.id+',\'estimateD\',this.value===\'\'?null:+this.value)">'
        +'<button class="bl-del todo-del" title="'+t('Delete')+'" onclick="blDelete('+r.pid+',\'todo\','+r.id+')">×</button>'
       :'<span class="bl-due-ro">'+(r.overdue?'⚠ ':'')+escH(r.due||'')+'</span>'
        +'<a class="bl-open" title="'+t('Open in its project tab')+'" onclick="blOpenTab('+r.pid+',\''+r.kind+'\')">↗</a>')
    +'</div>';
  return h;
}

// Render the backlog tab into #res-body.
export function renderBacklogTab(){
  var body=G('res-body'); if(!body) return;
  if(_blProjFilter!=null && !projects.some(function(p){return p.id===_blProjFilter;})) _blProjFilter=null;

  // Per-type totals across the CURRENT project scope (independent of the type filter).
  var allCounts={ todo:0, risk:0, action:0 };
  projects.forEach(function(p){
    if(_blProjFilter!=null && p.id!==_blProjFilter) return;
    allCounts.todo   += (p.todos||[]).length;
    allCounts.risk   += (p.risks||[]).length;
    allCounts.action += (p.actions||[]).length;
  });

  var rows=_blItems();
  var total=rows.length;
  var doneCount=rows.filter(function(r){return r.done;}).length;
  var openCount=total-doneCount;
  var overdueCount=rows.filter(function(r){return r.overdue;}).length;
  var comp=total?Math.round(doneCount/total*100):0;
  var scopedName=_blProjFilter!=null?(projects.find(function(p){return p.id===_blProjFilter;})||{}).name:'';

  var h='';

  // ── Filter bar: project scope + type + group-by ────────────────
  h+='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px">'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">'+t('PROJECT:')+'</span>'
   +'<select class="alloc-sel" style="max-width:200px" onchange="blSetProjectFilter(this.value)">'
   +'<option value="">'+t('All projects')+'</option>'+_blProjectOptions(_blProjFilter)+'</select>'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);margin-left:8px">'+t('SHOW:')+'</span>';
  ['todo','risk','action'].forEach(function(k){
    var on=_blTypes[k], m=_BL_TYPE_META[k];
    h+='<button class="sm'+(on?' active':'')+'" onclick="blToggleType(\''+k+'\')" '
      +'style="font-size:10px;padding:3px 9px'+(on?';border-color:'+m.color+';color:'+m.color:'')+'">'
      +(on?'☑ ':'☐ ')+t(m.label)+' <span style="opacity:.6">'+allCounts[k]+'</span></button>';
  });
  h+='<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);margin-left:8px">'+t('GROUP BY:')+'</span>';
  [['project',t('PROJECT')],['assignee',t('ASSIGNEE')],['type',t('TYPE')],['priority',t('PRIORITY')]].forEach(function(g){
    h+='<button class="sm'+(_blGroupBy===g[0]?' active':'')+'" onclick="blSetGroup(\''+g[0]+'\')" '
      +'style="font-size:10px;padding:3px 9px'+(_blGroupBy===g[0]?';border-color:var(--accent);color:var(--accent)':'')+'">'+g[1]+'</button>';
  });
  h+='</div>';

  // ── Quick-add task bar ─────────────────────────────────────────
  if(projects.length){
    var addProj=_blProjFilter!=null?_blProjFilter:projects[0].id;
    h+='<div class="bl-addbar">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent)">'+t('+ TASK')+'</span>'
     +'<select id="bl-add-proj" class="alloc-sel" style="max-width:200px">'+_blProjectOptions(addProj)+'</select>'
     +'<input id="bl-add-text" type="text" placeholder="'+t('Add a task, press Enter')+'" onkeydown="if(event.key===\'Enter\')blQuickAdd()">'
     +'<button class="sm primary" style="font-size:10px" onclick="blQuickAdd()">'+t('Add')+'</button>'
     +'</div>';
  }

  // ── Analytics KPIs ─────────────────────────────────────────────
  h+='<div class="alloc-kpi-grid" style="margin-bottom:14px">'
   +'<div class="kpi-card"><div class="kpi-val">'+total+'</div><div class="kpi-label">'+t('BACKLOG ITEMS')+'</div>'
   +'<div class="kpi-sub">'+(scopedName?escH(scopedName):t('all projects'))+'</div></div>'
   +'<div class="kpi-card"><div class="kpi-val" style="color:var(--accent2)">'+openCount+'</div><div class="kpi-label">'+t('OPEN')+'</div>'
   +'<div class="kpi-sub">'+doneCount+' '+t('done')+' · '+comp+'% '+t('complete')+'</div></div>'
   +'<div class="kpi-card" style="'+(overdueCount?'border-color:var(--danger)':'')+'"><div class="kpi-val" style="color:'+(overdueCount?'var(--danger)':'var(--accent)')+'">'+overdueCount+'</div>'
   +'<div class="kpi-label">'+t('OVERDUE')+'</div><div class="kpi-sub">'+t('past due date')+'</div></div>'
   +'<div class="kpi-card"><div class="kpi-val" style="font-size:16px">'+comp+'%</div><div class="kpi-label">'+t('COMPLETION')+'</div>'
   +'<div class="kpi-sub">'+t('across all selected items')+'</div></div>'
   +'</div>';

  if(!total){
    h+='<div style="text-align:center;padding:34px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px">'
      +'<div style="font-size:24px;margin-bottom:8px">🗂️</div>'
      +t('No items for the selected filters. Add a task above, or capture risks/actions on a project.')+'</div>';
    body.innerHTML=h;
    return;
  }

  // ── Group the rows ─────────────────────────────────────────────
  var groups={};
  rows.forEach(function(r){
    var key,color;
    if(_blGroupBy==='project'){ key=r.pname||t('(unnamed project)'); color=r.pcolor; }
    else if(_blGroupBy==='assignee'){ key=r.assignee||t('— Unassigned'); color='var(--accent2)'; }
    else if(_blGroupBy==='type'){ key=t(_BL_TYPE_META[r.kind].label); color=_BL_TYPE_META[r.kind].color; }
    else { key=r.priority||t('— Unprioritised'); color=r.priority==='High'?'var(--danger)':r.priority==='Medium'?'var(--warn)':'var(--muted)'; }
    if(!groups[key]) groups[key]={color:color,rows:[]};
    groups[key].rows.push(r);
  });

  Object.keys(groups).sort().forEach(function(gk){
    var g=groups[gk];
    var gOpen=g.rows.filter(function(r){return !r.done;}).length;
    h+='<div style="margin-bottom:12px;border:1px solid var(--border);border-radius:7px;overflow:hidden">'
     +'<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface);border-bottom:1px solid var(--border)">'
     +'<div style="width:8px;height:8px;border-radius:50%;background:'+g.color+';flex-shrink:0"></div>'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:var(--text)">'+escH(gk)+'</span>'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-left:4px">'+t('{n} open',{n:gOpen})+' · '+g.rows.length+' '+t('total')+'</span>'
     +'</div><div>';
    g.rows.forEach(function(r){ h+=_blRowHTML(r); });
    h+='</div></div>';
  });

  body.innerHTML=h;
}

// helper: find a project by id
function _blProj(pid){ return projects.find(function(p){return p.id===pid;}); }

// Toggle a work-item type in/out of the view (kept at least one on).
export function blToggleType(k){
  if(!_blTypes.hasOwnProperty(k)) return;
  var next=Object.assign({},_blTypes); next[k]=!next[k];
  if(!next.todo&&!next.risk&&!next.action) return;
  _blTypes=next; renderBacklogTab();
}
// Set the group-by mode and re-render.
export function blSetGroup(g){ _blGroupBy=g; renderBacklogTab(); }
// Set the project scope programmatically (used by the panel ⤢ button).
export function _blSetProjectFilter(pid){ _blProjFilter=(pid==null?null:pid); }
// Set the project scope from the dropdown.
function blSetProjectFilter(v){ _blProjFilter=(v===''?null:+v); renderBacklogTab(); }
// Quick-add a task to the chosen project.
function blQuickAdd(){
  var psel=G('bl-add-proj'); var pid=psel?+psel.value:_blProjFilter;
  var p=_blProj(pid); if(!p) return;
  var txt=(V('bl-add-text')||'').trim(); if(!txt) return;
  projAddItem(p,'todo',txt,'Medium'); SV('bl-add-text',''); saveState(); renderBacklogTab();
}
// inline edits ---------------------------------------------------------------
function blToggleDone(pid,type,id){ var p=_blProj(pid); if(!p)return; projToggleItemDone(p,type,id); saveState(); renderBacklogTab(); }
function blCyclePrio(pid,type,id){ var p=_blProj(pid); if(!p)return; var r=projItemRaw(p,type,id); if(!r)return; var i=ITEM_PRIOS.indexOf(r.priority||''); projSetItemPriority(p,type,id,ITEM_PRIOS[(i+1)%ITEM_PRIOS.length]); saveState(); renderBacklogTab(); }
function blSetText(pid,type,id,v){ var p=_blProj(pid); if(!p)return; projSetItemText(p,type,id,v); saveState(); }
function blSetAssignee(pid,type,id,v){ var p=_blProj(pid); if(!p)return; var raw=projItemRaw(p,type,id); if(!raw)return; applyAssigneeSelect(raw,type==='action'?'member':'owner',v); saveState(); renderBacklogTab(); }
function blSetField(pid,type,id,field,v){ var p=_blProj(pid); if(!p)return; projSetItemField(p,type,id,field,v); saveState(); }
function blDelete(pid,type,id){ var p=_blProj(pid); if(!p)return; projDeleteItem(p,type,id); saveNow(); renderBacklogTab(); }
// open a risk/action in its own project-window tab (deep editing)
function blOpenTab(pid,type){ if(typeof showProjTab!=='function')return; tabProjId=pid; showProjTab(type==='risk'?'risk':'actions'); var w=G('proj-tab-win'); if(w)w.classList.add('show'); }
