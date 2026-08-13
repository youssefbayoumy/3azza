import catalogJson from '../generated/scooterCatalog.json';
import { getModelProfileForSelection } from '../modelData/modelKnowledge';
import type { ModelVariant } from '../modelData/types';
import { isMaintenanceProfileSelectable } from '../maintenance/profiles';
import { CUSTOM_MODEL_ID, CUSTOM_VERSION_ID, OTHER_BRAND_ID } from './customVehicleIdentity';
import {
  normalizeVehicleCapabilities,
  parseVehicleCapabilities,
  type VehicleCapabilities,
} from './vehicleCapabilities';

export { CUSTOM_MODEL_ID, CUSTOM_VERSION_ID, OTHER_BRAND_ID } from './customVehicleIdentity';

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
  selectionMode?: 'catalog' | 'custom_brand';
  brandId: string;
  modelId: string;
  versionId: string;
  variantId?: string | null;
  customBrandName?: string | null;
  customModelName?: string | null;
  capabilities?: VehicleCapabilities;
};

export type ResolvedScooterSelection = ScooterSelection & {
  brand: ScooterManufacturer;
  model: ScooterModel;
  version: ScooterVersion;
  variant: ModelVariant | null;
};

export const otherBrandOption: ScooterManufacturer = {
  id: OTHER_BRAND_ID,
  name: 'Other',
  models: [],
};

const customName = (value: string | null | undefined) => value?.trim() ?? '';

export function isCustomBrandSelection(
  selection: Partial<ScooterSelection> | null | undefined
): boolean {
  return selection?.selectionMode === 'custom_brand' || selection?.brandId === OTHER_BRAND_ID;
}

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
  if (isCustomBrandSelection(selection)) {
    const brandName = customName(selection.customBrandName);
    const modelName = customName(selection.customModelName);
    if (
      selection.brandId !== OTHER_BRAND_ID
      || selection.modelId !== CUSTOM_MODEL_ID
      || selection.versionId !== CUSTOM_VERSION_ID
      || !brandName
      || !modelName
      || brandName.length > 80
      || modelName.length > 80
    ) return null;

    const version: ScooterVersion = {
      id: CUSTOM_VERSION_ID,
      name: 'Basic tracking',
      manualId: '',
      manualFileName: '',
      manualRelativePath: '',
      onlineManualUrl: null,
    };
    const model: ScooterModel = { id: CUSTOM_MODEL_ID, name: modelName, versions: [version] };
    const brand: ScooterManufacturer = { id: OTHER_BRAND_ID, name: brandName, models: [model] };
    return {
      selectionMode: 'custom_brand',
      brandId: OTHER_BRAND_ID,
      modelId: CUSTOM_MODEL_ID,
      versionId: CUSTOM_VERSION_ID,
      variantId: null,
      customBrandName: brandName,
      customModelName: modelName,
      capabilities: normalizeVehicleCapabilities(selection.capabilities),
      brand,
      model,
      version,
      variant: null,
    };
  }
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
    selectionMode: 'catalog',
    brandId: brand.id,
    modelId: model.id,
    versionId: version.id,
    variantId: variant?.id ?? null,
    brand,
    model,
    version,
    variant,
  };
}

export function isScooterSelectionComplete(selection: Partial<ScooterSelection>): selection is ScooterSelection {
  const resolved = resolveScooterSelection(selection);
  if (!resolved) return false;
  if (isCustomBrandSelection(resolved)) return true;
  const profile = getModelProfileForSelection(selection);
  const exactVariantSelected = !profile?.requiresVariant || resolved.variant !== null;
  return exactVariantSelected && isMaintenanceProfileSelectable(resolved);
}

export function selectionFromProfile(profile: {
  scooter_brand_id: string | null;
  scooter_model_id: string | null;
  scooter_version_id: string | null;
  scooter_variant_id?: string | null;
  vehicle_selection_mode?: 'catalog' | 'custom_brand';
  custom_brand_name?: string | null;
  custom_model_name?: string | null;
  vehicle_capabilities_json?: string | null;
}): ResolvedScooterSelection | null {
  return resolveScooterSelection({
    selectionMode: profile.vehicle_selection_mode ?? 'catalog',
    brandId: profile.scooter_brand_id ?? undefined,
    modelId: profile.scooter_model_id ?? undefined,
    versionId: profile.scooter_version_id ?? undefined,
    variantId: profile.scooter_variant_id ?? undefined,
    customBrandName: profile.custom_brand_name ?? undefined,
    customModelName: profile.custom_model_name ?? undefined,
    capabilities: parseVehicleCapabilities(profile.vehicle_capabilities_json),
  });
}

export function formatScooterSelection(selection: Partial<ScooterSelection>): string {
  const resolved = resolveScooterSelection(selection);
  if (resolved && isCustomBrandSelection(resolved)) {
    return `${resolved.brand.name} ${resolved.model.name}`;
  }
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
  throw new Error(
    `Legacy interval templates are disabled for ${resolved.version.name}. Use the action-specific maintenance profile scheduler.`
  );
}
