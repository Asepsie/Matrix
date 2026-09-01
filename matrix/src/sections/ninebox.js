/* ►► SECTION: NINEBOX ◄◄ Nine-Box talent matrix: cells, people, render, export, drag
 *
 * Functions defined in this file:
 *   _nbCells          — returns the nine-box cell definitions (labels, colors, recommendations)
 *   _nbOrderedCells   — orders the cells for rendering, swapping axes when requested
 *   _nbPeopleHTML     — builds the people-chip HTML for one cell
 *   renderNineBox     — renders the nine-box talent matrix grid with people chips
 *   buildNineBoxHTML  — builds the standalone HTML page used for PDF/PNG export
 *   exportNineBoxPDF  — opens a print popup with the nine-box layout
 *   exportNineBoxPNG  — renders the nine-box to a PNG via SVG foreignObject
 *   nbDragStart       — drag start handler for engineer chips
 *   nbDrop            — drop handler: assigns engineer to a cell
 *   nbRemove          — removes an engineer from the nine-box
 */

// returns the nine-box cell definitions (labels, colors, recommendations)
function _nbCells(){
  return [
    {key:'1-3',col:0,row:0,box:3,label:'ENIGMA',sub:'Low Performance · High Potential',
     color:'rgba(91,229,200,0.12)',colorSolid:'#193d38',badge:'#5be5c8',
     rec:'High investment. Coach intensively — this person has ceiling but is not delivering yet. Identify blockers: clarity, motivation, or fit?'},
    {key:'2-3',col:1,row:0,box:6,label:'FUTURE STAR',sub:'Moderate Performance · High Potential',
     color:'rgba(91,229,200,0.18)',colorSolid:'#1a4040',badge:'#5be5c8',
     rec:'Accelerate development. Assign stretch assignments and a senior mentor. Build a concrete 12-month growth plan.'},
    {key:'3-3',col:2,row:0,box:9,label:'CONSISTENT STAR',sub:'High Performance · High Potential',
     color:'rgba(91,229,200,0.28)',colorSolid:'#1e4e4a',badge:'#5be5c8',
     rec:'Retain at all costs. Expose to leadership challenges, cross-functional roles, and succession planning. Competitive compensation review.'},
    {key:'1-2',col:0,row:1,box:2,label:'UNDER PERFORMER',sub:'Low Performance · Moderate Potential',
     color:'rgba(241,67,53,0.08)',colorSolid:'#2a1a19',badge:'#f14335',
     rec:'Clarify expectations with a formal PIP if needed. Evaluate fit for the current role vs. a lateral move. Set a 90-day improvement checkpoint.'},
    {key:'2-2',col:1,row:1,box:5,label:'CORE PLAYER',sub:'Moderate Performance · Moderate Potential',
     color:'rgba(120,120,140,0.10)',colorSolid:'#232328',badge:'#888',
     rec:'Solid backbone of the team. Maintain engagement with clear goals and regular feedback. Targeted upskilling to shift toward Star.'},
    {key:'3-2',col:2,row:1,box:8,label:'HIGH PERFORMER',sub:'High Performance · Moderate Potential',
     color:'rgba(200,241,53,0.12)',colorSolid:'#282d16',badge:'#c8f135',
     rec:'Recognise and reward. Expand scope carefully. Explore whether potential ceiling is real or circumstantial (exposure, opportunity).'},
    {key:'1-1',col:0,row:2,box:1,label:'RISK',sub:'Low Performance · Low Potential',
     color:'rgba(241,67,53,0.15)',colorSolid:'#2e1614',badge:'#f14335',
     rec:'Honest conversation required. Consider reassignment, role change, or managed exit. Minimise team disruption and knowledge-loss risk.'},
    {key:'2-1',col:1,row:2,box:4,label:'EFFECTIVE CONTRIBUTOR',sub:'Moderate Performance · Low Potential',
     color:'rgba(120,120,140,0.07)',colorSolid:'#1e1e22',badge:'#888',
     rec:'Stable and reliable. Leverage expertise in current scope. Avoid forcing growth pressure; focus on engagement and recognition.'},
    {key:'3-1',col:2,row:2,box:7,label:'EXPERT',sub:'High Performance · Low Potential',
     color:'rgba(200,241,53,0.18)',colorSolid:'#2d3318',badge:'#c8f135',
     rec:'Valuable specialist. Create technical career tracks, not just management ladders. Risk of departure if growth is not redefined for them.'},
  ];
}

// orders the cells for rendering, swapping axes when requested
function _nbOrderedCells(CELLS,swap){
  if(!swap){
    return [
      CELLS.find(c=>c.col===0&&c.row===0),CELLS.find(c=>c.col===1&&c.row===0),CELLS.find(c=>c.col===2&&c.row===0),
      CELLS.find(c=>c.col===0&&c.row===1),CELLS.find(c=>c.col===1&&c.row===1),CELLS.find(c=>c.col===2&&c.row===1),
      CELLS.find(c=>c.col===0&&c.row===2),CELLS.find(c=>c.col===1&&c.row===2),CELLS.find(c=>c.col===2&&c.row===2),
    ];
  }
  function cbpp(perf,pot){var oc=perf-1,or2=3-pot;return CELLS.find(c=>c.col===oc&&c.row===or2);}
  return [cbpp(3,1),cbpp(3,2),cbpp(3,3),cbpp(2,1),cbpp(2,2),cbpp(2,3),cbpp(1,1),cbpp(1,2),cbpp(1,3)];
}

// builds the people-chip HTML for one cell
function _nbPeopleHTML(key,placements,engList,photoCache,forExport){
  var placed=engList.filter(function(e){return placements[e.uid]===key;});
  if(!placed.length){
    if(forExport)return '';
    return '<div style="min-height:28px;color:var(--muted);font-size:10px;font-family:IBM Plex Mono,monospace;opacity:.5">Drop here</div>';
  }
  var prevMap=(!forExport&&_nbCompareYear&&_nineBoxHistory[_nbCompareYear])?_nineBoxHistory[_nbCompareYear]:null;
  var chips=placed.map(function(e){
    var moveBadge='';
    if(prevMap){
      var mv=nbMove(key,prevMap[e.uid]);
      if(mv!=='same'&&mv!=='none'){
        var mc=({up:'#c8f135',down:'#f14335','new':'#5be5c8'})[mv]||'var(--muted)';
        var ms=({up:'▲',down:'▼','new':'✦'})[mv]||'';
        moveBadge='<span title="'+escH(mv+(prevMap[e.uid]?(' — was '+prevMap[e.uid]):'')+' vs '+_nbCompareYear)+'" style="color:'+mc+';font-size:9px;font-weight:700;margin-left:3px;flex-shrink:0">'+ms+'</span>';
      }
    }
    var photo=photoCache&&photoCache.get&&photoCache.get(e.uid);
    var ini=(e.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
    // `forExport` now forks on STRUCTURE only (no drag handles, no remove button,
    // no "Drop here" placeholder). It used to fork on COLOUR too — hardcoded dark
    // hexes — which predates the export engine's theming and made these chips print
    // as dark-on-white under the light paper theme. Tokens work for both.
    var avSz=forExport?26:28;
    var avBd='2px solid var(--accent)';
    var avBg='var(--surface)';
    var avCl='var(--accent)';
    var txCl='var(--text)';
    var muCl='var(--muted)';
    var av=photo
      ?('<img src="'+photo+'" style="width:'+avSz+'px;height:'+avSz+'px;border-radius:50%;object-fit:cover;border:'+avBd+';flex-shrink:0;">')
      :('<div style="width:'+avSz+'px;height:'+avSz+'px;border-radius:50%;background:'+avBg+';border:'+avBd+';display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:'+avCl+';flex-shrink:0;font-family:monospace">'+ini+'</div>');
    var nm='<div style="overflow:hidden"><div style="font-size:10px;font-weight:600;color:'+txCl+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">'+escH(e.name)+'</div><div style="font-size:8px;color:'+muCl+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">'+escH(e.role||'')+'</div></div>';
    if(forExport){
      return '<div style="display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:5px;background:var(--bg);margin:2px">'+av+nm+'</div>';
    }
    return '<div draggable="true" ondragstart="nbDragStart(event,'+e.id+')"'
      +' title="'+escH(e.name)+' — drag to move"'
      +' style="display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:5px;background:var(--bg);margin:2px;cursor:grab;position:relative;transition:background .12s"'
      +' onmouseenter="this.style.background=\'rgba(200,241,53,.1)\'" onmouseleave="this.style.background=\'var(--bg)\'">'
      +av+nm+moveBadge
      +'<button onclick="event.stopPropagation();nbRemove('+e.id+')"'
      +' style="position:absolute;right:1px;top:1px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:9px;line-height:1;padding:1px"'
      +' onmouseenter="this.style.color=\'var(--accent)\'" onmouseleave="this.style.color=\'var(--muted)\'">×</button>'
      +'</div>';
  }).join('');
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">'+chips+'</div>';
}

/* ── Talent placement: two lenses (Nine-box | DISC) in one view (Track B follow-up).
   The former separate Nine-box and DISC rail views are merged into a single "Talent
   placement" door. renderTalentPlacement() is the nav entry point; each lens renderer
   (renderNineBox / renderDiscMatrix) marks _tpLens itself and prepends tpLensBar(), so the
   toggle always reflects what's on screen. The lens is remember-last (persisted in the rail
   prefs via railSavePrefs, not the dataset). tpGo() is the deep-link opener for callers that
   want to land on a specific lens. ── */
function renderTalentPlacement(){ if(_tpLens==='disc') renderDiscMatrix(); else renderNineBox(); }
function tpSetLens(l){ _tpLens=(l==='disc')?'disc':'ninebox'; if(typeof railSavePrefs==='function') railSavePrefs(); renderTalentPlacement(); }
function tpGo(ev,lens){ _tpLens=(lens==='disc')?'disc':'ninebox'; if(typeof railSavePrefs==='function') railSavePrefs(); if(typeof railGo==='function') railGo(ev,'placement'); }
function tpLensBar(){
  var mk=function(id,label){ var on=_tpLens===id;
    return '<button onclick="tpSetLens(\''+id+'\')" style="background:'+(on?'rgba(200,241,53,.12)':'var(--bg)')
      +';border:1px solid '+(on?'var(--accent)':'var(--border)')+';color:'+(on?'var(--accent)':'var(--muted)')
      +';font-family:\'IBM Plex Mono\',monospace;font-size:10px;padding:3px 12px;border-radius:5px;cursor:pointer">'+escH(label)+'</button>'; };
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-shrink:0">'
    +'<span style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;color:var(--accent);letter-spacing:.06em">⊞ '+escH(t('TALENT PLACEMENT'))+'</span>'
    +'<div style="display:flex;gap:6px">'+mk('ninebox',t('Nine-box'))+mk('disc','DISC')+'</div></div>';
}

// renders the nine-box talent matrix grid with people chips
export function renderNineBox(){
  var body=G('res-body');if(!body)return;
  _tpLens='ninebox';
  if(!_nineBoxPlacements)_nineBoxPlacements={};
  var CELLS=_nbCells();
  var placed=new Set(Object.keys(_nineBoxPlacements));   // keys are uids
  var talentEngs=engineers.filter(function(e){return !e.vacant&&e.includeTalent!==false;});
  var unplaced=talentEngs.filter(function(e){return !placed.has(e.uid)||!CELLS.find(function(c){return c.key===_nineBoxPlacements[e.uid];});});
  var xAxisLabel=_nbSwapAxes?'POTENTIAL':'PERFORMANCE';
  var yAxisLabel=_nbSwapAxes?'PERFORMANCE':'POTENTIAL';
  var xTickLabels=['LOW','MEDIUM','HIGH'];
  var yTickLabels=['HIGH','MED','LOW'];
  var orderedCells=_nbOrderedCells(CELLS,_nbSwapAxes);

  // Movement summary vs the comparison year (trajectory)
  var moveSummary='';
  if(_nbCompareYear&&_nineBoxHistory[_nbCompareYear]){
    var prevY=_nineBoxHistory[_nbCompareYear];var up=0,dn=0,nw=0;
    talentEngs.forEach(function(e){var k=_nineBoxPlacements[e.uid];if(!k)return;var mv=nbMove(k,prevY[e.uid]);if(mv==='up')up++;else if(mv==='down')dn++;else if(mv==='new')nw++;});
    moveSummary=' · <span style="font-family:IBM Plex Mono,monospace;font-size:9px">since '+escH(_nbCompareYear)+': <span style="color:#c8f135">▲'+up+'</span> <span style="color:#f14335">▼'+dn+'</span> <span style="color:#5be5c8">✦'+nw+'</span></span>';
  }
  var yearsList=nbYears();

  var h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';
  h+=tpLensBar();
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'
    +'<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">NINE-BOX TALENT MATRIX</h3>'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+Object.keys(_nineBoxPlacements).length+' placed · '+unplaced.length+' unplaced'+moveSummary+'</span>'
    +'<div style="flex:1"></div>'
    +'<div style="display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:3px 8px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em">YEAR</span>'
    +'<select onchange="nbSetYear(this.value)" title="Active snapshot year (placements you edit)" style="background:var(--bg);border:1px solid var(--border);color:var(--accent);font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:700;padding:2px 4px;border-radius:4px">'
    +yearsList.map(function(y){return '<option value="'+escH(y)+'"'+(y===_nbYear?' selected':'')+'>'+escH(y)+'</option>';}).join('')
    +'</select>'
    +'<button class="add-row-btn" onclick="nbAddYear()" title="Add a new year (seeded from the current one)" style="font-size:11px;padding:1px 6px;line-height:1">＋</button>'
    +'<span style="width:1px;background:var(--border);height:14px;margin:0 2px"></span>'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">vs</span>'
    +'<select onchange="nbSetCompareYear(this.value)" title="Compare to a prior year — shows ▲/▼ movement on each chip" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:10px;padding:2px 4px;border-radius:4px">'
    +'<option value="">—</option>'
    +yearsList.filter(function(y){return y!==_nbYear;}).map(function(y){return '<option value="'+escH(y)+'"'+(y===_nbCompareYear?' selected':'')+'>'+escH(y)+'</option>';}).join('')
    +'</select>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:3px 8px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em">AXES</span>'
    +'<button class="add-row-btn" onclick="_nbSwapAxes=false;saveState();renderNineBox()" title="X=Performance Y=Potential"'
    +' style="font-size:9px;padding:2px 7px;'+(!_nbSwapAxes?'border-color:var(--accent);color:var(--accent);background:rgba(200,241,53,.12);font-weight:700':'')+'">Perf/Pot</button>'
    +'<button class="add-row-btn" onclick="_nbSwapAxes=true;saveState();renderNineBox()" title="X=Potential Y=Performance"'
    +' style="font-size:9px;padding:2px 7px;'+(_nbSwapAxes?'border-color:var(--accent);color:var(--accent);background:rgba(200,241,53,.12);font-weight:700':'')+'">Pot/Perf</button>'
    +'</div>'
    +'<div style="width:1px;background:var(--border);height:16px"></div>'
    +'<button class="add-row-btn" onclick="nineBoxExportOpen()" style="border-color:#5be5c8;color:#5be5c8;font-size:9px;padding:2px 8px" title="'+escH(t('Export the nine-box'))+'">&#128196; '+escH(t('EXPORT'))+'</button>'
    +'<div style="width:1px;background:var(--border);height:16px"></div>'
    +'<button class="add-row-btn" onclick="nbClearYear()" title="Clear placements for the active year only" style="color:var(--muted);font-size:9px">&#8635; CLEAR '+escH(_nbYear)+'</button>'
    +'<button class="primary" style="font-size:10px;padding:3px 10px" onclick="saveState();flashSaved()">SAVE</button>'
    +'</div>';

  if(unplaced.length){
    h+='<div style="margin-bottom:10px">'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:5px;letter-spacing:.06em">UNPLACED &#8212; drag onto the grid</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:5px;padding:7px;background:var(--surface);border:1px solid var(--border);border-radius:8px">'
      +unplaced.map(function(e){
        var photo=_photoCache&&_photoCache.get(e.uid);
        var ini=(e.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
        var av=photo
          ?('<img src="'+photo+'" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1px solid var(--border)">')
          :('<div style="width:24px;height:24px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:var(--muted);font-family:IBM Plex Mono,monospace">'+ini+'</div>');
        return '<div draggable="true" ondragstart="nbDragStart(event,'+e.id+')"'
          +' style="display:flex;align-items:center;gap:4px;cursor:grab;padding:3px 6px;border-radius:5px;background:var(--bg);border:1px solid var(--border);transition:border-color .12s"'
          +' onmouseenter="this.style.borderColor=\'var(--accent)\'" onmouseleave="this.style.borderColor=\'var(--border)\'"'
          +' title="'+escH(e.name)+'">'+av+'<span style="font-size:10px;font-weight:600;color:var(--text)">'+escH(e.name)+'</span></div>';
      }).join('')
      +'</div></div>';
  }

  h+='<div style="display:flex;flex:1;min-height:0;gap:0">'
    +'<div style="display:flex;align-items:center;justify-content:center;width:20px;flex-shrink:0">'
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.1em;transform:rotate(-90deg);white-space:nowrap">'+yAxisLabel+' &#8594;</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;flex:1;min-width:0">'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);flex:1;gap:3px;padding-bottom:18px">';

  orderedCells.forEach(function(cell){
    var people=_nbPeopleHTML(cell.key,_nineBoxPlacements,talentEngs,_photoCache,false);
    h+='<div'
      +' style="background:'+cell.color+';border:1px solid var(--border);border-radius:7px;padding:7px;display:flex;flex-direction:column;gap:3px;min-height:110px;transition:border-color .15s"'
      +' ondragover="event.preventDefault();this.style.borderColor=\'var(--accent)\'"'
      +' ondragleave="this.style.borderColor=\'var(--border)\'"'
      +' ondrop="nbDrop(event,\''+cell.key+'\');this.style.borderColor=\'var(--border)\'">'
      +'<div style="display:flex;align-items:center;gap:4px">'
      +'<div style="width:6px;height:6px;border-radius:50%;background:'+cell.badge+';flex-shrink:0"></div>'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:8px;font-weight:700;color:'+cell.badge+';letter-spacing:.07em;line-height:1.1">'+cell.label+'</div>'
      +'</div>'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:7px;color:var(--muted);line-height:1.2">'+cell.sub+'</div>'
      +'<div style="flex:1;overflow-y:auto">'+people+'</div>'
      +'<div style="padding:4px 5px;background:var(--bg);border-radius:4px;border-left:2px solid '+cell.badge+'">'
      +'<div style="font-size:8px;color:var(--muted);line-height:1.4;font-family:IBM Plex Mono,monospace">'+cell.rec+'</div>'
      +'</div></div>';
  });

  h+='</div>'
    +'<div style="text-align:center;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.1em;margin-top:-12px">'+xAxisLabel+' &#8594;</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;justify-content:space-around;width:48px;flex-shrink:0;padding-bottom:18px;padding-left:4px">'
    +yTickLabels.map(function(l){return '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+l+'</div>';}).join('')
    +'</div></div>'
    +'<div style="display:grid;grid-template-columns:20px 1fr 48px">'
    +'<div></div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);text-align:center">'
    +xTickLabels.map(function(l){return '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'+l+'</div>';}).join('')
    +'</div><div></div></div></div>';

  body.innerHTML=h;
}

// builds the standalone HTML page used for PDF/PNG export
function buildNineBoxHTML(){
  var CELLS=_nbCells();
  var orderedCells=_nbOrderedCells(CELLS,_nbSwapAxes);
  var xAxisLabel=_nbSwapAxes?'POTENTIAL':'PERFORMANCE';
  var yAxisLabel=_nbSwapAxes?'PERFORMANCE':'POTENTIAL';
  var xTicks=['LOW','MEDIUM','HIGH'];
  var yTicks=['HIGH','MED','LOW'];
  var dateStr=new Date().toLocaleDateString();
  var teamName=(G('res-title-input')?G('res-title-input').value:'Team')||'Team';
  var cellsHTML=orderedCells.map(function(cell){
    var people=_nbPeopleHTML(cell.key,_nineBoxPlacements,engineers,_photoCache,true);
    return '<div style="background:'+cell.colorSolid+';border:1px solid #2a2a32;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:5px;min-height:130px">'
      +'<div style="display:flex;align-items:center;gap:5px">'
      +'<div style="width:7px;height:7px;border-radius:50%;background:'+cell.badge+';flex-shrink:0"></div>'
      +'<span style="font-family:monospace;font-size:9px;font-weight:700;color:'+cell.badge+';letter-spacing:.06em">'+cell.label+'</span>'
      +'</div>'
      +'<div style="font-family:monospace;font-size:8px;color:#777;margin-bottom:2px">'+cell.sub+'</div>'
      +'<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0">'+(people||'<span style="font-size:9px;color:#555">—</span>')+'</div>'
      +'<div style="padding:5px;background:#0a0a0c;border-radius:4px;border-left:2px solid '+cell.badge+'">'
      +'<div style="font-size:8px;color:#666;line-height:1.4;font-family:monospace">'+cell.rec+'</div>'
      +'</div></div>';
  }).join('');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;}'
    +'html,body{background:#0f0f11;color:#e8e8ec;font-family:Arial,sans-serif;padding:20px;'
    +'-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    +'.hdr{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;'
    +'background:#1a1a1e;border:1px solid #2a2a32;border-radius:8px;margin-bottom:16px;}'
    +'.wrap{display:flex;gap:0;height:calc(100vh - 120px);min-height:600px;}'
    +'.ylabel{display:flex;align-items:center;justify-content:center;width:20px;flex-shrink:0;}'
    +'.ylabel span{font-family:monospace;font-size:9px;color:#666;letter-spacing:.1em;transform:rotate(-90deg);white-space:nowrap;display:block;}'
    +'.cells-col{display:flex;flex-direction:column;flex:1;}'
    +'.cells-inner{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);flex:1;gap:4px;padding-bottom:18px;}'
    +'.xlabel{text-align:center;font-family:monospace;font-size:9px;color:#666;letter-spacing:.1em;margin-top:-12px;}'
    +'.yticks{display:flex;flex-direction:column;justify-content:space-around;width:44px;flex-shrink:0;padding-bottom:18px;padding-left:4px;}'
    +'.yticks span{font-family:monospace;font-size:8px;color:#666;}'
    +'.xticks{display:grid;grid-template-columns:20px 1fr 44px;}'
    +'.xticks-inner{display:grid;grid-template-columns:repeat(3,1fr);text-align:center;}'
    +'.xticks-inner span{font-family:monospace;font-size:8px;color:#666;}'
    +'@media print{@page{size:A3 landscape;margin:8mm;}html,body{padding:8px;}}'
    +'</style></head><body>'
    +'<div class="hdr"><div>'
    +'<div style="font-size:15px;font-weight:700;color:#c8f135;font-family:monospace;letter-spacing:.04em">NINE-BOX TALENT MATRIX</div>'
    +'<div style="font-size:10px;color:#666;margin-top:2px">'+escH(teamName)+' · '+Object.keys(_nineBoxPlacements).length+' placed · '+xAxisLabel+' vs '+yAxisLabel+'</div>'
    +'</div><div style="text-align:right;font-family:monospace">'
    +'<div style="font-size:10px;color:#c8f135">Project Matrix</div>'
    +'<div style="font-size:9px;color:#666">'+dateStr+'</div>'
    +'</div></div>'
    +'<div class="wrap">'
    +'<div class="ylabel"><span>'+yAxisLabel+' →</span></div>'
    +'<div class="cells-col"><div class="cells-inner">'+cellsHTML+'</div>'
    +'<div class="xlabel">'+xAxisLabel+' →</div></div>'
    +'<div class="yticks">'+yTicks.map(function(l){return '<span>'+l+'</span>';}).join('')+'</div>'
    +'</div>'
    +'<div class="xticks"><div></div>'
    +'<div class="xticks-inner">'+xTicks.map(function(l){return '<span>'+l+'</span>';}).join('')+'</div>'
    +'<div></div></div>'
    +'</body></html>';
}

/* ►► SECTION: NINEBOX-EXPORT ◄◄ The nine-box on the shared export engine.
 *
 * `buildNineBoxHTML` above stays as-is only because the legacy PNG path still
 * reads it; everything user-facing now goes through these blocks, which render
 * in var(--…) tokens instead of that builder's hardcoded #666/#0a0a0c greys.
 * That is what lets the SAME markup print on the light paper theme or the app
 * theme, chosen per export (ARCHITECTURE › Export engine, "theming trick").
 * The nine-box is plain HTML, not native SVG, so unlike org/gantt it uses the
 * engine's own PNG rasteriser — no custom `run` handler needed.
 */
function nbExportBlocks(){
  var axes=function(){
    return {x:_nbSwapAxes?t('POTENTIAL'):t('PERFORMANCE'), y:_nbSwapAxes?t('PERFORMANCE'):t('POTENTIAL')};
  };
  return [
    {id:'grid', label:t('Nine-box grid'), render:function(){
      var CELLS=_nbCells();
      var ordered=_nbOrderedCells(CELLS,_nbSwapAxes);
      var A=axes();
      var mono='font-family:IBM Plex Mono,monospace';
      var cells=ordered.map(function(cell){
        var people=_nbPeopleHTML(cell.key,_nineBoxPlacements,engineers,_photoCache,true);
        // `color` (a translucent rgba tint) not `colorSolid` (an opaque DARK hex):
        // the tint composites over whatever page background the chosen theme sets,
        // so the same markup reads correctly on the app theme AND on light paper.
        // colorSolid only ever worked on the dark theme — on paper it printed as a
        // block of near-black, which is both wrong and a toner sink.
        return '<div style="background:'+safeColor(cell.color)+';border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:5px;min-height:130px">'
          +'<div style="display:flex;align-items:center;gap:5px">'
          +'<div style="width:7px;height:7px;border-radius:50%;background:'+safeColor(cell.badge)+';flex-shrink:0"></div>'
          +'<span style="'+mono+';font-size:9px;font-weight:700;color:'+safeColor(cell.badge)+';letter-spacing:.06em">'+escH(cell.label)+'</span></div>'
          +'<div style="'+mono+';font-size:8px;color:var(--muted);margin-bottom:2px">'+escH(cell.sub)+'</div>'
          +'<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0">'+(people||'<span style="font-size:9px;color:var(--dim)">—</span>')+'</div>'
          +'<div style="padding:5px;background:var(--bg);border-radius:4px;border-left:2px solid '+safeColor(cell.badge)+'">'
          +'<div style="font-size:8px;color:var(--muted);line-height:1.4;'+mono+'">'+escH(cell.rec)+'</div>'
          +'</div></div>';
      }).join('');
      var tick=function(l){ return '<div style="'+mono+';font-size:8px;color:var(--muted)">'+escH(l)+'</div>'; };
      return '<div style="display:flex;gap:0;min-height:620px">'
        +'<div style="display:flex;align-items:center;justify-content:center;width:22px;flex-shrink:0">'
        +'<div style="'+mono+';font-size:9px;color:var(--muted);letter-spacing:.1em;transform:rotate(-90deg);white-space:nowrap">'+escH(A.y)+' &#8594;</div></div>'
        +'<div style="display:flex;flex-direction:column;flex:1;min-width:0">'
        +'<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);flex:1;gap:4px;padding-bottom:16px">'+cells+'</div>'
        +'<div style="text-align:center;'+mono+';font-size:9px;color:var(--muted);letter-spacing:.1em">'+escH(A.x)+' &#8594;</div></div>'
        +'<div style="display:flex;flex-direction:column;justify-content:space-around;width:48px;flex-shrink:0;padding:0 0 16px 6px">'
        +[t('HIGH'),t('MED'),t('LOW')].map(tick).join('')
        +'</div></div>';
    }},
    {id:'distribution', label:t('Distribution'), render:function(){
      var ordered=_nbOrderedCells(_nbCells(),_nbSwapAxes);
      var total=engineers.filter(function(e){return _nineBoxPlacements[e.uid];}).length;
      if(!total) return '';
      var h='<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Distribution'))+'</h2>'
      ordered.forEach(function(cell){
        var n=engineers.filter(function(e){return _nineBoxPlacements[e.uid]===cell.key;}).length;
        var pct=Math.round(n/total*100);
        h+='<div style="margin-bottom:5px">'
          +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">'
          +'<span style="color:'+safeColor(cell.badge)+'">'+escH(cell.label)+'</span>'
          +'<span style="color:var(--text);font-weight:700">'+n+' <span style="color:var(--muted);font-weight:400">('+pct+'%)</span></span></div>'
          +'<div style="background:var(--border);border-radius:2px;height:5px">'
          +'<div style="background:'+safeColor(cell.badge)+';width:'+pct+'%;height:5px;border-radius:2px"></div></div></div>'
      });
      return h;
    }},
    {id:'unplaced', label:t('Unplaced people'), render:function(){
      var un=engineers.filter(function(e){return !e.planningOnly&&!_nineBoxPlacements[e.uid];});
      if(!un.length) return '';
      return '<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Not yet placed'))+'</h2>'
        +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
        +un.map(function(e){
          return '<span style="font-size:11px;padding:3px 8px;border-radius:4px;background:var(--surface);border:1px solid var(--border);color:var(--text)">'+escH(e.name)+'</span>';
        }).join('')+'</div>';
    }},
  ];
}
// opens the shared export picker for the nine-box
function nineBoxExportOpen(){
  if(!Object.keys(_nineBoxPlacements).length){
    alert(t('Place at least one person on the grid first.')); return;
  }
  var teamName=(G('res-title-input')?G('res-title-input').value:'')||'';
  exportOpenBuilder({
    deliverableId:'ninebox',
    title:t('Nine-box talent matrix'),
    subtitleDefault:teamName+(teamName?' · ':'')+t('{n} placed',{n:Object.keys(_nineBoxPlacements).length}),
    blocks:nbExportBlocks(),
    ctx:{},
    orientation:'landscape', pageSize:'A3',
    rasterWidth:1600,
    builtinTemplates:[
      {id:'full', name:t('Full'), blocks:['grid','distribution','unplaced']},
      {id:'grid', name:t('Grid only'), blocks:['grid']},
    ],
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'png', label:t('PNG (image)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}

// renders the nine-box to a PNG via SVG foreignObject
export function exportNineBoxPNG(){
  var html=buildNineBoxHTML();
  var W=1600,H=1000;
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
        a.download=name+'_ninebox.png';a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
      },'image/png');
      document.body.removeChild(iframe);
    };
    img.onerror=function(){document.body.removeChild(iframe);exportNineBoxPDF();};
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  },400);
}

// drag start handler for engineer chips
export function nbDragStart(event,engId){
  event.dataTransfer.setData('text/plain',String(engId));
  event.dataTransfer.effectAllowed='move';
}
// drop handler: assigns engineer to a cell
export function nbDrop(event,cellKey){
  event.preventDefault();
  var engId=parseInt(event.dataTransfer.getData('text/plain'));
  if(isNaN(engId))return;
  var uid=engKey(engId); if(!uid)return;   // placements are keyed by uid, not id
  _nineBoxPlacements[uid]=cellKey;
  saveState();talentIdbSave();renderNineBox();
}
// removes an engineer from the nine-box (active year). Accepts an id or a uid.
export function nbRemove(engId){
  delete _nineBoxPlacements[engKey(engId)||engId];
  saveState();talentIdbSave();renderNineBox();
}

/* ── Year / history controls ── */
// Switch the active snapshot year (re-points the live view, persists the choice).
export function nbSetYear(y){
  if(!_nineBoxHistory[y])_nineBoxHistory[y]={};
  _nbYear=y; _nineBoxPlacements=_nineBoxHistory[_nbYear];
  if(_nbCompareYear===_nbYear)_nbCompareYear='';
  saveState();talentIdbSave();renderNineBox();
}
// Set (or clear, if same as active) the comparison year for movement indicators.
export function nbSetCompareYear(y){
  _nbCompareYear=(!y||y===_nbYear)?'':y;
  saveState();renderNineBox();
}
// Add a new year, seeded from the current one so you can adjust the deltas.
export function nbAddYear(){
  var label=prompt('New nine-box year / label (e.g. 2024):','');
  if(label==null)return; label=String(label).trim(); if(!label)return;
  if(_nineBoxHistory[label]){ alert('"'+label+'" already exists — switching to it.'); nbSetYear(label); return; }
  var seed={}, cur=_nineBoxHistory[_nbYear]||{};
  Object.keys(cur).forEach(function(k){ seed[k]=cur[k]; });   // duplicate current year as a starting point
  _nineBoxHistory[label]=seed; _nbYear=label; _nineBoxPlacements=_nineBoxHistory[_nbYear];
  saveState();talentIdbSave();renderNineBox();
}
// Clear placements for the active year only (keeps other years).
export function nbClearYear(){
  if(!confirm('Clear all nine-box placements for '+_nbYear+'? (Other years are kept.)'))return;
  _nineBoxHistory[_nbYear]={}; _nineBoxPlacements=_nineBoxHistory[_nbYear];
  saveState();talentIdbSave();renderNineBox();
}
