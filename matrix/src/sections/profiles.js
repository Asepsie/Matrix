/* ►► SECTION: PROFILES ◄◄ Profiles tab: cards, matrices badge, PDF/CSV export
 *
 * Every profile-related PDF/HTML/PNG/SVG export shares ONE picker — the same
 * exportOpenBuilder drag-and-drop content/theme/format picker exec.js's
 * Executive Summary uses (src/core/export.js). See the "PROFILE-EXPORT"
 * section below for the shared block registry (prfCardBlocks) and card
 * renderer (buildProfileCardHTMLs) all three deliverables build on.
 *
 * Functions defined in this file:
 *   renderProfilesTab            — renders the profiles tab: filter bar + engineer cards
 *   profileExportCSV             — exports a single engineer's profile + skills as CSV
 *   profilesExportCSV            — exports all profiles + skills as one CSV
 *   prfCardBlocks                — the six content toggles shared by every profile export
 *   prfBuiltinTemplates          — "Full detail"/"Compact" built-in template presets
 *   buildProfileCardHTMLs        — the ONE card renderer (single/dashboard/all-profiles share it)
 *   profileExportOpen            — opens the builder for a single profile (PDF/SVG)
 *   getProfileExportEngs         — returns the filtered engineer set for export
 *   exportProfilesDashboardOpen  — opens the builder for the card grid (PDF/HTML/PNG/SVG + columns)
 *   profilesExportAllOpen        — opens the builder for one full page per person (PDF)
 *   prfBriefBlocks               — the project-brief content toggles (team/risks/todos/milestones/actions)
 *   buildBriefProjectBlock       — builds one project's HTML block (KPIs, team, risks, todos…)
 *   exportProjectBriefOpen       — opens the shared builder for the project brief (project scope = per-project toggle controls; reached from the Export door)
 */
// renders the profiles tab: filter bar + engineer cards
function renderProfilesTab(){
  const body=G('res-body');if(!body)return;
  if(typeof _peopleLens!=='undefined') _peopleLens='profiles';
  const grpFilter=G('prf-grp')?G('prf-grp').value:'';
  const search=(G('prf-search')?G('prf-search').value:'').toLowerCase().trim();
  let engs=engineers.filter(function(e){return !e.vacant;});
  if(grpFilter)engs=engs.filter(function(e){return String(e.groupId)===grpFilter;});
  if(search)engs=engs.filter(function(e){return e.name.toLowerCase().includes(search);});

  const CAT_COL=getSkillCatCol();
  const CAT_LABEL=getSkillCatLabel(false);
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];

  let h='<div style="display:flex;flex-direction:column;height:100%">';
  if(typeof peopleLensBar==='function') h+=peopleLensBar();

  h+='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px;flex-shrink:0">';
  h+='<input id="prf-search" class="eng-card-inp" placeholder="'+t('🔍 Search name…')+'" value="'+escH(search)+'"'
    +' oninput="renderProfilesTab()" style="width:150px;font-size:11px">';
  h+='<select id="prf-grp" onchange="renderProfilesTab()"'
    +' style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'
    +'<option value="">'+t('All groups')+'</option>'
    +engGroups.map(function(g){return '<option value="'+g.id+'"'+(grpFilter===String(g.id)?' selected':'')+'>'+escH(g.name)+'</option>';}).join('')
    +'</select>';
  h+='<div style="width:1px;background:var(--border);height:18px"></div>';
  h+='<button class="sm primary" onclick="exportProfilesDashboardOpen()" title="'+t('Export the profile card grid — pick content, theme, columns and format')+'">📄 '+t('Export dashboard')+'</button>';
  h+='<button class="sm" onclick="profilesExportAllOpen()" title="'+t('Export one full profile page per person')+'">📄 '+t('Export full profiles')+'</button>';
  h+='<button class="sm" onclick="profilesExportCSV()" title="'+t('Export all profiles as CSV')+'">'+t('↓ CSV (all)')+'</button>';
  h+='<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap">'
    +'<input type="checkbox" id="prf-fullmode"'+(G('prf-fullmode')&&G('prf-fullmode').checked?' checked':'')
    +' onchange="renderProfilesTab()">'
    +t('Full detail view')+'</label>';
  var showIndChecked=!G('prf-show-ind')||G('prf-show-ind').checked;
  h+='<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap"'
    +' title="'+t('Show / hide SPOF, gaps, aspirations and notes on the cards')+'">'
    +'<input type="checkbox" id="prf-show-ind"'+(showIndChecked?' checked':'')
    +' onchange="renderProfilesTab()">'
    +t('SPOF / gaps / notes')+'</label>';
  h+='<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--muted);margin-left:auto">'+t('{n} profiles',{n:engs.length})+'</span>';
  h+='</div>';

  h+='<div style="overflow:auto;flex:1"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">';

  engs.forEach(function(e){
    const c=e.idcard||{};
    const col=safeColor(engGroupColor(e));
    const grp=engGroups.find(function(g){return g.id===e.groupId;});
    const photo=idbGetPhoto(e.id)||(c.photo||'');
    const mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
    const mgrName=mgr?mgr.name:(c.manager||'—');
    const skills=e.skills||[];
    const spofSkills=skills.filter(function(s){
      const sm=buildSkillMap();
      const k=s.name.toLowerCase().trim();
      return sm[k]&&sm[k].holders.length===1;
    });

    h+='<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;flex-direction:column">';

    h+='<div style="height:5px;background:'+col+'"></div>';
    h+='<div style="padding:12px 14px;display:flex;gap:12px;align-items:flex-start">';

    if(photo){
      h+='<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid '+col+'">'
        +'<img src="'+escH(photo)+'" style="width:100%;height:100%;object-fit:cover"></div>';
    } else {
      h+='<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:'+col+'33;border:2px solid '+col
        +';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:'+col
        +';font-family:\'IBM Plex Mono\',monospace">'+escH(engInitials(e.name))+'</div>';
    }

    h+='<div style="flex:1;min-width:0">';
    h+='<div style="font-size:13px;font-weight:700;color:var(--text)">'+escH(e.name)+'</div>';
    h+='<div style="font-size:11px;color:var(--muted)">'+escH(e.role||'—')+'</div>';
    if(grp)h+='<div style="font-size:10px;color:'+safeColor(grp.color)+';margin-top:2px">'+escH(grp.name)+'</div>';
    h+='</div>';

    h+='<div style="display:flex;gap:4px;flex-shrink:0">'
      +'<button class="sm primary" onclick="openIdCardModal('+e.id+')" title="'+t('Edit this profile')+'" style="font-size:9px;padding:2px 8px;font-weight:700">'+t('✏ EDIT')+'</button>'
      +'<button class="sm" onclick="profileExportOpen('+e.id+')" title="'+t('Export this profile — pick content, theme and format')+'" style="font-size:9px;padding:2px 6px">📄 '+t('Export')+'</button>'
      +'<button class="sm" onclick="profileExportCSV('+e.id+')" title="'+t('Export this profile as CSV')+'" style="font-size:9px;padding:2px 6px">↓ CSV</button>'
      +'</div>';

    h+='</div>';

    h+='<div style="padding:0 14px 10px;display:flex;flex-direction:column;gap:4px">';

    const showInd=!G('prf-show-ind')||G('prf-show-ind').checked;
    const _nm=c.nextMove||{};
    const nmStr=[_nm.position,_nm.timeline].filter(function(x){return x&&String(x).trim();}).join(' · ')||'—';
    const details=[
      [t('📍 Location'),e.location||c.location||'—'],
      [t('📊 Seniority'),c.seniority||'—'],
      [t('📋 Contract'),c.contract||'—'],
      [t('📅 Start date'),c.startdate||'—'],
      [t('🚀 Potential (GTP)'),c.potential||'—'],
      [t('🧭 Mobility'),c.mobility||'—'],
      [t('🎯 Next move'),nmStr],
      [t('👤 Reports to'),mgrName],
      [t('🌐 Languages'),c.languages||'—'],
    ];
    details.forEach(function(d){
      h+='<div style="display:flex;gap:6px;font-size:10px">'
        +'<span style="color:var(--muted);min-width:90px;flex-shrink:0">'+d[0]+'</span>'
        +'<span style="color:var(--text)">'+escH(d[1])+'</span></div>';
    });
    var inTalent=e.includeTalent!==false;
    h+='<div style="display:flex;gap:6px;font-size:10px;margin-top:2px">'
      +'<span style="color:var(--muted);min-width:90px;flex-shrink:0">&#9670; '+t('Matrices')+'</span>'
      +'<span style="padding:1px 6px;border-radius:10px;font-size:9px;font-family:IBM Plex Mono,monospace;'
      +(inTalent
        ?'background:rgba(200,241,53,.1);color:var(--accent);border:1px solid rgba(200,241,53,.3)">&#10003; '+t('Nine-Box &amp; DISC')
        :'background:rgba(120,120,140,.1);color:var(--muted);border:1px solid var(--border)">&#8212; '+t('Excluded (contractor/intern)'))
      +'</span>'
      +'<button onclick="openIdCardModal('+e.id+')" title="'+t('Change in profile')+'" style="background:none;border:none;color:var(--muted);font-size:9px;cursor:pointer;padding:0;line-height:1">&#9998;</button>'
      +'</div>';

    var fullMode=G('prf-fullmode')&&G('prf-fullmode').checked;
    if(fullMode){
      var hasCompa=c.comparatio!=null&&c.comparatio!=='';
      var hasGrade=c.grade!=null&&c.grade!=='';
      var compaCol=!hasCompa?'var(--muted)':(c.comparatio<90?'#f1a435':(c.comparatio>110?'var(--accent2)':'var(--accent)'));
      h+='<div style="display:flex;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">'
        +'<div style="flex:1;display:flex;flex-direction:column;gap:2px">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">'+t('Compa-ratio')+'</span>'
        +'<span style="font-size:13px;font-weight:700;color:'+compaCol+'">'+(hasCompa?escH(String(c.comparatio))+'%':'—')+'</span>'
        +'</div>'
        +'<div style="flex:1;display:flex;flex-direction:column;gap:2px">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">'+t('Grade')+'</span>'
        +'<span style="font-size:13px;font-weight:700;color:'+(hasGrade?'var(--text)':'var(--muted)')+'">'+(hasGrade?escH(String(c.grade)):'—')+'</span>'
        +'</div>'
        +'</div>';
    }
    if(skills.length){
      if(fullMode){
        var doms2=[...new Set(skills.map(function(s){return s.domain||'General';}))];
        h+='<div style="margin-top:8px">';
        doms2.forEach(function(dom){
          var ds=skills.filter(function(s){return (s.domain||'General')===dom;});
          h+='<div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;text-transform:uppercase;letter-spacing:.05em;margin:5px 0 3px">'+escH(dom)+'</div>';
          h+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:2px">';
          ds.forEach(function(s){
            const cc=CAT_COL[s.cat]||'#888';
            const hasGap=showInd&&s.gaps&&s.gaps.trim();
            h+='<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc
              +'" title="'+(hasGap?escH('⚠ '+t('Gap:')+' '+s.gaps):'')+'">'
              +escH(s.name)
              +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;opacity:.8;margin-left:3px">L'+(s.level||3)+'</span>'
              +(hasGap?'<span style="font-size:9px;margin-left:2px">⚠</span>':'')
              +'</span>';
          });
          h+='</div>';
        });
        h+='</div>';
      } else {
        h+='<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:3px">';
        skills.slice(0,16).forEach(function(s){
          const cc=CAT_COL[s.cat]||'#888';
          h+='<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc
            +'" title="L'+(s.level||3)+' '+(LEVEL_LABEL[s.level||3]||'')+'">'+escH(s.name)+'</span>';
        });
        if(skills.length>16)h+='<span style="font-size:9px;color:var(--muted)">+'+(skills.length-16)+' '+t('more')+'</span>';
        h+='</div>';
      }
    }

    if(spofSkills.length&&showInd){
      h+='<div style="margin-top:5px;font-size:10px;color:#f14335;font-weight:600">⚠ '+t('SPOF:')+' '+spofSkills.map(function(s){return escH(s.name);}).join(', ')+'</div>';
    }

    if(fullMode){
      var extraFields=[
        [t('💡 Aspirations'),c.aspirations,true],
        [t('💪 Strengths'),c.strengths,false],
        [t('📈 Development areas'),c.devarea,false],
        [t('📝 Notes'),c.notes,true]
      ];
      extraFields.forEach(function(f){
        if(f[2]&&!showInd)return;
        if(!f[1]||!f[1].trim())return;
        h+='<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--border)">'
          +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">'+f[0]+'</div>'
          +'<div style="font-size:10px;color:var(--text);line-height:1.55">'+escH(f[1])+'</div>'
          +'</div>';
      });
    }

    h+='</div></div>';
  });

  if(!engs.length){
    h+='<div style="padding:40px;text-align:center;color:var(--muted);font-family:\'IBM Plex Mono\',monospace">'+t('No profiles to show. Add engineers in the roster.')+'</div>';
  }
  h+='</div></div></div>';
  body.innerHTML=h;
}

// exports a single engineer's profile + skills as CSV
function profileExportCSV(engId){
  const e=engineers.find(function(x){return x.id===engId;});if(!e)return;
  const c=e.idcard||{};
  const mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  const CAT_LABEL=getSkillCatLabel(false);
  function csvCell(v){const s=String(v==null?'':v);return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;}
  const rows=[
    ['Field','Value'],
    ['Name',e.name],['Role',e.role||''],['Location',e.location||''],
    ['Group',(engGroups.find(function(g){return g.id===e.groupId;})||{}).name||''],
    ['Seniority',c.seniority||''],['Contract',c.contract||''],
    ['Potential (GTP)',c.potential||''],
    ['Mobility',c.mobility||''],
    ['Reports To',mgr?mgr.name:(c.manager||'')],
    ['Languages',c.languages||''],['Start Date',c.startdate||''],
    ['Review Date',c.reviewdate||''],['Gender',c.gender||''],
    ['Aspirations',c.aspirations||''],['Strengths',c.strengths||''],
    ['Development Areas',c.devarea||''],['Notes',c.notes||''],
    [],[' -- SKILLS --'],
    ['Skill','Category','Domain','Level','Level Label','Gaps','Risks','Notes','Comment'],
  ];
  (e.skills||[]).forEach(function(s){
    rows.push([s.name,CAT_LABEL[s.cat]||s.cat,s.domain||'General','L'+(s.level||3),LEVEL_LABEL[s.level||3]||'',s.gaps||'',s.risks||'',s.notes||'',s.comment||'']);
  });
  const csv='﻿'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=e.name.replace(/[^a-z0-9]/gi,'_')+'_profile.csv';
  a.click();
}

// exports all profiles + skills as one CSV
function profilesExportCSV(){
  const CAT_LABEL=getSkillCatLabel(false);
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  function csvCell(v){const s=String(v==null?'':v);return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s;}
  const rows=[['Name','Group','Role','Location','Seniority','Contract','Mobility','Reports To','Languages','Gender','Start','Review','Skill','Category','Domain','Level','Level Label','Gaps']];
  engineers.filter(function(e){return !e.vacant;}).forEach(function(e){
    const c=e.idcard||{};
    const grp=(engGroups.find(function(g){return g.id===e.groupId;})||{}).name||'';
    const mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
    const mgrName=mgr?mgr.name:(c.manager||'');
    const skills=e.skills||[];
    if(!skills.length){
      rows.push([e.name,grp,e.role||'',e.location||'',c.seniority||'',c.contract||'',c.mobility||'',mgrName,c.languages||'',c.gender||'',c.startdate||'',c.reviewdate||'','','','','','','']);
    } else {
      skills.forEach(function(s){
        rows.push([e.name,grp,e.role||'',e.location||'',c.seniority||'',c.contract||'',c.mobility||'',mgrName,c.languages||'',c.gender||'',c.startdate||'',c.reviewdate||'',s.name,CAT_LABEL[s.cat]||s.cat,s.domain||'General','L'+(s.level||3),LEVEL_LABEL[s.level||3]||'',s.gaps||'']);
      });
    }
  });
  const csv='﻿'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='all_profiles.csv';a.click();
}

/* ►► SECTION: PROFILE-EXPORT ◄◄ Every profile-related export shares ONE builder
 * (exportOpenBuilder, src/core/export.js) — same drag-and-drop content picker,
 * theme select and (where relevant) format/columns controls as exec.js's
 * Executive Summary. Three deliverables, three thin wrappers below:
 *   profileExportOpen        — single profile (formats: pdf, svg)
 *   exportProfilesDashboardOpen — the card grid (formats: pdf, html, png, svg; +columns)
 *   profilesExportAllOpen    — one full page per person (format: pdf)
 * All three share prfCardBlocks() (the six info-group toggles) and
 * buildProfileCardHTMLs() (the actual card renderer) — a block excluded from
 * the picker is excluded from EVERY card on the page, in the order picked.
 * Card markup uses var(--…) tokens throughout (no palette threading needed —
 * exportHTML() already writes the chosen brand palette onto :root, so the
 * exact same markup is correct for every theme).
 */

// the six content toggles every profile-export picker shares
function prfCardBlocks(){
  return [
    {id:'basic', label:t('Basic info')},
    {id:'compGrade', label:t('Compa-ratio & Grade')},
    {id:'skills', label:t('Skills')},
    {id:'spof', label:t('SPOF & risk flags')},
    {id:'notes', label:t('Aspirations / Strengths / Notes')},
    {id:'matrices', label:t('Matrices badge')},
  ];
}
function prfBuiltinTemplates(){
  return [
    {id:'full', name:t('Full detail'), blocks:['basic','compGrade','skills','spof','notes','matrices']},
    {id:'compact', name:t('Compact'), blocks:['basic','skills']},
  ];
}

// builds the profile-card HTML array — the ONE card renderer shared by single/
// dashboard/all-profiles export. includedBlocks controls which sections show,
// in the order given (prfCardBlocks() ids) — identity (photo/name/role/group
// stripe) is always shown, everything else is opt-in.
function buildProfileCardHTMLs(engs, includedBlocks){
  var inc=includedBlocks||[];
  var has=function(id){ return inc.indexOf(id)>=0; };
  var CAT_COL=getSkillCatCol();
  var sm=buildSkillMap();

  return engs.map(function(e){
    var c=e.idcard||{};
    var col=safeColor(engGroupColor(e));
    var grp=engGroups.find(function(g){return g.id===e.groupId;});
    var photo=idbGetPhoto(e.id)||(c.photo||'');
    var mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
    var mgrName=mgr?mgr.name:(c.manager||'—');
    var skills=e.skills||[];
    var spof=skills.filter(function(s){
      var k=s.name.toLowerCase().trim();
      return sm[k]&&sm[k].holders.length===1;
    });

    var avatarHTML=photo
      ?'<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid '+col+'"><img src="'+escH(photo)+'" style="width:100%;height:100%;object-fit:cover"></div>'
      :'<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:'+col+'33;border:2px solid '+col+';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:'+col+';font-family:IBM Plex Mono,monospace">'+escH(engInitials(e.name))+'</div>';

    var html='<div style="background:var(--surface);border:1px solid var(--border);'
      +'border-radius:8px;overflow:hidden;display:flex;flex-direction:column">'
      +'<div style="height:5px;background:'+col+'"></div>'
      +'<div style="padding:12px 14px;display:flex;gap:12px;align-items:flex-start">'
      +avatarHTML
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;color:var(--text)">'+escH(e.name)+'</div>'
      +'<div style="font-size:11px;color:var(--muted)">'+escH(e.role||'—')+'</div>'
      +(grp?'<div style="font-size:10px;color:'+safeColor(grp.color)+';margin-top:2px">'+escH(grp.name)+'</div>':'')
      +'</div></div>'
      +'<div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:4px">';

    inc.forEach(function(blockId){
      if(blockId==='basic'){
        var _nm=c.nextMove||{};
        var nmStr=[_nm.position,_nm.timeline].filter(function(x){return x&&String(x).trim();}).join(' · ')||'—';
        var details=[
          [t('📍 Location'),e.location||c.location||'—'],
          [t('📊 Seniority'),c.seniority||'—'],
          [t('📋 Contract'),c.contract||'—'],
          [t('📅 Start date'),c.startdate||'—'],
          [t('🚀 Potential (GTP)'),c.potential||'—'],
          [t('🧭 Mobility'),c.mobility||'—'],
          [t('🎯 Next move'),nmStr],
          [t('👤 Reports to'),mgrName],
          [t('🌐 Languages'),c.languages||'—'],
        ];
        html+=details.map(function(d){
          return '<div style="display:flex;gap:6px;font-size:10px">'
            +'<span style="color:var(--muted);min-width:90px;flex-shrink:0">'+d[0]+'</span>'
            +'<span style="color:var(--text)">'+escH(d[1])+'</span></div>';
        }).join('');
      } else if(blockId==='matrices'){
        var inTalent=e.includeTalent!==false;
        html+='<div style="display:flex;gap:6px;font-size:10px;margin-top:2px">'
          +'<span style="color:var(--muted);min-width:90px;flex-shrink:0">&#9670; '+t('Matrices')+'</span>'
          +'<span style="padding:1px 6px;border-radius:10px;font-size:9px;font-family:IBM Plex Mono,monospace;'
          +(inTalent
            ?'background:var(--accent);color:var(--bg);border:1px solid var(--accent)">&#10003; '+t('Nine-Box &amp; DISC')
            :'background:var(--muted);color:var(--bg);border:1px solid var(--border)">&#8212; '+t('Excluded (contractor/intern)'))
          +'</span></div>';
      } else if(blockId==='compGrade'){
        var hasCompa=c.comparatio!=null&&c.comparatio!=='';
        var hasGrade=c.grade!=null&&c.grade!=='';
        var compaCol=!hasCompa?'var(--muted)':(c.comparatio<90?'var(--warn)':(c.comparatio>110?'var(--accent2)':'var(--accent)'));
        html+='<div style="display:flex;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">'
          +'<div style="flex:1;display:flex;flex-direction:column;gap:2px">'
          +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">'+t('Compa-ratio')+'</span>'
          +'<span style="font-size:13px;font-weight:700;color:'+compaCol+'">'+(hasCompa?escH(String(c.comparatio))+'%':'—')+'</span>'
          +'</div>'
          +'<div style="flex:1;display:flex;flex-direction:column;gap:2px">'
          +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">'+t('Grade')+'</span>'
          +'<span style="font-size:13px;font-weight:700;color:'+(hasGrade?'var(--text)':'var(--muted)')+'">'+(hasGrade?escH(String(c.grade)):'—')+'</span>'
          +'</div>'
          +'</div>';
      } else if(blockId==='skills'&&skills.length){
        var domains=[];
        skills.forEach(function(s){var d=s.domain||'General';if(!domains.includes(d))domains.push(d);});
        html+='<div style="margin-top:8px">';
        domains.forEach(function(dom){
          var ds=skills.filter(function(s){return (s.domain||'General')===dom;});
          html+='<div style="font-size:9px;color:var(--muted);font-family:IBM Plex Mono,monospace;text-transform:uppercase;letter-spacing:.05em;margin:5px 0 3px">'+escH(dom)+'</div>';
          html+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:2px">';
          ds.forEach(function(s){
            var cc=CAT_COL[s.cat]||'#888';
            var hasGap=s.gaps&&s.gaps.trim();
            html+='<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc+'" title="'+(hasGap?escH('⚠ '+t('Gap:')+' '+s.gaps):'')+'">'
              +escH(s.name)
              +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;opacity:.8;margin-left:3px">L'+(s.level||3)+'</span>'
              +(hasGap?'<span style="font-size:9px;margin-left:2px">⚠</span>':'')
              +'</span>';
          });
          html+='</div>';
        });
        html+='</div>';
      } else if(blockId==='spof'&&spof.length){
        html+='<div style="margin-top:5px;font-size:10px;color:var(--danger);font-weight:600">⚠ '+t('SPOF:')+' '+spof.map(function(s){return escH(s.name);}).join(', ')+'</div>';
      } else if(blockId==='notes'){
        var extras=[
          [t('💡 Aspirations'),c.aspirations],
          [t('💪 Strengths'),c.strengths],
          [t('📈 Development areas'),c.devarea],
          [t('📝 Notes'),c.notes]
        ];
        extras.forEach(function(f){
          if(!f[1]||!f[1].trim())return;
          html+='<div style="margin-top:7px;padding-top:6px;border-top:1px solid var(--border)">'
            +'<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">'+f[0]+'</div>'
            +'<div style="font-size:10px;color:var(--text);line-height:1.55">'+escH(f[1])+'</div>'
            +'</div>';
        });
      }
    });

    html+='</div></div>';
    return html;
  });
}

// opens the shared builder for a single engineer's profile (formats: PDF, SVG)
function profileExportOpen(engId){
  var e=engineers.find(function(x){return x.id===engId;}); if(!e) return;
  exportOpenBuilder({
    deliverableId: 'profile-single',
    title: e.name,
    subtitleDefault: e.role||'',
    blocks: prfCardBlocks(),
    ctx: {eng:e},
    formats: [{id:'pdf',label:t('PDF (print)')},{id:'svg',label:t('SVG image')}],
    builtinTemplates: prfBuiltinTemplates(),
    rasterWidth: 488,
    composeRender: function(includedIds, ctx){
      var card=buildProfileCardHTMLs([ctx.eng],includedIds)[0]||'';
      return '<div style="max-width:440px;margin:0 auto">'+card+'</div>';
    },
  });
}

// returns the filtered engineer set for the dashboard/full-profiles export
function getProfileExportEngs(){
  var grpFilter=G('prf-grp')?G('prf-grp').value:'';
  var search=(G('prf-search')?G('prf-search').value:'').toLowerCase().trim();
  var engs=engineers.filter(function(e){return !e.vacant;});
  if(grpFilter)engs=engs.filter(function(e){return String(e.groupId)===grpFilter;});
  if(search)engs=engs.filter(function(e){return e.name.toLowerCase().includes(search);});
  return engs;
}

// opens the shared builder for the profile CARD GRID (formats: PDF/HTML/PNG/
// SVG; +columns — the "3 per row, no way to change it" complaint this fixes)
function exportProfilesDashboardOpen(){
  var engs=getProfileExportEngs();
  if(!engs.length){alert(t('No profiles to export.'));return;}
  var planTitle=G('res-title-input')?G('res-title-input').value:'Resource Plan';
  var grpLabel=G('prf-grp')&&G('prf-grp').value
    ?' · '+G('prf-grp').options[G('prf-grp').selectedIndex].text:'';
  exportOpenBuilder({
    deliverableId: 'profiles-dashboard',
    title: planTitle+' — Team Profiles',
    subtitleDefault: engs.length+' member'+(engs.length!==1?'s':'')+grpLabel,
    blocks: prfCardBlocks(),
    ctx: {engs:engs},
    formats: [
      {id:'pdf',label:t('PDF (print)')},{id:'html',label:t('Standalone HTML')},
      {id:'png',label:t('PNG image')},{id:'svg',label:t('SVG image')},
    ],
    columns: {default:3, options:[2,3,4,5]},
    orientation: 'landscape', pageSize: 'A3', rasterWidth: 1600,
    builtinTemplates: prfBuiltinTemplates(),
    composeRender: function(includedIds, ctx){
      var cards=buildProfileCardHTMLs(ctx.engs,includedIds);
      var cols=ctx.columns||3;
      // min-width:0 overrides the grid item's default min-width:auto — without it, a single
      // long unbroken token (a URL in someone's notes, say) forces THAT column wider than its
      // 1fr share, breaking the equal-column grid for everyone else (real bug, reported by user:
      // one card visibly wider than the rest). overflow-wrap:break-word (exportHTML's shell
      // CSS) handles the text itself wrapping inside the now-fixed-width column.
      return '<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:12px">'
        +cards.map(function(c){return '<div style="min-width:0;break-inside:avoid;page-break-inside:avoid">'+c+'</div>';}).join('')
        +'</div>';
    },
  });
}

// opens the shared builder for one full print-ready page per person (format: PDF)
function profilesExportAllOpen(){
  var engs=getProfileExportEngs();
  if(!engs.length){alert(t('No profiles to export.'));return;}
  var planTitle=G('res-title-input')?G('res-title-input').value:'Team';
  exportOpenBuilder({
    deliverableId: 'profiles-all',
    title: planTitle+' — Full Profiles',
    subtitleDefault: engs.length+' profile'+(engs.length!==1?'s':''),
    blocks: prfCardBlocks(),
    ctx: {engs:engs},
    builtinTemplates: prfBuiltinTemplates(),
    composeRender: function(includedIds, ctx){
      // one page per person — same card design as the single-profile export,
      // just returned as an array so the shell gives each its own .export-page
      return ctx.engs.map(function(e){
        return '<div style="max-width:440px;margin:0 auto">'+buildProfileCardHTMLs([e],includedIds)[0]+'</div>';
      });
    },
  });
}

/* ►► SECTION: BRIEF ◄◄ Project brief — a deliverable on the shared export engine
 * (exportProjectBriefOpen below), reached from the global Export door (packs.js
 * registry). The old standalone #brief-overlay rail view + its project checklist
 * were removed (Track B #7): project scope is now per-project toggles in the
 * builder's controls bar. prfBriefBlocks() = the content blocks; buildBriefProjectBlock
 * renders one project's page. */

// the five content toggles the project-brief picker offers (mirrors the old
// brief-include-team/risks/todos/milestones/actions checkboxes, now inside
// the shared builder instead of the brief panel itself)
function prfBriefBlocks(){
  return [
    {id:'team', label:t('Team allocation')},
    {id:'risks', label:t('Project risks')},
    {id:'todos', label:t('Open todos')},
    {id:'milestones', label:t('Milestones')},
    {id:'actions', label:t('Actions / Gantt')},
  ];
}

// builds one project's HTML block (KPIs always; team/risks/todos/milestones/
// actions gated by `inc`, the includedBlocks array from the builder). `shared`
// is the cross-project setup (allocation map, axis labels) computed once by
// the caller — see exportProjectBriefOpen's composeRender.
function buildBriefProjectBlock(p, inc, shared){
  var has=function(id){ return inc.indexOf(id)>=0; };
  var col=safeColor(p.color||'var(--accent)');
  var sec=sections.find(function(s){return s.id===p.sectionId;});
  var allocs=shared.projAllocMap[p.id]||[];
  var totalProjCost=allocs.reduce(function(s,a){return s+a.totalCost;},0)||p.planCost||0;
  var totalFTE=allocs.reduce(function(s,a){return s+a.totalFTE;},0);

  var html='<div class="proj-block" style="background:var(--surface);border:1px solid var(--border)'
    +';border-left:5px solid '+col+';border-radius:8px;margin-bottom:20px;overflow:hidden;break-inside:avoid;page-break-inside:avoid">';

  html+='<div style="padding:16px 18px 12px;border-bottom:1px solid var(--border)">';
  html+='<div style="display:flex;align-items:flex-start;gap:12px">';
  html+='<div style="width:14px;height:14px;border-radius:50%;background:'+col+';flex-shrink:0;margin-top:3px"></div>';
  html+='<div style="flex:1">';
  html+='<h2 style="font-size:18px;font-weight:700;color:var(--text);line-height:1.2;margin-bottom:4px">'+escH(p.name)+'</h2>';
  if(p.note)html+='<div style="font-size:11px;color:var(--muted);margin-bottom:6px">'+escH(p.note)+'</div>';
  html+='</div></div>';

  html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px">';

  var kpis=[
    {label:shared.axName,val:p.x!=null?p.x:'—',unit:''},
    {label:shared.yLabel+' (0-10)',val:getProjY(p).toFixed(1),unit:''},
    {label:'Visibility',val:(p.vis??5).toFixed(1),unit:'/ 10'},
    {label:'Enabler',val:(p.ena??5).toFixed(1),unit:'/ 10'},
  ];
  if(p.sector)         kpis.unshift({label:'Sector',val:p.sector,unit:''});
  var _rev=projRevenueM(p);
  if(_rev>0)           kpis.push({label:'Revenue Impact'+(projRevenueIsDefault(p)?' (est.)':''),val:_rev,unit:'MEur'});
  if(totalProjCost>0)  kpis.push({label:'Plan Cost',val:Math.round(totalProjCost/1000)+'k',unit:'€'});
  if(p.currentGate)    kpis.push({label:'Current Gate',val:p.currentGate,unit:''});
  if(p.gate)           kpis.push({label:'Next Gate',val:p.gate,unit:''});
  if(p.eta)            kpis.push({label:'ETA',val:p.eta,unit:''});
  if(sec)              kpis.push({label:'Section',val:sec.name,unit:''});

  kpis.forEach(function(k){
    html+='<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px">'
      +'<div style="font-family:monospace;font-size:9px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase;margin-bottom:3px">'+k.label+'</div>'
      +'<div style="font-size:15px;font-weight:700;color:'+col+'">'+escH(String(k.val))
      +(k.unit?'<span style="font-size:10px;color:var(--muted);margin-left:3px">'+k.unit+'</span>':'')
      +'</div>'
      +'</div>';
  });
  html+='</div></div>';

  if(has('team')&&allocs.length){
    html+='<div style="padding:14px 18px">';
    html+='<div style="font-family:monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Team Allocation</div>';
    html+='<div style="display:flex;flex-direction:column;gap:8px">';

    allocs.forEach(function(a){
      var e=a.eng;
      var c=e.idcard||{};
      var grp=engGroups.find(function(g){return g.id===e.groupId;});
      var gc=safeColor(grp?grp.color:'#6b6b78');
      var photo=idbGetPhoto(e.id)||(c.photo||'');
      var initials=engInitials(e.name);
      var avgFTE=a.activeMonths.length?a.totalFTE/a.activeMonths.length:0;
      var topSkills=(e.skills||[]).filter(function(s){return s.cat==='crit';}).slice(0,4);

      html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;'
        +'background:var(--bg);border:1px solid var(--border);border-radius:6px">';

      html+=photo
        ?'<div style="width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid '+gc+'"><img src="'+escH(photo)+'" style="width:100%;height:100%;object-fit:cover"></div>'
        :'<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;background:'+gc+'33;border:2px solid '+gc
          +';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:'+gc+';font-family:monospace">'+escH(initials)+'</div>';

      html+='<div style="flex:1;min-width:0">';
      html+='<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">';
      html+='<span style="font-size:12px;font-weight:700;color:var(--text)">'+escH(e.name)+'</span>';
      if(grp)html+='<span style="font-size:10px;color:'+gc+'">'+escH(grp.name)+'</span>';
      html+='</div>';
      html+='<div style="font-size:10px;color:var(--muted);margin-top:1px">'+escH(e.role||'—');
      if(c.seniority)html+=' · '+escH(c.seniority);
      if(e.location||c.location)html+=' · 📍'+escH(e.location||c.location);
      html+='</div>';

      if(topSkills.length){
        html+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">';
        topSkills.forEach(function(s){
          html+='<span style="font-size:9px;padding:1px 5px;border-radius:6px;background:var(--danger);color:var(--bg)">'+escH(s.name)+'</span>';
        });
        if((e.skills||[]).length>4)html+='<span style="font-size:9px;color:var(--muted)">'+(e.skills.length-4)+' '+t('more')+'</span>';
        html+='</div>';
      }
      html+='</div>';

      html+='<div style="text-align:right;flex-shrink:0">';
      html+='<div style="font-size:18px;font-weight:700;color:'+col+';font-family:monospace">'+Math.round(avgFTE*100)+'%</div>';
      html+='<div style="font-size:9px;color:var(--muted)">avg alloc</div>';
      if(a.totalCost>0)html+='<div style="font-size:10px;color:var(--muted);margin-top:2px">'+Math.round(a.totalCost/1000)+'k€</div>';
      html+='<div style="font-size:9px;color:var(--muted)">'+a.activeMonths.length+' mo</div>';
      html+='</div>';

      html+='</div>';
    });

    html+='</div>';
    html+='<div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)'
      +';font-size:10px;color:var(--muted)">';
    html+='<span><b style="color:var(--text)">'+allocs.length+'</b> engineers</span>';
    html+='<span><b style="color:var(--text)">'+totalFTE.toFixed(1)+'</b> FTE-months total</span>';
    if(totalProjCost>0)html+='<span><b style="color:var(--text)">'+Math.round(totalProjCost/1000)+'k€</b> total cost</span>';
    html+='</div></div>';
  } else if(has('team')){
    html+='<div style="padding:10px 18px 14px;font-size:11px;color:var(--muted)">No team allocation found for this project. Add allocation rows in the Resource Plan.</div>';
  }

  if(has('risks')&&p.risks&&p.risks.length){
    html+='<div style="padding:0 18px 14px">';
    html+='<div style="font-family:monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
      +'Risks ('+p.risks.length+')</div>';
    p.risks.forEach(function(r){
      var rpn=(r.sev||1)*(r.occ||1)*(r.det||1);
      var rcol=rpn>=300?'var(--danger)':rpn>=100?'var(--warn)':'var(--muted)';
      var status=r.status||'open';
      var statusCol={open:'var(--danger)',mitigated:'var(--warn)',accepted:'var(--muted)',closed:'var(--accent)'}[status]||'var(--muted)';
      html+='<div style="padding:8px 12px;border-left:3px solid '+rcol
        +';background:var(--bg);border-radius:0 5px 5px 0;margin-bottom:6px">'
        +'<div style="display:flex;align-items:flex-start;gap:8px">'
        +'<span style="font-size:11px;font-weight:600;color:var(--text);flex:1">'
        +escH(r.desc||'Unnamed risk')+'</span>'
        +'<span style="font-family:monospace;font-size:10px;font-weight:700;color:'+rcol
        +';border:1px solid '+rcol+';padding:1px 6px;border-radius:4px;white-space:nowrap">'
        +'RPN '+rpn+'</span>'
        +'</div>'
        +'<div style="display:flex;gap:10px;margin-top:4px;font-size:9px;color:var(--muted);font-family:monospace">'
        +'<span>Prob '+(r.prob||1)+'/5</span>'
        +'<span>Imp '+(r.imp||1)+'/5</span>'
        +'<span>Sev '+(r.sev||1)+'</span>'
        +'<span>Occ '+(r.occ||1)+'</span>'
        +'<span>Det '+(r.det||1)+'</span>'
        +(r.owner?'<span style="margin-left:auto">👤 '+escH(r.owner)+'</span>':'')
        +'<span style="color:'+statusCol+'">● '+escH(status)+'</span>'
        +'</div>'
        +(r.mit&&r.mit.trim()
          ?'<div style="margin-top:5px;font-size:10px;color:var(--muted)'
            +';border-top:1px solid var(--border);padding-top:4px">'
            +'<span style="color:var(--accent2)">→ Mitigation: </span>'+escH(r.mit)+'</div>'
          :'')
        +'</div>';
    });
    html+='</div>';
  }

  if(has('todos')&&p.todos&&p.todos.length){
    var openTodos=p.todos.filter(function(x){return !x.done;});
    var doneTodos=p.todos.filter(function(x){return x.done;});
    html+='<div style="padding:0 18px 14px">';
    html+='<div style="font-family:monospace;font-size:10px;color:var(--muted)'
      +';letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
      +'Actions · '
      +'<span style="color:var(--accent)">'+doneTodos.length+' done</span>'
      +' / '+p.todos.length+' total</div>';
    if(openTodos.length){
      openTodos.forEach(function(x){
        html+='<div style="display:flex;align-items:center;gap:8px;font-size:11px;'
          +'padding:5px 0;border-bottom:1px solid var(--border)">'
          +'<span style="color:var(--muted);flex-shrink:0">☐</span>'
          +'<span style="color:var(--text);flex:1">'+escH(x.text||'')+'</span>'
          +'</div>';
      });
    }
    if(doneTodos.length){
      html+='<div style="margin-top:6px">';
      doneTodos.forEach(function(x){
        html+='<div style="display:flex;align-items:center;gap:8px;font-size:11px;'
          +'padding:5px 0;border-bottom:1px solid var(--border);opacity:0.5">'
          +'<span style="color:var(--accent);flex-shrink:0">☑</span>'
          +'<span style="color:var(--muted);text-decoration:line-through;flex:1">'+escH(x.text||'')+'</span>'
          +'</div>';
      });
      html+='</div>';
    }
    html+='</div>';
  }

  if(has('milestones')&&p.milestones&&p.milestones.length){
    var sortedMs=p.milestones.slice().sort(function(a,b){
      if(!a.date&&!b.date)return 0;
      if(!a.date)return 1;
      if(!b.date)return -1;
      return a.date.localeCompare(b.date);
    });
    html+='<div style="padding:0 18px 14px">';
    html+='<div style="font-family:monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
      +'Milestones ('+sortedMs.length+')</div>';
    html+='<div style="display:flex;flex-direction:column;gap:4px">';
    sortedMs.forEach(function(m){
      var done=m.done;
      var dateStr2=m.date?new Date(m.date+'T00:00:00').toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'}):'No date';
      html+='<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;'
        +'background:var(--bg);border-radius:5px;border:1px solid var(--border);'
        +(done?'opacity:0.55;':'')+'">'
        +'<span style="font-size:14px;flex-shrink:0">'+(m.icon||'🎯')+'</span>'
        +'<div style="flex:1">'
        +'<div style="font-size:11px;font-weight:600;color:var(--text);'+(done?'text-decoration:line-through':'')+'">'+escH(m.name||'Milestone')+'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0">'
        +'<div style="font-family:monospace;font-size:10px;color:var(--accent2)">'+escH(dateStr2)+'</div>'
        +(done?'<div style="font-size:9px;color:var(--accent)">✓ Done</div>':'')
        +'</div>'
        +'</div>';
    });
    html+='</div></div>';
  }

  if(has('actions')&&p.actions&&p.actions.length){
    var STATUS_COL={Open:'var(--danger)',Done:'var(--accent)','In Progress':'var(--warn)',Closed:'var(--muted)'};
    html+='<div style="padding:0 18px 14px">';
    html+='<div style="font-family:monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
      +'Gantt Actions ('+p.actions.length+')</div>';
    html+='<table style="width:100%;border-collapse:collapse;font-size:10px">'
      +'<thead><tr style="background:var(--bg);border-bottom:1px solid var(--border)">'
      +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:var(--muted)">ACTION</th>'
      +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:var(--muted)">START</th>'
      +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:var(--muted)">END</th>'
      +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:var(--muted)">OWNER</th>'
      +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:var(--muted)">STATUS</th>'
      +'</tr></thead><tbody>';
    p.actions.forEach(function(a,i){
      var sc=STATUS_COL[a.status]||'var(--muted)';
      var rowBg=i%2===1?'background:var(--surface);':'';
      var fmt=function(d){return d?new Date(d+'T00:00:00').toLocaleDateString('en',{month:'short',day:'numeric',year:'2-digit'}):'—';};
      html+='<tr style="'+rowBg+'border-bottom:1px solid var(--border)">'
        +'<td style="padding:5px 8px;font-weight:600;color:'+safeColor(a.color||'var(--accent)')+'">'
        +(a.isMilestone?'🎯 ':'')
        +escH(a.desc||'—')
        +(a.priority&&a.priority!=='Medium'?'<span style="font-size:9px;color:var(--muted);margin-left:5px">'+escH(a.priority)+'</span>':'')
        +'</td>'
        +'<td style="padding:5px 8px;font-family:monospace;color:var(--muted)">'+fmt(a.start)+'</td>'
        +'<td style="padding:5px 8px;font-family:monospace;color:var(--muted)">'+fmt(a.end||a.due)+'</td>'
        +'<td style="padding:5px 8px;color:var(--muted)">'+escH(a.member||'—')+'</td>'
        +'<td style="padding:5px 8px">'
        +'<span style="font-family:monospace;font-size:9px;padding:1px 6px;border-radius:3px;color:'+sc+';border:1px solid '+sc+'">'+escH(a.status||'Open')+'</span>'
        +'</td>'
        +'</tr>';
    });
    html+='</tbody></table></div>';
  }

  html+='</div>';
  return html;
}

// opens the shared builder for the project brief (formats: PDF, HTML). Now a
// deliverable on the global Export door (packs.js) — no standalone rail view.
// WHICH PROJECTS (scope) lives as per-project TOGGLES in the builder's controls
// bar (default = the visible, non-archived projects); WHICH CONTENT is the blocks
// (team/risks/todos/milestones/actions). Two independent axes, same builder.
function exportProjectBriefOpen(){
  if(!projects.length){alert(t('Add projects first.'));return;}
  var planTitle=G('res-title-input')?G('res-title-input').value:'R&D Portfolio';

  exportOpenBuilder({
    deliverableId: 'project-brief',
    title: planTitle,
    subtitleDefault: 'Project Briefs',
    blocks: prfBriefBlocks(),
    ctx: {},
    formats: [{id:'pdf',label:t('PDF (print)')},{id:'html',label:t('Standalone HTML')}],
    controls: function(){
      return projects.map(function(p){
        var arch=(typeof projIsArchived==='function'&&projIsArchived(p));
        return { id:'bp_'+p.id, label:p.name, type:'toggle', value:(p.visible!==false&&!arch),
                 hint:arch?t('archived'):(p.sector||'') };
      });
    },
    builtinTemplates: [
      {id:'full', name:t('Full'), blocks:['team','risks','todos','milestones','actions']},
      {id:'kpis-only', name:t('KPIs only')+' ('+t('no content blocks')+')', blocks:[]},
    ],
    composeRender: function(includedIds, ctx){
      var sel=projects.filter(function(p){
        var v=ctx['bp_'+p.id];
        if(v===undefined) v=(p.visible!==false);   // match the control default before first toggle
        return !!v;
      });
      if(!sel.length) return '<div style="padding:24px;color:var(--muted);font-size:12px">'
        +escH(t('No projects selected — tick at least one project in the controls above.'))+'</div>';

      var axName='Effort';
      try{axName=axX().name||'Effort';}catch(e){}
      var yLabel={'impact':'Impact','visibility':'Visibility','enabler':'Enabler'}[yMode]||'Impact';

      var allMonthKeys=new Set();
      allocRows.forEach(function(row){
        if(row.allocs)Object.keys(row.allocs).forEach(function(m){
          if(row.allocs[m]>0)allMonthKeys.add(m);
        });
      });
      var domMonths=[];
      try{domMonths=getMonthRange();}catch(e){}
      if(domMonths.length)domMonths.forEach(function(m){allMonthKeys.add(m);});
      var sortedMonths=Array.from(allMonthKeys).sort();

      var projAllocMap={};
      allocRows.forEach(function(row){
        if(!row.projectId||!row.engId)return;
        var eng=engineers.find(function(e){return e.id===row.engId;});if(!eng)return;
        if(!projAllocMap[row.projectId])projAllocMap[row.projectId]=[];
        var rowMonths=row.allocs?Object.keys(row.allocs).filter(function(m){return row.allocs[m]>0;}).sort():[];
        var totalFTE=rowMonths.reduce(function(s,m){return s+row.allocs[m];},0);
        var totalCost=rowMonths.reduce(function(s,m){return s+_allocCost(row.allocs[m],eng.monthlyCost);},0);
        projAllocMap[row.projectId].push({
          eng:eng,row:row,
          totalFTE:totalFTE,totalCost:totalCost,
          activeMonths:rowMonths,months:sortedMonths
        });
      });

      var shared={axName:axName,yLabel:yLabel,projAllocMap:projAllocMap};
      // kept as one flowing page (not one-per-project) — projects were never
      // forced onto separate pages here, only .proj-block{break-inside:avoid}
      return sel.map(function(p){ return buildBriefProjectBlock(p,includedIds,shared); }).join('');
    },
  });
}
