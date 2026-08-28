export type PredictiveProfile = {
  current_mileage: number;
  daily_average_km?: number | null;
  last_odometer_update_timestamp?: string | null;
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
