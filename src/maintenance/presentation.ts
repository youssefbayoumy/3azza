import { compareMaintenanceTaskPriority, maintenancePriorityScore } from './scheduler';
import type {
  MaintenanceAction,
  MaintenanceTaskProjection,
  ScheduleType,
  TechnicianLevel,
} from './types';
import { formatNumber, t, type TranslationKey } from '../i18n/core';

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

const SECTION_LABELS: Record<MaintenancePresentationSectionKey, TranslationKey> = {
  'scheduled-maintenance': 'maintenance.section.scheduled',
  'wear-and-condition': 'maintenance.section.wear',
  'general-checks': 'maintenance.section.checks',
};

const COMPONENT_PRESENTATION = {
  'air-cleaner-element': { labelKey: 'maintenance.component.airCleanerElement', sectionKey: 'scheduled-maintenance' },
  'air-cleaner-system': { labelKey: 'maintenance.component.airCleanerSystem', sectionKey: 'scheduled-maintenance' },
  battery: { labelKey: 'maintenance.component.battery', sectionKey: 'wear-and-condition' },
  'brake-fluid': { labelKey: 'maintenance.component.brakeFluid', sectionKey: 'wear-and-condition' },
  'brake-pads': { labelKey: 'maintenance.component.brakePads', sectionKey: 'wear-and-condition' },
  'brake-system': { labelKey: 'maintenance.component.brakeSystem', sectionKey: 'wear-and-condition' },
  'cam-chain-ignition-timing': { labelKey: 'maintenance.component.camChainIgnitionTiming', sectionKey: 'general-checks' },
  'carburetor-idle-speed': { labelKey: 'maintenance.component.carburetorIdleSpeed', sectionKey: 'general-checks' },
  'clutch-disk': { labelKey: 'maintenance.component.clutchDisk', sectionKey: 'scheduled-maintenance' },
  'manual-clutch': { labelKey: 'maintenance.component.manualClutch', sectionKey: 'scheduled-maintenance' },
  'clutch-fluid': { labelKey: 'maintenance.component.clutchFluid', sectionKey: 'scheduled-maintenance' },
  coolant: { labelKey: 'maintenance.component.coolant', sectionKey: 'scheduled-maintenance' },
  'cooling-system': { labelKey: 'maintenance.component.coolingSystem', sectionKey: 'scheduled-maintenance' },
  crankcase: { labelKey: 'maintenance.component.crankcase', sectionKey: 'general-checks' },
  'cylinder-assembly': { labelKey: 'maintenance.component.cylinderAssembly', sectionKey: 'general-checks' },
  'drive-belt-rollers': { labelKey: 'maintenance.component.driveBeltRollers', sectionKey: 'scheduled-maintenance' },
  'drive-chain-sprockets': { labelKey: 'maintenance.component.driveChainSprockets', sectionKey: 'scheduled-maintenance' },
  'final-drive-belt': { labelKey: 'maintenance.component.finalDriveBelt', sectionKey: 'scheduled-maintenance' },
  'shaft-final-drive': { labelKey: 'maintenance.component.shaftFinalDrive', sectionKey: 'scheduled-maintenance' },
  'gear-shift-linkage': { labelKey: 'maintenance.component.gearShiftLinkage', sectionKey: 'general-checks' },
  'engine-fasteners': { labelKey: 'maintenance.component.engineFasteners', sectionKey: 'general-checks' },
  'engine-oil': { labelKey: 'maintenance.component.engineOil', sectionKey: 'scheduled-maintenance' },
  'two-stroke-oil-system': { labelKey: 'maintenance.component.twoStrokeOilSystem', sectionKey: 'scheduled-maintenance' },
  'reed-valve': { labelKey: 'maintenance.component.reedValve', sectionKey: 'general-checks' },
  'exhaust-system': { labelKey: 'maintenance.component.exhaustSystem', sectionKey: 'general-checks' },
  'fuel-lines': { labelKey: 'maintenance.component.fuelLines', sectionKey: 'general-checks' },
  'fuel-pump-filter': { labelKey: 'maintenance.component.fuelPumpFilter', sectionKey: 'scheduled-maintenance' },
  'fuel-filter': { labelKey: 'maintenance.component.fuelFilter', sectionKey: 'scheduled-maintenance' },
  'fuel-injector-throttle-body': { labelKey: 'maintenance.component.fuelInjectorThrottleBody', sectionKey: 'general-checks' },
  'general-fasteners': { labelKey: 'maintenance.component.generalFasteners', sectionKey: 'general-checks' },
  'main-side-stands': { labelKey: 'maintenance.component.mainSideStands', sectionKey: 'general-checks' },
  'oil-filter-screen': { labelKey: 'maintenance.component.oilFilterScreen', sectionKey: 'scheduled-maintenance' },
  'pcv-system': { labelKey: 'maintenance.component.pcvSystem', sectionKey: 'general-checks' },
  'shock-absorbers': { labelKey: 'maintenance.component.shockAbsorbers', sectionKey: 'general-checks' },
  'control-levers-cables': { labelKey: 'maintenance.component.controlLeversCables', sectionKey: 'wear-and-condition' },
  'front-fork-oil-seals': { labelKey: 'maintenance.component.frontForkOilSeals', sectionKey: 'wear-and-condition' },
  'swingarm-linkage-bearings': { labelKey: 'maintenance.component.swingarmLinkageBearings', sectionKey: 'wear-and-condition' },
  'spark-plug': { labelKey: 'maintenance.component.sparkPlug', sectionKey: 'scheduled-maintenance' },
  'steering-bearing-handles': { labelKey: 'maintenance.component.steeringBearingHandles', sectionKey: 'general-checks' },
  suspension: { labelKey: 'maintenance.component.suspension', sectionKey: 'general-checks' },
  'throttle-cable': { labelKey: 'maintenance.component.throttleCable', sectionKey: 'general-checks' },
  tires: { labelKey: 'maintenance.component.tires', sectionKey: 'wear-and-condition' },
  'wheel-bearings': { labelKey: 'maintenance.component.wheelBearings', sectionKey: 'wear-and-condition' },
  'spokes-rims': { labelKey: 'maintenance.component.spokesRims', sectionKey: 'wear-and-condition' },
  'inner-tubes-valves': { labelKey: 'maintenance.component.innerTubesValves', sectionKey: 'wear-and-condition' },
  'brake-discs': { labelKey: 'maintenance.component.brakeDiscs', sectionKey: 'wear-and-condition' },
  'drum-brakes': { labelKey: 'maintenance.component.drumBrakes', sectionKey: 'wear-and-condition' },
  'brake-lines-hoses': { labelKey: 'maintenance.component.brakeLinesHoses', sectionKey: 'wear-and-condition' },
  'abs-system': { labelKey: 'maintenance.component.absSystem', sectionKey: 'wear-and-condition' },
  'charging-system': { labelKey: 'maintenance.component.chargingSystem', sectionKey: 'general-checks' },
  'starter-system': { labelKey: 'maintenance.component.starterSystem', sectionKey: 'general-checks' },
  'regulator-rectifier': { labelKey: 'maintenance.component.regulatorRectifier', sectionKey: 'general-checks' },
  'fuses-horn-switches': { labelKey: 'maintenance.component.fusesHornSwitches', sectionKey: 'general-checks' },
  'traction-battery': { labelKey: 'maintenance.component.tractionBattery', sectionKey: 'wear-and-condition' },
  'electric-motor': { labelKey: 'maintenance.component.electricMotor', sectionKey: 'general-checks' },
  'motor-controller': { labelKey: 'maintenance.component.motorController', sectionKey: 'general-checks' },
  'electric-reduction-gear': { labelKey: 'maintenance.component.electricReductionGear', sectionKey: 'scheduled-maintenance' },
  'charging-port-cable': { labelKey: 'maintenance.component.chargingPortCable', sectionKey: 'wear-and-condition' },
  transmission: { labelKey: 'maintenance.component.transmission', sectionKey: 'scheduled-maintenance' },
  'transmission-oil': { labelKey: 'maintenance.component.transmissionOil', sectionKey: 'scheduled-maintenance' },
  'valve-clearance': { labelKey: 'maintenance.component.valveClearance', sectionKey: 'general-checks' },
  bulbs: { labelKey: 'maintenance.component.bulbs', sectionKey: 'wear-and-condition' },
  hoses: { labelKey: 'maintenance.component.hoses', sectionKey: 'wear-and-condition' },
  'general-workshop-inspection': { labelKey: 'maintenance.component.generalWorkshopInspection', sectionKey: 'general-checks' },
} as const satisfies Record<string, {
  labelKey: TranslationKey;
  sectionKey: MaintenancePresentationSectionKey;
}>;

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
  return { key, label: t(SECTION_LABELS[key]) };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function maintenanceComponentGroup(componentId: string): {
  key: string;
  label: string;
  section: MaintenancePresentationSection;
} {
  const definition = COMPONENT_PRESENTATION[componentId as keyof typeof COMPONENT_PRESENTATION];
  if (definition) {
    return { key: componentId, label: t(definition.labelKey), section: section(definition.sectionKey) };
  }
  // Unknown imported IDs remain identifiable instead of being silently renamed as generic maintenance.
  return { key: componentId, label: `[${componentId}]`, section: section('general-checks') };
}

export function maintenanceBaseActionLabel(action: MaintenanceAction): string {
  const labels: Record<MaintenanceAction, TranslationKey> = {
    inspect: 'maintenance.base.inspect',
    replace: 'maintenance.base.replace',
    clean: 'maintenance.base.clean',
    adjust: 'maintenance.base.adjust',
    lubricate: 'maintenance.base.lubricate',
    test: 'maintenance.base.test',
    tighten: 'maintenance.base.tighten',
    initial_service: 'maintenance.base.initial',
    condition_check: 'maintenance.base.condition',
  };
  return t(labels[action]);
}

type MaintenanceActionIdentity = Pick<MaintenanceTaskProjection, 'componentId' | 'action'>
  & Partial<Pick<MaintenanceTaskProjection, 'isOneTime'>>;

function exactComponentActionLabel(task: MaintenanceActionIdentity): string {
  const labels: Record<MaintenanceAction, TranslationKey> = {
    inspect: 'maintenance.action.inspectComponent',
    replace: 'maintenance.action.replaceComponent',
    clean: 'maintenance.action.cleanComponent',
    adjust: 'maintenance.action.adjustComponent',
    lubricate: 'maintenance.action.lubricateComponent',
    test: 'maintenance.action.testComponent',
    tighten: 'maintenance.action.tightenComponent',
    initial_service: 'maintenance.action.initialComponent',
    condition_check: 'maintenance.action.conditionComponent',
  };
  const label = t(labels[task.action], { component: maintenanceComponentGroup(task.componentId).label });
  return task.isOneTime && task.action !== 'initial_service'
    ? t('maintenance.initialLabel', { label: label.toLocaleLowerCase() })
    : label;
}

export function naturalMaintenanceActionLabel(task: MaintenanceActionIdentity): string {
  const withInitial = (key: TranslationKey) => {
    const label = t(key);
    return task.isOneTime ? t('maintenance.initialLabel', { label: label.toLocaleLowerCase() }) : label;
  };
  if (task.componentId === 'engine-oil' && task.action === 'replace') return withInitial('maintenance.exact.engineOilReplace');
  if (task.componentId === 'general-workshop-inspection' && task.action === 'inspect') {
    return t('logs.generalInspection');
  }
  if (task.componentId === 'engine-oil' && task.action === 'condition_check') return withInitial('maintenance.exact.oilLevel');
  if (task.componentId === 'engine-oil' && task.action === 'inspect') return withInitial('maintenance.exact.engineOilInspect');
  if (task.componentId === 'oil-filter-screen' && task.action === 'clean') return t('maintenance.exact.oilScreenClean');
  if (task.componentId === 'oil-filter-screen' && task.action === 'replace') return t('maintenance.exact.oilScreenReplace');
  if (task.componentId === 'transmission-oil' && task.action === 'replace') return withInitial('maintenance.exact.gearOilReplace');
  if (task.componentId === 'transmission' && task.action === 'inspect') return withInitial('maintenance.exact.gearboxLeak');
  if (task.componentId === 'brake-pads' && task.action === 'inspect') return withInitial('maintenance.exact.brakeInspect');
  if (task.componentId === 'brake-pads' && task.action === 'replace') return t('maintenance.exact.brakePadReplace');
  if (task.componentId === 'brake-fluid' && task.action === 'inspect') return t('maintenance.exact.brakeFluidInspect');
  if (task.componentId === 'tires' && task.action === 'inspect') return withInitial('maintenance.exact.tireInspect');
  if (task.componentId === 'tires' && task.action === 'replace') return t('maintenance.exact.tireReplace');
  if (task.componentId === 'battery' && task.action === 'inspect') return withInitial('maintenance.exact.batteryInspect');
  if (task.componentId === 'battery' && task.action === 'clean') return t('maintenance.exact.batteryClean');
  if (task.componentId === 'battery' && task.action === 'replace') return t('maintenance.exact.batteryReplace');
  if (task.componentId === 'engine-fasteners' && task.action === 'inspect') return t('maintenance.exact.engineFastener');
  if (task.componentId === 'general-fasteners' && task.action === 'inspect') return t('maintenance.exact.generalFastener');
  if (task.componentId === 'shock-absorbers' && task.action === 'inspect') return t('maintenance.exact.shock');
  if (task.componentId === 'steering-bearing-handles' && task.action === 'inspect') return t('maintenance.exact.steering');
  if (task.componentId === 'suspension' && task.action === 'inspect') return t('maintenance.exact.suspension');
  if (task.componentId === 'drive-belt-rollers' && task.action === 'inspect') return t('maintenance.exact.driveInspect');
  if (task.componentId === 'drive-belt-rollers' && task.action === 'replace') return t('maintenance.exact.driveReplace');
  if (task.componentId === 'clutch-disk' && task.action === 'inspect') return t('maintenance.exact.clutch');
  if (task.componentId === 'spark-plug' && task.action === 'inspect') return withInitial('maintenance.exact.sparkInspect');
  if (task.componentId === 'spark-plug' && task.action === 'replace') return t('maintenance.exact.sparkReplace');
  if (task.componentId === 'air-cleaner-element') {
    if (task.action === 'inspect') return withInitial('maintenance.exact.airInspect');
    if (task.action === 'clean') return t('maintenance.exact.airClean');
    if (task.action === 'replace') return t('maintenance.exact.airReplace');
  }
  return exactComponentActionLabel(task);
}

export function naturalRecordActionLabel(
  task: MaintenanceActionIdentity,
  historical = false
): string {
  return t(historical ? 'maintenance.recordPrevious' : 'maintenance.record', { label: naturalMaintenanceActionLabel(task).toLocaleLowerCase() });
}

export function canCustomizeMaintenanceTask(
  task: Pick<MaintenanceTaskProjection, 'status'>
): boolean {
  return task.status !== 'not_applicable';
}

export function maintenanceOverrideBadge(
  task: Pick<MaintenanceTaskProjection,
    'conditionBasedDefault' | 'customConditionReminderEnabled' | 'intervalSource' | 'reminderDisabled'>
): string | null {
  if (task.reminderDisabled) return t('maintenance.reminderDisabled');
  if (task.intervalSource === 'profile_default') return null;
  if (task.conditionBasedDefault && task.customConditionReminderEnabled) return t('maintenance.userReminder');
  return t('maintenance.custom');
}

export function maintenanceScheduleText(
  task: Pick<MaintenanceTaskProjection,
    'effectiveIntervalKm' | 'effectiveIntervalMonths' | 'reminderDisabled' | 'scheduleType'>
): string {
  if (task.reminderDisabled) return t('maintenance.reminderDisabled');
  const parts: string[] = [];
  if (task.effectiveIntervalKm !== null) {
    parts.push(t('maintenance.everyKm', { km: formatNumber(task.effectiveIntervalKm) }));
  }
  if (task.effectiveIntervalMonths !== null) {
    parts.push(t('maintenance.everyMonths', { count: formatNumber(task.effectiveIntervalMonths), unit: t(task.effectiveIntervalMonths === 1 ? 'maintenance.month' : 'maintenance.months') }));
  }
  if (parts.length > 0) return parts.join(', ');
  if (task.scheduleType === 'condition_based') return t('maintenance.byCondition');
  return t('maintenance.noFixedInterval');
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
    task.status !== 'not_applicable'
    && !task.reminderDisabled
  );
  if (active.length === 0) return t(tasks.some((task) => task.reminderDisabled)
    ? 'maintenance.remindersDisabled'
    : 'maintenance.noActiveReminders');

  const groupKey = maintenanceComponentGroup(active[0].componentId).key;
  if (groupKey === 'air-cleaner-element') {
    const inspection = active.find((task) => task.action === 'inspect' && !task.isOneTime);
    const interval = inspection?.effectiveIntervalKm;
    return interval !== null && interval !== undefined
      ? t('maintenance.airSummary', { km: formatNumber(interval) })
      : t('maintenance.airCondition');
  }
  if (groupKey === 'brake-pads') return t('maintenance.brakeSummary');
  if (groupKey === 'tires') return t('maintenance.tireSummary');
  if (groupKey === 'battery') return t('maintenance.batterySummary');
  if (groupKey === 'engine-oil') {
    const replacement = active.find((task) => task.componentId === 'engine-oil'
      && task.action === 'replace' && !task.isOneTime);
    if (replacement) return t('maintenance.changeSchedule', { schedule: maintenanceScheduleText(replacement) });
  }
  if (groupKey === 'transmission-oil') {
    const replacement = active.find((task) => task.componentId === 'transmission-oil'
      && task.action === 'replace' && !task.isOneTime);
    if (replacement) return t('maintenance.changeSchedule', { schedule: maintenanceScheduleText(replacement) });
  }

  const signatures = new Set(active.map(scheduleSignature));
  if (signatures.size === 1) return maintenanceScheduleText(active[0]);

  const nearestDistance = [...active]
    .filter((task) => task.remainingKm !== null)
    .sort((left, right) => (left.remainingKm ?? Infinity) - (right.remainingKm ?? Infinity))[0];
  if (nearestDistance?.remainingKm !== null && nearestDistance?.remainingKm !== undefined) {
    if (nearestDistance.remainingKm < 0) {
      return t('maintenance.multipleOverdue', { label: naturalMaintenanceActionLabel(nearestDistance), km: formatNumber(Math.abs(nearestDistance.remainingKm)) });
    }
    if (nearestDistance.remainingKm === 0) {
      return t('maintenance.multipleDue', { label: naturalMaintenanceActionLabel(nearestDistance) });
    }
    return t('maintenance.multipleNextKm', { km: formatNumber(nearestDistance.remainingKm) });
  }

  const nearestTime = [...active]
    .filter((task) => task.remainingDays !== null)
    .sort((left, right) => (left.remainingDays ?? Infinity) - (right.remainingDays ?? Infinity))[0];
  if (nearestTime?.remainingDays !== null && nearestTime?.remainingDays !== undefined) {
    if (nearestTime.remainingDays <= 0) return t('maintenance.multipleDue', { label: naturalMaintenanceActionLabel(nearestTime) });
    return t('maintenance.multipleNextDays', { days: formatNumber(nearestTime.remainingDays) });
  }
  return t('maintenance.multiple');
}

export function maintenanceNearestActionSummary(tasks: MaintenanceTaskProjection[]): string | null {
  const nearest = [...tasks]
    .filter((task) => task.status !== 'not_applicable')
    .sort(compareMaintenanceTaskPriority)[0];
  if (!nearest) return null;
  if (nearest.status === 'overdue') {
    return t('maintenance.nearestOverdue', { label: naturalMaintenanceActionLabel(nearest), km: formatNumber(Math.abs(nearest.remainingKm ?? 0)) });
  }
  if (nearest.status === 'due' || nearest.status === 'condition_attention') {
    return t('maintenance.nearestStatus', { label: naturalMaintenanceActionLabel(nearest), status: nearest.status === 'due' ? t('maintenance.dueNow') : statusLabel(nearest) });
  }
  if (nearest.status === 'due_soon') return t('maintenance.nearestStatus', { label: naturalMaintenanceActionLabel(nearest), status: t('maintenance.dueSoon') });
  if (nearest.conditionResult === 'cleaning_needed') return t('maintenance.nearestStatus', { label: naturalMaintenanceActionLabel(nearest), status: t('maintenance.statusCleaning') });
  if (nearest.conditionResult === 'healthy') return t('maintenance.nearestStatus', { label: naturalMaintenanceActionLabel(nearest), status: t('maintenance.conditionHealthy') });
  if (nearest.remainingKm !== null) return t('maintenance.nearestDueKm', { label: naturalMaintenanceActionLabel(nearest), km: formatNumber(nearest.remainingKm) });
  if (nearest.remainingDays !== null) return t('maintenance.nearestDueDays', { label: naturalMaintenanceActionLabel(nearest), days: formatNumber(nearest.remainingDays) });
  if (nearest.status === 'unknown_history') {
    const status = nearest.action === 'replace'
      ? t('maintenance.lastReplacementUnknown')
      : t('maintenance.lastInspectionUnknown');
    return t('maintenance.nearestStatus', { label: naturalMaintenanceActionLabel(nearest), status });
  }
  return null;
}

export function maintenanceSectionForTask(
  task: Pick<MaintenanceTaskProjection, 'componentId'>
): MaintenancePresentationSection {
  return maintenanceComponentGroup(task.componentId).section;
}

function statusLabel(task: MaintenanceTaskProjection): string {
  const labels: Partial<Record<MaintenanceTaskProjection['status'], TranslationKey>> = {
    ok: 'maintenance.upcoming', due_soon: 'maintenance.dueSoon', due: 'maintenance.dueNow', overdue: 'maintenance.overdue',
    condition_attention: task.conditionResult === 'replace_now' ? 'maintenance.statusReplaceNow'
      : task.conditionResult === 'replace_soon' ? 'maintenance.statusReplaceSoon'
        : task.conditionResult === 'service_soon' ? 'maintenance.statusServiceSoon'
          : task.conditionResult === 'cleaning_needed' ? 'maintenance.statusCleaning'
          : task.conditionResult === 'monitor' ? 'maintenance.statusMonitor' : 'maintenance.statusInspection',
    unknown_history: 'maintenance.statusHistory', no_fixed_interval: 'maintenance.noFixedInterval', not_applicable: 'maintenance.statusNotApplicable',
  };
  return t(labels[task.status] ?? 'maintenance.statusMaintenance');
}

function tone(task: MaintenanceTaskProjection): ProductionMaintenanceActionView['tone'] {
  if (task.status === 'overdue' || task.status === 'due'
    || (task.status === 'condition_attention' && task.conditionResult === 'replace_now')) return 'critical';
  if (['due_soon', 'condition_attention', 'unknown_history'].includes(task.status)) return 'attention';
  return 'neutral';
}

function safeSummary(task: MaintenanceTaskProjection): string {
  if (task.status === 'unknown_history') {
    return task.action === 'replace' ? t('maintenance.safeService') : t('maintenance.safeRecord');
  }
  if (task.status === 'no_fixed_interval') return t('maintenance.safeCondition');
  if (task.status === 'condition_attention') return statusLabel(task);
  if (task.remainingKm !== null) {
    if (task.remainingKm < 0) return `${t('maintenance.overdueKm', { km: formatNumber(Math.abs(task.remainingKm)) })}.`;
    if (task.remainingKm === 0) return t('maintenance.currentDue');
    return `${t('maintenance.kmRemaining', { km: formatNumber(task.remainingKm) })}.`;
  }
  if (task.dueOn) return t('maintenance.nextDueDate', { date: task.dueOn });
  return statusLabel(task);
}

function technicianGuidance(level: TechnicianLevel): string | null {
  if (level === 'workshop_required') return t('maintenance.workshopService');
  if (level === 'workshop_recommended') return t('maintenance.workshopInspection');
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
