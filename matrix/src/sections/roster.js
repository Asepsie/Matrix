/* ►► SECTION: ROSTER ◄◄ Roster tab: engineer cards, groups, add/delete
 *
 * Functions defined in this file:
 *   renderRosterTab      — renders the full engineer roster with groups, cards and toolbar
 *   addPlanningResource  — adds a planning-only resource to the selected group and saves
 */

// Renders the full engineer roster tab: toolbar, ungrouped engineers, and all defined groups.
export function renderRosterTab(){
  const body=G('res-body');if(!body)return;
  let h='';

  // Toolbar
  h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.08em">${t('ENGINEER ROSTER')}</h3>
    <span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">${t('{n} people · {g} groups',{n:engineers.length,g:engGroups.length})}</span>
    <div style="flex:1"></div>
    <button class="add-row-btn" onclick="addEngGroup()">${t('+ GROUP')}</button>
    <button class="add-row-btn" onclick="addEngineer()" title="${t('Adds to selected group (click a group first)')}">${t('+ ENGINEER')}</button>
    <button class="add-row-btn" onclick="addPlanningResource()" title="${t('Adds a planning-only resource — visible in planning but excluded from all calculations, dashboards, and profiles')}" style="border-color:var(--accent2);color:var(--accent2)">${t('+ PLANNING RESOURCE')}</button>
    <span id="eng-add-hint" style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">${t('click a group to target it')}</span>
    <div style="width:1px;background:var(--border);height:16px"></div>
    <button class="add-row-btn" onclick="skillsExportOpen()" style="border-color:var(--accent);color:var(--accent)">${t('↓ SKILLS EXPORT')}</button>
    <button class="add-row-btn" onclick="exportRoster()">${t('↓ ROSTER')}</button>
    <button class="add-row-btn" onclick="importRoster()">${t('↑ ROSTER')}</button>
    <span class="roster-saved" id="roster-save-ind">${t('✓ SAVED')}</span>
    <button class="primary" onclick="saveRoster()" style="font-size:10px;padding:3px 10px">${t('SAVE ROSTER')}</button>
  </div>`;

  // Ungrouped engineers first
  const ungrouped=engineers.filter(e=>!e.groupId||!engGroups.find(g=>g.id===e.groupId));
  if(ungrouped.length){
    h+=`<div class="eng-group-block" style="opacity:.7">
      <div class="eng-group-header" onclick="toggleEngGroup(0)">
        <div class="eng-group-dot" style="background:var(--muted)"></div>
        <span class="eng-group-name-inp" style="cursor:default">${t('UNGROUPED')}</span>
        <span class="eng-group-meta">${t('{n} engineer(s)',{n:ungrouped.length})}</span>
        <span class="eng-group-chevron" id="egc-0">▾</span>
      </div>
      <div class="eng-group-body" id="egb-0"
           ondragover="event.preventDefault()" ondrop="dropEngOnGroup(event,null)">
        ${ungrouped.map(e=>engCardHTML(e)).join('')}
      </div>
    </div>`;
  }

  // Defined groups
  engGroups.forEach(g=>{
    const members=engineers.filter(e=>e.groupId===g.id);
    const totalCost=members.reduce((s,e)=>s+e.monthlyCost,0);
    h+=`<div class="eng-group-block" id="eg-${g.id}">
      <div class="eng-group-header" onclick="toggleEngGroup(${g.id})">
        <div style="position:relative;width:14px;height:14px;flex-shrink:0">
          <div class="eng-group-dot" style="background:${safeColor(g.color)}"></div>
          <input type="color" value="${safeColor(rgbaToHex?rgbaToHex(g.color):g.color)}" title="Group color"
            style="position:absolute;inset:0;opacity:0;cursor:pointer;width:14px;height:14px"
            onclick="event.stopPropagation()"
            onchange="setEngGroupColor(${g.id},this.value);event.stopPropagation()">
        </div>
        <input class="eng-group-name-inp" value="${escH(g.name)}"
          onclick="event.stopPropagation()"
          onchange="renameEngGroup(${g.id},this.value)"
          onblur="saveState()">
        <span class="eng-group-meta">${members.length} · ${totalCost.toLocaleString()}€${t('/mo')}</span>
        <span class="eng-group-chevron${g.collapsed?' collapsed':''}" id="egc-${g.id}">▾</span>
        <button class="row-del-btn" onclick="event.stopPropagation();deleteEngGroup(${g.id})" title="Delete group">×</button>
      </div>
      ${g.collapsed?`<div id="egb-${g.id}" style="display:none"></div>`:`
      <div class="eng-group-body" id="egb-${g.id}"
           ondragover="event.preventDefault()" ondrop="dropEngOnGroup(event,${g.id})">
        ${members.map(e=>engCardHTML(e)).join('')}
        ${members.length===0?`<div style="font-size:11px;color:var(--muted);padding:4px 0">${t('Drop engineers here…')}</div>`:''}
      </div>`}
    </div>`;
  });

  body.innerHTML=h;
}


/* ── Planning-only resources ─────────────────────────────────────────
   planningOnly=true: visible in planning table only.
   Excluded from: dashboard, financial analysis, skills, profiles,
   nine-box, DISC, development, timeline conflict calc, exports.
   ─────────────────────────────────────────────────────────────────── */
// Adds a planning-only resource to the currently selected group, saves state, and re-renders.
export function addPlanningResource(){
  var gid = selectedEngGroupId;
  engineers.push({
    uid: newUid(),
    id: nextEngId++,
    name: 'Planning Resource',
    monthlyCost: 0,
    groupId: gid,
    role: '',
    location: '',
    vacant: false,
    planningOnly: true,
    includeInCost: false,
    excludeFromCalc: false,
    skills: [],
    idcard: {}
  });
  if(gid){ var g=engGroups.find(function(g){return g.id===gid;}); if(g)g.collapsed=false; }
  saveState();
  renderRosterTab();
}

/* ►► SECTION: ROSTER-AUTOSAVE ◄◄ Roster auto-save debounce */
function rosterAutoSave(engId){
  const eng=engineers.find(e=>e.id===engId);if(!eng)return;
  const ni=G('en-name-'+engId);
  if(!ni)return;
  const ri=G('en-role-'+engId),li=G('en-loc-'+engId),ci=G('en-cost-'+engId);
  const newName=(ni.value||'').trim();
  if(newName)eng.name=newName;
  if(ri)eng.role=ri.value;
  if(li)eng.location=li.value;
  if(ci){const v=+ci.value;if(!isNaN(v)&&v>0)eng.monthlyCost=v;}
  saveState();
  const ind=G('roster-save-ind');
  if(ind){ind.classList.add('show');clearTimeout(_rosterSaveTimer);_rosterSaveTimer=setTimeout(()=>ind.classList.remove('show'),1800);}
}

let _skillsEngId=null;
const SKILL_LVL_LABELS=['','Awareness','Basic','Proficient','Advanced','Expert'];
