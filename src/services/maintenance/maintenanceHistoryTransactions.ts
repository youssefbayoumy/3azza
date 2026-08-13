import type { MaintenanceAction } from '../../maintenance/types';
import type {
  MaintenanceHistoryLevel,
  MaintenanceHistoryState,
  MaintenanceHistoryStateValue,
} from '../../types/database.types';
import type { MaintenanceRecordTransactionExecutor } from './maintenanceRecordTransactions';

export type SetMaintenanceHistoryStateInput = {
  componentId: string;
  action: MaintenanceAction;
  state: MaintenanceHistoryStateValue;
  lastServiceLogId?: number | null;
  notes?: string | null;
};

const HISTORY_LEVELS = new Set<MaintenanceHistoryLevel>([
  'not_asked',
  'detailed_records',
  'recent_memory',
  'little_or_none',
  'skipped',
]);

const HISTORY_STATES = new Set<MaintenanceHistoryStateValue>([
  'confirmed',
  'estimated',
  'unknown',
  'never_done',
  'not_applicable',
  'historical_unverified',
  'legacy_unmapped',
]);

const ACTIONS = new Set<MaintenanceAction>([
  'inspect',
  'replace',
  'clean',
  'adjust',
  'lubricate',
  'test',
  'tighten',
  'initial_service',
  'condition_check',
]);

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export async function setMaintenanceHistoryLevelInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  level: MaintenanceHistoryLevel
): Promise<void> {
  if (!HISTORY_LEVELS.has(level)) throw new Error('Select a valid maintenance history level.');
  const completed = level === 'detailed_records'
    || level === 'recent_memory'
    || level === 'little_or_none';
  const result = await transaction.runAsync(
    `UPDATE vehicle_profile
     SET maintenance_history_level = ?, service_history_setup_completed = ?
     WHERE id = ?`,
    [level, completed ? 1 : 0, vehicleId]
  );
  if (result.changes !== 1) throw new Error('The active vehicle no longer exists.');
}

export async function setMaintenanceHistoryStateInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  profileId: string,
  input: SetMaintenanceHistoryStateInput,
  timestamp: string
): Promise<MaintenanceHistoryState> {
  const componentId = input.componentId.trim();
  if (!profileId.trim() || !componentId || !ACTIONS.has(input.action)) {
    throw new Error('Maintenance history state requires a valid component and action.');
  }
  if (!HISTORY_STATES.has(input.state)) throw new Error('Select a valid maintenance history state.');
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error('Maintenance history timestamp is invalid.');

  const lastServiceLogId = input.lastServiceLogId ?? null;
  if (lastServiceLogId !== null) {
    if (!Number.isSafeInteger(lastServiceLogId) || lastServiceLogId <= 0) {
      throw new Error('Last maintenance record ID must be a positive whole number or unset.');
    }
    const log = await transaction.getFirstAsync<{
      maintenance_component_id: string | null;
      maintenance_action: string | null;
      maintenance_profile_id: string | null;
    }>(
      `SELECT maintenance_component_id, maintenance_action, maintenance_profile_id FROM service_logs
       WHERE id = ? AND vehicle_id = ?`,
      [lastServiceLogId, vehicleId]
    );
    if (
      !log
      || log.maintenance_component_id !== componentId
      || log.maintenance_action !== input.action
      || log.maintenance_profile_id !== profileId
    ) {
      throw new Error('The selected maintenance record does not match this vehicle component action.');
    }
  }

  await transaction.runAsync(
    `INSERT INTO maintenance_history_states (
       vehicle_id, profile_id, component_id, action, history_state, last_service_log_id,
       notes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vehicle_id, profile_id, component_id, action) DO UPDATE SET
       history_state = excluded.history_state,
       last_service_log_id = excluded.last_service_log_id,
       notes = excluded.notes,
       updated_at = excluded.updated_at`,
    [
      vehicleId,
      profileId,
      componentId,
      input.action,
      input.state,
      lastServiceLogId,
      optionalText(input.notes),
      timestamp,
      timestamp,
    ]
  );
  const row = await transaction.getFirstAsync<MaintenanceHistoryState>(
    `SELECT * FROM maintenance_history_states
     WHERE vehicle_id = ? AND profile_id = ? AND component_id = ? AND action = ?`,
    [vehicleId, profileId, componentId, input.action]
  );
  if (!row) throw new Error('Maintenance history state could not be saved.');
  return row;
}
