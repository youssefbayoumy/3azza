import type {
  MaintenanceCatalogue,
  MaintenanceRule,
  ScheduleDefinition,
  ScooterMaintenanceProfile,
} from './types';

export type MaintenanceValidationIssue = {
  code: string;
  path: string;
  message: string;
};

const NEW_SYMPHONY_ST_200_PROFILE_ID = 'sym-new-symphony-st-xl20w1-eu-it';

const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

type SourceWithType = MaintenanceRule['source'] & { sourceType?: string };
type RuleWithProfileDefault = MaintenanceRule & { profileRecommendedIntervalKm?: number };
type ProfileWithInitialServicePolicy = ScooterMaintenanceProfile & {
  initialServicePolicy?: {
    actionableUntilKm?: number;
    afterWindowBehavior?: string;
  };
};

function validateSource(
  profile: ScooterMaintenanceProfile,
  source: MaintenanceRule['source'] | undefined,
  path: string,
  issues: MaintenanceValidationIssue[]
): void {
  if (!source) {
    issues.push({ code: 'missing_source', path, message: 'Rule has no source.' });
    return;
  }
  const typedSource = source as SourceWithType;
  if (typedSource.sourceType === 'project_owner_override') {
    if (!source.originalText?.trim()) {
      issues.push({ code: 'missing_override_decision', path: `${path}.originalText`, message: 'Project-owner override must record the confirmed product decision.' });
    }
    if (
      source.manualId !== undefined
      || source.filename !== undefined
      || source.page !== undefined
      || source.section !== undefined
    ) {
      issues.push({ code: 'override_claims_manual_source', path, message: 'Project-owner override must not be represented as manual evidence.' });
    }
    return;
  }
  if (!source.manualId || source.manualId !== profile.manual.id) {
    issues.push({ code: 'wrong_manual', path: `${path}.manualId`, message: 'Source manual ID must match the exact profile manual.' });
  }
  if (!source.filename || source.filename !== profile.manual.filename) {
    issues.push({ code: 'missing_filename', path: `${path}.filename`, message: 'Source filename must match the exact profile manual.' });
  }
  if (!positiveInteger(source.page) || source.page > profile.manual.pageCount) {
    issues.push({ code: 'invalid_page', path: `${path}.page`, message: `Source page must exist within pages 1-${profile.manual.pageCount}.` });
  }
  if (!source.section?.trim()) {
    issues.push({ code: 'missing_section', path: `${path}.section`, message: 'Source section is required.' });
  }
}

function validateNewSymphonySt200OilDefault(
  profile: ScooterMaintenanceProfile,
  issues: MaintenanceValidationIssue[]
): void {
  if (profile.id !== NEW_SYMPHONY_ST_200_PROFILE_ID) return;

  const initialServicePolicy = (profile as ProfileWithInitialServicePolicy).initialServicePolicy;
  if (
    initialServicePolicy?.actionableUntilKm !== 1000
    || initialServicePolicy.afterWindowBehavior !== 'historical_unverified'
  ) {
    issues.push({
      code: 'st200_initial_service_policy_invalid',
      path: 'initialServicePolicy',
      message: 'New Symphony ST 200 initial milestones must remain actionable through 1,000 km, then become historical and unverified.',
    });
  }

  const activeOilReplacementPaths = profile.rules.filter((rule) =>
    rule.applicable
    && rule.componentId === 'engine-oil'
    && rule.action === 'replace'
    && rule.schedule.type !== 'one_time_initial'
    && rule.schedule.type !== 'condition_based'
  );

  if (activeOilReplacementPaths.length !== 1) {
    issues.push({
      code: 'st200_oil_default_rule_count',
      path: 'rules',
      message: 'New Symphony ST 200 must have exactly one active non-initial engine-oil replacement path.',
    });
  }

  const oilDefault = activeOilReplacementPaths[0] as RuleWithProfileDefault | undefined;
  if (oilDefault && (
    oilDefault.schedule.type !== 'recurring_distance'
    || oilDefault.schedule.intervalKm !== 1000
    || oilDefault.schedule.intervalMonths !== undefined
  )) {
    issues.push({
      code: 'st200_oil_default_not_1000km',
      path: `rules[${profile.rules.indexOf(oilDefault)}].schedule`,
      message: 'New Symphony ST 200 engine-oil replacement must recur by distance every 1,000 km.',
    });
  }
  if (oilDefault && oilDefault.profileRecommendedIntervalKm !== 1000) {
    issues.push({
      code: 'st200_oil_profile_default_not_1000km',
      path: `rules[${profile.rules.indexOf(oilDefault)}].profileRecommendedIntervalKm`,
      message: 'New Symphony ST 200 profile-recommended engine-oil interval must be 1,000 km.',
    });
  }
  if (oilDefault && (
    String(oilDefault.confidence) !== 'owner_confirmed'
    || (oilDefault.source as SourceWithType).sourceType !== 'project_owner_override'
    || oilDefault.ambiguity !== undefined
  )) {
    issues.push({
      code: 'st200_oil_default_not_owner_confirmed',
      path: `rules[${profile.rules.indexOf(oilDefault)}]`,
      message: 'New Symphony ST 200 oil default must be an unambiguous project-owner-confirmed override.',
    });
  }

  const hasActive3000KmPath = profile.rules.some((rule) =>
    rule.applicable
    && rule.componentId === 'engine-oil'
    && rule.action === 'replace'
    && (
      rule.schedule.intervalKm === 3000
      || rule.ambiguity?.alternatives.some((alternative) => alternative.schedule.intervalKm === 3000)
    )
  );
  if (hasActive3000KmPath) {
    issues.push({
      code: 'st200_oil_active_3000km_path',
      path: 'rules',
      message: 'New Symphony ST 200 cannot expose an active 3,000 km engine-oil rule or alternative.',
    });
  }
  if (profile.profileAmbiguities.some((ambiguity) => ambiguity.id === 'engine-oil-replacement-conflict')) {
    issues.push({
      code: 'st200_oil_conflict_unresolved',
      path: 'profileAmbiguities',
      message: 'The owner-confirmed oil override must not remain an unresolved profile ambiguity.',
    });
  }
}

function hasAnyInterval(schedule: ScheduleDefinition): boolean {
  return schedule.intervalKm !== undefined || schedule.intervalMonths !== undefined;
}

function sourceExplicitlySupportsMonths(rule: MaintenanceRule, intervalMonths: number): boolean {
  const evidence = [
    rule.source.tableRow,
    rule.source.originalText,
    ...(rule.supportingSources ?? []).flatMap((source) => [source.tableRow, source.originalText]),
  ].filter((value): value is string => Boolean(value?.trim())).join(' ');
  const supportedMonths = new Set<number>();
  for (const match of evidence.matchAll(/\b(\d+)\s*months?\b/gi)) {
    supportedMonths.add(Number(match[1]));
  }
  for (const match of evidence.matchAll(/\b(\d+)\s*years?\b/gi)) {
    supportedMonths.add(Number(match[1]) * 12);
  }
  return supportedMonths.has(intervalMonths);
}

function validateSchedule(
  rule: MaintenanceRule,
  path: string,
  issues: MaintenanceValidationIssue[]
): void {
  const schedule = rule.schedule;
  const validateOptionalPositive = (key: keyof ScheduleDefinition) => {
    const value = schedule[key];
    if (value !== undefined && !positiveInteger(value)) {
      issues.push({ code: 'invalid_interval', path: `${path}.${String(key)}`, message: 'Intervals must be positive whole numbers.' });
    }
  };
  (['initialServiceKm', 'initialServiceMonths', 'intervalKm', 'intervalMonths', 'severeUseIntervalKm', 'severeUseIntervalMonths'] as const)
    .forEach(validateOptionalPositive);

  if (
    rule.applicable
    && positiveInteger(schedule.intervalMonths)
    && !sourceExplicitlySupportsMonths(rule, schedule.intervalMonths)
  ) {
    issues.push({
      code: 'unsupported_default_time_interval',
      path: `${path}.intervalMonths`,
      message: 'A default month interval must be explicitly printed in source evidence or recorded in an approved owner decision; it cannot be generated from distance.',
    });
  }

  if (schedule.type === 'one_time_initial') {
    if (!positiveInteger(schedule.initialServiceKm) && !positiveInteger(schedule.initialServiceMonths)) {
      issues.push({ code: 'initial_missing_due', path, message: 'One-time initial rule needs a distance or time due point.' });
    }
    if (hasAnyInterval(schedule)) {
      issues.push({ code: 'initial_is_recurring', path, message: 'One-time initial rule cannot contain a recurring interval.' });
    }
  }
  if (schedule.type === 'recurring_distance' && !positiveInteger(schedule.intervalKm)) {
    issues.push({ code: 'recurring_missing_distance', path, message: 'Recurring-distance rule needs intervalKm.' });
  }
  if (schedule.type === 'recurring_time' && !positiveInteger(schedule.intervalMonths)) {
    issues.push({ code: 'recurring_missing_time', path, message: 'Recurring-time rule needs intervalMonths.' });
  }
  if (schedule.type === 'recurring_distance_or_time' || schedule.type === 'inspection_with_condition_replacement') {
    if (!positiveInteger(schedule.intervalKm) || !positiveInteger(schedule.intervalMonths)) {
      issues.push({ code: 'recurring_missing_pair', path, message: 'Distance-or-time rule needs both intervalKm and intervalMonths.' });
    }
    if (schedule.dueWhen !== 'whichever_comes_first') {
      issues.push({ code: 'missing_whichever_first', path, message: 'Distance-or-time rule must say whichever comes first.' });
    }
  }
  if (schedule.type === 'condition_based') {
    if (hasAnyInterval(schedule)) {
      issues.push({ code: 'condition_has_fixed_interval', path, message: 'Condition-based replacement cannot contain a fixed interval.' });
    }
    if (!schedule.replacementCondition?.trim()) {
      issues.push({ code: 'condition_missing_trigger', path, message: 'Condition-based rule needs a replacement condition.' });
    }
  }
  if (schedule.type === 'manual_only_or_no_fixed_interval' && hasAnyInterval(schedule)) {
    issues.push({ code: 'manual_rule_has_interval', path, message: 'Manual-only rule cannot contain a countdown interval.' });
  }
  if (schedule.intervalKm === 300 && !/every\s*300\s*km/i.test(rule.source.originalText ?? '')) {
    issues.push({ code: 'suspicious_recurring_300km', path: `${path}.intervalKm`, message: 'A recurring 300 km interval requires explicit recurring manual text.' });
  }
}

export function validateMaintenanceProfile(
  profile: ScooterMaintenanceProfile,
  catalogue: MaintenanceCatalogue
): MaintenanceValidationIssue[] {
  const issues: MaintenanceValidationIssue[] = [];
  if (!profile.id?.trim()) issues.push({ code: 'missing_profile_id', path: 'id', message: 'Profile ID is required.' });
  if (!profile.profileVersion?.trim()) issues.push({ code: 'missing_profile_version', path: 'profileVersion', message: 'Profile version is required.' });
  if (!profile.modelCodes?.length) issues.push({ code: 'missing_model_code', path: 'modelCodes', message: 'Exact model code is required.' });
  if (!positiveInteger(profile.supportedYears?.from)) issues.push({ code: 'missing_year_scope', path: 'supportedYears.from', message: 'Supported year start is required.' });
  if (!profile.markets?.length) issues.push({ code: 'missing_market', path: 'markets', message: 'At least one applicable market is required.' });
  if (!profile.catalogSelection?.variantId) issues.push({ code: 'missing_variant', path: 'catalogSelection.variantId', message: 'Exact selectable variant is required.' });
  if (!positiveInteger(profile.manual?.pageCount)) issues.push({ code: 'invalid_page_count', path: 'manual.pageCount', message: 'Manual page count must be positive.' });

  const initialServicePolicy = (profile as ProfileWithInitialServicePolicy).initialServicePolicy;
  if (initialServicePolicy) {
    if (!positiveInteger(initialServicePolicy.actionableUntilKm)) {
      issues.push({ code: 'invalid_initial_actionable_window', path: 'initialServicePolicy.actionableUntilKm', message: 'Initial-service actionable window must end at a positive whole kilometre.' });
    }
    if (initialServicePolicy.afterWindowBehavior !== 'historical_unverified') {
      issues.push({ code: 'invalid_initial_after_window_behavior', path: 'initialServicePolicy.afterWindowBehavior', message: 'Expired initial milestones must remain historical and unverified.' });
    }
  }

  const componentMap = new Map(catalogue.components.map((component) => [component.id, component]));
  const ruleMap = new Map<string, MaintenanceRule>();
  const semanticSignatures = new Set<string>();

  profile.rules.forEach((rule, index) => {
    const path = `rules[${index}]`;
    if (!rule.id?.trim()) issues.push({ code: 'missing_rule_id', path: `${path}.id`, message: 'Rule ID is required.' });
    if (ruleMap.has(rule.id)) issues.push({ code: 'duplicate_rule_id', path: `${path}.id`, message: `Duplicate rule ID ${rule.id}.` });
    ruleMap.set(rule.id, rule);
    if (!rule.label?.trim()) issues.push({ code: 'missing_action_label', path: `${path}.label`, message: 'User-facing rule label is required.' });
    const component = componentMap.get(rule.componentId);
    if (!component) {
      issues.push({ code: 'unknown_component', path: `${path}.componentId`, message: `Unknown component ${rule.componentId}.` });
    } else {
      if (component.category !== rule.category) issues.push({ code: 'category_mismatch', path: `${path}.category`, message: 'Rule category does not match universal catalogue.' });
      if (!component.allowedActions.includes(rule.action)) issues.push({ code: 'action_not_allowed', path: `${path}.action`, message: 'Action is not allowed for this component.' });
    }
    validateSource(profile, rule.source, `${path}.source`, issues);
    rule.supportingSources?.forEach((source, sourceIndex) => validateSource(profile, source, `${path}.supportingSources[${sourceIndex}]`, issues));
    validateSchedule(rule, `${path}.schedule`, issues);
    if (rule.confidence === 'unclear' && !rule.ambiguity) {
      issues.push({ code: 'unclear_missing_ambiguity', path, message: 'Unclear rule must preserve alternatives and safe behavior.' });
    }
    if (profile.status === 'production_ready' && rule.safetyCritical && rule.confidence === 'unclear') {
      issues.push({ code: 'production_critical_unclear', path, message: 'Production-ready profile cannot contain an unclear safety-critical rule.' });
    }
    const signature = `${rule.componentId}|${rule.action}|${JSON.stringify(rule.schedule)}|${rule.applicable}`;
    if (semanticSignatures.has(signature)) {
      issues.push({ code: 'contradictory_duplicate_rule', path, message: 'Profile contains duplicate semantic rules.' });
    }
    semanticSignatures.add(signature);
  });

  profile.rules.forEach((rule, index) => {
    if (rule.conditionFollowUp) {
      const target = ruleMap.get(rule.conditionFollowUp.ruleId);
      if (!target || target.action !== 'replace' || target.schedule.type !== 'condition_based') {
        issues.push({ code: 'invalid_condition_follow_up', path: `rules[${index}].conditionFollowUp`, message: 'Condition follow-up must target a condition-based replacement rule.' });
      }
    }
    rule.baselineRuleIds?.forEach((baselineRuleId, baselineIndex) => {
      const baseline = ruleMap.get(baselineRuleId);
      if (!baseline || baseline.action !== rule.action || baseline.componentId !== rule.componentId) {
        issues.push({ code: 'invalid_baseline_rule', path: `rules[${index}].baselineRuleIds[${baselineIndex}]`, message: 'Baseline rule must exist for the same component and action.' });
      }
    });
  });

  for (const [field, ruleIds] of [
    ['defaultTrackedRuleIds', profile.defaultTrackedRuleIds],
    ['quickRecordRuleIds', profile.quickRecordRuleIds],
  ] as const) {
    const seen = new Set<string>();
    ruleIds?.forEach((ruleId, index) => {
      const rule = ruleMap.get(ruleId);
      if (!rule || !rule.applicable) {
        issues.push({ code: 'invalid_profile_rule_reference', path: `${field}[${index}]`, message: `${field} must reference an applicable profile rule.` });
      }
      if (seen.has(ruleId)) {
        issues.push({ code: 'duplicate_profile_rule_reference', path: `${field}[${index}]`, message: `${field} cannot repeat a rule ID.` });
      }
      seen.add(ruleId);
    });
  }

  validateNewSymphonySt200OilDefault(profile, issues);

  return issues;
}

export function assertMaintenanceProfileValid(
  profile: ScooterMaintenanceProfile,
  catalogue: MaintenanceCatalogue
): void {
  const issues = validateMaintenanceProfile(profile, catalogue);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
}
