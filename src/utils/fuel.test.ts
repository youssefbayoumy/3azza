import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GasLog } from '../types/database.types';
import { calculateFuelSummary, validateFuelLogFields, validateTankCapacityLiters } from './fuel';

function log(overrides: Partial<GasLog>): GasLog {
  return {
    id: 1,
    vehicle_id: 1,
    liters: 5,
    cost: 100,
    odometer_km: 100,
    station: null,
    logged_at: '2026-07-24T08:00:00.000Z',
    logged_on: '2026-07-24',
    is_full_tank: 0,
    ...overrides,
  };
}

describe('fuel calculations', () => {
  it('stays unavailable until two full-tank fills establish a segment', () => {
    const summary = calculateFuelSummary([
      log({ id: 1, is_full_tank: 1, odometer_km: 100, logged_on: '2026-07-01' }),
      log({ id: 2, is_full_tank: 0, odometer_km: 160, logged_on: '2026-07-02' }),
    ], 10);

    assert.equal(summary.averageKmPerLiter, null);
    assert.equal(summary.estimatedRangeKm, null);
  });

  it('includes partial fills between consecutive full-tank endpoints', () => {
    const summary = calculateFuelSummary([
      log({ id: 1, is_full_tank: 1, odometer_km: 100, logged_on: '2026-07-01', liters: 6 }),
      log({ id: 2, is_full_tank: 0, odometer_km: 160, logged_on: '2026-07-03', liters: 2 }),
      log({ id: 3, is_full_tank: 1, odometer_km: 220, logged_on: '2026-07-05', liters: 4 }),
    ], 10);

    assert.equal(summary.samples.length, 1);
    assert.deepEqual(summary.samples[0], {
      fromLogId: 1,
      toLogId: 3,
      distanceKm: 120,
      liters: 6,
      kmPerLiter: 20,
    });
    assert.equal(summary.estimatedRangeKm, 200);
  });

  it('orders historical entries by their recorded fill date and skips invalid distance segments', () => {
    const summary = calculateFuelSummary([
      log({ id: 3, is_full_tank: 1, odometer_km: 300, logged_on: '2026-07-03' }),
      log({ id: 1, is_full_tank: 1, odometer_km: 100, logged_on: '2026-07-01' }),
      log({ id: 2, is_full_tank: 1, odometer_km: 100, logged_on: '2026-07-02' }),
    ], null);

    assert.equal(summary.samples.length, 1);
    assert.equal(summary.samples[0].fromLogId, 2);
    assert.equal(summary.samples[0].toLogId, 3);
    assert.equal(summary.latestKmPerLiter, 40);
    assert.equal(summary.estimatedRangeKm, null);
  });

  it('validates the required fuel and capacity domains', () => {
    assert.equal(validateTankCapacityLiters(null), null);
    assert.match(validateTankCapacityLiters(0) ?? '', /positive/);
    assert.equal(validateFuelLogFields(log({ is_full_tank: 1 })), null);
    assert.match(validateFuelLogFields(log({ logged_on: '2026-02-30' })) ?? '', /date/);
  });
});
