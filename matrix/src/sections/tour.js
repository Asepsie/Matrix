/* ►► SECTION: TOUR ◄◄ Guided tour, embedded in the Help panel
 *
 * A hub-and-spoke walkthrough: a MENU lists the app's domains (generated from
 * RAIL_DOMAINS so new views auto-appear and the tour never drifts); picking one
 * runs a short per-section walkthrough that drives railGo() to the real view and
 * spotlights its rail entry, then returns to the menu so the user can pick another.
 *
 * All identifiers are tour-prefixed (flat-bundle no-duplicate-declaration rule).
 * Themed with var(--…) and localized via t(), like the rest of the shell.
 *
 * Functions defined in this file:
 *   tourStart        — open the hub menu (entry point; Help panel + `?`-less launcher)
 *   tourStop         — close the tour and restore rail state
 *   tourShowMenu     — render the section-picker hub
 *   tourRunTrack     — begin a named walkthrough (basics | a domain id)
 *   tourNext/tourPrev — step navigation
 *   tourStep         — render the current step (spotlight + tooltip)
 *   tourDomainTrack  — build the step list for one RAIL_DOMAINS domain
 *
 * Deliberately NOT persisted and NOT part of app state — it's pure UI help.
 */

/* ── Authored narration for the key views (others get a generated stub) ────────
   Keyed by rail view id. Kept light; the menu/step scaffold is data-driven, this
   copy is the actual value. Add a view id here to upgrade its stub to full copy. */
var TOUR_COPY = {
  matrix: { icon:'📊', body:
    'Projects are plotted as bubbles: the <strong>X axis</strong> is effort/complexity, '
    +'the <strong>Y axis</strong> is impact — switchable to <strong>visibility</strong> or '
    +'<strong>enabler</strong> from the toolbar. <strong>Click</strong> a bubble to select, '
    +'<strong>drag</strong> to reposition, <strong>scroll</strong> to zoom, drag empty space to pan. '
    +'This is the portfolio front door — everything else describes the people and money behind it.' },
  roster: { icon:'👥', body:
    'Your team list. Add engineers and set monthly cost, group and role. '
    +'Open any card’s <strong>ID Card</strong> for the full profile — photo, skills, '
    +'nine-box placement, compa-ratio, succession and engagement cadence. '
    +'Everyone here flows into cost, skills, talent and analytics.' },
  plan: { icon:'📅', body:
    'Allocate engineers to projects month by month (0–100% FTE) in <strong>Grid</strong> mode — a cell can '
    +'carry a status (<code>M</code> medical · <code>P</code> PTO · <code>R</code> resigned) that changes how it '
    +'costs; this grid is the single source every cost number is summed from. The mode bar also gives you '
    +'<strong>Gantt</strong> (project bars over time), <strong>Ribbon</strong> (per-person capacity crossover) '
    +'and <strong>Capacity</strong> (schedule forward demand against free bench) — all on the same allocation data.' },
  dashboard: { icon:'⚖', body:
    'The capacity cockpit: team supply vs demand, a monthly <strong>demand-vs-capacity</strong> chart, '
    +'capacity balance by function, per-engineer utilisation and over/under-allocation alerts. '
    +'Overloaded someone? A <strong>suggested swap</strong> and <strong>Find replacements</strong> '
    +'surface available substitutes; the availability panel shows who is free and what they can do.' },
  skills: { icon:'🛡', body:
    'Your skill inventory in two lenses. <strong>Matrix</strong> is the dictionary — every skill '
    +'with its category, domain, holders and levels, plus rename / merge / split. <strong>Risk</strong> '
    +'surfaces <strong>Single Points of Failure</strong> (skills held by one person), coverage and '
    +'knowledge-transfer plans — where fragility becomes visible before someone resigns.' },
  placement: { icon:'⊞', body:
    'Calibrate your team on two grids, switchable by the lens toggle. <strong>Nine-box</strong> is '
    +'the classic <strong>Performance × Potential</strong> grid — placements feed development '
    +'priorities, salary signals and the org-chart KPI panel, and are tracked per year so you can see '
    +'a person’s trajectory over time. <strong>DISC</strong> plots behavioural style across four '
    +'quadrants. Both feed the talent story views in People analytics.' },
  exec: { icon:'◈', body:
    'A one-page, read-only cockpit that crosses every layer — portfolio value (NPV / PI), cost & '
    +'spend map, capacity, talent risk and channel concentration — with a <strong>week planner</strong> '
    +'for the touchpoints and to-dos you’ve pinned. Start here when you want the whole picture at a glance.' },
};

/* ── Track: the "basics" starter (concept-level, before the section tours) ── */
function tourBasicsTrack(){
  return [
    { kind:'center', tag:t('Welcome'), title:'👋 '+t('Welcome to Project Matrix'), body:
        t('Your R&D portfolio tool — it connects projects, people, skills and money in one place. '
        +'This quick tour explains the layout, then lets you dive into whichever section you like.')
        +'<br><br>'+t('Use <strong>Next</strong> / <strong>Back</strong>, or the <code>→</code> / <code>←</code> arrow keys.') },
    { kind:'rail', tag:t('Navigation'), title:'☰ '+t('The navigation rail'), body:
        t('Everything lives on this left rail, grouped into domains — <strong>Team</strong>, '
        +'<strong>Offer Mngt</strong>, <strong>Plan</strong>, <strong>Skills</strong>, <strong>Talent</strong> and '
        +'<strong>Insights</strong>. Hover to expand it; click any page to open it. The foot holds actions: '
        +'export, backup, AI advisor, settings and this help.') },
    { kind:'view', view:'matrix', tag:t('Start'), title:(TOUR_COPY.matrix.icon)+' '+t('The portfolio matrix'), body:TOUR_COPY.matrix.body },
    { kind:'center', tag:t('Your turn'), title:'✓ '+t('Now pick a section'), body:
        t('That’s the shape of it. Back on the menu, choose any domain to walk through its pages — '
        +'or just close this and explore. You can reopen the tour any time from <strong>Help</strong>.') },
  ];
}

/* ── Track: one RAIL_DOMAINS domain → intro + a step per view ──────────────── */
function tourDomainTrack(domId){
  var dom=null;
  for(var i=0;i<RAIL_DOMAINS.length;i++) if(RAIL_DOMAINS[i].id===domId) dom=RAIL_DOMAINS[i];
  if(!dom) return [];
  var steps=[ { kind:'center', tag:t('Section'), title:dom.name, body:
      t('{n} page(s) in this section. We’ll open each one so you can see it live.',{n:dom.views.length}) } ];
  dom.views.forEach(function(v){
    var copy=TOUR_COPY[v.id];
    steps.push({
      kind:'view', view:v.id, tag:dom.name,
      title:(copy?copy.icon+' ':'')+v.label,
      body: copy ? copy.body
                 : t('Opens <strong>{label}</strong>. Explore it now, or press Next to continue.',{label:v.label})
    });
  });
  steps.push({ kind:'menu-end', tag:t('Done'), title:'✓ '+t('Section complete'), body:
      t('Back to the menu — pick another section, or close the tour.') });
  return steps;
}

/* ── State ─────────────────────────────────────────────────────────────────── */
var _tourActive=false;
var _tourSteps=[];        // current track
var _tourIdx=0;
var _tourRailPinPrev=null; // rail pin state to restore on close

/* ── Build the tour DOM once (lazily; overlays sit after {{JS}} so build at use) ─ */
function tourBuildDOM(){
  if(G('tour-pop')) return;
  var ov=document.createElement('div'); ov.id='tour-overlay';
  var sp=document.createElement('div'); sp.id='tour-spot';
  var pop=document.createElement('div'); pop.id='tour-pop';
  document.body.appendChild(ov);
  document.body.appendChild(sp);
  document.body.appendChild(pop);
}

/* ── Entry: open the hub menu ────────────────────────────────────────────────── */
function tourStart(){
  if(typeof closeHelp==='function') closeHelp();   // launched from Help; get it out of the way
  tourBuildDOM();
  _tourActive=true;
  // Pin the rail open so its page entries are visible to spotlight; remember prior state.
  if(typeof railPinned!=='undefined'){
    _tourRailPinPrev=railPinned;
    if(!railPinned && typeof railTogglePin==='function') railTogglePin();
  }
  G('tour-overlay').classList.add('show');
  tourShowMenu();
}

function tourStop(){
  _tourActive=false;
  ['tour-overlay','tour-spot','tour-pop'].forEach(function(id){ var e=G(id); if(e) e.classList.remove('show'); });
  var sp=G('tour-spot'); if(sp) sp.style.display='none';
  // Restore the rail's pre-tour pin state.
  if(_tourRailPinPrev===false && typeof railPinned!=='undefined' && railPinned && typeof railTogglePin==='function') railTogglePin();
  _tourRailPinPrev=null;
}

/* ── Hub: the section picker, generated from RAIL_DOMAINS ─────────────────────── */
function tourShowMenu(){
  _tourSteps=[]; _tourIdx=0;
  var sp=G('tour-spot'); if(sp) sp.style.display='none';
  var ov=G('tour-overlay'); if(ov) ov.classList.add('show');   // dim backdrop behind the menu card
  var cards=RAIL_DOMAINS.map(function(d){
    var pages=d.views.map(function(v){return escH(v.label);}).join(' · ');
    return '<button class="tour-card" onclick="tourRunTrack(\''+d.id+'\')">'
         + '<span class="tour-card-ico">'+d.ico+'</span>'
         + '<span class="tour-card-body"><span class="tour-card-name mono">'+escH(d.name)+'</span>'
         + '<span class="tour-card-sub">'+pages+'</span></span></button>';
  }).join('');
  var pop=G('tour-pop');
  pop.className='tour-menu';
  pop.innerHTML=
      '<div class="tour-tag mono">'+escH(t('Guided tour'))+'</div>'
    + '<div class="tour-title">'+escH(t('Where would you like to start?'))+'</div>'
    + '<div class="tour-lead">'+escH(t('Take the quick basics tour, or jump straight into any section. You can come back to this menu any time.'))+'</div>'
    + '<button class="tour-start-basics" onclick="tourRunTrack(\'basics\')">▶ '+escH(t('Start here — the basics'))+'</button>'
    + '<div class="tour-cards">'+cards+'</div>'
    + '<div class="tour-menu-foot"><button class="tour-btn" onclick="tourStop()">'+escH(t('Close'))+'</button></div>';
  pop.classList.add('show');
  // center it
  pop.style.left=''; pop.style.top='';
}

/* ── Run a track by name: 'basics' or a domain id ────────────────────────────── */
function tourRunTrack(name){
  _tourSteps = (name==='basics') ? tourBasicsTrack() : tourDomainTrack(name);
  _tourIdx=0;
  if(!_tourSteps.length){ tourShowMenu(); return; }
  tourStep();
}

function tourNext(){
  if(_tourIdx>=_tourSteps.length-1){ tourShowMenu(); return; }  // end of track → hub
  _tourIdx++; tourStep();
}
function tourPrev(){ if(_tourIdx>0){ _tourIdx--; tourStep(); } }

/* ── Render the current step ─────────────────────────────────────────────────── */
function tourStep(){
  var step=_tourSteps[_tourIdx];
  if(!step){ tourShowMenu(); return; }

  // Drive the app to the right surface for 'view' steps, then spotlight the rail entry.
  var anchor=null;
  if(step.kind==='view' && step.view && typeof railGo==='function'){
    try{ railGo(null, step.view); }catch(e){}
    anchor=document.querySelector('.rn-sub[data-view="'+step.view+'"]');
  } else if(step.kind==='rail'){
    anchor=G('railnav');
  }

  var last=(_tourIdx===_tourSteps.length-1);
  var pop=G('tour-pop');
  pop.className='tour-step';
  pop.innerHTML=
      '<div class="tour-tag mono">'+escH(step.tag||'')+'</div>'
    + '<div class="tour-title">'+escH(step.title||'')+'</div>'
    + '<div class="tour-body">'+(step.body||'')+'</div>'
    + '<div class="tour-foot">'
    +   '<div class="tour-prog mono">'+escH(t('Step {a} of {b}',{a:_tourIdx+1,b:_tourSteps.length}))+'</div>'
    +   '<button class="tour-btn" onclick="tourShowMenu()">'+escH(t('Menu'))+'</button>'
    +   (_tourIdx>0?'<button class="tour-btn" onclick="tourPrev()">'+escH(t('Back'))+'</button>':'')
    +   '<button class="tour-btn tour-primary" onclick="tourNext()">'+escH(last?('✓ '+t('Menu')):(t('Next')+' →'))+'</button>'
    + '</div>';
  pop.classList.add('show');
  tourPlaceSpot(anchor);
  tourPlacePop(anchor, step.kind);
}

/* ── Spotlight the anchor element (or a full dim backdrop for center steps) ─────
   Exactly one dims the screen: the spot's box-shadow (anchored) OR the overlay
   (center/menu). Showing both would dim the highlighted item too. */
function tourPlaceSpot(anchor){
  var sp=G('tour-spot'), ov=G('tour-overlay'); if(!sp) return;
  if(!anchor){ sp.style.display='none'; if(ov) ov.classList.add('show'); return; }
  if(ov) ov.classList.remove('show');
  var r=anchor.getBoundingClientRect();
  var pad=6;
  sp.style.display='block';
  sp.style.left=(r.left-pad)+'px';
  sp.style.top=(r.top-pad)+'px';
  sp.style.width=(r.width+pad*2)+'px';
  sp.style.height=(r.height+pad*2)+'px';
}

/* ── Position the popup relative to the anchor (right of the rail), else center ─ */
function tourPlacePop(anchor, kind){
  var pop=G('tour-pop');
  var vw=window.innerWidth, vh=window.innerHeight;
  var pw=pop.offsetWidth||360, ph=pop.offsetHeight||240;
  var gap=16;
  if(!anchor){ pop.style.left=Math.round((vw-pw)/2)+'px'; pop.style.top=Math.round((vh-ph)/2)+'px'; return; }
  var r=anchor.getBoundingClientRect();
  var left=r.right+gap, top=r.top+r.height/2-ph/2;
  if(left+pw>vw-16) left=Math.max(16, r.left-pw-gap);      // fall back to the left side
  top=Math.max(16, Math.min(vh-ph-16, top));
  pop.style.left=Math.round(left)+'px';
  pop.style.top=Math.round(top)+'px';
}

/* ── Keyboard: capture arrows/esc while active so app shortcuts don't fire ────── */
document.addEventListener('keydown', function(e){
  if(!_tourActive) return;
  if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); tourStop(); return; }
  // Menu state: let Escape close; ignore arrows.
  if(G('tour-pop') && G('tour-pop').classList.contains('tour-menu')) return;
  if(e.key==='ArrowRight'||e.key==='Enter'){ e.preventDefault(); e.stopPropagation(); tourNext(); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); e.stopPropagation(); tourPrev(); }
  else { e.stopPropagation(); }   // keep the tour modal — no app shortcuts underneath
}, true);

/* Keep the spotlight/popup glued to the rail item if the viewport resizes mid-tour. */
window.addEventListener('resize', function(){
  if(!_tourActive) return;
  var pop=G('tour-pop'); if(!pop||pop.classList.contains('tour-menu')) return;
  var step=_tourSteps[_tourIdx]; if(!step) return;
  var anchor=(step.kind==='view'&&step.view)?document.querySelector('.rn-sub[data-view="'+step.view+'"]')
            :(step.kind==='rail'?G('railnav'):null);
  tourPlaceSpot(anchor); tourPlacePop(anchor, step.kind);
});
