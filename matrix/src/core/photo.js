/* ══════════════════════════════════════════════════════════════════
   MODULE: STORAGE: PHOTOS (IDB)
   ══════════════════════════════════════════════════════════════════ */
export const IDB_NAME='EIM_Photos', IDB_STORE='photos', IDB_VER=1;
export let _photoDB=null;
export const TALENT_IDB_NAME='EIM_TalentData', TALENT_IDB_VER=1;
export let _talentDB=null;

let _photoCache=new Map();   // engId(string) → dataURL
let _photoDBReady=false;

/* ►► SECTION: TALENT-IDB ◄◄ Talent matrix IndexedDB persistence (ninebox/disc placements) */
export function talentIdbOpen(){
  return new Promise(function(resolve,reject){
    if(_talentDB){resolve(_talentDB);return;}
    var req=indexedDB.open(TALENT_IDB_NAME,TALENT_IDB_VER);
    req.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains('talent'))db.createObjectStore('talent');
    };
    req.onsuccess=function(e){_talentDB=e.target.result;resolve(_talentDB);};
    req.onerror=function(e){reject(e.target.error);};
  });
}
export function talentIdbSave(){
  return talentIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction('talent','readwrite');
      var st=tx.objectStore('talent');
      st.put({
        nineBoxPlacements:_nineBoxPlacements,
        nineBoxHistory:_nineBoxHistory,nbYear:_nbYear,nbCompareYear:_nbCompareYear,
        discPlacements:_discPlacements,
        nbSwapAxes:_nbSwapAxes
      },'placements');
      tx.oncomplete=resolve;tx.onerror=function(e){reject(e.target.error);};
    });
  }).catch(function(e){console.warn('[EIM] talentIdbSave failed:',e);});
}
export function talentIdbLoad(){
  return talentIdbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction('talent','readonly');
      var req=tx.objectStore('talent').get('placements');
      req.onsuccess=function(e){resolve(e.target.result||null);};
      req.onerror=function(e){reject(e.target.error);};
    });
  }).then(function(data){
    if(!data)return;
    if(data.nineBoxPlacements&&typeof data.nineBoxPlacements==='object')_nineBoxPlacements=data.nineBoxPlacements;
    if(data.nineBoxHistory&&typeof data.nineBoxHistory==='object')_nineBoxHistory=data.nineBoxHistory;
    if(data.nbYear)_nbYear=data.nbYear;
    if(data.nbCompareYear!=null)_nbCompareYear=data.nbCompareYear;
    if(data.discPlacements&&typeof data.discPlacements==='object')_discPlacements=data.discPlacements;
    if(data.nbSwapAxes!=null)_nbSwapAxes=!!data.nbSwapAxes;
    nbEnsureHistory();
  }).catch(function(e){console.warn('[EIM] talentIdbLoad failed:',e);});
}

/* ►► SECTION: PHOTO-IDB ◄◄ IndexedDB photo storage - save/load/compress/migrate */
export function idbOpen(){
  return new Promise(function(resolve,reject){
    if(_photoDB){resolve(_photoDB);return;}
    if(!window.indexedDB){reject(new Error('IndexedDB not available'));return;}
    var req=indexedDB.open(IDB_NAME,IDB_VER);
    req.onupgradeneeded=function(e){
      e.target.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess=function(e){_photoDB=e.target.result;resolve(_photoDB);};
    req.onerror=function(e){reject(e.target.error);};
  });
}

// The photo store is keyed by the durable `uid`, not the per-dataset `id` (see
// the uid identity model in data/model.js). Callers still pass an engineer id or
// an engineer object — resolve it to the uid here so no call site has to change.
// Falls back to the raw value only when the person can't be resolved (orphan /
// pre-load), which degrades to the old id-keyed behaviour rather than dropping data.
export function _photoKey(engOrId){
  if(engOrId==null) return '';
  if(typeof engOrId==='object') return engOrId.uid||(engOrId.id!=null?String(engOrId.id):'');
  if(typeof engKey==='function'){ var k=engKey(engOrId); if(k) return k; }
  return String(engOrId);
}

// ── CRUD ─────────────────────────────────────────────────────────
export function idbSavePhoto(engId,dataURL){
  var key=_photoKey(engId);
  _photoCache.set(key,dataURL);
  return idbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).put(dataURL,key);
      tx.oncomplete=resolve;
      tx.onerror=function(e){reject(e.target.error);};
    });
  });
}

export function idbDeletePhoto(engId){
  var key=_photoKey(engId);
  _photoCache.delete(key);
  return idbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete=resolve;
      tx.onerror=function(e){reject(e.target.error);};
    });
  });
}

// Sync read from cache — safe to call during render
export function idbGetPhoto(engId){
  var key=_photoKey(engId);
  return _photoCache.get(key)||'';
}

// Session 2: async fetch with cache-miss fallback
export function idbFetchPhoto(engId){
  var key=_photoKey(engId);
  if(_photoCache.has(key))return Promise.resolve(_photoCache.get(key));
  return idbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(IDB_STORE,'readonly');
      var req=tx.objectStore(IDB_STORE).get(key);
      req.onsuccess=function(e){
        var val=e.target.result||'';
        if(val)_photoCache.set(key,val);
        resolve(val);
      };
      req.onerror=function(e){reject(e.target.error);};
    });
  });
}

// ── Preload all into cache ────────────────────────────────────────
export function idbPreloadAll(){
  return idbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(IDB_STORE,'readonly');
      var req=tx.objectStore(IDB_STORE).openCursor();
      req.onsuccess=function(e){
        var cursor=e.target.result;
        if(cursor){
          _photoCache.set(String(cursor.key),cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror=function(e){reject(e.target.error);};
    });
  });
}

// ── Replace entire photo store from a {engId: dataURL} map ────────
// Full-backup restore is a dataset SWAP: engIds are per-dataset counters,
// so the previous dataset's photos (keyed by colliding ids) must not bleed
// into the new one. We clear the store + cache and write only what the
// backup carries, rebuilding the cache from that map (never via a cursor,
// which would re-read any ghost rows). See idbSavePhoto (merge-only) for
// the per-photo path used during normal editing.
export function idbReplaceAllPhotos(photos){
  photos=photos||{};
  return idbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(IDB_STORE,'readwrite');
      var st=tx.objectStore(IDB_STORE);
      st.clear();
      Object.keys(photos).forEach(function(k){
        if(photos[k])st.put(photos[k],String(k));
      });
      tx.oncomplete=resolve;
      tx.onerror=function(e){reject(e.target.error);};
    });
  }).then(function(){
    _photoCache.clear();
    Object.keys(photos).forEach(function(k){
      if(photos[k])_photoCache.set(String(k),photos[k]);
    });
  });
}

// ── Re-key the photo store id → uid (one-time, idempotent) ────────
// Photos were historically keyed by String(eng.id) (a per-dataset counter).
// This walks the preloaded cache + store, and for any key that is still a bare
// integer with a known uid, moves the photo to the uid key. A uid key (uuid) is
// never a bare integer, so a second run finds nothing — safe to call every boot.
// `idToUid` is the SAME map uidMigrate() uses, so photos and nine-box/DISC all
// land on the same uids. Resolves to whether anything moved (→ persist if so).
export function idbMigrateToUid(idToUid){
  idToUid=idToUid||{};
  var moves=[];   // [oldKey,newKey,dataURL]
  _photoCache.forEach(function(v,k){
    if(isLegacyKey(k) && idToUid[k] && idToUid[k]!==k) moves.push([k,idToUid[k],v]);
  });
  if(!moves.length) return Promise.resolve(false);
  // Cache first (sync, so a render between here and the IDB commit reads the new key).
  moves.forEach(function(m){ _photoCache.delete(m[0]); _photoCache.set(m[1],m[2]); });
  return idbOpen().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(IDB_STORE,'readwrite');
      var st=tx.objectStore(IDB_STORE);
      moves.forEach(function(m){ st.delete(m[0]); st.put(m[2],m[1]); });
      tx.oncomplete=function(){resolve(true);};
      tx.onerror=function(e){reject(e.target.error);};
    });
  }).then(function(){
    console.log('[EIM] Re-keyed '+moves.length+' photo(s) id→uid');
    return true;
  }).catch(function(e){ console.warn('[EIM] photo uid re-key failed:',e); return false; });
}

// ── Storage info ─────────────────────────────────────────────────
export function idbStorageInfo(){
  var totalBytes=0;
  _photoCache.forEach(function(v){totalBytes+=(v||'').length;});
  return {
    photos:_photoCache.size,
    bytes:totalBytes,
    kb:Math.round(totalBytes/1024),
    mb:+(totalBytes/1048576).toFixed(2)
  };
}

// ── Auto-migrate from localStorage ───────────────────────────────
export function idbMigrateFromLocalStorage(){
  return idbOpen().then(function(){
    var promises=[];
    var migrated=0;
    engineers.forEach(function(eng){
      var photo=(eng.idcard||{}).photo||'';
      if(photo&&photo.startsWith('data:')){
        promises.push(
          idbSavePhoto(eng,photo).then(function(){   // eng (object) → keyed by uid
            eng.idcard.photo='';
            migrated++;
          })
        );
      }
    });
    return Promise.all(promises).then(function(){
      if(migrated>0){
        console.log('[EIM] Migrated '+migrated+' photo(s) to IndexedDB');
        saveState();
      }
    });
  });
}

// ── Boot ─────────────────────────────────────────────────────────
// talentIdbLoad is now AWAITED (was fire-and-forget) so the nine-box/DISC it
// loads from EIM_TalentData are present before the uid re-key runs — otherwise
// the re-key would race the load and miss them.
export function idbBoot(){
  return talentIdbLoad()                 // load nine-box/disc placements from IDB
    .then(function(){ return idbOpen(); })
    .then(idbMigrateFromLocalStorage)
    .then(idbPreloadAll)
    .then(function(){
      // uid identity pass over the IDB-sourced stores. Entities already carry uids
      // (loadState ran synchronously before this async chain). uidMigrate re-keys
      // the nine-box/DISC just loaded from IDB; idbMigrateToUid re-keys the photos
      // just preloaded — both with the SAME id→uid map, so they stay in lockstep.
      var idToUid={};
      try{ idToUid=uidMigrate(); }catch(e){ console.warn('[EIM] uid migration (idb) failed:',e); }
      return idbMigrateToUid(idToUid).then(function(photosMoved){
        if(photosMoved||uidMigrate._changed){
          talentIdbSave();               // persist re-keyed nine-box/DISC to EIM_TalentData
          // Persist entity uids + re-keyed localStorage stores. DOM-gated so it runs
          // after ensureResPeriod has restored the res period (never clobbers it).
          var flush=function(){ saveNow(); };
          if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',flush,{once:true});
          else flush();
        }
      });
    })
    .then(function(){
      _photoDBReady=true;
      idbUpdateStatus();
      console.log('[EIM] Photo DB ready. '+_photoCache.size+' photo(s) cached.');
    })
    .catch(function(err){
      _photoDBReady=false;
      console.warn('[EIM] IndexedDB unavailable, using localStorage fallback.',err);
    });
}

// Called from management dialog — shows recovery options when photos are missing
export function idbShowRecovery(){
  var dlg=document.createElement('div');
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:950;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--danger);border-radius:10px;padding:24px;width:min(500px,94vw)">'
    +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--danger);margin-bottom:12px">Photos not found</h2>'
    +'<p style="font-size:12px;color:var(--muted);line-height:1.7;margin-bottom:14px">'
    +'Photos are stored in IndexedDB, tied to the exact file location. '
    +'Moving or renaming the HTML file creates a new browser origin and the photo database appears empty. '
    +'To recover: use the JSON backup exported via the management dialog, then restore below.'
    +'</p>'
    +'<div style="display:flex;gap:8px"><button class="primary" id="idb-rb">Restore from backup</button>'
    +'<button id="idb-rc">CLOSE</button></div></div>';
  document.body.appendChild(dlg);
  document.getElementById('idb-rb').onclick=function(){idbImportPhotos();dlg.remove();};
  document.getElementById('idb-rc').onclick=function(){dlg.remove();};
}

// ── Compress + save on upload ─────────────────────────────────────
// Max 240px, JPEG 82% — typical 2MB → ~8KB
export function idbCompressAndSave(engId,file,qualityOverride){
  return new Promise(function(resolve,reject){
    // Read quality from slider if available
    var qualEl=document.getElementById('idc-photo-quality');
    var quality=qualityOverride!=null?qualityOverride:(qualEl?+(qualEl.value)/100:0.82);
    var reader=new FileReader();
    reader.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        var MAX=280; // slightly larger than before for better quality at high setting
        var scale=Math.min(1,MAX/Math.max(img.width||1,img.height||1));
        var w=Math.max(1,Math.round(img.width*scale));
        var h=Math.max(1,Math.round(img.height*scale));
        var canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        var ctx=canvas.getContext('2d');
        // Draw with white background (avoids black JPEGs from transparent PNGs)
        ctx.fillStyle='#ffffff';
        ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        var dataURL=canvas.toDataURL('image/jpeg',quality);
        var kb=Math.round(dataURL.length/1024);
        idbSavePhoto(engId,dataURL).then(function(){
          resolve({dataURL:dataURL,kb:kb,w:w,h:h});
        }).catch(reject);
      };
      img.onerror=reject;
      img.src=ev.target.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

// ── Session 2: Storage management UI ─────────────────────────────
export function idbShowManagement(){
  var info=idbStorageInfo();
  var existing=document.getElementById('idb-mgmt-dlg');
  if(existing)existing.remove();

  var rows='';
  _photoCache.forEach(function(dataURL,key){
    var eng=engineers.find(function(e){return String(e.uid)===key||String(e.id)===key;});
    var name=eng?eng.name:'Unknown (id:'+key+')';
    var kb=Math.round((dataURL||'').length/1024);
    rows+='<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
      +'<img src="'+dataURL+'" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">'
      +'<div style="flex:1"><div style="font-size:12px;font-weight:600">'+escH(name)+'</div>'
      +'<div style="font-size:10px;color:var(--muted)">'+kb+'KB</div></div>'
      +'<button onclick="idbDeleteAndRefresh(\''+key+'\')" '
      +'style="background:none;border:1px solid var(--danger);color:var(--danger);'
      +'font-size:10px;padding:2px 8px;border-radius:4px;cursor:pointer">✕ Remove</button>'
      +'</div>';
  });

  var dlg=document.createElement('div');
  dlg.id='idb-mgmt-dlg';
  dlg.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:900;'
    +'display:flex;align-items:center;justify-content:center';
  dlg.innerHTML='<div style="background:var(--surface);border:1px solid var(--border);'
    +'border-radius:10px;padding:20px 24px;width:min(420px,95vw);max-height:80vh;'
    +'display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 48px rgba(0,0,0,.8)">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<h2 style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);flex:1">📷 PHOTO STORAGE</h2>'
    +'<button onclick="document.getElementById(\'idb-mgmt-dlg\').remove()" '
    +'style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px">✕</button></div>'
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted)">'
    +info.photos+' photo(s) · '+info.kb+'KB used · IndexedDB (no size limit)</div>'
    +'<div style="overflow-y:auto;flex:1">'
    +(rows||'<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px">No photos stored</div>')
    +'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button onclick="idbClearAll()" style="color:var(--danger);border:1px solid var(--danger);'
    +'background:none;font-size:11px;padding:5px 12px;border-radius:4px;cursor:pointer">Clear all photos</button>'
    +'<button onclick="document.getElementById(\'idb-mgmt-dlg\').remove()" style="flex:1">CLOSE</button>'
    +'</div></div>';
  document.body.appendChild(dlg);
}

export function idbDeleteAndRefresh(key){
  idbDeletePhoto(key).then(function(){
    // Update engineer state ('key' is the cache key = a uid post-migration)
    var eng=engineers.find(function(e){return String(e.uid)===key||String(e.id)===key;});
    if(eng&&eng.idcard)eng.idcard.photo='';
    saveNow();
    idbShowManagement(); // refresh dialog
    idbUpdateStatus();
  });
}

export function idbClearAll(){
  if(!confirm('Remove ALL photos from storage?\nThis cannot be undone.'))return;
  var keys=[..._photoCache.keys()];
  var promises=keys.map(function(k){return idbDeletePhoto(k);});
  Promise.all(promises).then(function(){
    engineers.forEach(function(e){if(e.idcard)e.idcard.photo='';});
    saveState();
    document.getElementById('idb-mgmt-dlg').remove();
    idbUpdateStatus();
  });
}

// ── Header status indicator ───────────────────────────────────────
export function idbUpdateStatus(){
  var el=document.getElementById('idb-status');
  if(!el)return;
  var info=idbStorageInfo();
  if(info.photos>0){
    el.textContent='📷 '+info.photos;
    el.title=info.photos+' photo(s) · '+info.kb+'KB in IndexedDB\nClick to manage';
    el.style.cursor='pointer';
    el.onclick=idbShowManagement;
  } else {
    el.textContent='';
    el.onclick=null;
  }
}

// Auto-refresh status every 5s
setInterval(idbUpdateStatus,5000);
