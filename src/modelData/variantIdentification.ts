import identificationJson from '../generated/variantIdentification.json';
import type {
  IdentificationStatus,
  VariantIdentificationData,
  VariantIdentificationProfile,
} from './types';

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
  if (status === 'conflict') return 'Conflicting manual evidence';
  if (status === 'missing') return 'Not specified in this manual';
  return 'Manual-confirmed';
}

export function formatIdentificationFeatureValue(
  key: IdentificationFeatureKey,
  value: string | number
): string {
  if (key === 'displacementCc') return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} cc`;
  if (key === 'coolingSystem') return value === 'liquid' ? 'Liquid-cooled' : 'Air-cooled';
  if (key === 'fuelSystem') return value === 'fuel_injection' ? 'Electronic fuel injection' : 'Carburetor';
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
