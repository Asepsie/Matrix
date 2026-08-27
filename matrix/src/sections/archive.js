/* ►► SECTION: ARCHIVE ◄◄ Closed / finished project browser.
 * "Archived" = terminal lifecycle (cancelled / withdrawn / eol / completed), detected via
 * projIsArchived(). This is a READ-ONLY browser plus Restore — it adds no data model: it
 * reads projects[] and writes only through projSetLifecycle (so every restore is logged in
 * lifecycleHistory, like any other lifecycle change). All arch-prefixed. */

export function openArchive(){
  var ov=G('archive-overlay'); if(!ov) return;
  if(typeof closeAllOverlays==='function') closeAllOverlays();
  ov.classList.add('show');
  renderArchive();
}
export function closeArchive(){ var ov=G('archive-overlay'); if(ov) ov.classList.remove('show'); }

// Date the project entered its current terminal state (most recent terminal transition).
function _archSince(p){
  var hist=Array.isArray(p.lifecycleHistory)?p.lifecycleHistory:[];
  for(var i=hist.length-1;i>=0;i--){
    var e=hist[i];
    if(e&&e.to&&typeof projLifecycleDef==='function'&&projLifecycleDef(e.to).phase==='terminal'){
      try{ return new Date(e.ts).toLocaleDateString(); }catch(_){ return ''; }
    }
  }
  return '';
}

export function renderArchive(){
  var body=G('archive-body'); if(!body) return;
  var arch=(typeof projects!=='undefined'?projects:[]).filter(function(p){ return typeof projIsArchived==='function'&&projIsArchived(p); });
  if(!arch.length){
    body.innerHTML='<div class="arch-empty">'+escH(t('No archived projects yet. Set a project to Completed, Cancelled, Withdrawn or End of Life (in its lifecycle) to archive it — it will move here and drop out of the plan, balancer and pickers.'))+'</div>';
    return;
  }
  var groups={}; arch.forEach(function(p){ var lc=projLifecycle(p); (groups[lc]||(groups[lc]=[])).push(p); });
  var order=(typeof PROJECT_LIFECYCLE!=='undefined')
    ? PROJECT_LIFECYCLE.filter(function(s){return s.phase==='terminal';}).map(function(s){return s.id;})
    : Object.keys(groups);

  var h='<div class="arch-intro">'+escH(t('Closed and finished projects. They are hidden from the plan, balancer and project pickers to keep working views clean. Restore one to return it to the active portfolio.'))+'</div>';
  order.forEach(function(lcId){
    var list=groups[lcId]; if(!list||!list.length) return;
    var def=(typeof projLifecycleDef==='function')?projLifecycleDef(lcId):null;
    var col=safeColor(def&&def.color,'var(--muted)');
    h+='<div class="arch-grp"><div class="arch-grp-h"><span class="arch-dot" style="background:'+col+'"></span>'
      +escH(def?def.label:lcId)+' <span class="arch-n">'+list.length+'</span></div>';
    list.sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));}).forEach(function(p){
      var sec=(typeof sections!=='undefined')?sections.find(function(s){return s.id===p.sectionId;}):null;
      var since=_archSince(p);
      h+='<div class="arch-row"><div class="arch-row-main">'
        +'<span class="arch-name">'+escH(p.name||t('Untitled'))+'</span>'
        +(sec?'<span class="arch-sec" style="color:'+safeColor(sec.color,'var(--muted)')+'">'+escH(sec.name)+'</span>':'')
        +(since?'<span class="arch-since">'+escH(t('archived {d}',{d:since}))+'</span>':'')
        +'</div><div class="arch-row-btns">'
        +'<button class="sm" onclick="archView('+p.id+')">'+escH(t('View'))+'</button>'
        +'<button class="sm arch-restore" onclick="archRestore('+p.id+')">'+escH(t('Restore'))+'</button>'
        +'</div></div>';
    });
    h+='</div>';
  });
  body.innerHTML=h;
}

// Restore a project to the active portfolio (logged via projSetLifecycle).
export function archRestore(pid){
  var p=(typeof projects!=='undefined')?projects.find(function(x){return x.id===pid;}):null; if(!p) return;
  if(typeof projSetLifecycle==='function') projSetLifecycle(p,'active',t('Restored from archive'));
  else p.lifecycle='active';
  if(typeof _invalidateMemo==='function') _invalidateMemo();
  if(typeof saveState==='function') saveState();
  renderArchive();
  if(typeof renderList==='function'){ try{ renderList(); }catch(e){} }
  if(typeof renderMatrix==='function'){ try{ renderMatrix(); }catch(e){} }
}

// Open the Resource balancer focused on this (archived) project — a viewer for its final
// resourcing + gate roadmap. The balancer picker keeps a selected project even when archived.
export function archView(pid){
  closeArchive();
  if(typeof railGo==='function') railGo(null,'dashboard');
  if(typeof balSetProject==='function') balSetProject(pid);
}
