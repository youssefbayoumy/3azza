import catalogueJson from '../../maintenance-data/universal-maintenance-catalogue.json';
import newSymphonySt200Json from '../../maintenance-data/new-symphony-st-200.profile.json';
import { OTHER_BRAND_ID, CUSTOM_MODEL_ID, CUSTOM_VERSION_ID } from '../catalog/customVehicleIdentity';
import type { VehicleCapabilities } from '../catalog/vehicleCapabilities';
import { getUniversalCustomMaintenanceProfile } from './universalProfile';
import type { MaintenanceCatalogue, MaintenanceRule, ScooterMaintenanceProfile } from './types';

export const UNIVERSAL_MAINTENANCE_CATALOGUE = catalogueJson as MaintenanceCatalogue;
export const NEW_SYMPHONY_ST_200_PROFILE = newSymphonySt200Json as ScooterMaintenanceProfile;
export const MAINTENANCE_PROFILES = [NEW_SYMPHONY_ST_200_PROFILE] as const;

export type MaintenanceProfileSelection = {
  profileId?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  versionId?: string | null;
  variantId?: string | null;
  capabilities?: VehicleCapabilities;
};

function matchesCatalogSelection(
  profile: ScooterMaintenanceProfile,
  selection: MaintenanceProfileSelection
): boolean {
  return profile.catalogSelection.brandId === selection.brandId
    && profile.catalogSelection.modelId === selection.modelId
    && profile.catalogSelection.versionId === selection.versionId
    && profile.catalogSelection.variantId === selection.variantId;
}

function matchesProvidedCatalogIdentity(
  profile: ScooterMaintenanceProfile,
  selection: MaintenanceProfileSelection
): boolean {
  return (selection.brandId == null || profile.catalogSelection.brandId === selection.brandId)
    && (selection.modelId == null || profile.catalogSelection.modelId === selection.modelId)
    && (selection.versionId == null || profile.catalogSelection.versionId === selection.versionId)
    && (selection.variantId == null || profile.catalogSelection.variantId === selection.variantId);
}

export function getMaintenanceProfileForSelection(
  selection: MaintenanceProfileSelection | null | undefined,
  availableProfiles: readonly ScooterMaintenanceProfile[] = MAINTENANCE_PROFILES
): ScooterMaintenanceProfile | null {
  if (!selection) return null;
  if (
    selection.brandId === OTHER_BRAND_ID
    && selection.modelId === CUSTOM_MODEL_ID
    && selection.versionId === CUSTOM_VERSION_ID
  ) {
    const profile = getUniversalCustomMaintenanceProfile(selection.capabilities);
    return selection.profileId && selection.profileId !== profile.id ? null : profile;
  }
  const matches = selection.profileId
    ? availableProfiles.filter((profile) => profile.id === selection.profileId && matchesProvidedCatalogIdentity(profile, selection))
    : availableProfiles.filter((profile) => matchesCatalogSelection(profile, selection));
  return matches.length === 1 ? matches[0] : null;
}

/** Resolves the stable profile lineage ID at the catalog/selection boundary. */
export function resolveMaintenanceProfileIdForSelection(
  selection: MaintenanceProfileSelection | null | undefined,
  availableProfiles: readonly ScooterMaintenanceProfile[] = MAINTENANCE_PROFILES
): string | null {
  return getMaintenanceProfileForSelection(selection, availableProfiles)?.id ?? null;
}

/** Returns applicable profile-owned quick-record rules in the declared order. */
export function quickRecordRules(profile: ScooterMaintenanceProfile): MaintenanceRule[] {
  const rulesById = new Map(profile.rules.map((rule) => [rule.id, rule]));
  return (profile.quickRecordRuleIds ?? []).flatMap((ruleId) => {
    const rule = rulesById.get(ruleId);
    return rule?.applicable ? [rule] : [];
  });
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
