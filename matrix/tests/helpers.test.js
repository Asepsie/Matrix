import { strict as assert } from 'assert';
import { test } from 'node:test';
import { _allocNum, _allocCost, escH, safeColor } from '../src/core/helpers.js';

test('_allocNum(0.5) === 0.5', () => {
  assert.equal(_allocNum(0.5), 0.5);
});
test('_allocNum("m") === 0', () => {
  assert.equal(_allocNum('m'), 0);
});
test('_allocNum("p") === 1.0', () => {
  assert.equal(_allocNum('p'), 1.0);
});
test('_allocNum("r") === 0', () => {
  assert.equal(_allocNum('r'), 0);
});

test('_allocCost(0.5, 8000) === 4000', () => {
  assert.equal(_allocCost(0.5, 8000), 4000);
});
test('_allocCost("m", 8000) === 0', () => {
  assert.equal(_allocCost('m', 8000), 0);
});
test('_allocCost("p", 8000) === 8000', () => {
  assert.equal(_allocCost('p', 8000), 8000);
});
test('_allocCost("r", 8000) === 0', () => {
  assert.equal(_allocCost('r', 8000), 0);
});

test('escH("<b>") === "&lt;b&gt;"', () => {
  assert.equal(escH('<b>'), '&lt;b&gt;');
});

/* ── XSS audit (multi-user): escH neutralises hostile entity text, and
   safeColor rejects any synced/imported color that isn't a real color.
   These two are the whole defence for teammate-supplied names + colors. ── */
test('escH — a hostile project name cannot break out of an attribute or tag', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const out = escH(evil);
  assert.ok(!out.includes('<'), 'no raw <');
  assert.ok(!out.includes('>'), 'no raw >');
  assert.ok(!out.includes('"'), 'no raw " (attribute breakout)');
  assert.equal(out, '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
});

test('safeColor — passes through legitimate colors unchanged', () => {
  for (const c of ['#c8f135', '#fff', '#c8f13533', 'rgb(10,20,30)',
                   'rgba(10, 20, 30, .5)', 'hsl(120, 50%, 50%)',
                   'red', 'transparent', 'currentColor', 'var(--muted)']) {
    assert.equal(safeColor(c), c);
  }
});

test('safeColor — rejects style/tag breakout payloads to a safe fallback', () => {
  const attacks = [
    '"><script>alert(1)</script>',
    'red"><img src=x onerror=alert(1)>',
    'red;position:fixed;top:0;left:0;width:100vw;height:100vh',
    'url(javascript:alert(1))',
    'expression(alert(1))',
    '</style><script>alert(1)</script>',
  ];
  for (const a of attacks) {
    const out = safeColor(a);
    assert.equal(out, 'var(--muted)', 'attack clamped: ' + a);
    assert.ok(!/[<>"]/.test(out), 'fallback has no breakout chars');
  }
});

test('safeColor — empty/nullish yields the fallback', () => {
  assert.equal(safeColor(''), 'var(--muted)');
  assert.equal(safeColor(null), 'var(--muted)');
  assert.equal(safeColor(undefined), 'var(--muted)');
  assert.equal(safeColor('', '#000'), '#000');
});
