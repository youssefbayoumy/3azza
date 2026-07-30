import type { DocumentItem, ServiceInterval, VehicleProfile } from '../types/database.types';
import { isExpired, isExpiringSoon } from './dates';
import { computePredictedOdometer, countServiceWarnings } from './maintenance';

export const MAINTENANCE_REMINDER_IDS = {
  preRide: '3azza-pre-ride-daily',
  service: '3azza-service-due-daily',
  documents: '3azza-documents-expiring-daily',
} as const;

export type DailyReminderPlanItem = {
  identifier: string;
  title: string;
  body: string;
  route: 'PreRideCheck' | 'Vitals' | 'Vault';
  hour: number;
  minute: number;
};

export function buildMaintenanceReminderPlan(
  profile: VehicleProfile | null,
  intervals: ServiceInterval[],
  documents: DocumentItem[],
  now = new Date()
): DailyReminderPlanItem[] {
  const currentMileage = computePredictedOdometer(profile, now.getTime()).mileage;
  const dueCount = countServiceWarnings(intervals, currentMileage);
  const documentAttentionCount = documents.filter(
    (document) => isExpired(document.expiry_date, now) || isExpiringSoon(document.expiry_date, 30, now)
  ).length;

  const plan: DailyReminderPlanItem[] = [
    {
      identifier: MAINTENANCE_REMINDER_IDS.preRide,
      title: 'Pre-ride check',
      body: 'Run brakes, tires, lights, and oil checks before the next trip.',
      route: 'PreRideCheck',
      hour: 8,
      minute: 0,
    },
  ];

  if (dueCount > 0) {
    plan.push({
      identifier: MAINTENANCE_REMINDER_IDS.service,
      title: `${dueCount} service ${dueCount === 1 ? 'item needs' : 'items need'} attention`,
      body: 'Open the service planner and log completed work when it is done.',
      route: 'Vitals',
      hour: 18,
      minute: 0,
    });
  }

  if (documentAttentionCount > 0) {
    plan.push({
      identifier: MAINTENANCE_REMINDER_IDS.documents,
      title: `${documentAttentionCount} ${documentAttentionCount === 1 ? 'document needs' : 'documents need'} attention`,
      body: 'Review expiry dates in your local document records.',
      route: 'Vault',
      hour: 19,
      minute: 30,
    });
  }

  return plan;
}
