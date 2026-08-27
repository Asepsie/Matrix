/* ►► SECTION: CHANNEL-MIX ◄◄ OFFER MNGT › Channel mix rail view.
 *   openChannelsView()   — rail entry point (honours the shared picker mode)
 *   openChannels(projId) — open the panel for one project
 *   closeChannels()      — close the panel (syncs the rail highlight)
 *
 * A per-project go-to-market synoptic: Company/Project → Channels → Segments.
 * Each channel has a share % (basis = revenue | volume | emphasis), a margin %,
 * a named partner and one downstream segment. Data lives on
 * `charter.channelModel`, so it flows through save / backup / snapshot with the
 * charter and is back-filled by sanitiseCharter. Everything is `chan`-prefixed
 * and reuses the charter `cht-*` / `dtc-*` styles. Money is EUR.
 *
 * Shares the Charters HUB (target 'channels') + the Settings picker mode with
 * Financials / Trade-off / Design-to-cost (railChartPicker → hub | dropdown).
 * Pure helpers (chanMixSummary, chanChannelValue, chanAggregate) are reused by
 * the hub badges and by Portfolio analytics.
 */

let _chanProjId = null;

// Default channel swatch palette (assigned by index when a channel has no colour).
const CHAN_PALETTE = ['#5be5c8','#c8f135','#f1a435','#7aa2ff','#f14335','#c07af0','#5bd0f1','#f19bd0'];
function chanColor(ch,i){ return safeColor((ch&&ch.color) || CHAN_PALETTE[i%CHAN_PALETTE.length]); }
function chanHexOr(col){ return /^#[0-9a-f]{6}$/i.test(col) ? col : '#5be5c8'; }

// Picker mode (shared with the charter panels).
function chanPickerMode(){ return (typeof railChartPicker==='function' && railChartPicker()==='dropdown') ? 'dropdown' : 'hub'; }
function chanFirstProj(){ return projects.length ? projects[0].id : null; }

// ── open / close (rail view) ─────────────────────────────────────────────────
export function openChannelsView(){
  if(chanPickerMode()==='dropdown') openChannels(chanFirstProj());
  else openCharterHub('channels');
}
export function openChannels(projId){
  const p = projects.find(x=>x.id===+projId);
  _chanProjId = p ? p.id : (projects.length ? projects[0].id : null);
  const pp = projects.find(x=>x.id===_chanProjId);
  if(pp && (!pp.charter || typeof pp.charter!=='object')) pp.charter = makeCharter();
  const o=G('chan-overlay'); if(o) o.classList.add('show');
  chanRender();
}
export function closeChannels(){
  const o=G('chan-overlay'); if(o) o.classList.remove('show');
  if(typeof chtSyncRailAfterClose==='function') chtSyncRailAfterClose();
}
export function chanSelectProject(id){ openChannels(id); }
export function chanBackToHub(){ closeChannels(); openCharterHub('channels'); }

// ── data access + save ───────────────────────────────────────────────────────
function chanProject(){ return projects.find(x=>x.id===_chanProjId) || null; }
function chanCharter(){
  const p=chanProject(); if(!p) return null;
  if(!p.charter || typeof p.charter!=='object') p.charter=makeCharter();
  if(!p.charter.channelModel || typeof p.charter.channelModel!=='object') p.charter.channelModel=makeChannelModel();
  return p.charter;
}
function chanModel(){ const c=chanCharter(); return c ? c.channelModel : null; }
function chanSave(){ saveState(); }
export function chanSaveNow(){ saveNow(); flashSaved(); }

// ── money / unit formatters ──────────────────────────────────────────────────
function chanEur(v){
  v=+v||0;
  if(Math.abs(v)>=1e6) return (v/1e6).toFixed(Math.abs(v)>=1e7?0:1)+'M€';
  if(Math.abs(v)>=1e3) return Math.round(v/1e3)+'k€';
  return Math.round(v)+'€';
}
function chanUnits(v){ return Math.round(+v||0).toLocaleString('en-US'); }
// A channel's margin as a finite number, or null when none is entered. (Number()
// coerces null/'' to 0 — which would wrongly drag a blank margin into averages.)
function chanMarginOf(ch){
  if(ch.margin==null || ch.margin==='') return null;
  const m=Number(ch.margin);
  return Number.isFinite(m) ? m : null;
}

// ── pure helpers (also used by the hub + Portfolio analytics) ────────────────
// Channel-mix summary for a charter: channel count + share total + whether it's 100%.
function chanMixSummary(c){
  const chs=(c && c.channelModel && Array.isArray(c.channelModel.channels)) ? c.channelModel.channels : [];
  const total=chs.reduce((s,x)=>s+(Number(x.pct)||0),0);
  return { count:chs.length, total:Math.round(total*10)/10, ok:chs.length>0 && Math.abs(total-100)<0.05 };
}
// The value a channel represents, per the model basis. Returns {kind,v} or null
// (null = no derived value, e.g. emphasis basis or missing revenue/volume total).
function chanChannelValue(c, ch){
  const cm=c.channelModel, pct=Number(ch.pct)||0;
  if(cm.basis==='revenue'){
    const revM=Number(c.expectedRevenueM);
    if(!Number.isFinite(revM) || revM<=0) return null;
    return { kind:'eur', v:revM*1e6*pct/100 };
  }
  if(cm.basis==='volume'){
    const tu=Number(cm.totalUnits);
    if(!Number.isFinite(tu) || tu<=0) return null;
    return { kind:'units', v:tu*pct/100 };
  }
  return null;
}
// Aggregate channel revenue across projects → portfolio go-to-market mix. Revenue
// per channel = the charter's expected revenue (expectedRevenueM, M€→€) × the
// channel's share %, regardless of basis (pct is always the share) — the SAME base
// the panel splits, so the two agree. Projects with no expected revenue set
// contribute €0. Sorted desc by €. Kept pure so future visualizations can reuse it.
export function chanAggregate(projList){
  const byName={};
  (projList||[]).forEach(p=>{
    const c=p.charter; if(!c || typeof c!=='object') return;
    const cm=c.channelModel; if(!cm || !Array.isArray(cm.channels)) return;
    const revM=Number(c.expectedRevenueM);
    const rev=(Number.isFinite(revM) && revM>0) ? revM*1e6 : 0;
    cm.channels.forEach((ch,i)=>{
      const name=((ch.name||'').trim())||'—';
      const pct=Number(ch.pct)||0;
      const r=byName[name] || (byName[name]={name, revenue:0, mw:0, ws:0, count:0, color:''});
      r.revenue += rev*pct/100;
      const mg=chanMarginOf(ch);
      if(pct>0 && mg!=null){ r.mw+=pct*mg; r.ws+=pct; }
      if(!r.color) r.color=chanColor(ch,i);
      r.count++;
    });
  });
  return Object.values(byName)
    .map(r=>({ name:r.name, revenue:r.revenue, margin:r.ws>0?r.mw/r.ws:null, count:r.count, color:r.color }))
    .sort((a,b)=>b.revenue-a.revenue);
}

// Share-weighted blended margin (%) of a charter's channel mix, or null when no
// channel has a margin. Same rule as the panel totals (chanMarginOf excludes blanks).
export function chanBlendedMargin(c){
  const cm=c && c.channelModel; if(!cm || !Array.isArray(cm.channels)) return null;
  let mw=0, ws=0;
  cm.channels.forEach(ch=>{ const p=Number(ch.pct)||0, mg=chanMarginOf(ch); if(p>0 && mg!=null){ mw+=p*mg; ws+=p; } });
  return ws>0 ? mw/ws : null;
}
// Portfolio profit pools: revenue AND gross profit (revenue × channel margin)
// aggregated by channel and by segment, using the same expectedRevenueM base as
// the panel. profit/margin are null for a pool whose channels have no margin set.
export function chanProfitPools(projList){
  const agg=keyFn=>{
    const map={};
    (projList||[]).forEach(p=>{
      const c=p.charter; if(!c || typeof c!=='object') return;
      const cm=c.channelModel; if(!cm || !Array.isArray(cm.channels)) return;
      const revM=Number(c.expectedRevenueM);
      const base=(Number.isFinite(revM) && revM>0) ? revM*1e6 : 0;
      cm.channels.forEach((ch,i)=>{
        const key=((keyFn(ch)||'').trim())||'—';
        const rev=base*(Number(ch.pct)||0)/100;
        const mg=chanMarginOf(ch);
        const r=map[key] || (map[key]={name:key, revenue:0, profit:0, hasMargin:false, color:''});
        r.revenue+=rev;
        if(mg!=null){ r.profit+=rev*mg/100; r.hasMargin=true; }
        if(!r.color) r.color=chanColor(ch,i);
      });
    });
    return Object.values(map)
      .map(r=>({ name:r.name, revenue:r.revenue, profit:r.hasMargin?r.profit:null,
                 margin:(r.hasMargin&&r.revenue>0)?r.profit/r.revenue*100:null, color:r.color }))
      .sort((a,b)=>b.revenue-a.revenue);
  };
  const byChannel=agg(ch=>ch.name), bySegment=agg(ch=>ch.segment);
  return {
    byChannel, bySegment,
    totalRevenue: byChannel.reduce((s,r)=>s+r.revenue,0),
    totalProfit:  byChannel.reduce((s,r)=>s+(r.profit||0),0),
  };
}
// Concentration (normalised HHI, 0–1) + top dependency by channel / segment /
// partner. HHI = Σ share² over revenue shares; higher = more concentrated.
export function chanConcentration(projList){
  const hhi=rows=>{
    const tot=rows.reduce((s,r)=>s+r.revenue,0);
    if(tot<=0) return { hhi:null, top:null, topPct:null };
    let h=0, top=null, topR=-1;
    rows.forEach(r=>{ const sh=r.revenue/tot; h+=sh*sh; if(r.revenue>topR){ topR=r.revenue; top=r.name; } });
    return { hhi:h, top, topPct:topR/tot*100 };
  };
  const pools=chanProfitPools(projList);
  const pmap={};
  (projList||[]).forEach(p=>{
    const c=p.charter; if(!c) return; const cm=c.channelModel; if(!cm || !Array.isArray(cm.channels)) return;
    const revM=Number(c.expectedRevenueM), base=(Number.isFinite(revM)&&revM>0)?revM*1e6:0;
    cm.channels.forEach(ch=>{ const key=((ch.partner||'').trim())||'—'; (pmap[key] || (pmap[key]={name:key,revenue:0})).revenue += base*(Number(ch.pct)||0)/100; });
  });
  return {
    channel: hhi(pools.byChannel),
    segment: hhi(pools.bySegment.filter(r=>r.name!=='—')),
    partner: hhi(Object.values(pmap).filter(r=>r.name!=='—')),
  };
}

// ── render ───────────────────────────────────────────────────────────────────
function chanRender(){
  const body=G('chan-body'); if(!body) return;
  chanRenderPicker();
  const p=chanProject();
  const ttl=G('chan-title'); if(ttl) ttl.textContent = p ? (p.name||'PROJECT') : 'CHANNEL MIX';
  if(!projects.length){ body.innerHTML='<div class="cht-muted" style="padding:20px">No projects yet — add a project on the Portfolio matrix.</div>'; return; }
  const c=chanCharter(); if(!c){ body.innerHTML=''; return; }
  body.innerHTML = chanHeadForm(c,p) + chanSynopticWrap(c,p) + chanTotalsBar(c) + chanEditor(c);
}

function chanRenderPicker(){
  const slot=G('chan-pick'); if(!slot) return;
  if(chanPickerMode()==='dropdown'){
    const pickable = projects.filter(p=>(typeof projIsArchived!=='function')||!projIsArchived(p)||p.id===_chanProjId);
    slot.innerHTML = `<label class="cht-hl">PROJECT</label>
      <select class="cht-sel" onchange="chanSelectProject(this.value)">
        ${pickable.length ? pickable.map(p=>`<option value="${p.id}"${p.id===_chanProjId?' selected':''}>${escH(p.name||'Untitled project')}${(typeof projIsArchived==='function'&&projIsArchived(p))?' ('+escH(t('archived'))+')':''}</option>`).join('')
                          : '<option>— no projects —</option>'}
      </select>`;
  } else {
    // Hub mode: ← BACK already returns to the hub — show the project NAME for context
    // instead of a redundant second back control.
    const p = projects.find(x=>x.id===_chanProjId);
    slot.innerHTML = `<span class="cht-hl" style="opacity:.85">${escH(p?(p.name||'Untitled project'):'—')}</span>`;
  }
}

function chanHeadForm(c,p){
  const cm=c.channelModel;
  const bases=[['revenue','Revenue split'],['volume','Unit volume'],['emphasis','GTM emphasis']];
  const revM=Number(c.expectedRevenueM);
  const ctx = cm.basis==='revenue'
    ? (Number.isFinite(revM)&&revM>0
        ? `Splitting expected revenue <b>${chanEur(revM*1e6)}</b> (set on Financials ▸ Overview) across channels.`
        : `No expected revenue set — add it on <b>Financials ▸ Overview</b> to see € per channel.`)
    : cm.basis==='volume'
    ? `Splitting the total unit volume across channels.`
    : `Relative go-to-market weighting only (no € or units).`;
  return `<div class="chan-head">
    <label class="cht-f"><span class="cht-l">Company</span>
      <input class="cht-in" value="${escH(cm.company||'')}" placeholder="Company name" oninput="chanSetCompany(this.value)"></label>
    <label class="cht-f"><span class="cht-l">Project</span>
      <input class="cht-in" value="${escH((p&&p.name)||'')}" placeholder="Project name" oninput="chanSetProjectName(this.value)"></label>
    <div class="cht-f cht-f-wide"><span class="cht-l">Percentages mean</span>
      <div class="cht-toggle">
        ${bases.map(([b,l])=>`<button class="cht-tg${cm.basis===b?' on':''}" onclick="chanSetBasis('${b}')">${l}</button>`).join('')}
      </div></div>
    ${cm.basis==='volume' ? `<label class="cht-f"><span class="cht-l">Total units</span>
      <input class="cht-in" type="number" min="0" value="${cm.totalUnits==null?'':cm.totalUnits}" oninput="chanSetTotalUnits(this.value)"></label>` : ''}
    <div class="chan-ctx">${ctx}</div>
  </div>`;
}

function chanSynopticWrap(c,p){
  return `<div class="chan-card">
    <div class="chan-sec-t">GO-TO-MARKET SYNOPTIC</div>
    <div id="chan-synoptic" class="chan-synoptic">${chanSynopticSVG(c,p)}</div>
  </div>`;
}

function chanTotalsBar(c){ return `<div class="chan-totals" id="chan-totals">${chanTotalsInner(c)}</div>`; }
function chanTotalsInner(c){
  const m=chanMixSummary(c);
  const chs=c.channelModel.channels||[];
  let mw=0, ws=0;
  chs.forEach(ch=>{ const p=Number(ch.pct)||0, mg=chanMarginOf(ch); if(p>0&&mg!=null){ mw+=p*mg; ws+=p; } });
  const blended = ws>0 ? mw/ws : null;
  const cls = m.ok ? 'good' : (m.count ? 'bad' : '');
  return `<span>Share total: <b class="${cls}">${m.total}%</b>${m.ok?' ✓':(m.count?' — should total 100%':'')}</span>`
       + (blended!=null?`<span>Blended margin: <b>${blended.toFixed(1)}%</b></span>`:'')
       + `<span>${m.count} channel${m.count===1?'':'s'}</span>`;
}

function chanRowVal(c,ch){
  const val=chanChannelValue(c,ch);
  if(!val) return '<span class="cht-muted">—</span>';
  return val.kind==='eur' ? chanEur(val.v) : chanUnits(val.v)+' u';
}

function chanEditor(c){
  const chs=c.channelModel.channels||[];
  const rows=chs.map((ch,i)=>{
    const col=chanColor(ch,i);
    return `<tr>
      <td><span class="chan-swatch" id="chan-sw-${i}" style="background:${col}"></span></td>
      <td><input class="cht-in" value="${escH(ch.name)}" placeholder="channel" oninput="chanSet(${i},'name',this.value)"></td>
      <td><input class="cht-in chan-num" type="number" min="0" max="100" value="${ch.pct==null?'':ch.pct}" oninput="chanSetNum(${i},'pct',this.value)"></td>
      <td><input class="cht-in chan-num" type="number" min="0" max="100" value="${ch.margin==null?'':ch.margin}" placeholder="—" oninput="chanSetNum(${i},'margin',this.value)"></td>
      <td><input class="cht-in" value="${escH(ch.partner)}" placeholder="partner/account" oninput="chanSet(${i},'partner',this.value)"></td>
      <td><input class="cht-in" value="${escH(ch.segment)}" placeholder="segment" oninput="chanSet(${i},'segment',this.value)"></td>
      <td><input class="chan-color" type="color" value="${chanHexOr(col)}" title="Channel colour" oninput="chanSet(${i},'color',this.value)"></td>
      <td class="chan-val" id="chan-rowval-${i}">${chanRowVal(c,ch)}</td>
      <td><button class="cht-cf-del" title="Remove channel" onclick="chanRemove(${i})">×</button></td>
    </tr>`;
  }).join('');
  return `<div class="chan-card">
    <div class="chan-sec-t">CHANNELS</div>
    <div class="chan-tbl-wrap">
      <table class="dtc-tbl chan-tbl">
        <thead><tr><th></th><th>Channel</th><th>Share %</th><th>Margin %</th><th>Partner</th><th>Segment</th><th>Colour</th><th>Value</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="9" class="cht-muted">No channels — add one.</td></tr>'}</tbody>
      </table>
    </div>
    <button class="sm" onclick="chanAdd()">+ Add channel</button>
  </div>`;
}

// Recompute ONLY the derived outputs in place (synoptic + totals + per-row value
// + swatches) — never the input elements — so typing keeps focus & scroll.
function chanRefreshDerived(){
  const c=chanCharter(); if(!c) return;
  const p=chanProject();
  const syn=G('chan-synoptic'); if(syn) syn.innerHTML=chanSynopticSVG(c,p);
  const tot=G('chan-totals'); if(tot) tot.innerHTML=chanTotalsInner(c);
  (c.channelModel.channels||[]).forEach((ch,i)=>{
    const rv=G('chan-rowval-'+i); if(rv) rv.innerHTML=chanRowVal(c,ch);
    const sw=G('chan-sw-'+i);     if(sw) sw.style.background=chanColor(ch,i);
  });
}

// ── mutators ─────────────────────────────────────────────────────────────────
export function chanSet(i,key,value){
  const m=chanModel(); if(!m||!m.channels[i]) return;
  m.channels[i][key]=value; chanSave(); chanRefreshDerived();
}
export function chanSetNum(i,key,value){
  const m=chanModel(); if(!m||!m.channels[i]) return;
  m.channels[i][key] = value==='' ? (key==='margin'?null:0) : (Number(value)||0);
  chanSave(); chanRefreshDerived();
}
export function chanAdd(){ const m=chanModel(); if(!m) return; m.channels.push(makeChannel()); chanSave(); chanRender(); }
export function chanRemove(i){ const m=chanModel(); if(!m) return; m.channels.splice(i,1); chanSave(); chanRender(); }
export function chanSetBasis(b){ const m=chanModel(); if(!m) return; m.basis=b; chanSave(); chanRender(); }
export function chanSetTotalUnits(v){ const m=chanModel(); if(!m) return; m.totalUnits = v==='' ? null : (Number(v)||0); chanSave(); chanRefreshDerived(); }
export function chanSetCompany(v){
  const m=chanModel(); if(!m) return; m.company=v; chanSave();
  const c=chanCharter(), syn=G('chan-synoptic'); if(syn&&c) syn.innerHTML=chanSynopticSVG(c,chanProject());
}
export function chanSetProjectName(v){
  const p=chanProject(); if(!p) return; p.name=v; chanSave();
  const c=chanCharter(), syn=G('chan-synoptic'); if(syn&&c) syn.innerHTML=chanSynopticSVG(c,p);
  const ttl=G('chan-title'); if(ttl) ttl.textContent=v||'PROJECT';
}

// ── the go-to-market synoptic (pure SVG, CSS-var themed) ─────────────────────
// Three tiers, top-down: Company/Project → Channels → Segments. One arrow per
// channel (thickness ∝ share), one segment box per channel (so a segment reached
// by two channels appears under each — the synoptic never needs crossing arrows).
function chanArrowHead(cx, ty, col){
  return `<path d="M ${cx-5} ${ty-6} L ${cx+5} ${ty-6} L ${cx} ${ty} Z" fill="${col}" fill-opacity="0.85"/>`;
}
function chanWrapText(txt, cx, y, maxW){
  const words=String(txt).split(/\s+/);
  const per=Math.max(6, Math.floor(maxW/5.6));
  const lines=[]; let cur='';
  words.forEach(w=>{ if((cur+' '+w).trim().length>per && cur){ lines.push(cur); cur=w; } else cur=(cur?cur+' ':'')+w; });
  if(cur) lines.push(cur);
  const two=lines.slice(0,2);
  if(lines.length>2) two[1]=two[1].slice(0,Math.max(0,per-1))+'…';
  return two.map((ln,i)=>`<text x="${cx}" y="${y+i*12}" fill="var(--text)" font-size="10" text-anchor="middle">${escH(ln)}</text>`).join('');
}
function chanSynopticSVG(c,p){
  const cm=c.channelModel, chs=cm.channels||[];
  if(!chs.length) return '<div class="cht-muted" style="padding:24px;text-align:center">No channels yet — add one below to build the go-to-market synoptic.</div>';
  const P=18, boxW=156, gx=20, chH=60, compH=48, segH=46;
  const N=chs.length, contentW=N*boxW+(N-1)*gx;
  const W=Math.max(360, contentW+2*P);
  const x0=(W-contentW)/2;
  const y0=P, y1=y0+compH+56, y2=y1+chH+54, H=y2+segH+P;
  const cxOf=i=>x0+i*(boxW+gx)+boxW/2;
  const compW=Math.min(contentW, 300), compX=(W-compW)/2;

  let arrows='', chan='', seg='';
  chs.forEach((ch,i)=>{
    const cx=cxOf(i), col=chanColor(ch,i), pct=Number(ch.pct)||0;
    // company → channel arrow (thickness ∝ share)
    const sw=(1.4+Math.max(0,Math.min(100,pct))/9).toFixed(1);
    const sx=W/2, sy=y0+compH, ty=y1, midY=(sy+ty)/2;
    arrows+=`<path d="M ${sx} ${sy} C ${sx} ${midY}, ${cx} ${midY}, ${cx} ${ty-7}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-opacity="0.5"/>`;
    arrows+=chanArrowHead(cx, ty-1, col);
    // channel box
    const bx=cx-boxW/2;
    chan+=`<rect x="${bx}" y="${y1}" width="${boxW}" height="${chH}" rx="8" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="1.5"/>`;
    chan+=`<rect x="${bx+8}" y="${y1+chH-9}" width="${boxW-16}" height="4" rx="2" fill="var(--border)"/>`;
    chan+=`<rect x="${bx+8}" y="${y1+chH-9}" width="${((boxW-16)*Math.max(0,Math.min(100,pct))/100).toFixed(1)}" height="4" rx="2" fill="${col}"/>`;
    chan+=`<text x="${cx}" y="${y1+18}" fill="var(--text)" font-size="12" font-weight="700" text-anchor="middle">${escH(ch.name||'—')}</text>`;
    const val=chanChannelValue(c,ch);
    const valTxt = val ? (val.kind==='eur'?chanEur(val.v):chanUnits(val.v)+' u') : '';
    chan+=`<text x="${cx}" y="${y1+35}" fill="${col}" font-size="13" font-weight="700" text-anchor="middle" font-family="IBM Plex Mono,monospace">${pct}%${valTxt?`  ·  ${valTxt}`:''}</text>`;
    const meta=[];
    if(ch.margin!=null && ch.margin!=='') meta.push('m '+ch.margin+'%');
    if(ch.partner) meta.push(escH(ch.partner));
    if(meta.length) chan+=`<text x="${cx}" y="${y1+49}" fill="var(--muted)" font-size="9" text-anchor="middle" font-family="IBM Plex Mono,monospace">${meta.join('  ·  ')}</text>`;
    // channel → segment
    const segTxt=(ch.segment||'').trim();
    seg+=`<line x1="${cx}" y1="${y1+chH}" x2="${cx}" y2="${y2-7}" stroke="${col}" stroke-width="1.6" stroke-opacity="0.5"/>`;
    seg+=chanArrowHead(cx, y2-1, col);
    if(segTxt){
      seg+=`<rect x="${bx}" y="${y2}" width="${boxW}" height="${segH}" rx="8" fill="var(--surface)" stroke="${col}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      seg+=`<text x="${cx}" y="${y2+16}" fill="var(--muted)" font-size="8" text-anchor="middle" font-family="IBM Plex Mono,monospace" letter-spacing="0.08em">SEGMENT</text>`;
      seg+=chanWrapText(segTxt, cx, y2+31, boxW-14);
    } else {
      seg+=`<rect x="${bx}" y="${y2}" width="${boxW}" height="${segH}" rx="8" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/>`;
      seg+=`<text x="${cx}" y="${y2+segH/2+3}" fill="var(--dim)" font-size="9" text-anchor="middle">+ add segment</text>`;
    }
  });
  const comp=`<rect x="${compX}" y="${y0}" width="${compW}" height="${compH}" rx="10" fill="var(--accent)" fill-opacity="0.10" stroke="var(--accent)" stroke-width="1.5"/>
    <text x="${W/2}" y="${y0+21}" fill="var(--text)" font-size="13" font-weight="700" text-anchor="middle">${escH(cm.company||'Company')}</text>
    <text x="${W/2}" y="${y0+38}" fill="var(--muted)" font-size="11" text-anchor="middle">${escH((p&&p.name)||'Project')}</text>`;
  const minW=Math.max(360, Math.min(W, 760));
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg chan-svg" role="img" aria-label="Go-to-market channel synoptic" style="width:100%;height:auto;min-width:${minW}px">
    ${arrows}${comp}${chan}${seg}
  </svg>`;
}
