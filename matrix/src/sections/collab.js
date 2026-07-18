/* ►► SECTION: COLLAB ◄◄ Real-time multi-user sync (Yjs + y-websocket relay)
 *
 * Phase A of the multi-user roadmap (see ../matrix-relay/ARCHITECTURE.md and
 * Matrix ARCHITECTURE.md › The uid identity model). Everything here is
 * `collab`/`_collab`-prefixed (flat-bundle duplicate-declaration rule).
 *
 * HOW IT WORKS
 *   - Yjs + y-websocket + y-indexeddb are dynamically import()-ed from a CDN the
 *     first time the user connects — nothing is bundled (same pattern as ai.js /
 *     WebLLM). An import map in index.html pins ONE copy of yjs so y-websocket
 *     binds to the same instance (the "loaded twice" gotcha from relay DEPLOY.md).
 *   - State is mirrored into entity-level Y.Maps keyed by the durable `uid`:
 *     engineers / projects / allocRows, plus one `meta` map for the rest of the
 *     saved payload (LWW per key).
 *   - JOIN / MERGE model (see collabReconcile): the last-synced state is captured
 *     from IndexedDB (the "base") BEFORE the relay syncs. First time in a room →
 *     seed (empty room) or adopt (populated). Returning to a room you've synced
 *     before → a 3-WAY MERGE (base vs your local vs the room): only-you-changed
 *     keeps yours, only-they-changed takes theirs, BOTH-changed is a conflict
 *     (yours stays live, theirs is preserved in the change log). This is what lets
 *     edits made while fully offline merge in on reconnect instead of being lost.
 *   - CHANGE / CONFLICT LOG (collabLog*): an append-only, per-actor log of creates,
 *     deletes, and conflicts. It lives in the Y.Doc (a Y.Array, so it syncs to every
 *     peer and merges without conflict — unique ids) AND mirrors to a local store
 *     (eim_collab_log) so it survives offline/reload. This is the seed of the future
 *     multi-user AUDIT LOG: entries already carry actor/ts/before/after; swapping the
 *     self-declared actor for a verified identity later is additive, no model change.
 *   - Conflicts never lose data: the overwritten value is kept in the log, so a
 *     future "restore this version" action can recover it.
 *   - Security: random 128-bit room id (#1), token as a connection param (#2),
 *     secrets in the URL #fragment never the query (#3) — the patterns proven in
 *     ../matrix-relay/test/sync-test.html.
 *
 * KNOWN v1 LIMITATIONS (documented, deliberate):
 *   - Intra-dataset references (allocRow.engId, idcard.reportsTo) are still keyed
 *     by the per-dataset `id`, not `uid`. Safe for keeping your OWN computers in
 *     sync and mostly-sequential collaboration; two users creating brand-new
 *     people at the same time offline can produce id-ref ambiguity. uid-refs +
 *     field-level CRDT are the next phase.
 *   - Only CREATE / DELETE / CONFLICT are logged (not every field edit). Full
 *     per-update audit is the next increment on top of this same log.
 *   - Photos are NOT synced (out-of-band in IndexedDB). No E2E yet (Phase B).
 */

/* ── CDN modules (import(VAR) so build.js doesn't strip it; ?external=yjs makes
   the provider reuse the import-map-pinned yjs, not a second copy). ── */
// `?external=yjs` makes esm.sh reuse the import-map-pinned yjs instead of bundling a
// second copy. Split so the literal `external=` never appears on one line — build.js's
// line-based duplicate-decl checker would otherwise read it as declaring `external`.
const COLLAB_EXT='?external'+'=yjs';
const COLLAB_YJS_URL='https://esm.sh/yjs@13.6.10';
const COLLAB_WS_URL='https://esm.sh/y-websocket@1.5.4'+COLLAB_EXT;
const COLLAB_IDB_URL='https://esm.sh/y-indexeddb@9.0.12'+COLLAB_EXT;
const COLLAB_KEY='eim_collab';             // localStorage: relay/token/room/actor/auto prefs
const COLLAB_LOG_KEY='eim_collab_log';     // localStorage: the change/conflict log (audit seed)
const COLLAB_LOG_CAP=1000;                 // local log cap (a real audit log offloads to the server)
const COLLAB_DEFAULT_RELAY='wss://shrouded-peak-70323-cec8c0279fd8.herokuapp.com';

/* ── Module state ── */
let _collabYjs=null, _collabWS=null, _collabIdb=null;   // cached CDN modules
let _collabDoc=null, _collabProvider=null, _collabPersist=null;
let _collabYEng=null, _collabYProj=null, _collabYAlloc=null, _collabYMeta=null, _collabYLog=null;
let _collabConnected=false;      // provider is live (may still be syncing)
let _collabReconciled=false;     // the join/merge decision has been made for this session
let _collabApplying=false;       // applying a remote change / reconciling → suppress local push (echo guard)
let _collabStatus='idle';        // idle | loading | connecting | synced | offline | stalled | error
let _collabPeers=1;              // awareness state count (this tab + others)
let _collabApplyTimer=null;      // debounce for remote-apply (batches multi-map events)
let _collabDirtyView=false;      // a remote change arrived while a field was focused → re-render once it's free
let _collabFlushTimer=null;      // polls to flush a deferred re-render when no field is focused
let _collabConnectWatch=null;    // watchdog: flags a stalled relay connection (bad URL/token/relay down)
let _collabBase=null;            // last-synced snapshot {eng,proj,alloc,meta} captured before the relay syncs
let _collabLog=[];               // local mirror of the append-only change/conflict log
const _collabLogSeen={};         // entry id -> 1 (dedupe; kept even after local trim so trimmed entries don't re-add)
const _collabLastJson={};        // uid -> last-pushed JSON, so unchanged entities aren't re-sent
let _collabCfg={relay:'',token:'',room:'',actor:'',auto:false};

/* Meta keys = everything in the saved payload that isn't an entity array. Synced
   whole-value per key (LWW). Each maps a Y.Map key to the real global (some are
   underscore-prefixed; finExclude is a Set). Deliberately EXCLUDES transient view
   state (zoom, filters, active tab, axis inputs) — those stay per-machine. */
const COLLAB_META=[
  {k:'sections',        get:()=>sections,           set:v=>{sections=v;}},
  {k:'engGroups',       get:()=>engGroups,          set:v=>{engGroups=v;}},
  {k:'skillDomains',    get:()=>skillDomains,       set:v=>{skillDomains=v;}},
  {k:'skillCats',       get:()=>skillCats,          set:v=>{skillCats=v;}},
  {k:'gateConfig',      get:()=>gateConfig,         set:v=>{gateConfig=v;}},
  {k:'quadrantsByMode', get:()=>quadrantsByMode,    set:v=>{quadrantsByMode=v;}},
  {k:'annotations',     get:()=>annotations,        set:v=>{annotations=v;}},
  {k:'nineBoxHistory',  get:()=>_nineBoxHistory,    set:v=>{_nineBoxHistory=v;}},
  {k:'nbYear',          get:()=>_nbYear,            set:v=>{_nbYear=v;}},
  {k:'nbCompareYear',   get:()=>_nbCompareYear,     set:v=>{_nbCompareYear=v;}},
  {k:'discPlacements',  get:()=>_discPlacements,    set:v=>{_discPlacements=v;}},
  {k:'nbSwapAxes',      get:()=>_nbSwapAxes,        set:v=>{_nbSwapAxes=!!v;}},
  {k:'ktPlans',         get:()=>_ktPlans,           set:v=>{_ktPlans=v;}},
  {k:'finExclude',      get:()=>[..._finExclude],   set:v=>{_finExclude=new Set(v||[]);}},
  // Id counters ride along so new entities advance past the room's high-water mark.
  {k:'nextId',          get:()=>nextId,             set:v=>{nextId=Math.max(nextId,v||1);}},
  {k:'nextEngId',       get:()=>nextEngId,          set:v=>{nextEngId=Math.max(nextEngId,v||1);}},
  {k:'nextAllocId',     get:()=>nextAllocId,        set:v=>{nextAllocId=Math.max(nextAllocId,v||1);}},
  {k:'nextEngGroupId',  get:()=>nextEngGroupId,     set:v=>{nextEngGroupId=Math.max(nextEngGroupId,v||1);}},
  {k:'nextSectionId',   get:()=>nextSectionId,      set:v=>{nextSectionId=Math.max(nextSectionId,v||1);}},
  {k:'nextTodoId',      get:()=>nextTodoId,         set:v=>{nextTodoId=Math.max(nextTodoId,v||1);}},
  {k:'nextRiskId',      get:()=>nextRiskId,         set:v=>{nextRiskId=Math.max(nextRiskId,v||1);}},
  {k:'nextMsId',        get:()=>nextMsId,           set:v=>{nextMsId=Math.max(nextMsId,v||1);}},
  {k:'nextActionId',    get:()=>nextActionId,       set:v=>{nextActionId=Math.max(nextActionId,v||1);}},
  {k:'nextAnnotId',     get:()=>nextAnnotId,        set:v=>{nextAnnotId=Math.max(nextAnnotId,v||1);}},
];
// Meta keys allowed to generate a CONFLICT log entry (the data-bearing ones). Counters
// and view-ish keys resolve silently (max/LWW) — a counter "conflict" isn't meaningful.
const COLLAB_META_LOGGABLE={ sections:1, engGroups:1, skillDomains:1, skillCats:1, gateConfig:1,
  quadrantsByMode:1, nineBoxHistory:1, discPlacements:1, ktPlans:1, finExclude:1 };

/* ── Config persistence (tiny UI-only key, separate from SK app state) ── */
function collabLoadCfg(){
  try{ var p=JSON.parse(localStorage.getItem(COLLAB_KEY)||'null');
       if(p&&typeof p==='object'){ _collabCfg.relay=p.relay||''; _collabCfg.token=p.token||''; _collabCfg.room=p.room||'';
         _collabCfg.actor=p.actor||''; _collabCfg.auto=!!p.auto; } }catch(e){}
  if(!_collabCfg.relay) _collabCfg.relay=COLLAB_DEFAULT_RELAY;
  if(!_collabCfg.actor) _collabCfg.actor='User-'+collabRndHex(2);   // self-declared identity (audit attribution)
}
function collabSaveCfg(){
  try{ localStorage.setItem(COLLAB_KEY,JSON.stringify(_collabCfg)); }catch(e){}
}

/* ── Random ids / share link (security patterns #1 + #3) ── */
function collabRndHex(n){
  var b=new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map(function(x){return x.toString(16).padStart(2,'0');}).join('');
}
function collabShareLink(){
  var q=new URLSearchParams({relay:_collabCfg.relay,room:_collabCfg.room||'',token:_collabCfg.token||''});
  return location.origin+location.pathname+'#collab&'+q.toString();
}
// Parse a share-link fragment (#collab&relay=…&room=…&token=…) into cfg. Returns
// true if it carried collab params. Secrets ride the fragment, never the query.
function collabReadHash(){
  var h=location.hash.slice(1); if(h.indexOf('collab')<0) return false;
  var p=new URLSearchParams(h.replace(/^collab&?/,''));
  if(p.get('relay')) _collabCfg.relay=p.get('relay');
  if(p.get('room'))  _collabCfg.room=p.get('room');
  if(p.get('token'))_collabCfg.token=p.get('token');
  return !!p.get('room');
}

/* ══════════════════════════════════════════════════════════════════════
   CHANGE / CONFLICT LOG (the audit-log seed)
   ══════════════════════════════════════════════════════════════════════ */
// One append-only log entry. Forward-compatible with a multi-user audit log: it
// already carries who/when/what + before/after; a verified identity later just
// replaces `actor`. `conflict` is set only for concurrent-edit conflicts.
function collabMkEntry(action,entityType,entityUid,label,extra){
  var e={ id:newUid(), ts:new Date().toISOString(), actor:_collabCfg.actor||'?',
          action:action, entityType:entityType, entityUid:entityUid||'', label:label||'' };
  if(extra) for(var k in extra) e[k]=extra[k];
  return e;
}
function collabLabelOf(type,obj){
  if(!obj||typeof obj!=='object') return '';
  if(type==='engineer') return obj.name||'(unnamed person)';
  if(type==='project')  return obj.name||'(unnamed project)';
  if(type==='allocRow') return '(allocation)';
  return type;
}
function collabLogLoad(){
  try{ var a=JSON.parse(localStorage.getItem(COLLAB_LOG_KEY)||'[]');
       if(Array.isArray(a)){ _collabLog=a; a.forEach(function(en){ if(en&&en.id) _collabLogSeen[en.id]=1; }); } }catch(e){}
}
function collabLogPersist(){
  try{ localStorage.setItem(COLLAB_LOG_KEY,JSON.stringify(_collabLog)); }catch(e){}
}
// Append locally (dedup by id, cap length) and, when connected, into the synced
// Y.Array so peers converge on the same log.
function collabLogAppend(entry){
  if(!entry||!entry.id||_collabLogSeen[entry.id]) return;
  _collabLogSeen[entry.id]=1;
  _collabLog.push(entry);
  if(_collabLog.length>COLLAB_LOG_CAP) _collabLog.splice(0,_collabLog.length-COLLAB_LOG_CAP);
  collabLogPersist();
  if(_collabYLog&&_collabDoc){ try{ _collabDoc.transact(function(){ _collabYLog.push([entry]); },'local'); }catch(e){} }
  collabRefreshHistory();
}
// Merge any log entries from the synced Y.Array that we don't have locally.
function collabLogMergeFromDoc(){
  if(!_collabYLog) return;
  var added=false;
  _collabYLog.toArray().forEach(function(en){
    if(en&&en.id&&!_collabLogSeen[en.id]){ _collabLogSeen[en.id]=1; _collabLog.push(collabClone(en)); added=true; }
  });
  if(added){
    _collabLog.sort(function(a,b){ return (a.ts<b.ts)?-1:(a.ts>b.ts?1:0); });
    if(_collabLog.length>COLLAB_LOG_CAP) _collabLog.splice(0,_collabLog.length-COLLAB_LOG_CAP);
    collabLogPersist(); collabRefreshHistory();
  }
}
function collabConflictCount(){ return _collabLog.filter(function(e){return e.action==='conflict';}).length; }

/* ── Load the CDN libraries once (with a timeout so a blocked/slow CDN fails loudly
   instead of hanging on "loading" forever) ── */
function collabLoadLibs(){
  if(_collabYjs&&_collabWS&&_collabIdb) return Promise.resolve();
  _collabStatus='loading'; collabRefreshPanel();
  var load=Promise.all([import(COLLAB_YJS_URL),import(COLLAB_WS_URL),import(COLLAB_IDB_URL)])
    .then(function(mods){ _collabYjs=mods[0]; _collabWS=mods[1]; _collabIdb=mods[2]; });
  var timeout=new Promise(function(_,rej){ setTimeout(function(){
    rej(new Error('Timed out loading the collaboration library from the CDN (esm.sh). Are you online? Is esm.sh blocked on this network?'));
  },15000); });
  return Promise.race([load,timeout]);
}

/* ── Connect / disconnect ── */
function collabConnect(){
  if(!_collabCfg.relay){ alert(t('Enter a relay URL first.')); return; }
  if(!_collabCfg.room)  _collabCfg.room=collabRndHex(16);
  _collabCfg.auto=true;                 // remember: auto-rejoin this room on next load
  collabSaveCfg();
  _collabStatus='connecting'; _collabReconciled=false; _collabBase=null; collabRefreshPanel();
  if(!_collabFlushTimer) _collabFlushTimer=setInterval(collabFlushDirty,700);
  collabLoadLibs().then(function(){
    // Library loaded — the next wait is the RELAY, not the library. Say so, or a
    // failed/slow relay looks like a stuck "loading library" (it isn't).
    _collabStatus='connecting'; collabRefreshPanel();
    collabStartConnectWatch();
    var Y=_collabYjs;
    _collabDoc=new Y.Doc();
    _collabYEng=_collabDoc.getMap('engineers');
    _collabYProj=_collabDoc.getMap('projects');
    _collabYAlloc=_collabDoc.getMap('allocRows');
    _collabYMeta=_collabDoc.getMap('meta');
    _collabYLog=_collabDoc.getArray('log');
    // Offline-first: local IndexedDB persistence, keyed by room id.
    _collabPersist=new _collabIdb.IndexeddbPersistence('matrix-collab-'+_collabCfg.room,_collabDoc);
    // Capture BASE (the last state THIS client synced) from IndexedDB BEFORE the relay
    // merges others' changes in — 3-way merge needs it. Then open the relay socket.
    _collabPersist.whenSynced.then(function(){
      _collabBase=collabSnapshot();
      collabLogMergeFromDoc();      // pull any locally-persisted log entries from the doc
      _collabProvider=new _collabWS.WebsocketProvider(_collabCfg.relay,_collabCfg.room,_collabDoc,
        { params:{ token:_collabCfg.token||'' } });

      _collabProvider.on('status',function(e){
        _collabConnected=(e.status==='connected');
        if(_collabStatus!=='synced') _collabStatus=(e.status==='disconnected')?'offline':'connecting';
        collabUpdateBadge(); collabRefreshPanel();
      });
      _collabProvider.on('sync',function(isSynced){
        if(isSynced){ _collabStatus='synced'; clearTimeout(_collabConnectWatch); collabReconcile(); }
        collabUpdateBadge(); collabRefreshPanel();
      });
      _collabProvider.awareness.setLocalStateField('user',{ name:_collabCfg.actor||'?', t:Date.now() });
      _collabProvider.awareness.on('change',function(){
        _collabPeers=_collabProvider.awareness.getStates().size||1;
        collabUpdateBadge(); collabRefreshPanel();
      });
      // Steady-state: remote entity/meta changes → rebuild local; log changes → merge.
      [_collabYEng,_collabYProj,_collabYAlloc,_collabYMeta].forEach(function(m){
        m.observe(function(ev,tr){ if(tr&&tr.origin==='local') return; collabScheduleApply(); });
      });
      _collabYLog.observe(function(ev,tr){ if(tr&&tr.origin==='local') return; collabLogMergeFromDoc(); });
    });
  }).catch(function(err){
    console.error('[EIM] collab connect failed:',err);
    _collabStatus='error'; collabRefreshPanel();
    alert(t('Could not load the collaboration library (offline or blocked):')+'\n'+(err&&err.message||err));
  });
}

// If we're still not synced a while after the library loaded, the RELAY is the problem
// (unreachable URL, wrong/missing token → 401, or the relay app is down/asleep). Flag it
// with an actionable message instead of an ambiguous spinner.
function collabStartConnectWatch(){
  clearTimeout(_collabConnectWatch);
  _collabConnectWatch=setTimeout(function(){
    if(_collabStatus!=='synced'&&_collabStatus!=='idle'){ _collabStatus='stalled'; collabRefreshPanel(); }
  },12000);
}

function collabDisconnect(){
  try{ if(_collabProvider) _collabProvider.destroy(); }catch(e){}
  try{ if(_collabPersist)  _collabPersist.destroy(); }catch(e){}
  clearInterval(_collabFlushTimer); _collabFlushTimer=null;
  clearTimeout(_collabConnectWatch); _collabConnectWatch=null;
  _collabProvider=null; _collabPersist=null; _collabDoc=null;
  _collabYEng=_collabYProj=_collabYAlloc=_collabYMeta=_collabYLog=null;
  _collabConnected=false; _collabReconciled=false; _collabStatus='idle'; _collabPeers=1; _collabDirtyView=false; _collabBase=null;
  Object.keys(_collabLastJson).forEach(function(k){ delete _collabLastJson[k]; });
  _collabCfg.auto=false; collabSaveCfg();   // manual disconnect → don't auto-rejoin
  collabUpdateBadge(); collabRefreshPanel();
}

/* ── Snapshots / indexing helpers for the 3-way merge ── */
function collabArrIndex(arr){ var o={}; (arr||[]).forEach(function(x){ if(x&&x.uid) o[x.uid]=x; }); return o; }
function collabMapSnapshot(ymap){ var o={}; if(ymap) ymap.forEach(function(v,k){ o[k]=collabClone(v); }); return o; }
function collabSnapshot(){
  var meta={}; COLLAB_META.forEach(function(m){ if(_collabYMeta&&_collabYMeta.has(m.k)) meta[m.k]=collabClone(_collabYMeta.get(m.k)); });
  return { eng:collabMapSnapshot(_collabYEng), proj:collabMapSnapshot(_collabYProj),
           alloc:collabMapSnapshot(_collabYAlloc), meta:meta };
}

/* ══════════════════════════════════════════════════════════════════════
   RECONCILE — runs once, on the first relay sync
   ══════════════════════════════════════════════════════════════════════ */
function collabReconcile(){
  if(_collabReconciled||!_collabDoc) return;
  _collabReconciled=true;
  _collabApplying=true;
  try{
    var base=_collabBase||{eng:{},proj:{},alloc:{},meta:{}};
    var baseEmpty=(Object.keys(base.eng).length===0&&Object.keys(base.proj).length===0&&Object.keys(base.alloc).length===0);
    var remotePopulated=(_collabYEng.size>0||_collabYProj.size>0||_collabYAlloc.size>0);

    if(baseEmpty){
      // FIRST time in this room (no prior sync). Not a merge — a join.
      if(!remotePopulated){
        collabSeed();                         // empty room ← push my data
      } else {
        var mine=(engineers.length||projects.length||allocRows.length);
        var msg=t('This room already has data ({e} people, {p} projects). Load it and REPLACE what is currently open?',
          {e:_collabYEng.size,p:_collabYProj.size});
        if(!mine || confirm(msg)) collabAdoptFromDoc();   // take the room
        else collabSeed();                                 // keep mine → push into the room
      }
    } else {
      // RETURNING to a room I've synced before → 3-way merge (this is what makes
      // edits made while fully offline merge in, and where conflicts get logged).
      _collabDoc.transact(function(){
        var mEng=collab3way(base.eng, collabArrIndex(engineers), collabMapSnapshot(_collabYEng), 'engineer', _collabYEng);
        var mProj=collab3way(base.proj, collabArrIndex(projects), collabMapSnapshot(_collabYProj), 'project', _collabYProj);
        var mAlloc=collab3way(base.alloc, collabArrIndex(allocRows), collabMapSnapshot(_collabYAlloc), 'allocRow', _collabYAlloc);
        engineers=Object.keys(mEng).map(function(k){return mEng[k];});
        projects=Object.keys(mProj).map(function(k){return mProj[k];});
        allocRows=Object.keys(mAlloc).map(function(k){return mAlloc[k];});
        collabMetaReconcile(base.meta);
      },'local');
      collabAdoptLocalAfterMerge();
    }
  }catch(e){ console.error('[EIM] collabReconcile failed:',e); }
  _collabApplying=false;
}

// Per-entity 3-way. Returns the merged {uid:obj}. Pushes MY winning values into the
// Y.Map (so peers get my resolution). Logs conflicts (both values preserved).
function collab3way(base,local,remote,type,ymap){
  var out={};
  var uids={}; [base,local,remote].forEach(function(m){ for(var k in m) uids[k]=1; });
  Object.keys(uids).forEach(function(uid){
    var b=base[uid], l=local[uid], r=remote[uid];
    var bj=b?JSON.stringify(b):undefined, lj=l?JSON.stringify(l):undefined, rj=r?JSON.stringify(r):undefined;
    if(lj===rj){ if(r) out[uid]=r; }                                   // agree (or both deleted)
    else if(lj===bj){ if(r) out[uid]=r; else ymap.delete(uid); }        // only THEY changed → take theirs (incl. their delete)
    else if(rj===bj){                                                   // only I changed → keep mine, push
      if(l){ out[uid]=l; ymap.set(uid,collabClone(l)); } else { ymap.delete(uid); }
    } else {                                                            // BOTH changed → conflict
      if(l){ out[uid]=l; ymap.set(uid,collabClone(l));
             collabLogAppend(collabMkEntry('conflict',type,uid,collabLabelOf(type,l),{conflict:{kept:collabClone(l),overwritten:collabClone(r)}})); }
      else { out[uid]=r;                                                // I deleted, they edited → keep theirs (don't lose data)
             collabLogAppend(collabMkEntry('conflict',type,uid,collabLabelOf(type,r),{conflict:{kept:collabClone(r),overwritten:'(deleted locally)'}})); }
    }
  });
  return out;
}

// 3-way over the meta map (per key, whole-value). Applies the winner to the live
// global and pushes mine when I win; logs conflicts for the data-bearing keys.
function collabMetaReconcile(baseMeta){
  COLLAB_META.forEach(function(m){
    var b=baseMeta[m.k], l=m.get(), r=(_collabYMeta.has(m.k))?_collabYMeta.get(m.k):undefined;
    var bj=JSON.stringify(b), lj=JSON.stringify(l), rj=(r!==undefined)?JSON.stringify(r):undefined;
    if(lj===rj){ if(r!==undefined) m.set(collabClone(r)); }
    else if(lj===bj){ if(r!==undefined) m.set(collabClone(r)); }        // only they changed → theirs
    else if(rj===bj){ _collabYMeta.set(m.k,collabClone(l)); }           // only I changed → mine, push
    else {                                                              // both changed
      _collabYMeta.set(m.k,collabClone(l));                            // keep mine live + push
      if(COLLAB_META_LOGGABLE[m.k])
        collabLogAppend(collabMkEntry('conflict','meta',m.k,m.k,{conflict:{kept:'(kept your version)',overwritten:'(the other version was overwritten)'}}));
    }
  });
}

// Finish a merge: re-sanitise, refresh caches, persist, re-render. (Mirrors the tail
// of collabApplyRemote but for the merged-into-local case.)
function collabAdoptLocalAfterMerge(){
  engineers.forEach(function(e){ sanitiseEngineer(e); });
  allocRows.forEach(function(r){ if(!r.allocs)r.allocs={}; if(r.engId===undefined)r.engId=null; if(r.projectId===undefined)r.projectId=null; if(r.budgetLine===undefined)r.budgetLine=''; });
  try{ sanitiseProjects(); }catch(e){}
  try{ sanitiseGateConfig(); }catch(e){}
  nbEnsureHistory(); uidMigrate();
  collabRebuildJsonCache();
  _invalidateMemo(); saveNow(); collabRerender();
}

/* Local → remote: write local arrays into the Y.Maps (only changed entities) + meta.
   Emits create/delete log entries. One 'local' transaction so our observer ignores it. */
function collabPush(){
  // NOT gated on _collabConnected — offline-first: edits must land in the Y.Doc even
  // with no relay (y-indexeddb persists; y-websocket syncs on reconnect). Gated on
  // _collabReconciled so we don't push before the join/merge decision is made.
  if(!_collabReconciled||_collabApplying||!_collabDoc) return;
  try{
    _collabDoc.transact(function(){
      collabSyncArray(engineers,_collabYEng,'engineer',true);
      collabSyncArray(projects,_collabYProj,'project',true);
      collabSyncArray(allocRows,_collabYAlloc,'allocRow',true);
      COLLAB_META.forEach(function(m){ _collabYMeta.set(m.k,collabClone(m.get())); });
    },'local');
  }catch(e){ console.warn('[EIM] collabPush failed:',e); }
}
// collabSeed: the initial push into a fresh/kept-local room. logChanges=false so the
// whole dataset isn't logged as a burst of "creates".
function collabSeed(){
  try{
    _collabDoc.transact(function(){
      collabSyncArray(engineers,_collabYEng,'engineer',false);
      collabSyncArray(projects,_collabYProj,'project',false);
      collabSyncArray(allocRows,_collabYAlloc,'allocRow',false);
      COLLAB_META.forEach(function(m){ _collabYMeta.set(m.k,collabClone(m.get())); });
    },'local');
  }catch(e){ console.warn('[EIM] collabSeed failed:',e); }
}

function collabSyncArray(arr,ymap,type,logChanges){
  var seen={};
  arr.forEach(function(o){
    if(!o.uid) o.uid=newUid();
    seen[o.uid]=1;
    var js=JSON.stringify(o);
    if(_collabLastJson[o.uid]!==js){
      var isNew=!(o.uid in _collabLastJson) && !ymap.has(o.uid);
      ymap.set(o.uid,JSON.parse(js));
      if(logChanges&&isNew) collabLogAppend(collabMkEntry('create',type,o.uid,collabLabelOf(type,o)));
      _collabLastJson[o.uid]=js;
    }
  });
  [...ymap.keys()].forEach(function(k){
    if(!seen[k]){
      if(logChanges) collabLogAppend(collabMkEntry('delete',type,k,collabLabelOf(type,ymap.get(k))));
      ymap.delete(k); delete _collabLastJson[k];
    }
  });
}

/* ── Remote → local (steady state): batch map events into one apply ── */
function collabScheduleApply(){
  clearTimeout(_collabApplyTimer);
  _collabApplyTimer=setTimeout(collabApplyRemote,60);
}
function collabApplyRemote(){
  if(!_collabDoc||!_collabReconciled) return;
  _collabApplying=true;
  try{ collabAdoptFromDoc(); }
  catch(e){ console.error('[EIM] collabApplyRemote failed:',e); }
  _collabApplying=false;
}
// Replace local arrays/meta from the current Y.Doc (used by adopt-on-join and steady-state apply).
function collabAdoptFromDoc(){
  engineers=[..._collabYEng.values()].map(collabClone);
  engineers.forEach(function(e){ sanitiseEngineer(e); });
  projects=[..._collabYProj.values()].map(collabClone);
  allocRows=[..._collabYAlloc.values()].map(collabClone);
  allocRows.forEach(function(r){ if(!r.allocs)r.allocs={}; if(r.engId===undefined)r.engId=null; if(r.projectId===undefined)r.projectId=null; if(r.budgetLine===undefined)r.budgetLine=''; });
  COLLAB_META.forEach(function(m){ if(_collabYMeta.has(m.k)) m.set(collabClone(_collabYMeta.get(m.k))); });
  try{ sanitiseProjects(); }catch(e){}
  try{ sanitiseGateConfig(); }catch(e){}
  nbEnsureHistory(); uidMigrate();
  collabRebuildJsonCache();
  _invalidateMemo(); saveNow(); collabRerender();
}
// Refresh the push cache so the next local save doesn't echo everything back.
function collabRebuildJsonCache(){
  Object.keys(_collabLastJson).forEach(function(k){ delete _collabLastJson[k]; });
  engineers.concat(projects,allocRows).forEach(function(o){ if(o.uid) _collabLastJson[o.uid]=JSON.stringify(o); });
}

// Deep-clone a Yjs value into a plain JS object we own (Yjs may hand back the same ref).
function collabClone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }

// True when a text field / dropdown is focused (mid-edit). collabRerender never
// paints while this holds, so a remote patch can't steal the caret.
function collabFieldFocused(){
  var ae=document.activeElement, tag=ae&&ae.tagName;
  return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
}
/* Flush a deferred re-render once no field is focused. Polled (not event-driven):
   a single blur/focusout event can be missed or not fire at all, stranding the dirty
   flag and freezing the UI while data keeps syncing. A cheap poll is bulletproof. */
function collabFlushDirty(){ if(_collabDirtyView && !collabFieldFocused()) collabRerender(); }
/* Re-render the visible surface WITHOUT stealing focus. If a field is focused, mark
   dirty and bail — collabFlushDirty repaints once it's free (the focus-steal rule). */
function collabRerender(){
  if(collabFieldFocused()){ _collabDirtyView=true; return; }
  _collabDirtyView=false;
  try{ if(typeof render==='function') render(); }catch(e){}
  try{ if(typeof renderList==='function') renderList(); }catch(e){}
  try{ var res=G('res-overlay'); if(res&&res.classList.contains('show')&&typeof renderResActiveTab==='function') renderResActiveTab(); }catch(e){}
  try{ var org=G('org-overlay'); if(org&&org.style.display!=='none'&&typeof renderOrgChart==='function') renderOrgChart(); }catch(e){}
  try{ if(typeof updateSnapBadge==='function') updateSnapBadge(); }catch(e){}
}

/* ── Rail badge (peer count on the Collaborate util icon) ── */
function collabUpdateBadge(){
  var el=document.getElementById('rn-collab-badge');
  if(!el) return;
  if(_collabConnected&&_collabPeers>1){ el.textContent=String(_collabPeers); el.style.display=''; }
  else el.style.display='none';
}

/* ══════════════════════════════════════════════════════════════════════
   THE COLLABORATE PANEL
   ══════════════════════════════════════════════════════════════════════ */
function collabOpen(){
  collabLoadCfg();
  if(!_collabLog.length) collabLogLoad();
  var existing=document.getElementById('collab-dlg'); if(existing) existing.remove();
  var dlg=document.createElement('div');
  dlg.id='collab-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1100;display:flex;align-items:center;justify-content:center';
  dlg.addEventListener('click',function(e){ if(e.target===dlg) dlg.remove(); });
  document.body.appendChild(dlg);
  collabRefreshPanel();
}
function collabClose(){ var d=document.getElementById('collab-dlg'); if(d) d.remove(); }

function collabStatusLine(){
  var m={ idle:t('Not connected.'), loading:t('Loading collaboration library…'),
    connecting:t('Connecting to relay…'), synced:t('Synced ✓'),
    offline:t('Can\'t reach the relay — retrying. Check the URL & token, and that the relay is running.'),
    stalled:t('Still not connected after 12s. Check: relay URL (wss://…), the token, and that the relay app is awake (a paused/scaled-down Heroku dyno won\'t answer).'),
    error:t('Connection error.') };
  var s=m[_collabStatus]||_collabStatus;
  if(_collabConnected&&_collabPeers>1) s+=' · '+t('{n} people in room',{n:_collabPeers});
  return s;
}
function collabInput(id,label,val,ph,disabled){
  return '<label style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+label
    +'<input id="'+id+'" value="'+escH(val||'')+'" '+(disabled?'disabled':'')
    +' oninput="collabField(\''+id.replace('collab-','')+'\',this.value)" placeholder="'+escH(ph||'')+'" '
    +'style="width:100%;margin-top:4px;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px"></label>';
}
function collabRefreshPanel(){
  var dlg=document.getElementById('collab-dlg'); if(!dlg) return;
  var connected=_collabConnected||_collabStatus==='connecting'||_collabStatus==='synced';
  var link=(_collabCfg.room)?collabShareLink():'';
  var statusColor=_collabStatus==='synced'?'var(--accent)'
    :(_collabStatus==='error'||_collabStatus==='stalled'?'var(--danger)'
    :(_collabStatus==='offline'?'var(--warn)':'var(--muted)'));
  var conflicts=collabConflictCount();
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;'
    +'padding:22px 24px;width:min(540px,95vw);max-height:88vh;overflow:auto;box-shadow:0 18px 54px rgba(0,0,0,.6);'
    +'display:flex;flex-direction:column;gap:13px" onclick="event.stopPropagation()">'
    +'<div style="display:flex;align-items:center;gap:10px">'
      +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:14px;color:var(--accent);flex:1;margin:0">🔗 '+t('COLLABORATE')+'</h2>'
      +'<button onclick="collabClose()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button>'
    +'</div>'
    +'<p style="font-size:11px;color:var(--muted);line-height:1.6;margin:0">'
      +t('Create a room and share its link to work on the same data live across computers. Edits made offline merge back in when you reconnect; conflicts are kept in the history.')
    +'</p>'
    +collabInput('collab-actor',t('YOUR NAME (shown to teammates · labels history)'),_collabCfg.actor,'e.g. Benoit',false)
    +collabInput('collab-relay',t('RELAY URL'),_collabCfg.relay,'wss://your-app.herokuapp.com',connected)
    +collabInput('collab-token',t('TOKEN (from your relay)'),_collabCfg.token,t('the RELAY_TOKEN you set'),connected)
    +'<div style="display:flex;gap:8px;align-items:flex-end">'
      +'<div style="flex:1">'+collabInput('collab-room',t('ROOM'),_collabCfg.room,t('click New room'),connected)+'</div>'
      +(connected?'':'<button onclick="collabNewRoom()" style="padding:7px 12px;background:var(--bg);border:1px solid var(--accent);color:var(--accent);border-radius:6px;cursor:pointer;font-size:11px">'+t('New room')+'</button>')
    +'</div>'
    +(link?('<div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('SHARE LINK')
      +'<div style="display:flex;gap:6px;margin-top:4px">'
      +'<input id="collab-link" readonly value="'+escH(link)+'" onclick="this.select()" '
      +'style="flex:1;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:10px">'
      +'<button onclick="collabCopyLink()" style="padding:7px 12px;background:var(--accent);border:none;color:#0a0a0a;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600">'+t('Copy')+'</button>'
      +'</div>'
      +'<div style="font-size:9px;color:var(--warn);margin-top:5px">⚠ '+t('Anyone with this link can read and edit the data. Share it only with your team.')+'</div>'
      +'</div>'):'')
    +'<div style="display:flex;align-items:center;gap:10px;border-top:1px solid var(--border);padding-top:12px">'
      +'<span style="flex:1;font-size:11px;font-family:IBM Plex Mono,monospace;color:'+statusColor+'">'+escH(collabStatusLine())+'</span>'
      +'<button onclick="collabHistoryOpen()" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;cursor:pointer;font-size:11px">🕓 '+t('History')
        +(_collabLog.length?(' ('+_collabLog.length+(conflicts?(' · '+conflicts+'⚠'):'')+')'):'')+'</button>'
      +(connected
        ?'<button onclick="collabDisconnect()" style="padding:8px 16px;background:var(--bg);border:1px solid var(--danger);color:var(--danger);border-radius:6px;cursor:pointer;font-size:12px">'+t('Disconnect')+'</button>'
        :'<button onclick="collabConnect()" class="primary" style="padding:8px 18px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">'+t('Connect')+'</button>')
    +'</div>'
  +'</div>';
}
function collabField(k,v){
  _collabCfg[k]=v.trim(); collabSaveCfg();
  if(k==='room'){ var l=document.getElementById('collab-link'); if(l) l.value=collabShareLink(); }
  if(k==='actor'&&_collabProvider){ try{ _collabProvider.awareness.setLocalStateField('user',{name:_collabCfg.actor||'?',t:Date.now()}); }catch(e){} }
}
function collabNewRoom(){ _collabCfg.room=collabRndHex(16); collabSaveCfg(); collabRefreshPanel(); }
function collabCopyLink(){
  var link=collabShareLink();
  var done=function(){ var b=document.querySelector('#collab-dlg button[onclick="collabCopyLink()"]'); if(b){ var o=b.textContent; b.textContent=t('Copied ✓'); setTimeout(function(){ b.textContent=o; },1400); } };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(link).then(done,function(){ collabCopyFallback(link); done(); }); }
  else { collabCopyFallback(link); done(); }
}
function collabCopyFallback(txt){ try{ var ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }catch(e){} }

/* ══════════════════════════════════════════════════════════════════════
   HISTORY VIEWER (the change / conflict log — audit-log seed)
   ══════════════════════════════════════════════════════════════════════ */
function collabHistoryOpen(){
  if(!_collabLog.length) collabLogLoad();
  var existing=document.getElementById('collab-hist-dlg'); if(existing) existing.remove();
  var dlg=document.createElement('div');
  dlg.id='collab-hist-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1120;display:flex;align-items:center;justify-content:center';
  dlg.addEventListener('click',function(e){ if(e.target===dlg) dlg.remove(); });
  document.body.appendChild(dlg);
  collabRenderHistory();
}
function collabHistoryClose(){ var d=document.getElementById('collab-hist-dlg'); if(d) d.remove(); }
function collabRefreshHistory(){ if(document.getElementById('collab-hist-dlg')) collabRenderHistory(); }
function collabRenderHistory(){
  var dlg=document.getElementById('collab-hist-dlg'); if(!dlg) return;
  var ICON={ create:'＋', delete:'🗑', conflict:'⚠' };
  var COL={ create:'var(--accent)', delete:'var(--muted)', conflict:'var(--danger)' };
  var rows=_collabLog.slice().reverse().map(function(e){
    var when=''; try{ when=new Date(e.ts).toLocaleString(); }catch(_){ when=e.ts||''; }
    var head='<div style="display:flex;gap:8px;align-items:baseline">'
      +'<span style="color:'+(COL[e.action]||'var(--text)')+';font-weight:700;width:14px;text-align:center">'+(ICON[e.action]||'•')+'</span>'
      +'<span style="flex:1;font-size:12px;color:var(--text)"><b>'+escH(e.actor||'?')+'</b> '
        +escH(t(e.action==='create'?'created':e.action==='delete'?'deleted':'conflict on'))+' '
        +'<span style="color:var(--muted)">'+escH(e.entityType||'')+'</span> '+escH(e.label||'')+'</span>'
      +'<span style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace;white-space:nowrap">'+escH(when)+'</span>'
    +'</div>';
    var detail='';
    if(e.action==='conflict'&&e.conflict){
      detail='<div style="margin:5px 0 0 22px;font-size:10px;font-family:IBM Plex Mono,monospace;line-height:1.5">'
        +'<div style="color:var(--accent)">✓ '+escH(t('kept'))+': '+escH(collabValPreview(e.conflict.kept))+'</div>'
        +'<div style="color:var(--warn)">✕ '+escH(t('overwritten'))+': '+escH(collabValPreview(e.conflict.overwritten))+'</div>'
      +'</div>';
    }
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border)">'+head+detail+'</div>';
  }).join('');
  var conflicts=collabConflictCount();
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;'
    +'padding:20px 22px;width:min(620px,95vw);max-height:86vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 54px rgba(0,0,0,.6)" onclick="event.stopPropagation()">'
    +'<div style="display:flex;align-items:center;gap:10px">'
      +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);flex:1;margin:0">🕓 '+t('CHANGE HISTORY')+'</h2>'
      +'<button onclick="collabHistoryClose()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button>'
    +'</div>'
    +'<div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
      +escH(t('{n} entries',{n:_collabLog.length}))+(conflicts?(' · '+escH(t('{n} conflicts',{n:conflicts}))):'')
      +' · '+escH(t('newest first'))+'</div>'
    +'<div style="overflow-y:auto;flex:1;min-height:80px">'
      +(rows||'<div style="color:var(--muted);font-size:11px;text-align:center;padding:24px">'+t('No changes recorded yet. Creates, deletions and merge conflicts will appear here.')+'</div>')
    +'</div>'
    +'<div style="display:flex;gap:8px;justify-content:flex-end">'
      +(_collabLog.length?'<button onclick="collabHistoryClear()" style="padding:6px 12px;background:none;border:1px solid var(--danger);color:var(--danger);border-radius:6px;cursor:pointer;font-size:11px">'+t('Clear history')+'</button>':'')
      +'<button onclick="collabHistoryClose()" style="padding:6px 14px" class="primary">'+t('Close')+'</button>'
    +'</div>'
  +'</div>';
}
// Compact one-line preview of a logged value (entity object or string), escaped by the caller.
function collabValPreview(v){
  if(v==null) return '—';
  if(typeof v==='string') return v.length>90?v.slice(0,90)+'…':v;
  if(typeof v==='object'){ if(v.name) return v.name; try{ var s=JSON.stringify(v); return s.length>90?s.slice(0,90)+'…':s; }catch(_){ return '(object)'; } }
  return String(v);
}
function collabHistoryClear(){
  if(!confirm(t('Clear the local change history? (This does not touch data, only the log on THIS computer.)'))) return;
  _collabLog=[]; Object.keys(_collabLogSeen).forEach(function(k){ delete _collabLogSeen[k]; });
  collabLogPersist(); collabRenderHistory(); collabRefreshPanel();
}

/* ── Boot: auto-rejoin (returning) or join-via-link. Deferred to DOMContentLoaded so
   overlays/G() targets exist (boot-timing rule). ── */
function collabBootFromHash(){
  collabLoadCfg(); collabLogLoad();
  if(collabReadHash()){
    collabSaveCfg();
    setTimeout(function(){
      if(confirm(t('Join the shared Matrix room from this link? Your data will be merged with the room once it syncs.'))) collabConnect();
      else collabOpen();
    },400);
    return;
  }
  // No link, but we were in a room last session → auto-rejoin (silent; a 3-way merge
  // will reconcile any edits made while the app was closed/offline).
  if(_collabCfg.auto && _collabCfg.room && _collabCfg.relay){ setTimeout(collabConnect,300); }
}
