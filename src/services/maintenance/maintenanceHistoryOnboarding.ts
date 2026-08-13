import type { MaintenanceHistoryLevel } from '../../types/database.types';
import {
  createMaintenanceRecord,
  findDuplicateMaintenanceRecords,
  setMaintenanceHistoryLevel,
  setMaintenanceHistoryStates,
} from '../database';
import {
  MAINTENANCE_HISTORY_GENERAL_INSPECTION,
  planMaintenanceHistoryBaseline,
  type MaintenanceHistoryBaselineInput,
} from './maintenanceHistoryPlan';

export type { MaintenanceHistoryBaselineInput, MaintenanceHistoryBaselineKey } from './maintenanceHistoryPlan';

export type MaintenanceHistorySetupInput = {
  level: Exclude<MaintenanceHistoryLevel, 'not_asked'>;
  baselines: MaintenanceHistoryBaselineInput[];
  knownIssues: string;
};

/**
 * Saves only facts the owner supplied. Exact baselines become normal records;
 * unknown/never/not-applicable answers remain state and never create timeline rows.
 * The completion flag is written last so an interrupted setup remains resumable.
 */
export async function saveMaintenanceHistorySetup(input: MaintenanceHistorySetupInput): Promise<void> {
  const states: Parameters<typeof setMaintenanceHistoryStates>[0] = [];

  for (const baseline of input.baselines) {
    const plan = planMaintenanceHistoryBaseline(baseline);
    if (plan.record) {
      const action = plan.actions[0];
      const candidate = plan.record;
      const duplicates = await findDuplicateMaintenanceRecords(candidate);
      const recordId = duplicates[0]?.id
        ?? (await createMaintenanceRecord(candidate)).ids[0];
      if (!recordId) throw new Error('The historical maintenance record could not be linked.');
      states.push({
        componentId: action.componentId,
        action: action.action,
        state: 'confirmed',
        lastServiceLogId: recordId,
      });
      continue;
    }

    for (const action of plan.actions) {
      states.push({
        componentId: action.componentId,
        action: action.action,
        state: plan.historyState,
      });
    }
  }

  const issues = input.knownIssues.trim();
  const generalIndex = states.findIndex((state) =>
    state.componentId === MAINTENANCE_HISTORY_GENERAL_INSPECTION.componentId
    && state.action === MAINTENANCE_HISTORY_GENERAL_INSPECTION.action
  );
  if (issues) {
    if (generalIndex >= 0) states[generalIndex] = { ...states[generalIndex], notes: issues };
    else states.push({
      componentId: MAINTENANCE_HISTORY_GENERAL_INSPECTION.componentId,
      action: MAINTENANCE_HISTORY_GENERAL_INSPECTION.action,
      state: 'unknown',
      notes: issues,
    });
  }

  if (states.length > 0) await setMaintenanceHistoryStates(states);
  await setMaintenanceHistoryLevel(input.level);
}

export async function skipMaintenanceHistorySetup(): Promise<void> {
  await setMaintenanceHistoryLevel('skipped');
}
