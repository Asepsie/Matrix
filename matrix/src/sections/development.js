/*
 * Functions defined in this file:
 *   renderDevelopment — renders the Team Development Intelligence tab
 */

// renders the Team Development Intelligence tab, scoring and displaying per-engineer signals and recommended actions
function renderDevelopment(){
  var body=G('res-body');if(!body)return;
  var months=getMonthRange();
  var cur=curMonth();

  // Build skill map for SPOF analysis
  var skillMap=buildSkillMap();
  var spofByEng={};  // {engId: [{skillName, cat, domain}]}
  Object.values(skillMap).forEach(function(sm){
    if(sm.holders.length===1&&sm.cat==='crit'){
      var engId=sm.holders[0].eng.id;
      if(!spofByEng[engId])spofByEng[engId]=[];
      spofByEng[engId].push({name:sm.name,domain:sm.domain});
    }
  });

  // Per-engineer allocation summary
  var engAlloc={};
  engineers.filter(function(e){return !e.vacant;}).forEach(function(eng){
    var rows=allocRows.filter(function(r){return r.engId===eng.id;});
    var monthAllocs={};
    months.forEach(function(m){monthAllocs[m]=rows.reduce(function(s,r){return s+(r.allocs&&r.allocs[m]?+r.allocs[m]:0);},0);});
    var overMonths=Object.entries(monthAllocs).filter(function(kv){return kv[1]>1.005;}).map(function(kv){return kv[0];});
    var curAlloc=monthAllocs[cur]||0;
    var totAlloc=Object.values(monthAllocs).reduce(function(s,v){return s+v;},0);
    var utilizationRate=months.length>0?totAlloc/months.length:0;
    var projIds=[...new Set(rows.map(function(r){return r.projectId;}).filter(Boolean))];
    engAlloc[eng.id]={overMonths:overMonths,curAlloc:curAlloc,utilizationRate:utilizationRate,projIds:projIds};
  });

  // Nine-Box cell info
  var nbCells=_nbCells();
  var nbByKey={};nbCells.forEach(function(c){nbByKey[c.key]=c;});

  // DISC quadrants info
  var discQ=_discQuadrants();
  var discByKey={};discQ.forEach(function(q){discByKey[q.key]=q;});

  // Priority scoring: higher = more urgent attention
  function priorityScore(eng){
    var score=0;
    var al=engAlloc[eng.id]||{};
    var nbKey=_nineBoxPlacements[eng.id];
    var discKey=_discPlacements[eng.id];
    if((spofByEng[eng.id]||[]).length>0)score+=30;
    if(al.overMonths&&al.overMonths.length>0)score+=25;
    if(nbKey==='1-1')score+=20; // Risk
    if(nbKey==='1-2')score+=15; // Under performer
    if(nbKey==='3-3')score+=10; // Consistent Star — retain risk
    if(nbKey==='1-3')score+=10; // Enigma — investment needed
    if(al.curAlloc===0&&months.length>0)score+=10; // on bench
    if(al.utilizationRate<0.3&&months.length>0)score+=8;
    var ktPlansForEng=Object.entries(_ktPlans||{}).filter(function(kv){return (kv[1]||[]).some(function(p){return p.learnerEngId===eng.id;});});
    if(ktPlansForEng.length===0&&(spofByEng[eng.id]||[]).length>0)score+=10;
    return score;
  }

  var activeEngs=engineers.filter(function(e){return !e.vacant;}).sort(function(a,b){return priorityScore(b)-priorityScore(a);});

  // Filter state
  var devFilter=G('dev-filter-input')?G('dev-filter-input').value:'';
  var devGrp=G('dev-grp-sel')?G('dev-grp-sel').value:'';

  var h='<div style="display:flex;flex-direction:column;height:100%;gap:0">';

  // Header
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">'
   +'<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">★ TEAM DEVELOPMENT INTELLIGENCE</h3>'
   +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'+activeEngs.length+' engineers · rule-based analysis</span>'
   +'<div style="flex:1"></div>'
   +'<input id="dev-filter-input" placeholder="Filter by name..." value="'+escH(devFilter)+'" oninput="renderDevelopment()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;width:160px">'
   +'<select id="dev-grp-sel" onchange="renderDevelopment()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px">'
   +'<option value="">All Groups</option>'
   +engGroups.map(function(g){return '<option value="'+g.id+'"'+(devGrp&&+devGrp===g.id?' selected':'')+'>'+escH(g.name)+'</option>';}).join('')
   +'</select>'
   +'</div>';

  // Legend
  h+='<div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">'
   +'<span style="font-size:9px;font-family:IBM Plex Mono,monospace;color:var(--danger)">● HIGH PRIORITY</span>'
   +'<span style="font-size:9px;font-family:IBM Plex Mono,monospace;color:#f1a435">● MEDIUM</span>'
   +'<span style="font-size:9px;font-family:IBM Plex Mono,monospace;color:var(--accent)">● WATCH</span>'
   +'<span style="font-size:9px;font-family:IBM Plex Mono,monospace;color:var(--muted)">● STABLE</span>'
   +'</div>';

  h+='<div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px">';

  // Re-read filter after DOM may have been updated
  var filterName=(G('dev-filter-input')?G('dev-filter-input').value:'').toLowerCase();
  var filterGrp=G('dev-grp-sel')?G('dev-grp-sel').value:'';

  var shown=activeEngs.filter(function(eng){
    if(filterName&&!eng.name.toLowerCase().includes(filterName))return false;
    if(filterGrp&&String(eng.groupId)!==filterGrp)return false;
    return true;
  });

  shown.forEach(function(eng){
    var score=priorityScore(eng);
    var al=engAlloc[eng.id]||{};
    var c=eng.idcard||{};
    var nbKey=_nineBoxPlacements[eng.id];
    var nbCell=nbKey?nbByKey[nbKey]:null;
    var discKey=_discPlacements[eng.id];
    var discQ2=discKey?discByKey[discKey]:null;
    var spofs=spofByEng[eng.id]||[];
    var photo=_photoCache&&_photoCache.get(eng.id);
    var ini=(eng.name||'?').split(' ').map(function(x){return x[0];}).join('').slice(0,2).toUpperCase();
    var eg=engGroups.find(function(g){return g.id===eng.groupId;});

    // KT plans involving this engineer
    var ktAsLearner=[],ktAsExpert=[];
    Object.entries(_ktPlans||{}).forEach(function(kv){
      var skillKey=kv[0],plans=kv[1]||[];
      plans.forEach(function(p){
        if(p.learnerEngId===eng.id)ktAsLearner.push({skill:skillKey,p:p});
        // Check if this engineer is the expert for this skill (SPOF match)
        if(spofs.some(function(s){return s.name.toLowerCase()===skillKey.toLowerCase();}))
          ktAsExpert.push({skill:skillKey,p:p});
      });
    });

    // Skill summary
    var skills=eng.skills||[];
    var critSkills=skills.filter(function(s){return s.cat==='crit';});
    var skillGaps=skills.filter(function(s){return s.gaps&&s.gaps.trim();});
    var skillDomainCoverage={};
    skills.forEach(function(s){if(s.domain)skillDomainCoverage[s.domain]=(skillDomainCoverage[s.domain]||0)+1;});

    // Priority level
    var priorityColor=score>=30?'var(--danger)':score>=15?'#f1a435':score>=5?'var(--accent)':'var(--muted)';
    var priorityLabel=score>=30?'HIGH PRIORITY':score>=15?'MEDIUM':score>=5?'WATCH':'STABLE';

    // Build recommendation bullets
    var actions=[];
    var observations=[];

    // Nine-Box signal
    if(nbCell){
      observations.push({icon:'⊞',text:'Nine-Box: <strong>'+nbCell.label+'</strong> ('+nbCell.sub+')',color:nbCell.badge});
      // Action from rec
      actions.push({text:nbCell.rec,color:nbCell.badge,icon:'→'});
    } else {
      observations.push({icon:'⊞',text:'Not yet placed in Nine-Box matrix',color:'var(--muted)'});
    }

    // DISC signal
    if(discQ2){
      observations.push({icon:'◉',text:'DISC profile: <strong>'+discQ2.key+' — '+discQ2.label+'</strong>',color:discQ2.badge});
      actions.push({text:'Manage by: '+discQ2.manages,color:discQ2.badge,icon:'◉'});
      actions.push({text:'Motivates: '+discQ2.motivates,color:discQ2.badge,icon:'★'});
    } else {
      observations.push({icon:'◉',text:'DISC profile not assigned',color:'var(--muted)'});
    }

    // SPOF signal
    if(spofs.length>0){
      observations.push({icon:'🛡',text:'<strong>Critical SPOF</strong> on '+spofs.length+' skill'+(spofs.length>1?'s':'')+': '+spofs.map(function(s){return s.name;}).join(', '),color:'#f1a435'});
      if(ktAsExpert.length===0){
        actions.push({text:'Initiate knowledge transfer plan for: '+spofs.map(function(s){return s.name;}).join(', ')+' — single point of failure risk',color:'#f1a435',icon:'⚠'});
      } else {
        actions.push({text:'KT plan in progress for '+ktAsExpert.length+' SPOF skill(s) — monitor completion',color:'#f1a435',icon:'✓'});
      }
    }

    // Overallocation
    if(al.overMonths&&al.overMonths.length>0){
      observations.push({icon:'📅',text:'<strong>Overallocated</strong> in '+al.overMonths.length+' month(s): '+al.overMonths.slice(0,3).map(function(m){return m.slice(0,7);}).join(', ')+(al.overMonths.length>3?'…':''),color:'var(--danger)'});
      actions.push({text:'Resolve over-allocation conflict — check project priorities and adjust plan',color:'var(--danger)',icon:'⚠'});
    }

    // Bench / under-utilised
    if(al.curAlloc===0&&months.length>0){
      observations.push({icon:'📅',text:'<strong>Unallocated this month</strong> — on bench',color:'var(--accent2)'});
      actions.push({text:'Assign to project or invest in training and skill development during bench time',color:'var(--accent2)',icon:'→'});
    } else if(al.utilizationRate<0.3&&months.length>0){
      observations.push({icon:'📅',text:'Low utilisation ('+Math.round(al.utilizationRate*100)+'% avg over plan period)',color:'var(--accent2)'});
      actions.push({text:'Review allocation — consider additional project assignments or development initiatives',color:'var(--accent2)',icon:'→'});
    }

    // KT as learner
    if(ktAsLearner.length>0){
      observations.push({icon:'📚',text:'Active KT plan as learner: '+ktAsLearner.length+' skill(s)',color:'var(--accent)'});
    }

    // Skill gaps
    if(skillGaps.length>0){
      observations.push({icon:'◈',text:skillGaps.length+' skill gap'+(skillGaps.length>1?'s':'')+' documented: '+skillGaps.map(function(s){return s.name;}).slice(0,3).join(', ')+(skillGaps.length>3?'…':''),color:'#a78bfa'});
      actions.push({text:'Address skill gaps: '+skillGaps.map(function(s){return s.name+' ('+s.gaps+')';}).slice(0,2).join(' · '),color:'#a78bfa',icon:'📚'});
    }

    // Review date
    if(c.reviewdate){
      var rv=new Date(c.reviewdate);
      var today=new Date();
      var diff=Math.round((rv-today)/(1000*60*60*24));
      if(diff<0){
        observations.push({icon:'📋',text:'Performance review <strong>overdue</strong> (was '+c.reviewdate+')',color:'var(--danger)'});
        actions.push({text:'Schedule overdue performance review immediately',color:'var(--danger)',icon:'📋'});
      } else if(diff<60){
        observations.push({icon:'📋',text:'Review due in '+diff+' days ('+c.reviewdate+')',color:'#f1a435'});
      }
    }

    // Aspirations
    if(c.aspirations&&c.aspirations.trim()){
      observations.push({icon:'★',text:'Aspiration: '+escH(c.aspirations.slice(0,80))+(c.aspirations.length>80?'…':''),color:'var(--accent)'});
    }

    var av=photo
      ?'<img src="'+photo+'" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid '+priorityColor+';flex-shrink:0">'
      :'<div style="width:36px;height:36px;border-radius:50%;background:var(--surface);border:2px solid '+priorityColor+';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:'+priorityColor+';flex-shrink:0;font-family:IBM Plex Mono,monospace">'+ini+'</div>';

    h+='<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid '+priorityColor+';border-radius:8px;padding:12px 14px">'
     // Header row
     +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
     +av
     +'<div style="flex:1;min-width:0">'
     +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:12px;font-weight:700;color:var(--text)">'+escH(eng.name)+'</span>'
     +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;padding:2px 6px;border-radius:12px;background:'+priorityColor+'22;color:'+priorityColor+'">'+priorityLabel+'</span>'
     +(eg?'<span style="font-size:9px;color:'+eg.color+';font-family:IBM Plex Mono,monospace">'+escH(eg.name)+'</span>':'')
     +(spofs.length?'<span style="font-size:8px;padding:1px 5px;border-radius:3px;background:rgba(241,164,53,.1);color:#f1a435;font-family:IBM Plex Mono,monospace">&#9888; SPOF</span>':'')
     +'</div>'
     +'<div style="font-size:9px;color:var(--muted);margin-top:2px">'+(eng.role?escH(eng.role):'')+(eng.role&&eng.location?' · ':'')+escH(eng.location||'')+(c.seniority?' · '+escH(c.seniority):'')+'</div>'
     +'</div>'
     +'<button onclick="openIdCardModal('+eng.id+')" style="font-size:9px;padding:3px 8px;font-family:IBM Plex Mono,monospace;background:none;border:1px solid var(--border);color:var(--muted);border-radius:4px;cursor:pointer">PROFILE</button>'
     +'</div>'
     // Two columns: signals + actions
     +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
     // Signals column
     +'<div>'
     +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-bottom:5px">SIGNALS</div>'
     +'<div style="display:flex;flex-direction:column;gap:3px">'
     +observations.map(function(o){
       return '<div style="display:flex;align-items:flex-start;gap:5px;font-size:9px">'
         +'<span style="flex-shrink:0;color:'+o.color+'">'+o.icon+'</span>'
         +'<span style="color:var(--muted);line-height:1.4">'+o.text+'</span>'
         +'</div>';
     }).join('')
     +'</div></div>'
     // Actions column
     +'<div>'
     +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em;margin-bottom:5px">RECOMMENDED ACTIONS</div>'
     +'<div style="display:flex;flex-direction:column;gap:4px">'
     +(actions.length?actions.map(function(a,i){
       return '<div style="display:flex;align-items:flex-start;gap:5px;font-size:9px;padding:4px 6px;background:'+a.color+'11;border-left:2px solid '+a.color+';border-radius:0 4px 4px 0">'
         +'<span style="flex-shrink:0;color:'+a.color+'">'+a.icon+'</span>'
         +'<span style="color:var(--text);line-height:1.4">'+a.text+'</span>'
         +'</div>';
     }).join(''):
     '<div style="font-size:9px;color:var(--muted);padding:4px 6px">No immediate actions required — continue monitoring</div>'
     )
     +'</div></div>'
     +'</div>'
     // Skill tags
     +(critSkills.length?
     '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">'
     +'<span style="font-size:8px;color:var(--muted);font-family:IBM Plex Mono,monospace;margin-right:4px">CRITICAL SKILLS:</span>'
     +critSkills.slice(0,8).map(function(s){
       var isSpof=spofs.some(function(sp){return sp.name===s.name;});
       return '<span style="font-size:8px;padding:1px 5px;border-radius:10px;background:'+(isSpof?'rgba(241,164,53,.15)':'rgba(241,67,53,.1)')+';color:'+(isSpof?'#f1a435':'#f14335')+';font-family:IBM Plex Mono,monospace;border:1px solid '+(isSpof?'#f1a43540':'#f1433540')+'">'
         +escH(s.name)+'<sup>L'+(s.level||3)+'</sup>'+(isSpof?' ⚠':'')+'</span>';
     }).join('')+(critSkills.length>8?'<span style="font-size:8px;color:var(--muted)">+'+( critSkills.length-8)+' more</span>':'')
     +'</div>':'')
     +'</div>';
  });

  if(!shown.length){
    h+='<div style="text-align:center;padding:40px;color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px">No engineers match the current filter.</div>';
  }

  h+='</div></div>';
  body.innerHTML=h;
}
