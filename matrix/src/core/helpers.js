export const G=id=>document.getElementById(id);
export const V=id=>G(id).value;
export const SV=(id,v)=>{G(id).value=v;};
export function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
/* Validate a CSS color before it lands in a style="" attribute. Entity colors
   (project.color, engGroup.color, section.color, quadrant/channel colors) SYNC
   between peers and ride in backups, so a hostile/garbage value could otherwise
   break out of the attribute or inject extra CSS. Accepts #hex (3/4/6/8),
   rgb[a]/hsl[a](…), and bare CSS keywords (red, transparent, currentColor);
   anything else → fallback. See ARCHITECTURE › Multi-user › XSS. */
export function safeColor(c, fallback){
  const s=String(c==null?'':c).trim();
  if(/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if(/^(rgb|hsl)a?\([0-9.,%/\sdeg]+\)$/i.test(s)) return s;
  if(/^[a-zA-Z]{1,24}$/.test(s)) return s;
  return fallback||'var(--muted)';
}

export function getMonthRange(){
  const s=G('res-start').value, e=G('res-end').value;
  if(!s||!e)return[];
  const months=[];
  let [sy,sm]=s.split('-').map(Number);
  const [ey,em]=e.split('-').map(Number);
  while(sy<ey||(sy===ey&&sm<=em)){
    months.push(`${sy}-${String(sm).padStart(2,'0')}`);
    sm++;if(sm>12){sm=1;sy++;}
    if(months.length>60)break; // safety cap
  }
  return months;
}

export function curMonth(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function _dashCur(){ return curMonth(); }

// Helper: convert alloc value to numeric FTE (0 for m/r, 1 for p, float for numeric)
export function _allocNum(v){
  if(v==='m'||v==='r') return 0;   // medical/resigned: not active
  if(v==='p')          return 1;   // PTO: still on payroll
  var n=+v; return isNaN(n)?0:n;   // numeric 0-1 float
}
// Helper: convert alloc value to cost contribution (0 for m/r, monthlyCost for p, prorated for numeric)
export function _allocCost(v, monthlyCost){
  if(v==='m'||v==='r') return 0;
  if(v==='p')          return monthlyCost||0; // PTO: full cost
  var n=+v; return isNaN(n)?0:n*(monthlyCost||0);
}
/* Canonical cost-inclusion policy (see ARCHITECTURE.md › Cost model).
   A resource's allocations contribute to cost/budget totals only when it is a
   real counted resource: planning-only placeholders count only if includeInCost,
   and anything flagged excludeFromCalc never counts. Vacancies DO count (planned
   spend), matching the resource-plan CSV export. Every project-cost attribution
   path (dashboard cost maps, monthly cost chart, transfer-to-projects) must gate
   on this so headline "plan cost" agrees with the plan and honours the flags. */
export function _costCounts(eng){
  return !!eng && !eng.excludeFromCalc && !(eng.planningOnly && !eng.includeInCost);
}

/* ── Project lifecycle accessors (see PROJECT_LIFECYCLE in globals.js) ──── */
export function projLifecycleDef(idOrProj){
  var id=(idOrProj&&typeof idOrProj==='object')?idOrProj.lifecycle:idOrProj;
  return PROJECT_LIFECYCLE.find(function(s){return s.id===id;})||PROJECT_LIFECYCLE[1]; // fallback: active
}
export function projLifecycle(p){ return (p&&p.lifecycle)||'active'; }
// Do this project's allocations count against team capacity? (active/in-service/maintenance)
export function projConsumesCapacity(p){ return !!projLifecycleDef(p).consumes; }
// Is this project part of the LIVE portfolio (vs. terminal/history-only)?
export function projIsActivePortfolio(p){ return !!projLifecycleDef(p).activePortfolio; }
// Is this project ARCHIVED — closed or finished (terminal lifecycle: cancelled /
// withdrawn / eol / completed)? Distinct from proposed (pipeline, also non-active) and
// from on_hold (paused but still live). Working views hide these by default.
export function projIsArchived(p){ return projLifecycleDef(p).phase==='terminal'; }
// Project list for analytics/governance views — excludes archived unless the shared
// `showArchivedProj` toggle is on. Use this as the project source in portfolio / econ /
// exec / backlog so a closed project drops out of the live picture by default.
export function analyticsProjects(){
  return projects.filter(function(p){ return (typeof showArchivedProj!=='undefined'&&showArchivedProj) || projLifecycleDef(p).phase!=='terminal'; });
}
// Shared toggle chip for those views. `rerender` = the name of the view's re-render fn.
export function analyticsArchivedToggle(rerender){
  var anyArch=projects.some(function(p){ return projLifecycleDef(p).phase==='terminal'; });
  if(!anyArch) return '';
  var on=(typeof showArchivedProj!=='undefined'&&showArchivedProj);
  return '<label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)" title="'+escH(t('Include archived (closed/finished) projects'))+'">'
    +'<input type="checkbox"'+(on?' checked':'')+' onchange="showArchivedProj=this.checked;'+rerender+'()" style="accent-color:var(--accent)">'
    +escH(t('SHOW ARCHIVED'))+'</label>';
}
// Memoised set of project ids whose demand counts — the choke point for suppression.
export function _projCapacitySet(){
  return _memo('projCapSet', function(){
    var s=new Set(); projects.forEach(function(p){ if(projConsumesCapacity(p)) s.add(p.id); }); return s;
  });
}
// Record a lifecycle transition (writes state + reason + appends to the decision log).
// Returns true if the state actually changed. Caller owns saveState()/re-render.
export function projSetLifecycle(p, next, reason){
  if(!p || !PROJECT_LIFECYCLE.some(function(s){return s.id===next;})) return false;
  var from=projLifecycle(p);
  if(next===from && (reason==null || reason===p.lifecycleReason)) return false;
  if(!Array.isArray(p.lifecycleHistory)) p.lifecycleHistory=[];
  p.lifecycleHistory.push({ ts:Date.now(), from:from, to:next, reason:(reason||'') });
  p.lifecycle=next;
  if(reason!=null) p.lifecycleReason=reason;
  return true;
}

/* ── Effective project revenue (M€) ─────────────────────────────────
   User-entered `impactEur` wins. When the user hasn't entered one, fall back
   to a DERIVED default = impact (y) + enabler (ena), but only when both are
   present. This is a COMPUTED accessor — nothing is stored, so backup/restore
   and snapshots stay consistent by construction: `impactEur` remains null until
   the user types a value, and the default recomputes from the persisted y/ena
   (sanitise guarantees both are numeric). */
export function projRevenueIsDefault(p){
  return !!p && (p.impactEur==null || p.impactEur===''); // no user value → derived
}
export function projRevenueM(p){
  if(!p) return 0;
  if(!projRevenueIsDefault(p)){ var v=+p.impactEur; return isNaN(v)?0:v; }
  var y=+p.y, e=+p.ena;                                  // derived default
  if(p.y!=null && p.y!=='' && p.ena!=null && p.ena!=='' && !isNaN(y) && !isNaN(e)) return y+e;
  return 0;
}

/* ══════════════════════════════════════════════════════════════════
   MEMOISATION — cache expensive per-render computations.
   Keyed by `_dataEpoch`; any data mutation bumps the epoch via
   _invalidateMemo() (called from saveState/saveNow), clearing the cache.
   Renders that don't change data (tab switches, filter toggles, hovers)
   reuse cached results → no recompute. See globals for _dataEpoch.
   ══════════════════════════════════════════════════════════════════ */
export let _dataEpoch=0;
export let _memoStore={};
export function _invalidateMemo(){ _dataEpoch++; _memoStore={}; }
export function _memo(key, fn){
  var k=_dataEpoch+'|'+key;
  if(Object.prototype.hasOwnProperty.call(_memoStore,k)) return _memoStore[k];
  var v=fn();
  _memoStore[k]=v;
  return v;
}
// Stable cache key for a month range (the same FROM/TO produces the same key).
export function _monthsKey(months){ return (months&&months.length)?(months[0]+'_'+months[months.length-1]+'_'+months.length):'none'; }
// Indexed lookups built once per epoch (kills O(n²) .find()/.filter() in loops).
export function _engByIdMap(){ return _memo('_engById', function(){ var m=new Map(); engineers.forEach(function(e){m.set(e.id,e);}); return m; }); }
export function _projByIdMap(){ return _memo('_projById', function(){ var m=new Map(); projects.forEach(function(p){m.set(p.id,p);}); return m; }); }
export function _rowsByEngMap(){ return _memo('_rowsByEng', function(){ var m=new Map(); allocRows.forEach(function(r){ var a=m.get(r.engId); if(!a){a=[];m.set(r.engId,a);} a.push(r); }); return m; }); }

// Compute per-engineer utilisation map from ALL allocRows (not filtered). Memoised by month range.
export function _buildEngUtil(months){
  return _memo('engUtil:'+_monthsKey(months), function(){ return _computeEngUtil(months); });
}
function _computeEngUtil(months){
  var cur=_dashCur();
  var util={};
  var rowsByEng=_rowsByEngMap();
  // Suppressed-project allocations don't count as demand/utilisation (a cancelled or
  // held project must not make its ex-team look allocated). Unassigned rows (no
  // projectId) always count. Default lifecycle is 'active', so this is a no-op until
  // a project is actually held/cancelled/withdrawn/EoL.
  var capSet=_projCapacitySet();
  engineers.filter(function(e){return !e.vacant&&(!e.planningOnly||e.includeInCost);}).forEach(function(eng){
    var rows=rowsByEng.get(eng.id)||[];
    var eg=engGroups.find(function(g){return g.id===eng.groupId;});
    var monthAllocs={};
    var monthStatus={};
    months.forEach(function(m){
      monthAllocs[m]=rows.reduce(function(s,r){
        if(r.projectId!=null && !capSet.has(r.projectId)) return s;   // suppressed project
        var v=r.allocs&&r.allocs[m]!=null?r.allocs[m]:0;
        // Status letters: m/r = not active (no cost), p = on leave but counts as allocated
        if(v==='m'||v==='r')return s;
        if(v==='p')return s+1; // PTO counts as 100% (still employed)
        return s+(+v||0);
      },0);
      // Track status flags per month for cost exclusion
      monthStatus[m]=rows.map(function(r){return r.allocs?r.allocs[m]:null;}).find(function(v){return v==='m'||v==='p'||v==='r';})||null;
    });
    var totAlloc=Object.values(monthAllocs).reduce(function(s,v){return s+v;},0);
    var activeMonths=Object.values(monthAllocs).filter(function(v){return v>0;}).length;
    var avgAlloc=activeMonths>0?totAlloc/activeMonths:0;
    var utilizationRate=months.length>0?totAlloc/months.length:0;
    var overMonths=Object.entries(monthAllocs).filter(function(kv){return kv[1]>1.005;}).map(function(kv){return kv[0];});
    var curAlloc=monthAllocs[cur]||0;
    // Projects this engineer is assigned to
    var projIds=[...new Set(rows.map(function(r){return r.projectId;}).filter(Boolean))];
    util[eng.id]={
      eng:eng,name:eng.name,role:eng.role||'',loc:eng.location||'',
      grp:eg?eg.name:'',grpColor:eg?eg.color:'var(--muted)',grpId:eng.groupId,
      cost:eng.monthlyCost||0,totAlloc:totAlloc,avgAlloc:avgAlloc,
      utilizationRate:utilizationRate,months:months.length,activeMonths:activeMonths,
      monthAllocs:monthAllocs,monthStatus:monthStatus,overMonths:overMonths,curAlloc:curAlloc,projIds:projIds
    };
  });
  return util;
}

export function fmtMonth(ym){
  const [y,m]=ym.split('-');
  const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mn[+m-1]+(m==='01'?` ${y}`:'');
}

export function getSkillCatCol(){var m={};skillCats.forEach(function(c){m[c.id]=c.color;});return m;}
export function getSkillCatLabel(withEmoji){var m={};skillCats.forEach(function(c){m[c.id]=(withEmoji?c.emoji+' ':'')+c.label;});return m;}
export function getSkillCatOpts(selId){return skillCats.map(function(c){return '<option value="'+c.id+'"'+(c.id===selId?' selected':'')+'>'+c.emoji+' '+escH(c.label)+'</option>';}).join('');}

export function engInitials(name){
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}
export function engGroupColor(eng){
  const g=engGroups.find(g=>g.id===eng.groupId);
  return g?g.color:'#6b6b78';
}

/* ── Nine-box history (per-year snapshots) ──────────────────────────
   _nineBoxPlacements is always the live view of _nineBoxHistory[_nbYear]
   (same object reference) so all existing readers keep working unchanged.
   nbEnsureHistory() is idempotent — call it from every load path. It also
   migrates a legacy flat snapshot (no history) into a default year.
─────────────────────────────────────────────────────────────────── */
export function nbYears(){ return Object.keys(_nineBoxHistory||{}).sort(); }   // ascending
export function nbEnsureHistory(){
  if(!_nineBoxHistory||typeof _nineBoxHistory!=='object') _nineBoxHistory={};
  if(!Object.keys(_nineBoxHistory).length){
    // Migrate: drop any existing flat placements into a default year.
    var seed=(_nineBoxPlacements&&typeof _nineBoxPlacements==='object'&&Object.keys(_nineBoxPlacements).length)?_nineBoxPlacements:{};
    var y=_nbYear||String(new Date().getFullYear());
    _nineBoxHistory[y]=seed; _nbYear=y;
  }
  if(!_nbYear||!_nineBoxHistory[_nbYear]){
    var ys=nbYears(); _nbYear=ys[ys.length-1]||String(new Date().getFullYear());
    if(!_nineBoxHistory[_nbYear]) _nineBoxHistory[_nbYear]={};
  }
  if(_nbCompareYear && !_nineBoxHistory[_nbCompareYear]) _nbCompareYear='';
  _nineBoxPlacements=_nineBoxHistory[_nbYear];   // re-point the live view
}
// Composite score (perf+pot, 2..6) used to judge movement direction (toward top-right = better).
export function nbScore(key){ if(!key)return null; var p=String(key).split('-').map(Number); return (p[0]||0)+(p[1]||0); }
// Movement of an engineer between a previous and current placement.
export function nbMove(curKey,prevKey){
  if(!prevKey&&curKey) return 'new';
  if(!curKey&&prevKey) return 'gone';
  if(!curKey&&!prevKey) return 'none';
  var c=nbScore(curKey), p=nbScore(prevKey);
  return c>p?'up':(c<p?'down':'same');
}

/* ── Unified project work-item layer ─────────────────────────────────
 * To-dos, risks and actions are stored in their own arrays (p.todos /
 * p.risks / p.actions) so the rich risk-FMEA and action-gantt tabs keep
 * working. These accessors present all three as ONE list of normalized
 * wrappers { type,id,ref,text,done,priority,assigneeId,assignee,due,
 * overdue,status } so the project panel + backlog treat them uniformly.
 * `type` is 'todo' | 'risk' | 'action'. Writes go back to the source array. */
var PROJ_ITEM_TYPES=['todo','risk','action'];
// display metadata for an item type (label + glyph + accent colour)
function projItemTypeMeta(type){
  if(type==='risk')   return {label:t('Risk'),   glyph:'⚑', color:'var(--danger)'};
  if(type==='action') return {label:t('Action'), glyph:'▷', color:'var(--accent2)'};
  return {label:t('Task'), glyph:'○', color:'var(--muted)'};
}
// resolve an item's assignee to a display name: roster person (by assigneeId)
// wins; else the free-text owner/member fallback; else '' (unassigned).
function resolveAssignee(raw){
  if(raw && raw.assigneeId!=null){
    var e=_engByIdMap().get(raw.assigneeId);
    if(e) return e.name;
  }
  return (raw && (raw.owner||raw.member)) || '';
}
// is a risk/action considered closed/done from its status text?
function _itemStatusDone(type,raw){
  var st=raw.status||'';
  if(type==='risk')   return /closed|done|resolved|mitigated/i.test(st);
  if(type==='action') return /done|complete|closed/i.test(st);
  return !!raw.done;
}
// normalize one raw record of the given type into a unified wrapper
function projItemWrap(p,type,raw){
  var text = type==='todo'?(raw.text||''):(raw.desc||'');
  var done = _itemStatusDone(type,raw);
  var due  = type==='action'?(raw.due||raw.end||''):'';
  var overdue = !!due && !done && new Date(due) < new Date();
  return { type:type, id:raw.id, ref:raw, pid:p.id, pname:p.name, pcolor:p.color,
           text:text, done:done, priority:raw.priority||'',
           assigneeId:(raw.assigneeId!=null?raw.assigneeId:null),
           assignee:resolveAssignee(raw), due:due, overdue:overdue,
           status:raw.status||(done?'Done':'Open') };
}
// all items on a project as unified wrappers (todos, then risks, then actions)
function projItems(p){
  var out=[];
  (p.todos||[]).forEach(function(r){ out.push(projItemWrap(p,'todo',r)); });
  (p.risks||[]).forEach(function(r){ out.push(projItemWrap(p,'risk',r)); });
  (p.actions||[]).forEach(function(r){ out.push(projItemWrap(p,'action',r)); });
  return out;
}
// find the raw record of a given type+id on a project
function projItemRaw(p,type,id){
  var arr = type==='todo'?p.todos : type==='risk'?p.risks : p.actions;
  return (arr||[]).find(function(r){return r.id===id;});
}
// create a new item of the given type (default priority carried through)
function projAddItem(p,type,text,priority){
  priority = priority||'';
  if(type==='risk'){
    if(!p.risks)p.risks=[];
    var r={id:nextRiskId++,desc:text,prob:2,imp:2,mit:'',owner:'',status:'open',sev:5,occ:5,det:5,priority:priority,assigneeId:null};
    p.risks.push(r); return r;
  }
  if(type==='action'){
    if(!p.actions)p.actions=[];
    var a={id:nextActionId++,desc:text,start:'',end:'',dep:'',status:'Open',member:'',color:'#5be5c8',isMilestone:false,due:'',priority:priority||'Medium',assigneeId:null,estimateD:null};
    p.actions.push(a); return a;
  }
  if(!p.todos)p.todos=[];
  var td={id:nextTodoId++,text:text,done:false,priority:priority||'Medium',assigneeId:null,due:'',estimateD:null};
  p.todos.push(td); return td;
}
// toggle an item's done/closed state (writes to the type-appropriate field)
function projToggleItemDone(p,type,id){
  var raw=projItemRaw(p,type,id); if(!raw)return;
  var done=_itemStatusDone(type,raw);
  if(type==='todo')       raw.done=!raw.done;
  else if(type==='risk')  raw.status=done?'open':'closed';
  else                    raw.status=done?'Open':'Done';
}
// set an item's priority ('High'|'Medium'|'Low'|'')
function projSetItemPriority(p,type,id,prio){ var r=projItemRaw(p,type,id); if(r)r.priority=prio; }
// set an item's text (writes text or desc)
function projSetItemText(p,type,id,text){ var r=projItemRaw(p,type,id); if(!r)return; if(type==='todo')r.text=text; else r.desc=text; }
// set an arbitrary field on an item's raw record (assigneeId, due, estimateD, mit…)
function projSetItemField(p,type,id,field,val){ var r=projItemRaw(p,type,id); if(r)r[field]=val; }
// delete an item from its source array
function projDeleteItem(p,type,id){
  if(type==='todo')       p.todos  =(p.todos||[]).filter(function(r){return r.id!==id;});
  else if(type==='risk')  p.risks  =(p.risks||[]).filter(function(r){return r.id!==id;});
  else                    p.actions=(p.actions||[]).filter(function(r){return r.id!==id;});
}
// <select> options for an assignee picker: Unassigned + roster. A legacy free-text
// owner/member (present when there's no assigneeId) is preserved as a '__free__'
// option so switching to the roster never silently discards a typed name.
function assigneeOptionsHTML(selId,freeText){
  var o='<option value="">'+t('— Unassigned')+'</option>';
  if(freeText && selId==null) o+='<option value="__free__" selected>'+escH(freeText)+' '+t('(free text)')+'</option>';
  engineers.slice().sort(function(a,b){return String(a.name).localeCompare(b.name);}).forEach(function(e){
    o+='<option value="'+e.id+'"'+(selId===e.id?' selected':'')+'>'+escH(e.name)+'</option>';
  });
  return o;
}
// apply an assignee-<select> value onto a raw record: sets assigneeId and mirrors
// the resolved roster name into ownerField ('owner'|'member') so the many existing
// readers of owner/member (brief export, member summary, AI context) still work.
function applyAssigneeSelect(raw,ownerField,v){
  if(v==='__free__'){ raw.assigneeId=null; return; }        // keep the existing free text
  if(v===''||v==null){ raw.assigneeId=null; raw[ownerField]=''; return; }
  var id=+v; raw.assigneeId=id; var e=_engByIdMap().get(id); raw[ownerField]=e?e.name:'';
}
