/* ►► SECTION: PROFILES ◄◄ Profiles tab: cards, matrices badge, PDF/CSV export
 *
 * Functions defined in this file:
 *   renderProfilesTab            — renders the profiles tab: filter bar + engineer cards
 *   profileExportCSV             — exports a single engineer's profile + skills as CSV
 *   profilesExportCSV            — exports all profiles + skills as one CSV
 *   profileExportPDF             — opens a print-ready single-profile page in a new window
 *   profilesExportAllPDF         — opens one print-ready page per filtered profile
 *   buildProfileCardHTMLs        — builds the profile-card HTML array (themed for screen/export)
 *   getProfileExportEngs         — returns the filtered engineer set + full-detail flag for export
 *   buildProfilesPageHTML        — builds the standalone profiles dashboard HTML page
 *   exportProfilesDashboardPDF   — opens the profiles dashboard in a print popup
 *   _doExportProfilesDashboardPDF — alias for exportProfilesDashboardPDF
 *   exportProfilesDashboardHTML  — downloads the profiles dashboard as an HTML file
 *   exportProfilesDashboardPNG   — renders the profiles dashboard to a PNG via SVG foreignObject
 *   exportProfilesDashboardSVG   — renders the profiles dashboard to a standalone SVG
 *   openProjectBriefExport       — opens the project-brief export modal with the project checklist
 *   briefSelectAll               — checks/unchecks all projects in the brief modal
 *   briefSelectVisible           — selects only the currently-visible projects in the brief modal
 *   getSelectedBriefProjects     — returns the projects checked in the brief modal
 *   buildBriefHTML               — builds the multi-project brief HTML (KPIs, team, risks, todos…)
 *   _getBriefOpts                — reads the brief section-include checkboxes into an options object
 *   exportProjectBrief           — opens the project brief in a print popup
 *   exportProjectBriefHTML       — downloads the project brief as an HTML file
 */
// renders the profiles tab: filter bar + engineer cards
function renderProfilesTab(){
  const body=G('res-body');if(!body)return;
  const grpFilter=G('prf-grp')?G('prf-grp').value:'';
  const search=(G('prf-search')?G('prf-search').value:'').toLowerCase().trim();
  let engs=engineers.filter(function(e){return !e.vacant;});
  if(grpFilter)engs=engs.filter(function(e){return String(e.groupId)===grpFilter;});
  if(search)engs=engs.filter(function(e){return e.name.toLowerCase().includes(search);});

  const CAT_COL=getSkillCatCol();
  const CAT_LABEL=getSkillCatLabel(false);
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];

  let h='<div style="display:flex;flex-direction:column;height:100%">';

  h+='<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px;flex-shrink:0">';
  h+='<input id="prf-search" class="eng-card-inp" placeholder="🔍 Search name…" value="'+escH(search)+'"'
    +' oninput="renderProfilesTab()" style="width:150px;font-size:11px">';
  h+='<select id="prf-grp" onchange="renderProfilesTab()"'
    +' style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 8px;border-radius:4px;outline:none">'
    +'<option value="">All groups</option>'
    +engGroups.map(function(g){return '<option value="'+g.id+'"'+(grpFilter===String(g.id)?' selected':'')+'>'+escH(g.name)+'</option>';}).join('')
    +'</select>';
  h+='<div style="width:1px;background:var(--border);height:18px"></div>';
  h+='<button class="sm primary" onclick="exportProfilesDashboardPDF()" title="Export profile cards as PDF">↓ PDF</button>';
  h+='<button class="sm" onclick="exportProfilesDashboardHTML()" title="Download as interactive HTML" style="border-color:var(--accent);color:var(--accent)">↓ HTML</button>';
  h+='<button class="sm" onclick="exportProfilesDashboardPNG()" title="Download as PNG image">↓ PNG</button>';
  h+='<button class="sm" onclick="exportProfilesDashboardSVG()" title="Download as SVG">↓ SVG</button>';
  h+='<button class="sm" onclick="profilesExportAllPDF()" title="Export one full profile page per person">↓ PDF (full profiles)</button>';
  h+='<button class="sm" onclick="profilesExportCSV()" title="Export all profiles as CSV">↓ CSV (all)</button>';
  h+='<label style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;white-space:nowrap">'
    +'<input type="checkbox" id="prf-fullmode"'+(G('prf-fullmode')&&G('prf-fullmode').checked?' checked':'')
    +' onchange="renderProfilesTab()">'
    +'Full detail view</label>';
  h+='<span style="font-family:\'IBM Plex Mono\',monospace;font-size:10px;color:var(--muted);margin-left:auto">'+engs.length+' profiles</span>';
  h+='</div>';

  h+='<div style="overflow:auto;flex:1"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">';

  engs.forEach(function(e){
    const c=e.idcard||{};
    const col=engGroupColor(e);
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
        +'<img src="'+photo+'" style="width:100%;height:100%;object-fit:cover"></div>';
    } else {
      h+='<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:'+col+'33;border:2px solid '+col
        +';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:'+col
        +';font-family:\'IBM Plex Mono\',monospace">'+escH(engInitials(e.name))+'</div>';
    }

    h+='<div style="flex:1;min-width:0">';
    h+='<div style="font-size:13px;font-weight:700;color:var(--text)">'+escH(e.name)+'</div>';
    h+='<div style="font-size:11px;color:var(--muted)">'+escH(e.role||'—')+'</div>';
    if(grp)h+='<div style="font-size:10px;color:'+grp.color+';margin-top:2px">'+escH(grp.name)+'</div>';
    h+='</div>';

    h+='<div style="display:flex;gap:4px;flex-shrink:0">'
      +'<button class="sm primary" onclick="openIdCardModal('+e.id+')" title="Edit this profile" style="font-size:9px;padding:2px 8px;font-weight:700">✏ EDIT</button>'
      +'<button class="sm" onclick="profileExportPDF('+e.id+')" title="Export this profile as PDF" style="font-size:9px;padding:2px 6px">↓ PDF</button>'
      +'<button class="sm" onclick="profileExportCSV('+e.id+')" title="Export this profile as CSV" style="font-size:9px;padding:2px 6px">↓ CSV</button>'
      +'</div>';

    h+='</div>';

    h+='<div style="padding:0 14px 10px;display:flex;flex-direction:column;gap:4px">';

    const details=[
      ['📍 Location',e.location||c.location||'—'],
      ['📊 Seniority',c.seniority||'—'],
      ['📋 Contract',c.contract||'—'],
      ['👤 Reports to',mgrName],
      ['🌐 Languages',c.languages||'—'],
    ];
    details.forEach(function(d){
      h+='<div style="display:flex;gap:6px;font-size:10px">'
        +'<span style="color:var(--muted);min-width:90px;flex-shrink:0">'+d[0]+'</span>'
        +'<span style="color:var(--text)">'+escH(d[1])+'</span></div>';
    });
    var inTalent=e.includeTalent!==false;
    h+='<div style="display:flex;gap:6px;font-size:10px;margin-top:2px">'
      +'<span style="color:var(--muted);min-width:90px;flex-shrink:0">&#9670; Matrices</span>'
      +'<span style="padding:1px 6px;border-radius:10px;font-size:9px;font-family:IBM Plex Mono,monospace;'
      +(inTalent
        ?'background:rgba(200,241,53,.1);color:var(--accent);border:1px solid rgba(200,241,53,.3)">&#10003; Nine-Box &amp; DISC'
        :'background:rgba(120,120,140,.1);color:var(--muted);border:1px solid var(--border)">&#8212; Excluded (contractor/intern)')
      +'</span>'
      +'<button onclick="openIdCardModal('+e.id+')" title="Change in profile" style="background:none;border:none;color:var(--muted);font-size:9px;cursor:pointer;padding:0;line-height:1">&#9998;</button>'
      +'</div>';

    var fullMode=G('prf-fullmode')&&G('prf-fullmode').checked;
    if(fullMode){
      var hasCompa=c.comparatio!=null&&c.comparatio!=='';
      var hasGrade=c.grade!=null&&c.grade!=='';
      var compaCol=!hasCompa?'var(--muted)':(c.comparatio<90?'#f1a435':(c.comparatio>110?'var(--accent2)':'var(--accent)'));
      h+='<div style="display:flex;gap:8px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">'
        +'<div style="flex:1;display:flex;flex-direction:column;gap:2px">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Compa-ratio</span>'
        +'<span style="font-size:13px;font-weight:700;color:'+compaCol+'">'+(hasCompa?escH(String(c.comparatio))+'%':'—')+'</span>'
        +'</div>'
        +'<div style="flex:1;display:flex;flex-direction:column;gap:2px">'
        +'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Grade</span>'
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
            const hasGap=s.gaps&&s.gaps.trim();
            h+='<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc
              +'" title="'+(hasGap?'⚠ Gap: '+s.gaps:'')+'">'
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
        if(skills.length>16)h+='<span style="font-size:9px;color:var(--muted)">+'+(skills.length-16)+' more</span>';
        h+='</div>';
      }
    }

    if(spofSkills.length){
      h+='<div style="margin-top:5px;font-size:10px;color:#f14335;font-weight:600">⚠ SPOF: '+spofSkills.map(function(s){return s.name;}).join(', ')+'</div>';
    }

    if(fullMode){
      var extraFields=[
        ['💡 Aspirations',c.aspirations],
        ['💪 Strengths',c.strengths],
        ['📈 Development areas',c.devarea],
        ['📝 Notes',c.notes]
      ];
      extraFields.forEach(function(f){
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
    h+='<div style="padding:40px;text-align:center;color:var(--muted);font-family:\'IBM Plex Mono\',monospace">No profiles to show. Add engineers in the roster.</div>';
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
  const rows=[['Name','Group','Role','Location','Seniority','Contract','Reports To','Languages','Gender','Start','Review','Skill','Category','Domain','Level','Level Label','Gaps']];
  engineers.filter(function(e){return !e.vacant;}).forEach(function(e){
    const c=e.idcard||{};
    const grp=(engGroups.find(function(g){return g.id===e.groupId;})||{}).name||'';
    const mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
    const mgrName=mgr?mgr.name:(c.manager||'');
    const skills=e.skills||[];
    if(!skills.length){
      rows.push([e.name,grp,e.role||'',e.location||'',c.seniority||'',c.contract||'',mgrName,c.languages||'',c.gender||'',c.startdate||'',c.reviewdate||'','','','','','','']);
    } else {
      skills.forEach(function(s){
        rows.push([e.name,grp,e.role||'',e.location||'',c.seniority||'',c.contract||'',mgrName,c.languages||'',c.gender||'',c.startdate||'',c.reviewdate||'',s.name,CAT_LABEL[s.cat]||s.cat,s.domain||'General','L'+(s.level||3),LEVEL_LABEL[s.level||3]||'',s.gaps||'']);
      });
    }
  });
  const csv='﻿'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='all_profiles.csv';a.click();
}

// opens a print-ready single-profile page in a new window
function profileExportPDF(engId){
  const e=engineers.find(function(x){return x.id===engId;});if(!e)return;
  const c=e.idcard||{};
  const col=engGroupColor(e);
  const grp=engGroups.find(function(g){return g.id===e.groupId;});
  const mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
  const mgrName=mgr?mgr.name:(c.manager||'—');
  const photo=idbGetPhoto(e.id)||(c.photo||'');
  const CAT_COL=getSkillCatCol();
  const CAT_LABEL=getSkillCatLabel(false);
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  const skills=e.skills||[];

  const domains=[...new Set(skills.map(function(s){return s.domain||'General';}))];
  let skillsHTML=domains.map(function(dom){
    const ds=skills.filter(function(s){return (s.domain||'General')===dom;});
    return '<div style="margin-bottom:10px">'
      +'<div style="font-size:9px;font-weight:bold;color:#888;text-transform:uppercase;margin-bottom:4px;letter-spacing:.06em">'+dom+'</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
      +ds.map(function(s){
        const cc=CAT_COL[s.cat]||'#888';
        return '<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc+'">'
          +s.name+' <sup>L'+(s.level||3)+'</sup>'
          +(s.gaps?'<br><span style="font-size:8px;color:#c0392b">⚠ '+s.gaps+'</span>':'')
          +'</span>';
      }).join('')
      +'</div></div>';
  }).join('');

  const avatarHTML=photo
    ?'<img src="'+photo+'" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid '+col+'">'
    :'<div style="width:60px;height:60px;border-radius:50%;background:'+col+'33;border:3px solid '+col
      +';display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;color:'+col+'">'+engInitials(e.name)+'</div>';

  const win=window.open('','_blank');
  if(!win){alert('Pop-up blocked — please allow pop-ups.');return;}
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<title>Profile — '+e.name+'</title>'
    +'<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:24px;}'
    +'h1{font-size:18px;font-weight:700;}h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:14px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px;}'
    +'.row{display:flex;gap:6px;margin-bottom:4px;font-size:11px;}.label{color:#888;min-width:110px;flex-shrink:0;}'
    +'@media print{@page{size:A4;margin:12mm;}body{padding:0;}}'
    +'</style></head><body>'
    +'<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;padding-bottom:14px;border-bottom:3px solid '+col+'">'
    +avatarHTML
    +'<div><h1>'+e.name+'</h1>'
    +'<div style="font-size:13px;color:#444;margin-top:3px">'+(e.role||'')+'</div>'
    +(grp?'<div style="font-size:11px;color:'+grp.color+';margin-top:2px">'+grp.name+'</div>':'')
    +'</div></div>'
    +'<h2>Profile</h2>'
    +'<div class="row"><span class="label">Location</span><span>'+(e.location||'—')+'</span></div>'
    +'<div class="row"><span class="label">Seniority</span><span>'+(c.seniority||'—')+'</span></div>'
    +'<div class="row"><span class="label">Contract</span><span>'+(c.contract||'—')+'</span></div>'
    +'<div class="row"><span class="label">Reports to</span><span>'+mgrName+'</span></div>'
    +'<div class="row"><span class="label">Languages</span><span>'+(c.languages||'—')+'</span></div>'
    +'<div class="row"><span class="label">Start date</span><span>'+(c.startdate||'—')+'</span></div>'
    +'<div class="row"><span class="label">Review date</span><span>'+(c.reviewdate||'—')+'</span></div>'
    +(c.aspirations?'<h2>Aspirations</h2><p style="font-size:11px;line-height:1.6">'+c.aspirations+'</p>':'')
    +(c.strengths?'<h2>Strengths</h2><p style="font-size:11px;line-height:1.6">'+c.strengths+'</p>':'')
    +(c.devarea?'<h2>Development Areas</h2><p style="font-size:11px;line-height:1.6">'+c.devarea+'</p>':'')
    +(skills.length?'<h2>Skills ('+skills.length+')</h2>'+skillsHTML:'')
    +(c.notes?'<h2>Notes</h2><p style="font-size:11px;line-height:1.6">'+c.notes+'</p>':'')
    +'<div style="margin-top:20px;font-size:9px;color:#bbb;text-align:right">Generated by Project Matrix · '+new Date().toLocaleDateString()+'</div>'
    +'<scr'+'ipt>window.addEventListener("load",function(){setTimeout(window.print,400);});<\/script>'
    +'</body></html>');
  win.document.close();
}

// opens one print-ready page per filtered profile
function profilesExportAllPDF(){
  const grpFilter=G('prf-grp')?G('prf-grp').value:'';
  const search=(G('prf-search')?G('prf-search').value:'').toLowerCase().trim();
  const fullMode=G('prf-fullmode')&&G('prf-fullmode').checked;
  let engs=engineers.filter(function(e){return !e.vacant;});
  if(grpFilter)engs=engs.filter(function(e){return String(e.groupId)===grpFilter;});
  if(search)engs=engs.filter(function(e){return e.name.toLowerCase().includes(search);});
  if(!engs.length){alert('No profiles to export.');return;}

  const CAT_COL=getSkillCatCol();
  const LEVEL_LABEL=['','Awareness','Basic','Proficient','Advanced','Expert'];

  function buildProfileHTML(e){
    const c=e.idcard||{};
    const col=engGroupColor(e);
    const grp=engGroups.find(function(g){return g.id===e.groupId;});
    const mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
    const mgrName=mgr?mgr.name:(c.manager||'—');
    const photo=idbGetPhoto(e.id)||(c.photo||'');
    const skills=e.skills||[];
    const domains=[...new Set(skills.map(function(s){return s.domain||'General';}))];
    const avatarHTML=photo
      ?'<img src="'+photo+'" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid '+col+'">'
      :'<div style="width:60px;height:60px;border-radius:50%;background:'+col+'33;border:3px solid '+col
        +';display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;color:'+col+'">'+engInitials(e.name)+'</div>';
    const skillsHTML=domains.map(function(dom){
      const ds=skills.filter(function(s){return (s.domain||'General')===dom;});
      return '<div style="margin-bottom:8px">'
        +'<div style="font-size:9px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">'+dom+'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
        +ds.map(function(s){
          const cc=CAT_COL[s.cat]||'#888';
          return '<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc+'">'
            +s.name+' <sup>L'+(s.level||3)+'</sup></span>';
        }).join('')+'</div></div>';
    }).join('');
    return '<div class="profile-page">'
      +'<div style="height:5px;background:'+col+';margin:-16px -16px 14px"></div>'
      +'<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">'
      +avatarHTML
      +'<div><h1 style="font-size:18px;font-weight:700;margin:0">'+e.name+'</h1>'
      +'<div style="font-size:13px;color:#555;margin-top:2px">'+(e.role||'')+'</div>'
      +(grp?'<div style="font-size:11px;color:'+grp.color+';margin-top:2px">'+grp.name+'</div>':'')
      +'</div></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 16px;font-size:11px;margin-bottom:12px">'
      +'<div><span style="color:#888;min-width:90px;display:inline-block">Location</span>'+(e.location||'—')+'</div>'
      +'<div><span style="color:#888;min-width:90px;display:inline-block">Seniority</span>'+(c.seniority||'—')+'</div>'
      +'<div><span style="color:#888;min-width:90px;display:inline-block">Contract</span>'+(c.contract||'—')+'</div>'
      +'<div><span style="color:#888;min-width:90px;display:inline-block">Reports to</span>'+mgrName+'</div>'
      +'<div><span style="color:#888;min-width:90px;display:inline-block">Languages</span>'+(c.languages||'—')+'</div>'
      +'<div><span style="color:#888;min-width:90px;display:inline-block">Start date</span>'+(c.startdate||'—')+'</div>'
      +(c.reviewdate?'<div><span style="color:#888;min-width:90px;display:inline-block">Review</span>'+c.reviewdate+'</div>':'')
      +(c.gender?'<div><span style="color:#888;min-width:90px;display:inline-block">Gender</span>'+c.gender+'</div>':'')
      +'</div>'
      +(fullMode&&c.aspirations?'<h2 class="sec">Aspirations</h2><p>'+c.aspirations+'</p>':'')
      +(fullMode&&c.strengths?'<h2 class="sec">Strengths</h2><p>'+c.strengths+'</p>':'')
      +(fullMode&&c.devarea?'<h2 class="sec">Development Areas</h2><p>'+c.devarea+'</p>':'')
      +(skills.length?'<h2 class="sec">Skills ('+skills.length+')</h2>'+skillsHTML:'')
      +(fullMode&&c.notes?'<h2 class="sec">Notes</h2><p>'+c.notes+'</p>':'')
      +'</div>';
  }

  const win=window.open('','_blank');
  if(!win){alert('Pop-up blocked.');return;}
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Profiles</title>'
    +'<style>*{margin:0;padding:0;box-sizing:border-box;}'
    +'body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:0;}'
    +'.profile-page{padding:16px;border-bottom:2px solid #eee;page-break-after:always;break-after:page;}'
    +'.profile-page:last-child{border-bottom:none;page-break-after:avoid;}'
    +'h2.sec{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#888;margin:10px 0 5px;border-bottom:1px solid #eee;padding-bottom:3px;}'
    +'p{font-size:11px;line-height:1.6;color:#444;}'
    +'@media print{@page{size:A4;margin:8mm;}.profile-page{padding:8px;}}'
    +'</style></head><body>');
  engs.forEach(function(e){win.document.write(buildProfileHTML(e));});
  win.document.write('<scr'+'ipt>window.addEventListener("load",function(){setTimeout(window.print,400);});<\/script></body></html>');
  win.document.close();
}

/* ►► SECTION: PROFILE-EXPORT ◄◄ Profile card builder, dashboard PNG/SVG/HTML/PDF export */
// builds the profile-card HTML array (themed for screen/export)
function buildProfileCardHTMLs(engs, fullMode, vars){
  var CAT_COL=getSkillCatCol();
  var CAT_LABEL=getSkillCatLabel(true);
  var LVL=['','Awareness','Basic','Proficient','Advanced','Expert'];
  var V=vars||{
    bg:'#0f0f11',surface:'#18181c',border:'#2a2a32',
    text:'#e8e8ea',muted:'#6b6b78',accent:'#c8f135',
    accent2:'#5be5c8',danger:'#f14335'
  };

  return engs.map(function(e){
    var c=e.idcard||{};
    var col=engGroupColor(e);
    var grp=engGroups.find(function(g){return g.id===e.groupId;});
    var photo=idbGetPhoto(e.id)||(c.photo||'');
    var mgr=engineers.find(function(x){return String(x.id)===String(c.reportsTo);});
    var mgrName=mgr?mgr.name:(c.manager||'—');
    var skills=e.skills||[];
    var sm=buildSkillMap();
    var spof=skills.filter(function(s){
      var k=s.name.toLowerCase().trim();
      return sm[k]&&sm[k].holders.length===1;
    });

    var avatarHTML=photo
      ?'<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid '+col+'"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover"></div>'
      :'<div style="width:48px;height:48px;border-radius:50%;flex-shrink:0;background:'+col+'33;border:2px solid '+col+';display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:'+col+';font-family:monospace">'+engInitials(e.name)+'</div>';

    var details=[
      ['📍',e.location||c.location||'—'],
      ['📊',c.seniority||'—'],
      ['📋',c.contract||'—'],
      ['👤',mgrName],
      ['🌐',c.languages||'—'],
    ];

    var skillHTML='';
    if(skills.length){
      if(fullMode){
        var domains=[];
        skills.forEach(function(s){var d=s.domain||'General';if(!domains.includes(d))domains.push(d);});
        skillHTML='<div style="margin-top:8px">';
        domains.forEach(function(dom){
          var ds=skills.filter(function(s){return (s.domain||'General')===dom;});
          skillHTML+='<div style="font-size:9px;color:'+V.muted+';font-family:monospace;text-transform:uppercase;letter-spacing:.05em;margin:5px 0 3px">'+escH(dom)+'</div>';
          skillHTML+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:2px">';
          ds.forEach(function(s){
            var cc=CAT_COL[s.cat]||'#888';
            var hasGap=s.gaps&&s.gaps.trim();
            skillHTML+='<span style="font-size:9px;padding:2px 7px;border-radius:8px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc+'">'
              +escH(s.name)
              +'<span style="font-family:monospace;font-size:8px;opacity:.8;margin-left:3px">L'+(s.level||3)+'</span>'
              +(hasGap?'<span style="font-size:9px;margin-left:2px" title="'+escH(s.gaps)+'">⚠</span>':'')
              +(s.comment?'<span style="font-size:9px;margin-left:2px" title="'+escH(s.comment)+'">💬</span>':'')
              +'</span>';
          });
          skillHTML+='</div>';
        });
        skillHTML+='</div>';
      } else {
        skillHTML='<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:3px">';
        var shown=skills.slice(0,16);
        shown.forEach(function(s){
          var cc=CAT_COL[s.cat]||'#888';
          skillHTML+='<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:'+cc+'18;border:1px solid '+cc+'44;color:'+cc+'">'+escH(s.name)+'</span>';
        });
        if(skills.length>16)skillHTML+='<span style="font-size:9px;color:'+V.muted+'">+'+(skills.length-16)+' more</span>';
        skillHTML+='</div>';
      }
    }

    var fullHTML='';
    if(fullMode){
      var extras=[
        ['💡 Aspirations',c.aspirations],
        ['💪 Strengths',c.strengths],
        ['📈 Development areas',c.devarea],
        ['📝 Notes',c.notes]
      ];
      extras.forEach(function(f){
        if(!f[1]||!f[1].trim())return;
        fullHTML+='<div style="margin-top:7px;padding-top:6px;border-top:1px solid '+V.border+'">'
          +'<div style="font-size:9px;color:'+V.muted+';font-family:monospace;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">'+f[0]+'</div>'
          +'<div style="font-size:10px;color:'+V.text+';line-height:1.55">'+escH(f[1])+'</div>'
          +'</div>';
      });
    }

    var spofHTML=spof.length
      ?'<div style="margin-top:5px;font-size:10px;color:#f14335;font-weight:600">⚠ SPOF: '+spof.map(function(s){return escH(s.name);}).join(', ')+'</div>'
      :'';

    return '<div style="background:'+V.surface+';border:1px solid '+V.border
      +';border-radius:8px;overflow:hidden;display:flex;flex-direction:column">'
      +'<div style="height:5px;background:'+col+'"></div>'
      +'<div style="padding:12px 14px;display:flex;gap:12px;align-items:flex-start">'
      +avatarHTML
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;color:'+V.text+'">'+escH(e.name)+'</div>'
      +'<div style="font-size:11px;color:'+V.muted+'">'+escH(e.role||'—')+'</div>'
      +(grp?'<div style="font-size:10px;color:'+grp.color+';margin-top:2px">'+escH(grp.name)+'</div>':'')
      +'</div></div>'
      +'<div style="padding:0 14px 12px;display:flex;flex-direction:column;gap:3px">'
      +details.map(function(d){
        return '<div style="display:flex;gap:6px;font-size:10px">'
          +'<span style="color:'+V.muted+';min-width:20px;flex-shrink:0">'+d[0]+'</span>'
          +'<span style="color:'+V.text+'">'+escH(d[1])+'</span></div>';
      }).join('')
      +skillHTML
      +spofHTML
      +fullHTML
      +'</div></div>';
  });
}

// returns the filtered engineer set + full-detail flag for export
function getProfileExportEngs(){
  var grpFilter=G('prf-grp')?G('prf-grp').value:'';
  var search=(G('prf-search')?G('prf-search').value:'').toLowerCase().trim();
  var fullMode=G('prf-fullmode')&&G('prf-fullmode').checked;
  var engs=engineers.filter(function(e){return !e.vacant;});
  if(grpFilter)engs=engs.filter(function(e){return String(e.groupId)===grpFilter;});
  if(search)engs=engs.filter(function(e){return e.name.toLowerCase().includes(search);});
  return{engs:engs,fullMode:fullMode};
}

// builds the standalone profiles dashboard HTML page
function buildProfilesPageHTML(engs, fullMode, cols){
  var cs=getComputedStyle(document.documentElement);
  var V={
    bg:cs.getPropertyValue('--bg').trim()||'#0f0f11',
    surface:cs.getPropertyValue('--surface').trim()||'#18181c',
    border:cs.getPropertyValue('--border').trim()||'#2a2a32',
    text:cs.getPropertyValue('--text').trim()||'#e8e8ea',
    muted:cs.getPropertyValue('--muted').trim()||'#6b6b78',
    accent:cs.getPropertyValue('--accent').trim()||'#c8f135',
    accent2:cs.getPropertyValue('--accent2').trim()||'#5be5c8',
    danger:cs.getPropertyValue('--danger').trim()||'#f14335',
  };

  var cards=buildProfileCardHTMLs(engs,fullMode,V);
  var numCols=cols||3;

  var planTitle=G('res-title-input')?G('res-title-input').value:'Resource Plan';
  var title=planTitle+' — Team Profiles';
  var dateStr=new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});
  var grpLabel=G('prf-grp')&&G('prf-grp').value
    ?' · '+G('prf-grp').options[G('prf-grp').selectedIndex].text:'';
  var fullLabel=fullMode?' · Full detail':'';

  return '<!DOCTYPE html><html><head>'
    +'<meta charset="UTF-8"><title>'+escH(title)+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'html,body{background:'+V.bg+';color:'+V.text+';font-family:Arial,Helvetica,sans-serif;'
    +'  padding:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}'
    +'.rh{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;'
    +'  margin-bottom:14px;background:'+V.surface+';border:1px solid '+V.border+';border-radius:8px;}'
    +'.rh-title{font-size:16px;font-weight:700;color:'+V.accent+';font-family:monospace;letter-spacing:.04em;}'
    +'.rh-meta{font-size:10px;color:'+V.muted+';margin-top:3px;}'
    +'.card-grid{display:grid;grid-template-columns:repeat('+numCols+',1fr);gap:12px;}'
    +'.card-grid>div{break-inside:avoid;page-break-inside:avoid;}'
    +'.rf{margin-top:12px;padding-top:8px;border-top:1px solid '+V.border+';'
    +'  font-size:9px;color:'+V.muted+';display:flex;justify-content:space-between;}'
    +'@media print{'
    +'  @page{size:A3 landscape;margin:7mm;}'
    +'  html,body{padding:0;background:'+V.bg+'!important;}'
    +'  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}'
    +'}'
    +'</style></head><body>'
    +'<div class="rh">'
    +'<div><div class="rh-title">'+escH(title)+'</div>'
    +'<div class="rh-meta">'+engs.length+' member'+(engs.length!==1?'s':'')+grpLabel+fullLabel+'</div></div>'
    +'<div style="text-align:right;font-family:monospace">'
    +'<div style="font-size:11px;color:'+V.accent+'">Project Matrix</div>'
    +'<div style="font-size:10px;color:'+V.muted+'">'+dateStr+'</div>'
    +'</div></div>'
    +'<div class="card-grid">'+cards.join('')+'</div>'
    +'<div class="rf"><span>'+escH(title)+'</span><span>Project Matrix · '+dateStr+'</span></div>'
    +'</body></html>';
}

// opens the profiles dashboard in a print popup
function exportProfilesDashboardPDF(){
  var r=getProfileExportEngs();
  if(!r.engs.length){alert('No profiles to export.');return;}
  var html=buildProfilesPageHTML(r.engs,r.fullMode,3);
  var win=window.open('','_blank');
  if(!win){alert('Pop-up blocked.');return;}
  win.document.write(html);
  win.document.write('<scr'+'ipt>window.addEventListener("load",function(){setTimeout(window.print,500);});<\/script>');
  win.document.close();
}
// alias for exportProfilesDashboardPDF
function _doExportProfilesDashboardPDF(){exportProfilesDashboardPDF();}

// downloads the profiles dashboard as an HTML file
function exportProfilesDashboardHTML(){
  var r=getProfileExportEngs();
  if(!r.engs.length){alert('No profiles to export.');return;}
  var html=buildProfilesPageHTML(r.engs,r.fullMode,3);
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  var name=(G('res-title-input')?G('res-title-input').value:'profiles')
    .replace(/[^a-z0-9]/gi,'_').toLowerCase();
  a.download=name+'_profiles.html';
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
}

// renders the profiles dashboard to a PNG via SVG foreignObject
function exportProfilesDashboardPNG(){
  var r=getProfileExportEngs();
  if(!r.engs.length){alert('No profiles to export.');return;}

  var html=buildProfilesPageHTML(r.engs,r.fullMode,3);

  var iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1600px;height:10px;border:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();

  setTimeout(function(){
    var h=iframe.contentDocument.body.scrollHeight;
    iframe.style.height=h+'px';
    setTimeout(function(){
      var _sm=html.match(/<style>([\s\S]*?)<\/style>/i);
      var _sc=_sm?_sm[1]:'';
      var _bm=html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      var _bc=_bm?_bm[1]:html;
      var svgStr='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="'+h+'">'
        +'<foreignObject width="1600" height="'+h+'">'
        +'<body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:16px;background:#0f0f11">'
        +'<style>'+_sc+'</style>'
        +_bc
        +'</body></foreignObject></svg>';
      var img=new Image();
      var b64='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
      img.onload=function(){
        var canvas=document.createElement('canvas');
        var scale=2;
        canvas.width=1600*scale;canvas.height=h*scale;
        var ctx=canvas.getContext('2d');
        ctx.scale(scale,scale);
        ctx.drawImage(img,0,0);
        canvas.toBlob(function(blob){
          var a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          var name=(G('res-title-input')?G('res-title-input').value:'profiles')
            .replace(/[^a-z0-9]/gi,'_').toLowerCase();
          a.download=name+'_profiles.png';
          a.click();
        },'image/png');
        document.body.removeChild(iframe);
      };
      img.onerror=function(){
        document.body.removeChild(iframe);
        alert('PNG export is limited by browser security. Opening as HTML instead — you can screenshot or print to PDF from there.');
        exportProfilesDashboardHTML();
      };
      img.src=b64;
    },300);
  },200);
}

// renders the profiles dashboard to a standalone SVG
function exportProfilesDashboardSVG(){
  var r=getProfileExportEngs();
  if(!r.engs.length){alert('No profiles to export.');return;}

  var html=buildProfilesPageHTML(r.engs,r.fullMode,3);

  var iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1600px;height:10px;border:none;visibility:hidden';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();

  setTimeout(function(){
    var h=iframe.contentDocument.body.scrollHeight+40;
    document.body.removeChild(iframe);

    var styleMatch=html.match(/<style>([\s\S]*?)<\/style>/i);
    var styleCSS=styleMatch?styleMatch[1]:'';
    var bodyMatch=html.match(/<body[^>]*>([\s\S]*?)<\/body>/is);
    var bodyContent=bodyMatch?bodyMatch[1]:html;

    var svgStr='<?xml version="1.0" encoding="UTF-8"?>\n'
      +'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
      +' width="1600" height="'+h+'">\n'
      +'<rect width="1600" height="'+h+'" fill="#0f0f11"/>\n'
      +'<foreignObject x="0" y="0" width="1600" height="'+h+'">\n'
      +'<body xmlns="http://www.w3.org/1999/xhtml"'
      +' style="margin:0;padding:16px;background:#0f0f11;font-family:Arial,sans-serif;'
      +'-webkit-print-color-adjust:exact;print-color-adjust:exact">\n'
      +'<style>'+styleCSS+'</style>\n'
      +bodyContent
      +'\n</body>\n'
      +'</foreignObject>\n'
      +'</svg>';

    var blob=new Blob([svgStr],{type:'image/svg+xml;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    var name=(G('res-title-input')?G('res-title-input').value:'profiles')
      .replace(/[^a-z0-9]/gi,'_').toLowerCase();
    a.download=name+'_profiles.svg';
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
  },300);
}

/* ►► SECTION: BRIEF ◄◄ Project brief export: multi-project PDF/HTML */
// opens the project-brief export modal with the project checklist
function openProjectBriefExport(){
  var list=G('brief-proj-list');
  list.innerHTML='';
  var visible=projects.filter(function(p){return p.visible!==false;});
  projects.forEach(function(p){
    var isVis=p.visible!==false;
    list.innerHTML+='<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;'
      +'border-radius:5px;cursor:pointer;background:rgba(255,255,255,.02);border:1px solid var(--border)">'
      +'<input type="checkbox" data-pid="'+p.id+'"'+(isVis?' checked':'')+'>'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+p.color+';flex-shrink:0"></span>'
      +'<span style="font-size:11px;flex:1">'+escH(p.name)+'</span>'
      +(p.sector?'<span style="font-size:10px;color:var(--muted)">'+escH(p.sector)+'</span>':'')
      +'</label>';
  });
  G('brief-overlay').style.display='flex';
}

// checks/unchecks all projects in the brief modal
function briefSelectAll(val){
  G('brief-proj-list').querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.checked=val;});
}
// selects only the currently-visible projects in the brief modal
function briefSelectVisible(){
  G('brief-proj-list').querySelectorAll('input[type=checkbox]').forEach(function(cb){
    var pid=+cb.dataset.pid;
    var p=projects.find(function(x){return x.id===pid;});
    cb.checked=p&&p.visible!==false;
  });
}

// returns the projects checked in the brief modal
function getSelectedBriefProjects(){
  var selected=[];
  G('brief-proj-list').querySelectorAll('input[type=checkbox]:checked').forEach(function(cb){
    var p=projects.find(function(x){return x.id===+cb.dataset.pid;});
    if(p)selected.push(p);
  });
  return selected;
}

// builds the multi-project brief HTML (KPIs, team, risks, todos, milestones, actions)
function buildBriefHTML(selectedProjs, opts){
  var cs=getComputedStyle(document.documentElement);
  var V={
    bg:     cs.getPropertyValue('--bg').trim()||'#0f0f11',
    surface:cs.getPropertyValue('--surface').trim()||'#18181c',
    border: cs.getPropertyValue('--border').trim()||'#2a2a32',
    text:   cs.getPropertyValue('--text').trim()||'#e8e8ea',
    muted:  cs.getPropertyValue('--muted').trim()||'#6b6b78',
    accent: cs.getPropertyValue('--accent').trim()||'#c8f135',
    accent2:cs.getPropertyValue('--accent2').trim()||'#5be5c8',
    danger: cs.getPropertyValue('--danger').trim()||'#f14335',
  };

  var axName='Effort';
  try{axName=axX().name||'Effort';}catch(e){}

  var yLabel={'impact':'Impact','visibility':'Visibility','enabler':'Enabler'}[yMode]||'Impact';
  var dateStr=new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});

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

  var CAT_COL=getSkillCatCol();
  var LVL=['','Awareness','Basic','Proficient','Advanced','Expert'];

  function buildProjectBlock(p){
    var col=p.color||V.accent;
    var sec=sections.find(function(s){return s.id===p.sectionId;});
    var allocs=projAllocMap[p.id]||[];
    var totalProjCost=allocs.reduce(function(s,a){return s+a.totalCost;},0)||p.planCost||0;
    var totalFTE=allocs.reduce(function(s,a){return s+a.totalFTE;},0);

    var html='<div class="proj-block" style="background:'+V.surface+';border:1px solid '+V.border
      +';border-left:5px solid '+col+';border-radius:8px;margin-bottom:20px;overflow:hidden;break-inside:avoid;page-break-inside:avoid">';

    html+='<div style="padding:16px 18px 12px;border-bottom:1px solid '+V.border+'">';
    html+='<div style="display:flex;align-items:flex-start;gap:12px">';
    html+='<div style="width:14px;height:14px;border-radius:50%;background:'+col+';flex-shrink:0;margin-top:3px"></div>';
    html+='<div style="flex:1">';
    html+='<h2 style="font-size:18px;font-weight:700;color:'+V.text+';line-height:1.2;margin-bottom:4px">'+escH(p.name)+'</h2>';
    if(p.note)html+='<div style="font-size:11px;color:'+V.muted+';margin-bottom:6px">'+escH(p.note)+'</div>';
    html+='</div></div>';

    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:10px">';

    var kpis=[
      {label:axName,val:p.x!=null?p.x:'—',unit:''},
      {label:yLabel+' (0-10)',val:getProjY(p).toFixed(1),unit:''},
      {label:'Visibility',val:(p.vis??5).toFixed(1),unit:'/ 10'},
      {label:'Enabler',val:(p.ena??5).toFixed(1),unit:'/ 10'},
    ];
    if(p.sector)         kpis.unshift({label:'Sector',val:p.sector,unit:''});
    if(p.impactEur!=null)kpis.push({label:'Revenue Impact',val:p.impactEur,unit:'MEur'});
    if(totalProjCost>0)  kpis.push({label:'Plan Cost',val:Math.round(totalProjCost/1000)+'k',unit:'€'});
    if(p.currentGate)    kpis.push({label:'Current Gate',val:p.currentGate,unit:''});
    if(p.gate)           kpis.push({label:'Next Gate',val:p.gate,unit:''});
    if(p.eta)            kpis.push({label:'ETA',val:p.eta,unit:''});
    if(sec)              kpis.push({label:'Section',val:sec.name,unit:''});

    kpis.forEach(function(k){
      html+='<div style="background:'+V.bg+';border:1px solid '+V.border+';border-radius:6px;padding:8px 12px">'
        +'<div style="font-family:monospace;font-size:9px;color:'+V.muted+';letter-spacing:.05em;text-transform:uppercase;margin-bottom:3px">'+k.label+'</div>'
        +'<div style="font-size:15px;font-weight:700;color:'+col+'">'+escH(String(k.val))
        +(k.unit?'<span style="font-size:10px;color:'+V.muted+';margin-left:3px">'+k.unit+'</span>':'')
        +'</div>'
        +'</div>';
    });
    html+='</div></div>';

    if(opts.includeTeam&&allocs.length){
      html+='<div style="padding:14px 18px">';
      html+='<div style="font-family:monospace;font-size:10px;color:'+V.muted+';letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Team Allocation</div>';
      html+='<div style="display:flex;flex-direction:column;gap:8px">';

      allocs.forEach(function(a){
        var e=a.eng;
        var c=e.idcard||{};
        var grp=engGroups.find(function(g){return g.id===e.groupId;});
        var gc=grp?grp.color:'#6b6b78';
        var photo=idbGetPhoto(e.id)||(c.photo||'');
        var initials=engInitials(e.name);
        var avgFTE=a.activeMonths.length?a.totalFTE/a.activeMonths.length:0;
        var topSkills=(e.skills||[]).filter(function(s){return s.cat==='crit';}).slice(0,4);

        html+='<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;'
          +'background:'+V.bg+';border:1px solid '+V.border+';border-radius:6px">';

        html+=photo
          ?'<div style="width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid '+gc+'"><img src="'+photo+'" style="width:100%;height:100%;object-fit:cover"></div>'
          :'<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;background:'+gc+'33;border:2px solid '+gc
            +';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:'+gc+';font-family:monospace">'+escH(initials)+'</div>';

        html+='<div style="flex:1;min-width:0">';
        html+='<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">';
        html+='<span style="font-size:12px;font-weight:700;color:'+V.text+'">'+escH(e.name)+'</span>';
        if(grp)html+='<span style="font-size:10px;color:'+gc+'">'+escH(grp.name)+'</span>';
        html+='</div>';
        html+='<div style="font-size:10px;color:'+V.muted+';margin-top:1px">'+escH(e.role||'—');
        if(c.seniority)html+=' · '+escH(c.seniority);
        if(e.location||c.location)html+=' · 📍'+escH(e.location||c.location);
        html+='</div>';

        if(topSkills.length){
          html+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">';
          topSkills.forEach(function(s){
            html+='<span style="font-size:9px;padding:1px 5px;border-radius:6px;background:#f1433520;border:1px solid #f1433544;color:#f14335">'+escH(s.name)+'</span>';
          });
          if((e.skills||[]).length>4)html+='<span style="font-size:9px;color:'+V.muted+'">'+(e.skills.length-4)+' more</span>';
          html+='</div>';
        }
        html+='</div>';

        html+='<div style="text-align:right;flex-shrink:0">';
        html+='<div style="font-size:18px;font-weight:700;color:'+col+';font-family:monospace">'+Math.round(avgFTE*100)+'%</div>';
        html+='<div style="font-size:9px;color:'+V.muted+'">avg alloc</div>';
        if(a.totalCost>0)html+='<div style="font-size:10px;color:'+V.muted+';margin-top:2px">'+Math.round(a.totalCost/1000)+'k€</div>';
        html+='<div style="font-size:9px;color:'+V.muted+'">'+a.activeMonths.length+' mo</div>';
        html+='</div>';

        html+='</div>';
      });

      html+='</div>';
      html+='<div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid '+V.border
        +';font-size:10px;color:'+V.muted+'">';
      html+='<span><b style="color:'+V.text+'">'+allocs.length+'</b> engineers</span>';
      html+='<span><b style="color:'+V.text+'">'+totalFTE.toFixed(1)+'</b> FTE-months total</span>';
      if(totalProjCost>0)html+='<span><b style="color:'+V.text+'">'+Math.round(totalProjCost/1000)+'k€</b> total cost</span>';
      html+='</div></div>';
    } else if(opts.includeTeam){
      html+='<div style="padding:10px 18px 14px;font-size:11px;color:'+V.muted+'">No team allocation found for this project. Add allocation rows in the Resource Plan.</div>';
    }

    if(opts.includeRisks&&p.risks&&p.risks.length){
      html+='<div style="padding:0 18px 14px">';
      html+='<div style="font-family:monospace;font-size:10px;color:'+V.muted+';letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
        +'Risks ('+p.risks.length+')</div>';
      p.risks.forEach(function(r){
        var rpn=(r.sev||1)*(r.occ||1)*(r.det||1);
        var rcol=rpn>=300?V.danger:rpn>=100?'#f1a435':V.muted;
        var status=r.status||'open';
        var statusCol={open:V.danger,mitigated:'#f1a435',accepted:V.muted,closed:V.accent}[status]||V.muted;
        html+='<div style="padding:8px 12px;border-left:3px solid '+rcol
          +';background:'+V.bg+';border-radius:0 5px 5px 0;margin-bottom:6px">'
          +'<div style="display:flex;align-items:flex-start;gap:8px">'
          +'<span style="font-size:11px;font-weight:600;color:'+V.text+';flex:1">'
          +escH(r.desc||'Unnamed risk')+'</span>'
          +'<span style="font-family:monospace;font-size:10px;font-weight:700;color:'+rcol
          +';background:'+rcol+'18;border:1px solid '+rcol+'44;padding:1px 6px;border-radius:4px;white-space:nowrap">'
          +'RPN '+rpn+'</span>'
          +'</div>'
          +'<div style="display:flex;gap:10px;margin-top:4px;font-size:9px;color:'+V.muted+';font-family:monospace">'
          +'<span>Prob '+(r.prob||1)+'/5</span>'
          +'<span>Imp '+(r.imp||1)+'/5</span>'
          +'<span>Sev '+(r.sev||1)+'</span>'
          +'<span>Occ '+(r.occ||1)+'</span>'
          +'<span>Det '+(r.det||1)+'</span>'
          +(r.owner?'<span style="margin-left:auto">👤 '+escH(r.owner)+'</span>':'')
          +'<span style="color:'+statusCol+'">● '+escH(status)+'</span>'
          +'</div>'
          +(r.mit&&r.mit.trim()
            ?'<div style="margin-top:5px;font-size:10px;color:'+V.muted
              +';border-top:1px solid '+V.border+';padding-top:4px">'
              +'<span style="color:'+V.accent2+'">→ Mitigation: </span>'+escH(r.mit)+'</div>'
            :'')
          +'</div>';
      });
      html+='</div>';
    }

    if(opts.includeTodos&&p.todos&&p.todos.length){
      var openTodos=p.todos.filter(function(t){return !t.done;});
      var doneTodos=p.todos.filter(function(t){return t.done;});
      html+='<div style="padding:0 18px 14px">';
      html+='<div style="font-family:monospace;font-size:10px;color:'+V.muted
        +';letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
        +'Actions · '
        +'<span style="color:'+V.accent+'">'+doneTodos.length+' done</span>'
        +' / '+p.todos.length+' total</div>';
      if(openTodos.length){
        openTodos.forEach(function(t){
          html+='<div style="display:flex;align-items:center;gap:8px;font-size:11px;'
            +'padding:5px 0;border-bottom:1px solid '+V.border+'">'
            +'<span style="color:'+V.muted+';flex-shrink:0">☐</span>'
            +'<span style="color:'+V.text+';flex:1">'+escH(t.text||'')+'</span>'
            +'</div>';
        });
      }
      if(doneTodos.length){
        html+='<div style="margin-top:6px">';
        doneTodos.forEach(function(t){
          html+='<div style="display:flex;align-items:center;gap:8px;font-size:11px;'
            +'padding:5px 0;border-bottom:1px solid '+V.border+';opacity:0.5">'
            +'<span style="color:'+V.accent+';flex-shrink:0">☑</span>'
            +'<span style="color:'+V.muted+';text-decoration:line-through;flex:1">'+escH(t.text||'')+'</span>'
            +'</div>';
        });
        html+='</div>';
      }
      html+='</div>';
    }

    if(opts.includeMilestones&&p.milestones&&p.milestones.length){
      var sortedMs=p.milestones.slice().sort(function(a,b){
        if(!a.date&&!b.date)return 0;
        if(!a.date)return 1;
        if(!b.date)return -1;
        return a.date.localeCompare(b.date);
      });
      html+='<div style="padding:0 18px 14px">';
      html+='<div style="font-family:monospace;font-size:10px;color:'+V.muted+';letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
        +'Milestones ('+sortedMs.length+')</div>';
      html+='<div style="display:flex;flex-direction:column;gap:4px">';
      sortedMs.forEach(function(m){
        var done=m.done;
        var dateStr2=m.date?new Date(m.date+'T00:00:00').toLocaleDateString('en',{year:'numeric',month:'short',day:'numeric'}):'No date';
        html+='<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;'
          +'background:'+V.bg+';border-radius:5px;border:1px solid '+V.border+';'
          +(done?'opacity:0.55;':'')+'">'
          +'<span style="font-size:14px;flex-shrink:0">'+(m.icon||'🎯')+'</span>'
          +'<div style="flex:1">'
          +'<div style="font-size:11px;font-weight:600;color:'+V.text+';'+(done?'text-decoration:line-through':'')+'">'+escH(m.name||'Milestone')+'</div>'
          +'</div>'
          +'<div style="text-align:right;flex-shrink:0">'
          +'<div style="font-family:monospace;font-size:10px;color:'+V.accent2+'">'+escH(dateStr2)+'</div>'
          +(done?'<div style="font-size:9px;color:'+V.accent+'">✓ Done</div>':'')
          +'</div>'
          +'</div>';
      });
      html+='</div></div>';
    }

    if(opts.includeActions&&p.actions&&p.actions.length){
      var STATUS_COL={Open:V.danger,Done:V.accent,'In Progress':'#f1a435',Closed:V.muted};
      html+='<div style="padding:0 18px 14px">';
      html+='<div style="font-family:monospace;font-size:10px;color:'+V.muted+';letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">'
        +'Gantt Actions ('+p.actions.length+')</div>';
      html+='<table style="width:100%;border-collapse:collapse;font-size:10px">'
        +'<thead><tr style="background:'+V.bg+';border-bottom:1px solid '+V.border+'">'
        +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:'+V.muted+'">ACTION</th>'
        +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:'+V.muted+'">START</th>'
        +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:'+V.muted+'">END</th>'
        +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:'+V.muted+'">OWNER</th>'
        +'<th style="text-align:left;padding:5px 8px;font-family:monospace;font-size:9px;color:'+V.muted+'">STATUS</th>'
        +'</tr></thead><tbody>';
      p.actions.forEach(function(a,i){
        var sc=STATUS_COL[a.status]||V.muted;
        var rowBg=i%2===1?'background:'+V.surface+';':'';
        var fmt=function(d){return d?new Date(d+'T00:00:00').toLocaleDateString('en',{month:'short',day:'numeric',year:'2-digit'}):'—';};
        html+='<tr style="'+rowBg+'border-bottom:1px solid '+V.border+'">'
          +'<td style="padding:5px 8px;font-weight:600;color:'+(a.color||V.accent)+'">'
          +(a.isMilestone?'🎯 ':'')
          +escH(a.desc||'—')
          +(a.priority&&a.priority!=='Medium'?'<span style="font-size:9px;color:'+V.muted+';margin-left:5px">'+escH(a.priority)+'</span>':'')
          +'</td>'
          +'<td style="padding:5px 8px;font-family:monospace;color:'+V.muted+'">'+fmt(a.start)+'</td>'
          +'<td style="padding:5px 8px;font-family:monospace;color:'+V.muted+'">'+fmt(a.end||a.due)+'</td>'
          +'<td style="padding:5px 8px;color:'+V.muted+'">'+escH(a.member||'—')+'</td>'
          +'<td style="padding:5px 8px">'
          +'<span style="font-family:monospace;font-size:9px;padding:1px 6px;border-radius:3px;background:'+sc+'20;color:'+sc+';border:1px solid '+sc+'44">'+escH(a.status||'Open')+'</span>'
          +'</td>'
          +'</tr>';
      });
      html+='</tbody></table></div>';
    }

    html+='</div>';
    return html;
  }

  var planTitle=G('res-title-input')?G('res-title-input').value:'R&D Portfolio';
  var blocks=selectedProjs.map(buildProjectBlock).join('');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<title>'+escH(planTitle)+' — Project Briefs</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;}'
    +'html,body{background:'+V.bg+';color:'+V.text+';font-family:Arial,Helvetica,sans-serif;'
    +'  padding:20px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}'
    +'.cover{padding:24px 28px;background:'+V.surface+';border:1px solid '+V.border+';border-radius:10px;margin-bottom:24px;}'
    +'.cover-title{font-size:24px;font-weight:700;color:'+V.accent+';font-family:monospace;letter-spacing:.04em;}'
    +'.cover-sub{font-size:12px;color:'+V.muted+';margin-top:5px;}'
    +'@media print{'
    +'  @page{size:A4;margin:10mm;}'
    +'  html,body{background:'+V.bg+'!important;padding:0;}'
    +'  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}'
    +'  .proj-block{break-inside:avoid;}'
    +'}'
    +'</style></head><body>'
    +'<div class="cover">'
    +'<div class="cover-title">'+escH(planTitle)+'</div>'
    +'<div class="cover-sub">Project Briefs · '+selectedProjs.length+' project'+(selectedProjs.length!==1?'s':'')+' · '+dateStr+'</div>'
    +'</div>'
    +blocks
    +'<div style="margin-top:16px;padding-top:10px;border-top:1px solid '+V.border
    +';font-size:9px;color:'+V.muted+';display:flex;justify-content:space-between">'
    +'<span>'+escH(planTitle)+' — Project Briefs</span><span>Project Matrix · '+dateStr+'</span>'
    +'</div>'
    +'</body></html>';
}

// reads the brief section-include checkboxes into an options object
function _getBriefOpts(){
  return {
    includeTeam:       !!(G('brief-include-team')       && G('brief-include-team').checked),
    includeRisks:      !!(G('brief-include-risks')      && G('brief-include-risks').checked),
    includeTodos:      !!(G('brief-include-todos')      && G('brief-include-todos').checked),
    includeMilestones: !!(G('brief-include-milestones') && G('brief-include-milestones').checked),
    includeActions:    !!(G('brief-include-actions')    && G('brief-include-actions').checked),
  };
}

// opens the project brief in a print popup
function exportProjectBrief(){
  var sel=getSelectedBriefProjects();
  if(!sel.length){alert('Select at least one project.');return;}
  var opts=_getBriefOpts();
  var html=buildBriefHTML(sel,opts);
  if(!html){alert('Export failed — could not build brief content.');return;}
  var win=window.open('','_blank');
  if(!win){alert('Pop-up blocked — please allow pop-ups for this page.');return;}
  win.document.write(html);
  win.document.close();
  G('brief-overlay').style.display='none';
}

// downloads the project brief as an HTML file
function exportProjectBriefHTML(){
  var sel=getSelectedBriefProjects();
  if(!sel.length){alert('Select at least one project.');return;}
  var opts=_getBriefOpts();
  var html=buildBriefHTML(sel,opts);
  if(!html){alert('Export failed.');return;}
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  var planName=(G('res-title-input')?G('res-title-input').value:'portfolio')
    .replace(/[^a-z0-9]/gi,'_').toLowerCase();
  a.download=planName+'_briefs.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
  G('brief-overlay').style.display='none';
}
