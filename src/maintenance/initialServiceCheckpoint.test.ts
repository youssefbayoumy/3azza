import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import profileJson from '../../maintenance-data/new-symphony-st-200.profile.json';
import type { MaintenanceHistoryState } from '../types/database.types';
import type { ScooterMaintenanceProfile } from './types';
import { getInitialServiceCheckpoint } from './initialServiceCheckpoint';

const profile = profileJson as ScooterMaintenanceProfile;

function states(value: MaintenanceHistoryState['history_state']): MaintenanceHistoryState[] {
  return profile.rules.filter((rule) => rule.applicable && rule.schedule.type === 'one_time_initial').map((rule) => ({
    vehicle_id: 1,
    profile_id: profile.id,
    component_id: rule.componentId,
    action: rule.action,
    history_state: value,
    last_service_log_id: null,
    notes: null,
    created_at: '2026-08-21T00:00:00.000Z',
    updated_at: '2026-08-21T00:00:00.000Z',
  }));
}

describe('initial service checkpoint', () => {
  it('groups the full first-service milestone as one new-scooter checkpoint', () => {
    const checkpoint = getInitialServiceCheckpoint({ profile, currentOdometerKm: 400, historyStates: [] });
    assert.equal(checkpoint?.milestoneKm, 300);
    assert.equal(checkpoint?.actions.length, 23);
    assert.equal(checkpoint?.status, 'overdue');
  });

  it('becomes one overdue package only after the owner says it was not done', () => {
    const checkpoint = getInitialServiceCheckpoint({ profile, currentOdometerKm: 400, historyStates: states('never_done') });
    assert.equal(checkpoint?.status, 'overdue');
    assert.equal(checkpoint?.remainingKm, -100);
  });

  it('does not reinterpret the new-owner checkpoint from unknown history rows', () => {
    assert.equal(getInitialServiceCheckpoint({ profile, currentOdometerKm: 400, historyStates: states('unknown') })?.status, 'overdue');
    assert.equal(getInitialServiceCheckpoint({ profile, currentOdometerKm: 1001, historyStates: [] }), null);
  });

  it('closes after every milestone action is confirmed', () => {
    assert.equal(getInitialServiceCheckpoint({ profile, currentOdometerKm: 400, historyStates: states('confirmed') }), null);
  });

});
