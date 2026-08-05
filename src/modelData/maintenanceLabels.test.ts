import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCanonicalTaskLabel } from './maintenanceLabels';

describe('getCanonicalTaskLabel', () => {
  it('maps a canonical id to one label regardless of the raw manual name', () => {
    assert.equal(getCanonicalTaskLabel('drive-belt', 'Drive Belt/Roller'), 'Drive belt & rollers');
    assert.equal(getCanonicalTaskLabel('drive-belt', 'Drive Belt, Roller, Drive Pulley'), 'Drive belt & rollers');
    assert.equal(getCanonicalTaskLabel('fuel-pump-filter', 'Fuel-Pump Filter'), 'Fuel-pump filter');
    assert.equal(getCanonicalTaskLabel('spark-plug', 'Spark Plugs'), 'Spark plug');
  });

  it('normalises legacy seed rows once they carry a canonical id', () => {
    assert.equal(getCanonicalTaskLabel('drive-belt', 'CVT & Pull Rollers'), 'Drive belt & rollers');
    assert.equal(getCanonicalTaskLabel('engine-oil', 'Oil Change'), 'Engine oil');
  });

  it('falls back to the stored name for uncurated or unreconciled tasks', () => {
    assert.equal(getCanonicalTaskLabel('valve-clearance', 'Valve Clearance'), 'Valve Clearance');
    assert.equal(getCanonicalTaskLabel(null, 'Carburetor'), 'Carburetor');
    assert.equal(getCanonicalTaskLabel(undefined, 'Cleaning'), 'Cleaning');
  });

  it('never returns an empty label', () => {
    assert.equal(getCanonicalTaskLabel(null, null), 'Maintenance task');
    assert.equal(getCanonicalTaskLabel('unknown-id', '   '), 'Maintenance task');
  });
});
