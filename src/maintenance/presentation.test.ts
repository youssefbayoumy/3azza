import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NEW_SYMPHONY_ST_200_PROFILE, UNIVERSAL_MAINTENANCE_CATALOGUE } from './profiles';
import {
  buildMaintenancePresentation,
  maintenanceComponentGroup,
  maintenanceGroupSummary,
  maintenanceOverrideBadge,
  maintenanceSectionForTask,
  naturalMaintenanceActionLabel,
  naturalRecordActionLabel,
} from './presentation';
import { projectMaintenanceTasks } from './scheduler';
import type { MaintenanceEvent, MaintenanceRule, ScooterMaintenanceProfile } from './types';
import { setActiveLocale } from '../i18n/localeState';

const NOW = new Date(2026, 7, 1, 12, 0, 0);

function profileWithRules(...ids: string[]): ScooterMaintenanceProfile {
  const rules = ids.map((id) => {
    const rule = NEW_SYMPHONY_ST_200_PROFILE.rules.find((candidate) => candidate.id === id);
    assert.ok(rule, `Missing fixture rule ${id}`);
    return rule;
  });
  return { ...NEW_SYMPHONY_ST_200_PROFILE, rules };
}

function event(rule: MaintenanceRule, overrides: Partial<MaintenanceEvent> = {}): MaintenanceEvent {
  return {
    id: overrides.id ?? `event-${rule.id}`,
    vehicleId: overrides.vehicleId ?? 1,
    profileId: overrides.profileId ?? NEW_SYMPHONY_ST_200_PROFILE.id,
    profileVersion: overrides.profileVersion ?? NEW_SYMPHONY_ST_200_PROFILE.profileVersion,
    ruleId: overrides.ruleId ?? rule.id,
    componentId: overrides.componentId ?? rule.componentId,
    action: overrides.action ?? rule.action,
    performedOn: overrides.performedOn ?? '2026-07-01',
    odometerKm: overrides.odometerKm ?? 0,
    inspectionResult: overrides.inspectionResult,
  };
}

function project(profile: ScooterMaintenanceProfile, events: MaintenanceEvent[] = []) {
  return projectMaintenanceTasks({
    profile,
    vehicleId: 1,
    currentOdometerKm: 100,
    now: NOW,
    events,
    defaultHistoryKnowledge: 'known_no_prior_completion',
    vehicleInServiceDate: '2026-08-01',
  });
}

describe('maintenance presentation taxonomy', () => {
  it('uses concise component and action labels', () => {
    assert.equal(maintenanceComponentGroup('air-cleaner-element').key, 'air-cleaner-element');
    assert.equal(maintenanceComponentGroup('air-cleaner-system').key, 'air-cleaner-system');
    assert.equal(maintenanceComponentGroup('transmission-oil').key, 'transmission-oil');
    assert.equal(maintenanceComponentGroup('steering-bearing-handles').key, 'steering-bearing-handles');
    assert.equal(maintenanceComponentGroup('shock-absorbers').key, 'shock-absorbers');
    assert.equal(maintenanceComponentGroup('suspension').key, 'suspension');
    assert.equal(maintenanceComponentGroup('general-fasteners').key, 'general-fasteners');
    assert.equal(maintenanceComponentGroup('oil-filter-screen').label, 'Oil filter screen');
    assert.equal(maintenanceComponentGroup('transmission').label, 'Transmission');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'engine-oil', action: 'replace' }), 'Engine-oil replacement');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'transmission-oil', action: 'replace' }), 'Gear-oil replacement');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'brake-pads', action: 'inspect' }), 'Brake-pad inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'valve-clearance', action: 'inspect' }), 'Valve clearance inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'main-side-stands', action: 'lubricate' }), 'Main and side stands lubrication');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'engine-fasteners', action: 'inspect' }), 'Engine fastener inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'general-fasteners', action: 'inspect' }), 'General fastener inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'shock-absorbers', action: 'inspect' }), 'Shock absorber inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'steering-bearing-handles', action: 'inspect' }), 'Steering-bearing and handle inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'suspension', action: 'inspect' }), 'Suspension inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-oil', action: 'replace' }), 'Record engine-oil replacement');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-oil', action: 'replace' }, true), 'Record previous engine-oil replacement');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-oil', action: 'condition_check' }), 'Record oil-level check');
    assert.equal(naturalRecordActionLabel({ componentId: 'air-cleaner-element', action: 'inspect' }), 'Record air-filter inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'brake-pads', action: 'replace' }), 'Record brake-pad replacement');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-fasteners', action: 'inspect' }), 'Record engine fastener inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'general-fasteners', action: 'inspect' }), 'Record general fastener inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'shock-absorbers', action: 'inspect' }), 'Record shock absorber inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'steering-bearing-handles', action: 'inspect' }), 'Record steering-bearing and handle inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'suspension', action: 'inspect' }), 'Record suspension inspection');
  });

  it('assigns each action to the correct user-facing section', () => {
    const profile = profileWithRules(
      'engine-oil.replace.recurring-1000km',
      'air-cleaner-element.inspect.recurring-1000km-1mo',
      'brake-pads.replace.at-wear-limit',
      'brake-fluid.inspect.manual',
      'engine-oil.replace.initial-300'
    );
    const tasks = project(profile);
    assert.equal(maintenanceSectionForTask(tasks.find((task) => task.ruleId === 'engine-oil.replace.recurring-1000km')!).key, 'scheduled-maintenance');
    assert.equal(maintenanceSectionForTask(tasks.find((task) => task.componentId === 'air-cleaner-element')!).key, 'scheduled-maintenance');
    assert.equal(maintenanceSectionForTask(tasks.find((task) => task.componentId === 'brake-pads')!).key, 'wear-and-condition');
    assert.equal(maintenanceSectionForTask(tasks.find((task) => task.componentId === 'brake-fluid')!).key, 'wear-and-condition');
    assert.equal(maintenanceSectionForTask(tasks.find((task) => task.isOneTime)!).key, 'scheduled-maintenance');
  });

  it('keeps the air-cleaner element and air-cleaner system as separately named components', () => {
    const profile = profileWithRules(
      'air-cleaner-element.inspect.recurring-1000km-1mo',
      'air-cleaner-element.clean.if-needed',
      'air-cleaner-element.replace.if-necessary',
      'air-cleaner-system.inspect.initial-300'
    );
    const views = buildMaintenancePresentation(project(profile));
    assert.equal(views.length, 2);
    const element = views.find((view) => view.key === 'air-cleaner-element');
    const system = views.find((view) => view.key === 'air-cleaner-system');
    assert.ok(element);
    assert.ok(system);
    assert.equal(element.label, 'Air cleaner element');
    assert.deepEqual(new Set(element.actions.map((action) => action.label)), new Set([
      'Air-filter inspection',
      'Air-filter cleaning',
      'Air-filter replacement',
    ]));
    assert.equal(system.label, 'Air cleaner system');
    assert.deepEqual(system.actions.map((action) => action.label), ['Initial air cleaner system inspection']);
    assert.ok(views.every((view) => view.actions.every((action) => action.section.key === 'scheduled-maintenance')));
    assert.ok(views.every((view) => view.additionalSections.length === 0));
    assert.ok(views.every((view) => view.actions.every((action) => action.technicianGuidance === 'Workshop inspection recommended')));
  });

  it('keeps low-level technical checks as separately named components', () => {
    const profile = profileWithRules(
      'carburetor-idle-speed.inspect.recurring-6000km-6mo',
      'fuel-lines.inspect.recurring-3000km-3mo'
    );
    const views = buildMaintenancePresentation(project(profile));
    assert.equal(views.length, 2);
    assert.deepEqual(new Set(views.map((view) => view.key)), new Set(['carburetor-idle-speed', 'fuel-lines']));
    assert.deepEqual(new Set(views.map((view) => view.label)), new Set(['Carburetor idle speed', 'Fuel-tank switch and lines']));
  });

  it('does not merge separately scheduled fastener components', () => {
    const profile = profileWithRules(
      'engine-fasteners.inspect.recurring-3000km-3mo',
      'general-fasteners.inspect.recurring-1000km-1mo'
    );
    const views = buildMaintenancePresentation(project(profile));
    assert.equal(views.length, 2);
    assert.deepEqual(new Set(views.map((view) => view.key)), new Set(['engine-fasteners', 'general-fasteners']));
  });

  it('shows override badges only for vehicle-specific settings', () => {
    const task = project(profileWithRules('engine-oil.replace.recurring-1000km'))[0];
    assert.equal(maintenanceOverrideBadge(task), null);
    assert.equal(maintenanceOverrideBadge({ ...task, intervalSource: 'user_custom' }), 'Custom');
    assert.equal(maintenanceOverrideBadge({ ...task, intervalSource: 'user_custom', reminderDisabled: true }), 'Reminder disabled');
    assert.equal(maintenanceOverrideBadge({
      ...task,
      conditionBasedDefault: true,
      customConditionReminderEnabled: true,
      intervalSource: 'user_custom',
    }), 'User-created reminder');
  });

  it('retires a past one-time milestone before presentation', () => {
    const profile = profileWithRules('engine-oil.replace.initial-300');
    const task = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [],
      defaultHistoryKnowledge: 'unknown',
    });
    assert.deepEqual(task, []);
  });

  it('gives every component exactly one deterministic top-level home', () => {
    const tasks = project(NEW_SYMPHONY_ST_200_PROFILE);
    const views = buildMaintenancePresentation(tasks);
    const uniqueGroupKeys = new Set(tasks.map((task) => maintenanceComponentGroup(task.componentId).key));

    assert.equal(views.length, uniqueGroupKeys.size);
    assert.equal(new Set(views.map((view) => view.key)).size, views.length);
    assert.ok(views.every((view) => view.additionalSections.length === 0));
    assert.ok(views.every((view) => view.actions.every((action) => action.section.key === view.section.key)));

    for (const componentId of new Set(tasks.map((task) => task.componentId))) {
      assert.equal(maintenanceComponentGroup(componentId).key, componentId);
    }
    assert.equal(maintenanceComponentGroup('general-workshop-inspection').key, 'general-workshop-inspection');
    assert.equal(maintenanceComponentGroup('brake-system').section.key, 'wear-and-condition');
  });

  it('gives every known catalogue component its own exact presentation identity', () => {
    for (const component of UNIVERSAL_MAINTENANCE_CATALOGUE.components) {
      const presentation = maintenanceComponentGroup(component.id);
      assert.equal(presentation.key, component.id);
      assert.notEqual(presentation.label, `[${component.id}]`, component.id);
    }
  });

  it('names every Arabic profile component and action without a generic maintenance label', () => {
    setActiveLocale('ar-EG');
    try {
      for (const component of UNIVERSAL_MAINTENANCE_CATALOGUE.components) {
        const presentation = maintenanceComponentGroup(component.id);
        assert.match(presentation.label, /[\u0600-\u06ff]/, component.id);
        assert.doesNotMatch(presentation.label, /صيانة (?:أخرى|تانية)|فحص عام في الورشة/, component.id);
      }
      for (const rule of NEW_SYMPHONY_ST_200_PROFILE.rules) {
        const label = naturalMaintenanceActionLabel(rule);
        assert.match(label, /[\u0600-\u06ff]/, rule.id);
        assert.doesNotMatch(label, /صيانة (?:أخرى|تانية)|فحص عام في الورشة|\[[^\]]+\]/, rule.id);
      }
    } finally {
      setActiveLocale('en');
    }
  });

  it('keeps every named child action inside its component and avoids a fixed air-filter replacement countdown', () => {
    const tasks = project(NEW_SYMPHONY_ST_200_PROFILE);
    const rules = new Map(tasks.map((task) => [task.ruleId, task]));
    const expectedChildren = [
      ['engine-oil.condition-check.recurring-500km', 'engine-oil'],
      ['transmission.inspect-leakage.recurring-1000km-1mo', 'transmission'],
      ['air-cleaner-element.inspect.recurring-1000km-1mo', 'air-cleaner-element'],
      ['air-cleaner-element.clean.if-needed', 'air-cleaner-element'],
      ['air-cleaner-element.replace.if-necessary', 'air-cleaner-element'],
      ['brake-pads.inspect.recurring-1000km-1mo', 'brake-pads'],
      ['brake-pads.replace.at-wear-limit', 'brake-pads'],
      ['tires.inspect.recurring-1000km-1mo', 'tires'],
      ['tires.replace.at-wear-or-damage', 'tires'],
      ['drive-belt-rollers.inspect.recurring-6000km-6mo', 'drive-belt-rollers'],
      ['drive-belt-rollers.replace.recurring-12000km-12mo', 'drive-belt-rollers'],
      ['clutch-disk.inspect.recurring-6000km-6mo', 'clutch-disk'],
    ] as const;
    for (const [ruleId, groupKey] of expectedChildren) {
      const task = rules.get(ruleId);
      assert.ok(task, ruleId);
      assert.equal(maintenanceComponentGroup(task.componentId).key, groupKey, ruleId);
    }
    assert.equal(rules.has('air-cleaner-element.replace.paper-recurring-6000km-6mo'), false);
    const airTasks = tasks.filter((task) => task.componentId === 'air-cleaner-element');
    assert.equal(maintenanceGroupSummary(airTasks), 'Inspection every 1,000 km · replace when needed');
  });
});

describe('production-safe maintenance presentation', () => {
  it('orders safety-critical condition findings ahead of confirmed overdue work', () => {
    const profile = profileWithRules(
      'engine-oil.replace.recurring-1000km',
      'brake-pads.inspect.recurring-1000km-1mo',
      'brake-pads.replace.at-wear-limit'
    );
    const finding = event(profile.rules[1], {
      id: 'brake-finding',
      odometerKm: 1000,
      inspectionResult: 'replace_now',
    });
    const tasks = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 2000,
      now: NOW,
      events: [finding],
      defaultHistoryKnowledge: 'known_no_prior_completion',
    });
    const views = buildMaintenancePresentation(tasks);
    assert.equal(views[0].key, 'brake-pads');
    assert.equal(views[0].actions[0].statusLabel, 'Replace now');
    assert.equal(views.find((view) => view.key === 'engine-oil')?.actions[0].statusLabel, 'Overdue');
  });

  it('does not expose audit evidence or internal scheduling identity', () => {
    const profile = profileWithRules(
      'engine-oil.replace.recurring-1000km',
      'air-cleaner-element.inspect.recurring-1000km-1mo',
      'brake-pads.replace.at-wear-limit',
      'brake-fluid.inspect.manual'
    );
    const tasks = project(profile);
    const json = JSON.stringify(buildMaintenancePresentation(tasks));

    for (const task of tasks) {
      assert.equal(json.includes(task.ruleId), false, `leaked rule id ${task.ruleId}`);
      assert.equal(json.includes(task.scheduleType), false, `leaked schedule enum ${task.scheduleType}`);
      assert.equal(json.includes(task.status), false, `leaked status enum ${task.status}`);
      for (const value of Object.values(task.source)) {
        if (typeof value === 'string' && value.length > 4) {
          assert.equal(json.includes(value), false, `leaked source value ${value}`);
        }
      }
    }
    assert.doesNotMatch(json, /manualId|filename|\.pdf|profileVersion|ruleId|confidence|sourceType|tableRow|originalText/i);
  });
});
