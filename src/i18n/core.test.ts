import assert from 'node:assert/strict';
import test from 'node:test';
import { arEG, en, formatDate, formatEgp, formatKilometres, formatLitres, formatNumber, isRtlLocale, localizeErrorMessage, translate, translatePlural, vehicleDisplayName } from './core';
import { setActiveLocale } from './localeState';

test('English and Egyptian Arabic resources have exact non-empty key parity', () => {
  assert.deepEqual(Object.keys(arEG).sort(), Object.keys(en).sort());
  for (const [key, value] of Object.entries(arEG)) {
    assert.ok(value.trim(), `ar-EG translation is empty: ${key}`);
    const englishMarkers = [...en[key as keyof typeof en].matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();
    const arabicMarkers = [...value.matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();
    const allowedMissing = key.endsWith('_one') ? ['count'] : [];
    assert.deepEqual(
      arabicMarkers,
      englishMarkers.filter((marker) => !allowedMissing.includes(marker)),
      `interpolation markers differ: ${key}`
    );
  }
});

test('plural resources are complete pairs in both locales', () => {
  for (const key of Object.keys(en)) {
    if (!key.endsWith('_one')) continue;
    assert.ok(`${key.slice(0, -4)}_other` in en, `missing plural other form for ${key}`);
  }
});

test('Arabic resources do not contain untranslated app-owned English-only values', () => {
  const placeholderOnly = new Set([
    'history.datePlaceholder',
    'history.optionA11y',
    'maintenance.nearestStatus',
    'scooter.fieldA11y',
  ]);
  const failures = Object.entries(arEG)
    .filter(([key, value]) => /[A-Za-z]{3,}/.test(value) && !/[\u0600-\u06ff]/.test(value) && !placeholderOnly.has(key))
    .map(([key]) => key);
  assert.deepEqual(failures, []);
});

test('translations interpolate and preserve missing interpolation markers', () => {
  assert.equal(translate('ar-EG', 'tabs.maintenance'), 'الصيانة');
  assert.equal(translate('ar-EG', 'logs.otherWork'), 'خدمات أخرى');
  assert.equal(translate('ar-EG', 'preRide.savedBody', { completed: 2, total: 4 }), 'تم تسجيل 2 من 4 بند مطابق للدليل للنهارده.');
  assert.equal(translate('en', 'common.loading', { title: 'records' }), 'Loading records');
  assert.equal(translate('en', 'common.loading'), 'Loading {{title}}');
});

test('plural resources select one and other forms with interpolation', () => {
  assert.equal(translatePlural('en', 'fuel.entry', 1), '1 entry');
  assert.equal(translatePlural('en', 'fuel.entry', 3), '3 entries');
  assert.match(translatePlural('ar-EG', 'fuel.entry', 1), /[\u0600-\u06ff]/);
  assert.match(translatePlural('ar-EG', 'fuel.entry', 3), /3/);
});

test('Arabic UI boundaries never expose raw English diagnostic errors', () => {
  assert.equal(localizeErrorMessage(new Error('Database exploded'), 'تعذر حفظ السجل.', 'ar-EG'), 'تعذر حفظ السجل.');
  assert.equal(localizeErrorMessage(new Error('القيمة غير صحيحة'), 'تعذر حفظ السجل.', 'ar-EG'), 'القيمة غير صحيحة');
  assert.equal(localizeErrorMessage(new Error('Detailed English failure'), 'Could not save.', 'en'), 'Detailed English failure');
});

test('legacy app-owned default vehicle names localize without changing user names', () => {
  setActiveLocale('ar-EG');
  try {
    assert.match(vehicleDisplayName('Primary Vehicle'), /[\u0600-\u06ff]/);
    assert.equal(vehicleDisplayName('SYM 200'), 'SYM 200');
  } finally {
    setActiveLocale('en');
  }
});

test('Arabic presentation deliberately retains Western digits for technical readings', () => {
  assert.equal(isRtlLocale('ar-EG'), true);
  assert.equal(isRtlLocale('en'), false);
  assert.equal(formatNumber(12345.6, 'ar-EG'), '12,345.6');
  assert.equal(formatKilometres(1200, 'ar-EG'), '1,200 km');
  assert.equal(formatLitres(12.5, 'ar-EG'), '12.5 L');
  assert.equal(formatEgp(900, 'ar-EG'), '900 EGP');
  assert.match(formatDate(new Date(2026, 0, 9), 'ar-EG'), /2026/);
});
