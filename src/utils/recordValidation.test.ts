import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getInventoryStatus,
  parseDecimalNumberInput,
  parseWholeNumberInput,
  parseVehicleVitalInput,
  validateInventoryQuantity,
  validateOdometerReading,
  validateRecordedOdometer,
  validateVehicleVital,
  validateWholeNumber,
} from './recordValidation';

describe('record validation', () => {
  it('parses only complete safe whole-number input', () => {
    assert.deepEqual(parseWholeNumberInput(' 120 ', { label: 'Reading' }), { ok: true, value: 120 });
    assert.equal(parseWholeNumberInput('', { label: 'Reading' }).ok, false);
    assert.equal(parseWholeNumberInput('-1', { label: 'Reading' }).ok, false);
    assert.equal(parseWholeNumberInput('1.5', { label: 'Reading' }).ok, false);
    assert.equal(parseWholeNumberInput('12km', { label: 'Reading' }).ok, false);
    assert.equal(parseWholeNumberInput(String(Number.MAX_SAFE_INTEGER + 1), { label: 'Reading' }).ok, false);
  });

  it('enforces inclusive numeric domains', () => {
    assert.equal(validateWholeNumber(0, { label: 'Quantity', min: 0 }), null);
    assert.match(validateWholeNumber(-1, { label: 'Quantity', min: 0 }) ?? '', /less than 0/);
    assert.equal(validateWholeNumber(100, { label: 'Percent', min: 0, max: 100 }), null);
    assert.match(validateWholeNumber(101, { label: 'Percent', min: 0, max: 100 }) ?? '', /more than 100/);
  });

  it('parses complete decimal input without JavaScript coercion shortcuts', () => {
    assert.deepEqual(parseDecimalNumberInput(' 45.5 ', { label: 'Fuel amount' }), { ok: true, value: 45.5 });
    assert.deepEqual(parseDecimalNumberInput('.5', { label: 'Fuel amount' }), { ok: true, value: 0.5 });
    assert.equal(parseDecimalNumberInput('', { label: 'Fuel amount' }).ok, false);
    assert.equal(parseDecimalNumberInput('1e2', { label: 'Fuel amount' }).ok, false);
    assert.equal(parseDecimalNumberInput('12L', { label: 'Fuel amount' }).ok, false);
    assert.equal(parseDecimalNumberInput('-1', { label: 'Fuel amount' }).ok, false);
  });

  it('prevents odometer rollback while allowing equal or higher confirmation', () => {
    assert.match(validateOdometerReading(50, 120) ?? '', /less than 120/);
    assert.equal(validateOdometerReading(120, 120), null);
    assert.equal(validateOdometerReading(121, 120), null);
  });

  it('prevents records from exceeding the confirmed vehicle odometer', () => {
    assert.equal(validateRecordedOdometer(1200, 1200), null);
    assert.equal(validateRecordedOdometer(1000, 1200), null);
    assert.match(validateRecordedOdometer(1201, 1200) ?? '', /Update the vehicle odometer first/);
    assert.match(validateRecordedOdometer(-1, 1200) ?? '', /cannot be less than 0/);
  });

  it('accepts only non-negative whole inventory quantities and derives status', () => {
    assert.match(validateInventoryQuantity(-1) ?? '', /less than 0/);
    assert.match(validateInventoryQuantity(1.5) ?? '', /whole number/);
    assert.equal(validateInventoryQuantity(0), null);
    assert.equal(getInventoryStatus(0), 'Out');
    assert.equal(getInventoryStatus(1), 'Low');
    assert.equal(getInventoryStatus(2), 'In Stock');
  });

  it('keeps percentage readings within 0–100 and other manual readings non-negative', () => {
    const oilResult = parseVehicleVitalInput('oil_life_pct', '150');
    assert.equal(oilResult.ok, false);
    if (!oilResult.ok) assert.match(oilResult.message, /more than 100/);
    assert.match(validateVehicleVital('battery_health_pct', -1) ?? '', /less than 0/);
    assert.match(validateVehicleVital('brake_pad_pct', 100.5) ?? '', /whole number/);
    assert.match(validateVehicleVital('tire_pressure_psi', -1) ?? '', /less than 0/);
    assert.equal(validateVehicleVital('coolant_temp_c', 95), null);
    assert.equal(validateVehicleVital('oil_life_pct', 100), null);
  });
});
