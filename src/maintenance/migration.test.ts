import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ServiceLog } from '../types/database.types';
import { classifyStoredMaintenanceLog } from './migration';

function log(overrides: Partial<ServiceLog> = {}): ServiceLog {
  return {
    id: 7,
    vehicle_id: 1,
    title: 'Brake pads',
    date: '2026-08-01',
    mileage: 1000,
    category: 'brakes',
    notes: '',
    cost: null,
    service_type: 'Brake Pads',
    sets_odometer_baseline: 1,
    ...overrides,
  };
}

describe('maintenance history migration classification', () => {
  it('preserves a legacy component-name row without guessing a rule or action', () => {
    const result = classifyStoredMaintenanceLog(log({ maintenance_migration_status: 'legacy_needs_confirmation' }));
    assert.equal(result.status, 'legacy_needs_confirmation');
  });

  it('accepts only complete action-specific exact rows', () => {
    const result = classifyStoredMaintenanceLog(log({
      maintenance_migration_status: 'exact',
      maintenance_rule_id: 'brake-pads.inspect.recurring-1000km-1mo',
      maintenance_component_id: 'brake-pads',
      maintenance_action: 'inspect',
      maintenance_profile_id: 'profile-a',
      maintenance_profile_version: 'v1',
      inspection_result: 'replace_soon',
    }));
    assert.equal(result.status, 'exact');
    if (result.status === 'exact') {
      assert.equal(result.event.action, 'inspect');
      assert.equal(result.event.inspectionResult, 'replace_soon');
    }
  });

  it('downgrades malformed exact rows to confirmation instead of using them', () => {
    const result = classifyStoredMaintenanceLog(log({
      maintenance_migration_status: 'exact',
      maintenance_rule_id: 'some-rule',
    }));
    assert.equal(result.status, 'legacy_needs_confirmation');
  });
});
