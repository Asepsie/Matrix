import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import vm from 'node:vm';

const SRC = './src';
const OUT = './dist/matrix.html';

// 1. Concatenate CSS
const CSS_FILES = [
  'styles/base.css',
  'styles/layout.css',
  'styles/components.css',
  'styles/table.css',
  'styles/print.css',
  'styles/nav.css',
  'styles/charter.css',
];
const css = CSS_FILES
  .map(f => readFileSync(join(SRC, f), 'utf8').trim())
  .filter(c => c.length > 0)
  .join('\n');

// 2. Bundle JS — ordered for dependency resolution
// (topological order: data → core → sections → nav)
const JS_FILES = [
  'core/i18n.js',      // first: defines t() so every later file (incl. globals) can use it
  'data/model.js',
  'core/globals.js',
  'core/helpers.js',
  'core/financial.js',
  'core/persist.js',
  'core/photo.js',
  'sections/matrix.js',
  'sections/sections.js',
  'sections/sidebar.js',
  'sections/modals.js',
  'sections/draw.js',
  'sections/tooltip.js',
  'sections/overlays.js',
  'sections/roster.js',
  'sections/plan.js',
  'sections/dashboard.js',
  'sections/timeline.js',
  'sections/development.js',
  'sections/skills.js',
  'sections/idcard.js',
  'sections/org.js',
  'sections/profiles.js',
  'sections/heatmap.js',
  'sections/ninebox.js',
  'sections/disc.js',
  'sections/analytics.js',
  'sections/portfolio.js',
  'sections/backlog.js',
  'sections/backup.js',
  'sections/ai.js',
  'sections/nav.js',
  'sections/railnav.js',
  'sections/charter.js',
  'sections/dtc.js',
  'sections/boot.js',
];

const js = JS_FILES
  .map(f => {
    const content = readFileSync(join(SRC, f), 'utf8').trim();
    if (!content) return '';
    // Strip ES module import/export keywords — the bundle is a single scope
    const stripped = content
      .replace(/^export (function|const|let|var|class)/gm, '$1')
      .replace(/^export default /gm, '')
      .replace(/^import .* from ['"].*['"];?\s*$/gm, '');
    return stripped + `\n/* ◄◄ END: ${f} ►► */\n`;
  })
  .filter(c => c.length > 0)
  .join('\n');

// 3. Inject into HTML shell
const shell = readFileSync(join(SRC, 'index.html'), 'utf8');
const cssBlock = css ? `<style>\n${css}\n</style>` : '<style></style>';
const jsBlock  = js  ? `<script>\n${js}\n</script>` : '<script></script>';
const output = shell
  .replace('<!-- {{CSS}} -->', cssBlock)
  .replace('<!-- {{JS}} -->', jsBlock);

writeFileSync(OUT, output);
console.log(`Built → ${OUT} (${Math.round(output.length / 1024)} KB)`);

// 4. Invariant checks
validateOutput(OUT);

function validateOutput(outputPath) {
  const html = readFileSync(outputPath, 'utf8');
  const jsStart = html.indexOf('<script>') + 8;
  const jsEnd   = html.indexOf('</script>');
  const jsContent = html.slice(jsStart, jsEnd);

  // 1. Script tag balance
  const opens  = (html.match(/<script/g)  || []).length;
  const closes = (html.match(/<\/script>/g) || []).length;
  if (opens !== closes)
    throw new Error(`Script tag imbalance: ${opens} open, ${closes} close`);

  // 2. No </script> inside JS block
  if (/<\/script>/i.test(jsContent))
    throw new Error('</script> found inside JS block — split the string literal');

  // 3. No raw alloc multiplication
  if (/allocs\[m\]\s*\*/.test(jsContent))
    throw new Error('Raw alloc multiplication — use _allocCost()');

  // 4. No duplicate top-level declarations across bundled files.
  //    The bundle is one flat scope; the same identifier declared with
  //    let/const/class in two files is a load-time SyntaxError in the browser
  //    (var/function are tolerated but still shadow — all are flagged here).
  const declSeen = {};
  for (const f of JS_FILES) {
    const src = readFileSync(join(SRC, f), 'utf8');
    for (const ln of src.split(/\r?\n/)) {
      const head = ln.match(/^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/);
      if (!head) continue;                 // not a top-level declaration line
      const ids = new Set([head[1]]);
      if (/^(?:export\s+)?(?:const|let|var)\b/.test(ln))   // const A=1, B=2 …
        for (const mm of ln.matchAll(/([A-Za-z0-9_$]+)\s*=(?![=>])/g)) ids.add(mm[1]);
      for (const id of ids) (declSeen[id] = declSeen[id] || []).push(f);
    }
  }
  const dups = Object.entries(declSeen).filter(([, fs]) => fs.length > 1);
  if (dups.length)
    throw new Error(
      'Duplicate top-level declaration(s) across the bundle — declare in one file only:\n' +
      dups.map(([id, fs]) => `  ${id}  ->  ${fs.join(', ')}`).join('\n')
    );

  // 5. The bundle must parse as a classic <script> (sloppy mode). vm.Script
  //    compiles without executing — identical syntax rules to a browser <script>,
  //    so it catches duplicate let/const, top-level return, etc. that checks
  //    1–4 cannot see.
  try {
    new vm.Script(jsContent, { filename: 'matrix-bundle.js' });
  } catch (e) {
    throw new Error(
      'Bundle failed to parse as a classic <script> — the browser would throw on load:\n  ' +
      e.message
    );
  }

  console.log('✓ All invariant checks passed');

  // 7. i18n audit (NON-FATAL — partial coverage must still ship).
  //    Collect every t('…') / t("…") key across the bundle, then report,
  //    per shipped language, how many are translated vs still English,
  //    and flag orphaned dictionary keys that no t() call references.
  auditI18n();
}

function auditI18n(){
  // Pull the dictionary tables straight out of i18n.js source (no eval).
  const i18nSrc = readFileSync(join(SRC, 'core/i18n.js'), 'utf8');
  // Shipped languages = I18N_LANGS codes minus the implicit English base.
  const langs = [...i18nSrc.matchAll(/code\s*:\s*'(\w+)'/g)]
    .map(m => m[1]).filter(c => c !== 'en');

  // Gather t('key') / t("key") first-arg literals from every JS file.
  const keys = new Set();
  for (const f of JS_FILES) {
    const src = readFileSync(join(SRC, f), 'utf8');
    for (const m of src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g))
      keys.add(m[2].replace(/\\(['"\\])/g, '$1'));
  }
  // Plus static-markup keys: data-i18n(-html|-title|-ph)="…" in index.html.
  // Attribute values are HTML-escaped, so decode entities to match dict keys.
  const decode = s => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
  const htmlSrc = readFileSync(join(SRC, 'index.html'), 'utf8');
  for (const m of htmlSrc.matchAll(/\bdata-i18n(?:-html|-title|-ph)?\s*=\s*"([^"]*)"/g))
    keys.add(decode(m[1]));
  if (!keys.size) { console.log('ℹ i18n: no t() calls yet (seam only)'); return; }

  // Load each language's translated keys (shallow — just the top-level keys).
  const lines = [`ℹ i18n audit — ${keys.size} wrapped string(s):`];
  for (const lang of langs) {
    const block = (i18nSrc.match(new RegExp(`${lang}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`)) || [,''])[1];
    const have = new Set([...block.matchAll(/(['"])((?:\\.|(?!\1).)*)\1\s*:/g)].map(m => m[2]));
    const missing = [...keys].filter(k => !have.has(k));
    const orphan  = [...have].filter(k => !keys.has(k));
    lines.push(`   ${lang}: ${keys.size - missing.length}/${keys.size} translated`
      + (missing.length ? `, ${missing.length} missing` : '')
      + (orphan.length  ? `, ${orphan.length} orphaned` : ''));
  }
  console.log(lines.join('\n'));
}
