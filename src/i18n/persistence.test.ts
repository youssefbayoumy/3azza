import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePersistedLocale } from './persistence';

test('persisted locale restores supported values and safely falls back to English', () => {
  assert.equal(normalizePersistedLocale('ar-EG'), 'ar-EG');
  assert.equal(normalizePersistedLocale('en'), 'en');
  assert.equal(normalizePersistedLocale('ar'), 'en');
  assert.equal(normalizePersistedLocale(undefined), 'en');
  assert.equal(normalizePersistedLocale({ locale: 'ar-EG' }), 'en');
});
