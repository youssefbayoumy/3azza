import type { MaintenanceAction } from '../maintenance/types';
import type {
  MaintenanceIntervalSource,
  MaintenancePreference,
} from '../types/database.types';
import type { MaintenanceRecordTransactionExecutor } from './maintenanceRecordTransactions';

export type SetMaintenancePreferenceInput = {
  componentId: string;
  action: MaintenanceAction;
  originalIntervalKm: number | null;
  originalIntervalMonths: number | null;
  customIntervalKm: number | null;
  customIntervalMonths: number | null;
  distanceEnabled: boolean;
  timeEnabled: boolean;
  conditionBasedDefault: boolean;
  customConditionReminderEnabled: boolean;
  source?: Exclude<MaintenanceIntervalSource, 'profile_default'>;
  confirmLonger?: boolean;
  reason?: string | null;
};

function validateOptionalPositiveWholeNumber(value: number | null, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(`${label} must be a positive whole number or unset.`);
  }
}

export function maintenancePreferenceIsLonger(input: SetMaintenancePreferenceInput): boolean {
  return Boolean(
    (input.distanceEnabled
      && input.originalIntervalKm !== null
      && input.customIntervalKm !== null
      && input.customIntervalKm > input.originalIntervalKm)
    || (input.timeEnabled
      && input.originalIntervalMonths !== null
      && input.customIntervalMonths !== null
      && input.customIntervalMonths > input.originalIntervalMonths)
  );
}

export function validateMaintenancePreferenceInput(input: SetMaintenancePreferenceInput): void {
  if (!input.componentId.trim() || !input.action) {
    throw new Error('Maintenance preference requires a component and action.');
  }
  validateOptionalPositiveWholeNumber(input.originalIntervalKm, 'Original distance interval');
  validateOptionalPositiveWholeNumber(input.originalIntervalMonths, 'Original time interval');
  validateOptionalPositiveWholeNumber(input.customIntervalKm, 'Custom distance interval');
  validateOptionalPositiveWholeNumber(input.customIntervalMonths, 'Custom time interval');

  const effectiveKm = input.customIntervalKm ?? input.originalIntervalKm;
  const effectiveMonths = input.customIntervalMonths ?? input.originalIntervalMonths;
  if (input.distanceEnabled && effectiveKm === null) {
    throw new Error('Enter a positive distance interval or turn off distance reminders.');
  }
  if (input.timeEnabled && effectiveMonths === null) {
    throw new Error('Enter a positive time interval or turn off time reminders.');
  }
  if (
    input.conditionBasedDefault
    && (input.distanceEnabled || input.timeEnabled)
    && !input.customConditionReminderEnabled
  ) {
    throw new Error('Enable the personal condition reminder before setting its interval.');
  }
  if (input.customConditionReminderEnabled && !input.distanceEnabled && !input.timeEnabled) {
    throw new Error('A personal condition reminder needs a distance or time interval.');
  }
  if (maintenancePreferenceIsLonger(input) && input.confirmLonger !== true) {
    throw new Error('Confirm the risk before using an interval longer than the original schedule.');
  }
}

export async function setMaintenancePreferenceInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  profileId: string,
  input: SetMaintenancePreferenceInput,
  timestamp: string
): Promise<MaintenancePreference> {
  validateMaintenancePreferenceInput(input);
  if (!profileId.trim()) throw new Error('A validated maintenance profile is required.');

  const source = input.source ?? 'user_custom';
  const effectiveIntervalKm = input.distanceEnabled
    ? input.customIntervalKm ?? input.originalIntervalKm
    : null;
  const effectiveIntervalMonths = input.timeEnabled
    ? input.customIntervalMonths ?? input.originalIntervalMonths
    : null;
  const longer = maintenancePreferenceIsLonger(input);

  await transaction.runAsync(
    `INSERT INTO maintenance_preferences (
       vehicle_id, profile_id, component_id, action,
       profile_recommended_interval_km, user_interval_km, effective_interval_km,
       original_interval_km, original_interval_months,
       custom_interval_km, custom_interval_months, effective_interval_months,
       distance_enabled, time_enabled, condition_based_default,
       custom_condition_reminder_enabled, interval_source,
       longer_than_recommended_confirmed, reason, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vehicle_id, profile_id, component_id, action) DO UPDATE SET
       profile_recommended_interval_km = excluded.profile_recommended_interval_km,
       user_interval_km = excluded.user_interval_km,
       effective_interval_km = excluded.effective_interval_km,
       original_interval_km = excluded.original_interval_km,
       original_interval_months = excluded.original_interval_months,
       custom_interval_km = excluded.custom_interval_km,
       custom_interval_months = excluded.custom_interval_months,
       effective_interval_months = excluded.effective_interval_months,
       distance_enabled = excluded.distance_enabled,
       time_enabled = excluded.time_enabled,
       condition_based_default = excluded.condition_based_default,
       custom_condition_reminder_enabled = excluded.custom_condition_reminder_enabled,
       interval_source = excluded.interval_source,
       longer_than_recommended_confirmed = excluded.longer_than_recommended_confirmed,
       reason = excluded.reason,
       updated_at = excluded.updated_at`,
    [
      vehicleId,
      profileId,
      input.componentId.trim(),
      input.action,
      input.originalIntervalKm,
      input.customIntervalKm,
      effectiveIntervalKm,
      input.originalIntervalKm,
      input.originalIntervalMonths,
      input.customIntervalKm,
      input.customIntervalMonths,
      effectiveIntervalMonths,
      input.distanceEnabled ? 1 : 0,
      input.timeEnabled ? 1 : 0,
      input.conditionBasedDefault ? 1 : 0,
      input.customConditionReminderEnabled ? 1 : 0,
      source,
      longer ? 1 : 0,
      input.reason?.trim() || null,
      timestamp,
      timestamp,
    ]
  );
  const row = await transaction.getFirstAsync<MaintenancePreference>(
    `SELECT * FROM maintenance_preferences
     WHERE vehicle_id = ? AND profile_id = ? AND component_id = ? AND action = ?`,
    [vehicleId, profileId, input.componentId.trim(), input.action]
  );
  if (!row) throw new Error('Maintenance preference could not be saved.');
  return row;
}

export async function restoreMaintenancePreferenceInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  profileId: string,
  componentId: string,
  action: MaintenanceAction,
  _timestamp: string
): Promise<null> {
  const normalizedComponentId = componentId.trim();
  if (!profileId.trim() || !normalizedComponentId || !action) {
    throw new Error('Maintenance preference requires a component and action.');
  }
  await transaction.runAsync(
    `DELETE FROM maintenance_preferences
     WHERE vehicle_id = ? AND profile_id = ? AND component_id = ? AND action = ?`,
    [vehicleId, profileId, normalizedComponentId, action]
  );
  return null;
}
