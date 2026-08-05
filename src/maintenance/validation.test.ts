import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NEW_SYMPHONY_ST_200_PROFILE,
  UNIVERSAL_MAINTENANCE_CATALOGUE,
} from './profiles';
import type { MaintenanceRule, ScooterMaintenanceProfile } from './types';
import { validateMaintenanceProfile } from './validation';

type OilDefaultRule = MaintenanceRule & {
  profileRecommendedIntervalKm?: number;
  source: MaintenanceRule['source'] & { sourceType?: string };
};

function oilDefault(profile: ScooterMaintenanceProfile): OilDefaultRule {
  const rule = profile.rules.find((candidate) => candidate.id === 'engine-oil.replace.recurring-1000km');
  assert.ok(rule);
  return rule as OilDefaultRule;
}

function cloneProfile(): ScooterMaintenanceProfile {
  return structuredClone(NEW_SYMPHONY_ST_200_PROFILE);
}

describe('maintenance profile validation', () => {
  it('accepts the cited validated New Symphony ST 200 profile', () => {
    assert.deepEqual(
      validateMaintenanceProfile(NEW_SYMPHONY_ST_200_PROFILE, UNIVERSAL_MAINTENANCE_CATALOGUE),
      []
    );
    assert.equal(NEW_SYMPHONY_ST_200_PROFILE.status, 'validated');
    assert.deepEqual(NEW_SYMPHONY_ST_200_PROFILE.initialServicePolicy, {
      actionableUntilKm: 1000,
      afterWindowBehavior: 'historical_unverified',
    });
    assert.equal(NEW_SYMPHONY_ST_200_PROFILE.rules.some((rule) => rule.schedule.intervalKm === 300), false);

    const activeOilReplacementPaths = NEW_SYMPHONY_ST_200_PROFILE.rules.filter((rule) =>
      rule.applicable
      && rule.componentId === 'engine-oil'
      && rule.action === 'replace'
      && rule.schedule.type !== 'one_time_initial'
      && rule.schedule.type !== 'condition_based'
    );
    assert.equal(activeOilReplacementPaths.length, 1);
    const rule = oilDefault(NEW_SYMPHONY_ST_200_PROFILE);
    assert.deepEqual(rule.schedule, { type: 'recurring_distance', intervalKm: 1000 });
    assert.equal(rule.profileRecommendedIntervalKm, 1000);
    assert.equal(String(rule.confidence), 'owner_confirmed');
    assert.equal(rule.source.sourceType, 'project_owner_override');
    assert.equal(rule.ambiguity, undefined);
    assert.ok(rule.supportingSources?.some((source) => /3000KM/i.test(source.originalText ?? '')));
    assert.equal(
      activeOilReplacementPaths.some((candidate) =>
        candidate.schedule.intervalKm === 3000
        || candidate.ambiguity?.alternatives.some((alternative) => alternative.schedule.intervalKm === 3000)
      ),
      false
    );
  });

  it('rejects any 3,000 km rule or alternative for the exact ST 200 oil default', () => {
    const profile = cloneProfile();
    const rule = oilDefault(profile);
    rule.schedule.intervalKm = 3000;
    rule.ambiguity = {
      description: 'Conflicting interval',
      alternatives: [{ schedule: { type: 'recurring_distance', intervalKm: 3000 }, sources: [rule.supportingSources?.[1] ?? rule.source] }],
      safeBehavior: 'no_automatic_reminder',
    };
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('st200_oil_default_not_1000km'));
    assert.ok(codes.includes('st200_oil_active_3000km_path'));
    assert.ok(codes.includes('st200_oil_default_not_owner_confirmed'));
  });

  it('rejects duplicate or incorrectly attributed ST 200 oil defaults', () => {
    const profile = cloneProfile();
    const rule = oilDefault(profile);
    rule.profileRecommendedIntervalKm = 800;
    rule.source.originalText = '';
    profile.rules.push({ ...structuredClone(rule), id: 'engine-oil.replace.second-active-default' });
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('missing_override_decision'));
    assert.ok(codes.includes('st200_oil_default_rule_count'));
    assert.ok(codes.includes('st200_oil_profile_default_not_1000km'));
  });

  it('requires the exact ST 200 initial-service actionable window', () => {
    const profile = cloneProfile();
    assert.ok(profile.initialServicePolicy);
    profile.initialServicePolicy.actionableUntilKm = 999;
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('st200_initial_service_policy_invalid'));
  });

  it('rejects missing citations, invalid pages, and recurring rules without intervals', () => {
    const profile = cloneProfile();
    const rule = profile.rules[0];
    rule.source.filename = '';
    rule.source.page = 31;
    rule.schedule = { type: 'recurring_distance' };
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('missing_filename'));
    assert.ok(codes.includes('invalid_page'));
    assert.ok(codes.includes('recurring_missing_distance'));
  });

  it('rejects one-time recurrence, unsupported fixed condition intervals, and duplicate identities', () => {
    const profile = cloneProfile();
    profile.rules[0].schedule.intervalKm = 300;
    const condition = profile.rules.find((rule) => rule.schedule.type === 'condition_based');
    assert.ok(condition);
    condition.schedule.intervalKm = 1000;
    profile.rules.push(structuredClone(profile.rules[1]));
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('initial_is_recurring'));
    assert.ok(codes.includes('condition_has_fixed_interval'));
    assert.ok(codes.includes('duplicate_rule_id'));
  });

  it('rejects suspicious recurring 300 km and production-ready critical ambiguity', () => {
    const profile = cloneProfile();
    const rule = profile.rules.find((candidate) => candidate.schedule.type === 'recurring_distance');
    assert.ok(rule);
    rule.schedule.intervalKm = 300;
    rule.source.originalText = '300 km initial service';
    profile.status = 'production_ready';
    const criticalRule = profile.rules.find((candidate) => candidate.safetyCritical);
    assert.ok(criticalRule);
    criticalRule.confidence = 'unclear';
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('suspicious_recurring_300km'));
    assert.ok(codes.includes('production_critical_unclear'));
  });

  it('rejects default month intervals that were generated from distance instead of cited', () => {
    const profile = cloneProfile();
    const rule = profile.rules.find((candidate) => candidate.id === 'spark-plug.inspect.recurring-3000km-3mo');
    assert.ok(rule);
    rule.source.tableRow = '8 - Spark plug, every 3000 KM: I';
    rule.source.originalText = '';
    rule.supportingSources = [];
    const issues = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE);
    assert.ok(issues.some((issue) =>
      issue.code === 'unsupported_default_time_interval'
      && issue.path.endsWith('.intervalMonths')
    ));
  });

  it('rejects invalid applicability relationships and missing profile identity', () => {
    const profile = cloneProfile();
    profile.modelCodes = [];
    profile.markets = [];
    profile.catalogSelection.variantId = '';
    profile.rules[0].componentId = 'coolant';
    const conditionSource = profile.rules.find((rule) => rule.conditionFollowUp);
    assert.ok(conditionSource?.conditionFollowUp);
    conditionSource.conditionFollowUp.ruleId = 'missing-rule';
    const codes = validateMaintenanceProfile(profile, UNIVERSAL_MAINTENANCE_CATALOGUE).map((issue) => issue.code);
    assert.ok(codes.includes('missing_model_code'));
    assert.ok(codes.includes('missing_market'));
    assert.ok(codes.includes('missing_variant'));
    assert.ok(codes.includes('category_mismatch'));
    assert.ok(codes.includes('invalid_condition_follow_up'));
  });
});
