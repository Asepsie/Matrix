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
 *                              running footer + a manual "Print / Save as PDF"
 *                              button). Pure — does not open a window.
 *       exportOpen(spec)    — exportHTML() + window.open. No auto-print — the
 *                              user clicks the button when ready (a surprise
 *                              print dialog on every export was the original
 *                              design; removed per user feedback).
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
import { t, i18nDate } from './i18n.js';

export var EXPORT_PREFS_KEY='eim_export_prefs';        // tiny UI-only key — org name/logo/theme, NOT app state/backups
export var EXPORT_TEMPLATES_KEY='eim_export_templates'; // { [deliverableId]: [{id,name,blocks:[blockId,...]}] } — custom templates only
export var EXPORT_LAST_KEY='eim_export_last';           // { [deliverableId]: {included,theme,format,columns,layout,paper,cover} } — "what I picked last time"

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

/* Per-deliverable "last used" selection. Distinct from a saved TEMPLATE: a
 * template is something the user deliberately named and can re-apply; this is
 * the implicit memory that stops the builder from resetting every single choice
 * on every open (block selection AND theme/format/columns/layout/paper/cover).
 * Same UI-only storage tier as the prefs above — never app state or backups.
 * Stored per deliverableId so the exec pack and the profiles dashboard don't
 * fight over one another's paper size. */
export function exportLoadLast(deliverableId){
  try{
    var all=JSON.parse(localStorage.getItem(EXPORT_LAST_KEY)||'null')||{};
    var s=all[deliverableId];
    if(!s||typeof s!=='object') return null;
    return {
      included: Array.isArray(s.included)?s.included.slice():null,
      theme: (s.theme==='app'||s.theme==='light')?s.theme:null,
      format: typeof s.format==='string'?s.format:null,
      columns: typeof s.columns==='number'?s.columns:null,
      layout: (s.layout==='page'||s.layout==='flow')?s.layout:null,
      paper: typeof s.paper==='string'?s.paper:null,
      cover: typeof s.cover==='boolean'?s.cover:null,
      controls: (s.controls&&typeof s.controls==='object'&&!Array.isArray(s.controls))?s.controls:null
    };
  }catch(e){ return null; }
}
export function exportSaveLast(deliverableId,sel){
  if(!deliverableId||!sel) return;
  try{
    var all=JSON.parse(localStorage.getItem(EXPORT_LAST_KEY)||'null')||{};
    all[deliverableId]={
      included: Array.isArray(sel.included)?sel.included.slice():[],
      theme: sel.theme, format: sel.format, columns: sel.columns,
      layout: sel.layout, paper: sel.paper, cover: sel.cover,
      controls: (sel.controls&&typeof sel.controls==='object')?sel.controls:undefined
    };
    localStorage.setItem(EXPORT_LAST_KEY,JSON.stringify(all));
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
  +'.no-print{display:none!important}'
  +'}';

// XSS-safe "label: value" row — escapes both sides internally so a deliverable
// author can't forget escH() on interpolated data (ARCHITECTURE.md › XSS).
export function exportField(label,value){
  return '<div class="ex-field"><span class="ex-field-l">'+escH(label)+'</span>'
    +'<span class="ex-field-v">'+escH(value==null||value===''?'—':String(value))+'</span></div>';
}

// The date every deliverable stamps, in the user's active app language
// (was hardcoded 'en' — wrong for the FR/ZH locales the app already supports).
export function exportDateStr(d){
  return i18nDate(d||new Date(),{year:'numeric',month:'long',day:'numeric'});
}

/* exportHTMLParts(spec) — the document split into its {css, body} halves.
 *
 * Exists because exportRasterize/exportToSVG need exactly those two pieces to
 * build a foreignObject wrapper, and used to obtain them by REGEX-SCRAPING the
 * finished document string they had just been handed (`<style>(...)</style>` —
 * which silently captured only the FIRST style block). Building both consumers
 * from the same parts removes that round-trip entirely.
 *
 * spec: { title, subtitle, brand, pages:[html,...],
 *         orientation:'portrait'|'landscape', pageSize:'A4'|'A3',
 *         layout:'page'|'flow', cover:bool }
 *
 *  - layout 'page' (default, and what every existing deliverable gets): each
 *    entry in `pages` is one printed page, numbered "N / M".
 *  - layout 'flow': the pages run continuously down one document, each kept
 *    off a page boundary with break-inside:avoid. For short sections this is
 *    the difference between a 2-page pack and a 6-page one with four
 *    near-empty pages — the old behaviour had no way to avoid the latter.
 */
export function exportHTMLParts(spec){
  var s=spec||{};
  var brand=s.brand||exportBrand();
  var V=brand.palette;
  var pages=s.pages||[];
  var title=s.title||'Export';
  var subtitle=s.subtitle||'';
  var orientation=s.orientation==='landscape'?'landscape':'portrait';
  var pageSize=s.pageSize==='A3'?'A3':'A4';
  var layout=s.layout==='flow'?'flow':'page';
  var showCover=s.cover!==false;
  var dateStr=exportDateStr();

  var logoHTML=brand.logo
    ?'<img src="'+escH(brand.logo)+'" alt="" style="height:30px;max-width:140px;object-fit:contain">'
    :'<div style="font-family:IBM Plex Mono,monospace;font-size:13px;letter-spacing:.08em;color:'+safeColor(V.accent)+'">'+escH(brand.name)+'</div>';

  var coverHTML=showCover
    ?'<div class="export-page ex-cover" style="display:flex;flex-direction:column;justify-content:center;align-items:center;min-height:70vh;text-align:center;gap:6px">'
      +logoHTML
      +'<h1 style="font-size:26px;font-weight:700;margin:16px 0 4px;color:'+safeColor(V.text)+'">'+escH(title)+'</h1>'
      +(subtitle?'<div style="font-size:13px;color:'+safeColor(V.muted)+'">'+escH(subtitle)+'</div>':'')
      +'<div style="margin-top:20px;font-family:IBM Plex Mono,monospace;font-size:10px;color:'+safeColor(V.muted)+'">'+escH(dateStr)+'</div>'
      +'</div>'
    :'';

  /* The per-page running head. Chromium does NOT support CSS `@page` margin
   * boxes, so `counter(page)` is unavailable and a genuine browser-generated
   * "page N of M" is impossible. In 'page' layout each `.export-page` IS
   * exactly one printed sheet, so the number is stamped at build time instead
   * — accurate by construction. In 'flow' layout page boundaries are decided
   * by the browser, so no number is claimed rather than printing a wrong one. */
  var total=pages.length;
  var head=function(n){
    return '<div class="ex-pagehead"><span>'+escH(brand.name)+' — '+escH(title)+'</span>'
      +(layout==='page'&&total>1?'<span>'+escH(n)+' / '+escH(total)+'</span>':'<span></span>')
      +'</div>';
  };

  var body;
  if(layout==='flow'){
    body=coverHTML+'<div class="export-page">'+head(1)
      +pages.map(function(p){ return '<section class="ex-block">'+p+'</section>'; }).join('')
      +'</div>';
  } else {
    body=coverHTML+pages.map(function(p,i){
      return '<div class="export-page">'+head(i+1)+p+'</div>';
    }).join('');
  }

  // The footer genuinely REPEATS now. It used to be a single div appended after
  // the last page, so it printed once, at the very bottom of the document —
  // despite being documented as a "running footer". A fixed-position element is
  // the one mechanism Chromium repeats on every printed sheet.
  var footer='<div class="ex-foot">'
    +'<span>'+escH(brand.name)+' — '+escH(title)+'</span><span>'+escH(dateStr)+'</span></div>';

  // manual print trigger — replaces the old auto-popped print dialog (surprised
  // users the moment a tab opened). .no-print keeps it off the printed output itself.
  var printBtn='<button class="no-print" onclick="window.print()" '
    +'style="position:fixed;top:14px;right:14px;z-index:10;font-family:IBM Plex Mono,monospace;font-size:11px;'
    +'padding:7px 14px;border-radius:6px;cursor:pointer;background:'+safeColor(V.accent)+';color:'+safeColor(V.bg)+';border:none;font-weight:700">'
    +'🖨 '+escH(t('Print / Save as PDF'))+'</button>';

  var css='*{box-sizing:border-box;margin:0;padding:0;overflow-wrap:break-word;word-break:break-word}'
    +'html,body{background:'+safeColor(V.bg)+';color:'+safeColor(V.text)+';font-family:Arial,Helvetica,sans-serif;padding:24px}'
    +':root{--bg:'+safeColor(V.bg)+';--surface:'+safeColor(V.surface)+';--border:'+safeColor(V.border)+';--text:'+safeColor(V.text)
    +';--muted:'+safeColor(V.muted)+';--dim:'+safeColor(V.dim)+';--accent:'+safeColor(V.accent)+';--accent2:'+safeColor(V.accent2)
    +';--danger:'+safeColor(V.danger)+';--warn:'+safeColor(V.warn)+'}'
    // A3 pages (currently just the profiles dashboard's multi-column card grid) get a much
    // wider page — 920px split across 4-5 columns is what made that grid look "small and
    // tight" (real user complaint): field values wrapped mid-word for lack of room, even
    // after the equal-column bug above was fixed. A4 (every single-column deliverable) is
    // unaffected. 1600px matches the PNG/SVG raster width already used for this deliverable.
    +'.export-page{max-width:'+(pageSize==='A3'?'1600px':'920px')+';margin:0 auto 20px}'
    +'.ex-pagehead{display:flex;justify-content:space-between;font-family:IBM Plex Mono,monospace;font-size:9px;'
    +'color:var(--muted);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:12px}'
    +'.ex-cover .ex-pagehead{display:none}'
    // keeps a section off a page boundary in flow layout — the whole point of the mode
    +'.ex-block{break-inside:avoid;page-break-inside:avoid;margin-bottom:22px}'
    +'.ex-block:last-child{margin-bottom:0}'
    +'.ex-foot{font-size:9px;color:var(--muted);display:flex;justify-content:space-between;'
    +'font-family:IBM Plex Mono,monospace;margin-top:14px;padding-top:8px;border-top:1px solid var(--border)}'
    +'.ex-field{display:flex;gap:8px;font-size:11px;margin-bottom:2px}'
    +'.ex-field-l{color:var(--muted);min-width:120px;flex-shrink:0}'
    +'.ex-field-v{color:var(--text)}'
    +EXPORT_PRINT_CSS
    // the footer only becomes a true running footer in print; body gains the
    // matching bottom padding so it never sits on top of the last lines.
    +'@media print{@page{size:'+pageSize+' '+orientation+';margin:14mm}'
    +'body{padding-bottom:16mm}'
    +'.ex-foot{position:fixed;bottom:0;left:0;right:0;background:var(--bg);padding:5px 14mm 8px;margin:0}}';

  return {css:css, body:printBtn+body+footer, title:title, brand:brand};
}

// builds the full standalone document (cover + running head/foot + pages) as a
// string. Pure — never opens a window or touches state. See exportHTMLParts for
// the spec shape.
export function exportHTML(spec){
  var p=exportHTMLParts(spec);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+escH(p.title)+'</title>'
    +'<style>'+p.css+'</style></head><body>'+p.body+'</body></html>';
}

// exportOpen(spec) — builds the document and opens it in a new tab. No more
// auto-triggered print (removed — it surprised users with a print dialog the
// instant an export tab opened); the tab now shows a themed preview with an
// explicit "Print / Save as PDF" button (see exportHTML's printBtn) instead.
export function exportOpen(spec){
  var s=spec||{};
  var win=window.open('','_blank');
  if(!win){ alert(t('Pop-up blocked — please allow pop-ups.')); return null; }
  win.document.write(exportHTML(s));
  win.document.close();
  return win;
}

// downloads arbitrary text/blob content as a file — the one place every format
// (HTML/PNG/SVG) triggers a browser download from, instead of each deliverable
// hand-rolling its own Blob+<a>+click.
function exportDownloadBlob(content,mime,filename){
  var blob=content instanceof Blob?content:new Blob([content],{type:mime});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
}

/* Measures an exportHTML() document by rendering it into a hidden iframe and
 * calls back with {css, body, height}. Shared by the PNG and SVG paths, which
 * previously each hand-rolled the same iframe + fixed-setTimeout dance AND
 * regex-scraped the CSS/body back out of the finished document string.
 *
 * The old fixed 200/300ms waits were a guess — a slow machine or an unloaded
 * webfont measured a wrong height and silently produced a clipped image. This
 * waits on document.fonts.ready (with its own timeout, since a hung font load
 * must not hang the export) before measuring.
 */
function _exportMeasure(spec,width,cb){
  var parts=exportHTMLParts(spec);
  // .no-print covers the print button; the captured image is the deliverable,
  // not the interactive affordance around it.
  var css=parts.css+'.no-print{display:none!important}';
  var doc='<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'+css+'</style></head><body>'+parts.body+'</body></html>';

  var iframe=document.createElement('iframe');
  iframe.style.cssText='position:fixed;left:-9999px;top:-9999px;width:'+width+'px;height:10px;border:none;visibility:hidden';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(doc);
  iframe.contentDocument.close();

  var done=false;
  var finish=function(){
    if(done) return; done=true;
    var h=0;
    try{ h=iframe.contentDocument.body.scrollHeight; }catch(e){}
    try{ document.body.removeChild(iframe); }catch(e){}
    cb({css:css, body:parts.body, height:h||600});
  };
  var fonts=null;
  try{ fonts=iframe.contentDocument.fonts; }catch(e){}
  if(fonts&&fonts.ready&&typeof fonts.ready.then==='function'){
    fonts.ready.then(function(){ setTimeout(finish,60); },finish);
    setTimeout(finish,2500);   // a hung font load must not hang the export
  } else {
    setTimeout(finish,350);
  }
}

// Chromium refuses to allocate a canvas past these limits and hands back a
// blank one (or null from toBlob) with no error — a tall multi-page pack at
// width 1600 x scale 2 crosses the area cap easily. Scale down instead of
// silently producing a corrupt file.
var EXPORT_MAX_CANVAS_DIM=16384;
var EXPORT_MAX_CANVAS_AREA=268435456;
function _exportSafeScale(w,h,want){
  var scale=want||2;
  scale=Math.min(scale, EXPORT_MAX_CANVAS_DIM/Math.max(w,h));
  scale=Math.min(scale, Math.sqrt(EXPORT_MAX_CANVAS_AREA/(w*h)));
  return Math.max(0.5, scale);
}

// exportRasterize(spec, opts) — renders an export document to a PNG via a
// hidden iframe → SVG foreignObject → canvas, generalised from what used to be
// profiles.js's exportProfilesDashboardPNG (one copy, reused by every
// deliverable's PNG format option). opts: {width, filenameBase, bg, onerror}.
// Best-effort — some browsers block foreignObject→canvas for security
// (tainted canvas); onerror lets the caller fall back (e.g. to HTML download).
function exportRasterize(spec,opts){
  var o=opts||{};
  var width=o.width||1600;
  var filenameBase=o.filenameBase||'export';
  var bg=o.bg||'#0f0f11';
  var fail=function(){
    if(o.onerror) o.onerror();
    else alert(t('PNG export is limited by browser security. Try the HTML or PDF format instead.'));
  };

  _exportMeasure(spec,width,function(m){
    var h=m.height;
    var svgStr='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+h+'">'
      +'<foreignObject width="'+width+'" height="'+h+'">'
      +'<body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:16px;background:'+safeColor(bg,'#0f0f11')+'">'
      +'<style>'+m.css+'</style>'
      +m.body
      +'</body></foreignObject></svg>';
    var img=new Image();
    img.onload=function(){
      try{
        var scale=_exportSafeScale(width,h,2);
        var canvas=document.createElement('canvas');
        canvas.width=Math.floor(width*scale);canvas.height=Math.floor(h*scale);
        var cctx=canvas.getContext('2d');
        cctx.scale(scale,scale);
        cctx.drawImage(img,0,0);
        canvas.toBlob(function(blob){
          // toBlob hands back null when the canvas could not be allocated or
          // is tainted. Unchecked, exportDownloadBlob wrapped that null into a
          // Blob containing the literal text "null" and downloaded it as .png.
          if(!blob){ fail(); return; }
          exportDownloadBlob(blob,'image/png',filenameBase+'.png');
        },'image/png');
      }catch(e){ fail(); }
    };
    img.onerror=fail;
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgStr);
  });
}

// exportToSVG(spec, opts) — wraps an export document as a standalone SVG
// (foreignObject), generalised from profileExportSVG/exportProfilesDashboardSVG.
// opts: {width, filenameBase, bg}.
function exportToSVG(spec,opts){
  var o=opts||{};
  var width=o.width||488;
  var filenameBase=o.filenameBase||'export';
  var bg=safeColor(o.bg||'#0f0f11','#0f0f11');

  _exportMeasure(spec,width,function(m){
    var h=m.height+40;
    var svgStr='<?xml version="1.0" encoding="UTF-8"?>\n'
      +'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
      +' width="'+width+'" height="'+h+'">\n'
      +'<rect width="'+width+'" height="'+h+'" fill="'+bg+'"/>\n'
      +'<foreignObject x="0" y="0" width="'+width+'" height="'+h+'">\n'
      +'<body xmlns="http://www.w3.org/1999/xhtml"'
      +' style="margin:0;padding:24px;background:'+bg+';font-family:Arial,sans-serif;'
      +'-webkit-print-color-adjust:exact;print-color-adjust:exact">\n'
      +'<style>'+m.css+'</style>\n'
      +m.body
      +'\n</body>\n'
      +'</foreignObject>\n'
      +'</svg>';
    exportDownloadBlob(svgStr,'image/svg+xml;charset=utf-8',filenameBase+'.svg');
  });
}

/* ── THE BUILDER — drag-and-drop content/order/theme/format picker ───────────
 * One modal (#export-builder-overlay in index.html) shared by every deliverable.
 * A deliverable calls exportOpenBuilder({deliverableId, title, subtitleDefault,
 * blocks, ctx, builtinTemplates, formats, columns, composeRender, orientation,
 * pageSize, filename, rasterWidth}) instead of exportOpen() directly; the user
 * picks a template (or freely drags blocks between Available/Included), sets
 * the theme/format/columns, optionally saves their selection as a named
 * template, then hits Export.
 *
 * Two block-composition modes (a deliverable picks ONE by whether it passes
 * `composeRender`):
 *  - default (exec.js) — each included block IS one page: pages=included.map(
 *    id => block.render(ctx)). Good when blocks are independent report
 *    sections (scorecard/spend/burn/…).
 *  - composeRender(includedIds, ctx) (profiles.js) — the deliverable gets the
 *    ordered included-id list itself and builds pages however it needs to
 *    (e.g. one page of MANY cards, each card honouring the SAME included
 *    field list) — for content that isn't "one block = one page" but "one
 *    block = one field-group toggle applied uniformly per entity". Must
 *    return a string (one page) or an array of strings (pages).
 *
 * formats:[{id,label}] (default just PDF) adds a FORMAT select; 'pdf' opens
 * exportOpen, 'html' downloads exportHTML() as a file, 'png'/'svg' rasterize
 * via exportRasterize/exportToSVG. columns:{default,options:[...]} adds a
 * COLUMNS select and exposes the chosen value as ctx.columns to render/
 * composeRender — for grid-style deliverables (the profiles dashboard).
 */
var _exportBuilderState=null;   // see exportOpenBuilder for the shape
var _exportDragId=null;         // fallback for browsers that restrict dataTransfer reads outside 'drop'
var _exportPreviewTimer=null;

// The four paper choices, as one id so a single select drives both @page
// dimensions. Deliverables still pass orientation/pageSize (unchanged API);
// this just gives the USER the control they never had — the exec pack could
// not be landscaped at all before, whatever the content needed.
var EXPORT_PAPERS=[
  {id:'a4p', pageSize:'A4', orientation:'portrait'},
  {id:'a4l', pageSize:'A4', orientation:'landscape'},
  {id:'a3p', pageSize:'A3', orientation:'portrait'},
  {id:'a3l', pageSize:'A3', orientation:'landscape'}
];
function exportPaperLabel(p){
  return p.pageSize+' '+(p.orientation==='landscape'?t('landscape'):t('portrait'));
}
function exportPaperById(id){
  for(var i=0;i<EXPORT_PAPERS.length;i++) if(EXPORT_PAPERS[i].id===id) return EXPORT_PAPERS[i];
  return EXPORT_PAPERS[0];
}
function exportPaperIdFor(pageSize,orientation){
  return (pageSize==='A3'?'a3':'a4')+(orientation==='landscape'?'l':'p');
}

function exportOpenBuilder(spec){
  var s=spec||{};
  var prefs=exportLoadPrefs();
  var custom=exportLoadCustomTemplates(s.deliverableId).map(function(x){return {id:x.id,name:x.name,blocks:x.blocks.slice(),builtin:false};});
  var builtins=(s.builtinTemplates||[]).map(function(x){return {id:x.id,name:x.name,blocks:x.blocks.slice(),builtin:true};});
  var templates=builtins.concat(custom);
  var first=templates[0];
  var blocks=s.blocks||[];
  var known=function(id){ return blocks.some(function(b){return b.id===id;}); };
  var formats=(s.formats&&s.formats.length)?s.formats:[{id:'pdf',label:t('PDF (print)')}];
  var columnsConfig=s.columns||null;
  var last=exportLoadLast(s.deliverableId);

  // The deliverable's own defaults, then whatever the user last chose for THIS
  // deliverable on top. Without this the builder threw away every choice on
  // close, so anyone exporting the same pack twice re-did the whole picker.
  var defPaper=exportPaperIdFor(s.pageSize,s.orientation);
  var included=first?first.blocks.filter(known):blocks.map(function(b){return b.id;});
  var selectedTemplateId=first?first.id:null;
  if(last&&last.included&&last.included.length){
    var restored=last.included.filter(known);
    // a build that renamed/removed blocks must not resurrect dead ids, and an
    // empty result means the registry changed enough that the default is safer
    if(restored.length){ included=restored; selectedTemplateId=null; }
  }

  _exportBuilderState={
    deliverableId: s.deliverableId,
    title: s.title||'Export',
    subtitle: s.subtitleDefault||'',
    theme: (last&&last.theme)||prefs.theme,
    format: (last&&last.format&&formats.some(function(f){return f.id===last.format;}))?last.format:formats[0].id,
    formats: formats,
    columnsConfig: columnsConfig,
    columns: columnsConfig?((last&&last.columns&&columnsConfig.options.indexOf(last.columns)>=0)?last.columns:columnsConfig.default):null,
    layout: (last&&last.layout)||(s.layout==='flow'?'flow':'page'),
    paper: (last&&last.paper)||defPaper,
    cover: (last&&typeof last.cover==='boolean')?last.cover:(s.cover!==false),
    controlsSpec: s.controls||null,
    controlValues: (last&&last.controls&&typeof last.controls==='object')?Object.assign({},last.controls):{},
    blocks: blocks,
    ctx: s.ctx||{},
    templates: templates,
    selectedTemplateId: selectedTemplateId,
    included: included,
    composeRender: typeof s.composeRender==='function'?s.composeRender:null,
    filename: s.filename, rasterWidth: s.rasterWidth,
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

  var fmtRow=G('exb-format-row'), fmtSel=G('exb-format');
  if(fmtRow) fmtRow.style.display=st.formats.length>1?'':'none';
  if(fmtSel){
    fmtSel.innerHTML=st.formats.map(function(f){return '<option value="'+escH(f.id)+'">'+escH(f.label)+'</option>';}).join('');
    fmtSel.value=st.format;
  }

  var colRow=G('exb-columns-row'), colSel=G('exb-columns');
  if(colRow) colRow.style.display=st.columnsConfig?'':'none';
  if(colSel&&st.columnsConfig){
    colSel.innerHTML=st.columnsConfig.options.map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
    colSel.value=st.columns;
  }

  var lay=G('exb-layout'); if(lay) lay.value=st.layout;
  var pap=G('exb-paper');
  if(pap){
    pap.innerHTML=EXPORT_PAPERS.map(function(p){
      return '<option value="'+p.id+'">'+escH(exportPaperLabel(p))+'</option>';
    }).join('');
    pap.value=st.paper;
  }
  var cov=G('exb-cover'); if(cov) cov.checked=!!st.cover;

  exportBuilderRenderControls();
  exportBuilderRenderTemplateSelect();
  exportBuilderRenderLists();
}

/* Per-deliverable EXTRA controls — the generic version of what `columns` does
 * for one deliverable. A spec passes `controls:` either as an array or, when
 * one control's options depend on another's value, as a FUNCTION of the current
 * values that is re-evaluated on every change:
 *
 *   controls:[{id, label, type:'select'|'toggle', options:[{v,label}], value}]
 *   controls:function(values){ return [ ...same shape... ]; }
 *
 * Chosen values are merged into `ctx` (both spread directly — ctx.scope — and
 * under ctx.controls) and persisted with the rest of the last-used selection.
 * The function form is what lets People Analytics offer dimension A × B ×
 * chart-template pickers, where the available templates depend on the two
 * dimensions already chosen.
 *
 * NB the spread means a control id shadows a ctx key of the same name — avoid
 * `theme`/`columns`/`layout`, which the builder already writes.
 */
function exportBuilderControls(){
  var st=_exportBuilderState; if(!st||!st.controlsSpec) return [];
  var list=(typeof st.controlsSpec==='function')
    ? st.controlsSpec(st.controlValues||{})
    : st.controlsSpec;
  list=list||[];
  // Clamp each value to something the control can actually represent: a stale
  // last-used value (or one invalidated by another control changing) falls back
  // to the spec's own default rather than silently rendering nothing.
  list.forEach(function(c){
    var cur=st.controlValues[c.id];
    var ok;
    if(c.type==='toggle') ok=(typeof cur==='boolean');
    else ok=(cur!=null)&&(c.options||[]).some(function(o){return String(o.v)===String(cur);});
    if(!ok) st.controlValues[c.id]=c.value;
  });
  return list;
}
function exportBuilderRenderControls(){
  var wrap=G('exb-controls'); if(!wrap) return;
  var st=_exportBuilderState;
  var list=exportBuilderControls();
  if(!st||!list.length){ wrap.style.display='none'; wrap.innerHTML=''; return; }
  wrap.style.display='flex';   // explicit: clearing the inline style would fall back to block
  wrap.innerHTML=list.map(function(c){
    var val=st.controlValues[c.id];
    if(c.type==='toggle'){
      return '<div class="field" style="flex:1;min-width:170px"><label>'+escH(c.label)+'</label>'
        +'<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text);padding-top:5px">'
        +'<input type="checkbox" data-cid="'+escH(c.id)+'"'+(val?' checked':'')
        +' onchange="exportBuilderSetControl(this,this.checked)"'
        +' style="accent-color:var(--accent);flex:0 0 auto;width:14px;height:14px;min-width:0;margin:0">'
        +'<span>'+escH(c.hint||'')+'</span></div></div>';
    }
    return '<div class="field" style="flex:1;min-width:170px"><label>'+escH(c.label)+'</label>'
      +'<select data-cid="'+escH(c.id)+'" onchange="exportBuilderSetControl(this,this.value)">'
      +(c.options||[]).map(function(o){
        return '<option value="'+escH(o.v)+'"'+(String(o.v)===String(val)?' selected':'')+'>'+escH(o.label)+'</option>';
      }).join('')
      +'</select></div>';
  }).join('');
}
// element-based (id read off data-cid), same rule as the block chips
function exportBuilderSetControl(el,value){
  var st=_exportBuilderState; if(!st) return;
  var id=el&&el.getAttribute?el.getAttribute('data-cid'):null; if(!id) return;
  st.controlValues[id]=value;
  // re-render: a dependent control's option list may have just changed
  exportBuilderRenderControls();
  exportBuilderSchedulePreview();
}
function exportBuilderSetFormat(v){ if(_exportBuilderState) _exportBuilderState.format=v; exportBuilderSchedulePreview(); }
function exportBuilderSetColumns(v){ if(_exportBuilderState) _exportBuilderState.columns=+v; exportBuilderSchedulePreview(); }
function exportBuilderSetLayout(v){ if(_exportBuilderState) _exportBuilderState.layout=(v==='flow'?'flow':'page'); exportBuilderSchedulePreview(); }
function exportBuilderSetPaper(v){ if(_exportBuilderState) _exportBuilderState.paper=exportPaperById(v).id; exportBuilderSchedulePreview(); }
function exportBuilderSetCover(v){ if(_exportBuilderState) _exportBuilderState.cover=!!v; exportBuilderSchedulePreview(); }

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

// Handlers take the ELEMENT, never the id — the id is read back off data-id at
// call time. The previous form interpolated the raw block id into a JS string
// literal inside an attribute (`onclick="exportBuilderAdd('<id>')"`) while
// escaping it only for data-id, so an id containing a quote broke out of the
// handler. Harmless while every id is a hardcoded literal, but the obvious next
// step for this builder is data-derived blocks ("pick which projects to
// include"), where ids come from entity names — i.e. from synced, hostile-
// capable input. Closed at the source instead.
function exportBuilderChipId(el){
  var chip=el&&el.closest?el.closest('.exb-chip'):null;
  return chip?chip.getAttribute('data-id'):null;
}
function exportBuilderChipHTML(b,included){
  return '<div class="exb-chip" draggable="true" data-id="'+escH(b.id)+'" '
    +'ondragstart="exportBuilderDragStart(event,this)" ondragend="exportBuilderDragEnd(event)" '
    +(included?'':'onclick="exportBuilderAdd(this)" ')
    +'style="display:flex;align-items:center;gap:6px;font-size:11px;padding:5px 8px;border-radius:5px;cursor:grab;'
    +'background:var(--bg);border:1px solid '+(included?'var(--accent)':'var(--border)')+';color:var(--text)">'
    +'<span style="color:var(--muted)">⠿</span><span style="flex:1">'+escH(b.label)+'</span>'
    +(included?'<button onclick="exportBuilderRemove(event,this)" title="'+escH(t('Remove'))+'" '
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
  exportBuilderSchedulePreview();
}

function exportBuilderDragStart(ev,el){
  var id=exportBuilderChipId(el)||(el&&el.getAttribute?el.getAttribute('data-id'):null);
  _exportDragId=id;
  if(ev.dataTransfer&&id){ ev.dataTransfer.setData('text/plain',id); ev.dataTransfer.effectAllowed='move'; }
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
function exportBuilderAdd(el){
  var id=exportBuilderChipId(el); if(!id) return;
  var st=_exportBuilderState; if(!st||st.included.indexOf(id)>=0) return;
  st.included.push(id);
  exportBuilderRenderLists();
}
function exportBuilderRemove(ev,el){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  var id=exportBuilderChipId(el); if(!id) return;
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
function exportBuilderSetTheme(v){ if(_exportBuilderState) _exportBuilderState.theme=(v==='light'?'light':'app'); exportBuilderSchedulePreview(); }

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

/* Builds the exportHTML spec from the current picker state. ONE path, shared by
 * the live preview and the real export, so what the preview shows is by
 * construction what gets produced.
 *
 * Every block render is individually guarded: a single throwing block used to
 * abort the entire export with nothing but a console error, leaving the modal
 * open and the user with no output and no explanation. Now the rest of the
 * document still renders and the failed section says so in place. */
function exportBuilderComposeSpec(){
  var st=_exportBuilderState; if(!st) return null;
  var titleEl=G('exb-title'), subEl=G('exb-subtitle');
  var title=titleEl&&titleEl.value.trim()?titleEl.value.trim():st.title;
  var subtitle=subEl?subEl.value.trim():st.subtitle;
  var brand=exportBrand({theme:st.theme});
  var paper=exportPaperById(st.paper);
  exportBuilderControls();   // clamps controlValues before they are read
  var mergedCtx=Object.assign({},st.ctx,{theme:st.theme,columns:st.columns,layout:st.layout},
    st.controlValues,{controls:st.controlValues});

  var failed=[];
  var oops=function(label){
    failed.push(label);
    return '<div style="border:1px solid var(--danger);border-radius:6px;padding:10px;font-size:11px;color:var(--danger)">'
      +escH(t('“{b}” could not be rendered and was left out.',{b:label}))+'</div>';
  };

  var pages;
  if(st.composeRender){
    try{
      var out=st.composeRender(st.included.slice(),mergedCtx);
      pages=(Array.isArray(out)?out:[out]).filter(function(p){return p;});
    }catch(e){ pages=[oops(title)]; }
  } else {
    pages=st.included.map(function(id){
      var b=st.blocks.find(function(x){return x.id===id;});
      if(!b) return '';
      try{ return b.render(mergedCtx)||''; }
      catch(e){ return oops(b.label||b.id); }
    }).filter(function(p){return p;});
  }

  return {
    spec:{title:title, subtitle:subtitle, brand:brand, pages:pages,
      orientation:paper.orientation, pageSize:paper.pageSize,
      layout:st.layout, cover:st.cover},
    brand:brand, title:title, ctx:mergedCtx, failed:failed
  };
}

/* Live preview. The builder previously gave no sight of the result at all —
 * theme, layout, paper and block order were all guesswork until a tab opened,
 * which is most of why the controls felt like trial and error. Rendered into a
 * sandboxed iframe srcdoc; debounced because a render walks the whole dataset.
 *
 * NOTE (ARCHITECTURE › Export engine, "Verify gotcha"): an iframe srcdoc
 * EXECUTES inline script. exportHTML is script-free by design since autoprint
 * was removed — keep it that way, or this preview starts firing window.print()
 * on every keystroke. sandbox="allow-same-origin" (no allow-scripts) is the
 * belt to that braces. */
function exportBuilderSchedulePreview(){
  if(_exportPreviewTimer) clearTimeout(_exportPreviewTimer);
  _exportPreviewTimer=setTimeout(exportBuilderRenderPreview,220);
}
function exportBuilderRenderPreview(){
  var frame=G('exb-preview'); if(!frame) return;
  var st=_exportBuilderState;
  var note=G('exb-preview-note');
  if(!st||!st.included.length){
    frame.removeAttribute('srcdoc');
    if(note) note.textContent=t('Nothing included yet.');
    return;
  }
  var built;
  try{ built=exportBuilderComposeSpec(); }catch(e){ built=null; }
  if(!built){ return; }
  frame.setAttribute('srcdoc',exportHTML(built.spec));
  if(note){
    var n=built.spec.pages.length;
    note.textContent=st.layout==='flow'
      ? t('{n} section(s), continuous flow',{n:n})
      : t('{n} page(s) + cover',{n:n});
    if(!st.cover&&st.layout!=='flow') note.textContent=t('{n} page(s), no cover',{n:n});
  }
}

function exportBuilderRun(){
  var st=_exportBuilderState; if(!st) return;
  if(!st.included.length){ alert(t('Include at least one block first.')); return; }
  var built=exportBuilderComposeSpec();
  if(!built||!built.spec.pages.length){ alert(t('Nothing to export with the current selection.')); return; }

  var htmlSpec=built.spec, brand=built.brand;
  // date-stamped so a folder of exports of the same deliverable stays sortable
  // and successive downloads do not collide as "pack (1).pdf", "pack (2).pdf"
  var stamp=new Date().toISOString().slice(0,10);
  var filenameBase=((st.filename||built.title).replace(/[^a-z0-9]/gi,'_').toLowerCase()||'export')+'_'+stamp;

  // remember the whole picker state for next time — see exportSaveLast
  exportSaveLast(st.deliverableId,{
    included:st.included, theme:st.theme, format:st.format,
    columns:st.columns, layout:st.layout, paper:st.paper, cover:st.cover,
    controls:st.controlValues
  });

  /* A format may carry its own `run` handler. Needed because some deliverables
   * already emit something BETTER than this engine's generic converters: the
   * org chart and the Gantt build NATIVE SVG (real vector shapes, rasterisable
   * at 8x), whereas exportToSVG/exportRasterize wrap an HTML document in a
   * foreignObject. Forcing those through the generic path to "unify" them would
   * be a straight quality downgrade — so the generic path is the DEFAULT, not a
   * requirement, and a deliverable keeps its own renderer while still getting
   * the shared picker, branding, theme, title/subtitle and preview. */
  var fmt=st.formats.find(function(f){return f.id===st.format;});
  if(fmt&&typeof fmt.run==='function'){
    try{
      fmt.run({spec:htmlSpec, brand:brand, ctx:built.ctx,
        included:st.included.slice(), filenameBase:filenameBase});
    }catch(e){ alert(t('That export could not be generated.')); }
  } else if(st.format==='html'){
    exportDownloadBlob(exportHTML(htmlSpec),'text/html;charset=utf-8',filenameBase+'.html');
  } else if(st.format==='png'){
    exportRasterize(htmlSpec,{filenameBase:filenameBase,width:st.rasterWidth,bg:brand.palette.bg});
  } else if(st.format==='svg'){
    exportToSVG(htmlSpec,{filenameBase:filenameBase,width:st.rasterWidth,bg:brand.palette.bg});
  } else {
    exportOpen(htmlSpec);
  }
  exportBuilderClose();
}
function exportBuilderClose(){
  var ov=G('export-builder-overlay'); if(ov) ov.classList.remove('show');
  if(_exportPreviewTimer){ clearTimeout(_exportPreviewTimer); _exportPreviewTimer=null; }
  var frame=G('exb-preview'); if(frame) frame.removeAttribute('srcdoc');
  _exportBuilderState=null;
}
