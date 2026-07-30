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
> & {
  service_history_setup_completed?: number;
  tank_capacity_liters?: number | null;
  scooter_brand_id?: string | null;
  scooter_model_id?: string | null;
  scooter_version_id?: string | null;
};
type PriorServiceInterval = Omit<ServiceInterval, 'has_known_odometer_baseline'> & {
  has_known_odometer_baseline?: number;
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
    requireDateTime(requireString(profile, 'created_at', path, { nonEmpty: true }), `${path}.created_at`);
    requireNumber(profile, 'daily_average_km', path, { integer: true, min: 0 });
    requireNumber(profile, 'tank_capacity_liters', path, { min: Number.MIN_VALUE, nullable: true });
    const scooterBrandId = requireString(profile, 'scooter_brand_id', path, { nullable: true });
    const scooterModelId = requireString(profile, 'scooter_model_id', path, { nullable: true });
    const scooterVersionId = requireString(profile, 'scooter_version_id', path, { nullable: true });
    const hasAnyScooterField = scooterBrandId !== null || scooterModelId !== null || scooterVersionId !== null;
    if (hasAnyScooterField && !resolveScooterSelection({
      brandId: scooterBrandId ?? undefined,
      modelId: scooterModelId ?? undefined,
      versionId: scooterVersionId ?? undefined,
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
  rows(value, 'service_logs').forEach((log, index) => {
    const path = `data.service_logs[${index}]`;
    requireUniqueId(requirePositiveId(log, path), serviceLogIds, path);
    const vehicleId = requireVehicleReference(log, path, vehicleIds);
    requireString(log, 'title', path, { nonEmpty: true });
    requireIsoDate(requireString(log, 'date', path, { nonEmpty: true }), `${path}.date`);
    const mileage = requireNumber(log, 'mileage', path, { integer: true, min: 0 }) as number;
    requireString(log, 'category', path, { nonEmpty: true });
    requireString(log, 'notes', path);
    requireNumber(log, 'cost', path, { min: 0, nullable: true });
    const serviceType = requireString(log, 'service_type', path, { nullable: true, nonEmpty: true });
    const setsBaseline = requireBooleanFlag(log, 'sets_odometer_baseline', path);
    if (setsBaseline === 0 && mileage !== 0) invalid(`${path}.mileage`, 'must be 0 for date-only history');
    const mileageMessage = validateRecordedOdometer(mileage, vehicleOdometers.get(vehicleId) ?? -1);
    if (mileageMessage) invalid(`${path}.mileage`, mileageMessage);
    if (serviceType !== null && !intervalKeys.has(`${vehicleId}\u0000${serviceType}`)) {
      invalid(`${path}.service_type`, 'does not match an interval for this vehicle');
    }
  });

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
