import type { MaintenanceHistoryState, MaintenancePreference } from '../types/database.types';
import { historyStateKey } from './scheduler';
import type {
  MaintenanceAction,
  RuleHistoryKnowledge,
  VehicleMaintenancePreference,
} from './types';

export function maintenanceHistoryByAction(
  states: MaintenanceHistoryState[],
  allowKnownZeroBaseline = false
): Partial<Record<string, RuleHistoryKnowledge>> {
  return Object.fromEntries(states.map((state) => {
    const knowledge: RuleHistoryKnowledge = state.history_state === 'never_done' && allowKnownZeroBaseline
      ? 'known_no_prior_completion'
      : state.history_state === 'confirmed'
        ? 'known_from_events'
        : state.history_state === 'not_applicable'
          ? 'not_applicable'
          : 'unknown';
    return [historyStateKey(state.component_id, state.action as MaintenanceAction), knowledge];
  }));
}

export function maintenancePreferencesForScheduler(
  rows: MaintenancePreference[]
): VehicleMaintenancePreference[] {
  return rows.map((row) => ({
    vehicleId: row.vehicle_id,
    profileId: row.profile_id ?? undefined,
    componentId: row.component_id,
    action: row.action as MaintenanceAction,
    profileRecommendedIntervalKm: row.profile_recommended_interval_km,
    originalIntervalKm: row.original_interval_km ?? row.profile_recommended_interval_km,
    originalIntervalMonths: row.original_interval_months,
    userIntervalKm: row.user_interval_km,
    customIntervalKm: row.custom_interval_km ?? row.user_interval_km,
    customIntervalMonths: row.custom_interval_months,
    effectiveIntervalKm: row.effective_interval_km,
    effectiveIntervalMonths: row.effective_interval_months,
    distanceEnabled: row.distance_enabled === 1,
    timeEnabled: row.time_enabled === 1,
    conditionBasedDefault: row.condition_based_default === 1,
    customConditionReminderEnabled: row.custom_condition_reminder_enabled === 1,
    tracked: row.tracked == null ? null : row.tracked === 1,
    intervalSource: row.interval_source,
    changedAt: row.updated_at,
    longerThanRecommendedConfirmed: row.longer_than_recommended_confirmed === 1,
  }));
}
