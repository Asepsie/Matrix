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

// Compute per-engineer utilisation map from ALL allocRows (not filtered)
export function _buildEngUtil(months){
  var cur=_dashCur();
  var util={};
  engineers.filter(function(e){return !e.vacant&&(!e.planningOnly||e.includeInCost);}).forEach(function(eng){
    var rows=allocRows.filter(function(r){return r.engId===eng.id;});
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
