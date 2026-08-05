import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NEW_SYMPHONY_ST_200_PROFILE } from './profiles';
import {
  historyStateKey,
  maintenancePriorityScore,
  originalScheduleForRule,
  projectMaintenanceTasks,
  resolveEffectiveInterval,
} from './scheduler';
import type {
  InspectionResult,
  MaintenanceEvent,
  MaintenanceRule,
  ScooterMaintenanceProfile,
  VehicleMaintenancePreference,
} from './types';

const NOW = new Date(2026, 7, 1, 12, 0, 0);
const OIL_INITIAL = 'engine-oil.replace.initial-300';
const OIL_RECURRING = 'engine-oil.replace.recurring-1000km';
const OIL_INSPECTION = 'engine-oil.inspect.recurring-1000km-1mo';

function profileWithRules(...ids: string[]): ScooterMaintenanceProfile {
  const rules = ids.map((id) => {
    const rule = NEW_SYMPHONY_ST_200_PROFILE.rules.find((candidate) => candidate.id === id);
    assert.ok(rule, `Missing fixture rule ${id}`);
    return rule;
  });
  return { ...NEW_SYMPHONY_ST_200_PROFILE, rules };
}

function event(rule: MaintenanceRule, overrides: Partial<MaintenanceEvent> = {}): MaintenanceEvent {
  return {
    id: overrides.id ?? `event-${rule.id}`,
    vehicleId: overrides.vehicleId ?? 1,
    profileId: overrides.profileId ?? NEW_SYMPHONY_ST_200_PROFILE.id,
    profileVersion: overrides.profileVersion ?? NEW_SYMPHONY_ST_200_PROFILE.profileVersion,
    ruleId: overrides.ruleId ?? rule.id,
    componentId: overrides.componentId ?? rule.componentId,
    action: overrides.action ?? rule.action,
    performedOn: overrides.performedOn ?? '2026-01-01',
    odometerKm: overrides.odometerKm ?? 0,
    mileageConfidence: overrides.mileageConfidence,
    dateConfidence: overrides.dateConfidence,
    inspectionResult: overrides.inspectionResult,
    migrationConfidence: overrides.migrationConfidence,
    createdAt: overrides.createdAt,
  };
}

function taskAt(
  profile: ScooterMaintenanceProfile,
  odometer: number,
  events: MaintenanceEvent[] = [],
  preferences: VehicleMaintenancePreference[] = []
) {
  return projectMaintenanceTasks({
    profile,
    vehicleId: 1,
    currentOdometerKm: odometer,
    now: NOW,
    events,
    preferences,
    defaultHistoryKnowledge: 'known_no_prior_completion',
  });
}

describe('initial-service lifecycle', () => {
  const profile = profileWithRules(OIL_INITIAL);

  it('keeps the 300 km milestone actionable through the explicit 1,000 km window', () => {
    assert.equal(taskAt(profile, 0)[0].status, 'upcoming');
    assert.equal(taskAt(profile, 299)[0].status, 'due_soon');
    assert.equal(taskAt(profile, 300)[0].status, 'due');
    assert.equal(taskAt(profile, 500)[0].status, 'overdue');
    assert.equal(taskAt(profile, 1000)[0].status, 'overdue');
  });

  it('makes a missed milestone historical immediately after the window, including at 18,080 km', () => {
    for (const odometer of [1001, 18080]) {
      const task = taskAt(profile, odometer)[0];
      assert.equal(task.status, 'historical_unverified');
      assert.equal(task.lastPerformedAtKm, null);
      assert.equal(task.lastPerformedOn, null);
      assert.equal(task.dueAtKm, 300);
    }
  });

  it('does not fabricate completion when history is unknown', () => {
    const lowMileage = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 0,
      now: NOW,
      events: [],
      defaultHistoryKnowledge: 'unknown',
    })[0];
    const highMileage = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [],
      defaultHistoryKnowledge: 'unknown',
    })[0];
    assert.equal(lowMileage.status, 'history_unknown_request_record');
    assert.equal(highMileage.status, 'historical_unverified');
    assert.equal(highMileage.lastPerformedAtKm, null);
  });

  it('removes only an exactly completed one-time task and never repeats it', () => {
    const completed = [event(profile.rules[0], { odometerKm: 300 })];
    for (const odometer of [300, 600, 1000, 18080]) {
      assert.deepEqual(taskAt(profile, odometer, completed), []);
    }
  });

  it('does not suppress recurring work when the initial record is absent', () => {
    const combined = profileWithRules(OIL_INITIAL, OIL_RECURRING);
    const recurring = taskAt(combined, 600).find((task) => task.ruleId === OIL_RECURRING);
    assert.ok(recurring);
    assert.equal(recurring.dueAtKm, 1000);
  });

  it('seeds recurrence from the confirmed 300 km replacement and schedules the next change at 1,300 km', () => {
    const combined = profileWithRules(OIL_INITIAL, OIL_RECURRING);
    const initialRule = combined.rules[0];
    const recurring = taskAt(combined, 300, [event(initialRule, { odometerKm: 300 })])
      .find((task) => task.ruleId === OIL_RECURRING);
    assert.ok(recurring);
    assert.equal(recurring.lastPerformedAtKm, 300);
    assert.equal(recurring.dueAtKm, 1300);
  });
});

describe('authoritative New Symphony ST 200 engine-oil replacement', () => {
  const profile = profileWithRules(OIL_RECURRING);
  const oilRule = profile.rules[0];

  it('uses exactly 1,000 km with no active 3,000 km alternative', () => {
    assert.equal(oilRule.action, 'replace');
    assert.equal(oilRule.schedule.type, 'recurring_distance');
    assert.equal(oilRule.schedule.intervalKm, 1000);
    assert.equal(oilRule.profileRecommendedIntervalKm, 1000);
    assert.equal(oilRule.confidence, 'owner_confirmed');
    assert.equal(oilRule.ambiguity, undefined);
    assert.equal(NEW_SYMPHONY_ST_200_PROFILE.rules.some((rule) =>
      rule.componentId === 'engine-oil'
      && rule.action === 'replace'
      && rule.schedule.type !== 'one_time_initial'
      && rule.schedule.intervalKm === 3000
    ), false);
  });

  it('projects 19,000 km and 920 km remaining after a confirmed 18,000 km oil change', () => {
    const task = taskAt(profile, 18080, [event(oilRule, { odometerKm: 18000 })])[0];
    assert.equal(task.lastPerformedAtKm, 18000);
    assert.equal(task.dueAtKm, 19000);
    assert.equal(task.remainingKm, 920);
    assert.equal(task.profileRecommendedIntervalKm, 1000);
    assert.equal(task.effectiveIntervalKm, 1000);
    assert.equal(task.intervalSource, 'profile_default');
  });

  it('projects 18,500 km after a confirmed 17,500 km oil change', () => {
    const task = taskAt(profile, 18080, [event(oilRule, { odometerKm: 17500 })])[0];
    assert.equal(task.dueAtKm, 18500);
    assert.equal(task.remainingKm, 420);
  });

  it('does not let a later inspection or generic service reset replacement', () => {
    const inspectionRule = profileWithRules(OIL_INSPECTION).rules[0];
    const confirmedChange = event(oilRule, { id: 'oil-change', odometerKm: 17500 });
    const laterInspection = event(inspectionRule, { id: 'inspection', odometerKm: 18000 });
    const genericService = event(oilRule, {
      id: 'generic-service',
      ruleId: 'general-service',
      action: 'initial_service',
      odometerKm: 18020,
    });
    const task = taskAt(profile, 18080, [confirmedChange, laterInspection, genericService])[0];
    assert.equal(task.lastPerformedAtKm, 17500);
    assert.equal(task.dueAtKm, 18500);
  });

  it('uses differentiated unknown history without inventing a baseline', () => {
    const task = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [],
    })[0];
    assert.equal(task.status, 'history_unknown_recommend_service');
    assert.equal(task.lastPerformedAtKm, null);
    assert.equal(task.dueAtKm, null);
    assert.equal(task.remainingKm, null);
  });
});

describe('vehicle-specific interval preferences', () => {
  const profile = profileWithRules(OIL_RECURRING);
  const rule = profile.rules[0];
  const oilChange = event(rule, { odometerKm: 18000 });

  function preference(overrides: Partial<VehicleMaintenancePreference>): VehicleMaintenancePreference {
    return {
      vehicleId: overrides.vehicleId ?? 1,
      profileId: overrides.profileId ?? profile.id,
      componentId: overrides.componentId ?? 'engine-oil',
      action: overrides.action ?? 'replace',
      profileRecommendedIntervalKm: 1000,
      originalIntervalKm: overrides.originalIntervalKm ?? 1000,
      originalIntervalMonths: overrides.originalIntervalMonths ?? null,
      customIntervalKm: overrides.customIntervalKm ?? overrides.userIntervalKm,
      customIntervalMonths: overrides.customIntervalMonths ?? null,
      userIntervalKm: overrides.customIntervalKm ?? overrides.userIntervalKm,
      effectiveIntervalKm: overrides.effectiveIntervalKm,
      effectiveIntervalMonths: overrides.effectiveIntervalMonths,
      distanceEnabled: overrides.distanceEnabled ?? true,
      timeEnabled: overrides.timeEnabled ?? false,
      conditionBasedDefault: overrides.conditionBasedDefault ?? false,
      customConditionReminderEnabled: overrides.customConditionReminderEnabled ?? false,
      intervalSource: overrides.intervalSource ?? 'user_custom',
      changedAt: overrides.changedAt ?? '2026-07-01T00:00:00.000Z',
      longerThanRecommendedConfirmed: overrides.longerThanRecommendedConfirmed,
    };
  }

  it('allows arbitrary 700 km and confirmed 20,000 km values without mutating the shared profile', () => {
    const original = rule.schedule.intervalKm;
    const sevenHundred = taskAt(profile, 18080, [oilChange], [preference({ customIntervalKm: 700 })])[0];
    const twentyThousand = taskAt(profile, 18080, [oilChange], [preference({ customIntervalKm: 20000, longerThanRecommendedConfirmed: true })])[0];
    assert.equal(sevenHundred.dueAtKm, 18700);
    assert.equal(sevenHundred.remainingKm, 620);
    assert.equal(twentyThousand.dueAtKm, 38000);
    assert.equal(rule.schedule.intervalKm, original);
  });

  it('does not apply the recurring oil override to the separate 300 km initial rule', () => {
    const fullProfile = NEW_SYMPHONY_ST_200_PROFILE;
    const recurringRule = fullProfile.rules.find((candidate) => candidate.id === OIL_RECURRING);
    const initialRule = fullProfile.rules.find((candidate) => candidate.id === OIL_INITIAL);
    assert.ok(recurringRule);
    assert.ok(initialRule);
    const tasks = projectMaintenanceTasks({
      profile: fullProfile,
      vehicleId: 1,
      currentOdometerKm: 18060,
      now: NOW,
      events: [event(recurringRule, { odometerKm: 17000 })],
      preferences: [preference({ customIntervalKm: 700 })],
    });

    assert.equal(tasks.find((task) => task.ruleId === OIL_RECURRING)?.dueAtKm, 17700);
    const initial = tasks.find((task) => task.ruleId === OIL_INITIAL);
    assert.equal(initial?.effectiveIntervalKm, 300);
    assert.equal(initial?.intervalSource, 'profile_default');
  });

  it('does not let an old one-time preference resurrect a historical break-in milestone', () => {
    const fullProfile = NEW_SYMPHONY_ST_200_PROFILE;
    const initialRule = fullProfile.rules.find((candidate) => candidate.id === OIL_INITIAL);
    assert.ok(initialRule);
    const historical = projectMaintenanceTasks({
      profile: fullProfile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [],
      preferences: [preference({
        originalIntervalKm: 300,
        customIntervalKm: 20000,
        longerThanRecommendedConfirmed: true,
      })],
      defaultHistoryKnowledge: 'unknown',
    }).find((task) => task.ruleId === OIL_INITIAL);
    assert.equal(historical?.status, 'historical_unverified');
  });

  it('scopes a preference to one vehicle', () => {
    const otherVehiclePreference = preference({ vehicleId: 2, customIntervalKm: 700 });
    const task = taskAt(profile, 18080, [oilChange], [otherVehiclePreference])[0];
    assert.equal(task.effectiveIntervalKm, 1000);
    assert.equal(task.dueAtKm, 19000);
  });

  it('restores the profile default using the latest preference without changing history', () => {
    const preferences = [
      preference({ userIntervalKm: 800, changedAt: '2026-06-01T00:00:00.000Z' }),
      preference({ intervalSource: 'profile_default', changedAt: '2026-07-01T00:00:00.000Z' }),
    ];
    const task = taskAt(profile, 18080, [oilChange], preferences)[0];
    assert.equal(task.intervalSource, 'profile_default');
    assert.equal(task.effectiveIntervalKm, 1000);
    assert.equal(task.lastPerformedAtKm, 18000);
    assert.equal(task.dueAtKm, 19000);
  });

  it('requires explicit confirmation only for a longer-than-recommended interval', () => {
    assert.throws(() => resolveEffectiveInterval(rule, {
      profile,
      vehicleId: 1,
      preferences: [preference({ userIntervalKm: 1200 })],
    }), /explicit confirmation/i);
    const confirmed = resolveEffectiveInterval(rule, {
      profile,
      vehicleId: 1,
      preferences: [preference({ userIntervalKm: 1200, longerThanRecommendedConfirmed: true })],
    });
    assert.equal(confirmed.effectiveIntervalKm, 1200);
  });

  it('lets every applicable profile action resolve a vehicle-only custom distance reminder', () => {
    for (const candidate of NEW_SYMPHONY_ST_200_PROFILE.rules.filter((item) => item.applicable)) {
      const original = originalScheduleForRule(candidate);
      const custom: VehicleMaintenancePreference = {
        vehicleId: 1,
        profileId: NEW_SYMPHONY_ST_200_PROFILE.id,
        componentId: candidate.componentId,
        action: candidate.action,
        originalIntervalKm: original.intervalKm,
        originalIntervalMonths: original.intervalMonths,
        customIntervalKm: 777,
        customIntervalMonths: null,
        distanceEnabled: true,
        timeEnabled: false,
        conditionBasedDefault: original.conditionBased,
        customConditionReminderEnabled: original.conditionBased,
        intervalSource: 'user_custom',
        changedAt: '2026-08-01T00:00:00.000Z',
        longerThanRecommendedConfirmed: original.intervalKm !== null && 777 > original.intervalKm,
      };
      assert.equal(resolveEffectiveInterval(candidate, {
        profile: NEW_SYMPHONY_ST_200_PROFILE,
        vehicleId: 1,
        preferences: [custom],
      }).effectiveIntervalKm, 777, candidate.id);
    }
  });
});

describe('generic distance, time, disable, and condition reminders', () => {
  const transmissionProfile = profileWithRules('transmission-oil.replace.recurring-5000km-5mo');
  const transmissionRule = transmissionProfile.rules[0];
  const transmissionEvent = event(transmissionRule, { odometerKm: 15000, performedOn: '2026-07-01' });

  function genericPreference(overrides: Partial<VehicleMaintenancePreference>): VehicleMaintenancePreference {
    return {
      vehicleId: 1,
      profileId: overrides.profileId ?? transmissionProfile.id,
      componentId: overrides.componentId ?? transmissionRule.componentId,
      action: overrides.action ?? transmissionRule.action,
      originalIntervalKm: overrides.originalIntervalKm ?? 5000,
      originalIntervalMonths: overrides.originalIntervalMonths ?? 5,
      customIntervalKm: overrides.customIntervalKm ?? null,
      customIntervalMonths: overrides.customIntervalMonths ?? null,
      distanceEnabled: overrides.distanceEnabled ?? true,
      timeEnabled: overrides.timeEnabled ?? true,
      conditionBasedDefault: overrides.conditionBasedDefault ?? false,
      customConditionReminderEnabled: overrides.customConditionReminderEnabled ?? false,
      intervalSource: 'user_custom',
      changedAt: '2026-08-01T00:00:00.000Z',
      longerThanRecommendedConfirmed: overrides.longerThanRecommendedConfirmed,
    };
  }

  it('supports distance-only and time-only schedules', () => {
    const distanceOnly = taskAt(transmissionProfile, 16000, [transmissionEvent], [genericPreference({
      customIntervalKm: 20000,
      distanceEnabled: true,
      timeEnabled: false,
      longerThanRecommendedConfirmed: true,
    })])[0];
    assert.equal(distanceOnly.dueAtKm, 35000);
    assert.equal(distanceOnly.dueOn, null);

    const timeOnly = taskAt(transmissionProfile, 16000, [transmissionEvent], [genericPreference({
      customIntervalMonths: 2,
      distanceEnabled: false,
      timeEnabled: true,
    })])[0];
    assert.equal(timeOnly.dueAtKm, null);
    assert.equal(timeOnly.dueOn, '2026-09-01');
  });

  it('uses whichever of combined distance and time becomes due first', () => {
    const task = projectMaintenanceTasks({
      profile: transmissionProfile,
      vehicleId: 1,
      currentOdometerKm: 16000,
      now: new Date(2026, 11, 2, 12, 0, 0),
      events: [transmissionEvent],
      preferences: [genericPreference({
        customIntervalKm: 20000,
        customIntervalMonths: 5,
        longerThanRecommendedConfirmed: true,
      })],
      defaultHistoryKnowledge: 'known_no_prior_completion',
    })[0];
    assert.equal(task.dueAtKm, 35000);
    assert.equal(task.dueOn, '2026-12-01');
    assert.equal(task.status, 'overdue');
    assert.equal(task.dueBy, 'time');
  });

  it('disables alerts without removing the rule or its confirmed history', () => {
    const events = [transmissionEvent];
    const originalEvents = structuredClone(events);
    const task = taskAt(transmissionProfile, 16000, events, [genericPreference({
      distanceEnabled: false,
      timeEnabled: false,
    })])[0];
    assert.equal(task.reminderDisabled, true);
    assert.equal(task.status, 'no_fixed_interval');
    assert.equal(task.dueAtKm, null);
    assert.equal(task.dueOn, null);
    assert.deepEqual(events, originalEvents);
  });

  it('adds a user-created reminder to a condition rule without changing its original schedule type', () => {
    const conditionProfile = profileWithRules('brake-pads.replace.at-wear-limit');
    const conditionRule = conditionProfile.rules[0];
    const replacement = event(conditionRule, { odometerKm: 10000 });
    const custom = genericPreference({
      profileId: conditionProfile.id,
      componentId: conditionRule.componentId,
      action: conditionRule.action,
      originalIntervalKm: null,
      originalIntervalMonths: null,
      customIntervalKm: 1500,
      distanceEnabled: true,
      timeEnabled: false,
      conditionBasedDefault: true,
      customConditionReminderEnabled: true,
    });
    const task = taskAt(conditionProfile, 10500, [replacement], [custom])[0];
    assert.equal(conditionRule.schedule.type, 'condition_based');
    assert.equal(task.scheduleType, 'condition_based');
    assert.equal(task.customConditionReminderEnabled, true);
    assert.equal(task.dueAtKm, 11500);
  });
});

describe('action-specific and confidence-aware history', () => {
  it('does not let replacement complete inspection or inspection complete replacement', () => {
    const inspectionId = 'spark-plug.inspect.recurring-3000km-3mo';
    const replacementId = 'spark-plug.replace.recurring-12000km-12mo';
    const profile = profileWithRules(inspectionId, replacementId);
    const replacement = event(profile.rules[1], { odometerKm: 2500 });
    const tasks = taskAt(profile, 3000, [replacement]);
    assert.equal(tasks.find((task) => task.ruleId === inspectionId)?.dueAtKm, 3000);
    assert.equal(tasks.find((task) => task.ruleId === replacementId)?.dueAtKm, 14500);
  });

  it('uses component-and-action history keys and differentiated unknown states', () => {
    assert.equal(historyStateKey('engine-oil', 'replace'), 'engine-oil:replace');
    const profile = profileWithRules(OIL_RECURRING, 'spark-plug.inspect.recurring-3000km-3mo');
    const tasks = projectMaintenanceTasks({ profile, vehicleId: 1, currentOdometerKm: 5000, now: NOW, events: [] });
    assert.equal(tasks.find((task) => task.ruleId === OIL_RECURRING)?.status, 'history_unknown_recommend_service');
    assert.equal(tasks.find((task) => task.action === 'inspect')?.status, 'history_unknown_request_record');
  });

  it('honours an explicit not-applicable onboarding answer without creating a due value', () => {
    const profile = profileWithRules(OIL_RECURRING);
    const task = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [],
      historyByAction: { [historyStateKey('engine-oil', 'replace')]: 'not_applicable' },
    })[0];
    assert.equal(task.status, 'not_applicable');
    assert.equal(task.dueAtKm, null);
    assert.equal(task.remainingKm, null);
    assert.equal(task.lastPerformedAtKm, null);
  });

  it('quarantines vague legacy records and events from a different vehicle or profile', () => {
    const profile = profileWithRules(OIL_RECURRING);
    const legacy = event(profile.rules[0], { odometerKm: 12000, migrationConfidence: 'needs_user_confirmation' });
    const otherVehicle = event(profile.rules[0], { vehicleId: 2, odometerKm: 17000 });
    const otherProfile = event(profile.rules[0], { profileId: 'other-scooter', odometerKm: 17500 });
    const task = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [legacy, otherVehicle, otherProfile],
    })[0];
    assert.equal(task.status, 'history_unknown_recommend_service');
    assert.equal(task.lastPerformedAtKm, null);
  });
});

describe('condition-based maintenance and priority', () => {
  const inspectionId = 'brake-pads.inspect.recurring-1000km-1mo';
  const replacementId = 'brake-pads.replace.at-wear-limit';

  function conditionTasks(result: InspectionResult, extraEvents: MaintenanceEvent[] = []) {
    const profile = profileWithRules(inspectionId, replacementId);
    return projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 2500,
      now: NOW,
      events: [event(profile.rules[0], {
        id: 'inspection-finding',
        odometerKm: 2000,
        performedOn: '2026-01-01',
        inspectionResult: result,
      }), ...extraEvents],
      defaultHistoryKnowledge: 'known_no_prior_completion',
    });
  }

  it('never invents a replacement countdown for any condition result', () => {
    for (const result of ['healthy', 'cleaning_needed', 'monitor', 'service_soon', 'replace_soon', 'replace_now', 'unable_to_inspect'] as const) {
      const task = conditionTasks(result).find((candidate) => candidate.ruleId === replacementId);
      assert.ok(task);
      assert.equal(task.dueAtKm, null);
      assert.equal(task.remainingKm, null);
      assert.equal(task.dueBy, 'condition');
      assert.equal(task.status, result === 'healthy' || result === 'cleaning_needed'
        ? 'no_fixed_interval'
        : 'condition_attention');
      assert.equal(task.conditionResult, result);
    }
  });

  it('clears a condition warning after a later exact replacement', () => {
    const profile = profileWithRules(inspectionId, replacementId);
    const replacement = event(profile.rules[1], {
      id: 'replacement',
      odometerKm: 2200,
      performedOn: '2026-02-01',
    });
    const task = conditionTasks('replace_now', [replacement])
      .find((candidate) => candidate.ruleId === replacementId);
    assert.equal(task?.status, 'no_fixed_interval');
  });

  it('ranks a safety-critical replace-now finding ahead of overdue work', () => {
    const brake = conditionTasks('replace_now').find((task) => task.ruleId === replacementId);
    const oil = taskAt(profileWithRules(OIL_RECURRING), 2000)[0];
    assert.ok(brake);
    assert.equal(oil.status, 'overdue');
    assert.ok(maintenancePriorityScore(brake) < maintenancePriorityScore(oil));
  });
});

describe('time and unsupported schedules', () => {
  it('supports time becoming due before distance and distance becoming due before time', () => {
    const profile = profileWithRules('transmission-oil.replace.recurring-5000km-5mo');
    const timeFirst = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 100,
      now: new Date(2026, 5, 2),
      events: [],
      defaultHistoryKnowledge: 'known_no_prior_completion',
      vehicleInServiceDate: '2026-01-01',
    })[0];
    const distanceFirst = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 5000,
      now: new Date(2026, 1, 1),
      events: [],
      defaultHistoryKnowledge: 'known_no_prior_completion',
      vehicleInServiceDate: '2026-01-01',
    })[0];
    assert.equal(timeFirst.status, 'overdue');
    assert.equal(timeFirst.dueBy, 'time');
    assert.equal(distanceFirst.status, 'due');
    assert.equal(distanceFirst.dueBy, 'distance');
  });

  it('keeps no-fixed-interval guidance without manufacturing a deadline', () => {
    const profile = profileWithRules('brake-fluid.inspect.manual');
    const task = taskAt(profile, 50000)[0];
    assert.equal(task.status, 'no_fixed_interval');
    assert.equal(task.dueAtKm, null);
    assert.equal(task.dueOn, null);
  });

  it('allows a user-created interval on an original no-fixed-interval action', () => {
    const profile = profileWithRules('brake-fluid.inspect.manual');
    const rule = profile.rules[0];
    const task = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 500,
      now: NOW,
      events: [],
      preferences: [{
        vehicleId: 1,
        profileId: profile.id,
        componentId: rule.componentId,
        action: rule.action,
        originalIntervalKm: null,
        originalIntervalMonths: null,
        customIntervalKm: 777,
        distanceEnabled: true,
        timeEnabled: false,
        conditionBasedDefault: false,
        customConditionReminderEnabled: false,
        intervalSource: 'user_custom',
        changedAt: '2026-08-01T00:00:00.000Z',
      }],
      defaultHistoryKnowledge: 'known_no_prior_completion',
    })[0];

    assert.equal(rule.schedule.type, 'manual_only_or_no_fixed_interval');
    assert.equal(task.scheduleType, 'manual_only_or_no_fixed_interval');
    assert.equal(task.effectiveIntervalKm, 777);
    assert.equal(task.dueAtKm, 777);
    assert.equal(task.status, 'upcoming');
  });

  it('never projects non-applicable cooling rules', () => {
    const profile = profileWithRules('cooling-system.inspect.leakage', 'coolant.replace.recurring-12mo');
    assert.deepEqual(taskAt(profile, 50000), []);
  });
});
