/* ►► SECTION: OVERLAYS ◄◄ Help, Compare (dual Y-mode), and Summary dashboard overlays
 *
 * Functions defined in this file:
 *   openHelp        — opens the help overlay
 *   closeHelp       — closes the help overlay
 *   openCompare     — opens the compare overlay and starts observing resize
 *   closeCompare    — closes the compare overlay
 *   renderCompare   — renders both compare panels for the selected Y-modes
 *   renderCompareSVG — renders one compare matrix panel for a given Y-mode
 *   openSummary     — opens the portfolio summary dashboard
 *   closeSummary    — closes the summary dashboard
 *   renderSummary   — renders the summary KPIs, project breakdown, and team workload
 */

// opens the help overlay
function openHelp(){
  setActivePill('HELP');G('help-overlay').classList.add('show');}
// closes the help overlay
function closeHelp(){
  clearActivePill();G('help-overlay').classList.remove('show');}

const _cmpRO=new ResizeObserver(()=>{if(G('compare-overlay').classList.contains('show'))renderCompare();});
// opens the compare overlay and starts observing resize
function openCompare(){
  setActivePill('COMPARE');
  G('compare-overlay').classList.add('show');
  _cmpRO.observe(G('cmp-left-wrap'));_cmpRO.observe(G('cmp-right-wrap'));
  renderCompare();
}
// closes the compare overlay
function closeCompare(){
  clearActivePill();G('compare-overlay').classList.remove('show');}

// renders both compare panels for the selected Y-modes
function renderCompare(){
  const lMode=V('cmp-left'), rMode=V('cmp-right');
  G('cmp-left-title').textContent=Y_LABELS[lMode]||lMode.toUpperCase();
  G('cmp-right-title').textContent=Y_LABELS[rMode]||rMode.toUpperCase();
  renderCompareSVG('cmp-left-svg','cmp-left-wrap',lMode);
  renderCompareSVG('cmp-right-svg','cmp-right-wrap',rMode);
}

// renders one compare matrix panel for a given Y-mode
function renderCompareSVG(svgId,wrapId,mode){
  const wrap=G(wrapId),svg=G(svgId);
  if(!wrap||!svg)return;
  const W=wrap.clientWidth,H=wrap.clientHeight;
  if(W<50||H<50)return;
  svg.setAttribute('width',W);svg.setAttribute('height',H);
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);

  const ax=axX();
  const ay={...axY(),name:Y_LABELS[mode]};
  // override min/max from current axis bar values
  const ayMin=+V('ax-y-min')||0, ayMax=+V('ax-y-max')||10;
  const eAx={...ax,min:ax.min+zoom.panX,max:ax.min+zoom.panX+(ax.max-ax.min)/zoom.scaleX};
  const eAy={...ay,min:ayMin+zoom.panY,max:ayMin+zoom.panY+(ayMax-ayMin)/zoom.scaleY};

  const pw=W-PAD.l-PAD.r,ph=H-PAD.t-PAD.b;
  const grid=parseInt(V('ax-grid'))||5;
  const cSepX=clamp(sepX,ax.min,ax.max),cSepY=clamp(sepY,ayMin,ayMax);
  const sxPx=svgX(cSepX,eAx,pw),syPx=svgY(cSepY,eAy,ph);

  const qs=quadrantsByMode[mode]||quadrantsByMode.impact;
  const q={};qs.forEach(qq=>q[qq.key]=qq);

  let h='<defs><marker id="arr-c" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#6b6b78"/></marker></defs>';

  const qx1=PAD.l,qx2=PAD.l+pw,qy1=PAD.t,qy2=PAD.t+ph;
  const sx=clamp(sxPx,qx1,qx2),sy=clamp(syPx,qy1,qy2);
  h+=`<rect x="${qx1}" y="${qy1}" width="${sx-qx1}"  height="${sy-qy1}"  fill="${q.tl.color}"/>`;
  h+=`<rect x="${sx}"  y="${qy1}" width="${qx2-sx}"   height="${sy-qy1}"  fill="${q.tr.color}"/>`;
  h+=`<rect x="${qx1}" y="${sy}"  width="${sx-qx1}"  height="${qy2-sy}"  fill="${q.bl.color}"/>`;
  h+=`<rect x="${sx}"  y="${sy}"  width="${qx2-sx}"   height="${qy2-sy}"  fill="${q.br.color}"/>`;

  const ql=(t,x,y)=>`<text font-family="IBM Plex Sans,sans-serif" font-size="9" fill="#6b6b78" text-anchor="middle" x="${x}" y="${y}">${escH(t)}</text>`;
  h+=ql(q.tl.label,qx1+(sx-qx1)/2,qy1+12);h+=ql(q.tr.label,sx+(qx2-sx)/2,qy1+12);
  h+=ql(q.bl.label,qx1+(sx-qx1)/2,sy+12);h+=ql(q.br.label,sx+(qx2-sx)/2,sy+12);

  for(let i=0;i<=grid;i++){
    const xv=eAx.min+i/grid*(eAx.max-eAx.min);
    const yv=eAy.min+i/grid*(eAy.max-eAy.min);
    const sxx=svgX(xv,eAx,pw),syy=svgY(yv,eAy,ph);
    if(sxx>=PAD.l-1&&sxx<=PAD.l+pw+1){
      h+=`<line stroke="#2a2a32" stroke-width=".5" x1="${sxx}" y1="${PAD.t}" x2="${sxx}" y2="${PAD.t+ph}"/>`;
      h+=`<text font-family="IBM Plex Mono,monospace" font-size="8" fill="#6b6b78" text-anchor="middle" x="${sxx}" y="${PAD.t+ph+10}">${+xv.toFixed(1)}</text>`;
    }
    if(syy>=PAD.t-1&&syy<=PAD.t+ph+1){
      h+=`<line stroke="#2a2a32" stroke-width=".5" x1="${PAD.l}" y1="${syy}" x2="${PAD.l+pw}" y2="${syy}"/>`;
      h+=`<text font-family="IBM Plex Mono,monospace" font-size="8" fill="#6b6b78" text-anchor="end" dominant-baseline="middle" x="${PAD.l-3}" y="${syy}">${+yv.toFixed(1)}</text>`;
    }
  }
  h+=`<line stroke="#3a3a46" stroke-width="1.5" x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t+ph}"/>`;
  h+=`<line stroke="#3a3a46" stroke-width="1.5" x1="${PAD.l}" y1="${PAD.t+ph}" x2="${PAD.l+pw}" y2="${PAD.t+ph}"/>`;
  h+=`<line stroke="#5be5c8" stroke-width="1" stroke-dasharray="4,3" x1="${sxPx}" y1="${PAD.t}" x2="${sxPx}" y2="${PAD.t+ph}"/>`;
  h+=`<line stroke="#5be5c8" stroke-width="1" stroke-dasharray="4,3" x1="${PAD.l}" y1="${syPx}" x2="${PAD.l+pw}" y2="${syPx}"/>`;

  // Axis labels
  h+=`<text font-family="IBM Plex Mono,monospace" font-size="9" fill="#6b6b78" text-anchor="middle" x="${PAD.l+pw/2}" y="${H-2}">${escH((V('ax-x-name')||'X').toUpperCase())}</text>`;
  h+=`<text font-family="IBM Plex Mono,monospace" font-size="9" fill="#6b6b78" text-anchor="middle" transform="rotate(-90 ${PAD.l-18} ${PAD.t+ph/2})" x="${PAD.l-18}" y="${PAD.t+ph/2}">${escH(Y_LABELS[mode])}</text>`;

  // Project dots + labels with simple collision detection
  function getProjYForMode(p){
    if(mode==='visibility')return p.vis??5;
    if(mode==='enabler')return p.ena??5;
    return p.y;
  }
  const FONT_W=5.8,FONT_H=10,DOT_R=10;
  const nds=projects.filter(p=>p.visible).map(p=>{
    const cx=svgX(p.x,eAx,pw),cy=svgY(getProjYForMode(p),eAy,ph);
    const lbl=p.name.length>20?p.name.slice(0,19)+'…':p.name;
    const lw=lbl.length*FONT_W,lh=FONT_H;
    const dlx=cx-lw/2,dly=cy-DOT_R-6-lh;
    return {p,cx,cy,lbl,lw,lh,dlx,dly};
  });
  const PAD_L=5;
  function bOvlp(ax,ay,aw,ah,bx,by,bw,bh){return ax-PAD_L<bx+bw+PAD_L&&ax+aw+PAD_L>bx-PAD_L&&ay-PAD_L<by+bh+PAD_L&&ay+ah+PAD_L>by-PAD_L;}
  const par=new Map(nds.map(n=>[n.p.id,n.p.id]));
  function find(id){let r=par.get(id);while(r!==par.get(r))r=par.get(par.get(r));return r;}
  function unite(a,b){par.set(find(a),find(b));}
  for(let i=0;i<nds.length;i++)for(let j=i+1;j<nds.length;j++)
    if(bOvlp(nds[i].dlx,nds[i].dly,nds[i].lw,nds[i].lh,nds[j].dlx,nds[j].dly,nds[j].lw,nds[j].lh))unite(nds[i].p.id,nds[j].p.id);
  const gm=new Map();
  nds.forEach(nd=>{const r=find(nd.p.id);if(!gm.has(r))gm.set(r,[]);gm.get(r).push(nd);});
  const cls=[...gm.values()].map(nodes=>({cx:nodes.reduce((s,n)=>s+n.cx,0)/nodes.length,cy:nodes.reduce((s,n)=>s+n.cy,0)/nodes.length,nodes}));

  for(const cl of cls){
    for(const nd of cl.nodes){
      const {p,cx,cy}=nd;
      const isSel=p.id===selId;
      const sec=sections.find(s=>s.id===p.sectionId);
      const ring=isSel?'#fff':(sec?sec.color:p.color);
      h+=`<circle cx="${cx}" cy="${cy}" r="${DOT_R}" fill="${p.color}18" stroke="${ring}" stroke-width="${isSel?2:1.2}"/>`;
      h+=`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${p.color}"/>`;
    }
  }
  for(const cl of cls){
    const N=cl.nodes.length;
    const fanR=Math.max(40,24+N*13);
    const step=N===1?0:(2*Math.PI)/N;
    cl.nodes.forEach((nd,i)=>{
      const {p,cx,cy,lbl}=nd;
      const isSel=p.id===selId;
      const angle=-Math.PI/2+i*step;
      const r=N===1?(DOT_R+7):fanR;
      const lx=cl.cx+Math.cos(angle)*r,ly=cl.cy+Math.sin(angle)*r;
      const anchor=N===1?'middle':(Math.cos(angle)<-0.3?'end':Math.cos(angle)>0.3?'start':'middle');
      if(N>1){
        const dx=lx-cx,dy=ly-cy,dist=Math.hypot(dx,dy)||1;
        h+=`<line x1="${(cx+dx/dist*(DOT_R+1)).toFixed(1)}" y1="${(cy+dy/dist*(DOT_R+1)).toFixed(1)}" x2="${lx.toFixed(1)}" y2="${(ly-2).toFixed(1)}" stroke="${p.color}" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.45"/>`;
      }
      h+=`<text font-family="IBM Plex Sans,sans-serif" font-size="9" font-weight="${isSel?700:500}" fill="${p.color}" text-anchor="${anchor}" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" style="paint-order:stroke;stroke:var(--bg);stroke-width:2.5px;stroke-linejoin:round">${escH(lbl)}</text>`;
    });
  }
  svg.innerHTML=h;
}

// opens the portfolio summary dashboard
function openSummary(){
  setActivePill('SUMMARY');G('summary-overlay').classList.add('show');renderSummary();}
// closes the summary dashboard
function closeSummary(){
  clearActivePill();G('summary-overlay').classList.remove('show');}

// renders the summary KPIs, project breakdown, and team workload
function renderSummary(){
  const body=G('summary-body');
  const vis=projects.filter(p=>p.visible);
  const allRisks=projects.flatMap(p=>p.risks||[]);
  const allActions=projects.flatMap(p=>p.actions||[]);
  const allTodos=projects.flatMap(p=>p.todos||[]);
  const allMs=projects.flatMap(p=>p.milestones||[]);

  const riskHi=allRisks.filter(r=>(r.sev||1)*(r.occ||1)*(r.det||1)>=300).length;
  const riskMd=allRisks.filter(r=>{const rpn=(r.sev||1)*(r.occ||1)*(r.det||1);return rpn>=100&&rpn<300;}).length;
  const actionsDone=allActions.filter(a=>a.status==='Done').length;
  const actionsBlocked=allActions.filter(a=>a.status==='Blocked').length;
  const todosDone=allTodos.filter(t=>t.done).length;
  const msOverdue=allMs.filter(m=>m.end&&!m.done&&new Date(m.end)<new Date()).length;
  const msDone=allMs.filter(m=>m.done).length;
  const withGate=projects.filter(p=>p.gate).length;
  const avgImpact=vis.length?(vis.reduce((s,p)=>s+p.y,0)/vis.length).toFixed(1):'-';
  const avgVis=vis.length?(vis.reduce((s,p)=>s+(p.vis||5),0)/vis.length).toFixed(1):'-';
  const avgEna=vis.length?(vis.reduce((s,p)=>s+(p.ena||5),0)/vis.length).toFixed(1):'-';

  let h=`
  <div class="sum-grid">
    <div class="kpi-card"><div class="kpi-val">${projects.length}</div><div class="kpi-label">${t('TOTAL PROJECTS')}</div><div class="kpi-sub">${t('{n} visible on matrix',{n:vis.length})}</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:var(--danger)">${riskHi}</div><div class="kpi-label">${t('HIGH RISKS (RPN≥300)')}</div><div class="kpi-sub">${t('{m} medium · {n} total',{m:riskMd,n:allRisks.length})}</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:var(--accent2)">${actionsDone}<span style="font-size:14px;color:var(--muted)">/${allActions.length}</span></div><div class="kpi-label">${t('ACTIONS COMPLETE')}</div><div class="kpi-sub">${t('{n} blocked',{n:actionsBlocked})}</div></div>
    <div class="kpi-card"><div class="kpi-val">${todosDone}<span style="font-size:14px;color:var(--muted)">/${allTodos.length}</span></div><div class="kpi-label">${t('TASKS DONE')}</div><div class="kpi-sub">${allTodos.length?Math.round(todosDone/allTodos.length*100):0}% ${t('completion')}</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:${msOverdue>0?'var(--danger)':'var(--accent)'}">${msOverdue}</div><div class="kpi-label">${t('OVERDUE MILESTONES')}</div><div class="kpi-sub">${t('{d} completed · {n} total',{d:msDone,n:allMs.length})}</div></div>
    <div class="kpi-card"><div class="kpi-val" style="color:var(--accent2)">${withGate}</div><div class="kpi-label">${t('PROJECTS WITH GATE')}</div><div class="kpi-sub">${t('Next gate defined')}</div></div>
    <div class="kpi-card"><div class="kpi-val">${avgImpact}</div><div class="kpi-label">${t('AVG IMPACT')}</div><div class="kpi-sub">${t('Visibility {v} · Enabler {e}',{v:avgVis,e:avgEna})}</div></div>
    <div class="kpi-card"><div class="kpi-val">${sections.length}</div><div class="kpi-label">${t('SECTIONS')}</div><div class="kpi-sub">${t('{n} unsectioned',{n:projects.filter(p=>!p.sectionId).length})}</div></div>
  </div>`;

  // Per-section breakdown
  const allGroups=[
    {name:t('UNSECTIONED'),color:'var(--muted)',projs:projects.filter(p=>!p.sectionId)},
    ...sections.map(s=>({name:s.name,color:s.color,projs:projects.filter(p=>p.sectionId===s.id)}))
  ].filter(g=>g.projs.length);

  h+=`<div class="sum-section-title">${t('PROJECT BREAKDOWN')}</div>`;
  for(const grp of allGroups){
    h+=`<div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px">
        <div style="width:8px;height:8px;border-radius:50%;background:${grp.color};flex-shrink:0"></div>
        <span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em">${escH(grp.name)}</span>
      </div>`;
    for(const p of grp.projs){
      const pRisks=p.risks||[],pActs=p.actions||[],pTodos=p.todos||[];
      const rpnHi=pRisks.filter(r=>(r.sev||1)*(r.occ||1)*(r.det||1)>=300).length;
      const actPct=pActs.length?Math.round(pActs.filter(a=>a.status==='Done').length/pActs.length*100):null;
      const todoPct=pTodos.length?Math.round(pTodos.filter(t=>t.done).length/pTodos.length*100):null;
      const pMs=p.milestones||[];
      const msOvd=pMs.filter(m=>m.end&&!m.done&&new Date(m.end)<new Date()).length;
      h+=`<div class="proj-sum-row">
        <div style="width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
        <div class="psr-name" style="color:${p.color}">${escH(p.name)}</div>
        <div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;white-space:nowrap">
          I:${p.y} V:${p.vis||5} E:${p.ena||5}
        </div>
        <div class="psr-badges">
          ${rpnHi?`<span class="badge badge-risk-hi">⚠ ${t('{n} HI',{n:rpnHi})}</span>`:''}
          ${msOvd?`<span class="badge" style="background:rgba(241,67,53,.12);color:#f14335">📅 ${t('{n} late',{n:msOvd})}</span>`:''}
          ${p.currentGate?`<span class="badge" style="background:rgba(120,120,140,.12);color:var(--muted);font-size:9px;padding:1px 5px;border-radius:3px">🏁 ${escH(p.currentGate.slice(0,12))} →</span>` :''} ${p.gate?`<span class="badge badge-gate">🏁 ${escH(p.gate.slice(0,14))}</span>`:''}
          ${pTodos.length?`<span class="badge badge-todo">☑ ${todoPct}%</span>`:''}
          ${pActs.length?`<span class="badge" style="background:rgba(167,139,250,.1);color:#a78bfa">👥 ${actPct}%</span>`:''}
        </div>
      </div>
      ${(todoPct!==null||actPct!==null)?`
      <div style="padding:2px 0 4px 15px">
        ${todoPct!==null?`<div style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);margin-bottom:2px"><span style="width:36px">${t('Tasks')}</span><div class="progress-bar-wrap" style="flex:1"><div class="progress-bar" style="width:${todoPct}%"></div></div><span>${todoPct}%</span></div>`:''}
        ${actPct!==null?`<div style="display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted)"><span style="width:36px">${t('Actions')}</span><div class="progress-bar-wrap" style="flex:1"><div class="progress-bar" style="width:${actPct}%;background:#a78bfa"></div></div><span>${actPct}%</span></div>`:''}
      </div>`:''}`;
    }
    h+='</div>';
  }

  // Team workload
  const memberMap={};
  projects.forEach(p=>(p.actions||[]).forEach(a=>{
    const m=a.member||t('Unassigned');
    if(!memberMap[m])memberMap[m]={total:0,done:0,blocked:0,projects:new Set()};
    memberMap[m].total++;memberMap[m].projects.add(p.name);
    if(a.status==='Done')memberMap[m].done++;
    if(a.status==='Blocked')memberMap[m].blocked++;
  }));
  if(Object.keys(memberMap).length){
    h+=`<div class="sum-section-title" style="margin-top:8px">${t('TEAM WORKLOAD')}</div>
    <div class="sum-grid">`;
    for(const [name,s] of Object.entries(memberMap)){
      const pct=Math.round(s.done/s.total*100);
      h+=`<div class="kpi-card">
        <div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--accent2);margin-bottom:6px">${escH(name)}</div>
        <div style="font-size:12px">${t('{n} actions',{n:s.total})} &nbsp;·&nbsp; <span style="color:var(--accent)">${pct}%</span> ${t('done')}</div>
        ${s.blocked?`<div style="font-size:10px;color:var(--danger);margin-top:2px">⚠ ${t('{n} blocked',{n:s.blocked})}</div>`:''}
        <div class="progress-bar-wrap" style="margin-top:8px"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px">${[...s.projects].slice(0,2).map(p=>p.slice(0,16)).join(', ')}${s.projects.size>2?'…':''}</div>
      </div>`;
    }
    h+='</div>';
  }
  body.innerHTML=h;
}
