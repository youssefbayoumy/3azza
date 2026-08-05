import type { MaintenanceRule, ScooterMaintenanceProfile } from './types';

export type ProfileComparison = {
  left: { id: string; version: string; status: string };
  right: { id: string; version: string; status: string };
  addedRuleIds: string[];
  removedRuleIds: string[];
  changedRules: { ruleId: string; fields: string[] }[];
  applicabilityDifferences: { semanticKey: string; left: boolean; right: boolean }[];
};

function semanticKey(rule: MaintenanceRule): string {
  const scheduleIdentity = [
    rule.schedule.type,
    rule.schedule.initialServiceKm ?? '',
    rule.schedule.initialServiceMonths ?? '',
    rule.schedule.intervalKm ?? '',
    rule.schedule.intervalMonths ?? '',
    rule.schedule.dueWhen ?? '',
    rule.schedule.replacementCondition ?? '',
  ].join(':');
  return `${rule.componentId}:${rule.action}:${scheduleIdentity}`;
}

function changedFields(left: MaintenanceRule, right: MaintenanceRule): string[] {
  const leftWithDefault = left as MaintenanceRule & { profileRecommendedIntervalKm?: number };
  const rightWithDefault = right as MaintenanceRule & { profileRecommendedIntervalKm?: number };
  const values: [string, unknown, unknown][] = [
    ['componentId', left.componentId, right.componentId],
    ['action', left.action, right.action],
    ['label', left.label, right.label],
    ['applicable', left.applicable, right.applicable],
    ['schedule', left.schedule, right.schedule],
    ['profileRecommendedIntervalKm', leftWithDefault.profileRecommendedIntervalKm, rightWithDefault.profileRecommendedIntervalKm],
    ['confidence', left.confidence, right.confidence],
    ['source', left.source, right.source],
    ['supportingSources', left.supportingSources, right.supportingSources],
    ['safetyCritical', left.safetyCritical, right.safetyCritical],
    ['technicianRecommended', left.technicianRecommended, right.technicianRecommended],
    ['userInspectable', left.userInspectable, right.userInspectable],
    ['baselineRuleIds', left.baselineRuleIds, right.baselineRuleIds],
    ['suppressWhileRuleOutstanding', left.suppressWhileRuleOutstanding, right.suppressWhileRuleOutstanding],
    ['conditionFollowUp', left.conditionFollowUp, right.conditionFollowUp],
    ['instructions', left.instructions, right.instructions],
    ['notes', left.notes, right.notes],
    ['ambiguity', left.ambiguity, right.ambiguity],
  ];
  return values.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b)).map(([field]) => field);
}

export function compareMaintenanceProfiles(
  left: ScooterMaintenanceProfile,
  right: ScooterMaintenanceProfile
): ProfileComparison {
  const leftById = new Map(left.rules.map((rule) => [rule.id, rule]));
  const rightById = new Map(right.rules.map((rule) => [rule.id, rule]));
  const addedRuleIds = [...rightById.keys()].filter((id) => !leftById.has(id)).sort();
  const removedRuleIds = [...leftById.keys()].filter((id) => !rightById.has(id)).sort();
  const changedRules = [...leftById.entries()].flatMap(([ruleId, leftRule]) => {
    const rightRule = rightById.get(ruleId);
    if (!rightRule) return [];
    const fields = changedFields(leftRule, rightRule);
    return fields.length ? [{ ruleId, fields }] : [];
  });
  const leftSemantic = new Map(left.rules.map((rule) => [semanticKey(rule), rule]));
  const rightSemantic = new Map(right.rules.map((rule) => [semanticKey(rule), rule]));
  const applicabilityDifferences = [...leftSemantic.entries()].flatMap(([key, leftRule]) => {
    const rightRule = rightSemantic.get(key);
    return rightRule && rightRule.applicable !== leftRule.applicable
      ? [{ semanticKey: key, left: leftRule.applicable, right: rightRule.applicable }]
      : [];
  });
  return {
    left: { id: left.id, version: left.profileVersion, status: left.status },
    right: { id: right.id, version: right.profileVersion, status: right.status },
    addedRuleIds,
    removedRuleIds,
    changedRules,
    applicabilityDifferences,
  };
}
