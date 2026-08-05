import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planMaintenanceHistoryBaseline,
  type MaintenanceHistoryBaselineInput,
} from './maintenanceHistoryPlan';

function baseline(
  overrides: Partial<MaintenanceHistoryBaselineInput> = {}
): MaintenanceHistoryBaselineInput {
  return {
    key: 'engine_oil',
    choice: 'exact',
    mileageKm: 18_000,
    serviceDate: '2026-07-20',
    ...overrides,
  };
}

describe('maintenance-history onboarding plan', () => {
  it('turns an exact engine-oil answer into only the 1,000 km replacement baseline', () => {
    const plan = planMaintenanceHistoryBaseline(baseline());

    assert.equal(plan.historyState, 'confirmed');
    assert.deepEqual(plan.actions.map(({ componentId, action, ruleId }) => ({ componentId, action, ruleId })), [{
      componentId: 'engine-oil',
      action: 'replace',
      ruleId: 'engine-oil.replace.recurring-1000km',
    }]);
    assert.deepEqual(plan.record, {
      serviceDate: '2026-07-20',
      mileageKm: 18_000,
      dateConfidence: 'confirmed',
      mileageConfidence: 'confirmed',
      recordSource: 'history_onboarding',
      actions: [{
        ruleId: 'engine-oil.replace.recurring-1000km',
        componentId: 'engine-oil',
        action: 'replace',
        title: 'Engine oil change',
        category: 'engine_and_lubrication',
      }],
    });
    assert.doesNotMatch(JSON.stringify(plan), /3000/);
  });

  it('keeps unknown, never-done, and not-applicable answers as state without records', () => {
    for (const choice of ['unknown', 'never_done', 'not_applicable'] as const) {
      const plan = planMaintenanceHistoryBaseline(baseline({
        choice,
        mileageKm: null,
        serviceDate: null,
      }));

      assert.equal(plan.historyState, choice);
      assert.equal(plan.record, null);
      assert.deepEqual(plan.actions.map(({ componentId, action }) => ({ componentId, action })), [{
        componentId: 'engine-oil',
        action: 'replace',
      }]);
    }
  });

  it('tracks all air-filter actions as unknown but records only the exact selected action', () => {
    const unknown = planMaintenanceHistoryBaseline(baseline({
      key: 'air_filter',
      choice: 'unknown',
      mileageKm: null,
      serviceDate: null,
    }));
    assert.equal(unknown.record, null);
    assert.deepEqual(unknown.actions.map(({ action }) => action), ['inspect', 'clean', 'replace']);

    for (const airFilterAction of ['clean', 'replace'] as const) {
      const exact = planMaintenanceHistoryBaseline(baseline({ key: 'air_filter', airFilterAction }));
      assert.deepEqual(exact.actions.map(({ action }) => action), [airFilterAction]);
      assert.deepEqual(exact.record?.actions.map(({ action }) => action), [airFilterAction]);
    }
  });

  it('keeps a general inspection generic instead of completing its technical checklist', () => {
    const plan = planMaintenanceHistoryBaseline(baseline({ key: 'general_inspection' }));

    assert.deepEqual(plan.actions.map(({ componentId, action, ruleId }) => ({ componentId, action, ruleId })), [{
      componentId: 'general-workshop-inspection',
      action: 'inspect',
      ruleId: null,
    }]);
    assert.equal(plan.record?.actions.length, 1);
    assert.equal(plan.record?.actions[0].ruleId, null);
    assert.equal('conditionResult' in (plan.record?.actions[0] ?? {}), false);
  });

  it('rejects an exact answer that omits either exact field', () => {
    assert.throws(
      () => planMaintenanceHistoryBaseline(baseline({ mileageKm: null })),
      /requires both mileage and date/
    );
    assert.throws(
      () => planMaintenanceHistoryBaseline(baseline({ serviceDate: null })),
      /requires both mileage and date/
    );
  });
});
