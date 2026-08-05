import type { ServiceLog } from '../types/database.types';
import type { InspectionResult, MaintenanceAction, MaintenanceEvent } from './types';

const ACTIONS = new Set<MaintenanceAction>([
  'inspect', 'replace', 'clean', 'adjust', 'lubricate', 'test', 'tighten',
  'initial_service', 'condition_check',
]);
const RESULTS = new Set<InspectionResult>([
  'healthy', 'cleaning_needed', 'monitor', 'service_soon', 'replace_soon', 'replace_now', 'unable_to_inspect',
]);

export type StoredMaintenanceClassification =
  | { status: 'exact'; event: MaintenanceEvent }
  | { status: 'legacy_needs_confirmation'; legacyLogId: number; reason: string };

/** Never infers a rule or action from a legacy display name. */
export function classifyStoredMaintenanceLog(log: ServiceLog): StoredMaintenanceClassification {
  if (log.maintenance_migration_status !== 'exact') {
    return {
      status: 'legacy_needs_confirmation',
      legacyLogId: log.id,
      reason: 'The legacy row has no explicit profile, rule, and action identity.',
    };
  }
  if (!log.maintenance_profile_id || !log.maintenance_profile_version
    || !log.maintenance_rule_id || !log.maintenance_component_id
    || !log.maintenance_action || !ACTIONS.has(log.maintenance_action as MaintenanceAction)) {
    return {
      status: 'legacy_needs_confirmation',
      legacyLogId: log.id,
      reason: 'The row claims exact migration but its action-specific identity is incomplete.',
    };
  }
  if (log.inspection_result && !RESULTS.has(log.inspection_result as InspectionResult)) {
    return {
      status: 'legacy_needs_confirmation',
      legacyLogId: log.id,
      reason: 'The stored inspection result is not recognized.',
    };
  }
  return {
    status: 'exact',
    event: {
      id: `service-log:${log.id}`,
      vehicleId: log.vehicle_id,
      profileId: log.maintenance_profile_id,
      profileVersion: log.maintenance_profile_version,
      ruleId: log.maintenance_rule_id,
      componentId: log.maintenance_component_id,
      action: log.maintenance_action as MaintenanceAction,
      performedOn: log.date,
      odometerKm: log.sets_odometer_baseline === 1 ? log.mileage : null,
      inspectionResult: (log.inspection_result as InspectionResult | null | undefined) ?? null,
      notes: log.notes,
      migrationConfidence: 'exact',
    },
  };
}
