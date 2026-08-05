import type { MaintenanceAction } from '../maintenance/types';
import type { MaintenanceHistoryStateValue } from '../types/database.types';
import type { CreateMaintenanceRecordInput } from './database';

export type MaintenanceHistoryBaselineKey =
  | 'engine_oil'
  | 'transmission_oil'
  | 'air_filter'
  | 'general_inspection';

export type MaintenanceHistoryBaselineInput = {
  key: MaintenanceHistoryBaselineKey;
  choice: 'exact' | 'unknown' | 'never_done' | 'not_applicable';
  mileageKm: number | null;
  serviceDate: string | null;
  airFilterAction?: 'clean' | 'replace';
};

export type MaintenanceHistoryBaselineAction = {
  componentId: string;
  action: MaintenanceAction;
  ruleId: string | null;
  title: string;
  category: string;
};

export type MaintenanceHistoryBaselinePlan = {
  actions: MaintenanceHistoryBaselineAction[];
  historyState: MaintenanceHistoryStateValue;
  record: CreateMaintenanceRecordInput | null;
};

const ENGINE_OIL: MaintenanceHistoryBaselineAction = {
  componentId: 'engine-oil',
  action: 'replace',
  ruleId: 'engine-oil.replace.recurring-1000km',
  title: 'Engine oil change',
  category: 'engine_and_lubrication',
};

const TRANSMISSION_OIL: MaintenanceHistoryBaselineAction = {
  componentId: 'transmission-oil',
  action: 'replace',
  ruleId: 'transmission-oil.replace.recurring-5000km-5mo',
  title: 'Gear-oil change',
  category: 'transmission_and_cvt',
};

const AIR_FILTER_INSPECT: MaintenanceHistoryBaselineAction = {
  componentId: 'air-cleaner-element',
  action: 'inspect',
  ruleId: 'air-cleaner-element.inspect.recurring-1000km-1mo',
  title: 'Air-filter inspection',
  category: 'fuel_and_intake',
};

const AIR_FILTER_CLEAN: MaintenanceHistoryBaselineAction = {
  componentId: 'air-cleaner-element',
  action: 'clean',
  ruleId: 'air-cleaner-element.clean.if-needed',
  title: 'Air-filter cleaning',
  category: 'fuel_and_intake',
};

const AIR_FILTER_REPLACE: MaintenanceHistoryBaselineAction = {
  componentId: 'air-cleaner-element',
  action: 'replace',
  ruleId: 'air-cleaner-element.replace.if-necessary',
  title: 'Air-filter replacement',
  category: 'fuel_and_intake',
};

export const MAINTENANCE_HISTORY_GENERAL_INSPECTION: MaintenanceHistoryBaselineAction = {
  componentId: 'general-workshop-inspection',
  action: 'inspect',
  ruleId: null,
  title: 'General workshop inspection',
  category: 'general_safety_inspections',
};

function exactActionFor(
  baseline: MaintenanceHistoryBaselineInput
): MaintenanceHistoryBaselineAction {
  if (baseline.key === 'engine_oil') return ENGINE_OIL;
  if (baseline.key === 'transmission_oil') return TRANSMISSION_OIL;
  if (baseline.key === 'general_inspection') return MAINTENANCE_HISTORY_GENERAL_INSPECTION;
  return baseline.airFilterAction === 'replace' ? AIR_FILTER_REPLACE : AIR_FILTER_CLEAN;
}

function actionsForState(
  baseline: MaintenanceHistoryBaselineInput
): MaintenanceHistoryBaselineAction[] {
  if (baseline.key === 'air_filter') return [AIR_FILTER_INSPECT, AIR_FILTER_CLEAN, AIR_FILTER_REPLACE];
  return [exactActionFor(baseline)];
}

function recordInput(
  baseline: MaintenanceHistoryBaselineInput,
  action: MaintenanceHistoryBaselineAction
): CreateMaintenanceRecordInput {
  return {
    serviceDate: baseline.serviceDate,
    mileageKm: baseline.mileageKm,
    dateConfidence: baseline.serviceDate === null ? 'unknown' : 'confirmed',
    mileageConfidence: baseline.mileageKm === null ? 'unknown' : 'confirmed',
    recordSource: 'history_onboarding',
    actions: [{
      ruleId: action.ruleId,
      componentId: action.componentId,
      action: action.action,
      title: action.title,
      category: action.category,
    }],
  };
}

/** Pure onboarding policy. Persistence consumes this exact plan. */
export function planMaintenanceHistoryBaseline(
  baseline: MaintenanceHistoryBaselineInput
): MaintenanceHistoryBaselinePlan {
  if (baseline.choice === 'exact' && (baseline.mileageKm === null || baseline.serviceDate === null)) {
    throw new Error('An exact maintenance-history baseline requires both mileage and date.');
  }
  const historyState: MaintenanceHistoryStateValue = baseline.choice === 'exact'
    ? 'confirmed'
    : baseline.choice;
  const actions = baseline.choice === 'exact'
    ? [exactActionFor(baseline)]
    : actionsForState(baseline);

  return {
    actions,
    historyState,
    record: baseline.choice === 'exact' ? recordInput(baseline, actions[0]) : null,
  };
}
