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
 *   - CHANGE / CONFLICT LOG (collabLog*): an append-only, per-actor audit log of creates,
 *     per-field UPDATES (before→after), deletes, and conflicts. It lives in the Y.Doc (a Y.Array, so it syncs to every
 *     peer and merges without conflict — unique ids) AND mirrors to a local store
 *     (eim_collab_log) so it survives offline/reload. This is the seed of the future
 *     multi-user AUDIT LOG: entries already carry actor/ts/before/after; swapping the
 *     self-declared actor for a verified identity later is additive, no model change.
 *   - Conflicts never lose data: the overwritten value is kept in the log, so a
 *     future "restore this version" action can recover it.
 *   - Security: random 128-bit room id (#1), token as a connection param (#2),
 *     secrets in the URL #fragment never the query (#3) — the patterns proven in
 *     ../matrix-relay/test/sync-test.html.
 *   - E2E ENCRYPTION (Phase B): every value written to the Y.Doc (entities, meta,
 *     log, awareness) is AES-256-GCM encrypted client-side with a 32-byte room key
 *     that rides ONLY in the link #fragment (never sent to the relay). The relay sees
 *     ciphertext + structural metadata (random uids, counts, timing) only — never
 *     content. Crypto is synchronous (@noble/ciphers) so Yjs transactions stay atomic.
 *     A room with no key runs in plaintext (back-compat); the panel shows which mode.
 *
 * UID-ANCHORED REFS (concurrent-creation safe): the numeric `id` and every numeric
 *   intra-dataset id-ref (allocRow.engId/projectId, idcard.reportsTo, succession.
 *   successorId) are LOCAL wiring only and are STRIPPED from the synced form
 *   (collabCanonical). Identity travels as durable uid mirrors (engUid/projectUid/
 *   reportsToUid/successorUid); each client materialises its own local ids on adopt
 *   (collabMaterialize + persist.js refsRelink), so two people creating new entities
 *   offline can never collide on an id. refsBackfill() keeps the uid mirrors current
 *   before a push. The ~270 numeric-id read-sites are untouched.
 *
 * KNOWN v1 LIMITATIONS (documented, deliberate):
 *   - engineer.groupId / project.sectionId / _ktPlans.learnerEngId stay id-based
 *     (LWW meta blobs, low-churn) — extending the uid-ref pattern to them is additive.
 *   - Whole-object LWW per entity (not field-level CRDT). Photos NOT synced (IndexedDB).
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
const COLLAB_AES_URL='https://esm.sh/@noble/ciphers@2.2.0/aes';  // E2E: synchronous AES-256-GCM (unrelated to yjs, no external pin)
const COLLAB_NONCE_BYTES=12;               // AES-GCM IV length (standard, 96-bit)
const COLLAB_KEY='eim_collab';             // localStorage: relay/token/room/key/actor/auto prefs
const COLLAB_LOG_KEY='eim_collab_log';     // localStorage: the change/conflict log (audit seed)
const COLLAB_LOG_CAP=1000;                 // local mirror cap (a real audit log offloads to the server)
const COLLAB_LOG_YCAP=3000;                // synced Y.Array cap — bounds the doc (per-field updates are frequent)
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
let _collabAes=null;             // cached noble AES-GCM module (E2E)
let _collabKeyBytes=null;        // 32-byte room key derived from _collabCfg.key
let _collabEncOn=false;          // true once a room key is present AND libs are loaded → encrypt synced content
let _collabDecFails=0;           // values we could not decrypt this session (wrong/missing key in the link)
let _collabLog=[];               // local mirror of the append-only change/conflict log
const _collabLogSeen={};         // entry id -> 1 (dedupe; kept even after local trim so trimmed entries don't re-add)
const _collabLastJson={};        // uid -> last-pushed JSON, so unchanged entities aren't re-sent
let _collabCfg={relay:'',token:'',room:'',key:'',actor:'',auto:false};

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
         _collabCfg.key=p.key||''; _collabCfg.actor=p.actor||''; _collabCfg.auto=!!p.auto; } }catch(e){}
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
  if(_collabCfg.key) q.set('key',_collabCfg.key);     // E2E key rides the fragment (base64url is URL-safe)
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
  if(p.get('key'))  _collabCfg.key=p.get('key');   // E2E room key — fragment only, never the query
  return !!p.get('room');
}

/* ══════════════════════════════════════════════════════════════════════
   E2E ENCRYPTION (Phase B) — AES-256-GCM, key in the URL #fragment
   ══════════════════════════════════════════════════════════════════════
   The room key is 32 random bytes, base64url-encoded, carried ONLY in the link
   fragment (never the query → never sent to the relay, never in server/proxy logs).
   Every value written to the shared Y.Doc — entities, meta, log, awareness — is
   wrapped as a self-describing {c: base64(nonce‖ciphertext‖tag)} envelope. The relay
   therefore only ever sees ciphertext plus structural metadata (random uids, entity
   counts, edit timing) — never readable content. Crypto is SYNCHRONOUS (noble) so Yjs
   transactions stay atomic (no async inside doc.transact). A room with no key operates
   in plaintext (back-compat with pre-Phase-B rooms); the panel shows which mode is live. */
function collabRndKey(){ var b=new Uint8Array(32); crypto.getRandomValues(b); return collabB64url(b); }
function collabB64url(bytes){
  var s=''; for(var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function collabB64urlDec(str){
  str=String(str||'').replace(/-/g,'+').replace(/_/g,'/'); while(str.length%4) str+='=';
  var bin=atob(str), b=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  return b;
}
// Derive the working key bytes from cfg.key and flip encryption on. Call ONLY after the
// libs (incl. _collabAes) are loaded, so _collabEncOn never turns on before we can encrypt.
function collabSetKeyFromCfg(){
  _collabEncOn=false; _collabKeyBytes=null; _collabDecFails=0;
  var k=(_collabCfg.key||'').trim();
  if(!k||!_collabAes) return;                       // no key → plaintext room (legacy/back-compat)
  try{ var kb=collabB64urlDec(k); if(kb.length===32){ _collabKeyBytes=kb; _collabEncOn=true; } }
  catch(e){ console.warn('[EIM] collab: bad room key',e); }
}
// Encrypt a JSON-able value → {c:base64} envelope. Passthrough (deep clone) when enc off.
function collabEnc(v){
  if(!_collabEncOn||!_collabAes||!_collabKeyBytes) return collabClone(v);
  var pt=new TextEncoder().encode(JSON.stringify(v===undefined?null:v));
  var nonce=new Uint8Array(COLLAB_NONCE_BYTES); crypto.getRandomValues(nonce);
  var ct=_collabAes.gcm(_collabKeyBytes,nonce).encrypt(pt);
  var packed=new Uint8Array(nonce.length+ct.length); packed.set(nonce,0); packed.set(ct,nonce.length);
  return { c: collabB64url(packed) };
}
// Decrypt a value read from the doc. Returns null on failure (wrong/missing key) — read
// paths drop nulls. Plaintext values (no .c) pass through: back-compat + mixed-room guard.
function collabDec(v){
  if(v&&typeof v==='object'&&typeof v.c==='string'){
    if(!_collabAes||!_collabKeyBytes){ _collabDecFails++; return null; }
    try{
      var packed=collabB64urlDec(v.c);
      var nonce=packed.slice(0,COLLAB_NONCE_BYTES), ct=packed.slice(COLLAB_NONCE_BYTES);
      var pt=_collabAes.gcm(_collabKeyBytes,nonce).decrypt(ct);
      return JSON.parse(new TextDecoder().decode(pt));
    }catch(e){ _collabDecFails++; return null; }
  }
  return collabClone(v);
}
// Log entries keep id + ts in plaintext (dedupe + ordering without decrypting everything);
// the sensitive payload (actor, labels = person names, before/after values) is encrypted.
function collabEncEntry(entry){
  if(!_collabEncOn) return entry;
  var e=collabEnc(entry); return { id:entry.id, ts:entry.ts, c:e.c };
}
function collabDecEntry(raw){
  if(!raw||typeof raw.c!=='string') return raw;      // plaintext entry (legacy)
  var full=collabDec({c:raw.c}); if(!full) return null;
  full.id=raw.id||full.id; return full;
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

/* ── Per-field diff (the UPDATE audit entry) ──────────────────────────────
   Compares the previous vs current CANONICAL entity and lists changed leaf
   fields as {f, from, to}. Nested objects recurse to dotted paths (idcard.grade,
   allocs.2026-03); arrays are compared opaquely (shown as a count) to keep the
   log readable. uid-ref fields are relabelled + resolved to entity names, so an
   allocation reassignment reads "engineer: Ann → Bob", not a raw uuid. */
const COLLAB_REF_FIELDS={ engUid:'engineer', projectUid:'project', reportsToUid:'manager', successorUid:'successor' };
const COLLAB_DIFF_CAP=14;                   // max field-changes per update entry (rest summarised)
function collabFlatten(o,prefix,out){
  out=out||{}; prefix=prefix||'';
  if(o&&typeof o==='object'&&!Array.isArray(o)){
    for(var k in o){ if(!Object.prototype.hasOwnProperty.call(o,k)) continue;
      if(k==='uid') continue;                 // internal identity, never a user edit
      var v=o[k], key=prefix?prefix+'.'+k:k;
      if(v&&typeof v==='object'&&!Array.isArray(v)) collabFlatten(v,key,out);
      else out[key]=Array.isArray(v)?('['+v.length+' item'+(v.length===1?'':'s')+']'):v;
    }
  }
  return out;
}
function collabValShort(v){
  if(v===undefined||v===null||v==='') return '∅';
  var s=(typeof v==='string')?v:JSON.stringify(v);
  return s.length>60?s.slice(0,60)+'…':s;
}
// Resolve a uid-ref value to a friendly entity name for the audit record (captured at
// log time, so the entry stays readable even after the referenced entity changes).
function collabRefName(base,uidVal){
  if(!uidVal) return '∅';
  var arr=(base==='projectUid')?projects:engineers;
  var e=arr.find(function(x){return x.uid===uidVal;});
  return e?(e.name||('('+(base==='projectUid'?'project':'person')+')')):'(removed)';
}
function collabChangeList(oldO,newO,type){
  var a=collabFlatten(oldO), b=collabFlatten(newO), keys={}, changes=[];
  for(var k in a) keys[k]=1; for(var k in b) keys[k]=1;
  Object.keys(keys).forEach(function(k){
    if(JSON.stringify(a[k])===JSON.stringify(b[k])) return;
    var base=k.split('.').pop();
    if(COLLAB_REF_FIELDS[base]) changes.push({ f:COLLAB_REF_FIELDS[base], from:collabRefName(base,a[k]), to:collabRefName(base,b[k]) });
    else changes.push({ f:k, from:collabValShort(a[k]), to:collabValShort(b[k]) });
  });
  if(changes.length>COLLAB_DIFF_CAP){
    var extra=changes.length-COLLAB_DIFF_CAP;
    changes=changes.slice(0,COLLAB_DIFF_CAP);
    changes.push({ f:'…', from:'', to:'(+'+extra+' more field'+(extra===1?'':'s')+')' });
  }
  return changes;
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
  if(_collabYLog&&_collabDoc){ try{ _collabDoc.transact(function(){
    _collabYLog.push([collabEncEntry(entry)]);
    if(_collabYLog.length>COLLAB_LOG_YCAP) _collabYLog.delete(0,_collabYLog.length-COLLAB_LOG_YCAP);  // bound the synced log
  },'local'); }catch(e){} }
  collabRefreshHistory();
}
// Merge any log entries from the synced Y.Array that we don't have locally (decrypting each).
function collabLogMergeFromDoc(){
  if(!_collabYLog) return;
  var added=false;
  _collabYLog.toArray().forEach(function(raw){
    var en=collabDecEntry(raw);
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
  if(_collabYjs&&_collabWS&&_collabIdb&&_collabAes) return Promise.resolve();
  _collabStatus='loading'; collabRefreshPanel();
  var load=Promise.all([import(COLLAB_YJS_URL),import(COLLAB_WS_URL),import(COLLAB_IDB_URL),import(COLLAB_AES_URL)])
    .then(function(mods){ _collabYjs=mods[0]; _collabWS=mods[1]; _collabIdb=mods[2]; _collabAes=mods[3]; });
  var timeout=new Promise(function(_,rej){ setTimeout(function(){
    rej(new Error('Timed out loading the collaboration library from the CDN (esm.sh). Are you online? Is esm.sh blocked on this network?'));
  },15000); });
  return Promise.race([load,timeout]);
}

/* ── Connect / disconnect ── */
function collabConnect(){
  if(!_collabCfg.relay){ alert(t('Enter a relay URL first.')); return; }
  // Fresh room with no room id yet → also mint an E2E key (new rooms are encrypted by default).
  if(!_collabCfg.room){ _collabCfg.room=collabRndHex(16); if(!_collabCfg.key) _collabCfg.key=collabRndKey(); }
  _collabCfg.auto=true;                 // remember: auto-rejoin this room on next load
  collabSaveCfg();
  _collabStatus='connecting'; _collabReconciled=false; _collabBase=null; collabRefreshPanel();
  if(!_collabFlushTimer) _collabFlushTimer=setInterval(collabFlushDirty,700);
  collabLoadLibs().then(function(){
    // Library loaded — the next wait is the RELAY, not the library. Say so, or a
    // failed/slow relay looks like a stuck "loading library" (it isn't).
    _collabStatus='connecting'; collabRefreshPanel();
    collabStartConnectWatch();
    collabSetKeyFromCfg();          // derive the room key now that _collabAes is loaded → enc on/off
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
      _collabProvider.awareness.setLocalStateField('user',collabEnc({ name:_collabCfg.actor||'?', t:Date.now() }));
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
  _collabEncOn=false; _collabKeyBytes=null; _collabDecFails=0;
  Object.keys(_collabLastJson).forEach(function(k){ delete _collabLastJson[k]; });
  _collabCfg.auto=false; collabSaveCfg();   // manual disconnect → don't auto-rejoin
  collabUpdateBadge(); collabRefreshPanel();
}

/* ── Snapshots / indexing helpers for the 3-way merge ── */
function collabArrIndex(arr){ var o={}; (arr||[]).forEach(function(x){ if(x&&x.uid) o[x.uid]=x; }); return o; }
function collabMapSnapshot(ymap){ var o={}; if(ymap) ymap.forEach(function(v,k){ var d=collabDec(v); if(d!=null) o[k]=d; }); return o; }
function collabSnapshot(){
  var meta={}; COLLAB_META.forEach(function(m){ if(_collabYMeta&&_collabYMeta.has(m.k)){ var d=collabDec(_collabYMeta.get(m.k)); if(d!=null) meta[m.k]=d; } });
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
      // Compare/merge on the CANONICAL form (no local id) so id churn isn't a conflict;
      // capture prev ids first so known entities keep their local id after materialise.
      refsBackfill();
      var prev=collabCapturePrev();
      _collabDoc.transact(function(){
        var mEng=collab3way(base.eng, collabCanonIndex(engineers,'engineer'), collabMapSnapshot(_collabYEng), 'engineer', _collabYEng);
        var mProj=collab3way(base.proj, collabCanonIndex(projects,'project'), collabMapSnapshot(_collabYProj), 'project', _collabYProj);
        var mAlloc=collab3way(base.alloc, collabCanonIndex(allocRows,'allocRow'), collabMapSnapshot(_collabYAlloc), 'allocRow', _collabYAlloc);
        engineers=Object.keys(mEng).map(function(k){return mEng[k];});
        projects=Object.keys(mProj).map(function(k){return mProj[k];});
        allocRows=Object.keys(mAlloc).map(function(k){return mAlloc[k];});
        collabMetaReconcile(base.meta);
      },'local');
      collabMaterialize(prev);          // id ← uid: assign local ids + rebuild numeric refs
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
      if(l){ out[uid]=l; ymap.set(uid,collabEnc(l)); } else { ymap.delete(uid); }
    } else {                                                            // BOTH changed → conflict
      if(l){ out[uid]=l; ymap.set(uid,collabEnc(l));
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
    var rr=(_collabYMeta.has(m.k))?collabDec(_collabYMeta.get(m.k)):undefined;   // decrypted remote
    var b=baseMeta[m.k], l=m.get(), r=(rr==null)?undefined:rr;
    var bj=JSON.stringify(b), lj=JSON.stringify(l), rj=(r!==undefined)?JSON.stringify(r):undefined;
    if(lj===rj){ if(r!==undefined) m.set(collabClone(r)); }
    else if(lj===bj){ if(r!==undefined) m.set(collabClone(r)); }        // only they changed → theirs
    else if(rj===bj){ _collabYMeta.set(m.k,collabEnc(l)); }             // only I changed → mine, push
    else {                                                              // both changed
      _collabYMeta.set(m.k,collabEnc(l));                              // keep mine live + push
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
  refsBackfill();                 // uid ← id: durable refs current before we serialise
  try{
    _collabDoc.transact(function(){
      collabSyncArray(engineers,_collabYEng,'engineer',true);
      collabSyncArray(projects,_collabYProj,'project',true);
      collabSyncArray(allocRows,_collabYAlloc,'allocRow',true);
      COLLAB_META.forEach(function(m){ _collabYMeta.set(m.k,collabEnc(m.get())); });
    },'local');
  }catch(e){ console.warn('[EIM] collabPush failed:',e); }
}
// collabSeed: the initial push into a fresh/kept-local room. logChanges=false so the
// whole dataset isn't logged as a burst of "creates".
function collabSeed(){
  refsBackfill();                 // uid ← id before the initial push
  try{
    _collabDoc.transact(function(){
      collabSyncArray(engineers,_collabYEng,'engineer',false);
      collabSyncArray(projects,_collabYProj,'project',false);
      collabSyncArray(allocRows,_collabYAlloc,'allocRow',false);
      COLLAB_META.forEach(function(m){ _collabYMeta.set(m.k,collabEnc(m.get())); });
    },'local');
  }catch(e){ console.warn('[EIM] collabSeed failed:',e); }
}

function collabSyncArray(arr,ymap,type,logChanges){
  var seen={};
  arr.forEach(function(o){
    if(!o.uid) o.uid=newUid();
    seen[o.uid]=1;
    var canon=collabCanonical(o,type);           // strip local id + numeric id-refs
    var js=JSON.stringify(canon);
    if(_collabLastJson[o.uid]!==js){
      var had=(o.uid in _collabLastJson);
      var isNew=!had && !ymap.has(o.uid);
      ymap.set(o.uid,collabEnc(canon));           // change-detection stays on the canonical `js`
      if(logChanges){
        if(isNew){ collabLogAppend(collabMkEntry('create',type,o.uid,collabLabelOf(type,o))); }
        else if(had){                              // an EDIT to an existing entity → per-field audit
          var chg=collabChangeList(JSON.parse(_collabLastJson[o.uid]),canon,type);
          if(chg.length) collabLogAppend(collabMkEntry('update',type,o.uid,collabLabelOf(type,o),{changes:chg}));
        }
      }
      _collabLastJson[o.uid]=js;
    }
  });
  [...ymap.keys()].forEach(function(k){
    if(!seen[k]){
      if(logChanges) collabLogAppend(collabMkEntry('delete',type,k,collabLabelOf(type,collabDec(ymap.get(k)))));
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
  var prev=collabCapturePrev();                 // keep each known uid's local id stable
  engineers=[..._collabYEng.values()].map(collabDec).filter(Boolean);
  projects=[..._collabYProj.values()].map(collabDec).filter(Boolean);
  allocRows=[..._collabYAlloc.values()].map(collabDec).filter(Boolean);
  // Meta first — the id counters (nextEngId/nextId/nextAllocId) advance to the room's
  // high-water mark BEFORE collabMaterialize hands out any fresh local id.
  COLLAB_META.forEach(function(m){ if(_collabYMeta.has(m.k)){ var d=collabDec(_collabYMeta.get(m.k)); if(d!=null) m.set(d); } });
  collabMaterialize(prev);                       // id ← uid: local ids + numeric refs
  engineers.forEach(function(e){ sanitiseEngineer(e); });
  allocRows.forEach(function(r){ if(!r.allocs)r.allocs={}; if(r.engId===undefined)r.engId=null; if(r.projectId===undefined)r.projectId=null; if(r.budgetLine===undefined)r.budgetLine=''; });
  try{ sanitiseProjects(); }catch(e){}
  try{ sanitiseGateConfig(); }catch(e){}
  nbEnsureHistory(); uidMigrate();
  collabRebuildJsonCache();
  _invalidateMemo(); saveNow(); collabRerender();
}
// Refresh the push cache so the next local save doesn't echo everything back. Keyed by
// the CANONICAL form (matches what collabPush compares/serialises).
function collabRebuildJsonCache(){
  Object.keys(_collabLastJson).forEach(function(k){ delete _collabLastJson[k]; });
  engineers.forEach(function(o){ if(o.uid) _collabLastJson[o.uid]=JSON.stringify(collabCanonical(o,'engineer')); });
  projects.forEach(function(o){ if(o.uid) _collabLastJson[o.uid]=JSON.stringify(collabCanonical(o,'project')); });
  allocRows.forEach(function(o){ if(o.uid) _collabLastJson[o.uid]=JSON.stringify(collabCanonical(o,'allocRow')); });
}

// Deep-clone a Yjs value into a plain JS object we own (Yjs may hand back the same ref).
function collabClone(v){ return v==null?v:JSON.parse(JSON.stringify(v)); }

/* ── uid-anchored intra-dataset refs (see persist.js refsBackfill/refsRelink) ──
   The numeric `id` and the numeric id-refs (engId/projectId/reportsTo/successorId)
   are LOCAL wiring only — STRIPPED from the synced form. What travels is keyed by
   `uid` with uid refs (engUid/projectUid/reportsToUid/successorUid). Each client
   materialises its own local ids from the uids on adopt, so two people creating new
   entities offline can NEVER collide on an id. Change-detection also runs on the
   canonical form, so a local id churn doesn't trigger a spurious re-push. */
function collabCanonical(o,type){
  var c=collabClone(o);
  delete c.id;
  if(type==='allocRow'){ delete c.engId; delete c.projectId; }
  else if(type==='engineer' && c.idcard){
    delete c.idcard.reportsTo;
    if(c.idcard.succession) delete c.idcard.succession.successorId;
  }
  return c;
}
function collabCanonIndex(arr,type){ var o={}; (arr||[]).forEach(function(x){ if(x&&x.uid) o[x.uid]=collabCanonical(x,type); }); return o; }
// {uid:id} per array, captured BEFORE arrays are replaced so a known uid keeps its local
// id across an adopt (no DOM churn); a genuinely new uid gets a fresh id from the counter.
function collabUidIdMap(arr){ var m={}; (arr||[]).forEach(function(o){ if(o&&o.uid&&o.id!=null) m[o.uid]=o.id; }); return m; }
function collabCapturePrev(){ return { eng:collabUidIdMap(engineers), proj:collabUidIdMap(projects), alloc:collabUidIdMap(allocRows) }; }
// Give every entity a local numeric id (reuse prev for a known uid, else fresh), then
// rebuild the numeric id-refs from the durable uid refs. This is what heals a collision.
function collabMaterialize(prev){
  prev=prev||{eng:{},proj:{},alloc:{}};
  engineers.forEach(function(e){ if(e&&e.uid) e.id=(prev.eng[e.uid]!=null)?prev.eng[e.uid]:nextEngId++; });
  projects.forEach(function(p){ if(p&&p.uid) p.id=(prev.proj[p.uid]!=null)?prev.proj[p.uid]:nextId++; });
  allocRows.forEach(function(r){ if(r&&r.uid) r.id=(prev.alloc[r.uid]!=null)?prev.alloc[r.uid]:nextAllocId++; });
  refsRelink();
}

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
  if(_collabDecFails>0) s+=' · ⚠ '+t('Can\'t decrypt room content — this link is missing the key or has the wrong one.');
  return s;
}
// Encryption state for the panel badge: encrypted (key present) vs plaintext room.
function collabEncLabel(){
  if(_collabCfg.key) return {ic:'🔒',txt:t('End-to-end encrypted — the relay can\'t read this room\'s data.'),col:'var(--accent)'};
  return {ic:'🔓',txt:t('Not encrypted — this room has no key. Create a New room for an encrypted one.'),col:'var(--warn)'};
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
  var enc=collabEncLabel();
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
      +'<div style="font-size:9px;color:var(--warn);margin-top:5px">⚠ '+t('The link contains the room key — anyone with it can read and edit the data. Share it only with your team.')+'</div>'
      +'</div>'):'')
    +'<div style="display:flex;align-items:center;gap:8px;font-size:10px;font-family:IBM Plex Mono,monospace;color:'+enc.col+'">'
      +'<span>'+enc.ic+'</span><span>'+escH(enc.txt)+'</span></div>'
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
  if(k==='actor'&&_collabProvider){ try{ _collabProvider.awareness.setLocalStateField('user',collabEnc({name:_collabCfg.actor||'?',t:Date.now()})); }catch(e){} }
}
function collabNewRoom(){ _collabCfg.room=collabRndHex(16); _collabCfg.key=collabRndKey(); collabSaveCfg(); collabRefreshPanel(); }
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
  var ICON={ create:'＋', update:'✎', delete:'🗑', conflict:'⚠' };
  var COL={ create:'var(--accent)', update:'var(--accent2)', delete:'var(--muted)', conflict:'var(--danger)' };
  var VERB={ create:'created', update:'edited', delete:'deleted', conflict:'conflict on' };
  var rows=_collabLog.slice().reverse().map(function(e){
    var when=''; try{ when=new Date(e.ts).toLocaleString(); }catch(_){ when=e.ts||''; }
    var head='<div style="display:flex;gap:8px;align-items:baseline">'
      +'<span style="color:'+(COL[e.action]||'var(--text)')+';font-weight:700;width:14px;text-align:center">'+(ICON[e.action]||'•')+'</span>'
      +'<span style="flex:1;font-size:12px;color:var(--text)"><b>'+escH(e.actor||'?')+'</b> '
        +escH(t(VERB[e.action]||e.action))+' '
        +'<span style="color:var(--muted)">'+escH(e.entityType||'')+'</span> '+escH(e.label||'')+'</span>'
      +'<span style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace;white-space:nowrap">'+escH(when)+'</span>'
    +'</div>';
    var detail='';
    if(e.action==='update'&&e.changes&&e.changes.length){
      detail='<div style="margin:5px 0 0 22px;font-size:10px;font-family:IBM Plex Mono,monospace;line-height:1.6">'
        +e.changes.map(function(c){
          return '<div><span style="color:var(--muted)">'+escH(c.f)+'</span> '
            +'<span style="color:var(--dim)">'+escH(collabValPreview(c.from))+'</span> → '
            +'<span style="color:var(--text)">'+escH(collabValPreview(c.to))+'</span></div>';
        }).join('')
      +'</div>';
    } else if(e.action==='conflict'&&e.conflict){
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
