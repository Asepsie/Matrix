/* ══════════════════════════════════════════════════════════════════
   GLOBALS — shared application state and constants
   ══════════════════════════════════════════════════════════════════ */

/* ── Snapshot constants ── */
export const SNAP_KEY='eim_snaps_v1', SNAP_MAX=100, SNAP_WARN=80;
export const SNAP_IDB='EIM_Snapshots', SNAP_IDB_STORE='snaps';

/* ── Canvas layout constants ── */
export const PAD={l:38,r:14,t:14,b:26};
export const Y_LABELS={impact:t('IMPACT'),visibility:t('VISIBILITY'),enabler:t('ENABLER VALUE')};

/* ── Project tactical intent (strategic posture) ──
   Defend = protect an existing position; Grow = scale a winner; Adapt = adjust to
   change; Diversify = expand into new ground. Empty = unassigned. */
export const PROJECT_INTENTS=['Defend','Grow','Adapt','Diversify'];
export const PROJECT_INTENT_COLORS={Defend:'#5be5c8',Grow:'#c8f135',Adapt:'#f1a435',Diversify:'#a78bfa',Unassigned:'#6b6b78'};

/* ── Org chart constants ── */
export const ORG_NW=206, ORG_NH=76, ORG_HGAP=30, ORG_VGAP=96;
export const ORG_GRID=40;

/* ── Performance ratings config ── */
export var _PERF_RATINGS = [
  {val:'E', label:'Exceptional',  color:'#c8f135'},
  {val:'E+',label:'Exceptional+', color:'#a8e820'},
  {val:'M', label:'Meets',        color:'#5be5c8'},
  {val:'M+',label:'Meets+',       color:'#3bd4b8'},
  {val:'D', label:'Developing',   color:'#f1a435'},
  {val:'U', label:'Unsatisfactory',color:'#f14335'},
];

/* ── Alloc status display config ── */
export var _ALLOC_STATUS={
  m:{label:'M',title:'Medical leave',color:'#a78bfa',bg:'rgba(167,139,250,.15)'},
  p:{label:'P',title:'Paid time off', color:'#5be5c8',bg:'rgba(91,229,200,.15)'},
  r:{label:'R',title:'Resigned / not yet hired',color:'#f14335',bg:'rgba(241,67,53,.15)'},
};

/* ── Core data arrays (populated by loadState / user actions) ── */
export let projects=[];
export let sections=[];
export let engGroups=[];
export let engineers=[];
export let allocRows=[];
export let snapshots=[];
export let annotations=[];

/* ── ID counters ── */
export let nextId=1, nextTodoId=1, nextRiskId=1, nextMsId=1, nextAnnotId=1, nextActionId=1;
export let nextSectionId=1;
export let nextEngId=1, nextEngGroupId=1, selectedEngGroupId=null;
export let nextAllocId=1;

/* ── Skill configuration ── */
export let skillDomains=['Software','Electronics','Mechanical','Thermal','Systems','Project Management','Leadership','Domain Expert'];
export let skillCats=[{id:'crit',label:'Critical',color:'#f14335',emoji:'🔴'},{id:'diff',label:'Differentiating',color:'#a78bfa',emoji:'🟣'},{id:'mand',label:'Mandatory',color:'#f1a435',emoji:'🟡'}];
export let _skillLibFilter='';
export let _editingSkillName=null;

/* ── Snapshot state ── */
export let _snapDB=null;

/* ── Dashboard state ── */
export let engDashGroupBy='group';
export var _dashProjDetailOpen=false;
export var _dashSectorOpen={};
export var _finExclude=new Set();
export var _availPanel={open:false, threshold:50, groupBy:'availability', selected:new Set()};
export let engDashFilterEng=new Set(),engDashFilterProj=new Set();

/* ── Plan tab state ── */
export let planViewMode='flat';
export let planFlatSort='none';

/* ── Talent placement lens (Nine-box + DISC merged into one view; Track B follow-up).
   Values: 'ninebox' or 'disc'. Remember-last — persisted in the rail prefs (railLoadPrefs/
   railSavePrefs), not in the dataset. Declared here so it exists before railLoadPrefs runs
   at boot (globals.js loads before railnav.js), which would otherwise be clobbered by a
   later per-file initialiser. ── */
export let _tpLens='ninebox';
export var _devFormulaOpen = false;
export var _devFormula = {
  w_spof:       30,
  w_overalloc:  25,
  w_ninebox_11: 20,
  w_ninebox_12: 15,
  w_ninebox_33: 10,
  w_ninebox_13: 10,
  w_bench:      10,
  w_underutil:   8,
  w_no_kt:      10,
  t_underutil:  0.3,
  t_proj_imp:   400,
  t_tenure_long: 24,
  t_tenure_new:   6,
  cr_star_increase:   100,
  cr_high_increase:    95,
  cr_low_freeze:      100,
  cr_mid_review:       85,
  cr_high_hold:       115,
  cr_new_hold:        110,
};
/* ── Project lifecycle — the one source of truth for a project's disposition ──
   A project's overall state, distinct from its gate stage (forward development
   position) and tacticalIntent (strategic posture). `consumes` = its allocations
   count against team capacity; `activePortfolio` = it belongs to the LIVE portfolio
   (terminal states are history only). Ordered roughly by lifecycle progression.
   Read via projLifecycle()/projLifecycleDef()/projConsumesCapacity() (helpers.js). */
export const PROJECT_LIFECYCLE=[
  { id:'proposed',        label:'Proposed',              phase:'pipeline',    consumes:false, activePortfolio:false, color:'var(--accent2)' },
  { id:'active',          label:'Funded / Active',       phase:'development', consumes:true,  activePortfolio:true,  color:'var(--accent)'  },
  { id:'on_hold',         label:'On Hold',               phase:'development', consumes:false, activePortfolio:true,  color:'var(--warn)'    },
  { id:'cancelled',       label:'Cancelled',             phase:'terminal',    consumes:false, activePortfolio:false, color:'var(--danger)'  },
  { id:'in_service',      label:'In Service',            phase:'service',     consumes:true,  activePortfolio:true,  color:'var(--accent)'  },
  { id:'maintenance',     label:'Maintenance',           phase:'service',     consumes:true,  activePortfolio:true,  color:'#5be5c8'        },
  { id:'maint_cancelled', label:'Maintenance Cancelled', phase:'service',     consumes:false, activePortfolio:true,  color:'var(--warn)'    },
  { id:'withdrawn',       label:'Withdrawn',             phase:'terminal',    consumes:false, activePortfolio:false, color:'var(--muted)'   },
  { id:'eol',             label:'End of Life',           phase:'terminal',    consumes:false, activePortfolio:false, color:'var(--muted)'   },
  { id:'completed',       label:'Completed',             phase:'terminal',    consumes:false, activePortfolio:false, color:'#5b9e6e'        },
];
export let _planRowOrder=[];
export let _planDragSrc=null;
export let planFilterEng=new Set(),planFilterProj=new Set(),planHideEmpty=false;
export let planShowArchived=false;   // include archived (terminal-lifecycle) project rows in the plan grid
export let showArchivedProj=false;   // analytics/governance views: include archived projects (toggle)
export let planCollapsed={};
export let planFreezeHeader=true;

/* ── Resource tab state ── */
export let resActiveTab='plan';

/* ── Nav rail state ── */
/* Single source of truth for the persistent left rail (railnav.js).
   `activeView` is an id string (e.g. 'roster','matrix','ninebox'). Declared
   ONCE here; the router railGo() reads/writes it. Default landing = 'roster'
   (team-first). Flip to 'matrix' here to restore the old front door. */
export let activeView='roster';

/* ── Development tab state ── */
export let devSort='priority';

/* ── Nine-box / DISC placements ── */
export let _nineBoxPlacements={};   // live view = _nineBoxHistory[_nbYear] (same object reference)
export let _discPlacements={};
/* ── Nine-box history (per-year talent snapshots) ── */
export let _nineBoxHistory={};      // { [yearLabel]: { [engId]: 'perf-pot' } }
export let _nbYear='';              // active year label (the snapshot shown/edited)
export let _nbCompareYear='';       // optional comparison year for movement/trajectory

/* ── Matrix canvas state ── */
export let selId=null,ctxProjId=null,tabProjId=null,activeTab='risk';
export let sepX=5,sepY=5,scaleX='lin',scaleY='lin';
export let yMode='impact';
/* Quadrant labels are USER DATA — editable via the Q-panel, persisted in state,
   and carried in backups. They are deliberately NOT run through t(): translating
   a default would freeze a language-dependent label into the user's saved data on
   first save. The user renames them in whatever language they want. */
export let quadrantsByMode={
  impact:[
    {key:'tl',label:'STRATEGIC',   color:'rgba(91,229,200,0.10)'},
    {key:'tr',label:'QUICK WINS',  color:'rgba(200,241,53,0.10)'},
    {key:'bl',label:'FILL-IN',     color:'rgba(120,120,140,0.07)'},
    {key:'br',label:'THANKLESS',   color:'rgba(241,67,53,0.08)'},
  ],
  visibility:[
    {key:'tl',label:'HIDDEN GEMS',  color:'rgba(91,229,200,0.10)'},
    {key:'tr',label:'SHOWCASES',    color:'rgba(200,241,53,0.10)'},
    {key:'bl',label:'LOW PROFILE',  color:'rgba(120,120,140,0.07)'},
    {key:'br',label:'NOISE',        color:'rgba(241,67,53,0.08)'},
  ],
  enabler:[
    {key:'tl',label:'FOUNDATIONS',  color:'rgba(91,229,200,0.10)'},
    {key:'tr',label:'ACCELERATORS', color:'rgba(200,241,53,0.10)'},
    {key:'bl',label:'STANDALONE',   color:'rgba(120,120,140,0.07)'},
    {key:'br',label:'DEAD WEIGHT',  color:'rgba(241,67,53,0.08)'},
  ],
};
export let drawTool='none',drawStart=null,drawPreview=null;
export let dragProj=null,dragSep=null;
export let zoom={scaleX:1,scaleY:1,panX:0,panY:0};
export let _panDrag=null;
export let animPos={};
export let animTimer=null;

/* ── Allocation table state ── */
export let _allocSel={};
export let _allocLastCell=null;
export let _allocCopied=null;
export let _allocCtxCell=null;

/* ── ID card modal state ── */
export let _idcardEngId=null;
export let _idcCops=[];      // working copy of CoP entries while the ID-card modal is open
export let _idcReviews=[];   // working copy of performance-review entries while the modal is open

/* ── Nine-box swap axes ── */
export let _nbSwapAxes=false;

/* ── Org chart state ── */
export let _orgScale=1, _orgPanX=0, _orgPanY=0;
export let _orgDragNode=null;
export let _orgPanDrag=null;
export let _orgCollapsed={};
export let _orgPositions={};
export let _orgLevelH={};
export let _orgLevelNames={};
export let _orgAnnotations=[];
export let _orgKpiOpen=false;
export let _orgDetailMode=false;
export let _orgSpofHighlight=new Set();
export let _srfSearch='';

/* ── KT (knowledge transfer) plans ── */
export let _ktPlans={};

/* ── Gate & PI (configurable stage-gate + increment planning) ──
   Portfolio-level governance config (active methodology + template library +
   increments). One global so it rides save/backup/snapshot; per-project state
   lives on project.gatePlan. See gate.js + ARCHITECTURE.md › Gate & PI. */
export let gateConfig=makeGateConfig();
export const GATE_TEMPLATE_MAX=5;   // max saved methodologies in the template library
