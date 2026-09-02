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

    // seed
    const seeded = await page.evaluate(new Function(seedScript()));
    console.log(GREEN('✓ seed'), DIM(JSON.stringify(seeded)));

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

    // 2) every READY export deliverable opens and renders its blocks
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
