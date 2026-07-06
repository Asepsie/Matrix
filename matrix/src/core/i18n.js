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
    /* Matrix — Y-axis mode labels (chrome; quadrant labels are user data, not translated) */
    'IMPACT':'IMPACT', 'VISIBILITY':'VISIBILITÉ', 'ENABLER VALUE':'VALEUR LEVIER', 'ENABLER':'LEVIER',
    /* Matrix — toolbar + axis bar */
    'Add new project (N)':'Ajouter un projet (N)', '+ PROJECT':'+ PROJET',
    'Add section':'Ajouter une section', '＋ SECTION':'＋ SECTION',
    'Configure quadrant labels':'Configurer les libellés de quadrant', '◧ QUADRANTS':'◧ QUADRANTS',
    'Y-AXIS':'AXE Y',
    'Sort by Impact':'Trier par Impact', 'Sort by Visibility':'Trier par Visibilité', 'Sort by Enabler':'Trier par Levier',
    'LIN':'LIN', 'LOG':'LOG', 'SEP-X':'SÉP-X', 'SEP-Y':'SÉP-Y', 'GRID':'GRILLE', '⊙ ZOOM RESET':'⊙ RÉINIT. ZOOM',
    /* Matrix — draw bar */
    'DRAW:':'DESSIN :', '↖ SELECT':'↖ SÉLECT.', '— LINE':'— LIGNE', '╌ DASHED':'╌ POINTILLÉ',
    '→ ARROW':'→ FLÈCHE', 'T TEXT':'T TEXTE', 'Type then click…':'Saisir puis cliquer…', '✕ CLEAR ALL':'✕ TOUT EFFACER',
    /* Matrix — right-click menu + project window */
    'Risk Management':'Gestion des risques', 'Schedule / Gantt':'Planning / Gantt',
    'Team Actions':'Actions d\'équipe', 'Charter':'Charte', 'Edit Project':'Modifier le projet',
    'Drag to move · Resize from bottom-right corner':'Glisser pour déplacer · Redimensionner depuis le coin inférieur droit',
    '⚠ RISK':'⚠ RISQUE', '📅 SCHEDULE':'📅 PLANNING', '👥 ACTIONS':'👥 ACTIONS',
    /* Roster (TEAM › Roster) — toolbar + groups */
    'ENGINEER ROSTER':'EFFECTIF INGÉNIEURS',
    '{n} people · {g} groups':'{n} personnes · {g} groupes',
    '+ GROUP':'+ GROUPE', '+ ENGINEER':'+ INGÉNIEUR', '+ PLANNING RESOURCE':'+ RESSOURCE PLANIF.',
    'Adds to selected group (click a group first)':'Ajoute au groupe sélectionné (cliquez d\'abord un groupe)',
    'Adds a planning-only resource — visible in planning but excluded from all calculations, dashboards, and profiles':'Ajoute une ressource de planification uniquement — visible dans la planification mais exclue de tous les calculs, tableaux de bord et profils',
    'click a group to target it':'cliquez un groupe pour le cibler',
    '↓ SKILLS PDF':'↓ PDF COMPÉTENCES', '↓ ROSTER':'↓ EFFECTIF', '↑ ROSTER':'↑ EFFECTIF',
    '✓ SAVED':'✓ ENREGISTRÉ', 'SAVE ROSTER':'ENREGISTRER L\'EFFECTIF',
    'UNGROUPED':'SANS GROUPE', '{n} engineer(s)':'{n} ingénieur(s)', '/mo':'/mois',
    'Drop engineers here…':'Déposez les ingénieurs ici…',
    /* Roster — engineer card */
    'Drag to regroup':'Glisser pour regrouper', '📋 PLANNING ONLY':'📋 PLANIFICATION SEULE',
    'Include in cost calc':'Inclure dans le calcul des coûts',
    'NAME':'NOM', 'Name':'Nom', 'ROLE / TITLE':'RÔLE / TITRE', 'Role…':'Rôle…',
    'LOCATION':'LIEU', 'Location…':'Lieu…', '€/MONTH':'€/MOIS', 'Planning only':'Planification seule',
    'Edit skills':'Modifier les compétences',
    'Employee profile — set Reports-To for org chart':'Profil employé — définir le responsable pour l\'organigramme',
    'PROFILE':'PROFIL', 'PROFILE ⚠':'PROFIL ⚠', '⊘ EXCLUDED':'⊘ EXCLU',
    'Exclude from all calculations (dashboard, financial, development, skills analysis). Still visible in roster and planning.':'Exclure de tous les calculs (tableau de bord, finances, développement, analyse des compétences). Reste visible dans l\'effectif et la planification.',
    'Exclude from calc':'Exclure du calcul', 'Delete engineer':'Supprimer l\'ingénieur',
    /* Resources overlay — period header */
    'Click to rename':'Cliquez pour renommer', 'FROM':'DE', 'TO':'À', '✕ CLOSE':'✕ FERMER',
    'Global period start — shared by every Resources tab, remembered across reloads':'Début de la période globale — partagé par tous les onglets Ressources, mémorisé entre les rechargements',
    'Global period end — shared by every Resources tab, remembered across reloads':'Fin de la période globale — partagée par tous les onglets Ressources, mémorisée entre les rechargements',
    /* Resource plan (WORK › Resource plan) */
    'ALL / NONE':'TOUT / RIEN', 'VIEW:':'VUE :', 'FLAT':'À PLAT', 'sort:':'tri :',
    'MANUAL':'MANUEL', 'A-Z ENG':'A-Z ING', 'A-Z PROJ':'A-Z PROJ',
    '↕ BY ENGINEER':'↕ PAR INGÉNIEUR', '↕ BY PROJECT':'↕ PAR PROJET',
    'FILTER:':'FILTRE :', 'Engineers':'Ingénieurs', 'Projects':'Projets', '✕ CLEAR':'✕ EFFACER',
    'HIDE EMPTY ROWS':'MASQUER LES LIGNES VIDES',
    'Freeze engineer name, project and month header while scrolling':'Figer le nom de l\'ingénieur, le projet et l\'en-tête de mois pendant le défilement',
    '⊠ FREEZE':'⊠ FIGER', '+ ADD ROW':'+ AJOUTER LIGNE', '↓ EXPORT…':'↓ EXPORTER…',
    'Full (all projects + engineers)':'Complet (tous projets + ingénieurs)', 'Current view':'Vue actuelle',
    'Project:':'Projet :', 'Excl. calc-excluded':'Excl. exclus du calcul', '↓ GO':'↓ OK',
    'QUICK FILL':'REMPLISSAGE RAPIDE', 'VALUE %':'VALEUR %',
    '→ FILL SELECTED ROWS':'→ REMPLIR LIGNES SÉLECT.', '⇒ FILL ALL ROWS':'⇒ REMPLIR TOUTES LES LIGNES',
    'Click cells · Shift+click range · Right-click options':'Cliquez les cellules · Maj+clic pour une plage · Clic droit pour les options',
    '— Select —':'— Sélectionner —', 'Toggle budget line':'Afficher/masquer la ligne budgétaire', 'budget…':'budget…',
    'Budget line — shown in CSV export only':'Ligne budgétaire — affichée uniquement dans l\'export CSV',
    '⚠ Total {pct}% this month':'⚠ Total {pct}% ce mois', 'FTE':'ETP',
    'ENGINEER':'INGÉNIEUR', 'PROJECT':'PROJET',
    'Budget line (click ⊞ on a row to set)':'Ligne budgétaire (cliquez ⊞ sur une ligne pour la définir)', '€/MO':'€/MOIS',
    '{fte} FTE · {k}k€ — click to select column':'{fte} ETP · {k}k€ — cliquez pour sélectionner la colonne',
    'UNASSIGNED ROWS':'LIGNES NON ASSIGNÉES', 'SUBTOTAL':'SOUS-TOTAL', 'NO PROJECT':'SANS PROJET',
    'TOTAL FTE':'TOTAL ETP', 'COST (€)':'COÛT (€)',
    /* Org chart (TEAM › Org chart) — header + tools + dialogs */
    '🗂 ORG CHART':'🗂 ORGANIGRAMME', 'All Groups':'Tous les groupes',
    'Add a new root-level person':'Ajouter une personne au niveau racine', '+ PERSON':'+ PERSONNE',
    'Add open position':'Ajouter un poste à pourvoir', '◻ VACANCY':'◻ POSTE VACANT',
    'Zoom in':'Zoom avant', 'Zoom out':'Zoom arrière', 'Fit to screen':'Ajuster à l\'écran', '⊡ FIT':'⊡ AJUSTER',
    'Reset manual positions to auto-layout':'Réinitialiser les positions manuelles vers la disposition auto', '⟳ AUTO':'⟳ AUTO',
    'Headcount KPIs':'Indicateurs d\'effectif', '📊 KPI':'📊 KPI',
    'Toggle 40px grid snap':'Activer/désactiver le magnétisme grille 40px', '⊞ SNAP: ON':'⊞ GRILLE : ON', '⊞ SNAP: OFF':'⊞ GRILLE : OFF',
    'Show/hide hierarchy arrows':'Afficher/masquer les flèches de hiérarchie', '↗ ARROWS: ON':'↗ FLÈCHES : ON', '↗ ARROWS: OFF':'↗ FLÈCHES : OFF',
    'White presentation theme + straight arrows':'Thème présentation blanc + flèches droites', '☀ WHITE: ON':'☀ BLANC : ON', '☀ WHITE: OFF':'☀ BLANC : OFF',
    'Show nine-box rating & recommended next move on each card':'Afficher la note nine-box et la prochaine évolution recommandée sur chaque carte', '◔ DETAILS: ON':'◔ DÉTAILS : ON', '◔ DETAILS: OFF':'◔ DÉTAILS : OFF',
    'Download SVG':'Télécharger le SVG', 'Download PNG':'Télécharger le PNG',
    'Select & move nodes':'Sélectionner et déplacer les nœuds',
    'Click to place a text label':'Cliquez pour placer une étiquette de texte',
    'Drag to draw a rectangle':'Glissez pour dessiner un rectangle',
    'Drag to draw an ellipse':'Glissez pour dessiner une ellipse',
    'Drag to draw a free arrow':'Glissez pour dessiner une flèche libre',
    'Delete selected shape (Del)':'Supprimer la forme sélectionnée (Suppr)', '✕ DEL':'✕ SUPPR',
    'Add an editable, resizable legend card':'Ajouter une carte de légende modifiable et redimensionnable', '▤ LEGEND':'▤ LÉGENDE',
    'FG = shapes on top (interactive) · BG = shapes behind nodes':'AV = formes au-dessus (interactif) · ARR = formes derrière les nœuds',
    '▭ FG/BG':'▭ AV/ARR', '▭ BG':'▭ ARR.', '▭ FG':'▭ AV.',
    'Click=select · Shift+click=add/remove · Drag=pan · Drag node=move or reassign':'Clic=sélection · Maj+clic=ajouter/retirer · Glisser=déplacer la vue · Glisser un nœud=déplacer ou réassigner',
    '{n} selected — drag any selected node to move group · Esc to deselect':'{n} sélectionné(s) — glissez un nœud sélectionné pour déplacer le groupe · Échap pour désélectionner',
    'Click=select · Shift+click=add · Drag empty=rubber band · Drag node=move group':'Clic=sélection · Maj+clic=ajouter · Glisser le vide=sélection rectangle · Glisser un nœud=déplacer le groupe',
    'Person':'Personne',
    'Rename level {d} (currently "{cur}"):':'Renommer le niveau {d} (actuellement « {cur} ») :',
    'New direct report name':'Nom du nouveau collaborateur direct', 'reporting to':'rattaché à',
    '(Leave blank to cancel)':'(Laisser vide pour annuler)', 'New person name:':'Nom de la nouvelle personne :',
    'Open position title (e.g. "Senior Engineer"):':'Intitulé du poste à pourvoir (ex. « Ingénieur senior ») :',
    'Open position title:':'Intitulé du poste à pourvoir :',
    'Remove {who}?':'Supprimer {who} ?', 'this person':'cette personne',
    'Direct reports will become root nodes.':'Les collaborateurs directs deviendront des nœuds racines.',
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
    /* Matrix — Y-axis mode labels (chrome; quadrant labels are user data, not translated) */
    'IMPACT':'影响', 'VISIBILITY':'可见性', 'ENABLER VALUE':'赋能价值', 'ENABLER':'赋能',
    /* Matrix — toolbar + axis bar */
    'Add new project (N)':'新建项目 (N)', '+ PROJECT':'+ 项目',
    'Add section':'添加分区', '＋ SECTION':'＋ 分区',
    'Configure quadrant labels':'配置象限标签', '◧ QUADRANTS':'◧ 象限',
    'Y-AXIS':'Y 轴',
    'Sort by Impact':'按影响排序', 'Sort by Visibility':'按可见性排序', 'Sort by Enabler':'按赋能排序',
    'LIN':'线性', 'LOG':'对数', 'SEP-X':'分隔-X', 'SEP-Y':'分隔-Y', 'GRID':'网格', '⊙ ZOOM RESET':'⊙ 重置缩放',
    /* Matrix — draw bar */
    'DRAW:':'绘制：', '↖ SELECT':'↖ 选择', '— LINE':'— 直线', '╌ DASHED':'╌ 虚线',
    '→ ARROW':'→ 箭头', 'T TEXT':'T 文本', 'Type then click…':'输入后点击…', '✕ CLEAR ALL':'✕ 全部清除',
    /* Matrix — right-click menu + project window */
    'Risk Management':'风险管理', 'Schedule / Gantt':'计划 / 甘特图',
    'Team Actions':'团队行动', 'Charter':'章程', 'Edit Project':'编辑项目',
    'Drag to move · Resize from bottom-right corner':'拖动移动 · 从右下角调整大小',
    '⚠ RISK':'⚠ 风险', '📅 SCHEDULE':'📅 计划', '👥 ACTIONS':'👥 行动',
    /* Roster (TEAM › Roster) — toolbar + groups */
    'ENGINEER ROSTER':'工程师花名册',
    '{n} people · {g} groups':'{n} 人 · {g} 组',
    '+ GROUP':'+ 分组', '+ ENGINEER':'+ 工程师', '+ PLANNING RESOURCE':'+ 规划资源',
    'Adds to selected group (click a group first)':'添加到所选分组（请先点击分组）',
    'Adds a planning-only resource — visible in planning but excluded from all calculations, dashboards, and profiles':'添加仅用于规划的资源 — 在规划中可见，但从所有计算、仪表板和档案中排除',
    'click a group to target it':'点击分组以选定目标',
    '↓ SKILLS PDF':'↓ 技能 PDF', '↓ ROSTER':'↓ 花名册', '↑ ROSTER':'↑ 花名册',
    '✓ SAVED':'✓ 已保存', 'SAVE ROSTER':'保存花名册',
    'UNGROUPED':'未分组', '{n} engineer(s)':'{n} 名工程师', '/mo':'/月',
    'Drop engineers here…':'将工程师拖放到此处…',
    /* Roster — engineer card */
    'Drag to regroup':'拖动以重新分组', '📋 PLANNING ONLY':'📋 仅规划',
    'Include in cost calc':'纳入成本计算',
    'NAME':'姓名', 'Name':'姓名', 'ROLE / TITLE':'角色 / 职位', 'Role…':'角色…',
    'LOCATION':'地点', 'Location…':'地点…', '€/MONTH':'€/月', 'Planning only':'仅规划',
    'Edit skills':'编辑技能',
    'Employee profile — set Reports-To for org chart':'员工档案 — 设置组织架构图的汇报对象',
    'PROFILE':'档案', 'PROFILE ⚠':'档案 ⚠', '⊘ EXCLUDED':'⊘ 已排除',
    'Exclude from all calculations (dashboard, financial, development, skills analysis). Still visible in roster and planning.':'从所有计算中排除（仪表板、财务、发展、技能分析）。仍在花名册和规划中可见。',
    'Exclude from calc':'从计算中排除', 'Delete engineer':'删除工程师',
    /* Resources overlay — period header */
    'Click to rename':'点击重命名', 'FROM':'从', 'TO':'到', '✕ CLOSE':'✕ 关闭',
    'Global period start — shared by every Resources tab, remembered across reloads':'全局周期起始 — 由所有资源选项卡共享，重新加载后保留',
    'Global period end — shared by every Resources tab, remembered across reloads':'全局周期结束 — 由所有资源选项卡共享，重新加载后保留',
    /* Resource plan (WORK › Resource plan) */
    'ALL / NONE':'全选 / 全不选', 'VIEW:':'视图：', 'FLAT':'平铺', 'sort:':'排序：',
    'MANUAL':'手动', 'A-Z ENG':'A-Z 工程师', 'A-Z PROJ':'A-Z 项目',
    '↕ BY ENGINEER':'↕ 按工程师', '↕ BY PROJECT':'↕ 按项目',
    'FILTER:':'筛选：', 'Engineers':'工程师', 'Projects':'项目', '✕ CLEAR':'✕ 清除',
    'HIDE EMPTY ROWS':'隐藏空行',
    'Freeze engineer name, project and month header while scrolling':'滚动时冻结工程师姓名、项目和月份表头',
    '⊠ FREEZE':'⊠ 冻结', '+ ADD ROW':'+ 添加行', '↓ EXPORT…':'↓ 导出…',
    'Full (all projects + engineers)':'完整（所有项目 + 工程师）', 'Current view':'当前视图',
    'Project:':'项目：', 'Excl. calc-excluded':'排除已排除计算项', '↓ GO':'↓ 执行',
    'QUICK FILL':'快速填充', 'VALUE %':'数值 %',
    '→ FILL SELECTED ROWS':'→ 填充所选行', '⇒ FILL ALL ROWS':'⇒ 填充所有行',
    'Click cells · Shift+click range · Right-click options':'点击单元格 · Shift+点击选择范围 · 右键选项',
    '— Select —':'— 选择 —', 'Toggle budget line':'切换预算行', 'budget…':'预算…',
    'Budget line — shown in CSV export only':'预算行 — 仅在 CSV 导出中显示',
    '⚠ Total {pct}% this month':'⚠ 本月合计 {pct}%', 'FTE':'全职当量',
    'ENGINEER':'工程师', 'PROJECT':'项目',
    'Budget line (click ⊞ on a row to set)':'预算行（点击某行的 ⊞ 设置）', '€/MO':'€/月',
    '{fte} FTE · {k}k€ — click to select column':'{fte} 全职当量 · {k}k€ — 点击选择列',
    'UNASSIGNED ROWS':'未分配行', 'SUBTOTAL':'小计', 'NO PROJECT':'无项目',
    'TOTAL FTE':'全职当量合计', 'COST (€)':'成本 (€)',
    /* Org chart (TEAM › Org chart) — header + tools + dialogs */
    '🗂 ORG CHART':'🗂 组织架构图', 'All Groups':'所有分组',
    'Add a new root-level person':'添加一个根级人员', '+ PERSON':'+ 人员',
    'Add open position':'添加空缺职位', '◻ VACANCY':'◻ 空缺',
    'Zoom in':'放大', 'Zoom out':'缩小', 'Fit to screen':'适应屏幕', '⊡ FIT':'⊡ 适应',
    'Reset manual positions to auto-layout':'将手动位置重置为自动布局', '⟳ AUTO':'⟳ 自动',
    'Headcount KPIs':'人员编制指标', '📊 KPI':'📊 KPI',
    'Toggle 40px grid snap':'切换 40px 网格吸附', '⊞ SNAP: ON':'⊞ 吸附：开', '⊞ SNAP: OFF':'⊞ 吸附：关',
    'Show/hide hierarchy arrows':'显示/隐藏层级箭头', '↗ ARROWS: ON':'↗ 箭头：开', '↗ ARROWS: OFF':'↗ 箭头：关',
    'White presentation theme + straight arrows':'白色演示主题 + 直线箭头', '☀ WHITE: ON':'☀ 白色：开', '☀ WHITE: OFF':'☀ 白色：关',
    'Show nine-box rating & recommended next move on each card':'在每张卡片上显示九宫格评级和建议的下一步', '◔ DETAILS: ON':'◔ 详情：开', '◔ DETAILS: OFF':'◔ 详情：关',
    'Download SVG':'下载 SVG', 'Download PNG':'下载 PNG',
    'Select & move nodes':'选择并移动节点',
    'Click to place a text label':'点击放置文本标签',
    'Drag to draw a rectangle':'拖动绘制矩形',
    'Drag to draw an ellipse':'拖动绘制椭圆',
    'Drag to draw a free arrow':'拖动绘制自由箭头',
    'Delete selected shape (Del)':'删除所选形状 (Del)', '✕ DEL':'✕ 删除',
    'Add an editable, resizable legend card':'添加可编辑、可调整大小的图例卡片', '▤ LEGEND':'▤ 图例',
    'FG = shapes on top (interactive) · BG = shapes behind nodes':'前景 = 形状在上层（可交互）· 背景 = 形状在节点后面',
    '▭ FG/BG':'▭ 前景/背景', '▭ BG':'▭ 背景', '▭ FG':'▭ 前景',
    'Click=select · Shift+click=add/remove · Drag=pan · Drag node=move or reassign':'点击=选择 · Shift+点击=添加/移除 · 拖动=平移 · 拖动节点=移动或重新分配',
    '{n} selected — drag any selected node to move group · Esc to deselect':'已选 {n} 个 — 拖动任一选中节点以移动整组 · Esc 取消选择',
    'Click=select · Shift+click=add · Drag empty=rubber band · Drag node=move group':'点击=选择 · Shift+点击=添加 · 拖动空白=框选 · 拖动节点=移动整组',
    'Person':'人员',
    'Rename level {d} (currently "{cur}"):':'重命名层级 {d}（当前为“{cur}”）：',
    'New direct report name':'新直接下属姓名', 'reporting to':'汇报给',
    '(Leave blank to cancel)':'（留空以取消）', 'New person name:':'新人员姓名：',
    'Open position title (e.g. "Senior Engineer"):':'空缺职位名称（例如“高级工程师”）：',
    'Open position title:':'空缺职位名称：',
    'Remove {who}?':'移除 {who}？', 'this person':'此人',
    'Direct reports will become root nodes.':'直接下属将成为根节点。',
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
