/* ►► SECTION: EXPORT-PACKS ◄◄ The global "Export" door + cross-view packs.
 *
 * Two things live here, both sitting ON TOP of the export engine
 * (src/core/export.js) rather than inside it — the engine stays deliverable-
 * agnostic and Node-testable, this file is where app knowledge is allowed:
 *
 *  1. exportDeliverables() — the ONE registry of everything exportable, used by
 *     the rail's Export action. Each view still keeps its own Export button
 *     (the door is where you are); this is the second door for people who know
 *     WHAT they want but not WHERE it lives.
 *
 *  2. Packs — deliverables whose blocks are pulled from SEVERAL section
 *     registries at once (talent review = nine-box + DISC + profiles). A pack
 *     is not a new rendering path: it is the ordinary builder handed a merged
 *     block list, so it inherits templates, theme, paper, layout, preview and
 *     per-block error isolation for free.
 *
 * Why packs come after the per-view migrations: a pack can only compose blocks
 * that already exist. Skills/SPOF and the cost dashboard are not migrated yet,
 * so they are absent from the packs below — add them to the relevant pack's
 * block list once their <prefix>ExportBlocks() functions land, nothing else
 * needs to change.
 */

/* Re-labels and namespaces another section's blocks so several registries can
 * be merged without id collisions, and so the picker chip reads "Nine-box —
 * Grid" rather than a bare "Grid" with no clue which view it came from. */
function packBlocksFrom(prefix, sourceLabel, list){
  return (list||[]).map(function(b){
    return {
      id: prefix+'.'+b.id,
      label: sourceLabel+' — '+b.label,
      render: b.render
    };
  });
}

/* Profiles is the one registry that cannot be merged as-is: its "blocks" are
 * per-person FIELD TOGGLES consumed through composeRender (one block applies to
 * every card), not independent pages. So a pack takes the whole card grid as a
 * single block instead — same renderer, fixed field set. */
function packProfileCardsBlock(){
  return {
    id:'profiles.cards',
    label:t('Profiles — team cards'),
    render:function(ctx){
      var engs=getProfileExportEngs();
      if(!engs.length) return '';
      var fields=prfCardBlocks().map(function(b){return b.id;});
      var cards=buildProfileCardHTMLs(engs,fields);
      var cols=ctx&&ctx.columns?ctx.columns:3;
      return '<h2 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text)">'+escH(t('Team profiles'))+'</h2>'
        +'<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:12px">'
        +cards.map(function(c){return '<div style="min-width:0;break-inside:avoid;page-break-inside:avoid">'+c+'</div>';}).join('')
        +'</div>';
    }
  };
}

/* ── The packs ─────────────────────────────────────────────────────────── */

// Talent review — the people conversation, end to end.
function packTalentOpen(){
  var blocks=[]
    .concat(packBlocksFrom('nb',t('Nine-box'),nbExportBlocks()))
    .concat(packBlocksFrom('disc','DISC',discExportBlocks()))
    .concat([packProfileCardsBlock()]);
  exportOpenBuilder({
    deliverableId:'pack-talent',
    title:t('Talent review pack'),
    subtitleDefault:(G('res-title-input')?G('res-title-input').value:'')||'',
    blocks:blocks,
    ctx:{},
    orientation:'landscape', pageSize:'A3', rasterWidth:1600,
    builtinTemplates:[
      {id:'full', name:t('Full review'), blocks:['nb.grid','nb.distribution','disc.quadrants','disc.mix','profiles.cards']},
      {id:'matrices', name:t('Matrices only'), blocks:['nb.grid','disc.quadrants']},
      {id:'calibration', name:t('Calibration'), blocks:['nb.grid','nb.distribution','nb.unplaced']},
    ],
    columns:{default:3, options:[2,3,4,5]},
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}

// Organisation — structure and shape of the team.
function packOrgOpen(){
  var blocks=[]
    .concat(packBlocksFrom('org',t('Org'),orgExportBlocks()))
    .concat([packProfileCardsBlock()]);
  exportOpenBuilder({
    deliverableId:'pack-org',
    title:t('Organisation pack'),
    subtitleDefault:(G('res-title-input')?G('res-title-input').value:'')||'',
    blocks:blocks,
    ctx:{},
    orientation:'landscape', pageSize:'A3', rasterWidth:1600,
    builtinTemplates:[
      {id:'full', name:t('Chart, headcount + profiles'), blocks:['org.chart','org.headcount','profiles.cards']},
      {id:'structure', name:t('Structure only'), blocks:['org.chart','org.headcount']},
    ],
    columns:{default:3, options:[2,3,4,5]},
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}

// Board pack — the portfolio story plus the people headline behind it.
function packBoardOpen(){
  var months=getMonthRange();
  var eco=ecDataset();
  var blocks=[]
    .concat(packBlocksFrom('xs',t('Exec'),xsExportBlocks()))
    .concat(packBlocksFrom('org',t('Org'),orgExportBlocks().filter(function(b){return b.id==='headcount';})))
    .concat(packBlocksFrom('nb',t('Nine-box'),nbExportBlocks().filter(function(b){return b.id==='distribution';})));
  exportOpenBuilder({
    deliverableId:'pack-board',
    title:t('Board pack'),
    subtitleDefault:(G('res-title-input')?G('res-title-input').value:'Resource Plan')
      +(months.length?' · '+t('over {n} month(s)',{n:months.length}):''),
    blocks:blocks,
    ctx:{months:months, eco:eco},
    builtinTemplates:[
      {id:'full', name:t('Full'), blocks:['xs.scorecard','xs.spendmap','xs.valuerisk','xs.burn','xs.attention','org.headcount','nb.distribution']},
      {id:'short', name:t('Short form'), blocks:['xs.scorecard','xs.attention','org.headcount']},
    ],
    formats:[
      {id:'pdf', label:t('PDF (print)')},
      {id:'html', label:t('HTML (standalone)')},
    ],
  });
}

/* ── The registry behind the rail's Export action ──────────────────────── */

/* `ready` gates a deliverable that would only open and immediately alert. The
 * picker still SHOWS it (so the feature is discoverable before there's data)
 * but greys it and explains what is missing.
 *
 * Project-scoped deliverables — the Gantt and the project brief — are
 * deliberately NOT listed: they export whatever project you currently have
 * open, which is meaningless from a global menu. They keep their button on
 * their own view, where the scope is unambiguous. */
function exportDeliverables(){
  var anyPeople=engineers.filter(function(e){return !e.planningOnly;}).length;
  return [
    {id:'pack-talent', pack:true, label:t('Talent review pack'), domain:t('TALENT'),
     hint:t('Nine-box, DISC and team profile cards in one document.'),
     ready:!!(Object.keys(_nineBoxPlacements).length||Object.keys(_discPlacements).length),
     missing:t('Place people on the nine-box or DISC first.'), open:packTalentOpen},

    {id:'pack-org', pack:true, label:t('Organisation pack'), domain:t('TEAM'),
     hint:t('Org chart, headcount breakdown and profile cards.'),
     ready:!!anyPeople, missing:t('Add people first.'), open:packOrgOpen},

    {id:'pack-board', pack:true, label:t('Board pack'), domain:t('INSIGHTS'),
     hint:t('Executive scorecard, spend, risk and burn, plus headcount and talent mix.'),
     ready:!!(projects.length||anyPeople), missing:t('Add projects and a team first.'), open:packBoardOpen},

    {id:'exec', label:t('Executive summary'), domain:t('INSIGHTS'),
     hint:t('Scorecard, spend map, value vs risk, cost burn, attention list.'),
     ready:!!(projects.length||anyPeople), missing:t('Add projects and a team first.'), open:exportExecPack},

    {id:'org', label:t('Org chart'), domain:t('TEAM'),
     hint:t('The reporting structure, with an optional headcount breakdown.'),
     ready:!!anyPeople, missing:t('Add people first.'), open:orgExportOpen},

    {id:'ninebox', label:t('Nine-box talent matrix'), domain:t('TALENT'),
     hint:t('The 3×3 grid, distribution and anyone not yet placed.'),
     ready:!!Object.keys(_nineBoxPlacements).length,
     missing:t('Place at least one person on the grid first.'), open:nineBoxExportOpen},

    {id:'disc', label:t('DISC behavioral profile'), domain:t('TALENT'),
     hint:t('The four quadrants, team mix and anyone not yet profiled.'),
     ready:!!Object.keys(_discPlacements).length,
     missing:t('Profile at least one person first.'), open:discExportOpen},

    {id:'analytics', label:t('People Analytics'), domain:t('INSIGHTS'),
     hint:t('KPI scorecard, insights and any of the ten story views — risk radar, pay equity, capacity, succession.'),
     ready:!!anyPeople, missing:t('Add people first.'), open:anExportOpen},

    {id:'profiles-dashboard', label:t('Team profiles'), domain:t('TALENT'),
     hint:t('One card per person, in a grid you can set 2–5 columns wide.'),
     ready:!!anyPeople, missing:t('Add people first.'), open:exportProfilesDashboardOpen},

    {id:'profiles-all', label:t('Full profiles'), domain:t('TALENT'),
     hint:t('One full page per person.'),
     ready:!!anyPeople, missing:t('Add people first.'), open:profilesExportAllOpen},
  ];
}

/* ── The picker ────────────────────────────────────────────────────────── */

function exportOpenPicker(){
  exportRenderPicker();
  var ov=G('export-picker-overlay'); if(ov) ov.classList.add('show');
}
function exportClosePicker(){
  var ov=G('export-picker-overlay'); if(ov) ov.classList.remove('show');
}
// picked a deliverable: close the menu, hand straight over to the shared builder
function exportPickerGo(el){
  var id=el&&el.getAttribute?el.getAttribute('data-id'):null;
  if(!id) return;
  var d=exportDeliverables().find(function(x){return x.id===id;});
  if(!d||!d.ready) return;
  exportClosePicker();
  d.open();
}

function exportRenderPicker(){
  var wrap=G('exp-picker-list'); if(!wrap) return;
  var list=exportDeliverables();
  var card=function(d){
    var dis=!d.ready;
    return '<div class="exp-pick"'+(dis?'':' onclick="exportPickerGo(this)"')
      +' data-id="'+escH(d.id)+'"'
      +' style="border:1px solid '+(d.pack?'var(--accent)':'var(--border)')+';border-radius:8px;padding:10px 12px;'
      +'background:var(--bg);'+(dis?'opacity:.45;':'cursor:pointer;')+'display:flex;flex-direction:column;gap:3px">'
      +'<div style="display:flex;align-items:baseline;gap:8px">'
      +'<span style="font-size:12px;font-weight:700;color:var(--text)">'+escH(d.label)+'</span>'
      +'<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.06em">'+escH(d.domain)+'</span>'
      +(d.pack?'<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--bg);background:var(--accent);border-radius:3px;padding:1px 5px;letter-spacing:.06em">'+escH(t('PACK'))+'</span>':'')
      +'</div>'
      +'<div style="font-size:10px;color:var(--muted);line-height:1.4">'+escH(dis?d.missing:d.hint)+'</div>'
      +'</div>';
  };
  var packs=list.filter(function(d){return d.pack;});
  var singles=list.filter(function(d){return !d.pack;});
  var h='<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;margin-bottom:6px">'
    +escH(t('PACKS — several views in one document'))+'</div>'
    +'<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:14px">'+packs.map(card).join('')+'</div>'
    +'<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;margin-bottom:6px">'
    +escH(t('SINGLE VIEWS'))+'</div>'
    +'<div style="display:flex;flex-direction:column;gap:7px">'+singles.map(card).join('')+'</div>'
    +'<div style="font-size:10px;color:var(--dim);margin-top:12px;line-height:1.5">'
    +escH(t('Project-specific exports (schedule, project brief) live on their own view, where the project is unambiguous.'))
    +'</div>'
  wrap.innerHTML=h;
}
