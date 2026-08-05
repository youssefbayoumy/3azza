import type { DatabaseBackupData } from '../services/database';
import type {
  DocumentItem,
  GasLog,
  InventoryItem,
  PreRideState,
  ServiceInterval,
  ServiceLog,
  VehicleProfile,
  VehicleVitals,
} from '../types/database.types';
import { parseIsoDate } from './dates';
import { resolveScooterSelection } from '../catalog/scooterCatalog';
import {
  getInventoryStatus,
  validateInventoryQuantity,
  validateRecordedOdometer,
  validateVehicleVital,
  type VehicleVitalField,
} from './recordValidation';

export type EmbeddedDocumentFile = {
  document_id: number;
  extension: 'jpg' | 'jpeg' | 'png' | 'webp' | 'heic' | 'heif';
  mime_type: string;
  sha256: string;
  data_base64: string;
};

export type BackupSnapshot = {
  exported_at: string;
  schema: '3azza-local-backup/v4';
  data: DatabaseBackupData;
  document_files: EmbeddedDocumentFile[];
};

export type NormalizedBackupArchive = {
  source_schema: '3azza-local-backup/v1' | '3azza-local-backup/v2' | '3azza-local-backup/v3' | '3azza-local-backup/v4';
  data: DatabaseBackupData;
  document_files: EmbeddedDocumentFile[];
};

type PriorVehicleProfile = Omit<
  VehicleProfile,
  | 'service_history_setup_completed'
  | 'tank_capacity_liters'
  | 'scooter_brand_id'
  | 'scooter_model_id'
  | 'scooter_version_id'
  | 'scooter_variant_id'
> & {
  service_history_setup_completed?: number;
  tank_capacity_liters?: number | null;
  scooter_brand_id?: string | null;
  scooter_model_id?: string | null;
  scooter_version_id?: string | null;
  scooter_variant_id?: string | null;
};
type PriorServiceInterval = Omit<
  ServiceInterval,
  | 'has_known_odometer_baseline'
  | 'canonical_task_id'
  | 'recommended_interval_km'
  | 'recommended_interval_months'
  | 'user_interval_km'
  | 'user_override_active'
  | 'recommendation_origin'
  | 'source_manual_id'
  | 'source_pages_json'
  | 'manual_guidance_json'
  | 'initial_milestones_json'
  | 'severe_use_note'
  | 'is_applicable'
  | 'last_service_date'
> & {
  has_known_odometer_baseline?: number;
  canonical_task_id?: string | null;
  recommended_interval_km?: number | null;
  recommended_interval_months?: number | null;
  user_interval_km?: number | null;
  user_override_active?: number;
  recommendation_origin?: ServiceInterval['recommendation_origin'];
  source_manual_id?: string | null;
  source_pages_json?: string | null;
  manual_guidance_json?: string | null;
  initial_milestones_json?: string | null;
  severe_use_note?: string | null;
  is_applicable?: number;
  last_service_date?: string | null;
};
type PriorServiceLog = Omit<ServiceLog, 'sets_odometer_baseline'> & {
  sets_odometer_baseline?: number;
};
type PriorGasLog = Omit<GasLog, 'logged_on' | 'is_full_tank'> & {
  logged_on?: string;
  is_full_tank?: number;
};
type PriorDatabaseBackupData = Omit<
  DatabaseBackupData,
  'vehicle_profiles' | 'service_intervals' | 'service_logs' | 'gas_logs'
> & {
  vehicle_profiles: PriorVehicleProfile[];
  service_intervals: PriorServiceInterval[];
  service_logs: PriorServiceLog[];
  gas_logs: PriorGasLog[];
};

type LegacyBackupSnapshot = {
  exported_at: string;
  schema: '3azza-local-backup/v1';
  vehicle_profile: (Omit<PriorVehicleProfile, 'name'> & { name?: string }) | null;
  vehicle_vitals: (Omit<VehicleVitals, 'vehicle_id'> & { vehicle_id?: number }) | null;
  service_intervals: (Omit<PriorServiceInterval, 'vehicle_id'> & { vehicle_id?: number })[];
  service_logs: (Omit<PriorServiceLog, 'vehicle_id'> & { vehicle_id?: number })[];
  gas_logs: (Omit<PriorGasLog, 'vehicle_id'> & { vehicle_id?: number })[];
  inventory_items: (Omit<InventoryItem, 'vehicle_id'> & { vehicle_id?: number })[];
  documents_vault: (Omit<DocumentItem, 'vehicle_id'> & { vehicle_id?: number })[];
  pre_ride_checks: (Omit<PreRideState, 'vehicle_id'> & { vehicle_id?: number }) | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const BACKUP_ARRAY_KEYS = [
  'vehicle_profiles',
  'vehicle_vitals',
  'service_intervals',
  'service_logs',
  'gas_logs',
  'inventory_items',
  'documents_vault',
  'pre_ride_checks',
] as const;

const DOCUMENT_EXTENSIONS = new Set<EmbeddedDocumentFile['extension']>([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
]);
const MAX_DOCUMENT_FILE_BASE64_LENGTH = 32 * 1024 * 1024;
const MAX_TOTAL_DOCUMENT_FILE_BASE64_LENGTH = 128 * 1024 * 1024;
const MAINTENANCE_HISTORY_LEVELS = new Set([
  'not_asked',
  'detailed_records',
  'recent_memory',
  'little_or_none',
  'skipped',
]);
const MAINTENANCE_CONFIDENCES = new Set([
  'confirmed',
  'estimated',
  'unknown',
  'historical_unverified',
  'legacy_unmapped',
]);
const MAINTENANCE_RECORD_SOURCES = new Set([
  'maintenance_planner',
  'manual_entry',
  'history_onboarding',
  'service_package',
  'backup_restore',
  'legacy',
]);
const MAINTENANCE_HISTORY_STATES = new Set([
  'confirmed',
  'estimated',
  'unknown',
  'never_done',
  'not_applicable',
  'historical_unverified',
  'legacy_unmapped',
]);

function invalid(path: string, message: string): never {
  throw new Error(`Invalid backup at ${path}: ${message}`);
}

function requireBackupArrays(value: Record<string, unknown>, path = 'data'): void {
  for (const key of BACKUP_ARRAY_KEYS) {
    const rows = value[key];
    if (!Array.isArray(rows)) invalid(`${path}.${key}`, 'must be an array');
    rows.forEach((row, index) => {
      if (!isObject(row)) invalid(`${path}.${key}[${index}]`, 'must be an object');
    });
  }
}

function requireString(
  row: Record<string, unknown>,
  key: string,
  path: string,
  options: { nullable?: boolean; nonEmpty?: boolean } = {}
): string | null {
  const value = row[key];
  if (value === null && options.nullable) return null;
  if (typeof value !== 'string') invalid(`${path}.${key}`, 'must be a string');
  if (options.nonEmpty && value.trim().length === 0) invalid(`${path}.${key}`, 'cannot be empty');
  return value;
}

function requireNumber(
  row: Record<string, unknown>,
  key: string,
  path: string,
  options: { integer?: boolean; min?: number; nullable?: boolean } = {}
): number | null {
  const value = row[key];
  if (value === null && options.nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${path}.${key}`, 'must be a finite number');
  }
  if (options.integer && !Number.isSafeInteger(value)) {
    invalid(`${path}.${key}`, 'must be a safe whole number');
  }
  if (options.min !== undefined && value < options.min) {
    invalid(`${path}.${key}`, `cannot be less than ${options.min}`);
  }
  return value;
}

function requirePositiveId(row: Record<string, unknown>, path: string): number {
  return requireNumber(row, 'id', path, { integer: true, min: 1 }) as number;
}

function requireBooleanFlag(row: Record<string, unknown>, key: string, path: string): number {
  const value = requireNumber(row, key, path, { integer: true });
  if (value !== 0 && value !== 1) invalid(`${path}.${key}`, 'must be 0 or 1');
  return value;
}

function requireDateTime(value: string | null, path: string, nullable = false): void {
  if (value === null && nullable) return;
  if (value === null || !Number.isFinite(Date.parse(value))) {
    invalid(path, 'must be a valid date/time');
  }
}

function requireIsoDate(value: string | null, path: string, nullable = false): void {
  if (value === null && nullable) return;
  if (value === null || parseIsoDate(value) === null) invalid(path, 'must use a valid YYYY-MM-DD date');
}

function requireUniqueId(id: number, seen: Set<number>, path: string): void {
  if (seen.has(id)) invalid(`${path}.id`, `duplicates ID ${id}`);
  seen.add(id);
}

function requireVehicleReference(
  row: Record<string, unknown>,
  path: string,
  vehicleIds: Set<number>
): number {
  const vehicleId = requireNumber(row, 'vehicle_id', path, { integer: true, min: 1 }) as number;
  if (!vehicleIds.has(vehicleId)) invalid(`${path}.vehicle_id`, `references missing vehicle ${vehicleId}`);
  return vehicleId;
}

function rows(value: Record<string, unknown>, key: typeof BACKUP_ARRAY_KEYS[number]): Record<string, unknown>[] {
  return value[key] as Record<string, unknown>[];
}

export function validateDatabaseBackupData(value: unknown): asserts value is DatabaseBackupData {
  if (!isObject(value)) invalid('data', 'must be an object');
  requireBackupArrays(value);

  const profiles = rows(value, 'vehicle_profiles');
  if (profiles.length === 0) invalid('data.vehicle_profiles', 'must contain at least one vehicle');

  const vehicleIds = new Set<number>();
  const vehicleOdometers = new Map<number, number>();
  profiles.forEach((profile, index) => {
    const path = `data.vehicle_profiles[${index}]`;
    const id = requirePositiveId(profile, path);
    requireUniqueId(id, vehicleIds, path);
    requireString(profile, 'name', path, { nonEmpty: true });
    const currentMileage = requireNumber(profile, 'current_mileage', path, { integer: true, min: 0 }) as number;
    vehicleOdometers.set(id, currentMileage);
    requireNumber(profile, 'total_km_range', path, { integer: true, min: 0 });
    requireBooleanFlag(profile, 'has_completed_setup', path);
    requireBooleanFlag(profile, 'service_history_setup_completed', path);
    if (profile.maintenance_history_level !== undefined) {
      const historyLevel = requireString(profile, 'maintenance_history_level', path, { nonEmpty: true });
      if (!MAINTENANCE_HISTORY_LEVELS.has(historyLevel as string)) {
        invalid(`${path}.maintenance_history_level`, 'is not a supported history level');
      }
    }
    requireDateTime(requireString(profile, 'created_at', path, { nonEmpty: true }), `${path}.created_at`);
    requireNumber(profile, 'daily_average_km', path, { integer: true, min: 0 });
    requireNumber(profile, 'tank_capacity_liters', path, { min: Number.MIN_VALUE, nullable: true });
    const scooterBrandId = requireString(profile, 'scooter_brand_id', path, { nullable: true });
    const scooterModelId = requireString(profile, 'scooter_model_id', path, { nullable: true });
    const scooterVersionId = requireString(profile, 'scooter_version_id', path, { nullable: true });
    const scooterVariantId = profile.scooter_variant_id === undefined
      ? null
      : requireString(profile, 'scooter_variant_id', path, { nullable: true });
    const hasAnyScooterField = scooterBrandId !== null || scooterModelId !== null || scooterVersionId !== null;
    if (hasAnyScooterField && !resolveScooterSelection({
      brandId: scooterBrandId ?? undefined,
      modelId: scooterModelId ?? undefined,
      versionId: scooterVersionId ?? undefined,
      variantId: scooterVariantId ?? undefined,
    })) {
      invalid(`${path}.scooter_version_id`, 'must reference one complete scooter from the installed catalog');
    }
    requireDateTime(
      requireString(profile, 'last_odometer_update_timestamp', path, { nullable: true }),
      `${path}.last_odometer_update_timestamp`,
      true
    );
  });

  const activeVehicleId = value.active_vehicle_id;
  if (!Number.isSafeInteger(activeVehicleId) || !vehicleIds.has(activeVehicleId as number)) {
    invalid('data.active_vehicle_id', 'must reference an existing vehicle');
  }

  const vitalIds = new Set<number>();
  const vitalVehicles = new Set<number>();
  rows(value, 'vehicle_vitals').forEach((vital, index) => {
    const path = `data.vehicle_vitals[${index}]`;
    requireUniqueId(requirePositiveId(vital, path), vitalIds, path);
    const vehicleId = requireVehicleReference(vital, path, vehicleIds);
    if (vitalVehicles.has(vehicleId)) invalid(`${path}.vehicle_id`, 'has more than one readings row');
    vitalVehicles.add(vehicleId);
    for (const key of [
      'oil_life_pct',
      'tire_pressure_psi',
      'battery_health_pct',
      'coolant_temp_c',
      'brake_pad_pct',
    ] as VehicleVitalField[]) {
      const numericValue = requireNumber(vital, key, path, { integer: true, min: 0 }) as number;
      const message = validateVehicleVital(key, numericValue);
      if (message) invalid(`${path}.${key}`, message);
    }
    requireDateTime(requireString(vital, 'updated_at', path, { nonEmpty: true }), `${path}.updated_at`);
  });

  const intervalIds = new Set<number>();
  const intervalKeys = new Set<string>();
  rows(value, 'service_intervals').forEach((interval, index) => {
    const path = `data.service_intervals[${index}]`;
    requireUniqueId(requirePositiveId(interval, path), intervalIds, path);
    const vehicleId = requireVehicleReference(interval, path, vehicleIds);
    const name = requireString(interval, 'name', path, { nonEmpty: true }) as string;
    const intervalKey = `${vehicleId}\u0000${name}`;
    if (intervalKeys.has(intervalKey)) invalid(`${path}.name`, 'duplicates an interval for this vehicle');
    intervalKeys.add(intervalKey);
    const intervalKm = requireNumber(interval, 'interval_km', path, { integer: true, min: 1, nullable: true });
    if (interval.interval_km !== null && intervalKm === null) invalid(`${path}.interval_km`, 'is invalid');
    const baseline = requireNumber(interval, 'last_service_odometer_km', path, { integer: true, min: 0 }) as number;
    const known = requireBooleanFlag(interval, 'has_known_odometer_baseline', path);
    if (known === 0 && baseline !== 0) invalid(`${path}.last_service_odometer_km`, 'must be 0 when the baseline is unknown');
    if (known === 1) {
      const message = validateRecordedOdometer(baseline, vehicleOdometers.get(vehicleId) ?? -1);
      if (message) invalid(`${path}.last_service_odometer_km`, message);
    }
    requireString(interval, 'type', path, { nonEmpty: true });
  });

  const serviceLogIds = new Set<number>();
  const serviceLogsById = new Map<number, Record<string, unknown>>();
  rows(value, 'service_logs').forEach((log, index) => {
    const path = `data.service_logs[${index}]`;
    const logId = requirePositiveId(log, path);
    requireUniqueId(logId, serviceLogIds, path);
    serviceLogsById.set(logId, log);
    const vehicleId = requireVehicleReference(log, path, vehicleIds);
    requireString(log, 'title', path, { nonEmpty: true });
    const storedDate = requireString(log, 'date', path);
    const mileage = requireNumber(log, 'mileage', path, { integer: true, min: 0 }) as number;
    requireString(log, 'category', path, { nonEmpty: true });
    requireString(log, 'notes', path);
    requireNumber(log, 'cost', path, { min: 0, nullable: true });
    const serviceType = requireString(log, 'service_type', path, { nullable: true, nonEmpty: true });
    const setsBaseline = requireBooleanFlag(log, 'sets_odometer_baseline', path);
    const migrationStatus = log.maintenance_migration_status === undefined
      ? 'legacy_unmapped'
      : requireString(log, 'maintenance_migration_status', path, { nonEmpty: true });
    if (!['confirmed', 'legacy_unmapped', 'exact', 'legacy_needs_confirmation'].includes(migrationStatus as string)) {
      invalid(`${path}.maintenance_migration_status`, 'is not a supported migration status');
    }
    const mileageConfidence = log.maintenance_mileage_confidence === undefined
      ? migrationStatus === 'exact' && setsBaseline === 1 ? 'confirmed' : 'legacy_unmapped'
      : requireString(log, 'maintenance_mileage_confidence', path, { nonEmpty: true });
    const dateConfidence = log.maintenance_date_confidence === undefined
      ? migrationStatus === 'exact' ? 'confirmed' : 'legacy_unmapped'
      : requireString(log, 'maintenance_date_confidence', path, { nonEmpty: true });
    if (!MAINTENANCE_CONFIDENCES.has(mileageConfidence as string)) {
      invalid(`${path}.maintenance_mileage_confidence`, 'is not a supported confidence');
    }
    if (!MAINTENANCE_CONFIDENCES.has(dateConfidence as string)) {
      invalid(`${path}.maintenance_date_confidence`, 'is not a supported confidence');
    }
    if (dateConfidence === 'unknown') {
      if (storedDate !== '') invalid(`${path}.date`, 'must be empty when date confidence is unknown');
    } else {
      requireIsoDate(storedDate, `${path}.date`);
    }
    if (mileageConfidence === 'unknown' && mileage !== 0) {
      invalid(`${path}.mileage`, 'must be 0 when mileage confidence is unknown');
    }
    const recordSource = log.maintenance_record_source === undefined
      ? migrationStatus === 'exact' ? 'maintenance_planner' : 'legacy'
      : requireString(log, 'maintenance_record_source', path, { nonEmpty: true });
    if (!MAINTENANCE_RECORD_SOURCES.has(recordSource as string)) {
      invalid(`${path}.maintenance_record_source`, 'is not a supported source');
    }
    if (migrationStatus === 'exact') {
      for (const key of [
        'maintenance_rule_id',
        'maintenance_component_id',
        'maintenance_action',
        'maintenance_profile_id',
        'maintenance_profile_version',
      ]) requireString(log, key, path, { nonEmpty: true });
      if (log.inspection_result !== undefined) {
        requireString(log, 'inspection_result', path, { nullable: true, nonEmpty: true });
      }
    }
    if (migrationStatus === 'confirmed') {
      const componentId = requireString(log, 'maintenance_component_id', path, { nullable: true, nonEmpty: true });
      const action = requireString(log, 'maintenance_action', path, { nullable: true, nonEmpty: true });
      if ((componentId === null) !== (action === null)) {
        invalid(`${path}.maintenance_action`, 'must be present with component ID, or both must be null');
      }
      if (componentId === null) {
        for (const key of [
          'maintenance_rule_id',
          'maintenance_profile_id',
          'maintenance_profile_version',
        ]) {
          if (requireString(log, key, path, { nullable: true, nonEmpty: true }) !== null) {
            invalid(`${path}.${key}`, 'must be null for other work');
          }
        }
      }
    }
    if (
      setsBaseline === 0
      && mileage !== 0
      && mileageConfidence !== 'estimated'
      && mileageConfidence !== 'historical_unverified'
    ) {
      invalid(`${path}.mileage`, 'requires estimated or historical-unverified confidence without a baseline');
    }
    if (setsBaseline === 1 && mileageConfidence !== 'confirmed' && migrationStatus === 'confirmed') {
      invalid(`${path}.sets_odometer_baseline`, 'requires confirmed mileage confidence');
    }
    const mileageMessage = validateRecordedOdometer(mileage, vehicleOdometers.get(vehicleId) ?? -1);
    if (mileageMessage) invalid(`${path}.mileage`, mileageMessage);
    if (
      migrationStatus !== 'exact'
      && migrationStatus !== 'confirmed'
      && serviceType !== null
      && !intervalKeys.has(`${vehicleId}\u0000${serviceType}`)
    ) {
      invalid(`${path}.service_type`, 'does not match an interval for this vehicle');
    }
    for (const key of [
      'service_provider',
      'service_package_id',
      'service_package_title',
      'oil_brand',
      'oil_type',
      'oil_viscosity',
      'oil_notes',
    ]) {
      if (log[key] !== undefined) requireString(log, key, path, { nullable: true, nonEmpty: true });
    }
    if (log.duplicate_confirmed !== undefined) requireBooleanFlag(log, 'duplicate_confirmed', path);
    if (log.created_at !== undefined) {
      requireDateTime(requireString(log, 'created_at', path, { nonEmpty: true }), `${path}.created_at`);
    }
    if (log.updated_at !== undefined) {
      requireDateTime(requireString(log, 'updated_at', path, { nonEmpty: true }), `${path}.updated_at`);
    }
  });

  if (value.maintenance_preferences !== undefined) {
    if (!Array.isArray(value.maintenance_preferences)) {
      invalid('data.maintenance_preferences', 'must be an array when present');
    }
    const preferenceIds = new Set<number>();
    const preferenceKeys = new Set<string>();
    value.maintenance_preferences.forEach((preference, index) => {
      const path = `data.maintenance_preferences[${index}]`;
      if (!isObject(preference)) invalid(path, 'must be an object');
      requireUniqueId(requirePositiveId(preference, path), preferenceIds, path);
      const vehicleId = requireVehicleReference(preference, path, vehicleIds);
      const profileId = requireString(preference, 'profile_id', path, { nullable: true, nonEmpty: true });
      const componentId = requireString(preference, 'component_id', path, { nonEmpty: true }) as string;
      const action = requireString(preference, 'action', path, { nonEmpty: true }) as string;
      const key = `${vehicleId}\u0000${profileId ?? '<quarantine>'}\u0000${componentId}\u0000${action}`;
      if (preferenceKeys.has(key)) invalid(`${path}.action`, 'duplicates a component action preference');
      preferenceKeys.add(key);
      const recommended = requireNumber(
        preference,
        'profile_recommended_interval_km',
        path,
        { integer: true, min: 1, nullable: true }
      );
      const user = requireNumber(preference, 'user_interval_km', path, { integer: true, min: 1, nullable: true });
      const effective = requireNumber(
        preference,
        'effective_interval_km',
        path,
        { integer: true, min: 1, nullable: true }
      );
      const originalKm = requireNumber(preference, 'original_interval_km', path, { integer: true, min: 1, nullable: true });
      const originalMonths = requireNumber(preference, 'original_interval_months', path, { integer: true, min: 1, nullable: true });
      const customKm = requireNumber(preference, 'custom_interval_km', path, { integer: true, min: 1, nullable: true });
      const customMonths = requireNumber(preference, 'custom_interval_months', path, { integer: true, min: 1, nullable: true });
      const effectiveMonths = requireNumber(preference, 'effective_interval_months', path, { integer: true, min: 1, nullable: true });
      const distanceEnabled = requireBooleanFlag(preference, 'distance_enabled', path);
      const timeEnabled = requireBooleanFlag(preference, 'time_enabled', path);
      const conditionBasedDefault = requireBooleanFlag(preference, 'condition_based_default', path);
      const customConditionReminderEnabled = requireBooleanFlag(
        preference,
        'custom_condition_reminder_enabled',
        path
      );
      const source = requireString(preference, 'interval_source', path, { nonEmpty: true });
      if (!['profile_default', 'user_custom', 'workshop_recommendation'].includes(source as string)) {
        invalid(`${path}.interval_source`, 'is not supported');
      }
      const confirmedLonger = requireBooleanFlag(
        preference,
        'longer_than_recommended_confirmed',
        path
      );
      if (source === 'profile_default') {
        if (user !== null) invalid(`${path}.user_interval_km`, 'must be null for profile default');
        if (effective !== recommended) invalid(`${path}.effective_interval_km`, 'must equal the recommendation');
        if (confirmedLonger !== 0) {
          invalid(`${path}.longer_than_recommended_confirmed`, 'must be 0 for profile default');
        }
      } else {
        if (distanceEnabled === 1) {
          const expectedKm = customKm ?? originalKm;
          if (expectedKm === null || effective !== expectedKm || user !== customKm) {
            invalid(`${path}.effective_interval_km`, 'must equal the enabled custom distance schedule');
          }
        } else if (effective !== null) {
          invalid(`${path}.effective_interval_km`, 'must be null when distance reminders are disabled');
        }
        if (timeEnabled === 1) {
          const expectedMonths = customMonths ?? originalMonths;
          if (expectedMonths === null || effectiveMonths !== expectedMonths) {
            invalid(`${path}.effective_interval_months`, 'must equal the enabled custom time schedule');
          }
        } else if (effectiveMonths !== null) {
          invalid(`${path}.effective_interval_months`, 'must be null when time reminders are disabled');
        }
        if (conditionBasedDefault === 1 && (distanceEnabled === 1 || timeEnabled === 1)
          && customConditionReminderEnabled !== 1) {
          invalid(`${path}.custom_condition_reminder_enabled`, 'must identify a user-created condition reminder');
        }
        const longer = originalKm !== null && customKm !== null && customKm > originalKm
          || originalMonths !== null && customMonths !== null && customMonths > originalMonths;
        if (longer && confirmedLonger !== 1) {
          invalid(`${path}.longer_than_recommended_confirmed`, 'must confirm a longer interval');
        }
      }
      requireString(preference, 'reason', path, { nullable: true });
      requireDateTime(
        requireString(preference, 'created_at', path, { nonEmpty: true }),
        `${path}.created_at`
      );
      requireDateTime(
        requireString(preference, 'updated_at', path, { nonEmpty: true }),
        `${path}.updated_at`
      );
    });
  }

  if (value.maintenance_history_states !== undefined) {
    if (!Array.isArray(value.maintenance_history_states)) {
      invalid('data.maintenance_history_states', 'must be an array when present');
    }
    const stateKeys = new Set<string>();
    value.maintenance_history_states.forEach((state, index) => {
      const path = `data.maintenance_history_states[${index}]`;
      if (!isObject(state)) invalid(path, 'must be an object');
      const vehicleId = requireVehicleReference(state, path, vehicleIds);
      const profileId = requireString(state, 'profile_id', path, { nullable: true, nonEmpty: true });
      const componentId = requireString(state, 'component_id', path, { nonEmpty: true }) as string;
      const action = requireString(state, 'action', path, { nonEmpty: true }) as string;
      const key = `${vehicleId}\u0000${profileId ?? '<quarantine>'}\u0000${componentId}\u0000${action}`;
      if (stateKeys.has(key)) invalid(`${path}.action`, 'duplicates a component action history state');
      stateKeys.add(key);
      const historyState = requireString(state, 'history_state', path, { nonEmpty: true });
      if (!MAINTENANCE_HISTORY_STATES.has(historyState as string)) {
        invalid(`${path}.history_state`, 'is not supported');
      }
      const lastServiceLogId = requireNumber(
        state,
        'last_service_log_id',
        path,
        { integer: true, min: 1, nullable: true }
      );
      if (lastServiceLogId !== null) {
        const log = serviceLogsById.get(lastServiceLogId);
        if (
          !log
          || log.vehicle_id !== vehicleId
          || log.maintenance_profile_id !== profileId
          || log.maintenance_component_id !== componentId
          || log.maintenance_action !== action
        ) {
          invalid(`${path}.last_service_log_id`, 'must match this vehicle component action');
        }
      }
      requireString(state, 'notes', path, { nullable: true });
      requireDateTime(requireString(state, 'created_at', path, { nonEmpty: true }), `${path}.created_at`);
      requireDateTime(requireString(state, 'updated_at', path, { nonEmpty: true }), `${path}.updated_at`);
    });
  }

  if (value.odometer_events !== undefined) {
    if (!Array.isArray(value.odometer_events)) {
      invalid('data.odometer_events', 'must be an array when present');
    }
    const eventIds = new Set<number>();
    value.odometer_events.forEach((event, index) => {
      const path = `data.odometer_events[${index}]`;
      if (!isObject(event)) invalid(path, 'must be an object');
      requireUniqueId(requirePositiveId(event, path), eventIds, path);
      requireVehicleReference(event, path, vehicleIds);
      const eventType = requireString(event, 'event_type', path, { nonEmpty: true });
      if (!['confirmed_reading', 'correction', 'instrument_cluster_replacement'].includes(eventType as string)) {
        invalid(`${path}.event_type`, 'is not supported');
      }
      requireNumber(event, 'previous_effective_km', path, { integer: true, min: 0 });
      requireNumber(event, 'new_effective_km', path, { integer: true, min: 0 });
      requireNumber(event, 'previous_displayed_km', path, { integer: true, min: 0, nullable: true });
      requireNumber(event, 'new_displayed_km', path, { integer: true, min: 0, nullable: true });
      requireString(event, 'reason', path, { nonEmpty: true });
      requireDateTime(requireString(event, 'recorded_at', path, { nonEmpty: true }), `${path}.recorded_at`);
    });
  }

  const gasLogIds = new Set<number>();
  rows(value, 'gas_logs').forEach((log, index) => {
    const path = `data.gas_logs[${index}]`;
    requireUniqueId(requirePositiveId(log, path), gasLogIds, path);
    const vehicleId = requireVehicleReference(log, path, vehicleIds);
    requireNumber(log, 'liters', path, { min: Number.MIN_VALUE });
    requireNumber(log, 'cost', path, { min: 0 });
    const odometer = requireNumber(log, 'odometer_km', path, { integer: true, min: 0 }) as number;
    const odometerMessage = validateRecordedOdometer(odometer, vehicleOdometers.get(vehicleId) ?? -1);
    if (odometerMessage) invalid(`${path}.odometer_km`, odometerMessage);
    requireString(log, 'station', path, { nullable: true });
    requireDateTime(requireString(log, 'logged_at', path, { nonEmpty: true }), `${path}.logged_at`);
    requireIsoDate(requireString(log, 'logged_on', path, { nonEmpty: true }), `${path}.logged_on`);
    requireBooleanFlag(log, 'is_full_tank', path);
  });

  const inventoryIds = new Set<number>();
  rows(value, 'inventory_items').forEach((item, index) => {
    const path = `data.inventory_items[${index}]`;
    requireUniqueId(requirePositiveId(item, path), inventoryIds, path);
    requireVehicleReference(item, path, vehicleIds);
    requireString(item, 'name', path, { nonEmpty: true });
    requireString(item, 'category', path);
    const quantity = requireNumber(item, 'quantity', path, { integer: true, min: 0 }) as number;
    const quantityMessage = validateInventoryQuantity(quantity);
    if (quantityMessage) invalid(`${path}.quantity`, quantityMessage);
    const status = requireString(item, 'status', path, { nonEmpty: true });
    if (status !== getInventoryStatus(quantity)) invalid(`${path}.status`, 'does not match its quantity');
    requireDateTime(
      requireString(item, 'last_replaced_at', path, { nullable: true }),
      `${path}.last_replaced_at`,
      true
    );
  });

  const documentIds = new Set<number>();
  rows(value, 'documents_vault').forEach((document, index) => {
    const path = `data.documents_vault[${index}]`;
    requireUniqueId(requirePositiveId(document, path), documentIds, path);
    requireVehicleReference(document, path, vehicleIds);
    requireString(document, 'title', path, { nonEmpty: true });
    requireString(document, 'image_uri', path, { nonEmpty: true });
    requireIsoDate(
      requireString(document, 'expiry_date', path, { nullable: true }),
      `${path}.expiry_date`,
      true
    );
    requireDateTime(requireString(document, 'added_at', path, { nonEmpty: true }), `${path}.added_at`);
  });

  const preRideIds = new Set<number>();
  const preRideVehicles = new Set<number>();
  rows(value, 'pre_ride_checks').forEach((check, index) => {
    const path = `data.pre_ride_checks[${index}]`;
    requireUniqueId(requirePositiveId(check, path), preRideIds, path);
    const vehicleId = requireVehicleReference(check, path, vehicleIds);
    if (preRideVehicles.has(vehicleId)) invalid(`${path}.vehicle_id`, 'has more than one pre-ride row');
    preRideVehicles.add(vehicleId);
    for (const key of ['brakes_checked', 'tires_checked', 'lights_checked', 'oil_checked']) {
      requireBooleanFlag(check, key, path);
    }
    requireDateTime(
      requireString(check, 'last_run_at', path, { nullable: true }),
      `${path}.last_run_at`,
      true
    );
  });

  if (value.pre_ride_runs !== undefined) {
    if (!Array.isArray(value.pre_ride_runs)) invalid('data.pre_ride_runs', 'must be an array when present');
    const runIds = new Set<number>();
    value.pre_ride_runs.forEach((run, index) => {
      const path = `data.pre_ride_runs[${index}]`;
      if (!isObject(run)) invalid(path, 'must be an object');
      requireUniqueId(requirePositiveId(run, path), runIds, path);
      requireVehicleReference(run, path, vehicleIds);
      requireString(run, 'manual_id', path, { nonEmpty: true });
      requireString(run, 'variant_id', path, { nullable: true });
      requireDateTime(requireString(run, 'completed_at', path, { nonEmpty: true }), `${path}.completed_at`);
      const encodedItems = requireString(run, 'items_json', path, { nonEmpty: true }) as string;
      try {
        if (!Array.isArray(JSON.parse(encodedItems))) invalid(`${path}.items_json`, 'must encode an array');
      } catch {
        invalid(`${path}.items_json`, 'must contain valid JSON');
      }
      const completed = requireNumber(run, 'completed_count', path, { integer: true, min: 0 }) as number;
      const total = requireNumber(run, 'total_count', path, { integer: true, min: 0 }) as number;
      if (completed > total) invalid(`${path}.completed_count`, 'cannot exceed total_count');
    });
  }
}

function validateEmbeddedDocumentFiles(
  value: unknown,
  data: DatabaseBackupData
): asserts value is EmbeddedDocumentFile[] {
  if (!Array.isArray(value)) invalid('document_files', 'must be an array');

  const expectedDocumentIds = new Set(data.documents_vault.map((document) => document.id));
  const fileDocumentIds = new Set<number>();
  let totalEncodedLength = 0;

  value.forEach((entry, index) => {
    const path = `document_files[${index}]`;
    if (!isObject(entry)) invalid(path, 'must be an object');
    const documentId = requireNumber(entry, 'document_id', path, { integer: true, min: 1 }) as number;
    if (!expectedDocumentIds.has(documentId)) invalid(`${path}.document_id`, 'does not match a document record');
    if (fileDocumentIds.has(documentId)) invalid(`${path}.document_id`, 'duplicates a document file');
    fileDocumentIds.add(documentId);

    const extension = requireString(entry, 'extension', path, { nonEmpty: true });
    if (!DOCUMENT_EXTENSIONS.has(extension as EmbeddedDocumentFile['extension'])) {
      invalid(`${path}.extension`, 'is not a supported image extension');
    }
    const mimeType = requireString(entry, 'mime_type', path, { nonEmpty: true }) as string;
    if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) invalid(`${path}.mime_type`, 'must be an image MIME type');
    const sha256 = requireString(entry, 'sha256', path, { nonEmpty: true }) as string;
    if (!/^[a-f0-9]{64}$/i.test(sha256)) invalid(`${path}.sha256`, 'must be a SHA-256 digest');

    const encoded = requireString(entry, 'data_base64', path, { nonEmpty: true }) as string;
    if (
      encoded.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    ) {
      invalid(`${path}.data_base64`, 'must contain valid base64 data');
    }
    if (encoded.length > MAX_DOCUMENT_FILE_BASE64_LENGTH) {
      invalid(`${path}.data_base64`, 'exceeds the per-photo backup limit');
    }
    totalEncodedLength += encoded.length;
  });

  if (totalEncodedLength > MAX_TOTAL_DOCUMENT_FILE_BASE64_LENGTH) {
    invalid('document_files', 'exceeds the total photo backup limit');
  }
  if (fileDocumentIds.size !== expectedDocumentIds.size) {
    const missingId = [...expectedDocumentIds].find((id) => !fileDocumentIds.has(id));
    invalid('document_files', `is missing photo data for document ${missingId ?? 'record'}`);
  }
}

function normalizeBooleanFlag(value: number | undefined, fallback: number): number {
  if (value === 0 || value === 1) return value;
  return fallback;
}

function normalizeMissingFuelFlag(value: number | undefined): number {
  return value === undefined ? 0 : value;
}

function deriveLegacyFuelDate(loggedAt: string): string {
  return loggedAt.slice(0, 10);
}

function normalizeRowsWithVehicleId<T extends { id: number }>(
  rows: unknown,
  vehicleId: number
): (T & { vehicle_id: number })[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isObject)
    .map((row) => ({ ...row, vehicle_id: Number(row.vehicle_id ?? vehicleId) })) as (T & { vehicle_id: number })[];
}

function normalizePriorBackupData(data: PriorDatabaseBackupData): DatabaseBackupData {
  const serviceLogs: ServiceLog[] = data.service_logs.map((log) => ({
    ...log,
    sets_odometer_baseline: normalizeBooleanFlag(
      log.sets_odometer_baseline,
      log.mileage > 0 ? 1 : 0
    ),
    maintenance_migration_status:
      log.maintenance_migration_status === 'exact' || log.maintenance_migration_status === 'confirmed'
        ? 'confirmed'
        : 'legacy_unmapped',
    maintenance_mileage_confidence: log.maintenance_mileage_confidence
      ?? (log.maintenance_migration_status === 'exact'
        && normalizeBooleanFlag(log.sets_odometer_baseline, log.mileage > 0 ? 1 : 0) === 1
        ? 'confirmed'
        : 'legacy_unmapped'),
    maintenance_date_confidence: log.maintenance_date_confidence
      ?? (log.maintenance_migration_status === 'exact' ? 'confirmed' : 'legacy_unmapped'),
    maintenance_record_source: log.maintenance_record_source
      ?? (log.maintenance_migration_status === 'exact' ? 'maintenance_planner' : 'legacy'),
    service_provider: log.service_provider ?? null,
    service_package_id: log.service_package_id ?? null,
    service_package_title: log.service_package_title ?? null,
    oil_brand: log.oil_brand ?? null,
    oil_type: log.oil_type ?? null,
    oil_viscosity: log.oil_viscosity ?? null,
    oil_notes: log.oil_notes ?? null,
    duplicate_confirmed: normalizeBooleanFlag(log.duplicate_confirmed, 0),
    created_at: log.created_at ?? `${log.date}T00:00:00.000Z`,
    updated_at: log.updated_at ?? log.created_at ?? `${log.date}T00:00:00.000Z`,
  }));

  const serviceIntervals: ServiceInterval[] = data.service_intervals.map((interval) => ({
    ...interval,
    has_known_odometer_baseline: normalizeBooleanFlag(
      interval.has_known_odometer_baseline,
      interval.last_service_odometer_km > 0 || serviceLogs.some(
        (log) => log.vehicle_id === interval.vehicle_id
          && log.service_type === interval.name
          && log.sets_odometer_baseline === 1
      ) ? 1 : 0
    ),
    canonical_task_id: interval.canonical_task_id ?? null,
    recommended_interval_km: interval.recommended_interval_km ?? interval.interval_km,
    recommended_interval_months: interval.recommended_interval_months ?? null,
    user_interval_km: interval.user_interval_km ?? null,
    user_override_active: interval.user_override_active ?? 0,
    recommendation_origin: interval.recommendation_origin ?? 'manual',
    source_manual_id: interval.source_manual_id ?? null,
    source_pages_json: interval.source_pages_json ?? null,
    manual_guidance_json: interval.manual_guidance_json ?? null,
    initial_milestones_json: interval.initial_milestones_json ?? null,
    severe_use_note: interval.severe_use_note ?? null,
    is_applicable: interval.is_applicable ?? 1,
    last_service_date: interval.last_service_date ?? null,
  }));

  const vehicleProfiles: VehicleProfile[] = data.vehicle_profiles.map((vehicle) => ({
    ...vehicle,
    service_history_setup_completed: normalizeBooleanFlag(
      vehicle.service_history_setup_completed,
      serviceLogs.some((log) => log.vehicle_id === vehicle.id) ? 1 : 0
    ),
    tank_capacity_liters: vehicle.tank_capacity_liters === undefined ? null : vehicle.tank_capacity_liters,
    scooter_brand_id: vehicle.scooter_brand_id ?? null,
    scooter_model_id: vehicle.scooter_model_id ?? null,
    scooter_version_id: vehicle.scooter_version_id ?? null,
    scooter_variant_id: vehicle.scooter_variant_id ?? null,
    maintenance_history_level: vehicle.maintenance_history_level ?? 'not_asked',
  }));

  const gasLogs: GasLog[] = data.gas_logs.map((log) => ({
    ...log,
    logged_on: log.logged_on === undefined ? deriveLegacyFuelDate(log.logged_at) : log.logged_on,
    is_full_tank: normalizeMissingFuelFlag(log.is_full_tank),
  }));

  return {
    ...data,
    vehicle_profiles: vehicleProfiles,
    service_intervals: serviceIntervals,
    service_logs: serviceLogs,
    gas_logs: gasLogs,
    maintenance_preferences: (data.maintenance_preferences ?? []).map((row) => ({
      ...row,
      profile_id: row.profile_id ?? null,
      original_interval_km: row.original_interval_km ?? row.profile_recommended_interval_km,
      original_interval_months: row.original_interval_months ?? null,
      custom_interval_km: row.custom_interval_km ?? row.user_interval_km,
      custom_interval_months: row.custom_interval_months ?? null,
      effective_interval_months: row.effective_interval_months ?? null,
      distance_enabled: row.distance_enabled
        ?? (row.effective_interval_km !== null ? 1 : 0),
      time_enabled: row.time_enabled
        ?? (row.effective_interval_months !== undefined && row.effective_interval_months !== null ? 1 : 0),
      condition_based_default: row.condition_based_default ?? 0,
      custom_condition_reminder_enabled: row.custom_condition_reminder_enabled ?? 0,
    })),
    maintenance_history_states: (data.maintenance_history_states ?? []).map((row) => ({
      ...row,
      profile_id: row.profile_id ?? null,
      last_service_log_id: row.profile_id ? row.last_service_log_id : null,
    })),
    odometer_events: data.odometer_events ?? [],
  };
}

export function normalizeBackupArchive(value: unknown): NormalizedBackupArchive {
  if (!isObject(value)) {
    throw new Error('Backup file is not valid JSON object data');
  }

  if (value.schema === '3azza-local-backup/v4' && isObject(value.data)) {
    requireBackupArrays(value.data);
    const data = normalizePriorBackupData(value.data as PriorDatabaseBackupData);
    validateDatabaseBackupData(data);
    validateEmbeddedDocumentFiles(value.document_files, data);
    return {
      source_schema: '3azza-local-backup/v4',
      data,
      document_files: value.document_files,
    };
  }

  if (value.schema === '3azza-local-backup/v3' && isObject(value.data)) {
    requireBackupArrays(value.data);
    const data = normalizePriorBackupData(value.data as PriorDatabaseBackupData);
    validateDatabaseBackupData(data);
    return { source_schema: '3azza-local-backup/v3', data, document_files: [] };
  }

  if (value.schema === '3azza-local-backup/v2' && isObject(value.data)) {
    requireBackupArrays(value.data);
    const data = value.data as PriorDatabaseBackupData;
    const normalized = normalizePriorBackupData(data);
    validateDatabaseBackupData(normalized);
    return { source_schema: '3azza-local-backup/v2', data: normalized, document_files: [] };
  }

  if (value.schema === '3azza-local-backup/v1') {
    const legacy = value as LegacyBackupSnapshot;
    if (legacy.vehicle_profile !== null && !isObject(legacy.vehicle_profile)) {
      invalid('vehicle_profile', 'must be an object or null');
    }
    if (legacy.vehicle_vitals !== null && !isObject(legacy.vehicle_vitals)) {
      invalid('vehicle_vitals', 'must be an object or null');
    }
    if (legacy.pre_ride_checks !== null && !isObject(legacy.pre_ride_checks)) {
      invalid('pre_ride_checks', 'must be an object or null');
    }
    for (const key of ['service_intervals', 'service_logs', 'gas_logs', 'inventory_items', 'documents_vault'] as const) {
      const legacyRows = legacy[key];
      if (!Array.isArray(legacyRows)) invalid(key, 'must be an array');
      legacyRows.forEach((row, index) => {
        if (!isObject(row)) invalid(`${key}[${index}]`, 'must be an object');
      });
    }
    const vehicle: PriorVehicleProfile = {
      id: legacy.vehicle_profile?.id ?? 1,
      name: legacy.vehicle_profile?.name ?? 'Primary Vehicle',
      current_mileage: legacy.vehicle_profile?.current_mileage ?? 0,
      total_km_range: legacy.vehicle_profile?.total_km_range ?? 0,
      has_completed_setup: legacy.vehicle_profile?.has_completed_setup ?? 1,
      created_at: legacy.vehicle_profile?.created_at ?? new Date().toISOString(),
      daily_average_km: legacy.vehicle_profile?.daily_average_km ?? 0,
      last_odometer_update_timestamp: legacy.vehicle_profile?.last_odometer_update_timestamp ?? null,
      service_history_setup_completed: legacy.vehicle_profile?.service_history_setup_completed,
    };
    const vehicleId = vehicle.id;

    const normalized = normalizePriorBackupData({
      active_vehicle_id: vehicleId,
      vehicle_profiles: [vehicle],
      vehicle_vitals: legacy.vehicle_vitals
        ? [{ ...legacy.vehicle_vitals, vehicle_id: legacy.vehicle_vitals.vehicle_id ?? vehicleId }]
        : [],
      service_intervals: normalizeRowsWithVehicleId<PriorServiceInterval>(legacy.service_intervals, vehicleId),
      service_logs: normalizeRowsWithVehicleId<PriorServiceLog>(legacy.service_logs, vehicleId),
      gas_logs: normalizeRowsWithVehicleId<PriorGasLog>(legacy.gas_logs, vehicleId),
      inventory_items: normalizeRowsWithVehicleId<InventoryItem>(legacy.inventory_items, vehicleId),
      documents_vault: normalizeRowsWithVehicleId<DocumentItem>(legacy.documents_vault, vehicleId),
      pre_ride_checks: legacy.pre_ride_checks
        ? [{ ...legacy.pre_ride_checks, vehicle_id: legacy.pre_ride_checks.vehicle_id ?? vehicleId }]
        : [],
    });
    validateDatabaseBackupData(normalized);
    return { source_schema: '3azza-local-backup/v1', data: normalized, document_files: [] };
  }

  throw new Error('Unsupported backup schema');
}

export function normalizeBackupSnapshot(value: unknown): DatabaseBackupData {
  return normalizeBackupArchive(value).data;
}
