import type { OdometerEvent } from '../types/database.types';
import type { MaintenanceRecordTransactionExecutor } from './maintenanceRecordTransactions';

export type CorrectOdometerReadingInput = {
  correctedMileageKm: number;
  reason: string;
};

type VehicleOdometerRow = {
  current_mileage: number;
};

/**
 * Returns the highest persisted odometer baseline without considering the
 * vehicle's current reading. This is the absolute floor for a correction.
 */
export async function getOdometerCorrectionFloorInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number
): Promise<number> {
  const row = await transaction.getFirstAsync<{ minimum: number | null }>(
    `SELECT MAX(value) AS minimum
     FROM (
       SELECT mileage AS value FROM service_logs
         WHERE vehicle_id = ? AND sets_odometer_baseline = 1
       UNION ALL
       SELECT odometer_km AS value FROM gas_logs
         WHERE vehicle_id = ? AND odometer_km >= 0
       UNION ALL
       SELECT last_service_odometer_km AS value FROM service_intervals
         WHERE vehicle_id = ? AND has_known_odometer_baseline = 1
     )`,
    [vehicleId, vehicleId, vehicleId]
  );
  return row?.minimum ?? 0;
}

function validateCorrectionInput(input: CorrectOdometerReadingInput): string {
  if (!Number.isSafeInteger(input.correctedMileageKm) || input.correctedMileageKm < 0) {
    throw new Error('Corrected odometer must be a non-negative whole number.');
  }
  const reason = input.reason.trim();
  if (!reason) throw new Error('An odometer correction reason is required.');
  return reason;
}

/**
 * Performs a guarded correction inside the caller's write transaction. The
 * database trigger consumes the short-lived authorization and writes the audit
 * event as part of the same UPDATE statement.
 */
export async function correctOdometerReadingInTransaction(
  transaction: MaintenanceRecordTransactionExecutor,
  vehicleId: number,
  input: CorrectOdometerReadingInput,
  timestamp: string
): Promise<OdometerEvent> {
  if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) {
    throw new Error('Vehicle does not exist.');
  }
  const reason = validateCorrectionInput(input);
  const vehicle = await transaction.getFirstAsync<VehicleOdometerRow>(
    'SELECT current_mileage FROM vehicle_profile WHERE id = ?',
    [vehicleId]
  );
  if (!vehicle) throw new Error('Vehicle does not exist.');
  if (input.correctedMileageKm >= vehicle.current_mileage) {
    throw new Error('A correction must be lower than the current odometer reading.');
  }

  const floor = await getOdometerCorrectionFloorInTransaction(transaction, vehicleId);
  if (input.correctedMileageKm < floor) {
    throw new Error(`Corrected odometer cannot be below the confirmed ${floor.toLocaleString()} km baseline.`);
  }

  await transaction.runAsync(
    `INSERT INTO odometer_correction_authorizations (
       vehicle_id, previous_effective_km, new_effective_km, reason, authorized_at
     ) VALUES (?, ?, ?, ?, ?)`,
    [vehicleId, vehicle.current_mileage, input.correctedMileageKm, reason, timestamp]
  );
  const update = await transaction.runAsync(
    `UPDATE vehicle_profile
     SET current_mileage = ?, last_odometer_update_timestamp = ?
     WHERE id = ? AND current_mileage = ?`,
    [input.correctedMileageKm, timestamp, vehicleId, vehicle.current_mileage]
  );
  if (update.changes !== 1) {
    throw new Error('The odometer changed before the correction could be saved.');
  }

  const audit = await transaction.getFirstAsync<OdometerEvent>(
    `SELECT * FROM odometer_events
     WHERE vehicle_id = ? AND event_type = 'correction'
       AND previous_effective_km = ? AND new_effective_km = ? AND recorded_at = ?
     ORDER BY id DESC LIMIT 1`,
    [vehicleId, vehicle.current_mileage, input.correctedMileageKm, timestamp]
  );
  if (!audit) throw new Error('The odometer correction audit event was not created.');
  return audit;
}
