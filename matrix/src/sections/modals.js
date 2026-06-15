/* ►► SECTION: MODALS ◄◄ Add/edit modals, context menu, project tab window (risk/actions/schedule)
 *
 * Functions defined in this file:
 *   openAddModal       — opens the add-project modal centred on the current axes
 *   closeModal         — closes the add-project modal
 *   confirmAdd         — creates a new project from the add-modal inputs
 *   openCtx            — opens the project right-click context menu
 *   closeCtx           — closes the context menu
 *   openRiskTab        — opens the project window on the Risk tab
 *   openActionsTab     — opens the project window on the Actions tab
 *   openScheduleTab    — opens the project window on the Schedule tab
 *   closeProjTab       — closes the project window
 *   showProjTab        — switches the active project-window tab and renders it
 *   saveProjTab        — saves the active project-window tab
 *   renderRiskTab      — renders the FMEA risk table
 *   addRisk            — adds a risk row
 *   deleteRisk         — deletes a risk row
 *   schedEnsure        — normalises a project's actions/milestones data
 *   schedNodes         — builds the unified node map for dependency references
 *   renderSchedTab     — renders the schedule editor (actions, milestones, gantt)
 *   schedDepToggle     — toggles a dependency tag in the schedule editor
 *   schedGetDep        — reads selected dependency keys from a tag container
 *   schedIconPick      — opens the milestone icon picker
 *   schedPickIcon      — applies the chosen milestone icon
 *   schedCycleColor    — cycles an action's bar color
 *   schedSave          — saves schedule edits and refreshes the gantt
 *   schedAddAction     — adds a schedule action
 *   schedAddMilestone  — adds a schedule milestone
 *   schedDelAction     — deletes a schedule action
 *   schedDelMilestone  — deletes a schedule milestone
 *   schedRenderGantt   — renders the Gantt SVG (bars, milestones, deps, critical path)
 *   _ganttSVGString    — serialises the rendered Gantt to a standalone SVG string
 *   _ganttFileName     — builds a download filename from the current project name
 *   exportGanttSVG     — downloads the Gantt as an SVG file
 *   exportGanttPNG     — renders the Gantt to a 2× PNG and downloads it
 *   ganttDown / ganttDragMove / ganttDragUp / _ganttApplyDrag / _addDays — drag-to-reschedule
 *   renderActionsTab   — renders the actions tab table + team summary
 *   renderMemberSummary — builds the per-member action summary HTML
 *   saveActionsTabData — reads the actions table back into the project
 *   toggleActionMilestone — toggles an action's "is milestone" flag
 *   addAction          — adds an action on the actions tab
 *   deleteAction       — deletes an action
 *
 * Note: nextActionId/nextId/nextRiskId/nextMsId and ctxProjId/tabProjId/activeTab
 *       are declared in globals.js. getWeek() (used by schedRenderGantt week mode)
 *       was referenced-but-undefined in the original monolith; defined here (ISO week).
 */

// opens the add-project modal centred on the current axes
function openAddModal(){
  const ax=axX(),ay=axY();
  G('m-x-label').textContent=ax.name.toUpperCase()+' (X)';
  G('m-y-label').textContent=ay.name.toUpperCase()+' (Y)';
  SV('m-x',((ax.min+ax.max)/2).toFixed(1));SV('m-y',((ay.min+ay.max)/2).toFixed(1));
  SV('m-name','');SV('m-note','');
  populateSectionDropdowns();
  G('add-overlay').classList.add('show');setTimeout(()=>G('m-name').focus(),80);
}
// closes the add-project modal
function closeModal(){G('add-overlay').classList.remove('show');}
// creates a new project from the add-modal inputs
function confirmAdd(){
  const name=V('m-name').trim();if(!name){G('m-name').focus();return;}
  const sid=V('m-section');
  const p={id:nextId++,name,x:+V('m-x')||5,y:+V('m-y')||5,vis:5,ena:5,
    note:V('m-note'),color:V('m-color'),gate:'',eta:'',todos:[],risks:[],milestones:[],actions:[],
    vis:+V('m-vis')||5,ena:+V('m-ena')||5,costSource:'manual',planCost:null,
    sectionId:sid?+sid:null,visible:true};
  projects.push(p);closeModal();selectProject(p.id);renderList();render();saveState();
}

// opens the project right-click context menu
function openCtx(e,id){
  e.preventDefault();e.stopPropagation();ctxProjId=id;
  const p=projects.find(p=>p.id===id);
  G('ctx-proj-name').textContent=p?p.name:'PROJECT';
  const m=G('ctx-menu');
  m.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';
  m.style.top=Math.min(e.clientY,window.innerHeight-140)+'px';
  m.classList.add('show');
}
// closes the context menu
function closeCtx(){G('ctx-menu').classList.remove('show');}

// opens the project window on the Risk tab
function openRiskTab(){closeCtx();tabProjId=ctxProjId;showProjTab('risk');G('proj-tab-win').classList.add('show');}
// opens the project window on the Actions tab
function openActionsTab(){closeCtx();tabProjId=ctxProjId;showProjTab('actions');G('proj-tab-win').classList.add('show');}
// opens the project window on the Schedule tab
function openScheduleTab(){closeCtx();tabProjId=ctxProjId;showProjTab('sched');G('proj-tab-win').classList.add('show');}
// closes the project window
function closeProjTab(){G('proj-tab-win').classList.remove('show');tabProjId=null;}
// switches the active project-window tab and renders it
function showProjTab(tab){
  activeTab=tab;
  G('tab-risk-btn').classList.toggle('active',tab==='risk');
  G('tab-sched-btn').classList.toggle('active',tab==='sched');
  G('tab-actions-btn').classList.toggle('active',tab==='actions');
  const p=projects.find(p=>p.id===tabProjId);
  G('ptw-title').textContent=p?p.name:'PROJECT';
  if(tab==='risk')renderRiskTab(p);
  else if(tab==='sched')renderSchedTab(p);
  else renderActionsTab(p);
}
// saves the active project-window tab
function saveProjTab(){
  const p=projects.find(p=>p.id===tabProjId);if(!p)return;
  if(activeTab==='actions'){
    saveActionsTabData(p);
    renderActionsTab(p); // re-render to reflect any milestone changes
  } else if(activeTab==='risk'){
    G('ptw-body').querySelectorAll('tr[data-rid]').forEach(tr=>{
      const r=p.risks.find(r=>r.id===+tr.dataset.rid);if(!r)return;
      r.desc=tr.querySelector('.r-desc').value;r.prob=+tr.querySelector('.r-prob').value||1;
      r.imp=+tr.querySelector('.r-imp').value||1;r.mit=tr.querySelector('.r-mit').value;
      r.owner=tr.querySelector('.r-owner').value;r.status=tr.querySelector('.r-status').value;
      r.sev=+tr.querySelector('.r-sev').value||1;r.occ=+tr.querySelector('.r-occ').value||1;r.det=+tr.querySelector('.r-det').value||1;
    });
  } else {
    schedSave(p.id);return;
  }
  saveState();flashSaved();
  if(activeTab==='sched')renderSchedTab(p);
}

// renders the FMEA risk table
function renderRiskTab(p){
  if(!p){G('ptw-body').innerHTML='<p style="color:var(--muted)">No project.</p>';return;}
  if(!p.risks)p.risks=[];
  let h=`<table class="risk-table"><thead><tr>
    <th>DESCRIPTION</th><th>PROB<br><small>1-5</small></th><th>IMP<br><small>1-5</small></th>
    <th>MITIGATION</th><th>OWNER</th><th>STATUS</th>
    <th>SEV<br><small>1-10</small></th><th>OCC<br><small>1-10</small></th><th>DET<br><small>1-10</small></th>
    <th>RPN</th><th></th></tr></thead><tbody>`;
  for(const r of p.risks){
    const rpn=(r.sev||1)*(r.occ||1)*(r.det||1);
    const rc=rpn<100?'rpn-lo':rpn<300?'rpn-med':'rpn-hi';
    const stO=['open','mitigated','accepted','closed'].map(s=>`<option${r.status===s?' selected':''}>${s}</option>`).join('');
    h+=`<tr data-rid="${r.id}">
      <td><input class="r-desc" value="${escH(r.desc||'')}"></td>
      <td><input class="r-prob" type="number" min="1" max="5" value="${r.prob||1}" style="width:34px"></td>
      <td><input class="r-imp"  type="number" min="1" max="5" value="${r.imp||1}"  style="width:34px"></td>
      <td><input class="r-mit"  value="${escH(r.mit||'')}"></td>
      <td><input class="r-owner" value="${escH(r.owner||'')}"></td>
      <td><select class="r-status">${stO}</select></td>
      <td><input class="r-sev" type="number" min="1" max="10" value="${r.sev||1}" style="width:32px"></td>
      <td><input class="r-occ" type="number" min="1" max="10" value="${r.occ||1}" style="width:32px"></td>
      <td><input class="r-det" type="number" min="1" max="10" value="${r.det||1}" style="width:32px"></td>
      <td class="rpn-cell ${rc}" id="rpn-${r.id}">${rpn}</td>
      <td><button class="ms-del" onclick="deleteRisk(${p.id},${r.id})">×</button></td>
    </tr>`;
  }
  h+=`</tbody></table><div style="margin-top:10px;display:flex;gap:8px;align-items:center">
    <button class="sm primary" onclick="addRisk(${p.id})">+ ADD RISK</button>
    <span style="font-size:10px;color:var(--muted)">RPN = Sev × Occ × Det · click × to delete · SAVE to persist</span></div>`;
  G('ptw-body').innerHTML=h;
  G('ptw-body').querySelectorAll('tr[data-rid]').forEach(tr=>{
    ['r-sev','r-occ','r-det'].forEach(c=>{
      tr.querySelector('.'+c).addEventListener('input',()=>{
        const rpn=(+tr.querySelector('.r-sev').value||1)*(+tr.querySelector('.r-occ').value||1)*(+tr.querySelector('.r-det').value||1);
        const cell=tr.querySelector('.rpn-cell');cell.textContent=rpn;
        cell.className='rpn-cell '+(rpn<100?'rpn-lo':rpn<300?'rpn-med':'rpn-hi');
      });
    });
  });
}
// adds a risk row
function addRisk(pid){const p=projects.find(p=>p.id===pid);if(!p)return;if(!p.risks)p.risks=[];p.risks.push({id:nextRiskId++,desc:'New risk',prob:2,imp:2,mit:'',owner:'',status:'open',sev:5,occ:5,det:5});renderRiskTab(p);}
// deletes a risk row
function deleteRisk(pid,rid){const p=projects.find(p=>p.id===pid);if(!p)return;p.risks=p.risks.filter(r=>r.id!==rid);renderRiskTab(p);saveNow();}

/* SCHEDULE TAB — clean rewrite */
const MS_ICONS=['🎯','🏁','⭐','🔔','🚀','✅','⚡','🏆','💡','🔑','📌','🛡️','🔧','💎','📊','🎪','🌟','🔥','🎖️','⚓'];

// normalises a project's actions/milestones data
function schedEnsure(p){
  if(!p.milestones)p.milestones=[];
  if(!p.actions)p.actions=[];
  p.actions.forEach(a=>{
    if(!a.start)a.start='';
    if(!a.end)a.end=a.due||'';
    if(a.dep==null)a.dep='';
    if(!a.status)a.status='Open';
    if(!a.member)a.member='';
    if(!a.color)a.color='#5be5c8';
  });
  p.milestones.forEach(m=>{
    if(!m.date)m.date=m.end||'';
    if(!m.icon)m.icon='🎯';
    if(m.dep==null)m.dep='';
  });
}

// builds the unified node map for dependency references
function schedNodes(p){
  // All items as unified list for dependency references
  const nodes={};
  p.actions.forEach(a=>nodes['a'+a.id]={key:'a'+a.id,label:a.desc||'Action',type:'action'});
  p.milestones.forEach(m=>nodes['m'+m.id]={key:'m'+m.id,label:(m.icon||'🎯')+' '+(m.name||'Milestone'),type:'ms'});
  return nodes;
}

// renders the schedule editor (actions, milestones, gantt)
function renderSchedTab(p){
  if(!p){G('ptw-body').innerHTML='<p style="color:var(--muted)">No project.</p>';return;}
  schedEnsure(p);
  const nodes=schedNodes(p);

  // Build dep tag picker HTML for a given item
  function depTags(selfKey,storedDep){
    const sel=new Set((storedDep||'').split(',').map(s=>s.trim()).filter(Boolean));
    const opts=Object.values(nodes).filter(n=>n.key!==selfKey);
    if(!opts.length)return '<span style="color:var(--muted);font-size:10px">No other items yet</span>';
    return opts.map(n=>{
      const on=sel.has(n.key);
      const col=n.type==='ms'?'var(--accent)':'var(--accent2)';
      const bg=on?(n.type==='ms'?'rgba(200,241,53,.15)':'rgba(91,229,200,.15)'):'transparent';
      return `<span class="dep-tag" data-key="${n.key}"
        style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:3px;
               font-size:10px;font-family:IBM Plex Mono,monospace;cursor:pointer;border:1px solid;
               border-color:${on?col:'var(--border)'};background:${bg};color:${on?col:'var(--muted)'};
               transition:all .12s;margin:2px"
        onclick="schedDepToggle(this,'${selfKey}')">${escH(n.label.slice(0,24))}</span>`;
    }).join('');
  }

  const statusColors={Open:'var(--muted)','In Progress':'var(--accent2)',Done:'var(--accent)',Blocked:'var(--danger)'};
  const ACTION_COLORS=['#5be5c8','#c8f135','#a78bfa','#f1a435','#38bdf8','#fb7185','#34d399','#f14335'];

  let h=`<div id="sched-wrap" style="display:flex;flex-direction:column;height:100%;gap:0">`;

  // ── Toolbar ──
  h+=`<div style="display:flex;gap:8px;align-items:center;padding:8px 0 10px;flex-shrink:0;flex-wrap:wrap">
    <button class="sm primary" onclick="schedAddAction(${p.id})">+ ACTION</button>
    <button class="sm primary" onclick="schedAddMilestone(${p.id})">◆ MILESTONE</button>
    <div style="flex:1"></div>
    <span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">
      ${(()=>{
        // Quick stats
        const a=p.actions.filter(a=>a.start&&a.end).length;
        const m=p.milestones.filter(m=>m.date||m.end).length;
        return a+'&nbsp;actions&nbsp;·&nbsp;'+m+'&nbsp;milestones';
      })()}
    </span>
    <button class="primary" onclick="schedSave(${p.id})">SAVE + REFRESH GANTT</button>
  </div>`;

  // ── Actions table ──
  h+=`<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.07em;margin-bottom:6px">ACTIONS</div>`;
  h+=`<div style="overflow-x:auto;flex-shrink:0"><table style="border-collapse:collapse;width:100%;font-size:11px">
  <thead><tr style="border-bottom:1px solid var(--border)">
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:24px"></th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);min-width:160px">DESCRIPTION</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:106px">START</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:106px">END</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:90px">STATUS</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:100px">MEMBER</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">DEPENDS ON <span style="font-weight:300">(click to toggle)</span></th>
    <th style="width:22px"></th>
  </tr></thead><tbody>`;

  p.actions.forEach((a,ai)=>{
    const stO=['Open','In Progress','Done','Blocked'].map(v=>
      `<option${a.status===v?' selected':''}>${v}</option>`).join('');
    const col=a.color||ACTION_COLORS[ai%ACTION_COLORS.length];
    h+=`<tr data-acid="${a.id}" style="border-bottom:1px solid rgba(255,255,255,.04)">
      <td style="padding:3px 4px"><div style="width:10px;height:10px;border-radius:50%;background:${col};cursor:pointer"
        onclick="schedCycleColor(${p.id},${a.id})" title="Click to change color"></div></td>
      <td style="padding:3px 4px"><input class="eng-card-inp a-desc-s" value="${escH(a.desc||'')}" style="width:100%;font-weight:600"></td>
      <td style="padding:3px 4px"><input class="eng-card-inp a-start-s" type="date" value="${a.start||''}"></td>
      <td style="padding:3px 4px"><input class="eng-card-inp a-end-s" type="date" value="${a.end||''}"></td>
      <td style="padding:3px 4px"><select class="alloc-sel a-status-s" style="width:100%;color:${statusColors[a.status]||'var(--text)'}">${stO}</select></td>
      <td style="padding:3px 4px"><input class="eng-card-inp a-member-s" value="${escH(a.member||'')}" placeholder="—"></td>
      <td style="padding:3px 4px"><div id="dep-a${a.id}" style="display:flex;flex-wrap:wrap;gap:2px;padding:2px">${depTags('a'+a.id,a.dep)}</div></td>
      <td style="padding:3px 4px"><button class="row-del-btn" onclick="schedDelAction(${p.id},${a.id})">×</button></td>
    </tr>`;
  });
  if(!p.actions.length)h+=`<tr><td colspan="8" style="padding:12px;text-align:center;color:var(--muted);font-size:11px">No actions yet — click + ACTION</td></tr>`;
  h+=`</tbody></table></div>`;

  // ── Milestones table ──
  h+=`<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.07em;margin:12px 0 6px">MILESTONES</div>`;
  h+=`<div style="overflow-x:auto;flex-shrink:0"><table style="border-collapse:collapse;width:100%;font-size:11px">
  <thead><tr style="border-bottom:1px solid var(--border)">
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:34px">ICON</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);min-width:160px">NAME</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);width:120px">DATE</th>
    <th style="text-align:left;padding:4px 6px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">DEPENDS ON <span style="font-weight:300">(click to toggle)</span></th>
    <th style="width:22px"></th>
  </tr></thead><tbody>`;

  p.milestones.forEach(m=>{
    h+=`<tr data-msid="${m.id}" style="border-bottom:1px solid rgba(255,255,255,.04)">
      <td style="padding:3px 6px;font-size:18px;cursor:pointer" title="Click to change icon"
          onclick="schedIconPick(${p.id},${m.id},this)">${m.icon||'🎯'}</td>
      <td style="padding:3px 4px"><input class="eng-card-inp ms-name-s" value="${escH(m.name||'')}" style="font-weight:600"></td>
      <td style="padding:3px 4px"><input class="eng-card-inp ms-date-s" type="date" value="${m.date||''}"></td>
      <td style="padding:3px 4px"><div id="dep-m${m.id}" style="display:flex;flex-wrap:wrap;gap:2px;padding:2px">${depTags('m'+m.id,m.dep)}</div></td>
      <td style="padding:3px 4px"><button class="row-del-btn" onclick="schedDelMilestone(${p.id},${m.id})">×</button></td>
    </tr>`;
  });
  if(!p.milestones.length)h+=`<tr><td colspan="5" style="padding:12px;text-align:center;color:var(--muted);font-size:11px">No milestones yet — click ◆ MILESTONE</td></tr>`;
  h+=`</tbody></table></div>`;

  // ── Gantt canvas area ──
  h+=`<div style="display:flex;align-items:center;gap:8px;margin:12px 0 4px">
    <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.07em">GANTT <span style="font-weight:300">(drag bars to move · drag edges to resize · drag ◆ to reschedule)</span></span>
    <div style="flex:1"></div>
    <button class="sm" onclick="exportGanttPNG()" title="Download Gantt as PNG" style="border-color:#5be5c8;color:#5be5c8;font-size:9px;padding:2px 8px">↓ PNG</button>
    <button class="sm" onclick="exportGanttSVG()" title="Download Gantt as SVG" style="border-color:#5be5c8;color:#5be5c8;font-size:9px;padding:2px 8px">↓ SVG</button>
  </div>`;
  h+=`<div id="gantt-area" style="flex:1;min-height:280px;position:relative;overflow:auto;background:#0a0a0c;border:1px solid var(--border);border-radius:6px;display:block"></div>`;

  h+=`</div>`;
  G('ptw-body').innerHTML=h;

  // Render the Gantt after layout is complete
  // setTimeout ensures the flex container has measured its height
  setTimeout(()=>schedRenderGantt(p),30);

  // #6: re-render the Gantt when its container resizes (window/panel resize).
  // gantt-area is recreated on each renderSchedTab, so disconnect the old observer first.
  if(_ganttRO)_ganttRO.disconnect();
  const _gaEl=G('gantt-area');
  if(_gaEl&&typeof ResizeObserver!=='undefined'){
    let _gt=null;
    _ganttRO=new ResizeObserver(()=>{
      clearTimeout(_gt);
      _gt=setTimeout(()=>{
        if(activeTab!=='sched')return;
        const pp=projects.find(x=>x.id===tabProjId);
        if(pp)schedRenderGantt(pp);
      },150);
    });
    _ganttRO.observe(_gaEl);
  }
}
let _ganttRO=null;

// toggles a dependency tag in the schedule editor
function schedDepToggle(el,selfKey){
  const on=el.style.borderColor==='var(--accent)'||el.style.borderColor==='var(--accent2)';
  const isMs=el.dataset.key.startsWith('m');
  const col=isMs?'var(--accent)':'var(--accent2)';
  const bg=isMs?'rgba(200,241,53,.15)':'rgba(91,229,200,.15)';
  if(on){
    el.style.borderColor='var(--border)';el.style.background='transparent';el.style.color='var(--muted)';
  } else {
    el.style.borderColor=col;el.style.background=bg;el.style.color=col;
  }
}

// reads selected dependency keys from a tag container
function schedGetDep(containerId){
  const c=G(containerId);if(!c)return'';
  return [...c.querySelectorAll('.dep-tag')]
    .filter(t=>t.style.borderColor!=='var(--border)')
    .map(t=>t.dataset.key).join(',');
}

// icon picker
let _schedIconCtx=null;
// opens the milestone icon picker
function schedIconPick(pid,msid,td){
  _schedIconCtx={pid,msid,td};
  // Build inline picker
  const existing=G('sched-icon-picker');if(existing)existing.remove();
  const div=document.createElement('div');
  div.id='sched-icon-picker';
  div.style.cssText='position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;z-index:800;box-shadow:0 8px 24px rgba(0,0,0,.7);top:50%;left:50%;transform:translate(-50%,-50%)';
  div.innerHTML='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--muted);margin-bottom:8px">PICK ICON</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:240px">'
    +MS_ICONS.map(ic=>`<div onclick="schedPickIcon('${ic}')" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border-radius:4px;cursor:pointer;border:1px solid var(--border)" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">${ic}</div>`).join('')
    +'</div>'
    +'<button class="sm" onclick="G(\'sched-icon-picker\').remove()" style="margin-top:8px;width:100%">CLOSE</button>';
  document.body.appendChild(div);
}
// applies the chosen milestone icon
function schedPickIcon(icon){
  if(!_schedIconCtx)return;
  const {pid,msid,td}=_schedIconCtx;
  td.textContent=icon;
  const p=projects.find(p=>p.id===pid);
  if(p){const m=p.milestones.find(m=>m.id===msid);if(m)m.icon=icon;}
  G('sched-icon-picker').remove();
  _schedIconCtx=null;
}

// color cycle for actions
const _AC=['#5be5c8','#c8f135','#a78bfa','#f1a435','#38bdf8','#fb7185','#34d399','#f14335'];
// cycles an action's bar color
function schedCycleColor(pid,aid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  const a=p.actions.find(a=>a.id===aid);if(!a)return;
  const i=(_AC.indexOf(a.color)+1)%_AC.length;
  a.color=_AC[i];
  renderSchedTab(p);
}

// saves schedule edits and refreshes the gantt
function schedSave(pid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  // Actions
  G('ptw-body').querySelectorAll('tr[data-acid]').forEach(tr=>{
    const a=p.actions.find(a=>a.id===+tr.dataset.acid);if(!a)return;
    const d=tr.querySelector('.a-desc-s');  if(d)a.desc=d.value;
    const s=tr.querySelector('.a-start-s'); if(s)a.start=s.value;
    const e=tr.querySelector('.a-end-s');   if(e)a.end=e.value;
    const st=tr.querySelector('.a-status-s');if(st)a.status=st.value;
    const me=tr.querySelector('.a-member-s');if(me)a.member=me.value;
    a.dep=schedGetDep('dep-a'+a.id);
  });
  // Milestones
  G('ptw-body').querySelectorAll('tr[data-msid]').forEach(tr=>{
    const ms=p.milestones.find(m=>m.id===+tr.dataset.msid);if(!ms)return;
    const n=tr.querySelector('.ms-name-s');if(n)ms.name=n.value;
    const d=tr.querySelector('.ms-date-s');if(d){ms.date=d.value;ms.end=d.value;}
    const iconTd=tr.querySelector('td[onclick]');if(iconTd)ms.icon=iconTd.textContent.trim();
    ms.dep=schedGetDep('dep-m'+ms.id);
  });
  saveState();flashSaved();
  renderSchedTab(p);
}

// adds a schedule action
function schedAddAction(pid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  if(!p.actions)p.actions=[];
  const cols=['#5be5c8','#c8f135','#a78bfa','#f1a435','#38bdf8','#fb7185'];
  p.actions.push({id:nextActionId++,desc:'New action',start:'',end:'',dep:'',status:'Open',member:'',color:cols[p.actions.length%cols.length],isMilestone:false,due:'',priority:'Medium'});
  renderSchedTab(p);
}
// adds a schedule milestone
function schedAddMilestone(pid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  if(!p.milestones)p.milestones=[];
  p.milestones.push({id:nextMsId++,name:'New milestone',date:'',end:'',dep:'',icon:'🎯',done:false});
  renderSchedTab(p);
}
// deletes a schedule action
function schedDelAction(pid,aid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  p.actions=p.actions.filter(a=>a.id!==aid);
  saveState();renderSchedTab(p);
}
// deletes a schedule milestone
function schedDelMilestone(pid,msid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  p.milestones=p.milestones.filter(m=>m.id!==msid);
  saveState();renderSchedTab(p);
}

// returns the ISO-8601 week number for a date (UTC-based, matching the Gantt's UTC timeline)
function getWeek(d){
  const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7)); // shift to the week's Thursday
  const ys=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return Math.ceil(((x-ys)/86400000+1)/7);
}

/* ── #7: drag-to-reschedule on the Gantt ──────────────────────────────────
   _ganttCtx holds the pixel↔date mapping of the last render so the drag
   handlers can convert mouse movement into day deltas. */
let _ganttCtx=null;   // {pid, pxPerDay}
let _ganttDrag=null;  // active drag: {key,mode,isAct,origStart,origEnd,startX,pxPerDay,moved,raf}

// adds n days to a YYYY-MM-DD string (UTC), returning YYYY-MM-DD
function _addDays(ds,n){const d=new Date(ds);if(isNaN(d.getTime()))return ds;d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}

// mousedown on a Gantt bar/edge/milestone: begins a reschedule drag
function ganttDown(e,key,mode){
  if(e.button!==0||!_ganttCtx)return;
  e.preventDefault();e.stopPropagation();
  const p=projects.find(x=>x.id===_ganttCtx.pid);if(!p)return;
  const isAct=key[0]==='a',id=+key.slice(1);
  const item=isAct?(p.actions||[]).find(a=>a.id===id):(p.milestones||[]).find(m=>m.id===id);
  if(!item)return;
  _ganttDrag={key,mode,isAct,id,
    origStart:isAct?item.start:(item.date||item.end),
    origEnd:isAct?item.end:(item.date||item.end),
    startX:e.clientX,pxPerDay:_ganttCtx.pxPerDay,moved:false,raf:null};
  window.addEventListener('mousemove',ganttDragMove);
  window.addEventListener('mouseup',ganttDragUp);
}
// applies the current drag delta to the item's dates and re-renders (rAF-throttled)
function _ganttApplyDrag(){
  if(!_ganttDrag||!_ganttCtx)return;
  const p=projects.find(x=>x.id===_ganttCtx.pid);if(!p)return;
  const dd=Math.round((_ganttDrag._x-_ganttDrag.startX)/_ganttDrag.pxPerDay);
  if(_ganttDrag.isAct){
    const a=(p.actions||[]).find(x=>x.id===_ganttDrag.id);if(!a)return;
    if(_ganttDrag.mode==='move'){a.start=_addDays(_ganttDrag.origStart,dd);a.end=_addDays(_ganttDrag.origEnd,dd);}
    else if(_ganttDrag.mode==='start'){const ns=_addDays(_ganttDrag.origStart,dd);if(ns<=a.end)a.start=ns;}
    else if(_ganttDrag.mode==='end'){const ne=_addDays(_ganttDrag.origEnd,dd);if(ne>=a.start)a.end=ne;}
  } else {
    const m=(p.milestones||[]).find(x=>x.id===_ganttDrag.id);if(!m)return;
    const nd=_addDays(_ganttDrag.origStart,dd);m.date=nd;m.end=nd;
  }
  schedRenderGantt(p);
}
// mousemove during a Gantt drag
function ganttDragMove(e){
  if(!_ganttDrag)return;
  _ganttDrag._x=e.clientX;_ganttDrag.moved=true;
  if(_ganttDrag.raf)return;
  _ganttDrag.raf=requestAnimationFrame(()=>{_ganttDrag&&(_ganttDrag.raf=null);_ganttApplyDrag();});
}
// mouseup: commit the reschedule (save + sync the editor table)
function ganttDragUp(){
  window.removeEventListener('mousemove',ganttDragMove);
  window.removeEventListener('mouseup',ganttDragUp);
  const moved=_ganttDrag&&_ganttDrag.moved,ctx=_ganttCtx;
  _ganttDrag=null;
  if(moved&&ctx){
    saveState();
    const p=projects.find(x=>x.id===ctx.pid);
    if(p&&activeTab==='sched')renderSchedTab(p); // re-sync the date inputs above the chart
  }
}

// builds a standalone SVG string from the currently-rendered Gantt (interaction attrs stripped)
function _ganttSVGString(){
  const area=G('gantt-area');if(!area)return null;
  const svg=area.querySelector('svg');if(!svg)return null;
  const clone=svg.cloneNode(true);
  clone.querySelectorAll('[onmousedown]').forEach(el=>{el.removeAttribute('onmousedown');el.removeAttribute('style');});
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+clone.outerHTML;
}
// builds a download filename for the current project's Gantt
function _ganttFileName(ext){
  const p=projects.find(x=>x.id===tabProjId);
  return ((p&&p.name)||'gantt').replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_gantt.'+ext;
}
// downloads the current Gantt as a standalone SVG file
function exportGanttSVG(){
  const str=_ganttSVGString();
  if(!str){alert('Add dated actions/milestones and render the Gantt first.');return;}
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([str],{type:'image/svg+xml;charset=utf-8'}));
  a.download=_ganttFileName('svg');a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
// renders the current Gantt to a 2× PNG and downloads it
function exportGanttPNG(){
  const area=G('gantt-area'),svg=area&&area.querySelector('svg');
  if(!svg){alert('Add dated actions/milestones and render the Gantt first.');return;}
  const w=+svg.getAttribute('width')||Math.round(svg.getBoundingClientRect().width)||820;
  const h=+svg.getAttribute('height')||Math.round(svg.getBoundingClientRect().height)||400;
  const str=_ganttSVGString();
  const img=new Image();
  img.onload=function(){
    const scale=2,canvas=document.createElement('canvas');
    canvas.width=w*scale;canvas.height=h*scale;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#0a0a0c';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.scale(scale,scale);ctx.drawImage(img,0,0);
    canvas.toBlob(function(blob){
      if(!blob){alert('PNG generation failed — try SVG export.');return;}
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);a.download=_ganttFileName('png');a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    },'image/png');
  };
  img.onerror=function(){alert('PNG export failed — try SVG export.');};
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(str);
}

// renders the Gantt SVG (bars, milestones, deps, critical path)
function schedRenderGantt(p){
  const area=G('gantt-area');if(!area)return;
  schedEnsure(p);

  // Actions render as bars when they have start&end. Older items carrying only a
  // single `due` date (e.g. created in the Actions tab) render as zero-duration
  // point markers at the due date — rendered from a shallow copy so saved data is
  // untouched (start/end are only synthesised for layout).
  const _hasSpan=a=>a.start&&a.end&&a.start<=a.end;
  const acts=p.actions
    .filter(a=>_hasSpan(a)||a.due)
    .map(a=>_hasSpan(a)?a:Object.assign({},a,{start:a.due,end:a.due,_pt:true}));
  const msts=p.milestones.filter(m=>m.date||m.end);
  // #4: count items still omitted from the chart (no usable date at all)
  const hiddenA=p.actions.length-acts.length;
  const hiddenM=p.milestones.length-msts.length;
  if(!acts.length&&!msts.length){
    area.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:10px;color:var(--muted);font-family:monospace;font-size:11px">'
      +'<div style="font-size:32px">📊</div>'
      +'<div>Add dates to actions or milestones, then click SAVE + REFRESH GANTT</div></div>';
    return;
  }

  // ── Date range — guard against invalid dates ─────────────────────────────
  function safeDate(s){const d=new Date(s);return isNaN(d.getTime())?null:d;}
  const dates=[];
  acts.forEach(a=>{
    const d1=safeDate(a.start),d2=safeDate(a.end);
    if(d1)dates.push(d1);if(d2)dates.push(d2);
  });
  msts.forEach(m=>{const d=safeDate(m.date||m.end);if(d)dates.push(d);});
  if(!dates.length){
    area.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-family:monospace;font-size:11px">No valid dates found — check date fields</div>';
    return;
  }
  const dMin=new Date(Math.min(...dates.map(d=>d.getTime())));
  const dMax=new Date(Math.max(...dates.map(d=>d.getTime())));
  const span=Math.max(dMax-dMin,86400000*7);
  const tMin=new Date(dMin.getTime()-span*0.05);
  const tMax=new Date(dMax.getTime()+span*0.12);
  const totalMs=tMax.getTime()-tMin.getTime();
  if(!totalMs){
    area.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-family:monospace;font-size:11px">All items have the same date — add a date range</div>';
    return;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  const LW=200;
  const ROW_H=36;
  const HDR_H=30;
  const MIN_CW=740;
  const chartW=Math.max(MIN_CW, area.getBoundingClientRect().width||820);
  // Rows = actions + milestones (milestones get their own rows at the bottom)
  const nRows=acts.length+msts.length;
  const svgH=HDR_H+nRows*ROW_H+16;

  function xOf(ds){
    const d=typeof ds==='string'?new Date(ds):ds;
    if(!d||isNaN(d.getTime()))return LW; // fallback to left edge
    return LW+(d.getTime()-tMin.getTime())/totalMs*(chartW-LW);
  }

  // ── Critical path — real CPM (#3) ───────────────────────────────────────────
  // Forward/backward pass over task durations + dependencies → total float.
  // Zero-float items are critical. Durations come from the actual start/end dates
  // (milestones are zero-duration). deps are predecessors (edge pred→node).
  // Cycle-guarded: the dependency editor permits A→B + B→A, so back-edges are
  // skipped during traversal (and separately surfaced as failed deps below).
  const nodeMap={};
  acts.forEach(a=>{
    const s=new Date(a.start),e=new Date(a.end);
    nodeMap['a'+a.id]={start:s,end:e,dur:Math.max(0,(e-s)/86400000),deps:(a.dep||'').split(',').map(x=>x.trim()).filter(Boolean)};
  });
  msts.forEach(m=>{
    const e=new Date(m.date||m.end);
    nodeMap['m'+m.id]={start:e,end:e,dur:0,deps:(m.dep||'').split(',').map(x=>x.trim()).filter(Boolean)};
  });
  // Drop deps to missing nodes; build successor lists.
  const succs={};
  Object.keys(nodeMap).forEach(k=>{succs[k]=[];});
  Object.keys(nodeMap).forEach(k=>{
    nodeMap[k].deps=nodeMap[k].deps.filter(d=>nodeMap[d]);
    nodeMap[k].deps.forEach(d=>succs[d].push(k));
  });
  // Forward pass: earliest finish (longest path to this node).
  const efMemo={};
  function EF(k,stack){
    if(efMemo[k]!=null)return efMemo[k];
    let es=0;
    nodeMap[k].deps.forEach(p=>{
      if(stack.has(p))return;                 // skip back-edge (cycle)
      stack.add(p);es=Math.max(es,EF(p,stack));stack.delete(p);
    });
    return efMemo[k]=es+nodeMap[k].dur;
  }
  Object.keys(nodeMap).forEach(k=>EF(k,new Set([k])));
  const projDur=Math.max(0,...Object.values(efMemo));
  // Backward pass: latest finish (so no successor's latest start is delayed).
  const lfMemo={};
  function LF(k,stack){
    if(lfMemo[k]!=null)return lfMemo[k];
    let lf=succs[k].length?Infinity:projDur;
    succs[k].forEach(sK=>{
      if(stack.has(sK))return;                // skip back-edge (cycle)
      stack.add(sK);lf=Math.min(lf,LF(sK,stack)-nodeMap[sK].dur);stack.delete(sK);
    });
    if(!isFinite(lf))lf=projDur;
    return lfMemo[k]=lf;
  }
  Object.keys(nodeMap).forEach(k=>LF(k,new Set([k])));
  // Total float = LF − EF; critical when under half a day of slack.
  const slackOf=k=>Math.max(0,Math.round((lfMemo[k]||0)-(efMemo[k]||0)));
  const cpKeys=new Set();
  Object.keys(nodeMap).forEach(k=>{ if(((lfMemo[k]||0)-(efMemo[k]||0))<0.5)cpKeys.add(k); });

  // ── Failed dependencies ───────────────────────────────────────────────────
  // A dep A→B fails when A.end > B.start (predecessor finishes after successor starts)
  const failedDeps=new Set(); // 'fromKey→toKey'
  function checkFailed(toKey,deps,toStart){
    if(!toStart)return;
    const tStart=new Date(toStart);
    deps.forEach(fromKey=>{
      const from=nodeMap[fromKey];
      if(from&&from.end>tStart) failedDeps.add(fromKey+'→'+toKey);
    });
  }
  acts.forEach(a=>checkFailed('a'+a.id,(a.dep||'').split(',').map(s=>s.trim()).filter(Boolean),a.start));
  msts.forEach(m=>checkFailed('m'+m.id,(m.dep||'').split(',').map(s=>s.trim()).filter(Boolean),m.date||m.end));

  // ── Positions ─────────────────────────────────────────────────────────────
  const pos={};
  acts.forEach((a,i)=>{
    const y=HDR_H+i*ROW_H;
    pos['a'+a.id]={x1:xOf(a.start),x2:xOf(a.end),y:y+ROW_H/2,row:i,type:'action'};
  });
  msts.forEach((m,i)=>{
    const x=xOf(m.date||m.end);
    const row=acts.length+i;
    const y=HDR_H+row*ROW_H;
    pos['m'+m.id]={x1:x,x2:x,y:y+ROW_H/2,row,type:'ms'};
  });

  // ── Granularity ───────────────────────────────────────────────────────────
  const days=totalMs/86400000;
  const gran=days<90?'week':days<730?'month':'quarter';
  // #2: generate ticks in UTC so grid lines align with the UTC-parsed bar dates
  const ticks=[];
  if(gran==='week'){
    let d=new Date(Date.UTC(tMin.getUTCFullYear(),tMin.getUTCMonth(),tMin.getUTCDate()-tMin.getUTCDay()));
    while(d<=tMax){ticks.push(new Date(d));d=new Date(d);d.setUTCDate(d.getUTCDate()+7);}
  } else if(gran==='month'){
    let d=new Date(Date.UTC(tMin.getUTCFullYear(),tMin.getUTCMonth(),1));
    while(d<=tMax){ticks.push(new Date(d));d=new Date(d);d.setUTCMonth(d.getUTCMonth()+1);}
  } else {
    let d=new Date(Date.UTC(tMin.getUTCFullYear(),Math.floor(tMin.getUTCMonth()/3)*3,1));
    while(d<=tMax){ticks.push(new Date(d));d=new Date(d);d.setUTCMonth(d.getUTCMonth()+3);}
  }

  // ── Colours ───────────────────────────────────────────────────────────────
  const BG='#0a0a0c', BG2='#111115', HDR_BG='#18181c';
  const MUTED='#6b6b78', BORDER='#2a2a32', TEXT='#e8e8ea';
  const CP_COL='#f14335';   // critical path
  const FAIL_COL='#ff6b35'; // failed dependency

  // ── SVG ───────────────────────────────────────────────────────────────────
  let s=`<svg width="${chartW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg"
    style="display:block;font-family:IBM Plex Mono,monospace">
  <defs>
    <marker id="ga" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L7,4 L0,7 Z" fill="#f1a435"/>
    </marker>
    <marker id="ga-cp" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L7,4 L0,7 Z" fill="${CP_COL}"/>
    </marker>
    <marker id="ga-fail" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L7,4 L0,7 Z" fill="${FAIL_COL}"/>
    </marker>
    <clipPath id="gc"><rect x="${LW}" y="0" width="${chartW-LW}" height="${svgH}"/></clipPath>
  </defs>
  <rect width="${chartW}" height="${svgH}" fill="${BG}"/>
  <rect width="${chartW}" height="${HDR_H}" fill="${HDR_BG}"/>
  <rect width="${LW}" height="${svgH}" fill="${HDR_BG}"/>`;

  // Grid + tick labels
  ticks.forEach(t=>{
    const x=xOf(t); // #2: position straight from the UTC Date (no toISOString round-trip)
    if(x<LW||x>chartW)return;
    s+=`<line x1="${x}" y1="${HDR_H}" x2="${x}" y2="${svgH}" stroke="${BORDER}" stroke-width=".7"/>`;
    let lbl=gran==='week'?`W${getWeek(t)}`:gran==='month'?t.toLocaleDateString('en',{month:'short',year:'2-digit',timeZone:'UTC'}):`Q${Math.floor(t.getUTCMonth()/3)+1} ${t.getUTCFullYear()}`;
    s+=`<text x="${x+3}" y="${HDR_H-7}" font-size="9" fill="${MUTED}">${lbl}</text>`;
  });

  // Today line
  const todayStr=new Date().toISOString().slice(0,10);
  const todX=xOf(todayStr);
  if(todX>=LW&&todX<=chartW){
    s+=`<line x1="${todX}" y1="0" x2="${todX}" y2="${svgH}" stroke="#c8f135" stroke-width="1.5" stroke-dasharray="4,3" opacity=".9"/>`;
    s+=`<text x="${todX+3}" y="12" font-size="8" fill="#c8f135" font-weight="600">TODAY</text>`;
  }

  // ── ACTION ROWS ───────────────────────────────────────────────────────────
  acts.forEach((a,i)=>{
    const y=HDR_H+i*ROW_H;
    const p2=pos['a'+a.id];
    const x1=Math.max(p2.x1,LW), x2=Math.max(p2.x2,x1+8);
    const isCP=cpKeys.has('a'+a.id);
    const col=isCP?CP_COL:(a.color||'#5be5c8');
    const done=a.status==='Done', blocked=a.status==='Blocked';
    const barCol=blocked?'#f14335':col;

    // Row backgrounds
    if(i%2)s+=`<rect x="${LW}" y="${y}" width="${chartW-LW}" height="${ROW_H}" fill="rgba(255,255,255,.012)"/>`;
    s+=`<rect x="0" y="${y}" width="${LW}" height="${ROW_H}" fill="${i%2?BG2:BG}"/>`;

    // Critical path left accent
    if(isCP)s+=`<rect x="0" y="${y}" width="3" height="${ROW_H}" fill="${CP_COL}"/>`;

    // #5: full-detail hover tooltip (label is truncated to 22 chars)
    const barTip=(a.desc||'Action')+'\n'+(a._pt?('Due: '+a.start+'  (no duration set)'):(a.start+' → '+a.end))
      +(a.member?'\n👤 '+a.member:'')+'\nStatus: '+(a.status||'Open')
      +(isCP?'\n★ critical (0 slack)':'\nSlack: '+slackOf('a'+a.id)+'d');

    // Label: dot + name + member
    s+=`<circle cx="14" cy="${y+ROW_H/2}" r="5" fill="${col}"/>`;
    s+=`<text x="24" y="${y+ROW_H/2+1}" font-size="10" fill="${isCP?CP_COL:TEXT}" dominant-baseline="middle" font-weight="${isCP?700:500}">${escH((a.desc||'').slice(0,22))}<title>${escH(barTip)}</title></text>`;
    if(a.member)s+=`<text x="${LW-5}" y="${y+ROW_H/2+1}" font-size="8" fill="${MUTED}" dominant-baseline="middle" text-anchor="end">${escH(a.member.slice(0,10))}</text>`;

    // Bar body — fill rect is the move handle (#7); stroke/overlay/text are non-interactive
    const bw=x2-x1;
    s+=`<rect x="${x1}" y="${y+7}" width="${bw}" height="${ROW_H-14}" fill="${barCol}22" rx="3" clip-path="url(#gc)" onmousedown="ganttDown(event,'a${a.id}','move')" style="cursor:grab"><title>${escH(barTip)}</title></rect>`;
    s+=`<rect x="${x1}" y="${y+7}" width="${bw}" height="${ROW_H-14}" fill="none" stroke="${barCol}" stroke-width="${isCP?2.2:1.5}" rx="3" clip-path="url(#gc)" pointer-events="none"/>`;
    if(done)s+=`<rect x="${x1}" y="${y+7}" width="${bw}" height="${ROW_H-14}" fill="${barCol}44" rx="3" clip-path="url(#gc)" pointer-events="none"/>`;

    // Text inside bar
    if(bw>40){
      const label=done?'✓':blocked?'⚠':isCP?'★':'';
      s+=`<text x="${(x1+x2)/2}" y="${y+ROW_H/2+1}" font-size="${bw>80?9:8}" fill="${barCol}" text-anchor="middle" dominant-baseline="middle" clip-path="url(#gc)" pointer-events="none">${label}</text>`;
    }
    // Date labels
    if(bw>90){
      s+=`<text x="${x1+4}" y="${y+9}" font-size="8" fill="${barCol}cc" dominant-baseline="hanging" clip-path="url(#gc)" pointer-events="none">${a.start.slice(5)}</text>`;
      s+=`<text x="${x2-4}" y="${y+9}" font-size="8" fill="${barCol}cc" text-anchor="end" dominant-baseline="hanging" clip-path="url(#gc)" pointer-events="none">${a.end.slice(5)}</text>`;
    }
    // Edge resize handles (#7) — only when the bar is wide enough to grab separately
    if(bw>=20){
      s+=`<rect x="${x1}" y="${y+7}" width="6" height="${ROW_H-14}" fill="transparent" clip-path="url(#gc)" onmousedown="ganttDown(event,'a${a.id}','start')" style="cursor:ew-resize"/>`;
      s+=`<rect x="${x2-6}" y="${y+7}" width="6" height="${ROW_H-14}" fill="transparent" clip-path="url(#gc)" onmousedown="ganttDown(event,'a${a.id}','end')" style="cursor:ew-resize"/>`;
    }
  });

  // ── MILESTONE ROWS (below actions) ────────────────────────────────────────
  msts.forEach((m,i)=>{
    const row=acts.length+i;
    const y=HDR_H+row*ROW_H;
    const p2=pos['m'+m.id];
    const mx=p2.x1; // milestone x position
    const mcy=y+ROW_H/2;
    const isCP=cpKeys.has('m'+m.id);
    const msCol=isCP?CP_COL:'#c8f135';
    const DR=14; // diamond half-size

    // Row background
    if(row%2)s+=`<rect x="${LW}" y="${y}" width="${chartW-LW}" height="${ROW_H}" fill="rgba(255,255,255,.012)"/>`;
    s+=`<rect x="0" y="${y}" width="${LW}" height="${ROW_H}" fill="${row%2?BG2:BG}"/>`;

    // Critical path left accent
    if(isCP)s+=`<rect x="0" y="${y}" width="3" height="${ROW_H}" fill="${CP_COL}"/>`;

    // #5: full-detail hover tooltip (label is truncated)
    const msTip=(m.name||'Milestone')+'\n📅 '+(m.date||m.end||'(no date)')
      +(isCP?'\n★ critical (0 slack)':'\nSlack: '+slackOf('m'+m.id)+'d');

    // Label panel: icon + name + date
    s+=`<text x="14" y="${mcy+5}" font-size="15" text-anchor="middle">${m.icon||'🎯'}</text>`;
    s+=`<text x="28" y="${mcy+1}" font-size="10" fill="${isCP?CP_COL:msCol}" dominant-baseline="middle" font-weight="${isCP?700:600}">${escH((m.name||'').slice(0,18))}<title>${escH(msTip)}</title></text>`;
    const mdate=(m.date||m.end||'').slice(5);
    s+=`<text x="${LW-5}" y="${mcy+1}" font-size="8" fill="${MUTED}" dominant-baseline="middle" text-anchor="end">${mdate}</text>`;

    // Diamond on timeline
    if(mx>=LW&&mx<=chartW){
      // Full-height tick line
      s+=`<line x1="${mx}" y1="${y}" x2="${mx}" y2="${y+ROW_H}" stroke="${msCol}" stroke-width="1" stroke-dasharray="3,3" opacity=".5" clip-path="url(#gc)"/>`;
      // Diamond shape — draggable to change the milestone date (#7)
      s+=`<polygon points="${mx},${mcy-DR} ${mx+DR},${mcy} ${mx},${mcy+DR} ${mx-DR},${mcy}"
            fill="${msCol}22" stroke="${msCol}" stroke-width="${isCP?2.5:1.8}" clip-path="url(#gc)" onmousedown="ganttDown(event,'m${m.id}','move')" style="cursor:grab"><title>${escH(msTip)}</title></polygon>`;
      // Icon inside diamond
      s+=`<text x="${mx}" y="${mcy+5}" text-anchor="middle" font-size="13" clip-path="url(#gc)" pointer-events="none">${m.icon||'🎯'}</text>`;
      // Name label above diamond
      s+=`<text x="${mx}" y="${y+4}" text-anchor="middle" font-size="9" fill="${msCol}" font-weight="600" clip-path="url(#gc)" pointer-events="none">${escH((m.name||'').slice(0,16))}</text>`;
    }
  });

  // ── DEPENDENCY ARROWS ─────────────────────────────────────────────────────
  function drawArrow(fromKey,toKey){
    const f=pos[fromKey],t2=pos[toKey];
    if(!f||!t2)return;
    const isFail=failedDeps.has(fromKey+'→'+toKey);
    const isOnCP=cpKeys.has(fromKey)&&cpKeys.has(toKey);
    const col=isFail?FAIL_COL:isOnCP?CP_COL:'#f1a435';
    const mkr=isFail?'ga-fail':isOnCP?'ga-cp':'ga';
    const sw=isFail?2:isOnCP?2:1.3;
    const dash=isFail?'6,3':isOnCP?'none':'5,3';

    const fx=f.x2, fy=f.y;
    const tx=t2.x1-2, ty=t2.y;
    if(fx>=chartW||tx<=LW)return;
    const ex=Math.max(fx+12,Math.min(tx-6,(fx+tx)/2));

    s+=`<path d="M${fx.toFixed(1)},${fy.toFixed(1)} L${ex.toFixed(1)},${fy.toFixed(1)} L${ex.toFixed(1)},${ty.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}"
          fill="none" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${dash}"
          marker-end="url(#${mkr})" clip-path="url(#gc)"/>`;

    // Failed: red ⚠ badge at midpoint
    if(isFail){
      const bx=ex,by=(fy+ty)/2;
      s+=`<circle cx="${bx}" cy="${by}" r="8" fill="#0a0a0c" stroke="${FAIL_COL}" stroke-width="1.5" clip-path="url(#gc)"/>`;
      s+=`<text x="${bx}" y="${by+4}" font-size="9" text-anchor="middle" fill="${FAIL_COL}" clip-path="url(#gc)">⚠</text>`;
    }
  }

  acts.forEach(a=>{
    (a.dep||'').split(',').map(s=>s.trim()).filter(Boolean).forEach(dk=>drawArrow(dk,'a'+a.id));
  });
  msts.forEach(m=>{
    (m.dep||'').split(',').map(s=>s.trim()).filter(Boolean).forEach(dk=>drawArrow(dk,'m'+m.id));
  });

  // ── SECTION SEPARATOR between actions and milestones ──────────────────────
  if(acts.length&&msts.length){
    const sy=HDR_H+acts.length*ROW_H;
    s+=`<line x1="0" y1="${sy}" x2="${chartW}" y2="${sy}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="4,4"/>`;
    s+=`<text x="6" y="${sy+11}" font-size="8" fill="${MUTED}">◆ MILESTONES</text>`;
  }

  // ── LEGEND ────────────────────────────────────────────────────────────────
  const ly=svgH-14;
  s+=`<rect x="${LW+8}" y="${ly-6}" width="${chartW-LW-16}" height="14" rx="3" fill="${HDR_BG}" opacity=".9"/>`;
  [
    {col:'#f1a435',label:'Dependency'},
    {col:CP_COL,label:'Critical path'},
    {col:FAIL_COL,label:'⚠ Failed dep (predecessor ends after successor starts)'},
    {col:'#c8f135',label:'Milestone'},
  ].forEach((item,i)=>{
    const lx=LW+16+i*180;
    if(lx>chartW-20)return;
    s+=`<rect x="${lx}" y="${ly-3}" width="16" height="6" rx="2" fill="${item.col}"/>`;
    s+=`<text x="${lx+20}" y="${ly+2}" font-size="8" fill="${MUTED}">${item.label}</text>`;
  });

  // ── PANEL BORDERS ─────────────────────────────────────────────────────────
  s+=`<line x1="${LW}" y1="0" x2="${LW}" y2="${svgH}" stroke="${BORDER}" stroke-width="1"/>`;
  s+=`<line x1="0" y1="${HDR_H}" x2="${chartW}" y2="${HDR_H}" stroke="${BORDER}" stroke-width="1"/>`;

  s+=`</svg>`;

  // #7: publish the pixel→day scale so drag handlers can convert mouse movement
  _ganttCtx={pid:p.id, pxPerDay:(chartW-LW)/totalMs*86400000};

  // #4: note for items omitted from the chart (incomplete/invalid dates)
  let note='';
  if(hiddenA||hiddenM){
    const parts=[];
    if(hiddenA)parts.push(hiddenA+' action'+(hiddenA>1?'s':'')+' (no date — set a due, or start & end)');
    if(hiddenM)parts.push(hiddenM+' milestone'+(hiddenM>1?'s':'')+' (need a date)');
    note='<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:#f1a435;'
      +'padding:5px 8px;background:rgba(241,164,53,.08);border-bottom:1px solid var(--border)">'
      +'⚠ Not shown: '+escH(parts.join(' · '))+'</div>';
  }
  area.innerHTML=note+s;
}

/* ═══════════════════ ACTIONS TAB ═══════════════════ */

// renders the actions tab table + team summary
function renderActionsTab(p){
  if(!p){G('ptw-body').innerHTML='<p style="color:var(--muted)">No project.</p>';return;}
  if(!p.actions)p.actions=[];

  // Collect all team members across all projects for datalist
  const allMembers=[...new Set(projects.flatMap(pr=>(pr.actions||[]).map(a=>a.member).filter(Boolean)))];
  const memberOpts=allMembers.map(m=>`<option value="${escH(m)}">`).join('');

  let h=`<datalist id="member-list">${memberOpts}</datalist>
  <table class="actions-table"><thead><tr>
    <th style="min-width:160px">ACTION</th>
    <th style="min-width:110px">MEMBER</th>
    <th style="width:110px">DUE DATE</th>
    <th style="width:70px">PRIORITY</th>
    <th style="width:80px">STATUS</th>
    <th style="width:36px" title="Mark as milestone — appears in Gantt">⬥ MS</th>
    <th style="width:28px"></th>
  </tr></thead><tbody>`;

  for(const a of p.actions){
    const prioCls=a.priority==='High'?'prio-high':a.priority==='Low'?'prio-low':'prio-med';
    const stCls=a.status==='Done'?'act-status-done':a.status==='In Progress'?'act-status-progress':'act-status-open';
    const prioOpts=['High','Medium','Low'].map(v=>`<option${a.priority===v?' selected':''}>${v}</option>`).join('');
    const stOpts=['Open','In Progress','Done','Blocked'].map(v=>`<option${a.status===v?' selected':''}>${v}</option>`).join('');
    h+=`<tr data-aid="${a.id}" class="${stCls}">
      <td><input class="a-desc" value="${escH(a.desc||'')}"></td>
      <td><input class="a-member" value="${escH(a.member||'')}" list="member-list" placeholder="Team member"></td>
      <td><input class="a-due" type="date" value="${a.due||''}"></td>
      <td><select class="a-prio">${prioOpts}</select></td>
      <td><select class="a-status">${stOpts}</select></td>
      <td style="text-align:center" title="Toggle: show as milestone on Gantt">
        <input class="a-ms" type="checkbox" ${a.isMilestone?'checked':''}
          style="accent-color:var(--accent2);width:14px;height:14px;cursor:pointer"
          onchange="toggleActionMilestone(${p.id},${a.id},this.checked)">
      </td>
      <td><button class="ms-del" onclick="deleteAction(${p.id},${a.id})">×</button></td>
    </tr>`;
  }
  h+=`</tbody></table>
  <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="sm primary" onclick="addAction(${p.id})">+ ADD ACTION</button>
    <span style="font-size:10px;color:var(--muted)">Assign actions to team members · SAVE to persist</span>
  </div>
  <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
    <p style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;margin-bottom:8px">TEAM SUMMARY</p>
    ${renderMemberSummary(p)}
  </div>`;
  G('ptw-body').innerHTML=h;

  // Live row style on status change
  G('ptw-body').querySelectorAll('tr[data-aid]').forEach(tr=>{
    tr.querySelector('.a-status').addEventListener('change',()=>{
      const s=tr.querySelector('.a-status').value;
      tr.className=s==='Done'?'act-status-done':s==='In Progress'?'act-status-progress':'act-status-open';
    });
  });
}

// builds the per-member action summary HTML
function renderMemberSummary(p){
  const byMember={};
  (p.actions||[]).forEach(a=>{
    const m=a.member||'Unassigned';
    if(!byMember[m])byMember[m]={total:0,done:0,open:0,blocked:0};
    byMember[m].total++;
    if(a.status==='Done')byMember[m].done++;
    else if(a.status==='Blocked')byMember[m].blocked++;
    else byMember[m].open++;
  });
  if(!Object.keys(byMember).length)return '<p style="font-size:11px;color:var(--muted)">No actions yet.</p>';
  let h='<div style="display:flex;flex-wrap:wrap;gap:8px;">';
  for(const [m,s] of Object.entries(byMember)){
    const pct=Math.round(s.done/s.total*100);
    h+=`<div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:6px;padding:8px 12px;min-width:140px">
      <div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent2);margin-bottom:4px">${escH(m)}</div>
      <div style="font-size:11px">${s.total} actions · <span style="color:var(--accent)">${pct}%</span> done</div>
      ${s.blocked?`<div style="font-size:10px;color:var(--danger)">⚠ ${s.blocked} blocked</div>`:''}
      <div style="margin-top:5px;height:4px;background:var(--border);border-radius:2px">
        <div style="height:4px;width:${pct}%;background:var(--accent);border-radius:2px;transition:width .3s"></div>
      </div>
    </div>`;
  }
  h+='</div>';
  return h;
}

// reads the actions table back into the project
function saveActionsTabData(p){
  if(!p)return;
  G('ptw-body').querySelectorAll('tr[data-aid]').forEach(tr=>{
    const a=p.actions.find(a=>a.id===+tr.dataset.aid);if(!a)return;
    a.desc=tr.querySelector('.a-desc').value;
    a.member=tr.querySelector('.a-member').value;
    a.due=tr.querySelector('.a-due').value;
    a.priority=tr.querySelector('.a-prio').value;
    a.status=tr.querySelector('.a-status').value;
    const msEl=tr.querySelector('.a-ms');if(msEl)a.isMilestone=msEl.checked;
  });
}

// toggles an action's "is milestone" flag
function toggleActionMilestone(pid,aid,val){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  const a=p.actions.find(a=>a.id===aid);if(!a)return;
  a.isMilestone=val;
  saveState();
  // If sched tab is open refresh it so diamond/dropdown updates immediately
  if(activeTab==='sched') renderSchedTab(p);
}
// adds an action on the actions tab
function addAction(pid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  if(!p.actions)p.actions=[];
  p.actions.push({id:nextActionId++,desc:'New action',member:'',due:'',priority:'Medium',status:'Open',isMilestone:false});
  if(activeTab==='actions') renderActionsTab(p);
  else if(activeTab==='sched') renderSchedTab(p);
}
// deletes an action
function deleteAction(pid,aid){
  const p=projects.find(p=>p.id===pid);if(!p)return;
  p.actions=p.actions.filter(a=>a.id!==aid);
  saveNow();
  // Refresh whichever tab is currently open
  if(activeTab==='actions') renderActionsTab(p);
  else if(activeTab==='sched') renderSchedTab(p);
}
