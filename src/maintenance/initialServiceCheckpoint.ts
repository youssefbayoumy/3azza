import type { MaintenanceHistoryState } from '../types/database.types';
import type { MaintenanceAction, MaintenanceRule, ScooterMaintenanceProfile } from './types';

export type InitialServiceCheckpointStatus =
  | 'upcoming'
  | 'due'
  | 'overdue';

export type InitialServiceCheckpointAction = {
  ruleId: string;
  componentId: string;
  action: MaintenanceAction;
  category: MaintenanceRule['category'];
  label: string;
  requiresConditionResult: boolean;
};

export type InitialServiceCheckpoint = {
  profileId: string;
  profileVersion: string;
  milestoneKm: number;
  actionableUntilKm: number;
  remainingKm: number;
  status: InitialServiceCheckpointStatus;
  actions: InitialServiceCheckpointAction[];
};

export function maintenanceActionKey(componentId: string, action: MaintenanceAction): string {
  return `${componentId}\u0000${action}`;
}

function initialRules(profile: ScooterMaintenanceProfile): MaintenanceRule[] {
  const candidates = profile.rules.filter((rule) => (
    rule.applicable
    && rule.schedule.type === 'one_time_initial'
    && Number.isSafeInteger(rule.schedule.initialServiceKm)
  ));
  if (candidates.length === 0) return [];
  const firstMilestone = Math.min(...candidates.map((rule) => rule.schedule.initialServiceKm ?? Infinity));
  return candidates.filter((rule) => rule.schedule.initialServiceKm === firstMilestone);
}

export function getInitialServiceCheckpoint(input: {
  profile: ScooterMaintenanceProfile;
  currentOdometerKm: number;
  historyStates: MaintenanceHistoryState[];
}): InitialServiceCheckpoint | null {
  const { profile, currentOdometerKm } = input;
  const rules = initialRules(profile);
  if (rules.length === 0) return null;
  const milestoneKm = rules[0]?.schedule.initialServiceKm;
  if (milestoneKm === undefined) return null;
  const actionableUntilKm = profile.initialServicePolicy?.actionableUntilKm
    ?? Math.max(...rules.map((rule) => rule.schedule.initialActionableUntilKm ?? milestoneKm));
  if (currentOdometerKm > actionableUntilKm) return null;

  const relevantStates = new Map(input.historyStates
    .filter((state) => state.profile_id === profile.id)
    .map((state) => [maintenanceActionKey(state.component_id, state.action as MaintenanceAction), state]));
  const actions = rules.map((rule) => ({
    ruleId: rule.id,
    componentId: rule.componentId,
    action: rule.action,
    category: rule.category,
    label: rule.label,
    requiresConditionResult: Boolean(rule.conditionFollowUp),
  }));
  const states = actions.map((action) => relevantStates.get(maintenanceActionKey(action.componentId, action.action)));
  if (states.every((state) => state?.history_state === 'confirmed' || state?.history_state === 'estimated')) {
    return null;
  }

  const remainingKm = milestoneKm - currentOdometerKm;
  const status: InitialServiceCheckpointStatus = remainingKm < 0
    ? 'overdue'
    : remainingKm === 0
      ? 'due'
      : 'upcoming';

  return {
    profileId: profile.id,
    profileVersion: profile.profileVersion,
    milestoneKm,
    actionableUntilKm,
    remainingKm,
    status,
    actions,
  };
}
