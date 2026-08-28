import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocumentItem } from '../types/database.types';
import type { MaintenanceTaskProjection, TaskStatus } from '../maintenance/types';
import { setActiveLocale } from '../i18n/localeState';
import { buildDomainMaintenanceReminderPlan, MAINTENANCE_REMINDER_IDS } from './reminderPlan';

function task(status: TaskStatus, componentId = 'engine-oil'): MaintenanceTaskProjection {
  return {
    key: `${componentId}:${status}`,
    ruleId: `${componentId}:${status}`,
    componentId,
    action: 'replace',
    label: componentId,
    scheduleType: 'recurring_distance',
    status,
    dueAtKm: null,
    dueOn: null,
    dueBy: 'unknown',
    lastPerformedAtKm: null,
    lastPerformedOn: null,
    remainingKm: null,
    remainingDays: null,
    profileRecommendedIntervalKm: 1000,
    originalIntervalMonths: null,
    effectiveIntervalKm: 1000,
    effectiveIntervalMonths: null,
    distanceEnabled: true,
    timeEnabled: false,
    conditionBasedDefault: false,
    customConditionReminderEnabled: false,
    reminderDisabled: false,
    intervalSource: 'profile_default',
    title: componentId,
    reason: componentId,
    source: {},
    safetyCritical: false,
    technicianRecommended: false,
    userInspectable: true,
    technicianLevel: 'user_checkable',
    isOneTime: false,
  };
}

function document(expiryDate: string | null): DocumentItem {
  return {
    id: 1,
    vehicle_id: 1,
    title: 'Registration',
    image_uri: 'file:///registration.jpg',
    expiry_date: expiryDate,
    added_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('domain maintenance reminder plan', () => {
  const now = new Date(2026, 6, 24, 12);

  it('always plans one pre-ride reminder with a stable identifier', () => {
    const plan = buildDomainMaintenanceReminderPlan([], [], now);
    assert.deepEqual(plan.map((item) => item.identifier), [MAINTENANCE_REMINDER_IDS.preRide]);
  });

  it('groups due actions by component and ignores unknown history', () => {
    const plan = buildDomainMaintenanceReminderPlan([
      task('due'),
      task('overdue'),
      task('unknown_history', 'transmission-oil'),
    ], [], now);
    assert.equal(
      plan.find((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service)?.title,
      '1 maintenance item needs attention'
    );
  });

  it('counts a first-service checkpoint as one package and includes expiring documents', () => {
    const plan = buildDomainMaintenanceReminderPlan([], [document('2026-08-01')], now, 1);
    assert.ok(plan.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.service));
    assert.ok(plan.some((item) => item.identifier === MAINTENANCE_REMINDER_IDS.documents));
  });

  it('builds Arabic titles and bodies without app-owned English', () => {
    setActiveLocale('ar-EG');
    try {
      const plan = buildDomainMaintenanceReminderPlan([task('due')], [document('2026-08-01')], now);
      for (const item of plan) {
        assert.match(`${item.title} ${item.body}`, /[\u0600-\u06ff]/);
        assert.doesNotMatch(`${item.title} ${item.body}`, /\b(?:check|service|document|maintenance|open|record)\b/i);
      }
    } finally {
      setActiveLocale('en');
    }
  });
});
