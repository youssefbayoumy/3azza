export type PredictiveProfile = {
  current_mileage: number;
  daily_average_km?: number | null;
  last_odometer_update_timestamp?: string | null;
};

export type IntervalLike = {
  interval_km: number | null;
  last_service_odometer_km: number;
  has_known_odometer_baseline?: number;
};

export type IntervalStatus = 'unknown' | 'manual' | 'overdue' | 'due-soon' | 'optimal';

export type NamedIntervalLike = IntervalLike & {
  name: string;
};

export type NextServiceProgress = {
  name: string;
  progressPct: number;
  remainingKm: number;
  status: Exclude<IntervalStatus, 'unknown' | 'manual'>;
};

export function computePredictedOdometer(profile: PredictiveProfile | null, nowMs = Date.now()): {
  mileage: number;
  predictedAdded: number;
  diffDays: number;
} {
  const lastConfirmedMileage = profile?.current_mileage ?? 0;
  const dailyAverage = profile?.daily_average_km ?? 0;
  const timestamp = profile?.last_odometer_update_timestamp;

  if (!timestamp || dailyAverage <= 0) {
    return { mileage: lastConfirmedMileage, predictedAdded: 0, diffDays: 0 };
  }

  const lastUpdateMs = new Date(timestamp).getTime();
  if (!Number.isFinite(lastUpdateMs)) {
    return { mileage: lastConfirmedMileage, predictedAdded: 0, diffDays: 0 };
  }

  const diffDays = Math.max(0, (nowMs - lastUpdateMs) / (1000 * 60 * 60 * 24));
  const predictedAdded = Math.floor(diffDays * dailyAverage);
  return { mileage: lastConfirmedMileage + predictedAdded, predictedAdded, diffDays };
}

export function getIntervalProgress(
  interval: IntervalLike,
  currentMileage: number,
  effectiveLastKm = interval.last_service_odometer_km
): {
  status: IntervalStatus;
  remainingKm: number | null;
  progressPct: number;
} {
  if (interval.interval_km === null) {
    return { status: 'manual', remainingKm: null, progressPct: 100 };
  }

  const hasKnownBaseline = interval.has_known_odometer_baseline === undefined
    ? effectiveLastKm > 0
    : interval.has_known_odometer_baseline === 1;
  if (!hasKnownBaseline) {
    return { status: 'unknown', remainingKm: null, progressPct: 0 };
  }

  const remainingKm = effectiveLastKm + interval.interval_km - currentMileage;
  const usedKm = interval.interval_km - remainingKm;
  const progressPct = Math.max(0, Math.min(100, (usedKm / interval.interval_km) * 100));

  if (remainingKm <= 0) {
    return { status: 'overdue', remainingKm, progressPct: 100 };
  }

  if (remainingKm <= interval.interval_km * 0.1 || remainingKm <= 200) {
    return { status: 'due-soon', remainingKm, progressPct };
  }

  return { status: 'optimal', remainingKm, progressPct };
}

export function countServiceWarnings(intervals: IntervalLike[], currentMileage: number): number {
  return intervals.reduce((count, interval) => {
    const { status } = getIntervalProgress(interval, currentMileage);
    return status === 'overdue' || status === 'due-soon' ? count + 1 : count;
  }, 0);
}

/**
 * Returns the most urgent interval with a known odometer baseline. Home uses
 * this same selector as the planner so its gauge cannot drift from the service
 * cards. Overdue work sorts before upcoming work; otherwise the nearest due
 * distance wins.
 */
export function getNextServiceProgress(
  intervals: NamedIntervalLike[],
  currentMileage: number
): NextServiceProgress | null {
  const candidates = intervals.flatMap((interval) => {
    const progress = getIntervalProgress(interval, currentMileage);
    if (
      progress.status === 'unknown'
      || progress.status === 'manual'
      || progress.remainingKm === null
    ) {
      return [];
    }

    return [{
      name: interval.name,
      progressPct: progress.progressPct,
      remainingKm: progress.remainingKm,
      status: progress.status,
    }];
  });

  return candidates.sort((left, right) => left.remainingKm - right.remainingKm)[0] ?? null;
}
