/* ►► SECTION: SPINE ◄◄ Data-driven value-spine strip ("you are here")
 *
 * The onboarding guide, reincarnated as a LIVE marker (not a scripted tour). A slim,
 * always-present band above every view that renders the ordered path to first value and
 * lights up the current step — each node's state computed fresh from data on every render,
 * so it can never go stale. Clicking a node deep-links to the view that completes it.
 *
 * Visibility is a per-DEVICE concern (never app state / backups / collab): dismissible for
 * the session, "don't show again" persists in rail prefs (railGuideOff), and it auto-retires
 * once the core path (steps 1–4) is complete. Re-openable from Help → "Show setup guide".
 *
 * The band is a fixed element ABOVE the z-400 view overlays; it publishes its height as the
 * CSS var --spine-h, and nav.css offsets the view overlays + body by that var — so when the
 * strip is hidden (--spine-h:0) the layout is identical to before this feature existed.
 *
 * Everything here is `spine`-prefixed to stay unique in the flat bundle (build.js fails on
 * duplicate top-level declarations).
 *
 * Functions defined in this file:
 *   spineStates   — the 5 nodes with a live state each (done|current|locked|ready)
 *   spineComplete — are steps 1–4 all done? (drives auto-retire)
 *   spineVisible  — should the band show right now?
 *   spineRender   — (re)build #spine-band + publish --spine-h  (the single entry point)
 *   spineRefresh  — alias called from saveState so data edits update the strip
 *   spineGo/spineDismiss/spineHideForever/spineShow — node click + the dismiss controls
 */

var _spineHidden = false;   // session-only dismiss (resets on reload); permanent lives in railGuideOff

/* The value spine — the ordered path to first value. Each node carries a `done(ctx)` test
   (the table in BACKLOG › NEXT UP) and the view it deep-links to. Kept as functions so the
   test reads live globals at render time. */
function spineNodes(){
  return [
    { id:'team',     label:t('Team'),     hint:t('Add people'),        view:'roster',
      done:function(){ return engineers.filter(function(e){return !e.vacant;}).length>0; } },
    { id:'projects', label:t('Projects'), hint:t('Add projects'),      view:'matrix',
      done:function(){ return projects.length>0; } },
    { id:'horizon',  label:t('Horizon'),  hint:t('Set FROM–TO'),       view:'plan',
      done:function(){ return (typeof getMonthRange==='function') && getMonthRange().length>0; } },
    { id:'allocate', label:t('Allocate'), hint:t('Staff the plan'),    view:'plan',
      done:function(){ return spineHasAllocation() && projects.some(function(p){ return (p.lifecycle||'active')==='active'; }); } },
    { id:'review',   label:t('Review'),   hint:t('See it come alive'), view:'dashboard', isReview:true,
      done:function(){ return false; } },   // Review is a DESTINATION, never "done" — see spineStates
  ];
}

// Is there at least one real allocation (any month, any row, > 0 FTE)?
function spineHasAllocation(){
  var num = (typeof _allocNum==='function') ? _allocNum : function(v){ return +v||0; };
  return allocRows.some(function(r){
    if(!r || !r.allocs) return false;
    for(var k in r.allocs){ if(r.allocs.hasOwnProperty(k) && num(r.allocs[k])>0) return true; }
    return false;
  });
}

/* Resolve each node to a display state:
     done    — its test passes
     current — the FIRST incomplete core step (1–4); "you are here"
     locked  — an incomplete core step after the current one
     ready   — Review, once steps 1–4 are all done (the unlocked payoff)
   Review stays 'locked' until the core path is complete. */
function spineStates(){
  var nodes = spineNodes();
  var core  = nodes.filter(function(n){ return !n.isReview; });
  var coreDone = core.every(function(n){ return n.done(); });
  var currentAssigned = false;
  return nodes.map(function(n){
    var st;
    if(n.isReview){ st = coreDone ? 'ready' : 'locked'; }
    else if(n.done()){ st = 'done'; }
    else if(!currentAssigned){ st = 'current'; currentAssigned = true; }
    else { st = 'locked'; }
    return { id:n.id, label:n.label, hint:n.hint, view:n.view, isReview:!!n.isReview, state:st };
  });
}

// Steps 1–4 all satisfied → the guide has done its job and retires.
function spineComplete(){
  return spineNodes().filter(function(n){ return !n.isReview; }).every(function(n){ return n.done(); });
}

// Should the strip be on screen right now?
function spineVisible(){
  if(typeof railGuideOff!=='undefined' && railGuideOff) return false;   // "don't show again"
  if(_spineHidden) return false;                                        // dismissed this session
  if(spineComplete()) return false;                                     // auto-retired
  return true;
}

var SPINE_H = 40;   // px — fixed band height (see #spine-band in nav.css); publishes as --spine-h

// (Re)build the band and publish the layout offset. The single render entry point:
// called from railGo (navigation), saveState (data edits, via spineRefresh) and boot.
function spineRender(){
  var band = G('spine-band');
  if(!band) return;
  if(!spineVisible()){
    band.hidden = true;
    band.innerHTML = '';
    document.documentElement.style.setProperty('--spine-h','0px');
    return;
  }
  var states = spineStates();
  var doneCount = states.filter(function(s){ return !s.isReview && s.state==='done'; }).length;

  var nodesHTML = states.map(function(s,i){
    var here = (s.state==='current') || (s.view===activeView && s.state!=='locked');
    var icon = s.state==='done' ? '✓'
             : s.isReview ? (s.state==='ready' ? '★' : '🔒')
             : s.state==='locked' ? '🔒'
             : (i+1);
    var cls = 'spine-node s-'+s.state + (here?' here':'');
    // aria-current marks the active step; title carries the hint for narrow screens.
    return '<button type="button" class="'+cls+'" onclick="spineGo(event,&#39;'+s.view+'&#39;)"'
         + (here?' aria-current="step"':'')
         + ' title="'+escH(s.label+' — '+s.hint)+'">'
         + '<span class="spine-dot">'+escH(String(icon))+'</span>'
         + '<span class="spine-lbl"><b>'+escH(s.label)+'</b><i>'+escH(s.hint)+'</i></span>'
         + '</button>';
  }).join('<span class="spine-arrow" aria-hidden="true">→</span>');

  band.innerHTML =
      '<div class="spine-lead"><span class="spine-kicker">'+escH(t('SETUP'))+'</span>'
    +   '<span class="spine-prog">'+escH(t('{n} of 4',{n:doneCount}))+'</span></div>'
    + '<div class="spine-track">'+nodesHTML+'</div>'
    + '<div class="spine-actions">'
    +   '<button type="button" class="spine-x" onclick="spineDismiss()" title="'+escH(t('Hide for now'))+'" aria-label="'+escH(t('Hide for now'))+'">✕</button>'
    +   '<button type="button" class="spine-never" onclick="spineHideForever()">'+escH(t('Don\'t show again'))+'</button>'
    + '</div>';

  band.hidden = false;
  document.documentElement.style.setProperty('--spine-h', SPINE_H+'px');
}

// Data changed → keep the strip in sync (called from saveState).
function spineRefresh(){ try{ spineRender(); }catch(e){} }

// Click a node → go to the view that completes that step.
function spineGo(ev, viewId){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  if(typeof railGo==='function') railGo(null, viewId);
}

// Dismiss for THIS session only (comes back on reload). Never touches app state.
function spineDismiss(){ _spineHidden = true; spineRender(); }

// Permanent opt-out — a per-device rail pref, not app state / backup / collab.
function spineHideForever(){
  if(typeof railGuideOff!=='undefined'){ railGuideOff = true; if(typeof railSavePrefs==='function') railSavePrefs(); }
  _spineHidden = true;
  spineRender();
}

// Re-open the guide (Help → "Show setup guide"). Clears both the session + permanent hides.
function spineShow(){
  _spineHidden = false;
  if(typeof railGuideOff!=='undefined'){ railGuideOff = false; if(typeof railSavePrefs==='function') railSavePrefs(); }
  spineRender();
}

/* ── Teaching empty states ─────────────────────────────────────────────────────
   Generalises the Balancer's suppression-banner pattern: a zero-data view says WHY it
   is empty and links the fix, instead of rendering a blank/zero. Escapes its inputs;
   the CTA deep-links via railGo. Callers pass a plain-text title/message + one CTA. */
function teachEmpty(o){
  o = o || {};
  var icon = o.icon || '◔';
  var cta  = (o.ctaLabel && o.ctaView)
    ? '<button type="button" class="teach-cta" onclick="railGo(event,&#39;'+o.ctaView+'&#39;)">'+escH(o.ctaLabel)+'</button>'
    : '';
  return '<div class="teach-empty">'
    + '<div class="teach-ic" aria-hidden="true">'+escH(String(icon))+'</div>'
    + '<div class="teach-tx"><div class="teach-h">'+escH(o.title||'')+'</div>'
    +   (o.msg?'<div class="teach-s">'+escH(o.msg)+'</div>':'')+'</div>'
    + cta + '</div>';
}
