import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NEW_SYMPHONY_ST_200_PROFILE } from './profiles';
import { projectVehicleMaintenance } from './lifecycle';
import { projectMaintenanceTasks } from './scheduler';
import type { MaintenanceHistoryState, VehicleProfile } from '../types/database.types';
import type {
  MaintenanceAction,
  MaintenanceEvent,
  MaintenanceRule,
  MaintenanceSource,
  MaintenanceCategory,
  ScheduleDefinition,
  ScooterMaintenanceProfile,
  VehicleMaintenancePreference,
} from './types';

const NOW = new Date('2026-08-01T12:00:00.000Z');
const SOURCE: MaintenanceSource = {
  sourceType: 'project_owner_override',
  originalText: 'Synthetic characterization fixture; not a product recommendation.',
};

function rule(input: {
  id: string;
  componentId: string;
  label: string;
  action: MaintenanceAction;
  category: MaintenanceCategory;
  schedule: ScheduleDefinition;
  safetyCritical?: boolean;
  conditionFollowUp?: MaintenanceRule['conditionFollowUp'];
  profileRecommendedIntervalKm?: number;
}): MaintenanceRule {
  return {
    id: input.id,
    componentId: input.componentId,
    category: input.category,
    label: input.label,
    applicable: true,
    action: input.action,
    schedule: input.schedule,
    safetyCritical: input.safetyCritical ?? false,
    technicianRecommended: false,
    userInspectable: input.action === 'inspect' || input.action === 'clean' || input.action === 'lubricate',
    technicianLevel: input.action === 'replace' ? 'workshop_recommended' : 'user_checkable',
    profileRecommendedIntervalKm: input.profileRecommendedIntervalKm,
    conditionFollowUp: input.conditionFollowUp,
    source: SOURCE,
    confidence: 'owner_confirmed',
  };
}

function profile(id: string, rules: MaintenanceRule[], initialService = false): ScooterMaintenanceProfile {
  return {
    schemaVersion: 1,
    id,
    profileVersion: 'test-1',
    status: 'validated',
    manufacturer: 'Synthetic Test Vehicle',
    model: id,
    modelCodes: [id],
    engine: { displacementCc: 500, cooling: 'liquid' },
    supportedYears: { from: 2020, to: null },
    markets: ['test'],
    catalogSelection: {
      brandId: `test-${id}`,
      modelId: `test-${id}`,
      versionId: `test-${id}:version`,
      variantId: `test-${id}:variant`,
    },
    manual: { id: `manual-${id}`, filename: `${id}.pdf`, pageCount: 1 },
    identitySources: [SOURCE],
    manualLegend: {},
    severeUseGuidance: [],
    profileAmbiguities: [],
    ...(initialService ? { initialServicePolicy: { actionableUntilKm: 1000, afterWindowBehavior: 'historical_unverified' as const } } : {}),
    rules,
  };
}

const motorcycleInspectionId = 'synthetic-motorcycle.chain.inspect';
const motorcycleReplacementId = 'synthetic-motorcycle.chain.replace-condition';

const motorcycleProfile = profile('synthetic-manual-motorcycle', [
  rule({ id: 'synthetic-motorcycle.engine-oil.replace', componentId: 'engine-oil', label: 'Engine oil replacement', action: 'replace', category: 'engine_and_lubrication', schedule: { type: 'recurring_distance', intervalKm: 5000 }, profileRecommendedIntervalKm: 5000 }),
  rule({ id: 'synthetic-motorcycle.oil-filter.replace', componentId: 'oil-filter-screen', label: 'Oil filter replacement', action: 'replace', category: 'engine_and_lubrication', schedule: { type: 'recurring_distance_or_time', intervalKm: 10000, intervalMonths: 12, dueWhen: 'whichever_comes_first' } }),
  rule({ id: motorcycleInspectionId, componentId: 'chain-drive', label: 'Chain inspection', action: 'inspect', category: 'transmission_and_cvt', schedule: { type: 'recurring_distance', intervalKm: 1000 }, profileRecommendedIntervalKm: 1000, conditionFollowUp: { ruleId: motorcycleReplacementId, triggerResults: ['service_soon', 'replace_soon', 'replace_now'] } }),
  rule({ id: 'synthetic-motorcycle.chain.clean', componentId: 'chain-drive', label: 'Chain cleaning', action: 'clean', category: 'transmission_and_cvt', schedule: { type: 'manual_only_or_no_fixed_interval' } }),
  rule({ id: 'synthetic-motorcycle.chain.lubricate', componentId: 'chain-drive', label: 'Chain lubrication', action: 'lubricate', category: 'transmission_and_cvt', schedule: { type: 'recurring_distance', intervalKm: 500 } }),
  rule({ id: 'synthetic-motorcycle.chain.adjust', componentId: 'chain-drive', label: 'Chain adjustment', action: 'adjust', category: 'transmission_and_cvt', schedule: { type: 'recurring_distance', intervalKm: 2000 } }),
  rule({ id: motorcycleReplacementId, componentId: 'chain-drive', label: 'Chain replacement', action: 'replace', category: 'transmission_and_cvt', schedule: { type: 'condition_based', replacementCondition: 'Replace when inspection finds unsafe wear.' }, safetyCritical: true }),
  rule({ id: 'synthetic-motorcycle.brakes.inspect', componentId: 'brake-pads', label: 'Brake inspection', action: 'inspect', category: 'brakes', schedule: { type: 'recurring_distance_or_time', intervalKm: 3000, intervalMonths: 6, dueWhen: 'whichever_comes_first' }, safetyCritical: true }),
  rule({ id: 'synthetic-motorcycle.brake-fluid.replace', componentId: 'brake-fluid', label: 'Brake fluid replacement', action: 'replace', category: 'brakes', schedule: { type: 'recurring_time', intervalMonths: 24 }, safetyCritical: true }),
  rule({ id: 'synthetic-motorcycle.spark-plug.replace', componentId: 'spark-plug', label: 'Spark plug replacement', action: 'replace', category: 'ignition', schedule: { type: 'recurring_distance', intervalKm: 10000 } }),
  rule({ id: 'synthetic-motorcycle.air-filter.inspect', componentId: 'air-cleaner-element', label: 'Air-filter inspection', action: 'inspect', category: 'fuel_and_intake', schedule: { type: 'recurring_distance', intervalKm: 5000 } }),
  rule({ id: 'synthetic-motorcycle.air-filter.replace', componentId: 'air-cleaner-element', label: 'Air-filter replacement', action: 'replace', category: 'fuel_and_intake', schedule: { type: 'recurring_distance', intervalKm: 15000 } }),
  rule({ id: 'synthetic-motorcycle.first-service', componentId: 'engine-oil', label: 'Initial service', action: 'initial_service', category: 'engine_and_lubrication', schedule: { type: 'one_time_initial', initialServiceKm: 300, initialActionableUntilKm: 1000 } }),
], true);

const carProfile = profile('synthetic-gasoline-car', [
  rule({ id: 'synthetic-car.engine-oil.replace', componentId: 'engine-oil', label: 'Engine oil replacement', action: 'replace', category: 'engine_and_lubrication', schedule: { type: 'recurring_distance', intervalKm: 10000 } }),
  // The existing catalogue calls this component oil-filter-screen; the fixture keeps that stable ID.
  rule({ id: 'synthetic-car.oil-filter.replace', componentId: 'oil-filter-screen', label: 'Oil filter replacement', action: 'replace', category: 'engine_and_lubrication', schedule: { type: 'recurring_distance_or_time', intervalKm: 10000, intervalMonths: 12, dueWhen: 'whichever_comes_first' } }),
  rule({ id: 'synthetic-car.air-filter.inspect', componentId: 'air-cleaner-element', label: 'Air-filter inspection', action: 'inspect', category: 'fuel_and_intake', schedule: { type: 'recurring_distance_or_time', intervalKm: 15000, intervalMonths: 12, dueWhen: 'whichever_comes_first' } }),
  rule({ id: 'synthetic-car.air-filter.replace', componentId: 'air-cleaner-element', label: 'Air-filter replacement', action: 'replace', category: 'fuel_and_intake', schedule: { type: 'recurring_distance', intervalKm: 30000 } }),
  rule({ id: 'synthetic-car.coolant.replace', componentId: 'coolant', label: 'Coolant replacement', action: 'replace', category: 'cooling', schedule: { type: 'recurring_time', intervalMonths: 24 } }),
  rule({ id: 'synthetic-car.brake-fluid.replace', componentId: 'brake-fluid', label: 'Brake fluid replacement', action: 'replace', category: 'brakes', schedule: { type: 'recurring_time', intervalMonths: 24 } }),
  rule({ id: 'synthetic-car.brakes.inspect', componentId: 'brake-pads', label: 'Brake inspection', action: 'inspect', category: 'brakes', schedule: { type: 'recurring_distance', intervalKm: 10000 } }),
  rule({ id: 'synthetic-car.transmission.inspect', componentId: 'transmission-oil', label: 'Transmission service', action: 'inspect', category: 'transmission_and_cvt', schedule: { type: 'recurring_distance_or_time', intervalKm: 30000, intervalMonths: 24, dueWhen: 'whichever_comes_first' } }),
  rule({ id: 'synthetic-car.spark-plug.replace', componentId: 'spark-plug', label: 'Spark plug replacement', action: 'replace', category: 'ignition', schedule: { type: 'recurring_distance_or_time', intervalKm: 30000, intervalMonths: 36, dueWhen: 'whichever_comes_first' } }),
]);

function event(ruleToRecord: MaintenanceRule, overrides: Partial<MaintenanceEvent> = {}): MaintenanceEvent {
  return {
    id: overrides.id ?? `event-${ruleToRecord.id}`,
    vehicleId: overrides.vehicleId ?? 1,
    profileId: overrides.profileId ?? motorcycleProfile.id,
    profileVersion: overrides.profileVersion ?? 'test-1',
    ruleId: overrides.ruleId ?? ruleToRecord.id,
    componentId: overrides.componentId ?? ruleToRecord.componentId,
    action: overrides.action ?? ruleToRecord.action,
    performedOn: overrides.performedOn ?? '2026-01-01',
    odometerKm: overrides.odometerKm ?? 0,
    mileageConfidence: overrides.mileageConfidence ?? 'confirmed',
    dateConfidence: overrides.dateConfidence ?? 'confirmed',
    inspectionResult: overrides.inspectionResult,
    migrationConfidence: overrides.migrationConfidence ?? 'exact',
  };
}

function taskAt(
  testProfile: ScooterMaintenanceProfile,
  odometerKm: number,
  events: MaintenanceEvent[] = [],
  preferences: VehicleMaintenancePreference[] = [],
  now = NOW,
) {
  return projectMaintenanceTasks({
    profile: testProfile,
    vehicleId: 1,
    currentOdometerKm: odometerKm,
    now,
    events,
    preferences,
  });
}

function vehicle(id: number, purchaseCondition: VehicleProfile['purchase_condition'], mileage: number): VehicleProfile {
  return {
    id,
    name: `Synthetic ${id}`,
    current_mileage: mileage,
    total_km_range: 0,
    has_completed_setup: 1,
    service_history_setup_completed: 0,
    maintenance_history_level: 'not_asked',
    created_at: '2026-01-01T00:00:00.000Z',
    daily_average_km: 0,
    last_odometer_update_timestamp: '2026-08-01T00:00:00.000Z',
    tank_capacity_liters: null,
    scooter_brand_id: 'synthetic',
    scooter_model_id: 'synthetic',
    scooter_version_id: 'synthetic:version',
    scooter_variant_id: 'synthetic:variant',
    vehicle_selection_mode: 'custom_brand',
    custom_brand_name: 'Synthetic',
    custom_model_name: 'Test vehicle',
    vehicle_capabilities_version: 1,
    vehicle_capabilities_json: '{}',
    purchase_condition: purchaseCondition,
    maintenance_started_at: '2026-01-01T00:00:00.000Z',
  };
}

function lifecyclePlan(testVehicle: VehicleProfile, testProfile: ScooterMaintenanceProfile, events: MaintenanceEvent[] = [], historyStates: MaintenanceHistoryState[] = []) {
  return projectVehicleMaintenance({ vehicle: testVehicle, profile: testProfile, events, preferences: [], historyStates, now: NOW });
}

function preference(testProfile: ScooterMaintenanceProfile, ruleToCustomize: MaintenanceRule, customIntervalKm: number): VehicleMaintenancePreference {
  return {
    vehicleId: 1,
    profileId: testProfile.id,
    componentId: ruleToCustomize.componentId,
    action: ruleToCustomize.action,
    originalIntervalKm: ruleToCustomize.schedule.intervalKm ?? null,
    originalIntervalMonths: ruleToCustomize.schedule.intervalMonths ?? null,
    customIntervalKm,
    userIntervalKm: customIntervalKm,
    distanceEnabled: true,
    timeEnabled: false,
    conditionBasedDefault: false,
    customConditionReminderEnabled: false,
    intervalSource: 'user_custom',
    changedAt: '2026-07-01T00:00:00.000Z',
    longerThanRecommendedConfirmed: customIntervalKm > (ruleToCustomize.schedule.intervalKm ?? 0),
  };
}

describe('vehicle-type characterization profiles', () => {
  it('keeps the current scooter profile as the baseline behavior', () => {
    const oilRule = NEW_SYMPHONY_ST_200_PROFILE.rules.find((candidate) => candidate.componentId === 'engine-oil' && candidate.action === 'replace' && candidate.schedule.type !== 'one_time_initial');
    assert.ok(oilRule);
    const task = projectMaintenanceTasks({ profile: NEW_SYMPHONY_ST_200_PROFILE, vehicleId: 1, currentOdometerKm: 12_500, now: NOW, events: [{ ...event(oilRule, { profileId: NEW_SYMPHONY_ST_200_PROFILE.id, odometerKm: 12_450 }), profileVersion: NEW_SYMPHONY_ST_200_PROFILE.profileVersion }] })
      .find((candidate) => candidate.ruleId === oilRule.id);
    assert.equal(task?.remainingKm, 950);
  });

  it('projects recurring distance maintenance and preserves unknown history', () => {
    const oil = motorcycleProfile.rules[0];
    const oilTask = taskAt(motorcycleProfile, 12_500, [event(oil, { odometerKm: 12_450 })]).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(oilTask?.dueAtKm, 17_450);
    assert.equal(oilTask?.remainingKm, 4_950);

    const unknown = taskAt(motorcycleProfile, 12_500).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(unknown?.status, 'unknown_history');
    assert.equal(unknown?.dueAtKm, null);
    assert.equal(unknown?.remainingKm, null);
  });

  it('supports time-only and distance-or-time schedules, with the first deadline winning', () => {
    const coolant = carProfile.rules.find((candidate) => candidate.id.endsWith('coolant.replace'))!;
    const coolantTask = taskAt(carProfile, 10_000, [event(coolant, { profileId: carProfile.id, performedOn: '2025-01-15', odometerKm: null })], [], new Date('2026-08-01'))
      .find((candidate) => candidate.ruleId === coolant.id);
    assert.equal(coolantTask?.dueOn, '2027-01-15');
    assert.equal(coolantTask?.dueAtKm, null);

    const oilFilter = carProfile.rules.find((candidate) => candidate.id.endsWith('oil-filter.replace'))!;
    const timeFirst = taskAt(carProfile, 10_500, [event(oilFilter, { profileId: carProfile.id, performedOn: '2025-01-01', odometerKm: 10_000 })], [], new Date('2026-02-01'))
      .find((candidate) => candidate.ruleId === oilFilter.id);
    assert.equal(timeFirst?.dueBy, 'time');
    assert.equal(timeFirst?.status, 'overdue');
    assert.equal(timeFirst?.remainingKm, 9_500);
  });

  it('uses user-custom intervals without replacing the profile rule', () => {
    const oil = motorcycleProfile.rules[0];
    const task = taskAt(motorcycleProfile, 15_000, [event(oil, { odometerKm: 10_000 })], [preference(motorcycleProfile, oil, 7_000)])
      .find((candidate) => candidate.ruleId === oil.id);
    assert.equal(task?.dueAtKm, 17_000);
    assert.equal(task?.remainingKm, 2_000);
    assert.equal(task?.intervalSource, 'user_custom');
    assert.equal(oil.schedule.intervalKm, 5_000);
  });

  it('keeps inspection findings separate from replacement countdowns', () => {
    const inspection = motorcycleProfile.rules.find((candidate) => candidate.id === motorcycleInspectionId)!;
    const replacement = motorcycleProfile.rules.find((candidate) => candidate.id === motorcycleReplacementId)!;
    const tasks = taskAt(motorcycleProfile, 11_000, [event(inspection, { odometerKm: 10_000, inspectionResult: 'replace_soon' })]);
    const inspectionTask = tasks.find((candidate) => candidate.ruleId === inspection.id);
    const replacementTask = tasks.find((candidate) => candidate.ruleId === replacement.id);
    assert.equal(inspectionTask?.dueAtKm, 11_000);
    assert.equal(replacementTask?.status, 'condition_attention');
    assert.equal(replacementTask?.dueAtKm, null);
    assert.equal(replacementTask?.remainingKm, null);
  });

  it('isolates events by vehicle and profile', () => {
    const oil = motorcycleProfile.rules[0];
    const eventForOtherVehicle = event(oil, { vehicleId: 2, odometerKm: 10_000 });
    const vehicleTwo = projectMaintenanceTasks({ profile: motorcycleProfile, vehicleId: 2, currentOdometerKm: 10_500, now: NOW, events: [eventForOtherVehicle] }).find((candidate) => candidate.ruleId === oil.id);
    const vehicleOne = projectMaintenanceTasks({ profile: motorcycleProfile, vehicleId: 1, currentOdometerKm: 10_500, now: NOW, events: [eventForOtherVehicle] }).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(vehicleTwo?.status, 'ok');
    assert.equal(vehicleTwo?.dueAtKm, 15_000);
    assert.equal(vehicleOne?.status, 'unknown_history');
    assert.equal(vehicleOne?.dueAtKm, null);

    const sameRuleOtherProfile = event(oil, { profileId: carProfile.id, odometerKm: 10_000 });
    const isolatedProfile = taskAt(motorcycleProfile, 10_500, [sameRuleOtherProfile]).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(isolatedProfile?.status, 'unknown_history');
  });

  it('preserves a compatible maintenance anchor across profile versions', () => {
    const v1Rule = rule({ id: 'engine-oil-service', componentId: 'engine-oil', label: 'Engine oil replacement', action: 'replace', category: 'engine_and_lubrication', schedule: { type: 'recurring_distance', intervalKm: 3000 } });
    const v1 = { ...profile('synthetic-profile-upgrade', [v1Rule]), profileVersion: 'v1' };
    const v2Rule = { ...v1Rule, schedule: { type: 'recurring_distance' as const, intervalKm: 1000 } };
    const v2 = { ...profile('synthetic-profile-upgrade', [v2Rule]), profileVersion: 'v2' };

    const task = taskAt(v2, 9_500, [event(v1Rule, {
      profileId: v1.id,
      profileVersion: v1.profileVersion,
      odometerKm: 9_000,
    })])[0];
    assert.equal(task.lastPerformedAtKm, 9_000);
    assert.equal(task.dueAtKm, 10_000);
    assert.equal(task.remainingKm, 500);
    assert.notEqual(task.status, 'unknown_history');
  });

  it('keeps equivalent rules isolated when their profile IDs differ', () => {
    const sharedRule = rule({ id: 'engine-oil-service', componentId: 'engine-oil', label: 'Engine oil replacement', action: 'replace', category: 'engine_and_lubrication', schedule: { type: 'recurring_distance', intervalKm: 1000 } });
    const profileA = profile('synthetic-profile-a', [sharedRule]);
    const profileB = profile('synthetic-profile-b', [sharedRule]);
    const task = taskAt(profileB, 9_500, [event(sharedRule, {
      profileId: profileA.id,
      profileVersion: profileA.profileVersion,
      odometerKm: 9_000,
    })])[0];
    assert.equal(task.status, 'unknown_history');
    assert.equal(task.lastPerformedAtKm, null);
    assert.equal(task.dueAtKm, null);
  });

  it('rejects old history when a stable rule ID changes action', () => {
    const v1Rule = rule({ id: 'air-filter-service', componentId: 'air-filter', label: 'Air-filter inspection', action: 'inspect', category: 'fuel_and_intake', schedule: { type: 'recurring_distance', intervalKm: 3000 } });
    const v1 = { ...profile('synthetic-action-change', [v1Rule]), profileVersion: 'v1' };
    const v2Rule = { ...v1Rule, action: 'replace' as const, label: 'Air-filter replacement' };
    const v2 = { ...profile('synthetic-action-change', [v2Rule]), profileVersion: 'v2' };
    const task = taskAt(v2, 9_500, [event(v1Rule, {
      profileId: v1.id,
      profileVersion: v1.profileVersion,
      odometerKm: 9_000,
    })])[0];
    assert.equal(task.status, 'unknown_history');
    assert.equal(task.lastPerformedAtKm, null);
  });

  it('rejects old history when a stable rule ID changes component', () => {
    const v1Rule = rule({ id: 'air-filter-service', componentId: 'air-filter', label: 'Air-filter inspection', action: 'inspect', category: 'fuel_and_intake', schedule: { type: 'recurring_distance', intervalKm: 3000 } });
    const v1 = { ...profile('synthetic-component-change', [v1Rule]), profileVersion: 'v1' };
    const v2Rule = { ...v1Rule, componentId: 'intake-filter', label: 'Intake-filter inspection' };
    const v2 = { ...profile('synthetic-component-change', [v2Rule]), profileVersion: 'v2' };
    const task = taskAt(v2, 9_500, [event(v1Rule, {
      profileId: v1.id,
      profileVersion: v1.profileVersion,
      odometerKm: 9_000,
    })])[0];
    assert.equal(task.status, 'unknown_history');
    assert.equal(task.lastPerformedAtKm, null);
  });

  it('keeps used vehicles normal without reconstructing break-in, while new vehicles get one checkpoint', () => {
    const used = lifecyclePlan(vehicle(1, 'used', 400), motorcycleProfile);
    assert.equal(used.lifecycle, 'normal');
    assert.equal(used.firstServiceCheckpoint, null);
    assert.ok(used.tasks.some((task) => task.status === 'unknown_history'));

    const newVehicle = lifecyclePlan(vehicle(1, 'new', 400), motorcycleProfile);
    assert.equal(newVehicle.lifecycle, 'break_in');
    assert.equal(newVehicle.firstServiceCheckpoint?.milestoneKm, 300);
    assert.deepEqual(newVehicle.tasks, []);

    const afterWindow = lifecyclePlan(vehicle(1, 'new', 1001), motorcycleProfile);
    assert.equal(afterWindow.lifecycle, 'normal');
    assert.equal(afterWindow.firstServiceCheckpoint, null);
    assert.ok(afterWindow.tasks.every((task) => !task.isOneTime));
  });

  it('records generic maintenance for used and new vehicles without a lifecycle restriction', () => {
    const oil = motorcycleProfile.rules[0];
    for (const purchaseCondition of ['used', 'new'] as const) {
      const plan = lifecyclePlan(
        vehicle(1, purchaseCondition, 12_500),
        motorcycleProfile,
        [event(oil, { profileId: motorcycleProfile.id, profileVersion: motorcycleProfile.profileVersion, odometerKm: 12_450 })],
      );
      assert.equal(plan.lifecycle, 'normal');
      const oilTask = plan.tasks.find((candidate) => candidate.ruleId === oil.id);
      assert.equal(oilTask?.lastPerformedAtKm, 12_450);
      assert.equal(oilTask?.remainingKm, 4_950);
    }
  });

  it('does not reset anchors after a 50 km odometer update', () => {
    const oil = motorcycleProfile.rules[0];
    const changed = taskAt(motorcycleProfile, 12_500, [event(oil, { odometerKm: 12_450 })]).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(changed?.lastPerformedAtKm, 12_450);
    assert.equal(changed?.dueAtKm, 17_450);
    assert.equal(changed?.remainingKm, 4_950);

    const unknownRules = taskAt(motorcycleProfile, 12_500)
      .filter((candidate) => candidate.ruleId !== oil.id && candidate.scheduleType === 'recurring_distance');
    assert.ok(unknownRules.length > 0);
    assert.ok(unknownRules.every((candidate) => candidate.status === 'unknown_history' && candidate.dueAtKm === null && candidate.remainingKm === null));
  });

  it('crosses a known recurring due threshold without inventing a new baseline', () => {
    const oil = motorcycleProfile.rules[0];
    const due = taskAt(motorcycleProfile, 17_450, [event(oil, { odometerKm: 12_450 })]).find((candidate) => candidate.ruleId === oil.id);
    const overdue = taskAt(motorcycleProfile, 17_451, [event(oil, { odometerKm: 12_450 })]).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(due?.status, 'due');
    assert.equal(due?.remainingKm, 0);
    assert.equal(overdue?.status, 'overdue');
    assert.equal(overdue?.remainingKm, -1);
  });

  it('covers record edit and delete semantics through the projection input', () => {
    const oil = motorcycleProfile.rules[0];
    const original = event(oil, { id: 'oil-record', odometerKm: 12_000 });
    const edited = event(oil, { id: 'oil-record', odometerKm: 12_100 });
    const editedTask = taskAt(motorcycleProfile, 12_500, [edited]).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(editedTask?.dueAtKm, 17_100);
    const deletedTask = taskAt(motorcycleProfile, 12_500).find((candidate) => candidate.ruleId === oil.id);
    assert.equal(deletedTask?.status, 'unknown_history');
    assert.equal(original.id, edited.id);
  });
});
