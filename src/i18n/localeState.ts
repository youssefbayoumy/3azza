import type { AppLocale } from './core';

let activeLocale: AppLocale = 'en';

export function getActiveLocale(): AppLocale {
  return activeLocale;
}

export function setActiveLocale(locale: AppLocale): void {
  activeLocale = locale;
}
