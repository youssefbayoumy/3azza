import type {
  InspectionResult,
  IntervalSource,
  MaintenanceAction,
  MaintenanceEvent,
  MaintenanceProjectionInput,
  MaintenanceRule,
  MaintenanceTaskProjection,
  RuleHistoryKnowledge,
  TaskStatus,
  VehicleMaintenancePreference,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INITIAL_ACTIONABLE_UNTIL_KM = 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addMonths(value: Date, months: number): Date {
  const result = new Date(value);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function eventIdParts(id: string): { prefix: string; number: number | null } {
  const match = /^(.*?)(\d+)$/.exec(id);
  return match ? { prefix: match[1], number: Number(match[2]) } : { prefix: id, number: null };
}

function compareEventIdsDescending(left: MaintenanceEvent, right: MaintenanceEvent): number {
  const a = eventIdParts(left.id);
  const b = eventIdParts(right.id);
  if (a.prefix === b.prefix && a.number !== null && b.number !== null) return b.number - a.number;
  return right.id.localeCompare(left.id);
}

function validEventForProfile(event: MaintenanceEvent, input: MaintenanceProjectionInput): boolean {
  return event.profileId === input.profile.id
    && event.vehicleId > 0
    && (input.vehicleId === undefined || event.vehicleId === input.vehicleId)
    && event.migrationConfidence !== 'needs_user_confirmation';
}

function confidenceAllowsExactBaseline(value: MaintenanceEvent['mileageConfidence']): boolean {
  return value === undefined || value === 'confirmed';
}

function ruleEvents(rule: MaintenanceRule, input: MaintenanceProjectionInput): MaintenanceEvent[] {
  const acceptedRuleIds = new Set([rule.id, ...(rule.baselineRuleIds ?? [])]);
  return input.events.filter((event) =>
    validEventForProfile(event, input)
    && acceptedRuleIds.has(event.ruleId)
    && event.componentId === rule.componentId
    && event.action === rule.action
  );
}

function latestByDate(events: MaintenanceEvent[]): MaintenanceEvent | null {
  return [...events]
    .filter((event) => confidenceAllowsExactBaseline(event.dateConfidence) && parseDate(event.performedOn))
    .sort((left, right) =>
      right.performedOn.localeCompare(left.performedOn)
      || (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
      || compareEventIdsDescending(left, right)
    )[0] ?? null;
}

function latestByOdometer(events: MaintenanceEvent[]): MaintenanceEvent | null {
  return events
    .filter((event) => event.odometerKm !== null && confidenceAllowsExactBaseline(event.mileageConfidence))
    .sort((left, right) =>
      (right.odometerKm ?? -1) - (left.odometerKm ?? -1)
      || right.performedOn.localeCompare(left.performedOn)
      || compareEventIdsDescending(left, right)
    )[0] ?? null;
}

function knowledgeFor(rule: MaintenanceRule, input: MaintenanceProjectionInput): RuleHistoryKnowledge {
  return input.historyByRule?.[rule.id]
    ?? input.historyByAction?.[historyStateKey(rule.componentId, rule.action)]
    ?? input.defaultHistoryKnowledge
    ?? 'unknown';
}

export function historyStateKey(componentId: string, action: MaintenanceAction): string {
  return `${componentId}:${action}`;
}

function positiveWholeNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function preferenceMatches(
  preference: VehicleMaintenancePreference,
  rule: MaintenanceRule,
  input: MaintenanceProjectionInput
): boolean {
  const baseMatch = preference.componentId === rule.componentId
    && preference.action === rule.action
    && (input.vehicleId === undefined || preference.vehicleId === input.vehicleId)
    && (!preference.profileId || preference.profileId === input.profile.id);
  if (!baseMatch) return false;

  const sameActionRuleCount = input.profile.rules.filter((candidate) =>
    candidate.applicable
    && candidate.componentId === rule.componentId
    && candidate.action === rule.action
  ).length;
  if (sameActionRuleCount <= 1) return true;

  const original = originalScheduleForRule(rule);
  const storedOriginalKm = preference.originalIntervalKm
    ?? preference.profileRecommendedIntervalKm
    ?? null;
  const storedOriginalMonths = preference.originalIntervalMonths ?? null;
  const storedConditionDefault = preference.conditionBasedDefault ?? false;
  return storedOriginalKm === original.intervalKm
    && storedOriginalMonths === original.intervalMonths
    && storedConditionDefault === original.conditionBased;
}

export type EffectiveIntervalResolution = {
  profileRecommendedIntervalKm: number | null;
  originalIntervalMonths: number | null;
  effectiveIntervalKm: number | null;
  effectiveIntervalMonths: number | null;
  distanceEnabled: boolean;
  timeEnabled: boolean;
  conditionBasedDefault: boolean;
  customConditionReminderEnabled: boolean;
  reminderDisabled: boolean;
  intervalSource: IntervalSource;
  preference: VehicleMaintenancePreference | null;
};

export function originalScheduleForRule(rule: MaintenanceRule): {
  intervalKm: number | null;
  intervalMonths: number | null;
  conditionBased: boolean;
} {
  return {
    intervalKm: rule.profileRecommendedIntervalKm
      ?? rule.schedule.intervalKm
      ?? rule.schedule.initialServiceKm
      ?? null,
    intervalMonths: rule.schedule.intervalMonths
      ?? rule.schedule.initialServiceMonths
      ?? null,
    conditionBased: rule.schedule.type === 'condition_based',
  };
}

/** Resolves a vehicle preference without mutating the immutable shared profile rule. */
export function resolveEffectiveInterval(
  rule: MaintenanceRule,
  input: Pick<MaintenanceProjectionInput, 'profile' | 'preferences' | 'vehicleId'>
): EffectiveIntervalResolution {
  const original = originalScheduleForRule(rule);
  const profileRecommendedIntervalKm = original.intervalKm;
  const originalIntervalMonths = original.intervalMonths;
  const preference = [...(input.preferences ?? [])]
    .filter((candidate) => preferenceMatches(candidate, rule, input as MaintenanceProjectionInput))
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt))[0] ?? null;

  if (!preference || preference.intervalSource === 'profile_default') {
    return {
      profileRecommendedIntervalKm,
      originalIntervalMonths,
      effectiveIntervalKm: profileRecommendedIntervalKm,
      effectiveIntervalMonths: originalIntervalMonths,
      distanceEnabled: profileRecommendedIntervalKm !== null,
      timeEnabled: originalIntervalMonths !== null,
      conditionBasedDefault: original.conditionBased,
      customConditionReminderEnabled: false,
      reminderDisabled: false,
      intervalSource: 'profile_default',
      preference,
    };
  }

  const requestedKm = preference.customIntervalKm
    ?? preference.userIntervalKm
    ?? preference.effectiveIntervalKm
    ?? profileRecommendedIntervalKm;
  const requestedMonths = preference.customIntervalMonths
    ?? preference.effectiveIntervalMonths
    ?? originalIntervalMonths;
  const distanceEnabled = preference.distanceEnabled ?? requestedKm !== null;
  const timeEnabled = preference.timeEnabled ?? requestedMonths !== null;
  const conditionBasedDefault = preference.conditionBasedDefault ?? original.conditionBased;
  const customConditionReminderEnabled = preference.customConditionReminderEnabled ?? false;
  if (distanceEnabled && !positiveWholeNumber(requestedKm)) {
    throw new Error('An enabled custom distance reminder must be a positive whole number.');
  }
  if (timeEnabled && !positiveWholeNumber(requestedMonths)) {
    throw new Error('An enabled custom time reminder must be a positive whole number.');
  }
  if ((profileRecommendedIntervalKm !== null
    && distanceEnabled
    && requestedKm !== null
    && requestedKm > profileRecommendedIntervalKm
    || originalIntervalMonths !== null
    && timeEnabled
    && requestedMonths !== null
    && requestedMonths > originalIntervalMonths)
    && preference.intervalSource === 'user_custom'
    && !preference.longerThanRecommendedConfirmed) {
    throw new Error('A longer-than-original interval requires explicit confirmation.');
  }
  const reminderDisabled = !distanceEnabled
    && !timeEnabled
    && !(conditionBasedDefault && customConditionReminderEnabled);
  return {
    profileRecommendedIntervalKm,
    originalIntervalMonths,
    effectiveIntervalKm: distanceEnabled ? requestedKm : null,
    effectiveIntervalMonths: timeEnabled ? requestedMonths : null,
    distanceEnabled,
    timeEnabled,
    conditionBasedDefault,
    customConditionReminderEnabled,
    reminderDisabled,
    intervalSource: preference.intervalSource,
    preference,
  };
}

function projectionBase(
  rule: MaintenanceRule,
  interval: EffectiveIntervalResolution
): Pick<MaintenanceTaskProjection,
  | 'key'
  | 'ruleId'
  | 'componentId'
  | 'action'
  | 'label'
  | 'scheduleType'
  | 'source'
  | 'safetyCritical'
  | 'technicianRecommended'
  | 'userInspectable'
  | 'technicianLevel'
  | 'isOneTime'
  | 'instructions'
  | 'profileRecommendedIntervalKm'
  | 'originalIntervalMonths'
  | 'effectiveIntervalKm'
  | 'effectiveIntervalMonths'
  | 'distanceEnabled'
  | 'timeEnabled'
  | 'conditionBasedDefault'
  | 'customConditionReminderEnabled'
  | 'reminderDisabled'
  | 'intervalSource'> {
  return {
    key: rule.id,
    ruleId: rule.id,
    componentId: rule.componentId,
    action: rule.action,
    label: rule.label,
    scheduleType: rule.schedule.type,
    source: rule.source,
    safetyCritical: rule.safetyCritical,
    technicianRecommended: rule.technicianRecommended,
    userInspectable: rule.userInspectable,
    technicianLevel: rule.technicianLevel
      ?? (rule.userInspectable
        ? 'user_checkable'
        : rule.technicianRecommended ? 'workshop_recommended' : 'workshop_required'),
    isOneTime: rule.schedule.type === 'one_time_initial',
    instructions: rule.instructions,
    profileRecommendedIntervalKm: interval.profileRecommendedIntervalKm,
    originalIntervalMonths: interval.originalIntervalMonths,
    effectiveIntervalKm: interval.effectiveIntervalKm,
    effectiveIntervalMonths: interval.effectiveIntervalMonths,
    distanceEnabled: interval.distanceEnabled,
    timeEnabled: interval.timeEnabled,
    conditionBasedDefault: interval.conditionBasedDefault,
    customConditionReminderEnabled: interval.customConditionReminderEnabled,
    reminderDisabled: interval.reminderDisabled,
    intervalSource: interval.intervalSource,
  };
}

function actionNoun(action: MaintenanceAction): string {
  if (action === 'replace') return 'change';
  if (action === 'condition_check') return 'check';
  if (action === 'initial_service') return 'service';
  return action.replace('_', ' ');
}

function unknownProjection(
  rule: MaintenanceRule,
  interval: EffectiveIntervalResolution
): MaintenanceTaskProjection {
  const fixedChange = rule.action === 'replace'
    && !['condition_based', 'manual_only_or_no_fixed_interval', 'one_time_initial'].includes(rule.schedule.type);
  const status: TaskStatus = fixedChange
    ? 'history_unknown_recommend_service'
    : 'history_unknown_request_record';
  return {
    ...projectionBase(rule, interval),
    status,
    dueAtKm: null,
    dueOn: null,
    dueBy: 'unknown',
    lastPerformedAtKm: null,
    lastPerformedOn: null,
    remainingKm: null,
    remainingDays: null,
    title: fixedChange
      ? `${rule.label}: last change unknown.`
      : `${rule.label}: last ${actionNoun(rule.action)} unknown.`,
    reason: fixedChange
      ? 'Enter previous maintenance or consider servicing it now.'
      : 'Add a previous record, or consider having this checked.',
    ambiguity: rule.ambiguity,
  };
}

function historicalInitialProjection(
  rule: MaintenanceRule,
  interval: EffectiveIntervalResolution
): MaintenanceTaskProjection {
  return {
    ...projectionBase(rule, interval),
    status: 'historical_unverified',
    dueAtKm: rule.schedule.initialServiceKm ?? null,
    dueOn: null,
    dueBy: rule.schedule.initialServiceKm ? 'distance' : 'time',
    lastPerformedAtKm: null,
    lastPerformedOn: null,
    remainingKm: null,
    remainingDays: null,
    title: `${rule.label} is a past initial milestone.`,
    reason: 'The initial break-in milestone is no longer shown as current because this scooter was added after that stage.',
  };
}

function notApplicableProjection(
  rule: MaintenanceRule,
  interval: EffectiveIntervalResolution
): MaintenanceTaskProjection {
  return {
    ...projectionBase(rule, interval),
    status: 'not_applicable',
    dueAtKm: null,
    dueOn: null,
    dueBy: 'manual',
    lastPerformedAtKm: null,
    lastPerformedOn: null,
    remainingKm: null,
    remainingDays: null,
    title: `${rule.label} is marked not applicable.`,
    reason: 'This owner marked the action as not applicable to this vehicle.',
  };
}

function conditionTitle(result: InspectionResult, rule: MaintenanceRule): string {
  const component = rule.label.replace(/ replacement by condition$/i, '').toLowerCase();
  if (result === 'cleaning_needed') return `Clean the ${component}.`;
  if (result === 'monitor') return `Monitor the ${component}.`;
  if (result === 'service_soon') return `Service the ${component} soon.`;
  if (result === 'replace_soon') return `Replace the ${component} soon.`;
  if (result === 'replace_now') return `Replace the ${component} now.`;
  if (result === 'healthy') return `${rule.label}: last condition was healthy.`;
  return `The ${component} could not be inspected; arrange a workshop inspection.`;
}

function eventAtOrAfter(candidate: MaintenanceEvent, reference: MaintenanceEvent): boolean {
  if (candidate.performedOn !== reference.performedOn) return candidate.performedOn > reference.performedOn;
  if (candidate.createdAt && reference.createdAt && candidate.createdAt !== reference.createdAt) {
    return candidate.createdAt > reference.createdAt;
  }
  if (candidate.odometerKm !== null && reference.odometerKm !== null && candidate.odometerKm !== reference.odometerKm) {
    return candidate.odometerKm > reference.odometerKm;
  }
  return compareEventIdsDescending(candidate, reference) <= 0;
}

function noFixedIntervalProjection(
  rule: MaintenanceRule,
  interval: EffectiveIntervalResolution,
  latestRelevant: MaintenanceEvent | null = null
): MaintenanceTaskProjection {
  return {
    ...projectionBase(rule, interval),
    status: 'no_fixed_interval',
    dueAtKm: null,
    dueOn: null,
    dueBy: rule.schedule.type === 'condition_based' ? 'condition' : 'manual',
    lastPerformedAtKm: latestRelevant?.odometerKm ?? null,
    lastPerformedOn: latestRelevant?.performedOn ?? null,
    remainingKm: null,
    remainingDays: null,
    conditionResult: latestRelevant?.inspectionResult ?? undefined,
    title: latestRelevant?.inspectionResult
      ? conditionTitle(latestRelevant.inspectionResult, rule)
      : `${rule.label}.`,
    reason: rule.schedule.replacementCondition
      ?? 'There is no supported fixed countdown; follow inspection and condition guidance.',
  };
}

function disabledProjection(
  rule: MaintenanceRule,
  interval: EffectiveIntervalResolution
): MaintenanceTaskProjection {
  return {
    ...noFixedIntervalProjection(rule, interval),
    dueBy: 'manual',
    title: 'Reminder disabled by you',
    reason: 'The original schedule and maintenance history are preserved. Restore the original schedule at any time.',
  };
}

function projectConditionRule(
  rule: MaintenanceRule,
  input: MaintenanceProjectionInput,
  interval: EffectiveIntervalResolution
): MaintenanceTaskProjection {
  const sourceRules = input.profile.rules.filter((candidate) => candidate.conditionFollowUp?.ruleId === rule.id);
  const sourceRuleIds = new Set(sourceRules.map((candidate) => candidate.id));
  const findings = input.events.filter((event) =>
    validEventForProfile(event, input)
    && sourceRuleIds.has(event.ruleId)
    && event.componentId === rule.componentId
    && event.inspectionResult
  );
  const latestFinding = latestByDate(findings);
  if (!latestFinding?.inspectionResult || latestFinding.inspectionResult === 'healthy') {
    return noFixedIntervalProjection(rule, interval, latestFinding);
  }

  const sourceRule = sourceRules.find((candidate) => candidate.id === latestFinding.ruleId);
  const triggers = sourceRule?.conditionFollowUp?.triggerResults ?? [];
  if (!triggers.includes(latestFinding.inspectionResult) && latestFinding.inspectionResult !== 'service_soon') {
    return noFixedIntervalProjection(rule, interval, latestFinding);
  }

  const latestResolution = latestByDate(input.events.filter((event) =>
    validEventForProfile(event, input)
    && event.componentId === rule.componentId
    && event.action === rule.action
  ));
  if (latestResolution && eventAtOrAfter(latestResolution, latestFinding)) {
    return noFixedIntervalProjection(rule, interval, latestFinding);
  }

  return {
    ...projectionBase(rule, interval),
    key: `${rule.id}:${latestFinding.id}`,
    status: 'condition_attention',
    dueAtKm: null,
    dueOn: null,
    dueBy: 'condition',
    lastPerformedAtKm: latestFinding.odometerKm,
    lastPerformedOn: latestFinding.performedOn,
    remainingKm: null,
    remainingDays: null,
    conditionResult: latestFinding.inspectionResult,
    title: conditionTitle(latestFinding.inspectionResult, rule),
    reason: rule.schedule.replacementCondition ?? 'Follow the latest recorded condition.',
  };
}

function statusFromDue(input: {
  currentKm: number;
  dueAtKm: number | null;
  dueOnDate: Date | null;
  now: Date;
  intervalKm: number | null;
}): {
  status: TaskStatus;
  dueBy: MaintenanceTaskProjection['dueBy'];
  reason: string;
  remainingKm: number | null;
  remainingDays: number | null;
} {
  const distanceDue = input.dueAtKm !== null && input.currentKm >= input.dueAtKm;
  const timeDue = input.dueOnDate !== null && input.now >= input.dueOnDate;
  const distanceOverdue = input.dueAtKm !== null && input.currentKm > input.dueAtKm;
  const timeOverdue = input.dueOnDate !== null && input.now > input.dueOnDate;
  const dueOn = input.dueOnDate ? toIsoDate(input.dueOnDate) : null;
  const dueBy: MaintenanceTaskProjection['dueBy'] = input.dueAtKm !== null && dueOn !== null
    ? 'both'
    : input.dueAtKm !== null
      ? 'distance'
      : 'time';
  const remainingKm = input.dueAtKm === null ? null : input.dueAtKm - input.currentKm;
  const remainingDays = input.dueOnDate === null
    ? null
    : Math.ceil((input.dueOnDate.getTime() - input.now.getTime()) / DAY_MS);

  if (distanceDue || timeDue) {
    const status: TaskStatus = distanceOverdue || timeOverdue ? 'overdue' : 'due';
    if (distanceDue && timeDue) return { status, dueBy: 'both', reason: `Due by distance and time (${input.dueAtKm?.toLocaleString()} km / ${dueOn}).`, remainingKm, remainingDays };
    if (distanceDue) return { status, dueBy: 'distance', reason: `Due by distance at ${input.dueAtKm?.toLocaleString()} km.`, remainingKm, remainingDays };
    return { status, dueBy: 'time', reason: `Due by elapsed time on ${dueOn}.`, remainingKm, remainingDays };
  }

  const distanceWindow = input.dueAtKm !== null && input.intervalKm !== null
    ? Math.min(Math.max(Math.floor(input.intervalKm * 0.1), 1), 200)
    : null;
  const distanceSoon = input.dueAtKm !== null && distanceWindow !== null
    && input.currentKm >= input.dueAtKm - distanceWindow;
  const timeSoon = input.dueOnDate !== null
    && input.dueOnDate.getTime() - input.now.getTime() <= 30 * DAY_MS;
  const status: TaskStatus = distanceSoon || timeSoon ? 'due_soon' : 'upcoming';
  if (input.dueAtKm !== null && dueOn) return { status, dueBy, reason: `Whichever comes first: ${input.dueAtKm.toLocaleString()} km or ${dueOn}.`, remainingKm, remainingDays };
  if (input.dueAtKm !== null) return { status, dueBy, reason: `Next due at ${input.dueAtKm.toLocaleString()} km.`, remainingKm, remainingDays };
  return { status, dueBy, reason: `Next due on ${dueOn}.`, remainingKm, remainingDays };
}

function scheduledTitle(rule: MaintenanceRule, status: TaskStatus): string {
  if (status === 'overdue') return `${rule.label} is overdue.`;
  if (status === 'due') return `${rule.label} is due.`;
  if (status === 'due_soon') return `${rule.label} is due soon.`;
  return `${rule.label} is upcoming.`;
}

function projectScheduledRule(
  rule: MaintenanceRule,
  input: MaintenanceProjectionInput,
  interval: EffectiveIntervalResolution
): MaintenanceTaskProjection | null {
  const schedule = rule.schedule;
  const exactEvents = input.events.filter((event) =>
    validEventForProfile(event, input)
    && event.ruleId === rule.id
    && event.componentId === rule.componentId
    && event.action === rule.action
  );
  if (schedule.type === 'one_time_initial' && exactEvents.length > 0) return null;

  if (schedule.type === 'one_time_initial') {
    const profileActionableUntilKm = schedule.initialActionableUntilKm
      ?? input.profile.initialServicePolicy?.actionableUntilKm
      ?? DEFAULT_INITIAL_ACTIONABLE_UNTIL_KM;
    // A user preference must never resurrect a past break-in milestone as a
    // current task. One-time history remains bounded by the profile policy.
    if (input.currentOdometerKm > profileActionableUntilKm) {
      return historicalInitialProjection(rule, interval);
    }
  }

  // Recurring rules are intentionally independent from unknown initial history.
  // A confirmed compatible initial event may seed the recurrence, but its absence
  // must never hide current recurring work.
  const events = ruleEvents(rule, input);
  const history = knowledgeFor(rule, input);
  const kmEvent = latestByOdometer(events);
  const dateEvent = latestByDate(events);
  const latestCondition = latestByDate(exactEvents.filter((event) => event.inspectionResult));
  if (!kmEvent && !dateEvent && history !== 'known_no_prior_completion') {
    return unknownProjection(rule, interval);
  }

  const baseKm = kmEvent?.odometerKm ?? (history === 'known_no_prior_completion' ? 0 : null);
  const baseDate = parseDate(dateEvent?.performedOn ?? (
    history === 'known_no_prior_completion' ? input.vehicleInServiceDate : null
  ));
  const distanceAmount = interval.effectiveIntervalKm;
  const timeAmount = interval.effectiveIntervalMonths;
  const dueAtKm = distanceAmount !== undefined && distanceAmount !== null && baseKm !== null
    ? baseKm + distanceAmount
    : null;
  const dueOnDate = timeAmount !== null && baseDate ? addMonths(baseDate, timeAmount) : null;
  if (dueAtKm === null && dueOnDate === null) return unknownProjection(rule, interval);

  const result = statusFromDue({
    currentKm: input.currentOdometerKm,
    dueAtKm,
    dueOnDate,
    now: input.now,
    intervalKm: distanceAmount ?? null,
  });
  return {
    ...projectionBase(rule, interval),
    status: result.status,
    dueAtKm,
    dueOn: dueOnDate ? toIsoDate(dueOnDate) : null,
    dueBy: result.dueBy,
    lastPerformedAtKm: kmEvent?.odometerKm ?? null,
    lastPerformedOn: dateEvent?.performedOn ?? null,
    remainingKm: result.remainingKm,
    remainingDays: result.remainingDays,
    conditionResult: latestCondition?.inspectionResult ?? undefined,
    title: scheduledTitle(rule, result.status),
    reason: result.reason,
  };
}

function conditionSeverity(result: InspectionResult | undefined): number {
  if (result === 'replace_now') return 0;
  if (result === 'replace_soon') return 1;
  if (result === 'service_soon') return 2;
  if (result === 'cleaning_needed') return 3;
  if (result === 'unable_to_inspect') return 4;
  if (result === 'monitor') return 5;
  return 6;
}

function actionPriority(action: MaintenanceAction): number {
  const ranks: Record<MaintenanceAction, number> = {
    replace: 0,
    inspect: 1,
    condition_check: 2,
    test: 3,
    adjust: 4,
    tighten: 5,
    clean: 6,
    lubricate: 7,
    initial_service: 8,
  };
  return ranks[action];
}

export function maintenanceTaskPriority(task: MaintenanceTaskProjection): number {
  if (task.status === 'condition_attention' && task.safetyCritical) {
    return conditionSeverity(task.conditionResult);
  }
  if (task.status === 'overdue') return 100;
  if (task.status === 'condition_attention' && task.conditionResult === 'replace_now') return 150;
  if (task.status === 'due') return task.action === 'replace' ? 200 : 210;
  if (task.status === 'condition_attention') return 220 + conditionSeverity(task.conditionResult);
  if (task.status === 'due_soon') return 300;
  if (task.status === 'upcoming') return 400;
  if (task.status === 'history_unknown_recommend_service') return 500;
  if (task.status === 'history_unknown_request_record' || task.status === 'unknown') return 600;
  if (task.status === 'historical_unverified') return 800;
  if (task.status === 'no_fixed_interval' || task.status === 'informational') return 900;
  if (task.status === 'completed_confirmed') return 950;
  return 1000;
}

export const maintenancePriorityScore = maintenanceTaskPriority;

export function compareMaintenanceTaskPriority(
  left: MaintenanceTaskProjection,
  right: MaintenanceTaskProjection
): number {
  return maintenanceTaskPriority(left) - maintenanceTaskPriority(right)
    || Number(right.safetyCritical) - Number(left.safetyCritical)
    || actionPriority(left.action) - actionPriority(right.action)
    || conditionSeverity(left.conditionResult) - conditionSeverity(right.conditionResult)
    || (left.dueAtKm ?? Number.MAX_SAFE_INTEGER) - (right.dueAtKm ?? Number.MAX_SAFE_INTEGER)
    || (left.dueOn ?? '9999-12-31').localeCompare(right.dueOn ?? '9999-12-31')
    || left.ruleId.localeCompare(right.ruleId);
}

export function projectMaintenanceTasks(input: MaintenanceProjectionInput): MaintenanceTaskProjection[] {
  if (!Number.isSafeInteger(input.currentOdometerKm) || input.currentOdometerKm < 0) {
    throw new Error('Current odometer must be a non-negative whole number.');
  }
  const tasks = input.profile.rules.flatMap((rule): MaintenanceTaskProjection[] => {
    if (!rule.applicable) return [];
    const interval = resolveEffectiveInterval(rule, input);
    if (interval.reminderDisabled) {
      return [disabledProjection(rule, interval)];
    }
    if (knowledgeFor(rule, input) === 'not_applicable') {
      return [notApplicableProjection(rule, interval)];
    }
    if (rule.schedule.type === 'condition_based') {
      const conditionTask = projectConditionRule(rule, input, interval);
      if (conditionTask.status === 'condition_attention' || !interval.customConditionReminderEnabled) {
        return [conditionTask];
      }
      const reminderTask = projectScheduledRule(rule, input, interval);
      return reminderTask ? [reminderTask] : [];
    }
    if (rule.schedule.type === 'manual_only_or_no_fixed_interval') {
      if (interval.intervalSource !== 'profile_default'
        && (interval.distanceEnabled || interval.timeEnabled)) {
        const reminderTask = projectScheduledRule(rule, input, interval);
        return reminderTask ? [reminderTask] : [];
      }
      return [noFixedIntervalProjection(rule, interval)];
    }
    const task = projectScheduledRule(rule, input, interval);
    return task ? [task] : [];
  });
  return tasks.sort(compareMaintenanceTaskPriority);
}

export function maintenanceAttentionCount(tasks: MaintenanceTaskProjection[]): number {
  return tasks.filter((task) => ['overdue', 'due', 'due_soon', 'condition_attention'].includes(task.status)).length;
}

export function isCompletionAction(rule: MaintenanceRule, action: MaintenanceAction): boolean {
  return rule.action === action;
}
