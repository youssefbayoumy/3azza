import assert from 'node:assert/strict';
import { it } from 'node:test';
import { NEW_SYMPHONY_ST_200_PROFILE } from './profiles';
import { compareMaintenanceProfiles } from './compareProfiles';

it('compares profile rules without collapsing action or applicability differences', () => {
  const copy = structuredClone(NEW_SYMPHONY_ST_200_PROFILE);
  copy.id = 'comparison-profile';
  copy.profileVersion = 'comparison-v2';
  copy.rules[0].applicable = !copy.rules[0].applicable;
  copy.rules[1].schedule.intervalKm = 4321;
  copy.rules.pop();
  const comparison = compareMaintenanceProfiles(NEW_SYMPHONY_ST_200_PROFILE, copy);
  assert.ok(comparison.changedRules.some((item) => item.fields.includes('applicable')));
  assert.ok(comparison.changedRules.some((item) => item.fields.includes('schedule')));
  assert.equal(comparison.removedRuleIds.length, 1);
});

it('distinguishes same-component schedules and reports audit-relevant rule fields', () => {
  const copy = structuredClone(NEW_SYMPHONY_ST_200_PROFILE);
  const paper = copy.rules.find((rule) => rule.id === 'air-cleaner-element.replace.paper-recurring-6000km-6mo');
  const sponge = copy.rules.find((rule) => rule.id === 'air-cleaner-element.replace.sponge-recurring-12000km-12mo');
  const oil = copy.rules.find((rule) => rule.id === 'engine-oil.replace.recurring-1000km');
  assert.ok(paper);
  assert.ok(sponge);
  assert.ok(oil);
  paper.applicable = true;
  sponge.applicable = true;
  oil.notes = `${oil.notes ?? ''} Comparison test change.`;
  oil.supportingSources = oil.supportingSources?.slice(0, 1);

  const comparison = compareMaintenanceProfiles(NEW_SYMPHONY_ST_200_PROFILE, copy);
  const airFilterDifferences = comparison.applicabilityDifferences.filter((difference) =>
    difference.semanticKey.startsWith('air-cleaner-element:replace:')
  );
  assert.equal(airFilterDifferences.length, 2);
  const changedOil = comparison.changedRules.find((item) => item.ruleId === oil.id);
  assert.ok(changedOil?.fields.includes('notes'));
  assert.ok(changedOil?.fields.includes('supportingSources'));
});
