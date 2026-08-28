import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computePredictedOdometer } from './maintenance';

describe('odometer prediction utility', () => {
  it('predicts a display-only odometer from daily average and last update', () => {
    const now = new Date('2026-06-28T12:00:00.000Z').getTime();
    const result = computePredictedOdometer({
      current_mileage: 1000,
      daily_average_km: 25,
      last_odometer_update_timestamp: '2026-06-26T12:00:00.000Z',
    }, now);

    assert.deepEqual(result, { mileage: 1050, predictedAdded: 50, diffDays: 2 });
  });

  it('does not invent distance without a valid average and timestamp', () => {
    assert.deepEqual(
      computePredictedOdometer({ current_mileage: 1000, daily_average_km: 0 }),
      { mileage: 1000, predictedAdded: 0, diffDays: 0 }
    );
  });
});
