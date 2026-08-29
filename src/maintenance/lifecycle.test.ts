import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import profileJson from '../../maintenance-data/new-symphony-st-200.profile.json';
import type { MaintenanceHistoryState, VehicleProfile } from '../types/database.types';
import type { MaintenanceEvent, MaintenanceTaskProjection, ScooterMaintenanceProfile } from './types';
import { projectVehicleMaintenance } from './lifecycle';

const profile = profileJson as ScooterMaintenanceProfile;
const maybeOilRule = profile.rules.find((rule) => (
  rule.componentId === 'engine-oil'
  && rule.action === 'replace'
  && rule.schedule.type !== 'one_time_initial'
));
if (!maybeOilRule) throw new Error('Oil rule fixture is missing');
const oilRule = maybeOilRule;

function vehicle(
  purchaseCondition: VehicleProfile['purchase_condition'],
  currentMileage: number
): VehicleProfile {
  return {
    id: 1,
    name: 'Scooter',
    current_mileage: currentMileage,
    total_km_range: 0,
    has_completed_setup: 1,
    service_history_setup_completed: 0,
    maintenance_history_level: 'not_asked',
    created_at: '2026-08-01T00:00:00.000Z',
    daily_average_km: 0,
    last_odometer_update_timestamp: '2026-08-01T00:00:00.000Z',
    tank_capacity_liters: null,
    scooter_brand_id: 'sym',
    scooter_model_id: 'sym:new-symphony-st',
    scooter_version_id: 'sym:new-symphony-st:2021-present',
    vehicle_selection_mode: 'catalog',
    custom_brand_name: null,
    custom_model_name: null,
    vehicle_capabilities_version: 1,
    vehicle_capabilities_json: '{}',
    purchase_condition: purchaseCondition,
    maintenance_started_at: '2026-08-01T00:00:00.000Z',
  };
}

function event(odometerKm: number): MaintenanceEvent {
  return {
    id: `oil-${odometerKm}`,
    vehicleId: 1,
    profileId: profile.id,
    profileVersion: profile.profileVersion,
    ruleId: oilRule.id,
    componentId: oilRule.componentId,
    action: oilRule.action,
    performedOn: '2026-08-01',
    odometerKm,
    mileageConfidence: 'confirmed',
    dateConfidence: 'confirmed',
    migrationConfidence: 'exact',
  };
}

function plan(input: {
  vehicle: VehicleProfile;
  events?: MaintenanceEvent[];
  historyStates?: MaintenanceHistoryState[];
}) {
  return projectVehicleMaintenance({
    vehicle: input.vehicle,
    profile,
    events: input.events ?? [],
    preferences: [],
    historyStates: input.historyStates ?? [],
    now: new Date('2026-08-27T00:00:00.000Z'),
  });
}

describe('vehicle maintenance lifecycle', () => {
  it('isolates the first-service checkpoint to a scooter bought new', () => {
    const newPlan = plan({ vehicle: vehicle('new', 100) });
    const usedPlan = plan({ vehicle: vehicle('used', 100) });

    assert.equal(newPlan.lifecycle, 'break_in');
    assert.equal(newPlan.firstServiceCheckpoint?.milestoneKm, 300);
    assert.deepEqual(newPlan.tasks, []);
    assert.equal(usedPlan.lifecycle, 'normal');
    assert.equal(usedPlan.firstServiceCheckpoint, null);
  });

  it('retires break-in after completion or the configured cutoff', () => {
    const completedStates: MaintenanceHistoryState[] = profile.rules
      .filter((rule) => rule.applicable && rule.schedule.type === 'one_time_initial')
      .map((rule) => ({
        vehicle_id: 1,
        profile_id: profile.id,
        component_id: rule.componentId,
        action: rule.action,
        history_state: 'confirmed',
        last_service_log_id: 1,
        notes: null,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
      }));

    assert.equal(plan({ vehicle: vehicle('new', 400), historyStates: completedStates }).lifecycle, 'normal');
    assert.equal(plan({ vehicle: vehicle('new', 1001) }).lifecycle, 'normal');
    assert.ok(plan({ vehicle: vehicle('new', 1001) }).tasks.every((task) => !task.isOneTime));
  });

  it('keeps Home-facing lifecycle state aligned across the first-service cutoff without hiding genuine overdue work', () => {
    const activeBreakIn = plan({ vehicle: vehicle('new', 300) });
    assert.equal(activeBreakIn.lifecycle, 'break_in');
    assert.equal(activeBreakIn.firstServiceCheckpoint?.milestoneKm, 300);

    const afterCutoff = plan({
      vehicle: vehicle('new', 1001),
      events: [event(0)],
    });
    const overdueOil = afterCutoff.tasks.find((task) => task.ruleId === oilRule.id);

    assert.equal(afterCutoff.lifecycle, 'normal');
    assert.equal(afterCutoff.firstServiceCheckpoint, null);
    assert.ok(afterCutoff.tasks.every((task) => !task.isOneTime));
    assert.equal(overdueOil?.status, 'overdue');
    assert.equal(overdueOil?.remainingKm, -1);
  });

  it('keeps high-mileage used and migrated-unknown history unanchored', () => {
    const legacyNeverDone: MaintenanceHistoryState = {
      vehicle_id: 1,
      profile_id: profile.id,
      component_id: oilRule.componentId,
      action: oilRule.action,
      history_state: 'never_done',
      last_service_log_id: null,
      notes: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    };

    for (const condition of ['used', 'unknown'] as const) {
      const oilTask: MaintenanceTaskProjection | undefined = plan({
        vehicle: vehicle(condition, 50_000),
        historyStates: [legacyNeverDone],
      }).tasks.find((task) => task.ruleId === oilRule.id);
      assert.equal(oilTask?.status, 'unknown_history');
      assert.equal(oilTask?.dueAtKm, null);
      assert.equal(oilTask?.remainingKm, null);
    }
  });

  it('uses the latest exact action record and never resets it on an odometer update', () => {
    const before = plan({ vehicle: vehicle('used', 12_450), events: [event(12_000)] });
    const beforeOil = before.tasks.find((task) => task.ruleId === oilRule.id);
    assert.equal(beforeOil?.dueAtKm, 13_000);
    assert.equal(beforeOil?.remainingKm, 550);

    const afterFifty = plan({ vehicle: vehicle('used', 12_500), events: [event(12_000)] });
    assert.equal(afterFifty.tasks.find((task) => task.ruleId === oilRule.id)?.remainingKm, 500);

    const changedNow = plan({ vehicle: vehicle('used', 12_500), events: [event(12_450)] });
    const changedOil = changedNow.tasks.find((task) => task.ruleId === oilRule.id);
    assert.equal(changedOil?.dueAtKm, 13_450);
    assert.equal(changedOil?.remainingKm, 950);
    assert.ok(changedNow.tasks.some((task) => task.status === 'unknown_history'));
  });

  it('accepts an exact normal-maintenance record for used and new scooters after break-in', () => {
    for (const purchaseCondition of ['used', 'new'] as const) {
      const projected = plan({
        vehicle: vehicle(purchaseCondition, 12_500),
        events: [event(12_450)],
      });
      const oil = projected.tasks.find((task) => task.ruleId === oilRule.id);
      assert.equal(projected.lifecycle, 'normal');
      assert.equal(oil?.dueAtKm, 13_450);
      assert.equal(oil?.remainingKm, 950);
    }
  });

  it('recalculates only from the records that remain after edit or deletion', () => {
    const original = event(12_000);
    const edited = { ...event(12_100), id: original.id };
    const currentVehicle = vehicle('used', 12_500);

    assert.equal(
      plan({ vehicle: currentVehicle, events: [edited] }).tasks
        .find((task) => task.ruleId === oilRule.id)?.dueAtKm,
      13_100
    );
    assert.equal(
      plan({ vehicle: currentVehicle, events: [original, event(12_300)] }).tasks
        .find((task) => task.ruleId === oilRule.id)?.dueAtKm,
      13_300
    );
    assert.equal(
      plan({ vehicle: currentVehicle, events: [original] }).tasks
        .find((task) => task.ruleId === oilRule.id)?.dueAtKm,
      13_000
    );
    assert.equal(
      plan({ vehicle: currentVehicle }).tasks
        .find((task) => task.ruleId === oilRule.id)?.status,
      'unknown_history'
    );
  });
});
