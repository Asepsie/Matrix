/* ►► SECTION: PROJECT WORKSPACE ◄◄ PORTFOLIO › Project workspace rail view.
 *
 * ONE rail-inset overlay (#wk-overlay, left:var(--rail), z400) that MERGES the
 * four former per-project charter panels into a single tabbed shell:
 *   OVERVIEW · DEMANDS · FINANCIALS · TRADE-OFF · CHANNELS · DESIGN-TO-COST.
 * A shared project picker at the top drives ONE selected project (_chtProjId,
 * owned by charter.js); every tab re-uses the existing per-panel body renderer
 * UNCHANGED — the charter sub-tabs render into #cht-body via chtShowTab, the
 * trade-off into #dec-body via chtRenderDecision, channels via chanRender, and
 * design-to-cost via dtcRender. The four standalone overlays are gone; their
 * body <div>s live inside #wk-body now.
 *
 * The task spec listed five tabs (Overview · Financials · Trade-off · Channels ·
 * Design-to-cost); DEMANDS is added as a sixth because the charter Demands board
 * (conflicts) cannot be dropped and each tab maps 1:1 to one reused body render.
 *
 * Everything here is `wk`/`WK_`-prefixed (flat-bundle uniqueness). _chanProjId
 * and _dtcProjId (channels.js / dtc.js) are kept in lockstep with _chtProjId so
 * their renderers read the same project as the one shared picker.
 *
 *   openWorkspace()        — rail entry ('workspace' view)
 *   wkOpen(tab, projId)    — open on a given tab (the redirect target for the
 *                            former openCharter/chtOpenDecision/openChannels/openDtc)
 *   wkShowTab(tab)         — switch tab and render its body
 *   wkSelectProject(id)    — change the shared project + re-render the active tab
 *   closeWorkspace()       — hide the shell (syncs the rail highlight)
 */

// Tab registry: id → label. The first three (overview/demands/financials) render
// the charter into #cht-body via chtShowTab; the rest map to their own bodies.
var WK_TABS = [
  ['overview',   'OVERVIEW'],
  ['demands',    'DEMANDS'],
  ['financials', 'FINANCIALS'],
  ['decision',   'TRADE-OFF'],
  ['channels',   'CHANNELS'],
  ['dtc',        'DESIGN-TO-COST'],
];
// The charter sub-tabs (rendered into #cht-body by chtShowTab). Their header also
// carries the PRIORITY/STATUS editors (#cht-head-meta via chtRenderHeader).
var WK_CHT_TABS = { overview:1, demands:1, financials:1 };
var _wkTab = 'overview';   // last active tab (remembered across opens)

// The visible body <div> id for a tab (each renderer targets its own container).
function wkBodyId(tab){
  if(WK_CHT_TABS[tab]) return 'cht-body';
  if(tab==='decision') return 'dec-body';
  if(tab==='channels') return 'chan-body';
  return 'dtc-body';
}

// Default project id: keep the current one if it's a live, non-archived project,
// else the first non-archived project, else the first project, else null.
function wkDefaultProj(){
  if(typeof _chtProjId!=='undefined' && _chtProjId!=null){
    var cur=projects.find(function(p){return p.id===_chtProjId;});
    if(cur && ((typeof projIsArchived!=='function')||!projIsArchived(cur))) return cur.id;
  }
  var live=projects.find(function(p){return (typeof projIsArchived!=='function')||!projIsArchived(p);});
  if(live) return live.id;
  return projects.length ? projects[0].id : null;
}

// Sync the sibling per-panel selection vars to the one shared picker so their
// renderers (chanRender/dtcRender) read the SAME project.
function wkSyncIds(){
  if(typeof _chanProjId!=='undefined') _chanProjId=_chtProjId;
  if(typeof _dtcProjId!=='undefined')  _dtcProjId =_chtProjId;
}

// ── open / close ─────────────────────────────────────────────────────────────
// Rail entry point (PORTFOLIO › Project workspace).
function openWorkspace(){ wkOpen(_wkTab||'overview', null); }

// Open the shell on `tab` for `projId` (or the current/default project). This is
// the redirect target for the former panel openers, so deep-links land on the
// right tab. Sets activeView='workspace' so the rail highlight stays truthful.
function wkOpen(tab, projId){
  var ov=G('wk-overlay'); if(!ov) return;
  var id = (projId!=null && projId!=='') ? +projId : wkDefaultProj();
  _chtProjId = id;
  var p = projects.find(function(x){return x.id===_chtProjId;});
  if(p && (!p.charter || typeof p.charter!=='object')) p.charter=makeCharter();
  wkSyncIds();
  if(typeof activeView!=='undefined') activeView='workspace';
  ov.classList.add('show');
  wkRenderPicker();
  wkShowTab(tab || _wkTab || 'overview');
  if(typeof railRender==='function')      railRender();
  if(typeof railUpdateCrumb==='function') railUpdateCrumb();
  if(typeof collabPublishPresence==='function') collabPublishPresence();   // broadcast "editing this project"
}

function closeWorkspace(){
  var ov=G('wk-overlay'); if(ov) ov.classList.remove('show');
  if(typeof chtSyncRailAfterClose==='function') chtSyncRailAfterClose();
  if(typeof collabPublishPresence==='function') collabPublishPresence();   // clear my "editing" focus
}

// ── shared project picker ────────────────────────────────────────────────────
// A single <select> of every non-archived project (keeps the current one even if
// archived, so you can still view it). Writes _chtProjId via wkSelectProject.
function wkRenderPicker(){
  var slot=G('wk-pick'); if(!slot) return;
  var pickable = projects.filter(function(p){ return (typeof projIsArchived!=='function')||!projIsArchived(p)||p.id===_chtProjId; });
  slot.innerHTML = '<label class="cht-hl">PROJECT</label>'
    + '<select class="cht-sel" onchange="wkSelectProject(this.value)">'
    + (pickable.length
        ? pickable.map(function(p){
            var arch=(typeof projIsArchived==='function'&&projIsArchived(p)) ? ' ('+escH(t('archived'))+')' : '';
            return '<option value="'+p.id+'"'+(p.id===_chtProjId?' selected':'')+'>'+escH(p.name||'Untitled project')+arch+'</option>';
          }).join('')
        : '<option>— no projects —</option>')
    + '</select>';
}

// Change the shared project and re-render the active tab (+ picker selection).
function wkSelectProject(id){
  _chtProjId = (id!=null && id!=='') ? +id : null;
  var p = projects.find(function(x){return x.id===_chtProjId;});
  if(p && (!p.charter || typeof p.charter!=='object')) p.charter=makeCharter();
  wkSyncIds();
  wkRenderPicker();
  wkShowTab(_wkTab);
  if(typeof collabPublishPresence==='function') collabPublishPresence();
}

// ── tab bar + body switching ─────────────────────────────────────────────────
function wkRenderTabs(){
  var host=G('wk-tabs'); if(!host) return;
  host.innerHTML = WK_TABS.map(function(pair){
    var id=pair[0], label=pair[1];
    return '<div class="cht-tab'+(_wkTab===id?' active':'')+'" onclick="wkShowTab(\''+id+'\')">'+label+'</div>';
  }).join('');
}

function wkShowTab(tab){
  _wkTab = tab;
  wkRenderTabs();
  // Show only the active tab's body <div>; hide the others.
  ['cht-body','dec-body','chan-body','dtc-body'].forEach(function(bid){
    var el=G(bid); if(el) el.style.display = (bid===wkBodyId(tab)) ? '' : 'none';
  });
  // PRIORITY/STATUS meta belongs to the charter sub-tabs only.
  var meta=G('cht-head-meta');
  if(meta) meta.style.display = WK_CHT_TABS[tab] ? '' : 'none';
  wkRenderActiveBody();
  if(typeof collabPublishPresence==='function') collabPublishPresence();
}

// Render the CURRENT tab's body via its existing (unchanged) renderer.
function wkRenderActiveBody(){
  var tab=_wkTab;
  wkSyncIds();
  if(WK_CHT_TABS[tab]){
    if(typeof chtRenderHeader==='function') chtRenderHeader();   // PRIORITY/STATUS
    if(typeof chtShowTab==='function') chtShowTab(tab);          // → #cht-body
  } else if(tab==='decision'){
    if(typeof chtRenderDecision==='function') chtRenderDecision();  // → #dec-body
  } else if(tab==='channels'){
    if(typeof chanRender==='function') chanRender();             // → #chan-body
  } else {
    if(typeof dtcRender==='function') dtcRender();               // → #dtc-body
  }
}

// Re-render the active tab preserving scroll — the collab presence refresh hook.
function wkRefreshPresence(){
  var bid=wkBodyId(_wkTab);
  if(typeof collabRestoreScroll==='function') collabRestoreScroll(bid, wkRenderActiveBody);
  else wkRenderActiveBody();
}

// Save-now button (shared by every tab; every editor autosaves via saveState()).
function wkSaveNow(){ if(typeof saveNow==='function') saveNow(); if(typeof flashSaved==='function') flashSaved(); }
