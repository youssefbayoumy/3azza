import knowledgeJson from '../generated/modelKnowledgeBase.json';
import { keyMatchesVariant, recordAppliesToVariant, recordIsVariantSpecific } from './applicability';
import type {
  ApplicableSpecification,
  ApplicableSpecifications,
  ConflictRecord,
  KnowledgeRecord,
  KnowledgeSection,
  MaintenanceRecommendation,
  ModelKnowledgeBase,
  ModelKnowledgeProfile,
  ModelVariant,
  VehicleModelSelection,
} from './types';

export const modelKnowledgeBase = knowledgeJson as ModelKnowledgeBase;

const titleCase = (value: string) => value
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function getModelProfileForVehicle(
  profile: VehicleModelSelection | null | undefined
): ModelKnowledgeProfile | null {
  if (!profile?.scooter_version_id || !profile.scooter_model_id || !profile.scooter_brand_id) return null;
  return modelKnowledgeBase.profiles.find((candidate) =>
    candidate.catalogVersionId === profile.scooter_version_id
    && candidate.modelId === profile.scooter_model_id
    && candidate.brandId === profile.scooter_brand_id
  ) ?? null;
}

export function getModelProfileForSelection(selection: {
  brandId?: string;
  modelId?: string;
  versionId?: string;
}): ModelKnowledgeProfile | null {
  if (!selection.brandId || !selection.modelId || !selection.versionId) return null;
  return modelKnowledgeBase.profiles.find((candidate) =>
    candidate.catalogVersionId === selection.versionId
    && candidate.modelId === selection.modelId
    && candidate.brandId === selection.brandId
  ) ?? null;
}

export function getSelectedVariant(
  profile: VehicleModelSelection | null | undefined,
  modelProfile = getModelProfileForVehicle(profile)
): ModelVariant | null {
  if (!profile?.scooter_variant_id || !modelProfile) return null;
  return modelProfile.variants.find((variant) => variant.id === profile.scooter_variant_id) ?? null;
}

export function getApplicableRecords(
  profile: VehicleModelSelection | null | undefined,
  section: KnowledgeSection
): KnowledgeRecord[] {
  const modelProfile = getModelProfileForVehicle(profile);
  if (!modelProfile) return [];
  const variant = getSelectedVariant(profile, modelProfile);
  return modelProfile.records.filter((record) =>
    record.section === section && recordAppliesToVariant(record, variant)
  );
}

export function getVariantGroupedRecords(
  profile: VehicleModelSelection | null | undefined,
  section: KnowledgeSection
): KnowledgeRecord[] {
  const modelProfile = getModelProfileForVehicle(profile);
  if (!modelProfile || getSelectedVariant(profile, modelProfile)) return [];
  return modelProfile.records.filter((record) => record.section === section && recordIsVariantSpecific(record));
}

export function getApplicableMaintenance(
  profile: VehicleModelSelection | null | undefined
): MaintenanceRecommendation[] {
  return getModelProfileForVehicle(profile)?.maintenanceTasks ?? [];
}

function categoryFor(label: string): ApplicableSpecification['category'] {
  const normalized = label.toLowerCase();
  if (/length|width|height|wheelbase|clearance|weight|radius|dimension|seat/.test(normalized)) return 'dimensions';
  if (/oil|fluid|coolant|fuel|lubric|capacity/.test(normalized)) return 'fluids';
  if (/tire|tyre|rim|pressure/.test(normalized)) return 'tires';
  if (/brake/.test(normalized)) return 'brakes';
  if (/lamp|light|battery|fuse|electrical|charging/.test(normalized)) return 'electrical';
  if (/engine|displacement|compression|power|torque|valve|spark|idle|cylinder/.test(normalized)) return 'engine';
  if (/suspension|clutch|transmission|frame|caster|trail/.test(normalized)) return 'chassis';
  return 'other';
}

function unwrap(value: unknown): { value: unknown; pages?: number[] } {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    const wrapped = value as { value: unknown; pages?: number[] };
    return { value: wrapped.value, pages: wrapped.pages };
  }
  return { value };
}

function objectEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

function extractSpecificationMap(record: KnowledgeRecord): {
  prefix: string | null;
  entries: [string, unknown][];
} {
  const value = record.value as Record<string, unknown> | null;
  const attributes = record.attributes;
  const maps = [value?.fields, value?.items, value?.specifications, attributes.fields, attributes.items, attributes.specifications];
  for (const candidate of maps) {
    const entries = objectEntries(candidate);
    if (entries.length > 0) return { prefix: null, entries };
  }

  const attributeValues = objectEntries(attributes.values);
  if (attributeValues.length > 0) {
    const item = typeof attributes.item === 'string' ? titleCase(attributes.item) : titleCase(record.subject);
    return { prefix: item, entries: attributeValues };
  }
  if (typeof attributes.field === 'string') {
    return { prefix: null, entries: [[attributes.field, record.value]] };
  }
  if (record.value === null || typeof record.value !== 'object' || Array.isArray(record.value)) {
    return { prefix: null, entries: [[record.subject, record.value]] };
  }

  const entries = objectEntries(record.value).filter(([key]) => !['pages', 'page', 'model', 'category', 'item'].includes(key));
  return entries.length > 0
    ? { prefix: null, entries }
    : { prefix: null, entries: [[record.subject, record.value]] };
}

function specificationItemsForRecord(
  record: KnowledgeRecord,
  variants: ModelVariant[],
  selectedVariant: ModelVariant | null
): ApplicableSpecification[] {
  const { prefix, entries } = extractSpecificationMap(record);
  const recordVariant = selectedVariant && record.modelScope.some((scope) => keyMatchesVariant(scope, selectedVariant))
    ? selectedVariant
    : null;
  const items: ApplicableSpecification[] = [];

  const pushItem = (
    label: string,
    rawValue: unknown,
    index: number,
    variant: ModelVariant | null,
    pages = record.pages
  ) => {
    const applicability = variant
      ? selectedVariant
        ? 'exact_variant'
        : 'variant_alternative'
      : record.modelScope.length > 0
        ? selectedVariant
          ? 'exact_variant'
          : 'variant_alternative'
        : 'shared';
    items.push({
      id: `${record.recordId}:${index}:${variant?.id ?? 'shared'}`,
      recordId: record.recordId,
      label: titleCase(label),
      category: categoryFor(label),
      value: rawValue,
      pages,
      modelScope: variant ? [variant.name] : record.modelScope,
      applicability,
      variantLabel: variant?.name ?? (record.modelScope.length > 0 ? record.modelScope.join(', ') : null),
    });
  };

  entries.forEach(([key, entryValue], index) => {
    const topLevelVariant = variants.find((variant) => keyMatchesVariant(key, variant));
    if (topLevelVariant) {
      if (!selectedVariant || topLevelVariant.id === selectedVariant.id) {
        const unwrapped = unwrap(entryValue);
        pushItem(prefix ?? record.subject, unwrapped.value, index, topLevelVariant, unwrapped.pages ?? record.pages);
      }
      return;
    }

    const unwrapped = unwrap(entryValue);
    const nestedEntries = objectEntries(unwrapped.value);
    const nestedVariantEntries = nestedEntries
      .map(([nestedKey, nestedValue]) => ({
        variant: variants.find((variant) => keyMatchesVariant(nestedKey, variant)) ?? null,
        value: nestedValue,
      }))
      .filter((item) => item.variant !== null);
    if (nestedVariantEntries.length > 0) {
      for (const nested of nestedVariantEntries) {
        if (!selectedVariant || nested.variant?.id === selectedVariant.id) {
          pushItem(key, nested.value, index, nested.variant, unwrapped.pages ?? record.pages);
        }
      }
      return;
    }

    const label = prefix ? `${prefix} · ${titleCase(key)}` : key;
    pushItem(label, unwrapped.value, index, recordVariant, unwrapped.pages ?? record.pages);
  });
  return items;
}

export function getApplicableSpecifications(
  profile: VehicleModelSelection | null | undefined,
  category?: ApplicableSpecification['category']
): ApplicableSpecifications {
  const modelProfile = getModelProfileForVehicle(profile);
  if (!modelProfile) return { shared: [], exactVariant: [], variantAlternatives: [] };
  const selectedVariant = getSelectedVariant(profile, modelProfile);
  const all = modelProfile.records
    .filter((record) => record.section === 'specifications')
    .filter((record) => selectedVariant ? recordAppliesToVariant(record, selectedVariant) : true)
    .flatMap((record) => specificationItemsForRecord(record, modelProfile.variants, selectedVariant))
    .filter((item) => !category || item.category === category);
  return {
    shared: all.filter((item) => item.applicability === 'shared'),
    exactVariant: all.filter((item) => item.applicability === 'exact_variant'),
    variantAlternatives: all.filter((item) => item.applicability === 'variant_alternative'),
  };
}

export const getApplicablePreRideItems = (profile: VehicleModelSelection | null | undefined) =>
  getApplicableRecords(profile, 'pre_ride_inspection');

export const getApplicableIndicators = (profile: VehicleModelSelection | null | undefined) => [
  ...getApplicableRecords(profile, 'warning_lights'),
  ...getApplicableRecords(profile, 'dashboard_indicators'),
];

export const getApplicableTroubleshooting = (profile: VehicleModelSelection | null | undefined) =>
  getApplicableRecords(profile, 'troubleshooting');

export const getApplicableBreakInGuidance = (profile: VehicleModelSelection | null | undefined) =>
  getApplicableRecords(profile, 'break_in');

export const getApplicableFluids = (profile: VehicleModelSelection | null | undefined) =>
  getApplicableRecords(profile, 'fluids');

export function getConflictsForContext(
  profile: VehicleModelSelection | null | undefined,
  context?: string
): ConflictRecord[] {
  const conflicts = getModelProfileForVehicle(profile)?.conflicts ?? [];
  if (!context) return conflicts;
  const normalized = context.toLowerCase().replaceAll('_', ' ');
  return conflicts.filter((conflict) =>
    `${conflict.subject} ${formatKnowledgeValue(conflict.value)}`.toLowerCase().replaceAll('_', ' ').includes(normalized)
  );
}

export function formatSourceCitation(
  record: Pick<KnowledgeRecord, 'pages'>,
  profile: ModelKnowledgeProfile
): string {
  const pageLabel = record.pages.length === 1 ? `PDF p. ${record.pages[0]}` : `PDF pp. ${record.pages.join(', ')}`;
  return `${profile.brandName} ${profile.modelName} · ${profile.manualYears} ${profile.manualVersion} · ${pageLabel}`;
}

export function formatKnowledgeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not specified in this manual.';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatKnowledgeValue).join(' • ');
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['pages', 'page'].includes(key))
    .map(([key, nested]) => `${titleCase(key)}: ${formatKnowledgeValue(nested)}`)
    .join(' • ');
}
