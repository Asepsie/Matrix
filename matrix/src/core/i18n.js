/* ══════════════════════════════════════════════════════════════════
   i18n — lightweight runtime translation layer  (Phase 0: the seam)
   ══════════════════════════════════════════════════════════════════

   Design (see ARCHITECTURE.md › Localization):
   - KEY = the English source string. Missing translations fall back to
     English automatically, so wrapping t(…) around existing inline
     literals is safe and incremental — a partly-translated build still
     renders correctly, just in English where a value is absent.
   - `t()` is a PURE synchronous map lookup — safe to call during render.
   - Active language is a device/UI preference in localStorage 'eim_lang',
     resolved ONCE at load (before any render). It is deliberately NOT part
     of app state, snapshots, or backups — a French user's backup opens
     unchanged for an English user (same philosophy as the rail prefs).
   - Changing language reloads the page: every surface re-renders from
     source, so there is no risk of stale cached strings, half-translated
     open modals, or SVG left in the old language.

   SECURITY: `t()` is for developer-authored UI text only. Never pass
   untrusted/user data as the key, and escape any user values BEFORE they
   reach an interpolation slot (t() does not escape — the existing escH()
   path still owns that).

   Flat-bundle rules: every identifier here is `i18n`/`I18N_`-prefixed
   (plus the single-letter `t`), declared once. build.js fails on dups. */

/* ── Shipped languages (order = Settings dropdown order) ── */
export var I18N_LANGS = [
  { code:'en', label:'English'  },
  { code:'fr', label:'Français' },
  { code:'zh', label:'中文'      },
];
var I18N_LANG_KEY = 'eim_lang';   // tiny UI-only key, isolated from app state (SK) and rail prefs
var I18N_PSEUDO   = 'xx';         // dev pseudo-locale — see i18nPseudo()

/* ── Translation tables. `en` is implicit (key === English source).
   Populated per phase; unknown keys fall back to English. ── */
export var I18N_DICT = {
  fr: {
    /* Nav rail — domains */
    'TEAM':'ÉQUIPE', 'WORK':'TRAVAIL', 'SKILLS':'COMPÉTENCES',
    'TALENT':'TALENTS', 'INSIGHTS':'ANALYSES',
    /* Nav rail — views */
    'Roster':'Effectif', 'Org chart':'Organigramme',
    'Portfolio matrix':'Matrice de portefeuille', 'was home':'ancien accueil',
    'Resource plan':'Plan de ressources', 'Timeline':'Chronologie',
    'Financials analysis':'Analyse financière', 'Trade-off decision':'Décision d\'arbitrage',
    'Design to cost':'Conception à coût objectif', 'Project brief':'Brief projet',
    'Skills matrix':'Matrice de compétences', 'Skill risk':'Risque de compétence',
    'Heatmap':'Carte de chaleur', 'Nine-box':'Nine-box',
    'Team profiles':'Profils d\'équipe', 'Development':'Développement',
    'Portfolio analytics':'Analyse de portefeuille', 'People analytics':'Analyse RH',
    'Summary':'Synthèse', 'Cost dashboard':'Tableau de bord des coûts', 'Compare':'Comparer',
    /* Nav rail — utility actions */
    'Snapshots':'Instantanés', 'Backup':'Sauvegarde', 'Restore':'Restaurer',
    'AI advisor':'Conseiller IA', 'Settings':'Paramètres', 'Help':'Aide',
    /* Settings modal */
    '⚙ SETTINGS':'⚙ PARAMÈTRES',
    'Interface language. Your data is unaffected. Changing it reloads the app.':'Langue de l\'interface. Vos données ne sont pas affectées. Le changement recharge l\'application.',
    'DEFAULT LANDING VIEW':'VUE D\'ACCUEIL PAR DÉFAUT',
    'The view Project Matrix opens on when it loads.':'La vue sur laquelle Project Matrix s\'ouvre au chargement.',
    'CHARTER PROJECT PICKER':'SÉLECTEUR DE PROJET',
    'Card hub — grid of project cards':'Grille de cartes — grille de cartes de projet',
    'Dropdown — a top selector (like Design-to-cost)':'Menu déroulant — un sélecteur en haut (comme Conception à coût objectif)',
    'How you pick a project in Financials analysis & Trade-off decision.':'Comment choisir un projet dans Analyse financière et Décision d\'arbitrage.',
    'Auto-hide the nav rail — expand on hover, collapse when the pointer leaves':'Masquer automatiquement la barre — déployer au survol, réduire quand le pointeur s\'éloigne',
    'COLLAPSED RAIL WIDTH':'LARGEUR RÉDUITE DE LA BARRE',
    'Width of the always-visible icon strip. Clamped to keep the layout intact.':'Largeur de la bande d\'icônes toujours visible. Limitée pour préserver la mise en page.',
    'SAVE':'ENREGISTRER', 'CANCEL':'ANNULER',
    /* First-run landing chooser */
    '👋 WELCOME TO PROJECT MATRIX':'👋 BIENVENUE DANS PROJECT MATRIX',
    'Where would you like the app to open each time? You can change this anytime in <strong>Settings</strong> on the nav rail.':'Où souhaitez-vous que l\'application s\'ouvre à chaque fois ? Vous pouvez le modifier à tout moment dans les <strong>Paramètres</strong> de la barre de navigation.',
    'Roster — start with the team':'Effectif — commencer par l\'équipe',
    '(recommended)':'(recommandé)',
    'Portfolio matrix — start with the project matrix':'Matrice de portefeuille — commencer par la matrice de projet',
    /* Help panel */
    '⌨ KEYBOARD SHORTCUTS':'⌨ RACCOURCIS CLAVIER',
    'WHAT IS PROJECT MATRIX?':'QU\'EST-CE QUE PROJECT MATRIX ?',
    'Prioritize R&D initiatives on an impact/effort matrix. Use <strong>Resources</strong> to plan team allocation and track costs. Use <strong>Org Chart</strong> to visualize reporting structure and plan headcount. Use <strong>Skill Risk</strong> to identify knowledge gaps and single points of failure.':'Priorisez les initiatives R&D sur une matrice impact/effort. Utilisez <strong>Ressources</strong> pour planifier l\'allocation d\'équipe et suivre les coûts. Utilisez <strong>Organigramme</strong> pour visualiser la structure hiérarchique et planifier les effectifs. Utilisez <strong>Risque de compétence</strong> pour repérer les lacunes de connaissances et les points de défaillance uniques.',
    'NAVIGATION':'NAVIGATION',
    'Open this help panel':'Ouvrir ce panneau d\'aide',
    'Close any open panel':'Fermer tout panneau ouvert',
    'Open Summary dashboard':'Ouvrir le tableau de bord Synthèse',
    'Open Compare view':'Ouvrir la vue Comparer',
    'Open Resource Plan':'Ouvrir le plan de ressources',
    'Open Org Chart':'Ouvrir l\'organigramme',
    'Y-AXIS MODE':'MODE AXE Y',
    'Switch to Impact mode':'Passer en mode Impact',
    'Switch to Visibility mode':'Passer en mode Visibilité',
    'Switch to Enabler mode':'Passer en mode Levier',
    'PROJECTS':'PROJETS',
    'New project':'Nouveau projet',
    'Delete selected project':'Supprimer le projet sélectionné',
    'Edit selected project':'Modifier le projet sélectionné',
    'Toggle selected project visibility':'Basculer la visibilité du projet sélectionné',
    'DRAWING TOOLS':'OUTILS DE DESSIN',
    'Select / move tool':'Outil sélection / déplacement',
    'Line tool':'Outil ligne',
    'Dashed line tool':'Outil ligne pointillée',
    'Arrow tool':'Outil flèche',
    'Text annotation tool':'Outil annotation texte',
    'VIEW':'AFFICHAGE',
    'Zoom in / out (toward cursor)':'Zoom avant / arrière (vers le curseur)',
    'Reset zoom to 1:1':'Réinitialiser le zoom à 1:1',
    'Open Snapshots':'Ouvrir les instantanés',
    'Export JSON':'Exporter le JSON',
    '⚠ DANGER ZONE':'⚠ ZONE DANGEREUSE',
    'Reset all data to defaults. A snapshot is taken first.':'Réinitialiser toutes les données. Un instantané est pris au préalable.',
    'Reset all data — cannot be undone':'Réinitialiser toutes les données — irréversible',
    'RESET ALL':'TOUT RÉINITIALISER', 'CLOSE':'FERMER',
  },
  zh: {
    /* Nav rail — domains */
    'TEAM':'团队', 'WORK':'工作', 'SKILLS':'技能',
    'TALENT':'人才', 'INSIGHTS':'洞察',
    /* Nav rail — views */
    'Roster':'花名册', 'Org chart':'组织架构图',
    'Portfolio matrix':'组合矩阵', 'was home':'原主页',
    'Resource plan':'资源计划', 'Timeline':'时间线',
    'Financials analysis':'财务分析', 'Trade-off decision':'权衡决策',
    'Design to cost':'成本设计', 'Project brief':'项目简介',
    'Skills matrix':'技能矩阵', 'Skill risk':'技能风险',
    'Heatmap':'热力图', 'Nine-box':'九宫格',
    'Team profiles':'团队画像', 'Development':'发展',
    'Portfolio analytics':'组合分析', 'People analytics':'人员分析',
    'Summary':'摘要', 'Cost dashboard':'成本仪表板', 'Compare':'对比',
    /* Nav rail — utility actions */
    'Snapshots':'快照', 'Backup':'备份', 'Restore':'恢复',
    'AI advisor':'AI 顾问', 'Settings':'设置', 'Help':'帮助',
    /* Settings modal */
    '⚙ SETTINGS':'⚙ 设置',
    'Interface language. Your data is unaffected. Changing it reloads the app.':'界面语言。不影响您的数据。更改后将重新加载应用。',
    'DEFAULT LANDING VIEW':'默认起始视图',
    'The view Project Matrix opens on when it loads.':'Project Matrix 加载时打开的视图。',
    'CHARTER PROJECT PICKER':'项目选择器',
    'Card hub — grid of project cards':'卡片中心 — 项目卡片网格',
    'Dropdown — a top selector (like Design-to-cost)':'下拉菜单 — 顶部选择器（类似成本设计）',
    'How you pick a project in Financials analysis & Trade-off decision.':'在财务分析和权衡决策中选择项目的方式。',
    'Auto-hide the nav rail — expand on hover, collapse when the pointer leaves':'自动隐藏导航栏 — 悬停展开，指针离开时收起',
    'COLLAPSED RAIL WIDTH':'折叠栏宽度',
    'Width of the always-visible icon strip. Clamped to keep the layout intact.':'始终可见的图标栏宽度。已限制范围以保持布局完整。',
    'SAVE':'保存', 'CANCEL':'取消',
    /* First-run landing chooser */
    '👋 WELCOME TO PROJECT MATRIX':'👋 欢迎使用 PROJECT MATRIX',
    'Where would you like the app to open each time? You can change this anytime in <strong>Settings</strong> on the nav rail.':'您希望应用每次打开时显示哪个视图？可随时在导航栏的<strong>设置</strong>中更改。',
    'Roster — start with the team':'花名册 — 从团队开始',
    '(recommended)':'（推荐）',
    'Portfolio matrix — start with the project matrix':'组合矩阵 — 从项目矩阵开始',
    /* Help panel */
    '⌨ KEYBOARD SHORTCUTS':'⌨ 键盘快捷键',
    'WHAT IS PROJECT MATRIX?':'什么是 PROJECT MATRIX？',
    'Prioritize R&D initiatives on an impact/effort matrix. Use <strong>Resources</strong> to plan team allocation and track costs. Use <strong>Org Chart</strong> to visualize reporting structure and plan headcount. Use <strong>Skill Risk</strong> to identify knowledge gaps and single points of failure.':'在影响/投入矩阵上为研发计划排定优先级。使用<strong>资源</strong>规划团队分配并跟踪成本。使用<strong>组织架构图</strong>可视化汇报结构并规划人员编制。使用<strong>技能风险</strong>识别知识缺口和单点故障。',
    'NAVIGATION':'导航',
    'Open this help panel':'打开此帮助面板',
    'Close any open panel':'关闭任何打开的面板',
    'Open Summary dashboard':'打开摘要仪表板',
    'Open Compare view':'打开对比视图',
    'Open Resource Plan':'打开资源计划',
    'Open Org Chart':'打开组织架构图',
    'Y-AXIS MODE':'Y 轴模式',
    'Switch to Impact mode':'切换到影响模式',
    'Switch to Visibility mode':'切换到可见性模式',
    'Switch to Enabler mode':'切换到赋能模式',
    'PROJECTS':'项目',
    'New project':'新建项目',
    'Delete selected project':'删除所选项目',
    'Edit selected project':'编辑所选项目',
    'Toggle selected project visibility':'切换所选项目的可见性',
    'DRAWING TOOLS':'绘图工具',
    'Select / move tool':'选择／移动工具',
    'Line tool':'直线工具',
    'Dashed line tool':'虚线工具',
    'Arrow tool':'箭头工具',
    'Text annotation tool':'文本标注工具',
    'VIEW':'视图',
    'Zoom in / out (toward cursor)':'放大／缩小（朝向光标）',
    'Reset zoom to 1:1':'重置缩放为 1:1',
    'Open Snapshots':'打开快照',
    'Export JSON':'导出 JSON',
    '⚠ DANGER ZONE':'⚠ 危险区域',
    'Reset all data to defaults. A snapshot is taken first.':'将所有数据重置为默认值。会先创建快照。',
    'Reset all data — cannot be undone':'重置所有数据 — 无法撤销',
    'RESET ALL':'全部重置', 'CLOSE':'关闭',
  },
};

/* ── Active language, resolved once at load (function decls hoist, so
   calling before the definition below is fine). ── */
var _i18nLang = i18nResolveLang();

function i18nResolveLang(){
  try{
    var v = localStorage.getItem(I18N_LANG_KEY);
    if(v==='en'||v==='fr'||v==='zh'||v===I18N_PSEUDO) return v;
  }catch(e){}
  return 'en';
}

export function i18nGetLang(){ return _i18nLang; }

/* Switch the active language WITHOUT persisting or reloading. The running
   app never calls this (it reloads via i18nSetLang); it exists so tests can
   exercise t() across languages, and as the hook for any future live switch. */
export function i18nApplyLang(code){ _i18nLang = code; }

/* Persist + activate a language, then reload so the whole UI re-renders
   in one clean pass. No-op if unchanged. */
export function i18nSetLang(code){
  if(code===_i18nLang) return;
  try{ localStorage.setItem(I18N_LANG_KEY, code); }catch(e){}
  location.reload();
}

/* ── The core lookup. `key` is the English source string; `vars` is an
   optional { name:value } map for {name} placeholders. ── */
export function t(key, vars){
  var s;
  if(_i18nLang===I18N_PSEUDO)
    s = i18nPseudo(key);
  else if(_i18nLang!=='en' && I18N_DICT[_i18nLang] && I18N_DICT[_i18nLang][key]!=null)
    s = I18N_DICT[_i18nLang][key];
  else
    s = key;
  return vars ? i18nInterp(s, vars) : s;
}

/* {name} placeholder substitution. Values inserted verbatim (see SECURITY
   note above — escape user data before it gets here). */
export function i18nInterp(s, vars){
  return String(s).replace(/\{(\w+)\}/g, function(m, k){
    return (vars[k]!=null) ? String(vars[k]) : m;
  });
}

/* ── Static-markup sweep. index.html chrome can't call t() (it's HTML, not
   JS), so tagged elements are translated in place at boot. Conventions:
     data-i18n          → textContent  (key = attr value, else the element's
                          own normalized English text)
     data-i18n-html     → innerHTML    (key REQUIRED as the attr value; the
                          translation holds the full inline markup)
     data-i18n-title    → title attribute
     data-i18n-ph       → placeholder attribute
   Run once on DOMContentLoaded (every static overlay is then in the DOM, even
   those defined after the mid-body bundle). Under 'en' it's a harmless no-op;
   under the pseudo-locale it transforms, exposing any untagged static string. */
function i18nApplyDom(root){
  root = root || document;
  var norm = function(s){ return s.replace(/\s+/g,' ').trim(); };
  root.querySelectorAll('[data-i18n]').forEach(function(el){
    var key = el.getAttribute('data-i18n') || norm(el.textContent);
    if(key) el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-html]').forEach(function(el){
    var key = el.getAttribute('data-i18n-html');
    if(key) el.innerHTML = t(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(function(el){
    var key = el.getAttribute('data-i18n-title') || el.getAttribute('title');
    if(key) el.setAttribute('title', t(key));
  });
  root.querySelectorAll('[data-i18n-ph]').forEach(function(el){
    var key = el.getAttribute('data-i18n-ph') || el.getAttribute('placeholder');
    if(key) el.setAttribute('placeholder', t(key));
  });
}

/* ── Pseudo-localisation (dev). Accents ASCII letters and pads ~40% so
   truncation is obvious; leaves <tags> and {placeholders} intact. Any
   on-screen text that stays plain ASCII never went through t(). ── */
var I18N_PSEUDO_MAP = {a:'á',e:'é',i:'í',o:'ó',u:'ú',c:'ç',n:'ñ',s:'š',y:'ý',
  A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú',C:'Ç',N:'Ñ',S:'Š'};
export function i18nPseudo(key){
  var out='', inTag=false, inPh=false;
  for(var i=0;i<key.length;i++){
    var ch=key[i];
    if(ch==='<') inTag=true; else if(ch==='{') inPh=true;
    out += (!inTag && !inPh && I18N_PSEUDO_MAP[ch]) ? I18N_PSEUDO_MAP[ch] : ch;
    if(ch==='>') inTag=false; else if(ch==='}') inPh=false;
  }
  var visible = key.replace(/<[^>]*>/g,'').replace(/\{[^}]*\}/g,'').length;
  var pad = Math.max(1, Math.ceil(visible*0.4));
  return '⟦'+out+' '+new Array(pad+1).join('·')+'⟧';
}

/* ── Locale-aware number / date formatting (Phase 3 wiring; defined here
   so the whole layer lives in one file). Runtime is a modern browser, so
   Intl is guaranteed. EUR currency stays fixed — only grouping / decimal
   separators / date order localize. ── */
export function i18nLocale(){
  return _i18nLang==='fr' ? 'fr-FR' : _i18nLang==='zh' ? 'zh-CN' : 'en-US';
}
export function i18nNum(n, opts){
  if(n==null || (typeof n==='number' && isNaN(n))) return '';
  try{ return new Intl.NumberFormat(i18nLocale(), opts).format(n); }
  catch(e){ return String(n); }
}
export function i18nDate(d, opts){
  var dt = (d instanceof Date) ? d : new Date(d);
  if(isNaN(dt.getTime())) return '';
  try{ return new Intl.DateTimeFormat(i18nLocale(), opts||{year:'numeric',month:'short',day:'numeric'}).format(dt); }
  catch(e){ return String(d); }
}
