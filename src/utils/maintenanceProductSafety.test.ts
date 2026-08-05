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
  'components/MaintenanceHistoryOnboarding.tsx',
  'components/MaintenanceRecordForm.tsx',
  'components/ScooterSelectionFields.tsx',
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
      task('info', 'informational'),
      task('unknown-check', 'history_unknown_request_record'),
      task('due-inspection', 'due', { action: 'inspect' }),
      task('upcoming', 'upcoming'),
      task('safety-service-soon', 'condition_attention', {
        conditionResult: 'service_soon',
        safetyCritical: true,
      }),
      task('unknown-fixed-change', 'history_unknown_recommend_service', { action: 'replace' }),
      task('historical-initial', 'historical_unverified', { isOneTime: true }),
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
        'upcoming',
        'unknown-fixed-change',
        'unknown-check',
        'historical-initial',
        'info',
      ]
    );
  });

  it('keeps historical initial and informational work below every current priority', () => {
    const current = ['overdue', 'due', 'due_soon', 'history_unknown_recommend_service', 'upcoming']
      .map((status, index) => task(`current-${index}`, status as TaskStatus));
    const historical = task('historical', 'historical_unverified', { isOneTime: true });
    const informational = task('informational', 'no_fixed_interval');

    for (const item of current) {
      assert.ok(maintenancePriorityScore(item) < maintenancePriorityScore(historical));
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

  it('keeps one compact history-setup entry point on each current-priority surface', () => {
    for (const relativePath of ['screens/DashboardScreen.tsx', 'screens/MaintenanceScheduleScreen.tsx']) {
      const { source } = sourceFile(relativePath);
      const copyCount = [...source.matchAll(/Finish setting up (?:your )?maintenance history/gi)].length;
      const routeCount = [...source.matchAll(/navigate\('MaintenanceHistorySetup'\)/g)].length;
      assert.equal(copyCount, 1, `${relativePath} must render the setup reminder once`);
      assert.equal(routeCount, 1, `${relativePath} must expose one setup entry point`);
    }
  });

  it('offers the compact owner-knowledge and high-value baseline choices', () => {
    const { source } = sourceFile('components/MaintenanceHistoryOnboarding.tsx');
    for (const expected of [
      'I have detailed records',
      'I remember recent maintenance',
      'I have little or no history',
      'Skip for now',
      'Last engine oil change',
      'Last gear-oil change',
      'Last air-filter service',
      'Last general workshop inspection',
      "I don't know",
    ]) {
      assert.ok(source.includes(expected), `missing onboarding copy: ${expected}`);
    }
    assert.doesNotMatch(source, /approximate/i);
  });

  it('keeps exact history setup behind the supported-profile gate', () => {
    const setup = sourceFile('screens/MaintenanceHistorySetupScreen.tsx').source;
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;

    assert.match(setup, /isMaintenanceProfileSelectable\s*\(/);
    assert.match(setup, /Exact history setup is unavailable/);
    assert.match(setup, /if \(!hasSupportedProfile\)/);
    assert.match(maintenance, /const setupNeeded = selectable && \(/);
  });

  it('announces onboarding stage and validation changes with component-specific labels', () => {
    const { source } = sourceFile('components/MaintenanceHistoryOnboarding.tsx');

    assert.match(source, /AccessibilityInfo\.announceForAccessibility/);
    assert.match(source, /accessibilityLabel=\{`\$\{baseline\.label\}: \$\{choice\.label\}`\}/);
    assert.match(source, /accessibilityLabel=\{`\$\{baseline\.label\} mileage in kilometres`\}/);
    assert.match(source, /accessibilityRole="alert"/);
  });

  it('explains edit scope and delete-triggered reminder recalculation', () => {
    const logs = sourceFile('screens/ServiceLogsScreen.tsx').source;
    const form = sourceFile('components/MaintenanceRecordForm.tsx').source;

    assert.match(logs, /affectedActionLabels\s*\(/);
    assert.match(logs, /Maintenance reminders for these actions will be recalculated\./);
    assert.match(logs, /advisoryText=\{editor\?\.group \? editAdvisory\(editor\.group\) : undefined\}/);
    assert.match(form, /advisoryText\?: string;/);
  });

  it('uses one generic reminder form and does not reintroduce fixed oil presets', () => {
    const oil = sourceFile('screens/OilChangeDetailsScreen.tsx').source;
    const customization = sourceFile('screens/MaintenanceReminderCustomizationScreen.tsx').source;
    const scheduler = sourceFile('maintenance/scheduler.ts').source;

    assert.doesNotMatch(oil, /(?:600|800|1000)\s*km/i);
    assert.doesNotMatch(`${oil}\n${scheduler}`, /OIL_INTERVAL_PRESETS|intervalPresets/i);
    assert.match(customization, /Distance interval \(km\)/);
    assert.match(customization, /Time interval \(months\)/);
    assert.match(customization, /Restore original schedule/);
    assert.match(customization, /Custom reminder set by you/);
    assert.match(customization, /User-created reminder/);
    assert.match(customization, /Reminder disabled by you/);
  });

  it('keeps reminder controls behind compact action rows and an action-specific menu', () => {
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;
    const oil = sourceFile('screens/OilChangeDetailsScreen.tsx').source;
    const row = sourceFile('components/MaintenanceActionRow.tsx').source;
    const menu = sourceFile('components/MaintenanceActionMenu.tsx').source;

    assert.match(maintenance, /<MaintenanceActionRow[^>]*onPress=\{setMenuTask\}[^>]*task=\{task\}/);
    assert.match(oil, /<MaintenanceActionRow[^>]*onPress=\{setMenuTask\}[^>]*task=\{task\}/);
    assert.match(oil, /maintenanceScheduleText\(recurringReplacement\)/);
    assert.match(row, /onPress=\{\(\) => onPress\(task\)\}/);
    assert.match(menu, /naturalMaintenanceActionLabel\(task\)/);
    assert.match(menu, /Customize reminder/);
    assert.match(menu, /View history/);
    assert.match(menu, /Enable reminder/);
    assert.match(menu, /Disable reminder/);
    assert.match(menu, /Restore original schedule/);
    assert.doesNotMatch(maintenance, />Customize reminder</);
    assert.doesNotMatch(oil, />Customize reminder</);
  });

  it('renders the three component-owned sections without per-action classification', () => {
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;
    for (const heading of ['Scheduled maintenance', 'Wear and condition', 'General checks']) {
      assert.equal([...maintenance.matchAll(new RegExp(`'${heading}'`, 'g'))].length, 1, heading);
    }
    assert.doesNotMatch(maintenance, /'Scheduled changes'|'Checks and servicing'|'Wear items'/);
    assert.match(maintenance, /const definition = maintenanceComponentGroup\(task\.componentId\)/);
    assert.match(maintenance, /group\.section === id/);
    assert.doesNotMatch(maintenance, /maintenanceSectionForTask/);
  });

  it('keeps historical one-time milestones out of daily menus and current oil details', () => {
    const maintenance = sourceFile('screens/MaintenanceScheduleScreen.tsx').source;
    const oil = sourceFile('screens/OilChangeDetailsScreen.tsx').source;
    const menu = sourceFile('components/MaintenanceActionMenu.tsx').source;
    const customization = sourceFile('screens/MaintenanceReminderCustomizationScreen.tsx').source;

    assert.match(maintenance, /task\.status !== 'historical_unverified'/);
    assert.match(oil, /task\.status !== 'historical_unverified'/);
    assert.match(menu, /const historical = task\.status === 'historical_unverified'/);
    assert.match(menu, /\{customizable \? \(/);
    assert.match(customization, /cannot be customized into recurring reminders/);
  });

  it('keeps every customization mode accessible after the hierarchy pass', () => {
    const customization = sourceFile('screens/MaintenanceReminderCustomizationScreen.tsx').source;
    for (const expected of [
      'Distance reminder',
      'Time reminder',
      'Add a personal reminder',
      'Reminder enabled',
      'Restore original schedule',
    ]) {
      assert.ok(customization.includes(expected), `missing customization control: ${expected}`);
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
