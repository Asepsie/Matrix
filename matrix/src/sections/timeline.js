/* ►► SECTION: TIMELINE ◄◄ Timeline tab: per-project Gantt grid, resource conflicts, drag-to-reorder
 *
 * Functions defined in this file:
 *   toggleTimelineConflict — toggles the "conflicts only" filter and re-renders
 *   _tlDragStart           — drag start for a timeline project row
 *   _tlDragEnd             — drag end for a timeline project row
 *   _tlDragOver            — dragover handler enabling row drop
 *   _tlDrop                — reorders project rows on drop
 *   renderTimeline         — renders the timeline grid (project bars, engineer rows, conflicts)
 *
 * Note: renderTimeline references exportTimelinePDF() in a button onclick — that
 *       function is referenced-but-undefined in the original monolith (preserved verbatim).
 */

// Persisted timeline state
if(typeof _tlState==='undefined'){
  var _tlState={
    conflictOnly: false,
    projOrder:    [],
  };
}

// toggles the "conflicts only" filter and re-renders
function toggleTimelineConflict(){
  _tlState.conflictOnly=!_tlState.conflictOnly;
  renderTimeline();
}

// Drag-and-drop: batch reorder, only re-render on drop
var _tlDragSrcIdx=null;

// drag start for a timeline project row
function _tlDragStart(e,idx){
  _tlDragSrcIdx=idx;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',String(idx));
  setTimeout(function(){if(e.target)e.target.style.opacity='0.4';},0);
}
// drag end for a timeline project row
function _tlDragEnd(e){
  if(e.target)e.target.style.opacity='';
  _tlDragSrcIdx=null;
}
// dragover handler enabling row drop
function _tlDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
}
// reorders project rows on drop
function _tlDrop(e,targetIdx){
  e.preventDefault();
  var src=_tlDragSrcIdx;
  if(src===null||src===targetIdx)return;
  var arr=_tlState.projOrder;
  var moved=arr.splice(src,1)[0];
  arr.splice(targetIdx,0,moved);
  _tlDragSrcIdx=null;
  renderTimeline();
}

// renders the timeline grid (project bars, engineer rows, conflicts)
function renderTimeline(){
  var body=G('res-body');if(!body)return;
  var months=getMonthRange();
  var cur=curMonth();

  if(!months.length){
    body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:200px;flex-direction:column;gap:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px"><div style="font-size:28px">📅</div><div>Set FROM and TO dates in the header first</div></div>';
    return;
  }

  // Build conflict map: for each engineer per month, sum allocations
  var engMonthSum={};
  engineers.filter(function(e){return !e.vacant;}).forEach(function(eng){
    engMonthSum[eng.id]={};
    months.forEach(function(m){
      engMonthSum[eng.id][m]=allocRows.filter(function(r){return r.engId===eng.id;})
        .reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);
    });
  });

  // Projects that have at least one allocation row
  var _allActive=projects.filter(function(p){
    return allocRows.some(function(r){return r.projectId===p.id&&months.some(function(m){return r.allocs&&r.allocs[m]>0;});});
  });
  // Sync drag order
  var _activeIds=_allActive.map(function(p){return p.id;});
  _tlState.projOrder=_tlState.projOrder.filter(function(id){return _activeIds.indexOf(id)>=0;});
  _activeIds.forEach(function(id){if(_tlState.projOrder.indexOf(id)<0)_tlState.projOrder.push(id);});
  var activeProjects=_tlState.projOrder.map(function(id){return _allActive.find(function(p){return p.id===id;});}).filter(Boolean);
  // Conflict-only filter
  if(_tlState.conflictOnly){
    activeProjects=activeProjects.filter(function(proj){
      var pRows=allocRows.filter(function(r){return r.projectId===proj.id;});
      var eIds=pRows.map(function(r){return r.engId;});
      return months.some(function(m){return eIds.some(function(eid){return engMonthSum[eid]&&engMonthSum[eid][m]>1.005;});});
    });
  }

  var CELL_W=Math.max(22,Math.min(40,Math.floor(800/months.length)));
  var ROW_H=34;
  var LABEL_W=200;
  var ENG_H=24;

  var h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'
   +'<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">PROJECT TIMELINE &amp; RESOURCE CONFLICTS</h3>'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+activeProjects.length+' active projects · '+months.length+' months</span>'
   +'<div style="flex:1"></div>'
   +'<div style="display:flex;gap:8px;font-size:9px;font-family:IBM Plex Mono,monospace;align-items:center">'
   +'<span style="color:var(--accent)">█ allocated</span>'
   +'<span style="color:var(--danger)">█ conflict &gt;100%</span>'
   +'<span style="color:var(--accent2)">█ current month</span>'
   +'<span style="color:var(--muted)">░ partial</span>'
   +'</div>'
   +'<button onclick="toggleTimelineConflict()" class="sm'
   +(_tlState.conflictOnly?' active':'')+'" '
   +'style="font-size:9px;padding:2px 8px'
   +(_tlState.conflictOnly?';border-color:var(--danger);color:var(--danger)':'')+'">'
   +'⚠ CONFLICTS ONLY'+(_tlState.conflictOnly?' ✓':'')+' </button>'
   +'<button class="add-row-btn" onclick="exportTimelinePDF()" style="border-color:#5be5c8;color:#5be5c8;font-size:9px">&#8595; PDF</button>'
   +'</div>'
   +'<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);margin-bottom:6px">↕ Drag rows to reorder · hover cells for details</div>';

  // ── Scrollable grid ────────────────────────────────────────────
  h+='<div style="flex:1;overflow:auto;min-height:0">';
  h+='<div style="min-width:'+(LABEL_W+months.length*CELL_W+8)+'px">';

  // Month header row
  h+='<div style="display:flex;position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--border)">'
   +'<div style="width:'+LABEL_W+'px;flex-shrink:0;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);padding:4px 8px;border-right:1px solid var(--border)">PROJECT / ENGINEERS</div>'
   +'<div style="display:flex">'
   +months.map(function(m){
     var isCur=m===cur;
     var label=m.slice(5,7)+'/'+m.slice(2,4);
     return '<div style="width:'+CELL_W+'px;flex-shrink:0;text-align:center;font-family:IBM Plex Mono,monospace;font-size:'+(CELL_W<28?'7':'8')+'px;color:'+(isCur?'var(--accent)':'var(--muted)')+';padding:3px 0;'+(isCur?'background:rgba(200,241,53,.06)':'')+';border-right:1px solid var(--border)">'+label+'</div>';
   }).join('')
   +'</div></div>';

  // Project rows
  activeProjects.forEach(function(proj){
    var pcol=safeColor(proj.color);
    var sec=sections.find(function(s){return s.id===proj.sectionId;});
    var projRows=allocRows.filter(function(r){return r.projectId===proj.id;});
    var projEngs=projRows.map(function(r){return engineers.find(function(e){return e.id===r.engId;});}).filter(Boolean);
    projEngs=[...new Map(projEngs.map(function(e){return [e.id,e];})).values()];

    // Project bar: presence per month
    var projPresence=months.map(function(m){return projRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);});
    var projStartIdx=projPresence.findIndex(function(v){return v>0;});
    var projEndIdx=projPresence.length-1-[...projPresence].reverse().findIndex(function(v){return v>0;});

    // Project header row
    h+='<div draggable="true" '      +'ondragstart="_tlDragStart(event,'+activeProjects.indexOf(proj)+')" '      +'ondragend="_tlDragEnd(event)" '      +'ondragover="_tlDragOver(event)" '      +'ondrop="_tlDrop(event,'+activeProjects.indexOf(proj)+')" '      +'style="display:flex;align-items:stretch;border-bottom:1px solid var(--border);cursor:grab">'
     +'<div style="width:'+LABEL_W+'px;flex-shrink:0;display:flex;align-items:center;gap:6px;padding:4px 8px;border-right:1px solid var(--border);background:var(--surface)">'
     +'<span style="color:var(--muted);font-size:10px;margin-right:2px">⠿</span>'
     +'<div style="width:8px;height:8px;border-radius:2px;background:'+pcol+';flex-shrink:0"></div>'
     +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;font-weight:700;color:'+pcol+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:'+(LABEL_W-40)+'px" title="'+escH(proj.name)+'">'+escH(proj.name)+'</div>'
     +(sec?'<div style="font-size:8px;color:var(--muted);white-space:nowrap">'+escH(sec.name)+'</div>':'')
     +'</div>'
     +'<div style="display:flex;position:relative">'
     +months.map(function(m,i){
       var v=projPresence[i];
       var isCur=m===cur;
       var inProj=v>0.001;
       var isStart=i===projStartIdx;
       var isEnd=i===projEndIdx;
       var bg=!inProj?'transparent':isCur?'rgba(200,241,53,.25)':'rgba(200,241,53,.12)';
       var border=isStart?'border-left:2px solid '+pcol+';':'';
       var border2=isEnd?'border-right:2px solid '+pcol+';':'';
       var fteLabel=v>0.1?Math.round(v*10)/10+'':'' ;
       return '<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+ROW_H+'px;background:'+bg+';'+border+border2+
         (isCur?'border-top:1px solid rgba(200,241,53,.3);border-bottom:1px solid rgba(200,241,53,.3);':'')+
         'display:flex;align-items:center;justify-content:center;border-right:1px solid rgba(255,255,255,.04)">'
         +(inProj&&CELL_W>25?'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--accent);opacity:.7">'+fteLabel+'</span>':'')
         +'</div>';
     }).join('')
     +'</div></div>';

    // Engineer rows within this project
    projEngs.forEach(function(eng){
      var engRows=projRows.filter(function(r){return r.engId===eng.id;});
      var photo=_photoCache&&_photoCache.get(eng.id);
      var ini=(eng.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
      var av=photo
        ?'<img src="'+photo+'" style="width:14px;height:14px;border-radius:50%;object-fit:cover;flex-shrink:0">'
        :'<div style="width:14px;height:14px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:var(--muted);flex-shrink:0">'+ini+'</div>';

      h+='<div style="display:flex;align-items:stretch;border-bottom:1px solid rgba(255,255,255,.04)">'
       +'<div style="width:'+LABEL_W+'px;flex-shrink:0;display:flex;align-items:center;gap:5px;padding:2px 8px 2px 20px;border-right:1px solid var(--border)">'
       +av
       +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:'+(LABEL_W-50)+'px">'+escH(eng.name)+'</div>'
       +'</div>'
       +'<div style="display:flex">'
       +months.map(function(m){
         var v=engRows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]!=null?_allocNum(r.allocs[m]):0);},0);
         var totalV=engMonthSum[eng.id]&&engMonthSum[eng.id][m]||0;
         var isConflict=totalV>1.005;
         var isCur=m===cur;
         var alpha=Math.round(v*80);
         var bg=v<0.01?'transparent':isConflict?'rgba(241,67,53,0.'+Math.min(90,40+alpha)+')':'rgba(200,241,53,0.'+(20+Math.round(v*60))+')';
         var pctLabel=v>0.05?Math.round(v*100)+'':'' ;
         return '<div style="width:'+CELL_W+'px;flex-shrink:0;height:'+ENG_H+'px;background:'+bg+';'+(isCur?'border-top:1px solid rgba(200,241,53,.2);border-bottom:1px solid rgba(200,241,53,.2);':'')+
           'display:flex;align-items:center;justify-content:center;border-right:1px solid rgba(255,255,255,.03)" title="'+escH(eng.name)+' · '+m+' · '+Math.round(v*100)+'%'+(isConflict?' ⚠ CONFLICT: total '+Math.round(totalV*100)+'%':'')+'"><span style="font-family:IBM Plex Mono,monospace;font-size:7px;color:'+(isConflict?'var(--danger)':'var(--accent)')+';opacity:.8">'+( CELL_W>25?pctLabel:'')+'</span></div>';
       }).join('')
       +'</div></div>';
    });
  });

  // ── Conflict summary row ────────────────────────────────────────
  var conflictEngs=engineers.filter(function(eng){
    return months.some(function(m){return engMonthSum[eng.id]&&engMonthSum[eng.id][m]>1.005;});
  });
  if(conflictEngs.length){
    h+='<div style="margin-top:16px;padding:10px 12px;background:rgba(241,67,53,.08);border:1px solid rgba(241,67,53,.3);border-radius:7px">'
     +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--danger);margin-bottom:8px;letter-spacing:.06em">&#9888; ALLOCATION CONFLICTS</div>'
     +'<div style="display:flex;flex-direction:column;gap:4px">';
    conflictEngs.forEach(function(eng){
      var cmths=months.filter(function(m){return engMonthSum[eng.id][m]>1.005;});
      var projNames=cmths.map(function(m){
        return allocRows.filter(function(r){return r.engId===eng.id&&r.allocs&&r.allocs[m]>0;}).map(function(r){
          var p=projects.find(function(p){return p.id===r.projectId;});return p?p.name:'?';
        }).filter(Boolean);
      }).flat();
      var uniqueProjs=[...new Set(projNames)];
      h+='<div style="display:flex;align-items:center;gap:8px;font-size:9px;font-family:IBM Plex Mono,monospace">'
       +'<span style="color:var(--danger);font-weight:700">'+escH(eng.name)+'</span>'
       +'<span style="color:var(--muted)">over-allocated in '+cmths.slice(0,4).map(function(m){return m.slice(0,7);}).join(', ')+(cmths.length>4?'…':'')+'</span>'
       +'<span style="color:var(--muted)">across: '+uniqueProjs.slice(0,3).map(function(n){return escH(n);}).join(', ')+(uniqueProjs.length>3?'…':'')+'</span>'
       +'</div>';
    });
    h+='</div></div>';
  }

  h+='</div></div></div>';
  body.innerHTML=h;
}
