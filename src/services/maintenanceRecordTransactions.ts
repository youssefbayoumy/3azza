import type { InspectionResult, MaintenanceAction } from '../maintenance/types';
import type {
  MaintenanceHistoryStateValue,
  MaintenanceRecordConfidence,
  MaintenanceRecordSource,
  ServiceLog,
} from '../types/database.types';
import { isPastOrTodayIsoDate, parseIsoDate } from '../utils/dates';
import { validateRecordedOdometer } from '../utils/recordValidation';

export type MaintenanceRecordSqlValue = string | number | null;

export type MaintenanceRecordTransactionExecutor = {
  getFirstAsync<T>(source: string, params: MaintenanceRecordSqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: MaintenanceRecordSqlValue[]): Promise<T[]>;
  runAsync(
    source: string,
    params: MaintenanceRecordSqlValue[]
  ): Promise<{ changes: number; lastInsertRowId: number }>;
};

export type PreparedMaintenanceRecordAction = {
  ruleId: string | null;
  componentId: string | null;
  action: MaintenanceAction | null;
  profileId: string | null;
  profileVersion: string | null;
  title: string;
  category: string;
  inspectionResult: InspectionResult | null;
};

export type PreparedMaintenanceRecordInput = {
  serviceDate: string | null;
  mileageKm: number | null;
  dateConfidence: Exclude<MaintenanceRecordConfidence, 'legacy_unmapped'>;
  mileageConfidence: Exclude<MaintenanceRecordConfidence, 'legacy_unmapped'>;
  notes: string;
  cost: number | null;
  serviceProvider: string | null;
  recordSource: Exclude<MaintenanceRecordSource, 'legacy'>;
  packageId: string | null;
  packageTitle: string | null;
  oilBrand: string | null;
  oilType: string | null;
  oilViscosity: string | null;
  oilNotes: string | null;
  actions: PreparedMaintenanceRecordAction[];
  allowDuplicate: boolean;
  timestamp: string;
};

export type MaintenanceRecordMutationResult = {
  ids: number[];
  packageId: string | null;
};

export class MaintenanceDuplicateError extends Error {
  readonly duplicates: ServiceLog[];

  constructor(duplicates: ServiceLog[]) {
    super('A matching maintenance record already exists. Confirm the duplicate to save another copy.');
    this.name = 'MaintenanceDuplicateError';
    this.duplicates = duplicates;
  }
}

const INSPECTION_RESULTS = new Set<InspectionResult>([
  'healthy',
  'cleaning_needed',
  'monitor',
  'service_soon',
  'replace_soon',
  'replace_now',
  'unable_to_inspect',
]);

function validateConfidenceValue(
  value: string | number | null,
  confidence: PreparedMaintenanceRecordInput['dateConfidence'],
  field: 'date' | 'mileage'
): void {
  if (confidence === 'unknown') {
    if (value !== null) throw new Error(`Unknown maintenance ${field} must not include a value.`);
    return;
  }
  if (value === null) throw new Error(`Maintenance ${field} is required for ${confidence} confidence.`);
}

export function validatePreparedMaintenanceRecord(
  input: PreparedMaintenanceRecordInput,
  currentMileage: number,
  now = new Date()
): void {
  if (!input.actions.length) throw new Error('A maintenance record requires an action or other-work entry.');
  if (input.serviceDate === null && input.mileageKm === null) {
    throw new Error('Enter a service date or mileage, or save an unknown history state instead.');
  }
  validateConfidenceValue(input.serviceDate, input.dateConfidence, 'date');
  validateConfidenceValue(input.mileageKm, input.mileageConfidence, 'mileage');

  if (input.serviceDate !== null) {
    if (parseIsoDate(input.serviceDate) === null) {
      throw new Error('Maintenance date must be a valid YYYY-MM-DD calendar date.');
    }
    if (!isPastOrTodayIsoDate(input.serviceDate, now)) {
      throw new Error('Maintenance date cannot be in the future.');
    }
  }

  if (input.mileageKm !== null) {
    if (!Number.isSafeInteger(input.mileageKm) || input.mileageKm < 0) {
      throw new Error('Maintenance mileage must be a non-negative whole number.');
    }
    const mileageMessage = validateRecordedOdometer(input.mileageKm, currentMileage);
    if (mileageMessage) throw new Error(mileageMessage);
  }
  if (input.cost !== null && (!Number.isFinite(input.cost) || input.cost < 0)) {
    throw new Error('Maintenance cost must be a non-negative number.');
  }
  if (!Number.isFinite(Date.parse(input.timestamp))) {
    throw new Error('Maintenance record timestamp is invalid.');
  }

  const actionKeys = new Set<string>();
  for (const action of input.actions) {
    if (!action.title.trim() || !action.category.trim()) {
      throw new Error('Maintenance records require a title and category.');
    }
    if ((action.componentId === null) !== (action.action === null)) {
      throw new Error('A maintenance record must include both component and action, or neither for other work.');
    }
    if (action.componentId !== null && !action.componentId.trim()) {
      throw new Error('Maintenance actions require a component.');
    }
    if (action.inspectionResult !== null && !INSPECTION_RESULTS.has(action.inspectionResult)) {
      throw new Error('Select a valid inspection result.');
    }
    const key = action.componentId === null
      ? `other\u0000${action.title.toLocaleLowerCase()}\u0000${action.category.toLocaleLowerCase()}`
      : `${action.componentId}\u0000${action.action}`;
    if (actionKeys.has(key)) throw new Error('A maintenance package cannot repeat the same component action.');
    actionKeys.add(key);
  }
}

function duplicatePredicate(input: PreparedMaintenanceRecordInput): {
  sql: string;
  params: MaintenanceRecordSqlValue[];
} {
  const clauses: string[] = [];
  const params: MaintenanceRecordSqlValue[] = [];
  if (input.serviceDate === null) {
    clauses.push("maintenance_date_confidence = 'unknown'");
  } else {
    clauses.push('date = ?', 'maintenance_date_confidence = ?');
    params.push(input.serviceDate, input.dateConfidence);
  }
  if (input.mileageKm === null) {
    clauses.push("maintenance_mileage_confidence = 'unknown'");
  } else {
    clauses.push('mileage = ?', 'maintenance_mileage_confidence = ?');
    params.push(input.mileageKm, input.mileageConfidence);
  }
  return { sql: clauses.join(' AND '), params };
}

export async function findDuplicateMaintenanceRecordsInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  input: PreparedMaintenanceRecordInput,
  exclusion: { id?: number | null; packageId?: string | null } = {}
): Promise<ServiceLog[]> {
  const identityClauses: string[] = [];
  const params: MaintenanceRecordSqlValue[] = [vehicleId];
  for (const action of input.actions) {
    if (action.componentId === null || action.action === null) {
      identityClauses.push(
        `(maintenance_profile_id IS NULL AND maintenance_component_id IS NULL
          AND maintenance_action IS NULL AND title = ? AND category = ?)`
      );
      params.push(action.title, action.category);
    } else {
      identityClauses.push(
        '(maintenance_profile_id = ? AND maintenance_component_id = ? AND maintenance_action = ?)'
      );
      params.push(action.profileId, action.componentId, action.action);
    }
  }
  const duplicate = duplicatePredicate(input);
  params.push(...duplicate.params);
  let excludeSql = '';
  if (exclusion.id !== null && exclusion.id !== undefined) {
    excludeSql = ' AND id != ?';
    params.push(exclusion.id);
  }
  if (exclusion.packageId) {
    excludeSql += ' AND (service_package_id IS NULL OR service_package_id != ?)';
    params.push(exclusion.packageId);
  }
  return transaction.getAllAsync<ServiceLog>(
    `SELECT * FROM service_logs
     WHERE vehicle_id = ?
       AND (${identityClauses.join(' OR ')})
       AND ${duplicate.sql}${excludeSql}
     ORDER BY date DESC, mileage DESC, created_at DESC, id DESC`,
    params
  );
}

function historyStateFor(input: PreparedMaintenanceRecordInput): MaintenanceHistoryStateValue {
  if (input.dateConfidence === 'confirmed' || input.mileageConfidence === 'confirmed') return 'confirmed';
  if (input.dateConfidence === 'estimated' || input.mileageConfidence === 'estimated') return 'estimated';
  if (
    input.dateConfidence === 'historical_unverified'
    || input.mileageConfidence === 'historical_unverified'
  ) return 'historical_unverified';
  return 'unknown';
}

async function upsertHistoryState(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  action: PreparedMaintenanceRecordAction,
  input: PreparedMaintenanceRecordInput,
  logId: number
): Promise<void> {
  if (action.profileId === null || action.componentId === null || action.action === null) return;
  await transaction.runAsync(
    `INSERT INTO maintenance_history_states (
       vehicle_id, profile_id, component_id, action, history_state, last_service_log_id,
       notes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(vehicle_id, profile_id, component_id, action) DO UPDATE SET
       history_state = excluded.history_state,
       last_service_log_id = excluded.last_service_log_id,
       updated_at = excluded.updated_at`,
    [
      vehicleId,
      action.profileId,
      action.componentId,
      action.action,
      historyStateFor(input),
      logId,
      input.timestamp,
      input.timestamp,
    ]
  );
}

function preparedActionKey(action: PreparedMaintenanceRecordAction): string {
  return action.componentId === null || action.action === null
    ? 'other-work'
    : `${action.profileId ?? ''}\u0000${action.componentId}\u0000${action.action}`;
}

function storedActionKey(row: ServiceLog): string {
  return row.maintenance_component_id === null || row.maintenance_component_id === undefined
    || row.maintenance_action === null || row.maintenance_action === undefined
    ? 'other-work'
    : `${row.maintenance_profile_id ?? ''}\u0000${row.maintenance_component_id}\u0000${row.maintenance_action}`;
}

async function insertPreparedAction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  input: PreparedMaintenanceRecordInput,
  action: PreparedMaintenanceRecordAction,
  duplicateConfirmed: boolean
): Promise<number> {
  const result = await transaction.runAsync(
    `INSERT INTO service_logs (
       vehicle_id, title, date, mileage, category, notes, cost, service_type,
       sets_odometer_baseline, maintenance_rule_id, maintenance_component_id,
       maintenance_action, maintenance_profile_id, maintenance_profile_version,
       inspection_result, maintenance_migration_status, maintenance_mileage_confidence,
       maintenance_date_confidence, maintenance_record_source, service_provider,
       service_package_id, service_package_title, oil_brand, oil_type, oil_viscosity,
       oil_notes, duplicate_confirmed, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vehicleId,
      action.title,
      input.serviceDate ?? '',
      input.mileageKm ?? 0,
      action.category,
      input.notes,
      input.cost,
      action.ruleId,
      input.mileageKm !== null && input.mileageConfidence === 'confirmed' ? 1 : 0,
      action.ruleId,
      action.componentId,
      action.action,
      action.profileId,
      action.profileVersion,
      action.inspectionResult,
      input.mileageConfidence,
      input.dateConfidence,
      input.recordSource,
      input.serviceProvider,
      input.packageId,
      input.packageTitle,
      input.oilBrand,
      input.oilType,
      input.oilViscosity,
      input.oilNotes,
      duplicateConfirmed ? 1 : 0,
      input.timestamp,
      input.timestamp,
    ]
  );
  return result.lastInsertRowId;
}

async function updatePreparedAction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  id: number,
  input: PreparedMaintenanceRecordInput,
  action: PreparedMaintenanceRecordAction,
  duplicateConfirmed: boolean
): Promise<boolean> {
  const result = await transaction.runAsync(
    `UPDATE service_logs SET
       title = ?, date = ?, mileage = ?, category = ?, notes = ?, cost = ?,
       sets_odometer_baseline = ?, inspection_result = ?, maintenance_migration_status = 'confirmed',
       maintenance_mileage_confidence = ?, maintenance_date_confidence = ?,
       maintenance_record_source = ?, service_provider = ?, service_package_id = ?,
       service_package_title = ?, oil_brand = ?, oil_type = ?, oil_viscosity = ?, oil_notes = ?,
       duplicate_confirmed = ?, updated_at = ?
     WHERE id = ? AND vehicle_id = ?`,
    [
      action.title,
      input.serviceDate ?? '',
      input.mileageKm ?? 0,
      action.category,
      input.notes,
      input.cost,
      input.mileageKm !== null && input.mileageConfidence === 'confirmed' ? 1 : 0,
      action.inspectionResult,
      input.mileageConfidence,
      input.dateConfidence,
      input.recordSource,
      input.serviceProvider,
      input.packageId,
      input.packageTitle,
      input.oilBrand,
      input.oilType,
      input.oilViscosity,
      input.oilNotes,
      duplicateConfirmed ? 1 : 0,
      input.timestamp,
      id,
      vehicleId,
    ]
  );
  return result.changes === 1;
}

function assertMaintenanceProfileProvenance(
  existingRows: ServiceLog[],
  input: PreparedMaintenanceRecordInput
): void {
  const storedProfiles = new Set<string | null>();
  for (const row of existingRows) {
    if (!row.maintenance_component_id || !row.maintenance_action) continue;
    storedProfiles.add(row.maintenance_profile_id ?? null);
  }

  const knownStoredProfiles = [...storedProfiles].filter(
    (profileId): profileId is string => profileId !== null
  );
  if (knownStoredProfiles.length === 0) return;
  if (storedProfiles.size !== 1 || knownStoredProfiles.length !== 1) {
    throw new Error('This maintenance package has mixed profile provenance and cannot be edited safely.');
  }

  const storedProfileId = knownStoredProfiles[0];
  if (input.actions.some((action) => action.profileId !== storedProfileId)) {
    throw new Error(
      'This record belongs to a previous scooter profile and cannot be reinterpreted under the current selection.'
    );
  }
}

export async function insertMaintenanceRecordInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  input: PreparedMaintenanceRecordInput,
  now = new Date()
): Promise<MaintenanceRecordMutationResult> {
  const vehicle = await transaction.getFirstAsync<{ current_mileage: number }>(
    'SELECT current_mileage FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  validatePreparedMaintenanceRecord(input, vehicle.current_mileage, now);

  const duplicates = await findDuplicateMaintenanceRecordsInTransaction(transaction, vehicleId, input);
  if (duplicates.length > 0 && !input.allowDuplicate) throw new MaintenanceDuplicateError(duplicates);

  const ids: number[] = [];
  for (const action of input.actions) {
    const id = await insertPreparedAction(
      transaction,
      vehicleId,
      input,
      action,
      input.allowDuplicate && duplicates.length > 0
    );
    ids.push(id);
    await upsertHistoryState(transaction, vehicleId, action, input, id);
  }

  return { ids, packageId: input.packageId };
}

export async function updateMaintenanceRecordInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  id: number,
  input: PreparedMaintenanceRecordInput,
  now = new Date()
): Promise<boolean> {
  const anchor = await transaction.getFirstAsync<ServiceLog>(
    'SELECT * FROM service_logs WHERE id = ? AND vehicle_id = ?',
    [id, vehicleId]
  );
  if (!anchor) return false;
  const vehicle = await transaction.getFirstAsync<{ current_mileage: number }>(
    'SELECT current_mileage FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('The active vehicle no longer exists.');
  validatePreparedMaintenanceRecord(input, vehicle.current_mileage, now);

  const existingRows = anchor.service_package_id
    ? await transaction.getAllAsync<ServiceLog>(
      `SELECT * FROM service_logs
       WHERE vehicle_id = ? AND service_package_id = ?
       ORDER BY id ASC`,
      [vehicleId, anchor.service_package_id]
    )
    : [anchor];
  assertMaintenanceProfileProvenance(existingRows, input);
  const duplicates = await findDuplicateMaintenanceRecordsInTransaction(
    transaction,
    vehicleId,
    input,
    anchor.service_package_id ? { packageId: anchor.service_package_id } : { id }
  );
  if (duplicates.length > 0 && !input.allowDuplicate) throw new MaintenanceDuplicateError(duplicates);

  const retainedIds = new Set<number>();
  const resultingRows: { action: PreparedMaintenanceRecordAction; id: number }[] = [];
  for (const action of input.actions) {
    const matching = existingRows.find(
      (row) => !retainedIds.has(row.id) && storedActionKey(row) === preparedActionKey(action)
    );
    if (matching) {
      const updated = await updatePreparedAction(
        transaction,
        vehicleId,
        matching.id,
        input,
        action,
        input.allowDuplicate && duplicates.length > 0
      );
      if (!updated) throw new Error('Maintenance package changed while it was being edited.');
      retainedIds.add(matching.id);
      resultingRows.push({ action, id: matching.id });
    } else {
      const insertedId = await insertPreparedAction(
        transaction,
        vehicleId,
        input,
        action,
        input.allowDuplicate && duplicates.length > 0
      );
      resultingRows.push({ action, id: insertedId });
    }
  }

  for (const row of existingRows) {
    if (retainedIds.has(row.id)) continue;
    await transaction.runAsync(
      'DELETE FROM service_logs WHERE id = ? AND vehicle_id = ?',
      [row.id, vehicleId]
    );
  }
  const affectedHistoryKeys = new Set<string>();
  for (const row of existingRows) {
    if (!row.maintenance_profile_id || !row.maintenance_component_id || !row.maintenance_action) continue;
    const key = `${row.maintenance_profile_id}\u0000${row.maintenance_component_id}\u0000${row.maintenance_action}`;
    if (affectedHistoryKeys.has(key)) continue;
    affectedHistoryKeys.add(key);
    await recomputeHistoryState(
      transaction,
      vehicleId,
      row.maintenance_profile_id,
      row.maintenance_component_id,
      row.maintenance_action,
      input.timestamp
    );
  }
  for (const row of resultingRows) {
    await upsertHistoryState(transaction, vehicleId, row.action, input, row.id);
  }
  return true;
}

async function recomputeHistoryState(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  profileId: string,
  componentId: string,
  action: string,
  timestamp: string
): Promise<void> {
  const latest = await transaction.getFirstAsync<ServiceLog>(
    `SELECT * FROM service_logs
     WHERE vehicle_id = ? AND maintenance_profile_id = ?
       AND maintenance_component_id = ? AND maintenance_action = ?
       AND maintenance_migration_status IN ('confirmed', 'exact')
     ORDER BY
       CASE WHEN maintenance_date_confidence = 'confirmed' THEN 0 ELSE 1 END,
       date DESC,
       CASE WHEN maintenance_mileage_confidence = 'confirmed' THEN 0 ELSE 1 END,
       mileage DESC,
       created_at DESC,
       id DESC
     LIMIT 1`,
    [vehicleId, profileId, componentId, action]
  );
  if (!latest) {
    await transaction.runAsync(
      `UPDATE maintenance_history_states
       SET history_state = 'unknown', last_service_log_id = NULL, updated_at = ?
       WHERE vehicle_id = ? AND profile_id = ? AND component_id = ? AND action = ?`,
      [timestamp, vehicleId, profileId, componentId, action]
    );
    return;
  }
  const state: MaintenanceHistoryStateValue =
    latest.maintenance_mileage_confidence === 'confirmed'
      || latest.maintenance_date_confidence === 'confirmed'
      ? 'confirmed'
      : latest.maintenance_mileage_confidence === 'estimated'
        || latest.maintenance_date_confidence === 'estimated'
        ? 'estimated'
        : latest.maintenance_mileage_confidence === 'historical_unverified'
          || latest.maintenance_date_confidence === 'historical_unverified'
          ? 'historical_unverified'
          : 'unknown';
  await transaction.runAsync(
    `UPDATE maintenance_history_states
     SET history_state = ?, last_service_log_id = ?, updated_at = ?
     WHERE vehicle_id = ? AND profile_id = ? AND component_id = ? AND action = ?`,
    [state, latest.id, timestamp, vehicleId, profileId, componentId, action]
  );
}

export async function deleteMaintenanceRecordInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  id: number,
  timestamp: string
): Promise<boolean> {
  const existing = await transaction.getFirstAsync<ServiceLog>(
    'SELECT * FROM service_logs WHERE id = ? AND vehicle_id = ?',
    [id, vehicleId]
  );
  if (!existing) return false;
  const rows = existing.service_package_id
    ? await transaction.getAllAsync<ServiceLog>(
      'SELECT * FROM service_logs WHERE vehicle_id = ? AND service_package_id = ? ORDER BY id ASC',
      [vehicleId, existing.service_package_id]
    )
    : [existing];
  const result = existing.service_package_id
    ? await transaction.runAsync(
      'DELETE FROM service_logs WHERE vehicle_id = ? AND service_package_id = ?',
      [vehicleId, existing.service_package_id]
    )
    : await transaction.runAsync(
      'DELETE FROM service_logs WHERE id = ? AND vehicle_id = ?',
      [id, vehicleId]
    );
  if (result.changes < 1) return false;
  const historyKeys = new Set<string>();
  for (const row of rows) {
    if (!row.maintenance_profile_id || !row.maintenance_component_id || !row.maintenance_action) continue;
    const key = `${row.maintenance_profile_id}\u0000${row.maintenance_component_id}\u0000${row.maintenance_action}`;
    if (historyKeys.has(key)) continue;
    historyKeys.add(key);
    await recomputeHistoryState(
      transaction,
      vehicleId,
      row.maintenance_profile_id,
      row.maintenance_component_id,
      row.maintenance_action,
      timestamp
    );
  }
  return true;
}
