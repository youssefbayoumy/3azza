import { parseIsoDate } from './dates';
import { formatNumber, t } from '../i18n/core';

export type MaintenanceDueResult = {
  dueAtKm: number | null;
  dueOn: string | null;
  dueBy: 'distance' | 'time' | 'both' | 'manual' | 'unknown';
  isDue: boolean;
  reason: string;
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const endOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, endOfTargetMonth));
  return result;
}

export function getMaintenanceDueResult(input: {
  currentMileage: number;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastServiceMileage: number;
  hasKnownMileageBaseline: boolean;
  lastServiceDate: string | null;
  now?: Date;
}): MaintenanceDueResult {
  const now = input.now ?? new Date();
  const dueAtKm = input.intervalKm !== null && input.hasKnownMileageBaseline
    ? input.lastServiceMileage + input.intervalKm
    : null;
  const parsedDate = input.lastServiceDate ? parseIsoDate(input.lastServiceDate) : null;
  const dueDate = parsedDate && input.intervalMonths !== null
    ? addMonths(parsedDate, input.intervalMonths)
    : null;
  const dueOn = dueDate ? dueDate.toISOString().slice(0, 10) : null;
  const distanceDue = dueAtKm !== null && input.currentMileage >= dueAtKm;
  const timeDue = dueDate !== null && now >= dueDate;

  if (input.intervalKm === null && input.intervalMonths === null) {
    return { dueAtKm: null, dueOn: null, dueBy: 'manual', isDue: false, reason: t('due.manual') };
  }
  if (dueAtKm === null && dueDate === null) {
    return { dueAtKm, dueOn, dueBy: 'unknown', isDue: false, reason: t('due.history') };
  }
  if (distanceDue && timeDue) {
    return { dueAtKm, dueOn, dueBy: 'both', isDue: true, reason: t('due.both', { km: formatNumber(dueAtKm ?? 0), date: dueOn ?? '' }) };
  }
  if (distanceDue) return { dueAtKm, dueOn, dueBy: 'distance', isDue: true, reason: t('due.distance', { km: formatNumber(dueAtKm ?? 0) }) };
  if (timeDue) return { dueAtKm, dueOn, dueBy: 'time', isDue: true, reason: t('due.time', { date: dueOn ?? '' }) };
  if (dueAtKm !== null && dueOn !== null) {
    return { dueAtKm, dueOn, dueBy: 'both', isDue: false, reason: t('due.first', { km: formatNumber(dueAtKm), date: dueOn }) };
  }
  if (dueAtKm !== null) return { dueAtKm, dueOn, dueBy: 'distance', isDue: false, reason: t('due.nextDistance', { km: formatNumber(dueAtKm) }) };
  return { dueAtKm, dueOn, dueBy: 'time', isDue: false, reason: t('due.nextTime', { date: dueOn ?? '' }) };
}
