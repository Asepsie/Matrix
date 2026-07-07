/* ►► SECTION: BOOT ◄◄ Global event wiring, keyboard shortcuts, and app init/boot sequence
 *
 * Functions defined in this file: (none — this is the entry point: top-level event
 * listeners + the INIT sequence that the monolith ran at the end of <body>).
 * Must be bundled LAST so every global and function it calls is already defined.
 */

/* ═══════════════════ EVENTS ═══════════════════ */
document.addEventListener('input',e=>{
  if(e.target.id==='m-color')G('m-color-hex').textContent=e.target.value;
  if(e.target.id==='e-color')G('e-color-hex').textContent=e.target.value;
  if(e.target.id==='draw-color')render();
});
document.addEventListener('keydown',e=>{
  const tag=document.activeElement.tagName;
  const inInput=(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT');
  if(e.key==='Escape'){closeModal();closeEditor();closeQPanel();setDrawTool('none');closeCtx();closeProjTab();closeHelp();closeCompare();closeSummary();closeRes();closeSnap();closeSkillsPdfDlg();closeOrgChart();if(typeof closeSkillDomainMgr==='function')closeSkillDomainMgr();}
  if(e.key==='Enter'&&G('add-overlay').classList.contains('show'))confirmAdd();
  if(e.key==='Enter'&&document.activeElement.id==='todo-new')addTodo();
  if(e.key==='Delete'&&selId&&!inInput)deleteSelected();
  if(inInput)return; // don't fire shortcuts while typing
  if(e.key==='?'||e.key==='/')openHelp();
  if(e.key==='n'||e.key==='N')openAddModal();
  if(e.key==='s'||e.key==='S'){e.preventDefault();openSummary();}
  if(e.key==='p'||e.key==='P')openRes();
  if(e.key==='o'||e.key==='O')openOrgChart();
  if(e.key==='c'||e.key==='C')openCompare();
  if(e.key==='r'||e.key==='R')resetZoom();
  if(e.key==='z'||e.key==='Z')openSnap();
  if(e.key==='e'||e.key==='E'){if(selId)populateEditor();}
  if(e.key==='h'||e.key==='H'){if(selId)toggleProjVisibility(selId);}
  if(e.key==='1')setYMode('impact');
  if(e.key==='2')setYMode('visibility');
  if(e.key==='3')setYMode('enabler');
  if(e.key==='v'||e.key==='V')setDrawTool('none');
  if(e.key==='l'||e.key==='L')setDrawTool('line');
  if(e.key==='d'||e.key==='D')setDrawTool('dash');
  if(e.key==='a'||e.key==='A')setDrawTool('arrow');
  if(e.key==='t'||e.key==='T')setDrawTool('text');
});
document.addEventListener('click',e=>{if(!G('ctx-menu').contains(e.target))closeCtx();});
document.addEventListener('contextmenu',e=>{
  if(G('svg-container').contains(e.target)&&e.target.closest&&e.target.closest('g[oncontextmenu]'))e.preventDefault();
});
const svgEl=G('matrix-svg');
svgEl.addEventListener('mousedown',onMouseDown);
svgEl.addEventListener('mousemove',onMouseMove);
svgEl.addEventListener('mouseup',onMouseUp);
svgEl.addEventListener('mouseleave',e=>{hideTip();if(dragProj||dragSep){saveState();dragProj=null;dragSep=null;}drawStart=null;drawPreview=null;render();});
G('svg-container').addEventListener('wheel',onWheel,{passive:false});
let rt=null;
new ResizeObserver(()=>{clearTimeout(rt);rt=setTimeout(render,50);}).observe(G('svg-container'));



/* ══════════════════════════════════════════════════════════════════
   MODULE: INIT
   ══════════════════════════════════════════════════════════════════ */
/* ═══════════════════ INIT ═══════════════════ */
loadState();
nbEnsureHistory();   // guarantee nine-box history exists even on a first-run (empty) load
// Global From/To period: make it persistent & consistent across every Resources tab.
// IMPORTANT: the bundled script runs mid-body, so the #res-start/#res-end inputs (and
// the other overlays) are NOT in the DOM yet at this point — that's the long-standing reason
// the saved range never restored (loadState's el lookups were null, and opening Resources
// only filled defaults). So we run this AFTER the DOM is parsed: restore directly from
// storage (storage wins), default only if still empty, then persist so nothing can clobber it.
function ensureResPeriod(){
  try{
    var saved = JSON.parse(localStorage.getItem(SK) || 'null');   // SK = 'eim_v4'
    if(saved){
      if(saved.resStart && G('res-start')) G('res-start').value = saved.resStart;
      if(saved.resEnd   && G('res-end'))   G('res-end').value   = saved.resEnd;
    }
  }catch(e){}
  var before = (G('res-start')?G('res-start').value:'')+'|'+(G('res-end')?G('res-end').value:'');
  initResDefaults();                 // fills FROM/TO with defaults only if still empty
  var after = (G('res-start')?G('res-start').value:'')+'|'+(G('res-end')?G('res-end').value:'');
  if(before!==after) saveNow();      // persist the freshly-defaulted range immediately
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ensureResPeriod);
else ensureResPeriod();
// Localize static index.html chrome (data-i18n sweep). Deferred to DOMContentLoaded
// so every static overlay — including those defined after this mid-body script — is present.
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ i18nApplyDom(document); });
else i18nApplyDom(document);
// Boot photo IDB (async, non-blocking)
idbBoot().then(function(){
  if(G('org-overlay')&&G('org-overlay').style.display!=='none')renderOrgChart();
});
// Boot snapshot IDB: migrate from localStorage + load index
snapBoot();
setScale('x',scaleX);setScale('y',scaleY);
['impact','visibility','enabler'].forEach(m=>G('ym-'+m).classList.toggle('active',m===yMode));
G('y-label').textContent=Y_LABELS[yMode];
setDrawTool('none');
onAxisChange();
renderList();
render();
renderFocusBar();   // focus-star toggle + importance-formula panel in the matrix toolbar
checkDailySnap();
updateSnapBadge();
railInit();   // render the persistent nav rail + land on the initial view

/* ═══════════════════ DRAGGABLE PROJECT WINDOW ═══════════════════ */
// Runs after DOM ready
(function initDragWin(){
  const win=document.getElementById('proj-tab-win');
  if(!win)return;
  const hdr=win.querySelector('.ptw-header');
  if(!hdr)return;
  let ox=0,oy=0,dragging=false;
  hdr.addEventListener('mousedown',function(e){
    if(e.target.tagName==='BUTTON'||e.target.tagName==='SELECT')return;
    dragging=true;
    const r=win.getBoundingClientRect();
    win.style.transform='none';
    win.style.left=r.left+'px';
    win.style.top=r.top+'px';
    ox=e.clientX-r.left;
    oy=e.clientY-r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){
    if(!dragging)return;
    const nx=Math.max(0,Math.min(e.clientX-ox,window.innerWidth-200));
    const ny=Math.max(0,Math.min(e.clientY-oy,window.innerHeight-60));
    win.style.left=nx+'px';
    win.style.top=ny+'px';
  });
  document.addEventListener('mouseup',function(){dragging=false;});
})();
