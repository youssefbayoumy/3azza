import { I18nManager } from 'react-native';
import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { isRtlLocale, translate, translatePlural, type Interpolation, type TranslationKey } from './core';
export { formatDate, formatNumber, formatKilometres, formatLitres, formatEgp, isRtlLocale, localeTag, localizeErrorMessage, t, tp, translate, translatePlural, vehicleDisplayName, type AppLocale, type TranslationKey } from './core';

export function useTranslation() {
  const locale = useAppStore((state) => state.locale);
  const translateKey = useCallback((key: TranslationKey, values?: Interpolation) => translate(locale, key, values), [locale]);
  const translateCount = useCallback((key: string, count: number, values?: Interpolation) => translatePlural(locale, key, count, values), [locale]);
  return { locale, isRTL: isRtlLocale(locale), t: translateKey, tp: translateCount };
}

/** RTL direction is applied by React Native on the next process launch. */
export function configureLayoutDirection(locale: import('./core').AppLocale): boolean {
  const rtl = isRtlLocale(locale);
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}
