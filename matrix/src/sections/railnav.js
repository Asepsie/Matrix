/* ►► SECTION: RAILNAV ◄◄ Persistent left navigation rail (domains → views), flyout + pin
 *
 * Owns ALL top-level navigation. Replaces the old multi-group <header> and the
 * 12-button #res-header tab strip with one always-visible rail: five domains,
 * quick view-switching via tap/hover flyout, and a pin-to-expand accordion.
 *
 * Single source of truth: the global `activeView` (globals.js). The router
 * railGo(viewId) sets it, performs the route, and refreshes the highlight +
 * breadcrumb. VIEWS change the visible surface; ACTIONS just fire a function.
 *
 * NOTE: every identifier here is prefixed `rail`/`RAIL_` to avoid clobbering
 * existing globals in the flat bundle (build.js fails on duplicate top-level
 * declarations). No renderer/data/persistence logic lives here — routing only.
 *
 * Functions defined in this file:
 *   railInit        — cache DOM refs, wire listeners, render, land on initial view
 *   railRender      — (re)builds the rail scroll body + foot from RAIL_DOMAINS/RAIL_UTIL
 *   railDomainFor   — returns the domain object owning a given viewId
 *   railGo          — router: set activeView + route + refresh highlight/breadcrumb
 *   railAction      — fire an action (snap/backup/restore/ai/help); no activeView change
 *   railDomClick    — collapsed: toggle flyout · pinned: expand accordion + go to first view
 *   railTogglePin   — pin (open, labelled accordion) / collapse (icon strip)
 *   railFlyEnter    — show the flyout for a domain (hover or tap, collapsed only)
 *   railFlyLeave    — delayed hide of the flyout
 *   railHideFly     — hide the flyout immediately
 *   railUpdateCrumb — refresh the DOMAIN › View breadcrumb (guarded; #topbar is Phase 3)
 */

/* ── Inline SVG icons (currentColor; SVG only, no markup that breaks the bundle) ── */
var RAIL_I = {
  home:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.2 12 4l8 7.2"/><path d="M6 9.8V20h12V9.8"/><path d="M10 20v-5.2h4V20"/></svg>',
  team:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.1"/><path d="M3.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5"/><path d="M16 5.6a3 3 0 0 1 0 5.6"/><path d="M17.2 14c2.1.5 3.4 2.2 3.4 4.4"/></svg>',
  work:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>',
  skills:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="6.6" height="6.6" rx="1.4"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.4"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.4"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.4"/></svg>',
  talent:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8.5"/><path d="M12 12.5C11.4 9.6 8.9 8 5.9 8c.1 3 2.5 4.9 6.1 4.5z"/><path d="M12 11.5c.5-2.6 2.7-4 5.6-4-.1 2.8-2.3 4.3-5.6 4z"/></svg>',
  insights:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="12" width="3.6" height="7.5" rx="1"/><rect x="10.2" y="6" width="3.6" height="13.5" rx="1"/><rect x="16.4" y="9" width="3.6" height="10.5" rx="1"/></svg>',
  planning:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10"/><path d="M4 12h10"/><path d="M4 18h7"/><path d="m16.5 16.5 2 2 3.5-3.8"/></svg>',
  snap:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/></svg>',
  backup:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 4.2v8.6L12 20l-7.5-4.2V7.2z"/><path d="M4.8 7.4L12 11.5l7.2-4.1"/><path d="M12 11.5V20"/></svg>',
  exportico:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5h6.5L18 9v10.5H7z"/><path d="M13 4.5V9h5"/><path d="M12 11.5v5.5"/><path d="M9.6 14.6L12 12l2.4 2.6"/></svg>',
  restore:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v3.4h3.4"/></svg>',
  ai:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="2.6"/><path d="M10 3v2.4M14 3v2.4M10 18.6V21M14 18.6V21M3 10h2.4M3 14h2.4M18.6 10H21M18.6 14H21"/></svg>',
  help:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.8.3-1.3.9-1.3 1.9"/><circle cx="11.6" cy="16.6" r="0.7" fill="currentColor" stroke="none"/></svg>',
  auto:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  settings:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  pin:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  pinOpen:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  chev:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  collab:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="8" r="2.6"/><circle cx="17" cy="8" r="2.6"/><path d="M2.6 18c0-2.4 1.9-4 4.4-4 1.2 0 2.3.4 3.1 1.1"/><path d="M13.9 15.1c.8-.7 1.9-1.1 3.1-1.1 2.5 0 4.4 1.6 4.4 4"/><path d="M9.4 12.2a3.2 3.2 0 0 1 5.2 0"/></svg>'
};

/* ── Domain → view map. Every view id routes through railGo (Phase 2).
   Targets verified against real source: res-tabs go via openRes()+showResTab();
   org/summary/compare/matrix have their own openers. `action:true` items fire a
   function without changing activeView. ID cards & Succession are deliberately
   NOT rail views (modal / org sub-feature). ── */
/* Labels run through t() at load (language is fixed per page load, resolved
   before this file in the bundle). Every consumer — rail render, breadcrumb,
   the Settings landing dropdown — reads these, so this is the single point. */
/* Reframed 2026-08-23 (IA Track A): 7 feature-led domains → 5 job-led domains that
   spell the daily loop — HOME (triage) · PORTFOLIO (what to build) · PLAN (the
   people×project JOIN) · PEOPLE (run/grow team) · REVIEW (report). Pure nav reorg:
   every view keeps its id + render path; only its domain/label/order changed. The
   Track-B feature merges (compare→matrix mode, summary cut, econ+portfolio, charter
   workspace, …) land later — until then those views still sit here, grouped so the
   redundancy is visible. See PIPELINE-PLAN sibling IA-REFRAME notes. */
var RAIL_DOMAINS = [
  { id:'home', name:t('HOME'), ico:RAIL_I.home, views:[
    {id:'home',        label:t('Home')},
  ]},
  { id:'portfolio', name:t('PORTFOLIO'), ico:RAIL_I.work, views:[
    {id:'matrix',      label:t('Portfolio matrix')},
    {id:'pipeline',    label:t('Pipeline')},
    {id:'gate',        label:t('Gate & PI')},
    {id:'charters',    label:t('Financials analysis')},
    {id:'decision',    label:t('Trade-off decision')},
    {id:'portfolio',   label:t('Portfolio analytics')},
    {id:'econ',        label:t('Portfolio economics')},
    {id:'compare',     label:t('Compare')},
    {id:'channels',    label:t('Channel mix')},
    {id:'dtc',         label:t('Design to cost')},
    {id:'brief',       label:t('Project brief')},
  ]},
  { id:'plan', name:t('PLAN'), ico:RAIL_I.planning, views:[
    {id:'plan',        label:t('Resource plan')},
    {id:'dashboard',   label:t('Resource balancer')},
    {id:'timeline',    label:t('Timeline')},
    {id:'backlog',     label:t('Backlog & planner')},
  ]},
  { id:'people', name:t('PEOPLE'), ico:RAIL_I.team, views:[
    {id:'roster',      label:t('Roster')},
    {id:'org',         label:t('Org chart')},
    {id:'skills',      label:t('Skills matrix')},
    {id:'skillrisk',   label:t('Skill risk'), bdg:'SPOF'},
    {id:'heatmap',     label:t('Heatmap')},
    {id:'ninebox',     label:t('Nine-box')},
    {id:'disc',        label:'DISC'},
    {id:'profiles',    label:t('Team profiles')},
    {id:'development', label:t('Development')},
    {id:'engagement',  label:t('Engagement')},
    {id:'analytics',   label:t('People analytics')},
  ]},
  { id:'review', name:t('REVIEW'), ico:RAIL_I.insights, views:[
    {id:'exec',        label:t('Executive summary')},
    {id:'summary',     label:t('Summary')},
  ]},
];

/* Master view registry, captured ONCE from the declared defaults above — before
   any layout mutation (railApplyLayout reassigns d.views in place). RAIL_VIEW_DEF_DOM
   is each view's home domain; RAIL_ALL_VIEWS holds the live view objects by id. Both
   are the fixed source that railApplyLayout rebuilds every domain from, so the layout
   stays idempotent no matter how many times pages get moved/reordered. */
var RAIL_VIEW_DEF_DOM={}, RAIL_ALL_VIEWS={};
RAIL_DOMAINS.forEach(function(d){ d.views.forEach(function(v){ RAIL_VIEW_DEF_DOM[v.id]=d.id; RAIL_ALL_VIEWS[v.id]=v; }); });

/* ── Utility foot — all ACTIONS (fire & forget; never change activeView) ── */
var RAIL_UTIL = [
  {id:'export',   name:t('Export'),    ico:RAIL_I.exportico},
  {id:'collab',   name:t('Collaborate'),ico:RAIL_I.collab},
  {id:'snap',     name:t('Snapshots'), ico:RAIL_I.snap},
  {id:'backup',   name:t('Backup'),    ico:RAIL_I.backup},
  {id:'restore',  name:t('Restore'),   ico:RAIL_I.restore},
  {id:'ai',       name:t('AI advisor'),ico:RAIL_I.ai},
  {id:'settings', name:t('Settings'),  ico:RAIL_I.settings},
  {id:'help',     name:t('Help'),      ico:RAIL_I.help},
];

/* ── Module state (rail-prefixed; unique across the flat bundle) ── */
var railPinned=false;        // locked open via the pin button (survives mouse-leave)
var railHoverMode=true;      // hover-drawer: open on pointer-over, auto-hide on leave (persisted)
var railHoverOpen=false;     // transient hover expansion (not pinned)
var railLanding=null;        // stored default landing view id; null = first run (persisted)
var railRouting=false;       // true while railGo/railRoute is switching surfaces
var railNavStack=[];         // view-id history; panels close via ← Back (railBack)
var railBackNav=false;       // true while railBack is navigating (suppress re-push)
var railWidth=58;            // collapsed rail width (px, persisted, clamped)
var railChartMode='hub';     // charter project picker: 'hub' (card grid) | 'dropdown' (persisted)
var railBadgeScope='all';    // sidebar project-row badge counts: 'all' items | 'tasks' only (persisted)
var railViewOrder={};        // domId -> [viewId,...] custom page order within a domain (persisted)
var railViewDomain={};       // viewId -> overridden domId (cross-domain page moves; persisted)
var railScrollbar='thin';    // rail scrollbar width preset: thin|medium|wide (persisted)
var railDragDom=null, railDragView=null, railDragging=false;  // page drag-reorder scratch state
var RAIL_SB={thin:6,medium:11,wide:16};                // scrollbar preset -> px width
var RAIL_W_MIN=48, RAIL_W_MAX=96, RAIL_W_DEFAULT=58;   // clamp keeps the layout intact
var railFlyDom=null, railFlyTimer=null;
var railEl=null, railScrollEl=null, railFootEl=null, railFlyoutEl=null, railScrimEl=null, railPinBtn=null;
var RAIL_PREFS_KEY='eim_rail_prefs';   // tiny UI-only key, separate from app state (SK)

// load persisted rail UI prefs (hover-drawer on/off + default landing + collapsed width)
function railLoadPrefs(){
  try{ var p=JSON.parse(localStorage.getItem(RAIL_PREFS_KEY)||'null');
       if(p){ if(typeof p.hoverMode==='boolean') railHoverMode=p.hoverMode;
              if(typeof p.landing==='string')  railLanding=p.landing;
              if(p.chartPicker==='dropdown'||p.chartPicker==='hub') railChartMode=p.chartPicker;
              if(p.badgeScope==='tasks'||p.badgeScope==='all') railBadgeScope=p.badgeScope;
              if(p.scrollbar==='thin'||p.scrollbar==='medium'||p.scrollbar==='wide') railScrollbar=p.scrollbar;
              if(p.viewOrder&&typeof p.viewOrder==='object') railViewOrder=p.viewOrder;
              if(p.viewDomain&&typeof p.viewDomain==='object') railViewDomain=p.viewDomain;
              if(p.railWidth!=null)             railWidth=railClampWidth(p.railWidth); } }catch(e){}
}
// persist rail UI prefs
function railSavePrefs(){
  try{ localStorage.setItem(RAIL_PREFS_KEY,JSON.stringify({hoverMode:railHoverMode,landing:railLanding,railWidth:railWidth,chartPicker:railChartMode,badgeScope:railBadgeScope,scrollbar:railScrollbar,viewOrder:railViewOrder,viewDomain:railViewDomain})); }catch(e){}
}
// scrollbar preset accessor + apply: writes --rail-sb (px) on documentElement; nav.css keys off it
function railApplyScrollbar(){
  var de=document.documentElement.style;
  de.setProperty('--rail-sb',(RAIL_SB[railScrollbar]||RAIL_SB.thin)+'px');
  de.setProperty('--rail-sb-ff',railScrollbar==='wide'?'auto':'thin');   // Firefox: 'thin' caps ~11px
}
// Rebuild every domain's `views` from the master registry + the saved overrides:
// (1) place each known view in its effective domain (railViewDomain override, else
// its home), (2) order within the domain per railViewOrder. Both steps tolerate
// stale ids: an override pointing at a removed domain falls home; an order entry for
// an unknown id ranks last. Idempotent — always derived from the fixed registry, so
// it can run any number of times after moves/reorders. Replaces railApplyOrder (which
// only reordered within a domain and could never move a page between domains).
function railEffectiveDom(viewId){
  var d=railViewDomain[viewId];
  if(d&&railDomainFor2(d)) return d;                 // override to a live domain
  return RAIL_VIEW_DEF_DOM[viewId]||null;            // else home domain
}
function railApplyLayout(){
  var byDom={};
  RAIL_DOMAINS.forEach(function(d){ byDom[d.id]=[]; });
  Object.keys(RAIL_ALL_VIEWS).forEach(function(vid){
    var dom=railEffectiveDom(vid);
    if(byDom[dom]) byDom[dom].push(RAIL_ALL_VIEWS[vid]);
  });
  RAIL_DOMAINS.forEach(function(d){
    var arr=byDom[d.id]||[];
    var ord=railViewOrder[d.id];
    if(ord&&ord.length){
      var rank=function(id){ var i=ord.indexOf(id); return i<0?9999:i; };
      // decorate-sort-undecorate keeps equal ranks in registry order (stable)
      arr=arr.map(function(v,i){return {v:v,i:i};})
             .sort(function(a,b){ return (rank(a.v.id)-rank(b.v.id))||(a.i-b.i); })
             .map(function(x){return x.v;});
    }
    d.views=arr;
  });
}
// Reset all rail layout customisation (domain moves + ordering) back to defaults.
function railResetLayout(){
  railViewOrder={}; railViewDomain={};
  railSavePrefs();
  railApplyLayout();
  railRender();
  rloRenderBoard();                          // refresh the organiser if open
}

/* ══ RAIL LAYOUT ORGANISER (Settings pop-up; #rail-layout-overlay) ══════
   A roomy board that mirrors the rail: one column per domain, pages as cards
   you drag between columns (move) or within a column (reorder). ▲/▼ + a domain
   <select> on each card do the same without dragging (touch / a11y fallback).
   Everything routes through the SAME persisted model (railViewDomain +
   railViewOrder) via railMoveView / railLayoutNudge, so the board, the live
   rail and the DnD all stay in sync; changes apply immediately (like a drop). */
function rloOpen(){ var ov=G('rail-layout-overlay'); if(!ov) return; rloRenderBoard(); ov.classList.add('show'); }
function rloClose(){ var ov=G('rail-layout-overlay'); if(ov) ov.classList.remove('show'); }
function rloRenderBoard(){
  var host=G('rlo-board'); if(!host) return;
  host.innerHTML=RAIL_DOMAINS.map(function(d){
    var cards=d.views.map(function(v,idx){
      var opts=RAIL_DOMAINS.map(function(o){
        return '<option value="'+o.id+'"'+(o.id===d.id?' selected':'')+'>'+escH(o.name)+'</option>';
      }).join('');
      return '<div class="rlo-card" draggable="true" data-view="'+v.id+'"'
        + ' ondragstart="rloDragStart(event,\''+v.id+'\')" ondragover="rloCardOver(event)"'
        + ' ondragleave="rloCardLeave(event)" ondrop="rloCardDrop(event,\''+d.id+'\',\''+v.id+'\')"'
        + ' ondragend="rloDragEnd(event)">'
        + '<div class="rlo-card-top"><span class="rlo-grip" aria-hidden="true">⠿</span>'
        +   '<span class="rlo-card-lbl">'+escH(v.label)+'</span>'+(v.bdg?'<span class="rn-bdg">'+v.bdg+'</span>':'')+'</div>'
        + '<div class="rlo-card-ctl">'
        +   '<button class="sm" '+(idx===0?'disabled':'')+' onclick="railLayoutNudge(\''+v.id+'\',-1)" title="'+t('Move up')+'">▲</button>'
        +   '<button class="sm" '+(idx===d.views.length-1?'disabled':'')+' onclick="railLayoutNudge(\''+v.id+'\',1)" title="'+t('Move down')+'">▼</button>'
        +   '<select class="rlo-move" onchange="railLayoutSetDomain(\''+v.id+'\',this.value)" title="'+t('Move to domain')+'">'+opts+'</select>'
        + '</div></div>';
    }).join('');
    return '<div class="rlo-col" data-dom="'+d.id+'"'
      + ' ondragover="rloColOver(event,\''+d.id+'\')" ondragleave="rloColLeave(event)" ondrop="rloColDrop(event,\''+d.id+'\')">'
      + '<div class="rlo-col-head"><span class="rlo-col-ico">'+d.ico+'</span>'
      +   '<span class="rlo-col-name">'+escH(d.name)+'</span><span class="rlo-col-count">'+d.views.length+'</span></div>'
      + '<div class="rlo-col-body">'+(cards||'<div class="rlo-empty">'+t('(no pages)')+'</div>')+'</div>'
      + '</div>';
  }).join('');
}
// Move a page to another domain (organiser dropdown; lands at that domain's end).
function railLayoutSetDomain(viewId,domId){
  if(!domId||domId===railEffectiveDom(viewId)) return;
  railMoveView(viewId,domId,null,false);    // persists + re-renders the rail
  rloRenderBoard();
}
// Nudge a page up (-1) / down (+1) within its own domain (organiser ▲/▼ buttons).
function railLayoutNudge(viewId,dir){
  var domId=railEffectiveDom(viewId);
  var dom=railDomainFor2(domId); if(!dom) return;
  var ids=dom.views.map(function(v){return v.id;});
  var i=ids.indexOf(viewId), j=i+dir;
  if(i<0||j<0||j>=ids.length) return;
  ids[i]=ids[j]; ids[j]=viewId;             // swap with neighbour
  railViewOrder[domId]=ids;
  railApplyLayout();
  railSavePrefs();
  railRender();
  rloRenderBoard();
}

/* Organiser board DnD — its own scratch (rloDragView), separate DOM from the rail
   strip. Drop on a card = position next to it; drop on a column = append to that
   domain. Both route through railMoveView, then rebuild the board. */
var rloDragView=null;
function rloClearMarks(){
  var host=G('rlo-board'); if(!host) return;
  var m=host.querySelectorAll('.rlo-drop-before,.rlo-drop-after,.rlo-dragging,.rlo-col-into');
  for(var i=0;i<m.length;i++) m[i].classList.remove('rlo-drop-before','rlo-drop-after','rlo-dragging','rlo-col-into');
}
function rloDragStart(ev,viewId){
  rloDragView=viewId;
  try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',viewId); }catch(e){}
  if(ev.currentTarget&&ev.currentTarget.classList) ev.currentTarget.classList.add('rlo-dragging');
}
function rloCardOver(ev){
  if(!rloDragView) return;
  ev.preventDefault(); ev.stopPropagation();             // beat the column-level handler
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  var el=ev.currentTarget, r=el.getBoundingClientRect(), after=(ev.clientY-r.top)>r.height/2;
  rloClearMarks();
  el.classList.add(after?'rlo-drop-after':'rlo-drop-before');
}
function rloCardLeave(ev){ if(ev.currentTarget&&ev.currentTarget.classList) ev.currentTarget.classList.remove('rlo-drop-before','rlo-drop-after'); }
function rloCardDrop(ev,domId,targetId){
  ev.preventDefault(); ev.stopPropagation();
  if(rloDragView&&rloDragView!==targetId){
    var r=ev.currentTarget.getBoundingClientRect(), after=(ev.clientY-r.top)>r.height/2;
    railMoveView(rloDragView,domId,targetId,after);
    rloRenderBoard();
  }
  rloDragView=null; rloClearMarks();
}
function rloColOver(ev,domId){
  if(!rloDragView) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  rloClearMarks();
  if(ev.currentTarget&&ev.currentTarget.classList) ev.currentTarget.classList.add('rlo-col-into');
}
function rloColLeave(ev){ if(ev.currentTarget&&ev.currentTarget.classList) ev.currentTarget.classList.remove('rlo-col-into'); }
function rloColDrop(ev,domId){
  ev.preventDefault(); ev.stopPropagation();
  if(rloDragView){ railMoveView(rloDragView,domId,null,false); rloRenderBoard(); }   // append to end
  rloDragView=null; rloClearMarks();
}
function rloDragEnd(){ rloDragView=null; rloClearMarks(); }
// Charter project-picker mode accessor (read by charter.js). 'hub' | 'dropdown'.
function railChartPicker(){ return railChartMode==='dropdown' ? 'dropdown' : 'hub'; }
// Sidebar badge scope accessor (read by sidebar.js projItemHTML). 'all' | 'tasks'.
function railBadgeScopeGet(){ return railBadgeScope==='tasks' ? 'tasks' : 'all'; }
// clamp the collapsed width to a range that keeps the icon strip + layout intact
function railClampWidth(v){ v=+v; if(isNaN(v)) return RAIL_W_DEFAULT; return Math.max(RAIL_W_MIN,Math.min(RAIL_W_MAX,Math.round(v))); }
// push the collapsed width to the --rail CSS variable; everything (gutter, overlay
// insets, flyout, rail) keys off it, so this single write reflows the whole shell
function railApplyWidth(){ document.documentElement.style.setProperty('--rail', railClampWidth(railWidth)+'px'); }
// live preview while dragging the Settings slider (reverted on Cancel)
function railPreviewWidth(v){
  var w=railClampWidth(v);
  document.documentElement.style.setProperty('--rail', w+'px');
  var lbl=G('set-railwidth-val'); if(lbl) lbl.textContent=w+'px';
}
// is the rail visually open (pinned OR hover-expanded)?
function railIsOpen(){ return railPinned||railHoverOpen; }
// reflect open state on the DOM (width via .open class) + pin glyph
function railApplyOpen(){
  if(railEl) railEl.classList.toggle('open',railIsOpen());
  if(railPinBtn) railPinBtn.innerHTML=railPinned?RAIL_I.pinOpen:RAIL_I.pin;
}
// toggle the hover-drawer option (open-on-hover + auto-hide-on-leave)
function railToggleHoverMode(){
  railHoverMode=!railHoverMode;
  railSavePrefs();
  railRender();   // refresh the foot toggle label; open state is left to hover/pin
}

// cache DOM refs, wire listeners, render, land on the initial view
function railInit(){
  railEl       = G('railnav');
  railScrollEl = G('rail-scroll');
  railFootEl   = G('rail-foot');
  railFlyoutEl = G('rail-flyout');
  railScrimEl  = G('rail-scrim');
  railPinBtn   = G('rail-pin');
  if(!railEl) return;                       // rail markup missing → bail quietly
  railLoadPrefs();
  railApplyWidth();                         // apply the saved collapsed width up front
  railApplyScrollbar();                     // apply the saved scrollbar-width preset
  railApplyLayout();                        // apply saved cross-domain moves + per-domain order
  if(railPinBtn) railPinBtn.innerHTML=RAIL_I.pin;
  railRender();
  // Hover-drawer: pointer over the always-visible rail expands it; leaving
  // auto-collapses it (unless pinned). Toggle via the foot "Auto-hide" control.
  railEl.addEventListener('mouseenter',function(){
    if(railHoverMode&&!railPinned&&!railHoverOpen){ railHoverOpen=true; railHideFly(); railApplyOpen(); railRender(); }
  });
  railEl.addEventListener('mouseleave',function(){
    if(railDragging) return;                 // keep the rail open while a page is being dragged
    if(railHoverOpen&&!railPinned){ railHoverOpen=false; railApplyOpen(); railRender(); }
  });
  // Flyout hover keep-alive + dismiss-on-outside-click
  if(railFlyoutEl){
    railFlyoutEl.addEventListener('mouseenter',function(){clearTimeout(railFlyTimer);});
    railFlyoutEl.addEventListener('mouseleave',railHideFly);
  }
  document.addEventListener('click',function(e){
    if(railEl&&!railEl.contains(e.target)&&railFlyoutEl&&!railFlyoutEl.contains(e.target)) railHideFly();
  });
  // Land on the user's chosen default view — or ask once on first run.
  // DEFER to DOMContentLoaded: the bundled script runs mid-body, so the overlays
  // that live *after* the {{JS}} placeholder (#res-overlay, #org-overlay,
  // #snap-overlay, #brief-overlay) are not parsed yet — routing would hit null.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',railLand);
  else                                railLand();
}

// perform the initial landing route (overlays must be in the DOM by now)
function railLand(){
  if(railLanding&&railDomainFor(railLanding)) railGo(null,railLanding);
  else                                        railFirstRunLanding();
  railUpdateCrumb();
}

// returns the domain object that owns a given view id (null if none)
function railDomainFor(viewId){
  for(var i=0;i<RAIL_DOMAINS.length;i++)
    for(var j=0;j<RAIL_DOMAINS[i].views.length;j++)
      if(RAIL_DOMAINS[i].views[j].id===viewId) return RAIL_DOMAINS[i];
  return null;
}

// (re)builds the rail scroll body + foot; highlights the active domain/view
function railRender(){
  if(!railScrollEl) return;
  var activeDom=railDomainFor(activeView);
  var activeDomId=activeDom?activeDom.id:'';
  railScrollEl.innerHTML=RAIL_DOMAINS.map(function(d){
    var holds=d.id===activeDomId, exp=railIsOpen()&&holds;
    var subs=d.views.map(function(v){
      var on=holds&&v.id===activeView&&!v.action;
      return '<div class="rn-sub'+(on?' active':'')+'" draggable="true" data-view="'+v.id+'" onclick="railGo(event,\''+v.id+'\')"'
           + ' ondragstart="railSubDragStart(event,\''+d.id+'\',\''+v.id+'\')"'
           + ' ondragover="railSubDragOver(event,\''+d.id+'\')"'
           + ' ondragleave="railSubDragLeave(event)"'
           + ' ondrop="railSubDrop(event,\''+d.id+'\',\''+v.id+'\')"'
           + ' ondragend="railSubDragEnd(event)">'
           + '<span class="rn-grip" aria-hidden="true">⠿</span>'
           + '<span class="rn-sub-lbl">'+v.label+'</span>'+(v.bdg?'<span class="rn-bdg">'+v.bdg+'</span>':'')+'</div>';
    }).join('');
    return '<div class="rn-dom'+(holds?' active-dom':'')+(exp?' exp':'')+'" data-dom="'+d.id+'"'
         + ' onmouseenter="railFlyEnter(\''+d.id+'\',this)" onmouseleave="railFlyLeave()">'
         + '<div class="rn-dom-head" onclick="railDomClick(event,\''+d.id+'\',this)"'
         +   ' ondragover="railDomDragOver(event,\''+d.id+'\')" ondragleave="railDomDragLeave(event)" ondrop="railDomDrop(event,\''+d.id+'\')">'
         +   '<span class="rn-dom-ico">'+d.ico+'</span>'
         +   '<span class="rn-dom-name mono">'+d.name+'</span>'
         +   '<span class="rn-dom-chev">'+RAIL_I.chev+'</span>'
         + '</div><div class="rn-subs">'+subs+'</div></div>';
  }).join('');
  railFootEl.innerHTML=RAIL_UTIL.map(function(u){
    var badge=(u.id==='collab')?'<span id="rn-collab-badge" class="rn-util-badge" style="display:none"></span>':'';
    return '<div class="rn-util" onclick="railAction(\''+u.id+'\')" title="'+u.name+'">'
         + '<span class="rn-util-ico" style="position:relative">'+u.ico+badge+'</span>'
         + '<span class="rn-util-name mono">'+u.name+'</span></div>';
  }).join('')
  + '<div class="rn-mode-sep"></div>'
  + '<div class="rn-util rn-mode'+(railHoverMode?' on':'')+'" onclick="railToggleHoverMode()"'
  + ' title="Auto-hide: open the rail when the pointer is over it, collapse it when the pointer leaves">'
  +   '<span class="rn-util-ico">'+RAIL_I.auto+'</span>'
  +   '<span class="rn-util-name mono">Auto-hide '+(railHoverMode?'ON':'OFF')+'</span></div>';
}

/* The 12 former Resources tabs — all route through openRes()+showResTab(). */
var RAIL_RES_TABS={roster:1,plan:1,timeline:1,skills:1,skillrisk:1,heatmap:1,ninebox:1,disc:1,profiles:1,development:1,analytics:1,dashboard:1,portfolio:1,econ:1,exec:1,gate:1,pipeline:1,engagement:1,backlog:1};

// Close every full-screen overlay, revealing the base matrix canvas.
// Reuses each overlay's own closer (verified in nav.js/org.js/overlays.js/persist.js).
function closeAllOverlays(){
  if(typeof closeRes==='function')      closeRes();
  if(typeof closeOrgChart==='function') closeOrgChart();
  if(typeof closeCompare==='function')  closeCompare();
  if(typeof closeSummary==='function')  closeSummary();
  if(typeof closeSnap==='function')     closeSnap();
  if(typeof closeHelp==='function')     closeHelp();
  if(typeof closeCharterHub==='function') closeCharterHub();
  if(typeof chtClose==='function')          chtClose();
  if(typeof chtCloseDecision==='function')  chtCloseDecision();
  if(typeof closeDtc==='function')        closeDtc();
  if(typeof closeChannels==='function')   closeChannels();
  if(typeof closeBrief==='function')      closeBrief();
  if(typeof closeHome==='function')       closeHome();
}

// Open the Resources overlay (if not already) and switch to the given tab.
// Closes the OTHER full-screen overlays first so only Resources is visible.
function railOpenRes(tab){
  if(typeof closeOrgChart==='function') closeOrgChart();
  if(typeof closeCompare==='function')  closeCompare();
  if(typeof closeSummary==='function')  closeSummary();
  if(typeof closeSnap==='function')     closeSnap();
  if(typeof closeHelp==='function')     closeHelp();
  if(typeof closeCharterHub==='function') closeCharterHub();
  if(typeof chtClose==='function')          chtClose();
  if(typeof chtCloseDecision==='function')  chtCloseDecision();
  if(typeof closeDtc==='function')        closeDtc();
  if(typeof closeChannels==='function')   closeChannels();
  if(typeof closeBrief==='function')      closeBrief();
  if(typeof closeHome==='function')       closeHome();
  if(!G('res-overlay').classList.contains('show')) openRes();
  showResTab(tab);
}

// Dispatch a view id to its existing surface. Every target verified against source.
function railRoute(viewId){
  if(RAIL_RES_TABS[viewId]){ railOpenRes(viewId); return; }
  closeAllOverlays();                       // org/summary/compare/matrix = single surface
  if(viewId==='matrix')       return;       // base canvas now revealed
  else if(viewId==='home')    openHome();
  else if(viewId==='org')     openOrgChart();
  else if(viewId==='summary') openSummary();
  else if(viewId==='compare') openCompare();
  else if(viewId==='charters')chtOpenFinancials();
  else if(viewId==='decision')chtOpenDecisionView();
  else if(viewId==='dtc')     openDtc();
  else if(viewId==='channels')openChannelsView();
  else if(viewId==='brief')   openProjectBriefExport();
}

/* Router. VIEWS set activeView + change the visible surface; ACTIONS just fire. */
function railGo(ev,viewId){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  var dom=railDomainFor(viewId); if(!dom) return;
  var view=dom.views.find(function(x){return x.id===viewId;});
  if(view&&view.action){ railAction(viewId); return; }   // action-only rail items (none in WORK now)
  if(!railBackNav && activeView && activeView!==viewId){ railNavStack.push(activeView); if(railNavStack.length>60) railNavStack.shift(); }
  activeView=viewId;
  railHideFly();
  if(railPinned&&window.innerWidth<=640) railTogglePin();
  railRouting=true;             // suppress the overlay-close→'matrix' sync during nav
  try{ railRoute(viewId); }
  finally{ railRouting=false; railRender(); railUpdateCrumb(); }  // never leave the guard stuck
  if(typeof collabPublishPresence==='function') collabPublishPresence();   // tell teammates which page I moved to (live presence)
}

/* ← Back: dismiss the current rail VIEW panel by navigating to the previous view
   (the router closes whatever overlay is open). Replaces the old ✕-closes-to-matrix
   on every view panel so drilling into a tab and coming back is one consistent move.
   Falls back to the Settings landing page, else the matrix, when history is empty. */
function railBack(){
  var cur=activeView, prev=null;
  while(railNavStack.length){ var c=railNavStack.pop(); if(c && c!==cur){ prev=c; break; } }
  if(!prev) prev=(railLanding && railLanding!==cur) ? railLanding : 'matrix';
  railBackNav=true;
  try{ railGo(null,prev); } finally{ railBackNav=false; }
}
// Esc mirrors the ← Back button, but ONLY when a rail view overlay is the visible
// surface (so Esc on the bare matrix, or over a modal, doesn't teleport you).
var RAIL_VIEW_OVERLAYS=['res-overlay','org-overlay','compare-overlay','summary-overlay',
  'cht-overlay','dec-overlay','chthub-overlay','dtc-overlay','chan-overlay','brief-overlay'];
function railEscMaybeBack(){
  // A view overlay counts as visible if it carries the .show class OR (like the org
  // chart) is shown via an inline display:flex — checking only .show missed org, so
  // Esc did not go back from the org chart.
  var open=RAIL_VIEW_OVERLAYS.some(function(id){ var e=G(id);
    return e && (e.classList.contains('show') || (e.style && e.style.display && e.style.display!=='none')); });
  if(open) railBack();
}
// Modal/popup overlays that can sit ON TOP of a view — Esc must dismiss these
// first (and NOT navigate back) so e.g. closing an ID card keeps you on the roster.
var RAIL_MODAL_OVERLAYS=['help-overlay','q-panel','add-overlay','add-modal','settings-overlay',
  'rail-layout-overlay','landing-firstrun','cht-deck-overlay','cht-syn-overlay','snap-overlay','alloc-ctx',
  'skills-modal-overlay','idcard-modal-overlay','org-kpi-panel','org-arrow-ctx','focus-panel',
  'export-builder-overlay','export-picker-overlay'];
function railAnyModalOpen(){
  return RAIL_MODAL_OVERLAYS.some(function(id){ var e=G(id); return e && e.classList.contains('show'); });
}

// Fire an action (does NOT change activeView). Targets verified against source.
function railAction(id){
  railHideFly();
  if(railPinned&&window.innerWidth<=640) railTogglePin();
  if(id==='export')        exportOpenPicker();
  else if(id==='collab')   collabOpen();
  else if(id==='snap')     openSnap();
  else if(id==='backup')   exportFullBackup();
  else if(id==='restore')  importFullBackup();
  else if(id==='ai')       aiOpenChat();
  else if(id==='settings') railOpenSettings();
  else if(id==='help')     openHelp();
}

// collapsed: tap toggles the flyout · pinned: expand accordion + go to first view
function railDomClick(ev,domId,el){
  ev.stopPropagation();
  var dom=railDomainFor2(domId);
  if(railIsOpen()){ if(dom&&dom.views[0]) railGo(ev,dom.views[0].id); return; }
  if(railFlyDom===domId){ railHideFly(); } else { railFlyEnter(domId,el.parentElement,true); }
}
// domain lookup by domain id (distinct from railDomainFor which takes a view id)
function railDomainFor2(domId){ return RAIL_DOMAINS.find(function(d){return d.id===domId;})||null; }

/* ══ PAGE DRAG-REORDER + CROSS-DOMAIN MOVE ═════════════════════════════
   Native HTML5 DnD on the .rn-sub rows. A plain click still navigates (a
   click has no drag movement). Dropping a page:
     • onto a .rn-sub in the SAME domain  → reorders within that domain
     • onto a .rn-sub in ANOTHER domain   → moves it there, next to that page
     • onto a .rn-dom-head                → moves it to the END of that domain
   Only the ACTIVE domain shows its pages (others are collapsed), so the
   domain-head is the drop target for moving a page into a collapsed domain.
   Order lives in railViewOrder, the home-domain override in railViewDomain;
   both persist. Re-render happens ONLY on drop (a mid-drag railRender wipes
   innerHTML and would kill the drag). */
function railClearDropMarks(){
  if(!railScrollEl) return;
  var m=railScrollEl.querySelectorAll('.rn-drop-before,.rn-drop-after,.rn-dragging,.rn-drop-into');
  for(var i=0;i<m.length;i++) m[i].classList.remove('rn-drop-before','rn-drop-after','rn-dragging','rn-drop-into');
}
function railSubDragStart(ev,domId,viewId){
  railDragDom=domId; railDragView=viewId; railDragging=true;
  try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',viewId); }catch(e){}
  if(ev.currentTarget&&ev.currentTarget.classList) ev.currentTarget.classList.add('rn-dragging');
}
function railSubDragOver(ev,domId){
  if(!railDragging) return;                    // only react to an in-flight page drag
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  var el=ev.currentTarget; if(!el||el===railScrollEl) return;
  var r=el.getBoundingClientRect(), after=(ev.clientY-r.top)>r.height/2;
  railClearDropMarks();
  el.classList.add(after?'rn-drop-after':'rn-drop-before');
}
function railSubDragLeave(ev){ if(ev.currentTarget&&ev.currentTarget.classList) ev.currentTarget.classList.remove('rn-drop-before','rn-drop-after'); }
function railSubDrop(ev,domId,targetId){
  ev.preventDefault(); ev.stopPropagation();
  if(railDragView && railDragView!==targetId){
    var r=ev.currentTarget.getBoundingClientRect(), after=(ev.clientY-r.top)>r.height/2;
    railMoveView(railDragView,domId,targetId,after);   // same- or cross-domain
  }
  railClearDropMarks();
}
function railSubDragEnd(){ railDragging=false; railDragDom=null; railDragView=null; railClearDropMarks(); }

// Domain-head drop target — lets a page be moved INTO a (usually collapsed)
// domain, landing at its end. Highlights the whole domain while hovering.
function railDomDragOver(ev,domId){
  if(!railDragging) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  railClearDropMarks();
  var dom=ev.currentTarget&&ev.currentTarget.parentElement;
  if(dom&&dom.classList) dom.classList.add('rn-drop-into');
}
function railDomDragLeave(ev){
  var dom=ev.currentTarget&&ev.currentTarget.parentElement;
  if(dom&&dom.classList) dom.classList.remove('rn-drop-into');
}
function railDomDrop(ev,domId){
  ev.preventDefault(); ev.stopPropagation();
  if(railDragView) railMoveView(railDragView,domId,null,false);   // append to domain end
  railClearDropMarks();
}

// Move a page to toDomId, positioned next to targetId (or appended when targetId
// is null). Records the home-domain override when it crosses domains, rebuilds the
// layout so the page is now in toDom, then splices it to the exact drop position and
// persists the resulting order for both the source and target domains. Handles the
// same-domain case too (reorder), so it's the single mutation path for the DnD.
function railMoveView(dragId,toDomId,targetId,after){
  if(!railDomainFor2(toDomId)) return;
  var fromDomId=railEffectiveDom(dragId);
  if(fromDomId!==toDomId) railViewDomain[dragId]=toDomId;   // cross-domain: pin new home
  railApplyLayout();                                        // re-place dragId into toDom
  var views=railDomainFor2(toDomId).views;
  var from=views.findIndex(function(v){return v.id===dragId;});
  if(from<0) return;
  var moved=views.splice(from,1)[0];
  var to=targetId?views.findIndex(function(v){return v.id===targetId;}):-1;
  if(to<0) views.push(moved);                               // no/vanished target → end
  else     views.splice(after?to+1:to,0,moved);
  railViewOrder[toDomId]=views.map(function(v){return v.id;});
  if(fromDomId&&fromDomId!==toDomId){                       // keep the source order truthful
    var src=railDomainFor2(fromDomId);
    if(src) railViewOrder[fromDomId]=src.views.map(function(v){return v.id;});
  }
  railDragging=false; railDragDom=null; railDragView=null;  // render below removes the drag node
  railSavePrefs();
  railRender();
}

// pin (open, labelled accordion) / collapse (icon strip)
function railTogglePin(){
  railPinned=!railPinned;
  railHoverOpen=false;                       // pin overrides the transient hover state
  railApplyOpen();
  if(railScrimEl) railScrimEl.classList.toggle('show',railPinned&&window.innerWidth<=640);
  railHideFly(); railRender();
}

// show the flyout listing a domain's views (hover or tap; collapsed rail only)
function railFlyEnter(domId,el,fromTap){
  if(railIsOpen()||!railFlyoutEl) return;   // panel already open → no per-domain flyout
  clearTimeout(railFlyTimer); railFlyDom=domId;
  var d=railDomainFor2(domId); if(!d) return;
  var rect=el.getBoundingClientRect();
  railFlyoutEl.innerHTML='<div class="rn-fly-title mono">'+d.name+'</div>'+d.views.map(function(v){
    var on=v.id===activeView&&!v.action;
    return '<div class="rn-fly-item'+(on?' active':'')+'" onclick="railGo(event,\''+v.id+'\')">'
         + '<span>'+v.label+'</span>'+(v.bdg?'<span class="rn-bdg">'+v.bdg+'</span>':'')+'</div>';
  }).join('');
  var top=Math.max(8,Math.min(rect.top,window.innerHeight-((d.views.length+1)*38+20)));
  railFlyoutEl.style.top=top+'px';
  railFlyoutEl.classList.add('show');
}
// delayed hide (lets the pointer travel from icon to flyout)
function railFlyLeave(){ railFlyTimer=setTimeout(railHideFly,200); }
// hide the flyout immediately
function railHideFly(){ if(railFlyoutEl) railFlyoutEl.classList.remove('show'); railFlyDom=null; }

// refresh the DOMAIN › View breadcrumb in #topbar (guarded if not present)
function railUpdateCrumb(){
  var cd=G('crumb-dom'), cv=G('crumb-view');
  if(!cd||!cv) return;
  var dom=railDomainFor(activeView);
  var view=dom?dom.views.find(function(x){return x.id===activeView;}):null;
  cd.textContent=dom?dom.name:'';
  cv.textContent=view?view.label:'';
}

/* ══ SETTINGS + FIRST-RUN LANDING ══════════════════════════════════════ */

// Populate + open the Settings modal (default landing + auto-hide rail).
function railOpenSettings(){
  var sel=G('set-landing');
  if(sel){
    var cur=railLanding||'roster';
    sel.innerHTML=RAIL_DOMAINS.map(function(d){
      var opts=d.views.filter(function(v){return !v.action;}).map(function(v){
        return '<option value="'+v.id+'"'+(v.id===cur?' selected':'')+'>'+v.label+'</option>';
      }).join('');
      return '<optgroup label="'+d.name+'">'+opts+'</optgroup>';
    }).join('');
  }
  var lg=G('set-lang');
  if(lg){
    var cl=i18nGetLang();
    lg.innerHTML=I18N_LANGS.map(function(l){
      return '<option value="'+l.code+'"'+(l.code===cl?' selected':'')+'>'+l.label+'</option>';
    }).join('');
  }
  var ah=G('set-autohide'); if(ah) ah.checked=railHoverMode;
  var cp=G('set-chartpicker'); if(cp) cp.value=railChartPicker();
  var bs=G('set-badgescope'); if(bs) bs.value=railBadgeScopeGet();
  var rw=G('set-railwidth'); if(rw){ rw.min=RAIL_W_MIN; rw.max=RAIL_W_MAX; rw.value=railClampWidth(railWidth); }
  var rwv=G('set-railwidth-val'); if(rwv) rwv.textContent=railClampWidth(railWidth)+'px';
  var sbz=G('set-scrollbar'); if(sbz) sbz.value=railScrollbar;
  var ep0=exportLoadPrefs();
  var et=G('set-export-theme'); if(et) et.value=ep0.theme;
  var eo=G('set-export-org'); if(eo) eo.value=ep0.orgName||'';
  _railExportLogo=ep0.logo||'';
  railRenderExportLogo();
  var ov=G('settings-overlay'); if(ov) ov.classList.add('show');
}

/* Export branding (org name + logo). exportBrand() has read prefs.orgName and
 * prefs.logo since the engine landed, but nothing ever WROTE them — so every
 * export in the product was stamped with the hardcoded 'Project Matrix'
 * fallback and the white-label seam was effectively dead code. This is the
 * missing half. Staged in a module var so CANCEL genuinely cancels; only
 * railSaveSettings persists it. Same UI-only tier as the export theme (see
 * export.js EXPORT_PREFS_KEY) — deliberately NOT app state, so branding never
 * travels in a backup or into a collab room. */
var RAIL_LOGO_MAX=200*1024;
var _railExportLogo='';
function railRenderExportLogo(){
  var img=G('set-export-logo-prev'), clr=G('set-export-logo-clear');
  if(img){
    if(_railExportLogo){ img.src=_railExportLogo; img.style.display=''; }
    else { img.removeAttribute('src'); img.style.display='none'; }
  }
  if(clr) clr.style.display=_railExportLogo?'':'none';
}
function railPickExportLogo(){ var i=G('set-export-logo-input'); if(i) i.click(); }
function railClearExportLogo(){ _railExportLogo=''; railRenderExportLogo(); }
function railLoadExportLogo(input){
  var f=input&&input.files&&input.files[0]; if(!f) return;
  // The logo is inlined as a dataURL into every exported document AND into the
  // prefs key, so localStorage's quota is the real ceiling here, not aesthetics.
  if(f.size>RAIL_LOGO_MAX){ alert(t('Logo is too large — use an image under 200 KB.')); input.value=''; return; }
  var rd=new FileReader();
  rd.onload=function(){ _railExportLogo=String(rd.result||''); railRenderExportLogo(); };
  rd.onerror=function(){ alert(t('Could not read that image.')); };
  rd.readAsDataURL(f);
  input.value='';
}

// Read the Settings modal, persist, apply, and close.
function railSaveSettings(){
  var sel=G('set-landing'), ah=G('set-autohide'), rw=G('set-railwidth'), cp=G('set-chartpicker');
  if(sel&&sel.value) railLanding=sel.value;
  if(ah) railHoverMode=ah.checked;
  if(cp&&cp.value) railChartMode=(cp.value==='dropdown'?'dropdown':'hub');
  var bs=G('set-badgescope'); if(bs&&bs.value) railBadgeScope=(bs.value==='tasks'?'tasks':'all');
  var sbz=G('set-scrollbar'); if(sbz&&RAIL_SB[sbz.value]) railScrollbar=sbz.value;
  var et=G('set-export-theme'), eo=G('set-export-org');
  var ep=exportLoadPrefs();
  if(et) ep.theme=(et.value==='light'?'light':'app');
  if(eo) ep.orgName=eo.value.trim();
  ep.logo=_railExportLogo;
  exportSavePrefs(ep);
  if(rw) railWidth=railClampWidth(rw.value);
  railApplyWidth();
  railApplyScrollbar();
  railSavePrefs();
  var ov=G('settings-overlay'); if(ov) ov.classList.remove('show');
  railRender();   // reflect the auto-hide change on the foot toggle
  // Language last: i18nSetLang reloads if it changed (every other pref is
  // already persisted above, so the reload loses nothing).
  var lg=G('set-lang'); if(lg&&lg.value) i18nSetLang(lg.value);
}
// Cancel Settings — revert any live width preview back to the saved value.
function railCancelSettings(){
  railApplyWidth();
  var ov=G('settings-overlay'); if(ov) ov.classList.remove('show');
}

// First-run: ask which view to open on (once). Falls back to 'roster' surface now.
function railFirstRunLanding(){
  var ov=G('landing-firstrun');
  if(ov){ ov.classList.add('show'); }
  else  { railGo(null,'roster'); }   // no chooser markup → just land on roster
}

// User picked a default landing in the first-run chooser: store it + go there.
function railChooseLanding(viewId){
  railLanding=viewId;
  railSavePrefs();
  var ov=G('landing-firstrun'); if(ov) ov.classList.remove('show');
  railGo(null,viewId);
}

/* ══ OVERLAY-CLOSE SYNC ════════════════════════════════════════════════
   When a VIEW overlay is dismissed by its own ✕ button or Esc (not by rail
   navigation), reset the rail to the base matrix surface so the highlight +
   breadcrumb stay truthful. Wraps the existing closers once at load; the
   railRouting guard prevents this firing during rail-driven navigation.
   (Action overlays — snap/help — never change activeView, so they are
   intentionally NOT wrapped.) */
(function railWrapClosers(){
  ['closeRes','closeOrgChart','closeCompare','closeSummary','closeCharterHub','closeDtc','closeBrief'].forEach(function(name){
    var orig=window[name];
    if(typeof orig!=='function') return;
    window[name]=function(){
      var r=orig.apply(this,arguments);
      if(!railRouting && activeView!=='matrix'){
        activeView='matrix';
        if(typeof railRender==='function')      railRender();
        if(typeof railUpdateCrumb==='function') railUpdateCrumb();
      }
      return r;
    };
  });
})();
