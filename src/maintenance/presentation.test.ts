import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NEW_SYMPHONY_ST_200_PROFILE } from './profiles';
import {
  buildMaintenancePresentation,
  canCustomizeMaintenanceTask,
  maintenanceComponentGroup,
  maintenanceGroupSummary,
  maintenanceOverrideBadge,
  maintenanceSectionForTask,
  naturalMaintenanceActionLabel,
  naturalRecordActionLabel,
} from './presentation';
import { projectMaintenanceTasks } from './scheduler';
import type { MaintenanceEvent, MaintenanceRule, ScooterMaintenanceProfile } from './types';

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
    assert.equal(maintenanceComponentGroup('air-cleaner-element').key, 'air-filter');
    assert.equal(maintenanceComponentGroup('air-cleaner-system').key, 'air-filter');
    assert.equal(maintenanceComponentGroup('transmission-oil').key, 'gear-oil');
    assert.equal(maintenanceComponentGroup('steering-bearing-handles').key, 'steering');
    assert.equal(maintenanceComponentGroup('shock-absorbers').key, 'suspension');
    assert.equal(maintenanceComponentGroup('suspension').key, 'suspension');
    assert.equal(maintenanceComponentGroup('general-fasteners').key, 'nuts-and-bolts');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'engine-oil', action: 'replace' }), 'Engine-oil replacement');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'transmission-oil', action: 'replace' }), 'Gear-oil replacement');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'brake-pads', action: 'inspect' }), 'Brake inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'engine-fasteners', action: 'inspect' }), 'Engine fastener inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'general-fasteners', action: 'inspect' }), 'General fastener inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'shock-absorbers', action: 'inspect' }), 'Shock absorber inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'steering-bearing-handles', action: 'inspect' }), 'Steering inspection');
    assert.equal(naturalMaintenanceActionLabel({ componentId: 'suspension', action: 'inspect' }), 'Suspension inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-oil', action: 'replace' }), 'Record engine-oil replacement');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-oil', action: 'replace' }, true), 'Record previous engine-oil replacement');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-oil', action: 'condition_check' }), 'Record oil-level check');
    assert.equal(naturalRecordActionLabel({ componentId: 'air-cleaner-element', action: 'inspect' }), 'Record air-filter inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'brake-pads', action: 'replace' }), 'Record brake-pad replacement');
    assert.equal(naturalRecordActionLabel({ componentId: 'engine-fasteners', action: 'inspect' }), 'Record engine fastener inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'general-fasteners', action: 'inspect' }), 'Record general fastener inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'shock-absorbers', action: 'inspect' }), 'Record shock absorber inspection');
    assert.equal(naturalRecordActionLabel({ componentId: 'steering-bearing-handles', action: 'inspect' }), 'Record steering inspection');
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

  it('groups related air-filter actions in one scheduled-maintenance home', () => {
    const profile = profileWithRules(
      'air-cleaner-element.inspect.recurring-1000km-1mo',
      'air-cleaner-element.clean.if-needed',
      'air-cleaner-element.replace.if-necessary',
      'air-cleaner-system.inspect.initial-300'
    );
    const views = buildMaintenancePresentation(project(profile));
    assert.equal(views.length, 1);
    assert.equal(views[0].key, 'air-filter');
    assert.equal(views[0].label, 'Air filter');
    assert.deepEqual(new Set(views[0].actions.map((action) => action.label)), new Set([
      'Air-filter inspection',
      'Air-filter cleaning',
      'Air-filter replacement',
      'Initial air-filter inspection',
    ]));
    assert.ok(views[0].actions.every((action) => action.section.key === 'scheduled-maintenance'));
    assert.equal(views[0].additionalSections.length, 0);
    assert.ok(views[0].actions.every((action) => action.technicianGuidance === 'Workshop inspection recommended'));
  });

  it('collapses low-level technical checks into one workshop component', () => {
    const profile = profileWithRules(
      'carburetor-idle-speed.inspect.recurring-6000km-6mo',
      'fuel-lines.inspect.recurring-3000km-3mo'
    );
    const views = buildMaintenancePresentation(project(profile));
    assert.equal(views.length, 1);
    assert.equal(views[0].key, 'general-workshop-inspection');
    assert.equal(views[0].label, 'General workshop inspection');
    assert.equal(views[0].actions.length, 2);
  });

  it('does not present one child interval as a shared schedule when grouped actions differ', () => {
    const profile = profileWithRules(
      'engine-fasteners.inspect.recurring-3000km-3mo',
      'general-fasteners.inspect.recurring-1000km-1mo'
    );
    const summary = maintenanceGroupSummary(project(profile));
    assert.match(summary, /^Multiple schedules/);
    assert.doesNotMatch(summary, /^Every 1,000 km/);
    assert.doesNotMatch(summary, /^Every 3,000 km/);
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

  it('does not allow a historical one-time milestone to expose customization', () => {
    const profile = profileWithRules('engine-oil.replace.initial-300');
    const task = projectMaintenanceTasks({
      profile,
      vehicleId: 1,
      currentOdometerKm: 18080,
      now: NOW,
      events: [],
      defaultHistoryKnowledge: 'unknown',
    })[0];
    assert.equal(task.status, 'historical_unverified');
    assert.equal(canCustomizeMaintenanceTask(task), false);
  });

  it('gives every component exactly one deterministic top-level home', () => {
    const tasks = project(NEW_SYMPHONY_ST_200_PROFILE);
    const views = buildMaintenancePresentation(tasks);
    const uniqueGroupKeys = new Set(tasks.map((task) => maintenanceComponentGroup(task.componentId).key));

    assert.equal(views.length, uniqueGroupKeys.size);
    assert.equal(new Set(views.map((view) => view.key)).size, views.length);
    assert.ok(views.every((view) => view.additionalSections.length === 0));
    assert.ok(views.every((view) => view.actions.every((action) => action.section.key === view.section.key)));

    const expectedHomes = [
      ['engine-oil', 'engine-oil', 'scheduled-maintenance'],
      ['oil-filter-screen', 'engine-oil', 'scheduled-maintenance'],
      ['transmission-oil', 'gear-oil', 'scheduled-maintenance'],
      ['transmission', 'gear-oil', 'scheduled-maintenance'],
      ['air-cleaner-element', 'air-filter', 'scheduled-maintenance'],
      ['spark-plug', 'spark-plug', 'scheduled-maintenance'],
      ['drive-belt-rollers', 'cvt', 'scheduled-maintenance'],
      ['clutch-disk', 'cvt', 'scheduled-maintenance'],
      ['brake-pads', 'brakes', 'wear-and-condition'],
      ['brake-fluid', 'brakes', 'wear-and-condition'],
      ['tires', 'tires', 'wear-and-condition'],
      ['battery', 'battery', 'wear-and-condition'],
      ['steering-bearing-handles', 'steering', 'general-checks'],
      ['shock-absorbers', 'suspension', 'general-checks'],
      ['suspension', 'suspension', 'general-checks'],
      ['engine-fasteners', 'nuts-and-bolts', 'general-checks'],
      ['general-fasteners', 'nuts-and-bolts', 'general-checks'],
      ['fuel-lines', 'general-workshop-inspection', 'general-checks'],
    ] as const;
    for (const [componentId, groupKey, sectionKey] of expectedHomes) {
      const home = maintenanceComponentGroup(componentId);
      assert.equal(home.key, groupKey, componentId);
      assert.equal(home.section.key, sectionKey, componentId);
    }
  });

  it('keeps every named child action inside its component and avoids a fixed air-filter replacement countdown', () => {
    const tasks = project(NEW_SYMPHONY_ST_200_PROFILE);
    const rules = new Map(tasks.map((task) => [task.ruleId, task]));
    const expectedChildren = [
      ['engine-oil.condition-check.recurring-500km', 'engine-oil'],
      ['transmission.inspect-leakage.recurring-1000km-1mo', 'gear-oil'],
      ['air-cleaner-element.inspect.recurring-1000km-1mo', 'air-filter'],
      ['air-cleaner-element.clean.if-needed', 'air-filter'],
      ['air-cleaner-element.replace.if-necessary', 'air-filter'],
      ['brake-pads.inspect.recurring-1000km-1mo', 'brakes'],
      ['brake-pads.replace.at-wear-limit', 'brakes'],
      ['tires.inspect.recurring-1000km-1mo', 'tires'],
      ['tires.replace.at-wear-or-damage', 'tires'],
      ['drive-belt-rollers.inspect.recurring-6000km-6mo', 'cvt'],
      ['drive-belt-rollers.replace.recurring-12000km-12mo', 'cvt'],
      ['clutch-disk.inspect.recurring-6000km-6mo', 'cvt'],
    ] as const;
    for (const [ruleId, groupKey] of expectedChildren) {
      const task = rules.get(ruleId);
      assert.ok(task, ruleId);
      assert.equal(maintenanceComponentGroup(task.componentId).key, groupKey, ruleId);
    }
    assert.equal(rules.has('air-cleaner-element.replace.paper-recurring-6000km-6mo'), false);
    const airTasks = tasks.filter((task) => maintenanceComponentGroup(task.componentId).key === 'air-filter');
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
    assert.equal(views[0].key, 'brakes');
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
