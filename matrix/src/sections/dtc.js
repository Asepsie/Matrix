/* ►► SECTION: DESIGN-TO-COST ◄◄ WORK › Design to cost rail view.
 *   openDtc / closeDtc     — the rail view (a VIEW, so rail-inset; wrapped by railnav)
 *   dtcSelectProject(id)   — pick which project's cost model to work on
 *
 * A per-project design-to-cost workspace, reading the unit-cost envelope from the
 * charter financials (price − target margin) and the priorities from the trade-off
 * square. Four parts: target-cost cascade · cost-down waterfall · design guidelines
 * (from the square) · demand responses. Data lives on `charter.costModel` and on
 * each demand's `response`, so it flows through save/backup with the charter.
 * All money is EUR per unit. Everything is `dtc`-prefixed. Reuses cht-* styles.
 */

let _dtcProjId = null;
const _dtcOpen = new Set();   // expanded subsystem indices (UI-only, not persisted)

// ── open / close (rail view) ─────────────────────────────────────────────────
export function openDtc(){
  if(!G('dtc-overlay')) return;
  if(_dtcProjId==null || !projects.some(p=>p.id===_dtcProjId))
    _dtcProjId = projects.length ? projects[0].id : null;
  G('dtc-overlay').classList.add('show');
  dtcRender();
}
export function closeDtc(){ const o=G('dtc-overlay'); if(o) o.classList.remove('show'); }

function dtcCharter(){
  const p=projects.find(x=>x.id===_dtcProjId);
  if(!p) return null;
  if(!p.charter||typeof p.charter!=='object') p.charter=makeCharter();
  if(!p.charter.costModel) p.charter.costModel={subsystems:[],levers:[]};
  return p.charter;
}
function dtcSave(){ saveState(); }
function dtcEur(v){ return v==null||!Number.isFinite(+v) ? '—' : `€${(+v).toLocaleString('en-US',{maximumFractionDigits:2})}`; }

export function dtcSelectProject(id){ _dtcProjId=+id; dtcRender(); }

// ── top-level render ─────────────────────────────────────────────────────────
function dtcRender(){
  const body=G('dtc-body'); if(!body) return;
  // project picker (populated live)
  const picker=G('dtc-picker');
  if(picker){
    picker.innerHTML = projects.length
      ? projects.map(p=>`<option value="${p.id}"${p.id===_dtcProjId?' selected':''}>${escH(p.name||'Untitled project')}</option>`).join('')
      : '<option>— no projects —</option>';
  }
  if(!projects.length){ body.innerHTML='<div class="cht-muted" style="padding:20px">No projects yet — add one on the Portfolio matrix.</div>'; return; }
  const c=dtcCharter(); if(!c){ body.innerHTML=''; return; }
  body.innerHTML =
    dtcCascadeSection(c) +
    dtcWaterfallSection(c) +
    dtcCompetitionSection(c) +
    dtcGuidelinesSection(c) +
    dtcResponsesSection(c);
}

// Recompute ONLY the derived outputs in place — never the input elements — so
// typing in a number field keeps focus and scroll position. Called from the
// numeric setters (structural changes still do a full dtcRender).
function dtcRefreshDerived(){
  const c=dtcCharter(); if(!c) return;
  const set=(id,html)=>{ const el=G(id); if(el) el.innerHTML=html; };
  set('dtc-cascade-live', dtcCascadeLive(c));
  set('dtc-push',         dtcPushBtn(c));
  set('dtc-wf-live',      dtcWaterfallLive(c));
  set('dtc-comp-live',    dtcCompBarsSVG(c));
  c.costModel.subsystems.forEach((s,i)=>{
    const cur=dtcSubCost(s), gap=cur-(Number(s.target)||0), excl=s.include===false, hasItems=dtcHasItems(s);
    const g=G('dtc-gap-'+i);
    if(g){ g.textContent = excl?'excl.':(s.target==null&&cur===0&&!hasItems?'—':(gap>0?'+':'')+dtcEur(gap));
      g.className='dtc-gap '+(excl?'':gap>0?'bad':gap<0?'good':'');
      const row=g.closest('tr'); if(row) row.className = excl?'dtc-excl':gap>0?'dtc-over':''; }
    const cu=G('dtc-cur-'+i); if(cu) cu.textContent=dtcEur(cur);
    const cn=G('dtc-cnt-'+i); if(cn) cn.textContent=hasItems?`${s.items.filter(it=>it.include!==false).length}/${s.items.length}`:'';
  });
  c.costModel.competitors.forEach((k,i)=>{
    const adj=(Number(k.cogs)||0)-(Number(k.volumeSaving)||0);
    const margin=(Number(k.sellingPrice)||0)-adj-(Number(k.brandPremium)||0);
    const mPct=k.sellingPrice>0?margin/k.sellingPrice*100:null;
    const a=G('dtc-cadj-'+i); if(a) a.textContent=dtcEur(adj);
    const m=G('dtc-cmrg-'+i); if(m) m.innerHTML=`${dtcEur(margin)} ${mPct!=null?`<span class="cht-muted">(${mPct.toFixed(0)}%)</span>`:''}`;
  });
}

/* ── Competition analysis (up to 5 competitors + Us) ─────────────────────────── */
function dtcCompetitionSection(c){
  const comps=c.costModel.competitors;
  const rows=comps.map((k,i)=>{
    const adj=(Number(k.cogs)||0)-(Number(k.volumeSaving)||0);
    const margin=(Number(k.sellingPrice)||0)-adj-(Number(k.brandPremium)||0);
    const mPct=k.sellingPrice>0?margin/k.sellingPrice*100:null;
    return `<tr>
      <td><input class="cht-in" value="${escH(k.name)}" placeholder="competitor…" oninput="dtcCompSet(${i},'name',this.value)"></td>
      <td><input class="cht-in dtc-num" type="number" value="${k.sellingPrice||''}" oninput="dtcCompSet(${i},'sellingPrice',this.value)"></td>
      <td><input class="cht-in dtc-num" type="number" value="${k.cogs||''}" oninput="dtcCompSet(${i},'cogs',this.value)"></td>
      <td><input class="cht-in dtc-num" type="number" value="${k.volumeSaving||''}" oninput="dtcCompSet(${i},'volumeSaving',this.value)"></td>
      <td><input class="cht-in dtc-num" type="number" value="${k.brandPremium||''}" oninput="dtcCompSet(${i},'brandPremium',this.value)"></td>
      <td class="dtc-num" id="dtc-cadj-${i}">${dtcEur(adj)}</td>
      <td class="dtc-num" id="dtc-cmrg-${i}">${dtcEur(margin)} ${mPct!=null?`<span class="cht-muted">(${mPct.toFixed(0)}%)</span>`:''}</td>
      <td><button class="cht-cf-del" onclick="dtcCompRemove(${i})">×</button></td>
    </tr>`;
  }).join('');
  return `<section class="dtc-sec">
    <h3 class="dtc-h">⑤ Competition analysis</h3>
    <div class="cht-hint">Benchmark up to 5 competitors + your own structure. <b>Adjusted cost</b> = COGS − volume saving (their scale advantage); <b>implied margin</b> = price − adjusted cost − brand premium. The bar shows how much of each price is cost, margin, and brand.</div>
    <div id="dtc-comp-live">${dtcCompBarsSVG(c)}</div>
    <table class="dtc-tbl"><thead><tr><th>Competitor</th><th>Price €</th><th>COGS €</th><th>Vol. saving €</th><th>Brand €</th><th>Adj. cost</th><th>Implied margin</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="8" class="cht-muted">No competitors yet.</td></tr>'}</tbody></table>
    ${comps.length<5?`<button class="sm" onclick="dtcCompAdd()">+ Add competitor</button>`:'<span class="cht-muted" style="font-size:11px">Max 5 competitors.</span>'}
  </section>`;
}
export function dtcCompAdd(){ const cm=dtcCharter().costModel; if(cm.competitors.length>=5) return; cm.competitors.push(makeCompetitor()); dtcSave(); dtcRender(); }
export function dtcCompRemove(i){ dtcCharter().costModel.competitors.splice(i,1); dtcSave(); dtcRender(); }
export function dtcCompSet(i,key,value){
  const k=dtcCharter().costModel.competitors[i]; if(!k) return;
  k[key] = key==='name' ? value : (Number(value)||0);
  dtcSave();
  if(key!=='name') dtcRefreshDerived();   // updates derived cols + bars only
}

// Horizontal stacked bars: each price = cost + margin + brand, incl. an "Us" row.
function dtcCompBarsSVG(c){
  const rows=c.costModel.competitors.map(k=>{
    const cost=(Number(k.cogs)||0)-(Number(k.volumeSaving)||0), brand=Number(k.brandPremium)||0, price=Number(k.sellingPrice)||0;
    return { name:k.name||'?', cost, margin:price-cost-brand, brand, price };
  });
  const eco=resolveUnitEconomics(c.financials), ourPrice=eco.price||0, ourCost=dtcCurrentTotal(c);
  rows.push({ name:'Us', cost:ourCost, margin:ourPrice-ourCost, brand:0, price:ourPrice, us:true });
  const data=rows.filter(r=>r.price>0||r.cost>0);
  if(!data.length) return '';
  const xmax=Math.max(...data.map(r=>Math.max(r.price, r.cost+Math.max(0,r.margin)+r.brand)))*1.05||1;
  const W=680, rowH=26, padL=92, padR=44, top=8, H=top+data.length*rowH+18;
  const sc=v=>(v/xmax)*(W-padL-padR);
  let bars='';
  data.forEach((r,i)=>{
    const y=top+i*rowH; let x=padL;
    const seg=(w,col,label)=>{ if(w<=0) return ''; const s=`<rect x="${x.toFixed(1)}" y="${y}" width="${sc(w).toFixed(1)}" height="16" fill="${col}" opacity="${r.us?1:0.8}"><title>${label}: ${dtcEur(w)}</title></rect>`; x+=sc(w); return s; };
    bars+=`<text x="${padL-6}" y="${y+12}" fill="${r.us?'var(--accent)':'var(--text)'}" font-size="10" text-anchor="end" font-weight="${r.us?700:400}">${escH(String(r.name).slice(0,13))}</text>`;
    bars+=seg(r.cost,'var(--muted)','cost')+seg(Math.max(0,r.margin),'var(--accent)','margin')+seg(r.brand,'#a78bfa','brand');
    bars+=`<text x="${(padL+sc(r.price)+4).toFixed(1)}" y="${y+12}" fill="var(--muted)" font-size="9">${dtcEur(r.price)}</text>`;
  });
  const ly=H-4;
  const leg=`<g font-size="8.5">
    <rect x="${padL}" y="${ly-7}" width="8" height="8" fill="var(--muted)"/><text x="${padL+11}" y="${ly}" fill="var(--muted)">cost</text>
    <rect x="${padL+48}" y="${ly-7}" width="8" height="8" fill="var(--accent)"/><text x="${padL+59}" y="${ly}" fill="var(--muted)">margin</text>
    <rect x="${padL+108}" y="${ly-7}" width="8" height="8" fill="#a78bfa"/><text x="${padL+119}" y="${ly}" fill="var(--muted)">brand</text></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="Competitor price decomposition" style="max-width:680px">${bars}${leg}</svg>`;
}

// Envelope + rollups shared across sections.
function dtcEnvelope(c){ return dtcTarget(c.financials); }         // max allowable €/unit (or null)
// A subsystem's current cost: 0 if excluded, else the sum of its INCLUDED items
// when it has any, else its manually-entered `current`.
function dtcSubCost(s){
  if(s.include===false) return 0;
  if(Array.isArray(s.items) && s.items.length)
    return s.items.reduce((t,it)=> t + (it.include===false ? 0 : (Number(it.cost)||0)), 0);
  return Number(s.current)||0;
}
function dtcHasItems(s){ return Array.isArray(s.items) && s.items.length>0; }
function dtcCurrentTotal(c){ return c.costModel.subsystems.reduce((s,x)=>s+dtcSubCost(x),0); }
function dtcAllocTotal(c){ return c.costModel.subsystems.reduce((s,x)=> s + (x.include===false?0:(Number(x.target)||0)),0); }
function dtcLeverSum(c,status){ return c.costModel.levers.filter(l=>l.status===status).reduce((s,l)=>s+(Number(l.saving)||0),0); }

/* ── #1 Target-cost cascade ─────────────────────────────────────────────────── */
function dtcCascadeSection(c){
  const env=dtcEnvelope(c), subs=c.costModel.subsystems;
  const cur=dtcCurrentTotal(c), alloc=dtcAllocTotal(c);
  const owners=['',...CHT_FUNCS.map(([,l])=>l),'Other'];
  const rows=subs.map((s,i)=>{
    const excl=s.include===false, hasItems=dtcHasItems(s), open=_dtcOpen.has(i);
    const cur=dtcSubCost(s), gap=cur-(Number(s.target)||0);
    const curCell = hasItems
      ? `<span class="dtc-derived" id="dtc-cur-${i}" title="Sum of included items">${dtcEur(cur)}</span>`
      : `<input class="cht-in dtc-num" type="number" value="${s.current==null?'':s.current}" oninput="dtcSubSet(${i},'current',this.value)">`;
    let out=`<tr class="${excl?'dtc-excl':gap>0?'dtc-over':''}">
      <td class="dtc-expand"><button class="dtc-caret${open?' open':''}" title="${hasItems?'Show/hide items':'No items'}" onclick="dtcToggleSub(${i})">${hasItems?'▸':'·'}</button></td>
      <td><input type="checkbox" ${excl?'':'checked'} title="Include in analysis" onchange="dtcSubToggle(${i})"></td>
      <td><input class="cht-in" value="${escH(s.name)}" placeholder="subsystem…" oninput="dtcSubSet(${i},'name',this.value)"><span class="dtc-count" id="dtc-cnt-${i}">${hasItems?`${s.items.filter(it=>it.include!==false).length}/${s.items.length}`:''}</span></td>
      <td><input class="cht-in dtc-num" type="number" value="${s.target==null?'':s.target}" oninput="dtcSubSet(${i},'target',this.value)"></td>
      <td>${curCell}</td>
      <td class="dtc-gap ${excl?'':gap>0?'bad':gap<0?'good':''}" id="dtc-gap-${i}">${excl?'excl.':(s.target==null&&cur===0&&!hasItems?'—':(gap>0?'+':'')+dtcEur(gap))}</td>
      <td><select class="cht-in" onchange="dtcSubSet(${i},'owner',this.value)">${owners.map(o=>`<option${s.owner===o?' selected':''}>${o}</option>`).join('')}</select></td>
      <td><button class="cht-cf-del" onclick="dtcSubRemove(${i})">×</button></td>
    </tr>`;
    if(open){
      const items=(s.items||[]).map((it,j)=>
        `<div class="dtc-item-row${it.include===false?' dtc-excl':''}">
          <input type="checkbox" ${it.include===false?'':'checked'} title="Include" onchange="dtcItemToggle(${i},${j})">
          <input class="cht-in" value="${escH(it.name)}" placeholder="BOM part / feature…" oninput="dtcItemSet(${i},${j},'name',this.value)">
          <input class="cht-in dtc-num" type="number" value="${it.cost||''}" placeholder="€/unit" oninput="dtcItemSet(${i},${j},'cost',this.value)">
          <button class="cht-cf-del" onclick="dtcItemRemove(${i},${j})">×</button>
        </div>`).join('');
      out+=`<tr class="dtc-items-row"><td></td><td colspan="7">
        <div class="dtc-items">${items||'<div class="cht-muted" style="font-size:11px">No items yet — a subsystem with items sums them as its current cost.</div>'}
        <button class="sm" onclick="dtcItemAdd(${i})">+ Add item</button></div></td></tr>`;
    }
    return out;
  }).join('');
  return `<section class="dtc-sec">
    <h3 class="dtc-h">① Target-cost cascade</h3>
    <div class="cht-hint">Break the unit-cost envelope down to subsystems. Each has a <b>target</b> and the <b>current</b> design estimate (€/unit). Red = over its target.</div>
    <div id="dtc-cascade-live">${dtcCascadeLive(c)}</div>
    <table class="dtc-tbl dtc-cascade"><thead><tr><th></th><th title="Include in analysis">✓</th><th>Subsystem</th><th>Target €</th><th>Current €</th><th>Gap</th><th>Owner</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="8" class="cht-muted">No subsystems yet.</td></tr>'}</tbody></table>
    <button class="sm" onclick="dtcSubAdd()">+ Add subsystem</button><span id="dtc-push">${dtcPushBtn(c)}</span>
  </section>`;
}
// The live (recomputed) part of the cascade: summary banner + envelope bar.
function dtcCascadeLive(c){
  const env=dtcEnvelope(c), cur=dtcCurrentTotal(c), alloc=dtcAllocTotal(c);
  if(env==null) return `<div class="cht-banner warn">⚠ No unit-cost envelope yet — set a price + target margin (or a variable cost) on the charter Financials tab. Then the cascade shows how much cost you have to spend.</div>`;
  const over=cur-env;
  return `<div class="dtc-summary ${over>0?'bad':'good'}">
      Envelope (max unit cost): <b>${dtcEur(env)}</b> · Allocated: <b>${dtcEur(alloc)}</b> · Current design: <b>${dtcEur(cur)}</b> ·
      ${over>0?`<span class="bad">Over by ${dtcEur(over)}</span>`:`<span class="good">${dtcEur(-over)} under</span>`}
    </div>${dtcCascadeSVG(c)}`;
}
function dtcPushBtn(c){
  if(dtcEnvelope(c)==null) return '';
  return `<button class="sm" style="margin-left:8px" onclick="dtcPushCost()" title="Set the charter's variable cost/unit to the current design total">↧ Use current (${dtcEur(dtcCurrentTotal(c))}) as unit cost in Financials</button>`;
}
export function dtcSubAdd(){ dtcCharter().costModel.subsystems.push(makeSubsystem()); dtcSave(); dtcRender(); }
export function dtcSubRemove(i){ dtcCharter().costModel.subsystems.splice(i,1); dtcSave(); dtcRender(); }
export function dtcSubSet(i,key,value){
  const s=dtcCharter().costModel.subsystems[i]; if(!s) return;
  s[key] = (key==='target'||key==='current') ? (value===''?null:Number(value)||0) : value;
  dtcSave();
  if(key==='target'||key==='current') dtcRefreshDerived();   // update derived cells only — keep focus
}
export function dtcToggleSub(i){ if(_dtcOpen.has(i)) _dtcOpen.delete(i); else _dtcOpen.add(i); dtcRender(); }
export function dtcSubToggle(i){ const s=dtcCharter().costModel.subsystems[i]; if(!s)return; s.include=s.include===false; dtcSave(); dtcRender(); }
// Subsystem BOM / feature items.
export function dtcItemAdd(i){ const s=dtcCharter().costModel.subsystems[i]; if(!s)return; s.items.push(makeCostItem()); _dtcOpen.add(i); dtcSave(); dtcRender(); }
export function dtcItemRemove(i,j){ const s=dtcCharter().costModel.subsystems[i]; if(!s)return; s.items.splice(j,1); dtcSave(); dtcRender(); }
export function dtcItemToggle(i,j){ const it=dtcCharter().costModel.subsystems[i].items[j]; if(!it)return; it.include=it.include===false; dtcSave(); dtcRender(); }
export function dtcItemSet(i,j,key,value){
  const it=dtcCharter().costModel.subsystems[i].items[j]; if(!it)return;
  it[key] = key==='cost' ? (Number(value)||0) : value;
  dtcSave();
  if(key==='cost') dtcRefreshDerived();   // updates the subsystem's derived current + gap + SVG
}
// Loop-closer: push the rolled-up design cost into the charter's unit cost.
export function dtcPushCost(){
  const c=dtcCharter(); c.financials.variableCostPerUnit=dtcCurrentTotal(c);
  if(c.financials.marginMode==='targetCost') c.financials.marginMode='compute';  // avoid overwrite
  dtcSave(); flashSaved(); dtcRender();
}

// Horizontal stacked bar: subsystem current costs vs the envelope line.
function dtcCascadeSVG(c){
  const subs=c.costModel.subsystems, env=dtcEnvelope(c), cur=dtcCurrentTotal(c);
  if(cur<=0&&!(env>0)) return '';
  const W=680,H=54,padL=4,padR=4,barY=14,barH=22;
  const xmax=Math.max(cur,env||0)*1.12||1;
  const sc=v=>padL+(v/xmax)*(W-padL-padR);
  const pal=['var(--accent)','var(--accent2)','#a78bfa','var(--warn)','#5b9ce5','#e5989b'];
  let x=padL, segs='';
  subs.forEach((s,i)=>{ const v=dtcSubCost(s); if(v<=0) return; const w=(v/xmax)*(W-padL-padR);
    const over=env!=null && x-padL>sc(env)-padL;
    segs+=`<rect x="${x.toFixed(1)}" y="${barY}" width="${Math.max(0,w).toFixed(1)}" height="${barH}" fill="${over?'var(--danger)':pal[i%pal.length]}" opacity="0.85"><title>${escH(s.name||'subsystem')}: ${dtcEur(v)}</title></rect>`;
    x+=w; });
  const envX=env!=null?sc(env):null;
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="Cost cascade vs envelope" style="max-width:680px">
    ${segs}
    ${envX!=null?`<line x1="${envX.toFixed(1)}" y1="6" x2="${envX.toFixed(1)}" y2="${barY+barH+8}" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <text x="${envX.toFixed(1)}" y="${H-2}" fill="var(--text)" font-size="9" text-anchor="middle">envelope ${dtcEur(env)}</text>`:''}
  </svg>`;
}

/* ── #2 Cost-down waterfall ──────────────────────────────────────────────────── */
function dtcWaterfallSection(c){
  const levers=c.costModel.levers, subs=c.costModel.subsystems;
  const subOpts=['',...subs.map(s=>s.name).filter(Boolean)];
  const statuses=[['idea','Idea'],['committed','Committed'],['realized','Realized']];
  const rows=levers.map((l,i)=>
    `<tr>
      <td><input class="cht-in" value="${escH(l.name)}" placeholder="cost-down idea…" oninput="dtcLeverSet(${i},'name',this.value)"></td>
      <td><select class="cht-in" onchange="dtcLeverSet(${i},'subsystem',this.value)">${subOpts.map(o=>`<option${l.subsystem===o?' selected':''}>${escH(o)||'—'}</option>`).join('')}</select></td>
      <td><input class="cht-in dtc-num" type="number" value="${l.saving||''}" placeholder="€/unit" oninput="dtcLeverSet(${i},'saving',this.value)"></td>
      <td><select class="cht-in" onchange="dtcLeverSet(${i},'status',this.value)">${statuses.map(([v,ll])=>`<option value="${v}"${l.status===v?' selected':''}>${ll}</option>`).join('')}</select></td>
      <td><button class="cht-cf-del" onclick="dtcLeverRemove(${i})">×</button></td>
    </tr>`).join('');
  const cur=dtcCurrentTotal(c), env=dtcEnvelope(c);
  const realized=dtcLeverSum(c,'realized'), committed=dtcLeverSum(c,'committed'), idea=dtcLeverSum(c,'idea');
  return `<section class="dtc-sec">
    <h3 class="dtc-h">② Cost-down waterfall</h3>
    <div class="cht-hint">The path from today's design cost to the target. Levers count once <b>committed</b> or <b>realized</b>; ideas show the remaining upside.</div>
    <div id="dtc-wf-live">${dtcWaterfallLive(c)}</div>
    <table class="dtc-tbl"><thead><tr><th>Lever</th><th>Subsystem</th><th>Saving €/unit</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="5" class="cht-muted">No levers yet.</td></tr>'}</tbody></table>
    <button class="sm" onclick="dtcLeverAdd()">+ Add lever</button>
  </section>`;
}
// Live waterfall (recomputed on lever edits).
function dtcWaterfallLive(c){
  const cur=dtcCurrentTotal(c), env=dtcEnvelope(c);
  if(cur<=0) return '<div class="cht-muted">Add subsystem current costs above to see the waterfall.</div>';
  return dtcWaterfallSVG(cur, dtcLeverSum(c,'realized'), dtcLeverSum(c,'committed'), dtcLeverSum(c,'idea'), env);
}
export function dtcLeverAdd(){ dtcCharter().costModel.levers.push(makeLever()); dtcSave(); dtcRender(); }
export function dtcLeverRemove(i){ dtcCharter().costModel.levers.splice(i,1); dtcSave(); dtcRender(); }
export function dtcLeverSet(i,key,value){
  const l=dtcCharter().costModel.levers[i]; if(!l) return;
  l[key] = key==='saving' ? (Number(value)||0) : value;
  dtcSave();
  if(key==='saving'||key==='status') dtcRefreshDerived();   // updates only the waterfall
}

// Step-down waterfall: Current → −realized → −committed → Projected, with target line.
function dtcWaterfallSVG(cur,realized,committed,idea,env){
  const afterR=cur-realized, proj=cur-realized-committed, potential=proj-idea;
  const W=680,H=190,padL=44,padR=12,padT=12,padB=26;
  const ymax=Math.max(cur,env||0)*1.1||1;
  const Y=v=>padT+(1-v/ymax)*(H-padT-padB);
  const baseY=Y(0);
  const cols=[['Current',cur,'var(--muted)'],['−Realized',afterR,'var(--accent2)'],['−Committed',proj,'var(--accent)'],['Projected',proj,'var(--text)']];
  const bw=64, gap=(W-padL-padR-bw*cols.length)/(cols.length-1);
  let bars='';
  cols.forEach(([label,val,col],i)=>{
    const x=padL+i*(bw+gap), yTop=Y(val);
    bars+=`<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw}" height="${(baseY-yTop).toFixed(1)}" fill="${col}" opacity="${label==='Projected'?0.9:0.55}"/>`;
    bars+=`<text x="${(x+bw/2).toFixed(1)}" y="${(yTop-4).toFixed(1)}" fill="var(--text)" font-size="9" text-anchor="middle">${dtcEur(val)}</text>`;
    bars+=`<text x="${(x+bw/2).toFixed(1)}" y="${H-8}" fill="var(--muted)" font-size="8.5" text-anchor="middle">${label}</text>`;
  });
  const potMarker = idea>0 ? `<line x1="${padL}" y1="${Y(potential).toFixed(1)}" x2="${W-padR}" y2="${Y(potential).toFixed(1)}" stroke="var(--accent2)" stroke-width="1" stroke-dasharray="2 3"/><text x="${W-padR}" y="${(Y(potential)-3).toFixed(1)}" fill="var(--accent2)" font-size="8" text-anchor="end">with ideas ${dtcEur(potential)}</text>` : '';
  const envLine = env!=null ? `<line x1="${padL}" y1="${Y(env).toFixed(1)}" x2="${W-padR}" y2="${Y(env).toFixed(1)}" stroke="var(--danger)" stroke-width="1.3" stroke-dasharray="5 3"/><text x="${padL}" y="${(Y(env)-3).toFixed(1)}" fill="var(--danger)" font-size="8.5">target ${dtcEur(env)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="Cost-down waterfall" style="max-width:680px">
    <line x1="${padL}" y1="${baseY}" x2="${W-padR}" y2="${baseY}" stroke="var(--border)"/>
    ${bars}${potMarker}${envLine}
  </svg>`;
}

/* ── #3 Design guidelines from the square ────────────────────────────────────── */
// Do/don't guidance per dimension × stance.
const DTC_GUIDE = {
  features:{ prioritize:'Protect the feature set — don’t cut scope to save time or cost.',
             balance:'Keep scope reasonable; trade features only for a clear win elsewhere.',
             sacrifice:'Trim scope hard — ship the minimum that works; resist feature creep.' },
  time:{ prioritize:'Speed wins — cut scope or spend to hit the date; parallelize.',
         balance:'Hold the plan; don’t crash the schedule without a reason.',
         sacrifice:'Time is flexible — don’t rush; take the time to get it right and cheap.' },
  productCost:{ prioritize:'Design to cost — every € of unit cost counts; challenge the BOM.',
                balance:'Watch unit cost; optimize where it’s cheap, don’t obsess.',
                sacrifice:'Accept a higher unit cost if it buys features or speed; don’t gold-plate cost-down.' },
  projectCost:{ prioritize:'Keep development lean — reuse, minimize NRE and tooling.',
                balance:'Spend the development budget deliberately.',
                sacrifice:'Invest in development — tooling/NRE is fine if it pays off in the product.' },
};
function dtcGuidelinesSection(c){
  const st=(c.decision&&c.decision.stances)||{};
  const rows=CHT_DIMS4.map(([k,label])=>{
    const s=st[k]||'balance', cls=s==='prioritize'?'good':s==='sacrifice'?'bad':'';
    return `<div class="dtc-guide-row"><span class="dtc-guide-dim">${label}</span>
      <span class="dtc-guide-stance ${cls}">${s.toUpperCase()}</span>
      <span class="dtc-guide-txt">${DTC_GUIDE[k][s]}</span></div>`;
  }).join('');
  const conflicts=chtConflicts(c);
  const cHTML=conflicts.length
    ? `<div class="cht-banner bad">⚠ Hard constraints: ${conflicts.map(x=>`${x.func} must-have on <b>${CHT_DIM_LABEL[x.dimension]}</b> (sacrificed)`).join('; ')} — resolve on the charter Decision tab.</div>`
    : '';
  return `<section class="dtc-sec">
    <h3 class="dtc-h">③ Design guidelines <span class="cht-hint" style="font-weight:400">— from the trade-off square</span></h3>
    ${rows}${cHTML}
  </section>`;
}

/* ── #4 Demand responses ─────────────────────────────────────────────────────── */
function dtcResponsesSection(c){
  const resp=[['','—'],['accept','Accept'],['mitigate','Mitigate'],['reject','Reject']];
  let rows='';
  for(const [sec,lbl] of CHT_FUNCS)
    (c[sec].demands||[]).forEach((d,i)=>{
      if(!d.text) return;
      const conflict=d.mustHave && d.dimension && c.decision.stances[d.dimension]==='sacrifice';
      rows+=`<tr class="${conflict?'dtc-over':''}">
        <td>${lbl}</td>
        <td>${escH(d.text)} ${d.mustHave?'<span class="dtc-must">MUST</span>':''}${conflict?' <span class="dtc-gap bad">⚠</span>':''}</td>
        <td><select class="cht-in" onchange="dtcDemandResp('${sec}',${i},'response',this.value)">${resp.map(([v,l])=>`<option value="${v}"${d.response===v?' selected':''}>${l}</option>`).join('')}</select></td>
        <td><input class="cht-in" value="${escH(d.responseNote||'')}" placeholder="how / why…" oninput="dtcDemandResp('${sec}',${i},'responseNote',this.value)"></td>
      </tr>`;
    });
  return `<section class="dtc-sec">
    <h3 class="dtc-h">④ Demand responses</h3>
    <div class="cht-hint">The design team's answer to each stakeholder demand — accept, mitigate, or reject, with a note. Demands come from the charter Demands board.</div>
    <table class="dtc-tbl"><thead><tr><th>Function</th><th>Demand</th><th>Response</th><th>Note</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="4" class="cht-muted">No demands captured on the charter yet.</td></tr>'}</tbody></table>
  </section>`;
}
export function dtcDemandResp(sec,i,key,value){
  const d=dtcCharter()[sec].demands[i]; if(!d) return;
  d[key]=value; dtcSave();
  if(key==='response') dtcRender();
}
