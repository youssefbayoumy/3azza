import type { DocumentItem } from '../types/database.types';
import { isExpired, isExpiringSoon } from './dates';
import type { MaintenanceTaskProjection } from '../maintenance/types';
import { maintenanceComponentGroup } from '../maintenance/presentation';
import { t, tp } from '../i18n/core';

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

export function buildDomainMaintenanceReminderPlan(
  tasks: MaintenanceTaskProjection[],
  documents: DocumentItem[],
  now = new Date(),
  additionalDuePackages = 0
): DailyReminderPlanItem[] {
  const dueCount = new Set(tasks
    .filter((task) => ['overdue', 'due', 'due_soon', 'condition_attention'].includes(task.status))
    .map((task) => maintenanceComponentGroup(task.componentId).key)).size + additionalDuePackages;
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
      title: tp('notifications.maintenanceTitle', dueCount),
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
