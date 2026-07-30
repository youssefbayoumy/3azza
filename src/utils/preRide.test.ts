import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PreRideState } from '../types/database.types';
import { resetPreRideStateForNewLocalDay } from './preRide';

const savedState: PreRideState = {
  id: 7,
  vehicle_id: 3,
  brakes_checked: 1,
  tires_checked: 1,
  lights_checked: 0,
  oil_checked: 1,
  last_run_at: '2026-07-24T08:00:00.000Z',
};

describe('daily pre-ride state', () => {
  it('keeps a saved check for the same local calendar day', () => {
    const now = new Date(2026, 6, 24, 20);

    assert.equal(resetPreRideStateForNewLocalDay(savedState, now), savedState);
  });

  it('clears every check and completion timestamp on the next local day', () => {
    const nextDay = new Date(2026, 6, 25, 0, 1);

    assert.deepEqual(resetPreRideStateForNewLocalDay(savedState, nextDay), {
      ...savedState,
      brakes_checked: 0,
      tires_checked: 0,
      lights_checked: 0,
      oil_checked: 0,
      last_run_at: null,
    });
  });
});
