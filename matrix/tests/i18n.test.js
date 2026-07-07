import { strict as assert } from 'assert';
import { test } from 'node:test';
import {
  t, i18nInterp, i18nPseudo, i18nNum, i18nApplyLang, i18nLocale,
  I18N_DICT, I18N_LANGS,
} from '../src/core/i18n.js';

/* Every test restores English so ordering can't leak the active language. */
function withLang(code, fn){ i18nApplyLang(code); try{ fn(); } finally{ i18nApplyLang('en'); } }

/* ── Fallback chain ─────────────────────────────────────────────────────── */

test('t() returns the key itself for English (key === source)', () => {
  withLang('en', () => {
    assert.equal(t('Roster'), 'Roster');
    assert.equal(t('Portfolio matrix'), 'Portfolio matrix');
  });
});

test('t() falls back to English for an unknown key', () => {
  withLang('fr', () => {
    assert.equal(t('This string is not translated'), 'This string is not translated');
  });
});

test('t() looks up a translated key per language', () => {
  withLang('fr', () => assert.equal(t('Roster'), 'Effectif'));
  withLang('zh', () => assert.equal(t('Roster'), '花名册'));
});

/* ── Interpolation ──────────────────────────────────────────────────────── */

test('i18nInterp substitutes {name} placeholders', () => {
  assert.equal(i18nInterp('{n} projects', { n: 12 }), '12 projects');
  assert.equal(i18nInterp('{a} of {b}', { a: 3, b: 9 }), '3 of 9');
});

test('i18nInterp leaves unknown placeholders intact', () => {
  assert.equal(i18nInterp('{n} of {total}', { n: 1 }), '1 of {total}');
});

test('t() interpolates when given vars', () => {
  withLang('en', () => assert.equal(t('{n} projects', { n: 5 }), '5 projects'));
});

/* ── Pseudo-localisation ────────────────────────────────────────────────── */

test('pseudo-loc wraps, accents, and pads while preserving tags/placeholders', () => {
  const out = i18nPseudo('Save <b>now</b> {n}');
  assert.ok(out.startsWith('⟦') && out.endsWith('⟧'), 'wrapped in brackets');
  assert.ok(out.includes('<b>') && out.includes('</b>'), 'HTML tags untouched');
  assert.ok(out.includes('{n}'), 'placeholder untouched');
  assert.ok(/[áéíóúñ]/.test(out), 'ASCII letters accented');
});

test('t() uses pseudo-loc under the xx locale', () => {
  withLang('xx', () => assert.ok(t('Roster').startsWith('⟦')));
});

/* ── Placeholder parity (guards future translations) ────────────────────── */

test('every translation preserves its key placeholders', () => {
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  for (const [lang, dict] of Object.entries(I18N_DICT)) {
    for (const [key, val] of Object.entries(dict)) {
      assert.equal(ph(val), ph(key), `${lang} '${key}' placeholder mismatch`);
    }
  }
});

/* ── Number formatting (Intl) ───────────────────────────────────────────── */

test('i18nNum formats per active locale', () => {
  // French groups with a (non-breaking) space + decimal comma — normalize all
  // whitespace so the assertion doesn't hinge on U+202F vs U+00A0.
  const norm = s => s.replace(/\s/g, ' ');
  withLang('en', () => assert.equal(i18nNum(1234.5), '1,234.5'));
  withLang('fr', () => assert.equal(norm(i18nNum(1234.5)), '1 234,5'));
});

test('i18nNum returns empty string for null/NaN', () => {
  assert.equal(i18nNum(null), '');
  assert.equal(i18nNum(NaN), '');
});

test('i18nLocale maps languages to BCP-47 tags', () => {
  withLang('fr', () => assert.equal(i18nLocale(), 'fr-FR'));
  withLang('zh', () => assert.equal(i18nLocale(), 'zh-CN'));
  withLang('en', () => assert.equal(i18nLocale(), 'en-US'));
});

/* ── Shipped languages ──────────────────────────────────────────────────── */

test('I18N_LANGS exposes en/fr/zh with labels', () => {
  const codes = I18N_LANGS.map(l => l.code);
  assert.deepEqual(codes, ['en', 'fr', 'zh']);
  assert.ok(I18N_LANGS.every(l => l.label));
});
