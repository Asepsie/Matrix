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
  team:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.1"/><path d="M3.6 19c0-3 2.4-5 5.4-5s5.4 2 5.4 5"/><path d="M16 5.6a3 3 0 0 1 0 5.6"/><path d="M17.2 14c2.1.5 3.4 2.2 3.4 4.4"/></svg>',
  work:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/></svg>',
  skills:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="6.6" height="6.6" rx="1.4"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.4"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.4"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.4"/></svg>',
  talent:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-8.5"/><path d="M12 12.5C11.4 9.6 8.9 8 5.9 8c.1 3 2.5 4.9 6.1 4.5z"/><path d="M12 11.5c.5-2.6 2.7-4 5.6-4-.1 2.8-2.3 4.3-5.6 4z"/></svg>',
  insights:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="12" width="3.6" height="7.5" rx="1"/><rect x="10.2" y="6" width="3.6" height="13.5" rx="1"/><rect x="16.4" y="9" width="3.6" height="10.5" rx="1"/></svg>',
  snap:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/></svg>',
  backup:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 4.2v8.6L12 20l-7.5-4.2V7.2z"/><path d="M4.8 7.4L12 11.5l7.2-4.1"/><path d="M12 11.5V20"/></svg>',
  restore:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v3.4h3.4"/></svg>',
  ai:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="2.6"/><path d="M10 3v2.4M14 3v2.4M10 18.6V21M14 18.6V21M3 10h2.4M3 14h2.4M18.6 10H21M18.6 14H21"/></svg>',
  help:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.8.3-1.3.9-1.3 1.9"/><circle cx="11.6" cy="16.6" r="0.7" fill="currentColor" stroke="none"/></svg>',
  auto:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  settings:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  pin:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  pinOpen:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  chev:'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
};

/* ── Domain → view map. Every view id routes through railGo (Phase 2).
   Targets verified against real source: res-tabs go via openRes()+showResTab();
   org/summary/compare/matrix have their own openers. `action:true` items fire a
   function without changing activeView. ID cards & Succession are deliberately
   NOT rail views (modal / org sub-feature). ── */
var RAIL_DOMAINS = [
  { id:'team', name:'TEAM', ico:RAIL_I.team, views:[
    {id:'roster',      label:'Roster'},
    {id:'org',         label:'Org chart'},
  ]},
  { id:'work', name:'WORK', ico:RAIL_I.work, views:[
    {id:'matrix',      label:'Portfolio matrix', bdg:'was home'},
    {id:'plan',        label:'Resource plan'},
    {id:'timeline',    label:'Timeline'},
    {id:'charters',    label:'Financials analysis'},
    {id:'decision',    label:'Trade-off decision'},
    {id:'dtc',         label:'Design to cost'},
    {id:'brief',       label:'Project brief'},
  ]},
  { id:'skills', name:'SKILLS', ico:RAIL_I.skills, views:[
    {id:'skills',      label:'Skills matrix'},
    {id:'skillrisk',   label:'Skill risk', bdg:'SPOF'},
    {id:'heatmap',     label:'Heatmap'},
  ]},
  { id:'talent', name:'TALENT', ico:RAIL_I.talent, views:[
    {id:'ninebox',     label:'Nine-box'},
    {id:'disc',        label:'DISC'},
    {id:'profiles',    label:'Team profiles'},
    {id:'development', label:'Development'},
  ]},
  { id:'insights', name:'INSIGHTS', ico:RAIL_I.insights, views:[
    {id:'portfolio',   label:'Portfolio analytics'},
    {id:'analytics',   label:'People analytics'},
    {id:'summary',     label:'Summary'},
    {id:'dashboard',   label:'Cost dashboard'},
    {id:'compare',     label:'Compare'},
  ]},
];

/* ── Utility foot — all ACTIONS (fire & forget; never change activeView) ── */
var RAIL_UTIL = [
  {id:'snap',     name:'Snapshots', ico:RAIL_I.snap},
  {id:'backup',   name:'Backup',    ico:RAIL_I.backup},
  {id:'restore',  name:'Restore',   ico:RAIL_I.restore},
  {id:'ai',       name:'AI advisor',ico:RAIL_I.ai},
  {id:'settings', name:'Settings',  ico:RAIL_I.settings},
  {id:'help',     name:'Help',      ico:RAIL_I.help},
];

/* ── Module state (rail-prefixed; unique across the flat bundle) ── */
var railPinned=false;        // locked open via the pin button (survives mouse-leave)
var railHoverMode=true;      // hover-drawer: open on pointer-over, auto-hide on leave (persisted)
var railHoverOpen=false;     // transient hover expansion (not pinned)
var railLanding=null;        // stored default landing view id; null = first run (persisted)
var railRouting=false;       // true while railGo/railRoute is switching surfaces
var railWidth=58;            // collapsed rail width (px, persisted, clamped)
var railChartMode='hub';     // charter project picker: 'hub' (card grid) | 'dropdown' (persisted)
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
              if(p.railWidth!=null)             railWidth=railClampWidth(p.railWidth); } }catch(e){}
}
// persist rail UI prefs
function railSavePrefs(){
  try{ localStorage.setItem(RAIL_PREFS_KEY,JSON.stringify({hoverMode:railHoverMode,landing:railLanding,railWidth:railWidth,chartPicker:railChartMode})); }catch(e){}
}
// Charter project-picker mode accessor (read by charter.js). 'hub' | 'dropdown'.
function railChartPicker(){ return railChartMode==='dropdown' ? 'dropdown' : 'hub'; }
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
  if(railPinBtn) railPinBtn.innerHTML=RAIL_I.pin;
  railRender();
  // Hover-drawer: pointer over the always-visible rail expands it; leaving
  // auto-collapses it (unless pinned). Toggle via the foot "Auto-hide" control.
  railEl.addEventListener('mouseenter',function(){
    if(railHoverMode&&!railPinned&&!railHoverOpen){ railHoverOpen=true; railHideFly(); railApplyOpen(); railRender(); }
  });
  railEl.addEventListener('mouseleave',function(){
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
      return '<div class="rn-sub'+(on?' active':'')+'" onclick="railGo(event,\''+v.id+'\')">'
           + v.label+(v.bdg?'<span class="rn-bdg">'+v.bdg+'</span>':'')+'</div>';
    }).join('');
    return '<div class="rn-dom'+(holds?' active-dom':'')+(exp?' exp':'')+'" data-dom="'+d.id+'"'
         + ' onmouseenter="railFlyEnter(\''+d.id+'\',this)" onmouseleave="railFlyLeave()">'
         + '<div class="rn-dom-head" onclick="railDomClick(event,\''+d.id+'\',this)">'
         +   '<span class="rn-dom-ico">'+d.ico+'</span>'
         +   '<span class="rn-dom-name mono">'+d.name+'</span>'
         +   '<span class="rn-dom-chev">'+RAIL_I.chev+'</span>'
         + '</div><div class="rn-subs">'+subs+'</div></div>';
  }).join('');
  railFootEl.innerHTML=RAIL_UTIL.map(function(u){
    return '<div class="rn-util" onclick="railAction(\''+u.id+'\')" title="'+u.name+'">'
         + '<span class="rn-util-ico">'+u.ico+'</span>'
         + '<span class="rn-util-name mono">'+u.name+'</span></div>';
  }).join('')
  + '<div class="rn-mode-sep"></div>'
  + '<div class="rn-util rn-mode'+(railHoverMode?' on':'')+'" onclick="railToggleHoverMode()"'
  + ' title="Auto-hide: open the rail when the pointer is over it, collapse it when the pointer leaves">'
  +   '<span class="rn-util-ico">'+RAIL_I.auto+'</span>'
  +   '<span class="rn-util-name mono">Auto-hide '+(railHoverMode?'ON':'OFF')+'</span></div>';
}

/* The 12 former Resources tabs — all route through openRes()+showResTab(). */
var RAIL_RES_TABS={roster:1,plan:1,timeline:1,skills:1,skillrisk:1,heatmap:1,ninebox:1,disc:1,profiles:1,development:1,analytics:1,dashboard:1,portfolio:1};

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
  if(typeof closeBrief==='function')      closeBrief();
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
  if(typeof closeBrief==='function')      closeBrief();
  if(!G('res-overlay').classList.contains('show')) openRes();
  showResTab(tab);
}

// Dispatch a view id to its existing surface. Every target verified against source.
function railRoute(viewId){
  if(RAIL_RES_TABS[viewId]){ railOpenRes(viewId); return; }
  closeAllOverlays();                       // org/summary/compare/matrix = single surface
  if(viewId==='matrix')       return;       // base canvas now revealed
  else if(viewId==='org')     openOrgChart();
  else if(viewId==='summary') openSummary();
  else if(viewId==='compare') openCompare();
  else if(viewId==='charters')chtOpenFinancials();
  else if(viewId==='decision')chtOpenDecisionView();
  else if(viewId==='dtc')     openDtc();
  else if(viewId==='brief')   openProjectBriefExport();
}

/* Router. VIEWS set activeView + change the visible surface; ACTIONS just fire. */
function railGo(ev,viewId){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  var dom=railDomainFor(viewId); if(!dom) return;
  var view=dom.views.find(function(x){return x.id===viewId;});
  if(view&&view.action){ railAction(viewId); return; }   // action-only rail items (none in WORK now)
  activeView=viewId;
  railHideFly();
  if(railPinned&&window.innerWidth<=640) railTogglePin();
  railRouting=true;             // suppress the overlay-close→'matrix' sync during nav
  try{ railRoute(viewId); }
  finally{ railRouting=false; railRender(); railUpdateCrumb(); }  // never leave the guard stuck
}

// Fire an action (does NOT change activeView). Targets verified against source.
function railAction(id){
  railHideFly();
  if(railPinned&&window.innerWidth<=640) railTogglePin();
  if(id==='snap')          openSnap();
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
  var ah=G('set-autohide'); if(ah) ah.checked=railHoverMode;
  var cp=G('set-chartpicker'); if(cp) cp.value=railChartPicker();
  var rw=G('set-railwidth'); if(rw){ rw.min=RAIL_W_MIN; rw.max=RAIL_W_MAX; rw.value=railClampWidth(railWidth); }
  var rwv=G('set-railwidth-val'); if(rwv) rwv.textContent=railClampWidth(railWidth)+'px';
  var ov=G('settings-overlay'); if(ov) ov.classList.add('show');
}

// Read the Settings modal, persist, apply, and close.
function railSaveSettings(){
  var sel=G('set-landing'), ah=G('set-autohide'), rw=G('set-railwidth'), cp=G('set-chartpicker');
  if(sel&&sel.value) railLanding=sel.value;
  if(ah) railHoverMode=ah.checked;
  if(cp&&cp.value) railChartMode=(cp.value==='dropdown'?'dropdown':'hub');
  if(rw) railWidth=railClampWidth(rw.value);
  railApplyWidth();
  railSavePrefs();
  var ov=G('settings-overlay'); if(ov) ov.classList.remove('show');
  railRender();   // reflect the auto-hide change on the foot toggle
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
