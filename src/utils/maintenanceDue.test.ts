import assert from 'node:assert/strict';
import test from 'node:test';
import { getMaintenanceDueResult } from './maintenanceDue';

test('distance and time intervals use whichever comes first', () => {
  const timeFirst = getMaintenanceDueResult({
    currentMileage: 1200,
    intervalKm: 1000,
    intervalMonths: 3,
    lastServiceMileage: 1000,
    hasKnownMileageBaseline: true,
    lastServiceDate: '2026-01-01',
    now: new Date('2026-04-02T12:00:00Z'),
  });
  assert.equal(timeFirst.isDue, true);
  assert.equal(timeFirst.dueBy, 'time');

  const distanceFirst = getMaintenanceDueResult({
    currentMileage: 2000,
    intervalKm: 1000,
    intervalMonths: 12,
    lastServiceMileage: 1000,
    hasKnownMileageBaseline: true,
    lastServiceDate: '2026-01-01',
    now: new Date('2026-02-01T12:00:00Z'),
  });
  assert.equal(distanceFirst.isDue, true);
  assert.equal(distanceFirst.dueBy, 'distance');
});

test('missing baselines remain unknown instead of overdue', () => {
  const result = getMaintenanceDueResult({
    currentMileage: 5000,
    intervalKm: 1000,
    intervalMonths: 3,
    lastServiceMileage: 0,
    hasKnownMileageBaseline: false,
    lastServiceDate: null,
  });
  assert.equal(result.dueBy, 'unknown');
  assert.equal(result.isDue, false);
});
