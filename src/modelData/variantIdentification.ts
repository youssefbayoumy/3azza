import identificationJson from '../generated/variantIdentification.json';
import type {
  IdentificationStatus,
  VariantIdentificationData,
  VariantIdentificationProfile,
} from './types';
import { formatNumber, t } from '../i18n/core';

export type IdentificationFeatureKey = 'displacementCc' | 'coolingSystem' | 'fuelSystem' | 'modelCode';

export const IDENTIFICATION_FEATURE_ORDER: IdentificationFeatureKey[] = [
  'displacementCc',
  'coolingSystem',
  'fuelSystem',
  'modelCode',
];

export const variantIdentificationData = identificationJson as VariantIdentificationData;

export function getIdentificationProfilesForVersion(versionId?: string): VariantIdentificationProfile[] {
  if (!versionId) return [];
  return variantIdentificationData.profiles.filter((profile) => profile.catalogVersionId === versionId);
}

export function identificationFeatureStatusLabel(status: IdentificationStatus): string {
  if (status === 'conflict') return t('ident.conflicting');
  if (status === 'missing') return t('ident.missing');
  return t('ident.confirmed');
}

export function formatIdentificationFeatureValue(
  key: IdentificationFeatureKey,
  value: string | number
): string {
  if (key === 'displacementCc') return `${formatNumber(Number(value))} cc`;
  if (key === 'coolingSystem') return value === 'liquid' ? t('ident.liquidCooled') : t('ident.airCooled');
  if (key === 'fuelSystem') return value === 'fuel_injection' ? t('ident.injection') : t('ident.carburetor');
  return String(value);
}

export function featureValueForFiltering(
  profile: VariantIdentificationProfile,
  key: IdentificationFeatureKey
): string | null {
  const feature = profile[key];
  if (feature.status !== 'confirmed' || feature.value === null) return null;
  return String(feature.value);
}
