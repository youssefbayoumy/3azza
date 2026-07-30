import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileMaintenancePlan } from './modelMaintenance';

test('model switching preserves baselines and user overrides while changing applicability', () => {
  const existing = [
    {
      id: 1,
      name: 'Engine Oil',
      interval_km: 750,
      canonical_task_id: 'engine-oil',
      user_interval_km: 750,
      user_override_active: 1,
      last_service_odometer_km: 4200,
      has_known_odometer_baseline: 1,
    },
    {
      id: 2,
      name: 'Old model-only task',
      interval_km: 3000,
      canonical_task_id: 'old-task',
      user_interval_km: null,
      last_service_odometer_km: 3900,
      has_known_odometer_baseline: 1,
    },
  ];
  const plan = reconcileMaintenancePlan(existing, [
    { canonicalId: 'engine-oil', name: 'Engine Oil', intervalKm: 1000, origin: '3azza_policy' },
    { canonicalId: 'new-task', name: 'New model task', intervalKm: 5000, origin: 'manual' },
  ]);

  assert.equal(plan.matched[0].effectiveIntervalKm, 750);
  assert.equal(plan.matched[0].origin, 'user_override');
  assert.deepEqual(plan.inactiveIds, [2]);
  assert.deepEqual(plan.added.map((item) => item.canonicalId), ['new-task']);
  assert.equal(existing[0].last_service_odometer_km, 4200);
  assert.equal(existing[0].has_known_odometer_baseline, 1);
});

test('legacy interval values are preserved because their edit provenance is unknown', () => {
  const plan = reconcileMaintenancePlan([
    {
      id: 7,
      name: 'Air Filter',
      interval_km: 1600,
      canonical_task_id: null,
      user_interval_km: null,
      last_service_odometer_km: 0,
      has_known_odometer_baseline: 0,
    },
  ], [{ canonicalId: 'air-filter', name: 'Air Filter', intervalKm: 1000, origin: 'manual' }]);
  assert.equal(plan.matched[0].effectiveIntervalKm, 1600);
  assert.equal(plan.matched[0].origin, 'user_override');
});

test('legacy display-name aliases migrate to stable canonical task IDs', () => {
  const plan = reconcileMaintenancePlan([
    {
      id: 9,
      name: 'Oil Change',
      interval_km: 900,
      canonical_task_id: null,
      last_service_odometer_km: 8000,
      has_known_odometer_baseline: 1,
    },
  ], [{ canonicalId: 'engine-oil', name: 'Engine Oil', intervalKm: 1000, origin: '3azza_policy' }]);
  assert.equal(plan.matched[0].existingId, 9);
  assert.equal(plan.matched[0].effectiveIntervalKm, 900);
  assert.deepEqual(plan.inactiveIds, []);
});
