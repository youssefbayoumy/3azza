import { getActiveLocale } from './localeState';
import { arEG as baseArEG, en as baseEn } from './resources';
import { maintenanceArEG, maintenanceEn } from './maintenanceResources';
import { screenArEG, screenEn } from './screenResources';
import { fuelArEG, fuelEn } from './fuelResources';
import { dashboardArEG, dashboardEn } from './dashboardResources';
import { maintenanceWorkflowArEG, maintenanceWorkflowEn } from './maintenanceWorkflowResources';
import { settingsArEG, settingsEn } from './settingsResources';

export const en = { ...baseEn, ...maintenanceEn, ...screenEn, ...fuelEn, ...dashboardEn, ...maintenanceWorkflowEn, ...settingsEn } as const;
export const arEG: { readonly [K in keyof typeof en]: string } = { ...baseArEG, ...maintenanceArEG, ...screenArEG, ...fuelArEG, ...dashboardArEG, ...maintenanceWorkflowArEG, ...settingsArEG };
export type TranslationKey = keyof typeof en;

export type AppLocale = 'en' | 'ar-EG';
export type Interpolation = Record<string, string | number>;

export function isRtlLocale(locale: AppLocale): boolean {
  return locale === 'ar-EG';
}

const dictionaries = { en, 'ar-EG': arEG } as const;

export function translate(locale: AppLocale, key: TranslationKey, values: Interpolation = {}): string {
  return dictionaries[locale][key].replace(/{{(\w+)}}/g, (_, name: string) => String(values[name] ?? `{{${name}}}`));
}

export function translatePlural(locale: AppLocale, key: string, count: number, values: Interpolation = {}): string {
  const suffix = count === 1 ? '_one' : '_other';
  return translate(locale, `${key}${suffix}` as TranslationKey, { ...values, count });
}

export function tp(key: string, count: number, values?: Interpolation): string {
  return translatePlural(getActiveLocale(), key, count, values);
}

export function t(key: TranslationKey, values?: Interpolation): string {
  return translate(getActiveLocale(), key, values);
}

export function vehicleDisplayName(value: string | null | undefined): string {
  const name = value?.trim();
  return !name || name === 'Primary Vehicle' || name === 'Vehicle' ? t('vehicle.defaultName') : name;
}

const ARABIC_SCRIPT = /[\u0600-\u06ff]/;

/**
 * Internal database/domain errors are written for diagnostics in English. UI
 * boundaries must use this helper so Arabic sessions never expose those raw
 * implementation messages. Errors already created from an Arabic resource are
 * retained, while English keeps the detailed diagnostic message.
 */
export function localizeErrorMessage(error: unknown, fallback: string, locale = getActiveLocale()): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return fallback;
  if (locale === 'en' || ARABIC_SCRIPT.test(message)) return message;
  return fallback;
}

/** All technical readings keep Latin digits so odometers and manuals stay comparable. */
export function localeTag(locale = getActiveLocale()): string {
  return isRtlLocale(locale) ? 'ar-EG-u-nu-latn' : 'en-US';
}
export function formatNumber(value: number, locale = getActiveLocale()): string { return new Intl.NumberFormat(localeTag(locale)).format(value); }
export function formatDate(value: Date, locale = getActiveLocale()): string { return new Intl.DateTimeFormat(localeTag(locale), { year: 'numeric', month: 'short', day: 'numeric' }).format(value); }
export function formatKilometres(value: number, locale = getActiveLocale()): string { return `${formatNumber(value, locale)} km`; }
export function formatLitres(value: number, locale = getActiveLocale()): string { return `${formatNumber(value, locale)} L`; }
export function formatEgp(value: number, locale = getActiveLocale()): string { return `${formatNumber(value, locale)} EGP`; }
