import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CUSTOM_MODEL_ID, CUSTOM_VERSION_ID, OTHER_BRAND_ID } from '../catalog/customVehicleIdentity';
import {
  getMaintenanceProfileForSelection,
  getSelectableMaintenanceProfiles,
  NEW_SYMPHONY_ST_200_PROFILE,
  UNIVERSAL_MAINTENANCE_CATALOGUE,
} from './profiles';
import { projectMaintenanceTasks } from './scheduler';
import {
  getUniversalCustomMaintenanceProfile,
  UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE,
  UNIVERSAL_CUSTOM_PROFILE_ID,
} from './universalProfile';

describe('universal custom-vehicle maintenance profile', () => {
  it('resolves only for the complete Other-brand sentinel identity', () => {
    assert.equal(getMaintenanceProfileForSelection({
      brandId: OTHER_BRAND_ID,
      modelId: CUSTOM_MODEL_ID,
      versionId: CUSTOM_VERSION_ID,
    }), UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE);
    assert.equal(getMaintenanceProfileForSelection({
      brandId: OTHER_BRAND_ID,
      modelId: CUSTOM_MODEL_ID,
      versionId: null,
    }), null);
  });

  it('makes every catalogue action trackable without supplying a fixed value', () => {
    const expectedActions = UNIVERSAL_MAINTENANCE_CATALOGUE.components.reduce(
      (count, component) => count + component.allowedActions.length,
      0
    );
    assert.equal(UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE.rules.length, expectedActions);

    for (const component of UNIVERSAL_MAINTENANCE_CATALOGUE.components) {
      for (const action of component.allowedActions) {
        const rule = UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE.rules.find((candidate) =>
          candidate.componentId === component.id && candidate.action === action
        );
        assert.ok(rule, `Missing universal rule for ${component.id}:${action}`);
        assert.equal(rule.applicable, true);
        assert.deepEqual(rule.schedule, { type: 'manual_only_or_no_fixed_interval' });
        assert.equal(rule.profileRecommendedIntervalKm, undefined);
      }
    }
  });

  it('includes both scooter CVT and motorcycle drive-chain tracking', () => {
    const componentIds = new Set(UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE.rules.map((rule) => rule.componentId));
    assert.equal(componentIds.has('drive-belt-rollers'), true);
    assert.equal(componentIds.has('drive-chain-sprockets'), true);
  });

  it('filters a four-stroke CVT scooter without inventing any intervals', () => {
    const profile = getUniversalCustomMaintenanceProfile({
      schemaVersion: 1,
      powertrain: 'four_stroke',
      transmission: 'cvt',
      finalDrive: 'integrated',
      cooling: 'liquid',
      brakeSystem: 'disc',
      abs: 'yes',
      wheelType: 'cast',
    });
    const ids = new Set(profile.rules.map((rule) => rule.componentId));
    for (const expected of ['engine-oil', 'drive-belt-rollers', 'coolant', 'abs-system']) {
      assert.equal(ids.has(expected), true, `${expected} should be available`);
    }
    for (const excluded of ['manual-clutch', 'drive-chain-sprockets', 'two-stroke-oil-system', 'traction-battery', 'drum-brakes', 'spokes-rims']) {
      assert.equal(ids.has(excluded), false, `${excluded} should be filtered out`);
    }
    assert.equal(profile.rules.every((rule) => rule.schedule.type === 'manual_only_or_no_fixed_interval'), true);
  });

  it('supports two-stroke manual chain motorcycles and excludes four-stroke-only work', () => {
    const profile = getUniversalCustomMaintenanceProfile({
      schemaVersion: 1,
      powertrain: 'two_stroke',
      transmission: 'manual',
      finalDrive: 'chain',
      cooling: 'air',
      brakeSystem: 'drum',
      abs: 'no',
      wheelType: 'spoke',
    });
    const ids = new Set(profile.rules.map((rule) => rule.componentId));
    for (const expected of ['two-stroke-oil-system', 'reed-valve', 'manual-clutch', 'drive-chain-sprockets', 'drum-brakes', 'spokes-rims']) {
      assert.equal(ids.has(expected), true, `${expected} should be available`);
    }
    for (const excluded of ['engine-oil', 'valve-clearance', 'drive-belt-rollers', 'coolant', 'abs-system']) {
      assert.equal(ids.has(excluded), false, `${excluded} should be filtered out`);
    }
  });

  it('supports electric motorcycles without showing combustion-engine service', () => {
    const profile = getUniversalCustomMaintenanceProfile({
      schemaVersion: 1,
      powertrain: 'electric',
      transmission: 'automatic_other',
      finalDrive: 'integrated',
      cooling: 'air',
      brakeSystem: 'disc',
      abs: 'yes',
      wheelType: 'cast',
    });
    const ids = new Set(profile.rules.map((rule) => rule.componentId));
    for (const expected of ['traction-battery', 'electric-motor', 'motor-controller', 'electric-reduction-gear', 'charging-port-cable']) {
      assert.equal(ids.has(expected), true, `${expected} should be available`);
    }
    for (const excluded of ['engine-oil', 'spark-plug', 'fuel-lines', 'exhaust-system', 'air-cleaner-element', 'clutch-disk', 'drive-belt-rollers']) {
      assert.equal(ids.has(excluded), false, `${excluded} should be filtered out`);
    }
  });

  it('projects no due values until the owner creates a reminder', () => {
    const tasks = projectMaintenanceTasks({
      profile: UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE,
      vehicleId: 7,
      currentOdometerKm: 8200,
      now: new Date(2026, 7, 9, 12, 0, 0),
      events: [],
      preferences: [],
      defaultHistoryKnowledge: 'unknown',
    });

    assert.equal(tasks.length, UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE.rules.length);
    assert.equal(tasks.every((task) => task.status === 'no_fixed_interval'), true);
    assert.equal(tasks.every((task) => task.effectiveIntervalKm === null), true);
    assert.equal(tasks.every((task) => task.effectiveIntervalMonths === null), true);
    assert.equal(tasks.every((task) => task.dueAtKm === null && task.dueOn === null), true);
  });

  it('applies an owner interval to only the selected action', () => {
    const oilRule = UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE.rules.find((rule) =>
      rule.componentId === 'engine-oil' && rule.action === 'replace'
    );
    assert.ok(oilRule);
    const tasks = projectMaintenanceTasks({
      profile: UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE,
      vehicleId: 7,
      currentOdometerKm: 8200,
      now: new Date(2026, 7, 9, 12, 0, 0),
      events: [],
      preferences: [{
        vehicleId: 7,
        profileId: UNIVERSAL_CUSTOM_PROFILE_ID,
        componentId: 'engine-oil',
        action: 'replace',
        originalIntervalKm: null,
        originalIntervalMonths: null,
        customIntervalKm: 2500,
        customIntervalMonths: null,
        effectiveIntervalKm: 2500,
        effectiveIntervalMonths: null,
        distanceEnabled: true,
        timeEnabled: false,
        conditionBasedDefault: false,
        customConditionReminderEnabled: false,
        intervalSource: 'user_custom',
        changedAt: '2026-08-09T12:00:00.000Z',
      }],
      defaultHistoryKnowledge: 'unknown',
    });
    const oilTask = tasks.find((task) => task.ruleId === oilRule.id);
    assert.ok(oilTask);
    assert.equal(oilTask.effectiveIntervalKm, 2500);
    assert.equal(tasks.filter((task) => task.ruleId !== oilRule.id)
      .every((task) => task.effectiveIntervalKm === null && task.effectiveIntervalMonths === null), true);
  });

  it('does not add the universal profile to the manufacturer-validated profile list', () => {
    assert.equal(getSelectableMaintenanceProfiles().includes(UNIVERSAL_CUSTOM_MAINTENANCE_PROFILE), false);
    assert.equal(getSelectableMaintenanceProfiles().includes(NEW_SYMPHONY_ST_200_PROFILE), true);
  });
});
