/* ►► SECTION: SKILLS-MODAL ◄◄ Skills modal: edit, dict, domains, pills, quick-add
 *
 * Functions defined in this file:
 *   getSkillDict             — returns the global skill dictionary (deduped across all engineers)
 *   openSkillsModal          — opens the skills editor modal for an engineer
 *   closeSkillsModal         — closes the skills editor modal
 *   renderSkillPills         — renders the engineer's skill pills in the modal
 *   openSkillEditByName      — opens inline edit for a skill pill via its DOM element
 *   removeSkillByEl          — removes a skill pill via its DOM element
 *   saveSkillEditCurrent     — saves the currently-editing skill
 *   cancelSkillEdit          — cancels the inline skill edit
 *   removeSkillCurrent       — removes the currently-editing skill
 *   openSkillEdit            — opens the inline skill editor for a name or element
 *   saveSkillEdit            — saves edits to a skill (rename/category/level/domain)
 *   renderSkillDomainFilters — renders the domain filter chips in the skill library
 *   setSkillLibFilter        — sets the active skill-library domain filter
 *   renderSkillDict          — renders the skill dictionary list (optionally filtered)
 *   filterSkillDict          — filters the skill dictionary by search text
 *   prefillSkill             — prefills the add-skill form fields
 *   addSkillToEng            — adds the form's skill to the current engineer
 *   quickAddSkill            — quick-adds a skill at default level
 *   removeSkill              — removes a skill from the current engineer by name
 *   saveSkillsModal          — saves state and closes the skills modal
 *   openSkillDomainMgr       — opens the skill-domain manager
 *   closeSkillDomainMgr      — closes the skill-domain manager
 *   renderSkillDomainList    — renders the editable skill-domain list
 *   addSkillDomain           — adds a new skill domain
 *   removeSkillDomain        — removes a skill domain by index
 *   saveSkillDomains         — persists the edited skill domains
 *   openSkillCatMgr          — opens the skill-category manager
 *   closeSkillCatMgr         — closes the skill-category manager
 *   renderSkillCatList       — renders the editable skill-category list
 *   addSkillCat              — adds a new skill category
 *   deleteSkillCatIdx        — deletes a skill category by index
 *   buildSkillMap            — builds a name→holders skill map across all engineers
 *   srfRenameSkill           — prompts to rename a skill across all engineers
 *   srfChangeSkillCat        — changes a skill's category across all engineers
 *   srfChangeSkillDomain     — changes a skill's domain across all engineers
 *   srfMergeSkill            — merges one skill into another across all engineers
 *   srfRenameSkillRaw        — renames a skill across all engineers (no prompt)
 *   ktKey                    — normalises a skill name into a KT-plan key
 *   ktGetPlans               — returns the knowledge-transfer plans for a skill
 *   ktAddPlan                — adds a knowledge-transfer plan for a skill
 *   ktSavePlan               — saves edits to a skill's KT plans
 *   ktDeletePlan             — deletes a KT plan by id
 *   ktPlanHTML               — builds the KT-plan editor HTML for a skill
 *   renderSkillRisk          — renders the skill-risk (SPOF) analysis tab
 *   srfOpenDictManager       — opens the skill dictionary manager from the risk tab
 *   skillRiskHighlightOrg    — highlights single-point-of-failure people on the org chart
 *   skillRiskExportCSV       — exports the skill-risk analysis as CSV
 *   idbExportPhotos          — exports all stored photos as a JSON file
 *   idbImportPhotos          — imports photos from a JSON file into IDB
 *   setActivePill            — marks a top-nav pill active
 *   clearActivePill          — clears the active state on all nav pills
 *   renderSkillsTab          — renders the skills overview tab
 *   skAddSkillGlobal         — registers a new skill in the global dictionary
 *   skDeleteDomain           — deletes a domain from the skills tab (skills move to General)
 *   skAddDomain              — adds a domain from the skills tab
 *   skManageDomains          — scrolls to the domain manager on the skills tab
 *   skMergeDomains           — merges one domain into another from the skills tab
 *   skSplitSkill             — splits a skill into two by proficiency level
 *   skillsExportCSV          — exports skills as CSV (alias of skillRiskExportCSV)
 */
// returns the global skill dictionary (deduped across all engineers)
export function getSkillDict(){
  const dict={};
  engineers.forEach(eng=>(eng.skills||[]).forEach(s=>{
    if(s.name)dict[s.name.toLowerCase()]={name:s.name,cat:s.cat,level:s.level||3,domain:s.domain||''};
  }));
  return Object.values(dict).sort((a,b)=>a.name.localeCompare(b.name));
}

// opens the skills editor modal for an engineer
export function openSkillsModal(engId){
  _skillsEngId=engId;
  _skillLibFilter='';
  const eng=engineers.find(e=>e.id===engId);if(!eng)return;
  G('skills-modal-title').textContent='SKILLS';
  G('skills-modal-subtitle').textContent=eng.name;
  G('skill-new-inp').value='';
  const ds=G('skill-new-domain');
  ds.innerHTML='<option value="">— No domain —</option>';
  skillDomains.forEach(d=>{ds.innerHTML+=`<option value="${escH(d)}">${escH(d)}</option>`;});
  renderSkillPills(eng.skills||[]);
  renderSkillDomainFilters();
  renderSkillDict('');
  var _cs=G('skill-new-cat');if(_cs)_cs.innerHTML=getSkillCatOpts(_cs.value||'crit');
  G('skills-modal-overlay').classList.add('show');
  setTimeout(()=>G('skill-new-inp').focus(),80);
}
// closes the skills editor modal
export function closeSkillsModal(){
  G('skills-modal-overlay').classList.remove('show');
  _skillsEngId=null;
  _editingSkillName=null;
}

// renders the engineer's skill pills in the modal
export function renderSkillPills(skills){
  const CAT_COL=getSkillCatCol();
  const CAT_LABEL=getSkillCatLabel(false);
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  if(!skills||!skills.length){
    G('skills-current-wrap').innerHTML='<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px">No skills yet — type a name above and click + ADD, or pick from the library.</div>';
    return;
  }
  let html='<div style="display:flex;flex-direction:column;gap:10px">';
  skillCats.map(function(c){return c.id;}).forEach(function(cat){
    const catSkills=skills.filter(function(s){return s.cat===cat;});
    if(!catSkills.length)return;
    const cc=CAT_COL[cat];
    html+='<div>';
    html+='<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:'+cc
      +';letter-spacing:.06em;margin-bottom:5px;display:flex;align-items:center;gap:5px">'
      +'<span style="width:6px;height:6px;border-radius:50%;background:'+cc+';display:inline-block"></span>'
      +CAT_LABEL[cat].toUpperCase()
      +'<span style="color:var(--muted);font-weight:400">('+catSkills.length+')</span></div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:5px">';
    catSkills.forEach(function(s){
      const lvl=s.level||3;
      const safeN=escH(s.name).replace(/'/g,'&#39;');
      const hasGap=s.gaps&&s.gaps.trim();
      const hasDomain=s.domain&&s.domain.trim();
      html+='<div style="display:inline-flex;align-items:center;gap:0;border-radius:6px;'
        +'background:'+cc+'12;border:1px solid '+cc+'35;overflow:hidden;max-width:220px" '
        +'data-skillname="'+safeN+'">';
      html+='<button onclick="openSkillEditByName(this.parentElement)" data-skillname="'+safeN+'" '
        +'title="'+(hasDomain?escH(s.domain)+' · ':'')+'L'+lvl+' '+LEVEL_LABEL[lvl]+(hasGap?' · ⚠ '+escH(s.gaps):'')+'" '
        +'style="display:flex;align-items:center;gap:5px;padding:5px 8px;background:none;border:none;cursor:pointer;color:var(--text);font-size:11px;font-family:inherit;text-align:left;max-width:100%">'
        +'<span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">'+escH(s.name)+'</span>'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:'+cc+';flex-shrink:0">L'+lvl+'</span>'
        +(hasDomain?'<span style="font-size:9px;color:var(--muted);flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px">'+escH(s.domain)+'</span>':'')
        +(hasGap?'<span style="font-size:10px;flex-shrink:0" title="Gap: '+escH(s.gaps)+'">⚠</span>':'')
        +(s.comment?'<span style="font-size:10px;flex-shrink:0" title="'+escH(s.comment)+'">💬</span>':'')
        +'</button>';
      html+='<button onclick="event.stopPropagation();removeSkill(\''+escH(s.name).replace(/'/g,"\\'")+'\''+')" '
        +'title="Remove '+escH(s.name)+'" '
        +'style="padding:0 6px;background:none;border:none;border-left:1px solid '+cc+'25;cursor:pointer;'
        +'color:var(--muted);font-size:13px;line-height:1;height:100%;flex-shrink:0;display:flex;align-items:center" '
        +'>\xd7</button>';
      html+='</div>';
    });
    html+='</div></div>';
  });
  html+='</div>';
  G('skills-current-wrap').innerHTML=html;
}

// opens inline edit for a skill pill via its DOM element
export function openSkillEditByName(el){
  const pillEl=el.closest('[data-skillname]');
  if(!pillEl)return;
  const name=pillEl.dataset.skillname;
  if(!name)return;
  const eng=engineers.find(function(e){return e.id===_skillsEngId;});if(!eng)return;
  const s=eng.skills.find(function(x){return x.name===name;});if(!s)return;
  const existing=document.getElementById('skill-edit-popup');if(existing)existing.remove();
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  const domOpts='<option value="">— No domain —</option>'
    +skillDomains.map(function(d){return '<option value="'+escH(d)+'"'+(s.domain===d?' selected':'')+'>'+escH(d)+'</option>';}).join('');
  const lvlOpts=[1,2,3,4,5].map(function(n){
    return '<option value="'+n+'"'+(n===(s.level||3)?' selected':'')+'>L'+n+' – '+LEVEL_LABEL[n]+'</option>';
  }).join('');
  const popup=document.createElement('div');
  popup.id='skill-edit-popup';
  popup.style.cssText='position:fixed;z-index:1200;background:var(--surface);'
    +'border:1px solid var(--accent);border-radius:8px;padding:14px 16px;'
    +'width:320px;box-shadow:0 8px 32px rgba(0,0,0,.7);display:flex;flex-direction:column;gap:8px';
  const rect=pillEl.getBoundingClientRect();
  const top=Math.min(rect.bottom+6, window.innerHeight-360);
  const left=Math.min(rect.left, window.innerWidth-340);
  popup.style.top=Math.max(8,top)+'px';
  popup.style.left=Math.max(8,left)+'px';
  popup.innerHTML=
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--accent)">EDIT SKILL</span>'
    +'<div style="flex:1"></div>'
    +'<button id="sep-close" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:0">✕</button>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">NAME</label>'
    +'<input id="sep-name" class="eng-card-inp" value="'+escH(s.name)+'" style="font-weight:600"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">CATEGORY</label>'
    +'<select id="sep-cat" class="alloc-sel">'+getSkillCatOpts(s.cat||'crit')+'</select></div>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">LEVEL</label>'
    +'<select id="sep-lvl" class="alloc-sel">'+lvlOpts+'</select></div>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">DOMAIN</label>'
    +'<select id="sep-dom" class="alloc-sel" style="font-size:10px">'+domOpts+'</select></div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">GAPS / DEVELOPMENT NEEDS</label>'
    +'<textarea id="sep-gaps" style="background:var(--bg);border:1px solid var(--border);color:var(--text);'
    +'font-size:11px;padding:4px 6px;border-radius:3px;resize:vertical;min-height:36px;font-family:inherit" '
    +'placeholder="Describe any gaps or training needed…">'+escH(s.gaps||'')+'</textarea></div>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">NOTES</label>'
    +'<input id="sep-notes" class="eng-card-inp" value="'+escH(s.notes||'')+'" placeholder="Optional notes…"></div>'
    +'<div style="display:flex;flex-direction:column;gap:2px">'
    +'<label style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">COMMENT</label>'
    +'<textarea id="sep-comment" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 6px;border-radius:3px;resize:vertical;min-height:48px;font-family:inherit" placeholder="Personal note on this skill…">'+escH(s.comment||'')+'</textarea></div>'
    +'<div style="display:flex;gap:6px;margin-top:2px">'
    +'<button class="primary" id="sep-save" style="flex:1">✓ SAVE</button>'
    +'<button id="sep-del" style="color:var(--danger);border-color:var(--danger)">\xd7 REMOVE</button>'
    +'</div>';
  document.body.appendChild(popup);
  document.getElementById('sep-close').onclick=function(){popup.remove();};
  document.getElementById('sep-save').onclick=function(){
    s.name=(document.getElementById('sep-name').value||'').trim()||s.name;
    s.cat=document.getElementById('sep-cat').value||s.cat;
    s.level=+(document.getElementById('sep-lvl').value)||s.level;
    s.domain=document.getElementById('sep-dom').value||'';
    s.gaps=(document.getElementById('sep-gaps').value||'').trim();
    s.notes=(document.getElementById('sep-notes').value||'').trim();
    s.comment=(document.getElementById('sep-comment').value||'').trim();
    saveState();
    popup.remove();
    renderSkillPills(eng.skills||[]);
    renderSkillDict(document.getElementById('skill-new-inp')?document.getElementById('skill-new-inp').value:'');
  };
  document.getElementById('sep-del').onclick=function(){popup.remove();removeSkill(name);};
  setTimeout(function(){
    document.addEventListener('mousedown',function outsideClick(ev){
      if(!popup.contains(ev.target)){popup.remove();document.removeEventListener('mousedown',outsideClick);}
    });
  },100);
  setTimeout(function(){var n=document.getElementById('sep-name');if(n)n.focus();},50);
}
// removes a skill pill via its DOM element
export function removeSkillByEl(el){
  const pill=el.closest('[data-skillname]');
  if(pill)removeSkill(pill.dataset.skillname);
}
// saves the currently-editing skill
export function saveSkillEditCurrent(){saveSkillEdit(_editingSkillName);}
// cancels the inline skill edit
export function cancelSkillEdit(){
  _editingSkillName=null;
  const eng=engineers.find(function(e){return e.id===_skillsEngId;});
  if(eng)renderSkillPills(eng.skills||[]);
}
// removes the currently-editing skill
export function removeSkillCurrent(){removeSkill(_editingSkillName);}

// opens the inline skill editor for a name or element
export function openSkillEdit(nameOrEl){
  const name=typeof nameOrEl==='string'?nameOrEl:(nameOrEl&&nameOrEl.dataset?nameOrEl.dataset.name:nameOrEl);
  _editingSkillName=name;
  const eng=engineers.find(function(e){return e.id===_skillsEngId;});if(!eng)return;
  renderSkillPills(eng.skills||[]);
  setTimeout(function(){const el=G('skills-current-wrap').querySelector('[id^="se-name"]');if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});},30);
}

// saves edits to a skill (rename/category/level/domain)
export function saveSkillEdit(originalName){
  const eng=engineers.find(function(e){return e.id===_skillsEngId;});if(!eng)return;
  const nameInp=G('se-name');if(!nameInp)return;
  const newName=nameInp.value.trim();
  const s=eng.skills.find(function(sk){return sk.name===originalName;});
  if(!s)return;
  if(newName)s.name=newName;
  const ds=G('se-domain');if(ds)s.domain=ds.value||'';
  const cs=G('se-cat');if(cs)s.cat=cs.value||s.cat;
  const ls=G('se-lvl');if(ls)s.level=+(ls.value)||s.level;
  const gs=G('se-gaps');if(gs)s.gaps=gs.value.trim();
  const rs=G('se-risks');if(rs)s.risks=rs.value.trim();
  const ns=G('se-notes');if(ns)s.notes=ns.value.trim();
  _editingSkillName=null;
  renderSkillPills(eng.skills);
  renderSkillDict(G('skill-new-inp').value||'');
}

// renders the domain filter chips in the skill library
export function renderSkillDomainFilters(){
  const el=G('skill-domain-filters');if(!el)return;
  const allBtn=`<span class="skill-dict-chip${_skillLibFilter===''?' sel':''}" onclick="setSkillLibFilter('')">All</span>`;
  const domBtns=skillDomains.map(d=>`<span class="skill-dict-chip${_skillLibFilter===d?' sel':''}" onclick="setSkillLibFilter('${escH(d).replace(/'/g,"\\'")}')">${escH(d)}</span>`).join('');
  el.innerHTML=allBtn+domBtns;
}
// sets the active skill-library domain filter
export function setSkillLibFilter(dom){
  _skillLibFilter=dom;
  renderSkillDomainFilters();
  renderSkillDict(G('skill-new-inp').value);
}

// renders the skill dictionary list (optionally filtered)
export function renderSkillDict(filter){
  const dict=getSkillDict();
  const eng=engineers.find(e=>e.id===_skillsEngId);
  const ownSkills=new Set((eng?.skills||[]).map(s=>s.name.toLowerCase()));
  let shown=dict.filter(d=>!ownSkills.has(d.name.toLowerCase()));
  if(filter)shown=shown.filter(d=>d.name.toLowerCase().includes(filter.toLowerCase()));
  if(_skillLibFilter)shown=shown.filter(d=>(d.domain||'')===_skillLibFilter);
  const el=G('skill-dict-chips');
  el.innerHTML=shown.length
    ?shown.map(d=>`<span class="skill-dict-chip" title="Click to pre-fill — then adjust level &amp; add"
        onclick="prefillSkill('${escH(d.name).replace(/'/g,"\\'")}','${d.cat}',${d.level||3},'${escH(d.domain||'').replace(/'/g,"\\'")}')">
        ${escH(d.name)}<sup style="font-size:8px">L${d.level||3}</sup>
      </span>`).join('')
    :'<span style="font-size:10px;color:var(--muted);padding:2px">No suggestions — type above to search</span>';
}
// filters the skill dictionary by search text
export function filterSkillDict(val){renderSkillDict(val);}

// prefills the add-skill form fields
export function prefillSkill(name,cat,level,domain){
  G('skill-new-inp').value=name;
  G('skill-new-cat').value=cat||'crit';
  G('skill-new-lvl').value=level||3;
  const ds=G('skill-new-domain');if(ds)ds.value=domain||'';
  G('skill-new-inp').focus();
  G('skill-new-inp').select();
  renderSkillDict(name);
}

// adds the form's skill to the current engineer
export function addSkillToEng(){
  const name=G('skill-new-inp').value.trim();if(!name)return;
  const cat=G('skill-new-cat').value||'crit';
  const lvl=+(G('skill-new-lvl').value||3);
  const domain=(G('skill-new-domain').value||'').trim();
  const eng=engineers.find(e=>e.id===_skillsEngId);if(!eng)return;
  if(!eng.skills)eng.skills=[];
  const existing=eng.skills.find(s=>s.name.toLowerCase()===name.toLowerCase());
  if(existing){existing.cat=cat;existing.level=lvl;if(domain)existing.domain=domain;}
  else eng.skills.push({name,cat,level:lvl,domain,gaps:'',risks:'',notes:'',comment:''});
  G('skill-new-inp').value='';
  renderSkillPills(eng.skills);
  renderSkillDict('');
}
// quick-adds a skill at default level
export function quickAddSkill(name,cat){prefillSkill(name,cat,3,'');}
// removes a skill from the current engineer by name
export function removeSkill(name){
  const eng=engineers.find(e=>e.id===_skillsEngId);if(!eng)return;
  eng.skills=eng.skills.filter(s=>s.name!==name);
  renderSkillPills(eng.skills);
  renderSkillDict(G('skill-new-inp').value);
}
// saves state and closes the skills modal
export function saveSkillsModal(){saveState();closeSkillsModal();if(G('eng-roster'))renderResPlan();}

// opens the skill-domain manager
export function openSkillDomainMgr(){renderSkillDomainList();G('skill-domain-mgr').classList.add('show');}
// closes the skill-domain manager
export function closeSkillDomainMgr(){G('skill-domain-mgr').classList.remove('show');}
// renders the editable skill-domain list
export function renderSkillDomainList(){
  G('skill-domain-list').innerHTML=skillDomains.map((d,i)=>
    `<div style="display:flex;align-items:center;gap:6px">
      <input class="skill-add-input" value="${escH(d)}" id="sdm-${i}" style="flex:1">
      <button class="row-del-btn" onclick="removeSkillDomain(${i})" title="Delete domain">\xd7</button>
    </div>`
  ).join('');
}
// adds a new skill domain
export function addSkillDomain(){
  const val=G('skill-domain-new').value.trim();if(!val)return;
  if(!skillDomains.includes(val))skillDomains.push(val);
  G('skill-domain-new').value='';
  renderSkillDomainList();
}
// removes a skill domain by index
export function removeSkillDomain(i){skillDomains.splice(i,1);renderSkillDomainList();}
// persists the edited skill domains
export function saveSkillDomains(){
  const inputs=G('skill-domain-list').querySelectorAll('input');
  skillDomains=[...inputs].map(i=>i.value.trim()).filter(Boolean);
  saveState();
  closeSkillDomainMgr();
  const ds=G('skill-new-domain');
  if(ds){ds.innerHTML='<option value="">— No domain —</option>';skillDomains.forEach(d=>{ds.innerHTML+=`<option value="${escH(d)}">${escH(d)}</option>`;});}
  renderSkillDomainFilters();
}

document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.activeElement.id==='skill-new-inp'){addSkillToEng();}
  if(e.key==='Enter'&&document.activeElement.id==='skill-domain-new'){addSkillDomain();}
  if(e.key==='Escape'){if(G('skill-domain-mgr').classList.contains('show'))closeSkillDomainMgr();}
});

/* ►► SECTION: SKILL-CAT-MGR ◄◄ Skill category manager */
// opens the skill-category manager
export function openSkillCatMgr(){renderSkillCatList();G('skill-cat-mgr').classList.add('show');}
// closes the skill-category manager
export function closeSkillCatMgr(){
  G('skill-cat-mgr').classList.remove('show');
  var cs=G('skill-new-cat');if(cs)cs.innerHTML=getSkillCatOpts(cs.value||'crit');
  var eng=engineers.find(function(e){return e.id===_skillsEngId;});
  if(eng&&G('skills-modal-overlay').classList.contains('show'))renderSkillPills(eng.skills||[]);
}
// renders the editable skill-category list
export function renderSkillCatList(){
  var list=G('skill-cat-list');if(!list)return;
  var BUILTIN=['crit','diff','mand'];
  list.innerHTML=skillCats.map(function(c,i){
    var inUse=engineers.some(function(e){return(e.skills||[]).some(function(s){return s.cat===c.id;});});
    var canDel=(!BUILTIN.includes(c.id))&&!inUse;
    var delBtn=canDel
      ?'<button data-ci="'+i+'" onclick="deleteSkillCatIdx(+this.dataset.ci)" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px;flex-shrink:0" title="Delete">\xd7</button>'
      :'<button style="background:none;border:none;color:var(--border);font-size:14px;flex-shrink:0;cursor:default" title="Cannot delete">\xd7</button>';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px">'
      +'<input type="color" value="'+c.color+'" data-ci="'+i+'" title="Colour" '
      +'style="width:28px;height:28px;padding:2px;border:1px solid var(--border);border-radius:4px;cursor:pointer;flex-shrink:0" '
      +'onchange="skillCats[+this.dataset.ci].color=this.value;saveState();renderSkillCatList()">'
      +'<input value="'+escH(c.emoji||'')+'" data-ci="'+i+'" placeholder="🔵" '
      +'style="width:40px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:14px;padding:3px 5px;border-radius:4px;text-align:center" '
      +'oninput="skillCats[+this.dataset.ci].emoji=this.value.trim();saveState()">'
      +'<input value="'+escH(c.label)+'" data-ci="'+i+'" '
      +'style="flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 6px;border-radius:4px" '
      +'oninput="skillCats[+this.dataset.ci].label=this.value;saveState()">'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);flex-shrink:0">'+escH(c.id)+'</span>'
      +(inUse?'<span style="font-size:8px;color:var(--muted);flex-shrink:0">in use</span>':'')
      +delBtn+'</div>';
  }).join('');
}
// adds a new skill category
export function addSkillCat(){
  var id=(G('cat-new-id').value||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  var label=(G('cat-new-label').value||'').trim();
  var emoji=(G('cat-new-emoji').value||'').trim()||'🔵';
  var color=(G('cat-new-color').value)||'#5be5c8';
  if(!id||!label){alert('ID and Label required.');return;}
  if(skillCats.find(function(c){return c.id===id;})){alert('ID already exists.');return;}
  skillCats.push({id:id,label:label,color:color,emoji:emoji});
  saveState();
  G('cat-new-id').value='';G('cat-new-label').value='';G('cat-new-emoji').value='';G('cat-new-color').value='#5be5c8';
  renderSkillCatList();
}
// deletes a skill category by index
export function deleteSkillCatIdx(i){
  if(i<0||i>=skillCats.length)return;
  if(!confirm('Delete category "'+skillCats[i].label+'"?'))return;
  skillCats.splice(i,1);
  saveState();renderSkillCatList();
}


/* ►► SECTION: SKILL-RISK ◄◄ Skill risk analysis: SPOF, KT planner, dict manager */
// builds a name→holders skill map across all engineers
export function buildSkillMap(){
  const skillMap={};
  engineers.forEach(eng=>{
    (eng.skills||[]).forEach(s=>{
      if(!s.name)return;
      const key=s.name.toLowerCase().trim();
      if(!skillMap[key])skillMap[key]={name:s.name,cat:s.cat,domain:s.domain||'General',holders:[],maxLevel:0,avgLevel:0,gaps:[]};
      skillMap[key].holders.push({eng,level:s.level||3,gaps:s.gaps||''});
      skillMap[key].maxLevel=Math.max(skillMap[key].maxLevel,s.level||3);
      if(s.gaps&&s.gaps.trim())skillMap[key].gaps.push({eng,gap:s.gaps.trim()});
    });
  });
  Object.values(skillMap).forEach(sm=>{
    const sum=sm.holders.reduce((a,h)=>a+h.level,0);
    sm.avgLevel=sm.holders.length?+(sum/sm.holders.length).toFixed(1):0;
  });
  return skillMap;
}

// prompts to rename a skill across all engineers
export function srfRenameSkill(oldName){
  const newName=prompt('Rename skill "'+oldName+'" to:',oldName);
  if(!newName||!newName.trim()||newName.trim()===oldName)return;
  const nn=newName.trim();let count=0;
  engineers.forEach(eng=>{(eng.skills||[]).forEach(s=>{if(s.name.toLowerCase().trim()===oldName.toLowerCase().trim()){s.name=nn;count++;}});});
  saveNow();renderSkillRisk();if(count)flashSaved();
}
// changes a skill's category across all engineers
export function srfChangeSkillCat(skillName,newCat){
  engineers.forEach(eng=>{(eng.skills||[]).forEach(s=>{if(s.name.toLowerCase().trim()===skillName.toLowerCase().trim())s.cat=newCat;});});
  saveState();renderSkillRisk();
}
// changes a skill's domain across all engineers
export function srfChangeSkillDomain(skillName,newDomain){
  engineers.forEach(eng=>{(eng.skills||[]).forEach(s=>{if(s.name.toLowerCase().trim()===skillName.toLowerCase().trim())s.domain=newDomain;});});
  saveState();renderSkillRisk();
}
// merges one skill into another across all engineers
export function srfMergeSkill(fromName){
  const sm=buildSkillMap();
  const targets=Object.values(sm).map(s=>s.name).filter(n=>n.toLowerCase().trim()!==fromName.toLowerCase().trim()).sort();
  if(!targets.length){alert('No other skills to merge into.');return;}
  const into=prompt('Merge "'+fromName+'" INTO which skill?\n\nAvailable:\n'+targets.slice(0,20).join('\n'),targets[0]);
  if(!into||!into.trim())return;
  const intoKey=into.trim().toLowerCase();
  if(!sm[intoKey]){alert('"'+into+'" not found in skill dictionary.');return;}
  if(!confirm('Merge "'+fromName+'" into "'+sm[intoKey].name+'"?\nAll instances of "'+fromName+'" will be renamed. This cannot be undone.'))return;
  srfRenameSkillRaw(fromName,sm[intoKey].name);
  saveNow();renderSkillRisk();flashSaved();
}
// renames a skill across all engineers (no prompt)
export function srfRenameSkillRaw(oldName,newName){
  engineers.forEach(eng=>{
    const already=eng.skills&&eng.skills.some(s=>s.name.toLowerCase().trim()===newName.toLowerCase().trim());
    if(eng.skills)eng.skills=eng.skills.filter(s=>{
      if(s.name.toLowerCase().trim()===oldName.toLowerCase().trim()){if(!already){s.name=newName;return true;}return false;}
      return true;
    });
  });
}

// normalises a skill name into a KT-plan key
export function ktKey(skillName){return skillName.toLowerCase().trim();}
// returns the knowledge-transfer plans for a skill
export function ktGetPlans(skillName){return _ktPlans[ktKey(skillName)]||[];}
// adds a knowledge-transfer plan for a skill
export function ktAddPlan(skillName){
  const eng=engineers.filter(e=>!e.vacant);
  if(!eng.length){alert('No engineers in roster.');return;}
  const key=ktKey(skillName);
  if(!_ktPlans[key])_ktPlans[key]=[];
  _ktPlans[key].push({id:Date.now(),learnerEngId:'',targetLevel:3,deadline:'',status:'Planned',notes:''});
  saveState();renderSkillRisk();
  setTimeout(function(){const el=document.getElementById('kt-'+CSS.escape(key));if(el)el.scrollIntoView({behavior:'smooth',block:'nearest'});},100);
}
// saves edits to a skill's KT plans
export function ktSavePlan(skillName){
  const key=ktKey(skillName);
  const plans=_ktPlans[key]||[];
  plans.forEach(function(plan){
    const el=function(field){return document.getElementById('kt-'+key+'-'+plan.id+'-'+field);};
    const li=el('learner'),tl=el('level'),dd=el('deadline'),st=el('status'),no=el('notes');
    if(li)plan.learnerEngId=li.value;
    if(tl)plan.targetLevel=+tl.value||3;
    if(dd)plan.deadline=dd.value;
    if(st)plan.status=st.value;
    if(no)plan.notes=no.value;
  });
  _ktPlans[key]=plans;saveNow();renderSkillRisk();
}
// deletes a KT plan by id
export function ktDeletePlan(skillName,planId){
  const key=ktKey(skillName);if(!_ktPlans[key])return;
  const pid=+planId;
  _ktPlans[key]=_ktPlans[key].filter(function(p){return p.id!==pid;});
  saveNow();renderSkillRisk();
}

// builds the KT-plan editor HTML for a skill
export function ktPlanHTML(skillName,plans){
  if(!plans.length)return '';
  const key=ktKey(skillName);
  const KT_STATUS=['Planned','In Progress','Done','On Hold'];
  const STATUS_COL={Planned:'var(--muted)','In Progress':'var(--accent2)',Done:'var(--accent)','On Hold':'#f1a435'};
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  let h='<div id="kt-'+escH(key)+'" style="margin-top:8px;padding:10px 12px;background:rgba(91,229,200,.04);border:1px solid rgba(91,229,200,.15);border-radius:5px">';
  h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--accent2);letter-spacing:.06em;margin-bottom:8px">📚 KNOWLEDGE TRANSFER PLANS</div>';
  plans.forEach(function(plan){
    const pid=plan.id;
    const iid=function(f){return 'kt-'+key+'-'+pid+'-'+f;};
    const engOpts='<option value="">— Select learner —</option>'
      +engineers.filter(function(e){return !e.vacant;}).map(function(e){return '<option value="'+e.id+'"'+(String(e.id)===String(plan.learnerEngId)?' selected':'')+'>'+escH(e.name)+'</option>';}).join('');
    const statusOpts=KT_STATUS.map(function(st){return '<option value="'+st+'"'+(plan.status===st?' selected':'')+'>'+st+'</option>';}).join('');
    const lvlOpts=[1,2,3,4,5].map(function(n){return '<option value="'+n+'"'+(n===plan.targetLevel?' selected':'')+'>L'+n+' '+LEVEL_LABEL[n]+'</option>';}).join('');
    const sc=STATUS_COL[plan.status]||'var(--muted)';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:8px;background:var(--bg);border:1px solid '+sc+'44;border-radius:4px;margin-bottom:6px;border-left:3px solid '+sc+'">';
    h+='<div style="display:flex;flex-direction:column;gap:2px"><label style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">LEARNER</label><select id="'+iid('learner')+'" class="alloc-sel">'+engOpts+'</select></div>';
    h+='<div style="display:flex;flex-direction:column;gap:2px"><label style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">TARGET LEVEL</label><select id="'+iid('level')+'" class="alloc-sel">'+lvlOpts+'</select></div>';
    h+='<div style="display:flex;flex-direction:column;gap:2px"><label style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">DEADLINE</label>'
      +'<input type="date" id="'+iid('deadline')+'" value="'+escH(plan.deadline||'')+'" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;padding:3px 6px;border-radius:4px;outline:none"></div>';
    h+='<div style="display:flex;flex-direction:column;gap:2px"><label style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">STATUS</label><select id="'+iid('status')+'" class="alloc-sel" style="color:'+sc+'">'+statusOpts+'</select></div>';
    h+='<div style="grid-column:1/-1;display:flex;flex-direction:column;gap:2px"><label style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">NOTES / PLAN</label>'
      +'<input id="'+iid('notes')+'" class="eng-card-inp" value="'+escH(plan.notes||'')+'" placeholder="Learning path, resources, milestones…"></div>';
    h+='<div style="grid-column:1/-1;display:flex;gap:6px">'
      +'<button class="primary" style="font-size:10px;padding:3px 10px" onclick="ktSavePlan(\''+escH(skillName).replace(/'/g,'\\\'')+'\')">✓ SAVE</button>'
      +'<button class="row-del-btn" onclick="ktDeletePlan(\''+escH(skillName).replace(/'/g,'\\\'')+"','"+pid+'\')" style="font-size:11px">\xd7 DELETE</button></div>';
    h+='</div>';
  });
  h+='</div>';
  return h;
}

// renders the skill-risk (SPOF) analysis tab
/* ── Skills view: two lenses (Matrix | Risk) in one tab (Track B #4) ──────────
   The former separate "Skill risk" rail view is merged in as the Risk lens of the
   Skills view. renderSkills() is the single entry point; each lens renderer sets
   _skLens itself so the toggle always reflects what is on screen. skGo() is the
   deep-link opener (used by the dashboard SPOF chip + the exec SPOF KPI). */
var _skLens='matrix';
function renderSkills(){ if(_skLens==='risk') renderSkillRisk(); else renderSkillsTab(); }
function skSetLens(l){ if(l==='risk') renderSkillRisk(); else renderSkillsTab(); }
function skGo(ev,lens){ _skLens=(lens==='risk')?'risk':'matrix'; if(typeof railGo==='function') railGo(ev,'skills'); }
function skLensBar(){
  const mk=function(id,label){ const on=_skLens===id;
    return '<button onclick="skSetLens(\''+id+'\')" style="background:'+(on?'rgba(200,241,53,.12)':'var(--bg)')
      +';border:1px solid '+(on?'var(--accent)':'var(--border)')+';color:'+(on?'var(--accent)':'var(--muted)')
      +';font-family:\'IBM Plex Mono\',monospace;font-size:10px;padding:3px 12px;border-radius:5px;cursor:pointer">'+escH(label)+'</button>'; };
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-shrink:0">'
    +'<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:var(--accent);letter-spacing:.06em">◎ SKILLS</span>'
    +'<div style="display:flex;gap:6px">'+mk('matrix',t('Matrix'))+mk('risk',t('Risk'))+'</div></div>';
}

export function renderSkillRisk(){
  const body=G('res-body');if(!body)return;
  _skLens='risk';
  const skillMap=buildSkillMap();
  const catOrder={crit:0,diff:1,mand:2};
  const allSkills=Object.values(skillMap).sort(function(a,b){
    const aSpof=a.holders.length===1?0:1,bSpof=b.holders.length===1?0:1;
    if(aSpof!==bSpof)return aSpof-bSpof;
    const co=(catOrder[a.cat]||3)-(catOrder[b.cat]||3);
    if(co!==0)return co;
    return a.name.localeCompare(b.name);
  });
  const totalEngs=engineers.filter(function(e){return !e.vacant;}).length;
  const spofSkills=allSkills.filter(function(s){return s.holders.length===1;});
  const critSpof=spofSkills.filter(function(s){return s.cat==='crit';});
  const spofEngIds=new Set();
  spofSkills.forEach(function(s){s.holders.forEach(function(h){spofEngIds.add(h.eng.id);});});
  const filterState=G('srf-filter')?G('srf-filter').value:'all';
  const domainFilter=G('srf-domain')?G('srf-domain').value:'';
  const catFilter=G('srf-cat')?G('srf-cat').value:'';
  const searchTxt=G('srf-search')?G('srf-search').value.trim().toLowerCase():_srfSearch;
  _srfSearch=searchTxt;
  let visSkills=allSkills;
  if(filterState==='spof')visSkills=visSkills.filter(function(s){return s.holders.length===1;});
  if(filterState==='crit')visSkills=visSkills.filter(function(s){return s.cat==='crit';});
  if(filterState==='risk')visSkills=visSkills.filter(function(s){return s.holders.length<2&&s.cat==='crit';});
  if(filterState==='kt')  visSkills=visSkills.filter(function(s){return ktGetPlans(s.name).length>0;});
  if(domainFilter)        visSkills=visSkills.filter(function(s){return s.domain===domainFilter;});
  if(catFilter)           visSkills=visSkills.filter(function(s){return s.cat===catFilter;});
  if(searchTxt)           visSkills=visSkills.filter(function(s){return s.name.toLowerCase().includes(searchTxt);});
  const CAT_LABEL=getSkillCatLabel(true);
  const CAT_COL=getSkillCatCol();
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  let h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';
  h+=skLensBar();
  const ktTotal=Object.keys(_ktPlans).reduce(function(s,k){return s+(_ktPlans[k]||[]).length;},0);
  const ktDone=Object.keys(_ktPlans).reduce(function(s,k){return s+(_ktPlans[k]||[]).filter(function(p){return p.status==='Done';}).length;},0);
  const kpis=[
    {val:allSkills.length,label:'UNIQUE SKILLS',col:'var(--accent2)'},
    {val:spofSkills.length,label:'SPOF SKILLS',col:'#f14335',sub:spofSkills.length?'⚠ Single holder':'✓ None'},
    {val:critSpof.length,label:'CRITICAL SPOF',col:'#f14335',sub:critSpof.length?'High priority':'✓ None'},
    {val:ktTotal,label:'KT PLANS',col:'var(--accent)',sub:ktTotal?ktDone+'/'+ktTotal+' done':'Add via + KT'},
  ];
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;flex-shrink:0">';
  kpis.forEach(function(k){
    h+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:9px 14px;min-width:110px">'
      +'<div style="font-size:22px;font-weight:700;color:'+k.col+'">'+k.val+'</div>'
      +'<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:.05em">'+k.label+'</div>'
      +(k.sub?'<div style="font-size:10px;color:'+k.col+';margin-top:2px">'+k.sub+'</div>':'')
      +'</div>';
  });
  h+='</div>';
  const domains=[''].concat([...new Set(allSkills.map(function(s){return s.domain;}).filter(Boolean))].sort());
  h+='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0">';
  h+='<input id="srf-search" class="eng-card-inp" placeholder="🔍 Search skills…" value="'+escH(searchTxt)+'" oninput="_srfSearch=this.value;renderSkillRisk()" style="width:150px;font-size:11px">';
  h+='<select id="srf-filter" onchange="renderSkillRisk()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:\'IBM Plex Mono\',monospace;font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'
    +'<option value="all">All skills</option>'
    +'<option value="spof"'+(filterState==='spof'?' selected':'')+'>⚠ SPOF only</option>'
    +'<option value="crit"'+(filterState==='crit'?' selected':'')+'>🔴 Critical only</option>'
    +'<option value="risk"'+(filterState==='risk'?' selected':'')+'>🚨 Critical SPOF</option>'
    +'<option value="kt"'+(filterState==='kt'?' selected':'')+'>📚 Has KT plan</option>'
    +'</select>';
  h+='<select id="srf-cat" onchange="renderSkillRisk()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:\'IBM Plex Mono\',monospace;font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'
    +'<option value="">All categories</option>'
    +'<option value="crit"'+(catFilter==='crit'?' selected':'')+'>🔴 Critical</option>'
    +'<option value="diff"'+(catFilter==='diff'?' selected':'')+'>🟣 Differentiating</option>'
    +'<option value="mand"'+(catFilter==='mand'?' selected':'')+'>🟡 Mandatory</option>'
    +'</select>';
  h+='<select id="srf-domain" onchange="renderSkillRisk()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:\'IBM Plex Mono\',monospace;font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'
    +domains.map(function(d){return '<option value="'+escH(d)+'"'+(domainFilter===d?' selected':'')+'>'+escH(d||'All domains')+'</option>';}).join('')+'</select>';
  h+='<div style="width:1px;background:var(--border);height:18px"></div>';
  h+='<button class="sm" onclick="srfOpenDictManager()">📖 DICTIONARY</button>';
  h+='<button class="sm" onclick="skillRiskHighlightOrg()" style="border-color:'+(_orgSpofHighlight.size?'#f14335':'var(--border)')+';color:'+(_orgSpofHighlight.size?'#f14335':'')+'">🗂 '+(_orgSpofHighlight.size?'CLEAR ORG':'ORG SPOF')+'</button>';
  h+='<button class="sm" onclick="skillRiskExportCSV()">↓ CSV</button>';
  h+='<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--muted);margin-left:auto">'+visSkills.length+' skills</span>';
  h+='</div>';
  h+='<div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:11px">';
  h+='<thead><tr style="border-bottom:2px solid var(--border);background:var(--surface)">';
  ['SKILL','DOMAIN','CAT','HOLDERS','AVG L','MAX L','COVERAGE + HOLDERS','RISK','ACTIONS'].forEach(function(col){
    h+='<th style="text-align:left;padding:6px 8px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);white-space:nowrap">'+col+'</th>';
  });
  h+='</tr></thead><tbody>';
  visSkills.forEach(function(s,i){
    const isSpof=s.holders.length===1;
    const isCritSpof=isSpof&&s.cat==='crit';
    const isLowCov=s.holders.length>0&&s.holders.length<3&&s.cat!=='mand';
    const rowBg=i%2?'rgba(255,255,255,.015)':'transparent';
    const lBorder=isCritSpof?'border-left:3px solid #f14335':isSpof?'border-left:3px solid #f1a435':'border-left:3px solid transparent';
    const covPct=totalEngs?Math.round(s.holders.length/totalEngs*100):0;
    const barCol=isCritSpof?'#f14335':isSpof?'#f1a435':CAT_COL[s.cat]||'var(--accent2)';
    const ktPlans=ktGetPlans(s.name);
    const ktDoneN=ktPlans.filter(function(p){return p.status==='Done';}).length;
    let riskLabel='',riskCol='var(--muted)';
    if(isCritSpof){riskLabel='🚨 CRIT SPOF';riskCol='#f14335';}
    else if(isSpof){riskLabel='⚠ SPOF';riskCol='#f1a435';}
    else if(isLowCov){riskLabel='⚠ Low cov.';riskCol='#f1a435';}
    else if(s.holders.length>=3){riskLabel='✓ OK';riskCol='var(--accent)';}
    else{riskLabel='→ Monitor';riskCol='var(--muted)';}
    const sn=s.name;const snE=escH(sn).replace(/'/g,'&#39;');
    h+='<tr style="background:'+rowBg+';'+lBorder+';border-bottom:1px solid rgba(255,255,255,.04)">';
    h+='<td style="padding:6px 8px;font-weight:600;max-width:150px"><div style="display:flex;align-items:center;gap:4px"><span>'+escH(sn)+'</span>'+(ktPlans.length?'<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(91,229,200,.12);color:var(--accent2)">📚 '+ktDoneN+'/'+ktPlans.length+'</span>':'')+'</div></td>';
    h+='<td style="padding:6px 8px"><select onchange="srfChangeSkillDomain(\''+snE+'\',this.value)" style="background:transparent;border:none;color:var(--muted);font-size:10px;cursor:pointer;outline:none;max-width:100px">'+skillDomains.concat(['General']).filter(function(v,i,a){return a.indexOf(v)===i;}).map(function(d){return '<option value="'+escH(d)+'"'+(s.domain===d?' selected':'')+'>'+escH(d)+'</option>';}).join('')+'</select></td>';
    h+='<td style="padding:6px 8px"><select onchange="srfChangeSkillCat(\''+snE+'\',this.value)" style="background:transparent;border:none;color:'+CAT_COL[s.cat]+';font-size:10px;cursor:pointer;font-weight:600;outline:none">'+['crit','diff','mand'].map(function(c){return '<option value="'+c+'"'+(s.cat===c?' selected':'')+'>'+(c==='crit'?'🔴 Crit':c==='diff'?'🟣 Diff':'🟡 Mand')+'</option>';}).join('')+'</select></td>';
    h+='<td style="padding:6px 8px;text-align:center;font-weight:700;color:'+(isSpof?'#f14335':'var(--text)')+'">'+s.holders.length+'</td>';
    h+='<td style="padding:6px 8px;text-align:center;color:var(--accent2);font-family:\'IBM Plex Mono\',monospace">L'+s.avgLevel+'</td>';
    h+='<td style="padding:6px 8px;text-align:center;color:var(--accent);font-family:\'IBM Plex Mono\',monospace">L'+s.maxLevel+'</td>';
    h+='<td style="padding:6px 8px;min-width:180px"><div style="display:flex;align-items:center;gap:5px;margin-bottom:4px"><div style="flex:1;background:var(--border);border-radius:3px;height:5px;min-width:60px"><div style="background:'+barCol+';width:'+covPct+'%;height:5px;border-radius:3px"></div></div><span style="font-size:9px;color:var(--muted);width:28px;text-align:right">'+covPct+'%</span></div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:3px">'+s.holders.slice(0,5).map(function(h2){
        const g=engGroups.find(function(g){return g.id===h2.eng.groupId;});
        const gc=safeColor(g?g.color:'var(--muted)');const hasGap=h2.gaps&&h2.gaps.trim();
        return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:'+gc+'22;color:'+gc+';border:1px solid '+gc+'44" title="'+escH('L'+h2.level+' '+(LEVEL_LABEL[h2.level]||'')+(hasGap?' | Gap: '+h2.gaps:''))+'">'
          +escH(h2.eng.name)+(hasGap?' ⚠':'')+'</span>';
      }).join('')+(s.holders.length>5?'<span style="font-size:9px;color:var(--muted)">+'+(s.holders.length-5)+'</span>':'')+'</div></td>';
    h+='<td style="padding:6px 8px;font-size:10px;font-weight:600;color:'+riskCol+';white-space:nowrap">'+riskLabel+'</td>';
    h+='<td style="padding:6px 8px;white-space:nowrap">'
      +'<button class="sm" onclick="srfRenameSkill(\''+snE+'\')" style="font-size:9px;padding:2px 5px">✏</button> '
      +'<button class="sm" onclick="srfMergeSkill(\''+snE+'\')" style="font-size:9px;padding:2px 5px">⇒</button> '
      +(isSpof||ktPlans.length?'<button class="sm" onclick="ktAddPlan(\''+snE+'\')" style="font-size:9px;padding:2px 5px;border-color:var(--accent2);color:var(--accent2)">+ KT</button>':'')
      +'</td>';
    h+='</tr>';
    if(ktPlans.length){h+='<tr style="background:'+rowBg+';border-bottom:1px solid rgba(91,229,200,.1)"><td colspan="9" style="padding:0 8px 10px 24px">'+ktPlanHTML(sn,ktPlans)+'</td></tr>';}
  });
  if(!visSkills.length){h+='<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--muted);font-family:\'IBM Plex Mono\',monospace;font-size:11px">No skills match. Try clearing the filters or adding skills via 👤 PROFILE in the roster.</td></tr>';}
  h+='</tbody></table></div>';
  if(spofSkills.length>0&&!searchTxt&&filterState==='all'&&!domainFilter&&!catFilter){
    h+='<div style="margin-top:10px;flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 14px">';
    h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:#f14335;letter-spacing:.06em;margin-bottom:8px">⚠ SINGLE POINTS OF FAILURE — '+spofEngIds.size+' engineer'+(spofEngIds.size>1?'s':'')+' holding unique skills</div>';
    h+='<div style="display:flex;flex-wrap:wrap;gap:8px">';
    [...spofEngIds].forEach(function(eid){
      const eng=engineers.find(function(e){return e.id===eid;});if(!eng)return;
      const engSpof=spofSkills.filter(function(s){return s.holders.some(function(h2){return h2.eng.id===eid;});});
      const grp=engGroups.find(function(g){return g.id===eng.groupId;});
      const gc=safeColor(grp?grp.color:'var(--muted)');
      var _spofCatCol=engSpof.length?(skillCats.find(function(c){return engSpof.some(function(s){return s.cat===c.id;});})||{color:'#f1a435'}).color:'#f1a435';
      h+='<div style="border:1px solid '+_spofCatCol+';border-radius:6px;padding:8px 12px;min-width:160px;max-width:220px;background:'+_spofCatCol+'18">';
      h+='<div style="font-weight:700;font-size:12px;color:'+gc+'">'+escH(eng.name)+'</div>';
      h+='<div style="font-size:10px;color:var(--muted)">'+escH(eng.role||'—')+'</div>';
      h+='<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:3px">';
      engSpof.slice(0,4).forEach(function(s){
        const plans=ktGetPlans(s.name);const hasPlan=plans.length>0;const donePlan=plans.some(function(p){return p.status==='Done';});
        h+='<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:'+CAT_COL[s.cat]+'22;color:'+CAT_COL[s.cat]+';border:1px solid '+CAT_COL[s.cat]+'44;cursor:pointer" onclick="ktAddPlan(\''+escH(s.name).replace(/'/g,'&#39;')+'\')" title="Click to add KT plan">'+escH(s.name)+' '+(donePlan?'✓':hasPlan?'📚':'+ KT')+'</span>';
      });
      if(engSpof.length>4)h+='<span style="font-size:9px;color:var(--muted)">+'+(engSpof.length-4)+' more</span>';
      h+='</div></div>';
    });
    h+='</div></div>';
  }
  h+='</div>';body.innerHTML=h;
}

// opens the skill dictionary manager from the risk tab
export function srfOpenDictManager(){
  const sm=buildSkillMap();
  const skills=Object.values(sm).sort(function(a,b){return a.name.localeCompare(b.name);});
  const existing=document.getElementById('srf-dict-dlg');if(existing)existing.remove();
  const CAT_COL=getSkillCatCol();const CAT_LABEL=getSkillCatLabel(true);
  let rows=skills.map(function(s){
    const snE=escH(s.name).replace(/'/g,'&#39;');
    return '<tr style="border-bottom:1px solid var(--border)">'
      +'<td style="padding:5px 8px;font-weight:600;font-size:11px">'+escH(s.name)+'</td>'
      +'<td style="padding:5px 8px;font-size:11px;color:'+CAT_COL[s.cat]+'">'+CAT_LABEL[s.cat]+'</td>'
      +'<td style="padding:5px 8px;font-size:11px;color:var(--muted)">'+escH(s.domain||'General')+'</td>'
      +'<td style="padding:5px 8px;text-align:center;font-size:11px">'+s.holders.length+'</td>'
      +'<td style="padding:5px 8px;white-space:nowrap">'
      +'<button class="sm" onclick="srfRenameSkill(\''+snE+'\');document.getElementById(\'srf-dict-dlg\').remove()" style="font-size:9px;padding:2px 6px">✏ Rename</button> '
      +'<button class="sm" onclick="srfMergeSkill(\''+snE+'\');document.getElementById(\'srf-dict-dlg\').remove()" style="font-size:9px;padding:2px 6px">⇒ Merge</button>'
      +'</td></tr>';
  }).join('');
  const dlg=document.createElement('div');
  dlg.id='srf-dict-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:900;display:flex;align-items:center;justify-content:center';
  dlg.onclick=function(e){if(e.target===dlg)dlg.remove();};
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px 24px;width:min(720px,96vw);max-height:85vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 48px rgba(0,0,0,.8)" onclick="event.stopPropagation()">'
    +'<div style="display:flex;align-items:center;gap:8px"><h2 style="font-family:\'IBM Plex Mono\',monospace;font-size:13px;color:var(--accent);flex:1">📖 SKILL DICTIONARY</h2><span style="font-size:11px;color:var(--muted)">'+skills.length+' unique skills</span><button onclick="document.getElementById(\'srf-dict-dlg\').remove()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button></div>'
    +'<p style="font-size:11px;color:var(--muted)">Rename or merge skills — changes apply everywhere in the roster. Use ✏ Rename to fix typos. Use ⇒ Merge to consolidate duplicates.</p>'
    +'<div style="overflow-y:auto;flex:1"><table style="border-collapse:collapse;width:100%"><thead><tr style="border-bottom:2px solid var(--border)"><th style="text-align:left;padding:5px 8px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">SKILL</th><th style="text-align:left;padding:5px 8px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">CATEGORY</th><th style="text-align:left;padding:5px 8px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">DOMAIN</th><th style="text-align:center;padding:5px 8px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">PEOPLE</th><th style="padding:5px 8px"></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    +'<button onclick="document.getElementById(\'srf-dict-dlg\').remove()" style="align-self:flex-end">CLOSE</button></div>';
  document.body.appendChild(dlg);
}

// highlights single-point-of-failure people on the org chart
export function skillRiskHighlightOrg(){
  if(_orgSpofHighlight.size>0){_orgSpofHighlight.clear();}
  else{
    const skillMap={};
    engineers.forEach(eng=>{(eng.skills||[]).forEach(s=>{if(!s.name)return;const key=s.name.toLowerCase().trim();if(!skillMap[key])skillMap[key]={cat:s.cat,holders:[]};skillMap[key].holders.push(eng.id);});});
    Object.values(skillMap).forEach(sm=>{if(sm.holders.length===1)(sm.cat==='crit'||sm.cat==='diff'?true:false)&&_orgSpofHighlight.add(sm.holders[0]);});
  }
  renderSkillRisk();
}

// exports the skill-risk analysis as CSV
export function skillRiskExportCSV(){
  const skillMap={};
  engineers.forEach(eng=>{(eng.skills||[]).forEach(s=>{if(!s.name)return;const key=s.name.toLowerCase().trim();if(!skillMap[key])skillMap[key]={name:s.name,cat:s.cat,domain:s.domain||'',holders:[]};skillMap[key].holders.push({name:eng.name,level:s.level||3,group:(engGroups.find(g=>g.id===eng.groupId)||{}).name||'',comment:s.comment||''});});});
  const rows=[['Skill','Domain','Category','Holder Count','Avg Level','Max Level','Coverage %','Risk','Holders','Comments']];
  const CAT_LABEL=getSkillCatLabel(false);
  const totalEngs=engineers.filter(e=>!e.vacant).length;
  Object.values(skillMap).sort((a,b)=>a.holders.length-b.holders.length||a.name.localeCompare(b.name)).forEach(s=>{
    const avg=s.holders.length?+(s.holders.reduce((x,h)=>x+h.level,0)/s.holders.length).toFixed(1):0;
    const max=s.holders.length?Math.max(...s.holders.map(h=>h.level)):0;
    const cov=totalEngs?Math.round(s.holders.length/totalEngs*100):0;
    const isSpof=s.holders.length===1;
    const risk=isSpof&&s.cat==='crit'?'CRITICAL SPOF':isSpof?'SPOF':s.holders.length<3&&s.cat==='crit'?'Low coverage':'OK';
    const comments=s.holders.filter(h=>h.comment).map(h=>h.name+': '+h.comment).join('; ');
    rows.push([s.name,s.domain,CAT_LABEL[s.cat]||s.cat,s.holders.length,avg,max,cov+'%',risk,s.holders.map(h=>h.name+' (L'+h.level+')').join('; '),comments]);
  });
  const csv=rows.map(r=>r.map(v=>{const s=String(v);return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\r\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='skill_risk_matrix.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// exports all stored photos as a JSON file
export function idbExportPhotos(){
  if(_photoCache.size===0){alert('No photos stored to export.');return;}
  var out={version:1,exported:new Date().toISOString(),photos:{}};
  _photoCache.forEach(function(dataURL,key){
    var eng=engineers.find(function(e){return String(e.id)===key;});
    out.photos[key]={dataURL:dataURL,name:eng?eng.name:'id:'+key};
  });
  var json=JSON.stringify(out);
  var blob=new Blob([json],{type:'application/json;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download='eim_photos_backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();setTimeout(function(){URL.revokeObjectURL(url);},2000);
}

// imports photos from a JSON file into IDB
export function idbImportPhotos(){
  var inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=function(){
    var file=inp.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        if(!data.photos||typeof data.photos!=='object')throw new Error('Not a valid photo backup file');
        var keys=Object.keys(data.photos);
        if(!keys.length){alert('No photos found in file.');return;}
        if(!confirm('Import '+keys.length+' photo(s)?\nExisting photos for the same engineers will be replaced.'))return;
        var promises=keys.map(function(key){return idbSavePhoto(key,data.photos[key].dataURL);});
        Promise.all(promises).then(function(){
          idbUpdateStatus();
          alert('Imported '+keys.length+' photo(s) successfully.\n\nOpen the org chart to see them.');
          if(G('org-overlay')&&G('org-overlay').style.display!=='none')renderOrgChart();
          if(G('eng-roster'))renderResPlan();
        });
      }catch(err){alert('Import failed: '+err.message);}
    };
    reader.readAsText(file);
  };
  inp.click();
}

/* ►► SECTION: SKILLS-TAB ◄◄ Skills matrix tab: domain view, add/merge/split */
// marks a top-nav pill active
export function setActivePill(label){
  var el=G('active-overlay-pill');if(!el)return;
  el.textContent='▸ '+label;el.style.display='inline-block';
}
// clears the active state on all nav pills
export function clearActivePill(){
  var el=G('active-overlay-pill');if(!el)return;
  el.style.display='none';el.textContent='';
}

// renders the skills overview tab
export function renderSkillsTab(){
  const body=G('res-body');if(!body)return;
  _skLens='matrix';
  const sm=buildSkillMap();
  const allSkills=Object.values(sm).sort(function(a,b){return a.name.localeCompare(b.name);});
  const CAT_COL=getSkillCatCol();const CAT_LABEL=getSkillCatLabel(true);
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  const search=(G('sk-search')?G('sk-search').value:'').toLowerCase().trim();
  const catF=G('sk-cat')?G('sk-cat').value:'';
  const domF=G('sk-dom')?G('sk-dom').value:'';
  let vis=allSkills;
  if(search)vis=vis.filter(s=>s.name.toLowerCase().includes(search));
  if(catF)  vis=vis.filter(s=>s.cat===catF);
  if(domF)  vis=vis.filter(s=>s.domain===domF);
  const domains=[''].concat([...new Set(allSkills.map(s=>s.domain).filter(Boolean))].sort());
  let h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';
  h+=skLensBar();
  const totalEng=engineers.filter(e=>!e.vacant).length;
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;flex-shrink:0">';
  var _kpiTiles=[{val:allSkills.length,label:'TOTAL SKILLS',col:'var(--accent2)'}];
  skillCats.forEach(function(c){var n=allSkills.filter(function(s){return s.cat===c.id;}).length;if(n>0)_kpiTiles.push({val:n,label:c.label.toUpperCase(),col:c.color});});
  _kpiTiles.push({val:skillDomains.length,label:'DOMAINS',col:'var(--accent)'});
  _kpiTiles.forEach(function(k){
    h+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 14px;min-width:100px">'
      +'<div style="font-size:20px;font-weight:700;color:'+k.col+'">'+k.val+'</div>'
      +'<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted)">'+k.label+'</div></div>';
  });
  h+='</div>';
  h+='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0">';
  h+='<input id="sk-search" class="eng-card-inp" placeholder="🔍 Search…" value="'+escH(search)+'" oninput="renderSkillsTab()" style="width:140px;font-size:11px">';
  h+='<select id="sk-cat" onchange="renderSkillsTab()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'
    +'<option value="">All categories</option>'
    +'<option value="crit"'+(catF==='crit'?' selected':'')+'>🔴 Critical</option>'
    +'<option value="diff"'+(catF==='diff'?' selected':'')+'>🟣 Differentiating</option>'
    +'<option value="mand"'+(catF==='mand'?' selected':'')+'>🟡 Mandatory</option>'
    +'</select>';
  h+='<select id="sk-dom" onchange="renderSkillsTab()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'+domains.map(d=>'<option value="'+escH(d)+'"'+(domF===d?' selected':'')+'>'+escH(d||'All domains')+'</option>').join('')+'</select>';
  h+='<div style="width:1px;background:var(--border);height:18px"></div>';
  h+='<button class="sm primary" onclick="skAddSkillGlobal()">+ ADD SKILL</button>';
  h+='<button class="sm" onclick="srfOpenDictManager()">📖 DICTIONARY</button>';
  h+='<button class="sm" onclick="skManageDomains()">⚙ DOMAINS</button>';
  h+='<button class="sm" onclick="skillsExportOpen()">📄 EXPORT</button>';
  h+='<button class="sm" onclick="skillsExportCSV()">↓ CSV</button>';
  h+='<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--muted);margin-left:auto">'+vis.length+'/'+allSkills.length+' skills</span>';
  h+='</div>';
  h+='<div style="overflow:auto;flex:1"><table style="border-collapse:collapse;width:100%;font-size:11px">';
  h+='<thead><tr style="border-bottom:2px solid var(--border);background:var(--surface);position:sticky;top:0">';
  ['SKILL NAME','CATEGORY','DOMAIN','PEOPLE','AVG LEVEL','MAX LEVEL','WHO HAS IT','ACTIONS'].forEach(function(col){h+='<th style="text-align:left;padding:6px 10px;font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);white-space:nowrap">'+col+'</th>';});
  h+='</tr></thead><tbody>';
  vis.forEach(function(s,i){
    const snE=escH(s.name).replace(/'/g,'&#39;');
    const isSpof=s.holders.length===1;
    const rowBg=i%2?'rgba(255,255,255,.015)':'transparent';
    h+='<tr style="background:'+rowBg+';border-bottom:1px solid rgba(255,255,255,.04)">';
    h+='<td style="padding:6px 10px;font-weight:600">'+escH(s.name)+'</td>';
    h+='<td style="padding:6px 8px"><select onchange="srfChangeSkillCat(\''+snE+'\',this.value)" style="background:transparent;border:none;color:'+CAT_COL[s.cat]+';font-size:10px;cursor:pointer;font-weight:600;outline:none">'+['crit','diff','mand'].map(c=>'<option value="'+c+'"'+(s.cat===c?' selected':'')+'>'+CAT_LABEL[c]+'</option>').join('')+'</select></td>';
    h+='<td style="padding:6px 8px"><select onchange="srfChangeSkillDomain(\''+snE+'\',this.value)" style="background:transparent;border:none;color:var(--muted);font-size:10px;cursor:pointer;outline:none;max-width:120px">'+skillDomains.concat(['General']).filter((v,i,a)=>a.indexOf(v)===i).map(d=>'<option value="'+escH(d)+'"'+(s.domain===d?' selected':'')+'>'+escH(d)+'</option>').join('')+'</select></td>';
    h+='<td style="padding:6px 8px;text-align:center;font-weight:700;color:'+(isSpof?'#f14335':'var(--accent2)')+'">'+s.holders.length+'</td>';
    h+='<td style="padding:6px 8px;text-align:center"><span style="font-family:\'IBM Plex Mono\',monospace;color:var(--accent2)">L'+s.avgLevel+'</span><span style="font-size:9px;color:var(--muted);margin-left:3px">'+LEVEL_LABEL[Math.round(s.avgLevel)]+'</span></td>';
    h+='<td style="padding:6px 8px;text-align:center"><span style="font-family:\'IBM Plex Mono\',monospace;color:var(--accent)">L'+s.maxLevel+'</span></td>';
    h+='<td style="padding:6px 8px;min-width:160px"><div style="display:flex;flex-wrap:wrap;gap:3px">'+s.holders.slice(0,5).map(function(h2){const g=engGroups.find(function(g){return g.id===h2.eng.groupId;});const gc=safeColor(g?g.color:'var(--muted)');return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:'+gc+'22;color:'+gc+';border:1px solid '+gc+'44" title="'+escH('L'+h2.level+' '+LEVEL_LABEL[h2.level])+'">'+escH(h2.eng.name)+'</span>';}).join('')+(s.holders.length>5?'<span style="font-size:9px;color:var(--muted)">+'+(s.holders.length-5)+'</span>':'')+'</div></td>';
    h+='<td style="padding:6px 8px;white-space:nowrap"><button class="sm" onclick="srfRenameSkill(\''+snE+'\')" style="font-size:9px;padding:2px 6px">✏ Rename</button> <button class="sm" onclick="srfMergeSkill(\''+snE+'\')" style="font-size:9px;padding:2px 6px">⇒ Merge</button> <button class="sm" onclick="skSplitSkill(\''+snE+'\')" style="font-size:9px;padding:2px 6px">⇔ Split</button></td>';
    h+='</tr>';
  });
  if(!vis.length){h+='<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--muted)">No skills match. Try clearing filters or add skills via 👤 PROFILE in the roster.</td></tr>';}
  h+='</tbody></table></div>';
  h+='<div style="margin-top:10px;flex-shrink:0;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 14px">';
  h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-bottom:6px">DOMAINS</div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">';
  skillDomains.forEach(function(d){h+='<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;font-size:11px;background:rgba(91,229,200,.08);border:1px solid rgba(91,229,200,.2);color:var(--accent2)">'+escH(d)+'<button onclick="skDeleteDomain(\''+escH(d).replace(/'/g,'&#39;')+'\')" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.6;font-size:12px;padding:0">\xd7</button></span>';});
  h+='</div><div style="display:flex;gap:6px"><input id="sk-new-domain" class="eng-card-inp" placeholder="New domain name…" style="flex:1;font-size:11px" onkeydown="if(event.key===\'Enter\')skAddDomain()"><button class="sm primary" onclick="skAddDomain()">+ ADD</button></div></div>';
  h+='</div>';body.innerHTML=h;
}

// registers a new skill in the global dictionary
export function skAddSkillGlobal(){
  const name=prompt('New skill name:');if(!name||!name.trim())return;
  const cat=prompt('Category (crit=Critical, diff=Differentiating, mand=Mandatory):','mand');
  const validCat=['crit','diff','mand'].includes(cat)?cat:'mand';
  alert('Skill "'+name.trim()+'" registered with category '+validCat+'.\n\nAdd it to individual engineers via 👤 PROFILE → SKILLS tab.');
  renderSkillsTab();
}
// deletes a domain from the skills tab (skills move to General)
export function skDeleteDomain(domainName){
  if(!confirm('Remove domain "'+domainName+'"?\n\nExisting skills in this domain will move to General.'))return;
  engineers.forEach(function(e){(e.skills||[]).forEach(function(s){if(s.domain===domainName)s.domain='';});});
  skillDomains=skillDomains.filter(function(d){return d!==domainName;});
  saveState();renderSkillsTab();
}
// adds a domain from the skills tab
export function skAddDomain(){
  const inp=G('sk-new-domain');if(!inp)return;
  const name=inp.value.trim();if(!name)return;
  if(skillDomains.includes(name)){alert('Domain "'+name+'" already exists.');return;}
  skillDomains.push(name);saveState();renderSkillsTab();
}
// scrolls to the domain manager on the skills tab
export function skManageDomains(){
  const el=document.querySelector('#res-body [data-section="domains"]');
  if(el)el.scrollIntoView({behavior:'smooth'});
}
// merges one domain into another from the skills tab
export function skMergeDomains(){
  var fromSel=G('sk-merge-from');var intoSel=G('sk-merge-into');if(!fromSel||!intoSel)return;
  var fromD=fromSel.value,intoD=intoSel.value;
  if(!fromD||!intoD){alert('Please select both a source and target domain.');return;}
  if(fromD===intoD){alert('Source and target must be different domains.');return;}
  if(!confirm('Merge all skills in "'+fromD+'" into "'+intoD+'"?\n\nThe "'+fromD+'" domain will be removed.'))return;
  var changed=0;
  engineers.forEach(function(e){(e.skills||[]).forEach(function(s){if(s.domain===fromD){s.domain=intoD;changed++;}});});
  skillDomains=skillDomains.filter(function(d){return d!==fromD;});
  saveState();alert('Merged '+changed+' skill(s) from "'+fromD+'" into "'+intoD+'". Domain "'+fromD+'" removed.');
  renderSkillsTab();
}
// splits a skill into two by proficiency level
export function skSplitSkill(skillName){
  const sm=buildSkillMap();const key=skillName.toLowerCase().trim();
  const skill=sm[key];if(!skill){alert('Skill not found.');return;}
  if(skill.holders.length<2){alert('Need at least 2 people with this skill to split.');return;}
  const levels={};skill.holders.forEach(function(h){levels[h.level]=(levels[h.level]||0)+1;});
  const dist=Object.entries(levels).map(function(e){return 'L'+e[0]+': '+e[1]+' person(s)';}).join(', ');
  const splitLevel=prompt('Split "'+skillName+'" into two skills by level.\n\nCurrent distribution: '+dist+'\n\nPeople at or ABOVE which level keep the original skill name?\nOthers will get a new name. Enter threshold level (1-5):','3');
  if(!splitLevel)return;const threshold=+splitLevel;
  if(isNaN(threshold)||threshold<1||threshold>5){alert('Please enter a number 1-5.');return;}
  const newName=prompt('Name for the lower-level version (below L'+threshold+'):',skillName+' (Beginner)');
  if(!newName||!newName.trim())return;
  let changed=0;
  engineers.forEach(function(e){(e.skills||[]).forEach(function(s){if(s.name.toLowerCase().trim()===key&&s.level<threshold){s.name=newName.trim();changed++;}});});
  alert('Split complete. '+changed+' engineer(s) now have "'+newName.trim()+'" instead of "'+skillName+'".');
  saveState();renderSkillsTab();
}
// exports skills as CSV (alias of skillRiskExportCSV)
export function skillsExportCSV(){skillRiskExportCSV();}

/* ►► SECTION: SKILLS-EXPORT ◄◄ Skills matrix + SPOF risk on the shared export engine.
 * Themed, block-picker deliverables (matrix / SPOF risk / individual profiles) that
 * also feed the global Export door and the Talent review pack — replacing the old
 * unthemed document.write popup as the primary skills export. skl-prefixed. */
function sklExportEngs(){
  return engineers.filter(function(e){return !e.vacant&&!e.planningOnly;});
}
function skillsExportBlocks(){
  var mono='font-family:IBM Plex Mono,monospace';
  var CAT_COL=getSkillCatCol();
  var CAT_LABEL=getSkillCatLabel(false);
  return [
    {id:'matrix', label:t('Team skills matrix'), render:function(){
      var engs=sklExportEngs();
      var allSkillNames=[...new Set(engs.flatMap(function(e){return (e.skills||[]).map(function(s){return s.name;});}))].sort();
      if(!engs.length||!allSkillNames.length) return '';
      var h='<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Team skills matrix'))+'</h2>';
      h+='<table style="width:100%;border-collapse:collapse;font-size:10px">';
      h+='<thead><tr style="background:var(--surface)"><th style="text-align:left;padding:6px 8px;border:1px solid var(--border);min-width:140px;color:var(--muted);'+mono+';font-size:9px">'+escH(t('ENGINEER'))+'</th>';
      allSkillNames.forEach(function(s){ h+='<th style="padding:4px 6px;border:1px solid var(--border);writing-mode:vertical-lr;transform:rotate(180deg);min-width:26px;font-weight:600;font-size:9px;color:var(--text)">'+escH(s)+'</th>'; });
      h+='</tr></thead><tbody>';
      engs.forEach(function(e){
        var own=new Map((e.skills||[]).map(function(s){return [s.name,s];}));
        h+='<tr><td style="padding:5px 8px;border:1px solid var(--border);font-weight:600;color:var(--text)">'+escH(e.name)+'<br><span style="font-weight:400;color:var(--muted);font-size:9px">'+escH(e.role||'')+(e.location?' · '+escH(e.location):'')+'</span></td>';
        allSkillNames.forEach(function(sn){
          var s=own.get(sn);
          if(!s){ h+='<td style="border:1px solid var(--border);text-align:center;color:var(--dim)">—</td>'; return; }
          var col=safeColor(CAT_COL[s.cat]||'var(--accent2)');
          h+='<td style="border:1px solid var(--border);text-align:center;background:'+col+'1a;color:'+col+';font-weight:700">✓<sup style="font-size:8px">'+(s.level||3)+'</sup></td>';
        });
        h+='</tr>';
      });
      h+='</tbody></table>';
      h+='<div style="display:flex;gap:16px;margin-top:8px;font-size:10px;'+mono+'">';
      ['crit','diff','mand'].forEach(function(c){ h+='<span style="color:'+safeColor(CAT_COL[c])+'">&#9632; '+escH(CAT_LABEL[c])+'</span>'; });
      h+='</div>';
      return h;
    }},
    {id:'spof', label:t('Skill risk — single points of failure'), render:function(){
      var sm=buildSkillMap();
      var order={crit:0,diff:1,mand:2};
      var spofs=Object.values(sm).filter(function(s){return s.holders.length===1;})
        .sort(function(a,b){ return (order[a.cat]==null?3:order[a.cat])-(order[b.cat]==null?3:order[b.cat])||a.name.localeCompare(b.name); });
      var head='<h2 style="font-size:15px;font-weight:700;margin-bottom:4px;color:var(--text)">'+escH(t('Skill risk — single points of failure'))+'</h2>';
      if(!spofs.length) return head+'<div style="font-size:11px;color:var(--muted)">'+escH(t('No single-holder skills — every skill has backup.'))+'</div>';
      var h=head+'<div style="font-size:10px;color:var(--muted);margin-bottom:10px;'+mono+'">'+escH(t('{n} skill(s) held by exactly one person.',{n:spofs.length}))+'</div>';
      h+='<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:var(--surface)">';
      [t('SKILL'),t('CATEGORY'),t('DOMAIN'),t('SOLE HOLDER'),t('LEVEL')].forEach(function(c){h+='<th style="text-align:left;padding:6px 8px;border:1px solid var(--border);'+mono+';font-size:9px;color:var(--muted)">'+escH(c)+'</th>';});
      h+='</tr></thead><tbody>';
      spofs.forEach(function(s){
        var col=safeColor(CAT_COL[s.cat]||'var(--muted)');
        var holder=s.holders[0];
        h+='<tr>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);font-weight:600;color:var(--text)">'+escH(s.name)+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:'+col+';font-weight:600">'+escH(CAT_LABEL[s.cat]||s.cat)+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:var(--muted)">'+escH(s.domain||'General')+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);color:var(--text)">'+escH(holder.eng.name)+'</td>'
          +'<td style="padding:5px 8px;border:1px solid var(--border);'+mono+';color:var(--accent2)">L'+(holder.level||3)+'</td>'
          +'</tr>';
      });
      h+='</tbody></table>';
      return h;
    }},
    {id:'profiles', label:t('Individual skill profiles'), render:function(){
      var engs=sklExportEngs();
      if(!engs.length) return '';
      var h='<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Individual skill profiles'))+'</h2>';
      engs.forEach(function(e){
        // union of the managed domain list AND any domain actually present on this
        // person's skills, so a skill in an unlisted/orphan domain still shows
        var doms=[''].concat(skillDomains).concat((e.skills||[]).map(function(s){return s.domain||'';}));
        doms=doms.filter(function(v,i,a){return a.indexOf(v)===i;});
        var body='';
        doms.forEach(function(dom){
          var ds=(e.skills||[]).filter(function(s){return (s.domain||'')===dom;});
          if(!ds.length) return;
          body+='<div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:8px 0 3px;padding-top:6px;border-top:1px solid var(--border)">'+escH(dom||'General')+'</div>';
          ['crit','diff','mand'].forEach(function(cat){
            var cs=ds.filter(function(s){return s.cat===cat;});
            if(!cs.length) return;
            var col=safeColor(CAT_COL[cat]);
            body+='<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:'+col+';text-transform:uppercase;margin-bottom:3px">'+escH(CAT_LABEL[cat])+'</div>';
            body+='<div style="display:flex;flex-wrap:wrap;gap:4px">'+cs.map(function(s){return '<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:'+col+'1a;color:'+col+';border:1px solid '+col+'55">'+escH(s.name)+'<sup style="font-size:8px;margin-left:2px">L'+(s.level||3)+'</sup></span>';}).join('')+'</div></div>';
          });
        });
        if(!body) return;
        h+='<div style="border:1px solid var(--border);border-radius:6px;padding:12px 16px;margin-bottom:12px;break-inside:avoid;page-break-inside:avoid">'
          +'<div style="font-size:13px;font-weight:700;color:var(--text)">'+escH(e.name)+'</div>'
          +'<div style="font-size:10px;color:var(--muted);margin-bottom:4px">'+escH(e.role||'')+(e.location?' · '+escH(e.location):'')+'</div>'
          +body+'</div>';
      });
      return h;
    }},
  ];
}
// opens the shared export builder for Skills / SPOF
function skillsExportOpen(){
  if(!engineers.some(function(e){return (e.skills||[]).length;})){ alert(t('Add skills to at least one person first.')); return; }
  var teamName=(G('res-title-input')?G('res-title-input').value:'')||'';
  exportOpenBuilder({
    deliverableId:'skills',
    title:t('Skills & SPOF'),
    subtitleDefault:teamName,
    blocks:skillsExportBlocks(),
    ctx:{},
    orientation:'landscape', pageSize:'A3', rasterWidth:1600,
    builtinTemplates:[
      {id:'full', name:t('Full report'), blocks:['matrix','spof','profiles']},
      {id:'matrix', name:t('Matrix only'), blocks:['matrix']},
      {id:'risk', name:t('Risk only'), blocks:['spof']},
    ],
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}
