import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CUSTOM_MODEL_ID, CUSTOM_VERSION_ID, OTHER_BRAND_ID } from '../catalog/scooterCatalog';
import { createVehicleCreationGuard, prepareVehicleCreation } from './vehicleCreation';

const labels = { startingOdometer: 'Starting odometer' };
const customSelection = {
  selectionMode: 'custom_brand' as const,
  brandId: OTHER_BRAND_ID,
  modelId: CUSTOM_MODEL_ID,
  versionId: CUSTOM_VERSION_ID,
  customBrandName: 'Keeway',
  customModelName: 'RKS 150',
};

describe('vehicle creation', () => {
  it('prepares only a complete, valid vehicle draft', () => {
    assert.equal(prepareVehicleCreation({
      name: '  Delivery bike  ',
      mileage: '0',
      purchaseCondition: 'used',
      selection: customSelection,
    }, labels)?.name, 'Delivery bike');

    assert.equal(prepareVehicleCreation({
      name: 'Delivery bike',
      mileage: '12.5',
      purchaseCondition: 'used',
      selection: customSelection,
    }, labels), null);

    assert.equal(prepareVehicleCreation({
      name: 'Delivery bike',
      mileage: '12',
      purchaseCondition: 'new',
      selection: { ...customSelection, customModelName: '' },
    }, labels), null);

    assert.equal(prepareVehicleCreation({
      name: 'Delivery bike',
      mileage: '12',
      purchaseCondition: null,
      selection: customSelection,
    }, labels), null);
  });

  it('admits only one in-flight create request and releases after completion', () => {
    const guard = createVehicleCreationGuard();

    assert.equal(guard.tryStart(), true);
    assert.equal(guard.isCreating(), true);
    assert.equal(guard.tryStart(), false);

    guard.finish();

    assert.equal(guard.isCreating(), false);
    assert.equal(guard.tryStart(), true);
  });
});
