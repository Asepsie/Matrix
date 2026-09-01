/* ►► SECTION: IMPORTANCE-FORMULA STATE ◄◄ (formerly the Project×Resource Heatmap)
 *
 * The Heatmap VIEW was removed (Track B simplification pass). What remains here is
 * the shared importance-formula state it used to own — still needed by the Portfolio
 * matrix's focus-star / importance controls (renderFocusBar + mtx* in matrix.js).
 *
 *   _hmState       — shared importance-formula UI state (formula, focus-star toggles)
 *   _hmImportance  — evaluates a project's importance from _hmState.formula
 *
 * Kept as its own file (registered in build.js) so the matrix keeps reading the same
 * `_hmState` instance it always did; only the heatmap grid renderer and its
 * performance-bucket helpers were deleted.
 */

// Persistent importance-formula UI state (survives tab switches; driven from the
// Portfolio matrix toolbar). The old heatmap tier thresholds were dropped with the view.
if (typeof _hmState === 'undefined') {
  var _hmState = {
    formula:     'impact * visibility * enabler',
    showFormula: false,  // matrix importance-formula panel toggle (renderFocusBar)
    showStar:    false,  // matrix focus-star overlay toggle
    starN:       3,
  };
}

// computes a project's importance score from the custom formula (used by the matrix
// focus star). Falls back to 0 on a bad/empty formula so a typo never throws.
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
