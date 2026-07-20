/* ►► SECTION: PORTFOLIO-ECONOMICS ◄◄ INSIGHTS › Portfolio economics.
 *
 * A read-only tab that CROSSES the four data layers the rest of the app keeps
 * apart: value (charter financials — NPV/IRR/PI), cost (allocations + design-to-
 * cost unit cost), route-to-market (channel mix — share/margin/partner/segment)
 * and decision (trade-off conflicts + cross-functional alignment). Renders into
 * #res-body like every Resources tab. All identifiers are `ec`-prefixed.
 *
 * Reuses pure helpers only: pfBuildDataset / pfSection / pfEmpty / pfEur (cost &
 * layout), calculateFinancials + resolveUnitEconomics + dtcTarget + amortized*
 * (financial engine), chanBlendedMargin / chanProfitPools / chanConcentration
 * (channel data), chtConflicts + CHT_FUNCS (decision). Nothing here mutates state
 * — a mix-shift what-if is computed at the pool level, not written back.
 *
 * Revenue here is the charter's expectedRevenueM (the same base the channel panel
 * splits), so € figures agree with the Channel-mix view.
 */

// Interactive mix-shift what-if state (UI-only, not persisted).
let _ecMixFrom = 0, _ecMixTo = 0, _ecMixPct = 10;

// ── per-project enriched dataset (financials × channel × decision × cost) ─────
function ecDataset(){
  const base=(typeof pfBuildDataset==='function') ? pfBuildDataset() : [];
  return base.map(b=>{
    const p=b.p;
    const c=(p.charter && typeof p.charter==='object') ? p.charter : makeCharter();
    const fin=calculateFinancials(c.financials);
    const revM=Number(c.expectedRevenueM);
    const chanRev=(Number.isFinite(revM) && revM>0) ? revM*1e6 : 0;
    const blended=(typeof chanBlendedMargin==='function') ? chanBlendedMargin(c) : null;
    const grossProfit=(blended!=null) ? chanRev*blended/100 : null;
    const eco=resolveUnitEconomics(c.financials);
    const unitMarginPct=eco.price>0 ? (eco.price-eco.directVar)/eco.price*100 : null;
    const conflicts=(typeof chtConflicts==='function') ? chtConflicts(c).length : 0;
    const aligns=(typeof CHT_FUNCS!=='undefined'?CHT_FUNCS:[]).map(f=>Number(c[f[0]].alignment)).filter(v=>Number.isFinite(v)&&v>0);
    const alignMin=aligns.length ? Math.min.apply(null,aligns) : null;
    const alignAvg=aligns.length ? aligns.reduce((s,v)=>s+v,0)/aligns.length : null;
    const rpnMax=(p.risks||[]).reduce((s,r)=>Math.max(s,(r.sev||1)*(r.occ||1)*(r.det||1)),0);
    // Risk haircut on the UPSIDE only (never inflate a loss): normalise the worst
    // RPN by its theoretical max (1000 = 10×10×10).
    const riskFactor=1-Math.min(rpnMax/1000,1);
    const riskAdjNpv=(fin.npv==null) ? null : (fin.npv>0 ? fin.npv*riskFactor : fin.npv);
    return {
      p, name:p.name||'Untitled', color:p.color||'var(--accent)',
      cost:b.cost, avgFte:b.avgFte, intent:b.intent, sector:b.sector, rpnSum:b.rpnSum, rpnMax,
      npv:fin.npv, pi:fin.profitabilityIndex, irr:fin.irr, invested:fin.effInvestment,
      chanRev, blended, grossProfit, unitMarginPct, riskAdjNpv,
      conflicts, alignMin, alignAvg,
      dtcTarget:(typeof dtcTarget==='function')?dtcTarget(c.financials):null,
      dtcCurrent:ecDtcCurrent(c), amortUnits:Number(c.financials&&c.financials.investment&&c.financials.investment.amortUnits)||0,
    };
  });
}
// Rolled-up current unit cost from the design-to-cost cascade (included subsystems).
function ecDtcCurrent(c){
  const cm=c && c.costModel; if(!cm || !Array.isArray(cm.subsystems)) return null;
  let sum=0, any=false;
  cm.subsystems.forEach(s=>{
    if(s.include===false) return;
    let v;
    if(Array.isArray(s.items) && s.items.length) v=s.items.reduce((t,it)=>t+(it.include===false?0:(Number(it.cost)||0)),0);
    else v=Number(s.current)||0;
    if(v){ sum+=v; any=true; }
  });
  return any ? sum : null;
}

// ── small shared renderers (inline-styled, matching the Portfolio tab) ───────
function ecKpi(val,label,sub,color){
  return '<div style="flex:1;min-width:132px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">'
    +'<div style="font-size:18px;font-weight:700;color:'+(color||'var(--text)')+'">'+val+'</div>'
    +'<div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;letter-spacing:.05em;text-transform:uppercase;margin-top:3px">'+escH(label)+'</div>'
    +(sub?'<div style="font-size:10px;color:var(--dim);margin-top:2px">'+sub+'</div>':'')+'</div>';
}
// A labelled horizontal bar row. `rightHtml` is pre-formatted (may contain spans).
function ecBar(label,frac,rightHtml,color,title){
  return '<div style="display:flex;align-items:center;gap:10px">'
    +'<div style="width:150px;font-size:11px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escH(title||label)+'">'+escH(label)+'</div>'
    +'<div style="flex:1;height:14px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+(Math.max(0,Math.min(100,frac*100))).toFixed(1)+'%;background:'+safeColor(color||'var(--accent)')+'"></div></div>'
    +'<div style="width:200px;text-align:right;font-size:10px;font-family:IBM Plex Mono,monospace">'+rightHtml+'</div></div>';
}
function ecEur(v){ return (typeof pfEur==='function') ? pfEur(v) : Math.round(+v||0)+'€'; }
function ecPct(v){ return v==null||!Number.isFinite(v) ? '—' : v.toFixed(1)+'%'; }

// ── entry point ──────────────────────────────────────────────────────────────
function renderEconTab(){
  const body=G('res-body'); if(!body) return;
  const ds=ecDataset();
  const months=getMonthRange();
  let h='<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';
  h+='<div style="display:flex;align-items:baseline;gap:10px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);letter-spacing:.06em">'+t('◎ PORTFOLIO ECONOMICS')+'</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
    +(months.length?t('cost over {n} month(s) · FROM/TO period',{n:months.length}):t('set a FROM/TO period for cost'))
    +'</span></div>';
  if(!projects.length){ body.innerHTML=h+pfEmpty(t('No projects yet — add projects on the matrix to see analytics.'))+'</div>'; return; }
  h+=ecScorecard(ds);
  h+=pfSection(t('CAPITAL ALLOCATION — value per €'), t('NPV created against capital invested, ranked by profitability index (PV of inflows ÷ outlay). PI > 1 creates value; fund the top, review the bottom.'), ecCapital(ds));
  h+=pfSection(t('CHANNEL PROFIT POOLS'), t('Revenue vs gross profit (revenue × channel margin) by channel. A big low-margin channel can trail a small high-margin one — profit, not revenue, is the ranking that matters.'), ecPools('byChannel'));
  h+=pfSection(t('SEGMENT PROFIT POOLS'), t('The same revenue-and-profit view by customer segment.'), ecPools('bySegment'));
  h+=pfSection(t('CONCENTRATION & DEPENDENCY'), t('How concentrated revenue is by channel, segment and partner (HHI 0–1; higher = more concentrated). A high score with one dominant name is a single point of failure.'), ecConcentration());
  h+='<div id="ec-sec-mix">'+ecMixSensitivity()+'</div>';
  h+=pfSection(t('MARGIN REALISM'), t('Does each project’s blended channel margin square with its unit economics (price − direct cost) and its design-to-cost target? A channel margin far above the unit margin is optimistic pricing.'), ecMarginRealism(ds));
  h+=pfSection(t('COST GAP → MARGIN AT RISK'), t('Design-to-cost: (current − target) unit cost × amortization volume = the margin exposed if cost-downs don’t land.'), ecCostGap(ds));
  h+=pfSection(t('STRATEGY COHERENCE'), t('Cost, revenue and NPV grouped by tactical intent — are you investing where the strategy says you are?'), ecStrategy(ds));
  h+=pfSection(t('DECISION QUALITY'), t('Trade-off conflicts and low cross-functional alignment on high-value projects — execution risk on your best bets.'), ecDecision(ds));
  h+=pfSection(t('VALUE PER FTE'), t('NPV and revenue per average FTE over the period — the productivity of where people are placed.'), ecValuePerFte(ds));
  h+='<div id="ec-sec-traj">'+ecTrajectoryShell()+'</div>';
  h+='</div>';
  body.innerHTML=h;
}

// ── 1. scorecard ─────────────────────────────────────────────────────────────
function ecScorecard(ds){
  const sum=k=>ds.reduce((s,d)=>s+(Number(d[k])||0),0);
  const totNpv=ds.reduce((s,d)=>s+(d.npv||0),0);
  const totInv=sum('invested');
  const totRev=sum('chanRev');
  const totGP=ds.reduce((s,d)=>s+(d.grossProfit||0),0);
  const anyGP=ds.some(d=>d.grossProfit!=null);
  const pi=totInv>0 ? (totNpv+totInv)/totInv : null;
  const blended=(anyGP && totRev>0) ? totGP/totRev*100 : null;
  const riskAdj=ds.reduce((s,d)=>s+(d.riskAdjNpv||0),0);
  const conflicts=ds.reduce((s,d)=>s+d.conflicts,0);
  const cards=[
    ecKpi(ecEur(totNpv), t('Portfolio NPV'), null, totNpv>=0?'var(--accent2)':'var(--danger)'),
    ecKpi(ecEur(riskAdj), t('Risk-adjusted NPV'), t('upside haircut by RPN'), riskAdj>=0?'var(--text)':'var(--danger)'),
    ecKpi(pi==null?'—':pi.toFixed(2), t('Portfolio PI'), t('value per € invested'), pi!=null&&pi>=1?'var(--accent2)':''),
    ecKpi(ecEur(totInv), t('Capital invested'), null),
    ecKpi(ecEur(totRev), t('Expected revenue'), null),
    ecKpi(blended==null?'—':blended.toFixed(1)+'%', t('Blended gross margin'), null, 'var(--accent2)'),
    ecKpi(ecEur(totGP), t('Gross profit'), t('revenue × channel margin')),
    ecKpi(String(conflicts), t('Trade-off conflicts'), null, conflicts?'var(--danger)':'var(--accent2)'),
  ].join('');
  return '<div style="display:flex;flex-wrap:wrap;gap:10px">'+cards+'</div>';
}

// ── 2. capital allocation (PI-ranked) ────────────────────────────────────────
function ecCapital(ds){
  const rows=ds.filter(d=>d.invested>0 || d.npv!=null).slice()
    .sort((a,b)=>((b.pi==null?-1e9:b.pi))-((a.pi==null?-1e9:a.pi)));
  if(!rows.length) return pfEmpty(t('No financials yet — set investment & cash flows on Financials analysis.'));
  const maxInv=rows.reduce((s,d)=>Math.max(s,d.invested||0),1);
  let h='<div style="display:flex;flex-direction:column;gap:8px">';
  rows.forEach(d=>{
    const npvCls=(d.npv||0)>=0?'var(--accent2)':'var(--danger)';
    const piTxt=d.pi==null?'—':d.pi.toFixed(2);
    const verdict=d.pi==null?'':(d.pi>=1.3?'<span style="color:var(--accent2)"> ▲ fund</span>':(d.pi<1?'<span style="color:var(--danger)"> ▽ review</span>':''));
    const right='<span style="color:'+npvCls+'">NPV '+ecEur(d.npv||0)+'</span> · inv '+ecEur(d.invested||0)+' · <b>PI '+piTxt+'</b>'+verdict;
    h+=ecBar(d.name, (d.invested||0)/maxInv, right, d.color, d.name);
  });
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">'+t('bar = capital invested · sorted by profitability index (PV inflows ÷ outlay)')+'</div>';
  h+='</div>';
  return h;
}

// ── 3/4. channel & segment profit pools ──────────────────────────────────────
function ecPools(which){
  const pools=(typeof chanProfitPools==='function') ? chanProfitPools(projects) : {byChannel:[],bySegment:[]};
  let rows=pools[which]||[];
  if(which==='bySegment') rows=rows.map(r=>({...r, name:r.name==='—'?t('Unassigned'):r.name}));
  rows=rows.filter(r=>r.revenue>0);
  if(!rows.length) return pfEmpty(t('No channel mix defined yet — set channels on OFFER MNGT ▸ Channel mix.'));
  const maxRev=rows.reduce((s,r)=>Math.max(s,r.revenue),1);
  const totRev=rows.reduce((s,r)=>s+r.revenue,0);
  let h='<div style="display:flex;flex-direction:column;gap:8px">';
  rows.forEach(r=>{
    const profTxt=r.profit==null?'—':ecEur(r.profit);
    const mgTxt=r.margin==null?'':' <span style="color:var(--accent2)">m'+r.margin.toFixed(0)+'%</span>';
    const share=totRev>0?r.revenue/totRev*100:0;
    const right='<span style="color:var(--text)">'+ecEur(r.revenue)+'</span> <span style="color:var(--dim)">'+share.toFixed(0)+'%</span> · <span style="color:var(--accent)">GP '+profTxt+'</span>'+mgTxt;
    h+=ecBar(r.name, r.revenue/maxRev, right, r.color, r.name);
  });
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">'+t('bar = revenue · GP = gross profit (revenue × margin)')+'</div>';
  h+='</div>';
  return h;
}

// ── 5. concentration & dependency ────────────────────────────────────────────
function ecConcentration(){
  const cc=(typeof chanConcentration==='function') ? chanConcentration(projects) : null;
  if(!cc) return pfEmpty(t('No channel data yet.'));
  const tile=(label,o)=>{
    if(!o || o.hhi==null) return ecKpi('—', label, t('no revenue'), '');
    const lvl=o.hhi>=0.5?'var(--danger)':(o.hhi>=0.25?'var(--warn)':'var(--accent2)');
    const word=o.hhi>=0.5?t('high'):(o.hhi>=0.25?t('moderate'):t('low'));
    return ecKpi(o.hhi.toFixed(2), label, escH(word)+' · '+t('top: {name} {pct}%',{name:o.top,pct:Math.round(o.topPct)}), lvl);
  };
  return '<div style="display:flex;flex-wrap:wrap;gap:10px">'
    +tile(t('Channel HHI'),cc.channel)+tile(t('Segment HHI'),cc.segment)+tile(t('Partner HHI'),cc.partner)
    +'</div><div style="font-size:9px;color:var(--dim);margin-top:8px;font-family:IBM Plex Mono,monospace">'
    +t('HHI = Σ share² over revenue (0–1). ≥0.50 high concentration · 0.25–0.50 moderate · <0.25 diversified.')+'</div>';
}

// ── 6. mix-shift what-if (interactive, pool-level, non-mutating) ─────────────
function ecMixSensitivity(){
  const pools=(typeof chanProfitPools==='function') ? chanProfitPools(projects) : {byChannel:[]};
  const ch=(pools.byChannel||[]).filter(r=>r.revenue>0);
  if(ch.length<2) return pfSection(t('MIX-SHIFT WHAT-IF'), t('Add at least two channels with revenue to simulate shifting mix.'), pfEmpty(t('Not enough channels.')));
  // Clamp indices to current channel list.
  _ecMixFrom=Math.max(0,Math.min(_ecMixFrom,ch.length-1));
  _ecMixTo  =Math.max(0,Math.min(_ecMixTo,ch.length-1));
  if(_ecMixFrom===_ecMixTo) _ecMixTo=(_ecMixFrom+1)%ch.length;
  const totRev=ch.reduce((s,r)=>s+r.revenue,0);
  const from=ch[_ecMixFrom], to=ch[_ecMixTo];
  const move=totRev*(_ecMixPct/100);
  const mFrom=from.margin==null?0:from.margin/100, mTo=to.margin==null?0:to.margin/100;
  const dProfit=move*(mTo-mFrom);
  const baseProfit=ch.reduce((s,r)=>s+(r.profit||0),0);
  const newBlended=totRev>0?((baseProfit+dProfit)/totRev*100):null;
  const oldBlended=totRev>0?(baseProfit/totRev*100):null;
  const opt=(sel)=>ch.map((r,i)=>'<option value="'+i+'"'+(i===sel?' selected':'')+'>'+escH(r.name)+' (m'+(r.margin==null?'—':Math.round(r.margin))+'%)</option>').join('');
  const controls='<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:11px">'
    +'<label style="color:var(--muted)">move</label>'
    +'<input type="range" min="0" max="30" step="1" value="'+_ecMixPct+'" oninput="ecMixSet(\'pct\',this.value)" style="width:120px">'
    +'<b style="color:var(--accent);font-family:IBM Plex Mono,monospace">'+_ecMixPct+'%</b>'
    +'<label style="color:var(--muted)">from</label><select class="cht-sel" onchange="ecMixSet(\'from\',this.value)">'+opt(_ecMixFrom)+'</select>'
    +'<label style="color:var(--muted)">to</label><select class="cht-sel" onchange="ecMixSet(\'to\',this.value)">'+opt(_ecMixTo)+'</select>'
    +'</div>';
  const dCls=dProfit>=0?'var(--accent2)':'var(--danger)';
  const inner='<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:baseline;font-size:13px">'
    +'<div>Δ gross profit <b style="color:'+dCls+'">'+(dProfit>=0?'+':'')+ecEur(dProfit)+'</b></div>'
    +'<div>Blended margin <b>'+ecPct(oldBlended)+'</b> → <b style="color:'+dCls+'">'+ecPct(newBlended)+'</b></div>'
    +'<div style="font-size:11px;color:var(--muted)">'+t('moving {v} of revenue {a} → {b}',{v:ecEur(move),a:escH(from.name),b:escH(to.name)})+'</div>'
    +'</div>';
  return pfSectionShell(t('MIX-SHIFT WHAT-IF'), t('Shift a slice of revenue between channels to see the gross-profit and blended-margin impact. Pool-level estimate — nothing is written back.'), controls, inner);
}
export function ecMixSet(key,val){
  if(key==='pct') _ecMixPct=Math.max(0,Math.min(30,parseInt(val,10)||0));
  else if(key==='from') _ecMixFrom=parseInt(val,10)||0;
  else if(key==='to')   _ecMixTo=parseInt(val,10)||0;
  const el=G('ec-sec-mix'); if(el) el.innerHTML=ecMixSensitivity();
}

// ── 7. margin realism (channel vs unit economics vs DTC) ─────────────────────
function ecMarginRealism(ds){
  const rows=ds.filter(d=>d.blended!=null || d.unitMarginPct!=null);
  if(!rows.length) return pfEmpty(t('Set channel margins and unit economics (price/cost) to compare.'));
  let h='<div style="overflow-x:auto"><table class="dtc-tbl" style="min-width:560px"><thead><tr>'
    +'<th>'+t('Project')+'</th><th>'+t('Channel margin')+'</th><th>'+t('Unit margin')+'</th><th>'+t('Gap')+'</th><th>'+t('Read')+'</th></tr></thead><tbody>';
  rows.forEach(d=>{
    const gap=(d.blended!=null&&d.unitMarginPct!=null)?d.blended-d.unitMarginPct:null;
    let read='—', col='var(--muted)';
    if(gap!=null){
      if(gap>10){ read=t('optimistic — channel margin above unit economics'); col='var(--danger)'; }
      else if(gap<-10){ read=t('conservative — headroom vs unit economics'); col='var(--accent2)'; }
      else { read=t('consistent'); col='var(--muted)'; }
    } else if(d.blended!=null && d.unitMarginPct==null){ read=t('no unit economics set'); }
      else if(d.blended==null){ read=t('no channel margin set'); }
    h+='<tr><td>'+escH(d.name)+'</td><td>'+ecPct(d.blended)+'</td><td>'+ecPct(d.unitMarginPct)+'</td>'
      +'<td style="color:'+(gap==null?'var(--muted)':(Math.abs(gap)>10?col:'var(--muted)'))+'">'+(gap==null?'—':(gap>=0?'+':'')+gap.toFixed(0)+' pt')+'</td>'
      +'<td style="color:'+col+';font-size:11px">'+read+'</td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}

// ── 8. cost gap → margin at risk ─────────────────────────────────────────────
function ecCostGap(ds){
  const rows=ds.filter(d=>d.dtcCurrent!=null && d.dtcTarget!=null);
  if(!rows.length) return pfEmpty(t('Set target margin and a design-to-cost cascade to see cost gaps.'));
  const maxRisk=rows.reduce((s,d)=>Math.max(s,Math.abs((d.dtcCurrent-d.dtcTarget)*(d.amortUnits||0))),1);
  let h='<div style="display:flex;flex-direction:column;gap:8px">';
  rows.forEach(d=>{
    const gap=d.dtcCurrent-d.dtcTarget;                       // €/unit over(+)/under(−) target
    const risk=gap*(d.amortUnits||0);                         // total € at risk over amortized volume
    const cls=gap>0?'var(--danger)':'var(--accent2)';
    const right='<span>cur €'+d.dtcCurrent.toFixed(0)+' / tgt €'+d.dtcTarget.toFixed(0)+'</span> · <b style="color:'+cls+'">'+(gap>0?'+':'')+gap.toFixed(0)+'€/u</b>'
      +(d.amortUnits>0?' · <span style="color:'+cls+'">'+ecEur(risk)+'</span>':' · <span style="color:var(--dim)">no volume</span>');
    h+=ecBar(d.name, Math.abs(risk)/maxRisk, right, gap>0?'var(--danger)':'var(--accent2)', d.name);
  });
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">'+t('bar = |margin at risk| = (current − target €/unit) × amortization volume · red = over target')+'</div>';
  h+='</div>';
  return h;
}

// ── 9. strategy coherence (by tactical intent) ───────────────────────────────
function ecStrategy(ds){
  const groups={};
  ds.forEach(d=>{ const k=(d.intent||'').trim()||t('Unassigned'); (groups[k]||(groups[k]={cost:0,rev:0,npv:0,n:0})); groups[k].cost+=d.cost; groups[k].rev+=d.chanRev; groups[k].npv+=(d.npv||0); groups[k].n++; });
  const rows=Object.keys(groups).map(k=>({k,g:groups[k]})).sort((a,b)=>(b.g.rev+b.g.cost)-(a.g.rev+a.g.cost));
  if(!rows.length) return pfEmpty(t('Tag projects with a tactical intent (Defend/Grow/Adapt/Diversify).'));
  const maxV=rows.reduce((s,r)=>Math.max(s,r.g.cost,r.g.rev),1);
  let h='<div style="display:flex;flex-direction:column;gap:12px">';
  rows.forEach(r=>{
    const col=(typeof PROJECT_INTENT_COLORS!=='undefined'&&PROJECT_INTENT_COLORS[r.k])||'var(--accent)';
    const npvCls=r.g.npv>=0?'var(--accent2)':'var(--danger)';
    h+='<div style="display:flex;align-items:center;gap:10px">'
      +'<div style="width:110px;font-size:11px;color:'+col+';font-weight:600">'+escH(r.k)+' <span style="color:var(--dim)">·'+r.g.n+'</span></div>'
      +'<div style="flex:1;display:flex;flex-direction:column;gap:3px">'
      +'<div style="height:11px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+(r.g.rev/maxV*100).toFixed(1)+'%;background:var(--accent2)"></div></div>'
      +'<div style="height:11px;background:var(--bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:'+(r.g.cost/maxV*100).toFixed(1)+'%;background:var(--accent)"></div></div>'
      +'</div>'
      +'<div style="width:190px;text-align:right;font-size:10px;font-family:IBM Plex Mono,monospace"><span style="color:var(--accent2)">'+ecEur(r.g.rev)+'</span>/<span style="color:var(--accent)">'+ecEur(r.g.cost)+'</span> · <span style="color:'+npvCls+'">'+ecEur(r.g.npv)+'</span></div></div>';
  });
  h+='<div style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace">'+t('top bar = revenue · bottom bar = cost · right = NPV')+'</div>';
  h+='</div>';
  return h;
}

// ── 10. decision quality ─────────────────────────────────────────────────────
function ecDecision(ds){
  const withNpv=ds.filter(d=>d.npv!=null).slice().sort((a,b)=>(b.npv)-(a.npv));
  const medNpv=withNpv.length?withNpv[Math.floor(withNpv.length/2)].npv:0;
  const flags=ds.map(d=>{
    const highValue=(d.npv!=null && d.npv>Math.max(0,medNpv));
    const lowAlign=(d.alignMin!=null && d.alignMin<=4);
    return {d, conflict:d.conflicts>0, riskyBet:highValue&&lowAlign};
  }).filter(f=>f.conflict||f.riskyBet);
  if(!flags.length) return '<div style="font-size:12px;color:var(--accent2);font-family:IBM Plex Mono,monospace">'+t('✓ No conflicts and no high-value / low-alignment bets.')+'</div>';
  let h='<div style="display:flex;flex-direction:column;gap:6px">';
  flags.forEach(f=>{
    const tags=[];
    if(f.conflict) tags.push('<span style="color:var(--danger)">⚠ '+f.d.conflicts+' '+t('conflict(s)')+'</span>');
    if(f.riskyBet) tags.push('<span style="color:var(--warn)">◆ '+t('high value, low alignment (min {n}/10)',{n:f.d.alignMin})+'</span>');
    h+='<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;border-bottom:1px solid var(--border);padding:5px 0">'
      +'<span style="color:var(--text)">'+escH(f.d.name)+' <span style="color:var(--dim);font-family:IBM Plex Mono,monospace">NPV '+ecEur(f.d.npv||0)+'</span></span>'
      +'<span style="text-align:right">'+tags.join(' · ')+'</span></div>';
  });
  h+='</div>';
  return h;
}

// ── 11. value per FTE ────────────────────────────────────────────────────────
function ecValuePerFte(ds){
  const rows=ds.filter(d=>d.avgFte>0).map(d=>({...d, npvPerFte:(d.npv||0)/d.avgFte, revPerFte:d.chanRev/d.avgFte}))
    .sort((a,b)=>b.npvPerFte-a.npvPerFte);
  if(!rows.length) return pfEmpty(t('No allocated FTE in the period — set a FROM/TO range with allocations.'));
  const maxAbs=rows.reduce((s,d)=>Math.max(s,Math.abs(d.npvPerFte)),1);
  let h='<div style="display:flex;flex-direction:column;gap:8px">';
  rows.forEach(d=>{
    const cls=d.npvPerFte>=0?'var(--accent2)':'var(--danger)';
    const right='<span style="color:'+cls+'">NPV/FTE '+ecEur(d.npvPerFte)+'</span> · rev/FTE '+ecEur(d.revPerFte)+' · '+d.avgFte.toFixed(1)+' FTE';
    h+=ecBar(d.name, Math.abs(d.npvPerFte)/maxAbs, right, cls, d.name);
  });
  h+='<div style="font-size:9px;color:var(--dim);margin-top:2px;font-family:IBM Plex Mono,monospace">'+t('bar = |NPV per average FTE| over the period')+'</div>';
  h+='</div>';
  return h;
}

// ── 12. trajectory over snapshots (async, on demand) ─────────────────────────
function ecTrajectoryShell(){
  const n=(typeof snapshots!=='undefined'&&Array.isArray(snapshots))?snapshots.length:0;
  const controls='<button class="sm" onclick="ecLoadTrajectory()">'+t('↻ Load history')+'</button>';
  const inner='<div id="ec-traj-body" style="font-size:11px;color:var(--muted)">'
    +(n?t('{n} snapshot(s) available — load to plot how portfolio NPV, revenue and blended margin have drifted.',{n})
        :t('No snapshots yet — take snapshots over time to build a trajectory.'))+'</div>';
  return pfSectionShell(t('TRAJECTORY (snapshots)'), t('How the portfolio’s value and margin have moved across saved snapshots, ending at the live state.'), controls, inner);
}
export function ecLoadTrajectory(){
  const box=G('ec-traj-body'); if(!box) return;
  if(typeof snapshots==='undefined' || !Array.isArray(snapshots) || !snapshots.length){ box.textContent=t('No snapshots to load.'); return; }
  if(typeof snapIdbGetData!=='function'){ box.textContent=t('Snapshot storage unavailable.'); return; }
  box.textContent=t('Loading…');
  const snaps=snapshots.filter(s=>s.scope==='full'||s.scope==='projects');
  Promise.all(snaps.map(s=>snapIdbGetData(s.id).then(d=>({s,d})).catch(()=>({s,d:null}))))
    .then(loaded=>{
      const pts=[];
      loaded.forEach(({s,d})=>{ if(d&&Array.isArray(d.projects)) pts.push(ecTrajPoint(new Date(s.ts).getTime(), s.label||'', d.projects)); });
      pts.push(ecTrajPoint(Date.now(), t('now'), projects));   // live state as the final point
      pts.sort((a,b)=>a.ts-b.ts);
      box.innerHTML=ecTrajCharts(pts);
    })
    .catch(()=>{ box.textContent=t('Could not read snapshot history.'); });
}
// One trajectory point: Σ NPV, Σ revenue, blended margin over a projects array.
function ecTrajPoint(ts, label, projList){
  let npv=0, rev=0, gp=0, anyGp=false;
  (projList||[]).forEach(p=>{
    const c=p.charter; if(!c||typeof c!=='object') return;
    const fin=calculateFinancials(c.financials); if(fin.npv!=null) npv+=fin.npv;
    const revM=Number(c.expectedRevenueM); const base=(Number.isFinite(revM)&&revM>0)?revM*1e6:0; rev+=base;
    const bl=(typeof chanBlendedMargin==='function')?chanBlendedMargin(c):null;
    if(bl!=null){ gp+=base*bl/100; anyGp=true; }
  });
  return { ts, label, npv, rev, margin:(anyGp&&rev>0)?gp/rev*100:null };
}
function ecTrajCharts(pts){
  if(pts.length<2) return '<div style="font-size:11px;color:var(--muted)">'+t('Need at least two points (one snapshot + now) to plot a trend.')+'</div>';
  const line=(title,key,fmt,color)=>{
    const vals=pts.map(p=>p[key]).filter(v=>v!=null&&Number.isFinite(v));
    if(!vals.length) return '';
    const W=520,H=90,padL=6,padR=6,padT=10,padB=14;
    let lo=Math.min(0,...vals), hi=Math.max(0,...vals); if(lo===hi){lo-=1;hi+=1;}
    const n=pts.length;
    const X=i=>padL+(n===1?0:i/(n-1))*(W-padL-padR);
    const Y=v=>padT+(1-(v-lo)/(hi-lo))*(H-padT-padB);
    let path='', dots='';
    pts.forEach((p,i)=>{ const v=p[key]; if(v==null||!Number.isFinite(v)) return;
      path+=(path?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)+' ';
      dots+='<circle cx="'+X(i).toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="2.4" fill="'+color+'"/>'; });
    const last=vals[vals.length-1];
    return '<div style="flex:1;min-width:240px"><div style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;margin-bottom:2px">'+escH(title)+' · <b style="color:'+color+'">'+fmt(last)+'</b></div>'
      +'<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" role="img" aria-label="'+escH(title)+'">'
      +'<line x1="'+padL+'" y1="'+Y(0).toFixed(1)+'" x2="'+(W-padR)+'" y2="'+Y(0).toFixed(1)+'" stroke="var(--border)" stroke-width="1"/>'
      +'<path d="'+path.trim()+'" fill="none" stroke="'+color+'" stroke-width="2"/>'+dots+'</svg></div>';
  };
  return '<div style="display:flex;flex-wrap:wrap;gap:16px">'
    +line(t('Portfolio NPV'),'npv',ecEur,'var(--accent)')
    +line(t('Expected revenue'),'rev',ecEur,'var(--accent2)')
    +line(t('Blended margin'),'margin',v=>v.toFixed(1)+'%','var(--warn)')
    +'</div><div style="font-size:9px;color:var(--dim);margin-top:6px;font-family:IBM Plex Mono,monospace">'
    +t('{n} points · oldest → live "now" (rightmost)',{n:pts.length})+'</div>';
}
