/* ►► SECTION: PLAN ◄◄ Allocation plan tab: table, FTE, fill, copy, column select
 *
 * Functions defined in this file:
 *   renderResPlan         — main allocation plan table renderer; inner helpers: allocRowHTML, subtotalHTML
 *   buildAllocTable       — delegates to renderResPlan or renderResDashboard based on active tab
 *   colorCell             — updates CSS class on an allocation input based on its numeric value
 *   engCardHTML           — builds HTML for a single engineer card in the roster
 *   dragEngStart          — drag-and-drop: engineer drag start handler
 *   dragEngEnd            — drag-and-drop: engineer drag end handler
 *   dropEngOnGroup        — drag-and-drop: drops engineer onto a group and saves
 *   addEngGroup           — creates a new engineer group with a cycling color
 *   deleteEngGroup        — deletes a group and ungroups its members
 *   toggleEngGroup        — toggles group collapse and sets the "add engineer" target group
 *   renameEngGroup        — renames an engineer group by id
 *   setEngGroupColor      — sets a group's color and saves
 *   saveRoster            — reads visible card inputs and persists engineer state
 *   addEngineer           — adds a new engineer to the selected group
 *   deleteEngineer        — removes an engineer and clears related alloc rows
 *   addAllocRowAfter      — inserts a new empty alloc row after a given index
 *   deleteAllocRow        — removes an alloc row by id
 *   setRowEng             — assigns an engineer to an alloc row
 *   setRowProj            — assigns a project to an alloc row
 *   setAlloc              — sets a month's allocation value (status letter or 0–100 pct)
 *   _allocIsStatus        — returns true if the value is a status letter (m/p/r)
 *   ctxSetStatus          — context menu: set status on selection or active cell
 *   ctxSetStatusRow       — context menu: set status across a month range on the active row
 *   _planDragStart        — alloc row drag-reorder: drag start handler
 *   _planDragEnd          — alloc row drag-reorder: drag end handler
 *   _planDrop             — alloc row drag-reorder: drops and reorders _planRowOrder
 *   exportPlanProject     — exports a CSV for a single project's allocations
 *   exportPlanSelected    — routes to the selected export mode from the toolbar dropdown
 *   _planBuildCSV         — builds a grouped CSV string and triggers download
 *   _downloadCSV          — creates a Blob and triggers file download
 *   _mergeAllocsByEngProj — merges multiple alloc rows for the same (eng, proj) pair
 *   exportPlanFull        — exports CSV for all visible allocations
 *   exportPlanView        — exports CSV for the current filtered/grouped view
 *   availToggle           — toggles an engineer in the availability panel selection
 *   availSelectAll        — selects all engineers below the utilisation threshold
 *   availSelectNone       — clears the availability panel selection
 *   availShowCapability   — scrolls to the capability section in the availability panel
 *   allocCellMouseDown    — mouse-down on an alloc cell: single/range/toggle selection
 *   updateAllocSelHighlight — syncs the `sel` CSS class to the current selection
 *   allocCellCtx          — right-click on an alloc cell: opens the cell context menu
 *   ctxFillRow            — context menu: fills the active row over the fill month range
 *   ctxFillCol            — context menu: fills every row for the active month
 *   ctxCopyCell           — context menu: copies the active cell value to the buffer
 *   ctxPasteCell          — context menu: pastes the copied value into selected cells
 *   ctxClearRow           — context menu: clears all months on the active row
 *   ctxClearCol           — context menu: clears the active month across all rows
 *   selectColumn          — selects every row's cell for a given month
 *   fillSelectedRows      — fill bar: fills selected rows across the month range
 *   fillAllRows           — fill bar: fills all rows across the month range
 *   setPlanView           — sets plan view mode (flat/byEngineer/byProject) and re-renders
 *   addRowForEng          — adds a new empty alloc row pre-assigned to an engineer
 *   addRowForProj         — adds a new empty alloc row pre-assigned to a project
 */

/** Renders the full allocation plan table with filter/view toolbar, fill bar, and grouped rows. */
export function renderResPlan(){
  const months=getMonthRange();
  const cur=curMonth();
  let h='';

  // ── Filter & view toolbar ──
  const allEngNamesP=[...new Set(engineers.map(e=>e.name))].sort();
  const allProjNamesP=[...new Set(allocRows.map(r=>{const p=projects.find(p=>p.id===r.projectId);return p?p.name:null;}).filter(Boolean))].sort();
  const [fStartDef,fEndDef]=months.length?[months[0],months[months.length-1]]:['',''];
  const selStyle='background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:\'IBM Plex Mono\',monospace;font-size:11px;padding:4px 8px;border-radius:4px;outline:none';

  h+=`<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px">
    <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">${t('VIEW:')}</span>
    <button class="sm${planViewMode==='flat'?' active':''}" onclick="setPlanView('flat')">${t('FLAT')}</button>
    ${planViewMode==='flat' ? `
    <span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--dim)">${t('sort:')}</span>
    <button class="sm${planFlatSort==='none'?' active':''}" onclick="planFlatSort='none';renderResPlan()" style="font-size:9px;padding:1px 6px">${t('MANUAL')}</button>
    <button class="sm${planFlatSort==='engineer'?' active':''}" onclick="planFlatSort='engineer';renderResPlan()" style="font-size:9px;padding:1px 6px">${t('A-Z ENG')}</button>
    <button class="sm${planFlatSort==='project'?' active':''}" onclick="planFlatSort='project';renderResPlan()" style="font-size:9px;padding:1px 6px">${t('A-Z PROJ')}</button>
    ` : ''}
    <button class="sm${planViewMode==='byEngineer'?' active':''}" onclick="setPlanView('byEngineer')">${t('↕ BY ENGINEER')}</button>
    <button class="sm${planViewMode==='byProject'?' active':''}"  onclick="setPlanView('byProject')">${t('↕ BY PROJECT')}</button>
    <div class="bar-sep"></div>
    <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">${t('FILTER:')}</span>
    ${multiSelectHTML('plan-eng',allEngNamesP,planFilterEng,'onPlanFilterEngChange',t('Engineers'))}
    ${multiSelectHTML('plan-proj',allProjNamesP,planFilterProj,'onPlanFilterProjChange',t('Projects'))}
    ${planFilterEng.size||planFilterProj.size?`<button class="sm" onclick="planFilterEng=new Set();planFilterProj=new Set();renderResPlan()">${t('✕ CLEAR')}</button>`:''}
    <div class="bar-sep"></div>
    <label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer">
      <input type="checkbox" ${planHideEmpty?'checked':''} onchange="planHideEmpty=this.checked;renderResPlan()" style="accent-color:var(--accent)">
      <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">${t('HIDE EMPTY ROWS')}</span>
    </label>
    ${projects.some(p=>typeof projIsArchived==='function'&&projIsArchived(p))?`<label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer" title="${t('Archived = closed/finished (terminal lifecycle)')}">
      <input type="checkbox" ${planShowArchived?'checked':''} onchange="planShowArchived=this.checked;renderResPlan()" style="accent-color:var(--accent)">
      <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">${t('SHOW ARCHIVED')}</span>
    </label>`:''}
    <div style="flex:1"></div>
    <button class="sm${planFreezeHeader?' active':''}" id="plan-freeze-btn"
      onclick="planFreezeHeader=!planFreezeHeader;var w=document.getElementById('alloc-wrap');if(w)w.classList.toggle('freeze-on',planFreezeHeader);this.classList.toggle('active',planFreezeHeader);this.style.borderColor=planFreezeHeader?'var(--accent2)':'';this.style.color=planFreezeHeader?'var(--accent2)':'';"
      title="${t('Freeze engineer name, project and month header while scrolling')}"
      style="${planFreezeHeader?'border-color:var(--accent2);color:var(--accent2)':''}"
      >${t('⊠ FREEZE')}</button>
    <button class="add-row-btn" onclick="addAllocRowAfter(-1)">${t('+ ADD ROW')}</button>
    <select id="plan-export-mode" style="background:var(--bg);border:1px solid var(--border);color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:10px;padding:3px 7px;border-radius:4px">
      <option value="">${t('↓ EXPORT…')}</option>
      <option value="full">${t('Full (all projects + engineers)')}</option>
      <option value="view">${t('Current view')}</option>
      ${projects.filter(p=>p.visible!==false).map(p=>`<option value="proj_${p.id}">${t('Project:')} ${escH(p.name)}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:4px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);cursor:pointer">
    <input type="checkbox" id="plan-export-excl" checked style="accent-color:var(--accent2)"> ${t('Excl. calc-excluded')}
  </label>
  <button class="sm" onclick="exportPlanSelected()" style="font-size:9px;padding:2px 8px;border-color:var(--accent2);color:var(--accent2)">${t('↓ GO')}</button>
  </div>`;

  // ── Fill toolbar ──
  h+=`<div class="alloc-fill-bar">
    <label>${t('QUICK FILL')}</label>
    <label>${t('VALUE %')}</label><input type="number" id="fill-val" value="100" min="0" max="100" step="5">
    <label>${t('FROM')}</label><input type="month" id="fill-from" value="${fStartDef}">
    <label>${t('TO')}</label><input type="month" id="fill-to" value="${fEndDef}">
    <button class="sm" onclick="fillSelectedRows()">${t('→ FILL SELECTED ROWS')}</button>
    <button class="sm" onclick="fillAllRows()">${t('⇒ FILL ALL ROWS')}</button>
    <div class="bar-sep"></div>
    <span class="fill-hint" id="sel-hint">${t('Click cells · Shift+click range · Right-click options')}</span>
  </div>`;

  // ── Filter allocRows ──
  let visibleRows=allocRows.filter(r=>{
    if(planFilterEng.size){const e=engineers.find(e=>e.id===r.engId);if(!e||!planFilterEng.has(e.name))return false;}
    if(planFilterProj.size){const p=projects.find(p=>p.id===r.projectId);if(!p||!planFilterProj.has(p.name))return false;}
    const filterActive=planFilterEng.size||planFilterProj.size;
    // Hide rows on ARCHIVED (terminal) projects by default — unless the toggle is on or a
    // project filter is active (an explicit project pick should always be shown).
    if(!planShowArchived&&!planFilterProj.size&&r.projectId!=null&&typeof projIsArchived==='function'){
      const pr=projects.find(p=>p.id===r.projectId); if(pr&&projIsArchived(pr))return false;
    }
    if(planHideEmpty&&!filterActive){const hasAny=months.some(m=>r.allocs&&r.allocs[m]&&r.allocs[m]>0);if(!hasAny)return false;}
    return true;
  });

  // ── Helper: render one allocation row ──
  function allocRowHTML(row,idx,showEngCol=true,showProjCol=true,draggable=false){
    const eng=engineers.find(e=>e.id===row.engId);
    let rh=draggable
      ? `<tr data-rid="${row.id}" draggable="true"
           ondragstart="_planDragStart(event,${idx})"
           ondragend="_planDragEnd(event)"
           ondragover="event.preventDefault()"
           ondrop="_planDrop(event,${idx})"
           style="cursor:grab">`
      : `<tr data-rid="${row.id}">`;
    if(draggable){
      rh+=`<td style="width:14px;text-align:center;color:var(--dim);cursor:grab;font-size:10px;padding:0 2px;vertical-align:middle;user-select:none;line-height:1">⠿</td>`;
    }
    if(showEngCol){
      rh+=`<td class="col-name"><select class="alloc-sel" onchange="setRowEng(${row.id},+this.value)">
        <option value="">${t('— Select —')}</option>`;
      engineers.forEach(e=>{const g=engGroups.find(g=>g.id===e.groupId);rh+=`<option value="${e.id}"${e.id===row.engId?' selected':''}>${escH(e.name)}${e.role?' · '+escH(e.role):''}${g?' ['+escH(g.name)+']':''}</option>`;});
      rh+=`</select></td>`;
    } else {
      rh+=`<td class="col-name" style="padding:0"></td>`;
    }
    if(showProjCol){
      rh+=`<td class="col-proj"><select class="alloc-sel" onchange="setRowProj(${row.id},+this.value)">
        <option value="">${t('— Select —')}</option>`;
      // Archived (terminal) projects aren't assignable — excluded unless already on this row.
      projects.filter(p=>(typeof projIsArchived!=='function')||!projIsArchived(p)||p.id===row.projectId)
        .forEach(p=>{rh+=`<option value="${p.id}"${p.id===row.projectId?' selected':''}>${escH(p.name)}${(typeof projIsArchived==='function'&&projIsArchived(p))?' ('+escH(t('archived'))+')':''}</option>`;});
      rh+=`</select></td>`;
    } else {
      rh+=`<td class="col-proj" style="padding:0"></td>`;
    }
    rh+=`<td class="col-budget" style="padding:0 2px;white-space:nowrap;vertical-align:middle;width:24px">
      <span title="${t('Toggle budget line')}" style="cursor:pointer;font-family:IBM Plex Mono,monospace;font-size:9px;color:${row.budgetLine?'var(--accent2)':'var(--dim)'};user-select:none"
        onclick="(function(el){var inp=el.nextElementSibling;inp.style.display=inp.style.display==='none'?'inline-block':'none';if(inp.style.display!=='none')inp.focus();})(this)">⊞</span>
      <input type="text" value="${escH(row.budgetLine||'')}" placeholder="${t('budget…')}"
        style="display:none;width:90px;font-family:IBM Plex Mono,monospace;font-size:9px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:3px;padding:1px 4px;position:absolute;z-index:10"
        oninput="(function(v,id){var r=allocRows.find(r=>r.id===id);if(r){r.budgetLine=v;}})(this.value,${row.id})"
        onblur="saveState()"
        title="${t('Budget line — shown in CSV export only')}">
    </td>`;
    rh+=`<td class="col-cost" style="font-size:13px;font-weight:600;color:var(--accent2)">${eng?(eng.monthlyCost||0).toLocaleString()+'€':''}</td>`;
    months.forEach(m=>{
      const v=row.allocs&&row.allocs[m]!=null?row.allocs[m]:0;
      const vIsStatus=_allocIsStatus(v);
      const vDisp=vIsStatus?_ALLOC_STATUS[v].label:(v===0?'':Math.round(v*100));
      const cls=vIsStatus?'status-'+v:v>=1?'hi':v>0?'part':'zero';
      const engTotalThisMonth=row.engId?allocRows.reduce((s,r)=>s+(r.engId===row.engId&&r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0),0):0;
      const isOver=engTotalThisMonth>1.005;
      rh+=`<td class="alloc-cell${m===cur?' month-cur':''}" data-row="${row.id}" data-month="${m}"
          style="${isOver&&v>0?'background:rgba(241,67,53,.08);':''}">
        ${vIsStatus
        ? `<div class="alloc-inp status-cell" style="background:${_ALLOC_STATUS[v].bg};color:${_ALLOC_STATUS[v].color};font-weight:700;font-size:12px;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;"
            data-row="${row.id}" data-month="${m}"
            title="${_ALLOC_STATUS[v].title}"
            onmousedown="allocCellMouseDown(event,${row.id},'${m}')"
            oncontextmenu="allocCellCtx(event,${row.id},'${m}')"
            ondblclick="setAlloc(${row.id},'${m}',0);saveState();renderResPlan()"
          >${vDisp}</div>`
        : `<input class="alloc-inp ${cls}" type="number" min="0" max="100" step="5"
          value="${vDisp}" placeholder="0" data-row="${row.id}" data-month="${m}"
          title="${isOver&&v>0?t('⚠ Total {pct}% this month',{pct:Math.round(engTotalThisMonth*100)}):''}"
          onchange="setAlloc(${row.id},'${m}',this.value)" oninput="colorCell(this)"
          onmousedown="allocCellMouseDown(event,${row.id},'${m}')"
          oncontextmenu="allocCellCtx(event,${row.id},'${m}')">` }
      </td>`;
    });
    rh+=`<td><button class="add-row-btn" style="padding:2px 5px;font-size:10px" onclick="addAllocRowAfter(${allocRows.indexOf(row)})">+</button>
      <button class="row-del-btn" onclick="deleteAllocRow(${row.id})">×</button></td></tr>`;
    return rh;
  }

  // ── Helper: subtotal row for a set of rows ──
  function subtotalHTML(label,rows,color){
    let sh=`<tr style="background:rgba(255,255,255,.04);border-top:1px solid var(--border)">
      <td class="col-name" colspan="3" style="font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:700;color:${color};padding-left:14px">
        ${escH(label)}
      </td><td class="col-cost"></td>`;
    months.forEach(m=>{
      const total=rows.reduce((s,r)=>s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0),0);
      const cost=rows.reduce((s,r)=>{const e=engineers.find(e=>e.id===r.engId);return s+(e&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],e.monthlyCost):0);},0);
      const isOver=total>1.005;
      const col=isOver?'var(--danger)':total>0?color:'var(--muted)';
      sh+=`<td class="alloc-cell${m===cur?' month-cur':''}" style="text-align:center">
        <div style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:${col}">${total?total.toFixed(1)+' '+t('FTE'):''}</div>
        <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">${cost?Math.round(cost/1000)+'k€':''}</div>
      </td>`;
    });
    sh+=`<td></td></tr>`;
    return sh;
  }

  // ── Single-project lens: synthesized per-project resourcing summary ──
  // Shows when exactly one project is selected (and no engineer filter). Computed
  // straight off allocRows so it is NOT subject to lifecycle suppression — a
  // proposed/on-hold project still shows its real cost and staffing here.
  if(planFilterProj.size===1 && !planFilterEng.size){
    const _lensProj=projects.find(p=>planFilterProj.has(p.name));
    if(_lensProj) h+=planProjectLens(_lensProj,months,cur);
  }

  // ── Build table ──
  h+=`<div id="alloc-wrap"${planFreezeHeader?' class="freeze-on"':''}><table id="alloc-table"${planViewMode==='flat'&&planFlatSort==='none'?' class="plan-draggable"':''}>
    <thead><tr>
      ${planViewMode==='flat'&&planFlatSort==='none'?'<th style="width:14px"></th>':''}<th class="col-name">${t('ENGINEER')}</th>
      <th class="col-proj">${t('PROJECT')}</th>
      <th class="col-budget" title="${t('Budget line (click ⊞ on a row to set)')}" style="width:24px">⊞</th>
      <th class="col-cost">${t('€/MO')}</th>`;
  months.forEach(m=>{
    const mTotal=allocRows.filter(r=>r.engId).reduce((s,r)=>{
      const eng=engineers.find(e=>e.id===r.engId);
      return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);
    },0);
    const mCost=allocRows.reduce((s,r)=>{
      const eng=engineers.find(e=>e.id===r.engId);
      return s+(eng&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);
    },0);
    h+=`<th class="alloc-cell${m===cur?' month-cur':''}" data-month="${m}" onclick="selectColumn('${m}')" style="cursor:pointer" title="${t('{fte} FTE · {k}k€ — click to select column',{fte:mTotal.toFixed(1),k:Math.round(mCost/1000)})}">${fmtMonth(m)}</th>`;
  });
  h+=`<th></th></tr></thead><tbody>`;

  if(planViewMode==='byEngineer'){
    // Group by engineer — each engineer gets a header + their rows + subtotal
    const engOrder=[...new Set(visibleRows.map(r=>r.engId).filter(Boolean))];
    // Also include unassigned rows
    const unassigned=visibleRows.filter(r=>!r.engId);
    engOrder.forEach(eid=>{
      const eng=engineers.find(e=>e.id===eid);if(!eng)return;
      const eRows=visibleRows.filter(r=>r.engId===eid);
      const collapsed=planCollapsed['e'+eid];
      const grp=engGroups.find(g=>g.id===eng.groupId);
      const engColor=grp?grp.color:'var(--muted)';
      // Engineer group header row
      h+=`<tr style="background:rgba(255,255,255,.06);cursor:pointer" onclick="planCollapsed['e${eid}']=!planCollapsed['e${eid}'];renderResPlan()">
        <td colspan="2" style="padding:6px 10px;font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:700;color:${engColor}">
          <span style="margin-right:6px">${collapsed?'▶':'▼'}</span>
          ${escH(eng.name)}${eng.role?' <span style="font-weight:400;color:var(--muted)">· '+escH(eng.role)+'</span>':''}
          ${grp?'<span style="margin-left:6px;font-size:9px;color:var(--muted)">['+escH(grp.name)+']</span>':''}
        </td>
        <td class="col-cost" style="color:${engColor};font-size:12px;font-weight:600">${(eng.monthlyCost||0).toLocaleString()}€</td>`;
      // Mini utilization bar per month in header
      months.forEach(m=>{
        const total=eRows.reduce((s,r)=>s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0),0);
        const isOver=total>1.005;
        const col=isOver?'var(--danger)':total>0?engColor:'var(--muted)';
        h+=`<td class="alloc-cell${m===cur?' month-cur':''}" style="text-align:center;font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:700;color:${col}">${total?Math.round(total*100)+'%':''}</td>`;
      });
      h+=`<td><button class="add-row-btn" style="padding:2px 5px;font-size:10px" onclick="event.stopPropagation();addRowForEng(${eid})">+</button></td></tr>`;
      if(!collapsed){
        eRows.forEach((row,idx)=>{h+=allocRowHTML(row,idx,false,true);});
      }
    });
    if(unassigned.length){
      h+=`<tr style="background:rgba(255,255,255,.03)"><td colspan="3" style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);padding:5px 10px">${t('UNASSIGNED ROWS')}</td>`;
      months.forEach(()=>{h+=`<td></td>`;});h+=`<td></td></tr>`;
      unassigned.forEach((row,idx)=>{h+=allocRowHTML(row,idx);});
    }

  } else if(planViewMode==='byProject'){
    // Group by project
    const projOrder=[...new Set(visibleRows.map(r=>r.projectId).filter(Boolean))];
    const unassigned=visibleRows.filter(r=>!r.projectId);
    projOrder.forEach(pid=>{
      const proj=projects.find(p=>p.id===pid);if(!proj)return;
      const pRows=visibleRows.filter(r=>r.projectId===pid);
      const collapsed=planCollapsed['p'+pid];
      h+=`<tr style="background:rgba(255,255,255,.06);cursor:pointer" onclick="planCollapsed['p${pid}']=!planCollapsed['p${pid}'];renderResPlan()">
        <td colspan="2" style="padding:6px 10px;font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:700;color:${safeColor(proj.color)}">
          <span style="margin-right:6px">${collapsed?'▶':'▼'}</span>
          ${escH(proj.name)}
        </td>
        <td class="col-cost"></td>`;
      months.forEach(m=>{
        const cost=pRows.reduce((s,r)=>{const e=engineers.find(e=>e.id===r.engId);return s+(e&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],e.monthlyCost):0);},0);
        h+=`<td class="alloc-cell${m===cur?' month-cur':''}" style="text-align:center;font-family:IBM Plex Mono,monospace;font-size:10px;color:${safeColor(proj.color)}">${cost?Math.round(cost/1000)+'k€':''}</td>`;
      });
      h+=`<td><button class="add-row-btn" style="padding:2px 5px;font-size:10px" onclick="event.stopPropagation();addRowForProj(${pid})">+</button></td></tr>`;
      if(!collapsed){
        pRows.forEach((row,idx)=>{h+=allocRowHTML(row,idx,true,false);});
        h+=subtotalHTML(t('SUBTOTAL'),pRows,proj.color);
      }
    });
    if(unassigned.length){
      h+=`<tr style="background:rgba(255,255,255,.03)"><td colspan="3" style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);padding:5px 10px">${t('NO PROJECT')}</td>`;
      months.forEach(()=>{h+=`<td></td>`;});h+=`<td></td></tr>`;
      unassigned.forEach((row,idx)=>{h+=allocRowHTML(row,idx);});
    }

  } else {
    // Flat view — with optional sort or manual drag order
    let flatRows = visibleRows.slice();
    if (planFlatSort === 'engineer') {
      flatRows.sort(function(a, b) {
        var ea = engineers.find(function(e){ return e.id===a.engId; });
        var eb = engineers.find(function(e){ return e.id===b.engId; });
        var na = ea ? ea.name : '';
        var nb = eb ? eb.name : '';
        return na.localeCompare(nb) || (a.projectId||0)-(b.projectId||0);
      });
    } else if (planFlatSort === 'project') {
      flatRows.sort(function(a, b) {
        var pa = projects.find(function(p){ return p.id===a.projectId; });
        var pb = projects.find(function(p){ return p.id===b.projectId; });
        var na = pa ? pa.name : '';
        var nb = pb ? pb.name : '';
        return na.localeCompare(nb) || (a.engId||0)-(b.engId||0);
      });
    } else {
      // Manual order: sync _planRowOrder with current visible rows
      const visIds = flatRows.map(r=>r.id);
      // Add new rows not yet in order
      visIds.forEach(id=>{ if(!_planRowOrder.includes(id)) _planRowOrder.push(id); });
      // Remove rows no longer visible
      _planRowOrder = _planRowOrder.filter(id=>visIds.includes(id));
      // Apply order
      flatRows.sort((a,b)=>_planRowOrder.indexOf(a.id)-_planRowOrder.indexOf(b.id));
    }
    flatRows.forEach((row,idx)=>{h+=allocRowHTML(row,idx,true,true,planFlatSort==='none');});
  }

  // ── Grand totals ──
  // Leading cells MUST mirror the data/header row column layout exactly, or the
  // month totals shift left: [drag handle (flat+manual only)] · name · proj · budget · cost.
  const _totLead=(planViewMode==='flat'&&planFlatSort==='none')?'<td style="width:14px"></td>':'';
  h+=`<tr style="border-top:2px solid var(--border)">
    ${_totLead}<td class="col-name" style="font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:600;color:var(--muted)">${t('TOTAL FTE')}</td>
    <td class="col-proj"></td><td class="col-budget"></td><td class="col-cost"></td>`;
  months.forEach(m=>{
    const total=visibleRows.reduce((s,r)=>s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0),0);
    const col=total>visibleRows.length?'var(--danger)':total>0?'var(--accent)':'var(--muted)';
    h+=`<td class="alloc-cell" style="font-family:IBM Plex Mono,monospace;font-size:12px;font-weight:600;color:${col};text-align:center">${total?total.toFixed(1):''}</td>`;
  });
  h+=`<td></td></tr><tr>
    ${_totLead}<td class="col-name" style="font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:600;color:var(--muted)">${t('COST (€)')}</td>
    <td class="col-proj"></td><td class="col-budget"></td><td class="col-cost"></td>`;
  months.forEach(m=>{
    const cost=visibleRows.reduce((s,r)=>{
      const eng=engineers.find(e=>e.id===r.engId);
      return s+(eng&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],eng.monthlyCost):0);
    },0);
    h+=`<td class="alloc-cell" style="font-family:IBM Plex Mono,monospace;font-size:12px;font-weight:600;color:var(--accent2);text-align:center;white-space:nowrap">${cost?Math.round(cost/1000)+'k€':''}</td>`;
  });
  h+=`<td></td></tr></tbody></table></div>`;

  G('res-body').innerHTML=h;
}

/** Refreshes the active resource tab (plan or dashboard). */
export function buildAllocTable(){ if(resActiveTab==='plan')renderResPlan(); else renderResDashboard(); }

/** Updates the CSS class on an allocation input based on its numeric value. */
export function colorCell(inp){
  const v=+inp.value; // 0-100 display value
  inp.className='alloc-inp '+(v>=100?'hi':v>0?'part':'zero');
}

/* roster ops */
/** Builds the HTML for a single engineer card, including avatar, fields, and action buttons. */
export function engCardHTML(e){
  const skillCount=(e.skills||[]).length;
  // Build per-category counts dynamically from skillCats
  const catCounts={};
  (e.skills||[]).forEach(s=>{ catCounts[s.cat]=(catCounts[s.cat]||0)+1; });
  const skillBadge=skillCount
    ?`<span style="font-family:IBM Plex Mono,monospace;font-size:9px;margin-left:4px">`
      +skillCats.filter(c=>catCounts[c.id]).map(c=>`<span style="color:${safeColor(c.color)}">●${catCounts[c.id]}</span>`).join(' ')
      +`</span>`
    :'';
  // Avatar — from IDB cache or initials
  const col=engGroupColor(e);
  const photo=idbGetPhoto(e.id)||(e.idcard&&e.idcard.photo)||'';
  const avatarHTML=photo
    ?`<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid ${col}"><img src="${photo}" style="width:100%;height:100%;object-fit:cover"></div>`
    :`<div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;background:${col}33;border:2px solid ${col};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${col};font-family:IBM Plex Mono,monospace">${escH(engInitials(e.name))}</div>`;
  return `<div class="eng-card" draggable="true"
      ondragstart="dragEngStart(event,${e.id})" ondragend="dragEngEnd(event)"
      id="ec-${e.id}">
    <span class="eng-drag-handle" title="${t('Drag to regroup')}">⋮⋮</span>
    ${e.planningOnly?`<div style="margin:4px 0 0 4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap"><div style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:3px;background:rgba(91,229,200,.12);color:var(--accent2);border:1px solid rgba(91,229,200,.3)">${t('📋 PLANNING ONLY')}</div><label style="display:flex;align-items:center;gap:3px;font-size:9px;color:var(--muted);cursor:pointer"><input type="checkbox" ${e.includeInCost?'checked':''} style="accent-color:var(--accent2);cursor:pointer" onchange="(function(cb){const eng=engineers.find(e=>e.id===${e.id});if(eng){eng.includeInCost=cb.checked;saveState();}})(this)">${t('Include in cost calc')}</label></div>`:''}
    ${avatarHTML}
    <div class="eng-card-field">
      <div class="eng-card-label">${t('NAME')}</div>
      <input class="eng-card-inp" id="en-name-${e.id}" value="${escH(e.name)}" placeholder="${t('Name')}" style="font-weight:600"
        onblur="rosterAutoSave(${e.id})">
    </div>
    <div class="eng-card-field">
      <div class="eng-card-label">${t('ROLE / TITLE')}</div>
      <input class="eng-card-inp" id="en-role-${e.id}" value="${escH(e.role||'')}" placeholder="${t('Role…')}"
        onblur="rosterAutoSave(${e.id})">
    </div>
    <div class="eng-card-field">
      <div class="eng-card-label">${t('LOCATION')}</div>
      <input class="eng-card-inp" id="en-loc-${e.id}" value="${escH(e.location||'')}" placeholder="${t('Location…')}"
        onblur="rosterAutoSave(${e.id})">
    </div>
    <div class="eng-card-field">
      <div class="eng-card-label">${t('€/MONTH')}</div>
      <input class="eng-card-inp" id="en-cost-${e.id}" type="number" value="${e.monthlyCost}" min="0" step="100" style="width:80px"
        onblur="rosterAutoSave(${e.id})">
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
      ${e.planningOnly ? `<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--accent2)">${t('Planning only')}</span>` : `
      <button class="sm" onclick="openSkillsModal(${e.id})" title="${t('Edit skills')}"
        style="font-size:9px;padding:3px 7px;border-color:${skillCount?'var(--accent2)':'var(--border)'}">
        ◈ ${t('SKILLS')}${skillBadge}
      </button>
      <button class="sm" onclick="openIdCardModal(${e.id})" title="${t('Employee profile — set Reports-To for org chart')}"
        style="font-size:9px;padding:3px 7px;border-color:${(e.idcard&&(e.idcard.reportsTo||e.idcard.manager))?'var(--accent)':'var(--danger)'}">
        👤 ${(e.idcard&&(e.idcard.reportsTo||e.idcard.manager))?t('PROFILE'):t('PROFILE ⚠')}
      </button>`}
    </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:2px 6px 4px">
      ${e.excludeFromCalc ? `<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:1px 6px;border-radius:3px;background:rgba(241,164,53,.12);color:var(--warn);border:1px solid rgba(241,164,53,.3)">${t('⊘ EXCLUDED')}</span>` : ''}
      <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)" title="${t('Exclude from all calculations (dashboard, financial, development, skills analysis). Still visible in roster and planning.')}">
        <input type="checkbox" ${e.excludeFromCalc?'checked':''} style="accent-color:var(--warn);cursor:pointer"
          onchange="(function(cb){var eng=engineers.find(e=>e.id===${e.id});if(eng){eng.excludeFromCalc=cb.checked;saveState();renderRoster();}})(this)">
        ${t('Exclude from calc')}
      </label>
    </div>
    <button class="row-del-btn" onclick="deleteEngineer(${e.id})" title="${t('Delete engineer')}">×</button>
  </div>`;
}

// ── Drag engineers between groups ──
/** Module-level state: id of the engineer currently being dragged between groups. */
export let _dragEngId=null;
/** Sets the drag source engineer id and fades the dragged card. */
export function dragEngStart(e,id){_dragEngId=id;e.currentTarget.style.opacity='0.4';}
/** Clears drag state and restores card opacity on drag end. */
export function dragEngEnd(e){e.currentTarget.style.opacity='';_dragEngId=null;}
/** Handles drop of a dragged engineer onto a group container. */
export function dropEngOnGroup(e,groupId){
  e.preventDefault();
  if(_dragEngId==null)return;
  // Flush any pending edits on the dragged card before re-rendering
  rosterAutoSave(_dragEngId);
  const eng=engineers.find(en=>en.id===_dragEngId);
  if(eng)eng.groupId=groupId?+groupId:null;
  _dragEngId=null;
  saveState();renderResActiveTab();
}

// ── Group ops ──
/** Cycling color palette for auto-assigning colors to new engineer groups. */
export const ENG_GROUP_COLORS=['#c8f135','#5be5c8','#f1a435','#a78bfa','#f14335','#38bdf8','#fb7185','#34d399'];
/** Creates a new engineer group with the next cycling color and saves. */
export function addEngGroup(){
  const col=ENG_GROUP_COLORS[engGroups.length%ENG_GROUP_COLORS.length];
  engGroups.push({id:nextEngGroupId++,name:'New Group',color:col,collapsed:false});
  saveState();renderResActiveTab();
}
/** Deletes a group by id, ungroups its members, and saves. */
export function deleteEngGroup(id){
  if(!confirm('Delete group? Engineers will become ungrouped.'))return;
  engGroups=engGroups.filter(g=>g.id!==id);
  engineers.forEach(e=>{if(e.groupId===id)e.groupId=null;});
  saveState();renderResActiveTab();
}
/** Toggles group collapse state and sets that group as the "add engineer" target. */
export function toggleEngGroup(id){
  // Select this group for "Add Engineer" targeting
  selectedEngGroupId = (id===0) ? null : id;
  const hint=G('eng-add-hint');
  if(hint){ const g=engGroups.find(g=>g.id===selectedEngGroupId); hint.textContent=g?('→ '+g.name):'click a group to target it'; }
  // Update selected highlight (visual feedback)
  document.querySelectorAll('.eng-group-block').forEach(el=>el.classList.remove('grp-selected'));
  const selEl = id===0 ? null : G('eg-'+id);
  if(selEl) selEl.classList.add('grp-selected');

  if(id===0){
    const body=G('egb-0'), chev=G('egc-0');
    if(!body)return;
    const hidden=body.style.display==='none';
    body.style.display=hidden?'flex':'none';
    if(chev)chev.style.transform=hidden?'':'rotate(-90deg)';
    return;
  }
  const g=engGroups.find(g=>g.id===id);if(!g)return;
  g.collapsed=!g.collapsed;
  saveState();renderResActiveTab();
}
/** Renames an engineer group by id (does not save; caller must save). */
export function renameEngGroup(id,val){
  const g=engGroups.find(g=>g.id===id);if(g)g.name=val;
}
/** Sets an engineer group's color and saves. */
export function setEngGroupColor(id,color){
  const g=engGroups.find(g=>g.id===id);if(g)g.color=color;
  saveState();renderResActiveTab();
}

// ── Engineer ops ──
/** Reads all visible engineer card inputs and persists state. */
export function saveRoster(){
  // Only read from inputs that exist in the DOM (collapsed groups won't render their cards)
  engineers.forEach(eng=>{
    const ni=G('en-name-'+eng.id);
    if(!ni)return; // card not rendered (collapsed group) — skip, don't overwrite state
    const ri=G('en-role-'+eng.id),li=G('en-loc-'+eng.id),ci=G('en-cost-'+eng.id);
    const newName=ni.value.trim();
    if(newName)eng.name=newName; // only update if non-empty
    if(ri)eng.role=ri.value;
    if(li)eng.location=li.value;
    if(ci){const v=+ci.value;if(!isNaN(v)&&v>0)eng.monthlyCost=v;}
  });
  saveState();renderResActiveTab();
}
/** Adds a new engineer to the selected group and re-renders. */
export function addEngineer(){
  const gid=selectedEngGroupId;
  engineers.push({uid:newUid(),id:nextEngId++,name:'New Engineer',monthlyCost:8000,groupId:gid,role:'',location:'',skills:[],idcard:{},excludeFromCalc:false});
  if(gid){const g=engGroups.find(g=>g.id===gid);if(g)g.collapsed=false;}
  saveState(); // persist before render so reload can't lose the new engineer
  renderResActiveTab();
}
/** Deletes an engineer by id after confirmation; clears related alloc row assignments. */
export function deleteEngineer(id){
  if(!confirm('Delete engineer? Allocation rows using this engineer will lose their assignment.'))return;
  engineers=engineers.filter(e=>e.id!==id);
  allocRows.forEach(r=>{if(r.engId===id)r.engId=null;});
  saveNow();renderResActiveTab();
}

/* alloc row ops */
/** Inserts a new empty alloc row after the given index (or at end if index is out of range). */
export function addAllocRowAfter(idx){
  const row={uid:newUid(),id:nextAllocId++,engId:null,projectId:null,allocs:{},budgetLine:''};
  if(idx<0||idx>=allocRows.length) allocRows.push(row);
  else allocRows.splice(idx+1,0,row);
  renderResPlan();
}
/** Removes an alloc row by id and re-renders. */
export function deleteAllocRow(id){
  allocRows=allocRows.filter(r=>r.id!==id);
  renderResPlan();
}
/** Assigns an engineer to an alloc row by row id. */
export function setRowEng(id,engId){
  const r=allocRows.find(r=>r.id===id);if(r)r.engId=engId||null;
}
/** Assigns a project to an alloc row by row id. */
export function setRowProj(id,projId){
  const r=allocRows.find(r=>r.id===id);if(r)r.projectId=projId||null;
}
/** Sets a month's allocation value for a row; stores status letters as-is and numeric as 0–1. */
export function setAlloc(rowId,month,val){
  const r=allocRows.find(r=>r.id===rowId);if(!r)return;
  if(!r.allocs)r.allocs={};
  // Status letters stored as-is
  if(val==='m'||val==='p'||val==='r'){r.allocs[month]=val;}
  else {
    const pct=parseFloat(val);
    if(isNaN(pct)||pct<=0) delete r.allocs[month];
    else r.allocs[month]=Math.min(1,Math.max(0,pct/100)); // store as 0-1
  }
  // Persist every allocation edit. The cell's onchange calls only setAlloc, so
  // without this the edit lived in memory only — never written to localStorage and
  // (with multi-user) never pushed to the shared doc, so it didn't sync. saveState
  // is debounced, so bulk callers that loop setAlloc still coalesce to one write.
  saveState();
}
/** Returns true if the alloc value is a status letter (m, p, or r). */
export function _allocIsStatus(v){return v==='m'||v==='p'||v==='r';}
/* _allocNum(), _allocCost() and _ALLOC_STATUS are defined in helpers.js/globals.js (bundled earlier) — do not redeclare */

/* ── DASHBOARD TAB ── */


/* ══════════════════════════════════════════════════════════════════
   MODULE: RESOURCE PLAN: DASHBOARD
   ══════════════════════════════════════════════════════════════════ */

// ── Dashboard helpers ────────────────────────────────────────────

/** Applies a status letter to the current selection or to the active context-menu cell. */
export function ctxSetStatus(letter){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  // Apply to entire selection if multiple cells selected, else just the ctx cell
  const sel=Object.keys(_allocSel).filter(k=>_allocSel[k]);
  if(sel.length>1){
    sel.forEach(key=>{
      const [rowId,month]=key.split('_');
      setAlloc(+rowId,month,letter);
    });
  } else {
    setAlloc(_allocCtxCell.rowId,_allocCtxCell.month,letter);
  }
  saveState();renderResPlan();
}
/** Applies a status letter across the fill-from/to month range on the active context-menu row. */
export function ctxSetStatusRow(letter){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  const months=getMonthRange();
  const from=V('fill-from')||months[0], to=V('fill-to')||months[months.length-1];
  months.filter(m=>m>=from&&m<=to).forEach(m=>setAlloc(_allocCtxCell.rowId,m,letter));
  saveState();renderResPlan();
}

/** Stores the source index for alloc-row drag-reorder and sets drag effect. */
export function _planDragStart(e, idx) {
  _planDragSrc = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(idx));
  setTimeout(function(){ var tr = e.currentTarget; if(tr) tr.style.opacity='0.4'; }, 0);
}
/** Clears drag state and restores row opacity on drag end. */
export function _planDragEnd(e) {
  if(e.currentTarget) e.currentTarget.style.opacity = '';
  _planDragSrc = null;
}
/** Drops a dragged alloc row at the target index and reorders _planRowOrder. */
export function _planDrop(e, targetIdx) {
  e.preventDefault();
  if(_planDragSrc === null || _planDragSrc === targetIdx) return;
  // Reorder _planRowOrder
  var moved = _planRowOrder.splice(_planDragSrc, 1)[0];
  _planRowOrder.splice(targetIdx, 0, moved);
  _planDragSrc = null;
  renderResPlan();
}

/** Exports a CSV for all allocations on a single project, with optional exclusion of calc-excluded engineers. */
export function exportPlanProject(projId, excl){
  var p = projects.find(function(p){ return p.id===projId; });
  if(!p){ alert('Project not found.'); return; }
  var months = getMonthRange();
  if(!months.length){ alert('No months in selected period.'); return; }

  // Collect all alloc rows for this project (including planning-only resources)
  var pRows = allocRows.filter(function(r){
    if(r.projectId!==projId || !r.engId) return false;
    if(excl){var e=engineers.find(function(e){return e.id===r.engId;});if(e&&e.excludeFromCalc)return false;}
    return true;
  });
  if(!pRows.length){ alert('No allocations found for '+p.name); return; }

  // Merge rows by engineer (same engineer may have multiple rows)
  var engMap = {};
  pRows.forEach(function(r){
    var eng = engineers.find(function(e){ return e.id===r.engId; });
    if(!eng) return;
    if(!engMap[r.engId]){
      engMap[r.engId] = { eng:eng, allocs:{}, budgetLine:r.budgetLine||'' };
    } else if(r.budgetLine && !engMap[r.engId].budgetLine){
      engMap[r.engId].budgetLine = r.budgetLine;
    }
    if(r.allocs){
      Object.keys(r.allocs).forEach(function(m){
        var v = r.allocs[m];
        if(!v) return;
        var num = (v==='m'||v==='r') ? 0 : v==='p' ? 1 : +v;
        engMap[r.engId].allocs[m] = (engMap[r.engId].allocs[m]||0) + num;
      });
    }
  });

  var rows = Object.values(engMap).sort(function(a,b){
    return a.eng.name.localeCompare(b.eng.name);
  });

  // Build CSV
  var header = ['Name','Role','Group','Type','Budget Line'].concat(months).concat(['Total FTE','Total Cost (€)']);

  var csvLines = [header];

  rows.forEach(function(item){
    var eng = item.eng;
    var grp = engGroups.find(function(g){ return g.id===eng.groupId; });
    var type = eng.planningOnly ? 'Planning Resource' : (eng.vacant ? 'Vacancy' : 'Engineer');
    var row = [
      eng.name,
      eng.role||'',
      grp ? grp.name : '',
      type,
      item.budgetLine||'',
    ];
    var totalFTE = 0, totalCost = 0;
    var countsCost = !eng.planningOnly || eng.includeInCost;
    months.forEach(function(m){
      var fte = item.allocs[m]||0;
      row.push(fte>0 ? fte.toFixed(2) : '');
      totalFTE += fte;
      if(countsCost) totalCost += fte*(eng.monthlyCost||0);
    });
    row.push(totalFTE.toFixed(2));
    row.push(countsCost ? Math.round(totalCost) : '');
    csvLines.push(row);
  });

  // Add totals row
  var totalsRow = ['TOTAL','','','',''];
  var grandFTE = 0, grandCost = 0;
  months.forEach(function(m){
    var mFTE = rows.reduce(function(s,item){
      return s + (item.allocs[m]||0);
    }, 0);
    totalsRow.push(mFTE>0 ? mFTE.toFixed(2) : '');
    grandFTE += mFTE;
    grandCost += rows.reduce(function(s,item){
      if(item.eng.planningOnly && !item.eng.includeInCost) return s;
      return s + (item.allocs[m]||0)*(item.eng.monthlyCost||0);
    }, 0);
  });
  totalsRow.push(grandFTE.toFixed(1));
  totalsRow.push(Math.round(grandCost));
  csvLines.push([]);
  csvLines.push(totalsRow);

  // Escape and join
  var csv = csvLines.map(function(row){
    return row.map(function(c){
      var s = String(c===null||c===undefined?'':c);
      if(s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0)
        return '"'+s.replace(/"/g,'""')+'"';
      return s;
    }).join(',');
  }).join('\n');

  // Metadata footer
  var NL='\n';
  var meta = NL+'# Project: '+p.name+NL
    + '# Gate: '+(p.currentGate||'')+(p.gate?' > '+p.gate:'')+NL
    + '# Period: '+months[0]+' to '+months[months.length-1]+' ('+months.length+' months)'+NL
    + '# Exported: '+new Date().toISOString().slice(0,10)+NL
    + '# FTE values: 0-1 scale (1.00 = 100%)';

  var blob = new Blob([csv+meta], {type:'text/csv'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'plan_'+p.name.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
}


/* ── Plan export functions ───────────────────────────────────────── */

/** Routes the export toolbar dropdown to the appropriate export function. */
export function exportPlanSelected(){
  var sel = G('plan-export-mode');
  if(!sel||!sel.value){ alert('Choose an export mode first.'); return; }
  var val = sel.value;
  var exclCb = G('plan-export-excl');
  var excl = exclCb ? exclCb.checked : true;
  if(val==='full')       exportPlanFull(excl);
  else if(val==='view')  exportPlanView(excl);
  else if(val.startsWith('proj_')) exportPlanProject(+val.slice(5), excl);
  sel.value = '';
}

/* ── Shared helpers ─────────────────────────────────────────────── */

/** Builds a grouped CSV string from the given groups/rows/months and triggers download. */
export function _planBuildCSV(groups, months, title){
  // groups = [{label, rows:[{eng,allocs,budgetLine,projName}]}]
  var FIXED_COLS = ['Engineer','Project','Budget Line','Type','€/MO'];
  var header = FIXED_COLS.concat(months).concat(['Total FTE','Total Cost (€)']);

  var csvLines = [header];

  groups.forEach(function(group){
    if(group.label){
      // Repeat label across all fixed cols so Excel auto-filter works
      var labelRow = [group.label, group.label, '', '', ''];
      months.forEach(function(){ labelRow.push(''); });
      labelRow.push('','');
      csvLines.push(labelRow);
    }
    group.rows.forEach(function(item){
      var row = [
        item.eng ? item.eng.name : '—',
        item.projName || '—',
        item.budgetLine || '',
        item.eng ? (item.eng.planningOnly?'Planning':item.eng.vacant?'Vacancy':'Engineer') : '—',
        item.eng && (!item.eng.planningOnly||item.eng.includeInCost) ? (item.eng.monthlyCost||0) : '',
      ];
      var totalFTE=0, totalCost=0;
      var countsCost = item.eng && (!item.eng.planningOnly || item.eng.includeInCost);
      months.forEach(function(m){
        var v = item.allocs[m];
        var fte = (v!=null) ? _allocNum(v) : 0;
        row.push(fte>0 ? fte.toFixed(2) : '');
        totalFTE += fte;
        if(countsCost && v!=null) totalCost += _allocCost(v, item.eng.monthlyCost||0);
      });
      row.push(totalFTE.toFixed(2));
      row.push(countsCost && totalCost>0 ? Math.round(totalCost) : '');
      csvLines.push(row);
    });
  });

  var csv = csvLines.map(function(row){
    return row.map(function(c){
      var s = String(c===null||c===undefined?'':c);
      if(s.indexOf(',')>=0||s.indexOf('"')>=0||s.indexOf('\n')>=0)
        return '"'+s.replace(/"/g,'""')+'"';
      return s;
    }).join(',');
  }).join('\n');

  var meta = '\n# '+title
    +'\n# Period: '+(months[0]||'')+' to '+(months[months.length-1]||'')+' ('+months.length+' months)'
    +'\n# Exported: '+new Date().toISOString().slice(0,10)
    +'\n# FTE values: 0-1 scale (1.00 = 100%)';

  _downloadCSV(csv+meta, title.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.csv');
}

/** Creates a Blob from the CSV content string and triggers a file download. */
export function _downloadCSV(content, filename){
  var blob = new Blob([content],{type:'text/csv'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href=url; a.download=filename; a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); },2000);
}

/** Merges multiple alloc rows for the same (engineer, project) pair into a single item. */
export function _mergeAllocsByEngProj(rowList){
  // Merge multiple allocRows for same (eng,proj) pair
  var map = {};
  rowList.forEach(function(r){
    var eng = engineers.find(function(e){return e.id===r.engId;});
    if(!eng) return;
    var key = r.engId+'_'+r.projectId;
    if(!map[key]) map[key]={eng:eng, allocs:{}, budgetLine:r.budgetLine||'',
      projName:(projects.find(function(p){return p.id===r.projectId;})||{}).name||'—'};
    else if(r.budgetLine && !map[key].budgetLine) map[key].budgetLine=r.budgetLine;
    if(r.allocs) Object.keys(r.allocs).forEach(function(m){
      var v=r.allocs[m];
      if(v==null) return;
      var num = _allocNum(v);
      map[key].allocs[m]=(map[key].allocs[m]||0)+num;
    });
  });
  return Object.values(map);
}

/* ── Export: full ───────────────────────────────────────────────── */

/** Exports a flat CSV of all allocated rows across all projects. */
export function exportPlanFull(excl){
  var months = getMonthRange();
  if(!months.length){alert('Set a FROM/TO period first.');return;}
  var visible = allocRows.filter(function(r){
    if(!r.engId || !r.projectId) return false;
    if(excl){var e=engineers.find(function(e){return e.id===r.engId;});if(e&&e.excludeFromCalc)return false;}
    return true;
  });
  var items = _mergeAllocsByEngProj(visible);
  items.sort(function(a,b){return a.eng.name.localeCompare(b.eng.name)||a.projName.localeCompare(b.projName);});
  _planBuildCSV([{label:'', rows:items}], months, 'Full Plan Export');
}

/* ── Export: current view ───────────────────────────────────────── */

/** Exports a CSV matching the current filter/view mode (flat, by engineer, or by project). */
export function exportPlanView(excl){
  var months = getMonthRange();
  if(!months.length){alert('Set a FROM/TO period first.');return;}

  var visible = allocRows.filter(function(r){
    if(!r.engId || !r.projectId) return false;
    if(excl){var ex=engineers.find(function(e){return e.id===r.engId;});if(ex&&ex.excludeFromCalc)return false;}
    if(planFilterEng.size){var e=engineers.find(function(e){return e.id===r.engId;});if(!e||!planFilterEng.has(e.name))return false;}
    if(planFilterProj.size){var p=projects.find(function(p){return p.id===r.projectId;});if(!p||!planFilterProj.has(p.name))return false;}
    return true;
  });

  var groups = [];

  if(planViewMode==='byEngineer'){
    var engIds=[...new Set(visible.map(function(r){return r.engId;}))];
    engIds.forEach(function(eid){
      var eng=engineers.find(function(e){return e.id===eid;}); if(!eng) return;
      var eRows=visible.filter(function(r){return r.engId===eid;});
      var items=_mergeAllocsByEngProj(eRows);
      groups.push({label:eng.name+(eng.role?' · '+eng.role:''), rows:items});
    });
  } else if(planViewMode==='byProject'){
    var projIds=[...new Set(visible.map(function(r){return r.projectId;}))];
    projIds.forEach(function(pid){
      var p=projects.find(function(p){return p.id===pid;}); if(!p) return;
      var pRows=visible.filter(function(r){return r.projectId===pid;});
      var items=_mergeAllocsByEngProj(pRows);
      groups.push({label:p.name+(p.currentGate?' ['+p.currentGate+']':''), rows:items});
    });
  } else {
    // Flat
    var items=_mergeAllocsByEngProj(visible);
    groups.push({label:'', rows:items});
  }

  _planBuildCSV(groups, months, 'Plan Export ('+planViewMode+')');
}


/* ── Availability panel helpers ─────────────────────────────────── */
/** Toggles whether an engineer is selected in the availability panel. */
export function availToggle(engId){
  if(_availPanel.selected.has(engId)) _availPanel.selected.delete(engId);
  else _availPanel.selected.add(engId);
  renderResDashboard();
}
/** Selects all engineers whose utilization rate is below the panel threshold. */
export function availSelectAll(){
  var engUtil=_buildEngUtil(_dashMonths());
  Object.values(engUtil).forEach(function(eu){
    if(eu.utilizationRate*100 < _availPanel.threshold) _availPanel.selected.add(eu.eng.id);
  });
  renderResDashboard();
}
/** Clears all engineers from the availability panel selection. */
export function availSelectNone(){
  _availPanel.selected.clear();
  renderResDashboard();
}
/** Scrolls smoothly to the capability section within the availability panel. */
export function availShowCapability(){
  // Scroll to capability section
  var el=document.getElementById('avail-capability');
  if(el) el.scrollIntoView({behavior:'smooth',block:'nearest'});
}

/* _allocSel, _allocLastCell, _allocCopied, _allocCtxCell are declared in globals.js — do not redeclare */

/* ►► SECTION: ALLOC-CELLS ◄◄ Allocation cell selection, fill, copy/paste, context menu */
/** Mouse-down on an alloc cell: handles single/range/toggle selection. */
export function allocCellMouseDown(e,rowId,month){
  if(e.button!==0)return;
  if(e.shiftKey&&_allocLastCell){
    const months=getMonthRange();
    const rows=allocRows.map(r=>r.id);
    const r1=rows.indexOf(_allocLastCell.rowId), r2=rows.indexOf(rowId);
    const m1=months.indexOf(_allocLastCell.month), m2=months.indexOf(month);
    const rMin=Math.min(r1,r2), rMax=Math.max(r1,r2);
    const mMin=Math.min(m1,m2), mMax=Math.max(m1,m2);
    if(!e.ctrlKey&&!e.metaKey) _allocSel={};
    for(let ri=rMin;ri<=rMax;ri++){
      for(let mi=mMin;mi<=mMax;mi++){
        _allocSel[rows[ri]+'_'+months[mi]]=true;
      }
    }
  } else {
    if(!e.ctrlKey&&!e.metaKey) _allocSel={};
    _allocSel[rowId+'_'+month]=!(_allocSel[rowId+'_'+month]);
  }
  _allocLastCell={rowId,month};
  updateAllocSelHighlight();
  const n=Object.keys(_allocSel).filter(k=>_allocSel[k]).length;
  const hint=G('sel-hint');
  if(hint) hint.textContent=n?`${n} cell${n>1?'s':''} selected — right-click for options`:'Click cells to select · Shift+click for range · Right-click for options';
}

/** Syncs the `sel` CSS class on alloc inputs to the current selection. */
export function updateAllocSelHighlight(){
  document.querySelectorAll('#alloc-table .alloc-inp').forEach(inp=>{
    const key=inp.dataset.row+'_'+inp.dataset.month;
    if(_allocSel[key]) inp.classList.add('sel');
    else               inp.classList.remove('sel');
  });
}

/** Right-click on an alloc cell: opens the cell context menu. */
export function allocCellCtx(e,rowId,month){
  e.preventDefault();
  _allocCtxCell={rowId,month};
  if(!_allocSel[rowId+'_'+month]){
    _allocSel={};_allocSel[rowId+'_'+month]=true;
    _allocLastCell={rowId,month};
    updateAllocSelHighlight();
  }
  const m=G('alloc-ctx');
  m.style.left=Math.min(e.clientX,window.innerWidth-190)+'px';
  m.style.top=Math.min(e.clientY,window.innerHeight-200)+'px';
  m.classList.add('show');
}
document.addEventListener('click',e=>{
  if(!G('alloc-ctx').contains(e.target)) G('alloc-ctx').classList.remove('show');
});

/** Context menu: fills the active row across the fill-from/to month range. */
export function ctxFillRow(){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  const val=prompt('Fill value (0-100):','100');if(val===null)return;
  const pct=parseFloat(val);if(isNaN(pct))return;
  const months=getMonthRange();
  const from=V('fill-from')||months[0], to=V('fill-to')||months[months.length-1];
  const inRange=m=>m>=from&&m<=to;
  months.filter(inRange).forEach(m=>setAlloc(_allocCtxCell.rowId,m,pct));
  renderResPlan();
}
/** Context menu: fills every row for the active month. */
export function ctxFillCol(){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  const val=prompt('Fill value (0-100) for all rows in month '+_allocCtxCell.month+':','100');if(val===null)return;
  const pct=parseFloat(val);if(isNaN(pct))return;
  allocRows.forEach(r=>setAlloc(r.id,_allocCtxCell.month,pct));
  renderResPlan();
}
/** Context menu: copies the active cell's value to the paste buffer. */
export function ctxCopyCell(){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  const r=allocRows.find(r=>r.id===_allocCtxCell.rowId);if(!r)return;
  _allocCopied=r.allocs&&r.allocs[_allocCtxCell.month]!=null?r.allocs[_allocCtxCell.month]:0;
  const hint=G('sel-hint');
  if(hint)hint.textContent=`Copied: ${Math.round(_allocCopied*100)}% — right-click a selection to paste`;
}
/** Context menu: pastes the copied value into every selected cell. */
export function ctxPasteCell(){
  G('alloc-ctx').classList.remove('show');
  if(_allocCopied===null)return;
  Object.keys(_allocSel).filter(k=>_allocSel[k]).forEach(key=>{
    const [rowId,month]=key.split('_');
    setAlloc(+rowId,month,Math.round(_allocCopied*100));
  });
  renderResPlan();
}
/** Context menu: clears all months on the active row. */
export function ctxClearRow(){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  const months=getMonthRange();
  months.forEach(m=>setAlloc(_allocCtxCell.rowId,m,0));
  renderResPlan();
}
/** Context menu: clears the active month across all rows. */
export function ctxClearCol(){
  G('alloc-ctx').classList.remove('show');
  if(!_allocCtxCell)return;
  allocRows.forEach(r=>setAlloc(r.id,_allocCtxCell.month,0));
  renderResPlan();
}

/** Selects every row's cell for the given month. */
export function selectColumn(month){
  allocRows.forEach(r=>{ _allocSel[r.id+'_'+month]=true; });
  updateAllocSelHighlight();
  const hint=G('sel-hint');
  if(hint)hint.textContent=`Column ${month} selected (${allocRows.length} cells) — right-click for options`;
}

/** Fill bar: fills selected rows across the month range with the fill value. */
export function fillSelectedRows(){
  const val=parseFloat(V('fill-val'));if(isNaN(val))return;
  const months=getMonthRange();
  const from=V('fill-from')||months[0], to=V('fill-to')||months[months.length-1];
  const inRange=m=>m>=from&&m<=to;
  const selRows=new Set(Object.keys(_allocSel).filter(k=>_allocSel[k]).map(k=>+k.split('_')[0]));
  if(!selRows.size){alert('Select at least one row first (click a cell).');return;}
  selRows.forEach(rowId=>months.filter(inRange).forEach(m=>setAlloc(rowId,m,val)));
  renderResPlan();
}

/** Fill bar: fills all rows across the month range with the fill value. */
export function fillAllRows(){
  const val=parseFloat(V('fill-val'));if(isNaN(val))return;
  const months=getMonthRange();
  const from=V('fill-from')||months[0], to=V('fill-to')||months[months.length-1];
  const inRange=m=>m>=from&&m<=to;
  allocRows.forEach(r=>months.filter(inRange).forEach(m=>setAlloc(r.id,m,val)));
  renderResPlan();
}

let _rosterSaveTimer=null;

/* ►► SECTION: PLAN-HELPERS ◄◄ Plan view helpers: addRowForEng/Proj */
/** Sets the plan view mode (flat/byEngineer/byProject) and re-renders. */
export function setPlanView(mode){planViewMode=mode;renderResPlan();}

/** Adds a new empty alloc row pre-assigned to an engineer. */
export function addRowForEng(engId){
  const row={uid:newUid(),id:nextAllocId++,engId,projectId:null,allocs:{}};
  allocRows.push(row);
  renderResPlan();
}
/** Adds a new empty alloc row pre-assigned to a project. */
export function addRowForProj(projId){
  const row={uid:newUid(),id:nextAllocId++,engId:null,projectId:projId,allocs:{}};
  allocRows.push(row);
  renderResPlan();
}

/* ══════════════════════════════════════════════════════════════════
   PROJECT LENS — synthesized per-project resourcing summary
   Shown atop the plan when one project is selected. A pure join over
   allocRows + charter demand; intentionally NOT suppression-gated so a
   proposed/on-hold project still shows real cost & staffing.
   ══════════════════════════════════════════════════════════════════ */
export function planProjectLens(proj, months, cur){
  if(!months||!months.length) return '';
  const engById=_engByIdMap();
  const rows=allocRows.filter(r=>r.projectId===proj.id && r.engId!=null);

  // Per-month FTE and € for THIS project.
  const mFte=months.map(m=>rows.reduce((s,r)=>s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0),0));
  const mCost=months.map(m=>rows.reduce((s,r)=>{const e=engById.get(r.engId);return s+(e&&r.allocs&&r.allocs[m]!=null?_allocCost(r.allocs[m],e.monthlyCost):0);},0));
  const totCost=mCost.reduce((s,v)=>s+v,0);
  const totFteMonths=mFte.reduce((s,v)=>s+v,0);
  let peak=0,peakIdx=-1; mFte.forEach((v,i)=>{if(v>peak){peak=v;peakIdx=i;}});

  // Each engineer's TOTAL load per month across ALL projects (raw, unsuppressed),
  // so we can flag over-allocation caused elsewhere.
  const loadByEng={};
  allocRows.forEach(r=>{ if(r.engId==null)return; const map=loadByEng[r.engId]||(loadByEng[r.engId]={});
    months.forEach(m=>{ if(r.allocs&&r.allocs[m]!=null) map[m]=(map[m]||0)+_allocNum(r.allocs[m]); }); });

  // Aggregate this project's rows by engineer.
  const byEng={};
  rows.forEach(r=>{ const e=engById.get(r.engId); if(!e)return;
    const a=byEng[r.engId]||(byEng[r.engId]={eng:e,fteMonths:0,cost:0,peak:0,mrMonths:0});
    months.forEach(m=>{ const v=r.allocs?r.allocs[m]:null; if(v==null)return;
      const n=_allocNum(v); a.fteMonths+=n; a.cost+=_allocCost(v,e.monthlyCost); if(n>a.peak)a.peak=n;
      if(v==='m'||v==='r')a.mrMonths++; });
  });
  const team=Object.values(byEng).filter(a=>a.fteMonths>0||a.mrMonths>0);
  const headcount=team.filter(a=>a.fteMonths>0).length;

  // Cost / effort by function (engGroup).
  const byGrp={};
  team.forEach(a=>{ const g=engGroups.find(gg=>gg.id===a.eng.groupId); const key=g?g.id:'__none';
    const b=byGrp[key]||(byGrp[key]={name:g?g.name:t('Unassigned'),color:g?g.color:'var(--muted)',fteMonths:0,cost:0});
    b.fteMonths+=a.fteMonths; b.cost+=a.cost; });
  const grpList=Object.values(byGrp).sort((x,y)=>y.fteMonths-x.fteMonths);

  // Over-allocation: engineers on this project whose TOTAL load tops 1.0 in a month
  // they are staffed here.
  const overNames=[];
  team.forEach(a=>{ if(a.fteMonths<=0)return; const load=loadByEng[a.eng.id]||{};
    const hit=months.some(m=>{ const here=(byEng[a.eng.id]&&_engMonthOnProj(rows,a.eng.id,m))>0; return here && (load[m]||0)>1.005; });
    if(hit) overNames.push(a.eng.name); });

  // Charter demand (forecast) vs actual.
  const dem=proj.charter&&proj.charter.demand?proj.charter.demand:null;
  const demPeak=dem&&dem.peakFte!=null?dem.peakFte:null;
  const demFteMonths=dem&&dem.fteMonths!=null?dem.fteMonths:null;

  const lc=projLifecycleDef(proj);
  const money=v=>v>=1000?Math.round(v/1000).toLocaleString()+' k€':Math.round(v)+' €';
  const pkColor='var(--accent2)';

  // ── Hero KPI tiles ──
  function tile(val,label,sub,color){
    return `<div style="flex:1;min-width:120px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="font-family:IBM Plex Mono,monospace;font-size:19px;font-weight:700;color:${color||'var(--text)'}">${val}</div>
      <div style="font-family:IBM Plex Mono,monospace;font-size:9px;letter-spacing:.05em;color:var(--muted);text-transform:uppercase;margin-top:2px">${escH(label)}</div>
      ${sub?`<div style="font-size:10px;color:var(--dim);margin-top:2px">${escH(sub)}</div>`:''}</div>`;
  }
  let h=`<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${safeColor(proj.color,'var(--accent2)')};border-radius:8px;padding:14px 16px;margin-bottom:10px">`;
  h+=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
    <span style="font-size:15px;font-weight:700;color:var(--text)">${escH(proj.name)}</span>
    <span style="font-family:IBM Plex Mono,monospace;font-size:9px;padding:2px 8px;border-radius:10px;background:${safeColor(lc&&lc.color,'var(--muted)')}22;color:${safeColor(lc&&lc.color,'var(--muted)')};border:1px solid ${safeColor(lc&&lc.color,'var(--muted)')}55">${escH(lc?lc.label:t('—'))}</span>
    <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">${fmtMonth(months[0])} → ${fmtMonth(months[months.length-1])}</span>
    <div style="flex:1"></div>
    <span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--dim)">${t('PROJECT LENS')}</span>
  </div>`;
  h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    ${tile(money(totCost),t('Total cost'),t('over period'),'var(--accent2)')}
    ${tile(totFteMonths.toFixed(1),t('FTE·months'),t('total effort'),'var(--text)')}
    ${tile(peak.toFixed(2),t('Peak FTE'),peakIdx>=0?fmtMonth(months[peakIdx]):'','var(--accent)')}
    ${tile(String(headcount),t('People'),t('staffed'),'var(--text)')}
    ${tile((overNames.length?overNames.length:'0'),t('Over-allocated'),overNames.length?t('conflicts'):t('none'),overNames.length?'var(--danger)':'var(--muted)')}
  </div>`;

  // ── Staffing curve ──
  const curIdx=months.indexOf(cur);
  h+=`<div style="margin-bottom:12px">
    <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${t('Staffing curve (FTE / month)')}</div>
    ${_dbSparkBars(mFte,{w:Math.min(520,months.length*22),h:34,color:pkColor,curColor:'var(--accent)',curIdx:curIdx,overMax:1,minBar:0})}
  </div>`;

  // ── Demand vs supply (only if a charter forecast exists) ──
  if(demPeak!=null||demFteMonths!=null){
    function bar(actual,forecast,label,unit){
      if(forecast==null) return '';
      const pct=forecast>0?Math.min(200,actual/forecast*100):0;
      const over=actual>forecast*1.02, under=actual<forecast*0.9;
      const col=over?'var(--danger)':under?'var(--warn)':'var(--accent)';
      const verdict=over?t('over plan'):under?t('under plan'):t('on plan');
      return `<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-family:IBM Plex Mono,monospace;font-size:10px;margin-bottom:2px">
          <span style="color:var(--muted)">${escH(label)}</span>
          <span style="color:${col}">${actual.toFixed(1)} ${escH(unit)} vs ${forecast.toFixed(1)} plan · ${verdict}</span></div>
        <div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.min(100,pct/2)}%;background:${col}"></div></div>
      </div>`;
    }
    h+=`<div style="margin-bottom:12px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px">
      <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t('Demand vs supply (charter forecast)')}</div>
      ${bar(peak,demPeak,t('Peak FTE'),t('FTE'))}
      ${bar(totFteMonths,demFteMonths,t('Effort'),t('FTE·mo'))}
    </div>`;
  }

  // ── Cost / effort by function ──
  if(grpList.length){
    h+=`<div style="margin-bottom:12px">
      <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${t('By function')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">`;
    grpList.forEach(b=>{ const sc=safeColor(b.color,'var(--muted)');
      h+=`<span style="display:inline-flex;align-items:center;gap:6px;font-family:IBM Plex Mono,monospace;font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:3px 10px">
        <span style="width:8px;height:8px;border-radius:2px;background:${sc}"></span>
        <span style="color:var(--text)">${escH(b.name)}</span>
        <span style="color:var(--muted)">${b.fteMonths.toFixed(1)} FTE·mo · ${money(b.cost)}</span></span>`; });
    h+=`</div></div>`;
  }

  // ── Team table ──
  h+=`<div>
    <div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${t('Team on this project')}</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase">
        <th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">${t('Person')}</th>
        <th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">${t('Function')}</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">${t('Peak %')}</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">${t('FTE·mo')}</th>
        <th style="text-align:right;padding:4px 8px;border-bottom:1px solid var(--border)">${t('Cost')}</th>
        <th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)">${t('Flag')}</th>
      </tr></thead><tbody>`;
  team.sort((x,y)=>y.fteMonths-x.fteMonths).forEach(a=>{
    const g=engGroups.find(gg=>gg.id===a.eng.groupId);
    const isOver=overNames.indexOf(a.eng.name)>=0;
    const flags=[]; if(isOver)flags.push(`<span style="color:var(--danger)">⚠ ${t('over-allocated')}</span>`);
    if(a.mrMonths>0)flags.push(`<span style="color:var(--warn)">${t('{n} mo away',{n:a.mrMonths})}</span>`);
    h+=`<tr>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--text)">${escH(a.eng.name)}${a.eng.role?`<span style="color:var(--dim)"> · ${escH(a.eng.role)}</span>`:''}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--muted)">${g?`<span style="color:${safeColor(g.color,'var(--muted)')}">${escH(g.name)}</span>`:'—'}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border);text-align:right;font-family:IBM Plex Mono,monospace;color:${a.peak>1.005?'var(--danger)':'var(--text)'}">${Math.round(a.peak*100)}%</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border);text-align:right;font-family:IBM Plex Mono,monospace">${a.fteMonths.toFixed(1)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border);text-align:right;font-family:IBM Plex Mono,monospace;color:var(--accent2)">${money(a.cost)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid var(--border)">${flags.join(' · ')||''}</td>
    </tr>`;
  });
  if(!team.length) h+=`<tr><td colspan="6" style="padding:12px;text-align:center;color:var(--muted)">${t('No one staffed yet — add rows below.')}</td></tr>`;
  h+=`</tbody></table></div>`;

  h+=`</div>`;
  return h;
}

// Sum of one engineer's allocation on a specific project in one month (across their rows here).
function _engMonthOnProj(projRows,engId,m){
  return projRows.reduce((s,r)=>s+(r.engId===engId&&r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0),0);
}
