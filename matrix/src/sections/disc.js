/* ►► SECTION: DISC ◄◄ DISC behavioral matrix: quadrants, people, render, export, drag
 *
 * Functions defined in this file:
 *   _discQuadrants   — returns the four DISC quadrant definitions (traits, notes, colors)
 *   _discPeopleHTML  — builds the people-chip HTML for one quadrant
 *   renderDiscMatrix — renders the DISC matrix with drag-and-drop people chips
 *   buildDiscHTML    — builds the standalone HTML page used for PDF/PNG export
 *   exportDiscPDF    — opens a print popup with the DISC layout
 *   exportDiscPNG    — renders the DISC matrix to PNG via SVG foreignObject
 *   discDragStart    — drag start handler for engineer chips
 *   discDrop         — drop handler: assigns engineer to a DISC quadrant
 *   discRemove       — removes an engineer from the DISC matrix
 */

// returns the four DISC quadrant definitions (traits, notes, colors)
function _discQuadrants(){
  return [
    {key:'D',label:'DOMINANCE',color:'rgba(241,67,53,0.15)',colorSolid:'#2e1614',badge:'#f14335',emoji:'🔴',
     traits:['Results-oriented','Direct & decisive','Competitive','High drive','Risk-taker','Challenges status quo'],
     strengths:'Drives results, handles pressure, takes initiative',
     blindspots:'Can be blunt, impatient, overlooks people impact',
     motivates:'Authority, challenges, measurable results, autonomy',
     manages:'Give them ownership; be direct; avoid micromanaging'},
    {key:'I',label:'INFLUENCE',color:'rgba(200,241,53,0.15)',colorSolid:'#2a2f12',badge:'#c8f135',emoji:'🟡',
     traits:['Enthusiastic','Collaborative','Persuasive','Optimistic','Social','Idea-generator'],
     strengths:'Energises teams, builds relationships, sells vision',
     blindspots:'Can over-commit, avoid conflict, lose focus on detail',
     motivates:'Recognition, social interaction, creative freedom',
     manages:'Involve them early; public recognition; clear follow-ups'},
    {key:'S',label:'STEADINESS',color:'rgba(91,229,200,0.15)',colorSolid:'#193d38',badge:'#5be5c8',emoji:'🟢',
     traits:['Patient','Reliable','Team-oriented','Empathetic','Process-focused','Consistent'],
     strengths:'Stabilises teams, deep loyalty, excellent listener',
     blindspots:'Resists change, avoids confrontation, may defer too much',
     motivates:'Stability, appreciation, clear process, team harmony',
     manages:'Prepare them for change early; personal recognition'},
    {key:'C',label:'CONSCIENTIOUSNESS',color:'rgba(120,120,200,0.15)',colorSolid:'#1a1a2e',badge:'#9090f0',emoji:'🔵',
     traits:['Analytical','Detail-oriented','Quality-focused','Systematic','Cautious','High standards'],
     strengths:'Precise analysis, risk identification, structured thinking',
     blindspots:'Perfectionism, slow to decide, over-analyses',
     motivates:'Quality outcomes, data, clear expectations, expertise',
     manages:'Give time to prepare; avoid surprises; focus on data'},
  ];
}

// builds the people-chip HTML for one quadrant
function _discPeopleHTML(key,placements,engList,photoCache,forExport){
  var placed=engList.filter(function(e){return placements[e.uid]===key;});
  if(!placed.length){
    if(forExport)return '';
    return '<div style="min-height:28px;color:var(--muted);font-size:10px;font-family:IBM Plex Mono,monospace;opacity:.5;padding:4px">Drop here</div>';
  }
  var chips=placed.map(function(e){
    var photo=photoCache&&photoCache.get&&photoCache.get(e.uid);
    var ini=(e.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
    // structure-only fork — see the same note in ninebox.js's _nbPeopleHTML
    var avSz=forExport?26:28;
    var avBd='2px solid var(--accent)';
    var avBg='var(--surface)';
    var avCl='var(--accent)';
    var txCl='var(--text)';
    var muCl='var(--muted)';
    var av=photo
      ?('<img src="'+photo+'" style="width:'+avSz+'px;height:'+avSz+'px;border-radius:50%;object-fit:cover;border:'+avBd+';flex-shrink:0;">')
      :('<div style="width:'+avSz+'px;height:'+avSz+'px;border-radius:50%;background:'+avBg+';border:'+avBd+';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:'+avCl+';flex-shrink:0;font-family:monospace">'+ini+'</div>');
    var nm='<div style="overflow:hidden"><div style="font-size:10px;font-weight:600;color:'+txCl+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">'+escH(e.name)+'</div><div style="font-size:8px;color:'+muCl+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px">'+escH(e.role||'')+'</div></div>';
    if(forExport){
      return '<div style="display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:5px;background:var(--bg);margin:2px">'+av+nm+'</div>';
    }
    return '<div draggable="true" ondragstart="discDragStart(event,'+e.id+')"'
      +' style="display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:5px;background:var(--bg);margin:2px;cursor:grab;position:relative;transition:background .12s"'
      +' onmouseenter="this.style.background=\'rgba(200,241,53,.1)\'" onmouseleave="this.style.background=\'var(--bg)\'"'
      +' title="'+escH(e.name)+' — drag to reassign">'
      +av+nm
      +'<button onclick="event.stopPropagation();discRemove('+e.id+')"'
      +' style="position:absolute;right:1px;top:1px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:9px;line-height:1;padding:1px"'
      +' onmouseenter="this.style.color=\'var(--accent)\'" onmouseleave="this.style.color=\'var(--muted)\'">&#215;</button>'
      +'</div>';
  }).join('');
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">'+chips+'</div>';
}

// renders the DISC matrix with drag-and-drop people chips
export function renderDiscMatrix(){
  var body=G('res-body');if(!body)return;
  _tpLens='disc';
  if(!_discPlacements)_discPlacements={};
  var QUADRANTS=_discQuadrants();
  var placedSet=new Set(Object.keys(_discPlacements));   // keys are uids
  var talentEngsD=engineers.filter(function(e){return !e.vacant&&e.includeTalent!==false;});
  var unplaced=talentEngsD.filter(function(e){return !placedSet.has(e.uid)||!QUADRANTS.find(function(q){return q.key===_discPlacements[e.uid];});});

  var h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';
  h+=tpLensBar();
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'
    +'<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">DISC BEHAVIORAL PROFILE</h3>'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+Object.keys(_discPlacements).length+' profiled · '+unplaced.length+' unassigned</span>'
    +'<div style="flex:1"></div>'
    +'<button class="add-row-btn" onclick="discExportOpen()" style="border-color:#5be5c8;color:#5be5c8;font-size:9px;padding:2px 8px" title="'+escH(t('Export DISC'))+'">&#128196; '+escH(t('EXPORT'))+'</button>'
    +'<div style="width:1px;background:var(--border);height:16px"></div>'
    +'<button class="add-row-btn" onclick="_discPlacements={};saveState();talentIdbSave();renderDiscMatrix()" style="color:var(--muted);font-size:9px">&#8635; CLEAR</button>'
    +'<button class="primary" style="font-size:10px;padding:3px 10px" onclick="saveState();flashSaved()">SAVE</button>'
    +'</div>';

  if(unplaced.length){
    h+='<div style="margin-bottom:10px">'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:5px;letter-spacing:.06em">UNASSIGNED &#8212; drag to a DISC quadrant</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:5px;padding:7px;background:var(--surface);border:1px solid var(--border);border-radius:8px">'
      +unplaced.map(function(e){
        var photo=_photoCache&&_photoCache.get(e.uid);
        var ini=(e.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
        var av=photo
          ?('<img src="'+photo+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1px solid var(--border)">')
          :('<div style="width:24px;height:24px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--muted);font-family:IBM Plex Mono,monospace">'+ini+'</div>');
        return '<div draggable="true" ondragstart="discDragStart(event,'+e.id+')"'
          +' style="display:flex;align-items:center;gap:4px;cursor:grab;padding:3px 6px;border-radius:5px;background:var(--bg);border:1px solid var(--border);transition:border-color .12s"'
          +' onmouseenter="this.style.borderColor=\'var(--accent)\'" onmouseleave="this.style.borderColor=\'var(--border)\'"'
          +' title="'+escH(e.name)+'">'+av+'<span style="font-size:10px;font-weight:600;color:var(--text)">'+escH(e.name)+'</span></div>';
      }).join('')
      +'</div></div>';
  }

  h+='<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;flex:1;gap:8px;min-height:0">';
  QUADRANTS.forEach(function(q){
    var people=_discPeopleHTML(q.key,_discPlacements,engineers,_photoCache,false);
    h+='<div'
      +' style="background:'+q.color+';border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px;overflow:hidden;transition:border-color .15s"'
      +' ondragover="event.preventDefault();this.style.borderColor=\'var(--accent)\'"'
      +' ondragleave="this.style.borderColor=\'var(--border)\'"'
      +' ondrop="discDrop(event,\''+q.key+'\');this.style.borderColor=\'var(--border)\'">'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<div style="width:28px;height:28px;border-radius:6px;background:'+q.badge+';display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">'+q.emoji+'</div>'
      +'<div>'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:13px;font-weight:700;color:'+q.badge+';letter-spacing:.06em">'+q.key+'</div>'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.08em">'+q.label+'</div>'
      +'</div></div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:3px">'
      +q.traits.map(function(t){return '<span style="font-size:9px;padding:1px 5px;border-radius:10px;background:var(--bg);color:var(--muted);font-family:IBM Plex Mono,monospace;border:1px solid var(--border)">'+t+'</span>';}).join('')
      +'</div>'
      +'<div style="flex:1;overflow-y:auto;min-height:36px">'+people+'</div>'
      +'<details style="margin-top:2px"><summary style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);cursor:pointer;letter-spacing:.06em;user-select:none">&#9658; LEADERSHIP NOTES</summary>'
      +'<div style="margin-top:5px;font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;line-height:1.5;display:flex;flex-direction:column;gap:3px">'
      +'<div><span style="color:'+q.badge+'">STRENGTHS:</span> '+q.strengths+'</div>'
      +'<div><span style="color:'+q.badge+'">BLINDSPOTS:</span> '+q.blindspots+'</div>'
      +'<div><span style="color:'+q.badge+'">MOTIVATES:</span> '+q.motivates+'</div>'
      +'<div><span style="color:'+q.badge+'">MANAGE BY:</span> '+q.manages+'</div>'
      +'</div></details>'
      +'</div>';
  });
  h+='</div></div>';
  body.innerHTML=h;
}

// builds the standalone HTML page used for PDF/PNG export
function buildDiscHTML(){
  var QUADRANTS=_discQuadrants();
  var dateStr=new Date().toLocaleDateString();
  var teamName=(G('res-title-input')?G('res-title-input').value:'Team')||'Team';
  var quadsHTML=QUADRANTS.map(function(q){
    var people=_discPeopleHTML(q.key,_discPlacements,engineers,_photoCache,true);
    return '<div style="background:'+q.colorSolid+';border:1px solid #2a2a32;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;overflow:hidden">'
      +'<div style="display:flex;align-items:center;gap:8px">'
      +'<div style="width:30px;height:30px;border-radius:6px;background:'+q.badge+';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">'+q.emoji+'</div>'
      +'<div><div style="font-family:monospace;font-size:16px;font-weight:700;color:'+q.badge+';letter-spacing:.06em">'+q.key+'</div>'
      +'<div style="font-family:monospace;font-size:9px;color:#777;letter-spacing:.08em">'+q.label+'</div></div>'
      +'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:3px">'
      +q.traits.map(function(t){return '<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:#0f0f11;color:#777;font-family:monospace;border:1px solid #2a2a32">'+t+'</span>';}).join('')
      +'</div>'
      +'<div style="flex:1;min-height:60px;display:grid;grid-template-columns:1fr 1fr;gap:0">'+(people||'<span style="font-size:9px;color:#555">—</span>')+'</div>'
      +'<div style="font-size:9px;color:#666;font-family:monospace;line-height:1.5;padding:6px;background:#0a0a0c;border-radius:5px;border-left:2px solid '+q.badge+'">'
      +'<div><span style="color:'+q.badge+'">STRENGTHS:</span> '+q.strengths+'</div>'
      +'<div><span style="color:'+q.badge+'">BLINDSPOTS:</span> '+q.blindspots+'</div>'
      +'<div><span style="color:'+q.badge+'">MOTIVATES:</span> '+q.motivates+'</div>'
      +'<div><span style="color:'+q.badge+'">MANAGE BY:</span> '+q.manages+'</div>'
      +'</div></div>';
  }).join('');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;}'
    +'html,body{background:#0f0f11;color:#e8e8ec;font-family:Arial,sans-serif;padding:20px;'
    +'-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    +'.hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;'
    +'background:#1a1a1e;border:1px solid #2a2a32;border-radius:8px;margin-bottom:16px;}'
    +'.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;'
    +'gap:10px;height:calc(100vh - 100px);min-height:500px;}'
    +'@media print{@page{size:A3 landscape;margin:8mm;}html,body{padding:8px;}}'
    +'</style></head><body>'
    +'<div class="hdr"><div>'
    +'<div style="font-size:15px;font-weight:700;color:#c8f135;font-family:monospace;letter-spacing:.04em">DISC BEHAVIORAL PROFILE</div>'
    +'<div style="font-size:10px;color:#666;margin-top:2px">'+escH(teamName)+' · '+Object.keys(_discPlacements).length+' profiled</div>'
    +'</div><div style="text-align:right;font-family:monospace">'
    +'<div style="font-size:10px;color:#c8f135">Project Matrix</div>'
    +'<div style="font-size:9px;color:#666">'+dateStr+'</div>'
    +'</div></div>'
    +'<div class="grid">'+quadsHTML+'</div>'
    +'</body></html>';
}

/* ►► SECTION: DISC-EXPORT ◄◄ DISC on the shared export engine.
 *
 * Same shape as the nine-box migration next door: the quadrant markup is
 * re-expressed in var(--…) tokens (the old buildDiscHTML hardcodes #777/#0a0a0c
 * and only ever looked right on the dark theme), so one markup string serves
 * both the app theme and the light paper theme. Plain HTML, so the engine's own
 * PNG rasteriser applies — no custom `run` format handler needed.
 */
function discExportBlocks(){
  var mono='font-family:IBM Plex Mono,monospace';
  return [
    {id:'quadrants', label:t('DISC quadrants'), render:function(){
      var QUADRANTS=_discQuadrants();
      var quads=QUADRANTS.map(function(q){
        var people=_discPeopleHTML(q.key,_discPlacements,engineers,_photoCache,true);
        // translucent `color`, not the dark-only `colorSolid` — see the same note
        // in ninebox.js's nbExportBlocks
        return '<div style="background:'+safeColor(q.color)+';border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;overflow:hidden">'
          +'<div style="display:flex;align-items:center;gap:8px">'
          +'<div style="width:30px;height:30px;border-radius:6px;background:'+safeColor(q.badge)+';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">'+escH(q.emoji)+'</div>'
          +'<div><div style="'+mono+';font-size:16px;font-weight:700;color:'+safeColor(q.badge)+';letter-spacing:.06em">'+escH(q.key)+'</div>'
          +'<div style="'+mono+';font-size:9px;color:var(--muted);letter-spacing:.08em">'+escH(q.label)+'</div></div></div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:3px">'
          +q.traits.map(function(tr){return '<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--bg);color:var(--muted);'+mono+';border:1px solid var(--border)">'+escH(tr)+'</span>';}).join('')
          +'</div>'
          +'<div style="flex:1;min-height:60px;display:grid;grid-template-columns:1fr 1fr;gap:0">'+(people||'<span style="font-size:9px;color:var(--dim)">—</span>')+'</div>'
          +'<div style="font-size:9px;color:var(--muted);'+mono+';line-height:1.5;padding:6px;background:var(--bg);border-radius:5px;border-left:2px solid '+safeColor(q.badge)+'">'
          +'<div><span style="color:'+safeColor(q.badge)+'">'+escH(t('STRENGTHS:'))+'</span> '+escH(q.strengths)+'</div>'
          +'<div><span style="color:'+safeColor(q.badge)+'">'+escH(t('BLINDSPOTS:'))+'</span> '+escH(q.blindspots)+'</div>'
          +'<div><span style="color:'+safeColor(q.badge)+'">'+escH(t('MOTIVATES:'))+'</span> '+escH(q.motivates)+'</div>'
          +'<div><span style="color:'+safeColor(q.badge)+'">'+escH(t('MANAGE BY:'))+'</span> '+escH(q.manages)+'</div>'
          +'</div></div>';
      }).join('');
      return '<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;min-height:560px">'+quads+'</div>';
    }},
    {id:'mix', label:t('Team mix'), render:function(){
      var QUADRANTS=_discQuadrants();
      var total=engineers.filter(function(e){return _discPlacements[e.uid];}).length;
      if(!total) return '';
      var h='<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Team mix'))+'</h2>'
      QUADRANTS.forEach(function(q){
        var n=engineers.filter(function(e){return _discPlacements[e.uid]===q.key;}).length;
        var pct=Math.round(n/total*100);
        h+='<div style="margin-bottom:5px">'
          +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">'
          +'<span style="color:'+safeColor(q.badge)+'">'+escH(q.key)+' — '+escH(q.label)+'</span>'
          +'<span style="color:var(--text);font-weight:700">'+n+' <span style="color:var(--muted);font-weight:400">('+pct+'%)</span></span></div>'
          +'<div style="background:var(--border);border-radius:2px;height:5px">'
          +'<div style="background:'+safeColor(q.badge)+';width:'+pct+'%;height:5px;border-radius:2px"></div></div></div>'
      });
      return h;
    }},
    {id:'unprofiled', label:t('Not yet profiled'), render:function(){
      var un=engineers.filter(function(e){return !e.planningOnly&&!_discPlacements[e.uid];});
      if(!un.length) return '';
      return '<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Not yet profiled'))+'</h2>'
        +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
        +un.map(function(e){
          return '<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:var(--surface);border:1px solid var(--border);color:var(--text)">'+escH(e.name)+'</span>';
        }).join('')+'</div>';
    }},
  ];
}
// opens the shared export picker for DISC
function discExportOpen(){
  if(!Object.keys(_discPlacements).length){
    alert(t('Profile at least one person first.')); return;
  }
  var teamName=(G('res-title-input')?G('res-title-input').value:'')||'';
  exportOpenBuilder({
    deliverableId:'disc',
    title:t('DISC behavioral profile'),
    subtitleDefault:teamName+(teamName?' · ':'')+t('{n} profiled',{n:Object.keys(_discPlacements).length}),
    blocks:discExportBlocks(),
    ctx:{},
    orientation:'landscape', pageSize:'A3',
    rasterWidth:1600,
    builtinTemplates:[
      {id:'full', name:t('Full'), blocks:['quadrants','mix','unprofiled']},
      {id:'quadrants', name:t('Quadrants only'), blocks:['quadrants']},
    ],
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'png', label:t('PNG (image)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}

// opens a print popup with the DISC layout
export function exportDiscPDF(){
  var html=buildDiscHTML();
  var win=window.open('','_blank');
  if(!win){alert('Pop-up blocked — please allow pop-ups.');return;}
  win.document.write(html);
  win.document.write('<scr'+'ipt>window.addEventListener("load",function(){setTimeout(window.print,600);});<\/script>');
  win.document.close();
}

// renders the DISC matrix to PNG via SVG foreignObject
export function exportDiscPNG(){
  var html=buildDiscHTML();
  var W=1400,H=900;
  var iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;left:-9999px;top:-9999px;width:'+W+'px;height:'+H+'px;border:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();iframe.contentDocument.write(html);iframe.contentDocument.close();
  setTimeout(function(){
    var sm=html.match(/<style>([\s\S]*?)<\/style>/i);var sc=sm?sm[1]:'';
    var bm=html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);var bc=bm?bm[1]:html;
    var svgStr='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'">'
      +'<foreignObject width="'+W+'" height="'+H+'">'
      +'<body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:20px;background:#0f0f11">'
      +'<style>'+sc+'</style>'+bc+'</body></foreignObject></svg>';
    var img=new Image();
    img.onload=function(){
      var scale=2;var canvas=document.createElement('canvas');
      canvas.width=W*scale;canvas.height=H*scale;
      var ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.drawImage(img,0,0);
      canvas.toBlob(function(blob){
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);
        var name=((G('res-title-input')?G('res-title-input').value:'team')||'team').replace(/[^a-z0-9]/gi,'_').toLowerCase();
        a.download=name+'_disc.png';a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
      },'image/png');
      document.body.removeChild(iframe);
    };
    img.onerror=function(){document.body.removeChild(iframe);exportDiscPDF();};
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  },400);
}

// drag start handler for engineer chips
export function discDragStart(event,engId){
  event.dataTransfer.setData('text/plain',String(engId));
  event.dataTransfer.effectAllowed='move';
}
// drop handler: assigns engineer to a DISC quadrant
export function discDrop(event,quadKey){
  event.preventDefault();
  var engId=parseInt(event.dataTransfer.getData('text/plain'));
  if(isNaN(engId))return;
  var uid=engKey(engId); if(!uid)return;   // placements are keyed by uid, not id
  _discPlacements[uid]=quadKey;
  saveState();talentIdbSave();renderDiscMatrix();
}
// removes an engineer from the DISC matrix. Accepts an id or a uid.
export function discRemove(engId){
  delete _discPlacements[engKey(engId)||engId];
  saveState();talentIdbSave();renderDiscMatrix();
}
