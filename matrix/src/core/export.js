/* ►► SECTION: EXPORT-ENGINE ◄◄ The one shared pipeline every "deliverable" export
 * (exec pack, and later the charter deck/synopsis, profile/portfolio exports) goes
 * through — see matrix/OUTPUT-LAYER-PLAN.md. Replaces the old pattern of every
 * builder in profiles.js (and disc.js/ninebox.js/skills.js/dashboard.js/...) hand-
 * rolling its own document.write shell + print CSS + hardcoded palette.
 *
 * Two layers:
 *
 *  1. THE SHELL — what actually produces the popup document.
 *       exportBrand(opts)   — { name, logo, palette } — org identity + theme
 *                              ('app' = live on-screen palette, 'light' = print
 *                              paper). opts.theme overrides the Settings default.
 *       exportField(l,v)    — XSS-safe "label: value" row.
 *       exportHTML(spec)    — full standalone document string (cover + pages +
 *                              running footer). Pure — does not open a window.
 *       exportOpen(spec)    — exportHTML() + window.open + autoprint trigger.
 *
 *  2. THE BUILDER — the drag-and-drop "what goes in, in what order, which theme"
 *     picker a deliverable opens instead of calling exportOpen directly.
 *       exportOpenBuilder(spec) — spec: { deliverableId, title, subtitleDefault,
 *         blocks:[{id,label,render(ctx)}], ctx, builtinTemplates:[{id,name,blocks}] }
 *       A deliverable owns its own block registry (what CAN go in) — the builder
 *       just lets the user choose which ones, their order, the theme, and save
 *       that choice as a named template (per-deliverable, localStorage).
 *
 * `pages`/block `render()` output is already-built HTML (escH()/safeColor()/
 * exportField() at the call site — this module has no central sanitiser, same as
 * the rest of the app's innerHTML string-building). The shell is PURE — it never
 * mutates app state, only reads the live theme. The builder is UI (reads G()/
 * document to drive a modal) but still never calls saveState() — exports are
 * read-only against the dataset.
 *
 * `export` on every top-level declaration below is stripped by build.js at bundle
 * time (same convention as helpers.js/financial.js) — it exists so the pure half
 * of this file can be imported directly by tests/export.test.js.
 */
import { escH, safeColor } from './helpers.js';
import { t } from './i18n.js';

export var EXPORT_PREFS_KEY='eim_export_prefs';        // tiny UI-only key — org name/logo/theme, NOT app state/backups
export var EXPORT_TEMPLATES_KEY='eim_export_templates'; // { [deliverableId]: [{id,name,blocks:[blockId,...]}] } — custom templates only

// load persisted export branding prefs (org name + optional logo dataURL + default theme)
export function exportLoadPrefs(){
  try{
    var p=JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY)||'null');
    return {
      orgName: (p&&typeof p.orgName==='string')?p.orgName:'',
      logo: (p&&typeof p.logo==='string')?p.logo:'',
      theme: (p&&(p.theme==='app'||p.theme==='light'))?p.theme:'app'
    };
  }catch(e){ return {orgName:'',logo:'',theme:'app'}; }
}
export function exportSavePrefs(prefs){
  try{
    localStorage.setItem(EXPORT_PREFS_KEY,JSON.stringify({
      orgName:(prefs&&prefs.orgName)||'', logo:(prefs&&prefs.logo)||'',
      theme:(prefs&&prefs.theme==='light')?'light':'app'
    }));
  }catch(e){}
}

// per-deliverable custom templates (built-in templates are supplied by the caller
// each time and never persisted here — only what the user explicitly saves is).
export function exportLoadCustomTemplates(deliverableId){
  try{
    var all=JSON.parse(localStorage.getItem(EXPORT_TEMPLATES_KEY)||'null')||{};
    var list=all[deliverableId];
    return Array.isArray(list)?list.filter(function(x){return x&&x.id&&x.name&&Array.isArray(x.blocks);}):[];
  }catch(e){ return []; }
}
export function exportSaveCustomTemplates(deliverableId,list){
  try{
    var all=JSON.parse(localStorage.getItem(EXPORT_TEMPLATES_KEY)||'null')||{};
    all[deliverableId]=list||[];
    localStorage.setItem(EXPORT_TEMPLATES_KEY,JSON.stringify(all));
  }catch(e){}
}

// resolves the live on-screen theme — same vars as CLAUDE.md › CSS variables.
// Wrapped defensively (no DOM in Node tests) so exportBrand() stays testable.
export function exportPalette(){
  try{
    var cs=getComputedStyle(document.documentElement);
    var g=function(k,f){ return cs.getPropertyValue(k).trim()||f; };
    return {
      bg:g('--bg','#0f0f11'), surface:g('--surface','#18181c'), border:g('--border','#2a2a32'),
      text:g('--text','#e8e8ea'), muted:g('--muted','#6b6b78'), dim:g('--dim','#5a5f66'),
      accent:g('--accent','#c8f135'), accent2:g('--accent2','#5be5c8'),
      danger:g('--danger','#f14335'), warn:g('--warn','#f1a435')
    };
  }catch(e){
    // no DOM (e.g. a Node test) — fall back to the same hardcoded dark defaults
    // every g(k,f) above would have used anyway.
    return {bg:'#0f0f11',surface:'#18181c',border:'#2a2a32',text:'#e8e8ea',muted:'#6b6b78',dim:'#5a5f66',
      accent:'#c8f135',accent2:'#5be5c8',danger:'#f14335',warn:'#f1a435'};
  }
}
// light "paper" theme — the opt-in print-friendly palette (a dark screen theme
// wastes toner on paper). Default is now the APP theme — see exportBrand().
export var EXPORT_PAPER={
  bg:'#ffffff', surface:'#f6f6f8', border:'#dcdce2', text:'#1a1a2e', muted:'#5c5c68', dim:'#8a8a94',
  accent:'#7a9a10', accent2:'#0f8f78', danger:'#c62a1e', warn:'#b3780a'
};

// exportBrand(opts) — the ONE brand object every deliverable shares, so exec pack,
// charter deck, synopsis and profile/portfolio exports all render identically.
// opts.theme ('app'|'light') overrides the Settings default (exportLoadPrefs().theme,
// itself 'app' unless the user has changed it in Settings › EXPORT THEME).
export function exportBrand(opts){
  var o=opts||{}, prefs=exportLoadPrefs();
  var theme=(o.theme==='app'||o.theme==='light')?o.theme:prefs.theme;
  return {
    name: prefs.orgName||'Project Matrix',
    logo: prefs.logo||'',
    theme: theme,
    palette: theme==='light'?EXPORT_PAPER:exportPalette()
  };
}

// Shared print-media rules — the single source of truth for what every builder in
// profiles.js used to duplicate (@media print color-adjust + page-break-after).
// -webkit-print-color-adjust:exact is required or backgrounds/badges drop out.
// @page (size/margin/orientation) is per-export — see exportHTML().
export var EXPORT_PRINT_CSS=
   '@media print{'
  +'html,body{padding:0!important}'
  +'*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}'
  +'.export-page{page-break-after:always;break-after:page}'
  +'.export-page:last-child{page-break-after:avoid;break-after:avoid}'
  +'}';

// XSS-safe "label: value" row — escapes both sides internally so a deliverable
// author can't forget escH() on interpolated data (ARCHITECTURE.md › XSS).
export function exportField(label,value){
  return '<div class="ex-field"><span class="ex-field-l">'+escH(label)+'</span>'
    +'<span class="ex-field-v">'+escH(value==null||value===''?'—':String(value))+'</span></div>';
}

// builds the full standalone document (cover + running footer + pages) as a string.
// Pure — never opens a window or touches state. spec:
//   { title, subtitle, brand, pages:[html,...], orientation:'portrait'|'landscape' }
export function exportHTML(spec){
  var s=spec||{};
  var brand=s.brand||exportBrand();
  var V=brand.palette;
  var pages=s.pages||[];
  var title=s.title||'Export';
  var subtitle=s.subtitle||'';
  var orientation=s.orientation==='landscape'?'landscape':'portrait';
  var dateStr=new Date().toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});

  var logoHTML=brand.logo
    ?'<img src="'+escH(brand.logo)+'" alt="" style="height:30px;max-width:140px;object-fit:contain">'
    :'<div style="font-family:IBM Plex Mono,monospace;font-size:13px;letter-spacing:.08em;color:'+safeColor(V.accent)+'">'+escH(brand.name)+'</div>';

  var coverHTML='<div class="export-page" style="display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:70vh;text-align:center;gap:6px">'
    +logoHTML
    +'<h1 style="font-size:26px;font-weight:700;margin:16px 0 4px;color:'+safeColor(V.text)+'">'+escH(title)+'</h1>'
    +(subtitle?'<div style="font-size:13px;color:'+safeColor(V.muted)+'">'+escH(subtitle)+'</div>':'')
    +'<div style="margin-top:20px;font-family:IBM Plex Mono,monospace;font-size:10px;color:'+safeColor(V.muted)+'">'+escH(dateStr)+'</div>'
    +'</div>';

  var body=coverHTML+pages.map(function(p){ return '<div class="export-page">'+p+'</div>'; }).join('');

  var footer='<div class="ex-foot" style="font-size:9px;color:'+safeColor(V.muted)+';display:flex;justify-content:space-between;'
    +'font-family:IBM Plex Mono,monospace;margin-top:14px;padding-top:8px;border-top:1px solid '+safeColor(V.border)+'">'
    +'<span>'+escH(brand.name)+' — '+escH(title)+'</span><span>'+escH(dateStr)+'</span></div>';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+escH(title)+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'html,body{background:'+safeColor(V.bg)+';color:'+safeColor(V.text)+';font-family:Arial,Helvetica,sans-serif;padding:24px}'
    +':root{--bg:'+safeColor(V.bg)+';--surface:'+safeColor(V.surface)+';--border:'+safeColor(V.border)+';--text:'+safeColor(V.text)
    +';--muted:'+safeColor(V.muted)+';--dim:'+safeColor(V.dim)+';--accent:'+safeColor(V.accent)+';--accent2:'+safeColor(V.accent2)
    +';--danger:'+safeColor(V.danger)+';--warn:'+safeColor(V.warn)+'}'
    +'.export-page{max-width:920px;margin:0 auto 20px}'
    +'.ex-field{display:flex;gap:8px;font-size:11px;margin-bottom:2px}'
    +'.ex-field-l{color:var(--muted);min-width:120px;flex-shrink:0}'
    +'.ex-field-v{color:var(--text)}'
    +EXPORT_PRINT_CSS
    +'@media print{@page{size:A4 '+orientation+';margin:14mm}}'
    +'</style></head><body>'
    +body
    +footer
    +'</body></html>';
}

// exportOpen(spec) — builds the document, opens it in a new tab, and (unless
// spec.autoprint===false) triggers window.print. Split-token '<scr'+'ipt>' —
// build.js invariant #1, no literal script-close tag in a JS string.
export function exportOpen(spec){
  var s=spec||{};
  var win=window.open('','_blank');
  if(!win){ alert(t('Pop-up blocked — please allow pop-ups.')); return null; }
  win.document.write(exportHTML(s));
  if(s.autoprint!==false)
    win.document.write('<scr'+'ipt>window.addEventListener("load",function(){setTimeout(window.print,450);});<\/script>');
  win.document.close();
  return win;
}

/* ── THE BUILDER — drag-and-drop content/order/theme picker ──────────────────
 * One modal (#export-builder-overlay in index.html) shared by every deliverable.
 * A deliverable calls exportOpenBuilder({deliverableId, title, subtitleDefault,
 * blocks, ctx, builtinTemplates}) instead of exportOpen() directly; the user
 * picks a template (or freely drags blocks between Available/Included), sets
 * the theme, optionally saves their selection as a new named template, then
 * hits Export — which finally calls exportOpen() with the chosen pages.
 */
var _exportBuilderState=null;   // { deliverableId, title, subtitle, theme, blocks, ctx, templates, selectedTemplateId, included }
var _exportDragId=null;         // fallback for browsers that restrict dataTransfer reads outside 'drop'

function exportOpenBuilder(spec){
  var s=spec||{};
  var prefs=exportLoadPrefs();
  var custom=exportLoadCustomTemplates(s.deliverableId).map(function(x){return {id:x.id,name:x.name,blocks:x.blocks.slice(),builtin:false};});
  var builtins=(s.builtinTemplates||[]).map(function(x){return {id:x.id,name:x.name,blocks:x.blocks.slice(),builtin:true};});
  var templates=builtins.concat(custom);
  var first=templates[0];
  var blocks=s.blocks||[];
  _exportBuilderState={
    deliverableId: s.deliverableId,
    title: s.title||'Export',
    subtitle: s.subtitleDefault||'',
    theme: prefs.theme,
    blocks: blocks,
    ctx: s.ctx||{},
    templates: templates,
    selectedTemplateId: first?first.id:null,
    included: first?first.blocks.filter(function(id){return blocks.some(function(b){return b.id===id;});}):blocks.map(function(b){return b.id;}),
  };
  exportBuilderRenderAll();
  var ov=G('export-builder-overlay'); if(ov) ov.classList.add('show');
}

function exportBuilderRenderAll(){
  var st=_exportBuilderState; if(!st) return;
  var h=G('exb-heading'); if(h) h.textContent=t('EXPORT — {t}',{t:st.title});
  var ti=G('exb-title'); if(ti) ti.value=st.title;
  var su=G('exb-subtitle'); if(su) su.value=st.subtitle;
  var th=G('exb-theme'); if(th) th.value=st.theme;
  exportBuilderRenderTemplateSelect();
  exportBuilderRenderLists();
}

function exportBuilderRenderTemplateSelect(){
  var st=_exportBuilderState; if(!st) return;
  var sel=G('exb-template'); if(!sel) return;
  sel.innerHTML=st.templates.map(function(tp){
    return '<option value="'+escH(tp.id)+'"'+(tp.id===st.selectedTemplateId?' selected':'')+'>'
      +escH(tp.name)+(tp.builtin?'':' ('+t('custom')+')')+'</option>';
  }).join('')||'<option value="">'+t('— none —')+'</option>';
  var del=G('exb-tpl-del');
  var sel2=st.templates.find(function(tp){return tp.id===st.selectedTemplateId;});
  if(del) del.style.display=(sel2&&!sel2.builtin)?'':'none';
}

function exportBuilderChipHTML(b,included){
  return '<div class="exb-chip" draggable="true" data-id="'+escH(b.id)+'" '
    +'ondragstart="exportBuilderDragStart(event,\''+b.id+'\')" ondragend="exportBuilderDragEnd(event)" '
    +(included?'':'onclick="exportBuilderAdd(\''+b.id+'\')" ')
    +'style="display:flex;align-items:center;gap:6px;font-size:11px;padding:5px 8px;border-radius:5px;cursor:grab;'
    +'background:var(--bg);border:1px solid '+(included?'var(--accent)':'var(--border)')+';color:var(--text)">'
    +'<span style="color:var(--muted)">⠿</span><span style="flex:1">'+escH(b.label)+'</span>'
    +(included?'<button onclick="exportBuilderRemove(event,\''+b.id+'\')" title="'+escH(t('Remove'))+'" '
      +'style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px">✕</button>':'')
    +'</div>';
}

function exportBuilderRenderLists(){
  var st=_exportBuilderState; if(!st) return;
  var avail=G('exb-available'), inc=G('exb-included');
  if(avail){
    var availBlocks=st.blocks.filter(function(b){return st.included.indexOf(b.id)<0;});
    avail.innerHTML=availBlocks.length?availBlocks.map(function(b){return exportBuilderChipHTML(b,false);}).join('')
      :'<div style="font-size:10px;color:var(--dim);padding:6px">'+t('Everything is included.')+'</div>';
  }
  if(inc){
    inc.innerHTML=st.included.length?st.included.map(function(id){
      var b=st.blocks.find(function(x){return x.id===id;});
      return b?exportBuilderChipHTML(b,true):'';
    }).join('')
      :'<div style="font-size:10px;color:var(--dim);padding:6px">'+t('Drag a block here, or click one on the left.')+'</div>';
  }
}

function exportBuilderDragStart(ev,id){
  _exportDragId=id;
  if(ev.dataTransfer){ ev.dataTransfer.setData('text/plain',id); ev.dataTransfer.effectAllowed='move'; }
  if(ev.target&&ev.target.style) ev.target.style.opacity='.4';
}
function exportBuilderDragEnd(ev){ if(ev.target&&ev.target.style) ev.target.style.opacity=''; }
function exportBuilderDragOver(ev){ ev.preventDefault(); if(ev.dataTransfer) ev.dataTransfer.dropEffect='move'; }
// insertion index within #exb-included based on pointer Y vs each chip's midpoint
// (standard vanilla-JS sortable-list technique) — best-effort, not pixel-perfect
// when dropping a chip back onto its own current neighbours.
function exportBuilderDropIndex(ev){
  var list=G('exb-included'); if(!list) return _exportBuilderState.included.length;
  var kids=[].slice.call(list.children);
  for(var i=0;i<kids.length;i++){
    var r=kids[i].getBoundingClientRect();
    if(ev.clientY<r.top+r.height/2) return i;
  }
  return kids.length;
}
function exportBuilderDrop(ev,zone){
  ev.preventDefault();
  var st=_exportBuilderState; if(!st) return;
  var id=(ev.dataTransfer&&ev.dataTransfer.getData('text/plain'))||_exportDragId; if(!id) return;
  var idx=st.included.indexOf(id);
  if(zone==='available'){
    if(idx>=0) st.included.splice(idx,1);
  } else {
    var insertAt=exportBuilderDropIndex(ev);
    if(idx>=0){ st.included.splice(idx,1); if(insertAt>idx) insertAt--; }
    st.included.splice(insertAt,0,id);
  }
  _exportDragId=null;
  exportBuilderRenderLists();
}
function exportBuilderAdd(id){
  var st=_exportBuilderState; if(!st||st.included.indexOf(id)>=0) return;
  st.included.push(id);
  exportBuilderRenderLists();
}
function exportBuilderRemove(ev,id){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  var st=_exportBuilderState; if(!st) return;
  var idx=st.included.indexOf(id); if(idx>=0) st.included.splice(idx,1);
  exportBuilderRenderLists();
}

function exportBuilderApplyTemplate(templateId){
  var st=_exportBuilderState; if(!st) return;
  var tpl=st.templates.find(function(tp){return tp.id===templateId;}); if(!tpl) return;
  st.selectedTemplateId=tpl.id;
  st.included=tpl.blocks.filter(function(id){return st.blocks.some(function(b){return b.id===id;});});
  exportBuilderRenderTemplateSelect();
  exportBuilderRenderLists();
}
function exportBuilderSetTheme(v){ if(_exportBuilderState) _exportBuilderState.theme=(v==='light'?'light':'app'); }

function exportBuilderSaveTemplate(){
  var st=_exportBuilderState; if(!st) return;
  var nameEl=G('exb-tpl-name'); var name=nameEl?nameEl.value.trim():'';
  if(!name){ alert(t('Name the template first.')); return; }
  if(!st.included.length){ alert(t('Include at least one block first.')); return; }
  var tpl={id:'t'+Date.now(), name:name, blocks:st.included.slice()};
  var custom=exportLoadCustomTemplates(st.deliverableId);
  custom.push(tpl);
  exportSaveCustomTemplates(st.deliverableId,custom);
  st.templates.push({id:tpl.id,name:tpl.name,blocks:tpl.blocks.slice(),builtin:false});
  st.selectedTemplateId=tpl.id;
  if(nameEl) nameEl.value='';
  exportBuilderRenderTemplateSelect();
}
function exportBuilderDeleteTemplate(){
  var st=_exportBuilderState; if(!st) return;
  var tpl=st.templates.find(function(tp){return tp.id===st.selectedTemplateId;});
  if(!tpl||tpl.builtin) return;
  if(!confirm(t('Delete the template "{n}"?',{n:tpl.name}))) return;
  var custom=exportLoadCustomTemplates(st.deliverableId).filter(function(x){return x.id!==tpl.id;});
  exportSaveCustomTemplates(st.deliverableId,custom);
  st.templates=st.templates.filter(function(x){return x.id!==tpl.id;});
  st.selectedTemplateId=st.templates.length?st.templates[0].id:null;
  exportBuilderRenderTemplateSelect();
}

function exportBuilderRun(){
  var st=_exportBuilderState; if(!st) return;
  if(!st.included.length){ alert(t('Include at least one block first.')); return; }
  var titleEl=G('exb-title'), subEl=G('exb-subtitle');
  var title=titleEl&&titleEl.value.trim()?titleEl.value.trim():st.title;
  var subtitle=subEl?subEl.value:st.subtitle;
  var pages=st.included.map(function(id){
    var b=st.blocks.find(function(x){return x.id===id;});
    return b?b.render(st.ctx):'';
  }).filter(function(p){return p;});
  exportOpen({title:title,subtitle:subtitle,brand:exportBrand({theme:st.theme}),pages:pages});
  exportBuilderClose();
}
function exportBuilderClose(){
  var ov=G('export-builder-overlay'); if(ov) ov.classList.remove('show');
  _exportBuilderState=null;
}
