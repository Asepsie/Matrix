/* ►► SECTION: BACKUP ◄◄ Full backup export/import with photos; roster CSV export/import
 *
 * Functions defined in this file:
 *   exportRoster       — exports engineers + groups as a JSON roster file
 *   importRoster       — triggers file picker for roster import
 *   handleRosterImport — reads and applies an imported roster JSON file
 *   exportFullBackup   — exports all state + IDB photos into one JSON backup file
 *   importFullBackup   — reads and restores a full backup JSON file
 */

/* ►► SECTION: ROSTER-EXPORT ◄◄ Roster CSV export/import */
export function exportRoster(){
  const data={engineers,engGroups,nextEngId,nextEngGroupId,_type:'roster_v1'};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download='roster.json';a.click();
}
// triggers the file picker for roster import
export function importRoster(){G('roster-file-input').click();}
// reads and applies an imported roster JSON file
export function handleRosterImport(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d._type!=='roster_v1')throw new Error(t('Not a roster file. Export a roster first.'));
      if(!d.engineers||!Array.isArray(d.engineers))throw new Error(t('No engineers array found.'));
      if(!confirm(t('Replace current roster with imported one? Allocation rows will keep their engineer references by ID.\n\nNote: photos and nine-box/DISC placements are matched by engineer ID and are kept as-is — if this roster comes from a different dataset they may not line up.')))return;
      engineers=d.engineers;
      engineers.forEach(function(e){ sanitiseEngineer(e); });
      if(d.engGroups&&Array.isArray(d.engGroups))engGroups=d.engGroups;
      if(d.nextEngId)nextEngId=d.nextEngId;
      if(d.nextEngGroupId)nextEngGroupId=d.nextEngGroupId;
      saveState();renderResActiveTab();
      alert(t('Roster imported: {n} engineers in {g} groups.',{n:engineers.length,g:engGroups.length}));
    }catch(err){alert(t('Import failed:')+' '+err.message);}
  };
  r.readAsText(file);e.target.value='';
}

/* ►► SECTION: BACKUP ◄◄ Full backup export/import with photos */
export function exportFullBackup(){
  const state={
    projects,sections,engineers,engGroups,nextEngGroupId,
    allocRows,nextEngId,nextAllocId,nextId,nextTodoId,nextRiskId,
    nextMsId,nextSectionId,nextAnnotId,nextActionId,
    sepX,sepY,scaleX,scaleY,yMode,quadrantsByMode,annotations,zoom,
    engDashGroupBy,skillDomains,skillCats,finExclude:[..._finExclude],ktPlans:_ktPlans,gateConfig,
    anViews:_anViews,
    orgAnnotations:_orgAnnotations,orgLevelH:_orgLevelH,
    orgLevelNames:_orgLevelNames,orgPositions:_orgPositions,
    orgCollapsed:_orgCollapsed,orgScale:_orgScale,
    orgPanX:_orgPanX,orgPanY:_orgPanY,
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
  };

  const photos={};
  _photoCache.forEach(function(dataURL,engId){photos[engId]=dataURL;});
  const nPhotos=Object.keys(photos).length;

  const backup={
    _type:'full_backup',
    _version:1,
    _exportedAt:new Date().toISOString(),
    _photoCount:nPhotos,
    _engineerCount:engineers.filter(function(e){return !e.vacant;}).length,
    _projectCount:projects.length,
    state:state,
    _photos:photos
  };

  const json=JSON.stringify(backup);
  const kb=Math.round(json.length/1024);
  const name='matrix_fullbackup_'+new Date().toISOString().slice(0,10)+'.json';

  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  a.download=name;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href);},3000);

  alert(t('Full backup saved: {name}',{name:name})+'\n\n'
    +t('Contents:')+'\n'
    +'  '+t('Projects:')+'   '+backup._projectCount+'\n'
    +'  '+t('Engineers:')+'  '+backup._engineerCount+'\n'
    +'  '+t('Photos:')+'     '+nPhotos+'\n'
    +'  '+t('File size:')+'  '+kb+'KB\n\n'
    +t('This single file contains everything needed to restore\nyour complete workspace on another computer.'));
}

/* Apply a full-backup `state` object into the live globals — the shared, headless-
 * friendly core reused by both importFullBackup (file restore, adds the photo/IDB swap
 * around it) and loadSampleData (embedded seed, no photos). Returns the id→uid map from
 * uidMigrate so a caller can remap uid-keyed side-stores (photos). Does NOT prompt, take
 * a snapshot, or touch IndexedDB — those are the caller's concern. Mirrors the headless
 * replica in tests/smoke.mjs (applyBackupState); keep the two in step. */
export function applyBackupState(d){
  // Legacy-active detection BEFORE sanitiseProjects: a pre-lifecycle dataset (no
  // gateConfig AND no lifecycle on any project — e.g. the bundled demo) would be
  // migrated to 'proposed' by sanitiseProjects → capacity suppressed → every Review
  // view reads 0% and a newcomer thinks the app is broken. Detect that shape here and
  // force such projects 'active' after sanitise, exactly as the smoke net does. A
  // modern backup carries explicit lifecycles and is left untouched.
  const _legacy = !d.gateConfig && Array.isArray(d.projects) && d.projects.length>0
                  && d.projects.every(function(p){ return !p.lifecycle; });

  // gateConfig MUST load before sanitiseProjects (see importFullBackup's note / the
  // restore invariant in ARCHITECTURE.md): the lifecycle migration reads the active
  // methodology's first stage to decide proposed-vs-active.
  if(d.gateConfig&&typeof d.gateConfig==='object'){ gateConfig=d.gateConfig; try{ sanitiseGateConfig(); }catch(e){ gateConfig=makeGateConfig(); } }

  if(d.projects)       {projects=d.projects;sanitiseProjects();}
  if(_legacy) projects.forEach(function(p){ p.lifecycle='active'; });
  if(d.sections)       sections=d.sections;
  if(d.engineers)      {
    engineers=d.engineers;
    engineers.forEach(function(e){ sanitiseEngineer(e); });
  }
  if(d.engGroups)      engGroups=d.engGroups;
  if(d.allocRows)      allocRows=d.allocRows;
  if(d.skillDomains)   skillDomains=d.skillDomains;
  if(d.skillCats&&Array.isArray(d.skillCats)&&d.skillCats.length)skillCats=d.skillCats;
  // Dataset SWAP — always reset finExclude (keyed by per-dataset eng.id).
  _finExclude=new Set(Array.isArray(d.finExclude)?d.finExclude:[]);
  if(d.ktPlans)        _ktPlans=d.ktPlans;
  // Dataset SWAP — adopt the backup's saved analytics views, or reset to null so the
  // new dataset re-seeds the default examples rather than inheriting the old list.
  _anViews = Array.isArray(d.anViews) ? d.anViews : null;
  if(d.orgAnnotations) _orgAnnotations=d.orgAnnotations;
  if(d.orgPositions)   _orgPositions=d.orgPositions;
  if(d.orgCollapsed)   _orgCollapsed=d.orgCollapsed;
  if(d.orgLevelH)      _orgLevelH=d.orgLevelH;
  if(d.orgLevelNames)  _orgLevelNames=d.orgLevelNames;
  if(d.orgScale)       _orgScale=d.orgScale;
  if(d.orgPanX!=null)  _orgPanX=d.orgPanX;
  if(d.orgPanY!=null)  _orgPanY=d.orgPanY;
  if(d.nineBoxPlacements&&typeof d.nineBoxPlacements==='object')_nineBoxPlacements=d.nineBoxPlacements;
  if(d.nineBoxHistory&&typeof d.nineBoxHistory==='object')_nineBoxHistory=d.nineBoxHistory;
  if(d.nbYear)_nbYear=d.nbYear;
  if(d.nbCompareYear!=null)_nbCompareYear=d.nbCompareYear;
  nbEnsureHistory();
  if(d.discPlacements&&typeof d.discPlacements==='object')_discPlacements=d.discPlacements;
  if(d.nbSwapAxes!=null)_nbSwapAxes=!!d.nbSwapAxes;
  if(d.planFilterEng&&Array.isArray(d.planFilterEng))planFilterEng=new Set(d.planFilterEng);
  if(d.planFilterProj&&Array.isArray(d.planFilterProj))planFilterProj=new Set(d.planFilterProj);
  if(d.engDashFilterEng&&Array.isArray(d.engDashFilterEng))engDashFilterEng=new Set(d.engDashFilterEng);
  if(d.engDashFilterProj&&Array.isArray(d.engDashFilterProj))engDashFilterProj=new Set(d.engDashFilterProj);
  if(d.engDashGroupBy) engDashGroupBy=d.engDashGroupBy;

  if(d.nextId)          nextId=d.nextId;
  if(d.nextTodoId)      nextTodoId=d.nextTodoId;
  if(d.nextRiskId)      nextRiskId=d.nextRiskId;
  if(d.nextMsId)        nextMsId=d.nextMsId;
  if(d.nextSectionId)   nextSectionId=d.nextSectionId;
  if(d.nextAnnotId)     nextAnnotId=d.nextAnnotId;
  if(d.nextActionId)    nextActionId=d.nextActionId;
  if(d.nextEngId)       nextEngId=d.nextEngId;
  if(d.nextEngGroupId)  nextEngGroupId=d.nextEngGroupId;
  if(d.nextAllocId)     nextAllocId=d.nextAllocId;

  if(d.sepX!=null)sepX=d.sepX;if(d.sepY!=null)sepY=d.sepY;
  if(d.scaleX){scaleX=d.scaleX;setScale('x',scaleX);}
  if(d.scaleY){scaleY=d.scaleY;setScale('y',scaleY);}
  if(d.yMode){yMode=d.yMode;['impact','visibility','enabler'].forEach(function(m){G('ym-'+m).classList.toggle('active',m===yMode);});G('y-label').textContent=Y_LABELS[yMode];}
  if(d.zoom)zoom=d.zoom;
  if(d.quadrantsByMode&&typeof d.quadrantsByMode==='object'){
    ['impact','visibility','enabler'].forEach(function(m){if(d.quadrantsByMode[m])quadrantsByMode[m]=d.quadrantsByMode[m];});
  }
  if(d.annotations)annotations=d.annotations;
  if(d.resTitle){const el=G('res-title-input');if(el)el.value=d.resTitle;}
  if(d.resStart){const el=G('res-start');if(el)el.value=d.resStart;}
  if(d.resEnd)  {const el=G('res-end');  if(el)el.value=d.resEnd;}
  if(d.axis){
    const a=d.axis;
    SV('ax-x-name',a.xName||'Effort');SV('ax-x-min',a.xMin??0);SV('ax-x-max',a.xMax??10);
    SV('ax-y-min',a.yMin??0);SV('ax-y-max',a.yMax??10);SV('ax-grid',a.grid??5);
  }

  // uid identity pass over the swapped-in dataset (backfills/keeps uids, re-keys the
  // in-memory placements, returns the id→uid map for photo remapping).
  var _idToUid={};
  try{ _idToUid=uidMigrate()||{}; }catch(e){ console.warn('[EIM] uid migration (applyBackupState) failed:',e); }

  saveState();
  if(typeof _invalidateMemo==='function') _invalidateMemo();
  onAxisChange();renderList();render();updateSnapBadge();
  return _idToUid;
}

// reads and restores a full backup JSON file (state + photos)
export function importFullBackup(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='.json';
  inp.onchange=function(){
    const file=inp.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=function(ev){
      try{
        const backup=JSON.parse(ev.target.result);

        if(backup._version>1&&!confirm(t('This backup was created by a newer version of Matrix (format v{v}). Some data may not import correctly.\n\nContinue anyway?',{v:backup._version})))return;

        if(backup._type!=='full_backup'||!backup.state){
          if(backup.projects){
            if(confirm(t('This is an older export format (not a full backup).\n\nImport projects only?'))){
              takeSnap('Auto: before import','full','',true);
              projects=backup.projects;
              if(backup.sections&&Array.isArray(backup.sections))sections=backup.sections;
              sanitiseProjects();
              if(backup.nextId)        nextId=backup.nextId;
              if(backup.nextTodoId)    nextTodoId=backup.nextTodoId;
              if(backup.nextRiskId)    nextRiskId=backup.nextRiskId;
              if(backup.nextMsId)      nextMsId=backup.nextMsId;
              if(backup.nextSectionId) nextSectionId=backup.nextSectionId;
              if(backup.nextAnnotId)   nextAnnotId=backup.nextAnnotId;
              if(backup.nextActionId)  nextActionId=backup.nextActionId;
              if(backup.sepX!=null)sepX=backup.sepX; if(backup.sepY!=null)sepY=backup.sepY;
              onAxisChange();renderList();render();saveState();updateSnapBadge();
              alert(t('Projects imported successfully.'));
            }
          } else {
            alert(t('File is not a full backup.\n\nExpected a file exported via "↓ FULL BACKUP".'));
          }
          return;
        }

        const d=backup.state;
        const photos=backup._photos||{};
        const nPhotos=Object.keys(photos).length;

        if(!confirm(
          t('Restore full backup from {date}?',{date:new Date(backup._exportedAt).toLocaleString()})+'\n\n'
          +t('Contents:')+'\n'
          +'  '+t('Projects:')+'   '+(backup._projectCount||'?')+'\n'
          +'  '+t('Engineers:')+'  '+(backup._engineerCount||'?')+'\n'
          +'  '+t('Photos:')+'     '+nPhotos+'\n\n'
          +t('This will REPLACE all current data.\nA safety snapshot of your data (excluding photos) will be taken first — export a full backup now if you want to be able to restore your current photos.')
        ))return;

        takeSnap('Auto: before full backup restore','full','',true);

        // Apply the state through the shared core (does the gateConfig-before-sanitise
        // ordering, all field assignments, uidMigrate, saveState + re-render) and get
        // back the id→uid map. Then remap the photo map with the SAME map so an old
        // backup's id-keyed photos realign to the freshly-assigned uids (a new backup's
        // uid keys pass straight through).
        var _idToUid=applyBackupState(d);
        var photosU=uidRemapObj(photos,_idToUid);

        // Dataset swap: photos + talent placements are keyed by uid (per-dataset
        // engIds for legacy backups, remapped above), so replace them wholesale
        // from the backup rather than merging (a merge leaves the previous dataset's
        // photos attached to colliding ids — the "wrong face on the wrong person" mixup).
        idbReplaceAllPhotos(photosU).then(function(){
          idbUpdateStatus();
          talentIdbSave();   // make EIM_TalentData match the restored dataset
          selId=null;G('editor').style.display='none';
          alert(t('Full backup restored successfully!')+'\n\n'
            +t('Restored:')+'\n'
            +'  '+t('Projects:')+'   '+projects.length+'\n'
            +'  '+t('Engineers:')+'  '+engineers.filter(function(e){return !e.vacant;}).length+'\n'
            +'  '+t('Photos:')+'     '+nPhotos);
        }).catch(function(err){
          alert(t('Restore completed (photo restore error: {msg})',{msg:err.message}));
        });

      }catch(err){
        console.error('[EIM] Full backup import failed:',err);
        alert(t('Import failed:')+' '+err.message);
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}

/* ►► SECTION: SAMPLE-DATA ◄◄ One-click seed / clear for a first-time user.
 * SAMPLE_BACKUP is a build-time global (build.js embeds demo/matrix_demo_backup.json so
 * the single-file app needs no fetch — works from file://). null when the asset was
 * absent at build time, so both entry points self-disable gracefully. */

// True when there is nothing meaningful in the workspace yet (no real people, no projects).
export function workspaceIsEmpty(){
  return engineers.filter(function(e){return !e.vacant;}).length===0 && projects.length===0;
}

// True when this build actually carries the embedded sample dataset.
export function sampleDataAvailable(){
  return typeof SAMPLE_BACKUP!=='undefined' && SAMPLE_BACKUP && SAMPLE_BACKUP.state;
}

// Load the bundled sample dataset (40 people / 6 projects) so a newcomer sees every
// view alive in one click. Reuses the backup apply core; takes a safety snapshot first.
export function loadSampleData(){
  if(!sampleDataAvailable()){ alert(t('Sample data is not available in this build.')); return; }
  if(!workspaceIsEmpty() && !confirm(
      t('Load the sample dataset (40 people, 6 projects)?')+'\n\n'
      +t('This REPLACES your current data. A safety snapshot is taken first, so you can roll back from Snapshots.')
  )) return;
  try{
    takeSnap('Auto: before loading sample data','full','',true);
    applyBackupState(SAMPLE_BACKUP.state);
    if(typeof homeSetSampleFlag==='function') homeSetSampleFlag(true);
    // The sample is meant to show EVERY view alive → reveal the full rail (undo Basics).
    if(typeof railAdvanced!=='undefined'){ railAdvanced=true; if(typeof railSavePrefs==='function') railSavePrefs(); }
    var ov=G('landing-firstrun'); if(ov) ov.classList.remove('show');
    if(typeof railGo==='function') railGo(null,'home'); else { onAxisChange(); renderList(); render(); }
    alert(t('Sample data loaded — explore any view. Use "Clear & start mine" on Home when you\'re ready to enter your own.'));
  }catch(err){
    console.error('[EIM] load sample data failed:',err);
    alert(t('Could not load sample data:')+' '+err.message);
  }
}

// "Clear & start mine" — wipe to an empty workspace and begin fresh. Snapshots + clears
// main state, then reloads (same safe path as resetAll). The per-device sample flag is
// cleared so the "viewing sample data" strip doesn't survive the reset.
export function clearAndStartMine(){
  if(!confirm(
      t('Clear everything and start your own workspace?')+'\n\n'
      +t('A safety snapshot is taken first, so you can roll back from Snapshots. The page will reload empty.')
  )) return;
  if(typeof homeSetSampleFlag==='function') homeSetSampleFlag(false);
  saveNow();
  takeSnap('Auto: before Clear & start mine','full','',true);
  saveSnaps();
  localStorage.removeItem(SK);
  location.reload();
}
