/* ►► SECTION: GATE & PI ◄◄ INSIGHTS › Gate & PI — configurable stage-gate + PI planning.
 *
 * PHASE 1 (this file for now): the METHODOLOGY EDITOR + TEMPLATE LIBRARY.
 * The tool ships one editable default methodology (OPEN → SELECT → DO → IMPLEMENT
 * → PRODUCE → SELL). Every team runs its own process, so the model is fully
 * custom: rename / add / remove / reorder stages and define each stage's readiness
 * criteria. A criterion is HYBRID — either a manual hand-ticked check, or an AUTO
 * check bound to a computed signal (dimension op threshold) drawn from the existing
 * analytics datasets. Up to GATE_TEMPLATE_MAX saved methodologies form a reusable
 * library (apply / save-as / rename / delete).
 *
 * Data lives on the global `gateConfig` (rides save/backup/snapshot; sanitised by
 * sanitiseGateConfig); per-project state lives on project.gatePlan. Renders into
 * #res-body like every Resources tab. All identifiers are `gt`-prefixed. Reuses
 * pfSection for section shells (from portfolio.js). Nothing mutates state except
 * the explicit editor setters below, each of which calls saveState().
 *
 * Later phases (not built yet): per-project gate detail + hybrid resolver (2),
 * the Kanban pipeline / maturity axis (3), the PI board / time axis (4).
 */

// ── module state (UI-only, not persisted) ──
let _gtFold = {};          // stage.id -> true when its criteria list is folded shut
let _gtView = 'pipeline';  // sub-view: 'pipeline' (Kanban) | 'piboard' (PI roadmap) | 'projects' (detail) | 'methodology' (editor)
let _gtProjId = null;      // selected project in the Projects view
let _gtPiTab = 'overview'; // PI-board inner tab: 'overview' (gate matrix + select/drag) | 'plan' (milestones/objectives)
let _gtUnselOpen = false;  // whether the collapsed 'unselected projects' panel is expanded
let _gtDragId = null;      // project id currently being drag-reordered in the overview

// AUTO-criterion bindable signals. Evaluation is Phase 2; here the editor only
// lets the user pick one. The label doubles as the dropdown text.
const GATE_SIGNALS = [
  { id:'npv',        label:'NPV (€)' },
  { id:'riskAdjNpv', label:'Risk-adjusted NPV (€)' },
  { id:'pi',         label:'Profitability index' },
  { id:'blended',    label:'Blended channel margin (%)' },
  { id:'unitMargin', label:'Unit margin (%)' },
  { id:'conflicts',  label:'Trade-off conflicts (count)' },
  { id:'cost',       label:'Team cost over period (€)' },
  { id:'dtcGap',     label:'Design-to-cost gap (€/unit)' },
  { id:'alignMin',   label:'Min function alignment (1–10)' },
  { id:'riskScore',  label:'Talent risk score (0–100)' },
  { id:'spof',       label:'SPOF without KT plan (count)' },
  { id:'chanHHI',    label:'Channel concentration (0–1)' },
];
const GATE_OPS = ['>','>=','<','<=','=='];

// ── accessors / tiny helpers ──
// Projects the gate board should show: ARCHIVED (terminal: cancelled/withdrawn/eol/completed)
// projects are no longer being gated, so they're hidden from every gate surface.
function gtActiveProjects(){ return projects.filter(function(p){ return typeof projIsArchived!=='function' || !projIsArchived(p); }); }
function gtModel(){ if(!gateConfig||typeof gateConfig!=='object') gateConfig=makeGateConfig(); return gateConfig.model; }
function gtUid(pfx){ return pfx+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function gtDeepCopy(v){ return JSON.parse(JSON.stringify(v)); }
function gtSignalLabel(id){ const s=GATE_SIGNALS.find(x=>x.id===id); return s?s.label:t('(pick a signal)'); }
// shared inline styles (kept identical so the editor reads as one surface)
function gtInStyle(w){ return 'background:var(--bg);border:1px solid var(--border);color:var(--text);'
  +'font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 7px;border-radius:4px;outline:none;'
  +(w?('width:'+w+';'):''); }
function gtBtn(label,onclick,accent,title){
  return '<button onclick="'+onclick+'"'+(title?(' title="'+escH(title)+'"'):'')
    +' style="background:'+(accent?'rgba(200,241,53,.10)':'var(--bg)')+';border:1px solid '
    +(accent?'var(--accent)':'var(--border)')+';color:'+(accent?'var(--accent)':'var(--text)')+';'
    +'font-family:IBM Plex Mono,monospace;font-size:10px;padding:4px 9px;border-radius:4px;cursor:pointer;'
    +'letter-spacing:.03em">'+escH(label)+'</button>';
}

// ── entry point ──────────────────────────────────────────────────────────────
function renderGateTab(){
  const body=G('res-body'); if(!body) return;
  const m=gtModel();
  let h='<div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">';
  h+='<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:13px;color:var(--accent);letter-spacing:.06em">'+t('⛿ GATE & PI')+'</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
    +t('gate readiness per project — measured against your methodology')+'</span></div>';
  // sub-view toggle
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">'
    +gtBtn(t('▦ PIPELINE'),'gtSetView(\'pipeline\')',_gtView==='pipeline')
    +gtBtn(t('▦ PI BOARD'),'gtSetView(\'piboard\')',_gtView==='piboard')
    +gtBtn(t('▤ PROJECTS'),'gtSetView(\'projects\')',_gtView==='projects')
    +gtBtn(t('⛿ METHODOLOGY'),'gtSetView(\'methodology\')',_gtView==='methodology')
    +'</div>';
  if(_gtView==='methodology'){
    h+=pfSection(t('METHODOLOGY'),
        t('Your process, your labels. Rename / add / remove / reorder stages and set each stage’s readiness criteria. A criterion is either a manual check or an auto check bound to a computed signal.'),
        gtModelEditor(m));
    h+=pfSection(t('TEMPLATE LIBRARY'),
        t('Save the current methodology to reuse it later, or apply a saved one. Up to {n} templates.',{n:GATE_TEMPLATE_MAX}),
        gtTemplateBar());
  } else if(_gtView==='projects'){
    h+=gtProjectsView(m);
  } else if(_gtView==='piboard'){
    h+=gtPiBoardView(m);
  } else {
    h+=gtPipelineView(m);
  }
  h+='</div>';
  body.innerHTML=h;
}
function gtSetView(v){ _gtView=['methodology','projects','piboard'].includes(v)?v:'pipeline'; renderGateTab(); }

// ── methodology editor ───────────────────────────────────────────────────────
function gtModelEditor(m){
  let h='<div style="display:flex;flex-direction:column;gap:12px">';
  // model name
  h+='<div style="display:flex;align-items:center;gap:8px">'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('MODEL NAME')+'</span>'
    +'<input value="'+escH(m.name||'')+'" onchange="gtSetModelName(this.value)" style="'+gtInStyle('200px')+'">'
    +'</div>';
  // stages
  const n=m.stages.length;
  h+='<div style="display:flex;flex-direction:column;gap:10px">';
  m.stages.forEach((s,i)=>{ h+=gtStageCard(s,i,n); });
  h+='</div>';
  h+='<div>'+gtBtn(t('+ ADD STAGE'),'gtAddStage()',true)+'</div>';
  h+='</div>';
  return h;
}

function gtStageCard(s,i,n){
  const folded=!!_gtFold[s.id];
  const sw=safeColor(s.color||'var(--dim)');
  let h='<div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid '+sw+';border-radius:8px;padding:10px 12px">';
  // header row
  h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  h+='<button onclick="gtToggleFold('+JSON.stringify(s.id).replace(/"/g,'&quot;')+')" title="'+escH(t('Fold / unfold criteria'))+'" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;width:16px">'+(folded?'▸':'▾')+'</button>';
  h+='<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--dim);width:20px">'+(i+1)+'</span>';
  h+='<input value="'+escH(s.name||'')+'" onchange="gtSetStage('+i+',\'name\',this.value)" placeholder="'+escH(t('Stage name'))+'" style="'+gtInStyle('150px')+';font-weight:700">';
  h+='<input value="'+escH(s.desc||'')+'" onchange="gtSetStage('+i+',\'desc\',this.value)" placeholder="'+escH(t('short description'))+'" style="'+gtInStyle('220px')+'">';
  h+='<input type="color" value="'+(s.color||'#6b6b78')+'" onchange="gtSetStage('+i+',\'color\',this.value)" title="'+escH(t('Stage colour'))+'" style="width:26px;height:24px;border:1px solid var(--border);border-radius:4px;background:var(--bg);cursor:pointer;padding:1px">';
  h+='<span style="flex:1"></span>';
  h+='<button onclick="gtMoveStage('+i+',-1)" '+(i===0?'disabled':'')+' title="'+escH(t('Move up'))+'" style="background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;font-size:11px;width:22px;height:22px;opacity:'+(i===0?'.35':'1')+'">↑</button>';
  h+='<button onclick="gtMoveStage('+i+',1)" '+(i===n-1?'disabled':'')+' title="'+escH(t('Move down'))+'" style="background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;font-size:11px;width:22px;height:22px;opacity:'+(i===n-1?'.35':'1')+'">↓</button>';
  h+='<button onclick="gtDelStage('+i+')" title="'+escH(t('Delete stage'))+'" style="background:var(--bg);border:1px solid var(--border);color:var(--danger);border-radius:4px;cursor:pointer;font-size:11px;width:22px;height:22px">✕</button>';
  h+='</div>';
  // criteria
  if(!folded){
    h+='<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">';
    if(!s.criteria.length)
      h+='<div style="font-size:10px;color:var(--dim);font-style:italic;padding:2px 0 2px 24px">'+t('No criteria yet.')+'</div>';
    s.criteria.forEach((c,ci)=>{ h+=gtCritRow(i,ci,c); });
    h+='<div style="padding-left:24px">'+gtBtn(t('+ criterion'),'gtAddCrit('+i+')')+'</div>';
    h+='</div>';
  } else {
    const auto=s.criteria.filter(c=>c.kind==='auto').length;
    h+='<div style="margin-top:6px;padding-left:24px;font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'
      +t('{n} criteria',{n:s.criteria.length})+(auto?(' · '+t('{n} auto',{n:auto})):'')+'</div>';
  }
  h+='</div>';
  return h;
}

function gtCritRow(si,ci,c){
  const auto=c.kind==='auto';
  let h='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-left:24px">';
  // mandatory
  h+='<input type="checkbox" '+(c.mandatory?'checked':'')+' onchange="gtSetCrit('+si+','+ci+',\'mandatory\',this.checked)" title="'+escH(t('Mandatory — blocks advancement when unmet'))+'" style="accent-color:var(--danger);width:14px;height:14px">';
  // text
  h+='<input value="'+escH(c.text||'')+'" onchange="gtSetCrit('+si+','+ci+',\'text\',this.value)" placeholder="'+escH(t('Criterion'))+'" style="'+gtInStyle('220px')+'">';
  // kind
  h+='<select onchange="gtSetCrit('+si+','+ci+',\'kind\',this.value)" style="'+gtInStyle('')+'">'
    +'<option value="manual"'+(auto?'':' selected')+'>'+t('manual')+'</option>'
    +'<option value="auto"'+(auto?' selected':'')+'>'+t('auto')+'</option>'
    +'</select>';
  if(auto){
    // dimension
    h+='<select onchange="gtSetCrit('+si+','+ci+',\'dimension\',this.value)" style="'+gtInStyle('')+'">'
      +'<option value=""'+(c.dimension?'':' selected')+'>'+escH(t('— signal —'))+'</option>'
      +GATE_SIGNALS.map(s=>'<option value="'+s.id+'"'+(c.dimension===s.id?' selected':'')+'>'+escH(s.label)+'</option>').join('')
      +'</select>';
    // op
    h+='<select onchange="gtSetCrit('+si+','+ci+',\'op\',this.value)" style="'+gtInStyle('')+'">'
      +GATE_OPS.map(o=>'<option value="'+o+'"'+(c.op===o?' selected':'')+'>'+o+'</option>').join('')
      +'</select>';
    // threshold
    h+='<input type="number" value="'+(c.threshold==null?0:c.threshold)+'" onchange="gtSetCrit('+si+','+ci+',\'threshold\',this.value)" title="'+escH(t('Threshold'))+'" style="'+gtInStyle('80px')+'">';
  }
  // weight
  h+='<span style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace">'+t('wt')+'</span>';
  h+='<input type="number" step="0.5" min="0" value="'+(c.weight==null?1:c.weight)+'" onchange="gtSetCrit('+si+','+ci+',\'weight\',this.value)" title="'+escH(t('Weight in readiness score'))+'" style="'+gtInStyle('54px')+'">';
  h+='<span style="flex:1"></span>';
  h+='<button onclick="gtDelCrit('+si+','+ci+')" title="'+escH(t('Delete criterion'))+'" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:12px">✕</button>';
  h+='</div>';
  return h;
}

// ── template library ─────────────────────────────────────────────────────────
function gtTemplateBar(){
  const tpls=gateConfig.templates||[];
  const full=tpls.length>=GATE_TEMPLATE_MAX;
  let h='<div style="display:flex;flex-direction:column;gap:10px">';
  // saved templates
  if(tpls.length){
    h+='<div style="display:flex;flex-direction:column;gap:6px">';
    tpls.forEach(tp=>{
      const nStg=(tp.stages||[]).length;
      h+='<div style="display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--text);font-weight:700">'+escH(tp.name||'—')+'</span>'
        +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('{n} stages',{n:nStg})+'</span>'
        +'<span style="flex:1"></span>'
        +gtBtn(t('APPLY'),'gtApplyTemplate('+JSON.stringify(tp.id)+')',true)
        +gtBtn(t('Rename'),'gtRenameTemplate('+JSON.stringify(tp.id)+')')
        +gtBtn(t('Delete'),'gtDelTemplate('+JSON.stringify(tp.id)+')')
        +'</div>';
    });
    h+='</div>';
  } else {
    h+='<div style="font-size:11px;color:var(--dim);font-style:italic">'+t('No saved templates yet.')+'</div>';
  }
  // actions
  h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  h+=gtBtn(t('💾 SAVE CURRENT AS TEMPLATE'),'gtSaveTemplate()',!full,full?t('Template library is full ({n})',{n:GATE_TEMPLATE_MAX}):'');
  h+=gtBtn(t('↺ Reset to default (OPEN→SELL)'),'gtResetDefault()');
  if(full) h+='<span style="font-size:10px;color:var(--warn);font-family:IBM Plex Mono,monospace">'+t('library full')+'</span>';
  h+='</div>';
  h+='</div>';
  return h;
}

// ── editor setters (each persists; only structural/kind changes re-render) ─────
function gtSetModelName(v){ gtModel().name=String(v||''); saveState(); }
function gtSetStage(i,field,v){ const s=gtModel().stages[i]; if(!s) return; s[field]=String(v==null?'':v); saveState(); }
function gtToggleFold(id){ _gtFold[id]=!_gtFold[id]; renderGateTab(); }
function gtAddStage(){
  gtModel().stages.push(makeGateStage({id:gtUid('stg-'),name:'NEW STAGE',color:'#6b6b78'}));
  saveState(); renderGateTab();
}
function gtDelStage(i){
  const s=gtModel().stages[i]; if(!s) return;
  if(!confirm(t('Delete stage “{name}” and its criteria?',{name:s.name||'—'}))) return;
  gtModel().stages.splice(i,1); saveState(); renderGateTab();
}
function gtMoveStage(i,dir){
  const st=gtModel().stages, j=i+dir;
  if(j<0||j>=st.length) return;
  const tmp=st[i]; st[i]=st[j]; st[j]=tmp;
  saveState(); renderGateTab();
}
function gtAddCrit(si){
  const s=gtModel().stages[si]; if(!s) return;
  s.criteria.push(makeGateCriterion({id:gtUid('crt-')}));
  saveState(); renderGateTab();
}
function gtDelCrit(si,ci){
  const s=gtModel().stages[si]; if(!s||!s.criteria[ci]) return;
  s.criteria.splice(ci,1); saveState(); renderGateTab();
}
function gtSetCrit(si,ci,field,v){
  const s=gtModel().stages[si]; if(!s) return;
  const c=s.criteria[ci]; if(!c) return;
  if(field==='mandatory') c.mandatory=!!v;
  else if(field==='weight'||field==='threshold') c[field]=(v===''||v==null)?(field==='weight'?1:0):Number(v);
  else c[field]=String(v==null?'':v);
  saveState();
  if(field==='kind') renderGateTab();   // toggling manual/auto shows/hides the binding fields
}

// ── template library actions ─────────────────────────────────────────────────
function gtSaveTemplate(){
  const tpls=gateConfig.templates;
  if(tpls.length>=GATE_TEMPLATE_MAX){ alert(t('Template library is full ({n}). Delete one first.',{n:GATE_TEMPLATE_MAX})); return; }
  const m=gtModel();
  const name=(prompt(t('Save methodology as template — name:'),m.name||t('My methodology'))||'').trim();
  if(!name) return;
  tpls.push({ id:gtUid('tpl-'), name:name, stages:gtDeepCopy(m.stages) });
  saveState(); renderGateTab();
}
function gtApplyTemplate(id){
  const tp=(gateConfig.templates||[]).find(x=>x.id===id); if(!tp) return;
  if(!confirm(t('Apply template “{name}”? This replaces the current methodology (per-project progress on matching criterion ids is kept).',{name:tp.name||'—'}))) return;
  const m=gtModel();
  m.name=tp.name||m.name;
  m.stages=gtDeepCopy(tp.stages||[]);
  saveState(); renderGateTab();
}
function gtRenameTemplate(id){
  const tp=(gateConfig.templates||[]).find(x=>x.id===id); if(!tp) return;
  const name=(prompt(t('Rename template:'),tp.name||'')||'').trim();
  if(!name) return;
  tp.name=name; saveState(); renderGateTab();
}
function gtDelTemplate(id){
  const tp=(gateConfig.templates||[]).find(x=>x.id===id); if(!tp) return;
  if(!confirm(t('Delete template “{name}”?',{name:tp.name||'—'}))) return;
  gateConfig.templates=gateConfig.templates.filter(x=>x.id!==id);
  saveState(); renderGateTab();
}
function gtResetDefault(){
  if(!confirm(t('Reset the methodology to the default OPEN → SELECT → DO → IMPLEMENT → PRODUCE → SELL?'))) return;
  const m=gtModel();
  m.name='Stage-Gate';
  m.stages=defaultGateStages();
  saveState(); renderGateTab();
}

/* ══ Phase 2 — the HYBRID RESOLVER + per-project gate detail ══════════════
   Auto criteria evaluate `dimension op threshold` against a per-project signal
   map assembled from the existing datasets (ecDataset / channels / analytics +
   allocations). Manual criteria are ticked pass/fail/na and stored on
   project.gatePlan.criteria. Nothing here mutates project financial/talent data —
   only gatePlan (current stage + manual overrides), via the explicit setters. */

// Build { projId -> { signal: value|null } } once per render. Values are pulled
// from the same memoised datasets the analytics tabs use, so the numbers agree.
function gtBuildSignalMap(){
  const map={};
  projects.forEach(p=>{ map[p.id]={npv:null,riskAdjNpv:null,pi:null,blended:null,unitMargin:null,
    conflicts:null,cost:null,dtcGap:null,alignMin:null,chanHHI:null,riskScore:null,spof:null}; });
  // value / cost / decision — from the portfolio-economics dataset
  try{
    const eco=(typeof ecDataset==='function')?ecDataset():[];
    eco.forEach(r=>{ const m=map[r.p.id]; if(!m) return;
      m.npv=r.npv; m.riskAdjNpv=r.riskAdjNpv; m.pi=r.pi; m.blended=r.blended;
      m.unitMargin=r.unitMarginPct; m.conflicts=r.conflicts; m.cost=r.cost; m.alignMin=r.alignMin;
      m.dtcGap=(r.dtcCurrent!=null&&r.dtcTarget!=null)?(r.dtcCurrent-r.dtcTarget):null;
    });
  }catch(e){}
  // A project with NO financial model must not be judged as FAILING a financial gate
  // criterion. An empty model computes NPV=0, which a mandatory "NPV > 0" gate reads as a
  // real failure and blocks the project — the false "blocked at SELECT" symptom. Treat
  // "no model entered" as no-data (null → the auto criterion resolves to 'na', waived),
  // NOT as a fail. Only nulls the NPV group; a genuine model that yields NPV≤0 still fails.
  projects.forEach(p=>{ const m=map[p.id]; if(!m) return;
    const f=p.charter&&p.charter.financials;
    const items=(f&&f.investment&&Array.isArray(f.investment.items))?f.investment.items:[];
    const hasFinModel=!!(f&&(
      (Array.isArray(f.cashFlows)&&f.cashFlows.some(v=>Number(v)!==0)) ||
      Number(f.initialInvestment)>0 ||
      items.some(it=>Number(it&&it.amount)>0)
    ));
    if(!hasFinModel){ m.npv=null; m.riskAdjNpv=null; m.pi=null; }
  });
  // route-to-market concentration — per-project channel HHI
  projects.forEach(p=>{ try{ const cc=chanConcentration([p]); if(cc&&cc.channel) map[p.id].chanHHI=cc.channel.hhi; }catch(e){} });
  // talent — worst risk score + SPOF-without-KT count among the allocated team
  try{
    const an=(typeof buildAnalyticsDataset==='function')?buildAnalyticsDataset():[];
    const byId=new Map(); an.forEach(r=>byId.set(r.id,r));
    const team={};
    (allocRows||[]).forEach(a=>{ if(a.projectId==null||a.engId==null) return;
      (team[a.projectId]||(team[a.projectId]=new Set())).add(a.engId); });
    projects.forEach(p=>{ const set=team[p.id]; if(!set||!set.size) return;
      let maxRisk=null, spof=0;
      set.forEach(id=>{ const r=byId.get(id); if(!r) return;
        if(r.riskScore!=null) maxRisk=Math.max(maxRisk==null?0:maxRisk,r.riskScore);
        if(r.spofSkills&&r.spofSkills.length&&!r.hasKTPlan) spof++; });
      map[p.id].riskScore=maxRisk; map[p.id].spof=spof; });
  }catch(e){}
  return map;
}
// Evaluate ONE auto criterion against a project's signals. Returns
// {status:'pass'|'fail'|'na', value}. na = the signal has no data for this project.
function gtEvalAuto(crit,signals){
  const v=signals?signals[crit.dimension]:undefined;
  if(v==null||!Number.isFinite(+v)) return {status:'na',value:v};
  const val=+v, thr=Number(crit.threshold)||0; let pass;
  switch(crit.op){
    case '>':  pass=val>thr;  break;
    case '>=': pass=val>=thr; break;
    case '<':  pass=val<thr;  break;
    case '<=': pass=val<=thr; break;
    case '==': pass=val===thr;break;
    default:   pass=false;
  }
  return {status:pass?'pass':'fail',value:val};
}
// The status of a single criterion for a project (auto = evaluated, manual = stored).
function gtCritStatus(crit,gp,signals){
  if(crit.kind==='auto') return gtEvalAuto(crit,signals).status;
  const st=gp.criteria&&gp.criteria[crit.id];
  return (st&&st.status)||'pending';
}
// Weighted readiness of a stage for a project. `na` waives a criterion (out of the
// denominator); `pending`/`fail` count against. A mandatory criterion that isn't
// `pass` (and isn't waived) BLOCKS advancement.
function gtStageReadiness(stage,gp,signals){
  let totW=0, gotW=0, blocked=false; const blockers=[];
  const rows=(stage.criteria||[]).map(c=>{
    const status=gtCritStatus(c,gp,signals);
    const w=Number(c.weight); const wt=Number.isFinite(w)?w:1;
    if(status!=='na'){ totW+=wt; if(status==='pass') gotW+=wt; }
    if(c.mandatory && status!=='pass' && status!=='na'){ blocked=true; blockers.push(c); }
    return {c,status};
  });
  const pct=totW>0?Math.round(gotW/totW*100):(rows.length?0:100);
  return {rows,pct,blocked,blockers};
}
// Format a signal value for display, by dimension.
function gtFmtSignal(dim,v){
  if(v==null||!Number.isFinite(+v)) return t('no data');
  const n=+v;
  if(dim==='npv'||dim==='riskAdjNpv'||dim==='cost') return (typeof pfEur==='function')?pfEur(n):Math.round(n)+'€';
  if(dim==='dtcGap') return ((typeof pfEur==='function')?pfEur(n):Math.round(n)+'€')+'/u';
  if(dim==='blended'||dim==='unitMargin') return n.toFixed(1)+'%';
  if(dim==='pi'||dim==='chanHHI') return n.toFixed(2);
  if(dim==='alignMin') return n+'/10';
  return String(Math.round(n));   // conflicts, spof, riskScore
}

// ── Projects view (gate detail per project) ──────────────────────────────────
function gtProjectsView(m){
  const active=gtActiveProjects();
  if(!active.length) return pfEmpty(t('No active projects to gate — archived (closed/finished) projects are hidden here.'));
  if(!m.stages.length) return pfEmpty(t('No stages defined — build your methodology first (⛿ METHODOLOGY).'));
  // resolve selection (archived projects excluded)
  if(_gtProjId==null || !active.some(p=>p.id===_gtProjId)) _gtProjId=active[0].id;
  const p=projects.find(x=>x.id===_gtProjId);
  const signals=gtBuildSignalMap();
  let h='<div style="display:flex;flex-direction:column;gap:14px">';
  // project picker
  h+='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('PROJECT')+'</span>'
    +'<select onchange="gtSelectProject(this.value)" style="'+gtInStyle('240px')+'">'
    +active.map(x=>'<option value="'+x.id+'"'+(x.id===_gtProjId?' selected':'')+'>'+escH(x.name||t('Untitled project'))+'</option>').join('')
    +'</select></div>';
  h+=gtProjectDetail(p,m,signals[p.id]||{});
  h+='</div>';
  return h;
}

function gtProjectDetail(p,m,signals){
  const gp=p.gatePlan||makeGatePlan();
  const stages=m.stages;
  let curIdx=stages.findIndex(s=>s.id===gp.stageId);
  if(curIdx<0) curIdx=0;                      // default to the first stage if unset
  const cur=stages[curIdx];
  const rd=gtStageReadiness(cur,gp,signals);
  let h='<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:12px">';
  // stage progress strip
  h+=gtStageStrip(stages,curIdx,gp,signals);
  // current-stage header + readiness
  const sw=safeColor(cur.color||'var(--accent)');
  h+='<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">';
  h+='<div style="min-width:0"><div style="font-family:IBM Plex Mono,monospace;font-size:12px;color:'+sw+';font-weight:700;letter-spacing:.05em">'+escH(cur.name||'—')+'</div>'
    +(cur.desc?'<div style="font-size:10px;color:var(--muted);margin-top:2px">'+escH(cur.desc)+'</div>':'')+'</div>';
  h+='<div style="flex:1;min-width:120px"><div style="height:16px;background:var(--bg);border-radius:4px;overflow:hidden;position:relative">'
    +'<div style="height:100%;width:'+rd.pct+'%;background:'+(rd.blocked?'var(--warn)':sw)+'"></div>'
    +'<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:IBM Plex Mono,monospace;color:var(--text)">'+rd.pct+'% '+t('ready')+'</span></div></div>';
  // stage jump + advance/regress
  h+='<select onchange="gtSetProjectStage('+p.id+',this.value)" title="'+escH(t('Jump to stage'))+'" style="'+gtInStyle('')+'">'
    +stages.map((s,i)=>'<option value="'+escH(s.id)+'"'+(i===curIdx?' selected':'')+'>'+escH(s.name||('#'+(i+1)))+'</option>').join('')
    +'</select>';
  h+=gtBtn('← '+t('Back'),'gtRegress('+p.id+')',false,t('Move to the previous stage'));
  h+=gtBtn(t('Advance')+' →','gtAdvance('+p.id+')',true,t('Advance to the next stage'));
  h+='</div>';
  // gate decision — the classic Go / Hold / Kill disposition (writes project.lifecycle)
  h+=gtDecisionBar(p);
  // blockers banner
  if(rd.blocked){
    h+='<div style="background:rgba(241,164,53,.10);border:1px solid var(--warn);border-radius:6px;padding:8px 10px;font-size:11px;color:var(--text)">'
      +'<span style="color:var(--warn);font-weight:700">⚠ '+t('{n} mandatory criterion/criteria not met',{n:rd.blockers.length})+'</span> — '
      +t('advancing will ask you to override the gate.')+'</div>';
  }
  // criteria list
  h+='<div style="display:flex;flex-direction:column;gap:7px">';
  if(!rd.rows.length) h+='<div style="font-size:11px;color:var(--dim);font-style:italic">'+t('This stage has no criteria.')+'</div>';
  rd.rows.forEach(r=>{ h+=gtCritDetailRow(p,r.c,r.status,signals); });
  h+='</div>';
  h+='</div>';
  return h;
}

// A compact strip of all stages: past = filled, current = ring, future = dim.
function gtStageStrip(stages,curIdx,gp,signals){
  let h='<div style="display:flex;align-items:stretch;gap:4px;flex-wrap:wrap">';
  stages.forEach((s,i)=>{
    const rd=gtStageReadiness(s,gp,signals);
    const past=i<curIdx, isCur=i===curIdx;
    const col=safeColor(s.color||'var(--accent)');
    const bg=past?col:(isCur?'var(--bg)':'var(--bg)');
    const bd=isCur?col:(past?col:'var(--border)');
    const txt=past?'var(--bg)':(isCur?col:'var(--dim)');
    h+='<div title="'+escH((s.name||'')+' · '+rd.pct+'% ready')+'" style="flex:1;min-width:70px;text-align:center;background:'+bg+';border:1px solid '+bd+';'
      +(isCur?'border-width:2px;':'')+'border-radius:5px;padding:5px 4px">'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;font-weight:700;color:'+txt+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escH(s.name||('#'+(i+1)))+'</div>'
      +'<div style="font-size:9px;color:'+(past?'var(--bg)':'var(--muted)')+';margin-top:1px">'+(past?'✓':rd.pct+'%')+'</div>'
      +'</div>';
    if(i<stages.length-1) h+='<div style="align-self:center;color:var(--dim);font-size:10px">›</div>';
  });
  h+='</div>';
  return h;
}

// One criterion row in the detail: status chip + text; auto shows the live value,
// manual shows pass/fail/na buttons + a note field.
function gtCritDetailRow(p,c,status,signals){
  const auto=c.kind==='auto';
  const chip=gtStatusChip(status);
  let h='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 9px">';
  h+=chip;
  h+='<div style="min-width:0;flex:1"><span style="font-size:11px;color:var(--text)">'+escH(c.text||t('(untitled criterion)'))+'</span>'
    +(c.mandatory?' <span style="font-size:9px;color:var(--danger);font-family:IBM Plex Mono,monospace">'+t('MANDATORY')+'</span>':'')+'</div>';
  if(auto){
    const val=signals?signals[c.dimension]:undefined;
    h+='<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace" title="'+escH(t('auto'))+'">'
      +escH(gtSignalLabel(c.dimension))+' '+escH(c.op)+' '+escH(String(c.threshold))+'</span>';
    h+='<span style="font-size:11px;font-family:IBM Plex Mono,monospace;color:var(--text);min-width:60px;text-align:right">'+escH(gtFmtSignal(c.dimension,val))+'</span>';
  } else {
    const gp=p.gatePlan||makeGatePlan(); const st=gp.criteria&&gp.criteria[c.id];
    const note=(st&&st.note)||'';
    h+='<div style="display:flex;gap:3px">'
      +gtStatusBtn(p.id,c.id,'pass','✓',status==='pass','var(--accent)')
      +gtStatusBtn(p.id,c.id,'fail','✕',status==='fail','var(--danger)')
      +gtStatusBtn(p.id,c.id,'na','–',status==='na','var(--dim)')
      +'</div>';
    h+='<input value="'+escH(note)+'" onchange="gtSetNote('+p.id+','+JSON.stringify(c.id).replace(/"/g,'&quot;')+',this.value)" placeholder="'+escH(t('note'))+'" style="'+gtInStyle('130px')+'">';
  }
  h+='</div>';
  return h;
}
function gtStatusChip(status){
  const map={pass:['✓','var(--accent)'],fail:['✕','var(--danger)'],na:['–','var(--dim)'],pending:['·','var(--muted)']};
  const s=map[status]||map.pending;
  return '<span style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1px solid '+s[1]+';color:'+s[1]+';font-size:11px;flex-shrink:0">'+s[0]+'</span>';
}
function gtStatusBtn(projId,critId,status,glyph,active,color){
  return '<button onclick="gtSetManual('+projId+','+JSON.stringify(critId).replace(/"/g,'&quot;')+',\''+status+'\')" title="'+escH(status)+'" '
    +'style="width:24px;height:22px;border:1px solid '+(active?color:'var(--border)')+';border-radius:4px;cursor:pointer;font-size:11px;'
    +'background:'+(active?color:'var(--bg)')+';color:'+(active?'var(--bg)':'var(--muted)')+'">'+glyph+'</button>';
}

// ── Projects-view actions (write project.gatePlan only) ──────────────────────
function gtSelectProject(id){ _gtProjId=Number(id); renderGateTab(); }
function gtProjGatePlan(projId){
  const p=projects.find(x=>x.id===Number(projId)); if(!p) return null;
  if(!p.gatePlan||typeof p.gatePlan!=='object') p.gatePlan=makeGatePlan();
  if(!p.gatePlan.criteria||typeof p.gatePlan.criteria!=='object') p.gatePlan.criteria={};
  return p.gatePlan;
}
function gtSetManual(projId,critId,status){
  const gp=gtProjGatePlan(projId); if(!gp) return;
  const cur=gp.criteria[critId]&&gp.criteria[critId].status;
  const next=(cur===status)?'pending':status;   // click the active one again to clear
  const prevNote=(gp.criteria[critId]&&gp.criteria[critId].note)||'';
  gp.criteria[critId]={status:next,note:prevNote};
  saveState(); renderGateTab();
}
function gtSetNote(projId,critId,note){
  const gp=gtProjGatePlan(projId); if(!gp) return;
  const cur=gp.criteria[critId]||{status:'pending',note:''};
  cur.note=String(note==null?'':note); gp.criteria[critId]=cur;
  saveState();   // note doesn't affect readiness → no re-render (preserve focus)
}
function gtSetProjectStage(projId,stageId){
  const gp=gtProjGatePlan(projId); if(!gp) return;
  gp.stageId=String(stageId||''); saveState(); renderGateTab();
}
function gtStepStage(projId,dir){
  const p=projects.find(x=>x.id===Number(projId)); if(!p) return;
  const gp=gtProjGatePlan(projId); const stages=gtModel().stages;
  let i=stages.findIndex(s=>s.id===gp.stageId); if(i<0) i=0;
  const j=i+dir; if(j<0||j>=stages.length){ if(dir>0) alert(t('Already at the final stage.')); return; }
  if(dir>0){
    const signals=gtBuildSignalMap()[p.id]||{};
    const rd=gtStageReadiness(stages[i],gp,signals);
    if(rd.blocked && !confirm(t('“{stage}” has {n} unmet mandatory criterion/criteria. Override the gate and advance anyway?',{stage:stages[i].name||'—',n:rd.blockers.length}))) return;
  }
  gp.history=Array.isArray(gp.history)?gp.history:[];
  gp.history.push({from:stages[i].id,to:stages[j].id,ts:Date.now()});
  gp.stageId=stages[j].id;
  saveState(); renderGateTab();
}
function gtAdvance(projId){ gtStepStage(projId,1); }
function gtRegress(projId){ gtStepStage(projId,-1); }

/* ── Gate decision — Go / Hold / Kill (the disposition axis) ──────────────────
   The classic stage-gate verdict, sitting where reviewers already are. Distinct
   from the stage move (forward position): a decision writes project.lifecycle via
   projSetLifecycle (logged), NOT gatePlan. Go additionally passes the gate — it
   funds (Active) AND tries to advance the stage through gtStepStage, so stage
   moves keep a single source of truth (blocked-override + history stay there).
   The two axes are independent: if you decline the blocked-override, the project
   is still funded but stays at its stage. */
function gtDecisionBar(p){
  const def=projLifecycleDef(p);
  const col=safeColor(def.color||'var(--muted)');
  let h='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">';
  h+='<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.05em">'+t('GATE DECISION')+'</span>';
  h+='<span title="'+escH(t('Current disposition'))+'" style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-family:IBM Plex Mono,monospace;color:'+col+';border:1px solid '+col+';border-radius:10px;padding:2px 9px">'
    +'<span style="width:7px;height:7px;border-radius:50%;background:'+col+';flex-shrink:0"></span>'+escH(t(def.label))+'</span>';
  h+='<span style="flex:1"></span>';
  h+=gtDecBtn(p.id,'go','✓ '+t('Go'),'var(--accent)',t('Pass the gate: fund (Active) and advance to the next stage'));
  h+=gtDecBtn(p.id,'hold','⏸ '+t('Hold'),'var(--warn)',t('Pause: set On Hold — stops consuming capacity but stays in the portfolio'));
  h+=gtDecBtn(p.id,'kill','✕ '+t('Kill'),'var(--danger)',t('Stop: set Cancelled (terminal)'));
  h+='</div>';
  return h;
}
function gtDecBtn(projId,decision,label,color,title){
  return '<button onclick="gtDecide('+projId+',\''+decision+'\')" title="'+escH(title)+'" '
    +'style="background:var(--bg);border:1px solid '+color+';color:'+color+';font-family:IBM Plex Mono,monospace;'
    +'font-size:10px;font-weight:700;padding:4px 11px;border-radius:4px;cursor:pointer;letter-spacing:.03em">'+escH(label)+'</button>';
}
// Record a Go / Hold / Kill verdict. Reason prompt (cancel aborts the whole action).
function gtDecide(projId,decision){
  const p=projects.find(x=>x.id===Number(projId)); if(!p) return;
  const map={go:'active',hold:'on_hold',kill:'cancelled'};
  const next=map[decision]; if(!next) return;
  const verb={go:t('Go'),hold:t('Hold'),kill:t('Kill')}[decision];
  const reason=prompt(t('“{d}” decision — reason (optional):',{d:verb}),''); if(reason===null) return;
  projSetLifecycle(p,next,reason);
  if(decision==='go'){
    // Pass the gate → advance, but only when a next stage exists (funding a project already
    // at the final gate must not pop gtStepStage's "already at the final stage" alert).
    const stages=gtModel().stages, gp=p.gatePlan||makeGatePlan();
    let ci=stages.findIndex(s=>s.id===gp.stageId); if(ci<0) ci=0;
    if(ci < stages.length-1) gtStepStage(projId,1);   // gtStepStage handles the blocked-override confirm
  }
  saveState(); renderGateTab();                 // persist the disposition regardless of the advance outcome
}

/* ══ Phase 3 — the KANBAN PIPELINE (maturity axis) ════════════════════════
   The portfolio overview: one column per stage, each project as a card in its
   current stage showing gate readiness + blockers. A card opens the Phase-2
   detail; the ▸ button advances (confirm-override when blocked, via gtAdvance).
   Read-only over project financial/talent data — only gatePlan.stageId moves. */
function gtCurStageIdx(p,stages){
  const gp=p.gatePlan||makeGatePlan();
  let i=stages.findIndex(s=>s.id===gp.stageId);
  return i<0?0:i;   // unset current stage defaults to the first stage
}
function gtPipelineView(m){
  const active=gtActiveProjects();
  if(!active.length) return pfEmpty(t('No active projects to gate — archived (closed/finished) projects are hidden here.'));
  if(!m.stages.length) return pfEmpty(t('No stages defined — build your methodology first (⛿ METHODOLOGY).'));
  const stages=m.stages;
  const signals=gtBuildSignalMap();
  // group projects by current-stage index (archived projects excluded)
  const cols=stages.map(()=>[]);
  let blockedTot=0;
  active.forEach(p=>{
    const i=gtCurStageIdx(p,stages);
    cols[i].push(p);
    const rd=gtStageReadiness(stages[i],p.gatePlan||makeGatePlan(),signals[p.id]||{});
    if(rd.blocked) blockedTot++;
  });
  let h='<div style="display:flex;flex-direction:column;gap:12px">';
  // summary line
  h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted)">'
    +'<span>'+t('{n} project(s)',{n:active.length})+'</span>'
    +'<span>'+t('{n} stage(s)',{n:stages.length})+'</span>'
    +'<span style="color:'+(blockedTot?'var(--warn)':'var(--muted)')+'">'+(blockedTot?'⚠ ':'')+t('{n} blocked at their gate',{n:blockedTot})+'</span>'
    +'</div>';
  // board (horizontal scroll)
  h+='<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;align-items:flex-start">';
  stages.forEach((s,i)=>{ h+=gtPipelineColumn(s,i,cols[i],signals); });
  h+='</div>';
  h+='</div>';
  return h;
}
function gtPipelineColumn(stage,idx,projs,signals){
  const col=safeColor(stage.color||'var(--accent)');
  let h='<div style="flex:0 0 210px;width:210px;display:flex;flex-direction:column;gap:8px">';
  // column header
  h+='<div style="border-top:3px solid '+col+';background:var(--surface);border-radius:0 0 6px 6px;padding:7px 9px;display:flex;align-items:center;gap:6px">'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;font-weight:700;color:'+col+';letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escH(stage.name||('#'+(idx+1)))+'</span>'
    +'<span style="margin-left:auto;font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;background:var(--bg);border-radius:10px;padding:1px 7px">'+projs.length+'</span>'
    +'</div>';
  // cards
  if(!projs.length){
    h+='<div style="font-size:10px;color:var(--dim);font-style:italic;padding:6px 4px;text-align:center;border:1px dashed var(--border);border-radius:6px">'+t('empty')+'</div>';
  } else {
    projs.forEach(p=>{ h+=gtPipelineCard(p,stage,idx,signals[p.id]||{}); });
  }
  h+='</div>';
  return h;
}
function gtPipelineCard(p,stage,idx,signals){
  const gp=p.gatePlan||makeGatePlan();
  const rd=gtStageReadiness(stage,gp,signals);
  const col=safeColor(stage.color||'var(--accent)');
  const barCol=rd.blocked?'var(--warn)':col;
  const pc=safeColor(p.color||'var(--dim)');
  let h='<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid '+pc+';border-radius:6px;padding:8px 9px;display:flex;flex-direction:column;gap:6px">';
  // title row (click → detail)
  h+='<div onclick="gtOpenDetail('+p.id+')" title="'+escH(t('Open gate detail'))+'" style="cursor:pointer;font-size:11px;color:var(--text);font-weight:600;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(p.name||t('Untitled project'))+'</div>';
  // readiness bar
  h+='<div style="height:13px;background:var(--bg);border-radius:3px;overflow:hidden;position:relative">'
    +'<div style="height:100%;width:'+rd.pct+'%;background:'+barCol+'"></div>'
    +'<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:IBM Plex Mono,monospace;color:var(--text)">'+rd.pct+'%</span></div>';
  // foot: blockers + advance
  h+='<div style="display:flex;align-items:center;gap:6px">';
  h+='<span style="font-size:9px;font-family:IBM Plex Mono,monospace;color:'+(rd.blocked?'var(--warn)':'var(--dim)')+'">'
    +(rd.blocked?('⚠ '+t('{n} blocking',{n:rd.blockers.length})):t('ready'))+'</span>';
  h+='<span style="flex:1"></span>';
  const last=idx>=gtModel().stages.length-1;
  h+='<button onclick="gtAdvance('+p.id+')" '+(last?'disabled':'')+' title="'+escH(last?t('Final stage'):t('Advance to next stage'))+'" '
    +'style="width:24px;height:20px;border:1px solid '+(last?'var(--border)':'var(--accent)')+';border-radius:4px;cursor:'+(last?'default':'pointer')+';'
    +'background:'+(last?'var(--bg)':'rgba(200,241,53,.10)')+';color:'+(last?'var(--dim)':'var(--accent)')+';font-size:11px;opacity:'+(last?'.5':'1')+'">▸</button>';
  h+='</div>';
  h+='</div>';
  return h;
}
// open a project's Phase-2 gate detail from a pipeline card
function gtOpenDetail(projId){ _gtProjId=Number(projId); _gtView='projects'; renderGateTab(); }

/* ══ Phase 4 — the PI BOARD (time axis) ═══════════════════════════════════
   Increments (PIs) are named time boxes on `gateConfig.increments`; the roadmap
   grid (projects × increments) lets each project COMMIT a target stage per PI,
   stored on `gatePlan.roadmap[incId]`. This is the planning layer on top of the
   pipeline's "where things actually are". Editing writes only the increments list
   and gatePlan.roadmap — never project financial/talent data. */
function gtPiBoardView(m){
  let h='<div style="display:flex;flex-direction:column;gap:14px">';
  // increments editor — shared: both inner tabs use these as their columns
  h+=pfSection(t('INCREMENTS (PIs)'),
      t('Your planning time boxes — quarters, program increments, releases, whatever your cadence is. Reorder to set the timeline left-to-right.'),
      gtIncrementsEditor());
  // inner toggle: Gate overview (select/drag + gate matrix) vs PI plan (milestones/objectives)
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap">'
    +gtBtn(t('▤ GATE OVERVIEW'),'gtSetPiTab(\'overview\')',_gtPiTab==='overview')
    +gtBtn(t('◎ PI PLAN'),'gtSetPiTab(\'plan\')',_gtPiTab==='plan')
    +'</div>';
  if(_gtPiTab==='plan'){
    h+=pfSection(t('PI PLAN — milestones & objectives'),
        t('For each selected project and increment, capture the milestones and major objectives committed for that PI. Choose which projects appear here by selecting them in the Gate overview.'),
        gtPiPlanGrid(m));
  } else {
    h+=pfSection(t('GATE OVERVIEW — planned gate per increment'),
        t('Select the projects to focus on (the rest collapse below), drag ⋮⋮ to reorder, and for each project + increment commit the stage you plan it to be AT by the end of that PI. The ● marker shows where it actually is now.'),
        gtOverviewGrid(m));
  }
  h+='</div>';
  return h;
}
function gtSetPiTab(v){ _gtPiTab=(v==='plan')?'plan':'overview'; renderGateTab(); }

// ── PI-planning order + selection (planning-only, stored on gateConfig) ────────
// Projects in PI-planning display order: gateConfig.piOrder first (existing ids),
// then any project not yet in that list, appended in projects[] order.
function gtProjOrder(){
  const order=Array.isArray(gateConfig.piOrder)?gateConfig.piOrder:[];
  const active=gtActiveProjects();   // archived projects are not planned on the roadmap
  const byId=new Map(active.map(p=>[p.id,p]));
  const out=[], seen=new Set();
  order.forEach(id=>{ const p=byId.get(id); if(p&&!seen.has(id)){ out.push(p); seen.add(id); } });
  active.forEach(p=>{ if(!seen.has(p.id)){ out.push(p); seen.add(p.id); } });
  return out;
}
function gtPiSelectedSet(){ return new Set(Array.isArray(gateConfig.piSelected)?gateConfig.piSelected:[]); }
function gtEnsureInOrder(projId){
  const ord=Array.isArray(gateConfig.piOrder)?gateConfig.piOrder:(gateConfig.piOrder=[]);
  if(!ord.includes(projId)) ord.push(projId);
}
function gtPiToggleSelect(projId){
  projId=Number(projId);
  const sel=Array.isArray(gateConfig.piSelected)?gateConfig.piSelected:(gateConfig.piSelected=[]);
  const i=sel.indexOf(projId);
  if(i>=0) sel.splice(i,1); else { sel.push(projId); gtEnsureInOrder(projId); }
  saveState(); renderGateTab();
}
function gtToggleUnsel(){ _gtUnselOpen=!_gtUnselOpen; renderGateTab(); }
// Reorder: move dragId to sit just before targetId in the full planning order.
function gtPiReorder(dragId,targetId){
  dragId=Number(dragId); targetId=Number(targetId);
  if(dragId===targetId) return;
  let ids=gtProjOrder().map(p=>p.id).filter(id=>id!==dragId);
  const ti=ids.indexOf(targetId);
  if(ti<0) ids.push(dragId); else ids.splice(ti,0,dragId);
  gateConfig.piOrder=ids;
  saveState(); renderGateTab();
}
// HTML5 drag handlers (inline on the overview rows).
function gtDragStart(ev,id){ _gtDragId=Number(id); try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',String(id)); }catch(e){} }
function gtDragOver(ev){ ev.preventDefault(); try{ ev.dataTransfer.dropEffect='move'; }catch(e){} }
function gtDragDrop(ev,id){ ev.preventDefault(); let d=_gtDragId; if(d==null){ try{ d=Number(ev.dataTransfer.getData('text/plain')); }catch(e){} } _gtDragId=null; if(d!=null&&!Number.isNaN(d)) gtPiReorder(d,id); }
function gtDragEnd(){ _gtDragId=null; }

// ── Gate overview (selectable / draggable projects × PIs gate matrix) ─────────
function gtOverviewGrid(m){
  const incs=gateConfig.increments||[];
  if(!gtProjOrder().length) return pfEmpty(t('No active projects to plan — archived (closed/finished) projects are hidden here.'));
  if(!m.stages.length) return pfEmpty(t('No stages defined — build your methodology first (⛿ METHODOLOGY).'));
  const stages=m.stages;
  const ordered=gtProjOrder();
  const selSet=gtPiSelectedSet();
  const selected=ordered.filter(p=>selSet.has(p.id));
  const unselected=ordered.filter(p=>!selSet.has(p.id));
  let h='';
  if(!incs.length)
    h+='<div style="font-size:11px;color:var(--dim);font-style:italic;margin-bottom:10px">'+t('Add at least one increment above to commit gates over time. You can still select and order projects below.')+'</div>';
  h+='<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;min-width:100%">';
  h+='<thead><tr>';
  h+='<th style="position:sticky;left:0;background:var(--surface);text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);z-index:1">'+t('PROJECT')+'</th>';
  incs.forEach(iv=>{
    const range=[iv.start,iv.end].filter(Boolean).join(' → ');
    h+='<th style="padding:6px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);text-align:center;min-width:120px">'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--text);font-weight:700">'+escH(iv.name||'PI')+'</div>'
      +(range?'<div style="font-size:9px;color:var(--dim)">'+escH(range)+'</div>':'')+'</th>';
  });
  h+='</tr></thead><tbody>';
  if(!selected.length)
    h+='<tr><td colspan="'+(incs.length+1)+'" style="padding:12px 10px;text-align:center;color:var(--dim);font-style:italic;border-bottom:1px solid var(--border)">'+t('No projects selected — pick some below to plan their gates.')+'</td></tr>';
  selected.forEach(p=>{ h+=gtOverviewRow(p,stages,incs); });
  h+='</tbody></table></div>';
  if(unselected.length) h+=gtUnselectedPanel(unselected);
  return h;
}
function gtOverviewRow(p,stages,incs){
  const gp=p.gatePlan||makeGatePlan();
  const roadmap=(gp.roadmap&&typeof gp.roadmap==='object')?gp.roadmap:{};
  const curIdx=gtCurStageIdx(p,stages);
  const curStage=stages[curIdx];
  let h='<tr draggable="true" ondragstart="gtDragStart(event,'+p.id+')" ondragover="gtDragOver(event)" ondrop="gtDragDrop(event,'+p.id+')" ondragend="gtDragEnd(event)">';
  h+='<td style="position:sticky;left:0;background:var(--surface);padding:6px 10px;border-bottom:1px solid var(--border);border-left:3px solid '+safeColor(p.color||'var(--dim)')+';white-space:nowrap;z-index:1">'
    +'<div style="display:flex;align-items:center;gap:7px">'
    +'<span title="'+escH(t('Drag to reorder'))+'" style="cursor:grab;color:var(--dim);font-size:12px">⋮⋮</span>'
    +'<input type="checkbox" checked onchange="gtPiToggleSelect('+p.id+')" title="'+escH(t('Selected — untick to collapse'))+'" style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer;flex-shrink:0">'
    +'<div style="min-width:0">'
    +'<div style="color:var(--text);font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis">'+escH(p.name||t('Untitled project'))+'</div>'
    +'<div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace">● '+t('now')+': '+escH(curStage.name||'—')+'</div>'
    +'</div></div></td>';
  incs.forEach(iv=>{
    const sel=roadmap[iv.id]||'';
    const selStage=stages.find(s=>s.id===sel);
    const bd=selStage?safeColor(selStage.color||'var(--accent)'):'var(--border)';
    h+='<td style="padding:5px 8px;border-bottom:1px solid var(--border);border-left:3px solid '+bd+';text-align:center">'
      +'<select onchange="gtSetRoadmap('+p.id+','+JSON.stringify(iv.id).replace(/"/g,'&quot;')+',this.value)" style="'+gtInStyle('105px')+'">'
      +'<option value="">'+escH(t('—'))+'</option>'
      +stages.map(s=>'<option value="'+escH(s.id)+'"'+(s.id===sel?' selected':'')+'>'+escH(s.name||'—')+'</option>').join('')
      +'</select></td>';
  });
  h+='</tr>';
  return h;
}
function gtUnselectedPanel(list){
  const open=_gtUnselOpen;
  let h='<div style="margin-top:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">';
  h+='<div onclick="gtToggleUnsel()" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 12px">'
    +'<span style="color:var(--muted);font-size:12px;width:14px">'+(open?'▾':'▸')+'</span>'
    +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.04em">'+t('UNSELECTED PROJECTS')+'</span>'
    +'<span style="font-size:10px;color:var(--muted);font-family:IBM Plex Mono,monospace;background:var(--bg);border-radius:10px;padding:1px 8px">'+list.length+'</span>'
    +'<span style="flex:1"></span>'
    +'<span style="font-size:9px;color:var(--dim);font-family:IBM Plex Mono,monospace">'+t('click a project to add it')+'</span>'
    +'</div>';
  if(open){
    h+='<div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px 12px">';
    list.forEach(p=>{
      h+='<button onclick="gtPiToggleSelect('+p.id+')" title="'+escH(t('Add to the gate overview'))+'" '
        +'style="display:inline-flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-left:3px solid '+safeColor(p.color||'var(--dim)')+';color:var(--text);border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;max-width:200px">'
        +'<span style="color:var(--accent);font-weight:700">+</span>'
        +'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(p.name||t('Untitled project'))+'</span>'
        +'</button>';
    });
    h+='</div>';
  }
  h+='</div>';
  return h;
}

// ── PI plan (selected projects × PIs → milestones + objectives) ───────────────
function gtPiPlanGrid(m){
  const incs=gateConfig.increments||[];
  if(!gtProjOrder().length) return pfEmpty(t('No active projects to plan — archived (closed/finished) projects are hidden here.'));
  if(!incs.length)     return pfEmpty(t('Add at least one increment above to plan milestones & objectives over time.'));
  const selSet=gtPiSelectedSet();
  const selected=gtProjOrder().filter(p=>selSet.has(p.id));
  if(!selected.length) return pfEmpty(t('No projects selected — pick projects in the Gate overview to plan their PIs.'));
  let h='<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:11px;min-width:100%">';
  h+='<thead><tr>';
  h+='<th style="position:sticky;left:0;background:var(--surface);text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);z-index:1;min-width:150px">'+t('PROJECT')+'</th>';
  incs.forEach(iv=>{
    const range=[iv.start,iv.end].filter(Boolean).join(' → ');
    h+='<th style="padding:6px 10px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);text-align:center;min-width:220px;vertical-align:top">'
      +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--text);font-weight:700">'+escH(iv.name||'PI')+'</div>'
      +(range?'<div style="font-size:9px;color:var(--dim)">'+escH(range)+'</div>':'')+'</th>';
  });
  h+='</tr></thead><tbody>';
  selected.forEach(p=>{
    h+='<tr>';
    h+='<td style="position:sticky;left:0;background:var(--surface);padding:8px 10px;border-bottom:1px solid var(--border);border-left:3px solid '+safeColor(p.color||'var(--dim)')+';white-space:nowrap;z-index:1;vertical-align:top">'
      +'<div style="color:var(--text);font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis">'+escH(p.name||t('Untitled project'))+'</div></td>';
    incs.forEach(iv=>{
      h+='<td style="padding:6px 8px;border-bottom:1px solid var(--border);border-left:1px solid var(--border);vertical-align:top;min-width:220px">'+gtPiCell(p,iv)+'</td>';
    });
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  return h;
}
function gtPiItems(p,incId){
  const gp=p.gatePlan||makeGatePlan();
  const it=gp.piItems&&gp.piItems[incId];
  return { milestones:(it&&Array.isArray(it.milestones))?it.milestones:[],
           objectives:(it&&Array.isArray(it.objectives))?it.objectives:[] };
}
function gtPiCell(p,iv){
  const it=gtPiItems(p,iv.id);
  const ms=it.milestones, obs=it.objectives;
  const idj=JSON.stringify(iv.id);
  let h='<div style="display:flex;flex-direction:column;gap:8px">';
  // milestones
  h+='<div><div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;letter-spacing:.04em;margin-bottom:3px">'+t('MILESTONES')+'</div>';
  if(!ms.length) h+='<div style="font-size:10px;color:var(--dim);font-style:italic">'+t('none')+'</div>';
  ms.forEach(mi=>{
    const mj=JSON.stringify(mi.id);
    h+='<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">'
      +'<input type="checkbox" '+(mi.done?'checked':'')+' onchange="gtPiMsSet('+p.id+','+idj+','+mj+',\'done\',this.checked)" title="'+escH(t('Done'))+'" style="accent-color:var(--accent);width:13px;height:13px;flex-shrink:0">'
      +'<input value="'+escH(mi.text||'')+'" onchange="gtPiMsSet('+p.id+','+idj+','+mj+',\'text\',this.value)" placeholder="'+escH(t('milestone'))+'" style="'+gtInStyle('')+';flex:1;min-width:50px'+(mi.done?';text-decoration:line-through;opacity:.6':'')+'">'
      +'<input type="month" value="'+escH(mi.date||'')+'" onchange="gtPiMsSet('+p.id+','+idj+','+mj+',\'date\',this.value)" title="'+escH(t('Target month'))+'" style="'+gtInStyle('')+';width:66px">'
      +'<button onclick="gtPiMsDel('+p.id+','+idj+','+mj+')" title="'+escH(t('Delete milestone'))+'" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:11px">✕</button>'
      +'</div>';
  });
  h+='<div style="margin-top:2px">'+gtBtn(t('+ milestone'),'gtPiMsAdd('+p.id+','+idj+')')+'</div></div>';
  // objectives
  h+='<div><div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;letter-spacing:.04em;margin-bottom:3px">'+t('MAJOR OBJECTIVES')+'</div>';
  if(!obs.length) h+='<div style="font-size:10px;color:var(--dim);font-style:italic">'+t('none')+'</div>';
  obs.forEach(ob=>{
    const oj=JSON.stringify(ob.id);
    h+='<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">'
      +'<span style="color:var(--accent);font-size:11px">•</span>'
      +'<input value="'+escH(ob.text||'')+'" onchange="gtPiObSet('+p.id+','+idj+','+oj+',this.value)" placeholder="'+escH(t('objective'))+'" style="'+gtInStyle('')+';flex:1;min-width:50px">'
      +'<button onclick="gtPiObDel('+p.id+','+idj+','+oj+')" title="'+escH(t('Delete objective'))+'" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:11px">✕</button>'
      +'</div>';
  });
  h+='<div style="margin-top:2px">'+gtBtn(t('+ objective'),'gtPiObAdd('+p.id+','+idj+')')+'</div></div>';
  h+='</div>';
  return h;
}
// PI-plan setters — write project.gatePlan.piItems[incId]. Structural changes
// (add/delete/done-toggle) re-render; free-text edits (onchange) only save, to
// preserve focus/scroll while typing across cells.
function gtPiEnsureItems(projId,incId){
  const gp=gtProjGatePlan(projId); if(!gp) return null;
  if(!gp.piItems||typeof gp.piItems!=='object') gp.piItems={};
  if(!gp.piItems[incId]||typeof gp.piItems[incId]!=='object') gp.piItems[incId]=makeGatePiItems();
  const it=gp.piItems[incId];
  if(!Array.isArray(it.milestones)) it.milestones=[];
  if(!Array.isArray(it.objectives)) it.objectives=[];
  return it;
}
function gtPiMsAdd(projId,incId){
  const it=gtPiEnsureItems(projId,incId); if(!it) return;
  it.milestones.push(makeGateMilestone({id:gtUid('ms-')}));
  saveState(); renderGateTab();
}
function gtPiMsSet(projId,incId,msId,field,v){
  const it=gtPiEnsureItems(projId,incId); if(!it) return;
  const mi=it.milestones.find(x=>x.id===msId); if(!mi) return;
  if(field==='done') mi.done=!!v;
  else mi[field]=String(v==null?'':v);
  saveState();
  if(field==='done') renderGateTab();   // strike-through updates; text/date keep focus
}
function gtPiMsDel(projId,incId,msId){
  const it=gtPiEnsureItems(projId,incId); if(!it) return;
  it.milestones=it.milestones.filter(x=>x.id!==msId);
  saveState(); renderGateTab();
}
function gtPiObAdd(projId,incId){
  const it=gtPiEnsureItems(projId,incId); if(!it) return;
  it.objectives.push(makeGateObjective({id:gtUid('ob-')}));
  saveState(); renderGateTab();
}
function gtPiObSet(projId,incId,obId,v){
  const it=gtPiEnsureItems(projId,incId); if(!it) return;
  const ob=it.objectives.find(x=>x.id===obId); if(!ob) return;
  ob.text=String(v==null?'':v); saveState();   // no re-render (keep focus)
}
function gtPiObDel(projId,incId,obId){
  const it=gtPiEnsureItems(projId,incId); if(!it) return;
  it.objectives=it.objectives.filter(x=>x.id!==obId);
  saveState(); renderGateTab();
}

function gtIncrementsEditor(){
  const incs=gateConfig.increments||[];
  let h='<div style="display:flex;flex-direction:column;gap:8px">';
  if(!incs.length){
    h+='<div style="font-size:11px;color:var(--dim);font-style:italic">'+t('No increments yet.')+'</div>';
  }
  incs.forEach((iv,i)=>{
    h+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 9px">'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--dim);width:20px">'+(i+1)+'</span>'
      +'<input value="'+escH(iv.name||'')+'" onchange="gtSetIncrement('+i+',\'name\',this.value)" placeholder="'+escH(t('PI name'))+'" style="'+gtInStyle('130px')+';font-weight:700">'
      +'<span style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('from')+'</span>'
      +'<input type="month" value="'+escH(iv.start||'')+'" onchange="gtSetIncrement('+i+',\'start\',this.value)" style="'+gtInStyle('')+'">'
      +'<span style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace">'+t('to')+'</span>'
      +'<input type="month" value="'+escH(iv.end||'')+'" onchange="gtSetIncrement('+i+',\'end\',this.value)" style="'+gtInStyle('')+'">'
      +'<span style="flex:1"></span>'
      +'<button onclick="gtMoveIncrement('+i+',-1)" '+(i===0?'disabled':'')+' title="'+escH(t('Move earlier'))+'" style="background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;font-size:11px;width:22px;height:22px;opacity:'+(i===0?'.35':'1')+'">←</button>'
      +'<button onclick="gtMoveIncrement('+i+',1)" '+(i===incs.length-1?'disabled':'')+' title="'+escH(t('Move later'))+'" style="background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;font-size:11px;width:22px;height:22px;opacity:'+(i===incs.length-1?'.35':'1')+'">→</button>'
      +'<button onclick="gtDelIncrement('+i+')" title="'+escH(t('Delete increment'))+'" style="background:var(--bg);border:1px solid var(--border);color:var(--danger);border-radius:4px;cursor:pointer;font-size:11px;width:22px;height:22px">✕</button>'
      +'</div>';
  });
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +gtBtn(t('+ ADD INCREMENT'),'gtAddIncrement()',true)
    +gtBtn(t('+ 4 quarters (this year)'),'gtAddQuarters()')
    +'</div>';
  h+='</div>';
  return h;
}

// ── PI-board actions ─────────────────────────────────────────────────────────
function gtAddIncrement(){
  gateConfig.increments.push(makeIncrement({id:gtUid('inc-'),name:'PI '+(gateConfig.increments.length+1)}));
  saveState(); renderGateTab();
}
function gtAddQuarters(){
  const y=new Date().getFullYear();
  const qs=[['Q1','-01','-03'],['Q2','-04','-06'],['Q3','-07','-09'],['Q4','-10','-12']];
  qs.forEach(q=>gateConfig.increments.push(makeIncrement({id:gtUid('inc-'),name:q[0]+' '+y,start:y+q[1],end:y+q[2]})));
  saveState(); renderGateTab();
}
function gtDelIncrement(i){
  const iv=gateConfig.increments[i]; if(!iv) return;
  if(!confirm(t('Delete increment “{name}”? Roadmap commitments to it are cleared.',{name:iv.name||'—'}))) return;
  // drop any per-project roadmap commitments pointing at this increment
  projects.forEach(p=>{ if(p.gatePlan&&p.gatePlan.roadmap) delete p.gatePlan.roadmap[iv.id]; });
  gateConfig.increments.splice(i,1); saveState(); renderGateTab();
}
function gtMoveIncrement(i,dir){
  const arr=gateConfig.increments, j=i+dir;
  if(j<0||j>=arr.length) return;
  const tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
  saveState(); renderGateTab();
}
function gtSetIncrement(i,field,v){
  const iv=gateConfig.increments[i]; if(!iv) return;
  iv[field]=String(v==null?'':v); saveState();   // text/date edits — no re-render (keep focus)
}
function gtSetRoadmap(projId,incId,stageId){
  const gp=gtProjGatePlan(projId); if(!gp) return;
  if(!gp.roadmap||typeof gp.roadmap!=='object') gp.roadmap={};
  if(stageId) gp.roadmap[incId]=String(stageId); else delete gp.roadmap[incId];
  saveState();   // select change repaints its own cell border via the browser; no full re-render needed
  renderGateTab();  // re-render so the cell's stage-colour border updates
}
