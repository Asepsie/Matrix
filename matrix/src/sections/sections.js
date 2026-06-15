/* ►► SECTION: SECTIONS ◄◄ Portfolio sections: add/delete/toggle/rename/color
 *
 * Functions defined in this file:
 *   addSection              — adds a new portfolio section with a cycling color
 *   deleteSection           — deletes a section and unsections its projects
 *   toggleSection           — collapses/expands a section in the sidebar
 *   toggleSectionVisibility — shows/hides a section and all its projects
 *   renameSectionInput      — renames a section from its inline input
 *   setSectionColor         — sets a section's color and re-renders
 *   populateSectionDropdowns — refreshes the section <select> options in the editors
 */

const SECTION_COLORS=['#c8f135','#5be5c8','#f1a435','#a78bfa','#f14335','#38bdf8','#fb7185','#34d399'];

// adds a new portfolio section with a cycling color
function addSection(){
  const col=SECTION_COLORS[sections.length%SECTION_COLORS.length];
  sections.push({id:nextSectionId++,name:'NEW SECTION',color:col,collapsed:false});
  renderList();saveState();
}
// deletes a section and unsections its projects
function deleteSection(id){
  if(!confirm('Delete section? Projects will become unsectioned.'))return;
  sections=sections.filter(s=>s.id!==id);
  projects.forEach(p=>{if(p.sectionId===id)p.sectionId=null;});
  renderList();saveState();
}
// collapses/expands a section in the sidebar
function toggleSection(id){
  const s=sections.find(s=>s.id===id);if(s)s.collapsed=!s.collapsed;
  renderList();saveState();
}
// shows/hides a section and all its projects
function toggleSectionVisibility(id){
  const s=sections.find(s=>s.id===id);if(!s)return;
  s.hidden=!s.hidden;
  // Apply to all projects in this section
  projects.forEach(p=>{ if(p.sectionId===id) p.visible=!s.hidden; });
  renderList();render();saveState();
}
// renames a section from its inline input
function renameSectionInput(id,val){
  const s=sections.find(s=>s.id===id);if(s)s.name=val;
}
// sets a section's color and re-renders
function setSectionColor(id,color){
  const s=sections.find(s=>s.id===id);if(s)s.color=color;
  renderList();saveState();
}

// refreshes the section <select> options in the editors
function populateSectionDropdowns(){
  const opts=['<option value="">— No section —</option>',...sections.map(s=>`<option value="${s.id}">${escH(s.name)}</option>`)].join('');
  ['e-section','m-section'].forEach(id=>{
    const el=G(id);if(!el)return;
    const cur=el.value;
    el.innerHTML=opts;
    el.value=cur;
  });
}
