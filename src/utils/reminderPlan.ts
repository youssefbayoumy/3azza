import type { DocumentItem, ServiceInterval, VehicleProfile } from '../types/database.types';
import { isExpired, isExpiringSoon, parseIsoDate } from './dates';
import { computePredictedOdometer, countServiceWarnings } from './maintenance';
import { getMaintenanceDueResult } from './maintenanceDue';
import type { MaintenanceTaskProjection } from '../maintenance/types';
import { maintenanceComponentGroup } from '../maintenance/presentation';
import { t } from '../i18n/core';

export const MAINTENANCE_REMINDER_IDS = {
  preRide: '3azza-pre-ride-daily',
  service: '3azza-service-due-daily',
  documents: '3azza-documents-expiring-daily',
} as const;

export type DailyReminderPlanItem = {
  identifier: string;
  title: string;
  body: string;
  route: 'PreRideCheck' | 'Maintenance' | 'Vault';
  hour: number;
  minute: number;
};

const TIME_DUE_SOON_DAYS = 30;

export function countMaintenanceAttention(
  intervals: ServiceInterval[],
  currentMileage: number,
  now: Date
): number {
  const distanceWarnings = new Set(
    intervals
      .filter((interval) => countServiceWarnings([interval], currentMileage) === 1)
      .map((interval) => interval.id)
  );
  const timeAttentionCutoff = new Date(now);
  timeAttentionCutoff.setDate(timeAttentionCutoff.getDate() + TIME_DUE_SOON_DAYS);

  return intervals.reduce((count, interval) => {
    if (distanceWarnings.has(interval.id)) return count + 1;
    const due = getMaintenanceDueResult({
      currentMileage,
      intervalKm: interval.interval_km,
      intervalMonths: interval.recommended_interval_months ?? null,
      lastServiceMileage: interval.last_service_odometer_km,
      hasKnownMileageBaseline: interval.has_known_odometer_baseline === 1,
      lastServiceDate: interval.last_service_date ?? null,
      now,
    });
    const dueDate = due.dueOn ? parseIsoDate(due.dueOn) : null;
    return dueDate && dueDate <= timeAttentionCutoff ? count + 1 : count;
  }, 0);
}

export function buildMaintenanceReminderPlan(
  profile: VehicleProfile | null,
  intervals: ServiceInterval[],
  documents: DocumentItem[],
  now = new Date()
): DailyReminderPlanItem[] {
  const currentMileage = computePredictedOdometer(profile, now.getTime()).mileage;
  const dueCount = countMaintenanceAttention(intervals, currentMileage, now);
  const documentAttentionCount = documents.filter(
    (document) => isExpired(document.expiry_date, now) || isExpiringSoon(document.expiry_date, 30, now)
  ).length;

  const plan: DailyReminderPlanItem[] = [
    {
      identifier: MAINTENANCE_REMINDER_IDS.preRide,
      title: t('notifications.preRideTitle'),
      body: t('notifications.preRideBody'),
      route: 'PreRideCheck',
      hour: 8,
      minute: 0,
    },
  ];

  if (dueCount > 0) {
    plan.push({
      identifier: MAINTENANCE_REMINDER_IDS.service,
      title: t('notifications.serviceTitle', { count: dueCount }),
      body: t('notifications.serviceBody'),
      route: 'Maintenance',
      hour: 18,
      minute: 0,
    });
  }

  if (documentAttentionCount > 0) {
    plan.push({
      identifier: MAINTENANCE_REMINDER_IDS.documents,
      title: t('notifications.documentsTitle', { count: documentAttentionCount }),
      body: t('notifications.documentsBody'),
      route: 'Vault',
      hour: 19,
      minute: 30,
    });
  }

  return plan;
}

export function buildDomainMaintenanceReminderPlan(
  tasks: MaintenanceTaskProjection[],
  documents: DocumentItem[],
  now = new Date()
): DailyReminderPlanItem[] {
  const dueCount = new Set(tasks
    .filter((task) => ['overdue', 'due', 'due_soon', 'condition_attention'].includes(task.status))
    .map((task) => maintenanceComponentGroup(task.componentId).key)).size;
  const documentAttentionCount = documents.filter(
    (document) => isExpired(document.expiry_date, now) || isExpiringSoon(document.expiry_date, 30, now)
  ).length;
  const plan: DailyReminderPlanItem[] = [{
    identifier: MAINTENANCE_REMINDER_IDS.preRide,
    title: t('notifications.preRideTitle'),
    body: t('notifications.preRideBody'),
    route: 'PreRideCheck',
    hour: 8,
    minute: 0,
  }];
  if (dueCount > 0) {
    plan.push({
      identifier: MAINTENANCE_REMINDER_IDS.service,
      title: t('notifications.maintenanceTitle', { count: dueCount }),
      body: t('notifications.maintenanceBody'),
      route: 'Maintenance',
      hour: 18,
      minute: 0,
    });
  }
  if (documentAttentionCount > 0) {
    plan.push({
      identifier: MAINTENANCE_REMINDER_IDS.documents,
      title: t('notifications.documentsTitle', { count: documentAttentionCount }),
      body: t('notifications.documentsBody'),
      route: 'Vault',
      hour: 19,
      minute: 30,
    });
  }
  return plan;
}
