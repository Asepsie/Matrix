/* ►► SECTION: PORTFOLIO-ANALYTICS ◄◄ Project-side analytics (INSIGHTS › Portfolio analytics)
 *
 * A read-only analytical view over the PROJECT portfolio — distinct from the People
 * Analytics tab (analytics.js). Renders into #res-body like every Resources tab.
 * Money-based (€ revenue vs loaded team cost), pipeline, risk, and mix lenses that
 * the Summary overlay / Cost dashboard don't provide.
 *
 * Sections:
 *   • Scorecard      — portfolio KPIs (revenue €, cost €, ROI, completion, risk)
 *   • ROI scatter    — revenue impact (€) vs loaded team cost (€), bubble = FTE
 *   • Gate funnel    — project + revenue distribution across current gates
 *   • Sector mix     — cost & revenue split by sector (portfolio balance)
 *   • Risk vs value  — RPN exposure vs revenue (are valuable projects the risky ones?)
 *
 * Reuses shared helpers only: getMonthRange, _allocCost, _allocNum, _engByIdMap, escH.
 * (Trajectory-over-snapshots is a planned follow-up.) All identifiers are pf-prefixed.
 */

// €-formatter: compact, sign-aware
function pfEur(v){
  v=+v||0;
  if(Math.abs(v)>=1e6) return (v/1e6).toFixed(v>=1e7?0:1)+'M€';
  if(Math.abs(v)>=1e3) return Math.round(v/1e3)+'k€';
  return Math.round(v)+'€';
}
function pfEmpty(msg){
  return '<div style="color:var(--muted);font-size:12px;padding:20px;text-align:center;font-family:IBM Plex Mono,monospace">'+escH(msg)+'</div>';
}
function pfRpn(r){ return (r.sev||1)*(r.occ||1)*(r.det||1); }

// Per-project metrics over the global FROM/TO period.
function pfBuildDataset(){
  var months=getMonthRange();
  var engById=_engByIdMap();
  var rowsByProj={};
  allocRows.forEach(function(r){ if(r.projectId==null) return; (rowsByProj[r.projectId]=rowsByProj[r.projectId]||[]).push(r); });
  return projects.map(function(p){
    var rows=rowsByProj[p.id]||[];
    var cost=0, fteSum=0;
    rows.forEach(function(r){
      var eng=engById.get(r.engId); var mc=eng?(eng.monthlyCost||0):0;
      months.forEach(function(m){
        var v=r.allocs?r.allocs[m]:null;
        cost+=_allocCost(v,mc);
        fteSum+=_allocNum(v);
      });
    });
    var rev=projRevenueM(p)*1e6;   // impactEur (M€), or derived impact+enabler default
    var revDefault=projRevenueIsDefault(p);
    var risks=p.risks||[];
    var rpnSum=risks.reduce(function(s,r){return s+pfRpn(r);},0);
    var rpnMax=risks.reduce(function(s,r){return Math.max(s,pfRpn(r));},0);
    var todos=p.todos||[], acts=p.actions||[], ms=p.milestones||[];
    var todoPct=todos.length?todos.filter(function(t){return t.done;}).length/todos.length:null;
    var actPct=acts.length?acts.filter(function(a){return a.status==='Done';}).length/acts.length:null;
    var parts=[]; if(todoPct!=null)parts.push(todoPct); if(actPct!=null)parts.push(actPct);
    var completion=parts.length?parts.reduce(function(s,v){return s+v;},0)/parts.length:null;
    var msOverdue=ms.filter(function(m){return m.end&&!m.done&&new Date(m.end)<new Date();}).length;
    return {
      p:p, name:p.name, color:p.color||'var(--accent)', visible:p.visible,
      cost:cost, avgFte:months.length?fteSum/months.length:0, rev:rev, revM:rev/1e6,
      rpnSum:rpnSum, rpnMax:rpnMax, completion:completion, msOverdue:msOverdue,
      gate:(p.currentGate||p.gate||'').trim(), sector:(p.sector||'').trim()||'—',
      intent:(p.tacticalIntent||'').trim(),
      roi:cost>0?rev/cost:null, revDefault:revDefault
    };
  });
}

// Entry point — assemble the tab into #res-body.
function renderPortfolioAnalytics(){
  var body=G('res-body'); if(!body) return;
  var ds=pfBuildDataset();
  var months=getMonthRange();
  var h='<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';
  h+='<div style="display:flex;align-items:baseline;gap:10px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);letter-spacing:.06em">◎ PORTFOLIO ANALYTICS</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
    +(months.length?('cost over '+months.length+' month'+(months.length>1?'s':'')+' · FROM/TO period'):'set a FROM/TO period for cost')
    +'</span></div>';
  if(!projects.length){ body.innerHTML=h+pfEmpty('No projects yet — add projects on the matrix to see analytics.')+'</div>'; return; }
  h+=pfScorecard(ds);
  h+='<div id="pf-sec-treemap">'+pfTreemapSection(ds)+'</div>';
  h+=pfSection('VALUE vs COST — ROI',      'Revenue impact (€) against loaded team cost (€) over the period. Bubble size = avg FTE. Above the dashed break-even line = positive ROI. Revenue defaults to impact + enabler (M€) when none is entered.', pfRoiChart(ds));
  h+='<div id="pf-sec-burn">'+pfBurnSection()+'</div>';
  h+=pfSection('DELIVERY PIPELINE — gates','How the portfolio and its revenue are distributed across current gate stages.', pfGateFunnel(ds));
  h+=pfSection('PORTFOLIO MIX — sectors',  'Where investment (cost) and expected return (revenue) concentrate by sector.', pfSectorMix(ds));
  h+=pfSection('RISK vs VALUE',            'Total risk exposure (Σ RPN) against revenue. Top-right = valuable AND risky — watch closely.', pfRiskValue(ds));
  h+='<div id="pf-sec-dist">'+pfDistSection(ds)+'</div>';
  h+='</div>';
  body.innerHTML=h;
}

// Section wrapper (title + hint + body card).
function pfSection(title,hint,inner){
  return '<div style="border:1px solid var(--border);border-radius:8px;background:var(--surface);overflow:hidden">'
    +'<div style="padding:11px 14px;border-bottom:1px solid var(--border)">'
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:600;color:var(--text);letter-spacing:.05em">'+escH(title)+'</div>'
    +'<div style="font-size:10px;color:var(--muted);margin-top:3px;line-height:1.5">'+escH(hint)+'</div></div>'
    +'<div style="padding:14px">'+inner+'</div></div>';
}

function pfKpi(val,label,sub,color){
  return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;min-width:130px;flex:1">'
    +'<div style="font-size:22px;font-weight:700;color:'+(color||'var(--text)')+';line-height:1.1">'+val+'</div>'
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-top:5px">'+escH(label)+'</div>'
    +(sub?'<div style="font-size:10px;color:var(--muted);margin-top:2px">'+escH(sub)+'</div>':'')+'</div>';
}

function pfScorecard(ds){
  var totRev=ds.reduce(function(s,d){return s+d.rev;},0);
  var totCost=ds.reduce(function(s,d){return s+d.cost;},0);
  var roi=totCost>0?totRev/totCost:null;
  var hiRisk=ds.filter(function(d){return d.rpnMax>=300;}).length;
  var comps=ds.map(function(d){return d.completion;}).filter(function(v){return v!=null;});
  var avgComp=comps.length?Math.round(comps.reduce(function(s,v){return s+v;},0)/comps.length*100):null;
  var overdue=ds.reduce(function(s,d){return s+d.msOverdue;},0);
  var roiColor=roi==null?'var(--muted)':(roi>=1?'var(--accent)':'var(--danger)');
  var h='<div style="display:flex;gap:10px;flex-wrap:wrap">';
  var entered=ds.filter(function(d){return !d.revDefault;}).length;
  h+=pfKpi(ds.length, 'PROJECTS', entered+' € entered · '+(ds.length-entered)+' default');
  h+=pfKpi(pfEur(totRev), 'REVENUE IMPACT', 'expected, all projects', 'var(--accent2)');
  h+=pfKpi(pfEur(totCost), 'TEAM COST', 'allocated over period');
  h+=pfKpi(roi==null?'—':(roi>=10?Math.round(roi)+'×':roi.toFixed(1)+'×'), 'PORTFOLIO ROI', roi==null?'assign team cost':'revenue ÷ cost', roiColor);
  h+=pfKpi(avgComp==null?'—':avgComp+'%', 'AVG COMPLETION', 'todos + actions');
  h+=pfKpi(hiRisk, 'HIGH-RISK', overdue+' overdue milestones', hiRisk?'var(--danger)':'var(--text)');
  h+='</div>';
  return h;
}

/* ── Generic bubble scatter (linear axes, optional break-even/median guides). ──
   cfg: { pts:[{vx,vy,r,color,label}], xlab, ylab, xfmt, yfmt,
          breakeven:bool (y=x line), xguide:num, yguide:num } */
function pfScatter(cfg){
  var pts=cfg.pts||[];
  if(!pts.length) return pfEmpty(cfg.emptyMsg||'No data for this view');
  var W=680, H=340, PADl=54, PADr=16, PADt=14, PADb=42;
  var pw=W-PADl-PADr, ph=H-PADt-PADb;
  var xmax=Math.max.apply(null,pts.map(function(p){return p.vx;}).concat([1]))*1.12;
  var ymax=Math.max.apply(null,pts.map(function(p){return p.vy;}).concat([1]))*1.12;
  var X=function(v){return PADl+(xmax?v/xmax:0)*pw;};
  var Y=function(v){return PADt+ph-(ymax?v/ymax:0)*ph;};
  var h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;max-height:360px;font-family:IBM Plex Mono,monospace">';
  // grid + ticks
  for(var i=0;i<=4;i++){
    var gx=PADl+i/4*pw, gy=PADt+i/4*ph;
    h+='<line x1="'+gx.toFixed(1)+'" y1="'+PADt+'" x2="'+gx.toFixed(1)+'" y2="'+(PADt+ph)+'" stroke="#2a2a32" stroke-width=".5"/>';
    h+='<line x1="'+PADl+'" y1="'+gy.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+gy.toFixed(1)+'" stroke="#2a2a32" stroke-width=".5"/>';
    h+='<text x="'+gx.toFixed(1)+'" y="'+(PADt+ph+14)+'" fill="#6b6b78" font-size="8" text-anchor="middle">'+cfg.xfmt(xmax*i/4)+'</text>';
    h+='<text x="'+(PADl-6)+'" y="'+(PADt+ph-i/4*ph+3).toFixed(1)+'" fill="#6b6b78" font-size="8" text-anchor="end">'+cfg.yfmt(ymax*i/4)+'</text>';
  }
  // break-even diagonal (y=x in value units) — only where both axes share meaning
  if(cfg.breakeven){
    var d=Math.min(xmax,ymax);
    h+='<line x1="'+X(0)+'" y1="'+Y(0)+'" x2="'+X(d)+'" y2="'+Y(d)+'" stroke="#5be5c8" stroke-width="1" stroke-dasharray="5,4" opacity=".55"/>';
    h+='<text x="'+(X(d)-4)+'" y="'+(Y(d)+12)+'" fill="#5be5c8" font-size="8" text-anchor="end" opacity=".8">break-even ROI</text>';
  }
  if(cfg.xguide!=null) h+='<line x1="'+X(cfg.xguide)+'" y1="'+PADt+'" x2="'+X(cfg.xguide)+'" y2="'+(PADt+ph)+'" stroke="#f1a435" stroke-width=".8" stroke-dasharray="3,3" opacity=".5"/>';
  if(cfg.yguide!=null) h+='<line x1="'+PADl+'" y1="'+Y(cfg.yguide)+'" x2="'+(PADl+pw)+'" y2="'+Y(cfg.yguide)+'" stroke="#f1a435" stroke-width=".8" stroke-dasharray="3,3" opacity=".5"/>';
  // axis lines
  h+='<line x1="'+PADl+'" y1="'+PADt+'" x2="'+PADl+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1.2"/>';
  h+='<line x1="'+PADl+'" y1="'+(PADt+ph)+'" x2="'+(PADl+pw)+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1.2"/>';
  // bubbles
  pts.forEach(function(p){
    var cx=X(p.vx), cy=Y(p.vy), r=Math.max(4,Math.min(20,p.r||6));
    h+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+p.color+'33" stroke="'+p.color+'" stroke-width="1.3"><title>'+escH(p.label+(p.tip?' — '+p.tip:''))+'</title></circle>';
  });
  // labels (top 8 by area to avoid clutter)
  pts.slice().sort(function(a,b){return (b.vx*b.vy)-(a.vx*a.vy);}).slice(0,8).forEach(function(p){
    var cx=X(p.vx), cy=Y(p.vy);
    h+='<text x="'+(cx+ (Math.max(4,Math.min(20,p.r||6))+3)).toFixed(1)+'" y="'+(cy+3).toFixed(1)+'" fill="var(--text)" font-size="8.5" style="paint-order:stroke;stroke:var(--bg);stroke-width:2.5px">'+escH(p.label.length>18?p.label.slice(0,17)+'…':p.label)+'</text>';
  });
  h+='<text x="'+(PADl+pw/2)+'" y="'+(H-4)+'" fill="#8b9096" font-size="9" text-anchor="middle">'+escH(cfg.xlab)+'</text>';
  h+='<text transform="rotate(-90 12 '+(PADt+ph/2)+')" x="12" y="'+(PADt+ph/2)+'" fill="#8b9096" font-size="9" text-anchor="middle">'+escH(cfg.ylab)+'</text>';
  h+='</svg>';
  return h;
}

function pfRoiChart(ds){
  var pts=ds.filter(function(d){return d.rev>0||d.cost>0;}).map(function(d){
    return {vx:d.cost, vy:d.rev, r:4+Math.sqrt(d.avgFte)*6, color:(d.color[0]==='#'?d.color:'#c8f135'),
            label:d.name, tip:pfEur(d.rev)+' rev'+(d.revDefault?' (est.)':'')+' · '+pfEur(d.cost)+' cost · '+d.avgFte.toFixed(1)+' FTE'};
  });
  if(!pts.length) return pfEmpty('Add revenue impact (€) on projects and allocate a team to see ROI.');
  return pfScatter({pts:pts, xlab:'Loaded team cost (€) →', ylab:'Revenue impact (€) →',
    xfmt:pfEur, yfmt:pfEur, breakeven:true});
}

function pfGateFunnel(ds){
  var byGate={};
  ds.forEach(function(d){ var g=d.gate||'(no gate set)'; if(!byGate[g])byGate[g]={n:0,rev:0,cost:0}; byGate[g].n++; byGate[g].rev+=d.rev; byGate[g].cost+=d.cost; });
  var rows=Object.keys(byGate).map(function(g){return {gate:g,d:byGate[g]};}).sort(function(a,b){return b.d.n-a.d.n;});
  if(!rows.length) return pfEmpty('No gate data');
  var maxN=Math.max.apply(null,rows.map(function(r){return r.d.n;}));
  var h='<div style="display:flex;flex-direction:column;gap:8px">';
  rows.forEach(function(r){
    var pct=maxN?r.d.n/maxN*100:0;
    var noGate=r.gate==='(no gate set)';
    h+='<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="width:150px;font-size:11px;color:'+(noGate?'var(--muted)':'var(--text)')+';font-family:IBM Plex Mono,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escH(r.gate)+'">'+escH(r.gate)+'</div>'
      +'<div style="flex:1;height:22px;background:var(--bg);border-radius:5px;overflow:hidden;position:relative">'
      +'<div style="height:100%;width:'+pct.toFixed(1)+'%;background:'+(noGate?'var(--border)':'linear-gradient(90deg,rgba(200,241,53,.35),rgba(91,229,200,.25))')+';border-right:2px solid '+(noGate?'var(--muted)':'var(--accent)')+'"></div>'
      +'<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:10px;font-family:IBM Plex Mono,monospace;color:var(--text)">'+r.d.n+' project'+(r.d.n>1?'s':'')+'</span></div>'
      +'<div style="width:120px;text-align:right;font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+pfEur(r.d.rev)+' · '+pfEur(r.d.cost)+'</div></div>';
  });
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">bar = project count · right = revenue · cost per stage</div>';
  h+='</div>';
  return h;
}

function pfSectorMix(ds){
  var by={};
  ds.forEach(function(d){ if(!by[d.sector])by[d.sector]={cost:0,rev:0,n:0}; by[d.sector].cost+=d.cost; by[d.sector].rev+=d.rev; by[d.sector].n++; });
  var rows=Object.keys(by).map(function(s){return {sector:s,d:by[s]};}).sort(function(a,b){return (b.d.cost+b.d.rev)-(a.d.cost+a.d.rev);});
  if(!rows.length) return pfEmpty('No sector data — tag projects with a sector/domain.');
  var maxCost=Math.max.apply(null,rows.map(function(r){return r.d.cost;}).concat([1]));
  var maxRev=Math.max.apply(null,rows.map(function(r){return r.d.rev;}).concat([1]));
  var h='<div style="display:flex;flex-direction:column;gap:10px">';
  rows.forEach(function(r){
    var cp=r.d.cost/maxCost*100, rp=r.d.rev/maxRev*100;
    h+='<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="width:120px;font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escH(r.sector)+'">'+escH(r.sector)+' <span style="color:var(--dim)">·'+r.d.n+'</span></div>'
      +'<div style="flex:1;display:flex;flex-direction:column;gap:3px">'
      +'<div style="height:11px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+rp.toFixed(1)+'%;background:var(--accent2)" title="revenue '+pfEur(r.d.rev)+'"></div></div>'
      +'<div style="height:11px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+cp.toFixed(1)+'%;background:var(--accent)" title="cost '+pfEur(r.d.cost)+'"></div></div>'
      +'</div>'
      +'<div style="width:150px;text-align:right;font-size:10px;font-family:IBM Plex Mono,monospace"><span style="color:var(--accent2)">'+pfEur(r.d.rev)+'</span> / <span style="color:var(--accent)">'+pfEur(r.d.cost)+'</span></div></div>';
  });
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">top bar = revenue (teal) · bottom bar = cost (lime)</div>';
  h+='</div>';
  return h;
}

function pfRiskValue(ds){
  var withRisk=ds.filter(function(d){return d.rpnSum>0;});
  if(!withRisk.length) return pfEmpty('No project risks logged yet — add risks to see exposure vs value.');
  var pts=withRisk.map(function(d){
    return {vx:d.rpnSum, vy:d.rev, r:5+Math.sqrt(d.avgFte)*5, color:(d.color[0]==='#'?d.color:'#f14335'),
            label:d.name, tip:'ΣRPN '+d.rpnSum+' · '+pfEur(d.rev)};
  });
  // median guides
  var xs=pts.map(function(p){return p.vx;}).sort(function(a,b){return a-b;});
  var ys=pts.map(function(p){return p.vy;}).sort(function(a,b){return a-b;});
  var med=function(a){return a.length?a[Math.floor(a.length/2)]:0;};
  return pfScatter({pts:pts, xlab:'Risk exposure — Σ RPN →', ylab:'Revenue impact (€) →',
    xfmt:function(v){return Math.round(v);}, yfmt:pfEur, xguide:med(xs), yguide:med(ys)});
}

/* ══ INTERACTIVE SECTIONS (treemap · burn · distribution) ══════════════
   Small module state + a generic re-render router so each section's controls
   re-render only their own wrapper (no full-tab reflow, no scroll jump). */
var _pfState={ treemapBy:'cost', treemapGroup:'none', burnBy:'sector', distMetric:'revenue', distFit:'none', distBins:8 };
var PF_SEL='background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;cursor:pointer';

// Set a control value and re-render just the affected section wrapper.
function pfSet(key,val){
  _pfState[key]=(key==='distBins')?(+val):val;
  var el;
  if(key==='treemapBy'||key==='treemapGroup'){ el=G('pf-sec-treemap'); if(el) el.innerHTML=pfTreemapSection(); }
  else if(key==='burnBy'){ el=G('pf-sec-burn'); if(el) el.innerHTML=pfBurnSection(); }
  else { el=G('pf-sec-dist'); if(el) el.innerHTML=pfDistSection(); }
}
function pfToggle(call,label,active){
  return '<button onclick="'+call+'" style="background:'+(active?'rgba(200,241,53,.12)':'var(--bg)')
    +';border:1px solid '+(active?'var(--accent)':'var(--border)')+';color:'+(active?'var(--accent)':'var(--muted)')
    +';font-family:IBM Plex Mono,monospace;font-size:10px;padding:3px 9px;border-radius:5px;cursor:pointer">'+escH(label)+'</button>';
}
// Section shell with a controls slot on the header right.
function pfSectionShell(title,hint,controls,inner){
  return '<div style="border:1px solid var(--border);border-radius:8px;background:var(--surface);overflow:hidden">'
    +'<div style="padding:11px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">'
    +'<div><div style="font-family:IBM Plex Mono,monospace;font-size:11px;font-weight:600;color:var(--text);letter-spacing:.05em">'+escH(title)+'</div>'
    +'<div style="font-size:10px;color:var(--muted);margin-top:3px;line-height:1.5;max-width:600px">'+escH(hint)+'</div></div>'
    +'<div style="flex-shrink:0">'+(controls||'')+'</div></div>'
    +'<div style="padding:14px">'+inner+'</div></div>';
}
function pfPalette(i){ var c=['#c8f135','#5be5c8','#a78bfa','#f1a435','#f14335','#5b9ee5','#e55b9e','#8be55b','#e5c85b','#5be59e']; return c[i%c.length]; }
function pfRankColor(p){ return p>=.75?'#c8f135':p>=.5?'#a8e820':p>=.25?'#f1a435':'#f14335'; }
function pfMetricVal(d,metric){
  if(metric==='revenue')    return d.revM;
  if(metric==='cost')       return d.cost/1000;
  if(metric==='roi')        return (d.roi!=null&&isFinite(d.roi))?d.roi:null;
  if(metric==='risk')       return d.rpnSum;
  if(metric==='fte')        return d.avgFte;
  if(metric==='completion') return (d.completion!=null)?d.completion*100:null;
  return null;
}
function pfDistFmt(metric,v){
  if(metric==='revenue')    return (v>=10?Math.round(v):v.toFixed(1))+'M';
  if(metric==='cost')       return Math.round(v)+'k';
  if(metric==='roi')        return (v>=10?Math.round(v):v.toFixed(1))+'×';
  if(metric==='completion') return Math.round(v)+'%';
  if(metric==='fte')        return v.toFixed(1);
  return Math.round(v);
}

/* ── TREEMAP (squarified) — area = cost|revenue, color = ROI rank ── */
function pfTreemapSection(ds){
  ds=ds||pfBuildDataset();
  var by=_pfState.treemapBy, grouped=_pfState.treemapGroup==='intent';
  var items=ds.map(function(d){ return {d:d, value:(by==='revenue'?d.rev:d.cost)}; }).filter(function(x){return x.value>0;});
  var controls='<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
    +pfToggle("pfSet('treemapBy','cost')",'Size: Cost',by==='cost')
    +pfToggle("pfSet('treemapBy','revenue')",'Size: Revenue',by==='revenue')
    +'<span style="width:1px;height:16px;background:var(--border);margin:0 3px"></span>'
    +pfToggle("pfSet('treemapGroup','none')",'Flat',!grouped)
    +pfToggle("pfSet('treemapGroup','intent')",'By tactical intent',grouped)+'</span>';
  var empty=by==='revenue'?'No revenue to map — add € impact or impact+enabler.':'No team cost to map — allocate a team over the period.';
  var inner=!items.length?pfEmpty(empty):(grouped?pfTreemapGroupedSvg(items,by):pfTreemapSvg(items));
  var hint=grouped
    ? 'Grouped by tactical intent (Defend / Grow / Adapt / Diversify). Rectangle area = '+(by==='revenue'?'revenue':'team cost')+' · color = ROI rank. Shows how '+(by==='revenue'?'value':'spend')+' splits across strategic postures.'
    : 'Rectangle area = '+(by==='revenue'?'revenue':'team cost')+' · color = ROI rank (green = best return, red = worst). Instantly shows where '+(by==='revenue'?'value':'investment')+' concentrates.';
  return pfSectionShell('SPEND MAP — treemap', hint, controls, inner);
}
// ROI-rank percentile fn shared by flat + grouped treemaps (green = best return).
function pfRoiPctFn(items){
  var rois=items.map(function(x){var d=x.d;return d.cost>0?d.rev/d.cost:(d.rev>0?Infinity:0);});
  var sorted=rois.filter(function(v){return isFinite(v);}).slice().sort(function(a,b){return a-b;});
  return function(v){ if(!isFinite(v))return 1; if(!sorted.length)return .5; var i=0; while(i<sorted.length&&sorted[i]<v)i++; return i/sorted.length; };
}
// Nested treemap: outer cells = tactical-intent groups (area = Σ member value),
// inner cells = projects colored by ROI rank. Keeps the ROI legend meaningful
// while showing how spend/value splits across strategic postures.
function pfTreemapGroupedSvg(items,by){
  var W=680,H=340,pct=pfRoiPctFn(items);
  var order=PROJECT_INTENTS.concat(['Unassigned']);
  var buckets={};
  items.forEach(function(x){ var k=(x.d.intent||'').trim()||'Unassigned'; (buckets[k]=buckets[k]||[]).push(x); });
  var groups=order.filter(function(k){return buckets[k]&&buckets[k].length;}).map(function(k){
    var mem=buckets[k], val=mem.reduce(function(s,m){return s+m.value;},0);
    return {intent:k, members:mem, value:val};
  });
  var groupRects=pfSquarify(groups.map(function(g){return {d:g,value:g.value};}),0,0,W,H);
  var HEAD=17, GAP=3;
  var h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;font-family:IBM Plex Mono,monospace">';
  groupRects.forEach(function(gr){
    var g=gr.d.d, gcol=PROJECT_INTENT_COLORS[g.intent]||'#6b6b78';
    h+='<rect x="'+gr.x.toFixed(1)+'" y="'+gr.y.toFixed(1)+'" width="'+Math.max(0,gr.w-1).toFixed(1)+'" height="'+Math.max(0,gr.h-1).toFixed(1)+'" fill="'+gcol+'0d" stroke="'+gcol+'" stroke-width="1.2" rx="3"/>';
    if(gr.w>60) h+='<text x="'+(gr.x+6).toFixed(1)+'" y="'+(gr.y+12).toFixed(1)+'" fill="'+gcol+'" font-size="9.5" font-weight="600">'+escH(g.intent.toUpperCase())+' · '+escH(pfEur(g.value))+'</text>';
    var ix=gr.x+GAP, iy=gr.y+HEAD, iw=gr.w-2*GAP, ih=gr.h-HEAD-GAP;
    if(iw>6&&ih>6){
      pfSquarify(g.members,ix,iy,iw,ih).forEach(function(r){
        var d=r.d.d, roi=d.cost>0?d.rev/d.cost:(d.rev>0?Infinity:0), col=pfRankColor(pct(roi));
        var roiTxt=d.cost>0?(' · ROI '+(d.rev/d.cost>=10?Math.round(d.rev/d.cost):(d.rev/d.cost).toFixed(1))+'×'):'';
        h+='<rect x="'+r.x.toFixed(1)+'" y="'+r.y.toFixed(1)+'" width="'+Math.max(0,r.w-1).toFixed(1)+'" height="'+Math.max(0,r.h-1).toFixed(1)+'" fill="'+col+'33" stroke="'+col+'" stroke-width="1" rx="2"><title>'+escH(d.name+' — '+g.intent+' — '+pfEur(d.rev)+' rev · '+pfEur(d.cost)+' cost'+roiTxt)+'</title></rect>';
        if(r.w>54&&r.h>20){
          var maxc=Math.floor(r.w/6);
          h+='<text x="'+(r.x+5).toFixed(1)+'" y="'+(r.y+13).toFixed(1)+'" fill="var(--text)" font-size="9" style="paint-order:stroke;stroke:var(--bg);stroke-width:2.5px">'+escH(d.name.length>maxc?d.name.slice(0,maxc-1)+'…':d.name)+'</text>';
          if(r.h>34) h+='<text x="'+(r.x+5).toFixed(1)+'" y="'+(r.y+24).toFixed(1)+'" fill="var(--muted)" font-size="8">'+escH(pfEur(by==='revenue'?d.rev:d.cost))+'</text>';
        }
      });
    }
  });
  h+='</svg>';
  h+='<div style="display:flex;gap:10px;align-items:center;margin-top:8px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)"><span>ROI rank:</span>'
    +'<span style="color:#f14335">■ low</span><span style="color:#f1a435">■</span><span style="color:#a8e820">■</span><span style="color:#c8f135">■ high</span></div>';
  return h;
}
function pfTreemapSvg(items){
  var W=680,H=300;
  var rois=items.map(function(x){var d=x.d;return d.cost>0?d.rev/d.cost:(d.rev>0?Infinity:0);});
  var sorted=rois.filter(function(v){return isFinite(v);}).slice().sort(function(a,b){return a-b;});
  var pct=function(v){ if(!isFinite(v))return 1; if(!sorted.length)return .5; var i=0; while(i<sorted.length&&sorted[i]<v)i++; return i/sorted.length; };
  var rects=pfSquarify(items,0,0,W,H);
  var h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;font-family:IBM Plex Mono,monospace">';
  rects.forEach(function(r){
    var d=r.d.d, roi=d.cost>0?d.rev/d.cost:(d.rev>0?Infinity:0), col=pfRankColor(pct(roi));
    var roiTxt=d.cost>0?(' · ROI '+(d.rev/d.cost>=10?Math.round(d.rev/d.cost):(d.rev/d.cost).toFixed(1))+'×'):'';
    h+='<rect x="'+r.x.toFixed(1)+'" y="'+r.y.toFixed(1)+'" width="'+Math.max(0,r.w-1).toFixed(1)+'" height="'+Math.max(0,r.h-1).toFixed(1)+'" fill="'+col+'22" stroke="'+col+'" stroke-width="1" rx="2"><title>'+escH(d.name+' — '+pfEur(d.rev)+' rev · '+pfEur(d.cost)+' cost'+roiTxt)+'</title></rect>';
    if(r.w>54&&r.h>22){
      var maxc=Math.floor(r.w/6);
      h+='<text x="'+(r.x+5).toFixed(1)+'" y="'+(r.y+14).toFixed(1)+'" fill="var(--text)" font-size="9.5" style="paint-order:stroke;stroke:var(--bg);stroke-width:2.5px">'+escH(d.name.length>maxc?d.name.slice(0,maxc-1)+'…':d.name)+'</text>';
      if(r.h>38) h+='<text x="'+(r.x+5).toFixed(1)+'" y="'+(r.y+26).toFixed(1)+'" fill="var(--muted)" font-size="8">'+escH(pfEur(_pfState.treemapBy==='revenue'?d.rev:d.cost))+'</text>';
    }
  });
  h+='</svg>';
  h+='<div style="display:flex;gap:10px;align-items:center;margin-top:8px;font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)"><span>ROI rank:</span>'
    +'<span style="color:#f14335">■ low</span><span style="color:#f1a435">■</span><span style="color:#a8e820">■</span><span style="color:#c8f135">■ high</span></div>';
  return h;
}
// Squarified treemap layout → [{d,x,y,w,h}]. items:[{d,value>0}].
function pfSquarify(items,x,y,w,h){
  var data=items.filter(function(it){return it.value>0;});
  var total=data.reduce(function(s,it){return s+it.value;},0);
  if(total<=0||w<=0||h<=0) return [];
  var nodes=data.slice().sort(function(a,b){return b.value-a.value;}).map(function(it){return {d:it,a:it.value*(w*h)/total};});
  var out=[]; pfSqRec(nodes,{x:x,y:y,w:w,h:h},out); return out;
}
function pfSqWorst(row,length){
  if(!row.length) return Infinity;
  var s=0,mx=-Infinity,mn=Infinity;
  for(var i=0;i<row.length;i++){var a=row[i].a; s+=a; if(a>mx)mx=a; if(a<mn)mn=a;}
  if(s<=0) return Infinity;
  return Math.max((length*length*mx)/(s*s),(s*s)/(length*length*mn));
}
function pfSqRec(nodes,rect,out){
  if(!nodes.length) return;
  if(rect.w<1||rect.h<1){ nodes.forEach(function(n){out.push({d:n.d,x:rect.x,y:rect.y,w:Math.max(0,rect.w),h:Math.max(0,rect.h)});}); return; }
  var length=Math.min(rect.w,rect.h), row=[], idx=0;
  while(idx<nodes.length){
    if(row.length===0 || pfSqWorst(row.concat([nodes[idx]]),length)<=pfSqWorst(row,length)){ row.push(nodes[idx]); idx++; }
    else break;
  }
  var rowSum=row.reduce(function(s,n){return s+n.a;},0);
  if(rect.w>=rect.h){
    var rw=rowSum/rect.h, yy=rect.y;
    row.forEach(function(n){ var hh=rect.h*(n.a/rowSum); out.push({d:n.d,x:rect.x,y:yy,w:rw,h:hh}); yy+=hh; });
    pfSqRec(nodes.slice(idx),{x:rect.x+rw,y:rect.y,w:rect.w-rw,h:rect.h},out);
  }else{
    var rh=rowSum/rect.w, xx=rect.x;
    row.forEach(function(n){ var ww=rect.w*(n.a/rowSum); out.push({d:n.d,x:xx,y:rect.y,w:ww,h:rh}); xx+=ww; });
    pfSqRec(nodes.slice(idx),{x:rect.x,y:rect.y+rh,w:rect.w,h:rect.h-rh},out);
  }
}

/* ── COST OVER TIME — stacked-area burn ── */
function pfBurnSection(){
  var by=_pfState.burnBy;
  var controls='<span style="display:flex;gap:6px">'
    +pfToggle("pfSet('burnBy','sector')",'By: Sector',by==='sector')
    +pfToggle("pfSet('burnBy','project')",'By: Project',by==='project')+'</span>';
  return pfSectionShell('COST OVER TIME — burn','Monthly team cost stacked by '+by+' across the FROM/TO period — the spend ramp and where it concentrates over time.', controls, pfBurnSvg(by));
}
function pfBurnSvg(by){
  var months=getMonthRange();
  if(months.length<2) return pfEmpty('Set a FROM/TO period of at least 2 months to see the burn curve.');
  var engById=_engByIdMap(), projById=_projByIdMap(), groups={};
  allocRows.forEach(function(r){
    var proj=projById.get(r.projectId); if(!proj) return;
    var key=(by==='project')?(proj.name||'—'):(((proj.sector||'').trim())||'—');
    var eng=engById.get(r.engId), mc=eng?(eng.monthlyCost||0):0;
    if(!groups[key]) groups[key]={key:key,color:(by==='project'&&proj.color&&proj.color[0]==='#')?proj.color:null,arr:months.map(function(){return 0;})};
    months.forEach(function(m,i){ groups[key].arr[i]+=_allocCost(r.allocs?r.allocs[m]:null, mc); });
  });
  var series=Object.keys(groups).map(function(k){return groups[k];})
    .filter(function(s){return s.arr.some(function(v){return v>0;});})
    .sort(function(a,b){return b.arr.reduce(function(s,v){return s+v;},0)-a.arr.reduce(function(s,v){return s+v;},0);});
  if(!series.length) return pfEmpty('No allocation cost in this period.');
  series.forEach(function(s,i){ if(!s.color) s.color=pfPalette(i); });
  var totals=months.map(function(_,i){ return series.reduce(function(s,se){return s+se.arr[i];},0); });
  var ymax=Math.max.apply(null,totals.concat([1]))*1.08;
  var W=680,H=300,PADl=54,PADr=14,PADt=12,PADb=40,pw=W-PADl-PADr,ph=H-PADt-PADb;
  var X=function(i){ return PADl+(months.length>1?i/(months.length-1):0)*pw; };
  var Y=function(v){ return PADt+ph-(ymax?v/ymax:0)*ph; };
  var h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;font-family:IBM Plex Mono,monospace">';
  for(var g=0;g<=4;g++){ var gy=PADt+g/4*ph; h+='<line x1="'+PADl+'" y1="'+gy.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+gy.toFixed(1)+'" stroke="#2a2a32" stroke-width=".5"/>'; h+='<text x="'+(PADl-6)+'" y="'+(gy+3).toFixed(1)+'" fill="#6b6b78" font-size="8" text-anchor="end">'+pfEur(ymax*(1-g/4))+'</text>'; }
  var base=months.map(function(){return 0;});
  series.forEach(function(se){
    var top=base.map(function(b,i){return b+se.arr[i];}), pts=[];
    for(var i=0;i<months.length;i++) pts.push(X(i).toFixed(1)+','+Y(top[i]).toFixed(1));
    for(var j=months.length-1;j>=0;j--) pts.push(X(j).toFixed(1)+','+Y(base[j]).toFixed(1));
    h+='<polygon points="'+pts.join(' ')+'" fill="'+se.color+'55" stroke="'+se.color+'" stroke-width="1"><title>'+escH(se.key)+'</title></polygon>';
    base=top;
  });
  var step=Math.max(1,Math.ceil(months.length/8));
  for(var i=0;i<months.length;i+=step){ h+='<text x="'+X(i).toFixed(1)+'" y="'+(PADt+ph+13)+'" fill="#6b6b78" font-size="7.5" text-anchor="middle">'+escH(fmtMonth(months[i]))+'</text>'; }
  h+='<line x1="'+PADl+'" y1="'+PADt+'" x2="'+PADl+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1"/>';
  h+='<line x1="'+PADl+'" y1="'+(PADt+ph)+'" x2="'+(PADl+pw)+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1"/>';
  h+='</svg>';
  h+='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">'+series.slice(0,12).map(function(se){
    return '<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace"><span style="width:9px;height:9px;border-radius:2px;background:'+se.color+'"></span>'+escH(se.key)+'</span>';
  }).join('')+'</div>';
  return h;
}

/* ── DISTRIBUTION — histogram (+Gaussian) or Pareto 80/20 ── */
function pfDistSection(ds){
  ds=ds||pfBuildDataset();
  var m=_pfState.distMetric, fit=_pfState.distFit, bins=+_pfState.distBins||8;
  var mOpts=[['revenue','Revenue'],['cost','Cost'],['roi','ROI'],['risk','Risk'],['fte','FTE'],['completion','Completion']];
  var fOpts=[['none','Histogram'],['gauss','+ Gaussian'],['pareto','Pareto 80/20']];
  var sel=function(key,opts,cur){ return '<select onchange="pfSet(\''+key+'\',this.value)" style="'+PF_SEL+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===cur?' selected':'')+'>'+escH(o[1])+'</option>';}).join('')+'</select>'; };
  var binsCtl=(fit==='pareto')?'':'<label style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;display:flex;align-items:center;gap:5px">bins '+bins+'<input type="range" min="4" max="20" value="'+bins+'" onchange="pfSet(\'distBins\',this.value)" style="width:70px;accent-color:var(--accent)"></label>';
  var controls='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+sel('distMetric',mOpts,m)+sel('distFit',fOpts,fit)+binsCtl+'</div>';
  var chart=(fit==='pareto')?pfParetoSvg(ds,m):pfHistSvg(ds,m,fit,bins);
  return pfSectionShell('DISTRIBUTION — '+m,'Spread of the chosen metric across projects. Gaussian overlays a bell curve (judge normality); Pareto shows 80/20 concentration.', controls, chart);
}
function pfHistSvg(ds,metric,fit,bins){
  var vals=[]; ds.forEach(function(d){ var v=pfMetricVal(d,metric); if(v!=null&&isFinite(v)) vals.push(v); });
  if(vals.length<2) return pfEmpty('Not enough data for a distribution of this metric.');
  var min=Math.min.apply(null,vals), max=Math.max.apply(null,vals); if(max<=min) max=min+1;
  var nb=Math.max(3,Math.min(30,bins|0)), bwv=(max-min)/nb, counts=new Array(nb).fill(0);
  vals.forEach(function(v){ var bi=Math.min(nb-1,Math.max(0,Math.floor((v-min)/bwv))); counts[bi]++; });
  var maxCount=Math.max.apply(null,counts.concat([1]));
  var W=680,H=300,PADl=42,PADr=16,PADt=14,PADb=42,pw=W-PADl-PADr,ph=H-PADt-PADb;
  var X=function(v){ return PADl+((v-min)/(max-min))*pw; };
  var h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;font-family:IBM Plex Mono,monospace">';
  for(var g=0;g<=4;g++){ var gy=PADt+g/4*ph; h+='<line x1="'+PADl+'" y1="'+gy.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+gy.toFixed(1)+'" stroke="#2a2a32" stroke-width=".5"/>'; h+='<text x="'+(PADl-6)+'" y="'+(gy+3).toFixed(1)+'" fill="#6b6b78" font-size="8" text-anchor="end">'+Math.round(maxCount*(1-g/4))+'</text>'; }
  for(var i=0;i<nb;i++){ var x0=PADl+i/nb*pw, bwid=pw/nb-1.5, bh=(counts[i]/maxCount)*ph; h+='<rect x="'+(x0+0.75).toFixed(1)+'" y="'+(PADt+ph-bh).toFixed(1)+'" width="'+Math.max(1,bwid).toFixed(1)+'" height="'+bh.toFixed(1)+'" fill="rgba(200,241,53,.28)" stroke="var(--accent)" stroke-width=".7"><title>'+counts[i]+' project'+(counts[i]===1?'':'s')+'</title></rect>'; }
  for(var t=0;t<=4;t++){ var xv=min+t/4*(max-min); h+='<text x="'+(PADl+t/4*pw).toFixed(1)+'" y="'+(PADt+ph+13)+'" fill="#6b6b78" font-size="8" text-anchor="middle">'+pfDistFmt(metric,xv)+'</text>'; }
  if(fit==='gauss'){
    var mean=vals.reduce(function(s,v){return s+v;},0)/vals.length;
    var sd=Math.sqrt(vals.reduce(function(s,v){return s+(v-mean)*(v-mean);},0)/vals.length)||1e-9;
    var pts=[]; for(var s2=0;s2<=60;s2++){ var xv2=min+s2/60*(max-min); var pdf=Math.exp(-0.5*Math.pow((xv2-mean)/sd,2)); pts.push(X(xv2).toFixed(1)+','+(PADt+ph-pdf*ph*0.92).toFixed(1)); }
    h+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="var(--accent2)" stroke-width="1.6"/>';
    h+='<text x="'+(PADl+pw-4)+'" y="'+(PADt+11)+'" fill="var(--accent2)" font-size="8" text-anchor="end">μ='+pfDistFmt(metric,mean)+' · σ='+pfDistFmt(metric,sd)+'</text>';
  }
  h+='<line x1="'+PADl+'" y1="'+PADt+'" x2="'+PADl+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1"/>';
  h+='<line x1="'+PADl+'" y1="'+(PADt+ph)+'" x2="'+(PADl+pw)+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1"/>';
  h+='</svg>';
  return h;
}
function pfParetoSvg(ds,metric){
  var items=ds.map(function(d){ return {name:d.name,color:(d.color&&d.color[0]==='#')?d.color:'#c8f135',v:pfMetricVal(d,metric)}; })
    .filter(function(it){return it.v!=null&&isFinite(it.v)&&it.v>0;})
    .sort(function(a,b){return b.v-a.v;});
  if(items.length<2) return pfEmpty('Not enough positive values for a Pareto of this metric.');
  var CAP=18;
  if(items.length>CAP){ var tail=items.slice(CAP), sum=tail.reduce(function(s,it){return s+it.v;},0); items=items.slice(0,CAP); items.push({name:'+'+tail.length+' others',color:'#6b6b78',v:sum}); }
  var total=items.reduce(function(s,it){return s+it.v;},0)||1;
  var maxV=Math.max.apply(null,items.map(function(it){return it.v;}));
  var W=680,H=320,PADl=48,PADr=44,PADt=14,PADb=66,pw=W-PADl-PADr,ph=H-PADt-PADb,bw=pw/items.length;
  var h='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;font-family:IBM Plex Mono,monospace">';
  for(var g=0;g<=4;g++){ var gy=PADt+g/4*ph; h+='<line x1="'+PADl+'" y1="'+gy.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+gy.toFixed(1)+'" stroke="#2a2a32" stroke-width=".5"/>'; h+='<text x="'+(PADl-6)+'" y="'+(gy+3).toFixed(1)+'" fill="#6b6b78" font-size="8" text-anchor="end">'+pfDistFmt(metric,maxV*(1-g/4))+'</text>'; h+='<text x="'+(PADl+pw+6)+'" y="'+(gy+3).toFixed(1)+'" fill="#5be5c8" font-size="8">'+Math.round(100*(1-g/4))+'%</text>'; }
  var cum=0, linePts=[], eighty=null;
  items.forEach(function(it,i){
    var x0=PADl+i*bw, bh=(it.v/maxV)*ph;
    h+='<rect x="'+(x0+1.5).toFixed(1)+'" y="'+(PADt+ph-bh).toFixed(1)+'" width="'+Math.max(1,bw-3).toFixed(1)+'" height="'+bh.toFixed(1)+'" fill="'+it.color+'33" stroke="'+it.color+'" stroke-width=".8"><title>'+escH(it.name+' — '+pfDistFmt(metric,it.v))+'</title></rect>';
    cum+=it.v; var cf=cum/total, cx=x0+bw/2, cy=PADt+ph-cf*ph;
    linePts.push(cx.toFixed(1)+','+cy.toFixed(1));
    if(eighty===null&&cf>=0.8) eighty={i:i};
  });
  h+='<polyline points="'+linePts.join(' ')+'" fill="none" stroke="var(--accent2)" stroke-width="1.6"/>';
  linePts.forEach(function(p){ var xy=p.split(','); h+='<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="2.2" fill="var(--accent2)"/>'; });
  var y80=PADt+ph-0.8*ph;
  h+='<line x1="'+PADl+'" y1="'+y80.toFixed(1)+'" x2="'+(PADl+pw)+'" y2="'+y80.toFixed(1)+'" stroke="#f1a435" stroke-width=".8" stroke-dasharray="4,3" opacity=".7"/>';
  h+='<text x="'+(PADl+2)+'" y="'+(y80-3).toFixed(1)+'" fill="#f1a435" font-size="8">80% of total</text>';
  items.forEach(function(it,i){ var cx=PADl+i*bw+bw/2; h+='<text transform="rotate(45 '+cx.toFixed(1)+' '+(PADt+ph+8)+')" x="'+cx.toFixed(1)+'" y="'+(PADt+ph+8)+'" fill="#6b6b78" font-size="7.5">'+escH(it.name.length>14?it.name.slice(0,13)+'…':it.name)+'</text>'; });
  h+='<line x1="'+PADl+'" y1="'+PADt+'" x2="'+PADl+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1"/>';
  h+='<line x1="'+PADl+'" y1="'+(PADt+ph)+'" x2="'+(PADl+pw)+'" y2="'+(PADt+ph)+'" stroke="#3a3a46" stroke-width="1"/>';
  h+='</svg>';
  var insight=eighty?('<div style="font-size:10px;color:var(--muted);margin-top:6px;font-family:IBM Plex Mono,monospace">Top <span style="color:var(--accent)">'+(eighty.i+1)+'</span> of '+items.length+' ('+Math.round((eighty.i+1)/items.length*100)+'%) drive 80% of total '+escH(metric)+'.</div>'):'';
  return h+insight;
}
