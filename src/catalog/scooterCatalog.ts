import catalogJson from '../generated/scooterCatalog.json';

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
};

export type ResolvedScooterSelection = ScooterSelection & {
  brand: ScooterManufacturer;
  model: ScooterModel;
  version: ScooterVersion;
};

export type MaintenanceTemplate = {
  name: string;
  intervalKm: number | null;
  type: 'check' | 'clean' | 'replace';
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
  return {
    brandId: brand.id,
    modelId: model.id,
    versionId: version.id,
    brand,
    model,
    version,
  };
}

export function selectionFromProfile(profile: {
  scooter_brand_id: string | null;
  scooter_model_id: string | null;
  scooter_version_id: string | null;
}): ResolvedScooterSelection | null {
  return resolveScooterSelection({
    brandId: profile.scooter_brand_id ?? undefined,
    modelId: profile.scooter_model_id ?? undefined,
    versionId: profile.scooter_version_id ?? undefined,
  });
}

export function formatScooterSelection(selection: Partial<ScooterSelection>): string {
  const resolved = resolveScooterSelection(selection);
  return resolved
    ? `${resolved.brand.name} ${resolved.model.name} - ${resolved.version.name}`
    : 'Scooter not selected';
}

/**
 * All maintenance consumers resolve their starting plan through a catalog
 * selection. Model-specific overrides can be added here without changing UI or
 * persistence code. Oil is deliberately a 1,000 km replacement, not an inspection.
 */
export function getMaintenanceTemplate(selection: ScooterSelection): MaintenanceTemplate[] {
  if (!resolveScooterSelection(selection)) {
    throw new Error('Select a scooter from the available manual catalog first.');
  }
  return [
    { name: 'Oil Change', intervalKm: 1000, type: 'replace' },
    { name: 'Gearbox Oil Change', intervalKm: 3000, type: 'replace' },
    { name: 'Air Filter', intervalKm: 1000, type: 'check' },
    { name: 'Brake Pads', intervalKm: 2000, type: 'check' },
    { name: 'Cleaning', intervalKm: null, type: 'clean' },
    { name: 'CVT & Pull Rollers', intervalKm: 5000, type: 'check' },
    { name: 'Carburetor', intervalKm: 5000, type: 'clean' },
  ];
}
