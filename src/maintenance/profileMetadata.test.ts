import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { maintenanceComponentGroup } from './presentation';
import {
  getMaintenanceProfileForSelection,
  NEW_SYMPHONY_ST_200_PROFILE,
  quickRecordRules,
  resolveMaintenanceProfileIdForSelection,
} from './profiles';
import { isTaskTracked } from './scheduler';
import type { MaintenanceRule, ScooterMaintenanceProfile } from './types';

const symSelection = NEW_SYMPHONY_ST_200_PROFILE.catalogSelection;

describe('profile-owned maintenance presentation metadata', () => {
  it('keeps the current SYM default tracked task in profile metadata', () => {
    const oilRule = NEW_SYMPHONY_ST_200_PROFILE.rules.find((rule) => rule.id === 'engine-oil.replace.recurring-1000km');
    assert.ok(oilRule);
    assert.deepEqual(NEW_SYMPHONY_ST_200_PROFILE.defaultTrackedRuleIds, [oilRule.id]);
    assert.equal(isTaskTracked({ ruleId: oilRule.id, componentId: oilRule.componentId, action: oilRule.action }, {
      events: [],
      defaultTrackedRuleIds: NEW_SYMPHONY_ST_200_PROFILE.defaultTrackedRuleIds,
    }), true);
  });

  it('keeps the current SYM quick-record actions in declared profile order', () => {
    assert.deepEqual(quickRecordRules(NEW_SYMPHONY_ST_200_PROFILE).map((rule) => rule.id), [
      'engine-oil.replace.recurring-1000km',
      'transmission-oil.replace.recurring-5000km-5mo',
      'air-cleaner-element.inspect.recurring-1000km-1mo',
      'air-cleaner-element.clean.if-needed',
      'air-cleaner-element.replace.if-necessary',
      'brake-pads.inspect.recurring-1000km-1mo',
      'tires.inspect.recurring-1000km-1mo',
      'drive-belt-rollers.inspect.recurring-6000km-6mo',
      'general-fasteners.inspect.recurring-1000km-1mo',
    ]);
  });

  it('lets a synthetic profile choose different quick-record actions without UI logic changes', () => {
    const chainRule: MaintenanceRule = {
      ...NEW_SYMPHONY_ST_200_PROFILE.rules[0],
      id: 'drive-chain-sprockets.lubricate',
      componentId: 'drive-chain-sprockets',
      action: 'lubricate',
      label: 'Chain lubrication',
      schedule: { type: 'manual_only_or_no_fixed_interval' },
    };
    const synthetic: ScooterMaintenanceProfile = {
      ...NEW_SYMPHONY_ST_200_PROFILE,
      id: 'synthetic-manual-motorcycle',
      profileVersion: 'test-1',
      rules: [chainRule],
      defaultTrackedRuleIds: [],
      quickRecordRuleIds: [chainRule.id],
    };
    assert.deepEqual(quickRecordRules(synthetic).map((rule) => rule.id), [chainRule.id]);
  });

  it('uses profile presentation metadata for a future component and keeps unknown IDs explicit', () => {
    const future = maintenanceComponentGroup('future-chain-drive', {
      componentLabel: 'Chain drive',
      sectionKey: 'scheduled-maintenance',
    });
    assert.equal(future.key, 'future-chain-drive');
    assert.equal(future.label, 'Chain drive');
    assert.equal(future.section.key, 'scheduled-maintenance');
    assert.equal(maintenanceComponentGroup('unknown-component').label, '[unknown-component]');
  });

  it('resolves stable profile IDs and rejects ambiguous catalog-only selections', () => {
    const profileA: ScooterMaintenanceProfile = { ...NEW_SYMPHONY_ST_200_PROFILE, id: 'synthetic-profile-a' };
    const profileB: ScooterMaintenanceProfile = { ...NEW_SYMPHONY_ST_200_PROFILE, id: 'synthetic-profile-b' };
    assert.equal(getMaintenanceProfileForSelection({ brandId: symSelection.brandId }, [profileA]), null);
    assert.equal(getMaintenanceProfileForSelection(symSelection, [profileA, profileB]), null);
    assert.equal(
      resolveMaintenanceProfileIdForSelection({ ...symSelection, profileId: profileB.id }, [profileA, profileB]),
      profileB.id
    );
    assert.equal(getMaintenanceProfileForSelection(symSelection), NEW_SYMPHONY_ST_200_PROFILE);
  });
});
