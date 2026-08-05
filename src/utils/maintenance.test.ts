import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePredictedOdometer,
  countServiceWarnings,
  getIntervalProgress,
  getNextServiceProgress,
} from './maintenance';

describe('maintenance utilities', () => {
  it('predicts odometer from daily average and last update', () => {
    const now = new Date('2026-06-28T12:00:00.000Z').getTime();
    const result = computePredictedOdometer(
      {
        current_mileage: 1000,
        daily_average_km: 25,
        last_odometer_update_timestamp: '2026-06-26T12:00:00.000Z',
      },
      now
    );

    assert.equal(result.mileage, 1050);
    assert.equal(result.predictedAdded, 50);
  });

  it('classifies interval state consistently', () => {
    assert.equal(getIntervalProgress({ interval_km: null, last_service_odometer_km: 0 }, 900).status, 'manual');
    assert.equal(getIntervalProgress({ interval_km: 1000, last_service_odometer_km: 0 }, 1100).status, 'unknown');
    assert.equal(
      getIntervalProgress(
        { interval_km: 1000, last_service_odometer_km: 0, has_known_odometer_baseline: 1 },
        500
      ).status,
      'optimal'
    );
    assert.equal(
      getIntervalProgress(
        { interval_km: 1000, last_service_odometer_km: 500, has_known_odometer_baseline: 0 },
        600
      ).status,
      'unknown'
    );
    assert.equal(getIntervalProgress({ interval_km: 1000, last_service_odometer_km: 100 }, 1200).status, 'overdue');
    assert.equal(getIntervalProgress({ interval_km: 1000, last_service_odometer_km: 100 }, 1050).status, 'due-soon');
    assert.equal(getIntervalProgress({ interval_km: 1000, last_service_odometer_km: 100 }, 500).status, 'optimal');
  });

  it('counts due and overdue service warnings', () => {
    const count = countServiceWarnings(
      [
        { interval_km: 1000, last_service_odometer_km: 100 },
        { interval_km: 5000, last_service_odometer_km: 0 },
        { interval_km: null, last_service_odometer_km: 0 },
      ],
      1050
    );

    assert.equal(count, 1);
  });

  it('uses the shared 10% and 200 km due-soon boundaries', () => {
    const longInterval = { interval_km: 5000, last_service_odometer_km: 1000 };
    assert.equal(getIntervalProgress(longInterval, 5500).status, 'due-soon');
    assert.equal(getIntervalProgress(longInterval, 5499).status, 'optimal');

    const absoluteBoundary = { interval_km: 1000, last_service_odometer_km: 1000 };
    assert.equal(getIntervalProgress(absoluteBoundary, 1800).status, 'due-soon');
    assert.equal(getIntervalProgress(absoluteBoundary, 1799).status, 'optimal');
  });

  it('calibrates the dashboard gauge to the nearest known service interval', () => {
    const nextService = getNextServiceProgress(
      [
        {
          name: 'Oil Change',
          canonical_task_id: 'engine-oil',
          interval_km: 1000,
          last_service_odometer_km: 17000,
          has_known_odometer_baseline: 1,
        },
        {
          name: 'Gearbox Oil Change',
          interval_km: 3000,
          last_service_odometer_km: 16000,
          has_known_odometer_baseline: 1,
        },
      ],
      17976
    );

    assert.deepEqual(nextService, {
      name: 'Oil Change',
      canonicalTaskId: 'engine-oil',
      progressPct: 97.6,
      remainingKm: 24,
      status: 'due-soon',
    });
  });

  it('ignores manual and unknown intervals when selecting gauge progress', () => {
    assert.equal(
      getNextServiceProgress(
        [
          { name: 'Manual', interval_km: null, last_service_odometer_km: 0 },
          { name: 'Unknown', interval_km: 1000, last_service_odometer_km: 0 },
        ],
        500
      ),
      null
    );
  });
});
