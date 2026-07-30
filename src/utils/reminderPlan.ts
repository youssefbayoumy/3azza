import type { DocumentItem, ServiceInterval, VehicleProfile } from '../types/database.types';
import { isExpired, isExpiringSoon, parseIsoDate } from './dates';
import { computePredictedOdometer, countServiceWarnings } from './maintenance';
import { getMaintenanceDueResult } from './maintenanceDue';

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
