/* ►► SECTION: ORG-CHART ◄◄ Org chart: build, layout, render, drag/pan/zoom, KPI, export
 *
 * Functions defined in this file:
 *   getLevelLabel          — returns the display name for an org hierarchy level
 *   openOrgChart           — opens the org chart overlay and binds events
 *   closeOrgChart          — hides the org chart overlay and clears drag state
 *   buildOrgTree           — builds the reports-to tree (roots/children/byId) from engineers
 *   orgLayout              — computes x/y node positions for the tree
 *   orgDepth               — computes the depth of each node in the tree
 *   renderOrgChart         — renders the full org chart SVG
 *   orgBindGlobalEvents    — wires up mouse/wheel/context/key handlers for the chart
 *   orgSetTool             — selects the active draw tool (select/text/rect/ellipse/arrow)
 *   orgToggleAnnotBg       — toggles annotations between background and foreground
 *   orgToggleArrows        — toggles reporting-line arrows on/off
 *   orgDeleteSelectedAnnot — deletes the currently selected annotation
 *   orgOpenAnnotEdit       — opens the annotation editor popover
 *   orgSaveAnnotEdit       — saves edits made in the annotation editor
 *   orgAutoSave            — debounced save of org chart state
 *   orgClearSelection      — clears the multi-node selection
 *   orgToggleSnap          — toggles snap-to-grid for node dragging
 *   orgSnapXY              — snaps a coordinate pair to the grid when enabled
 *   orgUpdateSelHint       — updates the selection hint text
 *   orgDrawGrid            — draws the snap grid overlay
 *   orgClearGrid           — clears the snap grid overlay
 *   orgAnnotSVG            — builds the SVG markup for one annotation
 *   orgApplyTransform      — applies the current pan/zoom transform to the root group
 *   orgZoom                — zooms the chart by a factor
 *   orgResetView           — resets pan/zoom and re-renders
 *   orgToggleCollapse      — collapses/expands a node's subtree
 *   orgAddDirectReport     — prompts for and adds a new direct report under a manager
 *   orgAddRoot             — prompts for and adds a new root-level person
 *   orgArrowDelete         — removes the reporting link for the context arrow
 *   orgArrowMakeRoot       — detaches the context arrow's child into a root
 *   orgCtxClose            — closes the node context menu
 *   orgCtxEdit             — opens the ID card modal for the context node
 *   orgCtxAddReport        — adds a direct report to the context node
 *   orgCtxMakeRoot         — detaches the context node into a root
 *   orgAddVacancyRoot      — adds a new vacant (open position) root node
 *   orgCtxAddVacancy       — adds a vacant position under the context node
 *   orgCtxDelete           — deletes the context node and re-parents its reports
 *   orgHideHover           — hides the hover detail card
 *   orgHover               — builds and shows the hover detail card for a person
 *   orgBuildExportSVG      — builds a standalone high-quality SVG of the chart
 *   orgToggleKPI           — toggles the headcount KPI side panel
 *   orgRenderKPI           — renders the headcount KPI panel
 *   orgExportSVG           — downloads the chart as an SVG file
 *   orgExportPNG           — renders and downloads the chart as a high-res PNG
 *
 * Note: escH(), engInitials(), engGroupColor(), idbGetPhoto(), openIdCardModal(),
 *       saveState(), saveNow() and org state globals are defined elsewhere.
 */

/* ── Local constants & state (vars already in globals.js are omitted) ──
   ORG_NW, ORG_NH, ORG_HGAP, ORG_VGAP and ORG_GRID are declared in globals.js — do not redeclare */
let _orgCtxId=null;
let _orgEventsbound=false;
let _orgSelected=new Set();
let _orgSnapGrid=false;
let _orgRubberBand=null;
let _orgArrowCtx=null;
let _orgNextAnnotId=1;
let _orgDrawTool='select';
let _orgAnnotsBg=false;
let _orgShowArrows=true;
var _LEVEL_DEFAULTS=['Executive','Director','Manager','Senior','Individual'];
// returns the display name for an org hierarchy level
function getLevelLabel(d){return _orgLevelNames[d]||_LEVEL_DEFAULTS[d]||('Level '+d);}
let _orgDrawing=null;
let _orgEditAnnotId=null;
let _orgAutoSaveTimer=null;

// opens the org chart overlay and binds events
function openOrgChart(){
  setActivePill('ORG CHART');
  var ov=G('org-overlay'); ov.style.display='flex';
  var sel=G('org-filter-grp');
  sel.innerHTML='<option value="">All Groups</option>';
  engGroups.forEach(function(g){
    var o=document.createElement('option');
    o.value=g.id; o.textContent=g.name; sel.appendChild(o);
  });
  if(!_orgEventsbound){
    _orgScale=1; _orgPanX=0; _orgPanY=0;
    orgBindGlobalEvents();
    _orgEventsbound=true;
  }
  idbPreloadAll().then(renderOrgChart).catch(renderOrgChart);
}
// hides the org chart overlay and clears drag state
function closeOrgChart(){
  clearActivePill();
  G('org-overlay').style.display='none';
  orgHideHover();
  _orgDragNode=null; _orgPanDrag=null;
}

// builds the reports-to tree (roots/children/byId) from engineers
function buildOrgTree(){
  var grpFilter=G('org-filter-grp')?G('org-filter-grp').value:'';
  // planning resources never appear in the org chart (planning-only, not real headcount)
  var engs=engineers.filter(function(e){ return !e.planningOnly; });
  if(grpFilter) engs=engs.filter(function(e){ return String(e.groupId)===grpFilter; });

  var byId={};
  engs.forEach(function(e){ byId[e.id]=e; byId[String(e.id)]=e; });

  var byName={};
  engs.forEach(function(e){ byName[(e.name||'').toLowerCase().trim()]=e; });

  var children={};
  engs.forEach(function(e){
    var c=e.idcard||{};
    var raw=c.reportsTo;
    var parent=null;
    if(raw!==null&&raw!==undefined&&raw!==''){
      parent=byId[raw]||byId[+raw]||null;
      if(parent&&parent.id===e.id) parent=null;
    }
    if(!parent&&c.manager&&c.manager.trim()){
      var m=byName[c.manager.toLowerCase().trim()];
      if(m&&m.id!==e.id) parent=m;
    }
    if(parent){
      var pid=parent.id;
      if(!children[pid]) children[pid]=[];
      if(!children[pid].find(function(x){ return x.id===e.id; }))
        children[pid].push(e);
      e.idcard.reportsTo=String(pid);
    }
  });

  var roots=engs.filter(function(e){
    var raw=e.idcard&&e.idcard.reportsTo;
    if(!raw||raw==='') return true;
    var p=byId[raw]||byId[+raw];
    return !p||p.id===e.id;
  });

  return {roots:roots, children:children, byId:byId, engs:engs};
}

// computes x/y node positions for the tree
function orgLayout(roots,children){
  var pos={};
  var counter={v:0};

  function levelY(depth){
    var y=0;
    for(var d=0;d<depth;d++){
      var lh=_orgLevelH[d]!==undefined?_orgLevelH[d]:(ORG_NH+ORG_VGAP);
      y+=lh;
    }
    return y;
  }
  function walk(node,depth){
    var kids=(children[node.id]||[]);
    if(!kids.length||_orgCollapsed[node.id]){
      var x=counter.v*(ORG_NW+ORG_HGAP);
      var p={x:x,y:levelY(depth),depth:depth};
      pos[node.id]=p; pos[String(node.id)]=p;
      counter.v++;
      return;
    }
    var s=counter.v;
    kids.forEach(function(k){ walk(k,depth+1); });
    var e2=counter.v-1;
    var cx=(s+e2)/2*(ORG_NW+ORG_HGAP);
    var p={x:cx,y:levelY(depth),depth:depth};
    pos[node.id]=p; pos[String(node.id)]=p;
  }
  roots.forEach(function(r){ walk(r,0); });

  Object.keys(_orgPositions).forEach(function(id){
    var xy=_orgPositions[id];
    if(!xy) return;
    if(pos[id])   pos[id]  =Object.assign({},pos[id],  {x:xy.x,y:xy.y});
    if(pos[+id])  pos[+id] =Object.assign({},pos[+id], {x:xy.x,y:xy.y});
  });
  return pos;
}

// computes the depth of each node in the tree
function orgDepth(roots,children){
  var d={};
  function walk(n,depth){
    d[n.id]=depth; d[String(n.id)]=depth;
    (children[n.id]||[]).forEach(function(k){ walk(k,depth+1); });
  }
  roots.forEach(function(r){ walk(r,0); });
  return d;
}

// renders the full org chart SVG
function renderOrgChart(){
  var svg=G('org-svg'); if(!svg) return;
  orgHideHover();
  G('org-ctx-menu').style.display='none';

  var T=buildOrgTree();
  var roots=T.roots, children=T.children, engs=T.engs;

  if(!engs.length){
    svg.innerHTML='<text x="50%" y="50%" text-anchor="middle" fill="#6b6b78"'
      +' font-family="IBM Plex Mono,monospace" font-size="13">'
      +'Add engineers via 👷 RESOURCES, then set Reports-To in their profile.</text>';
    return;
  }

  var pos=orgLayout(roots,children);
  var depth=orgDepth(roots,children);

  var vals=engs.map(function(e){ return pos[e.id]; }).filter(Boolean);
  if(!vals.length) return;
  var minX=Math.min.apply(null,vals.map(function(p){ return p.x; }));
  var maxX=Math.max.apply(null,vals.map(function(p){ return p.x+ORG_NW; }));
  var maxY=Math.max.apply(null,vals.map(function(p){ return p.y+ORG_NH; }));
  var maxD=Math.max.apply(null,vals.map(function(p){ return p.depth||0; }));
  var OX=60-minX, OY=60;
  var tW=maxX-minX+120, tH=maxY+120;

  var vw=svg.clientWidth||900, vh=svg.clientHeight||600;
  if(_orgScale===1&&_orgPanX===0&&_orgPanY===0){
    _orgScale=Math.min(1.2, Math.min((vw-40)/tW,(vh-40)/tH)*0.88);
    _orgPanX=(vw-tW*_orgScale)/2;
    _orgPanY=24;
  }

  var C={bg:'#0f0f11',surface:'#18181c',text:'#e8e8ea',muted:'#6b6b78',border:'#2a2a32'};

  var photoDefs='';
  engs.forEach(function(e){
    var ph=(e.idcard||{}).photo||'';
    if(ph.length>10)
      photoDefs+='<clipPath id="orgcp'+e.id+'"><circle cx="16" cy="16" r="16"/></clipPath>';
  });

  var s='<defs>'
    +'<filter id="orgsh" x="-10%" y="-10%" width="120%" height="140%">'
    +'<feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.4"/></filter>'
    +'<marker id="orgarr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">'
    +'<path d="M0,1 L6,3.5 L0,6 Z" fill="#4a4a5a"/></marker>'
    +photoDefs+'</defs>';

  s+='<g id="org-root" transform="translate('+_orgPanX+','+_orgPanY+') scale('+_orgScale+')">';
  s+='<g id="org-canvas" transform="translate('+OX+','+OY+')">';

  for(var d=0;d<=maxD;d++){
    var ly=d*(ORG_NH+ORG_VGAP)-ORG_VGAP/2;
    var lh=ORG_NH+ORG_VGAP;
    var alpha=d%2?'0.025':'0.012';
    s+='<rect x="'+(minX-55)+'" y="'+ly+'" width="'+(tW+40)+'" height="'+lh
      +'" fill="rgba(255,255,255,'+alpha+')" rx="0"/>';
    var lbl=getLevelLabel(d).toUpperCase();
    s+='<text x="'+(minX-50)+'" y="'+(ly+16)+'" font-size="8" fill="#383848"'
      +' font-family="IBM Plex Mono,monospace" font-weight="bold">'+escH(lbl)+'</text>';
    s+='<text x="'+(minX-50)+'" y="'+(ly+27)+'" font-size="8" fill="#2a2a3a"'
      +' font-family="IBM Plex Mono,monospace">L'+d+'</text>';
  }

  if(_orgShowArrows) engs.forEach(function(e){
    var raw=e.idcard&&e.idcard.reportsTo;
    if(!raw||raw==='') return;
    var pe=pos[e.id], pp=pos[raw]||pos[+raw];
    if(!pe||!pp) return;
    if(_orgCollapsed[+raw]||_orgCollapsed[raw]) return;
    var pid=+(raw);
    var x1=pp.x+ORG_NW/2, y1=pp.y+ORG_NH;
    var x2=pe.x+ORG_NW/2, y2=pe.y;
    var my=(y1+y2)/2;
    var pathD='M'+x1+','+y1+' C'+x1+','+my+' '+x2+','+my+' '+x2+','+y2;
    s+='<path d="'+pathD+'"'
      +' fill="none" stroke="#3a3a50" stroke-width="1.8" marker-end="url(#orgarr)"/>';
    s+='<path d="'+pathD+'"'
      +' fill="none" stroke="transparent" stroke-width="12"'
      +' data-arrowfrom="'+pid+'" data-arrowto="'+e.id+'"'
      +' style="cursor:pointer"/>';
  });

  // Detailed mode: nine-box cell lookup (label/colors) keyed by placement key
  var _nbByKey=null;
  if(_orgDetailMode&&typeof _nbCells==='function'){
    _nbByKey={};
    _nbCells().forEach(function(cc){_nbByKey[cc.key]=cc;});
  }

  engs.forEach(function(e){
    var p=pos[e.id]; if(!p) return;
    var c=e.idcard||{};
    var col=engGroupColor(e);
    var initials=engInitials(e.name);
    var hasPhoto=(idbGetPhoto(e.id)||c.photo||'').length>10;
    var _ps1=idbGetPhoto(e.id)||c.photo||'';
    var grp=engGroups.find(function(g){ return g.id===e.groupId; });
    var kidsN=(children[e.id]||[]).length;
    var collapsed=_orgCollapsed[e.id];
    var depthN=p.depth||0;
    var skillN=(e.skills||[]).length;
    var nameS=e.name.length>19?e.name.slice(0,18)+'…':e.name;
    var roleS=(e.role||'').length>22?(e.role||'').slice(0,21)+'…':(e.role||'');
    var ax=ORG_NW/2, ay=28;

    s+='<g id="orgn-'+e.id+'" class="org-node" data-id="'+e.id+'"'
      +' transform="translate('+p.x+','+p.y+')" style="cursor:pointer">';

    var isVacant=e.vacant===true;
    var vacCol='#f1a435';

    if(isVacant){
      s+='<rect x="0" y="0" width="'+ORG_NW+'" height="'+ORG_NH
        +'" rx="8" fill="rgba(241,164,53,0.06)" stroke="'+vacCol+'" stroke-width="1.5"'
        +' stroke-dasharray="6,4" filter="url(#orgsh)"/>';
      s+='<rect x="0" y="0" width="'+ORG_NW+'" height="5" rx="4" fill="rgba(241,164,53,0.3)"/>';
    } else {
      s+='<rect x="0" y="0" width="'+ORG_NW+'" height="'+ORG_NH
        +'" rx="8" fill="'+C.surface+'" stroke="'+col+'" stroke-width="1.5"'
        +' filter="url(#orgsh)"/>';
      s+='<rect x="0" y="0" width="'+ORG_NW+'" height="5" rx="4" fill="'+col+'"/>';
      s+='<rect x="0" y="3" width="'+ORG_NW+'" height="2" fill="'+col+'"/>';
    }

    s+='<rect x="4" y="8" width="22" height="12" rx="3" fill="'+col+'28"/>';
    s+='<text x="15" y="17" text-anchor="middle" font-size="8" fill="'+col+'"'
      +' font-family="IBM Plex Mono,monospace">L'+depthN+'</text>';

    if(grp){
      var gl=grp.name.length>8?grp.name.slice(0,7)+'…':grp.name;
      s+='<rect x="'+(ORG_NW-36)+'" y="8" width="31" height="12" rx="3" fill="'+grp.color+'28"/>';
      s+='<text x="'+(ORG_NW-20)+'" y="17" text-anchor="middle" font-size="8" fill="'+grp.color+'"'
        +' font-family="IBM Plex Mono,monospace">'+escH(gl)+'</text>';
    }

    if(isVacant){
      s+='<circle cx="'+ax+'" cy="'+ay+'" r="16" fill="rgba(241,164,53,0.08)"'
        +' stroke="'+vacCol+'" stroke-width="1.5" stroke-dasharray="4,3"/>';
      s+='<text x="'+ax+'" y="'+(ay+5)+'" text-anchor="middle" font-size="18"'
        +' fill="'+vacCol+'" font-family="IBM Plex Mono,monospace">?</text>';
    } else if(hasPhoto){
      s+='<image href="'+_ps1+'" x="'+(ax-16)+'" y="'+(ay-16)+'"'
        +' width="32" height="32"'
        +' style="clip-path:circle(16px at 16px 16px)"'
        +' preserveAspectRatio="xMidYMid slice"/>';
      s+='<circle cx="'+ax+'" cy="'+ay+'" r="16" fill="none" stroke="'+col+'" stroke-width="1.5"/>';
    } else {
      s+='<circle cx="'+ax+'" cy="'+ay+'" r="16" fill="'+col+'44" stroke="'+col+'" stroke-width="1.5"/>';
      s+='<text x="'+ax+'" y="'+(ay+5)+'" text-anchor="middle" font-size="12"'
        +' font-weight="bold" fill="'+col+'" font-family="IBM Plex Mono,monospace">'+escH(initials)+'</text>';
    }

    s+='<text x="'+ax+'" y="52" text-anchor="middle" font-size="10.5"'
      +' font-weight="bold" fill="'+C.text+'" font-family="IBM Plex Sans,sans-serif">'+escH(nameS)+'</text>';
    if(roleS)
      s+='<text x="'+ax+'" y="65" text-anchor="middle" font-size="9"'
        +' fill="'+C.muted+'" font-family="IBM Plex Sans,sans-serif">'+escH(roleS)+'</text>';

    if(skillN){
      s+='<rect x="'+(ORG_NW-28)+'" y="'+(ORG_NH-18)+'" width="23" height="12" rx="6" fill="'+col+'28"/>';
      s+='<text x="'+(ORG_NW-17)+'" y="'+(ORG_NH-9)+'" text-anchor="middle" font-size="8"'
        +' fill="'+col+'" font-family="IBM Plex Mono,monospace">'+skillN+'sk</text>';
    }

    if(kidsN){
      var bx=ORG_NW/2, by2=ORG_NH;
      s+='<g data-collapse="'+e.id+'" style="cursor:pointer">'
        +'<circle cx="'+bx+'" cy="'+by2+'" r="9" fill="'+C.bg+'" stroke="'+col+'" stroke-width="1.5"/>'
        +'<text x="'+bx+'" y="'+(by2+4)+'" text-anchor="middle" font-size="10"'
          +' fill="'+col+'" font-family="IBM Plex Mono,monospace">'+(collapsed?'+':kidsN)+'</text>'
        +'</g>';
    }

    s+='<g data-addreport="'+e.id+'" style="cursor:pointer" title="Add direct report">'
      +'<circle cx="'+(ORG_NW-8)+'" cy="'+(ORG_NH-8)+'" r="9" fill="'+col+'" opacity="0.85"/>'
      +'<text x="'+(ORG_NW-8)+'" y="'+(ORG_NH-3)+'" text-anchor="middle" font-size="14"'
        +' fill="#0f0f11" font-weight="bold" font-family="IBM Plex Mono,monospace">+</text>'
      +'</g>';

    if(_orgSelected.has(e.id)){
      s+='<rect x="-4" y="-4" width="'+(ORG_NW+8)+'" height="'+(ORG_NH+8)+'"'
        +' rx="11" fill="none" stroke="#c8f135" stroke-width="2.5" stroke-dasharray="6,3" opacity="0.9"/>';
    }
    if(_orgSpofHighlight.has(e.id)){
      s+='<rect x="-4" y="-4" width="'+(ORG_NW+8)+'" height="'+(ORG_NH+8)+'"'
        +' rx="11" fill="rgba(241,67,53,0.06)" stroke="#f14335" stroke-width="2" opacity="0.85"/>';
      s+='<text x="'+(ORG_NW+2)+'" y="-2" font-size="12" title="Single Point of Failure">⚠</text>';
    }

    s+='<rect x="0" y="0" width="'+ORG_NW+'" height="'+ORG_NH+'"'
      +' fill="transparent" data-hitid="'+e.id+'"/>';

    // Detailed mode: nine-box rating (or contract type) + GTP status + next move, in the gap below the card
    if(_orgDetailMode&&!isVacant){
      var ry=ORG_NH+11;
      var contractRaw=(c.contract||'').trim();
      var isPerm=!contractRaw||/permanent/i.test(contractRaw);

      if(isPerm){
        // Permanent contract: keep the nine-box rating (or NOT RATED)
        var nbKey=_nineBoxPlacements?_nineBoxPlacements[e.id]:null;
        var nbCell=(_nbByKey&&nbKey)?_nbByKey[nbKey]:null;
        var ratFill=nbCell?nbCell.colorSolid:'#1a1a1e';
        var ratCol=nbCell?nbCell.badge:'#6b6b78';
        var ratTxt=nbCell?nbCell.label:'NOT RATED';
        if(ratTxt.length>26)ratTxt=ratTxt.slice(0,25)+'…';
        s+='<rect x="0" y="'+ry+'" width="'+ORG_NW+'" height="17" rx="4"'
          +' fill="'+ratFill+'" stroke="'+ratCol+'" stroke-width="1"/>';
        if(nbCell){
          // numbered box chip (1–9) + profile type
          s+='<rect x="3" y="'+(ry+2.5)+'" width="12" height="12" rx="3" fill="'+ratCol+'"/>';
          s+='<text x="9" y="'+(ry+11.3)+'" text-anchor="middle" font-size="8.5" font-weight="bold"'
            +' fill="#0f0f11" font-family="IBM Plex Mono,monospace">'+nbCell.box+'</text>';
          s+='<text x="20" y="'+(ry+12)+'" font-size="8" fill="'+ratCol+'"'
            +' font-family="IBM Plex Mono,monospace" font-weight="bold">'+escH(ratTxt)+'</text>';
        } else {
          s+='<circle cx="9" cy="'+(ry+8.5)+'" r="3" fill="'+ratCol+'"/>';
          s+='<text x="17" y="'+(ry+12)+'" font-size="8" fill="'+ratCol+'"'
            +' font-family="IBM Plex Mono,monospace" font-weight="bold">'+escH(ratTxt)+'</text>';
        }
      } else {
        // Non-permanent (intern, contractor, consultant, …): show the contract type instead of a rating
        var ctTxt=contractRaw.toUpperCase();
        if(ctTxt.length>26)ctTxt=ctTxt.slice(0,25)+'…';
        var ctCol='#f1a435';
        s+='<rect x="0" y="'+ry+'" width="'+ORG_NW+'" height="17" rx="4"'
          +' fill="rgba(241,164,53,0.10)" stroke="'+ctCol+'" stroke-width="1"/>';
        s+='<circle cx="9" cy="'+(ry+8.5)+'" r="3" fill="'+ctCol+'"/>';
        s+='<text x="17" y="'+(ry+12)+'" font-size="8" fill="'+ctCol+'"'
          +' font-family="IBM Plex Mono,monospace" font-weight="bold">'+escH(ctTxt)+'</text>';
      }

      // running y for the stacked detail lines below the rating/contract line
      var dy=ry+20;

      // GTP status (level of potential) — Low / Medium / High, from the resource profile
      var pot=(c.potential||'').trim();
      if(pot){
        var potCol=/high/i.test(pot)?'#5be5c8':(/med/i.test(pot)?'#f1a435':'#8a8a96');
        s+='<rect x="0" y="'+dy+'" width="'+ORG_NW+'" height="17" rx="4"'
          +' fill="rgba(255,255,255,0.03)" stroke="'+potCol+'" stroke-width="1"/>';
        s+='<text x="7" y="'+(dy+12)+'" font-size="8" fill="'+C.muted+'"'
          +' font-family="IBM Plex Mono,monospace">GTP</text>';
        s+='<text x="'+(ORG_NW-7)+'" y="'+(dy+12)+'" text-anchor="end" font-size="8" font-weight="bold"'
          +' fill="'+potCol+'" font-family="IBM Plex Mono,monospace">'+escH(pot.toUpperCase())+'</text>';
        dy+=20;
      }

      var nm=c.nextMove||{};
      if(nm.show&&(nm.position||'').trim()){
        // next move position — its own line
        var posTxt='→ '+nm.position;
        if(posTxt.length>40)posTxt=posTxt.slice(0,39)+'…';
        s+='<rect x="0" y="'+dy+'" width="'+ORG_NW+'" height="17" rx="4"'
          +' fill="rgba(91,229,200,0.10)" stroke="#5be5c8" stroke-width="1"/>';
        s+='<text x="7" y="'+(dy+12)+'" font-size="8" fill="#5be5c8"'
          +' font-family="IBM Plex Mono,monospace">'+escH(posTxt)+'</text>';
        dy+=20;
        // move timeline — separate line
        var tlTxt=(nm.timeline||'').trim();
        if(tlTxt){
          if(tlTxt.length>40)tlTxt=tlTxt.slice(0,39)+'…';
          s+='<rect x="0" y="'+dy+'" width="'+ORG_NW+'" height="17" rx="4"'
            +' fill="rgba(91,229,200,0.06)" stroke="#5be5c8" stroke-width="1"/>';
          s+='<text x="7" y="'+(dy+12)+'" font-size="8" fill="#5be5c8"'
            +' font-family="IBM Plex Mono,monospace">'+escH('⏱ '+tlTxt)+'</text>';
          dy+=20;
        }
      }
    }

    s+='</g>';
  });

  var annotLayer='<g id="org-annot-layer" style="'+(_orgAnnotsBg?'pointer-events:none':'')+'">'+
    _orgAnnotations.map(function(a){return orgAnnotSVG(a);}).join('')+'</g>';
  if(_orgAnnotsBg) s+=annotLayer;

  if(!_orgAnnotsBg){
    s+='<g id="org-annot-layer" style="pointer-events:all">'+
      _orgAnnotations.map(function(a){return orgAnnotSVG(a);}).join('')+'</g>';
  }

  for(var dh=0;dh<=maxD;dh++){
    var lh2=_orgLevelH[dh]!==undefined?_orgLevelH[dh]:(ORG_NH+ORG_VGAP);
    var lyBottom=vals.filter(function(p){return p.depth===dh;}).length?
      vals.filter(function(p){return p.depth===dh;})[0].y+lh2:
      dh*(ORG_NH+ORG_VGAP)+lh2;
    s+='<line x1="'+(minX-60)+'" y1="'+lyBottom+'" x2="'+(maxX+60)+'" y2="'+lyBottom+'"'
      +' stroke="rgba(200,241,53,0.15)" stroke-width="2" stroke-dasharray="6,4"'
      +' data-levelhandle="'+dh+'" style="cursor:ns-resize" title="Drag to resize level '+dh+'"/>';
    s+='<rect x="'+(minX-60)+'" y="'+(lyBottom-6)+'" width="'+(maxX-minX+120)+'" height="12"'
      +' fill="transparent" data-levelhandle="'+dh+'" style="cursor:ns-resize"/>';
    s+='<text x="'+(minX-60)+'" y="'+(lyBottom-4)+'" font-size="8" fill="rgba(200,241,53,0.4)"'
      +' font-family="IBM Plex Mono,monospace">'+lh2+'px ↕</text>';
  }

  s+='<g id="org-rubberband"></g>';

  s+='</g></g>';
  svg.innerHTML=s;
  orgUpdateSelHint();
  if(_orgKpiOpen)orgRenderKPI();
}

// wires up mouse/wheel/context/key handlers for the chart
function orgBindGlobalEvents(){
  var wrap=G('org-body');
  var svg=G('org-svg');

  wrap.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    var hit=e.target.closest('[data-hitid]');
    var collapse=e.target.closest('[data-collapse]');
    var addReport=e.target.closest('[data-addreport]');
    var arrow=e.target.closest('[data-arrowfrom]');

    if(arrow&&!hit){e.stopPropagation();return;}

    if(collapse){
      e.stopPropagation();
      orgToggleCollapse(+collapse.dataset.collapse);
      return;
    }
    if(addReport){
      e.stopPropagation();
      orgAddDirectReport(+addReport.dataset.addreport);
      return;
    }

    if(hit){
      e.stopPropagation();
      var engId=+hit.dataset.hitid;

      if(e.shiftKey){
        if(_orgSelected.has(engId)) _orgSelected.delete(engId);
        else _orgSelected.add(engId);
        renderOrgChart(); return;
      }

      if(!_orgSelected.has(engId)){
        _orgSelected.clear();
        _orgSelected.add(engId);
        renderOrgChart();
      }

      var T=buildOrgTree();
      var pos=orgLayout(T.roots,T.children);
      var offsets={};
      _orgSelected.forEach(function(id){
        var p=pos[id]||{x:0,y:0};
        var bx=(_orgPositions[id]&&_orgPositions[id].x!=null)?_orgPositions[id].x:p.x;
        var by=(_orgPositions[id]&&_orgPositions[id].y!=null)?_orgPositions[id].y:p.y;
        offsets[id]={bx:bx,by:by};
      });

      _orgDragNode={
        engId:engId,
        startX:e.clientX, startY:e.clientY,
        dragging:false,
        offsets:offsets
      };
      return;
    }

    var editLvl=e.target.closest('[data-editLevel]');
    if(editLvl){
      var ed=+editLvl.dataset.editLevel;
      var _DEFS=['Executive','Director','Manager','Senior','Individual'];
      var cur=_orgLevelNames[ed]||_DEFS[ed]||'Level '+ed;
      var newName=prompt('Rename level '+ed+' (currently "'+cur+'"):',cur);
      if(newName!==null&&newName.trim()){_orgLevelNames[ed]=newName.trim();saveState();renderOrgChart();}
      e.stopPropagation();return;
    }
    var levelH=e.target.closest('[data-levelhandle]');
    if(levelH){
      var lhDepth=+levelH.dataset.levelhandle;
      var startY2=e.clientY;
      var startH=_orgLevelH[lhDepth]!==undefined?_orgLevelH[lhDepth]:(ORG_NH+ORG_VGAP);
      function onLHMove(ev){
        var delta=(ev.clientY-startY2)/_orgScale;
        _orgLevelH[lhDepth]=Math.max(ORG_NH+10,Math.round(startH+delta));
        renderOrgChart();
      }
      function onLHUp(){
        window.removeEventListener('mousemove',onLHMove);
        window.removeEventListener('mouseup',onLHUp);
        saveState();
      }
      window.addEventListener('mousemove',onLHMove);
      window.addEventListener('mouseup',onLHUp);
      e.stopPropagation();
      return;
    }

    var annotResize=e.target.closest('[data-annotresize]');
    if(annotResize&&_orgDrawTool==='select'){
      e.stopPropagation();
      var raid=+annotResize.dataset.annotresize;
      var rann=_orgAnnotations.find(function(x){return x.id===raid;});
      if(rann){
        _orgEditAnnotId=raid;
        var rsx=e.clientX, rsy=e.clientY, rw0=rann.w||220, rh0=rann.h||150;
        function onRMove(ev){
          rann.w=Math.max(80,Math.round(rw0+(ev.clientX-rsx)/_orgScale));
          rann.h=Math.max(40,Math.round(rh0+(ev.clientY-rsy)/_orgScale));
          var al=G('org-annot-layer');
          if(al){var tmp='';_orgAnnotations.forEach(function(a){tmp+=orgAnnotSVG(a);});al.innerHTML=tmp;}
        }
        function onRUp(){
          window.removeEventListener('mousemove',onRMove);
          window.removeEventListener('mouseup',onRUp);
          saveState();renderOrgChart();
        }
        window.addEventListener('mousemove',onRMove);
        window.addEventListener('mouseup',onRUp);
      }
      return;
    }

    var annotEl=e.target.closest('.org-annot');
    if(annotEl&&_orgDrawTool==='select'){
      var aid=+annotEl.dataset.annotid;
      var ann=_orgAnnotations.find(function(x){return x.id===aid;});
      if(ann){
        _orgEditAnnotId=aid;
        var ax0=ann.x,ay0=ann.y,sx0=e.clientX,sy0=e.clientY;
        var afrom0=ann.fromPt?{x:ann.fromPt.x,y:ann.fromPt.y}:null;
        var ato0=ann.toPt?{x:ann.toPt.x,y:ann.toPt.y}:null;
        var moved=false;
        function onAMove(ev){
          moved=true;
          var dx2=(ev.clientX-sx0)/_orgScale,dy2=(ev.clientY-sy0)/_orgScale;
          if(ann.type==='arrow'){ann.fromPt={x:afrom0.x+dx2,y:afrom0.y+dy2};ann.toPt={x:ato0.x+dx2,y:ato0.y+dy2};}
          else{ann.x=ax0+dx2;ann.y=ay0+dy2;}
          var al=G('org-annot-layer');
          if(al){var tmp='';_orgAnnotations.forEach(function(a){tmp+=orgAnnotSVG(a);});al.innerHTML=tmp;}
        }
        function onAUp(){
          window.removeEventListener('mousemove',onAMove);
          window.removeEventListener('mouseup',onAUp);
          if(!moved)orgOpenAnnotEdit(ann);
          else{saveState();renderOrgChart();}
        }
        window.addEventListener('mousemove',onAMove);
        window.addEventListener('mouseup',onAUp);
        e.stopPropagation();
        return;
      }
    }

    if(_orgDrawTool!=='select'){
      var svgR=G('org-svg').getBoundingClientRect();
      var canvX2=(e.clientX-svgR.left-_orgPanX)/_orgScale;
      var canvY2=(e.clientY-svgR.top-_orgPanY)/_orgScale;
      var T5=buildOrgTree();
      var p5=orgLayout(T5.roots,T5.children);
      var v5=Object.values(p5);
      var minX5=v5.length?Math.min.apply(null,v5.map(function(p){return p.x;})):0;
      var OX5=60-minX5, OY5=60;
      var wx=canvX2-OX5, wy=canvY2-OY5;

      if(_orgDrawTool==='text'){
        var newA={id:_orgNextAnnotId++,type:'text',x:wx,y:wy,w:160,h:30,
          text:'Text',color:'#e8e8ea',fontSize:13,bold:false,italic:false};
        _orgAnnotations.push(newA);
        saveState();renderOrgChart();
        setTimeout(function(){orgOpenAnnotEdit(newA);},50);
        return;
      }
      _orgDrawing={tool:_orgDrawTool,sx:wx,sy:wy,ex:wx,ey:wy};
      var drawLayer=G('org-annot-layer');
      function onDrawMove(ev){
        var ex2=(ev.clientX-svgR.left-_orgPanX)/_orgScale-OX5;
        var ey2=(ev.clientY-svgR.top-_orgPanY)/_orgScale-OY5;
        _orgDrawing.ex=ex2;_orgDrawing.ey=ey2;
        if(!drawLayer)return;
        var px2=Math.min(_orgDrawing.sx,ex2),py2=Math.min(_orgDrawing.sy,ey2);
        var pw=Math.abs(ex2-_orgDrawing.sx),ph=Math.abs(ey2-_orgDrawing.sy);
        var prev=_orgAnnotations.map(function(a){return orgAnnotSVG(a);}).join('');
        var preview='';
        if(_orgDrawTool==='rect')
          preview='<rect x="'+px2+'" y="'+py2+'" width="'+pw+'" height="'+ph+'" fill="rgba(200,241,53,0.06)" stroke="#c8f135" stroke-width="1.5" stroke-dasharray="5,3" rx="4"/>';
        else if(_orgDrawTool==='ellipse')
          preview='<ellipse cx="'+(px2+pw/2)+'" cy="'+(py2+ph/2)+'" rx="'+(pw/2)+'" ry="'+(ph/2)+'" fill="rgba(91,229,200,0.06)" stroke="#5be5c8" stroke-width="1.5" stroke-dasharray="5,3"/>';
        else if(_orgDrawTool==='arrow')
          preview='<line x1="'+_orgDrawing.sx+'" y1="'+_orgDrawing.sy+'" x2="'+ex2+'" y2="'+ey2+'" stroke="#f1a435" stroke-width="2" marker-end="url(#orgarr)"/>';
        drawLayer.innerHTML=prev+preview;
      }
      function onDrawUp(ev){
        window.removeEventListener('mousemove',onDrawMove);
        window.removeEventListener('mouseup',onDrawUp);
        var ex3=(ev.clientX-svgR.left-_orgPanX)/_orgScale-OX5;
        var ey3=(ev.clientY-svgR.top-_orgPanY)/_orgScale-OY5;
        var px3=Math.min(_orgDrawing.sx,ex3),py3=Math.min(_orgDrawing.sy,ey3);
        var pw3=Math.abs(ex3-_orgDrawing.sx),ph3=Math.abs(ey3-_orgDrawing.sy);
        if(pw3>4||ph3>4){
          var newA2;
          if(_orgDrawTool==='rect')
            newA2={id:_orgNextAnnotId++,type:'rect',x:px3,y:py3,w:pw3,h:ph3,text:'',color:'#c8f135',fill:'rgba(200,241,53,0.06)'};
          else if(_orgDrawTool==='ellipse')
            newA2={id:_orgNextAnnotId++,type:'ellipse',x:px3,y:py3,w:pw3,h:ph3,text:'',color:'#5be5c8',fill:'rgba(91,229,200,0.06)'};
          else if(_orgDrawTool==='arrow')
            newA2={id:_orgNextAnnotId++,type:'arrow',fromPt:{x:_orgDrawing.sx,y:_orgDrawing.sy},toPt:{x:ex3,y:ey3},color:'#f1a435'};
          if(newA2){
            _orgAnnotations.push(newA2);
            _orgEditAnnotId=newA2.id;
            saveState();renderOrgChart();
          }
        }
        _orgDrawing=null;
      }
      window.addEventListener('mousemove',onDrawMove);
      window.addEventListener('mouseup',onDrawUp);
      return;
    }

    _orgPanDrag={ox:e.clientX-_orgPanX,oy:e.clientY-_orgPanY};
    wrap.style.cursor='grabbing';
    if(!e.shiftKey&&_orgDrawTool==='select')_orgSelected.clear();
  });

  window.addEventListener('mousemove',function(e){
    if(_orgDragNode){
      var dx=e.clientX-_orgDragNode.startX, dy=e.clientY-_orgDragNode.startY;
      if(!_orgDragNode.dragging&&Math.hypot(dx,dy)>6){
        _orgDragNode.dragging=true;
        orgHideHover();
        if(_orgSnapGrid){
          var T2=buildOrgTree();
          var p2=orgLayout(T2.roots,T2.children);
          var vs=Object.values(p2);
          if(vs.length){
            orgDrawGrid(svg,
              Math.min.apply(null,vs.map(function(v){return v.x;}))-100,
              Math.max.apply(null,vs.map(function(v){return v.x+ORG_NW;}))+100,
              Math.min.apply(null,vs.map(function(v){return v.y;}))-100,
              Math.max.apply(null,vs.map(function(v){return v.y+ORG_NH;}))+100
            );
          }
        }
        _orgPanDrag=null;
      }
      if(_orgDragNode.dragging){
        var dxs=dx/_orgScale, dys=dy/_orgScale;
        _orgSelected.forEach(function(id){
          var off=_orgDragNode.offsets[id];if(!off)return;
          var snapped=orgSnapXY(off.bx+dxs, off.by+dys);
          var el=G('orgn-'+id);
          if(el)el.setAttribute('transform','translate('+snapped.x+','+snapped.y+')');
        });
      }
      return;
    }

    if(_orgPanDrag){
      _orgPanX=e.clientX-_orgPanDrag.ox;
      _orgPanY=e.clientY-_orgPanDrag.oy;
      orgApplyTransform();
    }
  });

  window.addEventListener('mouseup',function(e){
    wrap.style.cursor='grab';

    _orgPanDrag=null;

    if(_orgDragNode){
      if(!_orgDragNode.dragging){
        var eid=_orgDragNode.engId;
        _orgDragNode=null;
        var card=G('org-hover-card');
        if(card&&card.style.display!=='none'&&card._openForId===eid){
          orgHideHover();
        } else {
          orgHover(e,eid);
        }
        return;
      }

      var dx2=e.clientX-_orgDragNode.startX, dy2=e.clientY-_orgDragNode.startY;
      var dxc=dx2/_orgScale, dyc=dy2/_orgScale;

      var T4=buildOrgTree();
      var pos4=orgLayout(T4.roots,T4.children);
      var allP4=Object.values(pos4);
      var minX4=allP4.length?Math.min.apply(null,allP4.map(function(p){return p.x;})):0;
      var svgRect4=svg.getBoundingClientRect();
      var canvasX=(e.clientX-svgRect4.left-_orgPanX)/_orgScale-(60-minX4)-60;
      var canvasY=(e.clientY-svgRect4.top-_orgPanY)/_orgScale-60;

      var dropId=null;
      if(_orgSelected.size===1){
        T4.engs.forEach(function(eng){
          if(eng.id===_orgDragNode.engId)return;
          var p4=pos4[eng.id];if(!p4)return;
          if(canvasX>=p4.x&&canvasX<=p4.x+ORG_NW&&canvasY>=p4.y&&canvasY<=p4.y+ORG_NH)
            dropId=eng.id;
        });
      }

      if(dropId!==null){
        var circ=false,cur2=dropId;
        for(var i=0;i<50;i++){
          var ce=T4.byId[cur2]||T4.byId[String(cur2)];if(!ce)break;
          var cpid=(ce.idcard||{}).reportsTo;if(!cpid)break;
          if(+cpid===_orgDragNode.engId){circ=true;break;}
          cur2=+cpid;
        }
        if(!circ){
          var eng2=engineers.find(function(x){return x.id===_orgDragNode.engId;});
          if(eng2){if(!eng2.idcard)eng2.idcard={};
            eng2.idcard.reportsTo=String(dropId);
            var mgr2=engineers.find(function(x){return x.id===dropId;});
            if(mgr2)eng2.idcard.manager=mgr2.name;
          }
          delete _orgPositions[_orgDragNode.engId];
          saveState();
        }
      } else {
        _orgSelected.forEach(function(id){
          var off=_orgDragNode.offsets[id];if(!off)return;
          var snapped=orgSnapXY(off.bx+dxc, off.by+dyc);
          _orgPositions[id]={x:snapped.x,y:snapped.y};
        });
      }

      orgClearGrid();
      _orgDragNode=null;
      renderOrgChart();
      return;
    }
  });

  wrap.addEventListener('wheel',function(e){
    e.preventDefault();
    var rect=wrap.getBoundingClientRect();
    var mx=e.clientX-rect.left, my=e.clientY-rect.top;
    var f=e.deltaY>0?0.88:1.14;
    var ns=Math.max(0.12,Math.min(5,_orgScale*f));
    _orgPanX=mx-(mx-_orgPanX)*ns/_orgScale;
    _orgPanY=my-(my-_orgPanY)*ns/_orgScale;
    _orgScale=ns;
    orgApplyTransform();
  },{passive:false});

  G('org-svg').addEventListener('contextmenu',function(e){
    e.preventDefault(); e.stopPropagation();
    var hit=e.target.closest('[data-hitid]');
    var arrow=e.target.closest('[data-arrowfrom]');
    if(hit){
      _orgCtxId=+hit.dataset.hitid;
      var eng3=engineers.find(function(x){return x.id===_orgCtxId;});
      G('org-ctx-label').textContent=eng3?eng3.name:'Person';
      G('org-arrow-ctx').style.display='none';
      var m=G('org-ctx-menu');
      m.style.left=Math.min(e.clientX,window.innerWidth-180)+'px';
      m.style.top=Math.min(e.clientY,window.innerHeight-220)+'px';
      m.style.display='block';
    } else if(arrow){
      _orgArrowCtx={fromId:+arrow.dataset.arrowfrom,toId:+arrow.dataset.arrowto};
      var am=G('org-arrow-ctx');
      var fromE=engineers.find(function(x){return x.id===_orgArrowCtx.fromId;});
      var toE=engineers.find(function(x){return x.id===_orgArrowCtx.toId;});
      G('org-arrow-ctx-label').textContent=(fromE?fromE.name:'?')+' → '+(toE?toE.name:'?');
      G('org-ctx-menu').style.display='none';
      am.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';
      am.style.top=Math.min(e.clientY,window.innerHeight-120)+'px';
      am.style.display='block';
    }
  });

  document.addEventListener('click',function(e){
    var m=G('org-ctx-menu');
    if(m&&!m.contains(e.target))m.style.display='none';
    var am=G('org-arrow-ctx');
    if(am&&!am.contains(e.target))am.style.display='none';
    var hc=G('org-hover-card');
    if(hc&&hc.style.display!=='none'&&!hc.contains(e.target)
       &&!e.target.closest('[data-hitid]')){
      orgHideHover();
    }
  });

  document.addEventListener('keydown',function(e){
    if(G('org-overlay').style.display==='none')return;
    if(e.key==='Escape'){orgClearSelection();orgHideHover();}
  });
}

// selects the active draw tool (select/text/rect/ellipse/arrow)
function orgSetTool(tool){
  _orgDrawTool=tool;
  _orgEditAnnotId=null;
  ['select','text','rect','ellipse','arrow'].forEach(function(t){
    var b=G('otool-'+t);
    if(b){b.style.borderColor=t===tool?'var(--accent)':'';b.style.color=t===tool?'var(--accent)':'';}
  });
  var wrap=G('org-body');
  if(wrap)wrap.style.cursor=tool==='select'?'grab':'crosshair';
}

// toggles annotations between background and foreground
function orgToggleAnnotBg(){
  _orgAnnotsBg=!_orgAnnotsBg;
  var b=G('org-annot-bg-btn');
  if(b){b.textContent='▭ '+(_orgAnnotsBg?'BG':'FG');
    b.style.borderColor=_orgAnnotsBg?'var(--accent2)':'';
    b.style.color=_orgAnnotsBg?'var(--accent2)':'';
  }
  renderOrgChart();
}
// toggles reporting-line arrows on/off
function orgToggleArrows(){
  _orgShowArrows=!_orgShowArrows;
  var b=G('org-arrows-btn');
  if(b){b.textContent='↗ ARROWS: '+(_orgShowArrows?'ON':'OFF');
    b.style.borderColor=_orgShowArrows?'':'var(--border)';
    b.style.color=_orgShowArrows?'':'var(--muted)';
  }
  renderOrgChart();
}
// toggles detailed mode: nine-box rating + recommended next move on each card
function orgToggleDetail(){
  _orgDetailMode=!_orgDetailMode;
  var b=G('org-detail-btn');
  if(b){b.textContent='◔ DETAILS: '+(_orgDetailMode?'ON':'OFF');
    b.style.borderColor=_orgDetailMode?'var(--accent2)':'';
    b.style.color=_orgDetailMode?'var(--accent2)':'';
  }
  renderOrgChart();
}
// adds an editable, resizable legend card (org-node styling) near the centre of the view
function orgAddLegend(){
  var def=['• Potential electrifier','• Electrifier','',
           '• Willing to relocate','• Talent not willing to relocate'].join('\n');
  var svgR=G('org-svg').getBoundingClientRect();
  var T=buildOrgTree();
  var p=orgLayout(T.roots,T.children);
  var v=Object.values(p);
  var minX=v.length?Math.min.apply(null,v.map(function(q){return q.x;})):0;
  var OX=60-minX, OY=60;
  var x=(svgR.width*0.5-_orgPanX)/_orgScale-OX;
  var y=(svgR.height*0.35-_orgPanY)/_orgScale-OY;
  var a={id:_orgNextAnnotId++,type:'legend',x:Math.round(x),y:Math.round(y),
    w:230,h:158,text:def,color:'#c8f135',fontSize:12};
  _orgAnnotations.push(a);
  _orgEditAnnotId=a.id;
  saveState();renderOrgChart();
}
// deletes the currently selected annotation
function orgDeleteSelectedAnnot(){
  if(_orgEditAnnotId===null)return;
  _orgAnnotations=_orgAnnotations.filter(function(a){return a.id!==_orgEditAnnotId;});
  _orgEditAnnotId=null;
  saveState();renderOrgChart();
}

// opens the annotation editor popover
function orgOpenAnnotEdit(a){
  _orgEditAnnotId=a.id;
  var existing=G('org-annot-editor');if(existing)existing.remove();
  var div=document.createElement('div');
  div.id='org-annot-editor';
  div.style.cssText='position:fixed;background:var(--surface);border:1px solid var(--border);'
    +'border-radius:8px;padding:14px;z-index:800;box-shadow:0 8px 24px rgba(0,0,0,.7);'
    +'min-width:240px;top:50%;left:50%;transform:translate(-50%,-50%)';
  var isText=a.type==='text';
  div.innerHTML='<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--accent);margin-bottom:10px">'
    +'EDIT '+a.type.toUpperCase()+' <button onclick="G(\'org-annot-editor\').remove()" style="float:right;background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px">✕</button></div>'
    +(isText||a.type==='rect'||a.type==='ellipse'||a.type==='legend'?
      '<div style="margin-bottom:6px"><label style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">TEXT</label>'
      +'<textarea id="ae-text" style="display:block;width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12px;padding:5px;border-radius:4px;resize:vertical;min-height:50px;margin-top:2px;font-family:inherit">'+escH(a.text||'')+'</textarea></div>':'')
    +'<div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
    +'<div><label style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">COLOR</label>'
    +'<input type="color" id="ae-color" value="'+(a.color||'#c8f135')+'" style="display:block;width:36px;height:24px;border:none;padding:0;cursor:pointer;margin-top:2px"></div>'
    +(isText?'<div><label style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">SIZE</label>'
    +'<input type="number" id="ae-size" value="'+(a.fontSize||13)+'" min="8" max="48" style="display:block;width:52px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:3px 5px;border-radius:4px;margin-top:2px"></div>'
    +'<div style="display:flex;flex-direction:column;gap:3px;justify-content:flex-end">'
    +'<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer"><input type="checkbox" id="ae-bold"'+(a.bold?' checked':'')+'>Bold</label>'
    +'<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer"><input type="checkbox" id="ae-italic"'+(a.italic?' checked':'')+'>Italic</label>'
    +'</div>':'')
    +(a.type==='rect'||a.type==='ellipse'?'<div><label style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">FILL</label>'
    +'<input type="color" id="ae-fill" value="#18181c" style="display:block;width:36px;height:24px;border:none;padding:0;cursor:pointer;margin-top:2px"></div>':'')
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-top:4px">'
    +'<button class="primary" onclick="orgSaveAnnotEdit('+a.id+')" style="flex:1">SAVE</button>'
    +'<button onclick="orgDeleteSelectedAnnot();G(\'org-annot-editor\').remove()" style="color:var(--danger)">DELETE</button>'
    +'</div>';
  document.body.appendChild(div);
}

// saves edits made in the annotation editor
function orgSaveAnnotEdit(id){
  var a=_orgAnnotations.find(function(x){return x.id===id;});if(!a)return;
  var t=G('ae-text');if(t)a.text=t.value;
  var c=G('ae-color');if(c)a.color=c.value;
  var s=G('ae-size');if(s)a.fontSize=+s.value||13;
  var b=G('ae-bold');if(b)a.bold=b.checked;
  var i=G('ae-italic');if(i)a.italic=i.checked;
  var f=G('ae-fill');if(f)a.fill=f.value+'44';
  var ed=G('org-annot-editor');if(ed)ed.remove();
  saveState();renderOrgChart();
}

// debounced save of org chart state
function orgAutoSave(){
  clearTimeout(_orgAutoSaveTimer);
  _orgAutoSaveTimer=setTimeout(function(){saveState();},2000);
}

// clears the multi-node selection
function orgClearSelection(){ _orgSelected.clear(); renderOrgChart(); }
// toggles snap-to-grid for node dragging
function orgToggleSnap(){
  _orgSnapGrid=!_orgSnapGrid;
  var btn=G('org-snap-btn');
  if(btn){btn.textContent='⊞ SNAP: '+(_orgSnapGrid?'ON':'OFF');
    btn.style.borderColor=_orgSnapGrid?'var(--accent)':'';
    btn.style.color=_orgSnapGrid?'var(--accent)':'';
  }
}
// snaps a coordinate pair to the grid when enabled
function orgSnapXY(x,y){
  if(!_orgSnapGrid)return{x:x,y:y};
  return{x:Math.round(x/ORG_GRID)*ORG_GRID, y:Math.round(y/ORG_GRID)*ORG_GRID};
}
// updates the selection hint text
function orgUpdateSelHint(){
  var n=_orgSelected.size;
  var hint=G('org-sel-hint');
  if(!hint)return;
  hint.textContent=n>0
    ?n+' selected — drag any selected node to move group · Esc to deselect'
    :'Click=select · Shift+click=add · Drag empty=rubber band · Drag node=move group';
}
// draws the snap grid overlay
function orgDrawGrid(svg,minX,maxX,minY,maxY){
  var g=G('org-rubberband');if(!g)return;
  var lines='';
  var gx=Math.floor(minX/ORG_GRID)*ORG_GRID;
  for(var x=gx;x<=maxX+ORG_GRID;x+=ORG_GRID){
    lines+='<line x1="'+x+'" y1="'+(minY-200)+'" x2="'+x+'" y2="'+(maxY+200)+'"'
      +' stroke="rgba(200,241,53,0.08)" stroke-width="0.5"/>';
  }
  var gy=Math.floor(minY/ORG_GRID)*ORG_GRID;
  for(var y=gy;y<=maxY+ORG_GRID;y+=ORG_GRID){
    lines+='<line x1="'+(minX-200)+'" y1="'+y+'" x2="'+(maxX+200)+'" y2="'+y+'"'
      +' stroke="rgba(200,241,53,0.08)" stroke-width="0.5"/>';
  }
  g.innerHTML=lines;
}
// clears the snap grid overlay
function orgClearGrid(){var g=G('org-rubberband');if(g)g.innerHTML='';}

// builds the SVG markup for one annotation
function orgAnnotSVG(a){
  var s='';
  var sel=_orgEditAnnotId===a.id;
  var selRing=sel?'stroke="#c8f135" stroke-dasharray="4,2" stroke-width="1.5"':'stroke="none"';
  if(a.type==='text'){
    var fw=a.bold?'bold':'normal';
    var fs=a.italic?'italic':'normal';
    s+='<g data-annotid="'+a.id+'" class="org-annot" style="cursor:move">';
    s+='<rect x="'+(a.x-4)+'" y="'+(a.y-4)+'" width="'+(a.w+8)+'" height="'+(a.h+8)+'"'
      +' fill="transparent" '+selRing+' rx="3"/>';
    var lines=(a.text||'').split('\n');
    var lh2=(a.fontSize||13)*1.4;
    lines.forEach(function(ln,i){
      s+='<text x="'+a.x+'" y="'+(a.y+(a.fontSize||13)+i*lh2)+'"'
        +' font-size="'+(a.fontSize||13)+'" fill="'+(a.color||'#e8e8ea')+'"'
        +' font-weight="'+fw+'" font-style="'+fs+'"'
        +' font-family="IBM Plex Sans,sans-serif">'+escH(ln)+'</text>';
    });
    s+='</g>';
  } else if(a.type==='rect'){
    s+='<g data-annotid="'+a.id+'" class="org-annot" style="cursor:move">';
    s+='<rect x="'+a.x+'" y="'+a.y+'" width="'+a.w+'" height="'+a.h+'"'
      +' fill="'+(a.fill||'rgba(200,241,53,0.06)')+'"'
      +' stroke="'+(a.color||'#c8f135')+'" stroke-width="1.5" rx="4"/>';
    if(a.text)s+='<text x="'+(a.x+6)+'" y="'+(a.y+16)+'" font-size="11"'
      +' fill="'+(a.color||'#c8f135')+'" font-family="IBM Plex Sans,sans-serif">'+escH(a.text)+'</text>';
    s+='<rect x="'+a.x+'" y="'+a.y+'" width="'+a.w+'" height="'+a.h+'"'
      +' fill="transparent" '+selRing+' rx="4"/>';
    s+='</g>';
  } else if(a.type==='ellipse'){
    var rx2=a.w/2,ry2=a.h/2;
    s+='<g data-annotid="'+a.id+'" class="org-annot" style="cursor:move">';
    s+='<ellipse cx="'+(a.x+rx2)+'" cy="'+(a.y+ry2)+'" rx="'+rx2+'" ry="'+ry2+'"'
      +' fill="'+(a.fill||'rgba(91,229,200,0.06)')+'"'
      +' stroke="'+(a.color||'#5be5c8')+'" stroke-width="1.5"/>';
    if(a.text)s+='<text x="'+(a.x+rx2)+'" y="'+(a.y+ry2+4)+'" text-anchor="middle" font-size="11"'
      +' fill="'+(a.color||'#5be5c8')+'" font-family="IBM Plex Sans,sans-serif">'+escH(a.text)+'</text>';
    s+='<ellipse cx="'+(a.x+rx2)+'" cy="'+(a.y+ry2)+'" rx="'+rx2+'" ry="'+ry2+'"'
      +' fill="transparent" '+selRing+'/>';
    s+='</g>';
  } else if(a.type==='arrow'){
    s+='<g data-annotid="'+a.id+'" class="org-annot" style="cursor:move">';
    s+='<line x1="'+a.fromPt.x+'" y1="'+a.fromPt.y+'" x2="'+a.toPt.x+'" y2="'+a.toPt.y+'"'
      +' stroke="'+(a.color||'#f1a435')+'" stroke-width="2" marker-end="url(#orgarr)"/>';
    s+='<line x1="'+a.fromPt.x+'" y1="'+a.fromPt.y+'" x2="'+a.toPt.x+'" y2="'+a.toPt.y+'"'
      +' stroke="transparent" stroke-width="12"/>';
    s+='</g>';
  } else if(a.type==='legend'){
    // editable, resizable card styled like an org-chart node
    var lw=a.w||220, lh=a.h||150;
    var lcol=a.color||'#c8f135';
    var lfs=a.fontSize||12;
    s+='<g data-annotid="'+a.id+'" class="org-annot" style="cursor:move">';
    s+='<rect x="'+a.x+'" y="'+a.y+'" width="'+lw+'" height="'+lh+'" rx="8"'
      +' fill="#18181c" stroke="'+lcol+'" stroke-width="1.5" filter="url(#orgsh)"/>';
    s+='<rect x="'+a.x+'" y="'+a.y+'" width="'+lw+'" height="5" rx="4" fill="'+lcol+'"/>';
    var lly=(a.text||'').split('\n');
    var llh=lfs*1.7;
    lly.forEach(function(ln,i){
      if(ln.trim())
        s+='<text x="'+(a.x+12)+'" y="'+(a.y+24+lfs+i*llh)+'" font-size="'+lfs+'"'
          +' fill="#e8e8ea" font-family="IBM Plex Sans,sans-serif">'+escH(ln)+'</text>';
    });
    s+='<rect x="'+a.x+'" y="'+a.y+'" width="'+lw+'" height="'+lh+'"'
      +' fill="transparent" '+selRing+' rx="8"/>';
    // resize grip (bottom-right)
    var grx=a.x+lw, gry=a.y+lh;
    s+='<g data-annotresize="'+a.id+'" style="cursor:nwse-resize">';
    s+='<rect x="'+(grx-15)+'" y="'+(gry-15)+'" width="15" height="15" fill="transparent"/>';
    s+='<path d="M'+(grx-4)+','+(gry-12)+' L'+(grx-4)+','+(gry-4)+' L'+(grx-12)+','+(gry-4)+'"'
      +' fill="none" stroke="'+lcol+'" stroke-width="1.5"/>';
    s+='</g>';
    s+='</g>';
  }
  return s;
}

// applies the current pan/zoom transform to the root group
function orgApplyTransform(){
  var g=G('org-root');
  if(g)g.setAttribute('transform','translate('+_orgPanX+','+_orgPanY+') scale('+_orgScale+')');
}
// zooms the chart by a factor
function orgZoom(f){ _orgScale=Math.max(0.12,Math.min(5,_orgScale*f)); orgApplyTransform(); }
// resets pan/zoom and re-renders
function orgResetView(){ _orgScale=1;_orgPanX=0;_orgPanY=0; renderOrgChart(); }

// collapses/expands a node's subtree
function orgToggleCollapse(id){
  _orgCollapsed[id]=!_orgCollapsed[id];
  renderOrgChart();
}

// prompts for and adds a new direct report under a manager
function orgAddDirectReport(managerId){
  orgHideHover();
  var mgr=engineers.find(function(e){return e.id===managerId;});
  var name=prompt('New direct report name'+(mgr?' (reporting to '+mgr.name+')':'')+':\n(Leave blank to cancel)');
  if(!name||!name.trim())return;
  var newEng={
    id:nextEngId++, name:name.trim(), monthlyCost:8000,
    groupId:mgr?mgr.groupId:null, role:'', location:'',
    skills:[], idcard:{
      reportsTo:String(managerId), manager:mgr?mgr.name:'',
      photo:'',contract:'',seniority:'',startdate:'',reviewdate:'',
      languages:'',aspirations:'',strengths:'',devarea:'',notes:'',manager2:''
    }
  };
  engineers.push(newEng);
  _orgCollapsed[managerId]=false;
  saveState(); renderOrgChart();
}
// prompts for and adds a new root-level person
function orgAddRoot(){
  var name=prompt('New person name:\n(Leave blank to cancel)');
  if(!name||!name.trim())return;
  var newEng={
    id:nextEngId++, name:name.trim(), monthlyCost:8000,
    groupId:null, role:'', location:'',
    skills:[], idcard:{
      reportsTo:'', manager:'', photo:'', contract:'', seniority:'',
      startdate:'', reviewdate:'', languages:'', aspirations:'',
      strengths:'', devarea:'', notes:''
    }
  };
  engineers.push(newEng);
  saveState(); renderOrgChart();
}

// removes the reporting link for the context arrow
function orgArrowDelete(){
  G('org-arrow-ctx').style.display='none';
  if(!_orgArrowCtx)return;
  var child=engineers.find(function(e){return e.id===_orgArrowCtx.toId;});
  if(child&&child.idcard){child.idcard.reportsTo='';child.idcard.manager='';}
  saveNow();renderOrgChart();_orgArrowCtx=null;
}
// detaches the context arrow's child into a root
function orgArrowMakeRoot(){
  G('org-arrow-ctx').style.display='none';
  if(!_orgArrowCtx)return;
  var child=engineers.find(function(e){return e.id===_orgArrowCtx.toId;});
  if(child&&child.idcard){child.idcard.reportsTo='';child.idcard.manager='';}
  saveState();renderOrgChart();_orgArrowCtx=null;
}
// closes the node context menu
function orgCtxClose(){ G('org-ctx-menu').style.display='none'; }
// opens the ID card modal for the context node
function orgCtxEdit(){ orgCtxClose(); if(_orgCtxId)openIdCardModal(_orgCtxId); }
// adds a direct report to the context node
function orgCtxAddReport(){ orgCtxClose(); if(_orgCtxId)orgAddDirectReport(_orgCtxId); }
// detaches the context node into a root
function orgCtxMakeRoot(){
  orgCtxClose();
  var eng=engineers.find(function(e){return e.id===_orgCtxId;});
  if(eng&&eng.idcard){eng.idcard.reportsTo='';eng.idcard.manager='';}
  saveState(); renderOrgChart();
}

// adds a new vacant (open position) root node
function orgAddVacancyRoot(){
  var role=prompt('Open position title (e.g. "Senior Engineer"):','Open Position');
  if(!role||!role.trim())return;
  var newEng={id:nextEngId++,name:role.trim(),monthlyCost:0,
    groupId:null,role:'Open Position',location:'',
    skills:[],vacant:true,
    idcard:{reportsTo:'',manager:'',photo:'',contract:'',seniority:'',
      startdate:'',reviewdate:'',languages:'',aspirations:'',strengths:'',devarea:'',notes:''}};
  engineers.push(newEng);
  saveState();renderOrgChart();
}
// adds a vacant position under the context node
function orgCtxAddVacancy(){
  orgCtxClose();
  var role=prompt('Open position title:','Open Position');
  if(!role||!role.trim())return;
  var newEng={id:nextEngId++,name:role.trim(),monthlyCost:0,
    groupId:null,role:'Open Position',location:'',
    skills:[],vacant:true,
    idcard:{reportsTo:_orgCtxId?String(_orgCtxId):'',manager:'',photo:'',contract:'',
      seniority:'',startdate:'',reviewdate:'',languages:'',aspirations:'',strengths:'',devarea:'',notes:''}};
  engineers.push(newEng);
  if(_orgCtxId)_orgCollapsed[_orgCtxId]=false;
  saveState();renderOrgChart();
}
// deletes the context node and re-parents its reports
function orgCtxDelete(){
  orgCtxClose();
  if(!_orgCtxId)return;
  var eng=engineers.find(function(e){return e.id===_orgCtxId;});
  if(!confirm('Remove '+(eng?eng.name:'this person')+'?\nDirect reports will become root nodes.'))return;
  engineers.forEach(function(e){
    if(String((e.idcard||{}).reportsTo)===String(_orgCtxId))e.idcard.reportsTo='';
  });
  engineers=engineers.filter(function(e){return e.id!==_orgCtxId;});
  allocRows=allocRows.filter(function(r){return r.engId!==_orgCtxId;});
  saveNow(); renderOrgChart();
}

// hides the hover detail card
function orgHideHover(){
  var c=G('org-hover-card');if(c)c.style.display='none';
}
// builds and shows the hover detail card for a person
function orgHover(e,engId){
  if(_orgDragNode&&_orgDragNode.dragging)return;
  var eng=engineers.find(function(x){return x.id===engId;});if(!eng)return;
  var c=eng.idcard||{};
  var col=engGroupColor(eng);
  var grp=engGroups.find(function(g){return g.id===eng.groupId;});
  var mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
  var mgrName=mgr?mgr.name:(c.manager||'—');
  var skills=eng.skills||[];
  var CAT={crit:{col:'#f14335'},diff:{col:'#a78bfa'},mand:{col:'#f1a435'}};
  var domains=[]; skills.forEach(function(s){var d=s.domain||'General';if(!domains.includes(d))domains.push(d);});
  var skillHtml='';
  if(skills.length){
    domains.forEach(function(dom){
      var ds=skills.filter(function(s){return (s.domain||'General')===dom;});
      skillHtml+='<div style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;margin:5px 0 2px">'+escH(dom)+'</div>';
      skillHtml+='<div style="display:flex;flex-wrap:wrap;gap:3px">';
      ds.forEach(function(s){
        var catC=(CAT[s.cat]||{col:'#888'}).col;
        var hasG=s.gaps&&s.gaps.trim();
        skillHtml+='<span style="padding:2px 6px;border-radius:8px;font-size:10px;font-family:IBM Plex Mono,monospace;'
          +'background:'+catC+'18;border:1px solid '+catC+'44;color:'+catC+'">'
          +escH(s.name)+'<sup style="font-size:7px">L'+(s.level||3)+'</sup>'+(hasG?' ⚠':'')+'</span>';
      });
      skillHtml+='</div>';
    });
  } else skillHtml='<span style="font-size:10px;color:#6b6b78">No skills recorded</span>';

  var hasPhoto=(idbGetPhoto(e.id)||c.photo||'').length>10;
  var _ps2=idbGetPhoto(e.id)||c.photo||'';
  var avatarHtml=hasPhoto
    ?'<img src="'+_ps2+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
    :'<span style="font-size:15px;font-weight:bold;color:'+col+'">'+escH(engInitials(eng.name))+'</span>';

  var card=G('org-hover-card');
  card.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">'
    +'<div style="width:42px;height:42px;border-radius:50%;background:'+col+'33;border:2px solid '+col
      +';display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">'+avatarHtml+'</div>'
    +'<div><div style="font-size:13px;font-weight:700;color:var(--text)">'+escH(eng.name)+'</div>'
    +'<div style="font-size:10px;color:#6b6b78">'+escH(eng.role||'')+(grp?' · <span style="color:'+grp.color+'">'+escH(grp.name)+'</span>':'')+'</div></div></div>'
    +(c.seniority?'<div style="font-size:10px;color:#6b6b78;margin-bottom:3px">📊 '+escH(c.seniority)+(c.contract?' · '+escH(c.contract):'')+'</div>':'')
    +(eng.location?'<div style="font-size:10px;color:#6b6b78;margin-bottom:3px">📍 '+escH(eng.location)+'</div>':'')
    +'<div style="font-size:10px;color:#6b6b78;margin-bottom:8px">Reports to: <b style="color:var(--text)">'+escH(mgrName)+'</b></div>'
    +(c.aspirations?'<div style="font-size:10px;color:var(--muted);margin-bottom:6px;font-style:italic">💡 '+escH(c.aspirations.slice(0,80))+(c.aspirations.length>80?'…':'')+'</div>':'')
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:#6b6b78;letter-spacing:.06em;margin-bottom:5px">SKILLS</div>'
    +skillHtml
    +'<div style="margin-top:8px;font-size:9px;color:#3a3a46;text-align:center">Click to edit · Right-click for options</div>';

  card.innerHTML='<button onclick="orgHideHover()" style="position:absolute;top:8px;right:8px;'
    +'background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;'
    +'line-height:1;padding:0" title="Close">&#x2715;</button>'+card.innerHTML;

  var cx=Math.min(e.clientX+16,window.innerWidth-360);
  var cy=Math.max(10,Math.min(e.clientY-10,window.innerHeight-460));
  card.style.left=cx+'px'; card.style.top=cy+'px'; card.style.display='block';
  card._openForId=engId;
}

// builds a standalone high-quality SVG of the chart
function orgBuildExportSVG(){
  var T=buildOrgTree();
  var roots=T.roots, children=T.children, engs=T.engs;
  if(!engs.length)return null;

  var ENW=220, ENH=100;
  var EHGAP=36, EVGAP=104;

  var ePos={};
  var eCounter={v:0};
  function eLevelY(depth){
    var y=0;
    for(var d=0;d<depth;d++){
      var lh=_orgLevelH[d]!==undefined?_orgLevelH[d]:(ENH+EVGAP);
      y+=lh;
    }
    return y;
  }
  function eWalk(node,depth){
    var kids=(children[node.id]||[]);
    if(!kids.length||_orgCollapsed[node.id]){
      var xp={x:eCounter.v*(ENW+EHGAP),y:eLevelY(depth),depth:depth};
      ePos[node.id]=xp;ePos[String(node.id)]=xp;eCounter.v++;return;
    }
    var s2=eCounter.v;
    kids.forEach(function(k){eWalk(k,depth+1);});
    var e2=eCounter.v-1;
    var cp={x:(s2+e2)/2*(ENW+EHGAP),y:eLevelY(depth),depth:depth};
    ePos[node.id]=cp;ePos[String(node.id)]=cp;
  }
  roots.forEach(function(r){eWalk(r,0);});
  Object.keys(_orgPositions).forEach(function(id){
    var xy=_orgPositions[id];if(!xy)return;
    var scale=220/ORG_NW;
    var ep={x:xy.x*scale,y:xy.y*(100+80)/(ORG_NH+ORG_VGAP),depth:ePos[id]?ePos[id].depth:0};
    if(ePos[id])ep=Object.assign({},ePos[id],{x:xy.x*scale,y:xy.y*(180)/(ORG_NH+ORG_VGAP)});
    ePos[id]=ep;ePos[String(id)]=ep;
  });

  var vals=engs.map(function(e){return ePos[e.id];}).filter(Boolean);
  if(!vals.length)return null;
  var minX=Math.min.apply(null,vals.map(function(p){return p.x;}));
  var maxX=Math.max.apply(null,vals.map(function(p){return p.x+ENW;}));
  var maxY=Math.max.apply(null,vals.map(function(p){return p.y+ENH;}));
  var maxD=Math.max.apply(null,vals.map(function(p){return p.depth||0;}));
  var OX=70,OY=80;
  var W=maxX-minX+OX*2+20, H=maxY+OY+80;

  var photoDefs='';
  engs.forEach(function(e){
    var ph=idbGetPhoto(e.id)||(e.idcard||{}).photo||'';
    if(ph.length>10)photoDefs+='<clipPath id="ecp'+e.id+'"><circle cx="20" cy="20" r="20"/></clipPath>';
  });

  var showArrows=_orgShowArrows;

  var s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"'
    +' xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
    +'<defs>'
    +'<filter id="sh" x="-5%" y="-5%" width="110%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.45"/></filter>'
    +(showArrows?'<marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,1 L6,3.5 L0,6 Z" fill="#4a4a5a"/></marker>':'')
    +photoDefs+'</defs>';
  s+='<rect width="'+W+'" height="'+H+'" fill="#0f0f11"/>';
  s+='<g transform="translate('+(OX-minX)+','+OY+')">';

  for(var d=0;d<=maxD;d++){
    var lhE=_orgLevelH[d]!==undefined?_orgLevelH[d]:(ENH+EVGAP);
    var lyE=0;for(var dd=0;dd<d;dd++){lyE+=_orgLevelH[dd]!==undefined?_orgLevelH[dd]:(ENH+EVGAP);}
    lyE-=EVGAP/2;
    s+='<rect x="'+(minX-60)+'" y="'+lyE+'" width="'+(maxX-minX+100)+'" height="'+(ENH+EVGAP)+'"'
      +' fill="rgba(255,255,255,'+(d%2?'0.025':'0.012')+')" rx="0"/>';
    var lbl=(getLevelLabel(d)).toUpperCase();
    s+='<text x="'+(minX-54)+'" y="'+(lyE+18)+'" font-size="9" fill="#3a3a4a" font-weight="bold">'+escH(lbl)+'</text>';
    s+='<text x="'+(minX-54)+'" y="'+(lyE+30)+'" font-size="8" fill="#2a2a34">L'+d+'</text>';
  }

  if(showArrows){
    engs.forEach(function(e){
      var raw=(e.idcard||{}).reportsTo;if(!raw)return;
      var pe=ePos[e.id],pp=ePos[raw]||ePos[+raw];if(!pe||!pp)return;
      var x1=pp.x+ENW/2,y1=pp.y+ENH,x2=pe.x+ENW/2,y2=pe.y,my=(y1+y2)/2;
      s+='<path d="M'+x1+','+y1+' C'+x1+','+my+' '+x2+','+my+' '+x2+','+y2+'"'
        +' fill="none" stroke="#3a3a50" stroke-width="2" marker-end="url(#arr)"/>';
    });
  }

  // Detailed mode: nine-box cell lookup (label/colors/box) keyed by placement key
  var _nbByKeyE=null;
  if(_orgDetailMode&&typeof _nbCells==='function'){
    _nbByKeyE={};
    _nbCells().forEach(function(cc){_nbByKeyE[cc.key]=cc;});
  }

  engs.forEach(function(e){
    var p=ePos[e.id];if(!p)return;
    var c=e.idcard||{};
    var col=engGroupColor(e);
    var initials=engInitials(e.name);
    var _ps3=idbGetPhoto(e.id)||(c.photo||'');
    var hasPhoto=_ps3.length>10;
    var grp=engGroups.find(function(g){return g.id===e.groupId;});
    var depthN=p.depth||0;
    var isVacant=e.vacant===true;
    var vacCol='#f1a435';

    var nameS=e.name.length>26?e.name.slice(0,25)+'…':e.name;
    var roleS=(e.role||'').length>30?(e.role||'').slice(0,29)+'…':(e.role||'');
    var locS=(e.location||c.location||'').length>28?(e.location||c.location||'').slice(0,27)+'…':(e.location||c.location||'');
    var senS=(c.seniority||'').length>26?(c.seniority||'').slice(0,25)+'…':(c.seniority||'');
    var skillN=(e.skills||[]).length;
    var kidsN=(children[e.id]||[]).length;

    var AX=ENW/2, AY=32;

    s+='<g transform="translate('+p.x+','+p.y+')">';

    if(isVacant){
      s+='<rect x="0" y="0" width="'+ENW+'" height="'+ENH+'" rx="9" fill="rgba(241,164,53,0.06)" stroke="'+vacCol+'" stroke-width="1.5" stroke-dasharray="6,4" filter="url(#sh)"/>';
      s+='<rect x="0" y="0" width="'+ENW+'" height="5" rx="4" fill="rgba(241,164,53,0.3)"/>';
    } else {
      s+='<rect x="0" y="0" width="'+ENW+'" height="'+ENH+'" rx="9" fill="#18181c" stroke="'+col+'" stroke-width="1.8" filter="url(#sh)"/>';
      s+='<rect x="0" y="0" width="'+ENW+'" height="6" rx="5" fill="'+col+'"/>';
      s+='<rect x="0" y="3" width="'+ENW+'" height="3" fill="'+col+'"/>';
    }

    s+='<rect x="5" y="9" width="24" height="13" rx="3" fill="'+col+'28"/>';
    s+='<text x="17" y="19" text-anchor="middle" font-size="8.5" fill="'+col+'" font-weight="bold">L'+depthN+'</text>';

    if(grp){
      var gl=grp.name.length>10?grp.name.slice(0,9)+'…':grp.name;
      s+='<rect x="'+(ENW-42)+'" y="9" width="37" height="13" rx="3" fill="'+grp.color+'28"/>';
      s+='<text x="'+(ENW-23)+'" y="19" text-anchor="middle" font-size="8" fill="'+grp.color+'">'+escH(gl)+'</text>';
    }

    if(isVacant){
      s+='<circle cx="'+AX+'" cy="'+AY+'" r="20" fill="rgba(241,164,53,0.08)" stroke="'+vacCol+'" stroke-width="1.5" stroke-dasharray="4,3"/>';
      s+='<text x="'+AX+'" y="'+(AY+7)+'" text-anchor="middle" font-size="22" fill="'+vacCol+'">?</text>';
    } else if(hasPhoto){
      s+='<image href="'+_ps3+'" xlink:href="'+_ps3+'"'
        +' x="'+(AX-20)+'" y="'+(AY-20)+'" width="40" height="40"'
        +' style="clip-path:circle(20px at 20px 20px)"'
        +' preserveAspectRatio="xMidYMid slice"/>';
      s+='<circle cx="'+AX+'" cy="'+AY+'" r="20" fill="none" stroke="'+col+'" stroke-width="1.8"/>';
    } else {
      s+='<circle cx="'+AX+'" cy="'+AY+'" r="20" fill="'+col+'44" stroke="'+col+'" stroke-width="1.8"/>';
      s+='<text x="'+AX+'" y="'+(AY+6)+'" text-anchor="middle" font-size="14" font-weight="bold" fill="'+col+'">'+escH(initials)+'</text>';
    }

    s+='<text x="'+AX+'" y="62" text-anchor="middle" font-size="11.5" font-weight="bold" fill="#e8e8ea">'+escH(nameS)+'</text>';
    if(roleS)s+='<text x="'+AX+'" y="75" text-anchor="middle" font-size="9.5" fill="#9a9aaa">'+escH(roleS)+'</text>';

    var meta=[];
    if(locS)meta.push('📍 '+locS);
    if(senS)meta.push(senS);
    if(meta.length){
      var metaStr=meta.join('  ·  ');
      if(metaStr.length>34)metaStr=metaStr.slice(0,33)+'…';
      s+='<text x="'+AX+'" y="88" text-anchor="middle" font-size="8.5" fill="#6b6b78">'+escH(metaStr)+'</text>';
    }

    if(skillN&&!isVacant){
      s+='<rect x="'+(ENW-32)+'" y="'+(ENH-18)+'" width="27" height="13" rx="6" fill="'+col+'28"/>';
      s+='<text x="'+(ENW-18)+'" y="'+(ENH-8)+'" text-anchor="middle" font-size="8.5" fill="'+col+'">'+skillN+' sk</text>';
    }

    if(kidsN){
      s+='<circle cx="'+(ENW/2)+'" cy="'+ENH+'" r="10" fill="#18181c" stroke="'+col+'" stroke-width="1.5"/>';
      s+='<text x="'+(ENW/2)+'" y="'+(ENH+4)+'" text-anchor="middle" font-size="9" fill="'+col+'">'+kidsN+'</text>';
    }

    // Detailed mode: nine-box rating chip + recommended next move (matches on-screen view)
    if(_orgDetailMode&&!isVacant){
      var nbKeyE=_nineBoxPlacements?_nineBoxPlacements[e.id]:null;
      var nbCellE=(_nbByKeyE&&nbKeyE)?_nbByKeyE[nbKeyE]:null;
      var ratFillE=nbCellE?nbCellE.colorSolid:'#1a1a1e';
      var ratColE=nbCellE?nbCellE.badge:'#6b6b78';
      var ratTxtE=nbCellE?nbCellE.label:'NOT RATED';
      if(ratTxtE.length>30)ratTxtE=ratTxtE.slice(0,29)+'…';
      var ryE=ENH+12;
      s+='<rect x="0" y="'+ryE+'" width="'+ENW+'" height="20" rx="5"'
        +' fill="'+ratFillE+'" stroke="'+ratColE+'" stroke-width="1"/>';
      if(nbCellE){
        s+='<rect x="4" y="'+(ryE+3)+'" width="14" height="14" rx="3" fill="'+ratColE+'"/>';
        s+='<text x="11" y="'+(ryE+13.5)+'" text-anchor="middle" font-size="10" font-weight="bold"'
          +' fill="#0f0f11">'+nbCellE.box+'</text>';
        s+='<text x="24" y="'+(ryE+14)+'" font-size="9.5" font-weight="bold" fill="'+ratColE+'">'+escH(ratTxtE)+'</text>';
      } else {
        s+='<circle cx="11" cy="'+(ryE+10)+'" r="4" fill="'+ratColE+'"/>';
        s+='<text x="20" y="'+(ryE+14)+'" font-size="9.5" font-weight="bold" fill="'+ratColE+'">'+escH(ratTxtE)+'</text>';
      }
      var nmE=c.nextMove||{};
      if(nmE.show&&(nmE.position||'').trim()){
        var posTxtE='→ '+nmE.position;
        if(posTxtE.length>38)posTxtE=posTxtE.slice(0,37)+'…';
        var myE=ryE+24;
        s+='<rect x="0" y="'+myE+'" width="'+ENW+'" height="20" rx="5"'
          +' fill="rgba(91,229,200,0.10)" stroke="#5be5c8" stroke-width="1"/>';
        s+='<text x="8" y="'+(myE+14)+'" font-size="9.5" fill="#5be5c8">'+escH(posTxtE)+'</text>';
        var tlTxtE=(nmE.timeline||'').trim();
        if(tlTxtE){
          if(tlTxtE.length>38)tlTxtE=tlTxtE.slice(0,37)+'…';
          var myE2=myE+24;
          s+='<rect x="0" y="'+myE2+'" width="'+ENW+'" height="20" rx="5"'
            +' fill="rgba(91,229,200,0.06)" stroke="#5be5c8" stroke-width="1"/>';
          s+='<text x="8" y="'+(myE2+14)+'" font-size="9.5" fill="#5be5c8">'+escH('⏱ '+tlTxtE)+'</text>';
        }
      }
    }

    s+='</g>';
  });

  s+='</g></svg>';
  return {svgStr:s,W:W,H:H};
}

// toggles the headcount KPI side panel
function orgToggleKPI(){
  _orgKpiOpen=!_orgKpiOpen;
  var panel=G('org-kpi-panel');
  var btn=G('org-kpi-btn');
  if(!panel)return;
  panel.style.display=_orgKpiOpen?'flex':'none';
  if(btn){btn.style.borderColor=_orgKpiOpen?'var(--accent)':'';btn.style.color=_orgKpiOpen?'var(--accent)':'';}
  if(_orgKpiOpen)orgRenderKPI();
}
// renders the headcount KPI panel
function orgRenderKPI(){
  var panel=G('org-kpi-panel');if(!panel)return;
  var T=buildOrgTree();
  var engs=T.engs;
  // planning resources are excluded from all headcount KPIs (consistent with the cost dashboard)
  var allEngs=engineers.filter(function(e){return !e.planningOnly;});
  var planningCount=engineers.filter(function(e){return e.planningOnly;}).length;
  var vacants=allEngs.filter(function(e){return e.vacant;});
  var active=allEngs.filter(function(e){return !e.vacant;});

  var bySeniority={};
  allEngs.forEach(function(e){
    var s=(e.idcard&&e.idcard.seniority)||'Not set';
    if(!bySeniority[s])bySeniority[s]={count:0,vacancies:0};
    if(e.vacant)bySeniority[s].vacancies++;
    else bySeniority[s].count++;
  });
  var pos=orgLayout(T.roots,T.children);

  // female / male ratio across permanent resources only
  var permActive=active.filter(function(e){return ((e.idcard&&e.idcard.contract)||'')==='Permanent';});
  var permF=0,permM=0;
  permActive.forEach(function(e){
    var g=(e.idcard&&e.idcard.gender)||'';
    if(g==='F')permF++;
    else if(g==='M')permM++;
  });
  var permKnown=permF+permM;

  var byGroup={};
  allEngs.forEach(function(e){
    var g=engGroups.find(function(g){return g.id===e.groupId;});
    var k=g?g.name:'Ungrouped';
    if(!byGroup[k])byGroup[k]={color:g?g.color:'#6b6b78',count:0,vacancies:0};
    if(e.vacant)byGroup[k].vacancies++;
    else byGroup[k].count++;
  });

  var byLoc={};
  active.forEach(function(e){
    var l=e.location||'Unknown';
    byLoc[l]=(byLoc[l]||0)+1;
  });

  var h='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--accent);letter-spacing:.06em;margin-bottom:10px;display:flex;align-items:center;gap:6px">📊 HEADCOUNT'
    +'<button onclick="orgToggleKPI()" style="margin-left:auto;background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px">✕</button></div>';

  h+='<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">'
    +'<div style="font-size:22px;font-weight:700;color:var(--accent)">'+active.length+'</div>'
    +'<div style="font-size:10px;color:var(--muted);font-family:\'IBM Plex Mono\',monospace">TOTAL HEADCOUNT</div>'
    +(vacants.length?'<div style="font-size:10px;color:#f1a435;margin-top:4px">◻ '+vacants.length+' open position'+(vacants.length>1?'s':'')+'</div>':'')
    +(planningCount?'<div style="font-size:10px;color:var(--muted);margin-top:4px">⊘ excl. '+planningCount+' planning resource'+(planningCount>1?'s':'')+'</div>':'')
    +'</div>';

  if(permActive.length){
    var femPct=permKnown?Math.round(permF/permKnown*100):0;
    var malePct=permKnown?100-femPct:0;
    var ratioStr;
    if(!permKnown)ratioStr='—';
    else if(!permF)ratioStr='0 : '+permM;
    else if(!permM)ratioStr=permF+' : 0';
    else ratioStr='1 : '+(Math.round(permM/permF*100)/100);
    h+='<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">'
      +'<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-bottom:6px">⚥ F / M RATIO · PERMANENT</div>'
      +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">'
      +'<span style="color:#f472b6">♀ Female</span>'
      +'<span style="color:var(--text);font-weight:700">'+permF+' <span style="color:var(--muted);font-weight:400">('+femPct+'%)</span></span></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px">'
      +'<span style="color:#60a5fa">♂ Male</span>'
      +'<span style="color:var(--text);font-weight:700">'+permM+' <span style="color:var(--muted);font-weight:400">('+malePct+'%)</span></span></div>'
      +'<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--border)">'
      +(femPct?'<div style="width:'+femPct+'%;background:#f472b6"></div>':'')
      +(malePct?'<div style="width:'+malePct+'%;background:#60a5fa"></div>':'')
      +'</div>'
      +'<div style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--accent);margin-top:6px;text-align:center">F : M = '+ratioStr+'</div>'
      +'<div style="font-size:9px;color:var(--muted);margin-top:3px;text-align:center">'+permActive.length+' permanent'+(permKnown<permActive.length?' · '+(permActive.length-permKnown)+' undisclosed':'')+'</div>'
      +'</div>';
  }

  var SENIORITY_ORDER2=['Junior','Mid-level','Senior','Staff','Principal',
    'Tech Lead','Principal Tech Lead','Distinguished Engineer','Fellow',
    'Team Lead','Engineering Manager','Senior Manager','Director',
    'Senior Director','VP Engineering','CTO'];
  var senKeys=Object.keys(bySeniority).sort(function(a,b){
    var ai=SENIORITY_ORDER2.indexOf(a),bi=SENIORITY_ORDER2.indexOf(b);
    if(ai>=0&&bi>=0)return ai-bi;
    if(ai>=0)return -1;if(bi>=0)return 1;
    return a.localeCompare(b);
  });
  if(senKeys.length){
    h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-bottom:5px">BY SENIORITY</div>';
    senKeys.forEach(function(sn){
      var sv=bySeniority[sn];
      var pct=active.length?Math.round(sv.count/active.length*100):0;
      var snCol='var(--accent2)';
      if(['Tech Lead','Principal Tech Lead','Distinguished Engineer','Fellow'].indexOf(sn)>=0)snCol='var(--accent)';
      if(['Team Lead','Engineering Manager','Senior Manager','Director','Senior Director','VP Engineering','CTO'].indexOf(sn)>=0)snCol='#a78bfa';
      if(sn==='Not set')snCol='var(--muted)';
      h+='<div style="margin-bottom:4px">'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">'
        +'<span style="color:'+snCol+'">'+escH(sn)+'</span>'
        +'<span style="font-weight:700;color:var(--text)">'+sv.count+(sv.vacancies?' <span style="color:#f1a435">+'+sv.vacancies+'◻</span>':'')+'</span></div>'
        +'<div style="background:var(--border);border-radius:2px;height:4px">'
        +'<div style="background:'+snCol+';width:'+pct+'%;height:4px;border-radius:2px"></div></div></div>';
    });
  }

  h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin:10px 0 5px">BY GROUP</div>';
  Object.entries(byGroup).sort(function(a,b){return b[1].count-a[1].count;}).forEach(function(entry){
    var k=entry[0],v=entry[1];
    var pct2=active.length?Math.round(v.count/active.length*100):0;
    h+='<div style="margin-bottom:4px">'
      +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">'
      +'<span style="color:'+v.color+'">'+escH(k)+'</span>'
      +'<span style="color:var(--text)">'+v.count+(v.vacancies?' <span style="color:#f1a435">+'+v.vacancies+'◻</span>':'')+'</span></div>'
      +'<div style="background:var(--border);border-radius:2px;height:4px">'
      +'<div style="background:'+v.color+';width:'+pct2+'%;height:4px;border-radius:2px"></div></div></div>';
  });

  var locEntries=Object.entries(byLoc).sort(function(a,b){return b[1]-a[1];});
  if(locEntries.length){
    h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin:10px 0 5px">BY LOCATION</div>';
    locEntries.forEach(function(entry){
      var l=entry[0],n=entry[1];
      var pct3=active.length?Math.round(n/active.length*100):0;
      h+='<div style="margin-bottom:4px">'
        +'<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">'
        +'<span style="color:var(--text)">'+escH(l)+'</span>'
        +'<span style="color:var(--text)">'+n+' <span style="color:var(--muted)">('+pct3+'%)</span></span></div>'
        +'<div style="background:var(--border);border-radius:2px;height:4px">'
        +'<div style="background:var(--accent2);width:'+pct3+'%;height:4px;border-radius:2px"></div></div></div>';
    });
  }

  if(vacants.length){
    h+='<div style="font-family:\'IBM Plex Mono\',monospace;font-size:9px;color:#f1a435;letter-spacing:.06em;margin:10px 0 5px">◻ OPEN POSITIONS</div>';
    vacants.forEach(function(v){
      var mgr=v.idcard&&v.idcard.reportsTo?engineers.find(function(e){return String(e.id)===String(v.idcard.reportsTo);}):null;
      h+='<div style="background:rgba(241,164,53,0.06);border:1px solid rgba(241,164,53,0.2);border-radius:4px;padding:6px 8px;margin-bottom:4px">'
        +'<div style="font-size:11px;font-weight:600;color:#f1a435">'+escH(v.name)+'</div>'
        +(mgr?'<div style="font-size:10px;color:var(--muted)">Reports to: '+escH(mgr.name)+'</div>':'')
        +'</div>';
    });
  }

  panel.innerHTML=h;
}

// downloads the chart as an SVG file
function orgExportSVG(){
  var res=orgBuildExportSVG();if(!res){alert('No data to export.');return;}
  var blob=new Blob([res.svgStr],{type:'image/svg+xml;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='org_chart.svg';a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
}
// renders and downloads the chart as a high-res PNG
function orgExportPNG(){
  var res=orgBuildExportSVG();if(!res){alert('No data to export.');return;}

  var LONG_EDGE=4000;
  var naturalLong=Math.max(res.W,res.H);
  var scale=Math.max(2, Math.min(8, LONG_EDGE/naturalLong));
  var pw=Math.round(res.W*scale), ph=Math.round(res.H*scale);

  var hiResSVG=res.svgStr
    .replace(/^<svg width="[^"]*" height="[^"]*"/,
             '<svg width="'+pw+'" height="'+ph+'"');

  var canvas=document.createElement('canvas');
  canvas.width=pw; canvas.height=ph;
  var ctx=canvas.getContext('2d');

  ctx.fillStyle='#0f0f11';
  ctx.fillRect(0,0,pw,ph);

  var encoded='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(hiResSVG);

  var img=new Image();
  img.onload=function(){
    ctx.drawImage(img,0,0);
    canvas.toBlob(function(blob){
      if(!blob){alert('PNG generation failed. Try SVG export instead.');return;}
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='org_chart_'+pw+'x'+ph+'.png';
      a.click();
      setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
    },'image/png');
  };
  img.onerror=function(){
    try{
      var b64='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(hiResSVG)));
      img.onerror=function(){alert('PNG export failed. Use SVG export instead.');};
      img.src=b64;
    }catch(e){alert('PNG export failed: '+e.message+'. Use SVG export instead.');}
  };
  img.src=encoded;
}
