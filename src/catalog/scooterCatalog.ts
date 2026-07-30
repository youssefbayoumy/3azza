import catalogJson from '../generated/scooterCatalog.json';
import { getApplicableMaintenance, getModelProfileForSelection } from '../modelData/modelKnowledge';
import type { ModelVariant } from '../modelData/types';

export type ScooterVersion = {
  id: string;
  name: string;
  manualId: string;
  manualFileName: string;
  manualRelativePath: string;
  onlineManualUrl: string | null;
};

export type ScooterModel = {
  id: string;
  name: string;
  versions: ScooterVersion[];
};

export type ScooterManufacturer = {
  id: string;
  name: string;
  models: ScooterModel[];
};

export type ScooterSelection = {
  brandId: string;
  modelId: string;
  versionId: string;
  variantId?: string | null;
};

export type ResolvedScooterSelection = ScooterSelection & {
  brand: ScooterManufacturer;
  model: ScooterModel;
  version: ScooterVersion;
  variant: ModelVariant | null;
};

export type MaintenanceTemplate = {
  canonicalId: string;
  name: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  type: 'check' | 'clean' | 'replace';
  origin: 'manual' | '3azza_policy';
  manualIntervalKm: number | null;
  initialDistanceKm: number[];
  sourceManualId: string;
  sourcePages: number[];
  guidance: unknown[];
  severeUseNotes: string[];
};

type ScooterCatalog = {
  schemaVersion: number;
  source: string;
  manufacturers: ScooterManufacturer[];
};

export const scooterCatalog = catalogJson as ScooterCatalog;

export function resolveScooterSelection(
  selection: Partial<ScooterSelection>
): ResolvedScooterSelection | null {
  if (!selection.brandId || !selection.modelId || !selection.versionId) return null;
  const brand = scooterCatalog.manufacturers.find((item) => item.id === selection.brandId);
  const model = brand?.models.find((item) => item.id === selection.modelId);
  const version = model?.versions.find((item) => item.id === selection.versionId);
  if (!brand || !model || !version) return null;
  const modelProfile = getModelProfileForSelection({
    brandId: brand.id,
    modelId: model.id,
    versionId: version.id,
  });
  const variant = selection.variantId
    ? modelProfile?.variants.find((item) => item.id === selection.variantId) ?? null
    : null;
  if (selection.variantId && !variant) return null;
  return {
    brandId: brand.id,
    modelId: model.id,
    versionId: version.id,
    brand,
    model,
    version,
    variant,
  };
}

export function isScooterSelectionComplete(selection: Partial<ScooterSelection>): selection is ScooterSelection {
  const resolved = resolveScooterSelection(selection);
  if (!resolved) return false;
  const profile = getModelProfileForSelection(selection);
  return !profile?.requiresVariant || resolved.variant !== null;
}

export function selectionFromProfile(profile: {
  scooter_brand_id: string | null;
  scooter_model_id: string | null;
  scooter_version_id: string | null;
  scooter_variant_id?: string | null;
}): ResolvedScooterSelection | null {
  return resolveScooterSelection({
    brandId: profile.scooter_brand_id ?? undefined,
    modelId: profile.scooter_model_id ?? undefined,
    versionId: profile.scooter_version_id ?? undefined,
    variantId: profile.scooter_variant_id ?? undefined,
  });
}

export function formatScooterSelection(selection: Partial<ScooterSelection>): string {
  const resolved = resolveScooterSelection(selection);
  return resolved
    ? `${resolved.brand.name} ${resolved.model.name} - ${resolved.version.name}${resolved.variant ? ` · ${resolved.variant.name}` : ''}`
    : 'Scooter not selected';
}

/**
 * All maintenance consumers resolve their starting plan through a catalog
 * selection. Model-specific overrides can be added here without changing UI or
 * persistence code. Oil is deliberately a 1,000 km replacement, not an inspection.
 */
export function getMaintenanceTemplate(selection: ScooterSelection): MaintenanceTemplate[] {
  const resolved = resolveScooterSelection(selection);
  if (!resolved) {
    throw new Error('Select a scooter from the available manual catalog first.');
  }
  const vehicleSelection = {
    scooter_brand_id: resolved.brandId,
    scooter_model_id: resolved.modelId,
    scooter_version_id: resolved.versionId,
    scooter_variant_id: resolved.variant?.id ?? null,
  };
  return getApplicableMaintenance(vehicleSelection).map((task) => ({
    canonicalId: task.canonicalId,
    name: task.name,
    intervalKm: task.recommendedIntervalKm,
    intervalMonths: task.manualIntervalMonths,
    type: task.action,
    origin: task.recommendationOrigin,
    manualIntervalKm: task.manualIntervalKm,
    initialDistanceKm: task.initialDistanceKm,
    sourceManualId: resolved.version.manualId,
    sourcePages: task.pages,
    guidance: task.guidance.map((item) => item.value),
    severeUseNotes: task.severeUseNotes,
  }));
}
