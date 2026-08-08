import type { AppLocale } from './core';

export function normalizePersistedLocale(value: unknown): AppLocale {
  return value === 'ar-EG' ? 'ar-EG' : 'en';
}
