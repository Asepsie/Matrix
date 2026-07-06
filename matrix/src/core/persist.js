/* ►► SECTION: PERSIST ◄◄ LocalStorage persistence: saveState, loadState, sanitise */

/* ── Module-local state ── */
export const SK='eim_v4';
export const LS_MAX = 5 * 1024 * 1024; // 5MB browser limit
export let _dirty=false;
export let _saveTimer=null;
export let _saveFailedAlerted=false; // prevent alert storm on repeated save failures

/* ── Loop-based sanitise (replaces the long if-chain from loadState) ── */
export function sanitiseEngineer(e) {
  var defaults = makeEngineer();
  var idcDefaults = makeIdCard();
  var succDefaults = makeSuccessionPlan();

  // Merge missing top-level fields
  for (var key of Object.keys(defaults)) {
    if (e[key] === undefined) e[key] = defaults[key];
  }
  // Ensure idcard exists before merging its fields
  if (!e.idcard) e.idcard = {};
  for (var key of Object.keys(idcDefaults)) {
    if (e.idcard[key] === undefined) e.idcard[key] = idcDefaults[key];
  }
  // Ensure succession exists before merging its fields
  if (!e.idcard.succession) e.idcard.succession = {};
  for (var key of Object.keys(succDefaults)) {
    if (e.idcard.succession[key] === undefined)
      e.idcard.succession[key] = succDefaults[key];
  }
  // Ensure nextMove exists before merging its fields
  var nmDefaults = makeNextMove();
  if (!e.idcard.nextMove || typeof e.idcard.nextMove !== 'object')
    e.idcard.nextMove = {};
  for (var key of Object.keys(nmDefaults)) {
    if (e.idcard.nextMove[key] === undefined)
      e.idcard.nextMove[key] = nmDefaults[key];
  }
  // Sanitise skill entries
  e.skills.forEach(function(s) {
    var sd = makeSkill();
    for (var k of Object.keys(sd)) { if (s[k] === undefined) s[k] = sd[k]; }
  });
  // Sanitise CoP entries
  e.idcard.cops.forEach(function(cop) {
    var cd = makeCop();
    for (var k of Object.keys(cd)) { if (cop[k] === undefined) cop[k] = cd[k]; }
  });
  // Sanitise review entries
  e.idcard.reviews.forEach(function(rev) {
    var rd = makeReview();
    for (var k of Object.keys(rd)) { if (rev[k] === undefined) rev[k] = rd[k]; }
  });
}

export function updateStorageHealth(){
  try{
    // Measure all localStorage data for this origin
    var used = 0;
    for(var k in localStorage) used += (localStorage.getItem(k)||'').length * 2; // UTF-16
    var pct = Math.min(100, Math.round(used / LS_MAX * 100));
    var kb  = Math.round(used / 1024);
    var mb  = (used / 1048576).toFixed(2);

    var bar  = G('storage-bar');
    var pctEl= G('storage-pct');
    var wrap = G('storage-health');
    if(!bar||!pctEl||!wrap) return;

    bar.style.width = pct + '%';
    pctEl.textContent = pct + '%';

    // Colour: green → orange → red
    if(pct < 50){
      bar.style.background = 'var(--accent)';   // green
      pctEl.style.color    = 'var(--muted)';
      wrap.title           = 'localStorage: ' + kb + 'KB / ~5000KB (' + pct + '%)';
    } else if(pct < 75){
      bar.style.background = '#f1a435';          // orange
      pctEl.style.color    = '#f1a435';
      wrap.title           = '⚠ localStorage: ' + kb + 'KB / ~5000KB (' + pct + '%) — consider exporting a backup';
    } else if(pct < 90){
      bar.style.background = '#f14335';          // red
      pctEl.style.color    = '#f14335';
      wrap.title           = '⚠ HIGH: localStorage: ' + kb + 'KB / ~5000KB (' + pct + '%)';
    } else {
      bar.style.background = '#f14335';
      pctEl.style.color    = '#f14335';
      pctEl.textContent    = '⚠ ' + pct + '%';
      wrap.title           = '🚨 CRITICAL: ' + kb + 'KB / ~5000KB. Save will fail soon. Export data now.';
    }
    return {pct, kb, mb, used};
  }catch(e){ return null; }
}

export function showStorageDetail(){
  var info = updateStorageHealth();
  if(!info){ alert('Could not measure storage.'); return; }
  var skSize = Math.round((localStorage.getItem('eim_v4')||'').length * 2 / 1024);
  var snapSize= Math.round((localStorage.getItem('eim_snaps_v1')||'').length * 2 / 1024);
  var idbInfo = idbStorageInfo();
  var msg =
    '📦 STORAGE USAGE\n\n'
    + 'localStorage (5MB limit):\n'
    + '  Main state:   ' + skSize + ' KB\n'
    + '  Snapshots:    ' + snapSize + ' KB  (legacy LS)\n'
    + '  Total used:   ' + info.kb + ' KB  (' + info.pct + '% of limit)\n'
    + '  Remaining:    ' + Math.round((5120 - info.kb)) + ' KB\n\n'
    + 'IndexedDB (no practical limit):\n'
    + '  Photos:       ' + idbInfo.kb + ' KB  (' + idbInfo.photos + ' photos)\n'
    + '  Snapshots:    in IDB (no size limit)\n\n'
    + (info.pct > 75
      ? '⚠ Approaching limit. Recommend:\n'
        + '  1. Export full backup (↓ EXPORT)\n'
        + '  2. Delete unused snapshots (🕐 SNAPS)\n'
        + '  3. Clear old allocation rows\n'
      : '✓ Storage is healthy.');
  alert(msg);
}



/* ══════════════════════════════════════════════════════════════════
   MODULE: STORAGE: SAVE/LOAD
   ══════════════════════════════════════════════════════════════════ */
export function _doSave(){
  _saveTimer=null;
  try{
    localStorage.setItem(SK,JSON.stringify({
      // Core
      projects,sections,nextId,nextTodoId,nextRiskId,nextMsId,nextSectionId,
      nextAnnotId,nextActionId,sepX,sepY,scaleX,scaleY,yMode,quadrantsByMode,annotations,zoom,
      // Engineers & resources
      engineers,engGroups,nextEngGroupId,allocRows,nextEngId,nextAllocId,
      engDashGroupBy,
      // Skills
      skillDomains,skillCats,ktPlans:_ktPlans,
      finExclude:[..._finExclude],
      // Org chart
      orgAnnotations:_orgAnnotations,orgLevelH:_orgLevelH,orgLevelNames:_orgLevelNames,
      orgPositions:_orgPositions,orgCollapsed:_orgCollapsed,
      orgScale:_orgScale,orgPanX:_orgPanX,orgPanY:_orgPanY,
      // UI/axis/dates
      nineBoxPlacements:_nineBoxPlacements,
      nineBoxHistory:_nineBoxHistory,nbYear:_nbYear,nbCompareYear:_nbCompareYear,
      discPlacements:_discPlacements,
      nbSwapAxes:_nbSwapAxes,
      planFilterEng:[...planFilterEng],planFilterProj:[...planFilterProj],
      engDashFilterEng:[...engDashFilterEng],engDashFilterProj:[...engDashFilterProj],
    resTitle:G('res-title-input')?G('res-title-input').value:'Resource Plan',
      resStart:G('res-start')?G('res-start').value:'',
      resEnd:G('res-end')?G('res-end').value:'',
      axis:{xName:V('ax-x-name'),xMin:V('ax-x-min'),xMax:V('ax-x-max'),
            yMin:V('ax-y-min'),yMax:V('ax-y-max'),grid:V('ax-grid')}
    }));
    _dirty=false;
    _saveFailedAlerted=false;
    flashSaved();
    updateStorageHealth();
  }catch(e){
    // localStorage full — surface clearly
    const el=G('save-indicator');
    if(el){el.textContent='⚠ SAVE FAILED — storage full';el.style.color='var(--danger)';}
    const bar=G('storage-bar');
    if(bar){bar.style.width='100%';bar.style.background='var(--danger)';}
    const pctEl=G('storage-pct');
    if(pctEl){pctEl.textContent='⚠ FULL';pctEl.style.color='var(--danger)';}
    console.error('[EIM] localStorage save failed:',e);
    // Show actionable alert once
    if(!_saveFailedAlerted){
      _saveFailedAlerted=true;
      alert('⚠ SAVE FAILED\n\nLocalStorage is full. Your data has NOT been saved.\n\nPlease:\n1. Export a backup immediately (↓ EXPORT)\n2. Delete old snapshots (🕐 SNAPS)\n3. Then try saving again.');
    }
  }
}

export function saveState(){
  // Data is changing → drop memoised computations (see _memo in helpers.js)
  _invalidateMemo();
  // Mark dirty immediately so indicator shows unsaved state
  _dirty=true;
  const el=G('save-indicator');
  if(el&&!_saveTimer){el.textContent='● unsaved';el.style.color='var(--muted)';}
  // Debounce: wait 800ms after last change before writing
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(_doSave,800);
}

export function saveNow(){
  // Immediate save — for deletes, restores, critical mutations
  _invalidateMemo();
  clearTimeout(_saveTimer);
  _doSave();
}

// Warn before closing with unsaved changes
window.addEventListener('beforeunload',function(e){
  if(_dirty){e.preventDefault();e.returnValue='';}
});
export function loadState(){
  try{
    const raw=localStorage.getItem(SK);if(!raw)return false;
    const d=JSON.parse(raw);
    if(d.projects)    projects=d.projects;
    if(d.sections&&Array.isArray(d.sections))    sections=d.sections;
    if(d.nextId)      nextId=d.nextId;
    if(d.nextTodoId)  nextTodoId=d.nextTodoId;
    if(d.nextRiskId)  nextRiskId=d.nextRiskId;
    if(d.nextMsId)    nextMsId=d.nextMsId;
    if(d.nextSectionId) nextSectionId=d.nextSectionId;
    if(d.nextAnnotId)    nextAnnotId=d.nextAnnotId;
    if(d.nextActionId)  nextActionId=d.nextActionId;
    if(d.sepX!=null)  sepX=d.sepX;
    if(d.sepY!=null)  sepY=d.sepY;
    if(d.scaleX)      scaleX=d.scaleX;
    if(d.scaleY)      scaleY=d.scaleY;
    if(d.yMode)       yMode=d.yMode;
    if(d.quadrantsByMode&&typeof d.quadrantsByMode==='object'){
      ['impact','visibility','enabler'].forEach(function(mode){
        if(d.quadrantsByMode[mode]&&Array.isArray(d.quadrantsByMode[mode]))
          quadrantsByMode[mode]=d.quadrantsByMode[mode];
      });
    } else if(d.quadrants&&Array.isArray(d.quadrants)){
      quadrantsByMode.impact=d.quadrants; // migrate old format
    }
    if(d.annotations&&Array.isArray(d.annotations))annotations=d.annotations;
    if(d.zoom)        zoom=d.zoom;
    if(d.engineers&&Array.isArray(d.engineers)){
      engineers=d.engineers;
      engineers.forEach(function(e){ sanitiseEngineer(e); });
    }
    if(d.skillDomains&&Array.isArray(d.skillDomains))skillDomains=d.skillDomains;
    if(d.skillCats&&Array.isArray(d.skillCats)&&d.skillCats.length)skillCats=d.skillCats;
    if(d.finExclude&&Array.isArray(d.finExclude))_finExclude=new Set(d.finExclude);
    if(d.orgAnnotations&&Array.isArray(d.orgAnnotations))_orgAnnotations=d.orgAnnotations;
    if(d.orgLevelH&&typeof d.orgLevelH==='object')_orgLevelH=d.orgLevelH;
    if(d.orgLevelNames&&typeof d.orgLevelNames==='object')_orgLevelNames=d.orgLevelNames;
    if(d.ktPlans&&typeof d.ktPlans==='object')_ktPlans=d.ktPlans;
    if(d.orgPositions&&typeof d.orgPositions==='object')_orgPositions=d.orgPositions;
    if(d.orgCollapsed&&typeof d.orgCollapsed==='object')_orgCollapsed=d.orgCollapsed;
    if(d.orgScale)_orgScale=d.orgScale;
    if(d.orgPanX!=null)_orgPanX=d.orgPanX;
    if(d.orgPanY!=null)_orgPanY=d.orgPanY;
    if(d.engGroups&&Array.isArray(d.engGroups))     engGroups=d.engGroups;
    if(d.nextEngGroupId) nextEngGroupId=d.nextEngGroupId;
    if(d.allocRows&&Array.isArray(d.allocRows)){
    allocRows=d.allocRows;
    allocRows.forEach(function(r){
      if(!r.allocs)    r.allocs={};
      if(r.engId===undefined)     r.engId=null;
      if(r.projectId===undefined) r.projectId=null;
      if(r.budgetLine===undefined) r.budgetLine='';
    });
  }
    if(d.nextEngId)     nextEngId=d.nextEngId;
    if(d.nextAllocId)   nextAllocId=d.nextAllocId;
    if(d.resTitle)     { const el=G('res-title-input'); if(el)el.value=d.resTitle; }
    if(d.resStart)     { const el=G('res-start'); if(el)el.value=d.resStart; }
    if(d.resEnd)       { const el=G('res-end');   if(el)el.value=d.resEnd;   }
    if(d.nineBoxPlacements&&typeof d.nineBoxPlacements==='object')_nineBoxPlacements=d.nineBoxPlacements;
    if(d.nineBoxHistory&&typeof d.nineBoxHistory==='object')_nineBoxHistory=d.nineBoxHistory;
    if(d.nbYear)_nbYear=d.nbYear;
    if(d.nbCompareYear!=null)_nbCompareYear=d.nbCompareYear;
    nbEnsureHistory();   // migrate legacy flat snapshot + sync the live view
    if(d.discPlacements&&typeof d.discPlacements==='object')_discPlacements=d.discPlacements;
    if(d.nbSwapAxes!=null)_nbSwapAxes=!!d.nbSwapAxes;
    if(d.planFilterEng&&Array.isArray(d.planFilterEng))planFilterEng=new Set(d.planFilterEng);
    if(d.planFilterProj&&Array.isArray(d.planFilterProj))planFilterProj=new Set(d.planFilterProj);
    if(d.engDashFilterEng&&Array.isArray(d.engDashFilterEng))engDashFilterEng=new Set(d.engDashFilterEng);
    if(d.engDashFilterProj&&Array.isArray(d.engDashFilterProj))engDashFilterProj=new Set(d.engDashFilterProj);
    if(d.engDashGroupBy) engDashGroupBy=d.engDashGroupBy;
    if(d.axis){
      const a=d.axis;
      if(a.x&&typeof a.x==='object'){
        SV('ax-x-name',a.x.name||'Effort');SV('ax-x-min',a.x.min??0);SV('ax-x-max',a.x.max??10);
        SV('ax-y-min',(a.y&&a.y.min)??0);SV('ax-y-max',(a.y&&a.y.max)??10);SV('ax-grid',a.x.grid??5);
      } else {
        SV('ax-x-name',a.xName||'Effort');SV('ax-x-min',a.xMin??0);SV('ax-x-max',a.xMax??10);
        SV('ax-y-min',a.yMin??0);SV('ax-y-max',a.yMax??10);SV('ax-grid',a.grid??5);
      }
    }
    sanitiseProjects();
    return true;
  }catch(e){return false;}
}
export function sanitiseProjects(){
  projects.forEach(p=>{
    if(!p.todos||!Array.isArray(p.todos))       p.todos=[];
    if(!p.risks||!Array.isArray(p.risks))       p.risks=[];
    if(!p.milestones||!Array.isArray(p.milestones)) p.milestones=[];
    if(!p.actions||!Array.isArray(p.actions))   p.actions=[];
    if(p.currentGate==null)  p.currentGate='';
    if(p.gate==null)         p.gate='';
    if(p.eta==null)          p.eta='';
    if(!p.color)             p.color='#c8f135';
    if(!p.note)              p.note='';
    if(p.vis==null)          p.vis=5;
    if(p.ena==null)          p.ena=5;
    if(p.x==null)            p.x=5;
    if(p.y==null)            p.y=5;
    if(p.visible==null)      p.visible=true;
    if(p.sectionId===undefined) p.sectionId=null;
    if(!p.sector)            p.sector='';
    if(p.tacticalIntent==null) p.tacticalIntent='';
    if(p.impactEur===undefined) p.impactEur=null;
    if(p.planCost===undefined)  p.planCost=0;
    if(!p.costSource)        p.costSource='plan';
    if(!p.status)            p.status='';
    p.risks.forEach(r=>{
      if(!r.status)   r.status='open';
      if(r.sev==null) r.sev=1;
      if(r.occ==null) r.occ=1;
      if(r.det==null) r.det=1;
      if(!r.desc)     r.desc='';
      if(!r.mit)      r.mit='';
      if(!r.owner)    r.owner='';
    });
    p.milestones.forEach(m=>{
      if(!m.name)     m.name='';
      if(!m.date)     m.date='';
      if(m.done==null)m.done=false;
      if(!m.icon)     m.icon='🎯';
      if(!m.dep)      m.dep='';
    });
    p.actions.forEach(a=>{
      if(!a.desc)     a.desc='';
      if(!a.status)   a.status='Open';
      if(!a.member)   a.member='';
      if(!a.start)    a.start='';
      if(!a.end)      a.end='';
      if(!a.priority) a.priority='Medium';
      if(a.isMilestone==null) a.isMilestone=false;
    });
    // A malformed charter must never block the rest of the project data / list.
    try{ sanitiseCharter(p); }catch(e){ p.charter=makeCharter(); }
  });
}
// Fills in any missing charter/sub-object fields against the factory defaults so
// projects saved before this feature (or with a partial charter) load cleanly.
// Shallow-merges each branch: stored values win, factory fills the gaps.
export function sanitiseCharter(p){
  const def=makeCharter();
  if(!p.charter||typeof p.charter!=='object'){p.charter=def;return;}
  const c=p.charter;
  if(c.priority==null) c.priority=def.priority;
  if(c.status==null)   c.status=def.status;
  if(c.businessCase==null)     c.businessCase=def.businessCase;
  if(c.expectedRevenueM===undefined) c.expectedRevenueM=def.expectedRevenueM;
  // Migrate the old 'marketing' function to 'rnd' (renamed); keep its data.
  if(c.marketing && !c.rnd){ c.rnd=c.marketing; }
  delete c.marketing;
  for(const k of ['strategy','rnd','offer','procurement','industrialization','financials','decision']){
    c[k]=Object.assign({},def[k],c[k]&&typeof c[k]==='object'?c[k]:{});
  }
  for(const k of ['strategy','rnd','offer','procurement','industrialization']){
    if(!c[k]||typeof c[k]!=='object') c[k]={alignment:null,demands:[]};
    if(!Array.isArray(c[k].demands)) c[k].demands=[];
    c[k].demands.forEach(d=>{ if(d.response==null) d.response=''; if(d.responseNote==null) d.responseNote=''; });
  }
  // Design-to-cost model (added later; back-fill for older charters).
  if(!c.costModel||typeof c.costModel!=='object') c.costModel={subsystems:[],levers:[],competitors:[]};
  if(!Array.isArray(c.costModel.subsystems)) c.costModel.subsystems=[];
  if(!Array.isArray(c.costModel.levers))     c.costModel.levers=[];
  if(!Array.isArray(c.costModel.competitors))c.costModel.competitors=[];
  c.costModel.subsystems.forEach(s=>{
    if(s.include==null) s.include=true;
    if(!Array.isArray(s.items)) s.items=[];
    s.items.forEach(it=>{ if(it.include==null) it.include=true; if(it.cost==null) it.cost=0; });
  });
  if(!Array.isArray(c.financials.cashFlows))       c.financials.cashFlows=[];
  if(!c.financials.unit)                           c.financials.unit='eur';
  if(!c.financials.investment||typeof c.financials.investment!=='object')
                                                   c.financials.investment={items:[],amortUnits:null};
  if(!Array.isArray(c.financials.investment.items))c.financials.investment.items=[];
  if(c.financials.investment.amortUnits===undefined) c.financials.investment.amortUnits=null;
  // Decision: ensure the 4 stances exist (the canonical primary trade-off).
  if(!c.decision.stances||typeof c.decision.stances!=='object') c.decision.stances={};
  for(const dim of ['features','time','productCost','projectCost'])
    if(!c.decision.stances[dim]) c.decision.stances[dim]='balance';
  if(!Array.isArray(c.decision.nonNegotiables))    c.decision.nonNegotiables=[];
  if(!Array.isArray(c.decision.flexibilities))     c.decision.flexibilities=[];
  // Configurable-triangle fields (added later; back-fill for older charters).
  const DIM4=['features','time','productCost','projectCost'];
  const okPoints=p=>Array.isArray(p)&&p.length===3&&p.every(k=>DIM4.includes(k))&&new Set(p).size===3;
  if(!okPoints(c.decision.points)) c.decision.points=['features','time','productCost'];
  if(!Array.isArray(c.decision.scenarios)) c.decision.scenarios=[];
  c.decision.scenarios=c.decision.scenarios.filter(s=>s&&typeof s==='object');
  c.decision.scenarios.forEach(s=>{
    if(typeof s.name!=='string') s.name='';
    if(!okPoints(s.points)) s.points=['features','time','productCost'];
    if(!s.stances||typeof s.stances!=='object') s.stances={};
    for(const dim of DIM4) if(!s.stances[dim]) s.stances[dim]='balance';
  });
}
export function flashSaved(){
  const el=G('save-indicator');if(!el)return;
  el.style.color='';
  el.textContent='● SAVED';el.classList.add('flash');
  setTimeout(function(){
    if(!_dirty){el.textContent='● auto-save ON';el.classList.remove('flash');}
  },1400);
}
export function resetAll(){if(!confirm('Reset everything to defaults?'))return;saveNow();takeSnap('Auto: before reset','full','',true);saveSnaps();localStorage.removeItem(SK);location.reload();}

/* ►► SECTION: SNAPSHOTS ◄◄ Snapshot system: IDB storage, capture, restore, diff, export */
function snapIdbOpen(){
  return new Promise(function(resolve,reject){
    if(_snapDB){resolve(_snapDB);return;}
    if(!window.indexedDB){reject(new Error('No IDB'));return;}
    var req=indexedDB.open(SNAP_IDB,1);
    req.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains(SNAP_IDB_STORE))
        db.createObjectStore(SNAP_IDB_STORE);
      if(!db.objectStoreNames.contains('index'))
        db.createObjectStore('index',{keyPath:'id'});
    };
    req.onsuccess=function(e){_snapDB=e.target.result;resolve(_snapDB);};
    req.onerror=function(e){reject(e.target.error);};
  });
}

function snapIdbSave(snap){
  return snapIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction([SNAP_IDB_STORE,'index'],'readwrite');
      tx.objectStore(SNAP_IDB_STORE).put(snap.data,snap.id);
      var meta=snap.data?{
        projects:snap.data.projects?snap.data.projects.length:0,
        engineers:snap.data.engineers?snap.data.engineers.length:0,
        allocRows:snap.data.allocRows?snap.data.allocRows.length:0
      }:(snap.meta||null);
      tx.objectStore('index').put({
        id:snap.id,label:snap.label,ts:snap.ts,
        scope:snap.scope,auto:snap.auto,desc:snap.desc,
        meta:meta
      });
      tx.oncomplete=function(){resolve();};
      tx.onerror=function(e){reject(e.target.error);};
    });
  });
}

function snapIdbDelete(id){
  return snapIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction([SNAP_IDB_STORE,'index'],'readwrite');
      tx.objectStore(SNAP_IDB_STORE).delete(id);
      tx.objectStore('index').delete(id);
      tx.oncomplete=resolve;
      tx.onerror=function(e){reject(e.target.error);};
    });
  });
}

function snapIdbGetData(id){
  return snapIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(SNAP_IDB_STORE,'readonly');
      var req=tx.objectStore(SNAP_IDB_STORE).get(id);
      req.onsuccess=function(e){resolve(e.target.result||null);};
      req.onerror=function(e){reject(e.target.error);};
    });
  });
}

function snapIdbLoadIndex(){
  return snapIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction('index','readonly');
      var req=tx.objectStore('index').getAll();
      req.onsuccess=function(e){resolve(e.target.result||[]);};
      req.onerror=function(e){reject(e.target.error);};
    });
  });
}

function snapMigrateFromLocalStorage(){
  var raw=localStorage.getItem(SNAP_KEY);
  if(!raw)return Promise.resolve(0);
  var old=[];
  try{old=JSON.parse(raw)||[];}catch(e){return Promise.resolve(0);}
  if(!old.length)return Promise.resolve(0);
  var promises=old.map(function(s){return snapIdbSave(s);});
  return Promise.all(promises).then(function(){
    localStorage.removeItem(SNAP_KEY);
    console.log('[EIM] Migrated '+old.length+' snapshot(s) to IndexedDB');
    return old.length;
  });
}

function loadSnaps(){
  if(!_snapDB){
    try{var r=localStorage.getItem(SNAP_KEY);snapshots=r?JSON.parse(r):[];}
    catch(e){snapshots=[];}
    return;
  }
}

function loadSnapsAsync(){
  return snapMigrateFromLocalStorage().then(function(){
    return snapIdbLoadIndex();
  }).then(function(index){
    snapshots=index.sort(function(a,b){
      return new Date(a.ts)-new Date(b.ts);
    });
    updateSnapBadge();
    return snapshots;
  }).catch(function(err){
    console.warn('[EIM] Snapshot IDB error, falling back to localStorage:',err);
    try{var r=localStorage.getItem(SNAP_KEY);snapshots=r?JSON.parse(r):[];}
    catch(e){snapshots=[];}
    return snapshots;
  });
}

function saveSnaps(){
  updateSnapBadge();
}

function snapBoot(){
  return snapIdbOpen()
    .then(snapMigrateFromLocalStorage)
    .then(snapIdbLoadIndex)
    .then(function(index){
      snapshots=index.sort(function(a,b){return new Date(a.ts)-new Date(b.ts);});
      updateSnapBadge();
      console.log('[EIM] Snapshot DB ready. '+snapshots.length+' snapshot(s).');
    })
    .catch(function(err){
      console.warn('[EIM] Snapshot IDB unavailable, using localStorage:',err);
      try{var r=localStorage.getItem(SNAP_KEY);snapshots=r?JSON.parse(r):[];}
      catch(e){snapshots=[];}
    });
}

function captureScope(scope){
  const full={
    projects,sections,nextId,nextTodoId,nextRiskId,nextMsId,nextSectionId,
    nextAnnotId,nextActionId,sepX,sepY,scaleX,scaleY,yMode,quadrantsByMode,
    annotations,zoom,
    engineers,engGroups,nextEngGroupId,nextEngId,
    allocRows,nextAllocId,engDashGroupBy,
    skillDomains,
    ktPlans:_ktPlans,
    orgAnnotations:_orgAnnotations,
    orgPositions:_orgPositions,
    orgCollapsed:_orgCollapsed,
    orgLevelH:_orgLevelH,
    orgLevelNames:_orgLevelNames,
    orgScale:_orgScale,
    orgPanX:_orgPanX,
    orgPanY:_orgPanY,
    axis:{xName:V('ax-x-name'),xMin:V('ax-x-min'),xMax:V('ax-x-max'),
          yMin:V('ax-y-min'),yMax:V('ax-y-max'),grid:V('ax-grid')},
    nineBoxPlacements:_nineBoxPlacements,
    nineBoxHistory:_nineBoxHistory,nbYear:_nbYear,nbCompareYear:_nbCompareYear,
    discPlacements:_discPlacements,
    nbSwapAxes:_nbSwapAxes,
    planFilterEng:[...planFilterEng],planFilterProj:[...planFilterProj],
    engDashFilterEng:[...engDashFilterEng],engDashFilterProj:[...engDashFilterProj],
    resTitle:G('res-title-input')?G('res-title-input').value:'Resource Plan',
    resStart:G('res-start')?G('res-start').value:'',
    resEnd:G('res-end')?G('res-end').value:''
  };
  if(scope==='full')    return full;
  if(scope==='projects')return {projects,sections,nextId,nextTodoId,nextRiskId,nextMsId,nextSectionId,nextAnnotId,nextActionId,annotations,quadrantsByMode,sepX,sepY};
  if(scope==='roster')  return {engineers,engGroups,nextEngId,nextEngGroupId};
  if(scope==='resources')return {allocRows,nextAllocId,engineers,engGroups,nextEngId,nextEngGroupId,resStart:G('res-start')?G('res-start').value:'',resEnd:G('res-end')?G('res-end').value:''};
  return full;
}

function snapDiffLabel(snap){
  if(snap.meta){
    const m=snap.meta;
    const parts=[];
    if(m.projects!=null)   parts.push(m.projects+' proj');
    if(m.engineers!=null)  parts.push(m.engineers+' eng');
    if(m.allocRows!=null)  parts.push(m.allocRows+' alloc rows');
    return parts.join(' · ')||'—';
  }
  if(!snap.data) return '—';
  const d=snap.data;
  const parts=[];
  if(d.projects)   parts.push(d.projects.length+' proj');
  if(d.engineers)  parts.push(d.engineers.length+' eng');
  if(d.allocRows)  parts.push(d.allocRows.length+' alloc rows');
  if(d.annotations)parts.push(d.annotations.length+' annotations');
  return parts.join(' · ')||'—';
}

function diffVsCurrent(snap){
  const d=snap.data||(snap.meta?snap.meta:null);
  if(!d) return 'details in IDB';
  const diffs=[];
  if(d.projects!=null){
    const dc=(Array.isArray(d.projects)?d.projects.length:d.projects)-projects.length;
    if(dc!==0) diffs.push((dc>0?'+':'')+dc+' projects');
  }
  if(d.engineers!=null){
    const dc=(Array.isArray(d.engineers)?d.engineers.length:d.engineers)-engineers.length;
    if(dc!==0) diffs.push((dc>0?'+':'')+dc+' engineers');
  }
  if(d.allocRows!=null){
    const dc=(Array.isArray(d.allocRows)?d.allocRows.length:d.allocRows)-allocRows.length;
    if(dc!==0) diffs.push((dc>0?'+':'')+dc+' alloc rows');
  }
  return diffs.length?diffs.join(', '):'No difference in counts';
}

function takeSnap(label, scope, desc, auto){
  scope=scope||'full'; desc=desc||''; auto=auto||false;
  while(snapshots.length>=SNAP_MAX){
    var oldest=snapshots.shift();
    snapIdbDelete(oldest.id).catch(function(){});
  }
  var snap={
    id: Date.now(),
    label: label||'Snapshot',
    desc: desc,
    scope: scope,
    auto: auto,
    ts: new Date().toISOString(),
    data: captureScope(scope)
  };
  var _snapMeta={
    projects:snap.data&&snap.data.projects?snap.data.projects.length:0,
    engineers:snap.data&&snap.data.engineers?snap.data.engineers.length:0,
    allocRows:snap.data&&snap.data.allocRows?snap.data.allocRows.length:0
  };
  snapshots.push({id:snap.id,label:snap.label,ts:snap.ts,scope:snap.scope,
    auto:snap.auto,desc:snap.desc,meta:_snapMeta});
  snapIdbSave(snap).then(function(){
    updateSnapBadge();
  }).catch(function(err){
    console.warn('[EIM] Snapshot save failed, falling back to localStorage:',err);
    try{
      var raw=localStorage.getItem(SNAP_KEY);
      var lsSnaps=raw?JSON.parse(raw):[];
      lsSnaps.push(snap);
      if(lsSnaps.length>20)lsSnaps.shift();
      localStorage.setItem(SNAP_KEY,JSON.stringify(lsSnaps));
    }catch(e){}
    updateSnapBadge();
  });
  updateSnapBadge();
  return snap;
}

function restoreSnap(id){
  var meta=snapshots.find(function(s){return s.id===id;});
  if(!meta){alert('Snapshot not found.');return;}
  if(!confirm('Restore snapshot "'+meta.label+'"?\n\nScope: '+meta.scope.toUpperCase()+'\nTaken: '+new Date(meta.ts).toLocaleString()+'\n\nCurrent state will be auto-saved first.'))return;

  snapIdbGetData(id).then(function(data){
    if(!data){alert('Snapshot data not found in storage.');return;}

    takeSnap('Auto: before restore of "'+meta.label+'"','full','',true);

    var d=data;
    var scope=meta.scope;

    if(scope==='full'||scope==='projects'){
      if(d.projects)      projects=d.projects;
      if(d.sections)      sections=d.sections;
      if(d.nextId)        nextId=d.nextId;
      if(d.nextTodoId)    nextTodoId=d.nextTodoId;
      if(d.nextRiskId)    nextRiskId=d.nextRiskId;
      if(d.nextMsId)      nextMsId=d.nextMsId;
      if(d.nextSectionId) nextSectionId=d.nextSectionId;
      if(d.nextAnnotId)   nextAnnotId=d.nextAnnotId;
      if(d.nextActionId)  nextActionId=d.nextActionId;
      if(d.annotations)   annotations=d.annotations;
      if(d.quadrantsByMode) ['impact','visibility','enabler'].forEach(function(m){
        if(d.quadrantsByMode[m]) quadrantsByMode[m]=d.quadrantsByMode[m];
      });
      if(d.sepX!=null) sepX=d.sepX;
      if(d.sepY!=null) sepY=d.sepY;
      sanitiseProjects();
    }
    if(scope==='full'||scope==='roster'||scope==='resources'){
      if(d.engineers){
        engineers=d.engineers;
        engineers.forEach(function(e){
          if(!e.role)e.role='';
          if(!e.location)e.location='';
          if(e.groupId===undefined)e.groupId=null;
          if(!e.skills)e.skills=[];
          if(!e.idcard)e.idcard={};
          if(e.includeTalent===undefined)e.includeTalent=true;
        });
      }
      if(d.engGroups)      engGroups=d.engGroups;
      if(d.nextEngId)      nextEngId=d.nextEngId;
      if(d.nextEngGroupId) nextEngGroupId=d.nextEngGroupId;
    }
    if(scope==='full'||scope==='resources'){
      if(d.allocRows)  allocRows=d.allocRows;
      if(d.nextAllocId)nextAllocId=d.nextAllocId;
      if(d.resStart&&G('res-start'))G('res-start').value=d.resStart;
      if(d.resEnd&&G('res-end'))    G('res-end').value=d.resEnd;
    }
    if(scope==='full'){
      if(d.scaleX){scaleX=d.scaleX;setScale('x',scaleX);}
      if(d.scaleY){scaleY=d.scaleY;setScale('y',scaleY);}
      if(d.yMode){
        yMode=d.yMode;
        ['impact','visibility','enabler'].forEach(function(m){
          G('ym-'+m).classList.toggle('active',m===yMode);
        });
        G('y-label').textContent=Y_LABELS[yMode];
      }
      if(d.zoom)zoom=d.zoom;
      if(d.axis){
        var a=d.axis;
        SV('ax-x-name',a.xName||'Effort');SV('ax-x-min',a.xMin!=null?a.xMin:0);SV('ax-x-max',a.xMax!=null?a.xMax:10);
        SV('ax-y-min',a.yMin!=null?a.yMin:0);SV('ax-y-max',a.yMax!=null?a.yMax:10);SV('ax-grid',a.grid!=null?a.grid:5);
      }
      if(d.resTitle&&G('res-title-input'))G('res-title-input').value=d.resTitle;
      if(d.engDashGroupBy)engDashGroupBy=d.engDashGroupBy;
      if(d.skillDomains&&Array.isArray(d.skillDomains))skillDomains=d.skillDomains;
      if(d.ktPlans&&typeof d.ktPlans==='object')_ktPlans=d.ktPlans;
      if(d.orgAnnotations&&Array.isArray(d.orgAnnotations))_orgAnnotations=d.orgAnnotations;
      if(d.orgPositions&&typeof d.orgPositions==='object')_orgPositions=d.orgPositions;
      if(d.orgCollapsed&&typeof d.orgCollapsed==='object')_orgCollapsed=d.orgCollapsed;
      if(d.orgLevelH&&typeof d.orgLevelH==='object')_orgLevelH=d.orgLevelH;
      if(d.orgLevelNames&&typeof d.orgLevelNames==='object')_orgLevelNames=d.orgLevelNames;
      if(d.orgScale)_orgScale=d.orgScale;
      if(d.orgPanX!=null)_orgPanX=d.orgPanX;
      if(d.orgPanY!=null)_orgPanY=d.orgPanY;
      if(d.nineBoxPlacements&&typeof d.nineBoxPlacements==='object')_nineBoxPlacements=d.nineBoxPlacements;
      if(d.nineBoxHistory&&typeof d.nineBoxHistory==='object')_nineBoxHistory=d.nineBoxHistory;
      if(d.nbYear)_nbYear=d.nbYear;
      if(d.nbCompareYear!=null)_nbCompareYear=d.nbCompareYear;
      nbEnsureHistory();
      if(d.discPlacements&&typeof d.discPlacements==='object')_discPlacements=d.discPlacements;
      if(d.nbSwapAxes!=null)_nbSwapAxes=!!d.nbSwapAxes;
    }

    var photoPromises=[];
    engineers.forEach(function(eng){
      var ph=(eng.idcard||{}).photo||'';
      if(ph&&ph.startsWith('data:')){
        photoPromises.push(
          idbSavePhoto(eng.id,ph).then(function(){
            eng.idcard.photo='';
          })
        );
      }
    });
    Promise.all(photoPromises).then(function(){
      if(photoPromises.length){
        console.log('[EIM] Restored '+photoPromises.length+' photo(s) from snapshot to IDB');
        saveState();
      }
      idbPreloadAll().then(function(){
        if(G('org-overlay')&&G('org-overlay').style.display!=='none')renderOrgChart();
      });
    });

    saveState();talentIdbSave();
    onAxisChange(); render(); renderList();
    renderSnapBody();
  }).catch(function(err){
    alert('Failed to load snapshot data: '+err.message);
  });
}

function deleteSnap(id){
  snapshots=snapshots.filter(function(s){return s.id!==id;});
  updateSnapBadge();
  snapIdbDelete(id).then(function(){
    renderSnapBody();
  }).catch(function(){
    renderSnapBody();
  });
}

function snapExportAll(){
  if(!snapshots.length){alert('No snapshots to export.');return;}
  var promises=snapshots.map(function(meta){
    return snapIdbGetData(meta.id).then(function(data){
      return Object.assign({},meta,{data:data});
    });
  });
  Promise.all(promises).then(function(full){
    var blob=new Blob([JSON.stringify({version:2,exported:new Date().toISOString(),snapshots:full},null,2)],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='eim_snapshots_backup_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
  }).catch(function(err){alert('Export failed: '+err.message);});
}

function snapDeleteAllAuto(){
  var autos=snapshots.filter(function(s){return s.auto;});
  if(!autos.length){alert('No automatic snapshots to delete.');return;}
  if(!confirm('Delete '+autos.length+' automatic snapshot(s)?\nManual snapshots will be kept.'))return;
  var promises=autos.map(function(s){return snapIdbDelete(s.id);});
  Promise.all(promises).then(function(){
    snapshots=snapshots.filter(function(s){return !s.auto;});
    updateSnapBadge();renderSnapBody();
  });
}

function snapStorageInfo(){
  return snapIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(SNAP_IDB_STORE,'readonly');
      var req=tx.objectStore(SNAP_IDB_STORE).getAll();
      req.onsuccess=function(e){
        var all=e.target.result||[];
        var totalBytes=all.reduce(function(s,v){return s+JSON.stringify(v).length;},0);
        resolve({count:all.length,kb:Math.round(totalBytes/1024),mb:+(totalBytes/1048576).toFixed(2)});
      };
      req.onerror=function(e){reject(e.target.error);};
    });
  });
}

function exportSnap(id){
  const meta=snapshots.find(function(s){return s.id===id;});if(!meta)return;
  snapIdbGetData(id).then(function(data){
    if(!data){alert('Snapshot data not found.');return;}
    const full=Object.assign({},meta,{data:data});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(full,null,2)],{type:'application/json'}));
    a.download='snapshot_'+meta.label.replace(/[^a-z0-9]/gi,'_')+'.json';
    a.click();
  }).catch(function(err){alert('Export failed: '+err.message);});
}

function importSnapFile(){ G('snap-import-input').click(); }

function handleSnapImport(ev){
  const file=ev.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const snap=JSON.parse(e.target.result);
      if(snap.data&&snap.label&&snap.ts){
        loadSnaps();
        snap.id=Date.now();
        snap.label='[Imported] '+snap.label;
        while(snapshots.length>=SNAP_MAX) snapshots.shift();
        snapshots.push(snap);
        saveSnaps();
        updateSnapBadge();
        renderSnapBody();
        alert('Snapshot imported: "'+snap.label+'"\nYou can now restore it from the list.');
      } else if(snap.projects){
        if(!confirm('This looks like a full project export, not a snapshot.\n\nImport it as a new snapshot so you can restore it?'))return;
        const newSnap={
          id:Date.now(),
          label:'[Imported from file] '+file.name.replace('.json',''),
          desc:'Imported on '+new Date().toLocaleString(),
          scope:'full',
          auto:false,
          ts:new Date().toISOString(),
          data:snap
        };
        while(snapshots.length>=SNAP_MAX){
          var old3=snapshots.shift();
          snapIdbDelete(old3.id).catch(function(){});
        }
        snapshots.push({id:newSnap.id,label:newSnap.label,ts:newSnap.ts,scope:newSnap.scope||'full',auto:false,desc:newSnap.desc||''});
        snapIdbSave(newSnap).then(function(){
          updateSnapBadge();
          renderSnapBody();
          var importPhotos=[];
          if(snap.engineers){
            snap.engineers.forEach(function(eng){
              var ph=(eng.idcard||{}).photo||'';
              if(ph&&ph.startsWith('data:')){
                importPhotos.push(idbSavePhoto(eng.id,ph));
              }
            });
          }
          Promise.all(importPhotos).then(function(){
            if(importPhotos.length)idbUpdateStatus();
            alert('Snapshot imported: '+newSnap.label);
          });
        }).catch(function(err){alert('Import failed: '+err.message);});
      } else {
        alert('File format not recognised.\n\nExpected a snapshot file (exported via ↓ EXPORT on a snapshot card)\nor a full project JSON (exported via ↓ EXPORT JSON in the header).');
      }
    } catch(err){
      alert('Import failed: '+err.message);
    }
    ev.target.value='';
  };
  reader.readAsText(file);
}

function updateSnapBadge(){
  const n=snapshots.length;
  const el=G('snap-btn');
  if(!el)return;
  el.textContent=`🕐 SNAPSHOTS${n?` (${n})`:''}`;
  el.style.borderColor=n>=SNAP_WARN?'var(--danger)':n>0?'var(--accent2)':'';
  el.style.color=n>=SNAP_WARN?'var(--danger)':n>0?'var(--accent2)':'';
}

function openSnap(){
  setActivePill('SNAPSHOTS');
  G('snap-overlay').classList.add('show');
  G('snap-body').innerHTML='<div style="padding:20px;text-align:center;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px">Loading snapshots…</div>';
  loadSnapsAsync().then(function(){renderSnapBody();}).catch(function(){renderSnapBody();});
}
function closeSnap(){
  clearActivePill(); G('snap-overlay').classList.remove('show'); }

function renderSnapBody(){
  const n=snapshots.length;
  G('snap-count-badge').textContent=n+'/'+SNAP_MAX+' snapshots · IndexedDB';
  let h='';

  if(n>=SNAP_WARN){
    h+=`<div class="snap-warning">⚠ ${n} of ${SNAP_MAX} snapshot slots used. Oldest will be auto-pruned when taking new snapshots.</div>`;
  }

  h+=`<div id="new-snap-form">
    <h3>TAKE NEW SNAPSHOT</h3>
    <div class="snap-form-row">
      <div class="snap-form-field" style="flex:2">
        <label>LABEL</label>
        <input type="text" id="snap-new-label" placeholder="e.g. Before Q3 review" value="">
      </div>
      <div class="snap-form-field">
        <label>SCOPE</label>
        <select id="snap-new-scope">
          <option value="full">Full — everything</option>
          <option value="projects">Projects + sections</option>
          <option value="roster">Roster only</option>
          <option value="resources">Resources (alloc + roster)</option>
        </select>
      </div>
      <div class="snap-form-field" style="flex:2">
        <label>DESCRIPTION (optional)</label>
        <input type="text" id="snap-new-desc" placeholder="Optional note…">
      </div>
      <button class="primary" style="align-self:flex-end;padding:6px 16px" onclick="manualSnap()">📷 SNAPSHOT</button>
    </div>
  </div>`;

  if(!n){
    h+=`<div style="text-align:center;padding:40px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:12px">No snapshots yet.<br>Take your first one above.</div>`;
  } else {
    h+=`<div class="snap-grid">`;
    [...snapshots].reverse().forEach((snap,ri)=>{
      const isFirst=(ri===0);
      const date=new Date(snap.ts);
      const dateStr=date.toLocaleDateString('en',{day:'2-digit',month:'short',year:'numeric'})+' '+date.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
      const scopeClass={full:'full',projects:'projects',roster:'roster',resources:'resources'}[snap.scope]||'full';
      const diff=diffVsCurrent(snap);
      h+=`<div class="snap-card${isFirst?' current':''}">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;padding-top:2px">
          <div style="font-size:22px">${snap.auto?'🤖':'📷'}</div>
          ${isFirst?`<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--accent);letter-spacing:.04em">LATEST</div>`:''}
        </div>
        <div class="snap-meta">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${snapDiffLabel(snap)||'—'}</div>
          <div class="snap-name" style="font-size:10px;color:var(--accent2)">${escH(snap.label)}</div>
          <div class="snap-date">${dateStr}</div>
          ${snap.desc?`<div class="snap-desc">${escH(snap.desc)}</div>`:''}
          <div class="snap-badges" style="margin-top:4px">
            <span class="snap-badge ${scopeClass}">${snap.scope.toUpperCase()}</span>
            ${snap.auto?'<span class="snap-badge auto">AUTO</span>':''}
          </div>
          ${diff&&diff!=='No difference in counts'&&diff!=='details in IDB'
            ?`<div class="snap-diff" style="margin-top:3px">Δ vs current: <span class="chg">${diff}</span></div>`:''}
        </div>
        <div class="snap-actions">
          <button class="sm primary" onclick="restoreSnap(${snap.id})">⇐ RESTORE</button>
          <button class="sm" onclick="exportSnap(${snap.id})">↓ EXPORT</button>
          <button class="sm danger" onclick="deleteSnap(${snap.id})">× DELETE</button>
        </div>
      </div>`;
    });
    h+=`</div>`;
  }

  G('snap-body').innerHTML=h;
}

function manualSnap(){
  const label=(G('snap-new-label').value||'').trim()||('Snapshot '+new Date().toLocaleTimeString());
  const scope=V('snap-new-scope');
  const desc=(G('snap-new-desc').value||'').trim();
  takeSnap(label,scope,desc,false);
  SV('snap-new-label',''); SV('snap-new-desc','');
  renderSnapBody();
}

function checkDailySnap(){
  const today=new Date().toISOString().slice(0,10);
  const lastKey='eim_last_daily_snap';
  const last=localStorage.getItem(lastKey)||'';
  if(last===today)return;
  localStorage.setItem(lastKey,today);
  takeSnap('Daily auto: '+today,'full','Automatic daily snapshot',true);
}
