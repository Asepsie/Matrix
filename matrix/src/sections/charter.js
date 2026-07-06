/* ►► SECTION: CHARTER ◄◄ Cross-functional project charter — now two rail-inset
 * PANELS (like Design-to-cost), not a full-cover modal:
 *   • Financials analysis (#cht-overlay) — overview / demands / financials tabs
 *   • Trade-off decision  (#dec-overlay) — the configurable triangle(s) + lists
 * Both share one selected project (`_chtProjId`) and a project-picker MODE read
 * from Settings (`chtPickerMode()`): 'hub' (card grid, as before) or 'dropdown'
 * (a top <select>, like DTC).
 *
 *   chtOpenFinancials / chtOpenDecisionView — rail-view entry points (per mode)
 *   openCharterHub(target)  — the card grid; a card opens the financials OR the
 *                             decision panel depending on `target`
 *   openCharter(projId)     — open the Financials panel for a project
 *   chtOpenDecision(projId) — open the Trade-off decision panel for a project
 *   chtClose / chtCloseDecision — close a panel
 *   chtShowTab(tab)         — switch Financials tab and render it
 *
 * All state lives on the project (makeCharter) so it flows through save/backup
 * automatically. Money is EUR. There is no approval workflow by design.
 */

let _chtProjId = null;   // project currently open in either charter panel
let _chtTab    = 'overview';

// Tab registry for the Financials panel: id → label. (Decision moved to its own
// rail view.) Order defines the tab strip.
const CHT_TABS = [
  ['overview',   'OVERVIEW'],
  ['demands',    'DEMANDS'],
  ['financials', 'FINANCIALS'],
];

// Project-picker mode, set in Settings (railnav owns the pref). 'hub' = card grid
// (default), 'dropdown' = a top <select> like Design-to-cost.
function chtPickerMode(){
  return (typeof railChartPicker==='function' && railChartPicker()==='dropdown') ? 'dropdown' : 'hub';
}
// First project id, or null (used when the dropdown mode opens with no selection).
function chtFirstProj(){ return projects.length ? projects[0].id : null; }
// The 5 functions: section key → label.
const CHT_FUNCS = [
  ['strategy',          'Strategy'],
  ['rnd',               'R&D'],
  ['offer',             'Offer Mgmt'],
  ['procurement',       'Procurement'],
  ['industrialization', 'Industrialization'],
];
// The 4 trade-off dimensions (the square corners): key → label.
const CHT_DIMS4   = [['features','Features'],['time','Time-to-market'],['productCost','Product cost'],['projectCost','Project cost']];
// Stances a dimension can take.
const CHT_STANCES = [['prioritize','Prioritize'],['balance','Balance'],['sacrifice','Sacrifice']];
// Weights drive the marker position. A wide spread (sacrifice≈0) means a single
// prioritized corner pulls the marker most of the way to it, not to mid-edge.
const CHT_STANCE_W = { prioritize:1.0, balance:0.28, sacrifice:0.04 };

// Warning when the stances aren't a real trade-off (or none set). '' = fine.
function chtStanceWarn(d){
  const v=Object.values((d&&d.stances)||{});
  if(!v.length) return '';
  if(v.every(s=>s==='prioritize')) return 'Everything is prioritized — that’s a wish list, not a trade-off. Sacrifice at least one.';
  if(v.every(s=>s==='sacrifice'))  return 'Everything is sacrificed — is this project worth doing?';
  if(!v.includes('sacrifice'))     return 'Nothing is sacrificed yet — pick at least one corner to give up.';
  return '';
}

// ── rail-view entry points (honour the picker mode) ──────────────────────────
// WORK › Financials analysis.
export function chtOpenFinancials(){
  if(chtPickerMode()==='dropdown') openCharter(chtFirstProj());
  else openCharterHub('financials');
}
// WORK › Trade-off decision.
export function chtOpenDecisionView(){
  if(chtPickerMode()==='dropdown') chtOpenDecision(chtFirstProj());
  else openCharterHub('decision');
}

// ── Financials panel (open / close) ──────────────────────────────────────────
export function openCharter(projId){
  const p = projid2proj(projId);
  _chtProjId = p ? p.id : null;
  if(p && (!p.charter || typeof p.charter!=='object')) p.charter = makeCharter();
  _chtTab = 'overview';
  G('cht-overlay').classList.add('show');
  chtRenderPicker('financials');
  chtRenderHeader();
  chtRenderTabStrip();
  chtShowTab('overview');
}
export function chtClose(){ G('cht-overlay').classList.remove('show'); chtSyncRailAfterClose(); }
// If closing a panel reveals the BASE matrix (no charter surface left showing) and
// we're not mid-navigation, sync the rail highlight back to matrix. When the hub
// is still visible beneath (hub mode) it stays highlighted as the charter view.
// Reads railnav module state directly (one shared bundle scope).
function chtSyncRailAfterClose(){
  const anyShown=['cht-overlay','dec-overlay','chthub-overlay'].some(id=>{ const e=G(id); return e&&e.classList.contains('show'); });
  if(anyShown) return;
  if(typeof railRouting!=='undefined' && railRouting) return;
  if(typeof activeView!=='undefined' && activeView!=='matrix'){
    activeView='matrix';
    if(typeof railRender==='function') railRender();
    if(typeof railUpdateCrumb==='function') railUpdateCrumb();
  }
}
// Resolve a project by id (coerces the numeric string from a <select>), or null.
function projid2proj(projId){ return projects.find(x=>x.id===+projId)||null; }
// Dropdown-mode project switch (Financials).
export function chtSelectProject(id){ openCharter(id); }
// Hub-mode "‹ Projects" back button — hide the panel, reveal the card grid.
export function chtBackToHub(target){
  if(target==='decision') chtCloseDecision(); else chtClose();
  openCharterHub(target);
}

// Render the header picker slot (#cht-pick / #dec-pick) for the given panel.
//   dropdown mode → a <select> of every project
//   hub mode      → a "‹ Projects" button back to the card grid
function chtRenderPicker(target){
  const slot = G(target==='decision'?'dec-pick':'cht-pick'); if(!slot) return;
  if(chtPickerMode()==='dropdown'){
    const set = target==='decision' ? 'chtDecSelectProject' : 'chtSelectProject';
    slot.innerHTML = `<label class="cht-hl">PROJECT</label>
      <select class="cht-sel" onchange="${set}(this.value)">
        ${projects.length ? projects.map(p=>`<option value="${p.id}"${p.id===_chtProjId?' selected':''}>${escH(p.name||'Untitled project')}</option>`).join('')
                          : '<option>— no projects —</option>'}
      </select>`;
  } else {
    slot.innerHTML = `<button class="sm" onclick="chtBackToHub('${target}')">‹ Projects</button>`;
  }
}

// ── Charters hub (card grid) — one grid serving both panels via `target` ─────
// A card opens the Financials panel (target='financials') or the Trade-off
// decision panel (target='decision'), which stacks on top. Closing it reveals
// the hub again.
let _chtHubTarget='financials';
export function openCharterHub(target){
  _chtHubTarget = target==='decision' ? 'decision' : 'financials';
  const t=G('chthub-title'); if(t) t.textContent = _chtHubTarget==='decision' ? 'TRADE-OFF DECISION' : 'FINANCIALS ANALYSIS';
  G('chthub-overlay').classList.add('show');
  chtRenderHub();
}
export function closeCharterHub(){ G('chthub-overlay').classList.remove('show'); }

function chtRenderHub(){
  const body=G('chthub-body'); if(!body) return;
  const opener = _chtHubTarget==='decision' ? 'chtOpenDecision' : 'openCharter';
  if(!projects.length){
    body.innerHTML='<div class="cht-muted" style="padding:20px">No projects yet — add one on the Portfolio matrix, then open it here.</div>';
    return;
  }
  body.innerHTML='<div class="chthub-grid">'+projects.map(p=>{
    const c = (p.charter&&typeof p.charter==='object') ? p.charter : makeCharter();
    const r = calculateFinancials(c.financials);
    const prio = c.priority||'—';
    const prioCls = c.priority==='High'?'hi':c.priority==='Medium'?'med':c.priority==='Low'?'lo':'';
    const conflicts = chtConflicts(c).length;
    const madeTradeoff = Object.values(c.decision.stances||{}).includes('sacrifice');
    return `<div class="chthub-card" onclick="${opener}(${p.id})" title="Open">
      <div class="chthub-top">
        <span class="chthub-name">${escH(p.name||'Untitled project')}</span>
        <span class="chthub-status">${escH(c.status||'Draft')}</span>
      </div>
      <div class="chthub-badges">
        <span class="chthub-prio ${prioCls}">${escH(prio)}</span>
        <span class="chthub-metric">NPV ${r.display.npv}</span>
        <span class="chthub-metric">IRR ${r.display.irr}</span>
        ${conflicts?`<span class="chthub-metric conflict">⚠ ${conflicts} conflict${conflicts>1?'s':''}</span>`
                   :`<span class="chthub-metric${madeTradeoff?' ok':''}">${madeTradeoff?'✓ trade-off':'trade-off pending'}</span>`}
      </div>
    </div>`;
  }).join('')+'</div>';
}

// The charter object for the open project (or null).
function chtCharter(){
  const p = projects.find(x=>x.id===_chtProjId);
  return p ? p.charter : null;
}

// ── save ─────────────────────────────────────────────────────────────────────
// Debounced autosave used on every keystroke; chtSaveNow is the explicit button.
function chtSave(){ saveState(); }
export function chtSaveNow(){ saveNow(); flashSaved(); }

// Generic setters — write into charter.<section>.<key>, or charter.<key> when
// `section` is falsy (top-level fields like businessCase). Autosave either way.
export function chtSet(section,key,value){
  const c=chtCharter(); if(!c)return;
  if(section) c[section][key]=value; else c[key]=value;
  chtSave();
}
// Numeric setter: stores a Number, or null when the field is blank.
export function chtSetNum(section,key,value){
  const c=chtCharter(); if(!c)return;
  const v = value===''||value==null ? null : Number(value);
  if(section) c[section][key]=v; else c[key]=v;
  chtSave();
}
// Top-level charter fields (priority / status).
export function chtSetTop(key,value){
  const c=chtCharter(); if(!c)return;
  c[key]=value; chtSave();
}

// ── header + tab strip ───────────────────────────────────────────────────────
function chtRenderHeader(){
  const p = projects.find(x=>x.id===_chtProjId);
  const c = chtCharter();
  if(!p||!c){ G('cht-title').textContent='FINANCIALS ANALYSIS'; const m=G('cht-head-meta'); if(m) m.innerHTML=''; return; }
  G('cht-title').textContent = p.name || 'PROJECT';
  const prio = ['','High','Medium','Low'];
  const stat = ['Draft','In Review','Approved','Rejected'];
  G('cht-head-meta').innerHTML =
    `<label class="cht-hl">PRIORITY</label>
     <select class="cht-sel" onchange="chtSetTop('priority',this.value)">
       ${prio.map(v=>`<option value="${v}"${c.priority===v?' selected':''}>${v||'—'}</option>`).join('')}
     </select>
     <label class="cht-hl">STATUS</label>
     <select class="cht-sel" onchange="chtSetTop('status',this.value)">
       ${stat.map(v=>`<option${c.status===v?' selected':''}>${v}</option>`).join('')}
     </select>`;
}
function chtRenderTabStrip(){
  G('cht-tabs').innerHTML = CHT_TABS.map(([id,label])=>
    `<div class="cht-tab${_chtTab===id?' active':''}" id="cht-tab-${id}" onclick="chtShowTab('${id}')">${label}</div>`
  ).join('');
}

export function chtShowTab(tab){
  _chtTab = tab;
  CHT_TABS.forEach(([id])=>{ const el=G('cht-tab-'+id); if(el) el.classList.toggle('active',id===tab); });
  const body = G('cht-body');
  if(!chtCharter()){ body.innerHTML='<div class="cht-muted" style="padding:20px">No project selected — add a project on the Portfolio matrix.</div>'; return; }
  if(tab==='financials')     body.innerHTML = chtFinTab();
  else if(tab==='demands')   body.innerHTML = chtDemandsTab();
  else                       body.innerHTML = chtOverviewTab();
}

// ── field builders ───────────────────────────────────────────────────────────
// A field bound to charter.<section>.<key>, or charter.<key> when section=''.
function chtVal(section,key){ const c=chtCharter(); return section ? c[section][key] : c[key]; }
// Optional explanatory line rendered under a field.
function chtHint(h){ return h ? `<span class="cht-hint">${h}</span>` : ''; }
function chtText(section,key,label,ph,hint){
  const v=chtVal(section,key)||'';
  return `<label class="cht-f"><span class="cht-l">${label}</span>
    <input class="cht-in" value="${escH(v)}" placeholder="${escH(ph||'')}"
      oninput="chtSet('${section}','${key}',this.value)">${chtHint(hint)}</label>`;
}
function chtArea(section,key,label,ph,hint){
  const v=chtVal(section,key)||'';
  return `<label class="cht-f cht-f-wide"><span class="cht-l">${label}</span>
    <textarea class="cht-ta" placeholder="${escH(ph||'')}"
      oninput="chtSet('${section}','${key}',this.value)">${escH(v)}</textarea>${chtHint(hint)}</label>`;
}
function chtNum(section,key,label,min,max,ph,hint){
  const v=chtVal(section,key);
  const mm=(min!=null?` min="${min}"`:'')+(max!=null?` max="${max}"`:'');
  return `<label class="cht-f"><span class="cht-l">${label}</span>
    <input class="cht-in" type="number"${mm} value="${v==null?'':v}" placeholder="${escH(ph||'')}"
      oninput="chtSetNum('${section}','${key}',this.value)">${chtHint(hint)}</label>`;
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function chtOverviewTab(){
  return `<div class="cht-note">OVERVIEW — the one-paragraph case and the prize. These feed the financials & the deck.</div>
    <div class="cht-form">
      ${chtArea('','businessCase','Business case','Why this project matters — the problem, the opportunity, and why now…',
        'The single narrative everyone aligns behind.')}
      ${chtNum('','expectedRevenueM','Expected revenue (M€)',0,null,'e.g. 12.5',
        'Peak/steady-state annual revenue this unlocks, in millions of euros.')}
    </div>`;
}

// ── Demands board (one tab, all 5 functions) ─────────────────────────────────
// Each function: an alignment score + a list of demands. Every demand names the
// trade-off dimension it pushes and whether it's a must-have. A must-have on a
// dimension the project has chosen to SACRIFICE is a conflict — surfaced here and
// on the Decision tab. This is what stops each function quietly demanding the
// impossible (max features + min cost + fast + cheap to build).
function chtDemandsTab(){
  const c=chtCharter();
  const conflicts=chtConflicts(c);
  const mustCount=CHT_FUNCS.reduce((n,[sec])=>n+(c[sec].demands||[]).filter(d=>d.mustHave).length,0);
  const banner = conflicts.length
    ? `<div class="cht-banner bad">⚠ ${conflicts.length} conflict${conflicts.length>1?'s':''}: a must-have pushes a dimension the project is sacrificing. Resolve on the Decision tab, or soften the demand.</div>`
    : (mustCount>=8
        ? `<div class="cht-banner warn">${mustCount} must-haves across functions — likely over-constrained. Push more to “flexible”.</div>`
        : `<div class="cht-note">DEMANDS — what each function insists on. Tag the trade-off it pushes and whether it's a must-have. All visible together, so no one wins by demanding everything.</div>`);
  const boards=CHT_FUNCS.map(([sec,lbl])=>chtFuncBoard(sec,lbl,c)).join('');
  return `${banner}<div class="cht-boards">${boards}</div>`;
}

// One function's card on the demands board.
function chtFuncBoard(sec,lbl,c){
  const fn=c[sec], align=fn.alignment;
  const rows=(fn.demands||[]).map((d,i)=>{
    const conflict=d.mustHave && d.dimension && c.decision.stances[d.dimension]==='sacrifice';
    const dimOpts=`<option value="">dimension…</option>`+CHT_DIMS4.map(([k,l])=>`<option value="${k}"${d.dimension===k?' selected':''}>${l}</option>`).join('');
    return `<div class="cht-dem-row${conflict?' conflict':''}">
      <input class="cht-in cht-dem-txt" value="${escH(d.text)}" placeholder="demand…" oninput="chtDemandSet('${sec}',${i},'text',this.value)">
      <select class="cht-in cht-dem-dim" onchange="chtDemandSet('${sec}',${i},'dimension',this.value)">${dimOpts}</select>
      <button class="cht-must${d.mustHave?' on':''}" title="Toggle must-have vs flexible" onclick="chtDemandToggle('${sec}',${i})">${d.mustHave?'MUST':'flex'}</button>
      <button class="cht-cf-del" title="Remove" onclick="chtDemandRemove('${sec}',${i})">×</button>
      ${conflict?'<span class="cht-dem-warn" title="Must-have on a sacrificed dimension">⚠</span>':''}
    </div>`;
  }).join('');
  return `<div class="cht-board">
    <div class="cht-board-head">
      <span class="cht-board-name">${lbl}</span>
      <label class="cht-board-align">align
        <input class="cht-in" type="number" min="1" max="10" value="${align==null?'':align}"
          oninput="chtSetNum('${sec}','alignment',this.value)"></label>
    </div>
    ${rows||'<div class="cht-muted">No demands yet.</div>'}
    <button class="sm" onclick="chtDemandAdd('${sec}')">+ Add demand</button>
  </div>`;
}

// Demand mutators.
export function chtDemandAdd(sec){ chtCharter()[sec].demands.push(makeDemand()); chtSave(); chtShowTab('demands'); }
export function chtDemandRemove(sec,i){ chtCharter()[sec].demands.splice(i,1); chtSave(); chtShowTab('demands'); }
export function chtDemandSet(sec,i,key,value){
  const d=chtCharter()[sec].demands[i]; if(!d) return;
  d[key]=value; chtSave();
  if(key==='dimension') chtShowTab('demands');   // conflict state may change
}
export function chtDemandToggle(sec,i){
  const d=chtCharter()[sec].demands[i]; if(!d) return;
  d.mustHave=!d.mustHave; chtSave(); chtShowTab('demands');
}

// All conflicts: must-have demands whose dimension the project is sacrificing.
function chtConflicts(c){
  const out=[]; const st=(c.decision&&c.decision.stances)||{};
  for(const [sec,lbl] of CHT_FUNCS)
    for(const d of (c[sec].demands||[]))
      if(d.mustHave && d.dimension && st[d.dimension]==='sacrifice')
        out.push({func:lbl, sec, text:d.text, dimension:d.dimension});
  return out;
}

// ── financials tab ───────────────────────────────────────────────────────────
// Convenience accessors for the open project's financials + its display unit.
function chtFin(){ return chtCharter().financials; }
function chtFactor(){ return finUnitFactor(chtFin().unit); }
function chtSym(){ return finUnitSym(chtFin().unit); }
// Show a base-EUR value in the current display unit (trimmed of float noise).
function chtMoneyDisp(base){ const v=(Number(base)||0)/chtFactor(); return Number.isFinite(v)? +v.toFixed(6) : 0; }

function chtFinTab(){
  const f=chtFin(); const sym=chtSym();
  const rows = f.cashFlows.map((v,i)=>
    `<div class="cht-cf-row">
       <span class="cht-cf-yr">Year ${i+1}</span>
       <input class="cht-in" type="number" value="${chtMoneyDisp(v)}"
         oninput="chtCFSet(${i},this.value)" placeholder="net cash flow (${sym})">
       <button class="cht-cf-del" title="Remove year" onclick="chtCFRemove(${i})">×</button>
     </div>`).join('');
  const units=[['eur','€'],['keur','k€'],['meur','M€']];
  return `<div class="cht-fin">
    <div class="cht-fin-inputs">
      <div class="cht-f cht-f-wide"><span class="cht-l">Display unit</span>
        <div class="cht-toggle">
          ${units.map(([u,l])=>`<button class="cht-tg${f.unit===u?' on':''}" onclick="chtFinUnit('${u}')">${l}</button>`).join('')}
        </div>
        ${chtHint('Scales the money fields &amp; NPV below. Everything is stored in euros, so switching units never changes your data. Per-unit price/cost stay in €.')}</div>
      <label class="cht-f"><span class="cht-l">Initial investment (${sym})</span>
        <input class="cht-in" type="number" min="0" value="${chtMoneyDisp(f.initialInvestment)}"
          oninput="chtFinSetMoney('initialInvestment',this.value)">
        ${chtHint('Base upfront outlay at t=0. Leave it and/or itemise the detail below — the two add up.')}</label>
      <label class="cht-f"><span class="cht-l">Discount rate (%)</span>
        <input class="cht-in" type="number" step="0.1" value="${f.discountRate*100}"
          oninput="chtFinRate(this.value)">
        ${chtHint('Cost of capital / hurdle rate. Future cash is discounted more heavily at higher rates.')}</label>
      ${chtUnitEconomicsFields(f)}
      <div class="cht-cf cht-f-wide">
        <div class="cht-l">Annual cash flows (${sym})</div>
        ${chtHint('Net cash generated each year after launch (year 1..N). May be negative.')}
        ${rows||'<div class="cht-muted">No years yet.</div>'}
        <button class="sm" onclick="chtCFAdd()">+ Add year</button>
      </div>
      ${chtInvestmentEditor()}
    </div>
    <div class="cht-fin-results" id="cht-fin-results">${chtFinResultsHTML()}</div>
  </div>
  <div class="cht-charts" id="cht-fin-charts">${chtFinChartsHTML()}</div>`;
}
// The two financial charts (recomputed live alongside the results panel).
function chtFinChartsHTML(){
  const f=chtFin();
  return `<div class="cht-chart"><div class="cht-chart-t">NPV vs discount rate</div>${chtNpvCurveSVG(f)}</div>
    <div class="cht-chart"><div class="cht-chart-t">Cumulative cash flow</div>${chtCumCashSVG(f)}</div>`;
}

// Unit economics: price / variable cost with an optional margin-target mode.
//   compute      → enter price + cost, margin is output
//   targetPrice  → enter cost + target margin %, price is derived
//   targetCost   → enter price + target margin %, max unit cost is derived
function chtUnitEconomicsFields(f){
  const mode=f.marginMode||'compute';
  const eco=resolveUnitEconomics(f);
  const modes=[['compute','Compute'],['targetPrice','Target → price'],['targetCost','Target → cost']];
  const modeToggle=`<div class="cht-f cht-f-wide"><span class="cht-l">Margin mode</span>
    <div class="cht-toggle">
      ${modes.map(([m,l])=>`<button class="cht-tg${mode===m?' on':''}" onclick="chtFinMode('${m}')">${l}</button>`).join('')}
    </div>
    ${chtHint('Compute margin from price &amp; cost, or target a margin and derive the price (cost-plus) or the max unit cost (market price fixed).')}</div>`;
  const priceEditable=`<label class="cht-f"><span class="cht-l">Price / unit (€)</span>
    <input class="cht-in" type="number" min="0" value="${f.pricePerUnit||0}" oninput="chtFinSet('pricePerUnit',this.value)">
    ${chtHint('Selling price of one unit (always €).')}</label>`;
  const costEditable=`<label class="cht-f"><span class="cht-l">Variable cost / unit (€)</span>
    <input class="cht-in" type="number" min="0" value="${f.variableCostPerUnit||0}" oninput="chtFinSet('variableCostPerUnit',this.value)">
    ${chtHint('Direct cost that scales with each unit (COGS).')}</label>`;
  const targetField=`<label class="cht-f"><span class="cht-l">Target margin (%)</span>
    <input class="cht-in" type="number" min="0" max="99" value="${f.targetMarginPct==null?'':f.targetMarginPct}" oninput="chtFinSet('targetMarginPct',this.value)">
    ${chtHint('Product margin you want: (price − direct cost) ÷ price.')}</label>`;
  const derived=(label,val)=>`<div class="cht-f"><span class="cht-l">${label}</span>
    <div class="cht-derived" id="cht-derived-val">${val}</div></div>`;
  if(mode==='targetPrice'){
    return costEditable+modeToggle+targetField+
      derived('→ Required price / unit', eco.derivedPrice!=null?`€${eco.derivedPrice.toLocaleString('en-US',{maximumFractionDigits:2})}`:'set cost & margin');
  }
  if(mode==='targetCost'){
    return priceEditable+modeToggle+targetField+
      derived('→ Max unit cost (€)', eco.derivedCost!=null?`€${eco.derivedCost.toLocaleString('en-US',{maximumFractionDigits:2})}`:'set price & margin');
  }
  return priceEditable+costEditable+modeToggle;
}
export function chtFinMode(m){ chtFin().marginMode=m; chtSave(); chtShowTab('financials'); }

// Detailed investment breakdown editor (internal labor / expenses / amortized).
// Amounts are always in € (not scaled by the display unit) — itemised detail and
// the per-unit amortization are naturally euro-scale, which avoids a magnitude trap.
function chtInvestmentEditor(){
  const f=chtFin();
  const cats=[['labor','Internal labor'],['expense','Expenses'],['amortized','Cost to amortize']];
  const tgts=[['kpi','→ Financial KPIs (upfront)'],['unit','→ Unit cost (per unit)']];
  const rows=f.investment.items.map((it,i)=>
    `<div class="cht-inv-row">
       <input class="cht-in" value="${escH(it.label)}" placeholder="label" oninput="chtInvSet(${i},'label',this.value)">
       <select class="cht-in" onchange="chtInvSet(${i},'category',this.value)">
         ${cats.map(([v,l])=>`<option value="${v}"${it.category===v?' selected':''}>${l}</option>`).join('')}
       </select>
       <input class="cht-in" type="number" value="${it.amount||''}" placeholder="amount (€)" oninput="chtInvSet(${i},'amount',this.value)">
       <select class="cht-in" onchange="chtInvSet(${i},'target',this.value)">
         ${tgts.map(([v,l])=>`<option value="${v}"${it.target===v?' selected':''}>${l}</option>`).join('')}
       </select>
       <button class="cht-cf-del" title="Remove item" onclick="chtInvRemove(${i})">×</button>
     </div>`).join('');
  // Live per-unit contribution of the "unit cost" items, so a magnitude slip is obvious.
  const pool=f.investment.items.filter(it=>it.target==='unit').reduce((s,it)=>s+(Number(it.amount)||0),0);
  const au=Number(f.investment.amortUnits)||0;
  const perUnit=pool>0&&au>0 ? pool/au : null;
  return `<div class="cht-cf cht-f-wide cht-inv">
    <div class="cht-l">Detailed investment (optional) — amounts in €</div>
    ${chtHint('Itemise the investment. Each line either adds to the <b>upfront investment</b> (→ hits NPV, payback &amp; break-even) or is spread across units as <b>unit cost</b> (→ raises variable cost, hits margin &amp; break-even). Amounts are in euros.')}
    ${rows||'<div class="cht-muted">No items — the single Initial investment figure above is used as-is.</div>'}
    <button class="sm" onclick="chtInvAdd()">+ Add investment item</button>
    <label class="cht-f" style="margin-top:10px;max-width:260px"><span class="cht-l">Amortization units</span>
      <input class="cht-in" type="number" min="0" value="${f.investment.amortUnits==null?'':f.investment.amortUnits}"
        oninput="chtInvAmort(this.value)">
      ${chtHint('Lifetime volume the “Unit cost” items are spread over (cost ÷ units → €/unit).')}
      ${perUnit!=null?`<span class="cht-hint" style="color:var(--accent2)">→ adds €${perUnit.toLocaleString('en-US',{maximumFractionDigits:2})}/unit to variable cost</span>`:''}</label>
  </div>`;
}

// Results panel HTML — recomputed live from calculateFinancials (unit-aware).
function chtFinResultsHTML(){
  const f=chtFin(); const r=calculateFinancials(f);
  const metric=(label,val)=>
    `<div class="cht-metric"><span class="cht-m-l">${label}</span><span class="cht-m-v">${val}</span></div>`;
  const npvClass = r.npv==null?'':(r.npv>=0?'pos':'neg');
  const hasBreakdown = f.investment.items.length>0;
  const eff = hasBreakdown
    ? `<div class="cht-eff">
         <div>Effective investment (KPIs): <b>${fmtMoneyUnit(r.effInvestment,f.unit)}</b></div>
         <div>Effective variable cost / unit: <b>€${(r.effVarCost).toLocaleString('en-US',{maximumFractionDigits:2})}</b></div>
       </div>` : '';
  const marginClass = r.marginPerUnit==null?'':(r.marginPerUnit>=0?'pos':'neg');
  return `<div class="cht-metrics">
    <div class="cht-metric big ${npvClass}"><span class="cht-m-l">NPV</span>
      <span class="cht-m-v">${fmtMoneyUnit(r.npv,f.unit)}</span></div>
    ${metric('IRR',            r.display.irr)}
    ${metric('ROI',           r.display.roi)}
    ${metric('Yield',         r.display.yieldPct)}
    ${metric('Profitability index', r.display.profitabilityIndex)}
    ${metric('Payback',       r.display.payback)}
    <div class="cht-metric ${marginClass}"><span class="cht-m-l">Margin / unit</span>
      <span class="cht-m-v">${r.display.marginPerUnit}</span></div>
    ${metric('Margin %',      r.display.marginPct)}
    ${metric('Break-even',    r.display.breakEvenUnits)}
    ${metric('Break-even (t)',r.display.breakEvenTime)}
  </div>
  ${eff}
  <details class="cht-defs"><summary>What do these mean?</summary>
    <dl>
      <dt>NPV</dt><dd>Net Present Value — today's worth of all future cash flows minus the initial investment, discounted at the rate. Above €0 = the project creates value.</dd>
      <dt>IRR</dt><dd>Internal Rate of Return — the discount rate at which NPV = 0. If it beats your cost of capital, it's worth doing.</dd>
      <dt>ROI</dt><dd>Return on Investment — total (undiscounted) net cash ÷ investment. A plain "how many times over do we get the money back" read.</dd>
      <dt>Yield</dt><dd>Average annual cash flow ÷ initial investment. A quick, undiscounted return proxy.</dd>
      <dt>Profitability index</dt><dd>Present value of the inflows ÷ investment. Above 1.0 = value-creating; useful to rank projects competing for the same budget.</dd>
      <dt>Payback</dt><dd>Years until cumulative (undiscounted) cash flow recovers the investment.</dd>
      <dt>Margin / unit &amp; Margin %</dt><dd>Contribution margin = price − variable cost per unit, and as a % of price. This is the per-unit money left to cover the investment; it drives the break-even.</dd>
      <dt>Break-even (units)</dt><dd>Units to sell to cover the investment at the current margin.</dd>
      <dt>Break-even (t)</dt><dd>Same as payback — the point cumulative cash flow first turns positive.</dd>
    </dl>
  </details>`;
}
// Refresh the results panel + the charts — keeps input focus while typing
// (neither container holds the focused input).
function chtFinRefresh(){
  const el=G('cht-fin-results'); if(el) el.innerHTML=chtFinResultsHTML();
  const ch=G('cht-fin-charts'); if(ch) ch.innerHTML=chtFinChartsHTML();
  const dv=G('cht-derived-val');   // live-update the target-mode derived value
  if(dv){ const eco=resolveUnitEconomics(chtFin());
    dv.textContent = eco.mode==='targetPrice'
      ? (eco.derivedPrice!=null?`€${eco.derivedPrice.toLocaleString('en-US',{maximumFractionDigits:2})}`:'set cost & margin')
      : (eco.derivedCost!=null?`€${eco.derivedCost.toLocaleString('en-US',{maximumFractionDigits:2})}`:'set price & margin');
  }
}

// Plain (unscaled, €) setter — price/variable cost per unit.
export function chtFinSet(key,value){
  chtFin()[key]=Number(value)||0; chtSave(); chtFinRefresh();
}
// Money setter — input is in the display unit, stored in base euros.
export function chtFinSetMoney(key,value){
  chtFin()[key]=(Number(value)||0)*chtFactor(); chtSave(); chtFinRefresh();
}
export function chtFinRate(pct){
  chtFin().discountRate=(Number(pct)||0)/100; chtSave(); chtFinRefresh();
}
export function chtFinUnit(u){ chtFin().unit=u; chtSave(); chtShowTab('financials'); }
export function chtCFSet(i,value){
  chtFin().cashFlows[i]=value===''?0:(Number(value)||0)*chtFactor(); chtSave(); chtFinRefresh();
}
export function chtCFAdd(){ chtFin().cashFlows.push(0); chtSave(); chtShowTab('financials'); }
export function chtCFRemove(i){ chtFin().cashFlows.splice(i,1); chtSave(); chtShowTab('financials'); }

// Detailed-investment mutators. amount is entered in the display unit → base €.
export function chtInvAdd(){ chtFin().investment.items.push(makeInvestmentItem()); chtSave(); chtShowTab('financials'); }
export function chtInvRemove(i){ chtFin().investment.items.splice(i,1); chtSave(); chtShowTab('financials'); }
export function chtInvSet(i,key,value){
  const it=chtFin().investment.items[i]; if(!it) return;
  it[key] = key==='amount' ? (Number(value)||0) : value;   // amounts are in € (not display-unit scaled)
  chtSave();
  if(key==='amount'||key==='target') chtFinRefresh();   // label/category don't change KPIs
}
export function chtInvAmort(value){
  chtFin().investment.amortUnits = value===''?null:(Number(value)||0); chtSave(); chtFinRefresh();
}

// ── SVG visualizations (pure SVG, themed via CSS variables) ──────────────────
// All are colour-blind-safe: role/value is also carried by text labels & shape,
// never colour alone.

// Trade-off TRIANGLE. `points` = the 3 (of 4) dimensions to plot; `stances` = the
// full stance map. A single marker sits at the weighted centroid of the 3 plotted
// corners, so you SEE where this option leans — and that you can't pull it to
// every corner at once. Used for the primary trade-off AND each comparison
// scenario. Colour-blind-safe: stance is also carried by node fill + a text label.
const CHT_STANCE_COL = { prioritize:'var(--accent)', balance:'var(--muted)', sacrifice:'var(--danger)' };
function chtTriangleSVG(points, stances, opts){
  opts=opts||{};
  const W=300, H=opts.small?210:250;
  const pts=(Array.isArray(points)&&points.length===3)?points:['features','time','productCost'];
  // corner geometry: apex top-centre, then base-left / base-right
  const apexY=opts.small?54:60, baseY=opts.small?168:196;
  const corner =[[150,apexY],[66,baseY],[234,baseY]];
  const labelAt=[[150,apexY-16],[66,baseY+18],[234,baseY+18]];
  const sMap=stances||{};
  // weighted centroid of the 3 plotted corners
  let sx=0, sy=0, sw=0;
  pts.forEach((k,i)=>{ const w=CHT_STANCE_W[sMap[k]]??0.28; sw+=w; sx+=w*corner[i][0]; sy+=w*corner[i][1]; });
  const cxm=(corner[0][0]+corner[1][0]+corner[2][0])/3, cym=(corner[0][1]+corner[1][1]+corner[2][1])/3;
  const px=sw?sx/sw:cxm, py=sw?sy/sw:cym;
  const warn=chtStanceWarn({stances:{a:sMap[pts[0]],b:sMap[pts[1]],c:sMap[pts[2]]}});
  const tri=corner.map(c=>c[0]+','+c[1]).join(' ');
  const mr=opts.small?13:16;
  let nodes='';
  pts.forEach((k,i)=>{
    const [cx,cy]=corner[i], stc=sMap[k]||'balance', col=CHT_STANCE_COL[stc];
    const [lx,ly]=labelAt[i];
    nodes+=`<circle cx="${cx}" cy="${cy}" r="6" fill="${stc==='prioritize'?col:'var(--bg)'}" stroke="${col}" stroke-width="2"/>`;
    nodes+=`<text x="${lx}" y="${ly}" fill="var(--text)" font-size="11" font-weight="600" text-anchor="middle">${CHT_DIM_LABEL[k]||k}</text>`;
    nodes+=`<text x="${lx}" y="${ly+12}" fill="${col}" font-size="8" font-family="IBM Plex Mono,monospace" text-anchor="middle">${stc.toUpperCase()}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="Trade-off triangle: ${pts.map(k=>CHT_DIM_LABEL[k]||k).join(', ')}">
    <polygon points="${tri}" fill="none" stroke="var(--border)" stroke-width="1.5"/>
    <line x1="${corner[0][0]}" y1="${corner[0][1]}" x2="${cxm.toFixed(1)}" y2="${cym.toFixed(1)}" stroke="var(--border)" stroke-width="0.4" stroke-dasharray="3 3"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${mr}" fill="var(--accent)" fill-opacity="0.16" stroke="var(--accent)" stroke-width="2.5"/>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="var(--accent)"/>
    ${nodes}
    ${warn?`<text x="150" y="${H-8}" fill="var(--warn)" font-size="8.5" text-anchor="middle">⚠ not a trade-off</text>`:''}
  </svg>`;
}

// Cross-functional alignment radar (5 function scores, 1–10).
function chtRadarSVG(c){
  const axes=[
    ['Strategy',    c.strategy.alignment],
    ['R&D',         c.rnd.alignment],
    ['Offer',       c.offer.alignment],
    ['Procurement', c.procurement.alignment],
    ['Industrial.', c.industrialization.alignment],
  ];
  const W=300,H=250,cx=150,cy=128,R=84,n=axes.length;
  const ang=i=>(-Math.PI/2)+i*2*Math.PI/n;
  let rings='';
  for(let g=1;g<=5;g++){
    const rr=R*g/5, pts=[];
    for(let i=0;i<n;i++) pts.push((cx+rr*Math.cos(ang(i))).toFixed(1)+','+(cy+rr*Math.sin(ang(i))).toFixed(1));
    rings+=`<polygon points="${pts.join(' ')}" fill="none" stroke="var(--border)" stroke-width="0.7"/>`;
  }
  let spokes='', labels='';
  for(let i=0;i<n;i++){
    const x=cx+R*Math.cos(ang(i)), y=cy+R*Math.sin(ang(i));
    spokes+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.7"/>`;
    const lx=cx+(R+18)*Math.cos(ang(i)), ly=cy+(R+18)*Math.sin(ang(i));
    labels+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="var(--muted)" font-size="9" text-anchor="middle" dominant-baseline="middle">${axes[i][0]}</text>`;
  }
  let any=false; const dpts=[]; let dots='';
  for(let i=0;i<n;i++){
    const v=Math.max(0,Math.min(10,Number(axes[i][1])||0)); if(v>0) any=true;
    const rr=R*v/10, x=cx+rr*Math.cos(ang(i)), y=cy+rr*Math.sin(ang(i));
    dpts.push(x.toFixed(1)+','+y.toFixed(1));
    if(v>0){
      dots+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="var(--accent)"/>`;
      dots+=`<text x="${x.toFixed(1)}" y="${(y-5).toFixed(1)}" fill="var(--accent)" font-size="8" text-anchor="middle">${v}</text>`;
    }
  }
  const data=any?`<polygon points="${dpts.join(' ')}" fill="var(--accent)" fill-opacity="0.16" stroke="var(--accent)" stroke-width="2"/>`:'';
  const empty=any?'':`<text x="${cx}" y="${cy}" fill="var(--muted)" font-size="10" text-anchor="middle">No alignment scores yet</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="Cross-functional alignment radar">${rings}${spokes}${labels}${data}${dots}${empty}</svg>`;
}

// NPV as a function of discount rate, with the current rate and IRR marked.
function chtNpvCurveSVG(f){
  const init=effectiveInvestment(f);
  const flows=(f.cashFlows||[]).map(v=>Number(v)||0);
  if(!flows.length) return '<div class="cht-muted cht-chart-empty">Add annual cash flows to plot the NPV curve.</div>';
  const W=340,H=200,padL=52,padR=14,padT=14,padB=30;
  const irr=computeIRR(init,flows);
  let rMax=Math.max(0.4,(Number(f.discountRate)||0)*2);
  if(irr!=null&&irr>0) rMax=Math.max(rMax,irr*1.3);
  rMax=Math.min(rMax,2);
  const N=48, pts=[];
  for(let i=0;i<=N;i++){ const r=rMax*i/N; pts.push([r,computeNPV(init,flows,r)]); }
  const ys=pts.map(p=>p[1]);
  let yMin=Math.min(0,...ys), yMax=Math.max(0,...ys);
  if(yMin===yMax){ yMin-=1; yMax+=1; }
  const X=r=>padL+(r/rMax)*(W-padL-padR);
  const Y=v=>padT+(1-(v-yMin)/(yMax-yMin))*(H-padT-padB);
  const path=pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
  const zeroY=Y(0), unit=f.unit, curR=Number(f.discountRate)||0;
  let marks='';
  if(curR<=rMax){ const x=X(curR).toFixed(1);
    marks+=`<line x1="${x}" y1="${padT}" x2="${x}" y2="${H-padB}" stroke="var(--accent2)" stroke-width="1" stroke-dasharray="3 3"/>`+
           `<text x="${x}" y="${padT-3}" fill="var(--accent2)" font-size="8" text-anchor="middle">rate ${(curR*100).toFixed(0)}%</text>`; }
  if(irr!=null&&irr>=0&&irr<=rMax){ const x=X(irr).toFixed(1);
    marks+=`<circle cx="${x}" cy="${zeroY.toFixed(1)}" r="3" fill="var(--accent)"/>`+
           `<text x="${x}" y="${(zeroY-6).toFixed(1)}" fill="var(--accent)" font-size="8" text-anchor="middle">IRR ${(irr*100).toFixed(1)}%</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="NPV versus discount rate">
    <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W-padR}" y2="${zeroY.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="var(--border)" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <text x="${padL}" y="${H-padB+13}" fill="var(--muted)" font-size="8" text-anchor="start">0%</text>
    <text x="${W-padR}" y="${H-padB+13}" fill="var(--muted)" font-size="8" text-anchor="end">${(rMax*100).toFixed(0)}%</text>
    <text x="${padL-5}" y="${(Y(yMax)+3).toFixed(1)}" fill="var(--muted)" font-size="8" text-anchor="end">${fmtMoneyUnit(yMax,unit)}</text>
    <text x="${padL-5}" y="${(zeroY+3).toFixed(1)}" fill="var(--muted)" font-size="8" text-anchor="end">0</text>
    ${marks}
  </svg>`;
}

// Cumulative net cash flow (starts at −investment), with the break-even point.
function chtCumCashSVG(f){
  const init=effectiveInvestment(f);
  const flows=(f.cashFlows||[]).map(v=>Number(v)||0);
  if(!flows.length) return '<div class="cht-muted cht-chart-empty">Add annual cash flows to plot cumulative cash flow.</div>';
  const cum=[-init]; let c=-init; for(const cf of flows){ c+=cf; cum.push(c); }
  const W=340,H=200,padL=52,padR=14,padT=14,padB=30,Nyr=cum.length-1;
  let yMin=Math.min(0,...cum), yMax=Math.max(0,...cum);
  if(yMin===yMax){ yMin-=1; yMax+=1; }
  const X=t=>padL+(Nyr===0?0:t/Nyr)*(W-padL-padR);
  const Y=v=>padT+(1-(v-yMin)/(yMax-yMin))*(H-padT-padB);
  const path=cum.map((v,t)=>(t?'L':'M')+X(t).toFixed(1)+' '+Y(v).toFixed(1)).join(' ');
  const zeroY=Y(0), unit=f.unit;
  let dots='';
  for(let t=0;t<cum.length;t++) dots+=`<circle cx="${X(t).toFixed(1)}" cy="${Y(cum[t]).toFixed(1)}" r="2.2" fill="var(--accent)"/>`;
  let ticks='';
  for(let t=0;t<cum.length;t++) ticks+=`<text x="${X(t).toFixed(1)}" y="${H-padB+13}" fill="var(--muted)" font-size="8" text-anchor="middle">${t}</text>`;
  const pb=computePayback(init,flows);
  let be='';
  if(pb!=null){ const x=X(pb).toFixed(1);
    be=`<line x1="${x}" y1="${padT}" x2="${x}" y2="${H-padB}" stroke="var(--accent2)" stroke-width="1" stroke-dasharray="3 3"/>`+
       `<circle cx="${x}" cy="${zeroY.toFixed(1)}" r="3.2" fill="var(--accent2)"/>`+
       `<text x="${x}" y="${(zeroY-6).toFixed(1)}" fill="var(--accent2)" font-size="8" text-anchor="middle">break-even ${pb.toFixed(1)}y</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" class="cht-svg" role="img" aria-label="Cumulative cash flow with break-even">
    <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W-padR}" y2="${zeroY.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H-padB}" stroke="var(--border)" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${dots}${ticks}
    <text x="${padL-5}" y="${(Y(yMax)+3).toFixed(1)}" fill="var(--muted)" font-size="8" text-anchor="end">${fmtMoneyUnit(yMax,unit)}</text>
    <text x="${padL-5}" y="${(zeroY+3).toFixed(1)}" fill="var(--muted)" font-size="8" text-anchor="end">0</text>
    <text x="${padL-5}" y="${(Y(yMin)+3).toFixed(1)}" fill="var(--muted)" font-size="8" text-anchor="end">${fmtMoneyUnit(yMin,unit)}</text>
    ${be}
  </svg>`;
}

// ── Trade-off decision panel (WORK › Trade-off decision rail view) ───────────
// A configurable TRIANGLE: the primary trade-off plus up to 2 named comparison
// scenarios. Each triangle plots 3 of the 4 dimensions; the full 4-stance set is
// kept underneath (so conflicts + design guidelines still work off the primary).
export function chtOpenDecision(projId){
  const p=projid2proj(projId);
  _chtProjId = p ? p.id : null;
  if(p && (!p.charter || typeof p.charter!=='object')) p.charter=makeCharter();
  G('dec-overlay').classList.add('show');
  chtRenderPicker('decision');
  chtRenderDecision();
}
export function chtCloseDecision(){ G('dec-overlay').classList.remove('show'); chtSyncRailAfterClose(); }
export function chtDecSelectProject(id){ chtOpenDecision(id); }

function chtRenderDecision(){
  const p=projects.find(x=>x.id===_chtProjId);
  const t=G('dec-title'); if(t) t.textContent = p ? (p.name||'PROJECT') : 'TRADE-OFF DECISION';
  const body=G('dec-body'); if(!body) return;
  const c=chtCharter();
  if(!c){ body.innerHTML='<div class="cht-muted" style="padding:20px">No project selected — add a project on the Portfolio matrix.</div>'; return; }
  body.innerHTML = chtDecisionBody(c);
}

// The 3-of-4 point selector (which dimensions this triangle plots). `setter` is
// the mutator name; `si` (scenario index) is prefixed to the args when present.
function chtPointPick(points, setter, si){
  const arg = si==null?'':`${si},`;
  return `<div class="cht-pt-pick">${[0,1,2].map(idx=>
    `<select class="cht-in" onchange="${setter}(${arg}${idx},this.value)">
       ${CHT_DIMS4.map(([k,l])=>`<option value="${k}"${points[idx]===k?' selected':''}>${l}</option>`).join('')}
     </select>`).join('')}</div>`;
}
// The 4 stance selects (all dimensions — the plotted 3 + the omitted one that
// still drives conflicts). `setter` + optional scenario index as above.
function chtStanceGrid(stances, setter, si){
  const arg = si==null?'':`${si},`;
  return `<div class="cht-stance-grid">${CHT_DIMS4.map(([k,label])=>
    `<label class="cht-f"><span class="cht-l">${label}</span>
       <select class="cht-in" onchange="${setter}(${arg}'${k}',this.value)">
         ${CHT_STANCES.map(([v,l])=>`<option value="${v}"${stances[k]===v?' selected':''}>${l}</option>`).join('')}
       </select></label>`).join('')}</div>`;
}

function chtDecisionBody(c){
  const d=c.decision;
  const conflicts=chtConflicts(c);
  const warn=chtStanceWarn({stances:{a:d.stances[d.points[0]],b:d.stances[d.points[1]],c:d.stances[d.points[2]]}});
  const warnHTML = warn ? `<div class="cht-banner warn">⚠ ${warn}</div>` : '';
  const conflictHTML = conflicts.length
    ? `<div class="cht-banner bad">⚠ ${conflicts.length} conflict${conflicts.length>1?'s':''}: ${
        conflicts.map(x=>`${x.func} must-have on <b>${CHT_DIM_LABEL[x.dimension]}</b> (sacrificed)`).join('; ')}. Re-negotiate the stance or soften the demand.</div>`
    : '';
  const okHTML = (!conflicts.length && !warn)
    ? `<div class="cht-banner ok">✓ Consistent — the trade-off stance sacrifices nothing that a must-have demand depends on.</div>`
    : '';
  const primary=`<div class="cht-scenario cht-scenario-primary">
      <div class="cht-scenario-head"><span class="cht-scenario-name">★ Primary trade-off</span></div>
      ${chtTriangleSVG(d.points,d.stances)}
      <div class="cht-scenario-ctl"><span class="cht-hl">PLOT</span>${chtPointPick(d.points,'chtPointSet')}</div>
      ${chtStanceGrid(d.stances,'chtStanceSet')}
    </div>`;
  const scen=d.scenarios.map((s,si)=>`<div class="cht-scenario">
      <div class="cht-scenario-head">
        <input class="cht-in cht-scenario-name-in" value="${escH(s.name)}" placeholder="scenario name…" oninput="chtScenName(${si},this.value)">
        <button class="cht-cf-del" title="Remove scenario" onclick="chtScenRemove(${si})">×</button>
      </div>
      ${chtTriangleSVG(s.points,s.stances,{small:true})}
      <div class="cht-scenario-ctl"><span class="cht-hl">PLOT</span>${chtPointPick(s.points,'chtScenPointSet',si)}</div>
      ${chtStanceGrid(s.stances,'chtScenStance',si)}
    </div>`).join('');
  const addBtn = d.scenarios.length<2
    ? `<button class="sm" onclick="chtScenAdd()">+ Add comparison scenario</button>`
    : '<span class="cht-muted" style="font-size:11px">Max 3 triangles (primary + 2 scenarios).</span>';
  return `<div class="cht-note">Pick the 3 priorities that matter and set each stance — you can't prioritize everything, so sacrifice at least one. <b>Product cost</b> = what each unit costs; <b>Project cost</b> = what it costs to develop. Add up to 2 named scenarios to compare options side by side.</div>
    ${conflictHTML}${warnHTML}${okHTML}
    <div class="cht-sec-h">Trade-off triangles</div>
    <div class="cht-tri-grid">${primary}${scen}</div>
    <div style="margin:12px 0 4px">${addBtn}</div>
    <div class="cht-sec-h">Cross-functional alignment</div>
    <div class="cht-vizrow">
      <div class="cht-viz"><div class="cht-chart-t">Alignment radar — how aligned each function is (1–10)</div>${chtRadarSVG(c)}</div>
    </div>
    <div class="cht-sec-h">Guardrails</div>
    <div class="cht-sub">The hard lines and the give — what this project will not compromise, and where it can flex.</div>
    <div class="cht-form">
      ${chtListEditor('nonNegotiables','Non-negotiables','e.g. Must launch by Q3 2026')}
      ${chtListEditor('flexibilities','Flexibilities','e.g. Scope can shrink by 20%')}
    </div>`;
}

// Set a point in a triangle's 3-slot list; if the value duplicates another slot,
// swap them so the triangle always plots 3 distinct dimensions.
function chtPtSet(arr,idx,val){ const j=arr.indexOf(val); if(j>=0&&j!==idx) arr[j]=arr[idx]; arr[idx]=val; }

export function chtStanceSet(dim,value){ chtCharter().decision.stances[dim]=value; chtSave(); chtRenderDecision(); }
export function chtPointSet(idx,val){ chtPtSet(chtCharter().decision.points,+idx,val); chtSave(); chtRenderDecision(); }
export function chtScenAdd(){ const d=chtCharter().decision; if(d.scenarios.length>=2) return; d.scenarios.push(makeScenario()); chtSave(); chtRenderDecision(); }
export function chtScenRemove(si){ chtCharter().decision.scenarios.splice(si,1); chtSave(); chtRenderDecision(); }
export function chtScenName(si,val){ const s=chtCharter().decision.scenarios[si]; if(s){ s.name=val; chtSave(); } }  // no re-render → keep input focus
export function chtScenStance(si,dim,value){ const s=chtCharter().decision.scenarios[si]; if(!s) return; s.stances[dim]=value; chtSave(); chtRenderDecision(); }
export function chtScenPointSet(si,idx,val){ const s=chtCharter().decision.scenarios[si]; if(!s) return; chtPtSet(s.points,+idx,val); chtSave(); chtRenderDecision(); }

// Editable string list (non-negotiables / flexibilities) under charter.decision.
function chtListEditor(key,label,ph){
  const list=chtCharter().decision[key]||[];
  const rows=list.map((v,i)=>
    `<div class="cht-cf-row">
       <input class="cht-in" value="${escH(v)}" placeholder="${escH(ph)}" oninput="chtListSet('${key}',${i},this.value)">
       <button class="cht-cf-del" title="Remove" onclick="chtListRemove('${key}',${i})">×</button>
     </div>`).join('');
  return `<div class="cht-f cht-f-wide"><span class="cht-l">${label}</span>
    ${rows||'<div class="cht-muted">None yet.</div>'}
    <button class="sm" onclick="chtListAdd('${key}')">+ Add</button></div>`;
}
export function chtListSet(key,i,value){ chtCharter().decision[key][i]=value; chtSave(); }
export function chtListAdd(key){ chtCharter().decision[key].push(''); chtSave(); chtRenderDecision(); }
export function chtListRemove(key,i){ chtCharter().decision[key].splice(i,1); chtSave(); chtRenderDecision(); }

// ── Slide deck + synopsis generators ─────────────────────────────────────────
// [label, section, short-label]
const CHT_DEPTS = CHT_FUNCS.map(([sec,lbl])=>[lbl,sec]);
const CHT_DIM_LABEL = { features:'Features', time:'Time-to-market', productCost:'Product cost', projectCost:'Project cost', '':'—' };
// Human label for a stance.
const CHT_STANCE_LABEL = { prioritize:'Prioritize', balance:'Balance', sacrifice:'Sacrifice' };

function chtProj(){ return projects.find(x=>x.id===_chtProjId); }
function chtTrunc(s,n){ s=String(s||''); return s.length>n ? s.slice(0,n-1)+'…' : s; }
// Average alignment across the 5 functions (present scores only), or null.
function chtAlignAvg(c){
  const vals=CHT_FUNCS.map(([sec])=>Number(c[sec].alignment)).filter(v=>v>0);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
// Trade-off stance summary: which dimensions are prioritized / sacrificed.
function chtStanceSummary(d){
  const st=(d&&d.stances)||{};
  const grp=v=>CHT_DIMS4.filter(([k])=>st[k]===v).map(([,l])=>l);
  return { prioritize:grp('prioritize'), sacrifice:grp('sacrifice'), balance:grp('balance') };
}
// All non-empty demands across functions, flattened (with the function label).
function chtDemandsFlat(c){
  const out=[];
  for(const [sec,lbl] of CHT_FUNCS)
    for(const d of (c[sec].demands||[])) if(d.text) out.push({func:lbl, ...d});
  return out;
}
// Year-by-year financial rows (year 0 = the investment outlay).
function chtFinRows(f){
  const init=effectiveInvestment(f), flows=(f.cashFlows||[]).map(v=>Number(v)||0), r=Number(f.discountRate)||0;
  const rows=[{year:0, cf:-init, cum:-init, npvc:-init}]; let cum=-init;
  for(let t=1;t<=flows.length;t++){ const cf=flows[t-1]; cum+=cf; rows.push({year:t, cf, cum, npvc:cf/Math.pow(1+r,t)}); }
  return rows;
}

// ── clipboard (with graceful fallback) ──
export function chtCopyText(text, btn){
  const done=()=>{ if(btn){ const o=btn.textContent; btn.textContent='✓ Copied'; setTimeout(()=>{btn.textContent=o;},1400); } };
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(done, ()=>chtFallbackCopy(text,done));
  else chtFallbackCopy(text,done);
}
function chtFallbackCopy(text,done){
  const ta=document.createElement('textarea'); ta.value=text;
  ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); }catch(e){} document.body.removeChild(ta); done&&done();
}

// ── slide deck (5 HTML slides) ──
export function chtOpenDeck(){
  if(!chtProj()) return;
  G('cht-deck-body').innerHTML = chtDeckSlidesHTML();
  G('cht-deck-overlay').classList.add('show');
}
export function chtCloseDeck(){ G('cht-deck-overlay').classList.remove('show'); }
export function chtCopyDeckMd(btn){ chtCopyText(chtDeckMarkdown(), btn); }
// Print only the deck (dark styling preserved via print-color-adjust in CSS).
export function chtPrintDeck(){
  document.body.classList.add('cht-printing');
  window.print();
  setTimeout(()=>document.body.classList.remove('cht-printing'),400);
}

function chtDeckSlidesHTML(){
  const p=chtProj(), c=p.charter, f=c.financials, r=calculateFinancials(f), unit=f.unit;
  const money=v=>fmtMoneyUnit(v,unit), dimL=k=>CHT_DIM_LABEL[k||''];
  const chip=(l,v)=>`<span class="cht-slide-chip">${l}: <b>${escH(String(v||'—'))}</b></span>`;
  const rows=chtFinRows(f);
  const finTable=`<table class="cht-slide-tbl"><thead><tr><th>Year</th><th>Cash flow</th><th>Cumulative</th><th>NPV contrib.</th></tr></thead><tbody>${
    rows.map(x=>`<tr><td>${x.year===0?'0 · invest':x.year}</td><td>${money(x.cf)}</td><td>${money(x.cum)}</td><td>${money(x.npvc)}</td></tr>`).join('')}</tbody></table>`;
  const align=chtAlignAvg(c);
  const nn=c.decision.nonNegotiables.filter(Boolean), fx=c.decision.flexibilities.filter(Boolean);
  const S=[];
  S.push(`<section class="cht-slide"><div class="cht-slide-n">1 / 5</div>
    <h1 class="cht-slide-h">${escH(p.name||'Untitled project')}</h1>
    <div class="cht-slide-chips">${chip('Priority',c.priority)}${chip('Status',c.status)}</div>
    <div class="cht-slide-2col">
      <div>${chtTriangleSVG(c.decision.points,c.decision.stances)}</div>
      <div class="cht-slide-kpis">
        <div class="cht-slide-kpi"><span>NPV</span><b class="${r.npv>=0?'pos':'neg'}">${money(r.npv)}</b></div>
        <div class="cht-slide-kpi"><span>IRR</span><b>${r.display.irr}</b></div>
        <div class="cht-slide-kpi"><span>Break-even</span><b>${r.display.breakEvenUnits}</b></div>
        <div class="cht-slide-kpi"><span>Payback</span><b>${r.display.payback}</b></div>
      </div>
    </div>
    ${c.businessCase?`<p class="cht-slide-p">${escH(chtTrunc(c.businessCase,240))}</p>`:''}
  </section>`);
  S.push(`<section class="cht-slide"><div class="cht-slide-n">2 / 5</div>
    <h2 class="cht-slide-h">Financial analysis</h2>
    <div class="cht-slide-2col">
      <div>${finTable}</div>
      <div>${chtCumCashSVG(f)}</div>
    </div>
    <div class="cht-slide-chips">${chip('NPV',money(r.npv))}${chip('IRR',r.display.irr)}${chip('Yield',r.display.yieldPct)}${chip('Payback',r.display.payback)}</div>
  </section>`);
  S.push(`<section class="cht-slide"><div class="cht-slide-n">3 / 5</div>
    <h2 class="cht-slide-h">Cross-functional alignment${align!=null?` — avg ${align.toFixed(1)}/10`:''}</h2>
    <div class="cht-slide-2col">
      <div>${chtRadarSVG(c)}</div>
      <div><table class="cht-slide-tbl"><thead><tr><th>Function</th><th>Align</th><th>Demands</th><th>Must</th></tr></thead><tbody>${
        CHT_DEPTS.map(([lbl,sec])=>{ const ds=c[sec].demands||[]; return `<tr><td>${lbl}</td><td>${c[sec].alignment||'—'}</td><td>${ds.length}</td><td>${ds.filter(d=>d.mustHave).length}</td></tr>`; }).join('')}</tbody></table></div>
    </div>
  </section>`);
  const ss=chtStanceSummary(c.decision);
  const scens=c.decision.scenarios||[];
  const triCompare=`<div class="cht-slide-tris">
      <div class="cht-slide-tri"><div class="cht-slide-lh">Primary</div>${chtTriangleSVG(c.decision.points,c.decision.stances,{small:true})}</div>
      ${scens.map(s=>`<div class="cht-slide-tri"><div class="cht-slide-lh">${escH(s.name||'Scenario')}</div>${chtTriangleSVG(s.points,s.stances,{small:true})}</div>`).join('')}
    </div>`;
  const scenLines=scens.map(s=>{ const sq=chtStanceSummary({stances:s.stances});
    return `<b>${escH(s.name||'Scenario')}:</b> prioritize ${sq.prioritize.join(', ')||'—'} · sacrifice ${sq.sacrifice.join(', ')||'—'}`; }).join('<br>');
  S.push(`<section class="cht-slide"><div class="cht-slide-n">4 / 5</div>
    <h2 class="cht-slide-h">Trade-off &amp; constraints</h2>
    ${triCompare}
    <div class="cht-slide-2col">
      <div>
        <p class="cht-slide-p"><b>Prioritize:</b> ${ss.prioritize.join(', ')||'—'}<br>
          <b>Sacrifice:</b> ${ss.sacrifice.join(', ')||'—'}</p>
        ${scenLines?`<p class="cht-slide-p">${scenLines}</p>`:''}
      </div>
      <div>
        <div class="cht-slide-lists">
          <div><div class="cht-slide-lh">Non-negotiables</div>${nn.length?`<ul>${nn.map(x=>`<li>${escH(x)}</li>`).join('')}</ul>`:'<div class="cht-muted">—</div>'}</div>
          <div><div class="cht-slide-lh">Flexibilities</div>${fx.length?`<ul>${fx.map(x=>`<li>${escH(x)}</li>`).join('')}</ul>`:'<div class="cht-muted">—</div>'}</div>
        </div>
      </div>
    </div>
  </section>`);
  const demands=chtDemandsFlat(c), conflicts=chtConflicts(c);
  S.push(`<section class="cht-slide"><div class="cht-slide-n">5 / 5</div>
    <h2 class="cht-slide-h">Stakeholder demands${conflicts.length?` — ⚠ ${conflicts.length} conflict${conflicts.length>1?'s':''}`:''}</h2>
    ${demands.length?`<table class="cht-slide-tbl"><thead><tr><th>Function</th><th>Demand</th><th>Pushes</th><th>Must</th></tr></thead><tbody>${
      demands.map(d=>{ const conflict=d.mustHave&&d.dimension&&c.decision.stances[d.dimension]==='sacrifice';
        return `<tr${conflict?' style="color:var(--danger)"':''}><td>${d.func}</td><td>${escH(chtTrunc(d.text,54))}</td><td>${dimL(d.dimension)}</td><td>${d.mustHave?'MUST':'flex'}${conflict?' ⚠':''}</td></tr>`; }).join('')}</tbody></table>`
      :'<div class="cht-muted">No demands captured.</div>'}
  </section>`);
  return S.join('');
}

function chtDeckMarkdown(){
  const p=chtProj(), c=p.charter, f=c.financials, r=calculateFinancials(f), unit=f.unit;
  const money=v=>fmtMoneyUnit(v,unit), dimL=k=>CHT_DIM_LABEL[k||''];
  const rows=chtFinRows(f), align=chtAlignAvg(c);
  const nn=c.decision.nonNegotiables.filter(Boolean), fx=c.decision.flexibilities.filter(Boolean);
  const L=[];
  L.push(`# ${p.name||'Untitled project'} — Charter Deck`,'');
  L.push('## 1. Executive summary');
  L.push(`- **Priority:** ${c.priority||'—'} · **Status:** ${c.status||'—'}`);
  L.push(`- **NPV:** ${money(r.npv)} · **IRR:** ${r.display.irr} · **Break-even:** ${r.display.breakEvenUnits} · **Payback:** ${r.display.payback}`);
  if(c.businessCase) L.push(`- ${chtTrunc(c.businessCase,240)}`);
  L.push('','## 2. Financial analysis','| Year | Cash flow | Cumulative | NPV contribution |','|---|---|---|---|');
  rows.forEach(x=>L.push(`| ${x.year===0?'0 · invest':x.year} | ${money(x.cf)} | ${money(x.cum)} | ${money(x.npvc)} |`));
  L.push('',`NPV ${money(r.npv)} · IRR ${r.display.irr} · Yield ${r.display.yieldPct} · Payback ${r.display.payback}`,'');
  L.push(`## 3. Cross-functional alignment${align!=null?` (avg ${align.toFixed(1)}/10)`:''}`);
  CHT_DEPTS.forEach(([lbl,sec])=>{
    const ds=c[sec].demands||[], must=ds.filter(d=>d.mustHave).length;
    L.push(`- **${lbl}** (${c[sec].alignment||'—'}/10) — ${ds.length} demand${ds.length===1?'':'s'}, ${must} must-have`);
  });
  const ss=chtStanceSummary(c.decision);
  L.push('','## 4. Trade-off & constraints');
  L.push(`- **Primary — plotted:** ${c.decision.points.map(k=>CHT_DIM_LABEL[k]).join(' / ')}`);
  L.push(`- **Prioritize:** ${ss.prioritize.join(', ')||'—'}`);
  L.push(`- **Sacrifice:** ${ss.sacrifice.join(', ')||'—'}`);
  (c.decision.scenarios||[]).forEach(s=>{ const sq=chtStanceSummary({stances:s.stances});
    L.push(`- **Scenario “${s.name||'—'}”:** prioritize ${sq.prioritize.join(', ')||'—'} · sacrifice ${sq.sacrifice.join(', ')||'—'}`); });
  if(nn.length) L.push(`- **Non-negotiables:** ${nn.join('; ')}`);
  if(fx.length) L.push(`- **Flexibilities:** ${fx.join('; ')}`);
  const conflicts=chtConflicts(c);
  L.push('',`## 5. Stakeholder demands${conflicts.length?` (⚠ ${conflicts.length} conflict${conflicts.length>1?'s':''})`:''}`);
  chtDemandsFlat(c).forEach(d=>{
    const conflict=d.mustHave&&d.dimension&&c.decision.stances[d.dimension]==='sacrifice';
    L.push(`- **${d.func}:** ${chtTrunc(d.text,80)} _(${dimL(d.dimension)}, ${d.mustHave?'must-have':'flexible'}${conflict?' ⚠ conflict':''})_`);
  });
  return L.join('\n');
}

// ── 1-page synopsis (Markdown, rendered for preview) ──
export function chtOpenSynopsis(){
  if(!chtProj()) return;
  G('cht-syn-body').innerHTML = `<div class="cht-syn-page">${chtMdToHtml(chtSynopsisMarkdown())}</div>`;
  G('cht-syn-overlay').classList.add('show');
}
export function chtCloseSyn(){ G('cht-syn-overlay').classList.remove('show'); }
export function chtCopySyn(btn){ chtCopyText(chtSynopsisMarkdown(), btn); }

function chtSynopsisMarkdown(){
  const p=chtProj(), c=p.charter, f=c.financials, r=calculateFinancials(f), unit=f.unit;
  const money=v=>fmtMoneyUnit(v,unit), dimL=k=>CHT_DIM_LABEL[k||''];
  const align=chtAlignAvg(c);
  const nn=c.decision.nonNegotiables.filter(Boolean), fx=c.decision.flexibilities.filter(Boolean);
  const L=[];
  L.push(`# ${p.name||'Untitled project'} — Charter Synopsis`,'');
  L.push(`**Priority:** ${c.priority||'—'}  ·  **Status:** ${c.status||'—'}`,'');
  L.push('## Financial summary');
  L.push(`- **NPV:** ${money(r.npv)}`);
  L.push(`- **IRR:** ${r.display.irr}`);
  L.push(`- **Yield:** ${r.display.yieldPct}`);
  L.push(`- **Payback:** ${r.display.payback}`);
  L.push(`- **Break-even:** ${r.display.breakEvenUnits} (${r.display.breakEvenTime})`);
  L.push(`- **Effective investment:** ${money(r.effInvestment)}`);
  L.push('',`## Cross-functional alignment${align!=null?` — average ${align.toFixed(1)}/10`:''}`);
  CHT_DEPTS.forEach(([lbl,sec])=>{
    const must=(c[sec].demands||[]).filter(d=>d.mustHave).length;
    L.push(`- **${lbl}:** ${c[sec].alignment||'—'}/10${must?` — ${must} must-have demand${must>1?'s':''}`:''}`);
  });
  const ss=chtStanceSummary(c.decision), conflicts=chtConflicts(c);
  L.push('','## Trade-off');
  L.push(`- **Plotted:** ${c.decision.points.map(k=>CHT_DIM_LABEL[k]).join(' / ')}`);
  L.push(`- **Prioritize:** ${ss.prioritize.join(', ')||'—'}`);
  L.push(`- **Sacrifice:** ${ss.sacrifice.join(', ')||'—'}`);
  (c.decision.scenarios||[]).forEach(s=>{ const sq=chtStanceSummary({stances:s.stances});
    L.push(`- **Scenario “${s.name||'—'}”:** prioritize ${sq.prioritize.join(', ')||'—'} · sacrifice ${sq.sacrifice.join(', ')||'—'}`); });
  if(conflicts.length) L.push(`- **⚠ Conflicts:** ${conflicts.map(x=>`${x.func} must-have on ${dimL(x.dimension)}`).join('; ')}`);
  if(nn.length) L.push(`- **Non-negotiables:** ${nn.join('; ')}`);
  if(fx.length) L.push(`- **Flexibilities:** ${fx.join('; ')}`);
  return L.join('\n');
}

// Minimal Markdown → HTML for the synopsis preview (headings / bold / bullets).
function chtMdToHtml(md){
  const inline=s=>escH(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  let html='', inList=false;
  for(const raw of md.split('\n')){
    const line=raw.replace(/\s+$/,'');
    const close=()=>{ if(inList){ html+='</ul>'; inList=false; } };
    if(/^# /.test(line))      { close(); html+=`<h2>${inline(line.slice(2))}</h2>`; }
    else if(/^## /.test(line)){ close(); html+=`<h3>${inline(line.slice(3))}</h3>`; }
    else if(/^- /.test(line)) { if(!inList){ html+='<ul>'; inList=true; } html+=`<li>${inline(line.slice(2))}</li>`; }
    else if(line==='')        { close(); }
    else                      { close(); html+=`<p>${inline(line)}</p>`; }
  }
  if(inList) html+='</ul>';
  return html;
}
