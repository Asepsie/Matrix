/* ►► SECTION: MATRIX ◄◄ Portfolio matrix render engine: axes, scale, zoom, Y-mode, canvas
 *
 * Functions defined in this file:
 *   quadrants        — returns the active quadrant config for the current Y-mode
 *   getProjY         — returns a project's Y value for the current Y-mode
 *   axX              — reads the X-axis config (name/min/max/scale) from inputs
 *   axY              — reads the Y-axis config (name/min/max/scale) for the current Y-mode
 *   eaxX             — effective X-axis after applying pan/zoom
 *   eaxY             — effective Y-axis after applying pan/zoom
 *   svgX             — maps a data X value to an SVG pixel X
 *   svgY             — maps a data Y value to an SVG pixel Y
 *   datX             — maps an SVG pixel X back to a data X value
 *   datY             — maps an SVG pixel Y back to a data Y value
 *   clamp            — clamps a number between min and max
 *   setScale         — toggles an axis between linear/log and re-renders
 *   onAxisChange     — applies axis-name/label changes and re-renders
 *   onSepInput       — updates a quadrant separator value from its input
 *   setYMode         — switches the Y-axis mode with an animated transition
 *   startYTransition — runs the animated dot transition between Y-modes
 *   resetZoom        — resets pan/zoom and re-renders
 *   onWheel          — mouse-wheel zoom centred on the cursor
 *   render           — renders the matrix at current size (no animation)
 *   renderWithAnim   — builds and injects the full matrix SVG (dots, labels, quadrants, focus star)
 */

// returns the active quadrant config for the current Y-mode
function quadrants(){ return quadrantsByMode[yMode]||quadrantsByMode.impact; }

// returns a project's Y value for the current Y-mode
function getProjY(p){
  if(yMode==='visibility') return p.vis??5;
  if(yMode==='enabler')    return p.ena??5;
  return p.y;
}

// reads the X-axis config (name/min/max/scale) from inputs
function axX(){return{name:V('ax-x-name')||'X',min:+V('ax-x-min')||0,max:+V('ax-x-max')||10,scale:scaleX};}
// reads the Y-axis config (name/min/max/scale) for the current Y-mode
function axY(){return{name:Y_LABELS[yMode],min:+V('ax-y-min')||0,max:+V('ax-y-max')||10,scale:scaleY};}
// effective X-axis after applying pan/zoom
function eaxX(){const ax=axX(),s=ax.max-ax.min;return{...ax,min:ax.min+zoom.panX,max:ax.min+zoom.panX+s/zoom.scaleX};}
// effective Y-axis after applying pan/zoom
function eaxY(){const ay=axY(),s=ay.max-ay.min;return{...ay,min:ay.min+zoom.panY,max:ay.min+zoom.panY+s/zoom.scaleY};}

// maps a data X value to an SVG pixel X
function svgX(v,ax,pw){
  if(ax.scale==='log'){const lo=Math.log10(Math.max(ax.min,1e-9)),hi=Math.log10(Math.max(ax.max,1e-9));return PAD.l+(Math.log10(Math.max(v,1e-9))-lo)/(hi-lo)*pw;}
  return PAD.l+(v-ax.min)/(ax.max-ax.min)*pw;
}
// maps a data Y value to an SVG pixel Y
function svgY(v,ay,ph){
  if(ay.scale==='log'){const lo=Math.log10(Math.max(ay.min,1e-9)),hi=Math.log10(Math.max(ay.max,1e-9));return PAD.t+(1-(Math.log10(Math.max(v,1e-9))-lo)/(hi-lo))*ph;}
  return PAD.t+(1-(v-ay.min)/(ay.max-ay.min))*ph;
}
// maps an SVG pixel X back to a data X value
function datX(px,ax,pw){const t=(px-PAD.l)/pw;if(ax.scale==='log'){const lo=Math.log10(Math.max(ax.min,1e-9)),hi=Math.log10(Math.max(ax.max,1e-9));return Math.pow(10,lo+t*(hi-lo));}return ax.min+t*(ax.max-ax.min);}
// maps an SVG pixel Y back to a data Y value
function datY(py,ay,ph){const t=1-(py-PAD.t)/ph;if(ay.scale==='log'){const lo=Math.log10(Math.max(ay.min,1e-9)),hi=Math.log10(Math.max(ay.max,1e-9));return Math.pow(10,lo+t*(hi-lo));}return ay.min+t*(ay.max-ay.min);}
// clamps a number between min and max
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}

// toggles an axis between linear/log and re-renders
function setScale(axis,mode){
  if(axis==='x')scaleX=mode;else scaleY=mode;
  G('btn-x-lin').classList.toggle('active',scaleX==='lin');
  G('btn-x-log').classList.toggle('active',scaleX==='log');
  G('btn-y-lin').classList.toggle('active',scaleY==='lin');
  G('btn-y-log').classList.toggle('active',scaleY==='log');
  render();saveState();
}
// applies axis-name/label changes and re-renders
function onAxisChange(){
  G('x-label').textContent=(V('ax-x-name')||'X').toUpperCase();
  G('y-label').textContent=Y_LABELS[yMode];
  updateEditorLabels();render();saveState();
}
// updates a quadrant separator value from its input
function onSepInput(axis){
  if(axis==='x')sepX=parseFloat(V('sep-x-val'))||sepX;
  else          sepY=parseFloat(V('sep-y-val'))||sepY;
  render();saveState();
}

// switches the Y-axis mode with an animated transition
function setYMode(mode){
  if(mode===yMode)return;

  // Snapshot current SVG positions for all visible projects
  const cont=G('svg-container'),svg=G('matrix-svg');
  const W=cont.clientWidth,H=cont.clientHeight;
  const ax=eaxX(),ay=eaxY();
  const pw=W-PAD.l-PAD.r,ph=H-PAD.t-PAD.b;

  projects.forEach(p=>{
    if(!p.visible)return;
    animPos[p.id]={
      cx:svgX(p.x,ax,pw),
      cy:svgY(getProjY(p),ay,ph)
    };
  });

  yMode=mode;
  // Update buttons
  ['impact','visibility','enabler'].forEach(m=>{
    G('ym-'+m).classList.toggle('active',m===mode);
  });
  G('y-label').textContent=Y_LABELS[mode];
  if(selId)updateEditorLabels();

  // Kick off animated transition
  startYTransition(W,H,pw,ph);
  saveState();
}

// runs the animated dot transition between Y-modes
function startYTransition(W,H,pw,ph){
  const DURATION=2000;
  const start=performance.now();
  const ax=eaxX(),ay=eaxY();

  // Compute target positions
  const targets={};
  projects.forEach(p=>{
    if(!p.visible)return;
    targets[p.id]={
      cx:svgX(p.x,ax,pw),
      cy:svgY(getProjY(p),ay,ph)
    };
  });

  clearInterval(animTimer);
  animTimer=setInterval(()=>{
    const t=Math.min((performance.now()-start)/DURATION,1);
    const ease=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; // ease-in-out quad

    projects.forEach(p=>{
      if(!p.visible||!animPos[p.id]||!targets[p.id])return;
      const from=animPos[p.id],to=targets[p.id];
      animPos[p.id]={
        cx:from.cx+(to.cx-from.cx)*ease,
        cy:from.cy+(to.cy-from.cy)*ease
      };
    });

    renderWithAnim(W,H,pw,ph,t<1);
    if(t>=1){
      clearInterval(animTimer);
      animTimer=null;
      animPos={};
      render();
    }
  },16);
}

// resets pan/zoom and re-renders
function resetZoom(){zoom={scaleX:1,scaleY:1,panX:0,panY:0};render();saveState();}
// mouse-wheel zoom centred on the cursor
function onWheel(e){
  e.preventDefault();
  const svg=G('matrix-svg'),rect=svg.getBoundingClientRect();
  const ax=axX(),ay=axY();
  const pw=rect.width-PAD.l-PAD.r,ph=rect.height-PAD.t-PAD.b;
  const eax=eaxX(),eay=eaxY();
  const mx=e.clientX-rect.left,my=e.clientY-rect.top;
  const factor=e.deltaY<0?1.15:1/1.15;
  const newSX=clamp(zoom.scaleX*factor,0.5,20);
  const newSY=clamp(zoom.scaleY*factor,0.5,20);
  const tx=(mx-PAD.l)/pw,ty=1-(my-PAD.t)/ph;
  const dvx=datX(mx,eax,pw),dvy=datY(my,eay,ph);
  zoom.panX=dvx-tx*(ax.max-ax.min)/newSX-ax.min;
  zoom.panY=dvy-ty*(ay.max-ay.min)/newSY-ay.min;
  zoom.scaleX=newSX;zoom.scaleY=newSY;
  render();
}

// renders the matrix at current size (no animation)
function render(){
  const cont=G('svg-container'),svg=G('matrix-svg');
  if(!cont||!svg)return;
  const W=cont.clientWidth,H=cont.clientHeight;
  if(W<50||H<50)return;
  const pw=W-PAD.l-PAD.r,ph=H-PAD.t-PAD.b;
  renderWithAnim(W,H,pw,ph,false);
}

// builds and injects the full matrix SVG (dots, labels, quadrants, focus star)
function renderWithAnim(W,H,pw,ph,isAnim){
  const svg=G('matrix-svg');
  svg.setAttribute('width',W);svg.setAttribute('height',H);
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);

  const ax=eaxX(),ay=eaxY();
  const baseAx=axX(),baseAy=axY();
  const grid=parseInt(V('ax-grid'))||5;
  const cSepX=clamp(sepX,baseAx.min,baseAx.max),cSepY=clamp(sepY,baseAy.min,baseAy.max);
  const sxPx=svgX(cSepX,ax,pw),syPx=svgY(cSepY,ay,ph);
  const q={};quadrants().forEach(qq=>q[qq.key]=qq);

  let h=`<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${V('draw-color')||'#c8f135'}"/></marker></defs>`;

  // Quadrant fills
  const qx1=PAD.l,qx2=PAD.l+pw,qy1=PAD.t,qy2=PAD.t+ph;
  const sx=clamp(sxPx,qx1,qx2),sy=clamp(syPx,qy1,qy2);
  h+=`<rect x="${qx1}" y="${qy1}" width="${sx-qx1}"  height="${sy-qy1}"  fill="${q.tl.color}"/>`;
  h+=`<rect x="${sx}"  y="${qy1}" width="${qx2-sx}"   height="${sy-qy1}"  fill="${q.tr.color}"/>`;
  h+=`<rect x="${qx1}" y="${sy}"  width="${sx-qx1}"  height="${qy2-sy}"  fill="${q.bl.color}"/>`;
  h+=`<rect x="${sx}"  y="${sy}"  width="${qx2-sx}"   height="${qy2-sy}"  fill="${q.br.color}"/>`;

  const ql=(t,x,y)=>`<text font-family="IBM Plex Sans,sans-serif" font-size="10" fill="#6b6b78" text-anchor="middle" x="${x}" y="${y}">${escH(t)}</text>`;
  h+=ql(q.tl.label,qx1+(sx-qx1)/2,qy1+14);
  h+=ql(q.tr.label,sx+(qx2-sx)/2,  qy1+14);
  h+=ql(q.bl.label,qx1+(sx-qx1)/2,sy+14);
  h+=ql(q.br.label,sx+(qx2-sx)/2,  sy+14);

  // Grid
  for(let i=0;i<=grid;i++){
    let xv,yv;
    if(ax.scale==='log'){const lo=Math.log10(Math.max(ax.min,1e-9)),hi=Math.log10(Math.max(ax.max,1e-9));xv=Math.pow(10,lo+i/grid*(hi-lo));}
    else xv=ax.min+i/grid*(ax.max-ax.min);
    if(ay.scale==='log'){const lo=Math.log10(Math.max(ay.min,1e-9)),hi=Math.log10(Math.max(ay.max,1e-9));yv=Math.pow(10,lo+i/grid*(hi-lo));}
    else yv=ay.min+i/grid*(ay.max-ay.min);
    const sxx=svgX(xv,ax,pw),syy=svgY(yv,ay,ph);
    if(sxx>=PAD.l-1&&sxx<=PAD.l+pw+1){
      h+=`<line stroke="#2a2a32" stroke-width=".5" x1="${sxx}" y1="${PAD.t}" x2="${sxx}" y2="${PAD.t+ph}"/>`;
      h+=`<text font-family="IBM Plex Mono,monospace" font-size="9" fill="#6b6b78" text-anchor="middle" x="${sxx}" y="${PAD.t+ph+11}">${+xv.toFixed(ax.scale==='log'?3:1)}</text>`;
    }
    if(syy>=PAD.t-1&&syy<=PAD.t+ph+1){
      h+=`<line stroke="#2a2a32" stroke-width=".5" x1="${PAD.l}" y1="${syy}" x2="${PAD.l+pw}" y2="${syy}"/>`;
      h+=`<text font-family="IBM Plex Mono,monospace" font-size="9" fill="#6b6b78" text-anchor="end" dominant-baseline="middle" x="${PAD.l-4}" y="${syy}">${+yv.toFixed(ay.scale==='log'?3:1)}</text>`;
    }
  }

  h+=`<line stroke="#3a3a46" stroke-width="1.5" x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t+ph}"/>`;
  h+=`<line stroke="#3a3a46" stroke-width="1.5" x1="${PAD.l}" y1="${PAD.t+ph}" x2="${PAD.l+pw}" y2="${PAD.t+ph}"/>`;

  // Separators
  h+=`<g data-sep="x" style="cursor:ew-resize" onmousedown="startSepDrag(event,'x')">
    <rect x="${sxPx-6}" y="${PAD.t}" width="12" height="${ph}" fill="transparent"/>
    <line x1="${sxPx}" y1="${PAD.t}" x2="${sxPx}" y2="${PAD.t+ph}" stroke="#5be5c8" stroke-width="1.5" stroke-dasharray="5,3"/>
    <circle cx="${sxPx}" cy="${PAD.t+ph/2}" r="7" fill="#18181c" stroke="#5be5c8" stroke-width="1.5"/>
    <text x="${sxPx}" y="${PAD.t+ph/2+1}" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="#5be5c8">⇔</text>
  </g>`;
  h+=`<g data-sep="y" style="cursor:ns-resize" onmousedown="startSepDrag(event,'y')">
    <rect x="${PAD.l}" y="${syPx-6}" width="${pw}" height="12" fill="transparent"/>
    <line x1="${PAD.l}" y1="${syPx}" x2="${PAD.l+pw}" y2="${syPx}" stroke="#5be5c8" stroke-width="1.5" stroke-dasharray="5,3"/>
    <circle cx="${PAD.l+pw/2}" cy="${syPx}" r="7" fill="#18181c" stroke="#5be5c8" stroke-width="1.5"/>
    <text x="${PAD.l+pw/2}" y="${syPx+1}" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="#5be5c8">⇕</text>
  </g>`;

  // Annotations
  const allAnnot=drawPreview?[...annotations,drawPreview]:annotations;
  for(const a of allAnnot){
    const ax1=svgX(a.x1,ax,pw),ay1=svgY(a.y1,ay,ph),ax2=svgX(a.x2,ax,pw),ay2=svgY(a.y2,ay,ph);
    const col=a.color||'#c8f135';
    if(a.type==='text'){
      h+=`<text x="${ax1}" y="${ay1}" font-family="IBM Plex Sans,sans-serif" font-size="12" fill="${col}" style="cursor:pointer" onclick="deleteAnnotation(${a.id})">${escH(a.text||'')}</text>`;
    } else {
      const dash=a.type==='dash'?'stroke-dasharray="6,4"':'';
      const marker=a.type==='arrow'?'marker-end="url(#arr)"':'';
      h+=`<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="${col}" stroke-width="1.8" ${dash} ${marker} style="cursor:pointer" onclick="deleteAnnotation(${a.id})"/>`;
    }
  }

  // ── Project nodes: label-box-aware radial fan-out ──
  // Step 1: compute raw dot positions + estimated label bounding boxes
  const FONT_W=6.2, FONT_H=11, DOT_R=12;
  const nodeData = projects.filter(p=>p.visible).map(p=>{
    let cx,cy;
    if(isAnim&&animPos[p.id]){ cx=animPos[p.id].cx; cy=animPos[p.id].cy; }
    else { cx=svgX(p.x,ax,pw); cy=svgY(getProjY(p),ay,ph); }
    const lbl=p.name.length>22?p.name.slice(0,21)+'…':p.name;
    // Default label position: centered above dot
    const lw=lbl.length*FONT_W, lh=FONT_H;
    const dlx=cx-lw/2, dly=cy-DOT_R-6-lh; // top-left of default label box
    return {p,cx,cy,lbl,lw,lh,dlx,dly};
  });

  // Step 2: detect label-box collisions (not just dot overlap).
  // Two labels collide if their bounding boxes overlap with a small padding.
  const PAD_LBL=6; // extra px padding around each label box
  function boxesOverlap(ax,ay,aw,ah, bx,by,bw,bh){
    return ax-PAD_LBL < bx+bw+PAD_LBL && ax+aw+PAD_LBL > bx-PAD_LBL &&
           ay-PAD_LBL < by+bh+PAD_LBL && ay+ah+PAD_LBL > by-PAD_LBL;
  }

  // Union-Find grouping by label box overlap (transitive: A-B and B-C → one group)
  const parent=new Map(nodeData.map(n=>[n.p.id,n.p.id]));
  function find(id){let r=parent.get(id);while(r!==parent.get(r))r=parent.get(parent.get(r));return r;}
  function unite(a,b){parent.set(find(a),find(b));}
  for(let i=0;i<nodeData.length;i++){
    for(let j=i+1;j<nodeData.length;j++){
      const a=nodeData[i], b=nodeData[j];
      if(boxesOverlap(a.dlx,a.dly,a.lw,a.lh, b.dlx,b.dly,b.lw,b.lh))
        unite(a.p.id,b.p.id);
    }
  }

  // Build clusters from union-find groups
  const groupMap=new Map();
  nodeData.forEach(nd=>{
    const r=find(nd.p.id);
    if(!groupMap.has(r))groupMap.set(r,[]);
    groupMap.get(r).push(nd);
  });
  const clusters=[...groupMap.values()].map(nodes=>{
    const cx=nodes.reduce((s,n)=>s+n.cx,0)/nodes.length;
    const cy=nodes.reduce((s,n)=>s+n.cy,0)/nodes.length;
    return {cx,cy,nodes};
  });

  // Step 3: Draw dots (all nodes)
  for(const cl of clusters){
    for(const nd of cl.nodes){
      const {p,cx,cy}=nd;
      const isSel=p.id===selId;
      const sec=sections.find(s=>s.id===p.sectionId);
      const ringColor=isSel?'#fff':(sec?sec.color:p.color);
      h+=`<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="${p.color}18" stroke="${ringColor}" stroke-width="${isSel?2.5:1.5}"
            style="cursor:${drawTool==='none'&&!isAnim?'grab':(isAnim?'default':'crosshair')}"
            onmousedown="${drawTool==='none'&&!isAnim?`startProjDrag(event,${p.id})`:''}"
            oncontextmenu="openCtx(event,${p.id})"
            onmouseover="showTip(event,${p.id})" onmouseout="hideTip()"
            onclick="${drawTool==='none'&&!isAnim?`selectProject(${p.id})`:''}" />`;
      h+=`<circle cx="${cx}" cy="${cy}" r="4" fill="${p.color}" pointer-events="none"/>`;
      const td=(p.todos||[]).filter(t=>t.done).length,tt=(p.todos||[]).length;
      if(tt) h+=`<text font-family="IBM Plex Mono,monospace" font-size="8" fill="${p.color}88"
                   text-anchor="middle" x="${cx}" y="${cy+22}" pointer-events="none">${td}/${tt}</text>`;
    }
  }

  // Step 4: Draw labels — single nodes get default position, clusters get radial fan
  for(const cl of clusters){
    const N=cl.nodes.length;
    // Fan radius scales with N so labels don't overlap each other either
    const fanR=Math.max(44, 28+N*14);
    // Start angle: -90° (top), spread full 360° evenly
    const step=N===1?0:(2*Math.PI)/N;
    cl.nodes.forEach((nd,i)=>{
      const {p,cx,cy,lbl,lw}=nd;
      const isSel=p.id===selId;
      const angle=-Math.PI/2+i*step;
      const r=N===1?(DOT_R+8):fanR;
      // Label centre point
      const lx=cl.cx+Math.cos(angle)*r;
      const ly=cl.cy+Math.sin(angle)*r;
      // Horizontal text-anchor based on angle
      const anchor=N===1?'middle'
        :(Math.cos(angle)< -0.3?'end':Math.cos(angle)>0.3?'start':'middle');
      // Leader line from dot edge to label
      if(N>1){
        const dx=lx-cx, dy=ly-cy, dist=Math.hypot(dx,dy)||1;
        const lx0=cx+dx/dist*(DOT_R+1);
        const ly0=cy+dy/dist*(DOT_R+1);
        // End point: slightly before label centre so line ends near text start
        const lxe=lx-(anchor==='start'?lw*0.5:anchor==='end'?-lw*0.5:0)*0.15;
        h+=`<line x1="${lx0.toFixed(1)}" y1="${ly0.toFixed(1)}"
                  x2="${lxe.toFixed(1)}" y2="${(ly-2).toFixed(1)}"
              stroke="${p.color}" stroke-width="0.9" stroke-dasharray="3,2"
              opacity="0.5" pointer-events="none"/>`;
      }
      h+=`<text font-family="IBM Plex Sans,sans-serif" font-size="10" font-weight="${isSel?700:600}"
            fill="${p.color}" text-anchor="${anchor}" dominant-baseline="auto"
            x="${lx.toFixed(1)}" y="${ly.toFixed(1)}"
            style="cursor:${drawTool==='none'&&!isAnim?'pointer':'default'};paint-order:stroke;stroke:var(--bg);stroke-width:3px;stroke-linejoin:round"
            onclick="${drawTool==='none'&&!isAnim?`selectProject(${p.id})`:''}"
            onmouseover="showTip(event,${p.id})" onmouseout="hideTip()"
            >${escH(lbl)}</text>`;
    });
  }

  // ── Focus Star: importance-weighted centroid of top-N projects ──────
  if (_hmState && _hmState.showStar) {
    var _visPr = projects.filter(function(p){ return p.visible; });
    if (_visPr.length > 0) {
      var _topN = Math.max(1, Math.min(_hmState.starN || 3, _visPr.length));
      var _scored = _visPr.map(function(p){
        return { p:p, score: _hmImportance(p) };
      }).sort(function(a,b){ return b.score - a.score; });
      var _top = _scored.slice(0, _topN);
      var _wSum = _top.reduce(function(s,d){ return s + d.score; }, 0);
      if (_wSum > 0) {
        var _ax = eaxX(), _ay = eaxY();
        var _cx = _top.reduce(function(s,d){ return s + d.p.x * d.score; }, 0) / _wSum;
        var _cy = _top.reduce(function(s,d){ return s + getProjY(d.p) * d.score; }, 0) / _wSum;
        var _px = svgX(_cx, _ax, pw);
        var _py = svgY(_cy, _ay, ph);
        var _inCanvas = function(x,y){ return x>=PAD.l&&x<=PAD.l+pw&&y>=PAD.t&&y<=PAD.t+ph; };
        h += '<g id="focus-star" style="pointer-events:none">';
        // ── Dashed lines from each top-N project to centroid ──────────
        _top.forEach(function(d) {
          var _ppx = svgX(d.p.x, _ax, pw);
          var _ppy = svgY(getProjY(d.p), _ay, ph);
          if (!_inCanvas(_ppx, _ppy)) return;
          // Clip line to canvas if centroid is outside
          var _ex = _inCanvas(_px,_py) ? _px : Math.max(PAD.l, Math.min(PAD.l+pw, _px));
          var _ey = _inCanvas(_px,_py) ? _py : Math.max(PAD.t, Math.min(PAD.t+ph, _py));
          // Weight thickness by score share
          var _thick = (0.8 + (d.score / _wSum) * 1.8).toFixed(1);
          h += '<line x1="' + _ppx.toFixed(1) + '" y1="' + _ppy.toFixed(1) + '"'
            + ' x2="' + _ex.toFixed(1) + '" y2="' + _ey.toFixed(1) + '"'
            + ' stroke="#c8f135" stroke-width="' + _thick + '" stroke-dasharray="4,4"'
            + ' opacity="0.45"/>';
        });
        // ── Star at centroid (only if inside canvas) ──────────────────
        if (_inCanvas(_px, _py)) {
          var _r = 22;
          h += '<circle cx="' + _px + '" cy="' + _py + '" r="' + (_r+10) + '" fill="none" stroke="#c8f135" stroke-width="1" opacity="0.12"/>'
            + '<circle cx="' + _px + '" cy="' + _py + '" r="' + (_r+5)  + '" fill="none" stroke="#c8f135" stroke-width="1.5" opacity="0.28"/>'
            + '<circle cx="' + _px + '" cy="' + _py + '" r="' + _r      + '" fill="rgba(200,241,53,0.08)" stroke="#c8f135" stroke-width="2" opacity="0.7"/>'
            + (function(){
                var R=11, r2=5, pts=[];
                for(var i=0;i<12;i++){
                  var ang=(i*30-90)*Math.PI/180, rad=(i%2===0)?R:r2;
                  pts.push((_px+rad*Math.cos(ang)).toFixed(1)+','+(_py+rad*Math.sin(ang)).toFixed(1));
                }
                return '<polygon points="'+pts.join(' ')+'" fill="#c8f135" opacity="0.92"/>';
              })()
            + '<text x="' + _px + '" y="' + (_py-_r-7) + '" text-anchor="middle" '
            + 'font-family="IBM Plex Mono,monospace" font-size="9" fill="#c8f135" font-weight="700" opacity="0.9">'
            + 'FOCUS · top ' + _topN + '</text>';
        }
        h += '</g>';
      }
    }
  }

  svg.innerHTML=h;
  if(!isAnim){SV('sep-x-val',+cSepX.toFixed(3));SV('sep-y-val',+cSepY.toFixed(3));}
  G('svg-container').style.cursor=drawTool==='none'?'default':'crosshair';
}

/* ── Focus star + importance formula (matrix toolbar) ─────────────────
   Moved here from the heatmap. The focus star already renders in the SVG
   above (reads _hmState.showStar/starN/formula); these controls drive it.
   State lives in _hmState (defined in heatmap.js) so the shared importance
   formula stays in sync across the matrix and the heatmap. Rebuilt only on
   toggle/apply — never inside render() — so typing in the formula field
   isn't interrupted by pan/zoom re-renders. */

// renders the focus-star toggle + collapsible importance-formula panel
function renderFocusBar(){
  var bar=G('focus-bar'); if(!bar) return;
  var visN=projects.filter(function(p){ return p.visible; }).length;
  bar.innerHTML=''
    + '<button class="sm" onclick="mtxToggleStar()" '
    + 'style="'+(_hmState.showStar?'border-color:var(--accent);color:var(--accent);background:rgba(200,241,53,.12)':'')+'" '
    + 'title="'+t('Show importance-weighted centroid of the top-N projects')+'">'
    + '⭐ '+t('FOCUS STAR')+': '+(_hmState.showStar?'ON':'OFF')+'</button>'
    + '<button class="sm" onclick="mtxToggleFocusPanel()" '
    + 'style="'+(_hmState.showFormula?'border-color:var(--accent);color:var(--accent)':'')+'" '
    + 'title="'+t('Edit the importance formula and focus count')+'">⚙ '+t('IMPORTANCE FORMULA')+'</button>';

  var panel=G('focus-panel'); if(!panel) return;
  if(!_hmState.showFormula){ panel.innerHTML=''; return; }

  function preset(f,lbl){
    return '<a onclick="mtxSetFormula('+JSON.stringify(f).replace(/"/g,'&quot;')+')" '
      + 'style="color:var(--accent);cursor:pointer;margin-right:10px">'+escH(lbl)+'</a>';
  }
  var h='<div style="background:var(--surface);border-bottom:1px solid var(--border);'
    + 'padding:10px 13px;display:flex;flex-direction:column;gap:8px">';
  h += '<div>'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:5px;letter-spacing:.06em">'
    + t('IMPORTANCE FORMULA') + ' — <span style="color:var(--accent)">impact</span> · '
    + '<span style="color:var(--accent)">visibility</span> · <span style="color:var(--accent)">enabler</span> · '
    + '<span style="color:var(--accent)">x</span> ('+t('each 1–10')+')</div>'
    + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'
    + '<input id="mtx-formula-input" value="'+escH(_hmState.formula)+'" '
    + 'style="flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);color:var(--accent);'
    + 'font-family:IBM Plex Mono,monospace;font-size:11px;padding:5px 8px;border-radius:5px;outline:none" '
    + 'placeholder="impact * visibility * enabler" onkeydown="if(event.key===\'Enter\')mtxApplyFormula()">'
    + '<button class="sm primary" onclick="mtxApplyFormula()" style="font-size:10px;padding:3px 10px">'+t('APPLY')+'</button>'
    + '<button class="sm" onclick="mtxResetFormula()" style="font-size:10px;padding:3px 8px" title="'+t('Reset to default')+'">↺</button>'
    + '</div>'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);margin-top:4px">'
    + t('Presets') + ': '
    + preset('impact * visibility * enabler','impact×vis×ena')
    + preset('impact * visibility','impact×vis')
    + preset('(impact + visibility + enabler) / 3','avg(i,v,e)')
    + preset('impact * impact * visibility','impact²×vis')
    + '</div></div>';
  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;'
    + 'border-top:1px solid var(--border);padding-top:8px">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">⭐ '+t('FOCUS STAR — top')+'</span>'
    + '<input type="number" id="mtx-star-n" min="1" max="'+Math.max(1,visN)+'" value="'+_hmState.starN+'" '
    + 'style="width:48px;background:var(--bg);border:1px solid var(--border);color:var(--accent);'
    + 'font-family:IBM Plex Mono,monospace;font-size:11px;padding:3px 6px;border-radius:4px;text-align:center" '
    + 'oninput="_hmState.starN=Math.max(1,Math.min(+this.value,projects.filter(function(p){return p.visible;}).length));'
    + 'if(_hmState.showStar)render();">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+t('projects by importance')+'</span>'
    + '<span style="flex:1"></span>'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'
    + t('Centroid = importance-weighted average of the top N project positions')+'</span>'
    + '</div>';
  h += '</div>';
  panel.innerHTML=h;
}

// toggles the focus star and redraws the matrix + toolbar
function mtxToggleStar(){ _hmState.showStar=!_hmState.showStar; renderFocusBar(); render(); }
// toggles the importance-formula panel
function mtxToggleFocusPanel(){ _hmState.showFormula=!_hmState.showFormula; renderFocusBar(); }
// validates and applies the custom importance formula from the matrix panel
function mtxApplyFormula(){
  var input=G('mtx-formula-input'); if(!input) return;
  var formula=input.value.trim(); if(!formula) return;
  try{
    var fn=new Function('impact','visibility','enabler','x','return ('+formula+');');
    var r=fn(7,6,8,5);
    if(typeof r!=='number'||!isFinite(r)) throw new Error('not a number');
    _hmState.formula=formula; renderFocusBar(); render();
  }catch(e){ alert(t('Formula error: ')+e.message+'\n\nimpact * visibility * enabler'); }
}
// sets a preset importance formula and re-renders
function mtxSetFormula(f){ _hmState.formula=f; renderFocusBar(); render(); }
// resets the importance formula to default and re-renders
function mtxResetFormula(){ _hmState.formula='impact * visibility * enabler'; renderFocusBar(); render(); }
