import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import {
  compareMaintenanceTaskPriority,
  maintenancePriorityScore,
} from '../maintenance/scheduler';
import type {
  MaintenanceTaskProjection,
  TaskStatus,
} from '../maintenance/types';
import { en } from '../i18n/core';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MAINTENANCE_UI_FILES = [
  'screens/DashboardScreen.tsx',
  'screens/MaintenanceScheduleScreen.tsx',
  'screens/OilChangeDetailsScreen.tsx',
  'screens/MaintenanceReminderCustomizationScreen.tsx',
  'screens/ServiceLogsScreen.tsx',
  'screens/MaintenanceHistorySetupScreen.tsx',
  'screens/PreRideCheckScreen.tsx',
  'screens/TechSpecsScreen.tsx',
  'screens/setup/VehicleSetupScreen.tsx',
  'components/maintenance/MaintenanceRecordForm.tsx',
  'components/vehicle/ScooterSelectionFields.tsx',
  'components/SourceProvenance.tsx',
] as const;

const USER_FACING_ATTRIBUTES = new Set([
  'accessibilityLabel',
  'detail',
  'label',
  'placeholder',
  'submitLabel',
  'subtitle',
  'title',
]);

const FORBIDDEN_DIRECT_FIELDS = new Set([
  'action',
  'ambiguity',
  'componentId',
  'conditionResult',
  'confidence',
  'filename',
  'intervalSource',
  'maintenance_action',
  'maintenance_date_confidence',
  'maintenance_migration_status',
  'maintenance_mileage_confidence',
  'maintenance_record_source',
  'maintenance_rule_id',
  'manualId',
  'originalText',
  'page',
  'profile_id',
  'profileVersion',
  'ruleId',
  'scheduleType',
  'source',
  'sourceType',
  'status',
  'tableRow',
]);

const FORBIDDEN_VISIBLE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: 'manual filename', pattern: /\b[^\s"']+\.pdf\b/i },
  { label: 'PDF page citation', pattern: /\b(?:pdf\s+)?pages?\s*(?:#|:)?\s*\d+\b/i },
  { label: 'profile version', pattern: /\bprofile[_ -]?version\b/i },
  { label: 'release-candidate label', pattern: /\brelease[_ -]?candidate\b/i },
  { label: 'manual-backed developer copy', pattern: /\bmanual[_ -]?backed\b/i },
  { label: 'confidence metadata', pattern: /\b(?:history\s+)?confidence\b/i },
  { label: 'extraction terminology', pattern: /\bextraction(?:-generated)?\b/i },
  { label: 'migration terminology', pattern: /\bmigration\s+(?:status|term|note|data)\b/i },
  { label: 'source metadata', pattern: /\b(?:source metadata|source citation|table row|original manual wording)\b/i },
  {
    label: 'raw enum',
    pattern: /\b(?:one_time_initial|recurring_distance(?:_or_time)?|recurring_time|condition_based|inspection_with_condition_replacement|manual_only_or_no_fixed_interval|history_unknown_recommend_service|history_unknown_request_record|historical_unverified|legacy_unmapped|project_owner_override|owner_confirmed|profile_default|user_custom|workshop_recommendation)\b/,
  },
  {
    label: 'raw rule id',
    pattern: /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)+\.(?:inspect|replace|clean|adjust|lubricate|test|tighten|condition-check|initial-service)\.[a-z0-9.-]+\b/,
  },
];

type SourceFinding = {
  file: string;
  line: number;
  text: string;
};

function sourceFile(relativePath: string): { file: string; source: string; ast: ts.SourceFile } {
  const file = resolve(SRC, relativePath);
  const source = readFileSync(file, 'utf8');
  return {
    file,
    source,
    ast: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  };
}

function lineOf(ast: ts.SourceFile, node: ts.Node): number {
  return ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
}

function collectVisibleFragments(relativePath: string): SourceFinding[] {
  const { file, ast } = sourceFile(relativePath);
  const findings: SourceFinding[] = [];
  const push = (node: ts.Node, text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized) findings.push({ file, line: lineOf(ast, node), text: normalized });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) push(node, node.text);

    if (ts.isJsxAttribute(node)
      && USER_FACING_ATTRIBUTES.has(node.name.getText(ast))
      && node.initializer) {
      push(node, node.initializer.getText(ast));
    }

    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(ast) === 'Alert'
      && node.expression.name.text === 'alert') {
      for (const argument of node.arguments) push(argument, argument.getText(ast));
    }

    ts.forEachChild(node, visit);
  };
  visit(ast);

  // Human-readable metadata should not be present even if a helper returns it.
  const visitStrings = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      for (const { label, pattern } of FORBIDDEN_VISIBLE_PATTERNS.slice(0, 9)) {
        if (pattern.test(node.text)) push(node, `${label}: ${node.text}`);
      }
    }
    ts.forEachChild(node, visitStrings);
  };
  visitStrings(ast);

  return findings;
}

function directRenderedFieldFindings(relativePath: string): SourceFinding[] {
  const { file, ast } = sourceFile(relativePath);
  const findings: SourceFinding[] = [];

  const checkOutput = (node: ts.Expression): void => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
      checkOutput(node.expression);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      checkOutput(node.whenTrue);
      checkOutput(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      if (['&&', '||', '??', '+'].includes(node.operatorToken.getText(ast))) {
        checkOutput(node.right);
        if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) checkOutput(node.left);
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) checkOutput(span.expression);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (FORBIDDEN_DIRECT_FIELDS.has(node.name.text)) {
        findings.push({ file, line: lineOf(ast, node), text: node.getText(ast) });
      }
      return;
    }
    if (ts.isElementAccessExpression(node)
      && ts.isStringLiteral(node.argumentExpression)
      && FORBIDDEN_DIRECT_FIELDS.has(node.argumentExpression.text)) {
      findings.push({ file, line: lineOf(ast, node), text: node.getText(ast) });
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxExpression(node) && node.expression) {
      if (!ts.isJsxAttribute(node.parent)
        || USER_FACING_ATTRIBUTES.has(node.parent.name.getText(ast))) {
        checkOutput(node.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return findings;
}

function task(
  ruleId: string,
  status: TaskStatus,
  overrides: Partial<MaintenanceTaskProjection> = {}
): MaintenanceTaskProjection {
  return {
    key: ruleId,
    ruleId,
    componentId: ruleId,
    action: 'inspect',
    label: ruleId,
    scheduleType: 'recurring_distance',
    status,
    dueAtKm: null,
    dueOn: null,
    dueBy: 'unknown',
    lastPerformedAtKm: null,
    lastPerformedOn: null,
    remainingKm: null,
    remainingDays: null,
    profileRecommendedIntervalKm: null,
    originalIntervalMonths: null,
    effectiveIntervalKm: null,
    effectiveIntervalMonths: null,
    distanceEnabled: false,
    timeEnabled: false,
    conditionBasedDefault: false,
    customConditionReminderEnabled: false,
    reminderDisabled: false,
    intervalSource: 'profile_default',
    title: ruleId,
    reason: ruleId,
    source: {},
    safetyCritical: false,
    technicianRecommended: false,
    userInspectable: true,
    technicianLevel: 'user_checkable',
    isOneTime: false,
    ...overrides,
  };
}

describe('maintenance product priority policy', () => {
  it('implements the complete deterministic Home ordering', () => {
    const unordered = [
      task('info', 'no_fixed_interval'),
      task('unknown-check', 'unknown_history'),
      task('due-inspection', 'due', { action: 'inspect' }),
      task('ok', 'ok'),
      task('safety-service-soon', 'condition_attention', {
        conditionResult: 'service_soon',
        safetyCritical: true,
      }),
      task('unknown-fixed-change', 'unknown_history', { action: 'replace' }),
      task('due-replacement', 'due', { action: 'replace' }),
      task('due-soon', 'due_soon'),
      task('confirmed-overdue', 'overdue'),
      task('safety-replace-now', 'condition_attention', {
        action: 'replace',
        conditionResult: 'replace_now',
        safetyCritical: true,
      }),
    ];

    assert.deepEqual(
      [...unordered].sort(compareMaintenanceTaskPriority).map(({ ruleId }) => ruleId),
      [
        'safety-replace-now',
        'safety-service-soon',
        'confirmed-overdue',
        'due-replacement',
        'due-inspection',
        'due-soon',
        'ok',
        'unknown-fixed-change',
        'unknown-check',
        'info',
      ]
    );
  });

  it('keeps no-fixed-interval guidance below current scheduled work', () => {
    const current = ['overdue', 'due', 'due_soon', 'unknown_history', 'ok']
      .map((status, index) => task(`current-${index}`, status as TaskStatus));
    const informational = task('informational', 'no_fixed_interval');

    for (const item of current) {
      assert.ok(maintenancePriorityScore(item) < maintenancePriorityScore(informational));
    }
  });

  it('breaks equal-priority ties by action, deadline, then stable rule identity', () => {
    const tied = [
      task('z-inspection', 'due', { action: 'inspect', dueAtKm: 1_000 }),
      task('b-replacement', 'due', { action: 'replace', dueAtKm: 900 }),
      task('a-replacement', 'due', { action: 'replace', dueAtKm: 900 }),
    ];

    assert.deepEqual(
      tied.sort(compareMaintenanceTaskPriority).map(({ ruleId }) => ruleId),
      ['a-replacement', 'b-replacement', 'z-inspection']
    );
  });
});

describe('production maintenance UI safety', () => {
  it('contains no user-visible internal evidence, raw enums, or rule identities', () => {
    const failures: string[] = [];

    for (const relativePath of MAINTENANCE_UI_FILES) {
      for (const finding of collectVisibleFragments(relativePath)) {
        for (const { label, pattern } of FORBIDDEN_VISIBLE_PATTERNS) {
          if (pattern.test(finding.text)) {
            failures.push(`${relativePath}:${finding.line} ${label}: ${finding.text}`);
          }
        }
      }
      for (const finding of directRenderedFieldFindings(relativePath)) {
        failures.push(`${relativePath}:${finding.line} direct internal field: ${finding.text}`);
      }
    }

    assert.deepEqual(failures, []);
  });

  it('keeps one first-service entry point without reviving the history questionnaire', () => {
    for (const relativePath of [
      'screens/DashboardScreen.tsx',
      'screens/MaintenanceScheduleScreen.tsx',
    ] as const) {
      const { source } = sourceFile(relativePath);
      const routeCount = [...source.matchAll(/navigate\('MaintenanceHistorySetup'\)/g)].length;
      assert.equal(routeCount, 1, `${relativePath} must expose one setup entry point`);
      assert.doesNotMatch(source, /maintenance_history_level|finishHistory/);
    }
  });

  it('asks only the ownership question needed by the lifecycle model', () => {
    const { source } = sourceFile('screens/setup/VehicleSetupScreen.tsx');
    for (const key of [
      'setup.purchaseCondition',
      'setup.boughtNew',
      'setup.boughtUsed',
    ]) {
      assert.ok(source.includes(`'${key}'`), `missing onboarding translation key: ${key}`);
      assert.ok(en[key as keyof typeof en], `missing English resource: ${key}`);
    }
    assert.doesNotMatch(source, /MaintenanceHistoryOnboarding|dailyAvg/);
  });

  it('starts directly at minimal vehicle setup without a tour or fresh-install PIN gate', () => {
    const root = sourceFile('navigation/RootNavigator.tsx').source;
    const store = sourceFile('store/useAppStore.ts').source;
    const setup = sourceFile('screens/setup/VehicleSetupScreen.tsx').source;

    assert.doesNotMatch(root, /OnboardingScreen|hasCompletedOnboarding/);
    assert.match(root, /!hasCompletedVehicleSetup\s*\?/);
    assert.match(root, /hasCompletedVehicleSetup && appLockEnabled && !isAuthenticated/);
    assert.doesNotMatch(store, /hasCompletedOnboarding|completeOnboarding|resetOnboarding/);
    assert.match(store, /appLockEnabled:\s*false/);
    assert.match(setup, /saveInitialVehicleSetup\(\{/);
    assert.doesNotMatch(setup, /MaintenanceHistory|InitialServiceCheckpoint|dailyAverage/);
    assert.match(setup, /language\.english/);
    assert.match(setup, /language\.egyptianArabic/);
  });

  it('keeps exact history setup behind the supported-profile gate', () => {
    const setup = sourceFile('screens/MaintenanceHistorySetupScreen.tsx').source;
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;

    assert.match(setup, /isMaintenanceProfileSelectable\s*\(/);
    assert.match(setup, /history\.unavailable/);
    assert.match(setup, /if \(!hasSupportedProfile\)/);
    assert.match(maintenance, /projectVehicleMaintenance/);
    assert.doesNotMatch(maintenance, /maintenance_history_level/);
  });

  it('exposes new and used choices as accessible radios', () => {
    const { source } = sourceFile('screens/setup/VehicleSetupScreen.tsx');
    assert.match(source, /accessibilityRole="radio"/);
    assert.match(source, /accessibilityState=\{\{ checked: selected \}\}/);
  });

  it('explains edit scope and delete-triggered reminder recalculation', () => {
    const logs = sourceFile('screens/ServiceLogsScreen.tsx').source;
    const form = sourceFile('components/maintenance/MaintenanceRecordForm.tsx').source;

    assert.match(logs, /affectedActionLabels\s*\(/);
    assert.match(logs, /logs\.deleteBody/);
    assert.match(logs, /advisoryText=\{editor\?\.group \? editAdvisory\(editor\.group\) : undefined\}/);
    assert.match(form, /advisoryText\?: string;/);
  });

  it('uses one generic reminder form and does not reintroduce fixed oil presets', () => {
    const oil = sourceFile('screens/OilChangeDetailsScreen.tsx').source;
    const customization = sourceFile('screens/MaintenanceReminderCustomizationScreen.tsx').source;
    const scheduler = sourceFile('maintenance/scheduler.ts').source;

    assert.doesNotMatch(oil, /(?:600|800|1000)\s*km/i);
    assert.doesNotMatch(`${oil}\n${scheduler}`, /OIL_INTERVAL_PRESETS|intervalPresets/i);
    assert.match(customization, /reminder\.distanceLabel/);
    assert.match(customization, /reminder\.timeLabel/);
    assert.match(customization, /maintenance\.restoreSchedule/);
    assert.match(customization, /reminder\.customByYou/);
    assert.match(customization, /reminder\.userCreated/);
    assert.match(customization, /reminder\.disabledByYou/);
  });

  it('keeps reminder controls behind compact action rows and an action-specific menu', () => {
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;
    const oil = sourceFile('screens/OilChangeDetailsScreen.tsx').source;
    const row = sourceFile('components/maintenance/MaintenanceActionRow.tsx').source;
    const menu = sourceFile('components/maintenance/MaintenanceActionMenu.tsx').source;

    assert.match(maintenance, /<MaintenanceActionRow[^>]*onPress=\{setMenuTask\}[^>]*task=\{task\}/);
    assert.match(oil, /<MaintenanceActionRow[^>]*onPress=\{setMenuTask\}[^>]*task=\{task\}/);
    assert.match(oil, /maintenanceScheduleText\(recurringReplacement\)/);
    assert.match(row, /onPress=\{\(\) => onPress\(task\)\}/);
    assert.match(menu, /naturalMaintenanceActionLabel\(task\)/);
    assert.match(menu, /maintenance\.customizeReminder/);
    assert.match(menu, /maintenance\.viewHistory/);
    assert.match(menu, /maintenance\.enableReminder/);
    assert.match(menu, /maintenance\.disableReminder/);
    assert.match(menu, /maintenance\.restoreSchedule/);
    assert.doesNotMatch(maintenance, />Customize reminder</);
    assert.doesNotMatch(oil, />Customize reminder</);
  });

  it('renders the three component-owned sections without per-action classification', () => {
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;
    for (const key of ['maintenance.section.scheduled', 'maintenance.section.wear', 'maintenance.section.checks']) {
      assert.equal([...maintenance.matchAll(new RegExp(`'${key.replaceAll('.', '\\.')}''?`, 'g'))].length, 1, key);
    }
    assert.doesNotMatch(maintenance, /'Scheduled changes'|'Checks and servicing'|'Wear items'/);
    assert.match(maintenance, /const definition = maintenanceComponentGroup\(task\.componentId\)/);
    assert.match(maintenance, /group\.section === id/);
    assert.doesNotMatch(maintenance, /maintenanceSectionForTask/);
  });

  it('routes current plan consumers through the lifecycle engine and removes historical task branches', () => {
    const dashboard = sourceFile('screens/DashboardScreen.tsx').source;
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;
    const oil = sourceFile('screens/OilChangeDetailsScreen.tsx').source;
    const menu = sourceFile('components/maintenance/MaintenanceActionMenu.tsx').source;
    assert.match(maintenance, /projectVehicleMaintenance/);
    assert.match(dashboard, /const saveConfirmedOdometer[\s\S]*?await reload\(\);[\s\S]*?setIsOdoModalVisible\(false\)/);
    assert.match(oil, /projectVehicleMaintenance/);
    assert.doesNotMatch(menu, /historical_unverified/);
    assert.match(menu, /maintenance\.changedNow/);
    assert.match(menu, /maintenance\.enterPrevious/);
    assert.match(menu, /task\.status === 'unknown_history'/);
    assert.match(menu, /\{customizable \? \(/);
  });

  it('keeps generic maintenance recording ownership-neutral and confines the new-only guard to first service', () => {
    const database = sourceFile('services/database.ts').source;
    const genericStart = database.indexOf('export async function createMaintenanceRecord');
    const checkpointStart = database.indexOf('export async function resolveInitialServiceCheckpoint');
    assert.ok(genericStart >= 0 && checkpointStart > genericStart);

    const genericRecord = database.slice(genericStart, checkpointStart);
    assert.match(genericRecord, /prepareMaintenanceRecordInput\(vehicle, input/);
    assert.doesNotMatch(genericRecord, /purchase_condition|first-service checkpoint/i);

    const checkpoint = database.slice(checkpointStart);
    assert.match(checkpoint, /vehicle\.purchase_condition !== 'new'/);
  });

  it('keeps every customization mode accessible after the hierarchy pass', () => {
    const customization = sourceFile('screens/MaintenanceReminderCustomizationScreen.tsx').source;
    for (const key of [
      'reminder.distance',
      'reminder.time',
      'reminder.personal',
      'reminder.enabled',
      'maintenance.restoreSchedule',
    ]) {
      assert.ok(customization.includes(`'${key}'`), `missing customization control key: ${key}`);
    }
  });
});

describe('maintenance navigation compatibility', () => {
  it('registers Maintenance as the root tab without reviving the old Vitals tab', () => {
    const types = sourceFile('navigation/types.ts').source;
    const tabNavigator = sourceFile('navigation/TabNavigator.tsx').source;
    const tabParamBlock = types.match(/export type TabParamList\s*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';

    assert.match(tabParamBlock, /\bMaintenance:\s*\{\s*openRuleId\?:\s*string\s*\}\s*\|\s*undefined;/);
    assert.doesNotMatch(tabParamBlock, /\bVitals:/);
    assert.match(tabNavigator, /<Tab\.Screen\s+name="Maintenance"/);
    assert.doesNotMatch(tabNavigator, /<Tab\.Screen\s+name="Vitals"/);
  });

  it('retains explicit compatibility paths for old Vitals links and the renamed screen type', () => {
    const routing = sourceFile('utils/notificationRouting.ts').source;
    const types = sourceFile('navigation/types.ts').source;

    assert.match(routing, /intent\.route === 'Vitals' \|\| intent\.route === 'Maintenance'/);
    assert.match(routing, /\{ kind: 'tab', screen: 'Maintenance' \}/);
    assert.match(types, /export type VitalsNavigationProp = MaintenanceNavigationProp;/);
  });
});
