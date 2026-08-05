import { compareMaintenanceTaskPriority, maintenancePriorityScore } from './scheduler';
import type {
  MaintenanceAction,
  MaintenanceTaskProjection,
  ScheduleType,
  TechnicianLevel,
} from './types';

export type MaintenancePresentationSectionKey =
  | 'scheduled-maintenance'
  | 'wear-and-condition'
  | 'general-checks';

export type MaintenancePresentationSection = {
  key: MaintenancePresentationSectionKey;
  label: string;
};

export type ProductionMaintenanceActionView = {
  key: string;
  label: string;
  section: MaintenancePresentationSection;
  recordLabel: string;
  statusLabel: string;
  tone: 'critical' | 'attention' | 'neutral' | 'positive';
  summary: string;
  lastPerformedAtKm: number | null;
  lastPerformedOn: string | null;
  nextDueAtKm: number | null;
  nextDueOn: string | null;
  remainingKm: number | null;
  remainingDays: number | null;
  activeIntervalKm: number | null;
  recommendedIntervalKm: number | null;
  technicianGuidance: string | null;
};

export type ProductionMaintenanceComponentView = {
  key: string;
  label: string;
  section: MaintenancePresentationSection;
  additionalSections: MaintenancePresentationSection[];
  actions: ProductionMaintenanceActionView[];
};

const SECTION_LABELS: Record<MaintenancePresentationSectionKey, string> = {
  'scheduled-maintenance': 'Scheduled maintenance',
  'wear-and-condition': 'Wear and condition',
  'general-checks': 'General checks',
};

const SCHEDULED_COMPONENTS = new Set([
  'engine-oil',
  'oil-filter-screen',
  'transmission-oil',
  'transmission',
  'air-cleaner-element',
  'air-cleaner-system',
  'spark-plug',
  'drive-belt-rollers',
  'clutch-disk',
  'fuel-pump-filter',
  'cooling-system',
  'coolant',
]);

const WEAR_COMPONENTS = new Set([
  'brake-pads',
  'brake-fluid',
  'tires',
  'battery',
  'bulbs',
  'hoses',
]);

const WORKSHOP_COMPONENTS = new Set([
  'carburetor-idle-speed',
  'crankcase',
  'fuel-lines',
  'throttle-cable',
  'engine-fasteners',
  'cylinder-assembly',
  'exhaust-system',
  'cam-chain-ignition-timing',
  'valve-clearance',
  'main-side-stands',
  'pcv-system',
]);

function section(key: MaintenancePresentationSectionKey): MaintenancePresentationSection {
  return { key, label: SECTION_LABELS[key] };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function maintenanceComponentGroup(componentId: string): {
  key: string;
  label: string;
  section: MaintenancePresentationSection;
} {
  const scheduled = section('scheduled-maintenance');
  const wear = section('wear-and-condition');
  const checks = section('general-checks');
  if (componentId === 'air-cleaner-element' || componentId === 'air-cleaner-system') {
    return { key: 'air-filter', label: 'Air filter', section: scheduled };
  }
  if (componentId === 'engine-oil' || componentId === 'oil-filter-screen') {
    return { key: 'engine-oil', label: 'Engine oil', section: scheduled };
  }
  if (componentId === 'transmission-oil' || componentId === 'transmission') {
    return { key: 'gear-oil', label: 'Gear oil', section: scheduled };
  }
  if (componentId === 'drive-belt-rollers' || componentId === 'clutch-disk') {
    return { key: 'cvt', label: 'CVT / drive belt', section: scheduled };
  }
  if (componentId === 'cooling-system' || componentId === 'coolant') {
    return { key: 'cooling-system', label: 'Cooling system', section: scheduled };
  }
  if (componentId === 'brake-pads' || componentId === 'brake-fluid') {
    return { key: 'brakes', label: 'Brakes', section: wear };
  }
  if (componentId === 'tires') return { key: 'tires', label: 'Tires', section: wear };
  if (componentId === 'battery') return { key: 'battery', label: 'Battery', section: wear };
  if (componentId === 'steering-bearing-handles') return { key: 'steering', label: 'Steering', section: checks };
  if (componentId === 'shock-absorbers' || componentId === 'suspension') {
    return { key: 'suspension', label: 'Suspension', section: checks };
  }
  if (componentId === 'engine-fasteners' || componentId === 'general-fasteners') {
    return { key: 'nuts-and-bolts', label: 'Nuts and bolts', section: checks };
  }
  if (componentId === 'main-side-stands') {
    return { key: 'main-side-stands', label: 'Main and side stands', section: checks };
  }
  if (WORKSHOP_COMPONENTS.has(componentId)) {
    return { key: 'general-workshop-inspection', label: 'General workshop inspection', section: checks };
  }
  const label = componentId.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
  const componentSection = SCHEDULED_COMPONENTS.has(componentId)
    ? scheduled
    : WEAR_COMPONENTS.has(componentId) ? wear : checks;
  return { key: componentId, label, section: componentSection };
}

function baseActionLabel(action: MaintenanceAction): string {
  const labels: Record<MaintenanceAction, string> = {
    inspect: 'Inspection',
    replace: 'Replacement',
    clean: 'Cleaning',
    adjust: 'Adjustment',
    lubricate: 'Lubrication',
    test: 'Test',
    tighten: 'Tightening',
    initial_service: 'Initial service',
    condition_check: 'Condition check',
  };
  return labels[action];
}

const COMPONENT_ACTION_NAMES: Record<string, string> = {
  battery: 'Battery',
  'brake-fluid': 'Brake fluid',
  'cam-chain-ignition-timing': 'Cam-chain and ignition-timing',
  'carburetor-idle-speed': 'Carburetor idle-speed',
  'clutch-disk': 'Clutch disk',
  'crankcase': 'Crankcase leakage',
  'cylinder-assembly': 'Cylinder head, cylinder, and piston',
  'drive-belt-rollers': 'Drive belt and roller',
  'exhaust-system': 'Exhaust system',
  'fuel-lines': 'Fuel tank switch and line',
  'fuel-pump-filter': 'Fuel-pump filter',
  'main-side-stands': 'Main and side stand',
  'pcv-system': 'Crankcase blow-by system',
  'spark-plug': 'Spark plug',
  'throttle-cable': 'Throttle operation and cable',
  tires: 'Tire and pressure',
  transmission: 'Transmission leakage',
  'valve-clearance': 'Valve-clearance',
};

type MaintenanceActionIdentity = Pick<MaintenanceTaskProjection, 'componentId' | 'action'>
  & Partial<Pick<MaintenanceTaskProjection, 'isOneTime'>>;

function exactComponentActionLabel(task: MaintenanceActionIdentity): string {
  const component = COMPONENT_ACTION_NAMES[task.componentId]
    ?? task.componentId.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
  return `${component} ${baseActionLabel(task.action).toLowerCase()}`;
}

export function naturalMaintenanceActionLabel(task: MaintenanceActionIdentity): string {
  const withInitial = (label: string) => task.isOneTime ? `Initial ${label.toLowerCase()}` : label;
  if (task.componentId === 'engine-oil' && task.action === 'replace') return withInitial('Engine-oil replacement');
  if (task.componentId === 'engine-oil' && task.action === 'condition_check') return withInitial('Oil-level check');
  if (task.componentId === 'engine-oil' && task.action === 'inspect') return withInitial('Engine-oil inspection');
  if (task.componentId === 'oil-filter-screen' && task.action === 'clean') return 'Oil filter screen cleaning';
  if (task.componentId === 'oil-filter-screen' && task.action === 'replace') return 'Oil filter screen replacement';
  if (task.componentId === 'transmission-oil' && task.action === 'replace') return withInitial('Gear-oil replacement');
  if (task.componentId === 'transmission' && task.action === 'inspect') return withInitial('Gearbox leakage check');
  if (task.componentId === 'brake-pads' && task.action === 'inspect') return withInitial('Brake inspection');
  if (task.componentId === 'brake-pads' && task.action === 'replace') return 'Brake-pad replacement';
  if (task.componentId === 'brake-fluid' && task.action === 'inspect') return 'Brake-fluid inspection';
  if (task.componentId === 'tires' && task.action === 'inspect') return withInitial('Tire inspection');
  if (task.componentId === 'tires' && task.action === 'replace') return 'Tire replacement';
  if (task.componentId === 'battery' && task.action === 'inspect') return withInitial('Battery inspection');
  if (task.componentId === 'battery' && task.action === 'clean') return 'Battery-terminal cleaning';
  if (task.componentId === 'battery' && task.action === 'replace') return 'Battery replacement';
  if (task.componentId === 'engine-fasteners' && task.action === 'inspect') return 'Engine fastener inspection';
  if (task.componentId === 'general-fasteners' && task.action === 'inspect') return 'General fastener inspection';
  if (task.componentId === 'shock-absorbers' && task.action === 'inspect') return 'Shock absorber inspection';
  if (task.componentId === 'steering-bearing-handles' && task.action === 'inspect') return 'Steering inspection';
  if (task.componentId === 'suspension' && task.action === 'inspect') return 'Suspension inspection';
  if (task.componentId === 'drive-belt-rollers' && task.action === 'inspect') return 'Drive-belt and roller inspection';
  if (task.componentId === 'drive-belt-rollers' && task.action === 'replace') return 'Drive-belt and roller replacement';
  if (task.componentId === 'clutch-disk' && task.action === 'inspect') return 'Clutch inspection';
  if (task.componentId === 'spark-plug' && task.action === 'inspect') return withInitial('Spark-plug inspection');
  if (task.componentId === 'spark-plug' && task.action === 'replace') return 'Spark-plug replacement';
  if (task.componentId === 'air-cleaner-element' || task.componentId === 'air-cleaner-system') {
    if (task.action === 'inspect') return withInitial('Air-filter inspection');
    if (task.action === 'clean') return 'Air-filter cleaning';
    if (task.action === 'replace') return 'Air-filter replacement';
  }
  return exactComponentActionLabel(task);
}

export function naturalRecordActionLabel(
  task: MaintenanceActionIdentity,
  historical = false
): string {
  const prefix = historical ? 'Record previous' : 'Record';
  return `${prefix} ${naturalMaintenanceActionLabel(task).toLowerCase()}`;
}

export function canCustomizeMaintenanceTask(
  task: Pick<MaintenanceTaskProjection, 'status'>
): boolean {
  return task.status !== 'historical_unverified';
}

export function maintenanceOverrideBadge(
  task: Pick<MaintenanceTaskProjection,
    'conditionBasedDefault' | 'customConditionReminderEnabled' | 'intervalSource' | 'reminderDisabled'>
): 'Custom' | 'Reminder disabled' | 'User-created reminder' | null {
  if (task.reminderDisabled) return 'Reminder disabled';
  if (task.intervalSource === 'profile_default') return null;
  if (task.conditionBasedDefault && task.customConditionReminderEnabled) return 'User-created reminder';
  return 'Custom';
}

export function maintenanceScheduleText(
  task: Pick<MaintenanceTaskProjection,
    'effectiveIntervalKm' | 'effectiveIntervalMonths' | 'reminderDisabled' | 'scheduleType'>
): string {
  if (task.reminderDisabled) return 'Reminder disabled';
  const parts: string[] = [];
  if (task.effectiveIntervalKm !== null) {
    parts.push(`Every ${task.effectiveIntervalKm.toLocaleString()} km`);
  }
  if (task.effectiveIntervalMonths !== null) {
    parts.push(`every ${task.effectiveIntervalMonths.toLocaleString()} ${task.effectiveIntervalMonths === 1 ? 'month' : 'months'}`);
  }
  if (parts.length > 0) return parts.join(', ');
  if (task.scheduleType === 'condition_based') return 'By condition';
  return 'No fixed interval';
}

function scheduleSignature(
  task: Pick<MaintenanceTaskProjection,
    'effectiveIntervalKm' | 'effectiveIntervalMonths' | 'reminderDisabled' | 'scheduleType'>
): string {
  return task.reminderDisabled
    ? 'disabled'
    : `${task.scheduleType}|${task.effectiveIntervalKm ?? '-'}|${task.effectiveIntervalMonths ?? '-'}`;
}

/** Prevents a component header from presenting one child's interval as a shared schedule. */
export function maintenanceGroupSummary(tasks: MaintenanceTaskProjection[]): string {
  const active = tasks.filter((task) =>
    task.status !== 'historical_unverified'
    && task.status !== 'not_applicable'
    && !task.reminderDisabled
  );
  if (active.length === 0) return tasks.some((task) => task.reminderDisabled)
    ? 'Reminders disabled'
    : 'No active reminders';

  const groupKey = maintenanceComponentGroup(active[0].componentId).key;
  if (groupKey === 'air-filter') {
    const inspection = active.find((task) => task.action === 'inspect' && !task.isOneTime);
    const interval = inspection?.effectiveIntervalKm;
    return interval !== null && interval !== undefined
      ? `Inspection every ${interval.toLocaleString()} km · replace when needed`
      : 'Inspect regularly · clean or replace when needed';
  }
  if (groupKey === 'brakes') return 'Inspect regularly · replace pads by condition';
  if (groupKey === 'tires') return 'Inspect pressure, tread, and damage · replace when needed';
  if (groupKey === 'battery') return 'Inspect and test regularly · replace when needed';
  if (groupKey === 'engine-oil') {
    const replacement = active.find((task) => task.componentId === 'engine-oil'
      && task.action === 'replace' && !task.isOneTime);
    if (replacement) return maintenanceScheduleText(replacement).replace(/^Every/, 'Change every');
  }
  if (groupKey === 'gear-oil') {
    const replacement = active.find((task) => task.componentId === 'transmission-oil'
      && task.action === 'replace' && !task.isOneTime);
    if (replacement) return maintenanceScheduleText(replacement).replace(/^Every/, 'Change every');
  }

  const signatures = new Set(active.map(scheduleSignature));
  if (signatures.size === 1) return maintenanceScheduleText(active[0]);

  const nearestDistance = [...active]
    .filter((task) => task.remainingKm !== null)
    .sort((left, right) => (left.remainingKm ?? Infinity) - (right.remainingKm ?? Infinity))[0];
  if (nearestDistance?.remainingKm !== null && nearestDistance?.remainingKm !== undefined) {
    if (nearestDistance.remainingKm < 0) {
      return `Multiple schedules · ${naturalMaintenanceActionLabel(nearestDistance)} overdue by ${Math.abs(nearestDistance.remainingKm).toLocaleString()} km`;
    }
    if (nearestDistance.remainingKm === 0) {
      return `Multiple schedules · ${naturalMaintenanceActionLabel(nearestDistance)} due now`;
    }
    return `Multiple schedules · next action due in ${nearestDistance.remainingKm.toLocaleString()} km`;
  }

  const nearestTime = [...active]
    .filter((task) => task.remainingDays !== null)
    .sort((left, right) => (left.remainingDays ?? Infinity) - (right.remainingDays ?? Infinity))[0];
  if (nearestTime?.remainingDays !== null && nearestTime?.remainingDays !== undefined) {
    if (nearestTime.remainingDays <= 0) return `Multiple schedules · ${naturalMaintenanceActionLabel(nearestTime)} due now`;
    return `Multiple schedules · next action due in ${nearestTime.remainingDays} days`;
  }
  return 'Multiple schedules';
}

export function maintenanceNearestActionSummary(tasks: MaintenanceTaskProjection[]): string | null {
  const nearest = [...tasks]
    .filter((task) => task.status !== 'historical_unverified' && task.status !== 'not_applicable')
    .sort(compareMaintenanceTaskPriority)[0];
  if (!nearest) return null;
  if (nearest.status === 'overdue') {
    return `${naturalMaintenanceActionLabel(nearest)} · ${Math.abs(nearest.remainingKm ?? 0).toLocaleString()} km overdue`;
  }
  if (nearest.status === 'due' || nearest.status === 'condition_attention') {
    return `${naturalMaintenanceActionLabel(nearest)} · ${nearest.status === 'due' ? 'due now' : statusLabel(nearest).toLowerCase()}`;
  }
  if (nearest.status === 'due_soon') return `${naturalMaintenanceActionLabel(nearest)} · due soon`;
  if (nearest.conditionResult === 'cleaning_needed') return `${naturalMaintenanceActionLabel(nearest)} · cleaning needed`;
  if (nearest.conditionResult === 'healthy') return `${naturalMaintenanceActionLabel(nearest)} · last condition healthy`;
  if (nearest.remainingKm !== null) return `${naturalMaintenanceActionLabel(nearest)} · due in ${nearest.remainingKm.toLocaleString()} km`;
  if (nearest.remainingDays !== null) return `${naturalMaintenanceActionLabel(nearest)} · due in ${nearest.remainingDays} days`;
  if (nearest.status === 'history_unknown_recommend_service') {
    return `${naturalMaintenanceActionLabel(nearest)} · last replacement unknown`;
  }
  if (nearest.status === 'history_unknown_request_record' || nearest.status === 'unknown') {
    return `${naturalMaintenanceActionLabel(nearest)} · last inspection unknown`;
  }
  return null;
}

export function maintenanceSectionForTask(
  task: Pick<MaintenanceTaskProjection, 'componentId'>
): MaintenancePresentationSection {
  return maintenanceComponentGroup(task.componentId).section;
}

function statusLabel(task: MaintenanceTaskProjection): string {
  const labels: Partial<Record<MaintenanceTaskProjection['status'], string>> = {
    upcoming: 'Upcoming',
    due_soon: 'Due soon',
    due: 'Due now',
    overdue: 'Overdue',
    condition_attention: task.conditionResult === 'replace_now' ? 'Replace now'
      : task.conditionResult === 'replace_soon' ? 'Replace soon'
        : task.conditionResult === 'service_soon' ? 'Service soon'
          : task.conditionResult === 'cleaning_needed' ? 'Cleaning needed'
          : task.conditionResult === 'monitor' ? 'Monitor' : 'Needs inspection',
    history_unknown_recommend_service: 'Last change unknown',
    history_unknown_request_record: 'Last check unknown',
    historical_unverified: 'Past initial milestone',
    no_fixed_interval: 'No fixed interval',
    completed_confirmed: 'Completed',
    not_applicable: 'Not applicable',
    unknown: 'History unknown',
    informational: 'Guidance',
  };
  return labels[task.status] ?? 'Maintenance';
}

function tone(task: MaintenanceTaskProjection): ProductionMaintenanceActionView['tone'] {
  if (task.status === 'overdue' || task.status === 'due'
    || (task.status === 'condition_attention' && task.conditionResult === 'replace_now')) return 'critical';
  if (['due_soon', 'condition_attention', 'history_unknown_recommend_service'].includes(task.status)) return 'attention';
  if (task.status === 'completed_confirmed') return 'positive';
  return 'neutral';
}

function safeSummary(task: MaintenanceTaskProjection): string {
  if (task.status === 'historical_unverified') {
    return 'This initial milestone is no longer a current task; no completion has been assumed.';
  }
  if (task.status === 'history_unknown_recommend_service') {
    return 'Enter previous maintenance or consider servicing it now.';
  }
  if (task.status === 'history_unknown_request_record') {
    return 'Add a previous record, or consider having it checked.';
  }
  if (task.status === 'no_fixed_interval') return 'Inspect and service according to condition.';
  if (task.status === 'condition_attention') return statusLabel(task);
  if (task.remainingKm !== null) {
    if (task.remainingKm < 0) return `${Math.abs(task.remainingKm).toLocaleString()} km overdue.`;
    if (task.remainingKm === 0) return 'Due at the current odometer.';
    return `${task.remainingKm.toLocaleString()} km remaining.`;
  }
  if (task.dueOn) return `Next due ${task.dueOn}.`;
  return statusLabel(task);
}

function technicianGuidance(level: TechnicianLevel): string | null {
  if (level === 'workshop_required') return 'Workshop service required';
  if (level === 'workshop_recommended') return 'Workshop inspection recommended';
  return null;
}

function actionView(task: MaintenanceTaskProjection, index: number): ProductionMaintenanceActionView {
  const label = naturalMaintenanceActionLabel(task);
  return {
    key: `${slug(label)}-${index + 1}`,
    label,
    section: maintenanceSectionForTask(task),
    recordLabel: naturalRecordActionLabel(task),
    statusLabel: statusLabel(task),
    tone: tone(task),
    summary: safeSummary(task),
    lastPerformedAtKm: task.lastPerformedAtKm,
    lastPerformedOn: task.lastPerformedOn,
    nextDueAtKm: task.dueAtKm,
    nextDueOn: task.dueOn,
    remainingKm: task.remainingKm,
    remainingDays: task.remainingDays,
    activeIntervalKm: task.effectiveIntervalKm,
    recommendedIntervalKm: task.profileRecommendedIntervalKm,
    technicianGuidance: technicianGuidance(task.technicianLevel),
  };
}

function primarySection(tasks: MaintenanceTaskProjection[]): MaintenancePresentationSection {
  return tasks[0]
    ? maintenanceSectionForTask(tasks[0])
    : section('general-checks');
}

/** Builds a production-safe model; audit evidence and internal rule identity never cross this boundary. */
export function buildMaintenancePresentation(
  tasks: MaintenanceTaskProjection[]
): ProductionMaintenanceComponentView[] {
  const groups = new Map<string, { label: string; tasks: MaintenanceTaskProjection[] }>();
  for (const task of tasks) {
    const component = maintenanceComponentGroup(task.componentId);
    const current = groups.get(component.key) ?? { label: component.label, tasks: [] };
    current.tasks.push(task);
    groups.set(component.key, current);
  }

  return [...groups.entries()].map(([key, group]) => {
    const sorted = [...group.tasks].sort(compareMaintenanceTaskPriority);
    const primary = primarySection(sorted);
    return {
      key,
      label: group.label,
      section: primary,
      additionalSections: [],
      actions: sorted.map(actionView),
    };
  }).sort((left, right) => {
    const leftPriority = Math.min(...groups.get(left.key)!.tasks.map(maintenancePriorityScore));
    const rightPriority = Math.min(...groups.get(right.key)!.tasks.map(maintenancePriorityScore));
    return leftPriority - rightPriority || left.label.localeCompare(right.label);
  });
}

export function isWorkshopChecklistComponent(componentId: string): boolean {
  return WORKSHOP_COMPONENTS.has(componentId);
}

export function isConditionOrWearSchedule(_scheduleType: ScheduleType, componentId: string): boolean {
  return maintenanceComponentGroup(componentId).section.key === 'wear-and-condition';
}
