import type { GasLog } from '../types/database.types';
import { parseIsoDate } from './dates';

export type FuelEfficiencySample = {
  fromLogId: number;
  toLogId: number;
  distanceKm: number;
  liters: number;
  kmPerLiter: number;
};

export type FuelSummary = {
  samples: FuelEfficiencySample[];
  averageKmPerLiter: number | null;
  latestKmPerLiter: number | null;
  estimatedRangeKm: number | null;
};

function compareFuelLogs(left: GasLog, right: GasLog): number {
  const dateComparison = left.logged_on.localeCompare(right.logged_on);
  if (dateComparison !== 0) return dateComparison;

  const odometerComparison = left.odometer_km - right.odometer_km;
  if (odometerComparison !== 0) return odometerComparison;

  return left.id - right.id;
}

/**
 * Calculates consumption only across complete full-tank segments. Partial fills
 * between the two full fills are included in the fuel consumed for that segment.
 */
export function calculateFuelSummary(
  logs: GasLog[],
  tankCapacityLiters: number | null
): FuelSummary {
  const ordered = [...logs]
    .filter((log) => parseIsoDate(log.logged_on) !== null)
    .sort(compareFuelLogs);
  const samples: FuelEfficiencySample[] = [];

  let segmentStart: GasLog | null = null;
  let segmentLiters = 0;

  for (const log of ordered) {
    if (log.is_full_tank !== 1) {
      if (segmentStart) segmentLiters += log.liters;
      continue;
    }

    if (!segmentStart) {
      segmentStart = log;
      segmentLiters = 0;
      continue;
    }

    segmentLiters += log.liters;
    const distanceKm = log.odometer_km - segmentStart.odometer_km;
    if (distanceKm > 0 && segmentLiters > 0) {
      samples.push({
        fromLogId: segmentStart.id,
        toLogId: log.id,
        distanceKm,
        liters: segmentLiters,
        kmPerLiter: distanceKm / segmentLiters,
      });
    }

    segmentStart = log;
    segmentLiters = 0;
  }

  const totalDistance = samples.reduce((sum, sample) => sum + sample.distanceKm, 0);
  const totalLiters = samples.reduce((sum, sample) => sum + sample.liters, 0);
  const averageKmPerLiter = totalDistance > 0 && totalLiters > 0 ? totalDistance / totalLiters : null;
  const latestKmPerLiter = samples.length > 0 ? samples[samples.length - 1].kmPerLiter : null;
  const estimatedRangeKm = averageKmPerLiter !== null && tankCapacityLiters !== null && tankCapacityLiters > 0
    ? averageKmPerLiter * tankCapacityLiters
    : null;

  return { samples, averageKmPerLiter, latestKmPerLiter, estimatedRangeKm };
}

export function validateTankCapacityLiters(value: number | null): string | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) return 'Tank capacity must be a positive number of liters.';
  return null;
}

export function validateFuelLogFields(log: Pick<GasLog, 'liters' | 'cost' | 'odometer_km' | 'logged_on' | 'is_full_tank'>): string | null {
  if (!Number.isFinite(log.liters) || log.liters <= 0) return 'Fuel amount must be a positive number.';
  if (!Number.isFinite(log.cost) || log.cost < 0) return 'Fuel cost must be a non-negative number.';
  if (!Number.isSafeInteger(log.odometer_km) || log.odometer_km < 0) return 'Odometer must be a non-negative whole number.';
  if (parseIsoDate(log.logged_on) === null) return 'Fuel date must be a valid calendar date.';
  if (log.is_full_tank !== 0 && log.is_full_tank !== 1) return 'Full-tank status is invalid.';
  return null;
}
