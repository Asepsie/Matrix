/* ►► SECTION: ANALYTICS ◄◄ People Analytics tab — pure-SVG charts, no libraries
 *
 * Public entry points (referenced by nav.js / index.html):
 *   renderAnalyticsTab()          — called by showResTab('analytics'); renders into #res-body
 *   buildAnalyticsDataset()       — flat row-per-active-engineer with all computed fields
 *   ANALYTICS_DIMENSIONS[]        — dimension catalogue
 *   ANALYTICS_TEMPLATES[]         — template registry (single-dim, two-dim, story views)
 *
 * NOTE on the bundle: this whole project compiles to ONE flat script bundle (build.js).
 * Every top-level name here shares scope with the rest of the app, so all internal
 * helpers/state are prefixed `an`/`_an` to avoid collisions. `export` is stripped at build.
 *
 * Adaptations vs. the original spec (intentional — see project reality):
 *   - getMonthRange() takes no args; it reads the #res-start/#res-end header inputs.
 *   - SENIORITY_ORDER is defined here (no such global existed; org.js had a local copy).
 *   - _ktPlans is keyed by SKILL NAME and entries only carry learnerEngId (no teacherEngId);
 *     hasKTPlan reflects that.
 *   - SPOF is computed in a real second pass (the spec's was unreachable after `return`).
 */

/* ── Ordered seniority ladder (matches the #idc-seniority dropdown exactly) ── */
export const SENIORITY_ORDER = [
  'Junior','Mid-level','Senior','Staff','Principal',
  'Tech Lead','Principal Tech Lead','Distinguished Engineer','Fellow',
  'Team Lead','Engineering Manager','Senior Manager','Director','Senior Director',
  'VP Engineering','CTO',
];

/* ── Performance rating → numeric (for ordering/comparison) ── */
export const AN_RATING_NUM = {'E+':5,'E':4,'M+':3,'M':2,'D':1,'U':0};
export const AN_RATING_ORDER = ['U','D','M','M+','E','E+'];      // low → high
export const AN_RATING_COLOR = {'U':'#f14335','D':'#f1a435','M':'#5be5c8','M+':'#3bd4b8','E':'#a8e820','E+':'#c8f135'};

/* ── Chart palette (mirrors the dark theme / CSS vars) ── */
export const AN_COLORS = {
  primary:'#c8f135', secondary:'#5be5c8', danger:'#f14335', warn:'#f1a435',
  purple:'#a78bfa', blue:'#60a5fa', muted:'#5a6380',
  surface:'#0e1117', border:'#1e2330', text:'#e2e8f4',
};

/* ── Coded ordinal/boolean values → human-readable axis labels ── */
export const AN_VALUE_LABELS = {
  nineBoxPerf: { 1:t('Low'), 2:t('Moderate'), 3:t('High') },   // performance band
  nineBoxPot:  { 1:t('Low'), 2:t('Moderate'), 3:t('High') },   // potential band
  isManager:   { true:t('Manager'), false:t('Individual Contributor') },
  hasSuccessor:{ true:t('Successor named'), false:t('No successor') },
  hasNextMove: { true:t('Move planned'), false:t('No move planned') },
  gender:      { M:t('Male'), F:t('Female'), NB:t('Non-binary'), O:t('Other') },
};
// Format a raw dimension value for display on an axis / legend.
function anFmtVal(dimId, v){
  const m = AN_VALUE_LABELS[dimId];
  if (m && m[v] != null) return m[v];   // numeric keys coerce, so m['2'] hits m[2]
  return (v === '' || v == null) ? '—' : String(v);
}

/* ── Tab state (single object, re-render swaps #an-main only) ── */
export let _anState = {
  story:    null,          // story-view id, or null when in compare mode
  dimA:     null,          // dimension id
  dimB:     null,          // dimension id or null
  template: null,          // selected template id
  filters:  { group:new Set(), location:new Set(), seniority:new Set() },
  show:     { kpi:true, insights:true },   // collapsible header panels (persisted)
};
// Restore collapsible-panel preferences (persists across reloads)
try { const _sv = JSON.parse(localStorage.getItem('eim_an_view') || 'null'); if (_sv) Object.assign(_anState.show, _sv); } catch (e) {}
function anSaveView(){ try { localStorage.setItem('eim_an_view', JSON.stringify(_anState.show)); } catch (e) {} }

/* ══════════════════════════════════════════════════════════════════
   1. DATASET — one row per active engineer with all computed fields
   ══════════════════════════════════════════════════════════════════ */
export function buildAnalyticsDataset() {
  const months = getMonthRange();   // reads #res-start / #res-end
  // Memoised by month range + active/compare year + placement counts (epoch handles other edits).
  const pk = _nbYear + '|' + _nbCompareYear + '|' + Object.keys(_nineBoxPlacements).length + '/' + Object.keys(_discPlacements).length;
  return _memo('analyticsDS:' + _monthsKey(months) + ':' + pk, () => _computeAnalyticsDataset(months));
}
function _computeAnalyticsDataset(months) {
  const rowsByEng = _rowsByEngMap();
  const prevPlace = (_nbCompareYear && _nineBoxHistory[_nbCompareYear]) ? _nineBoxHistory[_nbCompareYear] : null;
  // Direct-reports count in one pass (was O(n²): engineers.filter per engineer)
  const reportsCount = {};
  engineers.forEach(x => { const rt = (x.idcard || {}).reportsTo; if (rt != null && rt !== '') reportsCount[String(rt)] = (reportsCount[String(rt)] || 0) + 1; });
  const rows = engineers
    .filter(e => !e.vacant && !e.planningOnly && !e.excludeFromCalc)
    .map(e => {
      const c = e.idcard || {};
      const nb = _nineBoxPlacements[e.id] || null;
      const disc = _discPlacements[e.id] || null;

      // Tenure
      const startMs = c.startdate ? new Date(c.startdate).getTime() : null;
      const tenureMonths = (startMs && !isNaN(startMs))
        ? Math.max(0, Math.floor((Date.now() - startMs) / 2628e6)) : null;
      const cohortYear = (startMs && !isNaN(startMs)) ? String(new Date(startMs).getFullYear()) : '';

      // Review currency — months since the last recorded performance review
      const revMs = c.reviewdate ? new Date(c.reviewdate).getTime() : null;
      const reviewAgeMonths = (revMs && !isNaN(revMs))
        ? Math.max(0, Math.floor((Date.now() - revMs) / 2628e6)) : null;

      // Succession — a named successor (id or free-text) counts as covered
      const succ = c.succession || {};
      const hasSuccessor = !!((succ.successorId != null && String(succ.successorId).trim())
        || (succ.successorFreeText && succ.successorFreeText.trim()));

      // Internal-mobility signal — a next-move target has been captured
      const nm = c.nextMove || {};
      const hasNextMove = !!((nm.position && nm.position.trim()) || (nm.timeline && nm.timeline.trim()));

      // Allocation over the selected period
      const myRows = rowsByEng.get(e.id) || [];
      const totalFTE = months.reduce((s, m) =>
        s + myRows.reduce((rs, r) => rs + _allocNum(r.allocs ? r.allocs[m] : 0), 0), 0);
      const utilizationRate = months.length > 0 ? totalFTE / months.length : 0;

      // Performance reviews (newest first)
      const reviews = (c.reviews || []).slice()
        .filter(r => r && r.year)
        .sort((a, b) => String(b.year).localeCompare(String(a.year)));
      const latestRating = reviews[0] ? reviews[0].rating || null : null;
      const latestRatingNum = (latestRating != null && AN_RATING_NUM[latestRating] != null)
        ? AN_RATING_NUM[latestRating] : null;
      const ratingTrend = reviews.length >= 2
        ? (AN_RATING_NUM[reviews[0].rating] || 0) - (AN_RATING_NUM[reviews[1].rating] || 0)
        : null;

      // Skills
      const skills = e.skills || [];
      const critSkills = skills.filter(s => s.cat === 'crit');
      const diffSkills = skills.filter(s => s.cat === 'diff');

      // Nine-box parts (key = 'perf-pot', e.g. '3-2')
      const nbParts = nb ? nb.split('-').map(Number) : [null, null];

      // Org
      const group = engGroups.find(g => g.id === e.groupId);
      const directReports = reportsCount[String(e.id)] || 0;

      // KT: _ktPlans is keyed by skill; entries carry learnerEngId only
      const hasKTPlan = Object.values(_ktPlans || {}).some(arr =>
        (arr || []).some(p => String(p.learnerEngId) === String(e.id)));

      const srank = SENIORITY_ORDER.indexOf(c.seniority || '');

      return {
        // Identity
        id:e.id, name:e.name, role:e.role || '',
        group: group ? group.name : 'Ungrouped',
        groupColor: group ? group.color : '#888',
        location: e.location || 'Unknown',
        gender: c.gender || '',
        // Compensation
        monthlyCost: e.monthlyCost || 0,
        annualCost: (e.monthlyCost || 0) * 12,
        comparatio: (c.comparatio != null ? c.comparatio : null),
        // Grade / career
        seniority: c.seniority || '',
        seniorityRank: srank >= 0 ? srank + 1 : 0,
        grade: (c.grade != null ? c.grade : null),
        potential: c.potential || '',
        // Tenure
        startdate: c.startdate || null,
        tenureMonths,
        tenureYears: tenureMonths != null ? +(tenureMonths / 12).toFixed(1) : null,
        cohortYear,
        // Career / mobility
        mobility: c.mobility || '',
        contract: c.contract || '',
        hasNextMove, nextMovePos: (nm.position || ''),
        // Review governance
        reviewdate: c.reviewdate || null,
        reviewCurrencyMonths: reviewAgeMonths,
        // Succession
        hasSuccessor, successionGaps: (succ.gaps || ''), successionTimeframe: (succ.timeframe || ''),
        // Allocation / capacity
        utilizationRate,
        utilizationPct: Math.round(utilizationRate * 100),
        totalFTE,
        projectCount: [...new Set(myRows.map(r => r.projectId).filter(Boolean))].length,
        // Talent
        nineBoxKey: nb, nineBoxPerf: nbParts[0], nineBoxPot: nbParts[1],
        nineBoxYear: _nbYear,
        nineBoxPrevKey: prevPlace ? (prevPlace[e.id] || null) : null,
        nineBoxMove: prevPlace ? nbMove(nb, prevPlace[e.id] || null) : null,
        discProfile: disc,
        // Performance
        latestRating, latestRatingNum, ratingTrend,
        reviewCount: reviews.length, reviews,
        // Skills
        skillCount: skills.length,
        critSkillCount: critSkills.length,
        diffSkillCount: diffSkills.length,
        skills,
        spofSkills: [],          // filled in second pass below
        // Org
        directReports, isManager: directReports > 0, hasKTPlan,
        // Raw refs
        _eng: e, _group: group,
      };
    });

  // ── Second pass: SPOF — critical skills held by exactly one person in this set ──
  const holders = {};   // skillName → count
  rows.forEach(r => r.skills.forEach(s => {
    if (!s.name) return;
    holders[s.name] = (holders[s.name] || 0) + 1;
  }));
  rows.forEach(r => {
    r.spofSkills = r.skills
      .filter(s => s.cat === 'crit' && holders[s.name] === 1)
      .map(s => s.name);
  });

  // ── Third pass: composite TALENT RISK score (needs spofSkills + KT + movement) ──
  rows.forEach(r => { const rk = anRiskModel(r); r.riskScore = rk.score; r.riskFactors = rk.factors; });

  return rows;
}

/* Composite talent-risk model — fuses flight-risk, key-person and hygiene signals
   into one 0–100 score + a factor breakdown (used by the Talent Risk Radar story,
   the KPI scorecard and auto-insights). Pure function of one dataset row. */
export function anRiskModel(d){
  const f = [];
  const star = (d.nineBoxPerf === 3 || d.nineBoxPot === 3 || ['E','E+'].includes(d.latestRating));
  if (star && d.comparatio != null && d.comparatio < 95) f.push({ k:t('Below-market star'), p:30 });
  if (d.spofSkills.length && !d.hasKTPlan)               f.push({ k:t('SPOF, no KT plan'), p:25 });
  if (d.nineBoxMove === 'down')                          f.push({ k:t('Declining nine-box'), p:15 });
  if (d.utilizationPct > 105)                            f.push({ k:t('Over-allocated'), p:15 });
  const staleReview = d.reviewCurrencyMonths == null
    ? (d.tenureMonths != null && d.tenureMonths > 12)   // on staff >1yr, never reviewed
    : d.reviewCurrencyMonths > 15;
  if (staleReview)                                       f.push({ k:t('Stale / no review'), p:12 });
  if ((d.isManager || (d.grade != null && d.grade >= 8)) && !d.hasSuccessor)
                                                         f.push({ k:t('No successor'), p:10 });
  if (d.utilizationPct < 10)                             f.push({ k:t('On the bench'), p:8 });
  return { score: Math.min(100, f.reduce((s, x) => s + x.p, 0)), factors: f };
}
// Risk band → colour (shared by radar + scorecard)
function anRiskColor(score){ return score >= 50 ? AN_COLORS.danger : score >= 25 ? AN_COLORS.warn : AN_COLORS.secondary; }

/* ══════════════════════════════════════════════════════════════════
   2. DIMENSIONS catalogue
   ══════════════════════════════════════════════════════════════════ */
export const ANALYTICS_DIMENSIONS = [
  // Compensation
  {id:'monthlyCost', label:t('Monthly Cost (€)'), type:'numeric',     group:t('Compensation')},
  {id:'annualCost',  label:t('Annual Cost (€)'),  type:'numeric',     group:t('Compensation')},
  {id:'comparatio',  label:t('Compa-ratio (%)'),  type:'numeric',     group:t('Compensation')},
  // Grade & career
  {id:'seniority',   label:t('Seniority / Grade'), type:'ordinal',    group:t('Career'), order:SENIORITY_ORDER},
  {id:'grade',       label:t('Career Grade (1–11)'), type:'numeric',  group:t('Career')},
  {id:'role',        label:t('Role'),             type:'categorical', group:t('Career')},
  {id:'tenureYears', label:t('Tenure (years)'),   type:'numeric',     group:t('Career')},
  {id:'cohortYear',  label:t('Joined (year)'),    type:'ordinal',     group:t('Career')},
  {id:'mobility',    label:t('Mobility'),         type:'categorical', group:t('Career')},
  // Performance & talent
  {id:'latestRating',   label:t('Latest Perf Rating'), type:'ordinal', group:t('Performance'), order:AN_RATING_ORDER},
  {id:'latestRatingNum',label:t('Rating (numeric)'),   type:'numeric', group:t('Performance')},
  {id:'ratingTrend',    label:t('Rating Trend'),       type:'numeric', group:t('Performance')},
  {id:'reviewCurrencyMonths', label:t('Months Since Review'), type:'numeric', group:t('Performance')},
  {id:'riskScore',      label:t('Talent Risk Score'),  type:'numeric', group:t('Talent')},
  {id:'hasSuccessor',   label:t('Has Successor'),      type:'boolean', group:t('Talent')},
  {id:'potential',      label:t('Potential (GTP)'),    type:'categorical', group:t('Talent')},
  {id:'nineBoxPerf', label:t('Nine-Box Performance'), type:'ordinal', group:t('Talent'), order:[1,2,3]},
  {id:'nineBoxPot',  label:t('Nine-Box Potential'),   type:'ordinal', group:t('Talent'), order:[1,2,3]},
  {id:'nineBoxKey',  label:t('Nine-Box Position'),    type:'ninebox', group:t('Talent')},
  {id:'discProfile', label:t('DISC Profile'),         type:'categorical', group:t('Talent')},
  // Organisation / DEI
  {id:'group',    label:t('Team / Group'), type:'categorical', group:t('Organisation')},
  {id:'location', label:t('Location'),     type:'categorical', group:t('Organisation')},
  {id:'gender',   label:t('Gender'),       type:'categorical', group:t('DEI')},
  {id:'isManager',label:t('Is Manager'),   type:'boolean',     group:t('Organisation')},
  {id:'directReports', label:t('Direct Reports'), type:'numeric', group:t('Organisation')},
  {id:'contract', label:t('Contract Type'), type:'categorical', group:t('Organisation')},
  // Capacity
  {id:'utilizationPct', label:t('Utilisation (%)'), type:'numeric', group:t('Capacity')},
  {id:'projectCount',   label:t('Project Count'),   type:'numeric', group:t('Capacity')},
  // Skills
  {id:'skillCount',     label:t('Skill Count'),     type:'numeric', group:t('Skills')},
  {id:'critSkillCount', label:t('Critical Skills'), type:'numeric', group:t('Skills')},
];

export function anDim(id){ return ANALYTICS_DIMENSIONS.find(d => d.id === id) || null; }

/* ══════════════════════════════════════════════════════════════════
   3. CHART PRIMITIVES — return SVG strings (responsive via viewBox)
   ══════════════════════════════════════════════════════════════════ */
function anSvgOpen(w, h){
  return '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet" '
    + 'style="width:100%;height:auto;max-height:480px;font-family:IBM Plex Mono,monospace" '
    + 'xmlns="http://www.w3.org/2000/svg">';
}
function anTxt(x,y,s,opt){
  opt = opt || {};
  return '<text x="'+x+'" y="'+y+'" fill="'+(opt.fill||AN_COLORS.text)+'" '
    + 'font-size="'+(opt.size||11)+'" '
    + (opt.anchor?'text-anchor="'+opt.anchor+'" ':'')
    + (opt.weight?'font-weight="'+opt.weight+'" ':'')
    + (opt.pe===false?'pointer-events="none" ':'')
    + '>'+escH(s)+'</text>';
}
// data-tip attribute fragment for the shared hover tooltip (see anBindTips)
function anTip(text){ return ' data-tip="'+escH(String(text))+'"'; }
// data-ids + title attributes making a chart shape clickable for drill-down (see anBindDrill)
function anIds(ids, title){
  if (!ids || !ids.length) return '';
  return ' data-ids="'+ids.join(',')+'"' + (title ? ' data-dtitle="'+escH(String(title))+'"' : '') + ' style="cursor:pointer"';
}
function anNiceNum(v){
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString();
  return (Math.round(v*10)/10).toString();
}

// Horizontal bar chart — items: [{label, value, color}]
// opt: { valLabel (x-axis title incl. unit), catLabel (y-axis title) }
function anBarChart(items, opt){
  opt = opt || {};
  if (!items.length) return anEmpty(t('No data'));
  const axes = !!(opt.valLabel || opt.catLabel);
  const W = 640, rowH = 26, padL = 162, padR = 70, padT = 14, padB = axes ? 44 : 12;
  const axisY = padT + items.length * rowH;
  const H = axisY + padB;
  const plotW = W - padL - padR;
  const max = Math.max(1, ...items.map(d => d.value));
  const xOf = v => padL + (v / max) * plotW;
  let s = anSvgOpen(W, H);
  // value (x) axis baseline
  s += '<line x1="'+padL+'" y1="'+axisY+'" x2="'+(W-padR)+'" y2="'+axisY+'" stroke="'+AN_COLORS.border+'"/>';
  items.forEach((d, i) => {
    const y = padT + i * rowH;
    const bw = (xOf(d.value) - padL);
    s += anTxt(padL - 8, y + rowH/2 + 4, anTrunc(d.label, 22), {anchor:'end', size:11});
    s += '<rect x="'+padL+'" y="'+(y+4)+'" width="'+Math.max(1,bw)+'" height="'+(rowH-10)+'" '
       + 'rx="2" fill="'+(d.color||AN_COLORS.primary)+'"'+anTip(d.label+': '+d.value)+anIds(d.ids, d.label)+'></rect>';
    s += anTxt(padL + bw + 6, y + rowH/2 + 4, anNiceNum(d.value), {size:10, fill:AN_COLORS.muted});
  });
  if (axes){
    s += anTxt(padL, axisY + 13, '0', {size:9, fill:AN_COLORS.muted});
    s += anTxt(W - padR, axisY + 13, anNiceNum(max), {size:9, fill:AN_COLORS.muted, anchor:'end'});
    if (opt.valLabel) s += anTxt((padL + W - padR)/2, axisY + 30, opt.valLabel, {size:10, weight:600, fill:AN_COLORS.text, anchor:'middle'});
  }
  return s + '</svg>';
}

// Histogram — auto-bucketed numeric values. Accepts numbers or {v,id} rows (for drill).
// opt: { xLabel, band:{lo,hi,label} (shaded target zone) }
function anHistogram(input, opt){
  opt = opt || {};
  const rows = (input || []).map(x => (x && typeof x === 'object') ? { v:+x.v, id:x.id } : { v:+x, id:null })
    .filter(r => r.v != null && !isNaN(r.v));
  if (rows.length < 3) return anEmpty(t('Need ≥3 data points'));
  const vals = rows.map(r => r.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const nb = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(vals.length))));
  const span = (max - min) || 1, bw = span / nb;
  const buckets = new Array(nb).fill(0);
  const bucketIds = Array.from({ length: nb }, () => []);
  rows.forEach(r => { let i = Math.floor((r.v - min) / bw); if (i >= nb) i = nb - 1; if (i < 0) i = 0; buckets[i]++; if (r.id != null) bucketIds[i].push(r.id); });
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sorted = vals.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length/2)];
  const W = 640, H = 320, padL = 52, padR = 16, padT = 16, padB = 56;
  const cw = (W - padL - padR) / nb, maxC = Math.max(...buckets);
  const plotH = H - padT - padB;
  const xOf = v => padL + ((v - min) / span) * (W - padL - padR);
  let s = anSvgOpen(W, H);
  // target band (e.g. compa-ratio 95–105)
  if (opt.band){
    const bx0 = xOf(Math.max(min, opt.band.lo)), bx1 = xOf(Math.min(max, opt.band.hi));
    if (bx1 > bx0){
      s += '<rect x="'+bx0+'" y="'+padT+'" width="'+(bx1-bx0)+'" height="'+plotH+'" fill="rgba(91,229,200,.08)"/>';
      if (opt.band.label) s += anTxt((bx0+bx1)/2, padT+9, opt.band.label, {size:8, fill:AN_COLORS.secondary, anchor:'middle'});
    }
  }
  s += '<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="'+AN_COLORS.border+'"/>';
  s += '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(H-padB)+'" stroke="'+AN_COLORS.border+'"/>';
  buckets.forEach((c, i) => {
    const bh = maxC > 0 ? (c / maxC) * plotH : 0;
    const x = padL + i * cw;
    s += '<rect x="'+(x+2)+'" y="'+(H-padB-bh)+'" width="'+(cw-4)+'" height="'+bh+'" rx="2" fill="'+AN_COLORS.primary+'"'
       + anTip(anNiceNum(min+i*bw)+'–'+anNiceNum(min+(i+1)*bw)+': '+c+' people')+anIds(bucketIds[i], anNiceNum(min+i*bw)+'–'+anNiceNum(min+(i+1)*bw))+'></rect>';
  });
  // mean / median markers
  s += '<line x1="'+xOf(mean)+'" y1="'+padT+'" x2="'+xOf(mean)+'" y2="'+(H-padB)+'" stroke="'+AN_COLORS.warn+'" stroke-dasharray="4 3"/>';
  s += anTxt(xOf(mean), padT+10, 'mean '+anNiceNum(mean), {fill:AN_COLORS.warn, size:9, anchor:'middle'});
  s += '<line x1="'+xOf(median)+'" y1="'+padT+'" x2="'+xOf(median)+'" y2="'+(H-padB)+'" stroke="'+AN_COLORS.secondary+'" stroke-dasharray="4 3"/>';
  s += anTxt(xOf(median), H-padB+24, 'median '+anNiceNum(median), {fill:AN_COLORS.secondary, size:9, anchor:'middle'});
  // y-axis (count) ticks + title
  s += anTxt(padL - 6, padT + 6, String(maxC), {size:9, fill:AN_COLORS.muted, anchor:'end'});
  s += anTxt(padL - 6, H - padB, '0', {size:9, fill:AN_COLORS.muted, anchor:'end'});
  s += '<text x="14" y="'+((padT + H - padB)/2)+'" fill="'+AN_COLORS.text+'" font-size="10" font-weight="600" text-anchor="middle" transform="rotate(-90 14 '+((padT + H - padB)/2)+')">Headcount</text>';
  // x-axis range + title (with unit, from the dimension label)
  s += anTxt(padL, H-padB+14, anNiceNum(min), {size:9, fill:AN_COLORS.muted});
  s += anTxt(W-padR, H-padB+14, anNiceNum(max), {size:9, fill:AN_COLORS.muted, anchor:'end'});
  if (opt.xLabel) s += anTxt((padL + W - padR)/2, H-8, opt.xLabel, {size:10, weight:600, fill:AN_COLORS.text, anchor:'middle'});
  return s + '</svg>';
}

// Box plot — groups: [{label, values:[]}]
// opt: { xLabel (numeric axis title incl. unit), catLabel (category axis title), ref (reference value line) }
function anBoxPlot(groups, opt){
  opt = opt || {};
  const g = groups.filter(x => x.values.filter(v => v != null && !isNaN(v)).length > 0);
  if (!g.length) return anEmpty(t('No data'));
  let all = g.flatMap(x => x.values).filter(v => v != null && !isNaN(v));
  let min = Math.min(...all), max = Math.max(...all);
  if (opt.ref != null){ min = Math.min(min, opt.ref); max = Math.max(max, opt.ref); }
  const span = (max - min) || 1;
  const W = 660, rowH = 46, padL = 168, padR = 50, padT = 16, padB = 46;
  const axisY = padT + g.length * rowH;
  const H = axisY + padB;
  const xOf = v => padL + ((v - min) / span) * (W - padL - padR);
  const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  let s = anSvgOpen(W, H);
  // target band (e.g. compa-ratio 95–105)
  if (opt.band){
    const bx0 = xOf(Math.max(min, opt.band.lo)), bx1 = xOf(Math.min(max, opt.band.hi));
    if (bx1 > bx0) s += '<rect x="'+bx0+'" y="'+padT+'" width="'+(bx1-bx0)+'" height="'+(axisY-padT)+'" fill="rgba(91,229,200,.07)"/>';
  }
  // reference line (e.g. compa-ratio = 100)
  if (opt.ref != null){
    s += '<line x1="'+xOf(opt.ref)+'" y1="'+padT+'" x2="'+xOf(opt.ref)+'" y2="'+axisY+'" stroke="'+AN_COLORS.secondary+'" stroke-dasharray="4 3"/>';
    s += anTxt(xOf(opt.ref), padT - 4, (opt.refLabel || ('ref ' + anNiceNum(opt.ref))), {size:9, fill:AN_COLORS.secondary, anchor:'middle'});
  }
  s += '<line x1="'+padL+'" y1="'+axisY+'" x2="'+(W-padR)+'" y2="'+axisY+'" stroke="'+AN_COLORS.border+'"/>';
  g.forEach((grp, i) => {
    const v = grp.values.filter(x => x != null && !isNaN(x)).sort((a, b) => a - b);
    const y = padT + i * rowH + rowH/2;
    const q1 = q(v, .25), med = q(v, .5), q3 = q(v, .75), lo = v[0], hi = v[v.length-1];
    s += anTxt(padL - 8, y + 4, anTrunc(grp.label, 24), {anchor:'end', size:11});
    const tip = grp.label+'\nn='+v.length+'\nmedian '+anNiceNum(med)+'\nIQR '+anNiceNum(q1)+'–'+anNiceNum(q3)+'\nrange '+anNiceNum(lo)+'–'+anNiceNum(hi);
    s += '<line x1="'+xOf(lo)+'" y1="'+y+'" x2="'+xOf(hi)+'" y2="'+y+'" stroke="'+AN_COLORS.muted+'"/>';
    s += '<rect x="'+xOf(q1)+'" y="'+(y-9)+'" width="'+Math.max(1,xOf(q3)-xOf(q1))+'" height="18" rx="2" fill="rgba(200,241,53,.18)" stroke="'+AN_COLORS.primary+'"'+anTip(tip)+anIds(grp.ids, grp.label)+'/>';
    s += '<line x1="'+xOf(med)+'" y1="'+(y-9)+'" x2="'+xOf(med)+'" y2="'+(y+9)+'" stroke="'+AN_COLORS.primary+'" stroke-width="2" pointer-events="none"/>';
    s += anTxt(xOf(hi)+6, y+4, 'n='+v.length, {size:9, fill:AN_COLORS.muted});
  });
  // numeric (x) axis range + titles
  s += anTxt(padL, axisY+13, anNiceNum(min), {size:9, fill:AN_COLORS.muted});
  s += anTxt(W-padR, axisY+13, anNiceNum(max), {size:9, fill:AN_COLORS.muted, anchor:'end'});
  if (opt.xLabel) s += anTxt((padL + W - padR)/2, axisY+30, opt.xLabel, {size:10, weight:600, fill:AN_COLORS.text, anchor:'middle'});
  return s + '</svg>';
}

// Stacked bar — rows: [{label, segs:[{value,color,key}]}]
// opt: { valLabel (x-axis title), catLabel (y-axis title), legend:[{key,color}] }
function anStackedBar(rows, opt){
  opt = opt || {};
  if (!rows.length) return anEmpty(t('No data'));
  const legend = opt.legend || [];
  const W = 660, rowH = 30, padL = 162, padR = 60, padT = legend.length ? 30 : 14;
  const axisLabels = !!(opt.valLabel || opt.catLabel);
  const padB = axisLabels ? 40 : 12;
  const axisY = padT + rows.length * rowH;
  const H = axisY + padB;
  const plotW = W - padL - padR;
  const max = Math.max(1, ...rows.map(r => r.segs.reduce((s, x) => s + x.value, 0)));
  let s = anSvgOpen(W, H);
  // legend across the top
  if (legend.length){
    let lx = padL;
    legend.forEach(item => {
      s += '<rect x="'+lx+'" y="6" width="11" height="11" rx="2" fill="'+item.color+'"/>';
      s += anTxt(lx + 15, 15, item.key, {size:10, fill:AN_COLORS.muted});
      lx += 15 + (String(item.key).length * 7) + 14;
    });
  }
  s += '<line x1="'+padL+'" y1="'+axisY+'" x2="'+(W-padR)+'" y2="'+axisY+'" stroke="'+AN_COLORS.border+'"/>';
  rows.forEach((r, i) => {
    const y = padT + i * rowH;
    let x = padL; const tot = r.segs.reduce((a, b) => a + b.value, 0);
    s += anTxt(padL - 8, y + rowH/2 + 4, anTrunc(r.label, 22), {anchor:'end', size:11});
    r.segs.forEach(seg => {
      if (!seg.value) return;
      const w = (seg.value / max) * plotW;
      s += '<rect x="'+x+'" y="'+(y+4)+'" width="'+w+'" height="'+(rowH-10)+'" fill="'+seg.color+'"'
         + anTip(r.label+' · '+seg.key+': '+seg.value)+anIds(seg.ids, r.label+' · '+seg.key)+'></rect>';
      x += w;
    });
    s += anTxt(x + 6, y + rowH/2 + 4, String(tot), {size:10, fill:AN_COLORS.muted});
  });
  if (axisLabels){
    s += anTxt(padL, axisY + 13, '0', {size:9, fill:AN_COLORS.muted});
    s += anTxt(W - padR, axisY + 13, anNiceNum(max), {size:9, fill:AN_COLORS.muted, anchor:'end'});
    if (opt.valLabel) s += anTxt((padL + W - padR)/2, axisY + 30, opt.valLabel, {size:10, weight:600, fill:AN_COLORS.text, anchor:'middle'});
  }
  return s + '</svg>';
}

// Scatter — points: [{x,y,label,color}]
function anScatter(points, opt){
  opt = opt || {};
  const pts = points.filter(p => p.x != null && p.y != null && !isNaN(p.x) && !isNaN(p.y));
  if (pts.length < 3) return anEmpty(t('Need ≥3 data points'));
  const W = 640, H = 380, padL = 52, padR = 20, padT = 18, padB = 40;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const xs2 = (xmax - xmin) || 1, ys2 = (ymax - ymin) || 1;
  const X = v => padL + ((v - xmin) / xs2) * (W - padL - padR);
  const Y = v => (H - padB) - ((v - ymin) / ys2) * (H - padT - padB);
  let s = anSvgOpen(W, H);
  s += '<line x1="'+padL+'" y1="'+(H-padB)+'" x2="'+(W-padR)+'" y2="'+(H-padB)+'" stroke="'+AN_COLORS.border+'"/>';
  s += '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(H-padB)+'" stroke="'+AN_COLORS.border+'"/>';
  if (opt.xLabel) s += anTxt((padL+W-padR)/2, H-6, opt.xLabel, {size:10, fill:AN_COLORS.muted, anchor:'middle'});
  if (opt.yLabel) s += '<text x="14" y="'+((padT+H-padB)/2)+'" fill="'+AN_COLORS.muted+'" font-size="10" text-anchor="middle" transform="rotate(-90 14 '+((padT+H-padB)/2)+')">'+escH(opt.yLabel)+'</text>';
  // optional trend line (least squares)
  if (opt.trend && pts.length >= 3) {
    const n = pts.length, sx = xs.reduce((a,b)=>a+b,0), sy = ys.reduce((a,b)=>a+b,0);
    const sxy = pts.reduce((a,p)=>a+p.x*p.y,0), sxx = xs.reduce((a,b)=>a+b*b,0);
    const slope = (n*sxy - sx*sy) / ((n*sxx - sx*sx) || 1), icpt = (sy - slope*sx) / n;
    s += '<line x1="'+X(xmin)+'" y1="'+Y(slope*xmin+icpt)+'" x2="'+X(xmax)+'" y2="'+Y(slope*xmax+icpt)+'" stroke="'+AN_COLORS.warn+'" stroke-dasharray="5 4"/>';
  }
  if (opt.corr && pts.length >= 3) {
    const n = pts.length, sx = xs.reduce((a,b)=>a+b,0), sy = ys.reduce((a,b)=>a+b,0);
    const sxy = pts.reduce((a,p)=>a+p.x*p.y,0), sxx = xs.reduce((a,b)=>a+b*b,0), syy = ys.reduce((a,b)=>a+b*b,0);
    const r = (n*sxy - sx*sy) / (Math.sqrt((n*sxx - sx*sx) * (n*syy - sy*sy)) || 1);
    s += anTxt(W-padR, padT+6, 'r = '+(Math.round(r*100)/100), {anchor:'end', size:10, fill:AN_COLORS.warn});
  }
  pts.forEach(p => {
    s += '<circle cx="'+X(p.x)+'" cy="'+Y(p.y)+'" r="5" fill="'+(p.color||AN_COLORS.primary)+'" fill-opacity="0.8" stroke="'+AN_COLORS.surface+'"'
       + anTip((p.label?p.label+'\n':'')+'x='+anNiceNum(p.x)+', y='+anNiceNum(p.y))+anIds(p.id != null ? [p.id] : null, p.label)+'></circle>';
  });
  s += anTxt(padL, H-padB+14, anNiceNum(xmin), {size:9, fill:AN_COLORS.muted});
  s += anTxt(W-padR, H-padB+14, anNiceNum(xmax), {size:9, fill:AN_COLORS.muted, anchor:'end'});
  s += anTxt(padL-6, H-padB, anNiceNum(ymin), {size:9, fill:AN_COLORS.muted, anchor:'end'});
  s += anTxt(padL-6, padT+8, anNiceNum(ymax), {size:9, fill:AN_COLORS.muted, anchor:'end'});
  return s + '</svg>';
}

// Nine-box 3×3 grid with headcount + names (uses the app's actual cell labels)
function anNineBox(data, opt){
  const labels = {
    '1-3':'Enigma','2-3':'Future Star','3-3':'Consistent Star',
    '1-2':'Under Performer','2-2':'Core Player','3-2':'High Performer',
    '1-1':'Risk','2-1':'Effective Contributor','3-1':'Expert',
  };
  const cellFill = {
    '3-3':'rgba(200,241,53,.14)','2-3':'rgba(91,229,200,.12)','3-2':'rgba(91,229,200,.12)',
    '2-2':'rgba(120,120,140,.10)','1-3':'rgba(241,164,53,.10)','3-1':'rgba(120,120,140,.10)',
    '1-2':'rgba(241,164,53,.10)','2-1':'rgba(241,164,53,.10)','1-1':'rgba(241,67,53,.12)',
  };
  const by = {}, byId = {};
  data.forEach(d => { if (d.nineBoxKey){ (by[d.nineBoxKey] = by[d.nineBoxKey] || []).push(d.name); (byId[d.nineBoxKey] = byId[d.nineBoxKey] || []).push(d.id); } });
  if (!Object.keys(by).length) return anEmpty(t('No nine-box placements yet (place engineers on the Nine-Box tab)'));
  const W = 560, H = 560, padL = 50, padB = 50, cell = (W - padL) / 3;
  let s = anSvgOpen(W, H);
  // rows top→bottom = potential 3,2,1 ; cols left→right = perf 1,2,3
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const perf = col + 1, pot = 3 - row, key = perf + '-' + pot;
    const x = padL + col * cell, y = row * cell;
    const names = by[key] || [];
    s += '<rect x="'+x+'" y="'+y+'" width="'+(cell-3)+'" height="'+(cell-3)+'" rx="4" fill="'+(cellFill[key]||'rgba(120,120,140,.08)')+'" stroke="'+AN_COLORS.border+'"'+anIds(byId[key], labels[key])+'/>';
    s += anTxt(x+8, y+18, labels[key], {size:10, weight:700, fill:AN_COLORS.text, pe:false});
    s += anTxt(x+cell-12, y+20, String(names.length), {size:15, weight:700, anchor:'end', fill:AN_COLORS.primary, pe:false});
    names.slice(0, 6).forEach((nm, k) => s += anTxt(x+8, y+38 + k*14, anTrunc(nm, 18), {size:9, fill:AN_COLORS.muted, pe:false}));
    if (names.length > 6) s += anTxt(x+8, y+38 + 6*14, '+'+(names.length-6)+' more', {size:9, fill:AN_COLORS.muted, pe:false});
  }
  s += anTxt(W/2, H-16, 'PERFORMANCE →', {size:10, fill:AN_COLORS.muted, anchor:'middle'});
  s += '<text x="16" y="'+(H-padB)/2+'" fill="'+AN_COLORS.muted+'" font-size="10" text-anchor="middle" transform="rotate(-90 16 '+(H-padB)/2+')">POTENTIAL →</text>';
  return s + '</svg>';
}

// Heatmap / matrix — matrix[row][col] = count, density-coloured
// opt: { rowLabel (y-axis title), colLabel (x-axis title), unit (tooltip noun) }
function anHeatmap(matrix, rowLabels, colLabels, opt){
  opt = opt || {};
  if (!rowLabels.length || !colLabels.length) return anEmpty(t('No data'));
  let max = 0; matrix.forEach(r => r.forEach(v => { if (v > max) max = v; }));
  const padL = 168, padT = 70, cell = Math.min(64, Math.max(34, (640 - padL) / colLabels.length));
  const W = padL + colLabels.length * cell + 14, H = padT + rowLabels.length * cell + 30;
  const unit = opt.unit || 'count';
  let s = anSvgOpen(W, H);
  // column header axis title
  if (opt.colLabel) s += anTxt(padL + colLabels.length * cell / 2, 14, opt.colLabel, {size:10, weight:600, fill:AN_COLORS.text, anchor:'middle'});
  colLabels.forEach((c, ci) => {
    const x = padL + ci * cell + cell/2;
    s += '<text x="'+x+'" y="'+(padT-8)+'" fill="'+AN_COLORS.muted+'" font-size="10" text-anchor="start" '
       + 'transform="rotate(-40 '+x+' '+(padT-8)+')">'+escH(anTrunc(String(c), 16))+'</text>';
  });
  rowLabels.forEach((r, ri) => {
    const y = padT + ri * cell;
    s += anTxt(padL - 8, y + cell/2 + 4, anTrunc(String(r), 22), {anchor:'end', size:11});
    colLabels.forEach((c, ci) => {
      const v = matrix[ri][ci] || 0, x = padL + ci * cell;
      const alpha = max > 0 && v ? 0.10 + 0.80 * (v / max) : 0.04;
      const cellIds = opt.ids && opt.ids[ri] ? opt.ids[ri][ci] : null;
      s += '<rect x="'+(x+1)+'" y="'+(y+1)+'" width="'+(cell-2)+'" height="'+(cell-2)+'" rx="2" '
         + 'fill="rgba(200,241,53,'+alpha+')" stroke="'+AN_COLORS.border+'"'+anTip(r+' × '+c+'\n'+v+' '+unit)+anIds(cellIds, r+' × '+c)+'></rect>';
      if (v) s += anTxt(x + cell/2, y + cell/2 + 4, String(v), {anchor:'middle', size:11, weight:600, pe:false, fill: alpha > 0.5 ? '#0a0c10' : AN_COLORS.text});
    });
  });
  // row axis title (rotated, far left)
  if (opt.rowLabel){ const cy = padT + rowLabels.length * cell / 2;
    s += '<text x="13" y="'+cy+'" fill="'+AN_COLORS.text+'" font-size="10" font-weight="600" text-anchor="middle" transform="rotate(-90 13 '+cy+')">'+escH(opt.rowLabel)+'</text>'; }
  return s + '</svg>';
}
function anCell(d, dim){ const v = d[dim.id]; return (v === '' || v == null) ? '—' : v; }
function anCatValues(data, dim){
  const set = [...new Set(data.map(d => anCell(d, dim)))];
  if (dim.order) set.sort((a, b) => {
    const ai = dim.order.indexOf(a), bi = dim.order.indexOf(b);
    if (ai < 0 && bi < 0) return String(a).localeCompare(String(b));
    if (ai < 0) return 1; if (bi < 0) return -1; return ai - bi;
  });
  else set.sort((a, b) => String(a).localeCompare(String(b)));
  return set;
}

function anEmpty(msg){
  return '<div style="padding:48px 20px;text-align:center;color:var(--muted);font-size:13px">'
    + '⌀ '+escH(msg)+'</div>';
}
function anTrunc(s, n){ s = String(s||''); return s.length > n ? s.slice(0, n-1) + '…' : s; }

// Resolve a template's display name (dynamic for dimension-pair templates)
function anTplName(t, dimA, dimB){
  if (t.nameFn && dimA) { try { return t.nameFn(dimA, dimB); } catch (e) {} }
  return t.name;
}

// Shared hover tooltip: one floating div, populated from data-tip on the hovered SVG shape.
// Re-bound on each render because #an-chart's innerHTML is replaced.
function anBindTips(container){
  if (!container) return;
  let tip = G('an-tip');
  if (!tip){
    tip = document.createElement('div');
    tip.id = 'an-tip';
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none;'
      + 'background:#0e1117;border:1px solid '+AN_COLORS.primary+';color:'+AN_COLORS.text+';'
      + 'font:11px IBM Plex Mono,monospace;padding:5px 8px;border-radius:5px;max-width:260px;'
      + 'white-space:pre-line;box-shadow:0 6px 20px rgba(0,0,0,.6)';
    document.body.appendChild(tip);
  }
  container.addEventListener('mousemove', e => {
    const t = e.target && e.target.getAttribute && e.target.getAttribute('data-tip');
    if (!t) { tip.style.display = 'none'; return; }
    tip.textContent = t;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect(), pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width  > window.innerWidth)  x = e.clientX - r.width  - pad;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  container.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

/* ── KPI scorecard + data-completeness chips (reflects current filters) ── */
function anFlightRiskCount(data){ return data.filter(d => (d.nineBoxPerf === 3 || d.nineBoxPot === 3 || ['E','E+'].includes(d.latestRating)) && d.comparatio != null && d.comparatio < 95).length; }
function anSpofSet(data){ const s = new Set(); data.forEach(d => d.spofSkills.forEach(x => s.add(x))); return s; }

function anScorecard(data){
  if (!data.length) return '';
  const n = data.length;
  const crv = data.filter(d => d.comparatio != null).map(d => d.comparatio);
  const avgCR = crv.length ? Math.round(crv.reduce((a, b) => a + b, 0) / crv.length) : null;
  const avgU = Math.round(data.reduce((a, d) => a + d.utilizationPct, 0) / n);
  const fr = anFlightRiskCount(data);
  const fF = data.filter(d => d.gender === 'F').length;
  const pctF = Math.round(fF / n * 100);
  const spof = anSpofSet(data).size;
  const uColor = avgU > 100 ? AN_COLORS.danger : (avgU < 60 ? AN_COLORS.warn : AN_COLORS.secondary);
  const tile = (label, val, sub, color) => '<div style="flex:1;min-width:104px;border:1px solid var(--border);border-radius:8px;padding:9px 12px;background:var(--bg)">'
    + '<div style="font-size:21px;font-weight:700;line-height:1.1;color:'+(color || 'var(--text)')+'">'+val+'</div>'
    + '<div style="font-size:10px;color:var(--muted);margin-top:3px">'+label+'</div>'
    + (sub ? '<div style="font-size:9px;color:var(--muted);margin-top:1px">'+sub+'</div>' : '') + '</div>';
  let h = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">';
  h += tile(t('Headcount'), n, '');
  h += tile(t('Avg compa-ratio'), avgCR != null ? avgCR + '%' : '—', avgCR != null ? '' : t('no data'), avgCR != null && avgCR < 95 ? AN_COLORS.warn : null);
  h += tile(t('Flight risk'), fr, fr ? t('below-market stars') : t('none'), fr ? AN_COLORS.danger : null);
  h += tile(t('Avg utilisation'), avgU + '%', avgU > 100 ? t('over-allocated') : (avgU < 60 ? t('under-used') : ''), uColor);
  h += tile(t('Women'), pctF + '%', t('{a} of {b}',{a:fF,b:n}), null);
  h += tile(t('SPOF skills'), spof, spof ? t('single-holder') : t('none'), spof ? AN_COLORS.warn : null);
  const hiRisk = data.filter(d => d.riskScore >= 50).length;
  h += tile(t('High risk'), hiRisk, hiRisk ? t('score ≥ 50') : t('none'), hiRisk ? AN_COLORS.danger : null);
  h += '</div>';
  // completeness chips
  const chip = (label, filled) => '<span style="font-size:10px;color:var(--muted)">'+label+' <b style="color:'+(filled === n ? AN_COLORS.secondary : (filled >= n * 0.6 ? 'var(--text)' : AN_COLORS.warn))+'">'+filled+'/'+n+'</b></span>';
  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em">'+t('DATA COMPLETENESS')+'</span>'
    + chip(t('compa-ratio'), crv.length) + chip(t('reviews'), data.filter(d => d.latestRating).length)
    + chip(t('nine-box'), data.filter(d => d.nineBoxKey).length) + chip('DISC', data.filter(d => d.discProfile).length)
    + '</div>';
  return h;
}

/* ── Auto-insights: scan the (filtered) dataset, surface notable findings ── */
function anInsights(data){
  const out = [];
  const meanCR = g => { const v = data.filter(d => d.gender === g && d.comparatio != null).map(d => d.comparatio); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const m = meanCR('M'), f = meanCR('F');
  if (m != null && f != null){ const gap = Math.round((m - f) * 10) / 10; if (Math.abs(gap) >= 3) out.push({ sev:'danger', icon:'⚖', text:t('Pay gap: women average {n} pts {dir} men (compa-ratio)',{n:Math.abs(gap),dir:(gap>0?t('below'):t('above'))}), story:'pay_equity_full' }); }
  const fr = anFlightRiskCount(data);
  if (fr) out.push({ sev:'danger', icon:'🔥', text: t('{n} high performer(s) paid below market (flight risk)',{n:fr}), story:'retention_risk' });
  const hiRisk = data.filter(d => d.riskScore >= 50).length;
  if (hiRisk) out.push({ sev:'danger', icon:'🛰', text: t('{n} at high talent risk (composite score ≥ 50)',{n:hiRisk}), story:'talent_risk' });
  const overdue = data.filter(d => d.reviewCurrencyMonths == null || d.reviewCurrencyMonths > 24).length;
  if (overdue) out.push({ sev:'warn', icon:'🗓', text: t('{n} without a current review (>24 mo or none)',{n:overdue}), story:'review_governance' });
  const spof = anSpofSet(data).size;
  if (spof) out.push({ sev:'warn', icon:'🧩', text: t('{n} critical skill(s) held by one person (SPOF)',{n:spof}), story:'skill_coverage' });
  const over = data.filter(d => d.utilizationPct > 105).length;
  if (over) out.push({ sev:'warn', icon:'🩺', text: t('{n} engineer(s) over-allocated (>105%)',{n:over}), story:'capacity_health' });
  const bench = data.filter(d => d.utilizationPct < 10).length;
  if (bench) out.push({ sev:'info', icon:'🪑', text: t('{n} on the bench (<10% utilisation)',{n:bench}), story:'capacity_health' });
  const hipo = data.filter(d => d.nineBoxPot === 3 || d.potential === 'High').length;
  if (hipo) out.push({ sev:'info', icon:'🌱', text: t('{n} high-potential talent identified',{n:hipo}), story:'succession' });
  // Talent movement since a prior year (only when ≥2 nine-box years exist)
  const years = nbYears();
  if (years.length >= 2) {
    const cur = _nbYear, prev = _nbCompareYear || years[years.indexOf(cur) - 1] || years[0];
    if (prev && prev !== cur) {
      const cm = _nineBoxHistory[cur] || {}, pm = _nineBoxHistory[prev] || {};
      let up = 0, dn = 0; data.forEach(d => { const k = cm[d.id]; if (!k) return; const mv = nbMove(k, pm[d.id]); if (mv === 'up') up++; else if (mv === 'down') dn++; });
      if (up || dn) out.push({ sev: dn > up ? 'warn' : 'info', icon:'📈', text: t('{up} rising · {dn} declining in talent since {year}',{up:up,dn:dn,year:prev}), story:'talent_trajectory' });
    }
  }
  const rank = { danger:0, warn:1, info:2 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

function anInsightsBar(data){
  const ins = anInsights(data);
  if (!ins.length) return '';
  const col = { danger:AN_COLORS.danger, warn:AN_COLORS.warn, info:AN_COLORS.secondary };
  let h = '<div style="margin-bottom:14px">'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em;margin-bottom:6px">'+t('⚡ INSIGHTS')+'</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px">';
  ins.forEach(i => {
    h += '<button onclick="anPickStory(\''+i.story+'\')" title="'+t('Open the related story view')+'" '
      + 'style="display:flex;align-items:center;gap:7px;background:var(--bg);border:1px solid '+col[i.sev]+';border-left:3px solid '+col[i.sev]
      + ';border-radius:6px;padding:6px 11px;cursor:pointer;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--text)">'
      + '<span>'+i.icon+'</span><span>'+escH(i.text)+'</span><span style="color:var(--muted);font-size:9px">→</span></button>';
  });
  return h + '</div></div>';
}

/* ── Drill-down: click a chart shape → list the people behind it ── */
function anBindDrill(container){
  if (!container) return;
  container.addEventListener('click', e => {
    let el = e.target;
    while (el && el !== container && !(el.getAttribute && el.getAttribute('data-ids'))) el = el.parentNode;
    if (!el || el === container) return;
    const ids = el.getAttribute('data-ids').split(',').map(Number).filter(n => !isNaN(n));
    if (!ids.length) return;
    if (ids.length === 1){ anCloseDrill(); openIdCardModal(ids[0]); return; }
    anShowDrill(ids, el.getAttribute('data-dtitle') || t('Selection'));
  });
}
function anDrillEsc(e){ if (e.key === 'Escape') anCloseDrill(); }
export function anCloseDrill(){ const ov = G('an-drill'); if (ov) ov.remove(); document.removeEventListener('keydown', anDrillEsc); }
function anShowDrill(ids, title){
  const set = new Set(ids);
  const rows = buildAnalyticsDataset().filter(d => set.has(d.id)).sort((a, b) => (b.comparatio || 0) - (a.comparatio || 0));
  anCloseDrill();
  const ov = document.createElement('div');
  ov.id = 'an-drill';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center';
  ov.addEventListener('click', e => { if (e.target === ov) anCloseDrill(); });
  let h = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;max-width:560px;width:92%;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface)">'
    + '<div style="font-weight:700;color:var(--text);font-size:13px">'+escH(title)+' · '+t('{n} person(s)',{n:rows.length})+'</div>'
    + '<button onclick="anCloseDrill()" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:5px;cursor:pointer;font-size:12px;padding:3px 9px">✕</button></div>'
    + '<div style="padding:8px 10px">';
  rows.forEach(d => {
    h += '<div onclick="anCloseDrill();openIdCardModal('+d.id+')" '
      + 'style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border-left:3px solid '+(d.groupColor || '#888')+'" '
      + 'onmouseenter="this.style.background=\'rgba(200,241,53,.07)\'" onmouseleave="this.style.background=\'\'">'
      + '<div style="flex:1"><div style="font-weight:600;color:var(--text);font-size:12px">'+escH(d.name)+'</div>'
      + '<div style="font-size:10px;color:var(--muted)">'+escH(d.seniority || d.role || '—')+' · '+escH(d.group)+' · '+escH(d.location)+'</div></div>'
      + '<div style="text-align:right;font-size:10px;color:var(--muted);min-width:64px">'
      + (d.comparatio != null ? '<div>'+t('CR')+' '+d.comparatio+'%</div>' : '')
      + '<div>'+t('util')+' '+d.utilizationPct+'%</div>'
      + (d.latestRating ? '<div>'+t('rating')+' '+escH(d.latestRating)+'</div>' : '')
      + '</div></div>';
  });
  h += '</div><div style="padding:8px 16px 14px;font-size:10px;color:var(--muted)">'+t('Click a row to open their ID card.')+'</div></div>';
  ov.innerHTML = h;
  document.body.appendChild(ov);
  document.addEventListener('keydown', anDrillEsc);
}

/* ── Summary stats (HTML block) ── */
function anSummaryStats(values){
  const v = values.filter(x => x != null && !isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return '<div style="color:var(--muted);font-size:11px">'+t('n = 0')+'</div>';
  const n = v.length, sum = v.reduce((a, b) => a + b, 0), mean = sum / n;
  const q = p => { const i = (n - 1) * p, lo = Math.floor(i); return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo); };
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  const stat = (k, val) => '<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:2px 0">'
    + '<span style="color:var(--muted)">'+k+'</span><span style="color:var(--text);font-weight:600">'+val+'</span></div>';
  return stat('n', n) + stat(t('mean'), anNiceNum(mean)) + stat(t('median'), anNiceNum(q(.5)))
    + stat('p25', anNiceNum(q(.25))) + stat('p75', anNiceNum(q(.75)))
    + stat(t('min'), anNiceNum(v[0])) + stat(t('max'), anNiceNum(v[n-1])) + stat(t('std dev'), anNiceNum(sd));
}

/* ── "How to read a box plot" explainer (shown beneath the summary) ── */
function anBoxLegend(hasRef){
  const W = 180, H = 56, cy = 24, x0 = 16, x1 = 164, q1 = 60, q3 = 122, med = 96;
  let g = '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">';
  g += '<line x1="'+x0+'" y1="'+cy+'" x2="'+x1+'" y2="'+cy+'" stroke="'+AN_COLORS.muted+'"/>';
  g += '<line x1="'+x0+'" y1="'+(cy-5)+'" x2="'+x0+'" y2="'+(cy+5)+'" stroke="'+AN_COLORS.muted+'"/>';
  g += '<line x1="'+x1+'" y1="'+(cy-5)+'" x2="'+x1+'" y2="'+(cy+5)+'" stroke="'+AN_COLORS.muted+'"/>';
  g += '<rect x="'+q1+'" y="'+(cy-9)+'" width="'+(q3-q1)+'" height="18" rx="2" fill="rgba(200,241,53,.18)" stroke="'+AN_COLORS.primary+'"/>';
  g += '<line x1="'+med+'" y1="'+(cy-9)+'" x2="'+med+'" y2="'+(cy+9)+'" stroke="'+AN_COLORS.primary+'" stroke-width="2"/>';
  g += anTxt(x0, cy+18, 'min', {size:8, anchor:'middle', fill:AN_COLORS.muted});
  g += anTxt((q1+q3)/2, cy+18, 'IQR', {size:8, anchor:'middle', fill:AN_COLORS.muted});
  g += anTxt(x1, cy+18, 'max', {size:8, anchor:'middle', fill:AN_COLORS.muted});
  g += anTxt(med, cy-13, 'median', {size:8, anchor:'middle', fill:AN_COLORS.primary});
  g += '</svg>';
  const row = (c, t) => '<div style="display:flex;gap:7px;align-items:baseline;font-size:10px;color:var(--muted);padding:1px 0">'
    + '<span style="color:var(--text);font-weight:600;min-width:54px">'+c+'</span><span>'+t+'</span></div>';
  return '<div style="margin-top:10px;border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--bg)">'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em;margin-bottom:8px">'+t('HOW TO READ')+'</div>'
    + g
    + '<div style="margin-top:8px">'
    + row(t('Box'), t('middle 50% of people (Q1–Q3, the IQR)'))
    + row(t('Line'), t('median (50th percentile)'))
    + row(t('Whiskers'), t('min to max'))
    + (hasRef ? '<div style="display:flex;gap:7px;align-items:baseline;font-size:10px;color:var(--muted);padding:1px 0"><span style="color:'+AN_COLORS.secondary+';font-weight:600;min-width:54px">'+t('Dashed')+'</span><span>'+t('reference (midpoint 100%)')+'</span></div>' : '')
    + '</div></div>';
}

/* ══════════════════════════════════════════════════════════════════
   4. TEMPLATES registry + selection logic
   ══════════════════════════════════════════════════════════════════ */
function anTypeMatches(actual, required){
  if (required === 'any') return true;
  if (Array.isArray(required)) return required.includes(actual);
  return actual === required;
}

export function getAvailableTemplates(dimA, dimB){
  return ANALYTICS_TEMPLATES.filter(t => {
    if (t.isStoryView) return false;            // story views shown separately as pills
    if (t.match) return t.match(dimA, dimB);    // template-specific predicate overrides type logic
    if (!dimA) return false;
    if (!dimB) return t.dims === 1 && anTypeMatches(dimA.type, t.dimTypes[0]);
    return t.dims === 2 && (
      (anTypeMatches(dimA.type, t.dimTypes[0]) && anTypeMatches(dimB.type, t.dimTypes[1])) ||
      (anTypeMatches(dimA.type, t.dimTypes[1]) && anTypeMatches(dimB.type, t.dimTypes[0]))
    );
  });
}

// Helper: pick whichever dim matches a required type (for order-independent 2-dim templates)
function anWhich(dimA, dimB, typeReq){
  if (anTypeMatches(dimA.type, typeReq)) return [dimA, dimB];
  return [dimB, dimA];
}
function anGroupBy(data, dimId){
  const m = {};
  data.forEach(d => { const k = (d[dimId] === '' || d[dimId] == null) ? '—' : d[dimId]; (m[k] = m[k] || []).push(d); });
  return m;
}

export const ANALYTICS_TEMPLATES = [
  /* ── Single-dimension ── */
  { id:'histogram', name:t('Distribution'), icon:'📊', dims:1, dimTypes:[['numeric']],
    desc:t('Histogram with mean & median'),
    render(data, a){
      const vals = data.map(d => d[a.id]);
      const rows = data.map(d => ({ v: d[a.id], id: d.id }));
      const band = a.id === 'comparatio' ? { lo:95, hi:105, label:'market 95–105' }
        : a.id === 'utilizationPct' ? { lo:70, hi:90, label:'healthy 70–90' } : null;
      return { chart: anHistogram(rows, { xLabel: a.label, band }), stats: vals };
    } },

  { id:'bar_count', name:t('Count by Category'), icon:'▤', dims:1, dimTypes:[['categorical','ordinal','boolean']],
    nameFn:(a) => t('Headcount by {dim}',{dim:a.label}),
    desc:t('Horizontal bars sorted by count'),
    render(data, a){
      const g = anGroupBy(data, a.id);
      let items = Object.keys(g).map(k => ({ raw: k, label: anFmtVal(a.id, k), value: g[k].length, color: AN_COLORS.primary, ids: g[k].map(d => d.id) }));
      if (a.order){ const numeric = typeof a.order[0] === 'number'; const idx = v => a.order.indexOf(numeric ? +v : v);
        items.sort((x, y) => idx(x.raw) - idx(y.raw)); }
      else items.sort((x, y) => y.value - x.value);
      return { chart: anBarChart(items, { valLabel:'Headcount', catLabel:a.label }), stats: null };
    } },

  { id:'seniority_pyramid', name:t('Seniority Pyramid'), icon:'🔺', dims:1, dimTypes:[['ordinal']],
    match:(a, b) => !!(a && !b && a.id === 'seniority'),
    desc:t('Headcount per grade, junior → senior'),
    render(data, a){
      const g = anGroupBy(data, 'seniority');
      const items = SENIORITY_ORDER.filter(s => g[s]).map(s => ({ label: s, value: g[s].length, color: AN_COLORS.secondary, ids: g[s].map(d => d.id) }));
      return { chart: anBarChart(items, { valLabel:'Headcount', catLabel:'Seniority / Grade' }), stats: null };
    } },

  { id:'rating_dist', name:t('Rating Distribution'), icon:'⭐', dims:1, dimTypes:[['ordinal']],
    match:(a, b) => !!(a && !b && a.id === 'latestRating'),
    desc:t('Colour-coded latest-rating mix'),
    render(data){
      const g = anGroupBy(data.filter(d => d.latestRating), 'latestRating');
      const items = AN_RATING_ORDER.filter(r => g[r]).map(r => ({ label: r, value: g[r].length, color: AN_RATING_COLOR[r], ids: g[r].map(d => d.id) }));
      return { chart: anBarChart(items, { valLabel:'Headcount', catLabel:'Latest Perf Rating' }), stats: null };
    } },

  { id:'ninebox_grid', name:t('Nine-Box Grid'), icon:'⊞', dims:1, dimTypes:[['ninebox']],
    desc:t('3×3 talent grid with names'),
    render(data){ return { chart: anNineBox(data), stats: null }; } },

  /* ── Two-dimension ── */
  { id:'pay_by_grade', name:t('Box Plot by Category'), icon:'💶', dims:2, dimTypes:[['ordinal','categorical'],['numeric']],
    nameFn:(a, b) => { const num = a.type === 'numeric' ? a : b, cat = num === a ? b : a; return t('{num} by {cat}',{num:num.label,cat:cat.label}); },
    desc:t('Distribution (median / IQR / range) of a metric per category'),
    render(data, a, b){
      const [ord, num] = anWhich(a, b, ['ordinal','categorical']);
      const g = anGroupBy(data, ord.id);
      const keys = ord.order ? ord.order.filter(k => g[k]) : Object.keys(g);
      const groups = keys.map(k => ({ label: anFmtVal(ord.id, k), values: g[k].map(d => d[num.id]), ids: g[k].map(d => d.id) }));
      const ref = ord.id === 'comparatio' || num.id === 'comparatio' ? 100 : null;
      const band = num.id === 'comparatio' ? { lo:95, hi:105 } : num.id === 'utilizationPct' ? { lo:70, hi:90 } : null;
      return { chart: anBoxPlot(groups, { xLabel:num.label, ref, refLabel: ref ? 'midpoint 100%' : '', band }), stats: data.map(d => d[num.id]), kind:'box', ref: ref != null };
    } },

  { id:'perf_by_grade', name:t('Performance by Grade'), icon:'▥', dims:2, dimTypes:[['ordinal'],['ordinal']],
    match:(a, b) => !!(a && b && a.id !== b.id && (
      (a.id === 'latestRating' && b.type === 'ordinal') ||
      (b.id === 'latestRating' && a.type === 'ordinal'))),
    desc:t('Stacked rating mix per grade'),
    render(data, a, b){
      // one axis must be the rating dimension
      const ratingDim = (a.id==='latestRating') ? a : (b.id==='latestRating' ? b : null);
      const gradeDim  = ratingDim === a ? b : a;
      if (!ratingDim) return { chart: anEmpty(t('One axis must be Latest Perf Rating')), stats: null };
      const g = anGroupBy(data.filter(d => d.latestRating), gradeDim.id);
      const keys = gradeDim.order ? gradeDim.order.filter(k => g[k]) : Object.keys(g);
      const rows = keys.map(k => ({
        label: anFmtVal(gradeDim.id, k),
        segs: AN_RATING_ORDER.map(r => ({ key:r, color:AN_RATING_COLOR[r], value: g[k].filter(d => d.latestRating===r).length, ids: g[k].filter(d => d.latestRating===r).map(d => d.id) })),
      }));
      return { chart: anStackedBar(rows, { valLabel:'Headcount', catLabel:gradeDim.label,
        legend: AN_RATING_ORDER.map(r => ({ key:r, color:AN_RATING_COLOR[r] })) }), stats: null };
    } },

  { id:'pay_perf_matrix', name:t('Pay × Performance'), icon:'🎯', dims:2, dimTypes:[['numeric'],['ordinal']],
    match:(a, b) => !!(a && b && (
      (a.type === 'numeric' && b.id === 'latestRating') ||
      (b.type === 'numeric' && a.id === 'latestRating'))),
    desc:t('Compa-ratio × rating, flight/cost-risk quadrants'),
    render(data, a, b){
      const num = a.type==='numeric' ? a : b;
      const ord = num===a ? b : a;
      const pts = data.filter(d => d[num.id] != null && d[ord.id] != null).map(d => ({
        x: d[num.id],
        y: ord.id==='latestRating' ? AN_RATING_NUM[d[ord.id]] : +d[ord.id],
        label: d.name + ' · '+d[num.id]+' / '+d[ord.id],
        color: d.groupColor, id: d.id,
      }));
      return { chart: anScatter(pts, { xLabel:num.label, yLabel:ord.label, trend:true }), stats: data.map(d => d[num.id]) };
    } },

  { id:'scatter', name:t('Scatter Plot'), icon:'📈', dims:2, dimTypes:[['numeric'],['numeric']],
    desc:t('Numeric × numeric, group-coloured'),
    render(data, a, b){
      const pts = data.filter(d => d[a.id] != null && d[b.id] != null).map(d => ({
        x:d[a.id], y:d[b.id], label:d.name, color:d.groupColor, id:d.id }));
      return { chart: anScatter(pts, { xLabel:a.label, yLabel:b.label, trend:true, corr:true }), stats: null };
    } },

  { id:'tenure_pay', name:t('Tenure vs Pay'), icon:'📉', dims:2, dimTypes:[['numeric'],['numeric']],
    match:(a, b) => !!(a && b && a.type === 'numeric' && b.type === 'numeric' &&
      (a.id === 'tenureYears' || b.id === 'tenureYears') && a.id !== b.id),
    desc:t('Scatter + trend & r — detect pay drift'),
    render(data, a, b){
      const ten = a.id === 'tenureYears' ? a : b, pay = ten === a ? b : a;
      const pts = data.filter(d => d[ten.id] != null && d[pay.id] != null)
        .map(d => ({ x:d[ten.id], y:d[pay.id], label:d.name, color:d.groupColor, id:d.id }));
      return { chart: anScatter(pts, { xLabel:ten.label, yLabel:pay.label, trend:true, corr:true }), stats: data.map(d => d[pay.id]) };
    } },

  { id:'util_by_group', name:t('Avg by Category'), icon:'📶', dims:2, dimTypes:[['categorical'],['numeric']],
    desc:t('Mean metric per category (util over/under coloured)'),
    render(data, a, b){
      const cat = a.type === 'categorical' ? a : b, num = cat === a ? b : a;
      const g = anGroupBy(data, cat.id);
      const items = Object.keys(g).map(k => {
        const vals = g[k].map(d => d[num.id]).filter(v => v != null && !isNaN(v));
        const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        let color = AN_COLORS.primary;
        if (num.id === 'utilizationPct') color = avg > 100 ? AN_COLORS.danger : (avg < 60 ? AN_COLORS.warn : AN_COLORS.secondary);
        return { label: anFmtVal(cat.id, k), value: Math.round(avg * 10) / 10, color, ids: g[k].map(d => d.id) };
      }).sort((x, y) => y.value - x.value);
      return { chart: anBarChart(items, { valLabel: 'Avg ' + num.label, catLabel: cat.label }), stats: data.map(d => d[num.id]) };
    } },

  { id:'heatmap_2d', name:t('Heatmap'), icon:'▦', dims:2, dimTypes:[['categorical','ordinal'],['categorical','ordinal']],
    desc:t('Count matrix, density-coloured'),
    render(data, a, b){
      const rowVals = anCatValues(data, a), colVals = anCatValues(data, b);
      const cellOf = (rv, cv) => data.filter(d => String(anCell(d, a)) === String(rv) && String(anCell(d, b)) === String(cv));
      const matrix = rowVals.map(rv => colVals.map(cv => cellOf(rv, cv).length));
      const ids = rowVals.map(rv => colVals.map(cv => cellOf(rv, cv).map(d => d.id)));
      const rowDisp = rowVals.map(v => anFmtVal(a.id, v)), colDisp = colVals.map(v => anFmtVal(b.id, v));
      return { chart: anHeatmap(matrix, rowDisp, colDisp, { rowLabel:a.label, colLabel:b.label, unit:'people', ids }), stats: null };
    } },

  /* ── Story views (always available; no dimensions) ── */
  { id:'retention_risk', name:t('Retention Risk'), icon:'🔥', dims:0, isStoryView:true,
    desc:t('Stars & Key Players paid below market'),
    render(data){ return { chart: anStoryRetention(data), stats: null }; } },

  { id:'pay_equity_full', name:t('Pay Equity'), icon:'⚖', dims:0, isStoryView:true,
    desc:t('Compa-ratio distribution by grade'),
    render(data){ return { chart: anStoryPayEquity(data), stats: data.map(d => d.comparatio), kind:'box', ref:true }; } },

  { id:'succession', name:t('Succession'), icon:'🌱', dims:0, isStoryView:true,
    desc:t('High-potential talent by grade'),
    render(data){ return { chart: anStorySuccession(data), stats: null }; } },

  { id:'talent_trajectory', name:t('Talent Trajectory'), icon:'📈', dims:0, isStoryView:true,
    desc:t('Nine-box movement between two years'),
    render(data){ return { chart: anStoryTrajectory(data), stats: null }; } },

  { id:'capacity_health', name:t('Capacity Health'), icon:'🩺', dims:0, isStoryView:true,
    desc:t('Utilisation buckets, bench & over-allocation'),
    render(data){ return { chart: anStoryCapacity(data), stats: data.map(d => d.utilizationPct) }; } },

  { id:'skill_coverage', name:t('Skill Coverage'), icon:'🧩', dims:0, isStoryView:true,
    desc:t('Skill domain × team, with SPOF flags'),
    render(data){ return { chart: anStorySkillCoverage(data), stats: null }; } },

  { id:'disc_team', name:t('Team Dynamics'), icon:'◉', dims:0, isStoryView:true,
    desc:t('DISC distribution by team'),
    render(data){ return { chart: anStoryDiscTeam(data), stats: null }; } },

  { id:'talent_risk', name:t('Talent Risk Radar'), icon:'🛰', dims:0, isStoryView:true,
    desc:t('Composite risk score — who needs attention first'),
    render(data){ return { chart: anStoryTalentRisk(data), stats: data.map(d => d.riskScore) }; } },

  { id:'review_governance', name:t('Review Governance'), icon:'🗓', dims:0, isStoryView:true,
    desc:t('Review freshness, aging & overdue'),
    render(data){ return { chart: anStoryReviewGov(data), stats: data.map(d => d.reviewCurrencyMonths) }; } },

  { id:'pay_progression', name:t('Pay Progression'), icon:'📐', dims:0, isStoryView:true,
    desc:t('Compa-ratio vs tenure — compression & inversions'),
    render(data){ return { chart: anStoryPayProgression(data), stats: data.map(d => d.comparatio), kind:'scatter' }; } },
];

/* ── Story view bodies ── */
function anStoryRetention(data){
  // High value (nine-box perf or pot = 3, or rating E/E+) + comparatio < 95 = flight risk
  const flagged = data.filter(d => {
    const star = (d.nineBoxPerf === 3 || d.nineBoxPot === 3 || ['E','E+'].includes(d.latestRating));
    return star && d.comparatio != null && d.comparatio < 95;
  }).sort((a, b) => (a.comparatio||0) - (b.comparatio||0));
  if (!flagged.length) return anEmpty(t('No flight-risk engineers (need nine-box / rating + compa-ratio data)'));
  let h = '<div style="display:flex;flex-direction:column;gap:8px">';
  flagged.forEach(d => {
    h += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-left:3px solid '+AN_COLORS.danger+';border-radius:6px;background:rgba(241,67,53,.05)">'
      + '<div style="flex:1"><div style="font-weight:600;color:var(--text)">'+escH(d.name)+'</div>'
      + '<div style="font-size:10px;color:var(--muted)">'+escH(d.seniority||d.role||'')+' · '+escH(d.group)
      + (d.nineBoxKey?' · 9box '+escH(d.nineBoxKey):'')+(d.latestRating?' · '+escH(d.latestRating):'')+'</div></div>'
      + '<div style="text-align:right"><div style="font-weight:700;color:'+AN_COLORS.danger+'">'+d.comparatio+'%</div>'
      + '<div style="font-size:9px;color:var(--muted)">'+t('compa-ratio')+'</div></div></div>';
  });
  return h + '</div>';
}

function anChips(list, color, label, sub){
  if (!list.length) return '';
  return '<div style="margin-top:12px"><div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;margin-bottom:5px">'+escH(label)+' · '+list.length+'</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
    + list.map(d => '<span style="border:1px solid var(--border);border-left:3px solid '+color+';border-radius:5px;padding:4px 8px;font-size:11px;color:var(--text)">'
      + escH(d.name) + (sub ? ' <span style="color:var(--muted);font-size:9px">'+escH(sub(d))+'</span>' : '') + '</span>').join('')
    + '</div></div>';
}

function anStoryCapacity(data){
  if (!data.length) return anEmpty(t('No engineers match the current filters'));
  const buckets = [
    {key:t('Bench (<10%)'),     test:u => u < 10,            color:AN_COLORS.muted},
    {key:t('Under (10–70%)'),   test:u => u >= 10 && u < 70, color:AN_COLORS.warn},
    {key:t('Healthy (70–105%)'),test:u => u >= 70 && u <= 105,color:AN_COLORS.secondary},
    {key:t('Over (>105%)'),     test:u => u > 105,           color:AN_COLORS.danger},
  ];
  const items = buckets.map(b => ({ label:b.key, value:data.filter(d => b.test(d.utilizationPct)).length, color:b.color, ids:data.filter(d => b.test(d.utilizationPct)).map(d => d.id) }));
  const over  = data.filter(d => d.utilizationPct > 105).sort((a, b) => b.utilizationPct - a.utilizationPct);
  const bench = data.filter(d => d.utilizationPct < 10);
  return anBarChart(items, { valLabel:'Headcount', catLabel:'Utilisation band' })
    + anChips(over,  AN_COLORS.danger, t('OVER-ALLOCATED'), d => d.utilizationPct + '%')
    + anChips(bench, AN_COLORS.muted,  t('ON THE BENCH'),   d => d.utilizationPct + '%');
}

function anStorySkillCoverage(data){
  const teams = [...new Set(data.map(d => d.group))].sort();
  const domains = skillDomains.slice();
  data.forEach(d => d.skills.forEach(s => { const dom = s.domain || 'General'; if (domains.indexOf(dom) < 0) domains.push(dom); }));
  const rows = [], rowLabels = [], idRows = [];
  domains.forEach(dom => {
    const r = teams.map(tm => data.filter(d => d.group === tm)
      .reduce((s, d) => s + d.skills.filter(sk => (sk.domain || 'General') === dom).length, 0));
    if (r.some(v => v > 0)) {
      rows.push(r); rowLabels.push(dom);
      idRows.push(teams.map(tm => data.filter(d => d.group === tm && d.skills.some(sk => (sk.domain || 'General') === dom)).map(d => d.id)));
    }
  });
  const heat = rowLabels.length ? anHeatmap(rows, rowLabels, teams, { rowLabel:'Skill domain', colLabel:'Team', unit:'skills', ids:idRows }) : anEmpty(t('No skills recorded yet'));
  const spof = [];
  data.forEach(d => d.spofSkills.forEach(sk => spof.push({ name:d.name, _sk:sk })));
  let spofH = '';
  if (spof.length) {
    spofH = '<div style="margin-top:14px"><div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:'+AN_COLORS.danger+';letter-spacing:.06em;margin-bottom:5px">'+t('⚠ SPOF — CRITICAL SKILLS WITH A SINGLE HOLDER')+' · '+spof.length+'</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
      + spof.map(p => '<span style="border:1px solid var(--border);border-left:3px solid '+AN_COLORS.danger+';border-radius:5px;padding:4px 8px;font-size:11px;color:var(--text)">'
        + escH(p._sk) + ' <span style="color:var(--muted);font-size:9px">'+escH(p.name)+'</span></span>').join('')
      + '</div></div>';
  }
  return heat + spofH;
}

function anStoryDiscTeam(data){
  const withDisc = data.filter(d => d.discProfile);
  if (!withDisc.length) return anEmpty(t('No DISC placements yet (place engineers on the DISC tab)'));
  const DCOL = {D:'#f14335', I:'#c8f135', S:'#5be5c8', C:'#9090f0'};
  const teams = [...new Set(withDisc.map(d => d.group))].sort();
  const rows = teams.map(tm => {
    const members = withDisc.filter(d => d.group === tm);
    return { label:tm, segs:['D','I','S','C'].map(k => ({ key:k, color:DCOL[k], value:members.filter(d => d.discProfile === k).length, ids:members.filter(d => d.discProfile === k).map(d => d.id) })) };
  });
  const discNames = { D:t('D — Dominance'), I:t('I — Influence'), S:t('S — Steadiness'), C:t('C — Conscientiousness') };
  const legend = '<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px;font-size:10px">'
    + ['D','I','S','C'].map(k => '<span style="color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;background:'+DCOL[k]+';border-radius:2px;margin-right:4px;vertical-align:middle"></span>'+discNames[k]+'</span>').join('')
    + '</div>';
  return legend + anStackedBar(rows, { valLabel:'Headcount', catLabel:'Team' });
}

function anStoryTrajectory(data){
  const years = nbYears();
  if (years.length < 2) return anEmpty(t('Add a second nine-box year (Nine-Box tab → ＋) to compare talent movement over time.'));
  const cur = _nbYear;
  let prev = _nbCompareYear || years[years.indexOf(cur) - 1] || years[0];
  if (prev === cur) prev = years[years.indexOf(cur) - 1] || years.find(y => y !== cur) || cur;
  const curMap = _nineBoxHistory[cur] || {}, prevMap = _nineBoxHistory[prev] || {};
  const NBL = { '1-3':t('Enigma'),'2-3':t('Future Star'),'3-3':t('Star'),'1-2':t('Under-perf'),'2-2':t('Core'),'3-2':t('High Perf'),'1-1':t('Risk'),'2-1':t('Effective'),'3-1':t('Expert') };
  const groups = { up:[], down:[], 'new':[], same:[] };
  data.forEach(d => { const k = curMap[d.id]; if (!k) return; const mv = nbMove(k, prevMap[d.id]); if (groups[mv]) groups[mv].push({ d, from: prevMap[d.id] || null, to: k }); });
  const order = [
    { key:'up',   label:t('RISING ▲'),    color:'#c8f135' },
    { key:'down', label:t('DECLINING ▼'), color:'#f14335' },
    { key:'new',  label:t('NEW ✦'),       color:'#5be5c8' },
    { key:'same', label:t('STABLE •'),    color:AN_COLORS.muted },
  ];
  let h = '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">'+t('Movement')+' <b style="color:var(--text)">'+escH(prev)+'</b> → <b style="color:var(--accent)">'+escH(cur)+'</b></div>';
  if (!order.some(o => groups[o.key].length)) return h + anEmpty(t('No placements to compare in these two years.'));
  order.forEach(o => {
    const list = groups[o.key]; if (!list.length) return;
    h += '<div style="margin-bottom:12px"><div style="font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:.06em;margin-bottom:5px;color:'+o.color+'">'+o.label+' · '+list.length+'</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    list.forEach(it => {
      const path = (it.from ? (NBL[it.from]||it.from) : '—') + ' → ' + (NBL[it.to]||it.to);
      h += '<span data-ids="'+it.d.id+'" style="cursor:pointer;border:1px solid var(--border);border-left:3px solid '+o.color+';border-radius:5px;padding:4px 8px;font-size:11px;color:var(--text)">'
        + escH(it.d.name) + ' <span style="color:var(--muted);font-size:9px">'+escH(path)+'</span></span>';
    });
    h += '</div></div>';
  });
  return h;
}

function anStorySuccession(data){
  // High potential = nine-box potential 3, or GTP potential 'High'
  const hp = data.filter(d => d.nineBoxPot === 3 || d.potential === 'High');
  if (!hp.length) return anEmpty(t('No high-potential talent flagged (set Nine-Box potential = high, or GTP Potential = High)'));
  const g = {};
  hp.forEach(d => { const k = d.seniority || '—'; (g[k] = g[k] || []).push(d); });
  const keys = SENIORITY_ORDER.filter(k => g[k]);
  Object.keys(g).forEach(k => { if (keys.indexOf(k) < 0) keys.push(k); });
  let h = '<div style="display:flex;flex-direction:column;gap:10px">';
  keys.forEach(k => {
    h += '<div><div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:var(--muted);letter-spacing:.06em;margin-bottom:5px">'+escH(k)+' · '+g[k].length+'</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    g[k].forEach(d => h += '<span style="border:1px solid var(--border);border-left:3px solid '+AN_COLORS.secondary
      + ';border-radius:5px;padding:5px 9px;font-size:11px;background:rgba(91,229,200,.06);color:var(--text)">'+escH(d.name)
      + (d.nineBoxKey ? ' <span style="color:var(--muted);font-size:9px">'+escH(d.nineBoxKey)+'</span>' : '')+'</span>');
    h += '</div></div>';
  });
  return h + '</div>';
}

function anStoryPayEquity(data){
  const g = anGroupBy(data.filter(d => d.comparatio != null), 'seniority');
  const keys = SENIORITY_ORDER.filter(k => g[k]);
  if (!keys.length) return anEmpty(t('No compa-ratio data by grade'));
  const groups = keys.map(k => ({ label: k, values: g[k].map(d => d.comparatio), ids: g[k].map(d => d.id) }));
  return anBoxPlot(groups, { ref: 100, refLabel: 'midpoint 100%', xLabel: 'Compa-ratio (%)', catLabel: 'Seniority / Grade', band: { lo:95, hi:105 } });
}

/* Talent Risk Radar — ranked list of at-risk people with their factor breakdown.
   Reuses the composite anRiskModel score computed on the dataset. */
function anStoryTalentRisk(data){
  const flagged = data.filter(d => d.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore);
  if (!flagged.length) return anEmpty(t('No talent-risk signals — add compa-ratio, nine-box, reviews, skills or allocations to light this up.'));
  const bands = [
    { key:t('High (≥50)'),   test:s => s >= 50,           color:AN_COLORS.danger },
    { key:t('Medium (25–49)'),test:s => s >= 25 && s < 50, color:AN_COLORS.warn },
    { key:t('Low (1–24)'),   test:s => s > 0 && s < 25,   color:AN_COLORS.secondary },
  ];
  // Band summary tiles
  let h = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">';
  bands.forEach(b => { const list = flagged.filter(d => b.test(d.riskScore));
    h += '<div style="flex:1;min-width:120px;border:1px solid var(--border);border-left:3px solid '+b.color+';border-radius:8px;padding:9px 12px;background:var(--bg)">'
      + '<div style="font-size:21px;font-weight:700;color:'+b.color+'">'+list.length+'</div>'
      + '<div style="font-size:10px;color:var(--muted);margin-top:2px">'+b.key+'</div></div>'; });
  h += '</div>';
  // Ranked cards (clickable → drill/ID card)
  h += '<div style="display:flex;flex-direction:column;gap:7px">';
  flagged.forEach(d => {
    const col = anRiskColor(d.riskScore);
    h += '<div data-ids="'+d.id+'" data-dtitle="'+escH(d.name)+'" style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--border);border-left:3px solid '+col+';border-radius:6px">'
      + '<div style="min-width:40px;text-align:center"><div style="font-size:18px;font-weight:700;color:'+col+';line-height:1;pointer-events:none">'+d.riskScore+'</div>'
      + '<div style="font-size:8px;color:var(--muted);pointer-events:none">'+t('risk')+'</div></div>'
      + '<div style="flex:1;min-width:0;pointer-events:none">'
      + '<div style="font-weight:600;color:var(--text);font-size:12px">'+escH(d.name)+'</div>'
      + '<div style="font-size:10px;color:var(--muted)">'+escH(d.seniority || d.role || '')+' · '+escH(d.group)+'</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">'
      + d.riskFactors.map(f => '<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(241,164,53,.10);border:1px solid var(--border);color:var(--text)">'+escH(f.k)+' <span style="color:var(--muted)">+'+f.p+'</span></span>').join('')
      + '</div></div></div>';
  });
  h += '</div>';
  return h;
}

/* Review Governance — how fresh are performance reviews across the (filtered) team. */
function anStoryReviewGov(data){
  if (!data.length) return anEmpty(t('No engineers match the current filters'));
  const buckets = [
    { key:t('Fresh (≤12 mo)'),  test:d => d.reviewCurrencyMonths != null && d.reviewCurrencyMonths <= 12, color:AN_COLORS.secondary },
    { key:t('Aging (12–24 mo)'),test:d => d.reviewCurrencyMonths != null && d.reviewCurrencyMonths > 12 && d.reviewCurrencyMonths <= 24, color:AN_COLORS.warn },
    { key:t('Overdue (>24 mo)'),test:d => d.reviewCurrencyMonths != null && d.reviewCurrencyMonths > 24, color:AN_COLORS.danger },
    { key:t('Never reviewed'),  test:d => d.reviewCurrencyMonths == null, color:AN_COLORS.muted },
  ];
  const items = buckets.map(b => { const list = data.filter(b.test);
    return { label:b.key, value:list.length, color:b.color, ids:list.map(d => d.id) }; });
  const needsReview = data.filter(d => d.reviewCurrencyMonths == null || d.reviewCurrencyMonths > 24)
    .sort((a, b) => (b.reviewCurrencyMonths || 999) - (a.reviewCurrencyMonths || 999));
  return anBarChart(items, { valLabel:t('Headcount'), catLabel:t('Review freshness') })
    + anChips(needsReview, AN_COLORS.danger, t('NEEDS A REVIEW'),
        d => d.reviewCurrencyMonths == null ? t('never') : d.reviewCurrencyMonths + t('mo'));
}

/* Pay Progression — compa-ratio vs tenure, to expose compression (long-tenured yet
   below market) and flat/negative pay drift. */
function anStoryPayProgression(data){
  const pts = data.filter(d => d.comparatio != null && d.tenureYears != null)
    .map(d => ({ x:d.tenureYears, y:d.comparatio, label:d.name, color:d.groupColor, id:d.id }));
  if (pts.length < 3) return anEmpty(t('Need ≥3 people with both compa-ratio and a start date.'));
  const chart = anScatter(pts, { xLabel:t('Tenure (years)'), yLabel:t('Compa-ratio (%)'), trend:true, corr:true });
  // Compression watchlist: tenured (>4y) yet paid below market (<92%)
  const compressed = data.filter(d => d.comparatio != null && d.tenureYears != null && d.tenureYears > 4 && d.comparatio < 92)
    .sort((a, b) => a.comparatio - b.comparatio);
  return chart + anChips(compressed, AN_COLORS.warn, t('COMPRESSION WATCH — tenured & below market'),
    d => d.comparatio + '% · ' + d.tenureYears + t('y'));
}

/* ══════════════════════════════════════════════════════════════════
   5. TAB SHELL + render orchestration
   ══════════════════════════════════════════════════════════════════ */
export function renderAnalyticsTab(){
  const dimsByGroup = {};
  ANALYTICS_DIMENSIONS.forEach(d => { (dimsByGroup[d.group] = dimsByGroup[d.group] || []).push(d); });
  const dimOpts = sel => '<option value="">'+t('— none —')+'</option>' + Object.keys(dimsByGroup).map(grp =>
    '<optgroup label="'+escH(grp)+'">' + dimsByGroup[grp].map(d =>
      '<option value="'+d.id+'"'+(sel===d.id?' selected':'')+'>'+escH(d.label)+'</option>').join('') + '</optgroup>').join('');

  const stories = ANALYTICS_TEMPLATES.filter(t => t.isStoryView);
  const ds = buildAnalyticsDataset();
  const groups = [...new Set(ds.map(d => d.group))].sort();
  const locs   = [...new Set(ds.map(d => d.location))].sort();
  const sens   = SENIORITY_ORDER.filter(s => ds.some(d => d.seniority === s));

  const pill = (id, name, icon, active) =>
    '<button onclick="anPickStory(\''+id+'\')" style="background:'+(active?'rgba(200,241,53,.12)':'var(--bg)')
    + ';border:1px solid '+(active?'var(--accent)':'var(--border)')+';color:'+(active?'var(--accent)':'var(--text)')
    + ';font-family:IBM Plex Mono,monospace;font-size:11px;padding:6px 12px;border-radius:6px;cursor:pointer">'+icon+' '+escH(name)+'</button>';

  const selStyle = 'background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 8px;border-radius:4px;min-width:170px';

  // View-toggle button (collapse KPI / Insights panels to free up chart space)
  const vtog = (key, label) => { const on = _anState.show[key];
    return '<button onclick="anToggleView(\''+key+'\')" title="'+t('Show/hide the {label} panel',{label:label})+'" '
      + 'style="background:'+(on?'rgba(200,241,53,.10)':'var(--bg)')+';border:1px solid '+(on?'var(--accent)':'var(--border)')
      + ';color:'+(on?'var(--accent)':'var(--muted)')+';font-family:IBM Plex Mono,monospace;font-size:10px;padding:4px 9px;border-radius:5px;cursor:pointer">'
      + (on?'▾ ':'▸ ')+label+'</button>'; };

  let h = '<div style="padding:14px 16px">';
  // Story pills + view toggles
  h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em">'+t('STORY VIEWS')+'</span>'
    + '<span style="display:flex;gap:6px;align-items:center"><span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em">'+t('PANELS')+'</span>'
    + vtog('kpi', t('KPIs')) + vtog('insights', t('Insights')) + '</span></div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'
    + stories.map(s => pill(s.id, s.name, s.icon, _anState.story === s.id)).join('') + '</div>';
  // Compare row
  h += '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px;padding-top:10px;border-top:1px solid var(--border)">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em">'+t('COMPARE')+'</span>'
    + '<label style="font-size:11px;color:var(--muted)">A <select id="an-dimA" onchange="anPickDim()" style="'+selStyle+'">'+dimOpts(_anState.dimA)+'</select></label>'
    + '<span style="color:var(--muted)">×</span>'
    + '<label style="font-size:11px;color:var(--muted)">B <select id="an-dimB" onchange="anPickDim()" style="'+selStyle+'">'+dimOpts(_anState.dimB)+'</select></label>'
    + '</div>';
  // Filter row (reuse the app's multi-select dropdown helper)
  h += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em">'+t('FILTER')+'</span>'
    + multiSelectHTML('an-fgroup', groups, _anState.filters.group, 'anFilterGroup', t('Group: All'))
    + multiSelectHTML('an-floc',   locs,   _anState.filters.location, 'anFilterLoc', t('Location: All'))
    + multiSelectHTML('an-fsen',   sens,   _anState.filters.seniority, 'anFilterSen', t('Seniority: All'))
    + '<button onclick="anClearFilters()" style="background:var(--bg);border:1px solid var(--border);color:var(--muted);font-family:IBM Plex Mono,monospace;font-size:11px;padding:4px 10px;border-radius:4px;cursor:pointer">'+t('✕ Clear')+'</button>'
    + '</div>';
  // Main (swapped on every interaction)
  h += '<div id="an-main"></div>';
  h += '</div>';
  G('res-body').innerHTML = h;
  anRenderMain();
}

function anApplyFilters(data){
  const f = _anState.filters;
  return data.filter(d =>
    (f.group.size === 0 || f.group.has(d.group)) &&
    (f.location.size === 0 || f.location.has(d.location)) &&
    (f.seniority.size === 0 || f.seniority.has(d.seniority)));
}

function anActiveTemplate(){
  if (_anState.story) return ANALYTICS_TEMPLATES.find(t => t.id === _anState.story) || null;
  const dimA = anDim(_anState.dimA), dimB = anDim(_anState.dimB);
  const avail = getAvailableTemplates(dimA, dimB);
  if (!avail.length) return null;
  let t = avail.find(x => x.id === _anState.template);
  if (!t) { t = avail[0]; _anState.template = t.id; }
  return t;
}

function anRenderMain(){
  const main = G('an-main'); if (!main) return;
  const dataAll = anApplyFilters(buildAnalyticsDataset());
  const dimA = anDim(_anState.dimA), dimB = anDim(_anState.dimB);

  let h = '';
  // Headline scorecard + auto-insights (reflect current filters; collapsible for chart space)
  if (_anState.show.kpi) h += anScorecard(dataAll);
  if (_anState.show.insights) h += anInsightsBar(dataAll);
  // Template card row (compare mode only)
  if (!_anState.story) {
    const avail = getAvailableTemplates(dimA, dimB);
    if (!dimA && !dimB) {
      h += '<div style="color:var(--muted);font-size:12px;padding:8px 0">'+t('Pick a dimension above, or choose a story view.')+'</div>';
    } else if (!avail.length) {
      h += '<div style="color:var(--muted);font-size:12px;padding:8px 0">'+t('No template fits that dimension combination. Try another pairing.')+'</div>';
    } else {
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">';
      avail.forEach(t => {
        const sel = t.id === _anState.template;
        h += '<button onclick="anPickTemplate(\''+t.id+'\')" title="'+escH(t.desc)+'" '
          + 'style="background:'+(sel?'rgba(200,241,53,.10)':'var(--bg)')+';border:1px solid '+(sel?'var(--accent)':'var(--border)')
          + ';border-radius:8px;padding:10px 12px;cursor:pointer;text-align:left;min-width:130px;max-width:170px">'
          + '<div style="font-size:18px;margin-bottom:4px">'+t.icon+'</div>'
          + '<div style="font-size:11px;font-weight:600;color:'+(sel?'var(--accent)':'var(--text)')+'">'+escH(anTplName(t, dimA, dimB))+(sel?' ✓':'')+'</div>'
          + '<div style="font-size:9px;color:var(--muted);margin-top:2px">'+escH(t.desc)+'</div>'
          + '</button>';
      });
      h += '</div>';
    }
  }

  const tpl = anActiveTemplate();
  let chartKind = null, chartRef = false;
  h += '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">';
  h += '<div id="an-chart" style="flex:1;min-width:340px;border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--surface)">';
  if (tpl) {
    if (dataAll.length < 1 && tpl.dims) h += anEmpty(t('No engineers match the current filters'));
    else {
      let out;
      try { out = tpl.render(dataAll, dimA, dimB); }
      catch (err) { out = { chart: anEmpty(t('Render error:') + ' ' + err.message), stats: null }; }
      h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--text)">'+tpl.icon+' '+escH(anTplName(tpl, dimA, dimB))+'</div>';
      h += out.chart;
      main._anStats = out.stats;
      chartKind = out.kind || null; chartRef = !!out.ref;
    }
  } else {
    h += anEmpty(t('Select a dimension or story view to begin'));
    main._anStats = null;
  }
  h += '</div>';

  // Right column: summary panel + (for box plots) a "how to read" legend
  const stats = (tpl && main._anStats) ? main._anStats : null;
  h += '<div style="width:180px;flex-shrink:0">';
  h += '<div id="an-summary" style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">'
    + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);letter-spacing:.08em;margin-bottom:8px">'+t('SUMMARY')+'</div>'
    + (stats ? anSummaryStats(stats) : '<div style="font-size:11px;color:var(--muted)">'+t('n = {n}',{n:dataAll.length})+'<br><span style="font-size:10px">'+t('(no numeric series)')+'</span></div>')
    + '</div>';
  if (chartKind === 'box') h += anBoxLegend(chartRef);
  h += '</div>';
  h += '</div>';

  // Export bar
  h += '<div style="display:flex;gap:8px;margin-top:12px">'
    + '<button onclick="anExportCSV()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:5px 12px;border-radius:4px;cursor:pointer">↓ CSV</button>'
    + '<button onclick="anExportPNG()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:5px 12px;border-radius:4px;cursor:pointer">↓ PNG</button>'
    + '<button onclick="anExportPDF()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:IBM Plex Mono,monospace;font-size:11px;padding:5px 12px;border-radius:4px;cursor:pointer">↓ PDF</button>'
    + '</div>';

  main.innerHTML = h;
  anBindTips(G('an-chart'));
  anBindDrill(G('an-chart'));
}

/* ══════════════════════════════════════════════════════════════════
   6. Interaction handlers (global — called from inline onclick/onchange)
   ══════════════════════════════════════════════════════════════════ */
export function anPickStory(id){
  _anState.story = (_anState.story === id) ? null : id;
  if (_anState.story) { _anState.dimA = null; _anState.dimB = null; _anState.template = null; }
  renderAnalyticsTab();
}
export function anPickDim(){
  const hadStory = !!_anState.story;
  _anState.dimA = G('an-dimA').value || null;
  _anState.dimB = G('an-dimB').value || null;
  _anState.story = null;
  _anState.template = null;
  // If we were in a story view, the shell pills need re-rendering to drop the highlight.
  if (hadStory) renderAnalyticsTab(); else anRenderMain();
}
export function anPickTemplate(id){ _anState.template = id; anRenderMain(); }
export function anToggleView(key){ _anState.show[key] = !_anState.show[key]; anSaveView(); renderAnalyticsTab(); }
export function anFilterGroup(s){ _anState.filters.group = s; anRenderMain(); }
export function anFilterLoc(s){ _anState.filters.location = s; anRenderMain(); }
export function anFilterSen(s){ _anState.filters.seniority = s; anRenderMain(); }
export function anClearFilters(){
  _anState.filters = { group:new Set(), location:new Set(), seniority:new Set() };
  renderAnalyticsTab();
}

/* ══════════════════════════════════════════════════════════════════
   7. Exports — CSV (flat dataset) + PNG (svg→canvas)
   ══════════════════════════════════════════════════════════════════ */
export function anExportCSV(){
  const data = anApplyFilters(buildAnalyticsDataset());
  const cols = ['name','group','role','location','gender','seniority','tenureYears',
    'monthlyCost','comparatio','latestRating','nineBoxKey','discProfile',
    'utilizationPct','projectCount','skillCount','critSkillCount',
    'contract','mobility','cohortYear','reviewCurrencyMonths','hasSuccessor','riskScore'];
  const esc = v => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; };
  let csv = cols.join(',') + '\n';
  data.forEach(d => csv += cols.map(c => esc(d[c])).join(',') + '\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'matrix-analytics.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// PDF — open a print-optimised window with the current chart + summary, then print.
// Keeps the dark background (print-color-adjust:exact) so the light-on-dark SVG stays legible.
export function anExportPDF(){
  const chart = G('an-chart'), summary = G('an-summary');
  if (!chart) { alert(t('No chart to export')); return; }
  const w = window.open('', '_blank');
  if (!w) { alert(t('Pop-up blocked — allow pop-ups to export PDF')); return; }
  const title = ((chart.querySelector('div') || {}).innerText || 'Analytics').replace(/^[^A-Za-z0-9(]+/, '').trim();
  const s = (G('res-start') || {}).value || '', e = (G('res-end') || {}).value || '';
  const today = new Date().toISOString().slice(0, 10);
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'
    + escH('Matrix Analytics — ' + title) + '</title><style>'
    + 'html,body{background:#0a0c10;color:#e2e8f4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + 'body{font-family:Arial,Helvetica,sans-serif;margin:28px;}'
    + 'h1{font-size:16px;margin:0 0 2px;} .meta{color:#5a6380;font-size:11px;margin-bottom:18px;}'
    + 'svg{max-width:100%;height:auto;} .sum{margin-top:18px;font-size:12px;max-width:280px;}'
    + '.sum>div{display:flex;justify-content:space-between;gap:12px;padding:2px 0;border-bottom:1px solid #1e2330;}'
    + '</style></head><body>'
    + '<h1>📊 People Analytics — ' + escH(title) + '</h1>'
    + '<div class="meta">Project Matrix · ' + escH(today) + (s ? ' · period ' + escH(s) + ' → ' + escH(e) : '') + '</div>'
    + chart.innerHTML
    + (summary ? '<div class="sum">' + summary.innerHTML + '</div>' : '')
    + '</body></html>');
  w.document.close(); w.focus();
  setTimeout(() => { try { w.print(); } catch (err) {} }, 300);
}

export function anExportPNG(){
  const svg = G('an-main') && G('an-main').querySelector('svg');
  if (!svg) { alert(t('No chart to export')); return; }
  const xml = new XMLSerializer().serializeToString(svg);
  const vb = svg.viewBox.baseVal;
  const W = (vb && vb.width) || 800, H = (vb && vb.height) || 600;
  const img = new Image();
  img.onload = function(){
    const cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'matrix-analytics.png';
    a.click();
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}
