import catalogueJson from '../../maintenance-data/universal-maintenance-catalogue.json';
import newSymphonySt200Json from '../../maintenance-data/new-symphony-st-200.profile.json';
import { OTHER_BRAND_ID, CUSTOM_MODEL_ID, CUSTOM_VERSION_ID } from '../catalog/customVehicleIdentity';
import type { VehicleCapabilities } from '../catalog/vehicleCapabilities';
import { getUniversalCustomMaintenanceProfile } from './universalProfile';
import type { MaintenanceCatalogue, ScooterMaintenanceProfile } from './types';

export const UNIVERSAL_MAINTENANCE_CATALOGUE = catalogueJson as MaintenanceCatalogue;
export const NEW_SYMPHONY_ST_200_PROFILE = newSymphonySt200Json as ScooterMaintenanceProfile;
export const MAINTENANCE_PROFILES = [NEW_SYMPHONY_ST_200_PROFILE] as const;

export type MaintenanceProfileSelection = {
  brandId?: string | null;
  modelId?: string | null;
  versionId?: string | null;
  variantId?: string | null;
  capabilities?: VehicleCapabilities;
};

export function getMaintenanceProfileForSelection(
  selection: MaintenanceProfileSelection | null | undefined
): ScooterMaintenanceProfile | null {
  if (!selection) return null;
  if (
    selection.brandId === OTHER_BRAND_ID
    && selection.modelId === CUSTOM_MODEL_ID
    && selection.versionId === CUSTOM_VERSION_ID
  ) {
    return getUniversalCustomMaintenanceProfile(selection.capabilities);
  }
  return MAINTENANCE_PROFILES.find((profile) =>
    profile.catalogSelection.brandId === selection.brandId
    && profile.catalogSelection.modelId === selection.modelId
    && profile.catalogSelection.versionId === selection.versionId
    && profile.catalogSelection.variantId === selection.variantId
  ) ?? null;
}

export function isMaintenanceProfileSelectable(
  selection: MaintenanceProfileSelection | null | undefined
): boolean {
  const profile = getMaintenanceProfileForSelection(selection);
  return profile?.status === 'validated' || profile?.status === 'production_ready';
}

export function getSelectableMaintenanceProfiles(): ScooterMaintenanceProfile[] {
  return MAINTENANCE_PROFILES.filter(
    (profile) => profile.status === 'validated' || profile.status === 'production_ready'
  );
}
