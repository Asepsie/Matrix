/* ►► SECTION: RES-CORE ◄◄ Resource overlay: open/close/tab dispatch, multiselect, month helpers
 *
 * Functions defined in this file:
 *   openRes              — opens the resource overlay and initialises defaults
 *   closeRes             — closes the resource overlay
 *   saveResState         — saves state and flashes the save indicator
 *   showResTab           — dispatches to the correct tab renderer and highlights the active button
 *   initResDefaults      — sets default FROM/TO date inputs if empty
 *   multiSelectHTML      — renders a custom multi-select dropdown with checkboxes
 *   multiSelectToggle    — opens/closes a multi-select dropdown
 *   multiSelectRead      — reads the current selection from DOM checkboxes
 *   multiSelectChange    — called on checkbox change; updates state and calls handler
 *   multiSelectAll       — select/deselect all items in a multi-select dropdown
 *   multiSelectClear     — clears all selections in a multi-select dropdown
 *   onPlanFilterEngChange  — handler: engineer filter change on plan tab
 *   onPlanFilterProjChange — handler: project filter change on plan tab
 *   onDashFilterEngChange  — handler: engineer filter change on dashboard
 *   onDashFilterProjChange — handler: project filter change on dashboard
 *   renderResActiveTab   — re-renders whichever resource tab is currently active
 */

// opens the resource overlay and initialises defaults
export function openRes(){
  setActivePill('RESOURCES');
  G('res-overlay').classList.add('show');
  initResDefaults();
  resActiveTab='roster';
  showResTab('roster');
}
// closes the resource overlay
export function closeRes(){
  clearActivePill(); G('res-overlay').classList.remove('show');
}
// saves state and flashes the save indicator
export function saveResState(){ saveState(); flashSaved(); }

// dispatches to the correct tab renderer and highlights the active button
export function showResTab(tab){
  resActiveTab=tab;
  ['roster','plan','dashboard','skills','skillrisk','profiles','ninebox','disc','timeline','development','heatmap','analytics'].forEach(function(t){
    var btn=G('res-overlay')&&G('res-overlay').querySelector('button[onclick*='+JSON.stringify(t)+']');
    if(!btn)return;
    if(t===tab){
      btn.style.borderColor='var(--accent)';
      btn.style.color='var(--accent)';
      btn.style.background='rgba(200,241,53,.08)';
      btn.style.fontWeight='700';
    } else {
      btn.style.borderColor='';btn.style.color='';
      btn.style.background='';btn.style.fontWeight='';
    }
  });
  if(tab==='roster')           renderRosterTab();
  else if(tab==='plan')        renderResPlan();
  else if(tab==='skills')      renderSkillsTab();
  else if(tab==='skillrisk')   renderSkillRisk();
  else if(tab==='profiles')    renderProfilesTab();
  else if(tab==='ninebox')     renderNineBox();
  else if(tab==='disc')        renderDiscMatrix();
  else if(tab==='timeline')    renderTimeline();
  else if(tab==='development') renderDevelopment();
  else if(tab==='heatmap')     renderHeatmap();
  else if(tab==='analytics')   renderAnalyticsTab();
  else                         renderResDashboard();
}

// sets default FROM/TO date inputs if empty
export function initResDefaults(){
  const si=G('res-start'), ei=G('res-end');
  if(!si||!ei)return;   // inputs not in DOM yet (script runs mid-body); caller retries on DOMContentLoaded
  if(!si.value){
    const now=new Date();
    si.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  }
  if(!ei.value){
    const d=new Date(); d.setMonth(d.getMonth()+23);
    ei.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
}

/* ── Multi-select dropdown helper ───────────────────────────────────
   Usage:
     multiSelectHTML(id, items, selectedSet, onChangeFn, placeholder)
   Renders a custom dropdown with checkboxes. onChangeFn is called with
   the updated Set after any change.
─────────────────────────────────────────────────────────────────── */
export function multiSelectHTML(id,items,sel,onChangeFn,placeholder){
  var hasFilter=sel&&sel.size>0;
  var label=hasFilter?[...sel].slice(0,2).map(function(s){return escH(s);}).join(', ')+(sel.size>2?' +'+( sel.size-2):''):placeholder;
  var opts=items.map(function(name){
    var checked=sel&&sel.has(name);
    return '<label style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;white-space:nowrap;'
      +'font-size:11px;font-family:IBM Plex Mono,monospace;color:var(--text);transition:background .1s"'
      +' onmouseenter="this.style.background=\'rgba(200,241,53,.08)\'" onmouseleave="this.style.background=\'\'">'
      +'<input type="checkbox" data-ms="'+id+'" data-val="'+escH(name)+'" '+(checked?'checked':'')+''
      +' onchange="multiSelectChange(\''+id+'\',\''+onChangeFn+'\')" style="accent-color:var(--accent);width:13px;height:13px;flex-shrink:0">'
      +'<span>'+escH(name)+'</span>'
      +'</label>';
  }).join('');
  return '<div style="position:relative;display:inline-block" id="ms-wrap-'+id+'">'
    +'<button onclick="multiSelectToggle(\''+id+'\')" '
    +'style="background:var(--bg);border:1px solid '+(hasFilter?'var(--accent)':'var(--border)')+';'
    +'color:'+(hasFilter?'var(--accent)':'var(--text)')+';font-family:IBM Plex Mono,monospace;font-size:11px;'
    +'padding:4px 24px 4px 8px;border-radius:4px;cursor:pointer;min-width:120px;max-width:220px;'
    +'text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative" '
    +'title="'+(hasFilter?[...sel].join(', '):'')+'">'+label
    +'<span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:9px;color:var(--muted)">▾</span>'
    +'</button>'
    +'<div id="ms-drop-'+id+'" style="display:none;position:absolute;top:100%;left:0;z-index:500;'
    +'background:var(--surface);border:1px solid var(--border);border-radius:6px;'
    +'box-shadow:0 8px 24px rgba(0,0,0,.6);min-width:200px;max-height:280px;overflow-y:auto;padding:4px 0;margin-top:3px">'
    +'<label style="display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;border-bottom:1px solid var(--border);margin-bottom:3px;white-space:nowrap;font-size:10px;font-family:IBM Plex Mono,monospace;color:var(--muted)">'
    +'<input type="checkbox" id="ms-all-'+id+'" onchange="multiSelectAll(\''+id+'\',\''+onChangeFn+'\')" style="accent-color:var(--accent);width:13px;height:13px"> ALL / NONE'
    +'</label>'
    +opts
    +'</div></div>';
}

// opens/closes a multi-select dropdown
export function multiSelectToggle(id){
  var drop=G('ms-drop-'+id);if(!drop)return;
  var isOpen=drop.style.display!=='none';
  document.querySelectorAll('[id^="ms-drop-"]').forEach(function(d){d.style.display='none';});
  drop.style.display=isOpen?'none':'block';
  if(!isOpen){
    var allCb=G('ms-all-'+id);
    if(allCb){
      var cbs=document.querySelectorAll('[data-ms="'+id+'"]');
      var checkedCount=[...cbs].filter(function(c){return c.checked;}).length;
      allCb.checked=checkedCount===cbs.length;
      allCb.indeterminate=checkedCount>0&&checkedCount<cbs.length;
    }
    setTimeout(function(){
      function outside(e){
        var wrap=G('ms-wrap-'+id);
        if(wrap&&!wrap.contains(e.target)){drop.style.display='none';document.removeEventListener('mousedown',outside);}
      }
      document.addEventListener('mousedown',outside);
    },10);
  }
}

// reads the current selection from DOM checkboxes
export function multiSelectRead(id){
  var cbs=document.querySelectorAll('[data-ms="'+id+'"]');
  var s=new Set();
  cbs.forEach(function(cb){if(cb.checked)s.add(cb.dataset.val);});
  return s;
}

// called on checkbox change; updates state and calls handler
export function multiSelectChange(id,onChangeFn){
  var s=multiSelectRead(id);
  var allCb=G('ms-all-'+id);
  if(allCb){
    var cbs=document.querySelectorAll('[data-ms="'+id+'"]');
    allCb.checked=s.size===cbs.length;
    allCb.indeterminate=s.size>0&&s.size<cbs.length;
  }
  if(window[onChangeFn])window[onChangeFn](s);
}

// select/deselect all items in a multi-select dropdown
export function multiSelectAll(id,onChangeFn){
  var allCb=G('ms-all-'+id);if(!allCb)return;
  var cbs=document.querySelectorAll('[data-ms="'+id+'"]');
  cbs.forEach(function(cb){cb.checked=allCb.checked;});
  allCb.indeterminate=false;
  if(window[onChangeFn])window[onChangeFn](multiSelectRead(id));
}

// clears all selections in a multi-select dropdown
export function multiSelectClear(id,onChangeFn){
  var cbs=document.querySelectorAll('[data-ms="'+id+'"]');
  cbs.forEach(function(cb){cb.checked=false;});
  var allCb=G('ms-all-'+id);if(allCb){allCb.checked=false;allCb.indeterminate=false;}
  if(window[onChangeFn])window[onChangeFn](new Set());
}

// handler: engineer filter change on plan tab
export function onPlanFilterEngChange(s){planFilterEng=s;renderResPlan();var d=G('ms-drop-plan-eng');if(d)d.style.display='block';}
// handler: project filter change on plan tab
export function onPlanFilterProjChange(s){planFilterProj=s;renderResPlan();var d=G('ms-drop-plan-proj');if(d)d.style.display='block';}
// handler: engineer filter change on dashboard
export function onDashFilterEngChange(s){engDashFilterEng=s;renderResDashboard();}
// handler: project filter change on dashboard
export function onDashFilterProjChange(s){engDashFilterProj=s;renderResDashboard();}

// Re-renders whichever resource tab is currently active.
export function renderResActiveTab(){
  if(resActiveTab==='roster')        renderRosterTab();
  else if(resActiveTab==='plan')     renderResPlan();
  else if(resActiveTab==='ninebox')  renderNineBox();
  else if(resActiveTab==='disc')     renderDiscMatrix();
  else if(resActiveTab==='timeline') renderTimeline();
  else if(resActiveTab==='development') renderDevelopment();
}
