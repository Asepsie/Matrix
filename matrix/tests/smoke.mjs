/* Smoke-test safety net — "does the built app actually run?"
 *
 * A green `node build.js` only PROVES the bundle parses (vm.Script), not that it
 * runs: the browser can still throw at top-level (the `*​/`-in-comment trap) or on
 * a click that calls a function nobody defined (the exportTimelinePDF bug). This
 * test boots the REAL dist/matrix.html in your installed Chrome/Edge, seeds a
 * dataset, visits every rail view, and asserts:
 *
 *   1. the app boots with NO uncaught exception (pageerror),
 *   2. no uncaught exception fires while navigating any view,
 *   3. every wired handler (onclick/onchange/…) in the live DOM references a
 *      function that ACTUALLY EXISTS  ← catches the "is not defined" class,
 *   4. every READY export deliverable opens and renders its blocks.
 *
 * It is the ship gate: `npm run verify` = build + unit tests + this.
 *
 * No browser download: it drives a browser already on the machine. Override with
 * env PUPPETEER_EXECUTABLE_PATH or CHROME_PATH if auto-detection misses yours.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');

// ── find an installed Chromium-family browser (no download) ──────────────────
function findBrowser() {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  const candidates = [
    path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.join(pfx86, 'Google/Chrome/Application/chrome.exe'),
    local && path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(pfx86, 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

// ── tiny static server for dist/ ─────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/' || rel === '') rel = '/matrix.html';
      const file = path.join(DIST, rel);
      if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
      try {
        const buf = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ── deterministic seed injected into the page (explicit ids: makeEngineer does
//    NOT auto-increment id — that's addEngineer's job — so hand-built entities
//    must set their own or they collide onto one person) ──────────────────────
function seedScript() {
  return `
    engGroups.length = 0;
    engGroups.push({id:1,name:'Firmware',color:'#5be5c8'},{id:2,name:'Hardware',color:'#c8f135'});
    engineers.length = 0;
    function _mk(id,name,role,gid,cost,skills){var e=makeEngineer();e.id=id;e.name=name;e.role=role;e.groupId=gid;e.monthlyCost=cost;e.location='Paris';e.skills=skills;return e;}
    engineers.push(
      _mk(1,'Ann Lee','Lead FW',1,9000,[{name:'RTOS',cat:'crit',domain:'Firmware',level:5},{name:'C++',cat:'diff',domain:'Firmware',level:4}]),
      _mk(2,'Bob Ng','FW Eng',1,7000,[{name:'C++',cat:'diff',domain:'Firmware',level:3},{name:'CI/CD',cat:'mand',domain:'Tools',level:2}]),
      _mk(3,'Cara Diaz','HW Eng',2,8000,[{name:'PCB',cat:'crit',domain:'Hardware',level:4},{name:'RF',cat:'crit',domain:'Hardware',level:5}])
    );
    if (typeof nextEngId !== 'undefined') nextEngId = 4;
    projects.length = 0;
    function _mp(id,name,color,rev){var p=makeProject();p.id=id;p.name=name;p.color=color;p.impactEur=rev;p.lifecycle='active';p.risks=[{sev:4,occ:3,det:2}];return p;}
    projects.push(_mp(1,'Alpha','#c8f135',2.5),_mp(2,'Beta','#5be5c8',1.2),_mp(3,'Gamma','#a78bfa',0.8));
    if (typeof nextProjId !== 'undefined') nextProjId = 4;
    allocRows.length = 0;
    var _months = ['2026-09','2026-10','2026-11','2026-12'];
    var _aid = 1;
    function _alloc(engId,projId,vals){var r=makeAllocRow();r.id=_aid++;r.engId=engId;r.projectId=projId;r.allocs={};_months.forEach(function(m,i){r.allocs[m]=vals[i];});allocRows.push(r);}
    _alloc(1,1,[0.8,0.8,0.6,0.5]); _alloc(1,2,[0.5,0.4,0.5,0.3]); _alloc(2,1,[0.5,0.5,0.4,0.4]); _alloc(3,3,[0.7,0.6,0.6,0.5]);
    if (typeof nextAllocId !== 'undefined') nextAllocId = _aid;
    var _s=document.getElementById('res-start'), _e=document.getElementById('res-end');
    if(_s){_s.value='2026-09';} if(_e){_e.value='2026-12';}
    saveState();
    if (typeof _invalidateMemo === 'function') _invalidateMemo();
    return {engineers: engineers.length, projects: projects.length, allocRows: allocRows.length, months: (typeof getMonthRange==='function'?getMonthRange().length:0)};
  `;
}

// Load the realistic demo dataset (40 people / 6 projects) if the asset exists.
async function loadDemoState() {
  try {
    const raw = await readFile(path.join(__dirname, '..', 'demo', 'matrix_demo_backup.json'), 'utf8');
    const b = JSON.parse(raw);
    return (b && b.state) ? b.state : null;
  } catch { return null; }
}

// Apply a full-backup `state` in the page — the headless-friendly core of
// importFullBackup (no file input / confirm / IndexedDB photo swap). Runs in the
// page, so it references the app's globals directly.
function applyBackupState(d) {
  try {
    if (d.gateConfig && typeof d.gateConfig === 'object') { try { gateConfig = d.gateConfig; if (typeof sanitiseGateConfig === 'function') sanitiseGateConfig(); } catch (e) { if (typeof makeGateConfig === 'function') gateConfig = makeGateConfig(); } }
    if (d.projects) { projects = d.projects; if (typeof sanitiseProjects === 'function') sanitiseProjects(); }
    if (d.sections) sections = d.sections;
    if (d.engineers) { engineers = d.engineers; if (typeof sanitiseEngineer === 'function') engineers.forEach(function (e) { sanitiseEngineer(e); }); }
    if (d.engGroups) engGroups = d.engGroups;
    if (d.allocRows) allocRows = d.allocRows;
    if (d.skillDomains) skillDomains = d.skillDomains;
    if (d.skillCats && Array.isArray(d.skillCats) && d.skillCats.length) skillCats = d.skillCats;
    if (d.ktPlans) _ktPlans = d.ktPlans;
    _anViews = Array.isArray(d.anViews) ? d.anViews : null;   // dataset swap → adopt or re-seed defaults
    if (d.nineBoxPlacements && typeof d.nineBoxPlacements === 'object') _nineBoxPlacements = d.nineBoxPlacements;
    if (d.nineBoxHistory && typeof d.nineBoxHistory === 'object') _nineBoxHistory = d.nineBoxHistory;
    if (typeof nbEnsureHistory === 'function') { try { nbEnsureHistory(); } catch (e) {} }
    if (d.discPlacements && typeof d.discPlacements === 'object') _discPlacements = d.discPlacements;
    var _s = document.getElementById('res-start'), _e = document.getElementById('res-end'), _tt = document.getElementById('res-title-input');
    if (_s && d.resStart) _s.value = d.resStart;
    if (_e && d.resEnd) _e.value = d.resEnd;
    if (_tt && d.resTitle) _tt.value = d.resTitle;
    // The demo predates the lifecycle model → mark every project active so its
    // capacity isn't suppressed and the balancer/timeline views show real load.
    projects.forEach(function (p) { p.lifecycle = 'active'; });
    try { if (typeof uidMigrate === 'function') uidMigrate(); } catch (e) {}
    if (typeof saveState === 'function') saveState();
    if (typeof _invalidateMemo === 'function') _invalidateMemo();
    return { engineers: engineers.length, projects: projects.length, allocRows: allocRows.length, nineBox: Object.keys(_nineBoxPlacements || {}).length, disc: Object.keys(_discPlacements || {}).length, months: (typeof getMonthRange === 'function' ? getMonthRange().length : 0) };
  } catch (err) { return { error: String(err && err.stack || err) }; }
}

// ── the handler-existence scan (runs in the page over the LIVE dom) ──────────
function handlerScanScript() {
  return `(() => {
    const ATTRS = ['onclick','onchange','oninput','onkeydown','onkeyup','onmouseenter','onmouseleave','onsubmit','ondblclick'];
    const KEYWORDS = new Set(['if','for','while','switch','return','function','this','new','typeof','void','catch','else','do','delete','in','instanceof','event','true','false','null','undefined']);
    const bad = [];
    const seen = new Set();
    document.querySelectorAll('['+ATTRS.join('],[')+']').forEach(el => {
      ATTRS.forEach(a => {
        const v = el.getAttribute(a); if (!v) return;
        const re = /(?:^|[;{}()\\s=&|!?:,])([A-Za-z_$][\\w$]*)\\s*\\(/g; let m;
        while ((m = re.exec(v))) {
          const name = m[1];
          if (KEYWORDS.has(name) || seen.has(name)) continue;
          // Resolve the name the way an inline handler does: bare identifiers see
          // the global object AND the global lexical scope (top-level const/let are
          // NOT window properties but ARE reachable), so a plain window[name] check
          // false-flags every const-declared function. Direct eval at page global
          // scope resolves both records exactly like the handler will at click time.
          let isFn = false;
          try { isFn = (eval('typeof ' + name) === 'function'); } catch (e) { isFn = false; }
          if (!isFn) {
            seen.add(name);
            bad.push({ name, attr: a, snippet: v.slice(0, 70) });
          }
        }
      });
    });
    return bad;
  })()`;
}

const RED = s => '\x1b[31m' + s + '\x1b[0m';
const GREEN = s => '\x1b[32m' + s + '\x1b[0m';
const DIM = s => '\x1b[2m' + s + '\x1b[0m';

async function main() {
  if (!existsSync(path.join(DIST, 'matrix.html'))) {
    console.error(RED('✗ dist/matrix.html not found — run `node build.js` first.'));
    process.exit(1);
  }
  const exe = findBrowser();
  if (!exe) {
    console.error(RED('✗ No Chrome/Edge found. Set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH to a browser executable.'));
    process.exit(1);
  }

  const failures = [];
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/matrix.html`;

  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  // console.error from the app, minus benign, framework-external noise
  const IGNORE = ['Failed to load resource', 'about:srcdoc', 'sandboxed', 'favicon', 'net::ERR'];
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const t = msg.text();
    if (IGNORE.some(s => t.includes(s))) return;
    consoleErrors.push(t);
  });

  try {
    await page.goto(base, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
      "typeof RAIL_DOMAINS!=='undefined' && typeof railGo==='function' && typeof makeEngineer==='function' && typeof saveState==='function'",
      { timeout: 20000 }
    );

    const bootErrors = pageErrors.length;
    if (bootErrors) failures.push(`boot threw ${bootErrors} uncaught error(s): ${pageErrors.join(' | ')}`);
    console.log(bootErrors ? RED('✗ boot') : GREEN('✓ boot'), DIM(`(${path.basename(exe)})`));

    // seed — prefer the realistic demo backup (40 people / 6 projects); fall back to synthetic
    let seeded, seedSrc = 'synthetic';
    const demo = await loadDemoState();
    if (demo) { seeded = await page.evaluate(applyBackupState, demo); seedSrc = 'demo backup'; }
    if (!demo || (seeded && seeded.error)) {
      if (seeded && seeded.error) console.log(RED('  demo apply error: ' + seeded.error), DIM('— falling back to synthetic'));
      seeded = await page.evaluate(new Function(seedScript())); seedSrc = 'synthetic';
    }
    console.log(GREEN('✓ seed'), DIM(seedSrc + ' ' + JSON.stringify(seeded)));

    // ── sample-data onboarding surface (Feature C) ────────────────────────────
    // The embedded SAMPLE_BACKUP global + the real applyBackupState apply path must
    // exist and import cleanly, and the lifecycle-'proposed' trap must be defused
    // (a pre-lifecycle seed becomes 'active', never capacity-suppressed).
    {
      const before = pageErrors.length;
      const r = await page.evaluate(`(() => {
        const need = ['applyBackupState','loadSampleData','clearAndStartMine','workspaceIsEmpty','sampleDataAvailable'];
        const missing = need.filter(n => { try { return eval('typeof '+n) !== 'function'; } catch(e){ return true; } });
        const hasSample = (typeof SAMPLE_BACKUP !== 'undefined' && SAMPLE_BACKUP && !!SAMPLE_BACKUP.state);
        let applied = null, lifecyclesOk = false, err = null;
        if (!missing.length && hasSample) {
          try {
            applyBackupState(SAMPLE_BACKUP.state);
            applied = { projects: projects.length, engineers: engineers.filter(e=>!e.vacant).length, allocRows: allocRows.length };
            lifecyclesOk = projects.length>0 && projects.every(p => p.lifecycle && p.lifecycle!=='proposed');
          } catch(e){ err = String(e && e.message || e); }
        }
        return { missing, hasSample: !!hasSample, applied, lifecyclesOk, err };
      })()`);
      const threw = pageErrors.length - before;
      const ok = !r.missing.length && r.hasSample && r.applied && r.applied.projects>0 && r.applied.engineers>0 && r.lifecyclesOk && !r.err && threw===0;
      console.log(ok ? GREEN('  ✓ sample-data') : RED('  ✗ sample-data'),
        DIM(JSON.stringify({ hasSample:r.hasSample, applied:r.applied, lifecyclesOk:r.lifecyclesOk })),
        r.missing.length ? RED('missing: '+r.missing.join(',')) : '', r.err ? RED(r.err) : '', threw ? RED('threw '+threw) : '');
      if (!ok) failures.push(`sample-data surface failed: ${r.err || (r.missing.length ? 'missing '+r.missing.join(',') : (!r.hasSample ? 'SAMPLE_BACKUP absent' : !r.lifecyclesOk ? 'a project stayed proposed (capacity-suppressed)' : threw ? 'threw '+threw : 'apply produced no data'))}`);
    }

    // ── value-spine strip + teaching empty states (Feature A) ─────────────────
    // Force a partial (incomplete) workspace so the strip is visible, assert it renders
    // 5 nodes whose handlers all resolve, teachEmpty escapes its input, and the strip
    // auto-retires once the core path is complete; then restore the seed.
    {
      const before = pageErrors.length;
      const r = await page.evaluate(`(() => {
        const need = ['spineRender','spineStates','spineGo','spineDismiss','spineHideForever','spineShow','spineComplete','teachEmpty'];
        const missing = need.filter(n => { try { return eval('typeof '+n) !== 'function'; } catch(e){ return true; } });
        if (missing.length) return { missing };
        const _e = engineers.slice(), _p = projects.slice(), _a = allocRows.slice();
        engineers.length = 0; projects.length = 0; allocRows.length = 0;
        if (typeof railGuideOff !== 'undefined') railGuideOff = false;
        spineShow(); spineRender();
        const band = document.getElementById('spine-band');
        const out = {
          missing: [],
          visibleWhenEmpty: !!(band && !band.hidden),
          nodeCount: band ? band.querySelectorAll('.spine-node').length : 0,
          states: spineStates().map(s => s.state),
        };
        const te = teachEmpty({ icon:'x', title:'<b>x</b>', msg:'m', ctaLabel:'go', ctaView:'roster' });
        out.teachEscapes = te.indexOf('<b>x</b>') === -1 && te.indexOf('&lt;b&gt;') !== -1;
        return out;
      })()`);
      // scan the strip's live handlers (spineGo/spineDismiss/spineHideForever) while it is
      // still visible — the measurement block left the workspace emptied and the strip up.
      const bad = (!r.missing || !r.missing.length) ? await page.evaluate(handlerScanScript()) : [];
      const threw = pageErrors.length - before;
      const ok = r.missing && r.missing.length===0 && r.visibleWhenEmpty && r.nodeCount===5 && r.teachEscapes && bad.length===0 && threw===0;
      console.log(ok ? GREEN('  ✓ value-spine') : RED('  ✗ value-spine'),
        DIM(JSON.stringify({ visible:r.visibleWhenEmpty, nodes:r.nodeCount, states:r.states, teachEscapes:r.teachEscapes })),
        (r.missing&&r.missing.length)?RED('missing: '+r.missing.join(',')):'',
        bad.length?RED('undefined handler(s): '+bad.map(b=>b.name).join(',')):'', threw?RED('threw '+threw):'');
      if (!ok) failures.push(`value-spine surface failed: ${(r.missing&&r.missing.length)?'missing '+r.missing.join(','):(!r.visibleWhenEmpty?'strip not visible on empty workspace':r.nodeCount!==5?'expected 5 nodes, got '+r.nodeCount:!r.teachEscapes?'teachEmpty did not escape input':bad.length?'undefined handler(s): '+bad.map(b=>b.name).join(','):'threw '+threw)}`);
    }
    // re-seed cleanly for the view loop (the spine block emptied then partially restored)
    if (demo) await page.evaluate(applyBackupState, demo);

    // ── global undo / redo (Feature B) ────────────────────────────────────────
    // Assert the ring exists and an edit round-trips: add a project → commit → undo
    // removes it → redo restores it → undo again to leave the seed clean.
    {
      const before = pageErrors.length;
      const r = await page.evaluate(`(() => {
        const need = ['undoRedo','_undoRecordCommit','_undoInit','_undoApply','_undoCapture','_undoUpdateButtons'];
        const missing = need.filter(n => { try { return eval('typeof '+n) !== 'function'; } catch(e){ return true; } });
        if (missing.length) return { missing };
        _undoInit();
        const p0 = projects.length;
        const np = makeProject(); np.id = 999001; np.name = 'UndoTest'; np.lifecycle = 'active'; projects.push(np);
        if (typeof saveNow === 'function') saveNow();      // _doSave → _undoRecordCommit
        const p1 = projects.length;
        undoRedo(false);
        const p2 = projects.length, undid = !projects.some(p => p.id === 999001);
        undoRedo(true);
        const p3 = projects.length, redid = projects.some(p => p.id === 999001);
        undoRedo(false);                                    // leave the seed clean
        return { missing: [], p0, p1, p2, p3, undid, redid, cleaned: !projects.some(p => p.id === 999001) };
      })()`);
      const threw = pageErrors.length - before;
      const ok = r.missing && r.missing.length===0 && r.p1===r.p0+1 && r.p2===r.p0 && r.undid && r.p3===r.p0+1 && r.redid && r.cleaned && threw===0;
      console.log(ok ? GREEN('  ✓ undo-redo') : RED('  ✗ undo-redo'),
        DIM(JSON.stringify({ p0:r.p0, p1:r.p1, p2:r.p2, p3:r.p3, undid:r.undid, redid:r.redid })),
        (r.missing&&r.missing.length)?RED('missing: '+r.missing.join(',')):'', threw?RED('threw '+threw):'');
      if (!ok) failures.push(`undo-redo surface failed: ${(r.missing&&r.missing.length)?'missing '+r.missing.join(','):(!r.undid?'undo did not remove the edit':!r.redid?'redo did not restore it':threw?'threw '+threw:'round-trip counts wrong '+JSON.stringify(r))}`);
    }
    // final clean re-seed for the view loop
    if (demo) await page.evaluate(applyBackupState, demo);

    // ── progressive rail disclosure (Feature P3) ──────────────────────────────
    // Basics mode renders fewer domains/views/utils than Advanced, the toggle exists,
    // and flipping back to Advanced restores the full rail (which the view loop needs).
    {
      const before = pageErrors.length;
      const r = await page.evaluate(`(() => {
        if (typeof railToggleAdvanced !== 'function' || typeof railAdvanced === 'undefined') return { missing:true };
        railAdvanced = false; railRender();
        const b = { doms: document.querySelectorAll('#rail-scroll .rn-dom').length,
                    subs: document.querySelectorAll('#rail-scroll .rn-sub').length,
                    utils: document.querySelectorAll('#rail-foot .rn-util:not(.rn-mode)').length };
        const hasToggle = !!document.querySelector('#rail-foot .rn-mode[onclick*="railToggleAdvanced"]');
        railAdvanced = true; railRender();     // restore full rail for the view loop below
        const a = { doms: document.querySelectorAll('#rail-scroll .rn-dom').length,
                    subs: document.querySelectorAll('#rail-scroll .rn-sub').length,
                    utils: document.querySelectorAll('#rail-foot .rn-util:not(.rn-mode)').length };
        return { missing:false, b, a, hasToggle };
      })()`);
      const threw = pageErrors.length - before;
      const ok = !r.missing && r.hasToggle && r.b.subs < r.a.subs && r.b.doms <= r.a.doms && r.b.utils < r.a.utils && threw === 0;
      console.log(ok ? GREEN('  ✓ rail-disclosure') : RED('  ✗ rail-disclosure'),
        DIM(JSON.stringify({ basic:r.b, adv:r.a, toggle:r.hasToggle })), threw ? RED('threw ' + threw) : '');
      if (!ok) failures.push(`rail-disclosure failed: ${r.missing ? 'railToggleAdvanced/railAdvanced missing' : !r.hasToggle ? 'no toggle rendered' : threw ? 'threw ' + threw : 'Basics did not reduce the rail ' + JSON.stringify(r)}`);
    }

    // ── graceful network degrade (Feature P3) ─────────────────────────────────
    // Simulate offline and assert Collaborate + AI advisor show the plain "needs a
    // network connection" notice (and Collaborate's Connect is disabled), instead of a
    // confusing CDN/import failure. netOfflineBanner must escape its input.
    {
      const before = pageErrors.length;
      const r = await page.evaluate(`(() => {
        const need = ['netOnline','netOfflineBanner','collabOpen','collabRefreshPanel','collabClose','aiShowModelPicker'];
        const missing = need.filter(n => { try { return eval('typeof '+n) !== 'function'; } catch(e){ return true; } });
        if (missing.length) return { missing };
        const escapes = netOfflineBanner('<b>x</b>').indexOf('<b>x</b>') === -1 && netOfflineBanner('<b>x</b>').indexOf('&lt;b&gt;') !== -1;
        Object.defineProperty(navigator, 'onLine', { configurable:true, get:()=>false });
        const off = netOnline() === false;
        collabOpen(); collabRefreshPanel();
        const cdlg = document.getElementById('collab-dlg');
        const collabBanner = !!(cdlg && cdlg.innerHTML.indexOf('needs a network connection') > -1);
        const cbtn = cdlg && cdlg.querySelector('button[onclick="collabConnect()"]');
        const connectDisabled = !!(cbtn && cbtn.disabled);
        if (typeof collabClose === 'function') collabClose();
        aiShowModelPicker();
        const adlg = document.getElementById('ai-model-dlg');
        const aiBanner = !!(adlg && adlg.innerHTML.indexOf('needs a network connection') > -1);
        if (typeof aiCloseModelPicker === 'function') aiCloseModelPicker();
        // back online: reopen collab → banner should be gone
        try { delete navigator.onLine; } catch(e) {}
        Object.defineProperty(navigator, 'onLine', { configurable:true, get:()=>true });
        collabOpen(); collabRefreshPanel();
        const cdlg2 = document.getElementById('collab-dlg');
        const bannerGoneOnline = !!(cdlg2 && cdlg2.innerHTML.indexOf('needs a network connection') === -1);
        if (typeof collabClose === 'function') collabClose();
        return { missing: [], escapes, off, collabBanner, connectDisabled, aiBanner, bannerGoneOnline };
      })()`);
      const threw = pageErrors.length - before;
      const ok = !r.missing.length && r.escapes && r.off && r.collabBanner && r.connectDisabled && r.aiBanner && r.bannerGoneOnline && threw === 0;
      console.log(ok ? GREEN('  ✓ net-degrade') : RED('  ✗ net-degrade'),
        DIM(JSON.stringify({ collabBanner:r.collabBanner, connectDisabled:r.connectDisabled, aiBanner:r.aiBanner, clearsOnline:r.bannerGoneOnline })),
        (r.missing&&r.missing.length)?RED('missing: '+r.missing.join(',')):'', threw?RED('threw '+threw):'');
      if (!ok) failures.push(`net-degrade failed: ${(r.missing&&r.missing.length)?'missing '+r.missing.join(','):!r.escapes?'netOfflineBanner did not escape':!r.collabBanner?'collab offline banner missing':!r.connectDisabled?'Connect not disabled offline':!r.aiBanner?'AI offline banner missing':!r.bannerGoneOnline?'banner persisted when back online':'threw '+threw}`);
    }

    // collect the view list from the page's own registry
    const views = await page.evaluate("RAIL_DOMAINS.flatMap(d => d.views.map(v => ({ id: v.id, dom: d.id })))");

    // 1) every rail view renders without throwing + handlers all resolve
    for (const v of views) {
      const before = pageErrors.length;
      await page.evaluate(`railGo(null, ${JSON.stringify(v.id)})`);
      await new Promise(r => setTimeout(r, 120));
      const threw = pageErrors.length - before;
      const bad = await page.evaluate(handlerScanScript());
      const badNames = bad.map(b => b.name);
      const ok = threw === 0 && bad.length === 0;
      console.log(ok ? GREEN('  ✓ ' + v.id) : RED('  ✗ ' + v.id),
        threw ? RED(`threw ${threw}`) : '',
        bad.length ? RED('undefined handler(s): ' + badNames.join(', ')) : '');
      if (threw) failures.push(`view "${v.id}" threw ${threw} uncaught error(s)`);
      if (bad.length) failures.push(`view "${v.id}" has undefined handler(s): ${bad.map(b => b.name + ' (' + b.attr + ')').join(', ')}`);
    }

    // 2) heavy JS-built modals + utility panels — their handlers only enter the DOM
    //    once opened, so the static scan can't see them until we open each surface.
    const surfaces = [
      { name: 'idcard',        open: "(()=>{var e=engineers.find(x=>!x.vacant&&!x.planningOnly)||engineers[0]; if(!e||typeof openIdCardModal!=='function')return false; openIdCardModal(e.id); return true;})()", close: "typeof closeIdCardModal==='function'&&closeIdCardModal()" },
      { name: 'util:collab',   open: "typeof collabOpen==='function'&&(collabOpen(),true)",           close: "typeof collabClose==='function'&&collabClose()" },
      { name: 'util:archive',  open: "typeof openArchive==='function'&&(openArchive(),true)",          close: "typeof closeArchive==='function'&&closeArchive()" },
      { name: 'util:data',     open: "typeof dataMenuOpen==='function'&&(dataMenuOpen(),true)",        close: "typeof dataMenuClose==='function'&&dataMenuClose()" },
      { name: 'util:more',     open: "typeof moreMenuOpen==='function'&&(moreMenuOpen(),true)",        close: "typeof moreMenuClose==='function'&&moreMenuClose()" },
      { name: 'util:settings', open: "typeof railOpenSettings==='function'&&(railOpenSettings(),true)", close: "(function(){var o=document.getElementById('settings-overlay');if(o)o.classList.remove('show');})()" },
      { name: 'util:help',     open: "typeof openHelp==='function'&&(openHelp(),true)",                close: "typeof closeHelp==='function'&&closeHelp()" },
      { name: 'util:ai',       open: "typeof aiOpenChat==='function'&&(aiOpenChat(),true)",            close: "typeof aiCloseChat==='function'&&aiCloseChat()" },
    ];
    for (const s of surfaces) {
      const before = pageErrors.length;
      let opened = false;
      try { opened = await page.evaluate(s.open); } catch (e) { failures.push(`surface "${s.name}" open threw: ${e.message}`); }
      await new Promise(r => setTimeout(r, 150));
      const bad = opened ? await page.evaluate(handlerScanScript()) : [];
      try { await page.evaluate(s.close); } catch (e) {}
      await new Promise(r => setTimeout(r, 40));
      const threw = pageErrors.length - before;
      const ok = threw === 0 && bad.length === 0;
      console.log(ok ? GREEN('  ✓ ' + s.name) : RED('  ✗ ' + s.name),
        opened ? '' : DIM('(open skipped)'),
        bad.length ? RED('undefined handler(s): ' + bad.map(b => b.name).join(', ')) : '', threw ? RED(`threw ${threw}`) : '');
      if (threw) failures.push(`surface "${s.name}" threw ${threw} uncaught error(s)`);
      if (bad.length) failures.push(`surface "${s.name}" undefined handler(s): ${bad.map(b => b.name + ' (' + b.attr + ')').join(', ')}`);
    }

    // 3) the Esc chain (boot.js keydown handler) must not call a removed function
    {
      const before = pageErrors.length;
      await page.evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
      await new Promise(r => setTimeout(r, 80));
      const threw = pageErrors.length - before;
      console.log(threw ? RED(`  ✗ esc-chain threw ${threw}`) : GREEN('  ✓ esc-chain'));
      if (threw) failures.push(`Esc chain threw ${threw} uncaught error(s)`);
    }

    // 4) every READY export deliverable opens and renders its blocks
    const deliverables = await page.evaluate(
      "(typeof exportDeliverables==='function' ? exportDeliverables() : []).map(d => ({ id: d.id, ready: !!d.ready }))"
    );
    for (const d of deliverables.filter(d => d.ready)) {
      const before = pageErrors.length;
      const res = await page.evaluate(`(() => {
        var d = exportDeliverables().find(x => x.id === ${JSON.stringify(d.id)});
        try { d.open(); } catch (e) { return { err: String(e && e.message || e) }; }
        var st = (typeof _exportBuilderState !== 'undefined') ? _exportBuilderState : null;
        var ov = document.getElementById('export-builder-overlay');
        var out = { shown: !!(ov && ov.classList.contains('show')), blocks: st ? (st.blocks || []).length : 0 };
        try { if (typeof exportBuilderClose === 'function') exportBuilderClose(); else if (ov) ov.classList.remove('show'); } catch (e) {}
        return out;
      })()`);
      await new Promise(r => setTimeout(r, 60));
      const threw = pageErrors.length - before;
      const ok = !res.err && res.shown && res.blocks > 0 && threw === 0;
      console.log(ok ? GREEN('  ✓ export:' + d.id) : RED('  ✗ export:' + d.id),
        res.err ? RED(res.err) : DIM(`${res.blocks} blocks`), threw ? RED(`threw ${threw}`) : '');
      if (!ok) failures.push(`export "${d.id}" failed: ${res.err || (!res.shown ? 'builder did not open' : res.blocks === 0 ? 'no blocks' : 'threw ' + threw)}`);
    }

    if (consoleErrors.length) {
      failures.push(`${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 5).join(' | ')}`);
      console.log(RED(`✗ ${consoleErrors.length} console error(s)`));
    }
  } catch (e) {
    failures.push('harness error: ' + String(e && e.message || e));
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (failures.length) {
    console.log(RED(`SMOKE FAILED — ${failures.length} problem(s):`));
    failures.forEach(f => console.log(RED('  • ' + f)));
    process.exit(1);
  }
  console.log(GREEN('SMOKE PASSED — app boots, every view renders, every handler resolves, every ready export opens.'));
  process.exit(0);
}

main();
