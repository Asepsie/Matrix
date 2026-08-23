/* ►► SECTION: SIDEBAR ◄◄ Project list sidebar, editor panel, todos, drag-to-section
 *
 * Functions defined in this file:
 *   renderList          — renders the sidebar project list grouped by section
 *   projItemHTML        — builds the HTML for one project row in the sidebar
 *   toggleProjVisibility — toggles a project's visibility on the matrix
 *   selectProject       — selects a project and opens the editor panel
 *   closeEditor         — closes the editor panel and clears the selection
 *   populateEditor      — fills the editor inputs from the selected project
 *   updateEditorLabels  — updates the editor's axis label to match the X-axis name
 *   saveEdit            — writes editor inputs back to the selected project
 *   deleteSelected      — deletes the selected project
 *   renderItems         — renders the unified item list (todos+risks+actions) for a project
 *   addItem             — quick-adds an item of the current type to the selected project
 *   cycleNewItemType    — cycles the quick-add item type (todo→risk→action)
 *   toggleItem/removeItem/cycleItemPrio — per-row done / delete / priority
 *   itemDetailHTML + setItem*           — click-to-expand assignee/due/estimate/mitigation
 *   onProjDragStart     — drag start for a sidebar project row
 *   onProjDragEnd       — drag end for a sidebar project row
 *   onSectionDrop       — drops a dragged project into a section
 */

// renders the sidebar project list grouped by section
function renderList(){
  populateSectionDropdowns();
  const el=G('project-list');
  let h='';

  // Unsectioned projects first
  const unsectioned=projects.filter(p=>!p.sectionId);
  if(unsectioned.length){
    h+=`<div class="section-block">
      <div class="section-header" style="opacity:.5">
        <span class="section-color-dot" style="background:var(--muted)"></span>
        <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;flex:1">${t('UNSECTIONED')}</span>
      </div>
      <div class="section-items">${unsectioned.map(projItemHTML).join('')}</div>
    </div>`;
  }

  // Sections
  sections.forEach(s=>{
    const items=projects.filter(p=>p.sectionId===s.id);
    h+=`<div class="section-block">
      <div class="section-header" onclick="toggleSection(${s.id})">
        <input type="checkbox" ${s.hidden?'':'checked'} title="${t('Show section on matrix')}"
          style="accent-color:var(--accent2);width:11px;height:11px;cursor:pointer;flex-shrink:0"
          onclick="event.stopPropagation();toggleSectionVisibility(${s.id})">
        <div class="section-color-wrap">
          <div class="section-color-dot" style="background:${safeColor(s.color)}" id="sdot-${s.id}"></div>
          <input type="color" value="${safeColor(s.color)}" class="section-color-btn"
            style="position:absolute;top:0;left:0;width:14px;height:14px;opacity:0;cursor:pointer"
            onchange="setSectionColor(${s.id},this.value)"
            onclick="event.stopPropagation()" title="${t('Change section color')}">
        </div>
        <input class="section-name-input" value="${escH(s.name)}"
          onchange="renameSectionInput(${s.id},this.value);saveState()"
          onclick="event.stopPropagation()"
          onblur="saveState()"
          title="${t('Click to rename')}">
        <span class="section-toggle${s.collapsed?' collapsed':''}">▾</span>
        <button class="section-del-btn" onclick="event.stopPropagation();deleteSection(${s.id})" title="${t('Delete section')}">×</button>
      </div>
      ${s.collapsed?'':`<div class="section-items" ondragover="event.preventDefault()" ondrop="onSectionDrop(event,${s.id})">${items.map(projItemHTML).join('')}</div>`}
    </div>`;
  });

  el.innerHTML=h;
  G('count-badge').textContent=projects.length;
}

// builds the HTML for one project row in the sidebar
function projItemHTML(p){
  const scope=(typeof railBadgeScopeGet==='function')?railBadgeScopeGet():'all';
  const its=projItems(p).filter(i=>scope==='tasks'?i.type==='todo':true);
  const tt=its.length,td=its.filter(i=>i.done).length;
  const meta=[`${p.x},${+(getProjY(p)).toFixed(1)}`,p.gate?'🏁':'',tt?`☑${td}/${tt}`:''].filter(Boolean).join(' ');
  return `<div class="proj-item${p.id===selId?' sel':''}" data-pid="${p.id}" draggable="true"
    ondragstart="onProjDragStart(event,${p.id})" ondragend="onProjDragEnd(event)">
    <input type="checkbox" class="proj-vis-cb" ${p.visible?'checked':''}
      onclick="event.stopPropagation();toggleProjVisibility(${p.id})" title="${t('Show on matrix')}">
    <div class="proj-dot" style="background:${safeColor(p.color)}"></div>
    <div class="proj-name" onclick="selectProject(${p.id})">${escH(p.name)}</div>
    <div class="proj-meta">${meta}</div>
  </div>`;
}

// toggles a project's visibility on the matrix
function toggleProjVisibility(id){
  const p=projects.find(p=>p.id===id);if(!p)return;
  p.visible=!p.visible;
  renderList();render();saveState();
}

// selects a project and opens the editor panel
function selectProject(id){selId=id;renderList();populateEditor();render();}
// closes the editor panel and clears the selection
function closeEditor(){selId=null;G('editor').style.display='none';G('selected-hint').textContent='';renderList();render();}

// fills the editor inputs from the selected project
function populateEditor(){
  const p=projects.find(p=>p.id===selId);if(!p)return;
  G('editor').style.display='flex';
  G('selected-hint').textContent=t('1 selected');
  SV('e-name',p.name);SV('e-x',p.x);SV('e-y',p.y);
  SV('e-vis',p.vis??5);SV('e-ena',p.ena??5);
  SV('e-note',p.note||'');SV('e-color',p.color);
  SV('e-sector',p.sector||'');SV('e-intent',p.tacticalIntent||'');SV('e-lifecycle',projLifecycle(p));SV('e-impacteur',p.impactEur!=null?p.impactEur:'');
  // Empty revenue → show the derived default (impact+enabler) as a placeholder hint.
  var _rd=(p.y!=null&&p.ena!=null)?((+p.y)+(+p.ena)):null;
  G('e-impacteur').placeholder=(_rd!=null)?t('default {n} = impact+enabler',{n:_rd}):t('e.g. 2.5');
  SV('e-current-gate',p.currentGate||'');SV('e-gate',p.gate||'');SV('e-eta',p.eta||'');
  G('e-color-hex').textContent=p.color;
  populateSectionDropdowns();
  G('e-section').value=p.sectionId||'';
  updateEditorLabels();renderItems(p);
}
// updates the editor's axis label to match the X-axis name
function updateEditorLabels(){
  G('e-x-label').textContent=(V('ax-x-name')||'X').toUpperCase()+' (X)';
}
// writes editor inputs back to the selected project
function saveEdit(){
  const p=projects.find(p=>p.id===selId);if(!p)return;
  p.name=V('e-name')||p.name;
  p.x=+V('e-x');p.y=+V('e-y');
  p.vis=+V('e-vis');p.ena=+V('e-ena');
  p.note=V('e-note');p.color=V('e-color');
  p.currentGate=V('e-current-gate');p.gate=V('e-gate');p.eta=V('e-eta');
  p.sector=V('e-sector');
  p.tacticalIntent=V('e-intent');
  projSetLifecycle(p, V('e-lifecycle')||'active');   // logs the transition if it changed
  p.impactEur=V('e-impacteur')!==''?+V('e-impacteur'):null;
  const sid=V('e-section');p.sectionId=sid?+sid:null;
  renderList();render();saveState();
}
// deletes the selected project
function deleteSelected(){
  if(!selId||!confirm(t('Delete this project?')))return;
  projects=projects.filter(p=>p.id!==selId);selId=null;
  G('editor').style.display='none';renderList();render();saveState();
}

/* ── Task list in the project panel (tasks/to-dos only) ──────────────
   Kept deliberately short: quick-add is type-and-Enter, priority is the
   small click-to-cycle dot, assignee/due/estimate live in the expand row.
   Risks & actions have their own project-window tabs; the full cross-type
   backlog (all three) lives in PLAN › Backlog (⤢ button opens it filtered
   to this project). */
const _itemOpen=new Set();          // expanded item keys ("type:id"), UI-only
const ITEM_PRIOS=['High','Medium','Low',''];   // cycle order ('' = none)
// css class for the priority dot
function prioDotClass(pr){ return pr==='High'?'p-high':pr==='Medium'?'p-medium':pr==='Low'?'p-low':'p-none'; }
function _firstName(n){ return String(n||'').split(' ')[0]; }
// roster <option> list for an assignee picker (value = eng.id; '' = unassigned)
function itemAssigneeOptions(selId){
  var o='<option value="">'+t('— Unassigned')+'</option>';
  engineers.slice().sort(function(a,b){return String(a.name).localeCompare(b.name);}).forEach(function(e){
    o+='<option value="'+e.id+'"'+(selId===e.id?' selected':'')+'>'+escH(e.name)+'</option>';
  });
  return o;
}
// renders the task list (to-dos only) for a project
function renderItems(p){
  var host=G('todo-list'); if(!host)return;
  var tasks=projItems(p).filter(function(it){return it.type==='todo';});
  host.innerHTML=tasks.map(function(it){
    var key=it.type+':'+it.id, open=_itemOpen.has(key);
    var h='<div class="todo-item">'
      +'<input type="checkbox" '+(it.done?'checked':'')+' onchange="toggleItem('+p.id+',\''+it.type+'\','+it.id+')">'
      +'<button class="todo-prio '+prioDotClass(it.priority)+'" title="'+(it.priority||t('No priority'))+' — '+t('click to change')+'" onclick="cycleItemPrio('+p.id+',\''+it.type+'\','+it.id+')"></button>'
      +'<span class="todo-text'+(it.done?' done':'')+'">'+escH(it.text||t('(empty)'))+'</span>'
      +(it.assignee?'<span class="item-assignee" title="'+escH(it.assignee)+'">'+escH(_firstName(it.assignee))+'</span>':'')
      +(it.overdue?'<span class="item-overdue" title="'+t('Overdue')+'">!</span>':'')
      +'<button class="item-exp" title="'+t('Details')+'" onclick="toggleItemExpand(\''+key+'\')">'+(open?'▾':'▸')+'</button>'
      +'<button class="todo-del" onclick="removeItem('+p.id+',\''+it.type+'\','+it.id+')">×</button>'
      +'</div>';
    if(open) h+=itemDetailHTML(p,it);
    return h;
  }).join('');
}
// the click-to-expand detail panel for one item
function itemDetailHTML(p,it){
  var raw=it.ref||{}, fieldName=it.type==='action'?'member':'owner';
  var freeText=(it.assigneeId==null&&raw[fieldName])?raw[fieldName]:'';
  var h='<div class="item-detail">'
    +'<div class="idet-row"><label>'+t('Assignee')+'</label>'
    +'<select onchange="setItemAssignee('+p.id+',\''+it.type+'\','+it.id+',this.value)">'+itemAssigneeOptions(it.assigneeId)+'</select></div>'
    +'<div class="idet-row"><label>'+t('or name')+'</label>'
    +'<input type="text" value="'+escH(freeText)+'" placeholder="'+t('free text')+'" onchange="setItemOwner('+p.id+',\''+it.type+'\','+it.id+',this.value)"></div>';
  if(it.type!=='risk'){
    h+='<div class="idet-row"><label>'+t('Due')+'</label>'
      +'<input type="date" value="'+escH(raw.due||'')+'" onchange="setItemField('+p.id+',\''+it.type+'\','+it.id+',\'due\',this.value)"></div>'
      +'<div class="idet-row"><label>'+t('Estimate')+'</label>'
      +'<input type="number" min="0" step="0.5" value="'+(raw.estimateD!=null?raw.estimateD:'')+'" placeholder="'+t('FTE-days')+'" onchange="setItemField('+p.id+',\''+it.type+'\','+it.id+',\'estimateD\',this.value===\'\'?null:+this.value)"></div>';
  } else {
    h+='<div class="idet-row"><label>'+t('Mitigation')+'</label>'
      +'<input type="text" value="'+escH(raw.mit||'')+'" placeholder="'+t('mitigation plan')+'" onchange="setItemField('+p.id+',\''+it.type+'\','+it.id+',\'mit\',this.value)"></div>';
  }
  return h+'</div>';
}
// quick-add: create a task (to-do) from the text box
function addItem(){
  var p=projects.find(function(p){return p.id===selId;}); if(!p)return;
  var txt=V('todo-new').trim(); if(!txt)return;
  projAddItem(p,'todo',txt,'Medium');
  SV('todo-new','');
  renderItems(p); renderList(); saveState();
}
// open the full cross-type backlog filtered to the selected project (⤢ button)
function openProjectBacklog(){
  if(typeof _blSetProjectFilter==='function') _blSetProjectFilter(selId);
  if(typeof railGo==='function') railGo(null,'backlog');
}
// toggle the expand panel for an item row
function toggleItemExpand(key){ if(_itemOpen.has(key))_itemOpen.delete(key); else _itemOpen.add(key); var p=projects.find(function(p){return p.id===selId;}); if(p)renderItems(p); }
// cycle an item's priority (High → Medium → Low → none)
function cycleItemPrio(pid,type,id){
  var p=projects.find(function(p){return p.id===pid;}); if(!p)return;
  var r=projItemRaw(p,type,id); if(!r)return;
  var i=ITEM_PRIOS.indexOf(r.priority||'');
  projSetItemPriority(p,type,id,ITEM_PRIOS[(i+1)%ITEM_PRIOS.length]);
  renderItems(p); renderList(); saveState();
}
// toggle an item's done/closed state
function toggleItem(pid,type,id){ var p=projects.find(function(p){return p.id===pid;}); if(!p)return; projToggleItemDone(p,type,id); renderItems(p); renderList(); render(); saveState(); }
// delete an item
function removeItem(pid,type,id){ var p=projects.find(function(p){return p.id===pid;}); if(!p)return; projDeleteItem(p,type,id); _itemOpen.delete(type+':'+id); renderItems(p); renderList(); render(); saveNow(); }
// set the roster assignee ('' → unassigned/null)
function setItemAssignee(pid,type,id,val){ var p=projects.find(function(p){return p.id===pid;}); if(!p)return; projSetItemField(p,type,id,'assigneeId',val===''?null:+val); renderItems(p); saveState(); }
// set free-text owner/member (clears the roster link if a name is typed)
function setItemOwner(pid,type,id,val){ var p=projects.find(function(p){return p.id===pid;}); if(!p)return; projSetItemField(p,type,id,type==='action'?'member':'owner',val); if(val)projSetItemField(p,type,id,'assigneeId',null); renderItems(p); saveState(); }
// set an arbitrary field on an item (due, estimateD, mit)
function setItemField(pid,type,id,field,val){ var p=projects.find(function(p){return p.id===pid;}); if(!p)return; projSetItemField(p,type,id,field,val); saveState(); }

let _dragProjId=null;
// drag start for a sidebar project row
function onProjDragStart(e,id){
  _dragProjId=id;
  e.dataTransfer.effectAllowed='move';
  e.currentTarget.style.opacity='0.4';
}
// drag end for a sidebar project row
function onProjDragEnd(e){
  e.currentTarget.style.opacity='';
  _dragProjId=null;
}
// drops a dragged project into a section
function onSectionDrop(e,sectionId){
  e.preventDefault();
  if(_dragProjId==null)return;
  const p=projects.find(p=>p.id===_dragProjId);
  if(p){p.sectionId=sectionId?+sectionId:null;}
  _dragProjId=null;
  renderList();render();saveState();
}
