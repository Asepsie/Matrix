/* ►► SECTION: UNDO ◄◄ Global undo / redo (Ctrl-Z / Ctrl-Shift-Z / Ctrl-Y)
 *
 * Removes the "I'll break something" fear for a new user. Feasible because every mutation
 * funnels through saveState()/saveNow() → _doSave (the committed, post-debounce write), and
 * the main state is plain JSON. We keep a ring buffer of deep-cloned state snapshots
 * (captureScope('full') — arrays + placements + res dates/axis; photos are left to Snapshots,
 * which live in IndexedDB). One committed edit = one undo step.
 *
 * v1 is SINGLE-USER-FIRST (a settled design decision): a whole-state restore could clobber a
 * teammate's concurrent edit, so undo/redo are DISABLED while connected to a shared room
 * (collabInRoom()). Undo as a real collaborative operation (Y.UndoManager) is future work.
 *
 * Relationship: undo = fine-grained recent edits; Snapshots = coarse named checkpoints.
 *
 * Everything here is `_undo`/`undoRedo`-named to stay unique in the flat bundle.
 *
 * Functions defined in this file:
 *   _undoInit          — capture the loaded state as the baseline; reveal the dock
 *   _undoCapture       — deep JSON clone of captureScope('full') (null-safe)
 *   _undoRecordCommit  — called from _doSave: push the prior baseline, set the new one
 *   undoRedo(isRedo)   — the Ctrl-Z / redo entry point (keys + topbar dock)
 *   _undoApply         — assign a captured state back into the live globals + DOM
 *   _undoRerender      — refresh the base matrix + the active view surface
 *   _undoUpdateButtons — enable/disable the dock buttons from the stacks + room state
 *   _undoToast         — small transient confirmation ("Undo · −1 project")
 */

var _UNDO_MAX = 50;            // ring depth — plenty for recent edits without unbounded memory
var _undoStack = [];           // past committed states (most-recent last)
var _redoStack = [];           // states undone, available to redo
var _undoBaseline = null;      // deep clone of the CURRENT committed state
var _undoApplying = false;     // guard: an undo/redo's own save must not re-record

// Deep clone the full captured state. Returns null if capture/serialise fails (never throws).
function _undoCapture(){
  try{ return JSON.parse(JSON.stringify(captureScope('full'))); }
  catch(e){ console.warn('[EIM] undo capture failed:',e); return null; }
}

// Capture the loaded state as the baseline (nothing to undo yet) and show the dock.
function _undoInit(){
  _undoBaseline = _undoCapture();
  _undoStack.length = 0; _redoStack.length = 0;
  var dock = G('undo-dock'); if(dock) dock.hidden = false;
  _undoUpdateButtons();
}

// Called from _doSave AFTER a committed write. The transition baseline→now is one logical
// edit: push the prior baseline onto the undo stack, drop redo, and adopt the new baseline.
function _undoRecordCommit(){
  if(_undoApplying) return;                 // this save is an undo/redo applying — skip
  var now = _undoCapture();
  if(now === null) return;                  // capture failed — don't corrupt the ring
  if(_undoBaseline === null){ _undoBaseline = now; _undoUpdateButtons(); return; }  // first commit
  _undoStack.push(_undoBaseline);
  if(_undoStack.length > _UNDO_MAX) _undoStack.shift();
  _redoStack.length = 0;                    // a fresh edit invalidates the redo trail
  _undoBaseline = now;
  _undoUpdateButtons();
}

// Ctrl-Z (isRedo=false) / Ctrl-Shift-Z / Ctrl-Y (isRedo=true), and the dock buttons.
function undoRedo(isRedo){
  if(typeof collabInRoom === 'function' && collabInRoom()){
    _undoToast(t('Undo is off in a shared room for now.'));
    return;
  }
  var from = isRedo ? _redoStack : _undoStack;
  var to   = isRedo ? _undoStack : _redoStack;
  if(!from.length){ _undoToast(isRedo ? t('Nothing to redo') : t('Nothing to undo')); return; }
  if(_undoBaseline === null) _undoBaseline = _undoCapture();
  to.push(_undoBaseline);
  var target = from.pop();
  var delta = _undoDelta(_undoBaseline, target);   // human summary BEFORE we swap
  _undoBaseline = target;
  _undoApplying = true;
  try{ _undoApply(target); if(typeof saveNow === 'function') saveNow(); }
  catch(e){ console.error('[EIM] undo apply failed:',e); }
  finally{ _undoApplying = false; }
  _undoRerender();
  _undoUpdateButtons();
  _undoToast((isRedo ? t('Redo') : t('Undo')) + (delta ? ' · ' + delta : ''));
}

// Assign a captured full-state object back into the live globals + DOM inputs. Mirrors the
// field set of captureScope('full') and restoreSnap's scope==='full' branch, minus confirm /
// IndexedDB / photo handling. Intra-dataset: the clone already carries each entity's uid, so
// no uid-reuse dance is needed — uidMigrate just re-keys the placement side-stores.
function _undoApply(d){
  if(!d) return;
  // gateConfig must load before sanitiseProjects (lifecycle migration reads the first stage).
  if(d.gateConfig){ gateConfig = d.gateConfig; try{ sanitiseGateConfig(); }catch(e){ gateConfig = makeGateConfig(); } }
  if(d.projects) projects = d.projects;
  if(d.sections) sections = d.sections;
  if(d.nextId!=null)        nextId = d.nextId;
  if(d.nextTodoId!=null)    nextTodoId = d.nextTodoId;
  if(d.nextRiskId!=null)    nextRiskId = d.nextRiskId;
  if(d.nextMsId!=null)      nextMsId = d.nextMsId;
  if(d.nextSectionId!=null) nextSectionId = d.nextSectionId;
  if(d.nextAnnotId!=null)   nextAnnotId = d.nextAnnotId;
  if(d.nextActionId!=null)  nextActionId = d.nextActionId;
  if(d.annotations) annotations = d.annotations;
  if(d.quadrantsByMode) ['impact','visibility','enabler'].forEach(function(m){ if(d.quadrantsByMode[m]) quadrantsByMode[m] = d.quadrantsByMode[m]; });
  if(d.sepX!=null) sepX = d.sepX; if(d.sepY!=null) sepY = d.sepY;
  if(typeof sanitiseProjects === 'function') sanitiseProjects();
  if(d.engineers){ engineers = d.engineers; engineers.forEach(function(e){ sanitiseEngineer(e); }); }
  if(d.engGroups) engGroups = d.engGroups;
  if(d.nextEngId!=null)      nextEngId = d.nextEngId;
  if(d.nextEngGroupId!=null) nextEngGroupId = d.nextEngGroupId;
  if(d.allocRows) allocRows = d.allocRows;
  if(d.nextAllocId!=null) nextAllocId = d.nextAllocId;
  if(d.resStart!=null && G('res-start')) G('res-start').value = d.resStart;
  if(d.resEnd!=null   && G('res-end'))   G('res-end').value   = d.resEnd;
  if(d.resTitle!=null && G('res-title-input')) G('res-title-input').value = d.resTitle;
  if(d.scaleX){ scaleX = d.scaleX; setScale('x',scaleX); }
  if(d.scaleY){ scaleY = d.scaleY; setScale('y',scaleY); }
  if(d.yMode){ yMode = d.yMode; ['impact','visibility','enabler'].forEach(function(m){ var el=G('ym-'+m); if(el) el.classList.toggle('active',m===yMode); }); var yl=G('y-label'); if(yl) yl.textContent = Y_LABELS[yMode]; }
  if(d.zoom) zoom = d.zoom;
  if(d.axis){ var a=d.axis; SV('ax-x-name',a.xName||'Effort'); SV('ax-x-min',a.xMin!=null?a.xMin:0); SV('ax-x-max',a.xMax!=null?a.xMax:10); SV('ax-y-min',a.yMin!=null?a.yMin:0); SV('ax-y-max',a.yMax!=null?a.yMax:10); SV('ax-grid',a.grid!=null?a.grid:5); }
  if(d.engDashGroupBy) engDashGroupBy = d.engDashGroupBy;
  if(d.skillDomains && Array.isArray(d.skillDomains)) skillDomains = d.skillDomains;
  if(d.skillCats && Array.isArray(d.skillCats) && d.skillCats.length) skillCats = d.skillCats;
  // Intra-dataset: the clone's finExclude is authoritative (empty array clears it).
  _finExclude = new Set(Array.isArray(d.finExclude) ? d.finExclude : []);
  if(d.planFilterEng && Array.isArray(d.planFilterEng))         planFilterEng = new Set(d.planFilterEng);
  if(d.planFilterProj && Array.isArray(d.planFilterProj))       planFilterProj = new Set(d.planFilterProj);
  if(d.engDashFilterEng && Array.isArray(d.engDashFilterEng))   engDashFilterEng = new Set(d.engDashFilterEng);
  if(d.engDashFilterProj && Array.isArray(d.engDashFilterProj)) engDashFilterProj = new Set(d.engDashFilterProj);
  if(d.ktPlans && typeof d.ktPlans === 'object') _ktPlans = d.ktPlans;
  if(d.orgAnnotations && Array.isArray(d.orgAnnotations)) _orgAnnotations = d.orgAnnotations;
  if(d.orgPositions && typeof d.orgPositions === 'object') _orgPositions = d.orgPositions;
  if(d.orgCollapsed && typeof d.orgCollapsed === 'object') _orgCollapsed = d.orgCollapsed;
  if(d.orgLevelH && typeof d.orgLevelH === 'object') _orgLevelH = d.orgLevelH;
  if(d.orgLevelNames && typeof d.orgLevelNames === 'object') _orgLevelNames = d.orgLevelNames;
  if(d.orgScale) _orgScale = d.orgScale;
  if(d.orgPanX!=null) _orgPanX = d.orgPanX;
  if(d.orgPanY!=null) _orgPanY = d.orgPanY;
  if(d.nineBoxPlacements && typeof d.nineBoxPlacements === 'object') _nineBoxPlacements = d.nineBoxPlacements;
  if(d.nineBoxHistory && typeof d.nineBoxHistory === 'object') _nineBoxHistory = d.nineBoxHistory;
  if(d.nbYear) _nbYear = d.nbYear;
  if(d.nbCompareYear!=null) _nbCompareYear = d.nbCompareYear;
  if(typeof nbEnsureHistory === 'function') nbEnsureHistory();
  if(d.discPlacements && typeof d.discPlacements === 'object') _discPlacements = d.discPlacements;
  if(d.nbSwapAxes!=null) _nbSwapAxes = !!d.nbSwapAxes;
  try{ if(typeof uidMigrate === 'function') uidMigrate(); }catch(e){ console.warn('[EIM] uid migration (undo) failed:',e); }
}

// Refresh the base matrix + sidebar, then re-render the active view surface.
function _undoRerender(){
  if(typeof _invalidateMemo === 'function') _invalidateMemo();
  try{ onAxisChange(); render(); renderList(); }catch(e){}
  if(typeof renderResActiveTab === 'function'){ try{ renderResActiveTab(); }catch(e){} }
  if(typeof spineRender === 'function') spineRender();
  // Re-open/re-render whatever view is active (same view → railGo won't push the nav stack).
  if(typeof activeView !== 'undefined' && activeView && typeof railGo === 'function'){ try{ railGo(null, activeView); }catch(e){} }
}

// Enable/disable the dock buttons from the stack depths + room state.
function _undoUpdateButtons(){
  var inRoom = (typeof collabInRoom === 'function' && collabInRoom());
  var u = G('undo-btn'), r = G('redo-btn'), dock = G('undo-dock');
  if(u) u.disabled = inRoom || _undoStack.length === 0;
  if(r) r.disabled = inRoom || _redoStack.length === 0;
  if(dock) dock.title = inRoom ? t('Undo/redo are off in a shared room') : '';
}

// Short human summary of the count change between two captured states ('' if none).
function _undoDelta(a, b){
  if(!a || !b) return '';
  var parts = [];
  [['projects', t('project'), t('projects')],
   ['engineers', t('person'), t('people')],
   ['allocRows', t('alloc row'), t('alloc rows')]].forEach(function(f){
    var la = (a[f[0]] && a[f[0]].length) || 0, lb = (b[f[0]] && b[f[0]].length) || 0;
    var dc = lb - la;
    if(dc !== 0) parts.push((dc > 0 ? '+' : '−') + Math.abs(dc) + ' ' + (Math.abs(dc) === 1 ? f[1] : f[2]));
  });
  return parts.join(', ');
}

// Small transient confirmation toast (its own fixed node; reused across calls).
var _undoToastTimer = null;
function _undoToast(msg){
  var el = G('undo-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'undo-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_undoToastTimer);
  _undoToastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2200);
}
