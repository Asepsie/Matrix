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
      if(d._type!=='roster_v1')throw new Error('Not a roster file. Export a roster first.');
      if(!d.engineers||!Array.isArray(d.engineers))throw new Error('No engineers array found.');
      if(!confirm('Replace current roster with imported one? Allocation rows will keep their engineer references by ID.'))return;
      engineers=d.engineers;
      engineers.forEach(e=>{if(e.groupId===undefined)e.groupId=null;if(!e.role)e.role='';if(!e.location)e.location='';});
      if(d.engGroups&&Array.isArray(d.engGroups))engGroups=d.engGroups;
      if(d.nextEngId)nextEngId=d.nextEngId;
      if(d.nextEngGroupId)nextEngGroupId=d.nextEngGroupId;
      saveState();renderResActiveTab();
      alert('Roster imported: '+engineers.length+' engineers in '+engGroups.length+' groups.');
    }catch(err){alert('Import failed: '+err.message);}
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
    engDashGroupBy,skillDomains,ktPlans:_ktPlans,
    orgAnnotations:_orgAnnotations,orgLevelH:_orgLevelH,
    orgLevelNames:_orgLevelNames,orgPositions:_orgPositions,
    orgCollapsed:_orgCollapsed,orgScale:_orgScale,
    orgPanX:_orgPanX,orgPanY:_orgPanY,
    nineBoxPlacements:_nineBoxPlacements,
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

  alert('Full backup saved: '+name+'\n\n'
    +'Contents:\n'
    +'  Projects:   '+backup._projectCount+'\n'
    +'  Engineers:  '+backup._engineerCount+'\n'
    +'  Photos:     '+nPhotos+'\n'
    +'  File size:  '+kb+'KB\n\n'
    +'This single file contains everything needed to restore\n'
    +'your complete workspace on another computer.');
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

        if(backup._type!=='full_backup'||!backup.state){
          if(backup.projects){
            if(confirm('This is an older export format (not a full backup).\n\nImport projects only?')){
              takeSnap('Auto: before import','full','',true);
              projects=backup.projects;
              if(backup.sections&&Array.isArray(backup.sections))sections=backup.sections;
              sanitiseProjects();
              ['nextId','nextTodoId','nextRiskId','nextMsId','nextSectionId','nextAnnotId','nextActionId'].forEach(function(k){if(backup[k])eval(k+'=backup[k]');});
              if(backup.sepX!=null)sepX=backup.sepX; if(backup.sepY!=null)sepY=backup.sepY;
              onAxisChange();renderList();render();saveState();updateSnapBadge();
              alert('Projects imported successfully.');
            }
          } else {
            alert('File is not a full backup.\n\nExpected a file exported via "↓ FULL BACKUP".');
          }
          return;
        }

        const d=backup.state;
        const photos=backup._photos||{};
        const nPhotos=Object.keys(photos).length;

        if(!confirm(
          'Restore full backup from '+new Date(backup._exportedAt).toLocaleString()+'?\n\n'
          +'Contents:\n'
          +'  Projects:   '+(backup._projectCount||'?')+'\n'
          +'  Engineers:  '+(backup._engineerCount||'?')+'\n'
          +'  Photos:     '+nPhotos+'\n\n'
          +'This will REPLACE all current data.\n'
          +'A safety snapshot will be taken first.'
        ))return;

        takeSnap('Auto: before full backup restore','full','',true);

        if(d.projects)       {projects=d.projects;sanitiseProjects();}
        if(d.sections)       sections=d.sections;
        if(d.engineers)      {
          engineers=d.engineers;
          engineers.forEach(function(e){
            if(!e.idcard)e.idcard={};
            if(!e.skills)e.skills=[];
            if(e.groupId===undefined)e.groupId=null;
          });
        }
        if(d.engGroups)      engGroups=d.engGroups;
        if(d.allocRows)      allocRows=d.allocRows;
        if(d.skillDomains)   skillDomains=d.skillDomains;
        if(d.ktPlans)        _ktPlans=d.ktPlans;
        if(d.orgAnnotations) _orgAnnotations=d.orgAnnotations;
        if(d.orgPositions)   _orgPositions=d.orgPositions;
        if(d.orgCollapsed)   _orgCollapsed=d.orgCollapsed;
        if(d.orgLevelH)      _orgLevelH=d.orgLevelH;
        if(d.orgLevelNames)  _orgLevelNames=d.orgLevelNames;
        if(d.orgScale)       _orgScale=d.orgScale;
        if(d.orgPanX!=null)  _orgPanX=d.orgPanX;
        if(d.orgPanY!=null)  _orgPanY=d.orgPanY;
        if(d.nineBoxPlacements&&typeof d.nineBoxPlacements==='object')_nineBoxPlacements=d.nineBoxPlacements;
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

        var photoPromises=Object.entries(photos).map(function(entry){
          return idbSavePhoto(entry[0],entry[1]);
        });

        Promise.all(photoPromises).then(function(){
          return idbPreloadAll();
        }).then(function(){
          idbUpdateStatus();
          saveState();
          onAxisChange();renderList();render();updateSnapBadge();
          selId=null;G('editor').style.display='none';
          alert('Full backup restored successfully!\n\n'
            +'Restored:\n'
            +'  Projects:   '+projects.length+'\n'
            +'  Engineers:  '+engineers.filter(function(e){return !e.vacant;}).length+'\n'
            +'  Photos:     '+photoPromises.length);
        }).catch(function(err){
          saveState();onAxisChange();renderList();render();
          alert('Restore completed (photo restore error: '+err.message+')');
        });

      }catch(err){
        console.error('[EIM] Full backup import failed:',err);
        alert('Import failed: '+err.message);
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}
