/* ►► SECTION: HEATMAP ◄◄ Project × Resource Heatmap — importance/performance matrix
 *
 * Functions defined in this file:
 *   _hmImportance       — computes a project's importance score from the custom formula
 *   _hmPerfScore        — returns an engineer's nine-box performance score (1-3) or null
 *   _hmProjectPerfScore — computes a project's FTE-weighted team performance score
 *   _hmTier             — maps a normalised importance percentage to high/mid/low
 *   _hmPerfBucket       — maps a performance score to high/mid/low/none
 *   renderHeatmap       — renders the 3×4 heatmap matrix with advice flags
 *   _hmApplyFormula     — validates and applies the custom importance formula
 *   _hmSetFormula       — sets a preset formula and re-renders
 *   _hmResetFormula     — resets formula to default and re-renders
 */

// Persistent heatmap UI state (survives tab switches)
if (typeof _hmState === 'undefined') {
  var _hmState = {
    formula:    'impact * visibility * enabler',
    threshHigh: 66,
    threshLow:  33,
    showFormula: false,
    showStar:   false,
    starN:      3,
  };
}

// computes a project's importance score from the custom formula
function _hmImportance(p) {
  var impact     = p.y   != null ? p.y   : 5;
  var visibility = p.vis != null ? p.vis : (p.y || 5);
  var enabler    = p.ena != null ? p.ena : (p.x || 5);
  var x          = p.x   != null ? p.x   : 5;
  try {
    var fn = new Function('impact','visibility','enabler','x',
      'return (' + _hmState.formula + ');');
    var v = fn(impact, visibility, enabler, x);
    return (typeof v === 'number' && isFinite(v)) ? v : 0;
  } catch(e) { return 0; }
}

// returns an engineer's nine-box performance score (1-3) or null
function _hmPerfScore(eng) {
  var key = _nineBoxPlacements[eng.id];
  if (!key) return null;
  return parseInt(key.split('-')[0], 10) || null;
}

// computes a project's FTE-weighted team performance score
function _hmProjectPerfScore(projId) {
  var cur = curMonth();
  var totalFte = 0, weightedPerf = 0;
  allocRows.forEach(function(r) {
    if (+r.projectId !== projId || !r.engId) return;
    var fte = r.allocs && r.allocs[cur] ? +r.allocs[cur] : 0;
    if (!fte) return;
    var eng = engineers.find(function(e) { return e.id === r.engId; });
    if (!eng) return;
    var ps = _hmPerfScore(eng);
    totalFte += fte;
    weightedPerf += fte * (ps != null ? ps : 2);
  });
  if (!totalFte) return null;
  return weightedPerf / totalFte;
}

// maps a normalised importance percentage to high/mid/low
function _hmTier(normPct) {
  if (normPct >= _hmState.threshHigh) return 'high';
  if (normPct >= _hmState.threshLow)  return 'mid';
  return 'low';
}

// maps a performance score to high/mid/low/none
function _hmPerfBucket(score) {
  if (score === null) return 'none';
  if (score >= 2.5)  return 'high';
  if (score >= 1.5)  return 'mid';
  return 'low';
}

// renders the 3×4 heatmap matrix with advice flags
export function renderHeatmap() {
  var body = G('res-body'); if (!body) return;

  var cur = curMonth();
  var visProjects = projects.filter(function(p) { return p.visible; });

  var rawScores = visProjects.map(_hmImportance);
  var maxRaw = Math.max.apply(null, rawScores.concat([1]));
  var minRaw = Math.min.apply(null, rawScores.concat([maxRaw]));
  var rawRange = maxRaw - minRaw || 1;

  function normPct(p) {
    return Math.round((_hmImportance(p) - minRaw) / rawRange * 100);
  }

  var engsByProj = {};
  visProjects.forEach(function(p) { engsByProj[p.id] = []; });
  engineers.forEach(function(eng) {
    if (eng.vacant) return;
    allocRows.forEach(function(r) {
      if (r.engId !== eng.id || !r.projectId) return;
      var fte = r.allocs && r.allocs[cur] ? +r.allocs[cur] : 0;
      if (!fte || !engsByProj[r.projectId]) return;
      if (!engsByProj[r.projectId].find(function(x){ return x.eng.id===eng.id; }))
        engsByProj[r.projectId].push({ eng: eng, fte: fte, perf: _hmPerfScore(eng) });
    });
  });

  var projData = visProjects.map(function(p) {
    var np    = normPct(p);
    var imp   = _hmTier(np);
    var ps    = _hmProjectPerfScore(p.id);
    var perf  = _hmPerfBucket(ps);
    return { p: p, imp: imp, perf: perf, np: np, ps: ps, engs: engsByProj[p.id] };
  });

  var IMP_ROWS  = ['high','mid','low'];
  var PERF_COLS = ['high','mid','low','none'];

  var CELL_KEY = {};
  IMP_ROWS.forEach(function(imp) {
    PERF_COLS.forEach(function(perf) { CELL_KEY[imp+'|'+perf] = []; });
  });
  projData.forEach(function(d) {
    var k = d.imp + '|' + d.perf;
    if (CELL_KEY[k]) CELL_KEY[k].push(d);
  });

  var IMP_STYLE = {
    high: { border: '#f14335', badge: '#f14335', bg: 'rgba(241,67,53,0.06)',  label: 'HIGH' },
    mid:  { border: '#f1a435', badge: '#f1a435', bg: 'rgba(241,164,53,0.06)', label: 'MED'  },
    low:  { border: '#555',    badge: '#888',     bg: 'rgba(40,40,50,0.15)',   label: 'LOW'  },
  };
  var PERF_STYLE = {
    high: { border: '#c8f135', badge: '#c8f135', label: '▲ High perf' },
    mid:  { border: '#888',    badge: '#888',     label: '● Mid perf'  },
    low:  { border: '#f14335', badge: '#f14335',  label: '▼ Low perf'  },
    none: { border: '#2a2a32', badge: '#555',     label: '? Unplaced'  },
  };

  function cellAdvice(imp, perf) {
    if (imp==='high' && perf==='low')  return { col:'#f14335', msg:'⚠ Low-performers on critical project' };
    if (imp==='high' && perf==='none') return { col:'#f14335', msg:'⚡ No resources allocated' };
    if (imp==='low'  && perf==='high') return { col:'#a78bfa', msg:'↩ Stars on low-priority project' };
    if (imp==='high' && perf==='mid')  return { col:'#f1a435', msg:'↑ Consider adding high-performers' };
    if (imp==='mid'  && perf==='low')  return { col:'#f1a435', msg:'⚠ Check resource fit' };
    return null;
  }

  function avatar(eng, sz) {
    sz = sz || 24;
    var photo = _photoCache && _photoCache.get && _photoCache.get(eng.id);
    var ini = (eng.name||'?').split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
    if (photo) return '<img src="'+photo+'" style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;object-fit:cover;border:1.5px solid var(--border);flex-shrink:0">';
    return '<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:var(--surface);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:var(--muted);flex-shrink:0;font-family:IBM Plex Mono,monospace">'+ini+'</div>';
  }

  var flagged   = projData.filter(function(d){ return cellAdvice(d.imp,d.perf); }).length;
  var noStaff   = projData.filter(function(d){ return d.perf==='none' && d.imp==='high'; }).length;
  var starLow   = projData.filter(function(d){ return d.imp==='low' && d.perf==='high'; }).length;
  var lowOnHigh = projData.filter(function(d){ return d.imp==='high' && d.perf==='low'; }).length;

  var h = '<div style="display:flex;flex-direction:column;height:100%;gap:0;overflow:hidden">';

  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap">'
    + '<h3 style="margin:0;font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--muted);letter-spacing:.08em">🌡 PROJECT HEATMAP</h3>'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">'
    + visProjects.length + ' projects · ' + cur + '</span>'
    + '<div style="flex:1"></div>'
    + '<button class="add-row-btn" onclick="_hmState.showFormula=!_hmState.showFormula;renderHeatmap()" '
    + 'style="font-size:9px;padding:2px 8px;'
    + (_hmState.showFormula ? 'border-color:var(--accent);color:var(--accent)' : '')
    + '">⚙ FORMULA &amp; THRESHOLDS</button>'
    + '<button onclick="_hmState.showStar=!_hmState.showStar;render();renderHeatmap()" '
    + 'style="font-size:9px;padding:2px 8px;border:1px solid '
    + (_hmState.showStar ? 'var(--accent);color:var(--accent);background:rgba(200,241,53,.12)' : 'var(--border);color:var(--muted)')
    + ';border-radius:4px;cursor:pointer;font-family:IBM Plex Mono,monospace">'
    + '⭐ FOCUS STAR: ' + (_hmState.showStar ? 'ON' : 'OFF') + '</button>'
    + '</div>';

  if (_hmState.showFormula) {
    h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;'
      + 'padding:12px 14px;margin-bottom:10px;flex-shrink:0;display:flex;flex-direction:column;gap:10px">';
    h += '<div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:5px;letter-spacing:.06em">'
      + 'IMPORTANCE FORMULA — variables: <span style="color:var(--accent)">impact</span> '
      + '(y 1-10) · <span style="color:var(--accent)">visibility</span> (vis 1-10) · '
      + '<span style="color:var(--accent)">enabler</span> (ena 1-10) · '
      + '<span style="color:var(--accent)">x</span></div>'
      + '<div style="display:flex;gap:6px;align-items:center">'
      + '<input id="hm-formula-input" value="' + escH(_hmState.formula) + '" '
      + 'style="flex:1;background:var(--bg);border:1px solid var(--border);color:var(--accent);'
      + 'font-family:IBM Plex Mono,monospace;font-size:11px;padding:5px 8px;border-radius:5px;outline:none" '
      + 'placeholder="e.g. impact * visibility * enabler">'
      + '<button class="sm primary" onclick="_hmApplyFormula()" style="font-size:10px;padding:3px 10px">APPLY</button>'
      + '<button class="sm" onclick="_hmResetFormula()" style="font-size:10px;padding:3px 8px" title="Reset to default">↺</button>'
      + '</div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);margin-top:4px">'
      + 'Presets: '
      + '<a onclick="_hmSetFormula(\'impact * visibility * enabler\')" style="color:var(--accent);cursor:pointer;margin-right:10px">impact×vis×ena</a>'
      + '<a onclick="_hmSetFormula(\'impact * visibility\')" style="color:var(--accent);cursor:pointer;margin-right:10px">impact×vis</a>'
      + '<a onclick="_hmSetFormula(\'(impact + visibility + enabler) / 3\')" style="color:var(--accent);cursor:pointer;margin-right:10px">avg(i,v,e)</a>'
      + '<a onclick="_hmSetFormula(\'impact * impact * visibility\')" style="color:var(--accent);cursor:pointer">impact²×vis</a>'
      + '</div></div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
    h += '<div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:4px">'
      + 'HIGH importance threshold: <span id="hm-high-val" style="color:#f14335">' + _hmState.threshHigh + '%</span></div>'
      + '<input type="range" min="' + (_hmState.threshLow+5) + '" max="95" value="' + _hmState.threshHigh + '" '
      + 'style="width:100%;accent-color:#f14335" '
      + 'oninput="document.getElementById(\'hm-high-val\').textContent=this.value+\'%\'" '
      + 'onchange="_hmState.threshHigh=+this.value;renderHeatmap()"></div>';
    h += '<div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted);margin-bottom:4px">'
      + 'LOW importance threshold: <span id="hm-low-val" style="color:#888">' + _hmState.threshLow + '%</span></div>'
      + '<input type="range" min="5" max="' + (_hmState.threshHigh-5) + '" value="' + _hmState.threshLow + '" '
      + 'style="width:100%;accent-color:#888" '
      + 'oninput="document.getElementById(\'hm-low-val\').textContent=this.value+\'%\'" '
      + 'onchange="_hmState.threshLow=+this.value;renderHeatmap()"></div>';
    h += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);'
      + 'display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">FOCUS STAR — top</span>'
      + '<input type="number" id="hm-star-n" min="1" max="' + Math.max(1,visProjects.length) + '" value="' + _hmState.starN + '" '
      + 'style="width:48px;background:var(--bg);border:1px solid var(--border);color:var(--accent);'
      + 'font-family:IBM Plex Mono,monospace;font-size:11px;padding:3px 6px;border-radius:4px;text-align:center" '
      + 'oninput="_hmState.starN=Math.max(1,Math.min(+this.value,projects.filter(function(p){return p.visible;}).length));'
      + 'if(_hmState.showStar)render();">'
      + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">projects by importance</span>'
      + '</div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">Centroid = importance-weighted average of the top N project positions</div>'
      + '</div>';
    h += '</div></div>';
  }

  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;flex-shrink:0">';
  [
    { v: visProjects.length, l: 'PROJECTS',         c: 'var(--accent)' },
    { v: flagged,            l: 'FLAGGED',           c: flagged  ? '#f14335' : 'var(--accent)' },
    { v: noStaff,            l: 'HIGH · NO STAFF',  c: noStaff  ? '#f14335' : 'var(--accent)' },
    { v: starLow+lowOnHigh,  l: 'MISMATCH',         c: (starLow+lowOnHigh) ? '#f1a435' : 'var(--accent)' },
  ].forEach(function(k) {
    h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:8px 10px;text-align:center">'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:20px;font-weight:700;color:'+k.c+'">'+k.v+'</div>'
      + '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted);letter-spacing:.06em;margin-top:1px">'+k.l+'</div>'
      + '</div>';
  });
  h += '</div>';

  var COL_W = '1fr 1fr 1fr 0.9fr';
  h += '<div style="flex:1;overflow-y:auto;min-height:0">';
  h += '<div style="display:grid;grid-template-columns:80px '+COL_W+';gap:4px;margin-bottom:4px;flex-shrink:0">';
  h += '<div></div>';
  PERF_COLS.forEach(function(perf) {
    var ps = PERF_STYLE[perf];
    h += '<div style="text-align:center;font-family:IBM Plex Mono,monospace;font-size:9px;'
      + 'font-weight:700;color:'+ps.badge+';padding:4px 2px;border-bottom:2px solid '+ps.border+'">'
      + ps.label + '</div>';
  });
  h += '</div>';

  IMP_ROWS.forEach(function(imp) {
    var is = IMP_STYLE[imp];
    h += '<div style="display:grid;grid-template-columns:80px '+COL_W+';gap:4px;margin-bottom:4px">';
    h += '<div style="display:flex;align-items:center;justify-content:center;'
      + 'background:'+is.bg+';border:1px solid '+is.border+'44;border-radius:6px;'
      + 'font-family:IBM Plex Mono,monospace;font-size:9px;font-weight:700;color:'+is.badge+';'
      + 'writing-mode:vertical-rl;text-orientation:mixed;padding:8px 4px;letter-spacing:.08em">'
      + is.label + ' IMP</div>';
    PERF_COLS.forEach(function(perf) {
      var cellProjects = CELL_KEY[imp+'|'+perf];
      var advice = cellAdvice(imp, perf);
      var cellBg = advice ? advice.col + '0d' : 'var(--surface)';
      var cellBorder = advice ? advice.col + '55' : 'var(--border)';
      h += '<div style="background:'+cellBg+';border:1px solid '+cellBorder+';border-radius:7px;'
        + 'padding:7px;min-height:90px;display:flex;flex-direction:column;gap:4px">';
      if (advice && cellProjects.length > 0) {
        h += '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:'+advice.col+';'
          + 'padding:2px 4px;background:'+advice.col+'18;border-radius:3px;line-height:1.3">'
          + escH(advice.msg) + '</div>';
      }
      if (cellProjects.length === 0) {
        h += '<div style="flex:1;display:flex;align-items:center;justify-content:center;'
          + 'color:var(--muted);font-size:9px;font-family:IBM Plex Mono,monospace;opacity:.4">—</div>';
      } else {
        cellProjects.forEach(function(d) {
          var p = d.p;
          var impScore = _hmImportance(p);
          h += '<div style="background:var(--bg);border:1px solid var(--border);border-left:3px solid '
            + (p.color||'var(--muted)') + ';border-radius:5px;padding:5px 7px">';
          h += '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;font-weight:700;'
            + 'color:var(--text);line-height:1.3;margin-bottom:4px" title="'+escH(p.name)+'">'
            + escH(p.name.length > 22 ? p.name.slice(0,21)+'…' : p.name) + '</div>';
          h += '<div style="display:flex;gap:5px;align-items:center;margin-bottom:4px">'
            + '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">Y:'+( p.y||'?')+'</span>'
            + '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">V:'+(p.vis||'?')+'</span>'
            + '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">E:'+(p.ena||'?')+'</span>'
            + '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;font-weight:700;color:'+is.badge+'">'+Math.round(impScore)+'</span>'
            + '</div>';
          if (d.engs.length === 0) {
            h += '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">No staff</div>';
          } else {
            h += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
            d.engs.forEach(function(item) {
              var pScore = item.perf;
              var pCol = pScore===3?'#c8f135':pScore===2?'#888':'#f14335';
              var pSym = pScore===3?'▲':pScore===2?'●':pScore===1?'▼':'?';
              h += '<div style="display:flex;align-items:center;gap:3px;padding:2px 4px;'
                + 'border-radius:4px;background:var(--surface);border:1px solid var(--border)" '
                + 'title="'+escH(item.eng.name)+' — '+Math.round(item.fte*100)+'%">'
                + avatar(item.eng, 18)
                + '<span style="font-size:8px;color:'+pCol+';font-weight:700">'+pSym+'</span>'
                + '<span style="font-family:IBM Plex Mono,monospace;font-size:8px;color:var(--muted)">'
                + Math.round(item.fte*100)+'%</span></div>';
            });
            h += '</div>';
          }
          h += '</div>';
        });
      }
      h += '</div>';
    });
    h += '</div>';
  });

  h += '</div>';
  h += '<div style="display:flex;align-items:center;justify-content:center;margin-top:6px;gap:8px;flex-shrink:0">'
    + '<span style="font-family:IBM Plex Mono,monospace;font-size:9px;color:var(--muted)">← X AXIS: TEAM PERFORMANCE (Nine-Box avg)</span>'
    + '</div>';
  h += '</div>';
  body.innerHTML = h;
}

// validates and applies the custom importance formula
export function _hmApplyFormula() {
  var input = G('hm-formula-input');
  if (!input) return;
  var formula = input.value.trim();
  if (!formula) return;
  try {
    var fn = new Function('impact','visibility','enabler','x','return ('+formula+');');
    var result = fn(7, 6, 8, 5);
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('not a number');
    _hmState.formula = formula;
    renderHeatmap();
  } catch(e) {
    alert('Formula error: ' + e.message + '\n\nExample: impact * visibility * enabler');
  }
}
// sets a preset formula and re-renders
export function _hmSetFormula(f) { _hmState.formula = f; renderHeatmap(); }
// resets formula to default and re-renders
export function _hmResetFormula() { _hmState.formula = 'impact * visibility * enabler'; renderHeatmap(); }
