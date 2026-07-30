import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocumentItem, ServiceInterval, VehicleProfile } from '../types/database.types';
import { buildMaintenanceReminderPlan, MAINTENANCE_REMINDER_IDS } from './reminderPlan';

const profile: VehicleProfile = {
  id: 1,
  name: 'Primary',
  current_mileage: 1000,
  total_km_range: 0,
  has_completed_setup: 1,
  service_history_setup_completed: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  daily_average_km: 0,
  last_odometer_update_timestamp: null,
  tank_capacity_liters: null,
  scooter_brand_id: 'sym',
  scooter_model_id: 'sym:new-symphony-st',
  scooter_version_id: 'sym:new-symphony-st:2021-present',
};

function interval(overrides: Partial<ServiceInterval> = {}): ServiceInterval {
  return {
    id: 1,
    vehicle_id: 1,
    name: 'Oil Change',
    interval_km: 1000,
    last_service_odometer_km: 0,
    has_known_odometer_baseline: 1,
    type: 'replace',
    ...overrides,
  };
}

function document(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 1,
    vehicle_id: 1,
    title: 'Registration',
    image_uri: 'file:///registration.jpg',
    expiry_date: '2026-08-01',
    added_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('maintenance reminder plan', () => {
  const now = new Date(2026, 6, 24, 12);

  it('always plans one pre-ride reminder with a stable identifier', () => {
    const plan = buildMaintenanceReminderPlan(profile, [], [], now);

    assert.deepEqual(plan.map((item) => item.identifier), [MAINTENANCE_REMINDER_IDS.preRide]);
  });

  it('plans current service and document attention with exact counts', () => {
    const plan = buildMaintenanceReminderPlan(
      profile,
      [interval(), interval({ id: 2, name: 'Brakes', last_service_odometer_km: 100 })],
      [document(), document({ id: 2, expiry_date: '2026-07-23' }), document({ id: 3, expiry_date: null })],
      now
    );

    assert.equal(plan.find((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service)?.title, '2 service items need attention');
    assert.equal(plan.find((item) => item.identifier === MAINTENANCE_REMINDER_IDS.documents)?.title, '2 documents need attention');
    assert.equal(new Set(plan.map((item) => item.identifier)).size, plan.length);
  });

  it('removes stale service attention after a completion advances its baseline', () => {
    const before = buildMaintenanceReminderPlan(profile, [interval()], [], now);
    const after = buildMaintenanceReminderPlan(
      profile,
      [interval({ last_service_odometer_km: 1000 })],
      [],
      now
    );

    assert.ok(before.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
    assert.ok(!after.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
  });

  it('adds attention when a confirmed or predicted odometer reaches the due window', () => {
    const before = buildMaintenanceReminderPlan(
      { ...profile, current_mileage: 700 },
      [interval({ last_service_odometer_km: 0 })],
      [],
      now
    );
    const after = buildMaintenanceReminderPlan(profile, [interval({ last_service_odometer_km: 0 })], [], now);

    assert.ok(!before.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
    assert.ok(after.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
  });

  it('adds attention when the manual time interval is due before the distance interval', () => {
    const plan = buildMaintenanceReminderPlan(
      { ...profile, current_mileage: 100 },
      [interval({
        interval_km: 10000,
        last_service_odometer_km: 100,
        recommended_interval_months: 6,
        last_service_date: '2026-01-30',
      })],
      [],
      now
    );

    assert.ok(plan.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
  });

  it('does not add time attention without an honest service-date baseline', () => {
    const plan = buildMaintenanceReminderPlan(
      { ...profile, current_mileage: 100 },
      [interval({
        interval_km: 10000,
        last_service_odometer_km: 100,
        recommended_interval_months: 6,
        last_service_date: null,
      })],
      [],
      now
    );

    assert.ok(!plan.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
  });
});
