import { OTHER_BRAND_ID, CUSTOM_MODEL_ID, CUSTOM_VERSION_ID } from '../catalog/customVehicleIdentity';
import {
  normalizeVehicleCapabilities,
  vehicleCapabilitiesAreUnknown,
  type VehicleCapabilities,
} from '../catalog/vehicleCapabilities';
import catalogueJson from '../../maintenance-data/universal-maintenance-catalogue.json';
import type {
  MaintenanceAction,
  MaintenanceCatalogue,
  MaintenanceComponentDefinition,
  MaintenanceRule,
  ScooterMaintenanceProfile,
} from './types';

export const UNIVERSAL_CUSTOM_PROFILE_ID = 'universal-owner-defined-motorcycle-or-scooter';

const catalogue = catalogueJson as MaintenanceCatalogue;
const componentsById = new Map(catalogue.components.map((component) => [component.id, component]));

// These stable IDs keep the existing quick-record and maintenance-history
// entry points working. The IDs are identities only: the universal rules below
// deliberately contain no distance or time values.
const SHARED_ENTRY_RULE_IDS: Readonly<Record<string, string>> = {
  'engine-oil:replace': 'engine-oil.replace.recurring-1000km',
  'transmission-oil:replace': 'transmission-oil.replace.recurring-5000km-5mo',
  'air-cleaner-element:inspect': 'air-cleaner-element.inspect.recurring-1000km-1mo',
  'air-cleaner-element:clean': 'air-cleaner-element.clean.if-needed',
  'air-cleaner-element:replace': 'air-cleaner-element.replace.if-necessary',
  'brake-pads:inspect': 'brake-pads.inspect.recurring-1000km-1mo',
  'tires:inspect': 'tires.inspect.recurring-1000km-1mo',
  'drive-belt-rollers:inspect': 'drive-belt-rollers.inspect.recurring-6000km-6mo',
  'general-fasteners:inspect': 'general-fasteners.inspect.recurring-1000km-1mo',
};

function universalRuleId(componentId: string, action: MaintenanceAction): string {
  return SHARED_ENTRY_RULE_IDS[`${componentId}:${action}`]
    ?? `universal.${componentId}.${action}`;
}

const rules: MaintenanceRule[] = catalogue.components.flatMap((component) =>
  component.allowedActions.map((action): MaintenanceRule => ({
    id: universalRuleId(component.id, action),
    componentId: component.id,
    category: component.category,
    label: `${component.label}: ${action.replaceAll('_', ' ')}`,
    applicable: true,
    action,
    schedule: { type: 'manual_only_or_no_fixed_interval' },
    safetyCritical: component.defaultSafetyCritical,
    technicianRecommended: true,
    userInspectable: action === 'inspect' || action === 'condition_check' || action === 'test',
    technicianLevel: action === 'inspect' || action === 'condition_check' || action === 'test'
      ? 'user_checkable'
      : 'workshop_recommended',
    instructions: 'Record this work when it is performed. Add a personal reminder only when the owner has a value from the vehicle manual or a trusted mechanic.',
    notes: 'Universal tracking option. No manufacturer applicability or interval is asserted.',
    source: {
      sourceType: 'project_owner_override',
      section: 'Universal owner-defined maintenance tracking',
      originalText: 'Tracking capability only; no maintenance interval is supplied.',
    },
    confidence: 'owner_confirmed',
  }))
);

/**
 * Full owner-configurable maintenance tracking for vehicles without a verified
 * manufacturer profile. Every catalogue action is present, but every schedule
 * starts empty and can only become due after the owner creates a reminder.
 */
export const UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE: ScooterMaintenanceProfile = {
  schemaVersion: 1,
  id: UNIVERSAL_CUSTOM_PROFILE_ID,
  profileVersion: '2026.08.09-owner-defined-1',
  status: 'production_ready',
  manufacturer: 'Owner-defined',
  model: 'Motorcycle or scooter',
  modelCodes: [],
  engine: {
    displacementCc: null,
    cooling: 'unknown',
    coolingConfidence: 'unclear',
    notes: 'The owner has not selected a verified manufacturer specification profile.',
  },
  supportedYears: { from: 1900, to: null, confidence: 'owner_defined' },
  markets: ['global'],
  catalogSelection: {
    brandId: OTHER_BRAND_ID,
    modelId: CUSTOM_MODEL_ID,
    versionId: CUSTOM_VERSION_ID,
    variantId: '',
  },
  manual: { id: '', filename: '', pageCount: 0 },
  identitySources: [],
  manualLegend: {},
  severeUseGuidance: [],
  profileAmbiguities: [{
    id: 'owner-defined-vehicle-applicability',
    critical: false,
    description: 'Component applicability and reminder values depend on the owner-defined vehicle.',
    safeBehavior: 'no_automatic_reminder',
    resolutionRequired: 'The owner may track applicable components and enter values from a trusted source.',
  }],
  defaultTrackedRuleIds: [universalRuleId('engine-oil', 'replace')],
  quickRecordRuleIds: rules.map((rule) => rule.id),
  rules,
};

function componentApplies(
  component: MaintenanceComponentDefinition,
  capabilities: VehicleCapabilities
): boolean {
  const applicability = component.applicability;
  if (!applicability) return true;
  const matches = <T extends string>(actual: T | 'unknown', allowed: readonly T[] | undefined) =>
    actual === 'unknown' || !allowed || allowed.includes(actual);
  return matches(capabilities.powertrain, applicability.powertrains)
    && matches(capabilities.transmission, applicability.transmissions)
    && matches(capabilities.finalDrive, applicability.finalDrives)
    && matches(capabilities.cooling, applicability.cooling)
    && matches(capabilities.brakeSystem, applicability.brakeSystems)
    && matches(capabilities.abs, applicability.abs)
    && matches(capabilities.wheelType, applicability.wheelTypes);
}

/**
 * Filters the universal catalogue only when the owner knows a system value.
 * Unknown answers stay inclusive, so an existing or uncommon vehicle never
 * loses a tracking option merely because its specifications are incomplete.
 */
export function getUniversalCustomMaintenanceProfile(
  value: Partial<VehicleCapabilities> | null | undefined
): ScooterMaintenanceProfile {
  const capabilities = normalizeVehicleCapabilities(value);
  if (vehicleCapabilitiesAreUnknown(capabilities)) return UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE;
  return {
    ...UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE,
    rules: UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE.rules.filter((rule) => {
      const component = componentsById.get(rule.componentId);
      return component ? componentApplies(component, capabilities) : true;
    }),
  };
}
