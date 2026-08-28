import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTaskTracked } from './scheduler';
import type { MaintenanceAction, MaintenanceEvent, VehicleMaintenancePreference } from './types';

const task = (componentId: string, action: MaintenanceAction = 'replace') => ({
  ruleId: `${componentId}.${action}`,
  componentId,
  action,
});

const event = (componentId: string, action: MaintenanceAction = 'replace'): MaintenanceEvent => ({
  id: 'event-1',
  vehicleId: 1,
  profileId: 'profile',
  profileVersion: '1',
  ruleId: 'rule',
  componentId,
  action,
  performedOn: '2026-01-01',
  odometerKm: 1000,
} as MaintenanceEvent);

const preference = (
  componentId: string,
  tracked: boolean | null,
  action: MaintenanceAction = 'replace'
): VehicleMaintenancePreference => ({
  vehicleId: 1,
  componentId,
  action,
  tracked,
  intervalSource: 'profile_default',
  changedAt: '2026-01-01',
} as VehicleMaintenancePreference);

describe('isTaskTracked (opt-in service tracking)', () => {
  it('tracks an explicit profile default with no preference or history', () => {
    assert.equal(isTaskTracked(task('engine-oil'), {
      events: [],
      defaultTrackedRuleIds: ['engine-oil.replace'],
    }), true);
  });

  it('leaves other services untracked by default', () => {
    assert.equal(isTaskTracked(task('gear-oil'), { events: [] }), false);
  });

  it('tracks a service the user explicitly added', () => {
    assert.equal(
      isTaskTracked(task('gear-oil'), { events: [], preferences: [preference('gear-oil', true)], vehicleId: 1 }),
      true
    );
  });

  it('auto-tracks a service the first time a record is logged for it', () => {
    assert.equal(isTaskTracked(task('cvt-drive'), { events: [event('cvt-drive')], vehicleId: 1 }), true);
  });

  it('stop-tracking wins over a logged event', () => {
    assert.equal(
      isTaskTracked(task('cvt-drive'), {
        events: [event('cvt-drive')],
        preferences: [preference('cvt-drive', false)],
        vehicleId: 1,
      }),
      false
    );
  });

  it('stop-tracking wins over a profile default', () => {
    assert.equal(
      isTaskTracked(task('engine-oil'), {
        events: [],
        preferences: [preference('engine-oil', false)],
        vehicleId: 1,
        defaultTrackedRuleIds: ['engine-oil.replace'],
      }),
      false
    );
  });

  it('scopes preferences and events to the active vehicle', () => {
    const otherVehicleEvent = { ...event('cvt-drive'), vehicleId: 2 } as MaintenanceEvent;
    assert.equal(isTaskTracked(task('cvt-drive'), { events: [otherVehicleEvent], vehicleId: 1 }), false);
  });
});
