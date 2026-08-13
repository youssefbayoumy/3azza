import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeVehicleCapabilities,
  parseVehicleCapabilities,
  serializeVehicleCapabilities,
  UNKNOWN_VEHICLE_CAPABILITIES,
  vehicleCapabilitiesAreUnknown,
  vehicleCapabilitiesFromUnknown,
} from './vehicleCapabilities';

describe('vehicle capabilities', () => {
  it('normalizes missing answers to an inclusive unknown profile', () => {
    const capabilities = normalizeVehicleCapabilities(undefined);
    assert.deepEqual(capabilities, UNKNOWN_VEHICLE_CAPABILITIES);
    assert.equal(vehicleCapabilitiesAreUnknown(capabilities), true);
  });

  it('round-trips a valid versioned capability profile', () => {
    const source = {
      schemaVersion: 1 as const,
      powertrain: 'electric' as const,
      transmission: 'automatic_other' as const,
      finalDrive: 'integrated' as const,
      cooling: 'air' as const,
      brakeSystem: 'disc' as const,
      abs: 'yes' as const,
      wheelType: 'cast' as const,
    };
    assert.deepEqual(parseVehicleCapabilities(serializeVehicleCapabilities(source)), source);
    assert.equal(vehicleCapabilitiesAreUnknown(source), false);
  });

  it('rejects malformed, incomplete, and future-version serialized profiles', () => {
    assert.equal(vehicleCapabilitiesFromUnknown({ schemaVersion: 1, powertrain: 'electric' }), null);
    assert.equal(vehicleCapabilitiesFromUnknown({
      ...UNKNOWN_VEHICLE_CAPABILITIES,
      schemaVersion: 2,
    }), null);
    assert.deepEqual(parseVehicleCapabilities('{bad json'), UNKNOWN_VEHICLE_CAPABILITIES);
    assert.deepEqual(parseVehicleCapabilities(JSON.stringify({
      ...UNKNOWN_VEHICLE_CAPABILITIES,
      transmission: 'teleport',
    })), UNKNOWN_VEHICLE_CAPABILITIES);
  });
});
