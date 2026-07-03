export const G=id=>document.getElementById(id);
export const V=id=>G(id).value;
export const SV=(id,v)=>{G(id).value=v;};
export function escH(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

export function getMonthRange(){
  const s=G('res-start').value, e=G('res-end').value;
  if(!s||!e)return[];
  const months=[];
  let [sy,sm]=s.split('-').map(Number);
  const [ey,em]=e.split('-').map(Number);
  while(sy<ey||(sy===ey&&sm<=em)){
    months.push(`${sy}-${String(sm).padStart(2,'0')}`);
    sm++;if(sm>12){sm=1;sy++;}
    if(months.length>60)break; // safety cap
  }
  return months;
}

export function curMonth(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function _dashCur(){ return curMonth(); }

// Helper: convert alloc value to numeric FTE (0 for m/r, 1 for p, float for numeric)
export function _allocNum(v){
  if(v==='m'||v==='r') return 0;   // medical/resigned: not active
  if(v==='p')          return 1;   // PTO: still on payroll
  var n=+v; return isNaN(n)?0:n;   // numeric 0-1 float
}
// Helper: convert alloc value to cost contribution (0 for m/r, monthlyCost for p, prorated for numeric)
export function _allocCost(v, monthlyCost){
  if(v==='m'||v==='r') return 0;
  if(v==='p')          return monthlyCost||0; // PTO: full cost
  var n=+v; return isNaN(n)?0:n*(monthlyCost||0);
}

/* ── Effective project revenue (M€) ─────────────────────────────────
   User-entered `impactEur` wins. When the user hasn't entered one, fall back
   to a DERIVED default = impact (y) + enabler (ena), but only when both are
   present. This is a COMPUTED accessor — nothing is stored, so backup/restore
   and snapshots stay consistent by construction: `impactEur` remains null until
   the user types a value, and the default recomputes from the persisted y/ena
   (sanitise guarantees both are numeric). */
export function projRevenueIsDefault(p){
  return !!p && (p.impactEur==null || p.impactEur===''); // no user value → derived
}
export function projRevenueM(p){
  if(!p) return 0;
  if(!projRevenueIsDefault(p)){ var v=+p.impactEur; return isNaN(v)?0:v; }
  var y=+p.y, e=+p.ena;                                  // derived default
  if(p.y!=null && p.y!=='' && p.ena!=null && p.ena!=='' && !isNaN(y) && !isNaN(e)) return y+e;
  return 0;
}

/* ══════════════════════════════════════════════════════════════════
   MEMOISATION — cache expensive per-render computations.
   Keyed by `_dataEpoch`; any data mutation bumps the epoch via
   _invalidateMemo() (called from saveState/saveNow), clearing the cache.
   Renders that don't change data (tab switches, filter toggles, hovers)
   reuse cached results → no recompute. See globals for _dataEpoch.
   ══════════════════════════════════════════════════════════════════ */
export let _dataEpoch=0;
export let _memoStore={};
export function _invalidateMemo(){ _dataEpoch++; _memoStore={}; }
export function _memo(key, fn){
  var k=_dataEpoch+'|'+key;
  if(Object.prototype.hasOwnProperty.call(_memoStore,k)) return _memoStore[k];
  var v=fn();
  _memoStore[k]=v;
  return v;
}
// Stable cache key for a month range (the same FROM/TO produces the same key).
export function _monthsKey(months){ return (months&&months.length)?(months[0]+'_'+months[months.length-1]+'_'+months.length):'none'; }
// Indexed lookups built once per epoch (kills O(n²) .find()/.filter() in loops).
export function _engByIdMap(){ return _memo('_engById', function(){ var m=new Map(); engineers.forEach(function(e){m.set(e.id,e);}); return m; }); }
export function _projByIdMap(){ return _memo('_projById', function(){ var m=new Map(); projects.forEach(function(p){m.set(p.id,p);}); return m; }); }
export function _rowsByEngMap(){ return _memo('_rowsByEng', function(){ var m=new Map(); allocRows.forEach(function(r){ var a=m.get(r.engId); if(!a){a=[];m.set(r.engId,a);} a.push(r); }); return m; }); }

// Compute per-engineer utilisation map from ALL allocRows (not filtered). Memoised by month range.
export function _buildEngUtil(months){
  return _memo('engUtil:'+_monthsKey(months), function(){ return _computeEngUtil(months); });
}
function _computeEngUtil(months){
  var cur=_dashCur();
  var util={};
  var rowsByEng=_rowsByEngMap();
  engineers.filter(function(e){return !e.vacant&&(!e.planningOnly||e.includeInCost);}).forEach(function(eng){
    var rows=rowsByEng.get(eng.id)||[];
    var eg=engGroups.find(function(g){return g.id===eng.groupId;});
    var monthAllocs={};
    var monthStatus={};
    months.forEach(function(m){
      monthAllocs[m]=rows.reduce(function(s,r){
        var v=r.allocs&&r.allocs[m]!=null?r.allocs[m]:0;
        // Status letters: m/r = not active (no cost), p = on leave but counts as allocated
        if(v==='m'||v==='r')return s;
        if(v==='p')return s+1; // PTO counts as 100% (still employed)
        return s+(+v||0);
      },0);
      // Track status flags per month for cost exclusion
      monthStatus[m]=rows.map(function(r){return r.allocs?r.allocs[m]:null;}).find(function(v){return v==='m'||v==='p'||v==='r';})||null;
    });
    var totAlloc=Object.values(monthAllocs).reduce(function(s,v){return s+v;},0);
    var activeMonths=Object.values(monthAllocs).filter(function(v){return v>0;}).length;
    var avgAlloc=activeMonths>0?totAlloc/activeMonths:0;
    var utilizationRate=months.length>0?totAlloc/months.length:0;
    var overMonths=Object.entries(monthAllocs).filter(function(kv){return kv[1]>1.005;}).map(function(kv){return kv[0];});
    var curAlloc=monthAllocs[cur]||0;
    // Projects this engineer is assigned to
    var projIds=[...new Set(rows.map(function(r){return r.projectId;}).filter(Boolean))];
    util[eng.id]={
      eng:eng,name:eng.name,role:eng.role||'',loc:eng.location||'',
      grp:eg?eg.name:'',grpColor:eg?eg.color:'var(--muted)',grpId:eng.groupId,
      cost:eng.monthlyCost||0,totAlloc:totAlloc,avgAlloc:avgAlloc,
      utilizationRate:utilizationRate,months:months.length,activeMonths:activeMonths,
      monthAllocs:monthAllocs,monthStatus:monthStatus,overMonths:overMonths,curAlloc:curAlloc,projIds:projIds
    };
  });
  return util;
}

export function fmtMonth(ym){
  const [y,m]=ym.split('-');
  const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return mn[+m-1]+(m==='01'?` ${y}`:'');
}

export function getSkillCatCol(){var m={};skillCats.forEach(function(c){m[c.id]=c.color;});return m;}
export function getSkillCatLabel(withEmoji){var m={};skillCats.forEach(function(c){m[c.id]=(withEmoji?c.emoji+' ':'')+c.label;});return m;}
export function getSkillCatOpts(selId){return skillCats.map(function(c){return '<option value="'+c.id+'"'+(c.id===selId?' selected':'')+'>'+c.emoji+' '+escH(c.label)+'</option>';}).join('');}

export function engInitials(name){
  return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}
export function engGroupColor(eng){
  const g=engGroups.find(g=>g.id===eng.groupId);
  return g?g.color:'#6b6b78';
}

/* ── Nine-box history (per-year snapshots) ──────────────────────────
   _nineBoxPlacements is always the live view of _nineBoxHistory[_nbYear]
   (same object reference) so all existing readers keep working unchanged.
   nbEnsureHistory() is idempotent — call it from every load path. It also
   migrates a legacy flat snapshot (no history) into a default year.
─────────────────────────────────────────────────────────────────── */
export function nbYears(){ return Object.keys(_nineBoxHistory||{}).sort(); }   // ascending
export function nbEnsureHistory(){
  if(!_nineBoxHistory||typeof _nineBoxHistory!=='object') _nineBoxHistory={};
  if(!Object.keys(_nineBoxHistory).length){
    // Migrate: drop any existing flat placements into a default year.
    var seed=(_nineBoxPlacements&&typeof _nineBoxPlacements==='object'&&Object.keys(_nineBoxPlacements).length)?_nineBoxPlacements:{};
    var y=_nbYear||String(new Date().getFullYear());
    _nineBoxHistory[y]=seed; _nbYear=y;
  }
  if(!_nbYear||!_nineBoxHistory[_nbYear]){
    var ys=nbYears(); _nbYear=ys[ys.length-1]||String(new Date().getFullYear());
    if(!_nineBoxHistory[_nbYear]) _nineBoxHistory[_nbYear]={};
  }
  if(_nbCompareYear && !_nineBoxHistory[_nbCompareYear]) _nbCompareYear='';
  _nineBoxPlacements=_nineBoxHistory[_nbYear];   // re-point the live view
}
// Composite score (perf+pot, 2..6) used to judge movement direction (toward top-right = better).
export function nbScore(key){ if(!key)return null; var p=String(key).split('-').map(Number); return (p[0]||0)+(p[1]||0); }
// Movement of an engineer between a previous and current placement.
export function nbMove(curKey,prevKey){
  if(!prevKey&&curKey) return 'new';
  if(!curKey&&prevKey) return 'gone';
  if(!curKey&&!prevKey) return 'none';
  var c=nbScore(curKey), p=nbScore(prevKey);
  return c>p?'up':(c<p?'down':'same');
}
