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
 *   renderTodos         — renders the todo list for a project
 *   addTodo             — adds a todo to the selected project
 *   toggleTodo          — toggles a todo's done state
 *   removeTodo          — removes a todo from a project
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
        <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;flex:1">UNSECTIONED</span>
      </div>
      <div class="section-items">${unsectioned.map(projItemHTML).join('')}</div>
    </div>`;
  }

  // Sections
  sections.forEach(s=>{
    const items=projects.filter(p=>p.sectionId===s.id);
    h+=`<div class="section-block">
      <div class="section-header" onclick="toggleSection(${s.id})">
        <input type="checkbox" ${s.hidden?'':'checked'} title="Show section on matrix"
          style="accent-color:var(--accent2);width:11px;height:11px;cursor:pointer;flex-shrink:0"
          onclick="event.stopPropagation();toggleSectionVisibility(${s.id})">
        <div class="section-color-wrap">
          <div class="section-color-dot" style="background:${s.color}" id="sdot-${s.id}"></div>
          <input type="color" value="${s.color}" class="section-color-btn"
            style="position:absolute;top:0;left:0;width:14px;height:14px;opacity:0;cursor:pointer"
            onchange="setSectionColor(${s.id},this.value)"
            onclick="event.stopPropagation()" title="Change section color">
        </div>
        <input class="section-name-input" value="${escH(s.name)}"
          onchange="renameSectionInput(${s.id},this.value);saveState()"
          onclick="event.stopPropagation()"
          onblur="saveState()"
          title="Click to rename">
        <span class="section-toggle${s.collapsed?' collapsed':''}">▾</span>
        <button class="section-del-btn" onclick="event.stopPropagation();deleteSection(${s.id})" title="Delete section">×</button>
      </div>
      ${s.collapsed?'':`<div class="section-items" ondragover="event.preventDefault()" ondrop="onSectionDrop(event,${s.id})">${items.map(projItemHTML).join('')}</div>`}
    </div>`;
  });

  el.innerHTML=h;
  G('count-badge').textContent=projects.length;
}

// builds the HTML for one project row in the sidebar
function projItemHTML(p){
  const td=(p.todos||[]).filter(t=>t.done).length,tt=(p.todos||[]).length;
  const meta=[`${p.x},${+(getProjY(p)).toFixed(1)}`,p.gate?'🏁':'',tt?`☑${td}/${tt}`:''].filter(Boolean).join(' ');
  return `<div class="proj-item${p.id===selId?' sel':''}" draggable="true"
    ondragstart="onProjDragStart(event,${p.id})" ondragend="onProjDragEnd(event)">
    <input type="checkbox" class="proj-vis-cb" ${p.visible?'checked':''}
      onclick="event.stopPropagation();toggleProjVisibility(${p.id})" title="Show on matrix">
    <div class="proj-dot" style="background:${p.color}"></div>
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
  G('selected-hint').textContent='1 selected';
  SV('e-name',p.name);SV('e-x',p.x);SV('e-y',p.y);
  SV('e-vis',p.vis??5);SV('e-ena',p.ena??5);
  SV('e-note',p.note||'');SV('e-color',p.color);
  SV('e-sector',p.sector||'');SV('e-impacteur',p.impactEur!=null?p.impactEur:'');
  SV('e-current-gate',p.currentGate||'');SV('e-gate',p.gate||'');SV('e-eta',p.eta||'');
  G('e-color-hex').textContent=p.color;
  populateSectionDropdowns();
  G('e-section').value=p.sectionId||'';
  updateEditorLabels();renderTodos(p);
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
  p.impactEur=V('e-impacteur')!==''?+V('e-impacteur'):null;
  const sid=V('e-section');p.sectionId=sid?+sid:null;
  renderList();render();saveState();
}
// deletes the selected project
function deleteSelected(){
  if(!selId||!confirm('Delete this project?'))return;
  projects=projects.filter(p=>p.id!==selId);selId=null;
  G('editor').style.display='none';renderList();render();saveState();
}

// renders the todo list for a project
function renderTodos(p){
  G('todo-list').innerHTML=(p.todos||[]).map(t=>`
    <div class="todo-item">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTodo(${p.id},${t.id})">
      <span class="todo-text${t.done?' done':''}">${escH(t.text)}</span>
      <button class="todo-del" onclick="removeTodo(${p.id},${t.id})">×</button>
    </div>`).join('');
}
// adds a todo to the selected project
function addTodo(){const p=projects.find(p=>p.id===selId);if(!p)return;const txt=V('todo-new').trim();if(!txt)return;if(!p.todos)p.todos=[];p.todos.push({id:nextTodoId++,text:txt,done:false});SV('todo-new','');renderTodos(p);renderList();saveState();}
// toggles a todo's done state
function toggleTodo(pid,tid){const p=projects.find(p=>p.id===pid);if(!p)return;const t=p.todos.find(t=>t.id===tid);if(t)t.done=!t.done;renderTodos(p);renderList();render();saveState();}
// removes a todo from a project
function removeTodo(pid,tid){const p=projects.find(p=>p.id===pid);if(!p)return;p.todos=p.todos.filter(t=>t.id!==tid);renderTodos(p);renderList();render();saveNow();}

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
